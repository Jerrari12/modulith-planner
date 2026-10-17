# Cutover: the merged planner replaces gen2planner and gen2build

Drafted 2026-10-13, after the setup sheet. Brought up to date 2026-10-17: the three prepared branches are current with
their bases, and this repo has a branch for its front door. Their suites show nothing new: the site's and this repo's
pass in full, and the old apps keep only the cross-checkout failures their untouched mains have too (below). What is
left is merging them and retiring the two old apps. Nothing here runs without Joey's go.

## Joey's decisions

1. **The domain: `planner.modulith.systems`** (`PLANNER` below), 2026-10-13. The old planner and viewer addresses redirect
   to it.
2. **The parts host** (the GLBs and part thumbnails, `jerrari12.github.io/gen2-parts`, not the Part Picker), 2026-10-13:
   stays on its Pages address; no domain of its own. (Joey asked whether it could ride under the label generator; the Part
   Picker already does, the model files are a different thing and need no address of their own.)
3. **The kill date** for the old planner: set once the merged planner is reliable and well tested as "MODULITH planner
   2.0", not before (2026-10-13). Cutover day and the kill date stay undetermined until Joey's own hands-on testing
   (2026-10-14). Until then both apps stay up and the redirects wait.

## Ready on branches (2026-10-17): nothing merged, nothing deployed

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
  `#labels-open`). `?from=` is a store listing's attribution: the merged planner counts it, and seeds the store choice from it.
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
   forwards. The redirect carries the build that browser had open last; an OLDER build has to be saved as a file in the old
   planner before that day and loaded here, since this origin cannot read the old one's storage.
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

  Re-checked 2026-10-17: it still holds, and everything else the day needs is on the branches above.

## Not in the cutover

- The Done scene (the plan's 5b: rooms, cameras, lightmaps, bokeh) is its own rendering project after cutover; a static
  golden-hour hero shot first, when Joey and Astra want to direct it.
- The old planner's storage migration: `PLANNER` is a new domain, so nothing can be read across. The last build travels
  through the redirect (above); the colour stores, the tracker and the link store do not, and the dual-written slot on the
  new origin is unused until something else shares it. A visitor who wants an OLDER build from the old planner saves a file
  there and loads it here, which the old planner still offers until its kill date.
- The kit gallery's own words still say GEN2 ("GEN2 starter kits", "GEN2 Planner"), and the share-image tool
  (`builds/banner.html`, for Printables descriptions) prints `gen2build.jerrari3d.com` as the short link, which keeps
  working through the old viewer's redirect. Renaming them is its own pass.
