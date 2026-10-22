/* THE LOOK GENERATOR behind "Find your next look" (the Colors plan's step 5, 2026-10-18; its presentation Astra's
   refinement, step 5b, the same day): three whole looks for the build, from the real catalog, in a STYLE (styles.js),
   under the visitor's constraints, obeying every rule the presets are held to (test/presets.test.mjs).

   A look is built from ROLES and written out to the 28 keys every preset sets, so the product rules hold by construction
   and are checked again before a look leaves (`checkLook`):
     shell       Case, CaseExtender, SideCover, ShelfLip, CoverL, CoverU, FootrailL, FootrailU, Rail, Bracket, BackCover
                 (the extender, the lip and the side-cover core take the case colour; lower and upper parts share one)
     drawer      Drawer
     face        Faceplate, Faceplate:FACE, Faceplate:GRIP, SideCover:FACE   (GRIP = FACE, Joey 2026-10-18; the side-cover
                 face follows the faceplate FACE, decision D1)
     gripAccent  Faceplate:GRIP ACCENT
     accent      Accent   (≠ FACE: the EdgeLabel family's accent sits on the face, Joey 2026-10-18)
     handle      Handle
     label/text  Label, Label:TEXT   (4.5:1 between them, so the text reads)
     small       QuickLock, MagnetClip, Stopper
     deck        ShelfInsert   (≥ 4.5:1 against the shell, from a colour INSIDE the look: Joey 2026-08-30)
     feet        Foot            (TPU, always PolyFlex TPU95 Black: the feet's material, never a look's colour, and not counted
                                  against the cap; Joey, 2026-10-21)
     hardware    Magnet, Screw   (bought, never printed, never counted: Panchroma Silk Silver, as the presets have it)

   Every candidate carries ONE ACCENT COLOUR from the style's accents, on more or fewer parts: the three candidates of a
   roll are three INTERPRETATIONS of the style (Astra: "one mostly neutral, one balanced, one with a stronger accent"),
   told apart by the visible area that carries the accent colour (AREA, an estimate of the root kit's silhouette by
   role), which must rise from the first to the third:
     quiet      the accent colour on the Accent part and the grip accent only; the face a neutral other than the shell
     balanced   the accent colour on the face (the side-cover face and the grip with it); the Accent part another colour
     bold       the accent colour on the face, the handle, the small parts and the drawer body as well
   THE CAP is the distinct filaments over every role but feet and hardware (the build's own count, decision D2, can only be lower)
   and a ceiling: a look fills it when the pool allows and takes fewer colours when it does not. Two filaments in one look
   must read as different colours (CIEDE2000 ≥ 10). Translucent filaments are never picked: a look card renders one as a
   solid tint (STEP2-GATE.md). A LOCK (a role fixed to a filament) wins over the style and over the owned list: it is the
   visitor's own choice. A candidate that a lock or the cap makes impossible is left out and said so, never padded.

   These rules make a look consistent with the planner's colour constraints; they say nothing about whether a filament
   suits a part (Astra, 2026-10-18: keep those claims apart).

   Pure: no DOM, no stage; seeded (mulberry32), so a test can pin thousands of looks. */
import { FILAMENT_DB } from '../filament-db.js';
import { hexToLab, deltaE00, contrast, lch } from './colour.js';
import { STYLES, styleById } from './styles.js';
import { colourWord, cap as capWord } from './words.js';

export const ROLE_KEYS = {
  shell: ['Case', 'CaseExtender', 'SideCover', 'ShelfLip', 'CoverL', 'CoverU', 'FootrailL', 'FootrailU', 'Rail', 'Bracket', 'BackCover'],
  drawer: ['Drawer'],
  face: ['Faceplate', 'Faceplate:FACE', 'Faceplate:GRIP', 'SideCover:FACE'],
  gripAccent: ['Faceplate:GRIP ACCENT'],
  accent: ['Accent'],
  handle: ['Handle'],
  label: ['Label'],
  text: ['Label:TEXT'],
  small: ['QuickLock', 'MagnetClip', 'Stopper'],
  deck: ['ShelfInsert'],
  feet: ['Foot'],
  hardware: ['Magnet', 'Screw'],
};
export const PALETTE_KEYS = Object.values(ROLE_KEYS).flat();   // the 28 keys every preset sets
/* the regions a visitor can lock (a chip each, when the build has the region): the palette key, the role it fixes, its name */
export const LOCKS = [['Case', 'shell', 'Case'], ['Drawer', 'drawer', 'Drawer body'], ['Faceplate:FACE', 'face', 'Face'], ['Accent', 'accent', 'Accent'], ['Handle', 'handle', 'Handle'], ['Label', 'label', 'Label'], ['ShelfInsert', 'deck', 'Shelf deck']];
export const CAPS = [2, 3, 4];
export const SLOTS = ['quiet', 'balanced', 'bold'];
/* the share of the visible area a role carries, an ESTIMATE from the root kit's silhouette (a 2W-2H tabletop with Classic
   faceplates, seen from the stage's default three-quarter view), not a measurement; the order between the three
   interpretations is asserted on these numbers in test/surprise.test.mjs, so a weight that stops separating them fails there */
export const AREA = { shell: 0.44, face: 0.24, deck: 0.06, drawer: 0.06, handle: 0.05, accent: 0.05, label: 0.05, small: 0.03, gripAccent: 0.02, text: 0, hardware: 0 };
export const HARDWARE = 'Panchroma Silk Silver';
export const FEET = 'Polymaker PolyFlex TPU95 Black';   // the stage's FEET_TPU (main.js)
const MIN_CONTRAST = 4.5;   // the deck against the shell, the label text against the label (test/presets.test.mjs)
const MIN_DE = 10;          // two filaments of one look must read as two colours
const ATTEMPTS = 160;       // per interpretation

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* the catalog read for generating: every colour with its Lab, LCh and chroma class, plus a CIEDE2000 table between all
   pairs (memoised for the shipped catalog; a test may pass its own) */
let CAT = null;
export function catalog(db = FILAMENT_DB) {
  if (db === FILAMENT_DB && CAT) return CAT;
  const list = [];
  for (const b of db) for (const c of b.colors) {
    const [L, C, h] = lch(c.hex);
    list.push({ i: list.length, name: c.label, hex: c.hex, url: c.url, L, C, h, lab: hexToLab(c.hex), silk: /Silk/.test(b.line), tpu: /TPU/.test(b.line), translucent: !!c.translucent, cls: C < 10 ? 'neutral' : C < 25 ? 'muted' : C < 45 ? 'mid' : 'vivid' });
  }
  const n = list.length, de = new Float32Array(n * n);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) de[a * n + b] = de[b * n + a] = deltaE00(list[a].lab, list[b].lab);
  const cat = { list, byName: new Map(list.map((c) => [c.name, c])), dE: (a, b) => de[a.i * n + b.i] };
  if (db === FILAMENT_DB) CAT = cat;
  return cat;
}
const hueGap = (a, b) => { const d = Math.abs(a.h - b.h) % 360; return d > 180 ? 360 - d : d; };
const chromatic = (c) => c.cls !== 'neutral';
/* may `c` join the look's colours `S`: reads as a new colour, and keeps the style's hue distance from the chromatic ones */
const joins = (cat, style, c, S) => !S.some((m) => m.name === c.name || cat.dE(m, c) < MIN_DE) && (!chromatic(c) || S.filter(chromatic).every((m) => hueGap(m, c) >= style.hueGap));
/* a pick from `from`, with a silk filament kept only at the style's silkWeight when a plain one is there to take */
function pick(from, style, rng) {
  if (!from.length) return null;
  const c = from[Math.floor(rng() * from.length)];
  if (c.silk && style.silkWeight < 1 && rng() >= style.silkWeight) { const plain = from.filter((x) => !x.silk); if (plain.length) return plain[Math.floor(rng() * plain.length)]; }
  return c;
}

/* one interpretation of the style: the colours, then the roles; null when the settings admit none */
function rollSlot(cat, style, slot, k, pool, fixed, like, rng) {
  const S = []; const add = (c) => { if (c && !S.some((m) => m.name === c.name)) S.push(c); };
  for (const f of Object.values(fixed)) add(f);
  if (S.length > k) return null;
  const shell = fixed.shell || (like && like.shell ? cat.byName.get(like.shell) : null) || pick(pool.filter((c) => style.shells(c) && joins(cat, style, c, S)), style, rng);
  if (!shell) return null; add(shell);
  // the accent colour: the look's statement; a locked face wears it in the balanced and bold interpretations
  let A = like && like.accent ? cat.byName.get(like.accent) : null;
  if (!A && fixed.face && slot !== 'quiet') A = fixed.face;
  if (!A) A = pick(pool.filter((c) => style.accents(c) && c.name !== shell.name && joins(cat, style, c, S)), style, rng);
  if (!A || A.name === shell.name) return null; add(A);
  if (S.length > k) return null;
  // the rest: the style's neutrals, up to the cap (a quiet look needs one for its face)
  const need = slot === 'quiet' && !fixed.face && !S.some((c) => c.name !== shell.name && c.name !== A.name) ? 1 : 0;
  while (S.length < k) {
    const c = pick(pool.filter((x) => style.neutrals(x) && joins(cat, style, x, S)), style, rng);
    if (!c) break; add(c);
  }
  if (need && S.length < 3) return null;
  const r = { shell };
  const not = (...names) => S.filter((c) => !names.includes(c.name));
  const any = (arr) => arr[Math.floor(rng() * arr.length)];
  const neutralsIn = not(A.name);                     // the colours of the look other than the accent colour (the shell among them)
  if (slot === 'quiet') {
    r.face = fixed.face || any(not(shell.name, A.name));
    if (!r.face) return null;
    r.accent = fixed.accent || A;
    r.gripAccent = A;
    r.handle = fixed.handle || any(neutralsIn);
    r.small = any([shell, r.face]);
    r.drawer = fixed.drawer || shell;
  } else {
    r.face = fixed.face || A;
    r.accent = fixed.accent || any(not(r.face.name));
    if (slot === 'balanced') { r.gripAccent = any(not(r.face.name)); r.handle = fixed.handle || any(neutralsIn); r.small = any([shell, A]); r.drawer = fixed.drawer || shell; }
    else { r.gripAccent = A; r.handle = fixed.handle || A; r.small = A; r.drawer = fixed.drawer || A; }
  }
  if (r.accent.name === r.face.name) return null;
  r.deck = fixed.deck || [...S].sort((a, b) => contrast(b.hex, shell.hex) - contrast(a.hex, shell.hex))[0];
  if (contrast(r.deck.hex, shell.hex) < MIN_CONTRAST) return null;
  const pairs = [];
  for (const a of S) for (const b of S) if (a !== b && contrast(a.hex, b.hex) >= MIN_CONTRAST && (!fixed.label || a.name === fixed.label.name)) pairs.push([a, b]);
  if (!pairs.length) return null;
  const light = pairs.filter(([a, b]) => a.L > b.L);   // a light card with dark text, as the presets have it, when the look allows
  [r.label, r.text] = any(light.length ? light : pairs);
  return { r, A };
}
const fil = (c) => ({ name: c.name, hex: c.hex, url: c.url });
function writeOut(r, hardware, feet) {
  const colors = {};
  for (const [role, keys] of Object.entries(ROLE_KEYS)) for (const k of keys) colors[k] = fil(role === 'hardware' ? hardware : role === 'feet' ? feet : r[role]);
  return colors;
}
/* the share of the visible area carrying a colour, by the role weights */
export const areaOf = (roles, name) => +Object.entries(roles).reduce((s, [role, c]) => s + ((c.name || c) === name ? AREA[role] || 0 : 0), 0).toFixed(3);
/* a filament's short name (the brand and line dropped, the finish kept): the tooltip and the toast; titles use colour words */
export const shortName = (name) => String(name).replace(/^(Panchroma|Polymaker PETG|Polymaker|Printed Solid|Elegoo PLA|Elegoo PETG|ERYONE) /, '');
/* "<the two colours with the most visible area>", as colour words (Astra: "Sand & charcoal"; "derive titles from the prominent
   visible colours - including locked colours"); a quiet look names its touch of accent; a bold one puts the accent first */
function nameOf(r, A, slot) {
  const area = new Map();
  for (const [role, c] of Object.entries(r)) area.set(c.name, (area.get(c.name) || 0) + (AREA[role] || 0));
  const top = [...area.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const w = (n) => colourWord(r.shell.name === n ? r.shell.hex : [...Object.values(r)].find((c) => c.name === n).hex, n);
  if (slot === 'quiet' && !top.slice(0, 2).includes(A.name)) return `${capWord(w(top[0]))} & ${w(top[1])}, a touch of ${w(A.name)}`;
  const [a, b] = slot === 'bold' && top[1] === A.name ? [A.name, top[0]] : [top[0], top[1]];
  return `${capWord(w(a))} & ${w(b)}`;
}

/* every preset rule, stated once more against the written-out colours (belt and braces: the generator could drift, this
   cannot drift with it); returns the problems, [] for a look fit to show */
export function checkLook(colors, { cap = 4, owned = null, locks = {}, db = FILAMENT_DB } = {}) {
  const cat = catalog(db); const p = [];
  const c = (k) => colors[k];
  for (const k of PALETTE_KEYS) {
    const f = c(k); const real = f && cat.byName.get(f.name);
    if (!real) { p.push(`${k}: not a catalog colour`); continue; }
    if (real.hex !== f.hex || real.url !== f.url || !/^https?:\/\//.test(f.url)) p.push(`${k}: ${f.name} differs from the catalog`);
    if (real.translucent && k !== 'Magnet' && k !== 'Screw') p.push(`${k}: ${f.name} is translucent`);
  }
  if (p.length) return p;
  for (const k of ['CaseExtender', 'ShelfLip', 'SideCover']) if (c(k).name !== c('Case').name) p.push(`${k} is not the case colour`);
  if (c('CoverL').name !== c('CoverU').name) p.push('the covers differ');
  if (c('FootrailL').name !== c('FootrailU').name) p.push('the foot rails differ');
  if (c('SideCover:FACE').name !== c('Faceplate:FACE').name) p.push('the side-cover face is not the faceplate face');
  if (c('Faceplate:GRIP').name !== c('Faceplate:FACE').name) p.push('the grip is not the face colour');
  if (c('Accent').name === c('Faceplate:FACE').name) p.push('the accent is the face colour');
  if (contrast(c('ShelfInsert').hex, c('Case').hex) < MIN_CONTRAST) p.push('the deck is under 4.5:1 against the case');
  if (!PALETTE_KEYS.some((k) => k !== 'ShelfInsert' && c(k).name === c('ShelfInsert').name)) p.push('the deck colour is used by no other part');
  if (contrast(c('Label:TEXT').hex, c('Label').hex) < MIN_CONTRAST) p.push('the label text is under 4.5:1 against the label');
  if (!cat.byName.get(c('Foot').name).tpu) p.push('the feet are not TPU');
  const printed = new Set(PALETTE_KEYS.filter((k) => !ROLE_KEYS.hardware.includes(k) && !ROLE_KEYS.feet.includes(k)).map((k) => c(k).name));
  if (printed.size > cap) p.push(`${printed.size} filaments, the cap is ${cap}`);
  const lockedNames = new Set(Object.values(locks).map((f) => f.name));
  if (owned) for (const n of printed) if (!owned.has(n) && !lockedNames.has(n)) p.push(`${n} is not owned`);
  for (const [role, f] of Object.entries(locks)) for (const k of ROLE_KEYS[role] || []) if (c(k).name !== f.name) p.push(`${k} is not the locked ${f.name}`);
  return p;
}

/* up to three looks for the settings: the three interpretations of the style, in order, each left out when the settings
   admit none for it (reported: `short`), never padded
     style  a styles.js id ('warm' | 'calm' | 'workshop' | 'retro' | 'any')
     cap    2 | 3 | 4 filaments, printed (a ceiling)
     owned  an iterable of catalog labels, or null for the whole catalog
     locks  { role: { name, hex, url } } (a role fixed to a filament; see LOCKS)
     like   { accent, slot, notShell } from a candidate ("more like this": its accent colour and interpretation on other
            shells; `notShell` is the candidate's own shell, never returned)
     seed   any integer; the same seed and settings give the same looks */
export function surprise({ style = 'workshop', cap = 3, owned = null, locks = {}, like = null, seed = (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0, count = 3, db = FILAMENT_DB } = {}) {
  const cat = catalog(db); const st = styleById(style);
  const rng = mulberry32(seed);
  const fixed = {};
  for (const [role, f] of Object.entries(locks)) { const c = f && cat.byName.get(f.name); if (c && ROLE_KEYS[role]) fixed[role] = c; }
  const ownedSet = owned ? new Set(owned) : null;
  const pool = cat.list.filter((c) => !c.translucent && !c.tpu && (!ownedSet || ownedSet.has(c.name)));   // TPU is the feet's alone
  const hardware = cat.byName.get(HARDWARE) || cat.list[0];
  const feet = cat.byName.get(FEET) || cat.list[0];
  const looks = []; const seen = new Set();
  let tried = 0, lastShare = -1;
  const slots = like && like.slot ? [like.slot, like.slot, like.slot] : SLOTS.slice(0, count);
  for (const slot of slots) {
    let got = null;
    for (let t = 0; t < ATTEMPTS && !got; t++, tried++) {
      let out = null;
      for (let k = cap; k >= 2 && !out; k--) out = rollSlot(cat, st, slot, k, pool, fixed, like, rng);   // the cap is a ceiling
      if (!out) continue;
      const { r, A } = out;
      const colors = writeOut(r, hardware, feet);
      const sig = Object.values(r).map((c) => c.name).join('|');   // the same combination never twice
      // "more like this": other shells than the candidate's own and than each other's (Sol 01a15101: the source shell came back)
      if (seen.has(sig) || (like && (colors.Case.name === like.notShell || looks.some((l) => l.colors.Case.name === colors.Case.name)))) continue;
      if (checkLook(colors, { cap, owned: ownedSet, locks: fixed, db }).length) continue;
      const share = areaOf(r, A.name);
      if (!like && share <= lastShare) continue;   // the interpretations must read apart: more accent than the one before
      seen.add(sig); got = { name: nameOf(r, A, slot), colors, roles: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.name])), accent: A.name, slot, share, style: st.id, cap, seed };
    }
    if (got) { looks.push(got); if (!like) lastShare = got.share; }
  }
  // two looks of one roll never share a title: the later takes its third colour's word
  for (let i = 1; i < looks.length; i++) if (looks.slice(0, i).some((l) => l.name === looks[i].name)) { const third = Object.keys(looks[i].roles).map((k) => looks[i].roles[k]).find((n) => n !== looks[i].roles.shell && n !== looks[i].accent); if (third) looks[i].name += `, ${colourWord(looks[i].colors[ROLE_KEYS[Object.keys(looks[i].roles).find((k) => looks[i].roles[k] === third)][0]].hex, third)}`; }
  return { looks, tried, short: looks.length < count, styles: STYLES };
}
