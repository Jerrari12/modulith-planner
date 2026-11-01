/* A swatch's finish (js/colors/swatch.js): which filaments wear silk's sheen and glitter's specks, each swatch's window on the tiles, the sparkle's
 * steps, and that app.css carries the tiles tools/glitter-tiles.mjs draws. The browser half is e2e "Colors: a glitter swatch ...". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILAMENT_DB, finishOfLabel } from '../js/filament-db.js';
import { finishClass, glitterClass, swatchStyle, litOffset, SPARKLE_STEP_PX } from '../js/colors/swatch.js';
import { STEADY, LIT, LIT_WARM } from '../tools/glitter-tiles.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const all = FILAMENT_DB.flatMap((b) => b.colors);
const glitter = all.filter((c) => finishOfLabel(c.label) === 'glitter').map((c) => c.label);
const silk = all.filter((c) => finishOfLabel(c.label) === 'silk').map((c) => c.label);
const plain = all.filter((c) => !finishOfLabel(c.label)).map((c) => c.label);

test('the catalog decides who glitters, and only Galaxy Green has warm flakes', () => {
  assert.ok(glitter.length >= 9 && glitter.includes('Prusament Galaxy Black'));
  for (const l of glitter) assert.equal(finishClass(l), l === 'Prusament Galaxy Green' ? '.glitter.warm' : '.glitter', l);
  for (const l of plain) assert.equal(finishClass(l), '', l);
  assert.equal(glitterClass('Panchroma Silk Gold'), '', 'the 12 px swatches carry no silk');
  assert.equal(glitterClass('Prusament Galaxy Black'), '.glitter');
});

test('silk keeps its word rule: a saved palette can name a silk the catalog lacks', () => {
  for (const l of silk) assert.equal(finishClass(l), '.silk', l);
  assert.equal(finishClass('Someone Silk Teal'), '.silk');
  assert.equal(finishClass('Someone Galaxy Teal'), '', 'glitter is the catalog\'s, never the name\'s');
  for (const n of [null, undefined, '']) assert.equal(finishClass(n), '');
});

test('a plain swatch\'s style is what it always was; a glitter one adds its own window on the tiles', () => {
  assert.equal(swatchStyle('Elegoo PLA Black', '#1c1d20'), 'background:#1c1d20');
  assert.equal(swatchStyle('Panchroma Silk Gold', '#c8a24a'), 'background:#c8a24a');
  assert.equal(swatchStyle(null, '#123456'), 'background:#123456');
  const windows = glitter.map((l) => { const m = /^background:#[0-9a-fA-F]{6};--gx:(\d+)px;--gy:(\d+)px$/.exec(swatchStyle(l, '#123456')); assert.ok(m, l); assert.ok(+m[1] < 64 && +m[2] < 64, l); return m[1] + ',' + m[2]; });
  assert.equal(new Set(windows).size, glitter.length, `two swatches share a window: ${windows}`);
  assert.equal(swatchStyle('Prusament Galaxy Black', '#3D3E3C'), swatchStyle('Prusament Galaxy Black', '#3D3E3C'), 'a filament looks the same everywhere');
});

test('the sparkle: step 0 is the swatch at rest, a step is a function of the position alone, and the lit layer really moves', () => {
  assert.ok(SPARKLE_STEP_PX > 0);
  for (const l of glitter) {
    assert.deepEqual(litOffset(l, 0), [0, 0], l);
    const steps = Array.from({ length: 40 }, (_, i) => litOffset(l, i + 1).join());
    assert.ok(new Set(steps).size > 30, `${l} repeats: ${new Set(steps).size} places in 40 steps`);
    assert.deepEqual(litOffset(l, 7), litOffset(l, 7), l);
    for (const s of Array.from({ length: 40 }, (_, i) => litOffset(l, i + 1))) assert.ok(s.every((n) => Number.isInteger(n) && n >= 0 && n < 64), l);
  }
  assert.notDeepEqual(litOffset(glitter[0], 5), litOffset(glitter[1], 5), 'two swatches do not move in step');
});

test('app.css carries the tiles the tool draws, on ::before, and leaves ::after alone', () => {
  const css = readFileSync(join(root, 'css', 'app.css'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(css.includes(`--glit-steady: ${STEADY};`), 'the steady tile is not what tools/glitter-tiles.mjs draws');
  assert.ok(css.includes(`--glit-lit: ${LIT};`), 'the lit tile is not what tools/glitter-tiles.mjs draws');
  assert.ok(css.includes(`--glit-lit: ${LIT_WARM};`), 'the warm lit tile is not what tools/glitter-tiles.mjs draws');
  assert.equal(/\.sw\.glitter[^{}]*::after/.test(css), false, '::after belongs to the pick star and the owned tick');
  assert.ok(STEADY.length + LIT.length + LIT_WARM.length < 3200, 'the tiles grew: they ship in every visitor\'s CSS');
});
