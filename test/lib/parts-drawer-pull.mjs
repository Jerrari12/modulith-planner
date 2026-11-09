// Ported from the generator's validation/t_lid_pull.mjs (M0, 2026-11-04); only the import moved.
// Shared by t_lid.mjs and t_covers.mjs: does a pull work? A straight path down through the opening to the cup floor is
// clear, the hook space under the top is clear (one side for a finger pull, both long sides for a nail slot), and the
// top over each hook is solid. Sizes: a finger pull at least 20 x 9 with a 2.5 hook, a nail slot at least 9 x 6 with
// 1.5 each side. A pull with a chamfered top edge (F.CH) is checked solid over the hooks up to the chamfer, and its
// opening must be CH wider at the top surface. (Pass the test's own wasm: solids from two wasm instances can't meet.)
import * as G from '../../js/parts-drawer/gen.js';
const U = G.U, mm3 = (m) => m.volume() / U ** 3;
const boxOf = (Manifold) => (x0, x1, y0, y1, z0, z1) => Manifold.cube([Math.round((x1 - x0) * U), Math.round((y1 - y0) * U), Math.round((z1 - z0) * U)]).translate([Math.round(x0 * U), Math.round(y0 * U), Math.round(z0 * U)]);
// zLow: underside of the top over the hook, zTop: the top surface
export function pullCheck(wasm, m, pl, top, zLow, zTop) {
  const box = boxOf(wasm.Manifold);
  const v = (b) => { const x = m.intersect(b); const r = mm3(x); x.delete(); const bv = mm3(b); b.delete(); return [r, bv]; };
  const o = pl.open, k = pl.cav, nail = pl.kind === 'nail', z0 = top - pl.depth + 0.05, ch = pl.F.CH || 0;
  const r = nail ? pl.F.R : Math.min(o[1] - o[0], o[3] - o[2]) / 2;
  const path = pl.along === 'x' ? [o[0] + r, o[1] - r, o[2] + 0.1, o[3] - 0.1] : [o[0] + 0.1, o[1] - 0.1, o[2] + r, o[3] - r];
  const hooks = [];   // [x0, x1, y0, y1, width]
  if (pl.along === 'x') { hooks.push([o[0] + r, o[1] - r, k[2] + 0.1, o[2] - 0.1, o[2] - k[2]]); if (nail) hooks.push([o[0] + r, o[1] - r, o[3] + 0.1, k[3] - 0.1, k[3] - o[3]]); }
  else { hooks.push([o[1] + 0.1, k[1] - 0.1, o[2] + r, o[3] - r, k[1] - o[1]]); if (nail) hooks.push([k[0] + 0.1, o[0] - 0.1, o[2] + r, o[3] - r, o[0] - k[0]]); }
  const [inPath] = v(box(...path, z0, zTop + 1));
  let inHook = 0, over = 1, hk = Infinity;
  for (const h of hooks) {
    inHook = Math.max(inHook, v(box(h[0], h[1], h[2], h[3], z0, zLow - 0.05))[0]);
    const [a, want] = v(box(h[0], h[1], h[2], h[3], zLow + 0.05, zTop - ch - 0.05)); over = Math.min(over, a / want);
    hk = Math.min(hk, h[4]);
  }
  // the chamfer: at the top surface the opening reaches CH - 0.1 further out all along its long sides
  let inChamfer = 0;
  if (ch) inChamfer = v(pl.along === 'x' ? box(o[0] + r, o[1] - r, o[2] - ch + 0.1, o[3] + ch - 0.1, zTop - 0.05, zTop + 0.5) : box(o[0] - ch + 0.1, o[1] + ch - 0.1, o[2] + r, o[3] - r, zTop - 0.05, zTop + 0.5))[0];
  const ow = o[1] - o[0], od = o[3] - o[2], big = Math.max(ow, od), small = Math.min(ow, od);
  const sized = nail ? big >= 9 - 1e-6 && small >= 6 - 1e-6 && hk >= 1.5 - 1e-6 : big >= 20 - 1e-6 && small >= 9 - 1e-6 && hk >= 2.5 - 1e-6;
  const ok = inPath < 1e-6 && inHook < 1e-6 && over > 0.99 && inChamfer < 1e-6 && sized && hooks.length === (nail ? 2 : 1);
  return { ok, text: `${pl.P.id}-${pl.along} ${ow.toFixed(1)}x${od.toFixed(1)} hook ${hk.toFixed(1)}${nail ? ' x2' : ''} cup ${pl.depth}${ch ? ` chamfer ${ch}` : ''}`, inPath, inHook, over, inChamfer };
}
