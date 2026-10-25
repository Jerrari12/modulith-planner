/* THE BAKED TOP LAYERS - js/skin-map.js, tools/skin-map.mjs, and what node can prove about them (2026-10-25).
 *
 * What the maps LOOK like is judged on screenshots (tools/skin-shots.mjs). What node can prove:
 *   1. the patch composes on three r185's real shader sources after the relief, the bed finish and the cover edge,
 *      every block once, its normal work after the finish's plain restore and before the lights read the normal
 *   2. the switch is a uniform shared with every clone; one program either way; a material without the finish refused
 *   3. the frame the GLSL derives from the build axis IS skinTangents(), which the shipping tool bakes against, and the
 *      Z channel's decode is the bake's encode
 *   4. the atlas packer: no overlaps, inside the atlas, the small atlas first, a scale only when nothing else fits
 *   5. the PNG codec round-trips byte for byte and refuses what the bake never writes
 *   6. a shipped map lands where the model has its skins: the EdgeLabel 2W-1H map against its GLB, with the mirrored
 *      and turned map as controls, the label window empty, the REMOVE tear-away tab along the window's lower edge
 *   7. main.js patches every finished material, stamps every template, syncs on the mount and the tier switch, the
 *      trial behind ?skinlines=on is gone, and the deploy stamps the module
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (...p) => pathToFileURL(join(root, ...p)).href;
const THREE_URL = url('vendor', 'three', 'three.module.js');
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`));
const THREE = await import(THREE_URL);
const { applyLayerDetail } = await import(url('js', 'vendor', 'layer-detail.js'));
const BF = await import(url('js', 'bed-finish.js'));
const CS = await import(url('js', 'cover-seam.js'));
const SM = await import(url('js', 'skin-map.js'));
const G = await import(url('tools', 'lib', 'skin-geometry.mjs'));
const CHK = await import(url('tools', 'lib', 'skin-check.mjs'));

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
/* the viewer's whole chain for a cover tile: relief, bed finish, the edge, then the skin map */
const fullMaterial = (Ctor, bf, cs, sm, axis = [0, 1, 0]) => {
  const m = new Ctor();
  applyLayerDetail(m, { layerPitchMm: 0.2, tiltDeg: 22, pixelRatio: 1, printUp: new THREE.Vector3(...axis) });
  BF.applyBedFinish(m, { axis, uniforms: bf });
  CS.applyCoverSeam(m, { uniforms: cs });
  return SM.applySkinMap(m, { uniforms: sm });
};

/* ── 1. the patch on three's real sources ──────────────────────────────────────────────────── */

for (const [lib, Ctor] of [['physical', THREE.MeshPhysicalMaterial], ['standard', THREE.MeshStandardMaterial]]) {
  test(`${lib}: the skin map chains after the relief, the finish and the edge, every block once, in shader order`, () => {
    const bf = BF.createBedFinishUniforms(), cs = CS.createCoverSeamUniforms(), sm = SM.createSkinMapUniforms();
    const m = fullMaterial(Ctor, bf, cs, sm);
    const sh = shaderFor(lib);
    m.onBeforeCompile(sh, null);
    const vs = resolveIncludes(sh.vertexShader), fs = resolveIncludes(sh.fragmentShader);
    for (const [src, needle] of [[vs, 'attribute float aSkinId;'], [vs, 'vSkinId = aSkinId;'],
      [fs, 'if ( vSkinId > 0.5 && gBFTop > 0.0 ) {'], [fs, 'int idSM = int( vSkinId + 0.5 ) - 1;'],
      [fs, 'uniform sampler2D uSMAtlas;'], [fs, 'uniform sampler2D uSMTable;'],
      [fs, 'if ( uSMOn > 0.5 && uLLOn > 0.5 ) {'], [fs, 'textureGrad( uSMAtlas, uvSM'], [fs, 'texelFetch( uSMAtlas, ivec2( rSM.xy + floor( pxSM ) ), 0 )'],
      [fs, 'gBFContact = smoothstep( 0.82, 0.94'], [fs, 'float bandPx = max('], [vs, 'vObjPos = aBfMm;']]) {
      assert.equal(count(src, needle), 1, `${needle} appears ${count(src, needle)} times`);
    }
    assert.ok(fs.includes('ldApplic'), 'the relief block is missing - the chain dropped it');
    const at = (src, needle) => { const i = src.indexOf(needle); assert.ok(i >= 0, `${needle} not found`); return i; };
    const skinAt = at(fs, 'if ( uSMOn > 0.5 && uLLOn > 0.5 ) {');
    assert.ok(at(fs, 'gBFContact = smoothstep( 0.82, 0.94') < skinAt, 'the bed finish would undo the skin');
    assert.ok(at(fs, 'if ( uLLOn > 0.5 ) {') < skinAt, 'the layer lines run after the skin');
    assert.ok(at(fs, 'float bandPx = max(') < skinAt, 'the cover edge runs after the skin (both tilt the normal; the chain order puts the edge first)');
    assert.ok(skinAt < at(fs, 'material.diffuseColor = diffuseColor.rgb'), 'the lights read the normal before the skin');
    assert.ok(skinAt < at(fs, 'RE_Direct( directLight'), 'the direct light is gathered before the skin');
    /* the derivatives the LOD needs are taken in the uniform branch, before the per-fragment one */
    assert.ok(at(fs, 'vec2 dqxSM = dFdx( qSM ), dqySM = dFdy( qSM );') < at(fs, 'if ( vSkinId > 0.5 && gBFTop > 0.0 ) {'));
    assert.equal(sh.uniforms.uSMOn, sm.uSMOn, 'the skin uniforms were copied, not shared');
    assert.equal(sh.uniforms.uSMAtlas, sm.uSMAtlas);
    assert.match(m.customProgramCacheKey(), /\|ld\|bf1\|cs1\|sm1$/, 'the cache key does not carry all four patches');
    assert.equal(m.userData.skinMap, true);
  });
}

test('a material without the bed finish is refused, and a lost anchor throws', () => {
  assert.throws(() => SM.applySkinMap(new THREE.MeshStandardMaterial(), { uniforms: SM.createSkinMapUniforms() }), /no bed finish/);
  const bf = BF.createBedFinishUniforms();
  const m = BF.applyBedFinish(new THREE.MeshStandardMaterial(), { axis: [0, 1, 0], uniforms: bf });
  SM.applySkinMap(m, { uniforms: SM.createSkinMapUniforms() });
  const sh = shaderFor('standard');
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', '');
  assert.throws(() => m.onBeforeCompile(sh, null), /skin map: lights_physical_fragment anchor/);
});

/* ── 2. the switch ─────────────────────────────────────────────────────────────────────────── */

test('the switch is a uniform: one program either way, clones share it, and the defaults are the pipeline\'s', () => {
  const sm = SM.createSkinMapUniforms();
  assert.equal(sm.uSMOn.value, 1);
  assert.equal(SM.createSkinMapUniforms({ on: false }).uSMOn.value, 0);
  assert.equal(sm.uSMStrength.value, SM.SKIN_MAP.strength);
  assert.deepEqual([sm.uSMZLo.value, sm.uSMZHi.value], [...SM.SKIN_MAP.zToleranceMm]);
  assert.equal(sm.uSMAtlas.value, null, 'no atlas until a map loads');
  const m = fullMaterial(THREE.MeshStandardMaterial, BF.createBedFinishUniforms(), CS.createCoverSeamUniforms(), sm);
  const key = m.customProgramCacheKey();
  const clone = m.clone();
  for (const k of ['onBeforeCompile', 'customProgramCacheKey']) clone[k] = m[k];
  const sh = shaderFor('standard'); clone.onBeforeCompile(sh, null);
  sm.uSMOn.value = 0;
  assert.equal(sh.uniforms.uSMOn.value, 0, 'the clone did not follow the switch');
  assert.equal(m.customProgramCacheKey(), key, 'the switch changed the program');
  /* the Z tolerance is a layer and a bit: inside one layer accepted, two layers refused */
  assert.ok(SM.SKIN_MAP.zToleranceMm[0] >= 0.2 && SM.SKIN_MAP.zToleranceMm[1] <= 0.5);
});

/* ── 3. the frame and the Z decode ─────────────────────────────────────────────────────────── */

test('⚔ the GLSL frame is skinTangents(): the same two vectors from the same axis, on both sides', () => {
  const m = fullMaterial(THREE.MeshStandardMaterial, BF.createBedFinishUniforms(), CS.createCoverSeamUniforms(), SM.createSkinMapUniforms());
  const sh = shaderFor('standard'); m.onBeforeCompile(sh, null);
  const fs = resolveIncludes(sh.fragmentShader);
  /* the GLSL: t1 = axis x Y, or axis x X when the axis is along Y; t2 = axis x t1 - bed-finish.js's grain frame verbatim */
  assert.ok(fs.includes('vec3 t1SM = normalize( abs( axSM.y ) < 0.9 ? cross( axSM, vec3( 0.0, 1.0, 0.0 ) ) : cross( axSM, vec3( 1.0, 0.0, 0.0 ) ) );'));
  assert.ok(fs.includes('vec3 t2SM = cross( axSM, t1SM );'));
  assert.ok(fs.includes('vec3 u1 = normalize( abs( axPC.y ) < 0.9 ? cross( axPC, vec3( 0.0, 1.0, 0.0 ) ) : cross( axPC, vec3( 1.0, 0.0, 0.0 ) ) );'), 'the grain frame moved - keep the skin frame with it');
  assert.ok(fs.includes('vec2 qSM = vec2( dot( pSM, t1SM ), dot( pSM, t2SM ) );'));
  assert.ok(fs.includes('vec2 pxSM = ( qSM - fSM.xy ) * fSM.z;'));
  /* the JS, evaluated: the same cross products */
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  for (const axis of [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]]) {
    const [t1, t2] = SM.skinTangents(axis);
    const want1 = Math.abs(axis[1]) < 0.9 ? cross(axis, [0, 1, 0]) : cross(axis, [1, 0, 0]);
    assert.deepEqual(t1.map((v) => Math.round(v)), want1, `t1 for axis ${axis}`);
    assert.deepEqual(t2.map((v) => Math.round(v)), cross(axis, t1).map((v) => Math.round(v)), `t2 for axis ${axis}`);
    assert.ok(Math.abs(t1[0] * axis[0] + t1[1] * axis[1] + t1[2] * axis[2]) < 1e-12 && Math.abs(t2[0] * axis[0] + t2[1] * axis[1] + t2[2] * axis[2]) < 1e-12, 'a tangent is not perpendicular to the axis');
  }
  assert.deepEqual(SM.skinTangents([0, 0, 1]).map((v) => v.map(Math.round)), [[-1, 0, 0], [0, -1, 0]], 'the EdgeLabel frame (axis +Z): q = (-x, -y)');
  /* the Z channel: B,A hold the layer in 0.01 mm; the GLSL reads texels as byte / 255 */
  assert.ok(fs.includes('float zmmSM = ( zSM.b * 65280.0 + zSM.a * 255.0 ) * 0.01;'));
  for (const [hi, lo] of [[0, 0], [2, 148], [0, 80], [255, 255]]) {
    const glsl = ((hi / 255) * 65280 + (lo / 255) * 255) * 0.01;
    assert.ok(Math.abs(glsl - (hi * 256 + lo) / 100) < 1e-9, `z decode for bytes ${hi},${lo}`);
  }
  assert.ok(fs.includes('float wZSM = zmmSM > 0.0 ? 1.0 - smoothstep( uSMZLo, uSMZHi, abs( hSM - zmmSM ) ) : 0.0;'), 'the Z gate moved');
  assert.ok(fs.includes('float wSM = gBFTop * wZSM;'), 'the map is no longer weighted to top skins');
});

/* ── 4. the atlas ──────────────────────────────────────────────────────────────────────────── */

test('the packer: the small atlas first at full scale, no overlaps, gutters, a scale only when nothing fits', () => {
  /* the gutter is what keeps a minified map's mipmaps out of its neighbour: two texels at the coarsest useful level */
  assert.ok(SM.SKIN_MAP.gutterPx >= 2, `a ${SM.SKIN_MAP.gutterPx} px gutter lets the mipmaps bleed across maps`);
  const a = SM.packAtlas([{ id: 'a', w: 1413, h: 453 }, { id: 'b', w: 700, h: 450 }, { id: 'c', w: 1000, h: 1000 }]);
  assert.equal(a.size, 2048); assert.equal(a.scale, 1);
  const rects = [...a.rects.values()];
  const g = SM.SKIN_MAP.gutterPx;
  for (const r of rects) assert.ok(r.x >= g && r.y >= g && r.x + r.w + g <= a.size && r.y + r.h + g <= a.size, `rect ${JSON.stringify(r)} leaves the atlas or its gutter`);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const p = rects[i], q = rects[j];
    assert.ok(p.x + p.w + g <= q.x || q.x + q.w + g <= p.x || p.y + p.h + g <= q.y || q.y + q.h + g <= p.y, `rects ${i} and ${j} overlap or touch`);
  }
  assert.deepEqual(a.rects.get('c'), { x: g, y: g, w: 1000, h: 1000 }, 'the tallest map does not open the first shelf at the origin + gutter');
  const b = SM.packAtlas([{ id: 'x', w: 2000, h: 1500 }, { id: 'y', w: 2000, h: 1500 }]);
  assert.equal(b.size, 4096); assert.equal(b.scale, 1);
  const c = SM.packAtlas([{ id: 'x', w: 4000, h: 4000 }, { id: 'y', w: 4000, h: 4000 }]);
  assert.equal(c.size, 4096); assert.ok(c.scale < 1 && c.scale >= SM.SKIN_MAP.minScale, `scale ${c.scale}`);
  const r = c.rects.get('x'); assert.ok(r.w <= 4096 - 2 * g && r.h + c.rects.get('y').h + 4 * g <= 4096 || r.w + c.rects.get('y').w + 4 * g <= 4096);
  assert.equal(SM.packAtlas(Array.from({ length: 40 }, (_, i) => ({ id: i, w: 4000, h: 4000 }))), null, 'an impossible set must say so');
  assert.deepEqual(SM.packAtlas([]), { size: 2048, scale: 1, rects: new Map() });
});

test('resampleMap averages the normal and keeps the nearest layer height', () => {
  const src = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) { src[4 * i] = i * 10; src[4 * i + 1] = 255 - i * 10; src[4 * i + 2] = 1; src[4 * i + 3] = i; }
  const out = SM.resampleMap(src, 4, 4, 2, 2);
  assert.equal(out.length, 16);
  /* top-left 2x2 block: R = mean(0,10,40,50) = 25, G = mean(255,245,215,205) = 230; B,A from the nearest texel (1,1) */
  assert.deepEqual([...out.slice(0, 4)], [25, 230, 1, 5]);
  assert.equal(SM.resampleMap(src, 4, 4, 4, 4), src, 'the same size must return the source itself');
  assert.deepEqual(SM.tableRows({ x: 4, y: 8, w: 100, h: 50 }, { q0: [-88.35, -55.85], pxPerMm: 8 }, 0.5), [[4, 8, 100, 50], [-88.35, -55.85, 4, 0]]);
});

/* ── 5. the codec ──────────────────────────────────────────────────────────────────────────── */

test('the PNG codec round-trips RGBA byte for byte, and refuses what the bake never writes', async () => {
  const w = 37, h = 11, rgba = new Uint8Array(w * h * 4);
  let s = 12345; for (let i = 0; i < rgba.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; rgba[i] = (s >> 8) & 255; }
  const png = SM.encodePng(rgba, w, h, (b) => deflateSync(b, { level: 9 }));
  assert.deepEqual([...png.slice(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const back = await SM.decodePng(png, (b) => inflateSync(b));
  assert.equal(back.width, w); assert.equal(back.height, h);
  assert.deepEqual(back.data, rgba);
  /* a 16-bit PNG (what the browser would flatten) is refused rather than misread */
  const sixteen = Uint8Array.from(png); sixteen[24] = 16;
  await assert.rejects(() => SM.decodePng(sixteen, (b) => inflateSync(b)), /depth 16/);
  await assert.rejects(() => SM.decodePng(new Uint8Array([1, 2, 3]), (b) => inflateSync(b)), /not a PNG/);
});

/* ── 6. a shipped map lands where the model has its skins ──────────────────────────────────── */

const FIX = join(root, 'test', 'fixtures', 'skin');
const fixture = JSON.parse(readFileSync(join(FIX, 'Faceplate_EdgeLabel_2W-1H.json'), 'utf8'));

test('⚔ the EdgeLabel 2W-1H map: every visible skin agrees with the GLB, and a mirrored or turned map does not', async () => {
  const map = await SM.decodePng(readFileSync(join(FIX, fixture.file)), (b) => inflateSync(b));
  assert.deepEqual([map.width, map.height], fixture.size, 'the fixture PNG and its frame disagree on the size');
  assert.equal(fixture.pxPerMm, SM.SKIN_MAP.pxPerMm);
  assert.deepEqual(fixture.axis, [0, 0, 1], 'an EdgeLabel plate prints back-down: it grows along +Z');
  /* its layer heights are the bake's skin layers or nothing */
  const layers = new Set(fixture.skinLayersZ.map((z) => Math.round(z * 100)));
  const seen = new Map();
  for (let i = 0; i < map.data.length; i += 4) { const z = map.data[i + 2] * 256 + map.data[i + 3]; seen.set(z, (seen.get(z) || 0) + 1); }
  for (const z of seen.keys()) assert.ok(z === 0 || layers.has(z), `the map holds a layer height ${z / 100} mm the bake never laid`);
  assert.ok(seen.get(660) > 100000, 'the plate face (z 6.6) is not the map\'s largest skin');
  const glb = await G.readGlbTriangles(join(root, 'parts', '185', 'Faceplate_EdgeLabel_2W-1H.lib.glb'));
  const real = CHK.skinCoverage(glb, fixture.axis, map, fixture);
  assert.ok(real.samples > 50000, `only ${real.samples} samples`);
  assert.ok(real.rate >= 0.85, `the map agrees with the GLB's visible top skins on ${(real.rate * 100).toFixed(1)} % of their area`);
  assert.ok(real.hiddenMm2 > 2000, 'the internal faces under the raised band were not set aside');
  /* the plate's decorated front 4.5 mm above the bed plane and the raised band 2 mm proud of it: nearly all of both */
  for (const h of ['4.5', '6.5']) {
    const g = real.byHeight[h];
    assert.ok(g && g.area > 1500, `no visible skin at ${h} mm`);
    assert.ok(g.agree / g.area >= 0.9, `the skin at ${h} mm agrees on ${(g.agree / g.area * 100).toFixed(1)} % of its area`);
  }
  for (const flip of [[true, false], [false, true], [true, true]]) {
    const ctl = CHK.skinCoverage(glb, fixture.axis, map, fixture, { flip });
    assert.ok(ctl.rate <= real.rate - 0.2, `the map mirrored ${flip} still agrees on ${(ctl.rate * 100).toFixed(1)} % - the check cannot see a frame error`);
  }
});

test('⚔ the label window is empty, the plate around it is skin, and the REMOVE tab lies along the window\'s lower edge', async () => {
  /* the window from the GLB itself: the plate face's samples on a 1 mm grid; the empty cells that are interior (skin
     on every side, 3 mm away) are the window - the grip pockets open to the plate's edge and are not interior */
  const map = await SM.decodePng(readFileSync(join(FIX, fixture.file)), (b) => inflateSync(b));
  const glb = await G.readGlbTriangles(join(root, 'parts', '185', 'Faceplate_EdgeLabel_2W-1H.lib.glb'));
  const axis = fixture.axis, [t1, t2] = SM.skinTangents(axis);
  let hMin = Infinity, hMax = -Infinity;
  for (let i = 0; i < glb.positions.length; i += 3) { const h = glb.positions[i] * axis[0] + glb.positions[i + 1] * axis[1] + glb.positions[i + 2] * axis[2]; hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); }
  const tris = CHK.topTriangles(glb, axis);
  const s = G.surfaceSamples(glb.positions, tris, 0.5);
  const q = (p) => [p[0] * t1[0] + p[1] * t1[1] + p[2] * t1[2], p[0] * t2[0] + p[1] * t2[1] + p[2] * t2[2]];
  /* the plate's front: the top skin with the most area (4.5 mm above the bed plane; the raised band is 2 mm proud) */
  const area = {};
  for (let i = 0; i < s.length; i += 4) { const h = (s[i] * axis[0] + s[i + 1] * axis[1] + s[i + 2] * axis[2] - hMin).toFixed(1); area[h] = (area[h] || 0) + s[i + 3]; }
  const FACE_H = +Object.entries(area).sort((p, q) => q[1] - p[1])[0][0];
  assert.ok(Math.abs(FACE_H - 4.5) < 0.2, `the largest top skin is at ${FACE_H} mm`);
  const cells = new Map(); let qlo = [Infinity, Infinity], qhi = [-Infinity, -Infinity];
  for (let i = 0; i < s.length; i += 4) {
    const p = [s[i], s[i + 1], s[i + 2]];
    const h = p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2] - hMin;
    if (Math.abs(h - FACE_H) > 0.3) continue;
    const qq = q(p);
    qlo = [Math.min(qlo[0], qq[0]), Math.min(qlo[1], qq[1])]; qhi = [Math.max(qhi[0], qq[0]), Math.max(qhi[1], qq[1])];
    cells.set(`${Math.floor(qq[0])},${Math.floor(qq[1])}`, true);
  }
  const filled = (x, y) => cells.has(`${x},${y}`);
  /* the empty regions of the face's bounding box, 4-connected; one that reaches the box's border is a notch or the
     grip (open to an edge), one that does not is a hole; the largest hole is the label window */
  const X0 = Math.floor(qlo[0]), X1 = Math.floor(qhi[0]), Y0 = Math.floor(qlo[1]), Y1 = Math.floor(qhi[1]);
  const seen = new Set();
  const holes = [];
  for (let sx = X0; sx <= X1; sx++) for (let sy = Y0; sy <= Y1; sy++) {
    if (filled(sx, sy) || seen.has(`${sx},${sy}`)) continue;
    const region = [], stack = [[sx, sy]]; let border = false;
    seen.add(`${sx},${sy}`);
    while (stack.length) {
      const [x, y] = stack.pop();
      region.push([x, y]);
      if (x === X0 || x === X1 || y === Y0 || y === Y1) border = true;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < X0 || nx > X1 || ny < Y0 || ny > Y1 || filled(nx, ny) || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`); stack.push([nx, ny]);
      }
    }
    if (!border) holes.push(region);
  }
  holes.sort((p, q) => q.length - p.length);
  assert.ok(holes.length && holes[0].length > 800, `the largest hole in the plate face is ${holes.length ? holes[0].length : 0} cells - the window was not found`);
  const interior = holes[0];
  const wx = interior.map((c) => c[0]), wy = interior.map((c) => c[1]);
  const win = { x0: Math.min(...wx), x1: Math.max(...wx) + 1, y0: Math.min(...wy), y1: Math.max(...wy) + 1 };
  /* the opening in the plate's face: narrower than the 57 x 27 mm label that slides down behind it (vault
     measurements.md), measured here from the GLB on 1 mm cells: 50 x 24 */
  assert.ok(win.x1 - win.x0 >= 46 && win.x1 - win.x0 <= 58, `window width ${win.x1 - win.x0} mm`);
  assert.ok(win.y1 - win.y0 >= 20 && win.y1 - win.y0 <= 30, `window height ${win.y1 - win.y0} mm`);
  const zAt = (qq) => CHK.mapZAt(map, fixture, qq);
  const cx = (win.x0 + win.x1) / 2, cy = (win.y0 + win.y1) / 2;
  assert.equal(zAt([cx, cy]), 0, 'a bead in the middle of the label window');
  /* the plate around the opening is skin: its face at 4.6 mm, or the raised band at 6.6 mm just above the window */
  for (const qq of [[win.x0 - 3, cy], [win.x1 + 3, cy], [cx, win.y0 - 3], [cx, win.y1 + 3]]) {
    assert.ok(Math.abs(zAt(qq) - 4.6) < 0.01 || Math.abs(zAt(qq) - 6.6) < 0.01, `the plate beside the window at ${qq} reads z ${zAt(qq)}`);
  }
  /* the REMOVE tab: a thin top skin spanning the window along its authored -Y edge (q2 = -y for this axis, so the
     HIGHER q2 edge), a layer or two above the bed; nothing of the sort along the +Y edge */
  const along = (y) => { let n = 0, tab = 0; for (let x = win.x0 + 4; x < win.x1 - 4; x += 0.5) { n++; const z = zAt([x, y]); if (z > 0 && z < 3) tab++; } return tab / n; };
  const lower = along(win.y1 - 1.5), upper = along(win.y0 + 1.5);
  assert.ok(lower > 0.5, `the tear-away tab is missing along the window's lower edge (${(lower * 100).toFixed(0)} % of it carries low beads)`);
  assert.ok(upper < 0.1, `low beads along the window's upper edge (${(upper * 100).toFixed(0)} %) - the map is turned`);
  /* the normal's SIGN, end to end (the bake's gradient, the shipping tool's A-transpose, the encoding): the outermost
     perimeter bead's outer flank leans toward the opening, so just inside the plate at the window's left edge the
     normal's q1 component points +q1 (toward the window) and at the right edge -q1; a mirrored or inverted map fails here */
  const nAt = (qq) => { const u = Math.floor((qq[0] - fixture.q0[0]) * fixture.pxPerMm), v = Math.floor((qq[1] - fixture.q0[1]) * fixture.pxPerMm); const o = (v * map.width + u) * 4; return [map.data[o] / 127.5 - 1, map.data[o + 1] / 127.5 - 1]; };
  /* the opening's true edges, from the map: walk out from the centre to the first bead */
  const edge = (dir) => { for (let x = cx; Math.abs(x - cx) < 60; x += 0.05 * dir) if (zAt([x, cy]) > 0) return x; return assert.fail('no bead found beside the window'); };
  /* the mean of the normal's q1 over the bead's outer flank (the first 0.25 mm inside the edge: at 8 px/mm a single
     texel lands differently on the two sides), per row, leaning toward the window */
  const lean = (edgeX, dir, into) => { let n = 0, ok = 0; for (let y = cy - 6; y <= cy + 6; y += 0.5) { let m = 0, k = 0; for (let d = 0; d <= 0.25; d += 0.05) { m += nAt([edgeX + dir * d, y])[0]; k++; } m /= k; n++; if (Math.abs(m) > 0.08 && Math.sign(m) === into) ok++; } return ok / n; };
  const left = lean(edge(-1), -1, +1), right = lean(edge(+1), +1, -1);
  assert.ok(left > 0.6 && right > 0.6, `the perimeter bead's flank does not lean into the window (left ${(left * 100).toFixed(0)} %, right ${(right * 100).toFixed(0)} %): the normal's sign is wrong`);
  assert.ok(hMax - hMin > 24, 'the GLB is not the 24 mm deep EdgeLabel plate');
});

/* ── 6b. the normal's sign on a part whose frame is a quarter turn ───────────────────────── */

/* The outermost perimeter bead's outer flank slopes down and away from the part, so at the top skin's boundary the
   normal leans OUTWARD. The EdgeLabel's frame is a pure sign flip (its own transpose), so a shipping tool that applied
   the frame matrix instead of its transpose would ship that map unchanged; a cover tile's frame is a quarter turn, and
   there the error turns every normal half a turn - inward. Both fixtures, all four edges of the tile. */
const edgeLean = (map, frame, which, dir) => {
  const W = map.width, H = map.height;
  const z = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? 0 : map.data[(j * W + i) * 4 + 2] * 256 + map.data[(j * W + i) * 4 + 3];
  const nrm = (i, j, c) => map.data[(j * W + i) * 4 + c] / 127.5 - 1;
  let lines = 0, ok = 0;
  for (let k = 1; k <= 12; k++) {
    const other = Math.floor((which === 'q1' ? H : W) * k / 13);
    const len = which === 'q1' ? W : H;
    let edge = -1;
    for (let s = 0; s < len; s++) { const idx = dir > 0 ? len - 1 - s : s; if ((which === 'q1' ? z(idx, other) : z(other, idx)) > 0) { edge = idx; break; } }
    if (edge < 0) continue;
    let m = 0;
    for (let d = 0; d < 2; d++) { const idx = edge - dir * d; m += which === 'q1' ? nrm(idx, other, 0) : nrm(other, idx, 1); }
    m /= 2; lines++;
    if (Math.abs(m) > 0.08 && Math.sign(m) === dir) ok++;
  }
  return lines ? ok / lines : 0;
};

for (const [name, edges] of [['Faceplate_EdgeLabel_2W-1H', [['q1', -1], ['q1', 1]]], ['CL-185-1W', [['q1', -1], ['q1', 1], ['q2', -1], ['q2', 1]]]]) {
  test(`⚔ ${name}: the outermost bead leans outward at every edge - the normal's sign survives the frame`, async () => {
    const fx = JSON.parse(readFileSync(join(FIX, name + '.json'), 'utf8'));
    const map = await SM.decodePng(readFileSync(join(FIX, fx.file)), (b) => inflateSync(b));
    assert.deepEqual([map.width, map.height], fx.size);
    for (const [which, dir] of edges) {
      const r = edgeLean(map, fx, which, dir);
      assert.ok(r >= 0.6, `${name} ${which} ${dir > 0 ? '+' : '-'} edge: the outer flank leans outward on ${(r * 100).toFixed(0)} % of the lines`);
    }
  });
}

/* ── 7. main.js, bed-finish.js and the deploy ──────────────────────────────────────────────── */

test('main.js patches every finished material, stamps every template, syncs on the mount and the tier switch; the trial is gone', () => {
  const main = readFileSync(join(root, 'js', 'main.js'), 'utf8');
  assert.match(main, /import \{ SKIN_MAP, createSkinMapUniforms, applySkinMap, packAtlas, resampleMap, decodePng, tableRows \} from '\.\/skin-map\.js';/);
  assert.match(main, /const skinU = createSkinMapUniforms\(\{ on: new URLSearchParams\(location\.search\)\.get\('skinmap'\) !== 'off' \}\);/);
  assert.match(main, /return m\.userData && m\.userData\.bedFinish \? applySkinMap\(m, \{ uniforms: skinU \}\) : m;/);
  assert.equal(count(main, 'applySkinMap('), 1, 'the map is applied somewhere the finish check does not cover');
  assert.equal(count(main, 'skinPatched(key, seamPatched(key, seeIntoPatched(key, newPartMaterial(key))))'), 2, 'a material site builds parts without the map');
  assert.match(main, /skinMaps\.adopt\(node, sceneRoot\);\s*\/\/[^\n]*\n\s*return sceneRoot;\n\}/, 'adoptTemplate does not hand every template to the atlas');
  assert.match(main, /applyQuality\(quality\);\n\s*skinMaps\.sync\(\);/, 'the mount does not sync the maps');
  assert.match(main, /function setQuality\(name, \{ user = false \} = \{\}\) \{\n\s*applyQuality\(name\);\n\s*skinMaps\.sync\(\);/, 'a tier switch does not sync the maps');
  assert.match(main, /skinMap: skinMaps,/, 'the debug hook lost the maps');
  /* the attribute carries the slot PLUS ONE, so a mesh that never got it (it reads 0) draws no map: both sides pinned */
  assert.ok(main.includes('st.slots.set(n, slot); stamp(n, slot + 1); slot++;'), 'the template is not stamped with slot + 1');
  assert.ok(main.includes('for (const n of st.slots.keys()) stamp(n, 0);'), 'a repack does not clear the old slots to 0');
  /* the fetch waits for Very High: the gate reads the tier's accumulator flag, like the settle detail it draws in */
  assert.match(main, /const wanted = \(\) => skinU\.uSMOn\.value > 0\.5 && !!QUALITY\[quality\]\.accum;/);
  /* the atlas's empty space reads flat (R,G 128), or the mipmaps blend a -1 slope into every map's minified edge (Sol 01a174ad) */
  assert.ok(main.includes('new Uint32Array(st.atlasData.buffer).fill(0x00008080);'), 'the atlas is no longer cleared to a flat normal');
  assert.ok(!/skinlines|uSKOn|SKIN_LINES/.test(main), 'the ?skinlines=on trial is still wired');
  const bf = readFileSync(join(root, 'js', 'bed-finish.js'), 'utf8');
  assert.ok(!/SKIN_LINES|uSKOn|SKIN_BLOCK/.test(bf), 'bed-finish.js still carries the trial');
  assert.ok(bf.includes("'float gBFTop = 0.0;'"), 'gBFTop is gone - the skin map reads it');
  assert.ok(!('SKIN_LINES' in BF), 'bed-finish.js still exports SKIN_LINES');
  assert.ok(!('uSKOn' in BF.createBedFinishUniforms()), 'the finish uniforms still carry the trial');
});

test('the deploy stamps the new module, as the module-graph guard demands', () => {
  const yml = readFileSync(join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.ok(yml.includes(`sed -i "s|'./skin-map.js'|'./skin-map.js?v=$V'|" js/main.js`), 'no pages.yml stamping line for js/skin-map.js');
});
