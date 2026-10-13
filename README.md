# MODULITH Planner

The MODULITH planner and 3D Build Studio merged into one app with five workspaces: Build · Colors · Labels · Parts · Assemble. The redesign brief, the style spec, the feature inventories and the reference artboard are in `docs/redesign/`.

This repository started on 2026-10-12 as the viewer repository's history (`gen2-visual-animator`, its `viewer/` folder) filtered to the root, with the part GLBs and the part thumbnails removed. Those live in [Jerrari12/gen2-parts](https://github.com/Jerrari12/gen2-parts) and are served from `https://jerrari12.github.io/gen2-parts/`; `js/config.js` holds that address.

## Running it

It is a static site: serve the root folder (for example `python -m http.server 8743`) and open it. The part GLBs and thumbnails load from the parts host, so it needs the network even locally.

`index.html` loads `js/boot.js` → `js/app.js`, which calls `createStage(document, opts)` from `js/main.js`. Without a `?ws=` parameter the page is the old viewer; `?ws=build` opens the Build workspace shell over it and `?ws=assemble` the Assemble workspace (phase 1: the step list and step player over the viewer's own pages; the tabs switch workspaces in place without a reload), `?ws=parts` the Parts workspace (phase 2: the planner's bill of materials ported by copy to `js/rules/bom.js` by `tools/port-rules.mjs` and parity-gated by `test/parity/bom-parity.test.mjs` against the planner checkout beside this repo; per-build progress as had / printed-or-bought / to go). Phase 3 made Build editable: the record lives in `js/state/store.js` (the planner's BUILD_FIELDS, undo history, the `#build=` share-link form written to the address after the first edit), the rules are the planner's own ported by copy to `js/rules/layout.js` and `js/rules/schema.js` (fit, placement, validity, fixes, conversion, the sanitiser; every test-hook export is classified in `js/rules/LEDGER.md`), and the stage gained `update`, `selectUnit`, `peekUnit`, spot ghosts, flags, a carry drag and an eraser (`docs/redesign/STAGE-API.md`). Adding places on judged spots (the planner's canPlace plus a trial through the generator and the validity rules), moving drags to a spot or any free cell on the 2D board (`js/ui/board.js`) with gravity settling what is left unsupported, and every planner warning reaches the issue card from the Dock (phase 0, Build screen first: `js/workspaces/build.js`, `css/tokens.css`, `css/app.css`, product icons from `js/ui/glyph.js`, Phosphor icons from the committed sprite `icons/phosphor.svg`, the planner's catalog vendored verbatim at `js/catalog/data.js`). `node tools/shell-shots.mjs` writes checkpoint screenshots of the shell in both modes to `docs/redesign/checkpoints/`. The stage factory is the whole former viewer; importing `js/main.js` on its own does nothing (`test/stage-import.test.mjs`), which is what lets the workspaces of the redesign drive it.

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

`tools/port-rules.mjs` regenerates `js/rules/bom.js`, `js/rules/layout.js` and `js/rules/schema.js` from the planner checkout (`../GEN2 Planner/gen2-planner-main`, or `PLANNER_REPO`): the planner's `computeBom`, its layout rules (fit, placement, validity, fixes, conversion) and its build schema (BUILD_FIELDS, `sanitizeBuild`, the label cleaners), verbatim apart from `state.` becoming the `build` argument and two UI hooks stubbed in the module preamble. The parity tests (`test/parity/*.test.mjs`) boot the planner's own app.js in jsdom and compare both sides on the official kits, on seeded random builds with option sweeps and on deliberately broken layouts (`PARITY_BUILDS`, default 120): the BOM sections, every validity predicate, the post-state of every fix, the block reason as the planner renders it, and what the sanitiser keeps of a corrupted record. A planner change is re-run, diffed, re-checked; the rules are never edited by hand. `js/rules/LEDGER.md` classifies every export of the planner's test hook as moved, UI-only, relay, later or dropped.
