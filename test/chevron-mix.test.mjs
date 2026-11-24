/* THE CHEVRON STRIP COLOURS (2026-11-23, js/chevron-mix.js): the strip table finds every real strip of the faceplates the
   repo carries, a mix never gives two neighbouring strips one colour, every colour shows on a part with room for it, each
   part's strips depend on nothing but the seed and the part, and the slot, F-number and ladder rules. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MeshoptDecoder } from '../vendor/three/addons/libs/meshopt_decoder.module.js';
import {
  FACEPLATE_STRIPS, faceplateRule, stripIdOf, rollPart, hashSeed, stripSlots, stripPalette, fNumbers, filamentsAtOnce,
  stripStep, slotKey, slotOfKey, isSlotKey, MIX_BANDS, MAX_STRIPS, STRIP_KEY,
} from '../js/chevron-mix.js';

/* ---- a lib.glb's FACE zone as part-frame triangles (meshopt + quantized, as the stage's template sees it) ---- */
async function faceOf(path) {
  const buf = new Uint8Array(readFileSync(new URL(path, import.meta.url)));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jl = dv.getUint32(12, true), J = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jl)));
  const BIN = buf.subarray(20 + jl + 8);
  await MeshoptDecoder.ready;
  const views = J.bufferViews.map((bv) => {
    const x = bv.extensions && bv.extensions.EXT_meshopt_compression;
    if (!x) return { data: BIN.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength), stride: bv.byteStride };
    const dst = new Uint8Array(x.count * x.byteStride);
    MeshoptDecoder.decodeGltfBuffer(dst, x.count, x.byteStride, BIN.subarray(x.byteOffset || 0, (x.byteOffset || 0) + x.byteLength), x.mode, x.filter);
    return { data: dst, stride: x.byteStride };
  });
  const GET = { 5120: ['getInt8', 1, 127], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767], 5123: ['getUint16', 2, 65535], 5125: ['getUint32', 4, 0], 5126: ['getFloat32', 4, 0] };
  const acc = (i) => {
    const a = J.accessors[i], v = views[a.bufferView], [get, size, norm] = GET[a.componentType], n = { SCALAR: 1, VEC3: 3 }[a.type];
    const d = new DataView(v.data.buffer, v.data.byteOffset, v.data.byteLength), stride = v.stride || size * n, out = [];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { let x = d[get]((a.byteOffset || 0) + k * stride + c * size, true); if (a.normalized) x = Math.max(x / norm, -1); out.push(x); }
    return out;
  };
  const node = J.nodes.find((nd) => nd.mesh !== undefined);
  assert.ok(!node.rotation && !node.matrix, 'a translate-and-scale node, as the exporter writes');
  const [tx, ty, tz] = node.translation || [0, 0, 0], [sx, sy, sz] = node.scale || [1, 1, 1];
  const pr = J.meshes[node.mesh].primitives.find((p) => J.materials[p.material].name === 'FACE');
  const P = acc(pr.attributes.POSITION), I = acc(pr.indices);
  const V = []; for (let k = 0; k < P.length; k += 3) V.push([P[k] * sx + tx, P[k + 1] * sy + ty, P[k + 2] * sz + tz]);
  const T = []; for (let k = 0; k < I.length; k += 3) T.push([I[k], I[k + 1], I[k + 2]]);
  return { V, T, node: node.name };
}
/* the strips: triangles joined through shared (welded) vertices */
function shells(V, T) {
  const key = (p) => p.map((x) => Math.round(x * 1000)).join(','), weld = new Map(), id = V.map((p) => { const k = key(p); if (!weld.has(k)) weld.set(k, weld.size); return weld.get(k); });
  const up = [...Array(weld.size).keys()], find = (x) => { while (up[x] !== x) x = up[x] = up[up[x]]; return x; };
  for (const [a, b, c] of T) { up[find(id[a])] = find(id[b]); up[find(id[b])] = find(id[c]); }
  const by = new Map(); T.forEach((t, i) => { const r = find(id[t[0]]); if (!by.has(r)) by.set(r, []); by.get(r).push(i); });
  return [...by.values()];
}
const sub = (a, b) => a.map((x, i) => x - b[i]), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

for (const [path, size] of [['../kits/tabletop-185/parts/Faceplate_Chevron_1W-1H.lib.glb', '1W-1H'], ['../kits/tabletop-185-3w/parts/Faceplate_Chevron_2W-1H.lib.glb', '2W-1H']]) {
  test(`the table's rule gives every triangle of each of the ${size} faceplate's strips one label, a different one per strip`, async () => {
    const { V, T, node } = await faceOf(path);
    const rule = faceplateRule(node);
    assert.ok(rule, `${node} has a rule`);
    const strips = shells(V, T);
    assert.equal(strips.length, FACEPLATE_STRIPS[size].strips, 'one shell per strip, as many as the table says');
    const labels = strips.map((tris) => new Set(tris.map((i) => {
      const [a, b, c] = T[i].map((v) => V[v]), nrm = cross(sub(b, a), sub(c, a)), len = Math.hypot(...nrm) || 1;
      const p = [0, 1, 2].map((q) => (a[q] + b[q] + c[q]) / 3 - 0.3 * nrm[q] / len);   // 0.3 mm inside, as stampStrips samples
      return stripIdOf(p[0], p[1], rule);
    })));
    assert.deepEqual(labels.filter((s) => s.size !== 1).length, 0, 'no strip with two labels');
    assert.equal(new Set(labels.map((s) => [...s][0])).size, strips.length, 'no two strips share a label');
  });
}

test('the table holds all 18 faceplate sizes, 10 strips on the 1W-05H up to 42 on the 4W-2H, and only Chevron faceplates have a rule', () => {
  assert.equal(Object.keys(FACEPLATE_STRIPS).length, 18);
  assert.equal(FACEPLATE_STRIPS['1W-05H'].strips, 10);
  assert.equal(FACEPLATE_STRIPS['4W-2H'].strips, 42);
  for (const r of Object.values(FACEPLATE_STRIPS)) { assert.ok(Math.abs(r.pitch - 7 * Math.SQRT2) < 0.01, 'the pitch is 14 mm along x'); assert.ok(r.strips % 2 === 0, 'mirrored: as many strips each side'); }
  assert.equal(faceplateRule('Faceplate_Essential_1W-1H'), null);
  assert.equal(faceplateRule('Faceplate_Chevron_5W-1H'), null);
  assert.equal(faceplateRule('Door_Chevron_1W-1H'), null, 'a door carries its own rule');
});

/* ---- the roll ---- */
const ROWS = 4, table = () => new Uint8Array(MIX_BANDS * 2 * ROWS);
const window1W05 = { left: [30, 31, 32, 33, 34], right: [30, 31, 32, 33, 34] };   // 10 strips, 5 a side
const windowDoorRH = { left: [31, 32, 33], right: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34] };   // an off-centre seam: few strips on one side
test('neighbouring strips along a side never match, nor (3+ colours) the two meeting at the seam, for every count', () => {
  for (let k = 2; k <= MAX_STRIPS; k++) for (let seed = 1; seed <= 40; seed++) {
    const t = rollPart(table(), 1, k, hashSeed(seed, 'f1'), window1W05);
    const L = 2 * MIX_BANDS, R = 3 * MIX_BANDS;
    for (let b = 0; b < MIX_BANDS; b++) {
      assert.ok(t[L + b] < k && t[R + b] < k);
      if (b) { assert.notEqual(t[L + b], t[L + b - 1], `k ${k} seed ${seed} left ${b}`); assert.notEqual(t[R + b], t[R + b - 1], `k ${k} seed ${seed} right ${b}`); }
      if (k >= 3) assert.notEqual(t[R + b], t[L + b], `k ${k} seed ${seed} seam ${b}`);
    }
  }
});
test('every colour shows on a part with at least that many strips: all 9 on the smallest faceplate and on a right-hinged door', () => {
  for (const [name, w] of [['1W-05H', window1W05], ['door', windowDoorRH]]) for (let k = 2; k <= MAX_STRIPS; k++) {
    let missed = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const t = rollPart(table(), 0, k, hashSeed(seed, 'f9'), w);
      const seen = new Set([...w.left.map((b) => t[b]), ...w.right.map((b) => t[MIX_BANDS + b])]);
      if (seen.size < k) missed++;
    }
    assert.equal(missed, 0, `${name}, ${k} colours: a roll left a colour out`);
  }
});
test('a part\'s strips come from the seed and the part alone: its row, and every other part, change nothing; a new seed changes them', () => {
  const a = rollPart(table(), 0, 4, hashSeed(7, 'f3'), window1W05).slice(0, 2 * MIX_BANDS);
  const t = table(); rollPart(t, 1, 4, hashSeed(7, 'f1'), window1W05); rollPart(t, 3, 4, hashSeed(7, 'f3'), window1W05); rollPart(t, 2, 5, hashSeed(7, 'd9'), windowDoorRH);
  assert.deepEqual(t.slice(6 * MIX_BANDS, 8 * MIX_BANDS), a, 'the same strips in another row, beside other parts');
  assert.notDeepEqual(rollPart(table(), 0, 4, hashSeed(8, 'f3'), window1W05).slice(0, 2 * MIX_BANDS), a, 'Shuffle changes them');
  assert.notEqual(hashSeed(7, 'f3'), hashSeed(7, 'f4'));
  const rows = new Set(); for (let u = 1; u <= 70; u++) rows.add(hashSeed(7, 'f' + u)); assert.equal(rows.size, 70, '70 parts, 70 seeds');
  assert.ok(rollPart(table(), 0, 1, 5, window1W05).every((c) => c === 0), 'one colour: every strip');
});

/* ---- the colours ---- */
const F = (name, hex) => ({ name, hex });
const algae = F('Prusament rPLA Algae', '#674B41'), corn = F('Prusament rPLA Corn', '#B37B46'), wine = F('Prusament rPLA Wine', '#5E493F'), black = F('Panchroma Black', '#2b2b2e');
test('the slot keys: strip colour 1 is the FACE key, 2..9 its "/n" keys; nothing past 9 and nothing after a gap is read', () => {
  assert.equal(slotKey(1), STRIP_KEY); assert.equal(slotKey(4), 'Faceplate:FACE/4');
  assert.equal(slotOfKey('Faceplate:FACE'), 1); assert.equal(slotOfKey('Faceplate:FACE/9'), 9); assert.equal(slotOfKey('Faceplate:FACE/10'), 0); assert.equal(slotOfKey('Faceplate'), 0);
  assert.ok(isSlotKey('Faceplate:FACE/2') && !isSlotKey('Faceplate:FACE'));
  const colors = { [STRIP_KEY]: algae, 'Faceplate:FACE/2': corn, 'Faceplate:FACE/3': wine, 'Faceplate:FACE/5': black, 'Faceplate:FACE/10': black };
  assert.deepEqual(stripSlots(colors), [algae, corn, wine], 'stops at the gap at 4');
  assert.deepEqual(stripSlots({}), [null], 'an unpicked strip colour 1');
});
test('k counts each filament once, and a duplicate slot takes the same palette index', () => {
  const p = stripPalette([algae, corn, algae, wine]);
  assert.equal(p.k, 3); assert.deepEqual(p.idx, [0, 1, 0, 2]); assert.deepEqual(p.hexes, ['#674B41', '#B37B46', '#5E493F']);
  assert.equal(stripPalette([null, corn], F('', '#ff8800')).hexes[0], '#ff8800', 'slot 1 unpicked draws the colour it shows');
});
test('F numbers: the backer is F1, the strips F2 on by distinct filament, a strip in the backer\'s filament F1; as many numbers as filaments at once', () => {
  const slots = [algae, corn, black, wine, corn];
  assert.deepEqual(fNumbers(slots, black), [2, 3, 1, 4, 3]);
  assert.equal(new Set([1, ...fNumbers(slots, black)]).size, filamentsAtOnce(slots, black));
  assert.equal(filamentsAtOnce([algae, corn, F('Prusament rPLA Risotto', '#CCC9BF'), wine, black], black), 5, 'the Coffee palette: 5 filaments at once');
});
test('the ladder\'s step is read from the colours: two or more strip colours a mix, a backer in strip colour 1 one colour, else two-tone', () => {
  assert.equal(stripStep([algae, corn], black), 'mix');
  assert.equal(stripStep([black], black), 'one');
  assert.equal(stripStep([algae], black), 'two');
});

/* ---- the strip palettes (js/chevron-mix.js STRIP_PALETTES) ---- */
test('every strip palette names real catalog filaments, 2 to 9 strips, no two colours look alike but Coffee\'s Algae and Wine', async () => {
  const { STRIP_PALETTES } = await import('../js/chevron-mix.js');
  const { FILAMENT_DB } = await import('../js/filament-db.js');
  const { dE } = await import('../js/colors/colour.js');
  const by = new Map(FILAMENT_DB.flatMap((b) => b.colors.map((c) => [c.label, c])));
  const ACCEPTED = new Set(['Prusament rPLA Algae|Prusament rPLA Wine']);   // Prusa's own hexes, 3.2 apart (decisions.md, rPLA)
  assert.ok(STRIP_PALETTES.length >= 9, 'Coffee, Teal & orange, rPLA and the six themed sets');
  assert.equal(new Set(STRIP_PALETTES.map((p) => p.id)).size, STRIP_PALETTES.length, 'ids unique');
  for (const p of STRIP_PALETTES) {
    assert.ok(p.strips.length >= 2 && p.strips.length <= MAX_STRIPS, `${p.name}: 2 to 9 strips`);
    for (const l of [...p.strips, ...(p.backer ? [p.backer] : [])]) { assert.ok(by.has(l), `${p.name}: ${l} is not in the catalog`); assert.match(by.get(l).url, /^https:\/\//, `${p.name}: ${l} has a buy link`); }
    assert.equal(new Set(p.strips).size, p.strips.length, `${p.name}: no strip twice`);
    for (let i = 0; i < p.strips.length; i++) for (let j = i + 1; j < p.strips.length; j++) {
      const pair = [p.strips[i], p.strips[j]].sort().join('|');
      if (!ACCEPTED.has(pair)) assert.ok(dE(by.get(p.strips[i]).hex, by.get(p.strips[j]).hex) >= 10, `${p.name}: ${pair} look alike`);
    }
  }
});

test('every popular combo keeps its Coolors source: one strip per source colour, each within CIEDE2000 12 of it', async () => {
  const { STRIP_PALETTES } = await import('../js/chevron-mix.js');
  const { FILAMENT_DB } = await import('../js/filament-db.js');
  const { dE } = await import('../js/colors/colour.js');
  const by = new Map(FILAMENT_DB.flatMap((b) => b.colors.map((c) => [c.label, c])));
  const popular = STRIP_PALETTES.filter((p) => p.group === 'popular');
  assert.ok(popular.length >= 12, 'a dozen or more');
  for (const p of popular) {
    const src = p.src.split('-').map((h) => '#' + h);
    assert.equal(src.length, p.strips.length, `${p.name}: one strip per source colour`);
    p.strips.forEach((l, i) => assert.ok(dE(src[i], by.get(l).hex) < 12, `${p.name}: ${l} is ${dE(src[i], by.get(l).hex).toFixed(1)} from ${src[i]}`));
    assert.equal(p.backer, undefined, `${p.name}: the build keeps its own backer`);
  }
});
