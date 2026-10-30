/* The kit gallery (builds/index.html, 2026-10-30). The page stayed behind in the rename: "GEN2 Starter Kits - 3D Build
   Studio", "LEGO-style", "GEN2 QuickLock", links to jerrari3d.com and the old viewer's counter. What a visitor reads, and
   where its links and its counts go. The listings' own names on Printables and Thangs stay GEN2: those are real addresses. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'builds', 'index.html'), 'utf8');
const index = JSON.parse(readFileSync(join(root, 'builds', 'index.json'), 'utf8'));
const markup = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
const OLD = /GEN2|LEGO|brick|JERRARI3D|Build Studio/i;

test('what the page says: no old name in its markup, its tier blurbs or its kit taglines', () => {
  assert.doesNotMatch(markup, OLD);
  const blurbs = [...html.matchAll(/^ +(?:tabletop|wall|'under-table'): '([^']*)'/gm)].map((m) => m[1]);
  assert.equal(blurbs.length, 6, 'both tiers read, per mount');
  for (const b of blurbs) assert.doesNotMatch(b, OLD);
  for (const k of index) assert.doesNotMatch(k.tagline || '', OLD, k.id);
  assert.match(html, /<title>MODULITH Starter Kits<\/title>/);
});

test('a card shows its kit without GEN2, the way the planner names it', () => {
  assert.match(html, /title\.textContent = String\(k\.title\)\.replace\(\/\^GEN2\\s\+\/, ''\)/);
  for (const k of index) assert.doesNotMatch(k.title.replace(/^GEN2\s+/, ''), OLD, k.id);
});

test('its links and its counts go to the current places', () => {
  assert.doesNotMatch(markup, /jerrari3d\.com/);
  assert.match(markup, /href="https:\/\/modulith\.systems"/);
  assert.match(markup, /src="\.\.\/img\/modulith-logo\.svg"/);
  const counters = [...html.matchAll(/data-goatcounter="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(counters, ['https://jerrari.goatcounter.com/count']);
});
