/* The Parts list row for a parts drawer (M3, 2026-11-05; SPEC open decision 4, recommended): a parts drawer is not the
   Decor drawer row's download from Printables - its body is generated to its layout - so its unit leaves the aggregate
   "Decor Drawer" row and gets a row of its own, "Decor Parts Drawer", one per unit (its layout is its own part), with the
   download of the zip where the store link would be (js/workspaces/parts.js). Pure over the rows the BOM gives
   (js/rules/bom.js bomRows; generated from the planner, never edited by hand, so this runs after it). */
import { isPartsDrawer, layoutOf } from './unit.js';

export const PARTS_DRAWER_SECTION = 'Drawers';
/* the rows with every parts drawer moved out of its Decor Drawer row into its own; `on` false returns the rows as they came */
export function withPartsDrawers(rows, build, GEN2, length, on = true) {
  if (!on || !build || !Array.isArray(build.placed) || !GEN2 || !GEN2.partNames) return rows;
  const out = rows.map((r) => ({ ...r }));
  const decor = (GEN2.fills || []).find((f) => f.id === 'decor');
  build.placed.forEach((u, idx) => {
    if (!isPartsDrawer(length, u)) return;
    const size = `${u.w}W-${u.hh / 2}H`;
    const name = GEN2.partNames.drawer(length, size, decor ? decor.label : 'Decor Drawer');
    const at = out.findIndex((r) => r.section === PARTS_DRAWER_SECTION && r.name === name && !r.partsDrawer);
    const base = at >= 0 ? out[at] : null;
    if (base) { base.qty -= 1; if (base.qty <= 0) out.splice(at, 1); }
    const lay = layoutOf(length, u);
    const labels = lay.label === 'small' ? 'Small' : 'Large';
    const row = { section: PARTS_DRAWER_SECTION, mountSection: false, name: GEN2.partNames.drawer(length, size, 'Decor Parts Drawer'), variant: `unit ${idx + 1}`, qty: 1,
      partsDrawer: { unitId: u.id, compartments: lay.comps.length, parts: lay.comps.filter((c) => c.item).length },
      note: `Custom: ${lay.comps.length} compartments, ${labels} labels${lay.floor.mode !== 'off' ? ', coloured floors' : ''} · generated to this unit's layout.`,
      links: null, requirement: base ? base.requirement : undefined, basis: base ? base.basis : undefined };
    // right after the row it left (where that row stood, when it is gone), else at the end of the Drawers section, so the
    // list keeps one Drawers group (the Parts list groups consecutive rows by section)
    let where;
    if (at >= 0) where = base.qty > 0 ? at + 1 : at;
    else { let last = -1; out.forEach((r, i) => { if (r.section === PARTS_DRAWER_SECTION) last = i; }); where = last >= 0 ? last + 1 : out.length; }
    out.splice(where, 0, row);
  });
  return out;
}
