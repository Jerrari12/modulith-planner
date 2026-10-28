/* The store (js/state/store.js): the planner's load path, undo history and the share-link form, under node. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
function catalog() {
  const ctx = vm.createContext({ console });
  vm.runInContext(read('js/vendor/requirement-scope.js'), ctx);
  vm.runInContext(read('js/vendor/tabletop-completion.js'), ctx);
  return vm.runInContext(read('js/catalog/data.js') + '\n;({ GEN2, GEN2_TABLETOP })', ctx);
}
const kit = () => JSON.parse(read('builds/185-tabletop-2w2h.json')).build;

test('load sanitises, normalises the tabletop grid and keeps the kit intact', async () => {
  const { createStore } = await import('../js/state/store.js');
  const { GEN2, GEN2_TABLETOP } = catalog();
  const saves = [];
  const store = createStore(GEN2, { tabletop: GEN2_TABLETOP, onSave: (s) => saves.push(s) });
  const r = store.load(kit());
  assert.equal(r.ok, true); assert.equal(r.dropped, 0);
  assert.equal(store.state.placed.length, 3);
  assert.match(store.state.buildId, /^[a-z0-9]{8,32}$/, 'a kit without an id is minted one');
  assert.equal(store.state.gridH, 3, 'the tabletop grid follows the build plus the palette headroom (syncTabletopGrid)');
  assert.equal(saves.length, 0, 'the baseline is not written back');
  assert.equal(store.canUndo, false);
  assert.equal(store.load({ placed: [], schema: 99 }).tooNew, true, 'a newer schema is refused');
  assert.equal(store.refusedNewer, true);
});

test('commit, undo, redo: history coalesces, ids are never reused, the hash round-trips', async () => {
  const { createStore } = await import('../js/state/store.js');
  const { serializeBuild } = await import('../js/rules/schema.js');
  const { GEN2, GEN2_TABLETOP } = catalog();
  const saves = [];
  const store = createStore(GEN2, { tabletop: GEN2_TABLETOP, onSave: (s) => saves.push(s) });
  store.load(kit());
  const idA = store.commit((s) => { const id = s.nextId++; s.placed.push({ id, x: 2, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0 }); return id; });
  store.flush();
  assert.equal(store.state.placed.length, 4); assert.equal(store.canUndo, true); assert.equal(saves.length, 1);
  assert.equal(store.undo(), true); assert.equal(store.state.placed.length, 3);
  assert.equal(store.state.nextId, idA + 1, 'an undo keeps the id watermark: "place, undo, place" never reuses an id');
  assert.equal(store.redo(), true); assert.equal(store.state.placed.length, 4);
  assert.equal(store.redo(), false);
  // the share-link form decodes to the serialised record
  const decoded = JSON.parse(decodeURIComponent(escape(atob(store.hash()))));
  assert.deepEqual(decoded, serializeBuild(store.state));
  assert.deepEqual(Object.keys(decoded).sort(), ['backCover', 'buildId', 'buildPlate', 'customBed', 'doorStyle', 'faceStyle', 'feet', 'gridH', 'gridW', 'handleStyle', 'labelAssign', 'labelList', 'labelPalette', 'labelStyle', 'length', 'mount', 'nextId', 'placed', 'plateParts', 'printer', 'removedStoppers', 'sideCovers', 'spaceH', 'spaceW', 'wallStagger']);   // sideCovers (2026-10-20), plateParts (2026-10-26) and labelPalette (2026-10-28): the planner's own fields
  // two commits inside the coalescing window land as one entry
  store.commit((s) => { s.placed[0].x = 0; }); store.commit((s) => { s.placed[0].x = 1; });
  store.flush();
  store.undo();
  assert.equal(store.state.placed[0].x, 2, 'one undo reverts both coalesced edits');
});

test('the rules see the record: an unsupported unit, Fix structure, gravity-style settle', async () => {
  const { createStore } = await import('../js/state/store.js');
  const { GEN2, GEN2_TABLETOP } = catalog();
  const store = createStore(GEN2, { tabletop: GEN2_TABLETOP });
  store.load(kit());
  store.commit((s) => { s.placed.find((u) => u.id === 1).x = 0; });   // the left support slides out from under the 2W
  const R = store.rules();
  assert.equal(R.unsupportedUnits().length, 1);
  assert.equal(R.instructionsBlockReason().code, 'unsupported');
  const r = store.commit((s, Rs) => Rs.fixStructure());
  assert.equal(r.added, 1); assert.equal(store.rules().unsupportedUnits().length, 0);
});

/* Joey 2026-10-28: his tabletop build said "6 units not supported on both ends" after a tab switch, and the 2D board
   showed it floating half a row above the table. The live grid had a half height (7.5H, picked with a 0.5H size in the
   palette) and the record reads it back as 8H, a row of headroom grown UNDER the units; syncTabletopGrid counted from the
   top and left the build up there. His board's units, [id, x, y, w, hh, fill] with y and hh in half-rows from the top. */
test('a tabletop build read back with a rounded-up grid still stands on the table', async () => {
  const { createStore } = await import('../js/state/store.js');
  const { GEN2, GEN2_TABLETOP } = catalog();
  const units = [[1, 0, 13, 2, 2], [2, 0, 11, 1, 2], [3, 2, 13, 1, 2], [4, 1, 11, 2, 2], [5, 3, 14, 1, 1], [6, 4, 14, 1, 1],
    [7, 5, 14, 1, 1], [8, 6, 14, 1, 1], [9, 3, 11, 4, 3], [10, 3, 8, 4, 3], [11, 3, 5, 4, 3], [12, 3, 2, 4, 3], [13, 0, 10, 2, 1],
    [14, 0, 9, 2, 1], [15, 2, 10, 1, 1], [16, 2, 9, 1, 1], [18, 0, 3, 2, 6], [19, 0, 2, 3, 1], [24, 2, 3, 1, 6, 'shelf']];
  const rec = { ...kit(), mount: 'tabletop', gridW: 7, gridH: 7.5, nextId: 30,
    placed: units.map(([id, x, y, w, hh, fill = 'decor']) => ({ id, x, y, w, hh, fill, shelves: 0, ...(fill === 'shelf' ? { lip: 'front' } : {}) })) };
  for (const h of [1, 0.5]) {
    const store = createStore(GEN2, { tabletop: GEN2_TABLETOP });
    store.state.selected = { w: 4, h };
    store.load(JSON.parse(JSON.stringify(rec)));
    for (let trip = 0; trip < 2; trip++) {
      const s = store.state, bottom = Math.max(...s.placed.map((u) => u.y + u.hh));
      assert.equal(bottom, s.gridH * 2, `the bottom row is on the table (palette ${h}H, trip ${trip})`);
      assert.deepEqual(store.rules().unsupportedUnits().map((u) => u.id), [], `nothing unsupported (palette ${h}H, trip ${trip})`);
      store.load(JSON.parse(decodeURIComponent(escape(atob(store.hash())))));   // a reload or a re-opened link
    }
  }
});
