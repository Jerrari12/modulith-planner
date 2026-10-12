# MODULITH Planner: Visual Style Brief v3 ("Day Grid / Night Grid")

> **v3 adds** the full app structure: setup flow, build switcher, five workspaces (Build · Colors · Labels · Parts · Assemble), board warnings with fixes, and the filament picker with buy links. See section 0.
>
> `MODULITH-planner-inventory.md` lists every current planner and Build Studio feature and where it lives. Nothing on it gets dropped silently.
>
> The reference prototype is now the v4 app artboard, `modulith-planner-reference.dc.html`.

## 0. App structure (v3)

- **One app, five workspaces** as top tabs: **Build · Colors · Labels · Parts · Assemble**.
  - The 3D stage, toolbar and light/dark toggle are shared by all five.
  - Labels shows a `labelled/slots` badge, and Parts shows the printed-piece count.
- **Setup sheet** (new builds, and editing from the top-bar chips): Mount → Length → Printer, over the stage.
  - **Mount:** cards with a drawn scene icon and "Needs wood screws" or "No tools". Under-Table and Wall add optional workable width/height.
  - **Length:** cards with the collection color stripe, inside depth and use. Badges: RECOMMENDED (185), NO TABLETOP (59 on Tabletop), WON'T FIT (from the bed).
  - **Printer is optional.** It defaults to "Any printer / not sure", which leaves every size available; picking a printer only greys out sizes that won't fit. A "Custom bed size…" option takes X/Y in mm. A live fit line reads, for example, "Bed 256×256 · at 185 mm you can print cases up to 2W". The top-bar chip reads "Any printer" with no warning dot.
  - **Build name** field on step 1.
  - Afterwards the top bar shows `Mount · Length` and `Printer` chips that reopen the sheet at that step.
- **Build switcher** (left of the tabs): current build name, Recent builds, Rename, Duplicate, Save build file, Load build file, New build. This replaces the scattered Save/Load/Start fresh controls.
  - **New build never wipes anything.** It saves the current build to Recent builds and opens the setup sheet. Only an explicit "Delete build" is destructive, and it asks for confirmation.
  - **Autosave:** every build autosaves to IndexedDB in the browser. Recent builds keeps up to 20. Never delete builds by age. At the cap, warn before the oldest is dropped, and offer "Save a file" first.
  - **Ask for durable storage:** call `navigator.storage.persist()` after the user's first saved build, so the browser doesn't evict it under storage pressure.
  - **Safari caveat:** Safari and every iOS browser can clear script-written storage after 7 days without a visit to the site. The menu always says "Autosaved in this browser", with a nudge to save a file or copy a share link for builds that matter. An optional account sync (the club login work) is the long-term fix.
- **Build** workspace:
  - **Add units:** unit + Standard/Gridfinity + proportional sizes. Disabled sizes say why on hover (printer fit, whole heights, Gridfinity heights, 59 lineup), plus an interior-size readout.
  - **Build style:** drawer type (with a conversion toast), faceplate, handle series (only for bolt-on faceplates), closures (with tips), stoppers, back cover, feet (tabletop), top cover style (wall), "▶ Watch" video chip.
  - **The panel collapses** to an Add/Style rail.
- **Warnings:** the problem unit gets a dashed amber outline and a "!" badge on the board. The Dock status becomes an amber "1 issue" button that opens an issue card with **Show me** and **Fix structure**. The Inspector repeats the warning for the selected unit. A fix shows a confirmation toast. Every planner warning (unsupported, sag, bow, wall 0.5H top row, not in collection, won't print, cabinet interior, tabletop completion) uses this pattern. Amber is warning-only and never orange.
- **Colors** workspace: click-a-part first. This is the Studio flow, minus the clutter.
  - **Clicking a part in the view** opens a part popup on the stage, with:
    - the part name, its count in the build, and the current filament;
    - region chips (Face · Grip/Handle · Label · Label text, or Body for cases);
    - the download link, the faceplate ◀ ▶ style carousel and Open the drawer.
  - **Clicking a region chip** opens the **filament picker** on the right, which replaces the Inspector in this tab. It has:
    - a title ("Grip · all 6 grips");
    - an **Apply to** toggle: "All 6 grips" (default) or **Only this one** (single-unit override, only when a unit was clicked);
    - search, "In this build", and collapsible brand groups;
    - a pinned buy footer with the discount/disclosure line and a Reset button.
  - **Left panel = schemes and overview:**
    - **Your schemes** (★, saved locally; e.g. "My palette"), "+ Save current colors as a scheme", Upload scheme, Share scheme.
    - **Premade by Jerrari** (The Jerrari, Stealth, Signal, Sandstone), each with a color strip, an Active tag and "Shop this look ↗".
    - **Colors in this build:** one row per region with its count and filament. Clicking a row opens the picker for that region, for parts that are hard to click in 3D.
    - **Build plate finish**.
  - **Clicks are scoped to the tab:** clicking a part only paints in Colors. In Build, a click still selects the unit for editing.
  - **The Dock** filament stack opens the "Filaments in this build" shopping list.
  - **Data model:**
    - A *scheme* is a map of region → filament id.
    - Regions are defined per part type (case, cover, foot rail, foot, drawer body, faceplate face/grip/accent, handle, label body/text, Chevron strips…).
    - Applying a scheme sets only the regions the build has.
    - Per-unit picks are an override layer `{unitId: {region: filamentId}}` on top of the scheme, cleared by "Reset" or by applying a scheme.
    - This replaces today's mix of palettes, Save colors/Upload and parts living under one Studio panel.
- **Labels** workspace: one shared label list with two views. The Label Studio stays its own app (labels.modulith.systems) running the same engine.
  - **Never hidden or greyed out.** Builds without a label faceplate still open the tab: a callout explains that EdgeLabel / Classic Pro take printed labels, offers "Switch to EdgeLabel ✦", and says paper and label-maker labels are coming. The list can still be built and exported. Units that can't take a label are dimmed while assigning, and dropping onto one explains why.
  - **What a label says is separate from how it is produced.** One schema shared by planner and Studio: `{id, text, icon, partRecord, styleOverrides, unitId | null}`.
    - Output types: printed EdgeLabel / Classic Pro plate (now), Avery sheet PDF or label-maker tape (later), and CSV/TXT export (always).
    - The standalone Studio simply never sets `unitId`. Label list and Part Picker files stay compatible both ways.
  - **Left panel = the label list:** + Add label, **Part Picker**, Presets, Import CSV/TXT, and collapsible label settings (text height/depth, icon size, caps, predict icons). Each row shows a drag handle, predicted icon, the label as a white strip, a status pill (**Unit 3** or **In tray**) and remove/move-to-tray. There is also an **Auto-fill in order** button (top row first, left to right).
  - **Center toggle: Build · assign / Print plate.**
    - **Build:** drag a label from the list onto a unit, or tap it then click a unit (touch and keyboard path). Dropping onto a labelled unit swaps, and the old label goes back to the tray. Valid targets glow faintly while dragging.
    - **Print plate:** the Studio's plate preview (label shape, wipe-tower zone), using the printer already set in the planner. The CTA becomes **Download print file (.3mf)**.
    - In Build view the CTA reads **Print labels** and switches to the plate.
  - **Part Picker** opens as a large sheet over the workspace: family tiles, thread, multiple lengths, and a summary with live label previews. **Add N part labels** appends them to the list as "In tray" and closes the sheet. The real picker keeps its full attribute rows and pinned fields.
  - **Integration path:**
    1. **Now:** an embedded mode for the Studio (`?embed=planner`: no Studio nav, planner theme, existing two-way sync with review/merge).
    2. **Later:** extract the Studio core (list editor, Part Picker, plate preview, export) into one shared module both apps mount.
    3. **Both apps** use these Day/Night tokens.
  - **Size check:** if label size ever depends on unit width, assignment must happen before export.
- **Parts** workspace (wider panel):
  - Count of pieces to print and model files, availability line, download-site switch (Printables / Thangs / MakerWorld / Cults 3D).
  - **Track my build** checkboxes with a Dock progress bar, plus an exports row.
  - Grouped rows show quantity, notes, badges (CLUB, OPTIONAL, BUY) and the link.
  - Each printed row has a **color chip** matching its Part color in Assemble, like the current Studio list. Bought items get a dashed chip. Mapping: drawer navy, case light grey, faceplate orange, handle teal, QuickLock teal, stopper pink, magnet clip violet, Cover Upper light green, Cover Lower green, foot rail blue, foot purple.
  - The Inspector shows "This unit · parts".
  - The CTA switches to "Start assembly".
- **Assemble** workspace:
  - A step list (with checks), "Skip to the finished build", and a bottom step player (Back, pips, Pause, Slow-mo, Replay, Next).
  - The model shows parts appearing by step.
  - **Part colors / My colors** switch in the step player, defaulting to **Part colors**. Each part type gets its own color, LEGO-instruction style, so a mostly-black build stays readable while assembling. It is not shown anywhere else.
  - **Done step = "your build in real life".** A short celebration beat, then the build appears in a live 3D room with depth-of-field. No explode, measure, grid or dimension callouts here.
    - **Scenes:** Workshop (workbench + pegboard wall), Home office / computer room (desk + monitor), Coffee bar (dining/living sideboard + coffee machine + mugs), plus Grid. Add more later (craft room, living room shelf) using the same kit.
    - **Scene kit:** every room is one surface (bench / desk / sideboard) against one wall, with simple props, and **three mount anchors**:
      1. a **wall zone** above the surface;
      2. the **surface top**;
      3. the **underside** of the surface, which needs a thin top with no front apron so the build stays visible.
    - **Props sit in "prop slots"** that slide outward from the build's bounding box, so a 24-unit wall build never collides with the plant or monitor. Model each room around known-size objects (a standard mug, a 27" monitor, 1" pegboard pitch) so scale reads correctly.
    - **The only user control is Scene.** The anchor follows the build's real mount, which is set in Build, where the legality checks live. There is no mount switch here. Builds that change mount re-enter Done on the matching anchor.
    - **Default scene:** from label keywords (screws/bolts/solder → Workshop; pens/cables/USB/controllers → Home office; coffee/tea/pods/mugs → Coffee bar), with the hint "Your labels look like a … build". With no match, use the mount.
    - **Camera reference: Unigine Superposition.** Slow dolly and push-in moves, with **rack focus** pulling from a foreground prop to the build, so the eye is guided rather than spun around.
    - **Cameras are curated product shots, not free orbit.** Each mount anchor gets 3–4 parametric shots, defined relative to the anchor and fitted to the build's bounding box, so they're authored once and reused by every scene:
      - Hero 3/4, straight-on, low angle, and a detail close-up on a labeled drawer.
      - Under-table uses seated-knee height looking slightly up.
      - Wall uses standing eye height looking slightly up.
      - The camera drifts between shots (8–12 s each, eased). Grabbing the view allows a gentle orbit; after ~6 s idle it drifts back into the sequence.
    - **Drawer moments:** every ~15–20 s one labeled drawer slides out ~40%, holds, and closes, timed with the detail shot.
    - **Time of day runs on its own, with no chips.** It plays a slow cycle across the camera sequence (evening → night with lamp → morning → noon, roughly 60–90 s) and pauses on golden hour for Save image.
      - Bake 3–4 lightmap states per room in Blender and **crossfade lightmaps in the shader**.
      - Light the build with one real directional "sun" animated in sync, so its shadow moves.
    - **Room cost:** one low-poly GLB per room, unlit/baked textures, meshopt + KTX2, roughly 1–3 MB, lazy-loaded only on Done.
    - **Bokeh as three layers** (foreground props, the build, the room):
      - Render each layer to a half-resolution target and blur it on its own, re-blurring only when the camera or the focus moves.
      - **Rack focus** = animating the per-layer blur radii. A pull to a foreground prop sharpens it and softens the build; then the focus pulls back.
      - The build keeps its own contact-shadow catcher (tabletop only).
      - Skip a full-screen depth-of-field pass.
    - **Guardrails:**
      - `prefers-reduced-motion` → still hero shot at golden hour.
      - Fast quality tier → fixed hero camera, one lighting state, no blur.
      - Pause everything when the tab is hidden.
    - **Actions:**
      - **Save image** always renders the hero shot at golden hour, watermarked with the MODULITH logo and the build link.
      - **Share.**
      - Later: **Save 6-second clip** of the camera loop, recorded from the canvas.
    - **Later:** offer the same rooms as a stage option in Colors, for judging colors in context.
  - The Dock and Inspector hide.

Redesign the planner UI to this spec. Don't fall back to default styling (no gray outlined boxes, no Inter, no Lucide/shadcn look).

A working reference prototype is in `modulith-planner-reference.dc.html`. Read its `renderVals()` for exact token values, and its `glyph()` function for the generated, color-aware product icons.

**Build order:** put the real three.js renderer into this layout first. Then tune the stage (grid, lighting, shadows), and only then the chrome. The prototype's model is a flat schematic, so judge balance against the real one.

## 1. Vocabulary and catalog (use these names exactly)

Drawers, shelves and cabinets are all **units**. Write "unit" in all UI copy and code, and never use "drawer" as the umbrella term.

| Unit | Status | Notes |
|---|---|---|
| Classic Drawer | live | Print-in-place handle, no faceplate, no label slot |
| Decor Drawer | live | Swappable faceplate + handle/knob. Gridfinity variant: lengths 115–270, heights 1/1.5/2H |
| Shelf | live | Whole heights only (min 1H). Shelf Insert + Shelf Lip (front, or both on 240/270) |
| Cabinet | **soon** | Show in the unit picker as disabled with a SOON badge. Door styles: Essential, EdgeLabel, Classic Pro |

The unit list must be data-driven so Cabinet turns on without layout changes.

**Decor faceplates:**

| Faceplate | Tier | Labels |
|---|---|---|
| Essential | Core, free | No (bolt-on handle) |
| Classic | Core, free | No (integrated grip) |
| EdgeLabel | ✦ Club | Yes, EdgeLabel system |
| Classic Pro | ✦ Club | Yes, Classic Pro system |
| Chevron | ✦ Club | No (multicolor pattern, bolt-on handle) |

- **Labels:** only show a label field, label preview or label strip on the model where the faceplate actually takes one. Otherwise say why, and which faceplates do.
- **Faceplate back cover:** On/Off, works with every faceplate.
- **Hardware:** Closures None / Magnets / Push-Click (Push-Click is soon, and not for wall builds). Stoppers All / None.

**Sizes:**
- 1W = 88 mm, 1H = 56 mm.
- Widths 1–4. Heights 0.5, 1, 1.5, 2, 3. Except 3W·3H and 4W·3H.
- Length 59 limits cases to 1–2W and drawers to 0.5–1H, and has no Tabletop.

## 2. Layout (desktop ≥1280 px)

- **Three.js canvas** fills the window.
- **Top bar** (glass chips): wordmark, build switcher, workspace tabs (center), mount + length chip, Set printer, light/dark toggle, Share.
- **Workspace tabs:** Build / Labels / Parts / Assemble. No step numbers, because they aren't a forced sequence. Labels shows a completion badge (`3/3`).
- **Left Library panel (304 px), with two tabs that make scope explicit:**
  - **Add units:** unit picker + size grid. Picking these never changes an existing unit.
  - **Build style:** "Applies to every unit." Drawer type, Decor faceplate (Core / ✦ Club), filament colors, closures, stoppers, back cover.
- **Right Inspector:** titled **"This unit only"**, with a 3 px orange left edge. It **hugs its content**, so no fixed full-height panel. Contents:
  - unit index ("2 of 6") and a deselect button,
  - a compact generated icon (96×72 well) next to the title, `W·H · mm` dims and the faceplate source line,
  - per-unit Type (Classic / Decor drawer) and Width/Height steppers,
  - the label field only if the faceplate supports labels,
  - an action row: Peek inside, Duplicate, Remove.
- **Center toolbar:** 3D/2D, Measure, Explode, Reset view.
- **Build Dock** (bottom center): status, unit count, overall `W × H × L` mm, build-level label progress (`3/3 labelled`), and the primary CTA "Get parts list".
- **Camera:** frames the model inside the area not covered by panels. Dimension callouts are clamped to that safe area, so they never hide under a panel.
- `\` hides all chrome. Below 1024 px, panels become bottom sheets and the tabs move to a bottom bar.

## 3. Product icons: generated and color-aware

Every unit, size and faceplate icon is generated from the build's live filament colors `{ body, front, handle }`. Changing a color updates every icon, the inspector preview and the model together. Never use pre-rendered photos as option icons.

- **Size tiles are physically proportional:** one px-per-mm scale for both axes (the prototype uses 0.16 px/mm, so 1W = 14 px and 1H = 9 px). Sizes not valid for the current unit (Shelf + half heights) are shown dashed and disabled. Sizes that don't fit the printer get the same treatment, with a tooltip explaining why.
- **Glyph geometry per kind:**
  - Classic Drawer: lip handle.
  - Essential: plain face + handle bar.
  - Classic faceplate: grip notch.
  - EdgeLabel: white strip along the top edge.
  - Classic Pro: centered label with an accent outline.
  - Chevron: diagonal pattern + handle bar.
  - Shelf: open dark face with a front lip.
  - Cabinet: door with hinge shading and a knob.
- **Club faceplates** carry a small ✦ in the Club blue.
- **UI icons:** Phosphor via `@phosphor-icons/web` (or inlined SVG paths). The planner stays vanilla JS, no React. Regular for idle, Fill for active. Icon + label, except undo, redo, close and the viewport tools (those get aria-labels and tooltips).

## 4. Tokens

```css
:root, [data-mode="light"] {
  --base:#F3F2EF; --ink:#1D1E20; --ink-2:#4A4B50; --ink-3:#66676D;
  --glass-bg:rgba(251,251,250,.84); --glass-border:rgba(29,30,32,.10);
  --glass-shadow:0 20px 40px rgba(50,40,110,.12), inset 0 1px 0 #FFFFFF;
  --chip-bg:rgba(255,255,255,.80); --chip-border:rgba(29,30,32,.12);
  --track:rgba(29,30,32,.06); --seg-on:#FFFFFF;
  --well:#ECEAF2; --input-bg:#FFFFFF; --input-border:rgba(29,30,32,.16);
  --key-bg:#FFFFFF; --key-border:rgba(29,30,32,.12); --key-shadow:0 2px 0 rgba(29,30,32,.10);
  --key-on-bg:#FFF1E7; --key-on-shadow:0 2px 0 #E5560A, 0 0 0 3px rgba(255,106,26,.14);
  --toggle-on:rgba(29,30,32,.10);
  --measure:#0B7285; --measure-bg:#FFFFFF; --club:#1D5FD1;
  --success:#1F6B45; --danger:#B4232C; --warning:#E3A21A;
  --cta-shadow:0 3px 0 #C24A0E, 0 10px 24px rgba(255,106,26,.25);
  --sky:linear-gradient(180deg,#E8E5F7 0%,#F2EAF2 34%,#FCE6D8 56%,#EFEBF7 56.2%,#F4F2F8 100%);
  --grid:rgba(92,72,196,.20); --floor:#EFECF6;
}
[data-mode="dark"] {
  --base:#0A0824; --ink:#F4F4F5; --ink-2:#A1A1AA; --ink-3:#8B8B94;
  /* neutral charcoal glass over the indigo stage, NOT indigo-on-indigo */
  --glass-bg:rgba(29,30,32,.80); --glass-border:rgba(255,255,255,.08);
  --glass-shadow:0 20px 40px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06);
  --chip-bg:rgba(29,30,32,.74); --chip-border:rgba(255,255,255,.09);
  --track:rgba(0,0,0,.28); --seg-on:rgba(255,255,255,.12);
  --well:rgba(0,0,0,.25); --input-bg:rgba(0,0,0,.25); --input-border:rgba(255,255,255,.14);
  --key-bg:rgba(255,255,255,.05); --key-border:rgba(255,255,255,.10); --key-shadow:inset 0 1px 0 rgba(255,255,255,.05);
  --key-on-bg:rgba(255,106,26,.16); --key-on-shadow:0 0 16px rgba(255,106,26,.30), inset 0 1px 0 rgba(255,255,255,.08);
  --toggle-on:rgba(255,255,255,.14);
  --measure:#22D3EE; --measure-bg:#0A0824; --club:#7FB2FF;
  --success:#7BE3B0; --danger:#FF8A8E; --warning:#F5B83D;
  --cta-shadow:0 6px 22px rgba(255,106,26,.40);
  --sky:radial-gradient(110% 80% at 50% 56%,#4A2F9E 0%,#24196A 32%,#120E3A 62%,#0A0824 100%);
  --grid:rgba(34,211,238,.32); --floor:transparent;
}
:root {
  --orange:#FF6A1A; --orange-edge:#E5560A; --on-orange:#19191B;
  --blur:blur(18px) saturate(140%);
  --r-sm:9px; --r-md:12px; --r-lg:14px; --r-xl:18px; --r-pill:999px;
  --ease-out:cubic-bezier(0.23,1,0.32,1);
  --d-press:120ms; --d-hover:150ms; --d-pop:200ms; --d-panel:240ms;
}
```

### Emphasis rules

- **Orange means selected unit/option or primary action, and nothing else.** The theme toggle, the 3D/2D switch and the panel tabs use the neutral `--toggle-on` / `--seg-on` states, never orange.
- **The strongest orange on screen** is the selected unit on the model and the "Get parts list" CTA.
- **Text on orange is #19191B**, never white (white on #FF6A1A fails at about 2.9:1). The white "LITH" in the dark wordmark is a logo, so it's exempt.
- **The measurement color** is cyan in dark mode and dark teal in light mode. It's used only for dimensions and the Measure tool.

### Stage (three.js)

- **Scene background** matches `--sky`.
- **Floor grid** uses `--grid`, quieter in the foreground (fade to `--base` over the bottom quarter) and soft at the horizon.
- **Horizon glow:** a thin orange-peach line at about 56% height, low intensity.
- **Depth:** real lighting plus a soft contact shadow under the build.
- **Selection:** a 2.5 px orange outline + a soft outer glow, and a small 3–4 mm forward nudge. A full open only happens through the inspector's "Peek inside" action.
- **Labels** render on the model only for EdgeLabel (top-edge strip) or Classic Pro (centered plate).

### Glass

- Glass only over the canvas, never glass on glass.
- If blur hurts the frame rate on mid-range laptops, raise opacity to .92 and drop the blur. Offer a "Reduce transparency" setting.

## 5. Type

- **Archivo** (800, `font-stretch` 108–118%): wordmark, unit titles, big numbers.
- **IBM Plex Sans:** UI text, 12–14 px.
- **IBM Plex Mono:** all dimensions, size captions, counts, label previews.
- Section labels: 11 px uppercase, 0.1em tracking, `--ink-3`.
- Don't use Inter, Roboto, Space Grotesk or system-ui as the primary font.

## 6. Motion

- Ease-out `cubic-bezier(0.23,1,0.32,1)`.
- Press 120 ms with `scale(.97)`. Hover 150 ms. Inspector enters over 200 ms from opacity 0 and scale .96.
- Mode switch cross-fades over 240 ms.
- The selection nudge and Peek inside use a light spring.
- Respect `prefers-reduced-motion`.

## 7. Self-check before finishing

Screenshot both modes and confirm:

1. Nothing says "drawer" where it means any unit, and Cabinet appears as Soon.
2. Size tiles are proportional to 88:56 per unit.
3. Changing a filament color recolors every product icon, the inspector preview and the model.
4. It's always clear whether a control changes the whole build or this unit.
5. Label UI appears only for EdgeLabel / Classic Pro Decor units.
6. Orange only marks the selection and the primary action.
7. Callouts sit inside the visible canvas.
8. All text meets 4.5:1 contrast.
