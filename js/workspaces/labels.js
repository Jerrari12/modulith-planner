/* THE LABELS WORKSPACE (phase 5). One shared label list, two ways onto the drawers (the planner's label-place design, Joey +
   Astra, PLACEMENT-PLAN.md): DRAWER FIRST - tap a drawer on the model, then click a label, and the drawer stays selected;
   PLACE SEVERAL - arm a label, then tap drawers one after another. A click never replaces silently (the Replace dialog), Fill
   empty drawers previews its exact pairs, every operation is one Undo step with a "Last change" line, and the model is the
   record: the stage redraws the label text in place after each commit (stage.setLabels).
   The list itself: typed labels (words, an icon or a letter), labels from a file (a MODULITH label list, a Part Picker items
   file, a Label Studio set) or from a #labels-add= link, the set-wide label settings, and exports. The print plate stays the
   Label Studio's job: the LABEL PLATE view (step B1) shows this build's list as the Studio lays it out, in a frame, with its
   print file to download, and the Part Picker opens in a modal.
   SINCE 2026-11-23 (Joey: "Full redesign now") the panel is three steps - Style, Drawers, Print - with a drawer map and a
   one-drawer editor where typing on a drawer creates and places its label in one step; see THE STEPS below. */
import { el, makeToast, trapTab } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { glyphEl, FACEK } from '../ui/glyph.js';
import { topbar } from '../ui/topbar.js';
import { toolbar } from '../ui/toolbar.js';
import { isPhone, phoneChrome } from '../ui/phone.js';
import { generateManifest } from '../generate.js';
import * as R from '../rules/labels.js';
import * as P from '../rules/plate.js';
import { LABEL_STYLE_ROWS, styleEdit, iconGroups, effectiveStyle, labelUploadFor, isLabelSvg } from '../label-panel.js';
import { loadLabelFont, loadLabelParts, labelIcons } from '../label-text.js';
import { labelLookOf, labelLookOfLabel, cleanStripe, STRIPE_COLOURS, stripeFor } from '../label-look.js';
import { labelPreviewUrl, previewNeeds, previewReady } from '../label-preview.js';
import { LABEL_MEANINGS, SUGGESTED_BODY_TEXT, CATALOG, spoolsOf, spoolFor, paletteOf, samePalette, paletteWarnings, warningText, rankSpools, urlFor,
  readLabelDefaults, writeLabelDefaults, paletteOfDefaults, setOf, suggestedPalette } from '../label-palette.js';
import { readOwned } from '../state/owned.js';
// the parts drawer (M3, 2026-11-05): compartment labels into this list, through ctx.partsDrawer (app.js loads it only with the flag, 2026-11-08)
import { attachHint, hideHint, scene, appear, moveTo, blink } from '../ui/hint.js';
import { partPicker, armWait, STUDIO, STUDIO_ORIGIN, newSession } from '../ui/partpicker.js';   // the Part Picker modal and the Studio it points at (2026-11-07)

// eslint-disable-next-line no-undef
const G = typeof GEN2 !== 'undefined' ? GEN2 : null;   // the planner's catalog: a classic-script LEXICAL global, not a globalThis property

/* ---- the Part Picker tile's brand icon (its bolt), and the hover scenes ---- */
const PICKER_ICON = () => scene('0 0 16 16', '<path fill="currentColor" d="M4.2 1h7.6l1.7 2.6-1.7 2.6H4.2L2.5 3.6zM6.6 6.2h2.8V15H6.6z"/>');
/* every scene is 240 x 110 on one 4 s loop; a label strip is the EdgeLabel outline (the slanted right edge) */
const strip = (x, y, w = 92, h = 34, extra = '') => `<g transform="translate(${x} ${y})" ${extra}><polygon points="0,0 ${w},0 ${w - h * 0.9},${h} 0,${h}" fill="#f4f1ec"/>`;
const SCENES = {
  file: () => scene('0 0 240 110', `
    <g opacity="0">${appear(0.02, 0.5)}${moveTo(30, -30, 30, 22, 0.05, 0.25)}
      <path d="M0 0h26l12 12v38H0z" fill="#e9e6df"/><path d="M26 0v12h12" fill="#cfcbc2"/>
      <rect x="6" y="20" width="22" height="3" rx="1" fill="#9a9a9a"/><rect x="6" y="28" width="26" height="3" rx="1" fill="#9a9a9a"/><rect x="6" y="36" width="18" height="3" rx="1" fill="#9a9a9a"/></g>
    <g opacity="0">${appear(0.34)}${strip(112, 18, 100, 28)}<text x="10" y="19" font-family="Archivo, system-ui" font-weight="800" font-size="12" fill="#1b1b1b">M4 × 16</text></g></g>
    <g opacity="0">${appear(0.48)}${strip(112, 52, 100, 28)}<text x="10" y="19" font-family="Archivo, system-ui" font-weight="800" font-size="12" fill="#1b1b1b">HEX KEYS</text></g></g>
    <text x="120" y="100" text-anchor="middle" font-family="IBM Plex Sans, system-ui" font-size="10" fill="#9a9a9a" opacity="0">${appear(0.6)}a label list, a Part Picker file, a Studio set</text>`),
  picker: () => scene('0 0 240 110', `
    ${[0, 1, 2].map((i) => `<g transform="translate(${26 + i * 34} 18)"><rect x="0" y="0" width="16" height="9" rx="2" fill="#8a8f98"/><rect x="4" y="9" width="8" height="${22 + i * 10}" fill="#aab0b8"/></g>`).join('')}
    <rect x="56" y="12" width="28" height="56" rx="6" fill="none" stroke="#FF6A1A" stroke-width="2" opacity="0">${appear(0.34)}</rect>
    <g opacity="0">${appear(0.04, 0.5)}${moveTo(120, 80, 72, 40, 0.08, 0.26)}<path d="M0 0l0 14 4-3 3 6 3-1.5-3-6 5-.5z" fill="#1b1b1b" stroke="#fff" stroke-width="1"/></g>
    <g opacity="0">${appear(0.52)}${strip(128, 28, 100, 34)}<text x="9" y="15" font-family="Archivo, system-ui" font-weight="800" font-size="12" fill="#1b1b1b">M4 × 20</text><text x="9" y="28" font-family="IBM Plex Sans, system-ui" font-weight="600" font-size="8" fill="#1b1b1b">SOCKET CAP · STEEL</text></g></g>
    <text x="120" y="100" text-anchor="middle" font-family="IBM Plex Sans, system-ui" font-size="10" fill="#9a9a9a">screws, nuts, washers and inserts become labels</text>`),
  fill: () => scene('0 0 240 110', `
    ${[[0, 0], [1, 0], [0, 1], [1, 1]].map(([c, r]) => `<rect x="${22 + c * 62}" y="${14 + r * 40}" width="58" height="36" rx="4" fill="#2b3a4e" stroke="#4d5f78"/>`).join('')}
    ${[[0, 0, 0.12], [1, 0, 0.36], [0, 1, 0.6]].map(([c, r, at]) => `<g>${moveTo(170, 20 + (c + r * 2) * 24, 26 + c * 62, 20 + r * 40, at, 0.18)}<polygon points="0,0 50,0 32,24 0,24" fill="#f4f1ec"/></g>`).join('')}
    <text x="120" y="102" text-anchor="middle" font-family="IBM Plex Sans, system-ui" font-size="10" fill="#9a9a9a">top row first, left to right · one Undo</text>`),
  several: () => scene('0 0 240 110', `
    ${[[0, 0], [1, 0], [2, 0]].map(([c, r]) => `<rect x="${22 + c * 66}" y="${18 + r * 40}" width="60" height="44" rx="4" fill="#2b3a4e" stroke="#4d5f78"/>`).join('')}
    ${[[0, 0.14], [1, 0.42], [2, 0.7]].map(([c, at]) => `<g opacity="0">${appear(at)}<polygon transform="translate(${28 + c * 66} 28)" points="0,0 48,0 31,22 0,22" fill="#f4f1ec"/></g>`).join('')}
    <g>${moveTo(52, 92, 52, 50, 0.04, 0.1)}${moveTo(52, 50, 118, 50, 0.3, 0.12)}<circle r="9" fill="none" stroke="#FF6A1A" stroke-width="2"><animate attributeName="r" values="9;9;4;9;9;4;9;9;4;9" keyTimes="0;.1;.14;.2;.38;.42;.48;.66;.7;.76" dur="4s" repeatCount="indefinite"/></circle></g>
    <text x="120" y="102" text-anchor="middle" font-family="IBM Plex Sans, system-ui" font-size="10" fill="#9a9a9a">tap a drawer, the next label follows</text>`),
};
/* a hint plays img/hints/labels-<key>.mp4 when that clip exists (Joey: a 10-15 s recording, as for 3D Printopia); the SVG
   scene is the placeholder until then - see img/hints/README.md */
/* the clips were recorded on the panel before the 2026-11-23 redesign: the actions they show (a file, the Part Picker, Fill,
   Place several) work as they did, around an older panel; Type a label's control went with the redesign, and its clip with it */
const HINTS = {
  file: { title: 'Add from a file', text: 'A MODULITH label list, a Part Picker label-items file, or a Label Studio set. They wait in the tray.', scene: SCENES.file, video: `img/hints/labels-file.mp4` },
  picker: { title: 'Hardware labels', text: 'Choose screws, nuts, washers and inserts in the Part Picker; each becomes a label laid out from its part record, waiting in the tray.', scene: SCENES.picker, video: `img/hints/labels-picker.mp4` },
  fill: { title: 'Fill empty drawers', text: 'Every waiting label onto an empty drawer, top row first, left to right. One Undo takes it back.', scene: SCENES.fill, video: `img/hints/labels-fill.mp4` },
  several: { title: 'Place several', text: 'Arm a label, then tap drawers one after another; the next waiting label follows.', scene: SCENES.several, video: `img/hints/labels-several.mp4` },
};
const LABEL_STUDIO_URL = 'https://labels.modulith.systems/';
const n = (k, one, many = one + 's') => `${k} ${k === 1 ? one : many}`;
const sigOf = (m) => { const s = JSON.stringify(m); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + s.length; };
const FACE_LABEL = Object.fromEntries((G?.faceplateStyles || []).map((f) => [f.id, f.label]));
const FILL_LABEL = (id) => (G?.fills || []).find((f) => f.id === id)?.label || id;

/* the Label Studio's label-list module: a classic script (the planner's sha-pinned copy), loaded once on first use */
let LLp = null;
export const loadLabelList = () => LLp || (LLp = new Promise((res, rej) => {
  if (globalThis.GEN2LabelList) return res(globalThis.GEN2LabelList);
  const s = document.createElement('script');
  s.src = new URL('../vendor/label-list.js', import.meta.url).href;
  s.onload = () => (globalThis.GEN2LabelList ? res(globalThis.GEN2LabelList) : rej(new Error('label-list.js did not register')));
  s.onerror = () => { LLp = null; rej(new Error('label-list.js failed to load')); };
  // appended once the page has loaded: a script added before the load event holds that event until it arrives, and the
  // boot mounts this workspace a few ms either side of it (2026-11-07: one module more in the graph moved the mount
  // before load, and the e2e case that holds label-list.js back then waited on the page's load for ever)
  let added = false; const add = () => { if (!added) { added = true; document.head.appendChild(s); } };
  if (document.readyState === 'complete') add(); else { addEventListener('load', add, { once: true }); setTimeout(add, 2000); }   // or after 2 s, should something unrelated hold the page's load (Terra 01a1b910)
}));
/* the tab badge: labelled drawers over the drawers that can take a label (the brief: "labelled/slots") */
export function labelsBadge(b) {
  if (!b || !Array.isArray(b.placed)) return null;
  const slots = b.placed.filter((u) => R.eligible(b, u));
  if (!slots.length) return null;
  const on = slots.filter((u) => b.labelAssign && b.labelAssign[u.id]).length;
  return `${on}/${slots.length}`;
}
const b64urlJson = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(t + '='.repeat((4 - (t.length % 4)) % 4))))); };

export function mountLabels(stage, ctx) {
  const ac = new AbortController(); const signal = ac.signal;
  const store = ctx.store;
  const S = () => store.state;
  // step: 'style' | 'drawers' | 'print' (stepNow() resolves it against the faceplates); listOnly: the visitor chose a list
  // without changing faceplates; draft: { unitId, text } being typed in the one-drawer editor; scope: that editor's reach on
  // a label several drawers share
  const st = { selId: null, sel: null, pick: null, edit: null, status: '', warn: false, query: '', letter: '', settings: false, iconsOpen: new Set(), hover: null, drag: null, dragEnd: null, fresh: null, view: 'build', selLabel: null,
    step: 'drawers', listOnly: false, draft: null, scope: 'all', allStripes: false };
  // a label stripe's spool tapped in the Colors room (colors.js openSwap): the Print step opens on that meaning's picker
  if (ctx.memo && ctx.memo.labelPalette) { const p = ctx.memo.labelPalette; delete ctx.memo.labelPalette; Object.assign(st, { step: 'print', palPick: p.pick || null, palQ: '' }); }
  let L = null;   // the label-list module once loaded
  const root = el('div', { id: 'ws' });
  document.body.appendChild(root);
  const { say, soon } = makeToast(root);
  root.prepend(topbar(stage, { ...ctx, active: 'labels', say, soon, signal }));
  const bar = toolbar(stage, { history: { undo: () => store.undo(), redo: () => store.redo(), get canUndo() { return store.canUndo; }, get canRedo() { return store.canRedo; } } });
  root.appendChild(bar.el);

  /* ---------------- the record, the stage ---------------- */
  // the stage's view, as Build's tryShow: a build's empty slots are ghosts, not a refusal (generate.js opts.voids, 2026-10-21)
  const tryGen = (rec) => { try { return generateManifest(rec, { voids: true }); } catch (e) { return { manifest: null, errors: [String((e && e.message) || e)] }; } };
  let lastSig = null, queue = Promise.resolve();
  { const g = tryGen(store.serialize()); lastSig = g.manifest ? sigOf(g.manifest) : null; }
  /* a record of another mount or length is the setup sheet's reload, not a scene this stage can show (its parts pool and
     mount scene are fixed at boot) - the same wait as Build's syncStage, 2026-10-19 */
  const otherScene = (rec) => !!stage.build && (rec.mount !== stage.build.mount || +rec.length !== +stage.build.length);
  function syncStage() {
    queue = queue.then(async () => {
      const rec = store.serialize();
      if (otherScene(rec)) return;
      const gen = tryGen(rec);
      if (!gen.manifest) return;
      const sig = sigOf(gen.manifest);
      if (sig !== lastSig) {
        lastSig = sig; const r = await stage.update(rec, gen); if (r.ok) { stage.skipToEnd(); stage.setDims(false); }
        /* the dock's size line and the View toolbar read the stage: drawn again now that it has rebuilt (an undo from here
           left them stale, the GPU pass 2026-10-23). Only those: a whole renderAll() here would rebuild an open label editor
           from the stored label and wipe a word being typed while the stage rebuilt (Terra 01a16a49, and the 2026-10-18 lesson) */
        renderDock(); bar.sync();
      }
      else stage.setLabels(rec);
      if (st.selId != null && !S().placed.some((u) => u.id === st.selId)) { st.selId = null; st.sel = null; }
    }).catch((e) => console.error(e));
    return queue;
  }
  const unsub = store.subscribe((state, why) => {
    const sig = P.labelSig(state, st.print); if (sig !== lastLabelSig) { lastLabelSig = sig; labelRev++; syncPlateSoon(); }   // a label-relevant change: a new rev, the plate follows
    // an undo, a redo or a load: the status line described the state before it ("Removed …" outlived the toolbar's Undo of
    // that remove, the stress test 2026-10-15), so it goes
    if (why === 'adopt') return; if (why === 'undo' || why === 'redo' || why === 'load') { st.draft = null; /* words half-typed belong to the state before: the stage redraws from the record below, the editor from it too (Sol 01a20bde) */ if (st.pick && !R.labelById(state, st.pick)) st.pick = null; if (st.edit && !R.labelById(state, st.edit.id)) st.edit = null; status(''); } syncStage(); renderAll(); });
  /* one label operation = one history entry (flushed on both sides of the commit, so the 350 ms coalescing never joins it to a
     neighbour); "Last change" remembers it while the WHOLE record is still what it produced (Sol 01a13518: a later settings
     change, or any other edit, must not be what the panel's Undo takes back). `also(s)` runs inside the same commit, for what
     belongs to the operation (an imported set's style). */
  function labelCommit(r, why = 'label', also = null) {
    st.fresh = null;   // the labels a Part Picker batch just brought stay marked until the next label change
    if (!r.ok) { if (r.msg) status(r.msg, true); renderAll(); return false; }
    store.flush();
    // the panel state changes INSIDE the commit, so the subscriber's render already sees the armed label and the status
    store.commit((s) => { R.applyResult(L, s, r); if (also) also(s); if ('pick' in r) st.pick = r.pick; status(r.msg || ''); }, why);
    store.flush();
    renderAll();
    return true;
  }
  /* the compartment labels (M3) added to the list, one undo step, through the same path as a label change */
  function compCommit(rows) {
    store.flush();
    let added = 0;
    store.commit((s) => { added = ctx.partsDrawer.addToList(L, s, +s.length, rows); status(added ? `Added ${added} compartment label${added === 1 ? '' : 's'} to the list.` : 'Nothing to add.'); }, 'label');
    store.flush();
    renderAll();
  }
  /* what an operation says: a refusal or a problem stays in the panel's foot until the next operation (the review: errors
     persist); everything else is a toast, read out politely (#ws-toast is aria-live). The panel's own Undo and its "Last
     change" line went with the redesign: the toolbar's Undo takes back any step, a label's included. */
  const status = (msg, warn = false) => { if (warn) { st.status = msg || ''; st.warn = true; } else { st.status = ''; st.warn = false; st.said = msg || ''; if (msg && !st.hush) say(msg); } };   // hush: a message that is about to be composed into another (importOpened) is not read out twice
  const unit = (id) => S().placed.find((u) => u.id === id) || null;
  const assignOf = () => S().labelAssign || {};
  const caps = () => effectiveStyle(S()).allCaps;
  const shown = (s) => (caps() ? String(s).toUpperCase() : String(s));
  const quote = (l) => { const s = R.labelShort(l); return s ? `“${shown(s)}”` : 'the icon-only label'; };
  const selectedDrawer = () => (st.pick || st.selId == null ? null : unit(st.selId));

  /* ---------------- placing ---------------- */
  function tapDrawer(unitId) {
    st.hover = null;   // the record's own mirror follows the commit (syncStage); a refused tap keeps nothing of the preview either
    const u = unit(unitId); if (!u || !st.pick) return;
    if (!R.eligible(S(), u)) { status(u.fill !== 'decor' ? `Labels go on Decor drawers, not on a ${FILL_LABEL(u.fill).toLowerCase()}.` : R.NO_FACE_MSG, true); renderAll(); return; }
    const prev = assignOf()[u.id] || null;
    if (prev === st.pick) return;
    if (prev) askReplace(u.id, st.pick, prev, 'placing'); else labelCommit(R.place(L, S(), u.id, st.pick, null, 'placing'));
  }
  function chooseLabel(id) {
    const l = R.labelById(S(), id); if (!l || !L.assignable(l)) return;
    const u = selectedDrawer();
    if (u && R.eligible(S(), u)) {
      const prev = assignOf()[u.id] || null;
      if (prev === id) return;
      if (prev) askReplace(u.id, id, prev, 'drawer'); else labelCommit(R.place(L, S(), u.id, id, null, 'drawer'));
      return;
    }
    armPlacing(st.pick === id ? null : id);
  }
  function armPlacing(id) {
    if (id && !R.faceCarriesLabels(S())) { status(R.NO_FACE_MSG, true); renderAll(); return; }
    const l = id ? R.labelById(S(), id) : null;
    st.pick = l && L.assignable(l) ? id : null;
    if (st.pick) { st.selId = null; st.edit = null; status(''); stage.setSelected(null); setSelLabel(st.pick); if (phone) phone.collapse(panel); }   // the model stays uncovered while placing (Joey's phone finding)
    hoverPreview(null); stage.watchHover(!!st.pick);
    renderAll();
  }
  /* THE PREVIEW WHILE PLACING (a phase-5 deferral): the empty drawer under the pointer wears the armed label's words before the
     click, through the stage's mirror alone (setLabels on a copy of the record; the record itself does not change). Leaving
     the drawer, or placing, puts the record's own mirror back. */
  function hoverPreview(unitId) {
    const pick = st.drag || st.pick;   // the label being dragged from the list, else the armed one (Terra 01a136e5)
    const u = unitId != null && pick ? unit(unitId) : null;
    const l = u ? R.labelById(S(), pick) : null;
    const show = !!(u && l && R.eligible(S(), u) && !assignOf()[u.id]);
    if (!show) { if (st.hover != null) { st.hover = null; stage.setLabels(store.serialize()); } return; }
    if (st.hover === u.id) return;
    st.hover = u.id;
    const rec = store.serialize(); const m = L.mirrorOfLabel(l);
    const p = rec.placed.find((x) => x.id === u.id);
    if (p && m) { p.label = m.label; if (m.labelBadge) p.labelBadge = m.labelBadge; else delete p.labelBadge; }
    stage.setLabels(rec);
  }
  /* DRAG A LABEL ONTO A DRAWER (a phase-5 deferral): a mouse or pen drag from a waiting label's chip (never touch: the sheet
     scrolls) carries a ghost of its words; over the model the drawer under the pointer previews it, and letting go places
     it by the drawer-first rule (a labelled drawer asks to replace, as a tap does). Escape or a drop elsewhere cancels. */
  function dragFrom(chip, labelId) {
    chip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType === 'touch' || chip.disabled) return;
      const x0 = e.clientX, y0 = e.clientY; let ghost = null, over = null;
      try { chip.setPointerCapture(e.pointerId); } catch { /* a browser without capture: the move reaches us while over the chip */ }   // from the press, so a pointer that slips off the chip before the threshold still drags (Terra 01a136e5)
      const move = (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
          const l = R.labelById(S(), labelId); if (!l) return;
          ghost = el('div.drag-ghost.glass', { text: R.labelShort(l) || 'label' }); root.appendChild(ghost);
          st.drag = labelId; st.dragEnd = () => end(false); document.body.classList.add('dragging-label');
        }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        over = target && target.tagName === 'CANVAS' ? stage.unitAt(ev.clientX, ev.clientY) : null;
        hoverPreview(over);
      };
      const end = (drop) => {
        chip.removeEventListener('pointermove', move); chip.removeEventListener('pointerup', up); chip.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', key);
        if (!ghost) return;
        ghost.remove(); ghost = null; st.drag = null; st.dragEnd = null; st.hover = null; document.body.classList.remove('dragging-label');
        stage.setLabels(store.serialize());   // the preview goes, whatever happens next
        if (drop && over != null) dropOn(over, labelId);
      };
      const up = () => end(true), cancel = () => end(false);
      const key = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); end(false); } };
      chip.addEventListener('pointermove', move); chip.addEventListener('pointerup', up); chip.addEventListener('pointercancel', cancel); document.addEventListener('keydown', key);
    });
  }
  function dropOn(unitId, labelId) {
    const u = unit(unitId); if (!u) return;
    if (!R.eligible(S(), u)) { status(u.fill !== 'decor' ? `Labels go on Decor drawers, not on a ${FILL_LABEL(u.fill).toLowerCase()}.` : R.NO_FACE_MSG, true); renderAll(); return; }
    const prev = assignOf()[u.id] || null;
    if (prev === labelId) return;
    if (prev) askReplace(u.id, labelId, prev, 'drawer'); else labelCommit(R.place(L, S(), u.id, labelId, null, 'drawer'));
  }
  let pendingReplace = null;
  function askReplace(unitId, labelId, expect, mode) {
    const l = R.labelById(S(), labelId), was = R.labelById(S(), expect), no = R.drawerNumber(S(), unitId);
    const shared = Object.values(assignOf()).filter((v) => v === expect).length > 1;
    pendingReplace = { unitId, labelId, expect, mode };
    openModal({ title: `Replace the label on drawer ${no}?`, body: [`${quote(l)} goes on drawer ${no}. ` + (shared ? `${quote(was)} stays on its other drawers.` : `${quote(was)} goes back to your labels, ready to place again.`)], ok: 'Replace label',
      onOk: () => { const r = pendingReplace; pendingReplace = null; closeModal(); if (r) labelCommit(R.place(L, S(), r.unitId, r.labelId, r.expect, r.mode)); },
      onCancel: () => { pendingReplace = null; closeModal(); renderAll(); } });
  }
  function openFill() {
    const pairs = R.fillPairs(L, S()); if (!pairs.length) return;
    const ready = R.waiting(L, S()), rest = ready.slice(pairs.length), k = pairs.length;
    const list = el('div.pairs', {}, pairs.map(([u, id]) => el('div.pair', {}, [el('b', { text: R.drawerName(S(), u) }), el('span', { text: shown(R.labelShort(R.labelById(S(), id))) || '(icon only)' })])));
    const body = [`Place ${n(k, 'label')} in the empty ${k === 1 ? 'drawer' : 'drawers'}` + (rest.length ? `; ${rest.length} ${rest.length === 1 ? 'stays' : 'stay'} ready to place.` : '.'), list];
    if (rest.length) body.push(el('p.rest', { text: 'Stay ready to place: ' + rest.map((l) => shown(R.labelShort(l)) || '(icon only)').join(', ') }));
    body.push('Order: top row first, left to right. One Undo takes the whole fill back.');
    openModal({ title: 'Fill empty drawers', body, ok: `Place ${n(k, 'label')}`, onOk: () => { closeModal(); labelCommit(R.fill(L, S(), pairs)); }, onCancel: () => closeModal() });
  }

  /* ---------------- the modal (Replace, Fill, Use custom wording) ---------------- */
  const modal = el('div', { id: 'ws-modal', role: 'dialog', 'aria-modal': 'true', hidden: true });
  root.appendChild(modal);
  let modalState = null;
  function openModal({ title, body, ok, onOk, onCancel, field = null }) {
    modalState = { onOk, onCancel, ret: document.activeElement };
    const box = el('div.glass.box', {}, [
      el('h3', { text: title }),
      ...body.map((x) => (typeof x === 'string' ? el('p', { text: x }) : x)),
      field ? el('input.field', { type: 'text', maxlength: '40', placeholder: field.placeholder || '', value: field.value || '', autocomplete: 'off', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); onOk(); } } }) : null,
      el('div.btns', {}, [el('button.key', { text: 'Cancel', onclick: () => onCancel() }), el('button.key.on', { text: ok, onclick: () => onOk() })]),
    ]);
    modal.replaceChildren(box); modal.hidden = false;
    try { (box.querySelector('input.field') || box.querySelector('button.key.on')).focus(); } catch { /* jsdom */ }
  }
  function closeModal() { modal.hidden = true; modal.replaceChildren(); const ret = modalState && modalState.ret; modalState = null; if (ret && typeof ret.focus === 'function' && document.contains(ret)) { try { ret.focus(); } catch { /* gone */ } } }
  modal.addEventListener('click', (e) => { if (e.target === modal && modalState) modalState.onCancel(); });
  trapTab(modal);
  const modalField = () => modal.querySelector('input.field')?.value || '';

  /* ---------------- the panel ---------------- */
  const panel = el('aside.glass', { id: 'ws-labels', 'aria-label': 'Labels' });
  root.appendChild(panel);
  const fileIn = el('input', { id: 'ws-labelsfile', type: 'file', accept: '.json,application/json', hidden: true });   // an id of its own: the build switcher has a file input of the same kind
  fileIn.addEventListener('change', async () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (!f) return; let doc; try { doc = JSON.parse(await f.text()); } catch { status('That file is not a labels file (it is not JSON).', true); renderAll(); return; } importDoc(doc, 'file'); });
  root.appendChild(fileIn);
  function importDoc(doc, how) {
    const got = R.labelsFromDoc(L, doc);
    if (got.problem) { status(got.problem, true); renderAll(); return 'bad'; }
    // a set file's settings come with its labels, in the same history entry, when this build has none of its own yet
    const style = got.style && Object.keys(got.style).length && !S().labelStyle ? got.style : null;
    const ok = labelCommit(R.importLabels(L, S(), got.labels), 'labels-add', style ? (s) => { for (const [k, v] of Object.entries(style)) styleEdit(s, k, v); } : null);
    // what arrived is in view: the Drawers step, its tray (on faceplates without labels, as a list - nothing else would show them)
    if (ok) { const fromStyle = stepNow() === 'style'; st.pick = null; st.selId = null; if (!R.faceCarriesLabels(S())) st.listOnly = true; if (fromStyle && st.view !== 'plate') st.step = 'drawers'; stage.setSelected(null); renderAll(); if (phone) phone.open(panel); }   // only off the Style step: Drawers and Print show them already (Terra 01a20bea)
    return ok ? 'added' : 'bad';
  }
  /* a labels link (the Label Studio's "Add to planner build", or a shared labels link): imported once. The one a page opened
     with waits in ctx.memo.labelsAdd (app.js took it out of the address at boot, 2026-10-22); one set on a page already open
     is read from the hash and dropped from it; the build's own #build= part stays */
  const decodeLink = (enc) => { try { return b64urlJson(decodeURIComponent(enc)); } catch { return undefined; } };
  function importLink(enc, doc = decodeLink(enc)) {
    if (doc === undefined) { status('This labels link is damaged; nothing was added.', true); renderAll(); return; }
    importDoc(doc, 'link');
  }
  /* the link this page opened with. On a build that came back without labels this browser kept for it (the old planner's
     cutover redirect sends its own slot as #build= beside the Studio's link), the kept labels come back first and the
     link's are added to them; a link that would add nothing (damaged, empty, unreadable) restores nothing, and the offer
     stays. The stored copy is kept but marked (ctx.labelCopy.restored(), not done()): the tab that opened the Studio may
     still hold the build without labels, and its next save would leave the copy the only place they are; marked, it is
     only ever offered again, never restored automatically twice. Imported straight onto the empty board, the link's
     labels hid the offer; a wait for the visitor's choice raised more than it solved (skeptic checks, 2026-10-22) */
  function importOpened() {
    const enc = ctx.memo?.labelsAdd; if (!enc || !L) return;
    ctx.memo.labelsAdd = null;
    const doc = decodeLink(enc);
    const got = doc === undefined ? null : R.labelsFromDoc(L, doc);
    const brings = !!got && !got.problem && R.importLabels(L, S(), got.labels).ok;   // a dry run: it would add at least one
    let back = 0;
    const kept = ctx.labelCopy && ctx.labelCopy.copy;
    if (brings && kept && !kept.restored && !R.labelsOf(S()).length) {
      const live = ctx.labelCopy.take();
      if (live && !live.restored && labelCommit(R.restoreCopy(L, S(), live), 'labels-restore')) { ctx.labelCopy.restored(); back = R.labelsOf(S()).length; }
    }
    st.hush = !!back;   // the link's own result goes into the message below, read out once (Terra 01a20bea)
    try { importLink(enc, doc); } finally { st.hush = false; }
    if (back) { status(`Brought back the ${n(back, 'label')} this browser kept for this build. ${st.warn ? st.status : st.said || ''}`.trim(), st.warn); renderAll(); }   // both in one message: the restore, then what the link did
  }
  function importFromHash() {
    const m = /(?:^#|&)labels-add=([^&]+)/.exec(location.hash || '');
    if (!m) return;
    history.replaceState(history.state, '', location.href.replace(/[#&]labels-add=[^&]+/, (x) => (x.startsWith('#') ? '#' : '')).replace(/#&/, '#').replace(/#$/, ''));
    importLink(m[1]);
  }
  /* THE PART PICKER MODAL: js/ui/partpicker.js since 2026-11-07 (shared with the parts drawer's list in Build), the
     handshake and the refusals as they were here; what a batch becomes is this workspace's: labels in this build's list, one
     history entry, the Picker answered only after the store took it. */
  const pp = partPicker({
    root, signal, buildId: () => S().buildId, frameQuery: () => (S().faceStyle === 'classicpro' ? '&type=classicpro' : ''), focusKey, restoreFocus,
    debug: !!new URLSearchParams(location.search).get('debug'),
    onBatch: (items, { reply, close }) => {
      if (!L) { reply({ gen2parts: 'refused', reason: 'The planner’s label module has not loaded yet; try again in a moment.' }); return; }
      const r = R.addPartItems(L, S(), items);
      if (!labelCommit(r, 'labels-add')) { reply({ gen2parts: 'refused', reason: r.msg || 'The planner could not add them.' }); return; }
      reply({ gen2parts: 'added', count: r.added.length + r.updated.length, skipped: r.skipped });
      st.fresh = new Set([...r.added, ...r.updated]); st.pick = null; st.selId = null; stage.setSelected(null);
      { const fromStyle = stepNow() === 'style'; if (!R.faceCarriesLabels(S())) st.listOnly = true; if (fromStyle && st.view !== 'plate') st.step = 'drawers'; }   // the batch in view, in the tray (see importDoc)
      close(); renderAll(); say(r.msg); if (phone) phone.open(panel);
    },
  });
  const openPicker = (o) => pp.open(o);
  const closePicker = () => pp.close();
  // ?return= says where Add to planner build comes back to (this app's address, Labels open); the Studio honours it for this
  // app's exact address (its PLANNER_RETURNS, live since 2026-10-13; DECISIONS.md 2026-10-13)
  const studioHref = (parts) => LABEL_STUDIO_URL + '?from=planner' + (S().faceStyle === 'classicpro' ? '&type=classicpro' : '') + '&return=' + encodeURIComponent(location.origin + location.pathname + '?ws=labels') + (parts ? '#parts' : '');

  /* THE LABEL PLATE VIEW (docs/redesign/LABELS-INTEGRATION.md, step B1, read-only): the Label Studio in a frame over the
     stage, headerless, showing this build's committed list as it lays it out (its Download print file works there). The
     channel is the Part Picker modal's (js/rules/plate.js): a hello with a session, the Studio's ready with what it can do,
     then a SNAPSHOT of the label-relevant state after every change that alters it, and the selected label both ways. The
     frame is made once and kept across the toggle; a build switch rides the same session with its own buildId and rev. */
  /* the print preference (the stripe and the drawings on part labels): this browser's, like the quality tier; see plate.js */
  st.print = (() => { try { return P.cleanPrint(JSON.parse(localStorage.getItem(P.PRINT_KEY))); } catch { return P.cleanPrint(null); } })();
  let plate = null, labelRev = 0, plateTimer = 0, lastLabelSig = P.labelSig(S(), st.print);
  const debug = !!new URLSearchParams(location.search).get('debug');
  /* fromPlate: the Studio already shows this state, so the rev stays (a second change from the plate must still carry the
     current rev - Sol 01a13c32) and no snapshot goes back; the signature moves with it so nothing else re-sends either */
  function setPrint(patch, fromPlate = false) {
    const next = P.cleanPrint({ ...st.print, ...patch });
    if (next.band === st.print.band && next.drawings === st.print.drawings) return false;
    st.print = next;
    try { localStorage.setItem(P.PRINT_KEY, JSON.stringify(next)); } catch { /* private mode: the choice lasts the page */ }
    lastLabelSig = P.labelSig(S(), st.print);
    if (fromPlate) { if (plate) plate.sentSig = lastLabelSig; } else { labelRev++; syncPlateSoon(); }
    return true;
  }
  function setView(v) {
    if (v === st.view) return;
    st.view = v;
    if (v === 'plate') { st.step = 'print'; dropDraft(); openPlate(); if (phone) phone.collapse(panel); } else if (plate) plate.box.hidden = true;
    renderAll();
  }
  function openPlate() {
    if (!plate) {
      const session = newSession();
      const frame = el('iframe', { src: STUDIO + '?embed=planner', title: 'Label plate: the Label Studio', referrerpolicy: 'strict-origin-when-cross-origin' });
      const link = el('span.link', { role: 'status', text: 'Connecting to the Label Studio…' });
      const box = el('div.glass', { id: 'ws-plate', role: 'region', 'aria-label': 'Label plate', hidden: true }, [
        el('div.head', {}, [el('button.key.sm.back', { title: 'Back to the labels on the model', onclick: () => setView('build') }, ['Back']), el('h2', { text: 'Label plate' }), el('span.sub', { text: 'Your labels laid out for your printer. Change the words on the drawers; the plate follows. Download the print file here.' }), link]), frame]);
      root.appendChild(box);
      const hello = () => { try { frame.contentWindow.postMessage(P.helloMessage(session), STUDIO_ORIGIN); } catch { /* the frame is not there yet */ } };
      frame.addEventListener('load', hello);
      const onMessage = (e) => {
        if (!plate || e.source !== frame.contentWindow || e.origin !== STUDIO_ORIGIN) return;
        const d = e.data;
        if (plate.log.length < 40) plate.log.push(d && d[P.KEY]);
        if (!d || typeof d !== 'object' || d.v !== P.V || d.session !== session) return;
        if (d[P.KEY] === 'ready') {
          const r = P.readReady(d); if (!r) return;
          clearTimeout(plate.wait);
          const missing = P.missingCaps(r.caps);   // version skew fails visibly (the plan's risk): an older Studio says what it lacks
          if (missing.length) { plate.bad = true; plate.link.textContent = `This Label Studio cannot show the plate yet (it lacks ${missing.join(', ')}). Try again later.`; return; }
          plate.ready = true; plate.bad = false; plate.link.textContent = ''; plate.sentSig = null; syncPlate(); return;
        }
        if (d[P.KEY] === 'selected') {
          const id = P.readSelected(d, { rev: labelRev, buildId: S().buildId, ids: R.labelsOf(S()).map((l) => l.id) });
          if (id === null || id === st.selLabel) return;
          st.selLabel = id; plate.sentSel = id; st.pick = null; st.selId = null; stage.setSelected(null); renderAll();   // the Studio's row is the selection now, not a drawer or an armed label
          return;
        }
        if (d[P.KEY] === 'setting') {   // a plate input the visitor changed (the stripe, the drawings): the preference follows, with no snapshot echoed back
          const patch = P.readSetting(d, { rev: labelRev, buildId: S().buildId });
          if (patch && setPrint(patch, true)) renderAll();
        }
      };
      addEventListener('message', onMessage, { signal });
      plate = { box, frame, link, session, ready: false, bad: false, hello, sentSig: null, sentSel: null, log: [], wait: 0 };
      if (debug) window.__GEN2_PLATE__ = () => ({ ...plate, rev: labelRev, selLabel: st.selLabel, view: st.view });   // the e2e suite reads the handshake
    }
    plate.box.hidden = false;
    if (!plate.ready) {
      plate.hello();   // a frame that loaded before this page listened (or lost the first hello) hears it again
      armWait(plate, 'The Label Studio');
    }
    syncPlate();
  }
  /* the snapshot when the label-relevant state changed since the one last sent (undo and redo included); the selection alone
     as `select`. Nothing is sent while the plate is hidden: the next opening sends what changed. */
  function syncPlate() {
    if (!plate || !plate.ready || plate.bad || plate.box.hidden || !L) return;
    const post = (m) => { try { plate.frame.contentWindow.postMessage(m, STUDIO_ORIGIN); } catch { /* the frame went away */ } };
    if (plate.sentSig !== lastLabelSig) {
      const { msg, problem } = P.snapshot(L, S(), { session: plate.session, rev: labelRev, selected: st.selLabel, print: st.print });
      post(msg);
      plate.sentSig = lastLabelSig; plate.sentSel = st.selLabel;
      plate.link.textContent = problem ? msg.reason : '';
      return;
    }
    if (plate.sentSel !== st.selLabel) { post(P.selectMessage(plate.session, st.selLabel, S().buildId)); plate.sentSel = st.selLabel; }
  }
  const syncPlateSoon = () => { clearTimeout(plateTimer); plateTimer = setTimeout(syncPlate, 150); };
  /* the selected label: UI state, one id, set by arming a label, selecting a labelled drawer or a row in the Studio */
  function setSelLabel(id) { if (id === st.selLabel) return; st.selLabel = id; syncPlateSoon(); }
  function download(name, text, type) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* previews: the real outline (EdgeLabel's slanted edge; Classic Pro's bar), the icon art as a CSS mask, the words */
  const iconSvg = (id) => { const I = labelIcons(); try { return I && id ? I.svgFor(id, 10) : null; } catch { return null; } };
  const iconName = (id) => { const I = labelIcons(); const i = I && I.find ? I.find(id) : null; return (i && i.name) || String(id || '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()); };
  const predicted = (words) => { const I = labelIcons(); try { return I && words && effectiveStyle(S()).predictIcons ? I.guessIconId(words) || null : null; } catch { return null; } };
  const maskUrl = (svg) => { try { return `url("data:image/svg+xml,${encodeURIComponent(typeof svg.toWellFormed === 'function' ? svg.toWellFormed() : svg)}")`; } catch { return null; } };
  /* A label's preview is drawn by js/label-preview.js from its 3D label's own geometry (Joey 2026-10-17: "the small labels
     differ from the actual labels"; supersedes decision 3b). `u` = the drawer that wears it, when there is one: its look is
     then the drawer's own (label-look.js labelLookOf), exactly what the stage draws; a label still waiting to be placed is
     drawn as a drawer wearing it would draw it. Until the data has loaded - and on Classic Pro, whose words the stage draws
     (since 2026-10-27) but whose flat label face label-preview.js does not hold - the lightweight CSS preview below stands in. */
  const previewLook = (l, u) => {
    const s = S();
    if (s.faceStyle === 'classicpro') return null;
    const stripeOf = (lk) => (lk && lk.kind === 'stripe' ? { colours: lk.colours, position: lk.position } : null);
    if (u) {
      const lk = labelLookOf(s, u);
      if (lk && lk.kind === 'part') return lk;
      return { kind: 'words', text: u.label || '', badge: u.labelBadge || null, style: s.labelStyle || null, upload: labelUploadFor(s, u), stripe: stripeOf(lk) };
    }
    const lk = labelLookOfLabel(l);
    if (lk && lk.kind === 'part') return lk;
    if (R.isPartLabel(l)) return null;   // a part item that does not clean: the stage shows its words, the CSS preview too
    const b = l.badge && typeof l.badge === 'object' ? l.badge : null;
    return { kind: 'words', text: R.labelWords(l) || '', badge: b, style: s.labelStyle || null,
      upload: b && b.type === 'icon' && isLabelSvg(b.svg) ? b.svg : null, stripe: stripeOf(lk) };
  };
  // each stripe meaning's colour as the stage draws it (the build's label palette): the previews match the 3D labels
  const stripeHexes = () => Object.fromEntries(LABEL_MEANINGS.map((k) => [k, stage.activeHex('Label:STRIPE@' + k)]));
  const drawnPreview = (look, big, width) => {
    const url = labelPreviewUrl(look, { width: big ? 120 : width, dpr: Math.min(3, window.devicePixelRatio || 1),
      body: stage.activeHex('Label'), ink: stage.activeHex('Label:TEXT'), stripes: stripeHexes() });
    return url ? el('span.lprev.img' + (big ? '.big' : ''), { 'aria-hidden': 'true' }, [el('img', { src: url, alt: '', draggable: 'false' })]) : null;
  };
  /* A CSS stand-in shown while its data loads is swapped for the drawn image IN PLACE when the data arrives: nothing
     re-renders, so no field loses its focus or its half-typed words (the keyboard e2e case, 2026-10-17: a whole renderAll on
     arrival wiped a word being typed in the label editor). */
  const pendingPreviews = new Map();   // stand-in element -> { look, big, width }
  let previewLoading = null, previewFailed = false;
  function settlePreviews() {
    let wait = null;
    for (const [box, p] of [...pendingPreviews]) {
      if (!box.isConnected) { pendingPreviews.delete(box); continue; }
      if (!previewReady(p.look)) { wait = wait || p.look; continue; }   // a look that needs more data than has arrived
      pendingPreviews.delete(box);
      const img = drawnPreview(p.look, p.big, p.width);
      if (img) box.replaceWith(img);
    }
    if (wait) loadPreviewData(wait);
  }
  function loadPreviewData(look) {
    if (previewLoading || previewFailed || previewReady(look)) return;
    const n = previewNeeds(look);
    previewLoading = (n.layout || n.bands ? loadLabelParts({ layout: n.layout, bands: n.bands }) : loadLabelFont())
      .then(() => { previewLoading = null; settlePreviews(); })
      .catch((e) => { previewLoading = null; previewFailed = true; pendingPreviews.clear(); console.warn(`[labels] the label previews stay simple: ${(e && e.message) || e}`); });
  }
  function preview(l, big = false, u = null, width = 84) {
    const look = previewLook(l, u);
    const img = look ? drawnPreview(look, big, width) : null;
    if (img) return img;
    const box = el('span.lprev' + (S().faceStyle === 'classicpro' ? '.cp' : '') + (big ? '.big' : '') + (caps() ? '' : '.nocaps'), { 'aria-hidden': 'true' });
    // not drawn yet because its data is still loading (not because nothing prints): it waits to be swapped in place
    if (look && !previewReady(look) && !previewFailed) { pendingPreviews.set(box, { look, big, width }); loadPreviewData(look); }
    const words = R.labelWords(l);
    const b = L.cleanBadge(l.badge, { svg: true });
    let svg = null, ch = null;
    if (!R.isPartLabel(l)) {
      if (b && b.type === 'char') ch = b.value;
      else if (b && b.type === 'icon') svg = b.svg || iconSvg(b.value);
      else if (!b && words) svg = iconSvg(predicted(words));
    }
    const url = svg ? maskUrl(svg) : null;
    if (url) box.appendChild(el('span.lico', { style: `--icon:${url}` }));
    else if (ch) box.appendChild(el('span.lch', { text: ch }));
    if (words) {
      const t = el('span.lw');
      if (R.isPartLabel(l)) { const [v, ...rest] = words.split(' · '); t.textContent = v; if (rest.length) t.appendChild(el('small', { text: rest.join(' ') })); }
      else t.textContent = words;
      box.appendChild(t);
    }
    return box;
  }
  function detail(l) {
    const it = l.hardware;
    // words typed over a part label: the part's own words stay in view beside them, so a part re-sent with another size is
    // not hidden behind the old words (Astra, 2026-10-13)
    if (it && typeof l.text === 'string' && l.text !== R.itemWords(it).slice(0, L.TEXT_MAX) && R.itemWords(it)) return `Part: ${R.itemWords(it)}`;
    if (it && Array.isArray(it.attributes)) { const m = it.attributes.map((a) => (a && typeof (a.meaning || a.text) === 'string' ? (a.meaning || a.text) : '')).filter(Boolean).slice(0, 2); if (m.length) return m.join(' · '); }
    if (R.isPartLabel(l)) return 'From the part record';
    const b = L.cleanBadge(l.badge, { svg: true });
    if (b && b.type === 'char') return `Letter ${b.value}`;
    if (b && b.type === 'icon') return b.value ? `${iconName(b.value)} icon` : 'Your uploaded icon';
    if (b && b.type === 'none') return 'No icon';
    const p = R.labelWords(l) ? predicted(R.labelWords(l)) : null;
    return p ? `${iconName(p)} icon` : R.labelWords(l) ? 'Your words' : '';
  }
  const ident = (l, ok = true) => el('span.ident', {}, [el('span.words', { text: shown(R.labelShort(l)) || (ok ? (L.iconOnly(l) ? 'Icon only' : '(empty)') : '(empty)') }), el('span.detail', { text: detail(l) })]);

  /* ---------------- THE STEPS (Joey 2026-11-23, "Full redesign now"; the review and its mockups: D:/Claude - Output/
     labels-ux-review-2026-11-23/REVIEW.md, Sol 01a20bae) ----------------
     Style -> Drawers -> Print, a spine at the top of the panel. STYLE is where a build whose faceplates take no labels starts
     (what a label is, the two families that take one, or a list kept without changing the faceplates); DRAWERS is the drawer
     map and the one-drawer editor - type, Enter, and the next empty drawer is open - with the labels not yet on a drawer in
     a tray beneath (a Part Picker batch, a file, a link: those keep their own placing, Fill shows its pairs first); PRINT is
     the filaments, the fine-tuning and the plate. Typing on a drawer creates the label and places it in one step (Joey
     approved replacing LABELS-INTEGRATION.md's "creating and assigning stay separate actions" for that case, 2026-11-23);
     the list still holds every label apart from its drawers, and one label can sit on several. */
  const STEPS = [['style', 'Style'], ['drawers', 'Drawers'], ['print', 'Print']];
  function stepNow() {
    const s = S();
    if (st.step === 'print' && R.labelsOf(s).length) return 'print';   // a list prints whatever the faceplates are
    if (!R.faceCarriesLabels(s) && !st.listOnly) return 'style';
    return st.step === 'style' ? 'style' : 'drawers';
  }
  function goStep(k) {
    if (k !== 'drawers') dropDraft();   // words half-typed on a drawer leave the model with the step
    st.step = k;
    if (k !== 'print' && st.view === 'plate') { setView('build'); }
    if (k === 'drawers') autoSelect();
    renderAll();
  }
  /* the first empty drawer, selected when the Drawers step opens with nothing selected: the editor is already there, waiting
     for words (the review's finding 2: an empty build gave nothing to tap). Never on the phone, where a selection raises the
     sheet over the model. */
  function autoSelect() {
    const s = S();
    if (!L || phone || st.pick || st.selId != null || !R.faceCarriesLabels(s)) return;
    const first = R.emptyDrawers(s)[0];
    if (first) stage.selectUnit(first.id);
  }
  function renderSpine(step, s, onN, slots, labels) {
    const faceOk = R.faceCarriesLabels(s);
    const can = { style: true, drawers: faceOk || !!st.listOnly, print: !!labels.length };
    const done = { style: faceOk, drawers: faceOk && slots > 0 && onN >= slots, print: false };
    const sub = { style: faceOk ? (FACE_LABEL[s.faceStyle] || 'Labels') : 'Choose one', drawers: faceOk ? `${onN} / ${slots}` : `${labels.length} in the list`, print: labels.length ? n(labels.length, 'label') : 'Nothing yet' };
    return el('nav.spine', { 'aria-label': 'Label steps' }, STEPS.map(([k, name], i) => {
      const on = step === k, ok = done[k] && !on;
      return el('button.step' + (on ? '.on' : '') + (ok ? '.done' : ''), { 'data-step': k, 'aria-current': on ? 'step' : null, disabled: !can[k], onclick: () => goStep(k) },
        [el('span.n', { 'aria-hidden': 'true', text: ok ? '✓' : String(i + 1) }), el('span.name', { text: name }), el('b', { text: sub[k] })]);
    }));
  }
  /* the art for "what a label is": a drawer front with its printed strip, drawn the way the label family draws it */
  function labelArt(face) {
    const cp = face === 'classicpro';
    const svg = cp
      ? '<rect x="26" y="14" width="240" height="64" rx="6" fill="#f07a3a"/><rect x="40" y="22" width="212" height="12" rx="2" fill="#c85a22"/><rect x="40" y="40" width="212" height="28" rx="3" fill="#eef1f4"/><text x="146" y="60" text-anchor="middle" font-family="Archivo, system-ui, sans-serif" font-weight="800" font-size="15" fill="#1c1d20">M3 SCREWS</text>'
      : '<rect x="26" y="14" width="240" height="64" rx="6" fill="#f07a3a"/><polygon points="38,24 178,24 162,54 38,54" fill="#eef1f4"/><text x="48" y="44" font-family="Archivo, system-ui, sans-serif" font-weight="800" font-size="15" fill="#1c1d20">M3 SCREWS</text><rect x="200" y="60" width="54" height="10" rx="5" fill="#1c1d20" opacity=".55"/>';
    return el('div.art', { 'aria-hidden': 'true', html: `<svg viewBox="0 0 292 92" width="100%" height="92">${svg}</svg>` });
  }
  function renderStyleStep(s) {
    const faceOk = R.faceCarriesLabels(s);
    const box = el('div.stylestep');
    box.appendChild(el('p.lead', {}, [el('strong', { text: 'Labels are small printed strips that slide into the drawer front' }), ', so each drawer says what is in it. A relabel is a minute, not a reprint.']));
    box.appendChild(labelArt(faceOk ? s.faceStyle : 'edgelabel'));
    // both label families as the Build library's faceplate tiles (Joey 2026-10-19 and 2026-10-27: both clickable, both Club,
    // the stage's own picture of the faceplate), from the stage's own style list so a family it does not offer gets no tile
    const LABEL_FAMILIES = ['edgelabel', 'classicpro'];
    const styles = (stage.availableFaceplateStyles?.() || []).filter((x) => LABEL_FAMILIES.includes(x.key)).sort((a, b) => LABEL_FAMILIES.indexOf(a.key) - LABEL_FAMILIES.indexOf(b.key));
    const decor = s.placed.filter((u) => u.fill === 'decor').length;
    // one switch at a time; when it lands, the workspace may be gone (a tab change) or the visitor elsewhere (another step):
    // the faceplates still change, the panel only follows if it is still there and still on this step (Sol 01a20bde)
    const switchTo = (style) => async () => {
      if (st.switching) return;
      st.switching = true; renderAll();
      try { await stage.applyFaceplateStyle(style); }
      catch (e) { st.switching = false; if (!signal.aborted) { status(`${style.label} faceplates did not apply (${(e && e.message) || e}). Try again.`, true); renderAll(); } return; }   // the tiles come back (Terra 01a20bea)
      st.switching = false;
      if (signal.aborted) return;
      stage.setDims(false); store.load(stage.build, 'adopt');
      lastSig = (() => { const g = tryGen(store.serialize()); return g.manifest ? sigOf(g.manifest) : lastSig; })();
      st.listOnly = false;
      if (st.step === 'style' || stepNow() === 'style') st.step = 'drawers';
      renderAll(); if (st.step === 'drawers') autoSelect();
      say(`${style.label} faceplates · the drawers can take labels now.`);
    };
    const WHAT = { edgelabel: 'Label in an angled window', classicpro: 'Label on the grip slope' };
    const tile = (style) => {
      const name = FACE_LABEL[style.key] || style.label, cur = s.faceStyle === style.key;
      const pic = el('div.pv.face', {}, [glyphEl(FACEK[style.key] || 'edgelabel', 40, 26)]);
      if (stage.thumb) stage.thumb({ fill: 'decor', w: 1, hh: 2, faceStyle: style.key, view: 'front' }).then((url) => { if (url) pic.replaceChildren(el('img', { src: url, alt: '' })); }).catch(() => {});
      return el('button.face.key' + (cur ? '.on' : ''), { title: cur ? `Your drawers use ${name} faceplates` : `Switch every Decor drawer to ${name} faceplates · ✦ Club`, 'aria-label': cur ? `${name}, in use` : `Switch to ${name}`, 'aria-pressed': String(cur), disabled: cur || !!st.switching, onclick: switchTo(style) },
        [pic, name, el('span.what', { text: cur ? 'In use' : WHAT[style.key] || '' }), el('span.club', { text: '✦', title: 'Club' })]);
    };
    box.appendChild(el('p.sub', { text: faceOk ? `Your faceplates are ${FACE_LABEL[s.faceStyle]}. Both of these take labels:` : `${FACE_LABEL[s.faceStyle] ? FACE_LABEL[s.faceStyle] + ' faceplates take' : 'These faceplates take'} no labels. These two do:` }));
    if (styles.length) box.appendChild(el('div.faces.two', {}, styles.map(tile)));
    if (decor) box.appendChild(el('p.dim', { text: `Switching changes ${decor === 1 ? 'the Decor drawer' : `all ${decor} Decor drawers`}. Undo in the toolbar takes it back.` }));
    if (!faceOk) box.appendChild(el('button.linkish', { onclick: () => { st.listOnly = true; st.step = 'drawers'; renderAll(); } }, ['Make a label list without changing faceplates']));
    else box.appendChild(el('div.row', {}, [el('button.key.sm', { onclick: () => goStep('drawers') }, ['Next: Drawers', icon('arrow-right', { size: 16 })])]));
    return box;
  }
  /* THE DRAWER MAP: the build's units where they stand (top row first, as on the model); a Decor drawer is a button that
     selects it (or, while a label is armed, places it), anything else a plain block for orientation */
  function renderMap(s, carried, sel) {
    const units = s.placed || [];
    if (!units.length) return null;
    // the grid from the units' own extent (a record's rows need not start at 0: the tabletop grid keeps room above)
    const x0 = Math.min(...units.map((u) => u.x)), y0 = Math.min(...units.map((u) => u.y));
    const cols = Math.max(...units.map((u) => u.x + u.w)) - x0, rows = Math.max(...units.map((u) => u.y + u.hh)) - y0;
    const rowPx = Math.max(12, Math.min(26, Math.floor(168 / rows)));
    const faceOk = R.faceCarriesLabels(s);
    const grid = el('div.dmap', { role: 'group', 'aria-label': 'Your drawers, as they stand', style: `grid-template-columns: repeat(${cols}, minmax(0, 1fr)); grid-auto-rows: ${rowPx}px` });
    for (const u of units) {
      const pos = `grid-column: ${u.x - x0 + 1} / span ${u.w}; grid-row: ${u.y - y0 + 1} / span ${u.hh}`;
      if (u.fill !== 'decor') { grid.appendChild(el('div.dcell.inert', { style: pos, title: FILL_LABEL(u.fill), 'aria-hidden': 'true' })); continue; }
      const l = R.labelById(s, carried[u.id]);
      const on = !!sel && sel.id === u.id;
      const words = l ? (shown(R.labelShort(l)) || 'Icon') : '';
      const name = R.drawerName(s, u.id);
      grid.appendChild(el('button.dcell' + (l ? '.has' : '.empty') + (on ? '.sel' : '') + (l && st.selLabel === l.id ? '.lsel' : ''), {
        style: pos, disabled: !faceOk, 'aria-pressed': String(on), 'data-focus': 'cell:' + u.id, 'data-unit': String(u.id),
        'aria-label': `${name}, ${l ? words : 'no label'}`, title: `${name} · ${l ? words : 'no label yet'}`,
        onclick: () => { if (st.pick) { tapDrawer(u.id); return; } stage.selectUnit(u.id); },
      }, [l ? el('span.w', { text: words }) : el('span.plus', { 'aria-hidden': 'true', text: '+' })]));
    }
    return grid;
  }
  /* the words being typed for a drawer show on it at once, through the stage's mirror alone (the record does not change until
     Enter; the hover preview's mechanism) */
  function mirrorTyping(unitId, text) {
    if (!L) return;
    const rec = store.serialize(); const p = rec.placed.find((x) => x.id === unitId); if (!p) return;
    const t = L.cleanText(text, L.MIRROR_MAX);
    const l = R.labelById(S(), assignOf()[unitId]);
    const m = t ? L.mirrorOfLabel(l && !R.isPartLabel(l) ? { ...l, text: t } : { text: t }) : null;
    if (m) { p.label = m.label; if (m.labelBadge) p.labelBadge = m.labelBadge; else delete p.labelBadge; } else { delete p.label; delete p.labelBadge; }
    st.hover = null; stage.setLabels(rec);
  }
  function dropDraft() { if (!st.draft) return; st.draft = null; stage.setLabels(store.serialize()); }
  /* after a label lands on a drawer from the editor: the next empty drawer in drawer order (wrapping), its editor open; none
     left, and the Print step is next */
  function advanceFrom(unitId) {
    const s = S(); const order = R.drawers(s).filter((u) => R.eligible(s, u));
    const empties = new Set(R.emptyDrawers(s).map((u) => u.id));
    const i = order.findIndex((u) => u.id === unitId);
    const next = [...order.slice(i + 1), ...order.slice(0, Math.max(i, 0))].find((u) => empties.has(u.id));
    if (next) stage.selectUnit(next.id);
    else { stage.setSelected(null); say('Every drawer has a label. Next: Print.'); }
  }
  /* Enter in the editor: an empty drawer gets the words as a new label (or the waiting label with exactly those words); a
     labelled drawer's label takes the new words, on every drawer it is on or on this one only (the scope switch) */
  function commitQuick(u, text) {
    const s = S(); const l = R.labelById(s, assignOf()[u.id]);
    const t = L.cleanText(text, L.MIRROR_MAX);
    if (!l) {
      if (!t) { status('Type what goes in the drawer first.', true); renderAll(); return; }
      const same = R.waiting(L, s).find((x) => !R.isPartLabel(x) && R.labelWords(x).toLowerCase() === t.toLowerCase());
      const r = same ? R.place(L, s, u.id, same.id, null, 'drawer') : R.addOn(L, s, u.id, { text: t });
      st.draft = null;
      if (labelCommit(r)) advanceFrom(u.id);
      return;
    }
    if (t === R.labelWords(l)) { dropDraft(); renderAll(); return; }
    if (!t && !L.visibleBadge(l)) { status('A label needs words, an icon or a letter. Remove takes it off the drawer.', true); renderAll(); return; }
    st.draft = null;
    const r = R.edit(L, s, l.id, { text: t }, st.scope === 'this' ? 'this' : 'all', u.id);
    labelCommit(r);
    if (full(text).length > L.MIRROR_MAX) say(`Labels made here hold ${L.MIRROR_MAX} characters, so the words were cut to “${t}”.`);
  }
  const full = (text) => L.cleanText(text, L.TEXT_MAX);
  /* THE ONE-DRAWER EDITOR (the 2026-10-06 decision's "compact editor", not built until now): the selected drawer's words,
     typed in place; its waiting labels as suggestions; More opens the full editor (icon, letter, stripe) */
  function renderQuick(u, s, readyLabels) {
    const l = R.labelById(s, assignOf()[u.id]);
    const name = R.drawerName(s, u.id);
    const box = el('div.drawer.quick', { 'aria-label': `${name}, selected` });
    box.appendChild(el('div.dhead', {}, [el('span.tag', { text: name }), el('span.size', { text: [`${u.w}W·${u.hh / 2}H`, FACE_LABEL[s.faceStyle] || ''].filter(Boolean).join(' · ') }),
      el('button.x', { title: 'Deselect', 'aria-label': 'Deselect the drawer', onclick: () => stage.setSelected(null) }, [icon('x', { size: 16 })])]));
    if (!R.eligible(s, u)) { box.appendChild(el('p.none', { text: u.fill !== 'decor' ? `Labels go on Decor drawers, not on a ${FILL_LABEL(u.fill).toLowerCase()}.` : 'This faceplate style takes no label.' })); return box; }
    // a part label is laid out from its part record: its words are not typed here (the existing part actions)
    if (l && R.isPartLabel(l)) {
      const no = R.drawerNumber(s, u.id);
      box.appendChild(el('div.dlabel', {}, [preview(l, true, u), el('span.ident', {}, [el('span.words', { text: shown(R.labelShort(l)) }), el('span.detail', { text: detail(l) }), el('span.src', { text: 'From the part record' })])]));
      box.appendChild(el('div.acts', {}, [
        el('button.key.sm', { title: 'Change the size, length or material in the Part Picker: the same part comes back updated in place', onclick: () => openPicker({ open: l.hardware }) }, ['Edit part details']),
        el('button.key.sm', { title: 'Replace the part layout with your own words on this drawer', onclick: () => openModal({ title: `Use your own words on drawer ${no}?`, body: ['This label is laid out from its part record. Words you type replace that layout on this drawer only; the part label goes back to your labels, ready to place again.'], ok: 'Use custom wording', field: { placeholder: 'What’s in this drawer?', value: R.labelShort(l) }, onOk: () => { const t = modalField(); closeModal(); labelCommit(R.customWording(L, S(), u.id, t)); }, onCancel: () => closeModal() }) }, ['Use custom wording']),
        el('button.key.sm', { title: 'Take the label off this drawer; it waits to be placed again', onclick: () => labelCommit(R.unassign(L, S(), u.id, l.id)) }, ['Remove']),
      ]));
      return box;
    }
    const cur = l ? R.labelWords(l) : '';
    const typed = st.draft && st.draft.unitId === u.id ? st.draft.text : cur;
    const inp = el('input.words.qwords', { type: 'text', maxlength: '40', value: typed, placeholder: l ? 'What’s in this drawer?' : 'e.g. M3 screws, batteries, tape', autocomplete: 'off', spellcheck: 'false', 'aria-label': `What’s in ${name}`, 'data-focus': 'quick' });
    const hintLine = el('p.qhint');
    const sugg = el('div.qsugg', { role: 'group', 'aria-label': 'Labels waiting for a drawer' });
    const iconLine = () => {
      const t = L.cleanText(inp.value, L.MIRROR_MAX);
      if (l && t === cur) return detail(l);
      const p = t ? predicted(t) : null;
      return t ? (p ? `Icon: ${iconName(p).toLowerCase()} (guessed from the words)` : 'No icon matched; More adds one') : (l ? detail(l) : 'The icon is guessed from the words.');
    };
    const fillSugg = () => {
      const t = inp.value.trim().toLowerCase();
      const pool = readyLabels.filter((x) => !t || R.labelWords(x).toLowerCase().includes(t)).slice(0, 4);
      sugg.replaceChildren(...(pool.length ? [el('span.dim', { text: l ? 'Or use:' : 'Waiting:' })] : []), ...pool.map((x) => el('button.chip-s', { title: `Put ${quote(x)} on ${name}`, onclick: () => { const was = !assignOf()[u.id]; dropDraft(); chooseLabel(x.id); if (was && assignOf()[u.id] === x.id) advanceFrom(u.id); } }, [shown(R.labelShort(x)) || 'Icon only'])));
    };
    inp.addEventListener('input', () => { st.draft = { unitId: u.id, text: inp.value }; mirrorTyping(u.id, inp.value); hintLine.textContent = iconLine(); fillSugg(); });
    inp.addEventListener('keydown', (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return;   // an input method's Enter confirms its candidate, never the label (Sol 01a20bde)
      if (ev.key === 'Enter') { ev.preventDefault(); commitQuick(u, inp.value); return; }
      // the planner's Undo from the editor only while nothing uncommitted is in the field (the committed words, no draft):
      // words being typed keep the browser's own text undo, whatever re-render made this field (Sol 01a20bde)
      const k = ev.key.toLowerCase();
      if ((ev.ctrlKey || ev.metaKey) && (k === 'z' || k === 'y') && !st.draft && inp.value === cur) { ev.preventDefault(); if (k === 'y' || ev.shiftKey) store.redo(); else store.undo(); }
    });
    box.appendChild(el('label.frow.qrow', {}, [el('span.sr', { text: `What’s in ${name}` }), inp]));
    hintLine.textContent = iconLine();
    box.appendChild(hintLine);
    if (l) {
      const shared = L.assignedUnits({ list: s.labelList, assignments: assignOf() }, l.id);
      if (shared.length > 1) box.appendChild(el('div.track.seg2.scope', { role: 'group', 'aria-label': 'Which drawers change' }, [
        el('button.seg.sm' + (st.scope !== 'this' ? '.on' : ''), { 'aria-pressed': String(st.scope !== 'this'), text: `All ${n(shared.length, 'drawer')}`, onclick: () => { st.scope = 'all'; renderAll(); } }),
        el('button.seg.sm' + (st.scope === 'this' ? '.on' : ''), { 'aria-pressed': String(st.scope === 'this'), text: 'This drawer only', title: 'A copy of the label carries the change; the other drawers keep theirs', onclick: () => { st.scope = 'this'; renderAll(); } }),
      ]));
    }
    const acts = el('div.acts');
    acts.appendChild(el('button.key.sm.on', { title: l ? 'Save the words (Enter)' : 'Put these words on the drawer and open the next empty one (Enter)', onclick: () => commitQuick(u, inp.value) }, [l ? 'Save' : 'Place', el('span.kbd', { text: 'Enter' })]));
    if (l) {
      acts.appendChild(el('button.key.sm', { title: 'Icon, letter and stripe', onclick: () => { dropDraft(); openEdit(l.id, u.id); } }, [icon('pencil-simple', { size: 15 }), 'More']));
      acts.appendChild(el('button.key.sm', { title: 'Take the label off this drawer; it waits to be placed again', onclick: () => { dropDraft(); labelCommit(R.unassign(L, S(), u.id, l.id)); } }, ['Remove']));
    } else acts.appendChild(attachHint(el('button.key.sm', { title: 'Choose screws, nuts, washers and inserts in the Part Picker; their labels wait in the tray below', onclick: () => openPicker() }, [PICKER_ICON(), 'Hardware']), HINTS.picker, panel));
    box.appendChild(acts);
    fillSugg();
    box.appendChild(sugg);   // always in the card (empty, it takes no room: app.css): a filter that finds labels later still shows them (Sol 01a20bde)
    return box;
  }

  /* COMPARTMENT LABELS (M3, js/parts-drawer/labels.js): a parts drawer's compartments that carry a part, as the Studio's
     print set; a row in this list per compartment, never on a faceplate - so on the Style step too, whatever the faceplates */
  function renderCompartments(s) {
    if (!ctx.partsDrawer) return null;
    const crows = ctx.partsDrawer.compartmentLabels(+s.length, s);
    if (!crows.length) return null;
    const open = crows.filter((r) => !r.linked);
    return el('div.placed.pd-comp-labels', {}, [
      el('h4', { text: `Compartment labels (${crows.length})` }),
      el('div.rows', {}, crows.map((r) => el('div.crow', {}, [el('span.where', { text: `${r.drawer} · ${r.position}` }), el('span.words', { text: r.text }), el('span.state', { text: r.linked ? (r.stale ? 'words changed' : 'In list') : 'not in the list' })]))),
      open.length ? el('div.fillrow', {}, [el('button.key.tile.wide', { onclick: () => compCommit(open) }, [icon('plus', { size: 16 }), `Add ${open.length === crows.length ? 'all' : open.length} to the list`])]) : el('p.hint', { text: 'Every compartment label is in the list; the Studio prints them with the rest.' }),
    ]);
  }
  function renderPanel() {
    if (st.dragEnd) st.dragEnd();   // a rebuild detaches the chip being dragged and its capture with it: the drag ends here, never orphaned (Terra 01a136e5)
    hideHint();   // the control under a bubble is about to be rebuilt; a removed button never fires mouseleave (Terra 01a13529)
    panel.replaceChildren();
    if (!L) { panel.append(el('div.head', {}, [el('h2', { text: 'Labels' })]), el('p.hint', { text: 'Loading the label tools…' })); return; }
    const s = S();
    const labels = R.labelsOf(s);
    const carried = assignOf();
    const car = R.carriers(s);
    if (st.pick && (car.has(st.pick) || !R.labelById(s, st.pick))) st.pick = null;
    if (st.selLabel && !R.labelById(s, st.selLabel)) setSelLabel(null);   // its label left the list: the selection clears on purpose
    const waitingAll = labels.filter((l) => !car.has(l.id));
    const ready = waitingAll.filter((l) => L.assignable(l));
    const empties = R.emptyDrawers(s);
    const faceOk = R.faceCarriesLabels(s);
    const picked = R.labelById(s, st.pick);
    const sel = selectedDrawer();
    const slots = s.placed.filter((u) => R.eligible(s, u)).length;
    const onN = Object.keys(carried).filter((k) => R.labelById(s, carried[k])).length;
    const step = stepNow();
    panel.classList.toggle('placing', !!picked);
    panel.dataset.step = step;
    // head
    panel.appendChild(el('div.head', {}, [
      el('h2', { text: 'Labels' }),
      el('span.count', { text: faceOk && slots ? `${onN} of ${slots} drawers` : labels.length ? n(labels.length, 'label') : '' }),
      labels.length ? el('span.tools', {}, [
        el('button.mini', { title: 'Download the list · a MODULITH label list (.json) the Label Studio opens', 'aria-label': 'Download the label list', onclick: () => download(`modulith-${s.length}-labels.json`, JSON.stringify({ ...R.exportDoc(L, s), output: P.printOutput(st.print) }, null, 2), 'application/json') }, [icon('download-simple', { size: 16 })]),
        el('button.mini', { title: 'Copy the labels as text, in drawer order', 'aria-label': 'Copy the labels as text', onclick: async () => { try { await navigator.clipboard.writeText(R.exportText(L, s)); say('Labels copied.'); } catch { say('Could not reach the clipboard.'); } } }, [icon('copy', { size: 16 })]),
      ]) : null,
    ]));
    panel.appendChild(renderSpine(step, s, onN, slots, labels));
    // labels kept aside for this build (a link or a file brought it back without them): offered while the board has none
    const kept = ctx.labelCopy && ctx.labelCopy.copy;
    if (kept && !labels.length) {
      const k = kept.list.labels.filter((l) => L.assignable(l)).length || kept.n;
      let when = 'earlier'; try { when = new Date(kept.savedAt).toLocaleString(); } catch { /* an odd clock */ }
      // the copy is re-read at the moment of the choice: another tab may have restored or discarded it meanwhile
      const gone = () => { status('The kept labels are gone: another tab restored or discarded them.', true); renderAll(); };
      const restore = () => { const live = ctx.labelCopy.take(); if (!live) { gone(); return; } const r = R.restoreCopy(L, S(), live); if (labelCommit(r, 'labels-restore')) ctx.labelCopy.done(); };
      const discard = () => openModal({ title: `Discard the ${n(k, 'kept label')}?`, body: ['They cannot be brought back afterwards.'], ok: 'Discard', onOk: () => { closeModal(); if (!ctx.labelCopy.take()) { gone(); return; } ctx.labelCopy.done(); status('The kept labels were discarded.'); renderAll(); }, onCancel: () => closeModal() });
      panel.appendChild(el('div.banner.copy', { role: 'status' }, [
        el('span', { text: `This build came back without its labels. This browser kept ${n(k, 'label')} from ${when}.` }),
        el('div.btns', {}, [
          el('button.key.sm.on', { onclick: restore }, [icon('arrow-counter-clockwise', { size: 16 }), 'Restore labels']),
          el('button.key.sm', { text: 'Not now', onclick: () => { ctx.labelCopy.later(); renderAll(); } }),
          el('button.key.sm', { text: 'Discard', onclick: discard }),
        ]),
      ]));
    }
    if (picked) panel.appendChild(el('div.banner', { role: 'status' }, [el('span', { text: `Place ${quote(picked)} · tap a drawer` }), el('button.key.sm', { text: 'Done placing', onclick: () => armPlacing(null) })]));
    const scroll = el('div.scroll');
    if (step === 'style') { scroll.appendChild(renderStyleStep(s)); const comp = renderCompartments(s); if (comp) scroll.appendChild(comp); }   // compartment labels need no label faceplate
    else if (step === 'print') scroll.appendChild(renderPrintStep(s, labels, onN, slots, waitingAll));
    else {
      if (!faceOk) scroll.appendChild(el('div.callout.slim', {}, [el('p', { text: `${FACE_LABEL[s.faceStyle] ? FACE_LABEL[s.faceStyle] + ' faceplates take' : 'These faceplates take'} no labels, so these wait in a list you can export.` }), el('button.linkish', { onclick: () => goStep('style'), text: 'Choose a label style' })]));
      else if (!labels.length && !sel) scroll.appendChild(el('p.lead', { text: 'Tap a drawer, then type what goes in it. The words show on the model as you type, and print as a strip for the drawer front.' }));
      const map = renderMap(s, carried, sel);
      if (map && faceOk) scroll.appendChild(map);
      if (sel && faceOk) scroll.appendChild(renderQuick(sel, s, ready));
      else if (faceOk && !picked) scroll.appendChild(el('p.hint', { text: !slots ? 'This build has no Decor drawers to label.' : empties.length ? 'Tap a drawer on the model or in the map to label it.' : 'Every drawer has a label. Tap one to change it, or go on to Print.' }));
      if (!faceOk) {
        // the list without label faceplates: words go into the list, nowhere else
        const inp = el('input.words.qwords', { type: 'text', maxlength: '40', placeholder: 'A label for the list', autocomplete: 'off', 'aria-label': 'A label for the list', 'data-focus': 'listadd' });
        const add = () => { const r = R.add(L, S(), { text: inp.value }); if (!r.ok) { status(r.msg, true); renderAll(); return; } labelCommit(r); };
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
        scroll.appendChild(el('div.drawer.quick', {}, [inp, el('div.acts', {}, [el('button.key.sm.on', { onclick: add }, ['Add', el('span.kbd', { text: 'Enter' })])])]));
      }
      // THE TRAY: labels not on a drawer yet (a Part Picker batch, a file, a link, a label taken off): their own placing
      if (waitingAll.length) {
        const tray = el('div.tray');
        tray.appendChild(el('div.trayhead', {}, [el('h4', { text: `Not on a drawer yet (${waitingAll.length})` }),
          faceOk && ready.length && empties.length && !picked ? attachHint(el('button.key.sm', { title: 'Arm the first waiting label, then tap drawers one after another', onclick: () => { const w = ready[0]; if (w) armPlacing(w.id); } }, [icon('hand-pointing', { size: 16 }), 'Place several']), HINTS.several, panel) : null]));
        tray.appendChild(el('div.list', {}, waitingAll.map((l) => {
          const ok = L.assignable(l);
          const onPick = l.id === st.pick;
          const b = el('button.chip-l' + (onPick ? '.on' : '') + (st.selLabel === l.id ? '.sel' : '') + (l.hardware ? '.hw' : '') + (st.fresh && st.fresh.has(l.id) ? '.new' : ''), { 'aria-pressed': String(onPick), disabled: !ok || !faceOk, title: shown(R.labelWords(l)) + (l.hardware ? ' (laid out from its part record)' : ''), 'data-focus': 'chip:' + l.id, onclick: () => chooseLabel(l.id) }, [preview(l), ident(l, ok)]);
          if (l.hardware && R.hwNotReady(l)) b.appendChild(el('span.tag', { text: 'not ready' }));
          if (ok && faceOk) dragFrom(b, l.id);
          return el('div.item', {}, [b,
            el('button.mini', { title: 'Edit this label', 'aria-label': 'Edit ' + (R.labelWords(l) || 'this label'), 'data-focus': 'edit:' + l.id, onclick: () => openEdit(l.id, null) }, [icon('pencil-simple', { size: 15 })]),
            el('button.mini', { title: 'Remove from this build', 'aria-label': 'Remove ' + (R.labelWords(l) || 'this label') + ' from this build', 'data-focus': 'remove:' + l.id, onclick: () => labelCommit(R.remove(L, s, l.id)) }, [icon('x', { size: 15 })])]);
        })));
        if (faceOk) {
          const pairs = R.fillPairs(L, s);
          tray.appendChild(el('div.fillrow', {}, [
            attachHint(el('button.key.tile.wide', { disabled: !pairs.length, onclick: openFill }, [icon('hand-pointing', { size: 16 }), 'Fill empty drawers…']), HINTS.fill, panel),
            pairs.length ? null : el('span.why', { text: !ready.length ? 'No labels ready to place' : 'No empty drawers' }),
          ]));
        }
        scroll.appendChild(tray);
      }
      const comp = renderCompartments(s); if (comp) scroll.appendChild(comp);
    }
    panel.appendChild(scroll);
    // the foot: the other ways labels come in (the Drawers step), and a warning that needs reading
    const foot = el('div.foot');
    if (step === 'drawers') foot.appendChild(el('div.ways', { role: 'group', 'aria-label': 'Add labels' }, [
      attachHint(el('button.key.tile', { title: 'Opens the Part Picker here: choose screws, nuts and washers; their labels wait in the tray', onclick: () => openPicker() }, [PICKER_ICON(), 'Hardware…']), HINTS.picker, panel),
      attachHint(el('button.key.tile', { title: 'A MODULITH label list, a Part Picker label-items file, or a Label Studio set file', onclick: () => fileIn.click() }, [icon('upload-simple', { size: 16 }), 'From a file…']), HINTS.file, panel),
    ]));
    // the full Label Studio, a new tab (its Add to planner build comes back to this build: keepCurrent, app.js)
    if (step === 'drawers') foot.appendChild(el('a.studiolink', { href: studioHref(false), target: '_blank', rel: 'noopener', onclick: () => ctx.builds?.keepCurrent?.(), title: 'Opens the Label Studio in a new tab: icons of your own, uploads, more layouts. Its Add to planner build brings the labels back here' }, ['Open the full Label Studio', icon('arrow-square-out', { size: 13 })]));
    if (st.status) foot.appendChild(el('p.status' + (st.warn ? '.warn' : ''), { role: 'status', text: st.status }));
    if (foot.childNodes.length) panel.appendChild(foot);
  }
  /* THE PRINT STEP: what this build prints, the filaments it takes, the fine-tuning, then the plate (the Label Studio lays
     the labels out for the printer and downloads the .3mf there until it can be driven from here - the review's slice 2) */
  function renderPrintStep(s, labels, onN, slots, waitingAll) {
    const box = el('div.printstep');
    const on = R.faceCarriesLabels(s);
    box.appendChild(el('p.lead', {}, [el('strong', { text: n(labels.length, 'label') }), on && slots ? ` on ${onN} of ${slots} drawers` : ' in your list', waitingAll.length && on ? ` · ${waitingAll.length} not on a drawer yet` : '', '.']));
    const firstOn = (id) => R.drawers(s).find((u) => assignOf()[u.id] === id) || null;
    const shownN = 12;
    box.appendChild(el('div.thumbs', { 'aria-label': 'Your labels' }, [...labels.slice(0, shownN).map((l) => el('span.thumb' + (st.selLabel === l.id ? '.sel' : ''), { title: shown(R.labelWords(l)) || 'Icon only' }, [preview(l, false, firstOn(l.id), 84)])),
      labels.length > shownN ? el('span.more', { text: `+${labels.length - shownN} more` }) : null]));
    box.appendChild(renderFilaments());
    box.appendChild(renderSettings());
    box.appendChild(el('button.key.on.wide.big.platego', { title: 'Shows the Label plate: this build’s labels as the Label Studio lays them out, with the print file to download', onclick: () => setView('plate') }, [icon('download-simple', { size: 18 }), 'Open the print plate']));
    box.appendChild(el('p.dim', { text: 'The plate lays your labels out for your printer and downloads the print file (.3mf).' }));
    box.appendChild(el('p.dim.studio', {}, ['For icons of your own, uploads and more layouts: ', el('a', { href: studioHref(false), target: '_blank', rel: 'noopener', onclick: () => ctx.builds?.keepCurrent?.(), text: 'the Label Studio' }), ' (a new tab).']));
    return box;
  }
  /* the set-wide label settings (the generator's six inputs), collapsible; a value out of range snaps back */
  function renderSettings() {
    const s = S(); const eff = effectiveStyle(s); const lim = G?.labelSpec?.limits || {};
    const det = el('details.settings', { open: st.settings ? '' : null });
    // opened by the visitor (not re-rendered open): bring the settings into view, down to Printing part labels
    det.addEventListener('toggle', () => { const was = st.settings; st.settings = det.open; if (det.open && !was) { try { det.scrollIntoView({ block: 'nearest' }); } catch { /* jsdom */ } } });
    det.appendChild(el('summary', {}, [icon('sliders-horizontal', { size: 16 }), 'Fine-tune text and icons', el('span.dim', { text: `${eff.capMm} mm · ${eff.allCaps ? 'caps' : 'as typed'}${st.print.band === 'off' ? ' · no stripe' : ''}` })]));
    // the label these settings change, drawn as it prints (the selected one, else the first): the review's finding 6, a
    // millimetre field with nothing beside it to show what it does
    { const l = R.labelById(s, st.selLabel) || R.labelsOf(s)[0]; if (l) { const u = R.drawers(s).find((x) => assignOf()[x.id] === l.id) || null; det.appendChild(el('div.setprev', {}, [preview(l, true, u)])); } }
    for (const row of LABEL_STYLE_ROWS) {
      const [lo, hi] = lim[row.key] || [0, 99];
      const inp = el('input', { type: 'number', min: String(lo), max: String(hi), step: String(row.step), value: String(eff[row.key]), 'aria-label': row.label });
      inp.addEventListener('change', () => { const v = Number(inp.value); let ok = false; store.commit((x) => { ok = styleEdit(x, row.key, v); }, 'label-style'); if (!ok) { inp.value = String(effectiveStyle(S())[row.key]); say(`${row.label}: ${lo} to ${hi} ${row.unit}.`); } });
      det.appendChild(el('label.srow', {}, [el('span', { text: row.label }), el('span.unit', {}, [inp, el('span.dim', { text: row.unit })])]));
    }
    for (const [key, label] of [['bold', 'Bold'], ['allCaps', 'All caps'], ['predictIcons', 'Predict icons']]) {
      det.appendChild(el('label.srow', {}, [el('span', { text: label }), el('div.track.seg2', { role: 'group', 'aria-label': label }, [false, true].map((v) => el('button.seg.sm' + (!!eff[key] === v ? '.on' : ''), { text: v ? 'On' : 'Off', 'aria-pressed': String(!!eff[key] === v), onclick: () => store.commit((x) => styleEdit(x, key, v), 'label-style') })))]));
    }
    /* printing part labels: the stripe and the drawings. This browser's DEFAULT for printing labels (plate.js; Astra: it mixes a
       printer's capability with a look, so a printer profile or a build override may come later): a two-colour printer turns the
       stripe off once and every build follows; the Label plate's own inputs change the same choice */
    det.appendChild(el('p.sub', { text: 'Printing part labels' }));
    const drawingsRow = () => el('label.srow', {}, [el('span', { text: 'Screw and nut drawings' }), el('div.track.seg2', { role: 'group', 'aria-label': 'Screw and nut drawings' }, [false, true].map((v) => el('button.seg.sm' + (st.print.drawings === v ? '.on' : ''), { text: v ? 'On' : 'Off', 'aria-pressed': String(st.print.drawings === v), onclick: () => { setPrint({ drawings: v }); renderAll(); } })))]);
    /* Classic Pro part labels print the words, the part's icon and, since 2026-10-27, the screw and nut drawings, every row
       centred (the Label Studio's rule). EdgeLabel's stripe positions (its edges and slanted end) read oddly over a Classic Pro
       label (Joey 2026-10-27), and since 2026-10-28 Classic Pro has its own ONE place, the bottom edge between the slits: so
       the stripe is a plain On / Off here. On keeps an EdgeLabel position already chosen (the Label Studio draws any of them at
       Classic Pro's bottom); turning it on from Off picks the bottom edge */
    if (S().faceStyle === 'classicpro') {
      const on = st.print.band !== 'off';
      det.appendChild(el('label.srow', {}, [el('span', { text: 'Part label stripe' }), el('div.track.seg2', { role: 'group', 'aria-label': 'Part label stripe' }, [false, true].map((v) => el('button.seg.sm' + (on === v ? '.on' : ''), { text: v ? 'On' : 'Off', 'aria-pressed': String(on === v), onclick: () => { if (on !== v) setPrint({ band: v ? 'bottom' : 'off' }); renderAll(); } })))]));
      det.appendChild(drawingsRow());
      det.appendChild(el('p.dim', { text: 'Classic Pro part labels print the words and the part’s drawing, centred.' + (on ? ' The stripe runs along the bottom edge, between the springy slits.' : ' Off: they print in two filaments, the base and the words.') }));
      return det;
    }
    const bandSel = el('select', { 'aria-label': 'Part label stripe' }, [['bottom', 'Bottom edge'], ['end', 'End stripe'], ['wedge', '45° end'], ['off', 'Off · two filaments']].map(([v, t]) => el('option', { value: v, text: t, selected: st.print.band === v ? '' : null })));
    bandSel.addEventListener('change', () => { setPrint({ band: bandSel.value }); renderAll(); });
    det.appendChild(el('label.srow', {}, [el('span', { text: 'Part label stripe' }), bandSel]));
    det.appendChild(drawingsRow());
    det.appendChild(el('p.dim', { text: (st.print.band === 'off' ? 'Part labels print in two filaments: the base and the words.' : 'The stripe adds the thread-system colour and a material patch: more filaments.') + ' Your default for printing labels, kept in this browser for every build.' }));
    return det;
  }

  /* THE LABEL COLOURS (the label palette, Joey 2026-10-28; docs/redesign/LABEL-PALETTE.md): the spool each stripe meaning
     prints in for THIS build (the record's labelPalette; null = the suggested spools), and the label body and text, which
     are this build's Colors picks for Label and Label:TEXT. Ready-made: nothing needs choosing. "Use my filaments" opens
     the rows; each pick is one undo step. The defaults for new builds sit in this browser and never change a build by
     themselves: when they differ from this one, a line offers them. Both label families: Classic Pro takes its stripe too
     (along the bottom edge, b2e27a2), through the same pieces and zones. */
  const storage = () => { try { return localStorage; } catch { return null; } };
  const CATALOG_LABELS = new Set(CATALOG.map((c) => c.label));
  // the body or the text as a spool: the build's Colors pick, or null when the Colors palette is off or has none
  const regionSpool = (key) => { const p = stage.palette(); const c = p && p.on && p.colors ? p.colors[key] : null; return c && c.name && c.hex ? { name: c.name, hex: c.hex } : null; };
  const REGION = { body: 'Label', text: 'Label:TEXT' };
  const REGION_WORD = { body: 'Label body', text: 'Label text' };
  const meaningWord = (key) => REGION_WORD[key] || spoolsOf(null).find((r) => r.key === key).meaning;
  function paletteCommit(next, desc) {
    store.flush();
    store.commit((x) => { x.labelPalette = next; }, 'label-palette');
    store.flush();
    status(desc); renderAll();
  }
  function setSpool(key, sp) {
    if (REGION[key]) {
      if (ctx.ownPaletteKey) ctx.ownPaletteKey();   // the build's own palette key before the first colour write (colors.js commitColors)
      store.flush(); stage.setColor(REGION[key], { name: sp.name, hex: sp.hex, url: sp.url || urlFor(sp.name) }); store.commit(() => {}, 'palette'); store.flush();
      status(`${REGION_WORD[key]}: ${sp.name}.`); renderAll(); return;
    }
    const spools = Object.fromEntries(LABEL_MEANINGS.map((k) => [k, spoolFor(S().labelPalette, k)]));
    spools[key] = { name: sp.name, hex: sp.hex };
    paletteCommit(paletteOf(spools, setOf(S().labelPalette)), `${meaningWord(key)} prints in ${sp.name}.`);   // the build's own suggestion set
  }
  /* the visitor's defaults, applied to this build: the six spools into the record, the body and text onto the Colors palette,
     ONE history entry (flushed around; the Colors palette rides in the same entry as the record) */
  function useDefaultsHere(d) {
    if (ctx.ownPaletteKey && (d.body || d.text)) ctx.ownPaletteKey();
    store.flush();
    for (const k of ['body', 'text']) if (d[k]) stage.setColor(REGION[k], { name: d[k].name, hex: d[k].hex, url: urlFor(d[k].name) });
    store.commit((x) => { x.labelPalette = paletteOfDefaults(d, setOf(x.labelPalette)); }, 'label-palette');
    store.flush();
    status('This build uses your label filaments.'); renderAll();
  }
  const defaultsDiffer = (d) => !!d && (!samePalette(paletteOfDefaults(d, setOf(S().labelPalette)), S().labelPalette) ||
    ['body', 'text'].some((k) => { const o = regionSpool(REGION[k]); return d[k] && (!o || o.name !== d[k].name || o.hex.toLowerCase() !== d[k].hex.toLowerCase()); }));   // a spool is its name AND its colour (Sol 01a182a1)
  /* the stripe meanings this build's labels actually print: a typed label's stripe, or a part label's own band while the
     part-label stripe is on */
  function usedMeanings() {
    const out = new Set();
    for (const l of R.labelsOf(S())) {
      const lk = labelLookOfLabel(l);
      const band = !lk ? null : lk.kind === 'stripe' ? lk.colours && lk.colours.band : lk.kind === 'part' && st.print.band !== 'off' ? lk.item && lk.item.colours && lk.item.colours.band : null;
      if (band && LABEL_MEANINGS.includes(band.colour)) out.add(band.colour);
    }
    return out;
  }
  /* LABEL FILAMENTS (the Print step; was the "Label colours" expander - the review's finding 5: its six rows were the stripe
     colour code, unnamed). A label drawn in this build's spools, then a row per spool it prints: the body, the words and each
     stripe colour a label here carries, named for what it marks; the other stripe colours under a disclosure. Every row
     opens its spool picker (no separate edit mode); defaults for new builds at the foot. */
  function renderFilaments() {
    const pal = S().labelPalette, rows = spoolsOf(pal);
    const body = stage.activeHex('Label'), text = stage.activeHex('Label:TEXT');
    const warns = paletteWarnings(pal, body, text);
    const used = usedMeanings();
    const box = el('div.palette.filaments', { 'aria-label': 'Label filaments' });
    box.appendChild(el('h4', { text: 'Label filaments' }));
    // the diagram: this build's body, words and (when one is used) first stripe colour, on the family's outline
    const stripeRow = rows.find((r) => used.has(r.key));
    const cp = S().faceStyle === 'classicpro';
    const shape = cp ? `<rect x="0" y="6" width="132" height="40" rx="3" fill="${body}"/>` : `<polygon points="0,4 122,4 102,48 0,48" fill="${body}"/>`;
    const stripe = stripeRow ? (cp ? `<rect x="0" y="40" width="132" height="6" fill="${stripeRow.hex}"/>` : `<rect x="0" y="4" width="9" height="44" fill="${stripeRow.hex}"/>`) : '';
    const word = (shown(R.labelShort(R.labelsOf(S())[0] || {})) || 'M3 SCREWS').slice(0, 12);
    box.appendChild(el('div.diagram', { 'aria-hidden': 'true', html: `<svg viewBox="0 0 132 52" width="132" height="52">${shape}${stripe}<text x="${stripeRow && !cp ? 16 : 8}" y="${cp ? 31 : 32}" font-family="Archivo, system-ui, sans-serif" font-weight="800" font-size="12" fill="${text}">${word.replace(/[<&"]/g, '')}</text></svg>` }));
    const d = readLabelDefaults(storage());
    if (defaultsDiffer(d)) box.appendChild(el('div.offer', { role: 'status' }, [el('span', { text: 'Your default label filaments differ from this build’s.' }), el('button.key.sm', { text: 'Use them here', onclick: () => useDefaultsHere(d) })]));
    const owned = readOwned(storage() || { getItem: () => null }, CATALOG_LABELS);
    const notesFor = (key) => warns.filter((w) => (key === 'text' ? w.kind === 'text' : w.kind !== 'text' && w.keys[0] === key)).map(warningText);
    const STRIPE_WORD = { 'sky-blue': 'Metric parts stripe', red: 'Inch parts stripe' };
    const word2 = (key) => REGION_WORD[key] || STRIPE_WORD[key] || `${meaningWord(key)} stripe`;
    const row = (key, sp, suggested) => {
      const open = st.palPick === key, w = word2(key);
      const label = [el('span.sw', { style: `--sw:${sp.hex}` }), el('span.mean', { text: w }), el('span.spoolcol', {}, [el('span.spool', { text: sp.name }), suggested ? el('span.dim.sugg', { text: 'suggested' }) : null])];
      const head = el('button.prow.pick' + (open ? '.on' : ''), { 'data-key': key, 'aria-expanded': String(open), 'aria-label': `${w}: ${sp.name}. Change the spool`, onclick: () => { st.palPick = open ? null : key; st.palQ = ''; renderAll(); } }, label);
      const out = [head, ...notesFor(key).map((t) => el('p.pnote', { 'data-key': key, text: t }))];
      if (open) out.push(pickerFor(key, sp));
      return out;
    };
    const list = el('div.prows', { 'aria-label': 'Label filaments' });
    for (const k of ['body', 'text']) {
      const own = regionSpool(REGION[k]);
      list.append(...row(k, own || { name: SUGGESTED_BODY_TEXT[k].name, hex: stage.activeHex(REGION[k]) }, !own));
    }
    for (const r of rows) if (used.has(r.key)) list.append(...row(r.key, r, r.suggested));
    box.appendChild(list);
    if (used.size) box.appendChild(el('p.dim', { text: 'Stripes mark hardware: blue for metric, red for inch. Each stripe colour prints from its own filament.' }));
    // the other stripe colours, for labels you may stripe later (and the Colors room's link to any of them)
    const rest = rows.filter((r) => !used.has(r.key));
    if (rest.length) {
      const more = el('details.allstripes', { open: st.allStripes || rest.some((r) => r.key === st.palPick) ? '' : null });
      more.addEventListener('toggle', () => { st.allStripes = more.open; });
      more.appendChild(el('summary', {}, [used.size ? 'The other stripe colours' : 'Stripe colours', el('span.chips', { 'aria-hidden': 'true' }, rest.map((r) => el('span.sw', { style: `--sw:${r.hex}` })))]));
      const l2 = el('div.prows');
      for (const r of rest) l2.append(...row(r.key, r, r.suggested));
      more.appendChild(l2);
      box.appendChild(more);
    }
    const acts = el('div.pacts');
    // back to the suggestions of the build's OWN set: a build born on v2 keeps v2, an older one v1 (never moved to newer ones)
    if (!samePalette(pal, suggestedPalette(setOf(pal)))) acts.appendChild(el('button.key.sm.suggested', { title: 'The suggested spools for the six stripe colours (the body and the text stay as they are)', onclick: () => paletteCommit(suggestedPalette(setOf(pal)), 'The stripes use the suggested filaments.') }, ['Use the suggested filaments']));
    acts.appendChild(el('button.key.sm.mydefaults', { title: 'Kept in this browser. New builds start with these; a build you already have keeps its own.', onclick: () => {
      const def = { v: 1, spools: Object.fromEntries(rows.map((r) => [r.key, { name: r.name, hex: r.hex }])) };
      for (const k of ['body', 'text']) { const o = regionSpool(REGION[k]); if (o) def[k] = o; }
      const st0 = storage();
      status(st0 && writeLabelDefaults(st0, def) ? 'New builds will start with these label filaments.' : 'This browser cannot keep defaults (private mode?).', !st0); renderAll();
    } }, ['Save as my default for new builds']));
    box.appendChild(acts);
    return box;
    function pickerFor(key, cur) {
      const pk = el('div.ppick');
      const q = el('input.search', { type: 'search', value: st.palQ || '', placeholder: 'Search filaments', 'aria-label': `Search filaments for ${word2(key)}`, autocomplete: 'off' });
      const items = el('div.pitems');
      const fill = () => {
        const t = (st.palQ || '').trim().toLowerCase();
        const all = rankSpools(key, owned).filter((c) => !t || c.name.toLowerCase().includes(t)).slice(0, t ? 60 : 24);
        items.replaceChildren(...all.map((c) => el('button.pitem' + (c.name === cur.name ? '.on' : ''), { 'aria-pressed': String(c.name === cur.name), title: c.name, onclick: () => { st.palPick = null; setSpool(key, c); } },
          [el('span.sw', { style: `--sw:${c.hex}` }), el('span', { text: c.name }), c.owned ? el('span.dim.own', { text: 'yours' }) : null])));
      };
      q.addEventListener('input', () => { st.palQ = q.value; fill(); });
      fill();
      pk.append(q, items);
      return pk;
    }
  }

  /* ---------------- add / edit a label (the editor card) ---------------- */
  const editor = el('aside.glass.glass-edge', { id: 'ws-labeledit', 'aria-label': 'Edit label', hidden: true });
  root.appendChild(editor);
  function openAdd() {
    openModal({ title: 'Add a label', body: ['Type what goes in the drawer. The icon is guessed from the words; change it after with Edit.'], ok: 'Add label', field: { placeholder: 'e.g. M3 screws' },
      onOk: () => { const t = modalField(); const r = R.add(L, S(), { text: t }); if (!r.ok) { say(r.msg); return; } closeModal(); labelCommit(r); if (phone) phone.open(panel); }, onCancel: () => closeModal() });
  }
  // on the phone the editor is a sheet of its own: opening it must raise it, or it waits collapsed behind the open Labels
  // sheet and the dock and the pencil seems to do nothing (the spacing audit, 2026-10-15: its close sat under Print labels)
  // the keyboard follows: an opening from the keyboard moves into the editor's first field; closing returns to the opener
  function openEdit(id, unitId) {
    const a = document.activeElement; const byKey = !!(a && a.matches && a.matches(':focus-visible'));
    st.editRet = focusKey();
    st.edit = { id, unitId, scope: 'all' }; st.query = ''; st.letter = ''; st.pick = null; renderAll(); if (phone) phone.open(editor);
    if (byKey) { const f = editor.querySelector('input.words') || editor.querySelector('button.x'); if (f) { try { f.focus({ preventScroll: true }); } catch { /* jsdom */ } } }
    if (!labelIcons()) loadLabelFont().then(() => refreshEditor()).catch(() => {});
  }
  // the editor alone, re-rendered (the icon font arrived, the scope changed), with the keyboard and half-typed words kept
  // (Sol 01a13fe5: a cold font load replaced the focused field and lost both)
  // while it rebuilds, the focused field's `change` on removal is not the visitor's commit (it committed the half-typed words)
  let quietEditor = false;
  function refreshEditor() {
    const fk = focusKey(); const a = document.activeElement;
    const typed = a && a.tagName === 'INPUT' && editor.contains(a) ? { v: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
    quietEditor = true; try { renderEditor(); } finally { quietEditor = false; }
    restoreFocus(fk);
    const b = document.activeElement;
    if (typed && b && b.tagName === 'INPUT' && editor.contains(b)) { if (b.value !== typed.v) b.value = typed.v; try { b.setSelectionRange(typed.s, typed.e); } catch { /* not a text field */ } }
  }
  if (debug) window.__GEN2_LABELS_REFRESH__ = refreshEditor;   // the e2e suite stands in for a late icon font
  function closeEdit() {
    const a = document.activeElement; const fromEditor = !a || a === document.body || editor.contains(a);
    const back = st.editRet; st.editRet = null; st.edit = null; renderAll();
    if (fromEditor) restoreFocus(back, true);   // renderAll parked the keyboard on the panel; the opener is where it goes back
  }
  const editCommit = (patch) => { const e = st.edit; if (!e) return; const r = R.edit(L, S(), e.id, patch, e.scope === 'this' && e.unitId != null ? 'this' : 'all', e.unitId); if (labelCommit(r) && r.id !== e.id) st.edit.id = r.id; renderAll(); };
  // a stripe: the colours, null (a part label's "no stripe") or undefined (the part's own; none on a typed label) - R.setStripe
  const stripeCommit = (colours) => { const e = st.edit; if (!e) return; const r = R.setStripe(L, S(), e.id, colours, e.scope === 'this' && e.unitId != null ? 'this' : 'all', e.unitId); if (labelCommit(r) && r.id !== e.id) st.edit.id = r.id; renderAll(); };
  function renderEditor() {
    const e = st.edit; const l = e ? R.labelById(S(), e.id) : null;
    editor.hidden = !l;
    // the editor going away while its phone sheet is up (Close, Escape, an undo that removes the label, another drawer):
    // the Labels sheet comes back, unless a label is armed for placing, when the model stays uncovered
    if (!l) { if (phone && phone.isOpen(editor)) { if (st.pick) phone.collapse(editor); else phone.open(panel); } editor.replaceChildren(); return; }
    editor.replaceChildren();
    const shared = L.assignedUnits({ list: S().labelList, assignments: assignOf() }, l.id);
    editor.appendChild(el('div.head', {}, [el('h2.h2', { text: R.isPartLabel(l) ? 'Part label' : 'Edit label' }), el('button.x', { title: 'Close', 'aria-label': 'Close the editor', onclick: closeEdit }, [icon('x', { size: 16 })])]));
    editor.appendChild(el('div.prev', {}, [preview(l, true)]));
    if (shared.length > 1 && e.unitId != null) editor.appendChild(el('div.track.seg2.scope', { role: 'group', 'aria-label': 'Which drawers change' }, [
      el('button.seg.sm' + (e.scope === 'all' ? '.on' : ''), { text: `All ${n(shared.length, 'drawer')}`, onclick: () => { e.scope = 'all'; refreshEditor(); } }),
      el('button.seg.sm' + (e.scope === 'this' ? '.on' : ''), { text: 'This drawer only', title: 'A copy of the label carries the change; the other drawers keep theirs', onclick: () => { e.scope = 'this'; refreshEditor(); } }),
    ]));
    if (R.isPartLabel(l)) { editor.appendChild(el('p.note', { text: 'This label is laid out from its part record in the Label Studio. Its words here are what the drawer shows in older tools.' })); }
    // the words
    const words = el('input.words', { type: 'text', maxlength: '40', value: R.labelWords(l), placeholder: 'What’s in this drawer?', autocomplete: 'off', 'aria-label': 'Label words' });
    // !st.edit: Escape closed the editor, and the field's change on removal came after (it threw on st.edit.id).
    // A label can arrive with more than the planner's 40 characters (a file; the format allows 200). Nothing changed commits
    // nothing (the stress test, 2026-10-15: Enter cut such a label to 40 without a word); a change keeps the first 40 and
    // says so
    const shownWords = words.value;   // what the field was rendered with: "nothing changed" is measured against it, raw (Terra 01a14005)
    const commitWords = () => {
      if (quietEditor || !st.edit) return;
      if (words.value === shownWords) return;
      const full = L.cleanText(words.value, L.TEXT_MAX);
      if (full === R.labelWords(R.labelById(S(), st.edit.id))) return;
      const t = L.cleanText(words.value, L.MIRROR_MAX);
      if (!t && !L.visibleBadge(l)) { say('A label needs words, an icon or a letter.'); words.value = R.labelWords(l); return; }
      editCommit({ text: t });
      if (full.length > L.MIRROR_MAX) say(`Labels made here hold ${L.MIRROR_MAX} characters, so the words were cut to “${t}”.`);
    };
    words.addEventListener('change', commitWords);
    words.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commitWords(); } });
    editor.appendChild(el('label.frow', {}, [el('span', { text: 'Words' }), words]));
    const long = R.labelWords(l).length;
    if (long > L.MIRROR_MAX) editor.appendChild(el('p.note', { text: `These words are ${long} characters long. Labels made here hold ${L.MIRROR_MAX}, so a change keeps the first ${L.MIRROR_MAX}.` }));
    const place = e.unitId == null && !shared.length ? el('div.row', {}, [el('button.key.sm', { onclick: () => { const id = st.edit.id; closeEdit(); chooseLabel(id); } }, [icon('hand-pointing', { size: 16 }), 'Place this label'])]) : null;
    // a part label prints its part's drawing (the Label Studio's layout), never an icon, so icon controls would do nothing
    // (Joey 2026-10-17: "it's kind of weird that i can select icons for these part picker labels, it doesnt seem to apply
    // them"). The look decides it exactly as for the 3D label: a drawer whose words were changed draws words and an icon.
    const editUnit = e.unitId != null ? R.drawers(S()).find((u) => u.id === e.unitId) : null;
    const lookNow = editUnit ? labelLookOf(S(), editUnit) : labelLookOfLabel(l);
    /* the stripe (Joey 2026-10-27: "if i'm manually typing a label i don't see how to set a color for the label stripe", then,
       of a Part Picker label, "i can't figure out after the fact how to add like a colored stripe?"): the Label Studio's menu
       (label-look.js STRIPE_COLOURS), stored on the label as `colours` as the Studio stores it. A typed label's runs along its
       left end, the one place its words never reach; a part label's goes where the stripe setting says, its words laid out
       clear of it, and it may keep the Part Picker's own colours (no `colours`), take none (`colours: null`, the Studio's "no
       stripe" for a part label) or one of these. On Classic Pro (since 2026-10-28) every stripe runs along the bottom edge,
       between the slits (the Studio's rule; main.js labelLookFor) */
    {
      const part = R.isPartLabel(l), own = part && l.hardware && l.hardware.colours && l.hardware.colours.band;
      const ownHex = own && typeof own.hex === 'string' ? own.hex : null;
      const on = l.colours === null ? 'none' : cleanStripe(l.colours, false)?.band.colour || (ownHex ? 'picker' : 'none');
      const known = STRIPE_COLOURS.find((x) => x.colour === on);
      // the part's own band, when it is one of the six meanings, is drawn in this build's spool for it (the label palette)
      const ownSpool = own && spoolFor(S().labelPalette, own.colour), ownDraw = ownSpool ? ownSpool.hex : ownHex;
      editor.appendChild(el('div.frow', {}, [el('span', { text: 'Stripe' }), el('span.dim', { text: on === 'none' ? 'None' : on === 'picker' ? `The part’s own · ${own.label || 'Part Picker'}` : known ? `${known.name} · ${spoolFor(S().labelPalette, known.colour).name}` : 'From the Label Studio' })]));
      editor.appendChild(el('div.swatches', { role: 'group', 'aria-label': 'Stripe colour' }, [
        ownHex ? el('button.sw.own' + (on === 'picker' ? '.on' : ''), { title: `The Part Picker’s colours (${own.label || ownHex}${ownSpool ? ' · ' + ownSpool.name : ''})`, 'aria-label': 'Stripe: the part’s own colours', 'aria-pressed': String(on === 'picker'), style: `--sw:${ownDraw}`, onclick: () => stripeCommit(undefined) }) : null,
        el('button.sw.none' + (on === 'none' ? '.on' : ''), { title: 'No stripe', 'aria-label': 'No stripe', 'aria-pressed': String(on === 'none'), onclick: () => stripeCommit(ownHex ? null : undefined) }),
        // each meaning swatched in the spool this build prints it in (the label palette); the label still stores the meaning
        ...STRIPE_COLOURS.map((x) => { const sp = spoolFor(S().labelPalette, x.colour); return el('button.sw' + (on === x.colour ? '.on' : ''), { title: `${x.name} · ${sp.name}`, 'aria-label': `Stripe: ${x.name}`, 'aria-pressed': String(on === x.colour), style: `--sw:${sp.hex}`, onclick: () => stripeCommit(stripeFor(x.colour)) }); }),
      ].filter(Boolean)));
    }
    if (lookNow && lookNow.kind === 'part') {
      editor.appendChild(el('p.note.noicon', { text: 'Icons don’t apply here: the part’s drawing prints in their place. To use an icon instead, choose “Use custom wording” on the drawer.' }));
      if (place) editor.appendChild(place);
      return;
    }
    // the icon
    const b = L.cleanBadge(l.badge, { svg: true });
    const state = !b ? 'auto' : b.type === 'none' ? 'none' : b.type === 'char' ? 'char' : b.svg ? 'upload' : 'icon';
    editor.appendChild(el('div.frow', {}, [el('span', { text: 'Icon' }), el('span.dim', { text: state === 'auto' ? (predicted(R.labelWords(l)) ? `Auto · ${iconName(predicted(R.labelWords(l))).toLowerCase()}` : 'Auto · none matched') : state === 'none' ? 'No icon' : state === 'char' ? `Letter · ${shown(b.value)}` : state === 'upload' ? 'Your uploaded icon' : `Manual · ${iconName(b.value).toLowerCase()}` })]));
    const letter = el('input.letter', { type: 'text', maxlength: String(L.CHAR_MAX), value: st.letter || (state === 'char' ? b.value : ''), placeholder: 'A', 'aria-label': 'Letter', autocomplete: 'off' });
    letter.addEventListener('input', () => { st.letter = letter.value; });
    letter.addEventListener('change', () => { if (quietEditor) return; const v = letter.value.trim(); if (v) editCommit({ badge: { type: 'char', value: v.slice(0, L.CHAR_MAX) } }); });
    editor.appendChild(el('div.track.seg3.badge', { role: 'group', 'aria-label': 'Icon' }, [
      el('button.seg.sm' + (state === 'auto' ? '.on' : ''), { text: 'Auto', title: 'Guess an icon from the words', onclick: () => editCommit({ badge: null }) }),
      el('button.seg.sm' + (state === 'none' ? '.on' : ''), { text: 'No icon', onclick: () => editCommit({ badge: { type: 'none' } }) }),
      el('button.seg.sm' + (state === 'char' ? '.on' : ''), { text: 'Letter', onclick: () => { letter.focus(); letter.select(); } }),
    ]));
    editor.appendChild(el('label.frow', {}, [el('span', { text: 'Letter' }), letter]));
    // the catalog
    const cat = labelIcons();
    const search = el('input.search', { type: 'search', value: st.query, placeholder: 'Search icons', 'aria-label': 'Search icons', autocomplete: 'off' });
    search.addEventListener('input', () => { st.query = search.value; renderGrid(); });
    editor.appendChild(search);
    const grid = el('div.igrid');
    editor.appendChild(grid);
    function renderGrid() {
      grid.replaceChildren();
      const groups = iconGroups(cat, st.query);
      if (!groups) { grid.appendChild(el('p.dim', { text: 'Loading icons…' })); return; }
      if (!groups.length) { grid.appendChild(el('p.dim', { text: 'No icon matches · try another word, or a letter.' })); return; }
      const cur = state === 'icon' ? b.value : null;
      const curGroup = cur && cat.find(cur) ? cat.find(cur).group : null;
      for (const g of groups) {
        const open = !!st.query.trim() || st.iconsOpen.has(g.id) || g.id === curGroup;
        const sec = el('div.igroup' + (open ? '.open' : ''));
        sec.appendChild(el('button.ghead', { 'aria-expanded': String(open), onclick: () => { const now = !sec.classList.contains('open'); sec.classList.toggle('open', now); if (now) st.iconsOpen.add(g.id); else st.iconsOpen.delete(g.id); } }, [icon('caret-right', { size: 14 }), el('span', { text: g.name }), el('span.dim', { text: String(g.items.length) })]));
        const cells = el('div.cells');
        for (const c of g.items) { const cell = el('button.cell' + (c.id === cur ? '.on' : ''), { title: c.name, 'aria-label': c.name, 'aria-pressed': String(c.id === cur), onclick: () => editCommit({ badge: { type: 'icon', value: c.id } }) }); cell.innerHTML = c.svg; cells.appendChild(cell); }
        sec.appendChild(cells);
        grid.appendChild(sec);
      }
    }
    renderGrid();
    if (place) editor.appendChild(place);
  }

  /* ---------------- the dock ---------------- */
  const dock = el('footer.glass', { id: 'ws-dock' });
  root.appendChild(dock);
  function renderDock() {
    const s = S(); const labels = R.labelsOf(s); const onN = Object.keys(assignOf()).filter((k) => R.labelById(s, assignOf()[k])).length;
    const dims = (() => { const b = stage.buildSize?.(); return b ? `${Math.round(b.x)} × ${Math.round(b.y)} × ${Math.round(b.z)}` : '—'; })();
    dock.replaceChildren(
      el('span.status' + (labels.length ? '' : '.issue'), {}, [el('span.dot'), labels.length ? `${n(labels.length, 'label')} · ${onN} on drawers` : 'No labels yet']),
      el('div.group', {}, [el('span.big', { text: String(s.placed.length) }), el('span.unit-lbl', { text: 'units' })]),
      el('div.group', {}, [el('span.big', { text: dims }), el('span.unit-lbl', { text: 'mm' })]),
      dockCta(labels),
    );
  }
  /* the dock's one big button follows the steps (the review's finding 1: it used to open another website at the very first
     step): nothing to do yet, the next step, the plate, or back from it */
  function dockCta(labels) {
    if (!L) return el('button.cta', { disabled: true }, ['Labels']);
    const step = stepNow();
    if (st.view === 'plate') return el('button.cta', { title: 'Back to the labels on the model', onclick: () => setView('build') }, ['Back to labels']);
    if (step === 'style') return el('button.cta.wait', { disabled: true, title: 'Labels need EdgeLabel or Classic Pro faceplates: pick one in the panel' }, ['Pick a label style']);
    if (step === 'drawers') return labels.length ? el('button.cta', { title: 'The filaments, the fine-tuning and the print file', onclick: () => goStep('print') }, ['Next: Print', icon('arrow-right', { size: 20 })])
      : el('button.cta.wait', { disabled: true, title: 'Type what goes in a drawer in the panel' }, ['Label a drawer first']);
    return el('button.cta', { title: 'Shows the Label plate: this build’s labels as the Label Studio lays them out, with the print file to download', onclick: () => setView('plate') }, ['Print labels', icon('arrow-right', { size: 20 })]);
  }

  /* "+ label" ON THE MODEL (the review's finding 2): a pill over each empty labelable drawer while the Drawers step is up,
     where the stage says that drawer's front is on the page (stage.unitScreen); the selected one asks what is in it. The
     pills take no pointer: a tap goes through to the drawer under it, which selects it as any tap on the model does. */
  const ghosts = el('div', { id: 'ws-ghosts', 'aria-hidden': 'true' });
  root.insertBefore(ghosts, root.firstChild);
  const ghostEls = new Map();
  function placeGhosts() {
    const s = S();
    const show = !!L && !root.hidden && !document.hidden && st.view !== 'plate' && !st.edit && stepNow() === 'drawers' && R.faceCarriesLabels(s) && typeof stage.unitScreen === 'function';
    const want = show ? R.emptyDrawers(s) : [];
    const keep = new Set();
    for (const u of want) {
      const typing = st.draft && st.draft.unitId === u.id && st.draft.text.trim();
      if (typing) continue;
      let p = null; try { p = stage.unitScreen(u.id); } catch { p = null; }
      if (!p) continue;
      keep.add(u.id);
      let g = ghostEls.get(u.id);
      if (!g) { g = el('span.ghost'); ghosts.appendChild(g); ghostEls.set(u.id, g); }
      const sel = st.selId === u.id;
      g.classList.toggle('sel', sel);
      const t = sel ? (phone ? '?' : 'What’s in here?') : (phone ? '+' : '+ label');   // a phone's model is small: a mark, not words
      if (g.textContent !== t) g.textContent = t;
      g.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
    }
    for (const [id, g] of ghostEls) if (!keep.has(id)) { g.remove(); ghostEls.delete(id); }
  }
  const ghostTimer = setInterval(placeGhosts, 150);
  signal.addEventListener('abort', () => clearInterval(ghostTimer));

  /* ---------------- layout ---------------- */
  const narrow = () => innerWidth < 1280;
  const phone = isPhone() ? phoneChrome(root, { ...ctx, active: 'labels', soon }, { panels: [
    { el: panel, title: () => { if (!L) return 'Labels'; const r = R.waiting(L, S()).length; const step = { style: 'Style', drawers: 'Drawers', print: 'Print' }[stepNow()]; return st.pick ? `Placing ${quote(R.labelById(S(), st.pick))} · tap a drawer` : `Labels · ${step}` + (r && step === 'Drawers' ? ` · ${r} not on a drawer` : ''); }, open: st.step === 'print' && !!st.palPick },   // open when a stripe's spool tapped in Colors brought the visitor here (its rows are in this sheet)
    // its own title row is hidden on the phone (app.css): the handle names the label and carries the × (the phone tour,
    // 2026-10-27: the two rows took 100 of the 190 px a phone on its side has)
    { el: editor, title: () => { const l = st.edit && R.labelById(S(), st.edit.id); return l ? `${R.isPartLabel(l) ? 'Part label' : 'Edit'} · ${quote(l)}` : 'Edit label'; }, close: () => closeEdit() },
  ] }) : null;
  if (phone) phone.onLayout(safe);
  function safe() {
    if (plate) {   // the plate fills the stage area the panels and the toolbar leave (the toolbar wraps at narrow widths; the phone's chrome moves)
      const s = plate.box.style;
      s.top = phone ? phone.top() + 'px' : Math.round(bar.el.getBoundingClientRect().bottom + 10) + 'px';
      s.bottom = phone ? phone.bottom() + 'px' : ''; s.left = phone ? phone.left() + 'px' : ''; s.right = phone ? phone.right() + 'px' : '';
    }
    if (phone) { stage.setSafeArea({ left: phone.left(), right: phone.right(), top: phone.top(), bottom: phone.bottom() }); return; }
    stage.setSafeArea({ left: 324 + 28, right: (st.edit ? 304 : 0) + 28, top: narrow() ? 134 : 90, bottom: 118 });
  }
  /* THE FOCUS ACROSS A RE-RENDER (the stress test, 2026-10-15). After Switch to EdgeLabel, Add label, Fill, Undo, a
     row, the editor's open and close, and Escape, the keyboard was left at <body>. renderAll replaces the panel's
     controls, so the one that had focus is found again by its name. When it is gone or disabled, the panel itself takes
     the keyboard, so Tab goes on from there. */
  panel.tabIndex = -1; editor.tabIndex = -1;
  // a per-label control carries a stable key (data-focus): its words, and so its accessible name, change with an edit
  const focusName = (b) => b.getAttribute('data-focus') || b.getAttribute('aria-label') || b.title || b.textContent.trim();
  function focusKey() {
    const a = document.activeElement;
    if (!a || a === document.body) return null;
    const host = panel.contains(a) ? panel : editor.contains(a) ? editor : null;
    if (!host || a === host) return null;
    const name = focusName(a);
    return { host, tag: a.tagName, name, i: [...host.querySelectorAll(a.tagName)].filter((x) => focusName(x) === name).indexOf(a) };
  }
  function restoreFocus(k, force = false) {
    if (!k) return;
    const a = document.activeElement;
    if (!force && a && a !== document.body && document.contains(a)) return;   // the keyboard is somewhere real: leave it
    const same = [...k.host.querySelectorAll(k.tag)].filter((x) => focusName(x) === k.name && !x.disabled && x.getClientRects().length);
    const t = same[Math.min(Math.max(k.i, 0), same.length - 1)] || (k.host.hidden ? panel : k.host);
    try { t.focus({ preventScroll: true }); } catch { /* jsdom */ }
  }
  function renderAll() { const fk = focusKey(); root.classList.toggle('editing', !!st.edit); root.classList.toggle('view-plate', st.view === 'plate'); renderPanel(); renderEditor(); renderDock(); bar.sync(); if (phone) phone.refresh(); safe(); restoreFocus(fk); const fresh = st.fresh && panel.querySelector('.chip-l.new'); if (fresh) { try { fresh.scrollIntoView({ block: 'nearest' }); } catch { /* jsdom */ } } }
  addEventListener('resize', safe, { signal });
  addEventListener('hashchange', () => { if (L) importFromHash(); }, { signal });
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Escape') { if (pp.isOpen()) { closePicker(); return; } if (modalState) { modalState.onCancel(); return; } if (st.edit) { closeEdit(); return; } if (st.pick) { armPlacing(null); return; } if (tag === 'input') { if (st.draft && e.target.matches('.qwords')) { dropDraft(); renderAll(); } e.target.blur(); return; } stage.setSelected(null); return; }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === '\\') { root.hidden = !root.hidden; return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
  }, { signal });

  /* ---------------- stage ---------------- */
  const steps = stage.manifest?.steps?.length ?? 0;
  if (steps && stage.cur !== steps) stage.goTo(steps, { animate: false });
  stage.setDims(false);
  renderAll();
  loadLabelList().then((mod) => {
    if (signal.aborted) return;
    L = mod;
    /* a build from a link, a file or an older tool: its typed drawers become list labels (one conversion, one history entry).
       Only when reconciling changes something: the commit alone turned the record's null label fields into absent ones, so
       opening Labels saved a new version of an untouched build, which another tab's stale-tab guard reads as a newer save
       (the guard's design check, 2026-10-22). serialize() is a copy: the dry run leaves the record as it is */
    let changed = false;
    if (R.reconcileLoad(L, store.serialize())) store.commit((s) => { changed = R.reconcileLoad(L, s); }, 'label-sync');
    if (!changed) store.flush();
    const back = ctx.memo?.labelsSel; if (back != null && unit(back)) { st.selId = back; stage.selectUnit(back); }
    importOpened();   // the link this page opened with (after the labels this browser kept for the build, when there are any)
    importFromHash();
    // Parts' "Download labels" asks for the Label plate, where the print file downloads; a build with no labels stays On build
    if (ctx.memo && ctx.memo.labelsView === 'plate') { ctx.memo.labelsView = null; if (R.labelsOf(S()).length) setView('plate'); }
    if (R.faceCarriesLabels(S()) && st.step === 'drawers' && st.view !== 'plate') autoSelect();   // (no label faceplate: stepNow() shows Style, unless a link's labels opened the list)
    renderAll();
    if (R.labelsOf(S()).length) loadLabelFont().then(() => renderAll()).catch(() => {});   // the icon art for the previews
  }).catch((e) => { status(`The label tools did not load (${e.message}). Reload the page to try again.`, true); renderAll(); });

  return {
    onHover(unitId) { if (L) hoverPreview(unitId); },
    onSelect(sel) {
      st.sel = sel;
      const owner = sel ? (sel.owner ?? stage.partInfo?.(sel.id)?.owner ?? null) : null;
      if (sel && st.pick && L) { if (owner != null) tapDrawer(owner); stage.setSelected(null); return; }
      const changed = owner !== st.selId;
      if (changed) { if (st.draft && st.draft.unitId !== owner) dropDraft(); st.scope = 'all'; }
      st.selId = owner;
      if (owner != null && assignOf()[owner] && R.labelById(S(), assignOf()[owner])) setSelLabel(assignOf()[owner]);   // a labelled drawer selects its label
      if (owner != null && st.edit && st.edit.unitId != null && st.edit.unitId !== owner) st.edit = null;
      // a drawer selected on the model or in the map, from the Drawers step: the keyboard goes to its editor, so a tap and
      // the words are the whole of it (not on the phone: the keyboard would cover the model)
      if (changed && owner != null && L && R.faceCarriesLabels(S()) && st.view !== 'plate' && !st.edit) st.step = 'drawers';
      renderAll();
      if (!phone && owner != null && stepNow() === 'drawers' && !st.edit) { const q = panel.querySelector('input.qwords'); if (q && document.activeElement !== q) { try { q.focus({ preventScroll: true }); const v = q.value.length; q.setSelectionRange(v, v); } catch { /* jsdom */ } } }
      if (phone && owner != null && !st.pick) phone.open(panel);
    },
    unmount() {
      if (st.draft) { st.draft = null; try { stage.setLabels(store.serialize()); } catch { /* the stage is going too */ } }   // half-typed words never follow into another workspace
      ac.abort(); unsub();
      if (ctx.memo) ctx.memo.labelsSel = st.selId;
      stage.setSelected(null); stage.setSafeArea(null); stage.watchHover(false);
      document.documentElement.classList.remove('ws-partpicker-open');
      hideHint();
      if (phone) phone.destroy(); root.remove();
    },
  };
}
