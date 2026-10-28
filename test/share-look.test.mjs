/* A shared build carries its colours (2026-10-28, docs/redesign/SHARE-LOOK.md): the record's `look` is cleaned like any
   outside data (schema.js cleanLook), always written, kept through a round trip, and the store stamps it from the stage
   at every serialisation - the address, Undo's write-back and the share form - while Undo still restores the palette. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { cleanLook, LOOK_MAX, BUILD_FIELDS, sanitizeBuild, serializeBuild } from '../js/rules/schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
function catalog() {
  const ctx = vm.createContext({ console });
  vm.runInContext(read('js/vendor/requirement-scope.js'), ctx);
  vm.runInContext(read('js/vendor/tabletop-completion.js'), ctx);
  return vm.runInContext(read('js/catalog/data.js') + '\n;({ GEN2, GEN2_TABLETOP })', ctx);
}
const kit = () => JSON.parse(read('builds/185-tabletop-2w2h.json')).build;
const F = (name, hex, url) => (url ? { name, hex, url } : { name, hex });

test('look is a record field, always written, null when absent or unusable', () => {
  assert.ok(BUILD_FIELDS.includes('look'));
  const { GEN2 } = catalog();
  const old = kit(); delete old.look;
  sanitizeBuild(old, GEN2);
  assert.ok('look' in old, 'written even when absent: a load copies only the fields a record has');
  assert.equal(old.look, null);
  for (const bad of [null, 'x', [], { v: 2, colors: {} }, { colors: {} }]) assert.equal(cleanLook(bad), null, JSON.stringify(bad));
});

test('cleanLook keeps good filaments and drops everything else (outside data)', () => {
  const out = cleanLook({ v: 1, on: true, colors: {
    Label: F('Panchroma Cream', '#f1e7cf', 'https://us.polymaker.com/x'),
    'Label:TEXT': F('Panchroma Navy', '#1f2a44', 'javascript:alert(1)'),   // the link goes, the filament stays
    Case: { name: { toString: null }, hex: '#000000' },                      // a name that is not a string
    Drawer: F('A', '#12345'),                                                // five hex digits
    Faceplate: F('x'.repeat(81), '#123456'),                                 // a name too long
    Handle: F('Rose · 玫瑰 · 🌹', '#cc3366'),                                  // Unicode names are fine
    ['x'.repeat(61)]: F('B', '#123'),                                         // a key too long
    Foot: [F('C', '#123')],                                                  // not a plain object
  }, over: { 3: { Case: F('Polar Seafoam', '#00A37A') }, __proto__x: {}, abc: { Case: F('D', '#123') }, 7: { Case: F('E', 'red') } } });
  assert.deepEqual(out, { v: 1, on: true, colors: {
    Label: F('Panchroma Cream', '#f1e7cf', 'https://us.polymaker.com/x'), 'Label:TEXT': F('Panchroma Navy', '#1f2a44'), Handle: F('Rose · 玫瑰 · 🌹', '#cc3366') },
    over: { 3: { Case: F('Polar Seafoam', '#00A37A') } } });
  // a crafted prototype key never lands on the output's prototype
  const evil = JSON.parse('{"v":1,"on":true,"colors":{"__proto__":{"name":"x","hex":"#000"}},"over":{"__proto__":{"Case":{"name":"x","hex":"#000"}}}}');
  const c = cleanLook(evil);
  assert.deepEqual(c, { v: 1, on: true, colors: {}, over: {} });
  assert.equal(Object.getPrototypeOf(c.colors), Object.prototype);
  assert.equal(cleanLook({ v: 1, on: 'yes', colors: {} }).on, false, 'only true is on');
  assert.equal(cleanLook({ v: 1, on: false, colors: {} }).on, false, 'the instruction colours are a look too');
});

test('past LOOK_MAX the per-unit layer goes and the build-wide colours stay', () => {
  const colors = { Label: F('Panchroma Cream', '#f1e7cf') };
  const over = {}; for (let u = 1; u <= 4000; u++) over[u] = { Case: F('Polar Seafoam Long Name For Size', '#00A37A'), Drawer: F('Panchroma Cream', '#f1e7cf') };
  assert.ok(JSON.stringify({ v: 1, on: true, colors, over }).length > LOOK_MAX, 'the control: the layer is past the cap');
  const out = cleanLook({ v: 1, on: true, colors, over });
  assert.deepEqual(out, { v: 1, on: true, colors, over: {} });
  // the cap is UTF-8 bytes: a layer of Unicode names under 256 K UTF-16 units but over 256 KB in UTF-8 still goes (Sol 01a183df)
  const wide = {}; for (let u = 1; u <= 1400; u++) wide[u] = { Case: F('玫瑰'.repeat(40), '#00A37A') };
  const s = JSON.stringify({ v: 1, on: true, colors, over: wide });
  assert.ok(s.length < LOOK_MAX && new TextEncoder().encode(s).length > LOOK_MAX, `the control: ${s.length} units, ${new TextEncoder().encode(s).length} bytes`);
  assert.deepEqual(cleanLook({ v: 1, on: true, colors, over: wide }).over, {});
  // a realistic fully picked build is far inside it
  const full = {}; for (const k of ['Case', 'CaseExtender', 'SideCover', 'Drawer', 'Faceplate', 'Faceplate:FACE', 'Accent', 'Label', 'Label:TEXT', 'Handle', 'ShelfInsert', 'ShelfLip', 'BackCover', 'CoverU', 'CoverL', 'FootrailU', 'FootrailL', 'Foot', 'Rail', 'Bracket', 'QuickLock', 'Stopper', 'MagnetClip']) full[k] = F('Panchroma Polymaker Teal', '#00a5a5', 'https://us.polymaker.com/products/panchroma-basic?variant=44863271043129');
  const n = JSON.stringify(cleanLook({ v: 1, on: true, colors: full, over: {} })).length;
  assert.ok(n < 4096, `a fully picked look is ${n} characters of JSON`);
});

test('the record round trip keeps the look', () => {
  const { GEN2 } = catalog();
  const look = { v: 1, on: true, colors: { Label: F('Panchroma Cream', '#f1e7cf'), 'Label:TEXT': F('Panchroma Navy', '#1f2a44') }, over: { 1: { Faceplate: F('Polar Seafoam', '#00A37A') } } };
  const rec = { ...kit(), look };
  sanitizeBuild(rec, GEN2);
  assert.deepEqual(serializeBuild(rec).look, look);
});

test('the store stamps the stage look at every serialisation; Undo restores the palette and the record agrees', async () => {
  const { createStore } = await import('../js/state/store.js');
  const { GEN2, GEN2_TABLETOP } = catalog();
  // a stand-in stage: its palette, as the history's extra and the record's look read it
  let pal = { on: true, colors: { Label: F('Panchroma Cold White', '#eef1f4') }, over: {}, user: {} };
  const stageLook = () => ({ v: 1, on: pal.on, colors: structuredClone(pal.colors), over: structuredClone(pal.over) });
  const saves = [];
  const store = createStore(GEN2, { tabletop: GEN2_TABLETOP, extra: { get: () => structuredClone(pal), set: (v) => { pal = structuredClone(v); } }, look: stageLook, onSave: (s) => saves.push(JSON.parse(s)) });
  store.load(kit());
  assert.deepEqual(store.serialize().look, stageLook(), 'serialize stamps the current look');
  // a palette edit, as commitColors makes one: the stage changes, then an empty commit
  pal = { ...pal, colors: { ...pal.colors, Label: F('Panchroma Cream', '#f1e7cf') } };
  store.flush(); store.commit(() => {}, 'palette'); store.flush();
  assert.equal(saves.at(-1).look.colors.Label.name, 'Panchroma Cream', 'the address write carries the new body colour');
  assert.equal(JSON.parse(decodeURIComponent(escape(atob(store.hash())))).look.colors.Label.name, 'Panchroma Cream', 'and so does the share form');
  // a change not yet flushed is still in the share form: serialize stamps it, not the history
  pal = { ...pal, colors: { ...pal.colors, 'Label:TEXT': F('Panchroma Navy', '#1f2a44') } };
  assert.equal(store.serialize().look.colors['Label:TEXT'].name, 'Panchroma Navy');
  pal = { ...pal, colors: { Label: F('Panchroma Cream', '#f1e7cf') } };
  // Undo puts the palette back through extra.set, and the record written back says the same
  assert.equal(store.undo(), true);
  assert.equal(pal.colors.Label.name, 'Panchroma Cold White');
  assert.equal(saves.at(-1).look.colors.Label.name, 'Panchroma Cold White', 'Undo\'s write-back carries the restored look');
  // a look with the instruction colours chosen travels as on: false
  pal = { ...pal, on: false };
  assert.equal(store.serialize().look.on, false);
});
