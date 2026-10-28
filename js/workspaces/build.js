/* The Build workspace (phase 3: the Build rules), composed over the unchanged renderer.
 *
 * Layout per the brief §2 and the v4 artboard: top bar, the left Library (Add units / Build style), the right
 * Inspector ("This unit only", hugs its content), the centre toolbar (3D/2D, Measure, Explode, Reset, Undo/Redo,
 * the eraser, quality) and the Build Dock (status → the issue card, units, mm, "Get parts list").
 *
 * The record lives in the store (js/state/store.js); every rule is the planner's own, ported by copy
 * (js/rules/layout.js). Editing (Joey's decision 2026-10-12: everything the prototype tried):
 *   - ADD: pick a unit and a size, then click an amber "+" on the stage or on the 2D board - the SAME list
 *     (placementSpots, the board redesign 2026-10-16): spots where the planner's canPlace holds AND the layout stays
 *     showable with no new structural problem, that touch the build; one start spot on an empty build. Past either
 *     edge widens the build within the mount's cap; the grid always hugs the build (hug()).
 *   - MOVE: drag a selected unit on the stage (it snaps to a valid spot) or on the board (any free footprint, past
 *     the build's edges within the cap), the inspector's Move buttons, or the arrow keys; gravity settles anything
 *     left unsupported toward the mount surface
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
import { attachHint, hideHint } from '../ui/hint.js';
import { board } from '../ui/board.js';
import { isPhone, phoneChrome } from '../ui/phone.js';
import { buildName } from '../ui/names.js';   // the chip shows the name without GEN2, like the top bar
import { layoutRules } from '../rules/layout.js';
import { refusalReason, standUp, openCells, armedSpots } from '../rules/stand.js';   // hand-written: layout.js is generated from the old planner
import { settleToward, settleWord } from '../rules/settle.js';
import { serializeBuild } from '../rules/schema.js';
import { generateManifest, isGridfinity } from '../generate.js';

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
/* the hover hints (js/ui/hint.js): a bubble beside the panel with a clip of the control in use, img/hints/build-*.mp4 from
   tools/hint-clips.mjs (Joey 2026-10-23: "more video animations for when hovering over certain buttons to illustrate how
   they work"). The "+" spots are stage markers, not buttons, so placing is explained on the size tiles, where a visitor
   is before the spots exist. The control's own title is the touch screen's answer. */
const HINTS = {
  place: { title: 'Place a unit', text: 'Click a size, then an amber spot on the model puts one there. Stop placing or Esc ends it.', video: 'img/hints/build-place.mp4' },
  fill: { title: 'Fill all', text: 'A 1W case in every red slot at once, so the build can stand or hang. One Undo takes them out again.', video: 'img/hints/build-fill.mp4' },
  sidecovers: { title: 'Side covers', text: 'The panels on the build’s outer walls. Off leaves the case sides open and takes them off the parts list; On brings them back.', video: 'img/hints/build-sidecovers.mp4' },
};

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
  const previews = new WeakMap();   // holder -> its spec, so a new quality tier repaints the pictures in place (onQuality)
  function preview(glyphNode, spec, cls = '') {
    const holder = el('div.pv' + (cls ? '.' + cls : ''), {}, [glyphNode]);
    if (!stage.thumb) return holder;
    previews.set(holder, spec);
    paintPreview(holder, spec);
    return holder;
  }
  function paintPreview(holder, spec) {
    stage.thumb(spec).then((url) => { if (url && holder.isConnected !== false) holder.replaceChildren(el('img', { src: url, alt: '' })); }).catch(() => {});
  }
  const top = topbar(stage, { ...ctx, active: 'build', say, soon, signal });
  root.prepend(top);
  const baseName = () => (ctx.builds ? ctx.builds.name : ctx.kitTitle || stage.manifest?.title || 'Workbench build');   // the build store's name (a rename shows at once)
  const nameEl = top.querySelector('#ws-switch > .chip-btn > span');

  /* ---------------- the record ↔ the stage ---------------- */
  let lastSig = null, syncing = false, unmounting = false, queue = Promise.resolve();
  /* Measure is the visitor's: the finished step a regenerate lands on shows the W/H/L callouts by itself (an edit switched
     them on, the phone check, 2026-10-17), so the choice is kept here, from the toolbar's own button, and put back after
     every regenerate; a snapshot taken before the update lost a toggle made while it ran (Sol 01a14b32) */
  let measureOn = false;
  const tryGen = (rec) => { try { return generateManifest(rec); } catch (e) { return { manifest: null, errors: [String((e && e.message) || e)] }; } };
  /* what the STAGE shows (2026-10-21): a build with gaps under part of it is an in-progress preview - ghost slots, no
     instructions - rather than a refusal (generate.js opts.voids). The placement judge below asks the same, and keeps new
     placements from opening a gap of their own by counting the open cells (openCells) */
  const tryShow = (rec) => { try { return generateManifest(rec, { voids: true }); } catch (e) { return { manifest: null, errors: [String((e && e.message) || e)] }; } };
  { const g = tryShow(store.serialize()); lastSig = g.manifest ? sigOf(g.manifest) : null; }   // the stage's own view of it
  /* every settled change: regenerate the scene when the manifest changed; an unshowable layout keeps the last good
     scene and lands its reasons in the issue card (the board always shows the true state) */
  /* A record of another mount or length is not this stage's to show: the parts pool and the mount scene are fixed when
     the page boots (main.js PARTS_BASE, isWallBuild), and the setup sheet reloads the page on exactly these two changes.
     Its commit still reaches this subscriber in the 200 ms before the reload, and until 2026-10-19 the stage was asked to
     rebuild on it - the old pool answered 404 for every part of the new length, the rebuild threw, and skipToEnd stepped
     onto the half-mounted manifest (seen on a throttled software-rendered e2e run). The reload is the answer, so the sync
     waits for it: no update, no issue, lastSig untouched. */
  const otherScene = (rec) => !!stage.build && (rec.mount !== stage.build.mount || +rec.length !== +stage.build.length);
  function syncStage() {
    queue = queue.then(async () => {
      const rec = store.serialize();
      if (otherScene(rec)) { st.stageErrors = null; renderAll(); return; }   // an earlier layout's reasons are not this record's (Terra 01a1557b)
      const gen = tryShow(rec);
      if (!gen.manifest) { st.stageErrors = gen.errors || ['This layout can’t be shown.']; renderAll(); return; }
      st.stageErrors = null;
      const sig = sigOf(gen.manifest);
      if (sig !== lastSig) {
        lastSig = sig; syncing = true;
        /* a peeked drawer stays open across the rebuild (Joey 2026-10-25: Standard -> Gridfinity on an open drawer loaded it
           closed under a "Close it" button that did nothing). The rebuild replaces every instance, so the stage's open
           drawer is let go first (its dims pills come back) and the same unit is peeked again on the new one */
        const peeked = st.peeking;
        if (peeked != null) stage.unpeek();
        try { const r = await stage.update(rec, gen); if (!r.ok) st.stageErrors = r.errors; else { stage.skipToEnd(); stage.setDims(measureOn); } }
        finally { syncing = false; }
        if (st.selId != null && !stage.selectUnit(st.selId)) { st.selId = null; st.sel = null; }
        // still the peeked unit (a select or a removal during the await may have let it go - Terra 01a175a2); gone, or a
        // shelf now: the button says Peek inside again
        if (peeked != null && st.peeking === peeked) st.peeking = !st.stageErrors && stage.peekUnit(peeked) ? peeked : null;
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
    const g = tryShow(stage.build); if (g.manifest) lastSig = sigOf(g.manifest);
    const keep = st.selId;
    store.load(stage.build, 'adopt'); st.selId = keep; S().selectedUnit = keep;
    renderAll();
  }
  /* SETTLING (Joey, 2026-10-25, replacing the 2026-10-21 "drop only, hold what was already over a gap"): after every
     edit every unit slides toward the mount until it touches the mount or any unit on that side - js/rules/settle.js says
     the model and why nothing is held any more (a held centre column stranded a whole Under-Table build) */
  function settle(s, Rs) { return settleToward(s, Rs); }
  /* every edit is ONE undo step, gravity included (Astra: make the whole action one Undo step and show which units
     moved): the moved units are named in the toast, pulsed on the model and flashed on the board */
  /* THE BOARD HUGS THE BUILD (the 2D board redesign, Joey + Astra 2026-10-16): after every edit the grid is exactly the
     build's width - empty columns at either end are dropped and the build starts at x 0 - so the width cap measures the
     build itself and both views offer the same spots. Nothing downstream reads gridW (the BOM and the generator use the
     placed units); gaps INSIDE the build stay. */
  function hug(s) {
    if (!s.placed.length) return;
    const x0 = Math.min(...s.placed.map((p) => p.x));
    if (x0) for (const p of s.placed) p.x -= x0;
    s.gridW = Math.max(1, Math.max(...s.placed.map((p) => p.x + p.w)));
  }
  let settledNote = '';   // what the last edit's settle moved, for a caller that speaks after it (removeUnit)
  function edit(fn, why = 'edit', { gravity = true } = {}) {
    let dropped = new Map(); settledNote = '';
    const r = store.commit((s, Rs) => {
      const out = fn(s, Rs);
      if (gravity) dropped = settle(s, Rs);
      hug(s); return out;
    }, why);
    if (dropped.size) {
      const s = S();
      const names = [...dropped.keys()].map((id) => { const u = s.placed.find((p) => p.id === id); return `${u ? `${u.w}W·${u.hh / 2}H` : 'unit'} (unit ${s.placed.indexOf(u) + 1})`; });
      settledNote = `${names.join(', ')} ${settleWord(s)}`;
      say(`Settled · ${settledNote} · one Undo puts it all back.`);
      st.pulse = [...dropped.keys()];
    }
    return r;
  }
  /* a trial on a clone: the layout stays showable, no structural problem appears that is not there already, and
     the unit in question has none (the prototype's rule; bow is advisory and never blocks) */
  const problems = (s, Rs) => { const set = new Set(); for (const u of Rs.unsupportedUnits()) set.add('u:' + u.id); for (const id of Rs.sagRisks()) set.add('s:' + id); for (const id of Rs.wallTopHalfHeight()) set.add('w:' + id); return set; };
  function judge(trialFn, id, selected) { return judgeWhy(trialFn, id, selected) === null; }
  /* the same trial, saying WHY it refuses (2026-10-20, the coworker's question): null when the trial passes, else the
     code refusalReason() takes - 'fit' (the trial itself said no), the first new problem's key prefix ('s' sag, 'u'
     unsupported, 'w' wall-top 0.5H), 'v' (it would open an empty slot: a column with nothing under it, which the
     planner's both-ends rule misses), or 'gen' (the generator could not build it). The generator is asked in the stage's
     mode (voids are slots, not refusals, 2026-10-21), so a build that already has empty slots still offers its spots */
  function judgeWhy(trialFn, id, selected) {
    const s = S(); const before = problems(s, R()); const open = openCells(s, R()).length;
    const t = clone(s); if (selected) t.selected = selected;
    const Rt = layoutRules(t, G, { tabletop: TT });
    if (trialFn(t, Rt) === false) return 'fit';
    Rt.syncTabletopGrid();
    for (const k of problems(t, Rt)) if (!before.has(k) || k.endsWith(':' + id)) return k.split(':')[0];
    if (openCells(t, Rt).length > open) return 'v';
    return tryShow(serializeBuild(t)).manifest ? null : 'gen';
  }
  const spotCache = new Map();
  const cacheKey = (tag) => tag + '|' + JSON.stringify(store.serialize());
  /* BUILDING PAST THE GRID'S EDGES (Joey, 2026-10-15: "I'd like to be able to build to the left of the starting drawer
     too, this was a limitation to our old grid"). A spot may sit up to one unit-width outside either edge. Taking it
     moves the whole build right by the columns it needs on the left (k) and widens the grid to `span`, never past the
     mount's width cap. Spots keep the LIVE grid's x, so a spot left of the build has a negative x. */
  // The growth is measured on what the build WOULD be - the units that stay plus the new footprint (Sol 01a14656): a
  // moving unit's old place does not count, and a stored gridW wider than the build (an older link) does not either.
  // k shifts the trial so the build starts at x 0 (it may be negative: empty columns on the left drop out), span is
  // its width; hug() then keeps the live grid exactly that.
  const grownFor = (x, w, s, Rs, moving = null) => {
    const others = s.placed.filter((p) => p.id !== moving);
    const lo = Math.min(x, ...others.map((p) => p.x)), hi = Math.max(x + w, ...others.map((p) => p.x + p.w));
    return hi - lo <= Rs.capW() ? { k: -lo, span: Math.max(1, hi - lo) } : null;
  };
  /* GROWING DOWN (Joey, 2026-10-21): a hanging build (wall, under the table) hangs from its top row, so a spot may also
     reach below the bottom row; taking it adds the rows it needs, never past the mount's height cap. The rows go on at the
     bottom, so no y moves. tallFor returns the grid height the footprint needs, or null past the cap; lastY is the last
     top row a spot may start on (a hanging build's: the bottom edge). A tabletop grows upward by itself
     (syncTabletopGrid's headroom), so its height never changes here. */
  const tallFor = (y, hh, s, Rs) => {
    const need = Math.ceil((y + hh) / 2);
    if (s.mount === 'tabletop' || need <= s.gridH) return s.gridH;
    return need <= Rs.capH() ? need : null;
  };
  const lastY = (s, hh) => (s.mount === 'tabletop' ? s.gridH * 2 - hh : s.gridH * 2);
  function growTo(t, k, span, gh = t.gridH) { if (k) for (const p of t.placed) p.x += k; t.gridW = span; t.gridH = Math.max(t.gridH, gh); }
  function addSpots(w, hh, fill) {
    const key = cacheKey(`add ${w}x${hh} ${fill}`); if (spotCache.has(key)) return spotCache.get(key);
    const s = S(), Rs = R(); const out = [];
    for (let y = 0; y <= lastY(s, hh); y++) for (let x = -w; x <= s.gridW; x++) {
      const g = grownFor(x, w, s, Rs); if (!g) continue;
      const gh = tallFor(y, hh, s, Rs); if (gh === null) continue;
      if (!g.k && g.span <= s.gridW && gh === s.gridH) {   // inside the grid, as before
        if (!Rs.canPlace(x, y, w, hh)) continue;
        if (judge((t) => { t.placed.push({ id: t.nextId++, x, y, w, hh, fill, shelves: 0 }); }, s.nextId)) out.push({ x, y });
        continue;
      }
      if (judge((t, Rt) => { growTo(t, g.k, g.span, gh); if (!Rt.canPlace(x + g.k, y, w, hh)) return false; t.placed.push({ id: t.nextId++, x: x + g.k, y, w, hh, fill, shelves: 0 }); }, s.nextId)) out.push({ x, y });
    }
    if (spotCache.size > 40) spotCache.clear(); spotCache.set(key, out); return out;
  }
  /* THE REFUSED CELLS (2026-10-20): the cells beside the build where the armed size FITS (canPlace, the cap) but the
     structural judge says no - Joey's coworker put a 1W over the middle of a 3W and got nothing. Each carries `why`
     (refusalReason's sentence), `below` (the unit it would rest on, when there is one) and `ends` (the offered spots at
     that unit's ends, for the chip's "Put it at the left end" action). An empty build has none. Same cache as the "+" list. */
  function refusedSpots(a = armedSize(), fill = st.unit) {
    const s = S(); if (!s.placed.length) return [];
    const key = cacheKey(`no ${a.w}x${a.hh} ${fill}`); if (spotCache.has(key)) return spotCache.get(key);
    const Rs = R(); const rows = s.gridH * 2; const offered = addSpots(a.w, a.hh, fill); const out = []; const occ = Rs.occupancy();
    const fromTop = s.mount !== 'tabletop';
    // only cells that REST on something: the mount surface, or a unit under at least one of the footprint's columns. A
    // cell floating beside the build (half a row up) is refused too, but nobody asks about it, and its disc would sit
    // next to a real "+" (the phone's tap-near-a-plus found that)
    const rests = (x, y) => (fromTop ? y === 0 : y + a.hh === rows) || Array.from({ length: a.w }, (_, i) => occ.has((x + i) + ',' + (fromTop ? y - 1 : y + a.hh))).some(Boolean);
    for (let y = 0; y <= lastY(s, a.hh); y++) for (let x = -a.w; x <= s.gridW; x++) {
      if (!rests(x, y) || offered.some((sp) => sp.x === x && sp.y === y) || !touchesBuild({ x, y }, a.w, a.hh, s.placed)) continue;
      const g = grownFor(x, a.w, s, Rs); if (!g) continue;
      const gh = tallFor(y, a.hh, s, Rs); if (gh === null) continue;   // past the height cap: no spot there in either view
      const why = judgeWhy((t, Rt) => { growTo(t, g.k, g.span, gh); if (!Rt.canPlace(x + g.k, y, a.w, a.hh)) return false; t.placed.push({ id: t.nextId++, x: x + g.k, y, w: a.w, hh: a.hh, fill, shelves: 0 }); }, s.nextId);
      if (why === null || why === 'fit') continue;   // 'fit' is a collision or the cap: no spot there in either view
      // the unit the footprint would rest on: the row toward the mount under the footprint's first cell
      const supRow = fromTop ? y - 1 : y + a.hh;
      const below = s.placed.find((p) => x >= p.x && x < p.x + p.w && supRow >= p.y && supRow < p.y + p.hh) || null;
      const ends = below ? offered.filter((sp) => sp.y === y && (sp.x === below.x || sp.x + a.w === below.x + below.w)).map((sp) => ({ x: sp.x, y: sp.y, side: sp.x === below.x ? 'left' : 'right' })) : [];
      out.push({ x, y, kind: 'no', code: why, why: refusalReason(why, { w: a.w, below: below ? below.w : null, hanging: fromTop }), ends });
    }
    if (spotCache.size > 40) spotCache.clear(); spotCache.set(key, out); return out;
  }
  /* ONE PLACEMENT CALCULATION for both views (Astra, the redesign): may a w x hh footprint sit at (x, y) in the LIVE
     grid's columns, the grid widening past either edge within the mount's cap? `moving` names a unit whose own cells do
     not count. Collisions and the mount's bounds only: a move may leave the build incomplete for a while (gravity
     settles it, the Dock says what is left). Returns the growth { k, span } or null. */
  function fitAt(x, y, w, hh, moving = null, s = S()) {
    const Rs = layoutRules(s, G, { tabletop: TT }); const g = grownFor(x, w, s, Rs, moving); if (!g) return null;
    if (!g.k && g.span <= s.gridW) return Rs.canPlace(x, y, w, hh, moving) ? g : null;
    const t = clone(s); const Rt = layoutRules(t, G, { tabletop: TT }); growTo(t, g.k, g.span);
    return Rt.canPlace(x + g.k, y, w, hh, moving) ? g : null;
  }
  /* a spot touches the build: beside a unit, or on or under one (gaps inside the build touch both sides) */
  const touchesBuild = (sp, w, hh, placed) => placed.some((p) => ((p.x + p.w === sp.x || sp.x + w === p.x) && sp.y < p.y + p.hh && p.y < sp.y + hh)
    || ((p.y === sp.y + hh || p.y + p.hh === sp.y) && sp.x < p.x + p.w && p.x < sp.x + w));
  /* THE "+" SPOTS, the same list for the 3D view and the 2D board: the valid spots (addSpots - the full footprint, support,
     the generator) that touch the build; an empty build gets ONE starting position, the mount edge's first column */
  function placementSpots(a = armedSize(), fill = st.unit) {
    const s = S(); const all = addSpots(a.w, a.hh, fill);
    if (!s.placed.length) {
      const edgeFirst = (p, q) => p.x - q.x || (s.mount === 'tabletop' ? q.y - p.y : p.y - q.y);
      const start = all.filter((sp) => sp.x >= 0).sort(edgeFirst)[0] || all.slice().sort(edgeFirst)[0];
      return start ? [start] : [];
    }
    return all.filter((sp) => touchesBuild(sp, a.w, a.hh, s.placed));
  }
  /* ONE MOVE CHECK for every way of moving (the board's drag preview, the arrow keys and Move buttons, the move itself,
     the 3D drag's targets - Sol 01a14656): collisions and the mount's bounds and width cap (fitAt) - nothing else (Joey,
     2026-10-25: "allow drops anywhere that doesn't collide or leave the board; the settle decides the final position").
     The earlier refusal "it would leave a unit without support" is gone: dragging a top-row unit below the stack now just
     works - everything above settles up and the dropped unit hangs at the bottom. `sel` gives the trial the moving unit's
     own headroom (the 3D drag's frame). Returns { g, rests, y }: `rests` - the settle left the unit where it was put;
     `y` - where it settles (in the trial's frame - the board's drag preview draws there, so the ghost shows the final position). */
  function moveCheck(u, x, y, sel = null) {
    const s0 = sel ? (() => { const t = clone(S()); t.selected = sel; layoutRules(t, G, { tabletop: TT }).syncTabletopGrid(); return t; })() : S();
    if (!grownFor(x, u.w, s0, layoutRules(s0, G, { tabletop: TT }), u.id)) return { why: `The build is already as wide as this mount allows (${R().capW()}W).` };
    // below a hanging build the grid grows down for the move, as it does for a placement there (the height cap says no)
    const gh = tallFor(y, u.hh, s0, layoutRules(s0, G, { tabletop: TT }));
    if (gh === null) return { why: `The build is already as tall as this mount allows (${R().capH()}H).` };
    const s1 = gh > s0.gridH ? (() => { const t = clone(s0); t.gridH = gh; return t; })() : s0;
    const g = fitAt(x, y, u.w, u.hh, u.id, s1); if (!g) return { why: 'Can’t move there · another unit is in the way.' };
    const t = clone(s1); const Rt = layoutRules(t, G, { tabletop: TT });
    if (sel) Rt.syncTabletopGrid();
    growTo(t, g.k, g.span); const p = t.placed.find((q) => q.id === u.id); p.x = x + g.k; p.y = y;
    settle(t, Rt);
    return { g, gh, rests: p.y === y, y: p.y };
  }
  /* the moving unit's own headroom (tabletop: room above the build for ITS height), as moveSpots and moveTo's exact
     path use: sel for the trial, delta = the extra half-rows that frame adds on top */
  function dragFrame(u) {
    const sel = { w: u.w, h: u.hh / 2 };
    const t0 = clone(S()); t0.selected = sel; layoutRules(t0, G, { tabletop: TT }).syncTabletopGrid();
    return { sel, delta: t0.gridH * 2 - S().gridH * 2 };
  }
  function moveSpots(u) {
    const key = cacheKey(`move ${u.id}`); if (spotCache.has(key)) return spotCache.get(key);
    const s = S(); const out = [];
    const sel = { w: u.w, h: u.hh / 2 };
    const t0 = clone(s); t0.selected = sel; layoutRules(t0, G, { tabletop: TT }).syncTabletopGrid();   // headroom for the unit's own height
    const rows = t0.gridH * 2; const u0 = t0.placed.find((p) => p.id === u.id);
    const delta = rows - s.gridH * 2;   // the trial grid's extra headroom shifts every y (tabletop); spots are reported in the LIVE grid's y
    // past either edge too, within the mount's cap (the redesign: a drag may take a unit beyond the build)
    for (let y = 0; y <= rows - u.hh; y++) for (let x = -u.w; x <= t0.gridW; x++) {
      if (x === u0.x && y === u0.y) continue;
      // the shared check; the 3D view draws only the spots where the unit rests (it cannot show a drop from above)
      const c = moveCheck(u, x, y, sel); if (c.g && c.rests) out.push({ x, y: y - delta });
    }
    if (spotCache.size > 40) spotCache.clear(); spotCache.set(key, out); return out;
  }
  /* THE EMPTY SLOTS as red spots (the prototype's "needed cells"; 2026-10-21: the cases "Fill all" would add, standUp, which
     keeps the layout and fills each open column, rather than the old Fix structure's gravity): one click adds exactly
     that. A build whose layout floats as a whole has no open cells and keeps the old Fix structure's spots */
  function neededSpots() {
    const s = S();
    if (openCells(s, R()).length) {
      const t = clone(s); const Rt = layoutRules(t, G, { tabletop: TT }); const r = standUp(t, Rt);
      return t.placed.filter((p) => r.ids.includes(p.id)).map((p) => ({ x: p.x, y: p.y, w: p.w, hh: p.hh, kind: 'need' }));
    }
    if (!R().unsupportedUnits().length) return [];
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
    const s0 = S(); const g = grownFor(x, size.w, s0, Rs);
    if (!g) { say(`The build is already as wide as this mount allows (${Rs.capW()}W).`); return; }
    const gh = tallFor(y, size.hh, s0, Rs);
    if (gh === null) { say(`The build is already as tall as this mount allows (${Rs.capH()}H).`); return; }
    if (!g.k && g.span <= s0.gridW && gh === s0.gridH) { if (!Rs.canPlace(x, y, size.w, size.hh)) { say('That spot is taken.'); return; } }
    else { const t = clone(s0); const Rt = layoutRules(t, G, { tabletop: TT }); growTo(t, g.k, g.span, gh); if (!Rt.canPlace(x + g.k, y, size.w, size.hh)) { say('That spot is taken.'); return; } }
    let id;
    edit((s) => {
      growTo(s, g.k, g.span, gh);   // past an edge: the build moves right and the grid widens (or, hanging, grows down), in the same undo step
      id = s.nextId++;
      const u = { id, x: x + g.k, y, w: size.w, hh: size.hh, fill, shelves: 0 };
      if (fill === 'decor' && st.gf === 'gridfinity' && s.fill === 'decor') u.variant = 'gridfinity';
      if (fill === 'shelf') u.lip = 'front';   // a new shelf starts with its front lip (Joey 2026-10-28); the inspector's Lip takes it off
      s.placed.push(u); s.selectedUnit = id;
    }, 'add');
    st.selId = id; ctx.memo.buildSel = id;
  }
  function moveTo(id, x, y, { exact = false } = {}) {
    const u = S().placed.find((p) => p.id === id); if (!u) return;
    // the shared move check first (a 3D drag's spot already passed it, in its own headroom frame)
    if (!exact) { const c = moveCheck(u, x, y); if (!c.g) { say(c.why); return; } }
    edit((s, Rs) => {
      const before = s.gridH * 2;
      if (exact) { s.selected = { w: u.w, h: u.hh / 2 }; Rs.syncTabletopGrid(); }   // headroom for the unit's own height (a stage spot may sit above the live grid)
      const ty = y + (s.gridH * 2 - before);
      const p = s.placed.find((q) => q.id === id);
      const gh = tallFor(ty, p.hh, s, Rs); if (gh === null) { say(`The build is already as tall as this mount allows (${Rs.capH()}H).`); return; }
      s.gridH = Math.max(s.gridH, gh);   // a drop below a hanging build adds its rows in this same undo step
      // the same calculation as the spots: past either edge within the cap; checked BEFORE anything changes
      const g = fitAt(x, ty, p.w, p.hh, p.id, s);
      if (!g) { say(grownFor(x, p.w, s, Rs, p.id) ? 'Can’t move there · another unit is in the way.' : `The build is already as wide as this mount allows (${Rs.capW()}W).`); return; }
      growTo(s, g.k, g.span);
      p.x = x + g.k; p.y = ty;
      if (exact) { const a = armedSize(); s.selected = { w: a.w, h: a.h }; }
    }, 'move');
  }
  function removeUnit(id) {
    const u = S().placed.find((p) => p.id === id); if (!u) return;
    if (st.peeking === id) { stage.unpeek(); st.peeking = null; }
    edit((s) => { s.placed = s.placed.filter((p) => p.id !== id); if (s.selectedUnit === id) s.selectedUnit = null; s.removedStoppers = s.removedStoppers.filter((k) => !k.startsWith(id + ':')); }, 'remove');
    if (st.selId === id) { st.selId = null; st.sel = null; ctx.memo.buildSel = null; stage.setSelected(null); }
    say(settledNote ? `Removed ${u.w}W·${u.hh / 2}H · ${settledNote} · Ctrl+Z puts it all back.` : `Removed ${u.w}W·${u.hh / 2}H · Ctrl+Z puts it back.`);
  }
  function duplicateUnit(id) {
    const u = S().placed.find((p) => p.id === id); if (!u) return;
    const spots = addSpots(u.w, u.hh, u.fill);
    if (!spots.length) { say('No free supported spot for a copy.'); return; }
    const near = spots.slice().sort((a, b) => (Math.abs(a.x - u.x) + Math.abs(a.y - u.y)) - (Math.abs(b.x - u.x) + Math.abs(b.y - u.y)))[0];
    let nid;
    edit((s, Rs) => { s.gridH = Math.max(s.gridH, tallFor(near.y, u.hh, s, Rs) || 0);   // a spot below a hanging build grows the grid down (hug() takes care of the width)
      nid = s.nextId++; const c = { ...clone(u), id: nid, x: near.x, y: near.y }; delete c.label; delete c.labelBadge; s.placed.push(c); s.selectedUnit = nid; }, 'duplicate');
    st.selId = nid; ctx.memo.buildSel = nid;
  }
  function nudge(dir) {
    if (st.selId == null) return;
    // left and right go through the move calculation, so a unit can step past the build's edge (the redesign's
    // alternative to dragging: the arrow keys and the inspector's Move buttons); up and down stay the rules' nudge
    if (dir === 'left' || dir === 'right') { const u = S().placed.find((p) => p.id === st.selId); if (u) moveTo(u.id, u.x + (dir === 'left' ? -1 : 1), u.y); return; }
    edit((s, Rs) => { s.selectedUnit = st.selId; return Rs.nudgeSelected(dir); }, 'nudge');
  }
  function fixStructure() {
    const r = edit((s, Rs) => Rs.fixStructure(), 'fix', { gravity: false });
    say(`✓ Structure fixed · ${n(r.moved, 'unit')} moved${r.added ? `, ${n(r.added, 'support case')} added` : ''}.`);
  }
  /* FILL ALL (2026-10-21, Joey: "I don't mind having an auto fix button"): a 1W case in every empty slot, in the build's
     majority drawer type, nothing moved (standUp); one Undo takes them out */
  function fillGaps() {
    const r = edit((s, Rs) => standUp(s, Rs), 'fix', { gravity: false });
    say(`✓ ${n(r.added, 'empty slot')} filled with 1W cases · Undo takes them out.`);
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
    /* EMPTY SLOTS (2026-10-21): gaps under a tabletop case (above a hanging one) are slots to fill, shown red here and as
       ghosts on the stage; the build has no instructions until they are filled. They include every unit the both-ends
       rule flags, so that issue only remains for a layout that floats as a whole (nothing on its surface) */
    const open = openCells(s, Rs);
    if (open.length) {
      const openSet = new Set(open.map((c) => c.x + ',' + c.y));
      const over = s.placed.filter((p) => [...Array(p.w).keys()].some((k) => openSet.has((p.x + k) + ',' + (fromTop ? p.y - 1 : p.y + p.hh))));
      const slots = neededSpots().length;
      out.push({ kind: 'gaps', sev: 'hard', ids: over.map((p) => p.id), title: `${n(slots, 'empty slot')} to fill.`, text: fromTop ? 'These cases have nothing above part of them, so the build can’t hang or be assembled yet. Fill the red slots with any case that fits, or Fill all with 1W cases.' : 'These cases have nothing under part of them, so the build can’t stand or be assembled yet. Fill the red slots with any case that fits, or Fill all with 1W cases.', fix: { label: 'Fill all', run: fillGaps } });
    }
    if (uns.length && !open.length) out.push({ kind: 'unsupported', sev: 'hard', ids: uns.map((u) => u.id), title: `${n(uns.length, 'unit')} not supported on both ends.`, text: fromTop ? 'A case QuickLocks to the row above and needs a unit above its left and right edges. Move it to the top row, or fill the gap above the open end.' : 'Tabletop stacks build from the surface, so each case needs a unit below its left and right edges. Move it down, or fill the gap under the open end.', fix: { label: 'Fix structure', run: fixStructure } });
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
    hideHint();   // a control under a bubble is about to be rebuilt; a removed button never fires mouseleave
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
      // the sizes no single drawer comes in (3W·3H, 4W·3H) are not shown at all, not even greyed (Joey 2026-10-16: "i
      // don't want to make those or even give the hint that they might be available")
      if (G?.unavailableSizes?.includes(`${w}W-${h}H`) && !R().sizeExists(w, h, st.unit)) continue;
      // lit only while it is being PLACED: the remembered size lit on entry read as "placing already" with no spots on the
      // model (Joey 2026-10-16: "no '+' are shown unless i select a different size")
      const why = sizeWhy(w, h); const id = `${w}x${h}`; const dis = !!why, on = st.armed && st.addSize === id;
      const tile = el('button.size.key' + (dis ? '.dis' : on ? '.on' : ''), {
        title: why || `${w * 88} × ${h * 56} mm · click it, then an amber spot on the model to place one there`, 'aria-disabled': dis ? 'true' : null, 'aria-pressed': String(on),
        onclick: dis ? null : () => { setPalette(st.unit, id); st.armed = true; st.eraser = false; renderAll(); if (phone) phone.collapse(lib); },
      }, [el('div.holder', {}, [sizeGlyph(kindOf(st.unit), w, h, colors)]), el('span.cap', { text: `${w}W·${h}H` })]);
      sizes.appendChild(dis ? tile : attachHint(tile, HINTS.place, lib));   // a greyed size says why in its title instead
    }
    sz.appendChild(sizes);
    const { w: aw, h: ah } = armedSize(); const wall = G?.interior || { wWall: 17, hWall: 8 };
    sz.appendChild(el('p.readout', { text: `${aw}W·${ah}H inside ≈ ${aw * 88 - wall.wWall} × ${Math.round(ah * 56 - wall.hWall)} × ${INSIDE[length] ?? length} mm` }));
    if (st.armed) {
      sz.appendChild(el('div.armed', {}, [
        el('span', { text: st.view === '2d' ? 'Click a + on the board to place it.' : 'Click an amber spot on the model to place it.' }),
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
    /* the cover's one condition, where it is switched on (v2609: the standard drawer's tear-away front and the cover
       interfere, so the front comes out first; a Gridfinity drawer keeps its front and takes no cover). Gridfinity by
       the generator's own rule: a `variant` kept on a size with no Gridfinity drawer renders the standard drawer and
       takes a cover like one (Terra 01a1594c) */
    if (s.backCover) {
      const std = s.placed.some((u) => u.fill === 'decor' && !isGridfinity(+s.length, u));
      const grid = s.placed.some((u) => isGridfinity(+s.length, u));
      const words = [std ? "Take each drawer's tear-away front out first - left in, it and the cover interfere." : '',
        grid ? 'Not on the Gridfinity drawers: their tear-away front does the same job.' : ''].filter(Boolean).join(' ');
      if (words) lib.appendChild(el('p.hint.bc-hint', { text: words }));
    }

    // side covers: on every build since 2026-10-17; the toggle (2026-10-20) is the record's own field, off only when
    // switched off here. Beside Feet on a tabletop, alone on the other mounts.
    const sc = el('section');
    sc.appendChild(el('h2.h2', { text: 'Side covers' }));
    // the hint on the track, so the bubble stays while the mouse crosses from Off to On
    sc.appendChild(attachHint(el('div.track.seg2', { role: 'group', 'aria-label': 'Side covers', title: 'The panels on the build’s outer walls · Off leaves the case sides open and takes them off the parts list' }, [
      el('button.seg.sm' + (s.sideCovers === false ? '.on' : ''), { text: 'Off', onclick: async () => { await stage.setSideCovers(false); await adopt(); } }),
      el('button.seg.sm' + (s.sideCovers !== false ? '.on' : ''), { text: 'On', onclick: async () => { await stage.setSideCovers(true); await adopt(); } }),
    ]), HINTS.sidecovers, lib));
    const two2 = el('div.two');
    two2.appendChild(sc);
    if (s.mount === 'tabletop') {
      const ft = el('section');
      ft.appendChild(el('h2.h2', { text: 'Feet' }));
      ft.appendChild(el('div.track.seg2', { role: 'group' }, [
        el('button.seg.sm' + (s.feet !== 'adhesive' ? '.on' : ''), { text: 'Print TPU', onclick: async () => { await stage.setFeet('tpu'); await adopt(); } }),
        el('button.seg.sm' + (s.feet === 'adhesive' ? '.on' : ''), { text: 'Buy adhesive', onclick: async () => { await stage.setFeet('adhesive'); await adopt(); } }),
      ]));
      two2.appendChild(ft);
    }
    lib.appendChild(two2);
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
    // the alternative to dragging (Astra): one column at a time, past the build's edge too, within the mount's cap
    insp.appendChild(el('div.row', {}, ['Move', el('div.track.mini', { role: 'group', 'aria-label': 'Move this unit', style: 'grid-template-columns: repeat(2, minmax(0, 1fr))' }, [
      el('button.seg.sm', { text: '◀ Left', title: 'One column left · ←', onclick: () => { select(unit.id); nudge('left'); } }),
      el('button.seg.sm', { text: 'Right ▶', title: 'One column right · →', onclick: () => { select(unit.id); nudge('right'); } }),
    ])]));
    insp.appendChild(el('div.actions', {}, [
      el('button.key' + (st.peeking === unit.id ? '.on' : ''), { text: st.peeking === unit.id ? 'Close it' : 'Peek inside', title: unit.fill === 'shelf' ? 'A shelf has nothing to open' : 'Slide the drawer open on the model', disabled: unit.fill === 'shelf', onclick: () => togglePeek(unit.id) }),
      el('button.key', { text: 'Duplicate', title: 'A copy on the nearest valid spot', onclick: () => duplicateUnit(unit.id) }),
      el('button.key.danger', { text: 'Remove', title: 'Remove this unit · Delete', onclick: () => removeUnit(unit.id) }),
    ]));
  }

  /* ---------------- toolbar, board, dock, issue card, menu ---------------- */
  const bar = toolbar(stage, {
    measure: true,
    view: { get: () => st.view, set: (v) => { st.view = v; st.armed = st.armed && true; renderAll(); } },
    history: { undo: () => store.undo(), redo: () => store.redo(), get canUndo() { return store.canUndo; }, get canRedo() { return store.canRedo; } },
    eraser: { get: () => st.eraser, set: (on) => { st.eraser = on; if (on) { st.armed = false; select(null); } renderAll(); } },
  });
  const tools = bar.el;
  tools.querySelector('.measure').addEventListener('click', () => { measureOn = stage.dimsOn; });   // after the toolbar's own toggle
  root.appendChild(tools);
  const brd = board({
    state: S, colors: () => ({ ...colors }), armed: () => st.armed ? armedSize() : null, selected: () => st.selId,
    // the hatched cells: an unfinished tabletop top always; the empty slots under (or above) a case only as a DRAG preview
    // (Joey, 2026-10-25: after settling no floating gap should remain, so the voids are not a standing warning)
    flagged: () => flaggedIds(issues()), deficit: (dragging) => [...(S().mount === 'tabletop' ? R().tabletopCompletion().cells : []), ...(dragging ? openCells(S(), R()) : [])],
    canPlace: (x, y, w, hh, id) => R().canPlace(x, y, w, hh, id), labelOf: (u) => u.label || '',
    // the redesign: the board shows the SAME "+" spots as the 3D view, a drag is judged by the same calculation (past
    // the build's edges within the cap), and the margin either side is the room the cap leaves (3 columns, or the armed width if wider)
    spots: () => (st.armed ? [...placementSpots(), ...refusedSpots()] : []),   // the refused cells too (kind 'no'): the board draws them muted
    onRefused: (sp) => { st.chosen = sp; renderChoice(); },   // a tap on one says why (the chip)
    // judged in the moving unit's OWN headroom frame (as the 3D drag is), so a taller unit can go on top of the build;
    // the answer carries where gravity settles it, which is where the board draws the ghost
    canMove: (id, x, y) => { const u = S().placed.find((p) => p.id === id); if (!u) return { ok: false }; const f = dragFrame(u); const c = moveCheck(u, x, y + f.delta, f.sel); return c.g ? { ok: true, y: c.y - f.delta } : { ok: false, why: c.why }; },
    topRoom: () => { const s = S(); return s.mount === 'tabletop' && s.placed.length ? Math.max(0, Math.max(...s.placed.map((p) => p.hh)) - Math.min(...s.placed.map((p) => p.y))) : 0; },
    sections: () => sectionCount(),   // (defined further down, with the Dock: read at call time)
    margin: () => { const s = S(); const span = s.placed.length ? Math.max(...s.placed.map((p) => p.x + p.w)) - Math.min(...s.placed.map((p) => p.x)) : 0; return Math.max(0, Math.min(R().capW() - span, Math.max(3, st.armed ? armedSize().w : 0))); },   // 3: a drag "three columns over" (Joey)
    onSelect: (id) => { if (st.eraser && id != null) { removeUnit(id); return; } select(id); },
    onPlace: (x, y) => placeAt(x, y), onGrid: gridOp,
    // the same check as the preview, then the move in that frame (exact: moveTo gives the unit its headroom first)
    onMove: (id, x, y) => { const u = S().placed.find((p) => p.id === id); if (!u) return; const f = dragFrame(u); const c = moveCheck(u, x, y + f.delta, f.sel); if (!c.g) { say(c.why); renderAll(); return; } moveTo(id, x, y, { exact: true }); },
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
  /* SEPARATE SECTIONS (2026-10-16): columns with a gap between them are separate runs, each finished on its own - the
     tabletop-completion contract, the BOM's rails and covers and the 3D model all treat them so (measured: a gap build's
     parts equal its sections built apart). Said in the Dock and on the board, so a gap reads as a choice. */
  const sectionCount = () => { const cols = [...new Set(S().placed.flatMap((p) => Array.from({ length: p.w }, (_, i) => p.x + i)))].sort((a, b) => a - b); return cols.filter((c, i) => i === 0 || c !== cols[i - 1] + 1).length; };
  const SECTION_WHY = { tabletop: 'its own top covers, foot rails and feet', wall: 'its own wall brackets', 'under-table': 'its own under-table rails' };
  function renderDock() {
    const list = issues(); const k = list.length; const secs = sectionCount();
    dock.replaceChildren(...[
      el('button.status' + (k ? '.issue' : ''), { title: k ? 'Open the issue card' : 'Every unit is supported and in the collection', 'aria-expanded': String(st.issuesOpen), onclick: () => { st.issuesOpen = !st.issuesOpen; if (st.issuesOpen && phone) phone.collapse(); renderIssues(); renderDock(); } }, [el('span.dot'), k ? n(k, 'issue') : 'Layout valid']),   // on a phone the card shows over the sheets' handles: an open sheet would cover it
      el('div.group', {}, [el('span.big', { text: String(S().placed.length) }), el('span.unit-lbl', { text: 'units' })]),
      el('div.group', {}, [el('span.big', { text: dims() }), el('span.unit-lbl', { text: 'mm' })]),
      secs > 1 ? el('div.group.sections', { title: `A gap splits the build into ${secs} separate sections · each gets ${SECTION_WHY[S().mount] || 'its own mounting parts'} (the parts list counts them)` }, [el('span.big', { text: String(secs) }), el('span.unit-lbl', { text: 'sections' })]) : null,
      el('button.cta', { onclick: () => ctx.switchTo('parts') }, ['Get parts list', icon('arrow-right', { size: 20 })]),
    ].filter(Boolean));
  }
  const card = el('div.glass', { id: 'ws-issues', role: 'dialog', 'aria-label': 'Build issues', hidden: true });
  root.appendChild(card);
  let showIdx = 0;
  function renderIssues() {
    const list = issues();
    hideHint();   // its Fill all may be under the bubble and is about to be rebuilt
    if (!st.issuesOpen || !list.length) { card.hidden = true; st.issuesOpen = st.issuesOpen && list.length > 0; return; }
    card.hidden = false;
    const hard = list.filter((i) => i.sev !== 'guide').length;
    // Fill all (the empty slots) takes the hover hint; the other fixes keep their one-line text
    const fixBtn = (i) => i.kind === 'gaps' ? attachHint(el('button.key.sm.strong', { text: i.fix.label, title: 'A 1W case in every red slot at once · one Undo takes them out again', onclick: i.fix.run }), HINTS.fill, card) : el('button.key.sm.strong', { text: i.fix.label, onclick: i.fix.run });
    card.replaceChildren(
      el('div.ihead', {}, [el('b', { text: hard ? `${n(hard, 'issue')} to fix before printing` : list[0].title }), el('button.x', { 'aria-label': 'Close', onclick: () => { st.issuesOpen = false; renderIssues(); renderDock(); } }, [icon('x', { size: 16 })])]),
      ...list.map((i) => el('div.issue.' + i.sev, {}, [el('div.itext', {}, [el('b', { text: i.title + ' ' }), i.text]), el('div.iact', {}, [
        i.ids.length ? el('button.key.sm', { text: 'Show me', onclick: () => { const id = i.ids[showIdx++ % i.ids.length]; select(id); } }) : null,
        i.fix ? fixBtn(i) : null,
      ])])),
    );
  }
  /* the touch path's confirmation (Astra: preview and confirm without a panel covering the target): a chip above the dock */
  const choice = el('div.glass', { id: 'ws-choice', role: 'status', hidden: true });
  root.appendChild(choice);
  function renderChoice() {
    const sp = st.chosen;
    if (!sp) { choice.hidden = true; choice.classList.remove('no'); return; }
    const a = armedSize(); const w = sp.w || a.w, hh = sp.hh || a.hh;
    choice.hidden = false; choice.classList.toggle('no', sp.kind === 'no');
    if (sp.kind === 'no') {   // a refused cell: the reason, and the end that IS offered when the rule allows one (2026-10-20)
      // a mouse merely resting on the cell gets the reason alone (a tooltip: moving to a button would leave the cell and
      // close it); a click or a tap pins the chip with its action (Sol 01a15b70)
      const end = (sp.ends || [])[0];
      choice.replaceChildren(
        el('span', { text: sp.why }),
        ...(st.hoverNo ? [] : [
          ...(end ? [el('button.key.sm.strong', { text: `Put it at the ${end.side} end`, onclick: () => { stage.clearSpotChoice(); st.chosen = null; renderChoice(); placeAt(end.x, end.y); } })] : []),
          el('button.key.sm', { text: 'OK', onclick: () => { stage.clearSpotChoice(); st.chosen = null; renderChoice(); } }),
        ]),
      );
      return;
    }
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
    // a reason chip belongs to the spots being replaced: a rebuild closes it (a touch choice is closed by setSpots itself)
    if (st.chosen && st.chosen.kind === 'no') { st.hoverNo = false; st.chosen = null; renderChoice(); }
    // the red slots; armed, the shared "+" list (placementSpots: the 2D board shows exactly these - every mount: a gap along
    // a wall or table rail comes from moving a unit, and the gap then offers its own spots) and the refused cells, muted (a
    // click or tap says why). Armed, a slot the armed unit's spot covers is not shown (stand.js armedSpots: their markers met
    // and the hover flickered between them, Joey 2026-10-28)
    const a = armedSize();
    const spots = st.armed ? armedSpots(neededSpots(), placementSpots(), refusedSpots(), a.w, a.hh) : neededSpots();
    stage.setSpots(spots.length ? { spots, w: a.w, hh: a.hh, rows: s.gridH * 2,
      onPick: (sp) => { st.chosen = null; renderChoice(); if (sp.kind === 'no') { st.hoverNo = false; st.chosen = sp; renderChoice(); return; } if (sp.kind === 'need') placeAt(sp.x, sp.y, { w: sp.w, h: sp.hh / 2, hh: sp.hh }, majorityFill()); else placeAt(sp.x, sp.y); },
      onChoose: (sp) => { st.chosen = sp; renderChoice(); },
      // a mouse resting on a refused cell shows its reason without a click; leaving hides it. A pinned chip (clicked or
      // tapped: st.chosen without st.hoverNo) is left alone by hovering (Sol 01a15b70)
      onHover: (sp) => {
        const pinned = st.chosen && !st.hoverNo;
        if (sp && sp.kind === 'no') { if (pinned) return; st.hoverNo = true; st.chosen = sp; renderChoice(); }
        else if (st.hoverNo) { st.hoverNo = false; st.chosen = null; renderChoice(); }
      } } : null);
    const u = st.selId != null ? s.placed.find((p) => p.id === st.selId) : null;
    // any unit can be dragged with a mouse or pen, selected or not, even while a size is armed (picking one up stops
    // placing); a finger drags the selected unit (Joey 2026-10-16). The targets are moveSpots: the shared moveCheck.
    stage.setDrag({ unitId: u ? u.id : null, any: true, get rows() { return S().gridH * 2; },
      spots: (id) => { const m = S().placed.find((p) => p.id === id); const sp = m ? moveSpots(m) : []; if (!sp.length) say('No other valid spot for this unit here · the 2D board lets it go anywhere free, and gravity settles it.'); return sp; },
      onStart: (id) => { st.armed = false; st.selId = id; st.sel = { owner: id }; },   // state only: no render mid-carry (it would clear the stage's spots)
      onDrop: (sp, id) => { moveTo(id, sp.x, sp.y, { exact: true }); select(id); }, onCancel: () => renderAll() });
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
    if (phone) { stage.setSafeArea({ left: phone.left(), right: phone.right(), top: phone.top(), bottom: phone.bottom() }); return; }
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
    if (nameEl) nameEl.textContent = buildName(baseName()) + (store.canUndo && !ctx.builds ? ' · edited' : '');   // autosaved builds need no 'edited' mark
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
  if (new URLSearchParams(location.search).get('debug')) window.__GEN2_BUILD__ = { addSpots, placeAt, moveTo, moveCheck, placementSpots, refusedSpots, removeUnit, issues };   // the e2e suite reads the spots and places through them

  return {
    onSelect(sel) {
      if (syncing || unmounting) return;   // the rebuild's own deselect (the selection comes back right after), or the unmount's (the memo keeps it)
      const before = st.selId;
      st.sel = sel; st.selId = sel ? (sel.owner ?? null) : null;
      S().selectedUnit = st.selId; ctx.memo.buildSel = st.selId;
      if (st.peeking != null && st.peeking !== st.selId) { st.peeking = null; }
      const was = st.collapsed; applyNarrow(); if (st.collapsed !== was) renderLib();
      renderInspector(); renderOverlays(); layout();
      // a selection shows as the inspector's handle (its name); a tap on it opens the sheet - never over the model by itself.
      // The same unit selected again (the inspector's own Move re-selects it) leaves the sheet as it was: it closed after
      // every column (the phone check, 2026-10-17)
      if (phone) { if (st.selId !== before) phone.collapse(insp); phone.refresh(); safe(); }
    },
    onContext: openMenu,
    /* the stage changed its quality tier (the pill, or the auto-downgrade from the render loop): the product previews are
       drawn for a tier, as the model is (it is in stage.thumb's key), so each picture on the page is drawn again for the
       new one. In place: the old picture stays until the new one is ready, and nothing else is rebuilt, so a tier change
       that lands mid-gesture moves no focus and closes no menu (a whole-panel renderAll from an async callback once wiped
       a word being typed, reviewer lesson 01a14ca2) */
    onQuality() {
      if (unmounting) return;
      for (const holder of document.querySelectorAll('.pv')) { const spec = previews.get(holder); if (spec) paintPreview(holder, spec); }
    },
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
