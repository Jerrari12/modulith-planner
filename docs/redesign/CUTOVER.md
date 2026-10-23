# Cutover: the merged planner replaces gen2planner and gen2build

Drafted 2026-10-13, after the setup sheet. Brought up to date 2026-10-17: the three prepared branches are current with
their bases, and this repo has a branch for its front door. Their suites show nothing new: the site's and this repo's
pass in full, and the old apps keep only the cross-checkout failures their untouched mains have too (below). What is
left is merging them and retiring the two old apps. Nothing here runs without Joey's go. Refreshed again 2026-10-21 (the
cutover prep, next section): today's mains merged in, the suites re-run, each step's undo rehearsed, the data paths and
the old planner's capability list checked. This repo's branch was refreshed once more on 2026-10-22, for two fixes the
parity list waited on.

## Joey's decisions

1. **The domain: `planner.modulith.systems`** (`PLANNER` below), 2026-10-13. The old planner and viewer addresses redirect
   to it.
2. **The parts host** (the GLBs and part thumbnails, `jerrari12.github.io/gen2-parts`, not the Part Picker), 2026-10-13:
   stays on its Pages address; no domain of its own. (Joey asked whether it could ride under the label generator; the Part
   Picker already does, the model files are a different thing and need no address of their own.)
3. **The kill date** for the old planner: set once the merged planner is reliable and well tested as "MODULITH planner
   2.0", not before (2026-10-13). Cutover day and the kill date stay undetermined until Joey's own hands-on testing
   (2026-10-14). Until then both apps stay up and the redirects wait.

## Refreshed 2026-10-22 (this repo's branch): still nothing merged, nothing deployed

Joey, 2026-10-22: "refresh the cutover branch once the guard is live". Main had moved eight commits past the 10-21
refresh, `aa82df2`; two of the fixes among them close rows this file carries.

| repo | branch | head | merged in | checked on the merge |
|---|---|---|---|---|
| modulith-planner | `cutover-front-door` | `396dabd` | main `0f32d12` (through `e45eac7`, merge `0483b5f`) | npm test 608: 603 pass, 5 skipped, 0 fail; `E2E_SOFT=1` e2e 80/80 on `0483b5f` (`0f32d12` adds records and one code comment); pages.yml's stamp and module-graph steps on a copy pass |

- **Both merges had no conflicts.** The front door still treats a labels link as a rider: `shellWorkspace()` runs when
  `js/app.js` loads, before the boot takes `#labels-add=` out of the address.
- **E6 is fixed** (live 2026-10-22 at `e7bd056d`, planner `40d4b25`) and now on this branch.
- **The second-tab overwrite is fixed too**, found while fixing E6: the Label Studio's Add to planner build opens the
  planner in a second tab, and the first tab's next edit saved over the labels. The stale-tab guard, live 2026-10-22 at
  `e45eac71`, stops it; `studio-live-prod.mjs` walks it with the real Studio (DECISIONS.md 2026-10-22).
- **The other three repos are as on 2026-10-21**, re-checked: the old planner's and the old viewer's `cutover-redirect`
  are current with their origin mains (the old viewer's main is still red, and pushing its fix is still Joey's call). The
  site's `planner-cutover` refresh `21de044` is on this computer only: its origin still holds `c0fac21`, 10 behind its
  main. A push may build a Cloudflare preview, so it waits for Joey. Its BOM pins this repo's `aa82df2`: re-vendor it
  from this repo's newest main just before the site merge.

## Refreshed 2026-10-21, the cutover prep: still nothing merged, nothing deployed

Joey, 2026-10-21: "Start the cutover prep: refresh the four cutover branches onto today's mains and re-run their suites,
verify the 69-row parity list against the live new planner, rehearse reverting each routing step, and test the
last-build handover and file round-trip. Don't merge or deploy anything." The tools, logs and reports are in
`D:\Claude - Output\cutover-prep-2026-10-21` (no repo).

| repo | branch | head | merged in | checked on the merge |
|---|---|---|---|---|
| modulith-planner | `cutover-front-door` | `649f4eb` | main `aa82df2` (124 commits) | npm test 601: 596 pass, 5 skipped; `E2E_SOFT=1` e2e 76/76; pages.yml's stamp and module-graph steps on a copy pass |
| gen2-planner | `cutover-redirect` | `e47fcb8` | main `92c055d` | npm test 416: 414 pass, 1 skipped, 1 fail (C-pin-2, as on 2026-10-17) |
| gen2-visual-animator | `cutover-redirect` | `5a96f52` | origin/main `00e5eef` | npm test 463: 452 pass, 7 skipped, 4 fail: the two EdgeLabel-checkout checks, as on 2026-10-17, and filament-db's count, which origin/main fails alone (below) |
| modulith-site | `planner-cutover` | `21de044` | main `ff09192` | the BOM re-vendored from planner `aa82df2`; npm test exits 0 (runtime 546/0, the validator's self-test 28/28); the built site links neither old host |

- **The planner's two conflicts.** `pages.yml` keeps main's `names.js` stamp (app.js and main.js) and this branch's
  `entry.js` stamp for app.js. `index.html` takes main's search title and description (2026-10-19), which now also serve
  the bare address's link preview.
- **The site's BOM.** In all 10 kits no BOM row was added, removed or changed. Each kit's "Open in the Planner"
  `#build=` form gained `"sideCovers": true` (the side-cover toggle, 2026-10-20). The merge's two conflicts were both in
  the vendored set (the planner pin), and the branch's set was kept. Main's `ff09192` re-vendored from the old planner
  (gen2-planner `92c055d`, its commit message says), and this branch now pins this repo's main `aa82df2`.
- **The old viewer's main does not deploy.** Its Pages workflow runs npm test first. `a41b905` (2026-10-18, Jessie
  Neon Yellow, 112 colours) left `test/filament-db.test.mjs` asserting 111. The run for `00e5eef` failed, and
  `gen2build.jerrari3d.com` still serves `9ee345c4` (2026-10-16). Step 5 below merges into that main, and so would its
  undo: neither deploys while it is red. The local main of `D:\Code Projects\GEN2 Visual Animator` carries the fix,
  unpushed: `72545c5` puts the count at 122 with PolyFlex TPU. It comes after `d479d84` and `7c5571b` from the v2609
  Decor work. Pushing that main would start the old viewer's deploy, which still has to pass its own checks (not run on
  that head here); the push is Joey's call.
- **Undoing each step, rehearsed** (`tools/rehearse-revert.sh`). Each branch was tested the same way, in a throwaway
  worktree at today's main: the day's `git merge --no-ff` applies clean, and `git revert -m 1` of that merge gives back
  main's tree byte for byte. All four pass. The site's merge shows 3,499 changed lines in `src/pages/instructions.js`:
  the branch normalized that file to LF, and with line endings ignored, 9 lines change. How long an undo takes to reach a
  visitor:
  - all three GitHub Pages hosts send `Cache-Control: max-age=600`, so a browser may keep using a cached page for up to
    10 minutes after it loaded it;
  - this planner's deploy runs the e2e suite before it publishes. Its successful runs on 2026-10-21 took 22 to 48
    minutes end to end, a guide and not a promise;
  - the old planner has no deploy workflow (its ci.yml only tests), and Pages publishes its main directly;
  - the old viewer's deploy runs npm test first (above);
  - the site is on Cloudflare (`max-age=0, must-revalidate`) and rebuilds on a push.
- **What carries over, tested** (`tools/handover-roundtrip.mjs`, 25 checks, all pass). The test runs the old planner,
  the old viewer and this planner as loopback copies of the branches above.
  - The old planner's forward:
    - a fresh visit and a build with no mount go to Build plain;
    - a tabletop 185 build made there with Surprise me opens in Build with the same mount, length and units (id, size,
      position, fill), with `?from=makerworld` counted;
    - a kit link with the site's ref opens in Build.
  - The old viewer's forward: a kit from a listing opens in Assemble with `from:thangs` counted, and the part preview and
    the dock stay on the old viewer.
  - Build files, both ways, on one random wall 185 build (Surprise me) per run:
    - a build saved with the old planner's SAVE opens in this planner's Load build file, unit for unit (size,
      position, fill, variant, shelves);
    - the same build saved from this planner imports into the old planner, unit for unit;
    - this planner's `#build=` address opens in the old planner, unit for unit.
  - For an undo: a build file made here with side covers Off, imported into the old planner, kept every top-level and
    unit field but `sideCovers`, so it comes back On, as Sol `01a15b12` recorded. Labels were not exercised (the case
    sets no label list), nor were cabinets or any other configuration.
- **What does not carry over** (from the old planner's js/app.js at `e47fcb8`). The old planner keeps ONE build per
  browser, the `gen2-last-build` slot, and the redirect forwards that build. There is no list of older builds in its
  storage: an older build exists only as a file or a link someone kept. Supported builds of that kind passed the tests
  above; one with a cabinet, or outside this planner's limits, does not open here today (C6 / D5 below). Four stores
  stay on the old origin:
  - `gen2-viewer-colors`: one colour palette per browser, not per build. Neither planner's build file or `#build=` link
    carries colours, so a visitor's colours from the old planner do not arrive; this planner shows its own palette (its
    default, unless the visitor already chose colours here; that case was not tested);
  - `gen2-bom-tracker`: the parts checklist's ticks;
  - `gen2-link-store`: the store a visitor chose. A listing's `?from=` is counted here (tested above). It did not seed this
    planner's store choice, whatever the 2026-10-17 notes said: the viewer seeds its own `gen2-store` from it, in memory,
    and the Parts list read only `gen2-link-store`, so a visitor from Thangs got Printables links. Since 2026-10-23
    (DECISIONS) the Parts list with no choice of its own falls back to the viewer's `gen2-store`, which a pick or a relay
    writes, and then to the address's `?from=` itself, so a listing's visitor gets that store's links
    (test/parts-store-seed.test.mjs);
  - `gen2-label-copies` and `gen2-label-batches`: copies of label lists and Studio batches. The label list itself
    travels in the build (`labelList`, `labelAssign`).
- **The old planner's capability list, checked against the live planner.** The record is `PARITY.md`, with 30
  Playwright scripts, analytics blocked; Sol `01a16116` checked the verdicts, and 5 of its 6 findings were taken.
  - The discovery inventory has **59 rows** (A1-J4), not the 69 the cross-check names. Of those:
    - 34 BUILT, 6 of them living on other sites;
    - 13 CHANGED;
    - 10 MISSING. One of them, G3 "send to phone", never existed in the old planner;
    - 2 CUT on purpose: C1, the docked preview's controls, and C5, "the 3D view cannot edit".
  - Four matter before the old planner's redirect:
    1. **E6, a defect live today.** The Label Studio's "Add to planner build" link (`?ws=labels#labels-add=…`) adds
       nothing when it opens the planner as a fresh page. The same link set after the page has loaded adds its labels,
       and only that path is tested. Re-checked on stamp `aa82df2d` (`tools/labels-add-probe.mjs`): 0 labels on load, 2
       after. The old planner's redirect forwards `#labels-add=` into the same path. **FIXED**, live 2026-10-22 at
       `e7bd056d` (planner `40d4b25`), and on this branch since the 2026-10-22 refresh above.
    2. **C6 / D5.** A build with a cabinet, more than 80 units, or a size its length is not made in opens only on "Can't
       show this build yet": it cannot be edited, billed or fixed. The old planner places and bills cabinets, and its
       redirect would forward such a last build to that page.
    3. **I1.** The planner's shell has no Feedback & support. `#btn-feedback` sits in the old viewer's header, which
       the shell hides.
    4. **A4 / A5.** There is no layout "Surprise me" and no "Load example", and no cut is recorded for either.
  - The other CHANGED and MISSING rows are in `PARITY.md` with their evidence:
    - the build image;
    - the cover stagger toggle and the Club note;
    - the written guides and the videos;
    - the primer;
    - the parts list's thumbnails, and MakerWorld as a store;
    - a part tap's download link.

## Ready on branches (2026-10-17): nothing merged, nothing deployed (the heads and checks are the 2026-10-21 section's now)

Each branch is pushed to its own origin and is current with its base: where the base had moved, it was merged in, never
rebased.

### This repo: `cutover-front-door`, off main `58ffafc`, with main `d2fea64` merged in

- **The bare address opens Build.** `js/entry.js` `shellWorkspace()` decides for `js/app.js`:
  - `?ws=<name>` opens that workspace;
  - an address that names nothing a route reads opens Build. Riders such as `?from=`, `?ref=`, `?debug=`, a labels link or
    a `#scheme=` do not count;
  - an address that names something without `?ws=` is still the old viewer: the part preview (`?part=…&mode=preview`), the
    benchmarks (`?bench=orbit`, `?bench=settle`; another `?bench=` value selects no benchmark, so with no other route the
    address opens Build), the old planner's dock (`?embed=1` with `#build=`), a kit or a build by name (`?build=`,
    `?kit=`, `#build=`). The smoke test, the golden screenshots and the relief and profile checks open the old viewer by
    those, and so will the site's part previews (below).
- **"Customize this build"** on the old viewer's kit pages opens this app's Build with the kit and the current build
  (`?ws=build&build=<kit>#build=`). It used to open `gen2planner.jerrari3d.com`.
- **The kit gallery** (`/builds/`) opens kits in Assemble, and its planner links open Build.
- **The page's static title** is "MODULITH Planner", with a description, for link previews of the bare address.
- **`pages.yml`** stamps app.js's new import of `entry.js`.
- **Checked** (with main merged in, unless it says otherwise):
  - `npm test`: 513 tests, 508 pass, 5 skipped (cross-checkout pins);
  - `test/front-door.test.mjs` 5/5, the address matrix and the links;
  - `E2E_SOFT=1` e2e 32/32. Its new case "the front door": the bare address boots Build, a kit link and a part preview
    keep the old viewer, and Customize lands in Build carrying the build shown;
  - smoke 4/4; profile-lands 4/4 and relief-tier 6/6 before the merge (main's commits do not touch the old viewer);
  - the deploy's stamp and module-graph steps, run on a copy, pass. Without the new sed line the guard fails, naming
    `js\app.js -> ./entry.js`.

### The old planner (`gen2-planner`): `cutover-redirect`, head `f82efc3`

Worktree `D:/Code Projects/GEN2 cutover/gen2-planner-main`.

- **The forward.** A script at the top of index.html, only on `gen2planner.jerrari3d.com`, sends everything to
  `PLANNER/?ws=build`. It carries `?build=`, `?ref=` and `?from=`, and the whole hash (`#build=`, `#labels-add=`,
  `#labels-open`). `?from=` is a store listing's attribution: the merged planner counts it, and its Parts list reads it for
  the store to link to when the visitor has not chosen one (through the viewer's `gen2-store`, then the address itself;
  2026-10-23, DECISIONS).
- **The last build.** An address with no build gets the build that browser had open last: the `gen2-last-build` slot, as
  `#build=`. Only a slot that holds a build goes: units placed, on a chosen mount and length.
  - The old planner writes the slot from its first page load. A fresh visit leaves an empty slot (`mount: null`, nothing
    placed).
  - The rule before 2026-10-17 forwarded any slot. An empty one then opened the merged planner on "Can't show this build
    yet". The loopback journey below found it.
- **Its base.** Main (`7beb165`) has not moved since 2026-10-13, so there was nothing to merge.
- **Checked:**
  - `npm test`: 416 tests, 414 pass, 1 skipped, 1 fail. The failure is C-pin-2, a vendored file compared with the drifted
    local Label Studio checkout; it fails the same on the untouched main checkout.
  - A loopback journey in headless Chrome. A fresh visit and a no-mount build forward plain. A real build (tabletop 185,
    four units) opens in Build identical, with `from:makerworld` counted.

### The old viewer (`gen2-visual-animator`): `cutover-redirect`, head `1991ad5`

Worktree `D:/Code Projects/GEN2 cutover/GEN2 Visual Animator`.

- **The forward.** The same script at the top of viewer/index.html, only on `gen2build.jerrari3d.com`. It sends
  everything to `PLANNER/?ws=assemble`, with `?build=`, `?ref=`, `?from=` and the hash.
- **What stays on the old viewer:** `?part=` (part previews on site pages built before the site's branch), `?embed=1` (the
  old planner's dock) and `?bench=`.
- **Its base.** Main's 2026-10-16 fix is merged in (`9ee345c`, the escaped bootFail message).
- **Checked:**
  - `npm test`: 463 tests, 454 pass, 7 skipped, 2 fail, with the planner checkout named (`GEN2_PLANNER_ROOT`). The two
    failures are checks against the drifted local EdgeLabel generator checkout, the same on the untouched main checkout.
  - The new `test/cutover-redirect.test.mjs`.
  - The loopback journey: a kit from a listing opens in Assemble, with `from:thangs` counted.

### The MODULITH site (`modulith-site`): `planner-cutover`, head `c0fac21`

Worktree `D:/Code Projects/MODULITH-cutover`.

- **`config.json`:** the planner at `PLANNER/?ws=build`, the kit gallery at `PLANNER/builds/`.
- **The part previews move with this branch.** The site's part pages iframe their 3D preview from the gallery's origin,
  so they become `PLANNER/?part=…&mode=preview`. That is why the front door keeps that address on the old viewer.
- **The links:** the kit pages' 3D guide at `PLANNER/?ws=assemble&build=`, the 8 template and instruction links, and the
  39 registry part images on the parts host.
- **The BOM artifact** comes from the merged planner (`BOM_SOURCE=merged`), re-vendored from `58ffafc`. Every kit's BOM
  rows came out unchanged; only the commit and the `bom.js` hash it pins moved.
- **Checked:** `npm test` passes in full (the registry, the build, the golden relationships, the validator, the runtime
  suite 546/0).
- **The branch was red until 2026-10-17.**
  - Its 2026-10-13 commits sent the links to `planner.modulith.systems` but left that host out of `test/validate.js`'s
    external allowlist (4019 errors).
  - `test/runtime.jsdom.js` still expected the part previews from `gen2build.jerrari3d.com`.
  - The allowlist now admits `planner.modulith.systems` and drops the two old hosts. The built site links neither any
    more, so a stray link is caught, as for edgelabel on 2026-10-10.
- **Two commits from the site's main ride along.** `4a8bc51` and `0c9d7e4` (2026-10-14) say "faceplate", not "plate", in
  40 sentences, and regenerate the registry. They are on the site's local main but not on its origin. Merging main
  brought them into `planner-cutover`, so the branch's push published them there, and merging the branch deploys them.

## Joey's calls

1. **The merge order.** Recommended below.
2. **The old planner's kill date.** It is the day the old planner's `cutover-redirect` merges: from then its address only
   forwards. The redirect carries the build that browser had open last, the only build the old planner keeps; its colours,
   parts ticks and store choice stay behind, since this origin cannot read the old one's storage (2026-10-21, above).
3. **GoatCounter: which counter the merged planner reports to.** It counts to `jerrari-build.goatcounter.com` today, the old
   viewer's counter, inherited with the viewer's index.html (the `data-goatcounter` tag at the bottom of index.html). The
   old planner counts to `jerrari.goatcounter.com`, the site to `jerrari-modulith`. The approved plan (2026-10-12, §1.6)
   had the merged planner count to `jerrari` and `jerrari-build` stop at cutover; that switch was never made, and this
   page said until 2026-10-17 that it already counted to `jerrari`, which was wrong. The two ways:
   - **Move it to `jerrari`** (the plan): one line in index.html. Planner 2.0 continues the old planner's dashboard, and the
     Assemble and part-preview events join it. Recommended: make the move on the kill date, when the old planner stops
     counting, so each dashboard holds one app at a time. `jerrari-build` then keeps only what still runs on
     `gen2build.jerrari3d.com` (part previews on site pages built before the site's branch, benchmark page loads) and can
     stop; note the date in both READMEs.
   - **Keep `jerrari-build`**: no change. Planner 2.0 continues the 3D Build Studio's dashboard, the `jerrari` series ends
     on the kill date, and the "stop `jerrari-build`" step goes.
4. **The Label Studio's own planner links** (its header's "Planner" and the planner it returns to when no `?return=` came
   along) still name `gen2planner.jerrari3d.com`. They keep working through the old planner's redirect; pointing them at
   `PLANNER` is a Studio deploy, with Joey's go.

## Order on the day (recommended)

1. (done 2026-10-13) The Studio knows the new address: `PLANNER_RETURNS` and `PLANNER_ORIGINS` carry
   `planner.modulith.systems` (public repo `modulith-label-studio`, deployed with Joey's go).
2. (done 2026-10-14) The custom domain on this repo's Pages, HTTPS enforced; Cloudflare CNAME `planner` →
   `jerrari12.github.io`, DNS only. `jerrari12.github.io/modulith-planner/` 301s to the domain, query string kept. No CNAME
   file in the repo: the site deploys through a workflow, so the domain lives in the Pages settings.
3. Merge this repo's `cutover-front-door` into main (it deploys). Check on the domain: the bare address opens Build,
   `/?part=185-case-2w-1h&mode=preview` draws the part, a `/builds/` card opens Assemble. It goes first because the site's
   branch sends its kit-gallery link to `PLANNER/builds/`, whose cards open the old viewer page until this merge.
4. Merge the site's `planner-cutover` (Cloudflare builds it): every site link, the kit gallery, the 3D guide and the part
   previews go to `PLANNER`. Before the redirects, so the site never sends a visitor through a forwarding hop. From then on
   re-vendor with `BOM_SOURCE=merged`; the old path and the env switch go after the day.
5. Merge the old viewer's `cutover-redirect`: `gen2build.jerrari3d.com` forwards to Assemble and keeps the part preview, the
   dock and the benchmarks.
6. The kill date: merge the old planner's `cutover-redirect`; keep the redirect for a year.
7. GoatCounter as decided (call 3; the recommended move goes with step 6).
8. Retire the relay (`js/relay-auth.js` and the `?embed=1` path) in a later commit, once nothing docks the old viewer.

## Also prepared, with the suite that says 2.0 is tested

`npm run e2e` (e2e/workspaces.mjs) drives every workspace, the store and the setup sheet in headless Chrome and blocks the
deploy beside the smoke test (2026-10-13). Its first runs found two real defects (the boot palette applied after the
store's baseline, so the first Undo dropped the colours; the switcher's reload losing a harness's debug flag), both fixed.
Since 2026-10-17 it also checks the front door on `cutover-front-door`.

## Dated blockers

- the domain decision: CLEARED 2026-10-13 (planner.modulith.systems).
- the Label Studio blocker: CLEARED 2026-10-13 (deployed; both the one-way and two-way paths are ready for
  planner.modulith.systems).
- cutover day and the kill date:

  ```
  blocked-on: Joey's hands-on pass of the merged planner (his rule: the cutover waits on it)
  blocked-since: 2026-10-13
  check-by: 2026-10-27
  ```

  Re-checked 2026-10-17: it still holds, and everything else the day needs is on the branches above. Re-checked
  2026-10-21: it still holds; the prep above is done.
- step 5, the old viewer's redirect (found 2026-10-21):

  ```
  blocked-on: the old viewer's main fails its own npm test (filament-db's count), so a merge into it does not deploy
  blocked-since: 2026-10-18
  check-by: 2026-10-27
  ```

## Not in the cutover

- The Done scene (the plan's 5b: rooms, cameras, lightmaps, bokeh) is its own rendering project after cutover; a static
  golden-hour hero shot first, when Joey and Astra want to direct it.
- The old planner's storage migration: `PLANNER` is a new domain, so nothing can be read across. The last build travels
  through the redirect (above); the colour stores, the tracker and the link store do not, and the dual-written slot on the
  new origin is unused until something else shares it. The old planner keeps no other builds (2026-10-21): an older one
  exists only as a file or a link a visitor kept, and opens here when this planner supports what it holds (not a
  cabinet, 2026-10-21 above).
- The kit gallery's own words still say GEN2 ("GEN2 starter kits", "GEN2 Planner"), and the share-image tool
  (`builds/banner.html`, for Printables descriptions) prints `gen2build.jerrari3d.com` as the short link, which keeps
  working through the old viewer's redirect. Renaming them is its own pass.
