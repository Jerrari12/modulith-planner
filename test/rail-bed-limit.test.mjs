/* THE BED LIMIT ON THE RAILS (2026-10-19): the 3D model tiles the under-table rails and the wall brackets with the
 * same width cap the parts list uses, so a bed-limited printer sees the same sections in both.
 *
 * A user of the original planner (relayed by Joey, 2026-10-19): "the table rails list on the left are 3 270x3w rails
 * + 1 270x2w ... The 3D diagram shows 2 270x4w + 1 270x3w. While technically that works, a Core One L cannot print
 * something 4w." The bill (js/rules/bom.js railSections, the planner's own rule) caps a rail section at the widest
 * that fits the chosen bed; the generator always reached for 4W. Now generateManifest takes the catalog and tiles
 * with bedLimits(build, catalog); with no catalog (every golden, every older test) nothing changes.
 *
 * Pure node, like the BOM tests: the catalog is the vendored classic script run in a vm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { generateManifest, bedLimits } = await import(pathToFileURL(join(root, 'js', 'generate.js')).href);
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);

const unit = (id, x, y, w, hh, fill = 'decor', o = {}) => ({ id, x, y, w, hh, fill, shelves: 0, closure: 'none', ...o });
const rec = (o) => {
  const b = { mount: 'under-table', length: 270, printer: 'any', customBed: { x: null, y: null }, faceStyle: 'essential', handleStyle: 'deco',
    wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [], gridW: 12, gridH: 1, nextId: 50, placed: row([2]), ...o };
  sanitizeBuild(b, GEN2);
  return b;
};
/* a flat row of the given widths, left to right, at y (the top on a hanging mount, the floor on a tabletop with gridH 1) */
const row = (widths, y = 0) => { let x = 0; return widths.map((w, i) => { const u = unit(i + 1, x, y, w, 2); x += w; return u; }); };
const gen = (b) => { const g = generateManifest(b, { catalog: GEN2 }); assert.deepEqual(g.errors, [], JSON.stringify(g.errors)); return g.manifest; };

/* the stage's sections of one node family, left to right, by width ("UnderTableRail_270-3W" -> 3) */
const drawn = (m, re) => m.instances.filter((i) => re.test(i.node)).sort((a, b) => a.pos[0] - b.pos[0]).map((i) => +re.exec(i.node)[1]);
/* the manifest's parts rows of that family, { width: qty } */
const rows = (m, re) => Object.fromEntries(m.parts.filter((p) => re.test(p.node)).map((p) => [+re.exec(p.node)[1], p.qty]));
/* the bill's sections of a mount part, { width: qty }, from the row name or its variant ("3W section") */
const billed = (b, name) => {
  const out = {};
  for (const r of bomRows(computeBom(b, GEN2) || [], null)) {
    if (!r.name.startsWith(name)) continue;
    const m = /(\d)W/.exec(r.variant || r.name);
    if (m) out[+m[1]] = (out[+m[1]] || 0) + r.qty;
  }
  return out;
};
const mix = (list) => list.reduce((o, w) => { o[w] = (o[w] || 0) + 1; return o; }, {});
const UT_RAIL = /^UnderTableRail_270-(\d)W$/, BRACKET = /^WallMount_Lite_(\d)W$/, FRL = /^FR-L_270-(\d)W$/, FRU = /^FR-U_270-(\d)W$/;

test('bedLimits: the bill\'s rule - a Core One L prints a 3W 270 rail, not a 4W; no printer or no catalog is unlimited', () => {
  assert.deepEqual(bedLimits(rec({ printer: 'coreonel' }), GEN2), { rail: 3, bracket: 3 });   // 300 x 300: 264 fits, 352 does not
  assert.deepEqual(bedLimits(rec({ printer: 'any' }), GEN2), { rail: 4, bracket: 3 });
  assert.deepEqual(bedLimits(rec({ printer: 'coreonel' }), null), { rail: 4, bracket: 3 });
  assert.deepEqual(bedLimits(rec({ printer: 'mk4' }), GEN2), { rail: 1, bracket: 2 });   // 250 x 210: a 270 rail fits no way round; the bill still floors at 1W
  assert.deepEqual(bedLimits(rec({ printer: 'custom', customBed: { x: 400, y: 400 } }), GEN2), { rail: 4, bracket: 3 });
  assert.deepEqual(bedLimits({ length: 270, printer: 'custom', customBed: { x: null, y: 400 } }, GEN2), { rail: 4, bracket: 3 }, 'a half-typed custom bed is no bed (the schema fills it before a record is saved)');
  assert.deepEqual(bedLimits(rec({ length: 185, printer: 'mini' }), GEN2), { rail: 1, bracket: 2 });   // 180 x 180: a 185 fits no way round
});

test('an 11W under-table row: a 3W limit tiles 3+3+3+2, a 4W limit 4+4+3, and the manifest rows follow the instances', () => {
  const placed = row([2, 3, 3, 3]);
  const limited = gen(rec({ printer: 'coreonel', placed }));
  assert.deepEqual(drawn(limited, UT_RAIL), [3, 3, 3, 2]);
  assert.deepEqual(rows(limited, UT_RAIL), { 3: 3, 2: 1 });
  const open = gen(rec({ printer: 'any', placed }));
  assert.deepEqual(drawn(open, UT_RAIL), [4, 4, 3]);
  assert.deepEqual(rows(open, UT_RAIL), { 4: 2, 3: 1 });
  // without the catalog the generator cannot know the bed, and tiles as every golden was recorded
  assert.deepEqual(drawn(generateManifest(rec({ printer: 'coreonel', placed })).manifest, UT_RAIL), [4, 4, 3]);
  // the user's report, in the bill's own words: the Core One L bills 3 x 3W + 1 x 2W, and now the model shows them
  assert.deepEqual(billed(rec({ printer: 'coreonel', placed }), 'GEN2 Under Table Rails - 270'), { 3: 3, 2: 1 });
});

test('the model and the bill agree on the under-table rails and their screws for every printer and several row widths', () => {
  const printers = [...GEN2.printers.map((p) => p.id), 'custom'];
  for (const widths of [[1], [2], [3], [2, 3], [1, 2, 2], [2, 3, 3, 3], [3, 3, 3, 3]]) for (const printer of printers) {
    const b = rec({ printer, customBed: printer === 'custom' ? { x: 220, y: 220 } : { x: null, y: null }, placed: row(widths) });
    const m = gen(b);
    const got = mix(drawn(m, UT_RAIL));
    assert.deepEqual(got, billed(b, 'GEN2 Under Table Rails - 270'), `${printer} ${widths.join('+')}`);
    assert.deepEqual(rows(m, UT_RAIL), got, `${printer} ${widths.join('+')}: the manifest rows`);
    const screws = bomRows(computeBom(b, GEN2) || [], null).find((r) => r.hardware && /wood screws/i.test(r.name)).qty;
    assert.equal(m.parts.find((p) => p.type === 'Screw').qty, screws, `${printer} ${widths.join('+')}: the screws`);
  }
});

test('the wall brackets follow the same cap: a 7W row is 3+3+1 on any printer, 2+2+2+1 on an MK4', () => {
  const placed = row([2, 3, 2]);
  assert.deepEqual(drawn(gen(rec({ mount: 'wall', length: 185, printer: 'any', placed })), BRACKET), [3, 3, 1]);
  assert.deepEqual(drawn(gen(rec({ mount: 'wall', length: 185, printer: 'mk4', placed })), BRACKET), [2, 2, 2, 1]);
  for (const printer of [...GEN2.printers.map((p) => p.id), 'custom']) for (const widths of [[1], [3], [2, 2], [2, 3, 2]]) {
    const b = rec({ mount: 'wall', length: 185, printer, customBed: printer === 'custom' ? { x: 180, y: 180 } : { x: null, y: null }, placed: row(widths) });
    assert.deepEqual(mix(drawn(gen(b), BRACKET)), billed(b, 'GEN2 Wall Mount Kit - Lite - 185'), `${printer} ${widths.join('+')}`);
  }
});

test('the foot rails keep their brick stagger whatever the printer, and match the bill', () => {
  const placed = row([2, 3, 3, 3]);   // an 11W tabletop bottom row on a 1H grid: y 0 is the floor
  for (const printer of ['any', 'coreonel', 'mk4']) {
    const b = rec({ mount: 'tabletop', printer, placed });
    const m = gen(b);
    assert.deepEqual(drawn(m, FRL), [2, 2, 2, 2, 2, 1], `${printer}: the lower layer`);
    assert.deepEqual(drawn(m, FRU), [1, 2, 2, 2, 2, 2], `${printer}: the upper layer, seams offset from the lower`);
    assert.deepEqual(mix(drawn(m, FRL)), billed(b, 'GEN2 270 Foot Rail Lower'), `${printer}: the lower bill`);
    assert.deepEqual(mix(drawn(m, FRU)), billed(b, 'GEN2 270 Foot Rail Upper'), `${printer}: the upper bill`);
  }
});
