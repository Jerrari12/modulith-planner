/* The Label plate's channel rules (js/rules/plate.js, step B1): the signature of the label-relevant state, the snapshot and its
   bounds, the handshake's capabilities, and which `selected` answers count. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../js/rules/plate.js';

const L = (() => { const mod = { exports: {} }; new Function('module', 'window', readFileSync(new URL('../js/vendor/label-list.js', import.meta.url), 'utf8'))(mod, undefined); return mod.exports; })();

const unit = (id, x, y, fill = 'decor') => ({ id, x, y, w: 1, hh: 2, fill, shelves: 0 });
const build = (over = {}) => ({ mount: 'tabletop', length: 185, faceStyle: 'edgelabel', buildId: 'buildaaaaaaa', placed: [unit(1, 0, 0), unit(2, 1, 0), unit(3, 0, 1)], ...over });
const withLabels = (texts, over) => {
  const b = build(over);
  let st = { list: { format: L.FORMAT, version: L.VERSION, labels: [] }, assignments: {} };
  for (const t of texts) st = L.addLabel(st, { text: t }, { inBuild: true }).state;
  b.labelList = st.list; b.labelAssign = st.assignments;
  return b;
};
const ids = (b) => b.labelList.labels.map((l) => l.id);
const SESSION = 'sessionabcdef123';

test('the signature follows the label-relevant state only: a move that keeps the drawer order keeps it; a label edit, an assignment, the style, the faceplate, the build or the drawer order change it', () => {
  const b = withLabels(['Screws', 'Nuts'], { placed: [unit(1, 0, 0), unit(2, 1, 0), unit(3, 0, 1), unit(9, 3, 3, 'classic')] });
  const s0 = P.labelSig(b);
  b.placed[2].x = 5;   // drawer 3 moves along its row: still third
  assert.equal(P.labelSig(b), s0, 'a drawer moved without passing another');
  b.placed[3].x = 7;
  assert.equal(P.labelSig(b), s0, 'a classic unit (no label slot) moved');
  b.gridW = 9;
  assert.equal(P.labelSig(b), s0, 'the grid');
  b.placed[0].x = 6;   // drawer 1 moves past drawer 2: the numbers on the tags change (Sol 01a13a10)
  const sOrder = P.labelSig(b); assert.notEqual(sOrder, s0, 'a drawer moved past another');
  b.placed[0].x = 0;
  assert.equal(P.labelSig(b), s0, 'and back');
  const [s, n] = ids(b);
  b.labelAssign = { 1: s };
  const s1 = P.labelSig(b); assert.notEqual(s1, s0, 'an assignment');
  b.labelList.labels[1].text = 'Bolts';
  const s2 = P.labelSig(b); assert.notEqual(s2, s1, 'a label edit');
  b.labelStyle = { capMm: 4 };
  const s3 = P.labelSig(b); assert.notEqual(s3, s2, 'the label style');
  b.faceStyle = 'classicpro';
  const s4 = P.labelSig(b); assert.notEqual(s4, s3, 'the faceplate');
  b.buildId = 'buildbbbbbbb';
  assert.notEqual(P.labelSig(b), s4, 'another build with the same list is another plate');
  assert.ok(n);
});

test('the snapshot: the list as a modulith-labels document, the drawers per label, the type, the selected label when it exists', () => {
  const b = withLabels(['Screws', 'Nuts', 'Washers']);
  const [s, n, w] = ids(b);
  b.labelAssign = { 1: s, 3: s, 2: n };   // Screws on two drawers (drawer order: 1 is (0,0), 2 is (1,0), 3 is (0,1))
  const { msg, problem } = P.snapshot(L, b, { session: SESSION, rev: 7, selected: n });
  assert.equal(problem, null);
  assert.equal(msg.gen2plate, 'snapshot'); assert.equal(msg.v, 1); assert.equal(msg.session, SESSION);
  assert.equal(msg.buildId, 'buildaaaaaaa'); assert.equal(msg.rev, 7); assert.equal(msg.type, 'edgelabel');
  assert.equal(msg.doc.format, L.FORMAT); assert.equal(msg.doc.version, L.VERSION);
  assert.deepEqual(msg.doc.labels.map((l) => l.text), ['Screws', 'Nuts', 'Washers']);
  assert.deepEqual(msg.drawers, { [s]: [1, 3], [n]: [2] });
  assert.equal(msg.selected, n);
  assert.equal(P.snapshot(L, b, { session: SESSION, rev: 7, selected: 'nosuchlabel1' }).msg.selected, null, 'a selection that is not in the list is none');
  assert.ok(w);
  // the document is a copy: changing it never changes the build
  msg.doc.labels[0].text = 'X';
  assert.equal(b.labelList.labels[0].text, 'Screws');
});

test('the type: the faceplate that takes labels, else null; the style rides in the document', () => {
  const b = withLabels(['A'], { faceStyle: 'classicpro', labelStyle: { capMm: 4, bold: true } });
  const { msg } = P.snapshot(L, b, { session: SESSION, rev: 1, selected: null });
  assert.equal(msg.type, 'classicpro');
  assert.deepEqual(msg.doc.style, { capMm: 4, bold: true });
  b.faceStyle = 'plain';
  assert.equal(P.snapshot(L, b, { session: SESSION, rev: 2, selected: null }).msg.type, null);
  assert.equal(P.plateType(b), null);
});

test('over the bounds nothing of the list is sent: a null document with the reason, so the Studio clears the plate', () => {
  const many = withLabels(Array.from({ length: P.LABELS_MAX + 1 }, (_, i) => 'L' + i));
  const r = P.snapshot(L, many, { session: SESSION, rev: 1, selected: ids(many)[0] });
  assert.equal(r.problem, 'too-many');
  assert.equal(r.msg.doc, null); assert.equal(r.msg.selected, null); assert.deepEqual(r.msg.drawers, {});
  assert.match(r.msg.reason, /at most 400/);
  const big = withLabels(['A']);
  big.labelList.labels[0].badge = { type: 'icon', svg: '<svg>' + 'x'.repeat(P.JSON_MAX) + '</svg>' };
  const r2 = P.snapshot(L, big, { session: SESSION, rev: 1, selected: null });
  assert.equal(r2.problem, 'too-big'); assert.equal(r2.msg.doc, null);
});

test('ready: the capabilities the Studio offers, and what the planner finds missing', () => {
  assert.equal(P.readReady({ gen2plate: 'ready', v: 1, session: SESSION }).caps.length, 0);
  assert.deepEqual(P.missingCaps(P.readReady({ gen2plate: 'ready', caps: ['snapshot/1'] }).caps), ['select/1']);
  assert.deepEqual(P.missingCaps(P.readReady({ gen2plate: 'ready', caps: ['snapshot/1', 'select/1', 'apply/2'] }).caps), []);
  assert.equal(P.readReady({ gen2plate: 'selected' }), null);
  assert.equal(P.readReady({ gen2plate: 'ready', caps: 'snapshot/1' }).caps.length, 0, 'caps that are not a list are none');
});

test('selected: only a label of this build at this rev counts; a late answer from another state or build changes nothing', () => {
  const b = withLabels(['A', 'B']);
  const [a] = ids(b);
  const ctx = { rev: 3, buildId: b.buildId, ids: ids(b) };
  const sel = (o) => P.readSelected({ gen2plate: 'selected', v: 1, session: SESSION, id: a, rev: 3, buildId: b.buildId, ...o }, ctx);
  assert.equal(sel({}), a);
  assert.equal(sel({ rev: 2 }), null, 'an older rev');
  assert.equal(sel({ rev: 4 }), null, 'a rev the planner never sent');
  assert.equal(sel({ buildId: 'buildbbbbbbb' }), null, 'another build');
  assert.equal(sel({ id: 'nosuchlabel1' }), null, 'not in the list');
  assert.equal(sel({ id: null }), null, 'a cleared selection in the Studio is not a selection here');
  assert.equal(sel({ id: 'BAD ID' }), null);
  assert.equal(P.readSelected({ gen2plate: 'snapshot' }, ctx), null);
});

test('the hello and select messages carry the key, the version and the session', () => {
  assert.deepEqual(P.helloMessage(SESSION), { gen2plate: 'hello', v: 1, session: SESSION });
  assert.deepEqual(P.selectMessage(SESSION, 'labelaaaaaaa', 'buildaaaaaaa'), { gen2plate: 'select', v: 1, session: SESSION, id: 'labelaaaaaaa', buildId: 'buildaaaaaaa' });
  assert.deepEqual(P.selectMessage(SESSION, null, 'buildaaaaaaa'), { gen2plate: 'select', v: 1, session: SESSION, id: null, buildId: 'buildaaaaaaa' });
});
