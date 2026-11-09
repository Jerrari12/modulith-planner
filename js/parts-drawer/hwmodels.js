/* THE CONTENTS PREVIEW'S DETAILED MODELS (2026-11-09, Joey: "can we improve the model quality ... these just feel way too over
   simplified, like it's lost some key characteristics of being a threaded insert"; "you have the original parts you rendered in
   blender right to create the images in the part picker?"). The hardware visual library's own CAD, the STEP files behind the
   Part Picker's renders (bd_warehouse geometry: real threads, knurls, sockets), converted by tools/hw-models.py into one small
   file per part type and thread size, img/hw/3d/<type>-<size>.bin, fetched only for a part a drawer shows.
   A nut, nyloc, washer or insert is its model as it is. A screw or set screw comes as three pieces, HEAD (with a little thread),
   one whole-pitch SEGMENT and TIP, cut where the thread is fully formed: a thread repeats exactly along its axis every pitch, so
   segments laid end to end between the head and the tip make any length with an unbroken thread. The PITCH IS KEPT (Sol 01a1c1da:
   stretching changed it): whole segments, then one segment cut short to the remainder, then the tip turned about the axis by
   hand x 2 pi x remainder / pitch (the converter measures which way the thread turns, header.screw.hand), which carries the helix
   on unbroken. Only a screw past segMax segments stretches its segments; one shorter than its head piece and tip has its shank
   squeezed into what is left past the head. A size the library has no model of is its nearest size scaled to
   the right thread diameter (header.scale; the pictures use the same stand-ins).
   Pure: no DOM, no three.js. Positions in mm, the axis +z from 0 (a screw's head top, a nut's bottom face). */
const MAGIC = 'PDHW';
export const modelUrl = (type, size) => `img/hw/3d/${type}-${String(size).toLowerCase().replace('.', '-')}.bin`;
const pad4 = (n) => (n + 3) & ~3;

// the file: b'PDHW', version, u32 header length, the JSON header, then per piece u16 x 3 quantized positions and u16|u32 indices
export function parseModel(buf) {
  const u8 = new Uint8Array(buf);
  if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== MAGIC || u8[4] !== 1) throw new Error('not a parts-drawer model file');
  const dv = new DataView(buf), hl = dv.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + hl)));
  let off = 12 + hl;
  const pieces = header.pieces.map((p) => {
    const q = new Uint16Array(buf, off, p.v * 3); off += pad4(p.v * 6);
    const ix = p.u32 ? new Uint32Array(buf, off, p.t * 3) : new Uint16Array(buf, off, p.t * 3); off += pad4(ix.byteLength);
    const positions = new Float32Array(p.v * 3);
    for (let i = 0; i < p.v; i++) for (let c = 0; c < 3; c++) positions[i * 3 + c] = p.lo[c] + (q[i * 3 + c] / 65535) * (p.hi[c] - p.lo[c]);
    return { name: p.name, mat: p.mat, positions, index: Uint32Array.from(ix) };
  });
  return { header, pieces };
}

// pieces laid into one mesh per material: each copy is (piece, z offset, z scale)
function lay(copies, scale) {
  const byMat = new Map();
  for (const { piece, dz = 0, sz = 1, z0 = null, fz = 1, rot = 0 } of copies) {
    let m = byMat.get(piece.mat); if (!m) { m = { pos: [], idx: [], n: 0 }; byMat.set(piece.mat, m); }
    const P = piece.positions, cs = Math.cos(rot), sn = Math.sin(rot);
    for (let i = 0; i < P.length; i += 3) {
      let z = P[i + 2] * sz;
      if (z0 != null && z > z0) z = z0 + (z - z0) * fz;   // a squeezed shank: only past the head's bottom
      const x = P[i] * cs - P[i + 1] * sn, y = P[i] * sn + P[i + 1] * cs;   // turned about the axis (the tip after a remainder)
      m.pos.push(x * scale, y * scale, (z + dz) * scale);
    }
    for (const j of piece.index) m.idx.push(j + m.n);
    m.n += P.length / 3;
  }
  const out = {};
  for (const [mat, m] of byMat) out[mat] = { positions: Float32Array.from(m.pos), index: Uint32Array.from(m.idx) };
  return out;
}

/* a part's mesh at real size, its materials apart ({ part, nylon? }), for a list item: a screw of the item's length (a countersunk
   screw's nominal length includes its head, the others' does not), every other part as modelled. segMax caps the segments of a
   very long screw (they stretch beyond it): an M2 at its 0.4 mm pitch reaches it at about 160 mm. */
export function assemble(model, it, segMax = 400) {
  const h = model.header, s = h.scale || 1, by = Object.fromEntries(model.pieces.map((p) => [p.name, p]));
  if (!h.screw) return lay(model.pieces.map((piece) => ({ piece })), s);
  const sc = h.screw, L = (+it.length || 10) / s;            // the model's own units until the end
  const total = it.type === 'fhcs' ? L : sc.k + L;              // from the top of the head
  const zA = sc.k + sc.a, fill = total - zA - sc.T;
  if (fill >= 0) {
    let n = Math.floor(fill / sc.P + 1e-9), r = fill - n * sc.P, sz = 1;
    if (n > segMax) { sz = fill / (segMax * sc.P); n = segMax; r = 0; }   // a very long screw: its segments stretch, past segMax only
    const copies = [{ piece: by.head }];
    for (let i = 0; i < n; i++) copies.push({ piece: by.seg, dz: zA + i * sc.P * sz, sz });
    if (r > 1e-6) copies.push({ piece: clipBelow(by.seg, r), dz: zA + n * sc.P });   // the remainder: a segment cut short
    else r = 0;   // none to speak of: no piece, so no gap either (Terra 01a1c1e0)
    copies.push({ piece: by.tip, dz: zA + n * sc.P * sz + r, rot: (sc.hand || 1) * 2 * Math.PI * r / sc.P });
    return lay(copies, s);
  }
  // shorter than the head piece and the tip: both shank parts squeezed into what is left past the head (the head itself whole)
  const room = Math.max(0.05, total - sc.k), f = room / (sc.a + sc.T);
  return lay([{ piece: by.head, z0: sc.k, fz: f }, { piece: by.tip, dz: sc.k + sc.a * f, sz: f }], s);
}
// a piece cut at z = zc, the part below kept: a triangle across the plane is clipped, a vertex on a cut edge shared by its two
// triangles (the remainder segment)
export function clipBelow(piece, zc) {
  const P = piece.positions, I = piece.index, pos = Array.from(P), idx = [], cut = new Map();
  const at = (i, j) => {
    const k = i < j ? `${i},${j}` : `${j},${i}`; let v = cut.get(k);
    if (v == null) { const t = (zc - P[i * 3 + 2]) / (P[j * 3 + 2] - P[i * 3 + 2]); v = pos.length / 3; pos.push(P[i * 3] + t * (P[j * 3] - P[i * 3]), P[i * 3 + 1] + t * (P[j * 3 + 1] - P[i * 3 + 1]), zc); cut.set(k, v); }
    return v;
  };
  for (let n = 0; n < I.length; n += 3) {
    const t = [I[n], I[n + 1], I[n + 2]], inn = t.map((i) => P[i * 3 + 2] <= zc);
    if (inn.every(Boolean)) { idx.push(...t); continue; }
    if (!inn.some(Boolean)) continue;
    const poly = [];
    for (let e = 0; e < 3; e++) { const i = t[e], j = t[(e + 1) % 3]; if (inn[e]) poly.push(i); if (inn[e] !== inn[(e + 1) % 3]) poly.push(at(i, j)); }
    for (let e = 1; e < poly.length - 1; e++) idx.push(poly[0], poly[e], poly[e + 1]);
  }
  return { name: piece.name, mat: piece.mat, positions: Float32Array.from(pos), index: Uint32Array.from(idx) };
}
// a mesh's box: one material's ({ positions }) or all of them (for a test, and the placement)
export function boxOf(mesh) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of mesh.positions ? [mesh] : Object.values(mesh)) for (let i = 0; i < m.positions.length; i += 3) for (let c = 0; c < 3; c++) { const v = m.positions[i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
  return { lo, hi };
}
