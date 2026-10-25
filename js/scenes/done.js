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
import { slideProps, fitSlides, contactFootprint, maskQuad, GRAMMAR, BEAT, beatAt, rngFrom, planCycle, mixShot, fitShot, grammarMode, driftTooSlow, entranceTooSlow, DRAWER, drawerBeat, aimAt, pickDrawerUnit, reliefResolves, lensFor } from './done-fit.js';

const ROOM_GLB = 'scenes/home-office/room.glb';
const ROOM_JSON = 'scenes/home-office/room.json';
const SCALE = 1000;        // metres in the GLB -> the stage's millimetres
const ENTER_MS = 900;      // the camera's move into the shot
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
   leave() can dispose them (their textures are the cached GLB's and stay: Terra 01a16a22).
   ⚠ A LIVE mesh is the exception (room.py's `live` tag; the caliper's steel, 2026-10-24): a metal has no diffuse colour,
   so its baked lightmap would be black, which is how the first calipers drew. It keeps the glTF's own metallic PBR
   material (the beam's printed scale its base colour), cloned per entry because the cached GLB's is shared and the
   room's environment is set on it once it exists (enterDoneScene). Its shadow is baked as a mask, so it casts none. */
function unlit(root) {
  const made = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.live) {
      const m = (Array.isArray(o.material) ? o.material[0] : o.material).clone();
      o.material = m; made.push(m);
      o.castShadow = false; o.receiveShadow = false;
      o.raycast = () => {};
      o.userData.doneRoom = true;
      return;
    }
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

/* The room's interior as a box in stage mm, read off the walls and floor the GLB names (room.py: `wall_back`, the
 * `wall_left_*` pieces around the window, `floor`): the walls' inner faces, the wall tops, the floor's top, and Infinity
 * to the front, where the room is open. The right side has no wall either, but the back wall ENDS there, and past its end
 * the backdrop ends: a camera beyond it looking back-left would frame the void past the wall whenever a shot swings right
 * of this room's hero, so the back wall's end bounds that side on purpose (Terra 01a16bf1 called it over-clamping; it
 * reframes, never breaks, and no shot of this room reaches it). null without walls, and then no shot is clamped
 * (done-fit.js clampToInterior). Read after the group is placed and scaled, so the box is in the stage's frame. */
function roomInterior(group) {
  const back = new THREE.Box3(), left = new THREE.Box3(), floor = new THREE.Box3();
  group.traverse((o) => { if (!o.isMesh) return; if (/^wall_back/.test(o.name)) back.union(boxOf(o)); else if (/^wall_left/.test(o.name)) left.union(boxOf(o)); else if (o.name === 'floor') floor.union(boxOf(o)); });
  if (back.isEmpty() && left.isEmpty()) return null;
  const top = Math.min(back.isEmpty() ? Infinity : back.max.y, left.isEmpty() ? Infinity : left.max.y);
  return { x0: left.isEmpty() ? -Infinity : left.max.x, x1: back.isEmpty() ? Infinity : back.max.x, y0: floor.isEmpty() ? -Infinity : floor.max.y, y1: top, z0: back.isEmpty() ? -Infinity : back.max.z, z1: left.isEmpty() ? Infinity : left.max.z };
}

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
/* `orbit: false` is the FINAL SCENE (Assemble, Joey 2026-10-23: "don't let them rotate the camera"): the controls are off,
   the shots are the only views, and the handle's `nextShot()` cuts to the next one. */
export function enterDoneScene(stage, { say, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, sequence = true, orbit = true } = {}) {
  const { scene, camera, controls, renderer } = stage;
  let cancelled = false, on = false;
  const parts = { group: null, catcher: null, wall: null, sprite: null, masks: [], slid: {}, env: null, tex: null, mats: [], raf: 0, fade: null };
  const was = { table: stage.table.visible, grid: stage.grid.visible,
    sun: { pos: stage.sun.position.clone(), color: stage.sun.color.clone(), intensity: stage.sun.intensity },
    hemi: { color: stage.hemi.color.clone(), ground: stage.hemi.groundColor.clone(), intensity: stage.hemi.intensity },
    fill: { intensity: stage.fill.intensity, color: stage.fill.color.clone() },
    sunHalfDeg: stage.sunHalfDeg,
    controls: controls.enabled, pan: controls.enablePan, dims: !!stage.dimsOn };
  let json = null, buildBox = null, interior = null;   // interior: the room's box from its walls (roomInterior), the shots' clamp
  const debug = new URLSearchParams(location.search).has('debug');

  /* THE CAMERA GRAMMAR (done-fit.js GRAMMAR, BEAT, beatAt, planCycle, grammarMode; Joey 2026-10-24, DESIGN.md §8l):
     distinct cameras in a random order that never repeats a shot, each fitted to this build, CUT between through a dip
     to black (parts.fade: a black layer over the canvas, under the cinema bars and the strip). A moving shot moves slowly
     across its whole visible time, on animation frames; a still one holds on ONE timer, so the stage sees a still camera
     and the idle gate rests (Very High converges in the black, before the frame fades in). Static first: 'full' moves the
     moving shots (High and Very High, once the entrance move drew at 20 fps or better: the device's verdict, taken on the
     entrance and again on every moving shot, one-way); 'still' locks every shot off at the middle of its move (Balanced,
     Fast, a slow verdict); 'off' (reduced motion) is the still hero, the views turned by hand with a plain cut. A hidden
     tab pauses the clock. The scene has no orbit (`orbit: false`): the shots are the only views, and Next view dips to
     the next one. `seq.k`: where the shot on screen is along its move; `cutAt`: Next view's dip-out, the camera held. */
  const seq = { on: false, t0: 0, raf: 0, timer: 0, startTimer: 0, pausedAt: null, pendingBegin: false, shots: null, order: [], idx: 0, cycle: 0,
    seed: Date.now() >>> 0, rng: null, shot: null, skipIn: false, phase: null, k: 0.5, moving: false, cutAt: null, cutK: null, fade: 0,
    /* the beat, and three windows the e2e stretches to reach its races (Sol 01a16e0e): the entrance's length, the frames
       the entry waits before it, the frames a new shot waits in the black; `window.__DONE_TIMING__` sets any of them before
       the entry, with ?debug only (and `warmRelief: false`, the probe's control arm: no relief compiled ahead) */
    timing: { ...BEAT, enterMs: ENTER_MS, preFrames: 2, waitFrames: 2, ...(debug && window.__DONE_TIMING__ ? window.__DONE_TIMING__ : {}) },
    manual: null, slow: false, judged: false, frames: [], lastFrame: 0, checked: false, warm: null };
  const mode = (tier) => grammarMode({ tier: tier || stage.quality, reduced, sequence, slow: seq.slow });
  const sequenceWanted = (tier) => mode(tier) !== 'off';
  const moves = (tier) => mode(tier) === 'full';
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
    const list = GRAMMAR.tabletop.map((s) => ({ ...s, from: { ...s.from }, to: s.to ? { ...s.to } : undefined }));
    const hero = list.find((s) => s.name === 'hero');
    if (hero && json.shots && json.shots.hero) hero.from = { ...hero.from, ...json.shots.hero };   // the bake's own hero shot wins
    return list;
  }
  /* the shots that look at the drawer unit: the detail shot at its box centre (targetShift, as before), the macro at the
     top-left corner of its face (the faceplate's edge, the seam to the case and to the unit above: structure at the scale
     where the layer lines show) */
  function aims() {
    if (!drawer.unit || !drawer.unit.box) return {};
    const b = drawer.unit.box;
    return { drawer: aimAt(plain(buildBox), b), front: { x: b.min.x + 0.08 * (b.max.x - b.min.x), y: b.max.y - 0.12 * (b.max.y - b.min.y), z: b.max.z } };
  }
  const shotNamed = (name) => (seq.shots || shotsFor()).find((s) => s.name === name);
  const fitAt = (shot, k) => fitShot(mixShot(shot, k), plain(buildBox), view(), interior, aims());   // inside the room and above the desk, at k along its move
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
  function putCam(c) { camera.position.set(c.position.x, c.position.y, c.position.z); controls.target.set(c.target.x, c.target.y, c.target.z); camera.fov = c.fov; camera.updateProjectionMatrix(); controls.update(); }
  /* THE RELIEF BY DISTANCE (Joey 2026-10-24; done-fit.js reliefResolves, PERF.md §5): the nearest the build comes to the
     camera says whether any layer can span the shader's cutoff; if none can, the stage takes the relief off
     (stage.setReliefOverride(false): a material rebuild, so once a shot, at its cut, in the black). A moving shot is
     decided for its whole move: on if either end resolves (the band limit fades the lines in as the camera closes, so
     the macro shows them where it ends). The scene only: the Colors stage orbits freely and keeps the tier's rule. */
  const relief = { px: null, on: null, distance: null, cutoffPx: null };
  const viewNow = () => { const el = renderer.domElement; return { width: Math.max(1, el.clientWidth), height: Math.max(1, el.clientHeight) }; };
  function reliefOf(c) { return stage.reliefBand && buildBox && !buildBox.isEmpty() ? reliefResolves(c, plain(buildBox), viewNow(), stage.reliefBand) : null; }
  function reliefFor(cams) {
    if (!sequence || !stage.setReliefOverride) return;
    const rs = cams.map(reliefOf).filter(Boolean);
    if (!rs.length) return;
    const best = rs.reduce((a, b) => (b.px > a.px ? b : a));
    Object.assign(relief, best);
    stage.setReliefOverride(best.on ? null : false);
  }
  function setCam(c, ends = [c]) { putCam(c); reliefFor(ends); }
  /* THE RELIEF COMPILED AHEAD (stage.warmRelief, 2026-10-24): the cut that turns the relief on compiles its programs on the
     cut's first frame, one frame of 1.2 to 1.4 s that the black waits through (the dip into the macro: 1.6 to 1.8 s of full
     black at High, 2.9 s at Very High; about 0.4 s with this). When a shot in the plan will turn it on (the macro, where
     its move ends), the stage builds them under a hold that begins on screen, the hero's landing above all, a frame the
     accumulation starts over on anyway; and again after a tier change, a program being per tier. The stage keys the work
     and skips a repeat. */
  function warmAhead(tier) {
    if (!seq.on || !stage.warmRelief || seq.timing.warmRelief === false) return;
    const moving = moves(tier);
    const ends = (s) => (moving && s.to ? [fitAt(s, 0), fitAt(s, 1)] : [fitAt(s, 0.5)]);   // as beginShot decides a shot's relief
    if (!seq.shots.some((s) => ends(s).some((c) => { const r = reliefOf(c); return !!(r && r.on); }))) return;
    const w = stage.warmRelief();
    if (w) seq.warm = w;
  }
  /* THE LENS (Very High's bokeh, 2026-10-24; done-fit.js lensFor, main.js THE LENS): a still shot of the moving grammar gets
     a thin lens, the build held sharp and the room beyond it soft, drawn by the stage's accumulator. So only where it
     accumulates (Very High); not a moving shot (nothing accumulates while the camera moves); not the detail shot (its
     drawer moment restarts the accumulation twice a hold, so the blur would come and go); not the still grammar (a
     device judged slow, a tier below High: every sample is a full render); and cleared whenever the grammar stops. */
  function setLensFor(shot, c) {
    if (!stage.setLens) return;
    const want = moves() && !seq.moving && !shot.drawer && !!(stage.accumulates && stage.accumulates()) && buildBox && !buildBox.isEmpty();
    stage.setLens(want ? lensFor(c, plain(buildBox), viewNow()) : null);
  }
  /* the dip: the black layer's opacity, eased over `ms` (into the black ease-in, out of it ease-out) */
  function fadeTo(opacity, ms) {
    seq.fade = opacity;
    const f = parts.fade;
    if (!f) return;
    f.style.transition = `opacity ${Math.max(0, Math.round(ms))}ms ${opacity ? 'ease-in' : 'ease-out'}`;
    f.style.opacity = String(opacity);
  }
  const currentShot = () => shotNamed(seq.order[seq.idx]);
  /* the next cycle of shots, once this one is used up: the hero first on the first cycle (the entrance lands on it), a
     later cycle never opening on the shot the last one closed on, a still between two moves where it can */
  function planNext() {
    const prev = seq.order.length ? seq.order[seq.order.length - 1] : null;
    seq.order = planCycle(seq.shots.map((s) => s.name), seq.rng, { first: seq.cycle === 0 ? 'hero' : null, prev, moving: (n) => !!shotNamed(n).to });
    seq.cycle++; seq.idx = 0;
  }
  /* a shot begins, in the black: the camera on its opening (a moving shot at its start, any shot locked off at the middle
     of its move), the relief decided for the whole shot, the stage told whether this one moves, the clock at the start of
     its dip-in (`skipIn`: at its hold, the frame already showing: the first shot, and a jump) */
  function beginShot({ skipIn = false } = {}) {
    const shot = currentShot();
    seq.shot = shot.name; seq.skipIn = skipIn; seq.cutAt = null; seq.cutK = null; seq.phase = null;
    seq.moving = moves() && !!shot.to;
    seq.k = seq.moving ? 0 : 0.5;
    const c = fitAt(shot, seq.k);
    setCam(c, seq.moving ? [c, fitAt(shot, 1)] : [c]);
    if (skipIn) warmAhead();   // a hold that begins on screen: the relief a later shot needs is compiled under it
    setLensFor(shot, c);
    if (stage.setMotionFull) stage.setMotionFull(seq.moving);   // a moving shot keeps the stage's settle passes on every frame: the room's contacts keep their AO while it moves
    seq.pausedAt = null; seq.frames.length = 0; seq.checked = false;
    stage.invalidateFrame();
    if (skipIn) { startClock(); return; }
    /* in the black, the clock waits for the new view to be DRAWN before the frame fades in: a cut that rebuilds the part
       materials (the relief on or off) compiles their shaders on its first frame, about a second on this laptop's GPU, and
       a dip-in already running would have shown the last shot's frame through it (the 2026-10-24 tour, the macro) */
    seq.waiting = true; fadeTo(1, 0);
    afterFrames(seq.timing.waitFrames, () => { seq.waiting = false; startClock(); });
  }
  function startClock() { seq.t0 = performance.now(); seq.lastFrame = seq.t0; tick(); }
  /* `fn` once `n` frames have gone by (the stage draws the frame it was invalidated for on the first of them) */
  function afterFrames(n, fn) {
    cancelAnimationFrame(seq.waitRaf);   // one wait at a time: a second one replaces the first (it would have run its callback too)
    const step = () => { if (--n <= 0) fn(); else seq.waitRaf = requestAnimationFrame(step); };
    seq.waitRaf = requestAnimationFrame(step);
  }
  /* where the shot on screen is: its own beat, or, once Next view asked for the next shot, a dip-out from that moment */
  function phaseNow(now) {
    if (seq.cutAt == null) return beatAt(now - seq.t0, seq.timing, { skipIn: seq.skipIn });
    const t = now - seq.cutAt, o = seq.timing.dipOutMs, bl = seq.timing.blackMs;
    if (t < o) return { phase: 'out', fade: 1, fadeMs: o - t, k: seq.cutK, left: o - t };
    if (t < o + bl) return { phase: 'black', fade: 1, fadeMs: 0, k: seq.cutK, left: o + bl - t };
    return { phase: 'next', fade: 1, fadeMs: 0, k: seq.cutK, left: 0 };
  }
  function tick() {
    // not while a new shot waits for its first frames: its clock has not begun, and the last shot's would run on (Sol 01a16e0e)
    if (!seq.on || seq.pausedAt != null || seq.waiting) return;
    const now = performance.now(), b = phaseNow(now);
    if (b.phase === 'next') { seq.idx++; if (seq.idx >= seq.order.length) planNext(); beginShot(); return; }
    if (b.phase !== seq.phase) {   // a phase begins: its fade, and in the detail shot's hold, when the shots move, its drawer moment
      seq.phase = b.phase;
      fadeTo(b.fade, b.fadeMs);
      if (b.phase === 'hold' && moves() && currentShot().drawer) drawerSchedule(b.left);
      if (b.phase === 'out') drawerCancel();
    }
    if (seq.moving && seq.cutAt == null) {
      seq.k = b.k;
      putCam(fitAt(currentShot(), seq.k));
      /* every moving shot is a verdict too, on its frames from 0.4 s to 2.4 s in (the first frames after a cut carry the
         new view's compiles): under 20 fps it locks off where it is, and the visit stays still from then on */
      const ms = now - seq.t0;
      if (ms > 400) seq.frames.push(now - seq.lastFrame);
      seq.lastFrame = now;
      if (!seq.checked && ms > 2400) {
        seq.checked = true;
        if (driftTooSlow(seq.frames, seq.timing.maxFrameMs, ms - 400)) { seq.slow = true; seq.judged = true; freeze(); }
      }
      if (seq.moving) { seq.raf = requestAnimationFrame(tick); return; }
    }
    seq.timer = setTimeout(tick, Math.max(16, b.left));
  }
  /* a moving shot locks off where it is (a slow verdict; a drop below High): the rest of it is a still, its drawer back.
     `resched`: called from outside the clock, which then needs its timer again */
  function freeze({ resched = false } = {}) {
    if (!seq.moving) return;
    seq.moving = false;
    cancelAnimationFrame(seq.raf);
    if (stage.setMotionFull) stage.setMotionFull(false);
    drawerCancel();
    if (resched && seq.on && seq.pausedAt == null && !seq.waiting) { clearTimeout(seq.timer); tick(); }   // a shot still waiting for its first frames starts its own clock (Sol 01a16e0e)
  }
  function seqStart() {
    if (seq.on || !on || !sequenceWanted()) return;   // the tier may have changed while the entrance timer was pending (Sol 01a16b2a)
    /* an entrance still moving (Next view during it, or a device so slow its last frame comes after the timer) ends here,
       its verdict taken on the frames it drew: two writers of one camera would fight to the entrance's end and leave it on
       the hero (Sol 01a16e0e) */
    if (parts.enter && !parts.enter.done) {
      cancelAnimationFrame(parts.raf); parts.enter.done = true;
      if (!seq.judged) { seq.judged = true; if (entranceTooSlow(parts.enter.intervals, seq.timing.maxFrameMs)) seq.slow = true; }
    }
    if (!drawer.unit) pickDrawer();
    seq.shots = shotsFor(); seq.rng = rngFrom(seq.seed); seq.order = []; seq.cycle = 0;
    planNext();
    seq.on = true;
    if (document.hidden) { seq.pausedAt = performance.now(); seq.pendingBegin = true; return; }   // a tab hidden before it began: it begins when the tab comes back (Sol 01a16b2a)
    beginShot({ skipIn: true });   // the entrance has landed on the hero: its hold begins now, no dip
  }
  function seqStop() {
    seq.on = false; seq.pausedAt = null; seq.pendingBegin = false; seq.moving = false; seq.cutAt = null; seq.waiting = false;
    cancelAnimationFrame(seq.raf); cancelAnimationFrame(seq.waitRaf); clearTimeout(seq.timer); clearTimeout(seq.startTimer);
    drawerCancel(); fadeTo(0, 0);
    if (stage.setMotionFull) stage.setMotionFull(false);
    if (stage.setLens) stage.setLens(null);   // no grammar, no lens (leave() comes through here too)
  }
  function seqPause() { if (!seq.on || seq.pausedAt != null) return; seq.pausedAt = performance.now(); cancelAnimationFrame(seq.raf); cancelAnimationFrame(seq.waitRaf); clearTimeout(seq.timer); drawerCancel(); }
  function seqResume() {
    if (!seq.on || seq.pausedAt == null) return;
    const d = performance.now() - seq.pausedAt;
    seq.pausedAt = null;
    if (seq.pendingBegin) { seq.pendingBegin = false; beginShot({ skipIn: true }); return; }
    if (seq.waiting) { afterFrames(seq.timing.waitFrames, () => { seq.waiting = false; startClock(); }); return; }   // hidden in the black, before the new view was drawn: wait for it again
    seq.t0 += d; if (seq.cutAt != null) seq.cutAt += d;
    seq.lastFrame = performance.now(); seq.phase = null;   // the phase takes up its fade again from where the frame is
    tick();
  }
  function onVisibility() { if (document.hidden) seqPause(); else seqResume(); }
  /* to a shot at once (by name, or by its place in GRAMMAR), its hold beginning now with no dip: the debug hook's (the
     e2e, the probe). It takes the place of the shot on screen in the plan, which otherwise goes on as it was. */
  function jumpTo(which) {
    if (!seq.on) return;
    const name = typeof which === 'number' ? (seq.shots[which] || {}).name : which;
    const i = seq.order.indexOf(name);
    if (i < 0) return;
    cancelAnimationFrame(seq.raf); cancelAnimationFrame(seq.waitRaf); seq.waiting = false; clearTimeout(seq.timer); drawerCancel();
    [seq.order[i], seq.order[seq.idx]] = [seq.order[seq.idx], seq.order[i]];
    if (document.hidden) { seq.pausedAt = performance.now(); seq.pendingBegin = true; seq.shot = name; setCam(fitAt(shotNamed(name), 0.5)); stage.invalidateFrame(); return; }   // shown, and the shot begins afresh when the tab comes back
    beginShot({ skipIn: true });
  }
  /* THE NEXT VIEW (the scene's strip): the shot on screen dips out from where it is (a moving one held still), and the
     next one in the plan fades in. With the sequence off (reduced motion: the still hero) the shots are turned by hand,
     locked off, a plain cut each. A stage (`sequence: false`) has no views to turn. */
  function nextShot() {
    if (!on || !sequence) return false;
    if (!seq.shots) seq.shots = shotsFor();
    if (sequenceWanted()) {
      clearTimeout(seq.startTimer);
      if (!seq.on) seqStart();   // the entrance timer still pending: the sequence begins now, on the hero, and dips on from it below
      if (seq.pausedAt != null || seq.waiting) return true;   // hidden: it waits with the tab; in the black before a shot: already on its way
      const b = phaseNow(performance.now());
      if (b.phase === 'out' || b.phase === 'black') return true;   // already on its way to the next one
      seq.cutAt = performance.now(); seq.cutK = seq.k;
      if (seq.moving) { cancelAnimationFrame(seq.raf); if (stage.setMotionFull) stage.setMotionFull(false); }
      drawerCancel();
      clearTimeout(seq.timer); seq.phase = null; tick();
    } else {
      seq.manual = ((seq.manual == null ? 0 : seq.manual) + 1) % seq.shots.length;
      setCam(fitAt(seq.shots[seq.manual], 0.5)); stage.invalidateFrame();
    }
    return true;
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
    const c = fitAt(shotNamed('hero'), 0);
    reliefFor([c]);   // the entrance lands on the hero: its relief from the start (the move only ever comes closer than the End page's view)
    const p1 = new THREE.Vector3(c.position.x, c.position.y, c.position.z), t1 = new THREE.Vector3(c.target.x, c.target.y, c.target.z);
    cancelAnimationFrame(parts.raf);
    if (!animate) { camera.position.copy(p1); controls.target.copy(t1); camera.fov = c.fov; camera.updateProjectionMatrix(); controls.update(); stage.invalidateFrame(); return; }
    const p0 = camera.position.clone(), t0 = controls.target.clone(), f0 = camera.fov, start = performance.now();
    const intervals = []; let last = start;
    parts.enter = { intervals, done: false };   // seqStart ends an entrance still running and takes its verdict
    const step = (now) => {
      if (!on || parts.enter.done) return;
      intervals.push(now - last); last = now;
      const k = Math.min(1, (now - start) / seq.timing.enterMs), e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(p0, p1, e); controls.target.lerpVectors(t0, t1, e);
      camera.fov = f0 + (c.fov - f0) * e; camera.updateProjectionMatrix(); controls.update();
      if (k < 1) { parts.raf = requestAnimationFrame(step); return; }
      /* the entrance is the device's first verdict (DESIGN.md §8h: before any shot moves, not after a stuttering first
         one): a device whose median frame in it was over 50 ms, or that drew fewer than four, gets the still grammar
         from the start. Once a visit. (The scene's own setup stalls are drawn before the move begins: the entry waits
         two frames for them.) */
      parts.enter.done = true;
      if (sequence && !seq.judged) { seq.judged = true; if (entranceTooSlow(intervals, seq.timing.maxFrameMs)) seq.slow = true; }
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
    interior = roomInterior(group);   // the walls do not slide: the shots' clamp is fixed from here
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
    envRoom.traverse((o) => { if (o.userData.live) o.visible = false; });   // a lit metal in a scene with no lights renders black: keep it out of the room it reflects
    parts.env = pmrem.fromScene(envScene, 0.04, 10, 60000).texture;
    pmrem.dispose();
    // the live steel reflects the room on every tier, Fast's included (it has no scene environment of its own)
    for (const m of parts.mats) if (m.isMeshStandardMaterial) { m.envMap = parts.env; m.needsUpdate = true; }
    // the stage's holds: background off, our environment, the shadow on whatever the theme, the camera ours
    stage.table.visible = false; stage.grid.visible = false;
    if (was.dims) stage.setDims(false);   // the brief: no dimension callouts in the room
    stage.holdScene(true, { environment: parts.env });
    applyLights(stage.quality);
    // the scene has no orbit (Joey: "don't let them rotate the camera"); a stage (Colors) keeps it; never a pan, the shots own the aim
    controls.enabled = !!orbit; controls.enablePan = false;
    on = true;
    /* the dip to black (the grammar's transitions): a black layer over the canvas, in the stage's own wrapper, so the
       workspace above it (the cinema bars, the strip) stays drawn over the black */
    if (sequence && renderer.domElement.parentElement) {
      const f = document.createElement('div');
      f.id = 'done-fade'; f.setAttribute('aria-hidden', 'true');
      Object.assign(f.style, { position: 'absolute', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none' });
      renderer.domElement.parentElement.appendChild(f);
      parts.fade = f;
    }
    if (sequence && stage.setInteriorHidden) stage.setInteriorHidden(true);   // the scene's assembled build: the parts inside it are not drawn (PERF.md §4.8); a stage (Colors) orbits and keeps them
    document.documentElement.dataset.done = 'room';
    /* the entrance waits for the room's first frames: its materials' compiles, and the relief's rebuild when the hero
       turns it off, are drawn before the camera moves, so the move is smooth and is a fair verdict on the device (the
       2026-10-24 tour: a second of compile inside the 0.9 s move had this laptop's GPU judged slow) */
    reliefFor([fitAt(shotNamed('hero'), 0)]);
    stage.invalidateFrame();
    afterFrames(seq.timing.preFrames, () => {
      if (!on || seq.on) return;   // Next view in these frames has begun the grammar already: no entrance to make (Sol 01a16e0e)
      placeCamera(!reduced);
      if (sequenceWanted(stage.quality)) seq.startTimer = setTimeout(seqStart, reduced ? 0 : seq.timing.enterMs + 50);
    });
    addEventListener('resize', refit);
    document.addEventListener('visibilitychange', onVisibility);
    if (debug) window.__GEN2_DONE__ = { get slides() { return { ...parts.slid }; }, get relief() { return { override: stage.reliefOverride ? stage.reliefOverride() : null, ...relief }; }, get shadows() { return parts.masks.map((q) => ({ ...q.userData.doneShadow, visible: q.visible, x: q.position.x, y: q.position.y, z: q.position.z, w: q.geometry.parameters.width, h: q.geometry.parameters.height })); },
      /* the grammar as it stands: `names` the shots in GRAMMAR order, `fits` each one's camera at the middle of its move
         (clamped, fov), `ends` the shot on screen's two ends, `order` this cycle's plan and `idx` the place in it */
      get sequence() {
        const shots = seq.shots || shotsFor(), sh = seq.on ? currentShot() : null;
        const ends = sh ? [fitAt(sh, 0), fitAt(sh, 1)].map((c) => [c.position.x, c.position.y, c.position.z]) : [];
        return { on: seq.on, wanted: sequenceWanted(), mode: mode(), names: shots.map((s) => s.name), order: [...seq.order], idx: seq.idx, cycle: seq.cycle, seed: seq.seed,
          shot: seq.on ? seq.shot : null, phase: seq.phase, k: seq.k, moving: seq.moving, cut: seq.cutAt != null, fade: seq.fade, ends,
          waiting: !!seq.waiting, entering: !!(parts.enter && !parts.enter.done),
          fits: shots.map((s) => { const c = fitAt(s, 0.5); return { name: s.name, fov: c.fov, clamped: !!c.clamped, k: c.k, share: c.share, floored: !!c.floored, pos: [c.position.x, c.position.y, c.position.z] }; }),
          interior: interior && { ...interior }, paused: seq.pausedAt != null, manual: seq.manual, orbit: controls.enabled, slow: seq.slow, judged: seq.judged,
          timing: { ...seq.timing }, drawer: { unit: drawer.unit ? drawer.unit.id : null, open: drawer.open }, warm: seq.warm };
      },
      setTiming(t) { const { seed, ...rest } = t; Object.assign(seq.timing, rest); if (seed != null) seq.seed = seed >>> 0; seq.judged = false; seq.slow = false; if (seq.on) seqStop(); seqStart(); },   // a new clock is a new verdict (and a new seed a new plan)
      jump(which) { jumpTo(which); }, nextShot,   // to a shot by name (or its place in GRAMMAR), its hold beginning at once
      seek(ms) { if (!seq.on || seq.waiting || seq.pausedAt != null || seq.cutAt != null) return; cancelAnimationFrame(seq.raf); clearTimeout(seq.timer); seq.t0 = performance.now() - ms; seq.phase = null; tick(); } };   // the shot on screen's clock put at `ms`
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
    if (!seq.on) {
      if (stage.camFree) return;   // a camera the visitor holds (the Colors stage: no sequence to take it back) is left where it is
      if (seq.manual != null && seq.shots) { setCam(fitAt(seq.shots[seq.manual], 0.5)); stage.invalidateFrame(); }   // the view chosen by hand (reduced motion) is refitted, not the hero (Sol 01a16c20)
      else placeCamera(false);
      return;
    }
    // the shot on screen follows the new size: a still (or a held one) re-lands where it is along its move, a moving one
    // picks the new fit up on its next frame
    if ((!seq.moving || seq.cutAt != null) && seq.shot) {
      const c = fitAt(currentShot(), seq.cutK != null ? seq.cutK : seq.k);
      putCam(c);
      if (!seq.moving) setLensFor(currentShot(), c);   // the lens follows the new framing (its blur is in pixels of this view)
      stage.invalidateFrame();
    }
  }
  function leave() {
    cancelled = true;
    if (!on) return;
    on = false;
    seqStop();
    if (stage.setInteriorHidden) stage.setInteriorHidden(false);   // after seqStop's drawerCancel: every interior mesh back, no re-hide timer left
    if (stage.setReliefOverride) stage.setReliefOverride(null);    // the tier has its say again
    cancelAnimationFrame(parts.raf);
    removeEventListener('resize', refit);
    document.removeEventListener('visibilitychange', onVisibility);
    if (debug) delete window.__GEN2_DONE__;
    delete document.documentElement.dataset.done;
    if (parts.fade) { parts.fade.remove(); parts.fade = null; }
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
    /* a drop below High mid-shot: a moving shot locks off where it is, and the drawer's timers would outlive the drop (the
       still grammar has no drawer moment: Terra 01a16b6b) */
    if (sequenceWanted(tier)) {
      if (!seq.on) seqStart();
      else {
        if (!moves(tier)) { freeze({ resched: true }); drawerCancel(); }
        warmAhead(tier);
        if (seq.shot && seq.cutAt == null) setLensFor(currentShot(), fitAt(currentShot(), seq.k));   // a lens only where the new tier accumulates
      }
    }
    else { clearTimeout(seq.startTimer); if (seq.on) { seqStop(); placeCamera(false); } }   // none wanted (reduced motion; a stage): the fixed hero, and no sequence still to start (Sol 01a16b2a)
  }
  const handle = { leave, onQuality, refit, recenter, nextShot, get on() { return on; } };
  return { ready, leave };
}
