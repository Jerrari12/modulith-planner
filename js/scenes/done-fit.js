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
  const target = { x: centre.x, y: centre.y + radius * (shot.targetLift || 0), z: centre.z };
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

/* The baked contact shadow's footprint for the Fast tier: a disc-ish plane under the build, a little wider than it. */
export function contactFootprint(box, grow = 1.25) {
  const w = (box.max.x - box.min.x) * grow, d = (box.max.z - box.min.z) * grow;
  return { w, d, x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
}
