/* The 2D board (the brief §2: "the 2D board stays as a view inside Build", SVG, to scale at 88:28). A glass panel
   over the stage's free region drawing the planner's grid: units as fronts in the live colours, the selection in
   orange, the issue card's units in dashed amber with a "!" badge, the tabletop deficit hatched, the armed size as
   a ghost under the pointer (green where it can go, red where it cannot). Press-and-release on a unit selects it,
   a drag moves it (the planner's rule: any free cell; gravity settles it afterwards), a clean click on empty cells
   places the armed size. Coordinates are the planner's: x in columns, y in half-rows from the TOP. */
import { el } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs = {}, parent = null) => { const n = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); if (parent) parent.appendChild(n); return n; };

/* opts: { state(), colors(), armed() -> { w, hh } | null, flagged() -> Set<id>, deficit() -> [{x,y}], selected() -> id|null,
          onSelect(id|null), onPlace(x, y), onMove(id, x, y), onGrid(op), labelOf(u) } */
export function board(opts) {
  const host = el('div.glass', { id: 'ws-board', role: 'group', 'aria-label': '2D board' });
  const head = el('div.bhead');
  const svg = svgEl('svg', { class: 'bsvg', preserveAspectRatio: 'xMidYMid meet' });
  host.append(head, svg);
  let cell = 56;           // px per 1W column; a half-row is cell * 28 / 88
  const half = () => cell * 28 / 88;
  const PAD = 18;
  let hover = null, drag = null, press = null;

  function layout() {
    const st = opts.state();
    const rows = st.gridH * 2;
    const availW = host.clientWidth - 2 * PAD, availH = host.clientHeight - head.offsetHeight - 2 * PAD - 8;
    cell = Math.max(28, Math.min(96, Math.floor(Math.min(availW / st.gridW, availH / (rows * 28 / 88)))));
    const W = st.gridW * cell + 2 * PAD, H = rows * half() + 2 * PAD;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
  }
  const px = (x) => PAD + x * cell, py = (y) => PAD + y * half();
  function cellAt(e) {
    // one uniform scale (meet): the drawing is the viewBox centred in the element, never stretched
    const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
    const k = Math.min(r.width / vb.width, r.height / vb.height); const ox = (r.width - vb.width * k) / 2, oy = (r.height - vb.height * k) / 2;
    const sx = (e.clientX - r.left - ox) / k, sy = (e.clientY - r.top - oy) / k;
    return { x: Math.floor((sx - PAD) / cell), y: Math.floor((sy - PAD) / half()) };
  }
  function unitAt(x, y) { return opts.state().placed.find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.hh) || null; }

  function render() {
    const st = opts.state(); const rows = st.gridH * 2; const c = opts.colors();
    layout();
    head.replaceChildren(
      el('span.bttl', { text: `Board · ${st.gridW}W × ${st.gridH}H` }),
      el('span.bhint', { text: st.mount === 'tabletop' ? 'Stacks from the surface up · height follows the build' : 'Hangs from the top row' }),
      el('div.bgrid', {}, [
        el('button.key.sm', { text: 'W−', title: 'Narrower grid', onclick: () => opts.onGrid('w-') }), el('button.key.sm', { text: 'W+', title: 'Wider grid', onclick: () => opts.onGrid('w+') }),
        st.mount === 'tabletop' ? null : el('button.key.sm', { text: 'H−', title: 'Shorter grid', onclick: () => opts.onGrid('h-') }),
        st.mount === 'tabletop' ? null : el('button.key.sm', { text: 'H+', title: 'Taller grid', onclick: () => opts.onGrid('h+') }),
      ]),
    );
    svg.replaceChildren();
    const defs = svgEl('defs', {}, svg);
    const pat = svgEl('pattern', { id: 'b-hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 8, class: 'b-hatch' }, pat);
    // the grid: hairlines per column and half-row, the mount edge heavier
    const g = svgEl('g', { class: 'b-grid' }, svg);
    for (let x = 0; x <= st.gridW; x++) svgEl('line', { x1: px(x), y1: py(0), x2: px(x), y2: py(rows) }, g);
    for (let y = 0; y <= rows; y++) svgEl('line', { x1: px(0), y1: py(y), x2: px(st.gridW), y2: py(y), class: y % 2 ? 'half' : null }, g);
    const edgeY = st.mount === 'tabletop' ? py(rows) : py(0);
    svgEl('line', { x1: px(0) - 6, y1: edgeY, x2: px(st.gridW) + 6, y2: edgeY, class: 'b-mount' }, svg);
    svgEl('text', { x: px(st.gridW) + 6, y: edgeY + (st.mount === 'tabletop' ? 14 : -5), class: 'b-mount-lbl', 'text-anchor': 'end' }, svg).textContent = st.mount === 'tabletop' ? 'table surface' : st.mount === 'wall' ? 'wall bracket row' : 'underside of the table';
    // the tabletop deficit: hatched cells
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
    }
    renderGhost();
  }
  let ghost = null;
  function renderGhost() {
    if (ghost) { ghost.remove(); ghost = null; }
    const st = opts.state();
    if (drag && drag.moved) {
      const u = st.placed.find((p) => p.id === drag.id); if (!u) return;
      const ok = opts.canPlace(drag.tx, drag.ty, u.w, u.hh, u.id);
      ghost = svgEl('rect', { x: px(drag.tx) + 1.5, y: py(drag.ty) + 1.5, width: u.w * cell - 3, height: u.hh * half() - 3, rx: 5, class: 'b-ghost ' + (ok ? 'ok' : 'no') }, svg);
      return;
    }
    const a = opts.armed();
    if (!a || !hover || drag || unitAt(hover.x, hover.y)) return;
    const ok = opts.canPlace(hover.x, hover.y, a.w, a.hh);
    ghost = svgEl('rect', { x: px(hover.x) + 1.5, y: py(hover.y) + 1.5, width: a.w * cell - 3, height: a.hh * half() - 3, rx: 5, class: 'b-ghost ' + (ok ? 'ok' : 'no') }, svg);
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
      if (drag.moved) { drag.tx = c.x - drag.dx; drag.ty = c.y - drag.dy; renderGhost(); }
      return;
    }
    if (!hover || hover.x !== c.x || hover.y !== c.y) { hover = c; renderGhost(); }
  });
  svg.addEventListener('pointerup', (e) => {
    const c = cellAt(e);
    if (drag) {
      const d = drag; drag = null;
      if (d.moved) opts.onMove(d.id, d.tx, d.ty);
      else opts.onSelect(opts.selected() === d.id ? null : d.id);
      return;
    }
    if (press && press.x === c.x && press.y === c.y) { if (opts.armed()) opts.onPlace(c.x, c.y); else opts.onSelect(null); }
    press = null;
  });
  svg.addEventListener('pointerleave', () => { hover = null; if (drag) { drag = null; render(); } else renderGhost(); });
  return { el: host, render, layout, cancel() { drag = null; press = null; hover = null; } };
}
