/* The Done scene's arithmetic, pure: a camera fitted to the build and the free region of the canvas, and the room's
 * props slid clear of the build. No three.js, no DOM, so test/done-fit.test.mjs runs it under node.
 *
 * The planner's stage is millimetres, Y up, the build's front toward +Z. A shot is the brief's "parametric shot
 * relative to the anchor, fitted to the build's bounding box": azimuth about Y from the front (+ swings the camera to
 * the build's right, the viewer's left... no: to +X, the viewer's RIGHT when looking at the front), elevation above the
 * desk, a vertical field of view, and the fraction of the free region's height the build's bounding sphere may fill.
 */

/* The distance at which a sphere of `radius` fills `fill` of the FREE region's height and width. The free region is the
 * canvas minus the workspace's panels (the stage's safeArea); the stage pans the projection into it (updateViewInset),
 * so only its SIZE matters here. Vertical: the full frame's fov covers H px, the free h px cover fov * h/H of it (exact
 * in tan space). Horizontal: the frame's horizontal half-angle is tan(fov/2) * W/H, the free w px cover w/W of it. */
export function fitDistance({ radius, fovDeg, width, height, free, fill = 0.5 }) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const h = Math.max(1, (free && free.h) || height), w = Math.max(1, (free && free.w) || width);
  const dV = radius / (fill * t * (h / height));
  const dH = radius / (fill * t * (width / height) * (w / width));
  return Math.max(dV, dH);
}

/* Where the camera goes for a shot over a box: { position, target, fov }. `box` is { min: {x,y,z}, max: {x,y,z} } in mm;
 * `view` is { width, height, free: { w, h } } in CSS px. `targetLift` lowers the aim by that fraction of the radius, so
 * the build sits a touch above the frame's middle (the look check used -0.08). */
export function shotCamera(shot, box, view) {
  const size = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
  const centre = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 };
  const radius = Math.hypot(size.x, size.y, size.z) / 2;
  const fov = shot.fovV || 36;
  const d = fitDistance({ radius, fovDeg: fov, width: view.width, height: view.height, free: view.free, fill: shot.fill || 0.42 });
  const az = ((shot.az || 0) * Math.PI) / 180, el = ((shot.el || 0) * Math.PI) / 180;
  // targetShift: the aim moved by fractions of the box's width and depth (the detail shot looks at a drawer front, not the centre)
  const sh = shot.targetShift || {};
  const target = { x: centre.x + size.x * (sh.x || 0), y: centre.y + radius * (shot.targetLift || 0), z: centre.z + size.z * (sh.z || 0) };
  const position = { x: target.x + d * Math.sin(az) * Math.cos(el), y: target.y + d * Math.sin(el), z: target.z + d * Math.cos(az) * Math.cos(el) };
  return { position, target, fov, distance: d, radius };
}

/* How far each prop GROUP must slide along its slot so every prop clears the build's box by its gap. `props` is
 * [{ group, slot: 'x+' | 'x-', gap, box: { min: {x,z}, max: {x,z} } }] in mm, `build` a box in mm. A prop that does not
 * overlap the build in depth (z) stays. Returns { [group]: deltaX }; groups with nothing to clear are absent. */
export function slideProps(props, build) {
  const out = {};
  for (const p of props) {
    if (!p.slot || !p.box) continue;
    const gap = p.gap || 0;
    const overlapZ = p.box.max.z > build.min.z - gap && p.box.min.z < build.max.z + gap;
    if (!overlapZ) continue;
    let delta = 0;
    if (p.slot === 'x+') { const need = build.max.x + gap - p.box.min.x; if (need > 0) delta = need; }
    else if (p.slot === 'x-') { const need = p.box.max.x - (build.min.x - gap); if (need > 0) delta = -need; }
    if (!delta) continue;
    const g = p.group || p.name || 'prop';
    out[g] = out[g] === undefined ? delta : (delta > 0 ? Math.max(out[g], delta) : Math.min(out[g], delta));
  }
  return out;
}

/* The slides, clamped to the surface they slide along: a group whose slide would carry any of its props past `bounds`
 * (the desk's x extent, mm, in the same frame) cannot clear the build on the desk, so it HIDES instead of hanging in the
 * air past the edge (a 12W build is wider than the desk's free run). Returns { [group]: deltaX | null }, null = hide;
 * groups slideProps did not move are absent, as before. */
export function fitSlides(props, slid, bounds) {
  const out = {};
  for (const g of Object.keys(slid)) {
    const d = slid[g];
    const mine = props.filter((p) => (p.group || p.name || 'prop') === g && p.box);
    const fits = !bounds || mine.every((p) => p.box.min.x + d >= bounds.x0 && p.box.max.x + d <= bounds.x1);
    out[g] = fits ? d : null;
  }
  return out;
}

/* THE CAMERA SEQUENCE (the plan's curated product shots, 2026-10-23; the style doc's reference is Unigine Superposition:
 * slow dolly and push-in moves, the eye guided rather than spun). Three parametric shots per mount, each fitted to the
 * build by shotCamera: the hero 3/4 (room.json's own shot overrides this one), a straight-on low angle, and a detail
 * close-up aimed at the front-left drawer. The camera HOLDS on a shot, then drifts to the next: a hold is where Very
 * High converges and the idle gate rests (a camera that never stops never settles), the drift is one eased move. */
export const SHOTS = {
  tabletop: [
    { name: 'hero', az: 28, el: 20, fovV: 29.9, fill: 0.5, targetLift: -0.08 },
    { name: 'low', az: -26, el: 5, fovV: 29.9, fill: 0.62, targetLift: 0.04 },
    { name: 'detail', az: 30, el: 10, fovV: 29.9, fill: 1.4, targetLift: -0.3, targetShift: { x: -0.18, z: 0.3 } },
  ],
};
export const SEQUENCE = { moveMs: 3500, holdMs: 9000, maxFrameMs: 50, idleBackMs: 6000 };   // the style doc: shots of 8-12 s, eased drifts between them, a grabbed camera drifts back ~6 s after the last gesture; a drift slower than 20 fps on average turns the sequence to CUTS (sequenceMode)

/* A drift's verdict from the frames it drew: too slow when it drew fewer frames than a drift at `maxFrameMs` a frame
 * (20 fps) would have over its `moveMs` (a potato or a phone: it holds and cuts from then on, see sequenceMode). Counting
 * frames against the drift's length, rather than averaging intervals, catches the slowest device too: a machine that
 * draws a two-second drift as three frames has too few intervals for a mean to trust (2026-10-23, SwiftShader on a
 * laptop CPU). Without `moveMs` the older rule applies: the mean interval over `maxFrameMs`, four intervals or more. */
export function driftTooSlow(intervals, maxFrameMs = SEQUENCE.maxFrameMs, moveMs = null) {
  if (!intervals) return false;
  if (moveMs) return (intervals.length + 1) * maxFrameMs < moveMs;
  if (intervals.length < 4) return false;
  return intervals.reduce((a, b) => a + b, 0) / intervals.length > maxFrameMs;
}

/* Which sequence a visit gets. 'drift': hold, then an eased drift to the next shot. 'cut': hold, then the camera is on the
 * next shot at once and holds again - no frames spent moving and no drawer moment (it animates). 'off': the still hero.
 * Cuts are for the Fast tier and for a device whose first drift was judged too slow (Joey, 2026-10-23: keep the look on
 * weak machines and phones, "the camera just stays stationary for a bit before changing angle, rather than animating it";
 * the room's look is baked, so a cut costs one frame and the idle gate rests between). Reduced motion gets none, whatever
 * the tier, and so does the room used as a stage (`sequence: false`, the Colors workspace). */
export function sequenceMode({ tier, reduced = false, sequence = true, slow = false } = {}) {
  if (!sequence || reduced) return 'off';
  return tier === 'fast' || slow ? 'cut' : 'drift';
}

export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/* THE DRAWER MOMENT (the style doc: "every ~15-20 s one labeled drawer slides out ~40 %, holds, and closes, timed with
 * the detail shot"). In the detail shot's hold: out at `outMs`, open for `openMs`, back before the drift. The stage's
 * slide tweens take 380 ms out and 320 ms back (slideDrawer, js/main.js); a hold too short for the whole beat has none. */
export const DRAWER = { outMs: 700, openMs: 3200, fraction: 0.4, slideOutMs: 380, slideBackMs: 320 };
export function drawerBeat(holdMs, d = DRAWER) {
  const openAt = d.outMs, closeAt = openAt + d.slideOutMs + d.openMs;
  return closeAt + d.slideBackMs + 400 <= holdMs ? { openAt, closeAt } : null;
}

/* The aim for a close-up on one unit: its box centre as targetShift fractions of the build's box (what shotCamera takes). */
export function aimAt(build, unit) {
  const size = { x: Math.max(1e-6, build.max.x - build.min.x), z: Math.max(1e-6, build.max.z - build.min.z) };
  const cb = { x: (build.min.x + build.max.x) / 2, z: (build.min.z + build.max.z) / 2 };
  const cu = { x: (unit.min.x + unit.max.x) / 2, z: (unit.min.z + unit.max.z) / 2 };
  return { x: (cu.x - cb.x) / size.x, z: (cu.z - cb.z) / size.z };
}

/* Which unit the detail shot looks at and the drawer moment opens: a labelled unit with a drawer, else any unit with a
 * drawer, nearest the build's front-left (the detail shot's side) when several. `units` = [{ id, label, box, drawer }]. */
export function pickDrawerUnit(units, build) {
  const withDrawer = units.filter((u) => u.drawer && u.box);
  if (!withDrawer.length) return null;
  const labelled = withDrawer.filter((u) => u.label && String(u.label).trim());
  const pool = labelled.length ? labelled : withDrawer;
  const fl = { x: build.min.x, z: build.max.z };
  let best = null, bestD = Infinity;
  for (const u of pool) {
    const cx = (u.box.min.x + u.box.max.x) / 2, cz = (u.box.min.z + u.box.max.z) / 2;
    const d = Math.hypot(cx - fl.x, cz - fl.z);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}

/* Where a sequence of n shots is at time t (ms since the first hold began): { at, to, moving, k }. Each beat is a hold on
 * shot `at` (holdMs) then a move to `to` (moveMs, k the EASED progress 0..1); after the last shot it wraps to the first.
 * Pure, so the clock is testable without a frame. */
export function sequenceAt(t, n, { moveMs = SEQUENCE.moveMs, holdMs = SEQUENCE.holdMs } = {}) {
  const beat = holdMs + moveMs, count = Math.max(1, n | 0);
  const tt = Math.max(0, t) % (beat * count);
  const i = Math.floor(tt / beat), phase = tt - i * beat;
  const at = i % count, to = (i + 1) % count;
  if (phase < holdMs || count === 1) return { at, to, moving: false, k: 0, holdLeft: Math.max(0, holdMs - phase) };
  const raw = Math.min(1, (phase - holdMs) / moveMs);
  return { at, to, moving: true, k: easeInOut(raw), raw };
}

/* The baked contact shadow's footprint for the Fast tier: a disc-ish plane under the build, a little wider than it. */
export function contactFootprint(box, grow = 1.25) {
  const w = (box.max.x - box.min.x) * grow, d = (box.max.z - box.min.z) * grow;
  return { w, d, x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
}
