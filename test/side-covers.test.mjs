/* SIDE COVERS ON THE STAGE (v2609, 2026-10-17): the 3D stage draws exactly the side covers the parts list bills.
 *
 * The bill is the merged planner's own (js/rules/bom.js: a unit takes a cover on a side that lies on its column run's
 * outer edge, at the unit's own height). The generator decides the same thing again from its own normalised units, so
 * the two are held together here, per height, on the official kits, on hand-made edge cases and on seeded random builds
 * of every mount. Then the placement and the step mechanics: each cover at the release handoff's offsets from its case,
 * each fitted in exactly one step, and every step leaving it exactly where a jump to that step puts it (the net of its
 * `at`, its moves and its stage is zero), because prev/jump rebuilds the scene from after-states, not from the tween.
 *
 * Pure node, like the BOM tests: the catalog is the vendored classic script run in a vm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';
import { worldExtents } from './lib/glb-spans.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { generateManifest, buildAxisForType } = await import(pathToFileURL(join(root, 'js', 'generate.js')).href);
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);

const LENGTHS = [59, 115, 165, 185, 240, 270];
const H_TOKEN = { 1: '05', 2: '1', 3: '15', 4: '2', 6: '3' };   // half-rows -> the file-name height token
const modelled = (L, hh) => (L === 59 ? [1, 2] : [1, 2, 3, 4, 6]).includes(hh);

/* the bill's side covers by height in half-rows, from the planner's row names ("GEN2 185 Side Cover - 1.5H") */
function billed(b) {
  const out = {};
  for (const r of bomRows(computeBom(b, GEN2) || [], null)) {
    const m = /^GEN2 (\d+) Side Cover - ([\d.]+)H$/.exec(r.name);
    if (m) out[Math.round(+m[2] * 2)] = (out[Math.round(+m[2] * 2)] || 0) + r.qty;
  }
  return out;
}
/* the stage's, by height in half-rows, from the node names ("SideCover_185-15H") */
function drawn(manifest) {
  const out = {};
  for (const i of manifest.instances) {
    const m = /^SideCover_(\d+)-(\w+)H$/.exec(i.node);
    if (!m) continue;
    const hh = +Object.keys(H_TOKEN).find((k) => H_TOKEN[k] === m[2]);
    out[hh] = (out[hh] || 0) + 1;
  }
  return out;
}
const sanitized = (b) => { const c = JSON.parse(JSON.stringify(b)); sanitizeBuild(c, GEN2); return c; };

/* the comparison every build below goes through: the drawn count per height is the billed count wherever a model
   exists, nothing is drawn where none does, and a billed size with no model is said in the warnings */
function holdsToTheBill(name, raw) {
  const b = sanitized(raw);
  const g = generateManifest(b);
  assert.ok(g.manifest, `${name}: ${(g.errors || []).join('; ')}`);
  const want = billed(b), got = drawn(g.manifest);
  for (const hh of new Set([...Object.keys(want), ...Object.keys(got)].map(Number))) {
    if (modelled(b.length, hh)) assert.equal(got[hh] || 0, want[hh] || 0, `${name}: ${hh / 2}H side covers drawn ${got[hh] || 0}, billed ${want[hh] || 0}`);
    else {
      assert.equal(got[hh] || 0, 0, `${name}: drew a ${hh / 2}H side cover, a size nothing models`);
      assert.ok(g.warnings.some((w) => /Side covers stop at/.test(w)), `${name}: the bill counts ${hh / 2}H side covers nobody can print, and the stage does not say so`);
    }
  }
  return { b, g };
}

const unit = (id, x, y, w, hh, fill = 'decor', o = {}) => ({ id, x, y, w, hh, fill, shelves: 0, closure: 'none', ...o });
const rec = (o) => ({ mount: 'tabletop', length: 185, faceStyle: 'classic', handleStyle: 'deco', wallStagger: false, backCover: false,
  feet: 'tpu', removedStoppers: [], gridW: 8, gridH: 6, nextId: 50, ...o });

const kitIds = JSON.parse(readFileSync(join(root, 'builds', 'index.json'), 'utf8')).map((r) => r.id);
const kitBuild = (id) => JSON.parse(readFileSync(join(root, 'builds', id + '.json'), 'utf8')).build;

test('the official kits: four 1H covers each, as the decision says, and as the bill counts', () => {
  assert.ok(kitIds.length >= 10, 'the kit index lost its kits');
  for (const f of kitIds) {
    const kit = { build: kitBuild(f) };
    const { g } = holdsToTheBill(f, kit.build);
    /* decisions.md "Side covers" (Joey 2026-10-09): the five Tabletop Starter Kits carry 4 x 1H covers, two rows of 1H
       cases with one cover at each end of each row */
    assert.deepEqual(drawn(g.manifest), { 2: 4 }, `${f}: expected four 1H side covers`);
  }
});

test('edge cases the rule has to get right, on every mount', () => {
  const cases = {
    // a gap: two sections, each with its own two ends (bom.js since 2026-10-16)
    'tabletop gap': rec({ placed: [unit(1, 0, 10, 2, 2), unit(2, 2, 10, 1, 2), unit(3, 5, 10, 1, 2), unit(4, 6, 10, 1, 2)] }),
    // an upper unit inset from both edges takes none, although its end walls show (rules.md)
    'tabletop inset upper': rec({ placed: [unit(1, 0, 10, 3, 2), unit(2, 1, 8, 1, 2)] }),
    // a lone bottom case takes the feet directly; its covers go on once it is set down
    'tabletop base case': rec({ placed: [unit(1, 0, 10, 2, 2), unit(2, 0, 8, 1, 2)] }),
    // mixed heights at the ends: each cover at its own unit's height
    'tabletop mixed heights': rec({ placed: [unit(1, 0, 9, 1, 3), unit(2, 1, 8, 2, 4), unit(3, 3, 11, 1, 1)] }),
    // shelves: one cover at the shelf's own height, and above 3H none (the bill's size is not made)
    'tabletop shelves': rec({ placed: [unit(1, 0, 4, 1, 8, 'shelf'), unit(2, 1, 8, 1, 4, 'shelf', { lip: 'front' }), unit(3, 2, 6, 1, 6, 'shelf')] }),
    'wall': rec({ mount: 'wall', placed: [unit(1, 0, 0, 2, 2), unit(2, 2, 0, 1, 2), unit(3, 0, 2, 1, 2), unit(4, 1, 2, 2, 2)], gridH: 2 }),
    'wall staggered': rec({ mount: 'wall', wallStagger: true, placed: [unit(1, 0, 0, 1, 2), unit(2, 1, 0, 2, 2), unit(3, 0, 2, 3, 2)], gridH: 2 }),
    'wall shelf': rec({ mount: 'wall', placed: [unit(1, 0, 0, 1, 4, 'shelf'), unit(2, 1, 0, 1, 4)], gridH: 2 }),
    'under-table': rec({ mount: 'under-table', placed: [unit(1, 0, 0, 2, 2), unit(2, 2, 0, 1, 2), unit(3, 0, 2, 3, 2, 'decor', { closure: 'magnet' })], gridH: 2 }),
    '59 wall': rec({ mount: 'wall', length: 59, placed: [unit(1, 0, 0, 2, 2), unit(2, 0, 2, 1, 1), unit(3, 1, 2, 1, 1)], gridH: 2 }),
    '59 wall tall shelf': rec({ mount: 'wall', length: 59, placed: [unit(1, 0, 0, 1, 4, 'shelf'), unit(2, 1, 0, 1, 4, 'shelf')], gridH: 2 }),
  };
  for (const [name, b] of Object.entries(cases)) holdsToTheBill(name, b);
  // and the counts themselves, so a matched pair of wrong answers still fails
  const count = (name) => Object.values(drawn(holdsToTheBill(name, cases[name]).g.manifest)).reduce((a, n) => a + n, 0);
  assert.equal(count('tabletop gap'), 4, 'two sections, four ends');
  assert.equal(count('tabletop inset upper'), 2, 'the inset 1W on top takes none');
  assert.equal(count('tabletop shelves'), 1, 'the 3H shelf at the right end takes one; the 4H at the left end has no size to take');
  assert.equal(count('59 wall tall shelf'), 0, 'a 2H 59 shelf has no cover to draw');
});

/* seeded random builds of every mount and length: towers of units side by side, a gap now and then on a tabletop, a
   flat top on the hanging mounts (they must have one), drawers and shelves */
function mulberry(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randomBuild(seed) {
  const r = mulberry(seed), pick = (a) => a[Math.floor(r() * a.length)];
  const length = pick(LENGTHS);
  const mount = length === 59 ? pick(['wall', 'under-table']) : pick(['tabletop', 'tabletop', 'wall', 'under-table']);
  const hangs = mount !== 'tabletop';
  const maxW = length === 59 ? 2 : 4;
  const drawerHH = length === 59 ? [1, 2] : [1, 2, 3, 4];
  const flat = pick([2, 4, 6]);                     // a hanging build's height, half-rows
  const placed = []; let x = 0, id = 1;
  const towers = 1 + Math.floor(r() * 4);
  for (let t = 0; t < towers; t++) {
    const w = 1 + Math.floor(r() * maxW);
    if (x + w > 12) break;                          // the planner's grid is 12 wide at most (GRID_LIMITS)
    const height = hangs ? flat : pick([2, 4, 6]);
    let used = 0;
    while (used < height) {
      const room = height - used;
      const shelf = r() < 0.25 && room >= 2;
      const hh = shelf ? 2 * (1 + Math.floor(r() * Math.min(4, Math.floor(room / 2)))) : pick(drawerHH.filter((h) => h <= room));
      placed.push(unit(id++, x, 12 - used - hh, w, hh, shelf ? 'shelf' : 'decor', shelf ? {} : { closure: r() < 0.3 ? 'magnet' : 'none' }));
      used += hh;
    }
    x += w + (!hangs && r() < 0.2 ? 1 + Math.floor(r() * 2) : 0);   // a gap makes two tabletop sections
  }
  return rec({ mount, length, placed, gridH: 6, gridW: Math.max(...placed.map((p) => p.x + p.w)),
    wallStagger: mount === 'wall' && r() < 0.3, faceStyle: pick(['classic', 'essential', 'edgelabel']) });
}

test('400 seeded random builds: the stage draws the bill\'s side covers, size for size', () => {
  let generated = 0, covers = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const b = sanitized(randomBuild(seed));
    const g = generateManifest(b);
    if (!g.manifest) continue;   // a layout the generator refuses (a cabinet, a floating unit) draws nothing at all
    generated++;
    holdsToTheBill(`seed ${seed}`, b);
    covers += Object.values(drawn(g.manifest)).reduce((a, n) => a + n, 0);
  }
  assert.ok(generated > 300, `only ${generated} of 400 random builds generated - the fixture stopped making real layouts`);
  assert.ok(covers > 600, `only ${covers} covers across the sweep - the fixture is not exercising them`);
});

test('each cover sits at the release offsets from its own case, and its GLB exists', () => {
  for (const name of ['tabletop', 'wall', 'under-table']) {
    const b = sanitized(rec({ mount: name, placed: [unit(1, 0, 8, 2, 4), unit(2, 2, 8, 1, 4), unit(3, 0, 6, 3, 2)], gridH: 6 }));
    const m = generateManifest(b).manifest;
    for (const sc of m.instances.filter((i) => i.node.startsWith('SideCover_'))) {
      const right = sc.yaw === 180;
      const ui = +/^sc(\d+)[LR]$/.exec(sc.id)[1];
      const box = m.instances.find((i) => i.id === `case${ui}`);
      const caseW = +/-(\d)W-/.exec(box.node)[1] * 88;
      // measurements.md "Side covers (v2609)": [-(W*44) + 0.025, 0.4, +4.0], the right one mirrored and turned 180
      assert.ok(Math.abs(sc.pos[0] - (box.pos[0] + (right ? 1 : -1) * (caseW / 2 - 0.025))) < 1e-9, `${name} ${sc.id}: x`);
      assert.ok(Math.abs(sc.pos[1] - (box.pos[1] + 0.4)) < 1e-9, `${name} ${sc.id}: y`);
      assert.equal(sc.pos[2], 4, `${name} ${sc.id}: z`);
      assert.equal(sc.id.endsWith('R'), right, `${name} ${sc.id}: a right cover is the one turned`);
      assert.ok(existsSync(join(root, 'parts', String(b.length), sc.node + '.lib.glb')), `${sc.node}.lib.glb is not in the part pool`);
    }
  }
});

/* ---- the steps: each cover fitted once, and every step ending where a jump to it puts the cover ---------------- */
function stepsHoldTheirCovers(name, manifest) {
  const covers = manifest.instances.filter((i) => i.node.startsWith('SideCover_'));
  const add = (a, d) => a.map((v, k) => v + (d[k] || 0));
  const near = (a, b) => a.every((v, k) => Math.abs(v - b[k]) < 1e-6);
  for (const sc of covers) {
    const stage = sc.stage ? manifest.stages[sc.stage] : null;
    let pos = null, settled = !stage, entered = 0;
    manifest.steps.forEach((s, k) => {
      for (const ph of s.phases || []) {
        const e = (ph.enter || []).find((x) => x.id === sc.id);
        if (e) { entered++; pos = add(settled ? sc.pos : add(sc.pos, stage), e.at || [0, 0, 0]); }
        for (const mv of (ph.move || []).filter((x) => x.id === sc.id)) pos = add(pos, mv.by);
        if ((ph.settle && ph.settle === sc.stage) || (ph.land && ph.land === sc.stage)) { settled = true; if (pos) pos = sc.pos.slice(); }
      }
      if (pos) {
        const jump = settled ? sc.pos : add(sc.pos, stage);   // where applyState puts it after this step
        assert.ok(near(pos, jump), `${name}: ${sc.id} ends step ${k} ("${s.title}") at ${pos.map((v) => v.toFixed(2))}, a jump puts it at ${jump.map((v) => v.toFixed(2))}`);
      }
    });
    assert.equal(entered, 1, `${name}: ${sc.id} is fitted in ${entered} steps`);
    assert.ok(settled, `${name}: ${sc.id} is left on its bench stage`);
  }
  return covers.length;
}

test('every cover is fitted in one step, and each step leaves it where a jump to that step puts it', () => {
  let n = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const g = generateManifest(sanitized(randomBuild(seed)));
    if (g.manifest && !g.manifest.incomplete) n += stepsHoldTheirCovers(`seed ${seed}`, g.manifest);
  }
  for (const id of kitIds) n += stepsHoldTheirCovers(id, generateManifest(kitBuild(id)).manifest);
  assert.ok(n > 500, `only ${n} covers stepped through`);
});

test('a fitted cover goes in off the wall, held 3.8 mm up, then slides down with a detent', () => {
  const m = generateManifest(sanitized(rec({ placed: [unit(1, 0, 10, 1, 2), unit(2, 1, 10, 1, 2)] }))).manifest;
  const step = m.steps.find((s) => (s.phases || []).some((ph) => (ph.enter || []).some((e) => e.id === 'sc0L')));
  const i = step.phases.findIndex((ph) => (ph.enter || []).some((e) => e.id === 'sc0L'));
  const enter = step.phases[i].enter[0], slide = step.phases[i + 1].move[0];
  assert.deepEqual(enter.at, [0, 3.8, 0], 'it arrives 3.8 mm above its seat');
  assert.deepEqual(enter.from, [-30, 0, 0], 'from 30 mm out along its own outward axis (left: -X)');
  assert.deepEqual(slide.by, [0, -3.8, 0], 'then straight down to lock');
  assert.equal(slide.ease, 'detent');
  assert.ok(step.phases[i - 1].camera && step.phases[i - 1].camera.t < 0, 'framed from its own (left) side first');
  const right = m.steps.flatMap((s) => s.phases || []).flatMap((ph) => ph.enter || []).find((e) => e.id === 'sc1R');
  assert.deepEqual(right.from, [30, 0, 0], 'a right cover comes in from +X');
  assert.match(step.note, /hold it against the outer wall just above its seat, press it in so the clips enter the slots, then slide it down to lock/);
});

test('a side cover prints face-down: its build axis is its thickness, face first', () => {
  /* the release's print notes: face-down, no supports; the GLB's face is authored toward -X, so the part grows along +X */
  assert.deepEqual(buildAxisForType('SideCover'), [1, 0, 0]);
  for (const L of LENGTHS) for (const hh of (L === 59 ? [1, 2] : [1, 2, 3, 4, 6])) {
    const { lo, hi } = worldExtents(join(root, 'parts', String(L), `SideCover_${L}-${H_TOKEN[hh]}H.lib.glb`));
    const [x, y, z] = hi.map((v, k) => v - lo[k]);   // unrounded: worldSpans keeps one decimal, and 5.05 is the point
    assert.ok(Math.abs(x - 5.05) < 0.02 && x < y && x < z, `SideCover_${L}-${H_TOKEN[hh]}H spans ${[x, y, z]} - X is not its 5.05 mm thickness`);
    assert.ok(Math.abs(y - (hh * 28 - 0.4)) < 0.02, `SideCover_${L}-${H_TOKEN[hh]}H is ${y} tall, the release says ${hh * 28 - 0.4}`);
    assert.ok(Math.abs(z - (L - 8)) < 0.02, `SideCover_${L}-${H_TOKEN[hh]}H is ${z} long, the release says ${L - 8}`);
  }
});
