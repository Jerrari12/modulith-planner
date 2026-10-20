/* THE PARITY GATE FOR THE LAYOUT RULES AND THE SCHEMA (the approved merge plan, §1.5).
 *
 * js/rules/layout.js and js/rules/schema.js are the planner's own functions ported by copy (tools/port-rules.mjs).
 * This runs the PLANNER'S OWN functions in jsdom on the same records and compares: every predicate the test hook
 * exposes, the post-state of every mutator (fixStructure, fixWallTops, nudgeSelected, setMount, syncTabletopGrid
 * through refresh), the block reason as the planner renders it, and what sanitizeBuild keeps of a corrupted record.
 * Property-based, not hand-picked: the ten official kits, seeded random builds from the planner's own surpriseMe,
 * and DELIBERATELY BROKEN layouts made from them (a unit removed, a unit shifted, a wall top shrunk) so the
 * validity rules and the fixes have something to judge.
 *
 * Skips, pin-only, when the planner checkout is absent (CI); the catalog pin still guards the data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { root, havePlanner, loadCatalog, bootPlanner, canon, clone, kitFiles, readKit } from './lib.mjs';

const DEFAULT_TITLE = 'Open the 3D Build Studio · step-by-step assembly for this exact build, plus colors and hardware options';

test('the ported layout rules and schema match the planner on kits, random builds and broken layouts', { skip: !havePlanner && 'planner checkout not present - pin-only' }, async (t) => {
  const { layoutRules } = await import('../../js/rules/layout.js');
  const { sanitizeBuild, serializeBuild, buildTooNew, BUILD_FIELDS } = await import('../../js/rules/schema.js');
  const { GEN2, GEN2_TABLETOP } = loadCatalog();
  const { app, window: w, random } = await bootPlanner(20261014);
  const rnd = (n) => Math.floor(random() * n);
  let compared = 0; const mismatches = [];
  const same = (label, theirs, mine) => { compared++; const a = canon(theirs), b = canon(mine); if (a !== b) mismatches.push({ label, theirs: a.slice(0, 300), mine: b.slice(0, 300) }); };
  const mine = () => layoutRules(app.state, GEN2, { tabletop: GEN2_TABLETOP });
  const ids = (list) => [...list].map((u) => (typeof u === 'object' ? u.id : u)).sort((a, b) => a - b);
  const layoutOf = (st) => ({ gridW: st.gridW, gridH: st.gridH, placed: st.placed });
  const ALL_W = GEN2.drawerWidths, ALL_H = [...new Set([...GEN2.drawerHeights, ...GEN2.caseHeights])];

  /* 1. the pure predicates, on the live state (the same object both sides read) */
  function pure(label) {
    const st = app.state, R = mine();
    same(label + ' unsupported', ids(app.unsupportedUnits()), ids(R.unsupportedUnits()));
    same(label + ' sag', ids(app.sagRisks()), ids(R.sagRisks()));
    same(label + ' bow', ids(app.bowRisks()), ids(R.bowRisks()));
    same(label + ' wallTop', ids(app.wallTopHalfHeight()), ids(R.wallTopHalfHeight()));
    same(label + ' completion', app.tabletopCompletion(), R.tabletopCompletion());
    for (const to of ['classic', 'decor']) {
      const a = app.planConversion(to), b = R.planConversion(to);
      same(label + ' plan ' + to, { e: ids(a.eligible), s: ids(a.skipped), r: a.reasons }, { e: ids(b.eligible), s: ids(b.skipped), r: b.reasons });
    }
    for (const p of st.placed) {
      same(label + ' convert ' + p.id, [app.convertProblem(p, 'classic'), app.convertProblem(p, 'decor')], [R.convertProblem(p, 'classic'), R.convertProblem(p, 'decor')]);
      same(label + ' interior ' + p.id, [app.interiorFill(p), app.interiorComplete(p), app.interiorCellsLeft(p)], [R.interiorFill(p), R.interiorComplete(p), R.interiorCellsLeft(p)]);
    }
    for (const f of GEN2.fills) {
      same(label + ' heights ' + f.id, app.heightsForFill(f.id), R.heightsForFill(f.id));
      for (const wd of ALL_W) for (const h of ALL_H) same(label + ` sizeExists ${wd}x${h} ${f.id}`, app.sizeExists(wd, h, f.id), R.sizeExists(wd, h, f.id));
    }
    for (const wd of ALL_W) for (const h of ALL_H) same(label + ` selectable ${wd}x${h}`, app.selectable(wd, h), R.selectable(wd, h));
    for (const l of GEN2.lengths) same(label + ' mountBlocks ' + l.id, app.mountBlocksLength(l.id), R.mountBlocksLength(l.id));
    const { w: sw, h: sh } = st.selected || { w: 1, h: 1 };
    for (let y = -1; y <= st.gridH * 2; y++) for (let x = -1; x <= st.gridW; x++) {
      same(label + ` canPlace ${x},${y}`, app.canPlace(x, y, sw, sh * 2), R.canPlace(x, y, sw, sh * 2));
      if (st.placed.length) { const p = st.placed[(x + y + 2) % st.placed.length]; same(label + ` canPlaceEx ${x},${y}`, app.canPlace(x, y, p.w, p.hh, p.id), R.canPlace(x, y, p.w, p.hh, p.id)); }
    }
    // the block reason, as the planner renders it on its 3D button (instructionsBlockReason is not on the hook)
    const btn = w.document.querySelector('#instructions-3d');
    const theirs = btn && btn.title !== DEFAULT_TITLE ? btn.title : null;
    const r = R.instructionsBlockReason();
    same(label + ' block', theirs, r ? r.text : null);
  }
  /* 2. the mutators: the planner on its live state (then refresh, as its UI does), mine on a copy of the same
        state (then syncTabletopGrid, the refresh-time normalisation); compare the post-layouts and the tallies */
  function mutate(label, theirsFn, mineFn) {
    const copy = clone(app.state);
    const Rc = layoutRules(copy, GEN2, { tabletop: GEN2_TABLETOP });
    const b = mineFn(Rc, copy); Rc.syncTabletopGrid();
    const a = theirsFn(); app.refresh();
    same(label + ' result', a, b);
    same(label + ' layout', layoutOf(app.state), layoutOf(copy));
    same(label + ' nextId', app.state.nextId, copy.nextId);
  }
  function fixes(label) {
    mutate(label + ' fixStructure', () => app.fixStructure(), (R) => R.fixStructure());
    if (app.state.mount === 'wall') mutate(label + ' fixWallTops', () => app.fixWallTops(), (R) => R.fixWallTops());
    if (app.state.placed.length) {
      app.state.selectedUnit = app.state.placed[rnd(app.state.placed.length)].id;
      for (const dir of ['up', 'down', 'left', 'right']) mutate(label + ' nudge ' + dir, () => app.nudgeSelected(dir), (R) => R.nudgeSelected(dir));
    }
  }
  /* 3. the schema: the planner's applyBuild (sanitize + assign + enforceMountLength) against mine, on a record and
        on corrupted variants of it; a minted buildId is compared only when the input carried a valid one */
  function schema(label, record) {
    const variants = [['as-is', clone(record)]];
    const v1 = clone(record); v1.placed.push({ id: 7.4, x: 0, y: 0, w: 2, hh: 2, fill: 'decor' }, { id: 'x', x: 99, y: 0, w: 1, hh: 2, fill: 'decor' }, { id: 5, x: 0, y: 0, w: 0, hh: 2, fill: 'decor' }, null, { id: 6, x: 1, y: 1, w: 1, hh: 3, fill: 'cabinet' }, { id: 8, x: 0, y: 0, w: 1, hh: 2, fill: 'nope' }); variants.push(['junk units', v1]);
    const v2 = clone(record); v2.removedStoppers = ['1:0', '1:0', 'zz', '999:1', '1:9']; v2.gridW = 99; v2.gridH = -3; v2.spaceW = 5; v2.customBed = { x: 2000, y: 'a' }; v2.printer = 'nope'; v2.faceStyle = 'zzz'; v2.feet = 'x'; v2.buildPlate = 'glass'; v2.buildId = 'BAD ID'; variants.push(['junk fields', v2]);
    const v3 = clone(record); v3.placed.forEach((u, i) => { if (i % 2) u.label = '  hello world  '; u.labelBadge = i % 3 ? { type: 'icon', value: 'bad id!' } : { type: 'char', value: ' A ' }; if (u.fill === 'decor') u.variant = i % 2 ? 'gridfinity' : 'odd'; if (u.fill === 'shelf') u.lip = i % 2 ? 'both' : 'rear'; u.closure = i % 2 ? 'magnet' : 'push'; }); v3.labelStyle = { textHeight: 9999, allCaps: false, junk: 1 }; v3.labelList = { a: 1 }; v3.labelAssign = []; variants.push(['labels and options', v3]);
    const v4 = clone(record); v4.placed = v4.placed.concat(v4.placed.map((u) => ({ ...u, id: u.id + 1000 }))); v4.nextId = 3; variants.push(['overlaps and ids', v4]);
    const v5 = clone(record); v5.schema = 99; variants.push(['too new', v5]);
    for (const [name, v] of variants) {
      const tooNew = buildTooNew(v);
      const ok = app.applyBuild(clone(v));
      same(label + ' ' + name + ' accepted', ok, !tooNew);
      if (tooNew) continue;
      const d = clone(v); sanitizeBuild(d, GEN2);
      // the planner's refresh normalises with its live palette (syncTabletopGrid reads `selected`), which a load does not change
      Object.assign(d, { fill: app.state.fill, selected: clone(app.state.selected), selectedUnit: null });
      const R = layoutRules(d, GEN2, { tabletop: GEN2_TABLETOP }); R.enforceMountLength(); R.syncTabletopGrid();
      const a = serializeBuild(app.state), b = serializeBuild(d);
      const keepId = typeof v.buildId === 'string' && /^[a-z0-9]{8,32}$/.test(v.buildId);
      if (!keepId) { delete a.buildId; delete b.buildId; }
      // the planner's own fields, which the old planner never writes (schema.js BUILD_FIELDS says which): sanitize
      // gives them their default here, the old planner's state has none, and parity is about the shared fields
      for (const k of ['sideCovers']) { delete a[k]; delete b[k]; }
      same(label + ' ' + name + ' kept', a, b);
    }
  }
  const breakLayout = (k) => {
    const st = app.state; if (!st.placed.length) return;
    if (k % 3 === 0) st.placed.splice(rnd(st.placed.length), 1);                        // a support gone: unsupported, sag
    else if (k % 3 === 1) { const p = st.placed[rnd(st.placed.length)]; const nx = p.x + (rnd(2) ? 1 : -1); if (app.canPlace(nx, p.y, p.w, p.hh, p.id)) p.x = nx; }   // a shift: sag, bow
    else { const top = st.placed.filter((p) => p.y === Math.min(...st.placed.map((q) => q.y))); const p = top[rnd(top.length)]; if (p.hh === 2) { p.hh = 1; p.y += 1; } }   // a wall top shrunk
    app.refresh();
  };

  for (const f of kitFiles()) {
    const kit = readKit(f);
    app.applyBuild(clone(kit.build));
    pure('kit ' + f); fixes('kit ' + f); schema('kit ' + f, kit.build);
  }
  const N = Number(process.env.PARITY_BUILDS || 120);
  const mounts = GEN2.mounts.map((m) => m.id);
  for (let i = 0; i < N; i++) {
    app.surpriseMe();
    app.state.selected = { w: 1 + rnd(4), h: [0.5, 1, 1.5, 2, 3][rnd(5)] }; app.state.fill = GEN2.fills[rnd(GEN2.fills.length)].id; app.refresh();
    pure(`random ${i}`);
    schema(`random ${i}`, serializeBuild(app.state));
    const before = serializeBuild(app.state);
    breakLayout(i); pure(`random ${i} broken`); fixes(`random ${i} broken`);
    app.applyBuild(clone(before));
    const other = mounts[(mounts.indexOf(app.state.mount) + 1 + rnd(2)) % mounts.length];
    mutate(`random ${i} setMount ${other}`, () => app.setMount(other), (R) => R.setMount(other));
    pure(`random ${i} on ${other}`); breakLayout(i + 1); pure(`random ${i} on ${other} broken`); fixes(`random ${i} on ${other} broken`);
  }
  assert.ok(compared > 1000, 'the gate compared something: ' + compared);
  assert.deepEqual(mismatches, [], `${mismatches.length} of ${compared} comparisons differ; first: ${JSON.stringify(mismatches[0])}`);
  t.diagnostic(`${compared} comparisons, 0 mismatches`);
});

test('the ported rules run under node on an official kit without the planner (pin-only path)', async () => {
  const { layoutRules } = await import('../../js/rules/layout.js');
  const { sanitizeBuild, serializeBuild, BUILD_FIELDS } = await import('../../js/rules/schema.js');
  const { GEN2, GEN2_TABLETOP } = loadCatalog();
  const d = clone(readKit('185-tabletop-2w2h.json').build);
  assert.equal(sanitizeBuild(d, GEN2), 0, 'nothing dropped from an official kit');
  const R = layoutRules({ ...d, fill: 'decor', selected: { w: 1, h: 1 }, selectedUnit: null }, GEN2, { tabletop: GEN2_TABLETOP });
  assert.equal(R.unsupportedUnits().length, 0); assert.equal(R.instructionsBlockReason(), null); assert.ok(R.tabletopCompletion().complete);
  assert.deepEqual(Object.keys(serializeBuild(d)), BUILD_FIELDS);
});
