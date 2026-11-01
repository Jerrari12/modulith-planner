/* =========================================================================
   GLITTER - specks in the surface that catch the light as the view moves (PROTOTYPE, 2026-10-31)
   =========================================================================
   Joey 2026-10-31: "a low performance taxing way to represent glitter filament from a distance ... if you move the camera
   specks in the surface seem to glisten a little ... pretend this is prusament galaxy black grips." Behind ?glitter= only:
   with no flag no material is patched, so every program stays what it is on main.

   THE REFERENCE, MEASURED FROM JOEY'S CLIP OF THE REAL PRINT (20261031_202801.mp4, 720p, about 9 px/mm, video_specks.py):
   1 to 2 lit specks per mm2 on a face turned to the light, far fewer on one turned away; a speck's peak about 37 sRGB codes
   over the plastic around it at the median and 62 at p90, 122 at most, near white; about 3 px across after the camera's blur
   (0.3 mm or less); a lit speck stays lit about 0.14 s while the hand turns the part. A phone clip, so a guide, not a profile.
   His close-up photo of the EdgeLabel grip the same night: on the face near the mirror angle a dense field of many sizes, flakes
   of 0.2-0.3 mm among a great many finer ones, and "as you keep zooming in there appears to be more tiny glitters"; the face
   turned away sparse and dim. And the body is "more of a dark charcoal vs a pure black, more of a carbon look": that is the hex.

   WHAT IT DRAWS. Flakes are inclusions in the plastic and the print's surface cuts through them, so the pattern lives in a 3D
   grid in the part's own frame, and a face of any slope gets specks with no UVs and no seams at a crease:
   - one soft blob per cell, a random point in it, fixed for good. A blob stays inside its own cell, so one hash per fragment
     per octave finds it: no neighbour search, no texture.
   - each flake has a random fixed facet in the part's frame, and it lights when the half vector's slope comes within a narrow
     lobe of that facet. The half vector moves only with the view, so a flake flashes as the camera turns and a still camera
     gives a still picture: nothing here reads the time, so the idle gate rests.
   - ⚠ THE LOBE REPEATS, ON A LATTICE IN SLOPE SPACE (uGlitPeriod), AND THAT IS WHAT MAKES IT WORK. The first version tested
     each facet against two real lights' half vectors, the textbook way, and the grips came out nearly bare (2026-10-31, shots
     t1 and t2): EdgeLabel's grip faces look forward and down, no facet reached either half vector from most views, and only
     the rare face near a mirror angle sparkled. A real room has light in every direction, which is why the print in the clip
     still shows specks on a face turned away. The lattice is that room for the price of one lobe test: a facet meets a lobe
     every uGlitPeriod of slope wherever the face points, so the share lit at any moment is steady, set by lobe / period.
   - which faces sparkle MORE is a broad envelope (uGlitReach, uGlitFloor) from two real half vectors, one by the lens and one
     world-fixed from above: a face near a mirror angle fills up, one turned away keeps a few dim specks, as the clip's do. It
     scales both the brightness and the lobe, so a face turned away has fewer specks lit as well as dimmer ones.
   The sum goes into the direct specular, so tone mapping, AO and the floor's reflection treat it like any highlight.

   TWO KINDS OF SPECK, FOR THE TWO THINGS A ZOOM DOES TO A REAL PRINT. Two octaves follow the pixel down, nearly to nothing: a closer
   view finds finer specks in the same place, so there are always more tiny ones to find. And one layer has a real size (bigMm): a
   flake that stays put and grows as you come closer, among them. From a distance that layer cannot be sampled and it fades out,
   so a normal view pays for two hashes a fragment, a close one for three. A bright flake is drawn larger than a dim one.

   WHY IT DOES NOT ALIAS. A speck never gets smaller on screen than the screen can sample (minDevPx, minCssPx): past that its
   radius in mm grows with the pixel footprint. The cell grows with it in octaves, cross-faded, so far away there are fewer
   specks of the same size on screen rather than more, thinner ones: they merge by thinning instead of boiling. Every value that
   picks a cell is a function of the surface position alone, so a speck cannot swim; zooming fades a speck, it never moves one.

   ⚠ THE GRID IS TURNED AGAINST THE PART (GRID_TURN). In an axis-aligned grid a flat face sits at one height in every cell of a
   layer, so a face lying on a cell boundary would cut no blobs and one mid-cell would cut them all: some faces bare, some full,
   flipping with the octave. Turned off-axis, one flat face cuts its cells at every height.
   ⚠ THE PATTERN IS THE PART'S, so two instances of a part share it. What lights differs because their half vectors differ by
   the lobe's width over a few parts (100 mm apart at a 600 mm view is about 5 degrees of half vector, the lobe about 8 each way).
   ⚠ NOT A PROFILE. Authored, like SILK_APPROX: no filament has a measured appearance profile (filament-profiles.md).
   ⚠ NO THREE IMPORT, like silk-axis.js: plain strings and numbers, so node can test the patch against three's real sources.
   ========================================================================= */

/** The look. `amount` is the one to reach for: a speck's brightness at full alignment. All are live uniforms, nothing recompiles. */
export const GLITTER = Object.freeze({
  amount: 0.9,        // linear radiance at the peak of the brightest speck, before tone mapping
  cellMm: 0.06,       // the finest grid: a closer view keeps finding finer specks down to here
  rMm: 0.03,          // the finest flake's radius
  bigCellMm: 0.4,     // the real-sized flakes' grid: lit, about 1 a mm2 near the mirror angle, the clip's density
  bigMm: 0.1,         // ... and their radius: the close-up's 0.2-0.3 mm flakes, which stay put and grow as you come closer
  minDevPx: 1.4,      // a speck's radius never below this many device px: below it, a speck between pixel centres vanishes
  minCssPx: 0.7,      // ... nor this many CSS px, so a dpr-2 screen shows the same size of speck, not a finer one
  period: 0.3,        // the lattice of half vectors, in slope (0.3 is about 17 degrees): smaller flashes more often
  vary: 0.6,          // how much one flake's period differs from another's, so a flat face does not relight in step
  lobe: 0.14,         // how exactly a facet must line up, in slope (about 8 degrees): narrower flashes shorter; the share lit goes as (lobe / period) cubed; under period / 2
  reach: 0.75,        // the envelope's radius in slope: within it of a real half vector a face sparkles more
  floor: 0.22,        // how much of the brightness a face far from both real half vectors keeps
  flat: 0.6,          // the strength on a tier with no tone mapping (Fast), where a speck clips sooner
  tint: [1, 0.98, 0.95],
  lightPos: [-160, 160, 0],             // the envelope's lens half vector, view space: silk-axis.js SILK_LIGHT's place
  keyDir: [-0.5, 0.75, 0.45],           // the envelope's world-fixed half vector, from above and to the left, the room's window side
});

/** A flag value, or null. `on`: the labels below. `grips`: the grip zone whatever it wears. `all`: every part (the cost bench). */
export const glitterArm = (v) => (['on', 'grips', 'all'].includes(v) ? v : null);

/* the catalog's own galaxy rows and the one Joey asked to pretend with; a real line would carry `finish: 'glitter'` in the
   catalog, the way silk does (a filament's name never decides a finish). Not needed until there is a go. */
export const GLITTER_LABELS = Object.freeze(['Prusament Galaxy Black', 'Prusament Galaxy Purple', 'Prusament Galaxy Green', 'Prusament Galaxy Silver', 'Prusament Galaxy Red', 'Polymaker Hedgehog Makes Galaxy Red', 'Polymaker PETG Galaxy Black', 'Polymaker PETG Galaxy Dark Grey', 'Polymaker PETG Galaxy Blue', 'Polymaker PETG Galaxy Red']);

/* A filament's flakes can be another colour than the near-white of the rest: a retailer describes Galaxy Green's as "fine gold glitters"
   (3dstisk.com; Prusa's own pages tag glitter and do not describe its colour). Compiled in as a define, so it costs nothing a frame and one
   program per flake colour. Words turned into a number by eye, like the rest of this file. */
export const GLITTER_TINTS = Object.freeze({ 'Prusament Galaxy Green': [1, 0.78, 0.38] });

/** What a label's flakes are tinted, as GLSL, or null for the common near-white. */
export function glitterTintOf(label) {
  const t = label && GLITTER_TINTS[label];
  return t ? `vec3( ${t.map((n) => n.toFixed(3)).join(', ')} )` : null;
}

/** Does this key wear glitter under this arm? */
export function glitterWanted(arm, key, label) {
  if (!arm) return false;
  if (arm === 'all') return true;
  if (arm === 'grips' && String(key) === 'Faceplate:GRIP') return true;
  return !!label && GLITTER_LABELS.includes(label);
}

export const glitterTier = (tone) => (tone ? 1 : GLITTER.flat);

const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };

/** `amount` scales the look's own (?glitterAmount=); `dpr` is the renderer's, and main.js keeps it current. */
export function createGlitterUniforms({ amount = 1, tone = true, dpr = 1 } = {}) {
  const G = GLITTER;
  return {
    uGlitAmount: { value: G.amount * amount },
    uGlitTier: { value: glitterTier(tone) },
    uGlitCell: { value: G.cellMm },
    uGlitR: { value: G.rMm },
    uGlitBigCell: { value: G.bigCellMm },
    uGlitBigR: { value: G.bigMm },
    uGlitMinDev: { value: G.minDevPx },
    uGlitMinCss: { value: G.minCssPx },
    uGlitPx: { value: dpr },
    uGlitPeriod: { value: G.period },
    uGlitVary: { value: G.vary },
    uGlitLobe: { value: G.lobe },
    uGlitReach: { value: G.reach },
    uGlitFloor: { value: G.floor },
    uGlitTint: { value: [...G.tint] },
    uGlitLightPos: { value: [...G.lightPos] },
    uGlitKeyDir: { value: unit(G.keyDir) },
  };
}

/** A fixed rotation with no axis or 45-degree alignment to the part's faces, from a quaternion; rows, orthonormal. */
export const GRID_TURN = (() => {
  const [x, y, z, w] = unit([0.31, 0.47, 0.19, 0.81]);
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
})();
const glslVec = (v) => `vec3( ${v.map((n) => n.toFixed(7)).join(', ')} )`;

/** A cell's blob reaches at most this far from its centre, in cells; the rest of the half cell is its room to wander. */
export const CELL_REACH = 0.42;

const VERT_COMMON = ['#ifdef GLITTER', 'varying vec3 vGlitMm;', '#endif'].join('\n');
/* mm in the part's frame at the object's own scale (the parts carry a de-quantising node scale, no rotation), turned off the
   part's axes here so the fragment does not pay for it. A rotation keeps lengths, so the footprint below is still in mm. */
const VERT_MAIN = [
  '#ifdef GLITTER',
  `vGlitMm = vec3( dot( position, ${glslVec(GRID_TURN[0])} ), dot( position, ${glslVec(GRID_TURN[1])} ), dot( position, ${glslVec(GRID_TURN[2])} ) ) * length( modelMatrix[ 0 ].xyz );`,
  '#endif',
].join('\n');
const FRAG_COMMON = [
  '#ifdef GLITTER',
  'varying vec3 vGlitMm;',
  'uniform float uGlitAmount, uGlitTier, uGlitCell, uGlitR, uGlitBigCell, uGlitBigR, uGlitMinDev, uGlitMinCss, uGlitPx, uGlitPeriod, uGlitVary, uGlitLobe, uGlitReach, uGlitFloor;',
  'uniform vec3 uGlitTint, uGlitLightPos, uGlitKeyDir;',
  /* the slope is tested in the part's frame, and three declares normalMatrix for the vertex stage only */
  'uniform mat3 normalMatrix;',
  /* four numbers from a cell: "Hash without Sine", Dave Hoskins (MIT) */
  'vec4 glitHash( vec3 p ) { vec4 q = fract( p.xyzx * vec4( 0.1031, 0.1030, 0.0973, 0.1099 ) ); q += dot( q, q.wzxy + 33.33 ); return fract( ( q.xxyz + q.yzzw ) * q.zywx ); }',
  '#endif',
  '#ifndef GLITTER_TINT',
  '#define GLITTER_TINT vec3( 1.0 )',
  '#endif',
].join('\n');
/* after every light three adds itself; geometryPosition and geometryViewDir are lights_fragment_begin's */
const FRAG_END = [
  '#ifdef GLITTER',
  '{',
  /* derivatives first, before any branch: mm per device px, the longer way, so a face seen edge-on takes the coarser cell */
  '  vec3 gDx = dFdx( vGlitMm ), gDy = dFdy( vGlitMm );',
  '  float gFp = sqrt( max( dot( gDx, gDx ), dot( gDy, gDy ) ) );',
  /* the plain interpolated normal, not the relief's: a slope off a corrugation would flash in stripes along the layers */
  '  vec3 gN = normalize( nonPerturbedNormal );',
  '  vec3 gH1 = normalize( normalize( uGlitLightPos - geometryPosition ) + geometryViewDir );',
  '  vec3 gH2 = normalize( ( viewMatrix * vec4( uGlitKeyDir, 0.0 ) ).xyz + geometryViewDir );',
  '  float gD1 = dot( gN, gH1 ), gD2 = dot( gN, gH2 );',
  /* the half vectors as slopes on this face. Edge-on a slope runs away and a face would flicker: it fades out instead */
  '  vec3 gS1 = gH1 / max( gD1, 0.1 ) - gN, gS2 = gH2 / max( gD2, 0.1 ) - gN;',
  '  float gEdge = smoothstep( 0.1, 0.35, gD1 );',
  '  if ( gEdge > 0.0 && uGlitAmount > 0.0 ) {',
  /* the envelope: more on a face near a real half vector, a floor elsewhere */
  '    float gRe = 1.0 / ( uGlitReach * uGlitReach );',
  '    float gNear = clamp( max( 1.0 - dot( gS1, gS1 ) * gRe, 1.0 - dot( gS2, gS2 ) * gRe ), 0.0, 1.0 );',
  '    float gEnv = mix( uGlitFloor, 1.0, gNear ) * gEdge;',
  /* a speck's radius in mm: its real size, or what the screen can sample. kf picks the cell that holds it, cross-fading two
     octaves; the blob fills reach / 2 of its cell at full weight and reach as it fades out to the coarser one */
  '    float gR = max( uGlitR, gFp * max( uGlitMinDev, uGlitMinCss * uGlitPx ) );',
  `    float gKf = max( log2( gR / ( ${CELL_REACH.toFixed(3)} * uGlitCell ) ), -1.0 );`,
  '    float gK0 = floor( gKf ), gT = gKf - gK0, gSum = 0.0;',
  /* the slope in the part's frame, once: normalMatrix transposed is view to object, less the node's de-quantising scale */
  '    vec3 gSo = ( gS1 * normalMatrix ) / length( normalMatrix[ 0 ] ) / uGlitPeriod;',
  /* a lobe tightens as well as dims on a face turned away: fewer specks lit, as the close-up's upper face shows */
  '    float gL = uGlitLobe / uGlitPeriod; gL = mix( 2.2, 1.0, gNear ) / ( gL * gL );',
  /* layers 0 and 1, the octaves that follow the pixel; layer 2, the flakes of real size, gone before they cannot be sampled */
  '    for ( int o = 0; o < 3; o++ ) {',
  '      float gW, gS, gRo, gSeed;',
  '      if ( o < 2 ) { gW = o == 0 ? 1.0 - gT : gT; float gK = gK0 + 1.0 + float( o ); gS = uGlitCell * pow( 2.0, gK ); gRo = gR; gSeed = gK * 57.0; }',
  `      else { gS = uGlitBigCell; gRo = max( uGlitBigR, gR ); gW = 1.0 - smoothstep( ${(CELL_REACH * 0.7).toFixed(3)}, ${CELL_REACH.toFixed(3)}, gRo / gS ); gSeed = 311.0; }`,
  '      if ( gW <= 0.0 ) continue;',
  '      vec3 gQ = vGlitMm / gS, gC = floor( gQ );',
  '      vec4 gHash = glitHash( gC + gSeed );',
  /* the centre wanders only as far as keeps the blob in this cell, and never with the view or the zoom */
  `      vec3 gD = gQ - gC - 0.5 - ( gHash.xyz - 0.5 ) * ${(1 - 2 * CELL_REACH).toFixed(3)};`,
  /* a bright flake is a bigger one, never past the cell's room */
  '      float gV = fract( gHash.z * 17.3 );',
  `      float gRc = min( gRo / gS * ( 0.75 + 0.5 * gV ), ${CELL_REACH.toFixed(3)} );`,
  '      float gB = 1.0 - dot( gD, gD ) / ( gRc * gRc );',
  '      if ( gB <= 0.0 ) continue;',
  /* a flake many pixels across has a crisp edge, about a pixel wide, not a soft blur; one near the sampling limit stays soft */
  '      gB = min( gB * max( 1.0, 0.5 * gRc * gS / max( gFp, 1e-5 ) ), 1.0 );',
  /* ⚠ THINNING, BY EACH FLAKE'S OWN FIXED RANK. Within an octave a same-size speck in a shrinking cell means more of them on
     screen, as the cube of the blob's share of its cell: measured 2.4 to 1 between the ends of an octave, the build's sparkle
     breathing as you zoom. So keep only the share that holds the on-screen count at the octave's sparsest: the same flakes
     always go first, one at a time, and the count stays level with the zoom. 1 where the blob is at half reach or less. A face
     near the mirror angle keeps more: the close-up's dense field against the sparse face beside it. The real flakes do not thin:
     their cell never changes. */
  '      if ( o < 2 ) {',
  `        float gKeep = mix( ${(CELL_REACH / 2).toFixed(3)}, ${(CELL_REACH * 0.75).toFixed(3)}, gNear ) * gS / gRo; gKeep *= gKeep * gKeep;`,
  '        gB *= smoothstep( 0.0, 0.12, gKeep - fract( gHash.x * 13.7 ) );',
  '        if ( gB <= 0.0 ) continue;',
  '      }',
  /* this flake's facet, a point in one lattice cell; the distance to it wraps, so the lobe repeats. EACH FLAKE ON ITS OWN PERIOD:
     on a flat face all flakes share one slope, so one period relights the same flakes together (Sol 01a194a1). Measured (recur.mjs,
     envelope flat), share of specks re-lit after an orbit: one period 0.354 at 8 degrees, back up to 0.446 at 14 and again to 0.189
     at 30; own periods 0.354, 0.428, and the return at 30 gone. The first return stays because the lobe is nearly half a lattice
     cell: about a third of the flakes are lit at any moment, so 0.43 is not far above what chance gives anyway. */
  '      vec3 gE = gSo * ( 1.0 + uGlitVary * ( fract( gHash.y * 29.3 ) - 0.5 ) ) - fract( gHash.wxy * 41.7 );',
  '      gE -= floor( gE + 0.5 );',
  '      float gA = 1.0 - dot( gE, gE ) * gL;',
  '      if ( gA <= 0.0 ) continue;',
  /* a flash with a flat top and soft shoulders, not a peak: squaring the lobe left most lit flakes too dim to see */
  '      gA = min( gA * 2.5, 1.0 ); gA *= gA * ( 3.0 - 2.0 * gA );',
  /* a few bright, most dim, the way the clip's specks fall (median 37 codes over the plastic, p90 62, most 122) */
  '      gSum += gW * gB * gB * gA * ( 0.12 + 0.88 * gV * gV * gV );',
  '    }',
  '    reflectedLight.directSpecular += gSum * gEnv * uGlitAmount * uGlitTier * uGlitTint * GLITTER_TINT;',
  '  }',
  '}',
  '#endif',
].join('\n');

const anchorRe = (a) => new RegExp('^[ \\t]*' + a.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&') + '[ \\t]*$', 'gm');
function insert(src, directive, text, what) {
  const re = anchorRe(directive);
  const n = (src.match(re) || []).length;
  if (n !== 1) throw new Error(`glitter: ${what} anchor ${directive} found on ${n} lines`);
  return src.replace(re, () => directive + '\n' + text);
}

/** The cache-key suffix a patched material adds, exported so a test can read it. */
export const GLITTER_KEY = '|gl1';

/** Chain onto a physical part material's patches (chains, never assigns - bed-finish.js's rule). Compiles to nothing until
 *  the GLITTER define is set, so a pick needs only setDefine, the way silk's light does. */
export function applyGlitter(material, { uniforms }) {
  const prior = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile') ? material.onBeforeCompile : null;
  const priorKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') ? material.customProgramCacheKey : null;
  const priorKeyText = priorKey ? null : (prior ? String(prior) : '');
  material.onBeforeCompile = function (shader, renderer) {
    if (prior) prior.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = insert(shader.vertexShader, '#include <common>', VERT_COMMON, 'vertex common');
    shader.vertexShader = insert(shader.vertexShader, '#include <begin_vertex>', VERT_MAIN, 'begin_vertex');
    shader.fragmentShader = insert(shader.fragmentShader, '#include <common>', FRAG_COMMON, 'fragment common');
    shader.fragmentShader = insert(shader.fragmentShader, '#include <lights_fragment_end>', FRAG_END, 'lights_fragment_end');
  };
  material.customProgramCacheKey = function () {
    return (priorKey ? priorKey.call(this) : priorKeyText) + GLITTER_KEY;
  };
  material.userData = Object.assign({}, material.userData, { glitter: true });
  return material;
}
