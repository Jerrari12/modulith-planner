/* M2 (2026-11-05): a planner unit as a parts drawer, js/parts-drawer/unit.js - the size and height a unit maps to, which
   sizes exist, the default and cleaned layouts, and a layout moved to another size (the prototype's setSize rule). Pure:
   no engine, no DOM. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../js/parts-drawer/gen.js';
import { sizeOfUnit, heightOfUnit, partsSizeOk, isPartsDrawer, partsSizeWhy, defaultLayout, cleanLayout, layoutOf, layoutForSize, fullLayout, geomKey } from '../../js/parts-drawer/unit.js';

const decor = (w, hh, more = {}) => ({ id: 1, x: 0, y: 0, w, hh, fill: 'decor', shelves: 0, ...more });

test('a unit maps to the generator\'s size and height, and only the sizes the generator makes are parts drawers', () => {
  assert.equal(sizeOfUnit(240, decor(2, 2)), '240-2W');
  assert.equal(heightOfUnit(decor(2, 1)), '0.5H'); assert.equal(heightOfUnit(decor(2, 3)), '1.5H'); assert.equal(heightOfUnit(decor(2, 6)), null);
  assert.ok(partsSizeOk(240, decor(2, 2)) && partsSizeOk(270, decor(4, 4)) && partsSizeOk(59, decor(2, 2)));
  assert.ok(!partsSizeOk(240, decor(2, 6)), 'no 3H');
  assert.ok(!partsSizeOk(59, decor(3, 2)) && !partsSizeOk(59, decor(2, 3)), 'the 59 is 1W-2W at 0.5H and 1H');
  assert.ok(!partsSizeOk(240, { ...decor(2, 2), fill: 'classic' }), 'a Decor drawer only');
  assert.ok(isPartsDrawer(240, decor(2, 2, { variant: 'parts' })) && !isPartsDrawer(240, decor(2, 2)) && !isPartsDrawer(240, decor(2, 2, { variant: 'gridfinity' })));
  assert.ok(!isPartsDrawer(240, decor(2, 6, { variant: 'parts' })), 'a variant kept on a 3H renders the standard drawer');
  assert.equal(partsSizeWhy(240, 2, 1), null); assert.match(partsSizeWhy(240, 2, 3), /0\.5H to 2H/); assert.match(partsSizeWhy(59, 3, 1), /1W and 2W/); assert.match(partsSizeWhy(59, 2, 1.5), /0\.5H and 1H/);
});

test('the default layout is the shipped 5x4 at 240-2W and tiles every size; a layout is cleaned against its size', () => {
  const d = defaultLayout('240-2W');
  assert.equal(d.comps.length, 20); assert.equal(d.nc, 5); assert.equal(d.nr, 4); assert.equal(d.label, 'large');
  assert.deepEqual(d.comps.slice(0, 2).map((c) => [c.x0, c.x1, c.y0, c.y1]), [[0, 30.6, 0, 56], [32.1, 62.7, 0, 56]]);
  for (const size of Object.keys(G.SIZES)) G.checkTiling({ ...defaultLayout(size), size, height: '1H' });   // throws if not
  assert.equal(cleanLayout(null, '240-2W'), null);
  assert.equal(cleanLayout(d, '270-2W'), null, 'the 240 grid does not tile a 270');
  const c = cleanLayout({ ...d, label: 'small', floor: { mode: 'paint', slots: 4 }, comps: d.comps.map((k, i) => ({ ...k, tray: 6, color: 9, scoop: i ? 'deep' : 'bogus', item: { type: 'shcs' } })) }, '240-2W');
  assert.equal(c.label, 'small'); assert.deepEqual(c.floor, { mode: 'paint', slots: 4 });
  assert.equal(c.comps[0].scoop, 'std'); assert.equal(c.comps[1].scoop, 'deep'); assert.equal(c.comps[0].tray, 6); assert.equal(c.comps[0].color, 4, 'the colour is clamped to the palette');
  assert.ok(!('item' in c.comps[0]), 'M2 keeps no parts');
  assert.equal(cleanLayout({ ...d, label: 'huge' }, '240-2W'), null);
  const u = decor(2, 2, { variant: 'parts', partsLayout: d });
  assert.equal(layoutOf(240, u).comps.length, 20);
  assert.equal(layoutOf(240, { ...u, w: 3 }).comps.length, defaultLayout('240-3W').comps.length, 'a layout that no longer fits gives way to the default grid');
});

test('a layout moved to another size keeps its walls in proportion, or starts over when a label would not fit', () => {
  const d = defaultLayout('240-2W');
  const to270 = layoutForSize(d, '240-2W', '270-2W');
  assert.equal(to270.note, ''); assert.equal(to270.layout.comps.length, 20);
  G.checkTiling({ ...to270.layout, size: '270-2W', height: '1H' });
  assert.ok(to270.layout.comps.every((c) => c.y1 <= 256 + 1e-6));
  // to a 1W the five 30.6 columns would be 13 mm wide: too narrow for their labels, so the grid starts over (2 columns)
  const to1W = layoutForSize(d, '240-2W', '240-1W');
  assert.match(to1W.note, /started over/); assert.equal(to1W.layout.nc, 2);
  G.checkTiling({ ...to1W.layout, size: '240-1W', height: '1H' });
  // the most common scoop and ramp carry over when the grid starts over
  const deep = { ...d, comps: d.comps.map((c) => ({ ...c, scoop: 'deep', tray: 9 })) };
  const again = layoutForSize(deep, '240-2W', '240-1W');
  assert.ok(again.layout.comps.every((c) => c.scoop === 'deep' && c.tray === 9));
  assert.deepEqual(layoutForSize(d, '240-2W', '240-2W').layout, d);
});

test('the full layout carries the unit\'s size, height and the floor colours; the geometry key ignores colour', () => {
  const u = decor(2, 1, { variant: 'parts' });
  const f = fullLayout(240, u);
  assert.equal(f.size, '240-2W'); assert.equal(f.height, '0.5H'); assert.deepEqual(f.floor, { mode: 'off', colors: [] });
  const lay = { ...defaultLayout('240-2W'), floor: { mode: 'paint', slots: 3 } };
  assert.deepEqual(fullLayout(240, u, lay, ['#111111', '#222222', '#333333', '#444444']).floor, { mode: 'paint', colors: ['#111111', '#222222', '#333333'] });
  assert.deepEqual(fullLayout(240, u, { ...lay, floor: { mode: 'one', slots: 3 } }, ['#111111', '#222222']).floor, { mode: 'one', colors: ['#111111'] });
  const a = geomKey(fullLayout(240, u, lay)), b = geomKey(fullLayout(240, u, { ...lay, comps: lay.comps.map((c) => ({ ...c, color: 2 })) }));
  assert.equal(a, b);
  assert.notEqual(a, geomKey(fullLayout(240, u, { ...lay, comps: lay.comps.map((c) => ({ ...c, tray: 3 })) })));
});
