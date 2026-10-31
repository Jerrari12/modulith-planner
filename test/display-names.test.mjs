// The names the planner shows (js/ui/names.js; Joey 2026-10-16: "Case 185", no GEN2). Display only: every stored name
// keeps its GEN2 form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partName, buildName, noteText, tabTitle } from '../js/ui/names.js';

test('a sized part reads Name, collection, size', () => {
  assert.equal(partName('GEN2 185 Case - 2W-1H'), 'Case 185 · 2W-1H');
  assert.equal(partName('GEN2 115 Case Extender - 1W-1H'), 'Case Extender 115 · 1W-1H');
  assert.equal(partName('GEN2 185 Cover Lower (CL) - 1W'), 'Cover Lower 185 (CL) · 1W');
  assert.equal(partName('GEN2 185 Foot Rail Upper (FR-U) - 2W'), 'Foot Rail Upper 185 (FR-U) · 2W');
  assert.equal(partName('GEN2 59-1W-0.5H Classic Drawer'), 'Classic Drawer 59 · 1W-0.5H');
  assert.equal(partName('GEN2 185-2W-1.5H Gridfinity Decor Drawer'), 'Gridfinity Decor Drawer 185 · 2W-1.5H');
  assert.equal(partName('GEN2 185 Shelf Inserts'), 'Shelf Inserts 185');
});

test('a part with no collection number just loses the prefix; a non-GEN2 name is untouched', () => {
  assert.equal(partName('GEN2 QuickLock - Right'), 'QuickLock - Right');
  assert.equal(partName('GEN2 Decor Handles - Deco Series'), 'Decor Handles - Deco Series');
  assert.equal(partName('GEN2 Under Table Rails - 185'), 'Under Table Rails - 185');
  assert.equal(partName('M3 x 8 socket head screw'), 'M3 x 8 socket head screw');
  assert.equal(partName(undefined), '');
});

test('a parts note loses the old name, and nothing else moves', () => {
  assert.equal(noteText('Included with each case model, or print from the universal GEN2 Hardware pack.'), 'Included with each case model, or print from the universal Hardware pack.');
  assert.equal(noteText('Cases QuickLock together.'), 'Cases QuickLock together.');
  assert.equal(noteText(undefined), '');
});

test('build names and the tab title', () => {
  assert.equal(buildName('The Mighty Bit Bunker · GEN2 Custom · 185'), 'The Mighty Bit Bunker · Custom · 185');
  assert.equal(buildName('GEN2 185 Tabletop Kit 2W-2H'), '185 Tabletop Kit 2W-2H');
  assert.equal(buildName('My shop wall'), 'My shop wall');
  assert.equal(tabTitle('The Mighty Bit Bunker · GEN2 Custom · 185'), 'The Mighty Bit Bunker · Custom · 185 · MODULITH Planner');
  assert.equal(tabTitle(null), 'MODULITH Planner (formerly GEN2) · plan a 3D-printable modular storage build');
});

test('the old name stays in the title a search engine reads, and the page and the tab say the same words (Joey 2026-10-31)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(/<title>([^<]*)<\/title>/.exec(html)[1], tabTitle(null));
  // Google cuts a title at about 60 characters: the old name has to come before that
  assert.match(tabTitle(null).slice(0, 40), /\(formerly GEN2\)/);
});
