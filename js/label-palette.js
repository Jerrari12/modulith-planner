/* THE LABEL PALETTE (Joey 2026-10-28; docs/redesign/LABEL-PALETTE.md): the spool each label colour MEANING prints in. A
   stripe stays stored on its label as the Label Studio stores it (label-look.js stripeFor: the scheme key and the scheme's
   hex), so the Studio, another origin, keeps reading it; the build's `labelPalette` (js/rules/schema.js cleanLabelPalette)
   says which spool prints that meaning in THIS build. No DOM, no three: main.js, the Labels workspace and app.js use it, and
   test/label-palette.test.mjs runs it under node.

   - A build without a palette (every record older than the field, every share link) reads as SUGGESTED_V1, a literal: the
     suggestions are frozen per version, so a build never recolours because the suggestions moved. The test re-runs the rule
     below on the catalog and fails on drift; it never rewrites the table.
   - The label body and the label text are NOT in the record's palette: they are the Colors palette's `Label` and
     `Label:TEXT` picks, which the presets, Surprise me and Simplify already write. The panel shows and edits them there.
   - The visitor's DEFAULTS for new builds sit in this browser, beside `gen2-owned`: every storage access in a try (a private
     window throws on the read itself), and a storage that fails reads as no defaults. */
import { STRIPE_COLOURS } from './label-look.js';
import { FILAMENT_DB } from './filament-db.js';
import { dE, contrast } from './colors/colour.js';
import { cleanLabelPalette } from './rules/schema.js';
export { cleanLabelPalette };   // the record field's cleaner lives with the schema; main.js takes it from here

export const LABEL_MEANINGS = Object.freeze(STRIPE_COLOURS.map((c) => c.colour));

/* The suggested spools, version 1 (2026-10-28): for each meaning the nearest plain PLA in the catalog by CIEDE2000 to the
   scheme's hex (suggestFor). Purple's scheme colour is Okabe-Ito's reddish purple, so its nearest PLA is a pink (ΔE 12.2,
   the weakest match). Body and text are the first preset's picks (main.js PRESETS[0]). */
export const SUGGESTED_V1 = Object.freeze({
  'sky-blue': Object.freeze({ name: 'Polar Light Blue', hex: '#14ADDB' }),
  red: Object.freeze({ name: 'Printed Solid Safety Orange', hex: '#F04000' }),
  yellow: Object.freeze({ name: 'Panchroma Lemon Yellow', hex: '#f8e35a' }),
  white: Object.freeze({ name: 'Printed Solid White', hex: '#EFEFEA' }),
  green: Object.freeze({ name: 'Polar Seafoam', hex: '#00A37A' }),
  purple: Object.freeze({ name: 'Panchroma Pink', hex: '#f0a4c0' }),
});
export const SUGGESTED_BODY_TEXT = Object.freeze({
  body: Object.freeze({ name: 'Panchroma Cold White', hex: '#eef1f4' }),
  text: Object.freeze({ name: 'Elegoo PLA Black', hex: '#1c1d20' }),
});

/* the warnings' thresholds (strict <; LABEL-PALETTE.md §7 says where each comes from) */
export const ALIKE_DE = 15, BODY_DE = 10, TEXT_CONTRAST = 3;

/* the catalog, flat, and by name (the catalog's `label` is unique: filament-db.js) */
export const CATALOG = Object.freeze(FILAMENT_DB.flatMap((b) => b.colors.map((c) => Object.freeze({ ...c, brand: b.brand, line: b.line }))));
const BY_NAME = new Map(CATALOG.map((c) => [c.label, c]));
export const catalogSpool = (name) => BY_NAME.get(name) || null;
/* a spool's buy link: the catalog's, by name. A record never carries one (it is outside data). */
export const urlFor = (name) => (BY_NAME.get(name) || {}).url || null;

/* plain PLA: the line names PLA and not Silk or Translucent, the colour is not PETG or TPU, and it has no translucent flag */
export const isPlainPla = (c) => /PLA/.test(c.line) && !/Silk|Translucent/.test(c.line) && !/PETG|TPU/.test(c.label) && !c.translucent;
/* the suggestion rule: the nearest plain PLA to `hex` by ΔE00, ties to the first in catalog order */
export function suggestFor(hex, catalog = CATALOG) {
  let best = null, bd = Infinity;
  for (const c of catalog) { if (!isPlainPla(c)) continue; const d = dE(hex, c.hex); if (d < bd) { bd = d; best = c; } }
  return best ? { name: best.label, hex: best.hex, dE: bd } : null;
}

const schemeOf = (key) => STRIPE_COLOURS.find((c) => c.colour === key) || null;
export const isMeaning = (key) => LABEL_MEANINGS.includes(key);

/* the spool a meaning prints in under a (cleaned) palette: the build's own, else the suggestion. { name, hex, suggested } -
   `suggested` whenever it IS the suggestion (a palette stores all six once one is changed) */
export function spoolFor(pal, key) {
  const own = pal && pal.spools && pal.spools[key], s = SUGGESTED_V1[key];
  if (own) return { name: own.name, hex: own.hex, suggested: !!s && own.name === s.name && own.hex.toLowerCase() === s.hex.toLowerCase() };
  return s ? { name: s.name, hex: s.hex, suggested: true } : null;
}
/* every meaning's spool, in the menu's order: [{ key, meaning, scheme, name, hex, suggested }] */
export function spoolsOf(pal) {
  return STRIPE_COLOURS.map((c) => ({ key: c.colour, meaning: c.name, scheme: c.hex, ...spoolFor(pal, c.colour) }));
}
/* the six spools as a record palette, or null when they are exactly the suggestions (the record then stays null) */
export function paletteOf(spools) {
  const out = {};
  for (const k of LABEL_MEANINGS) { const s = spools && spools[k]; if (s && s.name && s.hex) out[k] = { name: s.name, hex: s.hex }; }
  const same = LABEL_MEANINGS.every((k) => out[k] && out[k].name === SUGGESTED_V1[k].name && out[k].hex === SUGGESTED_V1[k].hex);
  return same || !Object.keys(out).length ? null : { v: 1, spools: out };
}
/* the same six spools (name and hex) under two palettes */
export function samePalette(a, b) {
  return LABEL_MEANINGS.every((k) => { const x = spoolFor(a, k), y = spoolFor(b, k); return x.name === y.name && x.hex.toLowerCase() === y.hex.toLowerCase(); });
}

/* THE WARNINGS (gentle; nothing is blocked): [{ kind, keys, value }], computed, never guessed -
     'same'  two meanings print in one spool (by name: identity, not hex)
     'alike' two meanings' spools look alike: ΔE00 < ALIKE_DE (a pair that shares a spool is 'same', not also 'alike')
     'body'  a meaning's spool is hard to see on the label body: ΔE00 < BODY_DE
     'text'  the text is hard to read on the body: WCAG contrast ratio < TEXT_CONTRAST (a heuristic floor, not a WCAG pass)
   `body` and `text` are hexes (the build-wide colours the stage shows), or null to skip their checks. */
export function paletteWarnings(pal, body, text) {
  const out = [], list = spoolsOf(pal);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.name === b.name) { out.push({ kind: 'same', keys: [a.key, b.key], value: a.name }); continue; }
    const d = dE(a.hex, b.hex);
    if (d < ALIKE_DE) out.push({ kind: 'alike', keys: [a.key, b.key], value: d });
  }
  if (body) for (const a of list) { const d = dE(a.hex, body); if (d < BODY_DE) out.push({ kind: 'body', keys: [a.key], value: d }); }
  if (body && text) { const r = contrast(text, body); if (r < TEXT_CONTRAST) out.push({ kind: 'text', keys: [], value: r }); }
  return out;
}
/* one warning as words, for the row it belongs to */
export function warningText(w) {
  const n = (k) => (schemeOf(k) || { name: k }).name;
  if (w.kind === 'same') return `${n(w.keys[0])} and ${n(w.keys[1])} print in the same spool`;
  if (w.kind === 'alike') return `${n(w.keys[0])} and ${n(w.keys[1])} look alike (ΔE ${w.value.toFixed(0)})`;
  if (w.kind === 'body') return `${n(w.keys[0])} is hard to see on the label body (ΔE ${w.value.toFixed(0)})`;
  return `The text is hard to read on the label body (contrast ${w.value.toFixed(1)}:1)`;
}

/* the picker's list for one meaning (or 'body' / 'text'): every catalog spool but TPU, the owned ones first, each group nearest
   first to the meaning's scheme colour (body and text: to their suggestion). [{ name, hex, url, owned, dE }] */
export function rankSpools(key, owned = []) {
  const target = schemeOf(key)?.hex || (SUGGESTED_BODY_TEXT[key] || {}).hex || '#808080';
  const have = new Set(owned);
  return CATALOG.filter((c) => !/TPU/.test(c.label))
    .map((c) => ({ name: c.label, hex: c.hex, url: c.url || null, owned: have.has(c.label), dE: dE(target, c.hex) }))
    .sort((a, b) => (b.owned - a.owned) || (a.dE - b.dE));
}

/* ---- the visitor's defaults for new builds: `gen2-label-palette` = { v: 1, spools: {...}, body?, text? } ---- */
export const LABEL_DEFAULTS_KEY = 'gen2-label-palette';
const cleanOne = (s) => (s && typeof s === 'object' && typeof s.name === 'string' && s.name.trim() && s.name.length <= 80 &&
  typeof s.hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.hex) ? { name: s.name.trim(), hex: s.hex } : null);
export function cleanDefaults(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
  const spools = {};
  for (const k of LABEL_MEANINGS) { const s = cleanOne(raw.spools && raw.spools[k]); if (s) spools[k] = s; }
  const out = { v: 1, spools };
  const body = cleanOne(raw.body), text = cleanOne(raw.text);
  if (body) out.body = body;
  if (text) out.text = text;
  return Object.keys(spools).length || body || text ? out : null;
}
export function readLabelDefaults(storage) {
  try { return cleanDefaults(JSON.parse(storage.getItem(LABEL_DEFAULTS_KEY) || 'null')); } catch { return null; }
}
export function writeLabelDefaults(storage, d) {
  try { const c = cleanDefaults(d); if (c) storage.setItem(LABEL_DEFAULTS_KEY, JSON.stringify(c)); else storage.removeItem(LABEL_DEFAULTS_KEY); return true; } catch { return false; }   // private mode: the defaults last the page
}
/* the record palette the defaults give a build (null = the suggestions) */
export const paletteOfDefaults = (d) => (d ? paletteOf(Object.fromEntries(LABEL_MEANINGS.map((k) => [k, (d.spools && d.spools[k]) || SUGGESTED_V1[k]]))) : null);
