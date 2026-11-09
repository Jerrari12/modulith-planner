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

/* a part's material from a typed line and from the Part Picker's printed attributes (2026-11-09) */
import { parseLine as pl2, fromPicker as fp2, matFromWords, MATERIALS as M2 } from '../../js/parts-drawer/inventory.js';
import { PARTS_MATS } from '../../js/rules/schema.js';
test('the material is read from a typed line and from the Picker, and the schema keeps the same keys', () => {
  assert.equal(pl2('M3x10 stainless SHCS 50').mat, 'stainless');
  assert.equal(pl2('50 M3 brass insert').mat, 'brass');
  assert.equal(pl2('M3x8 black oxide BHCS 100').mat, 'black-oxide');
  assert.equal(pl2('M4 nut zinc 20').mat, 'zinc');
  assert.equal(pl2('M5 A2 nyloc 10').mat, 'stainless');
  assert.equal(pl2('M5 nylon lock nut 10').mat, undefined, 'the nylon of a lock nut is its ring');
  assert.equal(pl2('50 M3 insert').mat, undefined, 'no word, no material: the type default shows');
  assert.equal(matFromWords('insert', 'zinc'), null, 'an insert offers brass and stainless only');
  const pick = (base, finish) => fp2([{ schema: 'part-picker-label-item/1', family: 'screw', head: 'socket-cap', fields: ['M3 × 10'], qty: 20,
    attributes: [base && { path: 'material.base', text: base }, finish && { path: 'material.finish', text: finish }].filter(Boolean) }]).items[0];
  assert.equal(pick('STEEL', 'BLK OX').mat, 'black-oxide', 'a finish outranks plain steel');
  assert.equal(pick('BRASS', 'NICKEL').mat, 'brass', 'a brass base outranks its plating');
  assert.equal(pick('A2').mat, 'stainless');
  assert.equal(pick().mat, undefined);
  assert.equal(fp2([{ schema: 'part-picker-label-item/1', family: 'insert', head: 'heat-set', fields: ['M3'], qty: 50, attributes: [{ path: 'material.base', text: 'BRASS' }] }]).items[0].mat, 'brass');
  assert.deepEqual(PARTS_MATS, Object.keys(M2), 'js/rules/schema.js keeps the same material keys');
});

/* the contents preview's part form (2026-11-09): every list type and size has one, from the estimator's own tables; a colour per material */
import { partForm, MAT_HEX, TYPE_ORDER as TO2, THREADS as TH2, known as kn2, MATERIALS as M3 } from '../../js/parts-drawer/inventory.js';
test('every list part has a form with real dimensions, and every material a colour', () => {
  for (const type of TO2) for (const size of TH2) {
    const it = { type, size, length: 12, qty: 1 }; if (!kn2(it)) continue;
    const f = partForm(it);
    assert.ok(f, `${type} ${size} has a form`);
    for (const [k, v] of Object.entries(f)) if (typeof v === 'number') assert.ok(Number.isFinite(v) && v >= 0, `${type} ${size} ${k}`);
  }
  assert.deepEqual(partForm({ type: 'nut', size: 'M3', length: 0, qty: 1 }), { kind: 'nut', d: 3, s: 5.5, m: 2.4 }, 'an M3 nut: 5.5 across flats, 2.4 high');
  assert.deepEqual(partForm({ type: 'shcs', size: 'M12', length: 35, qty: 1 }), { kind: 'screw', head: 'socket', d: 12, L: 35, dk: 18, k: 12 });
  assert.equal(partForm({ type: 'bearing', size: '625', length: 0, qty: 1 }), null, 'a part the list does not take');
  const fh = partForm({ type: 'fhcs', size: 'M3', length: 10, qty: 1 });
  assert.ok(Math.abs(fh.k + fh.L - 10) < 1e-9, 'a countersunk screw’s 10 mm includes its head (Sol 01a1c100)');
  const sh = partForm({ type: 'shcs', size: 'M3', length: 10, qty: 1 });
  assert.equal(sh.L, 10, 'a socket head’s 10 mm is the shank');
  assert.deepEqual(Object.keys(MAT_HEX).sort(), Object.keys(M3).sort());
});

