/* The download, as the prototype made it (M2/M3, 2026-11-05; SPEC "Export", index.html buildZip), less what stays out:
   the lid, the covers and the cells (SPEC open decision 7). One zip: with the floor colour off, the whole drawer as STL
   and a plain 3MF; with a floor colour, a PrusaSlicer 3MF and a generic-with-config 3MF for OrcaSlicer and Bambu Studio
   with the body and floor parts and their filaments, the STL parts, and for one colour the single-nozzle files with the
   filament change at 1.4 mm; labels.csv when compartments carry parts (M3); always README.txt and layout.json. The
   layout code is marked under the drawer, as the prototype did by default; the zip's name ends with it. The archive
   writer is zip.js (no JSZip in the planner); the 3MF packs are zips inside it.
   buildFiles is pure over a booted engine (wasm + assets) and runs in the worker (worker.js) or, as a fallback, on the
   main thread; saveBytes hands the result to the browser. */
import * as G from './gen.js';
import * as X from './export.js';
import * as Mk from './marks.js';
import * as I from './inventory.js';
import { zip } from './zip.js';
import { outlinesOf } from './unit.js';

const fmt = (v) => v.toFixed(1);
const enc = new TextEncoder();
/* a 3MF package from export.js's file map (strings and byte arrays); no folder entries, which strict OPC readers refuse */
const pack = (files) => zip(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? enc.encode(v) : v])), { compress: true });
/* the folder for the second multi-material 3MF: a generic 3MF with a model_settings.config beside it, which OrcaSlicer and
   Bambu Studio read; it no longer claims to have been saved by Bambu Studio (SPEC "Export", the known issue; open decision 5) */
const ORCA = 'OrcaSlicer, Bambu Studio (generic 3MF, beta)';

/* { bytes, filename, code } for a full layout (unit.js fullLayout) on the booted engine; `bodyHex` is the drawer's colour */
export async function buildFiles(engine, full, { bodyHex = '#ff6a1a', stamp = 'planner' } = {}) {
  const { wasm, assets } = engine;
  const L = full, H = G.holderOf(L), S = G.SIZES[L.size];
  const code = await Mk.codeOf(L), share = await Mk.shareOf(L);
  const base = `MODULITH ${L.size}-${L.height} Parts Drawer ${L.comps.length} compartments ${H.name} labels`;
  const files = {}; const listed = [];
  const opts = { outlines: outlinesOf(L), bottomMark: [...Mk.textRects(Mk.pretty(code), { px: 0.9, cx: S.W / 2, cy: S.D - 26, mirror: true }), ...Mk.textRects('MODULITH', { px: 0.6, cx: S.W / 2, cy: S.D - 35, mirror: true })] };
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
    files[`${MM} - ${ORCA}/${base}.3mf`] = await pack(X.bambu3MF(parts, base));
    for (const p of parts) files[`${MM} - STL parts/${base} - ${p.name}.stl`] = X.stl(p.mesh, `${base} ${p.name}`);
    listed.push([`${MM} - PrusaSlicer/`, 'Open the 3MF: parts and filaments are already assigned (MMU3, XL and other multi-tool printers).'],
      [`${MM} - ${ORCA}/`, 'A generic 3MF with the parts and filaments in model_settings.config, for AMS printers. If they come in wrong, use the STL parts instead.'],
      [`${MM} - STL parts/`, "Any slicer: load all of these at once, answer yes to loading them as one object with several parts, then set each part's filament."]);
    if (L.floor.mode === 'one') {
      const cc = { z: 1.4, color: bodyHex.toUpperCase() };
      files[`Single nozzle - PrusaSlicer/${base}.3mf`] = await pack(X.prusa3MF(whole, base, cc));
      files[`Single nozzle - ${ORCA}/${base}.3mf`] = await pack(X.bambu3MF(whole, base, cc));
      files[`Single nozzle - STL/${base}.stl`] = X.stl(whole[0].mesh, `${base} ${stamp}`);
      listed.push([`Single nozzle - PrusaSlicer/ and Single nozzle - ${ORCA}/`, 'One part with the filament change already set at 1.4 mm.'],
        ['Single nozzle - STL/', 'Add a filament change at the first layer above 1.2 mm yourself.']);
    }
  }
  if (L.comps.some((c) => c.item)) {
    files['labels.csv'] = I.labelsCSV(L.comps);
    listed.push(['labels.csv', 'The label text for each compartment, front-left to back-right. Print it on 12 mm label tape or bring it into the Label Studio.']);
  }
  listed.push(['Layout code', `${Mk.pretty(code)} is marked under the drawer. Type it into the planner to reopen this layout.`]);
  const how = G.shellChanges(L.size, L.height).join(', '), [fa, fb] = G.footprint(L.size);
  const notes = S.heights[L.height].stretched ? ['NEW SIZE', `  The ${L.size}-${L.height} drawer is made from the 240-2W drawer (${how}): cut and rejoined or stretched`, '  only where its walls run straight. It has not been checked against a modelled part yet: print one and check',
    '  that it slides in its case before you print a set.', `  It prints ${fmt(fa)} x ${fmt(fb)} mm.`] : [];
  files['README.txt'] = X.readme({ title: opts.name ? `${opts.name} · ${base}` : base, floor: L.floor, bodyColor: bodyHex, files: listed, notes, ribs: 0 });   // the unit's name first, when it has one
  files['layout.json'] = JSON.stringify({ generator: 'MODULITH Planner, parts drawer', stamp, code: Mk.pretty(code), share, ...L, labelSize: H.label.join(' x ') + ' mm',
    units: 'mm; compartment x/y are the clear inside, measured from the cavity front-left corner' }, null, 2);
  const bytes = await zip(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? enc.encode(v) : v])), { compress: true });
  return { bytes, filename: `${base.replace(/\s+/g, '-')}-${Mk.pretty(code)}.zip`, code: Mk.pretty(code) };
}
/* hand bytes to the browser as a download */
export function saveBytes(bytes, filename) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
