// The merged app's boot (phase 0, Build screen first). Decides whether this page shows a workspace
// shell over the stage or the old viewer unchanged: `?ws=build` opens the Build workspace; without
// it the page is the viewer as deployed before the redesign, which the golden screenshots and the
// smoke tests still exercise. The default flips once the shell is accepted.
import { createStage } from './main.js';
import { mountBuild } from './workspaces/build.js';

const QS = new URLSearchParams(location.search);
const WS = QS.get('ws');

/* theme: the brief's data-mode on <html>, kept in step with the stage's own light/dark */
export function setMode(mode, stage) {
  document.documentElement.dataset.mode = mode;
  // the same two keys the viewer's own button writes: the value, and the stamp a cross-site handoff compares
  try { localStorage.setItem('gen2-theme', mode); localStorage.setItem('gen2-theme:t', String(Date.now())); } catch { /* private mode */ }
  if (stage && stage.stageTheme !== mode) stage.applyStageTheme(mode);
}
function initialMode() {
  try { return localStorage.getItem('gen2-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

export async function boot() {
  if (!WS) { await createStage(document); return; }
  document.documentElement.dataset.ws = WS;
  document.documentElement.dataset.mode = initialMode();
  const ws = { onSelect: null };
  const stage = await createStage(document, { onSelect: (sel) => ws.onSelect && ws.onSelect(sel), quietSelect: WS === 'build' });
  if (WS === 'build') ws.onSelect = mountBuild(stage, { setMode });
}

await boot();
