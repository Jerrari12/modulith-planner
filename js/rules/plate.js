/* THE LABEL PLATE (docs/redesign/LABELS-INTEGRATION.md, step B1, read-only): the rules of the channel between the Labels
   workspace and the Label Studio embedded in its frame. Pure: no DOM, no window, so `node --test` executes them.

   The channel is the Part Picker modal's (step A), not the tab job protocol: the planner speaks first with a hello that
   carries a session; the Studio binds the first hello from its parent window at an origin on its list and answers `ready`
   with what it can do; every message after carries the session, and each side reads only from the window it bound. The
   planner is the owner: it sends a SNAPSHOT of the committed label state (the list as a modulith-labels document, the
   drawers each label sits on, the faceplate type, the selected label) and the Studio only shows it. The deviation from the
   plan's "the existing job protocol" is recorded there (2026-10-14, Sol 01a139ee): the job protocol is keyed by drawer and
   bound to a tab's opener; the plate shows the whole list by label id inside a frame.

   `rev` is the workspace's own counter of label-relevant changes (the list, the assignments, the label style, the faceplate,
   the build; undo and redo included). The Studio echoes it, and a reply carrying another rev, or another build, is stale. */
import { faceCarriesLabels, drawers, labelsOf, exportDoc } from './labels.js';

export const KEY = 'gen2plate';
export const V = 1;
export const LABELS_MAX = 400;            // the job protocol's bounds: one plate's worth
export const JSON_MAX = 256 * 1024;       // UTF-8 bytes of the snapshot's document
export const NEEDS = Object.freeze(['snapshot/1', 'select/1']);   // what the planner asks the Studio to offer
export const ID_RE = /^[a-z0-9]{8,32}$/;
export const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;
const isObj = (v) => Object.prototype.toString.call(v) === '[object Object]';

/* a stable string of a value (sorted keys), and a short hash of it */
export function canon(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
export function hashOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + s.length; }
const bytesOf = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length);

/* THE LABEL-RELEVANT STATE (Astra: a cabinet move must not count): the build's identity, the faceplate, the label style, the
   list, the assignments, and the ORDER of the drawers (their numbers on the plate's tags: a drawer added, removed or moved
   past another renumbers the rest - Sol 01a13a10). Two states with one signature show the same plate. */
export const labelSig = (b) => hashOf(canon({ build: b.buildId, face: b.faceStyle, style: b.labelStyle || null, list: b.labelList || null, assign: b.labelAssign || null, order: drawers(b).map((u) => u.id) }));

/* the label type the plate lays out: the faceplate's, or null when the faceplate takes no printed labels */
export const plateType = (b) => (faceCarriesLabels(b) ? (b.faceStyle === 'classicpro' ? 'classicpro' : 'edgelabel') : null);

/* { labelId: [drawer numbers, ascending] } for the labels on drawers */
export function drawersOf(b) {
  const out = {};
  const assign = b.labelAssign || {};
  drawers(b).forEach((u, i) => { const id = assign[u.id]; if (!id) return; (out[id] = out[id] || []).push(i + 1); });
  return out;
}

export const helloMessage = (session) => ({ [KEY]: 'hello', v: V, session });
export const selectMessage = (session, id, buildId) => ({ [KEY]: 'select', v: V, session, id: id || null, buildId });   // the build it belongs to: the Studio drops one for another

/* The snapshot. Over the bounds nothing of the list is sent: the message carries `doc: null` and the reason, so the Studio
   clears what it showed (a plate from the previous state must never stay printable - Sol 01a139ee). */
export function snapshot(L, b, { session, rev, selected }) {
  const base = { [KEY]: 'snapshot', v: V, session, buildId: b.buildId, rev, type: plateType(b) };
  const labels = labelsOf(b);
  const sel = selected && labels.some((l) => l.id === selected) ? selected : null;
  if (labels.length > LABELS_MAX) return { msg: { ...base, doc: null, drawers: {}, selected: null, reason: `This build has ${labels.length} labels; the plate shows at most ${LABELS_MAX}.` }, problem: 'too-many' };
  const doc = exportDoc(L, b);
  const bytes = bytesOf(JSON.stringify(doc));
  if (bytes > JSON_MAX) return { msg: { ...base, doc: null, drawers: {}, selected: null, reason: 'This build’s labels are too large to show on the plate (uploaded icons are large).' }, problem: 'too-big' };
  return { msg: { ...base, doc, drawers: drawersOf(b), selected: sel }, problem: null };
}

/* the Studio's answer to the hello: what it can do; null for anything else */
export function readReady(d) {
  if (!isObj(d) || d[KEY] !== 'ready') return null;
  const caps = Array.isArray(d.caps) ? d.caps.filter((c) => typeof c === 'string' && c.length <= 32) : [];
  return { caps };
}
export const missingCaps = (caps) => NEEDS.filter((c) => !caps.includes(c));

/* the Studio's `selected`: the label id it names, when it names a label of THIS build at THIS rev; null otherwise
   (a late click from the previous build or the previous state changes nothing - Sol 01a139ee) */
export function readSelected(d, { rev, buildId, ids }) {
  if (!isObj(d) || d[KEY] !== 'selected') return null;
  if (d.rev !== rev || d.buildId !== buildId) return null;
  if (d.id === null) return null;
  if (typeof d.id !== 'string' || !ID_RE.test(d.id) || !ids.includes(d.id)) return null;
  return d.id;
}
