/* M2 (2026-11-05): the parts drawer's record fields ride the schema only while the flag has switched them on
   (js/rules/schema.js setPartsDrawerFields, set by app.js on a ?partsdrawer=1 page). Off, the default, a unit's
   `variant: 'parts'` and `partsLayout` are dropped like any unknown field, so a page without the flag never carries
   them; on, both survive sanitizeBuild and serializeBuild (the hash, the history, a file). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { sanitizeBuild, serializeBuild, setPartsDrawerFields } from '../../js/rules/schema.js';

// the planner's catalog, a classic-script lexical global, the way the other schema tests load it
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);

const record = () => ({ mount: 'tabletop', length: 240, gridW: 2, gridH: 1, nextId: 3, placed: [
  { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0, variant: 'parts', partsLayout: { v: 2, label: 'large', nc: 2, nr: 1, floor: { mode: 'off', slots: 3 }, comps: [{ x0: 0, x1: 78.75, y0: 0, y1: 226 }, { x0: 80.25, x1: 159, y0: 0, y1: 226 }] } },
] });

test('without the flag the parts drawer fields are dropped; with it they are kept and serialized', () => {
  setPartsDrawerFields(false);
  const off = record(); sanitizeBuild(off, GEN2);
  assert.equal(off.placed[0].variant, undefined); assert.equal(off.placed[0].partsLayout, undefined);
  setPartsDrawerFields(true);
  try {
    const on = record(); sanitizeBuild(on, GEN2);
    assert.equal(on.placed[0].variant, 'parts'); assert.equal(on.placed[0].partsLayout.comps.length, 2);
    const ser = serializeBuild(on);
    assert.equal(ser.placed[0].variant, 'parts'); assert.deepEqual(ser.placed[0].partsLayout, record().placed[0].partsLayout);
    // a layout that is not an object, or too large, is dropped; the variant stays (the standard drawer renders, the choice survives)
    const junk = record(); junk.placed[0].partsLayout = 'nope'; sanitizeBuild(junk, GEN2);
    assert.equal(junk.placed[0].variant, 'parts'); assert.equal(junk.placed[0].partsLayout, undefined);
    const huge = record(); huge.placed[0].partsLayout = { comps: Array.from({ length: 5000 }, () => ({ x0: 0, x1: 1, y0: 0, y1: 1 })) }; sanitizeBuild(huge, GEN2);
    assert.equal(huge.placed[0].partsLayout, undefined);
    // never on a non-decor unit
    const classic = record(); classic.placed[0].fill = 'classic'; sanitizeBuild(classic, GEN2);
    assert.equal(classic.placed[0].variant, undefined);
  } finally { setPartsDrawerFields(false); }
});
