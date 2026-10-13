# Cutover: the merged planner replaces gen2planner and gen2build

Drafted 2026-10-13, after the setup sheet. Every workspace and the store from the plan are in place; what is left is
moving the public addresses over and retiring the two old apps. Nothing here runs without Joey's go.

## Decisions Joey still owns

1. **The domain.** The plan's §5.3 asked: `gen2planner.jerrari3d.com`, `gen2build.jerrari3d.com`, or a path on
   `modulith.systems`. Everything below assumes ONE address, called `PLANNER` here. Recommended: `planner.modulith.systems`
   (the Label Studio already lives at `labels.modulith.systems`; the old planner and viewer addresses then redirect).
2. **The parts host's domain** (`parts.jerrari3d.com` was the plan's name; the GLBs serve from `jerrari12.github.io/gen2-parts`
   today with `Access-Control-Allow-Origin: *`). Optional; the Pages address works.
3. **The kill date** for the old planner's deploys (the plan: weekly bump PRs until then; none have been needed).

## What has to change, by repo

| where | change | when |
|---|---|---|
| `modulith-planner` (this repo) | CNAME for `PLANNER`; `config.js` PARTS_BASE if the parts domain moves; the default page = `?ws=build` (today the bare page is still the old viewer for the goldens); GoatCounter: the union vocabulary counts to `jerrari.goatcounter.com` already, so only the viewer's `jerrari-build` site stops | cutover day |
| the Label Studio (`labels.modulith.systems`) | `?return=` honoured so "Add to planner build" comes back to the planner that opened it, matched against the planners' EXACT paths (`PLANNER_RETURNS`: the old planner and `https://jerrari12.github.io/modulith-planner/` for the overlap; `PLANNER` joins at cutover). The postMessage origin list (`PLANNER_ORIGINS`, the two-way job protocol) gains `PLANNER` only at cutover: a Pages origin would admit every Pages site of the account (Terra 01a135bc). Prepared on branch `planner-return` in the Studio worktree | before cutover, Joey deploys |
| the old planner (`gen2planner.jerrari3d.com`) | a redirect page: `#build=…` → `PLANNER/?ws=build#build=…`, a bare visit → `PLANNER/`, `#labels-add=` kept | cutover day, keep the redirect for a year |
| the old viewer (`gen2build.jerrari3d.com`) | a redirect page: `?build=<kit>` → `PLANNER/?ws=assemble&build=<kit>`, `?part=` → kept as the part preview if the site still embeds it (check `MODULITH/src` first), `#build=` → `PLANNER/?ws=assemble#build=…` | cutover day |
| the MODULITH site | links to the planner and the viewer (`src/pages/builds.js`, the kit cards, the instructions pages); `tools/vendor-build-boms.mjs` switches its source to this repo's `js/rules/bom.js` + `js/catalog/data.js` (the parity test `test/parity/site-boms.test.mjs` already proves the two agree on every kit) | cutover day |
| the Part Picker and the Label Studio's links | "Open in the planner" addresses | with the Studio deploy |

## Order on the day

1. Deploy the Studio with the new origin (prepared; it is harmless before the move).
2. Set the CNAME on this repo's Pages; wait for the certificate.
3. Deploy the redirect pages to the old planner and the old viewer.
4. Switch the site's links and the BOM vendoring source; re-vendor and deploy the site.
5. Stop the `jerrari-build` GoatCounter site; note the date in both READMEs.
6. Retire the relay (`js/relay-auth.js` and the `?embed=1` path) in a later commit, once nothing embeds the old viewer.

## Dated blockers

- `blocked-on: the domain decision (above, 1)` · `blocked-since: 2026-10-13` · `check-by: 2026-10-27`
- `blocked-on: the Label Studio honouring the merged app's return address (one-way) and, at cutover, its origin (two-way)` · `blocked-since: 2026-10-13` · `check-by: 2026-10-27`
  (the one-way fix is on branch `planner-return` in `D:/Code Projects/GEN2 label-types/GEN2 EdgeLabel Label Generator`; it
  waits for Joey's deploy; the two-way origin waits for the domain)

## Not in the cutover

- The Done scene (the plan's 5b: rooms, cameras, lightmaps, bokeh) is its own rendering project after cutover; a static
  golden-hour hero shot first, when Joey and Astra want to direct it.
- The old planner's storage migration (its `gen2-last-build` slot, colour stores, tracker, link store) can only run once the
  merged app serves from the old planner's domain; if `PLANNER` is a new domain, there is nothing to migrate and the
  dual-written slot is unused. Say so in the redirect page: "Your builds stay in the old planner's browser storage; save a
  file there and load it here."
