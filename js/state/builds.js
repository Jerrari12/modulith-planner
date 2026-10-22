/* THE BUILD STORE (the plan §1.3, persistence): every build autosaves to IndexedDB in this browser, Recent builds keeps up
   to 20, nothing is deleted by age, and the planner's own autosave slot (`gen2-last-build`, the raw record) is dual-written
   during the overlap so the old planner and this app read each other's last build once they share an origin (cutover).
   Safari and every iOS browser may clear script-written storage after 7 days without a visit; `navigator.storage.persist()`
   is asked for after the first save, and the switcher always says "Autosaved in this browser".

   An entry: { id, name, savedAt, openedAt, kit, mount, length, units, record } - `record` is the serialized build (the
   planner's form, what a share link carries), `id` its buildId. Pure where it can be: the entry shaping, the cap and the
   file formats take plain values; only open() touches IndexedDB (with a localStorage fallback for a browser that refuses
   it, like Firefox's private mode). */
import { buildTooNew, newBuildId } from '../rules/schema.js';

export const RECENT_MAX = 20;
export const SLOT_KEY = 'gen2-last-build';            // the planner's saved-session slot (the raw record as JSON)
export const CURRENT_KEY = 'gen2-current-build';      // which Recent entry this browser last had open
export const SAVED_KEY = 'gen2-build-saved';          // { id, savedAt } after each write that changed a stored version: other tabs' hint
const TAB_BASE = 'gen2-tab-base:';                    // sessionStorage, per build: the stored version this tab is based on
const DB = 'modulith-planner', STORE = 'builds', FALLBACK_KEY = 'gen2-builds';
const MOUNT_NAME = { 'under-table': 'Under-Table', tabletop: 'Tabletop', wall: 'Wall Mount' };

export const defaultName = (record, kitTitle = null) => kitTitle || `${record?.length || ''} ${MOUNT_NAME[record?.mount] || 'Tabletop'} build`.trim();
export const cleanName = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 60) : '');
export const hashOf = (record) => '#build=' + btoa(unescape(encodeURIComponent(JSON.stringify(record))));
export const b64url = (s) => btoa(unescape(encodeURIComponent(s)));

/* one entry from a record (the id is the record's buildId; a record without one is given one here, on a copy) */
export function entryOf(record, { name, kit = null, now = Date.now(), prev = null } = {}) {
  const rec = JSON.parse(JSON.stringify(record));
  if (!(typeof rec.buildId === 'string' && /^[a-z0-9]{8,32}$/.test(rec.buildId))) rec.buildId = newBuildId();
  return {
    id: rec.buildId, name: cleanName(name) || (prev && prev.name) || defaultName(rec),
    savedAt: now, openedAt: (prev && prev.openedAt) || now, kit: kit ?? (prev ? prev.kit : null),
    mount: rec.mount, length: Number(rec.length), units: Array.isArray(rec.placed) ? rec.placed.length : 0, record: rec,
  };
}
/* Recent builds in the order the menu shows them: the one open last first */
export const sortRecent = (list) => list.slice().sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
/* what the cap would drop when `incoming` (an id not in the list) is added: the entry opened longest ago, or null */
export function wouldDrop(list, incomingId) {
  if (list.some((e) => e.id === incomingId) || list.length < RECENT_MAX) return null;
  const s = sortRecent(list);
  return s[s.length - 1] || null;
}

/* THE STALE-TAB GUARD (Joey, 2026-10-22: "a planner tab whose build was saved newer by another tab must not overwrite it").
   The Label Studio's Add to planner build opens a second planner tab; the tab that opened the Studio still holds the build
   as it was, and its next save used to win. A write now names the stored version it is based on (`expect`: that entry's
   savedAt, or null when this tab never read one), and is refused when the stored row, as get() sees it, exists and is
   another version. A missing row is written as before (the cap applies); `force` skips the cap, never the check;
   `expect` undefined means no check (a writer of a new id). Pure, so the node tests reach the rule itself. */
export function decide(rows, entry, { force = false, expect } = {}) {
  const row = rows.find((e) => e.id === entry.id) || null;
  if (expect !== undefined && row && (expect === null || row.savedAt !== expect)) return { ok: false, stale: row };
  if (!force && !row && rows.length >= RECENT_MAX) { const s = sortRecent(rows); return { ok: false, drop: s[s.length - 1] }; }
  return { ok: true, drop: null };
}
/* another tab's write, from a 'storage' event: { id, savedAt } or null (another key, a cleared storage, a broken value) */
export function savedHint(ev) {
  try {
    if (!ev || ev.key !== SAVED_KEY || !ev.newValue) return null;
    const v = JSON.parse(ev.newValue);
    return v && typeof v.id === 'string' && typeof v.savedAt === 'number' ? { id: v.id, savedAt: v.savedAt } : null;
  } catch { return null; }
}

/* ---- files ---- */
/* the planner's build file ({ gen2Build: 1, data }); this app adds the name beside it (older planners read only `data`) */
export const fileOf = (entry) => JSON.stringify({ gen2Build: 1, name: entry.name, data: entry.record }, null, 2);
export const fileName = (entry) => (entry.name || 'modulith-build').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) + '.json';
/* a build file, a raw record, or an official kit file; { record, name } or { problem } */
export function parseBuildFile(text) {
  let doc; try { doc = JSON.parse(text); } catch { return { problem: 'That file is not a build file (it is not JSON).' }; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { problem: 'That file is not a build file.' };
  let record = null, name = null;
  if (doc.gen2Build === 1 && doc.data && typeof doc.data === 'object') { record = doc.data; name = cleanName(doc.name) || null; }
  else if (doc.gen2OfficialBuild === 1 && doc.build && typeof doc.build === 'object') { record = doc.build; name = cleanName(doc.title) || null; }
  else if (Array.isArray(doc.placed) && doc.mount) record = doc;
  if (!record) return { problem: 'That file is not a build file. Use a build saved from the planner (a .json with gen2Build) or an official kit file.' };
  if (buildTooNew(record)) return { problem: 'This build was saved by a newer planner. Refresh this tab and load it again.' };
  return { record, name };
}

/* ---- the planner's autosave slot ---- */
/* the slot is re-read before every write: a newer planner opened beside this tab writes it after this tab loaded, and
   this tab's next save must not replace it (the planner's own rule) */
export function writeSlot(storage, record) {
  try {
    const raw = storage.getItem(SLOT_KEY);
    if (raw) { try { if (buildTooNew(JSON.parse(raw))) return false; } catch { /* a damaged slot is overwritten */ } }
    storage.setItem(SLOT_KEY, JSON.stringify(record));
    return true;
  } catch { return false; }
}
export function readSlot(storage) {
  try { const raw = storage.getItem(SLOT_KEY); const rec = raw ? JSON.parse(raw) : null; return rec && Array.isArray(rec.placed) && rec.placed.length && !buildTooNew(rec) ? rec : null; } catch { return null; }
}

/* ---- the store itself ---- */
function idb() {
  return new Promise((ok, no) => {
    if (typeof indexedDB === 'undefined') return no(new Error('no IndexedDB'));
    let req;
    try { req = indexedDB.open(DB, 1); } catch (e) { return no(e); }
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error || new Error('IndexedDB refused'));
    req.onblocked = () => no(new Error('IndexedDB blocked'));
  });
}
const tx = (db, mode, fn) => new Promise((ok, no) => { const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); t.oncomplete = () => ok(r && 'result' in r ? r.result : undefined); t.onerror = () => no(t.error); t.onabort = () => no(t.error); });

/* open the store: IndexedDB, or a localStorage list when the browser refuses it. Every method returns a promise. */
export async function openBuilds({ storage = null, session = null } = {}) {
  if (!storage) { try { storage = globalThis.localStorage; } catch { storage = null; } }   // a browser that blocks storage throws on the read itself
  if (!storage) storage = { getItem: () => null, setItem() {}, removeItem() {} };
  if (!session) { try { session = globalThis.sessionStorage; } catch { session = null; } }
  if (!session) session = { getItem: () => null, setItem() {}, removeItem() {} };
  let db = null;
  try { db = await idb(); } catch { db = null; }
  /* a connection lost while the tab sat in the background (WebKit: "Connection to Indexed Database server lost") fails
     every transaction after it; a reader or a writer opens it again once before it settles for the list, which would
     otherwise check the stale-tab guard against the list alone (the guard's review, 2026-10-22) */
  const again = async (fn) => { try { db = await idb(); } catch { return null; } try { return { v: await fn() }; } catch { return null; } };
  // and one that failed to open at all is tried again at each read and write, so a passing failure at boot does not leave the
  // list as the only check for good (Sol 01a16556); a browser without IndexedDB fails it at once
  // one open shared by every caller, and a failed one never drops a connection another caller made (Terra 01a16560)
  let opening = null;
  const ensure = () => {
    if (db) return Promise.resolve(db);
    if (!opening) opening = idb().then((d) => { db = d; return d; }, () => db).finally(() => { opening = null; });
    return opening;
  };
  const readFallback = () => { try { const v = JSON.parse(storage.getItem(FALLBACK_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const writeFallback = (list) => { try { storage.setItem(FALLBACK_KEY, JSON.stringify(list)); return true; } catch { return false; /* full or private */ } };
  /* both sources, merged by id (the list wins): an entry a failed IndexedDB write put in the list stays visible */
  const merged = (rows) => { const m = new Map(rows.map((e) => [e.id, e])); for (const e of readFallback()) m.set(e.id, e); return sortRecent([...m.values()]); };
  const api = {
    get durable() { return !!db; },
    async list() {
      let rows = [];
      if (await ensure()) { try { rows = await tx(db, 'readonly', (s) => s.getAll()); } catch { rows = []; } }
      return merged(rows);
    },
    async get(id) {
      if (!id) return null;
      const f = readFallback().find((e) => e.id === id); if (f) return f;
      const read = async () => (await tx(db, 'readonly', (s) => s.get(id))) || null;
      if (await ensure()) { try { return await read(); } catch { const r = await again(read); return r ? r.v : null; } }
      return null;
    },
    /* the write checks the cap and the version (decide(), the stale-tab guard) INSIDE its own transaction, against the rows
       as get() sees them (the list wins): two tabs cannot both squeeze a 21st in, nor both write over one version. A new id
       over the cap is refused with the entry it would drop, unless `force` (the visitor chose to drop it, and it was removed
       first); a write based on another stored version is refused with that row ({ stale }). An accepted write that changed
       the stored version tells other tabs (SAVED_KEY), and an IndexedDB write retires the id's list copy, which would
       otherwise hide it from get(). A write that reached neither store says so ({ ok: true, unsaved: true }, no hint):
       the tab keeps its base, so its next save is not mistaken for another tab's (the guard's review) */
    async put(entry, opts = {}) {
      const hint = (prior) => { if (!prior || prior.savedAt !== entry.savedAt) { try { storage.setItem(SAVED_KEY, JSON.stringify({ id: entry.id, savedAt: entry.savedAt })); } catch { /* full or private */ } } };
      const viaDb = () => new Promise((ok, no) => {
        const t = db.transaction(STORE, 'readwrite'); const st = t.objectStore(STORE); let out = { ok: true, drop: null }, prior = null;
        const all = st.getAll();
        all.onsuccess = () => { const rows = merged(all.result); prior = rows.find((e) => e.id === entry.id) || null; out = decide(rows, entry, opts); if (out.ok) st.put(entry); };
        t.oncomplete = () => ok({ out, prior }); t.onerror = () => no(t.error); t.onabort = () => no(t.error);
      });
      if (await ensure()) {
        let r = null;
        try { r = await viaDb(); } catch { const a = await again(viaDb); r = a ? a.v : null; }   // else quota, or no IndexedDB after all: the list below
        if (r) {
          if (r.out.ok) {
            const list = readFallback(); if (list.some((e) => e.id === entry.id)) writeFallback(list.filter((e) => e.id !== entry.id));
            hint(r.prior);
          }
          return r.out;
        }
      }
      const list = readFallback(); const rows = merged(list); const prior = rows.find((e) => e.id === entry.id) || null;
      const out = decide(rows, entry, opts); if (!out.ok) return out;
      if (!writeFallback(list.filter((e) => e.id !== entry.id).concat([entry]))) return { ok: true, drop: null, unsaved: true };
      hint(prior); return out;
    },
    /* this tab's base per build, in sessionStorage so a reload of a stale tab (F5, a discarded tab, a restored session) is
       still stale: undefined when none is kept, else { base, pending } - base the stored version's savedAt (or null),
       pending the version this tab is writing right now, so a write that lands while the page unloads is still its own.
       With `page` (a key the page keeps in history.state), the base of that history entry alone: Back to an older page
       of the build is judged by the version that page had */
    tabBase(id, page = null) {
      try {
        const v = JSON.parse(session.getItem(TAB_BASE + (page ? page + ':' : '') + id) || 'null');
        const ok = (n) => n === null || typeof n === 'number';
        return v && typeof v === 'object' && ok(v.base) && ok(v.pending) ? { base: v.base, pending: v.pending } : undefined;
      } catch { return undefined; }
    },
    setTabBase(id, base, pending = null, page = null) { try { session.setItem(TAB_BASE + (page ? page + ':' : '') + id, JSON.stringify({ base: base === undefined ? null : base, pending })); } catch { /* blocked */ } },
    async remove(id) {
      if (await ensure()) { try { await tx(db, 'readwrite', (s) => s.delete(id)); } catch { /* gone anyway */ } }
      writeFallback(readFallback().filter((e) => e.id !== id));
      try { const raw = storage.getItem(SLOT_KEY); if (raw && JSON.parse(raw).buildId === id) storage.removeItem(SLOT_KEY); } catch { /* a damaged slot stays */ }   // a deleted build never comes back through the slot
    },
    /* the planner's slot through the same storage, so callers never touch localStorage themselves (the storage guard test) */
    writeSlot: (record) => writeSlot(storage, record),
    readSlot: () => readSlot(storage),
    get currentId() { try { return storage.getItem(CURRENT_KEY) || null; } catch { return null; } },
    set currentId(id) { try { if (id) storage.setItem(CURRENT_KEY, id); else storage.removeItem(CURRENT_KEY); } catch { /* private */ } },
    /* the browser is asked to keep this origin's storage under pressure, once, after the first save */
    async persist() { try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* not offered */ } },
  };
  return api;
}
