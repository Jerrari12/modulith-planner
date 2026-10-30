/* The hanging starter kits (2026-10-30, Joey: wall and under-table kits, "higher density on top"). What the goldens in
   official-builds.test.mjs cannot say: the shape he asked for, that the record is what the planner would settle it to, that
   what the gallery tells a buyer is what the kit's BOM bills, and that the gallery's links are the listings the generator
   bills. Nothing may read as a load rating: none exists. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, loadCatalog, readKit } from './parity/lib.mjs';
import { computeBom } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';
import { layoutRules } from '../js/rules/layout.js';
import { settleToward } from '../js/rules/settle.js';
import { generateManifest, migrateOfficialBuild } from '../js/generate.js';

const { GEN2, GEN2_TABLETOP } = loadCatalog();
const index = JSON.parse(readFileSync(join(root, 'builds', 'index.json'), 'utf8'));
const html = readFileSync(join(root, 'builds', 'index.html'), 'utf8');
const hanging = index.filter((k) => k.mount !== 'tabletop');
const SCREWS = { wall: { '2w2h': 4, '3w2h': 6 }, 'under-table': { '2w2h': 6, '3w2h': 8 } };
const MAGNETS = { '2w2h': 6, '3w2h': 10 };
const shapeOf = (id) => id.slice(-4);
const clone = (v) => JSON.parse(JSON.stringify(v));
const items = (rec) => { const d = clone(rec); sanitizeBuild(d, GEN2); return computeBom(d, GEN2).flatMap((s) => s.items); };
const qty = (list, re) => list.filter((i) => re.test(i.name)).reduce((a, i) => a + i.qty, 0);
const pageConst = (name) => new Function(`return ${new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`).exec(html)[1]}`)();

test('the first set: 165 and 185, wall and under-table, both shapes', () => {
  const want = [165, 185].flatMap((l) => ['wall', 'undertable'].flatMap((m) => ['2w2h', '3w2h'].map((s) => `${l}-${m}-${s}`)));
  assert.deepEqual(hanging.map((k) => k.id).sort(), want.sort());
});

for (const row of hanging) {
  test(`${row.id}: the shape, the record and the index row agree`, () => {
    const kit = readKit(`${row.id}.json`);
    assert.equal(kit.title, row.title);
    assert.equal(kit.tagline, row.tagline);
    assert.doesNotMatch(kit.title + kit.tagline, /GEN2/, 'a new kit is named MODULITH-free of the old name');
    assert.equal(kit.build.mount, row.mount);
    assert.equal(kit.build.length, row.length);
    assert.equal(kit.build.placed.length, row.units);
    assert.equal(row.drawers, row.units, 'every unit in a starter kit is a drawer');
    assert.match(row.dims, /^\d+ × \d+ × \d+ mm$/);
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
    assert.deepEqual(gen.warnings, [], 'no warning: 165 and 185 hardware positions are measured, not scaled');
  });

  test(`${row.id}: the page's numbers are what its BOM bills`, () => {
    const list = items(readKit(`${row.id}.json`).build), s = shapeOf(row.id);
    assert.equal(qty(list, /wood screw/i), SCREWS[row.mount][s]);
    assert.equal(qty(list, /^Magnets/), MAGNETS[s]);
    assert.equal(qty(list, /foot|feet/i), 0, 'a hanging kit has no foot rails or feet');
    assert.equal(qty(list, row.mount === 'wall' ? /Wall Mount Kit/ : /Under Table Rails/), 1);
    const notes = pageConst('MOUNT_NOTES')[row.mount].items;
    const label = s === '2w2h' ? '2W-2H' : '3W-2H';
    // line by line: an under-table kit's 6 screws and a 2W-2H's 6 magnets read the same in one string
    assert.ok(notes.find((n) => /wood screws/.test(n)).includes(`${SCREWS[row.mount][s]} for a ${label} kit`), 'screw count on the page');
    assert.ok(notes.find((n) => /^Magnets/.test(n)).includes(`${MAGNETS[s]} for a ${label} kit`), 'magnet count on the page');
  });

  test(`${row.id}: the gallery links the listing the generator bills, and its parts list`, () => {
    const gen = generateManifest(migrateOfficialBuild(readKit(`${row.id}.json`).build, 1));
    const type = row.mount === 'wall' ? /wall ?mount|bracket/i : /rail/i;
    const part = Object.values(gen.manifest.parts).find((p) => p.links && type.test(`${p.label} ${p.type}`) && !p.purchased);
    assert.ok(part, 'the generator bills a bracket or rail row');
    const page = pageConst('HANG_LINKS');
    const links = row.mount === 'wall' ? page.wall : page['under-table'][row.length];
    assert.equal(links.p, part.links.p);
    assert.equal(links.t, part.links.t);
    assert.match(html, /'\.\.\/\?ws=parts&build=' \+ encodeURIComponent\(k\.id\)/);
    assert.ok(existsSync(join(root, 'builds', 'img', `${row.id}.png`)), 'card art');
  });
}

test('the page says what to buy per mount, and promises nothing about load', () => {
  const notes = pageConst('MOUNT_NOTES');
  assert.match(notes.wall.items.join(' '), /anchors/);
  assert.match(notes['under-table'].items.join(' '), /about 16 mm into the top/);
  const load = /const LOAD_NOTE = '([^']*)'/.exec(html)[1];
  assert.match(load, /No load rating is published/);
  assert.match(load, /not a load test/);
  const said = [load, ...Object.values(notes).flatMap((n) => n.items), ...[...html.matchAll(/^ +(?:wall|'under-table'): '([^']*)'/gm)].map((m) => m[1])].join(' ');
  assert.doesNotMatch(said, /\b(rated|tested to|holds? up to|\d+ ?(kg|lb)s?\b)/i);
  assert.doesNotMatch(said, /\d+ printed parts/, 'printed-part counts wait until they are reconciled');
  assert.doesNotMatch(said, /nothing to buy/i);
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
