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

/* THE SPOOL'S MATERIAL, SHOWN (Joey 2026-10-27: "a way to identify if they are pla, petg, tpu, and so on, like maybe a
 * paper tag or something that hangs down near the front? ... two black spools but one is PLA black and the other is TPU
 * black, but at a glance they look identical"). Of three mock-ups (a tag, a flange sticker, banded rims; 2026-10-28) he
 * chose the tag, then a real shipping tag, then (the same day): "hang them further down, maybe slightly smaller, so it
 * doesn't run the risk of clipping into the spool or filament ... a different color other than cardboard ... tiny text
 * with brand name? or maybe text defining if it's silk, high temp, carbon fiber, etc, maybe even using the bottom of the
 * tag as a color strip of the exact color the filament is"). Then Astra's review, which Joey brought (the same day): a
 * sticker on the flange for the views the tag misses, and one order of words on both, "TPU / 95A · BLACK / Polymaker ·
 * PolyFlex": the material, then its grade or finish and colour, then its maker and line, smaller. done.js
 * placeSpoolMarks hangs the tags and lays the stickers. */
export const MATERIAL_COLOURS = { PLA: '#2a64c4', PETG: '#ad5a0c', TPU: '#1b7a50' };
/* a filament's label words (main.js filamentsInBuild: material, props, brand, line, colourName; hex), or null when it says
   no material: `detail` its grade or finish and its colour ("95A · BLACK"), `maker` its brand and line ("POLYMAKER ·
   POLYFLEX") */
export const tagInfo = (f) => {
  if (!f || !f.material) return null;
  const props = f.props || (f.silk ? ['SILK'] : []);
  return { material: f.material, props, brand: f.brand || null, line: f.line || null, colour: f.colourName || null, hex: f.hex,
    detail: [...props, f.colourName].filter(Boolean).join(' · ').toUpperCase(), maker: (f.maker || [f.brand, f.line].filter(Boolean).join(' · ')).toUpperCase() };   // f.maker: a shared spool's makers (done.js spoolMaterials)
};
const markMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
/* THE SHIPPING TAG (Joey 2026-10-28, two photos of one: its top corners clipped, a reinforced hole, a string loop). White
   card, 20 x 36 mm, the corners clipped 4 mm, a 1.9 mm hole 5 mm down, its reinforcement ring in the material's colour
   (PLA blue, PETG amber, TPU green: the picker's material tags), then, down it: the material, large; its grade or finish
   and its colour (tagInfo detail) in the material's colour; its maker and line, small; and its foot a strip in the
   filament's own colour. It hangs on a wire from the coil (ON A WIRE FROM THE COIL) */
export const TAG = { w: 20, h: 36, clip: 4, hole: 1.9, holeDown: 5, strip: 7 };
// the words' sizes fitted to a width: largest first, down to 6 px
const fitter = (g) => (text, weight, px, maxW) => { let p = px; do { g.font = `${weight} ${p}px Archivo, "IBM Plex Sans", sans-serif`; p -= 1; } while (g.measureText(text).width > maxW && p > 6); };
function tagTexture(info, accent) {
  const k = 11, W = TAG.w * k, H = TAG.h * k, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#f1efe9'; g.fillRect(0, 0, W, H);
  // the card's faint fibres, seeded by what it says (the same tag every time)
  let s = [...`${info.material}|${info.hex}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 500; i++) { const x = rnd() * W, y = rnd() * H, l = 2 + rnd() * 7, a = rnd() * Math.PI; g.strokeStyle = `rgba(120,110,95,${0.04 + rnd() * 0.05})`; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  g.fillStyle = accent; g.beginPath(); g.arc(W / 2, TAG.holeDown * k, TAG.hole * 2.2 * k, 0, 2 * Math.PI); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const fit = fitter(g);
  g.fillStyle = '#1d1e20'; fit(info.material, 800, Math.round(7 * k), W - 2 * k); g.fillText(info.material, W / 2, 15.5 * k);
  if (info.detail) { g.fillStyle = accent; fit(info.detail, 700, Math.round(2.4 * k), W - 2 * k); g.fillText(info.detail, W / 2, 21.5 * k); }
  if (info.maker) { g.fillStyle = '#6b665d'; fit(info.maker, 600, Math.round(1.9 * k), W - 2 * k); g.fillText(info.maker, W / 2, 25 * k); }
  // the foot: the filament's own colour, a hairline between paper and strip
  const y0 = (TAG.h - TAG.strip) * k;
  g.fillStyle = info.hex; g.fillRect(0, y0, W, H - y0);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y0, W, 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
function tagGeometry() {
  const { w, h, clip, hole, holeDown } = TAG, x = w / 2, y = h / 2;
  const sh = new THREE.Shape([[-x, -y], [x, -y], [x, y - clip], [x - clip, y], [-x + clip, y], [-x, y - clip]].map(([a, b]) => new THREE.Vector2(a, b)));
  const hp = new THREE.Path(); hp.absarc(0, y - holeDown, hole, 0, 2 * Math.PI, true); sh.holes.push(hp);
  const geo = new THREE.ShapeGeometry(sh, 24);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + x) / w, (p.getY(i) + y) / h);   // the texture over the whole tag
  return geo;
}
/* ON A WIRE FROM THE COIL (Joey 2026-10-28: "instead of the string/wire being kind-of mounted to the plastic frame of the
   spool, maybe instead just tuck it in an make it stick out from the top of the filament coil ... and like the string/wire
   arches out slightly away from it ... like how sunlu uses their anti-tangle paper tag piece ... lets keep it simple";
   drawn as a strand of the filament, it "looks like a piece of filament holding them on there now, can we instead do like
   a thin metal wire instead?"). The group's origin is where the wire leaves the coil, tucked under its surface; the wire
   (0.6 mm, bare steel) comes straight out along `out`, arches over and down, and its tip goes through the card's hole. The
   card hangs from that hole on its own pivot ('spool-tag-pivot', userData.pivot), which done.js turns (its twist, its
   swing, its lean), so the wire never turns with it into the coil. `out` and `down` in the group's own frame, which
   done.js leaves unturned (the world's axes) */
export const STRAND = { r: 0.3, out: 10, drop: 12, tip: 2 };
export function makeTag(info, accent, out, down = new THREE.Vector3(0, -1, 0)) {
  const g = new THREE.Group(); g.name = 'spool-tag';
  g.userData.tag = { ...info, accent };   // what it says, for a reader of the scene (the e2e suite)
  const o = out.clone().normalize(), d = down.clone().normalize();
  const hole = o.clone().multiplyScalar(STRAND.out).addScaledVector(d, STRAND.drop);
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), o.clone().multiplyScalar(STRAND.out * 0.6).addScaledVector(d, -1.5), o.clone().multiplyScalar(STRAND.out * 1.05).addScaledVector(d, STRAND.drop * 0.25), hole.clone().addScaledVector(d, STRAND.tip));
  const strand = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, STRAND.r, 8, false), new THREE.MeshStandardMaterial({ color: new THREE.Color('#b9bcc0'), roughness: 0.32, metalness: 1 }));
  strand.name = 'spool-tag-wire';
  const pivot = new THREE.Group(); pivot.name = 'spool-tag-pivot'; pivot.position.copy(hole);
  const card = new THREE.Mesh(tagGeometry(), markMat(tagTexture(info, accent)));
  card.name = 'spool-tag-card';
  card.position.y = -(TAG.h / 2 - TAG.holeDown);   // the hole at the pivot
  pivot.add(card);
  for (const m of [card, strand]) { m.castShadow = true; m.receiveShadow = true; m.userData.doneRoom = true; }
  g.add(strand, pivot);
  g.userData.pivot = pivot;
  return g;
}
/* THE FLANGE STICKER (Astra's review, brought by Joey 2026-10-28: "a compact rounded rectangular sticker between the centre
   hole and outer rim, clear of the slots. Keep it physically attached to the spool - no rotating to follow the camera";
   for the views the hanging tag misses: a spool on its rim, a stack seen from above). 44 x 24 mm, corners 3 mm, white;
   its left edge a 7 mm band in the filament's own colour, then the tag's words in the tag's order. Its face +z, its words'
   up +y; done.js lays it on the flange between two slots (the slots at 90, 210 and 330 deg round the axis, 10 wide, from
   the bore to 90 mm: measured 2026-10-28; the clear sectors centred at 30, 150 and 270), 65 mm out */
export const STICKER = { w: 44, h: 24, corner: 3, band: 7, at: 65, sectors: [30, 150, 270] };
function stickerTexture(info, accent) {
  const k = 10, W = STICKER.w * k, H = STICKER.h * k, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, W, H);
  g.fillStyle = info.hex; g.fillRect(0, 0, STICKER.band * k, H);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(STICKER.band * k, 0, 1, H);
  const fit = fitter(g), x0 = (STICKER.band + 2.5) * k, maxW = W - x0 - 2 * k;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = '#1d1e20'; fit(info.material, 800, Math.round(9 * k), maxW); g.fillText(info.material, x0, 8.5 * k);
  if (info.detail) { g.fillStyle = accent; fit(info.detail, 700, Math.round(2.8 * k), maxW); g.fillText(info.detail, x0, 15.6 * k); }
  if (info.maker) { g.fillStyle = '#6b665d'; fit(info.maker, 600, Math.round(2.2 * k), maxW); g.fillText(info.maker, x0, 19.8 * k); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
export function makeSticker(info, accent) {
  const { w, h, corner: c } = STICKER, x = w / 2, y = h / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-x + c, -y); sh.lineTo(x - c, -y); sh.quadraticCurveTo(x, -y, x, -y + c); sh.lineTo(x, y - c); sh.quadraticCurveTo(x, y, x - c, y);
  sh.lineTo(-x + c, y); sh.quadraticCurveTo(-x, y, -x, y - c); sh.lineTo(-x, -y + c); sh.quadraticCurveTo(-x, -y, -x + c, -y);
  const geo = new THREE.ShapeGeometry(sh, 6), p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + x) / w, (p.getY(i) + y) / h);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: stickerTexture(info, accent), roughness: 0.6, metalness: 0 }));
  m.name = 'spool-sticker'; m.receiveShadow = true; m.userData.doneRoom = true;
  m.userData.sticker = { ...info, accent };   // what it says, for a reader of the scene (the e2e suite)
  return m;
}
export function disposeMark(o) { o.traverse((m) => { if (!m.isMesh) return; m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }); }

/* every material a spool made (the geometry is shared and stays) */
export function disposeSpool(g) {
  for (const m of (g.userData.spool && g.userData.spool.materials) || []) m.dispose();
}
