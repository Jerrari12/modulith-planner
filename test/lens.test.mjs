/* The thin lens for Very High's accumulator (js/lens.js), checked against an independent projection: a full 4x4
 * perspective matrix built the way three's makePerspective builds it, applied by matrix arithmetic, so the shear is
 * tested by what it does to points and not by its own formula. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lensDisk, lensShear, cocPx, lensForRange, lightStride } from '../js/lens.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

/* three's Matrix4.makePerspective, column-major: a symmetric frustum from a vertical fov, an aspect and near/far */
function perspective(fovDeg, aspect, near, far) {
  const top = near * Math.tan(fovDeg * Math.PI / 360), right = top * aspect;
  const e = new Array(16).fill(0);
  e[0] = near / right; e[5] = near / top; e[8] = 0; e[9] = 0;
  e[10] = -(far + near) / (far - near); e[11] = -1; e[14] = -2 * far * near / (far - near);
  return e;
}
/* a camera-space point (x, y, z), z < 0 in front, to NDC through column-major `e` */
function ndc(e, [x, y, z]) {
  const cx = e[0] * x + e[4] * y + e[8] * z + e[12], cy = e[1] * x + e[5] * y + e[9] * z + e[13], w = e[3] * x + e[7] * y + e[11] * z + e[15];
  return [cx / w, cy / w];
}
/* the same point seen by the camera moved (u, v) across its lens, with the shear applied */
function throughLens(e, p, u, v, focus) {
  const [d8, d9] = lensShear(e[0], e[5], u, v, focus);
  const s = e.slice(); s[8] += d8; s[9] += d9;
  return ndc(s, [p[0] - u, p[1] - v, p[2]]);
}

test('lensShear: a point on the plane in focus lands where the pinhole puts it, from any point of the aperture', () => {
  const e = perspective(30, 16 / 9, 10, 20000), focus = 600;
  for (const p of [[0, 0, -focus], [120, -80, -focus], [-300, 150, -focus]]) {
    const [x0, y0] = ndc(e, p);
    for (const [u, v] of [[4, 0], [0, -4], [-2.8, 2.8], [6, 3]]) {
      const [x1, y1] = throughLens(e, p, u, v, focus);
      close(x1, x0, 1e-12, `x of ${p} through (${u},${v})`); close(y1, y0, 1e-12, `y of ${p} through (${u},${v})`);
    }
  }
});

test('lensShear: off the plane a point moves by P00 u (1/focus - 1/depth), behind it one way and in front the other', () => {
  const e = perspective(30, 16 / 9, 10, 20000), focus = 600, u = 4;
  const shift = (d) => throughLens(e, [50, 20, -d], u, 0, focus)[0] - ndc(e, [50, 20, -d])[0];
  close(shift(1000), e[0] * u * (1 / focus - 1 / 1000), 1e-12, 'behind');
  close(shift(400), e[0] * u * (1 / focus - 1 / 400), 1e-12, 'in front');
  assert.ok(shift(1000) > 0 && shift(400) < 0, 'opposite ways either side of focus');
  // and a vertical move shears only y
  const p = [50, 20, -1000], [x1] = throughLens(e, p, 0, u, focus);
  close(x1, ndc(e, p)[0], 1e-12, 'a vertical move leaves x');
});

test('cocPx: the circle of confusion is the pixel spread of one point across the aperture', () => {
  const fovDeg = 30, heightPx = 1080, e = perspective(fovDeg, 16 / 9, 10, 20000), focus = 600, aperture = 3;
  for (const depth of [350, 900, 2500]) {
    const p = [0, 40, -depth];
    const [, yTop] = throughLens(e, p, 0, aperture, focus), [, yBot] = throughLens(e, p, 0, -aperture, focus);
    const measured = Math.abs(yTop - yBot) * heightPx / 2;   // NDC spans 2 over the height
    close(cocPx({ aperture, focus, depth, heightPx, fovDeg }), measured, 1e-9, `depth ${depth}`);
  }
  close(cocPx({ aperture: 3, focus: 600, depth: 600, heightPx: 1080, fovDeg: 30 }), 0, 1e-12, 'in focus');
});

test('lensForRange: focused at the harmonic mean, both ends of the range blur exactly maxPx', () => {
  const near = 520, far = 720, heightPx = 900, fovDeg = 29.9;
  const l = lensForRange({ near, far, heightPx, fovDeg, maxPx: 2 });
  close(l.focus, 2 / (1 / near + 1 / far), 1e-9, 'focus');
  assert.ok(l.focus > near && l.focus < far, 'inside the range');
  close(cocPx({ ...l, depth: near, heightPx, fovDeg }), 2, 1e-9, 'near end');
  close(cocPx({ ...l, depth: far, heightPx, fovDeg }), 2, 1e-9, 'far end');
  assert.ok(cocPx({ ...l, depth: 1100, heightPx, fovDeg }) > 2, 'a wall behind blurs more');
  // twice the allowance, twice the aperture
  close(lensForRange({ near, far, heightPx, fovDeg, maxPx: 4 }).aperture, 2 * l.aperture, 1e-9, 'linear in maxPx');
  assert.equal(lensForRange({ near: 600, far: 600, heightPx, fovDeg, maxPx: 2 }), null, 'no depth, no lens');
  assert.equal(lensForRange({ near, far, heightPx, fovDeg, maxPx: 0 }), null, 'no allowance, no lens');
});

test('lensDisk: n points in the unit disc, the centre first, the rim last, each prefix a smaller disc', () => {
  const n = 96, d = lensDisk(n);
  assert.equal(d.length, n);
  assert.deepEqual(d[0], [0, 0]);
  close(Math.hypot(...d[n - 1]), 1, 1e-12, 'the last on the rim');
  for (const [x, y] of d) assert.ok(Math.hypot(x, y) <= 1 + 1e-12, 'inside the disc');
  for (const k of [8, 24, 48]) {
    const r = Math.max(...d.slice(0, k).map(([x, y]) => Math.hypot(x, y)));
    close(r, Math.sqrt((k - 1) / (n - 1)), 1e-12, `the first ${k} reach sqrt(${k - 1}/${n - 1})`);
  }
  // the mean of the whole disc is near its centre (an even spread), and a turn rotates every point by it
  const mx = d.reduce((s, [x]) => s + x, 0) / n, my = d.reduce((s, [, y]) => s + y, 0) / n;
  assert.ok(Math.hypot(mx, my) < 0.05, `an even spread (mean ${mx.toFixed(3)}, ${my.toFixed(3)})`);
  const t = lensDisk(n, 0.7);
  for (let i = 1; i < n; i++) close(Math.atan2(t[i][1], t[i][0]), Math.atan2(Math.sin(Math.atan2(d[i][1], d[i][0]) + 0.7), Math.cos(Math.atan2(d[i][1], d[i][0]) + 0.7)), 1e-9, `point ${i} turned`);
});

/* the squared radius of point i of an n-point spiral is i / (n - 1), so the lens's radius against the light's under the
   stride is the index i against (i * stride) mod n: in step the two are the same, and their correlation is 1 */
test('lightStride: the light\'s disc visited out of step with the lens\'s, every point once, the centre first', () => {
  assert.equal(lightStride(128), 79, 'near 128 / phi, and odd');
  for (const n of [64, 96, 128, 200, 256, 1024]) {
    const s = lightStride(n), order = Array.from({ length: n }, (_, i) => (i * s) % n);
    assert.equal(new Set(order).size, n, `${n}: a permutation (stride ${s})`);
    assert.equal(order[0], 0, `${n}: sample 0 at the centre of both`);
    const m = (n - 1) / 2;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (i - m) * (order[i] - m); sxx += (i - m) ** 2; }
    assert.ok(Math.abs(sxy / sxx) < 0.1, `${n}: the radii out of step (correlation ${(sxy / sxx).toFixed(3)}, in step 1)`);
    // the joint spread: over a 4 x 4 grid of (lens radius, light radius) every cell is filled near evenly, never empty
    const cells = new Array(16).fill(0);
    for (let i = 0; i < n; i++) cells[Math.floor(i * 4 / n) * 4 + Math.floor(order[i] * 4 / n)]++;
    assert.ok(Math.min(...cells) >= n / 16 - Math.max(2, n / 64) && Math.max(...cells) <= n / 16 + Math.max(2, n / 64), `${n}: an even joint spread (${Math.min(...cells)} to ${Math.max(...cells)} a cell of ${n / 16})`);
  }
  assert.equal(lightStride(1), 1, 'a single sample: no stride to take');
});
