import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G } from '../lib/parts-drawer-env.mjs';

// Ported from the generator's validation/t_walls.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup.
test('parts drawer walls: 150 random editing sessions through the page functions, each layout one solid', async () => {
// Draggable walls: random edit sessions (wall moves, whole-line moves, merges, splits, resizes) on the shared
// gen.js helpers, then every result must tile the cavity and build as one clean solid.
const HW = G.C.WALL / 2;   // v24: each session picks a size and one of its heights from a second stream
function rand(seed) { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; }
const inside = (k, r) => k.x0 >= r.x0 - 1e-6 && k.x1 <= r.x1 + 1e-6 && k.y0 >= r.y0 - 1e-6 && k.y1 <= r.y1 + 1e-6;
const overlaps = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;
const bbox = (l) => ({ x0: Math.min(...l.map((c) => c.x0)), x1: Math.max(...l.map((c) => c.x1)), y0: Math.min(...l.map((c) => c.y0)), y1: Math.max(...l.map((c) => c.y1)) });
function closure(comps, r) { for (let g = true; g;) { g = false; for (const c of comps) if (overlaps(c, r) && !inside(c, r)) { r = bbox([r, c]); g = true; } } return r; }
function session(seed) {
  const R = rand(seed), RS = rand(seed * 31 + 7);
  const keys = Object.keys(G.SIZES), SIZE = keys[Math.floor(RS() * keys.length)], { W, D } = G.SIZES[SIZE], hs = Object.keys(G.SIZES[SIZE].heights);
  const mg = G.maxGrid(SIZE); R();   // v25: every width too
  const lay = { v: 2, size: SIZE, height: hs[Math.floor(RS() * hs.length)], label: R() > 0.5 ? 'large' : 'small', style: 'pyramid', comps: G.evenGrid(SIZE, Math.min(mg.nc, 1 + Math.floor(R() * 8)), Math.min(mg.nr, 1 + Math.floor(R() * 7))) };
  const ops = { move: 0, line: 0, merge: 0, split: 0, resize: 0 };
  for (let n = 0; n < 24; n++) {
    const r = R(), comps = lay.comps, i = Math.floor(R() * comps.length), k = comps[i];
    if (r < 0.45) {                                   // drag one wall segment, or the whole line
      const orient = R() > 0.5 ? 'v' : 'h', a = orient === 'v' ? 'x' : 'y', far = orient === 'v' ? W : D;
      if (k[a + '1'] >= far - 1e-6) continue;
      const whole = R() > 0.7, ch = G.wallChain(comps, orient, k[a + '1'] + HW, i, whole);
      if (!ch || ch.range[0] > ch.range[1]) continue;
      let c = ch.range[0] + R() * (ch.range[1] - ch.range[0]);
      if (R() > 0.5) c = Math.round(c * 2) / 2; if (R() > 0.85) c = k[a + '0'] + G.C.HOLDER_W + HW + (R() - 0.5) * 6;   // land near the label-fit width
      c = Math.min(ch.range[1], Math.max(ch.range[0], c));
      lay.comps = G.moveChain(comps, ch, c); ops[whole ? 'line' : 'move']++;
    } else if (r < 0.65) {                            // merge with a neighbour
      const j = Math.floor(R() * comps.length); const box = G.closeBox(comps, G.boxOf([k, comps[j]]));
      const sel = comps.filter((c) => G.inBox(c, box)); if (sel.length < 2 || sel.length > 6) continue;
      lay.comps = comps.filter((c) => !G.inBox(c, box)).concat([G.comp(box.x0, box.x1, box.y0, box.y1, { holder: R() > 0.15 })]); ops.merge++;
    } else if (r < 0.82) {                            // split in two along the long side
      const w = k.x1 - k.x0, d = k.y1 - k.y0, alongX = w >= d, len = alongX ? w : d;
      if ((len - G.C.WALL) / 2 < G.C.MIN_CELL) continue;
      const [[a0, a1], [b0, b1]] = G.spans(G.uniform(len, 2)); const p = { holder: k.holder };
      const parts = alongX ? [G.comp(k.x0 + a0, k.x0 + a1, k.y0, k.y1, p), G.comp(k.x0 + b0, k.x0 + b1, k.y0, k.y1, p)] : [G.comp(k.x0, k.x1, k.y0 + a0, k.y0 + a1, p), G.comp(k.x0, k.x1, k.y0 + b0, k.y0 + b1, p)];
      lay.comps = comps.slice(0, i).concat(parts, comps.slice(i + 1)); ops.split++;
    } else {                                          // type a size
      const dim = R() > 0.5 ? 'w' : 'd'; const v = R() > 0.6 ? (dim === 'w' ? G.C.HOLDER_W : G.holderOf(lay).MIN_DEPTH) : 12 + R() * 60;
      const res = G.resizeComp(lay, i, dim, v); if (res.comps) { lay.comps = res.comps; ops.resize++; }
    }
    G.checkTiling(lay);
  }
  for (const c of lay.comps) { const s = R(); c.scoop = s < 0.2 ? 'off' : s < 0.7 ? 'std' : 'deep'; c.tray = R() > 0.6; }
  return { lay, ops };
}
fs.rmSync('out/walls', { recursive: true, force: true }); fs.mkdirSync('out/walls', { recursive: true });
const meta = []; let worst = 0; const tot = { move: 0, line: 0, merge: 0, split: 0, resize: 0 };
for (let s = 0; s < 150; s++) {
  const { lay, ops } = session(20000 + s * 7919);
  for (const k in ops) tot[k] += ops[k];
  const t0 = performance.now(); const m = G.buildDrawer(wasm, lay, assets); worst = Math.max(worst, performance.now() - t0);
  fs.writeFileSync(`out/walls/${s}.stl`, Buffer.from(G.toSTL(m.getMesh())));
  fs.writeFileSync(`out/walls/${s}.json`, JSON.stringify(lay));
  const holders = lay.comps.filter((c) => G.hasHolder(lay, c));
  const near = holders.filter((c) => c.x1 - c.x0 > G.C.HOLDER_W + 1e-6 && c.x1 - c.x0 < G.C.HOLDER_W + G.C.END_FILL).length;
  meta.push({ s, size: lay.size, height: lay.height, comps: lay.comps.length, holders: holders.length, near, status: m.status(), pieces: m.decompose().length });
  m.delete();
}
const bad = meta.filter((m) => m.status !== 'NoError' || m.pieces !== 1);
console.log('sessions', meta.length, 'ops', JSON.stringify(tot), 'comps', meta.reduce((a, m) => a + m.comps, 0), 'holders', meta.reduce((a, m) => a + m.holders, 0),
  'end-fill holders', meta.reduce((a, m) => a + m.near, 0), 'bad', bad.length, 'worst ms', worst.toFixed(0));
const per = {}, wid = {}; for (const m of meta) { const k = `${m.size} ${m.height}`; per[k] = (per[k] || 0) + 1; const w = m.size.split('-')[1]; wid[w] = (wid[w] || 0) + 1; }
console.log('sessions per width', JSON.stringify(wid), Object.keys(per).length, 'of', Object.values(G.SIZES).reduce((a, S) => a + Object.keys(S.heights).length, 0), 'size/height pairs'); if (bad.length) console.log('bad', JSON.stringify(bad.slice(0, 5)));

assert.deepEqual(bad, [], 'every edited layout is one clean solid');
});
