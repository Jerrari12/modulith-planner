/* THE PARTS LIST NAMES THE FILAMENT EACH PART PRINTS IN (Joey, 2026-10-18, on the Parts tab after choosing colours: "the
 * parts have the instructions colors assigned to them, which is kind of confusing after assigning chosen colors to it").
 * The browser-free half: every BOM row name maps to the stage's part type (or to none, for bought hardware), and the
 * palette snapshot, the words and the swatches read a stage's keysInBuild / filamentsInBuild the way the Colors tab does.
 * The e2e suite (e2e/workspaces.mjs) proves the chips, the line and the CSV in the page. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';
import { typeOf, paletteSnapshot, printRegions, printText, swatchesOf, chipFor } from '../js/workspaces/parts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);

/* every row name the BOM emits across the mounts, the feet and the faceplate styles, with a magnet drawer, a classic drawer
   and a lipped shelf */
function allRows() {
  const out = new Map();
  for (const mount of ['tabletop', 'wall', 'undertable']) for (const feet of ['tpu', 'adhesive']) for (const faceStyle of ['edgelabel', 'classicpro', 'chevron']) {
    const b = { mount, length: 185, fill: 'decor', gridH: 4, gridW: 4, nextId: 50, feet, faceStyle, sideCovers: true,
      placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor', closure: 'magnet' }, { id: 2, x: 2, y: 2, w: 1, hh: 2, fill: 'classic' }, { id: 3, x: 3, y: 2, w: 1, hh: 4, fill: 'shelf', lip: 'both' }] };
    sanitizeBuild(b, GEN2);
    for (const r of bomRows(computeBom(b, GEN2) || [], null)) out.set(r.name, r);
  }
  return [...out.values()];
}

test('every printed BOM row maps to a stage part type; bought hardware maps to none', () => {
  const rows = allRows();
  assert.ok(rows.length >= 20, `the control: ${rows.length} distinct rows`);
  const expect = {
    'GEN2 185 Case - 2W-1H': 'Case', 'GEN2 185 Case Extender - 1W-1H': 'CaseExtender', 'GEN2 185 Side Cover - 2H': 'SideCover',
    'GEN2 185-1W-1H Classic Drawer': 'Drawer', 'GEN2 185-2W-1H Decor Drawer': 'Drawer', 'GEN2 EdgeLabel Decor Faceplate - 2W-1H': 'Faceplate',
    'GEN2 Classic Pro Decor Faceplate - 2W-1H': 'Faceplate', 'GEN2 Decor Handles - Deco Series': 'Handle', 'GEN2 Drawer Stopper - Left': 'Stopper',
    'GEN2 QuickLock - Right': 'QuickLock', 'GEN2 Magnet Clip': 'MagnetClip', 'GEN2 185 Shelf Insert - 1W': 'ShelfInsert', 'GEN2 Shelf Lip - 1W': 'ShelfLip',
    'GEN2 185 Cover Upper (CU) - 2W': 'CoverU', 'GEN2 185 Cover Lower (CL) - 1W': 'CoverL', 'GEN2 Foot (TPU)': 'Foot', 'GEN2 Wall Mount Kit - Lite - 185': 'Bracket',
  };
  for (const [name, type] of Object.entries(expect)) {
    assert.ok(rows.some((r) => r.name === name), `the control: the BOM emits "${name}"`);
    assert.equal(typeOf(name), type, name);
  }
  for (const r of rows) {
    if (r.hardware) assert.equal(typeOf(r.name), null, `bought: ${r.name}`);
    else assert.ok(typeOf(r.name), `printed, so typed: ${r.name}`);
  }
  // the names the BOM does not emit today but the stage knows
  assert.equal(typeOf('GEN2 Decor Faceplate Back Cover - 2W-1H'), 'BackCover');
  assert.equal(typeOf('GEN2 185 Foot Rail Upper (FR-U) - 2W'), 'FootrailU');
  assert.equal(typeOf('GEN2 185 Foot Rail Lower (FR-L) - 1W'), 'FootrailL');
  assert.equal(typeOf('Under-Table Rail 185-2W'), 'Rail');
  assert.equal(chipFor('GEN2 185 Case - 2W-1H'), '#E9E9EC', 'the identification colour is unchanged');
});

/* a stage as the Colors tab sees it: two faceplates, one with its own face colour; one case; bought screws */
const fakeStage = (on) => ({
  palette: () => ({ on }),
  keysInBuild: () => [
    { key: 'Case', type: 'Case', zone: '', count: 1, locked: false, own: 0 },
    { key: 'Faceplate', type: 'Faceplate', zone: '', count: 2, locked: false, own: 1 },
    { key: 'Faceplate:FACE', type: 'Faceplate', zone: 'FACE', count: 2, locked: false, own: 1 },
    { key: 'Screw', type: 'Screw', zone: '', count: 4, locked: true, own: 0 },
    { key: 'QuickLock', type: 'QuickLock', zone: '', count: 2, locked: false, own: 0 },
  ],
  filamentsInBuild: () => ({
    filaments: [
      { name: 'Panchroma Black', hex: '#111111', url: 'https://shop.polymaker.com/black', keys: ['Case', 'Faceplate'] },
      { name: 'Mystery Orange', hex: '#ff7a00', url: 'https://example.com/orange', keys: ['Faceplate:FACE'] },
      { name: 'Teal', hex: '#009999', url: null, keys: ['Faceplate', 'Faceplate:FACE'] },   // one unit's own pick
    ],
    unpicked: [{ key: 'QuickLock', hex: '#b9bcc2', stripe: false }, { key: 'Label:STRIPE', hex: '#56b4e9', stripe: true }],
    count: 4,
  }),
});

test('the palette snapshot: null with the colours off; per type, its regions with their filaments, bought hardware left out', () => {
  assert.equal(paletteSnapshot(fakeStage(false)), null);
  const pal = paletteSnapshot(fakeStage(true));
  assert.deepEqual([...pal.keys()], ['Case', 'Faceplate', 'QuickLock'], 'the screws are bought');
  assert.deepEqual(pal.get('Case').map((g) => [g.key, g.filaments.map((f) => f.name), g.bare]), [['Case', ['Panchroma Black'], null]]);
  assert.deepEqual(pal.get('Faceplate').map((g) => [g.key, g.zone, g.filaments.map((f) => f.name)]), [['Faceplate', '', ['Panchroma Black', 'Teal']], ['Faceplate:FACE', 'FACE', ['Mystery Orange', 'Teal']]]);
  assert.deepEqual(pal.get('QuickLock'), [{ key: 'QuickLock', zone: '', filaments: [], bare: '#b9bcc2' }], 'a region with no pick keeps its identification colour');
  // a stage without the palette API (the static viewer) reads as colours off
  assert.equal(paletteSnapshot({}), null);
  assert.equal(paletteSnapshot({ palette: () => ({ on: true }), keysInBuild: () => { throw new Error('no scene'); } }), null);
});

test('the words: the body first, a zone only when it wears something else, brand prefixes stripped, no pick said', () => {
  const pal = paletteSnapshot(fakeStage(true));
  assert.equal(printText(pal.get('Case')), 'Black');
  assert.equal(printText(pal.get('Faceplate')), 'Black / Teal · face Mystery Orange / Teal');
  assert.equal(printText(pal.get('QuickLock')), 'no filament picked yet');
  assert.deepEqual(printRegions(pal.get('Case')), [{ zone: '', items: [{ name: 'Black', url: 'https://shop.polymaker.com/black' }] }]);
  // a zone that follows its body is not repeated
  assert.equal(printText([{ key: 'Drawer', zone: '', filaments: [{ name: 'Red', hex: '#f00' }], bare: null }, { key: 'Drawer:FACE', zone: 'FACE', filaments: [{ name: 'Red', hex: '#f00' }], bare: null }]), 'Red');
  // a body with no pick beside a zone with one
  assert.equal(printText([{ key: 'Faceplate', zone: '', filaments: [], bare: '#aaa' }, { key: 'Faceplate:FACE', zone: 'FACE', filaments: [{ name: 'Red', hex: '#f00' }], bare: null }]), 'no pick yet · face Red');
  assert.deepEqual(swatchesOf(pal.get('Faceplate')), ['#111111', '#009999', '#ff7a00'], 'the distinct colours, body first');
  assert.deepEqual(swatchesOf(pal.get('QuickLock')), ['#b9bcc2']);
});
