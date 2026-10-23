/* HOVER HINTS (Joey, 2026-10-13: "like Photoshop or Illustrator - hover a tool and a tiny looping clip shows what it does"):
   a glass bubble beside a control with a short looping SCENE (an inline SVG animated with SMIL, so nothing is downloaded and
   every loop stays in sync), a title and one line. It shows after a short dwell on hover or on keyboard focus, never on a
   touch screen (no hover there; the tile's own title still answers a long press), and it respects reduced motion. */
import { el } from './dom.js';

const SVG = 'http://www.w3.org/2000/svg';
const DWELL = 380;
let bubble = null, timer = 0, current = null;
const videoGone = new Set();   // clips that failed to load this session: the scene stands in without asking again

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
/* no bubble while a phone sheet is open (a narrow window with a mouse gets the sheets too): beside a full-width sheet there
   is no room, and a bubble over it would read as part of it. A modal dialog needs no rule of its own: every one here (the
   label modal, the Part Picker, the setup sheet, the stale-tab notice) is a full veil, and the overlap rule in show()
   refuses a bubble over any open dialog the control is not inside (2026-10-23) */
export const sheetOpen = () => !!document.querySelector('#ws .sheet.open');
/* the fallback scene for a hint without art of its own: a cursor pressing a button, looping */
export const pressScene = () => scene('0 0 240 110', `<rect width="240" height="110" fill="#1d2230"/>
    <rect x="70" y="40" width="100" height="30" rx="8" fill="#2a3042" stroke="#3a4156"/><rect x="70" y="40" width="100" height="30" rx="8" fill="#FF6A1A" opacity="0">${appear(0.42, 0.7)}</rect>
    <g>${moveTo(150, 92, 118, 56, 0.08, 0.28)}<path d="M0 0l0 14 4-3 3 6 3-1-3-6 5-1z" fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" transform="scale(1.4)"/></g>`);

function ensure() {
  if (bubble) return bubble;
  bubble = el('div.glass', { id: 'ws-hint', role: 'tooltip', hidden: true });
  document.body.appendChild(bubble);
  return bubble;
}
function place(target, anchor, below) {
  const b = ensure();
  const r = target.getBoundingClientRect();
  const a = (anchor || target).getBoundingClientRect();   // beside the panel the control sits in, centred on the control
  const w = b.offsetWidth || 260, h = b.offsetHeight || 190;
  let x, y;
  if (below) {   // under a toolbar's chip, centred on it: beside would cover the next chips (the Assemble camera, 2026-10-23)
    x = r.left + r.width / 2 - w / 2; y = a.bottom + 12;
    x = Math.max(8, Math.min(innerWidth - w - 8, x));
  } else {
    x = a.right + 12; y = r.top + r.height / 2 - h / 2;
    if (x + w > innerWidth - 8) x = Math.max(8, a.left - w - 12);
  }
  y = Math.max(8, Math.min(innerHeight - h - 8, y));
  /* never over the dock: a bubble centred on a button low in the issue card reached the dock's CTA; such a bubble sits above the dock */
  const dock = document.getElementById('ws-dock'); const q = dock && !dock.hidden ? dock.getBoundingClientRect() : null;
  if (q && q.width > 0 && x < q.right && x + w > q.left && y + h > q.top && y < q.bottom) y = Math.max(8, q.top - h - 12);
  b.style.left = `${Math.round(x)}px`; b.style.top = `${Math.round(y)}px`;
}
function show(target, spec, anchor) {
  if (sheetOpen() || !target.isConnected) return;
  const b = ensure();
  current = target;
  /* a real clip when the hint has one (img/hints/*.mp4: a 10-15 s muted screen recording, loaded only on first hover); the
     SVG scene is the placeholder and the fallback while the clip is missing or fails */
  let media;
  if (spec.video && !videoGone.has(spec.video)) {
    media = el('video', { muted: true, loop: true, autoplay: true, playsinline: true, preload: 'none', 'aria-hidden': 'true' });
    media.muted = true;
    media.addEventListener('error', () => { videoGone.add(spec.video); if (current === target) show(target, spec, anchor); });
    media.src = spec.video;
    media.play?.().catch(() => {});
  } else media = (spec.scene || pressScene)();
  b.replaceChildren(el('div.scene', {}, [media]), el('div.t', { text: spec.title }), spec.text ? el('div.d', { text: spec.text }) : null);
  b.hidden = false;
  place(target, anchor, spec.below);
  /* never over an open card or panel the control is not part of (Colors' Simplify card opens under the pointer that
     pressed Simplify…, and a bubble beside the panel would cover it): the hint waits until that is closed */
  if (coversDialog(b, target)) { b.hidden = true; current = null; return; }
  void b.offsetWidth;   // a reflow between unhide and show, so the fade runs (a frame callback can stall in a background tab)
  b.classList.add('show');
}
function coversDialog(b, target) {
  const r = b.getBoundingClientRect();
  return [...document.querySelectorAll('[role="dialog"]:not([hidden])')].some((d) => { if (d.contains(target)) return false; const q = d.getBoundingClientRect(); return q.width > 0 && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top; });
}
export function hideHint() {
  clearTimeout(timer); timer = 0; current = null;
  if (bubble) { bubble.classList.remove('show'); bubble.hidden = true; bubble.replaceChildren(); }
}
/* target: the control; spec: { title, text?, scene?() -> svg, video?: url, below?: true }; anchor: the panel the bubble sits
   beside (default: the control), or with `below` the toolbar it sits under. The control carries data-hint = the clip's name
   (its title without one), so a harness can find every hinted control and the clip it plays. */
export function attachHint(target, spec, anchor = null) {
  target.dataset.hint = spec.video ? spec.video.replace(/^.*\//, '').replace(/\.mp4$/, '') : spec.title;
  if (!canHover()) return target;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => show(target, spec, anchor), DWELL); };
  target.addEventListener('mouseenter', arm);
  /* focusin, not focus: it bubbles, so a hint on a group (the Side covers track) arms when the keyboard reaches a segment
     inside it (Sol 01a16a18); moving between the group's own segments keeps the bubble */
  target.addEventListener('focusin', arm);
  target.addEventListener('mouseleave', hideHint);
  target.addEventListener('focusout', (e) => { if (!e.relatedTarget || !target.contains(e.relatedTarget)) hideHint(); });
  target.addEventListener('mousedown', hideHint);
  return target;
}
