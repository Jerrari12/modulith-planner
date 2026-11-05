// MODULITH parts drawer generator — geometry core.
// Frame: X0/Y0 = cavity front-left inner corner, Z0 = print bed, +Y toward the back of the drawer. Units mm.
// Validated against the Fusion 240-2W-0.5H / 1H parts drawers: the shipped 5x4 layout rebuilds to <0.001 mm deviation.

export const C = Object.freeze({
  FLOOR: 1.2,       // floor slab top
  WALL: 1.5,        // divider thickness
  OV: 0.3,          // overlap into neighbours so every union has real contact
  HOLDER_W: 30.6,   // label holder span; both label sizes are 29.88 wide
  RAMP: 6.0575,     // standard 45 deg scoop along each compartment's front edge (the shipped part)
  MIN_CELL: 12.0,   // smallest clear width/depth a compartment may have
  TRAY: 3.0,        // tray size a layout saved as tray: true gets (the first version had one 3 mm size)
  END_FILL: 3.5,    // a wide section only this much wider than the holder gets a solid end instead of plate + gap
  PLA: 1.24,        // g/cm3, for the weight estimate
});

// Front scoop sizes. Standard is the shipped drawer; Deep is clamped per compartment (see scoopSize).
export const SCOOPS = Object.freeze({
  off:  Object.freeze({ id: 'off',  name: 'Off',      size: 0 }),
  std:  Object.freeze({ id: 'std',  name: 'Standard', size: C.RAMP }),
  deep: Object.freeze({ id: 'deep', name: 'Deep',     size: 12.0 }),
});

// Tray presets in mm (0 = off): 45 deg ramps along the sides and back. 6 matches the standard scoop, 12 the deep one.
export const TRAYS = Object.freeze([0, 3, 6, 9, 12]);
export const TRAY_MAX = 12;   // keeps every ramp at least 3.3 mm under the label at 0.5H
export const trayMM = (c) => (c.tray === true ? C.TRAY : Math.max(0, Math.min(TRAY_MAX, Math.round((+c.tray || 0) * 10) / 10)));

// Two label holders with the same width, dovetail and latch. Large is Small moved 5 mm forward with its 45 deg
// plate run down to the back wall; it was printed and clicks in exactly like Small (Oct 2026).
//   D: holder depth in front of the back wall. DROP: where the plate's 45 deg underside meets the back wall,
//   below the wall top. MIN_DEPTH: smallest compartment depth that still gets a holder (holder + 12 mm finger opening).
export const HOLDERS = Object.freeze({
  small: Object.freeze({ id: 'small', name: 'Small', label: [29.876, 8.0, 1.35], D: 9.5, DROP: 11.86603, MIN_DEPTH: 21.5, asset: 'assets/holder_stamp.json', note: 'original parts-drawer label' }),
  large: Object.freeze({ id: 'large', name: 'Large', label: [29.876, 13.0, 1.35], D: 14.5, DROP: 16.86603, MIN_DEPTH: 26.5, asset: 'assets/holder_stamp_large.json', note: 'fits 12 mm label-maker tape' }),
});
// Layouts saved before the Large holder existed have no label field; they used the original holder.
export const holderOf = (layout) => HOLDERS[layout.label] || HOLDERS.small;

// All solid modelling runs on an integer grid of 0.1 micrometre (U units per mm) so faces that should be
// coplanar are bit-identical in float32 and double. Without this, float noise leaves micro-slivers.
export const U = 10000;
const q = (mm) => Math.round(mm * U);
export const snapMM = (mm) => q(mm) / U;

// Drawer sizes: every collection length (v24) at every width (v25). The planner's interior is 88 x W - 17 wide (1W/2W/3W/
// 4W -> 71/159/247/335) and the length less 14 deep (59/115/165/185/240/270 -> 45/101/151/171/226/256). Only the 240-2W
// shells are Fusion parts (0.5H and 1H); every other shell is made from one of them:
//   - width (v25): the 2W shell is two 88 mm columns. Front to back it has a straight band at each column centre (x 32.5
//     to 38.5 and 120.5 to 126.5: no vertices, every face crossing it runs along x) with the same section in both. Cut
//     there, it is a left end, one 88 mm period (a column boundary with its front and back features) and a right end, so
//     1W drops the period and 3W and 4W repeat it. Joey's Decor drawers are built the same way: this cut applied to the
//     Decor 2W gives his Decor 1W, 3W and 4W (Fusion exports) to within 0.05 mm3 (validation/t_widths_decor.mjs);
//   - length (v24): front to back, the 240 shells have no vertices between y 15.43 and 217.67 and every face crossing
//     that band runs along y: the back moves by (length - 240), shorter or longer;
//   - height (v23): the 1H shell has none between z 13.07 and 28.85: 1.5H and 2H move its top 28 and 56 mm;
//   - the 2H runner groove (v25): Joey's 2H drawers, Classic and Decor alike, have a side-wall groove 0.4 deep where the
//     lower ones have 0.8 (the same outline, its floor 0.4 further out: x -1.6 instead of -1.2, z 4.4 to 99.6, y 7.5 to
//     225.6 in a 240). The 2H shell gets that outside; inside, its wall stays flat at the cavity edge (Joey's 2H walls
//     step out 0.4 there instead), so the dividers, holders and ramps meet it as at every other height.
// The 59 collection comes in 0.5H and 1H only, and 1W and 2W only (planner: 59 is 1W/2W x 0.5H/1H; Joey: wider, things get
// weird). 3H (planner: 1W/2W) stays out: with walls 159 tall a compartment you can reach into is 88 mm across (see
// REACH), so a 2W holds one column of them, 1 x 2 in a 240: a bin, not a parts drawer. `stretched` marks a shell not yet
// checked against Fusion.
export const LENGTHS = Object.freeze([59, 115, 165, 185, 240, 270]);
export const WIDTHS = Object.freeze([1, 2, 3, 4]);
export const PITCH = 88;                                              // one width unit
export const STRETCH = Object.freeze({ y: 116.55, z: 20.96 });   // cut planes, inside the straight bands above
export const COLUMNS = Object.freeze([35.5, 123.5]);              // the 2W shell's column centres (x), where widths are cut
const SHELL_ASSETS = Object.freeze({ '0.5H': 'assets/shell_240-2W-05H.json', '1H': 'assets/shell_240-2W-1H.json' });
const HEIGHTS = Object.freeze({
  '0.5H': { top: 19.0, rim: 22.0, base: '0.5H', dz: 0 },
  '1H':   { top: 47.0, rim: 50.0, base: '1H', dz: 0 },
  '1.5H': { top: 75.0, rim: 78.0, base: '1H', dz: 28 },
  '2H':   { top: 103.0, rim: 106.0, base: '1H', dz: 56, groove: 0.4 },   // see above: the 2H groove
});
export const sizeKey = (length, w) => `${length}-${w}W`;
export const parseSize = (size) => { const m = /^(\d+)-(\d)W$/.exec(size || ''); return m ? { length: +m[1], w: +m[2] } : null; };
function sizeOf(length, w) {
  const dy = length - 240, hs = length === 59 ? ['0.5H', '1H'] : Object.keys(HEIGHTS);
  return {
    label: `${length} collection · ${w}W`, length, width: `${w}W`, w,
    W: PITCH * w - 17, D: 226.0 + dy,
    heights: Object.fromEntries(hs.map((h) => { const H = HEIGHTS[h]; return [h, { top: H.top, rim: H.rim, groove: H.groove || 0.8, shell: { asset: SHELL_ASSETS[H.base], base: H.base, dy, dz: H.dz, w, groove: H.groove || 0.8 }, stretched: !!(dy || H.dz || w !== 2) }]; })),
    ...(length === 240 && w === 2 ? { shipped: { cols: [30.6, 30.6, 30.6, 30.6, 30.6], rows: [56.0, 56.0, 56.0, 53.5] } } : {}),
    // Measured from both shells: the rim stands 3.0 above the divider tops with a straight inner face and square
    // corners. Each side wall is 2.0 thick; its top 6.0 is a solid band whose underside is a 45 deg chamfer down into
    // the 0.8 deep runner groove, where the case runner rides (0.4 deep at 2H: heights[h].groove).
    band: { h: 6.0, groove: 0.8, wall: 2.0 },
  };
}
export const SIZES = Object.freeze(Object.fromEntries(LENGTHS.flatMap((L) => WIDTHS.filter((w) => L !== 59 || w <= 2).map((w) => [sizeKey(L, w), sizeOf(L, w)]))));
export const SHELL_BASES = SHELL_ASSETS;
// The 2W shell for a height made 1W, 3W or 4W (see above); kept on the assets object.
export function widthShell(wasm, assets, base, w) {
  const two = assets.shells[base]; if (w === 2) return two;
  const key = `${w}W/${base}`; assets.widened ||= new Map();
  let m = assets.widened.get(key);
  if (!m) {
    const { Manifold } = wasm, [c1, c2] = COLUMNS.map(q);
    const L = two.trimByPlane([-1, 0, 0], -c1), R = two.trimByPlane([1, 0, 0], c2), M0 = two.trimByPlane([1, 0, 0], c1), M = M0.trimByPlane([-1, 0, 0], -c2);
    const parts = [L]; for (let k = 0; k < w - 1; k++) parts.push(M.translate([q(PITCH * k), 0, 0]));
    parts.push(R.translate([q(PITCH * (w - 2)), 0, 0]));
    m = Manifold.union(parts);
    for (const x of [L, R, M0, M, ...parts.slice(1)]) x.delete();
    assets.widened.set(key, m);
  }
  return m;
}
// The shell for a size and height: the 240-2W Fusion shell for its height (assets.shells['0.5H'] or ['1H']) made the
// size's width, then stretched as SIZES says; assets.shells['<size>/<height>'] overrides it (a modelled shell, once one
// exists). Shells made here are kept on the assets object.
export function shellFor(wasm, assets, size, height) {
  const own = assets.shells[`${size}/${height}`]; if (own) return own;
  const S = SIZES[size], sp = S.heights[height].shell, base = widthShell(wasm, assets, sp.base, sp.w);
  if (!sp.dy && !sp.dz && sp.groove === 0.8) return base;
  const key = `${size}/${height}`; assets.warped ||= new Map();
  let m = assets.warped.get(key);
  if (!m) {
    const yc = q(STRETCH.y), zc = q(STRETCH.z), dy = q(sp.dy), dz = q(sp.dz), shallow = sp.groove !== 0.8 ? grooveFloor(base, S.W, sp.groove) : null;
    m = base.warp((v) => { if (shallow) shallow(v); if (v[1] > yc) v[1] += dy; if (v[2] > zc) v[2] += dz; });
    assets.warped.set(key, m);
  }
  return m;
}
// The 2H groove: the floor of each side wall's runner groove (x -1.2 and W + 1.2 in the unstretched shell, its outline a
// rectangle with 45 deg corner chamfers: four y and four z positions) moved to a shallower groove's outline, as Joey's
// 2H drawers have it. The groove's walls are 45 deg, so a groove d shallower has its floor d further out, its straight
// edges d further out and its corner chamfers d x (sqrt 2 - 1) further out (Decor 240-2W-2H: y 7.5 / 15.2657 / 217.8343
// / 225.6, z 4.4 / 12.1657 / 91.8343 / 99.6). Throws unless the floor has exactly that outline, so a changed shell can't
// slip through.
function grooveFloor(base, W, groove) {
  const dd = 0.8 - groove, d = q(dd), c = q(dd * (Math.SQRT2 - 1)), x0 = q(-1.2), x1 = q(W + 1.2), tol = q(0.001);
  const side = (x) => (Math.abs(x - x0) <= tol ? -1 : Math.abs(x - x1) <= tol ? 1 : 0);
  const mesh = base.getMesh(), np = mesh.numProp, V = mesh.vertProperties, ys = [], zs = [];
  const add = (list, a) => { if (!list.some((b) => Math.abs(a - b) <= tol)) list.push(a); };
  for (let i = 0; i < V.length; i += np) if (side(V[i])) { add(ys, V[i + 1]); add(zs, V[i + 2]); }
  if (ys.length !== 4 || zs.length !== 4) throw new Error(`the groove floor has ${ys.length} y and ${zs.length} z positions, not 4 and 4`);
  const step = (list) => { list.sort((a, b) => a - b); const s = [-d, -c, c, d]; return (a) => { const j = list.findIndex((b) => Math.abs(a - b) <= tol); if (j < 0) throw new Error('a vertex off the groove outline'); return s[j]; }; };
  const sy = step(ys), sz = step(zs);
  return (v) => { const s = side(v[0]); if (!s) return; v[0] += s * d; v[1] += sy(v[1]); v[2] += sz(v[2]); };
}
// What a made shell is, in words, for the page and the README: [] for a Fusion shell.
export function shellChanges(size, height) {
  const sp = SIZES[size].heights[height].shell;
  return [sp.w === 1 ? 'one column taken out' : sp.w === 3 ? 'one column added' : sp.w === 4 ? 'two columns added' : '',
    sp.dy < 0 ? 'shorter' : sp.dy > 0 ? 'longer' : '', sp.dz ? 'taller' : ''].filter(Boolean);
}
// Outside footprint on the bed (mm): 88 x W - 13 wide (75/163/251/339), the length less 5.7 deep.
export const footprint = (size) => { const S = SIZES[size]; return [snapMM(S.W + 4), snapMM(S.D + 8.3)]; };
// A starting grid for a size: as many label-width columns as fit (2 / 5 / 7 / 10 for 1W to 4W) and rows about 56 deep,
// as the shipped 240-2W has.
export const defaultGrid = (size) => ({ nc: Math.max(1, Math.floor((SIZES[size].W + C.WALL) / (C.HOLDER_W + C.WALL) + 1e-9)), nr: Math.max(1, Math.round(SIZES[size].D / 56)) });
// The most columns and rows a grid takes: 5 columns per width unit and 8 rows, as far as 12 mm compartments allow.
export const maxGrid = (size) => { const S = SIZES[size], n = (span) => Math.floor((span + C.WALL) / (C.MIN_CELL + C.WALL) + 1e-9); return { nc: Math.max(1, Math.min(5 * S.w, n(S.W))), nr: Math.max(1, Math.min(8, n(S.D))) }; };
// Compartments moved to another drawer size along one axis ('y' for depth, 'x' for width): every wall line keeps its
// place in proportion (its centre snapped to 0.05 mm, the grid wall centres sit on), so merges, parts, cells and walls
// carry over. Null when a compartment would get under 12 mm.
export function rescaleAxis(comps, axis, A0, A1) {
  const hw = C.WALL / 2, k = (A1 + 2 * hw) / (A0 + 2 * hw), a0 = axis + '0', a1 = axis + '1';
  const f = (v) => (Math.abs(v + hw) < 1e-9 ? -hw : Math.abs(v - A0 - hw) < 1e-9 ? A1 + hw : Math.round(((v + hw) * k - hw) * 20) / 20);
  const out = comps.map((c) => ({ ...c, [a0]: snapMM(f(c[a0] - hw) + hw), [a1]: snapMM(f(c[a1] + hw) - hw) }));
  return out.every((c) => c[a1] - c[a0] >= C.MIN_CELL - 1e-6) ? out : null;
}
export const rescaleDepth = (comps, D0, D1) => rescaleAxis(comps, 'y', D0, D1);
export const rescaleWidth = (comps, W0, W1) => rescaleAxis(comps, 'x', W0, W1);

export function uniform(total, n) {
  const free = Math.round(total * U) - (n - 1) * Math.round(C.WALL * U);
  const base = Math.floor(free / n), extra = free - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / U);
}

export function spans(sizes) {
  const out = []; let p = 0; const w = Math.round(C.WALL * U);
  for (const s of sizes) { const k = Math.round(s * U); out.push([p / U, (p + k) / U]); p += k + w; }
  return out;
}

export function parseSTL(buf) {
  const dv = new DataView(buf);
  const n = dv.getUint32(80, true);
  const pos = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k++) pos[t * 9 + k] = dv.getFloat32(o + k * 4, true);
  }
  return pos;
}

// Weld a triangle soup into an indexed mesh (STL loses connectivity).
export function weld(pos, digits = 4) {
  const map = new Map(); const verts = []; const tris = new Uint32Array(pos.length / 3);
  const f = 10 ** digits;
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    const key = Math.round(x * f) + ',' + Math.round(y * f) + ',' + Math.round(z * f);
    let id = map.get(key);
    if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(x, y, z); }
    tris[i] = id;
  }
  return { vertProperties: new Float32Array(verts), triVerts: tris };
}

export function manifoldFromSTL(wasm, buf) {
  const { Manifold, Mesh } = wasm;
  const raw = parseSTL(buf);
  for (let i = 0; i < raw.length; i++) raw[i] = q(raw[i]);
  const w = weld(raw, 0);
  const mesh = new Mesh({ numProp: 3, vertProperties: w.vertProperties, triVerts: w.triVerts });
  mesh.merge();
  const m = new Manifold(mesh);
  if (m.status() !== 'NoError') throw new Error('asset is not manifold: ' + m.status());
  return m;
}

// ---------- layout model (v2) ----------
// layout = { v: 2, size, height, label: 'small'|'large', style, comps: [compartment] }
// compartment = { x0, x1, y0, y1, holder, scoop: 'off'|'std'|'deep', tray: mm (0 = off; true = 3), color: 0..4 }
//   x/y are the clear inside of the compartment in mm, measured from the cavity's front-left corner.
//   Neighbours are exactly one wall (1.5 mm) apart, and the compartments grown by half a wall tile the cavity.
// Version 1 layouts ({cols, rows, regions:[{c0,c1,r0,r1}]}) convert with toV2().

export const COMP_DEFAULTS = Object.freeze({ holder: true, scoop: 'std', tray: 0, color: 0 });

export function comp(x0, x1, y0, y1, props = {}) {
  return { x0: snapMM(x0), x1: snapMM(x1), y0: snapMM(y0), y1: snapMM(y1), ...COMP_DEFAULTS, ...props };
}

// compartments for a grid of clear column widths and row depths (row 0 = front)
export function gridComps(cols, rows, props = {}) {
  const cx = spans(cols), ry = spans(rows); const out = [];
  for (let r = 0; r < ry.length; r++) for (let c = 0; c < cx.length; c++) out.push(comp(cx[c][0], cx[c][1], ry[r][0], ry[r][1], props));
  return out;
}
export const evenGrid = (size, nc, nr, props) => gridComps(uniform(SIZES[size].W, nc), uniform(SIZES[size].D, nr), props);

export function toV2(layout) {
  const base = { v: 2, size: layout.size || '240-2W', height: layout.height, label: layout.label, style: layout.style || 'pyramid' };
  if (Array.isArray(layout.comps)) {
    return { ...layout, ...base, comps: layout.comps.map((c) => ({ ...COMP_DEFAULTS, ...c, x0: snapMM(c.x0), x1: snapMM(c.x1), y0: snapMM(c.y0), y1: snapMM(c.y1) })) };
  }
  const cx = spans(layout.cols), ry = spans(layout.rows);
  return { ...base, comps: layout.regions.map((rg) => comp(cx[rg.c0][0], cx[rg.c1][1], ry[rg.r0][0], ry[rg.r1][1], { holder: rg.holder !== false })) };
}

// Throws unless the compartments tile the cavity with exactly one wall between neighbours. Integer grid units.
export function checkTiling(layout) {
  const { W, D } = SIZES[layout.size]; const hw = q(C.WALL / 2), min = q(C.MIN_CELL) - 1;
  const B = [-hw, q(W) + hw, -hw, q(D) + hw];
  const E = layout.comps.map((c, i) => {
    const r = [q(c.x0) - hw, q(c.x1) + hw, q(c.y0) - hw, q(c.y1) + hw];
    if (q(c.x1) - q(c.x0) < min || q(c.y1) - q(c.y0) < min) throw new Error(`compartment ${i + 1} is smaller than ${C.MIN_CELL} mm`);
    if (r[0] < B[0] || r[1] > B[1] || r[2] < B[2] || r[3] > B[3]) throw new Error(`compartment ${i + 1} is outside the drawer`);
    return r;
  });
  let area = 0;
  for (let i = 0; i < E.length; i++) {
    const a = E[i]; area += (a[1] - a[0]) * (a[3] - a[2]);
    for (let j = i + 1; j < E.length; j++) {
      const b = E[j];
      if (a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3]) throw new Error(`compartments ${i + 1} and ${j + 1} overlap`);
    }
  }
  if (area !== (B[1] - B[0]) * (B[3] - B[2])) throw new Error('compartments leave a gap');
  return true;
}

export const compBox = (c) => ({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 });
const wallH = (layout) => SIZES[layout.size].heights[layout.height].top - C.FLOOR;

export function holderStatus(layout, c) {
  const w = c.x1 - c.x0, d = c.y1 - c.y0;
  const h = holderOf(layout);
  if (w < C.HOLDER_W - 1e-6) return { ok: false, why: `needs ${C.HOLDER_W} mm width (has ${w.toFixed(1)})` };
  if (d < h.MIN_DEPTH - 1e-6) return { ok: false, why: `${h.name.toLowerCase()} label needs ${h.MIN_DEPTH} mm depth (has ${d.toFixed(1)})` };
  return { ok: true };
}
export const hasHolder = (layout, c) => !!c.holder && holderStatus(layout, c).ok;

// Effective scoop: never more than half the compartment depth, and at least 3 mm below the wall top.
export function scoopSize(layout, c) {
  const s = (SCOOPS[c.scoop] || SCOOPS.std).size;
  if (!s) return 0;
  return snapMM(Math.min(s, (c.y1 - c.y0) / 2, wallH(layout) - 3));
}
// Effective tray: each ramp at most a third of the compartment, so a third of the floor stays flat, and 3 mm below
// the wall top. The label rides 2.5 mm under the wall top, well above any ramp.
export function traySize(layout, c) {
  const t = trayMM(c);
  if (!t) return 0;
  return snapMM(Math.min(t, (c.x1 - c.x0) / 3, (c.y1 - c.y0) / 3, wallH(layout) - 3));
}

// ---------- selection boxes ----------
// Compartments are neighbours when they are one wall apart, so "touching" a box is measured on rectangles grown by
// half a wall. A box closed under touching is exactly tiled by the compartments inside it, so they can merge.
export const boxOf = (list) => ({ x0: Math.min(...list.map((c) => c.x0)), x1: Math.max(...list.map((c) => c.x1)), y0: Math.min(...list.map((c) => c.y0)), y1: Math.max(...list.map((c) => c.y1)) });
export const inBox = (k, r) => k.x0 >= r.x0 - 1e-6 && k.x1 <= r.x1 + 1e-6 && k.y0 >= r.y0 - 1e-6 && k.y1 <= r.y1 + 1e-6;
export const touchesBox = (k, r) => k.x0 < r.x1 + C.WALL - 1e-4 && r.x0 < k.x1 + C.WALL - 1e-4 && k.y0 < r.y1 + C.WALL - 1e-4 && r.y0 < k.y1 + C.WALL - 1e-4;
export function closeBox(comps, r) {
  for (let grew = true; grew;) { grew = false; for (const k of comps) if (touchesBox(k, r) && !inBox(k, r)) { r = boxOf([r, k]); grew = true; } }
  return r;
}

// ---------- wall editing (shared by the page and the tests) ----------
// A wall is named by its orientation ('v' runs front-to-back, 'h' runs left-to-right) and its centre line c (mm).
// Moving one wall segment drags along every collinear edge that must move with it to keep all compartments
// rectangular: the chain. With whole = true the chain is every edge on that line.
const HW = C.WALL / 2, TOL = 1e-4;
export function wallChain(comps, orient, c, seed, whole = false) {
  const a = orient === 'v' ? 'x' : 'y', b = orient === 'v' ? 'y' : 'x';
  const lo = [], hi = [];
  comps.forEach((k, i) => { if (Math.abs(k[a + '1'] + HW - c) < TOL) lo.push(i); if (Math.abs(k[a + '0'] - HW - c) < TOL) hi.push(i); });
  const all = lo.concat(hi);
  if (!all.length) return null;
  const span = (i) => [comps[i][b + '0'] - HW, comps[i][b + '1'] + HW];
  let inc, J;
  if (whole) { inc = new Set(all); J = [Math.min(...all.map((i) => span(i)[0])), Math.max(...all.map((i) => span(i)[1]))]; }
  else {
    inc = new Set([seed]); J = span(seed);
    for (let grew = true; grew;) {
      grew = false;
      for (const i of all) if (!inc.has(i)) { const s = span(i); if (s[0] < J[1] - TOL && J[0] < s[1] - TOL) { inc.add(i); J = [Math.min(J[0], s[0]), Math.max(J[1], s[1])]; grew = true; } }
    }
  }
  const L = lo.filter((i) => inc.has(i)), R = hi.filter((i) => inc.has(i));
  if (!L.length || !R.length) return null;
  const range = [Math.max(...L.map((i) => comps[i][a + '0'])) + C.MIN_CELL + HW, Math.min(...R.map((i) => comps[i][a + '1'])) - C.MIN_CELL - HW];
  return { orient, c, L, R, J, segs: [...inc].map(span), range };
}
export function moveChain(comps, ch, cNew) {
  const a = ch.orient === 'v' ? 'x' : 'y';
  const out = comps.map((k) => ({ ...k }));
  for (const i of ch.L) out[i][a + '1'] = snapMM(cNew - HW);
  for (const i of ch.R) out[i][a + '0'] = snapMM(cNew + HW);
  return out;
}
// The internal wall nearest a plan point, within tol mm of its centre line.
export function wallAt(comps, size, pt, tol) {
  const { W, D } = SIZES[size]; let best = null, bd = tol;
  comps.forEach((k, i) => {
    if (k.x1 < W - TOL) { const c = k.x1 + HW, d = Math.abs(pt.x - c); if (d <= bd && pt.y >= k.y0 - HW && pt.y <= k.y1 + HW) { bd = d; best = { orient: 'v', c, seed: i }; } }
    if (k.y1 < D - TOL) { const c = k.y1 + HW, d = Math.abs(pt.y - c); if (d <= bd && pt.x >= k.x0 - HW && pt.x <= k.x1 + HW) { bd = d; best = { orient: 'h', c, seed: i }; } }
  });
  return best;
}
// Resize one compartment to a clear width ('w') or depth ('d'): moves its right/back wall, or its left/front wall
// at the drawer edge. Returns { comps } or { error }.
export function resizeComp(layout, index, dim, value) {
  const { W, D } = SIZES[layout.size]; const comps = layout.comps; const k = comps[index];
  const a = dim === 'w' ? 'x' : 'y', orient = dim === 'w' ? 'v' : 'h', far = dim === 'w' ? W : D;
  let ch, cNew;
  if (k[a + '1'] < far - TOL) { ch = wallChain(comps, orient, k[a + '1'] + HW, index); cNew = k[a + '0'] + value + HW; }
  else if (k[a + '0'] > TOL) { ch = wallChain(comps, orient, k[a + '0'] - HW, index); cNew = k[a + '1'] - value - HW; }
  else return { error: `this compartment already spans the full ${dim === 'w' ? 'width' : 'depth'}` };
  if (!ch) return { error: 'no wall to move' };
  const c = Math.min(ch.range[1], Math.max(ch.range[0], cNew));
  return { comps: moveChain(comps, ch, c), clamped: Math.abs(c - cNew) > TOL };
}

// The flat, visible floor of a compartment: inside the scoop and tray ramps. Floor colours live here.
export function floorRect(layout, c) {
  const t = traySize(layout, c);
  return { x0: c.x0 + t, x1: c.x1 - t, y0: c.y0 + scoopSize(layout, c), y1: c.y1 - t };
}

// The part of the floor you see from above: the label holder hangs over the back of it, so part outlines go in front.
export function openFloorRect(layout, c) {
  const r = floorRect(layout, c);
  return hasHolder(layout, c) ? { ...r, y1: Math.min(r.y1, c.y1 - holderOf(layout).D - 0.5) } : r;
}

// ---------- 3D-printer cells (v18) ----------
// Bearings by designation: bore, outer diameter, width and, for flanged ones, flange diameter and width (catalogue
// values; the parts list uses them to size bearing compartments too).
export const BEARINGS = Object.freeze({
  623: [3, 10, 4], F623: [3, 10, 4, 11.5, 1], 693: [3, 8, 4], F693: [3, 8, 4, 9.5, 0.7], MR63: [3, 6, 2.5], 683: [3, 7, 3],
  624: [4, 13, 5], F624: [4, 13, 5, 15, 1], 684: [4, 9, 4], MR74: [4, 7, 2.5],
  605: [5, 14, 5], F605: [5, 14, 5, 16, 1], 625: [5, 16, 5], F625: [5, 16, 5, 18, 1], 695: [5, 13, 4], F695: [5, 13, 4, 15, 1],
  685: [5, 11, 5], MR85: [5, 8, 2.5], MR95: [5, 9, 3], MR105: [5, 10, 4], MR115: [5, 11, 4],
  626: [6, 19, 6], 686: [6, 13, 5], 696: [6, 15, 5], 688: [8, 16, 5], F688: [8, 16, 5, 18, 1], 698: [8, 19, 6], 608: [8, 22, 7],
  6800: [10, 19, 5], 6900: [10, 22, 6], 6801: [12, 21, 5],
  LM6UU: [6, 12, 19], LM8UU: [8, 15, 24], LM10UU: [10, 19, 29], LM12UU: [12, 21, 30],
});
export const bearingBase = (code) => String(code).toUpperCase().replace(/[-\s]?(2RS|ZZ|RS|2Z)$/, '');
export const bearingDims = (code) => BEARINGS[bearingBase(code)] || null;
// The bearings the well picker offers, most common in printers first.
export const WELL_BEARINGS = Object.freeze(['625', 'F695', '608', '688', '623', 'F623', 'MR85', '695', '605', '624', 'MR105', '6800']);
// Washers by thread, outer diameter and thickness: flat washers ISO 7089 (DIN 125), split lock washers DIN 127. The parts
// list sizes washer piles with them and the washer rows size their grooves with them.
export const WASHERS = Object.freeze({ M2: [5, 0.3], 'M2.5': [6, 0.5], M3: [7, 0.5], M4: [9, 0.8], M5: [10, 1], M6: [12, 1.6], M8: [16, 1.6], M10: [20, 2], M12: [24, 2.5] });
export const LOCK_WASHERS = Object.freeze({ M2: [4.4, 0.5], 'M2.5': [5.1, 0.6], M3: [6.2, 0.8], M4: [7.6, 0.9], M5: [9.2, 1.2], M6: [11.8, 1.6], M8: [14.8, 2], M10: [18.1, 2.2], M12: [21.1, 2.5] });

// A compartment can hold a grid of cells instead of a loose pile (c.cell):
//   wells    bearing wells (v20, replacing v18's posts): a low ring per stack, split by a notch front and back that runs
//            down to the floor, so a thumb and finger reach any bearing in it, the last one included. The notches are
//            narrower than the bearing, so it can't slide out. A 45 deg foot flares the outside of the wall into the
//            floor, so the thin wall doesn't split along its first layers (Joey, 2026-10-23); the notch faces stay square
//            so the notch keeps its width down to the floor. Walls stop at wallMax, which caps how high a 1H well
//            stacks. The bearing is the compartment's part when that is a bearing, else c.bearing (625 by default).
//   nozzles  nozzle sockets: tubes a V6-style (M6) nozzle drops into thread first, its hex resting on the rim.
//   bits     bit sockets: hex tubes a 1/4" hex bit (6.35 across flats) stands in. 25 mm bits: 1H and taller.
// Wells, nozzles and bits sit on a grid spaced by c.spacing (v20): roomy (the default) leaves 8 mm clear between the
// parts you grip (a nozzle's hex, a bit's shank) for a fingertip, dense 5 (about v18's spacing) for fingernails, and the
// outer ones keep half that from the open floor's edge. Wells are reached through their notches, so their 8 (or 5) runs
// front to back, in front of the first well and behind the last too; side by side they stand SIDE apart. The 8 is a first
// guess for a fingertip: the test prints settle it.
//   washers  washer rows (v19): a ribbed floor. V grooves with 30 deg flanks run front to back, one washer diameter plus
//            1.2 apart; washers stand on edge in them, faces together like a roll of coins, and tip out one at a time.
//            One that lands flat lies across a groove, raised on the flanks, so pressing one edge lifts the other. End
//            walls a little over a washer's centre close the rows. The washer is the compartment's part when that is a
//            washer or lock washer, else c.washer (M3 by default).
// Cells sit on the open floor (inside the scoop and tray ramps, in front of the label holder), 2 mm clear of it all
// round, so a lid's lips and a cover's skirt pass them. Everything they hold stays 0.5 under the divider tops (3.3 under
// a cover, whose nail slot divot hangs 2.8 into the compartment), and the lid never puts its pull over a cell.
export const CELLS = Object.freeze({
  // clear: well inside over the bearing's diameter (its flange's, if it has one); wall: ring thickness; notch: width as a
  // share of the bearing's body diameter, within notchMin..notchMax
  // chamfer: the 45 deg foot round the outside, at the floor; wallMax: the tallest wall
  wells:   Object.freeze({ id: 'wells', name: 'Bearing wells', clear: 0.8, wall: 1.6, notch: 0.6, notchMin: 3, notchMax: 12, chamfer: 2, wallMax: 20 }),
  // grip: the width you hold above the socket (a 7 mm nozzle hex across its corners, a 1/4" bit's shank likewise)
  // chamfer: the bore's lead-in; foot: the 45 deg foot round the outside at the floor, as on the wells
  nozzles: Object.freeze({ id: 'nozzles', name: 'Nozzle sockets', bore: 6.4, od: 10.4, h: 9, grip: 8.08, holds: 13, chamfer: 0.6, foot: 1.2 }),
  bits:    Object.freeze({ id: 'bits', name: 'Bit sockets', af: 6.6, od: 10.8, h: 10, grip: 7.33, holds: 25, foot: 1.2 }),
  // angle: groove flanks from level; gap: between washers in neighbouring rows; crest: the flat on each rib; sink: the V
  // meets the floor this far below its top, leaving a 0.5 flat in the groove; lean: how much of a row's length washers
  // fill, standing a little tilted; end: how far the end walls reach over a washer's centre
  washers: Object.freeze({ id: 'washers', name: 'Washer rows', angle: 30, gap: 1.2, crest: 0.6, sink: 0.15, lean: 0.85, end: 0.5 }),
});
// The washer sizes the row picker offers.
export const ROW_WASHERS = Object.freeze(['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12']);
export function cellWasher(c) {
  const it = c.item;
  if (it && it.type === 'lockwasher' && LOCK_WASHERS[it.size]) return { size: it.size, lock: true, dims: LOCK_WASHERS[it.size], part: true };
  if (it && it.type === 'washer' && WASHERS[it.size]) return { size: it.size, lock: false, dims: WASHERS[it.size], part: true };
  const size = WASHERS[c.washer] ? c.washer : 'M3';
  return { size, lock: false, dims: WASHERS[size], part: false };
}
export const CELL = Object.freeze({ MARGIN: 2.0, TOPGAP: 0.5, COVER_GAP: 3.3, GAP: Object.freeze({ roomy: 8, dense: 5 }), SIDE: 4, MAX_STACK: 6 });
export const GRID_CELLS = Object.freeze(['wells', 'nozzles', 'bits']);   // the cells spaced on a grid
export const cellKind = (c) => (c.cell === 'posts' ? 'wells' : c.cell);   // v18-v19 bearing posts open as wells
export const cellSpacing = (c) => (c.spacing === 'dense' ? 'dense' : 'roomy');
export function cellBearing(c) {
  const code = c.item && c.item.type === 'bearing' && bearingDims(c.item.size) ? c.item.size : bearingDims(c.bearing || '') ? c.bearing : '625';
  return { code, dims: bearingDims(code) };
}
// centres at the nominal pitch, centred in [a, b]
const gridAxis = (a, b, pitch) => {
  if (b < a - 1e-9) return [];
  const n = Math.floor((b - a) / pitch + 1e-9) + 1, s = (a + b) / 2 - (n - 1) * pitch / 2;
  return Array.from({ length: n }, (_, i) => snapMM(s + i * pitch));
};
// Where a compartment's cells go: { kind, pts: [[x, y]], foot (diameter each takes), pitch, spacing, h (built height),
// per (bearings a well takes), notch, capacity, why (when none fit) }, or null without a cell.
export function cellPlan(layoutIn, c) {
  const k = c.cell && CELLS[cellKind(c)]; if (!k) return null;
  const layout = toV2(layoutIn), r = openFloorRect(layout, c), m = CELL.MARGIN;
  const covered = layout.covers && !c.nocover && coverFits(layout, c);
  // a lid's stiffening ribs hang RIB_H under the divider tops across big compartments: cells stay TOPGAP under them too
  const lr = layout.lid ? lidRing(layout, c) : null, ribbed = !!lr && (lr.nx > 0 || lr.ny > 0);
  const hMax = SIZES[layout.size].heights[layout.height].top - C.FLOOR - (covered ? CELL.COVER_GAP : (ribbed ? LID.RIB_H : 0) + CELL.TOPGAP);
  if (k.id === 'washers') return washerPlan(layout, c, k, r, m, hMax, covered);
  const spacing = cellSpacing(c), gap = CELL.GAP[spacing];
  let foot, pitch, pitchX, edgeX, edgeY, h, per = 1, bearing = null, notch = 0, why = null;
  if (k.id === 'wells') {
    // the wall stops a third of a bearing under the top of a full stack, so the top one stands proud
    const b = cellBearing(c), [, D, B, Df] = b.dims; bearing = b.code;
    foot = snapMM((Df || D) + k.clear + 2 * k.wall); pitch = snapMM(foot + gap); pitchX = snapMM(foot + CELL.SIDE);
    edgeX = foot / 2 + Math.max(m, k.chamfer + 0.2); edgeY = foot / 2 + Math.max(m, gap);   // the foot stays on the open floor
    notch = snapMM(Math.max(k.notchMin, Math.min(k.notchMax, D * k.notch)));
    per = Math.min(CELL.MAX_STACK, Math.floor(hMax / B + 1e-9), Math.floor((k.wallMax + B / 3) / B + 1e-9));
    if (per < 1) why = `${b.code} bearings are ${B} mm tall, too tall to lie in a ${layout.height} drawer`;
    h = snapMM(Math.max(B * 0.7, per * B - B / 3));
  } else {
    foot = k.od; pitch = pitchX = snapMM(Math.max(k.od + 1.5, k.grip + gap)); h = k.h;
    edgeX = edgeY = Math.max(foot / 2 + m, (k.grip + gap) / 2);
    if (k.holds > hMax) why = `${k.name.toLowerCase()} hold parts ${k.holds} mm tall: they need a deeper drawer than ${layout.height}${covered ? ' with a cover' : ''}`;
  }
  const xs = gridAxis(r.x0 + edgeX, r.x1 - edgeX, pitchX), ys = gridAxis(r.y0 + edgeY, r.y1 - edgeY, pitch);
  if (!why && (!xs.length || !ys.length)) why = `needs at least ${snapMM(2 * edgeX)} mm of open floor across and ${snapMM(2 * edgeY)} front to back`;
  const pts = why ? [] : ys.flatMap((y) => xs.map((x) => [x, y]));
  return { kind: k.id, name: k.name, pts, foot, pitch, pitchX, edgeX: snapMM(edgeX), edgeY: snapMM(edgeY), spacing, h, per, bearing, notch, why, count: pts.length, capacity: pts.length * per };
}
// How far down a hand has to reach: a compartment deeper than REACH times its narrower side is hard to get the last parts
// out of (fingers have to go straight down a slot). Returns { depth, narrow } when it is, else null. (v23, with the tall
// drawers; Joey: at 1.5H and 2H parts get hard to reach.)
export const REACH = 1.8;
export function reachNote(layoutIn, c) {
  const layout = toV2(layoutIn), depth = SIZES[layout.size].heights[layout.height].top - C.FLOOR, narrow = Math.min(c.x1 - c.x0, c.y1 - c.y0);
  return depth > REACH * narrow + 1e-9 ? { depth: snapMM(depth), narrow: snapMM(narrow) } : null;
}
// v24: the narrowest a compartment can be at a height and still be reached into; the tall heights (1.5H and up), where
// the page warns about the whole drawer (Joey: tall drawers want 2 or 3 big divisions you can get a hand into); the
// compartments that fail; and the densest even grid where none does (2W: 2 x 3 at 2H, 3 x 5 at 1.5H in a 240).
export const reachMin = (size, height) => snapMM((SIZES[size].heights[height].top - C.FLOOR) / REACH);
export const isTall = (size, height) => SIZES[size].heights[height].top > 50;
export const reachFlags = (layoutIn) => { const layout = toV2(layoutIn); return layout.comps.map((c) => !!reachNote(layout, c)); };
export function reachableGrid(size, height) {
  const { W, D } = SIZES[size], m = Math.max(C.MIN_CELL, reachMin(size, height)), n = (span) => Math.max(1, Math.floor((span + C.WALL) / (m + C.WALL) + 1e-9));
  return { nc: n(W), nr: n(D) };
}
// Washer rows: a groove per row centred like the other cells' grid, the washers in it 2 mm clear of the open floor's
// edges; the ribbed block itself covers the whole open floor (run 0.3 into the walls and ramps it meets) and is low
// enough to pass under a lid's lips. Heights are above the floor: d the rib tops, h the end walls, top a washer's top.
// Washers can lean along their row, over its end wall, so under a lid they stay below its lips altogether.
function washerPlan(layout, c, k, r, m, hMax, covered) {
  const wa = cellWasher(c), [od, t] = wa.dims, rw = od / 2, th = k.angle * Math.PI / 180;
  const pitch = snapMM(od + k.gap), hw = snapMM((pitch - k.crest) / 2);
  const d = snapMM(hw * Math.tan(th) - k.sink), top = snapMM(rw * (1 + 1 / Math.cos(th)) - k.sink), h = snapMM(rw / Math.cos(th) - k.sink + k.end);
  const xs = gridAxis(r.x0 + m + rw, r.x1 - m - rw, pitch), y0 = snapMM(r.y0 + m), y1 = snapMM(r.y1 - m);
  const what = `${wa.size} ${wa.lock ? 'lock ' : ''}washers`;
  const lidded = !covered && !!layout.lid, limit = lidded ? Math.min(hMax, SIZES[layout.size].heights[layout.height].top - C.FLOOR - LID.LIP_H - CELL.TOPGAP) : hMax;
  let why = null;
  if (top > limit + 1e-9) why = `${what} stand ${+top.toFixed(1)} mm tall in their rows: they need a deeper drawer than ${layout.height}${covered ? ' with a cover' : lidded ? ' with the lid' : ''}`;
  else if (!xs.length) why = `needs at least ${snapMM(od + 2 * m)} mm of open floor across`;
  else if (y1 - y0 < od - 1e-9) why = `needs at least ${snapMM(od + 2 * m)} mm of open floor front to back`;
  const rows = why ? [] : xs.map((x) => ({ x, y0, y1 }));
  const per = why ? 0 : Math.floor((y1 - y0) * k.lean / t + 1e-9);
  const block = { x0: snapMM(r.x0 - C.OV), x1: snapMM(r.x1 + C.OV), y0: snapMM(r.y0 - C.OV), y1: hasHolder(layout, c) ? snapMM(r.y1) : snapMM(r.y1 + C.OV) };
  return { kind: k.id, name: k.name, pts: rows.map((w) => [w.x, snapMM((y0 + y1) / 2)]), foot: od, pitch, h, per, bearing: null,
    washer: { size: wa.size, lock: wa.lock, od, t, part: wa.part, what }, rows, block, d, hw, top, limit, why, count: rows.length, capacity: rows.length * per };
}
// The cells' solids, standing on the floor slab (sunk OV into it). Exported for the fit test piece.
export function cellSolids(wasm, plan) {
  const { Manifold, CrossSection } = wasm, z0 = q(C.FLOOR - C.OV), H = plan.h + C.OV, out = [];
  if (plan.kind === 'washers') return washerSolid(wasm, plan);
  let one;
  if (plan.kind === 'wells') {
    one = wellSolid(wasm, plan, H);
  } else {
    const k = CELLS[plan.kind], outer = footedTube(wasm, 0, k.od / 2, k.foot, H, SOCKET_SEGS);
    let hole;
    if (plan.kind === 'nozzles') {
      const bore = Manifold.cylinder(q(H + 2), q(k.bore / 2), q(k.bore / 2), 40).translate([0, 0, -q(1)]);
      const lead = Manifold.cylinder(q(k.chamfer + 0.01), q(k.bore / 2), q(k.bore / 2 + k.chamfer + 0.01), 40).translate([0, 0, q(H - k.chamfer)]);
      hole = Manifold.union(bore, lead); bore.delete(); lead.delete();
    } else {
      const R = k.af / Math.sqrt(3), cs = new CrossSection([[0, 1, 2, 3, 4, 5].map((i) => [q(R * Math.cos(Math.PI / 6 + i * Math.PI / 3)), q(R * Math.sin(Math.PI / 6 + i * Math.PI / 3))])]);
      hole = Manifold.extrude(cs, q(H + 2)).translate([0, 0, -q(1)]); cs.delete();
    }
    one = outer.subtract(hole); outer.delete(); hole.delete();
  }
  for (const [x, y] of plan.pts) out.push(one.translate([q(x), q(y), z0]));
  one.delete();
  const u = Manifold.union(out); out.forEach((m) => m.delete());
  return u;
}
// A well, centred on the origin with its base OV under the floor's top: the wall revolved from its profile (square in the
// floor, the 45 deg foot, then straight up), minus a band as wide as the notch cut through it front to back, which
// leaves two arcs, left and right. H counts from the base.
const WELL_SEGS = 72, SOCKET_SEGS = 48;
// A tube (ri = 0: a solid post) from its base OV under the floor's top: square in the floor, a 45 deg foot c wide at the
// floor, then straight up to H. Anything thin standing on the floor gets one (Joey, 2026-10-23).
export function footedTube(wasm, ri, ro, c, H, segs) {
  const { Manifold, CrossSection } = wasm, ov = C.OV;
  const prof = new CrossSection([[[q(ri), 0], [q(ro + c), 0], [q(ro + c), q(ov)], [q(ro), q(ov + c)], [q(ro), q(H)], [q(ri), q(H)]]]);
  const out = Manifold.revolve(prof, segs); prof.delete();
  return out;
}
function wellSolid(wasm, plan, H) {
  const k = CELLS.wells, ro = plan.foot / 2;
  const ring = footedTube(wasm, ro - k.wall, ro, k.chamfer, H, WELL_SEGS);
  const band = wellBand(wasm, plan, H), out = ring.subtract(band); ring.delete(); band.delete();
  return out;
}
const wellBand = (wasm, plan, H) => {
  const w = plan.notch / 2, L = plan.foot / 2 + CELLS.wells.chamfer + 1;
  return wasm.Manifold.cube([q(2 * w), q(2 * L), q(H + 2)]).translate([-q(w), -q(L), -q(1)]);
};
// the well's footing in plan, as wide as its foot at the floor: what a coloured floor's tile goes round
function wellFootprint(wasm, plan) {
  const { CrossSection } = wasm, k = CELLS.wells, ro = plan.foot / 2, ri = ro - k.wall, w = plan.notch / 2, L = ro + k.chamfer + 1;
  const outer = CrossSection.circle(q(ro + k.chamfer), WELL_SEGS), inner = CrossSection.circle(q(ri), WELL_SEGS), ring = outer.subtract(inner);
  const band = new CrossSection([[[-q(w), -q(L)], [q(w), -q(L)], [q(w), q(L)], [-q(w), q(L)]]]);
  const out = ring.subtract(band);
  for (const cs of [outer, inner, ring, band]) cs.delete();
  return out;
}
// The ribbed block: its (x,z) profile with the V grooves cut in 2D (exact, no shared faces), run front to back between
// the end walls and 0.3 into them.
function washerSolid(wasm, plan) {
  const { Manifold, CrossSection } = wasm, k = CELLS.washers, b = plan.block, th = k.angle * Math.PI / 180;
  const zb = C.FLOOR - C.OV, zt = C.FLOOR + plan.d, ze = C.FLOOR + plan.h, zap = C.FLOOR - k.sink, up = 1;
  const rectCS = (z1) => new CrossSection([[[q(b.x0), q(zb)], [q(b.x1), q(zb)], [q(b.x1), q(z1)], [q(b.x0), q(z1)]]]);
  const half = (zt + up - zap) / Math.tan(th);   // the V runs on 1 mm over the rib tops
  const vs = new CrossSection(plan.rows.map(({ x }) => [[q(x), q(zap)], [q(x + half), q(zt + up)], [q(x - half), q(zt + up)]]));
  const blockCS = rectCS(zt), ribbed = blockCS.subtract(vs), endCS = rectCS(ze);
  const { y0, y1 } = plan.rows[0];
  const parts = [alongY(Manifold, ribbed, q(y0 - C.OV), q(y1 + C.OV)), alongY(Manifold, endCS, q(b.y0), q(y0)), alongY(Manifold, endCS, q(y1), q(b.y1))];
  for (const cs of [vs, blockCS, ribbed, endCS]) cs.delete();
  const u = Manifold.union(parts); parts.forEach((m) => m.delete());
  return u;
}
// What of a coloured floor a compartment's cells take: each well's or socket's footprint, so the colour tile goes round
// them and they grow out of the body's floor instead of standing on the tile. Washer rows take their colour another way
// (floorRegion: the ribs themselves are coloured, v27).
function cellFootprints(wasm, plan, z0, z1) {
  if (!plan || !plan.pts.length || plan.kind === 'washers') return null;
  const { Manifold } = wasm;
  let one;
  if (plan.kind === 'wells') { const cs = wellFootprint(wasm, plan); one = Manifold.extrude(cs, q(z1) - q(z0)); cs.delete(); }
  else { const k = CELLS[plan.kind], r = k.od / 2 + k.foot; one = Manifold.cylinder(q(z1) - q(z0), q(r), q(r), SOCKET_SEGS); }
  const out = plan.pts.map(([x, y]) => one.translate([q(x), q(y), q(z0)]));
  one.delete();
  const u = Manifold.union(out); out.forEach((m) => m.delete());
  return u;
}

// ---------- geometry ----------
// Wide-section end styles. Both hang from the wall top and stay above the holder's 45 deg underside plane,
// so nothing reaches the floor. 'chamfer'/'square' are accepted from older saved layouts.
export const isPlateStyle = (style) => style === 'plate' || style === 'square';

// (y,z) side profile of the holder envelope, relative to (back wall face, wall top), grid units:
// above the plate's underside plane, below the wall top, no deeper than the holder.
function holderSide(CrossSection, h) {
  const gOV = q(C.OV), gD = q(h.D), gzb = -q(h.DROP);
  return new CrossSection([[[gOV, gzb - gOV], [gOV, 0], [-gD, 0], [-gD, gzb + gD]]]);
}
// extrude a (y,z) section along +x over [gxa, gxb]; and an (x,z) section along y over [gya, gyb] (proper rotations)
const alongX = (Manifold, cs, gxa, gxb) => {
  const e = Manifold.extrude(cs, gxb - gxa); const m = e.transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, gxa, 0, 0, 1]); e.delete(); return m;
};
const alongY = (Manifold, cs, gya, gyb) => {
  const e = Manifold.extrude(cs, gyb - gya); const m = e.transform([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, gyb, 0, 1]); e.delete(); return m;
};

// The stamp carries a 0.3 mm sliver of the column wall on its right. In a wide section that wall is gone,
// so the sliver is trimmed to the holder's side profile, where the end piece covers it.
const wideCache = new WeakMap();
function stampForWide(wasm, stamp, h) {
  let out = wideCache.get(stamp);
  if (out) return out;
  const { Manifold, CrossSection } = wasm;
  const gxc = q(C.HOLDER_W);
  const side = holderSide(CrossSection, h);
  const sideP = alongX(Manifold, side, gxc - q(0.1), gxc + q(1));
  const cut = Manifold.cube([q(1), q(h.D + 3), q(h.DROP + 3)]).translate([gxc, -q(h.D + 2), -q(h.DROP + 2)]);
  const outside = cut.subtract(sideP);
  out = stamp.subtract(outside);
  for (const m of [side, sideP, cut, outside]) m.delete();
  wideCache.set(stamp, out);
  return out;
}

// End piece for a section wider than the holder. A 1.5 mm end plate gives the label's right dovetail lip its
// wall back; the pyramid gusset grows from the holder's bottom corner out to a 45 deg chamfer at the wall top.
// When the section is barely wider than the holder, the plate runs on to the right wall instead of leaving a slot.
// Every face is 45 deg or vertical, so it prints without supports. All arguments in grid units.
function endPiece(wasm, h, gxc, gx1, gy1, gtop, style, fill) {
  const { Manifold, CrossSection } = wasm;
  const gw = q(C.WALL), gOV = q(C.OV), gD = q(h.D), gzb = gtop - q(h.DROP);
  const temps = [];
  const side0 = holderSide(CrossSection, h); const side = side0.translate([gy1, gtop]); side0.delete(); temps.push(side);
  const sideP = alongX(Manifold, side, gxc, gx1);
  if (fill) { side.delete(); return sideP; }
  temps.push(sideP);
  const plate = isPlateStyle(style);
  const plan = new CrossSection([plate
    ? [[gxc, gy1 - gD], [gxc + gw, gy1 - gD], [gxc + gw, gy1 + gOV], [gxc, gy1 + gOV]]
    : [[gxc, gy1 - gD], [gxc + gw, gy1 - gD], [gxc + gw + gD + gOV, gy1 + gOV], [gxc, gy1 + gOV]]]);
  temps.push(plan);
  const planP = Manifold.extrude(plan, gtop - (gzb - 2 * gOV)).translate([0, 0, gzb - 2 * gOV]); temps.push(planP);
  let piece = sideP.intersect(planP);
  if (!plate) {
    const front = new CrossSection([[[gxc - gOV, gzb - gOV], [gxc + gw - gOV, gzb - gOV], [gxc + gw + (gtop - gzb), gtop], [gxc - gOV, gtop]]]);
    const frontP = alongY(Manifold, front, gy1 - gD - gOV, gy1 + 2 * gOV);
    temps.push(front, frontP, piece);
    piece = piece.intersect(frontP);
  }
  for (const m of temps) m.delete();
  return piece;
}

// stamps: { small, large } holder manifolds (a single manifold is taken as the small holder)
export function buildInternals(wasm, layoutIn, stamps) {
  const layout = toV2(layoutIn);
  const { Manifold, CrossSection } = wasm;
  const size = SIZES[layout.size];
  const { W, D } = size; const top = size.heights[layout.height].top;
  const { FLOOR, WALL, OV, HOLDER_W } = C;
  const h = holderOf(layout);
  const stamp = typeof stamps.translate === 'function' ? stamps : stamps[h.id];
  if (!stamp) throw new Error(`no ${h.name} holder asset loaded`);
  checkTiling(layout);
  const parts = []; const temps = [];
  const box = (x0, x1, y0, y1, z0, z1) => {
    const a = [q(x0), q(y0), q(z0)], b = [q(x1), q(y1), q(z1)];
    return Manifold.cube([b[0] - a[0], b[1] - a[1], b[2] - a[2]]).translate(a);
  };
  const poly = (pts) => { const cs = new CrossSection([pts.map(([u, v]) => [q(u), q(v)])]); temps.push(cs); return cs; };
  const keep = (m) => { parts.push(m); return m; };

  keep(box(-OV, W + OV, -OV, D + OV, 0, FLOOR));

  // Every divider wall is drawn in plan and extruded once, so the whole layout shares a single top face;
  // overlapping coplanar tops leave pinched vertices. Each internal edge of a compartment gets a wall strip
  // that runs one wall thickness past both corners to fill the junctions.
  const gw = q(WALL), lim = [-q(OV), q(W + OV), -q(OV), q(D + OV)];
  const strips = new Map();
  const strip = (a, b, c, d) => {
    a = Math.max(a, lim[0]); b = Math.min(b, lim[1]); c = Math.max(c, lim[2]); d = Math.min(d, lim[3]);
    if (b > a && d > c) strips.set(`${a},${b},${c},${d}`, [[a, c], [b, c], [b, d], [a, d]]);
  };
  for (const c of layout.comps) {
    const X0 = q(c.x0), X1 = q(c.x1), Y0 = q(c.y0), Y1 = q(c.y1);
    if (X0 > 0) strip(X0 - gw, X0, Y0 - gw, Y1 + gw);
    if (X1 < q(W)) strip(X1, X1 + gw, Y0 - gw, Y1 + gw);
    if (Y0 > 0) strip(X0 - gw, X1 + gw, Y0 - gw, Y0);
    if (Y1 < q(D)) strip(X0 - gw, X1 + gw, Y1, Y1 + gw);
  }

  for (const c of layout.comps) {
    const { x0, x1, y0, y1 } = c;
    // front scoop, profile in (y,z), extruded along x
    const S = scoopSize(layout, c);
    if (S > 0) keep(alongX(Manifold, poly([[y0 - OV, FLOOR - OV], [y0 + S, FLOOR - OV], [y0 + S, FLOOR], [y0, FLOOR + S], [y0 - OV, FLOOR + S]]), q(x0 - OV), q(x1 + OV)));
    // tray: the same 45 deg ramp along both sides (x,z along y) and the back (y,z along x)
    const t = traySize(layout, c);
    if (t > 0) {
      keep(alongY(Manifold, poly([[x0 - OV, FLOOR - OV], [x0 + t, FLOOR - OV], [x0 + t, FLOOR], [x0, FLOOR + t], [x0 - OV, FLOOR + t]]), q(y0 - OV), q(y1 + OV)));
      keep(alongY(Manifold, poly([[x1 - t, FLOOR - OV], [x1 + OV, FLOOR - OV], [x1 + OV, FLOOR + t], [x1, FLOOR + t], [x1 - t, FLOOR]]), q(y0 - OV), q(y1 + OV)));
      keep(alongX(Manifold, poly([[y1 - t, FLOOR - OV], [y1 + OV, FLOOR - OV], [y1 + OV, FLOOR + t], [y1, FLOOR + t], [y1 - t, FLOOR]]), q(x0 - OV), q(x1 + OV)));
    }
    if (hasHolder(layout, c)) {
      const wide = x1 - x0 > HOLDER_W + 1e-6;
      keep((wide ? stampForWide(wasm, stamp, h) : stamp).translate([q(x0), q(y1), q(top)]));
      if (wide) keep(endPiece(wasm, h, q(x0 + HOLDER_W), q(x1 + OV), q(y1), q(top), layout.style, x1 - x0 < HOLDER_W + C.END_FILL));
    }
    const cp = cellPlan(layout, c);
    if (cp && cp.pts.length) keep(cellSolids(wasm, cp));
  }
  if (strips.size) {
    const walls2d = new CrossSection([...strips.values()]);   // overlapping strips: Positive fill unions them
    temps.push(walls2d);
    keep(Manifold.extrude(walls2d, q(top) - q(FLOOR - OV)).translate([0, 0, q(FLOOR - OV)]));
  }
  const out = Manifold.union(parts);
  for (const m of parts.concat(temps)) m.delete();
  return out;
}

// Booleans of many coplanar top faces can leave a needle triangle with an edge far below 0.1 um. Exported to
// float32 STL, its two ends land on the same point and slicers see non-manifold edges. Snap every vertex to the
// modelling grid, collapse what lands together, drop the degenerate and zero-volume faces, and keep the result
// only if it is still a valid solid of the same volume.
export function cleanMesh(wasm, m) {
  const mesh = m.getMesh(); const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts;
  const nv = vp.length / np; const key = new Map(); const remap = new Uint32Array(nv); const verts = []; let merged = 0;
  for (let v = 0; v < nv; v++) {
    const x = Math.round(vp[v * np]), y = Math.round(vp[v * np + 1]), z = Math.round(vp[v * np + 2]);
    const k = x + ',' + y + ',' + z; let id = key.get(k);
    if (id === undefined) { id = verts.length / 3; key.set(k, id); verts.push(x, y, z); } else merged++;
    remap[v] = id;
  }
  if (!merged) return m;
  const faces = new Map();
  for (let t = 0; t < tv.length; t += 3) {
    const a = remap[tv[t]], b = remap[tv[t + 1]], c = remap[tv[t + 2]];
    if (a === b || b === c || a === c) continue;
    const k = [a, b, c].sort((p, q) => p - q).join(',');
    if (faces.has(k)) faces.delete(k); else faces.set(k, [a, b, c]);   // a face and its twin enclose no volume
  }
  try {
    const out = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: Float32Array.from(verts), triVerts: Uint32Array.from([...faces.values()].flat()) }));
    if (out.status() === 'NoError' && Math.abs(out.volume() - m.volume()) <= 1e-6 * m.volume()) { m.delete(); return out; }
    out.delete();
  } catch { /* keep the original */ }
  return m;
}

// Marks cut into the drawer, all as 0.4 mm recesses (two layers):
//   opts.outlines   [{ comp, polys }] part outlines on compartment floors (mm). On a coloured floor the outline is
//                   left in the body colour instead (see buildParts), so it is only cut where the floor is plain.
//   opts.bottomMark polys on the underside (the layout code), already mirrored to read from below.
// (opts.bead, the cover beads' height, is for the cover test pieces only.)
export const DEBOSS = 0.4;
// close: grow then shrink by this much (mm) so shapes that only touch at a corner, like block-font pixels on a diagonal,
// join with a small bridge; a corner-only contact would weld into a non-manifold edge.
function prism(wasm, polys, z0, z1, close = 0) {
  let cs = new wasm.CrossSection(polys.map((p) => p.map(([x, y]) => [q(x), q(y)])));
  if (close) { const a = cs.offset(q(close), 'Round', 2, 12); const b = a.offset(-q(close), 'Round', 2, 12); cs.delete(); a.delete(); cs = b; }
  const m = wasm.Manifold.extrude(cs, q(z1) - q(z0)).translate([0, 0, q(z0)]); cs.delete(); return m;
}
export function buildDrawer(wasm, layoutIn, assets, opts = {}) {
  const layout = toV2(layoutIn);
  const internals = buildInternals(wasm, layout, assets.stamps || assets.stamp);
  const shell = shellFor(wasm, assets, layout.size, layout.height);
  let out = wasm.Manifold.union(shell, internals);
  internals.delete();
  if (layout.covers) { const beads = coverBeads(wasm, layout, opts.bead); if (beads) { const u = wasm.Manifold.union(out, beads); out.delete(); beads.delete(); out = u; } }
  const cuts = [];
  for (const o of opts.outlines || []) if (!floorColorOf(layout, layout.comps[o.comp])) cuts.push(prism(wasm, o.polys, C.FLOOR - DEBOSS, C.FLOOR + C.OV));
  if (opts.bottomMark && opts.bottomMark.length) cuts.push(prism(wasm, opts.bottomMark, -C.OV, DEBOSS, 0.12));
  if (cuts.length) { const u = wasm.Manifold.union(cuts); const cut = out.subtract(u); for (const m of [...cuts, u, out]) m.delete(); out = cut; }
  return cleanMesh(wasm, out);
}

export const grams = (manifold) => manifold.volume() / U ** 3 / 1000 * C.PLA;

// ---------- floor colours ----------
// layout.floor = { mode: 'off' | 'one' | 'paint', colors: ['#rrggbb', ...] }. In 'one' every floor takes colors[0];
// in 'paint' each compartment's color (1..n) picks a palette slot and 0 keeps the body colour.
// The colour is the top SKIN of the visible floor (inside the scoop and tray ramps): three 0.2 mm layers,
// so a multi-material printer only swaps filament for a few layers.
export const SKIN = 0.6;
export const MAX_FLOOR_COLORS = 4;
export function floorColorOf(layout, c) {
  const f = layout.floor; if (!f || f.mode === 'off' || !f.colors?.length) return 0;
  if (f.mode === 'one') return 1;
  return c.color >= 1 && c.color <= f.colors.length ? c.color : 0;
}
// What of a compartment takes its floor colour. Usually the flat floor inside the ramps (floorRect), its top SKIN.
// Washer rows (v27, Joey: the part the washers stand on should be the floor colour like the other floors): the ribbed
// floor between the end walls, from SKIN under the floor up through the ribs (ribs: their top above the bed). The end
// walls stay body colour and grow from the body's floor, like the wells. The region stops RIB_IN short of the walls and
// end walls: cut flush with a face that stands above the ribs, the colour part picks up zero-thickness sheets.
const RIB_IN = 0.05;
export function floorRegion(layoutIn, c) {
  const layout = toV2(layoutIn);
  const cp = cellKind(c) === 'washers' ? cellPlan(layout, c) : null;
  if (cp && cp.rows.length) {
    const r = openFloorRect(layout, c), w = cp.rows[0], e = RIB_IN;
    return { x0: snapMM(r.x0 + e), x1: snapMM(r.x1 - e), y0: snapMM(w.y0 + e), y1: snapMM(w.y1 - e), ribs: snapMM(C.FLOOR + cp.d), plan: cp };
  }
  return floorRect(layout, c);
}
// the colour volume of a washer-row region (mm3): the skin and the ribs, less the grooves
function ribVolume(r) {
  const k = CELLS.washers, tn = Math.tan(k.angle * Math.PI / 180), p = r.plan, d = p.d;
  const groove = (k.sink / tn + p.hw) * d;   // above the floor; under it the floor slab fills the groove's tip
  return (r.y1 - r.y0) * ((r.x1 - r.x0) * (SKIN + d) - p.rows.length * groove);
}
export function floorRects(layout) {
  const out = [];
  layout.comps.forEach((c, i) => {
    const k = floorColorOf(layout, c); if (!k) return;
    const r = floorRegion(layout, c); if (r.x1 - r.x0 < 1 || r.y1 - r.y0 < 1) return;
    out.push({ x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, color: k, comp: i, ...(r.ribs ? { ribs: r.ribs, vol: ribVolume(r) } : {}) });
  });
  return out;
}
// Printable parts: the body with a recess under every coloured floor, and one solid per floor colour that fills it
// exactly. They share faces, so slicers treat them as parts of one object.
export function buildParts(wasm, layoutIn, assets, opts = {}) {
  const layout = toV2(layoutIn); const { Manifold } = wasm;
  const drawer = buildDrawer(wasm, layout, assets, opts);
  const rects = floorRects(layout);
  if (!rects.length) return { body: drawer, floors: [] };
  const outline = new Map((opts.outlines || []).map((o) => [o.comp, o.polys]));
  const box = (r, z0, z1) => Manifold.cube([q(r.x1) - q(r.x0), q(r.y1) - q(r.y0), q(z1) - q(z0)]).translate([q(r.x0), q(r.y0), q(z0)]);
  // a floor tile, minus its part outline (which stays body colour) and its cells' footprints; the cutters overshoot both faces
  const tile = (r, z1) => {
    let b = box(r, C.FLOOR - SKIN, z1); const p = outline.get(r.comp);
    const cuts = [p ? prism(wasm, p, C.FLOOR - SKIN - 0.1, C.FLOOR + C.OV + 0.1) : null, cellFootprints(wasm, cellPlan(layout, layout.comps[r.comp]), C.FLOOR - SKIN - 0.1, C.FLOOR + C.OV + 0.1)];
    for (const o of cuts) if (o) { const t = b.subtract(o); b.delete(); o.delete(); b = t; }
    return b;
  };
  // washer rows: the box over the ribs and the air above them; the colour part is what of the drawer is in it, so the
  // two parts share every face exactly
  const ribBox = (r) => box(r, C.FLOOR - SKIN, r.ribs + 1);
  const ribPart = (r) => { const b = ribBox(r), p = drawer.intersect(b); b.delete(); return p; };
  // the cutters reach 0.3 mm above the floor so the cut never leans on a coplanar face
  const cutters = rects.map((r) => (r.ribs ? ribBox(r) : tile(r, C.FLOOR + C.OV)));
  const cut = Manifold.union(cutters);
  const body = cleanMesh(wasm, drawer.subtract(cut));
  const floors = [];
  for (const k of [...new Set(rects.map((r) => r.color))].sort()) {
    const tiles = rects.filter((r) => r.color === k).map((r) => (r.ribs ? ribPart(r) : tile(r, C.FLOOR)));
    floors.push({ color: k, part: cleanMesh(wasm, Manifold.union(tiles)) });
    tiles.forEach((m) => m.delete());
  }
  for (const m of [...cutters, cut, drawer]) m.delete();
  return { body, floors };
}


// ---------- lid ----------
// An everyday lid that drops inside the drawer's rim: a 0.8 skin resting on the divider tops, its top 2.2 below the
// rim, so the drawer stoppers' tabs (STOPPER) pass 0.48 over it. Under the skin a lip rings each compartment just inside
// its walls and reaches 3.5 below the divider tops, so the lid can't slide and parts can't creep from one compartment
// to the next; ribs hang 2.0 below it across big compartments. A fingertip pull near the front lifts it out. In a case
// the bay's ceiling sits CASE_GAP above the rim, so the lid can rise at most CASE_GAP plus its recess below the rim
// (2.48); the lips reach deeper than that, so even a lifted lid still rings every compartment. Nothing about the drawer
// changes. (v12-v16 had a 2.4 lid with its top 0.6 under the rim: it ran into the stoppers.)
export const LID = Object.freeze({
  CLEAR: 0.3,     // gap to the rim's inner face, per side
  T: 0.8,         // the skin, on the divider tops: four 0.2 layers, its top 2.2 below the rim
  CHAMFER: 0.4,   // round the top edge (the face that prints on the bed)
  R: 0.8,         // corner radius
  LIP: 1.2, LIP_H: 3.5, LIP_GAP: 0.4,   // lip width, depth below the divider tops, clearance to the walls
  RIB: 1.2, RIB_H: 2.0, SPAN: 45,       // ribs under the skin across compartments wider or deeper than SPAN
  HOOK: 0.4,      // round the pull the lid thickens this far below the divider tops, so a fingertip pulls on 1.2
  CUP: Object.freeze({ D: 5, MIN_D: 3 }),   // the pull's cup: how far below the divider tops it reaches, and the least it may (PULL has the sizes)
  CASE_GAP: 0.28,   // the bay's ceiling above the drawer rim (planner viewer placement, cover-structure report 2026-10-21)
});
// The drawer stoppers (planner hardware, a pair per 1W column) seat in the bay's ceiling, the Cover Lower or the case
// above, about 2 mm behind the case front, and each hangs a 1.5 thick tab 2.0 below it (viewer/js/generate.js placement
// and Drawer_Stoppers_L/R.lib.glb; checked 2026-10-22, node0's vault agrees). That is 1.72 below the drawer rim, and
// everything in the drawer slides under it as the drawer opens. Lids and covers keep their tops MIN_CLEAR under it.
export const STOPPER = Object.freeze({ HANG: 2.0, T: 1.5, MIN_CLEAR: 0.4 });
export const stopperDepth = () => snapMM(STOPPER.HANG - LID.CASE_GAP);   // the tabs' reach below the drawer rim
// how far a part whose top stands `above` over the divider tops clears the stopper tabs
export const stopperClearance = (size, height, above) => { const h = SIZES[size].heights[height]; return snapMM(h.rim - h.top - above - stopperDepth()); };

// ---------- pulls (lid and covers) ----------
// Two kinds, both an opening through the top over a closed cup that reaches U past the opening's long edge, so
// something can get under the top and lift:
//  FINGER (the lid): a fingertip goes in and hooks under one edge. L spans the fingertip's breadth and W its thickness.
//    For scale, the index finger at its last joint is 15.5 x 13.0 mm for the median man (95th percentile 17.1 x 14.4)
//    and 13.8 x 11.5 for the median woman (AIST hand dimension data); only the tip, a little smaller, goes in. Standard
//    20 x 11 with a 3 mm hook, narrow 20 x 9 with 2.5. Turned 'x' the hook faces the front (a finger reaching in from
//    the front), turned 'y' it faces right (a finger reaching in from the right).
//  NAIL (the covers): a thin slot over a shallow divot that reaches under the top on both long sides, so a fingernail,
//    a coin or a small flat screwdriver catches whichever way it comes in. 12 x 6, or 9 x 6 where 12 won't fit across (6 front to back since v17: at 3, Joey's printed test, a
//    nail had to come in too steep).
//    It barely reaches into the compartment and fits every cell a 10-column grid makes.
// R: corner radius of the opening and cavity (null: half the opening's width, a stadium). CH: a 45 deg chamfer round the
// opening's top edge, where the nail goes in; the plate's underside, where the nail catches, stays square.
export const PULL = Object.freeze({
  FINGER: Object.freeze({ kind: 'finger', SIZES: Object.freeze([Object.freeze({ id: 'standard', L: 20, W: 11, U: 3 }), Object.freeze({ id: 'narrow', L: 20, W: 9, U: 2.5 })]), WALL: 1.0, BOTH: false, R: null }),
  NAIL: Object.freeze({ kind: 'nail', SIZES: Object.freeze([Object.freeze({ id: 'slot', L: 12, W: 6, U: 1.5 }), Object.freeze({ id: 'short', L: 9, W: 6, U: 1.5 })]), WALL: 0.8, BOTH: true, R: 0.75, CH: 0.4 }),
  CLEAR: 0.8,   // the cup's floor stays this far above a scoop or tray ramp
});
const V = (F, P, along) => Object.freeze({ F, P, along });
// in order of preference: the finger pulls by size, each across then front to back; the nail slots across first (a
// short one across beats a long one turned)
export const FINGER_VARIANTS = Object.freeze(PULL.FINGER.SIZES.flatMap((P) => [V(PULL.FINGER, P, 'x'), V(PULL.FINGER, P, 'y')]));
export const NAIL_VARIANTS = Object.freeze([...PULL.NAIL.SIZES.map((P) => V(PULL.NAIL, P, 'x')), ...PULL.NAIL.SIZES.map((P) => V(PULL.NAIL, P, 'y'))]);
// the cavity's size (across, front to back) and the cup's footprint with its walls, for a variant
const cavSize = ({ F, P, along }) => { const n = P.W + P.U * (F.BOTH ? 2 : 1); return along === 'x' ? [P.L, n] : [n, P.L]; };
export const pullBox = (v) => cavSize(v).map((x) => x + 2 * v.F.WALL);
// Fit a pull into room = [x0, x1, y0, y1], the part of compartment c the cup may use: front-most and as near xPref (the
// compartment's middle by default) as the room allows, with the cup's floor clear of the scoop and tray ramps. If the
// scoop would leave the cup shorter than D, the cup moves back until it clears. D is how far below the divider tops the
// cavity reaches, MIN_D the least it may. variants: which kinds, sizes and turns to try, in order of preference.
export function fitPull(layout, c, room, D, MIN_D, variants) {
  return fitPullAt(layout, c, room, D, MIN_D, variants, (c.x0 + c.x1) / 2);
}
function fitPullAt(layout, c, room, D, MIN_D, variants, xPref) {
  const top = SIZES[layout.size].heights[layout.height].top;
  const S = scoopSize(layout, c), t = traySize(layout, c);
  for (const v of variants) {
    const { F, P, along } = v, Wl = F.WALL, [ow, od] = pullBox(v);
    if (ow > room[1] - room[0] + 1e-6 || od > room[3] - room[2] + 1e-6) continue;
    const cx = snapMM(Math.min(room[1] - ow / 2, Math.max(room[0] + ow / 2, xPref)));
    const xL = snapMM(cx - ow / 2), xR = snapMM(xL + ow);
    let yF = room[2];
    if (S > 0) yF = Math.max(yF, Math.min(snapMM(c.y0 + C.FLOOR + S - (top - D - Wl - PULL.CLEAR)), room[3] - od));
    const yB = snapMM(yF + od);
    let ramp = C.FLOOR;
    if (S > 0) ramp = Math.max(ramp, C.FLOOR + S - (yF - c.y0));
    if (t > 0) ramp = Math.max(ramp, C.FLOOR + t - (xL - c.x0), C.FLOOR + t - (c.x1 - xR), C.FLOOR + t - (c.y1 - yB));
    const depth = snapMM(Math.min(D, top - Wl - PULL.CLEAR - ramp));
    if (depth < MIN_D - 1e-6) continue;
    // the opening sits U in from the cavity's front (or left) edge, or at its left edge when a finger hook faces right
    const x0 = xL + Wl, y0 = yF + Wl, [cw, cd] = cavSize(v), sx = F.BOTH ? P.U : 0;
    const open = along === 'x' ? [x0, x0 + P.L, y0 + P.U, y0 + P.U + P.W] : [x0 + sx, x0 + sx + P.W, y0, y0 + P.L];
    const cav = [x0, x0 + cw, y0, y0 + cd];
    return { kind: F.kind, F, P, along, depth, open: open.map(snapMM), cav: cav.map(snapMM), box: [xL, xR, yF, yB], cx: snapMM((open[0] + open[1]) / 2), cy: snapMM((open[2] + open[3]) / 2) };
  }
  return null;
}
// the cup and its cuts for a fitted pull: walls from the cup floor up to zWall, the cavity up to zCav, and the opening
// from zOpen up through the top (z1)
function pullSolids(Manifold, rr, pl, top, zWall, zCav, zOpen, z1) {
  const { open, cav, depth, F } = pl, Wl = F.WALL, r = F.R ?? Math.min(open[1] - open[0], open[3] - open[2]) / 2;
  return {
    part: slab(Manifold, rr(cav[0] - Wl, cav[1] + Wl, cav[2] - Wl, cav[3] + Wl, r + Wl), top - depth - Wl, zWall),
    cuts: [slab(Manifold, rr(...cav, r), top - depth, zCav), slab(Manifold, rr(...open, r), zOpen, z1)],
  };
}
// how far a lid can lift inside a case, and how deep its lips still reach below the divider tops when it has
export const lidRise = (size = '240-2W', height = '0.5H') => { const h = SIZES[size].heights[height]; return snapMM(LID.CASE_GAP + (h.rim - h.top - LID.T)); };

// rectangles and rounded rectangles on the modelling grid
function roundRect(CrossSection, x0, x1, y0, y1, r, seg = 8) {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2 - 1e-3, (y1 - y0) / 2 - 1e-3));
  const base = new CrossSection([[[q(x0 + r), q(y0 + r)], [q(x1 - r), q(y0 + r)], [q(x1 - r), q(y1 - r)], [q(x0 + r), q(y1 - r)]]]);
  if (r <= 0) return base;
  const out = base.offset(q(r), 'Round', 2, seg * 4); base.delete();
  const snapped = new CrossSection(out.toPolygons().map((p) => p.map(([x, y]) => [Math.round(x), Math.round(y)]))); out.delete();
  return snapped;
}
const slab = (Manifold, cs, z0, z1) => Manifold.extrude(cs, q(z1) - q(z0)).translate([0, 0, q(z0)]);
// A polygon (mm) with its inside corners rounded by rIn and its outside corners by rOut, snapped to the grid.
function roundPoly(CrossSection, pts, rIn, rOut, seg = 8) {
  let cs = new CrossSection([ccw(pts).map(([x, y]) => [q(x), q(y)])]);
  const step = (d) => { const o = cs.offset(q(d), 'Round', 2, seg * 4); cs.delete(); cs = o; };
  if (rIn > 0) { step(rIn); step(-rIn); }
  if (rOut > 0) { step(-rOut); step(rOut); }
  const snapped = new CrossSection(cs.toPolygons().map((p) => p.map(([x, y]) => [Math.round(x), Math.round(y)]))); cs.delete();
  return snapped;
}

// Where the pull goes: the biggest pull that fits anywhere (standard across, standard front to back, then the narrow
// ones), in the front-most compartment nearest the middle that takes it, its cup clear of any scoop or tray ramp. Every
// compartment at least 14.3 x 23.4 mm (or 22.8 x 14.9) takes one. opts.within = [x0, x1, y0, y1] keeps it inside a
// region (the test pieces).
export function lidPull(layoutIn, opts = {}) {
  const layout = toV2(layoutIn); const { W } = SIZES[layout.size];
  const g = LID.LIP_GAP, w = opts.within;
  const mid = (c) => Math.abs((c.x0 + c.x1) / 2 - W / 2);
  const order = layout.comps.map((c, i) => i).sort((a, b) => layout.comps[a].y0 - layout.comps[b].y0 || mid(layout.comps[a]) - mid(layout.comps[b]));
  const rooms = order.map((i) => {
    const c = layout.comps[i], yMax = hasHolder(layout, c) ? c.y1 - holderOf(layout).D : c.y1;
    const r = [c.x0 + g, c.x1 - g, c.y0 + g + 0.6, yMax - g];
    return w ? [Math.max(r[0], w[0]), Math.min(r[1], w[1]), Math.max(r[2], w[2]), Math.min(r[3], w[3])] : r;
  });
  for (const v of FINGER_VARIANTS) for (let k = 0; k < order.length; k++) {
    if (layout.comps[order[k]].cell) continue;          // the cup would hang into a cell's parts
    const pl = fitPullAt(layout, layout.comps[order[k]], rooms[k], LID.CUP.D, LID.CUP.MIN_D, [v], W / 2);
    if (pl) return { comp: order[k], ...pl };
  }
  return null;
}
// the smallest compartment that takes a pull, for messages: [width, depth], from the smallest pull turned the
// thinner way (front to back for the lid's finger pull, across for a cover's nail slot), with the room round it
export const pullRoomMin = (kind = 'lid') => {
  if (kind === 'lid') { const [ow, od] = pullBox(FINGER_VARIANTS[FINGER_VARIANTS.length - 1]); return [snapMM(ow + 2 * LID.LIP_GAP), snapMM(od + 2 * LID.LIP_GAP + 0.6)]; }
  const g = COVER.GAP + COVER.SKIRT, [ow, od] = pullBox(NAIL_VARIANTS[1]);
  return [snapMM(ow + 2 * g), snapMM(od + 2 * g + COVER.FRONT)];
};

// The lid in the drawer frame, seated: the skin on the divider tops; under it a lip ringing each compartment, ribs
// across big ones and the pull's cup. opts.pull: a lidPull() result, or null for none.
// A compartment's lid lip: the ring's outline { x0, x1, y0, y1 }, its inside (inner: [x0, x1, y0, y1], when it is a ring)
// and how many stiffening ribs cross it each way (nx, ny); null when the compartment is too small for a lip.
export function lidRing(layout, c) {
  const { LIP, LIP_GAP: g, SPAN } = LID;
  const yMax = hasHolder(layout, c) ? c.y1 - holderOf(layout).D : c.y1;
  const x0 = c.x0 + g, x1 = c.x1 - g, y0 = c.y0 + g, y1 = yMax - g;
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;
  if (!(x1 - x0 > 2 * LIP + 2 && y1 - y0 > 2 * LIP + 2)) return { x0, x1, y0, y1, inner: null, nx: 0, ny: 0 };
  const inner = [x0 + LIP, x1 - LIP, y0 + LIP, y1 - LIP];
  return { x0, x1, y0, y1, inner, nx: Math.ceil((inner[1] - inner[0]) / SPAN) - 1, ny: Math.ceil((inner[3] - inner[2]) / SPAN) - 1 };
}
export function buildLid(wasm, layoutIn, opts = {}) {
  const layout = toV2(layoutIn); const { Manifold, CrossSection } = wasm;
  const size = SIZES[layout.size]; const { W, D } = size; const top = size.heights[layout.height].top;
  const { CLEAR: cl, T, CHAMFER: ch, LIP, LIP_H, LIP_GAP: g } = LID;
  checkTiling(layout);
  const parts = [], cuts = [], temps = [];
  const rr = (...a) => { const cs = roundRect(CrossSection, ...a); temps.push(cs); return cs; };
  const keep = (cs) => { temps.push(cs); return cs; };
  // skin, as a hull of its full outline and the outline inset by the chamfer, so the top edge is chamfered
  const lo = slab(Manifold, rr(cl, W - cl, cl, D - cl, LID.R), top, top + T - ch);
  const hi = slab(Manifold, rr(cl + ch, W - cl - ch, cl + ch, D - cl - ch, Math.max(0.1, LID.R - ch)), top + T - ch, top + T);
  parts.push(Manifold.hull([lo, hi])); lo.delete(); hi.delete();
  const outline = rr(cl, W - cl, cl, D - cl, LID.R);
  const stiff = [];
  // lips: a ring just inside each compartment, in front of its label holder, from LIP_H below the divider tops up into
  // the skin; ribs across the ring where it spans more than SPAN (lidRing)
  for (const c of layout.comps) {
    const lr = lidRing(layout, c); if (!lr) continue;
    const { x0, x1, y0, y1 } = lr;
    const outer = rr(x0, x1, y0, y1, 1.0);
    let ring = outer;
    if (lr.inner) {
      ring = keep(outer.subtract(rr(x0 + LIP, x1 - LIP, y0 + LIP, y1 - LIP, 0.4)));
      const [ix0, ix1, iy0, iy1] = lr.inner, { nx, ny } = lr, r2 = LID.RIB / 2;
      for (let k = 1; k <= nx; k++) { const x = ix0 + ((ix1 - ix0) * k) / (nx + 1); stiff.push([[q(x - r2), q(iy0 - 0.1)], [q(x + r2), q(iy0 - 0.1)], [q(x + r2), q(iy1 + 0.1)], [q(x - r2), q(iy1 + 0.1)]]); }
      for (let k = 1; k <= ny; k++) { const y = iy0 + ((iy1 - iy0) * k) / (ny + 1); stiff.push([[q(ix0 - 0.1), q(y - r2)], [q(ix1 + 0.1), q(y - r2)], [q(ix1 + 0.1), q(y + r2)], [q(ix0 - 0.1), q(y + r2)]]); }
    }
    parts.push(slab(Manifold, ring, top - LIP_H, top + C.OV));
  }
  if (stiff.length) parts.push(slab(Manifold, keep(keep(new CrossSection(stiff)).intersect(outline)), top - LID.RIB_H, top + C.OV));
  // pull: an opening through the skin over a closed cup that reaches past one edge, so a fingertip hooks under the
  // skin, which is HOOK thicker round the cup
  const pull = opts.pull === undefined ? lidPull(layout) : opts.pull;
  if (pull) {
    const s = pullSolids(Manifold, rr, pull, top, top + C.OV, top - LID.HOOK, top - LID.HOOK - 0.05, top + T + 0.1);
    parts.push(s.part); cuts.push(...s.cuts);
  }
  let lid = Manifold.union(parts);
  if (cuts.length) { const u = Manifold.union(cuts); const out = lid.subtract(u); lid.delete(); u.delete(); lid = out; }
  for (const m of parts.concat(cuts)) m.delete();
  for (const t of temps) t.delete();
  return cleanMesh(wasm, lid);
}

// the lid as it prints: top face down
export function lidForPrint(wasm, lid) {
  const r = lid.rotate([180, 0, 0]); const b = r.boundingBox();
  const out = r.translate([-b.min[0], -b.min[1], -b.min[2]]); r.delete(); return out;
}

// Test pieces: the drawer's front-left corner and the matching corner of its lid (with the pull moved into it), so a
// short print checks the fit, the lips and the pull.
export const LID_TEST = Object.freeze({ x1: 70, y1: 76 });
export function lidTestPieces(wasm, layoutIn, assets) {
  const layout = toV2(layoutIn); const { Manifold } = wasm; const { x1, y1 } = LID_TEST;
  const R = SIZES[layout.size].heights[layout.height].rim;
  const pull = lidPull(layout, { within: [0, x1 - 2, 0, y1 - 2] });
  const box = (a, b, c, d, z0, z1) => Manifold.cube([q(b) - q(a), q(d) - q(c), q(z1) - q(z0)]).translate([q(a), q(c), q(z0)]);
  const drawer = buildDrawer(wasm, layout, assets); const dBox = box(-3, x1, -5, y1, -1, R + 1);
  const dc = drawer.intersect(dBox); drawer.delete(); dBox.delete();
  const lid = buildLid(wasm, layout, { pull }); const lBox = box(-1, x1, -1, y1, -20, R + 5);
  const lc = lid.intersect(lBox); lid.delete(); lBox.delete();
  return { drawer: cleanMesh(wasm, dc), lid: cleanMesh(wasm, lc), pull };
}

// ---------- compartment covers ----------
// Individual covers, one per compartment, instead of the one-piece lid. Each is a plate that sits on the divider tops
// round its compartment (0.6 onto each divider, so neighbours keep a 0.3 gap; 0.3 short of the rim) with a 1.0 skirt
// hanging 3.6 into the compartment 0.3 inside its walls. Over the dividers the plate is 0.8, so its top sits 2.2 under
// the rim and the drawer stoppers' tabs (STOPPER) pass 0.48 over it; inside the skirt it is 1.2, hanging 0.4 below the
// divider tops, so the panel and the nail lip keep their stiffness. Every cover lifts by a nail slot (PULL.NAIL) near
// the front of its compartment, inside the skirt: a thin slot over a shallow divot that reaches under the plate on
// both sides, for a fingernail, a coin or a small screwdriver. It fits any compartment about 13 x 10 mm or bigger (plus
// the label holder's depth); smaller ones stay open. Over a label holder the plate leaves the label open (coverOutline).
// They snap: the drawer gets a small 45 deg bead in the middle of each wall face round a covered compartment, divider or
// outer wall (inside only), where the side is long enough for a WIN_MIN window, and a window in the skirt clicks over
// it. The strip of skirt under each window is the spring. Covers print top face down, so that strip bends along its
// layers; up to 20 long, it keeps its strain near 1 % even against a stiff outer wall, and it does most of the
// flexing, so the snap varies less with where the bead is. (v13-v16: 11 mm windows, beads on dividers only.)
export const COVER = Object.freeze({
  T: 0.8, INNER: 0.4, OVER: 0.6, CLEAR: 0.3, R: 0.5,   // plate over the dividers, extra inside the skirt, reach onto a divider, gap to the rim, corner radius
  SKIRT: 1.0, SKIRT_H: 3.6, GAP: 0.3,             // skirt: thickness, depth below the divider tops, clearance to the walls
  BEAD: 0.7, BEAD_LEN: 10, BEAD_Z: 1.8,           // bead: reach from the wall, length, its tip below the divider tops
  WIN_Z: 0.8,                                     // skirt window half-height round the bead tip: 0.3 of side play, 0.3 of lift before it catches
  WIN_MAX: 20, WIN_MIN: 16, WIN_END: 2.6, WIN_R: 0.5,   // window length (the strip's span), the least that gets a bead, skirt kept at each end, corner radius
  WIN_END_WALL: 5.4,                              // skirt kept at each end on an outer wall, where the plate ends flush with the skirt (shorter ends
                                                  // there and PrusaSlicer flags the strip's bridge as loose extrusions on narrow cells)
  WIN_IN: 1.0,                                    // how far the plate reaches over the label's front edge (and right end, beside a leg)
  NOTCH_R: 1.0,                                   // the inside corner of an L cover, rounded
  CUP: Object.freeze({ D: 2.0, MIN_D: 1.6 }),     // the nail slot's divot below the divider tops, and the least it may reach (1.6 / 1.2 under the 1.2 panel)
  FRONT: 0.2,                                     // the divot stays this far behind the skirt, clear of the front bead's window
});
// the nail slot for a cover: inside the skirt, in front of any label holder (layout already in v2 form)
function coverPullV2(layout, c) {
  const g = COVER.GAP + COVER.SKIRT, yMax = hasHolder(layout, c) ? c.y1 - holderOf(layout).D : c.y1;
  return fitPull(layout, c, [c.x0 + g, c.x1 - g, c.y0 + g + COVER.FRONT, yMax - g], COVER.CUP.D, COVER.CUP.MIN_D, NAIL_VARIANTS);
}
export const coverPull = (layoutIn, c) => coverPullV2(toV2(layoutIn), c);
// a compartment gets a cover when covers are on, it isn't turned off, a nail slot fits and at least two of its sides
// take a snap (one snap would let a cover tilt about it)
const coverFits = (layout, c) => !!coverPullV2(layout, c) && coverSides(layout, c).length >= 2;
export const isCovered = (layout, c) => !!layout.covers && !c.nocover && coverFits(layout, c);
export const coverMinSide = () => snapMM(COVER.WIN_MIN + 2 * COVER.WIN_END);   // the shortest side that takes a snap
const ccw = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; } return a < 0 ? pts.slice().reverse() : pts; };
// where the beads go round a covered compartment: the middle of each wall face, divider or outer wall, clear of the
// label holder, whose side leaves room for a window of at least WIN_MIN. win is the window's length, len the bead's.
export function coverSides(layoutIn, c) {
  const layout = toV2(layoutIn); const K = COVER;
  const holder = hasHolder(layout, c), yMax = holder ? c.y1 - holderOf(layout).D : c.y1;
  const { W, D } = SIZES[layout.size], out = [];
  const add = (axis, sign, face, a, b) => {
    const wall = face < 1e-6 || (axis === 'x' ? face > W - 1e-6 : face > D - 1e-6);
    const win = Math.min(K.WIN_MAX, b - a - 2 * (wall ? K.WIN_END_WALL : K.WIN_END));
    if (win < K.WIN_MIN - 1e-6) return;
    out.push({ axis, sign, face, at: snapMM((a + b) / 2), len: snapMM(Math.min(K.BEAD_LEN, win - 4)), win: snapMM(win) });
  };
  add('x', 1, c.x0, c.y0, yMax);
  add('x', -1, c.x1, c.y0, yMax);
  add('y', 1, c.y0, c.x0, c.x1);
  if (!holder) add('y', -1, c.y1, c.x0, c.x1);
  return out;
}
// p: how far the bead stands proud. A bead lower than COVER.BEAD keeps the same lower face, its tip dropping by the
// difference, so a cover still lifts only 0.3 before its skirt meets it; only the snap's reach (and force) shrinks.
function beadSolid(wasm, side, top, p = COVER.BEAD) {
  const { Manifold, CrossSection } = wasm; const zt = top - COVER.BEAD_Z - (COVER.BEAD - p), OV = C.OV;
  const prof = [[-OV, zt + 0.1 + p + OV], [0, zt + 0.1 + p], [p, zt + 0.1], [p, zt - 0.1], [0, zt - 0.1 - p], [-OV, zt - 0.1 - p - OV]];
  const pts = ccw(prof.map(([n, z]) => [q(side.face + side.sign * n), q(z)]));
  const cs = new CrossSection([pts]);
  const a = q(side.at - side.len / 2), b = q(side.at + side.len / 2);
  const m = side.axis === 'x' ? alongY(Manifold, cs, a, b) : alongX(Manifold, cs, a, b);
  cs.delete(); return m;
}
export function coverBeads(wasm, layoutIn, bead = COVER.BEAD) {
  const layout = toV2(layoutIn); const top = SIZES[layout.size].heights[layout.height].top;
  const beads = [];
  for (const c of layout.comps) if (isCovered(layout, c)) for (const s of coverSides(layout, c)) beads.push(beadSolid(wasm, s, top, bead));
  if (!beads.length) return null;
  const u = wasm.Manifold.union(beads); beads.forEach((m) => m.delete()); return u;
}
// The plate's outline in plan (drawer frame, mm). It reaches OVER onto each divider and stops CLEAR short of the rim at
// an outer wall. Over a label holder it leaves the holder open (v26; v13-v25 had a window there, which left strips 0.7
// to 2 mm wide round the label: Joey, too thin and fragile). It stops WIN_IN over the label's front edge; where the
// compartment is wider than the holder and the solid end beside it (HOLDER_W + END_FILL), a leg runs on to the back
// over the open part beside the holder, WIN_IN over the label's right end: an L. Where the plate doesn't reach, the
// holder closes the compartment: its deck and 45 deg plate, and beside it the end plate or the solid end.
export function coverOutline(layoutIn, c) {
  const layout = toV2(layoutIn), K = COVER, { W, D } = SIZES[layout.size], w = c.x1 - c.x0;
  const reach = (divider) => (divider ? K.OVER : -K.CLEAR);
  const x0 = snapMM(c.x0 - reach(c.x0 > 1e-6)), x1 = snapMM(c.x1 + reach(c.x1 < W - 1e-6)), y0 = snapMM(c.y0 - reach(c.y0 > 1e-6)), y1 = snapMM(c.y1 + reach(c.y1 < D - 1e-6));
  if (!hasHolder(layout, c)) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const h = holderOf(layout), lx = c.x0 + (C.HOLDER_W - h.label[0]) / 2, yn = snapMM(c.y1 - h.label[1] + K.WIN_IN);
  const closed = w <= C.HOLDER_W + 1e-6 || w < C.HOLDER_W + C.END_FILL;   // the same test buildInternals makes for the solid end
  if (closed) return [[x0, y0], [x1, y0], [x1, yn], [x0, yn]];
  const xr = snapMM(lx + h.label[0] - K.WIN_IN);
  return [[x0, y0], [x1, y0], [x1, y1], [xr, y1], [xr, yn], [x0, yn]];
}
// one cover, seated, in the drawer frame
export function buildCover(wasm, layoutIn, i) {
  const layout = toV2(layoutIn); const { Manifold, CrossSection } = wasm;
  const size = SIZES[layout.size]; const { W, D } = size; const top = size.heights[layout.height].top;
  const K = COVER, c = layout.comps[i], h = holderOf(layout), holder = hasHolder(layout, c), yMax = holder ? c.y1 - h.D : c.y1;
  const parts = [], cuts = [], temps = [];
  const rr = (...a) => { const cs = roundRect(CrossSection, ...a); temps.push(cs); return cs; };
  const box = (x0, x1, y0, y1, z0, z1) => Manifold.cube([q(x1) - q(x0), q(y1) - q(y0), q(z1) - q(z0)]).translate([q(x0), q(y0), q(z0)]);
  const plate = roundPoly(CrossSection, coverOutline(layout, c), K.NOTCH_R, K.R); temps.push(plate);
  parts.push(slab(Manifold, plate, top, top + K.T));
  const sx0 = c.x0 + K.GAP, sx1 = c.x1 - K.GAP, sy0 = c.y0 + K.GAP, sy1 = yMax - K.GAP;
  if (sx1 - sx0 > 2 * K.SKIRT + 2 && sy1 - sy0 > 2 * K.SKIRT + 2) {
    const inner = rr(sx0 + K.SKIRT, sx1 - K.SKIRT, sy0 + K.SKIRT, sy1 - K.SKIRT, 0.3);
    const ring = rr(sx0, sx1, sy0, sy1, 0.8).subtract(inner); temps.push(ring);
    parts.push(slab(Manifold, ring, top - K.SKIRT_H, top + C.OV));
    parts.push(slab(Manifold, inner, top - K.INNER, top + C.OV));   // the panel inside the skirt, INNER below the divider tops
    // a window in the skirt over each bead, its corners rounded in the skirt's plane; the strip under it is the spring
    const zt = top - K.BEAD_Z, n0 = K.GAP - 0.2, n1 = K.GAP + K.SKIRT + 0.2, w0 = zt - K.WIN_Z, w1 = zt + K.WIN_Z;
    for (const s of coverSides(layout, c)) {
      const a = s.at - s.win / 2, b = s.at + s.win / 2, f = s.face + s.sign * n0, g = s.face + s.sign * n1;
      const cs = rr(a, b, w0, w1, K.WIN_R);
      cuts.push(s.axis === 'x' ? alongX(Manifold, cs, q(Math.min(f, g)), q(Math.max(f, g))) : alongY(Manifold, cs, q(Math.min(f, g)), q(Math.max(f, g))));
    }
  }
  const pl = coverPullV2(layout, c);
  if (pl) {   // the nail slot through the 1.2 panel, its top edge chamfered: a hull from the opening CH under the top to the opening grown by CH at it
    const s = pullSolids(Manifold, rr, pl, top, top + C.OV, top - K.INNER, top - K.INNER - 0.05, top + K.T + 0.1);
    parts.push(s.part); cuts.push(...s.cuts);
    const o = pl.open, { R: r, CH: ch } = pl.F, zt = top + K.T;
    const lo = slab(Manifold, rr(...o, r), zt - ch, zt), hi = slab(Manifold, rr(o[0] - ch, o[1] + ch, o[2] - ch, o[3] + ch, r + ch), zt, zt + 0.1);
    cuts.push(Manifold.hull([lo, hi])); lo.delete(); hi.delete();
  }
  let m = Manifold.union(parts);
  if (cuts.length) { const u = Manifold.union(cuts); const out = m.subtract(u); m.delete(); u.delete(); m = out; }
  for (const x of parts.concat(cuts)) x.delete();
  for (const t of temps) t.delete();
  return cleanMesh(wasm, m);
}
// covers as they print: top face down, laid out in rows (mm)
export function coversForPrint(wasm, layoutIn, bedW = 230, gap = 4) {
  const layout = toV2(layoutIn); const out = []; let x = 0, y = 0, row = 0;
  layout.comps.forEach((c, i) => {
    if (!isCovered(layout, c)) return;
    const m = buildCover(wasm, layout, i); const f = lidForPrint(wasm, m); m.delete();
    const b = f.boundingBox(), w = (b.max[0] - b.min[0]) / U, d = (b.max[1] - b.min[1]) / U;
    if (x > 0 && x + w > bedW) { x = 0; y += row + gap; row = 0; }
    out.push({ comp: i, m: f.translate([q(x), q(y), 0]) }); f.delete();
    x += w + gap; row = Math.max(row, d);
  });
  return out;
}
// Test pieces for covers: one covered compartment cut from the drawer with its dividers and beads, and its cover.
// opts.bead: the beads' height, to try a lighter snap (COVER.BEAD by default). opts.comp: which compartment (by default
// the front-most one nearest the middle with at least two snaps).
export function coverTestPieces(wasm, layoutIn, assets, opts = {}) {
  const layout = toV2({ ...layoutIn, covers: true }); const { Manifold } = wasm; const { W } = SIZES[layout.size];
  const R = SIZES[layout.size].heights[layout.height].rim;
  const mid = (c) => Math.abs((c.x0 + c.x1) / 2 - W / 2);
  const order = layout.comps.map((c, i) => i).filter((i) => coverSides(layout, layout.comps[i]).length >= 2 && coverPullV2(layout, layout.comps[i]) && layout.comps[i].x1 - layout.comps[i].x0 < 90 && layout.comps[i].y1 - layout.comps[i].y0 < 90)
    .sort((a, b) => layout.comps[a].y0 - layout.comps[b].y0 || mid(layout.comps[a]) - mid(layout.comps[b]));
  if (opts.comp !== undefined ? !order.includes(opts.comp) : !order.length) return null;
  const i = opts.comp ?? order[0], c = layout.comps[i];
  const only = { ...layout, comps: layout.comps.map((k, j) => (j === i ? { ...k, nocover: false } : { ...k, nocover: true })) };
  const drawer = buildDrawer(wasm, only, assets, { bead: opts.bead });
  const x0 = c.x0 - 3, x1 = c.x1 + 3, y0 = c.y0 > 1e-6 ? c.y0 - 3 : -5, y1 = c.y1 + 3;
  const b = Manifold.cube([q(x1) - q(x0), q(y1) - q(y0), q(R + 2)]).translate([q(x0), q(y0), q(-1)]);
  const dc = drawer.intersect(b); drawer.delete(); b.delete();
  return { comp: i, drawer: cleanMesh(wasm, dc), cover: buildCover(wasm, only, i) };
}

export function toSTL(mesh, header = 'MODULITH parts drawer') {
  const tv = mesh.triVerts, np = mesh.numProp;
  const vp = Float64Array.from(mesh.vertProperties, (v) => v / U);   // grid units -> mm
  const n = tv.length / 3;
  const buf = new ArrayBuffer(84 + n * 50); const dv = new DataView(buf);
  const enc = new TextEncoder().encode(header.slice(0, 80));
  new Uint8Array(buf, 0, enc.length).set(enc);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50;
    const p = [0, 1, 2].map((k) => tv[3 * t + k] * np);
    const a = [vp[p[0]], vp[p[0] + 1], vp[p[0] + 2]], b = [vp[p[1]], vp[p[1] + 1], vp[p[1] + 2]], c = [vp[p[2]], vp[p[2] + 1], vp[p[2] + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    [a, b, c].forEach((q, k) => { dv.setFloat32(o + 12 + k * 12, q[0], true); dv.setFloat32(o + 16 + k * 12, q[1], true); dv.setFloat32(o + 20 + k * 12, q[2], true); });
  }
  return buf;
}
