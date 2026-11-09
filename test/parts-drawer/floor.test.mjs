import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G } from '../lib/parts-drawer-env.mjs';

// Ported from the generator's validation/t_floor.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup.
test('parts drawer floors: the shipped 5x4 and its option variants, and 160 random layouts, each one solid', async () => {
// Floor-shape pass: parity of the v2 model with the shipped drawer, plus fuzz over scoop/tray options.
const S = G.SIZES['240-2W'];
const cells = (nc, nr) => { const r = []; for (let y = 0; y < nr; y++) for (let x = 0; x < nc; x++) r.push({ c0: x, c1: x, r0: y, r1: y, holder: true }); return r; };
fs.mkdirSync('out/floor', { recursive: true });
const rep = {};
const put = (name, lay) => {
  const t0 = performance.now(); const m = G.buildDrawer(wasm, lay, assets); const ms = performance.now() - t0;
  fs.writeFileSync(`out/floor/${name}.stl`, Buffer.from(G.toSTL(m.getMesh())));
  rep[name] = { ms: +ms.toFixed(1), status: m.status(), pieces: m.decompose().length, g: +G.grams(m).toFixed(1) };
  m.delete();
};
// v1 layouts through the v2 path: must match the shipped part exactly
put('shipped_05H', { size: '240-2W', height: '0.5H', cols: S.shipped.cols, rows: S.shipped.rows, regions: cells(5, 4) });
put('shipped_1H', { size: '240-2W', height: '1H', cols: S.shipped.cols, rows: S.shipped.rows, regions: cells(5, 4) });
put('L_shipped_05H', { size: '240-2W', height: '0.5H', label: 'large', cols: S.shipped.cols, rows: S.shipped.rows, regions: cells(5, 4) });
put('shipped_15H_L', { size: '240-2W', height: '1.5H', label: 'large', cols: S.shipped.cols, rows: S.shipped.rows, regions: cells(5, 4) });   // v23 tall drawers
put('shipped_2H_S', { size: '240-2W', height: '2H', label: 'small', cols: S.shipped.cols, rows: S.shipped.rows, regions: cells(5, 4) });
// option variants on the shipped grid
const variant = (height, label, props) => ({ v: 2, size: '240-2W', height, label, style: 'pyramid', comps: G.gridComps(S.shipped.cols, S.shipped.rows, props) });
put('tray_05H_L', variant('0.5H', 'large', { tray: true }));
put('tray12_05H_L', variant('0.5H', 'large', { tray: 12 }));
put('tray12_05H_S', variant('0.5H', 'small', { tray: 12 }));
put('tray9_1H_L', variant('1H', 'large', { tray: 9 }));
put('tray_1H_L', variant('1H', 'large', { tray: true }));
put('deep_05H_L', variant('0.5H', 'large', { scoop: 'deep' }));
put('deep_1H_S', variant('1H', 'small', { scoop: 'deep' }));
put('off_1H_L', variant('1H', 'large', { scoop: 'off' }));
put('deeptray_05H_L', variant('0.5H', 'large', { scoop: 'deep', tray: true }));
put('deeptray12_05H_L', variant('0.5H', 'large', { scoop: 'deep', tray: 12 }));
put('deeptray12_1H_S', variant('1H', 'small', { scoop: 'deep', tray: 12 }));
put('deeptray_1H_L', variant('1H', 'large', { scoop: 'deep', tray: true }));
put('even8x8_05H_L_deeptray', { v: 2, size: '240-2W', height: '0.5H', label: 'large', comps: G.evenGrid('240-2W', 8, 8, { scoop: 'deep', tray: true }) });
console.log(JSON.stringify(rep, null, 0));

// fuzz: random merged grids with random per-compartment options
function rand(seed) { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; }
// v24/v25: every case also picks a size (any length and width) and one of its heights from a second stream, so the layout
// stream is as it was; columns and rows are capped at what the size takes (G.maxGrid: a 59 has room for 3 rows).
function randomLayout(seed) {
  const R = rand(seed), RS = rand(seed * 31 + 7);
  const keys = Object.keys(G.SIZES), size = keys[Math.floor(RS() * keys.length)], SZ = G.SIZES[size], hs = Object.keys(SZ.heights), height = hs[Math.floor(RS() * hs.length)];
  const mg = G.maxGrid(size);   // v25: every width too; columns and rows as many as the size takes
  const nc = Math.min(mg.nc, 1 + Math.floor(R() * 10)), nr = Math.min(mg.nr, 1 + Math.floor(R() * 8));
  const own = Array.from({ length: nr }, () => Array(nc).fill(-1)); const regions = [];
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) if (own[r][c] < 0) {
    let w = Math.min(1 + Math.floor(R() * 4), nc - c), h = Math.min(1 + Math.floor(R() * 3), nr - r);
    for (let k = 0; k < w; k++) if (own[r][c + k] >= 0) { w = k; break; }
    for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) if (own[rr][cc] >= 0) { h = rr - r; break; }
    w = Math.max(1, w); h = Math.max(1, h);
    for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) own[rr][cc] = regions.length;
    regions.push({ c0: c, c1: c + w - 1, r0: r, r1: r + h - 1, holder: R() > 0.1 });
  }
  R(); const lay = G.toV2({ size, height, label: R() > 0.5 ? 'large' : 'small', style: 'pyramid', cols: G.uniform(SZ.W, nc), rows: G.uniform(SZ.D, nr), regions });
  for (const c of lay.comps) { const s = R(); c.scoop = s < 0.2 ? 'off' : s < 0.6 ? 'std' : 'deep'; const t = R(); c.tray = t < 0.35 ? 0 : t < 0.9 ? G.TRAYS[1 + Math.floor(R() * 4)] : Math.round(R() * 150) / 10; }
  return lay;
}
fs.mkdirSync('out/floorfuzz', { recursive: true }); const meta = []; let worst = 0;
for (let i = 0; i < 160; i++) {
  const lay = randomLayout(9000 + i * 7919);
  const t0 = performance.now(); const m = G.buildDrawer(wasm, lay, assets); worst = Math.max(worst, performance.now() - t0);
  fs.writeFileSync(`out/floorfuzz/${i}.stl`, Buffer.from(G.toSTL(m.getMesh())));
  meta.push({ i, size: lay.size, height: lay.height, comps: lay.comps.length, holders: lay.comps.filter((c) => G.hasHolder(lay, c)).length, trays: lay.comps.filter((c) => G.trayMM(c)).length, big: lay.comps.filter((c) => G.trayMM(c) >= 9).length,
    deep: lay.comps.filter((c) => c.scoop === 'deep').length, status: m.status(), pieces: m.decompose().length });
  m.delete();
}
fs.writeFileSync('out/floorfuzz/meta.json', JSON.stringify(meta));
const bad = meta.filter((m) => m.status !== 'NoError' || m.pieces !== 1);
console.log('fuzz', meta.length, 'layouts, comps', meta.reduce((a, m) => a + m.comps, 0), 'holders', meta.reduce((a, m) => a + m.holders, 0),
  'trays', meta.reduce((a, m) => a + m.trays, 0), 'of them 9+ mm', meta.reduce((a, m) => a + m.big, 0), 'deep', meta.reduce((a, m) => a + m.deep, 0), 'bad', bad.length, 'worst ms', worst.toFixed(1));
const per = {}, wid = {}; for (const m of meta) { per[`${m.size} ${m.height}`] = (per[`${m.size} ${m.height}`] || 0) + 1; const w = m.size.split('-')[1]; wid[w] = (wid[w] || 0) + 1; }
console.log('fuzz widths', JSON.stringify(wid), Object.keys(per).length, 'of', Object.values(G.SIZES).reduce((a, S) => a + Object.keys(S.heights).length, 0), 'size/height pairs'); if (bad.length) console.log('bad', JSON.stringify(bad.slice(0, 5)));

assert.deepEqual(Object.entries(rep).filter(([, r]) => r.status !== 'NoError' || r.pieces !== 1).map(([n, r]) => [n, r.status, r.pieces]), [], 'every named build is one clean solid');
assert.deepEqual(bad, [], 'every fuzzed layout is one clean solid');
});
