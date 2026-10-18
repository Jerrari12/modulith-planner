/* js/state/owned.js: the owned-filaments list (the Colors plan's step 5, 2026-10-18) survives a round trip, drops what
   the catalog no longer has, and never throws on a storage that does. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILAMENT_DB } from '../js/filament-db.js';
import { OWNED_KEY, cleanOwned, readOwned, writeOwned } from '../js/state/owned.js';

const LABELS = new Set(FILAMENT_DB.flatMap((b) => b.colors.map((c) => c.label)));
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test('a list written is the list read, catalog labels only, each once, in order', () => {
  const s = mem();
  assert.equal(writeOwned(s, ['Elegoo PLA Black', 'Printed Solid Mystery Orange', 'Elegoo PLA Black', 'Not A Filament']), true);
  assert.deepEqual(JSON.parse(s.m.get(OWNED_KEY)).v, 1);
  assert.deepEqual(readOwned(s, LABELS), ['Elegoo PLA Black', 'Printed Solid Mystery Orange'], 'the unknown label drops out on the read; the duplicate is one');
});

test('cleanOwned: anything that is not { labels: [catalog labels] } reads as nothing owned', () => {
  assert.deepEqual(cleanOwned(null, LABELS), []);
  assert.deepEqual(cleanOwned({ labels: 'Elegoo PLA Black' }, LABELS), []);
  assert.deepEqual(cleanOwned({ labels: [42, null, 'Elegoo PLA Black'] }, LABELS), ['Elegoo PLA Black']);
  assert.deepEqual(cleanOwned({ labels: ['Elegoo PLA Black'], __proto__: { v: 9 } }, LABELS), ['Elegoo PLA Black']);
});

test('a storage that throws (a private window) reads as an empty list and refuses the write without throwing', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(readOwned(broken, LABELS), []);
  assert.equal(writeOwned(broken, ['Elegoo PLA Black']), false);
  const junk = mem(); junk.setItem(OWNED_KEY, '{not json');
  assert.deepEqual(readOwned(junk, LABELS), [], 'unreadable JSON is an empty list, not a crash');
});
