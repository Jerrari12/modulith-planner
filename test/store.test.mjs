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
  assert.deepEqual(Object.keys(decoded).sort(), ['backCover', 'buildId', 'buildPlate', 'customBed', 'doorStyle', 'faceStyle', 'feet', 'gridH', 'gridW', 'handleStyle', 'labelAssign', 'labelList', 'labelStyle', 'length', 'mount', 'nextId', 'placed', 'printer', 'removedStoppers', 'sideCovers', 'spaceH', 'spaceW', 'wallStagger']);   // sideCovers: the planner's own field, 2026-10-20
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
