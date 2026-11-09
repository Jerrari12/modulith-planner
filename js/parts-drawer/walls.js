/* A wall drag's rules (2026-11-06), shared by the plan (plan.js, 2D) and the editor's 3D view (editor.js): which wall is
   under a point and what moves with it (the generator's chain: wallAt, wallChain; Shift takes the whole line), where it
   snaps (0.5 mm steps; other walls and a label's exact fit as magnets; Alt skips it), and the compartments as it goes
   (moveChain). Pure over a layout's compartments; the caller brings its own tolerances in mm, since a pixel is a different
   number of millimetres in the plan and on the stage. Lifted out of plan.js when the 3D view gained the drag (Joey:
   "could they also do the editing in 3d as well?"). */
import * as G from './gen.js';

const EPS = 1e-6, WALL = G.C.WALL;
/* the wall chain under a plan point (mm), or null: `tol` is the reach in mm, `shift` takes the whole line */
export function hitWall(comps, full, pt, { tol, shift = false }) {
  const w = G.wallAt(comps, full.size, pt, tol); if (!w) return null;
  const ch = G.wallChain(comps, w.orient, w.c, w.seed, shift);
  return ch && ch.range[0] <= ch.range[1] + EPS ? ch : null;
}
/* the positions a moving wall is drawn to: every other wall's faces, and the exact fit of a label holder on either side */
export function magnets(ch, list, full) {
  const a = ch.orient === 'v' ? 'x' : 'y', m = [];
  for (const k of list) m.push(k[a + '0'] - WALL / 2, k[a + '1'] + WALL / 2);
  const fit = ch.orient === 'v' ? G.C.HOLDER_W : G.holderOf(full).MIN_DEPTH;
  for (const i of ch.L) m.push(list[i][a + '0'] + fit + WALL / 2);
  for (const i of ch.R) m.push(list[i][a + '1'] - fit - WALL / 2);
  return m;
}
export const along = (ch, pt) => (ch.orient === 'v' ? pt.x : pt.y);
/* where the wall lands for a raw position, in this order: a magnet within `tol` mm (another wall's face, a label's fit);
   else a position that makes a neighbouring compartment a whole number of mm wide, within `tol`; else 0.5 mm steps from
   where it started; never past the chain's range. `free` (Alt) keeps only the range. */
export function snapWall(ch, raw, free, tol) {
  let c = raw;
  if (!free) {
    c = ch.c + Math.round((raw - ch.c) / 0.5) * 0.5;
    const nearest = (cands) => { let best = null; for (const m of cands) if (Math.abs(m - raw) <= tol && (best === null || Math.abs(m - raw) < Math.abs(best - raw))) best = m; return best; };
    let best = nearest(ch.mags);
    if (best === null && ch.lat) best = nearest([...ch.lat.L.map((o) => o + Math.round(raw - o)), ...ch.lat.R.map((o) => o - Math.round(o - raw))]);
    if (best !== null) c = best;
  }
  return G.snapMM(Math.min(ch.range[1], Math.max(ch.range[0], c)));
}
/* a drag in progress: the chain with its magnets, the compartments as they were, as they are, the grab offset, the wall's
   position now */
/* the far faces of the compartments on each side of the chain: a wall at (face + a whole number of mm + half a wall) gives
   that compartment a whole-millimetre clear width (Joey, 2026-11-06: "snap into whole integer values if possible, but
   still snap into neighboring alignments first") */
export function lattice(ch, list) {
  const a = ch.orient === 'v' ? 'x' : 'y';
  return { L: ch.L.map((i) => list[i][a + '0'] + WALL / 2), R: ch.R.map((i) => list[i][a + '1'] - WALL / 2) };
}
export function startWallDrag(comps, ch, pt, full) {
  const start = comps.map((c) => ({ ...c }));
  return { ch: { ...ch, mags: magnets(ch, start, full), lat: lattice(ch, start) }, start, comps: start, grab: along(ch, pt) - ch.c, c: ch.c };
}
/* the pointer at a new plan point: true when the wall moved (the drag's comps are then the layout as it would be) */
export function moveWallDrag(wd, pt, free, tol) {
  const c = snapWall(wd.ch, along(wd.ch, pt) - wd.grab, free, tol);
  if (c === wd.c) return false;
  wd.c = c; wd.comps = G.moveChain(wd.start, wd.ch, c);
  return true;
}
export const dragMoved = (wd) => Math.abs(wd.c - wd.ch.c) > EPS;
/* one string per chain, to tell a hover change */
export const chainKey = (ch) => (ch ? `${ch.orient}${ch.c}:${ch.L.join(',')}` : '');
