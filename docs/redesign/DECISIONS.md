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
- **Not deployed.** Branch `side-cover-toggle`, for Joey's go.
