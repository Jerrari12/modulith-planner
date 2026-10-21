/* STANDING A BUILD ON ITS MOUNT (js/rules/stand.js, 2026-10-20). Joey switched a wall build with gaps along its bottom to
   Tabletop and the page stopped on "Can't show this build yet · A unit is floating" (twice), with no way back: setMount
   slides the layout against the new surface and nothing else, and the generator wants every column of every unit to rest
   on something. standUp fills those columns and moves nothing; standRecord is the boot's safety net for a record already
   saved that way. Pure node: the catalog is the vendored classic script run in a vm. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(read('js/vendor/requirement-scope.js'), ctx);
vm.runInContext(read('js/vendor/tabletop-completion.js'), ctx);
const { GEN2, GEN2_TABLETOP } = vm.runInContext(read('js/catalog/data.js') + '\n;({ GEN2, GEN2_TABLETOP })', ctx);
const mod = (...p) => import(pathToFileURL(join(root, ...p)).href);
const { layoutRules } = await mod('js', 'rules', 'layout.js');
const { serializeBuild } = await mod('js', 'rules', 'schema.js');
const { standUp, standRecord, standWords } = await mod('js', 'rules', 'stand.js');
const { generateManifest } = await mod('js', 'generate.js');
const deps = { tabletop: GEN2_TABLETOP };
const errorsOf = (b) => generateManifest(serializeBuild(b)).errors;
const brief = (b) => b.placed.map((p) => `${p.id}:${p.w}x${p.hh}@${p.x},${p.y}`).sort().join(' ');

const record = (mount, gridW, gridH, units, fill = 'decor') => ({
  mount, length: 185, printer: 'any', customBed: { x: null, y: null }, spaceW: null, spaceH: null,
  faceStyle: GEN2.faceplateStyles[0].id, doorStyle: GEN2.doorStyles[0].id, handleStyle: GEN2.handleStyles[0].id,
  wallStagger: false, backCover: false, feet: 'tpu', buildPlate: 'powder', removedStoppers: [],
  gridW, gridH, selected: { w: 1, h: 1 }, fill,
  placed: units.map(([id, x, y, w, hh, f]) => ({ id, x, y, w, hh, fill: f || fill, shelves: 0 })),
  nextId: Math.max(...units.map((u) => u[0])) + 1,
});
/* Joey's wall build (his board, 2026-10-20): 7W x 4H on the brackets, 11 units, the bottom row open under columns 0-1 and
   5-6. [id, x, y, w, hh] with y and hh in half-rows from the top. */
const joeysWall = () => record('wall', 7, 4, [
  [1, 0, 0, 4, 4], [2, 4, 0, 1, 2], [3, 5, 0, 1, 2], [4, 6, 0, 1, 2],
  [5, 4, 2, 1, 2], [6, 5, 2, 2, 4],
  [7, 0, 4, 2, 2], [8, 2, 4, 2, 2], [9, 4, 4, 1, 2],
  [10, 2, 6, 2, 2], [11, 4, 6, 1, 2],
]);
/* the record that was saved: the same layout after setMount('tabletop'), the only thing the sheet did before */
const flipped = (b, mount) => { const R = layoutRules(b, GEN2, deps); R.setMount(mount); return R; };

test('Joey\'s wall build stands on its brackets, and switched to Tabletop it was refused twice for floating units', () => {
  assert.deepEqual(errorsOf(joeysWall()), [], 'the wall build itself is fine');
  const b = joeysWall(); flipped(b, 'tabletop');
  const errs = errorsOf(b);
  assert.equal(errs.length, 2, errs.join(' | '));
  assert.ok(errs.every((e) => /A unit is floating/.test(e)), errs.join(' | '));
});

test('standUp keeps the layout as designed and fills the four open cells under it; the result is shown', () => {
  const b = joeysWall(); const before = brief(b);
  const R = flipped(b, 'tabletop');
  assert.equal(brief(b), before, 'the switch slid nothing (the build already reached the grid\'s bottom)');
  const r = standUp(b, R);
  assert.equal(r.added, 4);
  assert.deepEqual(r.ids, [12, 13, 14, 15]);
  const added = b.placed.filter((p) => r.ids.includes(p.id)).map((p) => `${p.w}x${p.hh}@${p.x},${p.y}:${p.fill}`).sort();
  assert.deepEqual(added, ['1x2@0,6:decor', '1x2@1,6:decor', '1x2@5,6:decor', '1x2@6,6:decor'], 'a 1W·1H under each open column, in the build\'s drawer type');
  assert.equal(b.placed.filter((p) => !r.ids.includes(p.id)).map((p) => `${p.id}:${p.w}x${p.hh}@${p.x},${p.y}`).sort().join(' '), before, 'nothing that was there moved');
  R.syncTabletopGrid();   // what the store's normalise does after the commit
  assert.deepEqual(errorsOf(b), []);
});

test('Tabletop to Wall Mount: a ragged top is filled up to the brackets, and the wall build is shown', () => {
  // a 1W·2H beside a 2W·1H on the table: fine on a table (an unfinished run), but on a wall the 2W hangs from nothing
  const b = record('tabletop', 3, 2, [[1, 0, 0, 1, 4], [2, 1, 2, 2, 2]]);
  assert.deepEqual(errorsOf(b), []);
  const R = flipped(b, 'wall');
  assert.ok(errorsOf(b).length > 0, 'refused on the wall as it stands');
  const r = standUp(b, R);
  assert.equal(r.added, 2);
  assert.deepEqual(b.placed.filter((p) => r.ids.includes(p.id)).map((p) => `${p.w}x${p.hh}@${p.x},${p.y}`).sort(), ['1x2@1,0', '1x2@2,0']);
  assert.deepEqual(errorsOf(b), []);
  assert.match(standWords('wall', r.added), /^2 support cases to fill the gaps up to the brackets$/);
});

test('every column, not only the ends: a 3W on two 1W ends has its middle filled (the planner\'s own rule stops at the ends)', () => {
  const b = record('tabletop', 3, 2, [[1, 0, 0, 3, 2], [2, 0, 2, 1, 2], [3, 2, 2, 1, 2]]);
  const R = layoutRules(b, GEN2, deps);
  assert.equal(R.unsupportedUnits().length, 0, 'both ends rest on a case: the planner is satisfied');
  assert.ok(errorsOf(b).some((e) => /floating/.test(e)), 'the generator is not');
  const r = standUp(b, R);
  assert.equal(r.added, 1);
  assert.deepEqual(b.placed.filter((p) => r.ids.includes(p.id)).map((p) => `${p.w}x${p.hh}@${p.x},${p.y}`), ['1x2@1,2']);
  assert.deepEqual(errorsOf(b), []);
});

test('a build that already stands is left alone', () => {
  const kit = JSON.parse(read('builds/185-tabletop-2w2h.json')).build;
  const b = { ...JSON.parse(JSON.stringify(kit)), selected: { w: 1, h: 1 } };
  const before = brief(b);
  assert.deepEqual(standUp(b, layoutRules(b, GEN2, deps)), { added: 0, ids: [] });
  assert.equal(brief(b), before);
  assert.equal(standRecord(kit, GEN2, deps), null, 'nothing to do: the boot leaves it to the generator as before');
  assert.equal(standRecord({ ...kit, placed: [] }, GEN2, deps), null, 'an empty build is not stood up');
});

test('the boot\'s safety net: the record Joey saved opens stood up; a layout floating above the table slides onto it', () => {
  const saved = joeysWall(); flipped(saved, 'tabletop');
  const rec = serializeBuild(saved);
  assert.equal(generateManifest(rec).manifest, null);
  const r = standRecord(rec, GEN2, deps);
  assert.ok(r && r.added === 4, JSON.stringify(r && r.added));
  assert.deepEqual(generateManifest(r.record).errors, []);
  assert.equal(rec.placed.length, 11, 'the saved record itself is not changed');
  // the whole layout above the grid's bottom (an older link): one slide, nothing added
  const high = serializeBuild(record('tabletop', 2, 3, [[1, 0, 0, 2, 2]]));
  assert.ok(generateManifest(high).errors.some((e) => /floating/.test(e)));
  const s = standRecord(high, GEN2, deps);
  assert.ok(s && s.added === 0 && s.record.placed[0].y === 4, JSON.stringify(s && s.record.placed));
  assert.deepEqual(generateManifest(s.record).errors, []);
});

test('the boot\'s safety net does not turn a refusal about something else into a page', () => {
  // the e2e suite's damaged link: a mount that is not one; whatever standRecord does, the generator still refuses it
  const bad = { v: 1, mount: '<img src=x onerror="window.__e2eXss=1">', length: 185, gridW: 2, gridH: 1, placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0 }] };
  const r = standRecord(bad, GEN2, deps);
  assert.ok(!r || generateManifest(r.record).manifest === null);
});

test('supports take the build\'s majority drawer type, and a record whose nextId lags its ids gets unique ones', () => {
  const b = record('wall', 3, 2, [[1, 0, 0, 3, 2, 'classic'], [2, 0, 2, 1, 2, 'classic'], [3, 1, 2, 1, 2, 'decor']]);
  flipped(b, 'tabletop');
  b.nextId = 2;   // lags: ids 1-3 exist
  const R = layoutRules(b, GEN2, deps);
  const r = standUp(b, R);
  assert.equal(r.added, 1);
  const ids = b.placed.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, `unique ids: ${ids}`);
  assert.equal(b.placed.find((p) => p.id === r.ids[0]).fill, 'classic');
  assert.ok(b.nextId > Math.max(...ids));
});

test('the words', () => {
  assert.equal(standWords('tabletop', 4), '4 support cases under the gaps');
  assert.equal(standWords('tabletop', 1), '1 support case under the gaps');
  assert.equal(standWords('under-table', 2), '2 support cases to fill the gaps up to the rails');
});
