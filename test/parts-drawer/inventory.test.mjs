import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G, I } from '../lib/parts-drawer-env.mjs';

// Ported from the generator's validation/t_inv.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup;
// the port collects what the script only printed (a kit that would not lay out, a tiling fault, a drawer in pieces) and fails on it.
test('parts drawer parts lists: parsing, Part Picker items, and every kit at four heights and both label sizes', async () => {
const issues = [];
// parsing
const lines = ['M3x10 SHCS 100', '100 M3 nuts', 'M3 x 10 button head, 50', 'washer M5 200', 'M4x20', 'M3 insert 80', 'M2.5x6 flat 30', 'M8 nyloc 25', 'set screw M4x6 20', 'M3 SHCS', 'bolts', 'M7x10 shcs'];
for (const l of lines) console.log(JSON.stringify(l), '->', JSON.stringify(I.parseLine(l)));
console.log('picker', JSON.stringify(I.fromPicker([{ schema: 'part-picker-label-item/1', family: 'screw', head: 'socket-cap', fields: ['M3', '× 12'] }, { schema: 'part-picker-label-item/1', family: 'nut', head: 'hex', fields: ['M4'] }])));
// layouts for each kit at both heights and label sizes
fs.rmSync('out/inv', { recursive: true, force: true }); fs.mkdirSync('out/inv', { recursive: true });
for (const [key, kit] of Object.entries(I.KITS)) for (const height of ['0.5H', '1H', '1.5H', '2H']) for (const label of ['large', 'small']) {
  const r = I.layoutFor(kit.items, { height, label });
  // a kit too long for a tall drawer is refused with its capacity (the reach rule, SPEC "Every size"): that is the documented answer, not a fault
  if (r.error) { console.log(key, height, label, 'ERROR', r.error); if (!/won't fit a (1\.5H|2H) drawer: to reach into/.test(r.error)) issues.push(`${key} ${height} ${label}: ${r.error}`); continue; }
  const lay = { v: 2, size: '240-2W', height, label, comps: r.comps };
  let tiling = 'ok'; try { G.checkTiling(lay); } catch (e) { tiling = e.message; }
  const holders = lay.comps.filter((c) => G.hasHolder(lay, c)).length;
  const m = G.buildDrawer(wasm, lay, assets);
  fs.writeFileSync(`out/inv/${key}_${height}_${label}.stl`, Buffer.from(G.toSTL(m.getMesh())));
  fs.writeFileSync(`out/inv/${key}_${height}_${label}.json`, JSON.stringify(lay));
  console.log(key.padEnd(10), height.padEnd(4), label.padEnd(5), 'items', kit.items.length, 'comps', r.comps.length, 'rows', r.rows, 'holders', holders, 'tiling', tiling,
    'fullest', (r.fullest * 100).toFixed(0) + '%', 'roomy x', r.roomy.toFixed(2), 'pieces', m.decompose().length);
  if (tiling !== 'ok' || m.decompose().length !== 1) issues.push(`${key} ${height} ${label}: tiling ${tiling}, ${m.decompose().length} pieces`);
  m.delete();
}

assert.deepEqual(issues, []);
});
