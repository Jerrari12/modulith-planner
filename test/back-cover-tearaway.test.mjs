/* THE BACK COVER AND THE v2609 DRAWER'S TEAR-AWAY FRONT (2026-10-20)
 *
 * Since the v2609 release the standard Decor drawer prints with the same tear-away front as the Gridfinity one, and
 * the 94 GLBs rebuilt from the release STLs (gen2-parts `decor-drawers-v2609`) carry it as ONE mesh with the body.
 * Joey's rule (vault rules.md "Drawers, faceplates and handles"): the faceplate goes on with the front left in, but
 * the back cover does not - "otherwise they would interfere"; with the front out "the back cover of the faceplate
 * does fit fine". So the cover stays OPTIONAL, and wherever the build bills or fits one it says the front comes out
 * first: the back cover row of the generated manifest, the same row of the planner's computeBom, and the Faceplates
 * step. The stage hides nothing (the panel is not a node of its own); the cover's volume holds the whole panel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const G = await import(new URL('../js/generate.js', import.meta.url).href);
const { generateManifest } = G;
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);

const FRONT_OUT = /take the drawer's tear-away front out/i;
const INTERFERE = /left in, it and the cover interfere/;

const build = (L, o = {}) => ({
  mount: 'tabletop', length: L, faceStyle: 'classic', handleStyle: 'deco',
  wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [],
  gridW: 8, gridH: 3, nextId: 3, placed: [], ...o,
});
const decor = (id, x, w, hh, o = {}) => ({ id, x, y: 6 - hh, w, hh, fill: 'decor', ...o });
const ok = (b, why) => {
  const g = generateManifest(b);
  assert.deepEqual(g.errors || [], [], `${why}: ${(g.errors || []).join(' ')}`);
  return g.manifest;
};
const row = (m, re) => m.parts.find((p) => re.test(p.node));
const faceStep = (m) => m.steps.find((s) => /^Faceplates/.test(s.title));

test('the generated back cover row says the tear-away front comes out first, on every length and faceplate family', () => {
  for (const L of [59, 115, 165, 185, 240, 270]) {
    for (const faceStyle of ['essential', 'classic', 'edgelabel', 'classicpro', 'chevron']) {
      const m = ok(build(L, { mount: L === 59 ? 'wall' : 'tabletop', faceStyle, backCover: true, placed: [decor('u1', 0, 2, 2)] }), `${L} ${faceStyle}`);
      const r = row(m, /^BackCover_/);
      assert.ok(r, `${L} ${faceStyle}: the cover is billed`);
      assert.equal(r.qty, 1);
      assert.match(r.note || '', /^Optional · /, `${L} ${faceStyle}: still optional`);
      assert.match(r.note || '', FRONT_OUT, `${L} ${faceStyle}: the front comes out first`);
      assert.match(r.note || '', INTERFERE, `${L} ${faceStyle}: and why`);
      assert.match(r.note || '', /Included in the faceplate download/, `${L} ${faceStyle}: where the file is`);
    }
  }
});

test('the Faceplates step fits the cover after the front is out - with and without dressing, and never on a Gridfinity-only build', () => {
  // a bare plate (Classic: no accent, no label) - the cover leads the sub-assembly
  const bare = faceStep(ok(build(185, { backCover: true, placed: [decor('u1', 0, 1, 2)] }), 'bare'));
  assert.match(bare.note, /Assemble the faceplate first: take the drawer's tear-away front out and clip the back cover in from behind\./);
  // a dressed plate (EdgeLabel: accent + label) - the cover follows the dressing
  const dressed = faceStep(ok(build(185, { faceStyle: 'edgelabel', backCover: true, placed: [decor('u1', 0, 1, 2)] }), 'dressed'));
  assert.match(dressed.note, /, then take the drawer's tear-away front out and clip the back cover in from behind/);
  assert.ok(dressed.note.indexOf('accent panel') < dressed.note.indexOf('tear-away front'), 'dressing first, then the cover');
  // the Gridfinity aside survives beside it
  const mixed = faceStep(ok(build(185, {
    backCover: true, nextId: 3, placed: [decor('u1', 0, 1, 2), decor('u2', 1, 1, 2, { variant: 'gridfinity' })],
  }), 'mixed'));
  assert.match(mixed.note, FRONT_OUT);
  assert.match(mixed.note, /not on the Gridfinity drawers - leave their tear-away front in instead/);
  // off, or only Gridfinity drawers: no cover, so no instruction to take a front out
  for (const [why, b] of [
    ['off', build(185, { placed: [decor('u1', 0, 1, 2)] })],
    ['Gridfinity only', build(185, { backCover: true, placed: [decor('u1', 0, 2, 2, { variant: 'gridfinity' })] })],
  ]) {
    const m = ok(b, why);
    assert.equal(row(m, /^BackCover_/), undefined, `${why}: no cover row`);
    assert.doesNotMatch(faceStep(m).note, /tear-away front out/, `${why}: nothing to take out`);
  }
});

test("the planner's computeBom back cover row carries the same condition, and only when a standard Decor drawer takes a cover", () => {
  const rows = (b) => { sanitizeBuild(b, GEN2); return bomRows(computeBom(b, GEN2) || [], null); };
  const cover = (b) => rows(b).find((r) => /Faceplate Back Cover/.test(r.name));
  const base = { mount: 'tabletop', length: 185, fill: 'decor', gridH: 4, gridW: 4, nextId: 50, feet: 'tpu', faceStyle: 'edgelabel' };
  const on = cover({ ...base, backCover: true, placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor' }] });
  assert.ok(on, 'billed when on');
  assert.equal(on.qty, 1);
  assert.ok(on.optional, 'still optional');
  assert.match(on.note, /^Optional · /);
  assert.match(on.note, FRONT_OUT);
  assert.match(on.note, INTERFERE);
  assert.match(on.note, /Included in the faceplate download/);
  assert.equal(cover({ ...base, backCover: false, placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor' }] }), undefined, 'off: no row');
  assert.equal(cover({ ...base, backCover: true, placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor', variant: 'gridfinity' }] }), undefined, 'Gridfinity: no row');
  // the two tools say the same thing about the same part (requirement-parity.test.mjs checks the names and counts)
  const gen = row(ok(build(185, { faceStyle: 'edgelabel', backCover: true, placed: [decor('u1', 0, 2, 2)] }), 'parity'), /^BackCover_/);
  assert.equal(gen.note, on.note, 'one wording in the manifest row and the planner row');
});
