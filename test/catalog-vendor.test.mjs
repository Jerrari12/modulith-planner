/* THE CATALOG IS THE PLANNER'S, BYTE FOR BYTE, UNTIL CUTOVER - AND THIS REPO'S SINCE.
 *
 * js/catalog/data.js was gen2-planner-main/js/data.js copied verbatim (the approved merge plan,
 * §1.5: "data.js stays verbatim and sha-pinned until cutover makes the merged repo the source").
 * The cutover ran 2026-10-23: the old planner is a forward page, its data.js frozen at 92c055d.
 * From 2026-10-29 (sideCover released) the catalog is edited HERE, and the MODULITH site
 * re-vendors this file. The pin stays as a change detector, so an edit is a deliberate act:
 * edit this file, bump PINNED_SHA256 and SOURCE, re-vendor the site.
 * The old byte comparison against the frozen copy is gone; the BOM parity oracle
 * (test/parity) still runs the old planner, and lists where this catalog moved ahead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'js', 'catalog', 'data.js');
const PINNED_SHA256 = '273227dbbb4d2ac4c7ecf00d7bdf72863aca43553f1a9dac835e9b9c02cdc5a4';
const SOURCE = 'this repo, 2026-10-29: sideCover released (was gen2-planner-main 92c055d)';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test(`the vendored catalog matches its pin (${SOURCE})`, () => {
  assert.ok(existsSync(VENDORED), 'js/catalog/data.js is missing');
  const actual = sha(VENDORED);
  assert.equal(actual, PINNED_SHA256,
    `js/catalog/data.js changed (sha256 ${actual.slice(0, 16)}…).\n` +
    '  A deliberate edit? Bump PINNED_SHA256 and SOURCE, then re-vendor the MODULITH site.');
});

test('the catalog is a classic script that defines GEN2 with the keys the Build workspace reads', () => {
  const src = readFileSync(VENDORED, 'utf8');
  assert.match(src, /^const GEN2 = \{/m, 'data.js defines `const GEN2`');
  for (const key of ['units', 'drawerWidths', 'drawerHeights', 'unavailableSizes', 'collectionCases', 'fills', 'faceplateStyles', 'lengths', 'printers', 'mounts', 'gridfinity']) {
    assert.match(src, new RegExp(`^  ${key}:`, 'm'), `GEN2.${key} is defined`);
  }
});
