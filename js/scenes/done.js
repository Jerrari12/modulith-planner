/* THE DONE SCENE (the plan's 5b, first slice, 2026-10-23; DESIGN.md in D:/Claude - Output/done-scene-2026-10-23).
 *
 * "Done step = your build in real life" (the brief, §0 Assemble): when the instructions end, the finished build appears in
 * the Home office (lit as Joey directed it on 2026-10-23: soft neutral daylight, a light oak desk; the first bake was a
 * golden hour). This first slice is the brief's own Fast fallback and the plan's static hero: ONE room,
 * ONE lighting state baked into the room's textures (tools/done-scene/room.py), a fixed hero camera fitted to the build
 * and the free region of the canvas, props that slide clear of the build, the build's own shadow on a catcher over the
 * desk (a baked contact disc on Fast, which has no shadow map), no bokeh, no time cycle. Behind
 * `?done=room` (js/workspaces/assemble.js); nothing here loads until a visitor reaches Done with the flag on.
 * The second slice (2026-10-23) added the camera sequence: three curated shots the camera holds on and drifts between
 * (see `seq` below and done-fit.js), a grab that pauses it, the still hero under reduced motion and on Fast.
 *
 * The stage keeps every pass it has on the model (relief, AO, Very High accumulation) and lends this module four things
 * through `stage.holdScene` (js/main.js): the background, the environment, the shadow and the camera, held through a
 * theme flip, an auto-downgrade and a resize, the way the old cinema held them. Everything is put back on leave().
 *
 * Coordinates: the room GLB is metres, Y up, exported by Blender with the stage's axis convention (stage +Z = the build's
 * front); the stage is millimetres, so the room is scaled x1000 and translated so its `anchor_tabletop` empty lands on
 * (build centre x, 0, build back z). room.json carries the shot, the sun, the desk's extent and the prop slots in mm.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { shotCamera, slideProps, fitSlides, contactFootprint, maskQuad, SHOTS, SEQUENCE, sequenceAt, sequenceMode, driftTooSlow, DRAWER, drawerBeat, aimAt, pickDrawerUnit } from './done-fit.js';

const ROOM_GLB = 'scenes/home-office/room.glb';
const ROOM_JSON = 'scenes/home-office/room.json';
const SCALE = 1000;        // metres in the GLB -> the stage's millimetres
const ENTER_MS = 900;      // the camera's move into the shot (a grabbed camera drifts back after SEQUENCE.idleBackMs of stillness)
const SUN_MM = 1200;       // the room's sun, this far from the build: inside the shadow camera's 3000 mm far plane (see applyLights)
let loading = null;        // one load per page: the GLB and its JSON, shared by every entry
let tracked = false;

function loadRoom() {
  if (!loading) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loading = Promise.all([loader.loadAsync(ROOM_GLB), fetch(ROOM_JSON).then((r) => { if (!r.ok) throw new Error(`${ROOM_JSON}: ${r.status}`); return r.json(); })])
      .then(async ([gltf, json]) => ({ gltf, json, masks: await loadMasks(json) }))
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
}

/* THE PROPS' SHADOW MASKS (room.json `shadows.masks`, baked by tools/done-scene/room.py bake_shadow_masks, 2026-10-23): the
   desk and wall lightmaps are baked with the props OUT, and each prop group's shadow is its own ratio (the light on the
   surface with the group over the light without it) in a WebP beside room.glb, with its quad's extents in mm about the
   tabletop anchor. So a prop that slides or hides takes its shadow with it (bake2 left the keyboard's dark patch on the
   desk after the keyboard hid for a 12W build). Fetched once with the room, each a texture read as sRGB (the file is
   display-encoded like the lightmaps). One that fails to load is left out with a warning: the room comes on without that
   shadow. The deploy stamps room.json's URL (pages.yml), so the masks beside it take the same stamp. */
function loadMasks(json) {
  const list = json.shadows && Array.isArray(json.shadows.masks) ? json.shadows.masks : [];
  if (!list.length) return Promise.resolve([]);
  const q = ROOM_JSON.indexOf('?'), stamp = q < 0 ? '' : ROOM_JSON.slice(q), dir = ROOM_JSON.slice(0, ROOM_JSON.lastIndexOf('/') + 1);
  const tl = new THREE.TextureLoader();
  return Promise.all(list.map((m) => tl.loadAsync(dir + m.file + stamp)
    .then((t) => { t.colorSpace = THREE.SRGBColorSpace; return { ...m, tex: t }; })
    .catch((e) => { console.warn('[done scene] shadow mask', m.file, e); return { ...m, tex: null }; })));
}

/* the room's materials are its baked light: unlit, drawn as-is. Blender exports an Emission shader as a PBR material
   with a BLACK base and the bake as its EMISSIVE texture (factor white), not as KHR_materials_unlit; so the emissive map
   is the room's picture and the emissive factor its tint (2026-10-23: taking `map` alone painted the room white). A
   KHR_materials_unlit material already arrives as MeshBasicMaterial and is kept. Returns the materials it made, so
   leave() can dispose them (their textures are the cached GLB's and stay: Terra 01a16a22). */
function unlit(root) {
  const made = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      if (m.isMeshBasicMaterial) return m;
      const emissive = m.emissive && m.emissiveIntensity ? m.emissive.clone().multiplyScalar(m.emissiveIntensity) : null;
      const b = new THREE.MeshBasicMaterial({ side: m.side });
      if (m.emissiveMap) { b.map = m.emissiveMap; b.color.copy(emissive || new THREE.Color(0xffffff)); }
      else if (m.map) { b.map = m.map; b.color.copy(m.color || new THREE.Color(0xffffff)); }
      else { b.color.copy(m.color || new THREE.Color(0xffffff)); if (emissive) b.color.add(emissive); }
      made.push(b);
      return b;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
    o.castShadow = false; o.receiveShadow = false;
    o.raycast = () => {};                    // never a tap-to-identify target
    o.userData.doneRoom = true;
  });
  return made;
}

function boxOf(obj) { return new THREE.Box3().setFromObject(obj); }
const plain = (b) => ({ min: { x: b.min.x, y: b.min.y, z: b.min.z }, max: { x: b.max.x, y: b.max.y, z: b.max.z } });

function contactTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.28)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* Enter the room. Resolves to a handle { leave, onQuality, refit } once the room is on; `leave()` before that cancels. */
/* `sequence: false` is the room as a STAGE (the Colors workspace's Studio / Room toggle, Joey 2026-10-23): the still hero,
   the orbit free, no drifts and no drawer moment; the toolbar's camera button returns to the hero through `recenter()`. */
export function enterDoneScene(stage, { say, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, sequence = true } = {}) {
  const { scene, camera, controls, renderer } = stage;
  let cancelled = false, on = false;
  const parts = { group: null, catcher: null, wall: null, sprite: null, masks: [], slid: {}, env: null, tex: null, mats: [], raf: 0 };
  const was = { table: stage.table.visible, grid: stage.grid.visible,
    sun: { pos: stage.sun.position.clone(), color: stage.sun.color.clone(), intensity: stage.sun.intensity },
    hemi: { color: stage.hemi.color.clone(), ground: stage.hemi.groundColor.clone(), intensity: stage.hemi.intensity },
    fill: { intensity: stage.fill.intensity, color: stage.fill.color.clone() },
    sunHalfDeg: stage.sunHalfDeg,
    controls: controls.enabled, pan: controls.enablePan, dims: !!stage.dimsOn };
  let json = null, buildBox = null;
  const debug = new URLSearchParams(location.search).has('debug');

  /* THE CAMERA SEQUENCE (the plan's curated shots, 2026-10-23): hold on a shot, drift to the next, over SHOTS.tabletop
     fitted to this build (done-fit.js: the clock, the shots, the easing). A drift runs on animation frames; a hold runs
     on ONE timer, so the stage sees a still camera and the idle gate rests (Very High converges in the holds: a camera
     that never stops never settles, and the gate is the number the branch keeps). Not under reduced motion (the still
     hero). On Fast, and on a device whose first drift was judged too slow, the sequence CUTS instead of drifting
     (done-fit.js sequenceMode; Joey 2026-10-23: keep the look, "the camera just stays stationary for a bit before
     changing angle, rather than animating it"): the hold ends and the camera is on the next shot, one frame, no drawer
     moment. A hidden tab pauses the clock. A grab (any orbit) pauses it too; IDLE_BACK_MS after the last gesture the
     camera drifts, or cuts, into the next shot from wherever it was left. */
  const seq = { on: false, t0: 0, raf: 0, timer: 0, startTimer: 0, idleTimer: 0, pausedAt: null, from: null, movingTo: -1, cams: [], timing: { ...SEQUENCE }, grabbed: false,
    intervals: [], lastFrame: 0, slow: false, judged: false };   // the FIRST drift's frame intervals are the device's verdict (driftTooSlow), given once: a device that cannot drift smoothly cuts from then on; a later stall is not a verdict (Sol 01a16b2a)
  const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);
  const mode = (tier) => sequenceMode({ tier: tier || stage.quality, reduced, sequence, slow: seq.slow });
  const sequenceWanted = (tier) => mode(tier) !== 'off';
  const cutting = (tier) => mode(tier) === 'cut';
  /* THE DRAWER MOMENT (done-fit.js DRAWER): in the detail shot's hold, the unit the shot looks at slides its drawer out
     by a fraction of its travel and back before the drift. The unit is chosen once per entry (a labelled unit with a
     drawer, else any with one, nearest the front-left); the detail shot aims at it. Closed early by a grab, a hidden
     tab, a tier change, a drift or leave(). */
  const drawer = { unit: null, openTimer: 0, closeTimer: 0, open: false };
  function pickDrawer() {
    const units = (stage.build && stage.build.placed || []).map((u) => { const b = stage.unitBox(u.id); return { id: u.id, label: u.label, drawer: !!stage.unitHasDrawer && stage.unitHasDrawer(u.id), box: b.isEmpty() ? null : plain(b) }; });
    drawer.unit = pickDrawerUnit(units, plain(buildBox));
  }
  function shotsFor() {
    const list = SHOTS.tabletop.map((s) => ({ ...s }));
    if (json.shots && json.shots.hero) list[0] = { ...list[0], ...json.shots.hero, name: 'hero' };   // the bake's own hero shot wins
    if (drawer.unit) { const i = list.findIndex((s) => s.name === 'detail'); if (i >= 0) list[i] = { ...list[i], targetShift: aimAt(plain(buildBox), drawer.unit.box) }; }
    return list;
  }
  function fitShots() { seq.cams = shotsFor().map((s) => shotCamera(s, plain(buildBox), view())); }
  function drawerSet(open) {
    if (!drawer.unit || drawer.open === open || !stage.slideUnitDrawer) return;
    drawer.open = open;
    stage.slideUnitDrawer(drawer.unit.id, open, DRAWER.fraction);
  }
  function drawerCancel() { clearTimeout(drawer.openTimer); clearTimeout(drawer.closeTimer); drawer.openTimer = drawer.closeTimer = 0; drawerSet(false); }
  function drawerSchedule(holdMs) {
    drawerCancel();
    const beat = drawer.unit && drawerBeat(holdMs);
    if (!beat) return;
    drawer.openTimer = setTimeout(() => drawerSet(true), beat.openAt);
    drawer.closeTimer = setTimeout(() => drawerSet(false), beat.closeAt);
  }
  function setCam(c) { camera.position.set(c.position.x, c.position.y, c.position.z); controls.target.set(c.target.x, c.target.y, c.target.z); camera.fov = c.fov; camera.updateProjectionMatrix(); controls.update(); }
  function snapshot() { return { position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }; }
  function seqTick() {
    if (!seq.on || seq.pausedAt != null) return;
    const now = performance.now();
    const s = sequenceAt(now - seq.t0, seq.cams.length, seq.timing);
    if (s.moving) {
      if (cutting()) {   // a CUT: no frames spent on the move; the camera is on the next shot and that shot's hold begins now (the clock re-based on it)
        seq.movingTo = -1; drawerCancel(); setCam(seq.cams[s.to]);
        seq.t0 = now - s.to * (seq.timing.holdMs + seq.timing.moveMs);
        stage.invalidateFrame();
        seq.timer = setTimeout(seqTick, Math.max(16, seq.timing.holdMs));
        return;
      }
      if (seq.movingTo !== s.to) { seq.movingTo = s.to; seq.from = snapshot(); seq.intervals.length = 0; seq.lastFrame = now; drawerCancel(); }   // a drift starts from wherever the camera IS (a grab may have moved it); a drawer still out goes back
      else if (!seq.judged) { seq.intervals.push(now - seq.lastFrame); seq.lastFrame = now; }
      const b = seq.cams[s.to];
      camera.position.lerpVectors(seq.from.position, v3(b.position), s.k); controls.target.lerpVectors(seq.from.target, v3(b.target), s.k);
      camera.fov = seq.from.fov + (b.fov - seq.from.fov) * s.k; camera.updateProjectionMatrix(); controls.update();
      seq.raf = requestAnimationFrame(seqTick);
    } else {
      if (seq.movingTo !== -1) {   // land exactly on the shot, then be still
        seq.movingTo = -1; setCam(seq.cams[s.at]);
        /* the drift that just ended is the device's own measurement: a weak GPU or a phone that drew it under 20 fps cuts
           between the shots for the rest of the visit rather than drifting again (sequenceMode: the look is baked, a cut
           is one frame). Decided once; the tier's auto-downgrade is one-way and slower to notice. */
        if (!seq.judged) { seq.judged = true; if (driftTooSlow(seq.intervals, seq.timing.maxFrameMs, seq.timing.moveMs)) seq.slow = true; }
        if (!cutting() && shotsFor()[s.at].name === 'detail') drawerSchedule(seq.timing.holdMs);   // the drawer moment, in this hold (it animates: none when cutting)
      }
      seq.timer = setTimeout(seqTick, Math.max(16, s.holdLeft));
    }
  }
  function seqStart() {
    if (seq.on || !on || !sequenceWanted()) return;   // the tier may have dropped to Fast while the entrance timer was pending (Sol 01a16b2a)
    if (!drawer.unit) pickDrawer();
    fitShots();
    seq.on = true; seq.t0 = performance.now(); seq.pausedAt = null; seq.movingTo = -1; seq.grabbed = false;
    if (document.hidden) { seq.pausedAt = seq.t0; return; }   // a tab hidden before the sequence began: start paused, the visibility handler resumes it (Sol 01a16b2a)
    seqTick();
  }
  function seqStop() {
    seq.on = false; seq.pausedAt = null; seq.grabbed = false;
    cancelAnimationFrame(seq.raf); clearTimeout(seq.timer); clearTimeout(seq.startTimer); clearTimeout(seq.idleTimer);
    drawerCancel();
  }
  function seqPause() { if (!seq.on || seq.pausedAt != null) return; seq.pausedAt = performance.now(); cancelAnimationFrame(seq.raf); clearTimeout(seq.timer); drawerCancel(); }
  function seqResume() { if (!seq.on || seq.pausedAt == null) return; seq.t0 += performance.now() - seq.pausedAt; seq.pausedAt = null; seqTick(); }
  function armReturn() { clearTimeout(seq.idleTimer); seq.idleTimer = setTimeout(driftBack, seq.timing.idleBackMs); }
  function onVisibility() {
    if (document.hidden) { clearTimeout(seq.idleTimer); seqPause(); }
    else if (seq.grabbed) armReturn();   // grabbed, then hidden before the return fired: the return is re-armed, not lost (Sol 01a16b2a: it stranded the sequence)
    else seqResume();
  }
  function onGrabStart() { if (!seq.on) return; clearTimeout(seq.idleTimer); seqPause(); seq.grabbed = true; }
  function onGrabEnd() {
    if (!seq.on || !seq.grabbed) return;
    /* the stage's own 'end' listener has just handed the camera to the visitor (camOverride: its return button appears,
       the toolbar's camera button lights). In the room the sequence is the return, so take it straight back: the stage's
       button would fly the camera to the step's view, out of the room's shot. */
    if (stage.setCamFree) stage.setCamFree(false);
    armReturn();
  }
  function driftBack() {
    if (!seq.on || !seq.grabbed || document.hidden) return;
    // the clock restarts at the start of this beat's move, so the next tick drifts into the next shot from the visitor's view
    const t = seq.timing, beat = t.holdMs + t.moveMs;
    const s = sequenceAt(seq.pausedAt - seq.t0, seq.cams.length, t);
    seq.t0 = performance.now() - (s.at * beat + t.holdMs);
    seq.pausedAt = null; seq.grabbed = false; seq.movingTo = -1;
    seqTick();
  }

  function view() {
    const el = renderer.domElement, sa = stage.safeArea || { left: 0, right: 0, top: 0, bottom: 0 };
    const width = Math.max(1, el.clientWidth), height = Math.max(1, el.clientHeight);
    return { width, height, free: { w: Math.max(80, width - sa.left - sa.right), h: Math.max(80, height - sa.top - sa.bottom) } };
  }
  function applyLights(tier) {
    const s = json.sun, k = json.sky || {};
    /* SUN_MM, not 3000: the stage's shadow camera (fitShadowCamera, js/main.js) has its far plane at 3000 mm from the
       light, so a sun 3000 mm out put the desk BEHIND the build outside the shadow frustum - the build's cast shadow
       was clipped to a sliver at its feet while the props' baked shadows ran back and right (Joey, 2026-10-23; measured
       2954 mm to the target, far 3000; at 1200 mm the full shadow drew). The studio's own sun sits about 780 mm out. */
    stage.sun.position.set(s.dir[0], s.dir[1], s.dir[2]).normalize().multiplyScalar(SUN_MM);
    stage.sun.color.set(s.color || '#ffb876'); stage.sun.intensity = s.intensity != null ? s.intensity : 2.6;
    stage.hemi.color.set(k.color || '#e8d9c4'); stage.hemi.groundColor.set(k.ground || '#6b5a48'); stage.hemi.intensity = k.intensity != null ? k.intensity : 0.9;
    stage.fill.intensity = 0.12;
    stage.setSunHome();   // Very High's samples jitter about the sun's HOME and put it back there: re-home it on the room's sun
    /* ... and over the ROOM'S sun disc, not the studio's. Very High averages the shadow over a cone of ACC_SUN_HALF_DEG
       (6 for the studio's soft look); the room was baked with a 2 degree disc (room.json sun.halfDeg = 1), and over 6
       degrees the build's shadow faded to a faint gradient beside the props' crisp baked ones (Joey, 2026-10-23). */
    if (s.halfDeg != null && stage.setSunHalfDeg) stage.setSunHalfDeg(s.halfDeg);
    // the tier's shadow or the baked disc, never both; applyQuality has just reset the rig's intensities on a tier change
    const shadow = !!(stage.QUALITY[tier || stage.quality] || {}).shadow;
    if (parts.catcher) parts.catcher.visible = shadow;
    if (parts.wall) parts.wall.visible = shadow;
    if (parts.sprite) parts.sprite.visible = !shadow;
  }
  function placeCamera(animate) {
    const c = shotCamera(shotsFor()[0], plain(buildBox), view());
    const p1 = new THREE.Vector3(c.position.x, c.position.y, c.position.z), t1 = new THREE.Vector3(c.target.x, c.target.y, c.target.z);
    cancelAnimationFrame(parts.raf);
    if (!animate) { camera.position.copy(p1); controls.target.copy(t1); camera.fov = c.fov; camera.updateProjectionMatrix(); controls.update(); stage.invalidateFrame(); return; }
    const p0 = camera.position.clone(), t0 = controls.target.clone(), f0 = camera.fov, start = performance.now();
    const step = (now) => {
      if (!on) return;
      const k = Math.min(1, (now - start) / ENTER_MS), e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(p0, p1, e); controls.target.lerpVectors(t0, t1, e);
      camera.fov = f0 + (c.fov - f0) * e; camera.updateProjectionMatrix(); controls.update();
      if (k < 1) parts.raf = requestAnimationFrame(step);
    };
    parts.raf = requestAnimationFrame(step);
  }

  const ready = loadRoom().then(({ gltf, json: j, masks }) => {
    if (cancelled) return null;
    json = j;
    buildBox = stage.assembledBox.clone();
    if (buildBox.isEmpty()) throw new Error('no build to place');
    // the room, scaled to millimetres, its anchor on the build's back-centre at desk height
    const group = gltf.scene.clone(true);
    parts.mats = unlit(group);
    group.name = 'done-room';
    group.scale.setScalar(SCALE);
    const anchor = group.getObjectByName('anchor_tabletop');
    const a = anchor ? anchor.position : new THREE.Vector3();
    const centre = buildBox.getCenter(new THREE.Vector3());
    group.position.set(centre.x - a.x * SCALE, 0 - a.y * SCALE, buildBox.min.z - a.z * SCALE);
    group.updateMatrixWorld(true);
    // props slide clear of the build along their slots, by group
    const anchorWorld = new THREE.Vector3(centre.x, 0, buildBox.min.z);
    const d = json.desk || { x0: -900, x1: 900, zFront: 700, zBack: -40 };
    // props slide clear of the build along their slots, by group; a group that cannot clear it INSIDE the desk's extent
    // hides rather than hanging past the edge (a build wider than the desk's free run: done-fit.js fitSlides)
    const props = [];
    /* a prop is any node carrying a slot: a mesh, or a GROUP of meshes (a multi-material prop, the snake plant's leaves,
       comes out of the glTF as a Group `leaf_N` with the extras and child meshes without them: 2026-10-23, the leaves
       stayed behind when the pot slid or hid, since only meshes were looked at) */
    group.traverse((o) => { if (o.userData.slot && (o.isMesh || o.children.some((c) => c.isMesh))) props.push({ obj: o, group: o.userData.group || o.name, slot: o.userData.slot, gap: (+o.userData.gap || 0.06) * SCALE, box: plain(boxOf(o)) }); });
    const slid = fitSlides(props, slideProps(props, plain(buildBox)), { x0: anchorWorld.x + d.x0, x1: anchorWorld.x + d.x1 });
    for (const p of props) { const dx = slid[p.group]; if (dx === null) p.obj.visible = false; else if (dx) p.obj.position.x += dx / SCALE; }
    parts.slid = slid;
    group.updateMatrixWorld(true);
    parts.group = group;
    scene.add(group);
    // the shadow catcher over the desk top (its extent from room.json, relative to the anchor), and the Fast tier's disc
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(d.x1 - d.x0, d.zFront - d.zBack).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.42, depthWrite: false }));
    catcher.position.set(anchorWorld.x + (d.x0 + d.x1) / 2, 0.3, anchorWorld.z + (d.zBack + d.zFront) / 2);
    catcher.receiveShadow = true; catcher.castShadow = false; catcher.renderOrder = 1; catcher.raycast = () => {};
    catcher.userData.doneRoom = true;
    parts.catcher = catcher; scene.add(catcher);
    /* ... and one standing just in front of the WALL behind the desk (Joey 2026-10-23: the props' baked shadows climb the
       wall, the build's live one stopped at the desk's back edge, since only the desk top caught it). The wall's surface
       is the wall anchor's plane (the GLB's anchor_wall, else room.json's anchors against the tabletop one); the catcher
       spans the desk run with a margin and reaches 1.6 m up. Inside the shadow frustum: the sun 1200 mm out, far 3000. */
    const wallAnchor = group.getObjectByName('anchor_wall');
    const wallZ = wallAnchor ? wallAnchor.getWorldPosition(new THREE.Vector3()).z
      : (json.anchors && json.anchors.wall && json.anchors.tabletop ? anchorWorld.z + (json.anchors.wall[2] - json.anchors.tabletop[2]) : null);
    if (wallZ != null) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(d.x1 - d.x0 + 1200, 1600), new THREE.ShadowMaterial({ opacity: 0.42, depthWrite: false }));
      wall.position.set(anchorWorld.x + (d.x0 + d.x1) / 2, 800, wallZ + 0.3);   // a plane facing +z: toward the desk
      wall.receiveShadow = true; wall.castShadow = false; wall.renderOrder = 1; wall.raycast = () => {};
      wall.userData.doneRoom = true;
      parts.wall = wall; scene.add(wall);
    }
    /* THE PROPS' SHADOWS, slid with the props (loadMasks): one quad per group per surface, the mask MULTIPLIED over the desk
       top or the wall: the framebuffer's display value times the mask's, which is the shadow the lightmap used to carry, to
       within the sRGB toe. The multiply is spelled out as CustomBlending (zero x source colour, the alpha left alone): on
       this stage three's MultiplyBlending is IGNORED and the quad replaces the frame (js/main.js measured it on the AO
       composite, "byte-identical to NoBlending", and the Very High blit uses CustomBlending for the same reason; the first
       bake3 proof shot drew the desk white inside every quad, 2026-10-23). Offset along x by the group's slide and hidden
       with a hidden group. Textures, so every tier has them, Fast included; the build's own live shadow stays the
       catchers' business. Placed by done-fit.js maskQuad, 0.5 mm off the surface like the catchers (the depth test); the
       order among these coplanar multiplies and the ShadowMaterial does not matter, multiplication commutes. Disposed on
       leave; the textures are the cached load's and stay, like the GLB's. */
    parts.masks = [];
    for (const m of masks || []) {
      if (!m.tex) continue;
      const q = maskQuad(m, { x: anchorWorld.x, z: anchorWorld.z }, wallZ, slid[m.group], 0.5, { x0: d.x0, x1: d.x1 });   // a desk quad is cut at the desk's ends (Sol 01a16bc5)
      if (!q) continue;
      const geo = new THREE.PlaneGeometry(q.w, q.h);
      if (q.u0 > 0 || q.u1 < 1) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, q.u0 + uv.getX(i) * (q.u1 - q.u0)); uv.needsUpdate = true; }   // the texture window follows the cut
      if (q.surface === 'desk') geo.rotateX(-Math.PI / 2);   // lying on the desk, the image's top toward the wall; a wall mask faces +z, toward the desk
      const quad = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: m.tex, transparent: true, depthWrite: false, toneMapped: false,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
        blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
      quad.position.set(q.x, q.y, q.z); quad.visible = q.visible;
      quad.renderOrder = 1; quad.raycast = () => {}; quad.castShadow = false; quad.receiveShadow = false;
      quad.userData.doneRoom = true; quad.userData.doneShadow = { group: m.group, surface: m.surface, dx: q.visible ? (slid[m.group] || 0) : null, u0: q.u0, u1: q.u1 };
      parts.masks.push(quad); scene.add(quad);
    }
    const fp = contactFootprint(plain(buildBox));
    parts.tex = contactTexture();
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(fp.w, fp.d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: parts.tex, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.position.set(fp.x, 0.2, fp.z); sprite.renderOrder = 1; sprite.raycast = () => {}; sprite.userData.doneRoom = true;
    parts.sprite = sprite; scene.add(sprite);
    // the build's lighting: the room itself, seen from the build, as the environment (the baked textures are its light)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envRoom = group.clone(true); envRoom.position.sub(centre); envScene.add(envRoom);
    parts.env = pmrem.fromScene(envScene, 0.04, 10, 60000).texture;
    pmrem.dispose();
    // the stage's holds: background off, our environment, the shadow on whatever the theme, the camera ours
    stage.table.visible = false; stage.grid.visible = false;
    if (was.dims) stage.setDims(false);   // the brief: no dimension callouts in the room
    stage.holdScene(true, { environment: parts.env });
    applyLights(stage.quality);
    // the orbit stays available for a grab (the style doc: a gentle orbit, then the drift back); no pan, the shots own the aim
    controls.enabled = true; controls.enablePan = false;
    on = true;
    document.documentElement.dataset.done = 'room';
    placeCamera(!reduced);
    if (sequenceWanted(stage.quality)) seq.startTimer = setTimeout(seqStart, reduced ? 0 : ENTER_MS + 50);
    addEventListener('resize', refit);
    document.addEventListener('visibilitychange', onVisibility);
    controls.addEventListener('start', onGrabStart); controls.addEventListener('end', onGrabEnd);
    if (debug) window.__GEN2_DONE__ = { get slides() { return { ...parts.slid }; }, get shadows() { return parts.masks.map((q) => ({ ...q.userData.doneShadow, visible: q.visible, x: q.position.x, y: q.position.y, z: q.position.z, w: q.geometry.parameters.width, h: q.geometry.parameters.height })); },
      get sequence() { return { on: seq.on, wanted: sequenceWanted(), mode: mode(), cams: seq.cams.map((c) => [c.position.x, c.position.y, c.position.z]), paused: seq.pausedAt != null, grabbed: seq.grabbed, movingTo: seq.movingTo, at: seq.on && seq.pausedAt == null ? sequenceAt(performance.now() - seq.t0, seq.cams.length, seq.timing).at : -1, shots: seq.cams.length, slow: seq.slow, timing: { ...seq.timing }, drawer: { unit: drawer.unit ? drawer.unit.id : null, open: drawer.open } }; },
      setTiming(t) { Object.assign(seq.timing, t); seq.judged = false; seq.slow = false; if (seq.on) seqStop(); seqStart(); },   // a new clock is a new verdict
      jump(i) { if (!seq.on) return; cancelAnimationFrame(seq.raf); clearTimeout(seq.timer); drawerCancel(); seq.t0 = performance.now() - i * (seq.timing.holdMs + seq.timing.moveMs); seq.pausedAt = null; seq.movingTo = -2; seqTick(); } };   // to the start of shot i's hold (-2: "land on it")
    if (!tracked) { tracked = true; stage.track('done:room'); }
    stage.invalidateFrame();
    return handle;
  }).catch((e) => {
    if (cancelled) return null;
    console.warn('[done scene]', e);
    if (say) say('The room could not load; the build stays on the stage.');
    return null;
  });

  /* back to the hero after a grab (the toolbar's camera button in Colors, where there is no sequence to drift back): the
     stage's hold on the camera is released and the shot is taken again, animated */
  function recenter() {
    if (!on || seq.on) return;
    if (stage.setCamFree) stage.setCamFree(false);
    placeCamera(!reduced);
  }
  function refit() {
    if (!on) return;
    if (!seq.on) { if (!stage.camFree) placeCamera(false); return; }   // a camera the visitor holds (no sequence to take it back) is left where it is
    fitShots();   // the shots follow the free region; a hold re-lands on its shot, a drift lands on the refitted one
    if (seq.movingTo === -1 && seq.pausedAt == null) setCam(seq.cams[sequenceAt(performance.now() - seq.t0, seq.cams.length, seq.timing).at]);
  }
  function leave() {
    cancelled = true;
    if (!on) return;
    on = false;
    seqStop();
    cancelAnimationFrame(parts.raf);
    removeEventListener('resize', refit);
    document.removeEventListener('visibilitychange', onVisibility);
    controls.removeEventListener('start', onGrabStart); controls.removeEventListener('end', onGrabEnd);
    if (debug) delete window.__GEN2_DONE__;
    delete document.documentElement.dataset.done;
    for (const k of ['group', 'catcher', 'wall', 'sprite']) { const o = parts[k]; if (o) { scene.remove(o); if (o.geometry && k !== 'group') o.geometry.dispose(); if (o.material && k !== 'group') o.material.dispose(); parts[k] = null; } }
    for (const q of parts.masks) { scene.remove(q); q.geometry.dispose(); q.material.dispose(); }   // the props' shadow quads; their textures are the cached load's
    parts.masks = []; parts.slid = {};
    if (parts.tex) { parts.tex.dispose(); parts.tex = null; }
    for (const m of parts.mats) m.dispose();   // the room's own materials; their textures are the cached GLB's
    parts.mats = [];
    stage.sun.position.copy(was.sun.pos); stage.sun.color.copy(was.sun.color); stage.sun.intensity = was.sun.intensity;
    if (was.sunHalfDeg != null && stage.setSunHalfDeg) stage.setSunHalfDeg(was.sunHalfDeg);
    stage.setSunHome();
    stage.hemi.color.copy(was.hemi.color); stage.hemi.groundColor.copy(was.hemi.ground); stage.hemi.intensity = was.hemi.intensity;
    stage.fill.intensity = was.fill.intensity; stage.fill.color.copy(was.fill.color);
    stage.table.visible = was.table; stage.grid.visible = was.grid;
    if (was.dims) stage.setDims(true);
    stage.holdScene(false);
    if (parts.env) { parts.env.dispose(); parts.env = null; }
    controls.enabled = was.controls; controls.enablePan = was.pan;
    stage.resetView();   // the guided camera of the page the stage is on (the finished step, or the one a click chose)
    stage.invalidateFrame();
  }
  function onQuality(tier) {
    if (!on) return;
    applyLights(tier);
    if (sequenceWanted(tier)) { if (!seq.on) seqStart(); else if (cutting(tier)) drawerCancel(); }   // a drop to Fast mid-hold: the drawer's timers would outlive it, and cuts have no drawer moment (Terra 01a16b6b)
    else { clearTimeout(seq.startTimer); if (seq.on) { seqStop(); placeCamera(false); } }   // none wanted (reduced motion; a stage): the fixed hero, and no sequence still to start (Sol 01a16b2a). A drop to Fast lands a running drift at its next tick (cutting)
  }
  const handle = { leave, onQuality, refit, recenter, get on() { return on; } };
  return { ready, leave };
}
