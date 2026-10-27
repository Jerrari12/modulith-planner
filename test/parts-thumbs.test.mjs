/* A RENDER ON EVERY PARTS ROW (Joey, 2026-10-27: "why not include BOM thumbnail images for each part, we should have them?").
 * The browser-free half: every row name the BOM can bill, over every mount, length, faceplate and handle style, drawer kind
 * and size, maps through parts.js partThumb to a file the parts host has (img/parts/ here is that pool: a junction locally,
 * CI's checkout of Jerrari12/gen2-parts), except the bought parts nobody has photographed and the render batches' known
 * gaps - which this test also keeps honest: a gap that gets its render fails until it leaves the list. The e2e suite
 * (e2e/workspaces.mjs) proves the renders load in the page, on a desktop and in the phone sheet. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';
import { partThumb } from '../js/workspaces/parts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);

/* the bought parts with no photograph (generate.js imgFor: no stand-in for a bought part), and the renders the host lacks */
const NO_PHOTO = new Set(['M3×6mm socket head screw', 'M3×12mm socket head screw', 'M3 hex nut', 'Adhesive rubber feet']);
const KNOWN_GAPS = new Set(['img/parts/Decor Drawer 270-4W-1H.png', 'img/parts/SideCover_59-2H.png', 'img/parts/SideCover_59-3H.png']);

/* the axes each name depends on, crossed only where it depends on them (the full product took 39 s): every unit kind and
   size on every mount and length; every faceplate style at every size; every style, handle and foot on every mount and length */
function allRows() {
  const out = new Map();
  const bill = (mount, length, w, h, kind, { faceStyle = 'edgelabel', handleStyle = 'deco', feet = 'tpu' } = {}) => {
    const unit = { id: 1, x: 0, y: 2, w, hh: h * 2, fill: kind === 'gridfinity' ? 'decor' : kind, closure: 'magnet', ...(kind === 'gridfinity' ? { variant: 'gridfinity' } : {}), ...(kind === 'shelf' ? { lip: 'both' } : {}) };
    const b = { mount, length, fill: unit.fill, faceStyle, handleStyle, feet, backCover: true, sideCovers: true, gridH: 8, gridW: 5, nextId: 50,
      placed: [unit, { id: 2, x: w, y: 2, w: 1, hh: 2, fill: 'decor' }] };   // a second bottom case: the foot rails
    sanitizeBuild(b, GEN2);
    for (const r of bomRows(computeBom(b, GEN2) || [], null)) out.set(`${r.name}|${r.variant || ''}`, r);
  };
  const W = [1, 2, 3, 4], H = [0.5, 1, 1.5, 2, 3];
  for (const mount of GEN2.mounts.map((m) => m.id)) for (const len of GEN2.lengths) {
    if (mount === 'tabletop' && len.noTabletop) continue;
    for (const kind of ['decor', 'classic', 'shelf', 'gridfinity']) for (const w of W) for (const h of H) bill(mount, len.id, w, h, kind);
    for (const faceStyle of GEN2.faceplateStyles.map((s) => s.id)) for (const handleStyle of GEN2.handleStyles.map((s) => s.id)) for (const feet of ['tpu', 'adhesive']) bill(mount, len.id, 2, 1, 'decor', { faceStyle, handleStyle, feet });
  }
  for (const faceStyle of GEN2.faceplateStyles.map((s) => s.id)) for (const w of W) for (const h of H) bill('tabletop', 185, w, h, 'decor', { faceStyle });
  return [...out.values()];
}

test('every BOM row maps to a render the parts host has, but the unphotographed bought parts and the known gaps', () => {
  const rows = allRows();
  assert.ok(rows.length > 500, `the enumeration reaches the catalog (${rows.length} rows)`);
  const unmapped = rows.filter((r) => !partThumb(r.name, r.variant)).map((r) => r.name);
  assert.deepEqual([...new Set(unmapped)].sort(), [...NO_PHOTO].sort(), 'only the bought parts without a photograph have no render');
  const absent = [...new Set(rows.map((r) => partThumb(r.name, r.variant)).filter(Boolean).filter((p) => !existsSync(join(root, p))))].sort();
  assert.deepEqual(absent, [...KNOWN_GAPS].sort(), 'every mapped file is on the host, but the known gaps (a gap that got its render leaves the list)');
});

test('the names map as the host spells its files', () => {
  assert.equal(partThumb('GEN2 185-2W-0.5H Decor Drawer'), 'img/parts/Decor Drawer 185-2W-05H.png');
  assert.equal(partThumb('GEN2 Classic Pro Decor Faceplate - 2W-1H'), 'img/parts/ClassicPro_2W-1H.png', 'Classic Pro is not Classic');
  assert.equal(partThumb('GEN2 Classic Decor Faceplate - 2W-1.5H'), 'img/parts/ClassicDecor_2W-15H.png');
  assert.equal(partThumb('GEN2 185 Case Extender - 3W-1H'), 'img/parts/Case Extender 185-3W.png', 'an extender is not a case');
  assert.equal(partThumb('GEN2 Under Table Rails - 270', '3W section'), 'img/parts/Rails 270-3W.png', 'the section picks the width');
  assert.equal(partThumb('GEN2 Wall Mount Kit - Lite - 185', '2W section'), 'img/parts/WallMount_Lite_2W.png');
  assert.equal(partThumb('GEN2 Decor Handles - BlockBar Series'), 'img/parts/Handle_BlockBar_A.png');
  assert.equal(partThumb('M3 hex nut'), null);
});
