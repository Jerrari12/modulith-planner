import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wasm, assets, G, X } from '../lib/parts-drawer-env.mjs';
import { zip, crc32 } from '../../js/parts-drawer/zip.js';

// Ported from the generator's validation/t_export.mjs (M0, 2026-11-04). The script zipped the writers' files with JSZip
// and only looked at the result; the planner packs with its own zip.js, so this reads every archive back: the central
// directory, each entry's name, size and CRC, and the inflated bytes against what the writer returned.
async function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  assert.equal(dv.getUint32(end, true), 0x06054b50, 'end record');
  const n = dv.getUint16(end + 10, true), cd = dv.getUint32(end + 16, true);
  const dec = new TextDecoder(), entries = {};
  let p = cd;
  for (let i = 0; i < n; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50, 'central header');
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    assert.equal(dv.getUint32(off, true), 0x04034b50, name + ': local header');
    const lnlen = dv.getUint16(off + 26, true), lelen = dv.getUint16(off + 28, true), start = off + 30 + lnlen + lelen;
    const packed = bytes.subarray(start, start + csize);
    const data = method === 8 ? new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : packed;
    assert.equal(data.length, size, name + ': size');
    assert.equal(crc32(data), crc, name + ': crc');
    entries[name] = data;
    p += 46 + nlen + elen + clen;
  }
  return entries;
}
const enc = new TextEncoder();
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test('parts drawer export: the generic, PrusaSlicer and Bambu 3MF writers, packed by zip.js and read back entry for entry', async () => {
  const S = G.SIZES['240-2W'];
  const lay = { v: 2, size: '240-2W', height: '0.5H', label: 'large', floor: { mode: 'paint', colors: ['#f2f2f0', '#f5c518', '#3aa0ff'] },
    comps: G.gridComps(S.shipped.cols, S.shipped.rows).map((c, i) => ({ ...c, color: [0, 1, 2, 3][i % 4], tray: i % 3 === 0 })) };
  const { body, floors } = G.buildParts(wasm, lay, assets);
  const parts = X.placeOnBed([{ name: 'Body', color: '#ff6a1a', extruder: 1, mesh: X.meshData(body) },
    ...floors.map((f) => ({ name: `Floor ${f.color}`, color: lay.floor.colors[f.color - 1], extruder: f.color + 1, mesh: X.meshData(f.part) }))]);
  fs.mkdirSync('out/x', { recursive: true });
  const check = async (files, path, compress = true) => {
    const bytes = await zip(files, { compress });
    fs.writeFileSync(path, bytes);
    const back = await readZip(bytes);
    assert.deepEqual(Object.keys(back), Object.keys(files), path + ': the same entries in the same order');
    for (const [k, v] of Object.entries(files)) assert.ok(same(back[k], v instanceof Uint8Array ? v : enc.encode(v)), `${path}: ${k} reads back as written`);
    return back;
  };
  const generic = await check(X.generic3MF(parts, 'Test drawer'), 'out/x/generic.3mf');
  assert.ok(Object.keys(generic).includes('3D/3dmodel.model') && Object.keys(generic).includes('[Content_Types].xml'), 'a 3MF has its model and content types');
  await check(X.prusa3MF(parts, 'Test drawer'), 'out/x/prusa.3mf');
  await check(X.bambu3MF(parts, 'Test drawer'), 'out/x/bambu.3mf');
  // single colour + one filament change at the floor top
  const lay1 = { ...lay, floor: { mode: 'one', colors: ['#f2f2f0'] } };
  const whole = G.buildDrawer(wasm, lay1, assets);
  const p1 = X.placeOnBed([{ name: 'Drawer', color: '#ff6a1a', extruder: 1, mesh: X.meshData(whole) }]);
  await check(X.prusa3MF(p1, 'Test drawer single nozzle', { z: 1.2, color: '#FF6A1A' }), 'out/x/prusa_single.3mf');
  // stored entries and a binary one (the STL writer's bytes) survive too
  await check({ 'drawer.stl': new Uint8Array(G.toSTL(whole.getMesh())), 'README.txt': X.readme({ title: 'Test drawer', floor: lay1.floor, bodyColor: '#ff6a1a', files: ['drawer.stl'] }) }, 'out/x/stored.zip', false);
  console.log('parts', parts.map((p) => [p.name, p.extruder, p.mesh.t.length / 3]));
});
