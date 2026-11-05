import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G, stamps, v23 } from '../lib/parts-drawer-env.mjs';

// Ported from the generator's validation/t_heights.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup.
test('parts drawer tall shells: the 1H stretched by 28 and 56 mm equals the v23 shells, and the 5x4 keeps its top 20 mm', async () => {
const { Manifold } = wasm, U = G.U, q = (mm) => Math.round(mm * U), mm3 = (m) => m.volume() / U ** 3;
// The tall drawers (v23; the 2H groove v25): the generator's 1.5H and 2H shells (G.shellFor) are the 1H shell stretched
// 28 and 56 mm where its walls run straight, and the 2H's side-wall runner groove is 0.4 deep, as on Joey's 2H drawers.
// Checks: the stretch itself (one clean solid with its rim where SIZES says; its section through the band at three
// heights the 1H's; below the band the 1H exactly, above it the 1H moved up; volume the 1H's plus section x stretch;
// equal to the v23 shell file); the 1.5H shell exactly that stretch; the 2H shell that stretch plus material on the
// groove floors only (x -1.6 to -1.2 and W + 1.2 to W + 1.6), its groove floor the outline of the Decor 240-2W-2H's; and
// drawers built in them keep their holders, top and rim exactly as the 1H has them, moved up, and their floor the same
// (inside the groove floors at 2H).
const S = G.SIZES['240-2W'];
let bad = 0; const fail = (m) => { bad++; console.log('FAIL', m); };
const MID = 20.96;   // the stretch plane, in the 1H shell's straight band (13.07 to 28.85 off the bed)
const box = (x0, y0, z0, x1, y1, z1) => Manifold.cube([q(x1 - x0), q(y1 - y0), q(z1 - z0)]).translate([q(x0), q(y0), q(z0)]);
const part = (m, z0, z1, x0 = -10, x1 = 170) => { const b = box(x0, -10, z0, x1, 240, z1), r = m.intersect(b); b.delete(); return r; };
const sameAs = (a, b) => { const d1 = a.subtract(b), d2 = b.subtract(a), v = mm3(d1) + mm3(d2); d1.delete(); d2.delete(); return v; };
const one = assets.shells['1H'], area1H = one.slice(q(MID)).area() / U ** 2;
// the groove floor of the Decor 240-2W-2H (Fusion export, measured 2026-10-23): x -1.6 / 160.6, these y and z
const DECOR_2H = { y: [7.49998, 15.26567, 217.83432, 225.60001], z: [4.4, 12.16569, 91.83432, 99.60001] };
for (const h of ['1.5H', '2H']) {
  const H = S.heights[h], dz = H.rim - S.heights['1H'].rim, s = G.shellFor(wasm, assets, '240-2W', h), pure = one.warp((v) => { if (v[2] > q(MID)) v[2] += q(dz); });
  const bb = s.boundingBox();
  if (s.status() !== 'NoError' || s.decompose().length !== 1) fail(`${h}: ${s.status()}, ${s.decompose().length} bodies`);
  if (Math.abs(bb.max[2] / U - H.rim) > 1e-6 || Math.abs(H.rim - H.top - 3) > 1e-9) fail(`${h}: rim ${bb.max[2] / U}, top ${H.top}`);
  for (const z of [MID, MID + dz / 2, MID + dz]) { const a = pure.slice(q(z)).area() / U ** 2; if (Math.abs(a - area1H) > 1e-3) fail(`${h}: section at ${z} is ${a.toFixed(3)} mm2, the 1H's ${area1H.toFixed(3)}`); }
  const below = sameAs(part(pure, -1, MID), part(one, -1, MID));
  const above = sameAs(part(pure, MID + dz, H.rim + 1).translate([0, 0, -q(dz)]), part(one, MID, 51));
  const dv = mm3(pure) - mm3(one) - area1H * dz, file = sameAs(pure, v23[h]);
  if (below > 1e-3 || above > 1e-3 || Math.abs(dv) > 1e-2 || file > 1e-3) fail(`${h}: the stretch is off: below ${below} above ${above} volume ${dv} v23 file ${file}`);
  let note = '';
  if (h === '1.5H') { const d = sameAs(s, pure); if (d > 1e-3) fail(`1.5H shell differs from the stretch by ${d} mm3`); note = 'the shell is exactly the stretch'; }
  else {
    const extra = s.subtract(pure), missing = mm3(pure.subtract(s)), mid = mm3(extra.intersect(box(-1.15, -10, -1, S.W + 1.15, 240, 120)));
    const outside = mm3(extra.intersect(box(-10, -10, -1, -1.6 - 1e-3, 240, 120))) + mm3(extra.intersect(box(S.W + 1.6 + 1e-3, -10, -1, 200, 240, 120)));
    if (missing > 1e-3 || mid > 1e-3 || outside > 1e-3) fail(`2H groove: removes ${missing}, adds ${mid} inside x -1.15..W+1.15 and ${outside} beyond the new floor`);
    const mesh = s.getMesh(), np = mesh.numProp, V = mesh.vertProperties, ys = new Set(), zs = new Set();
    for (let i = 0; i < V.length; i += np) { const x = V[i] / U; if (Math.abs(x + 1.6) < 1e-3 || Math.abs(x - S.W - 1.6) < 1e-3) { ys.add((V[i + 1] / U).toFixed(3)); zs.add((V[i + 2] / U).toFixed(3)); } }
    const want = (a) => a.map((v) => v.toFixed(3)).join(' '), got = (set) => [...set].sort((a, b) => a - b).join(' ');
    if (got(ys) !== want(DECOR_2H.y) || got(zs) !== want(DECOR_2H.z)) fail(`2H groove floor y ${got(ys)} z ${got(zs)}, the Decor's y ${want(DECOR_2H.y)} z ${want(DECOR_2H.z)}`);
    note = `the shell is the stretch plus ${mm3(extra).toFixed(1)} mm3 on the groove floors, whose outline is the Decor 2H's (y ${got(ys)}, z ${got(zs)})`;
  }
  console.log(`${h.padEnd(4)} stretch one solid, rim ${H.rim}, band section ${area1H.toFixed(1)} mm2 at 3 heights, below ${below.toFixed(4)} above ${above.toFixed(4)} mm3 off the 1H, volume ${(mm3(pure) / 1000).toFixed(2)} cm3 (stretch ${dv.toFixed(4)}), the v23 file; ${note}`);
}
// a drawer in each: the top 20 mm (holders, divider tops, rim) is the 1H's moved up; the floor and the first 10 mm are
// the same (at 2H inside the groove floors, x -1.15 to W + 1.15)
for (const label of ['large', 'small']) {
  const L = (height) => ({ v: 2, size: '240-2W', height, label, comps: G.gridComps(S.shipped.cols, S.shipped.rows, { scoop: 'deep', tray: 6 }) });
  const d1 = G.buildDrawer(wasm, L('1H'), assets);
  for (const h of ['1.5H', '2H']) {
    const d = G.buildDrawer(wasm, L(h), assets), dz = S.heights[h].top - S.heights['1H'].top, [x0, x1] = h === '2H' ? [-1.15, S.W + 1.15] : [-10, 170];
    if (d.status() !== 'NoError' || d.decompose().length !== 1) fail(`${h} ${label}: drawer ${d.status()} ${d.decompose().length} pieces`);
    const topD = part(d, S.heights[h].top - 20, S.heights[h].rim + 1, x0, x1).translate([0, 0, -q(dz)]), top1 = part(d1, S.heights['1H'].top - 20, S.heights['1H'].rim + 1, x0, x1);
    const t = sameAs(topD, top1), f = sameAs(part(d, -1, 10, x0, x1), part(d1, -1, 10, x0, x1));
    if (t > 1e-3 || f > 1e-3) fail(`${h} ${label}: top 20 mm differs ${t.toFixed(4)} mm3, the floor ${f.toFixed(4)}`);
    console.log(`${h.padEnd(4)} ${label.padEnd(5)} drawer one solid, ${G.grams(d).toFixed(0)} g; top 20 mm off the 1H's by ${t.toFixed(4)} mm3, floor by ${f.toFixed(4)}`);
    d.delete();
  }
  d1.delete();
}
console.log(bad ? `${bad} FAILED` : 'height tests pass');

assert.equal(bad, 0, bad + ' height checks failed');
});
