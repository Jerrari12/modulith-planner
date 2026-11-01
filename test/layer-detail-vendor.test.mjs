/* THE LAYER-DETAIL MODULE — a pin + the load contract.
 *
 * `js/vendor/layer-detail.js` draws the bead corrugation, the bead crown and the crest on printed
 * parts. It began as a compile of the Filament Material Lab's `src/appearance/layerDetail.ts`. The
 * Lab was retired on 2026-11-01, so this copy is the source now: no one re-emits it.
 *
 * ⚠ THE PIN STAYS, AND IT IS HOW AN INTENDED CHANGE IS SEEN. This file's 115 KB of shader decide how
 * every printed part in the planner looks, and an unintended edit that still parses would pass every
 * other test. Change the module on purpose, then bump the pin in the same commit, so a reviewer sees
 * both. A failure here means the module changed: read the diff before you bump anything.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'js', 'vendor', 'layer-detail.js');

/* ⚠ Bump ONLY in the commit that changes the module on purpose. */
const PINNED_SHA256 = 'b4838053e33d722d77e88baef62453018280e78b646312e99d23ec314456fe65';

/* ⚠⚠ HASH THE CANONICAL CONTENT, NEVER THE WORKING-COPY BYTES. The repo STORES LF and a Windows
   working copy holds CRLF, so hashing raw bytes asks which OS checked the file out rather than
   what the file says — and it answers NO in every fresh clone and in CI while passing locally.
   That already blocked one deploy on a copy that was correct. */
const canonical = (p) => Buffer.from(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), 'utf8');

test('the layer-detail module is the copy that was reviewed', () => {
  assert.ok(existsSync(VENDORED), 'js/vendor/layer-detail.js is missing');
  const got = createHash('sha256').update(canonical(VENDORED)).digest('hex');
  assert.equal(got, PINNED_SHA256,
    'js/vendor/layer-detail.js has changed. It decides how every printed part looks: if the change '
    + 'is intended, bump this pin in the same commit.');
});

test('it loads in a browser here: three and nothing else', () => {
  const src = canonical(VENDORED).toString('utf8');
  /* Our import map (viewer/index.html) resolves `three` and `three/addons/`. Any other specifier
     arrives with nothing to resolve it and fails at LOAD — a blank viewer, not a build error. */
  const specs = [...src.matchAll(/^\s*(?:import|export)\s[^\n]*?from\s+['"]([^'"]+)['"]/gm)]
    .map((m) => m[1]);
  assert.ok(specs.length > 0, 'no imports at all — the emit is not what we think it is');
  const foreign = specs.filter((s) => s !== 'three' && !s.startsWith('three/addons/'));
  assert.deepEqual(foreign, [],
    `this module imports specifiers our import map cannot resolve: ${foreign.join(', ')}`);
});

test('it exports the entry point the viewer will call', () => {
  const src = canonical(VENDORED).toString('utf8');
  assert.match(src, /export function applyLayerDetail\b/,
    'applyLayerDetail is gone — the seam in main.js has nothing to call');
});

/* ⚠ AND THE DEPLOY GUARD'S OWN RULE, APPLIED HERE RATHER THAN AT DEPLOY TIME. This file is 113 KB
   of heavily commented shader code. `pages.yml` scans raw text for relative module specifiers and
   fails the deploy on any that is not version-stamped — including one written inside a PROSE
   COMMENT, which in a file this size is a live hazard rather than a theoretical one. Catching it
   in the suite turns a red deploy into a red test. */
test('it carries no relative module specifier for the deploy guard to reject', () => {
  const src = canonical(VENDORED).toString('utf8');
  const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bexport\s+\*\s+from\s*)(['"])(\.[^'"]*)\1/g;
  const bad = [...src.matchAll(SPEC)]
    .map((m) => m[2])
    .filter((s) => (s.endsWith('.js') || s.includes('.js?')) && !/[?&]v=/.test(s));
  assert.deepEqual(bad, [],
    `unstamped relative specifiers would fail the Pages deploy: ${bad.join(', ')}`);
});
