/* THE GLITTER SWATCHES' TILES (css/app.css .sw.glitter), generated so they can be re-drawn and so a test can hold the CSS to them.
   `node tools/glitter-tiles.mjs` prints the three custom properties to paste over the ones in app.css.
   STEADY, the small specks, stays still on a swatch. LIT, the glints and the brightest specks, is the layer a scroll moves.
   Specks are placed by Mitchell's best candidate on a torus: a random scatter left some swatches nearly bare (2026-11-01). */
import { pathToFileURL } from 'node:url';

const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const uri = (size, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`)}")`;
const fix = (n) => +n.toFixed(1);
const star = ([x, y], r, c, a) => { const w = +(r * 0.16).toFixed(2), X = fix(x), Y = fix(y); return `<path d='M${X} ${fix(Y - r)}L${fix(X + w)} ${fix(Y - w)}L${fix(X + r)} ${Y}L${fix(X + w)} ${fix(Y + w)}L${X} ${fix(Y + r)}L${fix(X - w)} ${fix(Y + w)}L${fix(X - r)} ${Y}L${fix(X - w)} ${fix(Y - w)}Z' fill='${c}' fill-opacity='${a}'/>`; };
// one path a brightness: a round-capped zero-length line is a dot for about 8 characters
const dots = (pts, rad, c, a) => `<path d='${pts.map(([x, y]) => `M${fix(x)} ${fix(y)}h0`).join('')}' stroke='${c}' stroke-opacity='${a}' stroke-width='${rad * 2}' stroke-linecap='round'/>`;
function scatter(n, size, seed, margin = 0) {
  const r = rng(seed), pts = [];
  const gap2 = (a, b) => { const dx = Math.min(Math.abs(a[0] - b[0]), size - Math.abs(a[0] - b[0])), dy = Math.min(Math.abs(a[1] - b[1]), size - Math.abs(a[1] - b[1])); return dx * dx + dy * dy; };
  for (let i = 0; i < n; i++) {
    let best, bestD = -1;
    for (let k = 0; k < 16; k++) { const c = [margin + r() * (size - 2 * margin), margin + r() * (size - 2 * margin)], d = pts.length ? Math.min(...pts.map((p) => gap2(p, c))) : 1e9; if (d > bestD) { bestD = d; best = c; } }
    pts.push(best);
  }
  return pts;
}
const s = scatter(84, 64, 7);
export const STEADY = uri(64, dots(s.slice(0, 58), 0.45, '#fff', 0.42) + dots(s.slice(58, 74), 0.62, '#fff', 0.66) + dots(s.slice(74), 0.55, '#000', 0.26));
const lit = (flake) => { const stars = scatter(2, 40, 11, 4), bright = scatter(5, 40, 31, 1); return uri(40, stars.map((p, i) => star(p, i ? 2.6 : 3.2, flake, 0.96)).join('') + dots(bright, 0.8, flake, 0.96)); };
export const LIT = lit('#fff');
export const LIT_WARM = lit('#ffd98a');   // glitter.js GLITTER_TINTS' warm flake, by eye on a swatch

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) console.log(`--glit-steady: ${STEADY};\n--glit-lit: ${LIT};\n--glit-lit-warm: ${LIT_WARM};`);
