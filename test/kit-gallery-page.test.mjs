/* The kit gallery retired (Joey, 2026-10-30: the site "essentially gave organizing kits a new home"). builds/index.html only
   forwards to the site's /builds/ now, and the planner's own ways out point there. The kit files stay: ?build=<id> opens
   from them, printed links included, and index.json is what the site vendors. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'builds', 'index.html'), 'utf8');
const main = readFileSync(join(root, 'js', 'main.js'), 'utf8');
const index = JSON.parse(readFileSync(join(root, 'builds', 'index.json'), 'utf8'));
const SITE = 'https://modulith.systems/builds/';
const OLD = /GEN2|LEGO|brick|JERRARI3D|Build Studio/i;

test('the old address forwards to the site, and says where it went', () => {
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}">`));
  assert.match(html, new RegExp(`http-equiv="refresh" content="0; url=${SITE}"`));
  assert.ok(html.includes(`location.replace('${SITE}')`));
  assert.ok(html.includes(`<a href="${SITE}">`), 'a reader with no script still has a link');
  assert.match(html, /name="robots" content="noindex"/);
});

test('nothing of the gallery is left to serve', () => {
  assert.doesNotMatch(html, /kit-card|goatcounter|fetch\(/);
});

test('the planner\'s error pages point at the site, by the current name', () => {
  assert.doesNotMatch(main, /href="builds\/"/);
  assert.doesNotMatch(main, /official GEN2 kits/);
  assert.equal([...main.matchAll(/<a href="https:\/\/modulith\.systems\/builds\/">Browse the official kits →<\/a>/g)].length, 3);
});

test('every kit the site vendors is a file here, under a current name, agreeing with its index row', () => {
  for (const k of index) {
    assert.ok(existsSync(join(root, 'builds', `${k.id}.json`)), k.id);
    // the site's vendor tool refuses a kit whose file and row disagree (the 2026-10-30 rename left two that did)
    const file = JSON.parse(readFileSync(join(root, 'builds', `${k.id}.json`), 'utf8'));
    assert.equal(file.title, k.title, k.id);
    assert.equal(file.tagline, k.tagline, k.id);
    assert.doesNotMatch(k.tagline || '', OLD, k.id);
    assert.doesNotMatch(k.title.replace(/^GEN2\s+/, ''), OLD, k.id);
  }
});
