/* THE FILAMENT PROFILES — a pin + the contract they work under.
 *
 * `js/filament-profiles.js` is a per-filament finish, two scalars deep. It is what makes a filament
 * with a profile render at its own roughness instead of the ordinary 0.55. It began as the Filament
 * Material Lab's generated output. The Lab was retired on 2026-11-01, so this file is the source now.
 *
 * ⚠ THE PIN STAYS, AND IT IS HOW AN INTENDED CHANGE IS SEEN. The default build's fronts wear the one
 * row here. Change it on purpose, then bump the pin in the same commit, so a reviewer sees both.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FILAMENT_PROFILES, FILAMENT_PROFILE_COUNT } from '../js/filament-profiles.js';
import { partMaterialSpec } from '../js/part-material.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'js', 'filament-profiles.js');

/* ⚠ Bump ONLY in the commit that changes the table on purpose. */
const PINNED_SHA256 = 'a9dce86e39bf0945edd90d0c446b0071e340b4a26707652106738a42432e6b99';

/* ⚠⚠ HASH THE CANONICAL CONTENT, NEVER THE WORKING-COPY BYTES. The repo STORES LF and a Windows
   working copy holds CRLF, so hashing raw bytes asks which OS checked the file out rather than what
   the file says — and it answers NO in every fresh clone and in CI while passing locally. That has
   already blocked one deploy on a copy that was correct. */
const canonical = (p) => Buffer.from(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), 'utf8');

test('the profile table is the copy that was reviewed', () => {
  assert.ok(existsSync(VENDORED), 'js/filament-profiles.js is missing');
  assert.equal(createHash('sha256').update(canonical(VENDORED)).digest('hex'), PINNED_SHA256,
    'js/filament-profiles.js has changed: if the change is intended, bump this pin in the same commit.');
});

test('⚔ it imports nothing, which is what lets part-material.js stay loadable in plain node', () => {
  /* part-material.js is testable on both sides precisely because it pulls in no renderer. A
     dependency added here would travel through that import and take the property with it. */
  const src = readFileSync(VENDORED, 'utf8');
  const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bexport\s+\*\s+from\s*)(['"])([^'"]*)\1/g;
  assert.deepEqual([...src.matchAll(SPEC)].map((m) => m[2]), []);
});

test('⚔ a profile fires under a LABEL and under nothing else', () => {
  /* ⚠ THE DECISION OF 2026-09-07, GATED. A profile keys by filament label, and a label exists only
     where the user has assigned a custom palette. In instruction-colours mode — the default — and
     in the ?part= embed there is no label, so no profile resolves and the part renders the base
     finish plus layer detail. `activeLabel` in main.js is what produces the null; this pins that a
     null actually means the base. */
  const [label] = Object.keys(FILAMENT_PROFILES);
  const base = partMaterialSpec('Case');
  assert.equal(base.roughness, 0.55);
  assert.equal(base.profile, undefined);
  assert.deepEqual(partMaterialSpec('Case', { label: null }), base);
  assert.deepEqual(partMaterialSpec('Case', { label: 'a filament nobody has profiled' }), base);

  const profiled = partMaterialSpec('Case', { label });
  assert.equal(profiled.profile, label);
  assert.equal(profiled.roughness, FILAMENT_PROFILES[label].roughness);
  assert.equal(profiled.metalness, FILAMENT_PROFILES[label].metalness);
});

test('⚔ and it moves ONLY roughness and metalness', () => {
  /* Two scalars is the whole payload. A profile that could reach the class, the clearcoat or the
     envMapIntensity would be a second author of the surface spec, which is the thing this transport
     was chosen to avoid. */
  const [label] = Object.keys(FILAMENT_PROFILES);
  const base = partMaterialSpec('Case');
  const profiled = partMaterialSpec('Case', { label });
  const moved = Object.keys({ ...base, ...profiled })
    .filter((k) => JSON.stringify(base[k]) !== JSON.stringify(profiled[k]));
  assert.deepEqual(moved.sort(), ['metalness', 'profile', 'roughness']);
});

test('⚔ the base is untouched by landing a profile — 0.55 / 0.05 still ships', () => {
  /* ⚠ THE SHIP DECISION, AND IT IS THE ONE MOST EASILY LOST. Landing profile one does NOT move the
     ordinary part: every unprofiled filament, and every part in the default view, renders exactly
     what it rendered before. Moving 0.55 here would be a product-wide appearance change smuggled in
     under "landing profile one". */
  for (const key of ['Case', 'Drawer', 'ShelfInsert', 'Handle', 'Case:BODY']) {
    assert.equal(partMaterialSpec(key).roughness, 0.55, key);
    assert.equal(partMaterialSpec(key).metalness, 0.05, key);
  }
});

test('⚔ a purchased part and the plate transfer are both out of a profile\'s reach', () => {
  const [label] = Object.keys(FILAMENT_PROFILES);
  /* The foot is bought, not printed. `colorLocked` keeps activeLabel from ever handing it one, and
     the spec refuses it anyway — belt and braces, because only one of the two lives in this repo. */
  assert.deepEqual(partMaterialSpec('FootAdhesive', { label }),
    { kind: 'standard', roughness: 0.72, metalness: 0 });
  /* The plate finish describes what the BUILD PLATE did to a surface. A filament profile describes
     the filament, and cannot also describe that. */
  const holo = partMaterialSpec('Faceplate', { holographicPlate: true, plateContact: true, label });
  assert.equal(holo.roughness, 0.14);
  assert.equal(holo.profile, undefined);
});

test('the count is stated and agrees with the table', () => {
  assert.equal(FILAMENT_PROFILE_COUNT, Object.keys(FILAMENT_PROFILES).length);
});
