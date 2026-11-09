import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G } from '../lib/parts-drawer-env.mjs';

// Ported from the generator's validation/t_color.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup;
// the port asserts what the script printed: body and floor parts add up to the plain drawer and never overlap.
test('parts drawer floor colours: body plus floor parts equal the plain drawer, with zero overlap', async () => {
const S = G.SIZES['240-2W'];
fs.rmSync('out/color', { recursive: true, force: true }); fs.mkdirSync('out/color', { recursive: true });
const cases = {
  one_05H_L: { v: 2, size: '240-2W', height: '0.5H', label: 'large', floor: { mode: 'one', colors: ['#f2f2f0'] }, comps: G.gridComps(S.shipped.cols, S.shipped.rows) },
  paint_1H_L_tray: { v: 2, size: '240-2W', height: '1H', label: 'large', floor: { mode: 'paint', colors: ['#f2f2f0', '#f5c518', '#3aa0ff'] },
    comps: G.gridComps(S.shipped.cols, S.shipped.rows).map((c, i) => ({ ...c, color: [0, 1, 2, 3][i % 4], tray: i % 3 === 0, scoop: i % 5 === 0 ? 'deep' : 'std' })) },
  paint4_05H_S: { v: 2, size: '240-2W', height: '0.5H', label: 'small', floor: { mode: 'paint', colors: ['#f2f2f0', '#f5c518', '#3aa0ff', '#e5322d'] },
    comps: G.evenGrid('240-2W', 7, 6).map((c, i) => ({ ...c, color: (i % 5), tray: i % 2 === 0, scoop: ['off', 'std', 'deep'][i % 3] })) },
};
const rep = {};
for (const [n, lay] of Object.entries(cases)) {
  const t0 = performance.now(); const { body, floors } = G.buildParts(wasm, lay, assets); const ms = performance.now() - t0;
  fs.writeFileSync(`out/color/${n}__body.stl`, Buffer.from(G.toSTL(body.getMesh())));
  for (const f of floors) fs.writeFileSync(`out/color/${n}__floor${f.color}.stl`, Buffer.from(G.toSTL(f.part.getMesh())));
  const whole = G.buildDrawer(wasm, lay, assets);
  const vsum = body.volume() + floors.reduce((a, f) => a + f.part.volume(), 0);
  rep[n] = { ms: +ms.toFixed(0), body: [body.status(), body.decompose().length], floors: floors.map((f) => [f.color, f.part.decompose().length, +(f.part.volume() / 1e12).toFixed(1)]),
    vol_match: +((vsum - whole.volume()) / 1e12).toFixed(4) };
  // the parts must not overlap: body ∩ each floor has zero volume
  rep[n].overlap = floors.map((f) => +(body.intersect(f.part).volume() / 1e12).toFixed(5));
}
console.log(JSON.stringify(rep, null, 1));

for (const [n, r] of Object.entries(rep)) {
  assert.deepEqual(r.body, ['NoError', 1], n + ': the body is one clean solid');
  assert.ok(Math.abs(r.vol_match) <= 1e-3, n + ': parts add up to the plain drawer (' + r.vol_match + ' mm3 off)');
  assert.deepEqual(r.overlap, r.overlap.map(() => 0), n + ': no floor part overlaps the body');
}
});
