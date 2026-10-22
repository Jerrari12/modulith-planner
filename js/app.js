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
import { openBuilds, entryOf, hashOf, fileOf, fileName, parseBuildFile, cleanName, savedHint } from './state/builds.js';
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
  /* the stale-tab guard keeps this page's base per history entry too (its key in history.state, kept by every
     replaceState here): read before anything writes the address, to tell a page coming back (Back, Forward, F5) from a new one */
  const PAGE_KEY = 'gen2Page';
  const keptPage = (() => { try { return !!(history.state && typeof history.state[PAGE_KEY] === 'string'); } catch { return false; } })();
  /* A LABELS LINK IS READ ONCE, HERE (2026-10-22): the Studio's "Add to planner build" opens a new page on #labels-add=,
     beside the build's own #build= or alone. It leaves the address now and waits in ctx.memo for the Labels workspace,
     which imports it once its label tools have loaded. Left in the address it was wiped by the first save (the store
     writes #build= alone), so a fresh page imported nothing; kept there through saves it would ride into share links */
  const labelsAdd = (() => {
    const m = /(?:^#|&)labels-add=([^&]+)/.exec(location.hash); if (!m) return null;
    history.replaceState(history.state, '', location.href.replace(/[#&]labels-add=[^&]+/, (x) => (x.startsWith('#') ? '#' : '')).replace(/#&/, '#').replace(/#$/, ''));
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
  if (FRESH || SETUP) { const q = new URLSearchParams(location.search); q.delete('new'); q.delete('setup'); history.replaceState(history.state, '', `${location.pathname}?${q}${location.hash}`); }
  else if (!/(^#|&)build=/.test(location.hash) && !KIT) {
    const cur = await builds.get(builds.currentId); const rec = cur ? cur.record : builds.readSlot();
    if (rec) { entry = cur; history.replaceState(history.state, '', location.pathname + location.search + hashOf(rec) + (location.hash ? '&' + location.hash.slice(1) : '')); }
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
  const store = createStore(G, { extra: { get: () => { const p = stage.palette(); return { colors: p.colors, on: p.on, user: p.user, over: p.over }; }, set: (v) => stage.setPalette(v) } /* the hand-built palette and the per-unit layer ride along too (Sol 01a13330) */, onSave: (snap) => { try { history.replaceState(history.state, '', `${location.pathname}${location.search}#build=${btoa(unescape(encodeURIComponent(snap)))}`); stage.setColorStoreKey(buildKey(store.state.buildId)); } catch { /* a very old browser */ } saveBuild(snap); } });
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
  /* THE STALE-TAB GUARD (Joey, 2026-10-22; js/state/builds.js decide()). Per build id (a kit page mints a new id on every
     adopt, and Undo can go back to an earlier one), the stored version this tab is based on: what it opened, or what it
     last wrote (null when none was stored). Every write names it, read when the write runs, on the one save queue; a
     refusal makes the tab stale for good: nothing is persisted any more (the Recent entry, the current id, the slot, the
     palette), the address still follows the edits, and a notice over everything offers Reload. Kept in sessionStorage
     too, so a reload of a stale tab is still stale: per tab, and per history entry (the entry current when it is
     written), so Back to an older page of the build, then F5, is judged by the version that page had (the guard's review) */
  const bases = new Map();
  const expectFor = (id) => (bases.has(id) ? bases.get(id) : null);
  const pageKey = () => {
    try {
      const s = history.state && typeof history.state === 'object' ? history.state : null;
      if (s && typeof s[PAGE_KEY] === 'string') return s[PAGE_KEY];
      const k = Math.random().toString(36).slice(2, 10);
      history.replaceState({ ...(s || {}), [PAGE_KEY]: k }, '');
      return k;
    } catch { return null; }
  };
  const keepBase = (id, base, pending = null) => { builds.setTabBase(id, base, pending); const k = pageKey(); if (k) builds.setTabBase(id, base, pending, k); };
  const setBase = (id, v) => { bases.set(id, v); keepBase(id, v); };
  let stale = null;   // { id, row } once another tab has saved this build
  const queue = (fn) => (saving = saving.then(fn).catch((e) => console.warn('[builds] save failed', e)));
  function saveBuild(snap) { return queue(() => writeSnap(snap)); }
  async function writeSnap(snap) {
    if (stale) return;
    const rec = JSON.parse(snap);
    if (!(typeof rec.buildId === 'string' && rec.buildId)) return;
    const prev = entry && entry.id === rec.buildId ? entry : await builds.get(rec.buildId);
    const next = entryOf(rec, { name: prev ? undefined : kitTitle, kit: KIT, prev });
    const base = expectFor(rec.buildId);
    if (typeof base === 'number' && next.savedAt <= base) next.savedAt = base + 1;   // a version is never reused: two saves in one clock tick, or a clock set back, still differ (Sol 01a16556)
    keepBase(rec.buildId, base, next.savedAt);   // pending: a write that lands while the page unloads is still this tab's
    const r = await builds.put(next, { expect: base });   // the cap and the version are the write's own checks (Terra 01a13578)
    if (r.stale) { keepBase(rec.buildId, base); goStale(rec.buildId, r.stale); return; }
    if (r.unsaved) { keepBase(rec.buildId, base); return; }   // neither store took it (storage full): silent, as before, and still based on what is stored
    if (!r.ok) { keepBase(rec.buildId, base); capPending = { drop: r.drop, snap }; builds.writeSlot(rec); return; }
    setBase(rec.buildId, next.savedAt);
    entry = next;
    builds.currentId = entry.id;
    builds.writeSlot(rec);
    document.title = tabTitle(entry.name);
    if (hadLabels && !hasLabels(rec)) { dropLabels(copies, rec.buildId); labelCopy = null; }   // the last label removed here: nothing to offer back
    hadLabels = hasLabels(rec);
    if (!persisted) { persisted = true; builds.persist(); }
  }
  /* another tab may have saved this build: read the stored version on the save queue (so this tab's own write in flight is
     not mistaken for it) and go stale when it is not the one this tab is based on. Run on another tab's hint (SAVED_KEY,
     never the slot, which boots and the switcher write too), when the tab comes back into view, and from the back/forward cache */
  const recheck = () => queue(async () => {
    if (stale) return;
    const id = store.state.buildId; if (typeof id !== 'string') return;
    const row = await builds.get(id);
    if (row && row.savedAt !== expectFor(id)) goStale(id, row);
  });
  function goStale(id, row) {
    if (stale) return;
    stale = { id, row };
    try { stage.holdColors?.(true); } catch { /* an older stage */ }
    showStale();
  }
  /* the notice: one card over every workspace, the setup sheet and the Picker, kept across workspace switches; it cannot be
     dismissed, and the workspaces' keys stop while it is up (F5 and closing the tab still work) */
  function showStale() {
    if (document.getElementById('ws-stale')) return;
    const make = (tag, props = {}, kids = []) => { const n = document.createElement(tag); Object.assign(n, props); for (const k of kids) n.append(k); return n; };
    const btn = make('button', { type: 'button', className: 'key strong', textContent: 'Reload' });
    const box = make('div', { className: 'box glass' }, [
      make('h2', { id: 'ws-stale-h', textContent: 'This build was saved in another tab' }),
      make('p', { id: 'ws-stale-p', textContent: 'This tab has an older version, so it stopped saving. Reload opens the saved version. Anything changed here since is not kept.' }),
      make('div', { className: 'btns' }, [btn]),
    ]);
    const veil = make('div', { id: 'ws-stale' }, [box]);
    veil.setAttribute('role', 'alertdialog'); veil.setAttribute('aria-modal', 'true');
    veil.setAttribute('aria-labelledby', 'ws-stale-h'); veil.setAttribute('aria-describedby', 'ws-stale-p');
    btn.addEventListener('click', () => { btn.disabled = true; ctx.builds.reloadSaved(); });
    /* no key reaches the page under it: not the workspaces' shortcuts (Delete, Ctrl+Z, the arrows), not Escape for a sheet
       or the Picker. Reload's own Enter and Space are its default action, so they still work; F5 and Ctrl+R are the browser's.
       Off the button, the keys that would press or type into a hidden control do nothing, and focus comes back (the review) */
    addEventListener('keydown', (e) => {
      e.stopImmediatePropagation();
      if (veil.contains(e.target)) { if (e.key === 'Tab') { e.preventDefault(); btn.focus(); } return; }
      if (e.key === 'Tab' || e.key === 'Enter' || (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey)) e.preventDefault();
      btn.focus();
    }, true);
    addEventListener('keyup', (e) => { if (!veil.contains(e.target)) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);   // Space presses a button on keyup
    // a sheet closing under the notice (its own focus return), a late Picker batch: focus stays on the card
    document.addEventListener('focusin', (e) => { if (!veil.contains(e.target)) btn.focus(); }, true);
    document.body.appendChild(veil);
    btn.focus();
  }
  /* the mounted workspace's toast (every workspace makes one as #ws-toast) */
  const toast = (m) => { const t = document.getElementById('ws-toast'); if (!t) return; t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); };
  /* reload the page on another record. A URL that differs from the current one only in its hash is a hash change, not a
     navigation (the e2e suite caught Duplicate staying on the old build, 2026-10-13), so that case reloads explicitly - the
     old viewer's own rule for a mount or length change. A harness keeps its ?debug hooks across it. `replace`: this page
     leaves the history (the stale notice's Reload: Back never returns to the version it set aside) */
  const go = (q, hash = '', { replace = false } = {}) => {
    const u = new URLSearchParams(q); if (QS.get('debug')) u.set('debug', QS.get('debug'));
    const url = `${location.pathname}?${u}${hash}`;
    const sameDocument = url.split('#')[0] === location.pathname + location.search;
    if (replace) location.replace(url); else location.href = url;
    if (sameDocument) location.reload();
  };
  const wsNow = () => document.documentElement.dataset.ws || 'build';
  /* a shared scheme (#scheme= beside #build=, the Colors workspace's Share): applied once, then dropped from the address */
  { const m = /[#&]scheme=([^&]+)/.exec(location.hash); if (m) { try { const colors = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); stage.setPalette({ colors, on: true }); } catch { /* a damaged scheme link: the build still opens */ } history.replaceState(history.state, '', location.href.replace(/[#&]scheme=[^&]+/, (x) => x.startsWith('#') ? '#' : '').replace(/#&/, '#').replace(/#$/, '')); } }
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
  /* the guard's base for the build this page opened: the stored version it came from (read above, on the reopen and on a
     link alike). A link this tab wrote itself - its own reload, a restored session, a switch it made - carries the base the
     tab kept in sessionStorage: when the stored version is neither that nor the one it was writing, another tab saved it
     since, and the tab is stale before anything is saved. A page coming back (Back, Forward, F5) is judged by its own
     history entry's base when it kept one. A fresh link (no kept base) wins, as before */
  {
    const id = store.state.buildId;
    if (typeof id === 'string') {
      const stored = entry && entry.id === id ? entry.savedAt : null;
      const mine = LINKED ? ((keptPage && builds.tabBase(id, pageKey())) || builds.tabBase(id)) : undefined;
      if (mine && stored !== null && stored !== mine.base && stored !== mine.pending) { bases.set(id, mine.base); goStale(id, entry); }
      else setBase(id, stored);
    }
  }
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
      /* a rename is a write like any other: on the save queue, a new version, and refused in a stale tab (the guard) */
      rename(v) {
        const name = cleanName(v); if (!name) return Promise.resolve(false);
        return queue(async () => {
          if (stale) return false;
          if (!entry) await writeSnap(JSON.stringify(store.serialize()));
          if (!entry || stale) return false;
          if (entry.name === name) return true;   // the setup sheet renames on every apply: an unchanged name writes nothing
          const next = { ...entry, name, savedAt: Date.now() };
          const base = expectFor(entry.id);
          if (typeof base === 'number' && next.savedAt <= base) next.savedAt = base + 1;
          keepBase(entry.id, base, next.savedAt);
          const r = await builds.put(next, { force: true, expect: base });
          if (r.stale) { keepBase(entry.id, base); goStale(entry.id, r.stale); return false; }
          if (r.unsaved) { keepBase(entry.id, base); return false; }
          entry = next; setBase(entry.id, next.savedAt); document.title = tabTitle(name); return true;
        });
      },
      /* open a stored build: the version that is stored when the page leaves is the one it opens and is based on */
      async open(id, { replace = false } = {}) {
        const e = await builds.get(id); if (!e) return;
        const r = await builds.put({ ...e, openedAt: Date.now() }, { force: true, expect: e.savedAt });
        const cur = r.stale || e;
        builds.currentId = id; keepBase(id, cur.savedAt); builds.writeSlot(cur.record);
        go({ ws: wsNow(), ...(cur.kit ? { build: cur.kit } : {}) }, hashOf(cur.record), { replace });
      },
      /* the notice's Reload: the stored version, or this tab's own record when the build was deleted since */
      async reloadSaved() {
        const id = stale ? stale.id : store.state.buildId;
        if (await builds.get(id)) return ctx.builds.open(id, { replace: true });
        keepBase(id, null);
        go({ ws: wsNow(), ...(KIT ? { build: KIT } : {}) }, hashOf(store.serialize()), { replace: true });
      },
      /* the Label Studio's Add to planner build opens a new tab on this browser's CURRENT build (its return address carries
         no build), so the build here becomes the current one as the Studio opens: at once (the current id and the slot,
         which a new tab reads before this save lands), and saved when it never was. Opening Labels used to save every
         build as a side effect; it no longer does (the guard), and a kit page or a link never edited then sent the
         Studio's labels to another build (the guard's review, 2026-10-22) */
      keepCurrent() {
        const id = store.state.buildId; if (stale || typeof id !== 'string') return;
        store.flush();
        builds.currentId = id; builds.writeSlot(store.serialize());
        if (!entry || entry.id !== id) saveBuild(JSON.stringify(store.serialize()));
      },
      /* for the end-to-end checks: whether this tab is stale, its base for the open build, and the save queue */
      get stale() { return !!stale; },
      get base() { return expectFor(store.state.buildId); },
      settled: () => saving,
      async duplicate() {
        const rec = store.serialize(); const copy = { ...rec, buildId: undefined };
        const e = entryOf(copy, { name: `Copy of ${entry ? entry.name : kitTitle || 'build'}`, kit: KIT });
        try { const pal = localStorage.getItem(buildKey(rec.buildId)); if (pal) localStorage.setItem(buildKey(e.id), pal); } catch { /* private */ }
        const r = await builds.put(e); if (!r.ok) { capPending = { drop: r.drop, snap: JSON.stringify(e.record), name: e.name }; return false; }
        builds.currentId = e.id; builds.setTabBase(e.id, e.savedAt); builds.writeSlot(e.record); go({ ws: wsNow(), ...(KIT ? { build: KIT } : {}) }, hashOf(e.record)); return true;
      },
      saveFile() { const e = entry || entryOf(store.serialize(), { name: kitTitle, kit: KIT }); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([fileOf(e)], { type: 'application/json' })); a.download = fileName(e); document.body.appendChild(a); a.click(); a.remove(); },
      async loadFile(file) {
        const got = parseBuildFile(await file.text()); if (got.problem) return got.problem;
        const prev = typeof got.record.buildId === 'string' ? await builds.get(got.record.buildId) : null;
        if (prev && !hasLabels(got.record) && hasLabels(prev.record)) rememberLabels(copies, prev.id, labelCopyOf(prev.record, prev.savedAt));   // offered back after the reload
        const e = entryOf(got.record, { name: got.name || (prev ? prev.name : null) || file.name.replace(/\.json$/i, ''), prev });
        const r = await builds.put(e); if (!r.ok) { capPending = { drop: r.drop, snap: JSON.stringify(e.record), name: e.name }; return 'cap'; }
        builds.currentId = e.id; builds.setTabBase(e.id, e.savedAt); builds.writeSlot(e.record); go({ ws: wsNow() }, hashOf(e.record)); return null;
      },
      async remove(id) { await builds.remove(id); if (entry && entry.id === id) { entry = null; builds.currentId = null; go({ ws: 'build', new: '1', ...(KIT ? { build: KIT } : {}) }); } },
      newBuild() { go({ ws: 'build', new: '1', setup: '1', ...(KIT ? { build: KIT } : {}) }); },   // a fresh kit page with the setup sheet open
      /* the cap: save the oldest as a file, or drop it; either way the held build is saved next */
      async capSave() { if (!capPending) return; const e = capPending.drop; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([fileOf(e)], { type: 'application/json' })); a.download = fileName(e); document.body.appendChild(a); a.click(); a.remove(); },
      async capDrop() { if (!capPending) return; const p = capPending; capPending = null; await builds.remove(p.drop.id); if (p.name) { const e = entryOf(JSON.parse(p.snap), { name: p.name, kit: KIT }); await builds.put(e); builds.currentId = e.id; builds.setTabBase(e.id, e.savedAt); builds.writeSlot(e.record); go({ ws: wsNow(), ...(KIT ? { build: KIT } : {}) }, hashOf(e.record)); } else await saveBuild(p.snap); },
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
      history.replaceState(history.state, '', `${location.pathname}?${q}${location.hash}`);
      current = { name: ws, ...WORKSPACES[ws](stage, ctx) };
    },
  };
  /* a labels link (#labels-add=, the Label Studio's "Add to planner build", taken from the address at the top of the boot;
     #labels-open) lands in the Labels workspace, which imports it; the build's own #build= part stays */
  const labelsLink = !!labelsAdd || /(^#|&)labels-open/.test(location.hash);
  if (/(^#|&)labels-open(&|$)/.test(location.hash)) history.replaceState(history.state, '', location.href.replace(/[#&]labels-open(?=&|$)/, (x) => (x.startsWith('#') ? '#' : '')).replace(/#&/, '#').replace(/#$/, ''));
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
      if (!/(^#|&)labels-/.test(location.hash)) { try { history.replaceState(history.state, '', `${location.pathname}${location.search}#build=${btoa(unescape(encodeURIComponent(snap)))}`); } catch { /* a very old browser */ } }
      if (!LINKED) saveBuild(snap);
    }
    if (note) setTimeout(() => toast(note), 600);
  }
  /* the stale-tab guard's early warning: another tab's write of this build (its hint), the visitor coming back to this tab
     (the Studio's flow: Add to planner build opened a second tab), and a page restored from the back/forward cache */
  addEventListener('storage', (ev) => { const h = savedHint(ev); if (h && h.id === store.state.buildId) recheck(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recheck(); });
  addEventListener('pageshow', (ev) => { if (!ev.persisted) return; recheck(); const b = document.querySelector('#ws-stale button'); if (b) b.disabled = false; });   // back from the cache: a pressed Reload works again
  /* crossing the phone breakpoint re-mounts the workspace in the other chrome (its memo keeps the selection and step) */
  let wasPhone = isPhone(), resizeT = 0;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const now = isPhone(); document.documentElement.classList.toggle('ws-phone', now); if (now !== wasPhone) { wasPhone = now; ctx.remount(); } }, 150); });
}

await boot();
