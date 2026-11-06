import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { G, I, fixture } from '../lib/parts-drawer-env.mjs';

// Ported from the generator's validation/t_kit.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup;
// the LDO list is a fixture.
test('parts drawer kits: the Voron 2.4 LDO Rev D list parses, splits and tiles three ways', async () => {
// v18 kit drawers: the vendor-list parser, the printer-hardware part types and the kit split, on the Voron 2.4 LDO Rev D
// list. Every line must parse, every part must be placed exactly once (or ship outside), every drawer must tile and
// stay under its fill limit, and the old fastener parsing must not change.
let bad = 0; const fail = (m) => { bad++; console.log('FAIL', m); };
const text = fs.readFileSync(fixture('ldo_revd.txt'), 'utf8');
const { items, errors, lines } = I.parseList(text);
if (errors.length) fail('parse errors ' + errors.join('; '));
if (items.length !== 53) fail(`expected 53 lines, got ${items.length}`);
if (items.reduce((a, it) => a + it.qty, 0) !== 1469) fail('piece count');
if (!items.every(I.known)) fail('unknown part');
const want = { 'Bearing, F695-2RS 20': ['bearing', 'F695-2RS', 0, 20], 'Pulley, 2GT, 20T, (5mm ID 9mm W) 4': ['pulley', '20T 9mm', 5, 4], 'Shaft, 5x60mm 4': ['shaft', '5', 60, 4],
  'T-nut, Roll-in, 2020, M5 80': ['tnut_roll', 'M5', 0, 80], 'Heatset Insert, Brass, M3x5x4 153': ['insert', 'M3', 4, 153], 'Precision Spacer, M5, 1mm 46': ['spacer', 'M5', 1, 46],
  '6x3mm Neodymium Magnet 16': ['magnet', '6', 3, 16], 'Machine Screw, BHCS, M3x6 14': ['bhcs', 'M3', 6, 14], 'Bondtech IDGA Gear Set 1': ['other', 'Bondtech IDGA Gear Set', 0, 1],
  'Teflon Tube (4mm OD 3mm ID) - 1.2m 1': ['tube', 'Teflon Tube (4mm OD 3mm ID) - 1.2m', 1200, 1] };
for (const [line, w] of Object.entries(want)) {
  const j = lines.indexOf(line); const it = items[j];
  if (!it || it.type !== w[0] || it.size !== w[1] || (it.length || 0) !== w[2] || it.qty !== w[3]) fail(`${line} -> ${JSON.stringify(it)}`);
}
// the old fastener lines parse exactly as before
const old = { 'M3x10 SHCS 100': { type: 'shcs', size: 'M3', length: 10, qty: 100 }, '100 M3 nuts': { type: 'nut', size: 'M3', length: 0, qty: 100 }, 'washer M5 200': { type: 'washer', size: 'M5', length: 0, qty: 200 },
  'M3 insert 80': { type: 'insert', size: 'M3', length: 0, qty: 80 }, 'set screw M4x6 20': { type: 'set', size: 'M4', length: 6, qty: 20 } };
for (const [l, w] of Object.entries(old)) if (JSON.stringify(I.parseLine(l)) !== JSON.stringify(w)) fail(`old line ${l} -> ${JSON.stringify(I.parseLine(l))}`);
for (const l of ['bolts', 'M7x10 shcs', 'M3 SHCS']) if (!I.parseLine(l).error) fail(`old error line ${l}`);
// the split, three ways
const key = (it) => `${it.type}|${it.size}|${it.length || 0}|${it.qty}`;
for (const heights of [['0.5H', '1H'], ['0.5H'], ['1H']]) {
  const k = I.kitDrawers(items, { heights });
  const seen = new Map();
  k.drawers.forEach((d, i) => {
    const L = { v: 2, size: '240-2W', height: d.height, label: 'large', comps: d.layout.comps };
    try { G.checkTiling(L); } catch (e) { fail(`${heights} drawer ${i + 1} tiling ${e.message}`); }
    if (d.layout.load > 1 + 1e-9) fail(`${heights} drawer ${i + 1} load ${d.layout.load}`);
    for (const c of d.layout.comps) { const kk = key(c.item); if (seen.has(kk)) fail(`placed twice ${kk}`); seen.set(kk, i); }
  });
  for (const it of items) if (!seen.has(key(it)) && !k.outside.some((o) => o.item === it)) fail(`${heights} not placed ${key(it)}`);
  console.log(heights.join('+').padEnd(8), `${k.drawers.length} drawers, ${k.units / 2}H:`, k.drawers.map((d) => `${d.height} ${(d.layout.load * 100).toFixed(0)}%`).join(', '), '| outside', k.outside.length);
}
console.log(bad ? `${bad} FAILED` : 'kit tests pass');

assert.equal(bad, 0, bad + ' kit checks failed');
});
