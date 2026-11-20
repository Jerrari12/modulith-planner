/* A free size of a paid series (data.js TRY_FREE, Joey 2026-11-20): the EdgeLabel 1W-1H is also offered free as the
   Intro Edition, so its parts-list row carries a second link to that free listing. These tests pin what partLinks
   returns for it and for its neighbours, and that the row it reaches through bomRows keeps its CLUB badge. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);
const partLinks = vm.runInContext('partLinks', ctx);
const TRY_FREE = vm.runInContext('TRY_FREE', ctx);
const INTRO = 'GEN2 EdgeLabel Decor Faceplate - 1W-1H';

test('the EdgeLabel 1W-1H links its free Intro Edition on Printables and Thangs, beside the paid series page', () => {
  const l = partLinks(INTRO);
  // round-tripped through JSON: the catalog runs in its own vm realm, whose arrays fail a strict deepEqual on prototype
  assert.deepEqual(JSON.parse(JSON.stringify(l.tryFree.map((s) => [s.id, s.url, s.name]))), [
    ['printables', 'https://www.printables.com/model/1231302', 'Intro Edition'],
    ['thangs', 'https://than.gs/m/1292349', 'Intro Edition'],
  ]);
  // the row's own link is still the paid series page, never the free listing
  const p = l.stores.find((s) => s.id === 'printables');
  assert.ok(p.exact);
  assert.match(p.url, /\/model\/1093933-/);
  assert.notEqual(p.url, l.tryFree[0].url);
});

test('no other faceplate gets a free link, and their link shape is unchanged', () => {
  for (const style of GEN2.faceplateStyles) for (const size of ['1W-1H', '2W-1H', '1W-0.5H']) {
    const name = GEN2.partNames.faceplate(null, size, style.label);
    if (name === INTRO) continue;
    const l = partLinks(name);
    assert.equal('tryFree' in l, false, `${name} has no free link`);
    assert.deepEqual(Object.keys(l), ['stores', 'printables', 'thangs', 'exactP', 'exactT'], `${name}: the old shape`);
  }
});

test('every TRY_FREE key is a real BOM row name and every entry names its listing', () => {
  for (const [name, v] of Object.entries(TRY_FREE)) {
    assert.match(name, /^GEN2 .+ Decor Faceplate - \d+W-[\d.]+H$/, `${name} is a faceplate row name`);
    assert.ok(v.label && (v.p || v.t), `${name} has a label and at least one store`);
  }
});

test('a build with an EdgeLabel 1W-1H drawer: its row stays CLUB and carries the free link through bomRows', () => {
  // the record as the store keeps it (chip-drawer.test.mjs's shape): one 1W-1H Decor drawer, y = its top row in half-units
  const b = { mount: 'tabletop', length: 185, faceStyle: 'edgelabel', handleStyle: 'deco', wallStagger: false, backCover: false,
    feet: 'tpu', removedStoppers: [], sideCovers: true, gridW: 2, gridH: 1, nextId: 2, placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'decor' }] };
  sanitizeBuild(b, GEN2);
  const rows = bomRows(computeBom(b, GEN2) || [], partLinks);
  const row = rows.find((r) => r.name === INTRO);
  assert.ok(row, 'the 1W-1H EdgeLabel faceplate is on the list');
  assert.equal(row.club, true, 'still a Club part');
  assert.equal(row.links.tryFree.length, 2);
});
