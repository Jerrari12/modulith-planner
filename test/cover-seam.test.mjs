/* THE COVER EDGES - js/cover-seam.js, and what node can prove about it (2026-10-21).
 *
 * Joey picked the shading-only bevel: a 0.2 mm, 45 degree chamfer drawn on every cover tile's side edges, never
 * narrower than one device pixel (the comparison: D:\Claude - Output\cover-seams-2026-10-21\COVER-SEAMS.md). What it
 * LOOKS like is judged on screenshots. What node can prove:
 *   1. the patch composes on three r185's real shader sources after the relief and the bed finish, every block once,
 *      and its normal work lands AFTER the finish's plain restore (the Cover Upper's visible top is a bed face)
 *   2. the numbers are Joey's, the switch is a uniform shared with every clone, and it is one program
 *   3. the per-part attribute: x and the part's half-width; a mesh without it draws no edge
 *   4. main.js patches exactly the two cover types at both material sites, stamps their templates, and the deploy
 *      stamps the new module
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
const CS = await import(url('js', 'cover-seam.js'));

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
const count = (s, needle) => s.split(needle).length - 1;
/* the viewer's whole chain for a cover: relief, bed finish (the Cover Upper prints top-down: axis -Y), then the edge */
const coverMaterial = (Ctor, bf, cs) => {
  const m = new Ctor();
  applyLayerDetail(m, { layerPitchMm: 0.2, tiltDeg: 22, pixelRatio: 1, printUp: new THREE.Vector3(0, -1, 0) });
  BF.applyBedFinish(m, { axis: [0, -1, 0], uniforms: bf });
  return CS.applyCoverSeam(m, { uniforms: cs });
};

for (const [lib, Ctor] of [['physical', THREE.MeshPhysicalMaterial], ['standard', THREE.MeshStandardMaterial]]) {
  test(`${lib}: the edge chains after the relief and the bed finish, every block once, in shader order`, () => {
    const bf = BF.createBedFinishUniforms(), cs = CS.createCoverSeamUniforms();
    const m = coverMaterial(Ctor, bf, cs);
    const sh = shaderFor(lib);
    m.onBeforeCompile(sh, null);
    const vs = resolveIncludes(sh.vertexShader), fs = resolveIncludes(sh.fragmentShader);
    for (const [src, needle] of [[vs, 'attribute vec2 aSeam;'], [vs, 'vSeam = aSeam;'],
      [vs, 'vSeamAx = normalize( normalMatrix * vec3( 1.0, 0.0, 0.0 ) );'],
      [fs, 'uniform float uSeamOn, uSeamMm, uSeamMinPx, uSeamTan;'],
      [fs, 'vec3 outS = normalize( vSeamAx ) * ( vSeam.x >= 0.0 ? 1.0 : -1.0 );'],
      [fs, 'float bandPx = max( max( uSeamMm / perPxS, uSeamMinPx ), 1e-3 );'],
      [fs, '* step( 1e-3, vSeam.y );'],
      [fs, 'gBFContact = smoothstep( 0.82, 0.94'], [vs, 'vObjPos = aBfMm;']]) {
      assert.equal(count(src, needle), 1, `${needle} appears ${count(src, needle)} times`);
    }
    assert.ok(fs.includes('ldApplic'), 'the relief block is missing - the chain dropped it');
    /* the shipped edge is shading only: it moves no vertex and takes no light away */
    assert.ok(!/transformed\.x -=|gSeamOcc|uSeamGap|uSeamHair/.test(vs + fs), 'a prototype mode came back');
    const at = (src, needle) => { const i = src.indexOf(needle); assert.ok(i >= 0, `${needle} not found`); return i; };
    /* ⚠ the tilt must follow the finish's PLAIN restore, which puts the interpolated normal back on a bed face - and the
       Cover Upper's visible top is its bed face - and precede the lights that read the normal */
    const edgeAt = at(fs, 'float bandPx = max(');
    assert.ok(at(fs, 'gBFContact = smoothstep( 0.82, 0.94') < edgeAt, 'the bed finish would undo the edge');
    assert.ok(at(fs, 'if ( uLLOn > 0.5 ) {') < edgeAt, 'the layer lines run after the edge');
    assert.ok(edgeAt < at(fs, 'material.diffuseColor = diffuseColor.rgb'), 'the lights read the normal before the tilt');
    assert.ok(edgeAt < at(fs, 'RE_Direct( directLight'), 'the direct light is gathered before the tilt');
    assert.equal(sh.uniforms.uSeamOn, cs.uSeamOn, 'the edge uniforms were copied, not shared');
    assert.match(m.customProgramCacheKey(), /\|ld\|bf1\|cs1$/, 'the cache key does not carry all three patches');
  });
}

test('Joey\'s numbers: 0.2 mm at 45 degrees, never under one device pixel, on by default', () => {
  assert.deepEqual({ ...CS.COVER_BEVEL }, { mm: 0.2, minPx: 1, deg: 45 });
  const u = CS.createCoverSeamUniforms();
  assert.equal(u.uSeamOn.value, 1);
  assert.equal(u.uSeamMm.value, 0.2);
  assert.equal(u.uSeamMinPx.value, 1);
  assert.ok(Math.abs(u.uSeamTan.value - 1) < 1e-12, 'tan 45');
  assert.equal(CS.createCoverSeamUniforms({ on: false }).uSeamOn.value, 0);
});

test('the switch is a uniform: one program either way, and clones share it', () => {
  const cs = CS.createCoverSeamUniforms();
  const m = coverMaterial(THREE.MeshStandardMaterial, BF.createBedFinishUniforms(), cs);
  const key = m.customProgramCacheKey();
  const clone = m.clone();
  for (const k of ['onBeforeCompile', 'customProgramCacheKey']) clone[k] = m[k];
  const sh = shaderFor('standard'); clone.onBeforeCompile(sh, null);
  cs.uSeamOn.value = 0;
  assert.equal(sh.uniforms.uSeamOn.value, 0, 'the clone did not follow the switch');
  assert.equal(m.customProgramCacheKey(), key, 'the switch changed the program');
});

test('aSeam: x per vertex and the PART\'s half-width, over all of its meshes', () => {
  const a = new Float32Array([-43.996, 5.7, 0, 43.002, 5.7, 1]), b = new Float32Array([10, 0, 0, 43.996, 0, -92.5]);
  const [sa, sb] = CS.seamAttributes([a, b]);
  assert.deepEqual([...sa].map((v) => +v.toFixed(3)), [-43.996, 43.996, 43.002, 43.996]);
  assert.deepEqual([...sb].map((v) => +v.toFixed(3)), [10, 43.996, 43.996, 43.996]);
});

test('a lost anchor throws instead of rendering a cover with no edge', () => {
  const m = CS.applyCoverSeam(new THREE.MeshStandardMaterial(), { uniforms: CS.createCoverSeamUniforms() });
  const sh = shaderFor('standard');
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', '');
  assert.throws(() => m.onBeforeCompile(sh, null), /lights_physical_fragment anchor/);
});

test('main.js edges exactly the two cover types, at both material sites, and stamps their templates', () => {
  const main = readFileSync(join(root, 'js', 'main.js'), 'utf8');
  assert.deepEqual([...CS.SEAM_TYPES].sort(), ['CoverL', 'CoverU']);
  assert.match(main, /const seamU = createCoverSeamUniforms\(\{ on: new URLSearchParams\(location\.search\)\.get\('seams'\) !== 'off' \}\);/);
  assert.match(main, /return SEAM_TYPES\.has\(key\) \? applyCoverSeam\(m, \{ uniforms: seamU \}\) : m;/);
  assert.equal(count(main, 'applyCoverSeam('), 1, 'the edge is applied somewhere the type check does not cover');
  assert.equal(count(main, 'seamPatched(key, seeIntoPatched(key, newPartMaterial(key)))'), 2, 'a material site builds covers without the edge');
  assert.match(main, /if \(SEAM_TYPES\.has\(type\)\) \{\s*try \{ stampSeams\(sceneRoot\); \}/, 'the cover templates are not stamped, or a failed stamp can fail the load');
});

test('the deploy stamps the new module, as the module-graph guard demands', () => {
  const yml = readFileSync(join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.ok(yml.includes(`sed -i "s|'./cover-seam.js'|'./cover-seam.js?v=$V'|" js/main.js`), 'no pages.yml stamping line for js/cover-seam.js');
});
