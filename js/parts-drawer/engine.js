/* The generator in the planner's page (M2, 2026-11-05): manifold booted once, the two Fusion shells and the holder stamps
   loaded from js/parts-drawer/assets/, and geometry for the stage - the empty shell for a closed drawer, the whole drawer
   for one being edited - in the planner's frame (frame.js), with crease-angle normals (SPEC "3D: what changes": walls
   shade flat, gussets and scoops smooth). Main thread for M2; the worker and the mesh cache move here at M3. */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import * as G from './gen.js';
import { framePositions } from './frame.js';
import { geomKey } from './unit.js';

const CREASE = THREE.MathUtils.degToRad(30);
const KEEP = 6;   // drawer geometries kept, most recent last
let booting = null, engine = null;
const shells = new Map(), drawers = new Map();

async function stl(name, wasm) {
  const r = await fetch(new URL('assets/' + name, import.meta.url));
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return G.manifoldFromSTL(wasm, await r.arrayBuffer());
}
/* the engine, booted on the first ask (the WASM is about 200 KB compressed; nothing loads until a build has a parts drawer) */
export function partsEngine() {
  if (!booting) booting = (async () => {
    const { default: Module } = await import('./lib/manifold.js');
    const wasm = await Module(); wasm.setup();
    const [small, large, s05, s1] = await Promise.all([stl('holder_stamp.stl', wasm), stl('holder_stamp_large.stl', wasm), stl('shell_240-2W-05H.stl', wasm), stl('shell_240-2W-1H.stl', wasm)]);
    engine = { wasm, assets: { stamps: { small, large }, shells: { '0.5H': s05, '1H': s1 } } };
    return engine;
  })().catch((e) => { booting = null; throw e; });
  return booting;
}
export const engineReady = () => engine;   // synchronous: the engine once it has booted, else null

/* a manifold's mesh as stage geometry: the planner's frame (x centred on the outside, up is y, the front faces +z), one
   vertex per corner so the crease pass can decide which edges are sharp */
export function geometryOf(size, manifold) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(framePositions(size, manifold.getMesh()), 3));
  const creased = toCreasedNormals(geo, CREASE);
  geo.dispose();
  creased.computeBoundingBox(); creased.computeBoundingSphere();
  return creased;
}
/* the empty shell (shell plus floor slab, no internals: what a closed parts drawer shows), cached per size and height */
export function shellGeometry(size, height) {
  if (!engine) return null;
  const key = `${size}/${height}`;
  let g = shells.get(key);
  if (!g) {
    const { wasm, assets } = engine;
    const shell = G.shellFor(wasm, assets, size, height);
    const S = G.SIZES[size], q = (mm) => Math.round(mm * G.U);
    const slab = wasm.Manifold.cube([q(S.W + 2 * G.C.OV), q(S.D + 2 * G.C.OV), q(G.C.FLOOR)]).translate([q(-G.C.OV), q(-G.C.OV), 0]);
    const m = wasm.Manifold.union(shell, slab); slab.delete();
    g = geometryOf(size, m); m.delete();
    shells.set(key, g);
  }
  return g;
}
/* the whole drawer for a full layout (unit.js fullLayout), cached by its geometry key; { geometry, grams, ms } */
export function drawerGeometry(full) {
  if (!engine) return null;
  const key = geomKey(full);
  let d = drawers.get(key);
  if (d) { drawers.delete(key); drawers.set(key, d); return d; }   // most recent last
  const t0 = performance.now();
  const { wasm, assets } = engine;
  const m = G.buildDrawer(wasm, full, assets);
  d = { geometry: geometryOf(full.size, m), grams: G.grams(m), ms: performance.now() - t0 };
  m.delete();
  drawers.set(key, d);
  while (drawers.size > KEEP) { const [k, old] = drawers.entries().next().value; drawers.delete(k); old.geometry.dispose(); }
  return d;
}
export const engineStats = () => ({ shells: shells.size, drawers: drawers.size });
