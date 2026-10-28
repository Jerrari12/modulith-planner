/* =========================================================================
   SKIN MAPS - every part's real printed top layer, baked from its slice (2026-10-25)
   =========================================================================
   Joey 2026-10-25: "could we recreate that top layer appearance in three.js", then, after the slice-based prototype
   (D:\Claude - Output\skin-beads-2026-10-25): "build the baked top-layer pipeline into the planner for every part".

   WHAT IT DRAWS. On every face that looks along a part's build axis - the last layer, and every lower top skin a
   staircase or a ledge leaves - the slicer's own top solid infill lines at the slicer's angle, and the perimeter loops
   around every edge and pocket of that skin: a normal map baked on node0 from the part's G-code (PrusaSlicer 2.9.4, the
   Core One or XL profile the part prints with; D:/MODULITH/ops/slicing/skin_bake.py), carried into the part's own frame
   by tools/skin-map.mjs and shipped beside the part GLBs as parts/skin/<node>.png. Nothing is invented in a shader: the
   ?skinlines=on trial that guessed a bead direction (SKIN_LINES, 2026-09-22) is gone; it ran 90 degrees off the slicer's.

   ⚠ VERY HIGH'S SETTLE SAMPLES ONLY, like the visible layer lines and the powder grain's detail form: the block is gated
   on uLLOn, which only a jittered Very High sample turns on (bed-finish.js setSettleDetail). Fast, Balanced and High
   draw nothing new, and never fetch a map (main.js loads them only while the tier is Very High).

   ⚠ ONE ATLAS, ONE TABLE, ONE ATTRIBUTE. Part materials are shared per TYPE (one material serves every size of a
   faceplate), while a map is per NODE (one size of one family). A per-node material would multiply the registries that
   main.js keeps for highlights, tiles, overrides and looks; so instead the node is a per-vertex attribute (aSkinId, the
   node's slot + 1, 0 for none - a mesh that never got the attribute reads 0, the way a missing aSeam reads a half-width
   of 0), the slot's frame and atlas rectangle sit in a 2 x SLOTS float table texture, and every map that is on screen is
   packed into one RGBA8 atlas. Every clone of a material shares the four uniforms, like the finish's.

   THE FRAME. bed-finish.js gives the fragment its authored position in mm with the bed plane through 0 along the build
   axis (vObjPos) and the two in-plane tangents the grain uses (t1 = axis x Y, or axis x X when the axis is Y; t2 =
   axis x t1). The map is baked in exactly those coordinates: q = (vObjPos . t1, vObjPos . t2), map px = (q - q0) * pxPerMm,
   with q0 and pxPerMm from the table. skinTangents() below is that rule in JS, so the shipping tool and the GLSL agree,
   and test/skin-map.test.mjs pins the two to each other.

   THE Z CHANNEL. Where two top skins stack in XY (a pocket's floor under a bridge, a step under an overhang) the bake
   keeps the higher bead and records its layer in B,A (0.01 mm). A fragment takes the map only where its own height
   along the axis is within a layer of the winning bead's layer (uSMZLo..uSMZHi, mm), so a lower skin seen through an
   opening goes plain rather than wearing the beads of the skin above it.

   THE MAP'S CHANNELS. R,G = the crown relief's normal, (n.xy + 1) / 2; B,A = the bead's layer z in 0.01 mm, high byte
   then low. R,G are filtered and mipmapped (a minified map averages toward flat, so the beads fade before they alias);
   B,A are read with texelFetch, never filtered.

   ⚠ NO THREE IMPORT, like bed-finish.js and cover-seam.js: strings and numbers, so node can test the patch against
   three's real shader sources, the packer and the codec. main.js binds the atlas and the table to three.
   ========================================================================= */

/** The pipeline's numbers. pxPerMm is the shipped maps' resolution (node0 bakes at it); crownMm the bead's visible ridge
    (the prototype's guess, judged by eye); zToleranceMm the Z channel's accept/refuse ramp around a layer; strength 1 is
    the bake as it is; atlasPx the two atlas sizes tried, small first; slots the table's rows (nodes on screen at once). */
export const SKIN_MAP = Object.freeze({
  pxPerMm: 8, crownMm: 0.06, zToleranceMm: Object.freeze([0.25, 0.45]), strength: 1,
  atlasPx: Object.freeze([2048, 4096]), slots: 64, gutterPx: 4, minScale: 0.35,
  /* THE FIRST LAYER AS VECTORS (2026-10-28): the table's columns grow from 2 to 7 (see firstRows); firstCrownMm is the
     squashed first-layer bead's relief, a cosine across one line pitch - judged by eye on the EdgeLabel accent's close-up
     (D:\Claude - Output\vector-skin-2026-10-28), lower than a top skin's 0.06 because the bed flattens it */
  tableCols: 7, firstCrownMm: 0.03,
  /* an island's own line family, per pixel of the first layer's field (D:/MODULITH/ops/slicing/skin_vector.py version 2):
     B = its phase as a fraction of its spacing in 1/256, A = its spacing as islandSpacingLo + A * islandSpacingStep mm,
     A = 0 where no island family was fitted (the table's layer-wide family is drawn there) */
  islandSpacingLo: 0.2, islandSpacingStep: 0.0015,
});

/** The spacing an island's A byte names (0 = none). */
export const islandSpacing = (a) => (a > 0 ? SKIN_MAP.islandSpacingLo + a * SKIN_MAP.islandSpacingStep : 0);
/**
 * An island's phase byte carried from the G-code frame into the part frame: the phase moves by dot(n_g, c) (`shift`, as
 * lineFamilyInPart moves the layer's), taken as a fraction of the island's own spacing.
 */
export function islandPhaseByte(phaseByte, spacingByte, shift) {
  const s = islandSpacing(spacingByte);
  if (!s) return 0;
  const f = (((phaseByte / 256) * s - shift) / s) % 1;
  return Math.round((f < 0 ? f + 1 : f) * 256) % 256;
}

/** The cache-key suffix a patched material adds, exported so a test can read it. */
export const SKIN_MAP_KEY = '|sm1';

/** One set of uniforms for every part material and every clone; `on` is a debug switch (?skinmap=off), not a user setting. */
export function createSkinMapUniforms({ on = true } = {}) {
  return {
    uSMOn: { value: on ? 1 : 0 },
    uSMStrength: { value: SKIN_MAP.strength },
    uSMZLo: { value: SKIN_MAP.zToleranceMm[0] }, uSMZHi: { value: SKIN_MAP.zToleranceMm[1] },
    uSMAtlas: { value: null },      // the RGBA8 atlas, bound by main.js once a map is loaded
    uSMTable: { value: null },      // the 2 x slots RGBA float table
    uSMAtlasPx: { value: SKIN_MAP.atlasPx[0] },
  };
}

/** The in-plane tangents the shader derives from the build axis - bed-finish.js GRAIN_BLOCK's u1 and u2, in JS. */
export function skinTangents(axis) {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  const a = axis.map((v) => v / len);
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); };
  const t1 = nrm(Math.abs(a[1]) < 0.9 ? cross(a, [0, 1, 0]) : cross(a, [1, 0, 0]));
  const t2 = cross(a, t1);
  return [t1, t2];
}

const VERT_COMMON = [
  'attribute float aSkinId;',
  'varying float vSkinId;',
].join('\n');
const VERT_MAIN = 'vSkinId = aSkinId;';
const FRAG_COMMON = [
  'uniform float uSMOn, uSMStrength, uSMZLo, uSMZHi, uSMAtlasPx;',
  'uniform sampler2D uSMAtlas;',
  'uniform sampler2D uSMTable;',
  'varying float vSkinId;',
].join('\n');
/* THE FIRST LAYER, AS VECTORS (2026-10-28; Joey: the face-down accents on the smooth sheet looked "way too perfect", then,
   of the 8 px/mm maps, "is there a way to produce the texture as vectors?"). On a bed-contact face, where the plate is
   smooth (a powder coat's grain prints over the beads), the first layer's beads are DRAWN, not looked up: the infill from
   its one line family (a bead's centre where dot(n, q) - phase is a multiple of the spacing), the perimeter loops from a
   distance field to the layer's outline (bands at the slicer's own distances), each bead a cosine of firstCrownMm across
   its pitch. Exact at any zoom; each fades out before its pitch reaches two screen pixels, so it never aliases. The field
   is read at mip 0 (bilinear: a distance interpolates exactly where a picture would blur) and its direction from two
   half-texel taps, so nothing here needs a derivative inside the per-fragment branch. */
const FIRST_BLOCK = [
  '  if ( vSkinId > 0.5 && gBFContact > 0.0 ) {',
  '    int idF = int( vSkinId + 0.5 ) - 1;',
  '    vec4 rF = texelFetch( uSMTable, ivec2( 2, idF ), 0 );',    // the field's atlas rectangle
  '    vec4 fF = texelFetch( uSMTable, ivec2( 3, idF ), 0 );',    // q0.x, q0.y, atlas px per mm, mm per level
  '    vec2 pxF = ( qSM - fF.xy ) * fF.z;',
  '    float wF = gBFContact * ( 1.0 - clamp( uPC, 0.0, 1.0 ) );',
  '    if ( wF > 0.0 && fF.z > 0.0 && pxF.x >= 0.0 && pxF.y >= 0.0 && pxF.x < rF.z && pxF.y < rF.w ) {',
  '      vec4 gF = texelFetch( uSMTable, ivec2( 4, idF ), 0 );',  // n.x, n.y, spacing, phase
  '      vec4 bF = texelFetch( uSMTable, ivec2( 5, idF ), 0 );',  // perimeter band distances (0 = none)
  '      vec4 eF = texelFetch( uSMTable, ivec2( 6, idF ), 0 );',  // ring width, crown
  /* one texel in from the rectangle's edge, so the central taps below stay inside it (Sol 01a183fd) */
  '      vec2 cF = rF.xy + clamp( pxF, vec2( 1.0 ), rF.zw - 1.0 );',
  '      float sF = 255.0 * fF.w;',
  '      float dF = textureLod( uSMAtlas, cF / uSMAtlasPx, 0.0 ).r * sF - 1.0;',
  /* the outline's direction from CENTRAL differences a texel across (one-sided taps leaned on curves and corners) */
  '      vec2 gF2 = vec2( textureLod( uSMAtlas, ( cF + vec2( 0.5, 0.0 ) ) / uSMAtlasPx, 0.0 ).r - textureLod( uSMAtlas, ( cF - vec2( 0.5, 0.0 ) ) / uSMAtlasPx, 0.0 ).r,',
  '                       textureLod( uSMAtlas, ( cF + vec2( 0.0, 0.5 ) ) / uSMAtlasPx, 0.0 ).r - textureLod( uSMAtlas, ( cF - vec2( 0.0, 0.5 ) ) / uSMAtlasPx, 0.0 ).r );',
  '      float fq = max( length( dqxSM ), length( dqySM ) );',      // mm a screen pixel spans
  '      vec2 slF = vec2( 0.0 );',
  '      if ( dF > 0.0 ) {',
  '        float lastF = max( max( bF.x, bF.y ), max( bF.z, bF.w ) );',
  '        if ( lastF > 0.0 && dF < lastF + 0.5 * eF.x ) {',
  /* a perimeter: the nearest band's bead, across the outline (the field's gradient points inward) */
  '          float bn = bF.x;',
  '          if ( bF.y > 0.0 && abs( dF - bF.y ) < abs( dF - bn ) ) bn = bF.y;',
  '          if ( bF.z > 0.0 && abs( dF - bF.z ) < abs( dF - bn ) ) bn = bF.z;',
  '          if ( bF.w > 0.0 && abs( dF - bF.w ) < abs( dF - bn ) ) bn = bF.w;',
  '          float up = clamp( ( dF - bn ) / eF.x, -0.5, 0.5 );',
  '          float aR = 1.0 - smoothstep( 0.25, 0.5, fq / eF.x );',
  '          float lg = length( gF2 );',
  '          if ( lg > 1e-6 ) slF = ( eF.y * PI * sin( 6.2831853 * up ) / eF.x ) * ( gF2 / lg ) * aR;',
  '        } else if ( gF.z > 0.0 ) {',
  /* the infill: h = crown / 2 cos( 2 pi u ), u = ( n . q - phase ) / spacing; the slope is -grad h. The island's own phase and
     spacing where the field names one (B, A, read unfiltered: a family is never interpolated), else the layer's */
  '          vec4 tIF = texelFetch( uSMAtlas, ivec2( rF.xy + floor( clamp( pxF, vec2( 0.0 ), rF.zw - 1.0 ) ) ), 0 );',
  '          float spF = gF.z, phF = gF.w;',
  `          if ( tIF.a > 0.0 ) { spF = ${SKIN_MAP.islandSpacingLo.toFixed(4)} + tIF.a * 255.0 * ${SKIN_MAP.islandSpacingStep.toFixed(6)}; phF = tIF.b * 255.0 / 256.0 * spF; }`,
  /* a part whose islands carry their own families leaves an island with none plain, rather than lay the layer's lines on
     it out of phase (Sol 01a183fd) */
  '          else if ( eF.z > 0.5 ) spF = 0.0;',
  '          if ( spF > 0.0 ) {',
  '          float u = ( dot( qSM, gF.xy ) - phF ) / spF;',
  '          float aI = 1.0 - smoothstep( 0.25, 0.5, fq / spF );',
  '          slF = ( eF.y * PI * sin( 6.2831853 * u ) / spF ) * gF.xy * aI;',
  '          }',
  '        }',
  '      }',
  '      normal = normalize( normal + ( normalize( vPCT1 ) * slF.x + normalize( vPCT2 ) * slF.y ) * wF );',
  '    }',
  '  }',
].join('\n');

const FRAG_MAIN = [
  'if ( uSMOn > 0.5 && uLLOn > 0.5 ) {',
  /* the frame and its screen-space derivatives in the UNIFORM branch, so textureGrad below is defined on every pixel of
     a quad (an implicit LOD inside the per-fragment branch would not be) */
  '  vec3 axSM = normalize( uAxis );',
  '  vec3 pSM = vObjPos - dot( vObjPos, axSM ) * axSM;',
  '  vec3 t1SM = normalize( abs( axSM.y ) < 0.9 ? cross( axSM, vec3( 0.0, 1.0, 0.0 ) ) : cross( axSM, vec3( 1.0, 0.0, 0.0 ) ) );',
  '  vec3 t2SM = cross( axSM, t1SM );',
  '  vec2 qSM = vec2( dot( pSM, t1SM ), dot( pSM, t2SM ) );',
  '  vec2 dqxSM = dFdx( qSM ), dqySM = dFdy( qSM );',
  '  if ( vSkinId > 0.5 && gBFTop > 0.0 ) {',
  '    int idSM = int( vSkinId + 0.5 ) - 1;',
  '    vec4 rSM = texelFetch( uSMTable, ivec2( 0, idSM ), 0 );',    // the atlas rectangle: x, y, w, h in px
  '    vec4 fSM = texelFetch( uSMTable, ivec2( 1, idSM ), 0 );',    // the frame: q0.x, q0.y, atlas px per mm
  '    vec2 pxSM = ( qSM - fSM.xy ) * fSM.z;',
  '    if ( fSM.z > 0.0 && pxSM.x >= 0.0 && pxSM.y >= 0.0 && pxSM.x < rSM.z && pxSM.y < rSM.w ) {',
  '      vec2 uvSM = ( rSM.xy + clamp( pxSM, vec2( 0.5 ), rSM.zw - 0.5 ) ) / uSMAtlasPx;',
  '      vec4 tSM = textureGrad( uSMAtlas, uvSM, dqxSM * fSM.z / uSMAtlasPx, dqySM * fSM.z / uSMAtlasPx );',
  '      vec4 zSM = texelFetch( uSMAtlas, ivec2( rSM.xy + floor( pxSM ) ), 0 );',
  '      float zmmSM = ( zSM.b * 65280.0 + zSM.a * 255.0 ) * 0.01;',   // hi * 256 + lo, 0.01 mm units; 0 = no bead
  '      float hSM = dot( vObjPos, axSM );',
  '      float wZSM = zmmSM > 0.0 ? 1.0 - smoothstep( uSMZLo, uSMZHi, abs( hSM - zmmSM ) ) : 0.0;',
  '      vec2 nSM = tSM.rg * 2.0 - 1.0;',
  '      float nzSM = sqrt( max( 1.0 - dot( nSM, nSM ), 0.04 ) );',
  '      vec2 slSM = nSM / nzSM * uSMStrength;',
  '      float wSM = gBFTop * wZSM;',
  '      if ( wSM > 0.0 ) normal = normalize( normal + ( normalize( vPCT1 ) * slSM.x + normalize( vPCT2 ) * slSM.y ) * wSM );',
  '    }',
  '  }',
  FIRST_BLOCK,
  '}',
].join('\n');

const anchorRe = (a) => new RegExp('^[ \\t]*' + a.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&') + '[ \\t]*$', 'gm');
function insert(src, directive, text, what, where) {
  const re = anchorRe(directive);
  const n = (src.match(re) || []).length;
  if (n !== 1) throw new Error(`skin map: ${what} anchor ${directive} found on ${n} lines`);
  return src.replace(re, () => (where === 'before' ? text + '\n' + directive : directive + '\n' + text));
}

/**
 * Chain the skin map onto a material that already carries the bed finish (it reads the finish's vObjPos, uAxis, gBFTop,
 * vPCT1/2 and uLLOn; chains, never assigns - bed-finish.js's rule). The block sits just before lights_physical_fragment,
 * after every other patch has written `normal` and before the lights read it, like the cover edge.
 */
export function applySkinMap(material, { uniforms }) {
  if (!material.userData || !material.userData.bedFinish) throw new Error('skin map: the material carries no bed finish to chain onto');
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
    return (priorKey ? priorKey.call(this) : priorKeyText) + SKIN_MAP_KEY;
  };
  material.userData = Object.assign({}, material.userData, { skinMap: true });
  return material;
}

/* ---- the atlas ------------------------------------------------------------------------------ */

/**
 * Shelf-pack maps into a square atlas. items: [{ id, w, h }] in map px. Returns { size, scale, rects: Map(id -> {x, y, w, h}) }:
 * the smallest of SKIN_MAP.atlasPx that holds every map at scale 1, else the largest at the largest scale (down to
 * minScale, in steps of 0.9) that holds them all; null when even that fails. Every rectangle is padded by gutterPx on
 * each side, so mipmaps bleed into padding rather than into a neighbour.
 */
export function packAtlas(items, { sizes = SKIN_MAP.atlasPx, gutter = SKIN_MAP.gutterPx, minScale = SKIN_MAP.minScale } = {}) {
  const tryPack = (size, scale) => {
    const rows = [...items].map((it) => ({ id: it.id, w: Math.max(1, Math.round(it.w * scale)), h: Math.max(1, Math.round(it.h * scale)) }))
      .sort((a, b) => b.h - a.h || b.w - a.w);
    const rects = new Map();
    let x = gutter, y = gutter, shelf = 0;
    for (const it of rows) {
      if (it.w + 2 * gutter > size || it.h + 2 * gutter > size) return null;
      if (x + it.w + gutter > size) { x = gutter; y += shelf + 2 * gutter; shelf = 0; }
      if (y + it.h + gutter > size) return null;
      rects.set(it.id, { x, y, w: it.w, h: it.h });
      x += it.w + 2 * gutter;
      shelf = Math.max(shelf, it.h);
    }
    return rects;
  };
  if (!items.length) return { size: sizes[0], scale: 1, rects: new Map() };
  for (const size of sizes) { const r = tryPack(size, 1); if (r) return { size, scale: 1, rects: r }; }
  const size = sizes[sizes.length - 1];
  for (let scale = 0.9; scale > minScale; scale *= 0.9) { const r = tryPack(size, scale); if (r) return { size, scale, rects: r }; }
  const last = tryPack(size, minScale);   // the floor itself is tried (Sol 01a174ad: the 0.9 steps stopped at 0.387)
  return last ? { size, scale: minScale, rects: last } : null;
}

/**
 * A map resampled to dw x dh: R,G box-averaged (the normal's in-plane components average toward flat, which is the
 * band limit a minified map wants), B,A taken from the nearest source texel (a layer height is never interpolated).
 */
export function resampleMap(src, w, h, dw, dh) {
  if (dw === w && dh === h) return src;
  const out = new Uint8Array(dw * dh * 4);
  for (let j = 0; j < dh; j++) {
    const y0 = Math.floor(j * h / dh), y1 = Math.max(y0 + 1, Math.floor((j + 1) * h / dh));
    for (let i = 0; i < dw; i++) {
      const x0 = Math.floor(i * w / dw), x1 = Math.max(x0 + 1, Math.floor((i + 1) * w / dw));
      let r = 0, g = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const s = (y * w + x) * 4; r += src[s]; g += src[s + 1]; n++; }
      const d = (j * dw + i) * 4;
      const sx = Math.min(w - 1, Math.floor((i + 0.5) * w / dw)), sy = Math.min(h - 1, Math.floor((j + 0.5) * h / dh));
      const s = (sy * w + sx) * 4;
      out[d] = Math.round(r / n); out[d + 1] = Math.round(g / n); out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
    }
  }
  return out;
}

/** The table's two texels for a slot: [rect x, y, w, h] and [q0.x, q0.y, atlas px per part mm, 0]. */
export function tableRows(rect, frame, scale) {
  return [[rect.x, rect.y, rect.w, rect.h], [frame.q0[0], frame.q0[1], frame.pxPerMm * scale, 0]];
}

/**
 * A first layer's line family carried from the G-code's XY frame into the part's bed-plane frame q, where g = A q + c
 * (tools/skin-map.mjs sliceFrame: A's columns are the sliced images of the two tangents). In G-code a bead's centre lies
 * where dot(n_g, g) - phase_g is a multiple of the spacing, n_g = (-sin angle, cos angle); since dot(n_g, g) =
 * dot(A^T n_g, q) + dot(n_g, c), in q the normal is A^T n_g and the phase moves by dot(n_g, c).
 */
export function lineFamilyInPart({ angleDeg, spacingMm, phaseMm }, A, c) {
  const th = angleDeg * Math.PI / 180, ng = [-Math.sin(th), Math.cos(th)];
  const n = [ng[0] * A[0][0] + ng[1] * A[0][1], ng[0] * A[1][0] + ng[1] * A[1][1]];
  const s = spacingMm, phase = (((phaseMm - (ng[0] * c[0] + ng[1] * c[1])) % s) + s) % s;
  return { n, spacing: s, phase };
}

/**
 * The first layer's five texels (columns 2-6) for a slot, from its index entry `first` (tools/skin-map.mjs vector) and
 * its distance field's atlas rectangle: [rect], [q0.x, q0.y, atlas px per mm, mm per level], [n.x, n.y, spacing, phase],
 * [up to four perimeter band distances, 0 = none], [ring width, crown, 1 when the islands carry their own families (an island without one is then left plain), 0]. All zero when the node has no first layer.
 */
export function firstRows(rect, first, scale) {
  if (!rect || !first) return [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const b = [...(first.bands || []), 0, 0, 0, 0].slice(0, 4);
  return [[rect.x, rect.y, rect.w, rect.h], [first.q0[0], first.q0[1], first.pxPerMm * scale, first.sdfStepMm],
    [first.n[0], first.n[1], first.spacing, first.phase], b, [first.ringWidth, SKIN_MAP.firstCrownMm, first.islands > 0 ? 1 : 0, 0]];
}

/* ---- PNG, 8-bit, non-interlaced: the one shape the bake writes ------------------------------
   Decoded here rather than by the browser: an <img> route premultiplies the alpha channel, which carries half of a
   layer height, and a 16-bit PNG would be flattened to 8. `inflate` is the caller's: node's zlib, or DecompressionStream. */

const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

/** @returns {Promise<{ width, height, data: Uint8Array }>} data is always RGBA, 4 bytes a pixel */
export async function decodePng(bytes, inflate) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < 8; i++) if (u8[i] !== PNG_SIG[i]) throw new Error('skin map: not a PNG');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let off = 8, width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (off < u8.length) {
    const len = dv.getUint32(off), type = String.fromCharCode(u8[off + 4], u8[off + 5], u8[off + 6], u8[off + 7]);
    const body = u8.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = dv.getUint32(off + 8); height = dv.getUint32(off + 12); depth = u8[off + 16]; ctype = u8[off + 17]; interlace = u8[off + 20]; }
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`skin map: PNG depth ${depth} interlace ${interlace} is not the bake's 8-bit non-interlaced form`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  if (!channels) throw new Error('skin map: PNG colour type ' + ctype);
  let total = 0; for (const b of idat) total += b.length;
  const comp = new Uint8Array(total); let p = 0; for (const b of idat) { comp.set(b, p); p += b.length; }
  const rawAny = await inflate(comp);
  const raw = rawAny instanceof Uint8Array ? rawAny : new Uint8Array(rawAny);
  const stride = width * channels;
  const img = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride, prev = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? img[dst + x - channels] : 0, b = y > 0 ? img[prev + x] : 0, c = x >= channels && y > 0 ? img[prev + x - channels] : 0;
      const v = raw[src + x];
      img[dst + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : f === 4 ? v + paeth(a, b, c) : v) & 255;
    }
  }
  if (channels === 4) return { width, height, data: img };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    data[4 * i] = img[j]; data[4 * i + 1] = channels >= 3 ? img[j + 1] : img[j]; data[4 * i + 2] = channels >= 3 ? img[j + 2] : img[j];
    data[4 * i + 3] = channels === 2 ? img[j + 1] : 255;
  }
  return { width, height, data };
}

/** An RGBA8 PNG, each row filtered by whichever of None / Sub / Up leaves the smallest residue. `deflate` is the caller's. */
export function encodePng(rgba, width, height, deflate) {
  const stride = width * 4;
  const filtered = new Uint8Array((stride + 1) * height);
  const cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
  for (let y = 0; y < height; y++) {
    const row = y * stride, prev = (y - 1) * stride;
    const sums = [0, 0, 0];
    for (let x = 0; x < stride; x++) {
      const v = rgba[row + x], a = x >= 4 ? rgba[row + x - 4] : 0, b = y > 0 ? rgba[prev + x] : 0;
      cand[0][x] = v; cand[1][x] = (v - a) & 255; cand[2][x] = (v - b) & 255;
      for (let k = 0; k < 3; k++) { const s = cand[k][x]; sums[k] += s < 128 ? s : 256 - s; }
    }
    const best = sums[0] <= sums[1] && sums[0] <= sums[2] ? 0 : sums[1] <= sums[2] ? 1 : 2;
    filtered[y * (stride + 1)] = best;
    filtered.set(cand[best], y * (stride + 1) + 1);
  }
  const chunk = (tag, body) => {
    const out = new Uint8Array(12 + body.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = tag.charCodeAt(i);
    out.set(body, 8);
    dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
    return out;
  };
  const ihdr = new Uint8Array(13); const idv = new DataView(ihdr.buffer);
  idv.setUint32(0, width); idv.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [Uint8Array.from(PNG_SIG), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflate(filtered))), chunk('IEND', new Uint8Array(0))];
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
