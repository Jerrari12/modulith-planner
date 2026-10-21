/* THE COVER-SEAM PROTOTYPE - js/cover-seam.js, and what node can prove about it (2026-10-21).
 *
 * What the seam LOOKS like is judged on screenshots (D:\Claude - Output\cover-seams-2026-10-21). What node can prove:
 *   1. the patch composes on three r185's real shader sources after the relief and the bed finish, every block once,
 *      and its normal work lands AFTER the finish's plain restore (the Cover Upper's visible top is a bed face)
 *   2. every mode is one program: the mode and sizes are uniforms, shared with every clone
 *   3. the per-part attribute: x and the part's half-width
 *   4. with no ?seams= parameter main.js patches and stamps nothing
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
/* the viewer's whole chain for a cover: relief, bed finish (the Cover Upper prints top-down: axis -Y), then the seam */
const coverMaterial = (Ctor, bf, cs) => {
  const m = new Ctor();
  applyLayerDetail(m, { layerPitchMm: 0.2, tiltDeg: 22, pixelRatio: 1, printUp: new THREE.Vector3(0, -1, 0) });
  BF.applyBedFinish(m, { axis: [0, -1, 0], uniforms: bf });
  return CS.applyCoverSeam(m, { uniforms: cs });
};

for (const [lib, Ctor] of [['physical', THREE.MeshPhysicalMaterial], ['standard', THREE.MeshStandardMaterial]]) {
  test(`${lib}: the seam chains after the relief and the bed finish, every block once, in shader order`, () => {
    const bf = BF.createBedFinishUniforms(), cs = CS.createCoverSeamUniforms();
    const m = coverMaterial(Ctor, bf, cs);
    const sh = shaderFor(lib);
    m.onBeforeCompile(sh, null);
    const vs = resolveIncludes(sh.vertexShader), fs = resolveIncludes(sh.fragmentShader);
    for (const [src, needle] of [[vs, 'attribute vec2 aSeam;'], [vs, 'vSeam = aSeam;'], [vs, 'transformed.x -= sign( aSeam.x )'],
      [fs, 'float gSeamOcc = 1.0;'], [fs, 'float dS = max( vSeam.y - abs( vSeam.x ), 0.0 );'], [fs, 'reflectedLight.directSpecular *= gSeamOcc;'],
      [fs, 'gBFContact = smoothstep( 0.82, 0.94'], [vs, 'vObjPos = aBfMm;']]) {
      assert.equal(count(src, needle), 1, `${needle} appears ${count(src, needle)} times`);
    }
    assert.ok(fs.includes('ldApplic'), 'the relief block is missing - the chain dropped it');
    const at = (src, needle) => { const i = src.indexOf(needle); assert.ok(i >= 0, `${needle} not found`); return i; };
    /* ⚠ the tilt must follow the finish's PLAIN restore, which puts the interpolated normal back on a bed face - and the
       Cover Upper's visible top is its bed face - and precede the lights that read the normal */
    assert.ok(at(fs, 'gBFContact = smoothstep( 0.82, 0.94') < at(fs, 'float dS = max('), 'the bed finish would wipe the bevel');
    assert.ok(at(fs, 'if ( uLLOn > 0.5 ) {') < at(fs, 'float dS = max('), 'the layer lines run after the seam');
    assert.ok(at(fs, 'float dS = max(') < at(fs, 'material.diffuseColor = diffuseColor.rgb'), 'the lights read the normal before the tilt');
    /* the occlusion multiplies light the lights have already gathered, before it is summed */
    assert.ok(at(fs, 'RE_Direct( directLight') < at(fs, 'reflectedLight.directDiffuse *= gSeamOcc;'));
    assert.ok(at(fs, 'reflectedLight.directSpecular *= gSeamOcc;') < at(fs, 'vec3 totalDiffuse ='));
    /* the gap moves `transformed` after it exists and before anything projects it */
    assert.ok(at(vs, 'vec3 transformed = vec3( position );') < at(vs, 'transformed.x -= sign( aSeam.x )'));
    assert.ok(at(vs, 'transformed.x -= sign( aSeam.x )') < at(vs, 'gl_Position = projectionMatrix * mvPosition;'));
    /* Sol 01a15ee1: the outward direction's sign is taken per fragment (a per-vertex sign interpolates toward zero across
       a triangle spanning both side edges), and a zero-width bevel band cannot divide by zero */
    assert.ok(vs.includes('vSeamAx = normalize( normalMatrix * vec3( 1.0, 0.0, 0.0 ) );'));
    assert.ok(fs.includes('vec3 outS = normalize( vSeamAx ) * ( vSeam.x >= 0.0 ? 1.0 : -1.0 );'));
    assert.ok(!/vSeamOut/.test(vs + fs), 'a per-vertex outward vector came back');
    assert.ok(fs.includes('float bandPx = max( max( uSeamBevelMm / perPxS, uSeamBevelPx ), 1e-3 );'));
    assert.equal(sh.uniforms.uSeamMode, cs.uSeamMode, 'the seam uniforms were copied, not shared');
    assert.match(m.customProgramCacheKey(), /\|ld\|bf1\|cs1$/, 'the cache key does not carry all three patches');
  });
}

test('every mode is one program: the mode is a uniform, and clones share it', () => {
  const cs = CS.createCoverSeamUniforms();
  const m = coverMaterial(THREE.MeshStandardMaterial, BF.createBedFinishUniforms(), cs);
  const key = m.customProgramCacheKey();
  const clone = m.clone();
  for (const k of ['onBeforeCompile', 'customProgramCacheKey']) clone[k] = m[k];
  for (const mode of CS.SEAM_MODES) {
    CS.setCoverSeam(cs, { mode });
    assert.equal(CS.coverSeamMode(cs), mode);
    assert.equal(m.customProgramCacheKey(), key, `${mode} changed the program`);
  }
  const sh = shaderFor('standard'); clone.onBeforeCompile(sh, null);
  CS.setCoverSeam(cs, { mode: 'gap', gapMm: 0.5 });
  assert.equal(sh.uniforms.uSeamMode.value, 3);
  assert.equal(sh.uniforms.uSeamGapMm.value, 0.5);
  CS.setCoverSeam(cs, { bevelDeg: 45 });
  assert.ok(Math.abs(cs.uSeamBevelTan.value - 1) < 1e-12);
  assert.equal(CS.createCoverSeamUniforms().uSeamMode.value, 0, 'the default is not off');
});

test('aSeam: x per vertex and the PART\'s half-width, over all of its meshes', () => {
  const a = new Float32Array([-43.996, 5.7, 0, 43.002, 5.7, 1]), b = new Float32Array([10, 0, 0, 43.996, 0, -92.5]);
  const [sa, sb] = CS.seamAttributes([a, b]);
  assert.deepEqual([...sa].map((v) => +v.toFixed(3)), [-43.996, 43.996, 43.002, 43.996]);
  assert.deepEqual([...sb].map((v) => +v.toFixed(3)), [10, 43.996, 43.996, 43.996]);
});

test('a lost anchor throws instead of rendering a cover with no seam', () => {
  const m = CS.applyCoverSeam(new THREE.MeshStandardMaterial(), { uniforms: CS.createCoverSeamUniforms() });
  const sh = shaderFor('standard');
  sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', '');
  assert.throws(() => m.onBeforeCompile(sh, null), /aomap_fragment anchor/);
});

test('with no ?seams= parameter main.js patches no material and stamps no template', () => {
  const main = readFileSync(join(root, 'js', 'main.js'), 'utf8');
  assert.match(main, /const SEAM_PROTO = SEAM_PARAMS\.has\('seams'\);/);
  assert.match(main, /const seamU = SEAM_PROTO \? createCoverSeamUniforms\(/);
  assert.match(main, /return \(seamU && SEAM_TYPES\.has\(key\)\) \? applyCoverSeam\(m, \{ uniforms: seamU \}\) : m;/);
  assert.match(main, /if \(seamU && SEAM_TYPES\.has\(type\)\) stampSeams\(sceneRoot\);/);
  assert.equal(count(main, 'applyCoverSeam('), 1, 'the seam is applied somewhere the gate does not cover');
  assert.equal(count(main, 'seamPatched(key, seeIntoPatched(key, newPartMaterial(key)))'), 2, 'a material site builds covers unpatched');
  assert.deepEqual([...CS.SEAM_TYPES].sort(), ['CoverL', 'CoverU']);
});
