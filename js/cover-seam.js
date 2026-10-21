/* =========================================================================
   COVER SEAMS - a shading-only bevel on every cover tile's side edges (2026-10-21)
   =========================================================================
   Joey 2026-10-21: in My colors a row of cover tiles read as one solid slab, where on a printed build the seam is
   just barely visible. He suggested a 0.2 mm chamfer on the covers' top side edges "so the light hits them
   differently". The printable models stay as they are: their seam edges are square and neighbouring tiles meet
   within 0.012 mm (vault measurements.md, "Covers: the seam edge ..."), so the geometry gives the renderer no seam
   at all. This draws the chamfer in the shader instead - and only in the shader.

   WHAT IT DRAWS. The normal is tilted 45 degrees toward the outside of the tile, in a band at each side edge, so the
   edge catches or loses the light the way a chamfered edge would. Joey picked this over a drawn hairline and a
   render-only gap (the comparison: D:\Claude - Output\cover-seams-2026-10-21\COVER-SEAMS.md).

   ⚠ THE BAND IS NEVER NARROWER THAN ONE DEVICE PIXEL. At the whole-build view a 621 mm build gets about 2.4 device
   px per mm at dpr 2, so a true 0.2 mm chamfer is half a pixel: measured on moving frames it reached a third of the
   floored bevel's contrast and flickered 2.5 to 25 times as much. So the band is max(0.2 mm, 1 device px) wide, its
   inner edge anti-aliased over one pixel; close up it is the true 0.2 mm.

   WHERE THE SEAM IS. Every cover GLB is centred on its own x = 0 with its side edges at x = +-W x 44, so the
   per-vertex attribute aSeam = ( x in mm, the part's half-width in mm ) gives the distance to the nearer side edge,
   halfW - |x|, exactly: x is linear across a triangle and |x| is taken per fragment. Seen on screen the edge is a
   line of constant x, so its distance in device px is that distance over the screen-space gradient of x. The row's
   two outer ends get the same edge as the seams between tiles, as a real cover would.

   ⚠ AFTER THE BED FINISH. The Cover Upper prints top-face down, so its visible top IS its bed face, and the bed
   finish's contact block puts the plain normal back on a bed face (bed-finish.js PLAIN). The tilt therefore goes in
   just before lights_physical_fragment, after every other patch has written `normal` and before the lights read it.
   test/cover-seam.test.mjs pins the order.

   ⚠ NO THREE IMPORT, like bed-finish.js: plain strings and numbers, so node can test the patch against three's real
   shader sources. The uniforms are SHARED by every cover material and every clone of one (alternate tiles, planned
   tiles, fades), so the debug switch reaches them all at once.
   ========================================================================= */

/** The part types whose tiles get the edge: the two cover layers. */
export const SEAM_TYPES = Object.freeze(new Set(['CoverL', 'CoverU']));

/** Joey's chamfer: 0.2 mm at 45 degrees, drawn never narrower than one device pixel (2026-10-21). */
export const COVER_BEVEL = Object.freeze({ mm: 0.2, minPx: 1, deg: 45 });

/** One set of uniforms for every cover material; `on` is a debug switch (?seams=off), not a user setting. */
export function createCoverSeamUniforms({ on = true } = {}) {
  return {
    uSeamOn: { value: on ? 1 : 0 },
    uSeamMm: { value: COVER_BEVEL.mm },
    uSeamMinPx: { value: COVER_BEVEL.minPx },
    uSeamTan: { value: Math.tan((COVER_BEVEL.deg * Math.PI) / 180) },
  };
}

const VERT_COMMON = [
  'attribute vec2 aSeam;',
  'varying vec2 vSeam;',
  'varying vec3 vSeamAx;',
].join('\n');

/* the part's +x in view space, the same at every vertex: the outward sign is taken per fragment (a per-vertex
   outward vector interpolates toward zero across a triangle that spans both side edges - Sol 01a15ee1) */
const VERT_MAIN = [
  'vSeam = aSeam;',
  'vSeamAx = normalize( normalMatrix * vec3( 1.0, 0.0, 0.0 ) );',
].join('\n');

const FRAG_COMMON = [
  'uniform float uSeamOn, uSeamMm, uSeamMinPx, uSeamTan;',
  'varying vec2 vSeam;',
  'varying vec3 vSeamAx;',
].join('\n');

const FRAG_MAIN = [
  'if ( uSeamOn > 0.5 ) {',
  /* derivatives before any per-fragment branch - uSeamOn is a uniform, so this outer one is safe */
  '  float perPxS = max( length( vec2( dFdx( vSeam.x ), dFdy( vSeam.x ) ) ), 1e-6 );',   // mm of x per device px
  '  float pS = max( vSeam.y - abs( vSeam.x ), 0.0 ) / perPxS;',                       // device px to the nearer edge
  '  vec3 outS = normalize( vSeamAx ) * ( vSeam.x >= 0.0 ? 1.0 : -1.0 );',              // toward that edge
  /* floored above zero so a degenerate size can never divide by zero (Sol 01a15ee1) */
  '  float bandPx = max( max( uSeamMm / perPxS, uSeamMinPx ), 1e-3 );',
  /* the faces that look along x (the side faces themselves) take none of it; a mesh that never got aSeam reads a
     half-width of 0 and takes none either, rather than tilting all over */
  '  float wS = ( 1.0 - smoothstep( bandPx - 0.5, bandPx + 0.5, pS ) ) * ( 1.0 - abs( dot( normal, outS ) ) )',
  '    * step( 1e-3, vSeam.y );',
  '  if ( wS > 0.0 ) normal = normalize( normal + outS * uSeamTan * wS );',
  '}',
].join('\n');

const anchorRe = (a) => new RegExp('^[ \\t]*' + a.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&') + '[ \\t]*$', 'gm');
function insert(src, directive, text, what, where) {
  const re = anchorRe(directive);
  const n = (src.match(re) || []).length;
  if (n !== 1) throw new Error(`cover seam: ${what} anchor ${directive} found on ${n} lines`);
  return src.replace(re, () => (where === 'before' ? text + '\n' + directive : directive + '\n' + text));
}

/** The cache-key suffix a patched material adds, exported so a test can read it. */
export const COVER_SEAM_KEY = '|cs1';

/** Chain the edge onto a cover material's own patches (chains, never assigns - bed-finish.js's rule). */
export function applyCoverSeam(material, { uniforms }) {
  const prior = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile') ? material.onBeforeCompile : null;
  const priorKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey : null;
  const priorKeyText = priorKey ? null : (prior ? String(prior) : '');
  material.onBeforeCompile = function (shader, renderer) {
    if (prior) prior.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = insert(shader.vertexShader, '#include <common>', VERT_COMMON, 'vertex common', 'after');
    shader.vertexShader = insert(shader.vertexShader, '#include <begin_vertex>', VERT_MAIN, 'begin_vertex', 'after');
    shader.fragmentShader = insert(shader.fragmentShader, '#include <common>', FRAG_COMMON, 'fragment common', 'after');
    shader.fragmentShader = insert(shader.fragmentShader, '#include <lights_physical_fragment>', FRAG_MAIN, 'lights_physical_fragment', 'before');
  };
  material.customProgramCacheKey = function () {
    return (priorKey ? priorKey.call(this) : priorKeyText) + COVER_SEAM_KEY;
  };
  material.userData = Object.assign({}, material.userData, { coverSeam: true });
  return material;
}

/**
 * aSeam for one cover PART, all of whose meshes are given in the part frame (mm, node transform applied):
 * ( x, half-width ) per vertex, the half-width being the part's largest |x|.
 * @param {Float32Array[]} meshPositions
 * @returns {Float32Array[]}
 */
export function seamAttributes(meshPositions) {
  let hw = 0;
  for (const p of meshPositions) for (let k = 0; k < p.length; k += 3) hw = Math.max(hw, Math.abs(p[k]));
  return meshPositions.map((p) => {
    const a = new Float32Array((p.length / 3) * 2);
    for (let k = 0, j = 0; k < p.length; k += 3, j += 2) { a[j] = p[k]; a[j + 1] = hw; }
    return a;
  });
}
