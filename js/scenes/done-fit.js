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
 * floor): `from` is where it opens, `to` (a moving shot) where it is when the frame has gone black again, the move eased
 * across the whole visible time. `fill` sizes the build's sphere in the frame; `distMm` instead sets the camera's
 * distance from its aim (the macro); `aim` points a shot at the drawer unit ('drawer': its box centre, as the detail shot
 * always did; 'drawer-front': a spot on its faceplate). Four still, four moving, so a still can sit between two moves. */
export const GRAMMAR = {
  tabletop: [
    { name: 'hero', from: { az: 28, el: 20, fovV: 29.9, fill: 0.5, targetLift: -0.08 } },   // room.json's own hero wins
    { name: 'push', from: { az: 13, el: 12, fovV: 20, fill: 0.56, targetLift: -0.06 }, to: { az: 6, el: 9, fovV: 20, fill: 0.76, targetLift: -0.06 } },   // a long lens pushing in on the front, drifting a few degrees
    { name: 'low', from: { az: -34, el: -7, fovV: 46, fill: 0.78, targetLift: 0.14 } },   // down at the desk with a wide lens, looking up, locked off
    { name: 'detail', from: { az: 30, el: 10, fovV: 24, fill: 1.35, targetLift: -0.3, aim: 'drawer' }, drawer: true },   // the drawer moment in its hold
    { name: 'slide', from: { az: -22, el: 7, fovV: 22, fill: 0.7, targetLift: -0.04 }, to: { az: 14, el: 7, fovV: 22, fill: 0.7, targetLift: -0.04 } },   // a slow truck across the front
    { name: 'top', from: { az: 40, el: 50, fovV: 28, fill: 0.58 } },   // high, looking down on the covers, locked off
    // pushing in on a corner of the drawer unit's faceplate, on an edge, at a grazing angle (a flat face that close was a
    // frame of plain orange, the 2026-10-24 tour). It ended at 105 mm, a frame about 26 mm tall, where a 0.2 mm layer
    // spanned 5.84 CSS px on a 720 px canvas, past the relief's cutoff of 4; Joey found it "a bit too zoomed in ... maybe
    // bring it out about twice as far?" (2026-10-25): 420 to 210 mm now, a frame about 52 mm tall, where a layer spans
    // 4.30 px at its end on a 1080 px canvas (3.19 at 800), so the layer lines draw only on a canvas about 1,003 CSS px
    // tall and up
    { name: 'macro', from: { az: -40, el: 12, fovV: 14, distMm: 420, aim: 'drawer-front' }, to: { az: -31, el: 8, fovV: 14, distMm: 210, aim: 'drawer-front' } },
    { name: 'side', from: { az: 66, el: 15, fovV: 26, fill: 0.62 }, to: { az: 50, el: 13, fovV: 26, fill: 0.62 } },   // a slow arc round the side
  ],
  /* A WALL BUILD hangs on the back wall over the desk (roomAnchor), so it is seen standing in front of the desk or from
     its chair: the shots keep near the build's own height, none looks down on it from over the wall's top, and the top
     shot gives way to a wide one of the whole corner, the desk under the build (2026-10-25) */
  wall: [
    { name: 'hero', from: { az: 24, el: 4, fovV: 30, fill: 0.5, targetLift: -0.04 } },
    { name: 'push', from: { az: 12, el: 3, fovV: 20, fill: 0.56 }, to: { az: 6, el: 2, fovV: 20, fill: 0.76 } },
    { name: 'low', from: { az: -30, el: -24, fovV: 46, fill: 0.7, targetLift: 0.1 } },   // from the desk chair, looking up at it
    { name: 'detail', from: { az: 30, el: 3, fovV: 24, fill: 1.35, targetLift: -0.3, aim: 'drawer' }, drawer: true },
    { name: 'slide', from: { az: -22, el: 2, fovV: 22, fill: 0.7 }, to: { az: 14, el: 2, fovV: 22, fill: 0.7 } },
    { name: 'wide', from: { az: 30, el: 10, fovV: 34, fill: 0.3, targetLift: -0.35 } },   // the corner: the desk under the build
    { name: 'macro', from: { az: -40, el: 6, fovV: 14, distMm: 420, aim: 'drawer-front' }, to: { az: -31, el: 4, fovV: 14, distMm: 210, aim: 'drawer-front' } },   // as the tabletop's (Joey 2026-10-25)
    { name: 'side', from: { az: 66, el: 6, fovV: 26, fill: 0.62 }, to: { az: 50, el: 5, fovV: 26, fill: 0.62 } },
  ],
  /* AN UNDER-TABLE BUILD hangs under the desk's front edge (roomAnchor; Joey 2026-10-25: "align the under-table build to
     be installed under this scenes table"), so it is seen from in front of the desk, from about its top or below:
     nothing looks down past the edge onto it (the desk top would hide it), the low shot looks up at the rails and the
     drawers' undersides, and the top shot gives way to a wide one of the desk with the build under its edge */
  'under-table': [
    { name: 'hero', from: { az: 26, el: 6, fovV: 30, fill: 0.5 } },
    { name: 'push', from: { az: 12, el: 3, fovV: 20, fill: 0.56 }, to: { az: 6, el: 2, fovV: 20, fill: 0.76 } },
    { name: 'low', from: { az: -30, el: -18, fovV: 46, fill: 0.72, targetLift: 0.1 } },   // crouched in front of the desk, looking up under it
    { name: 'detail', from: { az: 30, el: 4, fovV: 24, fill: 1.35, targetLift: -0.3, aim: 'drawer' }, drawer: true },
    { name: 'slide', from: { az: -22, el: 3, fovV: 22, fill: 0.7 }, to: { az: 14, el: 3, fovV: 22, fill: 0.7 } },
    { name: 'wide', from: { az: 28, el: 18, fovV: 34, fill: 0.3, targetLift: 0.3 } },   // the desk, the build under its edge
    { name: 'macro', from: { az: -40, el: 5, fovV: 14, distMm: 420, aim: 'drawer-front' }, to: { az: -31, el: 3, fovV: 14, distMm: 210, aim: 'drawer-front' } },   // as the tabletop's (Joey 2026-10-25)
    { name: 'side', from: { az: 60, el: 2, fovV: 26, fill: 0.62 }, to: { az: 46, el: 2, fovV: 26, fill: 0.62 } },   // round the knee-space side
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
 *   by the finish over the oak's colour as baked (light.desk_top.albedo), its grain kept. The light the DESK bounces onto
 *   the room stays the oak's: there is no dark-desk endpoint. Measured against a true re-bake with a white desk
 *   (#f2f1ec, 2026-10-25): the rest of the room 1.3 to 2.1 display levels too dark (blue 1.9 to 3.2), the desk top
 *   itself 1.6 to 2.3 too bright (Sol 01a17447: stated, not corrected).
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
/* the desk top's look for a choice: which texture it draws (`bake`, its own lightmap; `light`, the light-only map) and the
   factor on it. Null when the choice cannot be drawn: a plain colour or a tint on a bake with no light-only map. */
export function deskLook(choice, light) {
  const preset = DESK_FINISHES.find((p) => p.id === choice) || (HEX.test(choice || '') ? { kind: 'plain', hex: choice } : null);
  if (!preset || preset.kind === 'bake') return { use: 'bake', factor: [1, 1, 1] };
  const lin = hexToLinear(preset.hex);
  if (!lin || !light) return null;
  if (preset.kind === 'tint') return Array.isArray(light.albedo) && light.albedo.every((v) => v > 0) ? { use: 'bake', factor: lin.map((v, i) => v / light.albedo[i]) } : null;
  return light.scale > 0 ? { use: 'light', factor: lin.map((v) => v / light.scale), colour: lin } : null;
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
  for (const key of ['az', 'el', 'fovV', 'fill', 'distMm', 'targetLift']) if (a[key] != null && b[key] != null) m[key] = a[key] + (b[key] - a[key]) * k;
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
  const cam = clampToInterior(shotCamera(s, box, view), interior);
  const floor = floorY + FLOOR_MM;
  return cam.position.y < floor ? { ...cam, position: { ...cam.position, y: floor }, floored: true } : cam;
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
export const STEAM = { fps: { high: 24, balanced: 15 }, width: 2.8, height: 4.6, alpha: 0.6, mist: 0.16, slices: [-0.75, -0.25, 0.25, 0.75] };
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
