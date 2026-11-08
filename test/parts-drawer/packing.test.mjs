import { test } from 'node:test';
import assert from 'node:assert/strict';
import { I } from '../lib/parts-drawer-env.mjs';
import { PACKING } from '../../js/parts-drawer/packing.js';

// The packing bench's table (D:/MODULITH/ops/bench/packing, DECISIONS 2026-11-07): inventory.js packOf reads it, and a pile's
// volume, a compartment's size and its fill reading follow from it.
const shcs = (size, length, qty) => ({ type: 'shcs', size, length, qty });
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('parts drawer packing: the table carries the simulated cells it was built from', () => {
  assert.equal(PACKING.schema, 'modulith-packing/1');
  assert.deepEqual(PACKING.qty, [5, 10, 20, 50, 100, 200, 500]);
  // packOf divides by log differences of neighbouring knots: they must rise strictly, and be positive where it takes a log
  const rising = (xs) => xs.every((x, i) => i === 0 || x > xs[i - 1]);
  assert.ok(rising(PACKING.qty) && PACKING.qty[0] > 0);
  for (const [type, sizes] of Object.entries(PACKING.types)) for (const [size, row] of Object.entries(sizes)) {
    assert.ok(row.len.length >= 1 && row.pack.length === row.len.length, `${type} ${size}`);
    assert.ok(row.len.length === 1 || (rising(row.len) && row.len[0] > 0), `${type} ${size} lengths ${row.len}`);
    for (const r of row.pack) { assert.equal(r.length, PACKING.qty.length); for (const v of r) assert.ok(v > 0.05 && v < 0.95, `${type} ${size} ${v}`); }
  }
  // PINNED: the friction-0.3 table from bench commit b3b58a5 (11542 piles, simulation-only). A re-run of the bench that
  // moves these is a new table: update them with its DECISIONS entry.
  assert.equal(PACKING.commit, 'b3b58a5');
  assert.equal(Object.keys(PACKING.types).length, 16);
  assert.equal(Object.values(PACKING.types).reduce((n, s) => n + Object.keys(s).length, 0), 106);
  assert.deepEqual(PACKING.types.shcs.M3.len, [4, 8, 12, 20, 30, 50, 75]);
  assert.equal(PACKING.types.shcs.M3.pack[0][0], 0.2);     // 5 of M3x4
  assert.equal(PACKING.types.shcs.M3.pack[1][5], 0.404);   // 200 of M3x8
  assert.equal(PACKING.types.shcs.M3.pack[6][6], 0.206);   // 500 of M3x75
  assert.equal(PACKING.types.nut.M3.pack[0][6], 0.384);    // 500 M3 nuts
  assert.equal(PACKING.types.washer.M5.pack[0][3], 0.287); // 50 M5 washers
});

test('parts drawer packing: packOf returns table cells exactly and interpolates in log length and log quantity', () => {
  const row = PACKING.types.shcs.M3, L = row.len, Q = PACKING.qty;
  close(I.packOf(shcs('M3', L[1], Q[2])), row.pack[1][2]);
  // halfway in log quantity between 20 and 50 is sqrt(1000)
  close(I.packOf(shcs('M3', L[1], Math.sqrt(Q[2] * Q[3]))), (row.pack[1][2] + row.pack[1][3]) / 2, 1e-9);
  // halfway in log length, at a table quantity
  close(I.packOf(shcs('M3', Math.sqrt(L[2] * L[3]), Q[4])), (row.pack[2][4] + row.pack[3][4]) / 2, 1e-9);
  // both at once: the bilinear mean of the four corners
  const mid = (row.pack[2][2] + row.pack[2][3] + row.pack[3][2] + row.pack[3][3]) / 4;
  close(I.packOf(shcs('M3', Math.sqrt(L[2] * L[3]), Math.sqrt(Q[2] * Q[3]))), mid, 1e-9);
  // held flat past the ends: fewer than 5, more than 500, shorter or longer than simulated
  close(I.packOf(shcs('M3', L[0], 1)), row.pack[0][0]);
  close(I.packOf(shcs('M3', L[0], 5000)), row.pack[0][Q.length - 1]);
  close(I.packOf(shcs('M3', L[L.length - 1] * 3, 20)), row.pack[L.length - 1][2]);
  close(I.packOf(shcs('M3', 1, 20)), row.pack[0][2]);
  // no quantity, or a screw with no length given: the smallest pile, the shortest length
  close(I.packOf(shcs('M3', L[2], 0)), row.pack[2][0]);
  close(I.packOf({ type: 'shcs', size: 'M3', qty: 50 }), row.pack[0][3]);
  // a flat part's single row (length 0) interpolates in quantity only, whatever length it carries
  const w = PACKING.types.washer.M5.pack[0];
  close(I.packOf({ type: 'washer', size: 'M5', length: 0, qty: Math.sqrt(50 * 100) }), (w[3] + w[4]) / 2, 1e-9);
  close(I.packOf({ type: 'washer', size: 'M5', length: 7, qty: 50 }), w[3]);
});

test('parts drawer packing: a part the table lacks keeps its type\'s old constant; a captive screw reads the socket head curve', () => {
  assert.equal(I.packOf({ type: 'magnet', size: '6', length: 3, qty: 20 }), I.TYPES.magnet.pack);
  close(I.packOf({ type: 'captive', size: 'M3', length: 12, qty: 50 }), I.packOf(shcs('M3', 12, 50)));
  // the pile volume divides by it
  const it = shcs('M3', 8, 200);
  close(I.pileVolume(it), I.partShape(it).vol * 200 / I.packOf(it), 1e-6);
});
