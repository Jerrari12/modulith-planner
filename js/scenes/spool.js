/* A FILAMENT SPOOL (Joey 2026-10-26: "a 3d model of filament, we could even stack near or around the build and changes with
 * the colors selected for the build"; his spool, `Individual Spool Holder + Spool.blend`, "Filament Spool C"). The flanges
 * and the hub are his mesh, lightened (scenes/props/spool.glb: 7,438 triangles from 31,544, the flat faces dissolved and
 * collapsed to 0.3, shaded smooth by 30 deg). The wound filament is NOT his: it was one helix tube, 1.76 mm thick, wound
 * once across the outside, 151,588 vertices of his 172,262. Here it is one drum (a cylinder and its two side faces)
 * whose shader draws the winding: each pixel's normal bent over a round strand of the measured winding (right-handed,
 * 1.80 mm pitch, the strands' crests at 91.4 mm), a crease darkening between strands, and the pattern easing to its flat
 * average where a strand is under a pixel (no shimmer at a distance). Lit by the stage's own lights like the build
 * (MeshStandardMaterial), so the spool reads as the build's plastic in the room and in the studio, and casts its shadow.
 * Millimetres, the spool's axis along +Y, its centre at the origin. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const SPOOL = {
  glb: 'scenes/props/spool.glb',
  pitch: 1.8,          // mm, a turn of the strand along the axis (measured: a right-handed helix, phase coherence 0.60)
  strand: 1.76,        // mm, its diameter
  rOuter: 90.9,        // mm, the drum's surface (the strands' centres at 90.5, their crests at 91.4)
  rInner: 38.2,        // mm, the drum's bore (the hub's 35-38 inside it)
  half: 27.45,         // mm, half the drum's width, just inside the flanges' inner faces (27.49)
  plastic: '#595959',  // his spool's material: base 0.1 linear, roughness 0.45
};

let flanges = null;
/* the flanges and hub, loaded once: the GLB's axis turned onto +Y and its units onto millimetres, whatever the exporter wrote
   (read off its bounding box: 200 mm across, 65 mm along the axis) */
export function loadSpool(url = SPOOL.glb) {
  if (!flanges) {
    flanges = new GLTFLoader().loadAsync(url).then((g) => {
      let geo = null;
      g.scene.traverse((o) => { if (!geo && o.isMesh) { o.updateWorldMatrix(true, false); geo = o.geometry.clone().applyMatrix4(o.matrixWorld); } });
      geo.computeBoundingBox();
      const s = geo.boundingBox.getSize(new THREE.Vector3());
      const axis = s.x < s.y && s.x < s.z ? 'x' : s.y < s.z ? 'y' : 'z';   // the short side is the axis
      if (axis === 'x') geo.rotateZ(Math.PI / 2); else if (axis === 'z') geo.rotateX(Math.PI / 2);
      geo.computeBoundingBox();
      const k = 200 / geo.boundingBox.getSize(new THREE.Vector3()).x;   // to millimetres
      geo.scale(k, k, k);
      geo.computeBoundingBox();
      geo.translate(...geo.boundingBox.getCenter(new THREE.Vector3()).negate().toArray());
      return geo;
    }).catch((e) => { flanges = null; throw e; });
  }
  return flanges;
}

/* the winding's shader, for the drum's outer face (SIDE 0) and its two side faces (SIDE 1, the strands' ends in rings).
   COIL_FADE: the strands are drawn where one spans 8 px or more and fade out by 5 (Joey 2026-10-26, of the final scene:
   "I just notice a lot of harsh pixels"; "I can see it really bad around the bottom of the first spool"). The crease
   between two strands is a fifth of one, and a normal that turns over within a pixel is specular aliasing MSAA never
   touches: the old window, drawn to 4 px and gone at 2, left a sub-pixel crease drawn at half strength, and moire */
const COIL_FADE = 'clamp( ( 0.2 - fwidth( %s ) ) / 0.075, 0.0, 1.0 )';
const COIL_VERT_PARS = 'varying vec3 vCoilP;\nvarying vec3 vCoilR;\nvarying vec3 vCoilA;\n';
const COIL_VERT = '#include <begin_vertex>\n'
  + '\tvCoilP = position;\n'
  + '\tvCoilR = normalize( ( modelViewMatrix * vec4( position.x, 0.0, position.z, 0.0 ) ).xyz );\n'
  + '\tvCoilA = normalize( ( modelViewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );\n';
const COIL_FRAG_PARS = 'uniform float uPitch;\nuniform float uR0;\nvarying vec3 vCoilP;\nvarying vec3 vCoilR;\nvarying vec3 vCoilA;\n'
  + 'float coilU() {\n'
  + '#if COIL_SIDE == 0\n'
  + '\treturn vCoilP.y / uPitch - atan( vCoilP.x, vCoilP.z ) / 6.28318530718;\n'
  + '#else\n'
  + '\treturn ( length( vCoilP.xz ) - uR0 ) / uPitch;\n'
  + '#endif\n'
  + '}\n';
const COIL_NORMAL = '#include <normal_fragment_maps>\n'
  + '\tfloat coilS = coilU();\n'
  + '\tfloat coilW = ' + COIL_FADE.replace('%s', 'coilS') + ';\n'
  + '\tfloat coilT = 2.0 * fract( coilS ) - 1.0;\n'
  + '\tfloat coilC = sqrt( max( 1.0 - coilT * coilT, 0.0 ) );\n'
  + '#if COIL_SIDE == 0\n'
  + '\tvec3 coilN = normalize( vCoilR * coilC + vCoilA * coilT * 0.9 );\n'
  + '#else\n'
  + '\tvec3 coilN = normalize( normal * coilC + vCoilR * coilT * 0.9 );\n'
  + '#endif\n'
  + '\tnormal = normalize( mix( normal, coilN, coilW ) );\n';
const COIL_COLOR = '#include <color_fragment>\n'
  + '\t{ float s = coilU(), w = ' + COIL_FADE.replace('%s', 's') + ', t = abs( 2.0 * fract( s ) - 1.0 );\n'
  + '\t  diffuseColor.rgb *= mix( 0.9, mix( 1.0, 0.55, smoothstep( 0.6, 1.0, t ) ), w ); }   // the crease between strands\n';

function coilMaterial(side, color) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.38, metalness: 0 });
  m.defines = { COIL_SIDE: side };
  m.userData.coil = { uPitch: { value: SPOOL.pitch }, uR0: { value: SPOOL.rInner } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.coil);
    sh.vertexShader = COIL_VERT_PARS + sh.vertexShader.replace('#include <begin_vertex>', COIL_VERT);
    sh.fragmentShader = COIL_FRAG_PARS + sh.fragmentShader.replace('#include <normal_fragment_maps>', COIL_NORMAL).replace('#include <color_fragment>', COIL_COLOR);
  };
  m.customProgramCacheKey = () => 'spool-coil-' + side;
  return m;
}

/* the drum's geometry, shared by every spool: the outer face (256 round, 4 along: the strands are the shader's) and the two
   side faces (rings from the bore to the surface) */
let drum = null;
function drumGeometry() {
  if (!drum) {
    const outer = new THREE.CylinderGeometry(SPOOL.rOuter, SPOOL.rOuter, 2 * SPOOL.half, 256, 4, true);
    const side = (y, flip) => { const g = new THREE.RingGeometry(SPOOL.rInner, SPOOL.rOuter, 192, 2); g.rotateX(flip ? Math.PI / 2 : -Math.PI / 2); g.translate(0, y, 0); return g; };
    drum = { outer, sides: [side(SPOOL.half, false), side(-SPOOL.half, true)] };
  }
  return drum;
}

/* THE FLANGES' SHADOW (Joey 2026-10-26, of the final scene's spools: stair-stepped shadows "are the main ones i'm
   noticing"): the lightened flange's rim is long flat slivers, and each straight facet threw a straight-edged shadow onto
   the coil under it, a curve come out in blocks; measured, it is no shadow-map texel (1024, 2048 and 4096 drew the same
   blocks) and it goes with the flange not casting. So the flange casts nothing and two discs of its size do: depth only,
   256 round, never drawn, never hit, out of the AO. (Their slots let no light through; at this scale none showed.) */
let caster = null;
const casterGeometry = () => caster || (caster = new THREE.CylinderGeometry(100, 100, 5, 256));   // a flange: 100 mm round, its faces at 27.5 and 32.5
const CASTER = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/* one spool of `color` (a hex): the flanges (`geo`, from loadSpool) in the spool's plastic, the wound drum in the colour.
   Returns the group (its axis along +Y) and a `setColor`. */
export function makeSpool(geo, color, { plastic = SPOOL.plastic } = {}) {
  const g = new THREE.Group();
  g.name = 'spool';
  const fm = new THREE.MeshStandardMaterial({ color: new THREE.Color(plastic), roughness: 0.45, metalness: 0 });
  const f = new THREE.Mesh(geo, fm);
  const d = drumGeometry(), outer = coilMaterial(0, color), sides = coilMaterial(1, color);
  const o = new THREE.Mesh(d.outer, outer);
  const s = d.sides.map((sg) => new THREE.Mesh(sg, sides));
  for (const m of [f, o, ...s]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  f.castShadow = false;   // its discs cast for it (THE FLANGES' SHADOW)
  for (const y of [30, -30]) {
    const c = new THREE.Mesh(casterGeometry(), CASTER);
    c.name = 'spool-caster'; c.position.y = y; c.castShadow = true; c.receiveShadow = false;
    c.userData.ghost = true; c.raycast = () => {};
    g.add(c);
  }
  g.userData.spool = { color, materials: [fm, outer, sides] };
  /* the glow a spool takes on the Colors stage (Joey 2026-10-26: "when you hover over a filament and select a filament we
     should highlight it in some way so you know you can click it and when it is selected"): 0 none, 1 under the pointer
     (its filament a little lit), 2 its picker open (lit more, the flanges warmed toward the picker's orange) */
  const glow = (lv) => {
    const k = [0, 0.22, 0.4][lv] || 0;
    outer.emissive.set(g.userData.spool.color).multiplyScalar(k); sides.emissive.copy(outer.emissive);
    fm.emissive.set(lv === 2 ? 0x5a2400 : lv === 1 ? 0x1a1a1a : 0x000000);
    g.userData.glow = lv;
  };
  g.userData.setGlow = glow;
  g.userData.setColor = (hex) => { outer.color.set(hex); sides.color.set(hex); g.userData.spool.color = hex; glow(g.userData.glow || 0); };
  return g;
}

/* every material a spool made (the geometry is shared and stays) */
export function disposeSpool(g) {
  for (const m of (g.userData.spool && g.userData.spool.materials) || []) m.dispose();
}
