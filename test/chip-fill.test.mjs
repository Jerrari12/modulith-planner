/* THE CHIPS IN A CHIP DRAWER (2026-11-09): js/chip-fill.js's pure half - which chips, in what order, and where they stand. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipFillGroups, chipFillLayout, slotZ, hexHsl, CHIP_INSET, CHIP_FIRST, CHIP_MATERIALS } from '../js/chip-fill.js';
import { CHIPS } from '../js/generate.js';

const mat = (e) => e.mat || null;

test('one chip per filament: the same filament twice is one chip, by name, else by colour', () => {
  const g = chipFillGroups([
    { hex: '#ff0000', name: 'Red' }, { hex: '#ff0000', name: 'Red' }, { hex: '#ee0000', name: 'Red' },
    { hex: '#00ff00', name: null }, { hex: '#00ff00', name: null }, { hex: '#00ff00', name: 'Green' },
  ]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].chips.map((c) => c.name || c.hex), ['Red', '#00ff00', 'Green']);
  assert.equal(g[0].chips.length, 3, 'Red once, the unnamed green once, the named Green once');
  // an unnamed colour in two materials is two chips (Sol 01a1c166: a bare TPU foot in a PLA part's colour)
  const two = chipFillGroups([{ hex: '#111111', mat: 'PLA' }, { hex: '#111111', mat: 'TPU' }], mat);
  assert.deepEqual(two.map((x) => [x.material, x.chips.length]), [['PLA', 1], ['TPU', 1]]);
});

test('groups by material in the planner\'s order, PLA when nothing says; coloured by hue, then greys light to dark', () => {
  const g = chipFillGroups([
    { hex: '#202020', name: 'TPU Black', mat: 'TPU' },
    { hex: '#3050ff', name: 'Blue' }, { hex: '#ff3020', name: 'Red' }, { hex: '#ffffff', name: 'White' },
    { hex: '#111111', name: 'Black' }, { hex: '#30d040', name: 'Green' }, { hex: '#ffcc00', name: 'PETG Yellow', mat: 'PETG' },
  ], mat);
  assert.deepEqual(g.map((x) => x.material), ['PLA', 'PETG', 'TPU']);
  assert.deepEqual(g[0].chips.map((c) => c.name), ['Red', 'Green', 'Blue', 'White', 'Black']);
  assert.ok(CHIP_MATERIALS.every((m, i, a) => i === 0 || a.indexOf(m) > a.indexOf(a[i - 1])));
});

test('every run of chips follows its material\'s title piece; a title takes two slots and never stands alone', () => {
  const groups = [{ material: 'PLA', chips: Array.from({ length: 9 }, (_, i) => ({ hex: '#' + String(i).repeat(6) })) },
    { material: 'TPU', chips: [{ hex: '#222222' }] }];
  const { lanes, dropped } = chipFillLayout(groups, 8);   // the 59: eight slots a lane
  assert.deepEqual(lanes[0].map((x) => [x.kind, x.slot]),
    [['title', 0], ['chip', 2], ['chip', 3], ['chip', 4], ['chip', 5], ['chip', 6], ['chip', 7]]);
  assert.deepEqual(lanes[1].map((x) => [x.kind, x.slot, x.material]),
    [['title', 0, 'PLA'], ['chip', 2, 'PLA'], ['chip', 3, 'PLA'], ['chip', 4, 'PLA'], ['title', 5, 'TPU'], ['chip', 7, 'TPU']]);
  assert.equal(dropped, 0);
  for (const seq of lanes) {
    for (let i = 0; i < seq.length; i++) if (seq[i].kind === 'title') assert.equal(seq[i + 1]?.kind, 'chip', 'a title has a chip behind it');
    const used = seq.flatMap((x) => (x.kind === 'title' ? [x.slot, x.slot + 1] : [x.slot]));
    assert.equal(new Set(used).size, used.length, 'no slot holds two things');
    assert.ok(used.every((k) => k >= 0 && k < 8));
  }
});

test('while they fit whole, the materials share the lanes: each starts in the emptier one', () => {
  const groups = [{ material: 'PLA', chips: [{ hex: '#ff0000' }, { hex: '#00ff00' }, { hex: '#0000ff' }] },
    { material: 'PETG', chips: [{ hex: '#ffaa00' }] }, { material: 'TPU', chips: [{ hex: '#111111' }] }];
  // Joey 2026-11-09: "maybe spread them out a little, move petg and tpu to the right side?" - a slot between pieces when it fits
  const { lanes, dropped } = chipFillLayout(groups, CHIPS.slotsPerLane[240]);
  assert.deepEqual(lanes[0].map((x) => [x.kind, x.slot, x.material]),
    [['title', 0, 'PLA'], ['chip', 3, 'PLA'], ['chip', 5, 'PLA'], ['chip', 7, 'PLA']]);
  assert.deepEqual(lanes[1].map((x) => [x.kind, x.slot, x.material]),
    [['title', 0, 'PETG'], ['chip', 3, 'PETG'], ['title', 5, 'TPU'], ['chip', 8, 'TPU']], 'PETG then TPU on the right: the emptier lane each time');
  assert.equal(dropped, 0);
  const tight = chipFillLayout(groups, CHIPS.slotsPerLane[240], 2, 0);
  assert.deepEqual(tight.lanes[1].map((x) => x.slot), [0, 2, 3, 5], 'packed, the same order with no gaps');
});

test('any build: no slot holds two pieces, nothing runs past the comb, spread only when nothing is dropped', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let t = 0; t < 400; t++) {
    const L = CHIPS.lengths[rnd(6)], slots = CHIPS.slotsPerLane[L];
    const groups = ['PLA', 'PETG', 'TPU'].slice(0, 1 + rnd(3)).map((m) => ({ material: m, chips: Array.from({ length: rnd(40) + 1 }, (_, i) => ({ hex: '#' + (i * 997 % 4096).toString(16).padStart(6, '0') })) }));
    const r = chipFillLayout(groups, slots);
    const total = groups.reduce((s, g) => s + g.chips.length, 0);
    assert.equal(r.lanes.flat().filter((x) => x.kind === 'chip').length + r.dropped, total, 'every chip placed or counted');
    if (r.dropped) assert.deepEqual(r, chipFillLayout(groups, slots, 2, 0), 'a crowded drawer packs tight');
    for (const seq of r.lanes) {
      const usedSlots = seq.flatMap((x) => (x.kind === 'title' ? [x.slot, x.slot + 1] : [x.slot]));
      assert.equal(new Set(usedSlots).size, usedSlots.length, `${L}: two pieces in one slot`);
      assert.ok(usedSlots.every((k) => k >= 0 && k < slots), `${L}: past the comb`);
      for (let i = 0; i < seq.length; i++) if (seq[i].kind === 'title') assert.equal(seq[i + 1]?.kind, 'chip', 'a title has a chip behind it');
    }
  }
});

test('what does not fit is counted, never squeezed in', () => {
  const groups = [{ material: 'PLA', chips: Array.from({ length: 20 }, (_, i) => ({ hex: '#0000' + String(i).padStart(2, '0') })) }];
  const { lanes, dropped } = chipFillLayout(groups, 8);
  const placed = lanes.flat().filter((x) => x.kind === 'chip').length;
  assert.equal(placed, 12, 'six a lane behind a title');
  assert.equal(dropped, 8);
});

test('the slots are the release\'s comb: the first a fixed distance behind the front, then a pitch apart', () => {
  for (const L of CHIPS.lengths) {
    const p = CHIPS.pitch[L];
    assert.equal(slotZ(97.5, 'Classic', p, 0), 97.5 - CHIP_INSET.Classic - CHIP_FIRST);
    assert.ok(Math.abs(slotZ(89.65, 'Decor', p, 3) - (89.65 - 4.3 - 7.125 - 3 * p)) < 1e-9);
    // the last slot's chip (1.75 thick) still inside the Classic body of its length (the site registry's print depths)
    const DEPTH = { 59: 69, 115: 125, 165: 175, 185: 195, 240: 250, 270: 280 };
    assert.ok(CHIP_INSET.Classic + CHIP_FIRST + (CHIPS.slotsPerLane[L] - 1) * p + 0.875 < DEPTH[L], `${L}: the comb fits its drawer`);
  }
  assert.deepEqual(hexHsl('#ff0000').map((v) => Math.round(v * 100) / 100), [0, 1, 0.5]);
});
