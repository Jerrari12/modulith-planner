/* =========================================================================
   GLASS PANE - what makes the bought glass board of a glass top read as glass (2026-11-25)
   =========================================================================
   Joey 2026-11-25, on the glass top in My colors: "the glass just looks like a super transparent thing, i think it's
   not reflecting and maybe from the lack of refraction, just it feels like air". He was right about the reflection.
   The board was an ordinary material at a fixed opacity, and alpha blending multiplies EVERYTHING a material draws by
   that opacity: at 0.26 the room's reflection in the pane reached the screen at a quarter of its strength, and the
   pane's own edge was as see-through as its face. Three cues of a real pane were missing, and this draws them:

   1. THE REFLECTION IS NOT SEEN THROUGH. Light the pane reflects is added at full strength; only its body (the faint
      tint) is blended at the body's opacity.
   2. A PANE IS A MIRROR AT A SHALLOW ANGLE. What is behind it is hidden by the share of light the pane reflects
      (Schlick, glass at 0.04, both faces of the pane), so looking along the top the room shows in it and looking down
      into it the cups show through it.
   3. THE EDGE IS GREEN AND NEARLY SOLID. Looking into the edge of a pane is looking through its whole width, which is
      why a clear board has a green rim. The faces that look sideways are drawn in the edge tint at the edge opacity.

   NOT DRAWN: refraction. A flat 3 mm pane shifts what is under it by about a millimetre and bends nothing, so there is
   nothing to see; and three's transmission pass would be a further scene render on every frame, which no part
   material asks of the stage today (main.js compileForHold: "no part material is transmissive").

   ⚠ THE EDGE IS FOUND BY THE WORLD'S UP. The board always lies flat (a glass top is a tabletop build's, generate.js
   glassTopOk), so a face whose normal is near horizontal is an edge. A pane that stood upright would need its own axis.
   ⚠ WITH NO ENVIRONMENT THERE IS NO MIRROR. Fast has no environment (main.js QUALITY), and a pane that hid the cups
   behind a reflection of nothing would go dark at a shallow angle; there cue 2 is off and the pane is the tinted
   sheet with a solid edge.
   ⚠ THE STEP FADES still drive `opacity` between 0 and its rest (main.js restOf); the pane's own alpha is scaled by
   opacity / rest, so a fading board fades whole, mirror and edge with it.

   ⚠ THE ALGEBRA IS EXACT ONLY WHERE THE TONE MAPPING IS LINEAR. The colour written is ( body x a + reflection ) / A,
   which the blend multiplies by A again; three tone-maps it in between, so a reflection bright enough to reach the
   curve's shoulder arrives a little dimmer than full strength (Terra 01a21544). The look was chosen by eye with that in.

   NO THREE IMPORT, like cover-seam.js: plain strings and numbers, so node can test the patch against three's sources.
   ========================================================================= */

/** The look, chosen by eye in the Done room and on the dark stage at High, 2026-11-25. */
export const GLASS_PANE = Object.freeze({
  rest: 0.2,                       // the body's opacity on the pane's faces: the tint over what is under it
  edge: 0.86,                      // ... and on its edge
  edgeTint: [0.34, 0.78, 0.62],    // the edge's colour, on the pane's own (pale) colour as lit
});

/** One set of uniforms for every glass material; `on` is a debug switch (?glass=flat), not a user setting. */
export function createGlassPaneUniforms({ on = true } = {}) {
  return {
    uGlassOn: { value: on ? 1 : 0 },
    uGlassRest: { value: GLASS_PANE.rest },
    uGlassEdge: { value: GLASS_PANE.edge },
    uGlassEdgeTint: { value: GLASS_PANE.edgeTint.slice() },
  };
}

const FRAG_COMMON = [
  'uniform float uGlassOn, uGlassRest, uGlassEdge;',
  'uniform vec3 uGlassEdgeTint;',
].join('\n');

/* just before opaque_fragment: outgoingLight is final (the clearcoat is in it), totalDiffuse is the body's own light */
const FRAG_MAIN = [
  'if ( uGlassOn > 0.5 ) {',
  '  vec3 gBody = totalDiffuse + totalEmissiveRadiance;',
  '  #ifdef USE_CLEARCOAT',
  '    gBody *= 1.0 - material.clearcoat * Fcc;',                                   // the coat's share is taken from the body, as three takes it (Terra 01a21544)
  '  #endif',
  '  vec3 gSpec = max( outgoingLight - gBody, vec3( 0.0 ) );',                      // everything the pane reflects
  '  float gVis = saturate( diffuseColor.a / max( uGlassRest, 1e-3 ) );',           // a step fade: 0 to 1
  '  vec3 gUp = transformNormalByInverseViewMatrix( normal, viewMatrix );',
  '  float gEdge = 1.0 - smoothstep( 0.35, 0.8, abs( gUp.y ) );',                   // 1 on a face that looks sideways
  '  float gA = mix( uGlassRest, uGlassEdge, gEdge );',
  '  gBody = mix( gBody, gBody * uGlassEdgeTint, gEdge );',
  '  float gF = 0.0;',
  '  #ifdef USE_ENVMAP',
  '    float gNV = saturate( dot( normal, normalize( vViewPosition ) ) );',
  '    gF = 0.04 + 0.96 * pow( 1.0 - gNV, 5.0 );',
  '    gF = 2.0 * gF / ( 1.0 + gF );',                                              // the top face and the bottom one
  '  #endif',
  '  float gOut = 1.0 - ( 1.0 - gA ) * ( 1.0 - gF );',                              // how much of what is behind is hidden
  '  outgoingLight = ( gBody * gA + gSpec ) / max( gOut, 1e-3 );',                  // straight alpha: blended back by gOut
  '  diffuseColor.a = gOut * gVis;',
  '}',
].join('\n');

const anchorRe = (a) => new RegExp('^[ \\t]*' + a.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&') + '[ \\t]*$', 'gm');
function insert(src, directive, text, what, where) {
  const re = anchorRe(directive);
  const n = (src.match(re) || []).length;
  if (n !== 1) throw new Error(`glass pane: ${what} anchor ${directive} found on ${n} lines`);
  return src.replace(re, () => (where === 'before' ? text + '\n' + directive : directive + '\n' + text));
}

/** The cache-key suffix a patched material adds, exported so a test can read it. */
export const GLASS_PANE_KEY = '|gp1';

/** Chain the pane onto a glass material's own patches (chains, never assigns - bed-finish.js's rule). */
export function applyGlassPane(material, { uniforms }) {
  const prior = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile') ? material.onBeforeCompile : null;
  const priorKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey : null;
  const priorKeyText = priorKey ? null : (prior ? String(prior) : '');
  material.onBeforeCompile = function (shader, renderer) {
    if (prior) prior.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = insert(shader.fragmentShader, '#include <common>', FRAG_COMMON, 'fragment common', 'after');
    shader.fragmentShader = insert(shader.fragmentShader, '#include <opaque_fragment>', FRAG_MAIN, 'opaque_fragment', 'before');
  };
  material.customProgramCacheKey = function () {
    return (priorKey ? priorKey.call(this) : priorKeyText) + GLASS_PANE_KEY;
  };
  material.userData = Object.assign({}, material.userData, { glassPane: true });
  return material;
}
