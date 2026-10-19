/* The colour-word table (js/colors/words.js, step 5b): every catalog colour maps to a word, none falls through, and the
   mapping is PINNED here as the list checked by eye on 2026-10-18 (STEP5B.md, M21). A catalog change that moves a word
   fails here, so the new word is looked at rather than shipped. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILAMENT_DB } from '../js/filament-db.js';
import { colourWord, OVERRIDES } from '../js/colors/words.js';

const ALL = FILAMENT_DB.flatMap((b) => b.colors.map((c) => ({ label: c.label, hex: c.hex })));

test('every catalog colour has a word, every override names a catalog colour, and the mapping is the one checked by eye', () => {
  const labels = new Set(ALL.map((c) => c.label));
  for (const k of Object.keys(OVERRIDES)) assert.ok(labels.has(k), `override for a colour not in the catalog: ${k}`);
  const words = ALL.map((c) => `${c.label} = ${colourWord(c.hex, c.label)}`);
  console.log('  ' + words.join('\n  '));
  for (const w of words) assert.match(w, / = [a-z ]+$/, w);
  const byWord = new Map(); for (const c of ALL) { const w = colourWord(c.hex, c.label); byWord.set(w, (byWord.get(w) || 0) + 1); }
  console.log('  words: ' + [...byWord.entries()].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} ${n}`).join(', '));
  // the mapping as checked by eye (2026-10-18): a region boundary that moves one of these is looked at, not shipped
  const pinned = { 'Elegoo PLA Black': 'black', 'Panchroma Silk Black': 'black', 'Panchroma Dark Grey': 'charcoal', 'Panchroma Steel Grey': 'grey', 'Panchroma Silk Silver': 'silver', 'Panchroma Cold White': 'white', 'Panchroma Cream': 'cream', 'Panchroma Beige': 'sand', 'Panchroma Tan': 'tan', 'Panchroma Brown': 'brown', 'Panchroma Olive Green': 'olive', 'Panchroma Dark Olive Drab': 'olive', 'Panchroma Red': 'red', 'Panchroma Wine Red': 'wine', 'Polymaker PETG Galaxy Red': 'wine', 'Printed Solid Mystery Orange': 'orange', 'Printed Solid Safety Orange': 'orange', 'Panchroma Yellow': 'yellow', 'Printed Solid Neon Yellow': 'yellow', 'Panchroma Lime Green': 'lime', 'Panchroma Green': 'green', 'Panchroma Jungle Green': 'forest', 'Polymaker PETG Teal': 'teal', 'Panchroma Aqua Blue': 'sky', 'Panchroma Blue': 'blue', 'Printed Solid Bold Blue': 'blue', 'Polymaker PETG Dark Blue': 'navy', 'Printed Solid Blue Moon': 'navy', 'Panchroma Stone Blue': 'slate', 'Panchroma Silk Periwinkle': 'periwinkle', 'Panchroma Purple': 'purple', 'Polymaker PETG Dark Purple': 'plum', 'Printed Solid Deep Purple': 'plum', 'Panchroma Magenta': 'magenta', 'Panchroma Pink': 'pink', 'Panchroma Silk Quartz Pink': 'rose', 'Printed Solid Pure Magenta': 'blush', 'Panchroma Silk Gold': 'gold', 'Panchroma Silk Brass': 'brass', 'Panchroma Silk Bronze': 'bronze', 'Panchroma Silk Chrome': 'chrome', 'ERYONE Burnt Titanium': 'titanium' };
  const byLabel = new Map(ALL.map((c) => [c.label, c.hex]));
  for (const [label, word] of Object.entries(pinned)) assert.equal(colourWord(byLabel.get(label), label), word, label);
});
