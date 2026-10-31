/* THE DONE SCENE (the plan's 5b, first slice, 2026-10-23; DESIGN.md in D:/Claude - Output/done-scene-2026-10-23).
 *
 * "Done step = your build in real life" (the brief, §0 Assemble): when the instructions end, the finished build appears in
 * the Home office (lit as Joey directed it on 2026-10-23: soft neutral daylight, a light oak desk; the first bake was a
 * golden hour). This first slice is the brief's own Fast fallback and the plan's static hero: ONE room,
 * ONE lighting state baked into the room's textures (tools/done-scene/room.py), a fixed hero camera fitted to the build
 * and the free region of the canvas, props that slide clear of the build, the build's own shadow on a catcher over the
 * desk (a baked contact disc on Fast, which has no shadow map), no bokeh, no time cycle. Behind
 * Done (js/workspaces/assemble.js) or Colors; nothing here loads until a visitor asks for the scene or the Room stage (`?done=off` keeps it off).
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
import { loadSpool, makeSpool, disposeSpool, makeTag, makeSticker, STICKER, disposeMark, tagInfo, MATERIAL_COLOURS } from './spool.js';
import { clampToInterior, insideRoom, slideProps, fitSlides, contactFootprint, maskQuad, gapDrop, STEAM, steamRate, steamSize, steamSlices, steamBeat, steamShown, driftFor, driftKind, driftCss, driftWanted, GRAMMAR, BEAT, beatAt, rngFrom, planCycle, mixShot, fitShot, blendShot, rowOf, around, MUGS, mugPlan, buildFacts, unlockedSayings, spoolPlan, SPOOL_MAX, SPOOL_HIGH, stackCap, stackPoses, hashSeed, pickSpots, apartFrom, mugFace, deskSpots, sayingLayout, MUG_SHOT_SHARE, BUILD_VIEWS, easeSine, grammarMode, driftTooSlow, entranceTooSlow, DRAWER, drawerBeat, aimAt, pickDrawerUnit, reliefResolves, lensFor, roomAnchor, WALL_PAINTS, DESK_FINISHES, wallFactor, wallWeight, bounceK, hexToLinear, linearToHex, deskLook, roomFloor } from './done-fit.js';

const ROOM_GLB = 'scenes/home-office/room.glb';
const ROOM_JSON = 'scenes/home-office/room.json';
const SCALE = 1000;        // metres in the GLB -> the stage's millimetres
const ENTER_MS = 900;      // the camera's move into the shot
const SUN_MM = 1200;       // the room's sun, this far from the build: inside the shadow camera's 3000 mm far plane (see applyLights)
/* the build's shadow on the wall, lighter than on the desk (Astra 2026-10-25: "Soften the build's wall shadow a little ... the
   desk and props are becoming more believable, so that shadow now stands out more"); its edge stays the room's 1 deg sun's,
   the props' own (Joey 2026-10-23: at 6 deg it "faded to a faint gradient beside the props' crisp baked ones") */
const WALL_SHADOW = 0.34;
let loading = null;        // one load per page: the GLB and its JSON, shared by every entry
let tracked = false;

function loadRoom() {
  if (!loading) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    /* the files room.json names (the masks, the light-only maps, the walls' bounce) start as soon as it is in, while the
       GLB is still coming: none of them needs it (2026-10-25: loaded one after another after it, they added 0.6 s to the
       entry on a 10 Mbit/s line). Each one catches its own failure. */
    const meta = fetch(ROOM_JSON).then((r) => { if (!r.ok) throw new Error(`${ROOM_JSON}: ${r.status}`); return r.json(); })
      .then((json) => Promise.all([loadMasks(json), loadLight(json), loadBounce(json)]).then(([masks, light, bounce]) => ({ json, masks, light, bounce })));
    const spool = loadSpool().catch((e) => { console.warn('[done scene] the spool did not load', e); return null; });   // the spools' flanges, with the room (spool.js)
    loading = Promise.all([loader.loadAsync(ROOM_GLB), meta, spool])
      .then(([gltf, m, spoolGeo]) => ({ gltf, ...m, spoolGeo }))
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

/* THE LIGHT-ONLY MAPS (room.json `light`, room.py --light-maps, 2026-10-25): a mesh's diffuse light with no colour, on its
   own lightmap UV, for the visitor's plain desk colours (done-fit.js deskLook). Read like the GLB's own lightmaps (sRGB,
   flipY off: the file's rows as the exporter writes them). One that fails to load leaves its mesh with the bake's look. */
function loadLight(json) {
  const list = json.light && typeof json.light === 'object' ? Object.entries(json.light) : [];
  if (!list.length) return Promise.resolve({});
  const q = ROOM_JSON.indexOf('?'), stamp = q < 0 ? '' : ROOM_JSON.slice(q), dir = ROOM_JSON.slice(0, ROOM_JSON.lastIndexOf('/') + 1);
  const tl = new THREE.TextureLoader();
  return Promise.all(list.map(([mesh, rec]) => tl.loadAsync(dir + rec.file + stamp)
    .then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return [mesh, { ...rec, tex: t }]; })
    .catch((e) => { console.warn('[done scene] light-only map', rec.file, e); return [mesh, { ...rec, tex: null }]; })))
    .then((pairs) => Object.fromEntries(pairs));
}

/* THE WALLS' BOUNCE (room.json `bounce`, tools/done-scene/endpoint.py, 2026-10-25): the light the walls bounce onto every
   surface, one atlas of small tiles, a rect per mesh. Read like the lightmaps (sRGB, flipY off). Without it a dark wall
   paints the wall alone and the rest of the room keeps the bake's bounce. */
function loadBounce(json) {
  if (!json.bounce || !json.bounce.file) return Promise.resolve(null);
  const q = ROOM_JSON.indexOf('?'), stamp = q < 0 ? '' : ROOM_JSON.slice(q), dir = ROOM_JSON.slice(0, ROOM_JSON.lastIndexOf('/') + 1);
  return new THREE.TextureLoader().loadAsync(dir + json.bounce.file + stamp)
    .then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return { ...json.bounce, tex: t }; })
    .catch((e) => { console.warn('[done scene] the walls\' bounce', json.bounce.file, e); return null; });
}
/* a room material that draws its bake less a share of the walls' bounce and a share of the desk's (bounce.desk, the
   second set of tiles in the same atlas, 2026-10-25): diffuse = colour x map - k x bounce(rect) - dk x bounce(drect),
   never below black; the rects and the shares live in userData.bounce, and paintRoom sets them all (the desk's rects
   follow its map; a room with no desk tiles leaves dk at 0). */
function addBounce(m, bounce, rect) {
  const s = bounce.size;
  const toUv = (r) => new THREE.Vector4(r[0] / s[0], r[1] / s[1], r[2] / s[0], r[3] / s[1]);
  m.userData.bounce = { k: new THREE.Vector3(), rect: toUv(rect), dk: new THREE.Vector3(), drect: toUv(rect), toUv };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBounce = { value: bounce.tex };
    sh.uniforms.uBounceK = { value: m.userData.bounce.k };
    sh.uniforms.uBounceRect = { value: m.userData.bounce.rect };
    sh.uniforms.uDeskK = { value: m.userData.bounce.dk };
    sh.uniforms.uDeskRect = { value: m.userData.bounce.drect };
    sh.fragmentShader = 'uniform sampler2D uBounce;\nuniform vec3 uBounceK;\nuniform vec4 uBounceRect;\nuniform vec3 uDeskK;\nuniform vec4 uDeskRect;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n\tdiffuseColor.rgb = max(diffuseColor.rgb - uBounceK * texture2D(uBounce, uBounceRect.xy + vMapUv * uBounceRect.zw).rgb - uDeskK * texture2D(uBounce, uDeskRect.xy + vMapUv * uDeskRect.zw).rgb, 0.0);');
  };
  m.customProgramCacheKey = () => 'done-bounce';
  m.needsUpdate = true;
}
/* A PLAIN DESK'S SHEEN (Joey 2026-10-25: "the black desk feels like a void? maybe a slight sheen or reflection on the table
   surface?"): the bake has no glossy at all, so a plain colour over the light-only map is flat paint, and a dark one reads
   as a hole. A laminate's coat reflects: Schlick's Fresnel for a dielectric (F0 0.04), reduced at grazing for a satin
   roughness (Fdez-Aguera's max(1 - roughness, F0)), of the room's own environment (the PMREM captured from the build,
   envMap, which also defines its CubeUV sampler), its diffuse scaled by 1 - F so the coat adds no light of its own.
   MeshBasicMaterial computes the world normal and position once an envMap is set; it has no CubeUV sampling, so the chunk
   is included here. The oak and the walnut keep the bake's matte look: off for them (paintRoom). The build is not in the
   environment, so it is not reflected. `userData.sheen.on` is 0 or 1, set by paintRoom. */
/* THE COFFEE'S STEAM, its shaders (makeSteam). The sheets (STEAM_VERT, STEAM_FRAG): unit quads (x -0.5..0.5, y 0..1), each
   turned about the vertical to face the camera and stood on the coffee at its own depth along the view (aSlice.x, in
   radii), sized in the stage's millimetres; a noise risen through a sheet as wide at its foot as the coffee's chord there
   (aSlice.y, in radii, a little inside the rim), its tendrils merging as it rises, widening and fading; each sheet its own
   seed (aSlice.z). The mist (STEAM_MIST_FRAG): a disc on the surface, two noises drifting across each other, thinning to
   its edge. */
const STEAM_NOISE = 'float sHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }\n'
  + 'float sNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );\n'
  + '\treturn mix( mix( sHash( i ), sHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( sHash( i + vec2( 0.0, 1.0 ) ), sHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y ); }\n'
  + 'float sFbm( vec2 p ) { float v = 0.0, a = 0.5; for ( int k = 0; k < 4; k ++ ) { v += a * sNoise( p ); p = p * 2.03 + vec2( 1.7, 9.2 ); a *= 0.5; } return v; }\n';
const STEAM_VERT = 'uniform float uW;\nuniform float uH;\nuniform float uR;\nattribute vec3 aSlice;\nvarying vec2 vUv;\nvarying vec3 vSlice;\n'
  + 'void main() {\n\tvUv = uv;\n\tvSlice = aSlice;\n'
  + '\tvec3 foot = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;\n\tvec3 toCam = cameraPosition - foot;\n\ttoCam.y = 0.0;\n'
  + '\tvec3 fwd = dot( toCam, toCam ) > 1e-6 ? normalize( toCam ) : vec3( 0.0, 0.0, 1.0 );\n\tvec3 right = vec3( fwd.z, 0.0, - fwd.x );\n'
  + '\tvec3 base = foot + fwd * aSlice.x * uR;\n'
  + '\tgl_Position = projectionMatrix * viewMatrix * vec4( base + right * position.x * uW + vec3( 0.0, position.y * uH, 0.0 ), 1.0 );\n}';
const STEAM_FRAG = 'uniform float uTime;\nuniform float uAlpha;\nuniform vec3 uColor;\nuniform float uW;\nuniform float uR;\nvarying vec2 vUv;\nvarying vec3 vSlice;\n'
  + STEAM_NOISE
  + 'void main() {\n\tfloat y = vUv.y, t = uTime + vSlice.z * 3.7;\n'
  + '\tfloat sway = ( sin( t * 0.61 + y * 3.1 ) * 0.07 + sin( t * 0.37 + y * 5.3 ) * 0.035 ) * y;\n'
  + '\tfloat hw = mix( vSlice.y * uR / uW * 0.92, 0.42, pow( y, 0.8 ) );\n'
  + '\tfloat x = ( vUv.x - 0.5 - sway ) / hw;\n\tfloat column = exp( - x * x * x * x * 1.5 );\n'
  + '\tvec2 q = vec2( ( vUv.x - 0.5 ) * mix( 5.0, 2.2, y ) + sway * 3.0 + vSlice.z * 7.31, y * 1.8 - t * 0.32 );\n'
  + '\tfloat n = sFbm( q + vec2( 0.0, 0.6 * sFbm( q * 1.6 + vec2( t * 0.07, vSlice.z * 1.9 ) ) ) );\n'
  + '\tfloat fade = smoothstep( 0.0, 0.04, y ) * pow( 1.0 - y, 1.7 );\n'
  + '\tgl_FragColor = vec4( uColor, uAlpha * column * smoothstep( 0.30, 0.72, n ) * fade );\n\t#include <colorspace_fragment>\n}';
const STEAM_MIST_VERT = 'varying vec2 vUv;\nvoid main() {\n\tvUv = uv;\n\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n}';
const STEAM_MIST_FRAG = 'uniform float uTime;\nuniform float uMist;\nuniform vec3 uColor;\nvarying vec2 vUv;\n'
  + STEAM_NOISE
  + 'void main() {\n\tvec2 p = ( vUv - 0.5 ) * 2.0;\n\tfloat r = length( p ), t = uTime;\n'
  + '\tfloat n = sFbm( p * 1.5 + vec2( t * 0.11, t * 0.07 ) ) * sFbm( p * 2.1 - vec2( t * 0.05, t * 0.13 ) + 4.7 );\n'
  + '\tgl_FragColor = vec4( uColor, uMist * smoothstep( 0.06, 0.40, n ) * ( 1.0 - smoothstep( 0.60, 1.0, r ) ) );\n\t#include <colorspace_fragment>\n}';
const SHEEN_ROUGH = 0.35;
function addSheen(m) {
  const prev = m.onBeforeCompile;
  m.userData.sheen = { on: { value: 0 }, rough: { value: SHEEN_ROUGH } };
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uSheen = m.userData.sheen.on;
    sh.uniforms.uSheenRough = m.userData.sheen.rough;
    sh.vertexShader = 'varying vec3 vSheenN;\nvarying vec3 vSheenV;\n' + sh.vertexShader.replace('#include <envmap_vertex>',
      '#include <envmap_vertex>\n#ifdef USE_ENVMAP\n\tvSheenN = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );\n\tvSheenV = cameraPosition - worldPosition.xyz;\n#endif');
    sh.fragmentShader = 'uniform float uSheen;\nuniform float uSheenRough;\nvarying vec3 vSheenN;\nvarying vec3 vSheenV;\n' + sh.fragmentShader
      .replace('#include <envmap_pars_fragment>', '#include <envmap_pars_fragment>\n#include <cube_uv_reflection_fragment>')
      .replace('#include <envmap_fragment>', '#include <envmap_fragment>\n#ifdef ENVMAP_TYPE_CUBE_UV\n\tif ( uSheen > 0.0 ) {\n\t\tvec3 sN = normalize( vSheenN ), sV = normalize( vSheenV );\n'
        + '\t\tfloat sF = uSheen * ( 0.04 + ( max( 1.0 - uSheenRough, 0.04 ) - 0.04 ) * pow( 1.0 - clamp( dot( sN, sV ), 0.0, 1.0 ), 5.0 ) );\n'
        + '\t\tvec3 sEnv = textureCubeUV( envMap, envMapRotation * reflect( - sV, sN ), uSheenRough ).rgb;\n'
        + '\t\toutgoingLight = outgoingLight * ( 1.0 - sF ) + sEnv * sF;\n\t}\n#endif');
  };
  m.customProgramCacheKey = () => 'done-bounce-sheen';
  m.needsUpdate = true;
}

/* the visitor's room colours, remembered in this browser (a viewing choice, not part of the build): { wall, desk }, each a
   preset id or '#rrggbb' (done-fit.js WALL_PAINTS, DESK_FINISHES) */
const ROOM_COLOURS_KEY = 'gen2-room-colours';
function savedRoomColours() {
  try { const c = JSON.parse(localStorage.getItem(ROOM_COLOURS_KEY) || 'null'); return c && typeof c === 'object' ? { wall: c.wall || 'white', desk: c.desk || 'oak' } : { wall: 'white', desk: 'oak' }; } catch { return { wall: 'white', desk: 'oak' }; }
}

/* the room's materials are its baked light: unlit, drawn as-is. Blender exports an Emission shader as a PBR material
   with a BLACK base and the bake as its EMISSIVE texture (factor white), not as KHR_materials_unlit; so the emissive map
   is the room's picture and the emissive factor its tint (2026-10-23: taking `map` alone painted the room white). A
   KHR_materials_unlit material already arrives as MeshBasicMaterial and is cloned. Every one remembers its baked colour
   and map (userData doneBase, doneMap), the base the visitor's room colours multiply (2026-10-25), and is the entry's own,
   so a colour never reaches the cached GLB's. Returns the materials it made, so leave() can dispose them (their textures
   are the cached GLB's and stay: Terra 01a16a22).
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
      let b;
      if (m.isMeshBasicMaterial) b = m.clone();
      else {
        const emissive = m.emissive && m.emissiveIntensity ? m.emissive.clone().multiplyScalar(m.emissiveIntensity) : null;
        b = new THREE.MeshBasicMaterial({ side: m.side });
        if (m.emissiveMap) { b.map = m.emissiveMap; b.color.copy(emissive || new THREE.Color(0xffffff)); }
        else if (m.map) { b.map = m.map; b.color.copy(m.color || new THREE.Color(0xffffff)); }
        else { b.color.copy(m.color || new THREE.Color(0xffffff)); if (emissive) b.color.add(emissive); }
      }
      b.userData.doneBase = b.color.clone(); b.userData.doneMap = b.map || null;
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

/* the room's own materials dressed: every baked mesh with a tile in the walls' bounce draws its bake less its share, and less
   its share of the desk's where the room has those tiles (paintRoom sets the shares and the desk tile's rect), and the desk
   top a sheen for a plain colour (addSheen). An entry and the room's programs ahead (warmRoom) both come through here, so
   what is compiled ahead is what is drawn. */
function dressRoom(group, bounce) {
  if (bounce) group.traverse((o) => {
    const rec = o.isMesh && bounce.meshes[o.name];
    if (!rec) return;
    for (const m of [].concat(o.material)) if (m.isMeshBasicMaterial && m.map) addBounce(m, bounce, rec.rect);
  });
  const deskTop = group.getObjectByName('desk_top');
  if (deskTop) for (const m of [].concat(deskTop.material)) if (m.isMeshBasicMaterial && m.map) addSheen(m);
}
/* the room's small materials, one maker each for the same reason */
const catcherMaterial = (opacity) => new THREE.ShadowMaterial({ opacity, depthWrite: false });
const maskMaterial = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
  blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
const discMaterial = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
const paneMaterial = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
/* the coffee's steam, its two materials on one clock (makeSteam) */
function steamMaterials(r, size) {
  const time = { value: 7.3 }, colour = { value: new THREE.Color(0.95, 0.95, 0.96) };
  return {
    time,
    sheets: new THREE.ShaderMaterial({
      uniforms: { uTime: time, uW: { value: size.w }, uH: { value: size.h }, uR: { value: r * SCALE }, uAlpha: { value: STEAM.alpha }, uColor: colour },
      vertexShader: STEAM_VERT, fragmentShader: STEAM_FRAG, transparent: true, depthWrite: false, toneMapped: false,
    }),
    mist: new THREE.ShaderMaterial({
      uniforms: { uTime: time, uMist: { value: STEAM.mist }, uColor: colour },
      vertexShader: STEAM_MIST_VERT, fragmentShader: STEAM_MIST_FRAG, transparent: true, depthWrite: false, toneMapped: false,
    }),
  };
}
/* THE GLAZE'S LIGHT (Astra 2026-10-26: "The white mug texture is a little heavy in close-up. It reads more like rough
   stoneware than glazed ceramic"). The bake carries a speckle of its sampling noise and a dark line at each of its four
   UV seams (measured: the seams at -7.5, 82.5, 172.5 and -97.5 deg about the axis), and a turned mug swings them into
   view. So the outer wall (and the handle) are lit here instead of read from the bake: the bake's mean (its last mip) for
   the level, the room's sun across the normal for the shape (a wrap of 0.55 + 0.9 Lambert about the horizontal, its mean
   round the cylinder 1), and a darker foot where the desk shades it. Lit from the right side however the mug is turned;
   the inside keeps its bake. `uMugFoot` 0 for the handle. */
const MUG_GLAZE_ROUGH = 0.12;
const MUG_LIGHT_GLSL = '#if defined( USE_MAP ) && defined( USE_ENVMAP )\n'
  + '\tif ( dot( vMugP.xz, vMugP.xz ) >= uMugR2 ) {\n'
  + '\t\tvec3 mugN = normalize( vSheenN );\n'
  + '\t\tfloat mugNl = length( mugN.xz ), mugLam = mugNl > 1e-4 ? max( dot( mugN.xz / mugNl, uMugSun ), 0.0 ) * mugNl : 0.0;\n'
  + '\t\tfloat mugL = ( 0.55 + 0.9 * mugLam + 0.25 * max( mugN.y, 0.0 ) ) / ( 0.55 + 0.9 / 3.14159265 );\n'
  + '\t\tfloat mugFootK = mix( 1.0, mix( 0.8, 1.0, smoothstep( 0.0, 0.3, ( vMugP.y - uMugY0 ) / uMugH ) ), uMugFoot );\n'
  + '\t\tdiffuseColor.rgb = diffuse * textureLod( map, vMapUv, 12.0 ).rgb * uMugGain * mugL * mugFootK;\n'
  + '\t}\n#endif\n';
const MUG_GAIN = 2.0;   // the bake's mean takes in its dark inside and foot: the outer wall's level over it (1.12, 1.4, then 1.6 drew the white mugs grey)
const MUG_PRINT_GLSL = '\tfloat mugTh = atan( vMugP.x, vMugP.z ) - uMugTurn;\n'
  + '\tfloat mugR2 = max( dot( vMugP.xz, vMugP.xz ), 1e-12 );\n'
  + '\tvec3 mugPx = dFdx( vMugP ), mugPy = dFdy( vMugP );\n'
  + '\tvec2 mugUv = vec2( fract( mugTh / 6.28318530718 + 0.5 ), ( vMugP.y - uMugY0 ) / uMugH );\n'
  + '\t// the angle\'s own derivatives, continuous across the print\'s seam at the back (atan\'s jump would pick the smallest mip there)\n'
  + '\tvec2 mugDx = vec2( ( vMugP.z * mugPx.x - vMugP.x * mugPx.z ) / mugR2 / 6.28318530718, mugPx.y / uMugH );\n'
  + '\tvec2 mugDy = vec2( ( vMugP.z * mugPy.x - vMugP.x * mugPy.z ) / mugR2 / 6.28318530718, mugPy.y / uMugH );\n'
  + '\tvec4 mugInk = ( mugUv.y < 0.0 || mugUv.y > 1.0 || mugR2 < uMugR2 ) ? vec4( 0.0 ) : textureGrad( uMugPrint, mugUv, mugDx, mugDy );\n'
  + '\tdiffuseColor.rgb *= mix( uMugBody, mugInk.rgb, mugInk.a );\n';
/* `env`: the room's environment as captured, `sunDir`: its sun (room.json), about the horizontal (the room is not turned) */
function glaze(m, { body, tex = null, turn = 0, y0 = 0, h = 1, r = 0, foot = 1, bounce = !!m.userData.bounce, env = null, sunDir = null }) {
  addSheen(m);
  m.userData.sheen.on.value = 1; m.userData.sheen.rough.value = MUG_GLAZE_ROUGH;
  m.envMap = env;
  const prev = m.onBeforeCompile;
  const sd = sunDir || [-1, 1, 1], sl = Math.hypot(sd[0], sd[2]) || 1;
  const u = { uMugBody: { value: body }, uMugPrint: { value: tex }, uMugTurn: { value: turn }, uMugY0: { value: y0 }, uMugH: { value: h }, uMugR2: { value: (r * 0.97) ** 2 },
    uMugSun: { value: new THREE.Vector2(sd[0] / sl, sd[2] / sl) }, uMugGain: { value: MUG_GAIN }, uMugFoot: { value: foot } };
  m.userData.mug = u;
  m.onBeforeCompile = (sh, rr) => {
    if (prev) prev.call(m, sh, rr);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vMugP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvMugP = position;');
    sh.fragmentShader = 'uniform vec3 uMugBody;\nuniform sampler2D uMugPrint;\nuniform float uMugTurn;\nuniform float uMugY0;\nuniform float uMugH;\nuniform float uMugR2;\nuniform vec2 uMugSun;\nuniform float uMugGain;\nuniform float uMugFoot;\nvarying vec3 vMugP;\n'
      + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + MUG_LIGHT_GLSL + (tex ? MUG_PRINT_GLSL : '\tdiffuseColor.rgb *= uMugBody;\n'));
  };
  const key = 'done-mug|' + (bounce ? 'bounce|' : '') + (tex ? 'print' : 'glaze');
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
}

/* THE ROOM'S PROGRAMS AHEAD (Joey 2026-10-31, of the first switch to Colors: "it takes a good couple seconds to load ... it
   just feels like it's sluggish or frozen, even on this powerful laptop ... is there maybe a way to partially preload in the
   background? or maybe even a loading status bar or similar?"). MEASURED on his laptop (D:/Claude - Output/colors-load-
   2026-10-31; A5000, Chrome and Brave alike): the files arrive in 0.1 to 0.5 s. The wait is the GPU driver building
   shader programs: 41 at Very High, and three's first use of each (getProgramInfoLog) holds the page until its link is done.
   7 to 11 s of a frozen page on a browser with no cached copy of them (every first visit, every driver update, every shader
   this repo changes), 0.7 s with them cached. Most of it is not the room's own: on the dark stage the build's parts have
   never been drawn with a shadow map, so the room asks for every part program again (four, three of them 0.7 to 0.9 s each),
   and on Very High for each of those again drawing into a target.
   So the programs are started before the room is on the stage. renderer.compile only issues the compile and the link: with
   KHR_parallel_shader_compile they run on the driver's own threads, the page keeps its frames, and programs are polled until
   ready (isReady); only then does the entry put the room on. Asked for by the boot, in idle slices, on a device that should
   (room-ahead.js), and by the entry itself on every device, as fast as a slice allows, behind the loading bar (roomStatus).
   ⚠ A SET THAT LIVES AS LONG AS THE PAGE. three releases a program with the last material using it, and every entry makes its
   own materials and disposes them on leave: the second switch re-linked 28 programs (0.2 s, from the driver's cache). So one
   material of each kind stays referenced here, never drawn, and a real material of the same key shares its program.
   ⚠ THE KEYS MUST BE THE ENTRY'S OWN. A material here that differs from the entry's in anything a program key reads compiles
   a program nobody draws and leaves the entry its wait. So they come from the entry's own makers (dressRoom, glaze,
   steamMaterials, makeSpool, makeTag ...), and the e2e counts the programs a first switch adds: a drift shows there.
   Without KHR_parallel_shader_compile nothing is pending and the link waits for first use, as it did. WARM_WAIT_MS: a driver
   that never says ready must not hold the room back for ever; the entry then takes the wait on its first frame, as it did. */
const WARM_WAIT_MS = 20000;
const warm = { run: null, urgent: false, wake: null, phase: 'none', files: false, done: 0, total: 0, pending: 0, peak: 0, ms: null, timedOut: false, set: null, tiers: new Set(), parts: new Set(), watch: new Set(), started: 0, slices: 0 };
const warmProgress = () => (warm.phase === 'ready' ? 1 : (warm.files ? 0.25 : 0) + (warm.total ? 0.15 * warm.done / warm.total : 0) + (warm.peak ? 0.6 * (1 - warm.pending / warm.peak) : 0));
function warmEmit() { const f = warmProgress(); for (const w of warm.watch) w(f); }
const warmAwake = () => { if (warm.wake) { const w = warm.wake; warm.wake = null; w(); } };
/* a wait the entry can cut short: it turns the run urgent and wakes it */
function warmWait(ms, idle = false) {
  return new Promise((ok) => {
    let id = 0;
    const done = (deadline) => { if (warm.wake === wake) warm.wake = null; if (idle && window.cancelIdleCallback) cancelIdleCallback(id); else clearTimeout(id); ok(deadline); };
    const wake = () => done(null);
    warm.wake = wake;
    id = idle && window.requestIdleCallback ? requestIdleCallback(done, { timeout: ms }) : setTimeout(done, ms);
  });
}
let warmSliceEnd = 0;
async function warmSlice(stage) {
  if (performance.now() < warmSliceEnd) return;
  warm.slices++;
  if (warm.urgent) { await warmWait(0); warmSliceEnd = performance.now() + 8; return; }   // a task at a time: the page and its frames go first
  while (!warm.urgent && stage.warmQuiet && !stage.warmQuiet()) await warmWait(250);   // not under a move, a tween or a hidden tab
  if (warm.urgent) { warmSliceEnd = performance.now() + 8; return; }
  const deadline = await warmWait(1500, true);
  warmSliceEnd = performance.now() + (deadline && deadline.timeRemaining ? Math.min(8, deadline.timeRemaining()) : 4);
}
/* one of each kind, once a page: nothing here is added to a scene or drawn */
function warmSetOf(stage, { gltf, json, masks, bounce, light, spoolGeo }) {
  const env = stage.studioEnv();
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const tex = new THREE.CanvasTexture(cv);   // any map: a program reads that there is one, not which
  const room = gltf.scene.clone(true), plane = new THREE.PlaneGeometry(1, 1), lone = (mat) => new THREE.Mesh(plane, mat);
  const mats = unlit(room);
  dressRoom(room, bounce);
  const sunDir = json && json.sun && json.sun.dir, body = new THREE.Color(1, 1, 1);
  const mug = room.getObjectByName('mug'), handle = room.getObjectByName('mug_handle');
  if (mug) glaze([].concat(mug.material)[0], { body, tex, env, sunDir });
  if (handle) glaze([].concat(handle.material)[0], { body, env, sunDir });
  const live = [], meshes = [];
  room.traverse((o) => { if (!o.isMesh) return; if (o.userData.live) { for (const m of [].concat(o.material)) m.envMap = env; live.push(o); } else meshes.push(o); });
  /* a desk this browser remembers as a plain colour (paintRoom): the sheen on, the room in it, another program of the same
     material, kept with the first. A desk picked plain later links its own then, in a blink: it is one small program */
  const deskTop = room.getObjectByName('desk_top');
  const saved = deskLook(savedRoomColours().desk, light && light.desk_top && light.desk_top.tex ? light.desk_top : null, bounce && bounce.desk ? bounce.desk.share : null);
  const plainDesk = deskTop && saved && saved.use === 'light' ? [].concat(deskTop.material)[0] : null;
  const steam = steamMaterials(0.04, steamSize(1));
  const extras = [catcherMaterial(0.42), maskMaterial(tex), discMaterial(tex), steam.sheets, steam.mist].map(lone);
  const pane = lone(paneMaterial(tex));   // compiled both ways on every tier, as the scene's compileAhead asks for it
  const spoolParts = [];
  if (spoolGeo) {
    const s = makeSpool(spoolGeo, '#808080', { silkEnv: stage.silkU ? stage.silkU.uSilkEnv : null });
    const info = tagInfo({ material: 'PLA', hex: '#808080', colourName: 'Grey' });
    const tag = makeTag(info, MATERIAL_COLOURS.PLA, new THREE.Vector3(0, 0, 1)), sticker = makeSticker(info, MATERIAL_COLOURS.PLA);
    s.add(tag, sticker);
    s.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.map) { o.material.map.dispose(); o.material.map = tex; }   // their drawn words are not kept for this
      spoolParts.push(o);
    });
    spoolParts.silk = s.userData.setSilk;
  }
  const textures = new Set([...(masks || []).map((m) => m.tex), light && light.desk_top && light.desk_top.tex, bounce && bounce.tex, ...mats.map((m) => m.map)].filter(Boolean));
  return { mats, room, meshes, live, extras, pane, spoolParts, plainDesk, env, textures: [...textures] };
}
/* what this tier and this build have not compiled yet: the textures once, the room's set once a tier, the parts' materials
   once a tier each (a build that changed brings new ones; the rest are a key lookup, and the entry asks again anyway) */
function warmItems(stage, room) {
  const tier = stage.quality, q = stage.QUALITY[tier] || {}, into = !!q.accum, items = [];
  if (!warm.set) warm.set = warmSetOf(stage, room);
  const s = warm.set;
  for (let i = 0; i < s.textures.length; i++) items.push(() => stage.renderer.initTexture(s.textures.shift()));   // any tier's: one left behind by a tier change comes round again
  if (!warm.tiers.has(tier)) {
    warm.tiers.add(tier);
    const roomMesh = (o) => { stage.compileForCapture(o); stage.compileForHold(o, { target: into }); };   // the environment's capture (captureEnv), and on the stage
    for (const o of s.meshes) items.push(() => roomMesh(o));
    for (const o of s.live) items.push(() => stage.compileForHold(o, { target: into }));
    if (s.plainDesk) items.push(() => { const m = s.plainDesk; m.envMap = s.env; m.needsUpdate = true; for (const o of s.meshes) if ([].concat(o.material).includes(m)) roomMesh(o); });
    for (const o of s.extras) items.push(() => stage.compileForHold(o, { target: into }));
    items.push(() => stage.compileForHold(s.pane, { target: true }));
    for (const o of s.spoolParts) items.push(() => stage.compileForHold(o, { target: into }));
  }
  /* A SILK SPOOL (spool.js): a silk filament's coil is another program; only when the build wears one */
  if (s.spoolParts.silk && stage.filamentsInBuild && !warm.tiers.has(tier + '|silk') && stage.filamentsInBuild().filaments.some((f) => f.silk)) {
    warm.tiers.add(tier + '|silk');
    items.push(() => {
      s.spoolParts.silk(true, stage.silkEnv ? stage.silkEnv() : null);
      for (const o of s.spoolParts) if (o.material && o.material.isMeshPhysicalMaterial) stage.compileForHold(o, { target: into });
      s.spoolParts.silk(false);   // plain again: a later tier compiles the plain coil first
    });
  }
  for (const { mesh, key } of stage.holdPartMeshes()) {
    const k = key + '|' + tier;
    if (warm.parts.has(k)) continue;
    warm.parts.add(k);
    items.push(() => stage.compileForHold(mesh, { target: into }));
  }
  return items;
}
async function warmRun(stage) {
  const t0 = warm.started = performance.now();
  warm.phase = 'files'; warm.files = false; warm.done = warm.total = warm.pending = warm.peak = 0; warm.timedOut = false; warm.slices = 0;
  warmEmit();
  while (!warm.urgent && document.hidden) await warmWait(1000);   // no data for a tab nobody has looked at
  const room = await loadRoom();
  warm.files = true; warm.phase = 'compile'; warm.filesMs = +(performance.now() - t0).toFixed(1);
  warmEmit();
  /* a tier or a build that changed under the run: its items too. A tier that changed part way drops what its old tier had left
     and forgets that tier: compiled under the new tier's state, those items would mark it done without its programs (Sol
     01a19327: High, Fast and back to High blocked on first use) */
  for (let tier = stage.quality, items; (tier = stage.quality, items = warmItems(stage, room)).length;) {
    warm.total += items.length;
    for (const it of items) {
      await warmSlice(stage);
      if (stage.quality !== tier) {
        warm.tiers.delete(tier); warm.tiers.delete(tier + '|silk');
        for (const k of warm.parts) if (k.endsWith('|' + tier)) warm.parts.delete(k);
        warm.total -= items.length - items.indexOf(it);
        break;
      }
      try { it(); } catch (e) { console.warn('[done scene] a program ahead', e); }
      warm.done++;
      warmEmit();
    }
  }
  warm.phase = 'link';
  const t1 = performance.now();
  warm.compileMs = +(t1 - t0).toFixed(1);
  for (;;) {
    const n = stage.programsPending();
    warm.pending = n; warm.peak = Math.max(warm.peak, n);
    warmEmit();
    if (!n) break;
    if (performance.now() - t1 > WARM_WAIT_MS) { warm.timedOut = true; break; }
    await warmWait(warm.urgent ? 40 : 200);
  }
  warm.ms = +(performance.now() - t0).toFixed(1);
  // a check's reading: a later run with nothing to do leaves it. `newest`: the newest program's id, what the room's entry must add nothing to
  if (warm.total) warm.last = { ms: warm.ms, filesMs: warm.filesMs, compileMs: warm.compileMs, items: warm.total, slices: warm.slices, programs: warm.peak, urgent: warm.urgent, timedOut: warm.timedOut, newest: Math.max(0, ...stage.renderer.info.programs.map((p) => p.id)) };
  warm.phase = 'ready';
  warmEmit();
}
/* `urgent`: the entry is waiting (no idle slices from here on); `onProgress(0..1)`: for its loading bar. One run at a time: a
   call during a run joins it. A run that fails (the files did not load) leaves the entry to say so, as it always has. */
export function warmRoom(stage, { urgent = false, onProgress = null } = {}) {
  if (new URLSearchParams(location.search).has('debug')) window.__GEN2_ROOM_WARM__ = warm;
  if (urgent) { warm.urgent = true; warmAwake(); }
  const running = warm.run || (warm.run = warmRun(stage).finally(() => { warm.run = null; warm.urgent = false; }));
  if (onProgress) { warm.watch.add(onProgress); onProgress(warmProgress()); }   // after the start: the last run's 'ready' is not this one's
  return running.finally(() => { if (onProgress) warm.watch.delete(onProgress); });
}
/* THE WAIT, SAID (Joey's "a loading status bar"): a pill over the free part of the stage, only once the wait has lasted
   long enough to notice (STATUS_MS), gone with the wait. Its bar and its sweep move on the compositor, so it would keep moving
   through a blocked main thread too. The studio stays live under it: nothing has changed on the stage until the room comes
   on. A pill drawn over a wait this short would be the flicker it is meant to prevent. */
const STATUS_MS = 150;
function roomStatus(stage) {
  let box = null, bar = null, f = 0, gone = false;
  const place = () => {
    if (!box) return;
    const sa = stage.safeArea || { left: 0, right: 0, top: 0 }, tools = document.getElementById('ws-tools');
    box.style.left = `${Math.round((sa.left + innerWidth - sa.right) / 2)}px`;
    box.style.top = `${Math.round(Math.max(sa.top + 10, tools && !tools.hidden ? tools.getBoundingClientRect().bottom + 8 : 0))}px`;   // clear of the toolbar, which runs past the safe area's top
  };
  const timer = setTimeout(() => {
    const root = document.getElementById('ws');
    if (gone || !root) return;
    box = document.createElement('div');
    box.id = 'ws-room-loading'; box.className = 'glass'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
    const label = document.createElement('span'); label.textContent = 'Setting up the room…';
    const track = document.createElement('i'); bar = document.createElement('b');
    track.appendChild(bar); box.append(label, track);
    bar.style.transform = `scaleX(${f})`;
    root.appendChild(box);
    place();
    addEventListener('resize', place);
  }, STATUS_MS);
  return {
    set(v) { f = Math.max(f, Math.min(1, v)); if (bar) bar.style.transform = `scaleX(${f})`; },
    remove() { gone = true; clearTimeout(timer); removeEventListener('resize', place); if (box) { box.remove(); box = bar = null; } },
  };
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
export function enterDoneScene(stage, { say, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, sequence = true, orbit = true, onSpool = null } = {}) {
  const { scene, camera, controls, renderer } = stage;
  let cancelled = false, on = false, status = null;   // status: the loading pill, while the room is on its way (roomStatus)
  const parts = { group: null, catcher: null, wall: null, sprite: null, masks: [], slid: {}, env: null, tex: null, mats: [], raf: 0, fade: null };
  const was = { table: stage.table.visible, grid: stage.grid.visible,
    sun: { pos: stage.sun.position.clone(), color: stage.sun.color.clone(), intensity: stage.sun.intensity },
    hemi: { color: stage.hemi.color.clone(), ground: stage.hemi.groundColor.clone(), intensity: stage.hemi.intensity },
    fill: { intensity: stage.fill.intensity, color: stage.fill.color.clone() },
    sunHalfDeg: stage.sunHalfDeg,
    controls: controls.enabled, pan: controls.enablePan, polar: controls.maxPolarAngle };
  let json = null, buildBox = null, interior = null;   // interior: the room's box from its walls (roomInterior), the shots' clamp
  let roomLight = {};   // room.json's light-only maps, loaded (loadLight): the desk top's, for the visitor's plain desk colours
  let roomBounce = null;   // room.json's walls' bounce, loaded (loadBounce): the atlas and its rects
  const colours = { wall: 'white', desk: 'oak', envs: 0 };   // the room colours drawn now (paintRoom), and how often the environment was captured
  /* the build's mount (stage.mountFrame) and the desk top's height in the stage once the room is placed (roomAnchor): 0 for
     a build standing on it, lower for one hanging on the wall over it, just over the rails of one hanging under it */
  let mount = 'tabletop', deskY = 0;
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
       the entry, with ?debug only (and `warmRelief: false`, the probe's control arm: no relief compiled ahead; `hold: true`,
       every shot of the moving grammar held at the middle of its move, as the still shots were before 2026-10-25: the
       lens's and the steam's checks need a shot that stays put on a tier that moves) */
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
    const list = (GRAMMAR[mount] || GRAMMAR.tabletop).map((s) => ({ ...s, from: { ...s.from }, to: s.to ? { ...s.to } : undefined }))
      .filter((s) => (s.name !== 'label' || subj.labels.length) && (s.name !== 'mugs' || (subj.mugs && subj.mugs.length)));   // the label shot only where a drawer carries words, the mugs' only where a mug stands
    const hero = list.find((s) => s.name === 'hero');
    // the bake's own hero shot wins - for a build on the desk, the one it was framed for, the centre of the hero's drift
    if (mount === 'tabletop' && hero && json.shots && json.shots.hero) Object.assign(hero, around({ ...hero.from, ...json.shots.hero }, hero.swing || {}));
    return list;
  }
  /* THE SHOTS' SUBJECTS (2026-10-25; done-fit.js GRAMMAR): the labels with the visitor's own words on them (the label shot
     picks one each time it comes round) and the fronts' top row of grips and handles (the glide), found once per entry */
  const subj = { labels: [], label: null, row: null, mugs: null, mug: null };
  function pickSubjects() {
    const units = (stage.build && stage.build.placed) || [];
    const box = (id, types) => { const b = stage.unitPartBox ? stage.unitPartBox(id, types) : new THREE.Box3(); return b.isEmpty() ? null : plain(b); };
    subj.labels = units.filter((u) => u.label && String(u.label).trim()).map((u) => ({ id: u.id, box: box(u.id, ['Label']) })).filter((l) => l.box);
    subj.label = subj.labels[0] || null;
    subj.row = rowOf(units.map((u) => box(u.id, ['Label', 'Handle'])).filter(Boolean), plain(buildBox));
  }
  /* the shots that look at the drawer unit: the detail shot at its box centre (targetShift, as before), the macro at the
     top-left corner of its face (the faceplate's edge, the seam to the case and to the unit above: structure at the scale
     where the layer lines show) */
  function aims() {
    if (!drawer.unit || !drawer.unit.box) return { label: subj.label, row: subj.row, mugs: subj.mug };
    const b = drawer.unit.box;
    return { drawer: aimAt(plain(buildBox), b), front: { x: b.min.x + 0.08 * (b.max.x - b.min.x), y: b.max.y - 0.12 * (b.max.y - b.min.y), z: b.max.z }, label: subj.label, row: subj.row, mugs: subj.mug };
  }
  const shotNamed = (name) => (seq.shots || shotsFor()).find((s) => s.name === name);
  // inside the room and above the desk, at k along its move (an under-table build's shots go below the desk top)
  const GRAMMAR_HERO = () => shotsFor().find((s) => s.name === 'hero');
  const fitOne = (spec) => fitShot(spec, plain(buildBox), view(), interior, aims(), { floorY: mount === 'under-table' ? -Infinity : deskY });
  const fitAt = (shot, k) => (shot.blend && shot.to ? blendShot(shot, k, fitOne) : fitOne(mixShot(shot, k)));
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
  /* THE STILL SHOTS' DRIFT (done-fit.js driftFor; Joey 2026-10-25: "slowly zoom in or out slightly, like without it
     rerendering the scene"): a shot that does not move (every shot of the still grammar, the still shots of the moving
     one on High) has its finished picture slowly pushed in, pulled out or slid across while it is on screen, from its
     clock's start to the end of its dip-out, by a CSS transform on the canvas the compositor animates (the Web Animations
     API on `transform` only). Nothing is drawn again for it: the idle gate and the steam are as they were. About the
     build's place in the frame; the canvas's box clips it, so the cinema bars and the strip stay put. Cleared in the
     black, paused with the tab; never on Very High or under reduced motion (done-fit.js driftWanted), and a change to
     Very High ends it (onQuality). */
  const drift = { anim: null, plan: null, clip: null, origin: null, n: 0 };   // clip, origin: the box's overflow and the canvas's own origin, as they were
  function driftStart() {
    driftStop();
    const el = renderer.domElement, box = el.parentElement;
    if (!driftWanted(stage.quality, reduced) || seq.moving || !el.animate || !box || !buildBox || buildBox.isEmpty()) return;
    const ctr = buildBox.getCenter(new THREE.Vector3()).project(camera);
    const origin = { x: Math.min(0.8, Math.max(0.2, (ctr.x + 1) / 2)), y: Math.min(0.8, Math.max(0.2, (1 - ctr.y) / 2)) };
    const plan = driftFor(driftKind(seq.shot, drift.n++), origin);
    const ms = (seq.skipIn ? 0 : seq.timing.dipInMs) + seq.timing.holdMs + seq.timing.dipOutMs;
    if (drift.clip == null) { drift.clip = box.style.overflow; drift.origin = el.style.transformOrigin; box.style.overflow = 'hidden'; }
    el.style.transformOrigin = `${(plan.origin.x * 100).toFixed(2)}% ${(plan.origin.y * 100).toFixed(2)}%`;
    drift.plan = plan;
    drift.anim = el.animate([{ transform: driftCss(plan.from) }, { transform: driftCss(plan.to) }], { duration: Math.max(1, ms), easing: 'ease-in-out', fill: 'forwards' });
  }
  /* THE FOCUS-IN (the label shot, Joey 2026-10-25: "starting a stationary scene out of focus and ending with it focused
     on a part of the build"): the frame opens soft and sharpens as it fades in, a CSS blur on the canvas eased to nothing
     over the dip-in and FOCUS_MS more, the compositor's work like the drift. The whole frame, not a depth: the stage has
     no depth of field while the camera moves. Only where the shots move; cleared with the drift. */
  const FOCUS = { px: 7, ms: 1800 };
  const focus = { anim: null };
  function focusStart() {
    const el = renderer.domElement, shot = currentShot();
    if (!moves() || !shot || !shot.focusIn || !el.animate) return;
    focus.anim = el.animate([{ filter: `blur(${FOCUS.px}px)` }, { filter: 'blur(0px)' }], { duration: (seq.skipIn ? 0 : seq.timing.dipInMs) + FOCUS.ms, easing: 'ease-out' });
  }
  function driftStop() {
    if (focus.anim) { focus.anim.cancel(); focus.anim = null; }
    if (drift.anim) { drift.anim.cancel(); drift.anim = null; }
    drift.plan = null;
    if (drift.origin != null) renderer.domElement.style.transformOrigin = drift.origin;
  }
  function driftLeave() {
    driftStop();
    const box = renderer.domElement.parentElement;
    if (box && drift.clip != null) box.style.overflow = drift.clip;
    drift.clip = null; drift.origin = null;
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
    // the visitor's own label comes straight after the hero on the first cycle (Astra 2026-10-25: "seeing the camera notice
    // something the user chose ... will do more than adding ten generic camera angles")
    const li = seq.cycle === 0 ? seq.order.indexOf('label') : -1;
    if (li > 1) seq.order.splice(1, 0, seq.order.splice(li, 1)[0]);
    // the mugs now and then, not every cycle ("every so often"), by the second random source so the order stays the seed's
    const mi = seq.order.indexOf('mugs');
    if (mi >= 0 && seq.turn && seq.turn() >= MUG_SHOT_SHARE) seq.order.splice(mi, 1);
    // ... and a view of the whole build straight after them (Astra: "build -> detail -> mug joke -> build")
    // (the mugs moved to just before the next build view, or the last one when none comes after them; never the first shot)
    const at2 = seq.order.indexOf('mugs');
    if (at2 >= 0 && !BUILD_VIEWS.includes(seq.order[at2 + 1])) {
      seq.order.splice(at2, 1);
      let j = seq.order.findIndex((n, k) => k >= Math.max(1, at2) && BUILD_VIEWS.includes(n));
      if (j < 0) j = seq.order.findLastIndex((n, k) => k > 0 && BUILD_VIEWS.includes(n));
      if (j > 0) seq.order.splice(j, 0, 'mugs');
    }
    seq.cycle++; seq.idx = 0;
  }
  /* a shot begins, in the black: the camera on its opening (a moving shot at its start, any shot locked off at the middle
     of its move), the relief decided for the whole shot, the stage told whether this one moves, the clock at the start of
     its dip-in (`skipIn`: at its hold, the frame already showing: the first shot, and a jump) */
  function beginShot({ skipIn = false } = {}) {
    driftStop();   // the last shot's drift ends in the black
    const shot = currentShot();
    /* this showing's way round (a reversible move runs either way, by the visit's second random source, so the plan's
       order is the same whatever the turns) and its label (a different drawer's each time round, where there are several) */
    if (shot.reversible && shot.to && seq.turn && seq.turn() < 0.5) [shot.from, shot.to] = [shot.to, shot.from];
    if (shot.name === 'label' && subj.labels.length) subj.label = subj.labels[Math.floor((seq.turn ? seq.turn() : 0) * subj.labels.length) % subj.labels.length];
    if (shot.name === 'mugs' && subj.mugs && subj.mugs.length) {
      /* one mug each time round: one with no other mug in its frame (Astra: "The cropped mug behind the foreground mug is
         distracting ... fix this through the close-up framing or target selection"), its saying toward the room where one
         is, else its logo */
      /* the other mugs the frame takes in, box against frustum, at nine points along the move (Sol 01a177c8: a centre in a
         cone missed a mug cropped at the edge, corners alone miss a box that straddles the frame, three points the move
         between them; the arc is 36 deg, a mug's width several of the nine steps) */
      const v = view(), aspect = v.width / v.height, probe = new THREE.PerspectiveCamera(30, aspect, 1, 1e6), frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
      const boxOf = (m) => new THREE.Box3(new THREE.Vector3(m.box.min.x, m.box.min.y, m.box.min.z), new THREE.Vector3(m.box.max.x, m.box.max.y, m.box.max.z));
      const inFrame = (subject, inside) => {
        const was = subj.mug, seen = new Set();
        subj.mug = subject;
        for (let i = 0; i <= 8; i++) {
          const k = i / 8;
          const cam = fitAt(shot, k);
          probe.fov = cam.fov; probe.position.set(cam.position.x, cam.position.y, cam.position.z); probe.lookAt(cam.target.x, cam.target.y, cam.target.z);
          probe.updateMatrixWorld(); probe.updateProjectionMatrix();
          frustum.setFromProjectionMatrix(pv.multiplyMatrices(probe.projectionMatrix, probe.matrixWorldInverse));
          for (const o of subj.mugs) if (!inside.includes(o) && frustum.intersectsBox(boxOf(o))) seen.add(o);
        }
        subj.mug = was;
        return [...seen];
      };
      const rank = (m) => (inFrame(m, [m]).length ? 2 : 0) + (m.face === 'saying' ? 0 : 1);
      const best = Math.min(...subj.mugs.map(rank)), pool = subj.mugs.filter((m) => rank(m) === best);
      const m = pool[Math.floor((seq.turn ? seq.turn() : 0) * pool.length) % pool.length];
      /* none alone in its frame: the mug and the ones its frame shows, framed together about its own face, and again until
         the widened frame shows no further one (Sol 01a177c8) */
      let group = [m], subject = m;
      for (let more = inFrame(m, group); more.length && group.length < subj.mugs.length; more = inFrame(subject, group)) {
        group = group.concat(more);
        const b = boxOf(m); for (const o of group) b.union(boxOf(o));
        subject = { box: plain(b), face: m.face, faceAz: m.faceAz, group };
      }
      subj.mug = subject;
    }
    seq.shot = shot.name; seq.skipIn = skipIn; seq.cutAt = null; seq.cutK = null; seq.phase = null;
    seq.moving = moves() && !!shot.to && !seq.timing.hold;
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
  function startClock() { seq.t0 = performance.now(); seq.lastFrame = seq.t0; driftStart(); focusStart(); tick(); }
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
      const sh = currentShot();
      seq.k = sh && sh.settle ? easeSine(Math.min(1, Math.acos(Math.max(-1, Math.min(1, 1 - 2 * b.k))) / Math.PI / sh.settle)) : b.k;   // `settle`: the eased move done by that share of the visible time
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
  /* the final scene's camera never rests, so its pixels are drawn finer than the screen's (main.js SUPERSAMPLING), from
     the entrance's verdict on: the entrance draws at the screen's own ratio, so a device near the line is judged on what
     it drew before (Sol 01a17823: the verdict is a 50 ms median, the resolution drop needs 3 s under 30 fps), and one
     judged slow (the still grammar) never takes it. A stage (Colors) keeps its orbit and its ratio. */
  function superAfterVerdict() { if (!orbit && !seq.slow && stage.setSupersample) stage.setSupersample(true); }
  function seqStart() {
    if (seq.on || !on || !sequenceWanted()) return;   // the tier may have changed while the entrance timer was pending (Sol 01a16b2a)
    /* an entrance still moving (Next view during it, or a device so slow its last frame comes after the timer) ends here,
       its verdict taken on the frames it drew: two writers of one camera would fight to the entrance's end and leave it on
       the hero (Sol 01a16e0e) */
    if (parts.enter && !parts.enter.done) {
      cancelAnimationFrame(parts.raf); parts.enter.done = true;
      if (!seq.judged) { seq.judged = true; if (entranceTooSlow(parts.enter.intervals, seq.timing.maxFrameMs)) seq.slow = true; superAfterVerdict(); }
    }
    if (!drawer.unit) pickDrawer();
    pickSubjects();
    seq.shots = shotsFor(); seq.rng = rngFrom(seq.seed); seq.turn = rngFrom(seq.seed ^ 0x5bd1e995); seq.order = []; seq.cycle = 0;
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
    driftLeave();   // no grammar, no drift: the canvas back as it was
  }
  function seqPause() { if (!seq.on || seq.pausedAt != null) return; seq.pausedAt = performance.now(); cancelAnimationFrame(seq.raf); cancelAnimationFrame(seq.waitRaf); clearTimeout(seq.timer); drawerCancel(); if (drift.anim) drift.anim.pause(); if (focus.anim) focus.anim.pause(); }
  function seqResume() {
    if (!seq.on || seq.pausedAt == null) return;
    const d = performance.now() - seq.pausedAt;
    seq.pausedAt = null;
    if (seq.pendingBegin) { seq.pendingBegin = false; beginShot({ skipIn: true }); return; }
    if (seq.waiting) { afterFrames(seq.timing.waitFrames, () => { seq.waiting = false; startClock(); }); return; }   // hidden in the black, before the new view was drawn: wait for it again
    seq.t0 += d; if (seq.cutAt != null) seq.cutAt += d;
    if (drift.anim) drift.anim.play();   // the drift takes up where it was, as the clock does
    if (focus.anim) focus.anim.play();
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
    if (!seq.shots) { pickSubjects(); seq.shots = shotsFor(); }
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
    if (parts.sprite) parts.sprite.visible = !shadow && mount === 'tabletop';   // the disc under a build that stands on the desk
    for (const d of (parts.spools && parts.spools.discs) || []) d.visible = !shadow;   // and under each spool
  }
  /* THE VISITOR'S ROOM COLOURS (done-fit.js wallFactor, wallWeight, bounceK, deskLook; Joey 2026-10-25): every material
     from its baked base (userData doneBase / doneMap, unlit). The walls take the new paint over the baked one; the desk
     top a tint of its oak or, for a plain colour, the colour over its light-only map; and every surface with a tile in the
     walls' bounce loses the share of it the new paint does not bounce (k, per channel: Joey, "dark wall should also darken
     the rest of the room"), and the share of the DESK's bounce the new desk colour does not give (dk, by the desk's
     weight over the oak as baked: bounce.desk, 2026-10-25; a colour brighter than the oak adds what the oak did not
     bounce). A choice the bake cannot draw (no light-only map, a bad value) keeps the bake's own look. */
  function paintRoom(c) {
    const g = parts.group;
    if (!g || !json) return;
    const baked = json.colours && json.colours.wall;
    const wf = wallFactor(c.wall, baked), weight = wallWeight(c.wall, baked);
    const rho0 = hexToLinear(baked) || [1, 1, 1], rho = weight.map((v, i) => v * rho0[i]);   // the new paint, linear
    const lt = roomLight.desk_top && roomLight.desk_top.tex ? roomLight.desk_top : null;
    const deskSet = roomBounce && roomBounce.desk && roomBounce.desk.meshes ? roomBounce.desk : null;
    const dl = deskLook(c.desk, lt, deskSet ? deskSet.share : null) || deskLook('oak');
    const dw = dl.weight;   // the desk's weight: its diffuse albedo over the oak's as baked, 1 for the oak
    const tile = (key) => roomBounce && roomBounce.meshes[key];
    const dtile = (key) => deskSet && deskSet.meshes[key];
    const base = (m) => new THREE.Vector3(m.userData.doneBase.r, m.userData.doneBase.g, m.userData.doneBase.b);
    const set = (m, colour, bounceFactor, key, deskFactor = bounceFactor) => {
      m.color.copy(m.userData.doneBase).multiply(new THREE.Color(colour[0], colour[1], colour[2]));
      const b = m.userData.bounce, rec = tile(key), drec = dtile(key);
      if (!b) return;
      if (!rec) b.k.set(0, 0, 0);
      else {
        const k = bounceK(bounceFactor, weight, rec.scale);
        b.k.set(k[0], k[1], k[2]).multiply(base(m));
        b.rect.copy(b.toUv(rec.rect));
      }
      if (!drec) b.dk.set(0, 0, 0);
      else {
        const dk = bounceK(deskFactor, dw, drec.scale);
        b.dk.set(dk[0], dk[1], dk[2]).multiply(base(m));
        b.drect.copy(b.toUv(drec.rect));
      }
    };
    g.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m.userData.doneBase) continue;   // the live steel: its own PBR, the room's environment
        /* a wall is its bake x the new paint over the baked one: its light, one plain paint (the bake reaches its 8-bit top
           only on faces outside the room, the back wall's stretch past the left wall and the left wall's outer face:
           2026-10-25). Its bounce tile is of its light (times the paint's diffuse share: endpoint.py), so the new paint
           multiplies it too. The bake's own paint draws its bake exactly (weight 1, nothing taken off). */
        if (/^wall_/.test(o.name)) set(m, weight, rho, o.name);
        else if (o.name === 'desk_top') {
          const map = dl.use === 'light' ? lt.tex : m.userData.doneMap;
          if (m.map !== map) { m.map = map; m.needsUpdate = true; }
          if (dl.use === 'light') set(m, dl.factor, dl.colour, 'desk_top:light');
          else set(m, dl.factor, dl.factor, 'desk_top');
          if (m.userData.sheen) {   // a plain desk's coat reflects the room (addSheen); the oak and the walnut stay matte
            const on = dl.use === 'light', env = on ? parts.env || null : null;
            m.userData.sheen.on.value = on ? 1 : 0;
            if (m.envMap !== env) { m.envMap = env; m.needsUpdate = true; }
          }
        } else set(m, [1, 1, 1], [1, 1, 1], o.name);
      }
    });
    colours.wall = wf ? c.wall : 'white';
    colours.desk = dl.use === 'light' || dl.factor.some((v) => v !== 1) ? c.desk : 'oak';
    colours.deskWeight = dw;
  }
  /* the room as the build's environment, captured from the build's centre; again after a colour change, so the build's
     reflections and its light from the room follow the new wall and desk */
  function captureEnv() {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const next = pmrem.fromScene(parts.envScene, 0.04, 10, 60000).texture;
    pmrem.dispose();
    if (parts.env) parts.env.dispose();
    parts.env = next; colours.envs++;
    // the live steel reflects the room on every tier, Fast's included (it has no scene environment of its own), and so
    // does a plain desk's sheen (paintRoom turns it on); the old environment is gone, so neither may keep it
    for (const m of parts.mats) {
      if (m.isMeshStandardMaterial) { m.envMap = parts.env; m.needsUpdate = true; }
      else if (m.userData.sheen && m.userData.sheen.on.value > 0) { m.envMap = parts.env; m.needsUpdate = true; }
    }
  }
  /* THE COFFEE'S STEAM (done-fit.js steamRate, steamSize, steamSlices; Joey 2026-10-25: "is there anyway to add a steaming
     animation to the coffee?", then "wouldn't the steam be rolling off the entire coffee surface and not just a small
     circle in the center?"): soft wisps rising off the whole surface, in sheets stood across it (STEAM_VERT, STEAM_FRAG,
     one mesh), over a mist lying on it (STEAM_MIST_FRAG), both children of the coffee, so they slide and hide with the
     mug, and one clock. Added after the environment's capture, so the room it reflects has none; ghosts (userData), so
     the AO's and the selection outline's passes leave them out; no shadow either way. The clock runs only while it may
     move (steamRate): ticked at the tier's frame rate on High and Balanced while the steam is in view (drawNextFrame: one
     frame a tick, nothing invalidated, so the idle gate does not stay open after it and their AO's accumulation is left
     alone), carried by the camera's own moves on Very High (a still shot's accumulation converges on still steam), still
     with reduced motion, and not drawn on Fast, where it could not move in a picture that drifts (done-fit.js steamShown). */
  function makeSteam(group) {
    const coffee = group.getObjectByName('coffee');
    if (!coffee || !coffee.geometry) return;
    coffee.geometry.computeBoundingBox();
    const bb = coffee.geometry.boundingBox, r = (bb.max.x - bb.min.x) / 2, size = steamSize(r * SCALE);   // the GLB's metres to mm
    const { sheets: mat, mist: mistMat } = steamMaterials(r, size);
    // the sheets in one geometry: each a quad carrying its depth across the coffee, its foot's half-width and its seed
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), slices = steamSlices(), nq = quad.attributes.position.count;
    const pos = new Float32Array(nq * 3 * slices.length), uvs = new Float32Array(nq * 2 * slices.length), sl = new Float32Array(nq * 3 * slices.length), idx = [];
    slices.forEach((c, k) => {
      pos.set(quad.attributes.position.array, k * nq * 3); uvs.set(quad.attributes.uv.array, k * nq * 2);
      for (let v = 0; v < nq; v++) sl.set([c.d, c.half, c.seed], (k * nq + v) * 3);
      for (const i of quad.index.array) idx.push(i + k * nq);
    });
    quad.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); geo.setAttribute('aSlice', new THREE.BufferAttribute(sl, 3)); geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((bb.min.x + bb.max.x) / 2, bb.max.y + 0.001, (bb.min.z + bb.max.z) / 2);   // the coffee's own frame
    const mist = new THREE.Mesh(new THREE.CircleGeometry(r * 0.97, 48).rotateX(-Math.PI / 2), mistMat);
    mist.position.set((bb.min.x + bb.max.x) / 2, bb.max.y + 0.0015, (bb.min.z + bb.max.z) / 2);   // 1.5 mm over the coffee
    for (const o of [mesh, mist]) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 2; o.raycast = () => {}; }
    mesh.name = 'done-steam'; mesh.userData.ghost = true; mesh.userData.doneRoom = true;
    mist.name = 'done-steam-mist'; mist.userData.ghost = true; mist.userData.doneRoom = true;
    coffee.add(mesh);
    coffee.add(mist);
    const foot = new THREE.Vector3(), sphere = new THREE.Sphere(), frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
    // drawn or not from the start (done-fit.js steamShown), so its first frame on Fast has none either (Terra 01a1755a)
    const shown0 = steamShown(stage.quality, reduced, sequence);
    mesh.visible = mist.visible = shown0;
    const s = parts.steam = { mesh, mist, size, slices: slices.length, t: 7.3, at: 0, dueAt: 0, sig: '', ticks: 0, shown: shown0 };
    /* ... and again when the tier changes: from onQuality, before the new tier's first frame, and from the tick should a
       tier come by another way (only when the answer flips, never every frame: the e2e hides it by hand) */
    s.follow = (tier) => {
      const shown = steamShown(tier, reduced, sequence);
      if (shown !== s.shown) { s.shown = shown; mesh.visible = mist.visible = shown; stage.invalidateFrame(); }
    };
    /* ... and on Very High, a rest overlay (main.js THE REST OVERLAYS; Joey 2026-10-26: "after the user stop moving the
       camera and it switches over to the detailed render view ... doesn't freeze the coffee steam"): left out of the still
       picture's samples and drawn over it, so at rest it ticks at High's rate there too, a blit and the wisps a frame */
    if (stage.addAccOverlay) {
      s.overlay = { objects: [mist, mesh], shown: () => { for (let o = mesh; o; o = o.parent) if (!o.visible) return false; return true; } };
      stage.addAccOverlay(s.overlay);
    }
    const tick = (now) => {
      if (!on || parts.steam !== s) return;
      parts.steamRaf = requestAnimationFrame(tick);
      let rate = steamRate(stage.quality, reduced);
      if (rate === 'motion' && s.overlay && stage.accOverlayLive()) rate = steamRate('high', reduced);   // resting on Very High: over the still picture
      const dt = s.at ? Math.min(0.1, (now - s.at) / 1000) : 0;
      s.at = now;
      s.follow(stage.quality);
      if (rate === 'motion') {   // Very High: on the frames the camera's own move draws
        const c = stage.camera, sig = c.position.toArray().concat(c.quaternion.toArray(), [c.fov, c.zoom]).map((v) => v.toFixed(3)).join();
        if (sig !== s.sig) { s.sig = sig; s.t += dt; mat.uniforms.uTime.value = s.t; }
        return;
      }
      if (!rate || !coffee.visible) return;
      const c = stage.camera;
      mesh.getWorldPosition(foot);
      sphere.set(foot.add({ x: 0, y: size.h / 2, z: 0 }), size.h / 2 + size.w / 2);
      frustum.setFromProjectionMatrix(pv.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
      if (!frustum.intersectsSphere(sphere)) return;   // out of the shot: no frames for it
      s.t += dt;
      const beat = steamBeat(now, s.dueAt, rate);   // the tier's rate on average, at any display rate (done-fit.js)
      if (!beat.tick) return;
      s.dueAt = beat.dueAt; s.ticks++;
      mat.uniforms.uTime.value = s.t;
      stage.drawNextFrame();
    };
    parts.steamRaf = requestAnimationFrame(tick);
  }
  /* THE MUGS (done-fit.js MUGS, mugPlan, pickSpots; Joey 2026-10-25). None to three on the desk, each its own look (JERRARI's
     white, MODULITH's charcoal or white), saying, turn and free spot, all from the build's own seed, so a build always shows
     the same mugs and another build others; the first holds the coffee and its steam. The print is IN the glaze (glaze): the
     mug's material reads a wrap-round print by the angle about its own axis and the height, and multiplies the bake by the
     glaze's colour, or the ink's where there is ink, so dark ink on white and light ink on charcoal both keep the bake's
     shading. Glossy: the desk's sheen (addSheen) at a glaze's roughness, the room's own environment in it. A further mug is
     the room's mug mesh again (its bake fits any place on the desk as well as the coffee's), its handle turned about the
     axis, the coffee mug's shadow mask again under it. Made after the environment capture (the room it reflects has no mug
     of its own), on every visit, in the visit's own clone of the room; its prints' textures disposed on leave. */
  /* a mug's wrap-round print: 2048 px round the circumference, as tall as the mug; the logo centred on the front (u 0.5,
     the angle 0), the saying on the back (u 0 and 1: drawn twice, either side of the seam); the logo when its SVG loads */
  function mugPrint(look, back, rMm, hMm, done) {
    const cv = document.createElement('canvas'), W = 2048, px = W / (2 * Math.PI * rMm);
    cv.width = W; cv.height = Math.round(hMm * px);
    const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapS = THREE.RepeatWrapping;
    // the saying's face (MUGS: `type`); Archivo's width axis by the shorthand's stretch keyword (a fontStretch set before
    // `font` is reset by it)
    const type = back.type || 'condensed';
    const font = (s) => (type === 'mono' ? `600 ${s}px "IBM Plex Mono", monospace` : `900 ${type === 'condensed' ? 'ultra-condensed ' : ''}${s}px Archivo, "Arial Black", sans-serif`);
    // the face at a size, with word spaces a condensed face keeps open (at its narrowest Archivo all but closes them:
    // "IMADEATHING" in the 2026-10-25 shots); measureText counts them too
    const setFont = (sz) => { g.font = font(sz); g.wordSpacing = type === 'condensed' ? `${(0.2 * sz).toFixed(1)}px` : '0px'; };
    // its block, as large as a real mug's print (Joey: "scaling them up to use a decent amount of space like a real mug"):
    const w = 0.33 * 2 * Math.PI * rMm, hh = 0.82 * hMm;   // a third of the way round: the face a front view reads (Astra: "give longer jokes more room")
    g.textBaseline = 'middle'; g.textAlign = 'center';
    const drawLine = (line, x, y, s, ink) => {   // centred, a heart drawn red
      setFont(s * px);
      const parts2 = line.split('♥'), widths = parts2.map((t) => g.measureText(t).width), heart = g.measureText('♥').width;
      let at = x - (widths.reduce((a, b) => a + b, 0) + heart * (parts2.length - 1)) / 2;
      g.textAlign = 'left';
      parts2.forEach((t, i) => {
        g.fillStyle = ink; g.fillText(t, at, y); at += widths[i];
        if (i < parts2.length - 1) { g.fillStyle = '#d7263d'; g.fillText('♥', at, y); at += heart; }
      });
      g.textAlign = 'center';
    };
    // the saying once its face has loaded (the planner's own fonts load as the page uses them, and Plex Mono at 600 may not
    // have been yet): measured and drawn then, the texture told so
    const drawSaying = () => {
      if (!on || done()) return;
      const lay = sayingLayout(back, w, hh, (line, s) => { setFont(s * px); return g.measureText(line).width / px; });
      const total = (lay.scales.reduce((a, b) => a + b, 0) + (back.small ? 0.42 / lay.lead : 0)) * lay.size * lay.lead;
      for (const x of [0, W]) {
        let y = (cv.height - total * px) / 2;
        back.lines.forEach((line, i) => { const s = lay.size * lay.scales[i]; y += (s * lay.lead * px) / 2; drawLine(line, x, y, s, (back.accent || []).includes(i) ? look.accent : look.ink); y += (s * lay.lead * px) / 2; });
        y += (lay.size * lay.lead * px) / 2;
        if (back.small) { g.wordSpacing = '0px'; g.font = `600 ${lay.small * px}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`; g.fillStyle = look.ink; g.fillText(back.small, x, y - (lay.size * lay.lead * px) / 2 + lay.small * px); }
      }
      tex.needsUpdate = true; tex.userData.saying = true; stage.invalidateFrame();
    };
    (document.fonts && document.fonts.load ? document.fonts.load(font(40), back.lines.join(' ')) : Promise.resolve()).then(drawSaying, drawSaying);
    tex.needsUpdate = true;
    const img = new Image();
    img.onload = () => {
      if (!on || done()) return;
      const hl = look.logo.hMm * px, wl = hl * look.logo.aspect;
      g.drawImage(img, (W - wl) / 2, (cv.height - hl) / 2, wl, hl);
      tex.needsUpdate = true; stage.invalidateFrame();
      tex.userData.logo = true;
    };
    img.src = new URL('../../' + look.logo.src, import.meta.url).href;
    return tex;
  }
  /* THE SPOOLS ON THE DESK (done-fit.js spoolPlan, spool.js): one per colour the build is printed in (its filaments, and the
     identification colours of a region nothing picked), grouped by the build's seed into a stack lying flat and spools
     standing on their rims, each group at a free spot big enough for a spool (deskSpots at a spool's footprint, the same
     keep-clear as the mugs), never in front of the build. They take the stage's lights like the build and cast their own
     shadow; on a tier with no shadow map, a contact disc under each. Made before the mugs, which then keep clear of them.
     `refreshSpools` repaints them when the build's colours change (the Colors workspace's Room stage). */
  const SPOOL_FOOT = 108;   // a spool's footprint radius, mm: its 100 mm flange and a margin
  const SPOOL_CLEAR = ['notebook', 'calipers'];   // the props that may leave the desk for spools (the plant only where nothing fits without it: Joey, "I'd like to keep the plant in there when we can")
  // a label stripe's colour too (Joey 2026-10-28: "we are using the blue accent color in the label but it's not adding to our
  // filament stack"): the stripe prints from its own spool, and the dock already counts it among the build's filaments
  function spoolColours() {
    const f = stage.filamentsInBuild ? stage.filamentsInBuild() : { filaments: [], unpicked: [] };
    return [...f.filaments.map((x) => x.hex), ...f.unpicked.map((u) => u.hex)];
  }
  function makeSpools(group, geo) {
    parts.spools = { groups: [], discs: [], plan: null, geo };
    if (!geo || mount === 'under-table') return [];
    const q = new URLSearchParams(location.search), s0 = debug ? q.get('spools') : null;
    if (s0 === 'off') return [];
    const seedKey = location.hash || q.get('build') || 'room';
    const plan = spoolPlan(rngFrom(hashSeed('spools|' + seedKey)), spoolColours());
    parts.spools.plan = plan;
    if (!plan.groups.length) return [];
    group.updateWorldMatrix(true, true);
    const at = (o) => new THREE.Box3().setFromObject(o);
    const own = new Set(['mug', 'mug_handle', 'coffee']);
    const mugO = group.getObjectByName('mug');
    const desk = group.getObjectByName('desk_top');
    if (!desk) return [];
    const deskBox = plain(at(desk)), home = mugO ? at(mugO).getCenter(new THREE.Vector3()) : { z: deskBox.max.z };
    const obstaclesNow = () => {
      const out = (json.props || []).filter((p) => !own.has(p.name)).map((p) => group.getObjectByName(p.name)).filter((o) => o && o.visible).map((o) => plain(at(o)));
      if (mugO && mugO.visible) out.push(plain(at(mugO)));   // the coffee's home: the mugs keep clear of the spools, not the other way round, but a spool never stands on the room's own mug
      if (buildBox && !buildBox.isEmpty()) {
        out.push({ min: { x: buildBox.min.x - 28, z: buildBox.min.z - 28 }, max: { x: buildBox.max.x + 28, z: buildBox.max.z + 28 } });
        out.push({ min: { x: buildBox.min.x - 60, z: buildBox.min.z }, max: { x: buildBox.max.x + 60, z: deskBox.max.z + 100 } });
      }
      return out;
    };
    const plan2 = () => pickSpots(deskSpots(obstaclesNow(), deskBox, { radius: SPOOL_FOOT, step: 30 }).filter((p) => p.z <= home.z + 10), plan.groups.map((g) => g.spot), 2 * SPOOL_FOOT + 10);
    /* MAKING ROOM (Joey 2026-10-26: "when the plan has more spool groups than fit, take the notebook (or another prop) off
       the desk to fit them"): while groups are left out, the props come off one group at a time, the least of the room's
       composition first (SPOOL_CLEAR: never the monitor, the desk's anchor), their shadows with them; a group cleared that
       makes no more room goes back */
    const fits = (pk) => pk.filter(Boolean).length;
    const made = new Set();   // the props and masks this clearing hid, so putting back never shows one something else hid (a slide past the desk's end)
    const groupParts = (name, back = false) => back
      ? [...made].filter((o) => (o.userData.doneShadow ? o.userData.doneShadow.group : (o.userData.group || o.name)) === name || (json.props || []).some((x) => x.group === name && x.name === o.name))
      : [...(json.props || []).filter((x) => x.group === name).map((x) => group.getObjectByName(x.name)).filter((o) => o && o.visible),
        ...parts.masks.filter((m) => m.userData.doneShadow && m.userData.doneShadow.group === name && m.visible)].map((o) => (made.add(o), o));
    /* every way of clearing them (none, each, both), the one that fits the most groups kept, and of those the lightest
       props off the desk (Sol 01a17823: one spot that needs two props gone gains nothing from either alone; and the seeded
       picks are not monotonic in the spots, so more room can place fewer) */
    const setOff = (names, off) => { for (const n of names) for (const o of groupParts(n, !off)) o.visible = !off; group.updateWorldMatrix(true, true); };
    const cost = (names) => names.reduce((a, n) => a + 10 ** SPOOL_CLEAR.indexOf(n), 0);   // the notebook before the calipers
    const search = (held) => {   // every subset of SPOOL_CLEAR with `held` off too: the cheapest that fits the most
      let best = null, off = null;
      for (let m = 0; m < 1 << SPOOL_CLEAR.length; m++) {
        const names = [...SPOOL_CLEAR.filter((_, i) => m & (1 << i)), ...held];
        setOff(names, true);
        const next = plan2();
        setOff(names, false);
        if (!best || fits(next) > fits(best) || (fits(next) === fits(best) && cost(names) < cost(off))) { best = next; off = names; }
        if (!m && fits(best) === plan.groups.length) break;   // all of them with nothing off
      }
      return [best, off];
    };
    let [picks, cleared] = search([]);
    /* the plant only where no group fits without it, and then with every subset again (Sol 01a17823: a spot behind both the
       notebook and the plant fits nothing with either alone off) */
    if (!fits(picks)) { const [next, off] = search(['plant']); if (fits(next)) { picks = next; cleared = off; } }
    setOff(cleared, true);
    parts.spools.cleared = cleared;
    const cap = stackCap(interior ? interior.y1 : NaN, deskY);   // up to the ceiling, near enough (Joey: "maybe a crazy limit of the ceiling?")
    parts.spools.cap = cap;
    /* a group with no room joins a stack that has it, up to the room's cap, so every colour of the build is on the desk where it
       can be (Joey: "you can even stack them in a single tall stack") */
    const room = plan.groups.map((g, i) => (picks[i] ? { ...g, colours: [...g.colours] } : null));
    plan.groups.forEach((g, i) => {
      if (picks[i]) return;
      for (const c of g.colours) {
        const host = room.filter((r) => r && r.kind === 'stack' && r.colours.length < cap).sort((a, b) => a.colours.length - b.colours.length)[0] || (() => { const r = room.find((x) => x && x.kind === 'stand'); if (r) { r.kind = 'stack'; } return r; })();
        if (host && host.colours.length < cap) host.colours.push(c);
      }
    });
    const placed = [];
    room.forEach((g, i) => {
      const p = picks[i];
      if (!p || !g) return;
      const turn = (g.turnDeg * Math.PI) / 180, root = new THREE.Group();
      root.name = 'done-spools'; root.position.set(p.x, deskY, p.z); root.rotation.y = turn;
      root.userData.spoolGroup = { kind: g.kind, seed: `stack|${seedKey}|${i}` };   // its own seed: the plan's picks stay as they were
      for (const c of g.colours) root.add(newSpool(c));
      poseGroup(root);
      scene.add(root);
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), discMaterial(parts.tex || (parts.tex = contactTexture())));
      const w = g.kind === 'stand' ? [90, 240] : [250, 250];
      disc.scale.set(w[0], 1, w[1]); disc.rotation.y = turn; disc.position.set(p.x, deskY + 0.6, p.z); disc.renderOrder = 1; disc.raycast = () => {};
      disc.visible = !(stage.QUALITY[stage.quality] || {}).shadow;
      scene.add(disc);
      parts.spools.groups.push(root); parts.spools.discs.push(disc);
      root.updateWorldMatrix(true, true);
      placed.push({ kind: g.kind, colours: g.colours, at: p, box: plain(new THREE.Box3().setFromObject(root, true)) });   // precise: a turned cylinder's own box would overstate it by a quarter
    });
    parts.spools.placed = placed;
    placeSpoolMarks();
    return placed.map((x) => x.box);
  }
  const lower = (c) => String(c).toLowerCase();
  const spoolsOf = (root) => root.children.filter((s) => s.userData.setColor);
  /* THE SPOOL'S MATERIAL, SHOWN (spool.js THE SHIPPING TAG and THE FLANGE STICKER; Joey's pick of three mock-ups,
     2026-10-28, then Astra's review; ?spooltag=off compares): each spool's words are its filament's (main.js
     filamentsInBuild: its material, grade or finish, colour, maker and line; a region nothing picked has none, and no
     tag). Every spool hangs a tag at its coil's front (+z, the room's camera side), on a wire from the coil; a flange face
     that shows carries a sticker too. Made after the spools are posed, and again after every refresh (the marks are the
     spools' children, so they move with them) */
  const tagsOff = () => debug && new URLSearchParams(location.search).get('spooltag') === 'off';
  /* a spool is a colour (spoolColours), and two filaments can share one: the catalogue has Panchroma Grey (PLA) and
     Polymaker PETG Grey both #9a9da3, TPU95 and TPU90 Black both #16161a (Sol 01a1839e: keyed by the hex alone, the last
     one read named the spool). Its words then say both: "PLA / PETG", every grade or finish, each maker */
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  function spoolMaterials() {
    const f = stage.filamentsInBuild ? stage.filamentsInBuild() : { filaments: [] }, by = new Map();
    for (const x of f.filaments) { const k = lower(x.hex); if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
    return new Map([...by].map(([k, list]) => [k, list.length === 1 ? list[0] : {
      hex: list[0].hex, material: uniq(list.map((x) => x.material)).join(' / ') || null, silk: list.some((x) => x.silk),
      props: uniq(list.flatMap((x) => x.props || [])), colourName: uniq(list.map((x) => x.colourName)).join(' / ') || null,
      maker: uniq(list.map((x) => [x.brand, x.line].filter(Boolean).join(' · '))).join(' / ') || null,
    }]));
  }
  function clearSpoolMarks() {
    for (const s of parts.spools ? parts.spools.groups.flatMap(spoolsOf) : []) for (const o of s.children.filter((c) => c.userData.spoolMark)) { disposeMark(o); o.removeFromParent(); }
  }
  /* A SILK SPOOL (spool.js; Joey 2026-10-28: a Silk Gold spool "looks mostly flat like a yellow"): a spool whose filament is
     silk wears the parts' silk, every other spool its plain coil - set wherever the spools' colours were (re)made, which is
     where their words are, and whether or not the tags are drawn */
  function silkSpools() {
    if (!parts.spools) return;
    const mats = spoolMaterials();
    for (const s of parts.spools.groups.flatMap(spoolsOf)) {
      const silk = !!(mats.get(lower(s.userData.spool.color)) || {}).silk;
      // the studio is built only once a silk spool needs it (Terra 01a18533)
      if (s.userData.setSilk) s.userData.setSilk(silk, silk && stage.silkEnv ? stage.silkEnv() : null);
    }
  }
  function placeSpoolMarks() {
    clearSpoolMarks();
    silkSpools();
    if (tagsOff() || !parts.spools) return;
    parts.marksDrawn = (parts.marksDrawn || 0) + 1;   // for a reader of the scene (the e2e suite: the redraw for the font)
    const mats = spoolMaterials(), F = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);
    const lastYaw = new Map();   // per stack, the turn of the tag before (below)
    for (const s of parts.spools.groups.flatMap(spoolsOf)) {
      const info = tagInfo(mats.get(lower(s.userData.spool.color)));
      if (!info) continue;
      const accent = MATERIAL_COLOURS[info.material] || '#5a5f66';
      s.updateWorldMatrix(true, false);
      const C = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
      const A = new THREE.Vector3(0, 1, 0).transformDirection(s.matrixWorld);
      const lying = Math.abs(A.y) > 0.7;
      if (lying && A.y < 0) A.negate();   // the top flange
      if (!lying && A.dot(F) < 0) A.negate();   // the flange on the camera's side (a spool on its rim faces sideways: either)
      /* the wire leaves the coil at its front, tucked just under the surface (90.5 of the coil's 91 mm; spool.js ON A
         WIRE FROM THE COIL): lying, toward the top of the coil (20 mm up its 27.5), out at the front, a little turned; on its
         rim, at the coil's front a little over the axle (a standing coil is furthest forward at mid-height, so a card
         hanging there stays in front of it), toward the outer flange. Either way the card hangs 100 mm out, in front of
         the coil (91) and between the flanges (27.5) */
      const out = F.clone().addScaledVector(A, -F.dot(A)).normalize();   // the coil's front, square to its axis
      /* lying, that front turned 5 to 20 deg either way about the axis, as if the spool had been set down a little turned
         (Joey 2026-10-28: a stack's tags hung "perfectly in a vertical column"), and at least 10 deg off the tag before it in
         the stack, so no two line up; all still facing the room. Seeded apart from the hang below, which stays as it was.
         On its rim the front is the coil's furthest-forward line, at mid-height: turned, it would hang the card up or down
         the coil, toward it, so it is not turned. The card turns with its wire (the pivot's twist below): hung square to the
         room, its corner on the turned side swung into the coil */
      let yaw = 0;
      if (lying) {
        const yr = rngFrom(hashSeed(`tagyaw|${lower(s.userData.spool.color)}|${s.parent ? s.parent.children.indexOf(s) : 0}`));
        const prev = lastYaw.get(s.parent);
        for (let i = 0; i < 8; i++) { yaw = (yr() < 0.5 ? -1 : 1) * (0.087 + yr() * 0.262); if (prev == null || Math.abs(yaw - prev) >= 0.175) break; }
        // eight draws all close to it (a seed is a seed, Terra 01a183f3): the other side of it, 0.1 or more round
        if (prev != null && Math.abs(yaw - prev) < 0.175) yaw = -Math.sign(prev) * Math.max(0.1, Math.abs(yaw));
        lastYaw.set(s.parent, yaw);
        out.applyAxisAngle(A, yaw);
      }
      const at = C.clone().addScaledVector(out, 90.5).addScaledVector(lying ? A : UP, lying ? 20 : 12);
      if (!lying) at.addScaledVector(A, 10);
      const mark = makeTag(info, accent, out);
      mark.position.copy(at);
      /* hung as a tag hangs (Joey 2026-10-28: "hanging more randomly, can be twisted slightly randomly or hanging partly
         sideways slight"): about its hole, twisted on the wire 12 to 35 deg, swung to the side 5 to 16 (never straight),
         either way, its foot off the coil 4 to 12; seeded by the spool's colour and its place in the group, so a spool's
         tag hangs the same every time */
      const rnd = rngFrom(hashSeed(`tag|${lower(s.userData.spool.color)}|${s.parent ? s.parent.children.indexOf(s) : 0}`));
      const either = (lo, hi) => (rnd() < 0.5 ? -1 : 1) * (lo + rnd() * (hi - lo));
      const twist = either(0.21, 0.61), swing = either(0.09, 0.28), lean = -(0.07 + rnd() * 0.14);
      mark.userData.pivot.rotation.set(lean, yaw + twist, swing, 'YXZ');
      mark.userData.spoolMark = true;
      scene.add(mark); mark.updateMatrixWorld(true);
      s.attach(mark);   // kept where it is, and moved with the spool from now on
      /* THE FLANGE STICKER (spool.js): where a flange's face shows, the tag's words again, fixed to the spool. A spool on
         its rim, on its camera-side flange (its broad face, blank before: Astra); a stack's top spool, on its top flange
         (the faces under a spool above are hidden). As a maker's label sits (Joey 2026-10-28, four photos of real spools:
         "make the label aligned to the center of the spool rather than slapped on to be perfectly upright, centered between
         the oval slots ... try to keep the sticker upright, but randomize it so they arent perfectly upright, just don't
         want the text to be completely sideways or upsidedown"): centred in a clear sector between two slots, 65 mm out,
         square to the spool's centre, its words along the flange's circle and their top out toward the rim or in toward
         the hub. Of the three sectors and the two ways, the one that reads most upright: on its rim the room's up, lying
         flat away from the front. Six choices 60 deg apart, so its words are never more than 30 deg off upright, and the
         spool's own turn (seeded) sets how far: never quite square, never sideways. Laid once, in the spool's frame: it
         never turns after the camera */
      const sibs = s.parent ? spoolsOf(s.parent) : [s];
      if (lying && s !== sibs[sibs.length - 1]) continue;
      const side = new THREE.Vector3(0, 1, 0).transformDirection(s.matrixWorld).dot(A) > 0 ? 1 : -1;   // A's flange, in the spool's frame
      const upWant = lying ? F.clone().negate() : UP;
      const radial = (deg) => new THREE.Vector3(Math.cos(deg * Math.PI / 180), 0, Math.sin(deg * Math.PI / 180));
      const ways = STICKER.sectors.flatMap((d) => [1, -1].map((k) => ({ R: radial(d), up: radial(d).multiplyScalar(k) })));
      const { R, up } = ways.reduce((b, w) => (w.up.clone().transformDirection(s.matrixWorld).dot(upWant) > b.up.clone().transformDirection(s.matrixWorld).dot(upWant) ? w : b));
      const normal = new THREE.Vector3(0, side, 0), right = up.clone().cross(normal);
      const st = makeSticker(info, accent);
      st.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
      st.position.copy(R).multiplyScalar(STICKER.at).setY(side * 32.7);   // 0.2 mm off the face (32.5)
      st.userData.spoolMark = true;
      s.add(st);
    }
    stage.invalidateFrame();
    /* the words are drawn into canvases now, in Archivo: if the face has not loaded yet the fallback's shapes stay in the
       textures for the visit (Sol 01a1839e). So when it is not ready, load it and draw the marks once more, unless the
       scene has gone (or the marks have been drawn again since) */
    if (document.fonts && !document.fonts.check('800 20px Archivo') && !parts.markFontWait) {
      parts.markFontWait = document.fonts.load('800 20px Archivo').then(() => { if (on && !cancelled && parts.spools) placeSpoolMarks(); }, () => {});
    }
  }
  /* THE WINDOW: FROSTED GLASS (Joey 2026-10-26, after his garden through it in six versions, a photo on a cylinder round
     the room at the last: "that window scene is pretty gross, maybe there is something more simple claude can do without
     an image?"; Astra: "a softly lit, frosted window ... Pale, slightly cool daylight across the glass. A very subtle
     brightness gradient—brighter toward the upper portion ... No visible trees, grass, horizon or cloud shapes.
     Restrained surface variation so it reads as glass rather than a glowing white rectangle"). One pane in the opening,
     set back FROST.inset of the jambs' depth from the room's face, so the jambs, sill and head show their recess, and
     FROST.lap mm into them all round, so no angle finds its edge. Its picture is drawn here (frostTexture): the gradient
     from FROST.bottom to FROST.top, and a soft mottle FROST.mottle of its brightness. Unlit like the room's bakes, out of
     the shadows (it casts none: the sun stays as the room had it), the AO (a ghost) and every ray. */
  const FROST = { top: [0.9, 0.925, 0.945], bottom: [0.78, 0.815, 0.85], mottle: 0.03, inset: 0.6, lap: 12, px: 128 };
  function frostTexture() {
    const N = FROST.px, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'), img = g.createImageData(N, N), rng = rngFrom(hashSeed('frost'));
    // value noise, two octaves: a coarse grid of random values, smoothly interpolated
    const octave = (G) => { const v = Array.from({ length: (G + 1) * (G + 1) }, () => rng() * 2 - 1); return (x, y) => {
      const fx = x * G, fy = y * G, i = Math.min(G - 1, Math.floor(fx)), j = Math.min(G - 1, Math.floor(fy)), s = fx - i, t = fy - j;
      const u = s * s * (3 - 2 * s), w = t * t * (3 - 2 * t), at = (a, b) => v[b * (G + 1) + a];
      return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - w) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * w; }; };
    const big = octave(3), small = octave(9);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const up = 1 - y / (N - 1), k = 1 + FROST.mottle * (0.7 * big(x / N, y / N) + 0.3 * small(x / N, y / N)), p = (y * N + x) * 4;   // canvas rows run down
      for (let ch = 0; ch < 3; ch++) img.data[p + ch] = Math.round(255 * Math.min(1, (FROST.bottom[ch] + (FROST.top[ch] - FROST.bottom[ch]) * up) * k));
      img.data[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function makeWindowPane(group) {
    const box = (n) => { const o = group.getObjectByName(n); return o ? new THREE.Box3().setFromObject(o) : null; };
    const jambs = [box('win_jamb_a'), box('win_jamb_b')], sill = box('win_sill'), head = box('win_head'), desk = box('desk_top');
    if (!jambs[0] || !jambs[1] || !sill || !head || !desk) return;
    const win = jambs[0].clone().union(jambs[1]).union(sill).union(head), size = win.getSize(new THREE.Vector3());
    const axis = size.x < size.z ? 'x' : 'z', along = axis === 'x' ? 'z' : 'x';
    const inward = Math.sign(desk.getCenter(new THREE.Vector3())[axis] - win.getCenter(new THREE.Vector3())[axis]) || 1;
    jambs.sort((p, q) => p.min[along] - q.min[along]);
    const a0 = jambs[0].max[along], a1 = jambs[1].min[along], y0 = sill.max.y, y1 = head.min.y;   // the opening, between the frame's inner faces
    const d0 = Math.min(jambs[0].min[axis], jambs[1].min[axis]), d1 = Math.max(jambs[0].max[axis], jambs[1].max[axis]);
    const roomFace = inward > 0 ? d1 : d0, depth = roomFace - inward * FROST.inset * (d1 - d0);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0 + 2 * FROST.lap, y1 - y0 + 2 * FROST.lap), paneMaterial(frostTexture()));
    const at = new THREE.Vector3(); at[axis] = depth; at[along] = (a0 + a1) / 2; at.y = (y0 + y1) / 2;
    pane.position.copy(at);
    // a plane faces +z: turned to face into the room
    if (axis === 'x') pane.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2; else if (inward < 0) pane.rotation.y = Math.PI;
    pane.name = 'done-window-pane'; pane.userData.ghost = true; pane.userData.doneRoom = true;
    pane.castShadow = false; pane.receiveShadow = false; pane.raycast = () => {};
    scene.add(pane);
    parts.pane = pane;
  }
  /* the spools' glow (spool.js setGlow): the one whose picker is open (selectSpool, from Colors) lit, the one under the
     pointer lit a little; the picture changes, so Very High starts its mean again */
  function glowSpools() {
    if (!parts.spools) return;
    let changed = false;
    for (const s of parts.spools.groups.flatMap(spoolsOf)) {
      const lv = parts.selectedHex && lower(s.userData.spool.color) === parts.selectedHex ? 2 : s === parts.hovered ? 1 : 0;
      if ((s.userData.glow || 0) !== lv) { s.userData.setGlow(lv); changed = true; }
    }
    if (changed) stage.invalidateFrame();
  }
  function selectSpool(hex) { parts.selectedHex = hex ? lower(hex) : null; glowSpools(); }
  function newSpool(c) {
    const s = makeSpool(parts.spools.geo, c, { silkEnv: stage.silkU ? stage.silkU.uSilkEnv : null });   // the parts' tier-scaled studio strength (A SILK SPOOL)
    s.traverse((m) => { if (m.isMesh) m.userData.doneRoom = true; });
    return s;
  }
  /* a group's spools posed: on its rim (the flange's 100 mm radius), or lying flat one on another as hands leave them
     (done-fit.js stackPoses, the group's own seed; its poses are the same spool for spool whatever the count, so a spool
     added on top moves none below it, and one taken out lets those above it down) */
  function poseGroup(root) {
    const g = root.userData.spoolGroup, list = spoolsOf(root);
    if (g.kind === 'stand') { list[0].rotation.set(0, 0, Math.PI / 2); list[0].position.set(0, 100, 0); return; }
    const poses = stackPoses(rngFrom(hashSeed(g.seed)), list.length);
    list.forEach((s, k) => { const o = poses[k]; s.position.set(o.x, o.y, o.z); s.rotation.set(-Math.atan(o.lean.z), o.spin, Math.atan(o.lean.x), 'XZY'); });   // spun first, then leaned
  }
  /* THE SPOOLS FOLLOW THE BUILD (the Colors workspace's Room stage, a pick made with the room on; Joey 2026-10-26: "so i
     added a blue filament, should we stack another filament on top of the stack when we do that"): a spool a filament,
     SPOOL_MAX at most. A spool whose filament the build still wears keeps it (the first of a colour; a second is spare); a
     spare takes a filament the build newly wears, where it stands; a filament still without one goes on top of the lowest
     stack with room (up to the room's cap, stackCap), or lays a standing spool down to start one; a spare left over leaves the desk, and a
     group left with none leaves with its disc */
  function refreshSpools() {
    const sp = parts.spools;
    if (!sp || !sp.groups.length || !sp.geo) return;
    clearSpoolMarks();   // out of the boxes below; made again at the end
    const now = [...new Set(spoolColours().map(lower))].sort().slice(0, SPOOL_MAX);
    if (!now.length) return;
    const kept = new Set(), spare = [];
    for (const s of sp.groups.flatMap(spoolsOf)) { const c = lower(s.userData.spool.color); if (now.includes(c) && !kept.has(c)) kept.add(c); else spare.push(s); }
    const missing = now.filter((c) => !kept.has(c));
    while (spare.length && missing.length) spare.shift().userData.setColor(missing.shift());
    for (const s of spare) { disposeSpool(s); s.removeFromParent(); }
    for (const c of missing) {
      let host = sp.groups.filter((r) => r.userData.spoolGroup.kind === 'stack' && spoolsOf(r).length && spoolsOf(r).length < (sp.cap || SPOOL_HIGH)).sort((a, b) => spoolsOf(a).length - spoolsOf(b).length)[0];
      if (!host) {
        host = sp.groups.find((r) => r.userData.spoolGroup.kind === 'stand' && spoolsOf(r).length);
        if (host) { host.userData.spoolGroup.kind = 'stack'; sp.discs[sp.groups.indexOf(host)].scale.set(250, 1, 250); }   // laid down: a stack's contact disc
      }
      if (host) host.add(newSpool(c));
    }
    for (let i = sp.groups.length - 1; i >= 0; i--) {
      const r = sp.groups[i], list = spoolsOf(r);
      if (!list.length) {
        const d = sp.discs[i];
        r.removeFromParent(); d.removeFromParent(); d.geometry.dispose(); d.material.dispose();
        sp.groups.splice(i, 1); sp.discs.splice(i, 1); sp.placed.splice(i, 1);
        continue;
      }
      poseGroup(r);
      r.updateWorldMatrix(true, true);
      Object.assign(sp.placed[i], { kind: r.userData.spoolGroup.kind, colours: list.map((x) => x.userData.spool.color), box: plain(new THREE.Box3().setFromObject(r, true)) });
    }
    if (parts.hovered && !parts.hovered.parent) parts.hovered = null;   // a spool taken off the desk is under no pointer
    placeSpoolMarks();
    glowSpools();
    fitShadowToSpools();   // a stack grown or one gone: the sun's shadow refitted round them
    stage.invalidateFrame();
  }
  /* the sun's shadow camera round the build AND the spools and their shadows on the desk (main.js THE SHADOW BEYOND THE
     BUILD): fitted to the build alone, a stack beside it caught and cast its shadow only partly, cut on a straight line */
  function fitShadowToSpools() {
    if (!stage.setShadowExtent) return;
    stage.setShadowExtent(parts.spools ? parts.spools.groups.map((g) => new THREE.Box3().setFromObject(g, true)) : []);
  }
  /* the build's facts the milestone sayings read (done-fit.js buildFacts): its units, which carry a drawer and a label, and
     its overall size */
  function facts() {
    const units = ((stage.build && stage.build.placed) || []).map((u) => ({ w: u.w, hh: u.hh, label: u.label, drawer: !!(stage.unitHasDrawer && stage.unitHasDrawer(u.id)) }));
    const s = buildBox && !buildBox.isEmpty() ? buildBox.getSize(new THREE.Vector3()) : { x: 0, y: 0 };
    return buildFacts(units, { x: s.x, y: s.y });
  }
  function makeMugs(group) {
    const mug = group.getObjectByName('mug'), handle = group.getObjectByName('mug_handle'), coffee = group.getObjectByName('coffee');
    if (!mug || !mug.geometry) return;
    mug.geometry.computeBoundingBox();
    const bb = mug.geometry.boundingBox, r = (bb.max.x - bb.min.x) / 2, h = bb.max.y - bb.min.y, rMm = r * SCALE, hMm = h * SCALE;   // the GLB's metres
    /* the build's link (its #build=, or a kit's ?build=), not the page's other parameters. With ?debug, ?mugs=N sets how many,
       and ?mugs=home the room as it was composed: one JERRARI mug at its home, the notebook on the desk (the e2e's default) */
    const q = new URLSearchParams(location.search), m0 = debug ? q.get('mugs') : null, bf = facts();
    const plan = m0 === 'home' ? { count: 1, notebookOff: false, mugs: [{ look: 'jerrari', back: MUGS.jerrari.sayings[0], turnDeg: 0, spot: 0, home: true }] }
      : mugPlan(rngFrom(hashSeed(location.hash || q.get('build') || 'room')), { count: m0 != null && /^\d+$/.test(m0) ? +m0 : null, extra: unlockedSayings(bf) });
    const made = { mats: [], meshes: [], masks: [], texs: [], plan, placed: [], facts: bf };
    parts.mugs = made;
    subj.mugs = [];
    const gone = () => parts.mugs !== made;
    const lit = { env: parts.env || null, sunDir: json && json.sun && json.sun.dir };   // a glaze's light: the room's environment and its sun
    const linear = (hex) => (hex ? new THREE.Color(hex) : new THREE.Color(1, 1, 1));   // THREE.Color takes sRGB hex to linear
    const body = (m) => [].concat(m.material)[0];
    const src = { body: body(mug), handle: handle ? body(handle) : null };
    const bounce = { body: !!src.body.userData.bounce, handle: !!(src.handle && src.handle.userData.bounce) };
    const fn = { body: src.body.onBeforeCompile, handle: src.handle && src.handle.onBeforeCompile };   // the walls' bounce shader, before any glaze
    // a further mug's materials: the bake's own map and colour, the walls' bounce shader
    const copyOf = (m, f) => { const c = new THREE.MeshBasicMaterial({ map: m.map, color: m.color.clone(), side: m.side }); c.onBeforeCompile = f; made.mats.push(c); return c; };
    group.updateWorldMatrix(true, true);
    const at = (o) => new THREE.Box3().setFromObject(o);
    const q0 = parts.masks.find((m) => m.userData.doneShadow && m.userData.doneShadow.group === 'mug' && m.userData.doneShadow.surface === 'desk');
    // NO MUGS: the coffee mug, its coffee (the steam a child of it) and its shadow off the desk
    if (!plan.count) { for (const o of [mug, handle, coffee, q0]) if (o) o.visible = false; return; }
    /* THE NOTEBOOK OFF THE DESK (NOTEBOOK_OFF_SHARE): the plant and the notebook leave no mug-sized room left of the build
       (measured: no free spot there), so in some builds the notebook and its pen are gone, their shadow with them, and the
       mugs may stand there */
    if (plan.notebookOff && mount !== 'under-table') {
      for (const p of (json.props || []).filter((x) => x.group === 'notebook')) { const o = group.getObjectByName(p.name); if (o) o.visible = false; }
      for (const m of parts.masks) if (m.userData.doneShadow && m.userData.doneShadow.group === 'notebook') m.visible = false;
    }
    // what a mug must stand clear of: every prop on the desk, the build, and the desk in front of the build (where a mug
    // would stand between the shots and the build)
    const own = new Set(['mug', 'mug_handle', 'coffee']);
    const obstacles = (json.props || []).filter((p) => !own.has(p.name)).map((p) => group.getObjectByName(p.name)).filter((o) => o && o.visible).map((o) => plain(at(o)));
    for (const sp of (parts.spools && parts.spools.placed) || []) obstacles.push(sp.box);   // the spools, made first
    const desk = group.getObjectByName('desk_top');
    if (buildBox && !buildBox.isEmpty()) {
      obstacles.push({ min: { x: buildBox.min.x - 28, z: buildBox.min.z - 28 }, max: { x: buildBox.max.x + 28, z: buildBox.max.z + 28 } });
      if (desk) obstacles.push({ min: { x: buildBox.min.x - 60, z: buildBox.min.z }, max: { x: buildBox.max.x + 60, z: at(desk).max.z + 100 } });
    }
    const home = at(mug).getCenter(new THREE.Vector3());
    /* the shadow mask's reach about the mug (world mm: it falls well to the mug's sunward side), so a mug and its mask never
       carry the mask past the desk's edges, where it would print the shadow in the air; a mask the slide already cut at a
       desk end (its texture window trimmed) keeps the coffee at home and makes no further mug (Sol 01a17612) */
    const sh = q0 && q0.userData.doneShadow, cut = !!(sh && (sh.u0 > 0 || sh.u1 < 1));
    const reach = q0 ? { x0: q0.position.x - q0.geometry.parameters.width / 2 - home.x, x1: q0.position.x + q0.geometry.parameters.width / 2 - home.x, z0: q0.position.z - q0.geometry.parameters.height / 2 - home.z, z1: q0.position.z + q0.geometry.parameters.height / 2 - home.z } : null;
    const deskBox = desk ? plain(at(desk)) : null;
    const onDesk = (p) => !reach || (p.x + reach.x0 >= deskBox.min.x && p.x + reach.x1 <= deskBox.max.x && p.z + reach.z0 >= deskBox.min.z && p.z + reach.z1 <= deskBox.max.z);
    // THE SPOTS: anywhere on the desk that is free, no nearer the front than the coffee's home (where the room's shots were
    // composed round it: a mug in front of that leaves the hero's frame), each mug its own, 170 mm from the others
    const spots = deskBox && !cut ? deskSpots(obstacles, deskBox).filter((p) => p.z <= home.z + 10 && onDesk(p)) : [];
    // ... and each standing clear of the others as the hero's camera sees them
    const heroCam = fitAt(GRAMMAR_HERO(), 0.5).position;
    const picks = cut || (plan.mugs[0] && plan.mugs[0].home) ? [{ x: home.x, z: home.z }] : pickSpots(spots, plan.mugs.map((m) => m.spot), 170, (p, o) => apartFrom(heroCam, p, o));
    /* the turns about each mug's own axis: the room's mug stands upright (its rotation the identity, measured 2026-10-25), so
       the vertical is its axis; a mug that did not would keep its pose (Sol 01a17612) */
    const upright = mug.quaternion.equals(new THREE.Quaternion());
    const axis = mug.position.clone().add(bb.getCenter(new THREE.Vector3()).multiply(mug.scale));   // the mug's axis at home, in the room's frame
    const handleHome = handle ? { p: handle.position.clone(), q: handle.quaternion.clone() } : null;
    /* the BODY turns too, its bake with it: the bake carries the handle's joints (two dark marks where the handle meets the
       body), which a print turned alone left behind, ghosts beside the logo (the 2026-10-25 shots). The bake's lit side
       turns with it, a smaller wrong on a white cylinder than the marks. The print is in the body's own frame, so it turns
       with the body (glaze's turn 0). */
    const bodyQ = mug.quaternion.clone(), turnQ = (turn) => bodyQ.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn));
    const place = (o, turn, d) => {   // a handle from its home pose, turned about the home axis by `turn`, then moved by `d`
      const t = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      o.position.copy(handleHome.p).sub(axis).applyQuaternion(t).add(axis).add(d); o.quaternion.copy(handleHome.q).premultiply(t);
    };
    const toLocal = (wx, wz) => group.worldToLocal(new THREE.Vector3(wx, home.y, wz));
    plan.mugs.forEach((m, i) => {
      const p = picks[i] || (i === 0 ? { x: home.x, z: home.z } : null);   // the coffee at home where no spot is free; a further mug left out
      if (!p) return;
      const look = MUGS[m.look], turn = upright ? (m.turnDeg * Math.PI) / 180 : 0;
      const d = toLocal(p.x, p.z).sub(toLocal(home.x, home.z));   // the move, in the room's own frame
      const tex = mugPrint(look, m.back, rMm, hMm, gone);
      made.texs.push(tex);
      let b, hd;
      if (i === 0) {   // THE COFFEE: the room's own mug, its coffee and the steam moved with it, its shadow mask too
        b = mug; hd = handle;
        glaze(src.body, { ...lit, body: linear(look.body), tex, y0: bb.min.y, h, r });
        mug.quaternion.copy(turnQ(turn));
        if (src.handle) glaze(src.handle, { ...lit, body: linear(look.body), foot: 0 });
        for (const o of [mug, coffee]) if (o) o.position.add(d);
        if (handle) place(handle, turn, d);
        if (q0 && (d.x || d.z)) { q0.position.add({ x: p.x - home.x, y: 0, z: p.z - home.z }); q0.userData.doneShadow.moved = { x: p.x - home.x, z: p.z - home.z }; }   // the move, for a reader of the quads
      } else {         // A FURTHER MUG: the room's mesh again with its own glaze, and the coffee mug's shadow again under it
        const mb = copyOf(src.body, fn.body);
        glaze(mb, { ...lit, body: linear(look.body), tex, y0: bb.min.y, h, r, bounce: bounce.body });
        b = new THREE.Mesh(mug.geometry, mb);
        b.position.copy(mug.position).sub(made.placed[0].d).add(d); b.quaternion.copy(turnQ(turn)); b.scale.copy(mug.scale);   // from home: the coffee has moved already
        const meshes = [b];
        if (handle && src.handle) {
          const mh = copyOf(src.handle, fn.handle);
          glaze(mh, { ...lit, body: linear(look.body), foot: 0, bounce: bounce.handle });
          hd = new THREE.Mesh(handle.geometry, mh); hd.scale.copy(handle.scale); place(hd, turn, d);
          meshes.push(hd);
        }
        for (const o of meshes) { o.name = 'done-mug-more'; o.castShadow = false; o.receiveShadow = false; o.raycast = () => {}; o.userData.doneRoom = true; group.add(o); made.meshes.push(o); }
        if (q0) {
          const qm = new THREE.Mesh(q0.geometry, q0.material);
          qm.position.copy(q0.position).sub({ x: made.placed[0].at.x - home.x, y: 0, z: made.placed[0].at.z - home.z }).add({ x: p.x - home.x, y: 0, z: p.z - home.z });
          qm.renderOrder = q0.renderOrder; qm.raycast = () => {}; qm.userData.doneRoom = true; qm.visible = q0.visible; scene.add(qm); made.masks.push(qm);
        }
      }
      made.placed.push({ look: m.look, at: p, d, turnDeg: m.turnDeg, coffee: i === 0, meshes: [b, hd].filter(Boolean) });
    });
    // the mugs' shot's subjects: each mug, body and handle (the shot takes one each time it comes round)
    group.updateWorldMatrix(true, true);
    subj.mugs = made.placed.map((m) => { const box = new THREE.Box3(); for (const o of m.meshes) box.union(at(o)); const f = mugFace(m.turnDeg); return { box: plain(box), face: f ? f.side : null, faceAz: f ? f.az : null }; });
    parts.mats.push(...made.mats);   // the environment's next capture reaches their sheen too (captureEnv)
  }
  /* the handle's: paint the room, capture it again, remember the choice in this browser, draw it (Very High's mean
     starts over: invalidateFrame) */
  function setRoomColours(c) {
    if (!on || !parts.envScene) return null;
    paintRoom({ wall: (c && c.wall) || colours.wall, desk: (c && c.desk) || colours.desk });
    captureEnv();
    stage.holdScene(true, { environment: parts.env });
    try { localStorage.setItem(ROOM_COLOURS_KEY, JSON.stringify({ wall: colours.wall, desk: colours.desk })); } catch {}
    stage.invalidateFrame();
    return { wall: colours.wall, desk: colours.desk };
  }
  /* the presets as the visitor's swatches: the bake's own paint and its oak in their baked colours (room.json), the desk
     finishes the bake cannot draw (no light-only map) left out; each colour as it renders, floored at matte black
     (done-fit.js roomFloor: the Black desk's #2a2b2d draws as the floor) */
  function roomPresets() {
    const lt = roomLight.desk_top, plain = !!(lt && lt.tex);
    const oak = lt && Array.isArray(lt.albedo) ? linearToHex(lt.albedo) : '#d9c4a6';
    return {
      walls: WALL_PAINTS.map((p) => ({ id: p.id, name: p.name, swatch: p.hex ? roomFloor(p.hex) : (json && json.colours && json.colours.wall) || '#e2e4e1' })),
      desks: DESK_FINISHES.filter((p) => p.kind === 'bake' || plain).map((p) => ({ id: p.id, name: p.name, swatch: p.hex ? roomFloor(p.hex) : oak })),
      ownDesk: plain,
    };
  }
  /* THE ROOM-COLOUR CONTROL (Joey 2026-10-25), one for both of the room's places, Colors' Room stage and the final scene's
     strip: a swatch row for the wall and one for the desk, the visitor's own colour last (live while it is dragged, a
     frame at a time); every choice goes through setRoomColours, so it is remembered and both places show it */
  function roomColoursPanel() {
    const p = roomPresets();
    const root = document.createElement('div');
    root.className = 'roomc';
    root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'Room colours');
    const rows = {};
    const own = (v) => /^#[0-9a-f]{6}$/i.test(v || '');
    const sync = () => {
      for (const key of ['wall', 'desk']) {
        if (!rows[key]) continue;
        for (const b of rows[key].querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === colours[key]));
        const lab = rows[key].querySelector('label.own');
        // the own-colour chip shows the colour as it renders: a pick under matte black, the floor it lifts to, and says so
        if (lab) {
          lab.classList.toggle('on', own(colours[key]));
          const shown = own(colours[key]) ? roomFloor(colours[key]) : null;
          if (shown) lab.style.setProperty('--c', shown);
          lab.title = shown && shown !== colours[key].toLowerCase() ? `Your own colour, lifted to ${shown}: no room paint is darker than matte black` : 'Your own colour';
        }
      }
    };
    for (const [key, list, label] of [['wall', p.walls, 'Wall'], ['desk', p.desks, 'Desk']]) {
      const row = document.createElement('div');
      row.className = 'row';
      const cap = document.createElement('span');
      cap.textContent = label;
      const sw = document.createElement('div');
      sw.className = 'sw';
      sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', label + ' colour');
      for (const s of list) {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.id = s.id; b.title = s.name;
        b.setAttribute('aria-label', label + ': ' + s.name);
        b.style.setProperty('--c', s.swatch);
        b.addEventListener('click', () => { setRoomColours({ [key]: s.id }); sync(); });
        sw.append(b);
      }
      if (key === 'wall' || p.ownDesk) {
        const lab = document.createElement('label');
        lab.className = 'own'; lab.title = 'Your own colour';
        const inp = document.createElement('input');
        inp.type = 'color'; inp.setAttribute('aria-label', 'Your own ' + label.toLowerCase() + ' colour');
        inp.value = own(colours[key]) ? colours[key] : (key === 'wall' ? '#8e9aa6' : '#a8a29a');
        let raf = 0;
        inp.addEventListener('input', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { setRoomColours({ [key]: inp.value }); sync(); }); });
        lab.append(inp);
        sw.append(lab);
      }
      row.append(cap, sw);
      rows[key] = sw;
      root.append(row);
    }
    sync();
    return root;
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
      if (sequence && !seq.judged) { seq.judged = true; if (entranceTooSlow(intervals, seq.timing.maxFrameMs)) seq.slow = true; superAfterVerdict(); }
    };
    parts.raf = requestAnimationFrame(step);
  }

  /* the files, then the programs (THE ROOM'S PROGRAMS AHEAD: nothing on the stage has changed yet, and the page has its
     frames), then the room in one task. A software rasteriser stays as it was: its programs are the CPU's, on the machine
     the page runs on, however they are started (`?roomahead=on` for the CI runner's e2e, `off` for a control arm). */
  const aheadFlag = debug ? new URLSearchParams(location.search).get('roomahead') : null;
  const ahead = aheadFlag !== 'off' && (!stage.softwareGL || aheadFlag === 'on');
  status = roomStatus(stage);
  const ready = loadRoom().then((room) => {
    if (cancelled || !ahead) return room;
    status.set(0.25);
    return warmRoom(stage, { urgent: true, onProgress: (f) => status.set(f) }).catch((e) => console.warn('[done scene] the programs ahead', e)).then(() => room);
  }).then(({ gltf, json: j, masks, light, bounce, spoolGeo }) => {
    status.remove();
    if (cancelled) return null;
    json = j; roomLight = light || {}; roomBounce = bounce || null;
    buildBox = stage.assembledBox.clone();
    if (buildBox.isEmpty()) throw new Error('no build to place');
    // the room, scaled to millimetres, its anchor on the build's back-centre at desk height
    const group = gltf.scene.clone(true);
    parts.mats = unlit(group);
    dressRoom(group, roomBounce);
    group.name = 'done-room';
    group.scale.setScalar(SCALE);
    const anchor = group.getObjectByName('anchor_tabletop');
    const a = anchor ? anchor.position : new THREE.Vector3();
    const centre = buildBox.getCenter(new THREE.Vector3());
    const d = json.desk || { x0: -900, x1: 900, zFront: 700, zBack: -40 };
    /* placed by the build's mount (done-fit.js roomAnchor): on the desk top, on the wall over the desk, or under the desk's
       front edge; the stage's own wall and slab stay hidden while the scene holds it (main.js, the render loop) */
    const frame = stage.mountFrame ? stage.mountFrame() : { mount: 'tabletop' };
    mount = GRAMMAR[frame.mount] ? frame.mount : 'tabletop';
    // the desk's left leg measured from the anchor, the group scaled and still at the origin: an under-table build is
    // left-justified against its inner face (roomAnchor)
    group.updateMatrixWorld(true);
    const legL = group.getObjectByName('desk_leg_l');
    const legInnerL = legL ? new THREE.Box3().setFromObject(legL).max.x - a.x * SCALE : null;
    const at = roomAnchor(mount, plain(buildBox), frame, json.anchors, { ...d, legInnerL });
    const anchorWorld = new THREE.Vector3(at.x, at.y, at.z);
    deskY = at.y;
    group.position.set(anchorWorld.x - a.x * SCALE, anchorWorld.y - a.y * SCALE, anchorWorld.z - a.z * SCALE);
    group.updateMatrixWorld(true);
    interior = roomInterior(group);   // the walls do not slide: the shots' clamp is fixed from here
    makeWindowPane(group);
    // props slide clear of the build along their slots, by group; a group that cannot clear it INSIDE the desk's extent
    // hides rather than hanging past the edge (a build wider than the desk's free run: done-fit.js fitSlides)
    const props = [];
    /* a prop is any node carrying a slot: a mesh, or a GROUP of meshes (a multi-material prop, the snake plant's leaves,
       comes out of the glTF as a Group `leaf_N` with the extras and child meshes without them: 2026-10-23, the leaves
       stayed behind when the pot slid or hid, since only meshes were looked at) */
    group.traverse((o) => { if (o.userData.slot && (o.isMesh || o.children.some((c) => c.isMesh))) props.push({ obj: o, group: o.userData.group || o.name, slot: o.userData.slot, gap: (+o.userData.gap || 0.06) * SCALE, box: plain(boxOf(o)) }); });
    // (a build under the desk never meets a prop on it; one on the wall meets only a prop that reaches up to it)
    const slides = mount === 'under-table' ? {} : slideProps(props, plain(buildBox), { height: mount === 'wall' });
    const slid = fitSlides(props, slides, { x0: anchorWorld.x + d.x0, x1: anchorWorld.x + d.x1 });
    for (const p of props) { const dx = slid[p.group]; if (dx === null) p.obj.visible = false; else if (dx) p.obj.position.x += dx / SCALE; }
    parts.slid = slid;
    group.updateMatrixWorld(true);
    parts.group = group;
    scene.add(group);
    // the shadow catcher over the desk top (its extent from room.json, relative to the anchor), and the Fast tier's disc
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(d.x1 - d.x0, d.zFront - d.zBack).rotateX(-Math.PI / 2), catcherMaterial(0.42));
    catcher.position.set(anchorWorld.x + (d.x0 + d.x1) / 2, deskY + 0.3, anchorWorld.z + (d.zBack + d.zFront) / 2);
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
    /* ... down past the desk top by the strip the sun reaches through the gap behind the desk (done-fit.js gapDrop; Joey
       2026-10-25: "the shadows cut off or start right at where the table is nearest the wall"): a lit line of wall parted
       the shadow on the desk from the one on the wall. The props' wall masks reach down over it too (maskQuad's below).
       The gap is measured to the wall anchor's plane, where the catchers stand, 1 mm in front of the wall's face: 19 mm,
       so 31.4 mm with the margin, over the 29.9 mm the sun reaches on the face itself. */
    const drop = wallZ != null ? gapDrop(json.sun && json.sun.dir, anchorWorld.z + d.zBack - wallZ) : 0;
    if (wallZ != null) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(d.x1 - d.x0 + 1200, 1600 + drop), catcherMaterial(WALL_SHADOW));
      wall.position.set(anchorWorld.x + (d.x0 + d.x1) / 2, deskY + 800 - drop / 2, wallZ + 0.3);   // a plane facing +z: toward the desk
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
      const q = maskQuad(m, { x: anchorWorld.x, y: deskY, z: anchorWorld.z }, wallZ, slid[m.group], 0.5, { x0: d.x0, x1: d.x1 }, drop);   // a desk quad is cut at the desk's ends (Sol 01a16bc5)
      if (!q) continue;
      const geo = new THREE.PlaneGeometry(q.w, q.h);
      if (q.u0 > 0 || q.u1 < 1) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, q.u0 + uv.getX(i) * (q.u1 - q.u0)); uv.needsUpdate = true; }   // the texture window follows the cut
      if (q.v0 < 0) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, q.v0 + uv.getY(i) * (1 - q.v0)); uv.needsUpdate = true; }   // a wall mask carried down the strip under the desk top: its bottom row, clamped
      if (q.surface === 'desk') geo.rotateX(-Math.PI / 2);   // lying on the desk, the image's top toward the wall; a wall mask faces +z, toward the desk
      const quad = new THREE.Mesh(geo, maskMaterial(m.tex));
      quad.position.set(q.x, q.y, q.z); quad.visible = q.visible;
      quad.renderOrder = 1; quad.raycast = () => {}; quad.castShadow = false; quad.receiveShadow = false;
      quad.userData.doneRoom = true; quad.userData.doneShadow = { group: m.group, surface: m.surface, dx: q.visible ? (slid[m.group] || 0) : null, u0: q.u0, u1: q.u1 };
      parts.masks.push(quad); scene.add(quad);
    }
    const fp = contactFootprint(plain(buildBox));
    parts.tex = contactTexture();
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(fp.w, fp.d).rotateX(-Math.PI / 2), discMaterial(parts.tex));
    sprite.position.set(fp.x, deskY + 0.2, fp.z); sprite.renderOrder = 1; sprite.raycast = () => {}; sprite.userData.doneRoom = true;
    /* UNDER THE DESK (an under-table build, 2026-10-25): the room is baked and unlit, so its desk casts no shadow, and the
       build hung under it took the sun as if the desk were not there. The desk's own top and legs cast it, drawn as
       before and now in the shadow map too: the left leg stands 20 mm from a left-justified build, on the window's side.
       (A stand-in box under the top was drawn by the AO's override pass, its square edges over the top's 3 mm bevel:
       Sol 01a17311.) The room is a fresh clone each entry, so the flags go with it. */
    if (mount === 'under-table') for (const n of ['desk_top', 'desk_leg_l', 'desk_leg_r']) {
      const o = group.getObjectByName(n);
      if (o) o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    }
    parts.sprite = sprite; scene.add(sprite);
    // the build's lighting: the room itself, seen from the build, as the environment (the baked textures are its light).
    // The clone shares the room's materials, so the visitor's colours (painted first) are in it, and in every capture after.
    parts.envScene = new THREE.Scene();
    const envRoom = group.clone(true); envRoom.position.sub(centre); parts.envScene.add(envRoom);
    envRoom.traverse((o) => { if (o.userData.live) o.visible = false; });   // a lit metal in a scene with no lights renders black: keep it out of the room it reflects
    paintRoom(savedRoomColours());
    captureEnv();
    makeSteam(group);   // after the capture: the room it reflects has no steam
    makeSpools(group, spoolGeo);   // the spools first: the mugs keep clear of them
    makeMugs(group);   // nor its mugs' print, nor the second mug
    // the stage's holds: background off, our environment, the shadow on whatever the theme, the camera ours
    stage.table.visible = false; stage.grid.visible = false;
    stage.holdScene(true, { environment: parts.env });   // the hold also keeps every dimension callout off, whatever sets them, until it ends (main.js holdScene)
    applyLights(stage.quality);
    // the hero never looks at the window: its pane compiled now, under the hold's shadow, not on the first shot that does
    if (parts.pane && stage.compileAhead) stage.compileAhead(parts.pane);
    fitShadowToSpools();   // after the room's sun is placed: the fit is taken in its view
    // the scene has no orbit (Joey: "don't let them rotate the camera"); a stage (Colors) keeps it; never a pan, the shots own the aim
    controls.enabled = !!orbit; controls.enablePan = false;
    /* ... nor the stage's floor on the orbit (maxPolarAngle 0.52 pi on a desk build: "don't go under the table"), which
       controls.update() applies to every camera put: it lifted the low shot, which looks up from 7 deg below its aim, to
       3.6 deg below (found 2026-10-25 by the grammar e2e, the camera 33 mm over the shot's fit). The shots keep their own
       floor over the desk (FLOOR_MM). A stage with the orbit (Colors) keeps it. */
    if (!orbit) controls.maxPolarAngle = Math.PI;
    /* ... and a stage's orbit stays in the room (Joey 2026-10-26: "i can spin it around and clip through the wall or zoom
       out a mile until the viewing distance makes everything disapear, maybe they can't move our zoom out of the room?"):
       inside the shots' own margins off the walls, the floor and under the walls' top (done-fit.js insideRoom) it turns
       and zooms freely; a move that would take it past them STOPS where it was, the last place inside. Not pulled in
       along its line to the build, as at first: a spin into a wall then dragged the camera into the build itself (Joey,
       the same day: "if you spin the camera into the wall, i think it automatically zooms in super far like into the
       inside of the build"). A camera put outside by something else (none of the shots is) is pulled in, held there. */
    if (orbit && interior) {
      const last = new THREE.Vector3();
      let haveLast = false;
      parts.keepIn = () => {
        const p = camera.position, q = insideRoom(p, interior);
        if (q.x === p.x && q.y === p.y && q.z === p.z) { last.copy(p); haveLast = true; return; }
        if (haveLast) p.copy(last);
        else {
          const c = clampToInterior({ position: p, target: controls.target, fov: camera.fov, distance: 0 }, interior);
          const r = insideRoom(c.position, interior);   // and held in, whatever the pull's floor left (Sol 01a17823)
          p.set(r.x, r.y, r.z); last.copy(p); haveLast = true;
        }
        camera.lookAt(controls.target);   // the controls aimed it from where it was refused
      };
      controls.addEventListener('change', parts.keepIn);
    }
    /* ... and a spool there is a filament to change everywhere (Joey 2026-10-26: "what if i could select a spool and change
       it's color, and doing so would replace everything in the build that used that same color"): a tap on one hands its
       colour to the stage's owner (Colors opens its picker on that filament), the pointer and a tooltip say so on hover */
    if (orbit && onSpool && stage.setTapTargets) {
      /* the spool a ray meets first, if what it meets first is a spool: the room's props, the desk and the walls hide one
         (Sol 01a17823: a mug in front of a spool); what is not drawn (a prop off the desk, a room part hidden) and the
         see-through layers (the shadow quads, the contact discs, the steam) hide nothing */
      const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      const solid = (h) => shown(h.object) && !h.object.userData.doneShadow && !(h.object.material && h.object.material.transparent && h.object.material.depthWrite === false);
      const spoolHit = (r, beyond = Infinity) => {
        const h = r.intersectObjects([group, ...(parts.spools ? parts.spools.groups : [])], true).find(solid);
        if (!h || h.distance >= beyond) return null;
        let o = h.object; while (o && !o.userData.spool) o = o.parent;
        return o || null;
      };
      stage.setTapTargets({ onTap: (r, buildAt) => { const s = spoolHit(r, buildAt); if (s) onSpool(s.userData.spool.color); return !!s; } });
      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), el = renderer.domElement;
      parts.hover = (e) => {
        if (e.buttons || e.pointerType === 'touch') return;
        const r = el.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const s0 = spoolHit(ray), s = s0 && spoolHit(ray, stage.buildHitDistance(ray));   // the build first only when a spool is in line: one cast of it, not one a move
        const over = !!s;
        if (over !== !!parts.hoverOn) { parts.hoverOn = over; el.style.cursor = over ? 'pointer' : ''; el.title = over ? 'Change this spool’s filament everywhere in the build' : ''; }
        if ((s || null) !== (parts.hovered || null)) { parts.hovered = s || null; glowSpools(); }
      };
      el.addEventListener('pointermove', parts.hover);
    }
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
    if (debug) window.__GEN2_DONE__ = { get slides() { return { ...parts.slid }; }, get relief() { return { override: stage.reliefOverride ? stage.reliefOverride() : null, ...relief }; }, get shadows() { return parts.masks.map((q) => ({ ...q.userData.doneShadow, visible: q.visible, x: q.position.x, y: q.position.y, z: q.position.z, w: q.geometry.parameters.width, h: q.geometry.parameters.height, vMin: Math.min(...q.geometry.attributes.uv.array.filter((_, i) => i % 2 === 1)) })); },
      // where the room went for this build's mount (roomAnchor): the desk top's height, and the room's meshes that cast, read
      // from their flags as they stand (Sol 01a17311: a list kept beside the flags can say what they do not)
      get placement() { const casters = []; if (parts.group) parts.group.traverse((o) => { if (o.isMesh && o.castShadow) casters.push(o.name); }); return { mount, deskY, sprite: parts.sprite ? parts.sprite.visible : null, casters, gapDrop: drop, wallCatcherBottom: parts.wall ? parts.wall.position.y - parts.wall.geometry.parameters.height / 2 : null }; },
      // the room colours as drawn, read off the materials themselves (the wall's and the desk top's colour, linear; the
      // desk's texture), the environment's texture and how often it was captured
      get colours() {
        const g = parts.group, first = (n) => { const o = g && g.getObjectByName(n); return o ? [].concat(o.material)[0] : null; }, w = first('wall_back'), t = first('desk_top');
        const lt = roomLight.desk_top && roomLight.desk_top.tex;
        const k = (m) => (m && m.userData.bounce ? m.userData.bounce.k.toArray() : null), dk = (m) => (m && m.userData.bounce ? m.userData.bounce.dk.toArray() : null);
        return { wall: colours.wall, desk: colours.desk, envs: colours.envs, env: parts.env ? parts.env.uuid : null, wallColor: w && w.color.toArray(), wallBase: w && w.userData.doneBase.toArray(),
          wallMap: w ? (w.map === w.userData.doneMap ? 'bake' : 'other') : null,
          deskColor: t && t.color.toArray(), deskBase: t && t.userData.doneBase.toArray(), deskMap: t ? (lt && t.map === lt ? 'light' : t.map === t.userData.doneMap ? 'bake' : 'other') : null, plainDesk: !!lt,
          // the desk's sheen (addSheen): on for a plain colour, its environment the one captured last
          deskSheen: t && t.userData.sheen ? { on: t.userData.sheen.on.value, rough: t.userData.sheen.rough.value, env: !!t.envMap, current: !!t.envMap && t.envMap === parts.env } : null,
          // the walls' bounce each surface loses (its k, per channel), and the atlas rect it reads, off the materials
          bounce: roomBounce ? { wall: k(w), desk: k(t), floor: k(first('floor')), deskRect: t && t.userData.bounce ? t.userData.bounce.rect.toArray() : null } : null,
          // and the desk's bounce each loses (its dk; negative where the new desk colour adds light the oak did not), its
          // rect, the desk's weight and the room's record of the desk's albedo as baked and its diffuse share
          deskBounce: roomBounce && roomBounce.desk ? { wall: dk(w), desk: dk(t), floor: dk(first('floor')), deskRect: t && t.userData.bounce ? t.userData.bounce.drect.toArray() : null,
            weight: colours.deskWeight || null, albedo: roomBounce.desk.albedo, share: roomBounce.desk.share } : null };
      },
      // the still shot's drift (driftStart): its plan, its animation's state, and the canvas's transform as the page has it
      get drift() {
        const el = renderer.domElement, box = el.parentElement;
        return { plan: drift.plan, state: drift.anim ? drift.anim.playState : null, transform: getComputedStyle(el).transform, origin: el.style.transformOrigin, clip: box ? getComputedStyle(box).overflow : null, n: drift.n };
      },
      // the shots' subjects (pickSubjects) and the label shot's focus-in (its animation's state, the canvas's filter now)
      // the mugs (makeMugs): the build's plan, where the second one stood, whether each print's logo has drawn, its meshes
      get spools() { const p = parts.spools; return p ? { cleared: p.cleared || [], plan: p.plan, placed: (p.placed || []).map((x) => ({ kind: x.kind, colours: x.colours, at: x.at, box: x.box })), colours: p.groups.flatMap((r) => r.children.map((s) => s.userData.spool && s.userData.spool.color)), discs: p.discs.map((d) => d.visible), marksDrawn: parts.marksDrawn || 0 } : null; },
      refreshSpools, selectSpool,
      get spoolGlow() { return parts.spools ? parts.spools.groups.flatMap(spoolsOf).map((s) => [lower(s.userData.spool.color), s.userData.glow || 0]) : []; },
      get mugs() { const p = parts.mugs; return p ? { framed: subj.mug ? (subj.mug.group ? subj.mug.group.map((g) => subj.mugs.indexOf(g)) : [subj.mugs.indexOf(subj.mug)]) : null, plan: p.plan, facts: p.facts, count: p.placed.length, placed: p.placed.map((m) => ({ look: m.look, at: m.at, turnDeg: m.turnDeg, coffee: m.coffee, pos: m.meshes[0].getWorldPosition(new THREE.Vector3()).toArray(), visible: m.meshes[0].visible })), logos: p.texs.map((t) => !!t.userData.logo), sayings: p.texs.map((t) => !!t.userData.saying), more: p.meshes.length, masks: p.masks.length, subject: subj.mug ? subj.mugs.indexOf(subj.mug) : null } : null; },
      get subjects() { return { labels: subj.labels.map((l) => l.id), label: subj.label ? subj.label.id : null, row: subj.row }; },
      get focus() { return { state: focus.anim ? focus.anim.playState : null, filter: getComputedStyle(renderer.domElement).filter }; },
      setRoomColours,
      // the coffee's steam (makeSteam): its clock, the frames its tick asked for, its tier's rate, where its foot stands, its
      // sheets and its mist (on the coffee, a ghost, on the same clock)
      get steam() {
        const s = parts.steam; if (!s) return null;
        const m = s.mist;
        return { t: s.t, ticks: s.ticks, rate: steamRate(stage.quality, reduced), overlay: !!s.overlay && stage.accOverlayLive(), shown: !!s.mesh.parent && s.mesh.parent.visible, foot: s.mesh.getWorldPosition(new THREE.Vector3()).toArray(), w: s.size.w, h: s.size.h, ghost: !!s.mesh.userData.ghost, uTime: s.mesh.material.uniforms.uTime.value, visible: s.mesh.visible && s.mist.visible,
          sheets: s.mesh.geometry.attributes.aSlice.count / 4, mist: { on: m.parent === s.mesh.parent, ghost: !!m.userData.ghost, at: m.getWorldPosition(new THREE.Vector3()).toArray(), clock: m.material.uniforms.uTime === s.mesh.material.uniforms.uTime } };
      },
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
    status.remove();
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
      driftStop();   // and its drift ends: about the old framing it would carry the build off its place (Sol 01a17503); a resize is a jump anyway
      stage.invalidateFrame();
    }
  }
  function leave() {
    cancelled = true;
    status.remove();
    if (!on) return;
    on = false;
    seqStop();
    if (stage.setInteriorHidden) stage.setInteriorHidden(false);   // after seqStop's drawerCancel: every interior mesh back, no re-hide timer left
    if (stage.setReliefOverride) stage.setReliefOverride(null);    // the tier has its say again
    cancelAnimationFrame(parts.raf);
    cancelAnimationFrame(parts.steamRaf);
    if (parts.steam && parts.steam.overlay) stage.removeAccOverlay(parts.steam.overlay);   // off the still picture before its meshes go
    if (parts.steam) { for (const o of [parts.steam.mesh, parts.steam.mist]) { o.geometry.dispose(); o.material.dispose(); } parts.steam = null; }   // the meshes leave with the room
    if (parts.pane) { const m = parts.pane; m.removeFromParent(); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); parts.pane = null; }
    if (parts.spools) { clearSpoolMarks(); for (const r of parts.spools.groups) { r.traverse((o) => { if (o.userData.spool) disposeSpool(o); }); r.removeFromParent(); } for (const d of parts.spools.discs) { d.removeFromParent(); d.geometry.dispose(); d.material.dispose(); } parts.spools = null; }   // the spools' geometry is shared and stays
    if (parts.mugs) { for (const o of [...parts.mugs.meshes, ...parts.mugs.masks]) o.removeFromParent(); for (const t of parts.mugs.texs) t.dispose(); parts.mugs = null; }   // the second mug and its shadow out (their geometry is the cached load's; their materials go with parts.mats)
    subj.mugs = null;
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
    stage.holdScene(false);   // and the callouts back as the page last asked for them
    if (stage.setSupersample) stage.setSupersample(false);
    if (stage.setShadowExtent) stage.setShadowExtent([]);   // the stage's shadow round its build alone again
    if (parts.env) { parts.env.dispose(); parts.env = null; }
    parts.envScene = null;   // its clones share the room's geometry and materials, disposed with the room
    controls.enabled = was.controls; controls.enablePan = was.pan; controls.maxPolarAngle = was.polar;
    if (parts.keepIn) { controls.removeEventListener('change', parts.keepIn); parts.keepIn = null; }
    if (parts.hover) { parts.hovered = null; parts.selectedHex = null; stage.setTapTargets(null); renderer.domElement.removeEventListener('pointermove', parts.hover); if (parts.hoverOn) { renderer.domElement.style.cursor = ''; renderer.domElement.title = ''; } parts.hover = null; parts.hoverOn = false; }
    stage.resetView();   // the guided camera of the page the stage is on (the finished step, or the one a click chose)
    stage.invalidateFrame();
  }
  function onQuality(tier) {
    if (!on) return;
    applyLights(tier);
    if (parts.pane && stage.compileAhead) stage.compileAhead(parts.pane);   // the new tier's shadow state is in its program
    fitShadowToSpools();   // the new tier's map size and Very High's tilt
    if (parts.steam) parts.steam.follow(tier);   // the steam drawn or not before the new tier's first frame (Terra 01a1755a)
    /* a drop below High mid-shot: a moving shot locks off where it is, and the drawer's timers would outlive the drop (the
       still grammar has no drawer moment: Terra 01a16b6b) */
    if (sequenceWanted(tier)) {
      if (!seq.on) seqStart();
      else {
        if (!moves(tier)) { freeze({ resched: true }); drawerCancel(); }
        warmAhead(tier);
        if (seq.shot && seq.cutAt == null) setLensFor(currentShot(), fitAt(currentShot(), seq.k));   // a lens only where the new tier accumulates
        if (!driftWanted(tier, reduced)) driftStop();   // a change to Very High: its still shots are not zoomed
      }
    }
    else { clearTimeout(seq.startTimer); if (seq.on) { seqStop(); placeCamera(false); } }   // none wanted (reduced motion; a stage): the fixed hero, and no sequence still to start (Sol 01a16b2a)
  }
  const handle = { leave, onQuality, refit, recenter, nextShot, setRoomColours, roomColoursPanel, refreshSpools, selectSpool, get roomColours() { return { wall: colours.wall, desk: colours.desk, plainDesk: !!(roomLight.desk_top && roomLight.desk_top.tex) }; }, get on() { return on; } };
  return { ready, leave };
}
