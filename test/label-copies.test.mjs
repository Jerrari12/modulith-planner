/* The labels kept aside for a build that comes back without them (js/state/label-copies.js): the copy of a record, the
   limits, age, and a storage that refuses. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/state/label-copies.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const rec = (labels, assign = {}) => ({ buildId: 'abcdefgh1234', placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'decor' }, { id: 2, x: 1, y: 0, w: 2, hh: 2, fill: 'decor' }], labelList: labels ? { format: 'x', version: 1, labels } : undefined, labelAssign: assign });

test('the copy of a record carries its list, assignments and each assigned drawer’s cell; a record without labels has none', () => {
  const c = C.copyOf(rec([{ id: 'a', text: 'Screws' }, { id: 'b', text: 'Nuts' }], { 2: 'a', 9: 'b' }), 1234);
  assert.equal(c.n, 2);
  assert.equal(c.savedAt, 1234);
  assert.deepEqual(c.geom, { 2: [1, 0, 2, 2] });   // drawer 9 is not on the board: no cell, and its assignment is dropped at restore
  assert.equal(C.copyOf(rec(null)), null);
  assert.equal(C.copyOf(rec([])), null);
});

test('remember, hold, drop; the oldest copies go first past the cap; a stale copy is not offered', () => {
  const s = mem();
  const copy = (t) => ({ ...C.copyOf(rec([{ id: 'a', text: 'Screws' }]), t) });
  for (let i = 0; i < C.COPIES_MAX + 2; i++) assert.equal(C.remember(s, 'build' + i, copy(1000 + i)), true);
  assert.equal(C.held(s, 'build0', 2000), null, 'the oldest went');
  assert.equal(C.held(s, 'build1', 2000), null);
  assert.equal(C.held(s, 'build2', 2000).savedAt, 1002);
  assert.equal(C.held(s, 'build2', 1002 + C.COPY_MAX_AGE), null, 'too old to offer');
  assert.equal(C.held(s, 'build2', 1002 + C.COPY_MAX_AGE - 1).savedAt, 1002);
  assert.equal(C.drop(s, 'build2'), true);
  assert.equal(C.held(s, 'build2', 2000), null);
  assert.equal(C.drop(s, 'never'), true);
  assert.equal(C.remember(s, 'x', null), false);
});

test('a copy too big to hold, or a storage that refuses, leaves no copy behind', () => {
  const s = mem();
  assert.equal(C.remember(s, 'b', C.copyOf(rec([{ id: 'a', text: 'Screws' }]), 1)), true);
  const huge = C.copyOf(rec([{ id: 'a', text: 'x'.repeat(C.COPY_MAX_CHARS) }]), 2);
  assert.equal(C.remember(s, 'b', huge), false);
  assert.equal(C.held(s, 'b', 3), null, 'the older copy went with it: no copy beats a stale one');
  const refusing = { ...mem(), setItem: () => { throw new Error('quota'); } };
  assert.equal(C.remember(refusing, 'b', C.copyOf(rec([{ id: 'a', text: 'Screws' }]), 1)), false);
  assert.equal(C.held(refusing, 'b', 3), null);
  const dead = C.safeStorage(null);
  assert.equal(C.remember(dead, 'b', C.copyOf(rec([{ id: 'a', text: 'Screws' }]), 1)), false);
  assert.equal(C.held(dead, 'b'), null);
  const junk = mem(); junk.setItem(C.COPIES_KEY, '{"v":2}');
  assert.equal(C.held(junk, 'b'), null);
  assert.equal(C.remember(junk, 'b', C.copyOf(rec([{ id: 'a', text: 'Screws' }]), 1)), true);
});

test('a junk entry beside a good one is ignored, and a drop names the copy it spends', () => {
  const s = mem();
  const good = C.copyOf(rec([{ id: 'a', text: 'Screws' }]), 1000);
  s.setItem(C.COPIES_KEY, JSON.stringify({ v: 1, copies: { old: null, str: 'x', notime: { list: good.list }, b: good } }));
  assert.equal(C.held(s, 'old', 2000), null);
  assert.equal(C.remember(s, 'c', C.copyOf(rec([{ id: 'a', text: 'Nuts' }]), 1500)), true, 'remember survives the junk (Sol 01a136b1)');
  assert.deepEqual(Object.keys(JSON.parse(s.getItem(C.COPIES_KEY)).copies).sort(), ['b', 'c']);
  // another tab replaced b with a newer copy after this tab read it: this tab's spend leaves the newer one alone
  C.remember(s, 'b', C.copyOf(rec([{ id: 'a', text: 'Bolts' }]), 3000));
  assert.equal(C.drop(s, 'b', 1000), false);
  assert.equal(C.held(s, 'b', 3500).savedAt, 3000);
  assert.equal(C.drop(s, 'b', 3000), true);
  assert.equal(C.held(s, 'b', 3500), null);
});

