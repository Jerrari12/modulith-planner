/* HOW MUCH FILAMENT A BUILD TAKES, BY THE 1 KG SPOOL (Joey, 2026-11-01: "how many 1kg spools they will need in the BOM"). The
 * figures are the slicer's per part (js/catalog/print-grams.js), the same the site's part and kit pages show, read for the
 * material a filament is; the total of the rows a kit requires equals the kit page's total (test/filament-use.test.mjs).
 *
 * Two numbers, because one would be wrong either way (Joey: "Should we maybe say 2 (recommend 3)?"). What the parts need is the
 * weight over 1000 g, rounded up. What is recommended leaves room: what a printer purges is unknown and a failed print is a
 * matter of luck, so from 925 g on a spool one more is recommended (Joey: "once we reach say 925g of estimated filament used we
 * recommend a second spool").
 *
 * One total would hide the real count: every filament a build prints in is a spool of its own. So a row's weight goes to the
 * filament its BODY prints in, and a filament that only wears an accent or a label reads as a small amount and one spool: the
 * table has one figure per part, with no split by colour. A row whose units wear different filaments shares its weight evenly
 * between them (the BOM's rows are not per unit), which is close enough for a count of spools.
 *
 * Bought hardware weighs nothing here. An optional row is not counted, as on the kit pages, and its weight is reported on its
 * own. An unreleased row has no file to print. A row with no figure is counted, never read as zero.
 */
import { PRINT_GRAMS } from '../catalog/print-grams.js';

export const SPOOL_GRAMS = 1000;
export const RECOMMEND_ANOTHER_AT = 925;
export const spoolsNeeded = (grams) => Math.max(1, Math.ceil(grams / SPOOL_GRAMS));
export const spoolsRecommended = (grams) => Math.floor(grams / RECOMMEND_ANOTHER_AT) + 1;

const COLUMN = { PLA: 0, PETG: 1, TPU: 2 };
/* the column for a material; a part sliced only in another material (the QuickLock's PETG, the foot's TPU) answers with that */
export function gramsOf(row, material, table = PRINT_GRAMS) {
  const e = (row.variant && table[`${row.name}|${row.variant}`]) || table[row.name];
  if (!e) return null;
  const g = e[COLUMN[material]];
  return g != null ? g : e.find((v) => v != null) ?? null;
}
/* the material a row prints in with no filament chosen: the first column it has, so the QuickLocks are PETG and the feet TPU */
const ownMaterial = (row, table) => {
  const e = (row.variant && table[`${row.name}|${row.variant}`]) || table[row.name];
  return e ? Object.keys(COLUMN)[e.findIndex((v) => v != null)] : null;
};

/* rows: bomRows() output. With the visitor's colours on, `filaments` is the stage's filamentsInBuild().filaments and regionsOf(row)
   a row's regions (js/workspaces/parts.js printLook), else both are left out and the lines are one per material.
   Returns { lines: [{ id, name, hex, url, material, grams, spools, recommended, small, noPick }], grams, spools, recommended,
   optionalGrams, unpriced }, the lines heaviest first. `unpriced` counts prints, like the kit pages. */
export function filamentUse(rows, { regionsOf = null, filaments = null, table = PRINT_GRAMS } = {}) {
  const lines = new Map();
  const line = (id, fields) => { let l = lines.get(id); if (!l) lines.set(id, l = { id, name: id, hex: null, url: null, material: null, noPick: false, ...fields, grams: 0 }); return l; };
  let optionalGrams = 0, unpriced = 0;
  const colours = !!filaments;
  for (const r of rows) {
    if (r.hardware || !(r.qty > 0) || r.unreleased) continue;
    const add = (l, material, share) => {
      const g = gramsOf(r, material, table);
      if (g == null) return false;
      if (r.optional) optionalGrams += g * r.qty * share; else if (l) l.grams += g * r.qty * share;
      return true;
    };
    let priced;
    if (!colours) {
      const m = ownMaterial(r, table);
      priced = m ? add(r.optional ? null : line(m, { material: m }), m, 1) : false;
    } else {
      const regions = regionsOf ? regionsOf(r) : null;
      const body = regions && regions.length ? regions.find((g) => !g.zone) || regions[0] : null;
      const picks = body ? body.filaments : [];
      const shares = picks.length + (body?.bare || !body ? 1 : 0);
      priced = true;
      for (const f of picks) priced = add(r.optional ? null : line(f.name, { hex: f.hex, url: f.url || null, material: f.material || null }), f.material, 1 / shares) && priced;
      if (!body || body.bare) priced = add(r.optional ? null : line('no-pick', { noPick: true }), ownMaterial(r, table), 1 / shares) && priced;
    }
    if (!priced && !r.optional) unpriced += r.qty;
  }
  for (const f of filaments || []) if (!lines.has(f.name)) line(f.name, { hex: f.hex, url: f.url || null, material: f.material || null });
  const out = [...lines.values()].map((l) => ({ ...l, small: colours && !l.grams, spools: spoolsNeeded(l.grams), recommended: spoolsRecommended(l.grams) })).sort((a, b) => b.grams - a.grams);
  const sum = (k) => out.reduce((n, l) => n + l[k], 0);
  return { lines: out, grams: sum('grams'), spools: sum('spools'), recommended: sum('recommended'), optionalGrams, unpriced };
}
