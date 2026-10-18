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
- **The Label Studio's return address.** The merged app passes `?return=<its address>` when it opens the Studio; a Studio change on branch `planner-return` (not deployed) honours it for the planners' exact paths, so "Add to planner build" comes back here. The two-way job protocol keeps waiting for the domain: an origin allowlist cannot name a path, and a GitHub Pages origin is a whole account (Terra 01a135bc).
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
  - pink in Part colors; in the presets the core takes the case colour and the face the faceplate face colour;
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
