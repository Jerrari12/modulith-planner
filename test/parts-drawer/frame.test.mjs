/* M1: the generated empty shell on the planner's Decor drawer GLB (2026-11-04).
 *
 * The parts drawer replaces the Decor drawer's body in the scene, so its outside has to be the Decor drawer's: the
 * same pose, faceplate, handle, stoppers and case fit. This pins the frame (js/parts-drawer/frame.js) against the
 * GLBs the planner draws (gen2-parts, read from parts/ like every other GLB test here): every GLB vertex on the
 * outside - an outer wall, the front, the back or the bed, within a millimetre of the outer box - has a generated
 * surface within TOL, and every generated vertex there has a GLB surface within TOL. The Fusion bodies, 240-2W at 0.5H
 * and 1H, and one stretched case of each kind, a 1.5H, a 270 and a 3W.
 *
 * Measured 2026-11-04 against the v2609 GLBs (gen2-parts 1d869e1): only the 0.5H lands within 0.05 mm. The 1H and the
 * stretched sizes differ on the outside by features, up to 0.8 mm at 1H (the front pockets at ±74..78 sit at y 30.7..35.3
 * on the GLB and at 2.7..7.3 on the shell; a rounded feature on the GLB's right wall 5..17 mm behind the front, proud of
 * the shell's groove) and 1.4 mm at 1.5H (the GLB's back bottom corners filled out to the box over the lowest 1.2 mm,
 * where the shell has its edge chamfer: what the GLB build left of the vault's bed flange).
 *
 * Joey, 2026-11-05: the shells are NOT the v2609 drawer. They come from the unversioned prototype drawers in the "240 Parts
 * Drawers" Fusion file, the latest iteration, and that prototype is the design of record for the parts drawer's outside;
 * the two 1H differences are design differences between the prototype and the v2609 release, not export errors. So the
 * four cases below assert their measured difference from the v2609 GLB, each as the figure it is, so a change in either
 * mesh shows: when the Decor drawers are next re-exported from the prototype, the GLBs should come back to within 0.05
 * and these move to the plain assertion (DECISIONS 2026-11-05, "The parts drawer's outside is the prototype drawer").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wasm, assets, G } from '../lib/parts-drawer-env.mjs';
import { frameVertices, frameOf } from '../../js/parts-drawer/frame.js';
import { readGlbTriangles } from '../../tools/lib/skin-geometry.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const glbOf = (L, node) => join(root, 'parts', String(L), node + '.lib.glb');
const TOL = 0.05, BAND = 1.0;   // mm: the fit the brief asks for; how far in from the outer box still counts as outside

// point to triangle distance squared (Ericson, Real-Time Collision Detection 5.1.5)
function d2(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = dot(ab, ap), d2_ = dot(ac, ap);
  if (d1 <= 0 && d2_ <= 0) return dot(ap, ap);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);
  const vc = d1 * d4 - d3 * d2_;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); const q = [a[0] + v * ab[0] - p[0], a[1] + v * ab[1] - p[1], a[2] + v * ab[2] - p[2]]; return dot(q, q); }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);
  const vb = d5 * d2_ - d1 * d6;
  if (vb <= 0 && d2_ >= 0 && d6 <= 0) { const w = d2_ / (d2_ - d6); const q = [a[0] + w * ac[0] - p[0], a[1] + w * ac[1] - p[1], a[2] + w * ac[2] - p[2]]; return dot(q, q); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); const q = [b[0] + w * (c[0] - b[0]) - p[0], b[1] + w * (c[1] - b[1]) - p[1], b[2] + w * (c[2] - b[2]) - p[2]]; return dot(q, q); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  const q = [a[0] + ab[0] * v + ac[0] * w - p[0], a[1] + ab[1] * v + ac[1] * w - p[1], a[2] + ab[2] * v + ac[2] * w - p[2]]; return dot(q, q);
}
// triangles as point triples, each with its bounding box, so a vertex only measures against triangles near it
function triangles(pos, idx) {
  const out = [];
  for (let i = 0; i < idx.length; i += 3) {
    const t = [idx[i], idx[i + 1], idx[i + 2]].map((k) => [pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]]);
    const lo = [0, 1, 2].map((a) => Math.min(t[0][a], t[1][a], t[2][a])), hi = [0, 1, 2].map((a) => Math.max(t[0][a], t[1][a], t[2][a]));
    out.push({ t, lo, hi });
  }
  return out;
}
function distance(p, tris, cap) {
  let best = cap * cap;
  for (const { t, lo, hi } of tris) {
    if (p[0] < lo[0] - cap || p[0] > hi[0] + cap || p[1] < lo[1] - cap || p[1] > hi[1] + cap || p[2] < lo[2] - cap || p[2] > hi[2] + cap) continue;
    const d = d2(p, t[0], t[1], t[2]); if (d < best) best = d;
  }
  return Math.sqrt(best);
}
function bounds(pos) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
  return { lo, hi };
}
// the fit of the shell on the GLB: the worst outside vertex each way, with where it is
function fit(size, height, L, node) {
  const shell = G.shellFor(wasm, assets, size, height), mesh = shell.getMesh();
  const gen = frameVertices(size, mesh), genT = triangles(gen, mesh.triVerts);
  return readGlbTriangles(glbOf(L, node)).then((glb) => {
    const glbT = triangles(glb.positions, glb.indices), gb = bounds(glb.positions), sb = bounds(gen);
    const W = sb.hi[0] - sb.lo[0], D = sb.hi[2] - sb.lo[2];
    const outside = (p) => Math.abs(p[0]) > W / 2 - BAND || Math.abs(p[2]) > D / 2 - BAND || p[1] < 0.3;
    const worst = (from, to) => {
      let max = 0, at = null;
      for (let i = 0; i < from.length; i += 3) {
        const p = [from[i], from[i + 1], from[i + 2]]; if (!outside(p)) continue;
        const d = distance(p, to, 5); if (d > max) { max = d; at = p.map((v) => +v.toFixed(2)); }
      }
      return { max, at };   // the raw figure: a worst vertex at 0.0504 must not pass 0.05 by rounding (Terra 01a1a962)
    };
    return { box: { glb: gb, shell: sb }, glbToShell: worst(glb.positions, genT), shellToGlb: worst(gen, glbT) };
  });
}
const CASES = [
  { size: '240-2W', height: '0.5H', L: 240, node: 'DecorDrawer_240-2W-05H', within: TOL },
  // measured 2026-11-04, see the header: how far the prototype's outside is from the v2609 GLB, by design (Joey 2026-11-05)
  { size: '240-2W', height: '1H', L: 240, node: 'DecorDrawer_240-2W-1H', within: TOL, measured: { glbToShell: 0.801, shellToGlb: 0.800 } },
  { size: '240-2W', height: '1.5H', L: 240, node: 'DecorDrawer_240-2W-15H', within: TOL, measured: { glbToShell: 1.411, shellToGlb: 0.801 } },
  { size: '270-2W', height: '1H', L: 270, node: 'DecorDrawer_270-2W-1H', within: TOL, measured: { glbToShell: 0.807, shellToGlb: 0.800 } },
  { size: '240-3W', height: '1H', L: 240, node: 'DecorDrawer_240-3W-1H', within: TOL, measured: { glbToShell: 0.800, shellToGlb: 0.800 } },
];
const havePool = existsSync(glbOf(240, 'DecorDrawer_240-2W-05H'));

test('the frame: x centred on the outside, up is z, the front faces +z, and the outside centre is 0.15 behind the cavity', () => {
  assert.deepEqual(frameOf('240-2W'), { cx: 79.5, cz: 112.85 });
  assert.deepEqual(frameOf('270-4W'), { cx: 167.5, cz: 127.85 });
});

for (const c of CASES) {
  // a measured case passes at its pinned figure, not at the brief's 0.05: the name says so, so a green run never reads as the GLB matching
  const name = c.measured ? `${c.size} ${c.height} on ${c.node}: the prototype drawer, ${c.measured.glbToShell} mm from the v2609 GLB by design (not within 0.05)`
    : `${c.size} ${c.height} on ${c.node}: within ${TOL} mm on the outside`;
  test(name, { skip: havePool ? false : 'no parts/ pool (a junction or clone of gen2-parts)' }, async () => {
    const r = await fit(c.size, c.height, c.L, c.node);
    // the outer boxes agree (the GLB's are quantized to about 0.01)
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(r.box.glb.lo[k] - r.box.shell.lo[k]) <= 0.02 && Math.abs(r.box.glb.hi[k] - r.box.shell.hi[k]) <= 0.02,
        `${c.size} ${c.height}: outer box axis ${k} glb ${r.box.glb.lo[k].toFixed(3)}..${r.box.glb.hi[k].toFixed(3)} shell ${r.box.shell.lo[k].toFixed(3)}..${r.box.shell.hi[k].toFixed(3)}`);
    }
    if (!c.measured) {
      assert.ok(r.glbToShell.max <= c.within, `${c.size} ${c.height}: a GLB vertex ${r.glbToShell.max.toFixed(3)} mm from the shell at ${r.glbToShell.at}`);
      assert.ok(r.shellToGlb.max <= c.within, `${c.size} ${c.height}: a shell vertex ${r.shellToGlb.max.toFixed(3)} mm from the GLB at ${r.shellToGlb.at}`);
    } else {
      // the prototype against v2609: pinned at what was measured, so either mesh changing is seen (see the header)
      assert.ok(Math.abs(r.glbToShell.max - c.measured.glbToShell) <= 0.01, `${c.size} ${c.height}: GLB to shell measured ${r.glbToShell.max.toFixed(3)} at ${r.glbToShell.at}, was ${c.measured.glbToShell}`);
      assert.ok(Math.abs(r.shellToGlb.max - c.measured.shellToGlb) <= 0.01, `${c.size} ${c.height}: shell to GLB measured ${r.shellToGlb.max.toFixed(3)} at ${r.shellToGlb.at}, was ${c.measured.shellToGlb}`);
    }
  });
}
