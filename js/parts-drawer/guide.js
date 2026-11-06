/* The compartment editor's teaching clips (2026-11-06; Joey on the M3 plan at 4K: "it's not very self explanatory, for
   instance i didn't know i had to hold and drag to select more than one cell to merge or to drag rows and columns").
   Looping SVG scenes in the planner's hover-hint idiom (js/ui/hint.js: "like Photoshop or Illustrator - hover a tool and
   a tiny looping clip shows what it does"), each the plan's own gesture drawn small. The three the plan needs (select
   and merge, move a wall, the label holder) come as a TIP CARD the first time edit mode opens on a device (Joey: "a
   helpful tip notification after selecting something that triggers it, when accessing it for the first time", in the
   shape of his Colors buy-tip mock: an opaque card with the orange edge, a pointer at what it explains, a × that
   dismisses it; a side column tried first "felt like it's floating in a weird place"), and the plan's header has a
   How-to button that brings it back; the editor's controls carry theirs as hover hints. Every scene is this file's
   own markup; no outside string reaches it. */
import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { scene, appear, slide, DUR } from '../ui/hint.js';

const BG = '<rect width="240" height="110" fill="#1d2230"/>';
const CUR = '<path d="M0 0l0 14 4-3 3 6 3-1-3-6 5-1z" fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" transform="scale(1.4)"/>';
const FONT = 'font-family="IBM Plex Sans, system-ui"';
/* the cursor along a few points: `pts` [[x, y, at]...], resting at each until the next leg starts (0.14 of the loop) */
function cursor(pts, extra = '') {
  const vals = [], times = [];
  pts.forEach(([x, y, at], i) => { if (i === 0) { vals.push(`${x} ${y}`); times.push(0); } vals.push(`${x} ${y}`); times.push(at); if (i < pts.length - 1) { vals.push(`${pts[i + 1][0]} ${pts[i + 1][1]}`); times.push(Math.min(at + 0.14, pts[i + 1][2])); } });
  vals.push(vals[vals.length - 1]); times.push(1);
  return `<g><animateTransform attributeName="transform" type="translate" values="${vals.join(';')}" keyTimes="${times.join(';')}" calcMode="spline" keySplines="${times.slice(1).map(() => '.2 .8 .2 1').join(';')}" dur="${DUR}s" repeatCount="indefinite"/>${extra}${CUR}</g>`;
}
/* a press: a ring at the cursor's tip for a moment */
const press = (at) => `<circle r="9" fill="none" stroke="#FF6A1A" stroke-width="2" opacity="0">${appear(at, at + 0.08)}</circle>`;
/* a compartment with its white label strip at the back (the plan's drawing) */
const cell = (x, y, w, h, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#202130" stroke="#3a4156"${extra}/><rect x="${x}" y="${y}" width="${w}" height="9" fill="#f3f1ea"${extra}/>`;
const chip = (x, y, w, text, at) => `<g opacity="0">${appear(at)}<rect x="${x}" y="${y}" width="${w}" height="18" rx="7" fill="#2a3042" stroke="#3a4156"/><rect x="${x}" y="${y}" width="${w}" height="18" rx="7" fill="#FF6A1A" opacity="0">${appear(at + 0.1, at + 0.18)}</rect><text x="${x + w / 2}" y="${y + 12.5}" text-anchor="middle" ${FONT} font-size="10" font-weight="700" fill="#fff">${text}</text></g>`;

export const GUIDE = {
  select: { title: 'Select and merge', text: 'Press in one compartment and drag into another (in 3D: click one, Shift-click another), then Merge (M).', scene: () => scene('0 0 240 110', `${BG}
    <rect x="28" y="20" width="184" height="56" fill="#8b8fa8"/>${cell(36, 28, 80, 40)}${cell(124, 28, 80, 40)}
    <rect x="36" y="28" width="80" height="40" fill="#FF6A1A" opacity="0"><animate attributeName="opacity" values="0;0;.35;.35;0;0" keyTimes="0;.18;.2;.72;.74;1" dur="${DUR}s" repeatCount="indefinite"/></rect>
    <rect x="124" y="28" width="80" height="40" fill="#FF6A1A" opacity="0"><animate attributeName="opacity" values="0;0;.35;.35;0;0" keyTimes="0;.38;.4;.72;.74;1" dur="${DUR}s" repeatCount="indefinite"/></rect>
    <g opacity="0">${appear(0.74)}${cell(36, 28, 168, 40)}</g>
    ${chip(92, 84, 56, 'Merge', 0.5)}
    ${cursor([[76, 52, 0.16], [164, 52, 0.46], [120, 93, 0.74]], press(0.16) + press(0.62))}`) },
  wall: { title: 'Move a wall', text: 'Drag a wall, in the plan or in 3D. Shift takes the whole line with it, Alt skips the snapping.', scene: () => scene('0 0 240 110', `${BG}
    <rect x="28" y="20" width="184" height="56" fill="#8b8fa8"/>
    <rect x="36" y="28" width="80" height="40" fill="#202130" stroke="#3a4156">${slide('width', 80, 108, 0.36, 0.14)}</rect><rect x="36" y="28" width="80" height="9" fill="#f3f1ea">${slide('width', 80, 108, 0.36, 0.14)}</rect>
    <rect x="124" y="28" width="80" height="40" fill="#202130" stroke="#3a4156">${slide('x', 124, 152, 0.36, 0.14)}${slide('width', 80, 52, 0.36, 0.14)}</rect><rect x="124" y="28" width="80" height="9" fill="#f3f1ea">${slide('x', 124, 152, 0.36, 0.14)}${slide('width', 80, 52, 0.36, 0.14)}</rect>
    <rect x="116" y="20" width="8" height="56" fill="#FF6A1A" opacity="0">${appear(0.24, 0.8)}${slide('x', 116, 144, 0.36, 0.14)}</rect>
    <text x="120" y="98" text-anchor="middle" ${FONT} font-size="10" fill="#9a9a9a" opacity="0">${appear(0.3, 0.8)}it snaps to 0.5 mm and to a label's fit</text>
    ${cursor([[150, 92, 0.06], [120, 56, 0.36], [148, 56, 0.8]], press(0.3))}`) },
  holder: { title: 'Label holder', text: 'Double-click a compartment in the plan, or press L, to take its label holder away or give it back.', scene: () => scene('0 0 240 110', `${BG}
    <rect x="52" y="14" width="136" height="74" fill="#8b8fa8"/><rect x="60" y="22" width="120" height="58" fill="#202130" stroke="#3a4156"/>
    <rect x="60" y="22" width="120" height="9" fill="#f3f1ea"><animate attributeName="opacity" values="1;1;0;0;1;1" keyTimes="0;.4;.42;.9;.92;1" dur="${DUR}s" repeatCount="indefinite"/></rect>
    <text x="120" y="102" text-anchor="middle" ${FONT} font-size="10" fill="#9a9a9a" opacity="0">${appear(0.44, 0.9)}no holder: the whole floor is open</text>
    ${cursor([[160, 92, 0.06], [122, 27, 0.9]], press(0.3) + press(0.36))}`) },
  split: { title: 'Split', text: 'A merged compartment goes back to its grid cells (S).', scene: () => scene('0 0 240 110', `${BG}
    <rect x="28" y="20" width="184" height="56" fill="#8b8fa8"/>
    <g><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.6;.62;1" dur="${DUR}s" repeatCount="indefinite"/>${cell(36, 28, 168, 40)}<rect x="36" y="28" width="168" height="40" fill="#FF6A1A" opacity=".35"/></g>
    <g opacity="0">${appear(0.62)}${cell(36, 28, 80, 40)}${cell(124, 28, 80, 40)}</g>
    ${chip(92, 84, 56, 'Split', 0.3)}
    ${cursor([[120, 50, 0.1], [120, 93, 0.6]], press(0.42))}`) },
  grid: { title: 'Columns and rows', text: 'The grid starts over from single compartments; merge, split and move walls after.', scene: () => scene('0 0 240 110', `${BG}
    <rect x="28" y="14" width="184" height="62" fill="#8b8fa8"/>
    <g><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.5;.52;1" dur="${DUR}s" repeatCount="indefinite"/>${cell(36, 22, 52, 46)}${cell(94, 22, 52, 46)}${cell(152, 22, 52, 46)}</g>
    <g opacity="0">${appear(0.52)}${cell(36, 22, 37, 46)}${cell(79, 22, 37, 46)}${cell(122, 22, 37, 46)}${cell(165, 22, 39, 46)}</g>
    <rect x="78" y="84" width="60" height="18" rx="7" fill="#2a3042" stroke="#3a4156"/>
    <text x="108" y="96.5" text-anchor="middle" ${FONT} font-size="10" font-weight="700" fill="#fff"><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.5;.52;1" dur="${DUR}s" repeatCount="indefinite"/>Columns 3</text>
    <text x="108" y="96.5" text-anchor="middle" ${FONT} font-size="10" font-weight="700" fill="#fff" opacity="0">${appear(0.52)}Columns 4</text>
    <rect x="142" y="84" width="20" height="18" rx="7" fill="#2a3042" stroke="#3a4156"/><rect x="142" y="84" width="20" height="18" rx="7" fill="#FF6A1A" opacity="0">${appear(0.42, 0.5)}</rect><text x="152" y="97" text-anchor="middle" ${FONT} font-size="12" font-weight="700" fill="#fff">+</text>
    ${cursor([[190, 60, 0.1], [152, 94, 0.5]], press(0.42))}`) },
  outlines: { title: 'Part outlines', text: 'Each compartment’s part drawn on its floor at 1:1, to lay a screw on and check the length.', scene: () => scene('0 0 240 110', `${BG}
    <rect x="52" y="14" width="136" height="80" fill="#8b8fa8"/><rect x="60" y="22" width="120" height="64" fill="#202130" stroke="#3a4156"/><rect x="60" y="22" width="120" height="9" fill="#f3f1ea"/>
    <text x="120" y="29.5" text-anchor="middle" font-family="Archivo, system-ui" font-weight="800" font-size="7" fill="#1b1b1b">M3 × 16 SHCS</text>
    <g opacity="0" fill="none" stroke="#f3f1ea" stroke-width="1.2">${appear(0.3)}<circle cx="86" cy="58" r="6.5"/><rect x="92.5" y="55.5" width="52" height="5"/></g>
    <g opacity="0" fill="none" stroke="#f3f1ea" stroke-width="1.2">${appear(0.42)}<circle cx="86" cy="74" r="6.5"/><rect x="92.5" y="71.5" width="52" height="5"/></g>`) },
  list: { title: 'From a parts list', text: 'A kit, typed lines or a file: every part gets a compartment sized for its quantity, with its label.', scene: () => scene('0 0 240 110', `${BG}
    <g ${FONT} font-size="9" fill="#e6e8f0"><text x="14" y="34" opacity="0">${appear(0.04)}M3x10 SHCS 100</text><text x="14" y="52" opacity="0">${appear(0.14)}M4 nut 50</text><text x="14" y="70" opacity="0">${appear(0.24)}M3 washer 80</text></g>
    <path d="M100 52h22m-6-6l6 6-6 6" fill="none" stroke="#9a9a9a" stroke-width="1.5" opacity="0">${appear(0.36)}</path>
    <rect x="128" y="14" width="100" height="80" fill="#8b8fa8" opacity="0">${appear(0.44)}</rect>
    <g opacity="0">${appear(0.5)}${cell(136, 22, 84, 20)}<text x="178" y="29.5" text-anchor="middle" font-family="Archivo, system-ui" font-weight="800" font-size="6.5" fill="#1b1b1b">M3 × 10 SHCS</text></g>
    <g opacity="0">${appear(0.58)}${cell(136, 46, 40, 40)}<text x="156" y="53.5" text-anchor="middle" font-family="Archivo, system-ui" font-weight="800" font-size="6.5" fill="#1b1b1b">M4 NUT</text></g>
    <g opacity="0">${appear(0.66)}${cell(180, 46, 40, 40)}<text x="200" y="53.5" text-anchor="middle" font-family="Archivo, system-ui" font-weight="800" font-size="6" fill="#1b1b1b">M3 WASHER</text></g>`) },
};

/* the tip was dismissed once on this device (a browser that blocks storage shows it every time, which is the safe side) */
export const HOWTO_KEY = 'gen2-pd-howto';
export const howToSeen = () => { try { return localStorage.getItem(HOWTO_KEY) === '1'; } catch { return false; } };
export const markHowToSeen = () => { try { localStorage.setItem(HOWTO_KEY, '1'); } catch { /* private mode */ } };
/* the tip card (plan.js puts it in the plan panel, pointing at the drawing): the three clips in the order a first edit
   meets them, a title and the × */
export function howToCard({ onClose }) {
  return el('div.pd-tip', { role: 'note', 'aria-label': 'How to edit the plan' }, [
    el('div.ihead', {}, [el('b', { text: 'Editing the plan' }), el('button.x', { 'aria-label': 'Close', title: 'Close · Esc', onclick: onClose }, [icon('x', { size: 16 })])]),
    el('div.body', {}, ['select', 'wall', 'holder'].map((k) => {
      const g = GUIDE[k];
      return el('div.gclip', {}, [el('div.scene', {}, [g.scene()]), el('div.t', { text: g.title }), el('div.d', { text: g.text })]);
    })),
  ]);
}
