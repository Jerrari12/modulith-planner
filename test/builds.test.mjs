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

/* THE STALE-TAB GUARD (2026-10-22): a write names the stored version it is based on (expect), and is refused with that row
   when the stored row exists and is another version; a missing row is written (the cap applies); force skips only the cap */
test('decide(): the version rule and the cap, apart', () => {
  const rows = [{ id: 'aaaaaaaa0001', savedAt: 100, openedAt: 1 }, { id: 'aaaaaaaa0002', savedAt: 200, openedAt: 2 }];
  const e = (id, savedAt = 999) => ({ id, savedAt });
  assert.deepEqual(B.decide(rows, e('aaaaaaaa0001')), { ok: true, drop: null }, 'no expect: no check');
  assert.deepEqual(B.decide(rows, e('newbuild0001')), { ok: true, drop: null });
  assert.equal(B.decide(rows, e('aaaaaaaa0001'), { expect: 100 }).ok, true, 'based on the stored version');
  const newer = B.decide(rows, e('aaaaaaaa0001'), { expect: 50 });
  assert.equal(newer.ok, false); assert.equal(newer.stale.savedAt, 100); assert.equal('drop' in newer, false, 'not the cap shape');
  assert.equal(B.decide(rows, e('aaaaaaaa0001'), { expect: 150 }).ok, false, 'an older stored version is another version too');
  assert.equal(B.decide(rows, e('aaaaaaaa0001'), { expect: null }).stale.id, 'aaaaaaaa0001', 'never read, yet stored: another tab wrote it');
  assert.equal(B.decide(rows, e('newbuild0001'), { expect: null }).ok, true, 'never read, not stored');
  assert.equal(B.decide(rows, e('newbuild0001'), { expect: 123 }).ok, true, 'a missing row is written again');
  assert.equal(B.decide(rows, e('aaaaaaaa0001'), { force: true, expect: 50 }).ok, false, 'force skips the cap, never the check');
  const full = Array.from({ length: B.RECENT_MAX }, (_, i) => ({ id: 'cccccccc00' + String(i).padStart(2, '0'), savedAt: i, openedAt: i }));
  const capped = B.decide(full, e('newbuild0001'), { expect: null });
  assert.equal(capped.ok, false); assert.equal(capped.drop.id, 'cccccccc0000'); assert.equal('stale' in capped, false);
  const both = B.decide(full, e('cccccccc0005'), { expect: 1 });
  assert.equal(both.stale.id, 'cccccccc0005', 'a known id with the wrong version is stale'); assert.equal('drop' in both, false);
  assert.equal(B.decide(full, e('newbuild0001'), { expect: 77 }).drop.id, 'cccccccc0000', 'a missing row still meets the cap');
});

test('savedHint(): only another tab’s write of SAVED_KEY, and never a throw', () => {
  assert.deepEqual(B.savedHint({ key: B.SAVED_KEY, newValue: JSON.stringify({ id: 'aaaaaaaa0001', savedAt: 5 }) }), { id: 'aaaaaaaa0001', savedAt: 5 });
  for (const ev of [{ key: B.SLOT_KEY, newValue: '{}' }, { key: null, newValue: null }, { key: B.SAVED_KEY, newValue: null }, { key: B.SAVED_KEY, newValue: '{broken' }, { key: B.SAVED_KEY, newValue: JSON.stringify({ id: 1, savedAt: 'x' }) }, null]) {
    assert.equal(B.savedHint(ev), null, JSON.stringify(ev));
  }
});

test('the fallback store refuses a write based on another version, leaves it byte for byte, and hints only on a change', async () => {
  const storage = mem(), session = mem();
  const b = await B.openBuilds({ storage, session });
  const first = B.entryOf(rec(), { now: 100 });
  assert.equal((await b.put(first, { expect: null })).ok, true);
  assert.deepEqual(JSON.parse(storage.getItem(B.SAVED_KEY)), { id: 'abcdefgh1234', savedAt: 100 });
  const before = storage.getItem('gen2-builds');
  storage.removeItem(B.SAVED_KEY);
  const r = await b.put(B.entryOf(rec(), { now: 150 }), { expect: null });
  assert.equal(r.ok, false); assert.equal(r.stale.savedAt, 100);
  assert.equal(storage.getItem('gen2-builds'), before, 'a refusal writes nothing');
  assert.equal(storage.getItem(B.SAVED_KEY), null, 'and hints nothing');
  assert.equal((await b.put(B.entryOf(rec(), { now: 200 }), { expect: 100 })).ok, true);
  assert.equal((await b.get('abcdefgh1234')).savedAt, 200);
  assert.equal((await b.put(B.entryOf(rec(), { now: 300 }), { expect: 100 })).ok, false, 'the version moved on');
  storage.removeItem(B.SAVED_KEY);
  assert.equal((await b.put({ ...(await b.get('abcdefgh1234')), openedAt: 999 }, { force: true, expect: 200 })).ok, true);
  assert.equal(storage.getItem(B.SAVED_KEY), null, 'the same version written again (an open) is no hint');
});

test('the tab base: { base, pending } per build in sessionStorage; a blocked storage gives undefined and never throws', async () => {
  const session = mem();
  const b = await B.openBuilds({ storage: mem(), session });
  assert.equal(b.tabBase('abcdefgh1234'), undefined, 'none kept');
  b.setTabBase('abcdefgh1234', 100, 150);
  assert.deepEqual(b.tabBase('abcdefgh1234'), { base: 100, pending: 150 });
  b.setTabBase('abcdefgh1234', null);
  assert.deepEqual(b.tabBase('abcdefgh1234'), { base: null, pending: null });
  session.setItem('gen2-tab-base:abcdefgh1234', '{broken');
  assert.equal(b.tabBase('abcdefgh1234'), undefined);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  const b2 = await B.openBuilds({ storage: mem(), session: blocked });
  assert.equal(b2.tabBase('abcdefgh1234'), undefined);
  assert.doesNotThrow(() => b2.setTabBase('abcdefgh1234', 1));
});

test('a write that reaches no store (the list full) says so: { unsaved }, no hint, and the stored row stays', async () => {
  const storage = mem();
  const b = await B.openBuilds({ storage, session: mem() });
  assert.equal((await b.put(B.entryOf(rec(), { now: 100 }), { expect: null })).ok, true);
  storage.removeItem(B.SAVED_KEY);
  const set = storage.setItem; storage.setItem = (k, v) => { if (k === 'gen2-builds') throw new Error('QuotaExceededError'); return set(k, v); };
  const r = await b.put(B.entryOf(rec(), { now: 200 }), { expect: 100 });
  assert.deepEqual(r, { ok: true, drop: null, unsaved: true });
  assert.equal(storage.getItem(B.SAVED_KEY), null, 'no hint for a write that did not land');
  storage.setItem = set;
  assert.equal((await b.get('abcdefgh1234')).savedAt, 100);
  assert.equal((await b.put(B.entryOf(rec(), { now: 300 }), { expect: 100 })).ok, true, 'the next save, still based on 100, lands');
});

test('the tab base per page (a key the page keeps in history.state) is apart from the tab’s own', async () => {
  const b = await B.openBuilds({ storage: mem(), session: mem() });
  b.setTabBase('abcdefgh1234', 300);
  b.setTabBase('abcdefgh1234', 100, null, 'pagekey1');
  assert.deepEqual(b.tabBase('abcdefgh1234'), { base: 300, pending: null });
  assert.deepEqual(b.tabBase('abcdefgh1234', 'pagekey1'), { base: 100, pending: null });
  assert.equal(b.tabBase('abcdefgh1234', 'pagekey2'), undefined);
});
