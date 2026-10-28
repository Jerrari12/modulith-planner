/* THE PLANNER'S OWN STRUCTURE HELPERS, written by hand beside the GENERATED rule modules. layout.js, schema.js and bom.js
   come from the old planner through tools/port-rules.mjs, which rewrites them whole, so anything added to them is lost at
   the next port (and shows as drift in `npm run drift` until then).
   - refusalReason(): why a cell beside the build is refused (the Build workspace's "no" spots, 2026-10-20).
   - standUp() / openCells() / standRecord() / slotWords(): a layout's gaps on its mount (Joey, 2026-10-20: a wall build
     with gaps along its bottom, switched to Tabletop, stopped the page on "Can't show this build yet · A unit is floating";
     2026-10-21: the gaps stay empty slots to fill, never filled by the switch itself - standUp is the "Fill all" button). */
import { layoutRules } from './layout.js';

/* WHY A SPOT IS REFUSED (2026-10-20; Joey's coworker could not tell why a 1W would not go in the middle above a 3W). The
   words for each structural rule the "+" spots are judged by (build.js judge(): unsupported, sag, the Wall Mount 0.5H
   top, the generator), in one place so the 3D view, the board and the tests say the same thing. `code` is the problem
   key's prefix: "s" a sag risk, "u" an unsupported end, "w" a wall-top 0.5H, "gen" the generator; `w` the armed width,
   `below` the width of the unit the cell would rest on (when there is one); `hanging` when the mount holds the build from
   ABOVE (wall, under-table), where the supporting case is over the cell, not under it (Sol 01a15b70). */
export function refusalReason(code, { w = 1, below = null, hanging = false } = {}) {
  const unit = (n) => `${n}W`;
  const side = hanging ? "above" : "under";
  if (code === "s") return below
    ? `A ${unit(w)} can't ${hanging ? "hang from" : "sit on"} the middle of the ${unit(below)}: a case needs a wall ${side} at least one end. Put it at an end of the ${unit(below)}, or use a wider case.`
    : `A case needs a wall ${side} at least one end: here it would ${hanging ? "hang from" : "rest on"} the middle of the case ${hanging ? "above" : "below"}.`;
  if (code === "u") return `Both ends need a case ${hanging ? "above" : "below"}.`;
  if (code === "w") return "Wall Mount top-row cases can't be 0.5H · they're too low-profile for wall-mount holes.";
  if (code === "v") return hanging   // a new empty slot (2026-10-21): the generator wants every column held, not only the ends
    ? "Part of it would have nothing above it: every column of a case needs a case above it or the top row."
    : "Part of it would have nothing under it: every column of a case needs a case below it or the table.";
  return "The parts can't be built this way.";
}

/* STANDING A BUILD ON ITS MOUNT. The generator shows a layout only when EVERY column of every unit rests on another unit or
   on the table (tabletop), or hangs from one or from the bracket or rail course (wall, under-table). That is stricter than
   the planner's own support rule (both ends) and than its fixStructure (gravity, then a case under each open END), so a
   change of mount could leave a layout the planner kept and the stage could not show. standUp keeps the layout as designed,
   nothing moves, and fills each open column under a unit (tabletop) or above it (hanging) with 1W cases through the rules'
   own filler (fillColumn), in the build's majority drawer type, as Build's red support spots place them. Call it after the
   layout sits against its mount's edge (setMount rebases on a change; standRecord rebases itself).
   `build` is the record the rules object `Rs` was made over; it is changed in place. Returns { added, ids }. */
export function standUp(build, Rs) {
  const had = new Set(build.placed.map((p) => p.id));
  const top = Math.max(0, ...build.placed.map((p) => Number(p.id) || 0));
  if (!(build.nextId > top)) build.nextId = top + 1;   // a record whose nextId lags its ids would mint a duplicate
  const fromTop = build.mount !== "tabletop", step = fromTop ? -1 : 1;
  for (let guard = 0; guard < 400; guard++) {
    const occ = Rs.occupancy(), rows = Rs.rows();
    let open = null;
    for (const p of build.placed) {
      if (fromTop ? p.y <= 0 : p.y + p.hh >= rows) continue;   // on the mount's surface
      const s = fromTop ? p.y - 1 : p.y + p.hh;                // the row it rests on (or hangs from)
      for (let c = p.x; c < p.x + p.w; c++) if (!occ.has(c + "," + s)) { open = [c, s]; break; }
      if (open) break;
    }
    if (!open || !Rs.fillColumn(open[0], open[1], step)) break;
  }
  const added = build.placed.filter((p) => !had.has(p.id));
  if (added.length) {
    const n = { classic: 0, decor: 0 };
    for (const p of build.placed) if (had.has(p.id) && (p.fill === "classic" || p.fill === "decor")) n[p.fill]++;
    const fill = n.decor > n.classic ? "decor" : "classic";   // a tie keeps the filler's own classic
    for (const p of added) p.fill = fill;
  }
  return { added: added.length, ids: added.map((p) => p.id) };
}

/* THE OPEN CELLS (2026-10-21, Joey: "i don't want switching between mounting types to automatically add units"; the gaps
   stay "empty slots I have to fill in", and the assembly is not legal until they are). The cells standUp would fill, left
   open: under each tabletop case down to the table or the next case, above each hanging case up to the grid's top row (the
   brackets or rails) or the next case - the surface standUp fills to and unsupportedUnits counts, so the slots shown are
   exactly what Fill all fills. The same walk as the generator's opts.voids, which draws them as ghosts. A layout that
   touches no surface has none: it floats as a whole (a tabletop one the generator refuses outright), and Build's "not
   supported" issue with Fix structure covers it. Planner cells { x, y }, y in half-rows from the grid top. */
export function openCells(build, Rs) {
  if (!build.placed.length) return [];
  const fromTop = build.mount !== "tabletop", occ = Rs.occupancy(), rows = Rs.rows();
  const onSurface = (p) => (fromTop ? p.y <= 0 : p.y + p.hh >= rows);   // as standUp's own test
  if (!build.placed.some(onSurface)) return [];
  const out = new Map();
  for (const p of build.placed) {
    if (onSurface(p)) continue;
    for (let c = p.x; c < p.x + p.w; c++)
      for (let y = fromTop ? p.y - 1 : p.y + p.hh; (fromTop ? y >= 0 : y < rows) && !occ.has(c + "," + y); y += fromTop ? -1 : 1) out.set(c + "," + y, { x: c, y });
  }
  return [...out.values()];
}

/* THE BOOT'S SAFETY NET: a record the generator refused, slid against its mount's edge as setMount does (an old link whose
   tabletop layout floats above the table as a whole). It adds nothing (Joey, 2026-10-21): gaps under part of a layout
   are shown as empty slots by the generator's opts.voids. null when the slide changes nothing. The caller runs the
   generator on the result and uses it only if it passes. `deps` is layoutRules' own ({ tabletop }). */
export function standRecord(record, GEN2, deps = {}) {
  if (!record || !Array.isArray(record.placed) || !record.placed.length) return null;
  const t = JSON.parse(JSON.stringify(record));
  const shifted = layoutRules(t, GEN2, deps).rebaseToMountEdge();
  return shifted ? { record: t, added: 0 } : null;
}

/* the words for the empty slots a layout has, for the setup sheet and its note: "4 empty slots under it" */
export function slotWords(mount, n) {
  const slots = `${n} empty slot${n === 1 ? "" : "s"}`;
  return mount === "tabletop" ? `${slots} under it` : `${slots} up to the ${mount === "wall" ? "brackets" : "rails"}`;
}

/* THE STAGE'S SPOTS WHILE A SIZE IS ARMED (Joey 2026-10-28: placing a 1W·3H shelf into a 1W·3H void, "when i hover over the
   yellow + it flickers between a red+ and a yellow+, making it like a 50/50 chance i can place a shelf or it tries to place a
   1W-1h to like fill the gap, fighting me"). The void's empty slots are red "+"s (the cases Fill all would add), and one of
   them had its marker on the very point of the armed spot's: hovering one hides its marker and shows its ghost, so the
   other's marker took the pointer, and back - a click took whichever held it. Placing the armed unit fills the slots its
   footprint covers, so while it is armed a red slot inside an offered spot is not shown (the armed spot wins), and a muted
   refused cell gives way to a red slot whose marker it would cover (the slot is the one a click can do something with).
   need, offered, refused: [{ x, y, w?, hh? }] (y and hh in half-rows); w, hh: the armed size, for spots that carry none.
   Returns the list in the stage's order: the slots, the offered spots, the refused cells. */
export function armedSpots(need, offered, refused, w, hh) {
  const box = (s) => [s.x, s.y, s.x + (s.w || w), s.y + (s.hh || hh)];
  const overlaps = (a, b) => { const [ax0, ay0, ax1, ay1] = box(a), [bx0, by0, bx1, by1] = box(b); return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1; };
  const centre = (s) => { const [x0, y0, x1, y1] = box(s); return `${x0 + x1},${y0 + y1}`; };
  const shownNeed = need.filter((n) => !offered.some((o) => overlaps(n, o)));
  const shownNo = refused.filter((r) => !shownNeed.some((n) => centre(n) === centre(r)));
  return [...shownNeed, ...offered, ...shownNo];
}
