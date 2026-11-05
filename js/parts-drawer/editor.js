/* The parts drawer in the Build workspace (M2, 2026-11-05; docs/parts-drawer/SPEC.md "Planner integration: the next
   session"), behind ?partsdrawer=1 (flag.js). Mounted by js/workspaces/build.js, which hands it the panels and the
   record's edit path and asks it to draw into them while a drawer is being edited:
   - OUTSIDE EDIT MODE: every parts drawer in the build wears the generated empty shell in place of its Decor drawer GLB
     (M1's frame; cached per size and height; the GLB until the engine has booted), and the selected unit's Inspector
     shows the plan thumbnail, the layout code, Edit compartments and the download.
   - EDIT MODE (Edit compartments): the drawer slides open (stage.peekUnit), the camera frames it top-down 3/4, the rest
     of the build ghosts; the Library becomes the drawer tools (grid, label size, scoop and ramp for every compartment,
     floor colours), the Inspector "This compartment" (or "3 compartments"), the toolbar 2D / 3D with the plan first
     (plan.js), the Dock's CTA Done, Esc leaves. Every edit is one step on the planner's undo stack (one commit per drag
     or field change). The drawer's geometry is the generator's own (engine.js), rebuilt on the main thread when the
     layout's shape changes (the worker is M3), with floor colours and the white label strips drawn on it.
   The look is the planner's (MODULITH-planner-style.md): orange is selection, white strips are labels, --measure for
   dimensions, the option keys, no edges - except the proposed edit-mode edges, shown both ways (an open decision).
   Not here (M2 "Not in M2"): the parts list, outlines, cells, lid, covers. */
import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toolbar } from '../ui/toolbar.js';
import { FILAMENT_DB } from '../filament-db.js';
import * as G from './gen.js';
import * as Mk from './marks.js';
import { frameOf } from './frame.js';
import { partsEngine, engineReady, shellGeometry, drawerGeometry } from './engine.js';
import { PARTS, sizeOfUnit, heightOfUnit, partsSizeOk, isPartsDrawer, partsSizeWhy, layoutOf, layoutForSize, fullLayout, FLOOR_KEYS, FLOOR_DEFAULT_HEX, keepOf, defaultLayout } from './unit.js';
import { plan, planThumb } from './plan.js';
import { buildZip, saveBlob } from './download.js';

const EPS = 1e-6, WALL = G.C.WALL;
const fmt = (v) => v.toFixed(1);
const clone = (o) => JSON.parse(JSON.stringify(o));
const n = (k, one, many = one + 's') => `${k} ${k === 1 ? one : many}`;
const RAMP_NAME = 'Ramp';   // the prototype's "Tray, mm" (SPEC open decision: recommended, keyed `tray` as before)
const BEDS = [[180, 180, 'a 180 mm bed (Prusa MINI, Bambu A1 mini)'], [250, 210, 'a 250 × 210 bed (Prusa MK4S)'], [250, 220, 'a 250 × 220 bed (Prusa CORE One)'],
  [256, 256, 'a 256 mm bed (Bambu X1, P1, A1)'], [300, 300, 'a 300 mm bed (Prusa CORE One L, Creality K1 Max)'], [350, 350, 'a 350 mm bed (Creality K2 Plus, Sovol SV08, Voron 350)'], [360, 360, 'the Prusa XL (360 mm)']];
const mode = (arr) => { const m = new Map(); let best = arr[0], k = 0; for (const v of arr) { const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > k) { k = c; best = v; } } return best; };

/* ctx: { store, say, root, length() -> the collection, edit(fn, why, opts) (build.js's one-undo-step edit), select(id),
   renderAll(), setView2d(on) } */
export function partsDrawerTools(stage, ctx) {
  const THREE = stage.THREE;
  const { store, say, root } = ctx;
  const S = () => store.state;
  const L = () => +ctx.length();
  const unitById = (id) => S().placed.find((p) => p.id === id) || null;
  const st = { editing: null, view: '2d', sel: null, hover: null, edges: true, picker: null, engineErr: null, booting: false, status: '', downloading: false };
  const canvas = document.getElementById('stage');

  /* ---------------- the engine ---------------- */
  function ensureEngine() {
    if (engineReady() || st.booting || st.engineErr) return;   // a failed boot is said once, not retried on every render (Sol 01a1ad82)
    st.booting = true;
    partsEngine().then(() => { st.booting = false; sync(); ctx.renderAll(); }).catch((e) => { st.booting = false; st.engineErr = String(e && e.message || e); console.warn('[parts drawer] engine', e); ctx.renderAll(); });
  }
  const partsUnits = () => S().placed.filter((u) => isPartsDrawer(L(), u));

  /* ---------------- the layout and its colours ---------------- */
  const floorHexes = () => { let pal = null; try { pal = stage.palette(); } catch { /* an older stage */ } return FLOOR_KEYS.map((k, i) => (pal && pal.colors && pal.colors[k] && pal.colors[k].hex) || FLOOR_DEFAULT_HEX[i]); };
  const floorPick = (k) => { try { return stage.palette().colors[FLOOR_KEYS[k - 1]] || null; } catch { return null; } };
  const layoutOfUnit = (u) => layoutOf(L(), u);
  const fullOf = (u, lay = layoutOfUnit(u)) => fullLayout(L(), u, lay, floorHexes());
  const editedUnit = () => (st.editing != null ? unitById(st.editing) : null);
  /* one undo step on the record: fn(layout, unit) mutates a cleaned copy of the unit's layout, which then replaces it */
  function commitLayout(fn, why = 'parts') {
    const id = st.editing; if (id == null) return;
    ctx.edit((s) => { const p = s.placed.find((q) => q.id === id); if (!p) return; const lay = layoutOf(L(), p); fn(lay, p); p.partsLayout = lay; }, why, { gravity: false });
    st.sel = st.sel && regrow(st.sel);
  }

  /* ---------------- selection (the prototype's: a box closed under touching) ---------------- */
  const comps = () => { const u = editedUnit(); return u ? layoutOfUnit(u).comps : []; };
  const overlaps = (a, b) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;
  const closure = (r) => G.closeBox(comps(), { ...r });
  function regrow(r) { const hit = comps().filter((c) => overlaps(c, r)); return hit.length ? closure(G.boxOf(hit)) : null; }
  const selected = () => (st.sel ? comps().filter((c) => G.inBox(c, st.sel)) : []);
  const inSel = (c) => !!st.sel && G.inBox(c, st.sel);
  function setSel(box) { st.sel = box ? closure(box) : null; renderInspector(); update3d(); pl.render(); }

  /* ---------------- edits ---------------- */
  const sharedProps = (list) => ({ holder: list.some((c) => c.holder), scoop: mode(list.map((c) => c.scoop)), tray: mode(list.map((c) => G.trayMM(c))), color: mode(list.map((c) => c.color)) });
  function doMerge() {
    const s = selected(); if (s.length < 2) return;
    const props = sharedProps(s), box = st.sel;
    commitLayout((x) => { x.comps = x.comps.filter((c) => !G.inBox(c, box)); x.comps.push(G.comp(box.x0, box.x1, box.y0, box.y1, props)); });
  }
  // a compartment split back into the base-grid cells it covers; a single cell splits in half along its long side
  function splitPieces(lay, size, c) {
    const Sz = G.SIZES[size], w = c.x1 - c.x0, d = c.y1 - c.y0, min = G.C.MIN_CELL;
    let nx = Math.max(1, Math.round((w + WALL) / ((Sz.W + WALL) / lay.nc))), ny = Math.max(1, Math.round((d + WALL) / ((Sz.D + WALL) / lay.nr)));
    if (nx * ny === 1) { if (w >= d) nx = 2; else ny = 2; }
    while (nx > 1 && (w - (nx - 1) * WALL) / nx < min) nx--;
    while (ny > 1 && (d - (ny - 1) * WALL) / ny < min) ny--;
    if (nx * ny === 1) return null;
    const xs = G.spans(G.uniform(w, nx)), ys = G.spans(G.uniform(d, ny)); const out = [];
    const { holder, scoop, tray, color } = c;
    for (const [a, b] of ys) for (const [l, r] of xs) out.push(G.comp(c.x0 + l, c.x0 + r, c.y0 + a, c.y0 + b, { holder, scoop, tray, color }));
    return out;
  }
  const canSplit = () => { const u = editedUnit(); if (!u) return false; const lay = layoutOfUnit(u), size = sizeOfUnit(L(), u); return selected().some((c) => splitPieces(lay, size, c)); };
  function doSplit() {
    const u = editedUnit(); if (!u) return;
    const size = sizeOfUnit(L(), u), box = st.sel; if (!box) return;
    commitLayout((x) => {
      const picked = x.comps.filter((c) => G.inBox(c, box)).map((c) => [c, splitPieces(x, size, c)]).filter(([, p]) => p);
      for (const [c, pieces] of picked) { const i = x.comps.findIndex((k) => k.x0 === c.x0 && k.y0 === c.y0); x.comps.splice(i, 1, ...pieces); }
    });
  }
  function doHolder() {
    const u = editedUnit(); const s = selected(); if (!u || !s.length) return;
    const full = fullOf(u);
    const fits = s.filter((c) => G.holderStatus(full, c).ok);
    const pool = fits.length ? fits : s, turnOn = !pool.every((c) => c.holder), box = st.sel;
    commitLayout((x) => { for (const c of x.comps) if (G.inBox(c, box)) c.holder = turnOn; });
  }
  function setSelProp(prop, value) { const box = st.sel; if (!box || !selected().length) return; commitLayout((x) => { for (const c of x.comps) if (G.inBox(c, box)) c[prop] = value; }); }
  function setAll(prop, value) { commitLayout((x) => { for (const c of x.comps) c[prop] = value; }); }
  function applySize(dim, v) {
    const u = editedUnit(); const s = selected(); if (!u || s.length !== 1 || !Number.isFinite(v)) return;
    const full = fullOf(u), i = full.comps.findIndex((c) => c.x0 === s[0].x0 && c.y0 === s[0].y0);
    const res = G.resizeComp(full, i, dim, v);
    if (res.error) { say(res.error[0].toUpperCase() + res.error.slice(1) + '.'); renderInspector(); return; }
    commitLayout((x) => { x.comps = res.comps; });
    const c = comps()[i]; st.sel = c ? closure(G.compBox(c)) : null;
    if (res.clamped) say(`Limited to ${fmt(dim === 'w' ? c.x1 - c.x0 : c.y1 - c.y0)} mm: the neighbouring compartments can't get smaller than ${G.C.MIN_CELL} mm.`);
  }
  function setGrid(nc, nr) {
    const u = editedUnit(); if (!u) return;
    const size = sizeOfUnit(L(), u), g = G.maxGrid(size);
    nc = Math.max(1, Math.min(nc, g.nc)); nr = Math.max(1, Math.min(nr, g.nr));
    commitLayout((x) => { const keep = keepOf(x.comps); x.nc = nc; x.nr = nr; x.comps = G.evenGrid(size, nc, nr, keep); });
    st.sel = null;
  }
  function shippedGrid() {
    const u = editedUnit(); if (!u) return; const Sz = G.SIZES[sizeOfUnit(L(), u)]; if (!Sz.shipped) return;
    commitLayout((x) => { x.nc = 5; x.nr = 4; x.comps = G.gridComps(Sz.shipped.cols, Sz.shipped.rows, keepOf(x.comps)); });
    st.sel = null;
  }
  const neighbours = (a, b) => ((Math.abs(a.x1 + WALL - b.x0) < 1e-4 || Math.abs(b.x1 + WALL - a.x0) < 1e-4) && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS)
    || ((Math.abs(a.y1 + WALL - b.y0) < 1e-4 || Math.abs(b.y1 + WALL - a.y0) < 1e-4) && a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS);
  function fill(kind) {
    commitLayout((x) => {
      const slots = x.floor.slots;
      if (kind === 'clear') { for (const c of x.comps) c.color = 0; return; }
      if (kind === 'row' || kind === 'col') {
        const key = kind === 'row' ? 'y0' : 'x0', vals = [...new Set(x.comps.map((c) => c[key]))].sort((a, b) => a - b);
        for (const c of x.comps) c.color = (vals.indexOf(c[key]) % slots) + 1;
        return;
      }
      const deg = (c) => x.comps.filter((k) => k !== c && neighbours(c, k)).length;
      for (const c of x.comps) c.color = 0;
      for (const c of [...x.comps].sort((a, b) => deg(b) - deg(a) || a.y0 - b.y0 || a.x0 - b.x0)) {
        const used = x.comps.filter((k) => k !== c && k.color && neighbours(c, k)).map((k) => k.color);
        const free = [...Array(slots)].map((_, i) => i + 1).filter((k) => !used.includes(k));
        c.color = free.length ? free[0] : 1 + [...Array(slots).keys()].sort((p, q) => used.filter((v) => v === p + 1).length - used.filter((v) => v === q + 1).length)[0];
      }
    });
  }
  function setFloorMode(m) { commitLayout((x) => { x.floor.mode = m; if (m === 'paint' && !x.comps.some((c) => c.color)) for (const c of x.comps) c.color = 1; }); }
  function nextTray(list) { const cur = Math.max(...list.map((c) => G.trayMM(c))), same = list.every((c) => G.trayMM(c) === cur); return same ? (G.TRAYS.find((v) => v > cur + EPS) ?? 0) : cur; }

  /* ---------------- the stage: bodies, ghosts, overlays, picking ---------------- */
  const extrasOf = new Map();   // unit id -> its 'parts-extras' group (floor tiles, strips, edges, hover) and 'parts-sel' group
  const edgeCache = new WeakMap();   // geometry -> its EdgesGeometry
  function clearExtras(id) {
    const x = extrasOf.get(id); if (!x) return;
    for (const g of [x.extras, x.sel]) { g.parent?.remove(g); g.traverse((o) => { if (o.geometry && !o.userData.keepGeo) o.geometry.dispose(); if (o.material && o.userData.ownMat) o.material.dispose(); }); }
    extrasOf.delete(id);
  }
  /* what every parts drawer wears right now: the shell closed, the whole drawer while edited; called after every stage
     rebuild and every layout change (cheap when nothing changed: the geometries are cached and setDrawerBody compares) */
  function applyBodies() {
    const units = partsUnits();
    if (units.length) ensureEngine();
    const ready = !!engineReady();
    for (const u of S().placed) {
      if (!isPartsDrawer(L(), u)) { if (u.fill === 'decor') stage.setDrawerBody(u.id, null); continue; }
      const size = sizeOfUnit(L(), u), height = heightOfUnit(u);
      let geo = null;
      if (ready) {
        try { geo = st.editing === u.id ? drawerGeometry(fullOf(u)).geometry : shellGeometry(size, height); }
        catch (e) { console.warn('[parts drawer] geometry', e); st.engineErr = String(e && e.message || e); }
      }
      stage.setDrawerBody(u.id, geo);
      if (st.editing !== u.id) clearExtras(u.id);
    }
  }
  /* called on every render: the bodies follow the record; while editing, the unit removed under the editor ends it (the
     Delete key, the context menu's Remove, an undo past its placement: Sol 01a1ad82), and the selection box is regrown
     onto the compartments as they are now, so an undo or redo that restores a merged or split compartment keeps it
     selected (the prototype regrew after every commit; the store's undo does not pass through commitLayout) */
  function sync() {
    if (st.editing != null && !editedUnit()) { stop({ quiet: true }); applyBodies(); return; }
    applyBodies();
    if (st.editing != null) { st.sel = st.sel && regrow(st.sel); stage.isolateUnit(st.editing); update3d(); }
  }
  const mat3 = (hex) => { const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0 }); return m; };
  const inkHex = () => (stage.stageTheme === 'light' ? 0x1d1e20 : 0x05060a);
  const bodyDark = () => { const h = String(stage.activeHex('Drawer') || '#888888'); const [r, g, b] = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4; };
  /* the overlays on the edited drawer: floor colours as tiles on the floors, the white label strips, the faint edges (while
     on), the hovered compartment's tint, and the selection boxes (on the selection layer alone, for the two-rim outline) */
  function update3d() {
    const u = editedUnit(); if (!u) return;
    const group = stage.drawerGroupOf(u.id); if (!group) return;
    const body = group.getObjectByName('parts-body');
    clearExtras(u.id);
    const extras = new THREE.Group(); extras.name = 'parts-extras';
    const sel = new THREE.Group(); sel.name = 'parts-sel';
    const full = fullOf(u), Sz = G.SIZES[full.size], { cx, cz } = frameOf(full.size), top = Sz.heights[full.height].top, H = G.holderOf(full);
    const X = (x) => x - cx, Z = (y) => cz - y;
    // floor colours
    for (const r of G.floorRects(full)) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.y1 - r.y0), mat3(full.floor.colors[r.color - 1]));
      m.userData.ownMat = true; m.rotation.x = -Math.PI / 2; m.position.set(X((r.x0 + r.x1) / 2), G.C.FLOOR + 0.03, Z((r.y0 + r.y1) / 2)); m.receiveShadow = true;
      extras.add(m);
    }
    // the white label strips, in the build's label material, on every holder
    const [lw, lh, lt] = H.label;
    let labelMat = null; try { labelMat = stage.partMaterial('Label'); } catch { labelMat = null; }
    for (const c of full.comps) {
      if (!G.hasHolder(full, c)) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), labelMat || mat3('#f3f1ea'));
      if (!labelMat) m.userData.ownMat = true;
      m.rotation.x = -Math.PI / 2; m.position.set(X(c.x0 + 0.362 + lw / 2), top - 2.5 + lt + 0.03, Z(c.y1 - lh / 2));
      extras.add(m);
    }
    // the proposed edit-mode edges (SPEC open decision: judged at M2, shown both ways): ink on a light body, white on a dark one
    if (st.edges && body) {
      let eg = edgeCache.get(body.geometry);
      if (!eg) { eg = new THREE.EdgesGeometry(body.geometry, 24); edgeCache.set(body.geometry, eg); }
      const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: bodyDark() ? 0xffffff : inkHex(), transparent: true, opacity: bodyDark() ? 0.22 : 0.24 }));
      lines.userData.ghost = true; lines.userData.keepGeo = true; lines.userData.ownMat = true; lines.renderOrder = 2;
      extras.add(lines);
    }
    // the hovered compartment (3D hover, the plan's hover too)
    if (st.hover && !inSel(st.hover)) {
      const c = st.hover, m = new THREE.Mesh(new THREE.PlaneGeometry(c.x1 - c.x0, c.y1 - c.y0), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.2, depthWrite: false }));
      m.userData.ghost = true; m.userData.ownMat = true; m.rotation.x = -Math.PI / 2; m.position.set(X((c.x0 + c.x1) / 2), G.C.FLOOR + 0.06, Z((c.y0 + c.y1) / 2)); m.renderOrder = 3;
      extras.add(m);
    }
    // the selection: a box per selected compartment on the selection layer, which only the outline pass draws. Its top
    // stands 0.6 above the wall tops and its sides 0.3 inside them, so no face is coplanar with a wall or a holder top
    // (coplanar, the mask z-fought the holder and the outline frayed over it)
    for (const c of selected()) {
      const IN = 0.3, UP = 0.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.x1 - c.x0 - 2 * IN, top + UP - G.C.FLOOR, c.y1 - c.y0 - 2 * IN), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.userData.ownMat = true; m.layers.set(stage.selLayer);
      m.position.set(X((c.x0 + c.x1) / 2), (G.C.FLOOR + top + UP) / 2, Z((c.y0 + c.y1) / 2));
      sel.add(m);
    }
    group.add(extras, sel);
    extrasOf.set(u.id, { extras, sel });
    stage.setOutlineObjects(sel.children.length ? [sel] : null);
    stage.markShadowDirty(); stage.invalidateFrame();
  }
  /* a tap on the canvas in edit mode is a compartment pick (stage.setTapTargets: the stage then selects nothing);
     Shift, Ctrl or Cmd grows the selection; a tap off the drawer clears it */
  const compAt = (pt, size) => { const Sz = G.SIZES[size]; if (pt.x < -0.2 || pt.x > Sz.W + 0.2 || pt.y < -0.2 || pt.y > Sz.D + 0.2) return null; let best = null, bd = Infinity; for (const c of comps()) { const dx = Math.max(c.x0 - pt.x, 0, pt.x - c.x1), dy = Math.max(c.y0 - pt.y, 0, pt.y - c.y1), dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = c; } } return best; };
  function compUnderRay(ray) {
    const u = editedUnit(); if (!u) return null;
    const group = stage.drawerGroupOf(u.id), body = group && group.getObjectByName('parts-body'); if (!body) return null;
    const hit = ray.intersectObject(body, false)[0]; if (!hit) return null;
    const p = body.worldToLocal(hit.point.clone()), { cx, cz } = frameOf(sizeOfUnit(L(), u));
    return compAt({ x: p.x + cx, y: cz - p.z }, sizeOfUnit(L(), u));
  }
  const tapTargets = { onTap(ray, dist, e) {
    if (st.editing == null) return false;
    const c = compUnderRay(ray), add = e && (e.shiftKey || e.ctrlKey || e.metaKey);
    if (!c) { if (!add && st.sel) setSel(null); return true; }
    setSel(add && st.sel ? G.boxOf([st.sel, G.compBox(c)]) : G.compBox(c));
    return true;
  } };
  const ray = new THREE.Raycaster();
  let hoverQueued = false, hoverEvt = null;
  function onCanvasMove(e) {
    if (st.editing == null || e.pointerType !== 'mouse' || e.buttons) { if (st.hover) { st.hover = null; update3d(); } return; }
    hoverEvt = e; if (hoverQueued) return; hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false; if (!hoverEvt || st.editing == null) return;
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((hoverEvt.clientX - r.left) / r.width) * 2 - 1, -((hoverEvt.clientY - r.top) / r.height) * 2 + 1), stage.camera);
      const c = compUnderRay(ray);
      if (c !== st.hover) { st.hover = c; canvas.style.cursor = c ? 'pointer' : ''; update3d(); }
    });
  }
  function onCanvasLeave() { hoverEvt = null; if (st.hover) { st.hover = null; canvas.style.cursor = ''; update3d(); } }

  /* ---------------- edit mode ---------------- */
  function start(id) {
    const u = unitById(id); if (!u || !isPartsDrawer(L(), u)) return false;
    if (st.editing != null && st.editing !== id) stop({ quiet: true });
    st.editing = id; st.sel = null; st.hover = null; st.view = '2d';
    ensureEngine();
    stage.setSelected(null);
    stage.setTapTargets(tapTargets);
    canvas.addEventListener('pointermove', onCanvasMove); canvas.addEventListener('pointerleave', onCanvasLeave);
    stage.peekUnit(id, { pills: false });
    sync();
    stage.frameUnit(id);
    editBar.sync();
    return true;
  }
  function stop({ quiet = false } = {}) {
    const id = st.editing; if (id == null) return;
    st.editing = null; st.sel = null; st.hover = null; st.picker = null;
    stage.setTapTargets(null);
    canvas.removeEventListener('pointermove', onCanvasMove); canvas.removeEventListener('pointerleave', onCanvasLeave);
    canvas.style.cursor = '';
    clearExtras(id);
    stage.setOutlineObjects(null);
    stage.isolateUnit(null);
    stage.unpeek();
    stage.endFrameUnit();
    applyBodies();
    if (!quiet) { ctx.select(id); ctx.renderAll(); }
  }
  /* after a stage rebuild (a resize, an option change): the drawer is new, so open it again, ghost the rest, re-apply */
  function afterUpdate() {
    sync();
    if (st.editing != null) { stage.setSelected(null); stage.peekUnit(st.editing, { pills: false }); update3d(); }
  }

  /* ---------------- the plan (2D) ---------------- */
  const pl = plan({
    full: () => { const u = editedUnit(); return u ? fullOf(u) : fullLayout(L(), { w: 2, hh: 2, fill: 'decor' }, defaultLayout('240-2W'), floorHexes()); },
    selected: () => st.sel,
    flags: () => { const u = editedUnit(); return u && G.isTall(sizeOfUnit(L(), u), heightOfUnit(u)) ? G.reachFlags(fullOf(u)) : []; },
    onSelect: (box) => setSel(box),
    onWalls: (moved) => { commitLayout((x) => { x.comps = moved; }); },
    onHolder: doHolder,
    onHover: (c) => { if (c !== st.hover) { st.hover = c; update3d(); } },
  });
  pl.el.hidden = true;
  root.appendChild(pl.el);

  /* ---------------- the toolbar in edit mode: 2D / 3D, Reset frames the drawer, Undo / Redo ---------------- */
  const editBar = toolbar(stage, {
    view: { get: () => st.view, set: (v) => { st.view = v; ctx.renderAll(); } },
    history: { undo: () => store.undo(), redo: () => store.redo(), get canUndo() { return store.canUndo; }, get canRedo() { return store.canRedo; } },
    reset: () => { if (st.editing != null) stage.frameUnit(st.editing); },
  });
  editBar.el.hidden = true;
  root.appendChild(editBar.el);

  /* ---------------- the Library: the drawer tools ---------------- */
  function renderLib(lib) {
    const u = editedUnit(); if (!u) return;
    const full = fullOf(u), lay = layoutOfUnit(u), size = full.size, Sz = G.SIZES[size], g = G.maxGrid(size);
    lib.appendChild(el('div.pd-head', {}, [
      el('div.col', {}, [el('h2.h2', { text: 'Editing compartments' }), el('h3', { text: `${u.w}W·${u.hh / 2}H parts drawer` }), el('div.readout', { text: `${Sz.label} · cavity ${fmt(Sz.W)} × ${fmt(Sz.D)} mm · ${full.height}` })]),
      el('button.key.sm', { text: 'Done', title: 'Back to the build · Esc', onclick: () => stop() }),
    ]));
    if (st.engineErr) lib.appendChild(el('div.warnbox', {}, [el('b', { text: 'The geometry engine could not start. ' }), `The plan still works; the 3D drawer and the download are off. ${st.engineErr}`]));
    // the reach warning, in the planner's amber issue pattern (SPEC "UI: what changes")
    if (G.isTall(size, full.height)) {
      const flags = G.reachFlags(full), k = flags.filter(Boolean).length;
      if (k) {
        const rg = G.reachableGrid(size, full.height);
        lib.appendChild(el('div.warnbox.pd-reach', {}, [
          el('div', {}, [el('b', { text: `${n(k, 'compartment')} too narrow to reach into at ${full.height}. ` }), `Here a compartment needs ${fmt(G.reachMin(size, full.height))} mm across to get the last parts out by hand. Merge them, or start from the densest grid that works.`]),
          el('div.iact', {}, [
            el('button.key.sm', { text: 'Show me', onclick: () => { const flagged = full.comps.filter((c, i) => flags[i]); setSel(G.boxOf(flagged)); } }),
            el('button.key.sm.strong', { text: `Use ${rg.nc} × ${rg.nr}`, onclick: () => setGrid(rg.nc, rg.nr) }),
          ]),
        ]));
      }
    }
    const stepper = (label, value, dec, inc, canDec, canInc) => el('div.row', {}, [label, el('div.stepper', {}, [el('button.key', { text: '−', 'aria-label': `Fewer ${label.toLowerCase()}`, disabled: !canDec, onclick: dec }), el('b.mono', { text: String(value) }), el('button.key', { text: '+', 'aria-label': `More ${label.toLowerCase()}`, disabled: !canInc, onclick: inc })])]);
    const grid = el('section');
    grid.appendChild(el('h2.h2', { text: 'Grid' }));
    grid.appendChild(stepper('Columns', lay.nc, () => setGrid(lay.nc - 1, lay.nr), () => setGrid(lay.nc + 1, lay.nr), lay.nc > 1, lay.nc < g.nc));
    grid.appendChild(stepper('Rows', lay.nr, () => setGrid(lay.nc, lay.nr - 1), () => setGrid(lay.nc, lay.nr + 1), lay.nr > 1, lay.nr < g.nr));
    grid.appendChild(el('div.pd-btns', {}, [
      Sz.shipped ? el('button.key.sm', { text: 'Shipped 5×4', title: 'The layout the parts drawer ships with', onclick: shippedGrid }) : null,
      el('button.key.sm', { text: 'Reset grid', title: 'Start over from single compartments', onclick: () => setGrid(lay.nc, lay.nr) }),
    ].filter(Boolean)));
    grid.appendChild(el('p.hint', { text: 'Changing the grid starts over from single compartments. Merge, split and drag walls in the plan.' }));
    lib.appendChild(grid);

    const lb = el('section');
    lb.appendChild(el('h2.h2', { text: 'Label size' }));
    lb.appendChild(el('div.track.seg2', { role: 'group', 'aria-label': 'Label size' }, [
      el('button.seg.sm' + (lay.label === 'large' ? '.on' : ''), { text: 'Large', onclick: () => { if (lay.label !== 'large') commitLayout((x) => { x.label = 'large'; }); } }),
      el('button.seg.sm' + (lay.label === 'small' ? '.on' : ''), { text: 'Small', onclick: () => { if (lay.label !== 'small') commitLayout((x) => { x.label = 'small'; }); } }),
    ]));
    const Hh = G.holderOf(full);
    lb.appendChild(el('p.hint', { text: `${Hh.name}: ${Hh.label[0].toFixed(2)} × ${Hh.label[1]} mm${lay.label === 'large' ? ' · fits 12 mm label-maker tape' : ' · the original parts-drawer label'}.` }));
    lib.appendChild(lb);

    const scoops = new Set(lay.comps.map((c) => c.scoop)), trays = new Set(lay.comps.map((c) => G.trayMM(c)));
    const fl = el('section');
    fl.appendChild(el('h2.h2', { text: 'Floor · every compartment' }));
    fl.appendChild(el('div.row', {}, ['Scoop', el('div.track.mini.seg3', { role: 'group', 'aria-label': 'Front scoop for every compartment' }, [['off', 'Off'], ['std', 'Standard'], ['deep', 'Deep']].map(([id, name]) =>
      el('button.seg.sm' + (scoops.size === 1 && scoops.has(id) ? '.on' : ''), { text: name, onclick: () => setAll('scoop', id) })))]));
    fl.appendChild(el('div.row', {}, [RAMP_NAME, el('div.track.mini.seg5', { role: 'group', 'aria-label': `${RAMP_NAME} for every compartment, mm` }, G.TRAYS.map((v) =>
      el('button.seg.sm' + (trays.size === 1 && trays.has(v) ? '.on' : ''), { text: v ? String(v) : 'Off', 'aria-label': v ? `${v} mm` : 'Off', onclick: () => setAll('tray', v) })))]));
    fl.appendChild(el('p.hint', { text: `Standard is the shipped 6 mm front scoop, Deep up to 12 mm. ${RAMP_NAME} adds 45° ramps on the sides and back, in mm, so small parts slide to the middle. ${scoops.size > 1 || trays.size > 1 ? 'Mixed right now; these set every compartment.' : ''}` }));
    lib.appendChild(fl);

    renderFloorColor(lib, lay, full);

    const look = el('section');
    look.appendChild(el('h2.h2', { text: 'While editing' }));
    look.appendChild(el('div.row', {}, ['Edges', el('div.track.mini.seg2', { role: 'group', 'aria-label': 'Faint edges on the drawer while editing' }, [
      el('button.seg.sm' + (!st.edges ? '.on' : ''), { text: 'Off', onclick: () => { st.edges = false; update3d(); renderLib2(); } }),
      el('button.seg.sm' + (st.edges ? '.on' : ''), { text: 'On', onclick: () => { st.edges = true; update3d(); renderLib2(); } }),
    ])]));
    look.appendChild(el('p.hint', { text: 'Faint edges in edit mode only (1.5 mm walls seen from above read poorly without them); none anywhere else. A proposal for Joey.' }));
    lib.appendChild(look);

    lib.appendChild(downloadBlock(u));
    function renderLib2() { lib.replaceChildren(); renderLib(lib); }
  }
  /* floor colours: the mode, the slots as palette regions (the build's filament for Drawer:FLOORk, the picker a filament
     list from the planner's catalogue), the quick fills */
  function renderFloorColor(lib, lay, full) {
    const sec = el('section');
    sec.appendChild(el('h2.h2', { text: 'Floor colour' }));
    const m = lay.floor.mode;
    sec.appendChild(el('div.track.seg3', { role: 'group', 'aria-label': 'Floor colour' }, [['off', 'Off'], ['one', 'One colour'], ['paint', 'Paint']].map(([id, name]) =>
      el('button.seg.sm' + (m === id ? '.on' : ''), { text: name, onclick: () => { if (m !== id) setFloorMode(id); } }))));
    if (m !== 'off') {
      const k = m === 'one' ? 1 : lay.floor.slots, hexes = floorHexes();
      const sw = el('div.pd-swatches');
      if (m === 'paint') sw.appendChild(el('div.pd-swatch', { title: 'The body colour · key 0' }, [el('span.sw', { style: `background:${stage.activeHex('Drawer')}` }), el('span.lbl', { text: 'Body' })]));
      for (let i = 1; i <= k; i++) {
        const pick = floorPick(i);
        sw.appendChild(el('button.pd-swatch.key' + (st.picker === i ? '.on' : ''), { title: pick ? pick.name : 'Pick a filament', 'aria-pressed': String(st.picker === i), onclick: () => { st.picker = st.picker === i ? null : i; lib.replaceChildren(); renderLib(lib); } },
          [el('span.sw', { style: `background:${hexes[i - 1]}` }), el('span.lbl', { text: m === 'one' ? 'Floor' : `${i}` }), el('span.name', { text: pick ? pick.name.replace('Panchroma ', '') : 'Pick…' })]));
      }
      sec.appendChild(sw);
      if (st.picker) sec.appendChild(filamentList(st.picker, lib));
      if (m === 'paint') {
        sec.appendChild(el('div.row', {}, ['4th floor colour', el('div.track.mini.seg2', { role: 'group' }, [
          el('button.seg.sm' + (lay.floor.slots !== 4 ? '.on' : ''), { text: 'Off', onclick: () => { if (lay.floor.slots === 4) commitLayout((x) => { x.floor.slots = 3; }); } }),
          el('button.seg.sm' + (lay.floor.slots === 4 ? '.on' : ''), { text: 'On', title: 'MMU3, XL', onclick: () => { if (lay.floor.slots !== 4) commitLayout((x) => { x.floor.slots = 4; }); } }),
        ])]));
        sec.appendChild(el('div.pd-btns', {}, [['row', 'By row'], ['col', 'By column'], ['mix', 'Mix'], ['clear', 'Clear']].map(([id, name]) => el('button.key.sm', { text: name, onclick: () => fill(id) }))));
      }
    }
    sec.appendChild(el('p.hint', { text: m === 'off' ? 'Off: the drawer prints in one colour.' : m === 'one' ? 'Every floor in one colour. Single-nozzle printers swap filament once at 1.4 mm (the files come with it set); multi-material printers swap only on the three floor layers.' : 'Click compartments in the plan or the 3D view, then pick a floor colour in This compartment, or press 0 to 4. Body plus three floor colours fits one AMS.' }));
    lib.appendChild(sec);
  }
  /* the filament list for a floor slot: the planner's catalogue (filament-db.js), searched, a pick stored as the palette
     region Drawer:FLOORk; the Colors workspace's picker with its buy links takes over at M3 */
  let filamentQuery = '';
  function filamentList(slot, lib) {
    const box = el('div.pd-picker.well');
    const key = FLOOR_KEYS[slot - 1];
    const list = el('div.pd-filaments');
    const search = el('input.search', { type: 'search', placeholder: 'Search filaments…', value: filamentQuery, 'aria-label': 'Search filaments' });
    const fill2 = () => {
      list.replaceChildren();
      const q = filamentQuery.trim().toLowerCase();
      const rows = FILAMENT_DB.filter((f) => !q || (f.label || f.name).toLowerCase().includes(q)).slice(0, 60);
      for (const f of rows) list.appendChild(el('button.pd-fil', { title: f.label || f.name, onclick: () => { stage.setColor(key, { name: f.label || f.name, hex: f.hex, url: f.url }); st.picker = null; sync(); lib.replaceChildren(); renderLib(lib); pl.render(); } },
        [el('span.sw', { style: `background:${f.hex}` }), el('span', { text: (f.label || f.name).replace('Panchroma ', '') })]));
      if (!rows.length) list.appendChild(el('p.hint', { text: 'No filament by that name.' }));
    };
    search.addEventListener('input', () => { filamentQuery = search.value; fill2(); });
    fill2();
    box.append(search, list, el('div.pd-btns', {}, [el('button.key.sm', { text: 'Clear pick', onclick: () => { stage.setColor(key, null); st.picker = null; sync(); lib.replaceChildren(); renderLib(lib); pl.render(); } }), el('button.key.sm', { text: 'Close', onclick: () => { st.picker = null; lib.replaceChildren(); renderLib(lib); } })]));
    return box;
  }
  function downloadBlock(u) {
    const sec = el('section');
    sec.appendChild(el('h2.h2', { text: 'Download' }));
    sec.appendChild(el('button.key.strong.pd-download', { text: st.downloading ? 'Building the files…' : 'Download STL + 3MF (.zip)', disabled: !engineReady() || st.downloading, title: engineReady() ? 'The drawer as the generator makes it: STL and 3MF, README and layout.json' : 'The geometry engine is still loading', onclick: () => download(u.id) }));
    if (st.status) sec.appendChild(el('p.hint', { text: st.status }));
    return sec;
  }
  async function download(id) {
    const u = unitById(id); if (!u || !engineReady() || st.downloading) return;
    st.downloading = true; st.status = u.partsLayout && layoutOfUnit(u).floor.mode !== 'off' ? 'Building the colour parts…' : 'Packing STL and 3MF…'; ctx.renderAll();
    try {
      const { blob, filename } = await buildZip(engineReady(), fullOf(u), { bodyHex: stage.activeHex('Drawer') });
      saveBlob(blob, filename);
      st.status = `Saved ${filename}`;
    } catch (e) { console.error(e); st.status = `The files could not be built (${e && e.message || e}).`; }
    st.downloading = false; ctx.renderAll();
  }

  /* ---------------- the Inspector: this compartment ---------------- */
  function renderInspector(insp = inspEl) {
    if (!insp || st.editing == null) return;
    const u = editedUnit(); const s = selected();
    insp.replaceChildren();
    if (!u || !s.length) { insp.hidden = true; return; }
    insp.hidden = false;
    const full = fullOf(u), lay = layoutOfUnit(u), box = st.sel;
    const closeBtn = el('button.x', { title: 'Clear the selection', 'aria-label': 'Clear the selection', onclick: () => setSel(null) }, [icon('x', { size: 16 })]);
    insp.appendChild(el('div.head', {}, [el('h2.h2', { text: s.length === 1 ? 'This compartment' : `${s.length} compartments` }), el('span.idx', { text: `${fmt(box.x1 - box.x0)} × ${fmt(box.y1 - box.y0)} mm` }), closeBtn]));
    if (s.length === 1) {
      const c = s[0], hs = G.holderStatus(full, c);
      const w = c.x1 - c.x0, d = c.y1 - c.y0;
      const sc = G.scoopSize(full, c), tw = G.trayMM(c), te = G.traySize(full, c), rn = G.reachNote(full, c);
      const words = [c.holder ? (hs.ok ? 'label holder' : `label won't fit: ${hs.why}`) : 'no label holder', `${c.scoop === 'off' ? 'no' : (G.SCOOPS[c.scoop] || G.SCOOPS.std).name.toLowerCase()} scoop${c.scoop === 'deep' && sc < G.SCOOPS.deep.size - EPS ? ` (${fmt(sc)} mm here)` : ''}`, tw ? `${RAMP_NAME.toLowerCase()} ${fmt(tw)} mm${te < tw - EPS ? ` (${fmt(te)} here)` : ''}` : ''].filter(Boolean).join(', ');
      insp.appendChild(el('div.src', { text: words + '.' }));
      if (rn) insp.appendChild(el('div.warnbox', {}, [el('b', { text: 'Deep for its width. ' }), `${fmt(rn.depth)} mm down and ${fmt(rn.narrow)} across: the last parts are hard to reach. Merge it wider or use a lower drawer.`]));
      const num = (label, dim, value) => {
        const inp = el('input.mono', { type: 'number', step: '0.5', min: String(G.C.MIN_CELL), inputmode: 'decimal', value: fmt(value), 'aria-label': `Clear ${label.toLowerCase()} in mm` });
        const typed = () => { const v = parseFloat(inp.value); if (Number.isFinite(v) && Math.abs(v - value) > 0.05) applySize(dim, v); else inp.value = fmt(value); };
        inp.addEventListener('blur', typed);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); else if (e.key === 'Escape') { inp.value = fmt(value); inp.blur(); } e.stopPropagation(); });
        return el('div.row', {}, [label, el('div.pd-num', {}, [inp, el('span.unit-lbl', { text: 'mm' })])]);
      };
      insp.appendChild(num('Width', 'w', w));
      insp.appendChild(num('Depth', 'd', d));
    } else {
      const mergedFit = G.holderStatus(full, box).ok ? 'merged, they fit a label' : 'merged, still too small for a label';
      insp.appendChild(el('div.src', { text: `${s.length} compartments · ${mergedFit}.` }));
    }
    const all = (fn) => s.every(fn);
    insp.appendChild(el('div.row', {}, ['Label holder', el('div.track.mini.seg2', { role: 'group', 'aria-label': 'Label holder' }, [
      el('button.seg.sm' + (all((c) => !c.holder) ? '.on' : ''), { text: 'Off', onclick: () => setSelProp('holder', false) }),
      el('button.seg.sm' + (all((c) => c.holder) ? '.on' : ''), { text: 'On', title: 'L', onclick: () => setSelProp('holder', true) }),
    ])]));
    insp.appendChild(el('div.row', {}, ['Scoop', el('div.track.mini.seg3', { role: 'group', 'aria-label': 'Front scoop' }, [['off', 'Off'], ['std', 'Standard'], ['deep', 'Deep']].map(([id, name]) =>
      el('button.seg.sm' + (all((c) => c.scoop === id) ? '.on' : ''), { text: name, onclick: () => setSelProp('scoop', id) })))]));
    insp.appendChild(el('div.row', {}, [RAMP_NAME, el('div.track.mini.seg5', { role: 'group', 'aria-label': `${RAMP_NAME}, mm` }, G.TRAYS.map((v) =>
      el('button.seg.sm' + (all((c) => G.trayMM(c) === v) ? '.on' : ''), { text: v ? String(v) : 'Off', 'aria-label': v ? `${v} mm` : 'Off', title: 'T steps through', onclick: () => setSelProp('tray', v) })))]));
    if (lay.floor.mode === 'paint') {
      const hexes = floorHexes(), eff = (c) => (c.color >= 1 && c.color <= lay.floor.slots ? c.color : 0);
      insp.appendChild(el('div.row', {}, ['Floor colour', el('div.pd-colors', { role: 'group', 'aria-label': 'Floor colour for the selection' }, [...Array(lay.floor.slots + 1).keys()].map((k) =>
        el('button.pd-swatch.key.sm' + (all((c) => eff(c) === k) ? '.on' : ''), { title: k ? `Floor colour ${k} · key ${k}` : 'The body colour · key 0', 'aria-pressed': String(all((c) => eff(c) === k)), onclick: () => setSelProp('color', k) },
          [el('span.sw', { style: `background:${k ? hexes[k - 1] : stage.activeHex('Drawer')}` }), el('span.lbl', { text: k ? String(k) : 'Body' })])))]));
    }
    insp.appendChild(el('div.actions', {}, [
      el('button.key', { text: 'Merge', title: 'One compartment of the selection · M', disabled: s.length < 2, onclick: doMerge }),
      el('button.key', { text: 'Split', title: 'Back into grid cells · S', disabled: !canSplit(), onclick: doSplit }),
    ]));
  }
  let inspEl = null;

  /* ---------------- the Dock in edit mode ---------------- */
  function renderDock(dock) {
    const u = editedUnit(); if (!u) return;
    const full = fullOf(u), [fa, fb] = G.footprint(full.size);
    const bed = BEDS.find(([x, y]) => (fa <= x && fb <= y) || (fa <= y && fb <= x));
    let grams = null; if (engineReady()) { try { grams = drawerGeometry(full).grams; } catch { grams = null; } }
    const fg = G.floorRects(full).reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0) * G.SKIN, 0) / 1000 * G.C.PLA;
    dock.replaceChildren(
      el('div.status.stack', { disabled: true, title: 'Every compartment tiles the drawer' }, [el('span.dot'), `${n(full.comps.length, 'compartment')} · ${n(full.comps.filter((c) => G.hasHolder(full, c)).length, 'label')}`]),
      el('div.group', { title: 'Solid PLA; sliced with infill it comes out lighter' }, [el('span.big', { text: grams == null ? '…' : `≈ ${Math.round(grams)}${fg ? ` + ${Math.round(fg)}` : ''}` }), el('span.unit-lbl', { text: 'g PLA' })]),
      el('div.group', { title: bed ? `Prints ${fmt(fa)} × ${fmt(fb)} mm: fits ${bed[2]} or bigger` : `Prints ${fmt(fa)} × ${fmt(fb)} mm: bigger than a 360 mm bed` }, [el('span.big', { text: `${Math.round(fa)} × ${Math.round(fb)}` }), el('span.unit-lbl', { text: 'mm print' })]),
      el('button.cta', { title: 'Back to the build · Esc', onclick: () => stop() }, ['Done', icon('check', { size: 20 })]),
    );
  }

  /* ---------------- the unit Inspector's parts drawer block (outside edit mode) ---------------- */
  const codes = new Map();   // canonical layout -> its code (async, cached)
  function unitSection(u) {
    const sec = el('div.pd-unit');
    const full = fullOf(u);
    const key = JSON.stringify(Mk.canonical(full));
    const codeEl = el('span.mono', { text: codes.get(key) || 'MD-···-···' });
    if (!codes.has(key)) Mk.codeOf(full).then((c) => { codes.set(key, Mk.pretty(c)); if (codeEl.isConnected) codeEl.textContent = Mk.pretty(c); }).catch(() => {});
    sec.append(
      el('div.pd-plan', {}, [el('div.wellbox.well', {}, [planThumb(full)]), el('div.col', {}, [el('div', { text: `${n(full.comps.length, 'compartment')} · ${G.holderOf(full).name} labels` }), el('div.src', {}, ['Layout code ', codeEl]), el('div.src', { text: full.floor.mode === 'off' ? 'One colour' : full.floor.mode === 'one' ? 'Coloured floors' : 'Painted floors' })])]),
      el('div.actions', {}, [
        el('button.key.strong', { text: 'Edit compartments', title: 'Open the drawer and lay out its compartments', onclick: () => { start(u.id); ctx.renderAll(); } }),
        el('button.key', { text: st.downloading ? 'Building…' : 'Download', title: engineReady() ? 'STL and 3MF, as the generator makes them (.zip)' : 'The geometry engine is still loading', disabled: !engineReady() || st.downloading, onclick: () => download(u.id) }),
      ]),
    );
    if (st.status) sec.appendChild(el('p.hint', { text: st.status }));
    return sec;
  }

  /* ---------------- keys ---------------- */
  function key(e) {
    if (st.editing == null) return false;
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (k === 'escape') { if (st.picker) { st.picker = null; ctx.renderAll(); return true; } if (st.sel) { setSel(null); return true; } stop(); return true; }
    if (k === 'delete' || k === 'backspace') return true;   // not the unit under edit (build.js would remove it); compartments are merged, not deleted
    if (k === 'm') { doMerge(); return true; }
    if (k === 's') { doSplit(); return true; }
    if (k === 'l') { doHolder(); return true; }
    if (k === 't') { const s = selected(); if (s.length) setSelProp('tray', nextTray(s)); return true; }
    const u = editedUnit();
    if (/^[0-4]$/.test(k) && u && layoutOfUnit(u).floor.mode === 'paint' && +k <= layoutOfUnit(u).floor.slots && selected().length) { setSelProp('color', +k); return true; }
    return false;
  }

  return {
    get editing() { return st.editing; }, get view() { return st.view; },
    start, stop, key, sync, afterUpdate, unitSection,
    isParts: (u) => isPartsDrawer(L(), u), sizeOk: (u) => partsSizeOk(L(), u), sizeWhy: (w, h) => partsSizeWhy(L(), w, h),
    /* a parts drawer resized: its layout moved to the new size (unit.js layoutForSize), said when the grid started over */
    resized(p, w, hh) {
      if (p.variant !== PARTS) return;
      const from = sizeOfUnit(L(), p), to = G.sizeKey(L(), w);
      if (!G.SIZES[to] || !G.SIZES[to].heights[heightOfUnit({ hh })]) return;
      const r = layoutForSize(layoutOf(L(), p), from, to); p.partsLayout = r.layout;
      if (r.note) say(r.note);
    },
    renderLib, renderInspector: (insp) => { inspEl = insp; renderInspector(insp); }, renderDock,
    plan: pl, toolbar: editBar,
    render2d() { pl.render(); },
    setPanels() { editBar.sync(); },
    destroy() { if (st.editing != null) stop({ quiet: true }); for (const u of S().placed) if (u.fill === 'decor') stage.setDrawerBody(u.id, null); pl.destroy(); editBar.el.remove(); },
  };
}
