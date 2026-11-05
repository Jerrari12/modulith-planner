/* The generator off the main thread (M3, 2026-11-05; SPEC "Planner integration (agreed 2026-10-22)": the interior is
   generated in a Web Worker and the mesh returns while the drawer is still sliding). A module worker that boots manifold
   and the four STL meshes once and answers three asks, each a message { id, op, args }:
     shell  { size, height }                      -> { positions }            the empty shell with its floor slab
     drawer { full }                              -> { positions, grams, ms } the whole drawer for a full layout (unit.js fullLayout)
     zip    { full, bodyHex, stamp }              -> { bytes, filename, code } the download (download.js buildFiles)
   `positions` is a Float32Array in the planner's frame (frame.js framePositions), transferred, one vertex per corner;
   the main thread makes the geometry and its creased normals (engine.js). The same `handle` runs on the main thread when
   a worker cannot be made (engine.js's fallback) and under node in the tests, given a booted engine. */
import * as G from './gen.js';
import { framePositions } from './frame.js';
import { buildFiles } from './download.js';
import { outlinesOf } from './unit.js';

const q = (mm) => Math.round(mm * G.U);
let engine = null;

async function stl(name, wasm) {
  const r = await fetch(new URL('assets/' + name, import.meta.url));
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return G.manifoldFromSTL(wasm, await r.arrayBuffer());
}
/* boot manifold and the meshes (once); the engine is { wasm, assets } as the generator's validation scripts build it */
export async function bootEngine() {
  if (engine) return engine;
  const { default: Module } = await import('./lib/manifold.js');
  const wasm = await Module(); wasm.setup();
  const [small, large, s05, s1] = await Promise.all([stl('holder_stamp.stl', wasm), stl('holder_stamp_large.stl', wasm), stl('shell_240-2W-05H.stl', wasm), stl('shell_240-2W-1H.stl', wasm)]);
  engine = { wasm, assets: { stamps: { small, large }, shells: { '0.5H': s05, '1H': s1 } } };
  return engine;
}
/* the empty shell with its floor slab: what a closed parts drawer shows */
function shellPositions(eng, size, height) {
  const { wasm, assets } = eng;
  const shell = G.shellFor(wasm, assets, size, height);
  const S = G.SIZES[size];
  const slab = wasm.Manifold.cube([q(S.W + 2 * G.C.OV), q(S.D + 2 * G.C.OV), q(G.C.FLOOR)]).translate([q(-G.C.OV), q(-G.C.OV), 0]);
  const m = wasm.Manifold.union(shell, slab); slab.delete();
  const positions = framePositions(size, m.getMesh()); m.delete();
  return positions;
}
/* one ask, answered: { result, transfer } */
export async function handle(op, args, eng = engine) {
  if (op === 'boot') { await bootEngine(); return { result: { ok: true }, transfer: [] }; }
  if (!eng) throw new Error('the engine has not booted');
  if (op === 'shell') { const positions = shellPositions(eng, args.size, args.height); return { result: { positions }, transfer: [positions.buffer] }; }
  if (op === 'drawer') {
    const t0 = (globalThis.performance || Date).now();
    const m = G.buildDrawer(eng.wasm, args.full, eng.assets, { outlines: outlinesOf(args.full) });
    const positions = framePositions(args.full.size, m.getMesh()), grams = G.grams(m); m.delete();
    return { result: { positions, grams, ms: (globalThis.performance || Date).now() - t0 }, transfer: [positions.buffer] };
  }
  if (op === 'zip') { const r = await buildFiles(eng, args.full, { bodyHex: args.bodyHex, stamp: args.stamp }); return { result: r, transfer: [r.bytes.buffer] }; }
  throw new Error(`unknown ask: ${op}`);
}
/* in a worker: answer messages; elsewhere (the main thread's fallback, node) this module is just its functions */
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = async (e) => {
    const { id, op, args } = e.data || {};
    try { const { result, transfer } = await handle(op, args); self.postMessage({ id, ok: true, ...result }, transfer); }
    catch (err) { self.postMessage({ id, ok: false, error: String((err && err.message) || err) }); }
  };
}
