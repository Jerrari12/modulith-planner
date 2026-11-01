// HOW MUCH FILAMENT, BY THE 1 KG SPOOL (2026-11-01). The rule, the table's reach over what the BOM can list, and the one check that
// keeps two surfaces honest: a kit's total here equals the total on its page on the site (fixtures/site-kit-grams.json, written with
// the table by the site's tools/export-planner-print-grams.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';
import { filamentUse, gramsOf, spoolsNeeded, spoolsRecommended } from '../js/rules/filament-use.js';
import { PRINT_GRAMS } from '../js/catalog/print-grams.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);
const kitRows = (id) => {
  const rec = JSON.parse(JSON.stringify(JSON.parse(readFileSync(join(root, 'builds', `${id}.json`), 'utf8')).build));
  sanitizeBuild(rec, GEN2);
  return bomRows(computeBom(rec, GEN2) || [], null);
};

test('what the parts need is the weight over 1000 g; one more is recommended from 925 g on a spool', () => {
  const grams = [0, 1, 924.9, 925, 1000, 1000.1, 1849.9, 1850, 2000];
  assert.deepEqual(grams.map(spoolsNeeded), [1, 1, 1, 1, 1, 2, 2, 2, 2]);
  assert.deepEqual(grams.map(spoolsRecommended), [1, 1, 1, 2, 2, 2, 2, 3, 3]);
  for (let g = 0; g < 12000; g += 7) assert.ok(spoolsRecommended(g) >= spoolsNeeded(g), `${g} g: never recommends fewer than the parts need`);
});

test('every kit totals what its page on the site says', () => {
  const site = JSON.parse(readFileSync(join(root, 'test/fixtures/site-kit-grams.json'), 'utf8'));
  const ids = Object.keys(site);
  assert.ok(ids.length >= 34, `${ids.length} kits`);
  const off = [];
  for (const id of ids) {
    const use = filamentUse(kitRows(id));
    assert.equal(use.unpriced, 0, `${id}: every required part has a figure`);
    if (Math.abs(use.grams - site[id]) > 0.05) off.push([id, use.grams, site[id]]);
  }
  assert.deepEqual(off, []);
});

test('the colours off: one line a material, the QuickLocks in PETG and the feet in TPU', () => {
  const use = filamentUse(kitRows('270-tabletop-3w2h'));
  assert.deepEqual(use.lines.map((l) => l.material), ['PLA', 'TPU', 'PETG']);
  assert.ok(use.lines.every((l) => !l.small));
  assert.equal(use.lines[0].spools, spoolsNeeded(use.lines[0].grams));
  assert.equal(use.lines[0].recommended, spoolsRecommended(use.lines[0].grams));
  assert.equal(use.spools, use.lines.reduce((n, l) => n + l.spools, 0));
  assert.equal(use.recommended, use.lines.reduce((n, l) => n + l.recommended, 0));
  assert.ok(use.optionalGrams > 0, 'the optional rows are reported on their own');
  assert.ok(Math.abs(use.lines.find((l) => l.material === 'PETG').grams - 5 * PRINT_GRAMS['GEN2 QuickLock - Left'][1] * 2) < 1e-9, 'one print yields both hands: 5 sets are 5 prints');
});

const f = (name, hex, material = 'PLA') => ({ name, hex, url: null, material });
const black = f('Black', '#111'), white = f('White', '#eee'), orange = f('Orange', '#f60'), silver = f('Silver', '#ccc'), petgRed = f('Red PETG', '#c00', 'PETG');
const row = (name, qty, extra = {}) => ({ name, qty, ...extra });
const table = { Case: [100, 110, null], Face: [20, 21, null], Lock: [null, 1, null], Foot: [null, null, 2], Stopper: [3, 3, null], 'Rail|1W section': [40, 41, null] };
const by = (use, name) => use.lines.find((l) => l.id === name);

test('a part weighs on the filament its body prints in, and an accent-only filament is a small amount and a spool', () => {
  const regions = { Case: [{ zone: '', filaments: [black], bare: null }], Face: [{ zone: '', filaments: [orange], bare: null }, { zone: 'accent', filaments: [silver], bare: null }] };
  const use = filamentUse([row('Case', 10), row('Face', 5)], { regionsOf: (r) => regions[r.name], filaments: [black, orange, silver], table });
  assert.deepEqual(use.lines.map((l) => [l.id, l.grams, l.spools, l.recommended, l.small]), [['Black', 1000, 1, 2, false], ['Orange', 100, 1, 1, false], ['Silver', 0, 1, 1, true]]);
  assert.equal(use.grams, 1100);
  assert.equal(use.spools, 3);
  assert.equal(use.recommended, 4);
});

test('a filament reads its own material\'s figure', () => {
  const use = filamentUse([row('Case', 10), row('Lock', 2)], { regionsOf: (r) => [{ zone: '', filaments: [r.name === 'Case' ? petgRed : black], bare: null }], filaments: [petgRed, black], table });
  assert.equal(by(use, 'Red PETG').grams, 1100, 'the PETG column');
  assert.equal(by(use, 'Black').grams, 2, 'a QuickLock sliced only in PETG still answers, in PLA too');
});

test('units wearing different filaments share their row, and an unpicked region is said to be', () => {
  const regions = [{ zone: '', filaments: [black, white], bare: '#abc' }];
  const use = filamentUse([row('Case', 3)], { regionsOf: () => regions, filaments: [black, white], table });
  assert.ok(Math.abs(by(use, 'Black').grams - 100) < 1e-9 && Math.abs(by(use, 'White').grams - 100) < 1e-9 && Math.abs(by(use, 'no-pick').grams - 100) < 1e-9);
  assert.ok(by(use, 'no-pick').noPick);
  assert.ok(Math.abs(use.grams - 300) < 1e-9);
});

test('a row the stage does not model counts as not picked yet, not as nothing', () => {
  const use = filamentUse([row('Case', 1)], { regionsOf: () => null, filaments: [black], table });
  assert.equal(by(use, 'no-pick').grams, 100);
  assert.ok(by(use, 'Black').small);
});

test('bought hardware and unreleased parts weigh nothing, optional parts apart, a missing figure counted and never zero', () => {
  const use = filamentUse([row('Case', 1), row('Stopper', 4, { optional: true }), row('Face', 9, { hardware: true }), row('Face', 9, { unreleased: true }), row('Mystery', 7), row('Mystery', 2, { optional: true }), row('Case', 0)], { table });
  assert.equal(use.grams, 100);
  assert.equal(use.optionalGrams, 12);
  assert.equal(use.unpriced, 7);
  assert.equal(gramsOf(row('Mystery', 1), 'PLA', table), null);
});

test('a section reads its own row', () => {
  assert.equal(gramsOf(row('Rail', 1, { variant: '1W section' }), 'PLA', table), 40);
  assert.equal(gramsOf(row('Rail', 1, { variant: '2W section' }), 'PLA', table), null);
});

test('everything a build can list has a figure: every style, handle, fill and mount across every kit', () => {
  const missing = new Set();
  const look = (rec) => { sanitizeBuild(rec, GEN2); for (const r of bomRows(computeBom(rec, GEN2) || [], null)) if (!r.hardware && !r.unreleased && gramsOf(r, 'PLA') == null) missing.add(r.variant ? `${r.name}|${r.variant}` : r.name); };
  const kits = readdirSync(join(root, 'builds')).filter((n) => n.endsWith('.json') && n !== 'index.json');
  assert.ok(kits.length >= 34);
  for (const n of kits) {
    const base = JSON.parse(readFileSync(join(root, 'builds', n), 'utf8')).build;
    if (!base) continue;
    const copy = () => JSON.parse(JSON.stringify(base));
    look(copy());
    for (const s of GEN2.faceplateStyles) for (const h of GEN2.handleStyles) { const b = copy(); b.faceStyle = s.id; b.handleStyle = h.id; b.backCover = true; look(b); }
    for (const fill of ['classic', 'shelf', 'cabinet']) { const b = copy(); for (const p of b.placed) p.fill = fill; look(b); }
    const g = copy(); for (const p of g.placed) p.variant = 'gridfinity'; look(g);
  }
  assert.deepEqual([...missing].sort(), []);
});
