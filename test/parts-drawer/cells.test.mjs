import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G } from '../lib/parts-drawer-env.mjs';

// Ported from the generator's validation/t_cells.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup.
test('parts drawer cells: wells, sockets and washer rows on the shipped 5x4, open, lidded, covered and coloured', async () => {
const { Manifold } = wasm, U = G.U, mm3 = (m) => m.volume() / U ** 3;
// Cells: nozzle and bit sockets (v18), washer rows (v19) and bearing wells (v20, replacing v18's posts), roomy and dense.
// Every drawer must build into one clean solid; every cell keeps 2 mm off its open floor's edges and under its height
// limit; roomy cells keep 8 mm clear between the parts you grip (5 dense) and half that to the open floor's edge, and
// wells keep the whole gap in front of and behind their notches; a well clears its bearing stack and its notches are
// narrower than the bearing; nothing a cell holds (a bearing stack, a nozzle, a bit, a row of washers, leaning over its end
// walls) may meet the lid (lips, stiffening ribs, pull) or a cover; the lid's pull stays out of cell compartments; a
// washer sits on both flanks of its groove; v18-v19 bearing posts open as wells; and a coloured floor goes round the cells,
// so the body stays one solid and the colour parts fill exactly what it gives up.
const S = G.SIZES['240-2W']; let bad = 0; const fail = (m) => { bad++; console.log('FAIL', m); };
const cases = [];
const shipped = (height, label = 'large') => ({ v: 2, size: '240-2W', height, label, comps: G.gridComps(S.shipped.cols, S.shipped.rows) });
const flat = { scoop: 'off', tray: 0 };
for (const height of ['0.5H', '1H', '1.5H', '2H']) for (const label of ['large', 'small']) for (const extra of [{}, { lid: true }, { covers: true }]) {
  const L = { ...shipped(height, label), ...extra };
  const set = [['wells', '625'], ['wells', 'F695'], ['nozzles'], ['bits'], ['wells', '608', 'dense'], ['wells', 'MR85'], ['posts', '623'], ['nozzles', 0, 'dense'], ['bits', 0, 'dense'], ['wells', 'LM8UU']];
  set.forEach(([cell, bearing, spacing], i) => { L.comps[i] = { ...L.comps[i], ...(i === 3 ? {} : flat), cell, ...(bearing ? { bearing } : {}), ...(spacing ? { spacing } : {}) }; });   // flat floors, as the page sets them (3 keeps its scoop)
  L.comps[10] = { ...L.comps[10], cell: 'wells', scoop: 'deep', tray: 6 };
  L.comps[11] = { ...L.comps[11], cell: 'nozzles', holder: false };
  ['M3', 'M5', 'M8', 'M2', 'M6'].forEach((washer, j) => { L.comps[12 + j] = { ...L.comps[12 + j], ...flat, cell: 'washers', washer }; });
  L.comps[17] = { ...L.comps[17], ...flat, cell: 'washers', item: { type: 'lockwasher', size: 'M4', length: 0, qty: 120 } };
  L.comps[18] = { ...L.comps[18], cell: 'washers', washer: 'M3', scoop: 'std', tray: 3 };   // from an old code: ramps kept
  L.comps[19] = { ...L.comps[19], ...flat, cell: 'washers', washer: 'M4', holder: false };
  cases.push([`${height} ${label} ${Object.keys(extra)[0] || 'open'}`, L]);
}
const big = { v: 2, size: '240-2W', height: '0.5H', label: 'large', comps: G.gridComps([75.75, 81.75], [110, 114.5]) };
big.comps[0] = { ...big.comps[0], ...flat, cell: 'wells', item: { type: 'bearing', size: 'F695-2RS', length: 0, qty: 20 } };
big.comps[1] = { ...big.comps[1], ...flat, cell: 'nozzles' }; big.comps[2] = { ...big.comps[2], ...flat, cell: 'bits' };
big.comps[3] = { ...big.comps[3], ...flat, cell: 'washers', washer: 'M8' };
for (const height of ['0.5H', '1H', '2H']) for (const extra of [{}, { lid: true }]) cases.push([`${height} big cells${extra.lid ? ' lid' : ''}`, { ...big, height, ...extra }]);
const bigDense = { ...big, comps: big.comps.map((c, i) => (i < 3 ? { ...c, spacing: 'dense' } : c)) };
for (const height of ['0.5H', '1H']) cases.push([`${height} big dense`, { ...bigDense, height }]);

// what a compartment's cells hold, as solids: a bearing stack, a nozzle or bit (the socket's diameter, as tall as it
// stands), a row of washers as tall as they stand and leaning out over the end walls by what stands above them
function held(L, p) {
  const out = [], F = G.C.FLOOR;
  if (p.kind === 'washers') {
    const { od } = p.washer, lean = p.top - p.h;
    for (const r of p.rows) {
      out.push(Manifold.cube([od * U, (r.y1 - r.y0) * U, p.top * U]).translate([(r.x - od / 2) * U, r.y0 * U, F * U]));
      out.push(Manifold.cube([od * U, (r.y1 - r.y0 + 2 * lean) * U, lean * U]).translate([(r.x - od / 2) * U, (r.y0 - lean) * U, (F + p.h) * U]));
    }
    return out;
  }
  if (p.kind === 'wells') {
    const [, D, B, Df] = G.bearingDims(p.bearing), rad = (Df || D) / 2;
    for (const [x, y] of p.pts) out.push(Manifold.cylinder(p.per * B * U, rad * U, rad * U, 48).translate([x * U, y * U, F * U]));
    return out;
  }
  const tall = G.CELLS[p.kind].holds, rad = p.foot / 2;
  for (const [x, y] of p.pts) out.push(Manifold.cylinder(tall * U, rad * U, rad * U, 32).translate([x * U, y * U, F * U]));
  return out;
}
// spacing: the gap between the parts you grip, and to the open floor's edge; wells: front to back and side by side
function spacingCheck(name, i, p, r) {
  const gap = G.CELL.GAP[p.spacing], e = 1e-6;
  if (p.kind === 'wells') {
    if (Math.abs(p.pitch - p.foot - gap) > e || Math.abs(p.pitchX - p.foot - G.CELL.SIDE) > e) fail(`${name} comp ${i}: wells ${p.pitchX} × ${p.pitch} apart`);
    for (const [, y] of p.pts) if (y - p.foot / 2 - r.y0 < gap - e || r.y1 - y - p.foot / 2 < gap - e) fail(`${name} comp ${i}: no finger room at a well's notch`);
    const [, D, B, Df] = G.bearingDims(p.bearing), k = G.CELLS.wells;
    if (p.notch >= D - e || p.notch < k.notchMin - e) fail(`${name} comp ${i}: notch ${p.notch} for a ${D} mm bearing`);
    if (p.count && (p.h >= p.per * B - e || p.h < 0.7 * B - e)) fail(`${name} comp ${i}: well ${p.h} tall for ${p.per} × ${B}`);
    if (Math.abs(p.foot - ((Df || D) + k.clear + 2 * k.wall)) > e) fail(`${name} comp ${i}: well ${p.foot} across`);
    if (p.h > k.wallMax + e) fail(`${name} comp ${i}: well wall ${p.h} over ${k.wallMax}`);
    for (const [x] of p.pts) if (x - p.foot / 2 - k.chamfer - r.x0 < 0.2 - e || r.x1 - x - p.foot / 2 - k.chamfer < 0.2 - e) fail(`${name} comp ${i}: a well's foot off the open floor`);
    return;
  }
  const k = G.CELLS[p.kind];
  if (p.pitch - k.grip < gap - e || p.pitch - k.od < 1.5 - e) fail(`${name} comp ${i}: sockets ${p.pitch} apart`);
  for (const [x, y] of p.pts) {
    const edge = Math.min(x - r.x0, r.x1 - x, y - r.y0, r.y1 - y);
    if (edge < (k.grip + gap) / 2 - e) fail(`${name} comp ${i}: an outer socket short of half a gap to the edge`);
    if (edge - k.od / 2 - k.foot < 0.2 - e) fail(`${name} comp ${i}: a socket's foot off the open floor`);
  }
}
// a socket has its foot: the band just outside it, low down, is solid all round
function socketFoot(name, i, m, p) {
  const k = G.CELLS[p.kind], ro = k.od / 2, [x, y] = p.pts[0];
  const ring = Manifold.cylinder(0.3 * U, (ro + 0.7) * U, (ro + 0.7) * U, 96).subtract(Manifold.cylinder(0.5 * U, (ro + 0.15) * U, (ro + 0.15) * U, 96).translate([0, 0, -0.1 * U])).translate([x * U, y * U, (G.C.FLOOR + 0.1) * U]);
  const fv = mm3(m.intersect(ring)), rv = mm3(ring); ring.delete();
  if (fv < 0.98 * rv) fail(`${name} comp ${i}: no foot round a socket (${fv.toFixed(2)} of ${rv.toFixed(2)} mm3 solid)`);
}
// a well clears its bearing stack (a cylinder of the bearing's widest diameter, as tall as the stack), has its foot (the
// band just outside the wall, low down, is solid on both arcs) and keeps its notch open to the floor
function wellCheck(name, i, m, p) {
  const [, D, B, Df] = G.bearingDims(p.bearing), rad = (Df || D) / 2, k = G.CELLS.wells, ro = p.foot / 2;
  const stacks = Manifold.union(p.pts.map(([x, y]) => Manifold.cylinder(p.per * B * U, rad * U, rad * U, 96).translate([x * U, y * U, (G.C.FLOOR + 0.01) * U])));
  const v = mm3(m.intersect(stacks)); stacks.delete();
  if (v > 1e-6) fail(`${name} comp ${i}: a ${p.bearing} stack meets its well (${v.toFixed(5)} mm3)`);
  const [x, y] = p.pts[0], band = Manifold.cube([p.notch * U, (p.foot + 2 * k.chamfer + 2) * U, 30 * U]).translate([(x - p.notch / 2) * U, (y - ro - k.chamfer - 1) * U, (G.C.FLOOR + 0.01) * U]);
  const ring = Manifold.cylinder(0.4 * U, (ro + 1.0) * U, (ro + 1.0) * U, 96).subtract(Manifold.cylinder(0.6 * U, (ro + 0.2) * U, (ro + 0.2) * U, 96).translate([0, 0, -0.1 * U])).translate([x * U, y * U, (G.C.FLOOR + 0.1) * U]).subtract(band);
  const fv = mm3(m.intersect(ring)), rv = mm3(ring); ring.delete();
  if (fv < 0.98 * rv) fail(`${name} comp ${i}: no foot round a well (${fv.toFixed(2)} of ${rv.toFixed(2)} mm3 solid)`);
  const nv = mm3(m.intersect(band)); band.delete();
  if (nv > 1e-6) fail(`${name} comp ${i}: a well's notch isn't open to the floor (${nv.toFixed(4)} mm3)`);
}
// a washer seated in its groove: a disc a hair smaller clears the drawer, the full disc 0.2 mm lower meets both flanks
function seatCheck(name, i, m, p) {
  const k = G.CELLS.washers, th = k.angle * Math.PI / 180, rw = p.washer.od / 2, r = p.rows[0], y = (r.y0 + r.y1) / 2;
  const zc = G.C.FLOOR - k.sink + rw / Math.cos(th);
  const disc = (rad, z) => Manifold.cylinder(p.washer.t * U, rad * U, rad * U, 96).rotate([90, 0, 0]).translate([r.x * U, (y + p.washer.t / 2) * U, z * U]);
  const a = disc(rw - 0.05, zc), b = disc(rw, zc - 0.2);
  const va = mm3(m.intersect(a)), parts = m.intersect(b).decompose(), vb = parts.map(mm3).filter((v) => v > 1e-4);
  if (va > 1e-6) fail(`${name} comp ${i}: a ${p.washer.what} disc in its groove meets the drawer (${va.toFixed(5)} mm3)`);
  if (vb.length < 2) fail(`${name} comp ${i}: a lowered ${p.washer.what} disc meets ${vb.length} flank(s), not both`);
  for (const s of [a, b]) s.delete();
}

for (const [name, L] of cases) {
  const t0 = Date.now(), m = G.buildDrawer(wasm, L, assets), ms = Date.now() - t0, pieces = m.decompose().length;
  if (m.status() !== 'NoError' || pieces !== 1) fail(`${name}: ${m.status()} ${pieces} pieces`);
  const top = S.heights[L.height].top, lid = L.lid ? G.lidPull(L) : null;
  const notes = [], hold = [];
  L.comps.forEach((c, i) => {
    const p = G.cellPlan(L, c); if (!p) return;
    if (lid && lid.comp === i) fail(`${name}: lid pull over cell ${i}`);
    const r = G.openFloorRect(L, c);
    for (const [x, y] of p.pts) if (x - p.foot / 2 < r.x0 + 2 - 1e-6 || x + p.foot / 2 > r.x1 - 2 + 1e-6 || y - p.foot / 2 < r.y0 + 2 - 1e-6 || y + p.foot / 2 > r.y1 - 2 + 1e-6) fail(`${name} comp ${i}: cell off the open floor`);
    const covered = L.covers && G.isCovered(L, c), lr = L.lid ? G.lidRing(L, c) : null, ribbed = lr && (lr.nx > 0 || lr.ny > 0);
    let limit = top - G.C.FLOOR - (covered ? 3.3 : (ribbed ? 2 : 0) + 0.5);
    if (p.kind === 'washers' && L.lid) limit = Math.min(limit, top - G.C.FLOOR - G.LID.LIP_H - 0.5);
    const tallest = p.kind === 'wells' ? p.per * G.bearingDims(p.bearing)[2] : p.kind === 'washers' ? p.top : G.CELLS[p.kind].holds;
    if (c.cell === 'posts' && p.kind !== 'wells') fail(`${name} comp ${i}: bearing posts didn't open as wells`);
    if (p.kind !== 'washers') spacingCheck(name, i, p, r);
    if (p.kind === 'wells' && p.count) wellCheck(name, i, m, p);
    if ((p.kind === 'nozzles' || p.kind === 'bits') && p.count) socketFoot(name, i, m, p);
    if (p.count && tallest > limit + 1e-6) fail(`${name} comp ${i}: holds ${tallest} over ${limit}`);
    if (p.count && p.h > limit + 1e-6) fail(`${name} comp ${i}: built ${p.h} over ${limit}`);
    if (p.kind === 'washers' && p.count) {
      for (const w of p.rows) if (w.y0 < r.y0 + 2 - 1e-6 || w.y1 > r.y1 - 2 + 1e-6 || w.y1 - w.y0 < p.washer.od - 1e-6) fail(`${name} comp ${i}: washer row off the open floor`);
      if (p.capacity < p.count) fail(`${name} comp ${i}: rows hold ${p.capacity}`);
      seatCheck(name, i, m, p);
    }
    if (p.count) hold.push(...held(L, p));
    notes.push(`${i}:${p.kind}${p.bearing ? ' ' + p.bearing : ''}${p.washer ? ' ' + p.washer.what.replace(' washers', '') : ''}${p.spacing === 'dense' ? ' dense' : ''} ${p.count}${p.kind === 'wells' || p.kind === 'washers' ? 'x' + p.per : ''}${p.why ? ' (' + p.why + ')' : ''}`);
  });
  // what the cells hold against the lid and the covers (against the drawer: seatCheck; a post or socket stands inside
  // what it holds, and a leaning washer may rest on a wall)
  const H = hold.length ? Manifold.union(hold) : null; hold.forEach((s) => s.delete());
  let against = '';
  if (L.lid) {
    const lidM = G.buildLid(wasm, L), dv = mm3(m.intersect(lidM)), hv = H ? mm3(lidM.intersect(H)) : 0;
    if (dv > 1e-6) fail(`${name}: lid meets the drawer (${dv.toFixed(4)} mm3)`);
    if (hv > 1e-6) fail(`${name}: lid meets what the cells hold (${hv.toFixed(4)} mm3)`);
    against = ' lid clear'; lidM.delete();
  }
  if (L.covers) {
    let n = 0;
    L.comps.forEach((c, i) => {
      if (!c.cell || !G.isCovered(L, c)) return;
      const cv = G.buildCover(wasm, L, i); if (!cv) return; n++;
      const dv = mm3(m.intersect(cv)), hv = H ? mm3(cv.intersect(H)) : 0;
      if (dv > 1e-6) fail(`${name} comp ${i}: cover meets the drawer (${dv.toFixed(4)} mm3)`);
      if (hv > 1e-6) fail(`${name} comp ${i}: cover meets what the cells hold (${hv.toFixed(4)} mm3)`);
      cv.delete();
    });
    against = ` ${n} covers clear`;
  }
  if (H) H.delete();
  console.log(name.padEnd(20), `${ms} ms`, 'g', G.grams(m).toFixed(1), against, '|', notes.join(' | '));
  if (name === '0.5H big cells' || name === '1H big cells') fs.writeFileSync(`out/cells_${name.split(' ')[0]}.stl`, Buffer.from(G.toSTL(m.getMesh())));
  if (name === '0.5H large open') fs.writeFileSync('out/cells_washers_0.5H.stl', Buffer.from(G.toSTL(m.getMesh())));
  m.delete();
}

// coloured floors: one colour everywhere, and painted
for (const mode of ['one', 'paint']) {
  const L = { ...shipped('0.5H'), floor: { mode, colors: ['#ff8800', '#2266ff', '#22aa55'] } };
  ['wells', 'nozzles', 'bits', 'washers', 'wells'].forEach((cell, i) => { L.comps[i] = { ...L.comps[i], ...flat, cell, color: 1 + (i % 3), ...(i === 4 ? { spacing: 'dense', bearing: 'MR85' } : {}) }; });
  L.comps[5] = { ...L.comps[5], color: 2 };
  const drawer = G.buildDrawer(wasm, L, assets), { body, floors } = G.buildParts(wasm, L, assets);
  const bp = body.decompose().length, vol = mm3(body) + floors.reduce((s, f) => s + mm3(f.part), 0), dv = vol - mm3(drawer);
  const ov = floors.reduce((s, f) => s + mm3(body.intersect(f.part)), 0);
  if (bp !== 1) fail(`colour ${mode}: body in ${bp} pieces`);
  if (Math.abs(dv) > 1e-3) fail(`colour ${mode}: parts add up to ${dv.toFixed(4)} mm3 more than the drawer`);
  if (ov > 1e-3) fail(`colour ${mode}: body and colour parts overlap ${ov.toFixed(4)} mm3`);
  // v27: washer rows take the floor colour up through their ribs; the body keeps nothing over the ribbed floor, the end
  // walls stay body colour
  const wr = G.floorRects(L).find((r) => r.comp === 3);
  if (!wr || !wr.ribs) fail(`colour ${mode}: washer rows took no floor colour`);
  else {
    const fp = floors.find((f) => f.color === wr.color).part, top = fp.boundingBox().max[2] / U;
    if (Math.abs(top - wr.ribs) > 1e-3) fail(`colour ${mode}: the washer rows' colour stops at ${top.toFixed(3)}, not the rib tops ${wr.ribs}`);
    const rb = Manifold.cube([(wr.x1 - wr.x0) * U, (wr.y1 - wr.y0) * U, (wr.ribs + 1 - (G.C.FLOOR - G.SKIN) + 0.0) * U]).translate([wr.x0 * U, wr.y0 * U, (G.C.FLOOR - G.SKIN) * U]);
    const left = mm3(body.intersect(rb)), inPart = mm3(fp.intersect(rb));
    if (left > 1e-3) fail(`colour ${mode}: ${left.toFixed(4)} mm3 of body left on the washer rows`);
    if (Math.abs(inPart - wr.vol) > 0.001 * wr.vol) fail(`colour ${mode}: washer row colour ${inPart.toFixed(2)} mm3, the estimate says ${wr.vol.toFixed(2)}`);
    const ends = G.cellPlan(L, L.comps[3]);
    if (mm3(fp.intersect(Manifold.cube([30 * U, 2 * U, 10 * U]).translate([wr.x0 * U, (wr.y0 - 2) * U, G.C.FLOOR * U]))) > 1e-3) fail(`colour ${mode}: the front end wall took the floor colour`);
    console.log(`  washer rows coloured to ${top.toFixed(2)} (${ends.washer.what}), colour ${inPart.toFixed(1)} mm3, estimate ${wr.vol.toFixed(1)}`);
  }
  console.log(`colour ${mode}`.padEnd(20), 'body pieces', bp, 'colour parts', floors.map((f) => f.part.decompose().length).join('/'), 'volume', dv.toFixed(4), 'overlap', ov.toFixed(4));
}
console.log(bad ? `${bad} FAILED` : 'cell tests pass');

assert.equal(bad, 0, bad + ' cell checks failed');
});
