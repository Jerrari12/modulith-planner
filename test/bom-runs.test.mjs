// SEPARATE TABLETOP SECTIONS (2026-10-16, the board redesign's follow-up checks). A gap at surface level splits a tabletop
// into runs, each finished on its own (the tabletop-completion contract). Measured: the gap build's 3D-model parts and BOM
// equal the two sections built separately - except the optional side covers, which counted only the build's two outermost
// edges. js/rules/bom.js now counts each run's own outer sides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// the catalog is a classic script (`const GEN2 = …`, plus the requirement-scope contract): run both in one context
const ctx = vm.createContext({ console });
// in index.html's order: the contract first
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);

// the schema's own defaults for every field the BOM reads (styles, feet, …)
const build = (placed) => {
  const b = { mount: 'tabletop', length: 185, fill: 'decor', gridH: 2, gridW: Math.max(...placed.map((p) => p.x + p.w)), nextId: 50,
    placed: placed.map((p) => ({ y: 2, hh: 2, fill: 'decor', shelves: 0, ...p })) };
  sanitizeBuild(b, GEN2);   // fills the defaults in place
  return b;
};
const sideCovers = (b) => bomRows(computeBom(b, GEN2) || [], null).filter((r) => /Side Cover/.test(r.name)).reduce((n, r) => n + r.qty, 0);

test('a tabletop with a gap bills side covers for both sections, as if built apart', () => {
  const a = [{ id: 1, x: 0, w: 2 }, { id: 2, x: 2, w: 1 }], b = [{ id: 3, x: 0, w: 1 }, { id: 4, x: 1, w: 1 }];
  const apart = sideCovers(build(a)) + sideCovers(build(b));
  const gap = sideCovers(build([...a, { id: 3, x: 5, w: 1 }, { id: 4, x: 6, w: 1 }]));
  assert.equal(apart, 4);
  assert.equal(gap, apart, 'the sides facing the gap are exposed too');
});

test('a build without a gap keeps the outermost-edge count', () => {
  assert.equal(sideCovers(build([{ id: 1, x: 0, w: 2 }, { id: 2, x: 2, w: 1 }, { id: 3, x: 3, w: 1 }])), 2);
});
