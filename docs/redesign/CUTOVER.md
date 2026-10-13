# Cutover: the merged planner replaces gen2planner and gen2build

Drafted 2026-10-13, after the setup sheet. Every workspace and the store from the plan are in place; what is left is
moving the public addresses over and retiring the two old apps. Nothing here runs without Joey's go.

## Joey's decisions (2026-10-13)

1. **The domain: `planner.modulith.systems`** (`PLANNER` below). The old planner and viewer addresses redirect to it.
2. **The parts host** (the GLBs and part thumbnails, `jerrari12.github.io/gen2-parts`, not the Part Picker): stays on its
   Pages address; no domain of its own. (Joey asked whether it could ride under the label generator; the Part Picker already
   does, the model files are a different thing and need no address of their own.)
3. **The kill date** for the old planner: set once the merged planner is reliable and well tested as "MODULITH planner 2.0",
   not before. Until then both apps stay up and the redirects wait.

## What has to change, by repo

| where | change | when |
|---|---|---|
| `modulith-planner` (this repo) | CNAME for `PLANNER`; `config.js` PARTS_BASE if the parts domain moves; the default page = `?ws=build` (today the bare page is still the old viewer for the goldens); GoatCounter: the union vocabulary counts to `jerrari.goatcounter.com` already, so only the viewer's `jerrari-build` site stops | cutover day |
| the Label Studio (`labels.modulith.systems`) | `?return=` honoured so "Add to planner build" comes back to the planner that opened it, matched against the planners' EXACT paths (`PLANNER_RETURNS`: the old planner and `https://jerrari12.github.io/modulith-planner/` for the overlap; `PLANNER` joins at cutover). The postMessage origin list (`PLANNER_ORIGINS`, the two-way job protocol) gains `PLANNER` only at cutover: a Pages origin would admit every Pages site of the account (Terra 01a135bc). DEPLOYED 2026-10-13 (public repo `modulith-label-studio` main d53b9dfe, from branch `planner-return` 64e9a53b; Joey asked for the deploy while away): both lists already carry `planner.modulith.systems`, so the cutover needs no further Studio deploy | done |
| the old planner (`gen2planner.jerrari3d.com`) | a redirect page: `#build=…` → `PLANNER/?ws=build#build=…`, a bare visit → `PLANNER/`, `#labels-add=` kept | cutover day, keep the redirect for a year |
| the old viewer (`gen2build.jerrari3d.com`) | a redirect page: `?build=<kit>` → `PLANNER/?ws=assemble&build=<kit>`, `?part=` → kept as the part preview if the site still embeds it (check `MODULITH/src` first), `#build=` → `PLANNER/?ws=assemble#build=…` | cutover day |
| the MODULITH site | links to the planner and the viewer (`src/pages/builds.js`, the kit cards, the instructions pages); `tools/vendor-build-boms.mjs` switches its source to this repo's `js/rules/bom.js` + `js/catalog/data.js` (the parity test `test/parity/site-boms.test.mjs` already proves the two agree on every kit) | cutover day |
| the Part Picker and the Label Studio's links | "Open in the planner" addresses | with the Studio deploy |

## Order on the day

1. (done 2026-10-13) The Studio knows the new address.
2. Set the CNAME on this repo's Pages; wait for the certificate.
3. Deploy the redirect pages to the old planner and the old viewer.
4. Switch the site's links and the BOM vendoring source; re-vendor and deploy the site.
5. Stop the `jerrari-build` GoatCounter site; note the date in both READMEs.
6. Retire the relay (`js/relay-auth.js` and the `?embed=1` path) in a later commit, once nothing embeds the old viewer.

## Dated blockers

- the domain decision: CLEARED 2026-10-13 (planner.modulith.systems).
- the Label Studio blocker: CLEARED 2026-10-13 (deployed; the return address works now for the Pages address, and both the
  one-way and two-way paths are ready for planner.modulith.systems the moment it resolves).

## Not in the cutover

- The Done scene (the plan's 5b: rooms, cameras, lightmaps, bokeh) is its own rendering project after cutover; a static
  golden-hour hero shot first, when Joey and Astra want to direct it.
- The old planner's storage migration (its `gen2-last-build` slot, colour stores, tracker, link store) can only run once the
  merged app serves from the old planner's domain; if `PLANNER` is a new domain, there is nothing to migrate and the
  dual-written slot is unused. Say so in the redirect page: "Your builds stay in the old planner's browser storage; save a
  file there and load it here."
