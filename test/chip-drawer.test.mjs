/* FILAMENT SAMPLE CHIP DRAWERS (v2611, 2026-11-07)
 *
 * A per-unit VARIANT of the Classic AND the Decor drawer (`variant: 'chips'`; absence = the standard drawer), at
 * 1W-0.5H in every collection: chips stand on edge in two combed lanes. Only the body, its row and its links change:
 * the envelope is the standard 1W-0.5H drawer's (the GLB overlay below), so it lands on EXACTLY that drawer's pose. The
 * Decor one has the Decor Parts Drawer's closed front, so it takes a faceplate but no back cover. Each chip drawer adds
 * one optional row for the chip itself, with the capacity in its note. Not released: every row says "coming soon"
 * until `chipDrawer` leaves GEN2.unreleased (Joey's test print, then the twelve MODULITH pages).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';
import { partThumb } from '../js/workspaces/parts.js';
import { worldExtents } from './lib/glb-spans.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { generateManifest, CHIPS, chipSizeOk, isChips } = await import(pathToFileURL(join(root, 'js', 'generate.js')).href);
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);
const partLinks = vm.runInContext('partLinks', ctx);

const LENGTHS = [59, 115, 165, 185, 240, 270];
const HOLDS = { 59: 16, 115: 44, 165: 70, 185: 80, 240: 106, 270: 122 };   // the handoff's "chips per drawer"
/* planner coordinates: `y` is the unit's TOP row in half-units and the floor is at 2 * gridH */
const build = (L, o = {}) => ({
  mount: L === 59 ? 'wall' : 'tabletop', length: L, faceStyle: 'classic', handleStyle: 'deco',
  wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [], sideCovers: true,
  gridW: 8, gridH: 3, nextId: 9, placed: [], ...o,
});
const drawer = (id, x, fill, w = 1, hh = 1, o = {}) => ({ id, x, y: 6 - hh, w, hh, fill, ...o });
const ok = (b, why) => {
  const g = generateManifest(b);
  assert.deepEqual(g.errors || [], [], `${why}: ${(g.errors || []).join(' ')}`);
  return g.manifest;
};
const inst = (m, re) => m.instances.filter((i) => re.test(i.node));
const mrow = (m, re) => m.parts.find((p) => re.test(p.node));
// the bill takes the record as the store keeps it: sanitized (it fills the defaults computeBom reads, the door style too)
const rows = (b) => { const c = JSON.parse(JSON.stringify(b)); sanitizeBuild(c, GEN2); return bomRows(computeBom(c, GEN2) || [], null); };
const BODY = /^(Decor|Classic|GridfinityDecor|ClassicChip|DecorChip)Drawer_/;
const STYLE = { classic: 'Classic', decor: 'Decor' };

test('the catalog and the generator carry the same chip drawer table, and it is the handoff\'s', () => {
  // compared as JSON: GEN2 lives in a vm context, whose arrays and objects have that realm's prototypes
  assert.equal(JSON.stringify(GEN2.chips.lengths), JSON.stringify(CHIPS.lengths));
  assert.equal(JSON.stringify(GEN2.chips.slotsPerLane), JSON.stringify(CHIPS.slotsPerLane));
  assert.equal(GEN2.chips.lanes, CHIPS.lanes);
  for (const L of LENGTHS) assert.equal(GEN2.chips.lanes * GEN2.chips.slotsPerLane[L], HOLDS[L], `${L}: chips per drawer`);
  assert.ok(GEN2.unreleased.includes('chipDrawer'), 'not released until Joey confirms the test print and the pages are live');
});

test('a chip unit gets the chip body, on exactly the standard drawer\'s pose, in both styles and every collection', () => {
  for (const L of LENGTHS) for (const fill of ['classic', 'decor']) {
    const std = ok(build(L, { placed: [drawer('u1', 0, fill)] }), `${L} ${fill} std`);
    const chip = ok(build(L, { placed: [drawer('u1', 0, fill, 1, 1, { variant: 'chips' })] }), `${L} ${fill} chips`);
    const a = inst(std, new RegExp(`^${STYLE[fill]}Drawer_`)), b = inst(chip, new RegExp(`^${STYLE[fill]}ChipDrawer_`));
    assert.equal(b.length, 1, `${L} ${fill}: one chip drawer`);
    assert.equal(inst(chip, new RegExp(`^${STYLE[fill]}Drawer_`)).length, 0, `${L} ${fill}: and no standard body beside it`);
    assert.equal(b[0].node, `${STYLE[fill]}ChipDrawer_${L}-1W-05H`);
    assert.deepEqual(b[0].pos, a[0].pos, `${L} ${fill}: the pose of the drawer it replaces`);
    assert.equal(b[0].id, a[0].id, 'same instance id, so riders and step phases still find it');
    assert.equal(b[0].owner, 'u1', 'the body names its unit, so the inspector\'s drawer type finds it');
  }
});

test('the Decor chip drawer wears its faceplate and handle as the standard one does; the Classic stays bare', () => {
  for (const faceStyle of ['classic', 'essential', 'edgelabel']) {
    const std = ok(build(185, { faceStyle, placed: [drawer('u1', 0, 'decor', 1, 1, { closure: 'magnet' })] }), 'std');
    const chip = ok(build(185, { faceStyle, placed: [drawer('u1', 0, 'decor', 1, 1, { closure: 'magnet', variant: 'chips' })] }), 'chips');
    const strip = (m) => m.instances.filter((i) => !BODY.test(i.node)).map((i) => [i.id, i.node, i.pos]);
    assert.deepEqual(strip(chip), strip(std), `${faceStyle}: everything but the body is identical`);
  }
  const cl = ok(build(185, { placed: [drawer('u1', 0, 'classic', 1, 1, { variant: 'chips' })] }), 'classic chips');
  assert.equal(inst(cl, /Faceplate|BackCover/).length, 0, 'a Classic drawer is its own front');
});

test('the bill: each style its own row with the capacity, one optional chip row, all "coming soon"', () => {
  for (const L of LENGTHS) {
    const b = build(L, { placed: [drawer('u1', 0, 'classic', 1, 1, { variant: 'chips' }), drawer('u2', 1, 'decor', 1, 1, { variant: 'chips' }),
      drawer('u3', 2, 'decor', 1, 1, { variant: 'chips' })] });
    sanitizeBuild(b, GEN2);
    const r = rows(b);
    const cl = r.find((x) => x.name === `GEN2 ${L}-1W-0.5H Classic Filament Sample Chip Drawer`);
    const de = r.find((x) => x.name === `GEN2 ${L}-1W-0.5H Decor Filament Sample Chip Drawer`);
    assert.ok(cl && de, `${L}: both styles billed: ${r.map((x) => x.name).join(' | ')}`);
    assert.equal(cl.qty, 1); assert.equal(de.qty, 2);
    assert.match(cl.note, new RegExp(`^Holds up to ${HOLDS[L]} filament sample chips on edge in two combed lanes`));
    assert.doesNotMatch(cl.note, /faceplate/);
    assert.match(de.note, /closed front: it takes a faceplate and no back cover/);
    assert.equal(cl.unreleased, true); assert.equal(de.unreleased, true);
    assert.ok(!r.some((x) => /^GEN2 \d+-1W-0\.5H (Classic|Decor) Drawer$/.test(x.name)), `${L}: no standard drawer row`);
    const chip = r.find((x) => x.name === 'GEN2 Filament Sample Chip');
    assert.ok(chip, `${L}: the chip row`);
    assert.equal(chip.qty, 3, 'one per chip drawer: how many to print is in the note');
    assert.equal(chip.optional, true);
    assert.equal(chip.unreleased, true);
    assert.equal(chip.linkAs, `MODULITH ${L} Filament Sample Chip Drawers`, 'the chip ships in the chip drawer download');
    assert.match(chip.note, new RegExp(`these drawers hold up to ${3 * HOLDS[L]}\\.`));
    assert.equal(chip.requirement.scope, 'enhancement', 'a chip drawer is whole with no chips in it');
  }
  const one = build(240, { placed: [drawer('u1', 0, 'decor', 1, 1, { variant: 'chips' })] });
  assert.match(rows(one).find((x) => x.name === 'GEN2 Filament Sample Chip').note, /this drawer holds up to 106\./);
  const none = build(240, { placed: [drawer('u1', 0, 'decor', 1, 1)] });
  assert.ok(!rows(none).some((x) => /Chip/.test(x.name)), 'no chip drawer, no chip row');
});

test('the stage\'s row matches: the part, its note, no links while unpublished', () => {
  const m = ok(build(240, { placed: [drawer('u1', 0, 'decor', 1, 1, { variant: 'chips' })] }), '240 decor chips');
  const r = mrow(m, /^DecorChipDrawer_/);
  assert.equal(r.label, 'Decor Filament Sample Chip Drawer 240-1W-05H');
  assert.equal(r.type, 'Drawer', 'a drawer like any other: focus, interior dims, glides, closure sync');
  assert.match(r.note, /^Holds up to 106 filament sample chips/);
  assert.match(r.note, /coming soon/);
  assert.ok(!r.links, 'no links until the MODULITH pages exist - never the standard drawer page');
});

test('a Decor chip drawer takes no back cover, on the bill, on the stage and in the faceplate step', () => {
  const b = build(185, { backCover: true, placed: [drawer('u1', 0, 'decor'), drawer('u2', 1, 'decor', 1, 1, { variant: 'chips' })] });
  const m = ok(b, 'mixed');
  assert.equal(inst(m, /^BackCover_/).length, 1, 'only the standard drawer gets a cover');
  assert.equal(rows(b).find((x) => /Back Cover/.test(x.name)).qty, 1, 'and only it is billed');
  const fp = m.steps.find((s) => /^Faceplates/.test(s.title));
  assert.match(fp.note, /not on the chip drawers - their front is closed/);
  const only = build(185, { backCover: true, placed: [drawer('u1', 0, 'decor', 1, 1, { variant: 'chips' })] });
  const mo = ok(only, 'all chips');
  assert.equal(inst(mo, /^BackCover_/).length, 0);
  assert.ok(!rows(only).some((x) => /Back Cover/.test(x.name)));
  assert.doesNotMatch(mo.steps.find((s) => /^Faceplates/.test(s.title)).note, /back cover/, 'never told to fit a cover there is no room for');
});

test('a chip variant on a size or fill with no chip drawer renders the standard part, and is kept', () => {
  const cases = [
    [185, drawer('u1', 0, 'decor', 1, 2, { variant: 'chips' }), /^DecorDrawer_185-1W-1H$/],
    [185, drawer('u1', 0, 'classic', 2, 1, { variant: 'chips' }), /^ClassicDrawer_185-2W-05H$/],
  ];
  for (const [L, u, re] of cases) {
    assert.equal(isChips(L, u), false);
    const m = ok(build(L, { placed: [u] }), JSON.stringify(u));
    assert.equal(inst(m, /ChipDrawer_/).length, 0);
    assert.equal(inst(m, re).length, 1, `${JSON.stringify(u)}: the standard part`);
    const b = build(L, { placed: [{ ...u }] }); sanitizeBuild(b, GEN2);
    assert.equal(b.placed[0].variant, 'chips', 'kept, so it comes back when the drawer is resized to 1W-0.5H');
    assert.ok(!rows(b).some((x) => /Chip/.test(x.name)), 'and billed as the standard drawer');
  }
  assert.equal(chipSizeOk(185, { fill: 'classic', w: 1, hh: 1 }), true);
  assert.equal(isChips(185, { fill: 'classic', w: 1, hh: 1 }), false, 'absence is the standard drawer');
  assert.equal(isChips(185, { fill: 'decor', w: 1, hh: 1, variant: 'gridfinity' }), false);
  const shelf = build(185, { placed: [{ id: 'u1', x: 0, y: 4, w: 1, hh: 2, fill: 'shelf', variant: 'chips' }] });
  sanitizeBuild(shelf, GEN2);
  assert.equal(shelf.placed[0].variant, undefined, 'a shelf has no drawer body to swap');
});

test('the chip drawer links its own MODULITH page, never the standard Classic or Decor drawer page', () => {
  for (const style of ['Classic', 'Decor']) {
    const links = partLinks(`GEN2 240-1W-0.5H ${style} Filament Sample Chip Drawer`);
    const std = partLinks(`GEN2 240-1W-0.5H ${style} Drawer`);
    assert.ok(std.stores.some((s) => s.exact), `${style}: the standard drawer has a page (the control)`);
    assert.ok(links.stores.every((s) => !s.exact), `${style}: no page yet, so a search - not the ${style} drawer page`);
  }
});

test('every chip drawer the generator can name has its GLB in the pool, on the standard drawer\'s envelope', () => {
  for (const L of LENGTHS) {
    for (const style of ['Classic', 'Decor']) {
      const node = `${style}ChipDrawer_${L}-1W-05H`;
      const file = join(root, 'parts', String(L), `${node}.lib.glb`);
      assert.ok(existsSync(file), `${node}.lib.glb missing from parts/${L}/`);
      const c = worldExtents(file), s = worldExtents(join(root, 'parts', String(L), `${style}Drawer_${L}-1W-05H.lib.glb`));
      // width and height exact; depth within 0.06 a side (the Classic 59/115 chip drawers are 69.00/125.00 deep, the
      // standard Classic exports 68.89/124.89 - measured 2026-11-07 - and the GLBs are quantized)
      for (let i = 0; i < 3; i++) {
        const tol = i === 2 ? 0.07 : 0.02;
        assert.ok(Math.abs(c.lo[i] - s.lo[i]) < tol && Math.abs(c.hi[i] - s.hi[i]) < tol,
          `${node}: axis ${'xyz'[i]} [${c.lo[i].toFixed(2)}, ${c.hi[i].toFixed(2)}] against ${style}Drawer [${s.lo[i].toFixed(2)}, ${s.hi[i].toFixed(2)}]`);
      }
    }
    assert.ok(existsSync(join(root, 'parts', String(L), 'FilamentChip.lib.glb')), `FilamentChip.lib.glb missing from parts/${L}/`);
  }
});

test('the parts list and the stage name the same render for each chip drawer and the chip', () => {
  for (const L of LENGTHS) for (const style of ['Classic', 'Decor']) {
    assert.equal(partThumb(`GEN2 ${L}-1W-0.5H ${style} Filament Sample Chip Drawer`), `img/parts/${style} Filament Sample Chip Drawer ${L}-1W-05H.png`);
    const m = ok(build(L, { placed: [drawer('u1', 0, style.toLowerCase(), 1, 1, { variant: 'chips' })] }), `${L} ${style}`);
    assert.equal(mrow(m, /ChipDrawer_/).img, `img/parts/${style} Filament Sample Chip Drawer ${L}-1W-05H.png`);
  }
  assert.equal(partThumb('GEN2 Filament Sample Chip'), 'img/parts/Filament Sample Chip.png');
});

// the 256 px BOM thumbnails (2026-11-07, D:\Render Projects\Filament Sample Chip Drawers\chip_thumbs.py): each style by its own
// family's recipe, so a chip drawer looks like its standard drawer in the parts list; the chip flat, label face up
test('every chip drawer and the chip have a thumbnail on the parts host', () => {
  for (const L of LENGTHS) for (const style of ['Classic', 'Decor'])
    assert.ok(existsSync(join(root, 'img', 'parts', `${style} Filament Sample Chip Drawer ${L}-1W-05H.png`)), `${style} ${L}: thumbnail missing`);
  assert.ok(existsSync(join(root, 'img', 'parts', 'Filament Sample Chip.png')), 'the chip: thumbnail missing');
});
