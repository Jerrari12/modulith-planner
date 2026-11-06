/* Compartment labels (M3, 2026-11-05; SPEC open decision 3, recommended yes): a parts drawer's compartments that carry a
   part have label text (inventory.js labelText, the words the download's labels.csv holds), and the Labels workspace can
   put them in the build's one label list, where the Label Studio prints them. The key is on the LAYOUT side: a
   compartment keeps the id of its row (`comp.labelId`), because the shared list format (js/vendor/label-list.js,
   sha-pinned with the Studio) keeps no field of ours on a label; the row's words follow the part (editor.js
   syncLinkedLabels) and a compartment whose part goes lets its row go. These labels are never assigned to a drawer's
   faceplate (`labelAssign`): they wait in the list as the Studio's print set. Pure over a build record. */
import * as R from '../rules/labels.js';
import { isPartsDrawer, layoutOf, compLabelText } from './unit.js';

/* every compartment with a part, in drawer order then reading order (front-left first, as labels.csv): { unitId, drawerNo,
   position (R1C2), text, labelId, linked (its row is in the list), stale (the row's words differ) } */
export function compartmentLabels(L, b) {
  const out = [];
  const labels = R.labelsOf(b);
  for (const u of R.drawers(b)) {
    if (!isPartsDrawer(L, u)) continue;
    const lay = layoutOf(L, u);
    // the position (R2C3) counts EVERY compartment in reading order, empty ones included, so it names the slot in the drawer
    const all = lay.comps.map((c, i) => ({ c, i })).sort((a, b2) => a.c.y0 - b2.c.y0 || a.c.x0 - b2.c.x0);
    const ys = [...new Set(all.map(({ c }) => c.y0))].sort((a, b2) => a - b2);
    for (const { c, i } of all) {
      const text = compLabelText(c); if (!text) continue;
      const r = ys.indexOf(c.y0) + 1, col = all.filter((k) => k.c.y0 === c.y0).findIndex((k) => k.i === i) + 1;
      const row = c.labelId ? labels.find((l) => l.id === c.labelId) : null;
      out.push({ unitId: u.id, drawerNo: R.drawerNumber(b, u.id), drawer: R.drawerName(b, u.id), comp: i, position: `R${r}C${col}`, text, labelId: row ? c.labelId : null, linked: !!row, stale: !!row && R.labelWords(row) !== text });
    }
  }
  return out;
}
/* put the unlinked ones in the list (one commit's worth of mutation on `b`, the record): each gets a plain label with the
   compartment's words, and the compartment its id. Returns how many were added. `LL` is the vendored label-list module. */
export function addToList(LL, b, L, rows = compartmentLabels(L, b).filter((r) => !r.linked)) {
  let added = 0;
  for (const r of rows) {
    const res = R.add(LL, b, { text: r.text });
    if (!res.ok) continue;
    R.applyResult(LL, b, res);
    const u = b.placed.find((p) => p.id === r.unitId); if (!u || !u.partsLayout) continue;
    const c = u.partsLayout.comps[r.comp]; if (c) c.labelId = res.id;
    added++;
  }
  return added;
}
