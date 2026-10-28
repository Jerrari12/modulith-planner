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
const { standUp, standRecord, slotWords, openCells, armedSpots } = await mod('js', 'rules', 'stand.js');
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
  assert.equal(slotWords('wall', r.added), '2 empty slots up to the brackets');
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

test('the boot\'s safety net adds nothing (2026-10-21): Joey\'s saved record opens as it is, with its gaps; a layout floating above the table slides onto it', () => {
  const saved = joeysWall(); flipped(saved, 'tabletop');
  const rec = serializeBuild(saved);
  assert.equal(generateManifest(rec).manifest, null, 'strict: refused');
  assert.equal(standRecord(rec, GEN2, deps), null, 'nothing to slide, and nothing is added');
  const shown = generateManifest(rec, { voids: true }).manifest;
  assert.ok(shown && shown.incomplete && shown.incomplete.voids === 4, 'the stage shows it as an in-progress build with four empty slots');
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
  assert.equal(slotWords('tabletop', 4), '4 empty slots under it');
  assert.equal(slotWords('tabletop', 1), '1 empty slot under it');
  assert.equal(slotWords('under-table', 2), '2 empty slots up to the rails');
});

/* EMPTY SLOTS, NOT ADDED CASES (2026-10-21, Joey: "i don't want switching between mounting types to automatically add
   units"; the gaps stay slots to fill and the assembly is not legal until they are). openCells lists them; the generator's
   opts.voids draws them as ghosts and makes the build an in-progress preview, while the default stays strict. */
test('openCells lists the empty slots: under a tabletop case, above a hanging one, and under a wide case\'s middle', () => {
  const j = joeysWall(); const Rj = flipped(j, 'tabletop');
  assert.deepEqual(openCells(j, Rj).map((c) => `${c.x},${c.y}`).sort(), ['0,6', '0,7', '1,6', '1,7', '5,6', '5,7', '6,6', '6,7']);
  assert.equal(j.placed.length, 11, 'counted, not filled');
  const w = record('tabletop', 3, 2, [[1, 0, 0, 1, 4], [2, 1, 2, 2, 2]]); const Rw = flipped(w, 'wall');
  assert.deepEqual(openCells(w, Rw).map((c) => `${c.x},${c.y}`).sort(), ['1,0', '1,1', '2,0', '2,1']);
  const m = record('tabletop', 3, 2, [[1, 0, 0, 3, 2], [2, 0, 2, 1, 2], [3, 2, 2, 1, 2]]);
  assert.deepEqual(openCells(m, layoutRules(m, GEN2, deps)).map((c) => `${c.x},${c.y}`).sort(), ['1,2', '1,3']);
  const kit = { ...JSON.parse(read('builds/185-tabletop-2w2h.json')).build, selected: { w: 1, h: 1 } };
  assert.deepEqual(openCells(kit, layoutRules(kit, GEN2, deps)), [], 'a standing build has none');
  const air = record('tabletop', 2, 3, [[1, 0, 0, 2, 2]]);
  assert.deepEqual(openCells(air, layoutRules(air, GEN2, deps)), [], 'nothing on the table: no slots (the generator refuses it)');
});

/* THE SLOTS ARE WHAT FILL ALL FILLS (2026-10-21): Build's red slots and its issue count come from openCells, and its Fill
   all button is standUp, so the two must walk to the same surface - the table, or the grid's top row on a hanging mount
   (the planner's own unsupportedUnits counts y 0 as the brackets) - or a slot would be shown that Fill all skips, or Fill
   all would add cases nobody was shown. A hanging layout that reaches no bracket has no slots: it floats as a whole, and
   Build's old "not supported" issue with Fix structure covers it, as on a table. */
test('Fill all (standUp) fills exactly the open cells, on a table and on a hanging mount; a hanging layout off its brackets has none', () => {
  const cellsOf = (ps) => ps.flatMap((p) => Array.from({ length: p.w * p.hh }, (_, i) => `${p.x + (i % p.w)},${p.y + Math.floor(i / p.w)}`)).sort();
  const j = joeysWall(); const Rj = flipped(j, 'tabletop');
  const w = record('tabletop', 3, 2, [[1, 0, 0, 1, 4], [2, 1, 2, 2, 2]]); const Rw = flipped(w, 'wall');
  for (const [name, b, R] of [['tabletop', j, Rj], ['wall', w, Rw]]) {
    const open = openCells(b, R).map((c) => `${c.x},${c.y}`).sort();
    assert.ok(open.length, name + ': has slots');
    const r = standUp(b, R);
    assert.deepEqual(cellsOf(b.placed.filter((p) => r.ids.includes(p.id))), open, name + ': Fill all fills exactly the slots shown');
    assert.deepEqual(openCells(b, R), [], name + ': none left');
  }
  // a wall layout one row below the brackets, with a gap under part of it: no slots (Fill all would have built up to y 0)
  const low = record('wall', 3, 3, [[1, 0, 2, 2, 2], [2, 2, 4, 1, 2]]);
  assert.deepEqual(openCells(low, layoutRules(low, GEN2, deps)), [], 'nothing at the brackets: no slots');
});

test('the generator\'s voids mode: Joey\'s switched build is an in-progress preview with a ghost in every slot; strict stays strict', () => {
  const j = joeysWall(); const Rj = flipped(j, 'tabletop');
  const rec = serializeBuild(j);
  assert.equal(generateManifest(rec).manifest, null, 'the default refuses it, as the placement judge needs');
  const m = generateManifest(rec, { voids: true }).manifest;
  assert.ok(m, 'shown');
  assert.equal(m.incomplete.voids, 4); assert.equal(m.ghosts.length, 4);
  assert.equal(m.ghosts.reduce((k, g) => k + g.halfRows, 0), openCells(j, Rj).length, 'the ghosts cover exactly the open cells');
  assert.equal(m.steps.length, 1); assert.equal(m.steps[0].title, 'Fill the gaps'); assert.ok(m.steps[0].preview, 'no instructions: one preview page');
  // a ghost's top meets the floating case above it (73.65 mm: the bottom row's 17.65 plus one 1H)
  const caseBottoms = new Set(m.instances.filter((i) => /_Case$/.test(i.node)).map((i) => i.pos[1].toFixed(2)));
  for (const g of m.ghosts) assert.ok(caseBottoms.has((g.pos[1] + g.size[1]).toFixed(2)), `ghost top ${g.pos[1] + g.size[1]} meets a case`);
  // a hanging build with a ragged top: ghosts above, up to the top row
  const w = record('tabletop', 3, 2, [[1, 0, 0, 1, 4], [2, 1, 2, 2, 2]]); flipped(w, 'wall');
  const mw = generateManifest(serializeBuild(w), { voids: true }).manifest;
  assert.ok(mw && mw.incomplete.voids === 2 && mw.ghosts.every((g) => g.pos[1] === 56 && g.size[1] === 56), JSON.stringify(mw && mw.ghosts));
  // a complete kit is byte-identical either way; a layout with nothing on the table is still refused
  const kit = JSON.parse(read('builds/185-tabletop-2w2h.json')).build;
  assert.equal(JSON.stringify(generateManifest(kit, { voids: true })), JSON.stringify(generateManifest(kit)));
  assert.ok(generateManifest(serializeBuild(record('tabletop', 2, 3, [[1, 0, 0, 2, 2]])), { voids: true }).errors.some((e) => /floating/.test(e)));
});

/* Joey's build of 2026-10-28 (185 Tabletop, 7W): a 1W x 3H void at column 2, half-rows 8-13, under a 3W case. Its red
   slots are the cases standUp would add; armed with a 1W x 3H shelf the void is also an offered spot. Before, one slot's
   "+" stood on the very point of the offered spot's "+", and the hover flickered between them (a click could add a 1W x 1H
   instead of the shelf). armedSpots shows the offered spot alone there. */
test('a void armed with a size that fills it: its red slots give way to the offered spot, whose marker they shared', () => {
  const b = record('tabletop', 7, 10, [
    [1, 0, 18, 2, 2], [2, 0, 16, 1, 2], [3, 2, 18, 1, 2], [4, 1, 16, 2, 2], [5, 3, 19, 1, 1], [6, 4, 19, 1, 1], [7, 5, 19, 1, 1],
    [8, 6, 19, 1, 1], [9, 3, 16, 4, 3], [10, 3, 13, 4, 3], [11, 3, 10, 4, 3], [12, 3, 7, 4, 3], [13, 0, 15, 2, 1],
    [14, 0, 14, 2, 1], [15, 2, 15, 1, 1], [16, 2, 14, 1, 1], [18, 0, 8, 2, 6], [19, 0, 7, 3, 1],
  ]);
  const R = layoutRules(b, GEN2, deps);
  assert.ok(R.canPlace(2, 8, 1, 6), 'the 1W x 3H fits the void');
  const t = JSON.parse(JSON.stringify(b)); const r = standUp(t, layoutRules(t, GEN2, deps));
  const need = t.placed.filter((p) => r.ids.includes(p.id)).map((p) => ({ x: p.x, y: p.y, w: p.w, hh: p.hh, kind: 'need' }));
  assert.ok(need.length >= 1 && need.every((n) => n.x === 2 && n.y >= 8 && n.y + n.hh <= 14), `the slots are the void's (${JSON.stringify(need)})`);
  const offered = [{ x: 2, y: 8 }, { x: 5, y: 0 }], refused = [{ x: 2, y: 9, kind: 'no' }];
  const centre = (s, w, hh) => `${2 * s.x + (s.w || w)},${2 * s.y + (s.hh || hh)}`;
  assert.ok(need.some((n) => centre(n) === centre(offered[0], 1, 6)), 'before: a slot\'s "+" on the offered spot\'s "+" (the flicker)');
  const shown = armedSpots(need, offered, refused, 1, 6);
  assert.deepEqual(shown.filter((s) => s.kind === 'need'), [], 'armed: the void\'s slots give way to the shelf that fills it');
  assert.deepEqual(shown.filter((s) => !s.kind), offered, 'the offered spots are all there');
  // a slot the armed unit does not cover stays, and a refused cell on a slot's marker gives way to the slot
  const lone = { x: 0, y: 0, w: 1, hh: 2, kind: 'need' }, onIt = { x: 0, y: 0, kind: 'no' };
  assert.deepEqual(armedSpots([lone], [{ x: 4, y: 0 }], [onIt], 1, 2), [lone, { x: 4, y: 0 }]);
  assert.deepEqual(armedSpots([lone], [], [{ x: 3, y: 0, kind: 'no' }], 1, 2), [lone, { x: 3, y: 0, kind: 'no' }], 'a refused cell elsewhere stays');
});
