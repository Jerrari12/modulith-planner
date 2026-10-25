/* THE LENS (the Done scene's bokeh, 2026-10-24): a thin lens for Very High's accumulator (main.js accumFrame). Each
 * accumulated sample moves the camera across the lens's aperture and shears the projection so that the plane in focus
 * lands exactly where a pinhole puts it; averaged, everything off that plane spreads over a disc whose size the thin-lens
 * model gives (the circle of confusion). Every sample is a real render, so the blur has true occlusion and no edge
 * halos. Pure: no three.js, no DOM, so test/lens.test.mjs runs it under node. Lengths are millimetres (the stage's
 * unit), depths are camera-space distances along the view axis. */

/* The aperture's sample points on the unit disc, `n` of them, index 0 at the centre: a golden-angle spiral at
 * r = sqrt(i / (n - 1)), the rule of the accumulator's light disc (main.js accDisk). ⚠ Each PREFIX covers a SMALLER disc
 * evenly, so a partly accumulated mean is the same lens stopped down, never a few ghost copies of the background: the
 * blur opens as the samples come in. `turn` rotates the spiral, so the lens's offsets do not line up with the light's,
 * sample for sample. */
export function lensDisk(n, turn = 0) {
  const out = [[0, 0]];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 1; i < n; i++) {
    const r = Math.sqrt(i / (n - 1)), a = i * g + turn;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/* What to ADD to a perspective projection's elements[8] and [9] for a camera moved (u, v) in its own right/up plane,
 * so that the plane `focus` away projects where it did. A perspective matrix maps camera-space x to P00 x / d - P02 in
 * NDC at depth d (elements[0] is P00, elements[8] is P02); the camera moved by u puts that point at P00 (x - u) / d -
 * P02, so on d = focus nothing moves when P02 drops by P00 u / focus. Off that plane a point moves by
 * P00 u (1 / focus - 1 / d): the circle of confusion. */
export function lensShear(p00, p11, u, v, focus) {
  return [-p00 * u / focus, -p11 * v / focus];
}

/* The circle of confusion's diameter in pixels: a lens of aperture RADIUS `aperture` focused at `focus`, a point at
 * `depth`, on a view `heightPx` tall with the vertical field of view `fovDeg`. From the shift above: (heightPx / 2) /
 * tan(fov / 2) pixels per NDC-unit, times P00-free u (1 / focus - 1 / depth), over u's span of one diameter. */
export function cocPx({ aperture, focus, depth, heightPx, fovDeg }) {
  return aperture * heightPx / Math.tan(fovDeg * Math.PI / 360) * Math.abs(1 / focus - 1 / depth);
}

/* A lens that keeps a depth range [near, far] sharp to within `maxPx` and blurs what lies beyond it: focused at the
 * range's harmonic mean, where its two ends blur equally, with the widest aperture that holds both ends to `maxPx`.
 * A range with no depth gets no lens. */
export function lensForRange({ near, far, heightPx, fovDeg, maxPx }) {
  if (!(far > near) || !(near > 0) || !(maxPx > 0)) return null;
  const focus = 2 / (1 / near + 1 / far);
  const perAperture = heightPx / Math.tan(fovDeg * Math.PI / 360) * (1 / near - 1 / focus);
  return { focus, aperture: maxPx / perAperture };
}

/* The order the LIGHT's disc is visited in while a lens is set: sample i takes the light's point (i * stride) mod n.
 * ⚠ Visited in step, the two discs share a radius sample for sample (both spirals grow from the centre), and an angle
 * but for the lens's turn, so a soft shadow on a blurred wall got its two spreads added or cancelled by the edge's
 * direction instead of convolved (Sol 01a17057). A stride coprime with n near n / phi takes the light's radius out of
 * step with the lens's (their correlation 0.03 over 128 samples, against 1 in step) while sample 0 stays at the centre
 * of both; the lens keeps its own order, which is what opens its blur smoothly as the frame settles. */
export function lightStride(n) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const s = Math.round(n * (Math.sqrt(5) - 1) / 2);
  for (let d = 0; d < n; d++) for (const c of [s - d, s + d]) if (c > 0 && c < n && gcd(c, n) === 1) return c;
  return 1;
}
