/* The generator in the planner's page (M2/M3, 2026-11-05): the client of worker.js. Manifold boots once, in a module
   worker, the first time a build has a parts drawer; every ask is a message, the answer a Float32Array of positions in the
   planner's frame, which becomes stage geometry here with crease-angle normals (SPEC "3D: what changes": walls shade flat,
   gussets and scoops smooth). Geometry is cached: the empty shell per size and height, the whole drawer per layout shape
   (unit.js geomKey), the six most recent. An ask that is not cached starts a build and answers null now, the caller's
   `onReady` runs when the geometry lands (the drawer on the stage keeps its last body until then: SPEC "the mesh returns
   while the drawer is still inside the case"). Where a worker cannot be made (an old browser, a file: page), the same
   worker.js functions run on the main thread. */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { geomKey } from './unit.js';

const CREASE = THREE.MathUtils.degToRad(30);
const KEEP = 6;   // drawer geometries kept, most recent last
let booting = null, ready = false, worker = null, local = null, seq = 0;
const pending = new Map();   // id -> { resolve, reject }
const shells = new Map(), drawers = new Map(), inFlight = new Map();   // key -> promise
export const engineReady = () => ready;

/* one ask of the engine: the worker when there is one, else worker.js's handle on this thread */
function ask(op, args, transfer = []) {
  if (worker) return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); worker.postMessage({ id, op, args }, transfer); });
  return local.handle(op, args).then((r) => r.result);
}
function onMessage(e) {
  const { id, ok, error, ...rest } = e.data || {};
  const p = pending.get(id); if (!p) return; pending.delete(id);
  if (ok) p.resolve(rest); else p.reject(new Error(error || 'the generator failed'));
}
/* the engine, booted on the first ask (the WASM is about 200 KB compressed; nothing loads until a build has a parts drawer) */
export function partsEngine() {
  if (!booting) booting = (async () => {
    try {
      const w = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
      w.onmessage = onMessage;
      const failed = new Promise((_, rej) => { w.onerror = (ev) => rej(new Error(ev && ev.message ? ev.message : 'the worker could not start')); });
      worker = w;
      await Promise.race([ask('boot', {}), failed]);
      // after boot a worker error (an uncaught throw, the worker killed) answers every ask in flight, so no caller waits
      // forever on a message that will not come (a download's button stuck on 'Building')
      w.onerror = (ev) => { const err = new Error(ev && ev.message ? ev.message : 'the generator failed'); console.warn('[parts drawer] worker', err.message); for (const p of pending.values()) p.reject(err); pending.clear(); };
    } catch (e) {
      // no worker here: the same code on the main thread (SPEC: "the main thread is fine for M2"); said once
      console.warn('[parts drawer] generating on the main thread:', e && e.message);
      if (worker) { worker.terminate(); worker = null; }
      local = await import('./worker.js');
      await local.bootEngine();
    }
    ready = true;
  })().catch((e) => { booting = null; throw e; });
  return booting;
}
/* positions (a Float32Array, one vertex per corner) as stage geometry with creased normals */
export function geometryOf(positions) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const creased = toCreasedNormals(geo, CREASE);
  geo.dispose();
  creased.computeBoundingBox(); creased.computeBoundingSphere();
  return creased;
}
/* an asked geometry: cached, else built once (every caller waiting on the same key shares the build) and handed to onReady */
function cached(map, key, op, args, onReady, keep) {
  const hit = map.get(key);
  if (hit) { if (keep) { map.delete(key); map.set(key, hit); } return hit; }   // most recent last
  if (!ready) return null;
  if (!inFlight.has(key)) {
    const p = ask(op, args).then((r) => {
      const v = { geometry: geometryOf(r.positions), grams: r.grams ?? null, ms: r.ms ?? null };
      map.set(key, v);
      if (keep) while (map.size > keep) { const [k, old] = map.entries().next().value; map.delete(k); old.geometry.dispose(); }
      return v;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  if (onReady) inFlight.get(key).then(() => onReady()).catch((e) => console.warn('[parts drawer] geometry', e));
  return null;
}
/* the empty shell (shell plus floor slab, no internals: what a closed parts drawer shows), cached per size and height */
export function shellGeometry(size, height, onReady = null) {
  const v = cached(shells, `${size}/${height}`, 'shell', { size, height }, onReady, 0);
  return v ? v.geometry : null;
}
/* the whole drawer for a full layout (unit.js fullLayout), cached by its geometry key; { geometry, grams, ms } or null while it builds */
export function drawerGeometry(full, onReady = null) {
  return cached(drawers, geomKey(full), 'drawer', { full }, onReady, KEEP);
}
/* the download's bytes for a full layout: { bytes, filename, code } */
export async function zipFor(full, opts = {}) {
  await partsEngine();
  return ask('zip', { full, bodyHex: opts.bodyHex, stamp: opts.stamp });
}
export const engineStats = () => ({ shells: shells.size, drawers: drawers.size, worker: !!worker, inFlight: inFlight.size });
