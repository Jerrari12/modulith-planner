/* DROPPED COPIES: a build kept aside, as it arrived, when opening it left some of its units off the board.

   The store's load (js/state/store.js) runs every record through sanitizeBuild (js/rules/schema.js), which keeps only the
   units it accepts: a known fill, a size this depth offers, inside the grid, no overlap. The units it rejects are gone from
   the board, and the next settled change saves the board back: the address, the Recent entry and the planner's slot all
   lose them for good. Until 2026-11-21 the count sanitizeBuild returns was thrown away at the boot, so nothing said so
   (a visitor's saved wall build came back with no units at all, its colours and label palette intact).

   So when a load drops units, the record as it arrived is copied here first, the visitor is told, and the event is
   counted. The copy is for recovery: whatever rule refused the units today can be fixed, and the copy still holds them.

   One localStorage key, `gen2-dropped-copies` = { v: 1, copies: { <buildId>: { savedAt, n, record } } }. At most
   COPIES_MAX builds (the oldest go first), each at most COPY_MAX_CHARS of JSON. A newer copy of the same build replaces
   the older one only when it holds at least as many units, so reopening the emptied build cannot overwrite the copy that
   still has them. The storage is passed in so the tests run under node; a storage that throws makes every call a no-op. */
import { BUILD_ID_RE } from '../rules/schema.js';

export const DROPPED_KEY = 'gen2-dropped-copies';
export const COPIES_MAX = 5;
export const COPY_MAX_CHARS = 512 * 1024;

function read(storage) {
  let o = null;
  try { o = JSON.parse(storage.getItem(DROPPED_KEY) || 'null'); } catch { o = null; }
  if (!(o && o.v === 1 && o.copies && typeof o.copies === 'object' && !Array.isArray(o.copies))) return { v: 1, copies: {} };
  for (const k of Object.keys(o.copies)) {
    const c = o.copies[k];
    if (!(c && typeof c === 'object' && typeof c.savedAt === 'number' && c.record && typeof c.record === 'object')) delete o.copies[k];
  }
  return o;
}

const unitsIn = (rec) => (rec && Array.isArray(rec.placed) ? rec.placed.length : 0);

/* keep `record` (as it arrived, before the load cleaned it) when its load dropped `n` units. Returns true when a copy of
   this build is held afterwards (this one, or an earlier one with more units), false when nothing could be kept. */
export function keepDropped(storage, record, n, now = Date.now()) {
  if (!storage || !record || typeof record !== 'object' || !(n > 0)) return false;
  /* the record has not been sanitised yet, so its id is outside data: only a well-formed build id names a copy (an id like
     "__proto__" would write nothing and still report a copy kept), and a record without one gets a key of its own, never
     a shared one that a later unrelated build could overwrite (Terra 01a20136) */
  const id = typeof record.buildId === 'string' && BUILD_ID_RE.test(record.buildId) ? record.buildId : `no-id-${now}`;
  let json;
  try { json = JSON.stringify(record); } catch { return false; }
  if (json.length > COPY_MAX_CHARS) return false;
  try {
    const o = read(storage);
    const prev = o.copies[id];
    if (prev && unitsIn(prev.record) > unitsIn(record)) return true;   // the earlier copy holds more: keep it
    o.copies[id] = { savedAt: now, n, record: JSON.parse(json) };
    const ids = Object.keys(o.copies).sort((a, b) => o.copies[b].savedAt - o.copies[a].savedAt);
    for (const old of ids.slice(COPIES_MAX)) delete o.copies[old];
    storage.setItem(DROPPED_KEY, JSON.stringify(o));
    return true;
  } catch { return false; }
}

/* the copy held for a build, or null */
export function droppedCopy(storage, buildId) {
  if (!storage) return null;
  try { return read(storage).copies[buildId] || null; } catch { return null; }
}

/* what the visitor is told. Plain sentences, the planner's own voice; no dashes */
export function droppedNote(n, kept, redrawn = true) {
  const parts = n === 1 ? '1 part' : `${n} parts`;
  const verb = n === 1 ? 'it’s' : 'they’re';
  return `${parts} in this build couldn’t be opened, so ${verb} left off the board.` +
    (redrawn ? '' : ' Until you add a unit, the 3D view still shows the build as it was saved.') +
    (kept ? ' The build as it was saved is kept in this browser: tell us through Feedback & support and it can be recovered.' : ' Tell us through Feedback & support so it can be looked into.');
}
