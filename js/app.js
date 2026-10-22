// The merged app's boot (phase 0, Build screen first). Decides whether this page shows a workspace
// shell over the stage or the old viewer unchanged: `?ws=build` opens the Build workspace; without
// it the page is the viewer as deployed before the redesign, which the golden screenshots and the
// smoke tests still exercise. The default flips once the shell is accepted.
import { createStage } from './main.js';
import { mountBuild } from './workspaces/build.js';
import { mountAssemble } from './workspaces/assemble.js';
import { mountParts, printCountOf } from './workspaces/parts.js';
import { mountColors } from './workspaces/colors.js';
import { mountLabels, labelsBadge } from './workspaces/labels.js';
import { createStore } from './state/store.js';
import { openBuilds, entryOf, hashOf, fileOf, fileName, parseBuildFile, cleanName } from './state/builds.js';
import { isPhone, PHONE_MAX } from './ui/phone.js';
import { tabTitle } from './ui/names.js';
import { openSetup } from './ui/setup.js';
import { standRecord } from './rules/stand.js';
import { copyOf as labelCopyOf, remember as rememberLabels, held as heldLabels, drop as dropLabels, markRestored as markRestoredLabels, safeStorage } from './state/label-copies.js';

// eslint-disable-next-line no-undef
const G = typeof GEN2 !== 'undefined' ? GEN2 : null;   // the planner's catalog, a classic-script lexical global

const QS = new URLSearchParams(location.search);
const WS = QS.get('ws');
const KIT = QS.get('build');   // the official kit this page opened with, kept in the address through every edit
const FRESH = QS.get('new') === '1';   // New build: a fresh copy of the kit, never the build this browser had open
const SETUP = QS.get('setup') === '1';   // ...and the setup sheet open on it
/* THE PALETTE BELONGS TO A BUILD (Astra, 2026-10-14: two projects from one kit must keep different colours). A page opened
   on a #build= hash whose record carries an id keys its palette by that id; a kit page keys by the kit until its first
   edit, when the store's record (minted an id by the sanitiser) takes the kit's palette with it under its own key. */
const buildKey = (id) => 'gen2-colors:build-' + id;
function colorKeyAtBoot() {
  const m = /#build=([^&]+)/.exec(location.hash);
  if (m) { try { const raw = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); const rec = raw.data || raw; if (typeof rec.buildId === 'string' && /^[a-z0-9]{8,32}$/.test(rec.buildId)) return buildKey(rec.buildId); } catch { /* a damaged hash: the stage reports it */ } }
  return 'gen2-colors:' + (KIT ? 'official-' + KIT : 'custom-build');
}

/* theme: the brief's data-mode on <html>, kept in step with the stage's own light/dark */
export function setMode(mode, stage, { now = false } = {}) {
  const root = document.documentElement;
  // the UI review (2026-10-16): the switch "fades slowly" and panel text vanished mid-switch. The stage's theme flip
  // recompiles its shaders in one long task (2.5 s measured on the headless software renderer), which froze the
  // buttons' 150 ms colour transitions half way. So: no transitions during the flip, the panels painted in the new mode
  // FIRST, and the stage flipped on the frame after.
  root.classList.add('ws-mode-flip');
  root.dataset.mode = mode;
  // the same two keys the viewer's own button writes: the value, and the stamp a cross-site handoff compares
  try { localStorage.setItem('gen2-theme', mode); localStorage.setItem('gen2-theme:t', String(Date.now())); } catch { /* private mode */ }
  // the workspace's dark mode is the stage's quieter `night` variant (same palette, calmer grid and reflection)
  const want = mode === 'dark' && root.dataset.ws ? 'night' : mode;
  const flip = () => { if (stage && stage.stageTheme !== want) stage.applyStageTheme(want); };
  // only the LATEST request flips the stage and ends the flip class: two quick clicks must not recompile twice (Sol 01a1456c)
  const token = ++setMode.token;
  if (now) { flip(); root.classList.remove('ws-mode-flip'); return; }
  requestAnimationFrame(() => setTimeout(() => {
    if (token !== setMode.token) return;
    flip();
    requestAnimationFrame(() => { if (token === setMode.token) root.classList.remove('ws-mode-flip'); });
  }, 0));
}
setMode.token = 0;
function initialMode() {
  try { return localStorage.getItem('gen2-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

/* the workspaces that exist; each mount returns { onSelect?, onPage?, unmount } */
const WORKSPACES = { build: mountBuild, assemble: mountAssemble, parts: mountParts, colors: mountColors, labels: mountLabels };

export async function boot() {
  if (!WS) { await createStage(document); return; }
  document.documentElement.dataset.ws = WS;
  document.documentElement.dataset.mode = initialMode();
  document.documentElement.classList.toggle('ws-phone', isPhone());   // the phone chrome (bottom tabs, sheets) below 1024 px
  let current = null;   // the mounted workspace's handle
  /* A LABELS LINK IS READ ONCE, HERE (2026-10-22): the Studio's "Add to planner build" opens a new page on #labels-add=,
     beside the build's own #build= or alone. It leaves the address now and waits in ctx.memo for the Labels workspace,
     which imports it once its label tools have loaded. Left in the address it was wiped by the first save (the store
     writes #build= alone), so a fresh page imported nothing; kept there through saves it would ride into share links */
  const labelsAdd = (() => {
    const m = /(?:^#|&)labels-add=([^&]+)/.exec(location.hash); if (!m) return null;
    history.replaceState(null, '', location.href.replace(/[#&]labels-add=[^&]+/, (x) => (x.startsWith('#') ? '#' : '')).replace(/#&/, '#').replace(/#$/, ''));
    return m[1];
  })();
  /* THE BUILD STORE (the plan §1.3): Recent builds in IndexedDB, the planner's autosave slot dual-written. With no build in
     the address and no kit asked for, the page reopens the build this browser had open last (the current Recent entry, else
     the planner's slot) by putting its record in the address before the stage boots from it; `?new=1` skips that. */
  const builds = await openBuilds();
  let entry = null;   // the Recent entry of the build on this page, once known
  /* LABELS KEPT ASIDE (js/state/label-copies.js): a link or a file can carry a build this browser already holds, without its
     labels (made before they were added, or by the old planner); the autosave would then replace the Recent entry, labels and
     all. The entry's labels are copied aside first and the Labels workspace offers them back while the board has none. */
  const copies = safeStorage((() => { try { return localStorage; } catch { return null; } })());
  const hasLabels = (rec) => !!(rec && rec.labelList && Array.isArray(rec.labelList.labels) && rec.labelList.labels.length);
  const LINKED = /(^#|&)build=/.test(location.hash);   // a record arrived in the address (not the reopen below, which writes it)
  let labelCopy = null, hadLabels = false;
  if (FRESH || SETUP) { const q = new URLSearchParams(location.search); q.delete('new'); q.delete('setup'); history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`); }
  else if (!/(^#|&)build=/.test(location.hash) && !KIT) {
    const cur = await builds.get(builds.currentId); const rec = cur ? cur.record : builds.readSlot();
    if (rec) { entry = cur; history.replaceState(null, '', location.pathname + location.search + hashOf(rec) + (location.hash ? '&' + location.hash.slice(1) : '')); }
  }
  let stood = null;   // the boot slid a saved layout onto its surface (standRecord adds nothing): said once the workspace is up
  const stage = await createStage(document, {
    repair: (rec) => standRecord(rec, G, { tabletop: globalThis.GEN2_TABLETOP }),
    onRepaired: (r) => { stood = r; },
    onSelect: (sel) => current?.onSelect?.(sel),
    onPage: (i) => current?.onPage?.(i),
    onCamFree: (on) => current?.onCamFree?.(on),
    onContext: (info) => current?.onContext?.(info),
    onHover: (unitId) => current?.onHover?.(unitId),
    onQuality: (tier) => current?.onQuality?.(tier),
    quietSelect: true, fillBoost: 1.6,
    // the palette is per BUILD: the kit this page opened with keeps its own (the Studio's own key for official kits)
    colorStoreKey: colorKeyAtBoot(),
  });
  /* a representative finished build in every workspace (Astra): the first preset's coordinated filaments unless the
     visitor already has a saved palette; Assemble switches to Part colors on its own and restores this on leave. Applied
     BEFORE the store captures its baseline, so the first Undo returns to this palette and not to none (e2e, 2026-10-13). */
  if (!stage.useCustom && stage.PRESETS?.length) stage.applyPreset(stage.PRESETS[0], { quiet: true });   // not a visitor's pick: no preset event
  /* THE STORE (phase 3): the build record with the planner's rules and undo history. It opens on the record the
     stage booted with (the kit file, or a #build= hash) and writes every settled change back to the address as the
     planner's own share-link form, so a reload or a shared link reopens the edited build (the viewer decodes it). */
  const store = createStore(G, { extra: { get: () => { const p = stage.palette(); return { colors: p.colors, on: p.on, user: p.user, over: p.over }; }, set: (v) => stage.setPalette(v) } /* the hand-built palette and the per-unit layer ride along too (Sol 01a13330) */, onSave: (snap) => { try { history.replaceState(null, '', `${location.pathname}${location.search}#build=${btoa(unescape(encodeURIComponent(snap)))}`); stage.setColorStoreKey(buildKey(store.state.buildId)); } catch { /* a very old browser */ } saveBuild(snap); } });
  /* the plate is the one record field the generator never reads, so no workspace's regenerate puts it back: an Undo or a
     Redo that moves it hands it to the stage here (the Colors plan's step 1, 2026-10-18; before, the stage kept the newer
     plate while the store and the address went back) */
  store.subscribe((state, why) => {
    if (why !== 'undo' && why !== 'redo') return;
    const want = state.buildPlate || 'powder';
    if (stage.build && (stage.build.buildPlate || 'powder') !== want) stage.setBuildPlate(want, { quiet: true });
  });
  /* every settled change: the Recent entry (its name kept), the current id, the planner's slot; the cap is never crossed
     silently - a new build that would push the oldest out waits in the switcher's notice until the visitor saves or drops it */
  let capPending = null;   // { drop: entry } while a new build is held back by the cap
  let persisted = false, saving = Promise.resolve();
  function saveBuild(snap) {
    saving = saving.then(async () => {
      const rec = JSON.parse(snap);
      if (!(typeof rec.buildId === 'string' && rec.buildId)) return;
      const prev = entry && entry.id === rec.buildId ? entry : await builds.get(rec.buildId);
      const next = entryOf(rec, { name: prev ? undefined : kitTitle, kit: KIT, prev });
      const r = await builds.put(next);   // the cap is the write's own check (Terra 01a13578)
      if (!r.ok) { capPending = { drop: r.drop, snap }; builds.writeSlot(rec); return; }
      entry = next;
      builds.currentId = entry.id;
      builds.writeSlot(rec);
      document.title = tabTitle(entry.name);
      if (hadLabels && !hasLabels(rec)) { dropLabels(copies, rec.buildId); labelCopy = null; }   // the last label removed here: nothing to offer back
      hadLabels = hasLabels(rec);
      if (!persisted) { persisted = true; builds.persist(); }
    }).catch((e) => console.warn('[builds] save failed', e));
    return saving;
  }
  /* the mounted workspace's toast (every workspace makes one as #ws-toast) */
  const toast = (m) => { const t = document.getElementById('ws-toast'); if (!t) return; t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); };
  /* reload the page on another record. A URL that differs from the current one only in its hash is a hash change, not a
     navigation (the e2e suite caught Duplicate staying on the old build, 2026-10-13), so that case reloads explicitly - the
     old viewer's own rule for a mount or length change. A harness keeps its ?debug hooks across it. */
  const go = (q, hash = '') => {
    const u = new URLSearchParams(q); if (QS.get('debug')) u.set('debug', QS.get('debug'));
    const url = `${location.pathname}?${u}${hash}`;
    const sameDocument = url.split('#')[0] === location.pathname + location.search;
    location.href = url;
    if (sameDocument) location.reload();
  };
  const wsNow = () => document.documentElement.dataset.ws || 'build';
  /* a shared scheme (#scheme= beside #build=, the Colors workspace's Share): applied once, then dropped from the address */
  { const m = /[#&]scheme=([^&]+)/.exec(location.hash); if (m) { try { const colors = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); stage.setPalette({ colors, on: true }); } catch { /* a damaged scheme link: the build still opens */ } history.replaceState(null, '', location.href.replace(/[#&]scheme=[^&]+/, (x) => x.startsWith('#') ? '#' : '').replace(/#&/, '#').replace(/#$/, '')); } }
  if (stage.build) store.load(stage.build);
  if (QS.get('debug')) { window.__GEN2_STORE__ = store; window.__GEN2_CTX__ = () => ctx; }   // for the shot tool and end-to-end checks, like the stage's own hook
  let kitTitle = stage.manifest?.title || null;
  if (KIT && location.hash.startsWith('#build=')) { try { kitTitle = (await (await fetch(`builds/${encodeURIComponent(KIT)}.json`)).json()).title || kitTitle; document.title = tabTitle(kitTitle); } catch { /* the hash's own name stands */ } }
  if (!entry && typeof store.state.buildId === 'string') entry = await builds.get(store.state.buildId);   // our own build, reopened from the address
  document.title = tabTitle(entry ? entry.name : kitTitle);   // the planner owns the tab title (main.js leaves it alone here)
  if (entry) { builds.currentId = entry.id; builds.writeSlot(entry.record); }   // the slot follows what is open, not only what is edited
  hadLabels = hasLabels(store.state);
  if (LINKED && entry && !hadLabels && hasLabels(entry.record)) rememberLabels(copies, entry.id, labelCopyOf(entry.record, entry.savedAt));
  if (!hadLabels && typeof store.state.buildId === 'string') labelCopy = heldLabels(copies, store.state.buildId);
  setMode(document.documentElement.dataset.mode, stage, { now: true });   // the viewer booted on `dark`; the workspace wants `night` (at once: nothing is painted yet)
  const ctx = {
    setMode,
    memo: { labelsAdd },   // what a workspace wants back when it is remounted (the Assemble step, for one; a labels link not imported yet)
    store, kitId: KIT, get kitTitle() { return kitTitle; },
    /* the palette moves to the build's own key BEFORE the first colour write (and on the first build edit), so a kit
       page's saved palette never takes a project's picks with it (Astra's two-projects-one-kit check) */
    ownPaletteKey: () => stage.setColorStoreKey(buildKey(store.state.buildId)),
    badges: () => { try { return { parts: printCountOf(stage.build) || null, labels: labelsBadge(store.state) }; } catch { return {}; } },   // the tab badges (the brief: Parts shows the printed-piece count, Labels labelled/slots)
    has: (ws) => !!WORKSPACES[ws],
    /* the switcher's builds: all of it reloads the page on the chosen record (the stage boots from the address), except
       Rename, which is in place */
    builds: {
      get entry() { return entry; },
      get name() { return entry ? entry.name : kitTitle || 'Workbench build'; },
      get capPending() { return capPending; },
      list: () => builds.list(),
      async rename(v) { const name = cleanName(v); if (!name) return false; if (!entry) { await saveBuild(JSON.stringify(store.serialize())); } if (!entry) return false; entry = { ...entry, name }; await builds.put(entry, { force: true }); document.title = tabTitle(name); return true; },
      async open(id) { const e = await builds.get(id); if (!e) return; builds.currentId = id; e.openedAt = Date.now(); await builds.put(e, { force: true }); builds.writeSlot(e.record); go({ ws: wsNow(), ...(e.kit ? { build: e.kit } : {}) }, hashOf(e.record)); },
      async duplicate() {
        const rec = store.serialize(); const copy = { ...rec, buildId: undefined };
        const e = entryOf(copy, { name: `Copy of ${entry ? entry.name : kitTitle || 'build'}`, kit: KIT });
        try { const pal = localStorage.getItem(buildKey(rec.buildId)); if (pal) localStorage.setItem(buildKey(e.id), pal); } catch { /* private */ }
        const r = await builds.put(e); if (!r.ok) { capPending = { drop: r.drop, snap: JSON.stringify(e.record), name: e.name }; return false; }
        builds.currentId = e.id; builds.writeSlot(e.record); go({ ws: wsNow(), ...(KIT ? { build: KIT } : {}) }, hashOf(e.record)); return true;
      },
      saveFile() { const e = entry || entryOf(store.serialize(), { name: kitTitle, kit: KIT }); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([fileOf(e)], { type: 'application/json' })); a.download = fileName(e); document.body.appendChild(a); a.click(); a.remove(); },
      async loadFile(file) {
        const got = parseBuildFile(await file.text()); if (got.problem) return got.problem;
        const prev = typeof got.record.buildId === 'string' ? await builds.get(got.record.buildId) : null;
        if (prev && !hasLabels(got.record) && hasLabels(prev.record)) rememberLabels(copies, prev.id, labelCopyOf(prev.record, prev.savedAt));   // offered back after the reload
        const e = entryOf(got.record, { name: got.name || (prev ? prev.name : null) || file.name.replace(/\.json$/i, ''), prev });
        const r = await builds.put(e); if (!r.ok) { capPending = { drop: r.drop, snap: JSON.stringify(e.record), name: e.name }; return 'cap'; }
        builds.currentId = e.id; builds.writeSlot(e.record); go({ ws: wsNow() }, hashOf(e.record)); return null;
      },
      async remove(id) { await builds.remove(id); if (entry && entry.id === id) { entry = null; builds.currentId = null; go({ ws: 'build', new: '1', ...(KIT ? { build: KIT } : {}) }); } },
      newBuild() { go({ ws: 'build', new: '1', setup: '1', ...(KIT ? { build: KIT } : {}) }); },   // a fresh kit page with the setup sheet open
      /* the cap: save the oldest as a file, or drop it; either way the held build is saved next */
      async capSave() { if (!capPending) return; const e = capPending.drop; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([fileOf(e)], { type: 'application/json' })); a.download = fileName(e); document.body.appendChild(a); a.click(); a.remove(); },
      async capDrop() { if (!capPending) return; const p = capPending; capPending = null; await builds.remove(p.drop.id); if (p.name) { const e = entryOf(JSON.parse(p.snap), { name: p.name, kit: KIT }); await builds.put(e); builds.currentId = e.id; builds.writeSlot(e.record); go({ ws: wsNow(), ...(KIT ? { build: KIT } : {}) }, hashOf(e.record)); } else await saveBuild(p.snap); },
      capKeep() { capPending = null; },
    },
    /* the setup sheet: mount, length, printer and the name; `fresh` = a New build (mount and length reload the page on the record) */
    /* the labels kept aside for this build (null when none, or once decided): the Labels workspace offers them back */
    labelCopy: {
      get copy() { return labelCopy; },
      // the copy as the storage holds it NOW: another tab may have restored or discarded it since this page read it (Sol 01a136b1)
      take() { labelCopy = typeof store.state.buildId === 'string' ? heldLabels(copies, store.state.buildId) : null; return labelCopy; },
      done() { if (labelCopy && typeof store.state.buildId === 'string') dropLabels(copies, store.state.buildId, labelCopy.savedAt); labelCopy = null; },   // restored or discarded: this copy only
      later() { labelCopy = null; },   // Not now: this page only; the next load offers again
      // brought back automatically for a Studio link (2026-10-22): kept as a safety net, never restored automatically again
      restored() { if (labelCopy && typeof store.state.buildId === 'string') markRestoredLabels(copies, store.state.buildId, labelCopy.savedAt); labelCopy = null; },
    },
    openSetup: (step, fresh = false) => openSetup(stage, { store, builds: ctx.builds, say: toast, remount: () => ctx.remount() }, { step, fresh }),
    remount() { if (current) { const ws = current.name; current.unmount(); current = { name: ws, ...WORKSPACES[ws](stage, ctx) }; } },
    switchTo(ws) {
      if (!WORKSPACES[ws] || (current && current.name === ws)) return;
      current?.unmount();
      document.documentElement.dataset.ws = ws;
      const q = new URLSearchParams(location.search); q.set('ws', ws);
      history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
      current = { name: ws, ...WORKSPACES[ws](stage, ctx) };
    },
  };
  /* a labels link (#labels-add=, the Label Studio's "Add to planner build", taken from the address at the top of the boot;
     #labels-open) lands in the Labels workspace, which imports it; the build's own #build= part stays */
  const labelsLink = !!labelsAdd || /(^#|&)labels-open/.test(location.hash);
  if (/(^#|&)labels-open(&|$)/.test(location.hash)) history.replaceState(null, '', location.href.replace(/[#&]labels-open(?=&|$)/, (x) => (x.startsWith('#') ? '#' : '')).replace(/#&/, '#').replace(/#$/, ''));
  ctx.switchTo(labelsLink ? 'labels' : WORKSPACES[WS] ? WS : 'build');
  if (labelCopy && current.name !== 'labels') toast(`Opened without its ${labelCopy.n} ${labelCopy.n === 1 ? 'label · Labels can bring it back.' : 'labels · Labels can bring them back.'}`);
  if (SETUP) ctx.openSetup('mount', FRESH);   // New build: the sheet opens over the fresh kit
  /* WHAT THE SETUP SHEET OR THE BOOT SAID BEFORE THIS PAGE (2026-10-20/21), said once: the empty slots a mount change left
     (across the sheet's reload), or a saved layout the boot slid onto its surface (it adds nothing). A slid record goes into
     the address (a reload opens it as it is now) and, when it came from this browser's own builds rather than a link, into
     its Recent entry */
  {
    let note = null;
    try { note = sessionStorage.getItem('gen2-setup-note'); if (note) sessionStorage.removeItem('gen2-setup-note'); } catch { /* no storage */ }
    if (stood) {
      const m = store.state.mount;
      note = note || `As saved, this build didn’t reach its ${m === 'tabletop' ? 'table' : m === 'wall' ? 'brackets' : 'rails'} · it now does.`;
      const snap = JSON.stringify(store.serialize());
      if (!/(^#|&)labels-/.test(location.hash)) { try { history.replaceState(null, '', `${location.pathname}${location.search}#build=${btoa(unescape(encodeURIComponent(snap)))}`); } catch { /* a very old browser */ } }
      if (!LINKED) saveBuild(snap);
    }
    if (note) setTimeout(() => toast(note), 600);
  }
  /* crossing the phone breakpoint re-mounts the workspace in the other chrome (its memo keeps the selection and step) */
  let wasPhone = isPhone(), resizeT = 0;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const now = isPhone(); document.documentElement.classList.toggle('ws-phone', now); if (now !== wasPhone) { wasPhone = now; ctx.remount(); } }, 150); });
}

await boot();
