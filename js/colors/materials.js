/* THE MATERIAL FILTER (Joey, 2026-10-23: "in the color/filament selection on the right side of the screen, should we also
   have a way to filter by material type when applicable?"). The picker's chip row above the filament list: one chip per
   material among the lines offered for the region, "All" first; a chip narrows the brand groups and combines with the
   search box, and the row stays away when the region offers one material only (the feet are TPU alone).

   The materials are the ones the line headers' coloured tags carry (2026-10-21): a line's come from its name (TPU; PLA
   and/or PETG), and where a line sells two (the Elegoo line, "PLA / PETG") a colour's comes from its own name ("PETG
   Black", "PLA Grey"). Pure and DOM-free, so test/materials.test.mjs checks it without a browser; colors.js renders. */

/** The materials, in the order the chips and the tags show them. */
export const MATERIALS = ['PLA', 'PETG', 'TPU'];

/** A line's materials from its name: a TPU line is TPU only; otherwise PLA and/or PETG, in MATERIALS order. */
export const lineMaterials = (line) => (/TPU/.test(line) ? ['TPU'] : ['PLA', 'PETG'].filter((m) => line.includes(m)));

/** The material a colour's own words name (PLA, PETG or TPU as a whole word, so "PLATINUM" says nothing), or null. For
    a two-material line's colours, and for an "In this build" colour the catalogue does not know: a shared or uploaded
    palette can name anything, and "PETG Blue" should still answer the PETG chip (Terra 01a16a51). */
export const wordMaterial = (text, among = MATERIALS) => { const words = String(text || '').toUpperCase().split(/[\s/]+/); return among.find((m) => words.includes(m)) || null; };   // any case: "petg Blue" is PETG (Terra 01a16a51, round 2)

/** A colour's material: the line's one material, or where the line sells several, the one the colour's own name carries
    (`name`, then `label`); null when neither says. */
export function colorMaterial(line, color) {
  const ms = lineMaterials(line);
  if (ms.length <= 1) return ms[0] || null;
  return wordMaterial(`${color.name || ''} ${color.label || ''}`, ms);
}

/** The materials among these brand groups ({ line, colors }), in MATERIALS order: the chips a picker offers. */
export const materialsIn = (groups) => MATERIALS.filter((m) => groups.some((g) => g.colors.some((c) => colorMaterial(g.line, c) === m)));

/** The groups narrowed to one material; `'all'` (or nothing) returns them as given. A group whose colours are all of
    another material is dropped, so a brand header never stands over an empty row. */
export function filterByMaterial(groups, material) {
  if (!material || material === 'all') return groups;
  return groups.map((g) => ({ ...g, colors: g.colors.filter((c) => colorMaterial(g.line, c) === material) })).filter((g) => g.colors.length);
}

/** label -> material over a whole catalogue: the "In this build" row's colours carry a label and no line. */
export const labelMaterials = (db) => new Map(db.flatMap((b) => b.colors.map((c) => [c.label, colorMaterial(b.line, c)])));
