# MODULITH Parts Drawer Generator: prototype handoff

Prototype stamp v2610. Artifact version 28 (washer rows retired; a drill-bit rack prototyped instead), 2026-10-26. v27: washer rows in the floor colour. v26: covers leave the label open (an L, no thin strips). v25: every width, 1W to 4W, and Joey's 2H runner groove. Live prototype (private): https://claude.ai/artifact/DQj8JmuoVBuUy8voPmgGAw

**Next session (2026-11-04):** the planner integration. Start at "Planner integration: the next session" below; `KICKOFF-PROMPT.md` is the opening prompt.

This file is the starting brief for the Claude Code session that turns the prototype into the real tool. Everything below was measured from the Fusion file "240 Parts Drawers" or validated by running code. Nothing here is guessed. One exception is marked where it appears: every shell except the 240-2W 0.5H and 1H is made from those two (the 1.5H and 2H heights in v23, the other lengths in v24, the other widths in v25). The same construction rebuilds Joey's own Decor drawers at every width and length checked, from his Decor 240-2W, to within 0.05 mm³, so it is how his drawers scale; no parts-drawer body other than the 240-2W has been checked yet.

## What the prototype does

- Every size: the six collection lengths (59, 115, 165, 185, 240, 270; v24) at 1W, 2W, 3W or 4W (v25), each at 0.5H, 1H, 1.5H or 2H. The 59 comes at 1W and 2W and at 0.5H and 1H only, as in the planner (Joey: wider than 2W "things get weird"). That is 84 size and height combinations. The shell is the closed-front Decor parts drawer. Only the 240-2W 0.5H and 1H shells are Fusion bodies; every other one is made from them (see "Taller drawers" and "Every size").
- Label size per drawer: Large (29.88 × 13, fits 12 mm label-maker tape, the default) or Small (the original 29.88 × 8 label).
- Layout editing:
  - Columns and rows as a starting grid: up to 5 columns per width unit (5 / 10 / 15 / 20) and 8 rows, capped by depth (3 in a 59, 7 in a 115). "Shipped 5×4" (240-2W only) reproduces the released layout (rows 56 / 56 / 56 / 53.5).
  - Compartments are free rectangles. Drag a wall to move it: 0.5 mm steps, magnets at other walls and at the exact label-fit width (30.6) and depth (holder minimum), Shift moves the whole line, Alt turns snapping off.
  - Type a clear width or depth for one selected compartment (moves its right or back wall; the left or front one at the drawer edge). Neighbours never go below 12 mm; the page says when a value was limited.
  - Select by dragging in the plan or clicking in the 3D view (Shift, Ctrl or Cmd grows the selection). Selection always grows to whole compartments, so merges stay rectangular.
  - Merge (M), Split (S), label holder (L or double-click), tray size (T steps Off, 3, 6, 9, 12). Undo and redo keep 100 steps.
- Floor, per compartment: front scoop Off / Standard (6.0575, the shipped part) / Deep (12); tray 0 / 3 / 6 / 9 / 12 mm; floor color; part outline.
- Floor colors: Off, One color (every floor), or Paint (body plus 3 colors, a 4th optional). Paint from the plan or the 3D view: select, then a color chip or keys 0–4. Quick fills: by row, by column, mix (neighbours differ), clear.
- Parts list to drawer: pick a kit, type lines like `M3x10 SHCS 100`, or import CSV / TXT / JSON (Part Picker items work). The drawer is laid out front-left to back-right, each compartment sized for its quantity, with a fullness estimate. Floors can be colored by thread size or part type. labels.csv comes with the download.
- Part outlines (shadow board): each compartment's part at 1:1 on its floor, so a screw can be laid on it to check the length.
- Cells (v18–v20): a compartment can be bearing wells, nozzle sockets or bit sockets instead of a loose pile (washer rows, v19, left the page in v28), spaced roomy or dense (see "Cells" below). The Part field also takes 3D-printer hardware (bearings, GT2 pulleys and idlers, 2020 T-nuts, shafts, magnets, named parts), and a bearing part sets its wells' size.
- Layout codes: every layout has a code like MD-7KQ-2X9, marked under the drawer on download; the code or a share text reopens the exact layout.
- Lid: an everyday lid matched to the layout that drops inside the rim, stays in place in the case (the cover keeps it from lifting out of its lips), and lifts out by a recessed pull; plus short test pieces (see "Lid" below).
- Compartment covers (experiment): instead of the one lid, a snap-in cover per compartment, any of which can be left off (see "Compartment covers" below).
- Live 3D preview of the exact export geometry, with floor colors and label text. The geometry rebuilds only when geometry changes (not on color changes).
- Wide sections always get the pyramid gusset. The end-plate-only style still exists in gen.js (`style: 'plate'`) for tests; saved layouts load as pyramid.

## Geometry model (validated)

Frame: the origin is the cavity's front-left inner corner at bed level (z = 0). +X runs right, +Y toward the back, +Z up, units mm. Cavity W × D = 159 × 226 for 240-2W. Every size has a cavity 88 × W − 17 wide (1W to 4W: 71 / 159 / 247 / 335) and length − 14 deep (59 / 115 / 165 / 185 / 240 / 270: 45 / 101 / 151 / 171 / 226 / 256). Exact Fusion origin, in component space of the 0.5H and 1H parts: (505.64934433947, −36.61262676591, −50.08515662331) mm.

The drawer is the shell plus generated internals:

| Part | Geometry |
|---|---|
| Floor slab | z 0 → 1.2 over the whole cavity |
| Walls | 1.5 mm thick, z 1.2 → top. Every internal edge of a compartment gets a strip that runs one wall past both corners; all strips are united in 2D and extruded once. |
| Scoop | 45°, along the front edge, full compartment width. Size = min(scoop, depth / 2, wall height − 3). |
| Tray | 45° ramps along both sides and the back. Size = min(tray, width / 3, depth / 3, wall height − 3), so a third of the floor stays flat. A 12 mm tray in a 30.6 cell is 10.2. |
| Label holder stamp | one fixed solid at the back-left of each compartment that has a holder; never stretched |
| Wide-section end piece | when width > 30.6: a 1.5 mm end plate at x0 + 30.6 plus the pyramid gusset, clipped to the holder's side profile so nothing reaches the floor. Between 30.6 and 34.1 wide, the plate runs on to the right wall as a solid end instead of leaving a slot. |
| Floor color | the top 0.6 mm (three 0.2 mm layers) of the flat floor, inside the scoop and tray ramps, becomes its own part |
| Part outline | 0.4 mm recess on a plain floor; on a colored floor it stays body color (an inlay through the color layer) |
| Bottom mark | layout code (0.9 mm pixels) and MODULITH (0.6 mm pixels) in a 5×7 block font, recessed 0.4 mm into the underside, mirrored so it reads from below |

Wall top = drawer height − 3: 0.5H = 19, 1H = 47, 1.5H = 75, 2H = 103. The shell rim stands exactly 3.0 mm above the wall tops all the way round (22, 50, 78, 106), with a straight inner face. The holder stamp is anchored to the wall top, so it works at any height.

Holder rules:

| Holder | Label | Depth D | Plate meets back wall (below wall top) | Min compartment depth | Stamp |
|---|---|---|---|---|---|
| Small | 29.876 × 8 × 1.35 | 9.5 | 11.86603 | 21.5 | `holder_stamp` (from the shipped 0.5H drawer) |
| Large | 29.876 × 13 × 1.35 | 14.5 | 16.86603 | 26.5 | `holder_stamp_large` (from the printed test section) |

- Both holders need a clear width ≥ 30.6. Min depth = holder depth + a 12 mm finger opening.
- Large is Small moved 5 mm forward, with the 45° plate run down to the back wall (same 43-face topology).
- At 0.5H the Large plate meets the back wall 0.93 mm above the floor top (Small: 5.9 mm). The printed test was fine; watch for washers wedging there.
- In wide sections, the stamp's 0.3 mm right-hand wall sliver is trimmed to the side profile, so no fin hangs below the holder.
- Part outlines go on the floor you can see from above (in front of the holder). If the part doesn't fit there, it goes on the whole floor pushed to the front, so most of it still shows.

## Drawer stoppers: the height limit for lids and covers (found 2026-10-22)

The planner's drawer stoppers (a pair per 1W column) seat in the bay's ceiling, the Cover Lower for a top-row drawer or the floor of the case above, about 2 mm behind the case front. Each hangs a **1.5 thick tab 2.0 below the ceiling**, over the compartments (column centre −20.05 to −10.15 and +9.95 to +19.85 at the tab's bottom), and everything in the drawer slides under it as the drawer opens. With the rim 0.28 below the ceiling that is **1.72 below the drawer rim**. Bare dividers (3.0 below the rim) clear it by 1.28.

- Sources: `viewer/js/generate.js` places the stoppers at `[colCentre − 12.6 / + 12.4, ceiling − 2, 76.5 − dz]`; `Drawer_Stoppers_L/R.lib.glb` decoded (meshopt) to a 19.5 × 28 plate in the slot and that one tab; REPORT.md 1.5 for the 0.28. A Claude Code session checked it against node0's MODULITH vault (`rules.md`, `measurements.md`): same numbers.
- It is derived, not measured. The September bin print checked the drawer top, not under a fitted stopper. **To settle it:** drawer in its case, stopper fitted, measure from the rim up to the bottom of the tab.
- v12–v16 missed it: the lid's top sat 0.6 under the rim (it overlapped the tabs by 1.12, so a drawer couldn't slide past its stoppers with the lid on) and the covers' 1.8 (0.08 clearance). v17 puts both tops 2.2 under the rim, **0.48 clear**; `STOPPER`, `stopperDepth()` and `stopperClearance()` in gen.js, and both tests check at least 0.4.

## Lid (prototype, 2026-10-22; v17 lowered for the stoppers)

An everyday lid, not a shipping accessory: drawers ship and live inside their case, under its cover, with the lid on. Joey's brief: the case cover encloses the drawer, but there is enough room above it for parts to mix, scatter or jam the drawer and cover.

Why this shape: the rim stands 3.0 above the dividers all the way round with a straight inner face, so a lid inside it closes every compartment without touching the shell, the holders or the labels. Its top has to stay under the drawer stoppers' tabs (above), so since v17 it is a 0.8 skin lying on the divider tops, its top 2.2 under the rim and 0.48 under the tabs, with its stiffness hanging below the divider tops instead of above them. The bay's ceiling sits 0.28 above the drawer rim (planner viewer placement, not yet measured on a print), so in the case the lid can lift at most 0.28 plus its 2.2 recess, 2.48 in all. The lips reach 3.5 into each compartment, so even then they still ring every compartment by more than 1 mm. Nothing about the drawer changes, and nothing clips onto the outside.

| Part | Geometry |
|---|---|
| Outline | the cavity (159 × 226) minus 0.3 per side, corner radius 0.8, top edge chamfered 0.4 |
| Skin | 0.8 (four 0.2 layers), resting on the divider tops, so its top sits 2.2 below the rim (v12–v16: 2.4 thick, top 0.6 below the rim, ribs between skin and dividers) |
| Ribs | 1.2 wide, hanging 2.0 below the skin across any compartment wider or deeper than 45 |
| Lips | a 1.2 ring just inside each compartment (0.4 from its walls), reaching 3.5 below the divider tops (2.0 before v17); it stops in front of the label holder. Scoop and tray ramps peak at 13.2 at 0.5H, so the lips clear them by at least 2.7. To change compartments a part would have to pass under a lip, up a 0.4 gap, over a divider and under the next lip. |
| Pull | a fingertip pull (see Pulls below): a 20 × 11 opening through the skin over a closed cup that reaches 3 further toward the front, 5 deep (less over a Deep scoop or a big tray, never under 3). Where no compartment is wide enough it turns front to back and hooks to the right, and on 9- and 10-column grids it is 20 × 9 with a 2.5 hook. It goes in the front-most compartment nearest the middle that takes the biggest pull, and dips about 6 mm into it. Round the cup the lid is 0.4 thicker below the divider tops, so the hook a fingertip pulls on is 1.2 thick. Every grid the page can make gets one. |

- One lid fits a layout at both heights; the shipped 5×4 lid is identical at 0.5H and 1H.
- It prints top face down with no supports. Lips, ribs and cup walls rise from the skin, and the cup floor bridges 14 mm.
- Sliced (0.2 mm, 2 perimeters, 15% gyroid): 51 g for the shipped 5×4, no slicer warnings (v16's 2.4 lid: 64 g).
- Out of the case the lid is held only by gravity and its lips: fine on the bench, not for carrying a drawer upside down.
- Labels go in and out with the lid off (the lips sit in front of the holders).
- Test pieces (always 0.5H, since the fit is the same at 1H): the layout's front-left corner (about 25 g) and the matching lid corner with the pull moved into it (about 8 g). Ready-made print files for the released 5×4 with Small labels are in `lid-print-files/`.
- Tried and dropped the same day: snap-on shipping clips that hooked under the side wall's top band. They used the runner groove, so they had to come off before the drawer went into its case, and drawers ship in their case.
- Open until a real print: fit play, lip insertion, whether the 0.8 skin stays flat over the biggest spans, the feel of the pull (resized in v15), the real stopper clearance in a case, and the shaken-washer test with the lid held 2.5 mm up. Also open: counting the pull's dip in the fill estimate of its compartment, a brand or kit name on the lid top, and a light snap (for example tabs into small notches in the rim's inner face) if the lid should stay on when a drawer is carried around.

## Compartment covers (experiment, 2026-10-22)

Joey asked what individual covers could look like and whether they could snap. "Lid: Covers" gives every compartment its own cover; any one can be turned off from the selection bar. Covers and the one-piece lid exclude each other.

| Part | Geometry |
|---|---|
| Plate | on the divider tops round the compartment: 0.6 onto each divider (neighbours keep a 0.3 gap), 0.3 short of the rim. 0.8 thick over the dividers, so its top is 2.2 under the rim and 0.48 under the drawer stoppers' tabs; 1.2 inside the skirt, where it hangs 0.4 below the divider tops, so the panel and the nail lip keep their stiffness. (v13–v16: 1.2 throughout, top 1.8 under the rim, 0.08 under the tabs.) |
| Skirt | 1.0 thick, 0.3 inside the walls, 3.6 deep; for a compartment with a label holder it runs across in front of the holder |
| Snap | the drawer gets a 45° bead (0.7 proud, 10 long, tip 1.8 below the divider tops) in the middle of each wall face round a covered compartment, clear of the holder: dividers and, since v17, the outer walls (inside only; the outside of the shell doesn't change). A window in the skirt (±0.8 round the tip, corners R 0.5) clicks over it. The 1.0 × 1.0 strip of skirt under the window is the spring: covers print top face down, so it bends along its layers. Since v17 the window is up to 20 long (11 before), which takes the strip's worst-case strain, if a stiff wall makes it take all 0.4, from about 4 % to about 1.2 %; with more of the flex in the strip, the snap depends less on how stiff the divider is (0.5H or 1H, mid-wall or by a junction). A side gets a bead only if its window can be at least 16: 2.6 of skirt is kept at each end, 5.4 on an outer wall (there the plate ends flush with the skirt and PrusaSlicer flagged the strip's bridge as loose extrusions on 10×8 cells; fine at 16). A cover needs at least two snapping sides, or it stays open. |
| Over the label (v26) | the plate leaves the label holder open: it stops 1.0 past the label's front edge (2.8 behind the skirt). In a compartment wider than the holder and its solid end (from 34.1 wide), a leg carries the plate on to the back beside the holder, over the open part there, 1.0 over the label's right end: an L, its inside corner rounded R 1.0 (`coverOutline`). The holder closes the compartment where the plate stops: its deck and 45° plate, and beside it the end plate or solid end. v13–v25 had a window over the label instead, inset 1.0, which left strips 0.7 to 2 wide behind and beside it; Joey (2026-10-23, on a sliced cover): too thin and fragile. |
| Lifting | a nail slot near the front of every cover, labelled or not (see Pulls below): a 12 × 6 rectangular slot (6 front to back since v17; corners R 0.75, top edge chamfered 0.4) through the 1.2 panel, over a divot that reaches 1.5 under it on both long sides and 1.6 below it, so a fingernail, a coin or a small flat screwdriver catches whichever way it comes in. 9 × 6 where 12 won't fit across (compartments under about 16 wide), turned front to back only if neither fits across. The divot and its 0.8 walls hang 2.8 below the divider tops, less than the skirt, and sit 0.2 behind the skirt, clear of the front bead's window. A compartment with no room for the short slot (about 13.2 × 13.4, plus a holder's depth) or without two sides that take a snap (21.2 long) gets no cover; the page says why. |

- Side play 0.3 each way; a cover can lift 0.3 before its skirt meets the beads.
- Printed top face down, no supports; the export lays all covers out on one plate (209 × 237 for the 5×4, which fits a 250 × 220 bed turned sideways). The STL holds them as one file; in the 3MF each cover is its own object, named after its compartment, because as one object of many loose pieces PrusaSlicer warns of loose extrusions that none of them has on its own.
- The shipped 5×4: 20 covers, 3 snaps each (60 beads), 51.7 g sliced (v17; v26's covers, which stop short of the label, are about 0.1 g lighter each). The 10×8: 80 covers, 2 snaps each, 74.8 g. Both slice with no warnings.
- Snap counts over every grid the page makes (both label sizes) and 300 random merged layouts: 658 covers with 2 snaps, 1,503 with 3, 588 with 4, none with fewer (`validation/cover_snaps.mjs`; the two-snap rule only bites on hand-made cells).
- Caveats: at 1H the dividers are 46 mm tall and flex easily, so divider snaps are lighter there (outer-wall snaps aren't); the strip under each window still takes most of the strain at a stiff wall or junction, so it needs checking after repeated clicks; covers can lift 0.3 before they catch, which leaves 0.18 under a stopper tab at worst. Existing drawers have no beads, so covers only snap on drawers generated with covers on.
- Test pieces: the page makes one 0.5H compartment and its cover for the current layout. `cover-print-files/test-pieces/` (`validation/cover_test_prints.mjs`, v17, rebuilt with the v26 covers) has five: a 0.5H middle compartment (3 divider snaps), the 0.5H front-left corner (2 outer-wall snaps and a divider), the same middle compartment at 1H, a 10×8 cell with the 9 mm slot, and (v26) a 52 mm wide compartment with its L cover, plus the corner compartment again with 0.5 beads (the corner cover fits both) to compare the beads in one PLA print. About 90 g together, all slice clean.
- A 0.5 bead (`coverTestPieces(..., { bead: 0.5 })`, test pieces only) keeps the 0.7 bead's lower face and drops its tip 0.2, so a cover still lifts 0.3 before it catches; the divider flexes about 0.2 instead of 0.4.
- First print (Joey, v16 test piece, 2026-10-22, **PETG**, 0.4 nozzle, 0.2 layers on a Core One; one compartment on the plate, bead size unknown: Joey doesn't know whether it was the 0.7 or the 0.5 file. Across the two side beads it measures about 29.2 with 0.7 beads and 29.6 with 0.5, walls 30.6 apart): **the cover snaps on nicely**; the 3 mm slot was too tight to get a nail in at an angle, so v17 makes it 6 front to back.
- Material: that feel is PETG's. PLA bends about 1.8 times stiffer (Prusament flexural modulus 3.1 against 1.7 GPa) and yields at about 3 % strain against 5 %, so the same cover snaps firmer in PLA, and v16's 4 % worst-case strip would have been past PLA's yield. The bead call needs both ends: the 0.5H corner in PLA (stiffest wall and material: the tightest snap and the most strain) and the 1H middle in PETG (most flexible dividers and softest material: the loosest).
- Open until a real print: click force on the v17 strips (longer, so softer each, but a front-row cover gets a third snap on the front wall: by a rough spring estimate the total hold is about what Joey felt), the 1H snap, whether a nail pops a cover through the 6 mm slot without hurting, whether covers stay on upside down, wear on the skirt strips over 20 to 50 clicks, and the 0.5 bead only if the 0.7 one is too stiff (an outside review warns that with 0.3 of side play a 0.5 bead can lose its grip on a cover snapped on one side).

## Pulls (v15, 2026-10-22)

How the lid and covers come out, and why they differ.

- **v14 had nail-sized cups and called them pulls.** Covers without a label got a 10 × 5 slot over a 3 mm cup with a 1.5 hook; labelled covers lifted by a fingernail under the label window. Joey: "these are thumbnotches? those look way to tiny for a human to interact with." Agreed: neither took a fingertip.
- **Lid: a fingertip pull.** Sized from hand data: the index finger at its last joint is 15.5 × 13.0 mm for the median man (95th percentile 17.1 × 14.4) and 13.8 × 11.5 for the median woman (AIST Japanese hand dimension database, items B07 and D03), and only the tip goes in. Standard 20 × 11 opening, 3 hook toward the front, cup 5 deep; narrow 20 × 9 with a 2.5 hook. Turned front to back (hook to the right, for a finger reaching in from the right) when the compartment is too narrow across. Search order: standard across, standard front to back, narrow across, narrow front to back, each over all compartments front to back and nearest the middle first.
- **Bug fixed in v15:** in v14 the lid's 18 × 9 cup only went across, so grids of 8 or more columns had no compartment wide enough and the lid had **no pull at all**. Now every grid the page makes gets one (the smallest compartment that takes it: 14.3 × 23.4, or 22.8 × 14.9).
- **Covers: a nail slot (Joey's call).** He asked for "a thin notch and a shallow short, could even be rectangular divot that you can just get your nail under and lift up" instead of a thumb notch. A fingertip cup can't fit a 10-column cell (14.6 wide; the narrow cup needs 16.1 inside the skirt), a nail slot can, and it costs almost no volume. Trade-off: people with nails cut right down need a coin or a screwdriver, and the snap has to stay light enough for a nail.
- Both kinds share one placement routine (`fitPull` in gen.js): front-most in the room the part allows, centred, the cup's floor 0.8 clear of scoop and tray ramps; if the front scoop would make the cup too shallow, it moves back until it clears.
- `consult/cover-nail-slot.png`: a section through the slot on a seated shipped cover with a fingernail drawn to scale, and both cover sizes from above.
- **v16 (2026-10-22), after an outside review of the slot:** the reviewer liked the slot and said not to redesign it before a print, but to soften the edges a nail touches and check the material round it. Done: the slot's top edge is chamfered 0.4 (45°; a chamfer, not a round, because that face prints on the bed) and its corners went from R 0.3 to R 0.75. The plate's underside, where the nail catches, stays square. Measured over 318 covers (`validation/slot_material.mjs`): the plate runs at least 2.0 from the cover's front edge to the divot and 2.9 to the opening, and the slot sits the same distance behind the skirt in every cell, so small cells are no thinner. The thinnest material is the 1.2 plate over the 1.5 undercut. Two slivers that are not a strength problem: in 16.2 to 16.6 mm wide cells (9 columns) the cup's ends sit 0.07 from the skirt, far below a 0.4 line, so it won't print as a gap; and with 8 or more rows a side bead's window cuts 0.13 into the cup's end wall, leaving 0.67. `consult/cover-nail-slot-v16.png` shows the new section.
- **v17 (2026-10-22):** the plate did thin for the stoppers, but only over the dividers: inside the skirt it stays 1.2 by hanging 0.4 below the divider tops, so the lip over the undercut is still 1.2 and the 0.4 chamfer leaves 0.8 of straight edge. The lid's pull hook is 1.2 the same way. And after Joey's first print the slot went from 3 to 6 front to back: at 3 the nail had to come in too steep. `consult/cover-nail-slot-v17.png` shows the v17 section with the stopper line.

## Cells (v18; washer rows v19; wells and spacing v20, 2026-10-23)

Joey's pick from the backlog: compartments made for 3D-printer parts, then washer rows. v20 reworked them for use rather than count after an outside review (Astra, 2026-10-23) and Joey's own doubt about the thin posts: the review's point was that clean STLs and passing tests show a part fits, not that it is easy to use. Per compartment, `cell`:

| Cell | What it is | Sizes |
|---|---|---|
| `wells` (v20) | a low ring per stack of bearings, split by a notch front and back that runs down to the floor, so a thumb and finger reach any bearing in it, the last one included | inside = bearing (or flange) diameter + 0.8, wall 1.6 with a 2 mm 45° foot round its outside at the floor (Joey: a thin wall standing on a sharp corner splits along its layers; the notch faces stay square, so the notch keeps its width to the floor), as tall as a full stack less a third of a bearing (the top one stands proud) and never over 20; notch = 0.6 × the bearing's body diameter, 3 to 12, always narrower than the bearing so it can't slide out; stacks of up to 6, fewer where the 20 mm wall stops them (at 1H: 625 4 high, F695 5, 608 3); the bearing is the compartment's part when that is a bearing, else `c.bearing` (picker: 625, F695, 608, 688, 623, F623, MR85, 695, 605, 624, MR105, 6800), 625 by default |
| `nozzles` | sockets a V6-style (M6) nozzle drops into, thread first, its hex resting on the rim | bore 6.4 with a 0.6 lead-in chamfer, outside 10.4 with a 1.2 45° foot, 9 tall; holds parts up to 13 tall; you grip the 7 mm hex (8.08 across its corners) |
| `bits` | hex sockets a 1/4" bit (6.35 across flats) stands in | 6.6 across flats, outside 10.8 with a 1.2 45° foot, 10 tall, 15 of a 25 mm bit showing; you grip its shank (7.33 across corners); 1H and deeper only |
| `washers` (v19) | a ribbed floor: V grooves run front to back and washers stand on edge in them, faces together like a roll of coins | groove pitch = washer diameter + 1.2, flanks 30° from level, 0.6 flat on each rib, 0.5 flat in each groove; end walls close each row and reach 0.5 over a washer's centre; the washer is the compartment's part when that is a washer or lock washer, else `c.washer` (picker: M2–M12 flat washers, ISO 7089), M3 by default |

- Spacing (v20, `c.spacing`, wells, nozzles and bits): sized from what you grip, not the socket. Roomy (the default) leaves 8 mm clear between the parts you grip, so nozzles stand 16.08 apart centre to centre and bits 15.33; Dense (`spacing: 'dense'`) leaves 5, about v18's spacing (13.08 and 12.33). The outer ones keep half the gap from the open floor's edge. Wells are reached through their notches, so their gap runs front to back, in front of the first well and behind the last as well (a well next to a wall needs a finger's room there too); side by side they stand 4 apart. Roomy costs capacity: 60–70% of dense's sockets in a big block, a third in a shipped cell. The 8 mm is a first guess for a fingertip; the test prints settle it.
- Placement (`cellPlan` in gen.js): a grid at those pitches, centred on the open floor (inside the scoop and tray ramps, in front of the label holder) and at least 2 mm clear of it all round, so a lid's lips (0.4 to 1.6 from the walls) and a cover's skirt pass whatever stands there. When nothing fits the plan says why (too little floor across or front to back, or the drawer too shallow).
- Height: everything a cell holds stays 0.5 under the divider tops, where the lid's skin rests; 3.3 under in a covered compartment, because the cover's nail slot divot hangs 2.8 into it. The lid never puts its pull over a cell (`lidPull` skips them).
- Wells replace v18's bearing posts, which were thin (a 623 post was 2.7 across), could snap or bind, and stood 3 mm apart with no room for fingers. Layouts and codes with `posts` open as wells (`cellKind`).
- Choosing a cell flattens the compartment (scoop Off, tray 0; the user can turn them back on); part outlines skip cells; the plan draws each well (its two arcs round the dashed bearing outline) or socket instead of the size text; the selection summary gives the count and capacity ("1 625 bearing well, 3 high: up to 3 bearings", ", dense" when dense) or why none fit. The Spacing control shows for wells and sockets.
- Layout codes: a compartment's entry gets `[cell, size]` only when it has a cell (the bearing for wells, the washer for rows, else 0), plus a third entry `1` when dense (v20), so codes without cells are unchanged.
- Examples (0.5H, Large labels): a shipped 30.6 × 56 cell takes one 625 well, 3 high (4 at 1H), or 2 nozzle sockets roomy, 6 dense; a 608 well fits it only dense. A 2 × 2 merge (75.75 × 110) takes 9 F695 wells × 4 = 36 bearings (roomy or dense: its depth fits 3 rows either way; 5 high at 1H); 25 nozzle sockets roomy, 42 dense; at 1H, 24 bit sockets roomy, 35 dense.
- Washer rows (v19): a washer sits on both flanks of its groove, centre 1.155 × its radius over the groove's apex, so an M3 stands 7.4 tall, M5 10.6, M6 12.8, M8 17.1 (all on the floor's top). Rows run front to back, so a drawer's pull pushes washers along their row, never across a rib, and the front washer faces you. Pick one by tipping the end washer of a row; a washer dropped in loose lands tilted on the flanks or lies across a groove, raised, so pressing one edge lifts the other. The ribbed block covers the whole open floor (run 0.3 into the walls and ramps it meets); the rows keep the 2 mm margin. Each row holds about its length × 0.85 / thickness (washers stand a little tilted): a shipped 30.6 × 56 cell with the Large label takes 3 rows of 62 M3 (186), 2 × 31 M5 or 1 × 19 M8. The 30° flanks face up, so nothing overhangs; 30° rather than 45° keeps the ribs low and an M8 under a 0.5H drawer's divider tops.
- Washers can lean along a row, over its end wall, so under the lid they stay below its lips altogether (3.5 under the divider tops, plus 0.5): M8 rows need 1H when the lid is on. Under a cover the usual 3.3 limit is already low enough.
- Lid ribs (v19 fix): the lid hangs 2.0 stiffening ribs across compartments with more than 45 mm inside the lip (merged blocks), and v18 let cells there hold parts up into them (a 2 × 2 merge of F695 posts at 0.5H: 4 high met the rib). Cells under the lid now stay 0.5 under those ribs too, so that block takes 3 high. The page passes the lid to the planner (`layout.lid`).
- Floor colours (v19 fix): in v18 a coloured floor's cut took the bottom of every post and socket with it, leaving them floating 0.3 over the colour tile. The tile now goes round each well's and socket's footprint, so they grow out of the body's floor; washer rows took no floor colour until v27 (their ribs cover the floor).
- Washer rows in colour (v27, Joey: "the part where you lay the parts" should be the floor colour like the other floors): the colour part is the ribbed floor between the end walls, from 0.6 under the floor up through the ribs (`floorRegion`; `floorRects` gives it `ribs`, the rib tops, and `vol`). `buildParts` cuts it as the drawer inside that box, so the body and the colour part share every face; the region stays 0.05 off the walls and end walls (cut flush with a face standing above the ribs, the part picked up zero-thickness sheets). The end walls stay body colour and stand on the body's floor. Cost: on a multi-material printer the filament also swaps on the layers through the ribs (M3 rib tops 3.24 above the bed: 11 more layers; M8 5.84: 24). With the single-nozzle filament change at 1.4 the ribs come out in the body colour and only the groove bottoms take the floor colour; the README says both.
- Washers in the preview (v27, Joey: empty, the rows "look like it's for laying down drill bits not washers"): the 3D view stands washers in each row, filled from the back to about 60%, the front two tipped toward you, in grey metal. Preview only, never exported, and the 3D picking ignores them.
- **Washer rows retired (v28, Joey, 2026-10-26):** "I just don't think people are going to store washers this way": once a row runs low the rest fall over and slide about, and washers come by the bag. The Washers button and picker are gone, and so is v27's preview of washers; a layout that has them (layout code, share text, saved state) opens with that compartment plain, the standard scoop and no tray (`normalize`). gen.js still builds washer rows and their coloured ribs, only so `t_cells.mjs` keeps checking that code; the real build should not port them. Round tools go in the drill-bit rack instead (below).
- Rotary tool bits (Joey, 2026-10-23: he sees cells as most useful for Dremel bits and the like): not a cell yet. A test plate with 1/8" (holes 3.4 / 3.5 / 3.6) and 3/32" (2.6 / 2.7 / 2.8) round-shank sockets, 12 deep, footed, sizes debossed, picks the hole first. Then: a third bit type next to 1/4" hex (round shank, 1/8" or 3/32"), spaced by head size (most cutters, burrs and stones are 10 mm or less), 1H only standing up (Dremel bits are about 38–45 mm long); big heads (polishing wheels, cut-off discs on mandrels) belong in plain compartments. A lying-down rack would suit 0.5H. A drill index (a hole per drill size, labelled) is the same shape.
- Test prints (v20): `cell-print-files/test-pieces/` (`validation/cell_test_prints.mjs`), for fit and for use: three middle compartments of a 0.5H 5×4 cut from the drawer with their walls and holders, with a 625 and an F695 well (roomy) and a 608 well (dense), all with the foot, 30.5 g; two compartments with M3 and M5 washer rows, 23 g; a 3 × 3 grid of nozzle sockets and one of bit sockets, roomy, on plates, 9 g each; the rotary bit plate, 6 g (all sliced in PrusaSlicer, no warnings). The README asks the use questions from the review: can you take out the middle item, the last item, refill without arranging, does handling disturb it, and is it better than a plain compartment with a scoop? The v18–v19 fit plates are retired.
- Open until a print: the 8 mm roomy gap and whether 5 is usable at all; the 0.8 well clearance, the 6.4 nozzle bore and 6.6 hex (printed holes run small); whether washer rows earn their place against a plain scoop compartment (they stay a test, marked so in the page); then, after a whole drawer has opened and closed in its case, whether anything shifts. Later: removable socket blocks (only to swap arrangements, not because sockets break), size labels by the sockets, a lying-down bit rack for 0.5H, longer nozzles (Volcano, CHT). Wells are the shared round-well shape the hobby cells will reuse (coins, tokens, chips) with their own clearances and notches.

## Taller drawers: 1.5H and 2H (v23, 2026-10-23)

Joey asked for them ahead of the agreed order (cards and other tall things want them), warning that small parts get hard to pick out of deep compartments; for a big kit he'd rather split it across two drawers or use a 3W (numbers under "Kit drawers").

- **Shells:** `shell_240-2W-15H` and `shell_240-2W-2H` are the 1H shell with everything above z 20.96 moved up 28 or 56 mm. Between 13.07 and 28.85 off the bed the 1H shell has no vertices and every face crossing that band is vertical, so the stretch only lengthens straight walls. Tops 75 and 103, rims 78 and 106: each half H adds 28, as 0.5H to 1H does, so the rim stays 6 under the bay pitch (28 per half H) like the 0.5H and 1H. Joey's GEN2 Classic drawers confirm the heights: the exports in `D:\Claude - Output\GEN2 Classic Drawer Exports` stand 22.00 / 50.00 / 78.00 / 106.00 at 0.5H / 1H / 1.5H / 2H. They are 251 wide at 3W and 339 at 4W (88 per W). `stretched: true` in `SIZES`.
- **Correction (v25): the 2H runner groove.** v23 said the Classic 2H is its 1.5H stretched. Not quite: Joey's 2H drawers, Classic and Decor alike, have a side-wall groove 0.4 deep where the 0.5H, 1H and 1.5H have 0.8 (section at mid-length: outside face −1.6 instead of −1.2 from z 4.4 to 99.6, with the same 45° edges; the wall stays 1.2 thick, so its inside steps out to −0.4). Every other height matches the plain stretch. Since v25 the generator's 2H shell has Joey's 2H outside: the groove floor moved to the 0.4 groove's outline (`grooveFloor` in gen.js), which matches the Decor 240-2W-2H's outside exactly (0.000 mm³ either way, behind the Decor's own right-wall feature near the front). Its inside stays flat at the cavity edge, so the dividers, holders and ramps meet it as at every other height; the wall is 1.6 thick there, about 20 g more on a 240-2W. v23 and v24 2H downloads have the 0.8 groove: in a 2H case they would have 0.4 mm more side play per side.
- **Checked by code** (`t_heights.mjs`, v25: on the generator's own shells): the stretch is one clean solid, rim at 78 and 106; its section through the band equals the 1H's (1,274.8 mm²) at three heights; below the band it is the 1H exactly and above it the 1H moved up (both within 0.0003 mm³); its volume is the 1H's plus that section times the stretch. The 1.5H shell is exactly that stretch; the 2H shell is the stretch plus 16.5 cm³ on the groove floors only, with the Decor 2H's groove outline. A shipped 5×4 at 1.5H and 2H, both label sizes, keeps its top 20 mm (holders, divider tops, rim) exactly the 1H's moved up and its floor exactly the 1H's. The floor, lid, cover, cell and parts-list suites now run at all four heights (`t_floor`, `t_lid`, `t_covers`, `t_cells`, `t_inv`).
- **Not checked:** a Fusion body (there is none yet), the drawer in a 1.5H or 2H bay, the stoppers there. The page says so under the height buttons, and the README of a 1.5H or 2H download says to print one and check it in its case before printing a set.
- **Reach** (`REACH = 1.8`, `reachNote` in gen.js): a compartment deeper than 1.8 × its narrower side gets a note in its summary ("Deep for its width (73.8 mm down, 30.6 across): the last parts are hard to reach, so merge it wider or use a lower drawer"). Nothing in a 1H grid of label-width cells trips it; at 1.5H a 30.6 cell does (73.8 against 55.1) and a two-wide merge (62.7) doesn't; at 2H a compartment wants 56.6 across. The 1.8 is a first guess, like the 8 mm cell gap. Joey, on seeing the 2H 5×4 (2026-10-23): impossible to get parts out with your fingers, you'd have to dump it out. So small parts in a tall drawer want something that lifts out and pours (the half trays or removable cups in the backlog), not a deeper cell; for kits, go wider (see "Kit drawers").
- **Parts list:** too full suggests a taller drawer; plenty of room suggests the lowest height that would do. Since v24 both tips lay the list out at the other heights (see "Reach warning").
- Cells don't grow with the drawer (wells stop at 20, sockets are 9 and 10 tall). Taller dividers flex more, so a cover's snap feels lighter the taller the drawer; the cover test pieces stay 0.5H.
- Weight, shipped 5×4 with Large labels, 1H / 1.5H / 2H: 284 / 400 / 515 g solid PLA; sliced (PrusaSlicer 2.7.2, 0.2 mm, 2 perimeters, 15% gyroid) 266 / 379 / 492 g, no warnings. Each half H adds about 113 g: 1.5 mm dividers print solid at 2 perimeters, so infill barely changes it.

## Every size: lengths (v24) and widths (v25), 2026-10-23

Joey (v24): "we need this to support all drawer sizes 59-270, but maybe not in all heights", with a warning at 2H when the compartments get too small to reach into, "maybe even in some situations with the 1.5H". Then (v25): "generate 1W, 2W, 3W and 4 wide drawer variants, except for 59, max of 2 wide, things get weird when you go wider than that".

- **Sizes** come from the planner catalog (`js/catalog/data.js` in modulith-planner): lengths 59, 115, 165, 185, 240 and 270; widths 1W to 4W. The cavity is 88 × W − 17 wide and length − 14 deep. The 59 collection comes at 1W and 2W and at 0.5H and 1H only. 3H (in the planner at 1W and 2W) is left out: with walls 159 mm tall, a compartment you can reach into is 88 mm across, so a 2W holds one column of them (1 × 2 in a 240). That is a bin, not a parts drawer. `SIZES` in gen.js is built from `LENGTHS` and `WIDTHS` by `sizeOf`, keyed `<length>-<W>W` (`sizeKey`, `parseSize`): 22 sizes, 84 with their heights.
- **Shells** (`shellFor` in gen.js), built when first needed and cached; the page loads only the two Fusion shells:
  1. **Width** (`widthShell`, v25). The 240-2W shell is two 88 mm columns. At each column centre (x 32.5 to 38.5 and 120.5 to 126.5) it has a straight band: no vertices, every face crossing it runs along x, and the two sections are identical. Cut there, it is a left end, one 88 mm period (a column boundary with its front and back features) and a right end. 1W drops the period, 3W and 4W repeat it, and the pieces are joined with one union.
  2. **Length** (v24). Front to back, the 240 shells have no vertices between y 15.43 and 217.67, and every face crossing that band runs along y. Everything behind y 116.55 moves by length − 240, so a length change only shortens or lengthens straight walls. The width step adds no vertex to that band.
  3. **Height** (v23). For 1.5H and 2H, everything above z 20.96 moves up 28 or 56 mm. The 2H then gets Joey's shallower runner groove (see "Taller drawers").

  A Fusion shell for a size goes in `assets.shells['<size>/<height>']`, where it replaces all of this.
- **Checked against Joey's own drawers** (`t_widths_decor.mjs`, with `decor_to_stl.py` turning his Decor drawer GLB exports into STLs). Applied to his Decor 240-2W (0.5H and 1H), the same construction rebuilds his Decor drawers to within 0.05 mm³ at every size checked: 240 at 1W, 3W and 4W; 59, 115, 165, 185 and 270 at 2W; 59-1W, 115-3W and 270-4W. So the width cut and the length stretch are how his drawers actually scale. His 1.5H and 2H differ from the 1H stretched in features the parts drawer doesn't have (a clip slot at each column centre on the back wall, a right-wall recess), plus the 2H groove, which v25 adopts.
- **Checked by code** (`t_sizes.mjs`):
  - each width at 0.5H and 1H is one clean solid, 88 × W − 13 wide; its ends are exactly the 2W's and each period is the 2W's period moved over; its volume is the 2W's plus a period per added width; no vertex lands in the length or height stretch bands;
  - all 84 shells are one clean solid with the right outside (88 × W − 13 wide, 4.3 in front of the cavity and 4 behind, rim where `SIZES` says);
  - each shell's front 15 mm is exactly the same width's 240, and its back is that 240's moved by the length difference;
  - a 1 mm slice inside the straight band equals that 240's, and its volume is that 240's plus that slice times the length difference;
  - the 240-2W 1.5H equals the v23 shell, and the 2H equals it inside its groove floors.

  For every size and height, the default grid builds as one solid. The floor and wall-edit fuzz tests pick a random size and height for each case (`t_floor`, `t_walls`; 82 and 80 of the 84 pairs, all clean). The lid and covers build at 59-0.5H, 59-1W, 115-1H, 240-1W, 165-3W-1.5H, 270-2W-2H, 270-4W-2H and 240-4W 10 × 4 (40 covers). The bottom mark fits and builds at 59-1W, 59-2W, 240-1W and 270-4W.
- **Not checked yet:**
  - a parts-drawer Fusion body at any size but 240-2W;
  - the drawer in its case at those sizes;
  - the stoppers. The back end is the 240's moved, so they sit where they sit on the 240 relative to the back wall.

  For every made size, the page says "made from the 240-2W drawer (…), not yet checked against a modelled part" under the height buttons. The README of a download says the same, gives the footprint, and asks for a test print before a set.
- **Changing the size** keeps the layout. Wall lines keep their place in proportion, front to back and left to right (`rescaleAxis`, `rescaleDepth`, `rescaleWidth`, snapped to 0.05 mm), so a 240-2W layout moved to 270-4W and back comes back within 0.05 mm.
  - If a compartment would end up under 12 mm, or a label would lose its holder, the grid starts over, and a note says so. The new grid (`defaultGrid`) has as many label-width columns as fit (2 / 5 / 7 / 10 for 1W to 4W) and rows about 56 deep (1 in a 59, 2 in a 115, 3 in a 165 or 185, 4 in a 240, 5 in a 270).
  - A 3W or 4W layout moved to the 59 drops to 2W, and a 1.5H or 2H one to 1H, each with a note. The 3W, 4W, 1.5H and 2H buttons are disabled there.
- **Print bed:** a drawer is 88 × W − 13 wide (75 / 163 / 251 / 339) and length − 5.7 deep (59: 53.3, 240: 234.3, 270: 264.3). A line under the width buttons gives the footprint and the smallest common bed it fits, either way round: 180 mm (Prusa MINI, Bambu A1 mini), 250 × 210 (Prusa MK4S), 250 × 220 (Prusa CORE One), 256 (Bambu X1, P1, A1), 300 (Prusa CORE One L, Creality K1 Max), 350 (Creality K2 Plus, Sovol SV08, Voron 350), 360 (Prusa XL). A 270 needs a 300 mm bed at any width; a 3W fits a 256 bed up to the 240; a 4W needs a 350 mm bed.
- **Layout codes** carry the size as `s`, but only when it isn't 240-2W, so every older code stays as it was. Downloads name the size (`MODULITH 240-3W-1H Parts Drawer …`), and layout.json has `size`.
- **Preview:** the 3D view fits the whole drawer (or the drawer and the lid beside it) to 94% of the view, along the same viewing direction as before. This holds at every size and height and on a phone. It refits when the size or height changes. Before v24 the 240 was framed slightly cropped (about 108% of the view on a desktop), and the 115 more so (about 125%).
- **Weight** with the default grid and Large labels, solid PLA (the page's readout). Sliced is 5 to 10% less (PrusaSlicer 2.7.2, 0.2 mm, 2 perimeters, 15% gyroid, no warnings): 59-1H 81 g, 115-0.5H 78 g, 270-2H at 2 × 4 389 g against 414 solid (v24); 240-1W-0.5H 78 g, 240-3W-1H 395 g, 240-4W-1H 531 g (v25; the 4W on a 360 mm bed). The v25 240-2W-2H at 2 × 3 slices to 354 g against 333 g for v24's (the thicker groove wall); PrusaSlicer logs two Arachne notes about wall direction on it, which v24's didn't, and no warnings. 0.5H / 1H:

  | Length | 1W | 2W | 3W | 4W |
  |---|---|---|---|---|
  | 59 | 25 / 44 g | 48 / 87 g | | |
  | 115 | 44 / 75 g | 86 / 149 g | 134 / 225 g | 176 / 300 g |
  | 165 | 62 / 103 g | 122 / 208 g | 190 / 313 g | 249 / 418 g |
  | 185 | 67 / 110 g | 131 / 222 g | 203 / 334 g | 267 / 446 g |
  | 240 | 86 / 141 g | 169 / 284 g | 262 / 428 g | 344 / 571 g |
  | 270 | 100 / 162 g | 195 / 327 g | 305 / 495 g | 400 / 660 g |

  Each half H above 1H adds about the 0.5H-to-1H step again (240-2W: 400 g at 1.5H, 535 g at 2H with the v25 groove; 270-4W 2H, 10 × 5: 1,200 g).

### Reach warning (v24)

- **The warning.** At 1.5H and 2H (wall tops 75 and 103), the page warns about the drawer as a whole. The rule is v23's (`REACH = 1.8`: a compartment fails when it is deeper than 1.8 × its narrower side). The narrowest a compartment can be is `reachMin` = (wall top − 1.2) / 1.8: 41.0 at 1.5H, 56.6 at 2H. At 0.5H and 1H only the per-compartment note shows. The warning:
  - reads "20 of 20 compartments are too narrow to reach into at 2H: here a compartment needs 56.6 mm across to get the last parts out by hand. Merge them, or start from the densest grid that works.";
  - hatches the failing compartments in the plan, with a legend entry ("Too deep to reach");
  - offers a button such as "Use 2 × 3": the densest even grid where every compartment passes (`reachableGrid`).
- **Reachable grids** (columns × rows), 1.5H / 2H:

  | Length | 1W | 2W | 3W | 4W |
  |---|---|---|---|---|
  | 115 | 1 × 2 / 1 × 1 | 3 × 2 / 2 × 1 | 5 × 2 / 4 × 1 | 7 × 2 / 5 × 1 |
  | 165 | 1 × 3 / 1 × 2 | 3 × 3 / 2 × 2 | 5 × 3 / 4 × 2 | 7 × 3 / 5 × 2 |
  | 185 | 1 × 4 / 1 × 2 | 3 × 4 / 2 × 2 | 5 × 4 / 4 × 2 | 7 × 4 / 5 × 2 |
  | 240 | 1 × 5 / 1 × 3 | 3 × 5 / 2 × 3 | 5 × 5 / 4 × 3 | 7 × 5 / 5 × 3 |
  | 270 | 1 × 6 / 1 × 4 | 3 × 6 / 2 × 4 | 5 × 6 / 4 × 4 | 7 × 6 / 5 × 4 |

- **Parts list at 1.5H and 2H.** The layout keeps every compartment at least `reachMin` wide and deep, so it never makes a compartment you can't reach into. When the list has more lines than such a drawer holds, it says so: "15 parts won't fit a 2H drawer: to reach into, a compartment there needs 56.6 mm across, so it holds 6. Use a lower drawer or split the list. A 1H drawer takes them."
- **Height tips.** Both tips now lay the list out at the other heights instead of scaling this one's fill, because a tall layout is a different, roomier layout than the 1H one. "Too full" names the lowest taller drawer that holds the list. "Plenty of room" names the lowest drawer that holds it under 90%.

## Drill-bit rack (prototype print, 2026-10-26; not in the page yet)

Joey, on the washer rows: "this design looks useful for storing drill bits and stuff". Not that geometry, though: in a ribbed floor a bit lies on the floor 1.2 mm from its neighbours, with nothing to get a finger under. Prototype print files in `bit-rack-prototype/` (a 45 g test with 1, 2, 3, 4, 5, 6, 8 and 10 mm; a whole 185-2W 0.5H drawer with the metric 1 to 10 set in 0.5 steps, 92 g).

- **Layout:** each bit lies left to right in its own row, smallest at the front, so the drawer's own motion is across the bits and they don't slide. Rows: the bit plus 2.4, at least 5.4. The metric 19-piece set takes 155 mm of rows (it fits a 185 drawer's full depth with a Small label, 0.1 short with a Large one); the fractional 1/16 to 1/2 set takes about 280, so two racks.
- **Support:** walls 1.6 thick with a 45° foot both sides, at 10, 24, 49, 84 and 119 mm from the bits' left ends, so a 34 mm bit (1 mm jobber, DIN 338) sits on two walls and a 133 mm one (10 mm) on five, every bit's middle between its outer walls. A round-bottomed notch per row, the bit's radius plus 0.2, centred on the wall top: each bit half sunk, every axis 11 mm over the floor top (0.5H: a 1/2" bit's top stays 0.5 under the divider tops).
- **Taking one out:** the bits' left ends butt a stop wall and overhang a 10 mm pocket before the first wall. Press that end down and the bit pivots on the first wall, the rest tipping up to grab (5.8 mm under a 10 mm bit's end, 10 under a 1 mm one).
- **Sizes:** debossed 0.4 in the floor left of each row, 5 × 7 block font at 0.6 mm (4.2 tall), digits proportional with a narrow dot (`marks.js` glyphs).
- **Checked in software** (`bit-rack-prototype/src/rack.mjs`): every bit clears the drawer seated and touches at least two walls lowered 0.05; tops under the divider tops less 0.5; the numbers fit their strip. Both files slice without warnings.
- **Open until the print:** notch fit with real bits (a hair over size, printed notches run small), the tip-up with a fingertip on small bits, readability of the numbers, whether other round tools want their own notch sizes. Then the page: a "Bit rack" cell with sets (metric 1 to 10, fractional 1/16 to 1/2, a typed list), warnings when a bit is too long for the compartment or the set too deep for it, and lid and cover clearance over the bits.

## Lift-out trays (concept and prototype print, 2026-10-23; not in the page yet)

Joey's "you'd have to dump it out" on a 2H 5×4: small compartments in a tall drawer are too deep to reach into. The fix is a shallow tray of small compartments over big ones. Modelled from the real shells and holders; prototype print files in `tray-prototype/` (a 115-1W-1.5H drawer and its two trays, about 130 g).

- **Two identical half trays, not one.** At full travel the drawer's back wall stops at the stopper tabs, about 3.5 mm behind the case front (derived from the stopper placement above, not measured), so a full-length tray's back edge stays under the case and it can't lift straight out; a nearly-full-out drawer is also a tipping risk. Each half tray is (D − 1.2) / 2 long: open the drawer a bit past halfway, lift the front tray out, slide the back one forward on the same ledges, lift it out. One tray alone slides back and forth like a toolbox till.
- **A tray is a 0.5H drawer's insides:** 1.2 floor, 17.8 deep, 19.0 tall, its top at the drawer's divider top. So the stoppers clear it by 1.28 (as plain dividers), holders, scoops and ramps behave exactly as validated at 0.5H, and one tray fits the 1.5H and the 2H of a size. Outside: W − 0.6 wide (0.3 to each wall), walls 1.5, a 0.4 chamfer round the bottom outside edge. The tray cavity is W − 3.6 wide, so a 2W tray takes 4 label columns, not 5 (5 holders need all 159); 1W, 3W and 4W keep their column counts.
- **Ledges** on the left, right and front walls: 1.2 wide, 0.6 thick at the edge, 45° underside, top at the seat = divider top − 19.0 (56.0 at 1.5H, 84.0 at 2H). None on the back wall: the back row's labels seat against it. Ledges are internals like the dividers; the shell is untouched.
- **Lower level:** dividers and holders built to seat − 0.8 (55.2 / 83.2), so a sagging tray lands on the dividers. Lower depth 54.0 at 1.5H (reach needs 30.0 across: the standard 30.6 column passes) and 82.0 at 2H (needs 45.6: 3 across in a 2W). Every lower holder seats, slides in and lifts exactly like the shipped part with the ledges in place (`labels_pack.py`, real label bodies): the ledge clears a seated label's end by 0.51, 0.11 when the label is lifted 0.4.
- **Pull:** the lid's standard finger pull (20 × 11 opening, 3 mm hook) as a closed cup down to the tray floor, its hook's underside 45° (the flat hook made PrusaSlicer warn "long bridging extrusions"). Placed as near the tray's middle as the holders allow: first keeping each label's whole 30 mm slide-in clear (what the label tests sweep), else keeping the holder plus its 12 mm opening (`MIN_DEPTH`). 240-2W 4 × 2: right behind the middle divider, 7.8 mm off centre; 115-1W 2 × 1: 6.7 mm in front of centre, 12.15 open in front of each holder. Side finger notches were rejected: they hit the left-column holders on any tray with 3 or more rows and need two hands on 3W and 4W.
- **Weights** (PrusaSlicer, 15% gyroid): 240-2W-1.5H drawer with a 3 × 2 lower level 250 g, each tray 70 g; 115-1W-1.5H drawer 93 g, each tray 18 g.
- **Open until the print:** the fit on the ledges, the pull's feel with a 45° hook, sliding, and the label clearance in real plastic. Then the real build: a tray option for 1.5H and 2H, a lower and a tray layout (the two trays share one by default), lid and covers that follow the tray's compartments, tray STLs in the download, layout codes that carry both levels. Name to settle: the page already says "Tray, mm" for the side ramps (`tray` in the data); renaming that "Ramps" keeps "tray" for these.

## Label and holder facts

- Label 29.876 × 8.0 × 1.35, text side up. The short ends are 45° chamfered from the bottom up 0.888 mm (the male dovetails); the long bottom edges have 0.25 mm chamfers.
- It lies flat on the holder deck at wall top − 2.5 and slides in from the front. The lips at each end are the female dovetail; a compliant latch at the centre front holds it.
- Checked against the real label body, in narrow, end-fill and wide sections, at 0.5H and 1H, both sizes:
  - seated, it overlaps only the latch (0.216 mm³ Large, 0.217 Small), identical to the shipped part;
  - slid in from the front wall to seated in 0.25 mm steps, it touches nothing but the latch;
  - lifted 0.4 mm, it meets both dovetail lips exactly like the shipped part.
- With 12 mm trays and Deep scoops at both heights, all three results are unchanged (20 holders checked): every ramp stays at least 3.3 mm below the label.
- Label-maker tape on the Large label: the flat top between the dovetails is 28.1 mm, so cut tape to 28 mm or less.

## Validation results (2026-10-22)

| Check | Result |
|---|---|
| Shipped 5×4 vs the Fusion parts drawer | max surface deviation **0.0001 mm** at 0.5H and 1H (`check_against_fusion.py`) |
| Floor fuzz: 160 random layouts over 82 of the 84 sizes and heights (v24 lengths, v25 widths), 1,107 compartments, 730 trays (373 of them 9 mm or more), 428 Deep scoops, odd tray values included; the shipped 5×4 at all four heights | all single watertight solids (`t_floor.mjs`) |
| Wall-edit fuzz: 150 sessions over 80 of the 84 sizes and heights (v24 lengths, v25 widths): 652 moves, 308 line moves, 334 merges, 530 splits, 512 typed sizes, 2,229 compartments | 0 bad layouts, every result a single clean solid (`t_walls.mjs`) |
| Label fit | 28 holders across wall-edit layouts, plus 20 with 12 mm trays and Deep scoops (`label_sweep.py`, `label_tray.py`) |
| Floor-color parts | body + floor parts add up to the plain drawer's volume exactly, zero overlap (`t_color.mjs`, `t_marks.mjs`) |
| Slicing (PrusaSlicer 2.7.2 CLI) | paint mode changes tools only on the three floor layers; one-color single-nozzle file has M600 at 1.4 mm |
| Kit layouts: 4 kits × 2 heights × 2 label sizes | all tile, every holder fits, clean solids (`t_inv.mjs`) |
| Outlines + bottom mark: 5 kit drawers, 73 outlines | all placed, clean solids (`t_marks.mjs`) |
| Slicing the v17 lid and covers (PrusaSlicer 2.7.2, 0.2 mm, 2 perimeters, 15% gyroid) | shipped lid 51 g, lid test corners 25.3 and 8.3 g; 20 shipped covers 51.7 g and 80 covers for 10×8 74.8 g as separate objects in the 3MF; cover test set 11.5 + 2.7 (0.5H middle), 12.2 + 2.6 (corner), 21.3 + 2.7 (1H middle), 4.7 + 1.0 (10×8) g; no warnings |
| Mesh hygiene over every output above | 353 STLs, 0 non-manifold edges, 0 extra bodies (`chk_mesh.py`); v24 and v25: the 310 fuzz STLs over every size and height, 0 problems |
| Lid: 51 layouts (shipped at 0.5H, 1H and 1.5H, a 3×2 2H with Deep scoops and 12 mm trays, one 2H box, Deep scoops with 12 mm trays, one big compartment, 7×5, 8×6, 9×6 and 10×8 grids with Deep scoops and 12 mm trays, 40 random) | lid is one solid; zero overlap with the drawer seated and nudged 0.29 mm any way; lowered 0.05 mm it overlaps, so it rests on the dividers; its top is 2.2 under the rim, 0.48 under the drawer stoppers' tabs; lifted 2.48 (the most a case allows) every lip still reaches 1 mm below the divider tops; **every lid has a pull**, at least 20 × 9 with a 2.5 hook, with a clear path down to the cup floor, an empty hook space and solid skin over the hook (`t_lid.mjs`, `t_lid_pull.mjs`) |
| Lid in the browser | on and off, beside and closed preview, plan pull outline, export folder, test-piece zip, layout code and share text keep the lid, undo, no console errors (`pwlid.py`) |
| Covers: 34 layouts (shipped at 0.5H, 1H and 2H, a 3×3 1.5H with Deep scoops and 12 mm trays, no labels, 7×5, 8×6, 9×6 and 10×8 grids, a grid of 12 mm compartments, 24 random with some covers off), 445 covers, 1,222 beads (v17; v23 adds the tall drawers) | every cover one solid; no overlap with the drawer seated or nudged 0.29 mm; each rests on the dividers; each meets its beads within 0.4 mm of lift; every cover has a nail slot at least 9 × 6 with a clear path down and 1.5 divots on both sides under 1.2 of solid panel, and its top edge chamfered; every cover's top is at least 0.4 under the stopper tabs (0.48); no two covers overlap; the drawer with beads stays one clean solid; the named grids get exactly the expected covers (all 80 on the 10×8; 1 of 176 on the 12 mm grid, whose 12 mm sides are too short for the 6 mm slot) and uncovered cells get no beads; v26: of the 445 covers, 160 sit over a label holder, none has plate over its label beyond 1.0 at the front (and the right end, beside a leg), 87 are L-shaped exactly where the holder's side is open, the narrowest leg 9.1 wide (`t_covers.mjs`) |
| Pulls in the browser | shipped 5×4 covers with 12 mm slots, 8×6 with 12 mm, 10×8 with 9 mm slots on all 80 covers and an 80-cover export, the 10×8 lid with its narrow pull, plan marks, selection summaries, no console errors (`pwpulls.py`) |
| Covers in the browser | covers mode, per-compartment off, plan outlines and beads (60 on the shipped 5×4), lifted and closed preview, export plate and layout.json, cover test pieces, share text keeps the uncovered compartment, lid and covers exclude each other, phone layout (`pwcovers.py`) |
| Cells: shipped 5×4 at all four heights and both label sizes, open, with the lid, with covers: wells for 625 / F695 / 608 (dense) / MR85 / 623 (from v19 `posts`) / LM8UU, nozzles and bits roomy and dense, washer rows M2 / M3 / M5 / M6 / M8 and M4 lock washers from a part, a Deep scoop with a 6 mm tray, rows with an old code's scoop and tray, no holder; merged blocks open, with the lid and dense; coloured floors one colour and painted (v20) | every drawer one clean solid; every cell and row on its open floor 2 mm clear; roomy cells 8 clear between the parts you grip (5 dense) and half that to the edge, wells their whole gap in front of and behind their notches; a well clears its bearing stack, its notches are narrower than the bearing and open to the floor, its foot is solid on both arcs and stays on the open floor, and its wall is 20 or less; nothing held over the height limit (0.5 under the divider tops or the lid's ribs, 3.3 under a cover, washers under the lid's lips); a washer clears its groove and, lowered 0.2, meets both flanks; nothing the cells hold (bearing stacks, nozzles, bits, washer rows leaning over their end walls) meets the lid or a cover; the lid pull never over a cell; v19 posts open as wells; with colour the body stays one solid, the parts add up to the drawer exactly with no overlap, and washer rows take no colour (`t_cells.mjs`) v27: a washer-row compartment's colour part runs exactly to its rib tops, the body keeps nothing over the ribs, the front end wall stays body colour, and the colour volume matches `vol` to 0.1% (`t_cells.mjs`). |
| Cells in the browser | wells from the selection (floor flattened, plan arcs, summary, bearing picker), the Spacing control (roomy by default, dense changes the pitch, the summary and the code, back to roomy), nozzles roomy and dense in a merged block, bits refused at 0.5H with the reason and laid out at 1H, hex holes in the plan, the lid pull off the cells; washer rows (v19): M3 by default, plan rows, summary, washer picker, code changes with the size, M8 refused under a 0.5H lid, a washer part sizing its rows and hiding the picker, no floor colour on rows; share text keeps cells, bearing and washer, and a v19 share text with posts opens as wells; export, the parts list leaving kit parts out, no console errors (`pwcells.py`) v27: washers stand in the rows in the preview; with one floor colour every compartment, washer rows included, gets its plan fill and the 3D view a coloured rib piece (`pwcells.py`). v28: no Washers button or picker; washer rows set through the test hook reopen from their share text as a plain compartment with the standard scoop. |
| Taller shells (v23): 1.5H and 2H | each one clean solid, rim 78 / 106; band section the 1H's at three heights; below the band the 1H exactly, above it the 1H moved up (within 0.0003 mm³); volume the 1H's + section × stretch; a shipped 5×4 at both heights and label sizes keeps the 1H's top 20 mm and floor exactly (`t_heights.mjs`) |
| Taller drawers in the browser (v23) | height buttons and the new-height hint, the reach note at 1.5H and 2H and not on a two-wide merge or at 1H, a 2H export 106 tall with the README note and layout.json, a 2H share text reopening at 2H, parts-list tips both ways (the lowest height that would do; since v24, a list too long for a reachable 2H drawer names 1H), the lid at 2H, covers at 1.5H, no console errors (`pwheights.py`) |
| Every size (v24 lengths, v25 widths): 84 shells (22 sizes × their heights) | the 1W, 3W and 4W shells one clean solid, ends and periods exactly the 2W's, volume 2W ± a period per width, stretch bands clear; every shell one clean solid with the right outside; front 15 mm the same width's 240 exactly, back that 240's moved, the straight band's slice and the volume as a pure stretch; the 240-2W tall shells equal v23's (the 2H inside its groove floors); default and reachable grids one solid, the reachable grid the densest that passes; every kit at 1.5H and 2H reachable or reports its capacity; layouts move between sizes and back within 0.05 mm; codes carry the size and 240-2W codes are unchanged; lid and covers at 8 sizes from 59-1W to 240-4W (40 covers); the bottom mark at the narrowest, shortest and widest sizes (`t_sizes.mjs`) |
| The construction against Joey's Decor drawers (v25) | from his Decor 240-2W at 0.5H and 1H, the generator's width cut and length stretch rebuild his Decor 240 at 1W, 3W and 4W, 59 / 115 / 165 / 185 / 270 at 2W, 59-1W, 115-3W and 270-4W to within 0.05 mm³ each way (`t_widths_decor.mjs`, after `decor_to_stl.py`) |
| The 2H groove (v25) | the 2H shell is the 1H stretched plus material on its groove floors only (16.5 cm³), its groove floor outline the Decor 240-2W-2H's; its outside matches the Decor 2H's to 0.000 mm³ either way; the 1.5H is exactly the stretch (`t_heights.mjs`) |
| Sizes in the browser (v24, widths v25) | collection and width buttons, meta line, footprint line, plan and drawer per size, a layout moving or starting over with its note, the 59 at 0.5H and 1H and at 1W and 2W only with 3 rows at most, exports at 115-2W (163 × 109.3 × 50) and 240-3W (251 × 234.3 × 50) with the README note and layout.json, share texts reopening at 185-1.5H and 240-3W, columns up to 15 at 3W and 5 at 1W, the reach warning (count, hatching, legend, the fix button: 2 × 3, 3 × 5, 2 × 4, 5 × 3 at 240-4W-2H), a parts list too long for 2H with the height that takes it, lid at 59, covers at 270 and 270-4W, both button rows on one line at 390 px, no console errors (`pwsizes.py`) |
| Kit drawers: the LDO Rev D list three ways (mixed, all 0.5H, all 1H) | all 53 lines parse with the right type, size, length and count; every line placed exactly once or outside; every drawer tiles and stays under its fill limit; old fastener lines parse as before (`t_kit.mjs`) |
| Browser (Playwright, Chromium) | tray presets and T cycling, 3D click select / Shift grow / orbit drag / clear, paint from the 3D bar and keys, outlines, code copy and reopen by code and by share text, export zip contents and names, no console errors, no horizontal scroll at 390 px (`pwphase.py` and earlier `pw*.py`) |

Build time: a full CSG build is about 60–150 ms (Manifold evaluates lazily, so the cost lands when the mesh is read). The earlier "2–10 ms" figure measured only the lazy call and was wrong. The page skips rebuilds when only colors change.

Material cost of trays, sliced (0.5H 5×4, Large labels, 0.2 mm layers, 2 perimeters, 15% gyroid):

| Tray | none | 3 mm | 6 mm | 9 mm | 12 mm |
|---|---|---|---|---|---|
| Filament | 157 g | 164 g | 173 g | 186 g | 191 g |

The page's weight readout is solid PLA, so it reads high for big trays (323 g solid for the 12 mm drawer above).

## Numerical rules that must survive the rewrite

1. **Integer grid.** All solid modelling runs in units of 0.1 µm (`U = 10000` per mm), every coordinate rounded to an integer. Float noise leaves micro-slivers that weld into non-manifold edges in slicers.
2. **Walls are one extrusion.** Divider walls are united in 2D (CrossSection) and extruded once. Overlapping boxes with coplanar tops leave pinched vertices at the junctions.
3. **Clean the mesh before export.** Booleans of many coplanar tops can leave a needle triangle with an edge far below 0.1 µm. `cleanMesh` snaps vertices to the grid, collapses what lands together, drops degenerate and twin faces, and keeps the result only if it is a valid solid of the same volume.
4. **Close corner-touching shapes.** Block-font pixels that touch only at a corner weld into a non-manifold edge. The bottom mark is grown then shrunk by 0.12 mm with round joins, which bridges those corners.

## Layout data model (v2)

```json
{ "v": 2, "size": "240-2W", "height": "1H", "label": "large", "style": "pyramid",
  "floor": { "mode": "paint", "colors": ["#f2f2f0", "#f5c518", "#3aa0ff"] },
  "outlines": true,
  "comps": [
    { "x0": 0, "x1": 30.6, "y0": 0, "y1": 56, "holder": true, "scoop": "std", "tray": 6, "color": 2,
      "item": { "type": "shcs", "size": "M3", "length": 10, "qty": 100 } } ] }
```

- `size` (v24, widths v25): `<length>-<W>W`, any of the 22 sizes in `SIZES` (`59-1W` … `270-4W`; the 59 only at 1W and 2W). A layout without one (a share text from before v24, for example) opens as `240-2W`.
- Each compartment is its clear inside in mm, from the cavity's front-left corner. Neighbours are exactly one wall (1.5) apart; the compartments grown by half a wall tile the cavity exactly (`checkTiling`, integer grid).
- `scoop`: `off` | `std` | `deep`. `tray`: mm, 0 = off (layouts from before sizes have `true`, which means 3). `color`: 0 = body, 1–4 = palette slot, used in paint mode.
- `lid` (optional): true adds the lid to the download.
- `covers` (optional): true gives every compartment a cover (and the drawer its beads); a compartment with `nocover: true` is left open. `lid` and `covers` are never both on.
- `item` (optional): the part in that compartment. Fastener types: shcs, bhcs, fhcs, set, nut, nyloc, washer, insert; sizes M2–M12. Since v18 also wafer, captive, selftap, knurled, lockwasher, spacer (length = thickness), tnut_roll, tnut_spring, tnut_hammer (sizes M2–M12), bearing (size = designation, e.g. F695-2RS), pulley and idler (size like "20T 9mm", length = bore), shaft and magnet (size = diameter, length = length or thickness), other (size = its name) and tube (ships outside; length in mm). Inserts may carry a length (M3x5x4 → 4).
- `cell` (optional, v18): `wells` (v20; v18–v19 `posts` open as wells) | `nozzles` | `bits` | `washers` (v19); `bearing` (optional, wells only): a designation from `BEARINGS`, used when the part isn't a bearing; `washer` (optional, washers only): a thread size from `WASHERS`, used when the part isn't a washer or lock washer; `spacing` (optional, v20, wells and sockets): `dense`, else roomy.
- `floor.mode`: `off` | `one` (colors[0] on every floor) | `paint`.
- Version 1 layouts (`cols`, `rows`, `regions`) convert with `toV2`. A missing `label` means Small.

## Parts list to drawer

- Part sizes come from ISO dimension tables (heads, nuts, washers, inserts). A pile's volume is the parts' bounding volume divided by a packing factor per type (0.3 screws, 0.35 washers, 0.4 nuts and inserts). Treat fullness as an estimate; calibrate once against a real filled drawer.
- Layout: rows split by count, then depths and widths by water-filling with minimums (label width 30.6, holder depth, part length). Five compartments per row with labels.
- labels.csv: position (R#C#), label text, part, size, length, quantity, front-left to back-right.

## Kit drawers (prototype tools, 2026-10-22)

The West3D idea (a vendor ships a hardware kit in its own drawers), tried on Joey's Voron 2.4 LDO Rev D hardware list (53 lines, 1,469 pieces). Outputs and the full write-up: `kit-drawers/Voron 2.4 LDO Rev D/`.

- **In the page since v18 (inventory.js):** vendor list lines with the quantity last ("Machine Screw, SHCS, M3x8 283", "Bearing, F695-2RS 20", "Pulley, 2GT, 20T, (5mm ID 9mm W) 4", "T-nut, Roll-in, 2020, M5 80", "Heatset Insert, Brass, M3x5x4 153"); new part types (bearings, GT2 pulleys and idlers, 2020 T-nuts, shafts, magnets, spacers, lock washers, knurled nuts, wafer, captive and self-tapping screws, sized inserts, named parts, tube that ships outside); a lost line break split back. The Part field takes them all. The parts list dialog still lays out only fasteners and says how many other parts it left out.
- **Sizing:** loose parts as a pile under a fill limit (75% for a shipped kit); bearings, pulleys, shafts and bags placed side by side (up to three high) on a flat floor, clear of the holder and the lid's lips. Old fastener layouts come out exactly as before (checked against a saved baseline).
- **Not in the page yet:** the kit split (`kitDrawers`: cuts the kit, in kit order, into drawers for the least case height, then fewest drawers, then fewest families split, then even fill) and the pick sheet (`site/kitsheet.js`: overview, a page per drawer with map and checklist, and a check of every list line). Built offline by `kit-drawers/.../src/make_kit.mjs` (needs `npm i jspdf@2.5.1`).
- **LDO Rev D:** 240 mixed heights, 4 drawers (2 × 1H screws and nuts, 2 × 0.5H motion parts and odds) in 3H of case, about 1 kg of PLA with lids; or a 270 version, all 1H, in 3 drawers (3H). The PTFE tube ships outside.
- **Taller drawers don't shrink a kit (v23, `kitDrawers` with the real layouts):** in 2W the LDO kit takes 3 drawers at 1H, 1.5H or 2H alike (fill limit 100%), because its 52 lines need more compartments and floor than a 2W holds (at most 40 compartments with Large labels); height only adds room on top. At 1.5H 47 of its 52 compartments trip the reach note, at 2H 50. A 1H + 0.5H pair holds 35 of the 52 lines; the whole kit at the lowest case height is 1H + three 0.5H (2.5H).
- **3W (modelled by widening the cavity to 247: the 2W's 159 plus one 88 mm pitch, as the GEN2 Classic drawers step from 3W to 4W, 251 to 339 outside; no shell yet):** the LDO kit fits two 1H drawers, 32 + 20 compartments (30 + 22 at the 75% shipping fill limit), 2H of case, nothing deep. Two 3W 1H drawers are the best kit answer found so far. A 3W shell can't be the 2W simply stretched (its middle would miss a column's back features and a column boundary's front and back features), but since v25 it is the 2W cut at its column centres with the 88 mm period repeated, which rebuilds Joey's Decor 3W exactly (see "Every size"). `kitDrawers` can now be given `size: '240-3W'`.
- **270:** the 240 shells are straight between y 15.4 and 217.7 (no vertices in between), so a 270-2W parts drawer is the 240 shell stretched 30 mm there, 264.3 deep, matching the 270 collection. In the page since v24, with every other length (see "Every size"); the same stretch rebuilds Joey's Decor 270-2W from his 240-2W (v25).

- **Pour simulation (2026-10-23, `kit-drawers/.../src/kitsim.py`, MuJoCo):** Joey asked whether the two 3W drawers really hold the kit, since it looked like a lot of drawer for hardware. All 1,468 pieces are dropped into their compartments (loose parts at random in front of the label holder, long screws lengthwise, pulleys, shafts and bags placed flat up to three high), settled, tapped down for 1 s at about 1 g and measured against the lid line; `kitsim_check.py` confirms no part sank into a wall. Result: everything but the T-nuts stays under the lid line, as poured and after the tap. T-nut piles (modelled as their full 10.5 × 6 × 4.5 and 10 × 6 × 5 blocks) come out 1.2 to 1.4 times the generator's estimate: 3 of 75 M3 hammer and 1 of 80 M5 roll-in T-nuts stay above the line after the tap. Screws land at 0.7 to 1.1 times the estimate, inserts and bearings well under it. The parts are 0.57 L, piled 1.8 L, in 4.5 L of room (40%); 25 of 52 compartments end under a quarter full and take 71% of a 3W floor, so the space goes to one labelled compartment per line, not to big parts. The biggest items: the four 80T pulleys (17% of a 3W floor, two high, 29 mm) and the two pre-packed sets (8% each, sizes guessed). Picture: `plan/3W option - pour simulation.png`.
- **Open from the simulation:** T-nut packing in `inventory.js` (pack 0.4 → about 0.3 for the three T-nut types), confirmed by pouring real T-nuts into a printed compartment; and shipping the thumb screw kit and IDGA gear set outside the drawers. With both, the layout engine fits LDO Rev D in a 3W 1H plus a 3W 0.5H packed full, or two 3W 1H at the 75% fill (not simulated).

## Layout codes

- Canonical layout: the size (v24, only when not 240-2W, so older codes stay as they were), height, label, floor, outlines, the lid or covers (only when on, so codes without them stay as they were; covers also list the compartments left open) and each compartment (rounded to 0.0001 mm, with its part), in a fixed key order. Code = first 30 bits of SHA-256, as 6 Crockford base32 characters, shown MD-XXX-XXX. Typing accepts lower case and Crockford look-alikes (O for 0, I and L for 1).
- Share text = `mdg1.` + base64url(deflate-raw(canonical JSON)). It reopens the layout with no server.
- Prototype registry: the browser keeps its last 80 codes, and the artifact's database stores `layouts/<code>` = { share, savedAt, size (v24), height, label, compartments } when a layout is downloaded or its share text copied. A code opens where its layout was saved.
- Real build: keep the registry on modulith.systems so any code resolves anywhere. 30 bits collide by chance once there are tens of thousands of codes (about 5% at 10,000), so store the full hash and lengthen the code (MD-XXXX-XXXX) when a different layout already holds it.

## Export

- Off: STL + 3MF of the whole drawer.
- One color or Paint, multi-material: a PrusaSlicer 3MF (one object; body and floor parts as volumes with extruders set in `Slic3r_PE_model.config`), a Bambu Studio / OrcaSlicer 3MF (components and `model_settings.config`; beta, untested by Joey yet) and STL parts.
- **Known issue, Bambu 3MF (Joey, 2026-10-30, Bambu Studio 2.8.2.61):** "The 3mf file has invalid config, load geometry data only". Not his version: the file says it was saved by `BambuStudio-01.09.00.70` (and carries a second Application tag, ours) but has no `Metadata/project_settings.config`, which every real Bambu project has, so Bambu Studio drops the config and keeps the geometry. Joey isn't worried. Fix when it matters: build the Bambu 3MF on a project_settings.config taken from a real Bambu Studio save (a hand-written partial config is what it rejects), or stop claiming to be Bambu Studio; check whether the part filaments survive either way.
- One color, single nozzle: the whole drawer with a filament change at 1.4 mm (PrusaSlicer custom G-code M600; Bambu `custom_gcode_per_layer.xml`) and a plain STL.
- With the lid on: a `Lid/` folder with the lid (STL and 3MF, top face down).
- With covers on: a `Covers/` folder with every cover laid out on one plate, top face down (STL and 3MF); the drawer in the same download has the beads.
- Also labels.csv (when parts are assigned), README.txt and layout.json (with code and share text). The zip name ends with the layout code.
- Artifact-viewer constraints: page downloads don't allow .stl or .3mf, hence the zip; the host doesn't serve .stl as a supporting file, hence base64 STL inside .json. None of this applies on modulith.systems.

## Adding sizes and heights

1. In Fusion, take the parts drawer shell for the size (the body with no internals, like Body32 on the 0.5H).
2. Mesh-export it in the cavity frame above, using its own exact cavity corner (`body.meshManager` at VeryHigh quality, minus the origin, rounded to 1e-5).
3. Load it as `assets.shells['<size>/<height>']` (for example `'270-2W/1H'`). `shellFor` then uses it instead of stretching the 240. Set that height's `stretched` to false in `sizeOf`, so the page and README stop calling it unchecked.
4. Widths come from the 2W the same way without a body (`widthShell`, v25): cut where the shell is straight at both column centres, repeat or drop the 88 mm period between. A Fusion body for a width replaces it through step 3.
5. The holder stamps are shared; they don't change with size or height.
6. Re-run the Fusion diff on one shipped layout per new shell before trusting it.
7. Without a Fusion body, a shell can be stretched where it runs straight. That is how 1.5H, 2H and every length but 240 are made (v23, v24).
   1. Find a band with no vertices, where every face crossing it is parallel to the stretch.
   2. Move everything past the band.
   3. Check it the way `t_heights.mjs` and `t_sizes.mjs` do: one solid, the band's section unchanged, the rest the source moved, the volume the source's plus section × stretch.
   4. Check it against Joey's own drawers of that size where they exist (`t_widths_decor.mjs`): his Decor and Classic drawers share the shell's outside, and a height or size can carry features a plain stretch doesn't (the 2H groove).

   Mark the height or size `stretched` until a Fusion body confirms it.

## Planner integration (agreed 2026-10-22)

- A closed parts drawer renders as the empty drawer (shell plus floor slab), built once per size and height and cached. Nothing changes visibly when the interior swaps in.
- Opening a drawer starts the slide animation at once and generates the interior in a Web Worker; the mesh returns while the drawer is still inside the case. Preload the engine (about 200 KB compressed) in idle time once a build contains a parts drawer, and cache meshes by layout.
- Editing a parts drawer's layout isolates it: the drawer slides out, the camera eases to a top-down 3/4 view, and the rest of the assembly fades to a faint ghost on one shared material.
- **2D plan toggle (Joey, 2026-10-22):** the parts drawer editor gets a 2D / 3D toggle like the planner's existing 2D view of the build. The 2D plan is the main editing surface (walls, sizes, selection, paint); 3D keeps click-to-select and painting.
- 3D picking as built in the prototype: raycast against the drawer mesh, take the compartment nearest the hit point (a wall belongs to the nearer side, the outer shell to none); a press and release under 6 px and 700 ms is a click, anything more orbits; selection rings sit on the wall tops.

## Planner integration: the next session (2026-11-04)

The generator is at v28 and its print round is out (`PRINT-ROUND.txt`). Next, a Claude Code session puts the parts drawer into the MODULITH planner (`Jerrari12/modulith-planner`, last read at d86324a, 2026-11-02). This section is that session's brief. "Planner integration (agreed 2026-10-22)" above still holds; this builds on it. On look and feel the planner's own docs win wherever they and this section differ: `docs/redesign/MODULITH-planner-style.md`, `STAGE-API.md`, `DECISIONS.md`.

### Where it lives

- A parts drawer is a third variant of the Decor drawer, `u.variant = 'parts'`, next to `'gridfinity'` and the standard drawer. It follows the variant rule in `js/generate.js`: a variant, never a fill. A variant kept on a size that can't have it renders the standard drawer, with the reason shown the way Gridfinity's are. The generator makes 84 size and height combinations; the 59 has no 1.5H or 2H and no 3W or 4W.
- The unit carries `u.partsLayout`: the v2 layout ("Layout data model") without `size` and `height`, which come from the unit. A unit without one gets `defaultGrid` for its size (the shipped 5×4 at 240-2W).
- Changing the unit's size or height treats the layout the way the prototype's size buttons do (`setSize` in `index.html`): compartments rescale with the drawer; if a label would no longer fit, the grid starts over, keeping the most common scoop and tray.
- Build workspace: the Standard / Gridfinity control (Library and Inspector) gains "Parts drawer". When it's picked, the Inspector shows a plan thumbnail, the layout code and an "Edit compartments" button.

### Edit mode

The 2026-10-22 decisions (isolate the drawer, ease the camera, ghost the rest, a 2D / 3D toggle with the plan as the main surface), mapped onto the planner:

- "Edit compartments" opens the drawer with `stage.peekUnit`, frames it top-down 3/4 through `setSafeArea`, and ghosts the rest of the build with the stage's ghost material (overlays in `edit-overlays`, `userData.ghost`).
- The Library panel becomes the drawer tools: grid (columns, rows, Shipped 5×4), label size, floor colour mode and palette.
- The Inspector becomes "This compartment": clear width and depth, label holder, scoop, ramp (the prototype's "Tray, mm"), floor colour. With several selected it reads "3 compartments" and shows the fields they share.
- Centre toolbar: 2D / 3D, 2D first. Measure and Explode hide; Reset frames the drawer.
- The Dock's CTA becomes Done; Esc also leaves. Edits go on the planner's own undo stack, one step per drag or field change.
- Size and height aren't edited inside the editor; they belong to the unit.

### UI: what changes from the prototype

- Colours from the planner's `tokens.css` only (Day Grid light, Night Grid dark); none of the prototype's. Archivo for display, IBM Plex Sans for UI, IBM Plex Mono for every dimension. Glass panels as the planner has them.
- `--orange` is selection and the primary action, nothing else. The prototype's blue selection becomes orange. Label holders, accent-coloured in the prototype plan, become white strips. Dimensions use `--measure`.
- The planner's option keys for choices (scoop, ramp, label size); neutral toggles for on and off; Phosphor icons with key chips for M, S, L and T.
- Floor colours through the planner's filament picker, stored as palette regions (`activeHex(key)`), not the prototype's swatches.
- The reach warning in the planner's amber issue pattern: "Show me" highlights the compartments too deep to reach, "Fix" is the prototype's "Use a reachable grid".
- Weight, print size and bed fit move to the Dock. The download moves to the Parts list (M3; M2 keeps a plain download button).
- The planner's unit vocabulary (0.5H, 2W, 240) and voice. No prototype words like cavity, stamp or tiling.

### 3D: what changes

- The planner's stage, not the prototype's: sky, faded grid, horizon glow, contact shadow, the `part-material.js` finishes, the quality tiers, FOV 40.
- No edge lines, as everywhere in the planner. Proposed exception (open, below): faint edges in edit mode only, because 1.5 mm walls seen from above read poorly without them. M2 shows both.
- Crease-angle normals (`toCreasedNormals`, about 30°): walls shade flat, gussets and scoops shade smooth. The prototype's flat-shaded mesh looks faceted under the planner's lights.
- Selection is the planner's two-rim outline (white inside, orange outside) on the selected compartments, replacing the prototype's rings.
- The faceplate and handle are the planner's, in the unit's colours; the generated mesh is the body.
- Compartment label text through the planner's label rendering where it fits (`label-preview.js`, `label-look.js`), so it matches the faceplate labels.
- The planner draws only after a change (its idle gate: `invalidateFrame()` and `drawNextFrame()` in `js/main.js`). The parts drawer must invalidate when its mesh, selection or overlays change, or the view won't update.
- Closed drawers render as the empty shell, cached per size and height. Generation moves to a Web Worker at M3; the main thread is fine for M2.

### Milestones

- **M0, set up.**
  - Branch `parts-drawer` off main.
  - Copy into `js/parts-drawer/`: `site/gen.js`, `marks.js`, `inventory.js`, `export.js`, `lib/manifold.*`, and the shell and stamp meshes. Plain `.stl` or binary is fine: GitHub Pages serves them, unlike the artifact host.
  - Copy into `docs/parts-drawer/`: this folder's docs, and the prototype `index.html` as `prototype/` for reference.
  - Port the Node tests in `validation/` that don't need the Fusion references to `node --test`, reading the meshes from their new place.
  - The planner's `npm test` and `npm run smoke` stay green. No visible change.
- **M1, frame.**
  - Put the generated empty shell (shell plus floor slab, no internals) on the planner's Decor drawer GLB (`Jerrari12/gen2-parts`). It must match within 0.05 mm on the outside at:
    - 240-2W 0.5H and 1H (the Fusion bodies);
    - one stretched case of each kind: a 1.5H, a 270 and a 3W.
  - A test pins the transform.
  - If any case is off by more, stop and report.
- **M2, prototype behind a flag.**
  - `?partsdrawer=1` adds:
    - the variant in the Inspector and Edit compartments;
    - the 2D plan and the 3D view with the core editing: grid, walls, merge, split, holders, scoop, ramp, floor colours, label size;
    - the planner's look as above;
    - the download as the prototype makes it.
  - Not in M2: parts list, outlines, cells, lid, covers.
  - With the flag off nothing changes, and the existing goldens stay identical.
  - **Stop here for Joey's review.**
- **M3, after Joey's go.**
  - `partsLayout` in the record and the share schema; share links and undo.
  - The worker and mesh caching.
  - Labels into the label list; the Parts list row and download.
  - The rest of the prototype's features and its warnings.
  - Tests, new goldens for the parts drawer, DECISIONS entries.

### Constraints

- Vanilla JS, no framework or bundler, like the rest of the planner.
- The generator's "Numerical rules that must survive the rewrite" hold unchanged. Changing geometry is out of scope: if something in the generator looks wrong, note it for Joey; don't fix it in this session.
- Reduced motion: the camera ease and the drawer slide snap instead of animating. Text contrast at least 4.5:1 in both themes.
- Each decision goes in `docs/redesign/DECISIONS.md` in its format (`## 2026-11-04 · …`).
- The prototype artifact stays as it is; the planner copy is the one that moves on.

### Open decisions (Joey's)

- **"Tray, mm" becomes "Ramp".** "Tray" now means the lift-out trays. Recommended: call the floor setting Ramp in the UI and keep the layout key `tray`, so old share texts still open.
- **Edges in edit mode.** Faint edges while editing and none elsewhere (recommended), or none at all. Judge at M2.
- **Compartment labels in the Labels workspace.** Recommended yes, keyed by unit id and compartment slot (the index in drawer order, which is the labels.csv order), so Label Studio can print them.
- **The Parts list row.** Recommended: one row per parts drawer, "Decor parts drawer, custom" with its layout code, downloading the zip.
- **Bambu 3MF.** Before this ships to anyone, either build the file on a real Bambu Studio `project_settings.config` or stop claiming to be Bambu Studio (see "Export").
- **Club gating.** If custom export becomes a club perk, generation moves to the server (the Cloudflare Worker and Stripe entitlement work) and the meshes stay off the client; a gate in the browser isn't protection. Doesn't block M0 to M2.
- **Unprinted features.** The lid, covers and cells, and the trays and bit rack (which aren't in the page), stay out of the planner until their prints pass.

## Decisions and backlog (2026-10-22)

Done in the prototype:
- Layout editing: draggable walls and typed sizes; scoop sizes, tray sizes and floor colors; 3D select and paint.
- Parts: parts list to drawer with kit presets; part outlines; printer-hardware part types and vendor list parsing (v18).
- Layout codes with the bottom mark.
- The lid with test pieces; snap-in compartment covers with nail slots (experiment).
- Cells: nozzle and bit sockets (v18); washer rows (v19); bearing wells and roomy spacing, replacing v18's posts and dense packing (v20).
- Sizes: taller drawers (v23); every collection length at 2W, and the reach warning for tall drawers (v24).

Decided 2026-10-22: covers lift by a nail slot (Joey), 6 mm front to back after his first print; the lid keeps a fingertip pull, which every grid now gets. Lid and covers stay 0.4 or more under the drawer stoppers' tabs (v17). An outside review (ChatGPT, 2026-10-22) ranked the stopper clearance first, recommended shipping the one-piece lid first and keeping covers experimental until the snap test prints are in; agreed.

Decided 2026-10-23 (Joey): anything thin that stands up from the floor (well walls and sockets now, any future pegs or fins; `footedTube` in gen.js) gets a 45° foot round its outside where it meets the floor, so it doesn't split along its first layers; and a feature's wall stays short enough to be strong (wells stop at 20 mm).

Decided against: per-compartment raised floors (material for little gain; tiny parts belong in a 0.5H drawer), sloped "gravity" floors, curved bowls (breaks the 45° rule), floor magnets, QR/NFC on labels.

Next candidates, in Joey's order once he picks:

- **Vendor kit drawers (West3D idea, 2026-10-22).** A vendor prints a drawer per hardware kit, fills it and ships it, so the drawer organizes and packages the kit and promotes MODULITH. Needs:
  - the lid (built; test print pending), which keeps the kit in its compartments while the drawer ships in its case;
  - a pick sheet for the packer: the drawer map with each compartment's part and count;
  - cross-promotion: a QR code on the underside next to the layout code, or a printed insert card if a debossed QR doesn't scan reliably;
  - a fill margin for transit (about 75%), calibrated once against a real kit;
  - a preset per kit from the vendor's parts list (CSV import already works);
  - commercial-print terms agreed in writing (per-drawer fee or license, required branding).
- **Kit drawers into the page (parked by Joey 2026-10-22, "we'll come back to that"):** paste a vendor list, get the drawers, one download with every drawer, lid, label list and the pick sheet; a QR to a page Joey picks (the MODULITH site or the vendor's); maybe the 270 size. Prototype and LDO results above. A note for the pitch: for a full printer kit the drawers are a product (about 1 kg of PLA), not packaging; small kits are where "it ships in the drawer" pays.
- **Lid first, covers after their tests.** The v17 lid is waiting on a print (and the stopper measurement). Still open: whether it needs a light snap for carrying drawers around, and Joey's pivot-on-open idea (needs the back wall position at the stopper).
- **Order agreed 2026-10-23** (after the outside review): (1) print-test the v20 cells for fit and use; (2) prototype one card compartment and one chip trough at actual size, as cheap samples, before any taller drawer; (3) the tackle tray as two half trays that each lift out (no dependence on how far the drawer travels; a sliding tray can follow once travel and access are checked), labels on the lower compartments optional and on by default; (4) taller shells and hobby recipes. Joey pulled the taller shells forward (v23, 2026-10-23); their Fusion check stays open.
- **Hobby drawers (Joey, 2026-10-23):** poker cards and dice, maybe collector cards; 1.5H or 2H parts drawers are fine. Keep "trading-card accessories" (dice, tokens and counters to bring to the table) apart from "card collection storage" (browsing, protection, capacity). "Poker night" is the first recipe. Card sizes, sleeve clearances and capacities stay estimates until checked against real cards, sleeves and toploaders; quote capacity for a stated card and sleeve, not a box count. Chips (39–40 mm) want a round-bottom trough, not the washer rows' 30° V (a chip would stand 43 mm, over the 1H lid limit).
- **Taller shells, other lengths and widths:** in the page since v23, v24 and v25 (see "Taller drawers" and "Every size"). Still to check: a parts-drawer body or a print per size family, the case, the stoppers, the lid, and finger room over stored cards.
- **Other widths: 1W, 3W, 4W:** in the page since v25 (Joey: "make it so you can generate 1W, 2W, 3W and 4 wide drawer variants, except for 59, max of 2 wide"). Built from the 2W at its column centres; checked against his Decor drawers (see "Every size"). Next for kits: let the kit split choose between widths (two 3W 1H drawers for the LDO kit, backed by the pour simulation in "Kit drawers", with T-nuts given more room).
- **Lift-out tray for tall drawers** (proposed 2026-10-23, after Joey's "you'd have to dump it out" on the 2H 5×4): a shallow tray of small compartments that sits on ledges in the top of a 1.5H or 2H drawer and lifts out, with the big compartments underneath. It joins the half trays in "Order agreed" item 3. Concept and prototype print done 2026-10-23 (see "Lift-out trays"); the page build waits on that print.
- **Bed-size note:** done in v25, as a line under the width buttons (see "Every size", Print bed). The real build can use the planner's printer list and the person's own printer.
- **Removable cups** ("take it to the table"): a second route to removable bins next to the Gridfinity drawers; only worth building for something distinct (pouring corners, lids, a better fit). Removable socket blocks: optional, for swapping arrangements, not because sockets break.
- A drawer map label (depends on whether the closed front takes EdgeLabel / Classic Pro). Washer rows (v19) were the washer-floor ribs.

Open decisions for the real build:

- **Club gating:** a browser-only export gate is not protection. If custom export becomes a club perk, generate on the server (the Cloudflare Worker + Stripe entitlement work already exists) and keep the geometry assets off the client.
- **Label Studio:** two parts-drawer label templates (Small 29.88 × 8, Large 29.88 × 13), fed from labels.csv in drawer order.
- Where it lives: modulith.systems next to Label Studio, and how downloads keep Printables attribution.
- Render on demand: the prototype redraws the 3D view every frame. That's free on a GPU but wastes battery on laptops and phones, and in software rendering (the browser tests) a view with 80 covers takes seconds per frame. Redraw only when the camera, the scene or the theme changes.

## Files

- `site/index.html`: the page (UI, plan editor, three.js preview, 3D picking, dialogs, export).
- `site/gen.js`: geometry core, the same module the tests import. Since v19 it also holds the washer tables (`WASHERS`, `LOCK_WASHERS`), which the parts list imports.
- `site/export.js`: STL and 3MF writers (generic, PrusaSlicer, Bambu/Orca) and the README text.
- `site/kitsheet.js`: kit drawer maps and the packer's pick sheet (jsPDF); not loaded by the page yet.
- `kit-drawers/`: kit drawer plans, print files and pick sheets (Voron 2.4 LDO Rev D so far), and the pour simulation that checks a kit fits (`src/kitsim*.py`, `kitsim_export.mjs`).
- `cell-print-files/`: the v20 cell test prints (bearing wells and washer rows in real compartments, socket grids on plates) with fit and use checks.
- `bit-rack-prototype/`: the drill-bit rack prototype (a test piece and a whole 185-2W 0.5H drawer with the metric set), renders, and the prototype script in `src/`.
- `tray-prototype/`: the lift-out tray prototype (a 115-1W-1.5H drawer and its two trays) with checks, the 240-2W concept image, and the prototype script in `src/`.
- `PRINT-ROUND.txt`: what to print next and what each print settles (2026-10-23).
- `KICKOFF-PROMPT.md`: the opening prompt for the planner integration session (2026-11-04).
- `site/inventory.js`: part dimension tables, list parsing, kit presets, the parts-list layout, labels.csv, part silhouettes and outline placement.
- `site/marks.js`: canonical layout, layout codes, share text, block font for the bottom mark.
- `site/lib/manifold.*`: manifold-3d 3.5.3 (WASM).
- `site/assets/*.json`: shell and stamp meshes as base64 STL (`holder_stamp` is Small, `holder_stamp_large` is Large). The page loads `shell_240-2W-05H` and `-1H` and stretches every other size and height from them (v24). `shell_240-2W-15H` and `-2H`, the v23 stretched 1H, are no longer loaded; `t_sizes.mjs` checks the v24 stretch against their STL copies.
- `validation/`: Node and Python tests; see `validation/README.md` for what each one checks and the files it reads. `t_widths_decor.mjs` and `decor_to_stl.py` (v25) check the shell construction against Joey's Decor drawer exports, which stay on D: (`decor-drawers-v2609-2026-10-19\previous (July 2026 export)\<L>\raw`).
- `lid-print-files/`: a ready lid for the released 5×4 (Small labels, fits 0.5H and 1H) and the 0.5H lid test pieces.
- `cover-print-files/`: the v17 compartment-cover test set (0.5H middle and corner, 1H middle, 10×8).
- `consult/`: the lid-vs-covers brief for a second opinion, with section drawings and screenshots; `cover-nail-slot.png` shows the v15 nail slot, `cover-nail-slot-v16.png` the chamfered v16 one, `cover-nail-slot-v17.png` the v17 one with the stopper line; `2026-10-22-stopper-clearance.md` and its RESULTS file record the stopper check.
- `../generator-assets/`: shells (the 1.5H and 2H stretched ones too), Fusion reference internals, the Small label and both holder stamps as STL.
- `../large-label-test/`: the printed Large test section and the Large label (STL). In Fusion: the "Large Label Holder Test (240 0.5H)" component in "240 Parts Drawers".
