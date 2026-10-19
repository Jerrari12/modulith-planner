/* THE STYLES behind "Find your next look" (the Colors plan's step 5b, Astra 2026-10-18): "styles with a sense of place,
   rather than literal room categories", each "a generation direction, not a fixed preset", and "colour relationships,
   not just colour pools".

   A style names three pools over the catalog and two relationships:
     shells      the filaments the shell (the case and the structure) may wear
     accents     the filaments the look's ACCENT COLOUR may be: the one chromatic statement every candidate carries,
                 on more or fewer parts (the three interpretations: quiet, balanced, bold)
     neutrals    the filaments the other roles may fill with (the deck, the label, the handle...)
     hueGap      the least hue distance between two chromatic colours in one look (0 = analogous allowed)
     silkWeight  the chance a silk filament survives a pick when a plain one would do (1 = equal; 0.25 = a quarter:
                 "including bronze or rose gold shouldn't make shiny finishes the default")
   Pools are predicates over a catalog entry { name, hex, L, C, h, cls, silk } (LCh from colour.js; cls = neutral C < 10,
   muted to 25, mid to 45, vivid above) with named lists where a curated collection is the point (Retro pop: "a smaller,
   well-curated collection ... repetition is preferable to stretching the category"). test/styles.test.mjs pins each
   pool as a LABEL LIST, so a predicate that drifts is seen, not shipped. */
const between = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);
const neutral = (c) => c.cls === 'neutral' && c.name !== 'Polymaker PETG Clear';   // a clear filament is no colour for a look ("Black & clear")
const named = (...labels) => { const s = new Set(labels); return (c) => s.has(c.name); };
const any = (...ps) => (c) => ps.some((p) => p(c));

/* the warm neutrals: cream, beige, tan, natural (low chroma, hue 40-125, light) */
const warmNeutral = (c) => c.C >= 10 && c.C < 30 && between(c.h, 55, 125) && c.L >= 60;   // from 55°: rose gold (48°) is an accent, not a shell
/* the earths: brown, olive, bronze, rose gold, tan (hue 40-125, chroma 15-50, not light; brass at C 53 is too loud for "gentle contrasts") */
const earth = (c) => between(c.h, 40, 125) && c.C >= 15 && c.C < 50 && c.L < 75;
/* the quiet blues: stone, slate, dark blue, periwinkle, aqua (hue 200-300, chroma 15-50) */
const quietBlue = (c) => between(c.h, 200, 300) && c.C >= 15 && c.C <= 50;
/* the deep blues a workshop shell may wear */
const deepBlue = (c) => between(c.h, 262, 300) && c.C >= 25 && c.L < 40;
/* the workshop's accents: reds and oranges, and the yellows */
const hot = (c) => (between(c.h, 15, 72) && c.C >= 50) || (between(c.h, 75, 105) && c.C >= 60);

export const STYLES = [
  { id: 'warm', name: 'Warm & natural', hint: 'Cream, sand, olive and clay; gentle contrasts.', swatches: ['#f1e7cf', '#708238', '#7a5236'],
    shells: any((c) => neutral(c) && c.L >= 45, warmNeutral), accents: earth, neutrals: any((c) => neutral(c) && c.L >= 28, warmNeutral), hueGap: 0, silkWeight: 0.25 },   // charcoal and up: a black face reads cold here
  { id: 'calm', name: 'Clean & calm', hint: 'Off-white, soft grey, muted blue; restrained accents.', swatches: ['#eef1f4', '#9a9da3', '#4a6a8a'],
    shells: (c) => neutral(c) && c.L >= 40, accents: any(quietBlue, (c) => neutral(c) && c.L >= 40 && c.L < 75), neutrals: neutral, hueGap: 0, silkWeight: 0.25 },
  { id: 'workshop', name: 'Workshop classic', hint: 'Charcoal, steel grey, deep blue, with a deliberate orange or red accent.', swatches: ['#1c1d20', '#6e7178', '#F56233'],
    shells: any((c) => neutral(c) && c.L < 55, deepBlue), accents: hot, neutrals: neutral, hueGap: 45, silkWeight: 0.5 },
  { id: 'retro', name: 'Retro pop', hint: 'Cream paired with mustard, teal, rust or dusty pink.', swatches: ['#f1e7cf', '#FDC230', '#159a9c'],
    shells: named('Panchroma Cream', 'Panchroma Beige', 'Printed Solid Natural', 'Panchroma Silk White', 'Panchroma Cold White', 'Polymaker PETG Teal', 'Panchroma Polymaker Teal', 'Panchroma Dark Olive Drab'),
    accents: named('Printed Solid Yellow Bird', 'Polymaker PETG Yellow', 'Panchroma Silk Brass', 'Panchroma Silk Gold', 'Polymaker PETG Teal', 'Panchroma Polymaker Teal', 'Panchroma Silk Teal', 'Panchroma Silk Bronze', 'Panchroma Brown', 'Panchroma Silk Quartz Pink', 'Panchroma Pink', 'Panchroma Lemon Yellow', 'Panchroma Olive Green'),
    neutrals: named('Panchroma Cream', 'Panchroma Beige', 'Printed Solid Natural', 'Panchroma Silk White', 'Panchroma Cold White', 'Panchroma White', 'Elegoo PLA Black', 'Panchroma Black', 'Panchroma Dark Grey', 'Panchroma Steel Grey'),
    hueGap: 40, silkWeight: 0.5 },
  { id: 'any', name: 'Anything goes', hint: 'An unexpected combination, drawn from any of the styles.', swatches: ['#2b2b2e', '#E4E202', '#d4308f'],
    shells: (c) => neutral(c) || c.C >= 25, accents: (c) => c.C >= 25, neutrals: any(neutral, (c) => c.cls === 'muted'), hueGap: 40, silkWeight: 1 },
];
export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];
