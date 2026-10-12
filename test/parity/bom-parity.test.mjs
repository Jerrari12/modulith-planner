/* THE PARITY GATE FOR THE BILL OF MATERIALS (the approved merge plan, §1.5).
 *
 * js/rules/bom.js is the planner's computeBom ported by copy (tools/port-rules.mjs). This runs the PLANNER'S OWN
 * computeBom - the live app.js of the planner checkout beside this repo, booted in jsdom exactly as the planner's
 * tests boot it - on the same builds, and compares the sections as canonical JSON. Property-based, not hand-picked:
 * the ten official kits, then seeded random builds the old planner generates itself (surpriseMe under a seeded
 * Math.random), each also swept through the options that change the list (faceplate family, handle series, back
 * cover, feet, closures, removed stoppers, wall stagger).
 *
 * Skips, pin-only, when the planner checkout is absent (CI); the catalog pin (test/catalog-vendor.test.mjs) still
 * guards the data. Astra's rule for phase 2: verify representative builds and options, not only the starter kits.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLANNER = process.env.PLANNER_REPO || join(root, '..', 'GEN2 Planner', 'gen2-planner-main');
const havePlanner = existsSync(join(PLANNER, 'js', 'app.js'));
const read = (p) => readFileSync(p, 'utf8');

/* the catalog the NEW rule takes: data.js evaluated in a vm with requirement-scope first (data.js reads GEN2_REQ) */
function loadCatalog() {
  const ctx = vm.createContext({ console });
  vm.runInContext(read(join(root, 'js', 'vendor', 'requirement-scope.js')), ctx);
  return vm.runInContext(read(join(root, 'js', 'catalog', 'data.js')) + '\n;({ GEN2, partLinks })', ctx);
}

/* the OLD planner, booted the way its own tests boot it (test/planner.test.mjs): jsdom, a localStorage stub, the
   four scripts evaluated in order, the test hook as the API */
async function bootPlanner(seed) {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(read(join(PLANNER, 'index.html')), { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  const mem = new Map();
  Object.defineProperty(w, 'localStorage', { value: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear() } });
  w.__GEN2_PLANNER_TEST__ = true;
  /* a seeded Math.random so surpriseMe is reproducible run to run (mulberry32) */
  let s = seed >>> 0;
  w.Math.random = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  w.eval(read(join(PLANNER, 'js', 'requirement-scope.js')) + '\n' + read(join(PLANNER, 'js', 'tabletop-completion.js')) + '\n' + read(join(PLANNER, 'js', 'data.js')) + '\n' + read(join(PLANNER, 'js', 'app.js')));
  return { app: w.__GEN2_PLANNER_TEST__, window: w };
}

const canon = (v) => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val)) ? Object.fromEntries(Object.keys(val).sort().map((x) => [x, val[x]])) : val);

test('the ported computeBom matches the planner on the official kits and on seeded random builds with option sweeps', { skip: !havePlanner && 'planner checkout not present - pin-only' }, async (t) => {
  const { computeBom } = await import('../../js/rules/bom.js');
  const { GEN2 } = loadCatalog();
  const { app } = await bootPlanner(20261013);
  let compared = 0, mismatches = [];
  const compare = (label) => {
    const theirs = app.computeBom();
    const mine = computeBom(app.state, GEN2);
    compared++;
    const a = canon(theirs), b = canon(mine);
    if (a !== b) mismatches.push({ label, theirs: a.slice(0, 400), mine: b.slice(0, 400) });
  };
  /* 1. the official kits */
  const kits = readdirSync(join(root, 'builds')).filter((f) => f.endsWith('.json') && f !== 'index.json');
  for (const f of kits) {
    const kit = JSON.parse(read(join(root, 'builds', f)));
    app.applyBuild(kit.build);
    compare('kit ' + f);
  }
  /* 2. seeded random builds from the planner's own generator, each swept through the options */
  const N = Number(process.env.PARITY_BUILDS || 120);
  const faces = GEN2.faceplateStyles.map((s) => s.id), handles = GEN2.handleStyles.map((h) => h.id);
  for (let i = 0; i < N; i++) {
    app.surpriseMe();
    compare(`random ${i}`);
    const st = app.state;
    st.faceStyle = faces[i % faces.length]; st.handleStyle = handles[i % handles.length];
    st.backCover = i % 2 === 0; st.feet = i % 3 === 0 ? 'adhesive' : 'tpu'; st.wallStagger = i % 4 === 0;
    st.placed.forEach((p, k) => { if (p.fill === 'classic' || p.fill === 'decor') p.closure = (i + k) % 3 === 0 ? 'magnet' : 'none'; });
    st.removedStoppers = st.placed.filter((p, k) => (i + k) % 5 === 0).map((p) => `${p.id}:0`);
    compare(`random ${i} + options`);
  }
  assert.ok(compared >= kits.length + 2 * N, 'every build was compared');
  assert.deepEqual(mismatches, [], `${mismatches.length} of ${compared} comparisons differ; first: ${JSON.stringify(mismatches[0])}`);
  t.diagnostic(`${compared} builds compared, 0 mismatches`);
});

test('the ported computeBom runs under node on an official kit without the planner (pin-only path)', async () => {
  const { computeBom, bomRows } = await import('../../js/rules/bom.js');
  const { GEN2, partLinks } = loadCatalog();
  const kit = JSON.parse(read(join(root, 'builds', '185-tabletop-2w2h.json')));
  const sections = computeBom(kit.build, GEN2);
  assert.ok(Array.isArray(sections) && sections.length >= 3, 'sections come back');
  const rows = bomRows(sections, partLinks);
  assert.ok(rows.some((r) => /QuickLock/.test(r.name)), 'QuickLocks are billed');
  assert.ok(rows.every((r) => r.qty > 0), 'no zero rows');
  assert.ok(rows.some((r) => r.links && r.links.stores.length), 'rows carry store links');
});
