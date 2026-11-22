/* A build whose load leaves units off the board (js/state/dropped-copies.js and the boot in js/app.js): the store reports
   the count, the record as it arrived is kept, an emptier reopen never overwrites a fuller copy, the note reads right, and
   the boot uses the count instead of throwing it away (the 2026-11-21 report: a saved wall build came back with no units). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as D from '../js/state/dropped-copies.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
function catalog() {
  const ctx = vm.createContext({ console });
  vm.runInContext(read('js/vendor/requirement-scope.js'), ctx);
  vm.runInContext(read('js/vendor/tabletop-completion.js'), ctx);
  return vm.runInContext(read('js/catalog/data.js') + '\n;({ GEN2, GEN2_TABLETOP })', ctx);
}
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const kit = () => JSON.parse(read('builds/185-tabletop-2w2h.json')).build;

test('the store reports the units its load dropped; the board keeps the rest', async () => {
  const { createStore } = await import('../js/state/store.js');
  const { GEN2, GEN2_TABLETOP } = catalog();
  const store = createStore(GEN2, { tabletop: GEN2_TABLETOP });
  const rec = kit();
  const before = rec.placed.length;
  rec.placed.push({ id: 90, x: 0, y: 0, w: 1, hh: 2, fill: 'no-such-fill' }, { id: 91, x: 40, y: 0, w: 1, hh: 2, fill: 'decor' });
  const r = store.load(rec);
  assert.equal(r.ok, true);
  assert.equal(r.dropped, 2, 'an unknown fill and a unit outside the grid');
  assert.equal(store.state.placed.length, before);
});

test('keepDropped keeps the record as it arrived; an emptier reopen never replaces a fuller copy', () => {
  const s = mem();
  const full = { buildId: 'abcdefgh1234', placed: [{ id: 1 }, { id: 2 }, { id: 3 }], look: { v: 1 } };
  assert.equal(D.keepDropped(s, full, 3, 1000), true);
  assert.deepEqual(D.droppedCopy(s, 'abcdefgh1234').record, full);
  assert.equal(D.droppedCopy(s, 'abcdefgh1234').n, 3);
  // the emptied build reopened: whatever it lost now is fewer units than the copy holds, so the copy stays
  assert.equal(D.keepDropped(s, { buildId: 'abcdefgh1234', placed: [{ id: 1 }] }, 1, 2000), true);
  assert.equal(D.droppedCopy(s, 'abcdefgh1234').record.placed.length, 3);
  assert.equal(D.droppedCopy(s, 'abcdefgh1234').savedAt, 1000);
});

test('the cap drops the oldest copies; nothing is kept for no loss, an oversized record or a refusing storage', () => {
  const s = mem();
  for (let i = 0; i < D.COPIES_MAX + 2; i++) assert.equal(D.keepDropped(s, { buildId: 'buildid' + i, placed: [{ id: 1 }] }, 1, 1000 + i), true);
  assert.equal(D.droppedCopy(s, 'buildid0'), null);
  assert.equal(D.droppedCopy(s, 'buildid1'), null);
  assert.equal(D.droppedCopy(s, 'buildid2').savedAt, 1002);
  assert.equal(D.keepDropped(s, { buildId: 'x', placed: [] }, 0), false);
  assert.equal(D.keepDropped(s, { buildId: 'big', placed: [], pad: 'x'.repeat(D.COPY_MAX_CHARS) }, 1), false);
  const refusing = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
  assert.equal(D.keepDropped(refusing, { buildId: 'y', placed: [{ id: 1 }] }, 1), false);
  assert.equal(D.droppedCopy(refusing, 'y'), null);
  // an id that is not a build id, or none at all, gets a key of its own: nothing shared, nothing written onto the prototype
  const t = mem();
  assert.equal(D.keepDropped(t, { buildId: '__proto__', placed: [{ id: 1 }, { id: 2 }] }, 2, 5000), true);
  assert.equal(D.keepDropped(t, { placed: [{ id: 1 }] }, 1, 5001), true);
  const held = JSON.parse(t.getItem(D.DROPPED_KEY)).copies;
  assert.deepEqual(Object.keys(held).sort(), ['no-id-5000', 'no-id-5001']);
  assert.equal(held['no-id-5000'].record.placed.length, 2);
  s.setItem(D.DROPPED_KEY, '{"v":1,"copies":{"z":null,"w":{"savedAt":"no"}}}');
  assert.equal(D.droppedCopy(s, 'z'), null, 'a damaged entry is ignored');
});

test('the note: singular and plural, with and without a kept copy, and no dashes', () => {
  assert.match(D.droppedNote(1, true), /^1 part in this build couldn’t be opened, so it’s left off the board\. The build as it was saved is kept/);
  assert.match(D.droppedNote(9, false), /^9 parts in this build couldn’t be opened, so they’re left off the board\. Tell us through Feedback & support/);
  assert.match(D.droppedNote(9, true, false), /left off the board\. Until you add a unit, the 3D view still shows the build as it was saved\. The build as it was saved is kept/);
  assert.doesNotMatch(D.droppedNote(9, true), /Until you add a unit/, 'said only when the stage could not be redrawn');
  for (const n of [1, 9]) for (const k of [true, false]) for (const r of [true, false]) assert.doesNotMatch(D.droppedNote(n, k, r), /[–—]/);
});

test('the boot uses the load’s dropped count: kept, counted and said, never thrown away', () => {
  const app = read('js/app.js');
  assert.doesNotMatch(app, /if \(stage\.build\) store\.load\(stage\.build\);/, 'the bare load that discarded the count is gone');
  assert.match(app, /const loaded = store\.load\(stage\.build\);/);
  assert.match(app, /loaded\.dropped > 0/);
  assert.match(app, /keepDropped\(copies, stage\.build, loaded\.dropped\)/);
  assert.match(app, /stage\.track\?\.\('error:load-dropped'\)/);
  assert.match(app, /toast\(droppedNote\(lostUnits\.n, lostUnits\.kept, lostUnits\.redrawn\), 12000\)/);
  // the stage booted on the record as it arrived: redrawn on the cleaned one, so it never shows units the board lost
  assert.match(app, /const rec = store\.serialize\(\), gen = generateManifest\(rec, \{ voids: true \}\);\s*if \(gen\.manifest\) \{ const r = await stage\.update\(rec, gen\);/);
});
