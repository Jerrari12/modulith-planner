/* The 2D board (the brief §2: "the 2D board stays as a view inside Build", SVG, to scale at 88:28). A glass panel
   over the stage's free region drawing the build: units as fronts in the live colours, the selection in orange, the
   issue card's units in dashed amber with a "!" badge, the tabletop deficit hatched. Press-and-release on a unit selects
   it, a drag moves it (gravity settles it afterwards). Coordinates are the planner's: x in columns, y in half-rows from
   the TOP.
   THE REDESIGN (Joey + Astra, 2026-10-16): the board is exactly the build's width, and placing works as in the 3D view -
   the armed size's "+" spots come from Build (the same list the 3D view draws), the ones past the build's edges sit in
   a margin outside it, and a click on a "+" places there. A drag is judged by Build's own move calculation, so its
   preview may go past the build's edges as far as the mount allows. */
import { el } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs = {}, parent = null) => { const n = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); if (parent) parent.appendChild(n); return n; };

/* opts: { state(), colors(), armed() -> { w, hh } | null, flagged() -> Set<id>, deficit() -> [{x,y}], selected() -> id|null,
          spots() -> [{ x, y }] the armed size's "+" spots, margin() -> columns of room each side,
          canMove(id, x, y) -> { ok, y } (y: where gravity settles it - the ghost is drawn there), topRoom() -> half-rows
          drawn above the grid so a unit taller than the headroom can be dragged on top, sections() -> separate runs,
          onSelect(id|null), onPlace(x, y), onMove(id, x, y), onGrid(op), labelOf(u) } */
export function board(opts) {
  const host = el('div.glass', { id: 'ws-board', role: 'group', 'aria-label': '2D board' });
  const head = el('div.bhead');
  const svg = svgEl('svg', { class: 'bsvg', preserveAspectRatio: 'xMidYMid meet' });
  host.append(head, svg);
  let cell = 56;           // px per 1W column; a half-row is cell * 28 / 88
  const half = () => cell * 28 / 88;
  const PAD = 18;
  let hover = null, drag = null, press = null, hoverSpot = null;
  // the drawn columns: the build's extent [x0, x1) and the margin [vL, vR) around it, in the grid's x
  let x0 = 0, x1 = 0, vL = 0, vR = 1, topR = 0, botR = 0;   // botR: half-rows drawn under the grid for the spots that grow a hanging build down
  let curSpots = [];   // the armed size's spots as last rendered (the pointer handlers read these, not a fresh list)

  function extent() {
    const st = opts.state(); const a = opts.armed(); const spots = a ? opts.spots() : []; curSpots = spots;
    if (st.placed.length) { x0 = Math.min(...st.placed.map((p) => p.x)); x1 = Math.max(...st.placed.map((p) => p.x + p.w)); }
    else { x0 = x1 = spots.length ? spots[0].x : 0; }
    const m = opts.margin ? opts.margin() : 0;
    topR = opts.topRoom ? opts.topRoom() : 0;
    vL = x0 - m; vR = x1 + m;
    botR = 0;
    for (const sp of spots) { vL = Math.min(vL, sp.x); vR = Math.max(vR, sp.x + a.w); botR = Math.max(botR, sp.y + a.hh - st.gridH * 2); }   // every "+" is on the drawing
    if (vR <= vL) vR = vL + 1;
    return { st, a, spots };
  }
  function layout() {
    const st = opts.state(); extent();
    const rows = st.gridH * 2; const cols = vR - vL;
    const availW = host.clientWidth - 2 * PAD, availH = host.clientHeight - head.offsetHeight - 2 * PAD - 8;
    cell = Math.max(28, Math.min(96, Math.floor(Math.min(availW / cols, availH / ((rows + topR + botR) * 28 / 88)))));
    const W = cols * cell + 2 * PAD, H = (rows + topR + botR) * half() + 2 * PAD;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
  }
  const px = (x) => PAD + (x - vL) * cell, py = (y) => PAD + (y + topR) * half();
  function cellAt(e) {
    // one uniform scale (meet): the drawing is the viewBox centred in the element, never stretched
    const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
    const k = Math.min(r.width / vb.width, r.height / vb.height); const ox = (r.width - vb.width * k) / 2, oy = (r.height - vb.height * k) / 2;
    const sx = (e.clientX - r.left - ox) / k, sy = (e.clientY - r.top - oy) / k;
    const fx = (sx - PAD) / cell + vL, fy = (sy - PAD) / half() - topR;
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
  }
  function unitAt(x, y) { return opts.state().placed.find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.hh) || null; }
  /* the "+" under the pointer: a spot whose footprint holds the pointer, the nearest centre first (wide sizes overlap),
     or failing that the nearest centre within a finger's reach (the narrow-screen check, 2026-10-16: a 1W·1H spot is
     about 35 x 20 px on a phone, under a comfortable touch target) */
  // a finger: a coarse pointer, OR the phone layout (html.ws-phone, < 1024 px) - a browser need not report the pointer
  // media for an emulated or hybrid touch device, and a phone-sized board wants finger-sized "+" either way
  const mq = (q) => { try { return matchMedia(q).matches; } catch { return false; } };
  const coarse = () => document.documentElement.classList.contains('ws-phone') || mq('(pointer: coarse)') || mq('(any-pointer: coarse)');
  const tapWord = () => (mq('(pointer: coarse)') ? 'Tap' : 'Click');   // the word follows the PRIMARY pointer (Terra 01a146d5)
  const REACH_PX = 24;
  function spotAt(c) {
    const a = opts.armed(); if (!a || !c) return null;
    let best = null, bd = Infinity, near = null, nd = Infinity;
    for (const sp of curSpots) {
      const dpx = Math.hypot((c.fx - (sp.x + a.w / 2)) * cell, (c.fy - (sp.y + a.hh / 2)) * half());
      if (c.fx >= sp.x && c.fx < sp.x + a.w && c.fy >= sp.y && c.fy < sp.y + a.hh) { if (dpx < bd) { bd = dpx; best = sp; } }
      else if (dpx <= REACH_PX && dpx < nd) { nd = dpx; near = sp; }
    }
    return best || near;
  }

  function render() {
    const { st, a, spots } = extent(); const rows = st.gridH * 2; const c = opts.colors();
    layout();
    const span = st.placed.length ? x1 - x0 : 0;
    head.replaceChildren(...[   // (a tabletop has no height buttons: a null child would print as "null")
      el('span.bttl', { text: span ? `Board · ${span}W × ${st.gridH}H${opts.sections && opts.sections() > 1 ? ` · ${opts.sections()} separate sections` : ''}` : 'Board · empty' }),
      el('span.bhint', { text: a ? (spots.length ? `${tapWord()} a + to place · past either edge widens the build${st.mount === 'tabletop' ? '' : ', below it adds height'}` : 'No spot for this size · the mount’s limits, or nothing free beside the build')
        : (st.mount === 'tabletop' ? 'Stacks from the surface up · drag a unit to move it, past either edge too' : 'Hangs from the top row · drag a unit to move it, past either edge too') }),
      st.mount === 'tabletop' ? null : el('div.bgrid', {}, [
        el('button.key.sm', { text: 'H−', title: 'Shorter grid', onclick: () => opts.onGrid('h-') }),
        el('button.key.sm', { text: 'H+', title: 'Taller grid', onclick: () => opts.onGrid('h+') }),
      ]),
    ].filter(Boolean));
    svg.replaceChildren();
    const defs = svgEl('defs', {}, svg);
    const pat = svgEl('pattern', { id: 'b-hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 8, class: 'b-hatch' }, pat);
    // the grid: hairlines per column and half-row OVER THE BUILD ONLY (the margin is room, not grid); the mount edge heavier
    if (span) {
      const g = svgEl('g', { class: 'b-grid' }, svg);
      for (let x = x0; x <= x1; x++) svgEl('line', { x1: px(x), y1: py(0), x2: px(x), y2: py(rows) }, g);
      for (let y = 0; y <= rows; y++) svgEl('line', { x1: px(x0), y1: py(y), x2: px(x1), y2: py(y), class: y % 2 ? 'half' : null }, g);
    }
    const edgeY = st.mount === 'tabletop' ? py(rows) : py(0);
    svgEl('line', { x1: px(vL) - 6, y1: edgeY, x2: px(vR) + 6, y2: edgeY, class: 'b-mount' }, svg);
    svgEl('text', { x: px(vR) + 6, y: edgeY + (st.mount === 'tabletop' ? 14 : -5), class: 'b-mount-lbl', 'text-anchor': 'end' }, svg).textContent = st.mount === 'tabletop' ? 'table surface' : st.mount === 'wall' ? 'wall bracket row' : 'underside of the table';
    // the tabletop deficit: hatched cells (the Dock's "one area left to fill" says the same)
    for (const d of opts.deficit()) svgEl('rect', { x: px(d.x) + 2, y: py(d.y) + 2, width: cell - 4, height: half() - 4, rx: 3, class: 'b-deficit', fill: 'url(#b-hatch)' }, svg);
    // the units
    const sel = opts.selected(), flagged = opts.flagged();
    for (const u of st.placed) {
      const isSel = u.id === sel, isDrag = drag && drag.id === u.id && drag.moved;
      const ug = svgEl('g', { class: 'b-unit' + (isSel ? ' sel' : '') + (isDrag ? ' dragging' : ''), 'data-id': u.id }, svg);
      const x = px(u.x) + 1.5, y = py(u.y) + 1.5, w = u.w * cell - 3, h = u.hh * half() - 3;
      const front = u.fill === 'classic' ? c.front : u.fill === 'shelf' ? c.body : c.front;
      svgEl('rect', { x, y, width: w, height: h, rx: 5, fill: c.body, class: 'b-body' }, ug);
      const inset = Math.max(2, cell * 0.05);
      if (u.fill === 'shelf') {
        svgEl('rect', { x: x + inset, y: y + inset, width: w - 2 * inset, height: h - 2 * inset, rx: 3, fill: c.body, class: 'b-shelf' }, ug);
        svgEl('rect', { x: x + inset, y: y + h - inset - Math.max(3, h * 0.14), width: w - 2 * inset, height: Math.max(3, h * 0.14), rx: 1.5, fill: c.front }, ug);
      } else {
        svgEl('rect', { x: x + inset, y: y + inset, width: w - 2 * inset, height: h - 2 * inset, rx: 3, fill: front }, ug);
        if (u.fill === 'classic') svgEl('rect', { x: x + w * 0.3, y: y + inset + 1.5, width: w * 0.4, height: Math.max(3, h * 0.16), rx: 2, fill: c.body, opacity: .55 }, ug);
        else svgEl('rect', { x: x + w * 0.3, y: y + h / 2 - 2, width: w * 0.4, height: 4, rx: 2, fill: c.handle }, ug);
      }
      const lbl = opts.labelOf ? opts.labelOf(u) : '';
      svgEl('text', { x: x + w / 2, y: y + h - Math.max(6, h * 0.16), class: 'b-cap', 'text-anchor': 'middle' }, ug).textContent = `${u.w}W·${u.hh / 2}H${lbl ? ' · ' + lbl : ''}`;
      if (flagged.has(u.id)) {
        svgEl('rect', { x: x - 1, y: y - 1, width: w + 2, height: h + 2, rx: 6, class: 'b-flag' }, ug);
        const bx = x + w - 2, by = y + 2;
        svgEl('circle', { cx: bx, cy: by, r: 9, class: 'b-flag-dot' }, ug);
        svgEl('text', { x: bx, y: by + 4, class: 'b-flag-txt', 'text-anchor': 'middle' }, ug).textContent = '!';
      }
      if (isSel) svgEl('rect', { x: x - 2, y: y - 2, width: w + 4, height: h + 4, rx: 7, class: 'b-sel' }, ug);
      if (flashing.has(u.id)) svgEl('rect', { x: x - 3, y: y - 3, width: w + 6, height: h + 6, rx: 8, class: 'b-pulse' }, ug);
    }
    // the "+" spots: the 3D view's list, one amber disc at each footprint's centre; a refused cell beside the build
    // (kind "no", 2026-10-20) is a muted disc with a bar, and a tap on it says why (opts.onRefused)
    if (a) for (const sp of spots) {
      const cx = px(sp.x) + a.w * cell / 2, cy = py(sp.y) + a.hh * half() / 2, r = Math.max(coarse() ? 15 : 9, Math.min(cell, a.hh * half()) * 0.26);   // 30 px discs for a finger
      const no = sp.kind === 'no';
      const g = svgEl('g', { class: 'b-spot' + (no ? ' no' : ''), 'data-x': sp.x, 'data-y': sp.y }, svg);
      if (no && sp.why) svgEl('title', {}, g).textContent = sp.why;
      svgEl('circle', { cx, cy, r }, g);
      svgEl('path', { d: no ? `M${cx - r * 0.5} ${cy}H${cx + r * 0.5}` : `M${cx - r * 0.5} ${cy}H${cx + r * 0.5}M${cx} ${cy - r * 0.5}V${cy + r * 0.5}`, class: 'b-spot-plus' }, g);
    }
    renderGhost();
  }
  let ghost = null;
  function renderGhost() {
    if (ghost) { ghost.remove(); ghost = null; }
    svg.querySelectorAll('.b-spot.on').forEach((n) => n.classList.remove('on'));
    const st = opts.state();
    if (drag && drag.moved) {
      const u = st.placed.find((p) => p.id === drag.id); if (!u) return;
      // the ghost shows the FINAL position: where gravity settles the unit, not where the pointer is
      const res = opts.canMove(drag.id, drag.tx, drag.ty); const gy = res.ok ? res.y : drag.ty;
      ghost = svgEl('rect', { x: px(drag.tx) + 1.5, y: py(gy) + 1.5, width: u.w * cell - 3, height: u.hh * half() - 3, rx: 5, class: 'b-ghost ' + (res.ok ? 'ok' : 'no') }, svg);
      return;
    }
    const a = opts.armed();
    hoverSpot = a && hover && !drag ? spotAt(hover) : null;
    if (!hoverSpot) return;
    ghost = svgEl('rect', { x: px(hoverSpot.x) + 1.5, y: py(hoverSpot.y) + 1.5, width: a.w * cell - 3, height: a.hh * half() - 3, rx: 5, class: 'b-ghost ' + (hoverSpot.kind === 'no' ? 'no' : 'ok') }, svg);   // a refused cell's ghost is the red one, never the green
    svg.insertBefore(ghost, svg.querySelector('.b-spot'));   // the ghost under the "+" discs
    const on = svg.querySelector(`.b-spot[data-x="${hoverSpot.x}"][data-y="${hoverSpot.y}"]`); if (on) on.classList.add('on');
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const c = cellAt(e); const u = unitAt(c.x, c.y);
    if (u) { drag = { id: u.id, dx: c.x - u.x, dy: c.y - u.y, tx: u.x, ty: u.y, moved: false, sx: e.clientX, sy: e.clientY }; press = null; try { svg.setPointerCapture(e.pointerId); } catch { /* none */ } }
    else press = c;
  });
  svg.addEventListener('pointermove', (e) => {
    const c = cellAt(e);
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) { drag.moved = true; render(); }
      if (drag.moved) {
        // the preview stays on the drawing: the build's width plus the room the mount allows each side
        const st = opts.state(); const u = st.placed.find((p) => p.id === drag.id);
        drag.tx = Math.max(vL, Math.min(vR - (u ? u.w : 1), c.x - drag.dx));
        drag.ty = Math.max(-topR, Math.min(st.gridH * 2 - (u ? u.hh : 1), c.y - drag.dy));
        renderGhost();
      }
      return;
    }
    hover = c; renderGhost();
  });
  svg.addEventListener('pointerup', (e) => {
    const c = cellAt(e);
    if (drag) {
      const d = drag; drag = null;
      if (d.moved) opts.onMove(d.id, d.tx, d.ty);
      else opts.onSelect(opts.selected() === d.id ? null : d.id);
      return;
    }
    if (press && press.x === c.x && press.y === c.y) {
      if (opts.armed()) { const sp = spotAt(c); if (sp && sp.kind === 'no') { if (opts.onRefused) opts.onRefused(sp); } else if (sp) opts.onPlace(sp.x, sp.y); }
      else opts.onSelect(null);
    }
    press = null;
  });
  svg.addEventListener('pointerleave', () => { hover = null; if (drag) { drag = null; render(); } else renderGhost(); });
  let flashing = new Set();
  function flash(ids) { flashing = new Set(ids); render(); setTimeout(() => { flashing = new Set(); render(); }, 1500); }
  return { el: host, render, layout, flash, cancel() { drag = null; press = null; hover = null; hoverSpot = null; } };
}
