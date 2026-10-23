/**
 * Decode the kit's meshopt-compressed part GLBs for Blender, which cannot read EXT_meshopt_compression (4.5.4, this
 * laptop and node0 alike: "Extension EXT_meshopt_compression is not available on this addon version").
 *
 *   node tools/done-scene/decode-glb.mjs <manifest.json> <parts dir> <out dir>
 *
 * Every node the manifest's instances name is read from <parts dir>/<node>.lib.glb, each compressed bufferView is decoded
 * with the planner's own vendored decoder (vendor/three/addons/libs/meshopt_decoder.module.js, the one the stage uses), the
 * extension is dropped, and a plain GLB with one buffer is written to <out dir>/<node>.lib.glb. KHR_mesh_quantization, if
 * present, is left alone: Blender reads it. Geometry only; these files carry no textures.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { MeshoptDecoder } = await import(pathToFileURL(join(here, '..', '..', 'vendor', 'three', 'addons', 'libs', 'meshopt_decoder.module.js')).href);
await MeshoptDecoder.ready;

const [manifestPath, partsDir, outDir] = process.argv.slice(2);
if (!manifestPath || !partsDir || !outDir) { console.error('usage: decode-glb.mjs <manifest.json> <parts dir> <out dir>'); process.exit(2); }
await mkdir(outDir, { recursive: true });

const JSON_CHUNK = 0x4E4F534A, BIN_CHUNK = 0x004E4942;
function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === BIN_CHUNK) bin = body;
    off += 8 + len;
  }
  return { json, bin };
}
function writeGlb(json, bin) {
  const pad4 = (n) => (n + 3) & ~3;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(jsonBytes.byteLength), binLen = pad4(bin.byteLength);
  const out = new Uint8Array(12 + 8 + jsonLen + 8 + binLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.byteLength, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, JSON_CHUNK, true);
  out.set(jsonBytes, 20); out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLen);
  dv.setUint32(20 + jsonLen, binLen, true); dv.setUint32(24 + jsonLen, BIN_CHUNK, true);
  out.set(bin, 28 + jsonLen);
  return out;
}
const MODE = { ATTRIBUTES: 'ATTRIBUTES', TRIANGLES: 'TRIANGLES', INDICES: 'INDICES' };

function decode(buf) {
  const { json, bin } = parseGlb(buf);
  const parts = [];
  let total = 0;
  for (const bv of json.bufferViews || []) {
    const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
    let bytes;
    if (ext) {
      const src = bin.subarray(ext.byteOffset || 0, (ext.byteOffset || 0) + ext.byteLength);
      bytes = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(bytes, ext.count, ext.byteStride, src, MODE[ext.mode] || ext.mode, ext.filter || 'NONE');
      delete bv.extensions.EXT_meshopt_compression;
      if (!Object.keys(bv.extensions).length) delete bv.extensions;
      if (bv.byteStride == null && ext.mode === 'ATTRIBUTES') bv.byteStride = ext.byteStride;   // interleaved attributes need their stride
    } else {
      if (bv.buffer !== 0) throw new Error('a plain bufferView outside the BIN chunk');
      bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    }
    const aligned = (total + 3) & ~3;
    parts.push({ at: aligned, bytes });
    bv.buffer = 0; bv.byteOffset = aligned; bv.byteLength = bytes.byteLength;
    total = aligned + bytes.byteLength;
  }
  const out = new Uint8Array((total + 3) & ~3);
  for (const p of parts) out.set(p.bytes, p.at);
  json.buffers = [{ byteLength: out.byteLength }];
  for (const k of ['extensionsRequired', 'extensionsUsed']) {
    if (json[k]) { json[k] = json[k].filter((e) => e !== 'EXT_meshopt_compression'); if (!json[k].length) delete json[k]; }
  }
  return writeGlb(json, out);
}

const m = JSON.parse(await readFile(manifestPath, 'utf8'));
const nodes = [...new Set(m.instances.map((i) => i.node))].filter((n) => !n.startsWith('WoodScrew'));
let done = 0;
for (const node of nodes) {
  const src = join(partsDir, node + '.lib.glb');
  let buf;
  try { buf = new Uint8Array(await readFile(src)); } catch { console.warn('missing ' + src); continue; }
  const out = decode(buf);
  await writeFile(join(outDir, node + '.lib.glb'), out);
  done++;
  console.log(`${node}: ${buf.byteLength} -> ${out.byteLength} bytes`);
}
console.log(`${done} of ${nodes.length} decoded into ${outDir}`);
