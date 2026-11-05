/* A planner unit as a parts drawer (M2, 2026-11-05; SPEC "Where it lives").
   A parts drawer is the third variant of the Decor drawer: `u.variant === 'parts'` on a decor unit, next to 'gridfinity'
   and the standard drawer (its absence), under the variant rule in js/generate.js: a variant, never a fill, and a value
   kept on a size that can't have it renders the standard drawer. The unit carries `u.partsLayout`: the generator's v2
   layout WITHOUT size and height, which come from the unit (its collection length and width give the size, its half
   height the height). What this module does is pure: it maps a unit to the generator's size and height, says whether the
   size exists, gives a unit its layout (the record's, cleaned against the unit's size, else the default grid), moves a
   layout to another size the way the prototype's size buttons did, and builds the full layout the generator reads. */
import * as G from './gen.js';

export const PARTS = 'parts';
/* the planner's half-height units to the generator's heights; no 3H (SPEC: a 2W holds one column of reachable compartments) */
export const HEIGHT_OF_HH = Object.freeze({ 1: '0.5H', 2: '1H', 3: '1.5H', 4: '2H' });
export const sizeOfUnit = (L, u) => G.sizeKey(+L, u.w);
export const heightOfUnit = (u) => HEIGHT_OF_HH[u.hh] || null;
/* the size and height exist for the generator: every collection length at 1W to 4W, 0.5H to 2H; the 59 at 1W and 2W,
   0.5H and 1H only (gen.js SIZES) */
export function partsSizeOk(L, u) {
  if (!u || u.fill !== 'decor') return false;
  const S = G.SIZES[sizeOfUnit(L, u)], h = heightOfUnit(u);
  return !!(S && h && S.heights[h]);
}
export const isPartsDrawer = (L, u) => partsSizeOk(L, u) && u.variant === PARTS;
/* why a size can't be a parts drawer, in the Library's words, or null */
export function partsSizeWhy(L, w, h) {
  const S = G.SIZES[G.sizeKey(+L, w)];
  if (!S) return +L === 59 ? 'Parts drawers in the 59 come 1W and 2W' : `No parts drawer for ${L}`;
  const key = HEIGHT_OF_HH[h * 2];
  if (!key || !S.heights[key]) return +L === 59 ? 'Parts drawers in the 59 come in 0.5H and 1H' : 'Parts drawers come in 0.5H to 2H';
  return null;
}

/* floor colours: the mode and how many paint slots; the colours themselves are the build's palette regions
   (Drawer:FLOOR1..4, SPEC "Floor colours through the planner's filament picker, stored as palette regions") */
export const FLOOR_KEYS = Object.freeze(['Drawer:FLOOR1', 'Drawer:FLOOR2', 'Drawer:FLOOR3', 'Drawer:FLOOR4']);
export const FLOOR_DEFAULT_HEX = Object.freeze(['#f2f2f0', '#f5c518', '#3aa0ff', '#e5322d']);   // the prototype's, until a filament is picked
const FLOOR_MODES = ['off', 'one', 'paint'];
const clone = (o) => JSON.parse(JSON.stringify(o));

/* the default layout for a size: the shipped 5x4 at 240-2W, else as many label-width columns as fit and rows about 56 deep
   (gen.js defaultGrid); Large labels, as the prototype opened */
export function defaultLayout(size, keep = {}) {
  const S = G.SIZES[size]; if (!S) throw new Error(`no parts drawer size ${size}`);
  const g = G.defaultGrid(size);
  const comps = S.shipped ? G.gridComps(S.shipped.cols, S.shipped.rows, keep) : G.evenGrid(size, g.nc, g.nr, keep);
  return { v: 2, label: 'large', nc: g.nc, nr: g.nr, floor: { mode: 'off', slots: 3 }, comps };
}
/* a record's layout, cleaned against the unit's size: null when it is not a layout, or its compartments don't tile this
   size (a layout kept across a resize to a size with no parts drawer, a damaged link). Only what M2 edits is kept: the
   label size, the floor mode and slots, each compartment's box, holder, scoop, ramp (`tray`) and colour. Parts, cells,
   covers and the lid wait for M3 (SPEC "Not in M2"). */
export function cleanLayout(raw, size) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.comps) || !G.SIZES[size]) return null;
  if (raw.label !== undefined && !G.HOLDERS[raw.label]) return null;
  try {
    const v2 = G.toV2({ ...raw, size, height: '1H' });
    G.checkTiling(v2);
    const g = G.maxGrid(size);
    const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const f = raw.floor && typeof raw.floor === 'object' ? raw.floor : {};
    return {
      v: 2, label: G.HOLDERS[raw.label] ? raw.label : 'small',   // a layout saved before the Large holder used the original (gen.js holderOf)
      nc: int(raw.nc, 1, g.nc, G.defaultGrid(size).nc), nr: int(raw.nr, 1, g.nr, G.defaultGrid(size).nr),
      floor: { mode: FLOOR_MODES.includes(f.mode) ? f.mode : 'off', slots: f.slots === 4 ? 4 : 3 },
      comps: v2.comps.map((c) => ({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, holder: c.holder !== false, scoop: G.SCOOPS[c.scoop] ? c.scoop : 'std', tray: G.trayMM(c), color: int(c.color, 0, G.MAX_FLOOR_COLORS, 0) })),
    };
  } catch { return null; }
}
/* the layout a unit edits and draws: its own when it fits the unit's size, else the default grid */
export function layoutOf(L, u) {
  const size = sizeOfUnit(L, u);
  return cleanLayout(u.partsLayout, size) || defaultLayout(size);
}
const mode = (arr) => { const n = new Map(); let best = arr[0], k = 0; for (const v of arr) { const m = (n.get(v) || 0) + 1; n.set(v, m); if (m > k) { k = m; best = v; } } return best; };
export const keepOf = (comps) => ({ scoop: mode(comps.map((c) => c.scoop)), tray: mode(comps.map((c) => G.trayMM(c))) });
/* the layout moved to another size (the prototype's setSize, v24/v25): every wall line keeps its place in proportion,
   front to back and left to right, unless a compartment would get too small or a label would lose its holder; then the
   grid starts over, keeping the most common scoop and ramp. `note` says when it started over. The height is the unit's
   and changes nothing here (compartments are plan shapes). */
export function layoutForSize(layout, size0, size1) {
  const S0 = G.SIZES[size0], S1 = G.SIZES[size1];
  if (!S0 || !S1) return { layout: defaultLayout(size1, keepOf(layout.comps)), note: '' };
  if (size0 === size1) return { layout: clone(layout), note: '' };
  const L0 = { v: 2, size: size0, height: '1H', label: layout.label, comps: layout.comps };
  let moved = S1.D !== S0.D ? G.rescaleDepth(layout.comps, S0.D, S1.D) : clone(layout.comps);
  if (moved && S1.W !== S0.W) moved = G.rescaleWidth(moved, S0.W, S1.W);
  const keepsLabels = !!moved && moved.every((c, i) => !G.hasHolder(L0, layout.comps[i]) || G.holderStatus({ ...L0, size: size1, comps: moved }, c).ok);
  if (keepsLabels) {
    const g = G.maxGrid(size1);
    return { layout: { ...clone(layout), nc: Math.min(layout.nc, g.nc), nr: Math.min(layout.nr, g.nr), comps: moved }, note: '' };
  }
  const next = defaultLayout(size1, keepOf(layout.comps));
  next.label = layout.label; next.floor = clone(layout.floor);
  return { layout: next, note: 'The compartments would get too small for their labels, so the grid started over.' };
}
/* the full layout the generator reads: the unit's size and height on the record's layout, and the floor colours as hexes */
export function fullLayout(L, u, layout = layoutOf(L, u), hexes = FLOOR_DEFAULT_HEX) {
  const f = layout.floor || { mode: 'off', slots: 3 };
  const colors = f.mode === 'off' ? [] : f.mode === 'one' ? [hexes[0]] : hexes.slice(0, f.slots);
  return { v: 2, size: sizeOfUnit(L, u), height: heightOfUnit(u), label: layout.label, style: 'pyramid', floor: { mode: f.mode, colors }, comps: clone(layout.comps) };
}
/* what the geometry depends on: the size, height, label and each compartment's shape and features (not its colour) */
export const geomKey = (full) => JSON.stringify([full.size, full.height, full.label, full.comps.map((c) => [c.x0, c.x1, c.y0, c.y1, !!c.holder, c.scoop, G.trayMM(c)])]);
