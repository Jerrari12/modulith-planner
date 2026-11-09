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
   M3 (2026-11-05): generation runs in a worker (engine.js), the parts list (a part per compartment, a layout from a
   list, part outlines on the floors, labels.csv in the download, the label text on the holders) and the link from a
   compartment to its row in the build's label list (comp.labelId; js/parts-drawer/labels.js). Not here (SPEC open
   decision 7): cells, lid, covers. */
import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { picOf, PIC_NOTE } from './hwpics.js';
import { toolbar } from '../ui/toolbar.js';
import { FILAMENT_DB } from '../filament-db.js';
import * as G from './gen.js';
import * as Mk from './marks.js';
import { frameOf } from './frame.js';
import * as I from './inventory.js';
import { partsEngine, engineReady, shellGeometry, drawerGeometry, zipFor } from './engine.js';
import { PARTS, sizeOfUnit, heightOfUnit, partsSizeOk, isPartsDrawer, partsSizeWhy, layoutOf, layoutForSize, fullLayout, FLOOR_KEYS, FLOOR_DEFAULT_HEX, keepOf, defaultLayout, cleanItem, outlinesOf, compLabelText } from './unit.js';
import { plan, planThumb } from './plan.js';
import { hitWall, startWallDrag, moveWallDrag, dragMoved, chainKey } from './walls.js';   // the wall drag in 3D (2026-11-06)
import { attachHint } from '../ui/hint.js';   // the hover clips on the editor's controls (2026-11-06)
import { GUIDE } from './guide.js';
import { saveBytes } from './download.js';
import { unitName } from '../rules/schema.js';
import { isPhone } from '../ui/phone.js';
import { partPicker } from '../ui/partpicker.js';   // the parts list's Part Picker (2026-11-07), the Labels workspace's modal

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
  const st = { editing: null, view: '2d', sel: null, hover: null, hot: null, hotKey: '', wdrag: null, edges: true, picker: null, engineErr: null, booting: false, status: '', downloading: false, inv: null, dockEl: null };   // hot: the wall chain under the 3D pointer; wdrag: a 3D wall drag in progress
  let alive = true;
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
    ctx.edit((s) => { const p = s.placed.find((q) => q.id === id); if (!p) return; const lay = layoutOf(L(), p); fn(lay, p); p.partsLayout = lay; syncLinkedLabels(s, lay); }, why, { gravity: false });
    st.sel = st.sel && regrow(st.sel);
  }

  /* a compartment linked to a row of the build's label list (comp.labelId, M3): its words follow its part in the same
     commit; a compartment whose part is gone lets its row go (the row stays in the list, waiting) */
  function syncLinkedLabels(s, lay) {
    const labels = s.labelList && Array.isArray(s.labelList.labels) ? s.labelList.labels : [];
    for (const c of lay.comps) {
      if (!c.labelId) continue;
      const text = compLabelText(c);
      if (!text) { delete c.labelId; continue; }
      const l = labels.find((x) => x.id === c.labelId);
      if (l && l.text !== text) l.text = text;
    }
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
  /* the part in one compartment, typed as the prototype's Part field takes it ("M3x10 SHCS 100"); empty clears it */
  function setPart(text) {
    const s = selected(); if (s.length !== 1) return;
    const v = text.trim(), box = st.sel;
    if (!v) { commitLayout((x) => { for (const c of x.comps) if (G.inBox(c, box)) { delete c.item; delete c.labelId; } }); return; }
    const r = I.parseLine(v);
    if (!r || r.error) { say(r && r.error ? r.error[0].toUpperCase() + r.error.slice(1) + '.' : 'That part was not understood.'); return; }
    const item = cleanItem(r); if (!item) { say('That part is not one the generator knows.'); return; }
    commitLayout((x) => { for (const c of x.comps) if (G.inBox(c, box)) c.item = item; });
  }
  /* THE PARTS LIST (M3's dialog; a panel since 2026-11-07, DECISIONS of that day): the Library's own mode while it is open.
     A kit, typed lines, a file or the Part Picker become items; the plan shows the list's layout as a dashed preview, redrawn
     on every change, and Lay out drawer commits it (one history entry). The list reopens from the compartments' parts in
     their reading order with the sizing it was laid out with (partsLayout.fit); the compartments keep the counted quantity.
     The draft is keyed to the edited unit and recomputed from the unit as it is now on every render (an undo changes the
     unit, not the list). Back, Esc and Done drop the draft. */
  const invKeep = () => { const u = editedUnit(); return u ? layoutOfUnit(u).comps.filter((c) => c.item).map((c) => ({ ...c.item })) : []; };
  const FIT_DEFAULT = { cap: 0.75, round: false, spare: true };
  const FIT_CAPS = [[1, 'Exact'], [0.75, 'Comfortable'], [0.5, 'Plenty']];
  function openInventory() {
    const u = editedUnit(); if (!u) return;
    const lay = layoutOfUnit(u);
    st.inv = { items: invKeep(), skipped: [], colorBy: 'none', labels: lay.comps.some((c) => c.holder !== false), ...FIT_DEFAULT, ...(lay.fit || {}), last: null, draft: null, focusLine: false, dirty: false };   // dirty: changed since it opened (invChanged), what makes leaving ask
    st.sel = null; st.hover = null; st.hot = null; st.hotKey = ''; st.wdrag = null;
    pl.cancel();   // a wall or box drag in progress ends without committing: the drawer stays as it is until Lay out drawer (Sol 01a1b901)
    ctx.renderAll();
  }
  function closeInventory() { if (st.inv && st.inv.drag) st.inv.drag.cancel(); st.inv = null; st.hover = null; }   // a highlighted proposal is no compartment of the drawer
  /* leaving the list (Back, Esc, the Dock's Done) while a layout is proposed and not applied: the bright Done dropped it
     without a word (Sol 01a1bc8e, 2026-11-08), so the list asks first, in a warnbox at its head (renderInvPanel); `leave`
     is what to do once Lay out drawer or Drop the list has answered */
  const invPending = () => { const w = st.inv; if (!w || !w.dirty || !w.items.length) return false; const l = invLast(); return !!(l && !l.r.error); };   // a list reopened from the drawer's parts and left alone proposes nothing new
  function invLeave(then) {
    const w = st.inv; if (!w) { then(); return; }
    if (invPending()) { w.leave = then; ctx.renderAll(); say('The list’s layout is not applied yet: Lay out drawer keeps it, Drop the list leaves the drawer as it was.'); return; }
    closeInventory(); then();
  }
  function leaveEdit() { if (st.inv) invLeave(() => stop()); else stop(); }
  // Esc on the list, from the page or the typing line: with the ask showing it means Keep editing (the line's own handler went
  // straight to invLeave and overwrote a pending Done with Back, Sol 01a1bc9f); otherwise it is Back
  const invEsc = () => { if (!st.inv) return; if (st.inv.leave) { st.inv.leave = null; ctx.renderAll(); } else invLeave(() => ctx.renderAll()); };
  const invOpts = (work) => ({ fillCap: work.cap, order: 'list', roundTo: work.round ? 'bag' : null, spareRow: !!work.spare });
  function invPlan(work = st.inv, height = null) {
    const u = editedUnit(); if (!u) return { error: 'No drawer.' };
    const lay = layoutOfUnit(u);
    return I.layoutFor(work.items, { size: sizeOfUnit(L(), u), height: height || heightOfUnit(u), label: lay.label, labels: work.labels, scoop: mode(lay.comps.map((c) => c.scoop)), ...invOpts(work) });
  }
  /* what the list says about its layout: the plan's note, the panel's summary and the Inspector's (one computation per render;
     `load` is the fill against the cap, so "too full" means over the room chosen, not over the wall) */
  function invSummary(work = st.inv) {
    const u = editedUnit(); const HS = u ? Object.keys(G.SIZES[sizeOfUnit(L(), u)].heights) : [], hi = u ? HS.indexOf(heightOfUnit(u)) : 0;
    const r = work.items.length ? invPlan(work) : { error: 'Add some parts to see how they fit.' };
    const fits = (h, cap) => { const x = invPlan(work, h); return !x.error && x.load <= cap; };
    let text = '', warn = !!r.error || r.load > 1;
    if (r.error) { const below = HS.slice(0, hi), lower = work.items.length ? below.find((h) => fits(h, 0.9)) || below.reverse().find((h) => fits(h, 1)) : null; text = r.error + (lower && /to reach into/.test(r.error) ? ` A ${lower} drawer takes them.` : ''); }
    else {
      let tip = '';
      if (r.load > 1) { const up = HS.slice(hi + 1).find((h) => fits(h, 1)); tip = up ? ` Too full for ${heightOfUnit(u)}: try ${up}, lower the quantities, or less room to grow.` : ' Too full: lower the quantities, choose less room to grow, or split the list across two drawers.'; }
      else { const lower = HS.slice(0, hi).find((h) => fits(h, 0.9)); if (lower) tip = ` Plenty of room: a ${lower} drawer would probably do.`; }
      const spare = work.spare ? (r.spare ? ` A spare row of ${r.spare} at the back.` : ' No room left for a spare row.') : '';
      const fullest = Math.max(0, ...r.comps.map((c) => invFill(c, work)?.fill ?? 0));   // counted, as the rows say it (sizing for the next bag makes r.fullest the sized one)
      text = `${n(work.items.length, 'part')} in ${n(r.rows, 'row')} · fullest compartment about ${Math.round(fullest * 100)}% full.${spare}${tip}`;
    }
    if (work.skipped.length) text += ` ${n(work.skipped.length, 'line')} not laid out.`;   // the lines the list could not take, counted where Lay out drawer is pressed (Sol 01a1bc8e)
    return { r, text, warn };
  }
  /* one computation per render, keyed to the unit's layout record, size and height: an undo or a rebuild replaces the record,
     so the preview follows the unit whatever order the panels render in (Sol 01a1b901); a change of the list clears it */
  const invKey = () => { const u = editedUnit(); return u ? { rec: u.partsLayout, size: sizeOfUnit(L(), u), height: heightOfUnit(u) } : null; };
  const invLast = () => {
    const w = st.inv; if (!w) return null;
    const k = invKey(); if (w.last && k && w.last.key.rec === k.rec && w.last.key.size === k.size && w.last.key.height === k.height) return w.last;
    w.last = { ...invSummary(w), key: k }; return w.last;
  };
  // the fill a proposed compartment would have with the COUNTED quantity (inventory.js fillOf), and that against the room chosen
  const invFill = (c, work = st.inv) => { const u = editedUnit(); if (!u || !c.item) return null; const f = I.fillOf(c, heightOfUnit(u), sizeOfUnit(L(), u), layoutOfUnit(u).label); return f == null ? null : { fill: f, load: f / work.cap }; };
  const invPreview = () => {
    const l = invLast(); if (!l) return null; const comps = l.r.error ? [] : l.r.comps, w = st.inv, dg = w.drag && w.drag.live ? w.drag : null;
    return { comps, note: dg ? dg.text : l.text, warn: dg ? false : l.warn, hl: w.hl != null ? comps.filter((c) => c.item)[w.hl] || null : null, drop: dg && dg.target && dg.target.comp || null, dropEnd: !!(dg && dg.target && dg.target.end) };
  };
  // the items the engine lays out, in the list's order: a card's rank among them is its compartment's
  const invKept = (work = st.inv) => work.items.filter((it) => I.known(it) && !I.TYPES[it.type].outside);
  // a part's plain name for a card: "M3 × 12 socket head screw" (the label keeps the short form, inventory.js labelLines)
  const partName = (it) => { const T = I.TYPES[it.type] || { name: String(it.type || 'part') }; return `${it.size}${(T.screw || T.len) && it.length ? ' × ' + it.length : ''} ${T.name.toLowerCase()}`; };
  /* a row and its proposed compartment light together (Sol 01a1bd5c, 2026-11-08): the rank among the kept items is the key both
     ways (the rows map onto the engine's compartments by rank, renderInvPanel). From the plan the row scrolls into view, and a
     press on a proposed compartment puts the focus in its row's quantity. The classes are toggled in place: a re-render of the
     panel would take the focus from the field being typed in */
  const invRankOf = (c) => { const l = invLast(); return l && !l.r.error && c ? l.r.comps.filter((x) => x.item).indexOf(c) : -1; };
  function invHl(rank, from = 'list') {
    const w = st.inv; if (!w) return;
    const r = rank != null && rank >= 0 ? rank : null; if (w.hl === r && from === 'list') return;
    w.hl = r;
    (w.rowEls || []).forEach((e, i) => { if (!e) return; e.classList.toggle('hl', i === r); if (i === r && from === 'plan') e.scrollIntoView({ block: 'nearest' }); });
    const pv = invPreview(); st.hover = pv ? pv.hl : null; update3d(); pl.render();
  }
  function invPick(c) { const r = invRankOf(c); if (r < 0) return; const it = invKept()[r]; if (!it) return; st.inv.open = it; st.inv.focusQty = it; st.inv.hl = r; ctx.renderAll(); }   // the card opens on its quantity
  // a change of the list: the proposal is recomputed, and a lit compartment follows the new proposal at the same rank (or goes,
  // when that rank is gone: a row removed), so the 3D plane never keeps a compartment of a proposal that no longer exists (Sol 01a1bd82)
  const invChanged = () => { if (st.inv) { st.inv.last = null; st.inv.dirty = true; if (st.inv.hl != null) { const pv = invPreview(); if (!pv || !pv.hl) st.inv.hl = null; st.hover = pv ? pv.hl : null; } } ctx.renderAll(); };
  function invAdd(list) {
    const work = st.inv; if (!work) return 0;
    const items = list.items.filter((it) => I.TYPE_ORDER.includes(it.type)), other = list.items.filter((it) => !I.TYPE_ORDER.includes(it.type));
    for (const it of items) { const same = work.items.find((x) => x.type === it.type && x.size === it.size && (x.length || 0) === (it.length || 0)); if (same) same.qty += it.qty; else work.items.push({ ...it }); }
    for (const it of other) work.skipped.push(`${I.labelText(it)}${it.qty ? ' × ' + it.qty : ''} · not a drawer part yet (the list takes screws, nuts, washers and inserts)`);
    for (const e of list.errors) work.skipped.push(e);
    return items.length;
  }
  function invApply() {
    const work = st.inv, u = editedUnit(); if (!work || !u) return;
    const r = invPlan(); if (r.error) { say(r.error); return; }
    const keys = new Set(r.comps.filter((c) => c.item).map((c) => (work.colorBy === 'size' ? c.item.size : I.TYPES[c.item.type].short)));
    const slots = keys.size > 3 ? 4 : 3;
    const colors = I.colorBy(r.comps, work.colorBy, slots);
    commitLayout((x) => {
      x.comps = r.comps.map((c, i) => { const item = c.item ? cleanItem(c.item) : null; return { ...G.comp(c.x0, c.x1, c.y0, c.y1, { holder: c.holder !== false, scoop: c.scoop || 'std', tray: 0, color: colors[i] }), ...(item ? { item } : {}) }; });
      x.nr = r.rows; x.nc = Math.max(...[...new Set(r.comps.map((c) => c.y0))].map((y) => r.comps.filter((c) => c.y0 === y).length));
      x.fit = { cap: work.cap, round: !!work.round, spare: !!work.spare };
      if (work.colorBy !== 'none') { x.floor.mode = 'paint'; x.floor.slots = slots; }
    });
    st.sel = null; st.inv = null; st.hover = null; ctx.renderAll();
  }
  /* the Part Picker (js/ui/partpicker.js, the Labels workspace's modal): a batch becomes list items, not labels */
  let pp = null; const ppAC = new AbortController();
  function openPartPicker() {
    if (!pp) pp = partPicker({
      root, signal: ppAC.signal, buildId: () => S().buildId, frameQuery: () => (S().faceStyle === 'classicpro' ? '&type=classicpro' : '') + '&dest=drawer', debug: !!new URLSearchParams(location.search).get('debug'),
      // the modal's own words say where a batch goes (Sol 01a1bc8e: the Labels wording promised labels); `dest` rides on the
      // frame's address and the hello for a Picker that words its button and marks its families by it (the Picker's change)
      sub: 'Choose parts, then Add: each comes back as a line of this list and gets its own compartment. Screws, set screws, nuts, washers and inserts lay out; other families are listed as not laid out.',
      hello: { dest: 'drawer' },
      onBatch: (items, { reply, close }) => {
        if (!st.inv) { reply({ gen2parts: 'refused', reason: 'The parts list is closed. Open it and press Add again.' }); return; }
        const list = I.fromPicker(items), took = invAdd(list);
        reply({ gen2parts: 'added', count: took, skipped: items.length - took });
        close(); invChanged(); say(`${n(took, 'part')} added to the list${items.length - took ? `, ${items.length - took} not laid out` : ''}.`);
      },
    });
    pp.open();
  }
  /* the part's fields, the same in a list row, the add row and the Inspector (one editing surface, Sol 01a1bd5c, 2026-11-08):
     type, thread size, length (screws only). `on(patch)` gets what changed, with a length given to a screw that had none and
     the size corrected when the new type has no table for the old one. picEl: the hardware library's render beside them
     (hwpics.js), or an empty frame for a part the library does not draw */
  const fieldSel = (opts, val, on, attrs = {}) => { const e = el('select', attrs); for (const [v, t] of opts) e.appendChild(el('option', { value: v, text: t })); e.value = val; e.onchange = () => on(e.value); return e; };
  const fieldNum = (val, on, dis, label) => el('input.mono', { type: 'number', min: '0', step: '1', value: dis ? '' : String(val), disabled: !!dis, 'aria-label': label, onchange: (e) => on(+e.target.value) });
  const sizesFor = (it) => I.THREADS.filter((sz) => I.known({ ...it, size: sz, length: it.length || 10 }));
  const picEl = (it) => { const src = picOf(it); return src ? el('img.pd-pic', { src, alt: '', width: 28, height: 28, loading: 'lazy', draggable: 'false', title: PIC_NOTE }) : el('span.pd-pic', { title: 'No picture of this part yet' }); };
  function partFields(it, on, labels = ['Part type', 'Thread size', 'Length, mm']) {
    const retype = (v) => { const next = { ...it, type: v }; if (I.TYPES[v].screw && !next.length) next.length = 10; if (!I.known(next)) next.size = I.THREADS.find((sz) => I.known({ ...next, size: sz })) || 'M3'; on({ type: v, length: next.length, size: next.size }); };
    return [
      fieldSel(I.TYPE_ORDER.map((k) => [k, I.TYPES[k].name]), it.type, retype, { 'aria-label': labels[0] }),   // the plain name: SHCS meant nothing to Joey (2026-11-08); the label keeps the short form
      fieldSel(sizesFor(it).map((v) => [v, v]), it.size, (v) => on({ size: v }), { 'aria-label': labels[1] }),
      fieldNum(it.length, (v) => on({ length: Math.max(1, v) }), !I.TYPES[it.type].screw, labels[2]),
    ];
  }
  /* A CARD DRAGGED ONTO THE PLAN (Sol 01a1be4f, 2026-11-08): the drag says WHERE in the order, never the geometry. It starts on
     the card's handle (touch-action none there alone, so the panel still scrolls everywhere else), after 6 px of movement, with
     the pointer captured: the plan gets no events of its own, the target is asked of it by position (plan.js dropTargetAt) and
     the proposal stays still while aiming. A drop on another part puts the dragged one before it; behind the last row (or on
     the spare row) puts it last; anywhere else, Esc, a lost capture or a cancel changes nothing. One drop is one change of
     the list (one re-layout). The ghost takes no events and sits off the pointer so a finger does not hide the target. */
  function invDrag(e, it, grip, card) {
    const work = st.inv; if (!work || work.drag || e.button !== 0) return;
    const name = partName(it), id = e.pointerId;
    try { grip.setPointerCapture(id); } catch { return; }   // without the capture the moves would not reach the handle: no drag (Sol 01a1be67)
    const s = { item: it, live: false, ghost: null, target: null, key: undefined, text: '', done: false, cancel: () => end(false) };
    work.drag = s;   // from the press, so a second finger starts no second session and Esc or closing the list ends this one while it is still pending
    const sentence = (t) => {
      if (!t) return `Drop ${name} on another part to put it before that part, or behind the last row to put it last.`;
      if (t.end) return `Move ${name} to the back.`;
      const tgt = invKept()[invRankOf(t.comp)]; if (!tgt || tgt === it) return `${name} stays where it is.`;
      return `Move ${name} before ${partName(tgt)}.`;
    };
    const move = (ev) => {
      if (ev.pointerId !== id || s.done) return;
      if (!s.live) {
        if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 6) return;
        s.live = true; s.text = sentence(null);
        s.ghost = el('div.pd-ghost', {}, [picEl(it), el('span', { text: name })]); document.body.appendChild(s.ghost);
        document.body.classList.add('pd-dragging'); card.classList.add('dragging'); pl.render();
      }
      s.ghost.style.transform = `translate(${Math.round(ev.clientX + 16)}px, ${Math.round(ev.clientY - 44)}px)`;
      const t = pl.dropTargetAt(ev.clientX, ev.clientY), key = t ? (t.end ? 'end' : invRankOf(t.comp)) : null;
      if (key !== s.key) { s.key = key; s.target = t; s.text = sentence(t); pl.render(); }
    };
    const end = (commit) => {
      if (s.done) return; s.done = true;
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', s.cancel); grip.removeEventListener('lostpointercapture', s.cancel);
      try { if (grip.hasPointerCapture(id)) grip.releasePointerCapture(id); } catch {}
      if (work.drag === s) work.drag = null;
      if (!s.live) return;
      if (s.ghost) s.ghost.remove(); document.body.classList.remove('pd-dragging'); card.classList.remove('dragging');
      if (!(commit && s.target && invDrop(it, s.target))) pl.render();   // nothing moved: the plan redraws without the target
    };
    // 3: the target is where the pointer is RELEASED, not where it last moved (Sol 01a1be67)
    const up = (ev) => { if (ev.pointerId !== id) return; if (s.live) s.target = pl.dropTargetAt(ev.clientX, ev.clientY); end(true); };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', s.cancel); grip.addEventListener('lostpointercapture', s.cancel);
  }
  // the drop: the part before the target part, or last; true when the order changed (then the list re-lays out and says so)
  function invDrop(it, t) {
    const work = st.inv; if (!work) return false;
    const items = work.items, from = items.indexOf(it); if (from < 0) return false;
    if (t.end) { items.splice(from, 1); items.push(it); }
    else { const tgt = invKept()[invRankOf(t.comp)]; if (!tgt || tgt === it) return false; items.splice(from, 1); items.splice(items.indexOf(tgt), 0, it); }
    if (items.indexOf(it) === from) return false;
    work.focusMove = it; invChanged(); say(`${partName(it)} is now part ${items.indexOf(it) + 1} of ${items.length}.`);
    return true;
  }
  function renderInvPanel(lib, u) {
    const work = st.inv, { r, text, warn } = invLast();
    const rerender = () => { lib.replaceChildren(); renderLib(lib); };
    const sel = fieldSel, num = fieldNum;
    lib.appendChild(el('div.pd-head', {}, [
      el('div.col', {}, [el('h2.h2', { text: 'Parts list' }), el('h3', { text: unitName(u) || `${u.w}W·${u.hh / 2}H parts drawer` }), el('div.readout', { text: 'Every part gets a compartment sized for its quantity · the plan shows the layout as you go' })]),
      el('button.key.sm', { text: 'Back', title: 'Back to the compartment tools · Esc (a layout still proposed asks first)', onclick: () => invLeave(() => ctx.renderAll()) }),
    ]));
    if (work.leave) lib.appendChild(el('div.warnbox.pd-inv-leave', {}, [
      el('div', {}, [el('b', { text: 'This layout is not applied yet. ' }), 'Lay out drawer keeps it; Drop the list leaves the drawer as it was.']),
      el('div.iact', {}, [
        el('button.key.sm.strong', { text: 'Lay out drawer', onclick: () => { const then = work.leave; invApply(); if (!st.inv) then(); } }),
        el('button.key.sm', { text: 'Drop the list', onclick: () => { const then = work.leave; closeInventory(); then(); } }),
        el('button.key.sm', { text: 'Keep editing', onclick: () => { work.leave = null; ctx.renderAll(); } }),
      ]),
    ]));
    // in: a typed line (Enter), a pasted list, the Part Picker, a file, a kit
    const line = el('input.mono', { type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'M3x10 SHCS 100', 'aria-label': 'A part: size, type and quantity, then Enter' });
    const addText = (t) => { if (!t.trim()) return 0; const took = invAdd(I.parseList(t)); line.value = ''; work.focusLine = true; invChanged(); return took; };
    line.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addText(line.value); } else if (e.key === 'Escape') { e.preventDefault(); invEsc(); } e.stopPropagation(); });   // Esc is Back, from the line too
    line.addEventListener('paste', (e) => { const t = (e.clipboardData || window.clipboardData)?.getData('text') || ''; if (/\n|;/.test(t)) { e.preventDefault(); addText(t); } });
    const fileIn = el('input', { type: 'file', accept: '.json,.csv,.txt', hidden: true, 'aria-label': 'A parts list file', onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return; const t = await f.text(); e.target.value = '';
      let list = null;
      try { const j = JSON.parse(t); const arr = Array.isArray(j) ? j : j.items || j.labels || j.rows || []; list = I.fromPicker(arr.map((x) => (x && typeof x === 'object' && x.schema ? x : typeof x === 'object' && x ? (x.text || x.label || [x.line1, x.line2].filter(Boolean).join(' ')) : x))); }
      catch { list = I.parseList(t.split(/\r?\n/).map((l) => l.split(',').filter((c) => c.trim()).join(' ')).join('\n')); }
      invAdd(list); invChanged();
    } });
    const kitSel = sel([['', 'Start from a kit…'], ...Object.entries(I.KITS).map(([k, kit]) => [k, kit.name])], '', (v) => { const kit = I.KITS[v]; if (kit) { work.items = kit.items.map((x) => ({ ...x })); work.skipped = []; invChanged(); } }, { 'aria-label': 'Start from a kit' });
    lib.appendChild(el('section.pd-inv', {}, [
      el('div.pd-inv-line', {}, [line, el('button.key.sm', { text: 'Add', title: 'Add the line (Enter does too); several lines pasted come in together', onclick: () => addText(line.value) })]),
      el('div.pd-btns', {}, [
        el('button.key.sm', { text: 'Part Picker…', title: 'Choose parts in the Part Picker: they come here as lines of the list, not as labels', onclick: openPartPicker }),
        el('details.pd-inv-more', { open: work.moreOpen ? true : null, ontoggle: (e) => { work.moreOpen = e.target.open; } }, [el('summary', { text: 'More ways to add' }), el('div.pd-btns', {}, [el('button.key.sm', { text: 'Import a list…', title: 'A text or CSV list, or a Part Picker items file', onclick: () => fileIn.click() }), fileIn, kitSel])]),
      ]),
    ]));
    // THE PARTS AS CARDS (Sol 01a1be4f, 2026-11-08: Joey found the rows' abbreviations opaque and the panel overwhelming): a card
    // shows what identifies the part, the picture large and its plain name, and how many; one card at a time opens for its
    // fields. The layout follows the cards' order: a card is moved with its arrows, with Move to front / back when open, or
    // dragged by its handle onto the plan (invDrag), where a drop on another part puts it before that part and a drop behind
    // the last row puts it last; the engine keeps sizing every compartment for its count
    const list = el('section.pd-inv');
    const withItems = r.error ? [] : r.comps.filter((c) => c.item);
    list.appendChild(el('div.pd-inv-top', {}, [el('h2.h2', { text: n(work.items.length, 'part') }),
      sel([['', 'Sort…'], ['type', 'By type, then size'], ['size', 'By size, then type'], ['qty', 'By quantity'], ['asis', 'Leave as they are']], '', (v) => {
        if (v === 'type') work.items = I.sortItems(work.items);
        else if (v === 'size') work.items = [...work.items].sort((a, b) => I.sizeKey(a) - I.sizeKey(b) || I.TYPE_ORDER.indexOf(a.type) - I.TYPE_ORDER.indexOf(b.type) || (a.length || 0) - (b.length || 0));
        else if (v === 'qty') work.items = [...work.items].sort((a, b) => (b.qty || 0) - (a.qty || 0));
        if (v && v !== 'asis') invChanged(); else rerender();
      }, { 'aria-label': 'Sort the list' })]));
    if (work.items.length > 1) list.appendChild(el('p.hint.pd-inv-order', { text: 'The first part goes front-left, the last back-right. Drag a part by its handle onto the drawer to move it; the compartments resize to fit.' }));
    const cards = el('div.pd-cards');
    if (!work.items.length) cards.appendChild(el('p.hint', { text: 'No parts yet. Type a line above, pick one below, or open the Part Picker.' }));
    const announce = (it) => say(`${partName(it)} is now part ${work.items.indexOf(it) + 1} of ${work.items.length}.`);
    const moveTo = (it, j) => { const i = work.items.indexOf(it); if (i < 0 || j < 0 || j >= work.items.length || j === i) return; work.items.splice(i, 1); work.items.splice(j, 0, it); work.focusMove = it; invChanged(); announce(it); };
    // a card's compartment: the engine keeps the known, in-drawer items in the list's order, so the cards map onto them by rank
    const kept = invKept();
    work.rowEls = [];   // by that rank, for the card <-> compartment highlight (invHl)
    work.items.forEach((it, i) => {
      const ki = kept.indexOf(it), c = ki >= 0 ? withItems[ki] || null : null, f = c ? invFill(c, work) : null, open = work.open === it;
      const name = partName(it);
      const fill = f ? (f.fill < 0.05 ? 'under 5% full' : `about ${Math.round(f.fill * 100)}% full`) + (f.load > 1 + 1e-9 ? ' · over the room chosen' : '') : (ki < 0 ? 'not laid out' : '');
      const grip = el('button.pd-grip', { type: 'button', 'aria-label': `Drag ${name} onto the drawer to move it`, title: 'Drag onto the drawer to move this part' }, [el('span'), el('span'), el('span'), el('span'), el('span'), el('span')]);
      grip.addEventListener('pointerdown', (e) => invDrag(e, it, grip, card));
      const qtyBtn = el('button.pd-qty-btn', { type: 'button', text: String(it.qty || 0), 'aria-label': `${it.qty || 0} of ${name}; change the quantity`, title: 'How many: press to change', onclick: () => { work.open = it; work.focusQty = it; rerender(); } });
      const head = el('button.pd-card-head', { type: 'button', 'aria-expanded': open ? 'true' : 'false', 'aria-label': `${name}${open ? ', close its fields' : ', open its fields'}`, onclick: () => { work.open = open ? null : it; work.focusHead = it; rerender(); } }, [el('span.pd-card-name', { text: name })]);
      const card = el('div.pd-card' + (f && f.load > 1 + 1e-9 ? '.over' : '') + (c && work.hl === ki ? '.hl' : '') + (open ? '.open' : ''), {}, [
        grip, picEl(it), el('div.pd-card-main', {}, [head, el('div.pd-card-sub', {}, [qtyBtn, el('span.pd-card-fill', { text: fill, title: f ? 'How full its compartment would be with what you counted' : '' })])]),
        el('div.pd-inv-move', {}, [el('button', { text: '▲', 'aria-label': `Move ${name} up, toward the front`, title: 'Move up', disabled: i === 0, onclick: () => moveTo(it, i - 1) }), el('button', { text: '▼', 'aria-label': `Move ${name} down, toward the back`, title: 'Move down', disabled: i === work.items.length - 1, onclick: () => moveTo(it, i + 1) })]),
        el('button.x', { 'aria-label': 'Remove ' + name, title: 'Remove', onclick: () => { if (work.open === it) work.open = null; work.items.splice(i, 1); invChanged(); } }, [icon('x', { size: 14 })]),
      ]);
      if (open) card.appendChild(el('div.pd-card-edit', {}, [
        ...partFields(it, (p) => { Object.assign(it, p); invChanged(); }),
        el('label.pd-card-qtyf', {}, ['Qty', num(it.qty, (v) => { it.qty = Math.max(0, Math.round(v)); invChanged(); }, false, 'Quantity')]),
        el('div.pd-card-edit-row', {}, [
          el('span.pd-inv-fill', { text: `Printed label: ${I.labelLines(it).filter(Boolean).join(' / ')}`, title: 'What the compartment’s label will say' }),
          el('span.grow'),
          el('button.key.sm', { text: 'Move to front', disabled: i === 0, onclick: () => moveTo(it, 0) }),
          el('button.key.sm', { text: 'Move to back', disabled: i === work.items.length - 1, onclick: () => moveTo(it, work.items.length - 1) }),
        ]),
      ]));
      // a card under the pointer, or holding the focus, lights its proposed compartment in the plan and in 3D; the plan lights the
      // card back (invHl). The pointer leaving keeps the light while the card holds the focus, and the focus leaving (Tab) keeps it
      // while the pointer is over the card (Sol 01a1bd82)
      if (c) {
        work.rowEls[ki] = card;
        card.addEventListener('pointerenter', () => invHl(ki));
        card.addEventListener('pointerleave', () => { if (!card.contains(document.activeElement)) invHl(null); });
        card.addEventListener('focusin', () => invHl(ki));
        card.addEventListener('focusout', (e) => { if (!(e.relatedTarget && card.contains(e.relatedTarget)) && !card.matches(':hover')) invHl(null); });
      }
      cards.appendChild(card);
      if (work.focusHead === it) { work.focusHead = null; queueMicrotask(() => { if (head.isConnected) head.focus({ preventScroll: true }); }); }   // the re-render took the focus from the head (Sol 01a1be67)
      if (work.focusQty === it) { work.focusQty = null; const q = card.querySelector('.pd-card-qtyf input'); if (q) queueMicrotask(() => { if (q.isConnected) { q.focus({ preventScroll: true }); q.select(); } }); }
      if (work.focusMove === it) { work.focusMove = null; queueMicrotask(() => { if (card.isConnected) { const b = card.querySelector('.pd-inv-move button:not(:disabled)'); (b || card.querySelector('.pd-card-head')).focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' }); } }); }
    });
    // add a part without typing: the same fields, plain names, then how many
    const d = work.draft || (work.draft = { type: 'shcs', size: 'M3', length: 10, qty: 50 });
    cards.appendChild(el('div.pd-card.add', {}, [
      el('span'), picEl(d),
      el('div.pd-card-edit', {}, [
        ...partFields(d, (p) => { Object.assign(d, p); rerender(); }, ['Part type to add', 'Thread size to add', 'Length to add, mm']),
        el('label.pd-card-qtyf', {}, ['Qty', num(d.qty, (v) => { d.qty = Math.max(0, Math.round(v)); rerender(); }, false, 'Quantity to add')]),
        el('div.pd-card-edit-row', {}, [el('span.pd-inv-fill', { text: 'A part to add, with how many you have' }), el('span.grow'), el('button.key.sm.strong', { text: 'Add', 'aria-label': 'Add this part', title: 'Add this part to the list', onclick: () => { if (I.known(d)) { invAdd({ items: [{ ...d }], errors: [] }); invChanged(); } } })]),
      ]),
    ]));
    list.appendChild(cards);
    if (work.skipped.length) list.appendChild(el('details.pd-inv-skipped', { open: true }, [el('summary', { text: `${n(work.skipped.length, 'line')} not laid out` }), ...work.skipped.map((t) => el('div.src', { text: t }))]));
    lib.appendChild(list);
    // the layout's levers, folded away (closed by default; a change re-renders the panel, so the fold remembers whether it was open)
    const opts = el('details.pd-inv.pd-inv-opts', { open: work.optsOpen ? true : null });
    opts.addEventListener('toggle', () => { work.optsOpen = opts.open; });
    opts.appendChild(el('summary', {}, [el('h2.h2', { text: 'Layout options' }), el('span.pd-inv-fill', { text: `${FIT_CAPS.find(([v]) => v === work.cap)?.[1] || ''} room${work.spare ? ' · spare row' : ''}${work.round ? ' · next bag' : ''}${work.labels ? '' : ' · no label holders'}` })]));
    opts.appendChild(el('div.row', {}, ['Room to grow', el('div.track.mini.seg3', { role: 'group', 'aria-label': 'Room to grow' }, FIT_CAPS.map(([v, t]) => el('button.seg.sm' + (work.cap === v ? '.on' : ''), { text: t, onclick: () => { if (work.cap !== v) { work.cap = v; invChanged(); } } })))]));
    opts.appendChild(el('label.pd-check', {}, [el('input', { type: 'checkbox', checked: work.round ? true : null, onchange: (e) => { work.round = e.target.checked; invChanged(); } }), ' Size for the next bag (25, 50, 100, 200, 500)']));
    opts.appendChild(el('label.pd-check', {}, [el('input', { type: 'checkbox', checked: work.spare ? true : null, onchange: (e) => { work.spare = e.target.checked; invChanged(); } }), ' A spare row at the back when it fits']));
    opts.appendChild(el('label.pd-check', {}, [el('input', { type: 'checkbox', checked: work.labels ? true : null, onchange: (e) => { work.labels = e.target.checked; invChanged(); } }), ' Label holders']));
    opts.appendChild(el('div.row', {}, ['Floor colours', sel([['none', 'Leave as they are'], ['size', 'By thread size'], ['type', 'By part type']], work.colorBy, (v) => { work.colorBy = v; }, { 'aria-label': 'Floor colours' })]));
    opts.appendChild(el('p.hint', { text: 'Exact fills each compartment to the engine’s limit, Comfortable leaves room for a third more, Plenty for twice as many. The fill and the label say what you counted, bag or not.' }));
    lib.appendChild(opts);
    lib.appendChild(el('p.pd-inv-sum' + (warn ? '.warn' : ''), { text }));
    lib.appendChild(el('div.pd-btns', {}, [el('button.key.strong', { text: 'Lay out drawer', disabled: !!r.error, onclick: invApply }), el('button.key.sm', { text: 'Clear list', onclick: () => { work.items = []; work.skipped = []; work.open = null; invChanged(); } })]));
    lib.appendChild(el('p.hint', { text: 'Lay out drawer keeps this layout; Back, Esc or Done ask first while one is proposed.' }));
    if (work.focusLine) { work.focusLine = false; queueMicrotask(() => { if (line.isConnected) line.focus(); }); }
  }
  function renderInvInspector(insp) {
    const { text, warn } = invLast();
    insp.hidden = false;   // shown without a selection: the list's summary (the compartment panel hides itself without one)
    insp.replaceChildren(el('div.head', {}, [el('h2.h2', { text: 'The list’s layout' })]), el('p.src' + (warn ? '.warn' : ''), { text }), el('p.hint', { text: 'The plan shows it dashed; the drawer keeps its own layout until Lay out drawer.' }));
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
  /* what every parts drawer wears right now: the shell closed, the whole drawer while edited or open (Open drawer in the
     Build Inspector, ctx.open: an open drawer showing the plain shell looked empty, Joey 2026-11-07); called after every stage
     rebuild and every layout change (cheap when nothing changed: the geometries are cached and setDrawerBody compares) */
  /* a geometry the worker has just finished: the bodies again (now cached), the overlays, and the Dock's grams - not the
     panels, whose inputs may be in use (an async re-render is a typing hazard) */
  const onGeo = () => { if (!alive) return; sync(); if (st.dockEl && st.editing != null) renderDock(st.dockEl); stage.invalidateFrame(); };
  function applyBodies() {
    const units = partsUnits();
    if (units.length) ensureEngine();
    const ready = !!engineReady();
    for (const u of S().placed) {
      if (!isPartsDrawer(L(), u)) { if (u.fill === 'decor') stage.setDrawerBody(u.id, null); continue; }
      const size = sizeOfUnit(L(), u), height = heightOfUnit(u);
      let geo = null;
      if (ready) {
        const whole = st.editing === u.id || (ctx.open && ctx.open() === u.id);
        try { const d = whole ? drawerGeometry(fullOf(u), onGeo) : null; geo = whole ? (d ? d.geometry : null) : shellGeometry(size, height, onGeo); }
        catch (e) { console.warn('[parts drawer] geometry', e); st.engineErr = String(e && e.message || e); }
      }
      if (geo) stage.setDrawerBody(u.id, geo);   // still building, or no engine: the drawer keeps what it wears (the GLB, or its last body)
      if (st.editing !== u.id) clearExtras(u.id);
    }
  }
  /* called on every render: the bodies follow the record; while editing, the unit removed under the editor ends it (the
     Delete key, the context menu's Remove, an undo past its placement: Sol 01a1ad82), and the selection box is regrown
     onto the compartments as they are now, so an undo or redo that restores a merged or split compartment keeps it
     selected (the prototype regrew after every commit; the store's undo does not pass through commitLayout) */
  function sync() {
    if (st.inv) st.inv.last = null;   // the list's preview is recomputed from the unit as it is now (an undo, a rebuild)
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
    // the white label strips, in the build's label material, on every holder; a compartment with a part shows its words
    const [lw, lh, lt] = H.label;
    let labelMat = null; try { labelMat = stage.partMaterial('Label'); } catch { labelMat = null; }
    for (const c of full.comps) {
      if (!G.hasHolder(full, c)) continue;
      const words = c.item && I.known(c.item) ? I.labelLines(c.item) : null;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), words ? new THREE.MeshStandardMaterial({ map: labelTexture(words, lh), roughness: 0.85 }) : (labelMat || mat3('#f3f1ea')));
      if (words || !labelMat) m.userData.ownMat = true;
      m.rotation.x = -Math.PI / 2; m.position.set(X(c.x0 + 0.362 + lw / 2), top - 2.5 + lt + 0.03, Z(c.y1 - lh / 2));
      extras.add(m);
    }
    // the part outlines on coloured floors are inlays in the body colour (on a plain floor the worker cuts them into the geometry)
    let inlayMat = null;
    for (const o of outlinesOf(full)) {
      if (!G.floorColorOf(full, full.comps[o.comp])) continue;
      if (!inlayMat) { try { inlayMat = stage.partMaterial('Drawer'); } catch { inlayMat = mat3(stage.activeHex('Drawer')); } }
      const shape = new THREE.Shape(o.polys[0].map(([x, y]) => new THREE.Vector2(X(x), -Z(y))));
      for (const h of o.polys.slice(1)) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(X(x), -Z(y)))));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), inlayMat);
      m.rotation.x = -Math.PI / 2; m.position.y = G.C.FLOOR + 0.05; m.renderOrder = 1;
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
    // the wall under the 3D pointer, or the one being dragged at its position now: a box just around the wall's segments
    // (0.2 proud of each face, 0.4 above the top, so it reads from any angle), orange as the plan's wallhot
    const hot = st.wdrag ? { ...st.wdrag.ch, c: st.wdrag.c, drag: true } : st.hot;
    if (hot) {
      const wh = top - G.C.FLOOR + 0.4, lim = hot.orient === 'v' ? Sz.D : Sz.W;
      for (const [a, b] of hot.segs) {
        const a0 = Math.max(a, 0), b0 = Math.min(b, lim); if (b0 - a0 <= 0) continue;
        const m = new THREE.Mesh(new THREE.BoxGeometry(hot.orient === 'v' ? WALL + 0.4 : b0 - a0, wh, hot.orient === 'v' ? b0 - a0 : WALL + 0.4), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: hot.drag ? 0.85 : 0.55, depthWrite: false }));
        m.userData.ghost = true; m.userData.ownMat = true; m.renderOrder = 4;
        m.position.set(hot.orient === 'v' ? X(hot.c) : X((a0 + b0) / 2), G.C.FLOOR + wh / 2, hot.orient === 'v' ? Z((a0 + b0) / 2) : Z(hot.c));
        extras.add(m);
      }
    }
    // the clear size over each selected compartment, and over the compartments either side of a dragged wall as it goes,
    // with the drag's delta on the wall (Joey, 2026-11-06: "it would be nice to know the dimensions" in 3D)
    const dimOn = st.wdrag ? [...new Set([...st.wdrag.ch.L, ...st.wdrag.ch.R])].map((i) => st.wdrag.comps[i]) : selected();
    for (const c of dimOn) extras.add(dimSprite(`${fmt(c.x1 - c.x0)} × ${fmt(c.y1 - c.y0)}`, X((c.x0 + c.x1) / 2), top + 7, Z((c.y0 + c.y1) / 2)));
    if (st.wdrag && dragMoved(st.wdrag)) {
      const d = st.wdrag.c - st.wdrag.ch.c, mid = (st.wdrag.ch.J[0] + st.wdrag.ch.J[1]) / 2, v = st.wdrag.ch.orient === 'v';
      extras.add(dimSprite(`${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`, v ? X(st.wdrag.c) : X(mid), top + 20, v ? Z(mid) : Z(st.wdrag.c), true));
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
  /* a compartment's label as a texture: its part's two lines in the planner's display face (the prototype drew the same
     with its own font); cached per words and label height */
  const labelTex = new Map();
  function labelTexture(lines, lhmm) {
    const key = lines.join('|') + lhmm;
    if (labelTex.has(key)) return labelTex.get(key);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * lhmm / 29.876);
    const g2 = cv.getContext('2d'); g2.fillStyle = '#f3f1ea'; g2.fillRect(0, 0, cv.width, cv.height); g2.fillStyle = '#1d1e20'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    const fam = 'Archivo, "IBM Plex Sans", system-ui, sans-serif';
    if (lhmm > 10) {
      g2.font = `800 ${Math.round(cv.height * 0.5)}px ${fam}`; g2.fillText(lines[0], cv.width / 2, cv.height * 0.4, cv.width * 0.92);
      g2.font = `600 ${Math.round(cv.height * 0.26)}px ${fam}`; g2.fillText(lines[1] || '', cv.width / 2, cv.height * 0.79, cv.width * 0.9);
    } else { g2.font = `800 ${Math.round(cv.height * 0.56)}px ${fam}`; g2.fillText(lines.filter(Boolean).join(' '), cv.width / 2, cv.height * 0.53, cv.width * 0.92); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    labelTex.set(key, t); return t;
  }
  /* a dimension as a sprite that faces the camera: white mono figures on the measurement colour's dark pill, a canvas per
     text (cached; the sprite shares three's one sprite geometry, so keepGeo) */
  const dimTex = new Map();
  function dimTexture(text, accent) {
    const key = (accent ? '!' : '') + text;
    if (dimTex.has(key)) return dimTex.get(key);
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 96;
    const g2 = cv.getContext('2d');
    g2.font = `600 52px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
    const tw = Math.min(cv.width - 24, g2.measureText(text).width + 40), x0 = (cv.width - tw) / 2;
    g2.fillStyle = accent ? '#FF6A1A' : 'rgba(10,8,36,.92)'; g2.beginPath(); g2.roundRect(x0, 10, tw, 76, 20); g2.fill();
    g2.fillStyle = '#ffffff'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(text, cv.width / 2, 50, tw - 24);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    dimTex.set(key, t); return t;
  }
  function dimSprite(text, x, y, z, accent = false) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: dimTexture(text, accent), transparent: true, depthTest: false, depthWrite: false }));
    const w = 7 + 2.3 * text.length;   // mm across, roughly the figures' width at this font (small enough for a 23 mm compartment)
    m.scale.set(w, w * 96 / 320, 1); m.position.set(x, y, z); m.renderOrder = 6;
    m.userData.ghost = true; m.userData.ownMat = true; m.userData.keepGeo = true;
    return m;
  }
  const compAt = (pt, size) => { const Sz = G.SIZES[size]; if (pt.x < -0.2 || pt.x > Sz.W + 0.2 || pt.y < -0.2 || pt.y > Sz.D + 0.2) return null; let best = null, bd = Infinity; for (const c of comps()) { const dx = Math.max(c.x0 - pt.x, 0, pt.x - c.x1), dy = Math.max(c.y0 - pt.y, 0, pt.y - c.y1), dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = c; } } return best; };
  function compUnderRay(ray) {
    const u = editedUnit(); if (!u) return null;
    const group = stage.drawerGroupOf(u.id), body = group && group.getObjectByName('parts-body'); if (!body) return null;
    const hit = ray.intersectObject(body, false)[0]; if (!hit) return null;
    const p = body.worldToLocal(hit.point.clone()), { cx, cz } = frameOf(sizeOfUnit(L(), u));
    return compAt({ x: p.x + cx, y: cz - p.z }, sizeOfUnit(L(), u));
  }
  /* the plan point (mm) where a ray crosses the edited drawer's wall-top plane, or null: the walls are picked and dragged
     on that plane, so a wall reads the same from any camera angle (the body's local frame is the plan's: frame.js) */
  function wallPlanePoint(ray) {
    const u = editedUnit(); if (!u) return null;
    const group = stage.drawerGroupOf(u.id), body = group && group.getObjectByName('parts-body'); if (!body) return null;
    const full = fullOf(u), top = G.SIZES[full.size].heights[full.height].top, { cx, cz } = frameOf(full.size);
    const o = body.worldToLocal(ray.ray.origin.clone()), d = body.worldToLocal(ray.ray.origin.clone().add(ray.ray.direction)).sub(o);
    if (Math.abs(d.y) < 1e-9) return null;
    const t = (top - o.y) / d.y; if (t < 0) return null;
    const p = o.addScaledVector(d, t);
    return { x: p.x + cx, y: cz - p.z, full };
  }
  /* the wall chain under a ray, with the point it was hit at: a 3 mm reach for a mouse (the wall is 1.5), 8 for a finger */
  function wallUnderRay(ray, e) {
    const pt = wallPlanePoint(ray); if (!pt) return null;
    const ch = hitWall(comps(), pt.full, pt, { tol: e && e.pointerType === 'touch' ? 8 : 3, shift: !!(e && e.shiftKey) });
    return ch ? { ch, pt } : null;
  }
  const tapTargets = { onTap(ray, dist, e) {
    if (st.editing == null) return false;
    const c = compUnderRay(ray), add = e && (e.shiftKey || e.ctrlKey || e.metaKey);
    if (!c) { if (!add && st.sel) setSel(null); return true; }
    setSel(add && st.sel ? G.boxOf([st.sel, G.compBox(c)]) : G.compBox(c));
    return true;
  }, onDown(ray, e) {
    /* a press on a wall top claims the gesture from the orbit (stage.setTapTargets' onDown): the wall follows the pointer
       on the wall-top plane with the plan's chain and snapping (walls.js; Shift the whole line, Alt no snap; a 2 mm pull
       for a magnet), shown as the orange box; the release commits one edit (the worker then rebuilds the body) */
    if (st.editing == null) return null;
    const w = wallUnderRay(ray, e); if (!w) return null;
    const wd = startWallDrag(comps(), w.ch, w.pt, w.pt.full);
    st.wdrag = wd; st.hot = null; st.hotKey = ''; st.hover = null; canvas.style.cursor = 'grabbing'; update3d();
    return {
      move: (ray2, e2) => { const p = wallPlanePoint(ray2); if (p && moveWallDrag(wd, p, !!(e2 && e2.altKey), 2)) update3d(); },
      // a cancel (the capture lost) commits nothing; a release commits, but not onto a layout that changed under the button (an undo mid-drag: Sol 01a1b227)
      up: (e) => { if (st.wdrag !== wd) return; st.wdrag = null; canvas.style.cursor = ''; if (!(e && e.type === 'pointercancel') && dragMoved(wd) && JSON.stringify(comps()) === JSON.stringify(wd.start)) commitLayout((x) => { x.comps = wd.comps; }); else update3d(); },
    };
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
      const w = wallUnderRay(ray, hoverEvt), ch = w ? w.ch : null, k = chainKey(ch);
      const c = ch ? null : compUnderRay(ray);
      if (c !== st.hover || k !== st.hotKey) { st.hover = c; st.hot = ch; st.hotKey = k; canvas.style.cursor = ch ? 'grab' : c ? 'pointer' : ''; update3d(); }
    });
  }
  function onCanvasLeave() { hoverEvt = null; if (st.hover || st.hot) { st.hover = null; st.hot = null; st.hotKey = ''; canvas.style.cursor = ''; update3d(); } }

  /* ---------------- edit mode ---------------- */
  function start(id) {
    const u = unitById(id); if (!u || !isPartsDrawer(L(), u)) return false;
    if (st.editing != null && st.editing !== id) stop({ quiet: true });
    st.editing = id; st.sel = null; st.hover = null; st.view = shortScreen() ? '3d' : '2d';   // a phone on its side has no room for the plan (Terra 01a1b6be)
    ensureEngine();
    stage.setSelected(null);
    stage.setTapTargets(tapTargets);
    canvas.addEventListener('pointermove', onCanvasMove); canvas.addEventListener('pointerleave', onCanvasLeave);
    stage.peekUnit(id, { pills: false });
    sync();
    frameDrawer();
    editBar.sync();
    pl.firstTip();   // the gestures, once per device (guide.js)
    return true;
  }
  function stop({ quiet = false } = {}) {
    const id = st.editing; if (id == null) return;
    st.editing = null; st.sel = null; st.hover = null; st.hot = null; st.hotKey = ''; st.wdrag = null; st.picker = null; closeInventory(); pl.hideTip();
    if (ctx.onStop) ctx.onStop(id);   // the Build workspace: the drawer this closes is no longer its open one
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
    preview: invPreview,   // the parts list's layout, dashed, while the list is open (2026-11-07)
    onPreviewHover: (c) => invHl(c ? invRankOf(c) : null, 'plan'),   // a proposed compartment under the pointer lights its row, a press focuses it (2026-11-08)
    onPreviewPick: invPick,
  });
  pl.el.hidden = true;
  root.appendChild(pl.el);

  /* ---------------- the toolbar in edit mode: 2D / 3D, Reset frames the drawer, Undo / Redo ---------------- */
  const editBar = toolbar(stage, {
    view: { get: () => st.view, set: (v) => { if (v === '2d' && shortScreen()) return; st.view = v; ctx.renderAll(); if (v === '3d') frameDrawer(); }, can2d: () => !shortScreen(), why2d: 'No room for the plan on a phone held sideways: turn it upright' },   // the 3D view opens on the drawer, centred (Joey, 2026-11-06)
    history: { undo: () => store.undo(), redo: () => store.redo(), get canUndo() { return store.canUndo; }, get canRedo() { return store.canRedo; } },
    reset: () => frameDrawer(),
  });
  editBar.el.hidden = true;
  root.appendChild(editBar.el);

  /* a phone on its side (the phone chrome below 1024 wide, under 520 high): the toolbar above and the sheets below leave no
     room for the plan, so the editor shows 3D and the toolbar's 2D is off; turning the phone upright brings the plan back */
  function shortScreen() { return isPhone() && window.innerHeight < 520; }   // hoisted: the toolbar syncs once while it is built, before this line runs
  const onResize = () => { if (st.editing == null) return; if (st.view === '2d' && shortScreen()) { st.view = '3d'; ctx.renderAll(); frameDrawer(); } else editBar.sync(); };
  window.addEventListener('resize', onResize);
  /* the camera on the edited drawer, centred in the free region between the Library and the Inspector (the stage centres
     on the canvas, and the panels cover its sides, so the drawer sat off to one side: Joey, 2026-11-06) */
  function frameDrawer() {
    if (st.editing == null) return;
    const cv = canvas.getBoundingClientRect();
    const shown = (sel) => [...document.querySelectorAll(sel)].find((e) => !e.hidden && e.offsetWidth > 0);
    const lib = shown('#ws-lib'), insp = shown('#ws-insp');
    const left = lib ? Math.max(cv.left, lib.getBoundingClientRect().right) : cv.left, right = insp ? Math.min(cv.right, insp.getBoundingClientRect().left) : cv.right;
    stage.frameUnit(st.editing, { centreX: cv.width > 0 && right > left ? ((left + right) / 2 - cv.left) / cv.width : 0.5 });
  }

  /* ---------------- the Library: the drawer tools ---------------- */
  function renderLib(lib) {
    const u = editedUnit(); if (!u) return;
    if (st.inv) { renderInvPanel(lib, u); return; }   // the parts list (2026-11-07): the Library's own mode
    const full = fullOf(u), lay = layoutOfUnit(u), size = full.size, Sz = G.SIZES[size], g = G.maxGrid(size);
    lib.appendChild(el('div.pd-head', {}, [
      el('div.col', {}, [el('h2.h2', { text: 'Editing compartments' }), el('h3', { text: unitName(u) || `${u.w}W·${u.hh / 2}H parts drawer` }), el('div.readout', { text: `${Sz.label} · cavity ${fmt(Sz.W)} × ${fmt(Sz.D)} mm · ${full.height}` })]),
      el('button.key.sm', { text: 'Done', title: 'Back to the build · Esc', onclick: () => leaveEdit() }),
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
    // the parts list first (Sol 01a1bc8e, 2026-11-08: at the bottom, under grid, labels and floor, Joey never found it and typed a part into one compartment's field instead)
    const parts = el('section');
    parts.appendChild(el('h2.h2', { text: 'Parts' }));
    const withParts = lay.comps.filter((c) => c.item).length;
    parts.appendChild(el('div.pd-btns', {}, [attachHint(el('button.key.sm', { text: 'From a parts list…', title: 'A kit, typed lines or a file: every part gets a compartment sized for its quantity', onclick: openInventory }), GUIDE.list, lib)]));
    parts.appendChild(el('p.hint', { text: `Lay the whole drawer out from a list of parts, typed, picked, from a file or a kit: every part gets a compartment sized for its quantity, with its label.${withParts ? ` ${n(withParts, 'compartment')} with a part: the words go on the label holders, into labels.csv in the download, and into the Labels workspace.` : ' One compartment at a time: give it a part in This compartment.'}` }));
    lib.appendChild(parts);
    const stepper = (label, value, dec, inc, canDec, canInc) => el('div.row', {}, [label, el('div.stepper', {}, [el('button.key', { text: '−', 'aria-label': `Fewer ${label.toLowerCase()}`, disabled: !canDec, onclick: dec }), el('b.mono', { text: String(value) }), el('button.key', { text: '+', 'aria-label': `More ${label.toLowerCase()}`, disabled: !canInc, onclick: inc })])]);
    const grid = el('section');
    grid.appendChild(el('h2.h2', { text: 'Grid' }));
    grid.appendChild(attachHint(stepper('Columns', lay.nc, () => setGrid(lay.nc - 1, lay.nr), () => setGrid(lay.nc + 1, lay.nr), lay.nc > 1, lay.nc < g.nc), GUIDE.grid, lib));
    grid.appendChild(attachHint(stepper('Rows', lay.nr, () => setGrid(lay.nc, lay.nr - 1), () => setGrid(lay.nc, lay.nr + 1), lay.nr > 1, lay.nr < g.nr), GUIDE.grid, lib));
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
    fl.appendChild(attachHint(el('div.row', {}, ['Part outlines', el('div.track.mini.seg2', { role: 'group', 'aria-label': 'Part outlines on the floors' }, [
      el('button.seg.sm' + (!lay.outlines ? '.on' : ''), { text: 'Off', onclick: () => { if (lay.outlines) commitLayout((x) => { x.outlines = false; }); } }),
      el('button.seg.sm' + (lay.outlines ? '.on' : ''), { text: 'On', title: 'Each compartment\'s part on its floor at 1:1, so you can lay a screw on it to check the length', onclick: () => { if (!lay.outlines) commitLayout((x) => { x.outlines = true; }); } }),
    ])]), GUIDE.outlines, lib));
    fl.appendChild(el('p.hint', { text: `Standard is the shipped 6 mm front scoop, Deep up to 12 mm. ${RAMP_NAME} adds 45° ramps on the sides and back, in mm, so small parts slide to the middle. Part outlines put each compartment's part on its floor at 1:1. ${scoops.size > 1 || trays.size > 1 ? 'Mixed right now; these set every compartment.' : ''}` }));
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
      const { bytes, filename } = await zipFor(fullOf(u), { bodyHex: stage.activeHex('Drawer'), name: unitName(u) });
      saveBytes(bytes, filename);
      st.status = `Saved ${filename}`;
    } catch (e) { console.error(e); st.status = `The files could not be built (${e && e.message || e}).`; }
    st.downloading = false; ctx.renderAll();
  }

  /* ---------------- the Inspector: this compartment ---------------- */
  function renderInspector(insp = inspEl) {
    if (!insp || st.editing == null) return;
    if (st.inv) { renderInvInspector(insp); return; }
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
      // the part in it (M3): typed as "M3x10 SHCS 100", or set field by field with the parts list's own fields and picture (one
      // editing surface, Sol 01a1bd5c, 2026-11-08; a change is one history entry); its fill is an estimate from ISO sizes (inventory.js)
      const partIn = el('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'M3x10 SHCS 100', value: c.item && I.known(c.item) ? `${I.labelText(c.item).replace(' × ', 'x')} ${c.item.qty || ''}`.trim() : '', 'aria-label': 'The part in this compartment' });
      partIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') partIn.blur(); else if (e.key === 'Escape') { partIn.dataset.skip = '1'; partIn.blur(); } e.stopPropagation(); });
      partIn.addEventListener('blur', () => { if (partIn.dataset.skip) { delete partIn.dataset.skip; renderInspector(); return; } setPart(partIn.value); });
      const have = !!(c.item && I.known(c.item)), cur = have ? c.item : { type: 'shcs', size: 'M3', length: 10, qty: 0 };
      const setItem = (patch) => { const item = cleanItem({ ...cur, ...patch }); if (!item) { say('That part is not one the generator knows.'); renderInspector(); return; } commitLayout((x) => { for (const k of x.comps) if (G.inBox(k, box)) k.item = item; }); };
      const fields = el('div.pd-fields', {}, [picEl(cur), ...partFields(cur, setItem, ['The part type', 'Its thread size', 'Its length, mm']),
        el('span.pd-qty', {}, ['×', fieldNum(cur.qty || 0, (v) => setItem({ qty: Math.max(0, Math.round(v)) }), false, 'How many')])]);
      insp.appendChild(el('div.row', {}, ['Part', el('div.pd-part', {}, [partIn, fields])]));
      if (have) {
        const f = I.fillOf(c, full.height, full.size, lay.label);
        insp.appendChild(el('div.src', { text: `${I.labelText(c.item)}${c.item.qty ? ' × ' + c.item.qty : ''}${f != null ? `, about ${Math.round(f * 100)}% full${f > 1 ? ' (too full)' : ''}` : ''}.` }));
      }
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
      attachHint(el('button.key', { text: 'Merge', title: 'One compartment of the selection · M', disabled: s.length < 2, onclick: doMerge }), GUIDE.select, insp),
      attachHint(el('button.key', { text: 'Split', title: 'Back into grid cells · S', disabled: !canSplit(), onclick: doSplit }), GUIDE.split, insp),
    ]));
    if (s.length < 2) insp.appendChild(el('p.hint', { text: 'Drag across two or more compartments to merge them.' }));   // why Merge is grey (Joey, 2026-11-06)
  }
  let inspEl = null;

  /* ---------------- the Dock in edit mode ---------------- */
  function renderDock(dock) {
    const u = editedUnit(); if (!u) return;
    st.dockEl = dock;
    const full = fullOf(u), [fa, fb] = G.footprint(full.size);
    const bed = BEDS.find(([x, y]) => (fa <= x && fb <= y) || (fa <= y && fb <= x));
    let grams = null; if (engineReady()) { try { const d = drawerGeometry(full, onGeo); grams = d ? d.grams : null; } catch { grams = null; } }
    const fg = G.floorRects(full).reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0) * G.SKIN, 0) / 1000 * G.C.PLA;
    dock.replaceChildren(
      el('div.status.stack', { disabled: true, title: 'Every compartment tiles the drawer' }, [el('span.dot'), `${n(full.comps.length, 'compartment')} · ${n(full.comps.filter((c) => G.hasHolder(full, c)).length, 'label')}`]),
      el('div.group', { title: 'Solid PLA; sliced with infill it comes out lighter' }, [el('span.big', { text: grams == null ? '…' : `≈ ${Math.round(grams)}${fg ? ` + ${Math.round(fg)}` : ''}` }), el('span.unit-lbl', { text: 'g PLA' })]),
      el('div.group', { title: bed ? `Prints ${fmt(fa)} × ${fmt(fb)} mm: fits ${bed[2]} or bigger` : `Prints ${fmt(fa)} × ${fmt(fb)} mm: bigger than a 360 mm bed` }, [el('span.big', { text: `${Math.round(fa)} × ${Math.round(fb)}` }), el('span.unit-lbl', { text: 'mm print' })]),
      el('button.cta', { title: 'Back to the build · Esc', onclick: () => leaveEdit() }, ['Done', icon('check', { size: 20 })]),
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
      el('div.pd-plan', {}, [el('div.wellbox.well', {}, [planThumb(full)]), el('div.col', {}, [el('div', { text: `${n(full.comps.length, 'compartment')} · ${G.holderOf(full).name} labels${full.comps.some((c) => c.item) ? ` · ${n(full.comps.filter((c) => c.item).length, 'part')}` : ''}` }), el('div.src', {}, ['Layout code ', codeEl]), el('div.src', { text: full.floor.mode === 'off' ? 'One colour' : full.floor.mode === 'one' ? 'Coloured floors' : 'Painted floors' })])]),
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
    if (k === 'escape') { if (pp && pp.isOpen()) { pp.close(); return true; } if (st.inv && st.inv.drag) { st.inv.drag.cancel(); return true; } if (st.inv) { invEsc(); return true; } if (pl.tipOpen()) { pl.closeTip(); return true; } if (st.picker) { st.picker = null; ctx.renderAll(); return true; } if (st.sel) { setSel(null); return true; } stop(); return true; }
    if (st.inv) return !(k === 'tab' || k === 'enter' || k === ' ');   // the parts list has the keys (no merge or split under it), but Tab walks its controls and Enter and Space press its buttons (2026-11-08: all three were swallowed)
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
    partsSummary: (u) => { const items = layoutOf(L(), u).comps.filter((c) => c.item && I.known(c.item)).map((c) => I.labelText(c.item)); const seen = [...new Set(items)]; return seen.length ? seen.slice(0, 2).join(', ') + (seen.length > 2 ? `, +${seen.length - 2}` : '') : ''; },   // a name to suggest for the unit, from its parts (the Build Inspector's Name field)
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
    destroy() { alive = false; if (pp) pp.close(); ppAC.abort(); window.removeEventListener('resize', onResize); if (st.editing != null) stop({ quiet: true }); for (const u of S().placed) if (u.fill === 'decor') stage.setDrawerBody(u.id, null); pl.destroy(); editBar.el.remove(); for (const t of labelTex.values()) t.dispose(); for (const t of dimTex.values()) t.dispose(); },
  };
}
