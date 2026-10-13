/* The build store's pure parts: entries, Recent order, the cap, the file formats, the planner's autosave slot. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../js/state/builds.js';

const rec = (over = {}) => ({ mount: 'tabletop', length: 185, placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0 }], nextId: 2, buildId: 'abcdefgh1234', ...over });
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('an entry takes the record’s id, a default name, and keeps the previous entry’s name and first-opened time', () => {
  const e = B.entryOf(rec(), { now: 1000 });
  assert.equal(e.id, 'abcdefgh1234');
  assert.equal(e.name, '185 Tabletop build');
  assert.equal(e.units, 1);
  const e2 = B.entryOf(rec({ placed: [] }), { now: 2000, prev: { ...e, name: 'Garage bench', openedAt: 500 } });
  assert.equal(e2.name, 'Garage bench');
  assert.equal(e2.openedAt, 500);
  assert.equal(e2.savedAt, 2000);
  const e3 = B.entryOf(rec({ buildId: undefined }), {});
  assert.match(e3.id, /^[a-z0-9]{8,32}$/);
  assert.equal(e3.record.buildId, e3.id);
  assert.equal(B.entryOf(rec(), { name: '  My   bench  ' }).name, 'My bench');
  assert.equal(B.entryOf(rec(), { kit: '185-tabletop-2w2h' }).kit, '185-tabletop-2w2h');
});

test('Recent builds order by last opened; the cap names the one opened longest ago only for a new id', () => {
  const list = Array.from({ length: B.RECENT_MAX }, (_, i) => ({ id: 'id' + i, openedAt: i }));
  assert.equal(B.sortRecent(list)[0].id, 'id19');
  assert.equal(B.wouldDrop(list, 'id3'), null);         // already there: no cap
  assert.equal(B.wouldDrop(list, 'new1').id, 'id0');
  assert.equal(B.wouldDrop(list.slice(1), 'new1'), null);   // room left
});

test('files: the planner’s form with a name beside it, and three readable shapes', () => {
  const e = B.entryOf(rec(), { name: 'Garage bench: v2/final' });
  const txt = B.fileOf(e);
  const doc = JSON.parse(txt);
  assert.equal(doc.gen2Build, 1); assert.equal(doc.name, 'Garage bench: v2/final'); assert.equal(doc.data.buildId, 'abcdefgh1234');
  assert.equal(B.fileName(e), 'Garage-bench-v2-final.json');
  assert.equal(B.parseBuildFile(txt).name, 'Garage bench: v2/final');
  assert.equal(B.parseBuildFile(JSON.stringify(rec())).record.length, 185);
  assert.equal(B.parseBuildFile(JSON.stringify({ gen2OfficialBuild: 1, id: 'k', title: 'Kit', build: rec() })).name, 'Kit');
  assert.match(B.parseBuildFile('nope').problem, /not JSON/);
  assert.match(B.parseBuildFile('{"hello":1}').problem, /not a build file/);
  assert.match(B.parseBuildFile(JSON.stringify({ gen2Build: 1, data: rec({ schema: 99 }) })).problem, /newer planner/);
});

test('the autosave slot: written as the raw record, never over a newer planner’s build', () => {
  const s = mem();
  assert.equal(B.writeSlot(s, rec()), true);
  assert.equal(B.readSlot(s).buildId, 'abcdefgh1234');
  s.setItem(B.SLOT_KEY, JSON.stringify(rec({ schema: 99 })));
  assert.equal(B.writeSlot(s, rec()), false);
  assert.equal(B.readSlot(s), null);     // too new to open here either
  s.setItem(B.SLOT_KEY, '{broken');
  assert.equal(B.writeSlot(s, rec()), true);   // a damaged slot is overwritten
  s.setItem(B.SLOT_KEY, JSON.stringify(rec({ placed: [] })));
  assert.equal(B.readSlot(s), null);     // an empty saved state is not a build to resume
});

test('the localStorage fallback store lists, keeps the current id and removes', async () => {
  const storage = mem();
  const b = await B.openBuilds({ storage });
  assert.equal(b.durable, false);
  assert.equal((await b.put(B.entryOf(rec(), { now: 1 }))).ok, true);
  await b.put(B.entryOf(rec({ buildId: 'zzzzzzzz9999' }), { now: 2, name: 'Second' }));
  assert.deepEqual((await b.list()).map((e) => e.name), ['Second', '185 Tabletop build']);
  b.currentId = 'zzzzzzzz9999';
  assert.equal(b.currentId, 'zzzzzzzz9999');
  assert.equal((await b.get('zzzzzzzz9999')).name, 'Second');
  await b.remove('zzzzzzzz9999');
  assert.equal((await b.list()).length, 1);
  assert.equal(await b.get('missing'), null);
});

test('the cap is the write’s own check: a 21st new id is refused with the entry it would drop; force or a known id passes', async () => {
  const storage = mem();
  const b = await B.openBuilds({ storage });
  for (let i = 0; i < B.RECENT_MAX; i++) await b.put(B.entryOf(rec({ buildId: 'bbbbbbbb00' + String(i).padStart(2, '0') }), { now: i + 1 }));
  const r = await b.put(B.entryOf(rec({ buildId: 'newbuild0001' }), { now: 99 }));
  assert.equal(r.ok, false);
  assert.equal(r.drop.id, 'bbbbbbbb0000');
  assert.equal((await b.list()).length, B.RECENT_MAX);
  assert.equal((await b.put(B.entryOf(rec({ buildId: 'bbbbbbbb0003' }), { now: 100 }))).ok, true);   // already there
  await b.remove('bbbbbbbb0000');
  assert.equal((await b.put(B.entryOf(rec({ buildId: 'newbuild0001' }), { now: 101 }))).ok, true);
  // removing a build clears the slot that holds it, so it never comes back through the planner's resume
  storage.setItem(B.SLOT_KEY, JSON.stringify(rec({ buildId: 'newbuild0001' })));
  await b.remove('newbuild0001');
  assert.equal(storage.getItem(B.SLOT_KEY), null);
});
