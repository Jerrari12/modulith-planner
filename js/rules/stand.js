/* THE PLANNER'S OWN STRUCTURE HELPERS, written by hand beside the GENERATED rule modules. layout.js, schema.js and bom.js
   come from the old planner through tools/port-rules.mjs, which rewrites them whole, so anything added to them is lost at
   the next port (and shows as drift in `npm run drift` until then).
   - refusalReason(): why a cell beside the build is refused (the Build workspace's "no" spots, 2026-10-20).
   - standUp() / standRecord() / standWords(): a layout made to stand on its mount (Joey, 2026-10-20: a wall build with
     gaps along its bottom, switched to Tabletop, stopped the page on "Can't show this build yet · A unit is floating"). */
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

/* THE BOOT'S SAFETY NET: a record the generator refused (a mount switched before the setup sheet stood builds up, an old
   planner's link with a unit in mid-air), slid against its mount's edge as setMount does and stood up. null when that
   changes nothing, so a refusal about something else reaches the page as before. The caller runs the generator on the
   result and uses it only if it passes. `deps` is layoutRules' own ({ tabletop }). */
export function standRecord(record, GEN2, deps = {}) {
  if (!record || !Array.isArray(record.placed) || !record.placed.length) return null;
  const t = JSON.parse(JSON.stringify(record));
  const Rs = layoutRules(t, GEN2, deps);
  const shifted = Rs.rebaseToMountEdge();
  const r = standUp(t, Rs);
  return r.added || shifted ? { record: t, added: r.added } : null;
}

/* the words for what standUp added, for the setup sheet and the toasts: "4 support cases under the gaps" */
export function standWords(mount, n) {
  const cases = `${n} support case${n === 1 ? "" : "s"}`;
  return mount === "tabletop" ? `${cases} under the gaps` : `${cases} to fill the gaps up to the ${mount === "wall" ? "brackets" : "rails"}`;
}
