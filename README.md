# MODULITH Planner

The MODULITH planner and the 3D Build Studio merged into one app with five workspaces over one three.js stage:
**Build · Colors · Labels · Parts · Assemble**. Live at https://jerrari12.github.io/modulith-planner/ (the domain
`planner.modulith.systems` follows at cutover; `docs/redesign/CUTOVER.md`).

- **Build**: add units from the library, place them on judged spots in 3D or on the 2D board, move, remove, undo; the
  planner's every warning reaches the issue card; the setup sheet (mount, length, printer, name) for a new build.
- **Colors**: the filament picker over the stage's palette, per-unit overrides, schemes, presets, the shopping list.
- **Labels**: typed and part labels placed drawer by drawer or several at once, Fill, the editor, imports from the Label
  Studio and the Part Picker, exports; a build that comes back without its labels is offered them.
- **Parts**: the bill of materials with tracking and the dock's progress.
- **Assemble**: the step-by-step instructions, the old Studio's own.

Every build autosaves to IndexedDB in the browser (Recent builds, 20 at most, never dropped without asking); a share
link (`#build=`) and a build file (`{ gen2Build: 1, name, data }`, the name optional) carry a build anywhere. Below 1024 px the panels become
bottom sheets.

## Where it came from

This repository started on 2026-10-12 as the viewer repository's history (`gen2-visual-animator`, its `viewer/`
folder) filtered to the root, with the part GLBs and thumbnails removed; those live in
[Jerrari12/gen2-parts](https://github.com/Jerrari12/gen2-parts) and are served from
`https://jerrari12.github.io/gen2-parts/` (`js/config.js`). The planner's rules were ported by copy, behind parity
gates, from the old planner at `gen2planner.jerrari3d.com`, which stays live until the merged app has earned its kill
date. The redesign brief, the style spec, the inventories and the reference artboard are in `docs/redesign/`; the
decisions taken on the way, dated, in `docs/redesign/DECISIONS.md`; the stage's interface in
`docs/redesign/STAGE-API.md`.

## Running it

A static site: serve the root folder and open it.

```bash
python -m http.server 8743
```

Then `http://127.0.0.1:8743/`, which opens Build. The part models load from the parts host, so it needs the network even
locally. `?ws=` picks the workspace. An address that names something without `?ws=` is still the old viewer: a kit
(`?build=<kit>`), a build (`#build=`), the part preview (`?part=…&mode=preview`) or a benchmark (`?bench=`). The smoke test
and the golden screenshots exercise it (`js/entry.js` `shellWorkspace` decides). `?new=1` starts a fresh build
(`&setup=1` with the setup sheet open), `?ws=build&build=<kit>` opens an official kit in Build, `?debug=1` exposes
`window.__GEN2_STORE__`, `__GEN2_VIEWER__` and `__GEN2_CTX__()` for the tools and the tests.

The map: `index.html` → `js/boot.js` → `js/app.js` (the boot: the build store, the setup sheet, the workspace
router) → `createStage()` from `js/main.js` (the whole former viewer as a factory). Workspaces in `js/workspaces/`,
the shell in `js/ui/` (top bar, toolbar, dock, phone sheets, hints, setup), the record and its history in
`js/state/store.js`, the rules in `js/rules/` (never edited by hand: see below), the planner's catalog vendored
verbatim at `js/catalog/data.js`, tokens and glass in `css/`.

## Tests

```bash
npm ci
npm test          # the rules, the store, the schema, parity, the vendored modules: no browser
npm run e2e       # the five workspaces, the store, the setup sheet and the phone sheets driven in headless Chrome
```

`npm test` reads part files from `parts/<length>/`, which is not in this repository: make `parts/` a junction
(Windows) or a symlink to a checkout of `gen2-parts/parts` (it is ignored by git). The parity tests need the old
planner checked out beside this repo (`../GEN2 Planner/gen2-planner-main`, or `PLANNER_REPO`) and skip otherwise.

The e2e suite runs on a developer machine's Chrome and on the GitHub runner's software rasteriser alike; before
pushing a change to the suite, reproduce the runner here with `E2E_SOFT=1 npm run e2e`.

### The deploy gate

Every push to `main` runs, in order: `npm test`; then, with the dependencies and a browser installed, the smoke test
(the two public routes draw a real picture), `profile-lands`, `relief-tier` and `npm run e2e`; then the asset URLs are
stamped with the commit and the site is published. A red step blocks the deploy and the previous build stays live.

### Golden screenshots

```bash
npm run goldens              # compare the stage against test/golden/shots (fails over 0.1% of pixels)
npm run goldens -- --update  # re-bless after a change that is MEANT to move pixels
```

`tools/golden-shots.mjs` opens every official kit in headless Chrome at the Very High and Fast tiers, drives it to
the cover, a middle step and the finished build, and reads the WebGL canvas back: the guard for the stage refactors,
which must not move the picture beyond that tolerance.

### Rules ported by copy, and the drift check

`tools/port-rules.mjs` regenerates `js/rules/bom.js`, `js/rules/layout.js` and `js/rules/schema.js` from the old
planner's `js/app.js`: `computeBom`, the layout rules (fit, placement, validity, fixes, conversion) and the build
schema (`BUILD_FIELDS`, `sanitizeBuild`, the label cleaners), verbatim apart from `state.` becoming the `build`
argument and two UI hooks stubbed in the preamble. `js/rules/LEDGER.md` classifies every export of the planner's test
hook as moved, UI-only, relay, later or dropped. The parity tests (`test/parity/`) run the planner's own app.js in
jsdom beside the port on the official kits, seeded random builds with option sweeps and deliberately broken layouts,
and `test/parity/site-boms.test.mjs` checks the MODULITH site's committed BOM artifact against the port.

```bash
npm run drift     # has the old planner's text moved under the pinned modules? exit 1 and a line count per module if so
```

A drift is read, then either ported (run the tool, re-run the parity tests) or noted in `docs/redesign/DECISIONS.md` as
a change that stays in the old planner only, with the reason.

The label operations (`js/rules/labels.js`) are hand-ported from the planner's label-place branch over the vendored
`js/vendor/label-list.js` (`test/labels.test.mjs`); the build store is `js/state/builds.js` (`test/builds.test.mjs`);
the labels kept aside for a build that comes back without them, `js/state/label-copies.js`.

## Other tools

- `node tools/shell-shots.mjs` writes checkpoint screenshots of every workspace in both modes, desktop and 390 px
  phone, to `docs/redesign/checkpoints/`.
- `node tools/hint-clips.mjs` records the workspaces' hover-hint clips (`img/hints/`) from the app itself; a clip's
  name or a workspace's as the argument records only those.
- `node tools/perf-probe.mjs` reports the heap and the renderer's resource counts after 1 and after 50 regenerates, and
  the frame intervals while the model is dragged with the Build chrome open, at the default tier and at Fast.
- `node tools/make-icons.mjs` rebuilds the Phosphor sprite; `node tools/fetch-fonts.mjs` the self-hosted fonts.
