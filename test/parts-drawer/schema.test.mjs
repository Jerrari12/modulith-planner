/* M3 (2026-11-05): the parts drawer's record fields - `variant: 'parts'` and `partsLayout` on a decor unit - are the
   record's own (js/rules/schema.js cleanPartsLayout): kept by sanitizeBuild and serializeBuild on every page, flag or
   no flag, the layout checked for SHAPE and bounded here (the generator's tiling check runs where it is read). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { sanitizeBuild, serializeBuild, cleanPartsLayout } from '../../js/rules/schema.js';

// the planner's catalog, a classic-script lexical global, the way the other schema tests load it
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);

const layout = () => ({ v: 2, label: 'large', nc: 2, nr: 1, floor: { mode: 'off', slots: 3 }, outlines: true, comps: [
  { x0: 0, x1: 78.75, y0: 0, y1: 226, holder: true, scoop: 'std', tray: 6, color: 0, item: { type: 'shcs', size: 'M3', length: 10, qty: 100 }, labelId: 'lbl-1' },
  { x0: 80.25, x1: 159, y0: 0, y1: 226 },
] });
const record = (lay = layout()) => ({ mount: 'tabletop', length: 240, gridW: 2, gridH: 1, nextId: 3, placed: [
  { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0, variant: 'parts', partsLayout: lay },
] });

test('the fields survive sanitize and serialize on any page; the layout keeps what the planner edits and drops the rest', () => {
  const d = record(); sanitizeBuild(d, GEN2);
  const u = d.placed[0];
  assert.equal(u.variant, 'parts');
  assert.deepEqual(u.partsLayout, layout());
  const ser = serializeBuild(d);
  assert.deepEqual(ser.placed[0].partsLayout, layout());
  // an unknown key goes, a value out of range is clamped, a part with no type is dropped, a label id too long is dropped
  const odd = layout(); odd.comps[0].cell = 'wells'; odd.comps[0].color = 9; odd.comps[0].tray = 40; odd.comps[1].item = { size: 'M3' }; odd.comps[1].labelId = 'x'.repeat(65); odd.extra = 1;
  const c = cleanPartsLayout(odd);
  assert.ok(!('cell' in c.comps[0]) && !('extra' in c)); assert.equal(c.comps[0].color, 4); assert.equal(c.comps[0].tray, 12);
  assert.ok(!('item' in c.comps[1]) && !('labelId' in c.comps[1]));
  assert.equal(cleanPartsLayout({ ...layout(), comps: [{ x0: 0, x1: 0, y0: 0, y1: 10 }] }), null, 'a box with no width is no layout');
  assert.equal(cleanPartsLayout({ ...layout(), label: 'huge' }), null);
  assert.equal(cleanPartsLayout({ ...layout(), comps: [] }), null);
  assert.equal(cleanPartsLayout({ ...layout(), comps: Array.from({ length: 201 }, () => ({ x0: 0, x1: 1, y0: 0, y1: 1 })) }), null, 'bounded');
  assert.equal(cleanPartsLayout('nope'), null);
  // never on a non-decor unit; a dropped layout keeps the variant (the standard drawer renders, the choice survives)
  const classic = record(); classic.placed[0].fill = 'classic'; sanitizeBuild(classic, GEN2);
  assert.equal(classic.placed[0].variant, undefined);
  const junk = record('nope'); sanitizeBuild(junk, GEN2);
  assert.equal(junk.placed[0].variant, 'parts'); assert.equal(junk.placed[0].partsLayout, undefined);
});

/* a compartment's part may carry its material (2026-11-09): a known one survives sanitize, anything else is dropped */
test('a part’s material is kept when known and dropped otherwise', () => {
  const lay = layout(); lay.comps[0].item.mat = 'brass'; lay.comps[1].item = { type: 'nut', size: 'M3', length: 0, qty: 5, mat: 'gold' };
  const out = cleanPartsLayout(lay);
  assert.equal(out.comps[0].item.mat, 'brass');
  assert.equal('mat' in out.comps[1].item, false, 'an unknown material is dropped, the part kept');
  assert.equal('mat' in cleanPartsLayout(layout()).comps[0].item, false, 'no material, none added');
  const ins = layout(); ins.comps[0].item = { type: 'insert', size: 'M3', length: 0, qty: 5, mat: 'nylon' }; ins.comps[1].item = { type: 'bearing', size: '625', length: 0, qty: 2, mat: 'steel' };
  const o2 = cleanPartsLayout(ins);
  assert.equal('mat' in o2.comps[0].item, false, 'an insert keeps only brass or stainless');
  assert.equal('mat' in o2.comps[1].item, false, 'a type with no materials keeps none');
});

/* the parts list's bin grid rides with the fit (2026-11-09): kept when whole numbers, dropped otherwise, never invented */
test('the fit keeps its bin grid when it has one', () => {
  const lay = layout(); lay.fit = { cap: 0.75, round: false, spare: true, grid: { nc: 5, nr: 4 } };
  assert.deepEqual(cleanPartsLayout(lay).fit, { cap: 0.75, round: false, spare: true, grid: { nc: 5, nr: 4 } });
  lay.fit.grid = { nc: 'x', nr: 4 }; assert.equal('grid' in cleanPartsLayout(lay).fit, false, 'a broken grid is dropped');
  delete lay.fit.grid; assert.equal('grid' in cleanPartsLayout(lay).fit, false, 'none, none added');
});
