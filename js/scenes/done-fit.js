/* The Done scene's arithmetic, pure: a camera fitted to the build and the free region of the canvas, and the room's
 * props slid clear of the build. No three.js, no DOM, so test/done-fit.test.mjs runs it under node.
 *
 * The planner's stage is millimetres, Y up, the build's front toward +Z. A shot is the brief's "parametric shot
 * relative to the anchor, fitted to the build's bounding box": azimuth about Y from the front (+ swings the camera to
 * the build's right, the viewer's left... no: to +X, the viewer's RIGHT when looking at the front), elevation above the
 * desk, a vertical field of view, and the fraction of the free region's height the build's bounding sphere may fill.
 */
import { lensForRange } from '../lens.js';   // the thin lens's arithmetic, pure too (stamped in pages.yml)

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
  // `distMm`: the camera's distance from the aim, set rather than fitted (the macro shot, 2026-10-24)
  const d = shot.distMm || fitDistance({ radius, fovDeg: fov, width: view.width, height: view.height, free: view.free, fill: shot.fill || 0.42 });
  const az = ((shot.az || 0) * Math.PI) / 180, el = ((shot.el || 0) * Math.PI) / 180;
  // targetShift: the aim moved by fractions of the box's width and depth (the detail shot looks at a drawer front, not the
  // centre); targetAt: the aim itself, a point in mm (the macro's spot on a faceplate)
  const sh = shot.targetShift || {};
  const target = shot.targetAt ? { x: shot.targetAt.x, y: shot.targetAt.y, z: shot.targetAt.z }
    : { x: centre.x + size.x * (sh.x || 0), y: centre.y + radius * (shot.targetLift || 0), z: centre.z + size.z * (sh.z || 0) };
  const position = { x: target.x + d * Math.sin(az) * Math.cos(el), y: target.y + d * Math.sin(el), z: target.z + d * Math.cos(az) * Math.cos(el) };
  return { position, target, fov, distance: d, radius, fill: shot.fill || 0.42 };
}

/* The shot's camera kept INSIDE the room (2026-10-23, the massive-build probe: the low shot left through the left wall
 * for any build wider than about 500 mm, the hero left above the wall tops at the 12 x 12 cap). Along the ray from the
 * target to the fitted position, the farthest point still inside `interior` (a box in mm; an open side carries
 * ±Infinity) less the margins: `wall` from a wall or the floor, `top` below the wall tops (the frame looks down, so its
 * upper edge must not see over them). A shorter distance means the build fills more of the frame (Joey: "let the build
 * fill more of the frame when a wall is near"); when it would overflow, the fov widens so the build keeps `fillMax` of
 * the frame (or the shot's own share, when that is larger: the detail fills 1.4 by design), up to `fovMax`, and past that
 * the crop is accepted. Returns the camera with `clamped`, the ratio `k` and `share`, the build's share at the new distance. */
export function clampToInterior(cam, interior, { wall = 150, top = 450, fillMax = 0.92, fovMax = 55 } = {}) {
  if (!interior) return { ...cam, clamped: false, k: 1, share: cam.fill || 0.42 };
  const p = cam.position, t = cam.target;
  const lo = { x: interior.x0 + wall, y: interior.y0 + wall, z: interior.z0 + wall };
  const hi = { x: interior.x1 - wall, y: interior.y1 - top, z: interior.z1 - wall };
  let k = 1;
  for (const a of ['x', 'y', 'z']) {
    const d = p[a] - t[a];
    if (d > 1e-9 && p[a] > hi[a]) k = Math.min(k, (hi[a] - t[a]) / d);
    else if (d < -1e-9 && p[a] < lo[a]) k = Math.min(k, (lo[a] - t[a]) / d);
  }
  if (!(k < 1)) return { ...cam, clamped: false, k: 1, share: cam.fill || 0.42 };
  k = Math.max(0.05, k);   // never onto the target (a target itself past a margin: the shortest useful distance)
  const position = { x: t.x + (p.x - t.x) * k, y: t.y + (p.y - t.y) * k, z: t.z + (p.z - t.z) * k };
  const share = (cam.fill || 0.42) / k;   // the distance goes as 1 / fill, so the build's share of the frame grows by 1 / k
  const cap = Math.max(fillMax, cam.fill || 0);
  let fov = cam.fov;
  if (share > cap) fov = Math.min(fovMax, (2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * (share / cap)) * 180) / Math.PI);
  return { ...cam, position, fov, distance: cam.distance * k, clamped: true, k, share };
}
/* A point held inside the room's margins, axis by axis (the same margins as clampToInterior): the backstop for a free orbit
 * after clampToInterior's pull along the line to the target, whose floor (k 0.05) can leave a far jump outside (Sol
 * 01a17823: target 0, bound 1000, camera 30000). */
export function insideRoom(p, interior, { wall = 150, top = 450 } = {}) {
  if (!interior) return { x: p.x, y: p.y, z: p.z };
  const c = (v, a, b) => (a > b ? (a + b) / 2 : Math.min(b, Math.max(a, v)));
  return { x: c(p.x, interior.x0 + wall, interior.x1 - wall), y: c(p.y, interior.y0 + wall, interior.y1 - top), z: c(p.z, interior.z0 + wall, interior.z1 - wall) };
}

/* How far each prop GROUP must slide along its slot so every prop clears the build's box by its gap. `props` is
 * [{ group, slot: 'x+' | 'x-', gap, box: { min: {x,z}, max: {x,z} } }] in mm, `build` a box in mm. A prop that does not
 * overlap the build in depth (z) stays; with `height` (a build hanging on the wall over the desk, 2026-10-25), so does
 * one wholly below or above it. Returns { [group]: deltaX }; groups with nothing to clear are absent. */
export function slideProps(props, build, { height = false } = {}) {
  const out = {};
  for (const p of props) {
    if (!p.slot || !p.box) continue;
    const gap = p.gap || 0;
    const overlapZ = p.box.max.z > build.min.z - gap && p.box.min.z < build.max.z + gap;
    if (!overlapZ) continue;
    if (height && !(p.box.max.y > build.min.y - gap && p.box.min.y < build.max.y + gap)) continue;
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

/* THE RELIEF BY DISTANCE (Joey 2026-10-24: "if far enough away that I can't see the layer lines it wouldn't make sense to
   have it impact [performance], but if I'm zoomed in up close it makes sense to see them"). The stage's printed-layer
   relief is band-limited in its shader: under `cutoffPx` CSS pixels a layer it draws nothing, and it costs the whole
   fragment regardless (PERF.md §4.6: a fifth of a software frame at the hero, where a layer is a third of a pixel). The
   nearest the build's box comes to the camera bounds the pixels a layer can span anywhere in the frame: the pitch times
   the focal length in CSS px (half the frame's height over tan(fov/2)) over that distance; a face seen head-on at that
   distance reaches it, every other point is foreshortened or farther. Under the cutoff the relief can show nowhere in the
   shot and the stage may take it off with no visible change. */
export function boxDistance(p, box) {
  const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x), dy = Math.max(box.min.y - p.y, 0, p.y - box.max.y), dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
  return Math.hypot(dx, dy, dz);
}
export function reliefResolves(cam, box, view, { pitchMm = 0.2, cutoffPx = 4 } = {}) {
  const distance = Math.max(1, boxDistance(cam.position, box));
  const focal = Math.max(1, view.height) / 2 / Math.tan(((cam.fov || 36) * Math.PI) / 360);
  const px = (pitchMm * focal) / distance;
  return { px, on: px >= cutoffPx, distance, cutoffPx };
}

/* THE LENS (Very High's bokeh, 2026-10-24; js/lens.js, main.js THE LENS). A still shot's thin lens: the whole build held
 * sharp to within `maxPx` at its nearest and farthest corners, and what lies beyond it blurred, more the farther it is:
 * focused at the harmonic mean of the box's depths along the view axis, with the widest aperture that holds both ends.
 * The look test (D:/Claude - Output/done-scene-2026-10-23/bokeh/look1) chose 3 px: on the hero a wall a metre behind
 * the focus blurs about 11 px and the mug in front reads soft, while the build stays crisp but for its farthest corners
 * (1.5 px was barely there; 6 px began to soften the build's own grain). 128 samples: no ghost copies even at 6 px, and
 * about 1.2 s to converge on a 120 Hz display. */
export const LENS = { maxPx: 3, samples: 128 };
export function lensFor(cam, box, view, { maxPx = LENS.maxPx, samples = LENS.samples } = {}) {
  const fx = cam.target.x - cam.position.x, fy = cam.target.y - cam.position.y, fz = cam.target.z - cam.position.z;
  const fl = Math.hypot(fx, fy, fz);
  if (!(fl > 0)) return null;
  let near = Infinity, far = -Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const d = ((x - cam.position.x) * fx + (y - cam.position.y) * fy + (z - cam.position.z) * fz) / fl;   // depth along the view axis
    if (d < near) near = d;
    if (d > far) far = d;
  }
  const l = lensForRange({ near, far, heightPx: Math.max(1, view.height), fovDeg: cam.fov || 36, maxPx });
  return l && { ...l, samples };
}

/* THE CAMERA GRAMMAR (Joey, 2026-10-24; DESIGN.md §8h and §8l). Distinct cameras, CUT between through a dip to black,
 * in a random order that does not repeat: "the cinematic camera views should cut to a random different camera, position
 * and zoom ... a zoomed in panning front view, then a completely stationary view ... then another view from down below
 * with a wider angle lens, basically like the cameras used in that Superposition Unigine benchmark"; "keep them slow ...
 * a relaxing cinematic scene, very slow pace giving the visitor time to study how their custom storage unit appears";
 * "fades to black for transition". Each shot is fitted to the build (fitShot: shotCamera, the room's walls, the desk's
 * floor): `from` is where it opens, `to` where it is when the frame has gone black again, the move eased across the whole
 * visible time. `fill` sizes the build's sphere in the frame; `distMm` instead sets the camera's distance from its aim
 * (the macro); `aim` points a shot at a part of the build ('drawer': the drawer unit's box centre, as the detail shot
 * always did; 'drawer-front': a spot on its faceplate; 'label': a drawer's label, the frame fitted to the label itself;
 * 'row': along the top row of the build's fronts, `shiftX` the share of that row's width the aim has travelled).
 *
 * EVERY SHOT MOVES (Joey 2026-10-25: "There are a lot of frozen views ... on this computer that is powerful i don't think
 * it ever going to the still images"): where the device moves the camera at all (grammarMode 'full'), a shot that used to
 * hold still drifts slowly about the pose it held (`around`: its `from` and `to` either side of it, so the still grammar,
 * which locks every shot off at the middle of its move, still shows the pose it always did). And four shots from that
 * day's round (Joey: "more creative camera angles ... panning close up, focusing on specific things, like if they add a
 * custom label, cool looking parts like an edgelabel handle, maybe zooming out while moving the camera closer or vise
 * versa, or maybe starting a stationary scene out of focus and ending with it focused on a part of the build"):
 * - label: a slow glide across one of the visitor's own labels, the frame coming into focus as it fades in (`focusIn`);
 *   only where a drawer carries words (done.js drops it otherwise);
 * - glide: a close truck along the top row of the fronts, the EdgeLabel grips or the handles, at a grazing angle;
 * - pullback: from a faceplate's corner out to the whole build, the camera's distance and aim blended between the two
 *   fitted ends (`blend`: blendShot);
 * - dolly: the dolly zoom, the lens narrowing while the camera backs off so the build keeps its size and the room behind
 *   it closes in.
 * - mugs: a slow arc on one mug (done.js makeMugs; Joey: "every so often the camera focuses on them or catches them
 *   at the right angle"), coming into focus, about the face of it the room can see (`faceAz`: mugFace, its saying first)
 *   and at rest for its last part (`settle`, the share of the visible time the move takes: Astra, "let the camera settle
 *   briefly with the text sharp"); in about half the cycles (MUG_SHOT_SHARE), always followed by a view of the build
 *   (BUILD_VIEWS: Astra, "build -> detail -> mug joke -> build").
 * `reversible`: each showing runs the move one way or the other, by the visit's random source. */
export function around(centre, swing) {
  const from = { ...centre }, to = { ...centre };
  for (const [key, d] of Object.entries(swing)) { from[key] = centre[key] - d / 2; to[key] = centre[key] + d / 2; }
  return { from, to };
}
const HERO_SWING = { az: -6, el: -2, fill: 0.04 };
export const BUILD_VIEWS = ['hero', 'push', 'slide', 'side', 'top', 'wide', 'dolly', 'low'];   // the whole build in the frame
export const MUG_SHOT_SHARE = 0.5;   // the cycles the mugs' shot is in
export const GRAMMAR = {
  tabletop: [
    { name: 'hero', ...around({ az: 28, el: 20, fovV: 29.9, fill: 0.5, targetLift: -0.08 }, HERO_SWING), swing: HERO_SWING },   // room.json's own hero is the centre (shotsFor)
    { name: 'push', from: { az: 13, el: 12, fovV: 20, fill: 0.56, targetLift: -0.06 }, to: { az: 6, el: 9, fovV: 20, fill: 0.76, targetLift: -0.06 } },   // a long lens pushing in on the front, drifting a few degrees
    { name: 'low', ...around({ az: -34, el: -7, fovV: 46, fill: 0.78, targetLift: 0.14 }, { az: 8, el: 3 }) },   // down at the desk with a wide lens, looking up, rising a little
    { name: 'detail', ...around({ az: 30, el: 10, fovV: 24, fill: 1.35, targetLift: -0.3, aim: 'drawer' }, { az: -6, fill: 0.1 }), drawer: true },   // the drawer moment in its hold
    { name: 'slide', from: { az: -22, el: 7, fovV: 22, fill: 0.7, targetLift: -0.04 }, to: { az: 14, el: 7, fovV: 22, fill: 0.7, targetLift: -0.04 }, reversible: true },   // a slow truck across the front
    { name: 'top', ...around({ az: 40, el: 50, fovV: 28, fill: 0.58 }, { az: -12, el: -4 }) },   // high, looking down on the covers
    // pushing in on a corner of the drawer unit's faceplate, on an edge, at a grazing angle (a flat face that close was a
    // frame of plain orange, the 2026-10-24 tour). It ended at 105 mm, a frame about 26 mm tall, where a 0.2 mm layer
    // spanned 5.84 CSS px on a 720 px canvas, past the relief's cutoff of 4; Joey found it "a bit too zoomed in ... maybe
    // bring it out about twice as far?" (2026-10-25): 420 to 210 mm now, a frame about 52 mm tall, where a layer spans
    // 4.30 px at its end on a 1080 px canvas (3.19 at 800), so the layer lines draw only on a canvas about 1,003 CSS px
    // tall and up
    { name: 'macro', from: { az: -40, el: 12, fovV: 14, distMm: 420, aim: 'drawer-front' }, to: { az: -31, el: 8, fovV: 14, distMm: 210, aim: 'drawer-front' } },
    { name: 'side', from: { az: 66, el: 15, fovV: 26, fill: 0.62 }, to: { az: 50, el: 13, fovV: 26, fill: 0.62 } },   // a slow arc round the side
    { name: 'label', from: { az: -16, el: 7, fovV: 18, fill: 0.42, aim: 'label' }, to: { az: 14, el: 4, fovV: 18, fill: 0.48, aim: 'label' }, focusIn: true, reversible: true },
    { name: 'glide', from: { az: -30, el: 5, fovV: 20, distMm: 320, aim: 'row', shiftX: -0.45 }, to: { az: -30, el: 5, fovV: 20, distMm: 320, aim: 'row', shiftX: 0.45 }, reversible: true },
    { name: 'pullback', from: { az: -34, el: 9, fovV: 20, distMm: 150, aim: 'drawer-front' }, to: { az: 18, el: 16, fovV: 28, fill: 0.5, targetLift: -0.08 }, blend: true },
    { name: 'dolly', from: { az: 20, el: 12, fovV: 40, fill: 0.5, targetLift: -0.06 }, to: { az: 20, el: 12, fovV: 22, fill: 0.5, targetLift: -0.06 }, reversible: true },
    { name: 'mugs', from: { az: -18, el: 16, fovV: 24, fill: 1.15, aim: 'mugs' }, to: { az: 18, el: 11, fovV: 24, fill: 1.3, aim: 'mugs' }, focusIn: true, reversible: true, settle: 0.65 },
  ],
  /* A WALL BUILD hangs on the back wall over the desk (roomAnchor), so it is seen standing in front of the desk or from
     its chair: the shots keep near the build's own height, none looks down on it from over the wall's top, and the top
     shot gives way to a wide one of the whole corner, the desk under the build (2026-10-25) */
  wall: [
    { name: 'hero', ...around({ az: 24, el: 4, fovV: 30, fill: 0.5, targetLift: -0.04 }, { az: -6, el: -1, fill: 0.04 }) },
    { name: 'push', from: { az: 12, el: 3, fovV: 20, fill: 0.56 }, to: { az: 6, el: 2, fovV: 20, fill: 0.76 } },
    { name: 'low', ...around({ az: -30, el: -24, fovV: 46, fill: 0.7, targetLift: 0.1 }, { az: 8, el: 3 }) },   // from the desk chair, looking up at it
    { name: 'detail', ...around({ az: 30, el: 3, fovV: 24, fill: 1.35, targetLift: -0.3, aim: 'drawer' }, { az: -6, fill: 0.1 }), drawer: true },
    { name: 'slide', from: { az: -22, el: 2, fovV: 22, fill: 0.7 }, to: { az: 14, el: 2, fovV: 22, fill: 0.7 }, reversible: true },
    { name: 'wide', ...around({ az: 30, el: 10, fovV: 34, fill: 0.3, targetLift: -0.35 }, { az: -10, fill: 0.04 }) },   // the corner: the desk under the build
    { name: 'macro', from: { az: -40, el: 6, fovV: 14, distMm: 420, aim: 'drawer-front' }, to: { az: -31, el: 4, fovV: 14, distMm: 210, aim: 'drawer-front' } },   // as the tabletop's (Joey 2026-10-25)
    { name: 'side', from: { az: 66, el: 6, fovV: 26, fill: 0.62 }, to: { az: 50, el: 5, fovV: 26, fill: 0.62 } },
    { name: 'label', from: { az: -16, el: 3, fovV: 18, fill: 0.42, aim: 'label' }, to: { az: 14, el: 2, fovV: 18, fill: 0.48, aim: 'label' }, focusIn: true, reversible: true },
    { name: 'glide', from: { az: -30, el: 2, fovV: 20, distMm: 320, aim: 'row', shiftX: -0.45 }, to: { az: -30, el: 2, fovV: 20, distMm: 320, aim: 'row', shiftX: 0.45 }, reversible: true },
    { name: 'pullback', from: { az: -34, el: 4, fovV: 20, distMm: 150, aim: 'drawer-front' }, to: { az: 18, el: 6, fovV: 28, fill: 0.5, targetLift: -0.04 }, blend: true },
    { name: 'dolly', from: { az: 20, el: 4, fovV: 40, fill: 0.5, targetLift: -0.04 }, to: { az: 20, el: 4, fovV: 22, fill: 0.5, targetLift: -0.04 }, reversible: true },
    { name: 'mugs', from: { az: -18, el: 12, fovV: 24, fill: 1.15, aim: 'mugs' }, to: { az: 18, el: 8, fovV: 24, fill: 1.3, aim: 'mugs' }, focusIn: true, reversible: true, settle: 0.65 },
  ],
  /* AN UNDER-TABLE BUILD hangs under the desk's front edge (roomAnchor; Joey 2026-10-25: "align the under-table build to
     be installed under this scenes table"), so it is seen from in front of the desk, from about its top or below:
     nothing looks down past the edge onto it (the desk top would hide it), the low shot looks up at the rails and the
     drawers' undersides, and the top shot gives way to a wide one of the desk with the build under its edge */
  'under-table': [
    { name: 'hero', ...around({ az: 26, el: 6, fovV: 30, fill: 0.5 }, { az: -6, el: -1, fill: 0.04 }) },
    { name: 'push', from: { az: 12, el: 3, fovV: 20, fill: 0.56 }, to: { az: 6, el: 2, fovV: 20, fill: 0.76 } },
    { name: 'low', ...around({ az: -30, el: -18, fovV: 46, fill: 0.72, targetLift: 0.1 }, { az: 8, el: 3 }) },   // crouched in front of the desk, looking up under it
    { name: 'detail', ...around({ az: 30, el: 4, fovV: 24, fill: 1.35, targetLift: -0.3, aim: 'drawer' }, { az: -6, fill: 0.1 }), drawer: true },
    { name: 'slide', from: { az: -22, el: 3, fovV: 22, fill: 0.7 }, to: { az: 14, el: 3, fovV: 22, fill: 0.7 }, reversible: true },
    { name: 'wide', ...around({ az: 28, el: 18, fovV: 34, fill: 0.3, targetLift: 0.3 }, { az: -10, fill: 0.04 }) },   // the desk, the build under its edge
    { name: 'macro', from: { az: -40, el: 5, fovV: 14, distMm: 420, aim: 'drawer-front' }, to: { az: -31, el: 3, fovV: 14, distMm: 210, aim: 'drawer-front' } },   // as the tabletop's (Joey 2026-10-25)
    { name: 'side', from: { az: 60, el: 2, fovV: 26, fill: 0.62 }, to: { az: 46, el: 2, fovV: 26, fill: 0.62 } },   // round the knee-space side
    { name: 'label', from: { az: -16, el: 3, fovV: 18, fill: 0.42, aim: 'label' }, to: { az: 14, el: 1, fovV: 18, fill: 0.48, aim: 'label' }, focusIn: true, reversible: true },
    { name: 'glide', from: { az: -30, el: 1, fovV: 20, distMm: 320, aim: 'row', shiftX: -0.45 }, to: { az: -30, el: 1, fovV: 20, distMm: 320, aim: 'row', shiftX: 0.45 }, reversible: true },
    { name: 'pullback', from: { az: -34, el: 3, fovV: 20, distMm: 150, aim: 'drawer-front' }, to: { az: 18, el: 4, fovV: 28, fill: 0.5 }, blend: true },
    { name: 'dolly', from: { az: 20, el: 3, fovV: 40, fill: 0.5 }, to: { az: 20, el: 3, fovV: 22, fill: 0.5 }, reversible: true },
    { name: 'mugs', from: { az: -18, el: 16, fovV: 24, fill: 1.15, aim: 'mugs' }, to: { az: 18, el: 11, fovV: 24, fill: 1.3, aim: 'mugs' }, focusIn: true, reversible: true, settle: 0.65 },
  ],
};

/* WHERE THE ROOM GOES, by the build's mount (2026-10-25: a wall or under-table build stood on the desk in the air, the
 * stage's own wall or slab in front of the room). The world point, stage mm, for the room's tabletop anchor (the desk
 * top at the build zone's back-centre); its y is the desk top's height.
 * - tabletop: the build stands on the desk top (y 0), its back at the anchor, as before;
 * - wall: it hangs on the back wall, its back plane 0.5 mm off the wall's face and its bottom at the wall anchor's
 *   height over the desk top (room.json: 550 mm, clear of the monitor's top);
 * - under-table: its rail tops against the desk's underside and its rail fronts on the desk's front edge (the stage's own
 *   claim, fitSurface: the kit mounts at a desk's front edge and the drawers pull out past it), and LEFT-JUSTIFIED: its
 *   left edge UNDER_LEFT_GAP from the inner face of the desk's left leg, whatever its width (Joey 2026-10-25: "always
 *   left justify them ... that way it won't create awkward gaps on both sides and rather a larger gap on the right for
 *   knee space").
 * `frame` is the stage's mounting frame (backZ, underY, frontZ; stage.mountFrame), `anchors` room.json's ([x, y, z] in
 * the room's mm, z toward the wall negative; the wall anchor stands 1 mm off the wall's face), `desk` its extent about the
 * tabletop anchor, with `legInnerL` the left leg's inner face along x from that anchor (the scene measures the GLB's
 * desk_leg_l; without it an under-table build is centred too). A tabletop or wall build is centred on the build zone. */
export const UNDER_LEFT_GAP = 20;
export function roomAnchor(mount, box, frame = {}, anchors = {}, desk = {}) {
  const cx = (box.min.x + box.max.x) / 2;
  const t = anchors.tabletop || [0, 740, -755];
  if (mount === 'wall') {
    const w = anchors.wall || [t[0], t[1] + 550, t[2] - 44];
    const back = frame.backZ != null ? frame.backZ : box.min.z;
    return { x: cx, y: box.min.y - (w[1] - t[1]), z: back - 0.5 + (t[2] - (w[2] - 1)) };
  }
  if (mount === 'under-table') {
    const u = anchors['under-table'] || [t[0], t[1] - 25, t[2]];
    const top = frame.underY != null ? frame.underY : box.max.y, front = frame.frontZ != null ? frame.frontZ : box.max.z;
    const x = desk.legInnerL != null ? box.min.x - (desk.legInnerL + UNDER_LEFT_GAP) : cx;
    return { x, y: top + (t[1] - u[1]), z: front - (desk.zFront != null ? desk.zFront : 381.4) };
  }
  return { x: cx, y: 0, z: box.min.z };
}

/* THE VISITOR'S ROOM COLOURS (2026-10-25; Joey: "would it be possible for the user to maybe adjust the wall and maybe desk
 * color ... in case they want to actually see how this looks in a closer representation of where they will be installing
 * this"). The room is baked: every surface's texture is its colour times its light (room.py bake_room, diffuse only), so
 * a new colour is a multiply on the texture, channel by channel in linear light.
 * - The wall, one plain paint: the bake times the new paint over the bake's own (room.json colours.wall). The light the
 *   walls bounce onto the rest of the room, and onto each other, follows the new paint too: the walls' bounce, below.
 * - The desk, a plain colour: the colour times the desk top's light-only map (room.json light.desk_top, the diffuse light
 *   with no colour, the file over its `scale`), so no oak grain shows through. A wood finish: the bake's own oak, tinted
 *   by the finish over the oak's colour as baked (light.desk_top.albedo), its grain kept. Both times the desk's diffuse
 *   share (room.json bounce.desk.share, the part of a plain colour the bake draws as diffuse; the coat takes the rest).
 *   The light the DESK bounces onto the room, and back onto itself, follows its colour too: the desk's bounce, below
 *   (before it, a white desk left the rest of the room 1.3 to 2.1 display levels too dark against a true re-bake).
 * A choice is a preset's id or a '#rrggbb' of the visitor's own. */
export const WALL_PAINTS = [
  { id: 'white', name: 'White', hex: null },   // the bake's own paint
  { id: 'warm', name: 'Warm white', hex: '#ece6da' },
  { id: 'grey', name: 'Light grey', hex: '#c9cbc9' },
  { id: 'greige', name: 'Greige', hex: '#b8afa2' },
  { id: 'sage', name: 'Sage', hex: '#9aab94' },
  { id: 'blue', name: 'Dusty blue', hex: '#8fa3b6' },
  { id: 'navy', name: 'Navy', hex: '#3b4b5e' },
  { id: 'charcoal', name: 'Charcoal', hex: '#47494d' },
  { id: 'terracotta', name: 'Terracotta', hex: '#b4705a' },
];
export const DESK_FINISHES = [
  { id: 'oak', name: 'Oak', kind: 'bake' },   // the bake's own veneer
  { id: 'walnut', name: 'Walnut', kind: 'tint', hex: '#6b4a35' },
  { id: 'white', name: 'White', kind: 'plain', hex: '#f0efea' },
  { id: 'grey', name: 'Grey', kind: 'plain', hex: '#b5b7b6' },
  { id: 'black', name: 'Black', kind: 'plain', hex: '#2a2b2d' },
];
const HEX = /^#[0-9a-f]{6}$/i;
export function hexToLinear(hex) {
  if (typeof hex !== 'string' || !HEX.test(hex)) return null;
  return [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
}
export function linearToHex(lin) {
  return '#' + lin.map((v) => { const c = Math.min(1, Math.max(0, v)); const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.round(s * 255).toString(16).padStart(2, '0'); }).join('');
}
/* the wall's texture factor for a choice: null for the bake's own paint (or a bake that does not say its paint), else the
   new paint over the baked one, per channel */
export function wallFactor(choice, bakedHex) {
  const preset = WALL_PAINTS.find((p) => p.id === choice);
  const hex = preset ? preset.hex : choice;
  const to = hexToLinear(hex), from = hexToLinear(bakedHex);
  if (!to || !from) return null;
  return to.map((v, i) => v / from[i]);
}
/* THE WALLS' BOUNCE (room.json bounce, tools/done-scene/endpoint.py; Joey 2026-10-25: "Yes dark wall should also darken the
 * rest of the room"). A surface's light is close to a straight line in the walls' albedo, channel by channel, between the
 * bake's paint (w0) and black walls: L(w) = L(w0) - (1 - w/w0) * D, D the light the walls bounce onto it (the atlas). The
 * walls' WEIGHT is w/w0 per channel: 1 for the bake's own paint, 0 for black. A surface draws colour x its map less
 * k x its bounce texel, k = bounceFactor x (1 - weight) / the entry's scale: bounceFactor is what multiplies its light
 * (the tint for a baked surface; the new paint for a wall, whose D is of its light times the paint's diffuse share,
 * room.json bounce.wallShare; the plain colour for the desk, whose D is of its light). */
export function wallWeight(choice, bakedHex) {
  return wallFactor(choice, bakedHex) || [1, 1, 1];
}
export function bounceK(bounceFactor, weight, scale) {
  return [0, 1, 2].map((i) => (scale > 0 ? (bounceFactor[i] * (1 - weight[i])) / scale : 0));
}
/* THE DESK'S BOUNCE (room.json bounce.desk, endpoint.py --desk; Joey 2026-10-25, shown a plain desk leaving the room lit
 * by the oak: "Yes, model the desk's own bounce next"): the same line in the desk's albedo d, from the oak as baked (d0,
 * light.desk_top.albedo: its diffuse share times the veneer's colour) to a black desk. The desk's WEIGHT is d / d0 per
 * channel, d the plain colour times the desk's diffuse share, or the tint's; 1 for the oak. Every surface takes
 * k = bounceFactor x (1 - weight) / scale of its desk tile off as well (bounceK), the desk top its own: the light it gets
 * back from the room by its own bounce ('desk_top:light' for a plain colour; 'desk_top', under the oak's colour as
 * baked, for a tint). A colour brighter than the oak gives a negative k: it adds the bounce the oak did not have.
 *
 * The desk top's look for a choice: which texture it draws (`bake`, its own lightmap; `light`, the light-only map), the
 * factor on it, its weight in the desk's bounce, and for a plain colour the colour (times the share) its bounce tiles
 * multiply. `share` is the desk's diffuse share per channel (none: 1). Null when the choice cannot be drawn: a plain
 * colour or a tint on a bake with no light-only map. */
export function deskLook(choice, light, share = null) {
  const preset = DESK_FINISHES.find((p) => p.id === choice) || (HEX.test(choice || '') ? { kind: 'plain', hex: choice } : null);
  if (!preset || preset.kind === 'bake') return { use: 'bake', factor: [1, 1, 1], weight: [1, 1, 1] };
  const lin = hexToLinear(preset.hex);
  if (!lin || !light) return null;
  const c = Array.isArray(share) && share.length === 3 && share.every((v) => v > 0) ? share : [1, 1, 1];
  const albedo = Array.isArray(light.albedo) && light.albedo.every((v) => v > 0) ? light.albedo : null;
  const d = lin.map((v, i) => v * c[i]);   // the diffuse albedo the bake would draw this colour at
  if (preset.kind === 'tint') return albedo ? { use: 'bake', factor: d.map((v, i) => v / albedo[i]), weight: d.map((v, i) => v / albedo[i]) } : null;
  return light.scale > 0 ? { use: 'light', factor: d.map((v) => v / light.scale), colour: d, weight: albedo ? d.map((v, i) => v / albedo[i]) : [1, 1, 1] } : null;
}
/* A shot's beat: the black fades out (dipIn), the shot holds, the black fades back in (dipOut), a moment of black in which
 * the camera cuts to the next shot (blackMs). Slow on purpose: about 13 s a shot. A move's frame budget for the device's
 * verdict: 20 fps (maxFrameMs). */
export const BEAT = { holdMs: 11000, dipInMs: 1100, dipOutMs: 800, blackMs: 350, maxFrameMs: 50 };
export const FLOOR_MM = 18;   // no camera lower than this over the desk top (the low shot, on any build)

/* A drift's verdict from the frames it drew: too slow when it drew fewer frames than a drift at `maxFrameMs` a frame
 * (20 fps) would have over its `moveMs` (a potato or a phone: it locks off from then on, see grammarMode). Counting
 * frames against the drift's length, rather than averaging intervals, catches the slowest device too: a machine that
 * draws a two-second drift as three frames has too few intervals for a mean to trust (2026-10-23, SwiftShader on a
 * laptop CPU). Without `moveMs` the older rule applies: the mean interval over `maxFrameMs`, four intervals or more. */
export function driftTooSlow(intervals, maxFrameMs = BEAT.maxFrameMs, moveMs = null) {
  if (!intervals) return false;
  if (moveMs) return (intervals.length + 1) * maxFrameMs < moveMs;
  if (intervals.length < 4) return false;
  return intervals.reduce((a, b) => a + b, 0) / intervals.length > maxFrameMs;
}

/* The entrance move's verdict (0.9 s, before any shot moves): too slow when it drew fewer than `minFrames` frames, or when
 * its MEDIAN frame took longer than `maxFrameMs`. The median, not the count: a single stall (a shader compile, a texture
 * upload) is not a frame rate, and over a move this short one stall is most of it: the count rule judged this laptop's
 * GPU slow on 2026-10-24, when the relief's material rebuild landed inside the entrance. The moving shots' own verdicts,
 * over two seconds, keep the count rule. */
export function entranceTooSlow(intervals, maxFrameMs = BEAT.maxFrameMs, minFrames = 4) {
  if (!intervals || intervals.length < minFrames) return true;
  const s = [...intervals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] > maxFrameMs;
}

/* Which grammar a visit gets: STATIC FIRST (Joey 2026-10-24: "we are on an A5000 GPU, so most other devices might be way
 * too slow to be able to smoothly render panning scenes and maybe we only use stationary views for those devices"; and
 * 2026-10-23, "the camera just stays stationary for a bit before changing angle, rather than animating it"). 'full': the
 * moving shots move and the detail shot's drawer slides (High and Very High, on a device that drew the entrance move at
 * 20 fps or better). 'still': every shot locked off at the middle of its move, the dips between them, no drawer moment
 * (Balanced, Fast, a device judged slow: the room's look is baked, so a still costs one frame and the idle gate rests).
 * 'off': the still hero and the views turned by hand with a plain cut (reduced motion), or no views at all (the room as
 * a stage, `sequence: false`, the Colors workspace). */
export function grammarMode({ tier, reduced = false, sequence = true, slow = false } = {}) {
  if (!sequence || reduced) return 'off';
  return slow || tier === 'fast' || tier === 'balanced' ? 'still' : 'full';
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

/* The glide's row (2026-10-25): the top row of the fronts' grips and handles, `boxes` their boxes in mm: those whose
 * centre lies within `tol` of the highest one, their span across, their height and the front plane. Without any, a line
 * across the build's front a fifth of its height down from the top, inset by 15 % each side. */
export function rowOf(boxes, build, tol = 6) {
  const ok = (boxes || []).filter((b) => b && b.max.x > b.min.x);
  if (!ok.length) {
    const w = build.max.x - build.min.x;
    return { x0: build.min.x + 0.15 * w, x1: build.max.x - 0.15 * w, y: build.max.y - 0.2 * (build.max.y - build.min.y), z: build.max.z };
  }
  const cy = (b) => (b.min.y + b.max.y) / 2, top = Math.max(...ok.map(cy)), row = ok.filter((b) => top - cy(b) <= tol);
  return { x0: Math.min(...row.map((b) => b.min.x)), x1: Math.max(...row.map((b) => b.max.x)), y: row.reduce((a, b) => a + cy(b), 0) / row.length, z: Math.max(...row.map((b) => b.max.z)) };
}

/* A slow move's easing: a half cosine, gentle at both ends (a cubic's middle is too quick for a move this long). */
export const easeSine = (k) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));

/* Where a shot is at t ms after its frame began to fade in: { phase, fade, fadeMs, k, left }. The phases: 'in' (the black
 * overlay fading out over dipInMs), 'hold', 'out' (fading back in over dipOutMs), 'black' (the cut happens at its end),
 * then 'next'. `fade` is the overlay's opacity the phase goes to and `fadeMs` the time it takes; `k` the shot's move, eased
 * from 0 as the frame begins to show to 1 as it has gone black (a move never comes to rest on screen); `left` the ms to the
 * phase's end. `skipIn`: no dip-in (the first shot, which the entrance move has already landed on). Pure: the clock is
 * testable without a frame. */
export function beatAt(t, b = BEAT, { skipIn = false } = {}) {
  const inMs = skipIn ? 0 : b.dipInMs, vis = inMs + b.holdMs + b.dipOutMs, tt = Math.max(0, t);
  const k = easeSine(tt / Math.max(1, vis));
  if (tt < inMs) return { phase: 'in', fade: 0, fadeMs: inMs - tt, k, left: inMs - tt };
  if (tt < inMs + b.holdMs) return { phase: 'hold', fade: 0, fadeMs: 0, k, left: inMs + b.holdMs - tt };
  if (tt < vis) return { phase: 'out', fade: 1, fadeMs: vis - tt, k, left: vis - tt };
  if (tt < vis + b.blackMs) return { phase: 'black', fade: 1, fadeMs: 0, k: 1, left: vis + b.blackMs - tt };
  return { phase: 'next', fade: 1, fadeMs: 0, k: 1, left: 0 };
}

/* A seeded random source (mulberry32): the order differs per visit (seeded from the clock), the tests seed it. */
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* One cycle of the shots in a random order: every shot once, `first` at the front (the hero, on the first cycle: the
 * entrance lands on it), the cycle never opening on `prev` (the shot the last one closed on, so no shot ever follows
 * itself), and never two moving shots back to back, the cycle's seam with the last one included, wherever the stills
 * can part them. The shuffle picks; a pick is taken only if the shots left can still keep a still between any two moves
 * (after a move, the moves left may be at most the stills left; after a still, at most one more): a greedy pick without
 * that look-ahead spent the stills early and closed on two moves together (the first unit run). */
export function planCycle(names, rng, { first = null, prev = null, moving = () => false } = {}) {
  const pool = names.filter((n) => n !== first);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const order = first != null && names.includes(first) ? [first] : [];
  while (pool.length) {
    const last = order.length ? order[order.length - 1] : prev;
    const lastMoves = last != null && moving(last);
    const m = pool.filter(moving).length, s = pool.length - m;
    const notPrev = (n) => !(order.length === 0 && n === prev);
    const feasible = (n) => (moving(n) ? !lastMoves && m - 1 <= s : m <= s);
    let i = pool.findIndex((n) => notPrev(n) && feasible(n));
    if (i < 0) i = pool.findIndex((n) => notPrev(n) && !(lastMoves && moving(n)));   // more moves than the stills can part: no two together where it can
    if (i < 0) i = pool.findIndex(notPrev);
    if (i < 0) i = 0;
    order.push(pool.splice(i, 1)[0]);
  }
  return order;
}

/* A shot at k (0..1) of its move: its parameters interpolated, so an arc stays an arc and a push-in stays on its line; a
 * still shot is its `from`. */
export function mixShot(shot, k) {
  const a = shot.from, b = shot.to;
  if (!b) return { ...a };
  const m = { ...a };
  for (const key of ['az', 'el', 'fovV', 'fill', 'distMm', 'targetLift', 'shiftX']) if (a[key] != null && b[key] != null) m[key] = a[key] + (b[key] - a[key]) * k;
  return m;
}

/* A shot's camera for this build and view: its aim resolved (`aims.drawer`, a targetShift onto the drawer unit; `aims.front`,
 * a spot on its faceplate; with no drawer unit the macro frames the build closely instead), fitted (shotCamera), kept
 * inside the room (clampToInterior) and above the desk top (FLOOR_MM over `floorY`, the desk top's height: 0 for a build on
 * it, the room's own for a wall build; an under-table build's shots go below the desk top, so it passes -Infinity and the
 * room's floor is the interior's). */
export function fitShot(spec, box, view, interior, aims = {}, { floorY = 0 } = {}) {
  const s = { ...spec };
  if (s.aim === 'drawer' && aims.drawer) s.targetShift = aims.drawer;
  if (s.aim === 'drawer-front') {
    if (aims.front) s.targetAt = aims.front;
    else { delete s.distMm; s.fill = 1.2; }
  }
  // a label: aimed at its centre and fitted to its own box (`aims.label`: { box }; done.js drops the shot without one)
  if (s.aim === 'label' && aims.label) { const b = aims.label.box; box = b; s.targetAt = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: b.max.z }; }
  // the fronts' top row (`aims.row`: { x0, x1, y, z }), the aim `shiftX` of its width from its middle
  // a mug (`aims.mugs`: { box, faceAz }): aimed at its middle, fitted to it, the arc turned about the face the room sees
  if (s.aim === 'mugs' && aims.mugs) { const b = aims.mugs.box; box = b; s.targetAt = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 }; if (aims.mugs.faceAz != null) s.az = (s.az || 0) + Math.max(-70, Math.min(70, aims.mugs.faceAz)); }
  if (s.aim === 'row' && aims.row) { const r = aims.row; s.targetAt = { x: r.x0 + (r.x1 - r.x0) * (0.5 + (s.shiftX || 0)), y: r.y, z: r.z }; }
  const cam = clampToInterior(shotCamera(s, box, view), interior);
  const floor = floorY + FLOOR_MM;
  return cam.position.y < floor ? { ...cam, position: { ...cam.position, y: floor }, floored: true } : cam;
}

/* A BLENDED SHOT (the pullback, 2026-10-25): its two ends fitted on their own terms (a set distance on a faceplate's corner,
 * the whole build fitted by `fill`), the direction, the lens and the aim mixed along the move, and the distance mixed
 * GEOMETRICALLY, so the pull out reads as even all the way (an even step in distance is a lurch near the faceplate and a
 * crawl at the end). `fit(spec)` is the scene's fitShot for this build and view. Each end is fitted at the mixed
 * direction and lens, so the two agree on where the camera looks from and only the distance and the aim differ. */
export function blendShot(shot, k, fit) {
  const m = mixShot(shot, k), dir = { az: m.az, el: m.el, fovV: m.fovV };
  return blendCams(fit({ ...shot.from, ...dir }), fit({ ...shot.to, ...dir }), k);
}
export function blendCams(a, b, k) {
  const lerp = (p, q) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, z: p.z + (q.z - p.z) * k });
  const off = (c) => ({ x: c.position.x - c.target.x, y: c.position.y - c.target.y, z: c.position.z - c.target.z });
  const len = (v) => Math.hypot(v.x, v.y, v.z) || 1;
  const oa = off(a), ob = off(b), da = len(oa), db = len(ob);
  const u = lerp({ x: oa.x / da, y: oa.y / da, z: oa.z / da }, { x: ob.x / db, y: ob.y / db, z: ob.z / db }), lu = len(u);
  const d = Math.pow(da, 1 - k) * Math.pow(db, k), target = lerp(a.target, b.target);
  return { position: { x: target.x + (u.x / lu) * d, y: target.y + (u.y / lu) * d, z: target.z + (u.z / lu) * d }, target, fov: a.fov + (b.fov - a.fov) * k, distance: d, radius: a.radius + (b.radius - a.radius) * k, fill: b.fill };
}

/* The baked contact shadow's footprint for the Fast tier: a disc-ish plane under the build, a little wider than it. */
export function contactFootprint(box, grow = 1.25) {
  const w = (box.max.x - box.min.x) * grow, d = (box.max.z - box.min.z) * grow;
  return { w, d, x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
}

/* THE PROPS' SHADOW MASKS (2026-10-23): where a mask's quad goes. room.json `shadows.masks[]` holds, per prop group and
 * surface, the WebP of the group's shadow (the bake's ratio of the light on the surface with the group to the light
 * without it: tools/done-scene/room.py bake_shadow_masks) and its extents in mm about the tabletop anchor: on the desk
 * x0, x1, zBack, zFront (stage z, the front positive); on the wall x0, x1, y0, y1 (height over the desk top). `anchor`
 * is the anchor's world { x, z } (its y is 0, the desk top); `wallZ` the wall surface's world z (null: no wall known);
 * `dx` the group's slide from fitSlides (undefined: it did not move; null: the group is hidden, so its shadow hides too).
 * The quad stands `lift` mm off its surface for the depth test. `clip` ({ x0, x1 } about the anchor, the desk's extent)
 * cuts a DESK quad at the desk's ends and moves its texture window (u0, u1) with the cut, so a mask that reaches the
 * desk's edge and then slides outward never floats in the air past it (Sol 01a16bc5); a mask carried wholly off the
 * desk is not placed. `below` (mm) carries a WALL quad down to that depth under the desk top where its bake stops short
 * of it, the texture's bottom row drawn on down (v0 < 0, the texture clamped at its edge): the strip of wall the sun
 * reaches through the gap behind the desk (gapDrop). Returns { surface, w, h, x, y, z, u0, u1, v0, visible }, or null
 * when the mask cannot be placed.
 * A slid mask is exact for the sun (directional) and the sky (uniform); the window's area light, finite and 2 m away,
 * moves a caster's shadow by MORE than the slide (by 1 + h / (hL - h) on the desk: 1.12 for the mug, 2.2 for a leaf tip),
 * inside a penumbra 0.2 to 1.2 m wide, where the offset does not read (Terra 01a16bc6). */
export function maskQuad(mask, anchor, wallZ, dx, lift = 0.5, clip = null, below = 0) {
  const slide = dx == null ? 0 : dx, visible = dx !== null;
  let x0 = mask.x0 + slide, x1 = mask.x1 + slide, u0 = 0, u1 = 1;
  if (mask.surface === 'desk') {
    if (clip) {
      const full = x1 - x0, c0 = Math.max(x0, clip.x0), c1 = Math.min(x1, clip.x1);
      if (c1 <= c0) return null;
      u0 = (c0 - x0) / full; u1 = (c1 - x0) / full; x0 = c0; x1 = c1;
    }
    return { surface: 'desk', w: x1 - x0, h: mask.zFront - mask.zBack, x: anchor.x + (x0 + x1) / 2, y: (anchor.y || 0) + lift, z: anchor.z + (mask.zBack + mask.zFront) / 2, u0, u1, v0: 0, visible };
  }
  // (anchor.y: the desk top's height, 0 for a build on it; a wall or under-table build moves the room, roomAnchor)
  if (mask.surface === 'wall') {
    if (wallZ == null) return null;
    const y0 = below > 0 ? Math.min(mask.y0, -below) : mask.y0, v0 = (y0 - mask.y0) / (mask.y1 - mask.y0);
    return { surface: 'wall', w: x1 - x0, h: mask.y1 - y0, x: anchor.x + (x0 + x1) / 2, y: (anchor.y || 0) + (y0 + mask.y1) / 2, z: wallZ + lift, u0, u1, v0, visible };
  }
  return null;
}
/* THE STRIP OF WALL UNDER THE DESK TOP THAT THE SUN REACHES (Joey 2026-10-25: "the shadows cut off or start right at where
 * the table is nearest the wall"): the desk stands `gap` mm off the wall, so the sun's ray over its back edge falls
 * gap x (rise over run toward the wall) before it meets the wall: 29.9 mm in the home office (a 20 mm gap, the sun's
 * direction 0.578 up over 0.387 toward the room). That strip is sunlit in the bake, so the shadows cast onto the wall must
 * reach down over it or a lit line parts them from the shadows on the desk. `margin` mm more for the sun's disc. Below
 * the strip the desk itself shades the wall in the bake. 0 when there is no gap or the sun does not come from the room. */
export function gapDrop(sunDir, gap, margin = 3) {
  if (!sunDir || !(gap > 0) || !(sunDir[1] > 0) || !(sunDir[2] > 0)) return 0;
  return gap * sunDir[1] / sunDir[2] + margin;
}
/* THE COFFEE'S STEAM (Joey 2026-10-25: "is there anyway to add a steaming animation to the coffee?"): how it moves on each
 * tier. The scene stops drawing when nothing moves (main.js's idle gate), so a wisp that rises at rest costs frames:
 * - 'motion' on Very High: its accumulation builds a still shot from many frames of an unchanging scene, so the wisp
 *   rises only while the camera moves (frames that are drawn anyway) and holds still while a still shot converges;
 * - a frame rate on High (24) and Balanced (15): the wisp keeps rising through a hold, at that many frames a second;
 * - 0 on Fast, and with reduced motion asked for: a still wisp.
 * The column's size from the coffee's radius: about 2.8 radii wide and 4.6 tall (100 by 170 mm over the 36.5 mm mug).
 * It rises off the whole surface (Joey: "wouldn't the steam be rolling off the entire coffee surface and not just a small
 * circle in the center?"; one column from the middle, it was): `slices` camera-facing sheets stood across the coffee at
 * these depths, in radii along the view (+ toward the camera), each as wide at its foot as the coffee's chord there
 * (steamSlices), and a thin mist lying on the surface (`mist`, its alpha). `alpha` is a sheet's. */
export const STEAM = { fps: { high: 24, balanced: 15 }, width: 2.8, height: 4.6, alpha: 0.38, mist: 0.11, slices: [-0.75, -0.25, 0.25, 0.75] };
export function steamSlices(depths = STEAM.slices) {
  return depths.map((d, i) => ({ d, half: Math.sqrt(Math.max(0, 1 - d * d)), seed: i }));
}
export function steamRate(tier, reduced) {
  if (reduced || tier === 'fast') return 0;
  if (tier === 'veryhigh') return 'motion';
  return STEAM.fps[tier] || 0;
}
export function steamSize(radius) {
  return { w: STEAM.width * radius, h: STEAM.height * radius };
}
/* THE STILL SHOTS' DRIFT (Joey 2026-10-25: "maybe on static screens, like would it be possible to slowly zoom in or out
 * slightly, like without it rerendering the scene, kind of like cropping or expanding or panning an image? just as an
 * alternative to always sitting still, maybe this would work on low end pc's as well"). A still shot's finished picture
 * is slowly scaled or slid by a CSS transform on the canvas: the compositor's work, so the scene is not drawn again and
 * the idle gate stays at rest. A push in, a pull out, or a slide across at a held scale, `scale` at most (1.09: Joey,
 * shown 1.045, "maybe try double that"), about the build's place in the frame (`origin`, fractions of the canvas). A
 * slide reaches only as far as its scale covers, so the canvas's edge never shows: with the transform scale(s)
 * translate(t) about an origin o, an edge stays outside the view while t lies within -(1 - o)(s - 1)/s .. o(s - 1)/s
 * (fractions of the canvas); `slide` is the share of that reach a slide uses. */
export const DRIFT = { scale: 1.09, slide: 0.7, kinds: ['in', 'left', 'out', 'right'] };
/* where the drift runs (Joey, the same day: "on very high we never use this static image zoom feature"): not on Very
 * High, whose still shots are its converged pictures, the lens's bokeh among them, which a zoom of the finished frame
 * would only soften, and whose steam holds still through a still shot; not under reduced motion */
export function driftWanted(tier, reduced) {
  return !reduced && tier !== 'veryhigh';
}
/* whether the coffee's steam is drawn (Joey: on the zoomed shots "maybe we omit the steam from the coffee on those
 * because it's the obvious dead giveaway that it's a static image"): not where it cannot move and the shots drift
 * (Fast: a frozen wisp in a picture that zooms gives the picture away). Where it moves (High, Balanced) it rises in the
 * zoomed picture as it does in a still one; under reduced motion nothing drifts and a still wisp is a still scene's.
 * `drifts`: whether this scene runs the grammar at all (Colors' Room stage does not: nothing there ever drifts, Terra
 * 01a1755a). On Fast it is hidden from the entrance on, so it does not vanish on screen when the first shot's drift
 * begins. */
export function steamShown(tier, reduced, drifts = true) {
  return !(drifts && steamRate(tier, reduced) === 0 && driftWanted(tier, reduced));
}
export function driftReach(o, s) {
  return { lo: -(1 - o) * (s - 1) / s, hi: o * (s - 1) / s };
}
export function driftFor(kind, origin, { scale = DRIFT.scale, slide = DRIFT.slide } = {}) {
  const o = { x: Math.min(1, Math.max(0, origin.x)), y: Math.min(1, Math.max(0, origin.y)) }, r = driftReach(o.x, scale);
  const at = (s, x) => ({ s, x, y: 0 });
  if (kind === 'out') return { kind, origin: o, from: at(scale, 0), to: at(1, 0) };
  if (kind === 'left') return { kind, origin: o, from: at(scale, r.hi * slide), to: at(scale, r.lo * slide) };   // the picture slides left: a pan to the right
  if (kind === 'right') return { kind, origin: o, from: at(scale, r.lo * slide), to: at(scale, r.hi * slide) };
  return { kind: 'in', origin: o, from: at(1, 0), to: at(scale, 0) };
}
/* the drift a shot takes: the hero pushes in (the visit opens on it), the others turn through the kinds by their place
 * among the visit's drifts (`i`, counted from the entrance; a moving shot has none and is not counted), so two drifts in
 * a row move differently */
export function driftKind(name, i) {
  return name === 'hero' ? 'in' : DRIFT.kinds[((i % DRIFT.kinds.length) + DRIFT.kinds.length) % DRIFT.kinds.length];
}
export function driftCss(p) {
  return `scale(${p.s.toFixed(4)}) translate(${(p.x * 100).toFixed(3)}%, ${(p.y * 100).toFixed(3)}%)`;
}
/* The steam's beat (Sol 01a174d3): whether a tick falls due at `now` (ms) and when the next one does. Each falls due an
 * interval after the last fell due, 4 ms early counting as on time (the rAF's own beat), so the tier's rate holds on
 * average at any display rate (a 60 Hz display alternates 2 and 3 frames for High's 24, where restarting the interval
 * at each tick settled on every third frame: 20); more than an interval late (the first tick, a stall, the steam back
 * in the shot) starts the beat again from now. */
export function steamBeat(now, dueAt, rate) {
  const iv = 1000 / rate;
  if (now < dueAt - 4) return { tick: false, dueAt };
  return { tick: true, dueAt: now - dueAt > iv ? now + iv : dueAt + iv };
}

/* THE MUGS (Joey 2026-10-25: "can the coffee mug feature my jerrari logo, as if it were print on it like a real coffee
 * mug", "maybe a second empty mug next to it, kind of turned so you might catch one side or the other at certain angles,
 * make it grey like our website background, with the square modulith logo, on the other side text that is stacked",
 * "It would be fun to randomize the mugs a bit, maybe they are randomly in different spots each new build with different
 * sayings or slogans", "or like the I<3NY ... 'I<3 MODULAR STORAGE SYSTEMS' in a goofy cliche way", "a mug is usually very
 * glossy"; the sayings also Astra's, that day). Each mug's look: its glaze (`body`, an sRGB hex, null for the bake's own
 * white), its ink, its logo (an SVG beside the planner's, its aspect, its height on the mug in mm) and the sayings its back
 * may carry: `lines` stacked big, `small` a line under them in small type, a '♥' in a line drawn red, `accent` the lines
 * drawn in the brand's orange (the punchline), `scale` each line's size against the others (1 by default), `type` the face: 'condensed' (Archivo Black at its narrowest, a workshop
 * sign; the default), 'wide' (Archivo Black at its own width) or 'mono' (IBM Plex Mono, a log's deadpan). Both faces are
 * the planner's own (fonts/), so a saying costs no download (Astra's picks that day were Anton, Barlow Condensed and
 * Space Mono, for the same three voices). Three looks, two voices (`voice`: whose sayings a look's back carries): JERRARI's
 * white (the designer who cannot stop improving things), MODULITH's charcoal (organisation, obsessed: the site's
 * --ml-charcoal #2C2D31 with its paper ink #ECECEE, the glaze a little lighter than it, #4A4C54, since it multiplies the
 * bake's light, and at #2C2D31 the mug drew all but black on its lit side) and MODULITH's white (its charcoal for ink). */
export const MUGS = {
  jerrari: { voice: 'jerrari', body: null, ink: '#3b3b3e', accent: '#f06a35', logo: { src: 'img/jerrari-logo.svg', aspect: 798.74 / 1365.44, hMm: 70 }, sayings: [
    { lines: ['WORLD’S BEST', '3D PRINTED', 'STORAGE SYSTEM'] },
    { lines: ['JUST ONE', 'SMALL CHANGE.'], small: 'Six prototypes later.', type: 'wide' },
    { lines: ['COFFEE IN.', 'PARTS OUT.'], type: 'wide', accent: [1] },
    { lines: ['IT WORKED', 'IN FUSION.'], type: 'mono' },
    { lines: ['FINAL', 'FINAL 2', 'FINAL 2 FIXED', 'FINAL 3'], type: 'mono', accent: [3] },
    { lines: ['I HAD A', 'FIVE-MINUTE', 'IDEA.', 'THREE PRINTERS', 'ARE ON IT.'], accent: [4] },
    { lines: ['DO NOT', 'DISTURB.', 'FIXING THINGS', 'THAT WORK.'], accent: [0, 1] },
    { lines: ['I MADE A THING', 'TO HOLD', 'THE THINGS', 'I MAKE', 'THINGS WITH.'], accent: [0] },
    { lines: ['I WAS LEFT', 'UNSUPERVISED', 'WITH CALIPERS'], accent: [1], scale: [1, 1.4, 1] },   // Astra: the middle line largest, in orange
    { lines: ['IN MY DEFENSE,', 'I HAD ACCESS', 'TO CAD.'], type: 'mono', accent: [2], scale: [1, 1, 1.6] },   // Astra (2026-10-26): technical monospace, CAD. the point
    { lines: ['I WAS NORMAL', 'BEFORE I OWNED', 'A 3D PRINTER.'], accent: [2], scale: [1, 1, 1.15] },
    { lines: ['THIS IS WHAT', 'HAPPENS WHEN', 'THE PROTOTYPE', 'WORKS.'], accent: [3], scale: [1, 1, 1, 1.5] },
    { lines: ['GOT FILAMENT?', '', 'I HAVE PLANS.'], type: 'wide', accent: [2], scale: [1, 0.6, 1] },   // two blocks, room between them
  ] },
  modulith: { voice: 'modulith', body: '#4a4c54', ink: '#ececee', accent: '#ff6a1a', logo: { src: 'img/modulith-square.svg', aspect: 908.3 / 715.5, hMm: 54 }, sayings: [
    { lines: ['NEED DRAWER', 'PRINT DRAWER', 'PRINT DRAWER', 'PRINT DRAWER', 'PRINT DRAWER', 'PRINT DRAWER', 'PRINT DRAWER'], accent: [0] },
    { lines: ['NEEDED A DRAWER.', 'PRINTED A DRAWER.', 'NEEDED A CASE.', 'PRINTED A CASE.', 'ANYWAY,', 'THIS IS A WALL NOW.'], accent: [5] },
    { lines: ['I ♥', 'MODULAR', 'STORAGE', 'SYSTEMS'], type: 'wide' },   // Astra: the benchmark for readability
    { lines: ['I CAME.', 'I SAW.', 'I PRINT DRAWER.'], type: 'wide', accent: [2], scale: [1, 1, 1.1] },
    { lines: ['THOSE SPOOLS', 'AREN’T GOING TO', 'BECOME DRAWERS', 'THEMSELVES.'], accent: [2] },
    { lines: ['A PLACE FOR', 'EVERYTHING.', 'AND PARTS', 'FOR MORE', 'PLACES.'], accent: [2, 3, 4] },
    { lines: ['I CAN STOP', 'ANY TIME.', 'ONE MORE', 'DRAWER.'], accent: [2, 3] },
    { lines: ['THIS WAS SUPPOSED', 'TO SAVE SPACE.'], accent: [1] },
    { lines: ['EMPTY DRAWER?', 'EXPANSION', 'CAPACITY.'], accent: [1, 2] },
    { lines: ['ORGANIZED CHAOS.', 'NOW WITH LABELS.'] },
    { lines: ['ONE MORE DRAWER.', 'THEN I’M DONE.'], small: 'Last updated: one drawer ago.', accent: [1] },
  ] },
  paper: { voice: 'modulith', body: null, ink: '#2c2d31', accent: '#ff6a1a', logo: { src: 'img/modulith-square.svg', aspect: 908.3 / 715.5, hMm: 54 } },
};
export const MUG_LOOKS = ['jerrari', 'modulith', 'paper'];
/* MILESTONE SAYINGS (Astra 2026-10-26: "Milestones unlock sayings into the eligible pool; they don't force the same joke
 * every time. Use actual drawer count for {N}, overall dimensions for tall or wide builds, and occupied grid units for
 * build size"): each joins its voice's pool when the build meets it (`facts`: buildFacts). `{N}` is the drawer count. */
export const MUG_MILESTONES = [
  { id: 'small', voice: 'modulith', when: (f) => f.cells <= 4, saying: { lines: ['SMALL BUILD.', '', 'BIG PLANS.'], accent: [2], scale: [1, 0.5, 1.2] } },
  { id: 'medium', voice: 'modulith', when: (f) => f.cells >= 5 && f.cells <= 12, saying: { lines: ['LOOK WHAT', 'ONE DRAWER', 'STARTED.'], accent: [1] } },
  { id: 'large', voice: 'modulith', when: (f) => f.cells >= 13, saying: { lines: ['WE’RE GONNA', 'NEED A', 'BIGGER SPOOL.'], accent: [2], scale: [1, 1, 1.2] } },
  { id: 'huge', voice: 'modulith', when: (f) => f.cells >= 30 || f.widthMm >= 900, saying: { lines: ['AT THIS POINT', 'IT’S FURNITURE.'], accent: [1], scale: [1, 1.2] } },
  { id: 'tall', voice: 'modulith', when: (f) => f.heightMm >= 350, saying: { lines: ['TAKING', 'ORGANIZATION', 'TO NEW HEIGHTS.'], accent: [2] } },
  { id: 'drawers', voice: 'modulith', when: (f) => f.drawers >= 8, saying: { lines: ['{N} DRAWERS.', '', 'SO MANY', 'POSSIBILITIES.'], accent: [0], scale: [1.4, 0.4, 1, 1] } },
  { id: 'labelled', voice: 'modulith', when: (f) => f.drawers >= 2 && f.labelled >= f.drawers, saying: { lines: ['A PLACE FOR', 'EVERYTHING.', 'AND NOW', 'IT HAS A NAME.'], accent: [2, 3] } },
  { id: 'scope', voice: 'jerrari', when: (f) => f.cells >= 13 || f.drawers >= 8, saying: { lines: ['DESIGN A DRAWER,', 'THEY SAID.', '', 'I MAY HAVE', 'MISUNDERSTOOD', 'THE SCOPE.'], accent: [4, 5], scale: [1, 1, 0.45, 0.8, 1.3, 1.5] } },   // Astra: three levels after a gap, THE SCOPE. the biggest
];
/* The facts the milestones read, from the build: `units` = [{ w, hh, drawer, label }] (grid columns, half-rows), `size` the
 * assembled box's { x, y } in mm */
export function buildFacts(units, size) {
  const drawers = units.filter((u) => u.drawer);
  return { cells: units.reduce((a, u) => a + (u.w || 1) * (u.hh || 2) / 2, 0), drawers: drawers.length, labelled: drawers.filter((u) => u.label && String(u.label).trim()).length, widthMm: size.x, heightMm: size.y };
}
export function unlockedSayings(facts) {
  const out = { jerrari: [], modulith: [] };
  for (const m of MUG_MILESTONES) if (m.when(facts)) out[m.voice].push({ ...m.saying, lines: m.saying.lines.map((l) => l.replace('{N}', String(facts.drawers))), milestone: m.id });
  return out;
}
export const sayingsOf = (look) => MUGS[MUGS[look].voice].sayings;
/* Astra's pairs, for when the camera catches two mugs: JERRARI's line, then MODULITH's answer */
export const MUG_PAIRS = [
  [{ lines: ['I MADE', 'MORE PARTS.'] }, { lines: ['I MADE', 'MORE ROOM.'] }],
  [{ lines: ['JUST ONE MORE', 'PROTOTYPE.'] }, { lines: ['JUST ONE MORE', 'DRAWER.'] }],
  [{ lines: ['THIS IS THE', 'FINAL VERSION.'] }, { lines: ['WE’VE HEARD', 'THAT BEFORE.'] }],
];
export const MUG_PAIR_SHARE = 0.25;   // a pair this often where there are two mugs or more, else a saying each
/* A build's own seed: FNV-1a over its link's text, so a build shows the same mugs every time it is opened, and another
 * build other ones */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(text).length; i++) { h ^= String(text).charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/* The mugs a build gets (Joey 2026-10-25: "maybe sometimes there's no mugs, other times there might be two or 3 mugs, they
 * don't have to be grouped together either, their position and rotation could be pretty random as long as they don't
 * block the build or clip into any other objects"): how many (MUG_COUNTS, the share of builds for 0, 1, 2 and 3), whether
 * the notebook and its pen are off the desk (NOTEBOOK_OFF_SHARE: the desk's left has no room for a mug with them on it),
 * and each mug's look, its back's saying (a pair now and then), its turn about its axis (its logo's facing, in degrees
 * from the room's front; its handle a quarter turn on) and a pick in [0, 1) among the free spots (pickSpots). The first
 * mug holds the coffee. `count` forces how many (the debug ?mugs=). */
export const MUG_COUNTS = [0.15, 0.3, 0.35, 0.2];
export const NOTEBOOK_OFF_SHARE = 0.35;
export function mugPlan(rng, { count = null, extra = null } = {}) {
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const pool = (look) => sayingsOf(look).concat((extra && extra[MUGS[look].voice]) || []);   // a look's voice, its milestones with it
  let n = 0, u = rng();
  while (n < MUG_COUNTS.length - 1 && u >= MUG_COUNTS[n]) { u -= MUG_COUNTS[n]; n++; }
  if (count != null) n = Math.max(0, Math.min(MUG_COUNTS.length - 1, count));
  const notebookOff = rng() < NOTEBOOK_OFF_SHARE;
  const pair = n >= 2 && rng() < MUG_PAIR_SHARE ? pick(MUG_PAIRS) : null;
  const mugs = [];
  for (let i = 0; i < n; i++) {
    // a pair's two lines on JERRARI's white and a MODULITH look; otherwise any look, no saying twice
    const look = pair && i < 2 ? (i === 0 ? 'jerrari' : (rng() < 0.5 ? 'modulith' : 'paper')) : pick(MUG_LOOKS);
    let back = pair && i < 2 ? pair[i] : pick(pool(look));
    for (let t = 0; t < 4 && mugs.some((m) => m.back === back || (m.back.milestone && m.back.milestone === back.milestone)); t++) back = pick(pool(look));
    mugs.push({ look, back, turnDeg: Math.round(rng() * 360), spot: rng() });
  }
  return { count: n, notebookOff, mugs };
}
/* The spots the mugs take: each mug's pick among `spots` still at least `apart` mm from the mugs placed before it (the
 * handles reach 84 mm from their axes, so two mugs at 170 never touch: Sol 01a17612) and `clear` of each of them (done.js:
 * neither hiding the other from the hero's camera), or null where none is left */
/* Whether two mugs at `a` and `b` (stage mm, x and z) stand apart as the camera at `cam` sees them: the angle between them
 * at the camera more than `share` of their two angular widths put together, each `radius` across (Astra 2026-10-25: "Avoid
 * the mugs hiding each other ... judge overlap from the intended camera position") */
export function apartFrom(cam, a, b, { radius = 70, share = 1.15 } = {}) {
  const ang = (p) => Math.atan2(p.x - cam.x, p.z - cam.z), half = (p) => Math.asin(Math.min(1, radius / Math.max(radius, Math.hypot(p.x - cam.x, p.z - cam.z))));
  let d = Math.abs(ang(a) - ang(b)); if (d > Math.PI) d = 2 * Math.PI - d;
  return d > share * (half(a) + half(b));
}
/* Which face of a mug turned `turnDeg` a shot should look at, and from where: its saying (the back, half a turn from the
 * logo) where that faces the room's front within `within` degrees, else the nearer of the two (a side view, the handle
 * and a seam of nothing, was the 2026-10-26 shot of a mug turned 75 deg); `az` the face's direction, degrees from the
 * room's front, as the shots' azimuths count (Astra: "Frame the punchline on the visible face") */
export function mugFace(turnDeg, within = 65) {
  const norm = (a) => { let x = ((a % 360) + 360) % 360; if (x > 180) x -= 360; return x; };
  const saying = norm(turnDeg + 180), logo = norm(turnDeg);
  if (Math.abs(saying) <= within || Math.abs(saying) <= Math.abs(logo)) return { side: 'saying', az: saying };
  return { side: 'logo', az: logo };
}
export function pickSpots(spots, picks, apart = 170, clear = () => true) {
  const out = [];
  for (const f of picks) {
    const free = spots.filter((p) => out.every((q) => !q || (Math.hypot(p.x - q.x, p.z - q.z) >= apart && clear(p, q))));
    out.push(free.length ? free[Math.floor(f * free.length) % free.length] : null);
  }
  return out;
}
/* Where a mug may stand anywhere on the desk: a grid of `step` over `desk`, each a circle of `radius` clear of every box in
 * `obstacles` grown by `gap` and inside the desk by `edge`. In rows from the back, left to right. */
export function deskSpots(obstacles, desk, { radius = 70, gap = 12, edge = 25, step = 30 } = {}) {
  const out = [];
  const clear = (p) => obstacles.every((b) => Math.hypot(Math.max(b.min.x - gap - p.x, 0, p.x - b.max.x - gap), Math.max(b.min.z - gap - p.z, 0, p.z - b.max.z - gap)) > radius);
  for (let z = desk.min.z + edge + radius; z <= desk.max.z - edge - radius; z += step) for (let x = desk.min.x + edge + radius; x <= desk.max.x - edge - radius; x += step) if (clear({ x, z })) out.push({ x, z });
  return out;
}

/* A saying's layout on a mug's back, in mm: the big lines one size, the largest that fits `w` wide and `h` tall (`fit(line,
 * size)` measures a line's width at a size), the small line a third of it; returns { size, small, lead } */
export function sayingLayout(saying, w, h, fit) {
  const n = saying.lines.length, smallShare = saying.small ? 0.42 : 0, lead = n >= 5 ? 1.02 : 1.12;   // a long stack set tight, as a mug's is
  const scales = saying.lines.map((_, i) => (saying.scale && saying.scale[i]) || 1);
  let size = h / ((scales.reduce((a, b) => a + b, 0) + smallShare) * lead);
  saying.lines.forEach((line, i) => { size = Math.min(size, w / Math.max(1e-6, fit(line, 1) * scales[i])); });
  for (const line of saying.small ? [saying.small] : []) size = Math.min(size, w / Math.max(1e-6, fit(line, 1)) / 0.36);
  return { size, small: size * 0.36, lead, scales };
}

/* THE SPOOLS (Joey 2026-10-26: "a 3d model of filament, we could even stack near or around the build and changes with the
 * colors selected for the build"; spool.js draws one). A build's spools: one per colour it is printed in (`colours`, its
 * filaments' hexes, at most SPOOL_MAX), in groups the build's seed picks: STACKS lying flat, two or three high, and spools
 * STANDING on their rims, each its own turn about the vertical. Always (Joey 2026-10-26: "there will always be filaments
 * on the desk, because filament is always used in the build, at least 4 or 5 filaments more than likely, unless they only
 * select a single color"). Each group's `spot` is a pick in [0, 1) among the free spots big enough for a spool. */
export const SPOOL_MAX = 32;   // a spool for every filament a build can wear (Joey 2026-10-26, of ten filaments and six spools: "can we maybe just keep stacking them? like maybe a crazy limit of the ceiling?")
export const SPOOL_TALL = 0.25;   // one stack of every colour
export const SPOOL_STAND = 0.15;   // a spool on its own, now and then: standing on its rim, mostly
export const SPOOL_HIGH = 6;   // a stack's height before the next colour starts another (391 mm), where the desk has a spot for one
/* how high a stack may go in a room: up to SPOOL_HEADROOM under the walls' top (the camera's own margin there), a spool a
   SPOOL_STEP, never under SPOOL_HIGH; `roomTop` and `deskY` in mm. The step is the worst a spool can take: its 65.2 mm,
   two flanges leaned the most and opposite (100 mm x 2 tan 1.5 deg = 5.2) and the slip's share of the lean (under 1), 72
   (Sol 01a17823: 67 let opposing leans of 70.4 a spool carry a stack past the margin) */
export const SPOOL_STEP = 72, SPOOL_HEADROOM = 150;
export function stackCap(roomTop, deskY) {
  if (!Number.isFinite(roomTop) || !Number.isFinite(deskY)) return SPOOL_HIGH;
  return Math.max(SPOOL_HIGH, Math.floor((roomTop - deskY - SPOOL_HEADROOM) / SPOOL_STEP));
}
export function spoolPlan(rng, colours) {
  const list = [...new Set((colours || []).map((c) => String(c).toLowerCase()))].sort().slice(0, SPOOL_MAX);   // sorted: the stage lists them in no fixed order
  if (!list.length) return { groups: [] };
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  /* mostly stacked (Joey, the same day, of two stacks of two: "just keep them stacked like this, you can even stack them in
     a single tall stack here and there"; of a stack and one standing: "or even this one is fine"): one tall stack of every
     colour in SPOOL_TALL of builds, else stacks of two or three, a spool standing on its rim now and then (SPOOL_STAND) */
  const groups = [];
  const turn = () => Math.round(rng() * 360);
  if (list.length >= 2 && rng() < SPOOL_TALL) return { groups: [{ kind: 'stack', colours: list, turnDeg: turn(), spot: rng() }] };
  let rest = list;
  while (rest.length) {
    if (rest.length === 1 || rng() < SPOOL_STAND) {
      groups.push({ kind: rng() < 0.7 ? 'stand' : 'stack', colours: [rest[0]], turnDeg: turn(), spot: rng() });   // alone: standing, or flat
      rest = rest.slice(1);
    } else {
      const n = Math.min(rest.length, rest.length === 4 || rng() < 0.5 ? 2 : 3);
      groups.push({ kind: 'stack', colours: rest.slice(0, n), turnDeg: turn(), spot: rng() });
      rest = rest.slice(n);
    }
  }
  return { groups };
}
/* A STACK AS HANDS LEAVE IT (Joey 2026-10-26: "make the stacked filament positioning slightly random and imperfect, like
 * it's impossible to stack it that neatly"): each spool lying flat sits up to SPOOL_SLIP off the stack's axis, at its own
 * turn, leaned up to SPOOL_LEAN (none now: see it), and raised by what the lean takes so its flange rests on
 * the one below (or the desk) without sinking into it. A flange is a plane, its height `lean` dotted with the point from
 * its centre; the two flanges' difference is linear, so its most, over where they overlap, is on that overlap's edge: on
 * one rim or the other (both sampled, a degree apart). Returns, per spool from the bottom, its centre {x, y, z} (mm, y from
 * the desk), `spin` (rad, about its own axis) and `lean` {x, z} (the slopes of its flanges, dy/dx and dy/dz). */
export const SPOOL_SLIP = 7;   // mm, never under a third of it: a stack never comes out square. Its reach, leaned, 7 + 100 cos 1.5° + 32.6 sin 1.5° = 107.8, inside done.js SPOOL_FOOT's 108 (Sol 01a17823: 8 reached 108.8)
/* degrees. 0 since 2026-10-26 (Joey, of the final scene: the dashed seams between stacked spools "are the main ones i'm
   noticing"): a leaned flange on a level one leaves a wedge of a gap, 0 at the touch and 2.6 mm across, and where it
   narrows under a pixel its dark line breaks into dashes that crawl as the camera moves (measured: level, the seams
   draw whole; a level 1 mm gap brings some back). The slip and the turn keep a stack from coming out square. The lean's
   draw from the rng stays, so every stack keeps its slip and turn as before. */
export const SPOOL_LEAN = 0;
export function stackPoses(rng, n, { half = 32.6, radius = 100 } = {}) {
  const out = [];
  let below = { x: 0, z: 0, lean: { x: 0, z: 0 }, top: 0, r: Infinity };   // the desk: level, and everywhere
  for (let k = 0; k < n; k++) {
    const a = rng() * 2 * Math.PI, r = k ? SPOOL_SLIP * (0.35 + 0.65 * rng()) : 0;   // the bottom one is where the plan put it
    const d = rng() * 2 * Math.PI, m = Math.tan(((0.3 + 0.7 * rng()) * SPOOL_LEAN * Math.PI) / 180);
    const lean = { x: m * Math.cos(d), z: m * Math.sin(d) }, x = r * Math.cos(a), z = r * Math.sin(a);
    const rise = (px, pz) => below.lean.x * (px - below.x) + below.lean.z * (pz - below.z) - lean.x * (px - x) - lean.z * (pz - z);   // the one below's top over this one's bottom
    let gap = -Infinity;
    for (let i = 0; i < 360; i++) {
      const cu = Math.cos((i * Math.PI) / 180), su = Math.sin((i * Math.PI) / 180);
      const px = x + radius * cu, pz = z + radius * su, qx = below.x + radius * cu, qz = below.z + radius * su;
      if (Math.hypot(px - below.x, pz - below.z) <= below.r) gap = Math.max(gap, rise(px, pz));     // this one's rim, over the one below
      if (k && Math.hypot(qx - x, qz - z) <= radius) gap = Math.max(gap, rise(qx, qz));            // the one below's rim, under this one
    }
    const y = below.top + gap + half;
    out.push({ x, y, z, spin: rng() * 2 * Math.PI, lean });
    below = { x, z, lean, top: y + half, r: radius };
  }
  return out;
}
