/* The parts drawer's 2D plan (M2, 2026-11-05): the main editing surface (SPEC "Edit mode", Joey 2026-10-22), a glass
   panel over the stage's free region like the Build board (js/ui/board.js), drawing the drawer's cavity top-down with the
   front at the bottom, to scale in mm: the compartments, their ramps and label holders (white strips: the brief's rule
   for labels), the floor colours in paint mode, each compartment's clear size in the measurement colour, and the
   compartments too deep to reach in the warning amber. Ported from the prototype's drawPlan (docs/parts-drawer/
   prototype/index.html), in the planner's tokens; the parts, cells, lid and covers it drew wait for M3.
   Interaction, as the prototype's: press and drag across compartments selects them (a box closed under touching, so
   it always merges); a wall is dragged with its chain (Shift: the whole line; Alt: no snapping), snapping to 0.5 mm
   steps, other walls and a label's exact fit; a double click toggles the label holders of the selection. The plan
   shows a wall drag as it goes (its own preview of the compartments) and commits it at the end. */
import { el } from '../ui/dom.js';
import * as G from './gen.js';

const NS = 'http://www.w3.org/2000/svg';
const EPS = 1e-6, WALL = G.C.WALL;
const fmt = (v) => v.toFixed(1);
const svgEl = (tag, attrs = {}, parent = null) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); if (parent) parent.appendChild(n); return n; };
const PAD = { l: 18, r: 8, t: 14, b: 22 };

/* the plan of a full layout (unit.js fullLayout) drawn into an <svg>: `sel` the selection box (mm) or null, `hot` a wall
   highlight { orient, c, segs, J, drag?, from? } or null, `flags` the reach flags, `hover` a hovered compartment */
export function drawPlan(svg, full, { sel = null, hot = null, flags = [], hover = null, comps = full.comps } = {}) {
  const S = G.SIZES[full.size], L = { ...full, comps };
  svg.replaceChildren();
  svg.setAttribute('viewBox', `${-2 - PAD.l} ${-4 - PAD.t} ${S.W + 4 + PAD.l + PAD.r} ${S.D + 8.3 + PAD.t + PAD.b}`);   // the shell: 2 each side, 4.3 in front, 4 behind
  const Y = (y) => S.D - y;   // drawer y (front = 0) -> svg y (front at bottom)
  const rect = (cls, x0, x1, y0, y1, extra = {}) => svgEl('rect', { class: cls, x: x0, y: Y(y1), width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0), ...extra }, svg);
  svgEl('rect', { class: 'shell', x: -2, y: Y(S.D + 4), width: S.W + 4, height: S.D + 8.3, rx: 1.2 }, svg);
  svgEl('rect', { class: 'cavity', x: 0, y: 0, width: S.W, height: S.D }, svg);
  const H = G.holderOf(L), HD = H.D;
  const inSel = (c) => !!sel && G.inBox(c, sel);
  comps.forEach((c, i) => {
    const w = c.x1 - c.x0, d = c.y1 - c.y0;
    rect('cell' + (inSel(c) ? ' sel' : hover === c ? ' hov' : ''), c.x0, c.x1, c.y0, c.y1, { 'data-i': i });
    const s = G.scoopSize(L, c), t = G.traySize(L, c);
    const fk = G.floorColorOf(L, c);
    let ink = null;
    if (fk) {
      const r = G.floorRegion(L, c), hex = L.floor.colors[fk - 1]; rect('floorfill', r.x0, r.x1, r.y0, r.y1, { fill: hex });
      const [R, Gr, B] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
      ink = 0.2126 * R + 0.7152 * Gr + 0.0722 * B > 0.5 ? '#1D1E20' : '#F4F4F5';
    }
    if (s) rect('ramp', c.x0, c.x1, c.y0, c.y0 + s);
    if (t) { rect('ramp', c.x0, c.x0 + t, c.y0 + s, c.y1); rect('ramp', c.x1 - t, c.x1, c.y0 + s, c.y1); rect('ramp', c.x0 + t, c.x1 - t, c.y1 - t, c.y1); }
    if (flags[i]) rect('deep', c.x0 + 0.4, c.x1 - 0.4, c.y0 + 0.4, c.y1 - 0.4);
    if (c.holder) {
      const hs = G.holderStatus(L, c);
      if (hs.ok) {
        rect('holder', c.x0, c.x0 + G.C.HOLDER_W, c.y1 - HD, c.y1);
        rect('labelstrip', c.x0 + 0.36, c.x0 + 0.36 + H.label[0], c.y1 - H.label[1], c.y1, { rx: 0.4 });
        if (w > G.C.HOLDER_W + EPS) {
          const xc = c.x0 + G.C.HOLDER_W;
          if (w < G.C.HOLDER_W + G.C.END_FILL) rect('wallfill', xc, c.x1, c.y1 - HD, c.y1);
          else {
            rect('wallfill', xc, xc + WALL, c.y1 - HD, c.y1);
            const xa = xc + WALL, xb = Math.min(xa + HD, c.x1), yb = c.y1 - HD + (xb - xa);
            svgEl('polygon', { class: 'gusset', points: `${xa},${Y(c.y1 - HD)} ${xb},${Y(yb)} ${xb},${Y(c.y1)} ${xa},${Y(c.y1)}` }, svg);
          }
        }
      } else svgEl('rect', { class: 'nofit', x: c.x0 + 0.6, y: Y(c.y1) + 0.6, width: Math.min(G.C.HOLDER_W, w) - 1.2, height: Math.min(HD, d) - 1.2 }, svg);
    }
    // the clear size, between the scoop and the holder
    const fs = Math.max(3.2, Math.min(5.2, w / 7));
    const top = c.y1 - (c.holder && G.holderStatus(L, c).ok ? Math.min(HD, d / 2) : 0), bot = c.y0 + s;
    const cyMid = Y((top + bot) / 2);
    const style = ink ? { style: `fill:${ink}` } : {};
    if (top - bot < (w >= 40 ? fs * 1.4 : fs * 2.6)) { /* no room */ }
    else if (w >= 40) svgEl('text', { class: 'dim', x: c.x0 + w / 2, y: cyMid, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fs, ...style }, svg).textContent = `${fmt(w)} × ${fmt(d)}`;
    else {
      svgEl('text', { class: 'dim', x: c.x0 + w / 2, y: cyMid - fs * 0.6, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fs, ...style }, svg).textContent = fmt(w);
      svgEl('text', { class: 'dim small', x: c.x0 + w / 2, y: cyMid + fs * 0.6, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fs, ...(ink ? { style: `fill:${ink};opacity:.75` } : {}) }, svg).textContent = '× ' + fmt(d);
    }
  });
  if (sel) for (const c of comps) if (inSel(c)) rect('selring', c.x0, c.x1, c.y0, c.y1);
  if (hot) {
    for (const [a, b] of hot.segs) {
      if (hot.orient === 'v') rect('wallhot' + (hot.drag ? ' drag' : ''), hot.c - WALL / 2, hot.c + WALL / 2, Math.max(a, 0), Math.min(b, S.D));
      else rect('wallhot' + (hot.drag ? ' drag' : ''), Math.max(a, 0), Math.min(b, S.W), hot.c - WALL / 2, hot.c + WALL / 2);
    }
    if (hot.drag && Math.abs(hot.c - hot.from) > EPS) {
      const dlt = hot.c - hot.from, mid = (hot.J[0] + hot.J[1]) / 2;
      const t = `${dlt > 0 ? '+' : '−'}${fmt(Math.abs(dlt))}`;
      if (hot.orient === 'v') svgEl('text', { class: 'delta', x: hot.c, y: Y(Math.min(Math.max(mid, 8), S.D - 8)), 'text-anchor': 'middle', 'font-size': 5, dy: -3 }, svg).textContent = t;
      else svgEl('text', { class: 'delta', x: Math.min(Math.max(mid, 10), S.W - 10), y: Y(hot.c), 'text-anchor': 'middle', 'font-size': 5, dy: -2.4 }, svg).textContent = t;
    }
  }
  // overall dimensions, shop-drawing style, in the measurement colour
  const yb = Y(-4.3) + 8;
  svgEl('path', { class: 'axis', d: `M0 ${yb - 2}V${yb + 2}M${S.W} ${yb - 2}V${yb + 2}M0 ${yb}H${S.W}` }, svg);
  svgEl('text', { class: 'axis-t', x: S.W / 2, y: yb - 1.6, 'text-anchor': 'middle' }, svg).textContent = `${fmt(S.W)} clear`;
  const xl = -2 - 8;
  svgEl('path', { class: 'axis', d: `M${xl - 2} 0H${xl + 2}M${xl - 2} ${S.D}H${xl + 2}M${xl} 0V${S.D}` }, svg);
  svgEl('text', { class: 'axis-t', x: xl - 1.6, y: S.D / 2, 'text-anchor': 'middle', transform: `rotate(-90 ${xl - 1.6} ${S.D / 2})` }, svg).textContent = `${fmt(S.D)} clear`;
  svgEl('text', { class: 'face-t', x: S.W / 2, y: Y(-4.3) + 17, 'text-anchor': 'middle' }, svg).textContent = 'FRONT';
  svgEl('text', { class: 'face-t', x: S.W / 2, y: Y(S.D + 4) - 4, 'text-anchor': 'middle' }, svg).textContent = 'BACK';
}
/* a static thumbnail of a layout (the unit Inspector's), the same drawing in a small box */
export function planThumb(full, { width = 120, height = 93 } = {}) {
  const svg = svgEl('svg', { class: 'pd-thumb', width, height, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
  drawPlan(svg, full);
  for (const n of svg.querySelectorAll('.dim, .axis, .axis-t, .face-t')) n.remove();
  return svg;
}

/* the panel: opts { full() -> the full layout, selected() -> box | null, flags() -> bool[], onSelect(box | null),
   onWalls(comps) (a wall drag's result), onHolder(), onHover?(comp | null) } */
export function plan(opts) {
  const host = el('div.glass', { id: 'ws-plan', role: 'group', 'aria-label': 'Compartment plan' });
  const head = el('div.bhead', {}, [el('span.bttl', { text: 'Plan · mm' }), el('span.bhint', { text: 'Drag across compartments to select · drag a wall to move it (Shift: the whole line, Alt: no snap) · double-click: label holder' })]);
  const svg = svgEl('svg', { class: 'bsvg', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Top-down plan of the drawer layout, front edge at the bottom' });
  host.append(head, svg);
  let drag = null, wdrag = null, hover = null, hoverKey = '', hoverComp = null, lastPt = null;
  const full = () => opts.full();
  const comps = () => (wdrag ? wdrag.comps : full().comps);
  const mmPerPx = () => { const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal; return r.width ? Math.max(vb.width / r.width, vb.height / r.height) : 0.3; };
  function planPoint(evt) {
    const p = svg.createSVGPoint(); p.x = evt.clientX; p.y = evt.clientY;
    const m = p.matrixTransform(svg.getScreenCTM().inverse());
    return { x: m.x, y: G.SIZES[full().size].D - m.y };
  }
  // the compartment under a plan point; walls count toward the nearer side
  function compAt(pt) {
    const S = G.SIZES[full().size];
    if (pt.x < -2 || pt.x > S.W + 2 || pt.y < -4.3 || pt.y > S.D + 4) return null;
    let best = null, bd = Infinity;
    for (const c of comps()) { const dx = Math.max(c.x0 - pt.x, 0, pt.x - c.x1), dy = Math.max(c.y0 - pt.y, 0, pt.y - c.y1), dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = c; } }
    return best;
  }
  const closure = (r) => G.closeBox(comps(), { ...r });
  function hitWall(pt, e) {
    const tol = Math.max(1.1, (e.pointerType === 'touch' ? 10 : 5) * mmPerPx());
    const w = G.wallAt(comps(), full().size, pt, tol); if (!w) return null;
    const ch = G.wallChain(comps(), w.orient, w.c, w.seed, e.shiftKey);
    return ch && ch.range[0] <= ch.range[1] + EPS ? ch : null;
  }
  function magnets(ch, list) {
    const a = ch.orient === 'v' ? 'x' : 'y', m = [];
    for (const k of list) m.push(k[a + '0'] - WALL / 2, k[a + '1'] + WALL / 2);
    const fit = ch.orient === 'v' ? G.C.HOLDER_W : G.holderOf(full()).MIN_DEPTH;
    for (const i of ch.L) m.push(list[i][a + '0'] + fit + WALL / 2);
    for (const i of ch.R) m.push(list[i][a + '1'] - fit - WALL / 2);
    return m;
  }
  function snapWall(ch, raw, free) {
    let c = raw;
    if (!free) {
      c = ch.c + Math.round((raw - ch.c) / 0.5) * 0.5;
      const tol = Math.max(0.8, 4 * mmPerPx()); let best = null;
      for (const m of ch.mags) if (Math.abs(m - raw) <= tol && (best === null || Math.abs(m - raw) < Math.abs(best - raw))) best = m;
      if (best !== null) c = best;
    }
    return G.snapMM(Math.min(ch.range[1], Math.max(ch.range[0], c)));
  }
  const along = (ch, pt) => (ch.orient === 'v' ? pt.x : pt.y);
  const hotOf = () => (wdrag ? { ...wdrag.ch, c: wdrag.c, drag: true, from: wdrag.ch.c } : hover);
  function render() {
    drawPlan(svg, full(), { sel: opts.selected(), hot: hotOf(), flags: opts.flags ? opts.flags() : [], hover: hoverComp, comps: comps() });
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const pt = planPoint(e);
    const ch = hitWall(pt, e);
    if (ch) {
      const start = comps().map((c) => ({ ...c }));
      wdrag = { ch: { ...ch, mags: magnets(ch, start) }, start, comps: start, grab: along(ch, pt) - ch.c, c: ch.c };
      hover = null; svg.setPointerCapture(e.pointerId); render(); return;
    }
    const c = compAt(pt); if (!c) { opts.onSelect(null); render(); return; }
    drag = c; svg.setPointerCapture(e.pointerId);
    opts.onSelect(closure(G.compBox(c))); render();
  });
  svg.addEventListener('pointermove', (e) => {
    const pt = planPoint(e); lastPt = { pt, pointerType: e.pointerType };
    if (wdrag) {
      const c = snapWall(wdrag.ch, along(wdrag.ch, pt) - wdrag.grab, e.altKey);
      if (c !== wdrag.c) { wdrag.c = c; wdrag.comps = G.moveChain(wdrag.start, wdrag.ch, c); render(); }
      return;
    }
    if (drag) { const c = compAt(pt); if (c) { opts.onSelect(closure(G.boxOf([drag, c]))); render(); } return; }
    const ch = e.pointerType === 'touch' ? null : hitWall(pt, e);
    const k = ch ? `${ch.orient}${ch.c}:${ch.L.join(',')}` : '';
    const hc = ch ? null : compAt(pt);
    if (k !== hoverKey || hc !== hoverComp) { hover = ch; hoverKey = k; hoverComp = hc; svg.style.cursor = ch ? (ch.orient === 'v' ? 'ew-resize' : 'ns-resize') : hc ? 'pointer' : ''; if (opts.onHover) opts.onHover(hc); render(); }
  });
  function endDrag() {
    if (wdrag) {
      const moved = Math.abs(wdrag.c - wdrag.ch.c) > EPS, out = wdrag.comps; wdrag = null;
      if (moved) opts.onWalls(out); else render();
      return;
    }
    drag = null;
  }
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('pointerleave', () => { lastPt = null; if (!wdrag && (hover || hoverComp)) { hover = null; hoverKey = ''; hoverComp = null; svg.style.cursor = ''; if (opts.onHover) opts.onHover(null); render(); } });
  svg.addEventListener('dblclick', () => { if (opts.selected()) opts.onHolder(); });
  // Shift changes what a wall drag will move, so the highlight follows it
  const shiftWatch = (e) => {
    if (e.key !== 'Shift' || wdrag || drag || !lastPt || lastPt.pointerType === 'touch' || !host.isConnected || host.hidden) return;
    const ch = hitWall(lastPt.pt, { pointerType: lastPt.pointerType, shiftKey: e.type === 'keydown' });
    const k = ch ? `${ch.orient}${ch.c}:${ch.L.join(',')}` : '';
    if (k !== hoverKey) { hover = ch; hoverKey = k; render(); }
  };
  document.addEventListener('keydown', shiftWatch); document.addEventListener('keyup', shiftWatch);
  return {
    el: host, render,
    cancel() { if (wdrag) { wdrag = null; render(); } drag = null; },
    destroy() { document.removeEventListener('keydown', shiftWatch); document.removeEventListener('keyup', shiftWatch); host.remove(); },
  };
}
