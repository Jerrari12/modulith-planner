/* The Build workspace (phase 3: the Build rules), composed over the unchanged renderer.
 *
 * Layout per the brief §2 and the v4 artboard: top bar, the left Library (Add units / Build style), the right
 * Inspector ("This unit only", hugs its content), the centre toolbar (3D/2D, Measure, Explode, Reset, Undo/Redo,
 * the eraser, quality) and the Build Dock (status → the issue card, units, mm, "Get parts list").
 *
 * The record lives in the store (js/state/store.js); every rule is the planner's own, ported by copy
 * (js/rules/layout.js). Editing (Joey's decision 2026-10-12: everything the prototype tried):
 *   - ADD: pick a unit and a size, then click an amber spot on the stage or a cell on the 2D board. A spot is a
 *     cell where the planner's canPlace holds AND the layout stays showable with no new structural problem
 *     (a trial per cell through the generator and the validity rules; the generator runs in 0.3 ms).
 *   - MOVE: drag a selected unit on the stage (it snaps to a valid spot), drag on the board (any free cell),
 *     or nudge with the arrow keys; gravity settles anything left unsupported toward the mount surface
 *     (drop only, never adds parts - Undo puts it back).
 *   - REMOVE: the inspector's Remove, Delete, the eraser mode, or the context menu; gravity follows.
 *   - NEEDED CELLS: red spots where the planner's Fix structure would add a case; one click adds exactly that.
 *   - the issue card: every planner warning (unsupported, sag, bow, wall 0.5H top row, not in collection, won't
 *     print, cabinet interior, tabletop completion), the generator's own refusals, and the 80-unit cap; Show me,
 *     Fix structure, Grow top row to 1H. The problem units wear a dashed amber outline on both views.
 *   - per unit: type (Classic/Decor through convertProblem), width/height steppers, closure, stoppers, lip,
 *     Gridfinity, Peek inside, Duplicate, Remove. Build style is build-wide, as before.
 * Product icons are the generated glyphs still (product-faithful previews are the next step of this phase).
 */
import { glyphEl, sizeGlyph, FACEK, DEFAULT_COLORS } from '../ui/glyph.js';
import { icon } from '../ui/icons.js';
import { el, makeToast } from '../ui/dom.js';
import { topbar } from '../ui/topbar.js';
import { toolbar } from '../ui/toolbar.js';
import { board } from '../ui/board.js';
import { isPhone, phoneChrome } from '../ui/phone.js';
import { layoutRules } from '../rules/layout.js';
import { serializeBuild } from '../rules/schema.js';
import { generateManifest } from '../generate.js';

/* `const GEN2` at a classic script's top level is a global LEXICAL binding: visible to modules by name, absent from globalThis */
// eslint-disable-next-line no-undef
const G = typeof GEN2 !== 'undefined' ? GEN2 : null;
const TT = globalThis.GEN2_TABLETOP;
const INSIDE = { 59: 45, 115: 101, 165: 151, 185: 171, 240: 226, 270: 256 };   // interior length per collection, mm
const FACE_LABEL = Object.fromEntries((G?.faceplateStyles || []).map((f) => [f.id, f.label]));
const CLUB = { edgelabel: 1, classicpro: 1, chevron: 1 };
const UNIT_CAP = 80;   // the viewer's instruction cap (the plan's risk register: a Build warning, not a refusal)
const VIEWER_UT_LENGTHS = [59, 115, 165, 185, 240, 270];
const clone = (v) => JSON.parse(JSON.stringify(v));
const n = (k, one, many = one + 's') => `${k} ${k === 1 ? one : many}`;
const sigOf = (m) => { const s = JSON.stringify(m); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + s.length; };

export function mountBuild(stage, ctx) {
  const ac = new AbortController();   // every window/document listener the workspace adds, dropped on unmount
  const signal = ac.signal;
  const store = ctx.store;
  const S = () => store.state;
  const R = () => store.rules();
  const length = Number(S().length || stage.manifest?.collection || 185);
  const st = {
    tab: 'add', collapsed: false,
    unit: S().fill || 'decor', gf: 'standard', addSize: `${S().selected?.w || 1}x${S().selected?.h || 1}`, armed: false,
    view: '3d', eraser: false, sel: null, selId: ctx.memo.buildSel ?? null, issuesOpen: false, stageErrors: null, peeking: null, menu: null, chosen: null, pulse: null,
  };
  /* product icons read the LIVE palette, so the tiles, the inspector thumbnail and the model agree */
  const hex = (key, fallback) => { try { return stage.activeHex(key) || fallback; } catch { return fallback; } };
  const frontFor = (fill) => fill === 'classic' ? hex('Drawer', DEFAULT_COLORS.front) : hex('Faceplate:FACE', hex('Faceplate', DEFAULT_COLORS.front));
  const colors = {   // getters, so `{ ...colors }` spreads live values
    get body() { return hex('Case', DEFAULT_COLORS.body); },
    get front() { return frontFor(st.unit); },
    get handle() { return hex('Handle', DEFAULT_COLORS.handle); },
    get lb() { return hex('Label', DEFAULT_COLORS.lb); },
    get lt() { return DEFAULT_COLORS.lt; },
  };

  const root = el('div', { id: 'ws' });
  document.body.appendChild(root);
  const { say, soon } = makeToast(root);
  /* a product-faithful preview (the stage renders one unit from the real GLBs): the generated glyph stands in until the
     image is ready, and stays when there is no model for it (Cabinet; a part missing from the library) */
  function preview(glyphNode, spec, cls = '') {
    const holder = el('div.pv' + (cls ? '.' + cls : ''), {}, [glyphNode]);
    if (!stage.thumb) return holder;
    stage.thumb(spec).then((url) => { if (url && holder.isConnected !== false) holder.replaceChildren(el('img', { src: url, alt: '' })); }).catch(() => {});
    return holder;
  }
  const top = topbar(stage, { ...ctx, active: 'build', say, soon, signal });
  root.prepend(top);
  const baseName = ctx.kitTitle || stage.manifest?.title || 'Workbench build';
  const nameEl = top.querySelector('#ws-switch > .chip-btn > span');

  /* ---------------- the record ↔ the stage ---------------- */
  let lastSig = null, syncing = false, unmounting = false, queue = Promise.resolve();
  const tryGen = (rec) => { try { return generateManifest(rec); } catch (e) { return { manifest: null, errors: [String((e && e.message) || e)] }; } };
  { const g = tryGen(store.serialize()); lastSig = g.manifest ? sigOf(g.manifest) : null; }
  /* every settled change: regenerate the scene when the manifest changed; an unshowable layout keeps the last good
     scene and lands its reasons in the issue card (the board always shows the true state) */
  function syncStage() {
    queue = queue.then(async () => {
      const rec = store.serialize();
      const gen = tryGen(rec);
      if (!gen.manifest) { st.stageErrors = gen.errors || ['This layout can’t be shown.']; renderAll(); return; }
      st.stageErrors = null;
      const sig = sigOf(gen.manifest);
      if (sig !== lastSig) {
        lastSig = sig; syncing = true;
        try { const r = await stage.update(rec, gen); if (!r.ok) st.stageErrors = r.errors; else stage.skipToEnd(); }
        finally { syncing = false; }
        if (st.selId != null && !stage.selectUnit(st.selId)) { st.selId = null; st.sel = null; }
      }
      renderAll();
      if (st.pulse && st.pulse.length) { if (st.view !== '2d') stage.pulseUnits(st.pulse); brd.flash(st.pulse); st.pulse = null; }
    }).catch((e) => { console.error(e); st.stageErrors = [String(e?.message || e)]; renderAll(); });
    return queue;
  }
  const unsub = store.subscribe((state, why) => { if (why === 'adopt') return; renderAll(); syncStage(); });
  /* an option the stage applied itself (Build style's toggles regenerate on their own): take its record back
     into the store as one undo step, without a second regenerate */
  async function adopt() {
    const g = tryGen(stage.build); if (g.manifest) lastSig = sigOf(g.manifest);
    const keep = st.selId;
    store.load(stage.build, 'adopt'); st.selId = keep; S().selectedUnit = keep;
    renderAll();
  }
  /* gravity (Joey: drop only): every unsupported unit falls toward the mount surface until something holds it */
  function settle(s, Rs) {
    const moved = new Map();   // id -> half-rows travelled
    const dir = s.mount === 'tabletop' ? 1 : -1;
    for (let pass = 0; pass < 24; pass++) {
      const uns = new Set(Rs.unsupportedUnits().map((u) => u.id)); if (!uns.size) break;
      let any = false;
      for (const u of s.placed.filter((u) => uns.has(u.id)).sort((a, b) => dir === 1 ? b.y - a.y : a.y - b.y)) {
        let ny = u.y; while (Rs.canPlace(u.x, ny + dir, u.w, u.hh, u.id)) ny += dir;
        if (ny !== u.y) { moved.set(u.id, (moved.get(u.id) || 0) + Math.abs(ny - u.y)); u.y = ny; any = true; }
      }
      if (!any) break;
    }
    return moved;
  }
  /* every edit is ONE undo step, gravity included (Astra: make the whole action one Undo step and show which units
     moved): the moved units are named in the toast, pulsed on the model and flashed on the board */
  function edit(fn, why = 'edit', { gravity = true } = {}) {
    let dropped = new Map();
    const r = store.commit((s, Rs) => { const out = fn(s, Rs); if (gravity) dropped = settle(s, Rs); return out; }, why);
    if (dropped.size) {
      const s = S();
      const names = [...dropped.keys()].map((id) => { const u = s.placed.find((p) => p.id === id); return `${u ? `${u.w}W·${u.hh / 2}H` : 'unit'} (unit ${s.placed.indexOf(u) + 1})`; });
      say(`Gravity · ${names.join(', ')} dropped onto what is below · one Undo puts it all back.`);
      st.pulse = [...dropped.keys()];
    }
    return r;
  }
  /* a trial on a clone: the layout stays showable, no structural problem appears that is not there already, and
     the unit in question has none (the prototype's rule; bow is advisory and never blocks) */
  const problems = (s, Rs) => { const set = new Set(); for (const u of Rs.unsupportedUnits()) set.add('u:' + u.id); for (const id of Rs.sagRisks()) set.add('s:' + id); for (const id of Rs.wallTopHalfHeight()) set.add('w:' + id); return set; };
  function judge(trialFn, id, selected) {
    const s = S(); const before = problems(s, R());
    const t = clone(s); if (selected) t.selected = selected;
    const Rt = layoutRules(t, G, { tabletop: TT });
    if (trialFn(t, Rt) === false) return false;
    Rt.syncTabletopGrid();
    for (const k of problems(t, Rt)) if (!before.has(k) || k.endsWith(':' + id)) return false;
    return !!tryGen(serializeBuild(t)).manifest;
  }
  const spotCache = new Map();
  const cacheKey = (tag) => tag + '|' + JSON.stringify(store.serialize());
  function addSpots(w, hh, fill) {
    const key = cacheKey(`add ${w}x${hh} ${fill}`); if (spotCache.has(key)) return spotCache.get(key);
    const s = S(), Rs = R(); const out = []; const rows = s.gridH * 2;
    for (let y = 0; y <= rows - hh; y++) for (let x = 0; x <= s.gridW - w; x++) {
      if (!Rs.canPlace(x, y, w, hh)) continue;
      if (judge((t) => { t.placed.push({ id: t.nextId++, x, y, w, hh, fill, shelves: 0 }); }, s.nextId)) out.push({ x, y });
    }
    if (spotCache.size > 40) spotCache.clear(); spotCache.set(key, out); return out;
  }
  function moveSpots(u) {
    const key = cacheKey(`move ${u.id}`); if (spotCache.has(key)) return spotCache.get(key);
    const s = S(); const out = [];
    const sel = { w: u.w, h: u.hh / 2 };
    const t0 = clone(s); t0.selected = sel; layoutRules(t0, G, { tabletop: TT }).syncTabletopGrid();   // headroom for the unit's own height
    const R0 = layoutRules(t0, G, { tabletop: TT }); const rows = t0.gridH * 2; const u0 = t0.placed.find((p) => p.id === u.id);
    const delta = rows - s.gridH * 2;   // the trial grid's extra headroom shifts every y (tabletop); spots are reported in the LIVE grid's y
    for (let y = 0; y <= rows - u.hh; y++) for (let x = 0; x <= t0.gridW - u.w; x++) {
      if (x === u0.x && y === u0.y) continue;
      if (!R0.canPlace(x, y, u.w, u.hh, u.id)) continue;
      if (judge((t, Rt) => { Rt.syncTabletopGrid(); const p = t.placed.find((q) => q.id === u.id); p.x = x; p.y = y; }, u.id, sel)) out.push({ x, y: y - delta });
    }
    if (spotCache.size > 40) spotCache.clear(); spotCache.set(key, out); return out;
  }
  /* the cases Fix structure would add, as red spots (the prototype's "needed cells"): one click adds exactly that */
  function neededSpots() {
    const s = S(); if (!R().unsupportedUnits().length) return [];
    const t = clone(s); const Rt = layoutRules(t, G, { tabletop: TT }); Rt.fixStructure();
    return t.placed.filter((p) => p.id >= s.nextId).map((p) => ({ x: p.x, y: p.y, w: p.w, hh: p.hh, kind: 'need' }));
  }
  const majorityFill = () => { const c = {}; for (const u of S().placed) if (u.fill === 'classic' || u.fill === 'decor') c[u.fill] = (c[u.fill] || 0) + 1; return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || (st.unit === 'classic' ? 'classic' : 'decor'); };

  /* ---------------- actions ---------------- */
  const armedSize = () => { const [w, h] = st.addSize.split('x').map(Number); return { w, h, hh: h * 2 }; };
  function setPalette(unit, size) {
    st.unit = unit; if (size) st.addSize = size;
    const { w, h } = armedSize();
    store.commit((s, Rs) => { s.fill = unit; s.selected = { w, h }; Rs.growGridForHeight(h); }, 'palette');
  }
  function placeAt(x, y, size = armedSize(), fill = st.unit === 'decor' && st.gf === 'gridfinity' ? 'decor' : st.unit) {
    const Rs = R();
    if (!Rs.selectable(size.w, size.h) && !(size.hh && Rs.sizeExists(size.w, size.hh / 2, fill))) { say('That size is not available here.'); return; }
    if (!Rs.canPlace(x, y, size.w, size.hh)) { say('That spot is taken.'); return; }
    let id;
    edit((s) => {
      id = s.nextId++;
      const u = { id, x, y, w: size.w, hh: size.hh, fill, shelves: 0 };
      if (fill === 'decor' && st.gf === 'gridfinity' && s.fill === 'decor') u.variant = 'gridfinity';
      s.placed.push(u); s.selectedUnit = id;
    }, 'add');
    st.selId = id; ctx.memo.buildSel = id;
  }
  function moveTo(id, x, y, { exact = false } = {}) {
    const u = S().placed.find((p) => p.id === id); if (!u) return;
    edit((s, Rs) => {
      const before = s.gridH * 2;
      if (exact) { s.selected = { w: u.w, h: u.hh / 2 }; Rs.syncTabletopGrid(); }   // headroom for the unit's own height (a stage spot may sit above the live grid)
      const ty = y + (s.gridH * 2 - before);
      const p = s.placed.find((q) => q.id === id);
      if (!Rs.canPlace(x, ty, p.w, p.hh, p.id)) { say('Can’t move there · another unit is in the way.'); return; }
      p.x = x; p.y = ty;
      if (exact) { const a = armedSize(); s.selected = { w: a.w, h: a.h }; }
    }, 'move');
  }
  function removeUnit(id) {
    const u = S().placed.find((p) => p.id === id); if (!u) return;
    if (st.peeking === id) { stage.unpeek(); st.peeking = null; }
    edit((s) => { s.placed = s.placed.filter((p) => p.id !== id); if (s.selectedUnit === id) s.selectedUnit = null; s.removedStoppers = s.removedStoppers.filter((k) => !k.startsWith(id + ':')); }, 'remove');
    if (st.selId === id) { st.selId = null; st.sel = null; ctx.memo.buildSel = null; stage.setSelected(null); }
    say(`Removed ${u.w}W·${u.hh / 2}H · Ctrl+Z puts it back.`);
  }
  function duplicateUnit(id) {
    const u = S().placed.find((p) => p.id === id); if (!u) return;
    const spots = addSpots(u.w, u.hh, u.fill);
    if (!spots.length) { say('No free supported spot for a copy.'); return; }
    const near = spots.slice().sort((a, b) => (Math.abs(a.x - u.x) + Math.abs(a.y - u.y)) - (Math.abs(b.x - u.x) + Math.abs(b.y - u.y)))[0];
    let nid;
    edit((s) => { nid = s.nextId++; const c = { ...clone(u), id: nid, x: near.x, y: near.y }; delete c.label; delete c.labelBadge; s.placed.push(c); s.selectedUnit = nid; }, 'duplicate');
    st.selId = nid; ctx.memo.buildSel = nid;
  }
  function nudge(dir) {
    if (st.selId == null) return;
    edit((s, Rs) => { s.selectedUnit = st.selId; return Rs.nudgeSelected(dir); }, 'nudge');
  }
  function fixStructure() {
    const r = edit((s, Rs) => Rs.fixStructure(), 'fix', { gravity: false });
    say(`✓ Structure fixed · ${n(r.moved, 'unit')} moved${r.added ? `, ${n(r.added, 'support case')} added` : ''}.`);
  }
  function fixWallTops() {
    const r = edit((s, Rs) => Rs.fixWallTops(), 'fix', { gravity: false });
    say(r ? `✓ Top row fixed · ${n(r.grown, 'case')} grown to 1H${r.moved ? `, ${n(r.moved, 'unit')} shifted down` : ''} · names and drawer contents kept.` : '⚠ Can’t grow the top row · the grid is already at its max height. Remove a row below, then try again.');
  }
  function convertAll(to) {
    const plan = R().planConversion(to);
    if (!plan.eligible.length) { say(plan.skipped.length ? `No drawer can change: ${plan.reasons.map((r) => r.text).join('; ')}` : 'Every drawer is already that type.'); return; }
    const ids = new Set(plan.eligible.map((p) => p.id));
    edit((s) => { s.placed.forEach((p) => { if (ids.has(p.id)) p.fill = to; }); }, 'convert', { gravity: false });
    const label = G.fills.find((f) => f.id === to)?.label || to;
    say(`✓ ${n(plan.eligible.length, 'drawer')} converted to ${label}${plan.skipped.length ? ` · ${plan.skipped.length} stay: ${plan.reasons.map((r) => r.text).join('; ')}` : ''}.`);
  }
  function setUnitFill(id, to) {
    const u = S().placed.find((p) => p.id === id); if (!u || u.fill === to) return;
    const why = R().convertProblem(u, to); if (why) { say(why); return; }
    edit((s) => { const p = s.placed.find((q) => q.id === id); p.fill = to; if (to !== 'decor') delete p.variant; }, 'convert', { gravity: false });
  }
  function resize(id, dw, dh) {
    const u = S().placed.find((p) => p.id === id); if (!u) return;
    const Rs = R(); const heights = Rs.heightsForFill(u.fill);
    const w = u.w + dw; let h = u.hh / 2;
    if (dh) { const i = heights.indexOf(h); h = heights[i + dh]; if (h == null) { say('No taller or shorter size for this unit.'); return; } }
    if (w < 1 || w > 4) return;
    if (!Rs.sizeExists(w, h, u.fill)) { say(`${w}W·${h}H ${G.fills.find((f) => f.id === u.fill)?.label || u.fill} isn’t in the ${S().length} lineup.`); return; }
    if (!Rs.fillFits(w, u.fill)) { say(Rs.fitProblem(w, u.fill) || 'That size won’t print on the selected printer.'); return; }
    const hh = h * 2; const y = S().mount === 'tabletop' ? u.y + u.hh - hh : u.y;
    if (!Rs.canPlace(u.x, y, w, hh, u.id)) { say('No room for that size here · move it, or make room first.'); return; }
    edit((s) => { const p = s.placed.find((q) => q.id === id); p.w = w; p.hh = hh; p.y = y; s.removedStoppers = s.removedStoppers.filter((k) => { const [kid, col] = k.split(':').map(Number); return kid !== id || col < w; }); }, 'resize');
  }
  function setUnitOption(id, fn) { edit((s) => { const p = s.placed.find((q) => q.id === id); if (p) fn(p, s); }, 'option', { gravity: false }); }
  function gridOp(op) {
    edit((s, Rs) => {
      if (op === 'w+') s.gridW = Math.min(Rs.capW(), s.gridW + 1);
      if (op === 'w-') s.gridW = Math.max(Rs.GRID_LIMITS.wMin, s.gridW - 1);
      if (op === 'h+') s.gridH = Math.min(Rs.capH(), s.gridH + 1);
      if (op === 'h-') s.gridH = Math.max(Rs.GRID_LIMITS.hMin, s.gridH - 1);
      const before = s.placed.length; Rs.clampGrid();
      if (s.placed.length < before) say(`${n(before - s.placed.length, 'unit')} fell off the smaller grid · Ctrl+Z puts them back.`);
    }, 'grid', { gravity: false });
  }
  function select(id) { if (id == null) { stage.setSelected(null); st.selId = null; st.sel = null; S().selectedUnit = null; ctx.memo.buildSel = null; renderAll(); return; } if (!stage.selectUnit(id)) { st.selId = id; st.sel = { owner: id }; S().selectedUnit = id; renderAll(); } }
  function togglePeek(id) { if (st.peeking === id) { stage.unpeek(); st.peeking = null; } else { st.peeking = stage.peekUnit(id) ? id : null; } renderInspector(); }

  /* ---------------- the issues ---------------- */
  function issues() {
    const s = S(), Rs = R(); const out = []; const fromTop = s.mount !== 'tabletop';
    const sizeOf = (p) => `${p.w}W-${p.hh / 2}H ${G.fills.find((f) => f.id === p.fill)?.label || p.fill}`;
    if (!s.placed.length) return out;
    const uns = Rs.unsupportedUnits();
    if (uns.length) out.push({ kind: 'unsupported', sev: 'hard', ids: uns.map((u) => u.id), title: `${n(uns.length, 'unit')} not supported on both ends.`, text: fromTop ? 'A case QuickLocks to the row above and needs a unit above its left and right edges. Move it to the top row, or fill the gap above the open end.' : 'Tabletop stacks build from the surface, so each case needs a unit below its left and right edges. Move it down, or fill the gap under the open end.', fix: { label: 'Fix structure', run: fixStructure } });
    const sags = Rs.sagRisks();
    if (sags.size) out.push({ kind: 'sag', sev: 'hard', ids: [...sags], title: `${n(sags.size, 'unit')} would sag.`, text: fromTop ? 'This kit hangs from its rails, so rigidity comes from above, and these sit under an open case or drawer with neither side wall meeting a wall above. Align at least one edge with a wall above, or match widths.' : 'A Table Top kit is rigid from the surface up, and these sit over an open span with neither side wall landing on a wall below. Align at least one edge with a wall below, or match widths.' });
    const misfits = s.placed.filter((p) => !Rs.fillFits(p.w, p.fill));
    if (misfits.length) out.push({ kind: 'printer', sev: 'hard', ids: misfits.map((p) => p.id), title: `${n(misfits.length, 'unit')} won’t print on the selected printer.`, text: [...new Set(misfits.map(sizeOf))].join(', ') + '.' });
    const ghosts = s.placed.filter((p) => !Rs.sizeExists(p.w, p.hh / 2, p.fill));
    if (ghosts.length) out.push({ kind: 'lineup', sev: 'hard', ids: ghosts.map((p) => p.id), title: `${n(ghosts.length, 'unit')} not in the ${s.length} collection.`, text: [...new Set(ghosts.map(sizeOf))].join(', ') + ' · swap them for available sizes or pick another length.' });
    const bows = Rs.bowRisks();
    if (bows.size) out.push({ kind: 'bow', sev: 'soft', ids: [...bows], title: `${n(bows.size, 'wide case')} may bow under load.`, text: 'A narrower case loads the interior of a wider one, away from its end walls. To stiffen it: match widths, align the narrower case to an end, or support the full span.' });
    const untiled = s.placed.filter((p) => { const f = Rs.interiorFill(p); return f && !f.complete; });
    if (untiled.length) { const cells = untiled.reduce((k, p) => k + Rs.interiorCellsLeft(p), 0); out.push({ kind: 'cabinet', sev: 'hard', ids: untiled.map((p) => p.id), title: `${n(untiled.length, 'cabinet')} with an unfinished interior.`, text: `Fill the whole cabinet (${n(cells, 'cell')} left).` }); }
    const low = Rs.wallTopHalfHeight();
    if (low.size) out.push({ kind: 'walltop', sev: 'hard', ids: [...low], title: `${n(low.size, 'top-row case')} 0.5H on a Wall Mount.`, text: 'A Wall Mount hangs the top row from a bracket course, and 0.5H cases are too low-profile for wall-mount holes. Grow them to 1H, or cap them with a taller unit above.', fix: { label: 'Grow top row to 1H', run: fixWallTops } });
    if (s.mount === 'tabletop') { const d = Rs.tabletopCompletion(); if (!d.complete) { const k = d.areas.length; out.push({ kind: 'completion', sev: 'guide', ids: [], title: k === 1 ? 'Almost there · one area left to fill.' : 'Finish the top to complete your tabletop kit.', text: `Fill the ${k === 1 ? 'hatched space' : k + ' hatched areas'} so every column supports the top cover · any drawer combination that fits.` }); } }
    if (s.mount === 'under-table' && !VIEWER_UT_LENGTHS.includes(+s.length)) out.push({ kind: 'ut', sev: 'soft', ids: [], title: `No 3D guide for under-table ${s.length} yet.`, text: 'The rail models aren’t in the 3D part library. You can still plan and print this build.' });
    if (s.placed.length > UNIT_CAP) out.push({ kind: 'cap', sev: 'soft', ids: [], title: `Instructions stop at ${UNIT_CAP} units.`, text: `This build has ${s.placed.length}. The parts list and the board still work; the 3D instructions cover the first ${UNIT_CAP}.` });
    // the generator's own refusal, when no planner rule above already explains it (its floating/hanging checks restate `unsupported`)
    if (st.stageErrors && st.stageErrors.length && !out.some((i) => i.sev === 'hard')) out.push({ kind: 'stage', sev: 'hard', ids: [], title: '3D can’t show this layout yet.', text: st.stageErrors.join(' · ') });
    return out;
  }
  const flaggedIds = (list) => new Set(list.filter((i) => i.sev !== 'guide').flatMap((i) => i.ids));

  /* ---------------- library ---------------- */
  const lib = el('aside.glass', { id: 'ws-lib', 'aria-label': 'Library' });
  root.appendChild(lib);
  function renderLib() {
    lib.replaceChildren();
    lib.classList.toggle('rail', st.collapsed);
    if (st.collapsed) {
      lib.append(
        el('button.expand', { title: 'Expand the library', onclick: () => { st.collapsed = false; renderLib(); layout(); } }, [icon('caret-right')]),
        el('button.railbtn.key' + (st.tab === 'add' ? '.on' : ''), { onclick: () => { st.collapsed = false; st.tab = 'add'; renderLib(); layout(); } }, [icon('plus'), 'Add']),
        el('button.railbtn.key' + (st.tab === 'style' ? '.on' : ''), { onclick: () => { st.collapsed = false; st.tab = 'style'; renderLib(); layout(); } }, [icon('sliders-horizontal'), 'Style']),
      );
      return;
    }
    const tabsRow = el('div.tabs', {}, [
      el('div.track', { role: 'tablist' }, [
        el('button.seg' + (st.tab === 'add' ? '.on' : ''), { role: 'tab', 'aria-selected': String(st.tab === 'add'), text: 'Add units', onclick: () => { st.tab = 'add'; renderLib(); } }),
        el('button.seg' + (st.tab === 'style' ? '.on' : ''), { role: 'tab', 'aria-selected': String(st.tab === 'style'), text: 'Build style', onclick: () => { st.tab = 'style'; renderLib(); } }),
      ]),
      el('button.collapse', { title: 'Collapse the library', onclick: () => { st.collapsed = true; renderLib(); layout(); } }, [icon('caret-right', { size: 18 })]),
    ]);
    tabsRow.querySelector('.collapse svg').style.transform = 'rotate(180deg)';
    lib.appendChild(tabsRow);
    if (st.tab === 'add') renderAdd(); else renderStyle();
  }
  const kindOf = (unit) => unit === 'classic' ? 'classicDrawer' : unit === 'shelf' ? 'shelf' : unit === 'cabinet' ? 'cabinet'
    : (st.gf === 'gridfinity' ? 'gridfinity' : (FACEK[stage.currentFaceplateStyle()?.key] || 'edgelabel'));
  /* why a size is greyed (the planner's own reasons, in the brief's words): the lineup, the printer, whole heights, Gridfinity heights */
  function sizeWhy(w, h) {
    const Rs = R(), s = S(); const fill = st.unit; const def = G.fills.find((f) => f.id === fill) || {};
    if (!Rs.sizeExists(w, h, fill)) return G.unavailableSizes.includes(`${w}W-${h}H`) ? 'No single drawer this size · too large to print' : `Not in the ${s.length} lineup`;
    if (def.integerHeightsOnly && !Number.isInteger(h)) return `${def.label}s come in whole heights only`;
    if (def.minHeight && h < def.minHeight) return `${def.label}s start at ${def.minHeight}H`;
    if (!Rs.fillFits(w, fill)) return Rs.fitProblem(w, fill) || 'Won’t fit the selected printer';
    if (fill === 'decor' && st.gf === 'gridfinity' && !G.gridfinity.heights.includes(h)) return `Gridfinity drawers come in ${G.gridfinity.heights.join(', ')}H`;
    if (fill === 'decor' && st.gf === 'gridfinity' && !G.gridfinity.lengths.includes(+s.length)) return `No Gridfinity drawers for ${s.length}`;
    return null;
  }
  function renderAdd() {
    const sec = el('section');
    sec.appendChild(el('h2.h2', { text: 'Unit' }));
    const grid = el('div.units');
    for (const f of (G?.fills || [])) {
      const soonUnit = !!f.soon; const on = st.unit === f.id;
      const b = el('button.unit.key' + (soonUnit ? '.dis' : on ? '.on' : ''), {
        'aria-disabled': soonUnit ? 'true' : null, 'aria-pressed': String(on), title: f.blurb,
        onclick: soonUnit ? null : () => { setPalette(f.id); if (sizeWhy(...st.addSize.split('x').map(Number))) { st.armed = false; } renderAll(); },
      }, [soonUnit ? glyphEl(kindOf(f.id), 36, 24, colors) : preview(glyphEl(kindOf(f.id), 36, 24, colors), { fill: f.id, w: 1, hh: 2, variant: f.id === 'decor' && st.gf === 'gridfinity' ? 'gridfinity' : null, view: 'front' }, 'tile'), el('span', { text: f.label })]);
      if (soonUnit) b.appendChild(el('span.soon', { text: 'SOON' }));
      grid.appendChild(b);
    }
    sec.appendChild(grid);
    if (st.unit === 'decor') {
      sec.appendChild(el('div.track.gf', { role: 'group', 'aria-label': 'Decor drawer variant' }, [
        el('button.seg' + (st.gf === 'standard' ? '.on' : ''), { text: 'Standard', onclick: () => { st.gf = 'standard'; renderAll(); } }),
        el('button.seg' + (st.gf === 'gridfinity' ? '.on' : ''), { text: 'Gridfinity', onclick: () => { st.gf = 'gridfinity'; renderAll(); } }),
      ]));
    }
    lib.appendChild(sec);

    const sz = el('section');
    sz.appendChild(el('h2.h2', { text: 'Size · drawn to scale' }));
    const sizes = el('div.sizes');
    const heights = R().heightsForFill(st.unit);
    for (const h of heights) for (const w of (G?.drawerWidths || [1, 2, 3, 4])) {
      const why = sizeWhy(w, h); const id = `${w}x${h}`; const dis = !!why, on = st.addSize === id;
      sizes.appendChild(el('button.size.key' + (dis ? '.dis' : on ? '.on' : ''), {
        title: why || `${w * 88} × ${h * 56} mm · click to place`, 'aria-disabled': dis ? 'true' : null, 'aria-pressed': String(on),
        onclick: dis ? null : () => { setPalette(st.unit, id); st.armed = true; st.eraser = false; renderAll(); if (phone) phone.collapse(lib); },
      }, [el('div.holder', {}, [sizeGlyph(kindOf(st.unit), w, h, colors)]), el('span.cap', { text: `${w}W·${h}H` })]));
    }
    sz.appendChild(sizes);
    const { w: aw, h: ah } = armedSize(); const wall = G?.interior || { wWall: 17, hWall: 8 };
    sz.appendChild(el('p.readout', { text: `${aw}W·${ah}H inside ≈ ${aw * 88 - wall.wWall} × ${Math.round(ah * 56 - wall.hWall)} × ${INSIDE[length] ?? length} mm` }));
    if (st.armed) {
      sz.appendChild(el('div.armed', {}, [
        el('span', { text: st.view === '2d' ? 'Click a free cell on the board to place it.' : 'Click an amber spot on the model to place it.' }),
        el('button.key.sm', { text: 'Stop placing', onclick: () => { st.armed = false; renderAll(); } }),
      ]));
    } else sz.appendChild(el('p.hint', { text: 'Pick a size to start placing. Greyed sizes say why on hover.' }));
    lib.appendChild(sz);
  }
  function renderStyle() {
    lib.appendChild(el('p.intro', { text: 'Applies to every unit. Colors live in the Colors tab.' }));
    const s = S();
    const drawers = s.placed.filter((u) => u.fill === 'classic' || u.fill === 'decor');
    const fills = drawers.map((u) => u.fill);
    const typeOn = fills.length && fills.every((f) => f === fills[0]) ? fills[0] : null;
    const types = el('section');
    types.appendChild(el('h2.h2', { text: 'Drawer type' }));
    types.appendChild(el('div.types', {}, [['classic', 'Classic drawer', 'classicDrawer'], ['decor', 'Decor drawer', FACEK[stage.currentFaceplateStyle()?.key] || 'edgelabel']].map(([id, name, kind]) =>
      el('button.type.key' + (typeOn === id ? '.on' : ''), { title: `Convert every drawer to ${name}s · a drawer that can’t change says why`, onclick: () => convertAll(id) }, [glyphEl(kind, 36, 24, colors), name]))));
    lib.appendChild(types);

    const cur = stage.currentFaceplateStyle();
    const avail = new Set(stage.availableFaceplateStyles().map((x) => x.key));
    const faces = el('section');
    faces.appendChild(el('h2.h2', { text: 'Decor faceplate' }));
    faces.appendChild(el('div.faces', {}, stage.FACEPLATE_STYLES.map((x) => {
      const ok = avail.has(x.key) && drawers.some((u) => u.fill === 'decor');
      const b = el('button.face.key' + (!ok ? '.dis' : cur?.key === x.key ? '.on' : ''), {
        'aria-disabled': ok ? null : 'true', title: ok ? `${FACE_LABEL[x.key] || x.label}${CLUB[x.key] ? ' · ✦ Club' : ' · Core, free'}` : 'Not in this collection, or no Decor drawers',
        onclick: ok ? async () => { await stage.applyFaceplateStyle(x); await adopt(); } : null,
      }, [ok ? preview(glyphEl(FACEK[x.key] || 'essential', 40, 26, colors), { fill: 'decor', w: 1, hh: 2, faceStyle: x.key, view: 'front' }, 'face') : glyphEl(FACEK[x.key] || 'essential', 40, 26, colors), FACE_LABEL[x.key] || x.label]);
      if (CLUB[x.key]) b.appendChild(el('span.club', { text: '✦', title: 'Club' }));
      return b;
    })));
    faces.appendChild(el('p.note', { text: cur?.key === 'edgelabel' || cur?.key === 'classicpro' ? `${FACE_LABEL[cur.key]} takes printed labels.` : 'EdgeLabel and Classic Pro take printed labels.' }));
    lib.appendChild(faces);

    if (cur?.hasHandle) {
      const hs = el('section');
      hs.appendChild(el('h2.h2', { text: 'Handle series' }));
      const curH = stage.currentHandleStyle();
      const shape = (label) => /crystal/i.test(label) ? 'crystal' : /block/i.test(label) ? 'blockbar' : 'deco';
      hs.appendChild(el('div.handles', {}, stage.HANDLE_STYLES.map((h) => el('button.handle.key' + (curH?.node === h.node ? '.on' : ''), { onclick: async () => { await stage.applyHandleStyle(h); await adopt(); } },
        [preview(el('span.shape.' + shape(h.label), { style: `background:${colors.handle}` }), { fill: 'decor', w: 1, hh: 2, faceStyle: cur.key, handleStyle: h.planner, handle: h, view: 'three', frame: 'handle', fit: 1.0 }, 'handle'), h.label]))));
      lib.appendChild(hs);
    }

    const closures = drawers.map((u) => u.closure === 'magnet' ? 'magnet' : 'none');
    const closureOn = closures.length && closures.every((c) => c === closures[0]) ? closures[0] : null;
    const cl = el('section');
    cl.appendChild(el('h2.h2', { text: 'Closures' }));
    cl.appendChild(el('div.track.seg3', { role: 'group' }, [
      el('button.seg' + (closureOn === 'none' ? '.on' : ''), { text: 'None', onclick: async () => { await stage.setAllClosure('none'); await adopt(); } }),
      el('button.seg' + (closureOn === 'magnet' ? '.on' : ''), { text: 'Magnets', title: '6 × 10×2 mm disc magnets per drawer · hardware store', onclick: async () => { await stage.setAllClosure('magnet'); await adopt(); } }),
      el('button.seg', { text: 'Push-Click', disabled: true, title: 'Soon · not for wall builds' }),
    ]));
    lib.appendChild(cl);

    const removed = new Set(s.removedStoppers || []);
    const two = el('div.two');
    const stp = el('section');
    stp.appendChild(el('h2.h2', { text: 'Stoppers' }));
    stp.appendChild(el('div.track.seg2', { role: 'group' }, [
      el('button.seg.sm' + (removed.size === 0 ? '.on' : ''), { text: 'All', onclick: async () => { await stage.setAllStoppers(true); await adopt(); } }),
      el('button.seg.sm' + (removed.size > 0 ? '.on' : ''), { text: 'None', onclick: async () => { await stage.setAllStoppers(false); await adopt(); } }),
    ]));
    const bc = el('section');
    bc.appendChild(el('h2.h2', { text: 'Back cover' }));
    bc.appendChild(el('div.track.seg2', { role: 'group' }, [
      el('button.seg.sm' + (!s.backCover ? '.on' : ''), { text: 'Off', onclick: async () => { await stage.setBackCover(false); await adopt(); } }),
      el('button.seg.sm' + (s.backCover ? '.on' : ''), { text: 'On', onclick: async () => { await stage.setBackCover(true); await adopt(); } }),
    ]));
    two.append(stp, bc);
    lib.appendChild(two);

    if (s.mount === 'tabletop') {
      const ft = el('section');
      ft.appendChild(el('h2.h2', { text: 'Feet' }));
      ft.appendChild(el('div.track.seg2', { role: 'group' }, [
        el('button.seg.sm' + (s.feet !== 'adhesive' ? '.on' : ''), { text: 'Print TPU', onclick: async () => { await stage.setFeet('tpu'); await adopt(); } }),
        el('button.seg.sm' + (s.feet === 'adhesive' ? '.on' : ''), { text: 'Buy adhesive', onclick: async () => { await stage.setFeet('adhesive'); await adopt(); } }),
      ]));
      lib.appendChild(ft);
    }
    const gridable = s.placed.filter((u) => u.fill === 'decor');
    if (gridable.length) {
      const vals = gridable.map((u) => u.variant === 'gridfinity' ? 'gridfinity' : 'standard');
      const on = vals.every((v) => v === vals[0]) ? vals[0] : null;
      const gv = el('section');
      gv.appendChild(el('h2.h2', { text: 'Decor drawers' }));
      gv.appendChild(el('div.track.seg2', { role: 'group' }, [
        el('button.seg.sm' + (on === 'standard' ? '.on' : ''), { text: 'Standard', onclick: async () => { await stage.setAllVariant('standard'); await adopt(); } }),
        el('button.seg.sm' + (on === 'gridfinity' ? '.on' : ''), { text: 'Gridfinity', onclick: async () => { await stage.setAllVariant('gridfinity'); await adopt(); } }),
      ]));
      lib.appendChild(gv);
    }
  }

  /* ---------------- inspector ---------------- */
  const insp = el('aside.glass.glass-edge', { id: 'ws-insp', 'aria-label': 'This unit only', hidden: true });
  root.appendChild(insp);
  function renderInspector() {
    const sel = st.sel; const s = S();
    insp.replaceChildren();
    const unit = st.selId != null ? s.placed.find((u) => u.id === st.selId) : null;
    if (!sel && !unit) { insp.hidden = true; return; }
    insp.hidden = false;
    const closeBtn = el('button.x', { title: 'Deselect', 'aria-label': 'Deselect', onclick: () => select(null) }, [icon('x', { size: 16 })]);
    if (!unit) {
      insp.append(
        el('div.head', {}, [el('h2.h2', { text: 'Build part' }), closeBtn]),
        el('div.ident', {}, [el('div.wellbox.well', {}, [icon('stack', { size: 28 })]), el('div.col', {}, [el('h3', { text: sel.label || sel.node }), el('div.src', { text: 'Covers, rails and feet belong to the whole build, not to one unit.' })])]),
      );
      return;
    }
    const idx = s.placed.indexOf(unit) + 1;
    const fill = (G?.fills || []).find((f) => f.id === unit.fill);
    const cur = stage.currentFaceplateStyle();
    const kind = unit.fill === 'classic' ? 'classicDrawer' : unit.fill === 'shelf' ? 'shelf' : unit.variant === 'gridfinity' ? 'gridfinity' : (FACEK[cur?.key] || 'edgelabel');
    const wall = G?.interior || { wWall: 17, hWall: 8 };
    const src = unit.fill === 'decor' ? `${FACE_LABEL[cur?.key] || 'Decor'} faceplate${CLUB[cur?.key] ? ' · ✦ Club' : ''}` : unit.fill === 'classic' ? 'Print-in-place handle' : 'Open shelf';
    insp.append(
      el('div.head', {}, [el('h2.h2', { text: 'This unit only' }), el('span.idx', { text: `Unit ${idx} of ${s.placed.length}` }), closeBtn]),
      el('div.ident', {}, [
        el('div.wellbox.well', {}, [preview(glyphEl(kind, 79, 50, { ...colors, front: frontFor(unit.fill) }), { fill: unit.fill, w: unit.w, hh: unit.hh, variant: unit.variant || null, lip: unit.lip || null, view: 'three', fit: 1.0, size: 512, unitId: unit.id }, 'insp')]),
        el('div.col', {}, [
          el('h3', { text: fill?.label || unit.fill }),
          el('div.dims', { text: `${unit.w}W·${unit.hh / 2}H · inside ${unit.w * 88 - wall.wWall} × ${Math.round((unit.hh / 2) * 56 - wall.hWall)} × ${INSIDE[length] ?? length} mm` }),
          el('div.src', { text: src }),
        ]),
      ]),
    );
    // the issue card's warning for this unit, repeated here (the brief)
    for (const i of issues()) if (i.ids.includes(unit.id)) insp.appendChild(el('div.warnbox', {}, [el('b', { text: i.title + ' ' }), i.text]));
    const Rs = R();
    if (unit.fill !== 'shelf' && unit.fill !== 'cabinet') {
      const why = { classic: Rs.convertProblem(unit, 'classic'), decor: Rs.convertProblem(unit, 'decor') };
      insp.appendChild(el('div.track.seg2', { role: 'group', 'aria-label': 'Type' }, [
        el('button.seg' + (unit.fill === 'classic' ? '.on' : ''), { text: 'Classic drawer', title: why.classic || 'Make this one a Classic drawer', disabled: !!why.classic && unit.fill !== 'classic', onclick: () => setUnitFill(unit.id, 'classic') }),
        el('button.seg' + (unit.fill === 'decor' ? '.on' : ''), { text: 'Decor drawer', title: why.decor || 'Make this one a Decor drawer', disabled: !!why.decor && unit.fill !== 'decor', onclick: () => setUnitFill(unit.id, 'decor') }),
      ]));
    }
    const stepper = (label, value, onMinus, onPlus) => el('div.row', {}, [label, el('div.stepper', {}, [el('button.key', { text: '−', 'aria-label': `${label} smaller`, onclick: onMinus }), el('b.mono', { text: value }), el('button.key', { text: '+', 'aria-label': `${label} larger`, onclick: onPlus })])]);
    insp.appendChild(stepper('Width', `${unit.w}W`, () => resize(unit.id, -1, 0), () => resize(unit.id, 1, 0)));
    insp.appendChild(stepper('Height', `${unit.hh / 2}H`, () => resize(unit.id, 0, -1), () => resize(unit.id, 0, 1)));
    if (unit.fill === 'classic' || unit.fill === 'decor') {
      insp.appendChild(el('div.row', {}, ['Closure', el('div.track.seg2.mini', { role: 'group' }, [
        el('button.seg.sm' + (unit.closure !== 'magnet' ? '.on' : ''), { text: 'None', onclick: () => setUnitOption(unit.id, (p) => { delete p.closure; }) }),
        el('button.seg.sm' + (unit.closure === 'magnet' ? '.on' : ''), { text: 'Magnets', onclick: () => setUnitOption(unit.id, (p) => { p.closure = 'magnet'; }) }),
      ])]));
      const keys = Array.from({ length: unit.w }, (_, k) => `${unit.id}:${k}`);
      const removedHere = keys.filter((k) => s.removedStoppers.includes(k)).length;
      insp.appendChild(el('div.row', {}, ['Stoppers', el('div.track.seg2.mini', { role: 'group' }, [
        el('button.seg.sm' + (removedHere === 0 ? '.on' : ''), { text: 'All', onclick: () => setUnitOption(unit.id, (p, s2) => { s2.removedStoppers = s2.removedStoppers.filter((k) => !keys.includes(k)); }) }),
        el('button.seg.sm' + (removedHere === keys.length ? '.on' : ''), { text: 'None', onclick: () => setUnitOption(unit.id, (p, s2) => { s2.removedStoppers = [...new Set([...s2.removedStoppers, ...keys])]; }) }),
      ])]));
      if (unit.fill === 'decor' && Rs.gridfinityOk(unit)) insp.appendChild(el('div.row', {}, ['Drawer', el('div.track.seg2.mini', { role: 'group' }, [
        el('button.seg.sm' + (unit.variant !== 'gridfinity' ? '.on' : ''), { text: 'Standard', onclick: () => setUnitOption(unit.id, (p) => { delete p.variant; }) }),
        el('button.seg.sm' + (unit.variant === 'gridfinity' ? '.on' : ''), { text: 'Gridfinity', onclick: () => setUnitOption(unit.id, (p) => { p.variant = 'gridfinity'; }) }),
      ])]));
    }
    if (unit.fill === 'shelf') {
      const stops = [['none', 'None'], ['front', 'Front']]; if (G.shelfMidLipLengths.includes(+s.length)) stops.push(['both', 'Front + mid']);
      const curLip = stops.some(([id]) => id === (unit.lip || 'none')) ? (unit.lip || 'none') : 'front';
      insp.appendChild(el('div.row', {}, ['Lip', el('div.track.mini', { role: 'group', style: `grid-template-columns: repeat(${stops.length}, minmax(0, 1fr))` }, stops.map(([id, label]) =>
        el('button.seg.sm' + (curLip === id ? '.on' : ''), { text: label, onclick: () => setUnitOption(unit.id, (p) => { if (id === 'none') delete p.lip; else p.lip = id; }) })))]));
    }
    insp.appendChild(el('div.actions', {}, [
      el('button.key' + (st.peeking === unit.id ? '.on' : ''), { text: st.peeking === unit.id ? 'Close it' : 'Peek inside', title: unit.fill === 'shelf' ? 'A shelf has nothing to open' : 'Slide the drawer open on the model', disabled: unit.fill === 'shelf', onclick: () => togglePeek(unit.id) }),
      el('button.key', { text: 'Duplicate', title: 'A copy on the nearest valid spot', onclick: () => duplicateUnit(unit.id) }),
      el('button.key.danger', { text: 'Remove', title: 'Remove this unit · Delete', onclick: () => removeUnit(unit.id) }),
    ]));
  }

  /* ---------------- toolbar, board, dock, issue card, menu ---------------- */
  const bar = toolbar(stage, {
    soon,
    view: { get: () => st.view, set: (v) => { st.view = v; st.armed = st.armed && true; renderAll(); } },
    history: { undo: () => store.undo(), redo: () => store.redo(), get canUndo() { return store.canUndo; }, get canRedo() { return store.canRedo; } },
    eraser: { get: () => st.eraser, set: (on) => { st.eraser = on; if (on) { st.armed = false; select(null); } renderAll(); } },
  });
  const tools = bar.el;
  root.appendChild(tools);
  const brd = board({
    state: S, colors: () => ({ ...colors }), armed: () => st.armed ? armedSize() : null, selected: () => st.selId,
    flagged: () => flaggedIds(issues()), deficit: () => S().mount === 'tabletop' ? R().tabletopCompletion().cells : [],
    canPlace: (x, y, w, hh, id) => R().canPlace(x, y, w, hh, id), labelOf: (u) => u.label || '',
    onSelect: (id) => { if (st.eraser && id != null) { removeUnit(id); return; } select(id); },
    onPlace: (x, y) => placeAt(x, y), onMove: (id, x, y) => moveTo(id, x, y), onGrid: gridOp,
  });
  brd.el.hidden = true;
  root.appendChild(brd.el);

  const dock = el('footer.glass', { id: 'ws-dock' });
  root.appendChild(dock);
  const dims = () => {
    const sz = stage.buildSize?.();
    if (sz && !st.stageErrors) return `${Math.round(sz.x)} × ${Math.round(sz.y)} × ${Math.round(sz.z)}`;
    const placed = S().placed;
    const W = (Math.max(0, ...placed.map((u) => u.x + u.w)) - Math.min(99, ...placed.map((u) => u.x))) * 88, H = (Math.max(0, ...placed.map((u) => u.y + u.hh)) - Math.min(99, ...placed.map((u) => u.y))) * 28;
    return `${Math.max(0, W)} × ${Math.max(0, H)} × ${length}`;
  };
  function renderDock() {
    const list = issues(); const k = list.length;
    dock.replaceChildren(
      el('button.status' + (k ? '.issue' : ''), { title: k ? 'Open the issue card' : 'Every unit is supported and in the collection', 'aria-expanded': String(st.issuesOpen), onclick: () => { st.issuesOpen = !st.issuesOpen; renderIssues(); renderDock(); } }, [el('span.dot'), k ? n(k, 'issue') : 'Layout valid']),
      el('div.group', {}, [el('span.big', { text: String(S().placed.length) }), el('span.unit-lbl', { text: 'units' })]),
      el('div.group', {}, [el('span.big', { text: dims() }), el('span.unit-lbl', { text: 'mm' })]),
      el('button.cta', { onclick: () => ctx.switchTo('parts') }, ['Get parts list', icon('arrow-right', { size: 20 })]),
    );
  }
  const card = el('div.glass', { id: 'ws-issues', role: 'dialog', 'aria-label': 'Build issues', hidden: true });
  root.appendChild(card);
  let showIdx = 0;
  function renderIssues() {
    const list = issues();
    if (!st.issuesOpen || !list.length) { card.hidden = true; st.issuesOpen = st.issuesOpen && list.length > 0; return; }
    card.hidden = false;
    const hard = list.filter((i) => i.sev !== 'guide').length;
    card.replaceChildren(
      el('div.ihead', {}, [el('b', { text: hard ? `${n(hard, 'issue')} to fix before printing` : list[0].title }), el('button.x', { 'aria-label': 'Close', onclick: () => { st.issuesOpen = false; renderIssues(); renderDock(); } }, [icon('x', { size: 16 })])]),
      ...list.map((i) => el('div.issue.' + i.sev, {}, [el('div.itext', {}, [el('b', { text: i.title + ' ' }), i.text]), el('div.iact', {}, [
        i.ids.length ? el('button.key.sm', { text: 'Show me', onclick: () => { const id = i.ids[showIdx++ % i.ids.length]; select(id); } }) : null,
        i.fix ? el('button.key.sm.strong', { text: i.fix.label, onclick: i.fix.run }) : null,
      ])])),
    );
  }
  /* the touch path's confirmation (Astra: preview and confirm without a panel covering the target): a chip above the dock */
  const choice = el('div.glass', { id: 'ws-choice', role: 'status', hidden: true });
  root.appendChild(choice);
  function renderChoice() {
    const sp = st.chosen;
    if (!sp) { choice.hidden = true; return; }
    const a = armedSize(); const w = sp.w || a.w, hh = sp.hh || a.hh;
    choice.hidden = false;
    choice.replaceChildren(
      el('span', { text: sp.kind === 'need' ? `Add the ${w}W·${hh / 2}H support case here?` : `Place the ${w}W·${hh / 2}H here?` }),
      el('button.key.sm.strong', { text: 'Place', onclick: () => stage.confirmSpot() }),
      el('button.key.sm', { text: 'Cancel', onclick: () => { stage.clearSpotChoice(); st.chosen = null; renderChoice(); } }),
    );
  }
  const menu = el('div.glass', { id: 'ws-menu', role: 'menu', hidden: true });
  root.appendChild(menu);
  function openMenu(info) {
    const u = S().placed.find((p) => p.id === info.unitId); if (!u) return;
    select(u.id);
    menu.replaceChildren(
      el('div.label', { text: `Unit · ${u.w}W·${u.hh / 2}H ${G.fills.find((f) => f.id === u.fill)?.label || u.fill}` }),
      el('button.item', { role: 'menuitem', text: st.peeking === u.id ? 'Close it' : 'Peek inside', disabled: u.fill === 'shelf', onclick: () => { closeMenu(); togglePeek(u.id); } }),
      el('button.item', { role: 'menuitem', text: 'Duplicate', onclick: () => { closeMenu(); duplicateUnit(u.id); } }),
      el('button.item.danger', { role: 'menuitem', text: 'Remove', onclick: () => { closeMenu(); removeUnit(u.id); } }),
    );
    menu.hidden = false;
    const w = 200, h = 150;
    menu.style.left = Math.min(info.x, innerWidth - w - 12) + 'px'; menu.style.top = Math.min(info.y, innerHeight - h - 12) + 'px';
  }
  const closeMenu = () => { menu.hidden = true; };
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, { signal, capture: true });

  /* ---------------- the overlays on the stage ---------------- */
  function renderOverlays() {
    const s = S();
    const show3d = st.view !== '2d';
    stage.setFlags(show3d ? [...flaggedIds(issues())] : []);
    stage.setEraser(show3d && st.eraser ? (id) => removeUnit(id) : null);
    if (!show3d || st.eraser) { stage.setSpots(null); stage.setDrag(null); return; }
    const spots = [];
    for (const sp of neededSpots()) spots.push(sp);
    if (st.armed) { const a = armedSize(); for (const sp of addSpots(a.w, a.hh, st.unit)) spots.push(sp); }
    const a = armedSize();
    stage.setSpots(spots.length ? { spots, w: a.w, hh: a.hh, rows: s.gridH * 2,
      onPick: (sp) => { st.chosen = null; renderChoice(); if (sp.kind === 'need') placeAt(sp.x, sp.y, { w: sp.w, h: sp.hh / 2, hh: sp.hh }, majorityFill()); else placeAt(sp.x, sp.y); },
      onChoose: (sp) => { st.chosen = sp; renderChoice(); } } : null);
    const u = st.selId != null ? s.placed.find((p) => p.id === st.selId) : null;
    stage.setDrag(u && !st.armed ? { unitId: u.id, get rows() { return S().gridH * 2; }, spots: () => { const sp = moveSpots(u); if (!sp.length) say('No other valid spot for this unit here · the 2D board lets it go anywhere free, and gravity settles it.'); return sp; }, onDrop: (sp, id) => moveTo(id, sp.x, sp.y, { exact: true }), onCancel: () => renderAll() } : null);
  }

  /* ---------------- layout ---------------- */
  const narrow = () => innerWidth < 1280;
  /* the phone chrome: the library and the inspector are bottom sheets, the tabs a bottom bar. Placing keeps the sheets
     closed so the next spot stays uncovered (Joey, 2026-10-11); the inspector's handle names the selected unit. */
  const phone = isPhone() ? phoneChrome(root, { ...ctx, active: 'build', soon }, { panels: [
    { el: lib, title: () => st.tab === 'add' ? (st.armed ? `Placing ${armedSize().w}W·${armedSize().h}H · tap a spot` : 'Add units') : 'Build style', open: false },   // the model first; the handle opens the library
    { el: insp, title: () => { const u = S().placed.find((p) => p.id === st.selId); return u ? `Unit ${S().placed.indexOf(u) + 1} · ${u.w}W·${u.hh / 2}H ${(G?.fills || []).find((f) => f.id === u.fill)?.label || u.fill}` : 'This unit'; } },
  ] }) : null;
  if (phone) phone.onLayout(() => { safe(); if (st.view === '2d') brd.render(); });
  function layout() {
    if (phone) { tools.style.left = ''; brd.el.style.left = ''; brd.el.style.right = ''; phone.refresh(); safe(); if (st.view === '2d') brd.render(); return; }
    const left = st.collapsed ? 88 + 20 : 304 + 40;
    tools.style.left = left + 'px';
    brd.el.style.left = left + 'px';
    brd.el.style.right = (insp.hidden ? 20 : 324 + 40) + 'px';
    safe();
    if (st.view === '2d') brd.render();
  }
  function safe() {
    if (phone) { stage.setSafeArea({ left: 8, right: 8, top: phone.top(), bottom: phone.bottom() }); return; }
    const libW = st.collapsed ? 68 + 20 : 304 + 20;
    const inspW = (!narrow() || !insp.hidden) ? 324 + 20 : 0;
    const topPx = narrow() ? 134 : 90;
    stage.setSafeArea({ left: libW + 8, right: inspW + 8, top: topPx, bottom: 118 });
  }
  let autoCollapsed = false;
  function applyNarrow() {
    if (phone) return;   // sheets, not a rail
    if (narrow() && st.sel && !st.collapsed) { st.collapsed = true; autoCollapsed = true; }
    else if ((!narrow() || !st.sel) && autoCollapsed) { st.collapsed = false; autoCollapsed = false; }
  }
  addEventListener('resize', () => { applyNarrow(); renderLib(); layout(); }, { signal });

  function renderAll() {
    renderLib(); renderInspector(); renderDock(); renderIssues(); bar.sync();
    brd.el.hidden = st.view !== '2d'; if (st.view === '2d') brd.render();
    document.documentElement.classList.toggle('ws-2d', st.view === '2d');
    renderOverlays(); layout();
    if (nameEl) nameEl.textContent = baseName + (store.canUndo ? ' · edited' : '');
  }

  /* ---------------- keys ---------------- */
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === '\\') { root.hidden = !root.hidden; return; }
    if (e.key === 'Escape') { closeMenu(); stage.cancelDrag(); brd.cancel(); if (st.chosen) { stage.clearSpotChoice(); st.chosen = null; renderChoice(); return; } if (st.armed || st.eraser || st.issuesOpen) { st.armed = false; st.eraser = false; st.issuesOpen = false; } else select(null); renderAll(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && st.selId != null) { e.preventDefault(); removeUnit(st.selId); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); return; }
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (dir && st.selId != null) { e.preventDefault(); nudge(dir); }
  }, { signal });

  /* ---------------- stage ---------------- */
  const steps = stage.manifest?.steps?.length ?? 0;
  if (steps) stage.goTo(steps, { animate: false });
  stage.setDims(false);
  renderAll();
  if (st.selId != null) stage.selectUnit(st.selId);

  return {
    onSelect(sel) {
      if (syncing || unmounting) return;   // the rebuild's own deselect (the selection comes back right after), or the unmount's (the memo keeps it)
      st.sel = sel; st.selId = sel ? (sel.owner ?? null) : null;
      S().selectedUnit = st.selId; ctx.memo.buildSel = st.selId;
      if (st.peeking != null && st.peeking !== st.selId) { st.peeking = null; }
      const was = st.collapsed; applyNarrow(); if (st.collapsed !== was) renderLib();
      renderInspector(); renderOverlays(); layout();
      if (phone) { phone.collapse(insp); phone.refresh(); safe(); }   // a selection shows as the inspector's handle (its name); a tap on it opens the sheet - never over the model by itself
    },
    onContext: openMenu,
    unmount() {
      unmounting = true;
      ac.abort(); unsub();
      stage.setSpots(null); stage.setFlags([]); stage.setDrag(null); stage.setEraser(null); stage.cancelDrag(); stage.unpeek(); stage.clearSpotChoice();
      stage.setSelected(null); stage.setSafeArea(null);
      document.documentElement.classList.remove('ws-2d');
      if (phone) phone.destroy();
      root.remove();
    },
  };
}
