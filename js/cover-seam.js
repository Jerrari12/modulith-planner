/* =========================================================================
   COVER SEAMS - a render-only seam between neighbouring cover tiles (PROTOTYPE, 2026-10-21)
   =========================================================================
   Joey 2026-10-21: in My colors a row of Cover Upper tiles reads as one solid slab, because the tiles
   butt perfectly; on a printed build the seam is just barely visible. The GLBs' seam edges are square
   (measured: vault measurements.md "Covers: the seam edge ..."), and the tiles meet within 0.012 mm,
   so there is nothing in the geometry for the renderer to show. This draws one, three ways, without
   touching a printable model:

     bevel  the normal tilted in a narrow band at each tile's side edge, as if the edge were chamfered
            (or filleted). The band is the physical size or 1 device px, whichever is wider, and its
            edge is anti-aliased over one device px.
     hair   a dark line on the seam that stays about one device px wide at any zoom (or the physical
            width, whichever is wider): the light leaving the band is attenuated, diffuse and specular
            alike, the way a crack occludes.
     gap    the tiles' side edges moved in by half a gap each, in the vertex shader, so a real opening
            shows what is under it. A physical size, optionally floored at N device px.

   ⚠ BEHIND ?seams= ONLY. With no parameter main.js applies nothing and stamps nothing, so the shipped
   viewer is unchanged. All three modes are ONE program switched by uniforms: changing the mode or a
   size costs no shader compile.

   ⚠ NO THREE IMPORT, like bed-finish.js: plain strings and numbers, so node can test the patch.

   WHERE THE SEAM IS. Every cover GLB is centred on its own x = 0 and its seam edges are at x = +-W x 44
   (the half-width), so the per-vertex attribute aSeam = ( x in mm, half-width in mm ) gives the
   distance to the nearer side edge, halfW - |x|, exactly: x is linear across a triangle, |x| is taken
   per fragment. Seen from above the seam is a line of constant x, so the distance in device px is
   that distance over the screen-space gradient of x.
   ========================================================================= */

export const SEAM_MODES = Object.freeze(['off', 'bevel', 'hair', 'gap', 'bevelhair']);
const MODE_CODE = { off: 0, bevel: 1, hair: 2, gap: 3, bevelhair: 4 };
/** The part types whose tiles get a seam: the two cover layers. */
export const SEAM_TYPES = Object.freeze(new Set(['CoverL', 'CoverU']));

/** Prototype defaults. Every value is a uniform; the debug hook and the URL can change them. */
export const SEAM_DEFAULTS = Object.freeze({
  mode: 'off',
  bevelMm: 0.2,     // the chamfer's (fillet's) physical width, Joey's suggestion
  bevelMinPx: 1.0,  // ... drawn at least this many device px wide
  bevelDeg: 45,     // chamfer angle; a fillet sweeps 0 to 90 across the band
  fillet: 0,        // 0 chamfer, 1 fillet
  hairMm: 0.15,     // the line's physical width (both tiles' halves together)
  hairPx: 1.0,      // ... at least this many device px wide
  hairDark: 0.55,   // the share of light the line takes away at its centre
  gapMm: 0.2,       // the opening between two tiles
  gapMinPx: 0,      // ... floored at this many device px (0: physical only)
});

export function createCoverSeamUniforms(opts = {}) {
  const o = { ...SEAM_DEFAULTS, ...opts };
  return {
    uSeamMode: { value: MODE_CODE[o.mode] ?? 0 },
    uSeamBevelMm: { value: o.bevelMm }, uSeamBevelPx: { value: o.bevelMinPx },
    uSeamBevelTan: { value: Math.tan((o.bevelDeg * Math.PI) / 180) }, uSeamFillet: { value: o.fillet },
    uSeamHairMm: { value: o.hairMm }, uSeamHairPx: { value: o.hairPx }, uSeamHairDark: { value: o.hairDark },
    uSeamGapMm: { value: o.gapMm }, uSeamGapPx: { value: o.gapMinPx },
    uSeamViewH: { value: 1000 },   // the drawing buffer's height in device px, for the gap's px floor
  };
}

/** Point the shared uniforms at a mode and sizes (any subset of SEAM_DEFAULTS' keys). */
export function setCoverSeam(u, opts = {}) {
  if (opts.mode != null) u.uSeamMode.value = MODE_CODE[opts.mode] ?? 0;
  if (opts.bevelMm != null) u.uSeamBevelMm.value = +opts.bevelMm;
  if (opts.bevelMinPx != null) u.uSeamBevelPx.value = +opts.bevelMinPx;
  if (opts.bevelDeg != null) u.uSeamBevelTan.value = Math.tan((+opts.bevelDeg * Math.PI) / 180);
  if (opts.fillet != null) u.uSeamFillet.value = +opts.fillet;
  if (opts.hairMm != null) u.uSeamHairMm.value = +opts.hairMm;
  if (opts.hairPx != null) u.uSeamHairPx.value = +opts.hairPx;
  if (opts.hairDark != null) u.uSeamHairDark.value = +opts.hairDark;
  if (opts.gapMm != null) u.uSeamGapMm.value = +opts.gapMm;
  if (opts.gapMinPx != null) u.uSeamGapPx.value = +opts.gapMinPx;
  return u;
}
export const coverSeamMode = (u) => Object.keys(MODE_CODE).find((k) => MODE_CODE[k] === u.uSeamMode.value) || 'off';

const VERT_COMMON = [
  'attribute vec2 aSeam;',
  'uniform float uSeamMode, uSeamGapMm, uSeamGapPx, uSeamViewH;',
  'varying vec2 vSeam;',
  'varying vec3 vSeamAx;',
].join('\n');

/* after begin_vertex: `transformed` is the mesh's local (quantised) position; the node's scale is in
   modelMatrix, so a shift in mm is divided by its x column's length */
const VERT_MAIN = [
  'vSeam = aSeam;',
  /* the part's +x in view space, the same at every vertex: the outward sign is taken per fragment (Sol 01a15ee1 - a
     per-vertex outward vector interpolates toward zero across a triangle that spans both side edges) */
  'vSeamAx = normalize( normalMatrix * vec3( 1.0, 0.0, 0.0 ) );',
  'if ( uSeamMode > 2.5 && uSeamMode < 3.5 && aSeam.y - abs( aSeam.x ) < 0.5 ) {',
  '  float sxS = max( length( modelMatrix[ 0 ].xyz ), 1e-6 );',
  '  float gS = uSeamGapMm;',
  '  if ( uSeamGapPx > 0.0 ) {',
  '    vec4 mvS = modelViewMatrix * vec4( transformed, 1.0 );',
  /* mm per device px at this vertex: perspective from -z, orthographic from the frustum alone */
  '    float perPx = projectionMatrix[ 3 ][ 3 ] > 0.5 ? 2.0 / ( projectionMatrix[ 1 ][ 1 ] * uSeamViewH ) : 2.0 * max( -mvS.z, 1e-3 ) / ( projectionMatrix[ 1 ][ 1 ] * uSeamViewH );',
  /* ⚠ APPROXIMATE: isotropic, from depth alone, so a tile edge seen obliquely gets an opening narrower than N px
     on screen (Sol 01a15ee1). Good enough to compare; not a floor to ship as-is. */
  '    gS = max( gS, uSeamGapPx * perPx );',
  '  }',
  '  transformed.x -= sign( aSeam.x ) * 0.5 * gS / sxS;',
  '}',
].join('\n');

const FRAG_COMMON = [
  'uniform float uSeamMode, uSeamBevelMm, uSeamBevelPx, uSeamBevelTan, uSeamFillet, uSeamHairMm, uSeamHairPx, uSeamHairDark;',
  'varying vec2 vSeam;',
  'varying vec3 vSeamAx;',
  'float gSeamOcc = 1.0;',
].join('\n');

/* just before lights_physical_fragment: after every other patch has written `normal` (the bed finish's contact block
   puts the PLAIN normal back on a bed face, and the Cover Upper prints top-face down, so its visible top IS a bed face:
   a tilt written before that block is wiped), and before the lights read it */
const FRAG_MAIN = [
  'if ( uSeamMode > 0.5 && uSeamMode < 2.5 || uSeamMode > 3.5 ) {',
  /* derivatives before any per-fragment branch - uSeamMode is a uniform, so this outer one is safe */
  '  float dS = max( vSeam.y - abs( vSeam.x ), 0.0 );',                                  // mm to the nearer side edge
  '  float perPxS = max( length( vec2( dFdx( vSeam.x ), dFdy( vSeam.x ) ) ), 1e-6 );',   // mm of x per device px
  '  float pS = dS / perPxS;',                                                            // device px to the edge
  '  vec3 outS = normalize( vSeamAx ) * ( vSeam.x >= 0.0 ? 1.0 : -1.0 );',               // toward the nearer side edge
  /* faces that look along x (the side faces themselves) take none of it */
  '  float faceS = 1.0 - abs( dot( normal, outS ) );',
  '  if ( uSeamMode < 1.5 || uSeamMode > 3.5 ) {',
  /* floored above zero: a zero-width band would divide by zero below (Sol 01a15ee1) */
  '    float bandPx = max( max( uSeamBevelMm / perPxS, uSeamBevelPx ), 1e-3 );',
  '    float wB = ( 1.0 - smoothstep( bandPx - 0.5, bandPx + 0.5, pS ) ) * faceS;',
  /* chamfer: one tilt across the band; fillet: 0 at the band's inner edge to 90 degrees at the seam */
  '    float sB = clamp( pS / bandPx, 0.0, 1.0 );',
  '    float tB = mix( uSeamBevelTan, tan( asin( clamp( 1.0 - sB, 0.0, 0.999 ) ) ), uSeamFillet );',
  '    if ( wB > 0.0 ) normal = normalize( normal + outS * tB * wB );',
  '  }',
  '  if ( uSeamMode > 1.5 ) {',
  /* the line is centred on the seam: each tile draws its half */
  '    float halfPx = 0.5 * max( uSeamHairMm / perPxS, uSeamHairPx );',
  '    float wH = ( 1.0 - smoothstep( halfPx - 0.5, halfPx + 0.5, pS ) ) * faceS;',
  '    gSeamOcc = 1.0 - uSeamHairDark * wH;',
  '  }',
  '}',
].join('\n');

/* after aomap_fragment: the line takes light away the way a crack occludes - all four lobes */
const FRAG_OCC = [
  'if ( gSeamOcc < 1.0 ) {',
  '  reflectedLight.directDiffuse *= gSeamOcc; reflectedLight.indirectDiffuse *= gSeamOcc;',
  '  reflectedLight.directSpecular *= gSeamOcc; reflectedLight.indirectSpecular *= gSeamOcc;',
  '}',
].join('\n');

const anchorRe = (a) => new RegExp('^[ \\t]*' + a.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&') + '[ \\t]*$', 'gm');
function after(src, directive, text, what) {
  const re = anchorRe(directive);
  const n = (src.match(re) || []).length;
  if (n !== 1) throw new Error(`cover seam: ${what} anchor ${directive} found on ${n} lines`);
  return src.replace(re, () => directive + '\n' + text);
}
function before(src, directive, text, what) {
  const re = anchorRe(directive);
  const n = (src.match(re) || []).length;
  if (n !== 1) throw new Error(`cover seam: ${what} anchor ${directive} found on ${n} lines`);
  return src.replace(re, () => text + '\n' + directive);
}

export const COVER_SEAM_KEY = '|cs1';

/** Chain the seam onto a cover material's own patches (chains, never assigns - bed-finish.js's rule). */
export function applyCoverSeam(material, { uniforms }) {
  const prior = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile') ? material.onBeforeCompile : null;
  const priorKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey : null;
  const priorKeyText = priorKey ? null : (prior ? String(prior) : '');
  material.onBeforeCompile = function (shader, renderer) {
    if (prior) prior.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = after(shader.vertexShader, '#include <common>', VERT_COMMON, 'vertex common');
    shader.vertexShader = after(shader.vertexShader, '#include <begin_vertex>', VERT_MAIN, 'begin_vertex');
    shader.fragmentShader = after(shader.fragmentShader, '#include <common>', FRAG_COMMON, 'fragment common');
    shader.fragmentShader = before(shader.fragmentShader, '#include <lights_physical_fragment>', FRAG_MAIN, 'lights_physical_fragment');
    shader.fragmentShader = after(shader.fragmentShader, '#include <aomap_fragment>', FRAG_OCC, 'aomap_fragment');
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
