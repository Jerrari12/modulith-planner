/* Geometry for the baked top-layer maps (tools/skin-map.mjs): the part's GLB read as triangles in its authored frame,
   the release STL read as triangles in its own frame, and the one proper 90-degree rotation that carries the first onto
   the second - found by measuring both, never typed in.

   WHY A MATCH AND NOT THE POSE TABLE ALONE. generate.js PLATE_POSE records which face of a part goes DOWN (the build
   axis, through buildAxisForType). It says nothing about how the STL is turned on the bed, and the vault records that
   the release STLs are a different asset set from the GLBs: 467 of 475 sit print-ready as exported, six are upside
   down (D:/MODULITH/ops/slicing/slice_batch.py, ROTATE_X_180). The slicer's lines run at 45 degrees to ITS X, so the
   map's frame has to come from the STL the slicer saw, and the GLB's frame from the GLB the stage draws. Matching the
   two meshes gives the rotation between them; the pose table then says which way is up, and the two have to agree
   (R * axis = +-Z) or the part is refused.

   HOW THE MATCH WORKS. The 24 proper rotations built from signed axis permutations are tried. Both meshes are read
   with TRIM_MM cut off each end of the candidate's vertical: the release case and extender STLs carry corner helper
   disks inside the bottom millimetre that the GLB does not model (measured 2026-10-25: the 185 1W-1H case STL spans
   96 x 193.6 where the GLB spans 88 x 185, the whole excess within 1 mm of the bed). A candidate survives when the
   trimmed extents agree on every axis (within EXTENT_TOL_MM), and among the survivors the one whose occupancy grid
   (GRID cells a side over the common bounds, the rotated GLB shifted onto the STL by its trimmed bounds) is nearest the
   STL's wins. The grid is filled from points sampled uniformly over each triangle's AREA, never from triangle centroids:
   the GLB and the STL triangulate the same flat faces along different diagonals (the cover tiles: 4,464 triangles in
   both, centroid grids 1.0 apart of a possible 2.0, surface grids 0.02), and a centroid is wherever the diagonal put it.
   A runner-up that differs from the winner only by a half turn about the build axis is harmless (the slicer's
   45-degree lines read the same under it); any other runner-up within AMBIGUOUS_RATIO of the winner's distance refuses
   the part, because a quarter turn would run the lines the wrong way.

   No three import: the GLB is decoded with the planner's own vendored meshopt decoder and read by hand (the accessor
   formula is the house one, test/lib/glb-spans.mjs: world = T + S * v / 32767 for normalized SHORTs). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DECODER = pathToFileURL(join(here, '..', '..', 'vendor', 'three', 'addons', 'libs', 'meshopt_decoder.module.js')).href;

export const EXTENT_TOL_MM = 0.6;
export const GRID = 24;
export const AMBIGUOUS_RATIO = 0.7;
export const TRIM_MM = 1.0;
export const SAMPLE_MM = 2.0;      // one surface sample per this many mm of edge, so a 185 x 88 face gives ~4,000

/* ---- GLB -> triangles in the authored (part) frame, mm ---- */

const JSON_CHUNK = 0x4E4F534A, BIN_CHUNK = 0x004E4942;
function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === BIN_CHUNK) bin = body;
    off += 8 + len;
  }
  return { json, bin };
}

/* column-major 4x4, as test/lib/glb-spans.mjs builds them */
export function mat4FromTRS(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const mul4 = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };

const CT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NORM_DIV = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

let decoderReady = null;
async function decoder() {
  if (!decoderReady) decoderReady = import(DECODER).then(async (m) => { await m.MeshoptDecoder.ready; return m.MeshoptDecoder; });
  return decoderReady;
}

/** Every triangle of every mesh under the scene, positions in mm in the part frame (node transforms applied). */
export async function readGlbTriangles(file) {
  const { json, bin } = parseGlb(readFileSync(file));
  const dec = await decoder();
  const views = new Map();
  const viewBytes = (i) => {
    if (views.has(i)) return views.get(i);
    const bv = json.bufferViews[i];
    const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
    let bytes, stride;
    if (ext) {
      const src = bin.subarray(ext.byteOffset || 0, (ext.byteOffset || 0) + ext.byteLength);
      bytes = new Uint8Array(ext.count * ext.byteStride);
      dec.decodeGltfBuffer(bytes, ext.count, ext.byteStride, src, ext.mode, ext.filter || 'NONE');
      stride = ext.byteStride;
    } else {
      bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
      stride = bv.byteStride || 0;
    }
    const out = { bytes, stride };
    views.set(i, out);
    return out;
  };
  const readAccessor = (ai) => {
    const acc = json.accessors[ai];
    const [Arr, size] = CT[acc.componentType];
    const n = NCOMP[acc.type];
    const { bytes, stride } = viewBytes(acc.bufferView);
    const step = stride || n * size;
    const out = new Float64Array(acc.count * n);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const div = acc.normalized ? NORM_DIV[acc.componentType] : 1;
    const get = { 5120: dv.getInt8.bind(dv), 5121: dv.getUint8.bind(dv), 5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true) }[acc.componentType];
    for (let i = 0; i < acc.count; i++) {
      const base = (acc.byteOffset || 0) + i * step;
      for (let k = 0; k < n; k++) out[i * n + k] = get(base + k * size) / div;
    }
    void Arr;
    return out;
  };
  const pos = [], idx = [];
  let vbase = 0;
  const walk = (ni, parent) => {
    const node = json.nodes[ni];
    const local = node.matrix ? node.matrix.slice() : mat4FromTRS(node.translation, node.rotation, node.scale);
    const m = mul4(parent, local);
    if (node.mesh != null) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if (prim.mode != null && prim.mode !== 4) throw new Error(`${file}: primitive mode ${prim.mode} is not triangles`);
        const p = readAccessor(prim.attributes.POSITION);
        const count = p.length / 3;
        for (let i = 0; i < count; i++) {
          const x = p[3 * i], y = p[3 * i + 1], z = p[3 * i + 2];
          pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        }
        if (prim.indices != null) {
          const ix = readAccessor(prim.indices);
          for (let i = 0; i < ix.length; i++) idx.push(vbase + ix[i]);
        } else {
          for (let i = 0; i < count; i++) idx.push(vbase + i);
        }
        vbase += count;
      }
    }
    for (const c of node.children || []) walk(c, m);
  };
  const I = mat4FromTRS();
  for (const ni of json.scenes[json.scene || 0].nodes) walk(ni, I);
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) };
}

/* ---- STL -> triangles ---- */
export function readStlTriangles(file) {
  const buf = readFileSync(file);
  const head = buf.subarray(0, 5).toString('ascii').toLowerCase();
  const isBinary = !(head === 'solid' && buf.subarray(0, 1024).toString('latin1').includes('facet'));
  const pos = [];
  if (isBinary) {
    const n = buf.readUInt32LE(80);
    if (84 + 50 * n !== buf.length) throw new Error(`${file}: binary STL of ${n} facets but ${buf.length} bytes`);
    for (let i = 0; i < n; i++) {
      const o = 84 + 50 * i + 12;
      for (let k = 0; k < 9; k++) pos.push(buf.readFloatLE(o + 4 * k));
    }
  } else {
    const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
    const text = buf.toString('latin1');
    let m;
    while ((m = re.exec(text))) pos.push(+m[1], +m[2], +m[3]);
  }
  const positions = Float64Array.from(pos);
  const indices = new Uint32Array(positions.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions, indices };
}

/* ---- the 24 proper rotations of the cube, as 3x3 row-major integer matrices ---- */
export const ROTATIONS = (() => {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    R[0][p[0]] = sx; R[1][p[1]] = sy; R[2][p[2]] = sz;
    const det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
    if (det === 1) out.push(R);
  }
  return out;
})();
export const rotate = (R, v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
export const matMul = (A, B) => A.map((row, i) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
export const transpose = (R) => [0, 1, 2].map((i) => [R[0][i], R[1][i], R[2][i]]);
export const sameRot = (A, B) => A.every((r, i) => r.every((v, j) => v === B[i][j]));

export function bounds(positions) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = positions[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  return { lo, hi, size: hi.map((v, k) => v - lo[k]) };
}

/** The mesh rotated by R (or as it is): positions, and per-triangle [cx, cy, cz, area] over the triangles that are
    not wholly inside TRIM_MM of the top or the bottom, with the trimmed vertex bounds. */
function rotated(tri, R) {
  const pos = new Float64Array(tri.positions.length);
  for (let i = 0; i < pos.length; i += 3) {
    const v = R ? rotate(R, [tri.positions[i], tri.positions[i + 1], tri.positions[i + 2]]) : [tri.positions[i], tri.positions[i + 1], tri.positions[i + 2]];
    pos[i] = v[0]; pos[i + 1] = v[1]; pos[i + 2] = v[2];
  }
  return pos;
}
/* the extents the match compares: x and y over the vertices ABOVE the bottom cut (the helper disks sit below it;
   the part's full width is reached by its walls' upper vertices), z over every vertex (a disk adds no height). The
   grid is filled from the triangles not wholly inside the cut at either end. Tessellation cannot move a vertex
   bound the way it moved a "wholly inside" one on a 4.4 mm back cover. */
function trimmed(positions, indices, cut) {
  const full = bounds(positions);
  const zlo = full.lo[2] + cut, zhi = full.hi[2] - cut;
  const lo = [Infinity, Infinity, full.lo[2]], hi = [-Infinity, -Infinity, full.hi[2]];
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 2] < zlo) continue;
    for (let k = 0; k < 2; k++) { const v = positions[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  }
  const tris = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const zmax = Math.max(positions[a + 2], positions[b + 2], positions[c + 2]), zmin = Math.min(positions[a + 2], positions[b + 2], positions[c + 2]);
    if (zmax < zlo || zmin > zhi) continue;
    tris.push(a, b, c);
  }
  return { tris, lo, hi, size: hi.map((v, k) => v - lo[k]), full };
}
/** points spread over each triangle's area (a lattice in barycentric coordinates, one per SAMPLE_MM of edge),
    each with the triangle's share of area: what the occupancy grid is filled from */
export function surfaceSamples(positions, tris, step = SAMPLE_MM) {
  const out = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (!(area > 0)) continue;
    const longest = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(vx - ux, vy - uy, vz - uz));
    const n = Math.max(1, Math.ceil(longest / step));
    const count = (n * (n + 1)) / 2;
    const w = area / count;
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
      const s1 = (i + 1 / 3) / n, s2 = (j + 1 / 3) / n;   // the lattice point's barycentric weights on u and v
      out.push(positions[a] + ux * s1 + vx * s2, positions[a + 1] + uy * s1 + vy * s2, positions[a + 2] + uz * s1 + vz * s2, w);
    }
  }
  return Float64Array.from(out);
}
/* each sample splat trilinearly over its eight neighbouring cells: a flat face lies on one plane, and with hard
   bins a sub-cell offset between the two meshes moved a whole face into the next cell (the cover tiles read 0.58 of a
   possible 2.0 for the same shape; splatted, 0.02) */
function grid(samples, shift, lo, size) {
  const g = new Float64Array(GRID * GRID * GRID);
  let total = 0;
  const i0 = [0, 0, 0], f = [0, 0, 0];
  for (let i = 0; i < samples.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const u = Math.min(GRID - 1, Math.max(0, (samples[i + k] + shift[k] - lo[k]) / Math.max(size[k], 1e-9) * GRID - 0.5));
      i0[k] = Math.min(GRID - 2, Math.floor(u)); f[k] = u - i0[k];
    }
    const w = samples[i + 3];
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
      const wt = (dx ? f[0] : 1 - f[0]) * (dy ? f[1] : 1 - f[1]) * (dz ? f[2] : 1 - f[2]);
      g[((i0[0] + dx) * GRID + i0[1] + dy) * GRID + i0[2] + dz] += w * wt;
    }
    total += w;
  }
  for (let i = 0; i < g.length; i++) g[i] /= total || 1;
  return g;
}

/**
 * The rotation R with R * glb ~= stl - translation. Returns { R, t, score, runnerUp, extentsStl, candidates } or
 * { error } when nothing fits or the fit is ambiguous. `axis` (the build axis in the GLB frame) decides which
 * runner-up is harmless: one that equals the winner times a half turn about the axis.
 */
export function matchRotation(glb, stl, axis) {
  const sPos = rotated(stl, null);
  const S = trimmed(sPos, stl.indices, TRIM_MM);
  const gStl = grid(surfaceSamples(sPos, S.tris), [0, 0, 0], S.lo, S.size);
  const cands = [];
  for (const R of ROTATIONS) {
    const gPos = rotated(glb, R);
    const T = trimmed(gPos, glb.indices, TRIM_MM);
    const extentDiff = Math.max(...T.size.map((v, k) => Math.abs(v - S.size[k])));
    if (extentDiff > EXTENT_TOL_MM) continue;
    const t = S.lo.map((v, k) => v - T.lo[k]);
    const g = grid(surfaceSamples(gPos, T.tris), t, S.lo, S.size);
    let d = 0;
    for (let i = 0; i < g.length; i++) d += Math.abs(g[i] - gStl[i]);
    cands.push({ R, t, score: d, extentDiff });
  }
  if (!cands.length) {
    const bGlb = bounds(glb.positions);
    return { error: `no 90-degree rotation matches the extents: GLB ${bGlb.size.map((v) => v.toFixed(2))} vs STL ${S.full.size.map((v) => v.toFixed(2))} (trimmed ${S.size.map((v) => v.toFixed(2))})` };
  }
  cands.sort((a, b) => a.score - b.score);
  const best = cands[0];
  /* a half turn about the build axis: diag(-1,-1,1) in the STL frame when the axis maps to Z */
  const halfTurn = (R) => {
    const a = rotate(R, axis);
    const H = [[-1, 0, 0], [0, -1, 0], [0, 0, -1]];
    const k = a.findIndex((v) => Math.abs(v) > 0.5);
    H[k][k] = 1;
    return matMul(H, R);
  };
  const harmless = axis ? halfTurn(best.R) : null;
  const runnerUp = cands.slice(1).find((c) => !(harmless && sameRot(c.R, harmless)));
  const ambiguous = runnerUp && runnerUp.score < best.score / AMBIGUOUS_RATIO && best.score > 0;
  return { R: best.R, t: best.t, score: best.score, extentDiff: best.extentDiff, stlBounds: S.full, runnerUp: runnerUp ? { R: runnerUp.R, score: runnerUp.score } : null,
    ambiguous: !!ambiguous, candidates: cands.length };
}
