/* WHY A SPOT IS REFUSED (2026-10-20). Joey's coworker put a 1W over the middle of a 3W and got nothing: the planner
   offered the ends and said nothing about the middle. refusalReason() in js/rules/stand.js is the one place the words
   live, keyed by the problem the judge found ('s' sag, 'u' unsupported, 'w' wall-top 0.5H, anything else the generator),
   so the 3D view, the board and this test say the same thing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { refusalReason } = await import(new URL('file://' + join(root, 'js', 'rules', 'stand.js').replace(/\\/g, '/')).href);

test('the sag rule names the sizes, and the two ways out', () => {
  const s = refusalReason('s', { w: 1, below: 3 });
  assert.match(s, /^A 1W can't sit on the middle of the 3W/);
  assert.match(s, /wall under at least one end/);
  assert.match(s, /Put it at an end of the 3W, or use a wider case\.$/);
  assert.match(refusalReason('s', { w: 2, below: 4 }), /^A 2W can't sit on the middle of the 4W/);
});

test('a hanging mount (wall, under-table) says the support is above (Sol 01a15b70)', () => {
  const s = refusalReason('s', { w: 1, below: 3, hanging: true });
  assert.match(s, /^A 1W can't hang from the middle of the 3W: a case needs a wall above at least one end\./);
  assert.doesNotMatch(s, /sit on|under/);
  assert.equal(refusalReason('u', { hanging: true }), 'Both ends need a case above.');
  assert.match(refusalReason('s', { hanging: true }), /hang from the middle of the case above/);
});

test('the sag rule without a known unit below still states the rule', () => {
  const s = refusalReason('s', { w: 1 });
  assert.match(s, /wall under at least one end/);
  assert.doesNotMatch(s, /nullW|undefinedW/);
});

test('the other codes: unsupported, the Wall Mount 0.5H top, and the generator', () => {
  assert.equal(refusalReason('u'), 'Both ends need a case below.');
  assert.match(refusalReason('w'), /Wall Mount top-row cases can't be 0\.5H/);
  assert.equal(refusalReason('gen'), "The parts can't be built this way.");
  assert.equal(refusalReason('something-new'), "The parts can't be built this way.", 'an unknown code falls back to the generator wording, never undefined');
});

test('a new empty slot (2026-10-21): the column rule, under on a table, above on a hanging mount', () => {
  assert.equal(refusalReason('v'), 'Part of it would have nothing under it: every column of a case needs a case below it or the table.');
  assert.equal(refusalReason('v', { hanging: true }), 'Part of it would have nothing above it: every column of a case needs a case above it or the top row.');
});
