/* THE MATERIAL FILTER (js/colors/materials.js, 2026-10-23): the pure half of the picker's material chips. The rule the
   picker applies is stated here against the real catalogue: a line's material from its name, a colour's own where the
   line sells two, the chips a region's lines offer, and the narrowing a chip does (brand groups stay, empty ones go). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILAMENT_DB } from '../js/filament-db.js';
import { MATERIALS, lineMaterials, wordMaterial, colorMaterial, materialsIn, filterByMaterial, labelMaterials } from '../js/colors/materials.js';

const isTpu = (b) => /TPU/.test(b.line);
const CASE = FILAMENT_DB.filter((b) => !isTpu(b));   // what every picker but the feet's offers (colors.js: TPU for the feet alone)
const FEET = FILAMENT_DB.filter(isTpu);

test('a line’s materials come from its name: TPU alone, else PLA and/or PETG in the tags’ order', () => {
  assert.deepEqual(lineMaterials('Panchroma™ PLA'), ['PLA']);
  assert.deepEqual(lineMaterials('Panchroma™ Silk PLA'), ['PLA'], 'silk is a finish, not a material');
  assert.deepEqual(lineMaterials('PETG'), ['PETG']);
  assert.deepEqual(lineMaterials('PLA / PETG'), ['PLA', 'PETG']);
  assert.deepEqual(lineMaterials('PolyFlex™ TPU95'), ['TPU']);
  assert.deepEqual(lineMaterials('Burnt Titanium PLA'), ['PLA']);
  assert.deepEqual(lineMaterials('ABS'), [], 'a material the tags do not know is no material');
  assert.deepEqual(MATERIALS, ['PLA', 'PETG', 'TPU']);
});

test('a colour’s own words name its material as a whole word, or nothing: a palette can name a filament the catalogue lacks', () => {
  assert.equal(wordMaterial('PETG Blue'), 'PETG');
  assert.equal(wordMaterial('Elegoo PLA Black'), 'PLA');
  assert.equal(wordMaterial('Polymaker PolyFlex TPU95 Black'), null, 'TPU95 is not the word TPU: the catalogue, not the words, places the TPU lines');
  assert.equal(wordMaterial('Sunset Orange'), null);
  assert.equal(wordMaterial('PLATINUM'), null, 'a word that merely starts with PLA is not PLA');
  assert.equal(wordMaterial('petg Blue'), 'PETG', 'any case');
  assert.equal(wordMaterial('Platinum grey'), null);
  assert.equal(wordMaterial('PLA/PETG Black'), 'PLA', 'a slash separates words; the first known material wins');
  assert.equal(wordMaterial('TPU Black', ['PLA', 'PETG']), null, 'only among the materials asked for');
  assert.equal(wordMaterial(''), null);
  assert.equal(wordMaterial(null), null);
});

test('a colour’s material: the line’s one, or its own name’s where the line sells two', () => {
  assert.equal(colorMaterial('Panchroma™ PLA', { name: 'Black', label: 'Panchroma Black' }), 'PLA');
  assert.equal(colorMaterial('PolyFlex™ TPU90', { name: 'PolyFlex TPU90 Grey' }), 'TPU');
  assert.equal(colorMaterial('PLA / PETG', { name: 'PETG Black', label: 'Elegoo PETG Black' }), 'PETG');
  assert.equal(colorMaterial('PLA / PETG', { name: 'PLA Grey', label: 'Elegoo PLA Grey' }), 'PLA');
  assert.equal(colorMaterial('PLA / PETG', { label: 'Elegoo PETG Black' }), 'PETG', 'the label serves when the name is missing');
  assert.equal(colorMaterial('PLA / PETG', { name: 'Black' }), null, 'a colour naming neither says nothing');
  assert.equal(colorMaterial('PLA / PETG', { name: 'PLATINUM' }), null, 'a word that merely starts with PLA is not PLA');
  assert.equal(colorMaterial('ABS', { name: 'Black' }), null);
});

test('the real catalogue: every colour has a material, the Elegoo line’s by colour', () => {
  for (const b of FILAMENT_DB) for (const c of b.colors) assert.ok(MATERIALS.includes(colorMaterial(b.line, c)), `${b.line} ${c.label}: ${colorMaterial(b.line, c)}`);
  const elegoo = FILAMENT_DB.find((b) => b.brand === 'Elegoo');
  assert.deepEqual(elegoo.colors.map((c) => [c.label, colorMaterial(elegoo.line, c)]), [['Elegoo PETG Black', 'PETG'], ['Elegoo PLA Black', 'PLA'], ['Elegoo PLA Grey', 'PLA']]);
});

test('the chips a region offers: PLA and PETG for a case, TPU alone for the feet (no row there), none for nothing', () => {
  assert.deepEqual(materialsIn(CASE), ['PLA', 'PETG']);
  assert.deepEqual(materialsIn(FEET), ['TPU']);
  assert.deepEqual(materialsIn([]), []);
  assert.deepEqual(materialsIn([{ line: 'PLA / PETG', colors: [{ name: 'PETG Black' }] }]), ['PETG'], 'a two-material line with PETG colours alone offers PETG alone');
  assert.deepEqual(materialsIn([{ line: 'PLA / PETG', colors: [{ name: 'Black' }] }]), [], 'a colour of no known material offers no chip');
});

test('a chip narrows the groups: brand groups stay with the colours of that material, empty groups go, All is the list as given', () => {
  assert.equal(filterByMaterial(CASE, 'all'), CASE, 'All returns the same array');
  assert.equal(filterByMaterial(CASE, null), CASE);
  assert.equal(filterByMaterial(CASE, undefined), CASE);
  const petg = filterByMaterial(CASE, 'PETG');
  assert.deepEqual(petg.map((g) => [g.brand, g.line]), [['Polymaker', 'PETG'], ['Elegoo', 'PLA / PETG']], 'PETG keeps the Polymaker PETG line and Elegoo');
  assert.deepEqual(petg[1].colors.map((c) => c.label), ['Elegoo PETG Black'], 'Elegoo narrowed to its PETG colour');
  assert.equal(petg[0].colors.length, FILAMENT_DB.find((b) => b.line === 'PETG').colors.length, 'a one-material line keeps every colour');
  assert.equal(petg[1].url, FILAMENT_DB.find((b) => b.brand === 'Elegoo').url, 'a group keeps its other fields');
  for (const g of petg) for (const c of g.colors) assert.equal(colorMaterial(g.line, c), 'PETG');
  const pla = filterByMaterial(CASE, 'PLA');
  assert.deepEqual(pla.map((g) => g.line), ['Panchroma™ PLA', 'Panchroma™ Silk PLA', 'Panchroma™ Translucent PLA', 'PLA / PETG', 'PLA', 'Burnt Titanium PLA', 'PLA'], 'PLA drops the Polymaker PETG line and keeps the order (the last PLA is Polar Filament, 2026-10-26)');
  assert.deepEqual(pla.find((g) => g.brand === 'Elegoo').colors.map((c) => c.label), ['Elegoo PLA Black', 'Elegoo PLA Grey']);
  assert.deepEqual(filterByMaterial(CASE, 'TPU'), [], 'no TPU outside the feet');
  assert.deepEqual(filterByMaterial(FEET, 'TPU').map((g) => g.line), ['PolyFlex™ TPU95', 'PolyFlex™ TPU90']);
  // the chip never changes the catalogue
  assert.equal(FILAMENT_DB.find((b) => b.brand === 'Elegoo').colors.length, 3);
  // a full pass through every chip accounts for every colour exactly once
  const total = CASE.reduce((n, g) => n + g.colors.length, 0);
  assert.equal(materialsIn(CASE).reduce((n, m) => n + filterByMaterial(CASE, m).reduce((k, g) => k + g.colors.length, 0), 0), total, 'PLA + PETG = every colour a case is offered');
});

test('label -> material over the catalogue: what the "In this build" row keys on', () => {
  const by = labelMaterials(FILAMENT_DB);
  assert.equal(by.size, FILAMENT_DB.reduce((n, b) => n + b.colors.length, 0), 'one entry per label (labels are unique)');
  assert.equal(by.get('Elegoo PETG Black'), 'PETG');
  assert.equal(by.get('Elegoo PLA Black'), 'PLA');
  assert.equal(by.get('Panchroma Silk Gold'), 'PLA');
  assert.equal(by.get('Polymaker PolyFlex TPU95 Black'), 'TPU');
  assert.equal(by.get('Printed Solid Mystery Orange'), 'PLA');
  assert.equal(by.get('not a filament'), undefined);
  assert.equal([...by.values()].filter((m) => m === 'PETG').length, FILAMENT_DB.find((b) => b.line === 'PETG').colors.length + 1, 'the PETG labels: the Polymaker line and Elegoo’s one');
});
