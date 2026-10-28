/* =========================================================================
   SILK AXIS - which way a silk part's sheen runs (2026-10-28)
   =========================================================================
   Joey 2026-10-28, on his yellow build in Panchroma Yellow, then Silk Brass, then Silk Gold: "are we doing anything
   different to represent silk colors? they still feel way too much like regular filaments ... they almost look the
   same". part-material.js now gives a catalog silk filament the AUTHORED silk approximation (SILK_APPROX: glossier,
   part-metallic, and an anisotropy). This file points that anisotropy at the print.

   WHAT IT DRAWS. three's native anisotropy - its anisotropic GGX for the lights AND its bent-normal environment
   lookup, which is what carries the look in this viewer - stretches the highlight along the material's T axis.
   A printed wall is a stack of beads lying along the layers; their slopes spread ACROSS the layers, so the highlight
   streaks across them: along the build axis on an upright wall, the Lab's "one clean vertical highlight" on its
   upright silk vase (Lab src/appearance/silk.ts, whose narrow lobe is narrow along the bead and wide across it).
   So T = the build axis projected onto the surface, and B = the bead direction.

   ⚠ THE AXIS IS A LAYER-PLANE NORMAL, so it goes to view space through normalMatrix, not modelViewMatrix: under a
   non-uniform scale a plane's normal transforms by the inverse transpose (Sol 01a182f6). It is the object-space
   axis the layer relief uses (buildAxisForType); the parts are plain meshes, no instancing.

   ⚠ A TOP OR BOTTOM FACE HAS NO LAYERS TO STRETCH ACROSS, but it has its skin's lines. Where the face normal lies
   within 15 degrees of the build axis the streak runs across those lines instead (skinAcross: an ASSUMED 45 degrees,
   the slicer's usual skin angle), blended into the wall's direction by 30 degrees (|t| 0.26 to 0.5) - a face-down
   face's first layer, or a face-up face's top skin, is where silk's diagonal sheen shows on a flat front (the first
   version faded these faces to isotropic and the fronts did not change at all). Every normalise of a projection is
   guarded: a zero vector falls back to a finite orthonormal pair (Sol 01a182f6).

   ⚠ AFTER lights_physical_fragment, where three has just built material.anisotropyT/B from a UV tangent frame. The
   parts carry no UVs, so that frame is zero; this replaces it. Being after the include also means it reads the FINAL
   shading normal - the layer relief, the cover seam and the bed finish all write `normal` before it. Everything sits
   inside #ifdef USE_ANISOTROPY: a material at anisotropy 0 (every non-silk filament) compiles none of it, and three
   recompiles by itself when a pick crosses 0.

   WHAT ELSE MAKES SILK READ (measured 2026-10-28, D:\Claude - Output\silk-finish-2026-10-28): in the room an upright face
   mirrors the plain desk, so gloss and anisotropy alone changed almost nothing. Two authored devices carry the look:
   the silk light below (SILK_SHEEN), and the silk studio a silk part reflects in place of the room (main.js SILK_STUDIO).

   ⚠ NO THREE IMPORT, like cover-seam.js and bed-finish.js: plain strings and numbers, so node can test the patch
   against three's real shader sources. The axis uniform is the MATERIAL'S: cloneMaterial copies onBeforeCompile,
   whose closure holds it, and every clone of a key's material is that key's, with that key's axis.
   ========================================================================= */

/**
 * THE SILK LIGHT - a specular-only light that rides with the camera and lights silk parts only.
 *
 * ⚠ AN AUTHORED DEVICE, NOT PHYSICS, AND THE REASON IT EXISTS WAS MEASURED (2026-10-28). In the room and the studio a
 * printed part's front faces reflect a featureless part of the environment, so ANY glossy finish renders as flat paint
 * there: a gold at metalness 1, roughness 0.12 - a mirror - was indistinguishable from the matte part on the 185 2W-2H
 * fronts at three orbit angles and on both plates (D:\Claude - Output\silk-finish-2026-10-28). It is the same reason
 * the Lab's silk lobes measured dead under this rig. What makes silk read in life is a highlight that slides across the
 * part as you move round it; a photographer gets it from a softbox by the camera, and so does this: a point in VIEW
 * space, above and to the left of the lens (the side the room's window and sun light from), so its direction changes
 * across a flat face, evaluated with three's own GGX for the material - anisotropic along the print where the frame is
 * set, broad on a powder-coated bed face whose grain has folded into roughness - and added to the direct specular only.
 * A punctual term, so its strength does not swing with the environment the way the Lab's environment lobe did (9.55x
 * between two rooms).
 *
 * ⚠ TWO STRENGTHS, BY TONE MAPPING. Fast draws with none, and at the tone-mapped strengths a Silk Gold front clipped to
 * flat bright yellow and a Silk Silver one to white. So where the tier does not tone-map, the light drops to `flat` and
 * the silk studio's reflection (scaled here too, as `uSilkEnv`, on silk parts only) to `flatEnv` - judged on Fast shots
 * of Silk Gold, Silver and Black. silkTier() gives a tier's pair; main.js sets it in applyQuality.
 */
export const SILK_LIGHT = Object.freeze({ pos: [-160, 160, 0], intensity: 6, flat: 1, flatEnv: 0.3 });

/** The silk light and the silk studio's strength for a tier that does (`tone`) or does not tone-map. */
export const silkTier = (tone) => (tone ? { light: SILK_LIGHT.intensity, env: 1 } : { light: SILK_LIGHT.flat, env: SILK_LIGHT.flatEnv });

/** `rot` is the axis-rotation diagnostic (?silk=rot): the sheen turned 90 degrees, to show it follows the print. */
export function createSilkUniforms({ rot = false, tone = true } = {}) {
  const t = silkTier(tone);
  return {
    uSilkRot: { value: rot ? 1 : 0 },
    uSilkLight: { value: t.light },
    uSilkEnv: { value: t.env },
    uSilkLightPos: { value: [...SILK_LIGHT.pos] },
  };
}

/**
 * The direction ACROSS a top or bottom skin's lines, in the part's own frame: 45 degrees between the two object axes
 * that lie in the layer plane, the slicer's usual skin angle.
 * ⚠ ASSUMED, NOT READ FROM THE PRINT: which way the part sat on the bed, and so where 45 degrees points, is not known
 * here, and the real angle alternates by 90 degrees from layer to layer (the Lab's top-skin model). It is the
 * first-layer look in kind - a diagonal streak across a face-down face - and not in its exact angle.
 */
export function skinAcross(up) {
  const [ux, uy, uz] = up, n = Math.hypot(ux, uy, uz) || 1, u = [ux / n, uy / n, uz / n];
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const e = axes.reduce((a, b) => (Math.abs(b[0] * u[0] + b[1] * u[1] + b[2] * u[2]) < Math.abs(a[0] * u[0] + a[1] * u[1] + a[2] * u[2]) ? b : a));
  const d = e[0] * u[0] + e[1] * u[1] + e[2] * u[2];
  const r = [e[0] - u[0] * d, e[1] - u[1] * d, e[2] - u[2] * d], rn = Math.hypot(...r);
  const p = [r[0] / rn, r[1] / rn, r[2] / rn];
  const q = [u[1] * p[2] - u[2] * p[1], u[2] * p[0] - u[0] * p[2], u[0] * p[1] - u[1] * p[0]];   // up x p, in the plane
  return [(p[0] - q[0]) / Math.SQRT2, (p[1] - q[1]) / Math.SQRT2, (p[2] - q[2]) / Math.SQRT2];
}

const VERT_COMMON = [
  'uniform vec3 uSilkUp, uSilkSkin;',
  'varying vec3 vSilkUp, vSilkSkin;',
].join('\n');
/* the build axis is a layer-plane NORMAL (normalMatrix); the skin direction lies IN that plane, a tangent (modelView) */
const VERT_MAIN = 'vSilkUp = normalMatrix * uSilkUp;\nvSilkSkin = mat3( modelViewMatrix ) * uSilkSkin;';
const FRAG_COMMON = [
  'uniform float uSilkRot, uSilkLight, uSilkEnv;',
  'uniform vec3 uSilkLightPos;',
  'varying vec3 vSilkUp, vSilkSkin;',
].join('\n');
/* the silk light, after every light three adds itself; geometryPosition, geometryViewDir and material are
   lights_fragment_begin's. A POINT in view space with no falloff, so its direction changes across a flat face. */
const FRAG_END = [
  '#ifdef SILK_SHEEN',
  '{',
  '  vec3 sLd = normalize( uSilkLightPos - geometryPosition );',
  '  float sNL = saturate( dot( normal, sLd ) );',
  '  reflectedLight.directSpecular += sNL * uSilkLight * BRDF_GGX( sLd, geometryViewDir, normal, material );',
  '}',
  '#endif',
  /* the studio's strength, on its own define: only a part that reflects the studio is scaled, whether or not the light is
     on (?silk=nolight must not hand Fast the studio at full strength - Sol 01a18343). Silk parts have no clearcoat, so the
     base layer's environment specular is all of it. */
  '#ifdef SILK_ENV',
  '  reflectedLight.indirectSpecular *= uSilkEnv;',
  '#endif',
].join('\n');
const FRAG_MAIN = [
  '#ifdef USE_ANISOTROPY',
  '{',
  '  vec3 sUp = normalize( vSilkUp );',
  '  vec3 sT = sUp - normal * dot( sUp, normal );',
  '  float sL = length( sT );',
  /* a wall: across its layers. A top or bottom skin: across its lines. Blended through 15-30 degrees off the axis */
  '  vec3 sK = vSilkSkin - normal * dot( vSilkSkin, normal );',
  '  float sKL = length( sK );',
  '  vec3 sAny = abs( normal.x ) < 0.9 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );',
  '  vec3 sFall = normalize( cross( sAny, normal ) );',
  '  vec3 sWall = sL > 1e-4 ? sT / sL : sFall;',
  '  vec3 sSkin = sKL > 1e-4 ? sK / sKL : sFall;',
  /* an anisotropy axis has no sign: turn the skin's into the wall's hemisphere first, or on a bevel the two can point
     opposite ways and their blend cancel into a seam (Sol 01a18343) */
  '  if ( dot( sSkin, sWall ) < 0.0 ) sSkin = -sSkin;',
  '  float sW = smoothstep( 0.26, 0.5, sL );',
  /* aligned, the blend of two unit vectors is at least 0.7 long; the fallback stays so it can never be NaN */
  '  vec3 sMix = mix( sSkin, sWall, sW );',
  '  float sML = length( sMix );',
  '  vec3 sDir = sML > 1e-4 ? sMix / sML : sFall;',
  '  if ( uSilkRot > 0.5 ) sDir = cross( normal, sDir );',
  '  material.anisotropyT = sDir;',
  '  material.anisotropyB = cross( normal, sDir );',
  '}',
  '#endif',
].join('\n');

const anchorRe = (a) => new RegExp('^[ \\t]*' + a.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&') + '[ \\t]*$', 'gm');
function insert(src, directive, text, what) {
  const re = anchorRe(directive);
  const n = (src.match(re) || []).length;
  if (n !== 1) throw new Error(`silk axis: ${what} anchor ${directive} found on ${n} lines`);
  return src.replace(re, () => directive + '\n' + text);
}

/** The cache-key suffix a patched material adds, exported so a test can read it. */
export const SILK_AXIS_KEY = '|sa1';

/**
 * Chain the silk frame onto a physical part material's own patches (chains, never assigns - bed-finish.js's rule).
 * `up` is the part's object-space build axis [x, y, z]. A part whose axis is unknown is patched too (main.js passes +Y),
 * for the silk light; its spec's anisotropy is held at 0 there, so the frame block is compiled out and the axis unread.
 */
export function applySilkAxis(material, { up, uniforms }) {
  const prior = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile') ? material.onBeforeCompile : null;
  const priorKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey : null;
  const priorKeyText = priorKey ? null : (prior ? String(prior) : '');
  const own = { uSilkUp: { value: [up[0], up[1], up[2]] }, uSilkSkin: { value: skinAcross(up) } };
  material.onBeforeCompile = function (shader, renderer) {
    if (prior) prior.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms, own);
    shader.vertexShader = insert(shader.vertexShader, '#include <common>', VERT_COMMON, 'vertex common');
    shader.vertexShader = insert(shader.vertexShader, '#include <begin_vertex>', VERT_MAIN, 'begin_vertex');
    shader.fragmentShader = insert(shader.fragmentShader, '#include <common>', FRAG_COMMON, 'fragment common');
    shader.fragmentShader = insert(shader.fragmentShader, '#include <lights_physical_fragment>', FRAG_MAIN, 'lights_physical_fragment');
    shader.fragmentShader = insert(shader.fragmentShader, '#include <lights_fragment_end>', FRAG_END, 'lights_fragment_end');
  };
  material.customProgramCacheKey = function () {
    return (priorKey ? priorKey.call(this) : priorKeyText) + SILK_AXIS_KEY;
  };
  material.userData = Object.assign({}, material.userData, { silkAxis: true });
  return material;
}
