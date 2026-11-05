import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G } from '../lib/parts-drawer-env.mjs';
import { pullCheck } from '../lib/parts-drawer-pull.mjs';

// Ported from the generator's validation/t_lid.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup.
test('parts drawer lid: one solid on 51 layouts, seated under the rim and the stoppers, with a working pull', async () => {
const { Manifold } = wasm;
// Lid: builds clean for every kind of layout, never touches the drawer when seated (also nudged 0.29 mm any way),
// rests on the dividers, stays under the rim and at least STOPPER.MIN_CLEAR under the drawer stoppers' tabs, and lifted as far as a case cover allows its lips still ring every
// compartment at least 1 mm below the divider tops.
const S = G.SIZES['240-2W'], U = G.U, mm3 = (m) => m.volume() / U ** 3;
fs.mkdirSync('out/lid', { recursive: true });
function rand(seed) { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; }
function randomLayout(seed) {
  const R = rand(seed); const nc = 1 + Math.floor(R() * 8), nr = 1 + Math.floor(R() * 6);
  const own = Array.from({ length: nr }, () => Array(nc).fill(-1)); const regions = [];
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) if (own[r][c] < 0) {
    let w = Math.min(1 + Math.floor(R() * 3), nc - c), h = Math.min(1 + Math.floor(R() * 2), nr - r);
    for (let k = 0; k < w; k++) if (own[r][c + k] >= 0) { w = k; break; }
    for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) if (own[rr][cc] >= 0) { h = rr - r; break; }
    w = Math.max(1, w); h = Math.max(1, h);
    for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) own[rr][cc] = regions.length;
    regions.push({ c0: c, c1: c + w - 1, r0: r, r1: r + h - 1, holder: R() > 0.15 });
  }
  const lay = G.toV2({ size: '240-2W', height: R() > 0.5 ? '1H' : '0.5H', label: R() > 0.5 ? 'large' : 'small', style: 'pyramid', cols: G.uniform(159, nc), rows: G.uniform(226, nr), regions });
  for (const c of lay.comps) { const s = R(); c.scoop = s < 0.2 ? 'off' : s < 0.6 ? 'std' : 'deep'; const t = R(); c.tray = t < 0.5 ? 0 : G.TRAYS[1 + Math.floor(R() * 4)]; }
  return lay;
}
const layouts = [
  ['shipped_05H_L', { v: 2, size: '240-2W', height: '0.5H', label: 'large', comps: G.gridComps(S.shipped.cols, S.shipped.rows) }],
  ['shipped_1H_S', { v: 2, size: '240-2W', height: '1H', label: 'small', comps: G.gridComps(S.shipped.cols, S.shipped.rows, { scoop: 'deep', tray: 12 }) }],
  ['one_box_05H', { v: 2, size: '240-2W', height: '0.5H', label: 'large', comps: G.gridComps([159], [226]) }],
  ['grid7x5_05H', { v: 2, size: '240-2W', height: '0.5H', label: 'small', comps: G.evenGrid('240-2W', 7, 5, {}) }],
  ['grid8x6_05H_deep', { v: 2, size: '240-2W', height: '0.5H', label: 'small', comps: G.evenGrid('240-2W', 8, 6, { scoop: 'deep', tray: 12 }) }],
  ['grid9x6_1H', { v: 2, size: '240-2W', height: '1H', label: 'small', comps: G.evenGrid('240-2W', 9, 6, {}) }],
  ['grid10x8_05H_deep', { v: 2, size: '240-2W', height: '0.5H', label: 'large', comps: G.evenGrid('240-2W', 10, 8, { scoop: 'deep', tray: 12 }) }],
  ['grid10x8_1H', { v: 2, size: '240-2W', height: '1H', label: 'small', comps: G.evenGrid('240-2W', 10, 8, {}) }],
  ['shipped_15H_L', { v: 2, size: '240-2W', height: '1.5H', label: 'large', comps: G.gridComps(S.shipped.cols, S.shipped.rows) }],   // v23 tall drawers
  ['grid3x2_2H_deep', { v: 2, size: '240-2W', height: '2H', label: 'small', comps: G.evenGrid('240-2W', 3, 2, { scoop: 'deep', tray: 12 }) }],
  ['one_box_2H', { v: 2, size: '240-2W', height: '2H', label: 'large', comps: G.gridComps([159], [226]) }],
  ...Array.from({ length: 40 }, (_, i) => [`fuzz${i}`, randomLayout(31000 + i * 7919)]),
];
const shift = (m, dx, dy, dz = 0) => m.translate([Math.round(dx * U), Math.round(dy * U), Math.round(dz * U)]);
let bad = 0; const rows = [];
for (const [name, lay] of layouts) {
  const t0 = performance.now();
  const drawer = G.buildDrawer(wasm, lay, assets);
  const lid = G.buildLid(wasm, lay); const ms = performance.now() - t0;
  const pull = G.lidPull(lay), rise = G.lidRise(lay.size, lay.height), H = S.heights[lay.height];
  const hit = (m) => { const x = drawer.intersect(m); const v = mm3(x); x.delete(); return v; };
  const seated = hit(lid);
  let nudged = 0; for (const [dx, dy] of [[0.29, 0], [-0.29, 0], [0, 0.29], [0, -0.29]]) { const m = shift(lid, dx, dy); nudged = Math.max(nudged, hit(m)); m.delete(); }
  const down = shift(lid, 0, 0, -0.05); const rests = hit(down); down.delete();
  const bb = lid.boundingBox(), lidTop = bb.max[2] / U;
  // lifted by the most a case cover allows, every lip still reaches 1 mm below the divider tops
  const up = shift(lid, 0, 0, rise); let lipsIn = 0, lipsWant = 0;
  for (const c of lay.comps) {
    const yMax = G.hasHolder(lay, c) ? c.y1 - G.holderOf(lay).D : c.y1;
    if (c.x1 - c.x0 - 0.8 < 3 || yMax - c.y0 - 0.8 < 3) continue;
    lipsWant++;
    const b = Manifold.cube([Math.round((c.x1 - c.x0) * U), Math.round((yMax - c.y0) * U), Math.round(0.1 * U)]).translate([Math.round(c.x0 * U), Math.round(c.y0 * U), Math.round((H.top - 1.0) * U)]);
    const x = up.intersect(b); if (mm3(x) > 0.01) lipsIn++; x.delete(); b.delete();
  }
  up.delete();
  const pc = pull ? pullCheck(wasm, lid, pull, H.top, H.top - G.LID.HOOK, H.top + G.LID.T) : { ok: false, text: 'NO PULL' };
  const sc = G.stopperClearance(lay.size, lay.height, (lidTop - H.top));   // the lid's top against the drawer stoppers' tabs
  const ok = lid.status() === 'NoError' && lid.decompose().length === 1 && seated < 1e-6 && nudged < 1e-6 && rests > 1 && lidTop <= H.rim - 0.5 + 1e-6 && lipsIn === lipsWant && pc.ok && sc >= G.STOPPER.MIN_CLEAR - 1e-6;
  bad += !ok;
  rows.push(`${ok ? 'ok ' : 'BAD'} ${name.padEnd(17)} ${lay.height.padEnd(4)} comps ${String(lay.comps.length).padStart(2)} pull c${pull ? pull.comp : '-'} ${pc.text.padEnd(32)} lid ${G.grams(lid).toFixed(0)} g pieces ${lid.decompose().length} seated ${seated.toFixed(4)} nudged ${nudged.toFixed(4)} rests ${rests.toFixed(1)} top ${(H.rim - lidTop).toFixed(2)} under rim, stoppers +${sc.toFixed(2)}, lifted ${rise}: lips in ${lipsIn}/${lipsWant} ms ${ms.toFixed(0)}`);
  if (name.startsWith('shipped') || name === 'one_box_05H' || name === 'fuzz0') {
    fs.writeFileSync(`out/lid/${name}_lid.stl`, Buffer.from(G.toSTL(lid.getMesh())));
    const pr = G.lidForPrint(wasm, lid); fs.writeFileSync(`out/lid/${name}_lid_print.stl`, Buffer.from(G.toSTL(pr.getMesh()))); pr.delete();
    fs.writeFileSync(`out/lid/${name}_drawer.stl`, Buffer.from(G.toSTL(drawer.getMesh())));
  }
  drawer.delete(); lid.delete();
}
console.log(rows.join('\n'));
const tp = G.lidTestPieces(wasm, layouts[0][1], assets);
for (const [n, m] of [['test_drawer', tp.drawer], ['test_lid', tp.lid]]) { fs.writeFileSync(`out/lid/${n}.stl`, Buffer.from(G.toSTL(m.getMesh()))); console.log(n, m.status(), m.decompose().length, 'pieces', G.grams(m).toFixed(1), 'g'); }
const lp = G.lidForPrint(wasm, tp.lid); fs.writeFileSync('out/lid/test_lid_print.stl', Buffer.from(G.toSTL(lp.getMesh())));
console.log('test pull', JSON.stringify(tp.pull));
console.log('layouts', layouts.length, 'bad', bad);

assert.equal(bad, 0, bad + ' lid checks failed');
});
