// The merged app's boot (phase 0, Build screen first). Decides whether this page shows a workspace
// shell over the stage or the old viewer unchanged: `?ws=build` opens the Build workspace; without
// it the page is the viewer as deployed before the redesign, which the golden screenshots and the
// smoke tests still exercise. The default flips once the shell is accepted.
import { createStage } from './main.js';
import { mountBuild } from './workspaces/build.js';
import { mountAssemble } from './workspaces/assemble.js';
import { mountParts, printCountOf } from './workspaces/parts.js';
import { createStore } from './state/store.js';

// eslint-disable-next-line no-undef
const G = typeof GEN2 !== 'undefined' ? GEN2 : null;   // the planner's catalog, a classic-script lexical global

const QS = new URLSearchParams(location.search);
const WS = QS.get('ws');
const KIT = QS.get('build');   // the official kit this page opened with, kept in the address through every edit

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
const WORKSPACES = { build: mountBuild, assemble: mountAssemble, parts: mountParts };

export async function boot() {
  if (!WS) { await createStage(document); return; }
  document.documentElement.dataset.ws = WS;
  document.documentElement.dataset.mode = initialMode();
  let current = null;   // the mounted workspace's handle
  const stage = await createStage(document, {
    onSelect: (sel) => current?.onSelect?.(sel),
    onPage: (i) => current?.onPage?.(i),
    onContext: (info) => current?.onContext?.(info),
    quietSelect: true, fillBoost: 1.6,
  });
  /* THE STORE (phase 3): the build record with the planner's rules and undo history. It opens on the record the
     stage booted with (the kit file, or a #build= hash) and writes every settled change back to the address as the
     planner's own share-link form, so a reload or a shared link reopens the edited build (the viewer decodes it). */
  const store = createStore(G, { onSave: (snap) => { try { history.replaceState(null, '', `${location.pathname}${location.search}#build=${btoa(unescape(encodeURIComponent(snap)))}`); } catch { /* a very old browser */ } } });
  if (stage.build) store.load(stage.build);
  if (QS.get('debug')) window.__GEN2_STORE__ = store;   // for the shot tool and end-to-end checks, like the stage's own hook
  let kitTitle = stage.manifest?.title || null;
  if (KIT && location.hash.startsWith('#build=')) { try { kitTitle = (await (await fetch(`builds/${encodeURIComponent(KIT)}.json`)).json()).title || kitTitle; document.title = kitTitle; } catch { /* the hash's own name stands */ } }
  setMode(document.documentElement.dataset.mode, stage);   // the viewer booted on `dark`; the workspace wants `night`
  /* a representative finished build in every workspace (Astra): the first preset's coordinated filaments unless the
     visitor already has a saved palette; Assemble switches to Part colors on its own and restores this on leave */
  if (!stage.useCustom && stage.PRESETS?.length) stage.applyPreset(stage.PRESETS[0]);
  const ctx = {
    setMode,
    memo: {},   // what a workspace wants back when it is remounted (the Assemble step, for one)
    store, kitId: KIT, get kitTitle() { return kitTitle; },
    badges: () => { try { return { parts: printCountOf(stage.build) || null }; } catch { return {}; } },   // the tab badges (the brief: Parts shows the printed-piece count)
    has: (ws) => !!WORKSPACES[ws],
    switchTo(ws) {
      if (!WORKSPACES[ws] || (current && current.name === ws)) return;
      current?.unmount();
      document.documentElement.dataset.ws = ws;
      const q = new URLSearchParams(location.search); q.set('ws', ws);
      history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
      current = { name: ws, ...WORKSPACES[ws](stage, ctx) };
    },
  };
  ctx.switchTo(WORKSPACES[WS] ? WS : 'build');
}

await boot();
