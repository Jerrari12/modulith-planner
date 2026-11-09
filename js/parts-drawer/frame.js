// The parts drawer in the planner's frame (M1, 2026-11-04).
//
// The generator models a drawer with x across its width from the cavity's left wall (the outside is at -2 and W + 2),
// y front to back from the cavity's front wall (the outside is at -4.3 and D + 4), z up from the bed. The planner's
// Decor drawer GLB (gen2-parts, `DecorDrawer_<L>-<W>W-<H>H`) is centred on its own outside in x and z, stands on
// y = 0 and faces +z, and the generator's shell sits on it exactly at 240-2W 0.5H (`test/parts-drawer/frame.test.mjs`):
//
//     X = x - W / 2          Y = z          Z = (D / 2 - 0.15) - y
//
// The 0.15 is the front wall's 4.3 against the back wall's 4: the outside's centre is 0.15 behind the cavity's.
// (The prototype's preview centred on the cavity, `sceneGeo` in docs/parts-drawer/prototype/index.html, so a
// drawer drawn there sits 0.15 further back than this.) A mesh from `buildDrawer` passes through here on its way to
// a BufferGeometry, so a parts drawer takes the Decor drawer's pose, faceplate, handle and stoppers unchanged.
import { SIZES, U } from './gen.js';

// The planner-frame offset for a size: subtract it from a generator point, after swapping y and z as above.
export function frameOf(size) {
  const S = SIZES[size];
  return { cx: S.W / 2, cz: S.D / 2 - 0.15 };
}
// One generator point (grid units or mm) to the planner frame, in mm.
export function toFrame(size, x, y, z, scale = 1 / U) {
  const { cx, cz } = frameOf(size);
  return [x * scale - cx, z * scale, cz - y * scale];
}
// A manifold mesh (`manifold.getMesh()`) to flat positions in the planner frame (mm), triangle by triangle so the
// geometry can take creased normals without an index.
export function framePositions(size, mesh) {
  const { cx, cz } = frameOf(size);
  const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts, pos = new Float32Array(tv.length * 3);
  for (let i = 0; i < tv.length; i++) {
    const o = tv[i] * np;
    pos[3 * i] = vp[o] / U - cx;
    pos[3 * i + 1] = vp[o + 2] / U;
    pos[3 * i + 2] = cz - vp[o + 1] / U;
  }
  return pos;
}
// The same for a mesh's vertices alone (one position per vertex, mm), for checks and bounds.
export function frameVertices(size, mesh) {
  const { cx, cz } = frameOf(size);
  const np = mesh.numProp, vp = mesh.vertProperties, n = vp.length / np, pos = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { const o = i * np; pos[3 * i] = vp[o] / U - cx; pos[3 * i + 1] = vp[o + 2] / U; pos[3 * i + 2] = cz - vp[o + 1] / U; }
  return pos;
}
