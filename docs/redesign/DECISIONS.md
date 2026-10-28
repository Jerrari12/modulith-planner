# Redesign decisions

Dated calls made while building, with who made them. The brief and the inventory stay the source for everything not listed here; where a line below changes the brief, it says so.

## 2026-10-12

- **Build screen first.** Joey chose Astra's option over the plan's Assemble-first order: one complete Build screen over the unchanged renderer as the first visual milestone. Phase order after it resumes as approved: Assemble, Parts, Build (rules), Colors, Labels.
- **Five workspace tabs, unnumbered.** The brief's §2 says four and its §0 (and the inventory) five. Astra: keeping Colors is reasonable because trying filament combinations is an explicit return journey. Scope rule: Build style changes physical options, Colors changes appearance; quick colour edits stay reachable from a selection.
- **The setup sheet is optional.** First run only; returning builds and shared links skip it; the top-bar chips reopen it. Nothing mandatory comes back (Astra, Joey's inventory).
- **Product previews must be product-faithful.** Changes the brief's §3 rule "never use pre-rendered photos as option icons." The requirement is accurate previews that follow the configuration; generated SVGs or rendered images are implementation choices. Target, per Astra: faceplate selectors and the inspector preview show the actual model geometry at the selected size, with the current faceplate, handle and label colours and treatment, derived from the viewer's own GLB assets, rendered once and cached as thumbnails (Astra's words: a front view for comparing styles, a slight three-quarter view where depth or grip shape matters). The glyphs shipped in the Build screen are temporary. Size-picker icons may stay simplified but must keep the 88:56 physical proportions. Do not hand-draw a second approximation of every faceplate. Scheduling (Claude's proposal, not yet Joey's call): investigate rendering and caching when the Build rules (phase 3) or Colors (phase 4) are scheduled, whichever comes first.
- **Fonts are self-hosted.** Archivo, IBM Plex Sans and IBM Plex Mono, latin subsets, under the Open Font License, fetched by `tools/fetch-fonts.mjs` with Joey's OK.
- **The workspace's dark stage is `night`** (Claude's implementation choice for Astra's "quiet the dark grid"; accepted in her review of the second pass). The viewer's dark stage with a quieter grid and half the reflection, so the product is the focal point under the glass chrome. The plain viewer keeps `dark`.
- **The inspector's band is reserved at wide widths** (Claude's implementation choice, after Sol's review 01a13226 and Astra's "keep ordinary selection from resetting a user-adjusted camera"). So selecting a unit never moves the camera and a wide build never sits under the inspector; below 1280 px the band counts only while the inspector is up and the library collapses to its rail instead.
- **Selection is a two-rim outline** (Claude's implementation choice for Astra's "make selection unmistakable"; accepted after the off/on pair). White inner, orange outer, around the whole unit, because the viewer's emissive highlight disappears under a chosen filament and a single orange rim disappears against orange filament.
- **The Build screen is a visual preview until phase 3** (Astra: "Clearly identify this as a visual preview while core editing actions remain unavailable"; the marking is Claude's). Placing, moving and removing units, per-unit type, Peek inside, Duplicate, Remove, the 2D board and the issue card are marked with tooltips and toasts, not hidden. A PREVIEW badge in the bar says so.
- **Checkpoint accepted** (Astra, after the third pass): framing, selection and callouts judged adequate; carry accurate product previews forward as an explicit requirement; no further visual-system expansion before the next phase's work.

## 2026-10-13

- **Done means "End of instructions."** (Astra, reviewing phase 1.) The Assemble workspace ends on the finished step's own fitted view of the whole assembly, never on the viewer's outro cinema; the player says "End of instructions." and offers Share. Rooms, cameras and Save image stay with the Done scene (5b); unavailable scene controls are not shown.
- **Step marks are playback position, not completion.** A step before the current one shows its number muted, never a check. "Mark as built" and project progress belong to the Parts workspace and stay apart from where the player is.
- **The assembly step survives a trip to another workspace.** The router keeps a memo per workspace; Assemble returns to the step it was left on.
- **Parts progress semantics** (Astra, carried into phase 2): the quantities must stay separate as (1) what the current plan requires, (2) what the owner has confirmed they possess, (3) what they have printed or bought toward the change, (4) what remains to obtain. Reuse the planner's BOM logic behind the parity gate and verify representative builds and options, not only the starter kits.
- **Parts progress is stored per build, as counts.** (Phase 2 implementation of Astra's semantics.) Each row carries required (the bill's qty), had, and printed or bought; to go = required − had − printed, never below 0; the Dock sums the printed rows. Stored under `gen2-parts-progress:<build id>`, so a second build never inherits the first's ticks. The Assemble player never writes it.
- **Row links follow one download-site preference** (`gen2-link-store`, the planner's key and ids), with a search link where no exact page exists and an Amazon affiliate link for hardware the planner has vetted; the disclosure line appears only when such a link is on the list.

## 2026-10-14 (phase 3, the Build rules)

- **The rules are the planner's own, ported by copy.** (The approved plan, §1.5, executed.) `js/rules/layout.js` and `js/rules/schema.js` are generated from the planner's app.js by `tools/port-rules.mjs` with the same mechanical edits as the BOM; the parity gate compares every predicate, every fix's post-state and the sanitiser against the planner on kits, random builds and broken layouts (148,199 comparisons, 0 mismatches at c0a250c). `js/rules/LEDGER.md` classifies the test hook's exports.
- **One store, the share link as persistence.** The build record is the planner's BUILD_FIELDS plus the three palette fields its rules read; history is the planner's (50 entries, 350 ms coalescing, an undo never reuses an id). After the first edit the address carries the planner's own `#build=` form, which the stage decodes at boot, so a reload or a shared link reopens the edited build; the kit it started from stays in `?build=` for its title and for the Parts progress key. The build store with Recent builds, files and IndexedDB remains the phase-0 leftover.
- **Adding happens on judged spots; the board allows any free cell.** (Claude's implementation of Joey's "everything the prototype tried".) A stage spot is a cell where the planner's `canPlace` holds and a trial through the generator and the validity rules shows the layout still showable with no new structural problem and none on the new unit (the prototype's rule; bow stays advisory). The 2D board keeps the planner's own semantics (any free cell, then gravity), so a layout the stage cannot show can still be reached and corrected there while the stage keeps its last good scene and the issue card says why.
- **Gravity is drop-only.** (Joey, 2026-10-12.) After every edit, every unsupported unit falls toward the mount surface until something holds it; nothing is ever added by gravity. Fix structure (the planner's) is the only path that adds support cases, and the red "needed" spots on the model offer those cases one click at a time.
- **The issue card is the planner's warnings, plus two.** Unsupported (Fix structure), sag, won't print, not in the collection, bow (advisory), cabinet interior, wall 0.5H top row (Grow top row to 1H), tabletop completion (guidance), no under-table rails (advisory); plus the 80-unit instruction cap (the plan's risk register) and the generator's own refusal when no planner rule already explains it. The Dock counts them all; the problem units wear the dashed amber outline on both views and the inspector repeats the warning for the selected unit.
- **Per-unit type goes through convertProblem; bulk through planConversion.** The inspector's Classic/Decor switch is disabled with the planner's reason where a drawer cannot change; Build style's Drawer type converts every eligible drawer in one undo step and reports what stayed and why.
- **Build-style toggles stay the stage's and are adopted.** Faceplate, handle, closures, stoppers, back cover, feet and Gridfinity keep running through the viewer's own functions (their tracking names unchanged); the store then adopts the stage's record as one undo step without a second regenerate.
- **Previews are still the glyphs.** Product-faithful previews (the standing requirement above) are the next step of this phase, after the editing rules have been reviewed.

## 2026-10-14 (Astra's review of phase 3, applied)

- **Gravity stays automatic, and is now visible.** Astra would keep explicit repair as the default ("flag the problem and offer a fix"); Joey's decision of 2026-10-12 was drop-only gravity as the prototype tried it. Astra's two conditions are met: an edit and the drop it causes are ONE undo step (they always were, inside one commit), and the moved units are shown - named in the toast, pulsed orange on the model, flashed on the board. **Joey, 2026-10-14: "keep gravity as is."** Settled.
- **Spots are quiet markers; one full-size ghost for the hovered or chosen target.** (Astra.) A spot is an 18 mm marker at the cell's centre, drawn through everything; the hovered spot (mouse) or the chosen spot (touch, first tap) shows the unit's full translucent volume. On touch a chip above the Dock offers Place / Cancel, so nothing covers the target; a second tap on the marker also places. A dragged unit's own ghost hides while it snaps to a spot, so the spot's volume stands in.
- **Parts can expand to a table.** (Astra.) The list widens to 820 px; with tracking on, each row is Part · Needed · Already have · Printed / bought · Remaining with large counters; a finished row stays at full opacity with "✓ done" and its counters editable.
- **"Layout valid", never "Ready to build".** (Astra.) The Dock's status is structural validity in both Build and Parts; what is not released is the Parts head line's business and what is still to print the progress bar's. In Parts an invalid layout reads "Fix the layout" and jumps to Build.
- **Side Covers are released.** Verified against the site ticket (v2609, 2026-10-10: Printables 1872093/1872105/1872112/1872115/1872120/1872123 and the six Thangs ids). The planner's catalog, vendored verbatim and sha-pinned, still lists `sideCover` as unreleased, and the ticket's rule is never to hand-edit it; so `js/workspaces/parts.js` carries a dated override (the row loses SOON and "Not released", links to the live pages, counts as available) to be deleted when the planner's own commit lands and the catalog is re-vendored. Catalog work for the planner repo, not redesign work.
- **The phone layout is not built yet.** The brief's "below 1024 px, panels become bottom sheets and the tabs move to a bottom bar" has no phase; Astra's hands-on check on a phone (place three drawers, orbit without placing, move a supporting drawer, undo, Parts and back) needs it. Proposed: a phase of its own after Colors, before cutover. Until then the desktop panels overlap the stage on a phone.

## 2026-10-14 (previews)

- **Product-faithful previews are live, from the GLBs.** (The standing requirement of 2026-10-12, executed; Joey: "go ahead with the previews".) The stage renders one unit of the asked size, fill, faceplate family, handle variant and drawer variant through the real generator and the real part models, with the SAME shared materials the model wears (a filament pick, the dark-stage palette and the plate finish follow), into an offscreen target, cached as a PNG per option set and palette. Where they show: the unit tiles (1W·1H of each fill, front), every faceplate tile (the family on a 1W·1H Decor drawer, front), every handle tile (the variant on the current plate, three-quarter), and the inspector (the selected unit at its size and options, three-quarter). The generated glyph stands in until the image is ready and stays where no model exists (Cabinet) or a part is missing from the library. Size tiles keep the proportional glyphs, as allowed.

## 2026-10-14 (Astra's review of the previews, applied)

- **The selection silhouette is occlusion-aware** (Astra, second look: the rim crossed the top cover with a jagged edge, the case top behind the cover showing through). The mask is drawn in two passes, every real part black for depth and then the selected unit white, so the outline follows the selected unit's VISIBLE surfaces and never suggests the cover is selected.
- **The selection is a screen-space silhouette.** (Astra: "a thin outer silhouette that preserves the normal material appearance"; Joey saw the hull "clipping into the drawer".) The two-rim inverted hull of 2026-10-12 is gone: on a drawer with slotted walls it drew its own back faces through the slots and over the plate. Now the selected unit's meshes are drawn into a mask after the frame and a full-screen pass draws a 2.2 px orange ring where the mask ends, a soft glow outside and a one-pixel white line inside. Nothing is added to the scene; the material appearance is untouched. Astra's earlier acceptance of the hull covered those screenshots only.
- **Placement markers are controls.** (Astra.) A round orange disc with a white plus that always faces the camera, 26 mm, drawn through everything; the full ghost still appears on hover or a touch choice. The little cubes read as parts.
- **Handle previews are framed around the handle** with just enough plate behind for context, and the inspector preview is as large as its well allows (124 × 93 at a 512 px render). (Astra.)
- **Mobile is an explicit milestone before cutover.** (Astra.) Colors next, then a dedicated phone phase covering the bottom-sheet layout, the bottom tab bar, and the repeated-placement problem found in the prototype; the prototype's phone behaviour establishes nothing about this implementation.
- **Colors' acceptance check** (Astra, recorded for phase 4): change a faceplate or handle colour and the main model, the option previews and the inspector agree, after switching builds and after Undo as well. The previews already key their cache on the live palette signature, so the check is of the whole chain, not of the cache alone.

## 2026-10-14 (phase 4, Colors)

- **The palette is the viewer's own, reached through a stage API.** `customColors` keyed by part type or Type:zone, `useCustom`, `userPalette` and the four presets stay as the Build Studio built them; the Colors workspace reads and writes them through `palette / setColor / setPalette / setUseCustom / restoreUserPalette / keysInBuild / partInfo`, so the model, the product previews (keyed on the live palette) and every panel read one source. The plan's scheme + per-unit-override model is reached in two steps: this is the scheme half; per-unit overrides ("Only this one") are the next step of this phase.
- **Every colour change is one undo step, with the build.** The store's history entries carry the palette beside the record (`createStore`'s `extra`); Undo restores both, Redo too. The palette never enters the record, the `#build=` hash or the planner's form.
- **A palette belongs to a build.** Stored under `gen2-colors:official-<kit>` for a page opened on a kit (the Studio's own key, so a visitor's Studio picks carry over), `custom-build` for a bare hash; the build store with Recent builds will key by build id.
- **Assemble's instruction colours are a view, not a write.** The Assemble workspace flips the model to Part colors and back without saving; a visitor's palette survives the trip (checked).
- **Schemes.** Your schemes live in this browser (`gen2-schemes`, up to 20) with Download (a JSON file the Studio's Upload also reads), Upload (either app's file) and Share (a link with `#scheme=` beside `#build=`, applied once at boot and dropped from the address). Premade by Jerrari = the Studio's four presets, each with Shop this look (the preset's filaments with buy links). Colors in this build lists every region the mounted parts draw, with its count and filament, and opens the picker for parts that are hard to click.
- **Clicks are scoped to the tab.** In Colors a click selects quietly and opens the part card above the Dock (name, count, current filament, Body + zone chips, the download link, Open the drawer); a chip opens the picker on the right where the inspector would be. Purchased hardware is locked, as in the Studio.
- **Build plate finish lives here** (the inventory's placement), still a field of the build record; the choice is adopted into the store as one undo step.
- **Disclosure stays at the link.** "· paid link" on paid buy links with `rel="sponsored"`, the Polymaker Ambassador line under a Polymaker link and the Amazon Associates line under an Amazon one, in the picker's pinned footer and under the shopping list.

## 2026-10-15 (phase 4b, the per-unit layer; Astra's review of Colors applied)

- **Edit scope is explicit.** (Astra.) The picker's title is the region and the scope: "Face · All faceplates · 3" or "Face · This drawer only (unit 3)"; the Apply-to track says "All faceplates · 3" and "This drawer only"; the part card says "1 of this size · 3 faceplates in the build · unit 3 · <filament>".
- **A unit's own pick wins over the build colour** (the plan's override layer `{ unitId: { region: filament } }`), resolved inside the stage's one material choke point, so every pass (identify, fades, the previews) sees it; a zone with no own pick and no build-level pick follows the unit's own Body pick, as a zone follows its type. Own picks are marked OWN on the card's chips, counted ("1 own") on the Colors-in-this-build rows, and listed in the shopping list.
- **Two resets, named for what they do.** In unit scope, "Use build colour" drops that unit's own pick for the region. In build scope, "Reset to instruction colour" returns every part of the region to the kit's colour, own colours included (the brief: per-unit picks are cleared by Reset or by applying a scheme). Changing the build colour leaves own picks in place; the picker says how many units keep their own.
- **A palette belongs to a build, not a kit.** (Astra: two projects from one kit must keep different colours.) A page opened on a `#build=` hash whose record carries an id keys its palette by that id; a kit page keys by the kit until the first edit, when the record's new id takes the kit's palette along under its own key. Two edited builds from the 185 kit keep Blue and Red cases respectively across reloads; the kit page itself keeps the kit's.
- **The shopping list takes the part card's place while it is open** (Astra: contextual panels must not accumulate over the model).

## 2026-10-15 (the phone phase)

- **Below 1024 px the tabs are a bottom bar and every panel is a bottom sheet.** (The brief §2, executed; Astra: mobile is an explicit milestone before cutover.) `js/ui/phone.js` builds the bar from the same five tabs with their badges, and turns a workspace's panels into sheets with a grab handle: collapsed, a sheet is its handle (and a peek line); open, it rises to 56% of the screen and scrolls inside. One sheet open at a time. The desktop layout above 1023 px is untouched; crossing the breakpoint re-mounts the workspace in the other chrome.
- **The model is the hero on a phone.** The library starts collapsed ("Add units" on its handle); arming a size collapses it again so the spots stay uncovered; placing never opens a sheet (Joey's finding of 2026-10-11, the repeated-placement problem); a selection shows as the inspector's handle ("Unit 1 · 1W·1H Decor Drawer") and a tap on the handle opens the editor. Placing on touch is a tap to choose, then Place on the chip above the Dock.
- **The slim Dock** keeps the status, the unit count and the CTA above the tab bar; the W × H × L figure and the quality pill wait for width.
- **Verified in an emulated 375 × 812 viewport** (synthetic touch events; the orbit itself cannot be driven synthetically and needs a real device): three drawers placed through choose + Place with the sheet closed; a drag across the model placed nothing; a selection stayed below the model; a supporting drawer with no valid spot now says so; Undo; Parts through the bar and back to Build with the selection kept. Joey's hands-on check on a real phone is the acceptance.


## 2026-10-13 (the real phone: Joey's first hands-on check)

- **Joey's phone (about 412 px) showed overlapping chrome the emulated 375 × 812 check had not: the switcher squeezed to a sliver under the wordmark, the Dock's CTA off the right edge, the Parts download-site segment overlapping its labels, a scrolled sheet losing its handle, the Assemble player collapsed into a narrow column over the collapsed steps sheet, and the tools row keeping its desktop offset in every workspace but Build.** The emulation had been at one width with the sheets mostly closed; a real device with a long step note and tracking on is the acceptance, as the phone-phase entry said.
- **The phone bar is the wordmark, the build name with its caret, mount·length as icon + number, and one theme button.** The Share chip leaves the bar and becomes "Share link" in the switcher menu on every size; the printer chip waits for the setup sheet. Phone widths of 360–412 px leave the build name 90–140 px.
- **The Dock keeps status and CTA and yields the units figure to a progress bar or a filament stack.** The Parts caption shortens to "N of M" on a phone (the full caption stays on desktop).
- **A sheet's handle is sticky and glass; collapsed sheets are clipped to their peek, not merely slid behind the Dock** (the Assemble steps showed through the player's glass). The sheet manager takes the height of whatever sits on the bar from the workspace (Assemble passes the player's live height), sets each sheet's bottom and max-height inline from it, and reports the safe area from the same figures.
- **The Assemble player is a compact card on a phone**: the note takes the width and scrolls past 24% of the screen, the colour switch and the pips take rows of their own, the keys share one row.
- **Verified headless at 390 × 844 and emulated at 412 × 915**, shots `phone-*-dark-390.png` (Assemble, the open steps sheet and the scrolled Colors sheet added). Joey's next hands-on pass is the acceptance.

## 2026-10-13 (phase 5: Labels)

- **The Labels workspace is the planner's label-place design on the stage.** (PLACEMENT-PLAN.md, Joey + Astra's three mockup rounds; Sol 01a12b25's rules, ported from the unpushed `label-place` branch `d8fc6f5`.) Two explicit paths: DRAWER FIRST (tap a drawer on the model, click a label, the drawer stays selected) and PLACE SEVERAL (arm a label, tap drawers one after another; the next waiting label follows until labels or empty drawers run out). A click never replaces silently: an occupied drawer opens the Replace dialog, which re-checks the drawer, the label and the label it expects before one placement. Fill empty drawers previews its exact pairs (top row first, left to right) and refuses a stale preview. Every operation is one history entry, and "Last change" names it while the record's labels still match what it produced; the panel's Undo takes back only that.
- **The operations are pure and tested under node** (`js/rules/labels.js` over the vendored `js/vendor/label-list.js`, the planner's sha-pinned copy of the Label Studio's module; `test/labels.test.mjs`). The build keeps the format's two fields, `labelList` + `labelAssign`, and the mirror (`unit.label` / `unit.labelBadge`) is rewritten after every commit, so older tools and the stage read the same words. On arrival a build from a link, a file or an older tool is reconciled with the older-tool rules (a typed drawer becomes a list label).
- **The stage draws the labels from the record** (`stage.setLabels(record)`: the label fields are copied and the label meshes redrawn in place, no regenerate, no deselect). The panel's previews are the lightweight kind the planner chose (decision 3b: the real outline, the icon art, the words); the 3D label is the exact one.
- **A label is edited in a card beside the model**: words (cut to the mirror's 40), Auto / No icon / Letter / the catalog's icons by group with search, and a scope when the label is shared ("This drawer only" clones it). A part label offers Edit part details (the Studio) and Use custom wording (asks first). Set-wide label settings (the generator's six inputs) sit collapsed under the list.
- **The ways in and out.** + Add label (typed); Add from a file (a MODULITH label list, a Part Picker label-items file, or a Label Studio set file, whose predicted badges stay predictions); a `#labels-add=` link, imported once and dropped from the address with the build's own `#build=` kept; Download list (the format, with the style, without assignments) and Copy as text. Make labels and Part Picker open the Label Studio in a new tab. The CTA is Print labels: the Studio's one-way `#labels=` link with the drawers' words.
- **The two-way Studio session is not ported, and the reason is outside this repo.** The Studio allows only `https://gen2planner.jerrari3d.com` as a planner origin (`label-link.js` PLANNER_ORIGINS) and its "Add to planner build" opens the OLD planner's address by name; from the merged app's origin the job protocol is refused and a named-window return would navigate the tab away. `blocked-on: the Label Studio accepting the merged app's origin and return address (an allowlist entry plus a ?return= or the embedded ?embed=planner mode) · blocked-since: 2026-10-13 · check-by: 2026-10-27 (with the cutover plan)`. Until then labels travel as files and links.
  **Cleared 2026-10-22: both conditions hold on the live Studio** (labels.modulith.systems, public main `fa87f8df`;
  the Studio change went out on 2026-10-13 as `d53b9dfe`, under "towards cutover" below). Its `PLANNER_RETURNS` includes
  `https://planner.modulith.systems/`, so a Studio opened by this app's Make labels sends Add to planner build back
  here, and `label-link.js` `PLANNER_ORIGINS` includes `https://planner.modulith.systems`. What is left is this repo's
  choice, not a blocker: the two-way job protocol (the old planner's `label-return.js`) is still not ported, and labels
  come back as `#labels-add=` links and files. A Studio opened without `?return=` still names the old planner, which
  CUTOVER.md lists for cutover day. The round trip was walked live on 2026-10-22 (`studio-live-prod.mjs`, the stale-tab guard's
  Live line).
- **Never hidden or greyed out** (the brief): a build whose faceplate takes no labels opens the tab to a callout with "Switch to EdgeLabel ✦"; the list can still be built and exported, and nothing can be placed until a label family is chosen. A faceplate change keeps existing assignments (the label-place rule, kept over Sol's drop-them rule, so a style toggle never loses placements).
- **Deferred:** the print plate inside the app (the Studio's engine; the spec's integration path step 2), drag-and-drop from the list onto the model, a hover preview on the drawer while placing, uploaded icons from the editor, and the label-copy recovery (it guards a shared session slot the merged app does not have yet; it returns with the build store).
- **The Labels panel's foot is four equal tiles, Fill on its own row, exports as icons in the head** (Joey, on his phone the same day: the seven buttons "thrown together like this look messy and overwhelming"). The two Label Studio tiles carry the Studio's own tag and the Part Picker's bolt in orange, so the way to the Studio reads at a glance.
- **Hover hints with looping scenes** (Joey: "like Photoshop or Illustrator, a tiny looping video in a bubble"). `js/ui/hint.js`: one shared glass bubble beside the panel after a short dwell on hover or focus, never on touch screens, with a looping inline SVG scene (SMIL, one 4 s clock, nothing downloaded), a title and one line. Six scenes for the tiles, Fill and Place several. Hidden on leave, blur, mousedown, unmount and before every panel rebuild (Terra 01a13529: a rebuilt button never fires mouseleave). The pattern is ready for the other workspaces' controls when they want it.
- **The hint clips are recorded from the app** (Joey: a real 10-15 s recording, as for 3D Printopia). `tools/hint-clips.mjs` drives the Labels workspace headless with a drawn cursor, captures Chrome's screencast frames and assembles them with ffmpeg at the bubble's size (img/hints/README.md). The six clips weigh 30-60 KB each and load only on the first hover. The Part Picker clip shows the Studio opening, not the Picker: Joey wants to come back to these by hand, and the SVG scenes remain the fallback.

## 2026-10-13 (the build store)

- **Every build autosaves to IndexedDB in this browser, and Recent builds keeps up to 20** (the plan §1.3; the spec's switcher). `js/state/builds.js`: an entry per build, keyed by its id, with a name, when it was saved and last opened, its kit and its record; the planner's own autosave slot (`gen2-last-build`, the raw record) is dual-written so the old planner and this app will read each other's last build once they share an origin at cutover; `navigator.storage.persist()` is asked for after the first save; a browser that refuses IndexedDB (Firefox private mode) gets a localStorage list. Nothing is deleted by age: a new build that would push the oldest out waits behind a notice in the switcher with "Save it as a file", "Drop it" or "Not now".
- **Reopening.** With no build in the address and no kit asked for, the page reopens the build this browser had open last (the current Recent entry, else the planner's slot) by putting its record in the address before the stage boots. `?new=1` skips that. A `#labels-add=` link that arrives on its own therefore lands on the visitor's own build, not the default kit.
- **The switcher works.** Rename (in place), Recent builds (open; delete with a confirmation inside the row), Duplicate (a copy with its colours), Save build file (the planner's `{gen2Build: 1, data}` with the name beside it; the file is named after the build, so saves no longer collide), Load build file (a planner file, a raw record or an official kit file; a newer planner's file is refused), New build (a fresh copy of this kit, `?new=1`; the setup sheet for mount, length and printer is the next piece). Everything but Rename reloads the page on the chosen record, which keeps the stage, the store, the palette key and the workspaces on their one boot path.
- **A name lives in Recent builds and in a file, not in the record or the share link**, so BUILD_FIELDS and the planner's form are untouched. The kit's title is the default name on a kit page.
- **No migration from the old planner yet**: it runs on another origin, so its storage is unreachable until cutover; the dual-written slot is the bridge for that day.

## 2026-10-13 (the setup sheet)

- **The setup sheet is three steps and a name** (the spec §0): Mount cards with their note (Under-Table "Needs wood screws", Tabletop "No tools", Wall Mount "Needs wood screws · anchors on drywall") and the optional workable area for the mounts that hang; Length cards with the collection's colour stripe, inside depth and use, and the badges RECOMMENDED (185), NO TABLETOP (59 on Tabletop) and WON'T FIT (from the bed); Printer optional, grouped by brand, with a custom bed, and the live fit line ("Bed 250×210 · at 115 mm you can print cases up to 2W"). `js/ui/setup.js`.
- **New build lands on it** over a fresh kit page (`?new=1&setup=1`), and the top bar's Mount · Length and Printer chips reopen it at that step. The printer chip now names the choice.
- **Mount and length reload the page on the record; the printer and the name apply in place.** The stage decides the scene (the table, the wall, the rails) at boot, as the viewer always did for a mount or length change, so the sheet writes the record through the store, flushes it to the address and Recent builds, and reloads: one boot path, shared with the switcher. A length change that strands units says so on the card and in the foot; the units stay on the board flagged by the Build issue card until they are swapped.
- **A fresh build starts with one drawer**, the first Decor size the lineup has (2W·1H where it exists), never an empty scene: the stage has no empty state and the drawer is the first thing to move or replace anyway.
- **Found on the way:** `GEN2` is a classic-script lexical global, not a property of `globalThis`; `js/workspaces/labels.js` had read it through `globalThis` since phase 5 and silently lost the catalog (the faceplate names in its callout, the label-setting limits). Both now read it the way `app.js` does.

## 2026-10-13 (towards cutover)

- **The cutover checklist is `docs/redesign/CUTOVER.md`**: the decisions only Joey can make (the domain, the parts host's domain, the old planner's kill date), what changes in each repo, the order on the day, and the dated blockers. Nothing in it runs without his go.
- **The site's BOM artifact is now a parity gate for the ported computeBom** (`test/parity/site-boms.test.mjs`): the MODULITH site's committed `official-build-boms.json`, made by the old planner at 7beb165, equals this repo's `computeBom` on every official kit. At cutover the site's vendoring tool switches its source to this repo on that evidence.
- **The Label Studio's return address.** The merged app passes `?return=<its address>` when it opens the Studio; a Studio change on branch `planner-return` (not deployed when this was written; deployed that day as public main
  `d53b9dfe`, described in the next line) honours it for the planners' exact paths, so "Add to planner build" comes back here. The two-way job protocol keeps waiting for the domain: an origin allowlist cannot name a path, and a GitHub Pages origin is a whole account (Terra 01a135bc).
- **Joey's cutover decisions (2026-10-13):** the domain is `planner.modulith.systems`; the parts host stays on its Pages address; the old planner's kill date waits for a reliable, well-tested 2.0. He asked for the Label Studio deploy while away: done the same day (public repo main `d53b9dfe`), with `planner.modulith.systems` on both of the Studio's planner lists, so the two-way label session unblocks the moment the domain resolves.

## 2026-10-13 (reliability: the end-to-end suite)

- **`npm run e2e` drives the app in headless Chrome** (`e2e/workspaces.mjs`, beside the unit tests, outside `test/` so `npm test` stays browser-free): every workspace boots on the root kit, desktop and phone, with no console error; Build places, moves, removes and undoes through the store and the stage follows; Colors applies a preset and a region pick is one history entry; Labels places several, fills, undoes and makes a link; Parts counts; Assemble steps, skips and returns; the store autosaves, reopens on a bare address, renames, duplicates and deletes; the setup sheet starts a Wall Mount build at 115; the phone sheets open and collapse. It blocks the Pages deploy beside the smoke test. Joey's kill date for the old planner waits on "a reliable and well tested 2.0", and this is the first instrument that says so about the whole app rather than a function.
- **It found three defects on its first runs**, all fixed: the first colour preset was applied after the store took its undo baseline, so the first Undo dropped the palette; the switcher's reload lost a harness's `?debug` flag; and Duplicate (and Open from Recent builds) built an address that differed from the current one only in its hash, which a browser treats as a hash change, so the page stayed on the old build. `go()` now reloads explicitly in that case, as the old viewer does for a mount change.
- **Polling the store from the test, not from the page.** A Playwright `waitForFunction` given a Promise-returning page function passed once while IndexedDB was still empty; the suite now re-reads the store from node until the entry appears, with the page's console errors in the assertion message.
- **The suite's first deploy run failed on the runner's software rasteriser** (run 38426597075, 36 min): the boots passed, but the first click in Build took longer than Playwright's 30 s to be acknowledged, and a case that fails before its own `ctx.close()` left its render loop running, so every later boot starved. Fixed in the harness, not the app: contexts are closed after every case whatever happened; the quality tier is pinned to `fast` and the desktop viewport is 1280×800 (the suite proves behaviour, not pixels); fixed sleeps before an assertion became polls; and `E2E_SOFT=1` runs the suite on SwiftShader locally so the runner can be reproduced before pushing. Green 9/9 on software rendering and on the GPU.

## 2026-10-13 (labels kept aside)

- **A build that comes back without its labels is offered them.** The old planner's "same-browser recovery of a dropped label list" guarded one shared autosave slot against older tabs; the merged app has no older tabs, but the same loss has another road in: a share link or a build file made before the labels were added (or by the old planner) carries the build's id and no list, and the autosave that follows would replace the Recent entry, labels and all. So when such a link or file arrives for a build whose Recent entry has labels, `app.js` copies the entry's labels aside first (`js/state/label-copies.js`: localStorage `gen2-label-copies`, at most 5 builds, 512 KB each, 30 days, each assigned drawer's cell recorded), and the Labels workspace shows a banner while the board has no labels: Restore labels, Not now (this page only), Discard (confirmed). A toast on the other workspaces says the labels can be brought back.
- **Restore is the older-tool reconcile, never a merge.** An assignment returns only where the drawer is still in the cell the copy recorded (ids are build-local); a kept drawer with no words of its own is given the copy's mirror first, or the older-tool rules would read every one as cleared. A drawer with other words gets a new label and the original waits in the list. A build with labels of its own refuses the copy. Removing the last label by hand drops the copy: nothing is offered back that the visitor deleted here. Two tabs on the same build re-read the copy at the moment of the choice and spend only the copy they read (Sol 01a136b1): a discard in one tab is not undone by a Restore in the other, and a newer copy is not deleted by an older tab's decision.
- **Proved** by unit tests on the copy store and the restore, and by the Labels e2e case: a bare link of a build with four labels opens in the same browser, the banner names them, Restore puts the two placed ones back on their drawers and spends the copy.
- **Three more journeys in the suite** (2026-10-13): a share link opened in another browser carries the whole record and does not join that browser's Recent builds until edited; Load build file through the switcher lands on the file's build; with Recent builds full at 20, a new build's first change is held, the switcher names the build opened longest ago, and Drop it makes room. On the way: the suite's throwaway edits used feet values the schema does not allow, so a link round trip showed the sanitised value; they now use the schema's own.

## 2026-10-13 (the preview while placing)

- **The drawer under the pointer wears the armed label before the click** (a phase-5 deferral). The stage gained a hover watch (`watchHover(on)`, `opts.onHover(unitId | null)`): off by default, so no pointer move casts a ray unless a workspace asks; the Labels workspace turns it on while a label is armed and never on touch. The preview goes through the stage's mirror alone (`setLabels` on a copy of the record): the record does not change, nothing is placed, and leaving the drawer or placing puts the record's own mirror back. Only an eligible, empty drawer previews; a labelled or ineligible one shows nothing, as the tap would refuse it. Proved in the Labels e2e case: hover shows the words with no assignment, leaving clears them.

## 2026-10-13 (the redirect carries the last build; the goldens)

- **The old address forwards the build the browser had open last.** The cutover-redirect branch's script (087c78b) reads the old planner's `gen2-last-build` slot when the address carries no kit and no build, and forwards it as the share-link form; a labels link rides beside it. The one migration the plan had left to a sentence on the page is a mechanism now; the colour stores and the tracker still stay behind (CUTOVER.md).
- **The golden screenshots still match after phases 3 to 5**: 60 shots (every official kit, cover, a middle step and the end, Very High and Fast), 0 differ. The stage refactors, the hover watch and the label mirror changes moved no pixel of the old viewer's pages.

## 2026-10-13 (keyboard and screen reader)

- **The shell works from the keyboard.** The build switcher's menu opens on Down (or Up) from its chip with an item focused once Recent builds are listed, the arrows walk every row including the delete marks, Home and End jump, Escape closes and returns to the chip, and a rebuild of the menu keeps a keyboard user's place; the toast is a polite live region; the Labels modal and the setup sheet keep Tab inside, take focus on open and give it back on close (`trapTab` in `js/ui/dom.js`). Proved by a keyboard e2e case with real key presses. Terra 01a136de caught an arrow pressed while a click-open's list was still loading: the key now waits for that render.

## 2026-10-13 (drag a label onto a drawer)

- **A waiting label can be dragged from the list onto a drawer** (a phase-5 deferral). A mouse or pen drag from a label's chip carries a ghost of its words; over the model the drawer under the pointer previews it through the same mirror path as the hover preview (`stage.unitAt(x, y)` names the drawer); letting go places it by the drawer-first rule, so a labelled drawer asks to replace and the panel does not enter placing mode afterwards. Escape, or a drop anywhere else, cancels. Touch never drags (the sheet scrolls; tapping is the phone's way). Proved in the Labels e2e case with the real mouse: the preview while carrying, the ghost, the placement, no placing mode. Terra 01a136e5 found three holes before the push: a panel rebuild during a drag would have orphaned the ghost (the rebuild ends the drag), an armed label previewed instead of the dragged one, and a pointer that slipped off the chip before the drag threshold was lost (captured from the press).

## 2026-10-13 (the site vendors its BOMs from the merged planner)

- **The site's BOM artifact can come from this repo** (`BOM_SOURCE=merged` in the site's `tools/vendor-build-boms.mjs`, on its `planner-cutover` branch at 121b214): the catalog, the kit files and the ported rules run under node, no jsdom. The first run differed from the old planner's artifact in every kit's share form: the planner's applyBuild trims a kit file's spare top rows (gridH 4 to 3, units moved up), as this repo's store does on load, and the tool had only sanitised. With the store's own normalisation (enforceMountLength, syncTabletopGrid) every kit's bom, plannerHash and source came out byte for byte the same as the old path's; the artifact's planner block names the repo and one hash per rule file (Terra 01a136ec: a concatenated hash could not tell a byte moved across a file boundary). The site's whole test chain passes on the merged artifact. The cutover checklist's last "later, separate change" is prepared.

## 2026-10-13 (the phase-0 numbers, measured)

- **`node tools/perf-probe.mjs` measures what the plan's phase-0 exit asked for** (§4) and nothing had: the JS heap after 1 and after 50 in-process regenerates (a unit added beside the build and removed, through the store, each a real rebuild), the renderer's live geometry, texture and program counts beside it (a leaked WebGL resource is not on the JS heap), and the frame intervals while the model is dragged for two seconds with the library and the inspector open, both states checked and the camera required to have moved. Headless Chrome on this machine's GPU, kit 185-tabletop-3w2h. The numbers are a report, not a gate: a gate on a frame time fails on whatever machine runs it next.
- **Results (2026-10-13, this machine):** heap growth over 49 further cycles 3.4% at Very High and 4.5% at Fast, inside the plan's 10%; the renderer's counts identical after 1 and after 50 (35 geometries, 13 textures, 21 programs at Very High), so a rebuild releases what it made; a cycle takes about 90 ms; the frame interval holds the display's refresh (8.4 ms mean and 95th percentile at 120 Hz) with a worst frame of 16.7 ms and 2 of 235 intervals over 1.5x the median at Very High, 1 of 236 at Fast. Terra 01a136f0 shaped the report: the resource counts, the max and the missed count beside a vsync-bound mean, the chrome and camera checks, and the cycle time without the probe's own collections.

## 2026-10-13 (the Part Picker inside the planner: step A)

- **The Part Picker opens in a modal over the Labels workspace** (`docs/redesign/LABELS-INTEGRATION.md`, step A; Sol 01a13827 on the design, Astra's adjustments, Sol 01a13844 on the code). The Studio's published Picker runs in a frame nearly the size of the screen with the planner's border; it is made once per page and hidden between openings so the picker's choices persist. The planner speaks first: a hello with a session that the Picker binds to after checking the origin against its own list (an exact match; loopback only while the Picker itself is on loopback; the referrer never consulted), and every message after carries the session. Add part labels lands in the build that was open when the modal opened, as one history entry; the Picker is answered only after the store took it; the new labels are marked in the list and the first scrolled into view. **The identity is the Picker's row, not the part's size** (Astra, 2026-10-13): the same row sent again is the same label, updated in place with its label id, its badge and its drawer kept and its words refreshed unless they were typed by hand; two rows for the same screw are two labels, as queued; and one label can already sit on several drawers. A batch for another build, one that arrives after the modal was closed, an empty or oversized one, is refused with a reason the Picker shows.
- **The Picker's own change** (its repo 89db3532, republished into the Studio's `parts/` on branch `planner-picker` 95efefdf): a second embed mode, `?embed=planner`. The Studio's same-origin sheet is untouched and its contract test still passes. The Studio must be deployed (Joey's go) and the domain must resolve before the modal works in production: a GitHub Pages origin is not on the Picker's list, and the modal says so in its own chrome after eight seconds without a connection.
- **Proved** by unit tests on the batch rule and by an e2e case driving the real published Picker on a second loopback server: the hello binds, a nut lands with its part record, the same part again updates in place after a hand edit, three undos walk back update, edit and add, a batch after the close is refused, another build gets a new frame and session, a stray message without the session changes nothing.
- **Found on the way**: the modal's first two ids clashed with the Colors filament picker and the Parts panel; the modal's flex display beat the hidden attribute; the Picker's hello handler rendered before its data (fixed in the Picker); a family tile clicked before the Picker's data had loaded threw inside the Picker (pre-existing; fixed in the Picker, 12752df0: the tiles wait for the data). Inside the planner the Picker's buttons now read "Queue N parts" and "Add N labels to the planner" (Astra's wording). The Picker repo has no git remote: its commits are local until Joey gives it one.


## 2026-10-14 (step A in production)

- **The three account actions landed** (Joey; the plan's Order section asks for the Studio deploy and the domain before the
  production test): the Studio's `planner-picker` branch deployed
  to the public Label Studio (cherry-picked onto `labels-public`, 6426fc80 = `modulith-label-studio` main; the 16 Studio test
  files pass; the live `parts/js/embed.js` serves `?embed=planner`); the Picker source repo got its remote
  (`Jerrari12/gen2-part-picker`, private, master 12752df0 pushed; not `gen2-parts`, which is the public GLB and thumbnail
  asset repo); and `planner.modulith.systems` resolves (Cloudflare CNAME to `jerrari12.github.io`, DNS only; the Pages custom
  domain with HTTPS enforced). The domain came up ahead of cutover day on purpose: it only moves the planner's own address,
  the redirects, the site branch and the GoatCounter stop still wait. `jerrari12.github.io/modulith-planner/` now 301s to
  the domain with its query string, which the Studio's return list already allowed for.
- **The live check of step A, on the domain, against the deployed Studio** (the browser pane, `?ws=labels&debug=1`): the
  modal's frame loads `labels.modulith.systems/parts/?embed=planner`, the hello is answered and bound (focus on Close); a
  screw queued and sent lands in the open build as one part label with its record, the modal closes, "Added 1 part label",
  the chip marked new; a reopen keeps the frame and the session; the same row sent again after a hand edit updates the one
  label in place ("Updated 1 already in the list (your own words kept on 1)": words kept, the record refreshed); three
  undos walk back the update, the edit and the add, one step each; a different build gets a new frame and session, Escape
  closes it. The same results as the loopback e2e case on the steps repeated; two of its checks were not repeated live (a
  batch arriving after the close is refused; a stray message without the session is ignored). One unexplained console line: a 429 on the planner's first load, from
  none of the planner's or the Picker's own files (every request listed returned 200, or 206 for the hint clip's range),
  origin not identified.
- **Step B may start**: LABELS-INTEGRATION.md's Order puts the production test of A before B, and this was it. Nothing of B
  is written yet.

## 2026-10-14 (the Label plate: step B1, read-only)

- **Built on Joey's go** ("let's tackle step B"), with the design reviewed first (Sol 01a139ee: 7 of 9 held, in
  LABELS-INTEGRATION.md's new section). The Labels workspace has two views: On build (today's panel and stage) and Label
  plate (the Label Studio in a frame, headerless, read-only, showing this build's list as it lays it out; its Download print
  file works). The dock's Print labels now shows the plate instead of opening the Studio's one-way tab.
- **The transport deviates from the plan on purpose**: the Part Picker's parent-bound hello and session channel with
  named commands (snapshot, select, selected), not the drawer-keyed, opener-bound job protocol; the reason and what the
  editable B reuses from the job protocol are in the plan.
- **Sol's amendments taken**: the Studio checks the bound window and origin on every message after the hello; replies
  carry buildId and rev, and a build switch always advances the rev; an oversized list clears the plate and its Download
  rather than leaving the previous plate printable; `ready` carries capabilities and the planner says what an older Studio
  lacks; the seam for the editable step is named. Discarded: "stripes are lost on the plate" (the shared list format
  carries none, so none travel - recorded as a gap). Recorded, not met: the Studio has no light theme.
- **Found on the way**: a hoisted name clash in the Studio page (its `postToPlanner` swallowed the embed's `ready`); the
  Studio page never loaded `label-list.js` (the planner's vendored copy did) - it does now, stamped.
- **The code reviewed** (Sol 01a13a10, 2 of 4 held): the plate's signature now includes the drawer order, so a drawer moved
  past another renumbers the tags on the plate; the Studio's size guard measures bytes against the advertised bound. A
  `select` also names its build and the Studio drops one for another build (belt and braces: messages arrive in order).
- **Deployed and checked in production** (2026-10-14, Joey: "go"): the Studio first (public main a781fd5e, from
  `planner-plate` 44ccabc1; `plate-link.js`, the embed guard and `label-list.js` verified live), then the planner's main
  fast-forwarded to d91c251. That deploy failed at the module-graph stamp check (the new `js/rules/plate.js` was not on the
  workflow's explicit import list); 279c6bd adds its two stamps (the stamp and verify steps run locally on a copy first;
  Terra 01a13bbd, no findings) and deployed green. The live check on planner.modulith.systems (`?ws=labels&debug=1`): the
  frame loads `labels.modulith.systems/?embed=planner`, the Studio answers ready with its capabilities, a typed label
  placed on a drawer shows on the plate as a row tagged with its drawer, laid out on the 3D plate, Download enabled, the
  selection highlighted on both sides; Undo in the planner takes the tag off the row with a new rev. The console's 429s
  (seven this time; one unidentified on step A's check) are ESTABLISHED by a headless run that logged every response:
  they are event beacons to the old viewer's GoatCounter counter, `jerrari-build.goatcounter.com/count?p=open:…`,
  `preset:…`, `step:…`, `complete` (four beacons answered 429 in that load; the run logged responses of 400 and above
  only, and no request to the planner's or the Studio's origin was among them; the pane's earlier loads sent ten such
  beacons each). That counter is the one cutover day stops. (Terra 01a13bcc had rightly called the earlier attribution,
  from a host count alone, an inference; this run replaced it.) They do not affect the label workflow.
- **The plate's Download verified** (Astra, relayed by Joey: "Download enabled" is not the exported file): the same
  headless run downloaded `edgelabels.3mf` from the plate on the domain and from the standalone Studio with the same one
  label at the same default settings; the two files are byte-identical (71,946 bytes).

## 2026-10-14 (Joey's hands-on pass: the Part Picker modal's scroll)

- **Found by Joey**: in the Part Picker modal the summary column was "a scroll within a scroll" and its bottom could not
  be reached. Cause: `#side` is sticky with its own scroll (`max-height: calc(100vh - 24px)`), so its last rows sat under
  the embed's pinned "Add … to the planner" bar, and the wheel scrolled the column or the page by where the pointer was.
- **Fixed in the Picker** (its repo 7b83b8d8; Terra 01a13c10, its one finding discarded as wrong): in an embed
  (`html.embed`, the Studio's sheet and the planner's modal) `#side` flows with the page. The standalone Picker keeps
  its sticky column. Republished into the Studio (`planner-plate` 75b4eaad).
- **Deployed** on Joey's go: public main a781fd5e -> 85fd350f (a cherry-pick of 75b4eaad; all 17 Studio test files
  pass); the live `parts/SOURCE.json` names 7b83b8d8.
- **Checked live** on planner.modulith.systems (`?ws=labels&debug=1`, a 1440 × 900 viewport, so the modal shows both columns):
  the wheel over the summary column scrolls the whole frame, with one scrollbar; the column's last controls (Copy list
  as text, Export/Import JSON, Clear all, the label-colours menu) sit fully above the pinned bar; the builder's last
  section clears the bar too. Opened as a page of its own, the Picker keeps the sticky column.
- **The trade-off, for the flow review**: the summary column, and its Queue button with it, no longer follows the page
  down in an embed; from the lower builder sections (lengths, finish, name) the Queue button is above the fold. This
  belongs with Joey's other Picker frictions (Queue then Add as two steps, density, queueing a part with no size).

## 2026-10-14 (the stripe on part labels: whose setting it is)

- **Joey's question** (hands-on pass): a user with fewer than three filament colours needs to turn the stripe (the
  thread-system colour and the material patch) off; where would that control feel natural? Sol 01a13c2a reviewed five
  candidate places (the planner's Label settings; the Label plate only; per part in the Picker; a printer-capability
  question at setup; the Colors workspace) and recommended the Label settings as the source of truth with an EDITABLE,
  synchronized control on the plate; a printer-capability answer only as a suggestion (it misleads when printers are
  switched); and warned that saving the choice with the build makes the sender's printer the recipient's start.
- **The decision**: a browser-level DEFAULT for printing labels, this version. The planner keeps it per browser (localStorage
  `gen2-label-print`: the stripe position or Off, and whether screws and nuts are drawn), like the quality tier; not in the
  record, so a share link carries no stripe choice. Astra (relayed by Joey): the choice mixes a printer's capability with a
  label's look, so "the printer's, not the build's" is too absolute; a browser default is the right practical first version,
  and printer profiles or a per-build override can come later. That the record's field list is pinned to the old planner by
  the drift check, and that the shared formats keep six style keys, are implementation constraints, not the reason. It shows in the Labels panel under Label settings ("Printing part labels": Part label stripe, Screw
  and nut drawings, a line saying what Off means) and on the Label plate, whose own Stripe position and drawings inputs
  stay live and send a `setting` message back; the planner sends it to the Studio in the list document's `output` bag under
  the Studio's input ids, so a downloaded list carries it too. Verified from the code that Off removes the material patch
  with the band (the patch is a piece of the band), so Off is two filaments.
- **The export checked** (Astra: "two filaments" must match the file, the material patch included): a stainless M5 × 20
  socket-cap part label (the Studio's fixture t1) exported from the plate on loopback with the stripe at Bottom edge assigns
  four extruders in the 3MF's Slic3r config (Base → 1, text → 2, "band Metric" → 3, "band accent Stainless" → 4; the
  Studio's status says the same); with the stripe Off, two (Base → 1, text → 2), no band and no accent volume: the patch
  goes with the band. Astra's other confirmation, in the e2e: a `setting` without the frame's session changes nothing, one
  from the real frame with a stale rev is rejected and one at the current rev taken, and a change made while the plate is
  hidden reaches it on reopening.
- **Deployed and checked in production** (Joey: "go"; the Studio first, public main 331c0052, then the planner's main
  2fee225, run 38641378552 green): on planner.modulith.systems a part label on the plate, Off in the panel reaches the
  plate's Stripe position (its row note reads "Screw drawing", no stripe), End chosen on the plate comes back to the panel and the
  browser preference, and the 3MF downloaded with the stripe Off has two volumes on extruders 1 and 2.
- **Not done**: a printer-capability suggestion (Sol's D); the planner does not know a printer's colour count.

## 2026-10-14 (the Part Picker's refined flow, live)

- **Why** (Joey's hands-on pass): in the Picker modal one intent took two confirmations ("Queue N parts" in the right
  panel, then "Add N labels to the planner" in the bar at the other corner), an empty "M? × ?" part could reach the list, and the right column was dense
  for a first-time user. Joey's idea was stages along the top. A second session, the Label Studio Refiner, designed, built
  and stress-tested the refinement on the Picker's branch `flow-refine` under a brief from this one: the design
  (docs/FLOW-REFINE-2026-10-14.md, 9028a06c) reviewed by Sol 01a13c2c before the prototype (1305aed6; 9 of 9 held), the
  code by an internal review, a stress agent and Sol 01a13c5f / 01a13c96; the final build is 75a5d1b5.
- **What shipped**: a stage strip (Family · Type · Size · Lengths · Details) that is progress and navigation, never a gate;
  ONE add action in a bar pinned in every mode ("Add N labels to the planner" in the planner); "Pick more first" keeps a
  batch pending ("3 parts pending ×", the × announced as "Clear pending parts") and opens the stage before it; the reasons
  an add is not possible yet, beside it, as links to their stage (an untouched field blocks; a deliberate Unknown adds,
  with a warning); "This part" and "Your parts" on the right, the status words, pins and colours folded under "Part
  details", the list tools under "List tools". Astra's review of the prototype (relayed by Joey) chose that wording, had
  the stage heading clear the sticky strip, the disabled primary subdued (grey, no fill), and "N unspecified details"
  inside Part details instead of "N unknown" on the row.
- **The batch id** (Astra: a late reply credited to a later send could falsely confirm labels, so not cosmetic): the
  Picker mints a `batch` id on every `add`; the planner's modal and the Studio's sheet echo it on `added` and `refused`;
  the Picker credits a reply only when its batch matches the pending send and retires the id on a timeout.
- **Deployed receivers first**: the planner's echo (main 2c58a0e, live 22:48Z), then the Studio sheet's echo alone (public
  main 1d25ae87, live 23:45Z), then, after the Studio page's ten-minute cache (max-age=600), the Picker (public main
  56c546bc, live 23:56Z, its SOURCE.json naming 75a5d1b5). The planner's e2e case drives the new flow (e7d1587).
- **Checked in production** (headless, the same walk as on loopback): in the planner on the domain, the live Picker build
  75a5d1b5, M4 × 12 / 16 / 20, Pick more first, M5 × 16, ONE Add: four part labels in the build ("Added 4 part labels",
  the handshake log `ready, add`), and on reopening the Picker says "Added 4 part labels to your build."; in the Label
  Studio's own sheet, a hex M3 nut ("Add 1 part label"): one part row, the sheet closed, the Studio's reply carried the
  batch id back, and the Picker said "Added 1 part label to your list." with the row marked sent. No page errors, and no
  failed request outside the GoatCounter counter (its 429s filtered out, as placed earlier the same day).
- **A caveat**: a planner or Studio tab opened before these deploys still runs the old receiving code; reload it, or the
  Picker reports an add as not answered although it landed.
- **Later** (polish): the regular Nyloc picture at the same three-quarter angle, light and scale as the other nuts, with
  the insert visible.

## 2026-10-15 (the spacing pass and the label-flow stress test, live)

- **Why.** Joey, on the Part Picker's Sizes stage: "look how close these buttons are together, stuff like this should
  definitely be looked for". Then he asked the Label Studio Refiner session to stress-test the whole label flow:
  "no errors, flows well, and feels easy and welcoming to use".
  - Three agents ran headless as a newcomer and as a power user, at 1280, 1440 and 390 (touch), in dark and light,
    keyboard only, at the limits, with the Studio down or slow.
  - The findings: `D:\Claude - Output\label-flow-stress-2026-10-15\FINDINGS.md`.
  - The lanes: the Refiner fixed the Picker and the Studio; this session fixed the planner and the plate's EMBED paths.
- **Two of the fixes were bugs in the code that was live:**
  - **A new Tabletop build dead-ended.** Reproduced in production before the fix: "Can't show this build yet: A unit is
    floating", with a pageerror, and the same page again after a reload.
    - The cause: setMount rebases units onto the mount's edge only on a change of mount, and a fresh Tabletop build from
      a Tabletop kit is not one. A fresh starter is now rebased.
  - **A DOM XSS.** bootFail wrote the generator's errors into innerHTML, and those errors quote the share link's own
    fields. Every dynamic part is now escaped, and in the planner the failure page offers "Start a new build" and the
    kits.
    - Shown ON LOOPBACK, in the viewer page and in the planner: a crafted mount ran script. It was never exercised on the
      live site. The live fix was checked by reading the deployed main.js.
    - The old viewer (gen2build.jerrari3d.com, the GEN2 Visual Animator repo) has the same code. That fix is queued as a
      separate task.
- **The planner** (main 461fa1b … ea9720d). Each change's check is named beside it: an e2e case that fails on the old
  code, a measured probe, or a screenshot. The status clearing has no dedicated check.
  - **Spacing:** `#ws` tokens, 8 px between bordered controls and 6 px between list rows (measured by the spacing audit,
    before and after).
  - **The phone:** the label editor's sheet now opens (e2e).
  - **The label editor:** the icon search keeps its height (screenshot).
  - **Label settings** can reach "Printing part labels": `#ws .unit` became `.unit.key`, the foot scrolls on a desktop, and
    only the list and the foot give way (a probe at 1440, 1280 and 390).
  - **Wording:** the faceplate sentence is said once, and the in-page Part Picker loses the new-tab glyph (screenshots).
  - **Focus is kept across re-renders,** by stable data-focus keys (e2e):
    - the editor's open and close, from the keyboard;
    - a late icon font no longer commits half-typed words;
    - Escape with edited words no longer throws.
  - **The Part Picker dialog:** it traps Tab, gives focus back to the opener after an add, and closes on the Picker's `close`
    (Escape inside the frame) (e2e).
  - **The connection:** "Try again" when the Studio does not answer, instead of blaming the address (e2e).
  - **Status:** the status line clears on undo (no case of its own).
  - **Long labels:** an Enter that changes nothing no longer cuts a label over 40 characters (e2e).
  - **"Edit part details" opens that part** (open/1, LABELS-INTEGRATION.md). In another browser it is refused, with words
    that say why (e2e, against the Picker as built and against an older one).
- **The Label Studio** (public main 60c58d00):
  - **The plate is really read-only:** updateTypeUI and updateStripeBtn had re-enabled the type switch and the stripe
    buttons. Its planner-owned fields read as text (this session; the planner's e2e asserts the disabled controls).
  - **The Picker republished** (866322a4). These are the Refiner's changes, as it reported and tested them:
    - the Refiner found in the Picker's code that 12 of 17 families could send blank or partial labels while saying
      "Added" (FINDINGS K-B1); fixed in 50d298de;
    - pending parts are kept per build;
    - open/1 and close;
    - Remove has Undo;
    - spacing tokens with a durable `npm run spacing` audit.
  - **The Studio's own fixes**, the Refiner's, as it reported them, with its tests and its own browser check:
    - bad number settings are clamped with a note, instead of exporting NaN;
    - text that runs off the label stops the export;
    - Open set file keeps the Previous set, with Undo;
    - the preview's far plane follows the camera;
    - NFC normalisation, and a warning for missing glyphs;
    - Undo for remove, sort, affix, preset and bulk delete;
    - Enter goes to the next row;
    - a real CSV parse;
    - one export at a time.
- **Reviews:**
  - each batch by Sol or Terra: 01a13fb7, 01a13fc5, 01a13fda, 01a13fdc (4 of 4 held), 01a13fe5 (1 held), 01a13ff2,
    01a13ffb (1 held), 01a14005 (1 held);
  - the Refiner's own: Sol 01a13fac, 01a13fdf and 01a13ff8; Terra 01a13ff5 and 01a14009 / 01a14017.
- **Tests before the deploy:**
  - the planner: 498 unit tests passed, 0 failed, 5 skipped; 19 of 19 e2e cases passed, against the Studio worktree at
    301011e4;
  - the Studio: 18 files, 193 passed, 0 failed, 1 skipped.
- **Deployed:**
  1. the Studio first: 383b8160, ebaf0b2f and 301011e4 cherry-picked onto labels-public, tree-identical to planner-plate
     301011e4. Public main 60c58d00, its parts/SOURCE.json reading 866322a4 at 16:48:49Z;
  2. then the planner: main ea9720d, pushed at 16:49:11Z, run 38772162823 green at 17:06:22Z, the live index.html stamped
     v=ea9720d4;
  3. the Picker repo's master was fast-forwarded to 866322a4 and pushed to its own remote.
- **Checked in production** (headless, fresh profiles). "No errors" here excludes the GoatCounter 429 beacons and the
  WebGL/GPU notices, as before.
  - A new build with every default (Tabletop) boots with gridH 2 and one drawer at y 2, hh 2, on the floor, with no
    errors.
  - The deployed main.js escapes bootFail's message and offers the way out. This was read from the file; no payload was
    sent.
  - The plate's type select and stripe buttons are disabled, and its stripe preference is live.
  - The live Picker offers open/1. Edit part details is answered `opened`, Escape inside the Picker closes the dialog, and
    after an add, focus is on the opener.
  - On the phone, the label editor's sheet opens and its close is reachable, with no errors.
- **A caveat:** an open tab may still hold the code from before the deploy. Reload both the planner and the Studio.
- **Not done, and Joey's to decide or later:**
  - the type words for the 11 families, and the short forms for the 34 values that cannot print (both measured,
    WORDING_STATUS proposed; MODULITH measurements.md);
  - "Make labels →": a new tab, or the four ways;
  - whether a plate row also selects its drawer;
  - the plate's printer prefs (S-F6; the correction is in LABELS-INTEGRATION.md);
  - keyboard selection of a plate row;
  - a keyboard path to place a label;
  - a compact panel foot for small screens;
  - the Studio's phone first screen.

## 2026-10-17 (the Part Picker's round 3, live)

- **Joey's rule (2026-10-17).**
  - The Picker takes a value away only where a standard or physics rules it out.
  - A value that is only hard to buy stays, with a warning.
  - Custom is never refused.
  - Round 2's not-sold removals became warnings under the same rule. Nylon heat-set inserts stay blocked (physics).
  - His six round-3 answers are in the Picker repo's RESEARCH-HARDWARE-2026-10-16.md, section 6. The tables are in the
    MODULITH vault's decisions.md, under "What the Part Picker offers".
- **What changed, in the Picker:**
  - 60869eb5, round 3:
    - a hex head and a nut have no drive choice;
    - connectors offer tin or gold contact plating;
    - one ring size list per ring type;
    - spring washer ranges follow the newest editions;
    - inch lengths are suggested from commonly stocked ones.
  - 9d05a7a5: only the looks a part can have ship. 240 finish variants stay out, and 80 gold-plating renders were added.
  - fa512265: round 2's removals warn instead.
  - Nothing in the planner's code changed. The planner's Part Picker dialog loads the Studio's parts/.
- **Tests:**
  - the Picker: 256 tests; 255 passed, 1 skipped;
  - the Studio, on planner-plate with the republish staged: 18 files; 194 passed, 0 failed, 1 skipped.
- **Deployed:**
  1. The Studio: the republish was committed on labels-public in the ls-public worktree, as public main 8b29cb2b. Its
     parts/SOURCE.json read fa512265 at 18:28:52Z.
  2. The Picker repo's master was fast-forwarded to fa512265.
  3. The Studio's source branch planner-plate carries the same republish: fb39932b, a cherry-pick of 8b29cb2b, pushed
     to origin. Its parts/ tree is identical to 8b29cb2b's.
- **Checked in production:**
  - the round-3 blocks, warnings and Custom;
  - a look a part can have loads (200), and a pruned one is gone (404);
  - on planner.modulith.systems, the Part Picker dialog (parts/?embed=planner) reports ready, with open/1.
- **Reviews:**
  - the code: Sol 01a14a93 (2 of 2 held); Terra 01a14a99 (1, wrong); Sol 01a14ac2 (1 held); Terra 01a14ac4 (2, wrong);
    Terra 01a14b05 (round 2's warnings);
  - the vault entries: Sol 01a14aa0 (7 of 10 held); Terra 01a14aa6, 01a14ac8, 01a14b06 and 01a14b22.
- **A caveat:** an open tab may still hold the old Picker. Reload it.

## 2026-10-17 (side covers, live on every build)

- **Joey's call (2026-10-17):** "Deploy side covers now, shown on every build". The default-off toggle of the 2026-10-09
  decision is not built: the merged BOM already bills covers on every build, so the stage now shows them on every
  build. A real toggle needs a new build field, and BUILD_FIELDS is pinned to the old planner's.
- **What it is** (branch `side-covers`, `f28de1f` and `48f05b2`, by the side-covers session; Sol, two passes, no
  findings):
  - a cover goes on exactly the walls the BOM bills, at the release offsets; a test holds the stage to the BOM on the
    kits, edge cases and 400 random builds;
  - it is fitted after the case and before anything stacks on top: in from 30 mm off the wall, 3.8 mm up, a pause,
    then the slide down, under a close camera;
  - pink in Part colors (raspberry since 2026-10-18, see that entry); in the presets the core takes the case colour and
    the face the faceplate face colour;
  - builds are 5 mm wider, because the covers count in W; the ten kits gain 4 × 1H covers each.
- **Known limits:** a 4H–6H shelf end has no made cover size, so it stays bare with a warning (MODULITH known-gaps).
  Reading "face = the accent colour" as the faceplate face makes Sandstone's covers all brown and Signal's faces
  yellow; that reading is open for Joey.
- **Deployed, in this order:**
  1. gen2-parts master fast-forwarded to `d73facf` (the 27 GLBs and 27 thumbnails), served from 23:01:18Z;
  2. the planner: `side-covers` merged into main as `d8f55bb` (no conflicts), pushed 23:34:50Z, run 39079574241
     green at 23:49:48Z. The order matters: the side-covers session found that the planner's browser tests fail
     while the parts host lacks the 27 files (its smoke run fetched SideCover_185-1H from the live host and failed).
- **Tests on the merge, against the live parts host:** npm test 517 tests, 512 passed, 0 failed, 5 skipped; e2e with
  E2E_SOFT=1 and the Studio at ls-public `fa87f8df`, 31 of 31.
- **Checked in production:** the 185 2W-2H kit and a new build each draw 4 `SideCover_185-1H`; the Parts list shows
  "×4 Side Cover 185 · 1H"; no page errors, and no failed requests apart from GoatCounter's (not checked).
- **A test-setup gotcha:** STUDIO_DIR must be a Windows path with backslashes. The e2e server refuses any file whose path
  does not start with that string, so a forward-slash path turns every Studio request into a 403, and the five
  Studio cases time out.

## 2026-10-17 (label previews drawn from the 3D label; supersedes decision 3b)

- **Joey's report (2026-10-17, with a screenshot):** "the small labels differ from the actual labels". On the model, a part
  label for an M2 × 6 socket head printed "M2 × 6" over the screw drawing. Joey decided on 2026-10-07
  that the drawing replaces the head word. The panel's preview showed "M2 × 5 / SHCS", from the label's stored words.
- **Why they differed:** the previews were "decision 3b" (2026-10-13, the 2026-10-13 Labels entry above): the outline, the
  icon art and the words, chosen because the separate planner had no label core (about 1.2 MB more to load). The merged app
  loads that core for the stage anyway, so the reason no longer holds. A label's stored words keep SHCS on purpose: they are
  what older tools read. So the fix changes how a preview is drawn, never the words.
- **Now:** js/label-preview.js draws each EdgeLabel preview from the 3D label's own sources:
  - a part label from the same layout its ink is extruded from (label-text.js partLabelLayout, shared with
    partLabelGeometry), its even-odd outlines on a canvas;
  - an ordinary label from the same cached geometry the stage builds (labelGeometry: the wrap, the shrink and the badge),
    its top faces drawn flat;
  - a stripe from the Label Studio's band pieces, the face from the vendored EdgeLabel face;
  - the build's Label and Label:TEXT colours.
  The drawer rows and the selected drawer's card use that drawer's own look (labelLookOf). A label still waiting to be
  placed is drawn as a drawer wearing it would draw it (label-look.js labelLookOfLabel).
- **Unchanged:**
  - the CSS preview stands in until the font and the part data have loaded;
  - Classic Pro keeps it, because the stage draws no text on Classic Pro;
  - an icon-only label still shows its icon in the panel and nothing on the model (it has no words to mirror).
- **Checks:**
  - test/label-preview.test.mjs pins the face to the vendored data and the waiting-label look to the drawer's;
  - the e2e case "the label previews are drawn from the 3D label's own layout and geometry" proves one source: the preview's
    layout record is the 3D ink's, and an ordinary label's flat ink is the stage geometry's own.
  - Review: Sol 01a14ca2 (no findings).
- **Open:** the 3D label and the Label plate can still differ when this browser's print preference (the plate's stripe
  position or drawings switch) differs from the defaults. The stage always draws the drawings, with the stripe at the
  label's own position or the bottom.

## 2026-10-18 (side covers: raspberry in Part colors)

- **Joey's call (2026-10-18):** "use raspberry". He had asked whether the light pink suits the instructions; the
  colour-blind check below answered that it does not for deuteranopes.
- **The check:** CIEDE2000 under normal vision and under Machado (2009) simulations of protanopia, deuteranopia and
  tritanopia (severity 1.0), against every colour the identification palette emits (generate.js COLORS, SHELF_COLORS,
  EXTENDER_COLOR, FootAdhesive, the dark stage's Case) and the stages' surfaces.
  - The first pink `#ff9ec4`: 19.5 from the nearest part colour (the stopper) for normal vision, but 2.5 from the shelf
    insert under deuteranopia, the most common type. Against the light stage: 1.7:1 on the background, 1.4:1 on the floor.
  - Raspberry `#c2185b`: 18.3 from the stopper for normal vision; at least 9 from every part colour under deuteranopia
    (12.8) and tritanopia (9.4). Against the light stage: 5.1:1 on the background, 4.3:1 on the floor. The dark stage
    loses some: 3.2:1 and 2.2:1, where the pink had 9.9:1 and 6.7:1.
  - Its weak spot: under protanopia it comes within 2.0 of the adhesive feet's grey, a colour only builds with stick-on
    feet emit; the case is 9.0 away.
  - Set aside: a grid scan (sRGB in steps of 15, keeping colours with at least 3:1 against both stage backgrounds)
    found only muted colours staying 11 or more apart under every vision type (for example `#876969`), and those would
    read as plain plastic among the saturated part colours.
- **Changed:** generate.js `SIDE_COVER_COLOR` and the Parts list's chip (parts.js `chipFor`).
- **Tests:** the 60 golden screenshots and the ten kit manifests re-blessed. A pixel audit of the 60 old/new pairs:
  of 405,992 changed pixels, 15,193 were not pink in the old shot, and none changed by more than 50 per channel (edge
  blends and floor reflections next to the covers). npm test 520 (515 passed, 0 failed, 5 skipped); e2e 34 of 34.
  Review: Terra 01a14d3e (1 held, fixed).
- **Live:** `e351252`, run 39097744412 green at 04:52:32Z. Checked in production on both themes: the manifest and the
  stage give the side cover `#c2185b`, the Parts chip agrees, and no page errors.

## 2026-10-18 (Colors, step 1 of the redesign plan: the foundations)

- **Joey's go (2026-10-18):** "Continue", answering "Start step 1 of the Colors plan with the proposed defaults?". The plan
  is `D:\Claude - Output\colors-presets-2026-10-17\COLORS-PLAN.md`; it puts Astra's Colors notes, a read-only map of
  this code and a real-world palette study into six steps. Sol reviewed it (thread 01a14d1f). Step 1 changes nothing a
  visitor sees except the fixes; each step deploys only on Joey's go.
- **The defaults it accepted:**
  - D1: the side-cover face stays the faceplate's FACE colour.
  - D2: count every colour that must be printed, including label text and stripes, never bought hardware.
  - D3: applying a look sets the whole look.
  - D4: an edited look is named "<look> · edited".
  - D5: saved looks keep per-drawer colours.
  - Step 1 builds on D2; D3 to D5 shape later steps.
- **What step 1 adds:**
  - **A look can be shown without being chosen.** `stage.previewPalette` / `endPreview`: activeHex, activeLabel,
    altLerp and overrideFor read the shown look, so the model and the product previews wear it. Nothing saves it,
    relays it or puts it in the history, and `palette()` keeps answering the chosen palette. Every palette setter
    ends it first, and so does the Colors workspace before a commit or on unmount. No control calls it yet: the
    gallery, the compare tray and Surprise me (steps 3 to 5) will.
  - **A whole look is its own undo step.** The store merges any changes made within 350 ms, whatever they were, so a
    preset, a scheme, ★ My palette or an upload flushes the history on both sides, and so does a plate change.
  - **One filament count** (`stage.filamentsInBuild(look?)`, D2). It reads part by part the way the stage paints,
    and the Dock and every Shop list use it.
    - It fixes two bugs: the Dock counted bought hardware, and a preset's Shop list listed filaments for regions the
      build does not have.
    - A region on an identification colour, or a label stripe, is listed as printed with no filament picked.
    - A colour a picked filament already prints counts once.
  - **Every preset names its label-text filament** (it was the manifest's #1a1a1a): The Jerrari takes Elegoo PLA
    Black; Stealth and Signal take Panchroma Black. Sandstone had no black, so it gains Panchroma Black: the same
    look, and a shopping list that says what printing it needs.
- **Bugs fixed** (from the code map):
  - Undoing a plate finish left the stage on the new plate, because the generator never reads the plate. app.js now
    hands an undone or redone plate back to the stage, and `update()` resets the plate materials when a record
    swap carries another plate.
  - ★ My palette did not re-point the materials.
  - The label-text row said "follows Body" while it renders black.
- **Also on this branch:** the share-link validation fix (2fc4a90). A crafted `#scheme=` link or an uploaded file can
  no longer bring in a `javascript:` buy link, CSS or a `__proto__` key.
- **Tests:**
  - **Four new e2e cases:** a shown look leaves the palette, the saved palette and the history alone; a preset straight
    after a pick is its own undo step; plate Undo and Redo move the stage with the store; the Dock and Signal's Shop
    list count what this build prints.
  - **Mutation-checked:** with the history flush removed, the undo case fails; with app.js's plate hand-back removed,
    the plate case fails.
  - **The axis guard** (layer-detail-seam.test.mjs) now follows `resetPlateMaterials`, and covers the record swap.
  - **The totals:**
    - npm test: 520 tests, 515 passed, 0 failed, 5 skipped. The axis guard's file failed before its update and passed
      12 of 12 after.
    - e2e: 38 of 39. The miss was the Label plate's stripe case, a click that timed out at 37 s; it passed on a rerun
      (13 s), with the four new cases.
- **Review:** Sol 01a14d4f.
  - Held, and fixed:
    - a stripe in a colour a picked filament already prints was counted twice;
    - an unpicked region reported the manifest colour where the dark stage shows its light case.
  - Set aside: "the Dock should count with instruction colours on". That text is unchanged; with no look chosen there
    are no filaments to count.
- **Live (Joey's go, "Continue", 2026-10-18).** Main fast-forwarded to `9132e00`; run 39127134427 green. Checked in
  production, on the dark stage at the Fast tier:
  - a shown look leaves the palette, the saved palette and the history alone, and `endPreview` puts the chosen look back;
  - the bought magnets are not counted, the Dock reads "4 filaments", and Signal's Shop list has the 10 rows the count
    gives;
  - a plate change and Undo leave the stage and the store on the old plate together;
  - a crafted `#scheme=` link loses its `javascript:` link and its `__proto__` key, and the page has no `javascript:`
    href;
  - no page errors.

## 2026-10-18 (Colors, step 2 of the redesign plan: the look-card gate passes)

- **What it was:** a measurement the plan's review asked for before step 3's gallery is built on it. Can each card show
  the visitor's own build in a look, offscreen, without compiling shaders per look and fast enough for a gallery?
  Joey's "Continue" took the plan on from step 1. The pass marks were written before anything was measured, in
  `D:\Claude - Output\colors-presets-2026-10-17\STEP2-GATE.md`, which holds the full results.
- **The probe:** `stage.lookCard(look, opts)`, debug-only, with no control calling it.
  - It snapshots the finished build into its own scene once per manifest (2 to 3 ms), with the stage's light rig and
    environment.
  - Each look gets clones of the live materials (`cloneMaterial`, the same programs), resolved like `materialFor`.
  - It renders into its own target, with no `invalidateFrame`.
  - Its clones die with the base materials: `purgeLookCards` sits beside both material purges and in
    `dropStaleAxisMaterials`.
- **The result, at 384×288 on the root kit, dark stage:** it passes all four marks with one choice of target.
  - 0 new shader programs across looks.
  - About 6 ms per card on the laptop, and 13 to 16 ms with the CPU throttled 4×. That is a card's own time. Whether the
    live frame plus a card fits a frame is step 3's first check.
  - Against the real canvas, a median difference of 0 (p95 12 on Fast, 17 on Very High), on the build's interior. One
    card per tier.
- **The finding that decides step 3's render target:**
  - An ordinary render target skips three.js's tone mapping: 28 of 255 off on Very High.
  - A target flagged `isXRRenderTarget` with sRGB storage encodes twice: 73 off. three.js stores a render target's sRGB
    colour texture as SRGB8_ALPHA8 even on an XR target (`setupFrameBufferTexture`), so the hardware encodes after the
    shader has.
  - XR-flagged with RGBA8 storage matches the screen. Even its first card added no shader program, which fits reusing
    the screen's programs (same tone mapping and output colour space).
  - The flag is internal to three.js. The e2e case "Colors step 2: a look card ..." pins the match, with an ordinary
    target as the control. It was mutation-checked: with RGBA8 storage off, it fails.
- **What a card still lacks:** Very High's ambient occlusion and settle accumulation, and shadows on the light stage.
  Translucent filaments show as solid tints. Step 3 also needs a scene revision counter, because labels and style
  swaps change the build without a new manifest.
- **The method moved once, after the first results.**
  - The first fidelity check compared each card with the live scene drawn into the same kind of target. Every
    variant scored 0, so it could not see an encoding error.
  - M4 was re-measured against the canvas itself, and the RGBA8 variant added; the marks did not change.
  - The canvas comparison sizes the drawing buffer without touching the pixel ratio, which the relief's band limit
    depends on (the layer-detail-seam guard).
- **Review:** Sol 01a14f22. All 8 points held, and all are fixed:
  - **in the code:**
    - an unnamed filament pick no longer lightens alternate tiles;
    - cards run one at a time;
    - the live renderer is restored in a `finally`;
    - label and handle changes re-snapshot;
  - **in the report:** card latency is not frame pacing; one image does not prove the resolver; the discarded rerun
    and when the filters were fixed are now recorded; the scope is stated.
- **Tests on the final code:** npm test, 520 tests (515 passed, 0 failed, 5 skipped); e2e, 40 of 40, the gate case
  included. The gate itself was rerun on the final code (`gate4`), and every fidelity figure reproduced.
- **Recorded in the vault:** measurements.md, "Offscreen renders and the screen" (4e2c8bc; Sol 01a14f29). It includes
  the unmeasured consequence that the Build workspace's product previews (`renderThumb`) get no tone mapping on the
  tone-mapped tiers.
- **Not deployed.** The branch is `colors-step2-gate`; a debug hook has no reason to ship before step 3 uses it.

## 2026-10-18 (Presets: the accent differs from the face; Jessie Neon Yellow; the "Neon yellow & black" preset)

- **Joey, on his phone with EdgeLabel faceplates:** "I shouldn't have the accent color the same as the face for those".
  The EdgeLabel family's accent part sits on the face and vanishes into one of the same colour. The four presets of
  2026-08 never matched them; four of step 3's seven did (Grey & sunlight yellow, Safety yellow & black, Printer black &
  red, Flight-team navy & gold) and now take another colour the look already prints; Flight-team's is the navy, since
  white would fade on its yellow face (Terra 01a15087). `test/presets.test.mjs` pins Accent ≠ Faceplate:FACE.
- **"Can we add Jessie neon yellow as an available color?"** Printed Solid Neon Yellow joins the catalog (112 colours).
  Its hex `#E4E202` is the median of the centre third of the maker's swatch photo (no colour code is published). The
  catalog's source of truth, `gen2-visual-animator/viewer/js/filament-db.js`, and the Filament Material Lab's copy (its
  pinned hash bumped) were re-vendored the same day. Terra 01a1508a.
- **"Neon yellow & black"**, the twelfth preset, is Joey's own 3D Printopia build (his photo): Chevron faceplates with
  every face black, the body in neon yellow, handles in plain black PLA (that build wore a holographic build plate: the
  plate finish, not a colour). Shell in Neon Yellow; faces, grips, drawers, handles and the deck (13:1) in Elegoo PLA
  Black; accents and hardware neon. Terra 01a1508e, no findings. The presets test pins 12.
- **Checks:** presets.test.mjs 12 of 12 and filament-db.test.mjs 5 of 5 on the final code (Terra 01a150b8 caught the
  earlier "17 of 17", which was both files together); a change Joey decided in words
  deploys once its checks pass.
- **Live:** main 03ee0bd (261cc80 accent rule + Neon Yellow, 81ceda9 the preset, 03ee0bd the night grid and setup
  sheet), run 39161157605 green 16:26, live stamp `03ee0bdb`. Production check (evening-prod.mjs, desktop and
  375×844): 112 colours with Neon Yellow `#E4E202` and its Printed Solid URL; 12 presets, the last "Neon yellow &
  black" (Case Printed Solid Neon Yellow, Faceplate:FACE Elegoo PLA Black); accent ≠ face and grip = face hold on
  every preset.

## 2026-10-18 (the night stage's grid back to the old cyan; the setup sheet on a phone)

- **Joey, comparing the old viewer and the planner on his phone:** "Is it just me or does the new grid feel darker" ...
  "I like the old more". The shell's `night` stage (2026-10-12: the grid two steps quieter and the floor reflection
  halved, from Astra's review of the first Build screen) now matches `dark` exactly: grid `0x2b7f9e`, the reflection at
  the stage's default. The entry stays as the shell's mode name. This reverses the 2026-10-12 choice on Joey's word.
- **Joey, tapping the mount chip on his phone:** "it just opens a broken menu and expands my keyboard". The Build setup
  sheet's box carries the class `sheet` inside `#ws`, so the phone's bottom-sheet rules took it: positioned at the Dock,
  slid to its 44 px peek and clipped (measured at 375×812: top 642, translateY 410 px, clip-path to 44 px), with the name
  field focused and the keyboard up. A phone rule below the phone block gives the modal its own layout back (top 64,
  full width, scrolling inside), and on a phone the dialog's focus lands on its close button; the desktop keeps the name
  field focused (the keyboard e2e case). `matchMedia` guarded for environments without it (Terra 01a15096, held).
- **Checks:** the keyboard, setup-sheet and every-workspace-boots e2e cases (5 of 5) on the final code; node --check
  on setup.js. Both changes are Joey's in words, so they deploy once checks pass.
- **Live:** main 03ee0bd, run 39161157605 green, stamp `03ee0bdb` (see the entry above). Production check: the
  `night` theme's grid reads `#2b7f9e` on both viewports; the setup sheet at 375×844 sits at top 64 with no transform
  and no clip-path, focus on `BUTTON.x`; on the desktop it keeps the name field focused.

## 2026-10-18 (Colors, step 4 of the redesign plan: the compare tray)

- **Joey's go:** "Go" to the proposed step 4, the same day step 3 went live. The plan's step 4 as approved
  (COLORS-PLAN.md): two or three finalists, flipped with the camera held still, flips through the preview API, never
  touching the safe area; the step's record is `D:\Claude - Output\colors-presets-2026-10-17\STEP4.md`.
- **Finalists:** up to three, in a list that survives the gallery closing and a remount. They come in from a "+" on
  every gallery card, from "Add to Compare" in a look's details, and from "Add current look" in the tray; the gallery's
  head counts them ("Compare (2)") and opens the tray.
- **The tray** sits over the stage above the Dock (a sheet on the phone). The gallery and the tray never show together
  (Astra: contextual panels do not pile up over the model): opening one closes the other, and the finalists keep. The
  part card hides while the tray is open, as under the shopping list.
- **A flip shows a finalist and nothing more:** `previewPalette`, no re-render of the workspace, so the safe area is
  never set and the camera stays. "Current" puts the chosen look back. Measured (STEP4.md, marks written first): on this
  laptop at Balanced, dpr 1, a flip reaches the next drawn frame in a median 10 ms (max 16) over 20 flips; the camera
  and the safe area are unchanged to the number (M8 and M10 pass; 4× throttled and Very High: STEP4.md).
- **The safe area's floor lifts once, when the tray opens,** by the tray's height, so an auto-fitted model rises above
  it; the stage refits only a camera the visitor has not taken. A flip never touches it.
- **Apply** goes through the gallery look the finalist came from (a preset's own apply and its event; a saved look's
  per-unit layer), or as a scheme of the finalist's colours when that look is gone; one undo step. The tray stays open.
  Deleting a saved look in the details also takes it out of the tray.
- **Tests:** two e2e cases (the desktop flow: enter, Compare (2), the tray replaces the gallery, a flip is shown and
  not chosen with the palette, the camera, the safe area and the history untouched, the second finalist replaces the
  first, Current, Apply as one undo step, remove, Escape; the phone sheet), one mutation-checked.
- **Review:** Sol 01a15017, no findings. **Checks on the final code:** npm test 521 (516 passed, 0 failed, 5 skipped);
  e2e 46 of 46 (soft rendering, the Studio checkout served); the desktop tray case mutation-checked (a flip that chose
  the look through `setPalette` fails it at once). Flip latency measured by hand, STEP4.md §4: M8, M9 and M10 pass.
- **Live (Joey, 2026-10-18: "Deploy").** Main fast-forwarded to `6bf1853`; run 39152794735 green on the first try,
  live stamp `6bf18532`. Checked in production with `D:\Claude - Output\planner-prod-checks-2026-10-18\step4-prod.mjs`,
  desktop 1280×800 and a 390×844 phone viewport, both on Very High: two finalists from the gallery's "+", the head reads
  "Compare (2)", the tray opens in the gallery's place (a sheet titled "Compare · 2 of 3" on the phone), a flip shows
  Stealth (Case #2b2b2e) with the palette, the camera, the safe area and the history unchanged and the shown card
  marked, the second finalist replaces it (Drawer #d23a2e), Current ends the preview, no preset event, no page errors
  on the desktop (the phone run, opened seconds after the desktop one, logged the same single third-party 429 as the
  step-3 check; a plain re-load does not reproduce it). Nothing was applied in production.

## 2026-10-18 (Colors, step 3 of the redesign plan: the current-look card, Browse looks, look details, the new presets)

- **Joey's go:** "Start Colors step 3" (the "MODULITH planner-2 | 10-18" session). The plan's step 3, as approved
  (D:\Claude - Output\colors-presets-2026-10-17\COLORS-PLAN.md); the step's own record is STEP3.md beside it.
- **The panel:** the premade list and "Your schemes" are gone from the sidebar (Astra: more rows pushed "Colors in this
  build" down). In their place, one card: this build rendered in its current colours, the look's name (D4: the matching
  preset or saved look, "<that look> · edited" after a hand change, "Custom look" with no source), its filament count and
  swatches, then Browse looks, Surprise me (disabled until step 5), Save, and Download / Upload / Share behind "⋯".
  "Colors in this build" sits directly under it.
- **The gallery** opens over the stage's left (540 px; the view tools step right of it; the camera's safe area is never
  touched, so the model stays put while looks are tried): Featured (the presets), My looks (★ My palette, the saved
  looks), All looks; a search; a filament-count filter counted on THIS build. Every card is this build wearing that look,
  from step 2's `lookCard`, keyed on the scene revision, the look as the build wears it, the tier and the stage theme;
  drawn one per animation frame; dropped when the build changes or the gallery closes. Hovering or focusing a card shows
  the look on the model (`previewPalette`: never saved, never in the history, never a preset event).
- **The details** take the gallery's place: the big render, Apply this look (one undo step; closes the gallery), Delete
  for a saved look, Shop this look (moved here from the preset rows: the filament rows as this build wears the look,
  Buy links with the disclosure at the link), a screen-preview note, an appearance-not-suitability note, and a
  translucent note where a look uses a translucent filament (the card shows it solid).
- **Saved looks keep per-unit colours** (D5): Save stores `over` beside `colors`; Download and Share stay colours only,
  for the Studio.
- **The new presets:** seven from the palette study (Racing silver & teal, Grey & sunlight yellow, Safety yellow & black,
  Printer black & red, Tri-stripe racing white, Black & gold, Flight-team navy & gold), each with the label text in a
  dark filament the look already prints. **The grip wears the face colour** (Joey, on the first cards: "with this
  faceplate i'm not a fan of the grip being a different color from the face"): four of the seven drafts split them and
  were folded; the presets test pins the rule. Tool-chest red waits for its scoring. The presets test pins 11.
- **The scene revision** (`stage.sceneRev`): bumped by a new manifest, by the label meshes redrawn in place, and by a
  handle or faceplate style swapped in place; the look cards snapshot once per revision.
- **`lookCard` reworked for a gallery:** the draw runs one at a time into a pooled target; each card's readback is
  awaited on its own, so cards overlap on the GPU. Measured first: the step-2 shape (one card's fence before the next
  draw) ran 50 to 190 ms a card in the planner's page, 1.2 s for 11 cards at 25 ms a frame.
- **The first check, frame pacing** (STEP3.md, marks written before measuring): on this laptop in real Chrome, dpr 1,
  1280×800, Balanced, one card a frame: 11 cards in 128 to 145 ms once warm, frames p95 16.7 ms, max 16.8 ms (M5 and M7
  pass; the first fill after launch: 356 ms, p95 41.7 ms). Throttled 4× and Very High: STEP3.md §3.
- **Phone:** the gallery is a third bottom sheet, one open at a time; the panel's card puts the render beside the name
  so Browse looks stays in the first screen; closing the gallery returns to the Colors sheet. Checked in the desktop
  app's browser pane at 375×812, not yet on a real phone (the plan's acceptance).
- **Tests:** presets.test.mjs (11, the names, the grip rule); e2e: the Colors preset case moved to the gallery, the
  350 ms case and the Shop case follow it, plus the gallery case (cards drawn and keyed, hover shown-not-chosen, cards
  follow a build change and Undo, no preset event), the loose pacing gate, the phone sheet case.
- **Reviews:** Sol 01a14f91 (substantial), 3 of 3 held and fixed: a saved look read as "Applied" when only its per-unit
  colours differed (looks now match on colours AND the per-unit layer, which also names such a look "· edited"); a saved
  look deleted by a captured index (now by name, read fresh, so another tab's save cannot shift it); the search box
  rebuilt under the caret (the grid alone follows the search now). The Terra pair 01a14f96 (pair-sol-0335), 3 of 3 held:
  the first two again, and Apply on the phone leaving every sheet collapsed (it returns to the Colors sheet).
- **Checks on the final code:** npm test 521 (516 passed, 0 failed, 5 skipped); e2e 44 of 44 (soft rendering, the Studio
  checkout served); the gallery case mutation-checked (with `mountManifest`'s revision bump removed it fails on "the
  revision moved with the unit"). Two unit tests that lift the handle and faceplate swaps out of main.js needed
  `let sceneRev = 0` in their sandboxes.
- **Live (Joey's go, 2026-10-18: "Deploy Colors step 3").** Main fast-forwarded to `66d91b0`. The first run
  (39142321766) failed on the new pacing gate itself: the runner's software rasteriser filled the 11 cards in 8.9 s
  against a 5 s bound, so the gate took the runner's bounds (`a4a49ee`, 30 s and a 2 s frame; Terra 01a14fce). The
  second (39144483279) fell on the idle-gate case's 1.5 s window, which passes locally and had passed the run before;
  an empty commit (`3011d62`) re-ran it: green, live stamp `3011d62a`. Checked in production with
  `D:\Claude - Output\planner-prod-checks-2026-10-18\step3-prod.mjs`, desktop 1280×800 and a 390×844 phone, both on
  Very High: 11 presets, the grip rule holds in every one, the panel's card names "The Jerrari · 4 filaments" and is
  drawn, the gallery's 11 cards fill in about 200 ms keyed on the live scene revision, a hovered card shows Stealth on
  the model (Case #2b2b2e) with the palette unchanged and leaving ends it, the details show Stealth with 4 filament
  rows and 4 Buy links and Apply, the phone's gallery sheet is titled after the look, no preset event, no page errors
  (the phone run, opened seconds after the desktop one, logged a single third-party 429 that a plain re-load of both
  viewports did not reproduce).

## 2026-10-18 (MakerWorld and Cults 3D hidden from the store links)

- **Joey's call (2026-10-18):** "I noticed i don't like how we link to makerworld or cults, if it doesn't exist on their
  site it instead does a standard search, lets just hide makerworld and cults for now until eventually i upload more
  models there".
- **Changed (`b2fb64c`):**
  - the Parts list's Download site switch offers Printables and Thangs only, and no row links either hidden store;
  - the viewer's store picker and its part links list neither;
  - a saved choice of either reads as Printables, the preference itself included;
  - `?from=` arrivals from either are still tracked.
- **Not changed:** the vendored catalog (`js/catalog/data.js`) still carries both. To bring one back, use
  `SHOWN_STORES` in main.js and `STORES` in parts.js, then update the e2e case.
- **Checks:**
  - a new e2e case, mutation-checked;
  - npm test 515 passed, 0 failed, 5 skipped; e2e 40 of 40;
  - review: Terra 01a14f3d, 1 held (normalise the preference itself), fixed;
  - vault decisions `40c41f2`.
- **Live:** run 39133529005 green. Checked in production with saved choices of both hidden stores: the Parts list
  shows Printables and Thangs with Printables on, and so does the viewer's picker; no link to either store anywhere;
  no page errors.

## 2026-10-18 (Colors, step 5 of the redesign plan: Surprise me, with constraints)

- **Joey's go:** "continue with colors step 5", the evening the batch of fixes went live. The plan's step 5 as approved
  (COLORS-PLAN.md §4): lock colours or parts; Subtle, Playful or Wild; a cap of 2, 3 or 4 filaments set by the visitor
  (the planner cannot know a printer's colour count); optionally only filaments the visitor owns, a new list kept
  outside the vendored catalog and keyed by label; three candidates with Keep, More like this and Try again; generated
  looks under the preset rules (the deck at 4.5:1 from inside the look, lower and upper parts sharing a colour, the
  extender, the lip and the side-cover core in the case colour, the side-cover face as D1 reads it).
- **The generator is pure and seeded** (`js/colors/surprise.js`): a look is built from roles (shell, drawer, face,
  grip accent, accent, handle, label and its text, the small parts, the deck, the bought hardware) and written out to
  the 27 keys every preset sets, so the product rules hold by construction and are checked once more before a look
  leaves (`checkLook`). `test/surprise.test.mjs` re-states every rule independently of the generator and holds 6,800
  looks (3 moods × 3 caps × 3 catalogs × 100 seeds) to them: 100 % pass, and the share of settings that return fewer
  than three is printed, never hidden. The study's colour maths (CIELAB, CIEDE2000 against the 34 Sharma pairs, WCAG
  contrast) moved into the runtime as `js/colors/colour.js`.
- **Moods read the catalog in LCh:** neutral under C 10, muted to 25, mid to 45, vivid above. Subtle: a neutral or
  muted shell, nothing vivid, at most one colour above C 25, hues within 60°. Playful: a neutral shell, the rest neutral
  or vivid with at least one vivid, in a harmony (hues within 40° or 100–180° apart). Wild: a mid or vivid shell, the
  rest mid or vivid at least 60° apart or neutral. Two filaments in one look read as two colours (CIEDE2000 ≥ 10); no
  translucent filament is picked (a card would show it solid). **Two things moved while building:** Wild as first
  designed ("everything mid or vivid") found nothing for an eight-filament owned list, because a deck or a label text at
  4.5:1 needs a light or a dark colour and the vivid part of the catalog sits at mid lightness, so Wild admits neutrals;
  and the cap is a ceiling, not a count, because Subtle at cap 4 found nothing where four neutrals read as three.
- **Locks** are per role, offered as chips for the regions that drive a look and that the build has (Case, Drawer body,
  Face, Accent, Handle, Label, Shelf deck); a chip holds the filament the region wears now (a region on an
  identification colour cannot be locked: there is no filament to keep). A locked colour wins over the mood and over the
  owned list, and counts toward the cap. A rolled face is never the shell's filament (the face is the look's statement);
  a locked one may be, as Black & gold's is (Sol 01a150df: the generator refused the pair as "No look fits"), and such a
  look is named by its accent.
- **The owned list** is `gen2-owned` in this browser (`js/state/owned.js`: catalog labels only, each once; a label that
  leaves the catalog drops out on the next read; a storage that throws reads as nothing owned). It is edited in the
  panel: every catalog colour by brand, ticked or not, with a search. "Only filaments I own" stays off and disabled until
  the list has two. Every way out of the editor (Back, Escape, the close button) reconciles: the switch drops under two,
  and the candidates roll again when the list changed under the switch (Sol 01a150df: Escape and close skipped it, so
  Keep could apply a filament just unticked); the panel also re-rolls on opening when its candidates no longer fit the
  list.
- **The panel takes the gallery's spot** and closes the gallery and the tray (contextual panels do not pile up over the
  model). Candidates draw through the gallery's card pump and `stage.lookCard`, one a frame, and show through
  `previewPalette`: hovering shows one while none is pinned, a click pins it (a phone has no hover), the same click frees
  it. Keep applies a candidate as a scheme of its own (one undo step; the current-look card then reads the candidate's
  name, decision D4). More like this keeps a candidate's shell and face and re-rolls the rest; Try again rolls three
  more. Fewer than three is said in a note, never hidden. Opening, hovering, rolling and keeping never touch the safe
  area, so the camera stays (step 4's rule). Names read "<face> on <shell>", with the third colour when the look has one.
- **No stage change.** No analytics: a candidate never goes through `applyPreset`.
- **Measured (STEP5.md, marks written first):** 6,800 generated looks, none breaks a rule; the three candidates always
  differ in shell and face, 23 distinct shells over 50 rolls; a roll of three in a median 0.2 ms under node; the safe
  area and the camera unchanged to the number across opening the panel and 20 Try agains at Balanced, 4× CPU and Very
  High; Try again to the third card drawn in a median 43–56 ms at Balanced (max 95), 44 ms at Very High (max 123),
  289–364 ms at 4× CPU (max 607, one re-render frame of up to 308 ms, reported with no mark).
- **Checks:** npm test 537 (532 passed, 0 failed, 5 skipped); e2e 48 of 48 (soft rendering, as CI runs it), two new
  cases, the desktop one mutation-checked (Keep through `previewPalette` fails it at "the build wears the kept look");
  review Sol 01a150df, two findings, both held and fixed before the commit.
- **Live (with 5b below):** Joey, "Deploy Colors step 5 + 5b", 2026-10-18. Main fast-forwarded to `3526e5a`; run
  39172061740 passed the tests and the smoke and failed at the deploy's module-graph guard (the new modules' imports
  carried no `?v=` stamp), so nothing shipped; `aedb37a` added the stamping lines (replayed locally with the guard;
  Luna 01a1512b); run 39173205072 green, live stamp `aedb37a3`. Production check `step5-prod.mjs` on the desktop and
  a 390×844 phone viewport: the panel opens in the gallery's spot with the five tiles (15 swatches), three candidates
  drawn and named in colour words with the accent share rising (quiet / balanced / bold), a hovered candidate shown and
  not chosen, Show three more with the camera and the safe area unchanged, Use this look wearing the look as one undo
  step and the panel named after it, Undo restoring The Jerrari, no preset event, no page errors.

## 2026-10-18 (Colors, step 5b: "Find your next look", Astra's refinement of Surprise me)

- **Astra, relayed by Joey the same evening,** on the step-5 panel: "'Mood' ... describes how adventurous the generator
  is, but doesn't help someone picture the result"; styles "with a sense of place, rather than literal room categories",
  five of them, "each as a small palette tile with three swatches"; "make the three results deliberately different
  interpretations of the chosen style - one mostly neutral, one balanced, one with a stronger accent", counting "the
  visible area carrying the accent, not simply how many part categories receive it"; "Keep" → "Use this look", "Try
  again" → "Show three more", keep "More like this"; short names "such as 'Sand & charcoal'" with the filaments in
  Details; Face and Handle locks kept; "Let Retro pop be a smaller, well-curated collection"; shiny finishes not the
  default; and "the generator's rules make a look consistent with the planner's constraints; they don't by themselves
  establish that every material is suitable for every printed part". Joey: implement it before deploying (her "settled
  enough to implement now", relayed, read as the go to start, not to deploy).
- **Styles are pools and relationships** (`js/colors/styles.js`): Warm & natural (warm neutrals and whites shell it, the
  earths accent it, nothing vivid), Clean & calm (whites, greys, silvers; the quiet blues and soft greys), Workshop
  classic (blacks, charcoals, steel grey, deep blues; reds, oranges, yellows), Retro pop (a named collection: eight
  shells, cream one of them; thirteen accents), Anything goes (a neutral or chromatic shell, any mid or vivid accent).
  Each has a least hue distance and a silk weight (a silk survives a pick at 0.25 in the two calm styles, 0.5 in the
  workshop and retro ones). `test/styles.test.mjs` pins every pool as a label list.
- **Three interpretations, told apart by visible area** (`AREA` in surprise.js: an estimate of the root kit's silhouette
  by role; shell 0.44, face 0.24, deck, drawer, handle, accent, label, small, grip accent the rest): quiet puts the
  accent colour on the Accent part and the grip accent only, balanced on the face, bold on the face, handle, small parts
  and drawer body too; the share must rise slot to slot or the slot is dropped; nothing is padded. A cap of 2 gives two
  (a quiet look needs a third colour for its face).
- **Names are colour words** (`js/colors/words.js`, 36 words over LCh regions with named overrides for the finishes:
  chrome, gold, brass, bronze, rose gold, titanium, clear, natural), "<Shell> & <accent>" from the two colours carrying
  the most visible area, locked colours included; the filament names stay in the tooltip, the toast and Details.
- **Details** is the gallery's own look details for the candidate; Back returns to the panel.
- **Measured (STEP5B.md, marks written first):** 8,400 generated looks, none breaks a rule; every colour inside its
  style's pools; the accent's visible share rises slot to slot in 600 of 600 sets (medians 0.07 / 0.27 / 0.40); silk
  shells 5–8 % in the three calm styles; three candidates in 100 % of calls on the whole catalog at caps 3 and 4, Retro
  pop included (a cap of 2 gives two, by design); 112 of 112 colours have a word, rolls named apart; Show three more to
  the third card drawn in a median 38–43 ms at Balanced, 40 ms at Very High, 120–129 ms at 4× CPU (faster than step
  5, whose mood generator re-rolled whole sets); the camera and the safe area unchanged to the number in every round.
- **From the review (Sol 01a15101):** "More like this" could hand back the candidate's own shell: held and fixed (the
  candidate's shell is passed as `notShell`). That the three interpretations may carry different accent colours was
  read as the design (three interpretations of the style, not one colour three times) and left as is, recorded for
  Astra and Joey.
- **Checks:** npm test 546 (541 passed, 0 failed, 5 skipped); the two step-5 e2e cases extended (the tiles, "In use",
  the cap of 2 giving two with its note) and green; the whole e2e suite under soft rendering 47 of 48, the one failure the
  Label plate's faceplate-switch case on a visibility wait (37 s), which touches nothing 5b changed and passed on the
  5b worktree and on main, with and without soft rendering, when run again (four of four): a load flake, recorded, not
  fixed. Review Sol 01a15101, one finding held and fixed, one discarded as the design.
- **Live:** with step 5, 2026-10-18 (see the step-5 entry: run 39173205072, stamp `aedb37a3`, the production check).

## 2026-10-18 (the Parts list names the filament each part prints in)

- **Joey (2026-10-18), on the Parts tab after choosing colours:** "the parts have the instructions colors assigned to
  them, which is kind of confusing after assigning chosen colors to it".
- **The call:** with the visitor's colours on (`stage.palette().on`), a Parts row's chip is the filament the part prints
  in, and the identification colour, the one the Assemble instructions use to tell parts apart, stays only as a thin ring
  around it. With the colours off nothing changes: the chip is the identification colour, as before.
- **Changed (branch `parts-print-colours`, not deployed):**
  - `js/workspaces/parts.js`: a row's type comes from its BOM name (`typeOf`, ordered like `chipFor`; bought hardware and
    anything the stage does not model answer null and keep the identification chip). One read per render of the Colors
    tab's source, `stage.keysInBuild()` for a type's regions and `stage.filamentsInBuild()` for what each wears
    (`paletteSnapshot`): a part with zones, or units with their own picks, shows the distinct colours side by side
    (at most four), body first. Under the name: "Print in Black · face Mystery Orange", every filament name the buy link
    the Colors tab uses (paid links marked as there); a zone that follows its body is not repeated; a region with no pick
    reads "no pick yet", a row with none "No filament picked yet". The caption reads "Chip = the filament it prints in ·
    ring = its colour in Assemble · dashed = buy" while the colours are on. Copy as text gains a "Print in:" line per
    row and the CSV a "Print in" column (empty with the colours off); Print prints the list as shown. The list subscribes
    to the store so an Undo of a colour change re-renders it.
  - `js/workspaces/colors.js` exports `ZONE_LABEL`, `isPaid` and `short`, so both tabs word a zone, a filament and a paid
    link the same way.
  - `css/app.css`: `.chip.fil` (the ring), `.chip.multi` (the swatch strip), the dotted link in the line.
- **Checks:**
  - `test/parts-print-colours.test.mjs`: every BOM row name across the mounts, feet and faceplate styles maps to a stage
    type (bought hardware to none); the snapshot, the words and the swatches on a fake stage;
  - a new e2e case: Stealth applied through the Colors gallery, then Parts: the case row's chip is the case filament's
    colour with the ring, the line names it with a buy link, the caption, the CSV column; `setUseCustom(false)` puts the
    identification chip and the old caption back. Mutation-checked: a chip that ignores the palette fails it on the
    chip's colour;
  - npm test 525 (520 passed, 0 failed, 5 skipped); the Parts and Colors e2e cases 15 of 15;
  - review: Terra 01a15119, 1 returned, 0 held (its "adopt commits are cross-tab changes the list misses" is wrong: an
    adopt is a same-tab load of the stage record by a workspace's own handler, which re-renders itself; the Build, Colors
    and Labels tabs skip it the same way).
- **Not done:** the inspector's "This unit · parts" list still shows no colours.
- **Live:** Joey, "Deploy the Parts-list change", 2026-10-18. Merged into main as `26a4123` (the DECISIONS conflict
  resolved with both entries kept; the deploy's stamping line added for parts.js's new `./colors.js` import, the
  module-graph guard replayed locally); on the merge npm test 544 passed, 0 failed, 5 skipped, e2e Parts + Colors + boot
  18 of 18; run 39177428150 green, live stamp `26a41231`. Production check `parts-colours-prod.mjs` on the desktop and
  a 390×844 phone viewport, Stealth applied: the case row's chip is Panchroma Black with the identification colour as a
  ring, "Print in Black" with the Polymaker link, the caption "Chip = the filament it prints in · ring = its colour in
  Assemble · dashed = buy", four dashed buy chips kept; colours off: the identification colour, no line, the old
  caption; Undo restores The Jerrari; no page errors.

## 2026-10-18 (Colors, step 6 of the redesign plan: Simplify to fewer filaments, and the confidence summary)

- **Joey's go:** "go, but also what's left after that?", the last step of the Colors plan. The plan's step 6 as
  approved (COLORS-PLAN.md §4): Simplify previews exactly which parts would change, then asks before applying; the
  summary reads "3 filaments used · Case: Black · Fronts: Orange · Grips: Silver · Keep this look", with "Review
  filaments" under it keeping appearance and material suitability apart.
- **Simplify is a pure merge under the rules** (`js/colors/simplify.js`): one step at a time, the filament carrying the
  least visible area (the role-area weights of step 5b, over the keys this build has) is mapped, per-unit picks
  included, onto the closest colour of the look (CIEDE2000) under which every preset rule still holds on the look as
  worn (a rule applies only when the build has both its keys: no shelf, no deck rule); when no colour can take it, the
  next-least filament is tried; when no step is possible the result is short and says why ("Two filaments must stay:
  the deck or the label text needs a colour that reads against its background"). Nothing from outside the look is
  brought in; a key that wore no merged filament is never touched. `test/simplify.test.mjs` holds 1,476
  simplifications of 900 generated looks on two builds to the rules re-stated independently, re-derives the
  least-visible / closest-colour choice for 572 single steps, and checks that per-unit picks move with their filament.
- **The panel** (`#ws-simplify`, the tray's spot; a sheet on the phone): "Down to" with the counts from one fewer to
  two, the changed regions as rows reading original → final per filament (a filament merged twice shows once, where it
  ends up: the first rows listed the generator's steps and read as two changes for one filament), the outcome line,
  "Apply · N filaments" and Cancel. The proposal is shown on the model through `previewPalette` while the panel is up
  and never chosen; Apply is one undo step (`commitColors('scheme', ...)`), after which the card reads "<the look> ·
  edited" (D4). It closes the gallery, the tray and Find your next look and never touches the safe area.
- **The summary** sits under the current-look card's swatch strip: "<count> filaments used" (the one count, D2) then
  the regions the build has grouped in a fixed order (Case, drawers, fronts, grips, grip accents, accents, handles,
  labels, label text, deck, small parts), neighbours sharing a filament joined ("Case, drawers: Black"), filaments by
  their short names; beside it "Keep this look" (Save, the name field focused), "Review filaments" (the shopping list,
  which gains "Appearance only: whether a filament suits a part (strength, heat, flex, the printer) is a separate
  question.") and "Simplify…" at three filaments or more.
- **Caught while building:** the module's `worn` import shadowed the workspace's own `worn(key)` helper and broke the
  panel at boot; renamed on import. The deploy's stamping lines for the new module went in with the code (the lesson of
  step 5's first run).
- **No stage change. No analytics.**
- **From the review (Sol 01a151f0, three findings, all held at least in part):** the units' own picks are now worn,
  counted and validated through each unit's own view of the rules (a merge may not add a rule problem; one the look
  already had neither blocks it nor is its to fix); the bought hardware's stored entries are left alone by a merge,
  while the rest of the palette follows it on purpose (D3: a part added later matches the look; that half discarded,
  recorded); a group worn in two filaments splits by key in the summary ("Case: Black · Feet: Orange") and the line
  counts the units with their own colours.
- **Measured (STEP6.md, marks written first):** 1,476 simplifications of 900 generated looks on two builds, none
  breaks a rule, every target reached on the root kit, 95 short on the fuller build with a reason each; 572 single
  steps re-derived as least-visible → closest valid colour; the twelve presets' summary lines match the Dock's count
  with every region once; preview / Cancel / Apply as one undo step with the camera and the safe area unchanged; a
  simplification in a median 0.05 ms.
- **Checks:** npm test 554 (549 passed, 0 failed, 5 skipped, run alone: a run beside the e2e suite timed three
  browser-based cases out at 73 s that pass alone in 9 s); the two step-6 e2e cases three of three under soft rendering
  after one flake of the case's own making (it asserted the Save row's focus before the tick that sets it; it now
  waits); the whole e2e suite 49 of 51 under soft rendering, the two failures that flake and the Label plate's
  faceplate-switch case (the load flake recorded under 5b). Mutation checks: the rule check removed fails the unit test;
  Apply only previewing fails the e2e case. Review Sol 01a151f0, three findings, all held at least in part.
- **Live:** Joey, "Deploy Colors step 6", 2026-10-19 morning. Main fast-forwarded to `dddbdaf`, run 39242318988
  green, live stamp `dddbdaf1`. Production check `step6-prod.mjs` on the desktop and a 390×844 phone viewport: the
  summary's "4 filaments used" matches the Dock and `filamentsInBuild()`; Simplify opens in the tray's spot (a sheet on
  the phone) with "3 filaments" and "2 filaments", the row "Grip accents: Silk Silver → Orange", the proposal shown on
  the model with the palette, the history, the camera and the safe area untouched; Cancel leaves nothing; Apply drops
  the Dock to 3 as one undo step and the card reads "The Jerrari · edited"; Undo restores The Jerrari; Review filaments
  opens the shopping list with the suitability note; no preset event; no page errors (the phone run logged a
  third-party 429, as the earlier checks did). This closes the Colors plan, steps 1 to 6.
- **A wording nit seen in production, and Astra's answer (2026-10-19):** with the Classic faceplate's body in black and
  its face in orange, the line read "Fronts: Mystery Orange · Faceplate bodies: Black · Grips: Mystery Orange" (the
  split kept fronts and grips from joining). Astra: "Fronts → Grips → Faceplate bodies. Keep the visible, recognisable
  surfaces first." The faceplate body is its own summary group after the grip accents, so The Jerrari reads "Case,
  drawers: Black · Fronts, grips: Mystery Orange · Grip accents: Silk Silver · Faceplate bodies: Black · Small parts:
  Orange". And on Simplify's outcome line, her distinction kept: "fewer distinct filaments doesn't necessarily mean
  fewer printing colour changes or less waste" — the line now says fewer filaments means fewer spools to own and load,
  and that colour changes within one print depend on which parts print together. Both on branch `colors-polish`
  (Luna 01a15408), to ride the next deploy rather than a release of their own, as Astra said. **Live** with the
  previews deploy of 2026-10-19 (main `b32fcca`, stamp `b32fcca0`): the live Colors tab reads "4 filaments used ·
  Case, drawers: Black · Fronts, grips: Mystery Orange · Grip accents: Silk Silver · Faceplate bodies: Black · Small
  parts: Orange" and Simplify's line carries the spools sentence.

## 2026-10-18 (Build's product previews match the model on every tier)

- **Why:** the standing requirement above is product-faithful previews. The Colors step-2 gate
  (`D:\Claude - Output\colors-presets-2026-10-17\STEP2-GATE.md`) found that three.js r185 tone-maps only the screen and
  render targets flagged `isXRRenderTarget`. Build's previews (`renderThumb`) drew into an ordinary sRGB target, in a
  scene of their own: the shipped light rig, no environment map, no fill boost.
- **Measured first**, against marks written before any comparison
  (`D:\Claude - Output\preview-fidelity-2026-10-18\PREVIEW-FIDELITY.md`).
  - **The method.** Each preview is compared with the live unit, drawn through the screen's own path from the same
    camera. The figure is the largest channel difference over the preview's own pixels. The mark is a median of at
    most 6 and a p95 of at most 32, of 255.
  - **Off on every tone-mapped tier.** On Balanced, High and Very High (the default) the root kit's previews sat a
    median of 17 to 31 off the model, with a p95 of 31 to 67: a duller orange, on both stages. Fast matched (median 0).
- **The fix**, in `drawThumb`, the drawing half of `renderThumb`. That half was split off first, unchanged, and checked
  byte-identical against main's previews.
  - The target is flagged `isXRRenderTarget` and its texture is stored as RGBA8, the recipe the gate measured: the
    screen's tone mapping and colour space, encoded once. The flag is internal to three.js (line 14372 says "TODO Remove
    this when possible"), which is why the e2e case below pins the match.
  - The preview's lights take the stage's per-tier strengths, with the workspace's fill boost (`rigFor`, which
    `applyQuality` now uses too). Its scene takes the studio environment where the tier has one.
  - The tier is in the preview's cache key, and a draw whose tier changed while its part models loaded is dropped.
  - A new tier, from the quality pill or the auto-downgrade, reaches the workspace through `opts.onQuality`. Build
    repaints its preview images in place: no panel rebuild, so focus and open menus stay put.
  - Two debug-only hooks, behind `?debug=1`: `stage.thumbDraw` and `stage.thumbModel`.
- **After:** every compared image is inside the mark.
  - **The root kit:** median 0 and p95 at most 11 on the dark stage; median at most 3 and p95 at most 31 on the light
    stage.
  - **149 more, one factor at a time:** a decor, a classic and a shelf unit; the four presets; the five faceplate
    families; nine handle styles.
  - **Silhouettes:** the preview and the model agree exactly, 2 px in from their edges.
  - **The light stage's p95** is the stage's cast shadow on the unit, from the rest of the build and from the unit's own
    parts (the check cannot separate the two). A preview draws no shadows. With the stage's sun casting none it is at
    most 4.
  - **Cost:** per preview, within 2 ms of the shipped code. Boot compiles one shader program fewer, consistent with a
    preview now taking the screen's program parameters; a count cannot show which programs were used.
  - **Not compared:** translucent filaments, which sample what is behind them, and a preview has nothing behind the
    unit.
- **Tests:**
  - **The e2e case** "Build: a product preview matches the model on a tone-mapped tier and on Fast ...". It checks the
    first unit's inspector and tile previews on the dark stage, on Balanced and then on Fast: the colour, the
    silhouettes, the ordinary target as the control on Balanced, and the tiles repainting after the pill and after
    `setQuality`.
  - **Mutation-checked.** It fails:
    - without the RGBA8 storage (median 52, p95 73);
    - without the XR flag (11, 59);
    - with the old lights and no environment (8, 70);
    - without the repaint.
  - **The totals:**
    - npm test: 520 tests, 515 passed, 0 failed, 5 skipped (the same as before the change);
    - e2e under SwiftShader with the Studio tree: 40 of 40, then 41 of 41 after merging main (`8b1b965`, which brings
      the store-links case). npm test and the goldens again unchanged on the merge;
    - the 60 golden screenshots: 0 differ. They are the plain viewer's canvas, which draws no previews, so none was
      re-blessed.
- **Review:** Sol `01a14f5a`, two turns. All eight findings held and were acted on:
  - the colour figure could not see missing pixels, so the silhouette check was added;
  - the first tables' medians were upper-middle values, so they were re-run as true medians. The shipped figures were
    re-run on a reconstruction of the shipped drawing, hash-checked against main; every figure came out the same;
  - the e2e case's coverage was overstated, so the case was widened and is stated exactly here;
  - the sample was narrow, so the one-factor sweep was added;
  - the shipped figures and the root kit's silhouettes were still owed, so both were re-run;
  - two claims went past their evidence (the light stage's shadows, the shared shader programs) and are now worded as
    above.
- **Not deployed:** branch `preview-fidelity`, waiting for Joey's go.

## 2026-10-19 (preview-fidelity brought up to current main by hand, and proved again)

- **Why:** the branch (`a0c5dc0`, merged with main `8b1b965` as `9df500a`) had fallen 22 commits behind: the Colors
  plan's steps 2 to 6, the Parts list's filament chips, the night stage's grid revert, the evening batch. Main put the
  look cards (`lookCard`, `lookCardDraw`, `lookCardRead`, `lookPool`, `lookRig`, `sceneRev`) directly beside the preview
  section of `js/main.js` that the branch rewrites. Astra's ordering (2026-10-19) put preview fidelity first among what
  is left, so the branch was brought up to main `0b9406d` by hand, not fast-forwarded.
- **What conflicted:** three files, each a "both sides appended at the same spot" case.
  - `js/main.js`: the branch's `drawThumb` / `thumbPng` / `thumbModel` against main's look-card block, at the same point
    before the palette API. Both kept, the preview block first. Both behaviours stand: Build's previews take the
    XR-flagged RGBA8 target, the tier's rig with the fill boost (`rigFor`) and the studio environment, keyed on the tier;
    the look cards keep their pooled targets, their cloned rig read from the live lights and their revision key. The
    branch's `rigFor` and `applyQuality` hunks and main's `purgeLookCards()` calls and `sceneRev++` bumps merged
    themselves; no shared helper was renamed or moved by either side.
  - `e2e/workspaces.mjs`: the branch's preview case against main's Parts-print-colours case, both appended after the
    store-links case. Both kept, the preview case first.
  - `docs/redesign/DECISIONS.md`: entries, main's first (as the previous merge did), then the branch's.
- **Proved again on the merged tree** (every number of PREVIEW-FIDELITY.md's marks, recorded beside the old ones in its
  section 6):
  - P1, P2, P3, P5 the same as the final run to within one integer median: dark inspector 0/4 and 0/6, tile 0/0 and
    0/11; light tone-mapped inspector 3/31 and 2/8, tile 2/31 (1-2/31 before) and 1/11; Fast at most 0/11; coverage 0%
    in all 48; the ordinary target 26 to 32; the contrasting-filament control 148 to 190. The first unit's preview PNGs
    are byte-identical to the 2026-10-18 run's in 15 of 16 cells and differ by one pixel at one level in the 16th.
  - P4 against main `0b9406d` itself as the shipped code: Fast -0.55, -0.95, -0.9 ms; Very High +2.4, +2.3, -0.5 ms
    (the mark is +4); no new program from the second preview on; boot one program fewer.
  - The sweep now covers the 12 presets main has (step 3 added eight; the sweep reads the app's list): 245 images plus
    6 diagnostic, all pass; the largest p95 is 13 (inspector previews on four of the new presets, median 0; the
    registered four are unchanged at 9 and 11);
    Chevron's tile 0/20, the handles 0/5, the light baseline 3/32 and 1/4 without the cast shadow; coverage 0 in all
    251; the injection fails at 47.8% to 58.7% in all 18.
  - npm test 554 (549 pass, 0 fail, 5 skipped); e2e 52 of 52 on the GPU and 52 of 52 under SwiftShader, the Colors
    step-2 look-card gate and the preview case both passing; goldens 60 of 60; the deploy's stamping guard replayed
    locally on a copy prints `module graph OK` (the branch adds no module import, so no stamping line is needed).
- **Review:** Sol `01a1542f`, two turns: NO FINDINGS on the merge diff with the neighbouring look-card code; four
  findings on the report's section 6, all held (claims stated past their evidence), corrected there, with the median
  shift then settled from the saved images.
- **Live:** Joey, "Deploy preview-fidelity (e43cb8d) and the Colors polish (cdbe59b) together", 2026-10-19 morning. Main
  fast-forwarded to `e43cb8d`, the polish merged on top as `b32fcca` (one DECISIONS conflict, both kept); on the merged
  tree npm test 549 passed, 0 failed, 5 skipped, e2e 51 of 52 under soft rendering (the Label plate's faceplate-switch
  load flake), the module-graph guard replayed locally; run 39259811585 green, live stamp `b32fcca0`. The preview
  harness pointed at the live site (`harness/measure-live.mjs`, Balanced and Very High, dark, the root kit's three
  units): P1 holds on every image, medians 0 of 255, p95 at most 11 against a mark of 6 / 32; no new shader program
  from the second preview on (programs 5, 5, 5 at Balanced, 16, 16, 16 at Very High); a preview in a median 9.4 ms at
  Balanced, 5.3 ms at Very High; no page errors. Results in `live/`.

## 2026-10-19 (the planner says what it is to a search engine; the brand on Google)

- **Joey:** "how come modulith doesn't appear to be ranking in google anywhere yet?" Checked that morning:
  modulith.systems IS indexed (a `site:` query returns the home page crawled 7 days before, About, Story, Catalog,
  Instructions, Builds, Support, the GEN2 page, Size guide); robots.txt allows all, the sitemap is served, the home page
  has a canonical, a title and a description. The bare word belongs to Spring Modulith, a Java framework with years of
  links; Google already suggests "Modulith 3d". So nothing was broken: a contested word and a two-week-old brand.
- **What changed (the site-seo session, local_0ac401e1, on Joey's "yes" and "Go"):** the planner's `index.html` title
  reads "MODULITH Planner · plan a 3D-printable modular storage build" with a meta description, and the document title
  becomes "<build name> · MODULITH Planner" once a build is open (`js/ui/names.js`, `js/main.js`; the display-names
  test and the boot e2e case pin it); on the site repo, Organization + WebSite JSON-LD on the home page and /about/
  (name MODULITH, alternateName GEN2, logo, four sameAs links) and `docs/seo/SEARCH-CONSOLE.md`, Joey's checklist
  (verify the domain property, add planner.modulith.systems, submit the sitemap, request indexing, what to read weekly,
  the links that carry the brand). Search Console itself is not set up: that is Joey's to verify.
- **Live:** branch `seo-brand-titles` (fcaebd8) merged as `da764f8`, live stamp `da764f81`, the title and description
  read on the live page and the build-first title once a build is open; the site's main pushed (efc09cb, acce273) and
  the JSON-LD parsed from the live pages.
## 2026-10-19 (the 3D model tiles the under-table rails and wall brackets with the printer's bed limit, as the parts list bills them)

- **The report.** A user of the original GEN2 planner, relayed by Joey, 2026-10-19: "the table rails list on the left are
  3 270x3w rails + 1 270x2w ... The 3D diagram shows 2 270x4w + 1 270x3w. While technically that works, a Core One L
  cannot print something 4w."
- **What was wrong, and where.** The parts list is the planner's own bill (`js/rules/bom.js`, ported by copy from the old
  planner): `railSections = sectionsFor(railWidths, maxRailW())` caps an under-table rail section at the widest width
  whose section (W × 88 mm by the build's length) fits the chosen bed either way round, never below 1W; a Core One L
  (300 × 300) prints a 3W 270 rail (264 mm) and not a 4W (352 mm). The generator (`js/generate.js`) tiled every
  contiguous top-row run biggest-first with a hard-coded 4W, and its own comment admitted "a bed-limited printer may
  split differently". The wall brackets had the same shape of gap: the bill caps them at `GEN2.wallMount.maxW(bed)` (2W
  on an MK4's 250 × 210, since the 3W bracket needs the diagonal trick on a 250 × 220 bed), the generator at a hard-coded
  3W. The merged planner inherited both, since it carries the same generator and the same bill. The foot rails and the
  covers were NOT part of it: they exist in 1W and 2W only and both sides tile them with the same brick stagger
  (`brickTiling` in the catalog, `tilesLower` / `tilesUpper` in the generator), so a bed changes nothing there - the
  task's brief named them, and the code says otherwise.
- **A second defect the report exposed.** The merged Parts list dropped a bill row's `variant`: the two width rows of an
  under-table build both read "Under Table Rails - 270", ×3 and ×1, with nothing saying which was 3W and which 2W (the old
  planner wrote "name — variant"), and the two rows shared one progress key, so a tick on one counted for the other.
- **Changed (branch `rail-bed-limit`):**
  - `generateManifest(build, opts)` takes the catalog in `opts.catalog` (the page's global `GEN2` by default, so no call
    site changes; null in node tests that pass nothing, which keeps every golden as recorded) and tiles the under-table
    rails with `bedLimits(build, catalog).rail` and the wall brackets with `.bracket` - the bill's own rules, restated
    against the catalog. `bedOfBuild` and `bedLimits` are exported for the tests.
  - the Parts list's row name, copied text, CSV and progress key carry the variant ("Under Table Rails - 270 · 3W
    section"). A row without a variant keeps its key. A tick made on a width row before this change is not carried over:
    the old key never said which width it was for (Terra's finding, accepted rather than migrated).
  - the setup sheet pushes the record into the stage after a non-reload apply when the workspace is not Build or Labels
    (the two that sync the stage themselves): a printer change now changes the model, and the Parts list reads the
    stage's record, so from Parts, Assemble or Colors neither would have followed the new printer until the next edit.
- **Checks:** `test/rail-bed-limit.test.mjs` (the 11W row: 3+3+3+2 on a Core One L, 4+4+3 on any printer, the manifest
  rows in step with the instances; generator-against-bill parity for every catalog printer and seven row widths on the
  under-table rails and their screws, four widths on the wall brackets; the foot rails' stagger and bill unchanged on
  any, Core One L and MK4); an e2e case (Under-Table 270 on a Core One L from the setup sheet, an 11W row through the
  store, the stage's instances against the Parts rows, then Any printer chosen in the sheet from Parts lifts both to
  4+4+3), mutation-checked (the generator ignoring the limit fails it and two unit tests); npm test 554 passed, 0 failed,
  5 skipped; e2e Build + Parts + setup-sheet cases 9 of 9 with the new one. No new module, so no stamping line.
- **Review:** Terra `01a154c7`, routine: 2 returned, 1 held (the pre-change tick is not migrated - documented, not
  migrated, since the old key was ambiguous), 1 discarded (a `|` in a section title, name or variant could collide the
  key - every one of them is a catalog constant and none contains one; the construction predates the change).
- **Live.** Joey, "Merge rail-bed-limit (57e1b39) into main and deploy." Merged as `2b620c8` (one DECISIONS conflict, both
  kept); on the merged tree npm test 554 passed, 0 failed, 5 skipped. Run 39280964212 failed on the new e2e case alone:
  on the runner's software rasteriser the case switched to Parts while the stage was still rebuilding after its three
  units landed, and Parts' goTo stepped onto instances that did not exist yet. `402cf6f` makes both waits also wait for
  `regenBusy` to clear (as the Colors cases do) and drops what the page logged before its reload - a throttled software
  run (`E2E_SOFT=1 E2E_THROTTLE=4`) showed Start build's commit reaching the stage 200 ms before the sheet reloads, the
  stage asking the 185 pool for 270 parts (404s, a goTo on the half-mounted manifest): pre-existing, outside this change,
  proposed as a follow-up. Run 39289885703 then failed attempt 1 on the idle-gate case ("an edit is drawn at once": 3
  frames in 1.5 s on a runner during GitHub's degraded-Actions incident of the afternoon) and passed on attempt 2; live
  stamp `402cf6fe`, the three changed modules served. Checked by hand in production on 2026-10-19 (stamp `96bbf81d`, the
  built-in browser): a New build, Under-Table 270 on a Core One L, three 3W drawers beside the 2W starter; the stage holds
  three `UnderTableRail_270-3W` and one `-2W`, the Parts list "Under Table Rails - 270 · 3W section ×3" and "· 2W section
  ×1"; Any printer chosen in the setup sheet from Parts turns both into 4W ×2 and 3W ×1.

## 2026-10-19 (the inspector's "This unit · parts" rows name and show the filament each part prints in, per unit)

- **Why.** The Parts list has named the filament each part prints in since 2026-10-18 (the entry above, live as
  `26a4123`); its own entry left one thing undone: "the inspector's 'This unit · parts' list still shows no colours".
  Astra put "preview fidelity and inspector colours" first among what was left (2026-10-19): they decide whether the
  chosen look matches the finished build. The brief placed the list in the Build workspace's inspector; it lives in the
  PARTS workspace's inspector (`js/workspaces/parts.js` renderInspector; Build's "This unit only" inspector has no parts
  rows), and that is where the change went.
- **What a row shows now.** With the visitor's colours on, each row of the selected unit's parts carries the list's own
  chip (parts.js `chipEl`: the filament, the identification colour as the 2 px ring, several swatches when the part's
  regions wear more than one) and the list's "Print in <short name>" line under the part name, with the Colors tab's buy
  link. Colours off: the identification chip alone, no line (the rows had no chip at all before; the list's rows always
  had one). The chip, the words and the swatches are the list's code, not a copy: both lists are in parts.js, so the
  helpers are shared by scope, and no new module (no stamping line) was needed.
- **The resolution is per UNIT, which the list's snapshot cannot give.** `paletteSnapshot` pools every unit's picks under
  a type (filamentsInBuild's `keys`), so a type worn in two filaments reads "Black / Teal" there, and that is right for a
  list of the whole build. The inspector's rows are one unit's, so `unitRegions(stage, pal, unitId, type)` resolves each
  of the type's regions for THAT unit the way the stage paints it (main.js materialFor / filamentsInBuild): the unit's
  own pick first (`stage.overrideFor`, which already answers a zone with the unit's Body pick when the build has not
  picked the zone), else the build's pick for the key, else a zone follows its body unless it has a colour of its own
  (the label text; keysInBuild's `ownColor`, now carried on the snapshot), else bare in the identification colour (the
  snapshot's `bare`, or `activeHex` when no unit shows that region bare). A store commit (a palette change, an undo of
  one) re-renders the inspector after the list, since the list's render refreshes the snapshot the rows resolve against.
- **Checks.** `test/parts-print-colours.test.mjs`: a stage with the build's picks and two units' own (the faceplate body
  on one, the drawer body on the other), resolved per unit against the pooled list; the own-body-covers-an-unpicked-zone
  case; the label text keeping its own colour; the bare fallback; colours off, bought hardware, an unmodelled type and a
  throwing `overrideFor` all answering null or the build's. An e2e case: Stealth applied in Colors, unit 1's case picked
  "This drawer only" through the real picker (the case instance found through `partInfo().owner`, since case ids are
  positional), then in Parts the inspector on unit 1 shows its own filament and names it, on unit 2 the build's with
  the buy link, and colours off the identification colour with no line. Mutation-checked: the resolver ignoring the own
  pick fails the case on the own-filament assertion ("actual rgb(43, 43, 46), expected rgb(49, 81, 126)"). npm test 560
  (555 passed, 0 failed, 5 skipped); e2e Build + Parts + Colors cases 24 of 24 with the new one.
- **Review:** Terra `01a1551d`, routine: NO FINDINGS on the diff, the tests and the e2e case. It ran after a wait: the
  Plus reserve gate refused the first call (the 5-hour window at 95% from the other sessions' reviews, reset 12:58), the
  local tier's advisory pass in between returned a bare NO OBJECTION (`local-20261019-123426-495-2104172`, adjudicated
  no-signal, not taken as approval), and the commit waited for the cloud review at the parent session's direction.
  Self-review beside it, what was checked: the per-unit resolution against overrideFor's zone fallback and
  filamentsInBuild's; a shown look (previewLook) cannot be live while the Parts inspector is, since the Colors workspace
  ends it on unmount; the subscription re-render touches no input or focus; the chip rules are scoped to
  `#ws-insp .uprow`, which only the Parts inspector has; the row names map through `typeOf` as the list's do.
- **Live 2026-10-19** (Joey: "Deploy inspector-print-colours (f598504) and phone-journey (176c0a2) together"). Merged as
  `198d088` (one DECISIONS conflict with the rail entry's Live line, both kept), then phone-journey as `cdd97b1`; on the
  merged tree npm test 560 (555 passed, 0 failed, 5 skipped), e2e 59 of 59, the deploy's stamping step and module-graph
  guard replayed locally (no new module in either branch). Run 39306087895 green on attempt 1, stamp `cdd97b1e`. Checked
  live by `planner-prod-checks-2026-10-18\inspector-prod.mjs` (desktop: unit 1's case row's chip the colour of its own filament, ERYONE Burnt
  Titanium, its ring the identification colour, its line "Print in ERYONE Burnt Titanium"; unit 2's chip the build's
  Panchroma Black, its line "Print in Black" with the buy link; colours off the identification chip, no ring, no line; no
  errors).

## 2026-10-19 (the phone pass: the 10-17 phone fixes on current main, and the complete phone journey)

- **Why now.** Astra (2026-10-19): "Re-test the phone fixes on current main. Checking Simplify at a phone viewport is
  useful, but the complete phone workflow still needs verification", and her next review is "the complete journey -
  choose a look, adjust a part, simplify, review filaments, continue to Parts - rather than another round of isolated
  colour features". Branch `phone-check-fixes` (67ec611, the 10-17 phone acceptance check's eleven fixes) had fallen a
  long way behind main (the Colors plan's steps 3-6, the filament chips, the previews, the setup-sheet phone fix, the
  brand title, the bed-limited rails).
- **Part 1: the merge, and the fixes re-tested.** Branch `phone-journey`, cut from `phone-check-fixes`, main (2b620c8)
  merged by hand. Two conflicts, both behaviours kept: the Dock's filament stack takes main's one filament count
  (`filamentsInBuild`, decision D2) and keeps the branch's phone collapse; the e2e file is main's with the four phone-check
  cases appended. Every phone fix holds on current main at 390×844: the four phone-check cases (Place / Cancel, the issue
  card and the toast above the sheets; the setup sheet whole; the switcher's items and the shopping list over an open
  sheet; Measure, the switcher's count, no "null") and the six other phone cases (the Build and Labels sheets, Colors
  steps 3-6 on the phone) pass, 10 of 10, before any further change.
- **Part 2: the journey, step by step, as a visitor does it on a phone** (390×844, real touch, dark theme, the Fast tier;
  the same walk at 1280×800 with a mouse). What was seen, and what changed:
  1. **Build.** The model is the hero: no sheet open, the Dock reads "Layout valid". Fine.
  2. **Colors from the tab bar.** The Colors sheet opens on arrival, alone; the Dock turns into "4 filaments", the summary
     line says "4 filaments used"; no field takes focus. Fine.
  3. **Browse looks → a look chosen.** The gallery sheet opens alone (the Colors sheet steps down); a card shows its look
     on the model without choosing it (previewing, nothing in the history); Apply is one undo step, the gallery closes and
     the Colors sheet comes back, the toast "Applied “Stealth”" shows over the sheets (z 14), the Dock and the summary
     still agree (4). Fine.
  4. **A part tapped on the model - BROKEN.** With the Colors sheet up (it is, on arrival), a tap on a drawer's front lit
     the faceplate and showed nothing else: the part card (`#ws-partcard`, z 12) and the picker's handle (a collapsed
     sheet at the bottom of the stack) were both under the open sheet (z 13). On the desktop the same tap shows the card
     and the picker aside. **Changed:** `onSelect` steps the sheets down when a part is selected on a phone, as Build's
     inspector does, unless the picker itself is the open sheet (a visitor picking colours taps part after part, and the
     picker follows the tap - checked: with the picker open, a tap on a second unit's front switched its region from Body
     to Face and the sheet stayed up). After the tap: no sheet open, the card over the collapsed handles (Colors, and
     "Face · faceplates" above it), both reachable.
  5. **The picker.** A chip on the card opens the picker sheet alone; its search field does not take focus; a swatch
     recolours the build's region. The count need not rise: a region that alone wore a filament swaps one for another
     (Stealth's faceplate bodies, Steel Grey → a new pick, stays at 4; the drawer fronts, shared with the drawers, 4 → 5).
     The Dock and the summary agree after the pick. Fine.
  6. **This unit only.** The second segment is offered (the tapped part belongs to a unit); a second swatch becomes that
     unit's own colour; the summary adds "· 1 unit with its own colours"; the count rises by one; the Dock agrees. Fine.
     One finding for the checks, not the app: two picks within 350 ms are one undo step (the store coalesces, by design);
     a visitor's pace separates them, so the e2e case waits 500 ms between them.
  7. **Undo / Redo.** The toolbar's Undo takes the unit's colour back (the summary's "own" clause goes, the count is the
     build pick's again); Redo returns it; the picker stays up through both. Fine.
  8. **The picker's close.** The sheets down, the model and the card. Fine.
  9. **Simplify.** From the Colors sheet (its handle opens it): Simplify's own sheet, the proposal shown on the model;
     Apply is one undo step, one filament fewer, the Colors sheet back, the toast "Simplified to N filaments.", the Dock
     and the summary agree. Fine.
  10. **Review filaments - BROKEN.** The summary's link set `st.shop` and rendered the list, which on a phone is a floating
      card over the collapsed handles: with the Colors sheet up, it opened under it, and the tap seemed to do nothing. The
      Dock's filament stack had the collapse since the phone check; the summary link, added by step 6 on the desktop, did
      not. **Changed:** one `openShop()` for both (the sheets step down on a phone). After: the list over the handles, one
      row per filament, the rows the build's filaments in the Dock's order, as many as the Dock says.
  11. **Get parts list.** The Parts sheet opens on arrival ("Parts · 43 to print"); the rows' "Print in …" lines name the
      filaments; the distinct names (the zone words and the "A / B" of a unit's own colour parsed out) are exactly the
      Colors Dock's filaments, no more. Parts' own Dock is structural ("Layout valid"), by design. Fine.
  12. **Back to the model.** Build from the tab bar: no sheet open; Undo there takes Simplify back (the count rises by
      one). Fine.
  Also seen, not changed: the toast sits on the same floor as the floating cards (`--sheet-stack` + 10 px), so for its 2.6 s
  it can overlap a card's lower row (the part card's "Open the drawer", the shopping list's note); it takes no pointer
  events and passes. The gallery's search field takes focus on the desktop by design and not on the phone.
- **Checks.** The journey is an e2e case (`the phone journey: …`, twelve steps with real taps, the Dock against the summary
  at every count change, the shopping list and the Parts list by name), mutation-checked: with `onSelect`'s collapse
  removed it fails at "no sheet is open after a tap on the model". `D:\Claude - Output\planner-prod-checks-2026-10-18\
  journey-prod.mjs` walks the same journey against the live site, desktop and the phone viewport, reporting each step's
  state as JSON (the sheets open, what is on top, the counts, the names, the focused element, errors), with `--serve DIR`
  for a checkout under test. Against the live site (stamp `da764f81`): desktop 16 of 16; phone 14 of 16, the two named
  steps waiting on this branch's deploy (4: the tapped part's card and picker under the open sheet; 10: Review filaments
  under it) reported and not counted; no page errors. Against this branch served locally: 16 of 16 on both.
  npm test 554 passed, 0 failed, 5 skipped. e2e 58 of 58 on the GPU; E2E_SOFT=1 57 of 58, the one failure the
  bed-limited-rails case of the morning (main's own): under soft rendering it recorded the 404s and the `goTo` error the
  page logs in the 200 ms between Start build's commit and its reload (Build syncs the stage with the 270 record while the
  stage's pool is still 185) - a pre-existing transient, nothing of this branch's (the case fails the same with main's
  build.js swapped in, and passes with main's newer e2e file); main fixed the case itself an hour later (402cf6f: it
  discards what the page logged before the reload and waits for the rebuild), merged in below.
- **Also seen in the code, not exercised:** with Simplify, Compare or Find your next look up on a phone, a tap on the
  model steps that sheet down too (its handle brings it back; the proposal or the shown look stays on the model, since
  the state flags are untouched) - the rule is one rule, a tap on the model answers with the part.
- **Review:** the Plus reserve refused the Sol review at first (the 5-hour window at 95%, 2026-10-19 afternoon); the
  local tier's advisory pass was a bare NO OBJECTION (`local-20261019-125423-669-2103960`, adjudicated no-signal: not
  approval). Once the window reset: Sol `01a15524`, substantial - 2 returned, 2 held, both on `journey-prod.mjs` and
  neither on the app or the e2e case: the live-only exemption of steps 4 and 10 also applied to a `--serve` run (now live
  only: run against main's checkout, which lacks the fixes, the script fails both steps and exits 1), and a state
  snapshot that threw counted as a pass (now a failure). Re-run after the fix: live 14 of 16 with the two steps waiting,
  the branch 16 of 16.
- **After main's 402cf6f was merged in:** E2E_SOFT=1 again, 57 of 58 - the bed-limit case passes now; the one failure
  this time was the Label plate's faceplate-switch case, a 30 s click timeout while two other Chrome runs (the
  production checks) shared the machine; alone under soft rendering it passes.
- **Live 2026-10-19**, in the same deploy as the inspector colours above (main `cdd97b1`, run 39306087895, stamp
  `cdd97b1e`). `journey-prod.mjs` against the live site: desktop 16 of 16, phone 16 of 16, nothing left "waiting on the
  deploy", 0 errors (`journey-prod.live.json`; the pre-deploy run kept as `journey-prod.live.before.json`).

## 2026-10-19 (Build and Labels no longer push a record of another mount or length into the stage before the setup reload)

- **The glitch.** The stage's parts pool (`PARTS_BASE`, from the first manifest's collection) and its mount scene (the
  module-level `isWallBuild` / `isUnderTableBuild`: table, grid, wall, backdrop, polar limits) are fixed when the page
  boots, which is why the setup sheet reloads the page on a mount or length change. Its apply() commits the new record
  first and reloads 200 ms later, and the store notifies synchronously, so Build's `syncStage` (and Labels') generated a
  manifest for the new record and asked the stage to rebuild on it: the old pool answered 404 for every part of the new
  length (`parts/185/UnderTableRail_270-2W.lib.glb` and eight more), `mountManifest` threw, the "can't be shown" veil
  showed, and `skipToEnd` did a goTo on the half-mounted manifest (TypeError reading 'title'). On a fast GPU the reload
  usually won the race; a throttled software-rendered run (`E2E_SOFT=1 E2E_THROTTLE=4`, the deploy runner's conditions)
  showed it every time, on the Wall-115 setup case and the under-table-270 bed-limit case alike. Found while the
  bed-limit case was hardened for its deploy (above); Joey: "Do this task here".
- **Changed (branch `setup-reload-sync`):**
  - `js/workspaces/build.js` and `js/workspaces/labels.js`: `otherScene(rec)` - the record's mount or length differs from
    `stage.build`'s - makes `syncStage` wait for the reload: no manifest, no `stage.update`, `lastSig` untouched; Build
    clears a stale issue from an earlier layout and re-renders the board (Terra's finding), Labels also skips its
    `setLabels` branch (those meshes belong to the old scene).
  - `js/main.js` `updateBuild`: refuses a record of another mount or length with the reason ("This scene is built for the
    185 tabletop collection · a 115 wall build needs the page reloaded on it"), the same test `applyRemoteLayout` already
    reloads on. A second line of defence: with the workspace guard mutated off, the Wall-115 case still runs clean under
    throttle on this refusal alone (Build shows the reason in the issue card for the 200 ms, no 404s).
  - e2e: the Wall-115 setup case asserts no console errors over the whole trip; the bed-limit case drops its
    `errors.length = 0` escape and its comment.
- **Checks:** with both guards mutated off, both cases fail under `E2E_SOFT=1 E2E_THROTTLE=4` (eight to nine 404s and the
  TypeError each); with the guards on they pass under throttle and on the GPU, with the Build and Labels cases (5 of 5);
  the Wall-115 case under throttle went from 76 s to 24 s (no failed rebuild in the window); npm test as recorded in the
  commit.
- **Review:** Terra `01a1557b`, routine: 1 returned, 1 held (a stale `stageErrors` from an earlier invalid edit stayed
  rendered for the 200 ms; cleared in the skip branch).
- **Live.** Joey, "Merge setup-reload-sync (876eca0) into main and deploy." Merged as `ec4f666` (one DECISIONS conflict:
  main's "Live" line for the phone journey kept, the branch's stale copy dropped); npm test 555 passed, 0 failed, 5 skipped
  on the merged tree. Its run 39317757575 failed on the new phone-check case, "one unit is singular": not this change but a
  race in the build switcher - `set(true)` unhides the menu with its previous rows and only then awaits the Recent list
  from IndexedDB before rebuilding them, so a read right after the click saw "185 · 4 units" with 1 unit in the store
  (3 of 5 local runs failed on the merged tree, 0 of 5 on main before the merge; a probe showed store 1, stage 1, the
  menu's text stale). `590be04` (topbar.js) writes the current build's count synchronously at open; the case passed 6 of 6
  after. Terra `01a155eb`, routine: 1 returned, discarded (a count that changes while the list loads shows the newer value,
  the current truth). Then four sibling pushes in a row cancelled each run (Pages concurrency); the last, `3912af4`, failed
  npm test in `test/move-opt.test.mjs` until its author's `69ca2a2` injected `drawerStop` into the sandbox. Run 39332085367
  green; live stamp `69ca2a2a`; the guard (`otherScene` in build.js and labels.js, the refusal in main.js) and the
  switcher's `freshCount` are served. Checked by hand in production on 2026-10-19 (stamp `96bbf81d`): the setup sheet's
  Under-Table 270 on a Core One L from the root kit, then Any printer from Parts, with the stage and the list following
  each time; the trip from Start build to the reload is the one the guard covers.

## 2026-10-19 (the "Neon yellow & black" preset becomes Joey's black-shell combo)

- **Joey, on the look's card:** "can we make a new custom color combo, essentially replacing this one. essentially the
  body is black like The Jerrari, but the face(s) are silk black, the faceplate body is neon yellow, and the side covers
  are silk black. handles are pla black". The 10-18 preset (his 3D Printopia photo) put the neon on the shell; this one
  keeps the name and the twelfth slot and swaps the assignment.
- **What it is now (js/main.js PRESETS):** every body key as The Jerrari's (Elegoo PLA Black: case, drawers, covers,
  brackets, rails, feet, extender, lip, back cover); faces and grips Panchroma Silk Black; the faceplate BODY, the grip
  accents, the accent, the label, the deck (12.7:1 against the black case, from a colour the look already prints) and the
  small parts (QuickLock, magnet clip, stopper) in Printed Solid Neon Yellow; handles Elegoo PLA Black; magnets and
  screws Silk Silver as before. The side-cover rule (core = case, face = faceplate face) gives a black core with a
  silk-black face, which is what he asked for, so no rule bends. Card strip: black, neon, silk black.
- **Checks:** `test/presets.test.mjs` pins the combo (body keys equal The Jerrari's, face and side-cover face Silk Black,
  faceplate body Neon Yellow, handle PLA Black); presets 13 + filament-db 5 pass, mutation (the face set to PLA Black)
  fails the suite; e2e Colors cases 16 of 16; in the browser the card reads "3 filaments", applying it gives the summary
  "Case, drawers: Black · Fronts, grips: Silk Black · Grip accents, faceplate bodies, small parts: Neon Yellow".
- **Review:** Terra `01a155f4`, routine: NO OBJECTION.
- **Live 2026-10-19**, stamp `69ca2a2a` (main `5b2a7e7`; its run and the next died in the e2e step, whose two 5 s and 10 s waits timed out on a
  32-minute step and took the 30 s bound in `e26de9a`, then on the drawer-stop commit's unit step, fixed in `69ca2a2`;
  run 39332085367 green). Checked live by
  `planner-prod-checks-2026-10-18\preset-v2-prod.mjs`: the twelfth preset's Case, side-cover core, handle Elegoo PLA
  Black; face, grip and side-cover face Panchroma Silk Black; faceplate body, grip accent and deck Printed Solid Neon
  Yellow; the card "Neon yellow & black · 3"; the accent and grip rules hold on all 12; no errors.

## 2026-10-19 (a drawer opens to its stopper)

- **Joey, with a drawer open on the Colors tab:** "i feel like when we open the drawers, they should open all the way,
  until the inside back wall of the drawer collides with the drawer stopper, so maybe about 95% open-ish".
- **What stopped it before.** Every pull took a `travel` of collection − 20 ("case depth − rear engagement", an
  estimate): the body's deep pull and its camera focus went to 90 % of that (148.5 mm on a 185), the Colors card's "Open
  the drawer" (`peekUnit`) to the 40 mm rider peek, the cinema to 30-95 % of it, and the cavity fill read its openness
  from it.
- **The stop, measured in the scene** (world mm, the GLBs as generate.js places them; a 185 Tabletop 2W-2H and a 270 made
  from the setup sheet, `?debug=1`): the stopper's tab is the only part of it below the drawer's rim (1.72 mm, the
  vault's figure), and it sits 2 mm behind the case front: its rear face at z 89 against a front at 92.5 (185), 131.5
  against 135 (270); the part's centre is the 16 mm behind the front the vault records, not the tab. The drawer's inner
  back face rests 10 mm inside the case back (−82.5 in a −92.5 case; −125 in −135): an 8.1 mm gap and a 2 mm wall. So
  the wall meets the tab after collection − 13.5 mm on both: 171.5 mm of the 185 drawer's 179.3 mm length (95.6 %),
  256.5 of the 270's. The old pull left a 185 drawer 23 mm short of its stopper.
- **What changed (js/main.js):** one `drawerStop()` = collection − 13.5 replaces the four `travel` sites. In the merged
  app the explicit opens are `peekUnit` (Build's "Peek inside", the Colors card's "Open the drawer"), which went to the
  40 mm rider peek and now goes the whole way to the stop; the stage's own deep pull on a body selection (the old
  viewer's identify flow, which the workspaces select quietly) and its focus camera take the stop too; a rider (handle,
  magnet) keeps its 40 mm peek; the cinema's fractions and the cavity fill's openness now run over the real travel.
  Checked in the browser on the 185: "Open the drawer" and "Peek inside" both land the drawer at base + 171.5 (its
  z 5.24 → 176.74); a plain selection in Build or Colors does not pull, before or after.
- **Checks:** e2e Colors, phone, journey, Parts and Build cases (see the commit); no test pinned the old figures.
- **Review:** Terra `01a15623`, routine: NO OBJECTION on the stage change, the e2e case and this entry.
- **Live 2026-10-19**, stamp `69ca2a2a` (main `3912af4`, then `69ca2a2`: the deploy's unit step failed on
  `test/move-opt.test.mjs`, whose sandbox runs updateCavityFill's text through `new Function` and did not know
  `drawerStop`; it now injects it. Luna `01a1562b`. The lesson, in memory: run the full `npm test` when main.js gains a
  helper). Checked live by `planner-prod-checks-2026-10-18\drawer-stop-prod.mjs` on the 185 kit: Peek inside lands the
  drawer at base + 171.5 and Close it at base; on the Colors tab `peekUnit` (the card's "Open the drawer") lands at
  base + 171.5 and `unpeek` at base; no errors.

## 2026-10-20 (the back cover on a v2609 Decor drawer: the tear-away front comes out first)

- **Why now.** The v2609 standard Decor drawers (all 94 sizes) print with the same tear-away front as the Gridfinity
  ones, and the GLBs rebuilt from the release STLs carry it (gen2-parts `decor-drawers-v2609` 1d869e1, published
  2026-10-20). The planner places the faceplate back cover in the drawer-front gap, so in the model the cover's volume
  (z 90.57-95.02 on a 185 1W-1H) now holds the whole panel (z 90.59-92.49). Joey's rule (vault rules.md "Drawers,
  faceplates and handles", 2026-10-19): the faceplate slides on with the front left in; a faceplate WITH its back cover
  collides with it, so either take the front out or leave the cover off, "either way works".
- **The rule the planner follows:** the smallest honest one. The back cover stays optional (it is still the user's
  trade: a stiffer plate on wide drawers against more printing). Wherever a build bills or fits one, it says the
  drawer's tear-away front comes out first: the back cover row of the generated manifest and of the planner's
  `computeBom` (one wording, `test/back-cover-tearaway.test.mjs` pins them equal), the Faceplates step ("take the
  drawer's tear-away front out and clip the back cover in from behind", after the EdgeLabel dressing when there is
  one), and a hint under Build style's Back cover toggle. The Gridfinity rule is unchanged: no cover billed, the aside
  "not on the Gridfinity drawers" stays, and a Gridfinity-only build never mentions a front to take out. The old
  viewer's options panel (`#build-options`, hidden in the merged app) keeps its Gridfinity note only.
- **What the stage does: nothing new, and why.** The v2609 GLB is one node, one mesh, one primitive
  (`DecorDrawer_185-1W-1H.lib.glb`): the panel is not a node the stage could hide, so hiding it would mean cutting
  the drawer's geometry, and the brief said to stop at the note in that case. Checked in the scene with the branch's
  parts (`GEN2_PARTS_LOCAL=1`): with a cover on, the cover's back face at 90.57 draws clean over the panel's at 90.59
  (no z-fighting at 0.02 mm, Quality High), so from inside the pulled-out drawer the user sees the cover, as on a
  print with the front out; from the front the faceplate hides both. Shots in
  `D:\Claude - Output\decor-back-cover-2026-10-20\`.
- **The BOM parity gate, told.** `test/parity/bom-parity.test.mjs` boots the OLD planner's own app.js and compares
  its computeBom with the ported one, notes included; the old planner's back cover note (app.js 5402 at 7beb165) is
  the old wording, so the new sentence failed 55 of 250 comparisons (main: 250 of 250 match). The old planner is not
  edited from here (port-rules.mjs: ported by copy, never edited in the old repo), so the gate carries a dated
  `AHEAD` entry that compares the back cover row as the old planner still writes it; it goes when the old planner
  carries the sentence or is retired at the cutover. Whether the old planner gets the same one-line note before then
  is Joey's call. The earlier side-cover gap fix (2026-10-16) already left this repo's bom.js ahead of the old planner
  without an entry; the random builds the gate draws never have a gap, so it never showed.
- **Checks:** `test/back-cover-tearaway.test.mjs` (3 tests: the manifest row on every length and family, the step
  clause bare / dressed / mixed / off / Gridfinity-only, the computeBom row and its parity with the manifest's);
  the e2e case "a back cover on a Decor drawer says the tear-away front comes out first" (the stage keeps the cover and
  the whole drawer visible, the manifest row and step, the Build style hint on and gone when off, Gridfinity by the
  generator's rule on a real 1W-1H and on a kept `variant` on a 1W-3H, the Parts row and its OPTIONAL badge), green
  against the v2609 parts. Mutation-checked, 7 of 7 caught: the manifest note, the bare and the dressed step clause,
  the computeBom note, the hint, the hint's Gridfinity rule (the raw `variant` check back: the 3H case times out), the
  parity entry (off: 55 of 250 differ). Full `npm test` and `npm run e2e` with the v2609 parts: see the commit.
- **Review:** Terra `01a1594c`, routine: 1 finding, confirmed and fixed (the hint read Gridfinity from the raw
  `variant` field, where the generator and the BOM use `isGridfinity(L, u)`, so a variant kept on a size with no
  Gridfinity drawer, which renders the standard drawer and takes a cover, got the "not on the Gridfinity drawers" line
  and no "front out"); the follow-up with the fix, the parity entry and the e2e extension: NO FINDINGS.
- **Live 2026-10-20**, stamp `5113693d` (Joey: "Deploy decor-back-cover-note (ed17c41)"). Fast-forwarded onto main as
  `ed17c41`; on it npm test 564 (559 passed, 0 failed, 5 skipped) and the Build, Parts, Colors and back-cover e2e cases
  28 of 28; the stamping guard replayed clean (build.js's line already carried `../generate.js`). The two deploy runs before the pin
  (39429860751, and 39433302069 after an empty re-run commit `c0184c2`) failed in the e2e step on the runner image, see
  the next entry; run 39439350464 on the pinned image passed on attempt 1. Checked live by
  `planner-prod-checks-2026-10-18\back-cover-note-prod.mjs`: with the cover switched on, the BackCover row carries
  "Take the drawer's tear-away front out first", the Faceplates step says to take it out and clip the cover in from
  behind, the Build style hint reads "Take each drawer's tear-away front out first - left in, it and the cover
  interfere." with no Gridfinity aside, the drawer's meshes stay visible under the cover; off again, the hint goes.

## 2026-10-20 (the deploy runs on ubuntu-24.04, not ubuntu-latest)

- **What happened.** From the evening of 2026-10-19 most deploy runs failed in the browser e2e step on waits that pass
  locally in seconds (5 s, 10 s, 30 s and 150 s bounds; the first two were widened to 30 s in `e26de9a` before the cause
  was known). The job logs, read in Joey's Chrome (the public API carries annotations but not the runner image), show
  the pattern: the failed runs 39429860751 and 39433302069 ran on "Runner Image: ubuntu-26.04" with the e2e step at 21,
  34 and 35 minutes; the green runs 39332085367, 39335008933 and 39439350464 on ubuntu-24.04 at 18 minutes; all with
  the same Chrome for Testing 153.0.8010.12. GitHub's notice on every run: "The ubuntu-latest label will migrate to
  Ubuntu 26 beginning October 19, 2026" (runner-images issue 14748).
- **What changed.** `pages.yml` `runs-on: ubuntu-24.04` (`5113693`, Luna `01a159b5`), with the evidence in a comment. The
  suite's bounds were tuned for the 24.04 software rasteriser (the 2026-10-13 and 10-18 entries); on 26.04 the same
  cases take about twice as long. When the bounds are retuned for the new image, unpin; until then a timing failure on
  the pinned image is a real regression, not the runner.

## 2026-10-20 (the Labels callout offers both label families)

- **Joey, on the Labels tab of a Classic build (2026-10-19):** "for the labels column, in this menu, why not show both
  edgelabel and classic pro as clickable options?" The callout named both families and offered one button, "Switch to
  EdgeLabel ✦": the brief's wording (the 2026-10-13 entry, "never hidden or greyed out"), not a decision against Classic
  Pro, which is a full label family (its own faceplate style, Label Studio type and Part Picker type).
- **What changed (js/workspaces/labels.js, css/app.css):** the callout's buttons come from the stage's
  `availableFaceplateStyles()` filtered to the label-taking families, EdgeLabel first and starred, Classic Pro beside it
  in a `.btns` row at the planner's 8 px control gap (wrapping on a narrow panel); each applies its faceplate style the
  way the EdgeLabel button did (applyFaceplateStyle, setDims off, the store adopting the build, the signature refreshed)
  and the toast names the family. A family the stage does not offer for the build's collection gets no button.
- **Checks:** an e2e case opens Labels on the root kit (Classic faceplates), reads both buttons in order, clicks Switch
  to Classic Pro, and waits for `faceStyle === 'classicpro'` with the callout gone and the toast naming Classic Pro;
  the Labels cases that click Switch to EdgeLabel are unchanged (the Labels pattern 11 of 11 with the new case);
  mutation-checked (every button wired to the first style fails the case); test/labels.test.mjs 13 of 13. In the browser the two buttons measure 143 and 132 px wide; on the narrow pane they wrap with an 8 px gap.
- **Review:** Terra `01a15a57`, routine: NO OBJECTION.
- **Live 2026-10-20**, stamp `31bec955` (Joey: "Deploy labels-callout-classicpro (4b79e4e)"). Fast-forwarded onto main;
  npm test 564 (559 passed, 0 failed, 5 skipped), the Labels e2e cases 11 of 11, the stamping guard replayed clean. The
  first run (39467212905) failed on the phone Place / Cancel e2e case, the fourth time since 2026-10-19: its tap read a
  "+" position after a fixed 1.5 s settle, stale on a slow run; `31bec95` makes it wait until the positions hold still
  and tap again if no card follows (Luna `01a15a7f`; 7.5 s plain, 30 s throttled 4x here). Run 39472127020 then passed on
  attempt 1 (e2e 27 min on the pinned 24.04 image). Checked live by
  `planner-prod-checks-2026-10-18\labels-callout-prod.mjs`: the callout on the root kit reads the two buttons in order, Switch to
  Classic Pro sets faceStyle classicpro and the callout goes; at 1280 wide the buttons wrap with 8 px between the rows.

## 2026-10-20 (a label placed after a regenerate shows at once on Very High)

- **Joey:** "i made 3 labels with the part picker, i noticed when i dragged and dropped them though, they didn't show up
  until i dragged and dropped the next one, making it so that the thrid one i place but it won't show up at all" (his
  screenshot: a 7-drawer EdgeLabel build, Quality Very High, M3 × 10 and M3 × 12 drawn, M3 × 16 on a 0.5H drawer not).
- **What was tried and did not reproduce it** (the built-in browser pane, the same code locally and the live site):
  typed labels by tap and by a real pointer drag; part labels with stripes through store commits, on 1H and 0.5H
  drawers; three real Part Picker labels dragged one after another on the live site at the default tier and again
  with `gen2-quality` set to veryhigh. Every label drew at once, store and stage in step. The pane's GPU evidently fails
  the accumulation probe (`acc.ok`), which is where the difference lives.
- **The path (Terra `01a15aaa`, its first hypothesis; the code agrees):** a part label with a stripe changes only the BOM,
  so its placement takes syncStage's regenerate branch with the same instances and step. `attachLabelTexts()` at the
  end of regenerate placed the meshes synchronously (fonts and part files already loaded) WITHOUT `ao.rev++;
  markShadowDirty(); invalidateFrame();`, which its loading branch has. The accumulation key
  (`instances.size|cur|ao.rev|accRev|quality`) and the idle gate's signature were therefore unchanged, and on a tier
  with the accumulation buffer the image from before the label stayed up until the next placement's `end()` →
  setLabels → refreshLabelText invalidated a frame: each label one placement late, the last never. Tiers without the
  accumulation draw the keepalive frame straight, so they never showed it.
- **What changed:** the synchronous branch does the same three calls (js/main.js). `test/label-attach-invalidate.test.mjs`
  runs the extracted function against stubs: loaded → placed once and invalidated once, shadow dirty, ao.rev bumped;
  still loading → nothing synchronous. With the three calls removed the test fails.
- **Checks:** that test 2 of 2; npm test 566 (561 passed, 0 failed, 5 skipped); not reproducible here, so the fix is by reasoning and the
  reviewer's reading, and Joey confirms on his machine after the deploy.
- **Review:** Terra `01a15aad`, routine: NO OBJECTION.
- **Live 2026-10-20**, stamp `00c4602d` (main `d427d1e`; its first run 39480049390 failed on two 5 s waits with the e2e
  step at 37 min on the pinned image, so `00c4602` scaled every 5 s and 10 s wait in e2e/workspaces.mjs to 15 s and
  30 s, the tap helper's 10 s retry kept, Luna `01a15ad7`; run 39486096891 then passed on attempt 1, e2e 34 min). The
  served main.js carries the branch. Not checked by eye: the pane never showed the bug; Joey's machine is the check.

## 2026-10-20 (Build style: a Side covers On / Off toggle)

- **Joey:** "Let's tackle the unbuilt" (the 2026-10-17 side-covers entry: "The default-off toggle of the 2026-10-09
  decision is not built ... A real toggle needs a new build field, and BUILD_FIELDS is pinned to the old planner's").
  Since 2026-10-17 every build wears side covers; this adds the switch, with ON as its default so nothing changes for
  a build, a share link or a saved file from before the field.
- **The field.** `sideCovers` joins BUILD_FIELDS (js/rules/schema.js) as the planner's own field, which the old planner
  never writes; sanitize reads only an explicit `false` as off (`d.sideCovers = d.sideCovers !== false`), so a missing
  field, a 0 or a string is on. The parity test against the old planner (test/parity/layout-parity.test.mjs) strips the
  planner's own fields before comparing serialized records: the old planner's state has none, sanitize gives the
  default, and parity is about the shared fields. No schema bump: an optional field with a default.
- **What reads it.** The generator already did (`build.sideCovers === false` skips the covers and the too-tall warning,
  generate.js ~1312 and ~1612, from the side-covers session); the bill now does too (js/rules/bom.js: no side-cover
  rows when off, so the list and the stage agree either way); the stage gains `setSideCovers(v)` beside `setBackCover`
  (a regenerate); Build style gains a "Side covers" Off / On segment in a row beside Feet (alone on the other mounts),
  through the same `adopt()` as the other toggles, so the record carries it and Undo takes it back.
- **Checks.** test/side-covers.test.mjs: absent reads as on; false empties both the bill and the stage; true equals
  absent; 0 / '' / null / 'off' / 'false' read as on. Mutation-checked three ways: the bill's gate removed, the schema
  default removed, the generator's gate removed - each fails the test. An e2e case switches Off in Build style and
  waits for zero SideCover instances and zero billed, the record saying false, then On and the count as before.
  npm test 567 (562 passed, 0 failed, 5 skipped) with the parity test and the store test's key list updated for the field.
- **Review:** Sol `01a15b12`, substantial: one finding, held as a documented limitation rather than a change: a build
  saved with the covers OFF and re-saved through the OLD planner comes back ON, because the old planner's serializer
  writes only its own fields; the cutover retires that planner, and until then the merged planner is where side covers
  are set. Sol's other two questions: the fitting steps follow the generator's instances, which read the same field (no
  bill-based step count); `!== false` is the right reading of a JSON record (the string "false" is not a switch-off).
- **Live 2026-10-20**, stamp `a1f085f5` (Joey: "Deploy"). Fast-forwarded onto main as `b1b8994`; the Build e2e cases on
  it found the back-cover case clicking the library's LAST Off segment, which the new Side covers segment now owns, so
  `a1f085f` scoped that click to the Back cover section (Luna `01a15b2d`; a test selector, not the toggle); that commit
  is what deployed. Its run 39499191693 passed on attempt 1 (e2e 37 min on the pinned image, within the 15 s / 30 s
  waits of `00c4602`). Checked live by
  `planner-prod-checks-2026-10-18\side-cover-toggle-prod.mjs` on the root kit: the segment reads Off | On with On lit; Off takes
  the four covers off the stage and the bill with the record's `sideCovers` false; On brings the four back with the
  record true; the share-link hash carries the field in both states.

## 2026-10-20 (Labels: the Part Picker modal is the one Studio tile; the full Studio is a link)

- **Joey:** "On the label page, we have where you can open the label studio both as a modal or in a new tab, I think
  I'd prefer we only have it open as a modal for now which would remove a button from the left menu, what do you
  think?" My read, which he took: drop the new-tab tile, keep the Part Picker modal as the one Studio tile, and keep the
  full Label Studio (icons, stripes, uploads, the print plate - none of which the modal has) one click away as a plain
  link in the panel's intro sentence, so nothing is lost but a button.
- **What changed (js/workspaces/labels.js, css/app.css):** the foot's "ways in" are three tiles - Type a label, From a
  file…, Part Picker - the Picker tile spanning the second row (`.span2`); the empty list's sentence reads "Make your
  labels in the Label Studio, …" with "Label Studio" a link to the Studio with the planner's `?from=planner … &return=`
  query (new tab, noopener; `studioHref()` now serves both the link and the dock's "Make labels" button, which stays);
  the tile's hint entry, its hover scene, its icon, its clip job in tools/hint-clips.mjs, its README row and
  img/hints/labels-studio.mp4 are gone. The Studio's own "Add to planner build" hand-off and the #labels-add= link are
  untouched.
- **Checks:** the Labels e2e cases 11 of 11 (none clicked the old tile); in the browser the foot reads two tiles over one
  (141 / 141 / 290 px at the desktop panel, 169 / 169 / 346 on a 375-wide phone) and the sentence's link carries the
  `?from=planner … &return=` query, new tab, noopener.
- **Review:** Terra `01a15b57`, routine: NO OBJECTION (no TDZ: the hint builds the href at render, after mount).
- **Live 2026-10-20.** Deployed with the two other coworker items as the merge `b8e747f` (Joey: "Deploy labels-one-tile + picker-hint-clip together and placement-why"); run 39519702499 passed on attempt 1 (28 min), stamp `b8e747f2`. Checked live by `planner-prod-checks-2026-10-18\labels-one-tile-prod.mjs`: the foot holds three tiles (Type a label, From a file, the Part Picker spanning its row at the full 290 px), no Studio tile, the intro sentence links the Label Studio (`?from=planner`, new tab, noopener), and `img/hints/labels-studio.mp4` is gone (404).

## 2026-10-20 (the Part Picker's hover clip shows the modal)

- **Joey:** "We might also want to replace our animated screen capture pop-up for when hovering over the part picker
  button as that is now out of date." The clip (img/hints/labels-picker.mp4, 2026-10-13) showed the Label Studio opening
  in a new tab, from before the Picker became a modal in the page; the README said so and asked for a hand recording.
- **What changed (tools/hint-clips.mjs, img/hints/):** the recorder can cut a clip between framings - `d.cut(crop)` marks
  the moment, the frames are split on their timestamps and the segments joined - so the Picker clip follows the gesture
  from the panel into the modal and back: the tile, the modal with Nuts → Hex nut → M3 picked and Add pressed (no
  lengths step; the e2e case's path), the label landing in the list. The modal frame is the Label Studio checkout
  beside the repo on a second loopback server, as the e2e suite serves it: the live Studio's Picker refuses a loopback
  planner as its parent, so the first recording sat on "hasn't answered yet". The clip is 16.5 s, 77 KB, 480 × 222;
  HINTS.picker's words were already right ("Choose screws, nuts, washers and inserts …"). The README's note is updated.
- **Checks:** five frames read from the clip show the panel, the modal with Nuts lit, the sizes, M3 ticked, the label in the
  list; in the browser the bubble on the tile plays it (16.5 s, 486 × 222 as shown). The e2e Labels cases do not touch
  the clips.
- **Review:** Luna `01a15b5e`, mechanical: NO OBJECTION.
- **Live 2026-10-20**, with `labels-one-tile` above (merge `b8e747f`, stamp `b8e747f2`). Checked live by the same script: the Part Picker tile's hint points at `img/hints/labels-picker.mp4`, served at 78,379 bytes (the re-recorded 16.5 s clip; the old one was 30,931).
## 2026-10-20 (Build: a refused placement says why)

- **Why.** Joey had a coworker try the planner: "the only thing that confused him, it wasn't clear why he couldn't place
  the 1w case in the middle above a 3w or 4w case ... maybe we need a small pop-up that explains why you cannot place it
  there?" The "+" spots are the cells where the armed size passes the structural judge (build.js `judge()`: no new
  unsupported end, sag risk or Wall Mount 0.5H top, and the generator builds it). A cell that fails simply has no spot,
  and nothing says so. The middle of a 3W fails the SAG rule (layout.js `sagRisks()`: a case resting on a wider case's
  interior with no wall under either of its own ends), and the ends pass.
- **What.** Beside the "+" spots, both views now draw the REFUSED cells next to the build (kind `no`): the cells where
  the size fits (`canPlace`, the cap) but the judge says no. `refusedSpots()` in build.js walks the same cells as
  `addSpots()`, skips the offered ones and the ones not touching the build, and asks `judgeWhy()` (the judge, returning
  the code of the first NEW problem instead of false: `s`, `u`, `w`, `gen`; `fit` for a collision or the cap, which
  draws nothing). Each carries `why`, the sentence from `refusalReason(code, { w, below })` in js/rules/layout.js (the
  one place the words live), and `ends`: the offered spots at the ends of the unit it would rest on, for the chip's action.
- **How it looks.** The stage: a grey disc with a BAR instead of the plus (`SPOT_COLORS.no`, `spotTexture(hex, glyph)`),
  a fainter ghost, a lighter grey on hover and never the placing green; `confirmSpot()` refuses it, so no path places
  there. A mouse resting on it opens the planner's chip (`#ws-choice`, class `no`: wrapping, wider) with the reason
  alone, a tooltip, and leaving the cell or the canvas closes it (`onHover`, a new spec callback). A click or a touch
  tap PINS the chip: the reason plus, when the rule allows one, "Put it at the left end" (the first offered end) and OK;
  hovering never overwrites a pinned chip, and a rebuild of the overlays closes either. The board: `.b-spot.no`, a muted
  disc with a bar and a `<title>` tooltip, its hover ghost the red one, a tap routed to `onRefused` (the pinned chip).
  Escape closes the chip first and keeps the size armed, as for a Place / Cancel choice.
- **The words.** Sag, with the unit below known: "A 1W can't sit on the middle of the 3W: a case needs a wall under at
  least one end. Put it at an end of the 3W, or use a wider case." Unsupported: "Both ends need a case below." Wall Mount
  top 0.5H: the Issues card's wording. Anything else: "The parts can't be built this way."
- **Checks.** test/refusal-reason.test.mjs (the words per code, the fallback). An e2e case: a 3W, 1W·1H armed → the
  middle cell is refused with code `s`, both ends are the way out, the "+" list has the ends and not the middle, the
  stage drew exactly one refused cell; a mouse resting on it opens the chip without Place, leaving closes it, a click
  keeps it up and places nothing, Escape closes it with the size still armed; on the board the muted disc, a click
  opens the reason, "Put it at the left end" places the 1W at x 0. The suite's spot helpers count the "+" discs only.
  The "+" spots themselves are unchanged: `judge()` is `judgeWhy() === null`.
- **Review:** Sol `01a15b70`, substantial: four findings, all four taken. (1) the chip is `white-space: nowrap`, so a
  reason overflowed its own buttons: `.no` wraps. (2) leaving the canvas over a marker left the hover (and the chip) up:
  `pointerleave` ends the spot hover and says so. (3) hover -> click -> leave -> hover -> leave closed the pinned chip,
  and a hover could replace a pinned one: the hover chip is now the reason alone and a pinned chip is left alone by
  hovering; a rebuild closes either (the touch choice was already closed by `setSpots`). (4) on a wall or under-table
  mount the supporting case is above the cell and the sentence said "sit on ... under": the `hanging` wording. Sol's
  own discards agreed: no path places on a refused cell; `judge()` keeps its verdict; `ends` holds only offered cells.
  One e2e run of the new case failed (17 s) while the full suite ran beside it; alone and with its four neighbours it
  passes every time since, so the hover waits are the usual 15 s / 30 s.
- **Live 2026-10-20.** Deployed with the two other coworker items as the merge `b8e747f` (Joey: "Deploy labels-one-tile + picker-hint-clip together and placement-why"); run 39519702499 passed on attempt 1 (28 min), stamp `b8e747f2`; before the push the merged tree ran npm test 571 (566 passed, 0 failed, 5 skipped) and e2e 64/64 on this machine. Checked live by `planner-prod-checks-2026-10-18\placement-why-prod.mjs` (a 3W through the store, 1W·1H armed): the middle cell is refused with code `s` and the sag sentence, both ends are the way out, the "+" list has the ends and not the middle, the stage drew one refused marker, resting on it opens the chip with the reason and no button, a click pins "Put it at the left end" + OK, and that places the 1W on the 3W's left end (the grid gained its spare top row, so the record reads 1W@0,2 on 3W@0,4). The first version of the check compared the 1W's y to the un-rebased row and failed on that alone.

## 2026-10-20 (Assemble opens at the beginning; the camera button says what it does)

- **Why.** Joey, on a wall build: "in the assembly tab, it seems to start at the end or something, i'd rather it start
  from the beginning and how do i get it to snap back to the cinematic camera?" Every other workspace parks the stage
  on the FINISHED step (`skipToEnd()` after an update, `goTo(steps)` at mount), and Assemble's mount only moved to the
  Overview when the stage was still on the cover (`stage.cur === 0`, a `?ws=assemble` address). So the first visit from
  Build opened on the last step. The "deep link into a step" the old comment reserved that branch for does not exist.
- **The start page.** A first arrival (no remembered step in `ctx.memo`) lands on the exploded Overview from the cover
  AND from the finished step: `else if (stage.cur !== pageOf.overview) stage.goTo(pageOf.overview)`. The step a visitor
  left on still comes back after a trip to another workspace, and Parts' "Start assembly" still lands on the Overview.
- **The camera.** The toolbar's "Reset view" button (the frame icon) already did it: `stage.resetView()` presses the
  viewer's own Resume cam, which drops the orbit override and glides to the step's guided camera. It did not look like
  the answer. In Assemble it is now named "Back to the step's camera · after you orbit or zoom, this returns to the
  guided view" (`toolbar({ camTitle })`) and lights orange while the visitor has the camera: the stage reports
  `get camFree()` and fires `opts.onCamFree(on)` from `setCamOverride` (only on a change), app.js routes it to the
  workspace, Assemble's `onCamFree` re-syncs the toolbar. Other workspaces keep "Reset view" and never light it.
- **Checks.** An e2e case: open Build (the stage on the finished step, asserted), switch to Assemble → `cur === 1` and
  the list reads "0 / n"; Next, a trip to Parts and back → the step comes back; the camera button is named for the
  step's camera and unlit; a real mouse drag on the stage lights it with `camFree` true; pressing it returns the camera
  and the light goes out. The old `=== 0` rule put back fails the case at the first wait. The two existing Assemble
  cases and the boot case pass.
- **Review:** Terra `01a15bf2`, routine: no findings. Its own discards: a breakpoint remount unmounts first, so the step is remembered; an incomplete manifest's goTo is forced to its preview either way; the callbacks are optional-chained and the toolbar exists before any goTo; every override clear runs through setCamOverride, which updates before it notifies; the e2e drag stays clear of the step list and the player.
- **Live 2026-10-21**, stamp `a9609f2e`, together with the idle-gate case below. Its own run (39524907871, `996d51c`) failed on that
  case, a timing gate the runner missed (the stage's rebuild outlasted a fixed 1.5 s window); run 39537588862 for `a9609f2`
  passed on attempt 1 (41 min). Checked live by `planner-prod-checks-2026-10-18\assemble-start-prod.mjs`: from Build (the
  stage parked on step 12, the finished one), Assemble opens on the Overview with the list at "0 / 11"; the camera button
  is named "Back to the step’s camera", unlit, lights after a real orbit and goes out when pressed.

## 2026-10-20 (the idle-gate e2e case counts the gate waking, not frames in a fixed window)

- **Why.** The deploy of the Assemble fix (`996d51c`, run 39524907871) failed on one e2e case, the idle gate's "an edit is
  drawn at once": it counted frames drawn in a fixed 1.5 s window from the store commit and wanted 3, and on the runner
  the stage's rebuild for the edit alone outlasted the window. The same case flaked once on 2026-10-18. The code was not
  at fault: the case passed locally and the change under deploy did not touch Build's render path.
- **What.** The stage counts `idle.woken`, frames drawn inside the 600 ms settle window after a change that the
  once-a-second safety net would not have drawn, and `idleStats()` reports it. The case reads it before the edit and
  waits (Playwright's own 100 ms poll, 60 s) for it to rise. Counted, not timed, so a slow runner only makes it wait.
- **Checks.** Passes 4/4 here, two of them on SwiftShader with a 4x CPU throttle. A gate that ignores signature changes
  fails it (woken stays 0); a gate that draws only its safety net from the first rebuild after boot fails it (no wake
  after the edit). A gate that only draws the safety net from page load breaks the boot itself, so the case never
  reaches the assertion: not a usable mutant.
- **Review:** Terra `01a15c53`, two rounds. Round 1, all three taken: a two-frame window counted from the rebuild could
  still straddle the settle time on a slow runner; at about 1 fps two safety-net frames would pass a broken gate; an
  rAF-polled 60 s cap is not a hard cap. Round 2, two known limits, kept and written into the test's comment: a working
  gate misses only with drawn frames more than 600 ms apart and a safety-net coincidence (measured about 300 ms per
  drawn frame on SwiftShader at a 4x throttle: 106 ticks in 3 s, 4 of them drawn); an unrelated wake during the wait
  could pass a broken gate (the view was just measured still for 3 s).
- **Live 2026-10-21**, stamp `a9609f2e`: run 39537588862 passed on attempt 1, this case included. Here the full e2e run beside
  it was 64/65: the Label plate's faceplate-switch case, which needs the Label Studio checkout (skipped on the runner),
  timed out on a hidden "Screw and nut drawings" Off button; it fails 2 runs in 4 on main without this change too, so it
  is an older flake, recorded for its own look.

## 2026-10-20 (a change of mount stands the build up; no setup change reloads into a build the stage cannot show)

- **Why.** Joey switched a wall build to Tabletop "and i got this error because there were some unfilled units on the
  bottom": the page stopped on "Can't show this build yet · A unit is floating (nothing under part of it)", twice, with no
  way back but a new build. His layout, from his board that evening: 7W x 4H on the brackets, 11 units, the bottom row
  open under columns 0-1 and 5-6. `setMount` only slides a layout against the new surface. The generator wants EVERY
  column of every unit to rest on another unit or the table (or, hanging, to hang from one or the bracket course): stricter
  than the planner's own support rule (both ends) and than its `fixStructure` (gravity, then a case under each open end).
  Gravity would also have rearranged his design: two units dropped, the top right left open.
- **The repair.** `js/rules/stand.js`, a new hand-written module (the rule modules beside it are generated from the old
  planner by tools/port-rules.mjs, which rewrites them whole). `standUp(build, Rs)` keeps the layout as designed, nothing
  moves, and fills each open column under a unit (tabletop) or above it (hanging) with 1W cases through the rules' own
  `fillColumn`, in the build's majority drawer type, as Build's red support spots place them; it also lifts a `nextId` that
  lags the ids. For his build: four 1W·1H Decor cases at the four open cells. `refusalReason` moved here from layout.js too
  (today's addition; `npm run drift` reported it as 17 lines a port would delete).
- **The setup sheet.** A change of mount runs `standUp` after `setMount`, and the sheet says so before Apply: "As a
  Tabletop build it needs 4 support cases under the gaps · Apply adds them." After the reload a toast repeats it
  ("Tabletop: added 4 support cases under the gaps."). And every scene change (mount, length, a new build) now builds
  the record Apply would write on a copy first (`applyDraft` on a detached candidate, with the store's own normalising)
  and runs the generator on it: if it refuses, nothing is committed, the history, the address and the Recent entry stay
  as they were, the sheet shows the generator's words, and nothing reloads. The same candidate gives the count above
  Apply. That closes a second dead end: a length that strands a unit (a 2W·3H Classic at 59, say) reloaded into the same
  error page under a warning that promised the units would "stay on the board flagged". That warning now says "swap them
  for sizes it has before changing the length".
- **The boot's safety net.** A record saved or linked before this (Joey's own planner holds his build that way; an old
  planner's link can carry a unit in mid-air): the stage's boot, when the generator refuses a `#build=` record, asks the
  shell (`opts.repair` = `standRecord`: the same slide against the mount's edge, then `standUp`) and uses the result only
  if the generator accepts it; anything else stops on the error page as before. The page then says "As saved, this build
  couldn't stand as a Tabletop build · added 4 support cases under the gaps.", writes the stood-up record into the address,
  and, when it came from this browser's own builds rather than a link, into its Recent entry, so a reload opens it as it
  now is. A link stays out of Recent builds until edited, as before.
- **Checks.** test/stand.test.mjs (his wall build is fine; switched it was refused twice for floating units; `standUp`
  adds exactly the four cells and moves nothing, and the generator accepts it; Tabletop to Wall Mount fills a ragged top
  up to the brackets; a standing build is left alone; the boot's net on his saved record and on a layout floating above
  the table; no false repair of the e2e suite's damaged link; the majority drawer type; unique ids). Three e2e cases: his
  wall build through the sheet to Tabletop (the line before Apply, the reload boots, his 11 at the same heights, the four
  supports, the toast); a length change stranding a unit refused in the sheet with the generator's words, nothing
  reloaded, the record unchanged, no Redo; his saved record as a link opens stood up with the note and the address
  carrying it. Mutants, each failing its own case: the sheet without standUp, the sheet without its check, the boot
  without its safety net; and a repair that fills only the ends fails the unit test's 3W-on-two-1W case.
  The deploy's stamping lines carry the new imports (setup.js, build.js, app.js, stand.js), replayed locally with the
  module-graph guard.
- **Review:** Sol `01a15c9b`, substantial, two rounds. Round 1, one finding, taken: the first version committed the
  change, ran the generator, and undid it on a refusal, which left the refused record on the Redo stack, one Redo from
  the dead end; now the candidate is checked before anything is committed. Round 2 on the revision: no findings. Sol's
  own discards matched mine: standUp terminates and fills every column in both directions; a share link stays out of
  Recent builds; Labels consumes its part of the address at mount, and the rewrite skips an address that still has it.
- **Live 2026-10-21**, stamp `daf28eea` (run 39542860845 passed on attempt 1, 41 min), after npm test 580 (575 passed, 0
  failed, 5 skipped) and e2e 68/68 here. Checked live by `planner-prod-checks-2026-10-18\mount-stand-prod.mjs` on a fresh
  profile: his wall build through the sheet shows "As a Tabletop build it needs 4 support cases under the gaps · Apply adds
  them.", the reload boots with his 11 at the same heights above the table and four 1W·1H Decor supports on it under
  columns 0, 1, 5 and 6, and the toast says so; his record as the old switch saved it, opened as a link, boots stood up with
  15 units and the note, and the address carries the 15. Joey's own saved build opens the same way on his next visit.

## 2026-10-21 (a change of mount adds nothing: the gaps stay empty slots to fill, Fill all fills them, Assemble waits)

- **Joey's call, in words:** "i don't want switching between mounting types to automatically add units." The gaps a switch
  leaves stay "empty slots I have to fill in", "the assembly is not legal until i fill in those gaps", and "I don't mind
  having an auto fix button". This reverses the auto-fill of the entry above (daf28ee); its other half stays: no setup
  change reloads into a build the stage cannot show.
- **The generator's voids mode** (`generateManifest(build, { voids: true })`). An open column under a tabletop case (down to
  the table) or above a hanging one (up to the build's top row, the grid's top row once the layout reaches its brackets
  or rails) is no longer an error: each open run is a ghost box, the same
  ghost as the 2026-08-23 unfinished-top preview, and the build is an in-progress preview with no instructions. The planner
  shell asks for it everywhere it shows a build (the boot, its repair, updateBuild, regenerate, Build's and Labels'
  stages). The plain viewer and the default call stay strict. A tabletop layout with nothing on the table is still refused.
- **The setup sheet** no longer calls standUp. Before Apply it says "As a Tabletop build it will have 4 empty slots under
  it · Apply adds nothing: fill them in Build before it can be assembled.", and after the reload the toast says "Tabletop:
  4 empty slots under it to fill · they show red in Build, where Fill all adds 1W cases."
  The boot's net (standRecord) now only slides a record onto its surface; it adds nothing.
- **Build** lists "N empty slots to fill." as a hard issue with a **Fill all** button (standUp: 1W cases in the build's
  majority drawer type, nothing moved, one Undo). The slots are the red spots on both views and hatched on the board.
  openCells (js/rules/stand.js) finds them by walking to the same surface Fill all fills to, the table or the grid's top
  row, so the slots shown are exactly what Fill all fills.
- **Gravity holds the floating cases a switch left.** It now drops only what an edit made unsupported, so filling one
  slot by hand leaves the other cases over their slots. Without this, the first case placed dropped every other floating
  case into its slot.
- **A new gap is still refused.** The placement judge now asks the generator in voids mode, so a build with slots still
  offers its spots, and it refuses any placement that would open a slot of its own. That case says "Part of it would
  have nothing under it: every column of a case needs a case below it or the table." It covers a 3W over two 1Ws with
  an open middle, which the both-ends and sag rules let through. Before, the strict generator refused it without a
  reason.
- **Assemble** shows "Not ready to assemble" with **Go to Build** while the build has empty slots, or an uneven tabletop
  top, instead of a one-step player that ended on "The whole assembly, finished".
- **Known limits.** The slot count is the number of 1W cases Fill all adds, and the generator counts open column runs.
  They agree for 1H-deep gaps. A hanging layout that reaches no bracket has no slots and keeps the "not supported" issue
  with Fix structure. Only old links reach that state. Cases the previous release already added to a build stay until
  removed.
- **Checks.** test/stand.test.mjs covers openCells, Fill all filling exactly the open cells on a table and on a wall,
  and a wall layout off its brackets having none. It also covers the generator's voids mode (Joey's switched build shows 4
  ghosts meeting the case bottoms, a wall ghosts its ragged top, a complete kit is byte-identical either way, a floating
  layout is still refused), and the boot net adding nothing. test/refusal-reason.test.mjs covers the new reason.
  The e2e cases cover four things. Joey's wall build goes through the sheet to Tabletop: the line, 11 units, 4 ghosts,
  no instructions, the toast, Assemble's card and Go to Build, the 4 offered spots, one slot filled by hand with unit 6
  kept, the stage at 3 slots, the issue card's "3 empty slots to fill." and Fill all completing it, then Assemble's
  steps. His saved record opens as a link with nothing added. A 3W over a gap is refused with the new reason. The length
  refusal is unchanged. Six mutants each fail their own e2e case: settle without hold, Build's stage and judge without
  voids, the boot without voids, the sheet calling standUp again, the judge without the open-cell count, and Assemble
  without the card. Two of them first survived: the sheet mutant never fired as written, and the sheet case never looked
  at the stage or the offered spots between fills. The mutant was rewritten and the case strengthened. The new Fill all
  unit test failed on the first openCells, as it should have.
- **Review:** Sol `01a15eb1`, substantial, inline payload: no findings. Terra `01a15eb3` on this entry: two wording
  fixes taken (the toast quoted, the hanging top named); five discarded against the code. A first call, `01a15eaf`, pointed the reviewer at
  a payload file the bridge would not let it read, and is recorded as failed. Before review I found and fixed one defect
  myself: openCells walked a hanging build to its own top while Fill all fills to the grid's top row.
- **Live 2026-10-21**, stamp `94efe681`: 213f48c's own push started no workflow run, so an empty commit, 94efe68, went on
  top and run 39616553471 deployed both. Before it: npm test 579 pass, e2e 69/69. Checked live by
  `planner-prod-checks-2026-10-18\mount-voids-prod.mjs` on a fresh profile, all 20 checks: the sheet's line, 11 units
  after the switch, 4 ghosts and no instructions, the toast, Assemble's "Not ready to assemble", "4 empty slots to fill.",
  Fill all to 15 with 1W·1H supports under columns 0, 1, 5 and 6, then Assemble's steps; his record as a link opening with
  11 units, 4 ghosts, no added note and the address untouched.

## 2026-10-21 (an opened drawer shows its inside W / L / H again)

- **Joey, reported:** "i noticed we no longer get interior dimensions when opening a drawer like we did in the old planner".
- **Why they were gone.** The stage kept the old viewer's drawer focus: the cavity measured by rays, lines on its floor and
  back wall, and the three W / L / H pills. It ran only when a selection dived into a drawer. The planner selects quietly by
  design and opens a drawer only through its own buttons (Build's Peek inside, the Colors card's Open the drawer, both
  stage.peekUnit), which slid the drawer out and nothing else.
- **Now** peekUnit enters that focus without the camera swing; the planner never takes the camera unasked. The pills show the
  drawer's inside size while a peek holds it open. Picking another of that drawer's parts (its handle, label or accent) keeps them.
  Closing it, deselecting, or picking anything else gives the build's pills back as they were before the peek, on or off.
  The ruler during a peek is the visitor's: it reads their own setting, and a click hands the pills back to the build's
  sizes with the drawer left open.
- **On the way:** a pick of another part on the open drawer used to leave it open while the stage forgot it was open.
  The stage now keeps track of it while the peek holds.
- **Checks.** A new e2e case covers the pills on Peek inside within the drawer's outer size, the camera unmoved, the sizes
  kept while a riding part is picked, Close it restoring the build's pills, and the ruler handing them over and hiding them.
  It also covers a peek with the ruler off closing to no pills. The older Peek inside case still passes. Five mutants each
  fail the new case: no focus in peekUnit, the quiet pick always leaving it, the exit without the restore, setDims without
  the hand-off, and dimsOn ignoring the peek. The quiet-pick mutant first survived, because re-selecting the part already
  selected is a no-op, so the case now picks a part riding the drawer. The first run also showed the ruler's click reads
  dimsOn, and the ruler steps were rewritten for it.
- **Review:** Terra `01a15ee8`: no findings. Luna `01a15eea` on this entry: two wording fixes taken, five discarded.
- **Live 2026-10-21**, stamp `ef16aa43` (run 39625024867, with the silk sheen). The first live check
  (`drawer-silk-prod.mjs`) passed, but it judged the pills by the stage's own `hidden` class, as the e2e case did: a
  screenshot of the live page showed none. The shell's CSS hides `.dim-label` unless the ruler is on, and the ruler is off
  by default. Fixed the same day, below.

## 2026-10-21 (silk swatches wear a sheen)

- **Joey, asked:** "in the color palettes, is it possible to give the silk material squares a gloss effect, like a sheen
  on half of it or something? To help differentiate it from regular material".
- **Now** a silk filament's swatch wears a highlight over its upper-left half, cut at the diagonal, with a faint shade on
  the lower right so a white or silver silk reads glossy too. It shows in the picker's brand grids and its In this build
  row, the Filaments I own grid, and the small chips in the Colors rows, the shop rows, Simplify and the part card. A
  swatch is silk when its filament's name has the word Silk, which every Panchroma Silk PLA colour has and no other does.
  The sheen is drawn in ::before, so the pick star and the owned tick keep ::after.
- **Checks.** A new e2e case: all 24 silk swatches in the picker wear the sheen and none of the plain ones do; after
  picking Panchroma Silk Gold, its row chip and its In this build swatch wear it too. Screenshots in both themes in
  D:/Claude - Output/silk-swatches-2026-10-21. npm test 584 (579 pass, 0 fail, 5 skipped). The full e2e run: 71, 70
  pass, 1 fail, "a refused cell says why", a Build case whose mouse rest opened no chip within 15 s; it passed 3 runs of 3
  alone. This change touches only colors.js, app.css and the e2e file.
- **Review:** Terra `01a15ef6`: no findings. Luna `01a15f02` on this entry: two fixes taken (the counts, the failure's
  wording), two discarded (the quote is verbatim; the gradient's hard stop at 50% is the half).
- **Live 2026-10-21**, stamp `ef16aa43` (run 39625024867): `drawer-silk-prod.mjs` finds the sheen on all 25 silk swatches in
  the first region's picker (its brand grids and In this build) and on none of the 93 others.

## 2026-10-21 (the feet are TPU: TPU95 Black by default, a TPU-only feet picker; material tags on every filament line)

- **Joey, asked:** "when selecting the feet, i feel like we should only list TPU filaments as an option, not sure if we even
  have any in the planner at all? But default for feet should always be TPU black". Then: "maybe we need to make PETG and PLA
  and TPU, like colored tags in the menu to help differentiate the material types more?" On which TPU: "you can use any TPU,
  so polymakers TPU lineup would be fine to add, and i can grab an affiliate link". He sent the minted links
  `JERRARI?q=polyflex-tpu95` and `?q=polyflex-tpu90`.
- **The catalogue** had no TPU. It gains Polymaker PolyFlex TPU95 (Black, White, Blue, Red, Yellow, Orange) and TPU90
  (Black, White, Grey, Polymaker Teal), with his links. The hexes are the shop's own published swatch values and the ids its
  1.75 mm variants. TPU90 Clear is left out, following the catalogue's rule for the Translucent PLA line: no
  semi-transparent colour until a transmission measurement exists. TPU95-HF waits for a link. The catalogue is the old viewer's file by its header; it was copied
  there (gen2-visual-animator `72545c5`, local, not pushed: that main also carries two other sessions' unpushed commits)
  and into the Lab with its pin bumped (Filament Material Lab `0b80ffc`).
- **The stage keeps the feet TPU.** Every preset's feet are PolyFlex TPU95 Black. A palette that names no feet or a
  non-TPU filament for them, from a saved, linked, uploaded or shown palette or a reset, wears TPU95 Black, and a unit's own
  non-TPU feet pick is refused (main.js `tpuFeet`, `tpuFeetOver`).
- **Surprise me** gives the feet a fixed role like the bought hardware: TPU95 Black in every look, never drawn from the
  colour pool, and outside the look's filament cap, which is about the look's colours. A card's count is still every spool
  the build prints in (D2), so on a build with printed feet it reads one above the cap, and the panel says why: "The feet
  print in TPU95 Black in every look, on top of the cap and the filaments you own." Counting the TPU inside the cap would
  leave a cap of 2 with no look at all on such a build. **Simplify** never merges the feet's filament with another, and
  its summary gives the feet their own group. The Jerrari on the root kit now prints in 5 filaments, not 4.
- **The picker** lists only the TPU lines for the feet, under a note, and none of them for any other region. The feet's
  reset reads "Reset to TPU95 Black". Every line header in the picker and in Filaments I own carries coloured material
  tags: PLA, PETG, TPU, and both PLA and PETG on the Elegoo line.
- **Checks.** A new e2e case covers the boot preset's TPU95 Black feet, a case picker's seven lines each tagged with no TPU
  swatch, and the feet picker's note, two TPU lines and 11 TPU swatches. It then picks TPU95 Orange and resets to TPU95
  Black, feeds a palette with PLA feet, and reloads a saved palette rewritten to PLA feet: each ends on TPU95 Black. A
  unit's own PLA feet pick is refused. The catalogue, presets, generator (M16, M17), Simplify (M25) and style tests follow the new rule,
  and four e2e cases take the new counts: Surprise me's cards within the cap plus the feet, with the note; its owned check
  skipping the feet; Simplify from 5, its two-merge step at 3; the phone's Simplify ending at 4. Eight mutants each fail
  their own check: the stage rule a no-op, the picker filter removed, the per-unit guard removed, a saved palette loaded
  as saved, no tags, TPU back in the generator's pool, Simplify merging the feet, no cap note. Screenshots in
  D:/Claude - Output/tpu-feet-2026-10-21.
- **Review:** Sol `01a15f0d`: no findings, on the change and then on the cap note and the counts. Luna `01a15f21` on this
  entry: one fix taken (the Clear rule is the Translucent PLA line's), one discarded (the reset is covered: setColor).
- **Live 2026-10-21**, stamp `0b896b02` (run 39640071883). This commit's own run was cancelled by the push of 5df44d7, and
  that run by another session's push of `0b896b0`, which run 39640071883 deployed with both. `tpu-feet-prod.mjs` passes all 9 checks there:
  the feet default, the case picker's seven tagged lines with no TPU, the feet note, the feet picker's two TPU lines, a
  palette with PLA feet wearing TPU95 Black, Surprise me's cap note, no errors.

## 2026-10-21 (a peeked drawer's inside sizes show with the ruler off)

- **What was wrong.** The drawer's inside W / L / H went live at `ef16aa43` and showed nothing in the planner unless the
  toolbar's ruler was on. The shell's CSS hides every `.dim-label` without `html.ws-measure`, and the ruler is off by
  default. The e2e case and the first live check both turned the ruler on first and judged the pills by the stage's own
  `hidden` class, so both passed.
- **Now** the stage marks `<html>` with `ws-drawer-dims` while a peek holds the pills, and the CSS exempts that state.
  main.js `syncPeekClass` sets it after enterDrawerFocus records the peek, after exitDrawerFocus clears the carrier, and in
  endPeekFocus.
- **Checks.** The e2e case and `drawer-silk-prod.mjs` now judge a pill by its computed display as well. With the CSS
  exemption removed, the case fails at "a peek with the ruler off showed no inside sizes". On the live `ef16aa43`, the
  changed live check fails `rulerOffPills` and passes every other check, which shows the bug.
- **Review:** Terra `01a15f3e`: no findings. Luna `01a15f3f` on these lines: five wording fixes taken, one discarded (the
  record is Joey's saved one, as the entry says).
- **Live 2026-10-21**, stamp `0b896b02` (run 39640071883): `drawer-silk-prod.mjs` passes, `rulerOffPills` included.

## 2026-10-21 (the planner's buy links report the viewer's buy: events)

- **Why.** Joey asked what happens on his affiliate links, and his Polymaker dashboard shows only completed purchases.
  A click is the step before a sale, and the planner's own buy links reported none: the Colors picker's Buy, the
  shopping list and look-detail rows, the Parts list's filament names and its hardware Amazon link.
- **Now** each sends the name the viewer already uses for the same click, so both apps' clicks land on one dashboard row.
  - `buy:filament:<brand-line>` comes from main.js `buyFilamentEvent`, which finds the brand and line by the picked
    colour's catalogue label.
  - `buy:hardware:<listing id>` comes from `buyEvent`, using the `HARDWARE_BUY` id.
  - The stage exposes both beside `track`; colors.js `buyFilament` and parts.js `storeLink` call them.
  - The Parts list shows "Panchroma Black" as "Black", so its items carry the full label (`full`) for the lookup.
  - Every link's href, target and rel is unchanged. The download-site links still send nothing.
- **Checks.** A new e2e case clicks each kind of buy link and checks the event names as literals, with the navigation
  cancelled after each link's own handler: the picker (Elegoo, then Panchroma), a shopping-list row, a Parts filament
  name, and the hardware link in both list layouts. With `buyFilament` made a no-op, the case fails, listing the four
  missing filament names. npm test 579 pass, 0 fail; e2e 73/73.
- **What the dashboard can and cannot say** about these clicks is in a note on Joey's machine
  (D:/Claude - Output/affiliate-clicks-2026-10-21/NOTE.md). Like the stats themselves, it is kept out of the repo.
- **Was open, Joey's call.** The Parts list's Amazon links carried `rel="noopener"` without `sponsored`, and no "· paid
  link" label next to the link; the list's foot line carried the disclosure. This change left rel as it was. Joey
  answered the same day: see "the Parts list's Amazon links are marked paid at the link" below.
- **Review:** Terra `01a15f5a`: no findings.
- **Deploy:** a fix for a problem Joey reported; it deploys once its checks pass.
- **Live 2026-10-21**, stamp `0b896b02` (run 39640071883). Checked on the live site with GoatCounter's own `skipgc`
  opt-out set and its count stubbed, so nothing reached the dashboard. The picker's Buy, a shopping-list row and a Parts
  filament name each sent `buy:filament:polymaker-panchroma-pla`; the Amazon link sent `buy:hardware:magnet-10x2`; the
  Printables link sent nothing.

## 2026-10-21 (the cover tiles' edges catch the light)

- **Joey, reported:** in My colors a row of cover tiles read as one solid slab, where on a printed build a seam is just
  barely visible. He suggested a 0.2 mm chamfer on the covers' top side edges, so the light would hit them
  differently (relayed, not verbatim).
- **Why there was no seam to draw.** All 24 cover GLBs have square seam edges, and neighbouring tiles meet within
  0.012 mm. The knowledge pack records this: `measurements.md`, "Covers: the seam edge, the thickness, and how the two
  layers stack", vault `23d4991`.
- **Why it isn't a 0.2 mm chamfer.** At the whole-build view a 621 mm build gets about 2.4 device px per mm at dpr 2, so a
  true 0.2 mm chamfer is half a pixel. Measured on moving frames it reached about a third of a 1 px edge's contrast and
  flickered 2.5 to 25 times as much.
- **What Joey picked.** Three render-only versions were compared: a shading-only bevel, a drawn hairline and a gap.
  Joey picked the bevel. The comparison, screenshots and numbers are in
  D:/Claude - Output/cover-seams-2026-10-21/COVER-SEAMS.md.
- **Now** `js/cover-seam.js` tilts the normal 45° toward the outside of each Cover Lower and Cover Upper tile. It acts in
  a band at each side edge, max(0.2 mm, 1 device px) wide, with its inner edge anti-aliased over one pixel.
  - The edge catches or loses the light like a chamfered one, and the row's two outer ends get it too.
  - It is shading only: the printable models, the bill and the geometry are unchanged.
  - The tilt goes in after the bed finish, because the Cover Upper prints top-face down and its visible top is its bed
    face, whose plain normal the finish restores.
  - `?seams=off` draws the edges square, for comparison. The debug hook has `seams.set(on)`.
  - The new module has its stamping line in pages.yml.
- **Checks.**
  - **`test/cover-seam.test.mjs` (8 tests).** On three r185's real shader sources it checks the chain after the relief
    and the bed finish, and that the tilt lands after the finish's plain restore and before the lights read the normal.
    It also checks Joey's numbers, the switch as one shared uniform with no recompile, the attribute, both material
    sites, and the stamping line.
  - **`npm test`** (on the tree rebased onto main `0b896b0`): 592 tests, 587 pass, 0 fail, 5 skipped. Smoke test: passes.
  - **e2e:** 73 tests, 72 pass, 1 fail. Over five full runs on this branch (on three bases), one passed every case and
    four failed one, "a back cover on a Decor drawer says the tear-away front comes out first", at its Parts-row wait
    (60 s).
  - **That failure is an older race, and origin/main has it too.** A replay of the case's steps fails the same way on
    `0b896b0` without this change, with the same stack: `mount()` replaces `typeByNode` with the new manifest's parts
    before `await loadTemplates()`, and the stack and the code fit this sequence: a Parts-tab switch inside that await runs
    `applyState` over the old instances, one of whose nodes has no type, so `colorLocked(undefined)` throws and the Parts
    tab draws nothing. It is not fixed here; it was recorded as a follow-up, and `1272bce` has since fixed it (a layout
    change's mount adds to the stage's type maps instead of replacing them). The replay of the case's steps
    (`debug-backcover.mjs` in the report's harness folder) passes 6 runs of 6 on main `284b6c6`; on `0b896b0` it failed
    on the first.
  - **Deploy guard:** the stamping step and module-graph guard, replayed on a copy, print "module graph OK". Without the
    new line the guard fails on `./cover-seam.js`.
  - **Goldens:** origin/main matches the committed goldens exactly. This branch moved only the 20 finished-build shots
    (at most 0.059 % of pixels on Fast and 0.096 % on Very High, against the 0.1 % threshold); the cover and middle
    steps stayed at 0.000 %. The change is intended and nearly used up the threshold, so those 20 are re-blessed and
    the other 40 are left as committed. Afterwards: 60 of 60 at 0.000 %.
  - **On a 7W build, dpr 2, both themes:** all 8 cover meshes carry the attribute with their own half-width, there are
    no page errors, and the program count is 18 with the edge on and off.
- **Review:** Sol `01a15ee1` on the prototype: 2 fixes taken (a zero-width band, an interpolated outward vector). Sol
  `01a15f1b` on this change: no findings.
- **Deploy:** held until Joey had seen it ("Don't deploy until I've seen it."). Then: "I've seen the bevel and it looks
  right. Merge cover-seams-proto into main and deploy." Rebased onto main `0b896b0`, and the checks above were run on
  the rebased tree.
- **Live** at stamp `b11f4931`. Main was fast-forwarded to `93c8e7e`; its own run was cancelled by the next push,
  `b11f493`, whose deploy carries it.
  - Read off the live site: `main.js` imports `cover-seam.js?v=b11f4931`, and the served module is Joey's numbers (0.2
    mm, 1 px, 45°).
  - In headless Chrome (?debug=1, Very High, dpr 2, dark stage, the 7W build), all 8 cover meshes carry the attribute
    and the patched material, the edge is on, and there are no page errors. The edge on and off differ in 1,726 pixels,
    all inside the covers' band of the frame: the same count and bounding box as the local check. Shots in
    D:/Claude - Output/cover-seams-2026-10-21/live.

## 2026-10-21 (an opened drawer's pills stay clear of the panels and of each other)

- **Seen live at `0b896b02`.** With the pills now shown, a screenshot of Build at its default view had the W pill partly
  under the dock: an opened drawer comes toward the camera, and the pills were clamped only to the canvas edges.
- **Now** the stage places them with `placePills` (main.js), a pure function. Each pill, centred on its point, is clamped
  into the canvas less the panels' bands (`safeArea`), 8 px in. When it would overlap a pill already placed, it moves to
  the nearest free height in whole steps, above first, that overlaps none of them. The render loop reads every projection
  and size first, then writes. A pill not yet displayed measures 0, so it is placed at a 120 x 40 guess (the pills measure
  about 69-100 x 34), and the stage asks for another frame, at most three in a row, where it is placed at its measured size.
- **Checks.** A new unit test, test/drawer-pills.test.mjs, lifts `placePills` from main.js and puts three pills on one
  point, at each of four points: the top of the clear area, its middle, under the left panel and the dock, and the bottom
  right. Each lands inside and none overlap. A mutant without the recheck overlaps in the first case. The e2e Peek inside case now
  checks every pill sits inside the clear area and apart from the others, after a peek with the ruler on and one with it
  off. With the safe area ignored it fails, the L pill's left edge at 327 px against a 332 px band.
- **Review:** Terra `01a15f9c`, four rounds. Three findings taken: a single pass could move the third pill off the second
  and back onto the first; a pill shown at a guessed size could overlap; with no free slot at the guessed size, the
  colliding place could stay on the last frame. One discarded: a pill held at display:none while another shows cannot
  happen, since the three pills share one display rule. Luna `01a15fa4` on this entry: five wording fixes taken, one
  discarded (a summary need not list every minor case).
- **Live 2026-10-21**, stamp `b11f4931` (run 39650372249): `drawer-silk-prod.mjs`, now with a `pillsClear` check (which
  failed on `0b896b02`), passes all 11 checks. At 1440 x 900 the W pill's box now starts at y 740, above the dock's band
  at 782.

## 2026-10-21 (a layout change's mount leaves no part of either build without its type)

- **Found, not reported.** It is the older race the cover-edges entry above names: the session deploying the cover
  edges found it, and Joey did not report it.
- **What was wrong.** `mountManifest` replaced `typeByNode` and `partInfoByNode` with the new build's maps before
  `await loadTemplates()`. Until the new GLBs land, the old instances are still the stage's.
  - A Parts tab switch in that window is a `goTo`, so an `applyState` over the old instances.
  - An old node that the new build no longer had found no type. `colorLocked(zoneKey(undefined, ''))` threw on
    `type.split`, and the Parts list drew no rows.
  - The back-cover e2e case flaked on it: four of five full runs on the cover-edges branch failed at its Parts-row
    wait. The window lasts as long as the new build's GLBs take to load, so how often a run hits it depends on timing.
- **Now** the mount adds the new build's rows to both maps (`Object.assign`) instead of replacing them. A node of either
  build has its type through the window, and a node in both builds takes the new build's row.
  - **Why the maps are not swapped after the await.** That was tried first, and it moves the throw to the other side. A
    palette repaint in the same window walks the NEW manifest's parts through `primaryKey`, and `activeHex(undefined)`
    threw on `key.split`. The new e2e case fails on it. A full e2e run on that attempt also failed "a spot left of the
    starter drawer…" with the same error.
  - **Why the maps may only grow.** No node changed type across the builds swept. The sweep asked the generator for
    128,520 builds: the six lengths, the three mounts, the five faceplate families, the three handle styles and the
    three fills, widths 1W to 4W and heights 0.5H to 3H, with and without a back cover, plus Gridfinity, magnets and
    lips, in one-unit and two-unit builds. The generator refused 56,040 of them (sizes it does not make), and the
    72,480 manifests it made held 625 nodes, none with two types
    (D:/Claude - Output/stage-type-race-2026-10-21/node-type-fixed.mjs). It is a sweep, not a proof. A node in both
    builds takes the new build's type anyway, so a build the sweep missed could at worst mis-type an old part inside
    the window. No code iterates either map. Every read of `partInfoByNode` goes through a live instance's node, so a
    row whose node has left the build is never read.
  - `drawThumb` (the Build library's previews) already wrote its parts into the same maps. Under the replace, a mount
    that started during a preview's GLB await dropped them; now they stay.
  - `manifest` itself still changes before the await, as it did before.
- **Checks.**
  - **A new e2e case holds every part GLB back, so the window stays open.** It commits a one-unit layout with a back
    cover and checks that the window is open: the mount waiting, an old instance whose node the new build lacks, and
    the Parts switch paging. Then it repaints the palette, clicks Parts, and checks that rows draw and nothing throws.
    Finally it lets the GLBs go and checks that the new build mounts.
  - **It fails on both earlier versions.** On origin/main `0b896b0`: "the Parts list drew no rows: … reading 'split' @
    main.js:7133" (colorLocked). On the swap-after-the-await attempt: "a palette repaint in the window" (activeHex, from
    renderChecklist).
  - **The replay of the back-cover case** (D:/Claude - Output/cover-seams-2026-10-21/harness/debug-backcover.mjs), 6
    runs: the row shown every time, no page errors. It also passed 6 of 6 on unmodified `0b896b0` on this machine,
    because the window depends on GLB timing. That is why the held-GLB case is the check that fails on the old code.
  - **On the tree rebased onto main `b11f493`** (the cover edges and the drawer pills): the replay 6 of 6 again; npm
    test 596 tests, 591 pass, 0 fail, 5 skipped; smoke test 4 of 4; e2e 74 of 74, the back-cover case and the new case
    included. The same checks had passed on `93c8e7e` before it.
- **Review:** Terra `01a15fa2` on the code: no findings. Terra `01a15fae` on this entry and the vault's note of the sweep:
  five wording fixes taken (who did not report it, the flake's cause as measured, the sweep as a sweep and not a
  proof, and its refused builds, here and in the vault).
- **Deploy:** a bug fix, found rather than reported. It deploys once its checks pass.
- **Live:** `1272bce5`, 2026-10-21, about 19:30 UTC. The live main.js carries the two `Object.assign` lines. The held-GLB
  scenario, run against production (D:/Claude - Output/stage-type-race-2026-10-21/live-check.mjs), held 7 GLBs with
  29 old instances on the stage. The repaint returned ok, the Parts rows drew inside the window, the new build then
  mounted with its Back Cover row, and there were no page errors.
- **The case's hold, corrected the same day.** As first written, the case let its held GLBs go with `page.unroute`,
  then `route.fallback()` on each. Playwright 1.63 already hands a removed handler's held requests to the next handler,
  so each was handled twice. With `GEN2_PARTS_LOCAL=1`, the second pass reached the `fulfill` in
  `test/lib/local-parts.mjs` and rejected "Route is already handled!" after the case ended, which failed the e2e file.
  Without it, as on CI, the second pass ended in a continue whose error Playwright swallows. The session counting the
  planner's buy clicks reported it. Now the handler waits on a gate and falls back itself, and the case never unroutes.
  - **Checks.** The case alone, in both modes: it passes, and the file passes with it. With the old replace put back
    in main.js, it still fails in both modes ("the Parts list drew no rows", colorLocked). Full e2e on main `b0bb34d`
    with this change: with `GEN2_PARTS_LOCAL=1`, 74 of 74 and no rejection notices; against the parts host, 73 of 74.
    The one failure was "a refused cell says why", which timed out at its re-hover chip wait (e2e line 1283) after
    16.6 s. It is not this change's. On main `55a02fb` without this change, the full run failed the same case the same
    way (73 of 74, 16.6 s), and so did the full run of this change rebased onto it. Run alone it is flaky: 4 of 4
    passed on one tree, 1 of 2 on the other. The case passed in both full runs on `b11f493`. It is recorded here and
    left for its own fix. Fixed the same day: "the refused-cell case reads its marker once the stage is at rest", below.
  - **Review:** Terra `01a16024`: no findings.

## 2026-10-21 (faceplate, not plate, in two catalogue strings)

- **The naming rule** (vault naming-and-ids.md, Joey, 2026-10-12): a faceplate is always called a faceplate; plate alone
  means the build plate. A site session asked for two catalogue strings that broke it: the Classic series blurb
  ("the grip prints as part of the faceplate") and the M3 button-head note ("driven in from behind the faceplate").
- **Changed** in the old planner's js/data.js (gen2-planner-main `92c055d`, live there, and re-vendored by the site as
  MODULITH `ff09192`) and copied byte-identical into js/catalog/data.js here, with the vendor pin bumped. Nothing else in
  either string changed. Luna `01a15fbf`: no findings.
- **Not done:** js/generate.js still says "plate" for the faceplate in two user-facing step notes, the handle step and the
  Classic step, which also appear in the kit and golden manifests. They are for Joey to schedule as their own change.
  Done the same day: the next entry.
- **Review of these lines:** Luna `01a15fc9`: two wording fixes taken, four discarded (dim-w is the W pill; the diff shows
  nothing else changed; "no findings" and the Deploy wording are this file's own).
- **Deploy:** a change Joey decided in words; it deploys once its checks pass.
- **Live 2026-10-21**, first at stamp `39e6a12f` (run 39662428999; the two runs before it that carried `2492ebb` were
  cancelled by newer pushes). Checked 2026-10-22 on the live `04bf17ff`: the served `js/catalog/data.js` reads "part of
  the faceplate" and "behind the faceplate" once each. The one "part of the plate" left in it is a code comment
  (data.js:121), never shown.

## 2026-10-21 (faceplate, not plate, in the two Assemble step notes)

- **The same rule** as the entry above. The two step notes it left in js/generate.js now say faceplate: the handle step
  ("thread 2× M3×6 button head screws in from behind the faceplate") and the Classic step ("its grip is part of the
  faceplate"). Nothing else in either note changed.
- **Manifests:** the ten official-kit goldens re-blessed with
  `UPDATE_GOLDEN=1 node --test test/official-builds.test.mjs`, one line each (the Classic note; none of the ten has a
  handle step). The three tabletop static kits (kits/tabletop-165, -185, -185-3w) have no generator: pages.yml only
  copies kits/, and 01c2125 copied the handle note into them by hand. So the same one-word change was made there by
  hand. A script over the diff checked all 15 changed lines in 14 files: each is its old line with one "the plate" made
  "the faceplate".
- **Left as they are:** the code comments that say plate (generate.js, main.js, catalog/data.js), which are not
  user-facing.
- **The old apps, reported, not changed:** the old viewer (gen2-visual-animator, viewer/js/generate.js:2403 and :2415 on
  origin/main) carries both notes word for word, with its kits and goldens. The old planner (gen2-planner-main) has no
  Assemble steps, but its back-cover option hint (js/app.js:783) says "Closes the open-front Decor drawer behind the
  plate". The merged planner's back-cover note already says "behind the faceplate".
- **Tests:** npm test 591 pass, 0 fail, 5 skipped. The full e2e with `GEN2_PARTS_LOCAL=1`: all 74 cases pass, but the
  file itself is marked failed (75 counted, 74 pass), with seven "route.fulfill: Route is already handled!" rejections
  reported after the cases end. The only route.fulfill the e2e runs is the local-parts route's
  (test/lib/local-parts.mjs:31). The base commit fd3e5d6 without this change ends the same way (74 of 75, the same seven
  rejections), so this was there before this change. CI runs the e2e against the live host, without that route, and run
  that way here the e2e passes 74 of 74 with no rejections. The commit was then rebased onto main `39e6a12`, which
  differs from fd3e5d6 only in this file; official-builds and parts-exist pass again there (20 of 20). The rejections
  have since been fixed by `b9be960`: the mount-window case's `page.unroute` already passed each held GLB on, so its
  own fallback handled it twice.
- **Review:** Luna `01a15fe7`: no findings. Nothing outside the planner reads this text: the site's only match for
  either phrase is a vendored code comment, and the old viewer has the same text in its own generate.js, not read from
  here. Luna `01a15ff4` on this entry: two wording fixes taken (the e2e file's failure stated without a cause, the old
  viewer's copy said plainly), one discarded (the "..." it read as a change was an elision in the evidence).
- **Live 2026-10-21**, stamp `55a02fb9` (run 39670501878). This commit's own run (39669304242) was cancelled by the push
  of `55a02fb`, whose deploy carries it. Read off the live site: the page loads `boot.js?v=55a02fb9`; the stamped
  generate.js has both new phrases and neither old one; each of the three tabletop kits serves "from behind the
  faceplate" and not "from behind the plate". In the browser (?debug=1, analytics skipped), the official build
  185-tabletop-2w2h's Faceplates step says "its grip is part of the faceplate", and the live generateManifest on a copy
  of that build with Essential faceplates gives the "Faceplates & handles" step with "from behind the faceplate". No
  console errors were captured on that tab. Luna `01a16054` on these lines: two wording fixes taken, one discarded (the
  carrying run's head is 55a02fb, which contains this commit).

## 2026-10-21 (the Parts list's Amazon links are marked paid at the link)

- **Joey, asked:** "Yes: give the Parts list's Amazon hardware links rel="noopener sponsored" and the "· paid link"
  label, like the Colors links."
- **Now** parts.js `storeLink` marks a link on a paid host (`isPaid`, the Colors tab's host list) with
  `rel="noopener sponsored"` and "· paid link", in the narrow list and the wide table. The download-site links are
  unchanged, and the foot line keeps Amazon's own sentence.
- **The mark sits on its own line** under "Amazon ↗" (app.css `.link .paid`; its "·" is hidden and stays in the text).
  On one line, "Amazon ↗ · paid link" took 55 px from the part's name. Measured headless at 1280×800 and 390×844: the
  BUY rows' names went from 213 to 158 px on a desktop and from 171 to 116 px on a phone, and "Magnets 10×2mm or
  6×2mm" and "M3×6mm socket head screw" wrapped. Stacked, the link is 57 px wide, as before, and the names keep 213 and
  171 px. The gaps are 10 px to the badge and 9 px to the row's edge either way.
- **Checks.** The buy-link e2e case reads, in both layouts, the Amazon link's rel, its text "Amazon ↗ · paid link" and
  its mark's block display, and checks that a download link stays plain. With the paid check forced off, it fails at the
  narrow list's Amazon link. npm test 591 pass, 0 fail; all 74 e2e cases pass (the file's own route.fulfill failure
  under `GEN2_PARTS_LOCAL=1` is the one the entry above records as older than its change).
- **Review:** Terra `01a16000`: one finding, discarded (it read this entry's layout measurements as analytics figures).
- **Deploy:** a change Joey decided in words; it deploys once its checks pass.
- **Live 2026-10-21**, stamp `55a02fb9` (run 39670501878). Checked 2026-10-22 on the live `04bf17ff` with
  `paid-links-prod.mjs` (prod-checks folder; fresh profiles, analytics blocked), in the wide table at 1280×800 and the
  narrow list at 390×844: 4 Amazon links, each `rel="noopener sponsored"`, reading "Amazon ↗ · paid link", the mark on
  its own line. Every other sponsored link on the list is on amzn.to or the Polymaker shop; the Printables and
  PrintedSolid links stay plain.

## 2026-10-21 (a hanging build grows down from a "+")

- **Joey, asked:** "oh yeah do this", to "+" spots under a hanging build that grow the grid when taken. On 2026-10-20 a
  2W·2H under a full 4H wall build (Joey's screenshot) got no spot until H+ was pressed, while past either side the
  grid grew by itself.
- **Now** on a wall or under-table build the armed size's "+" spots also reach below the bottom row. Taking one adds
  the rows the unit needs, in the same undo step, and moves nothing else: y counts from the top, so the rows go on at
  the bottom. build.js `tallFor` gives the grid height a footprint needs, or null past the mount's height cap (`capH`,
  from the measured wall or table height when there is one, else 12H); `growTo` takes that height, and addSpots,
  refusedSpots, placeAt and Duplicate use it. A placement past the cap says "The build is already as tall as this mount
  allows (3H)", with the mount's own cap in the brackets. On those builds the 2D board draws room under the grid for
  the spots below (`botR`), and its hint adds "below it adds height". The 3D view needed no change: spotWorld places a
  spot linearly in y.
- **Unchanged on purpose:** a tabletop build (syncTabletopGrid already keeps the armed height free above it); dragging
  or moving a unit below the grid (the board's drag and the 3D move spots stay inside it); H+ and H−.
- **Checks.** A new e2e case on a 3W × 2H wall build, its wall measured 180 mm tall (a 3H cap): the spots under the
  bottom 2W in both views, the same list on the board, inside its drawing; taking one gives 3H with nothing else moved;
  at 3H nothing below, in either view; one Undo gives 2H; a 2W·1H refused one column right, under the grid; a 1W·2H offered only where it fits
  3H; placeAt past the cap says so and places nothing; Duplicate on a 2W-wide wall puts the copy under the unit and
  grows to 2H. Eight mutants each fail it: no spots below, growTo ignoring the height, no cap, no cap message,
  Duplicate not growing, refused cells not growing, no room on the board, the old hint. npm test 591 pass, 0 fail; all
  75 e2e cases pass.
- **Review:** Sol `01a1603f`: no findings. Luna `01a16050` on this entry: four wording fixes taken (the screenshot's
  build, the cap's number in the message, which builds the board change is for, a 180 mm wall as a 3H cap).
- **Deploy:** a change Joey decided in words; it deploys once its checks pass.
- **Live 2026-10-21**, stamp `d1682ec3`: `grow-down-prod.mjs` (the e2e case's build on the live site, analytics blocked)
  passes every check. On `39e6a12f`, before the change, it failed the spots below, the growth, the cap and the Undo.

## 2026-10-21 (the refused-cell case reads its marker once the stage is at rest)

- **The failure.** The e2e case "Build: a refused cell says why" timed out at its click wait (line 1283 then) in full
  runs against the parts host on this machine: 73 of 74 in three runs, on `b0bb34d` with the hold fix and on `55a02fb`
  with and without it (the mount-race entry above). Run alone it mostly passed. The app is not changed; the case was
  wrong.
- **The cause, traced.** `trace.mjs` (in `D:/Claude - Output/refused-cell-flake-2026-10-21/`) replays the case's steps.
  Every frame it logs the camera and the refused cell's screen point, along with every `setSpots`, the chip's `hidden`
  and the canvas's pointer events.
  - The case read the cell's point once, then hovered, left and clicked there.
  - The Build workspace's boot ends in `stage.goTo(steps)`. Its `tweenCamera` flies the camera in from the cover's pose
    for 900 ms (camera z about 1910 to about 640), and `waitBoot` returns as the flight starts.
  - In the seven failing replay runs the case read the point 159-216 ms after the boot wait returned. By the
    pointerdown, 31-52 ms later, the marker had moved 31-44 px (one run: read at 479,331, the marker at 514,337). The
    click landed on no spot, and no chip opened.
- **Why only some runs: the parts host's speed.**
  - With the host slow, the last of the 3W's GLBs arrived 273-417 ms after the boot wait and 7 of 10 replay runs
    failed: the boot's flight was in its fast middle when the case read and clicked.
  - Later the host was quick: the last GLB arrived at 27-109 ms (55 ms or less in 29 of 30 runs). The 3W's mount then
    landed 46-139 ms after the boot wait, and its `goTo` restarted the flight, so the read and the click fell in the
    new tween's slow start. All 20 replay runs with the old read passed, 10 on `b11f493` and 10 on `02a30a4`.
  - The deploy runs of `55a02fb` and `d1682ec` passed the case. That the slower runner reaches the read after the
    flight is inferred; its timing was not traced.
- **Not a commit.** The case's text is the same at every commit tested. Alone, 8 runs each: `b11f493` 8 passed,
  `1272bce` 7, `b0bb34d` 8, `55a02fb` 8, `02a30a4` 7. Both failures timed out on a 15 s chip wait; the bisect did not
  record which line. The two full-run passes on `b11f493` came from the timing, not the code.
- **Now** (e2e/workspaces.mjs) the case reads the marker through `cellAtRest`, before the hover and again before the
  click.
  - It waits for the stage's mount (`regenBusy` false), then until the cell's rounded screen point is the same in two
    reads 300 ms apart, and reads it then.
  - A camera tween eases in and out (cubic) over 900 ms, so in any 300 ms the camera covers at least 14.8% of its
    path. Two equal rounded reads mean the point moved under 1 px per axis in that window. If the point moves in
    proportion to the camera (it is a perspective projection, so only roughly), the whole flight left is under 7 px per
    axis, and about 1 px in the 31-52 ms the replay measured from a read to the click.
  - The case also holds every part GLB it asks for by 600 ms (`page.route`, then `route.fallback()`, never unrouted),
    so a slow host is part of every run.
  - The click wait now fails with a message.
- **Checks.**
  - With the hold and the old read, on main `02a30a4`, the case alone failed 7 of 8. It failed one assertion later, at
    "a clicked reason stays up when the mouse leaves": the 3W's mount landed just after the click, and a rebuild
    closes a reason chip by design (build.js `renderOverlays`).
  - With the fix the case alone passed 8 of 8.
  - The replay with the old read failed 9 of 12 with a 300 or 600 ms hold. With the fixed read and a 600 ms hold it
    passed 6 of 6.
  - npm test: 591 pass, 0 fail, 5 skipped. Full e2e against the parts host: 75 of 75, twice. With
    `GEN2_PARTS_LOCAL=1`: 75 of 75, and no "Route is already handled" line in its output. The case took 3.8-4.1 s in
    those runs.
- **Seen, not fixed: a tap during a guided camera move takes the camera from the guide.**
  - The controls' `end` handler (main.js, `moved > 4` then `setCamOverride(true)`) measures how far the camera moved
    between press and release, and the tween's own motion counts.
  - In the three failing replay runs that logged it, the case's click inside the flight set `camFree` true. The camera
    did not move again when the 3W mounted.
  - Proposed as its own change. Fixed 2026-10-22: "a tap never takes the camera", below.
- **Review:** Terra `01a1608a` on the case: one finding, discarded wrong. It said a sub-pixel tween could pass the poll
  and the click then miss; the easing bound above rules that out. Terra `01a1609a` on this entry: three fixes taken (the
  runner's timing marked as inferred, the bound restated for rounding and the projection, the log line named exactly).
  Two discarded: the 29 of 30 count holds (one run took 109 ms), and the deploy line is Joey's standing rule, not a
  blocker.
- **Deploy:** a test-only fix for a failure the suite reported; it deploys once its checks pass.
- **Live 2026-10-21**, stamp `aa82df2d`: deploy run 39688850430 passed, the case with it.

## 2026-10-22 (a tap never takes the camera)

- **Joey, asked:** "fix the tap-during-a-camera-move takeover here: a tap during a guided tween should not set
  camOverride. Write a check that fails on the current code first."
- **The bug.** The stage hands the camera to the visitor (`camOverride`, read as `camFree`) when the camera moved more
  than 4 units between the controls' `start` and `end`. A guided move (the Build boot's fly-in, a layout change's
  re-frame, the camera button's return) moves the camera by itself, so a plain click inside one set it, on a "+" or
  anywhere on the stage. From then on `tweenCamera` returned early, and the camera stopped following the build until
  the camera button was pressed. Found tracing the refused-cell case (the entry above).
- **Now** main.js follows each press on the stage: where its pointers went down, and the furthest any of them travels.
  - A press whose pointers all stayed within `TAP_PX` (6 px) is a tap, and never sets `camOverride`. 6 px is the
    threshold the canvas pointerup already used to tell a tap from an orbit's release; that line now reads the same
    constant.
  - A drag or a pinch travels further, and a wheel has no press (a wheel also clears any press record), so they still
    take the camera, mid-flight or not.
  - Down and move are caught in the window's capture phase, before the controls. A released pointer is dropped in the
    window's bubble phase, after the controls' document listener has sent `end`.
- **Checks.**
  - A new e2e case, "Build: a tap while the guided camera is moving leaves the camera to the guide; a drag or a wheel
    takes it". It zooms out with the wheel (which takes the camera), slows the camera button's flight back to 2.25 s
    (slow motion), and presses for 600 ms at an empty point once the camera has moved 20 units. It asserts the camera
    moved more than 4 units during the press, then that `camFree` stays false and that a later layout change (two 3W)
    re-frames the camera. Then a tap at rest takes nothing, a wheel after it takes the camera, and a drag inside a
    second flight takes it.
  - On the old main.js the case fails at "a tap during a guided move leaves the camera to the guide". With that
    assertion removed, it fails at "a layout change after the tap re-framed the camera (it moved 0.0)".
  - Two mutants each fail it: every press counted as a tap ("a drag during a guided move did not take the camera"),
    and no release or wheel reset ("a wheel after a tap did not take the camera").
  - The case as first pushed (`6f1142a`) moved the camera off its pose with an orbit drag, and failed deploy run
    39790130544 at "the camera did not come to rest after the drag within 30 s". The drag's damped coast decays per
    update, not per second, so on the SwiftShader runner it ran past 30 s; the deploy stopped and the site stayed on
    `aa82df2d`.
    With `E2E_SOFT=1 E2E_THROTTLE=4` that version failed the same way here. The wheel's zoom is not damped, so the
    case now uses it, and its one drag comes last with no wait after it. A moving camera is drawn there about every
    300 ms, so the case also holds its press 600 ms (it was 250) and takes the camera as at rest after three equal
    reads 300 ms apart (it was two). Soft at a 4x throttle it passed 2 of 2 (32-34 s), at 6x 1 of 1 (33 s), and 3 of 3
    without (10-11 s).
  - Before it was first pushed, the case pressed right after the camera button and once failed its own precondition on
    the fix (3.9 units): the eased flight's first 250 ms move the camera about 0.5% of the way. The press now waits
    for the camera to leave.
  - npm test: 591 pass, 0 fail, 5 skipped. Smoke: 4 of 4. Full e2e against the parts host with the case as first
    pushed: 76 of 76; with `GEN2_PARTS_LOCAL=1`: 75 of 76. With the wheel version of the case (before the 600 ms press
    and the three reads), against the host: 75 of 76. With the case as committed, against the host: 76 of 76 (the case
    9.2 s). Both failures were the Label plate's faceplate-switch case, a click timeout on a hidden "Screw and nut
    drawings" Off button: the older flake recorded in the idle-gate entry's Live line (2026-10-21). It needs the
    Label Studio checkout, so the deploy runner skips it, and it never presses the stage. Alone with local parts it
    failed 2 of 3 on the fix and 1 of 4 on the old main.js; against the host it passed 3 of 3. Proposed as its own
    task.
  - On the live site before the deploy (stamp `aa82df2d`), `live-tap.mjs` replays the case's tap (in
    `D:/Claude - Output/refused-cell-flake-2026-10-21/`): the camera moved about 67 units under a 250 ms tap, and the
    tap took the camera, 2 of 2.
- **Review:** Terra `01a163c9` on the code and the case: no findings. Terra `01a163dd` on this entry: one finding,
  discarded wrong (it asked for the Live line before the deploy it records). Terra `01a16421` on the case's rework for
  the runner and its text here: no findings.
- **Deploy:** a bug fix Joey asked for in words; it deploys once its checks pass.
- **Live 2026-10-22**, first at stamp `c5eab6e5` (run 39802082505; the run for `6f1142a` alone failed). On the live
  `04bf17ff`, `live-tap.mjs` passes 2 of 2: the camera moved 67 and 64.8 units under the tap, and the tap did not take it
  (on `aa82df2d` it took it 2 of 2).

## 2026-10-22 (the Studio's "Add to planner build" lands on a fresh page)

- **Joey, asked:** "Fix the labels-add bug: the Label Studio's "Add to planner build" link should add its labels when it
  opens the planner as a fresh page."
- **What was wrong.** The Studio opens the planner as a new page on `?ws=labels#labels-add=<list>`, sometimes after the
  build's own `#build=`. Nothing was added. The store writes each settled change to the address as `#build=` alone
  (app.js `onSave`). A save came while the Labels workspace was still loading its label tools, so when it called
  `importFromHash()` the `labels-add=` part was gone. A link set on a page already open imported, and that was the only
  path the suite tested. The cutover prep's parity check found it (row E6), and it was reproduced on the live `aa82df2d`:
  0 labels after a fresh load, 2 after the same hash set on the open page.
- **Now** the link is read once, at the top of the boot.
  - app.js takes the `labels-add=` part out of the address and holds it in `ctx.memo.labelsAdd`. The boot opens Labels
    for it, as for any labels link.
  - Once its label tools have loaded, the Labels workspace imports it (`importOpened`) and clears the memo.
  - If the build came back without labels this browser kept for it, and the link is sound and brings labels, the kept
    labels come back first (`restoreCopy`, the same as the offer's Restore) and the link's are added to them. One
    status line reports both: "Brought back the N labels this browser kept for this build." followed by the import's own
    line. The old planner's cutover redirect sends exactly that: its own slot as `#build=` beside the Studio's link.
  - The stored copy is kept, marked as restored (`ctx.labelCopy.restored()`, label-copies.js `markRestored`), not
    spent like the offer's `done()`. The tab that opened the Studio may still hold the build without labels, and its
    next save would otherwise leave the labels nowhere; kept, they are offered again on the next load. Marked, the copy
    is never restored automatically again; the banner still offers it on an empty board. Past the cap of five copies
    it is ranked by its age like any other, as on main.
  - A link that would add nothing restores nothing, and the offer stays. That covers a damaged link, an empty one, and
    one whose labels cannot be read: the import is first run as a dry run (`importLabels`).
  - A link set on a page already open still goes through `importFromHash()`, as before.
- **How it got here: seven versions, each checked by skeptic workflows.** Each round had three lenses or two, with every
  claimed break checked by a separate agent trying to refute it.
  1. The first version kept an unread `labels-add=` part in the address through every save. Terra (`01a163c1`) found
     nothing. Round 1 then confirmed a leak. A visitor who left Labels before its tools loaded kept the link through
     every save, Share link and reload, so recipients got the labels added and reloads jumped to Labels.
  2. The second version held the link in the page instead. Round 2 (7 claims, 4 distinct confirmed, 2 refuted) found
     that on a build that came back without its kept labels, the link's labels filled the board before the kept-labels
     offer rendered. The offer never showed, and the kept copy was dropped unoffered once those labels were removed.
  3. The third version made the link wait for the visitor's choice in that offer. Round 3 (9 claims, 8 confirmed) found
     the wait raised more than it solved:
     - Not now imported straight away and lost the kept labels;
     - on a phone the wait was invisible;
     - a label added another way stranded the link;
     - a reload lost it;
     - two status lines overwrote each other.
  4. The fourth version restored the kept labels and then added the link, with no waiting state. Round 4 (8 claims, 5
     confirmed, 3 refuted) found two things to fix. The restore used up the stored copy, so the tab that opened the
     Studio, saving over the build without labels, left them nowhere, where main kept the copy and offered it again. A
     damaged link still triggered the restore. Of the other three, two were accepted: a copy put off with Not now is
     restored without asking by the next Studio link (the status line says so), and a set the Studio sends again
     duplicates (appendLabels never merged by words). The third is main's own rule: Undo that empties the board drops
     the copy.
  5. The fifth version restored only for a sound link and kept the stored copy unmarked. Round 5 (5 claims, all
     confirmed) found that the kept copy now outlived its use. After the visitor removed some of the restored labels, it
     came back with the next Studio link without asking (the one medium). The rest were low: it came back after the
     build was deleted.
     It took the five copy slots from other builds' unoffered copies. A link whose labels could not be read still
     restored it. The fifth was the Undo rule again.
  6. The sixth version marked the copy instead (restored once, never automatically again, evicted first) and ran the
     import as a dry run before restoring. Round 6 (2 claims, both confirmed, both low) found the marked-first eviction
     wrong. A marked copy can be the only place its labels are, once the other tab has saved over the build, and
     evicting it first kept older copies, even expired ones that can never be offered.
  7. This version keeps the mark and the dry run and goes back to main's eviction, oldest first. A copy can only expire
     by being older than every live one, so oldest first already takes the expired copies.
- **Found and left as it was:**
  - **Not new with this change, recorded as follow-ups:**
    - The Studio opens the planner in a second tab, and the tab that opened the Studio still holds the build without
      the labels. Its next save is the newest, so the Recent entry and the autosave slot lose them. Nothing in the
      planner listens for another tab's writes. Before this fix the labels never arrived at all. Now that they do, a
      visitor who goes back to the tab they came from and edits loses them, so the stale-tab guard this needs is the
      first follow-up.
    - A link set by a hash change on a page already open is still wiped by a save. That happens while the label
      tools are loading, or while another workspace is open.
    - If the label tools fail to load, the link is dropped.
  - **New with this change, and accepted:** a reload in the moment before the label tools load drops the link. It
    leaves the address at boot, and the memo does not outlive the page. On main a link stayed in the address until
    the first save, so some older records still imported after such a reload. The visitor presses Add to planner
    build again.
- **Checks.** A new e2e case:
  - A fresh page on a bare link lands both labels, and the address then holds the build without the link.
  - Two tabs, the old planner's way. Tab A shows the build sent back without its labels and saves it. Tab B opens on a
    bare Studio link: the kept two come back, then the link's label is added, the status says both, no offer is left,
    and the stored copy is kept, marked. Tab A then saves over the build, and a new page offers the kept two again. A
    damaged link on that page restores nothing and leaves the offer, and so does a link whose labels cannot be read. The
    next Studio link adds only its own label: no second automatic restore, and the copy is still kept.
  - A link beside a `#build=` adds its label to that build's two, with the units unchanged.
  - With the label tools held back, leaving for Build and making an edit writes the build alone. Coming back to Labels
    lands the label. Opening Labels again, or reloading, does not add it twice.
  - A link on `?ws=build`, the form the old planner's cutover redirect sends, opens on Labels and lands.

  On the unfixed code the case fails at "a bare link: the labels did not land within 30 s". A unit test in
  test/label-copies.test.mjs: `markRestored` marks only the copy that was read, and a marked copy stays held; past the
  cap the oldest go first and a newer marked copy stays (round 6's rule, marked first, fails it); a copy remembered
  again is a new, unmarked one.

  All fourteen mutants are killed: 12 by the e2e case, 2 by the unit test. The first time, two survived: the
  damaged-link and unreadable-link checks ran after the copy was already marked, and the mark alone blocked the restore.
  They now run before tab B. npm test 597: 592 pass, 5 skipped, 0 fail. The full e2e suite passed 76 of 76 on version 6.
  The 9 labels-related cases passed again on version 7, whose one change is the eviction order; no e2e case reaches the
  five-copy cap.
- **Review:** Terra `01a163c1` on version 1: no findings. Sol `01a163ed` on version 2 and `01a16405` on version 3: no
  findings; the skeptic rounds above found what they did not. Sol `01a16415` on version 4, `01a1643e` on version 6 and
  `01a16459` on version 7's eviction change: no findings. Luna `01a16460` on this entry: five wording fixes taken, one
  discarded (it was the full e2e suite).
- **Deploy:** a bug the cutover prep found, fixed on Joey's words; it deploys once its checks pass.
- **The first deploy failed on its own test** (run 39813124698, `40d4b25`). On the CI runner the case stopped at "the kept
  labels were not offered again after tab A saved over the build": it gave each save a fixed 1.5 s, and the next page
  opened the build as it was before the save landed. Tab B's restore had passed, so tab A's first save was in time;
  the second one, or tab B's own, was not. The case now waits for each save to reach the planner's slot (written after
  the Recent entry), and for the label tools beside the unreadable link, before it goes on. Slowing the CPU here (4x,
  8x) does not reproduce the runner's failure: the old case passes at 8x too, so the runner's slowness is elsewhere.
- **The second deploy failed one step later** (run 39824340436, `4eaeb53`): "a second link: the labels did not land
  within 30 s". The waits had fixed the step before. Tabs A and B stayed open to the end: an open tab can save again
  later and change what the next page opens, and four 3D pages at once slow the runner's software rendering. Each
  page now closes once its part is done, and the failure message prints the labels on the board. Terra `01a164af` and
  `01a164f3` on the two test changes: no findings.
- **Live 2026-10-22**, stamp `e7bd056d`: `labels-add-prod.mjs` (fresh profiles, analytics blocked) passes every check: a
  bare link lands both labels and the address keeps the build without it, a link beside `#build=` adds its label to the
  build's two, and the plain page shows it. On `aa82df2d` it failed those three. The parity probe now finds 2 labels on
  a fresh load (0 before).

## 2026-10-22 (a tab behind another tab's save stops saving: the stale-tab guard)

- **Joey, asked:** "Build the stale-tab guard: a planner tab whose build was saved newer by another tab must not overwrite
  it; show a notice with Reload instead. Test it with the Studio's two-tab flow, then review and deploy."
- **What was wrong.** Make labels opens the Label Studio in a new tab. Its Add to planner build opens the planner again,
  in another new tab, on this browser's current build. That tab (B) lands the labels and saves while the first tab (A)
  is still open on the build without them. A's next edit then saved its older build over the labels. A production check
  (`stale-tab-prod.mjs` in the prod-checks folder) reproduces it on the live `04bf17ff`: after A's edit the stored build
  has 0 labels.
- **Now** every write names the stored version it is based on.
  - The version is the entry's `savedAt`. A new one is always above the version it is based on, so two saves in one
    clock tick, or a clock set back, never share one (Sol `01a16556`).
  - `builds.js decide()` runs inside the IndexedDB transaction, against the rows `get()` sees (the localStorage list
    wins). It refuses a write when the stored row exists and is another version; a missing row is written as before;
    `force` skips the 20-build cap, never the check.
  - The tab keeps its base per build: in memory, in sessionStorage per tab, and in sessionStorage per history entry
    (under a key the page keeps in `history.state`). A reload of a stale tab is still stale, and so is Back to an older page of the build.
  - Every write (the autosave, Rename) runs on one queue and reads its base when it runs.
  - A refused write makes the tab stale for good. It persists nothing more: not the Recent entry, the current build, the
    slot or the palette. The address still follows its edits. A notice over everything, an alertdialog at body level,
    says "This build was saved in another tab" and offers Reload, which opens the saved version and takes the older page
    out of the history.
  - After a write that changed the version, the store writes `gen2-build-saved`; other tabs on the same build read the
    stored version again on that hint, when they come back into view, and from the back/forward cache. A hint alone never
    makes a tab stale.
  - A link opened fresh is an explicit open of that version and wins, as before.
- **Opening Labels no longer saves.** Its label-sync commit saved a new version of an untouched build (null label fields
  became absent), which would have made every other tab on the build stale for nothing. It now commits only when
  reconciling changes something. That save was also what made a never-saved build (a kit page, someone's link) this
  browser's current one, which the Studio's Add to planner build reopens; Make labels and the Studio link now do that
  themselves (`ctx.builds.keepCurrent()`).
- **How it got here.** A design-critique workflow listed 51 problems before any code (FINAL.md in the session scratchpad).
  The code then went through a five-lens adversarial review, each claim verified against the source by a separate
  agent: 8 findings confirmed, 6 of them distinct, all fixed.
  1. Keys on the Reload button reached the page under the notice (Build's Ctrl+Z and Delete, Escape closing the Picker).
  2. A lost IndexedDB connection (WebKit, after a tab sat in the background) fell back to a list-only check, so the
     OLDER tab won. The store now opens IndexedDB again once before it settles for the list.
  3. A list write that failed (storage full) reported success, moved the base, then raised a false notice. It now says
     `unsaved`, and the tab keeps its base.
  4. Reload pushed a history entry, and Back then F5 booted the stale page as current. Reload now replaces it, and the
     per-history-entry base covers the other ways back.
  5. With Labels no longer saving on open, a never-saved build sent the Studio's labels to another build (high: the
     reviewers' only one). Fixed by `keepCurrent()`.
  6. A setup-sheet Apply refused in a stale tab closed with "Setup applied." It now just closes.
  Two were found twice: the keys by the UI and side-effects lenses, the lost connection by the store and cross-tab
  lenses.
- **The cloud reviews.** Sol `01a16556` on the fixed code returned 4; 2 taken:
  - a version could be reused (two saves in one clock tick), now base + 1;
  - an IndexedDB that failed to open at boot was never tried again, now tried at each read and write.
  Discarded: the fallback list's read, check and write is not atomic across tabs (it runs only where IndexedDB cannot be
  opened at all, and the window is one synchronous step; the cap had the same exposure, so it is recorded as a known gap,
  not fixed); `keepCurrent()`'s first save racing tab B's boot (tab B opens only when a person presses Add to planner
  build in the Studio, after the one IndexedDB write queued at the click has landed). Terra `01a16560` on those two
  fixes: two first opens at once could let a late failure drop the other's connection; taken, one open is shared.
- **Tests.** e2e/workspaces.mjs:
  - "the stale-tab guard: the Studio's second planner tab…" walks Joey's flow with the real Make labels button and a
    stubbed Studio: a never-saved build becomes current and is saved at Make labels; kit adopts and an Undo back to the
    earlier id are not stale; two saves queued back to back and two with the clock frozen are not stale and get new
    versions; a reload on Labels saves nothing; hints that must not count (the slot changing, a hint naming the tab's own
    version, a hint removed) do not; tab B lands the label; tab A goes stale (the alertdialog, focus on Reload), keys on
    Build do nothing under it, its palette is held, its edits leave the row, the slot and the current build alone, the
    notice stays across a workspace switch and the phone breakpoint, a reload stays stale; Reload opens the saved
    build; a page opened on a link goes stale and its reload stays stale; Back to an older page of the build, and its
    F5, are stale; Reload takes that page out of the history; a write with no hint is caught at the next save.
  - "the stale-tab guard: the build store's version check on IndexedDB…": the rule on real IndexedDB, a row still in
    the fallback list, a lost connection, a failed first open shared by two readers.
  - The labels-add case: tab A now goes stale instead of saving over tab B; a write without the guard (an old planner
    tab open across the deploy) stands in for it, and the kept labels are still offered.
  - The build-store case: Rename in the second tab makes the first stale.
  - test/builds.test.mjs: `decide()`, `savedHint()`, the fallback store's refusal (byte for byte, no hint), `unsaved`,
    the per-tab and per-page bases.
- **Production check:** `stale-tab-prod.mjs` (prod-checks folder; fresh profile, analytics blocked, the Studio stubbed).
  On the live `04bf17ff` it fails as the bug does (no notice; tab A's edit leaves the build with 0 labels); on this
  branch served locally it passes all 12 checks.
- **Mutants**, each in its own worktree, with the node tests and the four guard-related e2e cases (four rounds, as the
  code and the tests moved): 40 of 45 killed on the final code, 9 by the node tests and the rest by the e2e cases.
  - Four survive, as predicted before they ran: `pending` ignored at boot and the setup sheet not waiting for its save (both need a page
    unloaded in the middle of a write); the app ignoring `unsaved` (no case fills the storage); a refused Apply closing
    as usual (no case refuses an Apply). The fifth, a rename that keeps its version, is now equivalent: the base + 1
    rule gives it a new version anyway.
  - The rounds found three tests that could not fail on the defect they named, now fixed: the keys were pressed with nothing to undo (they now
    follow an edit, on Build); the slot-change step came before Make labels, which now writes the slot itself;
    a history-length check cannot tell a push from a replace when the push prunes a forward entry (Back is checked
    instead).
- **Not covered by a test:** the recheck when a tab comes back into view and from the back/forward cache (no case
  hides a page or brings one back from that cache), the keyup guard, and the Reload button re-enabled after the cache.
  They are in the code, and Sol's review read them.
- **Suites on the final code:** npm test 603 (598 pass, 5 skipped, 0 fail); the full e2e suite 79 of 79 in software
  rendering (`E2E_SOFT=1`, the CI runner's mode).
- **Deploy:** Joey's request ends in "review and deploy"; it deploys once the checks pass.
- **Live 2026-10-22**, stamp `e45eac71` (run 39856918773, 58 minutes with the two new cases). On it, with fresh
  profiles and analytics blocked: `stale-tab-prod.mjs` passes all 12 checks (on `04bf17ff` it had failed six, the
  build left with 0 labels), and `studio-live-prod.mjs` walks the flow with the REAL Label Studio: Make labels opens
  it with `return=https://planner.modulith.systems/?ws=labels`; with a label typed there, its Add to planner build
  opens this planner in a new tab, which lands the label and saves; the first tab shows the notice, its edit writes
  nothing, and the stored build keeps the label. Both scripts are in the prod-checks folder.

## 2026-10-22 (the Parts list prints the list)

- **What was wrong.** The Parts list's Print (`window.print()`) printed the screen as it was: the app had no print
  stylesheet. On the live `0f32d12e`, Chrome's print to PDF of `?ws=parts&build=185-tabletop-3w2h` gave one dark page with
  the 3D scene, the top bar and the dock, and the list cut off at its own scroll height: 6 of its 25 rows. The old planner's
  print hid everything but its list (its css/style.css:1826-1836). Found by the hands-on pass checklist's critic
  (2026-10-22), checked live with `parts-print-prod.mjs` (prod-checks folder).
- **Now** `css/app.css` has a print stylesheet, only while Parts is open. On paper the list stands alone, whole and black
  on white (the page's dark colour scheme had painted the margins dark), under a line naming the build and the date
  (`parts.js` `printHead`, refreshed on `beforeprint`). The panel's controls, the phone sheet's handle and the tracking
  counters' buttons stay off the page; the counts stay. A row never splits across two pages. From any other workspace
  the browser's own print keeps printing the screen, as before (a first draft printed a blank page there).
- **Checks.** On the branch served locally, the same print to PDF gives the full 25-row list over three pages with white
  margins. The e2e case "Parts: Print puts the whole list on paper…" checks, under print media: no canvas, bars, dock or
  buttons; the print line; the panel static and not clipped; every row; black on white with a light scheme; tracking
  without its buttons; the same on a 390×844 phone from the bottom sheet; and Build still printing its screen. With the
  print block disabled it fails ("only the list on paper"). The four Parts e2e cases pass, and so do the node tests that
  load `parts.js`.
- **Review:** Terra `01a16671`: no findings.
- **Deploy:** Joey's go, 2026-10-22: "Deploy the Parts Print fix (parts-print c80febf): run the full suite on a quiet
  machine, merge to main, and check it live." On a quiet machine: npm test 603 (598 pass, 5 skipped, 0 fail); the full
  e2e suite in software rendering 80 of 80.
- **Live 2026-10-22**, stamp `c80febfa` (run for `c80febf`). `parts-print-prod.mjs` on it: in print, no canvas, top bar,
  toolbar or dock; the panel lays out whole (2055 px, none of it hidden); Chrome's print to PDF is three pages holding
  all 25 rows. On `0f32d12e` the same check had printed one page with 6 of them.

## 2026-10-22 (Feedback & support in the workspace shell)

- **Asked** (the cutover work, parity gap I1 of the 2026-10-21 check): the old planner offers "Feedback & support" in
  its nav and its phone menu; the new planner had no way in, though the target (inventory §10) keeps it in the app
  chrome.
- **Now** the shared dialog (`js/vendor/modulith-feedback.js`, the old planner's file byte for byte, already loaded for
  the standalone viewer's button) opens from two places in `js/ui/topbar.js`:
  - the top bar: a 44 px icon button (Phosphor `chat-circle-dots`, already in the sprite) between the Day/Night toggle
    and Share, titled and labelled "Feedback & support";
  - the build switcher menu: a last item under a divider, on every layout. On the phone (below 1024 px) the bar hides
    the button, so this is the way in there, as it is for Share.
  - It sends `tool: 'Planner'` and the deploy stamp as the version (the `?v=` on topbar.js's own URL; none locally). It
    offers the link to this build (the address, which Share copies) unticked, and only with units placed. Its events go
    through the stage's `track`: `feedback:open`, `feedback:<kind>`, `feedback:email`, `feedback:copy`, the old planner's
    names.
- **Keys stay in the dialog.** The workspaces read keys on the document: on Build, Delete removes the selected unit, the
  arrows move it and Escape deselects it; Ctrl+Z undoes in every workspace. The stage reads the arrows on the window to
  turn steps. While the dialog is open, a window capture listener stops those keys from propagating. Escape, Tab and
  Enter are the dialog's default actions, so they still work. The listener goes when the dialog closes.
- **Focus comes back** to the button, or from the menu to the build chip (the item is gone with the menu). The opener
  takes focus before the dialog opens, because Safari does not focus a clicked button.
- **The dialog is centred again.** viewer.css's `* { margin: 0 }` reset zeroed the browser's `margin: auto` for a modal
  `<dialog>`, so the dialog opened in the top-left corner, here and on the standalone viewer's own Feedback button.
  `dialog.mfb-dialog { margin: auto; }` restores it.
- **The bar's room**, measured headless in all five workspaces, with the kit and with a worst case (a long build name,
  Under-Table, the printer "Prusa CORE One L"):
  - Before this change the bar already overflowed its inset at 1280 (Share 11 px past it; 33 px in the worst case, 13 px
    of it off the screen) and at 1501 in the worst case (12 px).
  - With the button at the old breakpoints, the worst case put Share 22 px off the screen at 1501 and 3 px at 1600.
  - So the icon-only tier (the printer and Share chips without words) now runs to 1580 instead of 1500, and the build
    name's wide term is 1424 instead of 1370. Above 1580 the worst case keeps the 8 px it had above 1500 before; at
    1440 and 1500 it keeps 12 px. The narrow term stays 1260, so the kit's name is not cut at 1440.
  - From 1280 to 1365 the button is hidden (the bar there was already full); the menu has it.
  - No overflow at 1024, 1279, 1366, 1440, 1500, 1501, 1536, 1580, 1581, 1600 or 1920, in either case. At 1280 the bar is
    as before. On a phone (360, 390, 412) nothing changes: the button is hidden and the gaps stay 8 px.
- **Not changed:** the overflow at 1280-1365 that was already there (a follow-up of its own).
- **Tests.** e2e "Feedback & support: …": on a 1366 desktop the bar's button opens the dialog centred, with a unit selected
  behind it. Delete, Backspace and the arrows change nothing and say nothing. Report a problem shows the planner's
  subject and the build link, unticked. Escape closes the dialog onto the button, with the unit still selected and both
  events logged, and a second Escape then deselects (the hold is gone). At 1280 the button is hidden and the menu's item
  opens the dialog, focus coming back to the build chip. On a 390 phone there is no button, the bar fits with its 8 px
  gaps, and the menu's item opens the dialog centred, closed by Escape and by ✕. GoatCounter is blocked in the case. The
  keyboard case's End now lands on the new last item. test/modulith-feedback-vendor.test.mjs pins the shell's wiring.
- **Mutants**, each run against the case, all killed: no key hold (Delete removed the unit), no focus before opening
  (focus fell to `<body>` on the menu path), the phone not hiding the button, no 1280-1365 rule, a hold that outlives
  the dialog, no menu item, no centring rule.
- **Review:** Terra `01a165dd`: no findings.
- **Suites on the final code, each run alone:** npm test 604 (599 pass, 5 skipped, 0 fail; layout-parity passes in 212
  s, where an earlier run beside the e2e suite timed out at 905 s); the full e2e suite 80 of 80 in software rendering
  (`E2E_SOFT=1`, the CI runner's mode).
- **Deploy:** a new feature, so it waited for Joey's go. Branch `feedback-support`. **Joey's go, 2026-10-23 (in the 10-18
  session):** "Yes: deploy feedback-support (35b89db) and port-side-cover-toggle (8bd564e) together: merge them onto
  today's main, run the full suite on a quiet machine, push once, and check them live." Merged as main `fe0a410`
  (npm test 606: 601 pass, 5 skipped; e2e soft 81/81 here). **Its deploy run 39959731798 FAILED** on this case, step
  "the hold ends with the dialog": the runner's Escape, pressed after `open` read false, was swallowed. The cause and the
  fix are the 2026-10-23 entry below. **Live 2026-10-23 at `545f3ed5`** (with that fix; run 39973401947, 30 min):
  `feedback-prod.mjs 545f3ed` passes on the desktop (the bar's button opens the dialog centred, Escape closes it onto the
  button) and on the phone (no bar button, the build menu's item, ✕ closes it).

## 2026-10-22 (a re-port keeps the side-cover toggle: the edits ahead of the old planner live in the port)

- **Why.** `npm run drift` (2026-10-21) found hand edits in two generated modules: js/rules/bom.js (5 lines added, 11
  removed against a fresh port) and js/rules/schema.js (1 added, 5 removed). tools/port-rules.mjs rewrites both whole,
  so the next port from the old planner would have dropped them, the live Side covers toggle (`a1f085f5`) among them.
- **Four edits, not one.** (1) the toggle's gate in the bill, `if (build.sideCovers !== false)` (2026-10-20); (2) its
  record field, `sideCovers` in BUILD_FIELDS and sanitize's `d.sideCovers !== false` (2026-10-20); (3) side covers on the
  outer sides of each column run, so a gap build bills 4, not 2 (2026-10-16); (4) the back cover row's tear-away sentence
  (v2609, 2026-10-20). None is in the old planner on main, origin/main or cutover-redirect.
- **Where they live now.** tools/port-ahead.mjs: a dated list of exact `[from, to]` edits that port-rules.mjs applies to
  each generated module before it writes or compares it. A planner-only change to bom.js, layout.js or schema.js goes
  there from now on, never into the module by hand. Not taken: moving the toggle out of the ported files (a wrapper
  that filters the bill, a hand-written field list), because it changes the served files, and the per-run rule sits
  inside the side-cover loop, where a wrapper would have to count the covers again.
- **Upstream, Joey's call** (the old planner is not edited from here): (3) is a bug the old planner has too (its gap
  builds under-bill side covers the same way); (2) there would close Sol's documented limit of 2026-10-20 (an old-planner
  re-save turns the covers back on). (1) is planner-only (the old planner has no toggle), and (4) was already his call
  (the 2026-10-20 back cover entry). An entry goes when the old planner carries its change or retires at the cutover.
- **How it fails.** An edit whose text is gone, is found twice, or is already there (the old planner carries it) stops
  the port in write mode, naming the entry, and is DRIFT under `--check` (exit 1). An entry for a module the port does
  not write is refused before anything is written; a module in the port's list that is never written fails the run.
- **Byte-identical.** `npm run drift`: no drift on the three modules. A fresh port (`--out DIR`, new) is identical byte
  for byte to the committed bom.js, schema.js and layout.js and to the copies fetched from planner.modulith.systems
  before the change; an in-place port leaves js/rules unchanged. The modules' headers still list the mechanical edits
  only: a line naming the AHEAD edits would change the served files.
- **Checks.** test/port-ahead.test.mjs (2 tests) ports fresh into a temp directory and runs what it wrote: the field
  in BUILD_FIELDS, sanitize's reading (absent, 0, '', null, 'false' on; false off), serializeBuild carrying it; off
  bills no side covers and changes no other row; the gap build bills 4; the tear-away sentence; and the apply rules
  (gone, already there, found twice, an insert-only edit already there). Mutation-checked, 8 of 8 caught: each entry
  dropped, the field's two edits dropped one at a time, a broken `from`, the per-run rule's second edit dropped. It
  skips without the old planner checkout (CI), like the parity gate.
- **Suites.** npm test 605: 599 pass, 5 skipped, 1 fail, M28's timing gate in test/simplify.test.mjs (Colors code this
  does not touch) while another session's suite shared the machine; alone it passes (median 0.19 ms). e2e with
  `E2E_SOFT=1`: 77 of 79, also beside another session's e2e run; the two failures, the stale-tab guard's Studio case
  (a 15 s wait) and the build store case's "the first tab did not go stale", pass when re-run alone (3 of 3 with the
  guard's other case). No served file changed, so the page under test was main's.
- **Review:** Terra `01a165bb`, routine: 2 findings, both confirmed and fixed (a stray entry was refused only after the
  modules were written; the port's module list was not checked against the modules it wrote).
- **Deploy:** none needed: the served files are byte-identical.

## 2026-10-23 (the Feedback dialog's key hold ends when `open` does, not when the close event lands)

- **The defect.** `close()` on a `<dialog>` clears `open` at once but only queues the `close` event (the HTML spec's
  user-interaction task source), and the hold that keeps keys from the build behind the dialog was removed on that event.
  A key landing between the two moments met the hold: on the deploy runner (SwiftShader, slow) the e2e case's second
  Escape did, and the unit stayed selected (run 39959731798, 2026-10-23 13:16-13:59Z, the e2e step; locally the race was
  never lost: 81/81 before the push). A visitor pressing Escape twice quickly loses the second press the same way.
- **The fix** (`js/ui/topbar.js` feedback()): the hold reads `d.open` on every key and stops propagation only while it is
  true; the removal on `close` stays. A reopen cannot land in the gap: it needs a later user task, and the queued close
  event runs first.
- **The test** (the Feedback case): a probe that forces the race in one task, `d.close()` then a synthetic Escape on the
  document before the queued event can fire, then asserts the unit deselected. With the old line it fails (`1 !== null`);
  with the fix it passes. Build's Escape handler checks no isTrusted, so the synthetic key takes the real path through
  the window-capture hold.
- **Review:** Terra `01a16929`: no findings.
- **Deploy:** finishes the deploy Joey approved above (the fix is to the feature's own test and code, nothing new).
  **Live 2026-10-23 at `545f3ed5`** (run 39973401947 green on attempt 1, pushed 10:52, live 11:22 local; the `fe0a410`
  run it replaced had failed on this case). `feedback-prod.mjs` and `parts-print-prod.mjs` pass on that stamp.

## 2026-10-23 (a listing's ?from= seeds the Parts list's store)

- **The defect.** A visitor from a Thangs listing arrives with `?from=thangs`. The vendored viewer seeds its store preference
  from that address (`js/main.js:5071` `STORE_STORE_KEY = 'gen2-store'`; `storePref`, lines 5095-5101), and the Parts list
  read only its own key (`js/workspaces/parts.js:35` `STORE_KEY = 'gen2-link-store'`; `readStore`, line 187), so the
  visitor got Printables links. CUTOVER.md said `?from=` "seeds the store choice"; it seeded the viewer's, not the list's.
  Found reading the code, not reported; no e2e case arrives with `?from=`.
- **The fix** (`readStore`, now a module-level export, the one function changed). The planner's own choice always wins, a
  hidden store included (it reads as Printables, as before). With none saved, the viewer's `gen2-store` counts, then the
  address's `?from=` (shown stores only, lower-cased, as main.js reads it). That is main.js `storePref`'s own order: a
  saved choice, else the entry, else Printables. The switch above the list still writes `gen2-link-store` only.
  - Why the address is read too, and not only the viewer's key: main.js keeps the `?from=` seed in memory and writes
    `gen2-store` only on a pick (`setStorePref`) or a relay (`applyRemoteStore`); this planner sends no store relay and
    hides the viewer's picker, so on arrival the key is never written, and the fallback to `gen2-store` alone would have
    left a first visit from Thangs on Printables. The shell keeps `?from=` through every `?ws=` rewrite (app.js, the
    workspace switch), so the rider is still in the address when Parts mounts. The referrer half of main.js
    `storeFromEntry` (a bare thangs.com referrer) is not read here.
- **Test:** `test/parts-store-seed.test.mjs`. The viewer's key alone gives Thangs; the planner's key wins over it and over
  the address; a hidden store under either key reads as Printables; with nothing saved the address names the store, else
  Printables; private mode reads Printables; and the id returned is the id a row's `links.stores` carry, so every row
  links to thangs.com / than.gs or to printables.com. Mutants: the original read fails 3 of its 5 cases, the viewer-key
  fallback alone fails 2; the shipped code passes 5.
- **Review:** Terra (routine), thread `01a16945-33a1-7200-8577-1f195aa5aae7`, on the full diff with the main.js store code
  as context: no findings. Walked by hand as well: the holders of this state are the Parts switch (`gen2-link-store`),
  the viewer on a pick or a relay (`gen2-store`) and the address rider, which Share copied before this change too; a pick
  in another tab is read at this tab's next mount, as before.
- **Deploy:** with the cutover (this branch).

## 2026-10-23 (the cutover: the merged planner replaces gen2planner and gen2build)

- **Joey's go** (11:16 local): "All five checks pass. Go ahead with the cutover as soon as everything is staged." The gate
  was his five checks (the buy links, the model download links, his printers in the setup sheet, Very High on his screen,
  one phone pass), not the 89-item pass; his words that morning: "why can't we just migrate the new planner in place of
  the old one, it seems to be working great as is".
- **What merged**, then pushed: this repo's `cutover-front-door` as main `6e19ed1` (merged in the main checkout after its
  branch's suites; live 12:47, `?v=6e19ed12`); and, each staged by an agent in a fresh worktree with its suite and a
  revert rehearsal, the old viewer's `cutover-redirect` as `251656b`
  (live 11:37); the old planner's as `4a33c23` (the kill date; live 11:36); the site's `planner-cutover` as `1a315dc`
  (built about 12:02). CUTOVER.md's "Cutover day" section has the table, the times and the checks.
- **Live checks:** `front-door-prod.mjs` (new) eight of eight by script, its Customize step first confirmed by hand (the
  cover's button calls `window.open` on this host); `redirects-prod.mjs` (new)
  eight of eight; the site's part previews thirteen of thirteen on this host. Both scripts failed as they should on the
  pre-cutover state.
- **Deploy:** each merge's push started that repo's own deploy (the planner's took 73 minutes); nothing else to deploy.
  This entry rides on the records push. Terra `01a169ad`: 5 of 7 findings taken (wording that overstated the order, the
  e2e time and the rehearsals).

## 2026-10-23 (the Done scene, 5b's first slice: the build in the Home office at golden hour, behind `?done=room`)

- **The design** is `D:\Claude - Output\done-scene-2026-10-23\DESIGN.md` (the record quoted, three ways with costs,
  Sol `01a169e0` nine findings all taken, the look checks, what was built). **Joey's choice (this day):** B, the brief's
  real-time lightmapped room, over the plate the design recommended; the look check first; renders on node0; the Home
  office desk first. The first slice is the brief's own Fast fallback and the plan's static hero: one room, one lighting
  state baked into its textures, a fixed hero camera fitted to the build and the free region, props that slide clear
  of the build, the build's shadow on a catcher over the desk (a baked disc on Fast), no bokeh, no camera sequence, no
  time cycle. "Done means End of instructions" (2026-10-13) stands: the room is a backdrop behind the finished step's
  own page; the outro cinema stays retired.
- **Off by default, nothing fetched until Done with the flag.** `js/workspaces/assemble.js` reads `?done=room`, imports
  `js/scenes/done.js` on demand at finish (or a remembered Done), leaves it on Back, Skip, any step or unmount, and
  shows "My colors" while the room is on ("your build in real life"). The room is `scenes/home-office/room.glb`
  (286 KB, 32 meshes with 32 WebP lightmaps, metres, scaled ×1000) and `room.json` (anchors, desk extent, measured sun,
  hero shot, prop slots, exposure), made by `tools/done-scene/room.py` in Blender on node0 (`node0_render.py`, the
  FaderBox pattern on MODULITH's runner; `decode-glb.mjs` first, because Blender cannot read the parts' meshopt
  compression). `js/scenes/done-fit.js` is the arithmetic, pure and node-tested: the fit against the free region's
  size (the stage's view inset does the centring), the prop slide by group, the contact disc's footprint.
- **The stage lends four things through `sceneHold`** (`js/main.js`, `var` like shadowWatch, read by applyStageTheme at
  module evaluation): the background (none: the room is the backdrop), the environment (the room itself, seen from the
  build, PMREM'd at enter; the tier's `env` flag still decides whether one is used), the shadow (on whatever the theme:
  `shadowsWanted`), the mirror (off: `reflectionWanted`, `contactMapWanted`), and the camera (the resize re-fit and the
  safe-area re-fit leave it). `applyQuality` and `stopCinema` take `sceneEnv()`. `holdScene(on, { environment })`,
  `sun`, `hemi`, `fill`, `sceneHeld` and `assembledBox` join the stage interface. The lights are re-aimed from room.json
  and put back on leave; `applyQuality`'s rig reset on a tier change is answered through `onQuality`.
- **The room's materials.** Blender exports an Emission shader as a PBR material with a black base and the bake as its
  EMISSIVE texture (not KHR_materials_unlit); `done.js` takes the emissive map as the picture and the emissive factor
  as its tint. Taking `map` alone painted the room white (the first headless shot).
- **Blender facts, measured.** Nishita's sun direction is (cos el · sin rot, cos el · cos rot, sin el), clockwise from
  +Y; the Cycles source's `geographical_to_direction(el, rot + 90°)` reading had x mirrored. `room.py` finds the disc
  in four 128 px probes and room.json carries that direction, so the live shadow agrees with the baked ones. The
  exposure rule is set on the subject: the 95th percentile of the build's brightest channel at 1.0 (a median rule, on
  the desk or the patch, put sunlit orange at 1.5–3.0 linear, past Neutral's knee, and it read salmon: look1, look2);
  the sun disc at half strength (look3) is what the bake carries. The same Neutral curve as three's is applied in numpy
  for the look renders, so they show what the tone tiers show.
- **A finding on main, fixed here, worth its own cherry-pick: Very High on the light theme never rested.** Every
  accumulated sample ends with `accSetSun(0)`, which puts the sun home and flags the shadow map; after the last sample
  the converged mean is blitted without a scene render, so the flag is never consumed and `idleSettling()` kept the
  gate open: about 120 frames a second at rest, measured headless on main's own code with no room (the dark theme has
  no shadow map, which hid it; the room forces shadows on, which found it). One condition in `idleSettling` ignores the
  pending flag while a converged accumulator is blitting; the flag is honoured by the next plain render. Measured
  after: one keepalive frame a second, room on and off.
- **Measured** (`tools/done-scene/measure.mjs`; the tables are DESIGN.md §9). The room is 23 draw calls and 3.4 k
  triangles a frame on every tier and 299 KB once per page; at rest the idle gate holds at its one keepalive frame a
  second on every tier, room on or off, on this machine's GPU and on SwiftShader. The cost is the entry: one frame of
  180–260 ms on the GPU (the GLB's parse, the environment's PMREM, the shader compiles) and the 900 ms camera move; at
  Very High the entry also restarts the 24-sample accumulation. Fast on SwiftShader: 84 ms more per frame while the
  camera moves, nothing at rest. Numbers from a quiet machine; the rAF sampler is bound by the display's refresh.
- **Tests.** `test/done-fit.test.mjs` (the fit, the shot, the slide, the footprint, by hand); `test/idle-settling.test.mjs`
  (the gate's three branches, lifted from the source; its mutant, the condition reverted, fails the converged case);
  the e2e case "the Done scene is off without its flag; with ?done=room the room comes on at Done, survives a theme flip
  and a tier change, and Back restores the stage" (Fast, dark theme, the suite's pins; the tier change comes BEFORE the
  theme flip so the hold's shadow term is what makes the shadow; the dark stage reads as `night`, so the case asserts
  "not light"). **Mutants, 6 of 6 killed** by that case alone, re-run after that assertion was corrected: the hold
  dropped; the shadow term dropped; Back without leave; the callouts left on; the environment not held through a tier
  change; the flag never read. `test/swap-shadows.test.mjs` lifts `shadowsWanted` into a Function with a fixed name
  list: `sceneHold` joined it.
- **Suites.** `npm test` on the branch, alone: 622 tests, 615 pass, 5 skipped, 2 fail, both `test/shadow-at-rest.test.mjs`
  lifting `shadowsWanted` into the same fixed name list as swap-shadows (`sceneHold is not defined`); that list given
  the name too, the six lifted-source and new files pass 31 of 31. e2e: the Done case alone, three runs, pass; beside
  the unit suite, the idle-gate case, both Assemble cases and the boot case pass with it (the Done case's one failure
  there was my assertion, the dark stage reads `night`, corrected). `npm run goldens`: 60 shots, 0 differ (the stage
  with the flag off draws the same pixels; the gate fix changes when a frame is drawn, never what). Measured, mutated
  and reviewed on this machine's GPU and on SwiftShader; nothing ran on the CI runner yet.
- **Review:** the design, Sol `01a169e0` (substantial, nine findings, all taken, DESIGN.md §10); the code, Terra
  `01a16a22-8d4a-7473-b37d-f6cf74753e54` (routine, two findings, both confirmed and fixed: the accumulator's sun home,
  the room's materials' disposal). Adjudicated in the ledger.
- **Deploy:** none. The flag is off; the room is a prototype on `done-scene` for Joey to open (`?ws=assemble&build=
  185-tabletop-2w2h&done=room` on the branch's checkout, any kit, any build). Joey's direction on the look (DESIGN.md §7)
  comes first; the gate fix is worth cherry-picking to main on its own.

## 2026-10-23 (the Done scene on Joey's desktop: the room re-directed, the camera sequence, the drawer moment)

- **Where it ran.** Joey moved the heavy work to his desktop (RTX 3080 Ti; Blender 4.5.4 LTS portable beside Steam's
  5.2, Node 22, the kit decoded first); a Claude session there took the brief (`tools/done-scene/DESKTOP-BRIEF.md`),
  worked through ten direction rounds (jobs `look5`..`look14`, renders on node0 under `done-scene/renders/`) and
  committed four slices, `ffc81c0`, `ffcb276`, `835e79c`, `c9451d1`, each checked there, none reviewed there (the
  codex-collab skill is not on the desktop). The laptop session took them back at c9451d1: review, suites, this entry.
- **The room as Joey directed it** (`ffc81c0`, bake2): the desk 16 in deep; soft neutral daylight in place of the golden
  hour (ChatGPT's brief relayed by Joey: `--palette neutral --soft-light 500`, the sun high, weak and wide: el 35,
  strength 0.12, disc 2°); the camera az 28, el 20, 45 mm, the build at half the frame; a snake plant (`snake_leaf()`),
  a hollowed mug with coffee (steam as a Cycles volume in look mode only), chamfers on desk, mug and pot; the desk a
  photographed CC0 veneer (Poly Haven `silver_oak_veneer_01` at its documented 1 m, box-projected, grain along the desk,
  60 % contrast, normal map 0.3; `tools/done-scene/textures/`, SOURCE.md records the licence; Astra rejected a procedural
  wave band as corduroy). room.json's live sun is scaled to the palette (near white, 0.62). `room.py` writes LF and
  absolute EXR paths. **Accepted for now:** the props' shadows are baked in place, so a wide build that slides a prop
  leaves its shadow behind (the re-bake with the props out of the desk and wall maps, their shadows from the live sun,
  is the next room job). **The bake textures left the repo** (Joey, that evening: "move the bake textures out of the
  repo to node0's mirror; room.py fetches them from there"): the three veneer JPGs (5.7 MB) are ignored and untracked,
  live on node0 at `~/render-assets/modulith-planner/done-scene/textures/`, and `room.py`'s `texture()` fetches a missing
  one over scp before loading it (checked: the files moved aside, a run with `--desk-wood` fetched them back, checksums
  equal); SOURCE.md stays in the repo as the record. The JPGs remain in the branch's HISTORY (ffc81c0); dropping them
  from history means rewriting the desktop's four commits before the branch merges, Joey's call.
- **The live shadow matched to the baked ones** (`ffcb276`). Two causes, both measured: `done.js` put the sun 3000 mm
  out and the stage's shadow camera has its far plane at 3000 (`fitShadowCamera`), so the desk behind the build fell
  outside the frustum and the cast shadow was a sliver at the feet (`SUN_MM = 1200` now); and Very High's 6° soft-shadow
  cone averaged the shadow to a gradient beside the 2° baked disc (room.json carries `sun.halfDeg = 1`; `done.js`
  applies it through `stage.setSunHalfDeg` and restores 6 on leave). The Done e2e case asserts both.
- **The camera sequence** (`835e79c`, 5b's second slice; the style doc's Superposition reference). `SHOTS.tabletop` in
  `done-fit.js`: the hero (room.json's own shot wins), a straight-on low angle, a detail close-up aimed at a drawer.
  Hold 9 s, drift 3.5 s eased, wrap; a hold is ONE timer and a still camera, so the idle gate rests and Very High
  converges in it (a camera that never stops never settles). A grab pauses it (the orbit is enabled in the room, pan
  off; main.js gained `setCamFree`, so the stage's return button never shows there) and the camera drifts back 6 s
  after the last gesture; a hidden tab pauses the clock; reduced motion and Fast keep the still hero; a slow-drift guard
  ends the sequence when a drift averages under 20 fps (SwiftShader draws one at ~190 ms a frame: Joey's "potato"
  question). `measure.mjs` reports the rest window as a HOLD and one drift separately. New e2e case "the Done scene's
  camera drifts between shots..." (the clock shortened through `window.__GEN2_DONE__`, the debug hook). The pure clock,
  the easing, the guard, the beat and the drawer pick are node-tested.
- **The drawer moment** (`c9451d1`): in the detail hold the unit the shot aims at (a labelled drawer, else any, nearest
  the front-left) slides out 40 % at 0.7 s, holds 3.2 s, and is back before the drift (main.js `unitHasDrawer`,
  `slideUnitDrawer`: no focus, no dims); closed early by a drift, a grab, a hidden tab, a tier change, Back or leave.
- **Desktop numbers** (RTX 3080 Ti): unit files 20/20; npm test 594 pass, 0 fail, 32 skipped (that machine's
  environment skips); Done cases and neighbours 7/7, the Done cases under `E2E_SOFT` too; goldens 60 shots, 0 differ;
  the room 560 KB; in a hold the gate rests at 10 frames per 10 s on every tier, room on or off (Very High converged:
  2 calls a frame); a drift 467–470 frames at 7.5 ms on that GPU, 18–19 frames at ~190 ms on SwiftShader (the guard
  then ends it).
- **Review (laptop):** Sol `01a16b2a-2318-7e73-b10f-9baea685531c`, substantial, the four commits' main.js, done-fit.js
  and done.js: four findings, all confirmed against the code and fixed in the commit after this entry: (1) a grab, then
  a hidden tab before the six-second return fired, stranded the sequence (`driftBack` bailed while hidden and the
  visibility handler never resumed a grabbed camera); (2) a drop to Fast before the entrance timer fired still started
  the sequence; (3) a tab hidden before the sequence started let its clock run hidden; (4) the slow-drift guard judged
  every drift, not the first as its comment said. Terra's routine pass was not run on the desktop; Sol's covers it.
- **Also fixed with them:** the player's caption and its e2e assertion still said "golden hour" under the neutral light
  (now "Your build on a desk. Grab the view to look around..."); `slideProps` had no clamp, so a build wider than the
  desk's free run slid the monitor group off the desk's edge (`fitSlides` in `done-fit.js`: a group that cannot clear the
  build inside the desk's extent hides instead, with its test); and the slow-drift guard's rule: the desktop judged the
  MEAN interval and declined to judge fewer than four intervals, so the slowest device of all, SwiftShader on this
  laptop's CPU drawing a two-second drift as three frames, was never caught (the desktop's faster CPU drew eighteen);
  the verdict is now the frame COUNT against a 20 fps drift of the drift's length, which catches both and leaves a
  smooth machine alone. The sequence e2e case gained the grab-then-hidden step (the return shortened through the hook)
  and lost its fixed waits around the drawer beat and the guard (polled instead: SwiftShader's pace varies with load).
- **Suites (laptop).** On c9451d1 as received: npm test 626 tests, 620 pass, 5 skipped, 1 fail, M28, the Colors timing
  gate in `test/simplify.test.mjs`, which passes alone (median 0.09 ms) and this work does not touch; e2e 7 of 7 (the
  boot, analytics, idle-gate, both Assemble and both Done cases); goldens 60 shots, 0 differ; `measure.mjs` on this
  GPU: the room 560 KB, +35 draw calls a frame (101 against 67 at High), the gate at 10 frames per 10 s in a hold on every
  tier, room on or off, a drift 420 frames at 8.3 ms, the entry's worst frame 75–158 ms (Very High 1.5 s, the
  accumulation). After the fixes: `done-fit` and `idle-settling` 11 of 11 then 9 of 9 with the guard's new cases; the
  two Done e2e cases on the GPU, five runs, pass; the sequence case under `E2E_SOFT`, pass, after the three timing
  changes above (its SwiftShader runs here took 47–105 s as the laptop's load varied). main.js is unchanged by the
  fixes, so the quiet run's suite and goldens stand.

## 2026-10-23 (the room as a stage in Colors: the Studio / Room toggle, behind `?done=room`)

- **What Joey asked.** After the Done scene's first slices he asked what the scene is for and where it would be better
  used ("maybe alongside the color tab in some way while selecting colors?"), then: "prototype the room as a Studio /
  Room stage toggle in the Colors workspace on done-scene, still hero, orbit allowed, no sequence." The style brief had
  it as a later step ("offer the same rooms as a stage option in Colors, for judging colors in context").
- **What it is.** Behind the same flag, the Colors panel's head gets a Studio / Room segmented toggle (`colors.js`).
  Room enters the Done scene's room with the new `sequence: false` (`done.js`): the still hero, the orbit free, no drifts
  and no drawer moment on any tier; picks land as before; the toolbar's camera button (`toolbar.js` takes a `reset`)
  returns to the room's shot through the new `recenter()` and gives the camera back (the stage's own Reset view would
  fly to the step preset, out of the room), and does nothing while the room loads; Studio leaves the room; the choice
  is remembered on `ctx.memo.colorsRoom` across a remount (a trip to Parts and back); unmount leaves the room. The
  studio stays the colour-accurate reference, as the toggle's title says. `refit()` now leaves a camera the visitor
  holds where it is when there is no sequence to take it back. `pages.yml` stamps `done.js` in colors.js too.
- **Review** (Terra, routine, thread 01a16b56): two findings, both confirmed and fixed: Reset view during the room's
  load fell through to the stage preset; a failed module import cleared the panel's state but not the memo, so a
  remount retried it. None discarded.
- **Checks (laptop).** e2e: the toggle case (absent without the flag; Room holds the stage with a free orbit; no
  sequence wanted on Balanced either, the camera on the hero past the entrance delay; a preset recolours; a grab then
  Reset view returns to the shot within 2 mm; the choice survives Parts and back; Studio restores the stage) and the
  failed-load case (the module request aborted: Studio comes back, the memo is cleared, a remount does not retry).
  Five mutants killed: the sequence on in Colors, Reset view falling through, the room not left on unmount, the toggle
  without the flag, a failed load keeping the memo. The first of them SURVIVED the case as first written: the e2e runs
  on Fast, where the sequence is off anyway, and the slow-drift guard also leaves `seq.on` false, so neither told a
  stage from a stopped sequence; the case now switches to Balanced inside the room and reads the debug hook's new
  `sequence.wanted`. npm test 627 tests, 622 pass, 0 fail, 5 skipped (the Colors timing gate passed this run); goldens
  60 shots, 0 differ. Not deployed.
- **Open (Joey's question, 2026-10-23).** A cut-based sequence for weak devices: hold 9 s, cut, hold, in place of the
  still hero that Fast and the slow-drift verdict give today. The room's look is baked, so a cut costs one frame; it
  would be the SEQUENCE timing with `moveMs` 0 and the drawer moment off. Not built; `done-fit.js`'s comment ("the
  still hero is better than a slideshow") was a judgment, not a measurement, and Joey has not seen the cut version.

## 2026-10-23 (the Done scene: cuts for weak devices, and the build's shadow on the wall)

- **Cuts (Joey's call).** On the question in the previous entry he said: "Yes: build the cut-based sequence on done-scene.
  Hold, cut, hold on Fast and on the slow-drift verdict, drawer moment off, reduced motion keeps the still hero." Until
  now Fast kept the fixed hero and a device whose first drift was drawn under 20 fps STOPPED the sequence on the shot it
  reached (a judgment written as "the still hero is better than a slideshow", never measured or shown to Joey). Now
  `done-fit.js` has `sequenceMode({ tier, reduced, sequence, slow })` → `drift | cut | off`: cuts on Fast and after the
  verdict; off under reduced motion and for the room as a stage (Colors' `sequence: false`), whatever the tier. In
  `done.js` a cut skips the move phase: at the hold's end the camera is set on the next shot, one frame is asked for, the
  clock is re-based so that shot's hold begins now, the hold timer is set; `movingTo` never leaves -1, no frames are
  drawn moving, and the idle gate rests between cuts (the room's look is baked, so a cut is one frame). No drawer moment
  while cutting (it animates). The verdict turns the sequence to cuts from the shot the drift reached instead of ending
  it. A grab's return after 6 s of stillness is a cut too. The entrance move (900 ms) is unchanged on every tier. The
  debug hook reports `mode` and the shots' positions (`cams`).
- **The wall shadow (Joey, in the same hour):** "the modulith build is only casting a shadow on the table but not the wall
  like the pre-baked shadows." The live shadow had one ShadowMaterial catcher, the desk top. A second one stands 0.3 mm
  in front of the wall surface (the GLB's `anchor_wall`, else room.json's wall anchor against the tabletop one: 44 mm
  behind the build's back), the desk run plus 1.2 m wide and 1.6 m tall, shown and hidden with the tier's shadow like the
  desk one, disposed with it on leave. Checked at High (headless): the shadow continues from the desk up the wall in the
  props' baked direction. Inside the shadow frustum by construction (the receivers lie on the caster's own light rays;
  far 3000 mm, the sun 1200 mm out).
- **Review** (Terra, routine, thread 01a16b6b): one finding, confirmed and fixed: a drop to Fast during the detail hold
  left the drawer's timers running, so the drawer animated in cut mode; `onQuality` now cancels the drawer when the tier
  turns to cuts. None discarded.
- **Checks (laptop).** Unit: `sequenceMode`'s table (done-fit 10 of 10). e2e, the sequence case: Fast runs as cuts (on,
  mode `cut`; still through the hold, then exactly on the next shot, `movingTo` -1; a 6 s detail hold with the drawer
  closed, a hold long enough for the beat so "closed" means off); the Fast-drop step (the drawer closed at once, the
  unit slid back, the sequence on); the device's own verdict (the sequence on either way, cuts when slow); and the
  verdict FORCED through `maxFrameMs: 0.001`, so the turn to cuts is checked on a GPU too (a cut follows, never
  "moving"). The first Done case counts two catchers, hidden on Fast, shown on Balanced. Seven mutants killed: cutting
  never true; Fast gets no sequence; the verdict still ends it (it SURVIVED on the device's own verdict, since this
  laptop's SwiftShader drew the 2 s drift fast enough this time; the forced-verdict step kills it); the drawer runs
  while cutting (it survived too until the hold was long enough for the beat: a 3 s hold had no room for the drawer, so
  "closed" proved nothing); the wall catcher ignores the tier; no wall catcher; the Fast drop leaves the timers. npm test
  628 tests, 623 pass, 0 fail, 5 skipped; goldens 60 shots, 0 differ; the Colors cases 2 of 2 with the cuts code. Not
  deployed.

## 2026-10-23 (the Done scene's room pass: calipers, the notebook back on the desk, the leaves in the plant group)

- **Joey's asks**, after the massive-build probe (DESIGN.md §8e): "maybe lets add a pair of digital calipers, every 3d
  printer person has a pair on their desk"; "what's this floating thing?" (the notebook and pen, authored at mx + 0.50 =
  1.05 m on a 1.80 m desk, hanging in the air past its right end, the pen a vertical cylinder half inside the desk);
  and the plant's leaves that stayed behind when the pot slid or hid.
- **room.py** (`--props full`): a procedural 150 mm digital caliper lying closed at the front, right of the build zone
  (beam, outside and inside jaws, the display housing with LCD, thumb roller and lock screw; stainless and matte
  plastic; its own slot group `calipers`, x+, gap 0.04); the notebook and pen at the front LEFT between the plant and
  the build zone (their own group `notebook`, x-, gap 0.05), the pen lying on the pad; the mug 30 mm right (0.22) for
  the calipers' room. Job `jobs/look15.txt` (look14's settings; the node0 runner's `kit/` paths, which the desktop's
  look9-14 jobs did not use since they ran locally there).
- **done.js:** a prop is any node carrying a slot, a Mesh or a Group of Meshes. The leaves are two-material meshes, so
  the glTF has them as one mesh with two primitives and three.js makes a Group `leaf_N` with the extras over two child
  Meshes without; the traversal only looked at Meshes. With the CURRENT room.glb a 12W probe build now hides all 18
  leaf meshes with the pot (before: none).
- **Look15** rendered on node0 and fetched to `D:\Claude - Output\done-scene-2026-10-23\renders\look15\`: the calipers,
  pad and pen where intended, nothing intersecting; the polished jaws mirror the faceplates' orange (a duller steel
  would stop it). **The bake is not run yet**: Joey's eye on look15 first, so `scenes/home-office/room.glb` is still
  bake2's and the live room does not have the calipers until then.
- **Review:** Terra `01a16b9d` (routine): no findings. Checks: room.py compiles; look15 renders; the two Done e2e cases
  pass with the traversal change. Not deployed.

## 2026-10-23 (the Done scene: the props' shadows move with the props; bake3)

- **Joey's report (2026-10-23, the massive-build probe, DESIGN.md §8e item 4):** a slid or hidden prop left its shadow
  behind: the keyboard's dark patch stayed on the desk's right end after the monitor group hid for a 12W build, and the
  snake plant's leaves kept shadowing the wall with no plant in front of them. His idea: bake the plant at several
  positions chosen by the build's size. Taken instead, as recommended to him: ONE bake, the desk and wall maps without
  the props, and each prop GROUP's shadow as its own mask slid with the group. Per-position bakes multiply with the
  monitor's positions and give discrete places; letting the stage's sun cast the props' shadows live would lose Cycles'
  soft 2° penumbra and leave Fast (no shadow map) without prop shadows. Masks are textures, so every tier has them.
- **The bake (`tools/done-scene/room.py --mode bake`, job `jobs/bake3.txt`: look15's flags and its measured exposure
  0.15686, so this IS the room as look15 shows it, with the calipers, the notebook and pen at the front left, the mug at
  0.22).** `bake_room` now bakes in two passes: the fixed surfaces (desk, walls, floor, frame, window, legs) with every
  prop hidden from render, then the props with the whole room visible (they keep the room's bounce and their own
  group's shadows). `--no-shadow-masks` keeps bake2's one pass. New `bake_shadow_masks`, run BEFORE `bake_room` (the
  props still wear their real materials; after `bake_room` they are emission shaders of their own lightmaps and would
  light the receivers): two white receiver planes 0.5 mm off the desk top (900 × 203 px at 2 mm a pixel) and off the
  back wall (1200 × 510 px, the desk run plus 0.3 m a side, 20 mm below the desk top to 1 m above), invisible to shadow,
  diffuse and glossy rays, baked as DIFFUSE direct + indirect at 1024 samples per state: no props, then each group alone
  (calipers, monitor, mug, notebook, plant). Mask = the lit ratio with the group over without, per channel (the screen's
  blue fill shows in the monitor's wall shadow), clamped to 1, set to 1 where the receiver is unlit in both states
  (inside the framed print's box the first run read 0/0 as a black patch in every group's wall mask), blurred (5-tap
  binomial), cropped to where it darkens by 7 % or more with a 24 mm pad, the crop's inner edges feathered to exactly 1
  (a quad's edge is never a step), sRGB-encoded, written as WebP q90 through Blender's own writer and read back (mean
  error at most 0.004). A group that darkens a surface nowhere gets no mask there (the mug, notebook and calipers on
  the wall). room.json gains `shadows`: `px`, `zWall`, the orientation and, per mask, the file, size, extents in stage mm
  about the tabletop anchor (desk: x0, x1, zBack, zFront; wall: x0, x1, y0, y1 over the desk top) and the darkest value.
- **What shipped on the branch:** `scenes/home-office/room.glb` 536 KB (bake2's 524 KB plus the calipers), `room.json`
  5.3 KB, seven masks totalling 15.4 KB (monitor wall 5.6, monitor desk 3.0, plant wall 2.4, plant desk 1.9, notebook
  desk 0.9, calipers desk 0.8, mug desk 0.7). node0, 1.4 minutes a bake. The exactness, as corrected by the review: the
  slots are straight runs along x and both receivers are planes, so a mask translated by the group's slide is the shadow
  the group casts there for the SUN (directional) and the SKY (uniform); the window's area light, finite and 2 m away,
  moves a caster's shadow by more than the slide (on the desk by 1 + h/(hL − h) for a caster point h above the desk
  under a light 0.91 m above it: 1.12 for the mug's rim, 2.2 for a leaf tip; on the wall 1.38 for the plant), inside a
  penumbra that light makes 0.23 m wide for the mug and 1.2 m for a leaf tip, so a broad faint gradient lands a fraction
  of its width off while the sun's crisp silhouette lands exactly; not corrected in the runtime, recorded (DESIGN.md §8f).
  Groups multiply, exact where their shadows do not overlap (the mug's and the keyboard's just touch).
- **The runtime (`js/scenes/done.js`, `done-fit.js maskQuad` + its unit test).** `loadRoom` fetches the masks with the
  GLB (once per page; a mask that fails to load is left out with a warning), read as sRGB, their URLs carrying
  room.json's deploy stamp. After `fitSlides`, one quad per mask at the mask's extents, lying on the desk (image top
  toward the wall) or facing the desk 0.5 mm before the wall, `MeshBasicMaterial` with the mask, transparent, no depth
  write, untoned, `renderOrder` 1, raycast off, `userData.doneRoom` and `doneShadow`, offset along x by the group's
  slide and hidden when `fitSlides` hides the group; disposed on leave (the textures stay cached like the GLB's). The
  debug hook gains `slides` and `shadows`. **Not three's `MultiplyBlending`:** on this stage it is ignored and the quad
  replaces the frame. main.js had measured that on the AO composite ("byte-identical to NoBlending") and the Very High
  blit already uses CustomBlending for it; the first proof shot drew the desk and the wall pure white (253) inside every
  quad with MultiplyBlending set and reported by the material, oak (215) with the quads hidden. The multiply is spelled
  out as CustomBlending, zero × source colour with the alpha left alone, and gives the product (210 where the mask reads
  0.97). The catchers for the build's live shadow are unchanged.
- **Review** (substantial: Sol `01a16bc5`, with the ledger's due Terra pair `01a16bc6` on the same prompt, blind; one
  finding each, both confirmed, none discarded). Sol: a desk mask that reaches the desk's end and slides outward
  overhangs the tabletop and darkens what shows past the edge (the plant's mask runs to the desk's left end; an 8W build
  slides it 33 mm out) → `maskQuad` takes the desk's extent as a clip, cuts the quad at the desk's ends and moves its
  texture window with the cut; a mask carried wholly off is not placed; wall masks are not cut; unit cases. Terra: the
  translation is not exact under the finite `--soft-light 500` area light, whose shadow moves further than the caster →
  true; the magnitude was computed (above) and sits inside that light's own penumbra, so the claim in the code, the
  design record and this entry was corrected rather than the runtime changed.
- **Checks (laptop).** Proof at High, headless (the session scratchpad: `before-12x2-hero.png`, `after2-12x2-hero.png`,
  `after3-8x2-hero.png`): the 12W × 2H probe build no longer shows the keyboard's dark patch on the desk's right end nor
  the monitor's and the leaves' shadows on the wall once those groups hid; the 8W build's plant slides 33 mm with its
  leaf silhouette on the wall behind it and its desk quad cut at the desk's end. Unit: done-fit 11 of 11 (`maskQuad`,
  the clip included). e2e `Done scene|Studio / Room`: 5 of 5; the first Done case counts one quad per listed mask on
  Fast, checks the blend, the orientation flags and each quad's place from room.json's extents, and that Back disposes
  them; the new case builds 12W × 2H through the Build workspace (the monitor and the plant hide with their quads, the
  mug slides 201 mm with its quads, Back disposes) and then 8W × 2H (the plant's desk quad cut at the edge, the drawn
  UVs the cut's). Mutants, all killed: the slide ignored; a hidden group keeps its shadow; the quads not removed on
  leave; normal blending; no masks loaded; a wall quad 100 mm behind the wall; every group read as unmoved; a desk quad
  mirrored in z; the clip ignored (the unit test); the texture window not moved with the cut (it SURVIVED the 12W leg,
  where nothing is cut, and died once the 8W leg was added). npm test 629 tests, 624 pass, 0 fail, 5 skipped; goldens
  60 shots, 0 differ. Not deployed, not merged.
- **Provenance of the bake-side hunks.** `db63d08` (the room pass, the previous entry) was staged as the whole of
  room.py while this work's first mask-pass hunks (the two-pass `bake_room`, `bake_shadow_masks`, `blur5`, `write_webp`,
  the `shadows` block) were already in the shared working tree, so that commit carries them UNREVIEWED and its look15
  render was made with them; Terra `01a16b9d` covered only the room pass's own hunks. This commit completes them (the
  crop threshold and feather, the unlit-receiver guard, the exposure) and its review covers the mask pass whole.

## 2026-10-23 (the Done scene: the shots stay inside the room for any build up to the cap)

- **Joey's call**, after the massive-build comparison (DESIGN.md §8e): "Keep every shot inside the room's interior for
  any build up to the 12 by 12 cap, let the build fill more of the frame when a wall is near, centre builds wider than
  the desk's free run on the desk, test it on the 2W kit, 8 by 6 and 12 by 12, review, commit." The centring was dropped:
  the "overhang" in §8e was an arithmetic slip between room and world coordinates (the desk runs 680 mm left of the
  anchor, the cap build spans ±531), retracted there.
- **What it is.** `done-fit.js clampToInterior`: along the ray from a shot's target to its fitted camera, the farthest
  point still inside the room's interior less the margins (150 mm from a wall or the floor, 450 mm below the wall tops,
  since the frame looks down and its upper edge must not see over them). A shorter distance means the build fills more
  of the frame (its share grows by 1/k); past 0.92 of the frame (or the shot's own share, the detail's 1.4) the fov widens
  to keep that share, up to 55°, then the crop is accepted. `done.js roomInterior` reads the interior off the GLB's walls
  (`wall_back`, `wall_left_*`, `floor`): the left wall's inner face, the back wall's right end (the backdrop ends there),
  the floor's top, the wall tops, the back wall's inner face, Infinity to the front; null without walls means no clamp.
  Applied to every fitted shot (the entrance and recenter hero, the sequence's shots, every refit); a held camera is not
  clamped. The debug hook reports `interior` and per-shot `fits` (fov, clamped, k, share). No room.json change, no bake.
- **Measured (High, the probe; before → after):** the 2W kit untouched. 8 × 6: the low shot (−1712, 540, 3526) → (−1230,
  444, 2537), fov 29.9, a frontal view of the whole desk instead of a blank wall. 12 × 12: the hero (3355, 2899, 6324) →
  (1950, 1810, 3682), the room seen from inside; the low shot (−2675, 909, 5499) → (−1230, 621, 2537) with the fov 29.9 →
  42.7; the detail unchanged. The 12 × 2 hero in the e2e's viewport had been at y 2399, above the wall tops (2260).
- **Review** (Terra, routine, thread 01a16bf1): one finding, discarded: the right-hand bound at the back wall's end is
  "over-clamping" on an open side. Kept by design: past that end the backdrop ends, so a camera beyond it looking
  back-left would frame the void whenever a shot swings right of this room's hero; it reframes, never breaks, and no
  shot of this room reaches it. The comment now says so.
- **Checks (laptop).** Unit: the measured cameras as cases (done-fit 12 of 12). e2e: the 12W case asserts the interior
  from the walls, the hero the margin below the tops and between the walls, the low shot inside the left wall with its
  fov widened (35 < fov ≤ 55). Seven mutants killed: no clamp; no top margin; no fov widening; no interior; the entrance
  camera unclamped; the sequence shots unclamped; the wall margin dropped. npm test 630 tests, 625 pass, 0 fail, 5
  skipped; the five room e2e cases 5 of 5; goldens 60 shots, 0 differ. Not deployed.

## 2026-10-24 (the Done scene as a FINAL SCENE you step into: the entry, the HUD gone, the bars, no orbit)

- **Joey's call** (2026-10-23 night): "when you get to the cinematic view in the instructions, it should be a little more
  interesting, maybe it's more than just a step in the instructions but like a final scene that you have to make obvious
  to go into, maybe most of the hud disappears and black borders appear on top and bottom of the screen slightly, kind
  of like scope in cinematic movies or games, and maybe a button to return back or change camera view, but don't let
  them be able to rotate the camera." Agreed and built as proposed.
- **The entry.** The End page shows the finished build in the studio as the other steps do, and the Next slot becomes a
  prominent "Watch the final scene" (`assemble.js renderPlayer`, behind `?done=room`; without the flag "Finished" as
  before). The room no longer comes on by itself at Done (`finish()` and the remembered-Done remount no longer enter it).
- **The scene** (`enterScene` / `leaveScene`): `html.cinema` fades the HUD out (`#ws-top`, the steps panel, the toolbar,
  the player, the dock, the phone chrome: opacity 0 then `visibility: hidden`); black bars 7vh top and bottom; one strip
  in the lower bar, "Back" and "Next view"; Esc is Back; the camera's safe area is the frame between the bars. Left on
  Back, Skip, any step, unmount, and when the room fails to load (Sol). The room enters with `orbit: false`
  (`done.js`): the controls are off, so a drag does nothing; a stage (Colors) keeps its orbit. `nextShot()` on the
  handle jumps to the next shot's hold (`jumpTo`; a jump is no drift, so it is never the slow-drift verdict, which also
  cures the debug hook's `jump(i)` artefact of §8e); under reduced motion the shots turn by hand (`seq.manual`), and a
  refit re-places the hand-chosen view (Sol). The grab-and-drift-back machinery (grab listeners, `driftBack`,
  `armReturn`, `idleBackMs`) is removed: nothing can grab the camera in the scene and the stage has no sequence.
- **Two things the browser taught.** Chrome keeps an element's `backdrop-filter` at opacity 0, so the top bar's glass
  chips stayed as blurred ghosts under the bar; the glass loses its blur at once and ends hidden. And bars drawn as
  `body::before/::after` with z-index 60 painted over a strip inside the workspace with z-index 61, the fixed `#ws`
  being its own stacking context; the bars are `#cinema-bars` inside the workspace, under the strip.
- **Review:** Sol `01a16c20` (substantial), two findings, both confirmed and fixed: a resize under reduced motion put
  the hero back while the hand-chosen index stayed, so the next click skipped a shot (the refit now re-places the chosen
  view); a room that failed to load left the scene mode on with the HUD hidden over an empty stage (both failure paths
  now leave the scene). None discarded.
- **Checks (laptop).** e2e, four Assemble cases: the first (no scene button without the flag; the End page first with no
  room until the click; after it html.cinema, no orbit, every HUD element at opacity 0 and the top bar hidden with its
  chips' blur gone, both bars drawn at 7vh, the strip's two buttons, the bars in the workspace layer with the strip, the
  safe area exactly the bars' frame; Esc leaves to the End page; the strip's Back too), the sequence case (the entry by
  the button; a drag does not move the camera; Next view lands on the next shot at once with no verdict; under reduced
  motion Next view turns the shots by hand and a resize keeps the chosen one), the 12W case (in by the button, out by
  Esc), and a new failed-load case (the scene mode goes with the room). Fourteen mutants killed (the room on by itself;
  the orbit on; no fade; no bars; Next view inert; Esc inert; the strip's Back not leaving the room; a jump judging; the
  shots ignoring the bars; the button without the flag; Next view by hand inert; the strip under the bars; a refit
  putting the hero back; a failed load keeping the mode); three of them survived until the checks were made to tell a
  drawn pseudo-element from a declared one, the bars' frame from the HUD's, and the bars' layer. npm test 630 tests,
  625 pass, 0 fail, 5 skipped (before Sol's fixes, which touch files it does not cover); the six room e2e cases 6 of 6;
  goldens 60 shots, 0 differ. Checked in the browser pane at Very High. Not deployed.
- **Next, in this order (Joey, 2026-10-24; DESIGN.md §8h):** a performance study of the scene (an ablation of each
  feature's frame cost against its visible worth, on the laptop GPU and SwiftShader, not the A5000), then the camera
  grammar: cuts to distinct cameras in a random non-repeating order, each with its own lens and a slow in-shot move or
  locked off, holds of ten seconds or more, a dip to black between shots, static first for weak devices.

## 2026-10-24 (the Done scene's performance study: the harness, the probe, and what to build)

- **What was asked.** Joey: a PC-game-settings pass over the scene, "which settings kill fps and which ones have a
  noticeable improvement visibly enough to keep", with the A5000 in mind as not the visitor's device; and his questions
  on the props' triangles, on hiding the interior parts once assembled, and on thinning the part GLBs. The whole study
  is `PERF.md` beside DESIGN.md (D:\Claude - Output\done-scene-2026-10-23); DESIGN.md §8i is its paragraph.
- **The instrument.** `tools/done-scene/ablate.mjs`: a fresh page per tier and feature, the scene entered as a visitor
  does, the clock stopped on the hero, the feature turned off in the page, a screenshot, then forced moving frames (the
  camera nudged 0.01 mm a frame, the frame cap off) with a frame-bounded clock (first warm tick to last tick over the
  frames drawn between them) and `--repeat 3`; three device classes (this laptop's GPU, the GPU with the CPU throttled
  4x, SwiftShader); `--entry studio` runs the Colors studio for the planner's own frame. `tools/done-scene/perf-probe.mjs`:
  draw calls and lightmaps per prop group, the shadow quads' on-screen fill, and a pixel diff of every shot with the
  interior hidden (and with the relief off at Balanced).
- **What it found (the repeat pass; the baseline's spread 1-3 % in software, 10-20 % throttled).** On this GPU nothing
  in the scene costs a measurable fraction of a millisecond. In software, Balanced / High: the pixel ratio -39 / -59 %
  (the stage's own first step); the environment -26 / -24 % (a real visual loss: keep); the relief -19 / -19 %
  (0.2-1.4 % of the pixels, along edges: off on Balanced in the scene); the interior parts -17 / -15 % (nothing visible
  from any shot once the drawer moment un-hides the slid unit's WHOLE interior: build); the props 7 / 6 %; the masks
  and catchers 2-4 % each (they cover three quarters of the viewport each; the first draft's -33 % was the old clock's
  slack: keep as they are, nothing to build). Throttled: the room's 53 calls a third of a 5 ms frame, the props' 44
  calls a quarter to a third, the interior's 29 a fifth at Balanced. A plain merge of the props is 64 -> 54 calls (every
  room mesh has its own lightmap); the re-atlas is written down, not built. The part GLBs are not thinned: the build's
  cost is pixels (pixel ratio 1 gives the same 481 ms at Balanced and High) and calls, not triangles. The planner's
  studio draws a software frame 1.8x slower than the scene at the same tier (not studied why); the interior hiding is
  worth the same 18 % there.
- **Build order.** (1) The interior hidden in the assembled state, in the scene, the drawer moment un-hiding its unit's
  whole interior; a stage-wide rule after its own check of the orbit views and of units without a faceplate. (2) Relief
  off in the scene on Balanced. (3) Nothing for the quads, the props or the GLBs. Then the camera grammar, static first.
- **Review.** Sol `01a16cb6` (substantial: a new instrument, and a conclusion being frozen), two rounds: eleven findings
  on the first draft and six on the second, all confirmed at least in part, none discarded. The frame-bounded clock, the
  repeats, the probe and the studio rows exist because of round one (the first draft's SwiftShader figures carried
  30-45 % of clock slack, more of it on the rows with faster frames, which made cheap quads look like large savings);
  round two scoped every verdict to what was measured.
- **Checks.** The harness's passes (66 + 42 + 12 + 18 + 4 rows, no failures; frames drawn == ticks on every row), the
  probe at High and at Balanced (its control diffs 0 px), the wallCrop screenshot against the baseline's by eye,
  `node --check` on both tools. Nothing in js/ or the tests changed; nothing on the ladder changed yet. Not deployed.

## 2026-10-24 (the Done scene: the interior hidden, and the relief by distance)

- **What.** The two rules the performance study put first (PERF.md §5; DESIGN.md §8j), on done-scene, behind the same
  `?done=room` flag, not deployed. Joey, 2026-10-24: "Next start with the two scene changes", and on the relief: "if
  far enough away that I can't see the layer lines it wouldn't make sense to have it impact it, but if I'm zoomed in up
  close it makes sense to see them."
- **The interior hidden** (`setInteriorHidden`, `interiorShow`, `interiorState` in main.js; the scene turns it on at
  entry with `sequence: true` and off at leave). The meshes of every Drawer, Stopper, QuickLock, MagnetClip and Magnet
  instance are hidden, mesh by mesh (not the group: `unitHasDrawer` and `unitBox` read `group.visible` and the slide
  moves the group), each remembering that this rule hid it. `slideUnitDrawer` shows the slid unit's whole interior
  while its drawer is out and hides it 360 ms after the close. QuickLocks belong to no unit and stay hidden, the state
  the probe measured at 0 px. One shadow-map render per change. The Colors stage (free orbit) does not use it yet.
- **The relief by distance** (`reliefResolves` in done-fit.js; `reliefOverride` / `setReliefOverride` in main.js;
  `reliefShot` / `reliefMove` in done.js). The relief draws nothing under the shader's 4 CSS px a layer and costs the
  whole fragment regardless, and it is a compile-time injection toggled by a material rebuild. So per SHOT: the nearest
  the build's box comes to the camera and the frame's focal length say whether any 0.2 mm layer can span the cutoff;
  if not, the stage's override takes the relief off (a third, subtractive term of `reliefWanted`: the kill switch and
  the ladder keep their authority). Applied at a cut, a landing or the entrance; a drift toward a shot that resolves
  turns it on at the start, one away turns it off on landing. Every current shot of the 2W2H kit is a third of a pixel
  a layer, so the scene runs without the relief on every tier (−19 % of a software frame, no visible change); a macro
  shot in the grammar brings it back by itself. Outside the scene the override is null.
- **Review.** Terra `01a16dbb` (routine), one finding: QuickLocks have no unit, so a slid drawer never un-hides them.
  True, and the state PERF.md §4.8 measured at 0 px (they sit at the case joints, not in a bay): recorded in the code's
  comment, no change. Two source gates widened to say what they meant: test/relief-tier.mjs admits the override as a
  term that can only TAKE the relief away; test/bed-finish.test.mjs distinguishes a READ of the shader's cutoff
  (allowed, and now required) from main.js PASSING its own thresholds (still refused).
- **Checks (laptop).** test/done-fit (13, with `reliefResolves`); the first Done e2e case extended (the rule on, every
  interior mesh hidden, `unitHasDrawer` still true, the slid unit's interior shown then hidden again, the override false
  at the hero with the measured px a layer, Balanced in the scene with `reliefWanted()` false, everything restored
  after Esc); seven mutants killed (no hide on entry; the drawer's unit not shown; no re-hide; leave keeping the hide;
  the entrance without its relief decision; leave keeping the override; the predicate inverted); npm test 631 tests,
  626 pass, 0 fail, 5 skipped; the six room e2e cases 6 of 6. Goldens: 60 shots, 3 then 4 END shots differ at
  0.10–0.17 % with the set changing between the two runs and about 1 000 sparse pixels across the build's extent on
  each (the height ruler's two sides: the flake of 2026-10-23); nothing in this change runs on the End page.
- **Known uncovered path.** The e2e cannot tell a cut's or landing's own relief decision (setCam) from the entrance's,
  because every current shot decides the same way; the grammar's macro shot will give it a differential case.

## 2026-10-24 (the Done scene: the calipers remodelled, their steel live; bake4)

- **What.** Joey: "they are in clear view and modeled very blocky, mostly the caliper tips should not be square blocks
  but rather come to sharp points, and maybe be steel metal rather than black. Reference a pair of calipers to improve
  their design." Remodelled from Mitutoyo's catalog drawing of the ABSOLUTE Digimatic 0-150 mm (500-196-30; Mitutoyo
  America, Small Tool Instruments p. D-6: L 233 mm, outside jaws 40 mm, inside jaws 21 mm above the beam, beam 16 mm),
  in room.py `build_calipers`: tapered outside jaws meeting in a point with knife-edged tips, crossed inside jaws, a
  rounded housing with an LCD reading 0.00, four buttons, the knurled roller and the lock screw, the beam's printed
  scale. 15 mm further back on the desk, so the longer jaws' tips stay 13 mm inside its front edge. Behind the same
  `?done=room` flag; not deployed.
- **Why they drew black, and the fix.** A metal has no diffuse colour, so its diffuse lightmap bakes black. The steel is
  now one mesh tagged `live`: bake_room skips it (and hides it with the props in the fixed surfaces' pass, so its
  shadow lands in its mask), the glTF carries its metallic PBR material with the scale as base colour, and done.js keeps
  it, cloned per entry, with the room's environment as its envMap on every tier, no shadow casting, and out of the
  environment capture. The housing bakes as one mesh; bake_room collapses a baked mesh's material slots to one, so the
  calipers are 2 draw calls (were 9) and the room 39 meshes (were 46).
- **Checks.** Local Workbench previews; Cycles close-ups and the bake on node0 (round bake4, twice: the first showed a
  seam across the head, merged into the fixed jaw; node0_render.py fetches only files it does not already have, so the
  second round's outputs were copied by hand); the installed GLB inspected (cal_steel metallic PBR with its texture and
  `live` extras, cal_body one emissive primitive; room.json changed only in the calipers' mask); the planner's view by
  the new `tools/done-scene/prop-view.mjs`. e2e: the first Done case asserts the two meshes, the live metal with its
  envMap and map and no shadow, the baked housing; three mutants killed (the live branch removed, no envMap, the steel
  casting). npm test 631, 626 pass, 0 fail, 5 skipped; the six room e2e cases 6 of 6.
- **Review.** Sol `01a16def` (substantial: a multi-file change and a new bake rule), one finding, confirmed and fixed:
  `--focus` under `--props minimal` was a KeyError; it now exits with a message. Nothing discarded.

## 2026-10-24 (the Done scene: the camera grammar)

- **What.** Joey's direction (DESIGN.md §8h): "the cinematic camera views should cut to a random different camera,
  position and zoom ... a zoomed in panning front view, then a completely stationary view ... then another view from
  down below with a wider angle lens, basically like the cameras used in that Superposition Unigine benchmark"; "keep
  them slow ... a relaxing cinematic scene, very slow pace"; "fades to black for transition"; and "we are on an A5000
  GPU, so most other devices might be way too slow ... maybe we only use stationary views for those devices". Built in
  done-fit.js (pure: GRAMMAR, BEAT, beatAt, planCycle, mixShot, fitShot, grammarMode, entranceTooSlow) and done.js (the
  runner); the old hold-and-drift sequence (SHOTS, SEQUENCE, sequenceAt, sequenceMode) is gone. Behind `?done=room`;
  not deployed.
- **The shots.** Eight, fitted to the build, inside the room and above the desk (an 18 mm floor): hero (still, the
  entrance lands on it), push (a 20 degree lens pushing in on the front), low (a 46 degree lens down at the desk, still),
  detail (the drawer unit, its drawer moment), slide (a truck across the front), top (looking down, still), macro (a 14
  degree lens pushing in on a corner of the drawer unit's face to 105 mm, where the layer lines resolve and the relief
  turns itself on), side (an arc). Moves interpolate the shot's parameters, eased across the whole visible time.
- **The beat and the order.** About 13 s a shot: the black fades out 1.1 s, a hold of 11 s, the black fades in 0.8 s,
  0.35 s of black in which the camera cuts (`#done-fade`, over the canvas, under the workspace). Every shot once a
  cycle in a seeded random order, the hero first, no shot following itself, never two moving shots together.
- **Static first.** 'full' on High and Very High after the entrance verdict (its median frame under 50 ms); 'still'
  (every shot locked off at the middle of its move, no drawer moment) on Balanced, Fast and after a slow verdict
  (re-taken on every moving shot); 'off' under reduced motion (the still hero; Next view by hand, a plain cut). Moving
  shots keep the stage's AO through the move (`setMotionFull`, main.js; AO is 3.4 % of the hero's pixels). A cut's
  dip-in waits until the new view is drawn (the relief's rebuild compiles about a second), and the entrance draws the
  room's first frames before the camera moves. Next view dips out from where the shot is.
- **Not built:** bokeh (a lens jitter in Very High's accumulation; 24 samples would band a strong blur).
- **Review.** Sol `01a16e0e` (substantial: the grammar is a new state machine over timers, animation frames and a wait
  for the first drawn frame), three findings: (1) "the slow tier falls through to full" DISCARDED (there is no `slow`
  tier; the flag is tested and parses as intended; lesson written to reviewer-lessons.md); (2) Next view during the
  entrance let two writers fight over the camera, CONFIRMED and fixed (seqStart ends a running entrance and takes its
  verdict on the frames so far; the entry's pending callback stands down once the grammar runs); (3) a tier drop while
  a new shot waited for its first frames ticked the last shot's clock and could start a second one, CONFIRMED and fixed
  (no tick while waiting; one wait at a time). A fourth bug turned up in the new e2e step for (2): the stage's own
  camera tween into the End page's view kept writing the camera under the scene when the scene was entered inside it;
  `holdScene(true)` now cancels it (main.js). The follow-up on all four: no findings.
- **Checks.** Unit tests (16 for the grammar's pure part; the motionLite gate extended with the scene's opt-out); the
  grammar e2e case (Fast still, Balanced still, High moving with AO kept, the dips, Next view's dip, the drawer only
  when moving, a drop locking a move off, a hidden tab, the forced verdict, reduced motion, Next view before and during
  the entrance, a drop during a shot's wait) with debug-only timing knobs to stretch the race windows (`enterMs`,
  `preFrames`, `waitFrames` via `window.__DONE_TIMING__`); the 12W case now checks all eight shots inside the room and
  above the desk. Mutants: 14 on the grammar killed; of the race fixes, 4 killed, 1 survives by design (tick's waiting
  guard alone: freeze's guard covers the only caller that ticks while waiting). A live tour and a contact sheet of every
  shot at High (D:\Claude - Output\done-scene-2026-10-23\grammar\).

## 2026-10-24 (the Done scene: the relief compiled ahead, so the dip into the macro is the beat's own)

- **The problem, filmed and then measured.** The film of the grammar (`grammar-high-95s.mp4`) showed 1.8 s of black
  before the macro shot and about 0.5 s before every other one. The macro is the one shot that turns the relief on
  (where its push-in ends), and that rebuild compiled the relief's programs on the cut's first frame: at High 2
  programs in one frame of 1.2 to 1.4 s, 1.6 to 1.8 s of full black; at Very High 4 programs (its samples draw into a
  render target, a second variant of each program), 2.9 s. The black waited because the new shot's dip-in waits for its
  first drawn frames.
- **Joey's call.** Offered "compile the macro's relief shaders during the first shot, so its dip is as short as the
  others", he answered "Yeah let's test doing that" (2026-10-24).
- **What was built.** `stage.warmRelief()` (main.js) puts the relief-on materials on the meshes, compiles them with
  `renderer.compile` and restores the relief-off materials, all in one task, so no frame draws the relief. It compiles
  only what will be drawn: the meshes that are visible, the canvas variant always, the render-target variant on Very
  High or with the floor mirror up. Nothing is disposed, so three keeps the programs, and the cut's own rebuild later
  finds them by key. It is keyed by tier, plate program, scene revision and target need, and skips a repeat. Not
  compileAsync, whose poller would throw on the per-unit override clones the restore disposes. The scene's `warmAhead`
  (done.js) calls it when a hold begins on screen (the hero's landing, a frame Very High restarts its accumulation on
  anyway) and after a change of tier, if any shot in the plan will turn the relief on. One direction only: a tier change
  during the macro still leaves the next cut compiling the off programs, in the black, as before.
- **Measured** (`relief-warm-probe.mjs` and its results in `D:\Claude - Output\done-scene-2026-10-23\relief-warm\`;
  one fresh Chrome a run, the arms interleaved). At High (4 pairs) the macro's black went from 1.62-1.76 s to 0.38-0.39
  s, the cut's longest frame from 1.27-1.42 s to 39-46 ms, and the cut compiled 0 programs instead of 2. At Very High
  (3 pairs, through the whole macro) the black went from 2.84-2.93 s to 0.39-0.41 s, and the cut compiled 0 programs
  instead of 4. The warm-up's own task is 40 to 64 ms. A first version compiled both variants for every mesh (six
  programs); it paused frame delivery 0.4 to 1.2 s in 3 of 11 runs during the hero's still hold. That is why the
  committed version compiles only what is drawn: no hold frame over 16 ms in 7 runs.
- **Review.** Sol `01a16f55` (substantial: a new stage function and its call sites over three's program cache), one
  finding, CONFIRMED and fixed at its root: the relief's rebuild disposed the per-unit colour clones (the shared purge's
  `purgeOverrideMats`), and three releases a program when the last material using it is disposed. On a build whose
  drawn parts all carry a unit's own colour the clones are a program's only users, so the warm-up's own rebuilds threw
  its programs away and every flip of the scene's compiled again. It did not show on the root kit as it stands (the
  unit-less covers, rails and feet keep base materials that share the programs); with every unit coloured and those
  hidden it did: no relief program left after the warm-up, one program compiled on screen in the hero, one at the cut
  into the macro and three by the next shot. A fix inside the warm-up alone still left two at the cut out of the macro
  (the macro's own flip disposing the clones built after the warm-up), so the fix is in syncRelief: the relief's flips
  drop the clones from their registry undisposed (`purgePartMaterials({ keepClones: true })`); the plate's program
  switch still disposes them. An undisposed material is collected like any orphan (three keeps its state in a WeakMap);
  what stays is its programs. With it: 0, 0 and 0, two relief programs alive. The e2e now counts by program ID (a count
  stays level when a released program's slot is refilled) and its tier-change path is that clones-only build. The
  follow-up on the fix and the new e2e: no findings.
- **Checks.** A new e2e case, two pages, counting by program ID: the landing at High at 1280x720, where the macro
  resolves only toward its move's end (3.88 CSS px a layer at the middle, 5.84 at the end); and a change from Fast to
  Very High on a build drawn only in per-unit clones (every unit coloured, the unit-less parts hidden). Each checks
  that the hero draws without the relief, that the cut into the macro compiles nothing, and that nothing compiles
  through the macro's end and the cut out of it. The macro's end matters at Very High: its samples begin there.
  Mutants on it, 10 of 10 killed: no warm-up at the landing; the warm-up without its compile; the relief left on; never
  the target variant; never the canvas variant; the target need judged never; no warm-up on a tier change; the
  look-ahead judging a moving shot at its middle; the flips disposing the clones; the purge ignoring keepClones. Before
  the case watched through the macro's end, the two target-variant mutants survived, as did the middle-of-move one at
  1280x800, where the macro's middle resolves. The whole e2e suite: 89 of 89. npm test: 634 tests, 629 pass, 5
  skipped. Goldens alone: 60 shots, 59 the same on the first run. The 115 tabletop's end shot at Fast differed by
  0.170 %, inside the known end-shot ruler flake's band, and Fast draws no relief; it matched exactly when its kit and
  tier were run again.

## 2026-10-24 (the Done scene: bokeh, a thin lens in Very High's accumulator)

- **The ask.** Joey, from the start of the grammar: "a completely stationary view (maybe with bokeh)"; on 2026-10-24,
  "Let's tackle bokeh next". It had been left out because Very High's 24 accumulation samples would band a strong blur.
- **What was built.** A thin lens in the accumulator (`js/lens.js`, main.js THE LENS). While a lens is set, every
  sample moves the camera across the lens's aperture, in its own right/up plane, and shears the projection
  (elements[8] and [9]) so the plane in focus lands where a pinhole puts it. The mean is the lens's depth of field. Every
  sample is a real render, so occlusion is right and there are no edge halos; nothing is post-processed. Details:
  - **128 samples, not 24.** At 6 px the look test showed no ghost copies.
  - **A golden-angle spiral that grows from the centre** (`lensDisk`). A part-way mean is the same lens stopped down,
    so a shot's blur opens as it settles; it never shows separate copies.
  - **The light's disc out of step with the lens's** (`lightStride`; Sol `01a17057`). Both spirals grow from the
    centre, so visited in the same order a sample's light offset and lens offset shared a radius, and the build's soft
    shadow on the blurred wall and desk came out wrong: up to 14 levels from a 1024-sample reference on the hero. Under
    a lens the light's point for sample i is (i * 79) mod 128, and the error where the two orders differ fell from 3.85
    to 1.14 levels on average. Without a lens the order is the old one exactly, so every other frame is unchanged.
  - **The camera is put back exactly.** The position is copied back, not moved back, because the next frame compares
    the camera's matrices bit for bit.
  - **Debug read-outs.** `acc.lensError` is the worst NDC error of a point on the plane in focus; `acc.lensSpread` the
    farthest the camera really moved (from its position, not from the offset asked for: Sol `01a17057`); `acc.lightSums`
    the burst's sums for the correlation of the lens's radius with the light's. The live hero read 4.4e-16 and the full
    aperture, and the e2e holds the correlation under 0.2 (in step it is 1).
- **The occlusion overlay under a lens.** It is drawn from the pinhole camera after the mean, so whole it laid sharp
  contact shadows under blurred props, and switched off it took the build's creases and contacts with it. It now fades
  with the circle of confusion, read from the AO pass's own depth: whole up to 1.5 px, gone by 5 px. It uses the
  aperture of the mean actually on screen, so it fades as the blur grows, and only while the accumulator is wanted: a
  tween's plain frame keeps its AO whole (Sol `01a17057`). The anchors see-into patches stay verbatim.
  - **Known limitation, deferred.** The weight is taken from the depth AT each pixel, so it cannot see a blurred
    foreground spreading over in-focus AO. Its size on the three still shots is not measured. The one place examined,
    the low shot's wall-desk seam whose AO band ends sharp, turned out to be the AO pass's own edge at a depth step,
    with both sides in focus (a circle of confusion of 0.03 and 0.46 px at one column, measured by ray). Down one column
    a blurred pen (5.7 px) begins four rows below the band's end, and by the thin-lens model its blur reaches the band's
    last rows, which are down to 2 levels there. Other builds and framings are not measured. The fix would be a
    near-field circle-of-confusion dilation in the composite.
- **The scene's rule** (done-fit.js `lensFor`). The whole build is held sharp to `LENS.maxPx` at its nearest and
  farthest corners. The focus is the harmonic mean of the box's depths along the view axis, and the aperture is the
  widest that holds both ends. The look test chose 3 px: on the hero a wall a metre behind the focus blurs about 11 px
  and the mug in front reads soft. 1.5 px was barely there, and 6 px began to soften the build's own grain. Asked after
  the final comparison (`bokeh/final/`) whether to keep 3 px or try 6 px, Joey answered "I think v3 is good"
  (2026-10-24). No version had been labelled v3, so it is read as the 3 px one, and the value stays.
- **Where the lens applies.** Still shots of the moving grammar, only where the stage accumulates (Very High). Not a
  moving shot, not the detail shot (its drawer moment restarts the accumulation, so the blur would pump), not the still
  grammar (a slow device, a tier below High), and cleared when the grammar stops. A resize and a tier change recompute
  it.
- **The beat is unchanged.** The new shot fades in while its lens settles. 128 samples took about 1.2 s on this
  laptop's 120 Hz display, and should take about 2.1 s at 60 Hz. The dips measured 0.5 to 0.6 s in the film, as before.
- **Measured.** The vault's measurements.md, "The Done scene's lens". In short: the frame's sharpness falls 18.6 to
  19.6 % on the three still shots; the half-float mean is within 2 levels of a float32 one at 128 samples.
- **Review.** Sol `01a17057`, three rounds. Round 1, four findings, all confirmed:
  - A tween's plain frame faded its AO by the last burst's count. The weight now applies only while the accumulator is
    wanted.
  - The weight is per pixel, so it cannot see a blurred foreground spreading over in-focus AO. Deferred.
  - The light's disc was visited in step with the lens's. Fixed with `lightStride`.
  - The e2e passed with no lens at all. It now reads the picture and the camera's real move.

  Round 2: no new findings, and the deferral held. Round 3 corrected round 2's evidence: the 3.4 px behind its "one
  measured case" was my estimate, not a measurement. Measured by ray, both sides of that edge are in focus, so there is
  no case. Sol withdrew the 1.7 px defect and found nothing else that rested on it.
- **Checks.** npm test: 642 tests, 637 pass, 5 skipped. The lens case and the warm-up case pass. Every mutant is killed,
  each at its own assertion: the round's five (L15 to L19; L19, the lens removed with its spread read from the offsets
  asked for, only by the picture check), the fourteen earlier lens mutants, and the ten warm-up mutants (w6 re-anchored
  to the restructured onQuality). The whole e2e suite: 89 of 90. The one failure, Colors step 5's camera read (0.75 mm,
  in a workspace with no lens), passed alone three times in three. Goldens: 60 shots, the 115 tabletop's Very High end
  shot 0.141 %, only its height ruler drawn on the other side (the known end-shot flake); alone, 60 of 60 the same.

## 2026-10-25 (the Done scene: wall and under-table builds hung where they mount)

- **The ask.** Joey: "Looking good, yes next we must tackle under table and wall mount, this might require some
  different camera angles and figuring out positioning based on the build size"; then "I'd say hide the fake table
  surface we use in the builder and align the under-table build to be installed under this scenes table"; and on seeing
  the first frames, "Maybe for the under table build always left justify them ... that way it won't create awkward gaps
  on both sides and rather a larger gap on the right for knee space" (all 2026-10-25).
- **Before.** Every build was placed as a tabletop one. A wall or under-table build stood on the desk 112 mm in the air
  (its grid puts the unit in the top row), the builder's own wall plane or slab stood in the room, in front of the room's
  wall or over its desk, and the build cast no shadow (the stage turns shadows off for hanging builds: its backdrops
  catch none). Frames: `mounts/baseline/` in the Done scene's output folder.
- **Where the room goes** (done-fit.js `roomAnchor`; the room moves to the build, as before):
  - **Wall.** The room's wall face 0.5 mm behind the build's back plane, and the build's bottom 550 mm over the desk top
    (the room's own wall anchor, clear of the monitor's top at 510 mm). Centred on the build zone, like a tabletop build.
  - **Under-table.** The desk's underside on the rail tops and its front edge on the rail fronts: the builder's own claim
    (fitSurface) that the kit mounts at a desk's front edge and the drawers pull out past it. The build's left edge 20 mm
    (`UNDER_LEFT_GAP`) from the inner face of the desk's left leg at any width, the leg measured from the GLB's
    `desk_leg_l`.
  - **The mounting frame** (main.js `mountGeom`, `stage.mountFrame()`): where the build meets its mount, as fitWall and
    fitSurface already measure it. A wall build's back plane (the case backs, the screw tips left out), an under-table
    build's rail tops and rail fronts.
- **The builder's backdrops stay out of the room.** The render loop hides the wall plane and the slab while a scene holds
  the stage. A hanging build casts its shadow there (shadowsWanted: the held scene is lit by its own sun) onto the room's
  wall and desk.
- **The desk's shadow on an under-table build.** The room is baked and unlit, so its desk cast nothing, and the build
  under it took the sun as if the desk were not there. The desk's own top and both legs cast it now (they draw as
  before; the shadow map gains them): the left leg stands 20 mm from a left-justified build, between it and the window.
  At High, 1600 x 900, on a 6W2H build the desk darkens 2440 to 2795 px of the build's window-side end on the low and
  slide shots (545 to 641 of them the legs') and 32710 on the macro; the hero, from the right, shows none
  (`mounts/v4-desk-shadow/`).
- **The desk top's height, carried through.** The catchers, the props' shadow masks, the contact disc (shown on Fast for
  a tabletop build only) and the camera's floor (18 mm over the desk top; none for an under-table build, whose shots go
  below it) follow the desk wherever the room is placed.
- **The props.** A tabletop build slides them by footprint, as before. A wall build moves only a prop that reaches up to
  it (slideProps' `height` option): the notebook under a 6W one stays put. An under-table build moves nothing.
- **The shots** (`GRAMMAR.wall`, `GRAMMAR['under-table']`): eight each, built like the tabletop's. The hero is still and
  first, four shots move, and one has the drawer moment. They keep near the build's own height: nothing looks down on a
  wall build from over the wall's top, or down past the desk's edge onto an under-table build. The low shot looks up,
  from the chair or from under the desk. The tabletop's look-down top shot becomes a wide one of the desk. The bake's
  hero (20 degrees down) is a tabletop build's only.
- **Measured** (`mount-probe.mjs` at 1600 x 900, the setup sheet's own 185 builds given layouts through the store; 15
  probe records with their frames in the Done scene's output folder, `mounts/`; no page error in any):
  - Wall, on High at 2W1H, 4W3H and 12W6H and on Very High at 4W3H: the build's bottom 550.0 mm over the desk top and
    the wall's face 0.50 mm behind the build's back (z -93.4 against -92.9) at every size.
  - Under-table, on High at 2W1H, 4W3H and 12W6H and on Very High at 1W1H, 4W3H, 6W2H and 12W6H: the desk's underside
    on the build's top and its front edge at z 92.5, the rails' front by the stage's frame (the e2e checks that frame
    against the rails' own meshes); the build's front 29.3 mm past the edge at every size (every probed build is of the
    same 185 cases). Left-justified (1W1H, 6W2H, 12W6H): 20.0 mm from the left leg's inner face at each, leaving 1497,
    1057 and 529 mm of knee space to the right leg; centred, the 12W6H had stood 54.5 mm from the left leg. A 12W6H's
    bottom is 372.1 mm over the floor.
- **Review.** Sol `01a17311`, four rounds.
  - Round 1, one finding: the e2e checked the desk's front edge against the mounting frame's `frontZ`, the very value
    that placed it, so a frame 5 mm off passed (the 20 to 40 mm projection window cannot see 5 mm). The rails' own front
    is now measured from their meshes. The change's own mutants found two more gaps that round 1 missed. The slab check
    was read at the hero, whose camera sits over the rail tops, where the slab's own rule hides it anyway; it is now also
    read at the low shot, the camera asserted under the rail tops first. And nothing checked a wall build's slides; now
    the notebook under a 6W one must stay put.
  - Round 2: the first desk shadow was a stand-in box (the desk top's size, its colour and depth writes off), and the
    AO's override-material depth pass drew it anyway, its square edges over the desk top's 3 mm bevel; its checks read
    its flags and its centre, not its shadow. The desk's own meshes cast now (a layer cannot keep a caster out of the
    main passes alone: r185's shadow pass tests the main camera's layers), and the e2e compares one still frame with and
    without their flags, the map re-rendered each time (1747 px shaded at 1280 x 720, none brighter). Discarded: the
    environment map sampled at one point, the scene's existing approximation for every mount.
  - Round 3: the debug hook reported a list kept beside the flags, so a top-only flag passed both checks; it now reads
    the flags themselves. Round 4: no findings.
- **The leave check's flake, not explained.** Read 400 ms after the scene's hook went, a wall build's backdrop disagreed
  with the studio's rule once in about sixty runs. Twenty runs logging that read's state never disagreed, and no cause
  was found. The read now waits for the hold to be released, reads in an animation frame, and carries its state and the
  page's errors if it fails again.
- **Checks.** npm test: 646 tests, 641 pass, 5 skipped. The whole e2e suite before rounds 2 to 4: 91 of 91; after
  them, the Done scene's seven cases, and the mounts case in all 21 runs since its leave read changed. Mutants: all 27
  of the mounts' killed, each at its own assertion, and the 19 lens and 10 warm-up mutants again. Goldens, 60 shots:
  9 end shots differ at 0.10 to 0.15 % after the suite, and alone one other at 0.106 %. In each the differing pixels
  lie in two narrow bands either side of the build, and the one opened (270 3W2H, end, Fast) has the height ruler drawn
  on the other side: the known end-shot flake.

## 2026-10-25 (the Done scene: the visitor's wall and desk colours, a dark wall darkening the room)

- **The ask.** Joey: "Just something else to think of next, would it be possible for the user to maybe adjust the wall
  and maybe desk color if the scene? Like in case they want to actually see how this looks in a closer representation of
  where they will be installing this to get a better idea of how the colors look together"; and, shown that a dark wall
  left the rest of the room as bright as a white one, "Yes dark wall should also darken the rest of the room" (both
  2026-10-25).
- **The control.** "Wall & desk" on the final scene's strip (Back | Wall & desk | Next view) opens a panel 8 px over it;
  in Colors the same control sits in a "The room" section while the stage is Room. Nine wall paints (White, the bake's
  own; Warm white, Light grey, Greige, Sage, Dusty blue, Navy, Charcoal, Terracotta), five desks (Oak, the bake's own
  veneer; Walnut, a tint of it; White, Grey, Black, plain), and the visitor's own colour for each, applied a frame at a
  time while it is dragged. Remembered in this browser (`gen2-room-colours`), so the next entry and the other place open
  in it. Esc closes the panel before it leaves the scene. One implementation, done.js `roomColoursPanel`, on the scene's
  handle; the workspaces only place it.
- **How the room is repainted.** The room is baked: each surface's texture is its colour times its light (diffuse only),
  so a new colour is a multiply, channel by channel in linear light.
  - **A wall** is its bake times the new paint over the baked one (one plain paint).
  - **A plain desk** is its colour times the desk top's light-only map (bake5: room.py `--light-maps desk_top`, the
    diffuse light with no colour, the props hidden and the bump unhooked, through blur5). **Walnut** tints the oak's bake
    by its colour over the oak's albedo as baked (room.json light.desk_top.albedo, the median of bake over light), so the
    grain stays.
  - **The walls' bounce** (Joey's second ask). Each channel of each surface's texture is close to a straight line in the
    walls' albedo, between the bake's paint and black walls: L(w) = L(w0) - (1 - w/w0) x D, D the light the walls bounce
    onto it. D comes from a second bake with near-black walls (bake5-dark, `--wall-hex #010101`: Cycles bakes no light
    pass on #000000), differenced against bake5 by tools/done-scene/endpoint.py, averaged over each mesh's own texels at
    a quarter of its resolution (a half for 256 px and under, whose thin islands, a window jamb or a leaf, blurred into
    their neighbours at a quarter), clamped at 0 after that average, pushed into the gutters, and packed into one
    1024 x 952 atlas (`wall-bounce.webp`, a scale per tile). Each room material takes its share off in its own shader
    (done.js `addBounce`). After every change the room is captured again as the build's environment, so the build's
    reflections follow.
  - **The walls' diffuse share.** A wall's bake over its paint is its light times c = 0.9873, the share of the paint the
    bake draws as diffuse; the Principled BSDF's specular layer takes the rest. Measured, the same on all five walls, in
    bake5-share (run as bake5-v2: light-only maps of the walls in the shipped paint). A wall's D is c x (L(w0) - L(0)).
    Taken as 1, c left the walls' D short (wall_back's mean by 8 %, wall_left_a's by 17 %, wall_left_b's by 8 %) and
    below zero on 9 to 28 % of those three walls' sunlit texels (4 to 6 % with it). That c holds in another paint is the
    specular layer's theory, not measured.
- **A detour on the way.** An intermediate build drew the walls from light-only maps of their own (bake5's first run,
  kept as bake5-v2), on an assumption written into bake5's job comment, not told to Joey: that the bake clips the walls'
  sun patch at 1.0, so a ratio over it would leave a dark wall's patch too dim. The wall texels at the 8-bit top are
  real, but every one lies outside the room's interior: on the back wall's outer face, on its room-facing face only past
  the left wall (x -3.00 to -1.65 m; the left wall stands at -1.6 m), and on the left wall's outer face (x -1.62 m, 3.6
  to 88.1 % of each panel's). The left wall's inner faces and the window reveals hold none (each wall triangle's texels
  counted in room.glb). The walls went back to the ratio over their bake.
- **Measured against true re-bakes** (Cycles at the shipped settings in that colour, drawn by the planner as it draws the
  shipped room; 1600 x 900, High; hero / low / top; the mean signed difference in display levels, planner minus truth;
  the frames in `colours/truth2/` and the scripts in `colours/scripts/` in the Done scene's output folder):
  - Navy wall: +0.0 / +0.0 / +0.1 (mean absolute 0.7 to 1.0, 99th percentile 5 to 8).
  - Sage wall: +0.3 / +0.3 / +0.5 (0.9 to 1.1; 5 to 6). The sign is the one the straight line's own error has for a mid
    paint (light that meets the walls twice goes as w squared, so the line runs above the truth between its ends); navy,
    near the dark end, cannot confirm it.
  - White desk, like for like (#f2f1ec): -1.1 / -1.7 / -1.0. The rest of the room is 1.3 to 2.1 levels too dark (blue
    1.9 to 3.2), because the light the desk bounces onto the room stays the oak's: there is no dark-desk endpoint. Stated
    in done-fit.js and done.js, not corrected (Sol `01a17447`, below). The desk top itself is 1.6 to 2.3 levels too
    bright; what makes that up is not isolated (the desk's own specular share, left out of colour x light, and the light
    it gets back from the room are both candidates).
  - The default colours against bake4's room (as shipped before): 0.0, 99th percentile 2. The default draws the bake
    exactly: every surface its own map at its baked colour, nothing taken off.
  - Before the diffuse share and the clamp order were fixed: navy +0.1 / +0.1 / +0.2, sage +0.5 / +0.4 / +0.6.
- **Cost.** The room's files 652,190 -> 811,299 bytes (the atlas 133,532, the desk's light-only map 22,536, room.json
  +7,181). They load as soon as room.json is in, beside the GLB, not one after another after it: on a throttled line
  (80 ms latency, 10 Mbit/s) the click to the scene fell from 1736 to 1345 ms (median of 3), the new files done by about
  880 ms while the GLB runs to about 1100 ms. A colour change, over 24 changes at 1280 x 720 in Chrome at High on an
  RTX A5000 laptop, measured with gl.finish: 7.4 ms median, 12.4 ms the most observed, the next frame 10.6 ms after it.
  The atlas keeps its mipmaps: without them every error statistic against the truth agreed to 0.01 level, and among the
  pixels the two differed on by more than 2 levels the mipmapped atlas was usually the closer (no mipmaps closer on 12
  to 26 % of them; on navy's hero their mean absolute error 1.65 against 3.05 levels).
- **Review.** Sol `01a17447`. Round 1: one finding, the desk's bounce (above), confirmed and stated rather than
  corrected; and, in its answers, two gaps in the e2e case, each shown by a mutant that passed it: a Walnut drawn as the
  oak (C19) and the visitor's own colour chosen but not painted (C20). The case now reads the desk's and the wall's colour
  off their materials, and the change in the frame. Round 2: no findings. Round 3, these records: seven findings, all
  taken. Signed means had been stated as accuracy; no room-facing face was said to clip, when the back wall's does past
  the left wall; the desk top's excess was pinned on the oak's bounce; the mipmap and timing figures had lost their
  conditions; the probe scripts were cited from a temporary folder; and a claim was recorded as told to Joey that had
  only ever been in a job comment. Round 4: no findings.
- **Checks.** Mutants against the colours case: all 17 killed, each at its own assertion (C19 and C20 had passed it
  before round 1's checks). The whole e2e suite: 92 of 92. npm test: 650 tests, 645 pass, 5 skipped. The colours case
  runs in 19 s; each of its frame checks clears its bar at least twice over (Walnut 22.1 % of the frame darker against
  2 %, the visitor's own colour 60.0 % against 30 %).
- **Not done.** The desk's own bounce (a dark-desk endpoint bake and its tiles) is offered to Joey as the next step. Not
  deployed: the branch is done-scene, behind `?done=room`.

## 2026-10-25 (the Done scene: the shadows on down the wall, smoother walls, a plain desk's sheen, the coffee's steam, the macro pulled back)

- **The asks.** Joey, of the final scene, 2026-10-25, in this order: "one thing i notice that feels a little weird, the
  way the shadows cut off or start right at where the table is nearest the wall, i see it for both the plant and build
  shadows"; "i notice the wall texture looks gross and highly compressed, like maybe we are making it too low res or
  scaling it wrong? Also the black desk feels like a void? maybe a slight sheen or reflection on the table surface?";
  "also is there anyway to add a steaming animation to the coffee?", then, of its first form, "wouldn't the steam be
  rolling off the entire coffee surface and not just a small circle in the center?"; and "the zoomed in camera is a bit
  too zoomed in in my opinion, maybe bring it out about twice as far?".
- **The shadows at the desk's back edge.** The desk stands 20 mm off the wall, so the sun reaches a strip of wall under
  the desk top through the gap: 29.9 mm on the wall's face (the gap times the sun's 578 up over 387 toward the room). The
  bake lights that strip, and the build's wall catcher and the props' wall masks stopped at the desk top, so a lit line
  parted the shadow on the desk from the one on the wall. Both now reach down past the desk top by `gapDrop` (done-fit.js):
  the gap to the anchor plane they stand on, 19 mm, times the same rise over run, and 3 mm for the sun's disc, 31.4 mm.
  A wall mask draws its texture's bottom row on down (v0 below 0, clamped), not its picture stretched. Measured on the top
  shot at 1280 x 720: 4,609 pixels of the strip darker where the build's shadow crosses it, none lighter.
- **The walls' texture.** Not the texture's resolution: the plain surfaces' lightmaps, about 6 mm a texel, held the
  bake's grain (192 samples, no denoiser: 0.6 to 1.1 levels in a smooth patch of the back wall) and WebP's blocking of it,
  and a close view magnifies that into soft blotches. tools/done-scene/smooth-maps.py blurs the walls', the floor's and the
  window frame's maps over their covered texels (room.py's blur5, in linear light, the gutters left out), adds a
  half-level dither and re-encodes at the same WebP 82. Measured: the mottle on a sage wall seen from 600 mm 1.20 -> 0.59
  levels (1.20 alike on High and Very High before); the back wall's map 31,120 -> 15,044 bytes; room.glb 627,612 ->
  589,504 bytes. Both bakes were smoothed before endpoint.py rebuilt the walls' bounce atlas from them (133,532 -> 127,432
  bytes). The tool keeps the bake as room.unsmoothed.glb, records the digests of the bake it read and the file it wrote,
  and refuses a room.glb it cannot place (Sol `01a174d3`, below).
- **A plain desk's sheen.** A coat's reflection of the room's own environment: Schlick's Fresnel for a dielectric (F0
  0.04), roughness 0.35 with Fdez-Aguera's term, on White, Grey, Black and a visitor's own colour; Oak and Walnut keep the
  bake's matte veneer. The environment captured after each colour change is the one the desk reflects. Measured on the
  black desk at the hero, 1280 x 720: 16 % of the frame lighter with it (151,518 pixels by more than 24 levels summed),
  46,275 of them by more than 120, the farther half of them twice the nearer (131 against 68): the coat shows most toward
  grazing. Not modelled: the desk in the captured environment carries the previous capture's reflection, a lag of one
  step at its Fresnel weight, estimated at a few per cent of the desk's look in the build's reflections.
- **The coffee's steam.** Four camera-facing sheets stood across the coffee front to back (at -0.75, -0.25, 0.25 and 0.75
  of its radius along the view), each as wide at its foot as the coffee's chord there, over a faint mist on the surface,
  about 100 mm wide and 170 tall over the 36.5 mm mug; a noise rises through each sheet, its tendrils merging as they
  widen. Its first form, one column from the middle, was Joey's "small circle in the center". It moves on High at 24
  frames a second and on Balanced at 15, only while it is in the shot, at that rate whatever the display's (done-fit.js
  `steamBeat`: a 60 Hz screen alternates 2 and 3 frames); on Very High only on the frames the camera's own move draws, so a
  still shot's accumulation converges on still steam; not at all on Fast or with reduced motion. Its frames are asked
  for with main.js's new `drawNextFrame()`: one frame, nothing invalidated. Its first form called invalidateFrame(),
  which holds the idle gate open 600 ms each time, so a held High shot drew at the display's rate, 120 frames a second
  on a 120 Hz screen against 5 with the steam stopped (its coffee hidden); now 24.
- **The macro, twice as far.** The push on the drawer unit's corner runs 420 -> 210 mm (it was 210 -> 105) in all three
  mounts' grammars, its frame about 52 mm tall at the end. The trade, for Joey: the layer lines draw only where a 0.2 mm
  layer spans 4 CSS px, so at the macro's end they now come on only on a canvas about 1,003 CSS px tall or more (4.30 px
  a layer at 1080, 3.99 at 1000, 3.19 at 800, 2.87 at 720; before, from about 493 px, computed from its 5.84 at 720).
  The relief case moved to 1280 x 1080 to keep its variants apart (2.16, 2.87 and 4.30 px at the push's start, middle
  and end).
- **Review.** Sol `01a174d3`. Round 1: three findings, all held: the kept bake could stand in for a newer one; the
  steam's beat ran 20 a second at 60 Hz (it restarted its interval at each tick); three of the case's lower bounds
  assumed a GPU's frame rate. From its answers, also taken: the Very High signature carries fov and zoom, the sheen's two
  frames hide the steam, and a comment no longer says the gutters stay exactly as baked through a lossy encode. Kept: the
  capture's one-step lag (above). Round 2: one finding, held: a missing kept copy under a record would have smoothed
  twice; refused now. And the case counts the steam's calls for a frame, which a slow runner's frame count cannot show.
  Round 3: no findings.
- **Checks.** Three existing e2e checks had gone stale against the edge fix: two Done cases' shared `masksPlaced` and the
  mount case's wall catcher still expected the old extents. The mutation runs found them: those cases failed unmutated, so
  every mutant run against them "died" at the same stale assertion (20 of the mount list's 27 at one line). The tree
  runner now runs each list's case unmutated first and skips a list whose case fails.
  Then every Done mutant list, each with its case run unmutated first: 157 killed, each at its own assertion. The
  sheen, steam and beat list is 33, new, 17 of them on the steam; the edge list 6, new. Re-run: mount 27, colours 17,
  the scene's 7, the cuts' 2, the clamp's 4 (k3, the fov widening, by the unit tests: that runner runs only an e2e case),
  the first Done case's 6 and its two shell lists' 9. From the first round, their cases untouched since: lens 19,
  grammar 14, warm 10.
  - The re-run also found that mutants.mjs's m1 had been editing the colour change's hold, not the entry's. The call
    has appeared twice since the colours; the colours case now checks that the stage holds each new capture (m1b), and
    the runners refuse an anchor that is not unique.
  - Two survive, both older than this batch: m5, the entrance's own relief decision, which only makes the relief draw
    unseen during the 3 s entrance and in Colors' Room stage; and s3, tick's waiting guard, which freeze's guard covers
    (both removed, s4, dies).
  - 16 mutants of the older lists lost their anchors in the 10-24 grammar rewrite, before this batch.
  On the final code: the whole e2e suite 94 of 94. npm test: 654 tests, 648 pass, 5 skipped and 1 failing on the
  machine, not the batch. test/adhesive-foot.test.mjs reads gen2-parts' parts/, where another session's untracked
  parts/skin/ folder (made at 15:34 that day) reads as a collection pool with no feet.
- **Not done.** Not deployed: the branch is done-scene, behind `?done=room`. Next: Joey's idea of a slow zoom or pan on
  the still shots, done on the finished picture without drawing the scene again.

## 2026-10-25 (the Done scene: the still shots drift, the picture pushed in or slid without the scene drawn again)

- **The ask.** Joey, 2026-10-25: "maybe on static screens, like would it be possible to slowly zoom in or out slightly,
  like without it rerendering the scene, kind of like cropping or expanding or panning an image? just as an alternative
  to always sitting still, maybe this would work on low end pc's as well where we aren't moving the camera, but can
  cheat a movement appearance this way?"
- **What it does.** A shot that does not move has its finished picture slowly pushed in, pulled out or slid across while
  it is on screen. That is every shot of the still grammar (Fast, Balanced, a device judged slow) and the still shots
  of the moving one (on High and Very High the hero, low, detail and top).
  - The mechanism: a CSS transform on the canvas, animated by the browser's compositor (the Web Animations API, transform
    only), 1.045 at most over the shot's time on screen (dip-in, hold and dip-out), eased.
  - It works about the build's place in the frame: its centre projected, held to the frame's middle 60 %.
  - The hero pushes in. The others turn through push in, slide left, pull out and slide right by their place among the
    visit's drifts.
  - A slide holds the scale and uses 70 % of the reach that scale covers, so the canvas's edge never shows (done-fit.js
    `driftFor`: with scale(s) translate(t) about an origin o, the edges stay out of view while t lies within
    -(1 - o)(s - 1)/s .. o(s - 1)/s).
  - The canvas's box clips it, so the cinema bars and the strip stay put.
  - It ends in the black before the next shot, on a resize (about the old framing it would carry the build off its
    place), and on leaving, when the canvas's own origin and its box's overflow are put back. It pauses with the tab
    and never runs under reduced motion.
- **What it costs.** The drift draws nothing of its own; the stage's frames are what they were. On Fast at 1280 x 720,
  the held hero drew 1 frame a second (the idle gate's safety net) while its picture grew from 1.002 to 1.040 over 4 s,
  and a screencast painted it at 67 frames a second. A canvas export (toDataURL) shows the frame as drawn, without the
  drift.
- **Review.** Sol `01a17503`, two rounds. Round 1: two findings and points from its answers.
  - Held: the resize case (a resize now ends the drift); the canvas's own transform-origin, now restored; and the comment
    that counted shots where the code counts drifts.
  - Partly not a defect: the count does start over each visit (the drift's state lives in enterDoneScene's closure).
    The case now re-enters to check it.
  - Round 2: no findings.
- **Checks.**
  - Unit: every kind keeps the canvas's edges out of view about origins across the frame; also the reach, the kinds'
    turn, and the transform's text.
  - The e2e case, on Fast: the push in, the frames drawn, the origin, the clip, the next shot's own drift, a resize,
    leaving, and a second visit's count. On High: a moving shot has none, a still one does. Under reduced motion: none.
  - Mutants: 14 of 14 killed, each at its own assertion, the case and the unit tests run unmutated first (5 by the
    unit tests: the scale, the slide past its reach, the reach without its scale, the kinds' turn, the slides swapped).
  - The whole e2e suite: 95 of 95. The done-fit unit tests: 30 of 30.
- **The strength, Joey's call.** Shown the clip of the hero's push at 1.045 and offered about 7 % instead, Joey: "The
  drift strength looks right, keep it at 4.5%." (2026-10-25). 1.045 stays.
- **Not done.** Not deployed: behind `?done=room`. A low-end device's cost is not measured: the A5000 laptop shows that
  the drift does not depend on the scene's drawing, not what a weak GPU pays to composite it.

## 2026-10-25 (the Done scene: the drift doubled, none on Very High, no frozen steam over it)

- **The ask.** Joey, having kept 1.045: "actually yeah maybe try double that, also another thing that feels odd on the
  zoomed shots like this, maybe we omit the steam from the coffee on those because it's the obvious dead giveaway that
  it's a static image, but on very high we never use this static image zoom feature, what do you think?"
- **Doubled.** DRIFT.scale 1.09. The edge guarantee holds at any scale (a slide uses 0.7 of the reach the scale covers).
- **None on Very High** (done-fit.js `driftWanted`). Its still shots are its converged pictures, the lens's bokeh among
  them, which a zoom of the finished frame would only soften; it has the moving shots for motion; and its steam holds
  still through a still shot. A change to Very High mid-shot ends the drift on screen (onQuality).
- **The steam, only where it moves** (done-fit.js `steamShown`). Not drawn on Fast, where it cannot move and every shot
  drifts: a frozen wisp in a zooming picture gave the picture away. It is hidden from the entrance on, so it does not
  vanish on screen when the first drift begins. On High and Balanced it keeps rising inside the zooming picture, which
  reads as live, not as a still. Under reduced motion nothing drifts and the still wisp stays. Colors' Room stage, which
  runs no grammar and never drifts, keeps it on Fast too. Its visibility is set when the steam is made, so Fast's first
  frame has none. It is set again only on a tier change that flips the answer, from the tier hook before the new tier's
  first frame; never every frame, since the e2e hides the steam by hand for its frame comparisons.
- **Review.** Terra `01a1755a`, four rounds.
  - Round 1: one finding, the steam hidden on Fast where nothing drifts. It held for Colors' Room stage, now drawn there.
    Kept as designed: Assemble's 3 s entrance on Fast (see above), and a device judged slow, whose still shots do drift.
  - Round 2: a hand hide before the steam's first frame would be undone. That state is not reached, but its root, the
    first frame on Fast drawing the steam, was fixed.
  - Round 3: a High -> Fast change could draw one frame with the old steam. The tier hook now applies it.
  - Round 4: no findings.
- **Checks.** Clips `drift/clip-v2/` (Fast with no steam, High with the steam rising through the zoom) and the sheet
  `drift/clip-v2/drift-9pct-sheet.png`.
  - Mutants: the drift list, now 22, all killed, each at its own assertion. That includes the new ones: drift on Very
    High, a change to it keeping the drift, the steam on Fast, the steam nowhere, the scene's grammar ignored, Colors
    told it drifts, and the visibility not applied on a tier change. That last one survived the drift case: the steam's
    visibility is set when it is made. The steam case now checks it after its High -> Fast -> Very High changes.
  - The steam and sheen list, 33 of 33.
  - The whole e2e suite: 95 of 95. The done-fit unit tests: 31 of 31.
- **Not done.** Not deployed: behind `?done=room`.

## 2026-10-25 (the Done scene: the desk's own bounce, so a recoloured desk lights the room as it would)

- **The ask.** Shown that a plain desk colour left the rest of the room lit by the oak (a white desk 1.3 to 2.1 display
  levels too dark against a true re-bake: the entry "the visitor's wall and desk colours"), Joey: "Yes, model the desk's own bounce next: a dark-desk
  bake on node0 and its atlas tiles." (2026-10-25).
- **The model.** The same straight line as the walls', in the desk's albedo d: a second bake with the desk top near-black
  (bake5-darkdesk, `--desk-hex #010101 --light-maps desk_top`; Cycles bakes no light pass on #000000) gives every
  surface's D_d = L(oak desk) - L(black desk), a second set of tiles in the same atlas (`bounce.desk.meshes`), which the
  planner blends by the desk's WEIGHT u = d / d0: d the plain colour times the desk's diffuse share, or the tint's; d0
  the oak as baked (room.json light.desk_top.albedo, the median of its bake over its light). The desk top takes its own
  bounce back from the room: 'desk_top:light' (its light with the oak less its light with a black desk) under a plain
  colour, and 'desk_top' (that times the veneer's albedo, texel by texel: Sol `01a1757b`, round 1) under a tint. A colour
  brighter than the oak weighs more than 1 and ADDS the bounce the oak did not have (white: 1.12 / 1.43 / 1.85 in r/g/b).
  The oak weighs 1: the bake exactly.
- **The desk's diffuse share.** A plain desk draws colour x share x light: the share is 0.9693 (bake5-whiteshare, a plain
  #f2f1ec desk with its light-only map: its baked albedo over the colour; the Principled BSDF's coat at spec 0.4 takes
  3.07 %, against the walls' 1.27 % at spec 0.3). Walnut carries it too, as its weight does.
- **The atlas.** The desk's tiles at a quarter of the walls' texels (8 x 8 blocks, 4 x 4 for maps of 256 px and under;
  at the walls' factors they tripled the file to 412,708 bytes, mostly the two bakes' noise), and a tile whose brightest
  0.1 % is under 0.002 linear left out (coffee, desk_leg_r, monitor_base, monitor_neck, monitor_screen: 6 KB). 1024 x 952,
  127,432 bytes -> 1024 x 1088, 209,002 bytes; 39 + 34 tiles. Built at the walls' factors instead (398,724 bytes) every
  statistic against the truth below agrees to 0.1 level, so the quarter stays.
- **Measured against true re-bakes** (drawn by the planner as it draws the shipped room; 1600 x 900, High; the mean
  signed difference in display levels, planner minus truth, hero / low / top; then the rest of the frame outside the
  desk top; `colours/truth3/` and `colours/scripts/` in the Done scene's output folder):
  - A #f2f1ec desk (bake5-whiteshare): the rest of the room -0.1 / -0.1 / -0.1 (before: -1.3 / -2.1 / -1.3, blue -1.9
    to -3.2). Its top +1.7 / +0.2 / +0.1.
  - The Black desk, #2a2b2d (bake5-blackdesk): the rest -0.1 / +0.5 / -0.1. Its top +20.5 / +24.6 / +9.1: the sheen
    (the entry "the shadows on down the wall, smoother walls, a plain desk's sheen", 074abae), which the diffuse-only truth has not; the truth's black desk is a matte void.
  - A navy wall AND the #f2f1ec desk (bake5-navywhite): the rest -0.7 / -1.6 / -0.0. The two bounces are blended as
    independent lines; the light that meets both the desk and the walls is in neither. Stated as the limit; a fourth
    bake (black walls and black desk) would give the cross term, not worth it at these magnitudes (Sol `01a1757b`).
  - The default colours against the shipped room: 0.0 / 0.0 / 0.0.
- **Cost.** +82 KB (the atlas); the room.json +6 KB. The entry over a throttled line (80 ms, 10 Mbit/s; 4 runs each,
  the same worktree, one after the other): 1678 ms with the walls' atlas alone, 1895 ms with the desk's tiles in it.
- **Review.** Sol `01a1757b`. Round 1: one finding, held: the tint tile under the oak used the median albedo, which
  took too much off the dark grain and too little off the bright where the desk gets light back; the tile carries the veneer's albedo
  texel by texel now. From its answers: a frame check that bounds the desk term's magnitude (a doubled term passed every
  uniform check and the direction), and the factor-4 against factor-8 comparison. Round 2: no findings; the comment that recorded the
  median's error had its direction reversed, corrected.
- **Checks.** The colours case passes with its new bounds (22 s). Desk mutants against it: D2 to D7 and D9 killed,
  each at its own assertion; D8 (dk not multiplied by the material's base) equivalent on this room, every baked
  material's emissive factor being white, as the wall set's k. The whole e2e suite 95 of 95. npm test 656: 650 pass, 5
  skipped, 1 fail in test/adhesive-foot.test.mjs (parts/skin/Tabletop-Kit-Foot.lib.glb missing: another session's
  untracked gen2-parts/parts/skin/ folder reads as a parts pool, the failure the 18:30 entry records; it fails on the
  done-scene worktree the same way, 2026-10-25).
- **Not deployed:** the branch is desk-bounce from done-scene 91c39f8 (the done-scene worktree held another session's
  uncommitted work in the same files), behind `?done=room`.

## 2026-10-25 — The Done scene: every shot moves, four new shots, the strip rests, no callouts, the mug's print

Joey's round, on his own build in the scene (two screenshots, both with the W / H / L callouts showing): "hide the
buttons on the bottom of the screen until the user moves their mouse or hits a keyboard button, and if they hit esc
maybe it goes back to the final step in the instructions"; "i don't want the measurements to ever be visible in this
final scene, if they are on i want them to turn off for it"; "There are a lot of frozen views and the coffee steam is
frozen because its a panning or zooming image. on this computer that is powerful i don't think it ever going to the
still images"; "more creative camera angles and effects ... panning close up, focusing on specific things, like if they
add a custom label, cool looking parts like an edgelabel handle, maybe zooming out while moving the camera closer or
vise versa, or maybe starting a stationary scene out of focus and ending with it focused on a part of the build". He
pasted Astra's notes on a shot library (signature-label reveal, handle glide, detail-to-whole pullback, gentle dolly
zoom, focus reveal; subjects found from the build; no recent repeats). Then: "can the coffee mug feature my jerrari logo,
as if it were print on it like a real coffee mug. It would be funny to have something on the backside that is hard to
see, like 'WORLDS BEST 3D PRINTED STORAGE SYSTEM'", and "can we make my logo much bigger on the mug?"

- **No callouts while the room holds the stage** (main.js holdScene / setDims). The scene turned them off once at entry,
  and a later setDims on the finished step (a page's own, a drawer focus ending) put them back. Now a held scene records
  setDims's wish and draws none; the release puts back the last wish. The scene's own setDims calls are gone.
- **The strip rests** (assemble.js stripWake; css/app.css `html.scene-idle`): faded out with the pointer after 2.5 s
  without a pointer, wheel or key, back on any; not while the colours panel is open, the pointer is over the strip or a
  key has focus on one of its buttons. Opacity only, so it keeps its place. **Esc already went Back** to the End page
  (the instructions' last page, where "Watch the final scene" is); unchanged.
- **Every shot moves** where the device moves the camera (High and Very High; grammarMode 'full'). The four shots that
  held (hero, low, detail, top; wide for the hanging mounts) drift about the pose they held (done-fit.js `around`), so the
  still grammar (Balanced, Fast, a slow device), which locks every shot off at the middle of its move, shows what it
  always did, with the CSS drift as before. On High the steam rose over a held, drifting shot; on Very High a held shot
  converged and its steam stood still. Moving, both are live.
  - **The cost: Very High's bokeh no longer shows in a visit.** The lens is drawn by the accumulator, which runs only
    while the camera is still; no shot is still now. The scene's lens code is kept (a held shot still gets one: the
    debug `hold` timing, which the lens and steam e2e use), so holding Very High's shots again is one line. A live
    depth of field (a depth pass and a gather blur) would bring a lens to moving shots; not built.
- **Four new shots** (done-fit.js GRAMMAR, all three mounts; tabletop 12 shots, 11 without words on any drawer):
  - `label`: a slow glide across one of the visitor's own labels (a unit with a `label` and a Label part,
    stage.unitPartBox), fitted to the label's box, a different worded drawer each time round, **straight after the hero
    on the first cycle**; it opens soft and sharpens as it fades in (`focusIn`: a CSS blur on the canvas, 7 px to none
    over the dip-in and 1.8 s; the whole frame, not a depth). Dropped from a build with no words (Joey's own build has
    EdgeLabel label parts with no words on them, so he will not see it until a drawer is named).
  - `glide`: a close truck (320 mm, 20 deg lens) along the fronts' top row of label parts and handles (done-fit.js
    rowOf: the boxes within 6 mm of the highest; the build's front without any).
  - `pullback`: from 150 mm off the drawer unit's faceplate corner out to the whole build, the two ends fitted on their
    own terms and blended, the distance geometrically (blendShot).
  - `dolly`: the dolly zoom, 40 deg to 22 deg with the build's share held, so the camera backs off as the lens narrows
    and the room closes in behind it.
  - `slide`, `label`, `glide` and `dolly` run either way (`reversible`, by a second random source, so the plan's order is
    the seed's whatever the turns).
- **The mug's print** (done.js makeMugPrint): two bands of the mug's cylinder 0.15 % proud of it, multiplied over the
  baked mug (the props' masks' CustomBlending), so the bake's shading carries through the ink and white is no print.
  The logo (img/jerrari-logo.svg, the mark) 70 mm tall on the 96 mm mug (first 40; Joey: "much bigger"), facing the
  room; on the back, toward the wall, "WORLD'S BEST / 3D PRINTED / STORAGE SYSTEM" in a heavy face, dark grey (the
  apostrophe added). Children of the mug; taken off it on leave (the GLB is cached).
- **Not done:** a focus that picks a depth (a rack focus from one drawer to another) needs the live depth of field
  above. The development read-out Astra suggested (render mode, shot name, frame time) is `?debug=1`'s
  `__GEN2_DONE__.sequence` and not drawn on screen.

## 2026-10-25 — The Done scene's mugs: the print in the glaze, a second mug, the build's own sayings, gloss, thinner steam

Joey, after the first print: "this steam against that dark background feels a bit overpowering"; "maybe a second empty mug
next to it, kind of turned so you might catch one side or the other at certain angles, make it grey like our website
background, with the square modulith logo, on the other side text that is stacked" ("NEED DRAWER / PRINT DRAWER" x6);
"It would be fun to randomize the mugs a bit, maybe they are randomly in different spots each new build with different
sayings or slogans. and every so often the camera focuses on them"; "or like the I<3NY ... 'I<3 MODULAR STORAGE SYSTEMS'";
"a mug is usually very glossy"; "for the text on the mugs, make sure we are scaling them up to use a decent amount of space
like a real mug". Astra supplied sayings and pairs, and fonts (Anton, Barlow Condensed, Space Mono).

- **The print is in the glaze** (done.js glaze, MUG_PRINT_GLSL), replacing the two multiplied bands of the morning: the
  mug's own material reads a wrap-round print (2048 px round the circumference) by the angle about its axis and the height,
  and multiplies the bake by the glaze's colour, or the ink's where there is ink. So light ink on a dark glaze works, which
  a multiply over the bake cannot do. The angle's derivatives are taken from the position, not from atan, so the print's
  seam at the back picks no wrong mip.
- **Gloss:** both mugs get the desk's sheen (addSheen: Schlick, F0 0.04, the room's environment) at roughness 0.12.
- **The second mug** (makeMugs): the coffee mug's mesh again (its bake fits anywhere on the desk), the handle turned about
  the axis by the plan's turn and the print turned with it, the coffee mug's own shadow mask again under it. It stands at
  a spot on rings 170 to 260 mm round the coffee (the handles reach 84 mm from their axes: Sol 01a17612) (done-fit.js mugSpots): clear of every prop and of the build, off the
  desk's edge, never in front of the coffee. With no spot free, no second mug and no mugs' shot.
- **The build's own mugs** (done-fit.js MUGS, mugPlan, hashSeed): the build link's FNV-1a seed picks each mug's saying (a
  pair from Astra's list a quarter of the time), the second mug's turn and its spot. The same build always shows the same
  mugs; another build shows others. JERRARI's coffee mug (white, the logo 70 mm tall) carries 8 sayings, MODULITH's
  (glaze #4A4C54, a little lighter than the site's #2C2D31 since it multiplies the bake; paper ink; the square logo 54 mm
  tall, img/modulith-square.svg from the site) carries 9, Joey's NEED DRAWER and the I ♥ MODULAR STORAGE SYSTEMS among
  them. `accent` lines draw in the brand orange.
- **Type:** the planner's own faces, so no download: Archivo Black at its narrowest (for Barlow Condensed and Anton's
  role), at its own width, or IBM Plex Mono 600 (for Space Mono's). The block takes 28 % of the way round (about 100 deg)
  and 80 % of the height, one size for its lines, the largest that fits; stacks of five lines or more are set tight.
  The saying draws once its face has loaded.
- **The mugs' shot:** a slow arc on both mugs, fitted to them, coming into focus, in about half the cycles
  (MUG_SHOT_SHARE).
- **Steam:** sheets 0.6 to 0.38 alpha, mist 0.16 to 0.11.
- **The coffee moves too** (Joey: "the mug could randomly be placed by the plan on the left side sometimes, also can the
  white Jerrari Mug randomly be placed sometimes too, even though it has steaming coffee in it?"): in 60 % of builds
  (MUG_HOME_SHARE 0.4 stay home, where the room was composed round them) the coffee mug, its handle and its coffee (the
  steam with it) stand at a free spot anywhere on the desk (done-fit.js deskSpots: a 30 mm grid, the props and the build
  cleared, and the desk in front of the build kept clear so no mug stands between the shots and the build), its shadow
  mask moved with it; only a spot with room for the second mug beside it, and where both masks stay on the desk (its
  ends, front and back). A mask the slide already cut at a desk end keeps the coffee home and makes no second mug. The visit's own clone of the room is moved, the
  cached load never.
- **Astra's saying** "I WAS LEFT / UNSUPERVISED / WITH CALIPERS" joins the coffee mug, UNSUPERVISED orange and 1.4 times
  the others (`scale`, a line's size against the others; sayingLayout counts it in the height and the width).
- **The left side** (Joey: "the mug could randomly be placed by the plan on the left side sometimes"): the plant and the
  notebook leave no room left of the build, so 40 % of the builds whose coffee moves (MUG_LEFT_SHARE) take the notebook
  and its pen off the desk, their shadow with them, and both mugs stand left of the build. A moved mug stands no nearer
  the front than its home (one placed there left the hero's frame). The condensed face keeps its word spaces open (0.2 em).
- **Both mugs turn** (Joey: "randomize the rotation of the Jerrari mug as well"): each by the plan's turn, the handle
  about the mug's axis and the print with it; only for an upright mug (the room's is). Astra's "DESIGN A DRAWER, / THEY
  SAID. / I MAY HAVE / MISUNDERSTOOD / THE SCOPE." joins the coffee mug: three levels after a gap (an empty line), the last
  two orange, THE SCOPE. the biggest.
- **Review.** Sol `01a17612`. Round 1, four findings: the cloned mask losing its rotation discarded (the quads lie flat
  by their geometry's rotation, which the clone shares); the two mugs able to meet accepted (the rings from 170 mm: the
  handles reach 84 mm from their axes); a tilted mug's handle turning about the wrong axis partly accepted (the room's mug
  is upright; turns only for an upright mug); the mugs' shot without a subject when the second mug found no room
  accepted (the coffee alone). Round 2, two findings, both accepted: the mask's back edge unchecked; a mask cut by the
  slide cloned under the second mug (no second mug then). Round 3, on the left side (the notebook taken off the desk for
  a build whose mugs go left: the desk's left has no free spot otherwise), one finding, accepted: a notebook put back
  (no left spot after all) was not put back among the obstacles. Found by the e2e, not the review: a moved coffee carried a mask
  the slide had cut 140 mm past the desk's end (the 12W build).
- **Checks.** Unit 34 of 34. The e2e cases the change touches: the room's entry, the prop shadows, the grammar (three
  runs), the relief, the mounts, the colours, the steam, the strip and mugs case; all pass. Once, before the mask fix, the
  grammar case's Next-view-during-the-entrance check found the camera 33 mm off the shot's pose; not seen in three runs
  since. Not deployed.

## 2026-10-25 — The Done scene's mugs: none to three, anywhere free; Astra's four refinements; the low shot looks up again

Joey: "maybe sometimes there's no mugs, other times there might be two or 3 mugs, they don't have to be grouped together
either, their position and rotation could be pretty random as long as they don't block the build or clip into any other
objects". Then Astra's review of the shots: give longer jokes more room ("use more deliberate line breaks - even if that
means fewer words"), "Avoid the mugs hiding each other ... judge overlap from the intended camera position", "Keep mug
close-ups as occasional discoveries ... build -> detail -> mug joke -> build", "Soften the build's wall shadow a little",
and "For the joke shots, let the camera settle briefly with the text sharp".

- **How many, which, where** (done-fit.js mugPlan, MUG_COUNTS, pickSpots): the build link's seed picks 0, 1, 2 or 3 mugs
  (15 / 30 / 35 / 20 % of builds), each its own look (JERRARI's white, MODULITH's charcoal, MODULITH's white with charcoal
  ink: MUG_LOOKS), saying (its look's voice; no saying twice in a row; Astra's pairs on the first two a quarter of the time
  where there are two or more), turn and spot. The first holds the coffee and its steam. The spots: anywhere free on the
  desk (deskSpots: every prop, the build, and the desk in front of the build kept clear), no nearer the front than the
  coffee's home, each mug's shadow mask on the desk, 170 mm from every other mug, and none hiding another from the hero's
  camera (apartFrom: their angle at the camera over 1.15 times their two angular widths). No mugs: the room's mug, its
  coffee and its shadow off the desk, and no mugs' shot. A mask the slide already cut keeps one mug at home.
- **The notebook off the desk** in 35 % of builds (NOTEBOOK_OFF_SHARE), its pen and shadow with it: the desk's left has no
  room for a mug otherwise. Independent of the mugs: a build may have neither.
- **Longer jokes**: the block a third of the way round (the face a front view reads) and 82 % of the height; seven sayings
  rebroken short, none over 20 characters ("I MADE A THING / TO HOLD / THE THINGS / I MAKE / THINGS WITH.", "DO NOT /
  DISTURB. / FIXING THINGS / THAT WORK.", "FINAL / FINAL 2 / FINAL 2 FIXED / FINAL 3", ...), with orange punchlines.
- **The mugs' shot**: one mug each time round (one whose saying faces the room where there is one), its arc turned about
  that face (mugFace: the saying within 65 deg of the room's front, else the logo, the turn clamped to 50 deg), its move
  done by 65 % of the visible time and at rest after (`settle`), coming into focus; always just before a view of the whole
  build (BUILD_VIEWS), never first or last.
- **The wall's shadow** lighter: 0.42 to 0.34 opacity on the wall's catcher, the desk's unchanged. Its edge stays the
  room's 1 deg sun (Joey 2026-10-23: at 6 deg it "faded to a faint gradient beside the props' crisp baked ones").
- **The low shot looks up again.** The stage's orbit floor (maxPolarAngle 0.52 pi on a desk build) is applied by
  controls.update() to every camera the scene puts, and it lifted the low shot, which aims from 7 deg below, to 3.6 deg
  below. The scene lifts it while it holds the camera (no orbit) and puts it back on leave; Colors' room stage keeps it.
  Found by the grammar e2e: twice the camera 33 mm over the low shot's fit, whenever the plan put the low shot second
  (the earlier "Next view during the entrance" flake).
- **The e2e** keep the room as composed by default: with ?debug, ?mugs=home is one JERRARI mug at home and the notebook on
  (the helper adds it to a scene case that asks for nothing else); ?mugs=N forces a count; ?mugs=plan is the link's own.
- **A mug turns whole**: its body turns with its handle and its bake. A print turned alone left the bake's handle joints
  behind, two dark marks beside the logo (seen in the first shots of this round); the bake's lit side now turns with the
  mug, a smaller wrong on a white cylinder.
- **Review.** Sol `01a17643`, three findings, all discarded on the code: mugFace's null is read through `f ? f.side :
  null` (the payload abbreviated it); the first mug's fall-back to home is the spot the props' slide already cleared of the
  build (the slide hides the mug group when it cannot); the coffee is the mug's sibling in the room, not its child, so it
  moves once (the shots show it in the cup after a move).
- **Checks.** Unit 34 of 34. The Done scene's e2e cases, 15 of 15 (the strip-and-mugs case at ?mugs=3; the kits' own
  plans: three on the 165 3W kit with the notebook off, none on the 115 3W kit). Not deployed.

## 2026-10-26 — The Done scene's mugs: Astra's new sayings and milestones, the glaze lit, no cropped mug in the close-up

Astra, on the sheet of 2026-10-25: "I ♥ MODULAR STORAGE SYSTEMS has the best readability ... Use that as the benchmark";
"The white mug texture is a little heavy in close-up. It reads more like rough stoneware than glazed ceramic"; "The cropped
mug behind the foreground mug is distracting ... Fix this through the close-up framing or target selection"; "don't use
one automatic text layout for all of them. Give each a small, deliberate composition"; and a list of sayings by voice, with
milestones: "Milestones unlock sayings into the eligible pool; they don't force the same joke every time. Use actual drawer
count for {N}, overall dimensions for tall or wide builds, and occupied grid units for build size". Joey passed them on.

- **New sayings**, each with its own composition (face, emphasis, sizes, gaps): JERRARI's "IN MY DEFENSE, / I HAD ACCESS /
  TO CAD." (mono, CAD. large and orange), "I WAS NORMAL / BEFORE I OWNED / A 3D PRINTER.", "THIS IS WHAT / HAPPENS WHEN /
  THE PROTOTYPE / WORKS.", "GOT FILAMENT? / I HAVE PLANS." (two blocks with a gap); MODULITH's "I CAME. / I SAW. / I PRINT
  DRAWER." and "THOSE SPOOLS / AREN'T GOING TO / BECOME DRAWERS / THEMSELVES.".
- **Milestones** (done-fit.js MUG_MILESTONES, buildFacts, unlockedSayings): from the build's units (grid cells = width x
  half-rows / 2), its drawers, its labels and its size. Small (4 cells or fewer), medium (5-12), large (13+), very large
  (30+ cells or 900 mm wide), tall (350 mm+), "{N} DRAWERS." (8+, the real count), every drawer named (2+), and DESIGN A
  DRAWER ... THE SCOPE. moved from the open pool to large or elaborate builds. They join the voice's pool; no milestone
  twice on a desk. Many colours is not one: the build has no simple colour count to read yet.
- **The glaze lit, not read from the bake** (done.js MUG_LIGHT_GLSL): the bake's speckle and the dark lines at its four UV
  seams (measured at -7.5, 82.5, 172.5 and -97.5 deg; a turned mug swings them into view) made it stoneware. The outer wall
  and the handle take the bake's mean (its last mip) times MUG_GAIN 2.0 for the level, a wrap of the room's sun across the
  world normal for the shape, and a darker foot; lit from the right side however the mug is turned. The inside keeps its
  bake. A mip-biased blur of the bake was tried first: it softened the speckle and kept the seams.
- **The close-up never crops another mug**: the mugs' shot ranks each mug by whether any other one enters its frame (box
  against frustum, at nine points along the move) and by its saying facing the room; where none is alone, it frames the mug
  with the ones that would crop into it, and widens again until no further one enters. It faces the nearer of the saying
  and the logo (a side view was the shot of a mug turned 75 deg), the camera turned up to 70 deg toward it.
- **Review.** Sol `01a177c8`. Round 1, four findings: the fragment's `vMugP` undeclared discarded (the prefix declares
  it; the e2e renders the print); a centre in a cone instead of the frame, only the move's middle checked, and a grouped
  frame admitting a third mug accepted. Round 2, two: corners alone missing a straddling box accepted (box against
  frustum); three points along the move partly accepted (nine; not a proof over the continuous path, a mug's width spans
  several steps of the 36 deg arc).
- **Checks.** Unit 35 of 35. The strip-and-mugs, kits, grammar, relief, room and steam cases pass. Not deployed.

## 2026-10-26 — Filament spools: Joey's spool, its coil a shader, one per colour the build is printed in

Joey: "a 3d model of filament, we could even stack near or around the build and changes with the colors selected for the
build", then "I do have a spool i already designed in blender ... the filament is made from a spring like shape and either
might create too much geometry, or maybe there is a way you can generate that coil shape in a super efficient way like
whatever they did in these projects using simple shapes?" (erichlof's THREE.js PathTracing Renderer, whose round shapes are
analytic in the shader, not meshes). He copied the spool into its own file.

- **His spool, measured** (`Individual Spool Holder + Spool.blend`, "Filament Spool C", 200 mm across, 65 mm wide, 172,262
  vertices in five loose parts): the coil, one helix tube 1.76 mm thick wound once across the outside at r 89.6-91.4 mm,
  151,588 vertices (88 %), right-handed at a 1.80 mm pitch (phase coherence 0.60 at that pitch, 0.004 for any left-handed
  one); two flanges, 7,451 vertices each, 5 mm thick, r 30-100 with four slots; the drum under the coil, r 38.2-90 with
  rounded edges; the hub, r 35-38.
- **The flanges and hub kept, lightened** (`scenes/props/spool.glb`, 166 KB): the flat faces dissolved (1 deg), collapsed
  to 0.3, shaded smooth by 30 deg so the vertices are shared (flat-shaded, the same 7,438 triangles exported at 20,295
  vertices and 532 KB). Opaque, his material's dark grey (base 0.1 linear, roughness 0.45).
- **The coil as a shader** (`js/scenes/spool.js`): one drum (an open cylinder, 256 x 4, and two side rings), its
  MeshStandardMaterial's normal bent per pixel over a round strand of his winding (the outer face along the helix, the
  side faces in rings), a crease darkening between strands, and the pattern easing to a flat average where a strand spans
  under 4 px (at 2 px, none: the moire of the first try). Lit by the stage's lights like the build and casting a real
  shadow; on a tier with no shadow map, a contact disc under each. Several spools share the geometry.
- **On the desk** (done-fit.js spoolPlan, done.js makeSpools): one spool per colour the build is printed in
  (filamentsInBuild's filaments and its unpicked regions' colours, sorted, four at most), in 80 % of builds; the build's
  seed groups them into a stack lying flat (two or three high) and spools standing on their rims, each turned its own
  way; each group at a free spot of a spool's footprint (108 mm), the mugs' keep-clear (props, the build, the desk in front
  of it), 226 mm apart. Made before the mugs, which keep clear of them. With 200 mm spools and the desk's props, a desk
  usually takes one group: the rest are left out.
- **The Colors workspace's Room stage** runs the same scene: a committed pick repaints the spools (refreshSpools: a spool
  whose colour the build no longer wears takes one it newly does, or one it wears).
- **The e2e**: the helper adds ?spools=off to a scene case that asks for nothing else, as it adds ?mugs=home; the spools'
  case asks ?spools=plan.
- **To deploy:** `js/scenes/spool.js` is a new module, and the deploy's module-graph guard needs a stamping line for it
  in `.github/workflows/pages.yml`, which the planner-2 CI session owns: ask it before merging to main.
- **Review.** Sol `01a17823`, two findings, both discarded on the code: `loadSpool` called without its URL (its parameter
  defaults to the GLB; the spools render in the e2e); `setColor` not updating the stored colour (it does).
- **Checks.** Unit 36 of 36. The spools' case, the strip-and-mugs, kits, grammar, room, prop shadows, steam and Colors
  Room cases pass. Not deployed.
- **Room made for them** (Joey, the same day: "when the plan has more spool groups than fit, take the notebook (or
  another prop) off the desk to fit them"; and "there will always be filaments on the desk, because filament is always used
  in the build, at least 4 or 5 filaments more than likely, unless they only select a single color"): spools on every
  build now, five at most, stacked two or three high where the plan can (65 %). While groups are left out, the notebook,
  the calipers and the plant may leave the desk with their shadows (never the monitor): every way of clearing them is
  tried (eight) and the one that fits the most groups kept, of those the lightest (the notebook and the calipers both go
  before the plant). Every subset, because the seeded picks are not monotonic in the spots: on one kit, clearing all three
  placed two groups where the notebook and the plant placed three. The placed spools' boxes are precise (vertex) boxes: a
  turned cylinder's own box overstated a stack by a quarter, 262 mm for a 200 mm spool.
- **Review, rounds 2 and 3** (Sol `01a17823`): one finding, accepted (a spot that needs two props gone gained nothing from
  either alone: the clearing then cumulative, then every subset); round 3, no findings.
- **Mostly stacked, the plant kept** (Joey, the same day, of two stacks of two and of a stack with one standing: "i'd say
  just keep them stacked like this, you can even stack them in a single tall stack here and there, I'd like to keep the
  plant in there when we can, or even this one is fine."): one tall stack of every colour (up to five, 326 mm) in a
  quarter of builds (`SPOOL_TALL`), otherwise stacks of two or three, a single spool now and then (`SPOOL_STAND` 0.15,
  standing on its rim seven times in ten). Only the notebook and the calipers may leave for the spools now (every subset,
  the lightest that fits the most); the plant leaves only where no group fits at all, and then every subset is tried
  again with it off. A group left without room joins a placed stack (or turns a standing spool into one) up to five high,
  so the build's colours stay on the desk. Six kits shot (`D:\Claude - Output\done-scene-spools-2026-10-26\kits5`): the
  plant on every desk, the notebook off in three.
- **Repainting** now also parts two spools one colour had joined: a pick of one colour over the whole build paints every
  spool that colour, and a second colour after it takes one of them back (before, none was absent from the build, so none
  changed). The spools' case covers it and fails without the fix.
- **Review, rounds 4 to 6** (Sol `01a17823`): two findings, both accepted (the plant fallback hid the plant alone, missing
  a spot behind both the plant and the notebook; repainting never parted duplicates); round 6, no findings. Unit 36 of
  36; the spools' and the strip-and-mugs cases pass. Not deployed.
- **Stacks as hands leave them** (Joey, the same day: "can you make the stacked filament positioning slightly random and
  imperfect, like it's impossible to stack it that neatly"): `stackPoses` (done-fit.js) sets each spool lying flat in a
  stack 2.5 to 7 mm off the stack's axis (`SPOOL_SLIP`), at its own turn, leaned 0.45 to 1.5 degrees (`SPOOL_LEAN`, a
  warped flange's worth), and raised by exactly what the lean takes: each flange a plane, the most the one below rises over
  it found on the edge of where the two overlap (both rims sampled a degree apart), so every flange rests on the one below
  and none sinks into it. Its own seed per stack (`stack|<build>|<group>`), so the plan's spots and groups are as they were.
  The unit test checks it with exact rotations, independent of the linear model: resting within -0.15 to 0.6 mm over 300
  seeds of five, and every rim inside the spot's 108 mm; mutants (no second rim, no lift, twice the lift, no slip, an 8 mm
  slip) all fail it. Shots: `D:\Claude - Output\done-scene-spools-2026-10-26\stacks-imperfect`.
- **Review, round 7** (Sol `01a17823`): one finding, accepted: at 8 mm slip a leaned spool reached 108.8 mm, past the
  spot's 108 (`SPOOL_FOOT`); the slip is 7 mm now (107.8) rather than a bigger spot, which would move every build's spools.
  Round 8, no findings. Unit 37 of 37; the spools' and the strip-and-mugs cases pass. Not deployed.

## 2026-10-26 — Colors opens on the Room stage

- **Room first** (Joey, after trying the branch on his phone: "most people arent going to find this. What if when you
  select color it goes to this view instead, and then maybe there is a way to toggle back to the builder-like view if
  desired?"): with the room's flag on, Colors opens on Room; the Studio / Room toggle in the panel's head is the way back.
  A visitor who picks Studio keeps Studio in that browser (`gen2-colors-stage`, written only by the toggle); within a
  session the workspace memo still wins, so a room that fails to load falls back to Studio for the session and stores
  nothing. The studio stays the colour-accurate reference.
- **Still behind `?done=room`.** Visitors without the flag see neither the toggle nor the room; whether the flag comes off
  at deploy is Joey's call.
- **Checks.** The toggle's case now expects Room with no click and Studio kept across a reload; the failed-load case fails
  the module from the first request and checks nothing is stored. Mutants (the old default, no store) both fail it. The
  wall-and-desk and spools cases pass. Review: Sol `01a17823` round 9, no findings. Not deployed.

## 2026-10-26 — The room on for everyone; the orbit kept in the room

- **No flag** (Joey: "When it deploys, turn the room on for everyone: drop the ?done=room flag so every visitor gets the
  room in Colors and the final scene."): assemble.js and colors.js read `?done` as `room` when it is absent; `?done=off`
  turns the room off. done.js is still fetched only when a visitor asks for the scene at Done or Colors enters Room.
  The e2e `open()` helper adds `&done=off` to every case that does not ask for the room, so they keep the studio they
  were written for; the room's flag cases open as a visitor does (`{ visitor: true }`, no `done` in the address). The
  full e2e suite ran locally with it: 98 of 98. (The one unit failure, `adhesive-foot` wanting
  `parts/skin/Tabletop-Kit-Foot.lib.glb`, is this machine's parts junction missing the skin-map files, not this change.)
- **The orbit stays in the room** (Joey, the same hour: "i can spin it around and clip through the wall or zoom out a
  mile until the viewing distance makes everything disapear, maybe they can't move our zoom out of the room?"): on the
  Colors stage, every orbit or zoom pulls the camera in along its line to the build to the shots' own margins
  (`clampToInterior`: 150 mm off the walls and floor, 450 under the walls' top), then holds it inside them axis by axis
  (`insideRoom`, Sol `01a17823`: the pull's 0.05 floor could leave a far jump outside). The e2e zooms out 25 steps and
  turns half round behind the back wall: inside both times; without the listener it fails.
- **Review** Sol `01a17823` rounds 10 to 12: one finding, accepted (the floor); then no findings. Not deployed.

## 2026-10-26 — The steam keeps rising over Very High's still picture

- **Asked** (Joey: "is there any way after the user stop moving the camera and it switches over to the detailed render
  view that it doesn't freeze the coffee steam, maybe it becomes like a post-processing overlay or something?"). Before,
  Very High's steam moved only on the frames the camera's own move drew, so the accumulated picture held it still.
- **Rest overlays** (main.js THE REST OVERLAYS): `addAccOverlay({ objects, shown })`. On Very High an overlay is left out
  of every sample, so the mean holds only what is still, and drawn fresh over the blitted mean on each canvas frame,
  depth-tested against sample 0's depth (the pinhole, unjittered: copied once a burst into its own small target), so the
  mug and the build still hide it. The steam registers itself and, at rest on Very High, ticks at High's 24 frames a
  second, each tick one blit, one depth quad and the wisps, never a new sample. The depth target is made only once an
  overlay exists (no cost to a page without one) and its two shader variants are compiled then, so a cut never compiles
  them (the relief case's "the cut compiled nothing" caught 46 -> 48 without that).
- **Not under a lens.** A held shot with bokeh (the Done scene's still shots on Very High) keeps the steam in its samples
  and still, as before: a sharp wisp over a blurred mug would read wrong. The Colors stage has no lens, which is where
  Joey saw it.
- **Checks.** A new Colors case on Very High, converged: 36 ticks and 36 overlay draws in 1.5 s with no sample rendered;
  two frames 400 ms apart differ only round the steam; with the steam hidden the frame equals a mean rebuilt from scratch
  without it (0 px), so the steam is not in the samples. Mutants (no hiding in samples, overlay never live) fail it. The
  relief compile-ahead, lens, steam-rate, drift, spools, strip and Colors cases and smoke pass. Review: Sol `01a17823`
  round 13, no findings. Not deployed.

## 2026-10-26 — The Colors summary: one row a filament

- **Asked** (Joey, of "4 filaments used · Case, drawers: Cold White · Fronts: Dark Blue · Faceplate bodies: Cold White ·
  Handles: Aqua Blue · Deck, small parts: Dark Blue · Feet: PolyFlex TPU95 Black": "the way we list the used colors looks
  messy"). The run-on line named a filament once per run of neighbouring regions, so Cold White and Dark Blue came twice.
- **Now** (simplify.js `byFilament`, the same regions as `summarize`, which stays for its other readers): the count line,
  then one row a filament, its swatch, its short name (the full one on hover), and every region it prints under the name,
  the case's row first. Shots: `D:\Claude - Output\done-scene-spools-2026-10-26\summary`.
- **Checks.** A unit test (one row a filament, the same regions as the line, each row's own swatch, the control that the
  line repeats a filament); the Colors step 6 cases and the phone journey pass. Review: Sol `01a17823` round 14: one
  finding, discarded (it read the payload's shorthand, not the code); then no findings. Not deployed.

## 2026-10-26 — Colors: the build's colours first, Room | Neutral in the toolbar

- **Asked** (Joey, of the panel with the room on: "it also seems to default to the 'room' tab, I think users want to first
  select their builds color, and room color would be secondary ... under the room color tab, we still show the build
  preview and parts colors which feel like they should only be under the studio button, is studio the correct word?";
  then, of the proposal: "Yes: panel always leads with the build's colours, room wall/desk as a small section at the
  bottom only while the room shows, and the view switch moves to the toolbar as Room | Neutral."). The Studio | Room
  control at the top of the panel read as the panel's tabs; it only ever changed the backdrop.
- **Now.** The panel leads with the build's look, its filaments and its rows whatever the backdrop; the room's wall and desk
  are its last section, only while the room shows. The switch is the toolbar's, beside 3D | 2D, as **Room | Neutral** (not
  "Build", which is the first workspace tab's name; "Neutral" says what that view is for, judging colours on a plain,
  colour-accurate stage). The stored choice keeps its word (`studio`), so an earlier pick means the same.
- **Phone.** The bar fitted its 370 px exactly before; with the switch it overflowed by 14 px and squeezed the icons to
  20 px. On a phone the 3D-only chip (2D does nothing in Colors) and Explode's "comes later" give way to it: 44 px icons
  again, ending at 344 px. Shots: `D:\Claude - Output\done-scene-spools-2026-10-26\panel`.
- **Checks.** The switch's case asserts the toolbar's Room | Neutral, nothing in the panel head, the panel's order (head,
  look, ..., room last) and no room section under Neutral; a new phone case (nothing scrolled or off screen, every button
  at least 40 px) fails without the phone rule. The Colors room, step 6 and phone journey cases pass. Review: Sol
  `01a17823` round 15, no findings. Not deployed.

## 2026-10-26 — The spools follow the filaments; a spool changes its filament everywhere; the orbit stops at the wall

- **A spool a filament, kept so** (Joey, after adding a blue: "should we stack another filament on top of the stack when
  we do that"). `refreshSpools` (each Colors commit with the room on): a spool whose filament the build still wears keeps
  it; a spare takes one it newly wears, where it stands; a filament still without one goes on top of the lowest stack with
  room, or lays a standing spool down to start one; a spare left over leaves the desk, and an empty group with its disc.
  Stacks are posed from their own seed and `stackPoses` is the same spool for spool whatever the count, so a spool added
  on top moves none under it. Six at most now (`SPOOL_MAX`, `SPOOL_HIGH`: 391 mm), since Joey's build wears six.
- **Click a spool** (Joey: "what if i could select a spool and change it's color, and doing so would replace everything in
  the build that used that same color, kind of a handy feature"). On the Colors stage the pointer over a spool turns to a
  hand with a tooltip; a click opens the picker on that spool ("Spool · Black", what it prints), selecting no part; a pick
  changes every region printed in it (each filament picked in that colour, each region still in an instruction colour of
  it, the units' own picks too) in one undo step, and the spool follows. The feet's TPU is its own: its spool lists TPU
  only, and no other spool reaches the feet. A spool behind a prop, the desk or the build is not clickable through it (Sol
  `01a17823`: the stage hook now hands the owner the ray, and the room's own solid surfaces hide a spool).
- **The orbit stops at the wall** (Joey, the same hour: "if you spin the camera into the wall, i think it automatically
  zooms in super far like into the inside of the build"). The first bound pulled a camera past the margins in along its
  line to the build, which a spin into a wall turned into a dive into the model. Now a move that would leave the margins
  stops at the last place inside; the pull is kept only for a camera put outside by something else.
- **Checks.** The spools case (one filament over the build: a spool each for it and the TPU; a red then a blue: on top of
  a stack, each above the one under it, those under it unmoved); a new spool-click case (the pointer, the picker, no part
  selected, nothing left in the old colour, the spool changed, one undo restores it all); the orbit case now asserts the
  turn into the wall keeps its distance to the build (fails with the old pull). All 27 Colors cases pass. Review: Sol
  `01a17823` round 16, one finding accepted (occlusion), then no findings. Not deployed.

## 2026-10-26 — Showcase from Colors; spools glow; stacks to the ceiling; a stand-in view out of the window

- **Showcase** (Joey: "in the color tab, we should somehow also work in the final scene but call it something else, like
  that way after selecting your colors and stuff you can also view it in this way, or maybe if they let the screen sit
  for like 30 seconds?"). A Showcase button by the Colors panel's title plays the final scene in the colours just picked
  (Assemble's own scene, asked for through `ctx.memo.showcase`); its Back reads "← Back to Colors" and Esc goes there, to
  the room; Assemble's own place (the step a visitor left on) is kept. Starting it after 30 idle seconds is Joey's call,
  asked, not built.
- **Spools glow** (Joey: "when you hover over a filament and select a filament we should highlight it in some way so you
  know you can click it and when it is selected"): under the pointer a spool's filament is lit a little; with its picker
  open, lit more and its flanges warmed toward the picker's orange; the others not.
- **Stacks to the ceiling** (Joey, of ten filaments and six spools: "can we maybe just keep stacking them? like maybe a
  crazy limit of the ceiling?"): a spool for every filament, 32 at most; a stack grows to 150 mm under the walls' top, a
  spool every 72 mm (`stackCap`; Sol `01a17823`: 67 let opposing leans of 70.4 a spool carry a stack past the margin;
  unit-tested over 400 seeds and with every lean at its most, alternating).
- **The view out of the window** (Joey: "when i look outside i just see a dark void"): a painted daylight view on a plane
  1.8 m beyond the opening, facing in, horizon at eye height. A STAND-IN: Astra, on seeing it: "it looks like a blurred
  illustration stuck to the window"; replace it with a properly licensed photographic exterior (a restrained daylight
  garden or distant treeline, pale sky, slightly brighter and lower-contrast than the room, mostly sharp, no sun disc),
  covering every supported angle, checked from the cinematic paths and a sideways view; no automatic shot of an empty
  window; no exterior focus pull unless the photo holds up to it. Waiting on Joey for the photo (his own, or a CC0 one).
- **Checks.** A new Showcase case; the spool-click case checks the glow; the spools case stacks a filament a region past
  six, under the walls' margin. The Colors room, spools, steam, strip and Done cases pass. Review: Sol `01a17823` round
  17, one finding accepted (the step), then fixed and tested. Not deployed.
- **The view out of the window, from Joey's own photo, then ChatGPT's clean version of it** (`outside-photo.py chatgpt`: 1140 x 1694, all but the leaning pine at its right edge, nothing man-made, no patches). (the same day; he sent his garden, then: "what if we blurred it a
  bit, the trees are at a distance and super sharp, i think that feels off"). `scenes/home-office/outside.webp` (630 x
  1700, 35 KB) is the left of it, the lattice, house, tarps, fire pit and hoop patched over with the trees and lawn
  beside them, toned softer and a little brighter than the room, blurred 2.2 px, the lawn carried on below, and
  cross-faded at its edges so it repeats with no seam (a mirrored repeat read as a Rorschach blot). Made by
  `tools/done-scene/outside-photo.py`; his original stays out of the repo. A 24 m backdrop 1.5 m beyond the window, its
  lawn line at eye height, its top under the walls' top (the room has no ceiling: nothing of it shows over a wall), with a
  sky-coloured lid over the opening, so a look up through the window ends in sky. The back wall's mesh ran 1.4 m past
  the window wall, a white wall standing in the garden: what of the room passes that wall's outer face is clipped there
  while the room is on. Checked from a front, a low, a far-corner and a grazing side view
  (`D:\Claude - Output\done-scene-spools-2026-10-26\window9`). Still Joey's to improve: a wider, level shot (he offered to
  have ChatGPT make one from it). A new e2e case; Sol `01a17823` round 18, no findings.
- **Then ChatGPT's level panorama of the place** (Joey: "Will this work, so you need for ground or anything?"): 2172 x 724,
  a straight horizon, nothing man-made, used whole (`outside-photo.py panorama`: toned, blurred 2.2 px, the lawn carried
  on below, its edges cross-faded); at 2.8 mm a pixel it repeats every 5.7 m, so the window shows it once. Known: a thin
  dark sliver by the far jamb in a grazing side view along the wall, not yet traced.
- **The sliver traced and fixed** (Joey: "Proceed"): with the clear colour red it was the clear colour, at the camera's
  far plane (main.js: 8000 mm); a look along the wall skims the far jamb and meets the backdrop 8 m off and more. The room
  sets the far plane to 40 m while it is on and puts it back on leave (precision rests on the 1 mm near plane). Also, on
  the way: the sky lid starts inside the wall's thickness (it began at the frame's edge, 50 mm proud of the wall), and the
  backdrop's two ends are closed with the photo. Sol `01a17823` round 19, no findings.
- **Open: a flat backdrop foreshortens** (Joey: "Wouldn't a scene like that typically be more spherical to compensate for
  angles like that, like a sky map?", "Why do the trees looks squished though from that extreme angle?"): seen nearly
  edge-on, a flat picture squeezes. The standard answer, a dome or cylinder round the room, is blocked by the room having
  no ceiling: anything tall and far shows over its walls, which is why the backdrop stops at the walls' top. A ceiling
  first, then a cylinder, is the proposal.

## 2026-10-26 — The garden on a cylinder round the room, under a ceiling

- **Asked** (Joey: "Wouldn't a scene like that typically be more spherical to compensate for angles like that, like a sky
  map?", "Why do the trees looks squished though from that extreme angle?", then of the proposal: "Let's try it").
- **A ceiling** over the room's footprint at the walls' top (plain, facing down, not clipped). The room had none, so
  anything tall and far showed over its walls; a look over a wall now meets the ceiling first, and the high corner views
  see a ceiling, not the void.
- **The panorama on a cylinder** 9 m round the desk, four times round (2 pi R / (4 x 2022) = 7 mm a pixel, the scale its
  own field of view gives), its horizon row (the source's middle) at eye height, with a sky cap over it and a lawn under
  it; the file now carries 600 px more sky above (a flat cap had shown as a band where the photo ended). A cylinder round
  the eye faces it whichever way it looks: no foreshortened trees in a look along the wall.
- **Only through the window.** All of it is clipped to beyond the window wall's outer face; and where that wall's end
  is open (the room's front), the wall's plane carries on outward as a depth-only occluder (Sol `01a17823`: without it a
  look out of the open front past the wall's end found the garden; a clipping plane at that end instead cut looks through
  the window that ran on past it). Looks out of the open sides stay as they were.
- **Checks.** Shots from the front, low, far corner, high, grazing side, upward and out of the open front
  (`D:\Claude - Output\done-scene-spools-2026-10-26\cyl4`). The window case now tests the pieces, the clipping, the
  ceiling over the whole footprint, and rays: out of the open front the occluder, through the window both ways the garden.
  16 room and scene cases pass. Sol `01a17823` round 20: two findings accepted (the open end, then its first fix), then no
  findings. Not deployed.

## 2026-10-26 — The panorama once, placed from the room's cameras

- **Asked** (Astra, via Joey: "Use the image at its original proportions, with no mirrored repetition or flat-colour
  extension. Adjust its vertical position and scale from the actual room camera. The base of the trees is not the
  horizon; don't automatically align it with the viewer's eye level. Check a normal desk view and both oblique window
  views before adding blur. Keep the backdrop's edges outside those views.").
- **Now.** The 2172 x 724 panorama once, toned only (`outside-photo.py single`), on an arc of the 9 m cylinder exactly
  its own proportions (155 degrees x 8.1 m at 11.2 mm a pixel), no repeat, no added sky or lawn. Placed by rays traced
  through the window's opening from four views (straight on from the desk, the hero, an oblique either side): they need
  -62 to +13 degrees from the window's bearing and -1.9 to 5.6 m; the arc is centred at -25 degrees and its trees' base
  sits on the floor's level out there, about 8 degrees under the hero's eye. Checked sharp, then softened 1.8 px
  (`D:\Claude - Output\done-scene-spools-2026-10-26\single-sharp`, `single-soft`). The sky cap and lawn disc stay only as
  the fallback for views well above or below the desk, outside those four; out of the room's open front, still nothing.
- **Checks.** The window case: the photo whole, clamped, repeat 1, the arc at 3:1; every ray of an 11 x 11 grid through
  the opening from the four views lands inside the photo (fails at 8 mm a pixel); 16 room and scene cases pass. Sol
  `01a17823` round 21, no findings. Not deployed.
- **ChatGPT's 3:2 version** (Astra: "Increase the backdrop's vertical coverage while preserving its horizontal scale, then
  align the tree bases with their previous position. Don't squeeze the new image into the old backdrop height—that would
  shrink the trees. Check the highest and lowest supported camera views as well as the four existing views."): 1536 x
  1024 on the same 155-degree arc (15.8 mm a pixel, 16.2 m tall, twice the old height), its tree base (row 668) on the
  floor's level as before, blurred 1.3 px (the same in mm as 1.8 at 11.2). Covered by rays through the opening: the four
  views, the highest from either side (the back one 30 mm inside the photo's foot), and the lowest the orbit allows
  (desk level; tested lower, at -100 mm) from all three. OPEN (Sol `01a17823` round 22, accepted): the highest view
  straight on (1810 mm, 1.7 m from the window) runs 0.36 m under the photo's foot through the sill, onto the lawn
  fallback; at 1700 mm it is covered, but a camera nearer the window looks down more steeply still, and right by it
  nearly straight down at the ground outside, which no upright photo can show. Either the orbit is restricted (a lower
  height limit and a least distance from the window) or real ground outside is added (lawn from the photo's own grass,
  at its scale, from the wall to the photo's foot); asked.
- **Real ground was chosen and built** (a textured lawn disc at the floor's level from the photo's grass), **then the
  whole photographic exterior dropped** (Joey: "that window scene is pretty gross, maybe there is something more simple
  claude can do without an image?"; Astra: "the grass looks like a raised ledge immediately outside, while the trees look
  enormous and blurry ... I'd replace the exterior with a softly lit, frosted window"). The ground never landed.

## 2026-10-26 - Done scene: a frosted window; the final scene drawn at twice the screen

- **The window is frosted glass.** Astra's direction, as Joey passed it on: "Keep the existing frame and sill. Fill the
  opening with a pale, subtly cool translucent-looking pane, with a gentle daylight gradient and very restrained surface
  variation. No landscape, horizon, tree silhouettes, cloud blobs or image texture. Avoid a pure-white glowing
  rectangle." One unlit pane (`done.js` FROST, makeWindowPane) set back 0.6 of the jambs' depth, so the recess shows,
  lapped 12 mm into the frame all round; its picture drawn in code (a 128 px canvas: a cool gradient brighter at the
  top, a 3 % two-octave mottle). Out of the AO, the shadows and the rays. Gone with it: the cylinder, sky cap, lawn,
  occluders, ceiling, the back wall's clipping, the 40 m far plane, `outside.webp` and `outside-photo.py`. Checked from
  eight views (straight on, the hero, both obliques, high straight on and high near the window, low straight on and low
  oblique: `D:\Claude - Output\done-scene-spools-2026-10-26\frost2\sheet.png`). It is compiled ahead on entry and on a
  tier change (main.js compileAhead): the only unlit textured material in the room, it compiled on the cut into the
  macro otherwise (measured at High).
- **OPEN: the sun.** room.json's sun comes in through this window (dir -718, 578, 387; the window is in the left wall), so
  the sharp sun patches and the plant's shadows on the walls are sunlight through what is now frosted glass, which
  would scatter it. They are baked (`tools/done-scene/room.py`, Blender); softening them is a re-bake. Asked.
- **The final scene is drawn at up to twice the screen's ratio** (main.js SUPERSAMPLING). Joey, on the A5000 laptop in
  Brave: "I just notice a lot of harsh pixels"; "its very obvious during camera movement because the pixel pop and
  crawl". MEASURED, in Chrome and Brave on that GPU at his 2000 x 991 frame: 4x MSAA on, the full device ratio, no
  resolution drop, so antialiasing was not being traded for speed. A 1 to 40 mm near plane changed under 700 pixels of
  2 M (not depth precision). What crawled was detail under a pixel that MSAA does not reach: the coil's shaded strands,
  the flanges' notches, the covers' speckle. Very High's accumulation resolves those only at rest, and every shot moves.
  A main pass measured 2.2 ms at 2000 x 991 and 3.6 at 4000 x 1982. High and Very High draw at up to twice the screen's
  ratio, inside the pixel count a 4K screen at ratio 2 already gets; from the entrance's verdict on, never when judged
  slow, never in Colors' orbit; the resolution drop still wins on a device that proves slow. The relief's band limit is
  in CSS pixels, so it does not move.
- **The coil fades before it aliases** (spool.js COIL_FADE): its strands drawn at 8 px a strand or more and gone by 5,
  where they had been drawn to 4 px and gone at 2. The crease is a fifth of a strand, so at half strength it was sub-pixel
  and made moire.
- **Checks.** The window case is replaced (the seat; every look through the opening from 11 views meets the pane, the
  frame or the window's wall; the picture; far plane and clipping untouched; gone with Neutral; a lap -3 mutant fails).
  The lens case now also checks [supersampled, ratio] = [true, 2] in the scene and [false, 1] after. 11 touched cases
  pass. Sol `01a17823` round 23 (two findings: one discarded, the idle gate's key carries accRev; one premise wrong, as
  `cinema.on` is the old outro, but its risk accepted, so supersampling waits for the verdict) and round 24 (none). Not
  deployed.

## 2026-10-26 - Done scene: the spools' crawl fixed at its sources; supersampling on Very High only

- **Why.** Joey, zoomed into the supersampled frame: the jaggies were still there, and "I'm not sure if that's the ideal
  solution ... if it requires greatly raising performance". Astra (relayed): isolate each source at unchanged resolution
  before choosing an AA method. Measured on the A5000, a held shot at High, vsync off (noisy, +-50 %): 3.8-4.2 ms a frame
  at 2000 x 991 against 7.6-10.2 at 4000 x 1982.
- **What the sources were** (real-pipeline frames at 2000 x 991, supersampling off, one thing off at a time; close-ups
  at 2.5x): Joey named two as the ones he saw.
  - The dashed seams between stacked spools survived the winding off, the spools' shadows off, the AO retired and the
    spools unlit, so they were geometry. The flange mesh is closed (no open or non-manifold edges). The seam was the
    wedge-shaped gap a leaned spool leaves on the one below, 0 at the touch and about 2.6 mm across, broken into dashes
    where it narrows under a pixel. Level, the seams draw whole; a level 1 mm gap brings some back.
    **Fix:** `SPOOL_LEAN = 0` (done-fit.js). Each stack keeps its slip (up to 7 mm off the one below) and its turn, and
    the rng draws are unchanged, so every stack is the same otherwise.
  - The blocky dark shapes on a coil under its flange are not shadow-map resolution: the same at 1024, 2048 and 4096.
    They go with the flanges not casting. The lightened flange's rim is long flat facets, each throwing a straight-edged
    shadow. **Fix:** the flange casts nothing, and two invisible 256-sided discs of its size cast for it (spool.js THE
    FLANGES' SHADOW): depth only, never hit, out of the AO and the reflection.
  - The coil's band limit (COIL_FADE) stays.
- **Supersampling on Very High only** (main.js superCap: `q.accum`). After the two fixes a frame at the screen's ratio
  drew the spools' rims as cleanly as one at twice it (`D:\Claude - Output\done-scene-spools-2026-10-26\aa\fixed`).
- **Checks.** The spool-click case asserts the casters (a mutant with the flange casting again fails it). The lens case
  asserts High at the screen's ratio. 9 touched cases pass; unit 658/664 (the failure is a foot GLB missing from the
  worktree's parts junction).
- **Sol `01a17823` round 25.** No correctness findings. Risks recorded:
  - The sun's shadow frustum is fitted to the build only, so the spools are not guaranteed inside it (predates this).
  - The discs shadow through the flanges' slots, which the real flanges would not.
  - 32 spools means 64 caster meshes.
  - Compile-ahead is covered: the relief case counts programs through the macro cut, a tier change included, and passed
    with the casters in.
- **Not deployed.**

## 2026-10-26 - Done scene: the sun's shadow fitted round the spools too

- **Why.** Joey: "the shadow is odd and wrong, casted from the spools onto the table, also there's a weird shadow on the
  spools". It was Sol's round-25 risk. The sun's shadow camera was a square round the build alone, and what stands
  outside it casts and catches nothing, cut on a straight line. MEASURED in the final scene: 3 of the spool stack's 8
  box corners inside it, the box reaching 1.6 (High) to 1.8 (Very High) of its half-width. An earlier "2.6-3" for the
  stack's shadow on the desk was a broken probe: a point carried along the light keeps its place in the light's view,
  so a shadow lies wherever its caster does (Sol round 26).
- **Now** (main.js THE SHADOW BEYOND THE BUILD; done.js fitShadowToSpools).
  - A scene may name casters beside the build (setShadowExtent: the spool groups' boxes; on entry once the room's sun is
    placed, after the spools change, on a tier change, cleared on leave).
  - The camera is then fitted, in the light's own view, round the build and those boxes, with room for Very High's light
    tilt about its target.
  - The map grows to keep the old texel, up to twice the tier's size: High 1536 (0.34-0.41 mm a texel, from 0.53), Very
    High 3072.
  - The near plane may go negative: a stack up to the ceiling toward the sun reaches past the light (a 2.5 m test tower:
    its top 607 mm behind it; near -807, every corner covered).
  - The depth bias scales with the depth range, to keep its 1.2 mm in the world (exactly -0.0004 at the stage's own
    1..3000, so the planner is unchanged).
  - With no casters named, the fit is the one before.
- **Seen.** The stack's shadow on the desk and the wall is whole, its rounded top on the wall, no straight cut
  (`D:\Claude - Output\done-scene-spools-2026-10-26\aa\cover2`).
- **Checks.** The spool-click case ends at High and asserts every group's corners, and the points carried down to its
  base, inside the shadow camera across and in depth. A mutant with the refit off fails it (12/16, 10/16). 11 touched
  cases pass. Sol `01a17823` round 26: the near plane (fixed); the bias (fixed). Not deployed.
- **Seen in passing, not this change.** The dashed seam across a build's side cover, the same before and after: the
  cover-seam bevel, next to trace. (It was not the bevel: see the next entry.)

## 2026-10-26 - The AO's moving frames: a gap under a texel takes no occlusion of its own

- **Why.** The three build-side jaggies in Joey's first screenshot of the final scene, traced as the spools were (real
  GPU at his 2000 x 991, High, the default kit on EdgeLabel faceplates, one moving moment re-sought per variant):
  - **The dashed cover seam.** The beads survived the seam bevel square, the plate finish Smooth, the shadows off and
    every part unlit; they went with the AO off (twice). A clean "Smooth" frame in the first sweep did not reproduce.
  - **The label lips' beads.** The same.
  - **The cover speckle.** Not an artifact: in the detail shot the powder face's pixel-to-pixel variation equals
    Smooth's at High and at Very High. It is the approved powder grain, drawn only where a grain cell spans several
    pixels: very close views. Left alone.
- **The cause.** The cover tiles butt with a hairline gap. The colour pass draws it, multisampled, as a faint even
  line. The AO's half-resolution depth has one sample a texel, so it holds the gap only where it crosses a texel's
  centre, and those texels, deep in the gap, come out fully occluded: dark beads, locked to the screen, crawling.
  Full-resolution AO only shrank them, and four SSAO passes a moving frame changed nothing (not noise); both reverted.
- **Now** (main.js THE CRACK). In a moving frame's single AO pass, a texel deeper than both of its neighbours across,
  on either axis, by 1.5 mm takes no occlusion of its own. At rest the settle's jittered passes run as before, so the
  resting look is unchanged: the planner's 60 golden shots, Very High and Fast, at rest, 0 differ. The settle
  transition, captured: from the first pass to rest the seam turns one even, slightly darker line, no beads.
- **Seen.** The seam's beads mostly gone (a faint even darkening left), the label lip an even line, the AO's real
  contact shading (under drawer lips, between drawers) as before (`D:\Claude - Output\done-scene-spools-2026-10-26\aa\crack`).
- **Checks.** A new e2e case: at one moving moment of the low shot, fewer dark AO texels with the check than without
  (under 0.97 of them), and with the shot held the settle accumulates with the check off. A mutant with the shader's
  check disabled fails it (1978 vs 1981).
- **Sol `01a17823` round 27.** No defect. Accepted trade-offs, as the check reads a depth shape, not an artefact:
  - a real recess one AO texel wide loses its darkening in motion;
  - so can a narrow strip of wall seen behind foreground edges;
  - 1.5 mm is a depth contrast, not a slot width: one texel is about 1.5 mm at 1 m and 4.4 mm at 3 m.
  - OPEN: the e2e measures suppression overall, not that it is the seam's alone; selectivity rests on the visual
    comparison.
- **Not deployed.**
## 2026-10-23 (the top bar fits at 1280-1365, and nothing in it leaves the screen)

- **What was wrong.** From 1280 px the workspace tabs rejoin the bar's single row (below 1280 they have a row of their
  own), and up to 1365 that row held more than the screen. It was found while the Feedback & support button was being
  added (branch `feedback-support`, which hides its button at 1280-1365 for this reason). Measured headless on main
  `7b68f9e`; every workspace measures the same:
  - On the root kit, Share ended 10.8 px past the bar's 20 px right inset at 1280.
  - The widest case of this kind, 27.7 px at 1280 and 7.7 px at 1300: a long build name, Under-Table and the Prusa CORE
    One L. Under-Table is the widest mount chip (171 px; Wall Mount 165, Tabletop 148). The CORE One L is the widest
    printer chip (167 px; Voron Switchwire 162, a 300×300 custom bed 162).
  - The tab badges count too. With the widest badges a big build could show (Labels 99/99, Parts 999), the tabs are
    57 px wider. That case was 85.2 px over at 1280 and still 0.2 px over at 1365.
  - On `7b68f9e` the same cases overflowed above 1500, where the printer's name and Share's word come back: 6.3 px at
    1501 (63.8 px with those badges, still 4.8 px at 1650; it fitted again from 1655).
  - **Then main took the Feedback & support button** (`fe0a410`, merged into this branch as `78f4490`). The button is
    44 px, shown from 1366 up and hidden at 1280-1365. The printer and Share chips stay icon-only up to 1580, and the
    name's width term above that is 1424.
  - With the button, the widest case with those badges was still over. The bar squeezed the button from 44 to 20 px
    (its 44 px is a `width`, and a flex item shrinks by default). Share was still past the edge: 29.2 px at 1366,
    15.2 px at 1400-1500, 20.8 px at 1581-1640 and 4.8 px at 1680. It fitted from 1700.
  - Those figures come from the merge with the switcher rules below taken out; the mount chip's rule acts only below
    1366. Without the big badges the bar fitted everywhere: 4.3 px to spare at 1366, 12.7 px at 1581.
  - For scale, a 12W×5H build of 48 drawers on the root kit shows Parts 60 and no Labels badge (its faceplates take no
    label). 999 is a generous bound.
- **Now** (`css/app.css`):
  - **At 1280-1365 the mount chip shows only its icon and length,** as it does on the phone: 79 px for every mount. Its
    words are clipped, not removed, so the button's accessible name is still "Under-Table · 185". The setup sheet the chip
    opens names the mount, and so does the chip from 1366 up.
  - This rule shares its 1280-1365 block with the Feedback & support button's hide. The hide is still needed: 6.4 px is
    left at 1280 in the widest case, and the button takes 54.
  - **Only the build name gives way.** The rules are `#ws-top > * { flex-shrink: 0 }`,
    `#ws-switch { flex-shrink: 1; min-width: 0 }` and `max-width: 100%` on the switcher's chip. If the bar is still too
    full, the build name gets shorter; no other control is squeezed, and Share stays on the screen.
  - It only acts in the widest case with the big badges. The name keeps its 120 px floor in 1280-1365. Above that it
    gives way: to 67 px at 1366, 101 px at 1400, 141 px at 1440 and 201 px at 1500; then to 112 px at 1581 and 171 px
    at 1640. Without the big badges it never acts.
    Those are Windows' figures. The deploy runner lays the same text out wider (the bullet below), and there the name
    gives way in the tier as well: 75 px at 1280, 95 at 1300, 115 at 1320 and 120 from 1340; above it 9 px at 1366,
    43 at 1400, 83 at 1440, 143 at 1500, 38 at 1581 and 97 at 1640. Without the big badges the runner's name is 120 in
    the tier, 70 at 1366, 104 at 1400 and 99 at 1581.
- **Why not the tabs on their own row up to 1365** (the other candidate). That tier moves every panel 44 px down (top 134
  instead of 90), and 1280-1365 includes the shortest laptop screens (1280×720, 1360×768). It is also not CSS alone: the
  1280 line is coded in six places across five workspace files (`innerWidth < 1280` for safe areas and narrow layouts in
  assemble.js twice, build.js, colors.js, labels.js and parts.js) and in seven `max-width: 1279px` blocks in app.css. The
  mount chip's word was the cheapest room in the bar: 92 px in the widest case. Making the Day/Night pair one button would
  have saved about 42, which does not cover the big badges.
- **Checks.** A new e2e case, "the top bar fits at every desktop width in its widest case, in every workspace…":
  - It sets that build up through the setup sheet. Then, in all five workspaces, at 18 widths from 1024 to 1920 (each
    tier's edges among them), twice over: with the build's own tabs, then with the widest badges written into them. It
    asserts:
    - nothing past the bar's right edge;
    - 10 px between the controls (the switcher's chip is measured, not its wrapper);
    - no control narrower than 44 px, the wordmark and the switcher aside;
    - the tabs on a row of their own below 1280 only, and on the screen;
    - the mount word shown only outside 1280-1365, with the accessible name kept at 1280;
    - the build name at least 118 px in 1280-1365, and at least 60 px elsewhere, with the build's own tabs; with the
      widest badges, that the tabs are at least 40 px wider (57 px here, 61 on the runner: the badges are there and
      count) and that the name is the only control that gives way: every other control keeps the width it had without
      them, to the 1/64 px Chrome lays out in, and the name never grows.
  - It fails on main's CSS (`fe0a410`: 85 px past at 1280). It also fails on each of 10 mutants of the fix:
    - the chip rule removed, or the words hidden with `display: none`;
    - either bound of the tier moved;
    - the switcher rules removed;
    - any one of `min-width: 0`, the chip's `max-width`, the switcher's `flex-shrink: 1` or the others'
      `flex-shrink: 0` removed.
  - Its first version let one mutant through: without the chip's `max-width`, the wrapper shrank, and the chip ran 44 px
    over the tabs. The case now measures the chip. It had also checked gaps and edges, not widths, so it missed the
    squeezed Feedback & support button until the 44 px check.
  - The fix alone on `7b68f9e` (`181a338`): npm test 603 tests, 598 pass, 5 skipped, 0 fail.
  - On the merged branch: npm test 606 tests, 601 pass, 5 skipped, 0 fail.
  - The full e2e suite in software rendering (`E2E_SOFT=1`): 81 of 82. The one failure is main's Feedback & support
    case, at "Escape after the dialog closed did not deselect".
    - That case is flaky under software rendering on main's CSS too: run alone, it failed 1 of 8 times there and 4 of 9
      here, the full run included.
    - At that step (1366×768, root kit), all 55 visible boxes in the bar are the same with either CSS.
    - A likely cause, not changed here: Escape closes the dialog at once, but its `close` event comes as a later task,
      and that event is what ends the key hold.
- **Review:**
  - Terra `01a168e4` on the fix alone: no findings. It was asked about the phone, the 1024-1279 tier and the switcher's
    menu; the clipped label's layout and accessible name; a vacuous or flaky pass on the CI runner; and any width or
    combination left uncovered.
  - Terra `01a16900` on the follow-up: one finding, confirmed. The 44 px check read `width < 43.5`, so a control squeezed
    by under half a pixel would have passed. An unsqueezed icon chip measures exactly 44.0 px (Chrome lays out in
    1/64 px), so the check is now `width < 44`.
- **The deploy runner lays the bar's text out wider, and the case's first version did not allow for it.** The deploy of
  this merge (`aca5f1c`, with the Assemble toast fix on top as `eeceaeb`; run 40004575512) failed at this case on
  2026-10-23 at 19:34Z: at 1280 in Build, with the widest badges written in, the name measured 74.6 px against the
  118 px floor, with everything else as it should be (`edge` 1260, `last` 1260, gaps 16/20/20/10/10/10, nothing squeezed,
  the word clipped). A throwaway diagnostic workflow on the runner's image (run 40013974563, branch `diag-topbar-runner`,
  deleted after) measured the same bar: the same IBM Plex web fonts load there, and a canvas measures a 67-character
  string in IBM Plex Sans 400 at 13 px as 390.3 px on both machines; but the laid-out tabs are 554 px there against 508
  here with the build's own tabs (615 against 565 with the widest badges), about 46 px less room in the bar, and the
  Build tab alone 91 against 83. Every hard guarantee held there at all 18 widths in both passes. So the case now asserts
  the name's floors with the build's own tabs only, and with the widest badges that nothing but the name gives way.
  Alone, in software rendering, it passes here in 118 s. On four mutants of the fix it fails as it should: the switcher
  rules removed (Share 29 px past the edge at 1366 with the widest badges), the mount word's clip removed (the word shown
  at 1280), the name's floor lowered to 80 px (the 120 px floor at 1280, with the build's own tabs) and the chip's
  `max-width` removed (the chip 33 px over the tabs at 1366). Terra `01a16a58` on this follow-up: two findings, both
  confirmed and fixed (the widest pass did not prove the badges had widened the tabs, so a badge hidden by CSS would have
  passed it on the plain bar; the other controls' widths were compared rounded, so a squeeze under half a pixel would
  have passed). Not changed here, and Joey's call: where text lays out as on the runner, the widest case leaves the name
  9 px at 1366 and 38 px at 1581, an ellipsis and little else.
- **Live:** 2026-10-23 at 22:11Z, stamp `f6ba8d12`. The branch went into main as `aca5f1c` (its merge with main `928e08a`
  is `cbe0a2a`); that merge's deploy, run 40004575512 (as `eeceaeb`), failed on this entry's e2e case; the runner
  follow-up above went in as `56faf84` (`5df7184`); and the day's later merges (`ae0d501`, `d37efae`, `1799b00`, `f6ba8d1`)
  each cancelled the run before them, so the main that carried all of it is `f6ba8d1`, stamp `f6ba8d12`: run 40028267309
  green, 21:38 to 22:11Z. `topbar-prod.mjs f6ba8d12` on the live site, a fresh profile with analytics blocked: 28 of 28
  rows clean, all five workspaces at 1280 and 1366, Build at 1024 to 1920, with the build's own tabs and with the widest
  badges. Nothing past the bar's edge, no overlap, 10 px between controls, no control under 44 px, the Feedback & support
  button 44 px from 1366 and in the build menu at 1280-1365 as designed, the mount word clipped at 1280-1365 only, the
  name 120 px in the tier and 67 px at 1366 in the widest case (Windows Chrome). Before, on `928e08a1`, the same script
  failed 17 of 28 rows: Share 85 px past the edge at 1280 in the widest case, and at 1366 the button squeezed to 20 px
  with Share 29 px past.

## 2026-10-23 (Assemble's toasts show above the player card: Share's "Link copied." was hidden)

- **The defect** (Joey, 2026-10-23: "I notice the share button at the end of the instructions does nothing"). Share did
  copy the address and raise "Link copied.", but on the desktop the toast sits 100 px from the workspace's bottom
  (`#ws-toast`), inside the player card's box (126 px tall on a step, 231 on the end page, 22 px from the bottom), and the
  card is the later sibling, so it painted over the toast: every Assemble toast was invisible on the desktop. On the phone
  the toast already rode above the sheets (`#ws #ws-toast`, z-index 14). Reproduced live on `6e19ed12` by
  `assemble-share-prod.mjs` (new, in the prod-checks folder): desktop copied, shown, and hidden (the toast's 760-800 px
  inside the card's 674-878); phone visible.
- **The fix:** a ResizeObserver on the card keeps `--player-h` on the root current (every render, the end page's extra
  row, a window that rewraps the card's text), and `html[data-ws="assemble"] #ws-toast` sits `22px + var(--player-h) +
  10px` from the bottom at z-index 14 (css/app.css). The phone rule's two ids still win there. The first draft set the
  variable in `renderPlayer()` only; Terra `01a169dc` caught the resize case (a window under 680 px wide narrows the
  card and rewraps it without a render), the one finding, taken.
- **The test:** the Assemble e2e case presses Share on the end page with the clipboard stubbed and asserts the address was
  copied, the toast says "Link copied." and its box clears the card's top edge. The toast takes no pointer events, so
  `elementFromPoint` can never name it: the first draft of the assertion used it and failed with the fix in place.
  Mutants: without the CSS rule the gap is -126 px, without `--player-h` it is -68 px (the 126 px default against the
  231 px end card); both fail the case.
- **Review:** Terra `01a169dc`: one finding, taken (above).
- **Suites:** npm test 616 (610 pass, 5 skipped; M28's timing gate tripped once under load, max 738 ms, and passes alone:
  median 0.13 ms, max 7.7); e2e soft 82 (81 pass; the "Part Picker opens that part" case timed out while another session
  republished the Studio checkout the suite serves, and passes alone). The e2e assertion also requires the toast inside the
  viewport (Terra's follow-up, `01a169dc`).
- **Deploy:** a reported bug, so it deploys once the suites pass.

## 2026-10-23 (the Quality pill keeps a visitor's pick, and the tab badges follow the record)

Two findings of the hands-on GPU pass on Joey's laptop browser (an RTX A5000, Brave; Joey's go to fix them: "Yes, fix the
found bugs: the Quality pill not saving its pick across a reload, and the stale Parts/Labels badges and size line after
keyboard undo or Remove").

- **The pill.** The shell's Quality pill (`js/ui/toolbar.js`) called `stage.applyQuality(name, true)`: a function of one
  argument that draws the tier for this page only. The viewer's own pill called `setQuality(name, { user: true })`, which
  stores the pick (`gen2-quality`, `gen2-quality:set`) and locks out the auto-downgrade; the boot reads those. So a visitor
  who picked Fast was back on Very High after a reload (the parity list's C4 had claimed the pick was stored; it was not).
  Now the pill calls `stage.setQuality(next, { user: true })` where the stage offers it.
- **The badges.** `topbar()` built its tab badges once per mount (`tabs()` read `ctx.badges()` at build time), so the
  Parts count stood still through placements, undos and removes until the next workspace switch ("Parts 77" at five
  units in the pass). The nav now redraws its badges on every store change for the mount's lifetime (a subscription
  dropped on the workspace's abort signal), and the Parts count reads the RECORD (`store.serialize()`), not the stage's
  last build, so it is right at the store change rather than after the regenerate.
- **The size line in Labels.** `labels.js`'s stage sync never redrew after `stage.update`: the dock's size line and the
  bar were drawn on the store change, before the rebuild, and never again. The dock and the View toolbar are drawn again
  after a completed update: only those, because a whole `renderAll()` there would rebuild an open label editor from the
  stored label and wipe a word typed while the stage rebuilt (Terra `01a16a49`'s one finding, taken; the 2026-10-18 lesson).
- **The tests:** two e2e cases. The pill case seeds Fast without the harness's init script (which would reset the pick on
  every load), clicks the pill, reloads, and expects the picked tier back with `gen2-quality:set` = 1. The badge case
  places a third unit on the board, switches to Labels, undoes it there, and expects the badge back at once and the dock's
  size line changed once the stage has rebuilt. Mutants, each failing its case: the pill on `applyQuality`; the badges
  built once; no redraw after the Labels update; the badge counting `stage.build`.
- **Review:** Terra `01a16a49`: one finding, taken (above).
- **Deploy:** on Joey's go above, once the suites pass and main is green again (the top-bar case failed on the runner in
  the run before this one). Merged as `eb33cb1` + `ae0d501` (main 56faf84 merged in). **Live 2026-10-23 at `f6ba8d12`**
  (run 40028267309, the deploy that also carried the material chips, the hover clips and the idle-gate fix; live 18:11).
  `quality-badges-prod.mjs f6ba8d1` passes 6 of 6: a pick is saved as the user's and survives a reload, and the Parts badge
  grows with a placement on the 2D board (43 to 51) without a workspace switch. The same script failed both halves on
  `928e08a1` that afternoon.

## 2026-10-23 (the filament picker filters by material: All · PLA · PETG chips above the list)

- **Joey, asked:** "in the color/filament selection on the right side of the screen, should we also have a way to filter by
  material type when applicable?"
- **What a material is here.** The catalogue (`js/filament-db.js`, vendored byte-for-byte, so it gains no field) has no
  material of its own; the 2026-10-21 tags on every line header derive from the line's NAME (a TPU line is TPU; otherwise PLA
  and/or PETG, both on the Elegoo "PLA / PETG" line). Silk and Translucent are finishes of PLA and stay tagged PLA, so the
  chips are the tags' three materials and nothing finer: a case's picker offers **All · PLA · PETG**, and the feet's, which
  lists the TPU lines alone, shows no row at all ("when applicable": a row needs two materials to choose between). The rule
  now lives in one place, `js/colors/materials.js` (pure, no imports): `lineMaterials` for the tags and the chips alike,
  `colorMaterial` for a colour on a two-material line (its own name says: "PETG Black" / "PLA Grey"), `materialsIn` for
  the chips a region's lines offer, `filterByMaterial` for the narrowing, `labelMaterials` for the "In this build" row, and
  `wordMaterial` for a palette name the catalogue lacks (a shared or uploaded palette can name anything: "petg Blue" answers
  the PETG chip by its own whole word, any case; "Sunset Orange" says nothing and shows under All only).
- **The row** (`#ws-picker .mrow`, role group "Material", `button.mchip[aria-pressed]` with a dot in the tag's colour) sits
  between the search box and the list, All first and pressed. A chip narrows the brand groups (a group's header count follows;
  a group with no colour of that material hides) and the "In this build" row, and combines with the search both ways: the
  search alone re-renders the list, never the box, and a chip does the same, so the typed words survive a chip and the chip
  survives typing. The chips are built once per picker render and their pressed state is set in place: the first draft
  rebuilt the row on a click, and a Space on a focused chip then dropped the keyboard's focus to the document (Terra, below).
  A pick's re-render keeps the chip (`st.mat`, like `st.query`); opening a picker for a region starts both afresh at All,
  so a PETG chip left on the case never follows into the feet's TPU-only list. 8 px between the chips (`--gap-ctl`, the
  planner's floor); on the phone the row is nowrap and scrolls sideways (3 px of padding keep a chip's focus ring inside the
  scroll box), so the sheet's list keeps its height.
- **Checks.** `test/materials.test.mjs` (7 tests) states the rule against the real catalogue: a line's materials from its
  name, the Elegoo line's by colour, PLA + PETG for a case and TPU alone for the feet, PETG keeping the Polymaker PETG line and
  Elegoo's one colour, PLA dropping the Polymaker PETG line in order, a full pass over the chips accounting for every colour
  once, the label map, and the whole-word any-case name rule. The TPU-feet Colors e2e case gained the chips: All · PLA · PETG
  on a case with All pressed and 8 px gaps; PETG pressing, releasing All, leaving the two lines that sell it with every swatch
  PETG (In this build included) and Elegoo down to its PETG Black; "black" under PETG the PETG blacks alone, All with the
  words kept every black, the search box never rebuilt; Space on a focused PLA chip pressing it with the focus kept; an
  uploaded "PETG Blue (custom)" in the palette answering PETG and not PLA after the picker is opened again at All; the feet
  with no row and their 11 TPU swatches with a PETG chip left pressed on the case. Passes alone in 38 s (soft). Mutants, each
  failing its own check: no row, no narrowing, In this build ignoring the chip, no reset on open, a row for one material,
  4 px gaps, the pressed state not synced, the row rebuilt on a click (focus lost), an uncatalogued name never answering, and
  in the unit: the first material taken on a two-material line, empty groups kept, TPU never said, a substring match
  (PLATINUM as PLA): 13 of 13 killed.
- **Review:** Terra `01a16a51` (routine): two findings, both held and fixed (the rebuilt row losing keyboard focus; an
  uncatalogued palette name hidden under every chip); its follow-up on the fixes: one more, held and fixed (the word match
  was case-sensitive). Screenshots in `D:\Claude - Output\material-filter-2026-10-23` (desktop and phone, All and PETG).
- **Suites:** npm test 623 (617 pass, 5 skipped; M28's timing gate tripped once while the e2e subset rendered in software
  beside it, median 0.3 ms, max 650.6 ms, and passes alone: the Simplify file 5 of 5 in 88 ms); the e2e cases named Colors,
  the phone check, the phone journey, analytics and the boot case: 23 of 23 (11.6 min, soft). The full e2e suite runs on the
  deploy.
- **Deploy:** a feature, so on Joey's go (2026-10-23: "Yes, deploy the material filter chips: merge material-filter onto main
  and push, with a live check"). The branch took main twice first (`915538f`: 56faf84; `224a7c2`: ae0d501, one DECISIONS
  conflict, both entries kept in order); the chips case passed on each, npm test 623 / 617 pass / 5 skipped on the merged tree
  (M28's gate under load again, 36 ms alone). Main's merge `d37efae` (run 40024341132, cancelled by the hover-hints push, as
  pages.yml does); the stamp that carries it is `f6ba8d12` (the idle-gate merge on top of the hover clips, run 40028267309).
- **Live 2026-10-23**, stamp `f6ba8d12`, seen at 18:11 local. `matfilter-prod.mjs f6ba8d12` (the prod-checks folder) passes all
  20 checks at 1280 x 800 and 390 x 844: a case's All · PLA · PETG with All pressed and 8 px gaps; PETG pressed narrows the
  heads to PETG and PLA / PETG with 27 of 118 swatches left, every one PETG; the feet with no row and 11 TPU swatches; the
  phone row nowrap with overflow-x auto; no page errors. Its control on the pre-deploy site (928e08a1) failed exactly the
  11 chip checks and passed the 8 feet and row checks.

## 2026-10-23 (hover-hint clips on every workspace)

- **Joey:** "can we do more video animations for when hovering over certain buttons to illustrate how they work?" The
  Labels tiles have had them since 2026-10-13 (js/ui/hint.js: a glass bubble beside the panel after a short dwell, a muted
  looping clip from img/hints/, recorded from the app by tools/hint-clips.mjs). A shortlist of eleven went to him through
  the session that asked for this; his answer: "Record all eight recommended hover clips." Labels already had all five of
  its own, so the new ones are on Build, Colors, Parts and Assemble.
- **The eight.** Build's size tiles (`build-place`: a size, the amber spots, the top one clicked, the drawer landing, Esc;
  the "+" spots are stage markers, not buttons, so the clip sits on the tiles, where a visitor is before the spots
  exist); Fill all on the issue card (`build-fill`: a red slot, Fill all, the 1W case, the toast); Build style's Side
  covers (`build-sidecovers`, the hint on the track so the bubble stays while the mouse crosses from Off to On); Colors'
  Browse looks (`colors-browse`: two cards previewed on the model, one opened, Apply), Surprise me (`colors-surprise`: a
  look previewed, More like this, Use this look) and Simplify… (`colors-simplify`: Down to 3 filaments, the change list,
  Apply); Parts' Track my build (`parts-track`: the counters on every row, two rows ticked, the dock's progress bar);
  Assemble's camera chip (`assemble-camera`: a drag orbits the overview and lights the chip, pressing it glides back; the
  bubble sits UNDER the toolbar, since beside the chip it would cover the next ones). Each control's own title is the
  touch screen's answer, as on Labels.

  | clip | s | KB | | clip | s | KB |
  |---|---|---|---|---|---|---|
  | build-place | 9.4 | 50 | | colors-surprise | 14.1 | 76 |
  | build-fill | 12.6 | 59 | | colors-simplify | 12.6 | 59 |
  | build-sidecovers | 9.4 | 57 | | parts-track | 11.7 | 56 |
  | colors-browse | 16.7 | 87 | | assemble-camera | 9.8 | 144 |

  All at 480 × 222, H.264, loaded only on the first hover of that control. The Assemble clip is the heaviest (the whole
  frame moves while the camera orbits and returns), at crf 30 and the fast render tier; the rest at the Labels clips'
  crf 27. Together 588 KB in the repo, nothing until someone looks.
- **hint.js** (js/ui/hint.js): no bubble while a phone sheet is open (a narrow window with a mouse gets the sheets too);
  never over an open `role=dialog` the control is not inside (Colors' Simplify card opens under the pointer that pressed
  Simplify…, and the bubble beside the panel would cover it; the Fill all hint is INSIDE its issue card and shows); never
  over the dock (centred on a button low in the issue card, the Fill all bubble reached Get parts list; it sits above the
  dock instead); `spec.below` for a toolbar chip; `spec.scene` optional, with one fallback scene (a cursor pressing a
  button) so a new hint needs no hand-drawn art; every hinted control carries `data-hint=<clip name>` for the harness;
  `focusin`/`focusout` instead of `focus`/`blur`, so a hint on a group arms when the keyboard reaches a segment inside it
  and stays while it moves between the group's own segments. A modal dialog needs no rule of its own: every one here is a
  full veil, which the overlap rule refuses. Each workspace calls `hideHint()` before rebuilding a panel that holds a hinted
  control (a removed button never fires mouseleave, Terra 01a13529's rule from Labels). `pages.yml` stamps
  `../ui/hint.js` in the four workspaces; the clips are assets, loaded by URL, and need no stamp.
- **The recorder** (tools/hint-clips.mjs, dev only): opens any workspace, keys clips `<workspace>-<key>`, takes a per-clip
  viewport size, render tier and crf, a `drag` for an orbit, `scrollTo` for a control low in a scrolling panel; the eight
  new clips are recorded at 1280 × 800 (the one-row desktop layout) and framed two ways, a 700 × 321 window at the Labels
  clips' scale or a 960 × 440 window at half scale where a panel and the whole model must both read. The side covers print
  in the case's black, and a black panel leaving a black wall cannot be seen at the bubble's size, so the clip gives them
  an orange of their own (`setColor` on `SideCover` and `SideCover:FACE`, then `setUseCustom(true)`: Build shows the
  instruction colours until Colors is opened) and turns the model a little first. The README under img/hints/ says so. One
  recording of the place clip ran 32 s (the page was slow that run; the frames carry their real timestamps) and was redone
  at 9.4 s: the recorder's timing is the page's, so read a clip's length back after recording.
- **Checks.** npm test 616 (611 passed, 0 failed, 5 skipped). A new e2e case, "hover hints: every hinted control shows its
  clip on hover and hides on leave; none shows over the setup sheet or an open card": on each workspace, for each state
  that offers hints (Build's Add units, Build style, a gap build with the issue card open), every expected `data-hint`
  control is present, hovering it shows the bubble with that clip's `<video>` (a missing file errors and fails it), the
  bubble does not overlap the control, leaving hides it; the keyboard on a segment inside the Side covers group shows it;
  a bubble up when the setup sheet opens goes down; a hover and a focus fired at a control under the sheet show nothing;
  Simplify's open card gets no bubble over it; and at a 1000 px window with a mouse the camera chip hints under its
  toolbar, nothing hints while a sheet is open, and it hints again once the sheet closes. Mutation-checked six ways: an
  extra document `focusin` listener removed SURVIVED (the browser's boundary events and `focusout` already do that job, so
  the listener is not in the code); `focus` for `focusin` fails at the keyboard-on-group check; the overlap rule off fails
  at the Simplify card; Track my build's `attachHint` dropped fails Parts' wait for its hint; a separate `aria-modal` guard
  removed SURVIVED (every modal is a veil the overlap rule catches, so the guard was narrowed to the sheet rule); the sheet
  rule removed fails at the narrow-window check. The full e2e suite on this branch, `E2E_SOFT=1` with the ls-public
  Studio: 83 of 83 in 27.6 min. After main (`eeceaeb`: the top bar at 1280-1365, Assemble's toasts) was merged in as
  `9cedaef`: npm test 616 (611 passed, 0 failed, 5 skipped), the hover case again, and the full suite 83 of 84 in 41 min,
  the one failure a 30 s click timeout on the Label plate's "Screw and nut drawings" Off segment in that slow run; alone
  it passes in 24 s, and the six Labels and plate cases pass together.
- **Review:** Sol `01a16a18`, substantial (a multi-file feature; the brief said Terra, the class table says Sol): two
  findings. The `focus` listener on the Side covers track never firing (focus does not bubble): taken, `focusin`, with the
  keyboard check above. A bubble already up staying visible when a modal opens under a still pointer: discarded, the e2e
  drove exactly that with no extra code and the bubble went (the veil under the pointer fires mouseleave; a keyboard-shown
  bubble goes with the focus the modal takes); a line in the vault's reviewer-lessons (`3b105e1`).
- **The From a file clip, redone the same day** (Joey, a reported bug: the clip "looks wrong, instead it should open a
  desktop folder explorer window"). The control opens the computer's own file chooser, which no screencast can capture, so
  the recorder draws a stand-in: an Open window in the planner's glass style over the stage, `modulith-labels.json`
  chosen among generic names, "JSON files", Cancel and Open; the cursor presses Open, the window goes, and "Added 3
  labels" lands in the list (`19e6708`; 15.9 s, 65 KB). The hover case now also waits for every clip's metadata and a
  duration of 6 s or more: a 1 s stub in place of a clip fails it at "readyState 4, duration 1.08". Terra `01a16a90`,
  routine: NO FINDINGS.
- **Live 2026-10-23** (Joey's go through the session that asked: "Yes, deploy the hover clips: merge hover-hints onto
  main and push, with the live check"). Main moved three times before the merge (`56faf84`, `ae0d501`, `d37efae`), each
  merged into the branch with the hover case and the unit suite re-run (the last tree, `b220f54`: 623 tests, 618 passed,
  5 skipped; the hover case 104 s); hover-hints merged onto main as `1799b00` at 21:13 UTC, and the idle-gate fix landed on
  top of it as `f6ba8d1`, whose run 40028267309 passed (22:11 UTC) and is the stamp `f6ba8d12` that carries the clips.
  Checked live by `planner-prod-checks-2026-10-18\hover-hints-prod.mjs f6ba8d12`: on each workspace every hinted control
  carries its `data-hint`, hovering it plays its clip, no bubble overlaps its control (the eleven hints, the Labels three
  included); the eight new clips are served at their committed byte sizes and the redone `labels-file.mp4` at 66,648
  bytes; no console errors. The same script failed as it should on the pre-deploy site (stamp `928e08a1`, every hint
  absent, the clips 404).

## 2026-10-23 (Very High on the light theme never let the idle gate rest: the accumulator's last sample left the shadow map flagged)

- **The defect** (found by the Done-scene session on main's own code with no room, 2026-10-23; branch `done-scene` 80b0cca
  carries the same fix among the room work, not merged). The idle gate (2026-10-17) stops drawing a still view and draws
  one keepalive frame a second. On Very High every accumulated sample ends with `accSetSun(0)`, which puts the sun home
  and sets `renderer.shadowMap.needsUpdate` (the stage keeps `shadowMap.autoUpdate` off and flags the map itself); after
  the 24th sample the converged mean is blitted to the canvas with no scene render, so nothing consumed the flag, and
  `idleSettling()`'s third branch ("a shadow render still owed") kept the gate open: about 120 frames a second at rest.
  Only the light theme has a shadow map (`shadowsWanted`), so the dark theme never showed it.
- **The fix** (`js/main.js` `idleSettling`, one condition, from `done-scene` 80b0cca on its own: no `sceneHold`, no
  scenes/, no assemble.js change): the owed-shadow branch is ignored while a converged accumulator is blitting its mean
  (`accWanted() && acc.ok && acc.n >= ACC_SAMPLES`). The flag is honoured by the next plain render, which is the first
  frame after anything changes, and a restarted accumulation's samples set and consume it themselves. Nothing drawn
  changes: a converged accumulator blits the same mean on every frame, so the fix changes when a frame draws, never what.
- **The test:** `test/idle-settling.test.mjs` lifts `idleSettling` from the source text (the swap-shadows pattern, because
  main.js builds a renderer at import) and drives its three branches with the names it reads as knobs. The mutant with
  the condition reverted fails the converged case (checked on a scratch copy of main.js).
- **Measured** (headless Playwright on SwiftShader, 1280 × 800, the 2W2H tabletop kit, Very High, light theme, at the Done
  page after Skip to the finished build, `idleStats().drawn` sampled once a second for 12 s; the same script on main
  eeceaeb and on the fix): before, 119–124 frames a second, every second; after, 1 a second (one 2), `skipped` climbing,
  and `shadowMap.needsUpdate` still true at rest in both, as the fix predicts.
- **Goldens: 60 of 60 run alone; under load 58 of 60, and the two that differ differ on main too, in the same run.** A
  fifth full run on this branch alone (CPU 11–28 %) read 60 shots, 0 differ. Before it, four full runs on the fix
  while other sessions' suites and SwiftShader browsers loaded the machine: 5, 1, 5 and 2 shots differ, every one an
  `--end--` shot at 0.10–0.17 % of pixels, and in each the build is pixel-identical and only the height ruler stands on
  the other side. The fourth run was paired with pristine main eeceaeb at the same time: main's 60 differ in the same
  two (115-2w2h and 115-3w2h, end, Very High) at the same fractions (0.141 %, 0.112 %). The clause cannot reach a
  golden: the goldens run on the dark stage, where `shadowMap.enabled` is false on every tier, so the changed line
  short-circuits before the new clause on all 60. The flip is main's: the plain viewer's end page opens the checklist
  panel, and `updateDims` scores the ruler's corner against the panel's rect each frame with a 15 % hysteresis, so the
  corner kept depends on which frames ran while the panel came in (the tool's own header records a 0.12 % side flip
  from panel state); eight single-kit runs, four per tree, never flipped. Not instrumented beyond that. The same clause
  on `done-scene` read 60/60 at 15:40 the same day, run alone (the Done-scene session). The ruler flake is main's
  follow-up, not this fix's.
- **Review:** Terra `01a16a58` (routine): no findings on the diff, the test, the accumulator excerpts and this entry's
  draft; the goldens and suites bullets went back on the same thread once the runs were in, no findings.
- **Suites:** npm test 618 (613 pass, 0 fail, the 5 environment skips main has; 44 minutes under the shared load,
  layout-parity alone 2666 s against 752 s on a quiet machine); goldens as above.
- **Live:** main `f6ba8d1`, the no-ff merge of `idle-gate-light-vh` at 4eddce0 (this branch with main 1799b00 merged
  in) onto 1799b00, pushed 17:38 on Joey's go ("Yes, deploy the idle-gate fix: merge idle-gate-light-vh onto main and
  push, with a live check of the rest rate."); deploy run 40028267309, success 18:11; stamp `boot.js?v=f6ba8d12` live at
  18:12. The rest rate on the live site, the same headless probe as the measurement above (SwiftShader, Very High, light
  theme, Assemble at Done with the page untouched, `idleStats()` per second over 12 s, GoatCounter skipped and blocked):
  before, on the stamp the site served until then (`928e08a1`), drawn 116–123 a second and skipped 0; after, on
  `f6ba8d12`, drawn 1 a second and skipped 119–121. The merged tree's suite: npm test 625 (620 pass, 0 fail, 5
  environment skips). No real-GPU reading: Joey's desktop browser keeps the planner on the dark theme, which has no
  shadow map, and setting light would rewrite his saved preference. Terra `01a16ad3` on this line: one finding,
  discarded (it read the evidence's "node --test" as a different command from `npm test`, whose script it is).

## 2026-10-24 (the paid-link suffix goes: plain buy labels and one commission line, the September wording)

- **Joey, 2026-10-24:** "paid makes it sound like polymaker paid to put their filament on here, which it's affiliate
  links, so nothing has been paid by anyone yet"; asked: "Yes, replace the '· paid link' suffix everywhere with the
  September wording: plain buy labels and one commission line next to the links, Amazon's sentence once; deploy once
  checks pass."
- **The September decision** (the old planner, `591e7bb`, 2026-09-19; the vault's "Affiliate-link disclosure"): Joey asked
  that the parts list's "paid link" wording sound like the viewer's friendlier affiliate treatment. The buy buttons keep
  plain labels and each hardware row carries ONE line right under them - "Amazon links - I earn a small commission, at
  no extra cost to you." - instead of "· paid link" on every button; Amazon's required sentence, "As an Amazon Associate
  I earn from qualifying purchases.", appears once per page, verbatim: a plain commission statement next to the links it
  covers, Amazon's sentence once, never "affiliate link" alone. The new planner never inherited it: its Colors tab marked
  every paid link "· paid" / "· paid link" (phase 4, 2026-10-14) and the Parts list followed on 2026-10-21.
  `rel="noopener sponsored"` on every commission link is unchanged everywhere (the analytics read it).
- **The wording now** (colors.js `disclosureFor`, exported with `isAmazon` / `isPolymaker` beside `isPaid`; the Parts
  list imports it): Polymaker links only - "Polymaker links apply the JERRARI discount for you; as a Polymaker
  Ambassador I earn a small commission, at no extra cost to you."; Amazon only - "As an Amazon Associate I earn from
  qualifying purchases."; both - "As an Amazon Associate I earn from qualifying purchases. Polymaker links apply the
  JERRARI discount; as a Polymaker Ambassador I earn a small commission, at no extra cost to you."; a paid host that is
  neither program (none today) - "I earn a small commission, at no extra cost to you."; plain links - nothing.
- **The surfaces.** Colors: the look details' Shop this look rows and the shopping list ("Buy ↗" and the one line under
  the rows, which had read "Paid links. Polymaker links apply the JERRARI discount for you; as a Polymaker Ambassador I
  earn a small commission at no extra cost to you." or "Paid links · I earn a small commission at no extra cost to
  you."), and the picker's foot ("Buy <filament> →" with the line under it; its Polymaker line had read "Polymaker links
  apply the JERRARI discount for you. As a Polymaker Ambassador I earn a small commission; it costs you nothing extra.").
  Parts: the "Print in" filament links' titles ("Buy <filament> ↗"), the hardware rows' "Amazon ↗" (the `span.paid`
  mark and its app.css rules are gone), ONE line "Amazon links - I earn a small commission, at no extra cost to you." as
  the last child of every section group whose hardware rows link to Amazon (this build has two such groups) - under the
  section's rows, not under each row as the old planner did it: here a row has one "Amazon ↗" link and the hardware rows
  sit together, so one line under them covers them all - in the narrow list and the wide table (hidden with the link
  column under 1024 px), and the foot, which reads Amazon's
  sentence once, the Ambassador line when a "Print in" link is a Polymaker one, then "Any equivalent hardware from any
  store works." (it had read "Hardware links are Amazon affiliate links (as an Amazon Associate I earn from qualifying
  purchases) · any equivalent hardware works."). The old viewer, which the planner serves for kit covers and part
  previews: `linkEl` loses its `mark` parameter and the suffix, `markFmBuy` only sets rel, the `#paid-note` line stays
  the one line next to its links, and its sentence for Amazon and Polymaker links shown together now says the commission
  ("I'm also a Polymaker Ambassador and earn a commission on Polymaker links."; Sol's finding, below); its never-reached
  fallback for a host in neither program no longer says "paid links". The comments in main.js (the host list, linkEl, the
  two-part disclosure note, renderIdentifyLinks, renderChecklist, markFmBuy) and index.html's filament-menu comment
  describe the rule as it is now.
- **The "null" bug.** Under every look's footer without a translucent filament the word "null" showed (Joey saw it
  live). `renderDetail` passed `translucent.length ? el('p.note', …) : null` as the last argument of
  `gallery.append(…)`, and the DOM's `append(null)` writes the text "null": `el()` skips a null child, `append` does
  not. The picker had the same bug and already filters - its comment reads `append(null) writes the word "null" (it
  showed under the scope switch, 2026-10-17)`. The details' children now go through `.filter(Boolean)` too. The other
  `append` / `replaceChildren` calls in colors.js were read for this entry and pass no nullable child (the tray, the
  gallery grid, Find your next look, the owned editor, Simplify, the part card, the Dock, the shopping list).
- **The footer sentences reworded.** The look details: "A screen preview: colours are approximate, and the card shows
  the look without shadows. The Day Grid plate gives the truest read." → "Colours on screen are approximate, and the
  look card is drawn without shadows; the Day Grid plate shows them truest."; "Appearance only: whether a filament
  suits a part (strength, heat, flex) is a separate question." → "Looks only: whether a filament suits a part (strength,
  heat, flex) is a separate question." The shopping list: "Appearance only: whether a filament suits a part (strength,
  heat, flex, the printer) is a separate question." → "Looks only: whether a filament suits a part (strength, heat,
  flex, the printer) is a separate question."
- **Checks.** The buy-link e2e case reads, in both layouts, the Amazon link's rel, its plain text and title, the
  commission line as the last child of every hardware group and in no other, Amazon's sentence exactly once on the
  list, no "paid link" text, the foot's shape, the picker foot's label / rel / sentence for an Amazon and then a
  Polymaker filament, and the shopping list's plain labels and sentence; the two look-detail cases check the sentence,
  the reworded notes and that no text node reads "null" (a TreeWalker over #ws-gallery, and over #ws-shop); the Simplify
  case checks the shop note's exact words. Six mutants, each failing only its own assertion: the storeLink suffix
  restored, the `.filter(Boolean)` removed ("aside: null" in both gallery cases), the picker suffix restored, the
  commission line's appendChild removed, the old "Paid links." disclosure restored, the old footer sentences restored.
- **Review:** Sol `01a16c4a` (substantial): one finding, confirmed and fixed - with the suffix gone, the old viewer's
  `#paid-note` line for Amazon and Polymaker links shown together said "I'm also a Polymaker Ambassador." without the
  word commission (reachable on a phone, where the checklist panel stays up beside the filament menu; a desktop's
  `body.fm-open` hides it); the sentence now says it. The fix and this entry's draft went back on the same thread: two
  findings, one taken (the draft read as promising a line under each hardware row, the old planner's layout, while
  this list puts one under the section's rows - now said), one discarded (it called the `append` audit and the picker's
  2026-10-17 comment unverified; both are in the code, neither was in the payload).
- **Suites:** npm test 625 (620 pass, 0 fail, the 5 environment skips main has; 313 s); the full e2e suite with the
  Studio checkout, `E2E_SOFT=1`: 86 cases, 86 pass, 0 fail (2708 s), after the four touched cases had passed alone and
  the six mutants had each failed.
- **Deploy:** Joey decided it in words, so it deploys once the suites pass. **Live 2026-10-24 at `b368e693`** (01:53 push, live about 02:35 local).
  `disclosure-prod.mjs b368e69` passes 8 of 8 on the live site: four plain "Amazon ↗" links with `rel=sponsored`, the commission
  line under each of the two hardware groups, Amazon's sentence exactly once in the Parts foot, the picker's plain Buy label with
  the Amazon sentence beneath, a look's detail footer with the shared disclosure, no "null", and the reworded notes. The same
  script failed all eight on `2a5a11f7` before the deploy.

## 2026-10-25 · Settle toward the mount after every edit (the Under-Table report)

- **Asked:** Joey, 2026-10-25, relaying his tech-support thread: in Under-Table mode removing a unit only shifted the units
  fully beneath it; a 2W that straddled two 3Ws was left floating with its rows below, hatched voids and "!" badges, and he
  settled it by hand. The revised spec, replacing the 2026-10-21 "don't move anything automatically, just highlight the
  gap": settle after every edit (add, remove, move, resize, mount switch) - hanging and wall builds up toward the rail,
  tabletop down; each unit slides straight toward the mount until it touches the mount or any unit on that side (any
  overlap in width counts), repeated until nothing moves, never sideways; drops allowed anywhere that does not collide or
  leave the board, the settle decides the final position; one action = one undo, briefly animated; hatched voids become a
  drag preview only; what remains is structural (the both-ends support rule, sag, alignment), still counted on the badge.
- **Cause:** the 2026-10-21 settle moved only the units the both-ends rule flagged, and HELD every unit that was already
  over a gap before the edit (so a mount switch's gaps stayed slots). The straddling 2W lost one end's support, could not
  rise under the remaining 3W (a collision), and from then on was "already over a gap": held forever, with every row
  under it. `js/rules/settle.js` says this in its header.
- **Change:** `js/rules/settle.js` `settleToward(s, Rs)` - every unit, nearest the mount first, slides while `canPlace`
  allows (the grid's edge or any held cell stops it), repeated until nothing moves; nothing is held. `build.js` `edit()`
  uses it for every gravity edit; `moveCheck` refuses only a collision, the board's bounds, the width cap and the height
  cap (the "would leave a unit without support" refusal is gone), and a drop below a hanging build grows the grid down for
  the move as a placement there does (`tallFor`), in the same undo step; the removal toast names what settled ("Removed
  3W·1.5H · 2W·2H (unit 3), ... moved up against what is above · Ctrl+Z puts it all back") and the moved units pulse as
  before. The board draws the hatched open cells only while a drag is in progress (`deficit(dragging)`); the tabletop
  completion guide stays. The setup sheet settles the layout on a change of mount (moves only, adds nothing - the
  2026-10-21 "switching mounts adds no units" stands; the page reloads on a mount change, so that settle has no toast).
- **What a settle leaves:** a wide case over nothing on one end stays where it hooks and is flagged by the both-ends rule
  (a real structural issue, as the spec says); its slot is still a slot for the generator. The report's layout after both
  3Ws go has none: three 2W-2H on top, three 2W-3H, two 3W-1.5H at the bottom, 0 issues.
- **Tests:** `test/settle.test.mjs` (4 cases against the real layout rules: the report's two removals, the drop below the
  stack, the tabletop half-step, any-overlap stopping); `tools/settle-mutants.mjs` 4/4 killed (direction flipped, one pass
  with far-first order - the two alone are equivalent by design and are mutated together -, the hold reintroduced, the
  slide stopping one short); e2e `Build: Under-Table settles up after every edit` (the report's layout through the setup
  wizard, the two removals, 0 issues, the merged toast, one Undo each, the drop below the stack growing the grid, no
  hatched cell at rest).
- **Review:** Terra `01a174b5` (routine): one finding, discarded-known (no toast on the mount-switch settle - the page
  reloads on a mount change, so none could show; a comment says so); its judgment taken: `hug()` leaves the empty bottom
  rows a risen drop leaves on a hanging grid.
- **Suites:** npm test 606 (599 pass; the 2 fails were a stale run of settle.test and a feet-pool flake that passes alone and under the
  stashed tree); the settle case alone 1/1; the three cases that exercise gravity, moves and grow-down 5/5; mutants 4/4.
- **Deploy:** Joey's go 2026-10-25 ("merge settle-toward-mount onto main and push, with a live check"); merged as `5721da3`.
  The deploy's smoke step FAILED (run 40231025225): the e2e case "Joey's wall build switched to Tabletop keeps its gaps as
  empty slots" encoded the 2026-10-21 rule this entry replaces - the switch now settles his layout first, so of his four
  gaps two close (units 3, 4, 6, 7 drop a row) and the sheet says 2 slots, not 4; and, because units 3 and 4 drop, the
  tabletop's top is no longer level over columns 5-6, so after Fill all the build still waits on the "finish the top"
  guide (two 1W-1H by hand). The case now says exactly that (branch `settle-e2e-fix`). The run's second failure, the
  Colors "preset after a region pick" undo timing, passed locally and is the runner's timing flake. Lesson recorded: run
  the WHOLE e2e before a push, and grep the tests for the words of the rule a change replaces. The full local run then
  failed this entry's own case ("Under-Table settles up after every edit") on an Undo wait: the store coalesces commits
  made within 350 ms into one history entry (a drag is one undo), and the script's two removals were one round trip
  apart, so one Undo put both back - a flake that passed alone. The case now flushes history between the edits that must
  be separate undo steps, as a hand's pace does. **Live 2026-10-25 at `dbf76ba8`** (18:41 push, live 19:49 local; the
  runner's smoke step alone takes 51-65 min). The live check `settle-prod.mjs dbf76ba8` (D:\Claude - Output\
  planner-prod-checks-2026-10-18) passed every check: the two removals settle the report's layout, 0 issues, the toast
  names the settle, the drop below the stack is allowed and settles up, no hatched cell at rest.


## 2026-10-25 (every part's real printed top layer at Very High: the baked skin maps)

Joey, 2026-10-25, after the slice-based prototype on a 2W-1H EdgeLabel faceplate (`D:\Claude - Output\skin-beads-2026-10-25`):
"build the baked top-layer pipeline into the planner for every part (node0 bake per part type, shader module at Very
High, Z channel for stacked skins)". Branch `skin-map`; the maps on gen2-parts branch `skin-maps`. Not merged, not deployed.

- **What it draws.** On every face that looks along a part's build axis - the last layer, and every lower top skin a
  ledge, a step or a pocket floor leaves - the slicer's own top solid infill lines at the slicer's angle and the perimeter
  loops around every edge and pocket of that skin, from a normal map baked from the part's real G-code. Nothing is invented
  in a shader: the `?skinlines=on` trial (bed-finish.js SKIN_LINES, 2026-09-22) guessed a bead direction 90 degrees off
  the slicer's and is removed. Very High's settle samples only, like the layer lines and the powder grain's detail form
  (the block is gated on uLLOn); Fast, Balanced and High draw nothing new and never fetch a map. `?skinmap=off` draws and
  fetches nothing, for comparison; the debug hook is `skinMap` (status, set, uniforms, atlas).
- **The bake (node0, `D:/MODULITH/ops/slicing/skin_bake.py`, vault `fa67ef0`).** Per part: PrusaSlicer 2.9.4 with the
  Core One profile where the footprint fits its bed, else the XL's (the two lay the same skin: monotonic lines at 45
  degrees, 0.42 mm top infill, 0.45 mm perimeters, 0.2 mm layers - only the bed differs), `--rotate-x=180` where the
  STL sits upside down to Joey's pose; every layer that lays Top solid infill plus the last layer (a thin ridge such as
  the EdgeLabel grip's top edge is perimeters alone), its infill and its perimeters, overhang perimeters, gap fill, drawn
  as beads of their recorded width with a 0.06 mm elliptic crown (the prototype's guess, to be judged by eye); the higher
  bead wins and the Z channel records its layer; 8 px/mm; one RGBA8 PNG per part in the G-code frame (R,G the normal's
  xy, B,A the layer height in 0.01 mm) with a JSON record, keyed by the STL's sha256 + the rotation + px/mm, so a changed
  model re-bakes. ⚠ The profiles emit G2/G3 arcs (2,077 in the EdgeLabel 2W-1H file); the prototype's parser read G0/G1
  only, so its perimeter loops had gaps at every rounded corner. The race below is why the bake refuses a G-code that does not end with the slicer's own trailer line, whose parsed top differs from the max_layer_z it declares, or that stops more than 0.25 mm short of the STL's height (all 555 bakes of 2026-10-25 sat within +/-0.1 mm of it; Terra 01a1755f). Measured: the EdgeLabel 2W-1H slices and bakes in 1.9 s; the 555-part batch took 132 min of CPU (20 min slicing, 110 min rasterising 8.27 million bead segments, 2 min PNG) over a 1 h 46 min wall clock
  on node0 (numpy 2.3.5 is there; no PIL; PNGs are written with zlib); the raw set is 112 MB.
- **The frame (`tools/skin-map.mjs plan`, `tools/lib/skin-geometry.mjs`).** The GLB the stage draws and the STL the
  slicer saw are different asset sets, so the rotation between them is MEASURED, never typed: the 24 proper 90-degree
  rotations are tried; the extents must agree on every axis (x and y over the vertices above a 1 mm bottom cut - the
  case and extender STLs carry corner helper disks inside the bottom millimetre that the GLB lacks; measured 2026-10-25:
  the 185 1W-1H case STL spans 96 x 193.6 where the GLB spans 88 x 185); among the survivors the nearest occupancy grid
  wins (24 cells a side, filled from points sampled over each triangle's AREA and splatted trilinearly - triangle
  centroids read the cover tiles 1.0 apart of a possible 2.0 for the same shape, because the GLB and the STL triangulate
  the same flat faces along different diagonals; hard bins read them 0.58 apart from a sub-cell offset). A runner-up that
  is the winner turned half a turn about the build axis is harmless; any other within 0.7 of its distance refuses the part.
  Then R * axis (generate.js buildAxisForType) must be +Z (slice as it sits) or -Z (rotate-x 180): the Cover Uppers and the
  59 rails come out as 180, confirming slice_batch.py's hard-coded six independently, and the Deco handle does too (its STL
  sits top-up). The map ships in the part's own bed-plane frame q = (p . t1, p . t2), the two tangents bed-finish.js's grain
  derives from the axis in GLSL and js/skin-map.js `skinTangents` derives in JS (test-pinned to each other), so the shader
  needs no flip, swap or offset per part - only the map's origin and px/mm. The slicer's placement (the STL's own bounding
  box centred on the bed, dropped to z 0) is predicted and checked against the G-code's extrusion extents (above 1 mm, or
  the whole: a wall bracket is a thin plate with one rib) within 1 mm, else the map is refused.
- **What is baked and what is not.** 555 of the pools' 632 nodes baked (0 failed). Not: the 27 side covers (they print
  face-down, so the printed top faces the case wall; and their GLB carries the panel's surface twice, 41,050 mm2 against
  the STL's 21,467, which no frame match can read); the 25 Decor drawers of 2H and 3H outside the 240 collection (their
  STLs ship with built-in supports and no clean file exists; 240's "No Support" set is used); 21 hardware, label and handle
  nodes without a confirmed pose; the four EdgeLabel back covers 1W-15H, 1W-2H, 2W-15H, 2W-2H (the STL is another revision
  of the GLB, not a mirror - tested). One baked map is refused at shipping: GridfinityDecorDrawer_270-3W-1H, whose G-code
  reaches 18 mm past the GLB's outline on one side.
- **The coverage check (`tools/skin-map.mjs check`, `tools/lib/skin-check.mjs`).** Every shipped map read as the shader
  reads it against the GLB's VISIBLE top faces (surface-sampled, area-weighted; the GLB models the EdgeLabel's raised band
  as a solid on the plate, so 45 % of its 4.5 mm face runs on underneath as an internal face and is set aside): a sample
  agrees when the texel holds a bead within 0.45 mm of its own height. Over the 554 shipped maps: median 98.3 %, the tenth percentile 88.1 %, 22 under 80 % - all of them face-down Essential and Chevron plates (their printed top is the back, whose clips and bosses the GLB models differently; lowest 74.6 %) and one Classic Pro plate at 77.0 %; every other family's lowest map is above 84 % (cases 96.7, Decor drawers 96.1, Classic drawers 99.1, cover tiles 96.2, Gridfinity drawers 85.7, accents 84.8). The EdgeLabel 2W-1H: 97.0 % of
  7,607 mm2; the same map mirrored in q1 / q2 / both: 67.9 / 1.9 / 2.0 %. The mirrored controls mean something only where a
  part is asymmetric (a flat cover tile's mirror covers its top just as well).
- **⚠ Six bake processes in parallel on one output folder produced ten "ok" records from G-code another process was still
  writing** (a drawer with 108 of its 250 layers and no floor), found by the check (Gridfinity drawers at 7-20 %),
  re-baked one at a time, and the height guard above was added. Run the batch as one process.
- **The maps shipped (gen2-parts branch `skin-maps`, `parts/skin/<node>.png` + `index.json`).** 554 maps, 96.9 MB in all, median 156 KB, the 90th percentile 325 KB, the largest 623 KB, at 8 px/mm capped at 1.5 Mpx (308 maps scaled down, the biggest 270 cases to 3.8 px/mm) with the normal's two channels at 6 bits (64 levels: the bead flanks use about a tenth of the range; measured against 8 bits on the EdgeLabel macro, 0.01 % of the pixels differ by more than 8 levels and the mean difference is 0.2 of a level; 8 bits would have been 159 MB). The EdgeLabel 2W-1H is 74 KB. The
  brief budgeted ~160 KB a part; the 8 px/mm RGBA bake with the Z channel costs more on the big parts, and a 1.0 Mpx cap
  helps little, because the bulk is hundreds of mid-size maps (all 554 maps: 159 MB at 1.5 Mpx and 138 MB at 1.0 Mpx with 8-bit normals; 96.9 MB at 1.5 Mpx and 80.7 MB at 1.0 Mpx with 6-bit). The levers are the tool's
  `--max-mpx`, `--rg-bits` and `--families`; the raw bakes of every part stay in the work folder and on node0, so shipping
  a family later is one command. The index is the planner's one fetch (`parts/skin/index.json`: node -> file, size, q0,
  px/mm, axis, skin layers, the bake's provenance); a node without an entry is never fetched.
- **The runtime (js/skin-map.js, the atlas manager in main.js).** Part materials are shared per TYPE while a map is per
  NODE, so the node is a per-vertex attribute (aSkinId = slot + 1, 0 for none, stamped on the template like aBfMm), the
  slot's frame and atlas rectangle sit in a 2 x 64 float table texture, and every map on the stage is packed into one
  RGBA8 atlas (2048 px first, 4096 when needed, scaled down past that; 4 px gutters; the empty space is a FLAT normal).
  The normal's xy is sampled with textureGrad (its derivatives taken in the uniform branch) so a minified map averages
  toward flat; the layer height is texelFetched, never filtered, and a fragment takes the map only within 0.25-0.45 mm
  of its own height along the axis (stacked skins under an overhang go plain rather than wearing the skin above). The maps
  are fetched only while the tier is Very High (the mount's and the tier switch's sync), only for nodes the manifest
  places, decoded by a hand-written PNG reader (an <img> route premultiplies the alpha that carries half of the layer
  height), and a failed one leaves its part plain with a console warning. Measured with tools/skin-cost.mjs on the 185 2W-2H tabletop kit (this machine's GPU through Chrome, 1600 x 1000 at dpr 2, the dark stage): the moving frame's median interval with the maps on / off, in ms - veryhigh 8.5 / 8.3, high 8.3 / 8.4, balanced 8.7 / 8.7, fast 8.2 / 8.2 - identical within the vsync; Very High's settle (24 samples) with ten maps on the stage in a 4096 px atlas, three runs each: 393, 413, 465 ms on against 366, 379, 395 ms off - the medians 413 and 379, 34 ms apart, about 1.4 ms a sample (the means 424 and 380, 44 ms apart).
- **Checks.** test/skin-map.test.mjs (14): the patch composes on three r185's real shader sources after the relief, the
  bed finish and the cover edge, every block once, its normal work after the finish's plain restore and before the lights;
  the switch a shared uniform, one program; the GLSL frame pinned to skinTangents() and the Z decode to the bake's encode;
  the packer; the codec; the EdgeLabel 2W-1H map as a fixture against its GLB (97 % agreement, the controls under 68 %;
  the label window empty, the plate around it skin, the REMOVE tab along the window's lower edge, the perimeter bead's
  flank leaning into the opening on both sides); main.js's wiring and the trial's absence; the pages.yml stamp. The feet
  test reads only numeric pool folders. An e2e case: Fast fetches no map (no request to parts/skin/) and holds none, the
  switch reaches the uniform; the whole e2e suite on the branch with the maps served from the checkout: 87 of 87, 8.1 min on the GPU. npm test: the first full run (before the two fixes) was 637 tests, 627 pass, 5 fail, 5 skipped - the feet test, the smoke test's three cases and their parent; after the fixes the feet test (4 of 4) and the smoke test (4 of 4, with GEN2_PARTS_LOCAL=1, since it reads the maps from the checkout - see the deploy order) pass alone, and the full suite re-run with GEN2_PARTS_LOCAL=1 reads 639 tests, 634 pass, 0 fail, 5 skipped (the two new fixture tests included). Goldens (TOL 8 per channel, THRESHOLD 0.1 % of a shot's pixels): with the maps ABSENT (the live parts host) 60 of 60 pass
  at Very High and Fast, so the shader patch alone changes no shot beyond that tolerance; with the maps on (GEN2_PARTS_LOCAL=1) also 60 of 60 pass: at the goldens' whole-build distance (about 2.4 device px per mm) the mipmaps average the beads to flat, so the goldens cannot see the feature within their tolerance and need no re-blessing.
  Mutants: 15 of 15 killed, each by the test that names its defect (the settle gate, the top-skin weight, the Z decode and gate, the tangents on both sides, the finish guard, the tier gate, the flat atlas fill, the gutter, the resampler, the PNG filter, the mount's and the tier switch's sync, the slot's +1, and the shipping tool's transpose - that last one is a no-op on the EdgeLabel, whose frame is a pure sign flip and its own transpose, and is caught by a second fixture, the CL-185-1W tile, whose frame is a quarter turn: the outermost bead must lean outward on all four edges). ⚠ A first run showed two kills that were artefacts of the runner (its re-ship had refreshed the fixture PNG from a newer bake without its JSON); read which test killed a mutant. Proof shots (`tools/skin-shots.mjs`, `D:\Claude - Output\skin-map-2026-10-25\shots`, the map on
  and off at the settled Very High frame, next to the FaderBox print-finish stills in reference/): the EdgeLabel plate,
  macro and window; a cover row and macro - the visible top of a cover row is the Cover Upper's BED face, so on and off
  are the same there by design; a Decor drawer fully out, its rim's beads from above. Pixels changed by more than 8 levels between on and off (the accumulator restarted by invalidateFrame, no camera nudge - a 0.01 mm nudge alone moved the powder grain on 3-8 % of a frame): covers-macro 0.00 %, covers-row 0.00 %, drawer-macro 0.80 %, drawer-rim 0.21 %, edgelabel-macro 3.80 %, edgelabel-plate 1.62 %, edgelabel-window 3.61 %.
- **⚠ The deploy order.** The planner's smoke test asserts nothing on the console, and until gen2-parts carries
  `parts/skin/index.json` the live host answers 404 (a Very High visitor's one request): the smoke step passes locally with
  GEN2_PARTS_LOCAL=1 and FAILS against the live host. So gen2-parts (branch `skin-maps`) publishes first, the planner
  merges after. Nothing else in the planner changes for the other tiers.
- **Review:** Sol `01a174ad` (substantial, the runtime): two findings, both confirmed and fixed in 5f3e295 - the atlas's
  empty space was cleared to 0, a (-1,-1) normal the mipmaps blend into every map's minified edge, now 128 (flat); the
  packer's 0.9 steps never tried its floor scale. Terra `01a174b0` (routine, the bake and the frame maths): one finding,
  confirmed and fixed in vault fa67ef0 - a full-circle arc read as a zero sweep (none in the real file; G-code allows it).
  Sol `01a17542` (substantial, this entry as the architecture note): five findings, all confirmed and corrected here and in the
  vault's copy - an npm total quoted without re-running the suite after the two fixes, the settle overhead understated (the
  medians are 34 ms apart, not 25), the 6-bit comparison counting only differences over 8 levels, "moves no pixel" claiming
  more than the goldens' tolerance proves, and the 1.0 Mpx figure lacking its precision.
- **Deploy:** **Live 2026-10-25 at `720be857`** (Joey's go 19:30 local: gen2-parts master `d0b7999` pushed first, live
  index 554 nodes; the planner's merge `720be85` pushed 19:57, the run succeeded 20:46; main had moved twice during the
  tests - the settle rule `dbf76ba`, then its Live line `323ee5d` - both merged into the branch first, so the pushed tree
  equals the tested one). On the merged tree: e2e 88 of 88; npm test 643 (637 pass, 5 skipped, 1 fail: `surprise.test.mjs`
  M13's timing gate at 2.3 s while a 555-STL pass loaded the CPU - alone it reads median 0.41 ms, 11 of 11). The live check
  (`live-check.mjs` and its result `live-check-720be857.json`, both in the work folder): the 185 tabletop kit
  at Very High, `?debug=1`, settled 24 of 24 samples with 10 maps on the stage in a 4096 px atlas, every `parts/skin/`
  request 200, no failed map, 0 console errors; 8 warnings, none from the maps - GoatCounter's skipgc notice and ANGLE's
  HLSL notes on three.js's 255/256 packing constant (X4122) and gradients inside the Very High passes' loops (X3595);
  skin-map.js's GLSL has no loop and reads the atlas with textureGrad and texelFetch only. The github.io address now
  answers 301 to `planner.modulith.systems`, so a stamp watcher must follow redirects. The bake's completeness guard
  was strengthened the same evening (vault `9997f06`, Terra `01a1755f`; the race paragraph above).

## 2026-10-25 · A peeked drawer stays open across a rebuild

- **Asked:** Joey, 2026-10-25, with four screenshots: Peek inside on a 3W-1.5H Decor drawer, then Drawer Standard ->
  Gridfinity in the inspector; the new drawer loaded closed under a button still saying "Close it"; pressing it did
  nothing visible, the button flipped to "Peek inside", and only then did it open. "I'd rather if the drawer is opened
  and the type is changed, it remains open."
- **Cause:** `js/workspaces/build.js` syncStage() rebuilds the stage (`stage.update`) on every manifest change, which
  replaces every instance; the stage's open carrier and the Build workspace's `st.peeking` both pointed at the old
  drawer. The button read `st.peeking`; its press ran `stage.unpeek()` on the dead instance.
- **Change:** syncStage() lets the stage's open drawer go before the update (`stage.unpeek()`, so its dims pills come
  back) and peeks the same unit again on the new stage after it (`stage.peekUnit`), only if the unit is still the peeked
  one (a select or a removal during the await may have let it go) and the update succeeded; a unit with no drawer any
  more (a shelf) leaves the button at Peek inside. Any rebuild keeps a peeked drawer open, not only the drawer's own.
- **Tests:** e2e `Build: a peeked drawer stays open when its type changes to Gridfinity, and Close it still closes it`
  (the drawer found by part type: a node-name match takes Drawer_Stoppers_L first; the proof is the new drawer's travel
  on Close it, since the Gridfinity drawer rests at another z than the standard one). Run against the unfixed build.js
  it fails on that travel.
- **Review:** Terra `01a175a2`: 2 of 5 taken (restore only while `st.peeking` is still the peeked unit; the pills
  round-trip confirmed), 1 discarded (stale `st.stageErrors` - syncStage clears it before the update on every pass).
- **Deploy:** a bug Joey reported, so it deploys once the suites pass. **Live 2026-10-25 at `2bf7cad1`** (20:40 push,
  live 22:05 local, queued behind the skin-map deploy). The live check `peek-prod.mjs 2bf7cad1` (D:\Claude - Output\
  planner-prod-checks-2026-10-18) passed: Peek inside opens the drawer to base + 171.5, the switch to Gridfinity leaves
  the new drawer open under a button still saying Close it, Close it brings it back by 171.5, the button says Peek inside.

## 2026-10-26 · The deploy workflow in parallel jobs: docs-only pushes run nothing, the e2e in six shards, the image's own Chrome

- **Asked:** Joey, 2026-10-25, decided with Astra's review: a four-line fix and a docs paragraph each cost an hour on the
  runner. One bounded task, in order: report the measured baseline first; skip documentation-only changes (a NARROW list);
  cancel superseded testing without ever interrupting a publish or letting an older build publish over a newer one; shard
  the e2e with verified coverage and isolation; move interaction cases to Fast only case by case; cache nothing without
  evidence; benchmark on real runs. The stamping and the module-graph guard stay as they are.
- **The baseline (measured before any change).** Actions API, nine runs on main: npm test 0.1-0.2 min; the one browser
  step (npm ci, `playwright install --with-deps chromium`, smoke, profile-lands, relief-tier, all of the e2e) 30.5-68.0 min;
  deploy-pages 0.12 min; queue 0.1 min. Split into one step each on branch run 40257169401 (4470c7b, otherwise unchanged):
  npm test 0.13, npm ci 0.07, the Playwright install 4.78, smoke 0.65, profile-lands 0.42, relief-tier 0.27, e2e 42.93 min
  (84 ran, 5 skipped). Its notice: every suite launched the image's own Google Chrome ("channel chrome 155.0.8059.39"),
  never Playwright's Chromium. The slowest cases on the runner: the stale-tab guard 135.8 s, hover hints 133.9 s, the
  Studio's Add to planner 127.9 s, Joey's wall build switched to Tabletop 125.6 s, Labels: EdgeLabel 107.2 s, the top bar
  at every desktop width 102.4 s. Nine of the 28 runs before this were pushes of docs/redesign/*.md alone: 287 of 1155
  runner minutes.
- **Documentation-only pushes run nothing:** `paths-ignore: docs/**, *.md` (the root's Markdown only). Not models, fonts,
  images, kits, configuration or the README files inside served folders: each changes what is published or what a visitor
  gets. workflow_dispatch ignores the filter.
- **Jobs:** unit (npm test), build (the stamping, the guard and the site artifact, byte-identical to before and now minutes
  in, so a forgotten sed line fails before the browser suites finish), browser (the three short suites), e2e x6, e2e-coverage,
  deploy. **Concurrency is per job, not per workflow:** each test job has a group per ref (and per shard) whose
  cancel-in-progress is the run's FIRST attempt only; the deploy queues in `pages-deploy` without cancel-in-progress, so a
  publish in progress always finishes and a waiting deploy is replaced by a newer one. The old workflow-level
  `pages` + cancel-in-progress could cancel a run mid-publish. **The freshness check:** the deploy publishes only if main's
  tip is this commit, or differs from it in docs/** and root *.md alone (the same two patterns); otherwise the newer push's
  run publishes. The deploy needs unit, build, browser, every e2e shard and the coverage job.
- **The shards** (e2e/shard.mjs): workspaces.mjs collects its 89 `test(...)` calls and registers this process's share at
  the end of the file. Each case is identified by its position; the split puts the longest case first onto the least-loaded
  shard, weighted by e2e/shard-weights.json (a whole soft-render run's durations; a case without a weight counts as the
  median, so stale weights only unbalance). Each shard writes a report (the case list's hash, the weights' hash, its
  positions); `tools/e2e-shard-gate.mjs` fails unless all n shards agree and every position ran exactly once.
  test/e2e-shard.test.mjs proves the partition on 300 random lists. **Isolation:** each shard is its own runner; the file
  serves the app on port 0, opens fresh contexts per case and writes nothing to disk. **Locally, soft render (E2E_SOFT=1,
  no Studio, as the runner):** serial 1864 s; the four shards one after another 441 / 407 / 379 / 433 s, 22 / 22 / 22 / 23
  cases, all passing, the gate: 89 cases each run exactly once.
- **Fast tier:** already done case by case since 2026-10-13 (the harness pins `fast`): 86 of the 89 cases run on Fast.
  The other three keep their tiers because the tier is what they test: Colors step 2 and the product-preview case
  (Balanced, a tone-mapped tier's match to the screen) and the Quality pill (the tier switch). Nothing moved.
- **The browser and caching:** no cache of either kind. npm ci costs 4 s, so dependency caching would save nothing; the
  Playwright install cost 4.78 min a job for a browser no suite opened. `tools/ci-browser.mjs` launches the image's Chrome
  first and installs Playwright's Chromium (with its system packages) only if that fails; either way a notice names the
  browser the suites got.
- **Failure text and timings:** `tools/ci-named.sh` is the former inline named() (a failure names itself in the
  annotations), plus one notice per suite with its slowest cases (`tools/tap-durations.mjs`), readable through the API
  without signing in.
- **Review:** Sol `01a1762e` (substantial): 2 findings, both confirmed and fixed - a manual re-run of an older main run would
  cancel the newer run's tests through the ref-only groups and then fail the freshness check, leaving the newest code
  unpublished (cancel is now first-attempt only); the deploy's docs pathspec differed from the push filter for a root file
  named `docs` (now `:(exclude,glob)docs/**`, checked in a scratch repo). Four questions answered "holds": no older build
  publishes over a newer one, no deploy without every shard and the gate, unsharded registration unchanged, a missing
  system package fails a required job rather than passing a deploy.
- **After (benchmark, branch runs; the deploy job skipped there, being main's alone):**

  | run | wall clock | e2e shard steps (min) | the rest |
  |---|---|---|---|
  | 40257169401, the baseline (old steps, split) | 49.6 min | one serial step, 42.93 | install 4.78, short suites 1.34 |
  | 40262875906, four shards (d3edeaa) | 17.8 min | 7.52 / 12.73 / 16.92 / 16.28 | browser job 1.4, unit 0.4, build 0.2 |
  | 40264684655, six shards (2a10d49) | 11.4 min | 5.43 / 8.47 / 10.27 / 10.68 / 5.07 / 5.12 | browser job 2.1, unit 0.4, build 0.1 |

  Every test job passed on both (the deploy job skipped, as on any branch), all on the image's Chrome 155.0.8059.39 (the
  browser check 6-14 s a job on the four-shard run), the coverage gate
  green (89 cases, each once: 22/22/22/23 and 14/14/14/16/15/16). **The shard count is six, and the spread is the
  machines:** the four shards carried equal weighted loads (486 s each by the weights) and their runner/local medians were
  0.98 / 1.49 / 1.76 / 1.86, so re-weighting cannot fix it; the run waits on its slowest runner, and smaller shards bound
  that. Two runs are two samples of the runner pool, not a distribution: expect roughly 10-18 min, not a promise of 11.
  Summed, the shards' e2e steps took 53.5 min (four) and 45.0 min (six) against 42.9 serial - the same machine spread,
  plus a boot per shard. A docs-only push now runs nothing; before, 50-66 min.
- **Not done here:** the weights stay the local soft-render run's (within one machine the runner's proportions follow
  them); the runs-on 26.04 note is untouched.
- **Live 2026-10-26 at `1018463c`** (Joey's go; the merge of ci-speedup). Main run 40316065152: 13.7 min wall, every job
  green, e2e shards 12.6 / 7.5 / 11.2 / 11.4 / 8.3 / 5.8 min, the deploy job's freshness check passed and deploy-pages
  published - the first run of the deploy as its own job. The live planner serves `boot.js?v=1018463c`, and
  `peek-prod.mjs 1018463c` (D:\Claude - Output\planner-prod-checks-2026-10-18) passed with no page errors. This Live
  line is a docs-only push: by the new filter it starts no run.

## 2026-10-26 · A part's own build plate finish (Faceplates Holographic, the rest Powder-coated)

- **Asked:** Joey, 2026-10-26, with two screenshots of a 165 Tabletop 3W-2H in Chevron faceplates: the plate finish is one
  choice under Colors, but "i'd like everything except the faceplate to be printed with the powdercoated, and the faceplate
  holographic, maybe it can be an option when selecting a certain part type". The code had reserved the model since
  2026-09-14 ("a part inherits the build's finish unless it has its own").
- **The record:** `plateParts`, the planner's own field like `sideCovers`: part TYPE -> one of powder / smooth /
  holographic; a type not in it follows `buildPlate`. Per type, for every unit of it, because it is the sheet a part
  printed on, not a colour region: a faceplate's Body and Face share it. sanitize keeps only a known finish on a plain type
  name (at most 32) and always writes the map, `{}` for every older record, share link and file.
- **The stage (js/main.js):** `plateFinishFor(key)` is what a material wears, `plateProfile()` stays the build's. A part
  with its own finish gets its own uniforms object, sharing every entry with the build's except the two that say which
  finish (uPC, uBfHoloOp), so the build's Powder <-> Smooth write passes it by while every settle sample's grain and layer
  lines still reach it. Holographic picks the holographic program per part; the face-down Essential and Chevron transfer
  follows the Faceplate's own-or-build finish. `syncBedFinish` purges every material registry when the map changes, from
  the one place every path reaches (a pick, Undo, a reload, a share link). Preview thumbnails key on the map.
- **The UI (Colors):** the filament picker gains "Printed on": the three finishes for all of that part type, with "Use the
  build's finish". Clicking the inherited finish pins it (it then stays when the build's changes). The left panel lists
  the parts with their own finish, each with "Use the build's". Each change is one undo step; app.js hands an undone map
  back to the stage, as it does the build plate.
- **Tests:** test/plate-parts.test.mjs (the record's rules, 2/2); store and parity tests carry the new field. e2e "Colors:
  a part's own build plate finish": Faceplates own Holographic on a Powder build; the build to Smooth moves the rest and
  leaves them; Case own Powder-coated on a Smooth build (a uniforms-only difference); Undo x3, Redo; a reload keeps it;
  "Use the build's" from the list; the pin. Read off the live materials (`bedFinish.wearing()`). Five mutants each fail
  it (own uniforms ignored, the purge ignoring the map, the holographic program from the build only, the undo hand-back
  removed, sanitize dropping the field). A Playwright run on a decor + Chevron build at Very High: the faceplates wear the
  face-down holographic transfer, every other type Powder-coated, no page errors, 8 px between the row's pieces; shots in
  D:\Claude - Output\plate-per-part-2026-10-26.
- **Review:** Sol `01a178a5` (substantial): 1 finding, confirmed and fixed - clicking the inherited finish did nothing, so
  it could not be pinned. Five questions answered "holds".
- **Not done:** the old planner's relay does not carry the map (the old planner forwards since the cutover); the old
  viewer's own Build plate row stays build-wide.
- **Live 2026-10-26 at `7e54f4a1`** (Joey's go; main fast-forwarded to the branch). Main run 40346580980: 13.1 min, every
  job green, the deploy job published. `plate-parts-prod.mjs 7e54f4a1` (D:\Claude - Output\planner-prod-checks-2026-10-18)
  passed on the live planner: the Faceplate row's Printed on row, Holographic set for the faceplates on a Powder-coated
  build, the record `{ Faceplate: 'holographic' }`, the faceplates wearing their own Holographic and the 10 other part
  types Powder-coated, no page errors; its screenshot sits beside it.

## 2026-10-26 · Polar Filament PLA joins the filament catalog (44 colours)

- **Asked:** Joey, 2026-10-26: Polar Filament is his local maker (Troy, Michigan); add their colours, skipping what
  cannot be drawn accurately (marble, no colour code). "We can just put them in with their published hex"; and a
  filamentcolors.xyz spectrophotometer scan of printed material "is probably more true than even if i bought a NIX".
- **The list:** every 1 kg 1.75 mm PLA spool Polar's shop sells (polarfilament.com, collections/pla-1-75mm) that has a
  colour code in their colour list (pfil.us/colors.php), joined by SKU; each colour links to its own product page (all
  44 answered 200). The hex is the filamentcolors.xyz scan where one exists (11; CC BY 4.0; Rust and Teal there are
  Chestnut and Squid now, as the product addresses still say), else Polar's published hex (33), their target colour:
  the 10 compared differ by a median dE76 of 27 (Spaceship Steel published #D1D1D1, measured #787E82). No TD: opaque PLA
  never reads one. Left out: Arctic White and Robotic White (on sale, no colour code), the Mystery Spool, and 25
  colours the shop no longer sells. The missing list is kept for Joey to source.
- **What moved with it:** the looks generator's pools gained Polar colours (each style's shells and accents, checked
  as additions only); `shortName` drops the "Polar " prefix; a second brand line named "PLA" is told apart by brand in
  the label test. A Surprise me bug the bigger catalog exposed: two candidates of one roll could share a title when
  neither had a third colour to tell them apart (style any, seed 42: "Lime & wine" twice); such a candidate is now
  rolled again. Over 1,000 rolls (every style, seeds 1-200) the old generator gave 2 duplicate titles, the new one 0,
  and neither returned a roll with fewer than three looks.
- **Tests:** npm test 645 pass / 5 skipped / 0 fail; the 30 Colors, Parts and buy-link e2e cases (two pinned picker line
  lists gained Polar's line); the picker shows "Polar
  Filament PLA · 44" with its PLA tag, and a pick's Buy line links Polar's product page (no commission line: not a paid
  link). Terra `01a179ef`: one finding (the reroll could starve a roll), measured and discarded - 0 short rolls in 1,000.
- **Live 2026-10-26 at `16dc1a15`** (Joey's go; main fast-forwarded to the branch). Main run 40402177138: 12.9 min, every
  job green. `polar-prod.mjs 16dc1a15` (D:\Claude - Output\planner-prod-checks-2026-10-18) passed on the live planner:
  the Faceplate picker's "Polar Filament PLA · 44" group with 44 swatches, Polar Squid picked into the palette, its Buy
  line linking Polar's product page plainly (not a paid link), no page errors; its screenshot sits beside it.

## 2026-10-26 · The see-into infill lattice is on by default; Chevron face strips read it twice as strong

- **Asked:** Joey, 2026-10-26, after Chevron faces in Panchroma Translucent Natural showed no infill: "regardless in real
  life you would see infill still because the faces are all transparent"; then "turn the infill lattice on by default for
  translucent parts. Measure its frame cost first, keep the performance fallback, and look at making it read a little
  stronger on Chevron strips."
- **What it was:** the buried lattice (js/see-into.js, 2026-09-21: a translucent part's own perimeter walls and grid infill,
  with parallax) ran only behind `?silattice=on`, in the old viewer and the planner alike; nothing was lost in the move.
  Chevron strips are 2 mm deep over a 4.2 mm backer at a 14 mm pitch (vault measurements.md), about 13.75 mm wide, wide
  enough for grid infill under the pocket rule; with the switch on they did show it, faintly.
- **Change:** on by default; `?silattice=off` takes it away for comparison, `?silattice=flat` stays. A per-material lattice
  gain (`uSILatGain`, default 1, the cap uSILatCap still holding); main.js gives the Chevron FACE zone 2
  (CHEVRON_FACE_LATTICE_GAIN, by eye from 1 / 2 / 3 shots in D:\Claude - Output\lattice-default-2026-10-26); every other
  part keeps the lab's 1. The see-through's fallback (SEE_INTO_DETAIL_LIMIT, 250 visible part meshes) is unchanged and
  still removes the whole see-through, lattice included, on a bigger build.
- **Measured cost** (A5000 laptop, 3200 x 1800 drawing buffer, Very High, camera moving, uncapped, the lattice uniform
  toggled in 8 paired rounds within one page load; the toggle confirmed live by a still-frame difference on 43 % of
  pixels), on a laptop with nothing else on the GPU (the done-scene session held off; GPU 0 % before the run): a 12-unit
  Essential build in translucent faceplates 2.7 -> 2.9 ms a frame, paired median +0.2 ms; a 12-unit Chevron build, face
  and body translucent, strength 2, 4.1 -> 5.3 ms, paired median +0.9 ms - inside a 120 Hz frame (8.33 ms) either way.
  ⚠ Two earlier runs overlapped GPU work in another session (Joey caught it) and read 6-8 ms frames with a 4-8 ms spread
  inside one arm; they are not the record. Lesson: two sessions benchmarking one GPU skew each other - say so first.
- **Live 2026-10-26 at `64dedfa4`** (Joey's go; main fast-forwarded to the branch). Main run 40415031884: 12.7 min, every
  job green. `lattice-prod.mjs 64dedfa4` (D:\Claude - Output\planner-prod-checks-2026-10-18) passed on the live planner
  with no URL switch: Very High, a Chevron build with a Silk Black body and Translucent Natural faces, the lattice on by
  default, both Chevron face strips baked, the faces visibly changed by the lattice (the same view off and on; its pair
  of shots sits beside it), no page errors. The other session was told before and after (one GPU).

## 2026-10-26 - The Done scene's first CI run: ten room cases skipped on a software rasteriser, for now

- **What happened.** The done-scene merge (main `69d88ea`, run 40425689471) failed five of its six e2e shards, every
  failure a Done-room case, the first time those cases had run on the CI runner (the branch was never on main). The local
  passes before the push had all run on the laptop's GPU: the e2e uses SwiftShader only with `E2E_SOFT=1`.
- **Measured.** Under `E2E_SOFT=1` 7 of the 10 failing cases fail here, and on `f9cf01a` (the branch that morning, before
  that day's rendering work) the same 8 fail with the same messages: not regressions. On SwiftShader the entrance is
  judged slow and the scene locks off (as designed); with that bound lifted it plays the GPU's plan for the same seed, and
  the cases miss short wall-clock windows (a 1.5 s hold, a 0.8 s fade, a cut) between their polls.
- **One product defect, fixed.** Very High's supersampling ran on a software rasteriser and starved the lens burst (2 of
  128 samples in 90 s at 2560 x 1440). main.js A SOFTWARE RASTERISER reads the renderer once (SwiftShader, llvmpipe,
  softpipe, Basic Render); superCap leaves the ratio alone there.
- **Joey's call: ship now, skip them on a software rasteriser only, make them runner-safe as a follow-up.** The suite
  reads the rasteriser from its launched browser (`SOFTWARE_GL`; Sol `01a17823` round 29: not from `CI`, which would skip
  them on a hardware runner too), and ROOM_SOFT_SKIP skips exactly the ten. They still run on a GPU locally.
- **Kept in CI.** A new case drives supersampling straight on the stage, with no scene and no clock: twice the screen's
  ratio on a GPU, never on a software rasteriser, and the ratio back after; a mutant without the guard fails it. The strip
  case now waits for its fade, not a fixed 400 ms. Already in CI and not skipped: the Room default and Neutral clean-up
  (the frosted-window case), the room's failed load (Neutral back, no Room on a remount), and `?done=off` (the default of
  every non-visitor case).
- **OPEN (Sol round 29).** The skipped cases guard the grammar, the lens, the mounts, the desk and steam, the strip, the
  spool click and Reset view; none runs in CI until the follow-up.
- **Live 2026-10-26 at `4a9e3cf6`** (Joey's go: "i think we are good to go live with this"). The final scene, the room
  for every visitor, Room | Neutral, Showcase, the spools and their swap, the frosted window, and the day's shadow, AO
  and supersampling work. Main run 40435163187, every job green, live 17 min after the push. Checked on the live planner
  (`D:\Claude - Output\done-scene-spools-2026-10-26\live`, ?skipgc=1, High): Colors on the room with no flag, Room |
  Neutral and Showcase shown, every script and the three scene modules stamped `v=4a9e3cf6`, Showcase into the final
  scene with "Back to Colors", no page errors. The other session held its pushes to main until then.

## 2026-10-26 - Colors on a phone: the picker's filaments show again (`70924c4`)

Joey, on his phone: "under the column tab, I selected the side cover and I don't think filament colors actually show up on
mobile at all". The picker's `.brands` list kept its desktop `flex: 1 1 auto; overflow: auto` inside the phone's bottom
sheet, which is itself the scroller, so the list shrank to the sheet's leftover space - 100 px at 412x915, 61 px in the
e2e - and its swatches sat clipped below the chips. Fix (css/app.css, phone media block only): `#ws .sheet#ws-picker
.brands { flex: none; overflow: visible; }`, so the list takes its full height and the sheet scrolls it. Desktop
unchanged (267 px). New e2e case "Colors on a phone: a region's picker shows its filaments at their full height, the
sheet scrolling them" passes on the GPU and under E2E_SOFT=1; with the rule removed it fails (61 px). Terra: no defect.

- **Live 2026-10-26 at `70924c42`** (a bug Joey reported: deploys once checks pass). Live 19 min after the push. Checked
  on the live planner at Joey's phone size (412x915 at 2.6, `picker-live.mjs`, ?skipgc=1): the Side cover picker's list
  1471 px tall with 162 swatches, the 512 px sheet scrolling 1882 px, no page errors (the one console error is the
  aborted analytics request). The other session held its pushes to main until then.

## 2026-10-27 - Phone sheets: the Parts list full height, the picker's rows tightened

Joey, on his phone the day after `70924c4`: "sometimes I only get a sliver of the menu to work with... maybe there are a
few other things we can resize or tighten for mobile". His screenshot was the picker as it was before `70924c4` (its
list scrolled inside a ~56 px box; a tab opened before that deploy keeps its old stylesheet). The live picker at his size
(412x772) measured fine, so the audit went to every phone sheet (`sheets-audit.mjs`: each sheet opened, every element
that clips its own content, every control shorter than its natural height). Found:

- **Parts**: the list (`.body`, the desktop's scroller, flex 1) was one row tall - 83 px of 2766 - scrolling inside the
  sheet. Now `flex: none; overflow: visible` in the phone block, as the picker's list: the sheet scrolls it.
- **The picker's search**: 19 px of its 36 (a bare input in the sheet's flex column shrinks; a div does not go below its
  content). It now sits in `div.find`, on the spool's picker too.

And the picker, tightened on a phone (110 px more for the filaments at 412x772): its title row is hidden - the sheet's
handle names the region (now with the unit's number, and "Spool · <filament>" on a spool) and carries the × (phone.js
`close` on a panel spec; the handle's keydown ignores keys aimed at the ×, Sol 01a17d29); the search shares a row with
the material chips (`.find` is `display: contents` on a desktop, so the desktop column is unchanged); Buy shares a row
with the reset, the disclosure line under both. The spool's picker foot still said "Buy X → · paid link" with its own
wording - now the plain label and `disclosureFor()`, as every other surface (the 2026-10-24 rule).

The disclosure's own wording is unchanged: the old planner's reduction (591e7bb, the old viewer's `paidNoteText`) was
saying it ONCE per surface, beside the links, which the picker already does; with the list at full height the line sits
at the end of the scroll, under the swatches, not over them.

A generic `#ws .sheet > * { flex-shrink: 0 }` was tried and dropped: its mutant survived (nothing shrinks without it once
the search is wrapped), so it was a claim no test could fail. Mutants on what stayed - the Parts rule, the `.find` row,
the hidden title row, the reset's grid placement, the keydown guard - each fail the phone picker case. Phone e2e set: GPU
18/18, SwiftShader 17 + the room's spool case skipped there; unit tests 670/670. Sol 01a17d29: one P2 (the keydown),
fixed; round 2 no objection.

- **Live 2026-10-27 at `358870d1`** (a bug Joey reported: deploys once checks pass). Main run 40499232643, every job green
  (shard 6 the slowest, ~25 min to live). Checked on the live planner at Joey's S23 size (360x675, `picker-space.mjs`,
  `sheets-audit.mjs`, ?skipgc=1): the picker's title row hidden, the search and chips on one 36 px row, the list at full
  height (1309 px) in the 378 px sheet; the Parts sheet clips nothing (3764 px scrolling); no page errors.

## 2026-10-27 - Phone: the part card sits under the model; the drawer's pills side by side

Joey, on his S23 (360x675 in his browser), Colors, a faceplate tapped, Open the drawer: the drawer opened behind the part
card. Measured: the card (193 px, three rows) sat over the model, because the stage's safe area knew only the sheet
handles (bottom 214), so the guided camera framed the build under the card; the opened drawer's inside W / L / H pills
then piled on each other in what was left; and the card said "4 of this sizes".

- **colors.js `phoneBottom()`**: on a phone, with the card shown, the safe area ends at the card's top + 8 px (unless the
  band left is under 120 px). The stage re-fits a guided camera to the new free region as it does for any panel; a
  camera the visitor has taken stays put.
- **The card, shorter** (phone CSS): the region chips and the actions (Open the drawer, a download) share one wrapping
  row under the title: 193 -> 153 px.
- **`placePills`**: when no height above or below is free, a pill goes beside the others at its height - the candidates
  are just clear of each placed pill's edges, nearest first (Sol 01a17d42: fixed steps from the line point missed a gap
  that fits). Unit tests: the S23 band, and Sol's counter-example.
- **"N of this size"** (n() pluralised the whole phrase).

Not done, on purpose: a peek never moves the camera (2026-10-21, the Build Peek inside e2e pins it), and the drawer slides
toward the camera past the framed build, so in the studio view its front lip can reach the card's edge - 88 % of the
opened unit shows above the card at 360x675 (11 % before); in the room it all shows. The e2e asserts >= 75 %.

Measured, not changed - THE PHONE ON ITS SIDE: at 780x260 (the S23 in landscape, the browser's bars included) the top
bar and tools take 110 px and the dock and tab bar 124 of the 260, so the model gets 26 px, and an open sheet (its 160 px
floor) runs off the top. Needs a layout of its own; Joey's call.

New e2e case "Colors on a phone: a tapped part's card sits under the model, framed above it, its chips and Open the
drawer on shared rows" (360x675; e2e `open()` takes a phone `viewport`); its mutants (phoneBottom returning the handles'
line; the card's display: contents) fail it. Phone + Peek inside e2e 21/21 on GPU and SwiftShader; unit tests 672/672.
Sol 01a17d42: one finding (the pills' candidates), fixed; round 2 no objection.

- **Live 2026-10-27 at `4af94488`** (a bug Joey reported: deploys once checks pass). Main run 40502509791, every job
  green (shard 6 again the slowest; live ~25 min after the push). Checked on the live planner at 360x675
  (`drawer-card.mjs`, ?done=off&skipgc=1): the card 153 px, the safe area ending at its top (381), 88 % of the opened unit
  above it; no page errors.

## 2026-10-27 - The peek's pills: Build only, and only zoomed in on the drawer

Joey, seeing the three pills piled on a drawer smaller than they were: "maybe only make the pills show up in build when
they zoom in on the drawer". So:

- **Colors' Open the drawer shows none** (`peekUnit(id, { pills: false })`): the inside sizes are Build's.
- **Build's Peek inside shows them only while they fit**: their area at most a fifth of the open drawer's box on the screen,
  clipped to the canvas (main.js `peekPillsFit`; hidden again only past 1.2 times that, so a zoom resting on the line does
  not flicker; a corner behind the camera hides them unless the camera is inside the drawer's box). Measured: at Build's
  own framing on a 1280x800 desktop the drawer is 279x262 px and the pills cover 10 % (shown, as before - the Peek inside
  e2e pins it); on the S23 (360x675) it is 142x138 or less, 25-37 % (hidden until a zoom).
- `enterDrawerFocus` takes `pills: 'all' | 'fit' | 'none'`, set on every entry, the same drawer again included: 'all' is
  the old viewer's own drawer focus (its camera swings onto the drawer), unchanged.

Unchanged: a peek never moves the camera. New e2e cases "Build on a phone: Peek inside opens the drawer without its pills
at the phone's own framing" and "Colors: the card's Open the drawer opens it with no W / L / H pills, on a desktop where
Build would show them"; the phone card case asserts no pills too. Mutants (Colors without `pills: false`; the fit always
true; always false) each fail a case. Phone + Peek inside e2e 23/23 on GPU and SwiftShader; unit tests 672/672. Sol
01a17d58, four rounds: a corner behind the camera read as zoomed in; `pills: false` lost outside a peek; a same-drawer
entry kept the last entry's option; Build's peek on a viewer-focused drawer skipped the check - all fixed by the mode set
on every entry; round 4 no objection.

- **Live 2026-10-27 at `6a30db3`** (17 min after the push). Checked on the live planner (`peek-size.mjs`,
  `drawer-card.mjs`, ?skipgc=1): Build on a 1280x800 desktop, Peek inside - the three pills shown (10 % of the 279x262
  drawer); Build at 360x675 - none (the drawer 142x138); Colors at 360x675, Open the drawer - none; no page errors.

## 2026-10-27 - The phone on its side: a rail, one row, a column

Joey: "Build a landscape phone layout: the tab bar as a left rail, the top bar and tools on one row, sheets opening as a
side panel, so the model gets most of the screen." His S23 in landscape is 780x260 in the browser; the portrait chrome
(top bar + tools 110 px, dock + tab bar 124) left the model 26 px, and an open sheet (its 160 px floor) ran off the top.

`@media (max-width: 1023px) and (orientation: landscape) and (max-height: 500px)` (app.css THE PHONE ON ITS SIDE; the
same string is phone.js `SIDE_MQ` / `isSideways()`):

- **The tabs a 64 px rail** down the left.
- **The bar and the tools one row**: the wordmark gives way, the build switcher is 20vw (156 px at 780, so Build's seven
  tools keep their 44 px), the tools start where the bar ends (phone.js writes `--top-r` on every stack), and more tools
  than room scroll the row rather than squeeze (667x340: Build's scroll).
- **A column on the right** (`--side` min(340 px, 44vw)): the sheets, stacked over the dock or the Assemble player as in
  portrait, read off the floor element's own top (so a screen's bottom inset is in it, Sol 01a17da4); with under 160 px
  above the dock an open sheet takes the whole column over it (190 px at 260 tall); at 844x390 it sits above the dock
  (258 px). The player caps its height and scrolls, its pips and Back / Next sticky at its floor.
- **The stage between**: `phone.left()` / `right()` (rail + 8, column + 8) and `bottom()` 8 feed every workspace's safe
  area and the Labels plate box; the cards, the toast and the 2D board sit there too. At 780x260 the free region is
  360x190 px.

E2E "the phone on its side: ..." (Colors, Build, Assemble at 780x260; turning to 360x675 and back; Build at 667x340).
Mutants each fail it: the query off, right() 8, left() 8, the over-the-dock rule, the player's sticky row, the tools'
no-shrink rule, the switcher at 26vw, `--top-r` never written. A phone.js resize listener was dropped: its mutant survived
because every workspace's resize handler already restacks (safe -> phone.bottom() -> stack). Phone e2e set 24/24 on GPU
and SwiftShader, portrait unchanged; unit tests 672/672. Sol 01a17da4: one finding (the bottom inset), fixed; round 2 no
objection.

- **Live 2026-10-27 at `b46eb57`** (27 min after the push). Checked on the live planner at 780x260 (`chrome-boxes.mjs`,
  ?done=off&skipgc=1): Colors, Build and Assemble with the rail (64x260), the stage's free region {72, 348, 62, 8}, the
  Colors sheet open in the column; no page errors.

## 2026-10-27 - The phone tour: Build, Labels, Parts and Assemble on Joey's S23

Joey: "Are we able to test other tabs on the planner on mobile and make sure they behave as expected, such as in the
builder, labels, parts, and assembly?" A scripted tour (each workspace's own journey: Build's library, a placed unit, its
sheet, Peek inside, 2D, the switcher; Labels' sheet, Type a label, the editor, the plate; Parts' list end to end and a
unit's parts; Assemble through every step and its steps sheet) at 360x675 and 780x260, on SwiftShader, checked after
every step for controls cut, covered or under 28 px, text cut, sideways scroll, chrome overlaps and page errors. Most of
what it flagged was by design (a modal over the page, rows scrolled under a handle, an open sheet over the dock on a
short screen). What was not:

- **An open sheet's glass showed what it covered**: the collapsed handles ("Add units" under the unit's sheet) and, on a
  phone on its side, the dock or the player ("Layout valid" under the Labels sheet). phone.js `stack()` marks `#ws` with
  `sheet-open` / `sheet-over`, and those step out (`visibility: hidden`, so the floor element's box still sets the stack).
- **Rows scrolled under a handle read through its title** ("Classic drawer · Decor drawer" under "Unit 1 · 1W·1H Decor
  Drawer"): the handle's glass is tripled (99 % cover; at two layers it still showed), and so is Assemble's sticky Back /
  Next row on its side.
- **Assemble on its side**: the step's words were a 31 px scroller of their own (12vh) inside a card that already
  scrolls, cut mid-line; they are not capped there now.
- **Assemble upright at 360**: "← Back", "Slow-mo" and "Next →" broke over two lines. One line each, padding 4 px a side
  (it was 10) to keep the five on one row ("Slow-mo" 4 px to spare at 360); under ~350 px it ends in an ellipsis inside
  its key, not over its neighbour (Terra 01a17e76).
- **The label editor**: its own title row and × sat under the handle's "Edit label" (100 of the 190 px on its side). On
  the phone the row is hidden; the handle reads `Edit · "WORDS"` (or `Part label · ...`) and carries the 32 px ×.
- **Label settings' Off / On** were 26 px tall: 32 on the phone.

Open: upright at 675 px an open sheet (56 % of the screen) leaves the model a 61 px strip, by the sheet sizing of the
phone layout; for Joey.

E2E "the phone tour: ..." (Build and Labels at 360x675 / 780x260, Assemble at 780x260, 360x675 and 320x640) and the
editor case now closing by the handle's ×. Thirteen mutants each fail them (the two classes, the hiding rule, two glass
layers, the 12vh cap, the keys wrapping, padding 6 and 10, no ellipsis, Off / On 26 px, the editor's row shown, its
close and its title). A flex-basis change survived as a no-op (`flex: 1` is already basis 0, and `overflow: hidden`
drops the minimum width) and was taken out. Phone e2e set 8/8 on SwiftShader. Terra 01a17e6a no objection; 01a17e76 one
finding (the words at 320 px), fixed.

- **The deploy, three runs (2026-10-27).** `0e06a45` and `91e087d` failed CI shard 3 on the phone tour case only (green
  here on SwiftShader, throttled 4x too); its annotations showed no value, because on Node 24 a failed `equal` /
  `deepEqual` prints its diff in place of the message and the annotations keep one-line errors. `1c3ca04` made the case's
  checks one-line `assert.ok`s that carry what they read, and the runner said: "Slow-mo" 58 px in a 51 px key at 360.
  The cause: **the bundled IBM Plex Sans is not drawing the planner's words.** `fonts/ibm-plex-sans-400/500/600.woff2`
  are one file (md5 f0e2925b) with the arrows and the space and no letters (CDP `CSS.getPlatformFontsForNode`: "Slow-mo"
  7 glyphs in Segoe UI Semibold, "← Back" 4 Segoe + 2 Plex), so text falls through to `system-ui`: Segoe UI on Windows,
  Roboto on Android, a wider face on the Linux runner. The 360 px "fits whole" check is the font's, not the layout's, and
  is dropped (and the `document.fonts.ready` wait, whose premise was wrong); one line, one row and an ellipsis kept inside
  the key at 320 hold in any font and stay. The 4 px padding is a value chosen in Segoe UI and has no test now. The font
  itself is for Joey: fixing it changes the face of every word in the planner.

- **Live 2026-10-27 at `ee84ee5`** (run green after the three above; live by 17:25). Checked on the live planner
  (`tour-live.mjs`, SwiftShader, ?done=off&skipgc=1): Build 360x675 (the library handle hidden under the open unit sheet,
  the handle's three layers), Labels 780x260 (the dock hidden under the open sheet, Off / On 32 px, the editor one row
  with `Edit · "LIVE CHECK"` and its ×, which closes it), Assemble 360x675 (keys one line, one row, none cut) and 780x260
  (the words not their own scroller); no page errors. 12/12.

## 2026-10-27 · No dead controls in the toolbar; the setup sheet leads; the length wears its colour

Joey, reporting from the live planner: Explode "does nothing, just says something about assemble phase 1"; the 3D/2D
toggle "seems odd in all tabs other than Build where it can be used"; Measure "does nothing on the colors tab ... maybe
lets only use it on the build tab"; the length "is extremely easy to overlook ... you instantly want to click the apply
button and not the next button"; the printer list "a bright grey on grey"; and the mount chip "the color of the length
on it's right side, for instance 240 teal ... using the color as a vertical division".

- **The toolbar adds a control only where it works** (js/ui/toolbar.js): the 3D/2D switch is Build's (`opts.view`),
  Explode is Assemble's (`opts.explode`, the exploded overview), Measure is Build's and Assemble's (`opts.measure`; in
  Colors the room holds the callouts back, Labels and Parts switch them off on arrival; Assemble's finished step turns
  them on itself, so its button toggles something). Reset view and the quality pill stay everywhere. The phone's rule
  hiding the "3D-only chip" and Explode's "comes later" for the Room | Neutral switch is gone with them.
- **The setup sheet:** before the last step the orange button is "Next · Length" / "Next · Printer" and Apply (Start
  build, Apply and rebuild) a plain button beside it; on Printer the orange button applies.
- **An open select list is opaque:** `--menu-bg` (tokens.css; #1D1E20 dark, white light) under every `option` and
  `optgroup`. The see-through `--input-bg` was painted over the browser's white list.
- **The mount chip:** "Tabletop", a 3 px bar in the length's catalog colour (GEN2.lengths[].color, the setup sheet's
  stripes) in place of the "·", then the length, in that colour on the dark bar (the ink on the light bar, where 59's
  near-white would vanish; the bar has the chip's border round it for the same reason, Sol 01a17f61). The accessible
  name keeps "Tabletop · 240".

E2E: "the toolbar: 3D/2D only in Build, Explode only in Assemble, Measure in Build and Assemble ..." (each workspace;
Explode from step 1 back to the overview) and "the setup sheet: Next is the orange button until Printer ..." (the foot
per step, the option's opaque ground); the Wall Mount 115 case reads the chip's bar and number. Mutants: the old toolbar,
the old setup foot and the CSS without the option rule each fail. Unit 695/695; the 22 phone and toolbar cases, the
setup-sheet cases and the top-bar fit at 18 widths green on SwiftShader. Sol 01a17f61: one finding (the 59 bar on the
light bar), fixed; the measure class on a switch into Parts is as before (its order is unchanged).

- **Live 2026-10-27 at `103792c`** (run 40591874230 green). Checked on the live planner (`toolbar-prod.mjs`, ?done=off):
  the five toolbars (3D/2D in Build only, Explode in Assemble only, Measure in Build and Assemble), the mount chip's bar and
  number in 185's orange, the setup foot per step, the printer list's opaque ground; no page errors.

## 2026-10-27 · Labels: the faceplate tiles, a typed label's stripe, Classic Pro's print line

Joey, from the live planner: the Labels callout's "switch to edgelabel and classic pro" should "use the same images or icons
we used for selecting faceplates in the build tab ... both are premium models so both should have that"; "i don't want to
advertise 'Paper and label-maker labels are coming later.' because that's still a brainstorm idea"; the part label
stripe's wording "feels specific to edgelabel labels and odd for this classic pro label"; and "if i'm manually typing a
label i don't see how to set a color for the label stripe".

- **The callout's two families are the Build library's faceplate tiles** (labels.js `tile`): the stage's own picture of a
  1W-1H Decor faceplate (`stage.thumb`, the glyph until it is ready), the name under it, and the Club ✦ on both. The
  "coming later" line is gone. The buttons keep "Switch to EdgeLabel" / "Switch to Classic Pro" as their accessible names.
- **A typed label's stripe** (the editor's Stripe row): None and the Label Studio's six colours (label-look.js
  `STRIPE_COLOURS`, its label-stripes.js COLOURS, a unit test checks them against that file), stored on the label as
  `colours` exactly as the Studio stores it; it runs along the label's left end. Typed labels on EdgeLabel builds only:
  Classic Pro prints no stripe, and on a part label `colours: null` means "not the Part Picker's colours".
- **Classic Pro's print settings:** the Label Studio prints Classic Pro part labels with the words and the part's icon; the
  stripe and the screw and nut drawings are EdgeLabel's. On a Classic Pro build the two controls give way to one line
  saying so; this browser's preference for EdgeLabel builds is left as it was.

Not done here: **a Classic Pro label's words on the 3D model.** The stage draws words only on EdgeLabel labels
(label-text.js `LABEL_TEXT_NODES`): the Classic Pro label lies on the sloped grip, its frame on the model has not been
measured, and its layout is the Studio's own label-core-classicpro.js. Joey saw "1 label · 1 on drawers" with a blank
Classic Pro label on 2026-10-27; it is a piece of work of its own, for his decision.

E2E: the callout case (tiles, pictures, both ✦, no promise, Classic Pro applies) and "a typed label takes a stripe colour
... Classic Pro offers no stripe and says what its part labels print"; the seven cases that found the switch by its text
find it by its name. Unit 696/696. Terra 01a17f6f: no findings.

- **Live 2026-10-27 at `a01df56`** (run 40595261679 green). Checked on the live planner (`labels-prod.mjs`, ?done=off): the
  callout's two tiles with their pictures and stars and no promise, a typed label's Green stripe stored and None taking it
  off, Classic Pro's line in place of the stripe and drawings controls; no page errors.

- **Correction (2026-10-27): all three bundled faces lack their letters, not only Plex Sans.** CDP
  `getPlatformFontsForNode` on the local planner:
  - "Parts list" (`--font-display` Archivo): 1 glyph in Archivo, 8 in Segoe UI Black.
  - "Start assembly" (Archivo): 1 glyph in Archivo, 10 in Segoe UI Black.
  - "43 to print · 17 files" (`--font-mono` IBM Plex Mono): 5 glyphs in Plex Mono, 17 in Consolas.

  The headings, the orange buttons and the counts draw in the system's faces as the everyday words do. A re-fetch is
  for Joey.

## 2026-10-27 · Classic Pro labels show their words on the model

Joey placed "M3-10 SCREW" on a Classic Pro drawer: "it says it added the label but i don't see it" (the panel said
"1 label · 1 on drawers", the 3D label stayed blank), then: "Yes, make Classic Pro labels show their words on the 3D model,
using the Label Studio's Classic Pro layout." The stage drew words on EdgeLabel labels only (label-text.js
`LABEL_TEXT_NODES`), recorded in the Labels entry above as not done.

- **The Classic Pro generator's own core**, vendored byte for byte as `js/vendor/classicpro-core.js` (the Label Studio's
  `label-core-classicpro.js`, sha256 bbb53c7c..., the live Studio's own stamp; test/classicpro-core-vendor.test.mjs pins it
  and checks it against the Studio checkout). label-text.js loads it beside EdgeLabel's and builds a Classic Pro label
  exactly as the Studio does (its getLabelData): the same label style, the same icon catalog (`resolveBadge` over EdgeLabel's
  core; the cores' DEFAULTS and 23 icons are equal, the test checks), `prepareLabel` + `buildLabelMeshes` of the Classic Pro
  core, which centres badge + text as a group on its flat 47 x 25.5 mm label.
- **The frame was measured, not assumed** (`CLASSICPRO_FRAME`): D:/MODULITH/handoffs/edgelabel-v2602/CLASSICPRO-CORE.md
  section 3 (2026-10-02) fitted the generator's flat label to the Label_ClassicPro model, which is the generator's own 92-vertex
  STL exported tilted: -45 degrees about X, then (0, 9.0061, -0.5562) mm, residual 0.0000 mm mean / 0.0001 max; a geometry
  built at z 0 is lifted to the core's LABEL_HT (1.5), turned, then moved. Not mirrored: the e2e finds the badge left of the
  words, and the words read "M3-10 SCREW" left to right on the model.
- **Part labels on Classic Pro** are laid out on Classic Pro's own face (the Studio's `hardware-data-classicpro.js`, vendored
  and pinned beside the other part-label files; label-hardware.js `layOut(item, { type: 'classicpro' })`): the words and the
  part's icon, centred, no drawing, no stripe - what the Studio prints there. **A stripe** is not drawn on a Classic Pro label
  (`labelLookFor`: the plain label), as it does not print.
- The label previews in the Labels panel keep the CSS box on Classic Pro (label-preview.js holds EdgeLabel's face only).

E2E "Classic Pro: a typed label and a part label draw on the Classic Pro label in its measured frame; no stripe there": the
generator's top-face corners, mapped by the frame, land on the model's own vertices (< 0.02 mm), every vertex of the ink lies
on that face inside it and no deeper than the text depth, the badge sits left of the words, the part label's ink is 0.45 mm,
no stripe pieces. Mutants: the frame turned +45 degrees, and the frame mirrored in x, each fail it.
Sol 01a17faa: two findings, both fixed - the Classic Pro core and its face data loaded in the same all-or-nothing load as
EdgeLabel's, so one failed file would have blanked EdgeLabel labels too; both now load on their own (a failure leaves Classic
Pro labels blank, or its part labels in words). E2E "Classic Pro core refused: an EdgeLabel label still shows its words"
(the coupled load fails it). The frame order, the caches, the one icon catalog and the dropped stripe were confirmed.

- **Live 2026-10-27 at `280de16`** (run 40604160330 green). Checked on the live planner (`classicpro-text-prod.mjs`):
  a Classic Pro drawer labelled "M3-10 screw" shows "M3-10 SCREW" on its label, left to right; no page errors.

## 2026-10-27 · Parts: a part render on every row

Joey, from the live planner's Parts list on a Classic Pro 185 tabletop build: "i like the colors around the blank square,
but why not include BOM thumbnail images for each part, we should have them?"

- **Each row shows the part's render beside its chip** (parts.js `partThumb`, `thumbEl`): 36 px on a desktop, 32 px on a
  phone, 10 px from the chip; the chip and its ring are as they were. The renders are the parts host's flat `img/parts/`
  set (config.js `assetUrl`), the files the Assemble checklist shows by node (generate.js `imgFor`). The vendored
  catalog's `partImage()` was not reused: it is the old planner's map (`img/parts/185/...`, `GEN2_..._256p.png`), a layout
  the host does not have. They load lazily (25 rows of ~50 KB each).
- **Rows with no render keep an empty frame**, so every name starts at the same place: the M3 socket screws (6 and 12 mm),
  the M3 hex nut and the adhesive rubber feet have no photograph (bought parts get no stand-in, as in the Assemble
  checklist), and the host lacks three renders - Decor Drawer 270-4W-1H and the 59 Side Covers 2H and 3H (404 on the live
  host). A missing file empties its frame rather than showing a broken image. BlockBar and Crystal handles show their A
  style, the series' render in the generator.
- **The Essential faceplates keep the empty frame too** (follow-up the same day): their only picture, the card art
  `Faceplate-Essential.jpg`, is a photograph of a Decor drawer half open under a desk, and the vault's settled rule is that
  a photograph is never shipped as a part's render (MODULITH decisions.md, 2026-09-13). The first push showed it.
- **On a phone the badge and the link move under the name**, right-aligned. With the render beside the chip, a row with
  both had 60 px of the 360 px sheet for its name (it was about 100 before); the landscape column (780x260) is as narrow.
  Every row's name now has 120 px or more at both sizes. The break is a zero-height flex item ordered after the name, not
  a fixed basis: a chip of several filaments is up to 35 px wide. With Track my build on, the counters' line comes last
  and right-aligned (under the name it ran 30 px past a 360 px row).
- **Paper leaves the renders off**: the print view stays the black-on-white checklist (the chip tells the rows apart), and
  25 colour renders were ink and pages. The wide table's render column goes with them.

E2E: "Parts: a part render beside every row's chip, loaded; the phone sheet holds it; paper leaves it off" (desktop,
360x675, 780x260: a frame on every row 8 px or more from the chip and inside it, every render loaded but the
unphotographed bought parts, the list no wider than its panel, none on paper; on the phone, tracking's counters inside
the row and the badge beside the link). Mutant: the phone rules taken out, it fails (names at 59 px). Unit:
test/parts-thumbs.test.mjs maps every row name the BOM bills, over every mount, length, style, handle, foot and size, to
a file in the parts pool, and keeps the known-gap list honest. Terra 01a17fae: one finding (on the phone with tracking
on, the counters' line split the badge from the link), fixed; the fix also found the counters overflowing at 360 px.

- **Live 2026-10-27 at `9b5fca9`** (run 40608746279 green). The first push, `ff33530` (run 40606460749), passed every test
  and was refused at the module-graph guard: parts.js's new `'../config.js'` import had no stamping line in pages.yml; it
  has one now. Checked on the live planner (`thumbs-prod.mjs`, ?done=off, analytics blocked), desktop and 360x675: 21 rows,
  a frame on each, 18 renders loaded, the three without one the M3 socket screws and the hex nut; names 127 px and up on
  the desktop, 190 px and up on the phone; nothing wider than the panel; no page errors.

## 2026-10-27 - The real fonts: IBM Plex Sans, Archivo and IBM Plex Mono draw the planner's words

Joey, told that the bundled fonts had no letters: "yes" (fetch them and show before / after), then "Yes, deploy".

- **The cause** (`tools/fetch-fonts.mjs`, 2026-10-12). Google's css2 puts each block's subset in a comment BEFORE it
  (`/* latin */ @font-face {...}`). The script split on `@font-face`, so each chunk ended with the NEXT block's comment,
  and its `latin` filter kept latin-ext: 208 characters, no A-Z, a-z or 0-9 (checked by a cmap read of the old file).
  Since then every word fell through to `system-ui`.
- **The fix.** Each block is read with its own comment. latin and latin-ext are both kept with Google's `unicode-range`,
  so latin-ext (accented letters past Latin-1) loads only when a page draws one. The arrows ← → are in neither subset
  and stay the system's. Every request must succeed and a font must start with `wOF2`, or the run stops (Terra
  01a17fbe).
- **The files.** File names carry the subset, so no browser keeps the old letterless files from cache: `fonts.css` is
  `?v`-stamped at deploy, the woff2 URLs are not. Plex Sans is one variable file for all three weights on Google, so
  it is ONE face per subset, `font-weight: 400 600` (Terra 01a17fbe). 10 files, 331 KB, of which a page loads only the
  latin ones. Chrome CDP `getPlatformFontsForNode`: "Parts list" and "Start assembly" in Archivo, "43 to print · 17
  files" in Plex Mono, "Layout valid" and the step text in Plex Sans, every glyph but the arrow.
- **The licence.** All three are SIL OFL 1.1 (each file's name table points there; the repositories' own texts):
  - free to use, bundle and serve, commercially too, and not to be sold on their own;
  - every copy carries the copyright and the licence. The files carry only a link, so the texts now ship beside them
    (`fonts/OFL-IBM-Plex.txt`, `fonts/OFL-Archivo.txt`; `fonts/README.md` says so);
  - IBM Plex has the Reserved Font Name "Plex". These are Google's files unchanged; a version re-subset or edited here
    could not keep that name. Archivo reserves none.
- **What moved.** Archivo and Plex are a little wider than Segoe UI and Roboto:
  - the phone bar's build name shortens sooner ("185...");
  - Assemble's kit title wraps at its hyphen at 360 px ("3W-" / "2H");
  - desktop layouts are much the same, only the faces differ.

  Before / after shots (phone Build, Parts and Assemble, 780x260 Build, desktop Build and Parts) went to Joey.
- **Checks.** The full e2e on SwiftShader with the new fonts, six shards in two streams: 111 of 112 green. The one
  failure, "the Label plate: a faceplate switch with the plate open...", timed out on a click under the double load
  (47 s) and passed alone (15 s). After the review's one-face change: the phone tour, the phone on its side, the Room |
  Neutral switch fits, the label editor and the boot cases, 5/5.

- **Live 2026-10-27 at `20e8dc4`** (pushed 20:52, live 21:14). Checked on the live planner:
  - CDP `getPlatformFontsForNode` (`font-map-live.mjs`): "Parts list", "Start assembly" and Assemble's title draw in
    Archivo, "43 to print · 17 files" in Plex Mono, "Layout valid" and the step text in Plex Sans; only the arrow of
    "← Back" is the system's.
  - The new woff2 files are served as `font/woff2`, the two OFL texts as `text/plain`, and an old file name answers
    404.
  - The phone checks (`tour-live.mjs`) are 12/12, Assemble's keys at 360 px whole in Plex Sans too.

## 2026-10-27 · The Parts list says the disclosure once: one line under the hardware

Joey, with a screenshot of the bottom of the Parts list: "same question as earlier about affiliate link information,
didn't we find a way to shorten this or use it differently?" Under the hardware it read "Amazon links - I earn a small
commission, at no extra cost to you." and then the foot: "As an Amazon Associate I earn from qualifying purchases.
Polymaker links apply the JERRARI discount; as a Polymaker Ambassador I earn a small commission, at no extra cost to you.
Any equivalent hardware from any store works."

- **Why it said it twice.** The 2026-10-24 entry (the paid-link suffix goes) put the commission line under every section
  group whose hardware rows link to Amazon, and Amazon's sentence in the foot. The mount's section ends the list and has
  Amazon hardware, so its commission line landed directly on the foot, and the two said the same thing one above the other.
  The Colors tab and the old viewer already say it once (colors.js `disclosureFor`; main.js `paidNoteText`: "saying it twice
  was the clutter this replaced"). No other answer to "the earlier question" was found in this file or the session
  transcripts: the earlier question is the 2026-10-24 one.
- **Joey picked, of three wordings:** "Go with A: one line under the hardware, the Colors rule, with the shorter Polymaker
  sentence in Colors too."
- **The Parts list now** (parts.js renderPanel): no separate commission line (the `p.note.commission` element and its two
  app.css rules are gone); the foot is the one line, right under the hardware rows (the Hardware section, then the mount's,
  end the list): "As an Amazon Associate I earn from qualifying purchases. Any equivalent hardware works.", with "Polymaker
  links apply the JERRARI discount and earn me a small commission." between them when a "Print in" filament link is a
  Polymaker one. About 300 characters became 85, or 160 with the Polymaker sentence.
- **The Polymaker sentence everywhere** (colors.js `POLYMAKER_LINE`, and `BOTH_LINE` is now Amazon's sentence followed by
  it): "Polymaker links apply the JERRARI discount and earn me a small commission." It had read "Polymaker links apply the
  JERRARI discount for you; as a Polymaker Ambassador I earn a small commission, at no extra cost to you." (alone) and
  "...the JERRARI discount; as a Polymaker Ambassador I earn..." (after Amazon's). Its surfaces: the picker's foot, the
  shopping list, a look's Shop list, and the Parts foot. The old viewer's own sentences (main.js) are not changed.
- **Unchanged:** Amazon's sentence verbatim, once on the list; the links' plain labels and `rel="noopener sponsored"`; no
  "paid link", no "affiliate link". "at no extra cost to you" is no longer said on the Parts list.
- **Checks.** The buy-link e2e case, in both layouts: the foot ends the list right under the last hardware group, the word
  "commission" appears only in the foot's Polymaker sentence (no separate line), Amazon's sentence once, the foot's exact
  shape; the picker's and the shopping list's sentences; the look Shop list case reads the Polymaker sentence. Five
  mutants, each failing its own assertion: the commission line restored, the old Polymaker sentence, the old shopping tip,
  the foot moved above the mount's section, the foot at the top. (The first version of the placement check asked only for
  "a hardware group" above the foot and let the foot-above-the-mount mutant through, since Hardware is one; it now asks for
  the last.) npm test 701: 695 pass, 5 environment skips, 1 fail - M28's timing gate in simplify.test.mjs, under 100 % CPU
  beside the e2e runs; alone it passes (median 0.13 ms). The two touched e2e cases pass with `E2E_SOFT=1`.
- **Review:** Terra `01a17fa7` (routine): one finding, discarded as decided - a list with Amazon links and no Polymaker
  link now shows only Amazon's sentence, no separate plain commission sentence. That is option A's text exactly as Joey
  picked it, and the Colors tab's rule for Amazon-only links since 2026-10-24 (Sol `01a16c4a`).
- **Live 2026-10-27 at `298ebef`** (pushed 21:17, live 21:40). `disclosure-once-prod.mjs 298ebef` passes 6 of 6 on the live
  planner: the Parts foot reads "As an Amazon Associate I earn from qualifying purchases. Polymaker links apply the JERRARI
  discount and earn me a small commission. Any equivalent hardware works." (the kit has Polymaker "Print in" links), no
  `.commission` element and "commission" only in that sentence, the foot last and right under the last hardware group,
  Amazon's sentence once with every Amazon link `rel="noopener sponsored"`, and the looks' Shop lists showing only the new
  sentences; no page errors. The same script failed three of its checks on `9b5fca99` before the deploy.

## 2026-10-27 · The toolbar row centred under the tabs; a peek's lines go with its pills

- **The row under the tabs** (Joey: "can we center the icons at the top of the screen better, it looks offset after we
  removed a few"). The row centred in the space the side panels leave (each workspace's left / right), the tabs in the top
  bar between their neighbours: at 1600 px the row sat 72 px right of the tabs in Build and 232 px in Assemble.
  toolbar.js `centreUnderTabs` shifts the row's buttons (CSS `translate`) to sit centred under the tabs, as far as that
  space allows and never past it; measured again when the row, the tabs or the window resize; not on a phone (its bar lays
  the row out its own way). E2E "the toolbar row sits centred under the tabs in every workspace, inside the space the side
  panels leave" (1280, 1440, 1600, 1920; the old code fails it).
- **A peek's lines go with its pills** (Joey: after a peek in Build with the ruler on, the Colors card's Open the drawer
  showed "lines inside that i know were from the represented measurements"). The card opens a drawer with no pills
  (`pills: 'none'`) and Build's Peek inside hides them while too big for the drawer, but the three measuring lines were
  drawn regardless. main.js: the lines' group starts hidden for a peek and `updateDrawerDims` shows it only while a pill
  shows. E2E "the open drawer's measuring lines show only with their pills: none from the Colors card, with them in Build"
  (the old code fails it); the six peek cases pass. Terra 01a1800c: one finding discarded (the 'none' mode is already refused
  first thing in peekPillsFit; the existing desktop Colors case holds it), the centring approved.

- **Live 2026-10-27 at `42ab09c`** (run 40616559063 green). Checked on the live planner: the toolbar row's centre equals
  the tabs' in all five workspaces at 1280, 1440, 1600 and 1920 px; no page errors.

## 2026-10-27 · Classic Pro part labels carry the screw and nut drawings

Joey, looking at Classic Pro drawers labelled from the Part Picker ("M3 SHCS × 6 NYLON", words only): "these labels are
missing the icons and everything like what we have on the edgelabel labels". The planner drew exactly what the Label
Studio printed there: words and, for nuts and washers, the family icon; the drawings and the colour band were EdgeLabel's
"for now". Three layouts were measured with the Studio's own code and fit rule on its 54 v5 reference items
(`D:\Claude - Output\cp-part-drawings-2026-10-27`: EdgeLabel's top-left profile fitted 1; the drawing under the size,
centred, the head-on view beside the size, and the side profile alone were the options); Joey chose the drawing under the
size.

- **In the Label Studio first** (labels-public `6fd9313c`, planner-plate `16a10a25`; not pushed - the public push is
  Joey's): hardware-layout.js builds the v5 profile label on Classic Pro too and centres its three rows (`arrange5`), then
  settles it towards the middle with the v5 fit rule (`centreDown(els, fits5)`); label-hardware.js gives the Classic Pro
  layout the drawing data and skips only the colour band there; the page's drawings switch works on Classic Pro. 49 of the
  54 items take the drawing (EdgeLabel 48), the size at 6.4-9.1 mm, median 7.2. Studio suite 195/195 with a new test
  (inside the area and clear of the slits, rows centred and stacked, the text layout unchanged with drawings off); Sol
  01a18014: no invalid layout, two test/comment points applied.
- **The planner** copies the two files (test/label-hardware-vendor.test.mjs pins them), so a Classic Pro drawer's part label
  on the model shows the drawing (label-text.js `partLabelGeometry(..., 'classicpro')`); the Labels settings on a Classic Pro
  build keep the "Screw and nut drawings" switch, with a line that the stripe is EdgeLabel's.

- **Live 2026-10-27**: the Label Studio first (public main `6fd9313c` with the label-audit release, on Joey's "Push it";
  live hardware-layout.js `0c416fc5`, label-hardware.js `9bd3a241`), then the planner at `42ab09c` (run 40616559063).
  Checked on the live planner: an M5 x 20 socket-cap part label on a Classic Pro drawer shows the size, the head-on view
  and side profile and "A2", centred.

## 2026-10-27 - The room: matte black is the floor for the wall and the desk

Joey (relayed by the planner-2 session): in the Colors room, a wall of his own in #000000 and the Black desk, with an
all-black build on the smooth plate, left the room nearly black and the build gone. "Maybe we can limit how black is
black". Of four renders of the same shot (planner-2, `D:\Claude - Output\black-room-2026-10-27`) he picked B: "maybe b?".
B is wall and desk floored at a real matte black, with no extra fill light on the build.

- **done-fit.js `roomFloor`.** No wall paint or desk laminate reflects much under 3 to 5 %; `ROOM_FLOOR_HEX` #38393b is
  about 4 %. A colour whose luminance (linear, Rec. 709) is under the floor's is lifted by the floor's own colour times
  the shortfall, so it lands on the floor's luminance:
  - #000000 and the Black desk's #2a2b2d become #38393b;
  - a dark navy #101830 becomes #353947 and stays blue;
  - a dark green #1d3b2a becomes #243f2f;
  - a colour at or over the floor is left alone (Navy #3b4b5e and Charcoal #47494d are).

  `wallFactor` and `deskLook` take every choice through it, presets and the visitor's own alike, so the bounce weights
  follow. Black walls keep the floor's share of the walls' bounce, not none: the old unit assertion now says so.
- **The swatches show what renders.** `roomPresets` floors each preset's swatch (the Black desk's chip is #38393b). The
  own-colour chip shows the floored colour, and when it lifted the pick its title says "lifted to #38393b". The choice
  is stored as picked.
- **Checks.**
  - A unit test: black, dark navy, dark red and dark green land on the floor's luminance within 0.0015, navy stays blue,
    colours at or over the floor are untouched, and the Black preset and a black desk of one's own draw as the floor.
  - E2E "the Done scene's room has a floor at matte black": a black wall draws exactly as a #38393b one, the Black preset
    and a black desk exactly as a #38393b desk, the chips read #38393b, and Charcoal is untouched.
  - Seven mutants each fail one or the other: the wall unfloored, the desk unfloored, the floor off, a plain grey lift,
    the raw preset swatch, the raw own chip, no "lifted" title.
  - Terra 01a1803a: no objection. Its two notes were discarded: 8-bit rounding can leave a lift a hair under the floor
    (negligible at "about 4 %"), and the additive lift nudges toward the floor's slight blue-grey rather than keeping the
    exact hue (the ask was "stays navy", and scaling has no answer for black).
  - A Very High render of his setup on this code draws like his pick B (scratchpad `floor-renders`).

- **Live 2026-10-27 at `f87a315`** (pushed 22:04, live 22:26, run 40618780426). Checked on the live planner
  (`floor-live.mjs`, Assemble's final scene, SwiftShader):
  - the Black desk swatch is #38393b;
  - a black wall of one's own draws exactly as a #38393b one, its chip #38393b with "lifted to #38393b";
  - the Black preset desk draws exactly as a #38393b desk;
  - no page errors.

## 2026-10-27 · Eight e2e shards, weighted by the runner's own times

Joey: "why does it take so long?" A deploy ran 20-21 min on 2026-10-27, nearly all of it the e2e shards: run 40616559063
took 15.2 / 12.8 / 20.8 / 16.2 / 16.0 / 5.7 min, and the deploy waits on the slowest. Two causes: the weights were a local
soft-render run's (2026-10-25), from before about twenty cases were added, and the runner machines differ by up to 2x
(that day's shard speeds 0.95-1.98 against the same weights).

- **The weights are the runner's own** (e2e/shard-weights.json): each case's median over the shard notices of the day's
  three green main runs (40611504137, 40614184548, 40616559063), each shard's seconds divided by its machine's speed (the
  median ratio against the previous weights), so the machines share one scale; the 16 cases that skip on the runner (the
  room cases under SOFTWARE_GL) weigh 0.5, which holds while they skip there. 127 weights for the 128 cases: the room
  floor case added since gets the median (shard.mjs weightOf). Judged by the new weights the split is 511 s per shard at
  most, where the old split put up to 538.
- **Eight shards, not six** (pages.yml): the run waits on its slowest machine, and smaller shards bound that. Modelled on
  the three runs, each shard's work times its measured machine speed: the old split 19.7-21.0 min of test work, the new
  weights 15.8-16.8, the new weights on eight shards 11.9-12.6 - estimates, test work only (each shard also spends about
  1.5 min on checkout, npm ci and the browser check, in parallel), and shards 7-8 given each run's median machine, so an
  unlucky draw of slow machines still shows. The repository is public, so two more runners cost nothing, and 13 jobs at
  most run at once (the plan allows 20). The coverage gate reads the shard count from the reports, unchanged. Terra
  01a1804d: the mechanics approved; the wording of the estimates and the case count tightened.

test/e2e-shard.test.mjs 5/5; the first CI run is the real check (the coverage job proves every case ran once across eight).

## 2026-10-27 · A part label's stripe in the editor

Joey, of a Part Picker label placed on a drawer: "i can't figure out after the fact how to add like a colored stripe?" The
editor's Stripe row was for typed labels only. It now serves part labels too, on EdgeLabel builds (Classic Pro prints no
stripe yet), with the Label Studio's three states: **the part's own** colours (no `colours` on the label: the Part
Picker's band, e.g. metric blue; offered when the item has one, first and ringed), **None** (`colours: null`, the Studio's
"no stripe" for a part label) and the six colours (the stripe in place of the part's). `R.setStripe` writes them:
label-list.js editLabel drops a null patch value as "remove the key", so null is set on the edited label after it.

E2E "Labels: a part label's stripe - its own colours, None or one of the six - in the editor and on the model": on the
model a part label with its own colours draws the stripe pieces, the same part with `colours: null` none; the editor lists
own (pressed), None and the six, and each click stores what the Studio stores (a mutant that skips the null fails it).
Label unit tests 63/63. Terra 01a1806b: approved.

Live 2026-10-27 23:07 as aadfa1de (run 40623476063); `part-stripe-prod.mjs` green: the row lists the part's own (pressed),
None and the six, the placed label draws its stripe, None stores `colours: null`, Green lands, the part's own clears it.

## 2026-10-27 · A lone case stands on four feet, one per corner

Joey, from a lone 2W-2H Decor drawer on the Tabletop: "since we aren't using a foot rail, there's really no point in adding
6 feet, i would only add 4, one per corner". A tabletop build whose bottom row is ONE case puts its feet in that case's own
underside slots. `generate.js` filled every 1W slot pair (dropping a slot within 30 mm of the last), so a lone 2W case
took 6 feet, a 3W 8 and a 4W 10. It now takes the outermost slot on each side, front and back: four feet at any width,
and the same four for adhesive feet. A 1W case is unchanged. Foot-rail builds keep 2 x (run width + 1); the official
kits stand on rails, so their goldens do not move. The vault's `rules.md` says the same.

Test `feet-option.test.mjs`: the count is 4 (printed and adhesive, the step titles too), and a new case puts a lone 1W to
4W case on exactly the two corner slots, front and back. Terra 01a18078: no findings.

Live 2026-10-27 23:25 as 688243e7; `feet-prod.mjs` green: a lone 2W-2H and a lone 4W-1H stand on 4 feet (the Parts list
bills 4, the step says "insert the 4 feet"), two 1W cases still stand on a foot rail with 6. The same check on aadfa1de
failed (6 and 10), so it can tell. Vault `rules.md` 98da1dd.

## 2026-10-28 · Classic Pro labels take their stripe along the bottom edge

Joey looked at the label sheets (`D:\Claude - Output\label-variants-2026-10-28`) and sent Astra's reading of them: the bottom
stripe is Classic Pro's strongest default, alternate positions belong under advanced options, and the slit clearance should
be fixed in the layout. The Label Studio made it first (labels-public b18cada7, planner-plate 26b342a8); this copies it.

- Every Classic Pro stripe runs along the bottom edge, between the two springy slits (|x| <= 20.51, 0.5 mm clear of each),
  as a 0.5 mm inlay, with the 8 mm material patch at its left end. Any stripe a label carries there (a typed label's end
  stripe, a part label's position) draws at the bottom (`main.js labelLookFor`); a label with none stays plain.
- `label-text.js` cuts Classic Pro's own body for it (`bandParts(position, colours, 'classicpro')` - with two arguments the
  pieces would be EdgeLabel's, Sol 01a18294) and places the pieces by `CLASSICPRO_FRAME`'s turn without the ink's lift.
- The label editor offers the stripe row on Classic Pro too; the settings give a plain On / Off stripe switch (never
  EdgeLabel's position names, which read oddly there, 2026-10-27) beside the drawings switch.
- Classic Pro's word layout (the vendored core) keeps the face's 1.8 mm margin from the slits (|x| <= 19.2121, was 20.2121)
  and measures a text block by its ink, descenders included. 600 random typed labels: before, 31 came within 0.45 mm of the
  stripe (worst 1.4 mm onto it, one past the face's edge) and 97 within 1.8 mm of a slit; after, none (worst 0.61 mm).

Tests: the vendor pins move; the Classic Pro e2e case now expects three stripe pieces filling the model body's box, the band
between the slits, the typed label's green and the part label's metric band with its stainless patch (a flipped frame fails
it); the editor case expects the stripe row and the On / Off switch on Classic Pro. Not deployed until the Label Studio's
public push, so the stage never shows a stripe the Studio does not print.

Live 2026-10-28 09:29 as b2e27a22, after the Label Studio's public push (b18cada7, served 09:13): `cp-stripe-prod.mjs` green -
a typed Classic Pro label's green stripe and an M5 x 20 part label's metric band with its stainless patch, each three pieces
filling the model body's box (0.0006 mm), the band at |x| 20.512 between the slits, no page errors. The same check failed on
688243e7, before the deploy.

## 2026-10-28 · A collapsed phone sheet says it opens

Joey, of the collapsed Colors bar on a phone: it "looks kind of like just a static bar until i click it ... there's nothing
about it that says expand me", suggesting an up icon, "a slight movement up animation right after page load", or a hover
change. The cause of most of it: `phone.js` has asked for a `caret-up` on every collapsed handle since the sheets were built,
and the icon sprite had none (only `caret-down`, `caret-right`), so a collapsed handle drew a blank where its arrow goes and
only an open sheet showed one.

- **The arrow.** `caret-up` added to `tools/make-icons.mjs` and the sprite rebuilt (one new symbol); the caret drawn at the
  title's strength (`--ink-2`, was `--ink-3`). `test/icon-sprite.test.mjs` now reads every icon named in an `icon(...)` call
  (ternaries too) against the sprite: it fails on the old sprite, on `caret-up`.
- **The hover.** With a mouse (`hover: hover`), the handle's glass lightens, the grab bar brightens and the caret steps 2 px
  its way (up collapsed, down open).
- **The nudge.** Once per browser, 1.1 s after the phone chrome comes up, the top collapsed sheet lifts 14 px and settles
  (a registered `--nudge` length added into the sheet's transform and clip, so the lift shows a glimpse under the handle).
  Not under reduced motion, not while a sheet is open, and never again once it has played or a sheet was opened
  (`gen2-sheet-nudged`). Build is where it plays first: its library starts collapsed (Colors and Parts open theirs).

Tests: the new e2e case (the collapsed caret's symbol is in the served sprite; a first visit nudges and remembers; a reload
does not; reduced motion never); every other e2e case marks the nudge played, so no sheet moves under a tap. All 23 phone
cases and 707 unit tests pass. Shots: `D:\Claude - Output\sheet-hint-2026-10-28`.

Live 2026-10-28 10:10 as 58a04e6f: `sheet-hint-prod.mjs` green (twice) - on a fresh phone visit to Build the collapsed
library's caret-up is a symbol of the served sprite, the nudge plays and is remembered, a reload does not nudge, no page
errors. The same check failed on b2e27a22, before the deploy (no caret symbol, no nudge).

## 2026-10-28 · A void the armed size fills shows one "+"; a new shelf starts with its lip

Joey, placing a 1W·3H shelf into a 1W·3H void of his build: "when i hover over the yellow + it flickers between a red+ and
a yellow+, making it like a 50/50 chance i can place a shelf or it tries to place a 1W-1h to like fill the gap, fighting
me." The void's empty slots (the red "+"s: the three 1W·1H cases Fill all would add, at half-rows 8, 10 and 12) went on the
stage beside the armed spot (2, 8), and the middle slot's marker stood on the very point of the shelf spot's (both centred
at half-row 11). Hovering one hides its marker and shows its ghost; the stage hit-tests visible markers first, so the
other marker took the pointer, and back. A click took whichever held it.

- `stand.js armedSpots`: while a size is armed, a red slot that an offered spot's footprint overlaps is not shown (placing
  the armed unit fills it), and a muted refused cell whose marker would sit on a red slot's gives way to the slot. Unarmed,
  the red slots are as before.
- Joey, the same day: "can we also default the shelf lip on by default?" A placed shelf starts with `lip: 'front'`
  (`placeAt`); the inspector's Lip still takes it off. Shelves are only made by placing (type conversion swaps drawers
  only, and Duplicate copies the lip); saved builds keep what they have.

Tests: `stand.test.mjs` runs Joey's build (standUp's slots, the shared marker point, armedSpots' result); the e2e case arms
a 1W·3H shelf on it, finds one spot in the void, holds the pointer on its "+" through twelve one-pixel nudges and clicks:
a 1W·3H shelf at (2, 8) with its front lip. Against the old spot list it fails (three red slots and the shelf's spot).

## 2026-10-28 · A label stripe's colour has its spool in the room

Joey, in the room on his yellow build: "we are using the blue accent color in the label but it's not adding to our filament
stack." A label's stripe prints from its own spool and the dock already counted it among the build's filaments, but the
room's spools left stripes out (`done.js spoolColours` filtered `!u.stripe` since the spools were built). They are in now.
A click on a stripe's spool opens no picker (a stripe is no region: its colour is set on each label), so it says that
instead of doing nothing. The stripe stays a colour, not a spool of the build's choosing, until the label palette lands.

Tests: a new e2e case (an EdgeLabel build with a Metric-striped label: the room stacks a #56b4e9 spool; it fails with the
old filter); the Assemble spool case reads the same list. Terra 01a18305: one finding, discarded (past the 32-spool cap a
stripe may take another colour's place - the cap's sort order decides which fall off, as it always has).

Live 2026-10-28 11:16 as b3b99056 (with 610ecee, whose own run had failed on an unrelated case - "Colors: on Very High at
rest the steam keeps rising", "the room did not come on within 60 s" on the runner; it passed locally and in this run):
`void-prod.mjs` green (one "+" in Joey's void, the hover held through twelve nudges, the 1W·3H shelf placed with lip
'front'; on 58a04e6f it failed, the hover swapping between a red slot and the shelf's spot on every move) and
`stripe-spool-prod.mjs` green (a #56b4e9 spool for a Metric-striped label; on 58a04e6f six spools and no blue).

## 2026-10-28 · The label palette: a stripe colour is a meaning, printed in the spool you have

Joey, of the label sheets of 2026-10-28: a stripe's colour is a suggestion. People print Metric in whatever blue they own,
and they keep one set of label spools across builds. Sol (01a1825f) rejected a live per-browser map, because shared links
would drift and a remap would recolour old builds. Astra refined Sol's option 1, and Joey settled it: a ready-made palette
with no setup, optional "Use my filaments", a per-browser default for new builds, and the palette saved with the build.
Design note: `docs/redesign/LABEL-PALETTE.md`.

- **A stripe stores its meaning, as before.** The label keeps the Label Studio's `colours` (`sky-blue`, `#56B4E9`, Metric),
  so the Studio round trip is unchanged. The build's new record field `labelPalette` (`{ v: 1, spools: { <meaning>:
  { name, hex } } }`, cleaned in schema.js) says which spool prints each of the six meanings. `null`, and every older
  record, reads as the frozen v1 suggestions in `js/label-palette.js`.
- **The suggested spools** are the nearest plain PLA in the catalog by ΔE00 to the scheme colour: Metric is Polar Light
  Blue (5.6), SAE / inch Printed Solid Safety Orange (8.8), Yellow Panchroma Lemon Yellow (3.0), White Printed Solid White
  (1.87), Green Polar Seafoam (1.8), and Purple Panchroma Pink (12.2, because the scheme's purple is a pink). The body and
  text are the first preset's picks. A test re-runs the rule and fails on catalog drift; it never rewrites v1.
- **Drawing.** A stripe piece in one of the six meanings wears the zone `STRIPE@<meaning>`, and `activeHex` gives it the
  build's spool in every colour mode. A colour the page does not offer keeps `STRIPE#hex`, as before. A palette change
  repaints; it never regenerates. The stage keeps its own copy, handed over by app.js on every store change.
  Classic Pro's bottom stripe (b2e27a2, merged in) draws through the same pieces, so it wears the palette too, and the
  section shows on both label families.
- **Body and text stay the Colors palette's `Label` / `Label:TEXT` picks.** The panel shows them and edits them there, so
  there is one source of truth. Gap, and Joey's call: these two, like every Colors pick, do not ride in `#build=`.
- **Defaults** (`gen2-label-palette`, try-guarded) seed only a fresh build (`?new` / setup). Any other build is offered them
  ("Your default label filaments differ · Use them here", one undo step), never changed by them silently.
- **Warnings, computed and gentle:** two meanings in one spool; ΔE00 < 15 between two meanings; a meaning at ΔE00 < 10 from
  the body; text contrast < 3. The v1 set warns once: White on the Cold White body, ΔE 4.1, the measured invisible patch.
  How to fix that patch is still Joey's open call.
- **Lists name the spool by identity.** `filamentsInBuild` wears a stripe as its spool (by name, buy link from the catalog),
  so the Colors list, the Dock count and the Parts Label row name it. The room's spool swap leaves stripes alone.
- **One visual change, once:** a build that already had a stripe (stripes exist since 2026-10-27) now draws it in the v1
  spool's hex instead of the scheme's, for example Metric #14ADDB instead of #56B4E9.

Reviews: Sol 01a1827b on the design (approve with changes; 9 findings folded in, 2 discarded with reasons in the note §9),
Sol 01a182a1 on the code (one finding, the defaults offer compared body/text by name only; fixed).

Before the deploy (Joey: "Fix names, then deploy"): the rows show every spool name whole, wrapping to a second line when
it must, with "suggested" as a small tag under the name (measured at 290 px desktop and 360 px phone with the catalog's
longest names: none clipped, nothing overlapping). And main's room spool for a stripe (b3b9905) meets the palette: a
meaning's stripe is a named spool, so its room spool is that spool's colour (Polar Light Blue #14ADDB, not the nominal
#56B4E9), and a tap on it opens Labels on that meaning's row with its picker (the sheet open on a phone; a spool two
meanings share opens the rows, none guessed). A stripe in a colour the palette does not hold keeps main's sentence. Terra
01a1832d: one finding taken (the shared spool), one discarded (ctx.memo always exists).

Live 2026-10-28 as 53c2a639 (main 53c2a63, fast-forward from 9335d95). `label-palette-prod.mjs` green: a build with no
palette draws its Metric band in zone STRIPE@sky-blue at #14addb with the record null, the Label colours section lists its
eight rows and the White note, and the same build carrying Metric = Panchroma Blue draws #2f6fbe. `stripe-spool-prod.mjs`
(updated) green: the room's spool is #14addb, not #56b4e9, and its tap opens the Metric row in Labels.

## 2026-10-28 · Silk filaments look like silk on the model

Joey, on his yellow 185 Tabletop 2W-2H in Panchroma Yellow, then Silk Brass, then Silk Gold: "are we doing anything
different to represent silk colors? they still feel way too much like regular filaments ... they almost look the same."
They were the same: a silk filament differed from a matte one only by its catalog hex. The picker's swatches have shown a
sheen since 2026-10-21; the model now does too.

- WHICH FILAMENTS: the catalog decides. `filament-db.js` marks every colour of the Panchroma Silk PLA line `finish: 'silk'`
  (the shop's product family, like the Translucent line's `translucent`), and `finishOfLabel` reads it; a name is never
  what decides. All 24, nothing else. The picker's word rule agrees on every catalog label (a unit test).
- THE FINISH: `part-material.js SILK_APPROX` (roughness 0.2, metalness 0.75, anisotropy 0.4), below an authored profile
  (a real profile still wins) and below the holographic plate. An AUTHORED APPROXIMATION, visually tuned in this viewer's
  room, not measured and not a profile. Contract 2 -> 3: a consumer written for 2 would draw a silk label as an isotropic
  pseudo-metal. The metalness is an artistic compromise (silk PLA is a dielectric): it is what makes the highlights wear
  the filament's own hue, which keeps Silk Brass and Silk Gold apart.
- THE DIRECTION (`js/silk-axis.js`): three's anisotropy, its rough axis pointed across the printed layers (the build axis
  projected on the surface, through normalMatrix: a layer-plane normal) so a wall's highlight runs along the build axis,
  as the Lab's upright silk vase shows it; on a face within 15 degrees of the axis (a top skin, a face-down first layer)
  across an ASSUMED 45 degree skin line instead, blended by 30. Every projection's normalise is guarded.
- WHY THAT WAS NOT ENOUGH, MEASURED: an upright face of the build mirrors the plain desk, so on the 2W-2H's fronts even
  the calipers' own settings (metalness 1, roughness 0.1) rendered as flat gold, on both plates and at three orbit
  angles - the same reason the Lab's silk lobes measured dead under this rig (Lab RENDERING.md 1.4i). The calipers read as
  metal because they lie flat under the sunlit wall: they reflect contrast. So two AUTHORED devices carry the look, on
  silk parts only: a SILK STUDIO the part reflects in place of the room (`main.js SILK_STUDIO`: a dark surround ringed by
  five tall soft strips; Joey's pick, "Try studio reflection"), and a SILK LIGHT, a specular-only point riding above and
  left of the camera (`SILK_LIGHT`), both world- or camera-fixed so the sheen slides as the view turns.
- TWO STRENGTHS: Fast draws without tone mapping, and at the tone-mapped strengths a Silk Gold front clipped to flat
  yellow. Where a tier does not tone-map the light drops to 1 and the studio's reflection to 0.3 (`silkTier`, set in
  applyQuality through one shared uniform).
- Comparison arms, not settings: `?silk=off` (the old finish), `iso`, `rot` (the sheen turned 90 degrees), `nolight`,
  `nostudio`.
- COST, the worst case (every printed region of the 2W-2H silk, against the same regions in plain Panchroma), the stage's
  own scene drawn 60 times a sample with a GPU sync, 7 interleaved rounds on the laptop GPU (idle before, `nvidia-smi`):
  Very High at 3200x1800 1.155 against 1.078 ms a draw, median +0.05 ms, 6 of 7 rounds positive; Fast at 1600x900 0.967
  against 0.897 ms, median +0.065 ms, 5 of 7. A non-silk part compiles none of it. A silk filament's first appearance on a
  kind of part compiles one program variant (the look-card case now warms the presets' finishes, then requires their
  recoloured looks to compile nothing). `D:\Claude - Output\silk-finish-2026-10-28\bench.mjs`, `bench-*.json`.

Joey on the powder-coated shots: "wow these are starting to read really well like silk, even as powdercoated". The
EdgeLabel build (his suggestion) shows all three surfaces at once: the face-down accents glitter (the powder grain's
facets catch the studio), the face-up label wedges are smooth lustrous metal, the angled grips catch the strips.

Not done here, on purpose: the Lab's copies of `part-material.js` (contract 3) and `filament-db.js` are re-vendored after
the deploy, so the Lab never pins a finish that is not live; the Lab's own pane calls the spec without a label and is
unchanged.

Reviews: Sol 01a182f6 (design), Sol 01a18343 (code: the bevel seam, the studio scale split from the light, the debug rebuild hook dropped). Tests: unit 720 pass; the silk and look-card e2e cases pass on the GPU and under E2E_SOFT (the soft Colors run: 29 passed, 2 skipped, the look-card case failed until its rewrite above and passes since). Shots: `D:\Claude - Output\silk-finish-2026-10-28` (`shoot.mjs`, `tune.mjs`).

Live 2026-10-28 13:03 as 06aadeb3: `silk-prod.mjs` green on Fast and Very High - a Silk Gold pick gives the live material
roughness 0.2, metalness 0.75, anisotropy 0.4, the SILK_SHEEN and SILK_ENV defines and the studio reflection; a Panchroma
Yellow pick takes every one away on the same material; the tier strengths read 1 / 0.3 on Fast and 6 / 1 on Very High. The
same check failed on 53c2a639, before the deploy. The Lab's re-vendor is still owed (its drift gate's upstream is the old
viewer checkout, which stopped at the 2026-10-21 catalog).

## 2026-10-28 - The final scene's spools say what they are: a tag on a wire, a sticker on the flange

Joey (relayed by planner-2, 2026-10-27): "a way to identify if they are pla, petg, tpu ... like maybe a paper tag ... two
black spools but one is PLA black and the other is TPU black, but at a glance they look identical."

- **The route there.** Three mock-ups (a hanging tag, a flange sticker, banded rims): he chose the tag. Then, in turn:
  - a kraft shipping tag ("hanging more randomly ... twisted slightly ... partly sideways");
  - hung lower and smaller, so it cannot clip the coil or flange; white paper; "tiny text with brand name ... silk, high
    temp, carbon fiber"; a foot strip "of the exact color";
  - hung from the coil rather than the flange (Sunlu's anti-tangle tag as the reference);
  - "a thin metal wire instead" of a strand of filament.

  Then Astra's review, which he brought: a flange sticker for the views the tag misses, one order of words, and a picked
  row lighting its spool. Last, his four photos of real spools: "make the label aligned to the center of the spool ...
  centered between the oval slots ... just don't want the text to be completely sideways or upsidedown".
- **The words** (main.js `materialOfFilament`, on `filamentsInBuild`'s filament records):
  - a catalogue label's material, read as colors/materials.js reads it;
  - its brand, and its line without the ™ or material words;
  - its colour's own name;
  - the properties its line and name carry: SILK, MATTE, TRANSLUCENT, CARBON FIBRE, HIGH TEMP, HIGH SPEED, GLOW, MARBLE,
    WOOD, SPARKLE, MULTICOLOUR, and TPU hardness "95A" (from "TPU95" or "TPU 95A");
  - a name the catalogue lacks is read by its own words.

  spool.js `tagInfo` orders them: the material; `detail` (grade or finish · colour, "95A · BLACK"); `maker` (brand ·
  line, "POLYMAKER · POLYFLEX").
- **The tag** (spool.js `makeTag`):
  - a white card 20 x 36 mm with its top corners clipped and a 1.9 mm hole, its reinforcement ring in the material's
    colour (the picker's tags: PLA blue, PETG amber, TPU green);
  - the three lines, and a 7 mm foot strip in the filament's exact hex;
  - hung on a 0.6 mm bare-steel wire that leaves the coil just under its surface (90.5 of 91 mm), toward its top front,
    and arches 10 mm out into the hole;
  - the card pivots at the hole, seeded by the spool: twisted 12 to 35 deg, swung 5 to 16, leaning 4 to 12, never
    straight;
  - no point of the card is inside the coil or a flange (the e2e reads its corners).
- **The sticker** (spool.js `makeSticker`, done.js `placeSpoolMarks`):
  - 44 x 24 mm, a band of the filament's colour, the same three lines;
  - on a standing spool's camera-side flange, and on a stack's top spool's top flange (the faces under a spool are hidden);
  - centred in a clear sector between two of the flange's three slots. The slots were measured by rays on the spool mesh
    (2026-10-28): at 90, 210 and 330 deg, 10 deg wide, from the bore to 90 mm. The sticker sits 65 mm out, square to the
    centre;
  - of the six choices (three sectors, words out or in), the one reading most upright from the front: never more than 30
    deg off, the spool's own turn setting how far;
  - fixed in the spool's frame.
- **A shared colour** (Sol 01a1839e): spools are one per hex, and the catalogue has filaments sharing one. Panchroma Grey
  (PLA) and Polymaker PETG Grey are both #9a9da3, and TPU95 and TPU90 Black both #16161a. Such a spool's words say every
  filament on it ("PLA / PETG", both makers), with a neutral ring. Giving each filament its own spool is not done.
- **The font** (Sol): the words are drawn into canvases in Archivo. When the face is not ready yet, the marks are drawn
  again once `document.fonts.load` resolves, if the scene is still on.
- **Colors**: a region's row picked lights the spool it prints in (`selectSpool(activeHex(key))`), as a spool's own picker
  already did. A click on a tag or a sticker is a click on its spool.
- **Lifecycle**: the marks are made after the spools are posed and again at the end of every `refreshSpools`. They are
  cleared before the groups' boxes are measured (the shadow fit and the mugs see only spools) and on leave. ?spooltag=off
  (debug) compares.
- **Checks.**
  - E2E "the Done scene's spools each hang a tag with their material ...": the words, the ring and the strip's pixel; the
    wire (metal, 0.6, tucked); no clip; never straight; the same after a refresh; the boxes unchanged; the silk, the
    two-material line, the shared grey and an unknown TPU 95A; every sticker on its face, in a sector, square to the
    centre, <= 30 deg off upright, no corner on a slot; the font redraw; ?spooltag=off.
  - E2E "Colors: a region's row picked lights the spool it prints in".
  - 23 mutants, each failing one or the other.
  - Unit 722/722; the spool placement, label-palette stripe, floor and boot cases green on SwiftShader; the two room
    cases skipped there green on the GPU.
  - Sol 01a1839e: three findings, fixed; round 2 no objection (its font-weight caveat discarded: Archivo is one variable
    file, 400 to 900).

- **Live 2026-10-28 at `66b7914`** (pushed 14:08, live 14:27). Checked on the live planner (`tags-live.mjs`, Assemble's
  final scene, the build in Elegoo PLA Black):
  - tags "PLA / BLACK / ELEGOO" (ring #2a64c4) and "TPU / 95A · BLACK / POLYMAKER · POLYFLEX" (ring #1b7a50), both on
    metal wires;
  - the stack's top spool's sticker "PLA / BLACK";
  - marks drawn once, no page errors.

## 2026-10-28 · A shared build carries its colours

Astra, after the label palette went live: "Users reasonably expect 'Share build' to share what they see. Carrying the
stripe while dropping the label background can change both its appearance and readability." The requirement: opening a
shared build in a fresh browser reproduces its colours, label bodies, text and stripes included, without inheriting the
recipient's unrelated preferences; old links keep their fallback. Design note `docs/redesign/SHARE-LOOK.md`.

- **The record carries its look:** a new field `look` = `{ v: 1, on, colors, over }`, the Colors palette as chosen (every
  part pick, the per-unit picks, the label body and text). The store stamps it at every serialisation, so the address (what
  Share copies), Undo's write-back, Recent, the slot and a file all carry the current colours.
- **The boot applies it** once, through one gate (decode, `buildTooNew`, the schema's `cleanLook`), in place of this
  browser's palette for the build and of the first preset; a look of instruction colours stays one. A record with no look
  (every link and file before today) opens exactly as before. A `#scheme=` beside the link still applies after it.
- **The recipient keeps their own:** label defaults, saved schemes, the owned list and "★ My palette" are untouched.
- **The chosen `on`, never Assemble's Part colors:** the stage holds the chosen value while that temporary view is on, and
  both the look and the history read it.
- **Outside data:** names are strings of at most 80 characters, hexes have 3, 4, 6 or 8 digits, links are http(s) of at
  most 500 characters, plain objects only, no prototype keys; past 256 KB of UTF-8 the per-unit layer is dropped and the
  build-wide colours stay (a fully picked build is under 4 KB).

Tests: `test/share-look.test.mjs` (the cleaner, the cap in UTF-8 bytes, the round trip, the store stamping and Undo); E2E
"Share: ..." x3 (a fresh context with its own same-id palette, defaults, schemes and owned list gets the sender's body, text,
part, unit pick and stripe, its own settings unchanged; `on: false`, the no-look fallbacks and `#scheme=`; Assemble's Part
colors never shared or undone into). Mutants: the boot apply disabled fails two cases; `look()` reading the live flag
fails the Assemble case. Unit 736/736, e2e 95/95 (Colors, Assemble, Share, Labels, Parts, presets,
undo). Reviews: Sol 01a183be (design: reject, nine changes folded in, three discarded with reasons in the note), Sol
01a183df (code: the cap counted UTF-16 units; now UTF-8 bytes). Not deployed: a new feature, waiting on Joey's go.

## 2026-10-28 · On a phone an open sheet puts the tab bar away; a stack's tags are staggered

**The tab bar.** Joey, asked whether to hide the bottom bar while a sheet is open on his phone (at his 360 x 675 an
open sheet left 61 px of model between the top chrome and the sheet): "yes".
- Upright, while a sheet is open, the tab bar steps out (`#ws.bar-off`, phone.js `stack`). The dock, or Assemble's
  player, drops into its place, 6 px off the bottom plus the screen's inset, and the sheet sits 6 px over it (`base`
  reads the dock's own top, as on its side). The model's strip about doubles: 61 to 119 px at 360 x 675.
- Collapsing the sheet (its handle) brings the tabs back. A workspace that opens a sheet on arrival (Colors, Parts)
  shows no tabs until it is collapsed: the trade accepted.
- On its side the tabs are a rail beside the sheets, and stay.
- A sheet's `bottom` now moves with its slide (`transition`). Done at once, a sheet collapsing as the bar came back rose
  58 px over the model for the slide's first frames. A tap on a part in Colors collapses the sheet, and the tap's click,
  about 110 ms later, landed on the rising handle and opened it again: the phone journey and the part-card case caught
  it, and a toggle trace found the click on the handle's title.

**The tags, staggered.** Joey, on a five-spool stack: the tags hung "perfectly in a vertical column ... randomize them
slightly ... as if you rotated the spools a few degrees to the left or right ... but mostly still visible from the front".
- A lying spool's wire leaves the coil 5 to 20 deg round from its front, either way, seeded by the spool apart from the
  card's hang (done.js `placeSpoolMarks`). It is at least 10 deg off the tag before it in the stack, re-drawn up to eight
  times, then put on the other side (Terra 01a183f3).
- The card turns with its wire (the pivot's twist). Left square to the room, its corner on the turned side swung into the
  coil (the e2e's clip check: r 90.6 of 91.5).
- A spool on its rim is not turned: its front is the coil's furthest-forward line, and turned, the card would hang up
  or down the coil, toward it.

**Checks.**
- E2E "the phone: an open sheet puts the tab bar away, the dock or the player takes its place, and collapsing brings
  the tabs back" (360 x 675, Build and Assemble). The Build library case and the phone journey collapse their sheet
  before a tab.
- The tag case: every lying tag 5 to 20 deg round, a standing one at the front, neighbours 10 deg or more apart (a
  five-colour stack has a pair), no clip, the twist counted from the wire.
- The sideways case: the rail stays beside an open sheet.
- 9 mutants, each failing its case: the bar never put away, put away on its side too (it survived until the sideways
  check), left visible, the dock left up, the sheet's base off the dock, `bottom` jumping, the tags not turned, the
  neighbours let line up, the card square to the room.
- All 24 phone cases and the tag cases green on SwiftShader. The tag case runs about 5 min here under load; its new
  five-colour step is 3.3 s of it, and the rest is its three fresh entries, as before.
- Terra 01a183d2 (the bar, then the bottom transition): no findings. Terra 01a183f3 (the stagger): one finding, fixed.
