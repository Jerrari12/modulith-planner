/* SETTLING TOWARD THE MOUNT (js/rules/settle.js, Joey 2026-10-25, from the Under-Table report): after every edit every unit
   slides toward the mount until it touches the mount or any unit on that side (any overlap in width), repeated until
   nothing moves; nothing is held. The three acceptance layouts from the report, run against the real layout rules. */
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
// SETTLE_SRC: a mutated copy of settle.js (tools/settle-mutants.mjs) - the mutants must make these tests fail
const { settleToward, settleWord } = process.env.SETTLE_SRC ? await import(pathToFileURL(process.env.SETTLE_SRC).href) : await mod('js', 'rules', 'settle.js');
const deps = { tabletop: GEN2_TABLETOP };

const record = (mount, gridW, gridH, units) => ({
  mount, length: 185, printer: 'any', customBed: { x: null, y: null }, spaceW: null, spaceH: null,
  faceStyle: GEN2.faceplateStyles[0].id, doorStyle: GEN2.doorStyles[0].id, handleStyle: GEN2.handleStyles[0].id,
  wallStagger: false, backCover: false, feet: 'default', buildPlate: 'powder', removedStoppers: [], gridW, gridH,
  placed: units.map(([id, x, y, w, hh]) => ({ id, x, y, w, hh, fill: 'decor', shelves: 0, closure: 'magnet' })), nextId: 100,
});
const at = (b) => Object.fromEntries(b.placed.map((p) => [p.id, [p.x, p.y]]));

/* the report's layout, hanging (under-table 185): top 2 x 3W-1.5H, then 3 x 2W-2H, then 3 x 2W-3H, 2 x 3W-1.5H at the bottom.
   Heights in half-rows: 1.5H = 3, 2H = 4, 3H = 6. Rows: 3 + 4 + 6 + 3 = 16 half-rows = gridH 8. */
const REPORT = () => record('under-table', 6, 8, [
  [1, 0, 0, 3, 3], [2, 3, 0, 3, 3],
  [3, 0, 3, 2, 4], [4, 2, 3, 2, 4], [5, 4, 3, 2, 4],
  [6, 0, 7, 2, 6], [7, 2, 7, 2, 6], [8, 4, 7, 2, 6],
  [9, 0, 13, 3, 3], [10, 3, 13, 3, 3],
]);

test('the report: removing both top 3W cases settles the centre column and the bottom row up, with nothing left floating', () => {
  const b = REPORT();
  // the first removal alone (the right 3W): the centre 2W-2H straddles the remaining 3W and cannot rise - it stays, hooked
  // by its overlap; the right column rises; the bottom-right 3W rises only as far as the centre 2W-3H lets it (not at all)
  b.placed = b.placed.filter((p) => p.id !== 2);
  let Rs = layoutRules(b, GEN2, deps);
  let moved = settleToward(b, Rs);
  assert.deepEqual([...moved.keys()].sort(), [5, 8], `only the right column moved: ${JSON.stringify(at(b))}`);
  assert.deepEqual(at(b)[5], [4, 0]); assert.deepEqual(at(b)[8], [4, 4]);
  assert.deepEqual(at(b)[4], [2, 3], 'the centre column is hooked by the left 3W and stays');
  // the second removal (the left 3W): now EVERYTHING slides up - the bug was that the centre column, already over a gap,
  // was held and never moved again
  b.placed = b.placed.filter((p) => p.id !== 1);
  Rs = layoutRules(b, GEN2, deps);
  moved = settleToward(b, Rs);
  const want = { 3: [0, 0], 4: [2, 0], 5: [4, 0], 6: [0, 4], 7: [2, 4], 8: [4, 4], 9: [0, 10], 10: [3, 10] };
  assert.deepEqual(at(b), want, `three 2W-2H on top, three 2W-3H below, two 3W-1.5H at the bottom: ${JSON.stringify(at(b))}`);
  assert.deepEqual(Rs.unsupportedUnits(), [], 'no unit is left unsupported on an end');
  assert.equal(settleWord(b), 'moved up against what is above');
});

test('the report, second case: dragging the top-right 3W below the bottom row settles everything up in one pass', () => {
  const b = REPORT();
  b.gridH = 10;                                              // room below the stack for the dropped unit (the move grows the grid)
  const u = b.placed.find((p) => p.id === 2); u.x = 3; u.y = 16;   // dropped under the bottom-right 3W
  const Rs = layoutRules(b, GEN2, deps);
  settleToward(b, Rs);
  const a = at(b);
  assert.deepEqual(a[1], [0, 0], 'the left 3W stays on the rail');
  assert.deepEqual([a[3], a[4]], [[0, 3], [2, 3]], 'the left and centre 2W-2H stay hooked under the left 3W (the centre overlaps it)');
  // the right column: its 2W-2H (id 5) sits under nothing now, so it rises to the rail; its 2W-3H follows
  assert.deepEqual(a[5], [4, 0]); assert.deepEqual(a[8], [4, 4]);
  assert.deepEqual(a[10], [3, 13], 'the bottom-right 3W stays: it touches the centre 2W-3H');
  assert.deepEqual(a[2], [3, 16], 'the dropped 3W hangs under the bottom-right 3W');
  // what remains is structural, not floating: the centre 2W-2H hangs by one end under the left 3W, and the bottom-right 3W
  // rests on the centre 2W-3H by one end - the both-ends rule flags both, as the issues badge should
  assert.deepEqual(Rs.unsupportedUnits().map((p) => p.id).sort((a, b) => a - b), [4, 10], `only the two half-hooked units are flagged: ${JSON.stringify(a)}`);
});

test('tabletop: a stack placed half a step above the base settles onto it (Katlin\'s warning)', () => {
  const b = record('tabletop', 4, 3, [[1, 0, 1, 2, 2], [2, 2, 1, 2, 2], [3, 0, 3, 2, 2], [4, 2, 3, 2, 2]]);   // rows 6: the stack floats one half-row above the base
  const Rs = layoutRules(b, GEN2, deps);
  const moved = settleToward(b, Rs);
  assert.deepEqual([...moved.keys()].sort(), [1, 2, 3, 4]);
  assert.deepEqual(at(b), { 1: [0, 2], 2: [2, 2], 3: [0, 4], 4: [2, 4] }, 'everything dropped one half-row onto the base');
  assert.deepEqual(Rs.unsupportedUnits(), []);
  assert.equal(settleWord(b), 'dropped onto what is below');
});

test('settling never moves a unit sideways and stops at any overlap, not only a full one', () => {
  // a 1W hanging under the right half of a 2W: it touches, so it stays; a 1W with nothing above it rises past it
  const b = record('wall', 3, 3, [[1, 0, 0, 2, 2], [2, 1, 2, 1, 2], [3, 2, 4, 1, 2]]);
  const Rs = layoutRules(b, GEN2, deps);
  settleToward(b, Rs);
  assert.deepEqual(at(b), { 1: [0, 0], 2: [1, 2], 3: [2, 0] });
});
