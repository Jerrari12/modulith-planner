/* The download, as the prototype made it (M2, 2026-11-05; SPEC "Export", index.html buildZip), less what M2 leaves out:
   the lid, the covers, the part outlines and labels.csv. One zip: with the floor colour off, the whole drawer as STL and
   a plain 3MF; with a floor colour, a PrusaSlicer 3MF and a Bambu Studio / OrcaSlicer 3MF (beta: the Bambu file's
   known issue is one of Joey's open decisions) with the body and floor parts and their filaments, the STL parts, and
   for one colour the single-nozzle files with the filament change at 1.4 mm; always README.txt and layout.json. The
   layout code is marked under the drawer, as the prototype did by default; the zip's name ends with it. The archive
   writer is zip.js (no JSZip in the planner); the 3MF packs are zips inside it. */
import * as G from './gen.js';
import * as X from './export.js';
import * as Mk from './marks.js';
import { zip } from './zip.js';

const fmt = (v) => v.toFixed(1);
const enc = new TextEncoder();
/* a 3MF package from export.js's file map (strings and byte arrays); no folder entries, which strict OPC readers refuse */
const pack = (files) => zip(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? enc.encode(v) : v])), { compress: true });

/* { blob, filename, code } for a full layout (unit.js fullLayout) on the booted engine; `bodyHex` is the drawer's colour */
export async function buildZip(engine, full, { bodyHex = '#ff6a1a', stamp = 'planner' } = {}) {
  const { wasm, assets } = engine;
  const L = full, H = G.holderOf(L), S = G.SIZES[L.size];
  const code = await Mk.codeOf(L), share = await Mk.shareOf(L);
  const base = `MODULITH ${L.size}-${L.height} Parts Drawer ${L.comps.length} compartments ${H.name} labels`;
  const files = {}; const listed = [];
  const opts = { bottomMark: [...Mk.textRects(Mk.pretty(code), { px: 0.9, cx: S.W / 2, cy: S.D - 26, mirror: true }), ...Mk.textRects('MODULITH', { px: 0.6, cx: S.W / 2, cy: S.D - 35, mirror: true })] };
  const solid = G.buildDrawer(wasm, L, assets, opts);
  const whole = X.placeOnBed([{ name: base, color: bodyHex, extruder: 1, mesh: X.meshData(solid) }]); solid.delete();
  if (L.floor.mode === 'off') {
    files[`${base}.stl`] = X.stl(whole[0].mesh, `${base} ${stamp}`);
    files[`${base}.3mf`] = await pack(X.generic3MF(whole, base));
  } else {
    const { body, floors } = G.buildParts(wasm, L, assets, opts);
    const parts = X.placeOnBed([{ name: 'Body', color: bodyHex, extruder: 1, mesh: X.meshData(body) },
      ...floors.map((f) => ({ name: L.floor.mode === 'one' ? 'Floor color' : `Floor color ${f.color}`, color: L.floor.colors[f.color - 1], extruder: f.color + 1, mesh: X.meshData(f.part) }))]);
    body.delete(); floors.forEach((f) => f.part.delete());
    const MM = 'Multi-material';
    files[`${MM} - PrusaSlicer/${base}.3mf`] = await pack(X.prusa3MF(parts, base));
    files[`${MM} - Bambu Studio, OrcaSlicer (beta)/${base}.3mf`] = await pack(X.bambu3MF(parts, base));
    for (const p of parts) files[`${MM} - STL parts/${base} - ${p.name}.stl`] = X.stl(p.mesh, `${base} ${p.name}`);
    listed.push([`${MM} - PrusaSlicer/`, 'Open the 3MF: parts and filaments are already assigned (MMU3, XL and other multi-tool printers).'],
      [`${MM} - Bambu Studio, OrcaSlicer (beta)/`, 'Same, for AMS printers. If the parts or filaments come in wrong, use the STL parts instead.'],
      [`${MM} - STL parts/`, "Any slicer: load all of these at once, answer yes to loading them as one object with several parts, then set each part's filament."]);
    if (L.floor.mode === 'one') {
      const cc = { z: 1.4, color: bodyHex.toUpperCase() };
      files[`Single nozzle - PrusaSlicer/${base}.3mf`] = await pack(X.prusa3MF(whole, base, cc));
      files[`Single nozzle - Bambu Studio (beta)/${base}.3mf`] = await pack(X.bambu3MF(whole, base, cc));
      files[`Single nozzle - STL/${base}.stl`] = X.stl(whole[0].mesh, `${base} ${stamp}`);
      listed.push(['Single nozzle - PrusaSlicer/ and Single nozzle - Bambu Studio (beta)/', 'One part with the filament change already set at 1.4 mm.'],
        ['Single nozzle - STL/', 'Add a filament change at the first layer above 1.2 mm yourself.']);
    }
  }
  listed.push(['Layout code', `${Mk.pretty(code)} is marked under the drawer. Type it into the planner to reopen this layout.`]);
  const how = G.shellChanges(L.size, L.height).join(', '), [fa, fb] = G.footprint(L.size);
  const notes = S.heights[L.height].stretched ? ['NEW SIZE', `  The ${L.size}-${L.height} drawer is made from the 240-2W drawer (${how}): cut and rejoined or stretched`, '  only where its walls run straight. It has not been checked against a modelled part yet: print one and check',
    '  that it slides in its case before you print a set.', `  It prints ${fmt(fa)} x ${fmt(fb)} mm.`] : [];
  files['README.txt'] = X.readme({ title: base, floor: L.floor, bodyColor: bodyHex, files: listed, notes, ribs: 0 });
  files['layout.json'] = JSON.stringify({ generator: 'MODULITH Planner, parts drawer (prototype)', stamp, code: Mk.pretty(code), share, ...L, labelSize: H.label.join(' x ') + ' mm',
    units: 'mm; compartment x/y are the clear inside, measured from the cavity front-left corner' }, null, 2);
  const bytes = await zip(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? enc.encode(v) : v])), { compress: true });
  return { blob: new Blob([bytes], { type: 'application/zip' }), filename: `${base.replace(/\s+/g, '-')}-${Mk.pretty(code)}.zip`, code: Mk.pretty(code) };
}
/* hand a blob to the browser as a download */
export function saveBlob(blob, filename) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
