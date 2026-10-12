# 1 · Verified capability inventory

**Checked:** 2026-10-11, against the code on production `main` of each repo, the live sites in a browser, the vault, and the handoff records. Analytics figures are GoatCounter event counts for the 30 days to 2026-10-11 (events, not unique people: one person can fire the same event several times).

**Tools** · **P** = Planner (gen2planner.jerrari3d.com, `7beb165`) · **S** = 3D Build Studio / viewer (gen2build.jerrari3d.com, `90a5960`) · **L** = Label Studio (labels.modulith.systems, `8ee5dba`) · **PP** = Part Picker (inside L) · **W** = MODULITH site (modulith.systems, `3dd40fc`).

**Status** · **LIVE** = on production today · **LOCAL** = built and tested in a worktree, not pushed (branch named) · **PLANNED** = in a plan, ticket or data flag, not built · **IDEA** = only in a brief or concept mockup.

**Source shorthand** · `P app:4530` = planner `js/app.js` line 4530 · `S main:5614` = viewer `viewer/js/main.js` · `L IH:3552` = Label Studio `index.html` · `W builds:270` = site `src/pages/builds.js` · vault = `D:\MODULITH\docs\knowledge\` · handoffs = `D:\MODULITH\handoffs\`.

---

## A · Starting a build

| What the user can do | Tool | Status | Depends on | Produces / changes | Saved or passed on | Known problems | Source |
|---|---|---|---|---|---|---|---|
| Choose where the storage will live: Under-Table, Tabletop or Wall Mount. Hanging mounts also ask for the workable area in mm. | P step 1 | LIVE | Nothing | Sets the mount. Switching later shifts the whole layout as a group to the new mount's edge; nothing else changes. | Autosaved (see H) | Cards are the first of a six-step vertical form. 30d picks: tabletop 269, under-table 174, wall 91. | `P index:131`, `P data:223-253`, `P app:335` |
| Choose a printer (35 presets or a custom bed) and the build-plate finish. | P step 2 | LIVE | Nothing | Sizes whose case won't fit the bed are greyed with the reason; the plate finish shows in 3D. | Autosaved. Not shared with the site, which keeps its own printer choice. | Two printer preferences exist (planner and site) and do not sync. "Any printer / not sure" is the default. | `P index:137-176`, `W components:346` |
| Choose the depth ("length"): 59 / 115 / 165 / 185 / 240 / 270, with an "Unsure which length?" explainer and a 185 recommendation. | P step 3 | LIVE | Printer (greys depths that won't fit) | Sets the collection. Every unit in a build shares one depth. | Autosaved | The planner says "length"; the site says "depth". Mixed-depth builds are not offered. 30d: 185 207, 240 162, 270 82, 165 78, 115 58, 59 30. | `P index:183-199`, vault system-overview |
| Load an example layout (3 drawers; 6 on a tabletop) that adapts to the mount, depth and printer. | P step 4 | LIVE | Mount, depth, printer | A placed layout the user can edit. | Autosaved | Button is small and sits under the palette; 56 uses in 30d. | `P app:1940` |
| "Surprise me": a random but always-valid layout. | P step 4 | LIVE | Same | A placed layout. | Autosaved | 107 uses in 30d, about twice the example. | `P app:1990` |
| Start from a predesigned build. Ten tabletop kits (five depths × 2W-2H or 3W-2H) open preloaded in the planner from the site's build pages, and from the 3D Studio's cover ("Customize this build"). | W /builds/, S cover | LIVE | A kit id | The planner opens with that layout, drawer type, closure and faceplate set. | The planner mints a new build id; the kit is a template. | No under-table or wall kits (drafts exist in the viewer's gitignored `lab/`). The 3D Studio gallery cards have no "Open in the Planner" button; the site cards link only to the build page. | `W builds:270,317`, `S main:5614-5638`, `S builds/index.json` |
| Start fresh: wipe the saved session and every choice. | P reset bar | LIVE | A placed layout | Clears the autosave slot and the dock preference. | — | 20 uses in 30d. | `P app:4253`, `P index:126` |
| First-run help: "New to MODULITH? Three things to know", a per-mount tip line, info tips on headings, the length explainer. | P step 4 | LIVE | — | — | Primer collapse remembered (`gen2-primer-collapsed`). | Help is text inside the form; the 3D view does not teach. | `P index:205-226` |

## B · Laying out the build on the 2D board

| What the user can do | Tool | Status | Depends on | Produces / changes | Saved or passed on | Known problems | Source |
|---|---|---|---|---|---|---|---|
| Pick what fills a case (Classic Drawer, Decor Drawer, Shelf, Cabinet) and a size (drawers 1W–4W × 0.5H–3H; shelves and cabinets stack extenders to 6H). Sizes that won't fit the bed are greyed with a reason; sizes that don't exist are gaps. | P palette | LIVE | Printer, depth | The armed size. | — | Cabinets are "coming soon" in the palette and blocked in 3D. 30d fill picks: classic 240, decor 185, shelf 169, cabinet 110. | `P index:252-262`, `P data:83-110`, vault decisions "3W-3H" |
| Place a unit by clicking a cell; drag to move; click to select; nudge with the arrow pad or keyboard; remove with the toolbar button. Touch: drag with a finger, tap to select. | P board + unit toolbar | LIVE | An armed size | A placed unit. | Autosaved; posted live to the docked 3D view. | **Joey's feedback: the grid feels unnatural and clunky; moving and removing units is hard.** The selected unit's controls live in a separate toolbar under the board, not at the unit. | `P index:317-391`, `P app:6195-6260` |
| Resize the grid (W and H; tabletop height is automatic). On hanging mounts the workable area caps the grid. | P | LIVE | Mount | Grid bounds. | Autosaved | Two different mechanisms (buttons vs mm inputs) for one idea. | `P index:266-282`, `P index:228-245` |
| See validity as you build: red warnings for floating or unsupported units, sag risk, illegal sizes, wall 0.5H top row; "Fix structure" repairs it; an orange completion guide hatches the cells a tabletop needs to be level. | P board | LIVE | The layout | Warnings; a repaired layout. | — | The same rules gate the 3D button, so a "blocked" state is common: 244 unsupported, 62 sag, 49 cabinet, 17 wall-0.5H blocked events in 30d against 428 builds started. | `P app:4530-4563`, `P app:4627`, `P js/tabletop-completion.js` |
| Convert a drawer between Classic and Decor in place: one unit, all units, or "Convert all N" offered when picking the other family in the palette. | P | LIVE | Catalog legality and bed fit | Changed fills; BOM, link, 3D follow. | Autosaved | Three surfaces for one action (built from a friend's rebuilt-layout episode). 30d: 102 + 90 single, 154 bulk. | planner CLAUDE.md 2026-08-23, `P index:479-484` |
| Per-unit options on the selected unit: closure (magnets / none), stoppers, fill, Gridfinity drawer body, shelf lip, cabinet interior editor (Simple/Advanced, shelf count). | P unit toolbar | LIVE | A selected unit | Unit fields. | Autosaved; posted to 3D. | Toolbar only; nothing at the unit itself. The interior editor is a bottom sheet on phones. | `P index:338-418` |
| Undo / redo (50 steps over the whole build). | P | LIVE | — | — | Each step autosaves. | — | `P app:2330-2420` |
| Read the footprint (W × H × D in mm), unit count, and the unit legend (1W = 88 mm, 1H = 56 mm). | P board meta | LIVE | — | — | — | — | `P index:420` |

## C · Seeing the build in 3D

| What the user can do | Tool | Status | Depends on | Produces / changes | Saved or passed on | Known problems | Source |
|---|---|---|---|---|---|---|---|
| A docked live 3D preview opens beside the planner the first time the build is valid; collapse, expand, resize, or pop it out to a "Full studio" tab that stays linked. | P dock + S embed | LIVE | Window ≥ 1200 px; a valid build | Live 3D of the layout. | Dock state and width remembered (`gen2-dock`, `gen2-dock-w`). | Below 1200 px there is no dock, only a floating "3D Build Studio" button that opens a new tab. 30d: dock revealed 228, collapsed 111, popped out 78. | `P app:4104-4239`, `P css:751` |
| Orbit and zoom; tap a part to identify it (name, quantity, download links); measure in mm between two points; open a drawer to see inside; dimension callouts. | S | LIVE | A loaded build | — | — | Taps are ignored on the cover and outro. | `S index:97-163`, `S main:7373-7807` |
| See an unfinished tabletop as ghost boxes while columns are uneven. | S | LIVE | Tabletop | — | — | Tabletop only. | `S generate:965-982` |
| Quality tiers (Very High / High / Balanced / Fast, with silent auto-downgrade) and the theme (dark "retro" room vs the colour-accurate light stage). | S | LIVE | — | — | `gen2-quality`, `gen2-theme` (theme relayed from the planner). | Quality pill hidden under 560 px. | `S main:559-616`, `S main:406-531` |
| The 3D view cannot add, move or remove units; the layout is owned by the planner and flows one way. | S | LIVE (by design) | — | — | — | Joey's direction (a 3D-led workspace with equal placement actions in 2D and 3D) is not supported by the current protocol. | `S main:8613-8690`, handoffs placement plan |
| Build types the 3D view refuses: under-table 59, cabinets (no door/hinge/latch models), more than 80 units, unsupported or sagging layouts. | S + P gate | LIVE | — | A "fix the build" reason shown under the 3D button. | — | See the block counts above. | `P app:4530`, `S generate:645-986` |

## D · Customizing appearance and options

| What the user can do | Tool | Status | Depends on | Produces / changes | Saved or passed on | Known problems | Source |
|---|---|---|---|---|---|---|---|
| Build-wide choices: drawer type; Decor faceplate style (Essential, Classic, EdgeLabel, Classic Pro, Chevron; Club-only ones say so); handle style (Deco, BlockBar, Crystal); cabinet door style; closure and stopper masters; feet (print TPU / buy adhesive); wall cover stagger; faceplate back cover; shelf lip (240/270). | P step 5 + cover panel | LIVE | A layout; the mount | Part names, links and quantities in the BOM; the 3D model. | Autosaved; in the share link; posted to 3D. | The same options also appear in the 3D Studio's "Build options" with different wording and order; changes made there are relayed back to the planner. Faceplate style is build-wide only (per-unit style was deliberately not built). 30d: EdgeLabel 115, Classic 91, Classic Pro 85, Chevron 81, Essential 70. | `P index:473-512`, `S main:5097-5241` |
| Pick a filament per part type or zone from a brand catalogue (Polymaker, Elegoo, Printed Solid, ERYONE…), four one-click presets plus "My palette", switch between instruction colours and your colours, download or upload a colours file. | S only | LIVE | A loaded build | The 3D look; "Shop filament" affiliate links. | `gen2-colors:<slot>` on the viewer's origin, relayed to the planner. **The slot for any planner hand-off is one shared `custom-build` key, so colours are per browser, not per build.** Not in the build file or share link. | Colours are not part of the build record. Hardware cannot be recoloured. Screen colours approximate on the dark stage. 30d: ~93 preset picks, 10 brand picks. | `S main:6424-6748`, `S main:6509-6537` |
| Build-plate finish (powder / smooth / holographic) and translucent filaments rendered. | P step 2, S | LIVE | — | — | In the build. | Holographic is simulated. | `S main:5200-5216`, `S see-into.js` |
| Side Covers: released on Printables/Thangs (27 sizes, 2026-10) but the planner still lists them unreleased and has no toggle. | P | PLANNED | — | — | — | Kit piece counts wait on the planner row. | site `TICKET-side-covers-2026-10-10.md`, `P data:582` |
| Cabinets (door, hinge, latch), Push-Click closure. | P | PLANNED ("soon") | — | — | — | Palette shows them; BOM lists them; 3D refuses them. | `P data:107,537,582` |

## E · Labels

| What the user can do | Tool | Status | Depends on | Produces / changes | Saved or passed on | Known problems | Source |
|---|---|---|---|---|---|---|---|
| Labels tray under the board: add a labels file, see waiting labels, tap a label then a drawer to assign it, see placed labels, undo, download the words. | P | LIVE (since 2026-10-10) | Decor drawers with an EdgeLabel or Classic Pro faceplate | `labelList` + `labelAssign` in the build. | Autosaved; in the share link; mirrored to 3D. | **Joey's feedback: after "Add to planner build" he could not find how to put labels on drawers; the 3D view had no way at all.** | `P index:322-335`, `P app:3519`, handoffs placement plan |
| Labels panel replacing the tray: select a drawer first then click a label; "Place several"; Replace dialog; "Fill empty drawers…" with preview; Undo with "Last change"; panel beside the board or under it; "Make labels" and "Part Picker" buttons. | P | LOCAL `label-place` `d8fc6f5` | Same | Same record | Same | Built by the other session; headed checks pass; nothing pushed. On a narrow desktop the panel can cover the board's right drawers. | handoffs `label-release/placement/PLACEMENT-PLAN.md` |
| 3D Labels panel: labeling mode, tap any part of a drawer, hover preview, "Place your N labels" on the cover; every placement is asked of the planner; read-only when standalone. | S | LOCAL `label-place` `54a9ade` | A planner tab that announces `labelPlace` | Requests to the planner | The planner stays the record. | Standalone 3D cannot place (by decision). | same |
| Edit a drawer's words (≤40 chars) and icon (auto / none / letters / 32-icon catalog / uploaded SVG) from the 3D identify card; set-wide text size, depth, icon size, bold, caps, prediction. | S | LIVE | A Decor drawer with a label-carrying faceplate | `buildOptions` relayed to the planner. | In the build. | Classic Pro has no editor. Only Decor units carry labels. | `S index:108-141`, `S main:5046-5089, 7388+` |
| Label Studio: type one label per row; icons, letters, uploads, prediction; presets; stripes (metric blue / SAE red + four colours); EdgeLabel or Classic Pro; 13 printer presets; 3MF for PrusaSlicer or Bambu/Orca, or STL; CSV/TXT import; save and open set files. | L | LIVE | — | Print files; a label set. | Autosave (one current set), one "Previous set", "Moved labels"; set file download. | One set per browser, no names. Dropping a CSV replaces the list. Classic Pro's old address not moved yet. | `L IH:519-706`, handoffs `LAUNCH-GO-NO-GO` |
| Linked editing: the planner's "Label Studio" button opens a job for this build; Send back → review in the planner → Apply. Unlinked: "Add to planner build" sends a label list into the tray. | P ↔ L | LIVE | An EdgeLabel faceplate; the planner tab open | Label list changes in the build. | Linked session per tab. | Uploaded and icon-only labels and stripes do not fully round-trip; part labels cannot enter a linked list; a stale planner tab shows "Not connected". 30d: Label Studio opened from the planner 17 times. | `L label-link.js`, `L IH:3552-3609, 3719-3867`, vault repo-map |
| Part Picker: choose screws, nuts, washers, inserts by family, type and thread; pin which fields print; photo; colour scheme; "Add part labels" (≤200) into the Label Studio list. | PP | LIVE | — | Part-label rows with a part record. | Picker list in its own storage. | Two columns need ~1,124 px. Done could drop picks (fixed on `label-place`). | handoffs `part-picker/PICKER-V1-REPORT.md`, `L IH:761-770` |
| The data model keeps four things apart: a part's identity (part record), label content (words), label appearance (badge, stripes, set-wide style), and drawer assignment (`labelAssign`). | P format | LIVE | — | — | Planner build; label set files; linked rows. | Part identity does not survive into a Label Studio set file; assignment never leaves the planner. | handoffs `label-release/LABEL-LIST-FORMAT.md` |

## F · Parts list (BOM) and files

| What the user can do | Tool | Status | Depends on | Produces / changes | Saved or passed on | Known problems | Source |
|---|---|---|---|---|---|---|---|
| Read the exact parts list: every printable part with quantity, thumbnail and a download button on the preferred model site (Printables, Thangs, MakerWorld); every bought item with Amazon links; "required / optional" scope; a "your build is ready" headline with piece count and dimensions; mount hardware estimates. | P step 6 | LIVE | The whole build | The BOM. | Recomputed from the build; never stored separately. | **Joey: the BOM is incredibly useful after the build.** It is the longest block on the page and sits at the very bottom. Requirement scopes (core / option / enhancement) are only partly migrated. 30d: 246 Printables, 41 MakerWorld, 22 Thangs download clicks. | `P app:5157 computeBom`, `P app:5660`, planner CLAUDE.md banner |
| "Track my build": a done checkbox per row with "N of M pieces done". | P | LIVE | — | Progress. | `gen2-bom-tracker`, **keyed by part name across every build in the browser, not per project.** | A second build inherits the first build's ticks for same-named parts. 38 turn-ons in 30d. | `P app:5608-5615` |
| Copy as text, download CSV, print, save a build image, download labels as text, choose the model site. | P | LIVE | — | Files. | — | 30d: CSV 24, image 34. | `P index:524-531` |
| 3D Studio parts list ("Parts to print") with copy and CSV, store preference, paid-link disclosure. | S | LIVE | — | Files. | `gen2-store` relayed. | A second copy of the BOM with different formatting. | `S index:73-95`, `S main:5444-5481` |
| Download a whole starter kit as one bundle. | S gallery, W | LIVE | A kit | Marketplace bundle page. | — | Tabletop kits only. | `S builds/index.html:457-529` |
| Site part pages: each part's files on every store, access tier (free / Club / purchase), printer-fit verdict, "used in these builds", related parts. | W | LIVE | Registry | — | Site printer choice (`modulith-printer-v1`). | Not linked from the planner's BOM rows (rows link to the stores directly). | `W part.js:93-125, 254-313` |
| Site build pages: the kit's BOM with scopes; the homepage "Start small, expand later" keep / add / result delta for the 185 pair. | W | LIVE (delta: homepage only) | Vendored kit BOMs | — | — | The delta idea (what to keep, what to print to expand) exists only for one pair, on the homepage. | `W builds:271-327`, `W build-delta.js`, `W home-html.js:143-190` |

## G · Assembly instructions

| What the user can do | Tool | Status | Depends on | Produces / changes | Saved or passed on | Known problems | Source |
|---|---|---|---|---|---|---|---|
| Follow step-by-step 3D assembly built for this exact layout: cover → exploded parts → numbered steps → outro; pause, slow-mo, replay, skip to the finished build; step dots and arrow keys. | S | LIVE | A build the generator accepts | — | — | 30d: 139 starts, 94 completes, 38 skips. Editing and instructions are separate modes. | `S index:211-294`, `S main:5483-5742` |
| Read written guides on the site: 13 guides (hanging, wall mount, tabletop, under-table, connect, shelves, Decor fronts, printing, creating labels, cover size adapter, open bin drawer; reconfigure and troubleshooting hidden). | W | LIVE | — | — | — | The planner's mount cards still link instructions through the old jerrari3d.com addresses (redirected). No per-build link to the matching guide. | `W instructions.js`, `P data:229-248` |
| "Send to phone" / instructions beside the physical build. | — | IDEA | — | — | — | Only in Joey's concept mockup. The share link and kit link are the only ways to move a build to a phone today. | concept artifact `8C4Koq4pRY9pDo7os6LVo7` |

## H · Saving, reopening, sharing, moving between devices

| What the user can do | Tool | Status | Depends on | Produces / changes | Saved or passed on | Known problems | Source |
|---|---|---|---|---|---|---|---|
| Come back to the build you left: one autosave slot per browser, restored on the next visit when the board is empty and no link is open. | P | LIVE | Browser storage | — | `gen2-last-build`, written on every history step. | **One slot = one project.** Starting another build overwrites it silently. Private mode has none. Resume fired fewer than 10 times in 30 days against 936 visits. | `P app:2368-2374`, `P app:6821-6824` |
| Save the build as a file and load it back ("SAVE" / "LOAD"). | P | LIVE | — | `gen2-185-tabletop-build.json` (`{gen2Build:1, data}`) | A download. | No name prompt; the file name is mount + depth, so two saves collide. 30d: 40 saves, 12 loads. | `P app:2451-2496, 4275` |
| Copy a share link that carries the whole build (base64 JSON in `#build=`), including labels. | P | LIVE | — | A URL. | The link drops from the address bar after the first edit. | Fewer than 10 uses in 30d. Long builds can exceed the limit ("too big"). | `P app:2502-2540, 2767` |
| Open a kit by permanent link (`?build=<id>`), "Copy link to this kit". | S | LIVE | — | — | — | Kits only. | `S main:5640-5690` |
| Keep label sets: autosave, Previous set, Moved labels, set files; a linked session per tab. | L | LIVE | — | — | See E. | No names; one current set. | `L IH:3021-3371` |
| Keep colours: a colours file; presets. | S | LIVE | — | — | See D. | Per browser, not per build. | `S main:6706-6732` |
| Named projects; several projects side by side; a project switcher; reopen on another device; a backup you can trust. | — | IDEA | — | — | — | Nothing exists. Joey's concept shows "Garage bench build ▾" and "Open a saved build instead". Browser storage is the only automatic memory and it is one slot. | concept artifact; this inventory |

## I · Help, feedback and measurement

| What the user can do | Tool | Status | Depends on | Produces / changes | Saved or passed on | Known problems | Source |
|---|---|---|---|---|---|---|---|
| "Feedback & support" dialog in every tool: Get help / Report a problem / Suggest an improvement, with an email draft or copied message; optional build link. | P, S, L, PP | LIVE (2026-10-10) | — | An email the user sends. | — | Nothing is collected automatically; replies arrive by mail. Site version is on an unreleased branch. | `P js/modulith-feedback.js`, site branch `feedback-support` |
| Short videos for faceplates and units (modal). | P | LIVE | — | — | — | — | `P index:583-593` |
| Usage dashboard (local only): planner and studio funnels, blocked layouts, failures. | S `stats/` + local proxy | LIVE (dev) | A token on this machine | — | — | Numbers never leave the machine. | `S serve-stats.py` |

## J · Phone and touch

| What the user can do | Tool | Status | Depends on | Produces / changes | Saved or passed on | Known problems | Source |
|---|---|---|---|---|---|---|---|
| Use the planner on a phone: one long column; touch drag and tap on the board; the interior editor as a bottom sheet; a floating "3D Build Studio" button that opens the viewer in a new tab. | P | LIVE | — | — | Same autosave. | No docked 3D under 1200 px. The parts list is very long on a phone. No way to hand the build to a computer other than the share link or the file. | `P css:751-779, 1728-1826`, `P app:6195` |
| Use the 3D Studio on a phone: bottom sheets for parts, identify and filament; step note pinned on top. | S | LIVE | — | — | — | Quality pill hidden. | `S css/viewer.css:954-1057` |
| Use the Label Studio on a phone: preview on top, download bar pinned to the bottom, icon names shown under icons. | L | LIVE | — | — | — | Safari/iOS untested. | `L IH:226-341` |
| A phone layout designed for the workspace (chip bar for mount/depth/printer, Edit/3D switch, Add/Edit/Parts bottom sheet). | — | IDEA | — | — | — | Joey's concept mockup only. | concept artifact `Phone.dc.html` |

---

## What I could not verify

- Whether the planner's local checkout equals live `7beb165` byte for byte: the vault's launch record says the served files were byte-compared on 2026-10-11; I trusted that record.
- Whether a saved build's colours ever reach the share link: I found no colour fields in `serializeBuild`'s documented fields; treat "colours are per browser" as read from the viewer's storage code, not from a live test.
- Safari and iOS behaviour anywhere: every recorded check used Chrome.
- The exact number of share-link and resume events: both are below the analytics API's top-100 cut-off, so "fewer than 10 in 30 days" is an upper bound.
