/* The hardware pictures of the parts list (js/parts-drawer/hwpics.js, 2026-11-08): every type the list takes has a picture for
   every thread size it offers, each picture is a file in img/hw/, and nothing is listed that the list does not take. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PICS, picOf } from '../js/parts-drawer/hwpics.js';
import { TYPE_ORDER, THREADS } from '../js/parts-drawer/inventory.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('every list type and thread size has a picture, and the file is there and small', () => {
  for (const type of TYPE_ORDER) for (const size of THREADS) {
    const src = picOf({ type, size });
    assert.ok(src, `${type} ${size} has a picture`);
    assert.match(src, /^img\/hw\/[a-z0-9-]+\.webp$/, `${type} ${size}: a plain relative path under img/hw/`);
    const f = join(root, src);
    assert.ok(existsSync(f), `${src} exists`);
    assert.ok(statSync(f).size < 8000, `${src} is a thumbnail (under 8 KB)`);
  }
  assert.deepEqual(Object.keys(PICS).sort(), [...TYPE_ORDER].sort(), 'pictures for the list\'s types and no others');
  assert.equal(picOf({ type: 'bearing', size: '625' }), null, 'a part the list does not take has no picture');
  assert.equal(picOf(null), null);
});
