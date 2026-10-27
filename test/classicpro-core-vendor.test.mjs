/* THE VENDORED CLASSIC PRO LABEL CORE - drift gate + what the stage leans on (2026-10-27).
 *
 * `js/vendor/classicpro-core.js` is a BYTE-FOR-BYTE copy of the Classic Pro label generator's `label-core.js`, which the
 * MODULITH Label Studio serves as `label-core-classicpro.js` (its sha256 bbb53c7c..., the Studio's own ?v= stamp): the
 * generator's own code for one Classic Pro label (a flat 47 x 25.5 mm label, the text plane at z 1.5, badge + text centred
 * as a group, the same 23 icons, the 3 mm floor). The stage builds every Classic Pro drawer label with it (label-text.js),
 * so a label on a Classic Pro drawer is the label the Studio prints (Joey 2026-10-27: a placed Classic Pro label stayed blank).
 *
 * The pin is checked here, and byte equality against the Label Studio's file when its checkout is beside this repo
 * (GEN2_LABELSTUDIO_ROOT, or "GEN2 label-types/GEN2 EdgeLabel Label Generator", branch label-studio). The stage applies ONE
 * label style and ONE icon catalog (over EdgeLabel's core) to both label types, as the Studio does; the tests below hold the
 * two cores to that: the same DEFAULTS, the same icons, the same per-row rule.
 *
 * ⚠ Bump the pin ONLY after the generator's file legitimately changed and was re-copied here. Never edit this copy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'js', 'vendor', 'classicpro-core.js');
const STUDIO = process.env.GEN2_LABELSTUDIO_ROOT
  ? [process.env.GEN2_LABELSTUDIO_ROOT]
  : [join(root, '..', 'GEN2 label-types', 'GEN2 EdgeLabel Label Generator'), join(root, '..', 'ls-next'), join(root, '..', 'GEN2 EdgeLabel Label Generator')];
const STUDIO_ROOT = STUDIO.find((d) => existsSync(join(d, 'label-core-classicpro.js')));
const PINNED_SHA256 = 'bbb53c7c460544286de60a19288c7c6586e43e5cdd7d031f898f1fa78457433a';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function load(file, name) {
  delete globalThis[name];
  (0, eval)(readFileSync(join(root, 'js', 'vendor', file), 'utf8'));
  const M = globalThis[name];
  assert.ok(M && typeof M.create === 'function', `${name}.create is missing`);
  return M.create({ THREE: {} });   // nothing below builds geometry
}

test('the vendored Classic Pro core matches its pin', () => {
  assert.ok(existsSync(VENDORED), 'js/vendor/classicpro-core.js is missing');
  const actual = sha(VENDORED);
  assert.equal(actual, PINNED_SHA256, `vendored classicpro-core.js changed (sha256 ${actual.slice(0, 16)}…).\n` +
    '  Edit the GENERATOR\'s label-core.js, copy it here, then bump PINNED_SHA256.');
});

test('the vendored copy is byte-identical to the Label Studio\'s label-core-classicpro.js (when it is checked out)', (t) => {
  if (!STUDIO_ROOT) { t.skip('the Label Studio checkout is not present - pin-only'); return; }
  assert.ok(readFileSync(VENDORED).equals(readFileSync(join(STUDIO_ROOT, 'label-core-classicpro.js'))),
    'js/vendor/classicpro-core.js differs from the Label Studio\'s label-core-classicpro.js - re-copy it');
});

test('one style and one icon catalog fit both cores: the same DEFAULTS, the same 23 icons, the same prediction', () => {
  const E = load('edgelabel-core.js', 'GEN2EdgeLabelCore'), C = load('classicpro-core.js', 'GEN2ClassicProCore');
  assert.deepEqual({ ...C.DEFAULTS }, { ...E.DEFAULTS }, 'the label style\'s defaults differ between the cores');
  assert.deepEqual(C.ICON_LIBRARY.map((i) => [i.id, i.svg]), E.ICON_LIBRARY.map((i) => [i.id, i.svg]), 'the cores\' icon libraries differ');
  for (const w of ['Torx Bits', 'drill bits', 'M3 Screws', 'icing', 'Nozzles']) assert.equal(C.guessIconId(w), E.guessIconId(w), w);
});

test('prepareLabel is the same per-row rule on Classic Pro: ALL CAPS on text and letter badges, nothing for an empty row', () => {
  const C = load('classicpro-core.js', 'GEN2ClassicProCore');
  assert.deepEqual(C.prepareLabel('Torx Bits', { type: 'icon', value: 'screw-torx-head' }, true),
    { text: 'TORX BITS', badge: { type: 'icon', value: 'screw-torx-head' } });
  assert.deepEqual(C.prepareLabel('m3', { type: 'char', value: 'a' }, true), { text: 'M3', badge: { type: 'char', value: 'A' } });
  assert.equal(C.prepareLabel('   ', { type: 'none' }, true), null);
});

test('the frame label-text.js maps the core into is the measured one, from the core\'s own top face', () => {
  const C = load('classicpro-core.js', 'GEN2ClassicProCore');
  assert.equal(C.LABEL_HT, 1.5, 'the text plane the frame lifts to');
  const src = readFileSync(join(root, 'js', 'label-text.js'), 'utf8');
  // the handoff's numbers (CLASSICPRO-CORE.md section 3): Rx(-45 deg), then (0, 9.0061, -0.5562)
  assert.match(src, /CLASSICPRO_FRAME = Object\.freeze\(\{ rotX: -Math\.PI \/ 4, ty: 9\.0061, tz: -0\.5562 \}\)/);
  assert.match(src, /geo\.translate\(0, 0, cpCore\.LABEL_HT\);\s*geo\.rotateX\(CLASSICPRO_FRAME\.rotX\);\s*geo\.translate\(0, CLASSICPRO_FRAME\.ty, CLASSICPRO_FRAME\.tz\);/,
    'lift to the top face, turn, then move - in that order');
});
