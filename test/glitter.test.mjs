/* THE GLITTER PROTOTYPE (Joey, 2026-10-31: "specks in the surface seem to glisten a little"). What it LOOKS like, how stable it
 * is and what it costs are measured on the real renderer (D:\Claude - Output\glitter-2026-10-31). What node can prove:
 *   1. the patch composes on three r185's real sources after the relief, the bed finish and the silk frame, once each, behind its
 *      define, so a part that does not wear it compiles none of it; a lost anchor throws
 *   2. nothing in it can move with time: no clock reaches the block, which is what lets the idle gate rest
 *   3. a blob stays inside its own cell at any octave weight, which is why one hash finds it
 *   4. the grid is turned: no row of it runs along a part's axis or a 45-degree face
 *   5. who wears it: nothing without the flag; main.js patches only behind the flag, and the deploy stamps the new import
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (...p) => pathToFileURL(join(root, ...p)).href;
const THREE_URL = url('vendor', 'three', 'three.module.js');
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`));
const THREE = await import(THREE_URL);
const { applyLayerDetail } = await import(url('js', 'vendor', 'layer-detail.js'));
const BF = await import(url('js', 'bed-finish.js'));
const SA = await import(url('js', 'silk-axis.js'));
const G = await import(url('js', 'glitter.js'));

const main = readFileSync(join(root, 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const pages = readFileSync(join(root, '.github', 'workflows', 'pages.yml'), 'utf8').replace(/\r\n/g, '\n');
const count = (s, needle) => s.split(needle).length - 1;
const resolveIncludes = (s) => s.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_, name) => {
  const chunk = THREE.ShaderChunk[name];
  assert.ok(chunk !== undefined, `unknown chunk ${name}`);
  return resolveIncludes(chunk);
});
const shaderFor = (lib) => ({
  uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib[lib].uniforms),
  vertexShader: THREE.ShaderLib[lib].vertexShader,
  fragmentShader: THREE.ShaderLib[lib].fragmentShader,
});
/* the viewer's chain: relief, silk frame, glitter, bed finish (newPartMaterial) */
const partMaterial = (u) => {
  const m = new THREE.MeshPhysicalMaterial();
  applyLayerDetail(m, { layerPitchMm: 0.2, tiltDeg: 22, pixelRatio: 1, printUp: new THREE.Vector3(0, 1, 0) });
  SA.applySilkAxis(m, { up: [0, 1, 0], uniforms: SA.createSilkUniforms() });
  G.applyGlitter(m, { uniforms: u });
  return BF.applyBedFinish(m, { axis: [0, 1, 0], uniforms: BF.createBedFinishUniforms() });
};
const compiled = (u) => { const m = partMaterial(u), sh = shaderFor('physical'); m.onBeforeCompile(sh, null); return { m, sh, vs: resolveIncludes(sh.vertexShader), fs: resolveIncludes(sh.fragmentShader) }; };

test('the patch composes on the real sources, once, behind its define, after the lights', () => {
  const u = G.createGlitterUniforms();
  const { m, sh, vs, fs } = compiled(u);
  for (const [src, needle] of [[vs, 'vGlitMm = vec3( dot( position'], [fs, 'vec4 glitHash( vec3 p )'], [fs, 'reflectedLight.directSpecular += gSum']]) {
    assert.equal(count(src, needle), 1, `${needle} appears ${count(src, needle)} times`);
  }
  const at = (needle) => { const i = fs.indexOf(needle); assert.ok(i >= 0, `${needle} not found`); return i; };
  const guarded = (src, needle) => { const i = src.indexOf(needle); return src.lastIndexOf('#ifdef GLITTER', i) > src.lastIndexOf('#endif', i); };
  assert.ok(guarded(vs, 'vGlitMm = vec3( dot( position'), 'the vertex stage pays without the define');
  assert.ok(guarded(fs, 'vec4 glitHash( vec3 p )'));
  assert.ok(guarded(fs, 'uniform mat3 normalMatrix;'), 'a part without the define would redeclare normalMatrix');
  assert.ok(guarded(fs, 'reflectedLight.directSpecular += gSum'));
  assert.ok(at('RE_Direct( directLight') < at('reflectedLight.directSpecular += gSum'), 'after three adds its lights');
  /* the derivatives come before any branch: a derivative inside one is undefined at the branch's edge */
  const block = fs.slice(at('vec3 gDx = dFdx( vGlitMm )'), at('reflectedLight.directSpecular += gSum'));
  assert.equal(count(block, 'dFdx'), 1); assert.equal(count(block, 'dFdy'), 1);
  assert.ok(block.indexOf('dFdy') < block.indexOf('if ('), 'a derivative after a branch');
  assert.equal(sh.uniforms.uGlitAmount, u.uGlitAmount, 'the amount was copied, not shared: tuning it would reach no material');
  assert.match(m.customProgramCacheKey(), /\|gl1\|bf1$/);
});

test('the block is plain GLSL a compiler accepts: every uniform it reads is declared, none is left out of the set', () => {
  const u = G.createGlitterUniforms();
  const { fs } = compiled(u);
  const used = new Set(fs.match(/\buGlit\w+/g));
  assert.deepEqual([...used].sort(), Object.keys(u).sort());
});

test('nothing in it can move with time, so a still camera draws a still picture and the idle gate rests', () => {
  const { fs } = compiled(G.createGlitterUniforms());
  const block = fs.slice(fs.indexOf('vec3 gDx = dFdx( vGlitMm )'), fs.indexOf('reflectedLight.directSpecular += gSum'));
  assert.doesNotMatch(block, /time|uTime|frame|random/i);
  const js = readFileSync(join(root, 'js', 'glitter.js'), 'utf8');
  assert.doesNotMatch(js, /performance\.now|Date\.now|requestAnimationFrame|invalidateFrame\(/, 'the module drives a clock');
});

test('a lost anchor throws rather than quietly drawing no glitter', () => {
  const m = G.applyGlitter(new THREE.MeshPhysicalMaterial(), { uniforms: G.createGlitterUniforms() });
  const sh = shaderFor('physical');
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '');
  assert.throws(() => m.onBeforeCompile(sh, null), /lights_fragment_end anchor/);
});

test('a blob stays inside its own cell, wherever the hash puts it and however large the octave lets it grow', () => {
  /* the centre wanders by (1 - 2 reach) / 2 either way; the blob is at most `reach` in radius at the fading end of an octave */
  const wander = (1 - 2 * G.CELL_REACH) / 2;
  assert.ok(wander > 0);
  assert.ok(wander + G.CELL_REACH <= 0.5 + 1e-9, 'a blob can cross into the next cell, where one hash cannot find it');
  const { fs } = compiled(G.createGlitterUniforms());
  assert.ok(fs.includes(`( gHash.xyz - 0.5 ) * ${(1 - 2 * G.CELL_REACH).toFixed(3)}`), 'the shader wanders by another amount');
  assert.ok(fs.includes(`log2( gR / ( ${G.CELL_REACH.toFixed(3)} * uGlitCell ) )`), 'the octave pick assumes another reach');
  /* a bright flake draws larger: the clamp is what keeps even the largest inside */
  assert.ok(fs.includes(`float gRc = min( gRo / gS * ( 0.75 + 0.5 * gV ), ${G.CELL_REACH.toFixed(3)} );`), 'a bright flake can leave its cell');
  /* and the real-sized flakes fade out before their radius reaches the cell's room */
  assert.ok(fs.includes(`gW = 1.0 - smoothstep( ${(G.CELL_REACH * 0.7).toFixed(3)}, ${G.CELL_REACH.toFixed(3)}, gRo / gS );`), 'the real flakes are not faded at the reach');
});

test('zooming in finds more: the fine octaves go far below the real flakes, and the real flakes keep their size and grid', () => {
  assert.ok(G.GLITTER.cellMm < G.GLITTER.bigCellMm / 4 && G.GLITTER.rMm < G.GLITTER.bigMm / 2, 'the fine layer stops at the size of the big one');
  assert.ok(G.GLITTER.bigMm / G.GLITTER.bigCellMm <= G.CELL_REACH * 0.7, 'the real flakes are already fading at their own size');
  const { fs } = compiled(G.createGlitterUniforms());
  assert.ok(fs.includes('gS = uGlitBigCell; gRo = max( uGlitBigR, gR );'), 'the big layer follows something other than its real size and the pixel');
  assert.ok(fs.includes('if ( o < 2 ) {'), 'the big layer thins, so its flakes would not stay put through a zoom');
});

test('the lobe fits inside its lattice cell, so a wrapped distance never cuts a flash in two', () => {
  assert.ok(G.GLITTER.lobe < G.GLITTER.period / 2);
});

test('every flake keeps its own lattice period, so a flat face does not relight the same flakes together (Sol 01a194a1)', () => {
  const { fs } = compiled(G.createGlitterUniforms());
  assert.ok(fs.includes('vec3 gE = gSo * ( 1.0 + uGlitVary * ( fract( gHash.y * 29.3 ) - 0.5 ) ) - fract( gHash.wxy * 41.7 );'));
  assert.ok(G.GLITTER.vary > 0);
});

test('the grid is turned: orthonormal, and no row of it runs along a part axis or a 45-degree face', () => {
  const R = G.GRID_TURN;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const d = R[i][0] * R[j][0] + R[i][1] * R[j][1] + R[i][2] * R[j][2];
    assert.ok(Math.abs(d - (i === j ? 1 : 0)) < 1e-9, `rows ${i},${j}: ${d}`);
  }
  const s = Math.SQRT1_2;
  const faces = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [s, s, 0], [s, -s, 0], [s, 0, s], [s, 0, -s], [0, s, s], [0, s, -s]];
  for (const r of R) for (const f of faces) {
    const c = Math.abs(r[0] * f[0] + r[1] * f[1] + r[2] * f[2]);
    assert.ok(c < 0.97, `a grid row lies within 14 degrees of the face normal ${f}: ${c}`);
  }
});

test('who wears it: nothing without a flag; the galaxy labels under =on; the grip whatever it wears under =grips; all under =all', () => {
  assert.equal(G.glitterArm(null), null);
  assert.equal(G.glitterArm('nonsense'), null);
  for (const v of ['on', 'grips', 'all']) assert.equal(G.glitterArm(v), v);
  assert.equal(G.glitterWanted(null, 'Faceplate:GRIP', 'Prusament Galaxy Black'), false);
  assert.equal(G.glitterWanted('on', 'Faceplate:GRIP', 'Prusament Galaxy Black'), true);
  assert.equal(G.glitterWanted('on', 'Case', 'Polymaker PETG Galaxy Red'), true);
  assert.equal(G.glitterWanted('on', 'Faceplate:GRIP', 'Panchroma Yellow'), false);
  assert.equal(G.glitterWanted('grips', 'Faceplate:GRIP', 'Panchroma Yellow'), true);
  assert.equal(G.glitterWanted('grips', 'Case', 'Panchroma Yellow'), false);
  assert.equal(G.glitterWanted('all', 'Case', null), true);
});

test('a filament can tint its flakes: compiled in, the common near-white without it, and it follows a repaint and a clone', () => {
  assert.equal(G.glitterTintOf('Prusament Galaxy Black'), null);
  assert.equal(G.glitterTintOf(null), null);
  assert.match(G.glitterTintOf('Prusament Galaxy Green'), /^vec3\( [\d.]+, [\d.]+, [\d.]+ \)$/);
  const { fs } = compiled(G.createGlitterUniforms());
  assert.ok(fs.includes('#ifndef GLITTER_TINT'), 'a material with no tint would not compile');
  assert.ok(fs.includes('uGlitTint * GLITTER_TINT;'));
  assert.equal(count(main, 'setGlitterTint(m, spec.glitterTint || null)'), 1);
  assert.equal(count(main, 'setGlitterTint(dst, (src.defines && src.defines.GLITTER_TINT) || null)'), 1);
});

test('main.js patches only behind the flag, every finish path passes the label, and the deploy stamps the import', () => {
  assert.equal(count(main, "if (GLITTER_ARM) applyGlitter(m, { uniforms: glitterU });"), 1);
  assert.equal(count(main, 'applyGlitter('), 1, 'a second patch site, perhaps without the flag');
  assert.equal(count(main, "if (GLITTER_ARM) { setDefine(m, 'GLITTER', !!spec.glitter); setGlitterTint(m, spec.glitterTint || null); }"), 1);
  assert.equal(count(main, 'silkFinish(key, partMaterialSpec(') , 3 + 1, 'a finish path was added or lost');
  assert.equal(count(main, 'function silkFinish(key, spec, label = null)'), 1);
  /* ?glitterAmount=0 means no glitter, not the default (Sol 01a194a1), and ?silk=off must not take the glitter with it */
  assert.doesNotMatch(main, /get\('glitterAmount'\)[^\n]*\|\| 1/);
  assert.match(main, /SILK_ARM === 'off'\) return spec\.glitter \? \{ \.\.\.partMaterialSpec\(key\), glitter: spec\.glitter, glitterTint: spec\.glitterTint \}/);
  /* every caller hands the label over, or a repaint would drop the glitter the first paint gave */
  for (const line of main.split('\n').filter((l) => l.includes('silkFinish(key, partMaterialSpec(') && l.trim().endsWith(');') )) {
    assert.match(line, /, (label|ov\.name \|\| null)\)\)?\)?;$/, line.trim());
  }
  assert.ok(pages.includes(`sed -i "s|'./glitter.js'|'./glitter.js?v=$V'|" js/main.js`), 'the deploy leaves the new import unstamped');
});
