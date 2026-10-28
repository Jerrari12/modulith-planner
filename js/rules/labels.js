/* THE LABEL OPERATIONS (phase 5, the Labels workspace): pure functions over a build record and the Label Studio's label-list
   module (js/vendor/label-list.js, the planner's sha-pinned copy, passed in as `L` so this file runs under node without a
   window). Ported from the planner's label-place branch (handoffs/label-release/placement/PLACEMENT-PLAN.md; Sol 01a12b25 on
   the rules): two explicit paths (DRAWER FIRST: select a drawer, click a label; PLACE SEVERAL: arm a label, tap drawers), a
   replace that is never a plain click, a Fill that is previewed and applied as the exact pairs it showed, one Undo step per
   operation. Nothing here touches the DOM, the store or the stage: every operation returns the next { list, assign } (or a
   refusal) and the caller commits it as one history entry and writes the mirror (writeMirror) for the tools that read only
   unit.label / unit.labelBadge - the stage among them. */
import { labelOrder } from '../label-panel.js';

export const LABEL_FACES = ['edgelabel', 'classicpro'];
export const faceCarriesLabels = (b) => !!b && LABEL_FACES.includes(b.faceStyle);
/* THE one eligibility rule: a label goes on a DECOR drawer whose faceplate family carries labels. A build whose faceplate changes
   keeps its assignments (its labels are not lost); nothing new can be placed until a label family is chosen again. */
export const eligible = (b, u) => !!u && u.fill === 'decor' && faceCarriesLabels(b);
export const NO_FACE_MSG = 'Labels show on EdgeLabel and Classic Pro faceplates. Choose one under Build style to place them.';

export const drawers = (b) => labelOrder((b.placed || []).filter((u) => u.fill === 'decor'));
export const drawerNumber = (b, unitId) => drawers(b).findIndex((u) => u.id === unitId) + 1;
export const labelsOf = (b) => (b && b.labelList && Array.isArray(b.labelList.labels) ? b.labelList.labels : []);
export const labelById = (b, id) => labelsOf(b).find((l) => l.id === id) || null;
export const labelWords = (l) => (l && typeof l.text === 'string' ? l.text.trim() : '');
export const isPartLabel = (l) => !!(l && (l.hardware || l.part));
// the short name the board and the panel show: a part label's value (its words before the first " · "), a typed label's words
export const labelShort = (l) => { const w = labelWords(l); return !w ? '' : isPartLabel(l) ? w.split(' · ')[0].trim() : w; };
export const hwNotReady = (l) => !!(l && l.hardware && (!Array.isArray(l.hardware.fields) || !l.hardware.fields.length
  || (Array.isArray(l.hardware.value_missing) ? l.hardware.value_missing.length : !!l.hardware.value_missing)));

export const stateOf = (b) => ({ list: b.labelList ? JSON.parse(JSON.stringify(b.labelList)) : null, assignments: { ...(b.labelAssign || {}) } });
const withList = (L, st) => ({ list: st.list || { format: L.FORMAT, version: L.VERSION, labels: [] }, assignments: st.assignments || {} });
/* which drawers carry which label: labelId -> [unitIds] */
export function carriers(b) {
  const out = new Map();
  for (const [k, id] of Object.entries(b.labelAssign || {})) { if (!out.has(id)) out.set(id, []); out.get(id).push(Number(k)); }
  return out;
}
/* waiting = a label no drawer carries (and that can go on one: an empty label never can) */
export const waiting = (L, b) => { const on = new Set(Object.values(b.labelAssign || {})); return labelsOf(b).filter((l) => !on.has(l.id) && L.assignable(l)); };
export const emptyDrawers = (b, assign = b.labelAssign) => drawers(b).filter((u) => eligible(b, u) && !(assign && assign[u.id]));
/* the next waiting label after `fromId` in list order (wrapping), or null */
export function nextWaiting(L, st, fromId) {
  const on = new Set(Object.values(st.assignments || {}));
  const ls = st.list ? st.list.labels : [];
  const at = Math.max(0, ls.findIndex((l) => l.id === fromId));
  for (let k = 1; k <= ls.length; k++) { const l = ls[(at + k) % ls.length]; if (!on.has(l.id) && L.assignable(l)) return l.id; }
  return null;
}

/* ---- the mirror (unit.label / unit.labelBadge) ---------------------------------------------------------------- */
/* An assigned drawer shows its label's mirror (an icon-only label has none); an unassigned drawer shows nothing. */
export function writeMirror(L, b) {
  const m = b.labelList ? L.mirrorOf(b.labelList, b.labelAssign) : {};
  for (const u of b.placed || []) {
    const mm = m[u.id];
    if (mm) { u.label = mm.label; if (mm.labelBadge) u.labelBadge = mm.labelBadge; else delete u.labelBadge; }
    else { delete u.label; delete u.labelBadge; }
  }
}
/* On load (a link, a file, a kit, a history entry): reconcile the list with the mirror an older tool may have edited
   (LABEL-LIST-FORMAT.md section 3, the older-tool rules), then write the mirror back. Returns whether the record changed. */
export function reconcileLoad(L, b) {
  const before = JSON.stringify([b.labelList || null, b.labelAssign || null, (b.placed || []).map((u) => [u.id, u.label || '', u.labelBadge || null])]);
  const r = L.reconcile(b.placed || [], b.labelList || null, b.labelAssign || null);
  const none = !r.list.labels.length;
  b.labelList = none ? null : r.list;
  b.labelAssign = none ? null : r.assignments;
  writeMirror(L, b);
  if (b.labelList === null) delete b.labelList; if (b.labelAssign === null) delete b.labelAssign;
  const after = JSON.stringify([b.labelList || null, b.labelAssign || null, (b.placed || []).map((u) => [u.id, u.label || '', u.labelBadge || null])]);
  return before !== after;
}
/* write a result's state into the record (null list when the last label is gone) and the mirror with it */
export function applyResult(L, b, r) {
  const none = !r.list || !r.list.labels.length;
  if (none) { delete b.labelList; delete b.labelAssign; } else { b.labelList = r.list; b.labelAssign = r.assignments; }
  writeMirror(L, b);
}

/* A COPY OFFERED BACK (js/state/label-copies.js): the labels this browser kept for a build that came back without them. An
   assignment is kept only where the drawer is still there in the cell the copy recorded, then the copy is reconciled with the
   board by the older-tool rules (never a deletion, never an edit in place): a drawer the newer link cleared sends its label to
   the tray, a drawer it renamed gets a new label and the original waits in the tray. The build on the board must have no list
   of its own: a restore never merges two lists. */
export function restoreCopy(L, b, copy) {
  if (!copy || !copy.list || !Array.isArray(copy.list.labels) || !copy.list.labels.length) return refuse('no-copy', 'There is no copy to restore.');
  if (labelsOf(b).length) return refuse('has-labels', 'This build has labels of its own now; the copy is not merged over them.');
  // the list as the reconcile will clean it: an assignment to a label the cleaning drops (an id not of the format) is not kept,
  // or its planted mirror below would mint a duplicate from the words
  const byId = new Map(L.cleanLabelList(copy.list, { inBuild: true }).labels.map((l) => [l.id, l]));
  const keep = {};
  for (const [k, id] of Object.entries(copy.assign || {})) {
    const u = (b.placed || []).find((x) => String(x.id) === k);
    const g = copy.geom && copy.geom[k];
    if (u && byId.has(id) && Array.isArray(g) && u.x === g[0] && u.y === g[1] && u.w === g[2] && u.hh === g[3]) keep[k] = id;
  }
  // a kept drawer with no words of its own shows the copy's mirror, so the older-tool rules read it as unchanged (a link made
  // before the labels carries no mirror at all; without this every kept assignment would count as "cleared")
  const units = (b.placed || []).map((u) => {
    const l = keep[u.id] ? byId.get(keep[u.id]) : null;
    if (!l || L.cleanText(u.label)) return u;
    const m = L.mirrorOfLabel(l); if (!m) return u;
    return { ...u, label: m.label, labelBadge: m.labelBadge || undefined };
  });
  const r = L.reconcile(units, copy.list, keep);
  if (!r.list.labels.length) return refuse('nothing', 'Nothing in the copy can be restored.');
  const total = r.list.labels.length, on = new Set(Object.values(r.assignments)).size;
  const moved = r.changes.filter((ch) => ch.kind === 'cleared' || ch.kind === 'edited').length;
  return done({ list: r.list, assignments: r.assignments }, `restored ${total} ${plural(total, 'label', 'labels')}`,
    `Restored ${total} ${plural(total, 'label', 'labels')} (${on} on drawers).` + (moved ? ` ${moved} ${plural(moved, 'drawer', 'drawers')} changed since kept their words; the earlier labels are in your list.` : ''));
}

/* ---- the operations: { ok: true, list, assignments, desc, msg, pick? } or { ok: false, reason, msg } ------------- */
const quote = (l, caps) => { const s = labelShort(l); return s ? `“${caps ? s.toUpperCase() : s}”` : 'the icon-only label'; };
const plural = (n, one, many) => (n === 1 ? one : many);
const caps = (b) => !(b.labelStyle && b.labelStyle.allCaps === false);
const done = (st, desc, msg, extra = {}) => ({ ok: true, list: st.list, assignments: st.assignments, desc, msg: msg || desc + '.', ...extra });
const refuse = (reason, msg) => ({ ok: false, reason, msg });

/* Put `labelId` on drawer `unitId`, whose label must still be `expect` (null = empty). mode "placing" advances the armed label
   (and stops when nothing is left to place); "drawer" keeps the drawer selected. A label on exactly one other drawer MOVES
   (that is how an assignment is corrected); one on several stays on them all. */
export function place(L, b, unitId, labelId, expect = null, mode = 'drawer') {
  const u = (b.placed || []).find((x) => x.id === unitId);
  const cur = withList(L, stateOf(b));
  const l = cur.list.labels.find((x) => x.id === labelId);
  const key = String(unitId), prev = cur.assignments[key] || null;
  if (!u || !eligible(b, u)) return refuse('drawer', u && u.fill === 'decor' ? NO_FACE_MSG : 'That unit can’t take a label: labels go on Decor drawers.');
  if (!l || !L.assignable(l)) return refuse('label', 'That label is not in this build any more.');
  if (prev !== (expect || null)) return refuse('stale', `Drawer ${drawerNumber(b, unitId)} changed in the meantime, so nothing was placed there.`);
  if (prev === labelId) return refuse('same', '');
  let st = cur;
  const from = L.assignedUnits(cur, labelId);
  if (from.length === 1) st = L.unassign(st, from[0]).state;
  const r = L.assign(st, unitId, labelId);
  if (!r.ok) return refuse('label', r.reason);
  const n = drawerNumber(b, unitId), c = caps(b);
  const was = prev ? cur.list.labels.find((x) => x.id === prev) : null;
  const desc = (was ? `${quote(l, c)} replaced ${quote(was, c)} on drawer ${n}` : `${quote(l, c)} on drawer ${n}`) + (from.length === 1 ? ` (moved from drawer ${drawerNumber(b, from[0])})` : '');
  let msg = desc + '.' + (was && !L.assignedUnits(r.state, prev).length ? ` ${quote(was, c)} is ready to place again.` : '');
  const extra = {};
  if (mode === 'placing') {
    const next = nextWaiting(L, r.state, labelId);
    const room = emptyDrawers(b, r.state.assignments).length;
    extra.pick = next && room ? next : null;
    if (!next) msg += ' Every label is on a drawer.';
    else if (!room) { const w = waiting(L, { ...b, labelList: r.state.list, labelAssign: r.state.assignments }).length; msg += ` No empty drawers left: ${w} ${plural(w, 'label stays', 'labels stay')} ready to place.`; }
  }
  return done(r.state, desc, msg, extra);
}
/* FILL EMPTY DRAWERS: the pairs a preview shows (top row first, left to right), and the apply that takes exactly those pairs */
export function fillPairs(L, b) {
  if (!faceCarriesLabels(b)) return [];
  const ready = waiting(L, b), empties = emptyDrawers(b);
  return empties.slice(0, ready.length).map((u, i) => [u.id, ready[i].id]);
}
export function fill(L, b, pairs) {
  if (JSON.stringify(pairs) !== JSON.stringify(fillPairs(L, b))) return refuse('stale', 'Your labels changed since that preview, so nothing was placed. Open Fill empty drawers again.');
  if (!pairs.length) return refuse('empty', 'Nothing to fill.');
  let st = withList(L, stateOf(b));
  for (const [u, id] of pairs) { const r = L.assign(st, u, id); if (!r.ok) return refuse('label', r.reason); st = r.state; }
  const n = pairs.length;
  return done(st, `Filled ${n} empty ${plural(n, 'drawer', 'drawers')}`, null, { pick: null });
}
export function unassign(L, b, unitId, expect) {
  const cur = withList(L, stateOf(b));
  const id = cur.assignments[String(unitId)];
  if (!id) return refuse('stale', '');
  if (expect !== undefined && id !== expect) return refuse('stale', `Drawer ${drawerNumber(b, unitId)} changed in the meantime, so its label was left alone.`);
  const l = cur.list.labels.find((x) => x.id === id);
  const st = L.unassign(cur, unitId).state;
  const desc = `${quote(l, caps(b))} removed from drawer ${drawerNumber(b, unitId)}`;
  return done(st, desc, desc + (L.assignedUnits(st, id).length ? '.' : '. It is ready to place again.'));
}
/* only a waiting label is removed from the build; one on a drawer comes off first */
export function remove(L, b, labelId) {
  const cur = withList(L, stateOf(b));
  const l = cur.list.labels.find((x) => x.id === labelId);
  if (!l) return refuse('label', 'That label is not in this build any more.');
  if (L.assignedUnits(cur, labelId).length) return refuse('carried', 'That label is on a drawer. Take it off the drawer first.');
  const st = { list: { ...cur.list, labels: cur.list.labels.filter((x) => x.id !== labelId) }, assignments: cur.assignments };
  return done(st, `Removed ${quote(l, caps(b))} from this build`, null, { pick: null });
}
/* a typed label: words (cut to the mirror's 40 so what the drawer shows is what was typed) and an optional badge */
export function add(L, b, { text, badge } = {}) {
  const words = L.cleanText(text, L.MIRROR_MAX);
  const label = { text: words };
  if (badge) label.badge = badge;
  if (!L.assignable(label)) return refuse('empty', 'Type a few words, or pick an icon or a letter.');
  const r = L.addLabel(withList(L, stateOf(b)), label, { inBuild: true });
  if (!r.ok) return refuse('bad', r.reason);
  return done(r.state, `Added ${quote(label, caps(b))}`, null, { id: r.id });
}
/* edit a label: scope 'all' everywhere it is carried, 'this' (with unitId) only on that drawer (a shared label is cloned) */
export function edit(L, b, labelId, patch, scope = 'all', unitId) {
  const cur = withList(L, stateOf(b));
  const before = cur.list.labels.find((x) => x.id === labelId);
  if (!before) return refuse('label', 'That label is not in this build any more.');
  const p = { ...patch };
  if ('text' in p) p.text = L.cleanText(p.text, L.MIRROR_MAX);
  const r = L.editLabel(cur, labelId, p, scope, unitId);
  if (!r.ok) return refuse('bad', r.reason);
  const after = r.state.list.labels.find((x) => x.id === r.id);
  const c = caps(b);
  const desc = r.cloned ? `${quote(after, c)} on drawer ${drawerNumber(b, unitId)} only` : 'text' in p && labelWords(before) !== labelWords(after) ? `${quote(before, c)} became ${quote(after, c)}`
    : 'colours' in p ? `${quote(after, c)}’s stripe ${after.colours && after.colours.band ? `is ${after.colours.band.label}` : 'is off'}` : `${quote(after, c)}’s icon changed`;
  return done(r.state, desc, null, { id: r.id, cloned: !!r.cloned });
}
/* A label's stripe (the editor's Stripe row, 2026-10-27): `colours` a stripe (label-look.js stripeFor), `null` - a PART label's
   "no stripe", which the Label Studio stores as `colours: null` so the Part Picker's own colours do not print - or undefined
   (the key gone: a part label keeps the Part Picker's colours, a typed label has none). editLabel drops a null patch value as
   "remove the key", so null is written onto the edited label after it. */
export function setStripe(L, b, labelId, colours, scope = 'all', unitId) {
  const r = edit(L, b, labelId, { colours: colours === null ? undefined : colours }, scope, unitId);
  if (!r.ok) return r;
  const list = colours === null ? { ...r.list, labels: r.list.labels.map((x) => (x.id === r.id ? { ...x, colours: null } : x)) } : r.list;
  const after = list.labels.find((x) => x.id === r.id), c = caps(b), part = isPartLabel(after);
  const what = colours ? `is ${colours.band.label}` : colours === null || !part ? 'is off' : 'is the part’s own';
  const desc = r.cloned ? r.desc : `${quote(after, c)}’s stripe ${what}`;
  return { ...r, list, desc, msg: desc + '.' };
}
/* convert a part label to plain words on one drawer: the part label goes back to the list, a typed label takes its place */
export function customWording(L, b, unitId, text) {
  const cur = withList(L, stateOf(b));
  const id = cur.assignments[String(unitId)];
  const l = cur.list.labels.find((x) => x.id === id);
  if (!l) return refuse('stale', '');
  const words = L.cleanText(text, L.MIRROR_MAX);
  if (!words) return refuse('empty', 'Type a few words first.');
  let st = L.unassign(cur, unitId).state;
  const a = L.addLabel(st, { text: words }, { inBuild: true });
  if (!a.ok) return refuse('bad', a.reason);
  const r = L.assign(a.state, unitId, a.id);
  if (!r.ok) return refuse('bad', r.reason);
  return done(r.state, `Your own words on drawer ${drawerNumber(b, unitId)}`, null, { id: a.id });
}

/* ---- imports ------------------------------------------------------------------------------------------------- */
export const HW_ITEMS_SCHEMA = 'part-picker-label-items/1';
/* a hardware item's printed words, without the layout: the value fields and the pinned attributes */
export function itemWords(it) {
  if (!it || typeof it !== 'object') return '';
  const fields = Array.isArray(it.fields) ? it.fields.filter((f) => typeof f === 'string' && f.trim()) : [];
  const pinned = new Set(Array.isArray(it.pinned) ? it.pinned : []);
  const attrs = (Array.isArray(it.attributes) ? it.attributes : []).filter((a) => a && pinned.has(a.path) && typeof a.text === 'string' && a.text.trim());
  return [fields.join(' '), ...attrs.map((a) => a.text)].filter(Boolean).join(' · ');
}
/* a labels file or link: a MODULITH label list, or a Part Picker label-items file */
export function labelsFromDoc(L, doc) {
  const obj = doc && typeof doc === 'object' && !Array.isArray(doc);
  if (obj && doc.format === L.FORMAT) {
    if (!(Number.isInteger(doc.version) && doc.version >= 1)) return { problem: 'This label list has no valid version.' };
    if (doc.version > L.VERSION) return { problem: 'These labels were made by a newer version of the label tool. Refresh this tab and add them again.' };
    if (!Array.isArray(doc.labels)) return { problem: 'This label list has no labels.' };
    return { labels: doc.labels, batchId: doc.batchId, style: doc.style };
  }
  if (obj && typeof doc.fmt === 'string' && Array.isArray(doc.labels)) {   // a Label Studio set file (its own project format)
    const d = L.fromGeneratorProject(doc);
    return { labels: d.labels, style: d.style };
  }
  const items = obj && doc.schema === HW_ITEMS_SCHEMA && Array.isArray(doc.items) ? doc.items : obj && doc.schema === L.HW_ITEM ? [doc] : null;
  if (items) return { labels: items.map((it) => ({ text: itemWords(it).slice(0, L.TEXT_MAX), hardware: it })), batchId: doc.batchId };
  return { problem: 'This is not a labels file. Use a MODULITH label list or a Part Picker label-items file.' };
}
/* append imported labels; a build with no list yet converts its typed drawers first (the same conversion a load does) */
export function importLabels(L, b, labels) {
  const base = b.labelList ? withList(L, stateOf(b)) : (() => { const r = L.reconcile(b.placed || [], null, null); return { list: r.list, assignments: r.assignments }; })();
  const r = L.appendLabels(base, labels, { inBuild: true });
  const added = r.added.length;
  if (!added) return refuse('none', r.dropped ? 'None of these labels could be read.' : 'There were no labels to add.');
  const ready = r.added.filter((x) => L.assignable(r.state.list.labels.find((l) => l.id === x))).length;
  const desc = `Added ${added} ${plural(added, 'label', 'labels')}`;
  const msg = desc + (r.remapped ? ` (${r.remapped} given new ids)` : '') + (r.dropped ? `; ${r.dropped} could not be read` : '') + '.' + (ready ? ' Select a drawer and click a label, or use Place several.' : '');
  return done(r.state, desc, msg, { pick: null, added: r.added });
}

/* THE PART PICKER'S BATCH (the planner's modal, docs/redesign/LABELS-INTEGRATION.md step A). The identity is the Picker's ROW
   (its record id), not the part's size: the same row sent again is the same label, UPDATED in place (its label id, its badge and
   its drawers kept, its words refreshed unless they were typed by hand); two rows for the same screw are two labels, as the
   visitor queued them; and one label can sit on several drawers anyway. A new row is appended; a batch naming a row twice
   keeps the last; an item that is not a part label is skipped and counted. One history entry, so one undo takes it all back. */
export function addPartItems(L, b, items) {
  const base = b.labelList ? withList(L, stateOf(b)) : (() => { const r = L.reconcile(b.placed || [], null, null); return { list: r.list, assignments: r.assignments }; })();
  const byPart = new Map();
  for (const l of base.list.labels) { const id = l.hardware && typeof l.hardware.id === 'string' ? l.hardware.id : null; if (id && !byPart.has(id)) byPart.set(id, l); }
  const fresh = [], updated = [], at = new Map();
  let skipped = 0, kept = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object' || it.schema !== L.HW_ITEM || typeof it.id !== 'string') { skipped++; continue; }
    const text = itemWords(it).slice(0, L.TEXT_MAX);
    const have = byPart.get(it.id);
    if (have) {
      // words typed by hand over the part's own (the text no longer equals what its record produces) are kept: the record is
      // refreshed underneath them, the words are the visitor's (Astra, 2026-10-13)
      const own = have.text !== itemWords(have.hardware).slice(0, L.TEXT_MAX);
      const c = L.cleanLabel({ ...have, text: own ? have.text : text, hardware: it }, { inBuild: true });
      if (!c) { skipped++; continue; }
      for (const k of Object.keys(have)) delete have[k];   // the same object (its place in the list), the cleaned contents only
      Object.assign(have, c);
      if (own) kept++;
      if (!updated.includes(have.id)) updated.push(have.id);
      continue;
    }
    const label = { text, hardware: it };
    if (at.has(it.id)) fresh[at.get(it.id)] = label; else { at.set(it.id, fresh.length); fresh.push(label); }
  }
  const r = L.appendLabels(base, fresh, { inBuild: true });
  skipped += r.dropped;
  const added = r.added.length;
  if (!added && !updated.length) return refuse('none', skipped ? 'None of these part labels could be read.' : 'There were no part labels to add.');
  const parts = [];
  if (added) parts.push(`Added ${added} part ${plural(added, 'label', 'labels')}`);
  if (updated.length) parts.push(`${added ? 'updated' : 'Updated'} ${updated.length} already in the list` + (kept ? ` (your own words kept on ${kept})` : ''));
  const desc = parts.join(', ');
  return done(r.state, desc, desc + (skipped ? `; ${skipped} could not be read` : '') + '.', { pick: null, added: r.added, updated, skipped });
}

/* ---- exports ------------------------------------------------------------------------------------------------- */
/* the build's labels as a standalone label list (the format, with the build's style; assignments stay in the build) */
export function exportDoc(L, b) {
  const labels = labelsOf(b).map((l) => JSON.parse(JSON.stringify(l)));
  const doc = { format: L.FORMAT, version: L.VERSION, labels };
  if (b.labelStyle && Object.keys(b.labelStyle).length) doc.style = { ...b.labelStyle };
  return doc;
}
/* one line per drawer in drawer order, then the waiting labels */
export function exportText(L, b) {
  const c = caps(b), show = (s) => (c ? s.toUpperCase() : s);
  const lines = [];
  for (const u of drawers(b)) { const l = labelById(b, (b.labelAssign || {})[u.id]); if (l) lines.push(`Drawer ${drawerNumber(b, u.id)}: ${show(labelWords(l)) || '(icon only)'}`); }
  const w = waiting(L, b);
  if (w.length) { lines.push('', 'Ready to place:'); for (const l of w) lines.push(show(labelWords(l)) || '(icon only)'); }
  return lines.join('\n') + '\n';
}
