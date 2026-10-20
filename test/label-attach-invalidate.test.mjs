/* THE LABEL MESHES INVALIDATE THE FRAME WHEN THEY GO IN SYNCHRONOUSLY (2026-10-20). attachLabelTexts() runs at the end of
   every regenerate. When the label font and the part-label files are already loaded it places the meshes at once; the
   loading branch below it always ended with `ao.rev++; markShadowDirty(); invalidateFrame();`, the synchronous one did
   not. A regenerate that changed nothing the accumulation key or the idle gate watch (the same instances and step: a
   part label with a stripe placed, which changes only the BOM) then left a Very High tier showing the accumulated image
   from BEFORE the label, until the next placement's setLabels invalidated a frame - Joey's "they didn't show up until i
   dragged and dropped the next one". The function is extracted from main.js by balanced scan (as move-opt.test.mjs does)
   and run against stubs: the synchronous branch must call invalidateFrame, markShadowDirty and bump ao.rev. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
function takeAt(needle) {
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `could not find "${needle}" in main.js - if it was renamed, update this test rather than deleting it`);
  let depth = 0, opened = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if ('([{'.includes(c)) { depth++; if (c === '{') opened = true; }
    else if (')]}'.includes(c)) { depth--; if (opened && depth === 0 && c === '}') return src.slice(start, i + 1); }
  }
  assert.fail(`unterminated "${needle}"`);
}
const code = takeAt('function attachLabelTexts()');

function run({ ready }) {
  const calls = { placed: 0, invalidated: 0, shadow: 0 };
  const ao = { rev: 7 };
  const inst = { cfg: { id: 'fl0', node: 'Label_EdgeLabel' } };
  const attach = new Function('labelTextTok', 'IS_PART', 'build', 'instances', 'LABEL_TEXT_NODES', 'labelTextFor', 'labelLookNeeds',
    'labelFontReady', 'needsLoad', 'placeLabelTexts', 'ao', 'markShadowDirty', 'invalidateFrame', 'loadLabelFont', 'loadLabelPartsOnce',
    code + '\nreturn attachLabelTexts;')(
    0, false, { placed: [{ id: 1, label: 'M3 × 10' }] }, new Map([['fl0', inst]]), new Set(['Label_EdgeLabel']), () => 'M3 × 10', () => ({ layout: true, bands: true }),
    () => ready, () => !ready, () => { calls.placed++; }, ao, () => { calls.shadow++; }, () => { calls.invalidated++; }, () => Promise.resolve(), () => Promise.resolve());
  attach();
  return { calls, aoRev: ao.rev };
}

test('with the fonts and part files loaded, attachLabelTexts places the labels at once AND invalidates the frame', () => {
  const { calls, aoRev } = run({ ready: true });
  assert.equal(calls.placed, 1, 'the meshes were placed synchronously');
  assert.equal(calls.invalidated, 1, 'invalidateFrame: the accumulation and the idle gate see a new scene');
  assert.equal(calls.shadow, 1, 'markShadowDirty: the shadow map takes the new meshes');
  assert.equal(aoRev, 8, 'ao.rev bumped: the AO restarts with the labels in place');
});

test('while they still load, nothing is placed synchronously and nothing invalidated yet (the loading branch does that after the load)', () => {
  const { calls, aoRev } = run({ ready: false });
  assert.equal(calls.placed, 0);
  assert.equal(calls.invalidated, 0);
  assert.equal(aoRev, 7);
});
