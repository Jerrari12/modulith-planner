# MODULITH Planner + Build Studio: Feature Inventory and Redesign Map

This is a companion to `MODULITH-planner-style.md`. It lists everything the live planner (gen2planner.jerrari3d.com) and 3D Build Studio (gen2build.jerrari3d.com) do today, and says where each feature lives in the redesign.

**Rule for the redesign:** nothing on this list gets dropped silently. If a feature is cut, cut it on purpose and say so.

Sources: planner `js/app.js` + `js/data.js` (the `GEN2` catalog), the live planner UI, and the live Build Studio UI. Inventory taken Oct 12, 2026.

## How it works today

- **Planner:** one long guided page with numbered steps:
  1. Install location
  2. Your printer
  3. Length
  4. Design your layout
  5. Customize your build
  6. Parts list

  Steps unlock in order and collapse to summaries on mobile. A docked live 3D preview sits beside the page (collapsible, resizable, can pop out to the full Studio).
- **Build Studio:** a separate app that stays in sync with the planner. It has a cover screen, step-by-step 3D assembly, a "Your build" options panel, per-part popups, the filament color picker, and its own parts list.
- **Redesign:** both become one app with workspaces: **Build · Colors · Labels · Parts · Assemble**. The 3D viewport is always the stage.

## Redesign map

Legend: **Bar** = top-bar chip/popover · **Setup** = new-build setup flow · **Build/Add** · **Build/Style** · **Inspector** · **Colors** · **Labels** · **Parts** · **Assemble** · **Dock** = bottom Build Dock · **Board** = in-viewport warnings and overlays

### 1. Build setup (planner steps 1–3)

| Feature today | Details to keep | New home |
|---|---|---|
| Install location | Under-Table / Tabletop / Wall Mount cards with photo, blurb, plan tip. "Needs wood screws" marker on Under-Table and Wall. | **Setup**, then **Bar** chip (mount icon + name) |
| Workable space | Under-Table and Wall only. Width/height in mm, caps the grid, with a live graphic ("up to 4W, 12 mm spare"). | **Setup** + mount chip popover |
| Printer | ~35 presets grouped by brand, "Any printer / not sure", Custom X/Y bed. Fit checked in both orientations. Classic drawer adds ~10 mm handle depth. Readout of max case width and max rail section. | **Setup** + **Bar** "Printer" chip (amber dot when unset) |
| Build plate finish | Powder-coated (default) / Smooth / Holographic. Only changes how bed faces render; bills nothing. | **Colors** (it's an appearance setting) |
| Length (collection) | 59/115/165/185/240/270 with taglines + inside depth. Badges: recommended, won't fit (disabled), no tabletop (59), no 3D guide yet (under-table at some lengths). One length per build. | **Setup** + **Bar** chip (mount · length) |
| Re-validation | Changing printer or mount clears an invalid length and re-checks the selected size. Mount switch re-anchors the whole layout as one undo step. | Same logic, with a toast explaining what changed |

**Gap in the current mockups:** there is no setup flow. Needed: a first-run sheet over the viewport (mount → length → printer, with a skip for "Any printer"). Returning builds skip it, and the chips edit it later.

### 2. Layout editing (planner step 4)

| Feature today | Details to keep | New home |
|---|---|---|
| Unit palette | Classic Drawer, Decor Drawer, Shelf, Cabinet (soon). Each has an icon and blurb. A "bridge" under the tiles offers to convert existing drawers. | **Build/Add** |
| Size picker | Drawers: 1–4W × 0.5/1/1.5/2/3H, minus 3W·3H and 4W·3H. Cases up to 6H. Shelf/Cabinet: whole heights, min 1H. 59 caps at 2W and 1H drawers. Greyed sizes explain why ("won't fit your printer", "not in the 59 lineup"). Interior dims shown for the selected size. | **Build/Add** (proportional tiles) |
| Gridfinity Decor Drawer | A Decor variant. Lengths 115–270, heights 1/1.5/2. Cells deep per length (2–6). Optional 6×2 magnets. | **Build/Add** variant toggle under Decor + **Inspector** |
| Shelf lips | Front lip per shelf. 240/270 also take a mid lip ("both"). | **Inspector** when a shelf is selected |
| Cabinet interior | Compartments on a 1W/1H grid. Red cells until fully tiled. | **Inspector** (cabinet editor), once cabinets ship |
| Grid | Default 6W × 4H, 1–12 per axis, capped by space and bed. "+" strips add a column or row (away from the anchor edge). Tabletop height is automatic. Placing a tall unit grows the grid. | **Board** (grid lives in 3D/2D) |
| Place / select / move | Click to place (decided on release). Drag past 18 px mouse / 30 px touch. Ghost is green when valid, red when not. Overlaps rejected. Arrow pad nudges the selected unit. Remove. Drop animation. | **Board** + **Inspector** (Move, Duplicate, Remove). Add an on-unit ✕ bubble: users ask for it. |
| Undo / Redo | History coalesces edits within 350 ms. | **Bar** |
| Surprise me / Load example | Random valid build; example layout. | Empty-state actions on **Board** |
| Start fresh | Clears every choice back to step 1, with a warning to save first. | Build switcher menu |
| Mount scene | Draws rails, covers (CU over CL, brick stagger), foot rails (FR-U/FR-L when the bottom row has more than one case), feet, wall brackets. | **Board** (3D) |
| Wall cover style | "One connected top · most rigid" vs "Each column lifts off on its own". | **Build/Style** (wall builds only) |
| Feet | Print TPU feet vs buy adhesive rubber feet (same count and spots). | **Build/Style** (tabletop only) |

### 3. Structure warnings and auto-fixes (keep all, they prevent failed builds)

| Warning | Fix action today | New home |
|---|---|---|
| Unit not supported on both ends | **Fix structure** (moves units / adds support cases) | **Board** warning chip + **Dock** status turns amber |
| Would sag mid-span | Guidance text | **Board** + **Dock** |
| Wide case may bow under load | Guidance text | **Board** (soft warning) |
| Wall top row is 0.5H | **Grow top row to 1H** | **Board** + **Dock** |
| Units not in this collection | Swap sizes or pick another length | **Board** + **Dock** |
| Units won't print on this printer | Guidance | **Board** + **Dock** |
| Cabinet interior unfinished | "Fill the whole cabinet · N cells left" | **Inspector** |
| Tabletop not complete ("Finish the top…", "Fill to this line") | Shows the fill line | **Board** overlay |
| 3D instructions blocked (under-table at some lengths, cabinets, unsupported/sag/flat) | Explains why | **Assemble** tab disabled state with reason |

The Dock's "Ready to build" must reflect these. It should say "2 issues" (amber) and open a list on click.

### 4. Build style (planner step 5 + Studio "Build options")

| Feature today | Details to keep | New home |
|---|---|---|
| Drawer type master | Classic / Decor for every drawer. The conversion plan explains partial results ("2 stay Classic Drawers: won't fit your bed"). Conversion keeps position, size, label and closure. Undo restores. | **Build/Style** + per-unit in **Inspector** |
| Decor faceplate | Core: Essential, Classic (integrated grip, optional back cover). Club ✦: EdgeLabel, Classic Pro (labels + accents, integrated handle), Chevron (continuous multicolor pattern, bolt-on handle). Studio cycles faceplates with ◀ ▶. | **Build/Style** |
| Club note | "Included with the Club · or buy it once on Printables or Thangs" + join links. | **Build/Style**, small and non-blocking |
| Handle series | Only for bolt-on faceplates (Essential, Chevron): Deco (default), BlockBar (A–F, picked in 3D), Crystal (A · B Wide). Needs 2× M3×6 screws per handle. | **Build/Style** + per-part carousel in 3D |
| Faceplate back cover | Off / On, any faceplate. | **Build/Style** |
| Closures | None / Magnets (2 clips + 2 magnets per drawer; magnet sizes 10×2, 6×2, N52 variants) / Push-Click (soon, not for wall). Per-drawer override. | **Build/Style** + **Inspector** |
| Drawer stoppers | All / None, per-drawer removal. Under-table top row has built-in stoppers. | **Build/Style** + **Inspector** |
| Door style (cabinets) | Essential / EdgeLabel / Classic Pro. | **Build/Style** when cabinets exist |
| Videos | "▶ Watch" chips per faceplate/fill/mount (e.g. EdgeLabel faceplate assembly; cabinet + wall). | Contextual chips in **Build/Style** and **Assemble** |

### 5. Colors (from Build Studio, becomes its own workspace)

| Feature today (Studio) | Details to keep | New home |
|---|---|---|
| Per-part color regions | The part popup lists that part's regions (e.g. Classic Faceplate: Body, Face, Grip, Grip accent). | **Colors**: role list = these regions, grouped by part type |
| Filament picker | Search box. "In this build" row. Collapsible brand groups with counts: Polymaker Panchroma PLA · 28, Panchroma Silk PLA · 24, PETG · 25, Panchroma Translucent PLA · 9, Elegoo PLA/PETG · 3, Printed Solid PLA · 21. "★ Used by Jerrari" marker. Hundreds more coming. | **Colors** left panel |
| Buy link | "Buy <filament> → · paid link" for the selected filament. Polymaker discount line ("15% off… code JERRARI… links apply it for you"). Ambassador/affiliate disclosure. | **Colors**: see "Purchase links" below |
| Instruction color | Resets a part to its instruction color. | **Colors**: "Instruction colors" toggle for the whole view + per-part reset |
| Color presets | The Jerrari, Stealth, Signal, Sandstone. | **Colors**: presets row at the top |
| Save colors / Upload | Export/import a color scheme. | **Colors** |
| Screen-color caveat | "Screen colors are approximate · the light stage gives the truest read." | **Colors** hint, linked to the Day Grid toggle |

**Purchase links (don't reinvent):** keep the Studio pattern. Selecting a filament shows a single "Buy <name> → · paid link" line in the panel footer, plus the brand's discount or disclosure. Add two small things:

- A small bag icon on a swatch only when it's hovered or selected, never on all of them. With hundreds of swatches, permanent icons become noise.
- A "Filaments in this build" list (opened from the Dock's filament stack) with a buy link per row. That's the shopping list people actually want.

Brand groups stay collapsible, with search and "In this build" pinned at the top.

### 6. Labels

| Feature today | Details to keep | New home |
|---|---|---|
| Typed labels | Decor drawers only, faceplates with a label system (EdgeLabel, Classic Pro). Stored as typed, shown in caps unless the style says otherwise. Wraps to 3 lines with an ellipsis. Ordered top row first, left to right. | **Labels** + quick field in **Inspector** |
| Label tray | "N in the tray · N on drawers". Tap a label, then a drawer; the next label is auto-picked. Unassign, remove, "on drawers" list. | **Labels** left panel |
| Label Studio link | Two-way session ("Design your EdgeLabel labels → · N labels ready"), one-way fallback, size limits, review/merge of returned labels, conflict rows. | **Labels** primary action |
| Imports | Label lists and Part Picker label files, labels links in the URL, restore/discard a saved label copy. | **Labels** |
| Icon-only labels | A drawer can keep an icon with no words. | **Labels** |
| Download labels | Label list file. | **Labels** + **Parts** exports |

### 7. Parts list (planner step 6 + Studio list)

| Feature today | Details to keep | New home |
|---|---|---|
| Summary | "Your MODULITH build is ready · Tabletop · 185 mm · N drawers · W × H × D", "N printed pieces from N model files", buy line. | **Parts** header + **Dock** |
| Availability | "✓ All required parts are available" / "⚠ N required parts not released yet" / optional parts in development. | **Parts** + **Dock** status |
| Groups | Units, Cases & extenders, Faceplates & handles, Hardware, kit (Table Top / Wall Mount / Under-Table rails), shelf inserts and lips, cabinet parts. Badges: OPTIONAL, CLUB EXPANSION, COMING SOON. Notes per part. | **Parts** |
| Starter kit tip | "New to MODULITH? The … Starter Kit bundles everything." | **Parts** callout |
| Build tracking | "☐ Track my build" → per-piece checkboxes, "N of N pieces done", reset progress. | **Parts** (strong feature, make it visible) |
| Store links | Per part: Printables / Thangs / MakerWorld / Cults 3D site switcher (remembered). Hardware via Amazon with Associate disclosure. | **Parts** (site switcher in the header) |
| Exports | Copy as text, Download CSV, Print, Save build image, Download labels. | **Parts** export menu + **Share** |
| Part thumbnails | Zoomable images. | **Parts** |

### 8. Assemble (Build Studio)

| Feature today | Details to keep | New home |
|---|---|---|
| Cover screen | Kit title, collection badge, drawer/step/size stats, "Get started", "Skip to the finished build", "Customize this build" (opens the planner), "Copy link to this kit". | **Assemble** entry; shared kit links land here |
| Step player | Step cards with text (e.g. "11 Faceplates"), step dots, Back/Next, Pause, Slow-mo, Replay. | **Assemble** |
| Part popup | Click a part to isolate it: name, "×N in this kit", color regions, download link, style carousel, "Open the drawer". | **Inspector** in every workspace |
| Measure | W/H/L in mm + in. | Toolbar (all workspaces) |
| Render quality | Very High … (fast/balanced/high tiers; layer relief only at higher tiers). | **Bar** or settings popover |
| Light/dark stage | Studio stage themes. | Day Grid / Night Grid toggle |

### 9. Save, share, versions

| Feature today | Details to keep | New home |
|---|---|---|
| Build identity | Random build id kept through saves, links and undo. | Build switcher |
| Save / Load file | Save the build file, load a build file, "That file isn't a valid MODULITH build." | Build switcher menu |
| Share link | Copy link, long-link warning, too-big-for-link fallback, email link limits, damaged-link notice. | **Share** button |
| Deep links | `?build=` kits, `from=printables/makerworld/thangs`, label import links. | Unchanged |
| Version safety | "Saved by a newer version" guard; "planner was updated · refresh, your build is kept"; storage-full warnings. | Unchanged (toasts) |
| Official kit export | Owner-only kit title/id/tagline export. | Hidden owner tool |

### 10. App chrome

- **Feedback & support** button, the **dark mode** switch, and the **site menu** (How It Works, Starter Builds, Catalog, Planner, Instructions, Community Builds, Build Studio, The story, About, Support, Club & membership, More Designs).
- **Analytics:** keep the GoatCounter event names (`mount:`, `length:`, `printer:`, `buildplate:`, `fill:`, `faceplate:`, `backcover:`, `handle:`, `closure:`, `convert:`, `out:*`, `hardware:buy`) so telemetry stays comparable before and after the redesign. Today config events also land in the referrer report; fix that in the rebuild.

## The build switcher ("Workbench build")

In the mockups it's the build name, the build's "file". Today the planner has no named builds: just a build id, Save/Load file and a share link. Recommendation:

- **Name:** an editable name, defaulting to the kit title or "Untitled build".
- **Menu:** Recent builds (stored locally), Save to file, Load file, Copy share link, Start fresh, Duplicate build.

That puts all the scattered save/load/start-fresh controls in one predictable place.

## Gaps the C v2/v3 mockups don't cover yet

1. A setup flow (mount, length, printer, workable space).
2. Warnings and fix actions on the board, with the Dock status reflecting them.
3. Handle series, wall cover style, feet, Gridfinity variant, shelf lips, door styles.
4. The Labels workspace (tray, Label Studio link).
5. The Parts workspace (groups, tracking, store switcher, exports).
6. The Assemble workspace (cover + step player).
7. The full filament picker (search, brand groups, presets, buy footer).
