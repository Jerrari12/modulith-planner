// The merged app's boot (phase 0, Build screen first). Decides whether this page shows a workspace
// shell over the stage or the old viewer unchanged: `?ws=build` opens the Build workspace; without
// it the page is the viewer as deployed before the redesign, which the golden screenshots and the
// smoke tests still exercise. The default flips once the shell is accepted.
import { createStage } from './main.js';
import { mountBuild } from './workspaces/build.js';
import { mountAssemble } from './workspaces/assemble.js';

const QS = new URLSearchParams(location.search);
const WS = QS.get('ws');

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
const WORKSPACES = { build: mountBuild, assemble: mountAssemble };

export async function boot() {
  if (!WS) { await createStage(document); return; }
  document.documentElement.dataset.ws = WS;
  document.documentElement.dataset.mode = initialMode();
  let current = null;   // the mounted workspace's handle
  const stage = await createStage(document, {
    onSelect: (sel) => current?.onSelect?.(sel),
    onPage: (i) => current?.onPage?.(i),
    quietSelect: true, fillBoost: 1.6,
  });
  setMode(document.documentElement.dataset.mode, stage);   // the viewer booted on `dark`; the workspace wants `night`
  const ctx = {
    setMode,
    memo: {},   // what a workspace wants back when it is remounted (the Assemble step, for one)
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
