/* The Labels panel's drawn previews (js/label-preview.js, 2026-10-17: Joey, "the small labels differ from the actual labels").
   A preview is drawn from the 3D label's own sources, so what can drift is pinned here: the face outline copied from the
   vendored part-label data, and the look rule a waiting label is previewed with. That a preview and its 3D label share one
   layout and one cached geometry is checked in the browser (e2e/workspaces.mjs, "the label previews"). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import { labelLookOf, labelLookOfLabel } from '../js/label-look.js';

// label-preview.js reaches three through label-text.js: the bare specifiers resolve as test/stage-import.test.mjs does
register(new URL('./lib/three-resolve.mjs', import.meta.url));
const { EDGELABEL_FACE, FACE_BOX, previewNeeds } = await import('../js/label-preview.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the preview face is the vendored part-label data\'s EdgeLabel face, exactly', () => {
  const w = {};
  new Function('window', 'self', 'globalThis', readFileSync(join(root, 'js', 'vendor', 'hardware-data.js'), 'utf8'))(w, w, w);
  assert.deepStrictEqual(EDGELABEL_FACE.map((p) => [...p]), w.GEN2HardwareData.face);
  assert.deepStrictEqual([FACE_BOX.minX, FACE_BOX.maxX, FACE_BOX.minY, FACE_BOX.maxY], [-28.5, 27.087, -12.501, 13.5]);
  // the CSS box the image sits in has the face's proportions (css/app.css .lprev.img)
  const css = readFileSync(join(root, 'css', 'app.css'), 'utf8');
  assert.match(css, /\.lprev\.img \{[^}]*aspect-ratio: 55\.587 \/ 26\.001/);
});

const item = { schema: 'part-picker-label-item/1', id: 'p6', family: 'screw', head: 'socket-cap', units: 'mm', fields: ['M2', '× 6'], value_missing: [],
  attributes: [{ path: 'head', text: 'SHCS', meaning: 'Socket head cap' }], pinned: ['head'], optional: [], pinned_unprinted: [] };

test('a waiting label is previewed with the look a drawer wearing it draws', () => {
  const part = { id: 'a', text: 'M2 × 6 · SHCS', hardware: item };
  const striped = { id: 'b', text: 'Torx bits', colours: { band: { hex: '#56B4E9' } } };
  const plain = { id: 'c', text: 'Torx bits' };
  const build = { placed: [{ id: 1, label: 'M2 × 6 · SHCS' }, { id: 2, label: 'Torx bits' }, { id: 3, label: 'Torx bits' }],
    labelList: { labels: [part, striped, plain] }, labelAssign: { 1: 'a', 2: 'b', 3: 'c' } };
  // the same answer as the drawer's own look, for each kind
  assert.deepStrictEqual(labelLookOfLabel(part), labelLookOf(build, build.placed[0]));
  assert.deepStrictEqual(labelLookOfLabel(striped), labelLookOf(build, build.placed[1]));
  assert.equal(labelLookOfLabel(plain), null);
  assert.equal(labelLookOfLabel(part).kind, 'part');
  assert.equal(labelLookOfLabel(part).position, 'bottom');
  // a part item that does not clean is not drawn as a part label (the stage shows its words)
  assert.equal(labelLookOfLabel({ id: 'd', text: 'x', hardware: { schema: 'nope' } }), null);
  assert.equal(labelLookOfLabel(null), null);
});

test('what a preview loads first follows its look', () => {
  assert.deepStrictEqual(previewNeeds({ kind: 'part', item, position: 'bottom' }), { font: true, layout: true, bands: true });
  assert.deepStrictEqual(previewNeeds({ kind: 'part', item, position: null }), { font: true, layout: true, bands: false });
  assert.deepStrictEqual(previewNeeds({ kind: 'words', text: 'x', stripe: null }), { font: true, layout: false, bands: false });
  assert.deepStrictEqual(previewNeeds({ kind: 'words', text: 'x', stripe: { colours: {}, position: 'end' } }), { font: true, layout: false, bands: true });
  assert.equal(previewNeeds(null), null);
});
