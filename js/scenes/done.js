/* THE DONE SCENE (the plan's 5b, first slice, 2026-10-23; DESIGN.md in D:/Claude - Output/done-scene-2026-10-23).
 *
 * "Done step = your build in real life" (the brief, §0 Assemble): when the instructions end, the finished build appears in
 * the Home office at golden hour. This first slice is the brief's own Fast fallback and the plan's static hero: ONE room,
 * ONE lighting state baked into the room's textures (tools/done-scene/room.py), a fixed hero camera fitted to the build
 * and the free region of the canvas, props that slide clear of the build, the build's own shadow on a catcher over the
 * desk (a baked contact disc on Fast, which has no shadow map), no bokeh, no camera sequence, no time cycle. Behind
 * `?done=room` (js/workspaces/assemble.js); nothing here loads until a visitor reaches Done with the flag on.
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
import { shotCamera, slideProps, contactFootprint } from './done-fit.js';

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
      .then(([gltf, json]) => ({ gltf, json }))
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
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
export function enterDoneScene(stage, { say, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
  const { scene, camera, controls, renderer } = stage;
  let cancelled = false, on = false;
  const parts = { group: null, catcher: null, sprite: null, env: null, tex: null, mats: [], raf: 0 };
  const was = { table: stage.table.visible, grid: stage.grid.visible,
    sun: { pos: stage.sun.position.clone(), color: stage.sun.color.clone(), intensity: stage.sun.intensity },
    hemi: { color: stage.hemi.color.clone(), ground: stage.hemi.groundColor.clone(), intensity: stage.hemi.intensity },
    fill: { intensity: stage.fill.intensity, color: stage.fill.color.clone() },
    sunHalfDeg: stage.sunHalfDeg,
    controls: controls.enabled, dims: !!stage.dimsOn };
  let json = null, buildBox = null;

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
    if (parts.sprite) parts.sprite.visible = !shadow;
  }
  function placeCamera(animate) {
    const shot = (json.shots && json.shots.hero) || { az: 30, el: 16, fovV: 37.8, fill: 0.36, targetLift: -0.08 };
    const c = shotCamera(shot, plain(buildBox), view());
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

  const ready = loadRoom().then(({ gltf, json: j }) => {
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
    const props = [];
    group.traverse((o) => { if (o.isMesh && o.userData.slot) props.push({ obj: o, group: o.userData.group || o.name, slot: o.userData.slot, gap: (+o.userData.gap || 0.06) * SCALE, box: plain(boxOf(o)) }); });
    const slid = slideProps(props, plain(buildBox));
    for (const p of props) { const d = slid[p.group]; if (d) p.obj.position.x += d / SCALE; }
    group.updateMatrixWorld(true);
    parts.group = group;
    scene.add(group);
    // the shadow catcher over the desk top (its extent from room.json, relative to the anchor), and the Fast tier's disc
    const anchorWorld = new THREE.Vector3(centre.x, 0, buildBox.min.z);
    const d = json.desk || { x0: -900, x1: 900, zFront: 700, zBack: -40 };
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(d.x1 - d.x0, d.zFront - d.zBack).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.42, depthWrite: false }));
    catcher.position.set(anchorWorld.x + (d.x0 + d.x1) / 2, 0.3, anchorWorld.z + (d.zBack + d.zFront) / 2);
    catcher.receiveShadow = true; catcher.castShadow = false; catcher.renderOrder = 1; catcher.raycast = () => {};
    catcher.userData.doneRoom = true;
    parts.catcher = catcher; scene.add(catcher);
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
    controls.enabled = false;
    on = true;
    document.documentElement.dataset.done = 'room';
    placeCamera(!reduced);
    addEventListener('resize', refit);
    if (!tracked) { tracked = true; stage.track('done:room'); }
    stage.invalidateFrame();
    return handle;
  }).catch((e) => {
    if (cancelled) return null;
    console.warn('[done scene]', e);
    if (say) say('The room could not load; the build stays on the stage.');
    return null;
  });

  function refit() { if (on) placeCamera(false); }
  function leave() {
    cancelled = true;
    if (!on) return;
    on = false;
    cancelAnimationFrame(parts.raf);
    removeEventListener('resize', refit);
    delete document.documentElement.dataset.done;
    for (const k of ['group', 'catcher', 'sprite']) { const o = parts[k]; if (o) { scene.remove(o); if (o.geometry && k !== 'group') o.geometry.dispose(); if (o.material && k !== 'group') o.material.dispose(); parts[k] = null; } }
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
    controls.enabled = was.controls;
    stage.resetView();   // the guided camera of the page the stage is on (the finished step, or the one a click chose)
    stage.invalidateFrame();
  }
  const handle = { leave, onQuality: (tier) => { if (on) applyLights(tier); }, refit, get on() { return on; } };
  return { ready, leave };
}
