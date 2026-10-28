/* SILK LOOKS SILK ON THE MODEL (Joey, 2026-10-28: silk filaments "still feel way too much like regular filaments ... they
 * almost look the same"). What it LOOKS like is judged on the comparison shots (D:\Claude - Output\silk-finish-2026-10-28).
 * What node can prove:
 *   1. the catalog decides silk: `finish: 'silk'` on exactly the Silk PLA line's 24 colours, and the picker's own
 *      swatch rule agrees with it on every catalog label
 *   2. the spec: a silk label gets SILK_APPROX, a profile still wins, a label-free call is unchanged
 *   3. the frame patch composes on three r185's real sources after the relief and the bed finish, every block once,
 *      behind its defines, and reads the final normal; a lost anchor throws
 *   4. the skin direction lies in the layer plane, unit length, for every axis the parts print along
 *   5. main.js paints every finish through applyFinish, and the deploy stamps the new import edges
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
const { FILAMENT_DB, finishOfLabel } = await import(url('js', 'filament-db.js'));
const { partMaterialSpec, SILK_APPROX } = await import(url('js', 'part-material.js'));
const { FILAMENT_PROFILES } = await import(url('js', 'filament-profiles.js'));

const main = readFileSync(join(root, 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const count = (s, needle) => s.split(needle).length - 1;

test('the catalog decides silk: exactly the Silk PLA line, all 24, and nothing else', () => {
  const silk = FILAMENT_DB.flatMap((b) => b.colors.filter((c) => c.finish === 'silk').map((c) => [b.line, c.label]));
  assert.equal(silk.length, 24);
  assert.ok(silk.every(([line]) => line === 'Panchroma™ Silk PLA'), 'a filament outside the Silk PLA line is marked silk');
  assert.ok(FILAMENT_DB.filter((b) => b.line === 'Panchroma™ Silk PLA').every((b) => b.colors.every((c) => c.finish === 'silk')));
  for (const c of FILAMENT_DB.flatMap((b) => b.colors)) assert.ok(c.finish === undefined || c.finish === 'silk', `${c.label}: finish ${c.finish}`);
  assert.equal(finishOfLabel('Panchroma Silk Gold'), 'silk');
  assert.equal(finishOfLabel('Panchroma Yellow'), null);
  assert.equal(finishOfLabel('A filament the catalog no longer holds'), null);
  assert.equal(finishOfLabel(null), null);
});

test('the picker\'s swatch sheen and the model agree on every catalog label', () => {
  /* colors.js `silk()` reads the word, because a saved palette can name a filament the catalog lacks; on the catalog's own
     labels the two rules must not disagree, or the swatch and the model would tell two stories */
  const word = (name) => String(name || '').split(' ').includes('Silk');
  for (const c of FILAMENT_DB.flatMap((b) => b.colors)) assert.equal(word(c.label), finishOfLabel(c.label) === 'silk', c.label);
});

test('a silk label gets the silk approximation; a label-free call and an ordinary label are unchanged', () => {
  const base = partMaterialSpec('Case');
  assert.deepEqual(partMaterialSpec('Case', { label: 'Panchroma Silk Gold' }), { ...base, ...SILK_APPROX, silk: 'approx' });
  assert.deepEqual(partMaterialSpec('Faceplate:FACE', { label: 'Panchroma Silk Black' }).silk, 'approx');
  assert.deepEqual(partMaterialSpec('Case', { label: 'Panchroma Yellow' }), base);
  assert.equal(base.anisotropy, undefined, 'the ordinary part grew an anisotropy (the Lab\'s label-free pane would see it)');
  /* the approximation is glossier than the ordinary part and directional; its numbers are art, so only their sense is pinned */
  assert.ok(SILK_APPROX.roughness < base.roughness && SILK_APPROX.metalness > base.metalness && SILK_APPROX.anisotropy > 0);
  assert.ok(Object.isFrozen(SILK_APPROX));
});

test('the holographic plate still wins over silk, and a profile would too', () => {
  const holo = partMaterialSpec('Faceplate', { holographicPlate: true, plateContact: true, label: 'Panchroma Silk Gold' });
  assert.equal(holo.holographic, true);
  assert.equal(holo.silk, undefined);
  /* a profile wins by ORDER; prove the order on the one profiled label, and that the branch below it is the silk one */
  const [profiled] = Object.keys(FILAMENT_PROFILES);
  assert.equal(partMaterialSpec('Case', { label: profiled }).profile, profiled);
  const src = readFileSync(join(root, 'js', 'part-material.js'), 'utf8');
  assert.ok(src.indexOf('if (profile) return') < src.indexOf("finishOfLabel(label) === 'silk'"), 'silk is tested before the profile');
});

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
/* the viewer's chain for an upright part: relief, bed finish, then the silk frame */
const partMaterial = (su) => {
  const m = new THREE.MeshPhysicalMaterial();
  applyLayerDetail(m, { layerPitchMm: 0.2, tiltDeg: 22, pixelRatio: 1, printUp: new THREE.Vector3(0, 1, 0) });
  BF.applyBedFinish(m, { axis: [0, 1, 0], uniforms: BF.createBedFinishUniforms() });
  return SA.applySilkAxis(m, { up: [0, 1, 0], uniforms: su });
};

test('the frame and the silk light compose after the relief and the bed finish, once each, behind their defines', () => {
  const su = SA.createSilkUniforms();
  const m = partMaterial(su);
  const sh = shaderFor('physical');
  m.onBeforeCompile(sh, null);
  const vs = resolveIncludes(sh.vertexShader), fs = resolveIncludes(sh.fragmentShader);
  for (const [src, needle] of [[vs, 'vSilkUp = normalMatrix * uSilkUp;'], [vs, 'vSilkSkin = mat3( modelViewMatrix ) * uSilkSkin;'],
    [fs, 'uniform float uSilkRot, uSilkLight, uSilkEnv;'], [fs, 'material.anisotropyT = sDir;'],
    [fs, 'reflectedLight.directSpecular += sNL * uSilkLight * BRDF_GGX( sLd, geometryViewDir, normal, material );'],
    [fs, 'reflectedLight.indirectSpecular *= uSilkEnv;']]) {
    assert.equal(count(src, needle), 1, `${needle} appears ${count(src, needle)} times`);
  }
  const at = (needle) => { const i = fs.indexOf(needle); assert.ok(i >= 0, `${needle} not found`); return i; };
  const frame = at('material.anisotropyT = sDir;');
  /* after three's own frame (which it replaces) and after every patch that writes the normal; before the lights read it */
  assert.ok(at('material.anisotropyB = tbn[ 1 ]') < frame, 'three would overwrite the frame');
  assert.ok(at('gBFContact = smoothstep( 0.82, 0.94') < frame, 'the bed finish writes the normal after the frame was built');
  assert.ok(frame < at('RE_Direct( directLight'), 'the lights are gathered before the frame');
  /* both blocks are compiled out unless their define is on: a non-silk part pays for neither */
  const guarded = (needle, def) => { const i = at(needle); return fs.lastIndexOf(`#ifdef ${def}`, i) > fs.lastIndexOf('#endif', i); };
  assert.ok(guarded('material.anisotropyT = sDir;', 'USE_ANISOTROPY'));
  assert.ok(guarded('reflectedLight.directSpecular += sNL', 'SILK_SHEEN'));
  assert.ok(guarded('reflectedLight.indirectSpecular *= uSilkEnv;', 'SILK_ENV'), 'the studio scale reaches parts that do not reflect the studio');
  assert.ok(!guarded('reflectedLight.indirectSpecular *= uSilkEnv;', 'SILK_SHEEN'), 'the studio scale hangs on the light (?silk=nolight would hand Fast the full studio)');
  /* the silk light comes after three's lights; the studio scale after the environment's specular was gathered, before AO */
  assert.ok(at('RE_Direct( directLight') < at('reflectedLight.directSpecular += sNL'));
  assert.ok(at('RE_IndirectSpecular( radiance') < at('reflectedLight.indirectSpecular *= uSilkEnv;'));
  assert.ok(at('reflectedLight.indirectSpecular *= uSilkEnv;') < at('float ambientOcclusion = ( texture2D( aoMap'), 'AO lands before the studio scale');
  assert.equal(sh.uniforms.uSilkLight, su.uSilkLight, 'the silk light was copied, not shared');
  assert.match(m.customProgramCacheKey(), /\|ld\|bf1\|sa1$/);
});

test('no division by a zero vector: every normalise of a projection is guarded', () => {
  const m = SA.applySilkAxis(new THREE.MeshPhysicalMaterial(), { up: [0, 1, 0], uniforms: SA.createSilkUniforms() });
  const sh = shaderFor('physical'); m.onBeforeCompile(sh, null);
  const fs = sh.fragmentShader;
  assert.match(fs, /vec3 sWall = sL > 1e-4 \? sT \/ sL : sFall;/);
  assert.match(fs, /vec3 sSkin = sKL > 1e-4 \? sK \/ sKL : sFall;/);
  assert.match(fs, /vec3 sDir = sML > 1e-4 \? sMix \/ sML : sFall;/);
  assert.ok(!/normalize\( sT \)|normalize\( sK \)|normalize\( sMix \)/.test(fs));
  /* an axis has no sign: the skin's is turned into the wall's hemisphere before the blend, or a bevel seams (Sol 01a18343) */
  assert.ok(fs.indexOf('if ( dot( sSkin, sWall ) < 0.0 ) sSkin = -sSkin;') >= 0 && fs.indexOf('if ( dot( sSkin, sWall ) < 0.0 ) sSkin = -sSkin;') < fs.indexOf('vec3 sMix = mix( sSkin, sWall, sW );'));
});

test('a lost anchor throws instead of drawing a silk part with no frame', () => {
  const m = SA.applySilkAxis(new THREE.MeshPhysicalMaterial(), { up: [0, 1, 0], uniforms: SA.createSilkUniforms() });
  const sh = shaderFor('physical');
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '');
  assert.throws(() => m.onBeforeCompile(sh, null), /lights_fragment_end anchor/);
});

test('the skin direction lies in the layer plane, unit length, for every axis a part prints along', () => {
  for (const up of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0.6, 0.8, 0]]) {
    const s = SA.skinAcross(up), n = Math.hypot(...up);
    assert.ok(Math.abs(Math.hypot(...s) - 1) < 1e-9, `${up}: not unit`);
    assert.ok(Math.abs((s[0] * up[0] + s[1] * up[1] + s[2] * up[2]) / n) < 1e-9, `${up}: not in the layer plane`);
  }
});

test('the silk light rides with the camera and is on by default; the rotation arm is a uniform', () => {
  const u = SA.createSilkUniforms();
  assert.deepEqual(u.uSilkLightPos.value, [...SA.SILK_LIGHT.pos]);
  assert.equal(u.uSilkLight.value, SA.SILK_LIGHT.intensity);
  assert.ok(SA.SILK_LIGHT.intensity > 0);
  assert.equal(u.uSilkRot.value, 0);
  assert.equal(SA.createSilkUniforms({ rot: true }).uSilkRot.value, 1);
});

test('a tier without tone mapping gets the flat strengths, and applyQuality sets them on every tier change', () => {
  /* Fast draws with no tone mapping: at the tone-mapped strengths a Silk Gold front clipped to flat yellow (2026-10-28) */
  assert.deepEqual(SA.silkTier(true), { light: SA.SILK_LIGHT.intensity, env: 1 });
  assert.deepEqual(SA.silkTier(false), { light: SA.SILK_LIGHT.flat, env: SA.SILK_LIGHT.flatEnv });
  assert.ok(SA.SILK_LIGHT.flat < SA.SILK_LIGHT.intensity && SA.SILK_LIGHT.flatEnv < 1);
  const u = SA.createSilkUniforms({ tone: false });
  assert.equal(u.uSilkLight.value, SA.SILK_LIGHT.flat);
  assert.equal(u.uSilkEnv.value, SA.SILK_LIGHT.flatEnv);
  const fn = main.slice(main.indexOf('function applyQuality'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /const st = silkTier\(!!q\.tone\); silkU\.uSilkLight\.value = st\.light; silkU\.uSilkEnv\.value = st\.env;/);
  assert.match(main, /var silkU = createSilkUniforms\(\{ rot: SILK_ARM === 'rot', tone: !!QUALITY\[quality\]\.tone \}\);/);
});

test('main.js paints every finish through silkFinish and applyFinish, and patches every physical part', () => {
  /* the four places a finish reaches a live material: construction, the palette repaint, a unit's own pick, a look card */
  assert.equal(count(main, 'applyFinish(m, spec);'), 1, 'newPartMaterial no longer sets the finish through applyFinish');
  assert.match(main, /const repaint = \(type, mat\) => \{\s*mat\.color\.set\(activeHex\(type\)\);\s*applyFinish\(mat, finishFor\(type\)\);/);
  assert.match(main, /const finishFor = key => silkFinish\(key, partMaterialSpec\(/);
  assert.equal(count(main, 'applyFinish(m, silkFinish(key, partMaterialSpec('), 2, 'a unit pick or a look card skips the silk finish');
  /* no path writes the scalars by hand any more (a stale anisotropy would survive it) - the planned clones copy their source */
  assert.equal(count(main, '.roughness = spec.roughness'), 1, 'a finish is written outside applyFinish');
  assert.equal(count(main, 'copyFinish(e.mat, e.src);'), 2, 'a planned clone keeps a stale finish');
  const fn = main.slice(main.indexOf('function newPartMaterial'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.ok(body.indexOf('withSilkAxis(m, key);') > body.indexOf('withLayerDetail(m, key);'), 'the frame patch is not chained after the relief');
  assert.match(main, /var SILK_ARM = .*\['off', 'iso', 'rot', 'nolight', 'nostudio'\]/);
});

test('the deploy stamps the two new import edges, as the module-graph guard demands', () => {
  const yml = readFileSync(join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.ok(yml.includes(`sed -i "s|'./silk-axis.js'|'./silk-axis.js?v=$V'|" js/main.js`), 'no stamping line for js/silk-axis.js');
  assert.ok(yml.includes(`sed -i "s|'./filament-db.js'|'./filament-db.js?v=$V'|" js/part-material.js`), 'no stamping line for part-material.js -> filament-db.js');
});
