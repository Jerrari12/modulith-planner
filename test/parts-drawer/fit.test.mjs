import { test } from 'node:test';
import assert from 'node:assert/strict';
import { I } from '../lib/parts-drawer-env.mjs';
import { cleanPartsLayout, PARTS_FIT_CAPS } from '../../js/rules/schema.js';

// The parts list's room knobs and order (DECISIONS 2026-11-07): the list's order, the fill cap, the next-bag rounding and the
// spare row at the back, and how a layout remembers them.
const shcs = (size, length, qty) => ({ type: 'shcs', size, length, qty });
const list = () => [shcs('M3', 8, 200), shcs('M3', 65, 20), ...[10, 12, 14, 16, 18, 20, 25, 30].map((L) => shcs('M3', L, 20))];
const items = (r) => r.comps.filter((c) => c.item).map((c) => I.labelText(c.item));

test('parts list fit: the defaults lay out as before, and order: list keeps the list\'s order', () => {
  const before = I.layoutFor(list(), { height: '0.5H' });
  assert.equal(before.spare, 0);
  assert.deepEqual(items(before), items(I.layoutFor(list(), { height: '0.5H', order: 'type' })));
  const asis = I.layoutFor(list(), { height: '0.5H', order: 'list' });
  assert.deepEqual(items(asis), list().map(I.labelText), 'front-left to back-right in the list\'s order');
  assert.notDeepEqual(items(asis), items(before), 'which differs from type order (the 65 comes second)');
});

test('parts list fit: bagUp rounds to the next bag, and roundTo sizes for it while the compartments keep the count', () => {
  assert.deepEqual([0, 1, 25, 26, 37, 100, 101, 500, 501, 1200].map(I.bagUp), [0, 25, 25, 50, 50, 100, 200, 500, 1000, 1500]);
  const one = [shcs('M3', 8, 37)];
  const a = I.layoutFor(one, { height: '0.5H' }), b = I.layoutFor(one, { height: '0.5H', roundTo: 'bag' });
  assert.equal(b.comps[0].item.qty, 37, 'the counted quantity stays on the compartment');
  // one part fills the drawer either way, so compare the room the engine asked for through fillOf: the sized pile is bigger
  assert.ok(I.fillOf(a.comps[0], '0.5H') > 0 && Math.abs(I.fillOf(a.comps[0], '0.5H') - I.fillOf(b.comps[0], '0.5H')) < 1e-9, 'fillOf reads the counted quantity in both');
  // two piles in one row share its width by volume: 37 and 100 counted, 50 and 100 sized for, so the wall between them moves
  const pair = [shcs('M3', 8, 37), shcs('M3', 8, 100)];
  const c = I.layoutFor(pair, { height: '0.5H' }), d = I.layoutFor(pair, { height: '0.5H', roundTo: 'bag' });
  const area = (k) => (k.x1 - k.x0) * (k.y1 - k.y0);
  assert.ok(area(d.comps[0]) > area(c.comps[0]) * 1.1, `sized for 50, the first compartment is bigger: ${area(c.comps[0]).toFixed(0)} -> ${area(d.comps[0]).toFixed(0)} mm2`);
  assert.deepEqual(d.comps.map((k) => k.item.qty), [37, 100]);
});

test('parts list fit: the spare row is the layout one row shorter, kept only when that still fits under the cap', () => {
  const r = I.layoutFor(list(), { height: '0.5H', spareRow: true, fillCap: 0.75 });
  assert.equal(r.spare, 5, 'five holder-wide compartments on the 240-2W');
  const spare = r.comps.filter((c) => !c.item);
  assert.equal(spare.length, 5);
  assert.ok(spare.every((c) => c.holder === true && Math.abs(c.y1 - 226) < 1e-6), 'at the back, with holders');
  assert.ok(spare.every((c) => c.y1 - c.y0 >= 26.5 - 1e-6), 'at least the holder\'s minimum depth');
  assert.equal(r.rows, I.layoutFor(list(), { height: '0.5H', spareRow: true, fillCap: 0.75, labels: true }).rows);
  assert.ok(r.load <= 1 + 1e-9, 'the parts still fit under the cap');
  // too full for the room chosen: no spare row, the layout is the plain one
  const tight = I.layoutFor(list(), { height: '0.5H', spareRow: true, fillCap: 0.5 });
  assert.equal(tight.spare, 0);
  assert.deepEqual(tight.comps.map((c) => [c.x0, c.x1, c.y0, c.y1]), I.layoutFor(list(), { height: '0.5H', fillCap: 0.5 }).comps.map((c) => [c.x0, c.x1, c.y0, c.y1]));
  assert.ok(tight.load > 1, 'and the summary will say so');
  // without label holders the spare compartments are plain cells
  const plain = I.layoutFor(list().slice(0, 4), { height: '0.5H', spareRow: true, labels: false });
  assert.ok(plain.spare > 5, 'narrower cells, more of them');
  assert.ok(plain.comps.filter((c) => !c.item).every((c) => c.holder === false));
});

test('parts list fit: the layout record keeps the fit, cleaned', () => {
  assert.deepEqual(PARTS_FIT_CAPS, [1, 0.75, 0.5]);
  const comps = [{ x0: 0, x1: 50, y0: 0, y1: 50 }];
  assert.equal(cleanPartsLayout({ comps }).fit, undefined, 'none unless given');
  assert.deepEqual(cleanPartsLayout({ comps, fit: { cap: 0.5, round: true, spare: false } }).fit, { cap: 0.5, round: true, spare: false });
  assert.deepEqual(cleanPartsLayout({ comps, fit: { cap: 0.63, round: 'yes', spare: 1 } }).fit, { cap: 0.75, round: false, spare: true }, 'an unknown cap is the default, the flags are booleans');
  assert.equal(cleanPartsLayout({ comps, fit: 'tight' }), null, 'not an object: the layout is refused');
});
