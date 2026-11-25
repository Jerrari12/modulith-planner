/* THE GLASS TOP AND DRAWER INSERTS (2026-11-25, Joey; vault decisions.md, "The Glass Top Coffee Station")
 *
 * Two additive record fields, both absent on every older build:
 *   build.topCover === 'glass'   one printed Glass Top Cover per top case, in place of BOTH cover layers, with a bought
 *                                tempered glass cutting board resting on it; a drawer under it takes no stoppers.
 *                                Only on a 240 tabletop build with a level top whose top cases are each 2W or 4W.
 *   u.insert === 'kcup'          a printed insert in a plain 1H drawer, Classic or Decor, 240-2W or 240-4W.
 * The stage (generate.js) and the bill (rules/bom.js + catalog/data.js) must agree row for row, and a record without
 * either field must bill and draw exactly what it did before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild, serializeBuild, BUILD_FIELDS } from '../js/rules/schema.js';
import { typeOf } from '../js/workspaces/parts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { generateManifest, glassTopOk, insertOf, GLASS_TOP, INSERTS, paletteParentOf } = await import(pathToFileURL(join(root, 'js', 'generate.js')).href);
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);
const partLinks = vm.runInContext('partLinks', ctx);
const HARDWARE_BUY = vm.runInContext('HARDWARE_BUY', ctx);

/* the kit: one 4W-1H drawer over two 2W-1H drawers (Joey, 2026-11-24). `y` is the unit's top row in half-units. */
const kit = (o = {}, units = {}) => ({
  mount: 'tabletop', length: 240, faceStyle: 'chevron', handleStyle: 'deco', wallStagger: false, backCover: false,
  feet: 'tpu', removedStoppers: [], sideCovers: true, gridW: 6, gridH: 4, nextId: 4,
  placed: [
    { id: 1, x: 1, y: 6, w: 2, hh: 2, fill: 'decor', shelves: 0, ...units },
    { id: 2, x: 3, y: 6, w: 2, hh: 2, fill: 'decor', shelves: 0, ...units },
    { id: 3, x: 1, y: 4, w: 4, hh: 2, fill: 'decor', shelves: 0, ...units },
  ], ...o,
});
const clean = (b) => { const d = structuredClone(b); sanitizeBuild(d, GEN2); return d; };
const man = (b) => { const g = generateManifest(b); assert.deepEqual(g.errors || [], []); return g; };
const bill = (b) => bomRows(computeBom(clean(b), GEN2));
const qty = (rows, re) => rows.filter((r) => re.test(r.name || r.label)).reduce((n, r) => n + r.qty, 0);

test('a record without the fields draws and bills the standard covers, with every stopper', () => {
  const { manifest: m } = man(kit());
  assert.equal(qty(m.parts, /^Cover (Lower|Upper)/), 5, 'two layers over a 4W run');
  assert.equal(qty(m.parts, /Drawer Stopper L/), 8);
  assert.ok(!m.parts.some((p) => /Glass|Insert/.test(p.label)));
  assert.ok(!('GlassTop' in m.colors) && !('KCup' in m.colors), 'no colour rides in for parts the build does not have');
  assert.deepEqual(m.steps.map((s) => s.title).filter((t) => /cover|glass/i.test(t)), ['Lower covers', 'Upper covers']);
  const rows = bill(kit());
  assert.equal(qty(rows, /Drawer Stopper - Left/), 8);
  assert.ok(!rows.some((r) => /Glass|Insert/.test(r.name)));
});

test('the glass top: one frame and one board per top case, no standard covers, no stoppers under the glass', () => {
  const { manifest: m, warnings } = man(kit({ topCover: 'glass' }));
  assert.deepEqual(warnings.filter((w) => /glass/i.test(w)), []);
  assert.equal(qty(m.parts, /^Cover (Lower|Upper)/), 0);
  const frame = m.parts.find((p) => p.node === 'GlassTopCover_240-4W'), board = m.parts.find((p) => p.node === 'GlassTop_240-4W');
  assert.equal(frame.qty, 1); assert.equal(frame.type, 'CoverGlass'); assert.ok(!frame.purchased);
  assert.equal(board.qty, 1); assert.equal(board.purchased, true); assert.match(board.label, /14 × 10 in/);
  assert.equal(qty(m.parts, /Drawer Stopper L/), 4, 'only the two lower drawers, whose stoppers sit in the case above');
  // the frame sits where the Cover Lower would, the board on it
  const f = m.instances.find((i) => i.id === 'gtc0'), g = m.instances.find((i) => i.id === 'glass0');
  assert.equal(g.pos[1] - f.pos[1], GLASS_TOP.glassSeat);
  assert.deepEqual(m.steps.map((s) => s.title).filter((t) => /cover|glass/i.test(t)), ['Glass top cover', 'Set the glass']);
  assert.ok('GlassTop' in m.colors && !('CoverGlass' in m.colors), 'the frame has no colour of its own');
  assert.equal(paletteParentOf('CoverGlass'), 'CoverL', 'it wears the Cover Lower\'s, in the guide and in a palette');

  const rows = bill(kit({ topCover: 'glass' }));
  assert.equal(qty(rows, /Cover (Upper|Lower)/), 0);
  assert.equal(qty(rows, /Glass Top Cover - 4W/), 1);
  assert.equal(qty(rows, /Tempered glass cutting board 14 × 10 in/), 1);
  assert.equal(qty(rows, /Drawer Stopper - Left/), 4);
  assert.equal(qty(rows, /Drawer Stopper - Right/), 4);
  assert.ok(!rows.some((r) => /M3×6mm socket head screw/.test(r.name)), 'no cover screws: the frame has no nut pocket row to fill');
  assert.equal(typeOf('GEN2 240 Glass Top Cover - 4W'), 'CoverGlass');
  assert.match(partLinks('MODULITH Glass Top Coffee Station Kit 240').p || JSON.stringify(partLinks('MODULITH Glass Top Coffee Station Kit 240')), /1507379/);
  assert.ok(HARDWARE_BUY['Tempered glass cutting board 14 × 10 in'] && HARDWARE_BUY['Tempered glass cutting board 7 × 10 in'], 'both boards have a buy link');
});

test('two top cases get a frame and a board each, and the step says they tie nothing together', () => {
  const b = kit({ topCover: 'glass' });
  b.placed = [{ id: 1, x: 1, y: 6, w: 2, hh: 2, fill: 'decor', shelves: 0 }, { id: 2, x: 3, y: 6, w: 2, hh: 2, fill: 'decor', shelves: 0 }];
  const { manifest: m } = man(b);
  assert.equal(m.parts.find((p) => p.node === 'GlassTopCover_240-2W').qty, 2);
  assert.equal(m.parts.find((p) => p.node === 'GlassTop_240-2W').qty, 2);
  assert.equal(qty(m.parts, /Drawer Stopper/), 0, 'every drawer is under glass');
  const step = m.steps.find((s) => s.title === 'Glass top covers');
  assert.match(step.note, /don’t tie the cases together/);
  const rows = bill(b);
  assert.equal(qty(rows, /Glass Top Cover - 2W/), 2);
  assert.equal(qty(rows, /Tempered glass cutting board 7 × 10 in/), 2);
  assert.equal(qty(rows, /Drawer Stopper/), 0);
});

test('where a glass top cannot be built the field is ignored: standard covers, with a warning on the stage', () => {
  const cases = {
    'another length': kit({ topCover: 'glass', length: 185 }),
    'a 1W top case': (() => { const b = kit({ topCover: 'glass' }); b.placed = [{ id: 1, x: 1, y: 6, w: 1, hh: 2, fill: 'decor', shelves: 0 }]; return b; })(),
    'a 3W top case': (() => { const b = kit({ topCover: 'glass' }); b.placed = [{ id: 1, x: 1, y: 6, w: 3, hh: 2, fill: 'decor', shelves: 0 }]; return b; })(),
    // the top is not level: a 2W case on half of a 4W one (the 2W is the only unit with nothing above it, and a 2W passes the width rule)
    'a 2W case on a 4W case': (() => { const b = kit({ topCover: 'glass' }); b.placed = [{ id: 1, x: 1, y: 6, w: 4, hh: 2, fill: 'decor', shelves: 0 }, { id: 2, x: 1, y: 4, w: 2, hh: 2, fill: 'decor', shelves: 0 }]; return b; })(),
  };
  for (const [why, b] of Object.entries(cases)) {
    assert.equal(glassTopOk(b), false, why);
    const g = man(b);
    assert.ok(g.warnings.some((w) => /glass top needs/i.test(w)), why + ': the stage says why');
    assert.ok(!g.manifest.parts.some((p) => /Glass/.test(p.label)), why);
    assert.ok(qty(g.manifest.parts, /^Cover Upper/) > 0, why);
    const rows = bill(b);
    assert.ok(!rows.some((r) => /Glass/.test(r.name)), why + ': nor does the bill');
    assert.ok(qty(rows, /Cover Upper/) > 0, why);
  }
  assert.equal(glassTopOk(kit({ topCover: 'glass', mount: 'wall' })), false, 'tabletop only');
});

test('the K-cup insert: one per drawer that chose it, riding its drawer, with a few cups that are never billed', () => {
  const b = kit({}, { insert: 'kcup' });
  const { manifest: m } = man(b);
  assert.equal(m.parts.find((p) => p.node === 'KCupInsert_240-2W').qty, 2);
  assert.equal(m.parts.find((p) => p.node === 'KCupInsert_240-4W').qty, 1);
  assert.equal(m.parts.find((p) => p.node === 'KCupInsert_240-2W').type, 'Insert');
  assert.equal(paletteParentOf('Insert'), 'Drawer');
  assert.ok(!m.parts.some((p) => p.node === 'KCup'), 'a cup is an illustration, not a row');
  const cups = m.instances.filter((i) => i.node === 'KCup');
  assert.equal(cups.length, 2 * INSERTS.kcup.shown[2].length + INSERTS.kcup.shown[4].length);
  assert.ok(cups.every((c) => c.type === 'KCup' && c.prop && /^drw\d+$/.test(c.rides)), 'each has a type, is a prop and rides a drawer');
  for (const i of m.instances.filter((x) => /^ins\d+$/.test(x.id))) assert.match(i.rides, /^drw\d+$/);
  // every insert and cup enters in the Drawers step, and nothing else mentions them
  const ids = new Set(m.instances.filter((i) => /^(ins|kc)\d/.test(i.id)).map((i) => i.id));
  const seen = new Map();
  m.steps.forEach((s) => (s.phases || []).forEach((ph) => [...(ph.enter || []), ...(ph.fade || [])].forEach((e) => { if (ids.has(e.id)) seen.set(e.id, s.title); })));
  assert.equal(seen.size, ids.size, 'none is left invisible');
  assert.deepEqual([...new Set(seen.values())], ['Drawers']);
  assert.match(m.steps.find((s) => s.title === 'Drawers').note, /drop the insert in/);

  const rows = bill(b);
  assert.equal(qty(rows, /K-cup Insert - 2W/), 2);
  assert.equal(qty(rows, /K-cup Insert - 4W/), 1);
  assert.equal(typeOf('GEN2 240 K-cup Insert - 2W'), 'Insert');
});

test('an insert is for a plain 1H drawer of a size it exists in, Classic or Decor: anywhere else it is kept and not billed', () => {
  const u = (o) => ({ id: 1, x: 1, y: 6, w: 2, hh: 2, fill: 'decor', shelves: 0, insert: 'kcup', ...o });
  assert.ok(insertOf(240, u({})));
  assert.ok(insertOf(240, u({ fill: 'classic' })), 'both drawer families (Joey)');
  assert.ok(insertOf(240, u({ w: 4 })));
  assert.equal(insertOf(240, u({ w: 1 })), null);
  assert.equal(insertOf(240, u({ w: 3 })), null);
  assert.equal(insertOf(240, u({ hh: 4, y: 4 })), null, '1H only');
  assert.equal(insertOf(185, u({})), null, '240 only');
  assert.equal(insertOf(240, u({ variant: 'gridfinity' })), null, 'a Gridfinity drawer has its own floor');
  assert.equal(insertOf(240, u({ fill: 'shelf' })), null);
  const b = kit(); b.length = 185; b.placed = [u({})];
  assert.ok(!man(b).manifest.parts.some((p) => /Insert/.test(p.label)));
  assert.ok(!bill(b).some((r) => /Insert/.test(r.name)));
  assert.equal(clean(b).placed[0].insert, 'kcup', 'the choice survives on the record');
});

test('the record: both fields survive a save and a load, junk does not, and absence stays absence', () => {
  assert.ok(BUILD_FIELDS.includes('topCover'));
  const d = clean(kit({ topCover: 'glass' }, { insert: 'kcup' }));
  assert.equal(d.topCover, 'glass');
  assert.ok(d.placed.every((u) => u.insert === 'kcup'));
  const plain = clean(kit());
  assert.equal(plain.topCover, 'standard', 'an older record reads as the standard covers, so a load clears a previous build\'s glass top');
  assert.deepEqual(Object.keys(serializeBuild(plain)), BUILD_FIELDS, 'every field is written, as the store expects');
  assert.ok(plain.placed.every((u) => !('insert' in u)));
  const junk = clean(kit({ topCover: 'standard' }, { insert: 'espresso' }));
  assert.equal(junk.topCover, 'standard');
  assert.ok(junk.placed.every((u) => !('insert' in u)));
  const shelf = clean({ ...kit(), placed: [{ id: 1, x: 1, y: 6, w: 2, hh: 2, fill: 'shelf', shelves: 0, insert: 'kcup' }] });
  assert.ok(!('insert' in shelf.placed[0]), 'drawers only');
});

test('a stack with a gap in it takes no glass top, on the stage and in the bill alike (Sol 01a214c5)', () => {
  // a drawer with nothing directly above it but the top row far above: under a glass top it would have neither a
  // case nor a Cover Lower to seat its stoppers in, so such a build keeps the standard covers
  const gap = kit({ topCover: 'glass' });
  gap.placed = [{ id: 1, x: 1, y: 2, w: 2, hh: 2, fill: 'classic', shelves: 0 }, { id: 2, x: 1, y: 6, w: 2, hh: 2, fill: 'classic', shelves: 0 }];
  assert.equal(glassTopOk(gap), false);
  assert.ok(!bill(gap).some((r) => /Glass/.test(r.name)), 'the bill refuses it too');
  // and on a solid stack the two agree drawer for drawer: no stoppers on the top row, every pair below it
  const solid = kit({ topCover: 'glass' });
  solid.placed = [{ id: 1, x: 1, y: 4, w: 2, hh: 2, fill: 'classic', shelves: 0 }, { id: 2, x: 1, y: 6, w: 2, hh: 2, fill: 'classic', shelves: 0 }];
  const { manifest: m } = man(solid);
  assert.equal(qty(m.parts, /Drawer Stopper L/), 2);
  assert.equal(qty(bill(solid), /Drawer Stopper - Left/), 2);
  assert.ok(m.instances.filter((i) => /^st\d+[LR]$/.test(i.id)).every((i) => m.steps.some((s) => (s.phases || []).some((ph) => (ph.enter || []).some((e) => e.id === i.id)))),
    'every stopper that is drawn is installed in some step');
  // one pair removed by hand drops out of both
  const less = { ...solid, removedStoppers: ['2:0'] };
  assert.equal(qty(man(less).manifest.parts, /Drawer Stopper L/), 1);
  assert.equal(qty(bill(less), /Drawer Stopper - Left/), 1);
});

test('loading a record without the field clears a glass top the previous build had (Sol 01a214c5, checked)', async () => {
  const { createStore } = await import('../js/state/store.js');
  const tctx = vm.createContext({ console });
  for (const f of ['js/vendor/requirement-scope.js', 'js/vendor/tabletop-completion.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), tctx, { filename: f });
  const C = vm.runInContext('({ GEN2, GEN2_TABLETOP })', tctx);
  const store = createStore(C.GEN2, { tabletop: C.GEN2_TABLETOP, onSave: () => {} });
  assert.equal(store.load(kit({ topCover: 'glass' }, { insert: 'kcup' })).ok, true);
  assert.equal(store.state.topCover, 'glass');
  assert.equal(store.load(kit()).ok, true);
  assert.equal(store.state.topCover, 'standard', 'the older record reads as the standard covers');
  assert.ok(store.state.placed.every((u) => !('insert' in u)));
});
