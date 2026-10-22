/* The names the planner SHOWS (Joey, 2026-10-16: "start calling them Case 185 inside the planner", dropping GEN2 and not
   adding MODULITH). Display only: the catalogue keys, the BOM rows, the store links, saved builds and the generated
   manifest titles keep their GEN2 names (they are lookup keys and Printables listing names, and the goldens pin the
   titles), so nothing stored or linked changes.
     "GEN2 185 Case - 2W-1H"            -> "Case 185 · 2W-1H"
     "GEN2 185 Cover Lower (CL) - 1W"   -> "Cover Lower 185 (CL) · 1W"
     "GEN2 185-1W-1H Classic Drawer"    -> "Classic Drawer 185 · 1W-1H"
     "GEN2 QuickLock - Right"           -> "QuickLock - Right"   (no collection number: the prefix just goes) */
export function partName(name) {
  const s = String(name ?? '');
  let m = /^GEN2 (\d+)-(\d+(?:\.\d+)?W-\d+(?:\.\d+)?H) (.+)$/.exec(s);
  if (m) return `${m[3]} ${m[1]} · ${m[2]}`;
  m = /^GEN2 (\d+) (.+?)(?: - (.+))?$/.exec(s);
  if (m) {
    const [, len, what, rest] = m;
    const paren = /^(.*?) (\([^)]*\))$/.exec(what);   // "Cover Lower (CL)": the number before the abbreviation
    const named = paren ? `${paren[1]} ${len} ${paren[2]}` : `${what} ${len}`;
    return rest ? `${named} · ${rest}` : named;
  }
  return s.replace(/^GEN2 /, '');
}

/* a build's name as shown: the generated "… · GEN2 Custom · 185" and the kits' "GEN2 185 Tabletop …" lose the GEN2 */
export function buildName(name) {
  return String(name ?? '').replace(/^GEN2 /, '').replace(/ · GEN2 /g, ' · ');
}

/* the browser tab: the build, then the product. The product is named in full, "MODULITH Planner", because the tab title is
   also what a search engine shows for the page (2026-10-19: "modulith" on Google is a Java framework, and the planner's
   title has to say which MODULITH this is); with no build open it says what the planner is for, the same words as
   index.html's static <title>. The plain viewer (main.js, no workspace on <html>) uses the same shape since then. */
export const tabTitle = (name) => (name ? `${buildName(name)} · MODULITH Planner` : 'MODULITH Planner · plan a 3D-printable modular storage build');
