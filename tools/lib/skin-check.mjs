/* Does a shipped skin map land where the part's GLB has its top skins? (tools/skin-map.mjs check, test/skin-map.test.mjs)

   The map is read exactly as the shader reads it: a point p on the part (mm, authored frame) has the bed-plane
   coordinates q = (p . t1, p . t2) with the tangents js/skin-map.js skinTangents derives from the build axis, its height
   h = p . axis - min(p . axis) over the part (bed-finish.js puts the bed plane at 0), and the map's texel at
   (q - q0) * pxPerMm carries the winning bead's layer height in B,A (0.01 mm; 0 = no bead). Every face of the GLB that
   looks along the axis (a top skin: the last layer, a ledge, a pocket floor) is sampled over its area, and a sample
   AGREES when its texel holds a bead within zTol of its own height. The rate over the part is the measure; the same
   measure with the map mirrored or turned is the control (a frame error moves the window, the pockets, the ledges). */
import { skinTangents } from '../../js/skin-map.js';
import { surfaceSamples } from './skin-geometry.mjs';

/** the GLB's top-facing triangles (face normal . axis > cosLimit), as an index list into positions */
export function topTriangles(glb, axis, cosLimit = 0.95) {
  const p = glb.positions, ix = glb.indices, out = [];
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 0)) continue;
    if ((nx * axis[0] + ny * axis[1] + nz * axis[2]) / len > cosLimit) out.push(a, b, c);
  }
  return out;
}

/** the map's layer height at a part point, mm, or 0 for no bead / outside; `flip` mirrors the lookup for a control */
export function mapZAt(map, frame, q, flip = [false, false]) {
  let u = (q[0] - frame.q0[0]) * frame.pxPerMm, v = (q[1] - frame.q0[1]) * frame.pxPerMm;
  if (flip[0]) u = map.width - u;
  if (flip[1]) v = map.height - v;
  const i = Math.floor(u), j = Math.floor(v);
  if (i < 0 || j < 0 || i >= map.width || j >= map.height) return 0;
  const o = (j * map.width + i) * 4;
  return (map.data[o + 2] * 256 + map.data[o + 3]) / 100;
}

/**
 * @returns {{ samples, areaMm2, hiddenMm2, agree, rate, byHeight }} rate = the agreeing share of the visible skins' area; byHeight groups the
 * area by its own height (mm, 0.1 steps) with the agreeing area per group, so a missed ledge shows as a group at 0.
 */
export function skinCoverage(glb, axis, map, frame, { zTol = 0.45, flip = [false, false], step = 1.5 } = {}) {
  const [t1, t2] = skinTangents(axis);
  let hMin = Infinity;
  for (let i = 0; i < glb.positions.length; i += 3) hMin = Math.min(hMin, glb.positions[i] * axis[0] + glb.positions[i + 1] * axis[1] + glb.positions[i + 2] * axis[2]);
  const tris = topTriangles(glb, axis);
  const s = surfaceSamples(glb.positions, tris, step);
  const qOf = (p) => [p[0] * t1[0] + p[1] * t1[1] + p[2] * t1[2], p[0] * t2[0] + p[1] * t2[1] + p[2] * t2[2]];
  const hOf = (p) => p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2] - hMin;
  /* only VISIBLE top faces are skins: the GLB models a raised band as a solid on the plate, so the plate's face runs on
     underneath it as an internal face (the EdgeLabel 2W-1H: 45 % of its 4.5 mm face lies under the 6.5 mm band). The
     highest top-facing sample in each 1 mm cell is the surface; anything a layer and a half below it is inside the part */
  const top = new Map();
  for (let i = 0; i < s.length; i += 4) {
    const q = qOf([s[i], s[i + 1], s[i + 2]]), h = hOf([s[i], s[i + 1], s[i + 2]]);
    const k = `${Math.floor(q[0])},${Math.floor(q[1])}`;
    if (!(top.get(k) >= h)) top.set(k, h);
  }
  /* every sample counts by the AREA it stands for (surfaceSamples gives a sliver as many points as a wide triangle of
     the same longest edge), so the rate is a share of the skins' area, not of the sample count */
  let agree = 0, total = 0, n = 0, hidden = 0;
  const byHeight = {};
  for (let i = 0; i < s.length; i += 4) {
    const p = [s[i], s[i + 1], s[i + 2]], w = s[i + 3];
    const q = qOf(p);
    const h = hOf(p);
    if (h < top.get(`${Math.floor(q[0])},${Math.floor(q[1])}`) - 0.3) { hidden += w; continue; }
    const z = mapZAt(map, frame, q, flip);
    const ok = z > 0 && Math.abs(z - h) <= zTol;
    const key = h.toFixed(1);
    byHeight[key] = byHeight[key] || { area: 0, agree: 0 };
    byHeight[key].area += w;
    if (ok) { agree += w; byHeight[key].agree += w; }
    total += w; n++;
  }
  return { samples: n, areaMm2: total, hiddenMm2: hidden, agree, rate: total ? agree / total : 0, byHeight };
}
