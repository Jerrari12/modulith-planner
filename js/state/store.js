/* THE ONE STORE (the approved plan, §1.3): the build record, the only way in for outside data, undo history, and
   observers. The record is the planner's BUILD_FIELDS exactly (js/rules/schema.js), plus the three fields the
   planner keeps beside them and the layout rules read: `fill` (the palette's unit for a new placement), `selected`
   ({ w, h }), `selectedUnit` (an id). The rules are the planner's own, ported by copy (js/rules/layout.js).

   History is the planner's: a snapshot of the WHOLE record after every settled commit, coalesced over 350 ms so a
   drag across five cells lands as ONE entry; 50 entries; an undo never hands out an id again (the restored snapshot
   carries the smaller nextId it had back then, so "place, undo, place" would otherwise reuse one that a label job
   still names). Restores go through load() (sanitize + assign), exactly as the planner's did.

   Persistence here is the share-link form only (`#build=`, the viewer's own boot path and the planner's share link);
   the build store with Recent builds, files and IndexedDB is the plan's phase-0 leftover, not this module. */
import { layoutRules } from '../rules/layout.js';
import { BUILD_FIELDS, sanitizeBuild, serializeBuild, buildTooNew, newBuildId, cleanLook } from '../rules/schema.js';

const HISTORY_MAX = 50, COALESCE_MS = 350;

export function createStore(GEN2, opts = {}) {
  const tabletop = opts.tabletop || globalThis.GEN2_TABLETOP;
  /* `opts.extra` = { get(), set(v) }: state that rides along in every history entry beside the record and is restored
     with it on undo and redo (the palette, phase 4), but never enters the record, the hash or the planner's form */
  const extra = opts.extra || null;
  const state = {
    mount: null, length: null, fill: 'decor',
    faceStyle: GEN2.faceplateStyles[0].id, doorStyle: GEN2.doorStyles[0].id, handleStyle: GEN2.handleStyles[0].id,
    spaceW: null, spaceH: null, printer: 'any', customBed: { x: null, y: null },
    gridW: 6, gridH: 4, placed: [], selected: { w: 1, h: 1 }, selectedUnit: null, nextId: 1,
    wallStagger: false, removedStoppers: [], backCover: false, feet: 'tpu', buildPlate: 'powder', plateParts: {},
    labelStyle: null, buildId: newBuildId(), labelList: null, labelAssign: null, labelPalette: null, look: null,
  };
  const rules = () => layoutRules(state, GEN2, { tabletop });
  const subs = new Set();
  const history = { stack: [], idx: -1, timer: null, restoring: false };
  let lastRefusedNewer = false;

  const notify = (why) => { for (const fn of subs) { try { fn(state, why); } catch (e) { console.error(e); } } };
  function normalize() { const R = rules(); R.enforceMountLength(); R.syncTabletopGrid(); if (state.selectedUnit != null && !state.placed.some((u) => u.id === state.selectedUnit)) state.selectedUnit = null; }

  /* the only entry for data this session did not create: a kit record, a share link, a file, a history entry */
  function load(data, why = 'load') {
    lastRefusedNewer = false;
    if (!data || !Array.isArray(data.placed)) return { ok: false, dropped: 0 };
    if (buildTooNew(data)) { lastRefusedNewer = true; return { ok: false, dropped: 0, tooNew: true }; }
    data = JSON.parse(JSON.stringify(data));
    const dropped = sanitizeBuild(data, GEN2);
    BUILD_FIELDS.forEach((k) => { if (k in data) state[k] = data[k]; });
    state.selectedUnit = null;
    normalize();
    snapshot();
    notify(why);
    return { ok: true, dropped };
  }
  /* every mutation: fn(state) mutates in place; the store normalises, snapshots (coalesced) and notifies */
  function commit(fn, why = 'edit') {
    const r = fn(state, rules());
    normalize();
    snapshot();
    notify(why);
    return r;
  }
  /* `opts.look()` = the build's colours as chosen (the stage's look, docs/redesign/SHARE-LOOK.md): stamped into the record
     at EVERY serialisation, so the address, Undo's own write-back, Share and a file all carry the current colours */
  const serialize = () => { if (opts.look) state.look = cleanLook(opts.look()); return serializeBuild(state); };
  function pushNow() {
    clearTimeout(history.timer); history.timer = null;
    const snap = JSON.stringify(extra ? { b: serialize(), x: extra.get() } : serialize());
    if (history.stack[history.idx] === snap) return;
    history.stack = history.stack.slice(0, history.idx + 1);
    history.stack.push(snap);
    if (history.stack.length > HISTORY_MAX) history.stack.shift();
    history.idx = history.stack.length - 1;
    if (opts.onSave && history.idx > 0) opts.onSave(JSON.stringify(serialize()));   // the baseline is the record the page opened with: nothing to write back yet
  }
  function snapshot() {
    if (history.restoring) return;
    if (history.idx < 0) return pushNow();   // the baseline: captured immediately, never coalesced away
    clearTimeout(history.timer);
    history.timer = setTimeout(pushNow, COALESCE_MS);
  }
  function step(d) {
    pushNow();
    const to = history.idx + d;
    if (to < 0 || to >= history.stack.length) return false;
    history.idx = to;
    const prevNext = state.nextId, prevBuildId = state.buildId;
    const entry = JSON.parse(history.stack[to]);
    history.restoring = true;
    try { load(extra ? entry.b : entry); if (extra && entry.x !== undefined) extra.set(entry.x); } finally { history.restoring = false; }
    if (state.buildId === prevBuildId) state.nextId = Math.max(state.nextId, prevNext);
    history.stack[history.idx] = JSON.stringify(extra ? { b: serialize(), x: extra.get() } : serialize());   // the restore normalises; the entry follows the actual state
    if (opts.onSave) opts.onSave(JSON.stringify(serialize()));
    notify(d < 0 ? 'undo' : 'redo');
    return true;
  }
  return {
    state, rules, load, commit, serialize,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    undo: () => step(-1), redo: () => step(1),
    get canUndo() { return history.idx > 0 || !!history.timer; },
    get canRedo() { return history.idx < history.stack.length - 1; },
    flush: pushNow,
    get refusedNewer() { return lastRefusedNewer; },
    /* the planner's share-link form (encodeBuildHash): what the viewer's boot decodes */
    hash: () => btoa(unescape(encodeURIComponent(JSON.stringify(serialize())))),
  };
}
