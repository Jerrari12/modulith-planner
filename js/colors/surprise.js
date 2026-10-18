/* THE LOOK GENERATOR behind "Surprise me" (the Colors plan's step 5, 2026-10-18): three whole looks for the build, from the
   real catalog, under the visitor's constraints, obeying every rule the presets are held to (test/presets.test.mjs).

   A look is built from ROLES and written out to the 27 keys every preset sets, so the product rules hold by construction
   and are checked again before a look leaves (`checkLook`):
     shell       Case, CaseExtender, SideCover, ShelfLip, CoverL, CoverU, FootrailL, FootrailU, Foot, Rail, Bracket, BackCover
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
     hardware    Magnet, Screw   (bought, never printed, never counted: Panchroma Silk Silver, as the presets have it)

   THE CAP is the distinct filaments over every role but hardware (the build's own count, decision D2, can only be lower).
   THE MOODS read the catalog in CIELAB (colour.js): neutral C < 10, muted 10–25, mid 25–45, vivid ≥ 45.
     subtle    a neutral or muted shell; nothing vivid and at most one colour above C 25; chromatic hues within 60°
     playful   a neutral shell; the rest neutral or vivid, with at least one vivid, in a harmony (hues ≤ 40° apart, or
               100–180° apart: analogous, split or complementary)
     wild      a mid or vivid shell; the rest mid or vivid with hues at least 60° apart, or neutral (at least two hues
               when the cap leaves room for three colours)
   THE CAP IS A CEILING: a look fills it when the pool allows and takes fewer colours when it does not.
   Two filaments in one look must read as different colours (CIEDE2000 ≥ 10). Translucent filaments are never picked: a
   look card renders one as a solid tint (STEP2-GATE.md). A LOCK (a role fixed to a filament) wins over the mood's filter
   and over the owned list: it is the visitor's own choice.

   Pure: no DOM, no stage; seeded (mulberry32), so a test can pin thousands of looks. */
import { FILAMENT_DB } from '../filament-db.js';
import { hexToLab, deltaE00, contrast, lch } from './colour.js';

export const ROLE_KEYS = {
  shell: ['Case', 'CaseExtender', 'SideCover', 'ShelfLip', 'CoverL', 'CoverU', 'FootrailL', 'FootrailU', 'Foot', 'Rail', 'Bracket', 'BackCover'],
  drawer: ['Drawer'],
  face: ['Faceplate', 'Faceplate:FACE', 'Faceplate:GRIP', 'SideCover:FACE'],
  gripAccent: ['Faceplate:GRIP ACCENT'],
  accent: ['Accent'],
  handle: ['Handle'],
  label: ['Label'],
  text: ['Label:TEXT'],
  small: ['QuickLock', 'MagnetClip', 'Stopper'],
  deck: ['ShelfInsert'],
  hardware: ['Magnet', 'Screw'],
};
export const PALETTE_KEYS = Object.values(ROLE_KEYS).flat();   // the 27 keys every preset sets
/* the regions a visitor can lock (a chip each, when the build has the region): the palette key, the role it fixes, its name */
export const LOCKS = [['Case', 'shell', 'Case'], ['Drawer', 'drawer', 'Drawer body'], ['Faceplate:FACE', 'face', 'Face'], ['Accent', 'accent', 'Accent'], ['Handle', 'handle', 'Handle'], ['Label', 'label', 'Label'], ['ShelfInsert', 'deck', 'Shelf deck']];
export const MOODS = ['subtle', 'playful', 'wild'];
export const CAPS = [2, 3, 4];
export const HARDWARE = 'Panchroma Silk Silver';
const MIN_CONTRAST = 4.5;   // the deck against the shell, the label text against the label (test/presets.test.mjs)
const MIN_DE = 10;          // two filaments of one look must read as two colours
const ATTEMPTS = 400;

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
    list.push({ i: list.length, name: c.label, hex: c.hex, url: c.url, L, C, h, lab: hexToLab(c.hex), silk: /Silk/.test(b.line), translucent: !!c.translucent, cls: C < 10 ? 'neutral' : C < 25 ? 'muted' : C < 45 ? 'mid' : 'vivid' });
  }
  const n = list.length, de = new Float32Array(n * n);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) de[a * n + b] = de[b * n + a] = deltaE00(list[a].lab, list[b].lab);
  const cat = { list, byName: new Map(list.map((c) => [c.name, c])), dE: (a, b) => de[a.i * n + b.i] };
  if (db === FILAMENT_DB) CAT = cat;
  return cat;
}
const hueGap = (a, b) => { const d = Math.abs(a.h - b.h) % 360; return d > 180 ? 360 - d : d; };
const chromatic = (c) => c.cls !== 'neutral';
const shellFits = (mood, c) => mood === 'subtle' ? c.cls === 'neutral' || c.cls === 'muted' : mood === 'playful' ? c.cls === 'neutral' : c.cls === 'mid' || c.cls === 'vivid';
/* may `c` join the look's colours `S` under this mood? */
function fits(cat, mood, c, S) {
  if (S.some((m) => m.name === c.name || cat.dE(m, c) < MIN_DE)) return false;
  const hues = S.filter(chromatic);
  if (mood === 'subtle') {
    if (c.cls === 'vivid' || (c.cls === 'mid' && S.some((m) => m.cls === 'mid' || m.cls === 'vivid'))) return false;
    return !chromatic(c) || hues.every((m) => hueGap(m, c) <= 60);
  }
  if (mood === 'playful') {
    if (c.cls === 'muted' || c.cls === 'mid') return false;
    return !chromatic(c) || hues.every((m) => { const g = hueGap(m, c); return g <= 40 || (g >= 100 && g <= 180); });
  }
  if (c.cls === 'muted') return false;
  return !chromatic(c) || hues.every((m) => hueGap(m, c) >= 60);   // a neutral may join a wild look (a black deck under a yellow shell reads)
}

/* the look's colours: the fixed ones (locks, "more like this") first, then a shell for the mood, then the rest */
function chooseSet(cat, mood, k, pool, fixed, rng) {
  const S = [];
  const add = (c) => { if (!S.some((m) => m.name === c.name)) S.push(c); };
  for (const f of Object.values(fixed)) add(f);
  if (S.length > k) return null;
  let shell = fixed.shell || null;
  if (!shell) {
    const from = S.length === k ? S.filter((c) => shellFits(mood, c)) : pool.filter((c) => shellFits(mood, c) && fits(cat, mood, c, S));
    if (!from.length) return null;
    shell = from[Math.floor(rng() * from.length)]; add(shell);
  }
  while (S.length < k) {
    let from = pool.filter((c) => fits(cat, mood, c, S));
    if (mood === 'playful' && S.length === k - 1 && !S.some((m) => m.cls === 'vivid')) from = from.filter((c) => c.cls === 'vivid');
    if (mood === 'wild' && k >= 3 && S.length === k - 1 && S.filter(chromatic).length < 2) from = from.filter(chromatic);   // wild with room for three is at least two hues
    if (!from.length) return null;
    add(from[Math.floor(rng() * from.length)]);
  }
  return { S, shell };
}

/* the roles, from the look's colours; null when the rules cannot be met with them */
function assign(mood, S, shell, fixed, rng) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const r = { shell };
  // the face is the look's statement, so a rolled face is never the shell; a LOCKED face may be (Black & gold wears a black
  // face on a black shell: no rule forbids it, only the accent must differ - Sol 01a150df)
  const others = S.filter((c) => c.name !== shell.name);
  if (!others.length) return null;
  const vivid = others.filter((c) => c.cls === 'vivid');
  r.face = fixed.face || pick(mood === 'playful' && vivid.length ? vivid : others);
  r.accent = fixed.accent || pick(S.filter((c) => c.name !== r.face.name));
  if (r.accent.name === r.face.name) return null;
  r.drawer = fixed.drawer || (rng() < 0.7 ? shell : pick(S));
  r.handle = fixed.handle || pick(S);
  r.deck = fixed.deck || [...S].sort((a, b) => contrast(b.hex, shell.hex) - contrast(a.hex, shell.hex))[0];
  if (contrast(r.deck.hex, shell.hex) < MIN_CONTRAST) return null;
  const pairs = [];
  for (const a of S) for (const b of S) if (a !== b && contrast(a.hex, b.hex) >= MIN_CONTRAST && (!fixed.label || a.name === fixed.label.name)) pairs.push([a, b]);
  if (!pairs.length) return null;
  const light = pairs.filter(([a, b]) => a.L > b.L);   // a light card with dark text, as the presets have it, when the look allows
  [r.label, r.text] = pick(light.length ? light : pairs);
  r.small = pick([r.accent, r.face, shell]);
  r.gripAccent = pick([r.accent, r.accent, shell]);
  return r;
}
const fil = (c) => ({ name: c.name, hex: c.hex, url: c.url });
function writeOut(r, hardware) {
  const colors = {};
  for (const [role, keys] of Object.entries(ROLE_KEYS)) for (const k of keys) colors[k] = fil(role === 'hardware' ? hardware : r[role]);
  return colors;
}
/* a filament's short name for a look's title: the brand and line dropped, the finish kept (Silk Gold stays Silk Gold) */
export const shortName = (name) => String(name).replace(/^(Panchroma|Polymaker PETG|Printed Solid|Elegoo PLA|Elegoo PETG|ERYONE) /, '');
/* "<face> on <shell>", and the third colour when the look has one ("· Silk Silver trim"), so three "more like this"
   candidates, which share a shell and a face, read apart */
function nameOf(r) {
  const other = (c) => c.name !== r.shell.name && c.name !== r.face.name;
  // a locked face on the same filament as the shell: the accent names the look ("White accents on Black")
  const base = r.face.name === r.shell.name ? `${shortName(r.accent.name)} accents on ${shortName(r.shell.name)}` : `${shortName(r.face.name)} on ${shortName(r.shell.name)}`;
  const trim = [r.accent, r.handle, r.small].find(other);
  if (trim) return `${base} · ${shortName(trim.name)} trim`;
  if (other(r.label)) return `${base} · ${shortName(r.label.name)} labels`;
  if (other(r.drawer)) return `${base} · ${shortName(r.drawer.name)} drawers`;
  return base;
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
  const printed = new Set(PALETTE_KEYS.filter((k) => !ROLE_KEYS.hardware.includes(k)).map((k) => c(k).name));
  if (printed.size > cap) p.push(`${printed.size} filaments, the cap is ${cap}`);
  const lockedNames = new Set(Object.values(locks).map((f) => f.name));
  if (owned) for (const n of printed) if (!owned.has(n) && !lockedNames.has(n)) p.push(`${n} is not owned`);
  for (const [role, f] of Object.entries(locks)) for (const k of ROLE_KEYS[role] || []) if (c(k).name !== f.name) p.push(`${k} is not the locked ${f.name}`);
  return p;
}

/* `count` looks for the settings; fewer when the settings admit fewer (reported, never hidden: `short`)
     mood   'subtle' | 'playful' | 'wild'
     cap    2 | 3 | 4 filaments, printed
     owned  an iterable of catalog labels, or null for the whole catalog
     locks  { role: { name, hex, url } } (a role fixed to a filament; see LOCKS)
     like   a look's roles to start from ({ shell, face } names): "more like this" keeps them and re-rolls the rest
     seed   any integer; the same seed and settings give the same looks */
export function surprise({ mood = 'playful', cap = 3, owned = null, locks = {}, like = null, seed = (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0, count = 3, db = FILAMENT_DB } = {}) {
  const cat = catalog(db);
  const rng = mulberry32(seed);
  const fixed = {};
  for (const [role, f] of Object.entries(locks)) { const c = f && cat.byName.get(f.name); if (c && ROLE_KEYS[role]) fixed[role] = c; }
  if (like) for (const role of ['shell', 'face']) { const c = like[role] && cat.byName.get(like[role]); if (c && !fixed[role]) fixed[role] = c; }
  const ownedSet = owned ? new Set(owned) : null;
  const pool = cat.list.filter((c) => !c.translucent && (!ownedSet || ownedSet.has(c.name)));
  const hardware = cat.byName.get(HARDWARE) || cat.list[0];
  const looks = []; const seen = new Set();
  let tried = 0;
  for (; tried < ATTEMPTS && looks.length < count; tried++) {
    // the cap is a ceiling: the look fills it when the pool allows, and takes fewer colours when it does not (four neutrals
    // that read as two, say: an owned list of black, white, silver and steel grey under Subtle)
    let set = null;
    for (let k = cap; k >= 2 && !set; k--) set = chooseSet(cat, mood, k, pool, fixed, rng);
    if (!set) continue;
    const r = assign(mood, set.S, set.shell, fixed, rng); if (!r) continue;
    // three candidates differ in shell and face; "more like this" keeps both, so there they differ in the rest
    const sig = like ? Object.values(r).map((c) => c.name).join('|') : r.shell.name + '|' + r.face.name;
    if (seen.has(sig)) continue;
    const colors = writeOut(r, hardware);
    if (checkLook(colors, { cap, owned: ownedSet, locks: fixed, db }).length) continue;
    seen.add(sig);
    looks.push({ name: nameOf(r), colors, roles: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.name])), mood, cap, seed });
  }
  return { looks, tried, short: looks.length < count };
}
