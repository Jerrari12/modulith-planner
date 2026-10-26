/* A PART'S OWN BUILD PLATE FINISH (2026-10-26, Joey: "everything except the faceplate powder-coated, and the faceplate
 * holographic"). The record's `plateParts` is the planner's own field: a part type -> one of the three finishes, and a
 * type not in it follows `buildPlate`. These are the record's rules - what sanitize keeps, what it drops, that an older
 * record or share link reads as no overrides, and that the field survives serialize. The stage's half (each part's
 * material wearing its own finish) is driven in the browser by the e2e case "Colors: a part's own build plate finish".
 *
 * Pure node: the catalog is the vendored classic script run in a vm, as in the BOM tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { sanitizeBuild, serializeBuild, cleanPlateParts, PLATE_PARTS_MAX, BUILD_FIELDS } from '../js/rules/schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);

/* a small tabletop record, the bill tests' shape; sanitizeBuild fills the rest IN PLACE (it returns what it dropped) */
const record = (extra = {}) => ({ mount: 'tabletop', length: 165, fill: 'decor', gridW: 3, gridH: 2, nextId: 2,
  placed: [{ id: 1, x: 0, y: 2, w: 3, hh: 2, fill: 'decor', shelves: 0 }], ...extra });
const clean = (r) => { sanitizeBuild(r, GEN2); return r; };

test('cleanPlateParts keeps a known finish on a plain type name, and nothing else', () => {
  assert.deepEqual(cleanPlateParts({ Faceplate: 'holographic', Case: 'smooth', Stopper: 'powder' }), { Faceplate: 'holographic', Case: 'smooth', Stopper: 'powder' });
  assert.deepEqual(cleanPlateParts({ Faceplate: 'glitter', Case: null, Handle: 1, Drawer: 'Smooth' }), {}, 'an unknown or mis-cased finish is dropped, never guessed');
  assert.deepEqual(cleanPlateParts({ '': 'smooth', '1Case': 'smooth', 'Face<plate>': 'smooth', ['x'.repeat(41)]: 'smooth', __proto__: { Case: 'smooth' } }), {}, 'a malformed type name is dropped');
  for (const v of [null, undefined, 'holographic', 7, ['Faceplate', 'holographic']]) assert.deepEqual(cleanPlateParts(v), {}, `not an object: ${JSON.stringify(v)}`);
  const many = Object.fromEntries(Array.from({ length: PLATE_PARTS_MAX + 8 }, (_, i) => [`Part${i}`, 'smooth']));
  assert.equal(Object.keys(cleanPlateParts(many)).length, PLATE_PARTS_MAX, 'at most PLATE_PARTS_MAX types');
  const src = { Faceplate: 'holographic' }, out = cleanPlateParts(src);
  out.Case = 'smooth';
  assert.deepEqual(src, { Faceplate: 'holographic' }, 'a fresh object: editing the result never reaches the source');
});

test('an older record or share link has no overrides; a stored one is kept through sanitize and serialize', () => {
  assert.ok(BUILD_FIELDS.includes('plateParts'), 'plateParts is a record field');
  const a = clean(record({ buildPlate: 'smooth' }));
  assert.deepEqual(a.plateParts, {}, 'absent reads as {} - every part follows the build plate');
  assert.equal(a.buildPlate, 'smooth', 'the build plate is untouched');
  const b = clean(record({ buildPlate: 'powder', plateParts: { Faceplate: 'holographic', Case: 'glitter' } }));
  assert.deepEqual(b.plateParts, { Faceplate: 'holographic' }, 'the known override stays, the unknown one goes');
  const round = clean(JSON.parse(JSON.stringify(serializeBuild(b))));
  assert.deepEqual(round.plateParts, { Faceplate: 'holographic' }, 'it survives serialize and a second sanitize (a saved build, a share link)');
  assert.equal(round.buildPlate, 'powder');
});
