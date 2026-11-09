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
import { howToCard, howToSeen, markHowToSeen } from './guide.js';   // the gesture clips as a first-time tip card (2026-11-06)
import { hitWall as wallHit, startWallDrag, moveWallDrag, dragMoved, chainKey } from './walls.js';   // a wall drag's rules, shared with the 3D view
import * as I from './inventory.js';
import { outlinesOf } from './unit.js';

const NS = 'http://www.w3.org/2000/svg';
const EPS = 1e-6, WALL = G.C.WALL;
const fmt = (v) => v.toFixed(1);
const svgEl = (tag, attrs = {}, parent = null) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); if (parent) parent.appendChild(n); return n; };
const PAD = { l: 18, r: 8, t: 14, b: 22 };
/* THE CONTENTS PREVIEW'S GLYPH (2026-11-09, consult Sol 01a1c0ec): a simple view of the part, drawn from its form
   (inventory.js partForm, its real dimensions): a screw from the side, its head socket, button, countersunk or none, the shank
   with a hint of thread; a nut, a nyloc (its nylon ring) and a washer from the face; an insert from the side, knurled. 'actual'
   draws it at 1:1, the plan's own millimetres (the default: Joey wanted the real size); 'large' fills most of the clear floor
   (never past 34 mm) for recognition, and the header then says not to scale. Laid along its longer side. Returns whether it drew. */
function drawGlyph(svg, f, hex, r0, Y, mode = 'actual', c = null) {
  const side = f.kind === 'screw' || f.kind === 'insert';
  const long = f.kind === 'screw' ? f.k + f.L : f.kind === 'insert' ? f.L : f.kind === 'washer' ? f.od : (f.s * 2) / Math.sqrt(3);
  const wide = f.kind === 'screw' ? Math.max(f.dk, f.d) : f.kind === 'insert' ? f.od : long;
  const fits = (q) => { const w = q.x1 - q.x0, d = q.y1 - q.y0, al = side && d > w; return (al ? d : w) >= long - 1e-6 && (al ? w : d) >= wide - 1e-6; };
  // the clear floor first; a part too big for it at real size takes the whole compartment, and one too big for that is drawn
  // in the warning colour (it would not lie in it), never shrunk (Sol 01a1c100)
  const whole = c ? { x0: c.x0 + 0.5, x1: c.x1 - 0.5, y0: c.y0 + 0.5, y1: c.y1 - 0.5 } : r0;
  const r = mode === 'large' || fits(r0) ? r0 : whole, over = mode !== 'large' && !fits(whole);
  const rw = r.x1 - r.x0, rd = r.y1 - r.y0; if (rw < 4 || rd < 4 || (mode === 'large' && (rw < 8 || rd < 8))) return false;
  const along = side && rd > rw, RL = along ? rd : rw, RS = along ? rw : rd;
  const k = mode === 'large' ? Math.max(1, Math.min(0.72 * RL / long, 0.62 * RS / wide, 34 / long)) : 1;   // enlarged: never below real size
  const g = svgEl('g', { class: 'glyph' + (over ? ' over' : ''), 'aria-hidden': 'true', transform: `translate(${((r.x0 + r.x1) / 2).toFixed(2)} ${Y((r.y0 + r.y1) / 2).toFixed(2)}) rotate(${along ? 90 : 0}) scale(${k.toFixed(4)})` }, svg);
  const part = { fill: hex, class: 'gpart' }, hole = { class: 'ghole' }, line = { class: 'gline' };
  const hexPts = (R) => [0, 1, 2, 3, 4, 5].map((i) => `${(R * Math.cos(Math.PI / 3 * i)).toFixed(3)},${(R * Math.sin(Math.PI / 3 * i)).toFixed(3)}`).join(' ');
  if (f.kind === 'screw') {
    const x0 = -(f.k + f.L) / 2, xs = x0 + f.k;
    svgEl('rect', { x: xs, y: -f.d / 2, width: f.L, height: f.d, ...part }, g);
    for (let x = xs + f.d * 0.35; x < xs + f.L - f.d * 0.2; x += Math.max(0.35, f.d * 0.42)) svgEl('line', { x1: x, y1: -f.d / 2, x2: x + f.d * 0.22, y2: f.d / 2, ...line }, g);
    if (f.head === 'socket') { svgEl('rect', { x: x0, y: -f.dk / 2, width: f.k, height: f.dk, rx: f.k * 0.14, ...part }, g); svgEl('rect', { x: x0, y: -f.dk * 0.2, width: f.k * 0.45, height: f.dk * 0.4, ...hole }, g); }
    else if (f.head === 'button') svgEl('path', { d: `M${xs} ${-f.dk / 2} A${f.k} ${f.dk / 2} 0 0 0 ${xs} ${f.dk / 2} Z`, ...part }, g);
    else if (f.head === 'flat') svgEl('path', { d: `M${x0} ${-f.dk / 2} L${xs} ${-f.d / 2} L${xs} ${f.d / 2} L${x0} ${f.dk / 2} Z`, ...part }, g);
    else svgEl('rect', { x: xs, y: -f.d * 0.24, width: f.d * 0.42, height: f.d * 0.48, ...hole }, g);   // a set screw's socket, at its end
  } else if (f.kind === 'insert') {
    svgEl('rect', { x: -f.L / 2, y: -f.od / 2, width: f.L, height: f.od, rx: f.od * 0.08, ...part }, g);
    const st = Math.max(0.5, f.od * 0.32);
    for (let x = -f.L / 2 + st * 0.4; x < f.L / 2 - st * 0.4; x += st) { svgEl('line', { x1: x, y1: -f.od / 2, x2: x + st * 0.6, y2: 0, ...line }, g); svgEl('line', { x1: x + st * 0.6, y1: 0, x2: x, y2: f.od / 2, ...line }, g); }
  } else if (f.kind === 'washer') {
    svgEl('circle', { r: f.od / 2, ...part }, g); svgEl('circle', { r: (f.d + 0.4) / 2, ...hole }, g);
  } else {
    const R = f.s / Math.sqrt(3);
    svgEl('polygon', { points: hexPts(R), ...part }, g);
    if (f.kind === 'nyloc') svgEl('circle', { r: f.s * 0.4, fill: I.MAT_HEX.nylon, class: 'gpart' }, g);   // the nylon ring
    svgEl('circle', { r: f.d / 2, ...hole }, g);
  }
  return true;
}
// a bin's resize corner, at its back-right: the same reach the editor's press uses (editor.js HANDLE)
export const binCorner = (c, pt) => { const h = Math.min(7, (c.x1 - c.x0) / 3, (c.y1 - c.y0) / 3); return pt.x > c.x1 - h && pt.y > c.y1 - h; };

/* the plan of a full layout (unit.js fullLayout) drawn into an <svg>: `sel` the selection box (mm) or null, `hot` a wall
   highlight { orient, c, segs, J, drag?, from? } or null, `flags` the reach flags, `hover` a hovered compartment */
// preview: the compartments are a proposal (the parts list's layout, 2026-11-07): drawn dashed, no selection, no hover; hl is the
// one lit with its row in the list (2026-11-08)
// drop / dropEnd: a card dragged from the parts list is over this compartment / behind the last row (its target, 2026-11-08)
// the bins (2026-11-09): cells, the grid cells drawn faintly to aim at; cand, a drag's candidate { x0, x1, y0, y1, ok }; moving, the
// bin it came from (dimmed); handles, a bin's resize corner at the back-right
// contents: each part drawn as a glyph in its compartment (the contents preview, 2026-11-09); outlines: the draft's part-outline choice
export function drawPlan(svg, full, { sel = null, hot = null, flags = [], hover = null, comps = full.comps, preview = false, hl = null, drop = null, dropEnd = false, cells = null, cand = null, moving = null, handles = false, contents = false, outlines = null } = {}) {
  const S = G.SIZES[full.size], L = { ...full, comps, ...(outlines != null ? { outlines } : {}) };
  svg.replaceChildren();
  svg.setAttribute('viewBox', `${-2 - PAD.l} ${-4 - PAD.t} ${S.W + 4 + PAD.l + PAD.r} ${S.D + 8.3 + PAD.t + PAD.b}`);   // the shell: 2 each side, 4.3 in front, 4 behind
  const Y = (y) => S.D - y;   // drawer y (front = 0) -> svg y (front at bottom)
  const rect = (cls, x0, x1, y0, y1, extra = {}) => svgEl('rect', { class: cls, x: x0, y: Y(y1), width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0), ...extra }, svg);
  svgEl('rect', { class: 'shell', x: -2, y: Y(S.D + 4), width: S.W + 4, height: S.D + 8.3, rx: 1.2 }, svg);
  svgEl('rect', { class: 'cavity', x: 0, y: 0, width: S.W, height: S.D }, svg);
  const H = G.holderOf(L), HD = H.D;
  const inSel = (c) => !!sel && G.inBox(c, sel);
  const outl = new Map(outlinesOf(L).map((o) => [o.comp, o.polys]));   // the parts on the floors (M3)
  comps.forEach((c, i) => {
    const w = c.x1 - c.x0, d = c.y1 - c.y0;
    rect('cell' + (preview ? ' preview' + (c.item ? ' bin' : ' spare') + (hl === c ? ' hl' : '') + (moving === c ? ' moving' : '') + (drop === c || (dropEnd && !c.item) ? ' drop' : '') : inSel(c) ? ' sel' : hover === c ? ' hov' : ''), c.x0, c.x1, c.y0, c.y1, { 'data-i': i });
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
    // the part's outline at 1:1 (M3): cut into a plain floor, in the body colour on a coloured one
    if (outl.has(i)) {
      const d2 = outl.get(i).map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(2)} ${Y(y).toFixed(2)}`).join('L') + 'Z').join('');
      svgEl('path', { class: 'outline' + (fk ? ' inlay' : ''), d: d2 }, svg);
    }
    if (c.holder) {
      const hs = G.holderStatus(L, c);
      if (hs.ok) {
        rect('holder', c.x0, c.x0 + G.C.HOLDER_W, c.y1 - HD, c.y1);
        rect('labelstrip', c.x0 + 0.36, c.x0 + 0.36 + H.label[0], c.y1 - H.label[1], c.y1, { rx: 0.4 });
        if (c.item && I.known(c.item)) {   // the part's words on the strip (M3)
          const [big, small] = I.labelLines(c.item), lhh = H.label[1], cxx = c.x0 + 0.36 + H.label[0] / 2;
          if (lhh > 10) {
            svgEl('text', { class: 'labeltxt', x: cxx, y: Y(c.y1 - lhh * 0.42), 'text-anchor': 'middle', 'font-size': Math.min(lhh * 0.42, 4.6) }, svg).textContent = big;
            svgEl('text', { class: 'labeltxt small', x: cxx, y: Y(c.y1 - lhh * 0.8), 'text-anchor': 'middle', 'font-size': Math.min(lhh * 0.24, 2.6) }, svg).textContent = small || '';
          } else svgEl('text', { class: 'labeltxt', x: cxx, y: Y(c.y1 - lhh * 0.5), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': Math.min(lhh * 0.42, 3.3) }, svg).textContent = `${big} ${small || ''}`.trim();
        }
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
    // the contents preview: the part's glyph in the clear floor, and the clear size moves under it (it stays there whenever the
    // preview is on, so the plan does not jump between compartments with and without a part)
    const form = contents && c.item ? I.partForm(c.item) : null;
    const gl = form && drawGlyph(svg, form, I.MAT_HEX[I.matOf(c.item)] || I.MAT_HEX.steel, { x0: c.x0 + 1.5, x1: c.x1 - 1.5, y0: bot + 1 + (w >= 40 ? fs * 1.6 : fs * 2.8), y1: top - 1 }, Y, contents, c);
    const cyMid = gl ? Y(bot + (w >= 40 ? fs * 0.8 : fs * 1.45)) : Y((top + bot) / 2);   // under the glyph, in the room kept for it
    const style = ink ? { style: `fill:${ink}` } : {};
    if (top - bot < (w >= 40 ? fs * 1.4 : fs * 2.6)) { /* no room */ }
    else if (w >= 40) svgEl('text', { class: 'dim', x: c.x0 + w / 2, y: cyMid, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fs, ...style }, svg).textContent = `${fmt(w)} × ${fmt(d)}`;
    else {
      svgEl('text', { class: 'dim', x: c.x0 + w / 2, y: cyMid - fs * 0.6, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fs, ...style }, svg).textContent = fmt(w);
      svgEl('text', { class: 'dim small', x: c.x0 + w / 2, y: cyMid + fs * 0.6, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fs, ...(ink ? { style: `fill:${ink};opacity:.75` } : {}) }, svg).textContent = '× ' + fmt(d);
    }
  });
  // a dragged card over the back with no spare row to light: a band behind the last row says "last" (2026-11-08)
  if (preview && dropEnd && !comps.some((c) => !c.item)) { const back = Math.max(0, ...comps.filter((c) => c.item).map((c) => c.y1)); rect('dropend', 0, S.W, Math.min(back, S.D - 6), S.D); }
  if (preview && cells) for (const k of cells) rect('bincell', k.x0, k.x1, k.y0, k.y1);
  if (preview && handles) for (const c of comps) if (c.item) { const h = Math.min(4, (c.x1 - c.x0) / 4, (c.y1 - c.y0) / 4); svgEl('polygon', { class: 'binhandle', points: `${c.x1 - 0.6},${Y(c.y1 - 0.6)} ${c.x1 - 0.6},${Y(c.y1 - 0.6 - h)} ${c.x1 - 0.6 - h},${Y(c.y1 - 0.6)}` }, svg); }
  if (preview && cand) rect('bincand' + (cand.ok ? ' ok' : ' bad'), cand.x0, cand.x1, cand.y0, cand.y1);
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
  const howBtn = el('button.key.sm.howto', { text: 'How to', title: 'The gestures, shown', 'aria-expanded': 'false', onclick: () => (tip ? closeTip() : showTip()) });
  const HINT = 'Drag across compartments to select · drag a wall to move it (Shift: the whole line, Alt: no snap) · double-click: label holders';
  const hint = el('span.bhint', { text: HINT });
  // what the contents preview's glyphs are, while it is on (2026-11-09; its switch is on the editor's toolbar): real size, or enlarged
  const contentsNote = el('span.pd-contents-note', { text: '' });
  const head = el('div.bhead', {}, [el('span.bttl', { text: 'Plan · mm' }), hint, contentsNote, howBtn]);
  const svg = svgEl('svg', { class: 'bsvg', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Top-down plan of the drawer layout, front edge at the bottom' });
  host.append(head, svg);
  /* the tip card (guide.js): the first time edit mode opens on this device, and from the How-to button after; the × (or
     Esc, or the button) closes it and remembers that. It sits in the panel's empty left, pointing at the drawing; on a
     narrow panel it sits over the drawing (css). stop() hides it without remembering, so a first visit cut short still
     gets it next time. */
  let tip = null;
  function showTip() { if (tip) return; tip = howToCard({ onClose: closeTip }); host.appendChild(tip); howBtn.setAttribute('aria-expanded', 'true'); placeTip(); }
  function hideTip() { if (!tip) return; tip.remove(); tip = null; howBtn.setAttribute('aria-expanded', 'false'); }
  function closeTip() { markHowToSeen(); hideTip(); }
  /* the card hugs the drawing's left edge with its pointer on it (the mock's card hugs the button), as far left as the
     panel's inset allows; on a narrow or short panel the css centres it over the drawing and this leaves `left` alone */
  const TIP_GAP = 16, TIP_INSET = 18;
  function placeTip() {
    if (!tip) return;
    // a narrow or short panel: the css centres the card and drops its pointer; that verdict, read back, decides (one threshold, the css's: Terra 01a1b1b9)
    if (getComputedStyle(tip, '::after').display === 'none') { tip.style.left = ''; return; }
    const shell = svg.querySelector('.shell'); if (!shell) return;
    const h = host.getBoundingClientRect(), d = shell.getBoundingClientRect();
    tip.style.left = `${Math.max(TIP_INSET, Math.round(d.left - h.left - TIP_GAP - tip.offsetWidth))}px`;
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => placeTip()) : null; if (ro) ro.observe(host);
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
  function compAt(pt, list = comps()) {   // list: the drawer's compartments, or the proposal's while the parts list is open
    const S = G.SIZES[full().size];
    if (pt.x < -2 || pt.x > S.W + 2 || pt.y < -4.3 || pt.y > S.D + 4) return null;
    let best = null, bd = Infinity;
    for (const c of list) { const dx = Math.max(c.x0 - pt.x, 0, pt.x - c.x1), dy = Math.max(c.y0 - pt.y, 0, pt.y - c.y1), dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = c; } }
    return best;
  }
  const closure = (r) => G.closeBox(comps(), { ...r });
  // the reach of a press on a wall, and a magnet's pull, in mm: a few pixels at the plan's scale (a fat finger more)
  const hitWall = (pt, e) => wallHit(comps(), full(), pt, { tol: Math.max(1.1, (e.pointerType === 'touch' ? 10 : 5) * mmPerPx()), shift: e.shiftKey });
  const snapTol = () => Math.max(0.8, 4 * mmPerPx());
  const hotOf = () => (wdrag ? { ...wdrag.ch, c: wdrag.c, drag: true, from: wdrag.ch.c } : hover);
  /* the parts list's preview (2026-11-07): opts.preview() gives { comps, note, warn } while the list is open, and the plan draws
     those compartments dashed with the note in its header instead of the gestures, which are off */
  const preview = () => (opts.preview ? opts.preview() : null);
  let pvHover = null, pvDrag = null;   // pvDrag: a bin picked up in the proposal (opts.onPreviewPress/Move/Release, 2026-11-09)
  function render() {
    const pv = preview();
    svg.classList.toggle('preview', !!pv);
    hint.textContent = pv ? (pv.note || '') : HINT; hint.classList.toggle('warn', !!(pv && pv.warn));
    const contents = opts.contents ? opts.contents() : false;   // the contents preview: 'actual', 'large' or false (2026-11-09)
    head.classList.toggle('contents-on', !!contents);
    contentsNote.textContent = contents === 'large' ? 'Parts enlarged · not to scale · not printed' : 'Parts at real size · not printed';
    if (pv) { drawPlan(svg, full(), { comps: pv.comps || [], preview: true, hl: pv.hl || null, drop: pv.drop || null, dropEnd: !!pv.dropEnd, cells: pv.cells || null, cand: pv.cand || null, moving: pv.moving || null, handles: !!pv.handles, contents, outlines: pv.outlines != null ? pv.outlines : null }); placeTip(); return; }
    drawPlan(svg, full(), { sel: opts.selected(), hot: hotOf(), flags: opts.flags ? opts.flags() : [], hover: hoverComp, comps: comps(), contents });
    placeTip();
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const pv = preview();
    if (pv) { e.preventDefault(); const pt = planPoint(e), c = compAt(pt, pv.comps || []); if (opts.onPreviewPress && opts.onPreviewPress(c, pt, e)) { pvDrag = { id: e.pointerId }; try { svg.setPointerCapture(e.pointerId); } catch {} } return; }   // a bin pressed is picked up (or, without a drag, its card opens); preventDefault: the mousedown that follows would take the focus
    const pt = planPoint(e);
    const ch = hitWall(pt, e);
    if (ch) {
      wdrag = startWallDrag(comps(), ch, pt, full());
      hover = null; svg.setPointerCapture(e.pointerId); render(); return;
    }
    const c = compAt(pt); if (!c) { opts.onSelect(null); render(); return; }
    drag = c; svg.setPointerCapture(e.pointerId);
    opts.onSelect(closure(G.compBox(c))); render();
  });
  svg.addEventListener('pointermove', (e) => {
    const pv = preview();
    if (pv) {
      const pt = planPoint(e);
      if (pvDrag) { if (e.pointerId === pvDrag.id && opts.onPreviewMove) opts.onPreviewMove(pt, e); return; }
      const c = compAt(pt, pv.comps || []), cur = c && c.item ? (binCorner(c, pt) ? 'nesw-resize' : 'grab') : '';
      if (svg.style.cursor !== cur) svg.style.cursor = cur;
      if (c !== pvHover) { pvHover = c; if (opts.onPreviewHover) opts.onPreviewHover(c); }
      return;
    }
    const pt = planPoint(e); lastPt = { pt, pointerType: e.pointerType };
    if (wdrag) { if (moveWallDrag(wdrag, pt, e.altKey, snapTol())) render(); return; }
    if (drag) { const c = compAt(pt); if (c) { opts.onSelect(closure(G.boxOf([drag, c]))); render(); } return; }
    const ch = e.pointerType === 'touch' ? null : hitWall(pt, e);
    const k = chainKey(ch);
    const hc = ch ? null : compAt(pt);
    if (k !== hoverKey || hc !== hoverComp) { hover = ch; hoverKey = k; hoverComp = hc; svg.style.cursor = ch ? (ch.orient === 'v' ? 'ew-resize' : 'ns-resize') : hc ? 'pointer' : ''; if (opts.onHover) opts.onHover(hc); render(); }
  });
  function endDrag(e) {
    if (pvDrag) { if (!e || e.pointerId !== pvDrag.id) return; pvDrag = null; if (opts.onPreviewRelease) opts.onPreviewRelease(e.type === 'pointerup' ? planPoint(e) : null, e, e.type !== 'pointerup'); return; }   // another finger's release leaves the drag alone (Sol 01a1c0e0)
    if (wdrag) {
      const moved = dragMoved(wdrag), out = wdrag.comps, same = JSON.stringify(full().comps) === JSON.stringify(wdrag.start); wdrag = null;   // not onto a layout that changed under the button (an undo mid-drag)
      if (moved && same) opts.onWalls(out); else render();
      return;
    }
    drag = null;
  }
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('lostpointercapture', (e) => { if (pvDrag && e.pointerId === pvDrag.id) endDrag({ type: 'pointercancel', pointerId: e.pointerId }); });
  svg.addEventListener('pointerleave', () => { lastPt = null; if (pvHover) { pvHover = null; svg.style.cursor = ''; if (opts.onPreviewHover) opts.onPreviewHover(null); } if (!wdrag && (hover || hoverComp)) { hover = null; hoverKey = ''; hoverComp = null; svg.style.cursor = ''; if (opts.onHover) opts.onHover(null); render(); } });
  svg.addEventListener('dblclick', () => { if (!preview() && opts.selected()) opts.onHolder(); });
  // Shift changes what a wall drag will move, so the highlight follows it
  const shiftWatch = (e) => {
    if (e.key !== 'Shift' || wdrag || drag || !lastPt || lastPt.pointerType === 'touch' || !host.isConnected || host.hidden) return;
    const ch = hitWall(lastPt.pt, { pointerType: lastPt.pointerType, shiftKey: e.type === 'keydown' });
    const k = chainKey(ch);
    if (k !== hoverKey) { hover = ch; hoverKey = k; render(); }
  };
  document.addEventListener('keydown', shiftWatch); document.addEventListener('keyup', shiftWatch);
  // the plan point (mm) under a screen point while the proposal shows, for a card dragged from the list (the handle holds the
  // pointer); null while the plan is hidden (the 3D view: no drop surface, Sol 01a1be67)
  function pointAt(clientX, clientY) {
    if (!preview() || !svg.isConnected || host.hidden || !svg.getScreenCTM()) return null;
    return planPoint({ clientX, clientY });
  }
  return {
    el: host, render, pointAt,
    firstTip() { if (!howToSeen()) showTip(); }, closeTip, hideTip, tipOpen: () => !!tip,
    cancel() { if (wdrag) { wdrag = null; render(); } drag = null; pvDrag = null; hover = null; hoverKey = ''; hoverComp = null; svg.style.cursor = ''; },
    destroy() { document.removeEventListener('keydown', shiftWatch); document.removeEventListener('keyup', shiftWatch); if (ro) ro.disconnect(); host.remove(); },
  };
}
