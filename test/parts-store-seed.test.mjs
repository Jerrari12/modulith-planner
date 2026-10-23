/* A LISTING'S ?from= SEEDS THE PARTS LIST'S STORE (2026-10-23). A visitor from a Thangs listing arrives with `?from=thangs`. The
 * vendored viewer (js/main.js STORE_STORE_KEY) keeps its preference under `gen2-store` and seeds it from that address, in memory;
 * the Parts list read only its own `gen2-link-store` (js/workspaces/parts.js readStore), so the visitor got Printables links.
 * The browser-free half: readStore()'s order - the planner's own key, then the viewer's key, then the address - under a fake
 * localStorage and location, and the id it returns is the id renderRow matches against a row's links.stores, so the rows link
 * to that store's pages. The e2e suite (e2e/workspaces.mjs) proves the switch and the hidden stores in the page. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';
import { readStore } from '../js/workspaces/parts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);
const partLinks = vm.runInContext('partLinks', ctx);   // the catalog's resolver, the page's global LINKS in parts.js

/* the two browser globals readStore reads, installed for one call: a Map-backed localStorage (null for an absent key, as the
   real one answers) and a location with the given search; `throwing` stands in for private mode */
function withBrowser({ saved = {}, search = '', throwing = false } = {}, fn) {
  const m = new Map(Object.entries(saved));
  const storage = throwing
    ? { getItem() { throw new Error('private mode'); } }
    : { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'location', { value: { search }, configurable: true, writable: true });
  try { return fn(); } finally { delete globalThis.localStorage; delete globalThis.location; }
}
const store = (opts) => withBrowser(opts, () => readStore());

test('with only the viewer\'s key set (a pick in the viewer, or a relay), the list offers that store', () => {
  assert.equal(store({ saved: { 'gen2-store': 'thangs' } }), 'thangs');
  assert.equal(store({ saved: { 'gen2-store': 'printables' } }), 'printables');
  assert.equal(store({ saved: { 'gen2-store': 'thangs', 'gen2-store:t': '1760000000000' } }), 'thangs', 'the viewer\'s stamp rides along and is not a store');
});

test('an explicit planner choice always wins: over the viewer\'s key and over the address', () => {
  assert.equal(store({ saved: { 'gen2-link-store': 'printables', 'gen2-store': 'thangs' } }), 'printables');
  assert.equal(store({ saved: { 'gen2-link-store': 'thangs', 'gen2-store': 'printables' } }), 'thangs');
  assert.equal(store({ saved: { 'gen2-link-store': 'printables', 'gen2-store': 'thangs' }, search: '?from=thangs' }), 'printables');
  assert.equal(store({ saved: { 'gen2-link-store': 'printables' }, search: '?from=thangs' }), 'printables');
});

test('a hidden store (MakerWorld, Cults 3D) reads as Printables under either key; a saved hidden planner choice does not defer to the viewer', () => {
  assert.equal(store({ saved: { 'gen2-store': 'makerworld' } }), 'printables');
  assert.equal(store({ saved: { 'gen2-store': 'cults' } }), 'printables');
  assert.equal(store({ saved: { 'gen2-link-store': 'makerworld', 'gen2-store': 'thangs' } }), 'printables', 'the e2e case\'s saved choices, with a Thangs viewer');
  assert.equal(store({ saved: { 'gen2-link-store': 'cults' }, search: '?from=thangs' }), 'printables');
  assert.equal(store({ saved: { 'gen2-link-store': 'nonsense' } }), 'printables');
  assert.equal(store({ saved: { 'gen2-store': 'nonsense' } }), 'printables');
});

test('nothing saved: the address\'s ?from= names the store (a listing\'s attribution, as main.js storePref reads it); else Printables', () => {
  assert.equal(store({}), 'printables', 'the default');
  assert.equal(store({ search: '?from=thangs' }), 'thangs');
  assert.equal(store({ search: '?ws=parts&from=Thangs' }), 'thangs', 'lower-cased, as the viewer does; the shell keeps the rider through ?ws= rewrites');
  assert.equal(store({ search: '?from=printables' }), 'printables');
  assert.equal(store({ search: '?from=cults' }), 'printables', 'a hidden store\'s listing is counted, not linked');
  assert.equal(store({ search: '?from=' }), 'printables');
  assert.equal(store({ saved: { 'gen2-store': 'makerworld' }, search: '?from=thangs' }), 'thangs', 'a hidden viewer value falls through to the address, as main.js storePref does');
  // private mode, and node with no browser globals at all
  assert.equal(store({ throwing: true, search: '?from=thangs' }), 'printables');
  assert.equal(readStore(), 'printables');
});

test('the id readStore returns is the id a row\'s links carry, so the rows link to that store\'s pages', () => {
  const b = { mount: 'tabletop', length: 185, fill: 'decor', gridH: 2, gridW: 2, nextId: 50, feet: 'tpu', faceStyle: 'edgelabel',
    placed: [{ id: 1, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', closure: 'magnet' }] };
  sanitizeBuild(b, GEN2);
  const rows = bomRows(computeBom(b, GEN2) || [], partLinks).filter((r) => r.links);
  assert.ok(rows.length >= 3, `the control: ${rows.length} linked rows`);
  // renderRow's lookup: r.links.stores.find((s) => s.id === st.site); the hosts every row then links to (Thangs pages sit on
  // thangs.com and on its than.gs short links)
  const hosts = (id) => [...new Set(rows.map((r) => new URL(r.links.stores.find((s) => s.id === id).url).hostname))];
  const THANGS = /(^|\.)(thangs\.com|than\.gs)$/, PRINTABLES = /(^|\.)printables\.com$/;
  const linksTo = (id, re, why) => { const hs = hosts(id); assert.ok(hs.length && hs.every((h) => re.test(h)), `${why}: ${hs.join(', ')}`); };
  linksTo(store({ saved: { 'gen2-store': 'thangs' } }), THANGS, 'a Thangs viewer: every row links to Thangs');
  linksTo(store({ search: '?from=thangs' }), THANGS, 'a Thangs arrival: every row links to Thangs');
  linksTo(store({ saved: { 'gen2-link-store': 'printables', 'gen2-store': 'thangs' } }), PRINTABLES, 'the planner\'s own choice: Printables');
  linksTo(store({ saved: { 'gen2-store': 'makerworld' } }), PRINTABLES, 'a hidden store: Printables');
  linksTo(store({}), PRINTABLES, 'the default: Printables');
});
