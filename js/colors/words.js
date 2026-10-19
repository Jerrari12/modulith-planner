/* COLOUR WORDS for a look's title (the Colors plan's step 5b, Astra 2026-10-18: "give cards short names such as 'Sand &
   charcoal' ... a small, manually checked colour-word mapping is sufficient for this catalog").

   A word comes from the colour's LCh region, in the order below (the first rule that fits wins), with named overrides
   where a filament's own finish is its word (chrome, gold, brass, bronze, rose gold, titanium, clear, natural) or the
   region's word would be wrong for it. The regions were drawn against the catalog's own 112 colours (the hue of a blue
   filament sits at 265-300° in CIELAB, a red at 30-40°, a yellow at 85-100°), and test/words.test.mjs prints the whole
   mapping and pins it: every colour has a word from the table, none falls through, and the list is the one checked by
   eye on 2026-10-18. */
import { lch } from './colour.js';

export const OVERRIDES = {
  'Panchroma Silk Chrome': 'chrome', 'Panchroma Silk Gold': 'gold', 'Panchroma Silk Brass': 'brass', 'Panchroma Silk Bronze': 'bronze',
  'Panchroma Silk Rose Gold': 'rose gold', 'Panchroma Silk Gunmetal Grey': 'gunmetal', 'ERYONE Burnt Titanium': 'titanium',
  'Polymaker PETG Clear': 'clear', 'Printed Solid Natural': 'natural', 'Printed Solid Elixir Gold Rush': 'gold',
  'Printed Solid Blue Whale Grey': 'slate', 'Printed Solid Blue Ice': 'navy',
};
const between = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);

/* the word for a hex, by region; `name` (a catalog label) is looked up in OVERRIDES first */
export function colourWord(hex, name = '') {
  if (name && OVERRIDES[name]) return OVERRIDES[name];
  const [L, C, h] = lch(hex);
  if (C < 10) return L < 28 ? 'black' : L < 40 ? 'charcoal' : L < 72 ? 'grey' : L < 88 ? 'silver' : 'white';
  const warm = between(h, 40, 125);
  if (C < 25) {   // muted
    if (L >= 85) return warm ? 'cream' : between(h, 320, 40) ? 'blush' : 'ivory';
    if (warm) return L >= 78 ? 'sand' : L >= 60 ? 'tan' : h >= 95 ? 'olive' : 'brown';
    return between(h, 320, 40) ? 'rose' : between(h, 200, 300) ? 'slate' : 'stone';
  }
  if (between(h, 325, 15)) return L >= 60 ? 'pink' : 'magenta';
  if (between(h, 15, 42)) return L < 36 ? 'wine' : C < 50 ? (L < 50 ? 'brick' : 'terracotta') : 'red';
  if (between(h, 42, 72)) return C < 50 ? (L < 55 ? 'brown' : 'tan') : 'orange';
  if (between(h, 72, 105)) return C < 45 ? (L < 60 ? 'olive' : L < 85 ? 'tan' : 'cream') : L < 76 ? 'mustard' : 'yellow';
  if (between(h, 105, 132)) return C < 55 ? 'olive' : 'lime';
  if (between(h, 132, 175)) return L < 45 ? 'forest' : C < 40 && L >= 80 ? 'mint' : 'green';
  if (between(h, 175, 215)) return L >= 80 ? 'mint' : 'teal';
  if (between(h, 215, 262)) return L >= 68 ? 'sky' : 'blue';
  if (between(h, 262, 300)) return L < 33 ? 'navy' : C < 45 && L >= 60 ? 'periwinkle' : 'blue';
  return L < 38 ? 'plum' : 'purple';   // 300-325
}
export const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
