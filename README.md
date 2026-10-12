# MODULITH Planner

The MODULITH planner and 3D Build Studio merged into one app with five workspaces: Build · Colors · Labels · Parts · Assemble. The redesign brief, the style spec, the feature inventories and the reference artboard are in `docs/redesign/`.

This repository started on 2026-10-12 as the viewer repository's history (`gen2-visual-animator`, its `viewer/` folder) filtered to the root, with the part GLBs and the part thumbnails removed. Those live in [Jerrari12/gen2-parts](https://github.com/Jerrari12/gen2-parts) and are served from `https://jerrari12.github.io/gen2-parts/`; `js/config.js` holds that address.

## Running it

It is a static site: serve the root folder (for example `python -m http.server 8743`) and open it. The part GLBs and thumbnails load from the parts host, so it needs the network even locally.

`index.html` loads `js/boot.js` → `js/app.js`, which calls `createStage(document, opts)` from `js/main.js`. Without a `?ws=` parameter the page is the old viewer; `?ws=build` opens the Build workspace shell over it and `?ws=assemble` the Assemble workspace (phase 1: the step list and step player over the viewer's own pages; the tabs switch workspaces in place without a reload), `?ws=parts` the Parts workspace (phase 2: the planner's bill of materials ported by copy to `js/rules/bom.js` by `tools/port-rules.mjs` and parity-gated by `test/parity/bom-parity.test.mjs` against the planner checkout beside this repo; per-build progress as had / printed-or-bought / to go) (phase 0, Build screen first: `js/workspaces/build.js`, `css/tokens.css`, `css/app.css`, product icons from `js/ui/glyph.js`, Phosphor icons from the committed sprite `icons/phosphor.svg`, the planner's catalog vendored verbatim at `js/catalog/data.js`). `node tools/shell-shots.mjs` writes checkpoint screenshots of the shell in both modes to `docs/redesign/checkpoints/`. The stage factory is the whole former viewer; importing `js/main.js` on its own does nothing (`test/stage-import.test.mjs`), which is what lets the workspaces of the redesign drive it.

## Tests

```
npm ci
node --test
```

The tests that open GLBs read them from `parts/<length>/`, which is not in this repository. Make `parts/` a junction (Windows) or a symlink to a checkout of `gen2-parts/parts`; it is ignored by git.

### Golden screenshots

```
npm run goldens              # compare the stage against test/golden/shots (fails over 0.1% of pixels)
npm run goldens -- --update  # re-bless after a change that is MEANT to move pixels
```

`tools/golden-shots.mjs` opens every official kit in headless Chrome at the Very High and Fast tiers, drives it to the cover, a middle step and the finished build through the `?debug=1` hook, and reads the WebGL canvas back. It is the guard for the stage refactors of phase 0, which must not change the picture. Shots take about 20 s each (60 in all).

### Rules ported by copy

`tools/port-rules.mjs` regenerates `js/rules/bom.js` from the planner checkout (`../GEN2 Planner/gen2-planner-main`, or `PLANNER_REPO`): the planner's `computeBom` and the helpers it reaches, verbatim apart from `state.` becoming the `build` argument. The parity test boots the planner's own app.js in jsdom and compares both on the official kits and on seeded random builds with option sweeps (`PARITY_BUILDS`, default 120). A planner change is re-run, diffed, re-checked; the rule is never edited by hand.
