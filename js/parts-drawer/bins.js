/* THE BIN GRID (2026-11-09, Joey: "i want it to almost feel like sorting gridfinity bins by hand ... you pick them up and move
   them around"; consult Sol 01a1c0ba, DECISIONS "The parts list as bins on a grid"). The parts list's proposal is a grid of
   cells, and every part is a BIN of whole cells that stays where it is put: nothing moves unless the person moves it.
   - A cell is the shipped compartment (the default grid: label-wide columns, rows about 56 mm deep, a 240-2W's 5 x 4), so
     every bin has room for a finger and its label; coarser where a tall drawer needs reach; the same with labels off.
   - A bin's recommended size is the fewest cells whose clear size takes the part's longest piece and whose room holds the
     count at the chosen room (the estimator's own numbers, inventory.js roomNeeded); among equals the squarest, then the
     wider (shallower front to back).
   - A new bin goes in the first free spot from the front-left: the front row first, then the left.
   - The leftover cells become spare compartments: as few rectangles as a greedy sweep finds (front row first, each as wide
     and then as deep as the free cells allow), or one per cell.
   Bins are { c, r, w, h } in cells (c from the left, r from the front). Pure: no DOM. */
import * as G from './gen.js';
import * as I from './inventory.js';

const WALL = G.C.WALL, EPS = 1e-6;

export function binGrid(size, height, label = 'large') {
  const S = G.SIZES[size], reach = G.isTall(size, height) ? G.reachMin(size, height) : 0, H = G.holderOf({ label });
  const minW = Math.max(G.C.HOLDER_W, reach), minD = Math.max(H.MIN_DEPTH, reach);
  // a cell is the shipped compartment (gen.js defaultGrid: label-wide columns, rows about 56 deep), never the densest grid a
  // label fits: at 30.6 x 26.9 the label holder filled the cell and left no room for a finger (Joey, 2026-11-09: "i don't think
  // you are going to be able to get a finger in this small of a cell"); coarser still where a tall drawer needs reach
  const dg = G.defaultGrid(size);
  const nc = Math.max(1, Math.min(dg.nc, Math.floor((S.W + WALL) / (minW + WALL) + 1e-9)));
  const nr = Math.max(1, Math.min(8, dg.nr, Math.floor((S.D + WALL) / (minD + WALL) + 1e-9)));
  return { size, height, label, nc, nr, W: S.W, D: S.D, reach, cells: G.evenGrid(size, nc, nr) };
}
export const gridKey = (g) => `${g.size}|${g.height}|${g.label}|${g.nc}x${g.nr}`;
export const cellOf = (g, c, r) => g.cells[r * g.nc + c];
export const inGrid = (g, b) => b.c >= 0 && b.r >= 0 && b.w >= 1 && b.h >= 1 && b.c + b.w <= g.nc && b.r + b.h <= g.nr;
// a block's clear rectangle in mm (the cells merged: the walls between them are gone)
export function rectOf(g, b) { const a = cellOf(g, b.c, b.r), z = cellOf(g, b.c + b.w - 1, b.r + b.h - 1); return { x0: a.x0, x1: z.x1, y0: a.y0, y1: z.y1 }; }
// the cell under a plan point (mm, front y = 0), clamped to the grid; null off the drawer
export function cellAt(g, pt) {
  if (!pt || pt.x < -2 || pt.x > g.W + 2 || pt.y < -4.3 || pt.y > g.D + 4) return null;
  const k = (v, span, n) => Math.max(0, Math.min(n - 1, Math.floor((v + WALL / 2) / ((span + WALL) / n))));
  return { c: k(pt.x, g.W, g.nc), r: k(pt.y, g.D, g.nr) };
}

// what a part asks of a bin: the room to hold it at the chosen room (vol), the counted room (raw, for the fill), its longest
// piece (long, and along: front to back with the label holder) and its narrow side (side, depth)
const usableH = (g) => Math.max(4, G.SIZES[g.size].heights[g.height].top - G.C.FLOOR - 3) * 0.85;
export function needOf(it, g, { fillCap = 1, roundTo = null, labels = true } = {}) {
  const o = { size: g.size, height: g.height, label: labels ? g.label : null, fillCap };
  const sized = roundTo === 'bag' && it.qty > 0 ? { ...it, qty: I.bagUp(it.qty) } : it;
  const r = I.roomNeeded(sized, o), counted = roundTo === 'bag' ? I.roomNeeded(it, o).vol : r.vol;
  return { vol: r.vol / r.cap, raw: counted, cap: r.cap, long: r.long, side: r.side, depth: r.depth, along: r.long + (r.depth - r.side), tall: !!r.tooTall };
}
// how a block of w x h cells meets a need: foot (its longest piece lies in it), load (the need over the room: over 1 is over
// the room chosen), fill (the counted parts over the room)
export function blockFit(n, g, w, h) {
  const r = rectOf(g, { c: 0, r: 0, w, h }), bw = r.x1 - r.x0, bd = r.y1 - r.y0, capV = bw * bd * usableH(g);
  const foot = (bw >= n.long - EPS && bd >= n.depth - EPS) || (bd >= n.along - EPS && bw >= n.side - EPS);
  return { foot, load: n.vol / capV, fill: n.raw / capV, bw, bd };
}
// the recommended bin for a part, or { why } when this drawer has none
export function binSize(it, g, opts = {}) {
  const n = needOf(it, g, opts);
  if (n.tall) return { why: `too tall to lie in a ${g.height} drawer` };
  let best = null, foot = false;
  for (let h = 1; h <= g.nr; h++) for (let w = 1; w <= g.nc; w++) {
    const f = blockFit(n, g, w, h); if (!f.foot) continue; foot = true; if (f.load > 1 + 1e-9) continue;
    const key = [w * h, Math.abs(Math.log(f.bw / f.bd)), -w];
    if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] - 1e-9 || (Math.abs(key[1] - best.key[1]) <= 1e-9 && key[2] < best.key[2])))) best = { w, h, key };
  }
  if (best) return { w: best.w, h: best.h };
  return { why: foot ? 'needs more room than this whole drawer has' : 'too long for this drawer' };
}
// the smallest bin its longest piece lies in (resizing never goes below it)
export function footMin(it, g, opts = {}) { const n = needOf(it, g, opts); return (w, h) => blockFit(n, g, w, h).foot; }

// which part holds each cell (bins: a Map item -> bin); skip: a part whose own cells count as free
export function occupancy(g, bins, skip = null) {
  const occ = new Array(g.nc * g.nr).fill(null);
  for (const [it, b] of bins) { if (it === skip || !inGrid(g, b)) continue; for (let r = b.r; r < b.r + b.h; r++) for (let c = b.c; c < b.c + b.w; c++) occ[r * g.nc + c] = it; }
  return occ;
}
export function freeFor(g, bins, b, skip = null) {
  if (!inGrid(g, b)) return false;
  const occ = occupancy(g, bins, skip);
  for (let r = b.r; r < b.r + b.h; r++) for (let c = b.c; c < b.c + b.w; c++) if (occ[r * g.nc + c]) return false;
  return true;
}
export function firstFree(g, bins, w, h, skip = null) {
  for (let r = 0; r + h <= g.nr; r++) for (let c = 0; c + w <= g.nc; c++) if (freeFor(g, bins, { c, r, w, h }, skip)) return { c, r, w, h };
  return null;
}
// the leftover cells as rectangles: perCell, one each; else a greedy sweep from the front-left, each as wide, then as deep, as free
export function spareRects(g, bins, perCell = false) {
  const occ = occupancy(g, bins), taken = occ.map(Boolean), out = [];
  const free = (c, r) => !taken[r * g.nc + c];
  for (let r = 0; r < g.nr; r++) for (let c = 0; c < g.nc; c++) {
    if (!free(c, r)) continue;
    let w = 1, h = 1;
    if (!perCell) {
      while (c + w < g.nc && free(c + w, r)) w++;
      while (r + h < g.nr && [...Array(w).keys()].every((i) => free(c + i, r + h))) h++;
    }
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) taken[y * g.nc + x] = true;
    out.push({ c, r, w, h });
  }
  return out;
}
// the drawer's compartments from the bins and the spare rectangles, in reading order; a bin's compartment carries a copy of
// its part (item) and the part itself (src, for the card it belongs to)
export function binComps(g, bins, { labels = true, scoop = 'std', perCell = false } = {}) {
  const out = [];
  for (const [it, b] of bins) {
    if (!inGrid(g, b)) continue;
    const r = rectOf(g, b), T = I.TYPES[it.type] || {};
    out.push({ ...G.comp(r.x0, r.x1, r.y0, r.y1, { holder: labels, scoop: T.discrete ? 'off' : scoop }), item: { ...it }, src: it });
  }
  for (const s of spareRects(g, bins, perCell)) { const r = rectOf(g, s); out.push(G.comp(r.x0, r.x1, r.y0, r.y1, { holder: labels, scoop })); }
  return out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}
// a laid-out drawer's compartments back as bins: each wall on a grid line (0.06 mm), else null (the layout is not this grid's)
export function binsOf(g, comps) {
  const X0 = g.cells.slice(0, g.nc).map((c) => c.x0), X1 = g.cells.slice(0, g.nc).map((c) => c.x1);
  const Y0 = [...Array(g.nr).keys()].map((r) => cellOf(g, 0, r).y0), Y1 = [...Array(g.nr).keys()].map((r) => cellOf(g, 0, r).y1);
  const at = (v, list) => list.findIndex((x) => Math.abs(x - v) < 0.06);
  const out = [];
  for (const k of comps) {
    const c0 = at(k.x0, X0), c1 = at(k.x1, X1), r0 = at(k.y0, Y0), r1 = at(k.y1, Y1);
    if (c0 < 0 || c1 < c0 || r0 < 0 || r1 < r0) return null;
    out.push({ comp: k, bin: { c: c0, r: r0, w: c1 - c0 + 1, h: r1 - r0 + 1 } });
  }
  return out;
}
// where a bin is, in words: "front row, 2nd from the left" (the person's words, not cell numbers)
export function whereOf(g, b) {
  const ord = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
  const row = b.r === 0 ? 'front row' : b.r + b.h === g.nr ? 'back row' : `${ord(b.r + 1)} row from the front`;
  const col = b.c === 0 ? 'at the left' : b.c + b.w === g.nc ? 'at the right' : `${ord(b.c + 1)} from the left`;
  return `${row}, ${col}`;
}
