/* The bin grid (js/parts-drawer/bins.js, 2026-11-09): the grid per drawer, a part's recommended bin, the first free spot,
   the spare rectangles, the compartments tiling the drawer, and a laid-out drawer read back as its bins. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../js/parts-drawer/gen.js';
import * as B from '../../js/parts-drawer/bins.js';

const it = (type, size, length, qty) => ({ type, size, length, qty });

test('the grid: a cell is the shipped compartment, room for a finger and its label; coarser where a tall drawer needs reach', () => {
  const g = B.binGrid('240-2W', '1H');
  assert.deepEqual([g.nc, g.nr], [5, 4], 'the shipped 5 x 4');
  assert.ok(g.cells.every((c) => c.y1 - c.y0 > 50), 'about 55 mm deep, not the 26.9 a label alone allows (Joey: no room for a finger)');
  assert.ok(g.cells.every((c) => c.x1 - c.x0 >= G.C.HOLDER_W - 1e-6), 'every cell takes a label holder');
  assert.deepEqual([B.binGrid('115-1W', '1.5H').nc, B.binGrid('115-1W', '1.5H').nr], [1, 2], 'a 115-1W 1.5H has two reach-safe positions');
  assert.deepEqual(B.cellAt(g, { x: 1, y: 1 }), { c: 0, r: 0 });
  assert.deepEqual(B.cellAt(g, { x: 158, y: 225 }), { c: 4, r: 3 });
  assert.equal(B.cellAt(g, { x: 400, y: 10 }), null, 'off the drawer');
});

test('a part’s recommended bin: the fewest cells that hold it, its longest piece lying in it', () => {
  const g = B.binGrid('240-2W', '1H');
  assert.deepEqual(B.binSize(it('insert', 'M3', 0, 50), g, { fillCap: 0.75 }), { w: 1, h: 1 }, '50 inserts take one cell');
  const big = B.binSize(it('shcs', 'M12', 35, 50), g, { fillCap: 0.75 });
  assert.ok(big.w * big.h > 1, `50 M12 x 35 need more than a cell: ${JSON.stringify(big)}`);
  const long = B.binSize(it('shcs', 'M3', 65, 20), g, { fillCap: 0.75 });
  const r = B.rectOf(g, { c: 0, r: 0, ...long });
  assert.ok(r.x1 - r.x0 >= 68 || r.y1 - r.y0 >= 68, `a 65 mm screw lies in its bin: ${JSON.stringify(long)}`);
  assert.match(B.binSize(it('shcs', 'M12', 35, 5000), g, { fillCap: 0.75 }).why, /more room than this whole drawer/);
});

test('placing: the first free spot from the front-left; nothing overlaps; the spare cells merge into few rectangles', () => {
  const g = B.binGrid('240-2W', '1H'), bins = new Map();
  const a = it('insert', 'M4', 0, 50), b = it('insert', 'M2', 0, 50), c = it('insert', 'M3', 0, 50);
  for (const x of [a, b, c]) { const s = B.binSize(x, g, { fillCap: 0.75 }); bins.set(x, B.firstFree(g, bins, s.w, s.h)); }
  assert.deepEqual([...bins.values()].map((v) => [v.c, v.r]), [[0, 0], [1, 0], [2, 0]], 'the front row, left to right');
  assert.equal(B.freeFor(g, bins, { c: 1, r: 0, w: 1, h: 1 }), false, 'occupied');
  assert.equal(B.freeFor(g, bins, { c: 1, r: 0, w: 1, h: 1 }, b), true, 'its own cell is free to itself');
  assert.equal(B.freeFor(g, bins, { c: 4, r: 0, w: 2, h: 1 }), false, 'out of the grid');
  const used = [...bins.values()].reduce((a, v) => a + v.w * v.h, 0), spare = B.spareRects(g, bins);
  assert.ok(spare.length <= 3, `a few spare rectangles: ${JSON.stringify(spare)}`);
  assert.equal(spare.reduce((a, v) => a + v.w * v.h, 0), 20 - used, 'they cover every free cell');
  assert.equal(B.spareRects(g, bins, true).length, 20 - used, 'or one per cell');
  for (const perCell of [false, true]) {
    const comps = B.binComps(g, bins, { perCell });
    G.checkTiling({ size: '240-2W', comps });
    assert.equal(comps.filter((k) => k.item).length, 3);
    assert.ok(comps.filter((k) => k.item).every((k) => k.src && k.item !== k.src), 'a copy of the part, and the part itself');
  }
});

test('a laid-out drawer reads back as its bins; a layout off the grid does not', () => {
  const g = B.binGrid('240-2W', '1H'), bins = new Map([[it('nut', 'M3', 0, 50), { c: 3, r: 2, w: 2, h: 1 }]]);
  const back = B.binsOf(g, B.binComps(g, bins));
  assert.deepEqual(back.filter((x) => x.comp.item).map((x) => x.bin), [{ c: 3, r: 2, w: 2, h: 1 }]);
  assert.equal(B.binsOf(g, G.evenGrid('240-2W', 3, 3)), null, 'a 3 x 3 is not this grid');
  assert.ok(B.binsOf(g, G.evenGrid('240-2W', 5, 4)).every((x) => x.bin.w === 1 && x.bin.h === 1), 'the shipped 5 x 4 is the grid: a cell a compartment');
  assert.equal(B.whereOf(g, { c: 1, r: 0, w: 1, h: 1 }), 'front row, 2nd from the left');
  assert.equal(B.whereOf(g, { c: 3, r: 3, w: 2, h: 1 }), 'back row, at the right');
});
