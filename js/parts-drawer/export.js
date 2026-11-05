// MODULITH parts drawer generator — file writers. Pure functions that return file contents; the caller zips them.
// Coordinates come in as manifold meshes in grid units (see gen.js U) and are written in mm.
import { U } from './gen.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n4 = (v) => (Math.round(v * 1e4) / 1e4).toString();

// mesh -> { v: Float64Array (mm, xyz), t: Uint32Array }
export function meshData(m) {
  const mesh = m.getMesh(); const np = mesh.numProp, vp = mesh.vertProperties, nv = vp.length / np;
  const v = new Float64Array(nv * 3);
  for (let i = 0; i < nv; i++) { v[3 * i] = vp[i * np] / U; v[3 * i + 1] = vp[i * np + 1] / U; v[3 * i + 2] = vp[i * np + 2] / U; }
  return { v, t: Uint32Array.from(mesh.triVerts) };
}
// shift every part by the same amount so the whole drawer sits at x, y >= 0 (z already starts on the bed)
export function placeOnBed(parts) {
  let mx = Infinity, my = Infinity;
  for (const p of parts) for (let i = 0; i < p.mesh.v.length; i += 3) { mx = Math.min(mx, p.mesh.v[i]); my = Math.min(my, p.mesh.v[i + 1]); }
  for (const p of parts) for (let i = 0; i < p.mesh.v.length; i += 3) { p.mesh.v[i] -= mx; p.mesh.v[i + 1] -= my; }
  return parts;
}
function meshXML(md) {
  const out = ['<mesh><vertices>'];
  for (let i = 0; i < md.v.length; i += 3) out.push(`<vertex x="${n4(md.v[i])}" y="${n4(md.v[i + 1])}" z="${n4(md.v[i + 2])}"/>`);
  out.push('</vertices><triangles>');
  for (let i = 0; i < md.t.length; i += 3) out.push(`<triangle v1="${md.t[i]}" v2="${md.t[i + 1]}" v3="${md.t[i + 2]}"/>`);
  out.push('</triangles></mesh>');
  return out.join('');
}
const CT = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/><Default Extension="xml" ContentType="text/xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
const meta = (title) => `<metadata name="Title">${esc(title)}</metadata><metadata name="Designer">Jerrari Design</metadata><metadata name="Application">MODULITH Parts Drawer Generator</metadata>`;
const hex8 = (c) => (c || '#808080').toUpperCase() + 'FF';

// Plain 3MF (core spec). One part: one object. Several parts: one object built from components, so slicers
// load it as a single object with parts; each part also carries its display colour.
// opts.items: every part its own object on the plate (loose pieces such as compartment covers), instead of one object
// made of parts
export function generic3MF(parts, title, opts = {}) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">', meta(title), '<resources>'];
  out.push('<basematerials id="1">' + parts.map((p) => `<base name="${esc(p.name)}" displaycolor="${hex8(p.color)}"/>`).join('') + '</basematerials>');
  if (opts.items && parts.length > 1) {
    parts.forEach((p, i) => out.push(`<object id="${i + 2}" type="model" name="${esc(p.name)}" pid="1" pindex="${i}">${meshXML(p.mesh)}</object>`));
    out.push(`</resources><build>${parts.map((_, i) => `<item objectid="${i + 2}"/>`).join('')}</build></model>`);
  } else if (parts.length === 1) {
    out.push(`<object id="2" type="model" name="${esc(title)}" pid="1" pindex="0">${meshXML(parts[0].mesh)}</object></resources><build><item objectid="2"/></build></model>`);
  } else {
    parts.forEach((p, i) => out.push(`<object id="${i + 2}" type="model" name="${esc(p.name)}" pid="1" pindex="${i}">${meshXML(p.mesh)}</object>`));
    const top = parts.length + 2;
    out.push(`<object id="${top}" type="model" name="${esc(title)}"><components>${parts.map((_, i) => `<component objectid="${i + 2}"/>`).join('')}</components></object>`);
    out.push(`</resources><build><item objectid="${top}"/></build></model>`);
  }
  return { '[Content_Types].xml': CT, '_rels/.rels': RELS, '3D/3dmodel.model': out.join('') };
}

// PrusaSlicer project 3MF: one object whose mesh holds every part; Slic3r_PE_model.config splits it into volumes
// by triangle range and assigns each an extruder. colorChange: optional { z, color } for a single-nozzle M600.
export function prusa3MF(parts, title, colorChange) {
  const v = [], t = [], ranges = []; let base = 0;
  for (const p of parts) {
    const first = t.length / 3;
    for (let i = 0; i < p.mesh.v.length; i++) v.push(p.mesh.v[i]);
    for (let i = 0; i < p.mesh.t.length; i++) t.push(p.mesh.t[i] + base);
    base += p.mesh.v.length / 3; ranges.push([first, t.length / 3 - 1]);
  }
  const model = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">',
    '<metadata name="slic3rpe:Version3mf">1</metadata>', meta(title),
    `<resources><object id="1" type="model">${meshXML({ v, t })}</object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/></build></model>`].join('');
  const cfg = ['<?xml version="1.0" encoding="UTF-8"?>\n<config>', `<object id="1" instances_count="1"><metadata type="object" key="name" value="${esc(title)}"/>`];
  parts.forEach((p, i) => cfg.push(`<volume firstid="${ranges[i][0]}" lastid="${ranges[i][1]}"><metadata type="volume" key="name" value="${esc(p.name)}"/><metadata type="volume" key="volume_type" value="ModelPart"/><metadata type="volume" key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><metadata type="volume" key="extruder" value="${p.extruder}"/><mesh edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/></volume>`));
  cfg.push('</object></config>');
  const files = { '[Content_Types].xml': CT, '_rels/.rels': RELS, '3D/3dmodel.model': model, 'Metadata/Slic3r_PE_model.config': cfg.join('') };
  if (colorChange) files['Metadata/Prusa_Slicer_custom_gcode_per_print_z.xml'] = `<?xml version="1.0" encoding="utf-8"?>\n<custom_gcodes_per_print_z>\n<code print_z="${colorChange.z}" type="0" extruder="1" color="${esc(colorChange.color)}" extra="" gcode="M600"/>\n<mode value="SingleExtruder"/>\n</custom_gcodes_per_print_z>\n`;
  return files;
}

// Bambu Studio / OrcaSlicer project 3MF: parts as components in a sub-model, model_settings.config assigns filaments.
export function bambu3MF(parts, title, colorChange) {
  const uuid = (i) => `0000000${i}-61cb-4c03-9d28-80fed5dfa1dc`.slice(-36);
  const sub = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">',
    '<metadata name="BambuStudio:3mfVersion">1</metadata><resources>'];
  parts.forEach((p, i) => sub.push(`<object id="${i + 1}" p:UUID="${uuid(i + 1)}" type="model">${meshXML(p.mesh)}</object>`));
  sub.push('</resources><build/></model>');
  const top = parts.length + 1;
  const model = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">',
    // M3 (2026-11-05, SPEC "Export" known issue): the file no longer claims to have been saved by Bambu Studio (it has no
    // project_settings.config, so Bambu Studio dropped the config); it is a generic 3MF with a model_settings.config
    '<metadata name="BambuStudio:3mfVersion">1</metadata>', meta(title),
    `<resources><object id="${top}" p:UUID="${uuid(top)}" type="model"><components>`,
    parts.map((p, i) => `<component p:path="/3D/Objects/object_1.model" objectid="${i + 1}" p:UUID="${uuid(top + 1 + i)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`).join(''),
    `</components></object></resources><build p:UUID="${uuid(90)}"><item objectid="${top}" p:UUID="${uuid(91)}" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/></build></model>`].join('');
  const settings = ['<?xml version="1.0" encoding="UTF-8"?>\n<config>', `<object id="${top}"><metadata key="name" value="${esc(title)}"/><metadata key="extruder" value="1"/>`];
  parts.forEach((p, i) => settings.push(`<part id="${i + 1}" subtype="normal_part"><metadata key="name" value="${esc(p.name)}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><metadata key="extruder" value="${p.extruder}"/></part>`));
  settings.push(`</object><plate><metadata key="plater_id" value="1"/><metadata key="locked" value="false"/><model_instance><metadata key="object_id" value="${top}"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="${top * 10}"/></model_instance></plate></config>`);
  const files = { '[Content_Types].xml': CT, '_rels/.rels': RELS, '3D/3dmodel.model': model, '3D/Objects/object_1.model': sub.join(''),
    '3D/_rels/3dmodel.model.rels': '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    'Metadata/model_settings.config': settings.join('') };
  if (colorChange) files['Metadata/custom_gcode_per_layer.xml'] = `<?xml version="1.0" encoding="utf-8"?>\n<custom_gcodes_per_layer>\n<plate>\n<plate_info id="1"/>\n<layer top_z="${colorChange.z}" type="0" extruder="1" color="${esc(colorChange.color)}" extra="" gcode="M600"/>\n<mode value="SingleExtruder"/>\n</plate>\n</custom_gcodes_per_layer>\n`;
  return files;
}

// Print notes that travel with the files.
export function readme({ title, floor, bodyColor, files, notes = [], ribs = 0 }) {
  const L = [title, 'Made with the MODULITH Parts Drawer Generator (prototype), Jerrari Design.', ''];
  if (notes.length) L.push(...notes, '');
  if (floor.mode === 'off') {
    L.push('Single color. Print the STL or the 3MF as one part.');
    if (files.length) { L.push('', 'FILES'); for (const [name, what] of files) L.push(`  ${name}`, `      ${what}`); }
    return L.join('\n') + '\n';
  }
  L.push('FILAMENTS', `  1  Body (main color)${bodyColor ? '  ' + bodyColor.toUpperCase() : ''}`);
  floor.colors.forEach((c, i) => L.push(`  ${i + 2}  Floor ${floor.mode === 'one' ? 'color' : 'color ' + (i + 1)}  ${c.toUpperCase()}`));
  L.push('', 'The floor color is the top 0.6 mm of each compartment floor: three 0.2 mm layers. On a multi-material',
    'printer the filament only swaps on those layers.');
  // v27: washer rows are coloured up through their ribs, which adds colour layers
  if (ribs > 1.2) L.push(`Washer rows take the floor color up through their ribs, to ${ribs.toFixed(1)} mm above the bed, so the filament`,
    `also swaps on the ${Math.ceil((ribs - 1.2) / 0.2 - 1e-6)} layers above the floor there.`);
  L.push('', 'FILES');
  for (const [name, what] of files) L.push(`  ${name}`, `      ${what}`);
  if (floor.mode === 'one') {
    L.push('', 'SINGLE-NOZZLE PRINTERS', '  The single-nozzle files already have one filament change set at 1.4 mm (for 0.2 mm layers).',
      '  Load the floor color first and switch to the body color when the printer asks.',
      '  With another layer height, move the change to the first layer above 1.2 mm.',
      '  The bottom 1.2 mm of the outside also comes out in the floor color.');
    if (ribs > 1.2) L.push('  Washer rows: their ribs stand above 1.2 mm, so with one filament change they come out in the body color', '  (only the bottoms of the grooves take the floor color). A multi-material printer colors them all the way up.');
  }
  return L.join('\n') + '\n';
}

// binary STL from meshData (mm)
export function stl(md, header = 'MODULITH parts drawer') {
  const n = md.t.length / 3; const buf = new ArrayBuffer(84 + n * 50); const dv = new DataView(buf);
  const enc = new TextEncoder().encode(header.slice(0, 80)); new Uint8Array(buf, 0, enc.length).set(enc);
  dv.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50, P = [0, 1, 2].map((k) => 3 * md.t[3 * i + k]);
    const a = [md.v[P[0]], md.v[P[0] + 1], md.v[P[0] + 2]], b = [md.v[P[1]], md.v[P[1] + 1], md.v[P[1] + 2]], c = [md.v[P[2]], md.v[P[2] + 1], md.v[P[2] + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0]; const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
    [a, b, c].forEach((p, k) => { dv.setFloat32(o + 12 + k * 12, p[0], true); dv.setFloat32(o + 16 + k * 12, p[1], true); dv.setFloat32(o + 20 + k * 12, p[2], true); });
  }
  return buf;
}
