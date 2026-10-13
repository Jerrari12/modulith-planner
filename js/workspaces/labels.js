/* THE LABELS WORKSPACE (phase 5). One shared label list, two ways onto the drawers (the planner's label-place design, Joey +
   Astra, PLACEMENT-PLAN.md): DRAWER FIRST - tap a drawer on the model, then click a label, and the drawer stays selected;
   PLACE SEVERAL - arm a label, then tap drawers one after another. A click never replaces silently (the Replace dialog), Fill
   empty drawers previews its exact pairs, every operation is one Undo step with a "Last change" line, and the model is the
   record: the stage redraws the label text in place after each commit (stage.setLabels).
   The list itself: typed labels (words, an icon or a letter), labels from a file (a MODULITH label list, a Part Picker items
   file, a Label Studio set) or from a #labels-add= link, the set-wide label settings, and exports. Making labels - icons,
   stripes, part layouts, the print plate - stays the Label Studio's job: Make labels / Part Picker open it, and Print labels
   hands it this build's words (its one-way link) until the Studio learns the merged app's address (DECISIONS.md, 2026-10-13). */
import { el, makeToast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { topbar } from '../ui/topbar.js';
import { toolbar } from '../ui/toolbar.js';
import { isPhone, phoneChrome } from '../ui/phone.js';
import { generateManifest } from '../generate.js';
import * as R from '../rules/labels.js';
import { LABEL_STYLE_ROWS, styleEdit, iconGroups, effectiveStyle } from '../label-panel.js';
import { loadLabelFont, labelIcons } from '../label-text.js';

const G = globalThis.GEN2;
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
  const st = { selId: null, sel: null, pick: null, edit: null, status: '', warn: false, last: null, query: '', letter: '', settings: false, iconsOpen: new Set() };
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
  const unsub = store.subscribe((state, why) => { if (why === 'adopt') return; if (why === 'undo' || why === 'redo' || why === 'load') { if (st.pick && !R.labelById(state, st.pick)) st.pick = null; if (st.edit && !R.labelById(state, st.edit.id)) st.edit = null; } syncStage(); renderAll(); });
  /* one label operation = one history entry (flushed on both sides of the commit, so the 350 ms coalescing never joins it to a
     neighbour); "Last change" remembers it while the WHOLE record is still what it produced (Sol 01a13518: a later settings
     change, or any other edit, must not be what the panel's Undo takes back). `also(s)` runs inside the same commit, for what
     belongs to the operation (an imported set's style). */
  function labelCommit(r, why = 'label', also = null) {
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
    if (st.pick) { st.selId = null; st.edit = null; status(''); stage.setSelected(null); if (phone) phone.collapse(panel); }   // the model stays uncovered while placing (Joey's phone finding)
    renderAll();
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
  function openStudio(parts) {
    const q = '?from=planner' + (S().faceStyle === 'classicpro' ? '&type=classicpro' : '');
    try { window.open(LABEL_STUDIO_URL + q + (parts ? '#parts' : ''), '_blank', 'noopener'); } catch { say('Your browser blocked the Label Studio. Allow pop-ups for this site, then press it again.'); }   // noopener: the handle is always null, so no "blocked" from it (Sol 01a13518)
  }
  /* Print labels: the Studio's one-way link, the drawers' words in drawer order (what it lays out and exports; icons, stripes and
     part layouts come from the Studio's own list). The two-way job protocol waits for the Studio to accept this app's address. */
  function printLabels() {
    const words = R.drawers(S()).map((u) => R.labelById(S(), assignOf()[u.id])).filter(Boolean).map((l) => R.labelWords(l)).filter(Boolean);
    const all = words.length ? words : R.labelsOf(S()).map((l) => R.labelWords(l)).filter(Boolean);
    if (!all.length) { say('No label words to print yet.'); return; }
    try { window.open(LABEL_STUDIO_URL + '#labels=' + btoa(unescape(encodeURIComponent(JSON.stringify(all)))), '_blank', 'noopener'); } catch { say('Your browser blocked the Label Studio. Allow pop-ups for this site, then press it again.'); }
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
    panel.replaceChildren();
    if (!L) { panel.append(el('div.head', {}, [el('h2', { text: 'Labels' })]), el('p.hint', { text: 'Loading the label tools…' })); return; }
    const s = S();
    const labels = R.labelsOf(s);
    const carried = assignOf();
    const car = R.carriers(s);
    if (st.pick && (car.has(st.pick) || !R.labelById(s, st.pick))) st.pick = null;
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
    ]));
    const last = lastChange();
    panel.appendChild(el('div.row.top', {}, [
      faceOk && ready.length && empties.length && !picked ? el('button.key.sm', { onclick: () => { const w = ready[0]; if (w) armPlacing(w.id); } }, [icon('hand-pointing', { size: 16 }), 'Place several']) : null,
      last ? el('button.key.sm', { title: 'Undo: ' + last.desc, onclick: undoLabel }, [icon('arrow-counter-clockwise', { size: 16 }), 'Undo']) : null,
    ]));
    if (last) panel.appendChild(el('p.last', { text: 'Last change: ' + last.desc }));
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
    // the hint
    panel.appendChild(el('p.hint', { text: !labels.length ? 'Make your labels in the Label Studio, or label hardware with its Part Picker, and add them here from a file. Or add a label by hand below.'
      : !faceOk ? R.NO_FACE_MSG
      : picked ? `Placing ${quote(picked)}: tap any drawer on the model. The next waiting label follows until you press Done placing.`
      : sel && R.eligible(s, sel) && ready.length ? (selL ? `Drawer ${R.drawerNumber(s, sel.id)} stays selected: a label here replaces ${quote(selL)}. For a row of drawers, use Place several.` : `Click a label to put it on drawer ${R.drawerNumber(s, sel.id)}. The drawer stays selected afterwards.`)
      : !ready.length ? 'Tap a drawer on the model to change or remove its label.'
      : !empties.length ? 'Every drawer has a label. Tap one on the model to replace its label.'
      : 'Tap a drawer on the model to give it a label, or use Place several to label drawers one after another.' }));
    // the waiting labels
    const scroll = el('div.scroll');
    scroll.appendChild(el('div.list', {}, waitingAll.map((l) => {
      const ok = L.assignable(l);
      const onPick = l.id === st.pick;
      const b = el('button.chip-l' + (onPick ? '.on' : '') + (l.hardware ? '.hw' : ''), { 'aria-pressed': String(onPick), disabled: !ok, title: shown(R.labelWords(l)) + (l.hardware ? ' (laid out from its part record)' : ''), onclick: () => chooseLabel(l.id) }, [preview(l), ident(l, ok)]);
      if (l.hardware && R.hwNotReady(l)) b.appendChild(el('span.tag', { text: 'not ready' }));
      return el('div.item', {}, [b,
        el('button.mini', { title: 'Edit this label', 'aria-label': 'Edit ' + (R.labelWords(l) || 'this label'), onclick: () => openEdit(l.id, null) }, [icon('pencil-simple', { size: 15 })]),
        el('button.mini', { title: 'Remove from this build', 'aria-label': 'Remove ' + (R.labelWords(l) || 'this label') + ' from this build', onclick: () => labelCommit(R.remove(L, s, l.id)) }, [icon('x', { size: 15 })])]);
    })));
    // on drawers
    const onUnits = R.drawers(s).filter((u) => carried[u.id] && R.labelById(s, carried[u.id]));
    if (onUnits.length) scroll.appendChild(el('div.placed', {}, [el('h4', { text: `On drawers (${onUnits.length})` }), el('div.rows', {}, onUnits.map((u) => {
      const l = R.labelById(s, carried[u.id]); const isSel = !!sel && sel.id === u.id;
      return el('button.prow' + (isSel ? '.sel' : ''), { 'aria-pressed': String(isSel), 'aria-label': `${shown(R.labelWords(l)) || 'Icon-only label'}, on drawer ${R.drawerNumber(s, u.id)}. Select the drawer`, onclick: () => { st.pick = null; stage.selectUnit(u.id); } },
        [preview(l), el('span.words', { text: shown(R.labelShort(l)) || 'Icon only' }), el('span.where', { text: 'Drawer ' + R.drawerNumber(s, u.id) })]);
    }))]));
    panel.appendChild(scroll);
    // the foot: ways in, fill, exports, settings, status
    const pairs = R.fillPairs(L, s);
    const foot = el('div.foot');
    foot.appendChild(el('div.row', {}, [
      el('button.key.sm', { onclick: () => openAdd() }, [icon('plus', { size: 16 }), 'Add label']),
      el('button.key.sm', { title: 'Opens the Label Studio’s Part Picker in a new tab: choose screws, nuts and washers; save or download its label list and add it here from the file', onclick: () => openStudio(true) }, ['Part Picker', icon('arrow-square-out', { size: 14 })]),
      el('button.key.sm', { title: 'Opens the Label Studio in a new tab: icons, stripes, uploads and the print plate', onclick: () => openStudio(false) }, ['Make labels', icon('arrow-square-out', { size: 14 })]),
    ]));
    if (labels.length) foot.appendChild(el('div.row', {}, [
      el('button.key.sm', { disabled: !pairs.length, onclick: openFill }, ['Fill empty drawers…']),
      el('span.why', { text: pairs.length ? '' : !faceOk ? 'Needs an EdgeLabel or Classic Pro faceplate' : !ready.length ? 'No labels ready to place' : 'No empty drawers' }),
    ]));
    foot.appendChild(el('div.row', {}, [
      el('button.key.sm', { title: 'A MODULITH label list, a Part Picker label-items file, or a Label Studio set file', onclick: () => fileIn.click() }, [icon('upload-simple', { size: 16 }), 'Add from a file…']),
      labels.length ? el('button.key.sm', { title: 'This build’s labels as a MODULITH label list (.json): the Label Studio opens it', onclick: () => download(`modulith-${s.length}-labels.json`, JSON.stringify(R.exportDoc(L, s), null, 2), 'application/json') }, [icon('download-simple', { size: 16 }), 'Download list']) : null,
      labels.length ? el('button.key.sm', { title: 'The labels as text, in drawer order', onclick: async () => { try { await navigator.clipboard.writeText(R.exportText(L, s)); say('Labels copied.'); } catch { say('Could not reach the clipboard.'); } } }, [icon('copy', { size: 16 }), 'Copy as text']) : null,
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
    if (!R.eligible(s, u) && !l) { box.appendChild(el('p.none', { text: u.fill !== 'decor' ? `Labels go on Decor drawers, not on a ${FILL_LABEL(u.fill).toLowerCase()}.` : R.NO_FACE_MSG })); return box; }
    if (!l) { box.appendChild(el('p.none', { text: 'No label yet' + (readyN ? ' · click a label below to put it on this drawer.' : '.') })); return box; }
    box.appendChild(el('div.dlabel', {}, [preview(l, true), el('span.ident', {}, [el('span.words', { text: shown(R.labelShort(l)) || (L.iconOnly(l) ? 'Icon only' : '') }), el('span.detail', { text: detail(l) }), R.isPartLabel(l) ? el('span.src', { text: 'From the part record' }) : null])]));
    const acts = el('div.acts');
    if (R.isPartLabel(l)) {
      acts.appendChild(el('button.key.sm', { title: 'Change the size, length or material in the Label Studio; add the new label from its file', onclick: () => openStudio(true) }, ['Edit part details', icon('arrow-square-out', { size: 14 })]));
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
    det.addEventListener('toggle', () => { st.settings = det.open; });
    det.appendChild(el('summary', {}, [icon('sliders-horizontal', { size: 16 }), 'Label settings', el('span.dim', { text: `${eff.capMm} mm · ${eff.allCaps ? 'caps' : 'as typed'}` })]));
    for (const row of LABEL_STYLE_ROWS) {
      const [lo, hi] = lim[row.key] || [0, 99];
      const inp = el('input', { type: 'number', min: String(lo), max: String(hi), step: String(row.step), value: String(eff[row.key]), 'aria-label': row.label });
      inp.addEventListener('change', () => { const v = Number(inp.value); let ok = false; store.commit((x) => { ok = styleEdit(x, row.key, v); }, 'label-style'); if (!ok) { inp.value = String(effectiveStyle(S())[row.key]); say(`${row.label}: ${lo} to ${hi} ${row.unit}.`); } });
      det.appendChild(el('label.srow', {}, [el('span', { text: row.label }), el('span.unit', {}, [inp, el('span.dim', { text: row.unit })])]));
    }
    for (const [key, label] of [['bold', 'Bold'], ['allCaps', 'All caps'], ['predictIcons', 'Predict icons']]) {
      det.appendChild(el('label.srow', {}, [el('span', { text: label }), el('div.track.seg2', { role: 'group', 'aria-label': label }, [false, true].map((v) => el('button.seg.sm' + (!!eff[key] === v ? '.on' : ''), { text: v ? 'On' : 'Off', 'aria-pressed': String(!!eff[key] === v), onclick: () => store.commit((x) => styleEdit(x, key, v), 'label-style') })))]));
    }
    return det;
  }

  /* ---------------- add / edit a label (the editor card) ---------------- */
  const editor = el('aside.glass.glass-edge', { id: 'ws-labeledit', 'aria-label': 'Edit label', hidden: true });
  root.appendChild(editor);
  function openAdd() {
    openModal({ title: 'Add a label', body: ['Type what goes in the drawer. The icon is guessed from the words; change it after with Edit.'], ok: 'Add label', field: { placeholder: 'e.g. M3 screws' },
      onOk: () => { const t = modalField(); const r = R.add(L, S(), { text: t }); if (!r.ok) { say(r.msg); return; } closeModal(); labelCommit(r); if (phone) phone.open(panel); }, onCancel: () => closeModal() });
  }
  function openEdit(id, unitId) { st.edit = { id, unitId, scope: 'all' }; st.query = ''; st.letter = ''; st.pick = null; renderAll(); if (!labelIcons()) loadLabelFont().then(() => renderEditor()).catch(() => {}); }
  function closeEdit() { st.edit = null; renderAll(); }
  const editCommit = (patch) => { const e = st.edit; if (!e) return; const r = R.edit(L, S(), e.id, patch, e.scope === 'this' && e.unitId != null ? 'this' : 'all', e.unitId); if (labelCommit(r) && r.id !== e.id) st.edit.id = r.id; renderAll(); };
  function renderEditor() {
    const e = st.edit; const l = e ? R.labelById(S(), e.id) : null;
    editor.hidden = !l;
    if (!l) { editor.replaceChildren(); return; }
    editor.replaceChildren();
    const shared = L.assignedUnits({ list: S().labelList, assignments: assignOf() }, l.id);
    editor.appendChild(el('div.head', {}, [el('h2.h2', { text: R.isPartLabel(l) ? 'Part label' : 'Edit label' }), el('button.x', { title: 'Close', 'aria-label': 'Close the editor', onclick: closeEdit }, [icon('x', { size: 16 })])]));
    editor.appendChild(el('div.prev', {}, [preview(l, true)]));
    if (shared.length > 1 && e.unitId != null) editor.appendChild(el('div.track.seg2.scope', { role: 'group', 'aria-label': 'Which drawers change' }, [
      el('button.seg.sm' + (e.scope === 'all' ? '.on' : ''), { text: `All ${n(shared.length, 'drawer')}`, onclick: () => { e.scope = 'all'; renderEditor(); } }),
      el('button.seg.sm' + (e.scope === 'this' ? '.on' : ''), { text: 'This drawer only', title: 'A copy of the label carries the change; the other drawers keep theirs', onclick: () => { e.scope = 'this'; renderEditor(); } }),
    ]));
    if (R.isPartLabel(l)) { editor.appendChild(el('p.note', { text: 'This label is laid out from its part record in the Label Studio. Its words here are what the drawer shows in older tools.' })); }
    // the words
    const words = el('input.words', { type: 'text', maxlength: '40', value: R.labelWords(l), placeholder: 'What’s in this drawer?', autocomplete: 'off', 'aria-label': 'Label words' });
    const commitWords = () => { const t = L.cleanText(words.value, L.MIRROR_MAX); if (t === R.labelWords(R.labelById(S(), st.edit.id))) return; if (!t && !L.visibleBadge(l)) { say('A label needs words, an icon or a letter.'); words.value = R.labelWords(l); return; } editCommit({ text: t }); };
    words.addEventListener('change', commitWords);
    words.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commitWords(); } });
    editor.appendChild(el('label.frow', {}, [el('span', { text: 'Words' }), words]));
    // the icon
    const b = L.cleanBadge(l.badge, { svg: true });
    const state = !b ? 'auto' : b.type === 'none' ? 'none' : b.type === 'char' ? 'char' : b.svg ? 'upload' : 'icon';
    editor.appendChild(el('div.frow', {}, [el('span', { text: 'Icon' }), el('span.dim', { text: state === 'auto' ? (predicted(R.labelWords(l)) ? `Auto · ${iconName(predicted(R.labelWords(l))).toLowerCase()}` : 'Auto · none matched') : state === 'none' ? 'No icon' : state === 'char' ? `Letter · ${shown(b.value)}` : state === 'upload' ? 'Your uploaded icon' : `Manual · ${iconName(b.value).toLowerCase()}` })]));
    const letter = el('input.letter', { type: 'text', maxlength: String(L.CHAR_MAX), value: st.letter || (state === 'char' ? b.value : ''), placeholder: 'A', 'aria-label': 'Letter', autocomplete: 'off' });
    letter.addEventListener('input', () => { st.letter = letter.value; });
    letter.addEventListener('change', () => { const v = letter.value.trim(); if (v) editCommit({ badge: { type: 'char', value: v.slice(0, L.CHAR_MAX) } }); });
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
      labels.length ? el('button.cta', { title: 'Opens the Label Studio with this build’s label words: the print plate and the 3MF are made there', onclick: printLabels }, ['Print labels', icon('arrow-right', { size: 20 })])
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
  function safe() { if (phone) { stage.setSafeArea({ left: 8, right: 8, top: phone.top(), bottom: phone.bottom() }); return; } stage.setSafeArea({ left: 324 + 28, right: (st.edit ? 304 : 0) + 28, top: narrow() ? 134 : 90, bottom: 118 }); }
  function renderAll() { renderPanel(); renderEditor(); renderDock(); bar.sync(); if (phone) phone.refresh(); safe(); }
  addEventListener('resize', safe, { signal });
  addEventListener('hashchange', () => { if (L) importFromHash(); }, { signal });
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Escape') { if (modalState) { modalState.onCancel(); return; } if (st.edit) { closeEdit(); return; } if (st.pick) { armPlacing(null); return; } if (tag === 'input') { e.target.blur(); return; } stage.setSelected(null); return; }
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
    onSelect(sel) {
      st.sel = sel;
      const owner = sel ? (sel.owner ?? stage.partInfo?.(sel.id)?.owner ?? null) : null;
      if (sel && st.pick && L) { if (owner != null) tapDrawer(owner); stage.setSelected(null); return; }
      st.selId = owner;
      if (owner != null && st.edit && st.edit.unitId != null && st.edit.unitId !== owner) st.edit = null;
      renderAll();
      if (phone && owner != null && !st.pick) phone.open(panel);
    },
    unmount() {
      ac.abort(); unsub();
      if (ctx.memo) ctx.memo.labelsSel = st.selId;
      stage.setSelected(null); stage.setSafeArea(null);
      if (phone) phone.destroy(); root.remove();
    },
  };
}
