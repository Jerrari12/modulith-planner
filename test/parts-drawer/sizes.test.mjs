import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G, I, Mk, v23 } from '../lib/parts-drawer-env.mjs';

// Ported from the generator's validation/t_sizes.mjs (M0, 2026-11-04): the body is the script's, less its own engine and asset setup.
test('parts drawer sizes: every length at every width, the shells, grids, reach rule, codes, lid, covers and mark', async () => {
const { Manifold } = wasm, U = G.U, mm3 = (m) => m.volume() / U ** 3;
// Every drawer size: the six collection lengths (v24) at 1W to 4W (v25; the 59 at 1W and 2W), each at its heights (59:
// 0.5H and 1H; the rest up to 2H). Shells: every one but the two Fusion shells is made by G.shellFor. Widths first, for
// the 240 at 0.5H and 1H: one clean solid, 88 x W - 13 wide; its left end (to the first column centre) exactly the 2W's,
// each 88 mm period the 2W's period moved over, its right end the 2W's moved; its volume the 2W's plus a period per
// added width; no vertex in the bands the length and height stretches use. Then per size and height: one clean solid;
// outside 88 x W - 13 wide, 4.3 in front and 4 behind the cavity, rim where SIZES says; its front 15 mm is the same
// width's 240 exactly and its back that 240's moved by the length difference; a 1 mm slice through the straight band
// is that 240's; its volume is that 240's plus that slice times the length difference. The 240-2W tall shells equal
// the v23 assets (the 2H inside its groove floors, which v25 makes 0.4 shallower: t_heights.mjs).
// Then per size and height: the default grid and the densest reachable grid build as one solid; at the tall heights
// every compartment of the reachable grid passes the reach rule and one more column or row would not; a parts list laid
// out there keeps every compartment reachable or says how many it holds. Layouts move between lengths (rescaleDepth),
// layout codes carry the size (and leave 240-2W codes as they were), the lid and covers build at other lengths and
// widths, and so does the bottom mark.
let bad = 0; const fail = (m) => { bad++; console.log('FAIL', m); };
const box = (x0, y0, z0, x1, y1, z1) => Manifold.cube([Math.round((x1 - x0) * U), Math.round((y1 - y0) * U), Math.round((z1 - z0) * U)]).translate([Math.round(x0 * U), Math.round(y0 * U), Math.round(z0 * U)]);
const part = (m, y0, y1, dy = 0) => { const b = box(-10, y0, -1, 360, y1, 200), r = m.intersect(b); b.delete(); return dy ? r.translate([0, Math.round(dy * U), 0]) : r; };
const xpart = (m, x0, x1, dx = 0) => { const b = box(x0, -10, -1, x1, 300, 200), r = m.intersect(b); b.delete(); return dx ? r.translate([Math.round(dx * U), 0, 0]) : r; };
const bandVerts = (m) => { const mesh = m.getMesh(), np = mesh.numProp, V = mesh.vertProperties; let y = 0, z = 0; for (let i = 0; i < V.length; i += np) { const vy = V[i + 1] / U, vz = V[i + 2] / U; if (vy > 15.44 && vy < 217.66) y++; if (vz > 13.08 && vz < 28.84) z++; } return { y, z }; };
const sameAs = (a, b) => { const d1 = a.subtract(b), d2 = b.subtract(a), v = mm3(d1) + mm3(d2); d1.delete(); d2.delete(); return v; };
const FRONT = 15.43, BACK = 217.67;
// widths (v25)
for (const base of ['0.5H', '1H']) {
  const two = assets.shells[base], [c1, c2] = G.COLUMNS, period = mm3(xpart(two, c1, c2));
  for (const w of [1, 3, 4]) {
    const s = G.widthShell(wasm, assets, base, w), bb = s.boundingBox(), wide = (bb.max[0] - bb.min[0]) / U;
    if (s.status() !== 'NoError' || s.decompose().length !== 1) fail(`${w}W ${base}: ${s.status()} ${s.decompose().length} bodies`);
    if (Math.abs(wide - (88 * w - 13)) > 1e-3) fail(`${w}W ${base}: ${wide} wide`);
    const ends = sameAs(xpart(s, -10, c1), xpart(two, -10, c1)) + sameAs(xpart(s, c2 + 88 * (w - 2), 400), xpart(two, c2, 400, 88 * (w - 2)));
    let periods = 0; for (let k = 0; k < w - 1; k++) periods += sameAs(xpart(s, c1 + 88 * k, c2 + 88 * k), xpart(two, c1, c2, 88 * k));
    const dv = mm3(s) - mm3(two) - (w - 2) * period, bv = bandVerts(s);
    if (ends > 1e-3 || periods > 1e-3 || Math.abs(dv) > 1e-2) fail(`${w}W ${base}: ends ${ends} periods ${periods} volume ${dv}`);
    if (bv.y || (base === '1H' && bv.z)) fail(`${w}W ${base}: vertices in the stretch bands (y ${bv.y}, z ${bv.z})`);
    console.log(`${w}W from 2W at ${base}: one solid ${wide.toFixed(1)} wide; ends and ${w - 1} period(s) exactly the 2W's; volume 2W ${w > 2 ? '+' : '-'} ${Math.abs(w - 2)} x ${period.toFixed(1)} mm3; stretch bands clear`);
  }
}
for (const [size, S] of Object.entries(G.SIZES)) {
  for (const [h, H] of Object.entries(S.heights)) {
    const s = G.shellFor(wasm, assets, size, h), ref = G.shellFor(wasm, assets, `240-${S.w}W`, h), dy = S.length - 240, bb = s.boundingBox();
    const e = [bb.min[0], bb.max[0], bb.min[1], bb.max[1], bb.min[2], bb.max[2]].map((v) => v / U);
    if (s.status() !== 'NoError' || s.decompose().length !== 1) fail(`${size} ${h}: ${s.status()} ${s.decompose().length} bodies`);
    const want = [-2, S.W + 2, -4.3, S.D + 4, 0, H.rim];
    if (e.some((v, i) => Math.abs(v - want[i]) > 1e-3)) fail(`${size} ${h}: outside ${e.map((v) => v.toFixed(2))} want ${want}`);
    const front = sameAs(part(s, -10, FRONT), part(ref, -10, FRONT)), back = sameAs(part(s, BACK + dy, 300), part(ref, BACK, 300, dy));
    const slice = mm3(part(s, 16, 17)) - mm3(part(ref, 16, 17)), band = mm3(part(ref, 16, 17));   // inside every size's straight band
    const dv = mm3(s) - mm3(ref) - band * dy;
    if (front > 1e-3 || back > 1e-3 || Math.abs(slice) > 1e-3 || Math.abs(dv) > 1e-2) fail(`${size} ${h}: front ${front} back ${back} slice ${slice} volume ${dv}`);
    if (size === '240-2W' && v23[h]) {   // the v23 files are the plain stretch; the 2H differs from it only on its groove floors (v25, t_heights.mjs)
      const inner = (m) => m.intersect(box(-1.15, -10, -1, S.W + 1.15, 300, 200)), d = h === '2H' ? sameAs(inner(s), inner(v23[h])) : sameAs(s, v23[h]);
      if (d > 1e-3) fail(`240 ${h} differs from the v23 asset by ${d} mm3`); }
    // the default grid and, at the tall heights, the densest reachable grid
    const g = G.defaultGrid(size), L = { v: 2, size, height: h, label: 'large', comps: G.evenGrid(size, g.nc, g.nr) };
    const d1 = G.buildDrawer(wasm, L, assets); const ok1 = d1.status() === 'NoError' && d1.decompose().length === 1; const g1 = G.grams(d1); d1.delete();
    if (!ok1) fail(`${size} ${h}: default ${g.nc}x${g.nr} not one solid`);
    let note = '';
    if (G.isTall(size, h)) {
      const r = G.reachableGrid(size, h), Lr = { ...L, comps: G.evenGrid(size, r.nc, r.nr) };
      if (G.reachFlags(Lr).some(Boolean)) fail(`${size} ${h}: the reachable grid ${r.nc}x${r.nr} has a compartment too narrow`);
      const more = [[r.nc + 1, r.nr], [r.nc, r.nr + 1]].filter(([a, b]) => (S.W - (a - 1) * 1.5) / a >= 12 && (S.D - (b - 1) * 1.5) / b >= 12);
      for (const [a, b] of more) if (!G.reachFlags({ ...L, comps: G.evenGrid(size, a, b) }).some(Boolean)) fail(`${size} ${h}: ${a}x${b} is reachable too, so ${r.nc}x${r.nr} isn't the densest`);
      const dr = G.buildDrawer(wasm, Lr, assets); if (dr.status() !== 'NoError' || dr.decompose().length !== 1) fail(`${size} ${h}: reachable grid not one solid`); dr.delete();
      // a parts list keeps every compartment reachable, or says how many fit
      for (const kit of Object.keys(I.KITS)) {
        const res = I.layoutFor(I.KITS[kit].items, { size, height: h, label: 'large' });
        if (res.error) { if (!/won't fit a .* drawer: to reach into/.test(res.error) && !/too long|more than one drawer/.test(res.error)) fail(`${size} ${h} ${kit}: ${res.error}`); continue; }
        const Lk = { ...L, comps: res.comps };
        try { G.checkTiling(Lk); } catch (err) { fail(`${size} ${h} ${kit}: ${err.message}`); }
        if (G.reachFlags(Lk).some(Boolean)) fail(`${size} ${h} ${kit}: a parts-list compartment is too narrow to reach into`);
      }
      note = `reachable ${r.nc}x${r.nr} (needs ${G.reachMin(size, h)} across)`;
    }
    console.log(`${size.padEnd(7)} ${h.padEnd(4)} shell ok, D ${S.D}, rim ${H.rim}${H.stretched ? ' (stretched)' : ''}; default ${g.nc}x${g.nr} ${g1.toFixed(0)} g ${note}`);
  }
}
// moving a layout between sizes: depth, then width
const S240 = G.SIZES['240-2W'], shipped = G.gridComps(S240.shipped.cols, S240.shipped.rows);
const move = (comps, A, B) => { const d = A.D !== B.D ? G.rescaleDepth(comps, A.D, B.D) : comps; return d && A.W !== B.W ? G.rescaleWidth(d, A.W, B.W) : d; };
for (const size of Object.keys(G.SIZES)) {
  const S = G.SIZES[size], moved = move(shipped, S240, S);
  if (!moved) { console.log(`shipped 5x4 -> ${size}: too small, starts over`); if (!/^(59|115)-|-1W$/.test(size)) fail(`shipped 5x4 should move to ${size}`); continue; }
  try { G.checkTiling({ size, comps: moved }); } catch (err) { fail(`shipped 5x4 -> ${size}: ${err.message}`); }
  const rows = [...new Set(moved.map((c) => (c.y1 - c.y0).toFixed(1)))].join(', '), cols = [...new Set(moved.map((c) => (c.x1 - c.x0).toFixed(1)))].join(', ');
  const back = move(moved, S, S240), drift = back ? Math.max(...back.map((c, i) => Math.max(...['x0', 'x1', 'y0', 'y1'].map((k) => Math.abs(c[k] - shipped[i][k]))))) : Infinity;
  if (drift > 0.2) fail(`shipped 5x4 -> ${size} -> 240-2W drifts ${drift} mm`);
  console.log(`shipped 5x4 -> ${size}: columns ${cols}, rows ${rows}; and back to 240-2W within ${drift.toFixed(2)} mm`);
}
// layout codes: a 240 layout's code is what it was; another size's carries it
const st240 = { height: '1H', label: 'large', comps: shipped }, st115 = { ...st240, size: '115-2W', comps: G.evenGrid('115-2W', 5, 2) }, st3 = { ...st240, size: '240-3W', comps: G.evenGrid('240-3W', 7, 4) };
const k240 = Mk.canonical(st240), k115 = Mk.canonical(st115), k3 = Mk.canonical(st3);
if ('s' in k240 || 's' in Mk.canonical({ ...st240, size: '240-2W' })) fail('a 240 layout code changed');
if (k115.s !== '115-2W' || Mk.fromCanonical(k115).size !== '115-2W' || Mk.fromCanonical(k240).size !== '240-2W' || Mk.fromCanonical(k3).size !== '240-3W') fail('layout code size round trip');
if (Mk.canonical({ ...st240, size: '240-2W' }) && JSON.stringify(Mk.canonical(st240)) !== JSON.stringify(Mk.canonical({ ...st240, size: '240-2W' }))) fail('240 with and without size differ');
console.log('codes: 240 unchanged, other sizes carry s:', JSON.stringify(k115).slice(0, 60));
// lid and covers at other lengths
for (const [size, h, nc, nr] of [['59-2W', '0.5H', 5, 1], ['115-2W', '1H', 4, 2], ['270-2W', '2H', 2, 4], ['59-1W', '0.5H', 2, 1], ['240-1W', '1H', 2, 4], ['165-3W', '1.5H', 5, 3], ['270-4W', '2H', 5, 4], ['240-4W', '0.5H', 10, 4]]) {
  const L = { v: 2, size, height: h, label: 'large', comps: G.evenGrid(size, nc, nr) };
  const lid = G.buildLid(wasm, L), lidOk = lid.status() === 'NoError' && lid.decompose().length === 1; lid.delete();
  const Lc = { ...L, covers: true }, d = G.buildDrawer(wasm, Lc, assets), dOk = d.status() === 'NoError' && d.decompose().length === 1; d.delete();
  let covers = 0; Lc.comps.forEach((c, i) => { if (G.isCovered(Lc, c)) { const m = G.buildCover(wasm, Lc, i); if (m.status() === 'NoError' && m.decompose().length === 1) covers++; else fail(`${size} ${h}: cover ${i}`); m.delete(); } });
  if (!lidOk || !dOk) fail(`${size} ${h}: lid ${lidOk} drawer with beads ${dOk}`);
  console.log(`${size} ${h} ${nc}x${nr}: lid one solid, drawer with beads one solid, ${covers} covers`);
}
// the bottom mark (the layout code under the drawer) at the narrowest, shortest and widest sizes
for (const [size, h] of [['59-1W', '0.5H'], ['59-2W', '1H'], ['240-1W', '1H'], ['270-4W', '0.5H']]) {
  const S = G.SIZES[size], g = G.defaultGrid(size), L = { v: 2, size, height: h, label: 'large', comps: G.evenGrid(size, g.nc, g.nr) };
  const mark = [...Mk.textRects('MD-7KQ-2X9', { px: 0.9, cx: S.W / 2, cy: S.D - 26, mirror: true }), ...Mk.textRects('MODULITH', { px: 0.6, cx: S.W / 2, cy: S.D - 35, mirror: true })];
  const xs = mark.flatMap((p) => p.map((v) => v[0])), ys = mark.flatMap((p) => p.map((v) => v[1]));
  const d = G.buildDrawer(wasm, L, assets, { bottomMark: mark }), ok = d.status() === 'NoError' && d.decompose().length === 1; d.delete();
  const inside = Math.min(...xs) > 0 && Math.max(...xs) < S.W && Math.min(...ys) > 0 && Math.max(...ys) < S.D;
  if (!ok || !inside) fail(`${size} ${h}: bottom mark ${ok ? '' : 'not one solid '}${inside ? '' : 'outside the cavity'}`);
  console.log(`${size} ${h}: bottom mark x ${Math.min(...xs).toFixed(1)}-${Math.max(...xs).toFixed(1)}, y ${Math.min(...ys).toFixed(1)}-${Math.max(...ys).toFixed(1)}, drawer one solid`);
}
console.log(bad ? `${bad} FAILED` : 'size tests pass');

assert.equal(bad, 0, bad + ' size checks failed');
});
