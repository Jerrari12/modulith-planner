/* The Labels workspace's operations (js/rules/labels.js) over the vendored label-list module: the two placing paths, replace,
   fill as the previewed pairs, unassign, remove, add, edit (shared labels clone on "this drawer"), imports, the mirror. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../js/rules/labels.js';

/* the vendored module is a classic script (a UMD over `window`); the repo is type: module, so it is evaluated here as the browser would */
const L = (() => { const mod = { exports: {} }; new Function('module', 'window', readFileSync(new URL('../js/vendor/label-list.js', import.meta.url), 'utf8'))(mod, undefined); return mod.exports; })();

const unit = (id, x, y, fill = 'decor') => ({ id, x, y, w: 1, hh: 2, fill, shelves: 0 });
const build = (over = {}) => ({ mount: 'tabletop', length: 185, faceStyle: 'edgelabel', placed: [unit(1, 0, 0), unit(2, 1, 0), unit(3, 0, 1), unit(4, 1, 1, 'classic')], ...over });
const withLabels = (texts, over) => {
  const b = build(over);
  let st = { list: { format: L.FORMAT, version: L.VERSION, labels: [] }, assignments: {} };
  for (const t of texts) st = L.addLabel(st, { text: t }, { inBuild: true }).state;
  b.labelList = st.list; b.labelAssign = st.assignments;
  return b;
};
const apply = (b, r) => { assert.equal(r.ok, true, r.msg); R.applyResult(L, b, r); return b; };
const ids = (b) => R.labelsOf(b).map((l) => l.id);

test('drawer first: the label goes on, the mirror follows, a second label replaces only with the expected one', () => {
  const b = withLabels(['Screws', 'Nuts']);
  const [s, n] = ids(b);
  apply(b, R.place(L, b, 1, s, null, 'drawer'));
  assert.equal(b.labelAssign['1'], s);
  assert.equal(b.placed[0].label, 'Screws');
  assert.equal(R.place(L, b, 1, n, null, 'drawer').reason, 'stale');   // expect = empty, but Screws is there
  const r = R.place(L, b, 1, n, s, 'drawer');
  assert.match(r.desc, /replaced/);
  apply(b, r);
  assert.equal(b.labelAssign['1'], n);
  assert.equal(R.waiting(L, b).map((l) => l.text).join(), 'Screws');   // the replaced label is ready again
});

test('place several: advances to the next waiting label and stops when drawers or labels run out', () => {
  const b = withLabels(['A', 'B', 'C']);
  const [a, bb, c] = ids(b);
  let r = R.place(L, b, 1, a, null, 'placing'); apply(b, r);
  assert.equal(r.pick, bb);
  r = R.place(L, b, 2, bb, null, 'placing'); apply(b, r);
  assert.equal(r.pick, c);
  r = R.place(L, b, 3, c, null, 'placing'); apply(b, r);
  assert.equal(r.pick, null);
  assert.match(r.msg, /Every label is on a drawer/);
  // a fourth label with no empty drawer left: nothing stays armed
  apply(b, R.add(L, b, { text: 'D' }));
  const d = ids(b)[3];
  const bb2 = withLabels(['X', 'Y']);
  const [x] = ids(bb2);
  bb2.placed = [unit(1, 0, 0)];
  r = R.place(L, bb2, 1, x, null, 'placing');
  assert.equal(r.pick, null);
  assert.match(r.msg, /No empty drawers left/);
  assert.equal(R.eligible(b, b.placed[3]), false);   // the classic drawer never takes one
  assert.equal(R.place(L, b, 4, d).reason, 'drawer');
});

test('a label on exactly one other drawer moves; on several it stays', () => {
  const b = withLabels(['Shared']);
  const [s] = ids(b);
  apply(b, R.place(L, b, 1, s));
  const r = R.place(L, b, 2, s); apply(b, r);
  assert.match(r.desc, /moved from drawer 1/);
  assert.deepEqual(Object.keys(b.labelAssign), ['2']);
  b.labelAssign['1'] = s;   // shared on two drawers
  R.writeMirror(L, b);
  apply(b, R.place(L, b, 3, s));
  assert.deepEqual(Object.keys(b.labelAssign).sort(), ['1', '2', '3']);
});

test('fill takes the previewed pairs in drawer order and refuses a stale preview', () => {
  const b = withLabels(['One', 'Two', 'Three']);
  const pairs = R.fillPairs(L, b);
  assert.deepEqual(pairs.map(([u]) => u), [1, 2, 3]);   // top row first, left to right; the classic drawer is skipped
  apply(b, R.place(L, b, 2, ids(b)[0]));   // a placement between the preview and Place: the pairs differ
  assert.equal(R.fill(L, b, pairs).reason, 'stale');
  const r = R.fill(L, b, R.fillPairs(L, b)); apply(b, r);
  assert.equal(r.desc, 'Filled 2 empty drawers');
  assert.equal(R.waiting(L, b).length, 0);
  assert.equal(R.fillPairs(L, b).length, 0);
  assert.equal(R.fill(L, b, []).reason, 'empty');
});

test('unassign and remove: only a waiting label leaves the build; the last label clears the fields', () => {
  const b = withLabels(['Solo']);
  const [s] = ids(b);
  apply(b, R.place(L, b, 1, s));
  assert.equal(R.remove(L, b, s).reason, 'carried');
  assert.equal(R.unassign(L, b, 1, 'other').reason, 'stale');
  const r = R.unassign(L, b, 1, s); apply(b, r);
  assert.match(r.msg, /ready to place again/);
  assert.equal(b.placed[0].label, undefined);
  apply(b, R.remove(L, b, s));
  assert.equal(b.labelList, undefined);
  assert.equal(b.labelAssign, undefined);
});

test('add refuses an empty label and cuts typed words to the mirror length; edit clones a shared label for one drawer', () => {
  const b = withLabels([]);
  assert.equal(R.add(L, b, { text: '   ' }).reason, 'empty');
  apply(b, R.add(L, b, { text: 'x'.repeat(60) }));
  assert.equal(R.labelsOf(b)[0].text.length, 40);
  apply(b, R.add(L, b, { text: '', badge: { type: 'char', value: 'A' } }));   // an icon-only label is a label
  const s = ids(b)[0];
  apply(b, R.place(L, b, 1, s)); b.labelAssign['2'] = s; R.writeMirror(L, b);
  const r = R.edit(L, b, s, { text: 'Only here' }, 'this', 2); apply(b, r);
  assert.equal(r.cloned, true);
  assert.equal(b.placed[0].label, 'x'.repeat(40));
  assert.equal(b.placed[1].label, 'Only here');
  const all = R.edit(L, b, s, { badge: { type: 'none' } }, 'all'); apply(b, all);
  assert.deepEqual(R.labelById(b, s).badge, { type: 'none' });
});

test('imports: a label list file, a Part Picker items file, a build with typed drawers converts first', () => {
  const b = build();
  b.placed[0].label = 'Typed';
  const doc = { format: L.FORMAT, version: 1, labels: [{ id: 'abcdefghijkl', text: 'From file' }, { text: 'No id' }], batchId: 'batch0001xyz' };
  const got = R.labelsFromDoc(L, doc);
  const r = R.importLabels(L, b, got.labels); apply(b, r);
  assert.equal(r.added.length, 2);
  assert.equal(R.labelsOf(b).length, 3);
  assert.equal(R.labelsOf(b)[0].text, 'Typed');
  assert.equal(b.labelAssign['1'], R.labelsOf(b)[0].id);
  const items = { schema: R.HW_ITEMS_SCHEMA, items: [{ schema: L.HW_ITEM, fields: ['M4', '16'], attributes: [{ path: 'head', text: 'SHCS' }], pinned: ['head'] }] };
  const hw = R.labelsFromDoc(L, items);
  assert.equal(hw.labels[0].text, 'M4 16 · SHCS');
  assert.equal(R.labelShort(hw.labels[0]), 'M4 16');
  const set = R.labelsFromDoc(L, { fmt: 'edgelabel-set', v: 1, labels: [{ text: 'Studio made', badge: { type: 'icon', value: 'screw' }, manual: true }, { text: 'Guessed', badge: { type: 'icon', value: 'nut' }, manual: false }], settings: { 'font-size': 4.5, 'all-caps': false, 'printer': 'mk4' } });
  assert.equal(set.labels.length, 2);
  assert.deepEqual(set.labels[0].badge, { type: 'icon', value: 'screw' });
  assert.equal(set.labels[1].badge, undefined);   // a predicted badge stays a prediction
  assert.deepEqual(set.style, { capMm: 4.5, allCaps: false });
  assert.match(R.labelsFromDoc(L, { hello: 1 }).problem, /not a labels file/);
  assert.match(R.labelsFromDoc(L, { format: L.FORMAT, version: 99, labels: [] }).problem, /newer version/);
});

test('reconcileLoad: an older tool’s typed drawer becomes a label; the mirror is rewritten; a no-label build gains nothing', () => {
  const b = build();
  assert.equal(R.reconcileLoad(L, b), false);
  assert.equal(b.labelList, undefined);
  b.placed[1].label = 'Hand typed'; b.placed[1].labelBadge = { type: 'char', value: 'H' };
  assert.equal(R.reconcileLoad(L, b), true);
  assert.equal(R.labelsOf(b).length, 1);
  assert.equal(b.labelAssign['2'], R.labelsOf(b)[0].id);
  assert.deepEqual(b.placed[1].labelBadge, { type: 'char', value: 'H' });
  // the faceplate changed: assignments are kept, nothing new can be placed
  b.faceStyle = 'essential';
  assert.equal(R.fillPairs(L, b).length, 0);
  assert.equal(R.place(L, b, 1, R.labelsOf(b)[0].id).reason, 'drawer');
});

test('exports: the list without assignments, the text in drawer order', () => {
  const b = withLabels(['Bolts', 'Spare'], { labelStyle: { capMm: 4, allCaps: false } });
  apply(b, R.place(L, b, 3, ids(b)[0]));
  const doc = R.exportDoc(L, b);
  assert.equal(doc.format, L.FORMAT);
  assert.equal(doc.labels.length, 2);
  assert.equal('assignments' in doc, false);
  assert.deepEqual(doc.style, { capMm: 4, allCaps: false });
  assert.equal(R.exportText(L, b), 'Drawer 3: Bolts\n\nReady to place:\nSpare\n');
});

test('a kept copy comes back: assignments stay where the drawer is still the same cell, a moved drawer sends its label to the list', () => {
  const had = withLabels(['Screws', 'Nuts', 'Bolts']);
  const [s, nn] = ids(had);
  apply(had, R.place(L, had, 1, s, null, 'drawer'));
  apply(had, R.place(L, had, 2, nn, null, 'drawer'));
  const copy = { savedAt: 5, list: had.labelList, assign: had.labelAssign, geom: { 1: [0, 0, 1, 2], 2: [1, 0, 1, 2] }, n: 3 };
  // the build comes back without labels, drawer 2 now sits elsewhere (a link from another board reused its id)
  const back = build({ placed: [unit(1, 0, 0), unit(2, 3, 3), unit(3, 0, 1)] });
  const r = R.restoreCopy(L, back, copy);
  assert.equal(r.ok, true, r.msg);
  assert.equal(r.list.labels.length, 3, 'every label is back');
  assert.equal(r.assignments[1], s, 'drawer 1 keeps its label');
  assert.equal(r.assignments[2], undefined, 'the moved drawer is not trusted with its old label');
  R.applyResult(L, back, r);
  assert.equal(back.placed[0].label, 'Screws');
  assert.equal(back.placed[1].label, undefined);
  assert.match(r.msg, /Restored 3 labels \(1 on drawers\)/);
});

test('a kept copy is refused over a build that has labels of its own, and when it holds nothing', () => {
  const b = withLabels(['Own']);
  const copy = { savedAt: 5, list: { format: L.FORMAT, version: L.VERSION, labels: [{ id: 'x1', text: 'Kept' }] }, assign: {}, geom: {}, n: 1 };
  assert.equal(R.restoreCopy(L, b, copy).ok, false);
  assert.equal(R.restoreCopy(L, b, copy).reason, 'has-labels');
  assert.equal(R.restoreCopy(L, build(), null).reason, 'no-copy');
  assert.equal(R.restoreCopy(L, build(), { ...copy, list: { ...copy.list, labels: [] } }).reason, 'no-copy');
});

/* ---- the Part Picker's batch (the planner's modal) ---- */
const part = (id, fields, head = 'SHCS') => ({ schema: 'part-picker-label-item/1', id, fields, attributes: [{ path: 'head', text: head }], pinned: ['head'] });
test('a Part Picker batch appends new parts, updates a part already in the list in place (its id, badge and drawer kept), skips junk, keeps the last of a twice-named part', () => {
  const b = withLabels(['Typed']);
  let r = R.addPartItems(L, b, [part('p1', ['M5', '20']), part('p2', ['M3', '10']), { schema: 'nope' }, part('p2', ['M3', '12'])]);
  assert.equal(r.ok, true, r.msg);
  assert.equal(r.added.length, 2); assert.equal(r.updated.length, 0); assert.equal(r.skipped, 1);
  apply(b, r);
  const p1 = R.labelsOf(b).find((l) => l.hardware && l.hardware.id === 'p1'), p2 = R.labelsOf(b).find((l) => l.hardware && l.hardware.id === 'p2');
  assert.equal(p1.text, 'M5 20 · SHCS');
  assert.equal(p2.text, 'M3 12 · SHCS', 'the batch named p2 twice: the last wins');
  assert.equal(R.labelsOf(b).length, 3);
  // p1 goes on a drawer and gets an icon; then the Picker sends p1 again with a new length
  apply(b, R.place(L, b, 1, p1.id, null, 'drawer'));
  R.labelById(b, p1.id).badge = { type: 'char', value: 'A' };   // the list object was replaced by the place: set it on the live label
  r = R.addPartItems(L, b, [part('p1', ['M5', '30'])]);
  assert.equal(r.ok, true, r.msg);
  assert.deepEqual([r.added.length, r.updated], [0, [p1.id]]);
  apply(b, r);
  const p1b = R.labelById(b, p1.id);
  assert.equal(p1b.text, 'M5 30 · SHCS');
  assert.equal(p1b.hardware.fields[1], '30');
  assert.deepEqual(p1b.badge, { type: 'char', value: 'A' }, 'the badge survives');
  assert.equal(b.labelAssign[1], p1.id, 'the drawer keeps it');
  assert.equal(b.placed[0].label, 'M5 30 · SHCS', 'the mirror follows');
  assert.equal(R.labelsOf(b).length, 3, 'nothing was added twice');
  assert.match(r.msg, /Updated 1 already in the list/);
  assert.equal(R.addPartItems(L, b, [{ schema: 'nope' }]).reason, 'none');
  assert.equal(R.addPartItems(L, b, []).reason, 'none');
});

