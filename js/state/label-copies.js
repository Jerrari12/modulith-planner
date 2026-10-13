/* LABEL COPIES: the labels a build had in this browser, kept aside when the build comes back without them.

   The old planner kept, per build, the last label list a tab wrote (its "same-browser recovery of a dropped label list",
   Release B): an older tab could save a build back without its list. In the merged app every tab is the same version, but
   the same loss has another road in: a share link or a build file made BEFORE the labels were added (or by the old planner)
   carries the build's id and no list, and the autosave that follows would replace the Recent entry, labels and all. So when a
   link or a file arrives without labels for a build whose Recent entry has them, the entry's labels are copied here first
   (app.js), and the Labels workspace offers them back while the build on the board still has none.

   One localStorage key, `gen2-label-copies` = { v: 1, copies: { <buildId>: { savedAt, list, assign, geom, n } } }. At most
   COPIES_MAX builds (the oldest copies go first), each at most COPY_MAX_CHARS of JSON, and a copy older than COPY_MAX_AGE is
   not offered. A copy that cannot be written is dropped: no copy beats a stale one, which could bring back labels removed
   since. `geom` holds each assigned drawer's cell (x, y, w, hh) so a restore keeps an assignment only where the drawer is still
   the same drawer (unit ids are build-local; a link from elsewhere can reuse one for another drawer).
   The storage is passed in so the tests run under node; a storage that throws (private mode) makes every call a no-op. */
export const COPIES_KEY = 'gen2-label-copies';
export const COPIES_MAX = 5;
export const COPY_MAX_CHARS = 512 * 1024;
export const COPY_MAX_AGE = 30 * 24 * 3600 * 1000;

function read(storage) {
  let o = null;
  try { o = JSON.parse(storage.getItem(COPIES_KEY) || 'null'); } catch { o = null; }
  if (!(o && o.v === 1 && o.copies && typeof o.copies === 'object' && !Array.isArray(o.copies))) return { v: 1, copies: {} };
  // an entry that is not a copy (null, a string, a copy with no time) is dropped here, so nothing below trips on it (Sol 01a136b1)
  for (const k of Object.keys(o.copies)) { const c = o.copies[k]; if (!(c && typeof c === 'object' && typeof c.savedAt === 'number')) delete o.copies[k]; }
  return o;
}
function write(storage, o) {
  try {
    if (Object.keys(o.copies).length) storage.setItem(COPIES_KEY, JSON.stringify(o)); else storage.removeItem(COPIES_KEY);
    return true;
  } catch { return false; }
}

/* the copy of a record's labels: null when it has none */
export function copyOf(record, savedAt = Date.now()) {
  if (!record || !record.labelList || !Array.isArray(record.labelList.labels) || !record.labelList.labels.length) return null;
  const geom = {};
  for (const k of Object.keys(record.labelAssign || {})) {
    const u = (record.placed || []).find((p) => String(p.id) === k);
    if (u) geom[k] = [u.x, u.y, u.w, u.hh];
  }
  return { savedAt, list: record.labelList, assign: record.labelAssign || {}, geom, n: record.labelList.labels.length };
}

/* keep a build's copy; false when it could not be kept (too big, or the storage refused), in which case any older copy is gone too */
export function remember(storage, buildId, copy) {
  if (!buildId || !copy) return false;
  let size = Infinity;
  try { size = JSON.stringify(copy).length; } catch { /* not JSON: too big to hold */ }
  if (size > COPY_MAX_CHARS) { drop(storage, buildId); return false; }
  const o = read(storage);
  o.copies[buildId] = copy;
  const ids = Object.keys(o.copies).sort((a, b) => (Number(o.copies[b].savedAt) || 0) - (Number(o.copies[a].savedAt) || 0));
  for (const k of ids.slice(COPIES_MAX)) delete o.copies[k];
  if (!write(storage, o)) { drop(storage, buildId); return false; }
  return true;
}

/* the copy held for a build, if it is whole and not too old; null otherwise */
export function held(storage, buildId, now = Date.now()) {
  const c = buildId ? read(storage).copies[buildId] : null;
  if (!c || !c.list || !Array.isArray(c.list.labels) || !c.list.labels.length || typeof c.savedAt !== 'number' || !(now - c.savedAt < COPY_MAX_AGE)) return null;
  return c;
}

/* forget a build's copy; true when none is left (also when there was none). With `savedAt`, only that copy goes: another tab
   may have replaced it with a newer one since this tab read it (Sol 01a136b1), and that one is not this tab's to spend. */
export function drop(storage, buildId, savedAt = null) {
  const o = read(storage);
  const c = o.copies[buildId];
  if (!c) return true;
  if (savedAt !== null && c.savedAt !== savedAt) return false;
  delete o.copies[buildId];
  return write(storage, o);
}

/* a storage that never throws, over the real one: a private window, or one with no localStorage at all, keeps no copies */
export function safeStorage(real) {
  const dead = { getItem: () => null, setItem: () => { throw new Error('no storage'); }, removeItem: () => {} };
  try { if (!real) return dead; real.getItem(COPIES_KEY); return real; } catch { return dead; }
}
