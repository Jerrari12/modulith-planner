/* CHEVRON STRIP COLOURS (2026-11-23; spec docs/redesign/CHEVRON-STRIP-COLOURS.md, Joey: "I want to be able to assign
   Prusament rPLA colors like we did in our hero and thumbnail render", live for everyone). The pure parts the stage
   (main.js) and the Colors workspace use, kept here so they can be tested.

   A Chevron face ships as ONE material zone, FACE, holding every strip; a strip is never a mesh of its own. Which strip a
   point lies on comes from the strip rule: a seam, and on each side a family of 45-degree bands, their pitch and centre
   (mm, the part frame = the GLB scene's frame, as the stage's template sees it):
     { seam, pitch, left: { family, centre }, right: { family, centre } }
   family +1: the strip runs along (1, 1), so y - x is constant on it; -1: along (1, -1), x + y constant.
   - A cabinet door carries its rule on its FACE material (GLB extras, `chevronRule`).
   - A faceplate does not: FACEPLATE_STRIPS below holds it for all 18 sizes, read off the live GLBs' own strips.

   THE COLOURS live in the build's palette, so a link, a file, Recent and Undo carry them with no new field:
     strip colour 1 = `Faceplate:FACE` (the key every Chevron face already had), strip colours 2..9 = `Faceplate:FACE/2`..`/9`
     up to the first gap, the backer = `Faceplate`.
   THE ARRANGEMENT is the record's `stripSeed`: each part rolls its own strips from a hash of the seed and its own key, so
   adding or removing a unit never changes another part (Joey, 2026-11-20: "each part its own"). */

export const MIX_BANDS = 64;          // bands per side of the seam a strip id can name (band 0 at 32)
export const MIX_ROWS = 1024;         // parts the strip table holds; past it, part i shares row i mod 1024
export const MAX_STRIPS = 9;          // Joey, 2026-11-20: "lets do 9, the new h3c supports 9 spools"
export const STRIP_KEY = 'Faceplate:FACE';
export const BACKER_KEY = 'Faceplate';

/* FACEPLATE_STRIPS: the strip rule of every Chevron faceplate size (the generator's size codes: 05H = half a row), read
   2026-11-23 off the live GLBs (gen2-parts/parts/185/Faceplate_Chevron_<size>.lib.glb, the same file in every collection;
   sha256 prefix after each row). Method: the FACE zone's strips are one shell each; each strip's top face gives its band
   start and width, the full-width strips the pitch, and the centre per side is the median offset of the band middles.
   Seam at x = 0 on every size; left strips keep x + y constant, right strips y - x. Checked the same day on every triangle
   of every strip, sampled 0.3 mm inside the surface (as stampStrips samples): each strip one label, all labels distinct,
   10 strips on the 1W-05H up to 42 on the 4W-2H. The door rules (their own GLBs) passed the same check bar slivers of
   0.02 mm2 and one 20 mm2 corner piece on the 1W-1H door, which shows its neighbour's colour. */
export const FACEPLATE_STRIPS = {
  '1W-05H': { strips: 10, pitch: 9.8985, left: -4.2434, right: -4.2434 },   // 0a7f922102f2
  '1W-1H': { strips: 14, pitch: 9.8990, left: -4.2431, right: -4.2431 },   // db07d88fdd1b
  '1W-15H': { strips: 18, pitch: 9.8990, left: -4.2415, right: -4.2415 },   // e3812dfbb966
  '1W-2H': { strips: 22, pitch: 9.8990, left: -4.2402, right: -4.2402 },   // 268dcb305241
  '1W-3H': { strips: 30, pitch: 9.8980, left: -4.2376, right: -4.2376 },   // 87a7bc264735
  '2W-05H': { strips: 16, pitch: 9.9010, left: 4.2453, right: 4.2453 },   // 0b8d4e1eab80
  '2W-1H': { strips: 20, pitch: 9.9020, left: 4.2462, right: 4.2462 },   // 9fc991212ac0
  '2W-15H': { strips: 24, pitch: 9.9010, left: 4.2432, right: 4.2432 },   // 40fbc4196dd2
  '2W-2H': { strips: 28, pitch: 9.9020, left: 4.2421, right: 4.2421 },   // f1da9e8dc17a
  '2W-3H': { strips: 36, pitch: 9.9020, left: 4.2362, right: 4.2362 },   // d1a1fd0b3323
  '3W-05H': { strips: 22, pitch: 9.8980, left: 2.8230, right: 2.8230 },   // cd4a8f7041d3
  '3W-1H': { strips: 26, pitch: 9.8980, left: 2.8231, right: 2.8231 },   // 8381ea1205de
  '3W-15H': { strips: 30, pitch: 9.8980, left: 2.8274, right: 2.8274 },   // b2961422efc1
  '3W-2H': { strips: 34, pitch: 9.8980, left: 2.8304, right: 2.8304 },   // c115bfa9a08e
  '4W-05H': { strips: 30, pitch: 9.8960, left: 1.3950, right: 1.3911 },   // d2c696fd1127
  '4W-1H': { strips: 34, pitch: 9.8970, left: 1.4031, right: 1.4031 },   // fd745c904951
  '4W-15H': { strips: 38, pitch: 9.8960, left: 1.4003, right: 1.4003 },   // 1e4e8c1173f8
  '4W-2H': { strips: 42, pitch: 9.9070, left: 1.4258, right: 1.4258 },   // 4d0fa7c33e78
};

/* a faceplate node's rule, or null for anything that is not a Chevron faceplate */
export function faceplateRule(node) {
  const m = /^Faceplate_Chevron_(\dW-\d+H)$/.exec(String(node || ''));
  const r = m && FACEPLATE_STRIPS[m[1]];
  return r ? { seam: 0, pitch: r.pitch, left: { family: -1, centre: r.left }, right: { family: 1, centre: r.right }, strips: r.strips } : null;
}

/* the strip a point of a Chevron face lies on: 0..63 left of the seam, 64..127 right of it, band 0 at 32 */
export function stripIdOf(x, y, rule) {
  const left = x < rule.seam, f = left ? rule.left : rule.right;
  const u = f.family > 0 ? (y - x) / Math.SQRT2 : (x + y) / Math.SQRT2;
  const band = Math.max(0, Math.min(MIX_BANDS - 1, Math.round((u - f.centre) / rule.pitch) + MIX_BANDS / 2));
  return (left ? 0 : MIX_BANDS) + band;
}

/* ---------------- the arrangement ---------------- */

/* a part's own 32-bit seed: FNV-1a over "<build seed>|<part key>", never 0 */
export function hashSeed(seed, partKey) {
  const s = `${(seed >>> 0) || 1}|${partKey}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h || 1;
}
const xorshift = (seed32) => { let s = (seed32 >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

/* the colours present in a part's window ({ left: [bands], right: [bands] }, the bands its FACE uses) */
const cellsOf = (L, R, window) => [...(window.left || []).map((b) => L + b), ...(window.right || []).map((b) => R + b)];
function covers(data, cells, k) { const seen = new Set(); for (const c of cells) seen.add(data[c]); return seen.size >= Math.min(k, cells.length); }

/* make every colour appear in the window when it holds at least k strips: a cell whose colour shows more than once takes a
   missing colour, as long as neither neighbour along its side has it and (3+ colours) nor does the strip it meets at the
   seam. Returns whether every colour now shows. */
function coverAll(data, L, R, k, window, rnd) {
  const cells = cellsOf(L, R, window);
  if (cells.length < k) return covers(data, cells, k);
  for (let pass = 0; pass < k; pass++) {
    const count = new Array(k).fill(0);
    for (const c of cells) count[data[c]]++;
    const missing = count.map((n, c) => (n ? -1 : c)).filter((c) => c >= 0);
    if (!missing.length) return true;
    const c = missing[0];
    const ok = cells.filter((cell) => {
      if (count[data[cell]] < 2) return false;
      const side = cell < R ? L : R, b = cell - side;
      if (b > 0 && data[cell - 1] === c) return false;
      if (b < MIX_BANDS - 1 && data[cell + 1] === c) return false;
      if (k >= 3 && data[side === L ? R + b : L + b] === c) return false;
      return true;
    });
    if (!ok.length) return false;
    data[ok[Math.floor(rnd() * ok.length)]] = c;
  }
  return covers(data, cells, k);
}

/* one part's strips: row pair `row` of `data` (row 2*row the left side, 2*row+1 the right, MIX_BANDS bands each) gets a
   palette index per band, from k colours. Neighbouring bands along a side never share a colour when k >= 2; with k >= 3 the
   right side's band b also differs from the left side's band b, the strip it meets at a faceplate's (symmetric) seam (a
   door's off-centre seam pairs other bands, which may match). With a window, every colour shows on the part when it has
   at least k strips: up to 24 rolls are tried, in a fixed order, and the first that covers is kept. Deterministic. */
export function rollPart(data, row, k, seed32, window = null) {
  const L = 2 * row * MIX_BANDS, R = L + MIX_BANDS;
  if (k <= 1) { data.fill(0, L, R + MIX_BANDS); return data; }
  for (let attempt = 0; attempt < 24; attempt++) {
    const rnd = xorshift(attempt ? hashSeed(seed32, attempt) : seed32);
    const pick = (avoid) => {
      const ok = [];
      for (let c = 0; c < k; c++) if (!avoid.includes(c)) ok.push(c);
      return ok.length ? ok[Math.floor(rnd() * ok.length)] : Math.floor(rnd() * k);
    };
    for (let b = 0; b < MIX_BANDS; b++) data[L + b] = pick(b ? [data[L + b - 1]] : []);
    for (let b = 0; b < MIX_BANDS; b++) {
      const avoid = b ? [data[R + b - 1]] : [];
      if (k >= 3) avoid.push(data[L + b]);
      data[R + b] = pick(avoid);
    }
    if (!window || coverAll(data, L, R, k, window, rnd)) break;
  }
  return data;
}

/* ---------------- the colours ---------------- */

export const slotKey = (i) => (i <= 1 ? STRIP_KEY : `${STRIP_KEY}/${i}`);
/* a palette key's strip slot: 1 for the FACE key, 2..9 for a slot key, 0 for anything else (a "/10" is no slot) */
export const slotOfKey = (key) => { if (key === STRIP_KEY) return 1; const m = /^Faceplate:FACE\/([2-9])$/.exec(String(key)); return m ? +m[1] : 0; };
export const isSlotKey = (key) => slotOfKey(key) >= 2;
/* a filament's identity, as filamentsInBuild counts it: its name, else its hex */
export const filamentId = (f) => (f && f.hex ? (f.name || String(f.hex).toLowerCase()) : '');

/* the strip colours a palette holds: slot 1 (the FACE key, null while unpicked), then slots 2..9 up to the first gap. Every
   reader goes through this, so a "/10" or a key after a gap is never read. */
export function stripSlots(colors) {
  const out = [(colors && colors[STRIP_KEY] && colors[STRIP_KEY].hex) ? colors[STRIP_KEY] : null];
  for (let i = 2; i <= MAX_STRIPS; i++) {
    const f = colors && colors[slotKey(i)];
    if (!f || !f.hex) break;
    out.push(f);
  }
  return out;
}

/* k and the palette the stage draws: the distinct strip filaments in slot order (slot 1 resolved to `slot1` when unpicked),
   their hexes, and each slot's palette index. A duplicate slot counts once, so the roll never puts one filament on two
   neighbouring strips. */
export function stripPalette(slots, slot1 = null) {
  const ids = [], hexes = [], names = [], idx = [];
  slots.forEach((f, i) => {
    const g = f || (i === 0 ? slot1 : null);
    const id = filamentId(g) || '#none';
    let j = ids.indexOf(id);
    if (j < 0) { j = ids.length; ids.push(id); hexes.push(g && g.hex ? g.hex : '#888888'); names.push((g && g.name) || null); }
    idx.push(j);
  });
  return { k: ids.length, hexes, names, idx };   // names: each palette colour's filament label (null unpicked), for its own finish
}

/* the slicer's filament number per slot: the backer is F1; the strips take F2, F3 ... in slot order, one number per
   distinct filament, and a strip in the backer's filament is F1. So the count of numbers is the filaments at once. */
export function fNumbers(slots, backer) {
  const bid = filamentId(backer), seen = new Map();
  let next = 2;
  return slots.map((f) => {
    const id = filamentId(f);
    if (bid && id === bid) return 1;
    if (!seen.has(id)) seen.set(id, next++);
    return seen.get(id);
  });
}
/* the filaments a Chevron part prints in at once: the distinct strip filaments and the backer */
export const filamentsAtOnce = (slots, backer) => new Set([...slots, backer].map(filamentId).filter(Boolean)).size;

/* the ladder's step, read from the colours and never stored: two or more strip colours a mix; else a backer in strip
   colour 1's filament one colour; else two-tone */
export function stripStep(slots, backer) {
  if (slots.length >= 2) return 'mix';
  const a = filamentId(slots[0]), b = filamentId(backer);
  return a && a === b ? 'one' : 'two';
}

/* ---------------- the strip palettes ----------------
   One tap in the Strip colours panel sets the strip colours (and, where given, the backer) as one undo step. Named catalog
   filaments only, by label (js/filament-db.js), so every one has a buy link; within a palette no two colours sit closer than
   CIEDE2000 10, the panel's look-alike line, except Coffee's Algae and Wine (Prusa's own hexes, 3.2 apart). A palette's
   backer is kept as the build's own when the build's backer already looks like it (colors.js applyStripPalette), so a
   black-backed build never gains a second black spool. test/chevron-mix.test.mjs checks the labels and the distances. */
export const STRIP_PALETTES = [
  // the hero and thumbnail renders' coffee station (category_art.py "coffee"): Prusament rPLA strips and black, on black
  { id: 'coffee', name: 'Coffee', title: 'Prusament rPLA Algae, Corn, Risotto and Wine, with black strips on a black backer', strips: ['Prusament rPLA Algae', 'Prusament rPLA Corn', 'Prusament rPLA Risotto', 'Prusament rPLA Wine', 'Elegoo PLA Black'], backer: 'Elegoo PLA Black' },
  /* Teal & orange (Joey: "add a teal and orange palette too"): the renders' "retro" palette, read by eye off Joey's teal /
     orange / cream / grey Chevron photo (category_art.py), as the nearest named filaments by CIEDE2000: teal #2F8F8B ->
     Panchroma Polymaker Teal (7.4), orange #E8772E -> Panchroma Orange (5.9), cream #DCC9A8 -> Panchroma Beige (1.5), grey
     #C9CBCC -> Prusament rPLA Risotto (5.6), black #1A1A1A -> Elegoo PLA Black (2.4); then Joey, the same day: "lets make the strip 4
     Panchroma Silk silver", so the grey strip is a silk one */
  { id: 'teal-orange', name: 'Teal & orange', title: 'Panchroma Polymaker Teal, Orange and Beige, Panchroma Silk Silver and black strips on a black backer', strips: ['Panchroma Polymaker Teal', 'Panchroma Orange', 'Panchroma Beige', 'Panchroma Silk Silver', 'Elegoo PLA Black'], backer: 'Elegoo PLA Black' },
  { id: 'rpla', name: 'Prusament rPLA', title: 'The four Prusament rPLA colours, on the backer you have', strips: ['Prusament rPLA Algae', 'Prusament rPLA Corn', 'Prusament rPLA Risotto', 'Prusament rPLA Wine'] },
  // Joey: "add a few more strip palettes" (2026-11-23): themed sets, mostly the Panchroma line; the closest pair in each in ()
  { id: 'mono', name: 'Monochrome', title: 'White, grey, steel grey, dark grey and black strips on a black backer (Panchroma)', strips: ['Panchroma White', 'Panchroma Grey', 'Panchroma Steel Grey', 'Panchroma Dark Grey', 'Elegoo PLA Black'], backer: 'Elegoo PLA Black' },   // (13.5)
  { id: 'ocean', name: 'Ocean', title: 'Teal, aqua, azure, stone blue and cold white strips on a black backer (Panchroma)', strips: ['Panchroma Polymaker Teal', 'Panchroma Aqua Blue', 'Panchroma Azure Blue', 'Panchroma Stone Blue', 'Panchroma Cold White'], backer: 'Elegoo PLA Black' },   // (14.7)
  { id: 'sunset', name: 'Sunset', title: 'Wine red, red, orange, yellow and cream strips on a black backer (Panchroma)', strips: ['Panchroma Wine Red', 'Panchroma Red', 'Panchroma Orange', 'Panchroma Yellow', 'Panchroma Cream'], backer: 'Elegoo PLA Black' },   // (20.7)
  { id: 'forest', name: 'Forest', title: 'Jungle green, green, olive, tan and brown strips on a black backer (Panchroma)', strips: ['Panchroma Jungle Green', 'Panchroma Green', 'Panchroma Olive Green', 'Panchroma Tan', 'Panchroma Brown'], backer: 'Elegoo PLA Black' },   // (13.7)
  // every strip and the backer glitter, so the preview's one finish (strip colour 1's) is every strip's own here
  { id: 'galaxy', name: 'Galaxy', title: 'Prusament Galaxy purple, green, silver and red strips on a Galaxy Black backer (all glitter)', strips: ['Prusament Galaxy Purple', 'Prusament Galaxy Green', 'Prusament Galaxy Silver', 'Prusament Galaxy Red'], backer: 'Prusament Galaxy Black' },   // (33.2)
  { id: 'pastel', name: 'Pastel', title: 'Pink, mint, lavender, lemon and aqua strips on a white backer (Polar, Panchroma)', strips: ['Polar Pink', 'Polar Mint', 'Polar Lavender', 'Polar Lemon Drop', 'Panchroma Aqua Blue'], backer: 'Panchroma White' },   // (20.2)

  /* POPULAR COMBOS (Joey: "keep trying more colors combos, look at popular color combos from site like kolors", 2026-11-23):
     the most liked palettes on Coolors (coolors.co/palettes/popular and /trending, read that day in a browser), each colour
     matched to the nearest named PLA filament in the catalog by CIEDE2000 with every pair kept 10 or more apart (src holds
     Coolors' hexes; the match distance of each strip after it). Any brand, because one brand alone matched worse (a mean of
     8 to 13 against 4 to 7). No backer: the build keeps its own. Left out: palettes that are gradients or all pastel (their
     colours sit 2 to 5 apart), and Olive Garden Feast, whose dark olive matched only a black (15.8). In the panel under
     Popular combos. */
  { id: "sunny-beach-day", name: "Sunny Beach Day", group: 'popular', src: "264653-2a9d8f-e9c46a-f4a261-e76f51", title: "Popular on Coolors (124.3K likes), as the nearest named filaments: Prusament PLA Gentleman's Grey, Polar Squid, Panchroma Yellow, Panchroma Orange, Printed Solid Mystery Orange", strips: ["Prusament PLA Gentleman's Grey", "Polar Squid", "Panchroma Yellow", "Panchroma Orange", "Printed Solid Mystery Orange"] },   // match 6.3 4.9 5.3 7.2 5.2; closest pair 11.1
  { id: "summer-ocean-breeze", name: "Summer Ocean Breeze", group: 'popular', src: "e63946-f1faee-a8dadc-457b9d-1d3557", title: "Popular on Coolors (79K likes), as the nearest named filaments: Prusament PLA Lipstick Red, Polar Natural, Panchroma Aqua Blue, Prusament PLA Azure Blue, Polar Deep Space", strips: ["Prusament PLA Lipstick Red", "Polar Natural", "Panchroma Aqua Blue", "Prusament PLA Azure Blue", "Polar Deep Space"] },   // match 5.8 5.4 11.2 5.1 6.4; closest pair 21.6
  { id: "refreshing-summer-fun", name: "Refreshing Summer Fun", group: 'popular', src: "8ecae6-219ebc-023047-ffb703-fb8500", title: "Popular on Coolors (67.7K likes), as the nearest named filaments: Panchroma Aqua Blue, Prusament PLA Chalky Blue, Polar Deep Space, Printed Solid Yellow Bird, Polar Blaze Orange", strips: ["Panchroma Aqua Blue", "Prusament PLA Chalky Blue", "Polar Deep Space", "Printed Solid Yellow Bird", "Polar Blaze Orange"] },   // match 6.6 8.1 5.5 3.7 1; closest pair 13.5
  { id: "warm-autumn-glow", name: "Warm Autumn Glow", group: 'popular', src: "003049-d62828-f77f00-fcbf49-eae2b7", title: "Popular on Coolors (48K likes), as the nearest named filaments: Polar Deep Space, Panchroma Red, Polar Blaze Orange, Printed Solid Yellow Bird, Panchroma Cream", strips: ["Polar Deep Space", "Panchroma Red", "Polar Blaze Orange", "Printed Solid Yellow Bird", "Panchroma Cream"] },   // match 5.4 2.2 2.7 3.1 6.2; closest pair 19.5
  { id: "vibrant-color-fiesta", name: "Vibrant Color Fiesta", group: 'popular', src: "ffbe0b-fb5607-ff006e-8338ec-3a86ff", title: "Popular on Coolors (45.1K likes), as the nearest named filaments: Printed Solid Yellow Bird, Printed Solid Mystery Orange, Polar Magenta, Polar Nebula, Printed Solid Elixir Aquamarine", strips: ["Printed Solid Yellow Bird", "Printed Solid Mystery Orange", "Polar Magenta", "Polar Nebula", "Printed Solid Elixir Aquamarine"] },   // match 1.9 4.3 5.4 4.8 3.7; closest pair 29.4
  { id: "neutral-harmony-bliss", name: "Neutral Harmony Bliss", group: 'popular', src: "f4f1de-e07a5f-3d405b-81b29a-f2cc8f", title: "Popular on Coolors (48.1K likes), as the nearest named filaments: Polar Retro Platinum, Printed Solid Mystery Orange, Panchroma Dark Grey, Prusament PLA Pistachio Green, Polar Desert Tan", strips: ["Polar Retro Platinum", "Printed Solid Mystery Orange", "Panchroma Dark Grey", "Prusament PLA Pistachio Green", "Polar Desert Tan"] },   // match 3.4 7.7 11 8.9 3.8; closest pair 14.3
  { id: "fiery-ocean", name: "Fiery Ocean", group: 'popular', src: "780000-c1121f-fdf0d5-003049-669bbc", title: "Popular on Coolors (34.8K likes), as the nearest named filaments: Prusament PLA Blood Red, Polar Candy Red, Panchroma Cream, Polar Deep Space, Prusament PLA Chalky Blue", strips: ["Prusament PLA Blood Red", "Polar Candy Red", "Panchroma Cream", "Polar Deep Space", "Prusament PLA Chalky Blue"] },   // match 6.7 5.1 2.4 5.4 5.8; closest pair 12.1
  { id: "watermelon-sorbet", name: "Watermelon Sorbet", group: 'popular', src: "ef476f-ffd166-06d6a0-118ab2-073b4c", title: "Popular on Coolors (36.2K likes), as the nearest named filaments: Polar Magenta, Panchroma Yellow, Prusament PLA Prusa Pro Green, Prusament PLA Azure Blue, Polar Deep Space", strips: ["Polar Magenta", "Panchroma Yellow", "Prusament PLA Prusa Pro Green", "Prusament PLA Azure Blue", "Polar Deep Space"] },   // match 8.1 3.9 5.1 3 6.5; closest pair 23.4
  { id: "summer-dream", name: "Summer Dream", group: 'popular', src: "0081a7-00afb9-fdfcdc-fed9b7-f07167", title: "Popular on Coolors (28.7K likes), as the nearest named filaments: Prusament PLA Azure Blue, Panchroma Polymaker Teal, Printed Solid Natural, Prusament PLA Noctua Beige, Polar Coral", strips: ["Prusament PLA Azure Blue", "Panchroma Polymaker Teal", "Printed Solid Natural", "Prusament PLA Noctua Beige", "Polar Coral"] },   // match 1.4 4.8 5 4.9 4.1; closest pair 16.4
  { id: "coastal-vibes", name: "Coastal Vibes", group: 'popular', src: "3d5a80-98c1d9-e0fbfc-ee6c4d-293241", title: "Popular on Coolors (28.4K likes), as the nearest named filaments: Printed Solid Blue Whale Grey, Panchroma Aqua Blue, Prusament PLA Pristine White, Printed Solid Mystery Orange, Panchroma Black", strips: ["Printed Solid Blue Whale Grey", "Panchroma Aqua Blue", "Prusament PLA Pristine White", "Printed Solid Mystery Orange", "Panchroma Black"] },   // match 3.4 9.3 9.2 4.3 7.2; closest pair 22.5
  { id: "fresh-greens", name: "Fresh Greens", group: 'popular', src: "386641-6a994e-a7c957-f2e8cf-bc4749", title: "Popular on Coolors (23K likes), as the nearest named filaments: Panchroma Jungle Green, Prusament PLA Simply Green, Panchroma Lime Green, Panchroma Cream, Polar Candy Red", strips: ["Panchroma Jungle Green", "Prusament PLA Simply Green", "Panchroma Lime Green", "Panchroma Cream", "Polar Candy Red"] },   // match 4.6 5.5 3.3 0.4 4; closest pair 11.9
  { id: "candy-pop", name: "Candy Pop", group: 'popular', src: "9b5de5-f15bb5-fee440-00bbf9-00f5d4", title: "Popular on Coolors (23.6K likes), as the nearest named filaments: Polar Blurple, Polar Bubblegum, Panchroma Lemon Yellow, Polar Light Blue, Polar Mint", strips: ["Polar Blurple", "Polar Bubblegum", "Panchroma Lemon Yellow", "Polar Light Blue", "Polar Mint"] },   // match 8.3 5.6 2.6 5.3 8.8; closest pair 25.4
  { id: "golden-summer-glow", name: "Golden Summer Glow", group: 'popular', src: "0d3b66-faf0ca-f4d35e-ee964b-f95738", title: "Popular on Coolors (15.2K likes), as the nearest named filaments: Polar Deep Space, Panchroma Cream, Printed Solid Elixir Gold Rush, Panchroma Orange, Printed Solid Mystery Orange", strips: ["Polar Deep Space", "Panchroma Cream", "Printed Solid Elixir Gold Rush", "Panchroma Orange", "Printed Solid Mystery Orange"] },   // match 5.2 4.7 3.9 5.8 3.8; closest pair 11.1
  { id: "golden-meadow", name: "Golden Meadow", group: 'popular', src: "fb6107-f3de2c-7cb518-5c8001-fbb02d", title: "Popular on Coolors (5,129 likes), as the nearest named filaments: Prusament PLA Prusa Orange, Panchroma Lemon Yellow, Panchroma Lime Green, Panchroma Olive Green, Printed Solid Yellow Bird", strips: ["Prusament PLA Prusa Orange", "Panchroma Lemon Yellow", "Panchroma Lime Green", "Panchroma Olive Green", "Printed Solid Yellow Bird"] },   // match 3.9 3.4 6.6 6.3 6.2; closest pair 11.6
];
