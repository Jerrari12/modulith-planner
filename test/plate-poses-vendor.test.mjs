/* THE PLATE-POSE REGISTRY — the shape the knowledge pack reads.
 *
 * `data/plate-poses.json` is the confirmed print poses, exported by tools/export-plate-poses.mjs.
 * THIS REPO OWNS IT. The MODULITH knowledge pack reads it from here for every print orientation,
 * and refuses to build without it. (The Filament Material Lab kept a copy until it was retired on
 * 2026-11-01, and this file used to compare the two.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'data', 'plate-poses.json');

test('the registry is present, parses, and still names its own source', () => {
  assert.ok(existsSync(SOURCE), 'data/plate-poses.json is missing');
  const reg = JSON.parse(readFileSync(SOURCE, 'utf8'));

  assert.equal(reg.contractVersion, '1.0.0', 'contract version changed - the knowledge pack reads this');
  assert.match(reg.sourceRegistryRevision, /^gen2-viewer@[0-9a-f]{7,40}$/,
    'sourceRegistryRevision no longer names this repo and a commit');
  assert.ok(Number.isFinite(Date.parse(reg.exportedAt)), 'exportedAt is not a date');

  assert.ok(Array.isArray(reg.entries) && reg.entries.length > 0, 'no entries');
  /* ⚠ NOT PINNED TO 511. Parts get added; a count assertion would fail on every
     legitimate export and teach whoever hits it to edit the number rather than
     read the diff. What must not silently change is the SHAPE the Lab reads. */
  for (const e of reg.entries) {
    const where = e.partId ?? '(no partId)';
    assert.equal(typeof e.partId, 'string', `${where}: partId`);
    assert.match(e.asset?.path ?? '', /^viewer\/parts\//,
      `${where}: asset.path should be relative to THIS repo - that is what makes us the owner`);
    assert.match(e.asset?.sha256 ?? '', /^[0-9a-f]{64}$/, `${where}: asset.sha256`);
    assert.ok(Array.isArray(e.rotation), `${where}: rotation`);
    assert.equal(e.convention?.eulerOrder, 'XYZ', `${where}: eulerOrder`);
    assert.equal(e.convention?.angleUnit, 'degree', `${where}: angleUnit`);
  }
});

