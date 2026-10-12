/* THE STAGE IS IMPORTABLE UNDER NODE - phase 0's first exit number for js/main.js.
 *
 * Before the wrap, importing main.js ran the whole viewer: it queried the document, built a
 * WebGLRenderer at module scope and awaited the kit at top level, so no test could load it
 * (test/layer-detail-seam.test.mjs still says so, and reads it as text instead). Now the body
 * lives inside createStage(), and importing the module must do NOTHING: there is no `document`
 * here, so any DOM touch at import time is a ReferenceError and fails this test by itself.
 *
 * The bare `three` specifiers resolve through test/lib/three-resolve.mjs, the node stand-in for
 * index.html's import map.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./lib/three-resolve.mjs', import.meta.url));

test('js/main.js imports under node without touching the DOM, and exports the stage factory', async () => {
  assert.equal(typeof globalThis.document, 'undefined', 'this test must run without a DOM shim');
  assert.equal(typeof globalThis.window, 'undefined');
  const mod = await import('../js/main.js');
  assert.equal(typeof mod.createStage, 'function', 'createStage is the module\'s export');
  assert.equal(mod.createStage.constructor.name, 'AsyncFunction', 'the boot awaits the kit, so the factory is async');
  assert.equal(typeof globalThis.document, 'undefined', 'importing must not create a document');
  assert.equal(typeof globalThis.__GEN2_VIEWER__, 'undefined', 'importing must not install the debug hook');
});
