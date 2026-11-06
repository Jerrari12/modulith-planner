import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G, I, Mk as M } from '../lib/parts-drawer-env.mjs';

// Ported from the generator's validation/t_marks.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup;
// the port asserts what the script printed: one solid (or body plus floors adding up with zero overlap) and a layout code.
test('parts drawer marks: part outlines and the bottom-marked layout code on five kit drawers, plain and coloured', async () => {
fs.rmSync('out/marks', { recursive: true, force: true }); fs.mkdirSync('out/marks', { recursive: true });
const rep = {};
for (const [kit, height, mode] of [['m3printer', '0.5H', 'off'], ['m3printer', '1H', 'paint'], ['nuts', '1H', 'one'], ['m2m5', '1H', 'paint'], ['inserts', '0.5H', 'off']]) {
  const r = I.layoutFor(I.KITS[kit].items, { height, label: 'large' });
  const lay = { v: 2, size: '240-2W', height, label: 'large', floor: { mode, colors: ['#f2f2f0', '#f5c518', '#3aa0ff'] }, comps: r.comps.map((c, i) => ({ ...c, color: mode === 'paint' ? (i % 3) + 1 : 0 })) };
  const outlines = I.placedOutlines(lay, G.openFloorRect, 2.5, G.floorRect);
  const code = await M.codeOf({ ...lay, outlines: true });
  const mark = [...M.textRects(M.pretty(code), { px: 0.9, cx: 79.5, cy: 186, mirror: true }), ...M.textRects('MODULITH', { px: 0.6, cx: 79.5, cy: 176, mirror: true })];
  const opts = { outlines, bottomMark: mark };
  const name = `${kit}_${height}_${mode}`;
  const t0 = performance.now();
  if (mode === 'off') {
    const m = G.buildDrawer(wasm, lay, assets, opts);
    fs.writeFileSync(`out/marks/${name}.stl`, Buffer.from(G.toSTL(m.getMesh())));
    rep[name] = { comps: lay.comps.length, outlines: outlines.length, ms: Math.round(performance.now() - t0), status: m.status(), pieces: m.decompose().length, code: M.pretty(code) };
    m.delete();
  } else {
    const plain = G.buildDrawer(wasm, lay, assets, opts);
    const { body, floors } = G.buildParts(wasm, lay, assets, opts);
    fs.writeFileSync(`out/marks/${name}__body.stl`, Buffer.from(G.toSTL(body.getMesh())));
    floors.forEach((f) => fs.writeFileSync(`out/marks/${name}__floor${f.color}.stl`, Buffer.from(G.toSTL(f.part.getMesh()))));
    const sum = body.volume() + floors.reduce((a, f) => a + f.part.volume(), 0);
    rep[name] = { comps: lay.comps.length, outlines: outlines.length, ms: Math.round(performance.now() - t0), body: [body.status(), body.decompose().length],
      vol_match_mm3: +((sum - plain.volume()) / 1e12).toFixed(4), overlap: floors.map((f) => +(body.intersect(f.part).volume() / 1e12).toFixed(5)), code: M.pretty(code) };
  }
}
console.log(JSON.stringify(rep, null, 1));

for (const [n, r] of Object.entries(rep)) {
  assert.match(r.code, /^MD-[A-Z0-9]{3}-[A-Z0-9]{3}$/, n + ': a layout code');
  if (r.status !== undefined) { assert.equal(r.status, 'NoError', n); assert.equal(r.pieces, 1, n + ': one solid'); }
  else { assert.deepEqual(r.body, ['NoError', 1], n + ': the body is one clean solid'); assert.ok(Math.abs(r.vol_match_mm3) <= 1e-3, n + ': parts add up (' + r.vol_match_mm3 + ' mm3 off)'); assert.deepEqual(r.overlap, r.overlap.map(() => 0), n + ': no overlap'); }
}
});
