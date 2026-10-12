# The stage factory: what it exposes today

Written 2026-10-12, after commit 6021868 (the wrap). This is the honest list, not the target. The target interface is in the approved plan (§1.4: `load`, `update`, `select`, `setColors`, `setMode`, `setSafeArea`, `goTo`, `explode`, `measure`; events `select`, `ready`, `perf`). Each row says whether the wrap delivered it, and what the carve-out still has to do.

## The call

```js
import { createStage } from './js/main.js';
const stage = await createStage(document);
```

| Capability | Today | What is missing |
|---|---|---|
| **Import without side effects** | Yes. `test/stage-import.test.mjs` imports `js/main.js` under node with no DOM and no renderer created; it passed in the 2026-10-12 suite run (459 tests: 451 pass, 6 skipped, 2 pre-existing failures in the EdgeLabel-generator comparisons). | Nothing. |
| **Mount into a container** | No. `container` is accepted and ignored; the body queries `document` by element id (`$('btn-start')`, `getElementById('stage-wrap')`, the canvas) exactly as before, so the stage needs `index.html`'s markup present. | The carve-out replaces the id lookups with lookups scoped to `container`, and the chrome the workspaces take over is removed from the stage's own markup. |
| **Scene-ready** | Partial. The promise resolves after the FIRST `mountManifest` and the render loop start (main.js line 9203 onward), so `await createStage()` is a real "first scene mounted" signal, not a timing guess. | Later mounts (`regenerate()` after an option change, a build swap) signal nothing outward. The plan's `ready(sig)` event after every `mountManifest` is still to add. |
| **Cleanup / dispose** | No. Nothing stops the animation loop, removes the window and document listeners (`load`, `keydown`, `click`, `visibilitychange`, `pointerdown`, the `setInterval` for the paid note) or disposes the renderer. | A `dispose()` that unregisters what the body registers; the carve-out should collect listeners as it moves them. |
| **Multiple instances** | No, and calling the factory twice on one page is unsafe: each call would build its own renderer and both would bind the same element ids and the same window listeners. State is per call (closure), so the limitation is the DOM binding, not shared state. | Follows from mounting into a container plus dispose. |
| **Returned interface** | The object that was the `?debug=1` hook: `THREE`, `scene`, `camera`, `controls`, `goTo`, `applyState`, `instances`, `manifest`, the cinema and confetti controls, `layerHandles`, `bedFinish`, `applyFaceplateStyle` / `FACEPLATE_STYLES`, `applyHandleStyle` / `HANDLE_STYLES`, `seeIntoComponentKeys`, `buildAxisForKey`, `useCustom`, `COLOR_STORE_KEY`, `trackLog`, `track`, and for the screenshot harness `acc`, `ACC_SAMPLES`, `quality`. With `?debug=1` the same object is also installed as `window.__GEN2_VIEWER__`. | This is a debugging surface, not the workspace interface. `manifest` on it is the value at factory return and goes stale after a regenerate. The plan's methods are to be added as thin wrappers over the existing functions (`goTo` already is one). |
| **Loading a different build** | No outward method. The build comes from the URL at boot (`?build=<kit>`, `#build=`, `?kit=`, `?part=`, `?bench=`); changing it means a new page. | `load(build)` / `update(build)` over the existing `applyBuild` + `regenerate` path, with the manifest-hash signature from the plan. |
| **Theme** | The stage reads `gen2-theme` from localStorage and its own toggle button. | `setMode('light'|'dark')` reading the tokens. |
| **Safe area for panels** | Internal: `updateViewInset` already offsets the camera to clear the docked panel. | `setSafeArea(rect)` generalising it to the workspaces' panels. |

## What the goldens do and do not prove

`npm run goldens` proves the picture is unchanged on 60 scenes: 10 official kits × cover / middle step / finished build × Very High / Fast, at 1200×800. It does not cover: the part-preview embed (`?part=`), the planner relay (`?embed=1` driven by the planner), label text on EdgeLabel drawers, the outro scene, light mode, phone widths, or any interaction after the page change. The smoke, profile-lands and relief-tier gates cover the embed route, the filament picker and the quality ladder in a browser; the relay has no automated check here yet.
