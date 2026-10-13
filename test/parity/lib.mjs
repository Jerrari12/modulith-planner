/* Shared by the parity gates: the catalog the NEW rules take, the OLD planner booted in jsdom the way its own
   tests boot it, and a canonical JSON for comparing results. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PLANNER = process.env.PLANNER_REPO || join(root, '..', 'GEN2 Planner', 'gen2-planner-main');
export const havePlanner = existsSync(join(PLANNER, 'js', 'app.js'));
export const read = (p) => readFileSync(p, 'utf8');
export const clone = (v) => JSON.parse(JSON.stringify(v));

/* the catalog the NEW rules take: data.js evaluated in a vm with requirement-scope and tabletop-completion first
   (data.js reads GEN2_REQ; the layout rules reach GEN2_TABLETOP) */
export function loadCatalog() {
  const ctx = vm.createContext({ console });
  vm.runInContext(read(join(root, 'js', 'vendor', 'requirement-scope.js')), ctx);
  vm.runInContext(read(join(root, 'js', 'vendor', 'tabletop-completion.js')), ctx);
  return vm.runInContext(read(join(root, 'js', 'catalog', 'data.js')) + '\n;({ GEN2, partLinks, GEN2_TABLETOP })', ctx);
}

/* the OLD planner, booted the way its own tests boot it (test/planner.test.mjs): jsdom, a localStorage stub, the
   four scripts evaluated in order, the test hook as the API. Math.random is seeded (mulberry32) so surpriseMe is
   reproducible run to run. */
export async function bootPlanner(seed) {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(read(join(PLANNER, 'index.html')), { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  const mem = new Map();
  Object.defineProperty(w, 'localStorage', { value: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear() } });
  w.__GEN2_PLANNER_TEST__ = true;
  let s = seed >>> 0;
  w.Math.random = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  w.eval(read(join(PLANNER, 'js', 'requirement-scope.js')) + '\n' + read(join(PLANNER, 'js', 'tabletop-completion.js')) + '\n' + read(join(PLANNER, 'js', 'data.js')) + '\n' + read(join(PLANNER, 'js', 'app.js')));
  return { app: w.__GEN2_PLANNER_TEST__, window: w, random: () => w.Math.random() };
}

export const canon = (v) => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Set) && !(val instanceof Map)) ? Object.fromEntries(Object.keys(val).sort().map((x) => [x, val[x]])) : (val instanceof Set ? [...val].sort() : val));

export const kitFiles = () => readdirSync(join(root, 'builds')).filter((f) => f.endsWith('.json') && f !== 'index.json');
export const readKit = (f) => JSON.parse(read(join(root, 'builds', f)));
