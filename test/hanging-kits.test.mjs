/* The hanging starter kits (2026-10-30, Joey: wall and under-table kits, "higher density on top"). What the goldens in
   official-builds.test.mjs cannot say: the shape he asked for, that the record is what the planner would settle it to, and
   that the BOM bills what the site's kit pages tell a buyer. The pages themselves are the site's (its test/builds.test.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, loadCatalog, readKit } from './parity/lib.mjs';
import { computeBom } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';
import { layoutRules } from '../js/rules/layout.js';
import { settleToward } from '../js/rules/settle.js';
import { generateManifest, migrateOfficialBuild } from '../js/generate.js';

const { GEN2, GEN2_TABLETOP } = loadCatalog();
const index = JSON.parse(readFileSync(join(root, 'builds', 'index.json'), 'utf8'));
const hanging = index.filter((k) => k.mount !== 'tabletop');
const SCREWS = { wall: { '2w2h': 4, '3w2h': 6 }, 'under-table': { '2w2h': 6, '3w2h': 10 } };
const MAGNETS = { '2w2h': 6, '3w2h': 10 };
const shapeOf = (id) => id.slice(-4);
const clone = (v) => JSON.parse(JSON.stringify(v));
const items = (rec) => { const d = clone(rec); sanitizeBuild(d, GEN2); return computeBom(d, GEN2).flatMap((s) => s.items); };
const qty = (list, re) => list.filter((i) => re.test(i.name)).reduce((a, i) => a + i.qty, 0);

test('the set: every depth, wall and under-table, both shapes', () => {
  const want = [59, 115, 165, 185, 240, 270].flatMap((l) => ['wall', 'undertable'].flatMap((m) => ['2w2h', '3w2h'].map((s) => `${l}-${m}-${s}`)));
  assert.deepEqual(hanging.map((k) => k.id).sort(), want.sort());
});

for (const row of hanging) {
  test(`${row.id}: the shape, the record and the index row agree`, () => {
    const kit = readKit(`${row.id}.json`);
    assert.equal(kit.title, row.title);
    assert.equal(kit.tagline, row.tagline);
    assert.doesNotMatch(kit.title + kit.tagline, /GEN2/, 'a new kit carries no old name');
    assert.equal(kit.build.mount, row.mount);
    assert.equal(kit.build.length, row.length);
    assert.equal(kit.build.placed.length, row.units);
    assert.equal(row.drawers, row.units, 'every unit in a starter kit is a drawer');
    // the width without the optional side covers, as the tabletop kits state theirs: the site lists them outside the kit
    assert.match(row.dims, new RegExp(`^${shapeOf(row.id) === '2w2h' ? 176 : 264} × \\d+ × \\d+ mm$`));
    // narrow on top: the top row is all 1W, and what hangs below is the shape Joey approved
    const rows = [...new Set(kit.build.placed.map((u) => u.y))].sort((a, b) => a - b);
    assert.equal(rows.length, 2, 'two rows');
    const [top, below] = rows;
    const widths = (y) => kit.build.placed.filter((u) => u.y === y).sort((a, b) => a.x - b.x).map((u) => u.w);
    assert.deepEqual(widths(top), shapeOf(row.id) === '2w2h' ? [1, 1] : [1, 1, 1]);
    assert.deepEqual(widths(below), shapeOf(row.id) === '2w2h' ? [2] : [2, 1]);
  });

  test(`${row.id}: the planner would leave the record where it is`, () => {
    const d = clone(readKit(`${row.id}.json`).build);
    assert.equal(sanitizeBuild(d, GEN2), 0, 'nothing dropped');
    const s = { ...d, fill: 'decor', selected: { w: 1, h: 1 }, selectedUnit: null };
    const Rs = layoutRules(s, GEN2, { tabletop: GEN2_TABLETOP });
    assert.equal(settleToward(s, Rs).size, 0, 'no unit moves when it settles toward the mount');
    assert.equal(Rs.unsupportedUnits().length, 0);
    assert.equal(Rs.instructionsBlockReason(), null);
    const gen = generateManifest(migrateOfficialBuild(readKit(`${row.id}.json`).build, 1));
    assert.ok(gen.manifest, (gen.errors || []).join('; '));
    assert.deepEqual(gen.warnings, [], 'an official kit carries no warning');
  });

  test(`${row.id}: the BOM bills what the kit page tells a buyer`, () => {
    const list = items(readKit(`${row.id}.json`).build), s = shapeOf(row.id);
    assert.equal(qty(list, /wood screw/i), SCREWS[row.mount][s]);
    assert.equal(qty(list, /^Magnets/), MAGNETS[s]);
    assert.equal(qty(list, /foot|feet/i), 0, 'a hanging kit has no foot rails or feet');
    assert.equal(qty(list, row.mount === 'wall' ? /Wall Mount Kit/ : /Under Table Rails/), row.mount === 'under-table' && s === '3w2h' ? 2 : 1);
  });
}

/* Joey, 2026-10-31: "it looks like the kits use 3W under table rail, that requires a larger printer than most people have, i
   think it would be best to use at at most a 2W". A 3W rail is 264 mm in every depth, which is off every 256 mm bed. */
for (const row of hanging.filter((k) => k.mount === 'under-table')) {
  test(`${row.id}: no rail wider than 2W, in the bill and in the model`, () => {
    const kit = readKit(`${row.id}.json`).build;
    assert.equal(kit.railMaxW, 2);
    const want = shapeOf(row.id) === '3w2h' ? ['1W section', '2W section'] : ['2W section'];
    const rails = (rec) => items(rec).filter((i) => /Under Table Rails/.test(i.name)).map((i) => i.variant).sort();
    assert.deepEqual(rails(kit), want, 'the bill');
    assert.deepEqual(rails({ ...kit, printer: 'xl' }), want, 'a 360 mm bed does not lift it: the kit stays the kit its page describes');
    const re = new RegExp(`^UnderTableRail_${row.length}-(\\d)W$`);
    const drawn = (rec, opts) => generateManifest(rec, opts).manifest.instances.filter((i) => re.test(i.node)).map((i) => `${re.exec(i.node)[1]}W section`).sort();
    assert.deepEqual(drawn(kit, { catalog: GEN2 }), want, 'the model');
    assert.deepEqual(drawn(kit, { catalog: null }), want, 'and in the goldens, which run with no catalog');
  });
}

test('a 3W-2H kit\'s first step tells the builder to butt its two rails; a kit on one rail has nothing to butt', () => {
  const note = (id) => generateManifest(migrateOfficialBuild(readKit(`${id}.json`).build, 1)).manifest.steps.find((s) => /Screw the rails? to the surface/.test(s.title || '')).note;
  assert.match(note('185-undertable-3w2h'), /Butt the rails edge to edge/);
  assert.doesNotMatch(note('185-undertable-2w2h'), /Butt/);
  // two rails with a gap between them do not meet (Sol 01a19482): the sentence is for a joint, not for a second rail
  const kit = readKit('185-undertable-2w2h.json').build;
  const gapped = { ...kit, placed: [{ ...kit.placed[0], x: 1, w: 1 }, { ...kit.placed[1], x: 3, w: 1 }] };
  const gen = generateManifest(gapped);
  assert.deepEqual(gen.errors, []);
  const first = gen.manifest.steps.find((s) => /Screw the rails? to the surface/.test(s.title || ''));
  assert.equal(first.title, 'Screw the rails to the surface', 'two rails');
  assert.doesNotMatch(first.note, /Butt/, 'and no joint between them');
});

test('the wall kit\'s first step tells the truth about the pegs (vault rules.md: sleeves, not screw heads)', () => {
  const gen = generateManifest(migrateOfficialBuild(readKit('185-wall-2w2h.json').build, 1));
  const step = gen.manifest.steps.find((s) => /Mount the wall bracket/.test(s.title || ''));
  assert.ok(step);
  assert.doesNotMatch(step.note, /proud/);
  assert.match(step.note, /seats fully inside/);
  assert.match(step.note, /stud/);
});

test('every kit file is listed in the index', () => {
  const files = readdirSync(join(root, 'builds')).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -5));
  assert.deepEqual(files.sort(), index.map((k) => k.id).sort());
});
