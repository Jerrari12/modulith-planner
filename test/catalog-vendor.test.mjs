/* THE CATALOG IS THE PLANNER'S, BYTE FOR BYTE, UNTIL CUTOVER.
 *
 * js/catalog/data.js is gen2-planner-main/js/data.js copied verbatim (the approved merge plan,
 * §1.5: "data.js stays verbatim and sha-pinned until cutover makes the merged repo the source").
 * The planner is still live and still edits its copy, so this pin is what notices: a planner
 * change fails here until the file is re-copied and the pin bumped, and an edit on THIS side
 * fails the byte comparison whenever the planner checkout is present. Same chain as the other
 * vendor pins (tabletop-completion, requirement-scope).
 *
 * Re-vendor: copy the planner's js/data.js here, bump PINNED_SHA256 and SOURCE below.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'js', 'catalog', 'data.js');
const UPSTREAM = process.env.GEN2_PLANNER_ROOT
  ? join(process.env.GEN2_PLANNER_ROOT, 'js', 'data.js')
  : join(root, '..', 'GEN2 Planner', 'gen2-planner-main', 'js', 'data.js');
const PINNED_SHA256 = '4f3bfdba8722203de09b2e02f3dd3eb12235682d401a56805453874d56772881';
const SOURCE = 'gen2-planner-main dfec9b9 (2026-10-10)';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test(`the vendored catalog matches its pin (${SOURCE})`, () => {
  assert.ok(existsSync(VENDORED), 'js/catalog/data.js is missing');
  const actual = sha(VENDORED);
  assert.equal(actual, PINNED_SHA256,
    `js/catalog/data.js changed (sha256 ${actual.slice(0, 16)}…).\n` +
    '  Edit the PLANNER source, copy it here, then bump PINNED_SHA256 and SOURCE.');
});

test('the vendored catalog is byte-identical to the planner source (when the planner is checked out)', (t) => {
  if (!existsSync(UPSTREAM)) { t.skip('planner checkout not present - pin-only'); return; }
  assert.equal(readFileSync(VENDORED, 'utf8'), readFileSync(UPSTREAM, 'utf8'),
    'js/catalog/data.js differs from the planner source - re-copy it and bump the pin');
});

test('the catalog is a classic script that defines GEN2 with the keys the Build workspace reads', () => {
  const src = readFileSync(VENDORED, 'utf8');
  assert.match(src, /^const GEN2 = \{/m, 'data.js defines `const GEN2`');
  for (const key of ['units', 'drawerWidths', 'drawerHeights', 'unavailableSizes', 'collectionCases', 'fills', 'faceplateStyles', 'lengths', 'printers', 'mounts', 'gridfinity']) {
    assert.match(src, new RegExp(`^  ${key}:`, 'm'), `GEN2.${key} is defined`);
  }
});
