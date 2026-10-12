# Inventory cross-check

Written 2026-10-12. Joey's `MODULITH-planner-inventory.md` is the target: it says where each feature lives in the redesign. This checks it against `01-capability-inventory.md` (the discovery inventory, 69 rows verified against production code on 2026-10-11) and flags every row of the discovery inventory that the target does not place. Nothing is dropped silently: each flag ends with a proposed home or a proposed, explicit cut.

Legend for "Proposed": a home from the target's own legend (Bar, Setup, Build/Add, Build/Style, Inspector, Colors, Labels, Parts, Assemble, Dock, Board, plus the target's **Share** button), or **CUT** (obsolete by the redesign itself, said so here), or **EXTERNAL** (lives in another repo and is not the planner's to place).

## 1. Placed in the target, no action

Every discovery row not flagged in section 2 is covered by a target row, by section: A (mount, printer, length, example, surprise, kits, start fresh), B (palette, size picker, grid, place/move/select, undo, conversion, per-unit options, footprint), D (build-wide style, filaments, plate finish, cabinets and Push-Click as soon), E (tray, Label Studio link, imports, icon-only labels, download), F (BOM, tracking, exports, store links, thumbnails, starter kit tip), G (assembly), H (autosave, save/load, share link, kit links, versions), I (feedback, videos).

## 2. In the discovery inventory, not placed in the target

| # | Discovery row | Why it matters | Proposed |
|---|---|---|---|
| 1 | **First-run help** (A): "New to MODULITH? Three things to know", per-mount tip line, info tips on headings, the length explainer. | The only teaching the planner does; the target's setup sheet replaces the form but says nothing about the primer. | **Setup** step 1 carries a one-line "three things" primer, collapsible, remembered; the per-mount tip becomes the mount card blurb (already in the target); info tips survive as tooltips. |
| 2 | **The docked 3D preview's own controls** (C): collapse, expand, resize, pop out to a full Studio tab that stays linked. | 30-day counts: revealed 228, collapsed 111, popped out 78. | **CUT on purpose**: one app, the stage is always there. The `\` key that hides all chrome (spec §2) is the replacement for "expand". Keep the event names (`dock:*`) retired, not reused. |
| 3 | **"The 3D view cannot add, move or remove units"** (C) | A design limit of the relay era. | **CUT on purpose**: reversed by the Build workspace (3D editing as tried in the prototype, per Joey's decision 2026-10-12). |
| 4 | **The 80-unit cap** (C, "build types the 3D view refuses") | The target lists under-table lengths, cabinets, unsupported/sag/flat as blocked reasons, not the unit cap. | **Board** + **Dock**: the cap stays a Build warning in the issue card ("Instructions stop at 80 units"), as the approved plan's risk register says (`stateless-tumbling-cocoa.md` §3, approved 2026-10-12). |
| 5 | **Side Covers** (D): released on Printables and Thangs (27 sizes, 2026-10) but still unreleased in the planner, no toggle. | A PLANNED row with a live ticket; the target has no row for it. | **Build/Style** toggle + **Parts** rows, when the planner row lands (site ticket `TICKET-side-covers-2026-10-10.md`). Flag for Joey: this is catalog work, not redesign work; decide whether it rides along. |
| 6 | **Labels panel on the `label-place` branch** (E, LOCAL `d8fc6f5`): select a drawer first, "Place several", Replace dialog, "Fill empty drawers…" with preview, label-only Undo. | Built and headed-tested by the other session, unpushed; the target's Labels row describes the older tray. | **Labels**: the target's tray row absorbs these four behaviours (place several, replace with confirmation, fill with preview, undo). Astra's label-identity rules from the prototype (reuse is explicit, shared edits ask) belong here too. |
| 7 | **3D Labels panel on `label-place`** (E, LOCAL `54a9ade`): labeling mode in 3D, tap any part of a drawer, hover preview, "Place your N labels" from the cover. | Same branch; the target has no 3D placement for labels. | **Labels** + **Board**: in the merged app this is the Labels workspace's "Build · assign" view acting on the stage (the spec already says drag onto a unit or tap-then-click). Note the relay protocol it used (`labelPlace` messages) is retired. |
| 8 | **Label icon editing from 3D** (E): auto / none / letters / 32-icon catalog / uploaded SVG; set-wide text size, depth, icon size, bold, caps, prediction. | The target's Labels row keeps words; icons and uploads are only implied by "Typed labels". | **Labels** row list + **Inspector** quick field: the icon choice and the upload ride on the shared label schema's `icon`; the set-wide settings are the spec's "collapsible label settings". |
| 9 | **Part Picker** (E) as a sheet inside the app | The target's §6 names the Picker only as a file import ("Part Picker label files"); the style spec has it as a large sheet over the workspace ("Add N part labels"). | **Labels** sheet, per the spec; the file import stays as the target says. Flag so the target's Labels row names both. |
| 10 | **The four-way label data model** (E): part identity, label content, appearance, drawer assignment kept apart. | A rule, not a feature; the shared schema in the spec keeps it. | **Labels** schema note. No UI. |
| 11 | **"Track my build" is keyed by part name across every build in the browser** (F) | A known bug: a second build inherits the first build's ticks. | **Parts**: tracking becomes scoped to the individual build (saved with it, in the store the approved plan §1.3 chose). Say so in the Parts row. |
| 12 | **The 3D Studio's own parts list** (F): its own formatting and CSV, and its `bom:*` events | The target's §7 title merges it into Parts, which places it; what is not said is which analytics names survive. | **Parts**, as the target says. Add to the target's §10: the Studio's `bom:copy` / `bom:csv` map to the planner's `export:copy` / `export:csv`, so the Studio's names retire. |
| 13 | **Download a whole starter kit as one bundle** (F) and the **site part and build pages** | External pages. | **EXTERNAL**: the Parts workspace links out (the starter-kit callout already does). |
| 14 | **Written guides on the site**; the planner's mount cards link to them through old addresses | 13 guides; no per-build link to the matching one. | **Assemble**: a "Written guide" link per mount under the step list; fix the addresses while moving. |
| 15 | **"Send to phone" / instructions beside the physical build** (G, IDEA) and **reopen on another device** (H, IDEA) | The prototype walkthrough found cross-device continuity is an expectation, not a request (Joey opened the same link on a laptop and expected his phone build). | **Share** button, as a proposal for Joey to decide: the snapshot link with a QR and a "Send to my phone/computer" wording. The prototype worked in that direction (autosave + file + snapshot links, no account sync), but that was never recorded as Joey's decision. |
| 16 | **Usage dashboard** (I, local only) | Dev tooling. | **EXTERNAL**: stays in the viewer repo's `serve-stats.py`; GoatCounter names unchanged so it keeps working. |
| 17 | **Phone and touch** (J): the planner's one-column phone layout, the Studio's bottom sheets, the Label Studio's phone layout, and the concept's phone workspace (chip bar, Edit/3D switch, bottom sheets). | The target has no phone section; the spec has one line (below 1024 px panels become bottom sheets, tabs move to a bottom bar). | Every workspace row needs its phone form. Propose a short "Phone" section in the target listing, per workspace, which panel becomes a sheet and what the bottom bar holds. The prototype's phone findings (keyboard loop on the label field, swipe the empty grid, place without the sheet opening) are inputs. |
| 18 | **Kit entry from the Studio gallery and the site** (A): `?build=<kit>` opens the cover; the gallery cards have no "Open in the Planner" | The target places `?build=` deep links (§9) but not the gallery. | **EXTERNAL** (the gallery is in the viewer repo's `builds/`), plus: `?build=` lands on **Assemble** per the target's §8, which is right; the "Customize this build" button becomes "Build" tab. |

## 3. In the target, not in the discovery inventory (new or changed on purpose)

- **On-unit ✕ bubble** for removal (§2): new; the prototype's Remove mode and unit menu are the tried alternatives, both can coexist.
- **Build plate finish moves to Colors** (§1): a placement change; the planner keeps it in the build record.
- **"Start fresh" moves into the build switcher** and never wipes (spec §0): a behaviour change from today's wipe-with-warning.
- **Config events land in the referrer report, fix in the rebuild** (§10): an analytics bug to fix in `track()`.
- **Dock "Ready to build" must say "2 issues"** (§3): new; the prototype's status pill and issue banner are the tried form.

## 4. Conflicts between the target and the style spec, to settle

| Target says | Spec says | Proposed |
|---|---|---|
| Part popup → **Inspector in every workspace** (§8) | Clicking a part in **Colors** opens a part popup on the stage; in Build a click selects the unit (§0) | Both: the inspector is the unit's editor; the stage popup is the Colors-only part card. |
| Measure → toolbar in all workspaces (§8) | Done scene has no measure, grid or callouts (§0) | Toolbar everywhere except the Done step. |
| Render quality → **Bar** or settings popover (§8) | Quality pill in the artboard's toolbar ("Quality · High") | Toolbar, as the artboard draws it. |

## 5. What this cross-check could not verify

- Whether the `label-place` branches (rows 6 and 7) still apply cleanly: they are unpushed worktrees of the other session; the Labels phase must read them before porting.
- Phone layouts: no phone mockups exist; row 17 is a request for a section, not a finding.
