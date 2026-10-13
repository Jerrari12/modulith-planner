/* HOVER HINTS (Joey, 2026-10-13: "like Photoshop or Illustrator - hover a tool and a tiny looping clip shows what it does"):
   a glass bubble beside a control with a short looping SCENE (an inline SVG animated with SMIL, so nothing is downloaded and
   every loop stays in sync), a title and one line. It shows after a short dwell on hover or on keyboard focus, never on a
   touch screen (no hover there; the tile's own title still answers a long press), and it respects reduced motion. */
import { el } from './dom.js';

const SVG = 'http://www.w3.org/2000/svg';
const DWELL = 380;
let bubble = null, timer = 0, current = null;

/* an SVG scene from markup this app authored (no outside strings ever reach it) */
export function scene(viewBox, markup) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', viewBox); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = markup;
  return s;
}
/* SMIL helpers for a scene: everything loops on one clock of `dur` seconds. `at`/`until` are fractions of the loop. */
export const DUR = 4;
export const appear = (at, until = 0.96) => `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${at};${Math.min(at + 0.04, until)};${until};${Math.min(until + 0.02, 1)};1" dur="${DUR}s" repeatCount="indefinite"/>`;
export const slide = (attr, from, to, at, len = 0.2) => `<animate attributeName="${attr}" values="${from};${from};${to};${to}" keyTimes="0;${at};${Math.min(at + len, 1)};1" calcMode="spline" keySplines="0 0 1 1;.2 .8 .2 1;0 0 1 1" dur="${DUR}s" repeatCount="indefinite"/>`;
export const moveTo = (x1, y1, x2, y2, at, len = 0.2) => `<animateTransform attributeName="transform" type="translate" values="${x1} ${y1};${x1} ${y1};${x2} ${y2};${x2} ${y2}" keyTimes="0;${at};${Math.min(at + len, 1)};1" calcMode="spline" keySplines="0 0 1 1;.2 .8 .2 1;0 0 1 1" dur="${DUR}s" repeatCount="indefinite"/>`;
export const blink = () => `<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.5;.5;1" dur=".9s" repeatCount="indefinite"/>`;

const canHover = () => !(typeof matchMedia === 'function' && matchMedia('(hover: none)').matches);

function ensure() {
  if (bubble) return bubble;
  bubble = el('div.glass', { id: 'ws-hint', role: 'tooltip', hidden: true });
  document.body.appendChild(bubble);
  return bubble;
}
function place(target, anchor) {
  const b = ensure();
  const r = target.getBoundingClientRect();
  const a = (anchor || target).getBoundingClientRect();   // beside the panel the control sits in, centred on the control
  const w = b.offsetWidth || 260, h = b.offsetHeight || 190;
  let x = a.right + 12, y = r.top + r.height / 2 - h / 2;
  if (x + w > innerWidth - 8) x = Math.max(8, a.left - w - 12);
  y = Math.max(8, Math.min(innerHeight - h - 8, y));
  b.style.left = `${Math.round(x)}px`; b.style.top = `${Math.round(y)}px`;
}
function show(target, spec, anchor) {
  const b = ensure();
  current = target;
  b.replaceChildren(el('div.scene', {}, [spec.scene()]), el('div.t', { text: spec.title }), spec.text ? el('div.d', { text: spec.text }) : null);
  b.hidden = false;
  place(target, anchor);
  void b.offsetWidth;   // a reflow between unhide and show, so the fade runs (a frame callback can stall in a background tab)
  b.classList.add('show');
}
export function hideHint() {
  clearTimeout(timer); timer = 0; current = null;
  if (bubble) { bubble.classList.remove('show'); bubble.hidden = true; bubble.replaceChildren(); }
}
/* target: the control; spec: { title, text?, scene() -> svg }; anchor: the panel the bubble sits beside (default: the control) */
export function attachHint(target, spec, anchor = null) {
  if (!canHover()) return target;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => show(target, spec, anchor), DWELL); };
  target.addEventListener('mouseenter', arm);
  target.addEventListener('focus', arm);
  target.addEventListener('mouseleave', hideHint);
  target.addEventListener('blur', hideHint);
  target.addEventListener('mousedown', hideHint);
  return target;
}
