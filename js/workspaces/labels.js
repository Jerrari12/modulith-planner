/* THE LABELS WORKSPACE (phase 5). One shared label list, two ways onto the drawers (the planner's label-place design, Joey +
   Astra, PLACEMENT-PLAN.md): DRAWER FIRST - tap a drawer on the model, then click a label, and the drawer stays selected;
   PLACE SEVERAL - arm a label, then tap drawers one after another. A click never replaces silently (the Replace dialog), Fill
   empty drawers previews its exact pairs, every operation is one Undo step with a "Last change" line, and the model is the
   record: the stage redraws the label text in place after each commit (stage.setLabels).
   The list itself: typed labels (words, an icon or a letter), labels from a file (a MODULITH label list, a Part Picker items
   file, a Label Studio set) or from a #labels-add= link, the set-wide label settings, and exports. Making labels - icons,
   stripes, part layouts, the print plate - stays the Label Studio's job: Make labels / Part Picker open it, and the LABEL PLATE
   view (step B1) shows this build's list as the Studio lays it out, in a frame, read-only, with its print file to download. */
import { el, makeToast, trapTab } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { topbar } from '../ui/topbar.js';
import { toolbar } from '../ui/toolbar.js';
import { isPhone, phoneChrome } from '../ui/phone.js';
import { generateManifest } from '../generate.js';
import * as R from '../rules/labels.js';
import * as P from '../rules/plate.js';
import { LABEL_STYLE_ROWS, styleEdit, iconGroups, effectiveStyle } from '../label-panel.js';
import { loadLabelFont, labelIcons } from '../label-text.js';
import { attachHint, hideHint, scene, appear, moveTo, blink } from '../ui/hint.js';

// eslint-disable-next-line no-undef
const G = typeof GEN2 !== 'undefined' ? GEN2 : null;   // the planner's catalog: a classic-script LEXICAL global, not a globalThis property

/* ---- the brand icons of the two Label Studio tiles (its own tag and the Part Picker's bolt), and the hover scenes ---- */
const STUDIO_ICON = () => scene('0 0 16 16', '<path fill="currentColor" fill-rule="evenodd" d="M2 2h6l6.3 6.3a1.5 1.5 0 0 1 0 2.1l-3.9 3.9a1.5 1.5 0 0 1-2.1 0L2 8V2zm3.2 1.9a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/>');
const PICKER_ICON = () => scene('0 0 16 16', '<path fill="currentColor" d="M4.2 1h7.6l1.7 2.6-1.7 2.6H4.2L2.5 3.6zM6.6 6.2h2.8V15H6.6z"/>');
/* every scene is 240 x 110 on one 4 s loop; a label strip is the EdgeLabel outline (the slanted right edge) */
const strip = (x, y, w = 92, h = 34, extra = '') => `<g transform="translate(${x} ${y})" ${extra}><polygon points="0,0 ${w},0 ${w - h * 0.9},${h} 0,${h}" fill="#f4f1ec"/>`;
const SCENES = {
  type: () => scene('0 0 240 110', `
    <rect x="0" y="0" width="240" height="110" rx="8" fill="none"/>
    ${strip(36, 36, 140, 42)}
      <text x="12" y="27" font-family="Archivo, system-ui, sans-serif" font-weight="800" font-size="16" fill="#1b1b1b">
        <tspan opacity="0">M3${appear(0.08)}</tspan><tspan opacity="0"> SCR${appear(0.26)}</tspan><tspan opacity="0">EWS${appear(0.42)}</tspan></text>
      <rect x="12" y="13" width="2" height="18" fill="#1b1b1b" opacity="0">${appear(0.02, 0.62)}${blink()}</rect>
      <g opacity="0" transform="translate(100 8)">${appear(0.66)}<path d="M16 4l-5 5 1.5 1.5 5-5A4 4 0 0 1 13 11l-6 6-2-2 6-6A4 4 0 0 1 16 4z" fill="#1b1b1b"/></g>
    </g>
    <text x="120" y="98" text-anchor="middle" font-family="IBM Plex Sans, system-ui" font-size="10" fill="#9a9a9a" opacity="0">${appear(0.7)}the icon is guessed from the words</text>`),
  file: () => scene('0 0 240 110', `
    <g opacity="0">${appear(0.02, 0.5)}${moveTo(30, -30, 30, 22, 0.05, 0.25)}
      <path d="M0 0h26l12 12v38H0z" fill="#e9e6df"/><path d="M26 0v12h12" fill="#cfcbc2"/>
      <rect x="6" y="20" width="22" height="3" rx="1" fill="#9a9a9a"/><rect x="6" y="28" width="26" height="3" rx="1" fill="#9a9a9a"/><rect x="6" y="36" width="18" height="3" rx="1" fill="#9a9a9a"/></g>
    <g opacity="0">${appear(0.34)}${strip(112, 18, 100, 28)}<text x="10" y="19" font-family="Archivo, system-ui" font-weight="800" font-size="12" fill="#1b1b1b">M4 × 16</text></g></g>
    <g opacity="0">${appear(0.48)}${strip(112, 52, 100, 28)}<text x="10" y="19" font-family="Archivo, system-ui" font-weight="800" font-size="12" fill="#1b1b1b">HEX KEYS</text></g></g>
    <text x="120" y="100" text-anchor="middle" font-family="IBM Plex Sans, system-ui" font-size="10" fill="#9a9a9a" opacity="0">${appear(0.6)}a label list, a Part Picker file, a Studio set</text>`),
  studio: () => scene('0 0 240 110', `
    ${strip(24, 22, 150, 52)}
      <text x="48" y="31" font-family="Archivo, system-ui" font-weight="800" font-size="17" fill="#1b1b1b">COFFEE</text>
      <path transform="translate(10 12)" d="M3 6h16v8a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V6zm16 2h3a3 3 0 0 1 0 6h-3M2 24h18" fill="none" stroke="#1b1b1b" stroke-width="2.2" stroke-linecap="round"/>
      <rect x="0" y="44" width="150" height="8" fill="#2f6fd6"><animate attributeName="fill" values="#2f6fd6;#2f6fd6;#d6392f;#d6392f;#2e9e63;#2e9e63;#2f6fd6" keyTimes="0;.28;.33;.61;.66;.94;1" dur="4s" repeatCount="indefinite"/></rect>
    </g>
    <g transform="translate(190 30)" opacity="0">${appear(0.5)}<rect x="0" y="0" width="30" height="40" rx="3" fill="none" stroke="#9a9a9a" stroke-width="1.5"/><rect x="4" y="5" width="22" height="7" fill="#f4f1ec"/><rect x="4" y="16" width="22" height="7" fill="#f4f1ec"/><rect x="4" y="27" width="22" height="7" fill="#f4f1ec"/></g>
    <text x="120" y="100" text-anchor="middle" font-family="IBM Plex Sans, system-ui" font-size="10" fill="#9a9a9a">icons · stripes · uploads · the print plate</text>`),
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
const HINTS = {
  type: { title: 'Type a label', text: 'Words for one drawer; the icon is guessed, or pick one after.', scene: SCENES.type, video: `img/hints/labels-type.mp4` },
  file: { title: 'Add from a file', text: 'A MODULITH label list, a Part Picker label-items file, or a Label Studio set.', scene: SCENES.file, video: `img/hints/labels-file.mp4` },
  studio: { title: 'Label Studio', text: 'Make labels with icons, stripes and uploads, and print the plate. Opens in a new tab.', scene: SCENES.studio, video: `img/hints/labels-studio.mp4` },
  picker: { title: 'Part Picker', text: 'Choose screws, nuts, washers and inserts; each becomes a label laid out from its part record.', scene: SCENES.picker, video: `img/hints/labels-picker.mp4` },
  fill: { title: 'Fill empty drawers', text: 'Every waiting label onto an empty drawer, top row first, left to right. One Undo takes it back.', scene: SCENES.fill, video: `img/hints/labels-fill.mp4` },
  several: { title: 'Place several', text: 'Arm a label, then tap drawers one after another; the next waiting label follows.', scene: SCENES.several, video: `img/hints/labels-several.mp4` },
};
const LABEL_STUDIO_URL = 'https://labels.modulith.systems/';
/* the Studio this page talks to. A page served from loopback may point at a local Studio with ?studio=http://127.0.0.1:PORT/
   (kept for the tab); a page on any other origin ignores it, so a link cannot point a visitor at another Studio. */
const STUDIO = (() => {
  try {
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(location.origin);
    const ok = (u) => typeof u === 'string' && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}\/$/.test(u);
    const q = new URLSearchParams(location.search).get('studio');
    if (local && ok(q)) sessionStorage.setItem('gen2-studio-url', q);
    const s = sessionStorage.getItem('gen2-studio-url');
    if (local && ok(s)) return s;
  } catch { /* no storage */ }
  return LABEL_STUDIO_URL;
})();
const STUDIO_ORIGIN = new URL(STUDIO).origin;
const PICKER_MAX = 200;   // the Picker's own cap on one batch
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
  document.head.appendChild(s);
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
  const st = { selId: null, sel: null, pick: null, edit: null, status: '', warn: false, last: null, query: '', letter: '', settings: false, iconsOpen: new Set(), hover: null, drag: null, dragEnd: null, fresh: null, view: 'build', selLabel: null };
  let L = null;   // the label-list module once loaded
  const root = el('div', { id: 'ws' });
  document.body.appendChild(root);
  const { say, soon } = makeToast(root);
  root.prepend(topbar(stage, { ...ctx, active: 'labels', say, soon, signal }));
  const bar = toolbar(stage, { soon, history: { undo: () => store.undo(), redo: () => store.redo(), get canUndo() { return store.canUndo; }, get canRedo() { return store.canRedo; } } });
  root.appendChild(bar.el);

  /* ---------------- the record, the stage ---------------- */
  const tryGen = (rec) => { try { return generateManifest(rec); } catch (e) { return { manifest: null, errors: [String((e && e.message) || e)] }; } };
  let lastSig = null, queue = Promise.resolve();
  { const g = tryGen(store.serialize()); lastSig = g.manifest ? sigOf(g.manifest) : null; }
  function syncStage() {
    queue = queue.then(async () => {
      const rec = store.serialize();
      const gen = tryGen(rec);
      if (!gen.manifest) return;
      const sig = sigOf(gen.manifest);
      if (sig !== lastSig) { lastSig = sig; const r = await stage.update(rec, gen); if (r.ok) { stage.skipToEnd(); stage.setDims(false); } }
      else stage.setLabels(rec);
      if (st.selId != null && !S().placed.some((u) => u.id === st.selId)) { st.selId = null; st.sel = null; }
    }).catch((e) => console.error(e));
    return queue;
  }
  const unsub = store.subscribe((state, why) => {
    const sig = P.labelSig(state, st.print); if (sig !== lastLabelSig) { lastLabelSig = sig; labelRev++; syncPlateSoon(); }   // a label-relevant change: a new rev, the plate follows
    // an undo, a redo or a load: the status line described the state before it ("Removed …" outlived the toolbar's Undo of
    // that remove, the stress test 2026-10-15), so it goes
    if (why === 'adopt') return; if (why === 'undo' || why === 'redo' || why === 'load') { if (st.pick && !R.labelById(state, st.pick)) st.pick = null; if (st.edit && !R.labelById(state, st.edit.id)) st.edit = null; status(''); } syncStage(); renderAll(); });
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
    st.last = { desc: r.desc, key: JSON.stringify(store.serialize()) };   // after normalize and the push: the entry as the store holds it
    renderAll();
    return true;
  }
  const lastChange = () => (st.last && st.last.key === JSON.stringify(store.serialize()) ? st.last : null);
  function undoLabel() {
    if (!lastChange()) { status('The last change was not a label change, so this Undo leaves it alone. Undo in the toolbar takes it back.', true); renderAll(); return; }
    st.last = null; store.undo();
  }
  const status = (msg, warn = false) => { st.status = msg || ''; st.warn = warn; };
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
    const list = el('div.pairs', {}, pairs.map(([u, id]) => el('div.pair', {}, [el('b', { text: `Drawer ${R.drawerNumber(S(), u)}` }), el('span', { text: shown(R.labelShort(R.labelById(S(), id))) || '(icon only)' })])));
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
  const fileIn = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  fileIn.addEventListener('change', async () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (!f) return; let doc; try { doc = JSON.parse(await f.text()); } catch { status('That file is not a labels file (it is not JSON).', true); renderAll(); return; } importDoc(doc, 'file'); });
  root.appendChild(fileIn);
  function importDoc(doc, how) {
    const got = R.labelsFromDoc(L, doc);
    if (got.problem) { status(got.problem, true); renderAll(); return 'bad'; }
    // a set file's settings come with its labels, in the same history entry, when this build has none of its own yet
    const style = got.style && Object.keys(got.style).length && !S().labelStyle ? got.style : null;
    const ok = labelCommit(R.importLabels(L, S(), got.labels), 'labels-add', style ? (s) => { for (const [k, v] of Object.entries(style)) styleEdit(s, k, v); } : null);
    if (ok) { st.pick = null; st.selId = null; stage.setSelected(null); renderAll(); if (phone) phone.open(panel); }
    return ok ? 'added' : 'bad';
  }
  /* a #labels-add= part in the address (the Label Studio's "Add to planner build" link, or a shared labels link): imported once,
     then dropped from the hash; the build's own #build= part stays */
  function importFromHash() {
    const m = /(?:^#|&)labels-add=([^&]+)/.exec(location.hash || '');
    if (!m) return;
    let doc = null; try { doc = b64urlJson(decodeURIComponent(m[1])); } catch { doc = undefined; }
    history.replaceState(null, '', location.href.replace(/[#&]labels-add=[^&]+/, (x) => (x.startsWith('#') ? '#' : '')).replace(/#&/, '#').replace(/#$/, ''));
    if (doc === undefined) { status('This labels link is damaged; nothing was added.', true); renderAll(); return; }
    importDoc(doc, 'link');
  }
  /* THE PART PICKER MODAL (docs/redesign/LABELS-INTEGRATION.md, step A): the Studio's Part Picker in a frame over the
     workspace, made once per page and hidden between openings so its choices persist. The planner speaks first: a hello
     with a session the Picker binds to (it checks the origin against its own list); every message after carries the
     session, and the planner reads only from its own frame's window at the Studio's origin. A batch lands in the build
     that was open when the modal opened, as one history entry; the Picker is answered only after the store took it. */
  let picker = null;
  const PICKER_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const newSession = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map((b) => PICKER_ALPHABET[b % 62]).join(''); };
  /* THE HANDSHAKE'S PATIENCE (the stress test, 2026-10-15: a slow or unreachable Studio was blamed on the allowlist, and
     nothing offered a retry). After 8 s it says what is likely and offers Try again, which reloads the frame (the load
     sends the hello again) and waits again. */
  function armWait(h, who) {
    clearTimeout(h.wait);
    h.wait = setTimeout(() => {
      if (h.ready || h.bad) return;
      h.link.replaceChildren(el('span', { text: `${who} hasn’t answered yet. It may be slow, or its site may be down. ` }),
        el('button.key.sm', { onclick: () => { h.link.textContent = 'Connecting…'; try { h.frame.src = h.frame.src; } catch { /* the frame went away */ } armWait(h, who); } }, ['Try again']));
    }, 8000);
  }
  /* EDIT PART DETAILS OPENS THAT PART (LABELS-INTEGRATION.md, the parts channel's additions, `open/1`): only to a Picker
     whose ready offered the cap; one request at a time, the latest wins, and an answer counts only with its own req. An
     older Picker just opens, as before. */
  function sendOpen() {
    const p = picker; if (!p || !p.ready || !p.pendingOpen) return;
    const want = p.pendingOpen; p.pendingOpen = null;
    if (!(p.caps || []).includes('open/1')) return;
    let size = Infinity; try { size = JSON.stringify(want.item).length; } catch { /* not plain data */ }
    if (size > 64 * 1024) return;   // bounded as an add item is
    p.req = newSession();
    try { p.frame.contentWindow.postMessage({ gen2parts: 'open', v: 1, session: p.session, req: p.req, id: want.id, item: want.item }, STUDIO_ORIGIN); } catch { /* the frame went away */ }
  }
  function openPicker({ open = null } = {}) {
    if (picker && picker.buildId !== S().buildId) { picker.veil.remove(); picker = null; }   // another build: a new frame and session, so a batch still in flight for the old one is a stranger here (Sol 01a13844); the Picker keeps its list in its own storage
    if (!picker) {
      const session = newSession();
      const frame = el('iframe', { src: STUDIO + 'parts/?embed=planner' + (S().faceStyle === 'classicpro' ? '&type=classicpro' : ''), title: 'Part Picker', referrerpolicy: 'strict-origin-when-cross-origin' });
      const closeBtn = el('button.x', { title: 'Close', 'aria-label': 'Close the Part Picker', onclick: () => closePicker() }, [icon('x', { size: 18 })]);
      const link = el('span.link', { role: 'status', text: 'Connecting…' });   // the handshake, in the planner's own words
      // Tab stays in the dialog (the stress test, 2026-10-15): a sentinel on each side sends the keyboard round to the other end
      const trap = (to) => el('span.trap', { tabindex: '0', 'aria-hidden': 'true', onfocus: () => { try { to().focus(); } catch { /* gone */ } } });
      const veil = el('div', { id: 'ws-partpicker', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Part Picker', hidden: true }, [
        trap(() => frame),
        el('div.glass.frame', {}, [el('div.head', {}, [el('h2', { text: 'Part Picker' }), el('span.sub', { text: 'Choose parts, then Add labels: they land in this build’s list, ready to place.' }), link, closeBtn]), frame]),
        trap(() => closeBtn),
      ]);
      root.appendChild(veil);
      // the build rides on the hello (LABELS-INTEGRATION.md, the parts channel's additions): the Picker keys its "sent" marks by it
      const hello = () => { try { frame.contentWindow.postMessage({ gen2parts: 'hello', v: 1, session, ...(picker && picker.buildId ? { buildId: picker.buildId } : {}) }, STUDIO_ORIGIN); } catch { /* the frame is not there yet */ } };
      frame.addEventListener('load', hello);
      const onMessage = (e) => {
        if (!picker || e.source !== frame.contentWindow || e.origin !== STUDIO_ORIGIN) return;
        const d = e.data;
        if (picker.log.length < 20) picker.log.push(d && d.gen2parts);
        if (!d || typeof d !== 'object' || d.v !== 1 || d.session !== session) return;
        if (d.gen2parts === 'ready') { picker.ready = true; picker.caps = Array.isArray(d.caps) ? d.caps.filter((c) => typeof c === 'string').slice(0, 16) : []; clearTimeout(picker.wait); picker.link.textContent = ''; sendOpen(); return; }
        // Escape inside the frame never reaches this page's keys: the Picker asks, and the dialog closes as its own Escape does
        if (d.gen2parts === 'close') { closePicker(); return; }
        // the answer to an `open`: counted only with the latest req (a superseded one is dropped); a refusal's words show in
        // the dialog's head, where the visitor is looking (this `refused` comes FROM the Picker and carries req, not batch)
        if (d.gen2parts === 'opened' || (d.gen2parts === 'refused' && typeof d.req === 'string')) {
          if (!picker.req || d.req !== picker.req) return;
          picker.req = null;
          if (d.gen2parts === 'refused' && typeof d.reason === 'string') picker.link.textContent = d.reason.slice(0, 300);
          return;
        }
        if (d.gen2parts !== 'add') return;
        // the batch id the Picker minted for this send rides back on the reply, so a late reply to a timed-out send is never
        // credited to the next one (Astra, 2026-10-14: a wrong "added" is not cosmetic); an older Picker sends none and gets none
        const batch = typeof d.batch === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(d.batch) ? d.batch : undefined;
        const reply = (m) => { try { e.source.postMessage({ ...m, v: 1, session, ...(batch ? { batch } : {}) }, STUDIO_ORIGIN); } catch { /* the frame went away */ } };
        if (picker.veil.hidden) { reply({ gen2parts: 'refused', reason: 'The Part Picker was closed before the labels arrived. Open it and press Add part labels again.' }); return; }
        if (S().buildId !== picker.buildId) { reply({ gen2parts: 'refused', reason: 'The planner moved to another build while the Part Picker was open. Close it and open it again on that build.' }); return; }
        if (!Array.isArray(d.items) || !d.items.length) { reply({ gen2parts: 'refused', reason: 'No part labels came through.' }); return; }
        if (d.items.length > PICKER_MAX) { reply({ gen2parts: 'refused', reason: `The planner takes at most ${PICKER_MAX} part labels at once.` }); return; }
        if (!L) { reply({ gen2parts: 'refused', reason: 'The planner’s label module has not loaded yet; try again in a moment.' }); return; }
        const r = R.addPartItems(L, S(), d.items);
        if (!labelCommit(r, 'labels-add')) { reply({ gen2parts: 'refused', reason: r.msg || 'The planner could not add them.' }); return; }
        reply({ gen2parts: 'added', count: r.added.length + r.updated.length, skipped: r.skipped });
        st.fresh = new Set([...r.added, ...r.updated]); st.pick = null; st.selId = null; stage.setSelected(null);
        closePicker(); renderAll(); say(r.msg); if (phone) phone.open(panel);
      };
      addEventListener('message', onMessage, { signal });
      picker = { veil, frame, closeBtn, link, session, buildId: null, ready: false, hello, ret: null, log: [], wait: 0 };
      if (new URLSearchParams(location.search).get('debug')) window.__GEN2_PICKER__ = () => picker;   // the e2e suite reads the handshake
    }
    picker.buildId = S().buildId;   // the destination: a batch for another build is refused
    picker.ret = document.activeElement; picker.retKey = focusKey();
    picker.veil.hidden = false;
    document.documentElement.classList.add('ws-partpicker-open');
    // this opening's request: a part to open (Edit part details), or none. A new `open` replaces an outstanding one (sendOpen
    // mints a new req); an opening without a part leaves it be, since its answer may still come and a refusal's words still
    // matter (Sol 01a13ffb: clearing req on every opening dropped a refusal that arrived after a quick close and reopen)
    picker.pendingOpen = open && typeof open.id === 'string' && open.id ? { id: open.id, item: open } : null;
    if (picker.ready) { picker.link.textContent = ''; sendOpen(); }
    else {
      picker.hello();   // a frame that loaded before this page listened (or lost the first hello) hears it again
      armWait(picker, 'The Part Picker');
    }
    setTimeout(() => { try { picker.closeBtn.focus(); } catch { /* jsdom */ } }, 0);
  }
  function closePicker() {
    if (!picker || picker.veil.hidden) return;
    picker.veil.hidden = true;
    document.documentElement.classList.remove('ws-partpicker-open');
    const r = picker.ret; picker.ret = null;
    if (r && typeof r.focus === 'function' && document.contains(r)) { try { r.focus(); } catch { /* gone */ } }
    else restoreFocus(picker.retKey, true);   // the add re-rendered the opener (the stress test, 2026-10-15: the keyboard stayed on the hidden frame)
  }
  function openStudio(parts) {
    // ?return= says where Add to planner build comes back to (this app's address, Labels open); the Studio honours it once it
    // allows this origin (DECISIONS.md 2026-10-13: the dated blocker), and ignores it until then
    const q = '?from=planner' + (S().faceStyle === 'classicpro' ? '&type=classicpro' : '') + '&return=' + encodeURIComponent(location.origin + location.pathname + '?ws=labels');
    try { window.open(LABEL_STUDIO_URL + q + (parts ? '#parts' : ''), '_blank', 'noopener'); } catch { say('Your browser blocked the Label Studio. Allow pop-ups for this site, then press it again.'); }   // noopener: the handle is always null, so no "blocked" from it (Sol 01a13518)
  }
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
    if (v === 'plate') { openPlate(); if (phone) phone.collapse(panel); } else if (plate) plate.box.hidden = true;
    renderAll();
  }
  function openPlate() {
    if (!plate) {
      const session = newSession();
      const frame = el('iframe', { src: STUDIO + '?embed=planner', title: 'Label plate: the Label Studio', referrerpolicy: 'strict-origin-when-cross-origin' });
      const link = el('span.link', { role: 'status', text: 'Connecting to the Label Studio…' });
      const box = el('div.glass', { id: 'ws-plate', role: 'region', 'aria-label': 'Label plate', hidden: true }, [
        el('div.head', {}, [el('h2', { text: 'Label plate' }), el('span.sub', { text: 'This build’s labels as the Label Studio lays them out. Edit them On build; download the print file here.' }), link]), frame]);
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
  function renderViewBar() {
    return el('div.track.seg2.view', { role: 'group', 'aria-label': 'View' }, [['build', 'On build'], ['plate', 'Label plate']].map(([v, t]) =>
      el('button.seg.sm' + (st.view === v ? '.on' : ''), { text: t, 'aria-pressed': String(st.view === v), onclick: () => setView(v) })));
  }
  function download(name, text, type) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* previews: the real outline (EdgeLabel's slanted edge; Classic Pro's bar), the icon art as a CSS mask, the words */
  const iconSvg = (id) => { const I = labelIcons(); try { return I && id ? I.svgFor(id, 10) : null; } catch { return null; } };
  const iconName = (id) => { const I = labelIcons(); const i = I && I.find ? I.find(id) : null; return (i && i.name) || String(id || '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()); };
  const predicted = (words) => { const I = labelIcons(); try { return I && words && effectiveStyle(S()).predictIcons ? I.guessIconId(words) || null : null; } catch { return null; } };
  const maskUrl = (svg) => { try { return `url("data:image/svg+xml,${encodeURIComponent(typeof svg.toWellFormed === 'function' ? svg.toWellFormed() : svg)}")`; } catch { return null; } };
  function preview(l, big = false) {
    const box = el('span.lprev' + (S().faceStyle === 'classicpro' ? '.cp' : '') + (big ? '.big' : '') + (caps() ? '' : '.nocaps'), { 'aria-hidden': 'true' });
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
    const selL = sel ? R.labelById(s, carried[sel.id]) : null;
    const slots = s.placed.filter((u) => R.eligible(s, u)).length;
    const onN = Object.keys(carried).filter((k) => R.labelById(s, carried[k])).length;
    panel.classList.toggle('placing', !!picked);
    // head
    panel.appendChild(el('div.head', {}, [
      el('h2', { text: 'Labels' }),
      el('span.count', { text: ready.length ? `${n(ready.length, 'label')} ready to place` : labels.length ? (slots ? `${onN} of ${slots} drawers labelled` : `${n(labels.length, 'label')}`) : '' }),
      labels.length ? el('span.tools', {}, [
        el('button.mini', { title: 'Download the list · a MODULITH label list (.json) the Label Studio opens', 'aria-label': 'Download the label list', onclick: () => download(`modulith-${s.length}-labels.json`, JSON.stringify({ ...R.exportDoc(L, s), output: P.printOutput(st.print) }, null, 2), 'application/json') }, [icon('download-simple', { size: 16 })]),
        el('button.mini', { title: 'Copy the labels as text, in drawer order', 'aria-label': 'Copy the labels as text', onclick: async () => { try { await navigator.clipboard.writeText(R.exportText(L, s)); say('Labels copied.'); } catch { say('Could not reach the clipboard.'); } } }, [icon('copy', { size: 16 })]),
      ]) : null,
    ]));
    panel.appendChild(renderViewBar());
    const last = lastChange();
    panel.appendChild(el('div.row.top', {}, [
      faceOk && ready.length && empties.length && !picked ? attachHint(el('button.key.sm', { onclick: () => { const w = ready[0]; if (w) armPlacing(w.id); } }, [icon('hand-pointing', { size: 16 }), 'Place several']), HINTS.several, panel) : null,
      last ? el('button.key.sm', { title: 'Undo: ' + last.desc, onclick: undoLabel }, [icon('arrow-counter-clockwise', { size: 16 }), 'Undo']) : null,
    ]));
    if (last) panel.appendChild(el('p.last', { text: 'Last change: ' + last.desc }));
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
    // no label faceplate: the callout (the spec: never hidden or greyed out)
    if (!faceOk) {
      const edge = (stage.availableFaceplateStyles?.() || []).find((x) => x.key === 'edgelabel');
      panel.appendChild(el('div.callout', {}, [
        el('p', { text: `${FACE_LABEL[s.faceStyle] ? FACE_LABEL[s.faceStyle] + ' faceplates take' : 'These faceplates take'} no printed labels. EdgeLabel and Classic Pro do; the list below can still be built and exported.` }),
        edge ? el('button.key.sm', { onclick: async () => { await stage.applyFaceplateStyle(edge); stage.setDims(false); store.load(stage.build, 'adopt'); lastSig = (() => { const g = tryGen(store.serialize()); return g.manifest ? sigOf(g.manifest) : lastSig; })(); renderAll(); say('EdgeLabel faceplates · the drawers can take labels now.'); } }, ['Switch to EdgeLabel ✦']) : null,
        el('p.dim', { text: 'Paper and label-maker labels are coming later.' }),
      ]));
    }
    // the selected drawer
    if (sel) panel.appendChild(renderDrawer(sel, selL, ready.length));
    // the hint. None under the faceplate callout: it already says so and offers the switch (the stress test, 2026-10-15:
    // on a Classic build the same sentence stood three times and squeezed the list to two rows)
    const hint = !labels.length ? 'Make your labels in the Label Studio, or label hardware with its Part Picker, and add them here from a file. Or add a label by hand below.'
      : !faceOk ? null
      : picked ? `Placing ${quote(picked)}: tap any drawer on the model. The next waiting label follows until you press Done placing.`
      : sel && R.eligible(s, sel) && ready.length ? (selL ? `Drawer ${R.drawerNumber(s, sel.id)} stays selected: a label here replaces ${quote(selL)}. For a row of drawers, use Place several.` : `Click a label to put it on drawer ${R.drawerNumber(s, sel.id)}. The drawer stays selected afterwards.`)
      : !ready.length ? 'Tap a drawer on the model to change or remove its label.'
      : !empties.length ? 'Every drawer has a label. Tap one on the model to replace its label.'
      : 'Tap a drawer on the model to give it a label, or use Place several to label drawers one after another.';
    if (hint) panel.appendChild(el('p.hint', { text: hint }));
    // the waiting labels
    const scroll = el('div.scroll');
    scroll.appendChild(el('div.list', {}, waitingAll.map((l) => {
      const ok = L.assignable(l);
      const onPick = l.id === st.pick;
      const b = el('button.chip-l' + (onPick ? '.on' : '') + (st.selLabel === l.id ? '.sel' : '') + (l.hardware ? '.hw' : '') + (st.fresh && st.fresh.has(l.id) ? '.new' : ''), { 'aria-pressed': String(onPick), disabled: !ok, title: shown(R.labelWords(l)) + (l.hardware ? ' (laid out from its part record)' : ''), 'data-focus': 'chip:' + l.id, onclick: () => chooseLabel(l.id) }, [preview(l), ident(l, ok)]);
      if (l.hardware && R.hwNotReady(l)) b.appendChild(el('span.tag', { text: 'not ready' }));
      if (ok) dragFrom(b, l.id);
      return el('div.item', {}, [b,
        el('button.mini', { title: 'Edit this label', 'aria-label': 'Edit ' + (R.labelWords(l) || 'this label'), 'data-focus': 'edit:' + l.id, onclick: () => openEdit(l.id, null) }, [icon('pencil-simple', { size: 15 })]),
        el('button.mini', { title: 'Remove from this build', 'aria-label': 'Remove ' + (R.labelWords(l) || 'this label') + ' from this build', 'data-focus': 'remove:' + l.id, onclick: () => labelCommit(R.remove(L, s, l.id)) }, [icon('x', { size: 15 })])]);
    })));
    // on drawers
    const onUnits = R.drawers(s).filter((u) => carried[u.id] && R.labelById(s, carried[u.id]));
    if (onUnits.length) scroll.appendChild(el('div.placed', {}, [el('h4', { text: `On drawers (${onUnits.length})` }), el('div.rows', {}, onUnits.map((u) => {
      const l = R.labelById(s, carried[u.id]); const isSel = !!sel && sel.id === u.id;
      return el('button.prow' + (isSel ? '.sel' : '') + (st.selLabel === l.id ? '.lsel' : ''), { 'aria-pressed': String(isSel), 'aria-label': `${shown(R.labelWords(l)) || 'Icon-only label'}, on drawer ${R.drawerNumber(s, u.id)}. Select the drawer`, onclick: () => { st.pick = null; stage.selectUnit(u.id); } },
        [preview(l), el('span.words', { text: shown(R.labelShort(l)) || 'Icon only' }), el('span.where', { text: 'Drawer ' + R.drawerNumber(s, u.id) })]);
    }))]));
    panel.appendChild(scroll);
    // the foot: ways in, fill, exports, settings, status
    const pairs = R.fillPairs(L, s);
    const foot = el('div.foot');
    /* the ways in, as four equal tiles (Joey 2026-10-13: a pile of mismatched buttons read as messy); Fill is an action on the
       build and gets a row of its own; the exports are the two icon buttons in the head; the settings stay last, collapsed */
    foot.appendChild(el('div.ways', { role: 'group', 'aria-label': 'Add labels' }, [
      attachHint(el('button.key.tile', { title: 'Type a label by hand', onclick: () => openAdd() }, [icon('plus', { size: 16 }), 'Type a label']), HINTS.type, panel),
      attachHint(el('button.key.tile', { title: 'A MODULITH label list, a Part Picker label-items file, or a Label Studio set file', onclick: () => fileIn.click() }, [icon('upload-simple', { size: 16 }), 'From a file…']), HINTS.file, panel),
      attachHint(el('button.key.tile.brand', { title: 'Opens the Label Studio in a new tab: icons, stripes, uploads and the print plate. Save its set file and add it here', onclick: () => openStudio(false) }, [STUDIO_ICON(), 'Label Studio', icon('arrow-square-out', { size: 12 })]), HINTS.studio, panel),
      // the Part Picker opens in the page now (step A), so no new-tab glyph: that one is the Label Studio's
      attachHint(el('button.key.tile.brand', { title: 'Opens the Part Picker here: choose screws, nuts and washers, then Add part labels puts them in this build’s list', onclick: () => openPicker() }, [PICKER_ICON(), 'Part Picker']), HINTS.picker, panel),
    ]));
    if (labels.length) foot.appendChild(el('div.fillrow', {}, [
      attachHint(el('button.key.tile.wide', { disabled: !pairs.length, onclick: openFill }, [icon('hand-pointing', { size: 16 }), 'Fill empty drawers…']), HINTS.fill, panel),
      pairs.length ? null : el('span.why', { text: !faceOk ? 'Needs an EdgeLabel or Classic Pro faceplate' : !ready.length ? 'No labels ready to place' : 'No empty drawers' }),
    ]));
    foot.appendChild(renderSettings());
    if (st.status) foot.appendChild(el('p.status' + (st.warn ? '.warn' : ''), { role: 'status', text: st.status }));
    panel.appendChild(foot);
  }
  function renderDrawer(u, l, readyN) {
    const s = S();
    const no = R.drawerNumber(s, u.id);
    const box = el('div.drawer', { 'aria-label': 'Selected drawer' });
    box.appendChild(el('div.dhead', {}, [el('span.tag', { text: no ? `Drawer ${no}` : 'Selected' }), el('span.size', { text: [`${u.w}W·${u.hh / 2}H`, FILL_LABEL(u.fill), u.fill === 'decor' && FACE_LABEL[s.faceStyle] ? FACE_LABEL[s.faceStyle] : ''].filter(Boolean).join(' · ') }),
      el('button.x', { title: 'Deselect', 'aria-label': 'Deselect the drawer', onclick: () => stage.setSelected(null) }, [icon('x', { size: 16 })])]));
    // a Decor drawer on a faceplate without labels: the callout above the card explains it and offers the switch
    if (!R.eligible(s, u) && !l) { box.appendChild(el('p.none', { text: u.fill !== 'decor' ? `Labels go on Decor drawers, not on a ${FILL_LABEL(u.fill).toLowerCase()}.` : 'This faceplate style takes no label.' })); return box; }
    if (!l) { box.appendChild(el('p.none', { text: 'No label yet' + (readyN ? ' · click a label below to put it on this drawer.' : '.') })); return box; }
    box.appendChild(el('div.dlabel', {}, [preview(l, true), el('span.ident', {}, [el('span.words', { text: shown(R.labelShort(l)) || (L.iconOnly(l) ? 'Icon only' : '') }), el('span.detail', { text: detail(l) }), R.isPartLabel(l) ? el('span.src', { text: 'From the part record' }) : null])]));
    const acts = el('div.acts');
    if (R.isPartLabel(l)) {
      acts.appendChild(el('button.key.sm', { title: 'Change the size, length or material in the Part Picker: the same part comes back updated in place', onclick: () => openPicker({ open: l.hardware }) }, ['Edit part details']));
      acts.appendChild(el('button.key.sm', { title: 'Replace the part layout with your own words on this drawer', onclick: () => openModal({ title: `Use your own words on drawer ${no}?`, body: ['This label is laid out from its part record. Words you type replace that layout on this drawer only; the part label goes back to your labels, ready to place again.'], ok: 'Use custom wording', field: { placeholder: 'What’s in this drawer?', value: R.labelShort(l) }, onOk: () => { const t = modalField(); closeModal(); labelCommit(R.customWording(L, S(), u.id, t)); }, onCancel: () => closeModal() }) }, ['Use custom wording']));
    } else acts.appendChild(el('button.key.sm', { onclick: () => openEdit(l.id, u.id) }, [icon('pencil-simple', { size: 15 }), 'Edit']));
    acts.appendChild(el('button.key.sm', { title: 'Take the label off this drawer; it waits to be placed again', onclick: () => labelCommit(R.unassign(L, S(), u.id, l.id)) }, ['Remove']));
    box.appendChild(acts);
    return box;
  }
  /* the set-wide label settings (the generator's six inputs), collapsible; a value out of range snaps back */
  function renderSettings() {
    const s = S(); const eff = effectiveStyle(s); const lim = G?.labelSpec?.limits || {};
    const det = el('details.settings', { open: st.settings ? '' : null });
    // opened by the visitor (not re-rendered open): bring the settings into view, down to Printing part labels
    det.addEventListener('toggle', () => { const was = st.settings; st.settings = det.open; if (det.open && !was) { try { det.scrollIntoView({ block: 'nearest' }); } catch { /* jsdom */ } } });
    det.appendChild(el('summary', {}, [icon('sliders-horizontal', { size: 16 }), 'Label settings', el('span.dim', { text: `${eff.capMm} mm · ${eff.allCaps ? 'caps' : 'as typed'}${st.print.band === 'off' ? ' · no stripe' : ''}` })]));
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
    const bandSel = el('select', { 'aria-label': 'Part label stripe' }, [['bottom', 'Bottom edge'], ['end', 'End stripe'], ['wedge', '45° end'], ['off', 'Off · two filaments']].map(([v, t]) => el('option', { value: v, text: t, selected: st.print.band === v ? '' : null })));
    bandSel.addEventListener('change', () => { setPrint({ band: bandSel.value }); renderAll(); });
    det.appendChild(el('label.srow', {}, [el('span', { text: 'Part label stripe' }), bandSel]));
    det.appendChild(el('label.srow', {}, [el('span', { text: 'Screw and nut drawings' }), el('div.track.seg2', { role: 'group', 'aria-label': 'Screw and nut drawings' }, [false, true].map((v) => el('button.seg.sm' + (st.print.drawings === v ? '.on' : ''), { text: v ? 'On' : 'Off', 'aria-pressed': String(st.print.drawings === v), onclick: () => { setPrint({ drawings: v }); renderAll(); } })))]));
    det.appendChild(el('p.dim', { text: (st.print.band === 'off' ? 'Part labels print in two filaments: the base and the words.' : 'The stripe adds the thread-system colour and a material patch: more filaments.') + ' Your default for printing labels, kept in this browser for every build.' }));
    return det;
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
    const place = e.unitId == null && !shared.length ? el('div.row', {}, [el('button.key.sm', { onclick: () => { const id = st.edit.id; closeEdit(); chooseLabel(id); } }, [icon('hand-pointing', { size: 16 }), 'Place this label'])]) : null;
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
      labels.length ? el('button.cta', { title: 'Shows the Label plate: this build’s labels as the Label Studio lays them out, with the print file to download', onclick: () => setView('plate') }, ['Print labels', icon('arrow-right', { size: 20 })])
        : el('button.cta', { title: 'Opens the Label Studio in a new tab', onclick: () => openStudio(false) }, ['Make labels', icon('arrow-right', { size: 20 })]),
    );
  }

  /* ---------------- layout ---------------- */
  const narrow = () => innerWidth < 1280;
  const phone = isPhone() ? phoneChrome(root, { ...ctx, active: 'labels', soon }, { panels: [
    { el: panel, title: () => { if (!L) return 'Labels'; const r = R.waiting(L, S()).length; return st.pick ? `Placing ${quote(R.labelById(S(), st.pick))} · tap a drawer` : r ? `Labels · ${r} ready to place` : 'Labels'; }, open: false },
    { el: editor, title: 'Edit label' },
  ] }) : null;
  if (phone) phone.onLayout(safe);
  function safe() {
    if (plate) {   // the plate fills the stage area the panels and the toolbar leave (the toolbar wraps at narrow widths; the phone's chrome moves)
      const s = plate.box.style;
      s.top = phone ? phone.top() + 'px' : Math.round(bar.el.getBoundingClientRect().bottom + 10) + 'px';
      s.bottom = phone ? phone.bottom() + 'px' : ''; s.left = phone ? '8px' : ''; s.right = phone ? '8px' : '';
    }
    if (phone) { stage.setSafeArea({ left: 8, right: 8, top: phone.top(), bottom: phone.bottom() }); return; }
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
    if (e.key === 'Escape') { if (picker && !picker.veil.hidden) { closePicker(); return; } if (modalState) { modalState.onCancel(); return; } if (st.edit) { closeEdit(); return; } if (st.pick) { armPlacing(null); return; } if (tag === 'input') { e.target.blur(); return; } stage.setSelected(null); return; }
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
    /* a build from a link, a file or an older tool: its typed drawers become list labels (one conversion, one history entry) */
    let changed = false;
    store.commit((s) => { changed = R.reconcileLoad(L, s); }, 'label-sync');
    if (!changed) store.flush();
    const back = ctx.memo?.labelsSel; if (back != null && unit(back)) { st.selId = back; stage.selectUnit(back); }
    importFromHash();
    renderAll();
    if (R.labelsOf(S()).length) loadLabelFont().then(() => renderAll()).catch(() => {});   // the icon art for the previews
  }).catch((e) => { status(`The label tools did not load (${e.message}). Reload the page to try again.`, true); renderAll(); });

  return {
    onHover(unitId) { if (L) hoverPreview(unitId); },
    onSelect(sel) {
      st.sel = sel;
      const owner = sel ? (sel.owner ?? stage.partInfo?.(sel.id)?.owner ?? null) : null;
      if (sel && st.pick && L) { if (owner != null) tapDrawer(owner); stage.setSelected(null); return; }
      st.selId = owner;
      if (owner != null && assignOf()[owner] && R.labelById(S(), assignOf()[owner])) setSelLabel(assignOf()[owner]);   // a labelled drawer selects its label
      if (owner != null && st.edit && st.edit.unitId != null && st.edit.unitId !== owner) st.edit = null;
      renderAll();
      if (phone && owner != null && !st.pick) phone.open(panel);
    },
    unmount() {
      ac.abort(); unsub();
      if (ctx.memo) ctx.memo.labelsSel = st.selId;
      stage.setSelected(null); stage.setSafeArea(null); stage.watchHover(false);
      document.documentElement.classList.remove('ws-partpicker-open');
      hideHint();
      if (phone) phone.destroy(); root.remove();
    },
  };
}
