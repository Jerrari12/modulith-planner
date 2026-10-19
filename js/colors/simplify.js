/* SIMPLIFY TO FEWER FILAMENTS, and the confidence summary (the Colors plan's step 6, 2026-10-18).

   `simplify({ colors, over, keys, target })` proposes the look the build would wear in `target` filaments or fewer,
   changing as little as the rules allow: one step at a time it takes the filament carrying the LEAST VISIBLE AREA (the
   role-area weights of surprise.js, over the keys this build has) and maps every key wearing it, per-unit picks included,
   onto the CLOSEST colour of the look (CIEDE2000) under which every preset rule still holds; when no colour of the look
   can take it, the next-least filament is tried; when no step is possible the result is `short` and says why. Nothing
   from outside the look is ever brought in, and a key that wore no merged filament is never touched: "exactly which
   parts would change" is the list of keys in `changes`.

   The rules are checked on the look as the build wears it: a zone with no pick of its own follows its body, as the stage
   paints it; a rule whose keys the build lacks does not apply (a build with no shelf has no deck to read).

   `summarize(worn)` is the one-line summary of a look as worn: the regions the build has, grouped (Case, drawers, fronts,
   grips, grip accents, accents, handles, labels, label text, deck, small parts), consecutive groups sharing a filament
   joined, filaments by their short names.

   Pure: no DOM, no stage. */
import { dE, contrast } from './colour.js';
import { ROLE_KEYS, AREA, shortName } from './surprise.js';

const MIN_CONTRAST = 4.5;
const roleOf = (() => { const m = new Map(); for (const [role, keys] of Object.entries(ROLE_KEYS)) for (const k of keys) m.set(k, role); return (key) => m.get(key) || null; })();
const HARDWARE = new Set(ROLE_KEYS.hardware);
const bodyOf = (key) => key.split(':')[0];
const same = (a, b) => !!a && !!b && a.name === b.name;

/* the look as the build wears it: key -> filament for every printed key the build has (a zone with no pick follows its
   body; a key with no filament at all is left out: it prints in an identification colour, which Simplify never touches).
   With `over` (unitId -> { key -> filament }), a unit's own picks are worn too, as "<unit>@<key>" entries: they count as
   filaments and move with a merge (Sol 01a151f0: a build whose units wear their own colours counts them on the Dock). */
export function worn(colors, keys, over = null) {
  const out = {};
  for (const k of keys) {
    if (k.locked || HARDWARE.has(k.key)) continue;
    const f = colors[k.key] || (k.key.includes(':') && !k.ownColor ? colors[bodyOf(k.key)] : null);
    if (f && f.hex) out[k.key] = f;
  }
  if (over) for (const [uid, o] of Object.entries(over)) for (const k of keys) {
    if (k.locked || HARDWARE.has(k.key) || !o) continue;
    const f = o[k.key] || (k.key.includes(':') && !colors[k.key] && !k.ownColor ? o[bodyOf(k.key)] : null);   // a unit's zone follows its own body pick when the build has not picked the zone (the stage's rule)
    if (f && f.hex) out[`${uid}@${k.key}`] = f;
  }
  return out;
}
/* a unit's own view of the look: the build's worn keys with that unit's own picks laid over, for the rules */
const unitView = (w, uid) => { const v = {}; for (const [k, f] of Object.entries(w)) { if (!k.includes('@')) v[k] = v[k] || f; } for (const [k, f] of Object.entries(w)) { if (k.startsWith(uid + '@')) v[k.slice(uid.length + 1)] = f; } return v; };
/* the rules on the look as worn, for the build and for every unit with its own picks */
export function problemsAll(w) {
  const base = {}; for (const [k, f] of Object.entries(w)) if (!k.includes('@')) base[k] = f;
  const p = problemsOn(base);
  for (const uid of new Set(Object.keys(w).filter((k) => k.includes('@')).map((k) => k.split('@')[0]))) for (const q of problemsOn(unitView(w, uid))) p.push(`unit ${uid}: ${q}`);
  return p;
}

/* the preset rules on a look as worn; a rule applies only when the build has both its keys. Returns the problems. */
export function problemsOn(w) {
  const p = [];
  const both = (a, b) => w[a] && w[b];
  for (const k of ['CaseExtender', 'ShelfLip', 'SideCover']) if (both(k, 'Case') && !same(w[k], w.Case)) p.push(`${k} is not the case colour`);
  if (both('CoverL', 'CoverU') && !same(w.CoverL, w.CoverU)) p.push('the covers differ');
  if (both('FootrailL', 'FootrailU') && !same(w.FootrailL, w.FootrailU)) p.push('the foot rails differ');
  if (both('SideCover:FACE', 'Faceplate:FACE') && !same(w['SideCover:FACE'], w['Faceplate:FACE'])) p.push('the side-cover face is not the faceplate face');
  if (both('Faceplate:GRIP', 'Faceplate:FACE') && !same(w['Faceplate:GRIP'], w['Faceplate:FACE'])) p.push('the grip is not the face colour');
  if (both('Accent', 'Faceplate:FACE') && same(w.Accent, w['Faceplate:FACE'])) p.push('the accent is the face colour');
  if (both('ShelfInsert', 'Case') && contrast(w.ShelfInsert.hex, w.Case.hex) < MIN_CONTRAST) p.push('the deck is under 4.5:1 against the case');
  if (both('Label:TEXT', 'Label') && contrast(w['Label:TEXT'].hex, w.Label.hex) < MIN_CONTRAST) p.push('the label text is under 4.5:1 against the label');
  return p;
}
/* the distinct filaments of a look as worn, each with its keys and visible area, least area first */
export function filamentsOf(w) {
  const by = new Map();
  for (const [key, f] of Object.entries(w)) {
    let r = by.get(f.name); if (!r) by.set(f.name, r = { name: f.name, hex: f.hex, url: f.url, keys: [], area: 0 });
    r.keys.push(key); r.area += AREA[roleOf(key.includes('@') ? key.split('@')[1] : key)] || 0;
  }
  return [...by.values()].map((r) => ({ ...r, area: +r.area.toFixed(3) })).sort((a, b) => a.area - b.area || a.keys.length - b.keys.length || a.name.localeCompare(b.name));
}
/* every entry of the palette wearing `from` takes `to`: the WHOLE look, keys the build lacks included, so a part added
   later still matches it (decision D3); the bought hardware's entries alone stay as they are (never printed) */
const mapTo = (colors, from, to) => Object.fromEntries(Object.entries(colors).map(([k, f]) => [k, f && f.name === from && !HARDWARE.has(k) ? { name: to.name, hex: to.hex, url: to.url } : f]));

export function simplify({ colors = {}, over = {}, keys = [], target = 2 } = {}) {
  let cur = { ...colors }, curOver = Object.fromEntries(Object.entries(over || {}).map(([u, o]) => [u, { ...o }]));
  const changes = [];
  let reason = null;
  for (;;) {
    const w = worn(cur, keys, curOver);
    const fils = filamentsOf(w);
    if (fils.length <= target) break;
    // a merge may not ADD a rule problem; one the look already has (a unit's own face pick that split from its grip, a
    // hand-made palette) is not Simplify's to fix, and must not block every merge either
    const had = new Set(problemsAll(w));
    let step = null;
    for (const from of fils) {   // the least visible first
      const others = fils.filter((x) => x.name !== from.name).sort((a, b) => dE(a.hex, from.hex) - dE(b.hex, from.hex));   // the closest colour first
      for (const to of others) {
        const next = mapTo(cur, from.name, to);
        const nextOver = Object.fromEntries(Object.entries(curOver).map(([u, o]) => [u, mapTo(o, from.name, to)]));
        if (problemsAll(worn(next, keys, nextOver)).some((q) => !had.has(q))) continue;
        step = { from, to, next, nextOver };
        break;
      }
      if (step) break;
    }
    if (!step) { reason = fils.length === 2 ? 'Two filaments must stay: the deck or the label text needs a colour that reads against its background.' : 'No filament of this look can be merged into another without breaking a colour rule.'; break; }
    cur = step.next; curOver = step.nextOver;
    changes.push({ from: { name: step.from.name, hex: step.from.hex }, to: { name: step.to.name, hex: step.to.hex, url: step.to.url }, keys: step.from.keys.slice() });
  }
  const count = filamentsOf(worn(cur, keys, curOver)).length;
  return { colors: cur, over: curOver, changes, count, short: count > target, reason };
}

/* the summary groups, in the order the line reads them */
export const SUMMARY = [
  ['Case', ['Case', 'CaseExtender', 'SideCover', 'ShelfLip', 'CoverL', 'CoverU', 'FootrailL', 'FootrailU', 'Foot', 'Rail', 'Bracket', 'BackCover']],
  // the visible, recognisable surfaces first (Astra, 2026-10-19: fronts, grips, then the faceplate bodies)
  ['drawers', ['Drawer']], ['fronts', ['Faceplate:FACE', 'SideCover:FACE']], ['grips', ['Faceplate:GRIP']], ['grip accents', ['Faceplate:GRIP ACCENT']], ['faceplate bodies', ['Faceplate']],
  ['accents', ['Accent']], ['handles', ['Handle']], ['labels', ['Label']], ['label text', ['Label:TEXT']], ['deck', ['ShelfInsert']], ['small parts', ['QuickLock', 'MagnetClip', 'Stopper']],
];
/* a key's own word, for a group whose keys wear more than one filament (Sol 01a151f0: "Case: Black" hid orange feet) */
const KEY_WORD = { Case: 'case', CaseExtender: 'extenders', SideCover: 'side covers', ShelfLip: 'lips', CoverL: 'covers', CoverU: 'covers', FootrailL: 'foot rails', FootrailU: 'foot rails', Foot: 'feet', Rail: 'rails', Bracket: 'brackets', BackCover: 'back covers', 'Faceplate:FACE': 'fronts', Faceplate: 'faceplate bodies', 'SideCover:FACE': 'side-cover faces', QuickLock: 'QuickLocks', MagnetClip: 'magnet clips', Stopper: 'stoppers' };
/* "Case, drawers: Black · Fronts, grips: Orange · Handles: Silk Silver" for a look as worn ([] when nothing is picked); a
   group whose keys wear two filaments splits by key ("Case: Black · feet: Orange"); a unit's own picks are counted by
   the caller, not listed */
export function summarize(w) {
  const groups = [];
  for (const [word, ks] of SUMMARY) {
    const present = ks.filter((x) => w[x]);
    if (!present.length) continue;
    const names = [...new Set(present.map((x) => w[x].name))];
    // one filament: the group's word; more: the group's word for the first key's filament (the case, the face), the
    // keys that differ by their own words ("Case: Black · feet: Orange")
    names.forEach((name, i) => groups.push({ word: i === 0 ? word : present.filter((x) => w[x].name === name).map((x) => KEY_WORD[x] || x.toLowerCase()).filter((v, j, a) => a.indexOf(v) === j).join(' & '), name }));
  }
  const joined = [];
  for (const g of groups) { const last = joined[joined.length - 1]; if (last && last.name === g.name) last.words.push(g.word); else joined.push({ words: [g.word], name: g.name }); }
  return joined.map((j) => ({ label: j.words.map((x, i) => (i === 0 ? x.charAt(0).toUpperCase() + x.slice(1) : x)).join(', '), filament: shortName(j.name), name: j.name }));
}
