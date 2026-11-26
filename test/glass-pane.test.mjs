/* THE GLASS PANE - js/glass-pane.js, and what node can prove about it (2026-11-25).
 *
 * Joey on the glass top in My colors: "it feels like air". What the pane LOOKS like is judged on screenshots
 * (D:\Claude - Output\coffee-station-modulith-2026-11-23\planner\glass-look). What node can prove:
 *   1. the patch composes on three's real physical shader, once, just before the fragment's colour is written, and
 *      every name it reads is declared before it
 *   2. the numbers: the body's rest opacity is the one main.js records for the step fades, the mirror is off where
 *      there is no environment, and a fading board fades whole
 *   3. it chains after an earlier patch, keeps that patch's cache key, and is one program
 *   4. main.js patches the glass board only, and the deploy stamps the new module
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (...p) => pathToFileURL(join(root, ...p)).href;
const THREE = await import(url('vendor', 'three', 'three.module.js'));
const GP = await import(url('js', 'glass-pane.js'));

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
const patched = (m = new THREE.MeshPhysicalMaterial(), u = GP.createGlassPaneUniforms()) => {
  GP.applyGlassPane(m, { uniforms: u });
  const sh = shaderFor('physical');
  m.onBeforeCompile(sh, null);
  return { m, u, sh };
};

test('the pane lands once on the physical shader, just before the colour is written, reading declared names', () => {
  const { sh, u } = patched();
  const f = sh.fragmentShader;
  assert.equal(count(f, 'if ( uGlassOn > 0.5 ) {'), 1);
  assert.equal(count(f, 'uniform float uGlassOn, uGlassRest, uGlassEdge;'), 1);
  const at = f.indexOf('if ( uGlassOn > 0.5 ) {');
  assert.ok(at < f.indexOf('#include <opaque_fragment>'), 'the pane must set outgoingLight and alpha before opaque_fragment writes them');
  for (const name of ['vec3 totalDiffuse =', 'vec3 outgoingLight =', 'vec3 totalEmissiveRadiance =', 'outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc )'])
    assert.ok(f.indexOf(name) > -1 && f.indexOf(name) < at, `${name} is not before the pane`);
  assert.match(f, /#ifdef USE_CLEARCOAT\s*gBody \*= 1\.0 - material\.clearcoat \* Fcc;/, 'the clearcoat share must come off the body before the reflection is split out');
  assert.ok(f.indexOf('vec3 Fcc =') > -1 && f.indexOf('vec3 Fcc =') < at, 'Fcc is not declared before the pane');
  const full = resolveIncludes(f);
  for (const name of ['vec3 transformNormalByInverseViewMatrix', 'varying vec3 vViewPosition', 'vec3 normal ='])
    assert.ok(full.includes(name), `three no longer declares ${name}`);
  assert.equal(sh.vertexShader, THREE.ShaderLib.physical.vertexShader, 'the pane needs nothing from the vertex shader');
  for (const k of Object.keys(u)) assert.equal(sh.uniforms[k], u[k], `${k} is not the shared uniform`);
});

test('the numbers: a see-through face, a nearly solid edge, no mirror without an environment, and a whole fade', () => {
  assert.ok(GP.GLASS_PANE.rest > 0.1 && GP.GLASS_PANE.rest < 0.35, 'the face is a faint tint');
  assert.ok(GP.GLASS_PANE.edge > 0.7 && GP.GLASS_PANE.edge <= 1, 'the edge is nearly solid');
  const [r, g, b] = GP.GLASS_PANE.edgeTint; assert.ok(g > r && g > b, 'the edge is green');
  const u = GP.createGlassPaneUniforms();
  assert.equal(u.uGlassOn.value, 1); assert.equal(u.uGlassRest.value, GP.GLASS_PANE.rest); assert.equal(u.uGlassEdge.value, GP.GLASS_PANE.edge);
  assert.equal(GP.createGlassPaneUniforms({ on: false }).uGlassOn.value, 0);
  const f = patched().sh.fragmentShader;
  assert.match(f, /float gF = 0\.0;\s*#ifdef USE_ENVMAP[\s\S]*?#endif/, 'the mirror must be off where the scene has no environment');
  assert.ok(f.includes('diffuseColor.a = gOut * gVis;') && f.includes('float gVis = saturate( diffuseColor.a / max( uGlassRest, 1e-3 ) );'), 'a step fade must scale the whole pane');
});

test('it chains after an earlier patch, keeps its cache key, and marks the material', () => {
  const m = new THREE.MeshPhysicalMaterial();
  let ran = 0;
  m.onBeforeCompile = () => { ran++; };
  m.customProgramCacheKey = () => 'prior';
  const { m: out } = patched(m);
  assert.equal(ran, 1, 'the earlier patch did not run');
  assert.equal(out.customProgramCacheKey(), 'prior' + GP.GLASS_PANE_KEY);
  assert.equal(out.userData.glassPane, true);
  assert.equal(patched().m.customProgramCacheKey(), GP.GLASS_PANE_KEY);
});

test('main.js patches the glass board only, at its rest opacity, and the deploy stamps the new module', () => {
  const main = readFileSync(join(root, 'js', 'main.js'), 'utf8');
  assert.ok(main.includes("import { GLASS_PANE, createGlassPaneUniforms, applyGlassPane } from './glass-pane.js';"));
  assert.ok(main.includes('const GLASS_OPACITY = GLASS_PANE.rest;'), 'the fades rest opacity and the shader rest must be one number');
  assert.match(main, /function glassPatched\(key, m\) \{\s*if \(key !== 'GlassTop'\) return m;[\s\S]*?m\.userData\.rest = GLASS_OPACITY;[\s\S]*?return applyGlassPane\(m, \{ uniforms: glassU \}\);/);
  assert.equal(count(main, 'glassPatched(key, skinPatched('), 2, 'both material sites');
  const yml = readFileSync(join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.ok(yml.includes(`sed -i "s|'./glass-pane.js'|'./glass-pane.js?v=$V'|" js/main.js`), 'no pages.yml stamping line for js/glass-pane.js');
});
