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
import { root, havePlanner, loadCatalog, bootPlanner, canon, kitFiles, readKit } from './lib.mjs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(p, 'utf8');

test('the ported computeBom matches the planner on the official kits and on seeded random builds with option sweeps', { skip: !havePlanner && 'planner checkout not present - pin-only' }, async (t) => {
  const { computeBom } = await import('../../js/rules/bom.js');
  const { GEN2 } = loadCatalog();
  const { app } = await bootPlanner(20261013);
  let compared = 0, mismatches = [];
  /* Where this repo's rules moved AHEAD of the old planner on purpose, dated: the ported row is compared as the old
     planner still writes it. Remove an entry when the old planner carries the change, or is retired at the cutover.
     The port's own list, which puts these edits into bom.js, is tools/port-ahead.mjs; this one holds only the ones the
     draws below reach (the per-run side covers need a gap, the toggle a record the old planner never makes).
     - 2026-10-20: the back cover row says the v2609 drawer's tear-away front comes out first (DECISIONS.md of that
       date; test/back-cover-tearaway.test.mjs pins the words). The old planner's note (app.js 5402 at 7beb165) does not. */
  const AHEAD = [
    { name: /Faceplate Back Cover/, strip: " Take the drawer's tear-away front out first - left in, it and the cover interfere." },
  ];
  const asOld = (sections) => sections.map((sec) => ({ ...sec, items: sec.items.map((it) => {
    const a = AHEAD.find((x) => x.name.test(it.name) && typeof it.note === 'string' && it.note.includes(x.strip));
    return a ? { ...it, note: it.note.replace(a.strip, '') } : it;
  }) }));
  const compare = (label) => {
    const theirs = app.computeBom();
    const mine = asOld(computeBom(app.state, GEN2) || []);
    compared++;
    const a = canon(theirs), b = canon(mine);
    if (a !== b) mismatches.push({ label, theirs: a.slice(0, 400), mine: b.slice(0, 400) });
  };
  /* 1. the official kits */
  const kits = kitFiles();
  for (const f of kits) {
    const kit = readKit(f);
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
