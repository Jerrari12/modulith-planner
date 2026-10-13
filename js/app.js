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

// eslint-disable-next-line no-undef
const G = typeof GEN2 !== 'undefined' ? GEN2 : null;   // the planner's catalog, a classic-script lexical global

const QS = new URLSearchParams(location.search);
const WS = QS.get('ws');
const KIT = QS.get('build');   // the official kit this page opened with, kept in the address through every edit
const FRESH = QS.get('new') === '1';   // New build: a fresh copy of the kit, never the build this browser had open
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
export function setMode(mode, stage) {
  document.documentElement.dataset.mode = mode;
  // the same two keys the viewer's own button writes: the value, and the stamp a cross-site handoff compares
  try { localStorage.setItem('gen2-theme', mode); localStorage.setItem('gen2-theme:t', String(Date.now())); } catch { /* private mode */ }
  // the workspace's dark mode is the stage's quieter `night` variant (same palette, calmer grid and reflection)
  const want = mode === 'dark' && document.documentElement.dataset.ws ? 'night' : mode;
  if (stage && stage.stageTheme !== want) stage.applyStageTheme(want);
}
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
  /* THE BUILD STORE (the plan §1.3): Recent builds in IndexedDB, the planner's autosave slot dual-written. With no build in
     the address and no kit asked for, the page reopens the build this browser had open last (the current Recent entry, else
     the planner's slot) by putting its record in the address before the stage boots from it; `?new=1` skips that. */
  const builds = await openBuilds();
  let entry = null;   // the Recent entry of the build on this page, once known
  if (FRESH) { const q = new URLSearchParams(location.search); q.delete('new'); history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`); }
  else if (!/(^#|&)build=/.test(location.hash) && !KIT) {
    const cur = await builds.get(builds.currentId); const rec = cur ? cur.record : builds.readSlot();
    if (rec) { entry = cur; history.replaceState(null, '', location.pathname + location.search + hashOf(rec) + (location.hash ? '&' + location.hash.slice(1) : '')); }
  }
  const stage = await createStage(document, {
    onSelect: (sel) => current?.onSelect?.(sel),
    onPage: (i) => current?.onPage?.(i),
    onContext: (info) => current?.onContext?.(info),
    quietSelect: true, fillBoost: 1.6,
    // the palette is per BUILD: the kit this page opened with keeps its own (the Studio's own key for official kits)
    colorStoreKey: colorKeyAtBoot(),
  });
  /* THE STORE (phase 3): the build record with the planner's rules and undo history. It opens on the record the
     stage booted with (the kit file, or a #build= hash) and writes every settled change back to the address as the
     planner's own share-link form, so a reload or a shared link reopens the edited build (the viewer decodes it). */
  const store = createStore(G, { extra: { get: () => { const p = stage.palette(); return { colors: p.colors, on: p.on, user: p.user, over: p.over }; }, set: (v) => stage.setPalette(v) } /* the hand-built palette and the per-unit layer ride along too (Sol 01a13330) */, onSave: (snap) => { try { history.replaceState(null, '', `${location.pathname}${location.search}#build=${btoa(unescape(encodeURIComponent(snap)))}`); stage.setColorStoreKey(buildKey(store.state.buildId)); } catch { /* a very old browser */ } saveBuild(snap); } });
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
      document.title = entry.name;
      if (!persisted) { persisted = true; builds.persist(); }
    }).catch((e) => console.warn('[builds] save failed', e));
    return saving;
  }
  const go = (q, hash = '') => { const u = new URLSearchParams(q); location.href = `${location.pathname}?${u}${hash}`; };
  const wsNow = () => document.documentElement.dataset.ws || 'build';
  /* a shared scheme (#scheme= beside #build=, the Colors workspace's Share): applied once, then dropped from the address */
  { const m = /[#&]scheme=([^&]+)/.exec(location.hash); if (m) { try { const colors = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); stage.setPalette({ colors, on: true }); } catch { /* a damaged scheme link: the build still opens */ } history.replaceState(null, '', location.href.replace(/[#&]scheme=[^&]+/, (x) => x.startsWith('#') ? '#' : '').replace(/#&/, '#').replace(/#$/, '')); } }
  if (stage.build) store.load(stage.build);
  if (QS.get('debug')) { window.__GEN2_STORE__ = store; window.__GEN2_CTX__ = () => ctx; }   // for the shot tool and end-to-end checks, like the stage's own hook
  let kitTitle = stage.manifest?.title || null;
  if (KIT && location.hash.startsWith('#build=')) { try { kitTitle = (await (await fetch(`builds/${encodeURIComponent(KIT)}.json`)).json()).title || kitTitle; document.title = kitTitle; } catch { /* the hash's own name stands */ } }
  if (!entry && typeof store.state.buildId === 'string') entry = await builds.get(store.state.buildId);   // our own build, reopened from the address
  if (entry) { document.title = entry.name; builds.currentId = entry.id; builds.writeSlot(entry.record); }   // the slot follows what is open, not only what is edited
  setMode(document.documentElement.dataset.mode, stage);   // the viewer booted on `dark`; the workspace wants `night`
  /* a representative finished build in every workspace (Astra): the first preset's coordinated filaments unless the
     visitor already has a saved palette; Assemble switches to Part colors on its own and restores this on leave */
  if (!stage.useCustom && stage.PRESETS?.length) stage.applyPreset(stage.PRESETS[0]);
  const ctx = {
    setMode,
    memo: {},   // what a workspace wants back when it is remounted (the Assemble step, for one)
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
      async rename(v) { const name = cleanName(v); if (!name) return false; if (!entry) { await saveBuild(JSON.stringify(store.serialize())); } if (!entry) return false; entry = { ...entry, name }; await builds.put(entry, { force: true }); document.title = name; return true; },
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
        const e = entryOf(got.record, { name: got.name || (prev ? prev.name : null) || file.name.replace(/\.json$/i, ''), prev });
        const r = await builds.put(e); if (!r.ok) { capPending = { drop: r.drop, snap: JSON.stringify(e.record), name: e.name }; return 'cap'; }
        builds.currentId = e.id; builds.writeSlot(e.record); go({ ws: wsNow() }, hashOf(e.record)); return null;
      },
      async remove(id) { await builds.remove(id); if (entry && entry.id === id) { entry = null; builds.currentId = null; go({ ws: 'build', new: '1', ...(KIT ? { build: KIT } : {}) }); } },
      newBuild() { go({ ws: 'build', new: '1', ...(KIT ? { build: KIT } : {}) }); },
      /* the cap: save the oldest as a file, or drop it; either way the held build is saved next */
      async capSave() { if (!capPending) return; const e = capPending.drop; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([fileOf(e)], { type: 'application/json' })); a.download = fileName(e); document.body.appendChild(a); a.click(); a.remove(); },
      async capDrop() { if (!capPending) return; const p = capPending; capPending = null; await builds.remove(p.drop.id); if (p.name) { const e = entryOf(JSON.parse(p.snap), { name: p.name, kit: KIT }); await builds.put(e); builds.currentId = e.id; builds.writeSlot(e.record); go({ ws: wsNow(), ...(KIT ? { build: KIT } : {}) }, hashOf(e.record)); } else await saveBuild(p.snap); },
      capKeep() { capPending = null; },
    },
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
  /* a labels link (#labels-add=, the Label Studio's "Add to planner build"; #labels-open) lands in the Labels workspace, which
     imports it; the build's own #build= part stays beside it */
  const labelsLink = /(^#|&)labels-(add=|open)/.test(location.hash);
  if (/(^#|&)labels-open(&|$)/.test(location.hash)) history.replaceState(null, '', location.href.replace(/[#&]labels-open(?=&|$)/, (x) => (x.startsWith('#') ? '#' : '')).replace(/#&/, '#').replace(/#$/, ''));
  ctx.switchTo(labelsLink ? 'labels' : WORKSPACES[WS] ? WS : 'build');
  /* crossing the phone breakpoint re-mounts the workspace in the other chrome (its memo keeps the selection and step) */
  let wasPhone = isPhone(), resizeT = 0;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const now = isPhone(); document.documentElement.classList.toggle('ws-phone', now); if (now !== wasPhone) { wasPhone = now; ctx.remount(); } }, 150); });
}

await boot();
