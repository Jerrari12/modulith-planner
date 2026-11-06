import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G } from '../lib/parts-drawer-env.mjs';
import { pullCheck } from '../lib/parts-drawer-pull.mjs';

// Ported from the generator's validation/t_covers.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup.
test('parts drawer covers: one solid each on 34 layouts, seated, snapped, slotted and clear of the stoppers', async () => {
const { Manifold } = wasm;
// Covers: each builds clean, never touches the drawer seated or nudged 0.29 mm, rests on the dividers, clears its
// neighbours, its skirt window sits round the bead (lift 0.4: the skirt meets the bead), its nail slot has a clear path
// down, empty divots both sides and solid plate over them (t_lid_pull.mjs), and the drawer with beads stays one solid.
// Compartments too small for a nail slot get no cover (and no beads); the named grids check how many covers they get.
// v26: over a label holder a cover leaves the label open (no window and no thin strips round it): nothing of it over the
// label beyond WIN_IN at its front edge (and its right end, beside a leg, with the L's 1 mm rounded inside corner); a leg
// exactly where the holder's side is open, at least 4 mm wide and reaching over that open part.
const S = G.SIZES['240-2W'], U = G.U, mm3 = (m) => m.volume() / U ** 3;
fs.mkdirSync('out/covers', { recursive: true });
function rand(seed) { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; }
function randomLayout(seed) {
  const R = rand(seed); const nc = 1 + Math.floor(R() * 7), nr = 1 + Math.floor(R() * 6);
  const own = Array.from({ length: nr }, () => Array(nc).fill(-1)); const regions = [];
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) if (own[r][c] < 0) {
    let w = Math.min(1 + Math.floor(R() * 3), nc - c), h = Math.min(1 + Math.floor(R() * 2), nr - r);
    for (let k = 0; k < w; k++) if (own[r][c + k] >= 0) { w = k; break; }
    for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) if (own[rr][cc] >= 0) { h = rr - r; break; }
    w = Math.max(1, w); h = Math.max(1, h);
    for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) own[rr][cc] = regions.length;
    regions.push({ c0: c, c1: c + w - 1, r0: r, r1: r + h - 1, holder: R() > 0.2 });
  }
  const lay = G.toV2({ size: '240-2W', height: R() > 0.5 ? '1H' : '0.5H', label: R() > 0.5 ? 'large' : 'small', style: 'pyramid', cols: G.uniform(159, nc), rows: G.uniform(226, nr), regions });
  for (const c of lay.comps) { const s = R(); c.scoop = s < 0.2 ? 'off' : s < 0.6 ? 'std' : 'deep'; const t = R(); c.tray = t < 0.5 ? 0 : G.TRAYS[1 + Math.floor(R() * 4)]; if (R() < 0.15) c.nocover = true; }
  lay.covers = true; return lay;
}
const layouts = [
  ['shipped_05H_L', { v: 2, size: '240-2W', height: '0.5H', label: 'large', covers: true, comps: G.gridComps(S.shipped.cols, S.shipped.rows) }],
  ['shipped_1H_S_deeptray', { v: 2, size: '240-2W', height: '1H', label: 'small', covers: true, comps: G.gridComps(S.shipped.cols, S.shipped.rows, { scoop: 'deep', tray: 12 }) }],
  ['nolabels_05H', { v: 2, size: '240-2W', height: '0.5H', label: 'large', covers: true, comps: G.gridComps(S.shipped.cols, S.shipped.rows, { holder: false }) }],
  ['grid7x5_05H', { v: 2, size: '240-2W', height: '0.5H', label: 'small', covers: true, comps: G.evenGrid('240-2W', 7, 5, {}) }],
  ['grid8x6_05H_deep', { v: 2, size: '240-2W', height: '0.5H', label: 'small', covers: true, comps: G.evenGrid('240-2W', 8, 6, { scoop: 'deep', tray: 12 }) }],
  ['grid9x6_1H', { v: 2, size: '240-2W', height: '1H', label: 'small', covers: true, comps: G.evenGrid('240-2W', 9, 6, {}) }],
  ['shipped_2H_L', { v: 2, size: '240-2W', height: '2H', label: 'large', covers: true, comps: G.gridComps(S.shipped.cols, S.shipped.rows) }],   // v23 tall drawers
  ['grid3x3_15H_deeptray', { v: 2, size: '240-2W', height: '1.5H', label: 'small', covers: true, comps: G.evenGrid('240-2W', 3, 3, { scoop: 'deep', tray: 12 }) }],
  ['narrow10x8_05H_deep', { v: 2, size: '240-2W', height: '0.5H', label: 'large', covers: true, comps: G.evenGrid('240-2W', 10, 8, { scoop: 'deep', tray: 12 }) }],
  ['min12_05H', { v: 2, size: '240-2W', height: '0.5H', label: 'small', covers: true, comps: G.gridComps(Array(10).fill(12).concat([24]), Array(15).fill(12).concat([23.5])) }],
  ...Array.from({ length: 24 }, (_, i) => [`fuzz${i}`, randomLayout(51000 + i * 7919)]),
];
const shift = (m, dx, dy, dz = 0) => m.translate([Math.round(dx * U), Math.round(dy * U), Math.round(dz * U)]);
const box = (x0, x1, y0, y1, z0, z1) => Manifold.cube([Math.round((x1 - x0) * U), Math.round((y1 - y0) * U), Math.round((z1 - z0) * U)]).translate([Math.round(x0 * U), Math.round(y0 * U), Math.round(z0 * U)]);
let labelled = 0, legs = 0, minLeg = Infinity;
// how many covers the named grids should get: every compartment of every grid the page makes (10 x 8 included); of the
// 12 mm test grid only its 24 x 23.5 corner cell (since the slot went to 6 mm front to back, a 12 mm side is too short)
const EXPECT = { shipped_05H_L: 20, shipped_1H_S_deeptray: 20, nolabels_05H: 20, grid7x5_05H: 35, grid8x6_05H_deep: 48, grid9x6_1H: 54, narrow10x8_05H_deep: 80, min12_05H: 1 };
let bad = 0, covers = 0, beadsTotal = 0; const kinds = {};
for (const [name, lay] of layouts) {
  const drawer = G.buildDrawer(wasm, lay, assets); const plain = G.buildDrawer(wasm, { ...lay, covers: false }, assets);
  const beadVol = mm3(drawer) - mm3(plain); plain.delete();
  const hit = (m) => { const x = drawer.intersect(m); const v = mm3(x); x.delete(); return v; };
  const built = []; let minStop = Infinity; let worst = { seated: 0, nudged: 0 }, rests = 0, catches = 0, sides = 0, pieces = 0, problems = [], lifts = 0;
  lay.comps.forEach((c, i) => {
    if (!G.isCovered(lay, c)) return;
    const m = G.buildCover(wasm, lay, i); built.push(m); covers++;
    if (m.status() !== 'NoError' || m.decompose().length !== 1) problems.push(`c${i} pieces ${m.decompose().length}`);
    worst.seated = Math.max(worst.seated, hit(m));
    for (const [dx, dy] of [[0.29, 0], [-0.29, 0], [0, 0.29], [0, -0.29]]) { const n = shift(m, dx, dy); worst.nudged = Math.max(worst.nudged, hit(n)); n.delete(); }
    const d = shift(m, 0, 0, -0.05); if (hit(d) > 0.01) rests++; d.delete();
    const s = G.coverSides(lay, c); sides += s.length;
    const H = S.heights[lay.height], pl = G.coverPull(lay, c);
    if (pl) { const pc = pullCheck(wasm, m, pl, H.top, H.top - G.COVER.INNER, H.top + G.COVER.T); if (pc.ok) lifts++; else problems.push(`c${i} pull ${pc.text} path ${pc.inPath.toFixed(3)} hook ${pc.inHook.toFixed(3)} over ${pc.over.toFixed(3)}`); const k = `${pl.P.id}-${pl.along}`; kinds[k] = (kinds[k] || 0) + 1; }
    else problems.push(`c${i} covered without a pull`);
    if (s.length) { const u = shift(m, 0, 0, 0.4); if (hit(u) > 0.001) catches++; u.delete(); }
    else catches++;
    const ct = m.boundingBox().max[2] / U; minStop = Math.min(minStop, G.stopperClearance(lay.size, lay.height, ct - H.top));
    if (G.hasHolder(lay, c)) {   // v26: the label left open
      const h = G.holderOf(lay), lx = c.x0 + (G.C.HOLDER_W - h.label[0]) / 2, out = G.coverOutline(lay, c), legged = out.length === 6;
      const xr = legged ? out[3][0] : lx + h.label[0], yn = c.y1 - h.label[1] + G.COVER.WIN_IN, f = legged ? G.COVER.NOTCH_R : 0;   // f: the L's rounded inside corner
      let v = 0; for (const b of [box(lx, xr - f - 1e-3, yn + 1e-3, c.y1 + 1, H.top - 3, H.top + 2), box(xr - f - 1e-3, xr - 1e-3, yn + f + 1e-3, c.y1 + 1, H.top - 3, H.top + 2)]) { const x = m.intersect(b); v += mm3(x); b.delete(); x.delete(); }
      if (v > 1e-6) problems.push(`c${i} ${v.toFixed(3)} mm3 of plate over the label`);
      const w = c.x1 - c.x0, open = w > G.C.HOLDER_W + 1e-6 && !(w < G.C.HOLDER_W + G.C.END_FILL);
      if (legged !== open) problems.push(`c${i} ${legged ? 'a leg' : 'no leg'} beside a holder whose side is ${open ? 'open' : 'closed'}`);
      if (legged) { const lw = out[1][0] - out[3][0]; minLeg = Math.min(minLeg, lw); legs++; if (lw < 4 || out[3][0] > c.x0 + G.C.HOLDER_W + 1.5) problems.push(`c${i} leg ${lw.toFixed(2)} wide from ${out[3][0]}`); }
      labelled++;
    }
  });
  // neighbours never overlap
  let pair = 0; for (let a = 0; a < built.length; a++) for (let b = a + 1; b < built.length; b++) { const x = built[a].intersect(built[b]); pair = Math.max(pair, mm3(x)); x.delete(); }
  // compartments left open: none of them may have beads, and each must really lack room for a pull
  const open = lay.comps.filter((c) => !c.nocover && !G.isCovered(lay, c)).length;
  if (EXPECT[name] !== undefined && EXPECT[name] !== built.length) problems.push(`expected ${EXPECT[name]} covers`);
  if (!built.length && beadVol > 1e-6) problems.push('beads with no covers');
  const ok = drawer.status() === 'NoError' && drawer.decompose().length === 1 && worst.seated < 1e-6 && worst.nudged < 1e-6 && pair < 1e-6 && rests === built.length && catches === built.length && lifts === built.length && (built.length === 0 || minStop >= G.STOPPER.MIN_CLEAR - 1e-6) && !problems.length;
  bad += !ok; beadsTotal += sides;
  console.log(`${ok ? 'ok ' : 'BAD'} ${name.padEnd(22)} ${lay.height.padEnd(4)} covers ${String(built.length).padStart(2)} open ${String(open).padStart(2)} beads ${String(sides).padStart(2)} (+${beadVol.toFixed(1)} mm3) seated ${worst.seated.toFixed(4)} nudged ${worst.nudged.toFixed(4)} rest ${rests}/${built.length} catch ${catches}/${built.length} lift ${lifts}/${built.length} pairs ${pair.toFixed(4)} stoppers ${built.length ? '+' + minStop.toFixed(2) : '-'} ${problems.slice(0, 3).join(' ')}`);
  if (name.startsWith('shipped') || name === 'nolabels_05H' || name.startsWith('narrow') || name.startsWith('grid')) {
    fs.writeFileSync(`out/covers/${name}_drawer.stl`, Buffer.from(G.toSTL(drawer.getMesh())));
    const all = Manifold.union(built); fs.writeFileSync(`out/covers/${name}_covers.stl`, Buffer.from(G.toSTL(all.getMesh()))); all.delete();
  }
  built.forEach((m) => m.delete()); drawer.delete();
}
const tp = G.coverTestPieces(wasm, layouts[0][1], assets);
fs.writeFileSync('out/covers/test_drawer.stl', Buffer.from(G.toSTL(tp.drawer.getMesh())));
const pc = G.lidForPrint(wasm, tp.cover); fs.writeFileSync('out/covers/test_cover_print.stl', Buffer.from(G.toSTL(pc.getMesh())));
fs.writeFileSync('out/covers/test_cover.stl', Buffer.from(G.toSTL(tp.cover.getMesh())));
console.log('test comp', tp.comp, 'drawer', tp.drawer.status(), tp.drawer.decompose().length, G.grams(tp.drawer).toFixed(1), 'g; cover', G.grams(tp.cover).toFixed(1), 'g');
// the lighter snap to try against it: the same compartment with 0.5 beads. The same cover clears both seated and nudged
// 0.29, still has 0.3 of lift on each before its skirt meets a bead (so 0.25 is clear), and catches by 0.4
const tp5 = G.coverTestPieces(wasm, layouts[0][1], assets, { bead: 0.5 });
fs.writeFileSync('out/covers/test_drawer_bead05.stl', Buffer.from(G.toSTL(tp5.drawer.getMesh())));
for (const [b, d] of [[0.7, tp.drawer], [0.5, tp5.drawer]]) {
  const hitD = (dx, dy, dz) => { const m = shift(tp.cover, dx, dy, dz), x = d.intersect(m), v = mm3(x); m.delete(); x.delete(); return v; };
  const nudged = Math.max(...[[0.29, 0], [-0.29, 0], [0, 0.29], [0, -0.29]].map(([dx, dy]) => hitD(dx, dy, 0)));
  const ok = d.status() === 'NoError' && d.decompose().length === 1 && hitD(0, 0, 0) < 1e-6 && nudged < 1e-6 && hitD(0, 0, 0.25) < 1e-6 && hitD(0, 0, 0.4) > 0.001;
  bad += !ok;
  console.log(`${ok ? 'ok ' : 'BAD'} test piece, ${b} beads: seated ${hitD(0, 0, 0).toFixed(4)} nudged ${nudged.toFixed(4)} lift 0.25 ${hitD(0, 0, 0.25).toFixed(4)} lift 0.4 ${hitD(0, 0, 0.4).toFixed(4)} mm3; ${G.grams(d).toFixed(2)} g`);
}
tp5.drawer.delete(); tp5.cover.delete();
const pr = G.coversForPrint(wasm, layouts[0][1]); const plate = Manifold.union(pr.map((p) => p.m)); const bb = plate.boundingBox();
console.log('shipped covers for print', pr.length, 'plate mm', ((bb.max[0] - bb.min[0]) / U).toFixed(0), 'x', ((bb.max[1] - bb.min[1]) / U).toFixed(0), 'total', G.grams(plate).toFixed(0), 'g');
fs.writeFileSync('out/covers/shipped_covers_print.stl', Buffer.from(G.toSTL(plate.getMesh())));
console.log('pulls', JSON.stringify(kinds));
console.log('labelled covers', labelled, 'of them L-shaped', legs, 'narrowest leg', minLeg === Infinity ? '-' : minLeg.toFixed(2), 'mm');
console.log('layouts', layouts.length, 'covers', covers, 'beads', beadsTotal, 'bad', bad);

assert.equal(bad, 0, bad + ' cover checks failed');
});
