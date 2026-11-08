/* M3 (2026-11-05): the Parts list row for a parts drawer (js/parts-drawer/row.js) and the compartment labels
   (js/parts-drawer/labels.js), pure over a build record and the BOM's rows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../../js/rules/bom.js';
import { sanitizeBuild } from '../../js/rules/schema.js';
import { withPartsDrawers } from '../../js/parts-drawer/row.js';
import { compartmentLabels, addToList } from '../../js/parts-drawer/labels.js';
import { defaultLayout } from '../../js/parts-drawer/unit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);
// the Label Studio's label-list module is a classic script that registers on `window`: a context of its own that is its window
const lctx = vm.createContext({}); lctx.window = lctx;
vm.runInContext(readFileSync(join(root, 'js/vendor/label-list.js'), 'utf8'), lctx, { filename: 'js/vendor/label-list.js' });
const LL = lctx.GEN2LabelList;

const lay = () => { const l = defaultLayout('240-2W'); l.comps[0].item = { type: 'shcs', size: 'M3', length: 10, qty: 100 }; l.comps[5].item = { type: 'nut', size: 'M4', length: 0, qty: 50 }; return l; };
const build = () => { const b = { mount: 'tabletop', length: 240, gridW: 4, gridH: 1, nextId: 4, placed: [
  { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0, variant: 'parts', partsLayout: lay() },
  { id: 2, x: 2, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0 },
], faceStyle: 'edgelabel' }; sanitizeBuild(b, GEN2); return b; };

test('the Parts list: a parts drawer leaves the Decor Drawer row for a row of its own, with the download in place of a link', () => {
  const b = build();
  const rows = bomRows(computeBom(b, GEN2), null);
  const decor = rows.find((r) => r.section === 'Drawers' && /Decor Drawer/.test(r.name));
  assert.equal(decor.qty, 2, 'two decor drawers before');
  const on = withPartsDrawers(rows, b, GEN2, 240, true);
  const still = on.find((r) => r.section === 'Drawers' && /Decor Drawer$/.test(r.name));
  assert.equal(still.qty, 1, 'one left in the aggregate row');
  const custom = on.find((r) => r.partsDrawer);
  assert.ok(custom && /Decor Parts Drawer/.test(custom.name) && custom.variant === 'unit 1' && custom.qty === 1);
  assert.deepEqual(custom.partsDrawer, { unitId: 1, compartments: 20, parts: 2 });
  assert.equal(custom.links, null);
  const drawersIdx = on.map((r, i) => (r.section === 'Drawers' ? i : -1)).filter((i) => i >= 0);
  assert.equal(drawersIdx[drawersIdx.length - 1] - drawersIdx[0] + 1, drawersIdx.length, 'the Drawers rows stay one group');
  assert.equal(on.reduce((n, r) => n + (r.hardware ? 0 : r.qty), 0), rows.reduce((n, r) => n + (r.hardware ? 0 : r.qty), 0), 'the printed count is unchanged');
  assert.deepEqual(withPartsDrawers(rows, b, GEN2, 240, false), rows, 'flag off: the rows as they came');
  // both units parts drawers: the aggregate row goes
  const b2 = build(); b2.placed[1].variant = 'parts'; sanitizeBuild(b2, GEN2);
  const both = withPartsDrawers(bomRows(computeBom(b2, GEN2), null), b2, GEN2, 240, true);
  assert.ok(!both.some((r) => r.section === 'Drawers' && /Decor Drawer$/.test(r.name)));
  assert.equal(both.filter((r) => r.partsDrawer).length, 2);
});

test('compartment labels: the parts give rows in reading order; Add puts them in the list, keyed from the layout side', () => {
  const b = build();
  const rows = compartmentLabels(240, b);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.position, r.text, r.linked]), [['R1C1', 'M3 × 10 SHCS', false], ['R2C1', 'M4 NUT', false]]);
  // the position names the slot in the drawer: an empty first compartment still counts (review 01a1ada5)
  const b1 = build(); delete b1.placed[0].partsLayout.comps[0].item; b1.placed[0].partsLayout.comps[1].item = { type: 'shcs', size: 'M3', length: 10, qty: 100 };
  assert.deepEqual(compartmentLabels(240, b1).map((r) => r.position), ['R1C2', 'R2C1']);
  assert.equal(addToList(LL, b, 240), 2);
  assert.equal(b.labelList.labels.length, 2);
  const again = compartmentLabels(240, b);
  assert.ok(again.every((r) => r.linked && !r.stale));
  assert.equal(b.placed[0].partsLayout.comps[0].labelId, b.labelList.labels[0].id);
  assert.ok(!b.labelAssign || !Object.keys(b.labelAssign).length, 'never on a faceplate');
  // the row's words changed in the list: stale; the part gone: the link is dropped by the editor's commit (not here)
  b.labelList.labels[0].text = 'something else';
  assert.ok(compartmentLabels(240, b)[0].stale);
  assert.equal(addToList(LL, b, 240), 0, 'nothing unlinked left');
  // the record survives the sanitizer with the links
  sanitizeBuild(b, GEN2);
  assert.equal(b.placed[0].partsLayout.comps[0].labelId, b.labelList.labels[0].id);
});
