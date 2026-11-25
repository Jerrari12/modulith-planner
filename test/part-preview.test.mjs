/* The ?part= product-preview resolver, swept against the REAL site catalog.

   The MODULITH site embeds this viewer per part page (?part=<slug>&mode=preview)
   and its /parts/ slugs are frozen by URL permanence — so this suite enumerates
   test/site-slugs.json, a vendored copy of the site's production search index
   (deliberately NOT re-derived from the same grammar the resolver parses: the
   list is the independent authority; 2026-08-19 design review). It asserts:

   1. Every production slug is ACCOUNTED FOR — resolves to a preview, or fails
      with the intended 'unsupported' reason. 'unknown-part' on a production
      slug means the resolver's grammar drifted from the site's tokenizer.
   2. Every resolved preview's GLB exists in its collection pool — the exact
      condition that used to hang the app (see parts-exist.test.mjs).
   3. The full catalog output matches test/golden/part-previews.json — the
      official-kits durability mechanism applied to product pages: a generator
      change (tiling, BOM grouping, node renames) that alters ANY preview fails
      here as a reviewable diff instead of silently changing a permanent
      product page. Intentional changes refresh via UPDATE_GOLDEN=1 npm test.
   4. Preview manifests are CANONICAL: exactly one part row, one instance at
      the origin with no assembly context (pos/stage/rides/yaw/rot), and a
      palette entry for the part's type.

   Pure node — no browser, no packages. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { resolvePartPreview, generateManifest } = await import(
  new URL('file://' + join(root, 'js', 'generate.js').replace(/\\/g, '/')).href
);

const SLUGS = JSON.parse(readFileSync(join(root, 'test', 'site-slugs.json'), 'utf8')).slugs;
const GOLDEN_PATH = join(root, 'test', 'golden', 'part-previews.json');
const glbExists = (L, node) => existsSync(join(root, 'parts', String(L), node + '.lib.glb'));

/* Families with no 3D model ON PURPOSE (the site keeps its static poster):
   QuickLock B and the 6x2 magnet insert.
   ⚠ CASE EXTENDERS LEFT THIS LIST 2026-08-29 — all 24 GLBs landed and 22 now
   preview. The two that stay unsupported are 59-3W and 59-4W, and NOT for want
   of a model: their GLBs exist in the library, but the 59's cases stop at 2W in
   both tools, so there is no 59-3W case for the ring to stack on and the probe
   errors honestly. They are deliberately not copied into `parts/59/`,
   exactly like the 59-3W/4W shelf inserts.
   The filament sample chip (2026-11-07) joins them: its GLB exists, but no build
   places a chip yet, so no probe can pick one. And its title pieces (2026-11-08):
   a set that ships as 3MFs, with no GLB at all.
   The cabinet door parts left this list in two steps: the 96 doors on 2026-11-23
   (a one-cabinet probe picks each door out by its exact node), and the door
   hardware on 2026-11-24 (the handed hinges and latches and the two knobs, picked
   out of the same probe). */
const expectUnsupported = s =>
  /^59-case-extender-[34]w-1h$/.test(s) ||
  /^(magnet-insert-6x2mm|quicklock-b-bi-directional-optional|filament-sample-chip|filament-sample-chip-title-pieces)$/.test(s);

// resolve the whole catalog once — every test reads from this
const resolved = new Map();
for (const s of SLUGS) resolved.set(s, resolvePartPreview(s));

test('every production slug is accounted for — resolved or intentionally unsupported', () => {
  const unknown = [], wrongBucket = [];
  let supported = 0, unsupported = 0;
  for (const [s, r] of resolved) {
    if (r.fail?.reason === 'unknown-part') { unknown.push(s); continue; }
    if (r.fail) {
      unsupported++;
      if (!expectUnsupported(s)) wrongBucket.push(`${s} → unsupported (${r.fail.message})`);
    } else {
      supported++;
      if (expectUnsupported(s)) wrongBucket.push(`${s} → resolved but should be unsupported`);
    }
  }
  assert.deepEqual(unknown, [], 'production slugs the resolver does not recognize (grammar drift)');
  assert.deepEqual(wrongBucket, [], 'slugs in the wrong support bucket');
  // 2026-08-29: +22 case extenders (465 → 487); 26 → 4 unsupported
  // 2026-08-30: +22 shelf inserts +4 shelf lips (487 → 513) - the site catalog
  // gained the released shelves, and every one previews (GLBs landed 08-29)
  // 2026-09-19: +60 Gridfinity Decor drawers (513 → 573) - their GLBs shipped
  // with the viewer's 2026-09-18 deploy, so every one previews
  // 2026-09-19: +9 handles (573 → 582) - the nine bolt-on handle variants become
  // nine product pages; the GLBs have shipped in every collection pool since 2026-07-20
  // 2026-10-29: +27 side covers (582 → 609) - released 2026-10-10, GLBs in every collection pool since the stage
  // drew them (2026-10-17); the site mints their part pages once this manifest carries them
  // 2026-11-07: +12 Filament Sample Chip Drawers (609 → 621), the chip unsupported (4 → 5) - not released; the GLBs are on
  // gen2-parts branch chip-drawers, so the deploy that carries these pages publishes gen2-parts first
  // 2026-11-08: the chip's title pieces, unsupported (5 → 6): a 3MF set, no GLB
  // 2026-11-20: the 102 coming-soon cabinet parts, unsupported (6 → 108): 96 doors, 2 hinges, 2 latches, 2 knobs
  // 2026-11-23: +96 cabinet doors (621 → 717; 108 → 12), 48 Essential and 48 Chevron, both hands, picked out of a
  // one-cabinet probe; the 6 hardware parts stay unsupported
  // 2026-11-24: +6 cabinet door hardware (717 → 723; 12 → 6), the two hinges, two latches and two knobs, out of the same probe
  assert.equal(supported, 723, 'supported preview count');
  assert.equal(unsupported, 6, 'intentionally-unsupported (59-3W/4W extenders + 2 no-GLB hardware + the chip + its title pieces)');
});

/* The cabinet doors (2026-11-23): each of the 96 pages previews its own door - the style, the size and the hand its slug
   names - alone, with none of the cabinet's hardware. The probe demands the node back; this reads it from the slug. */
test('a cabinet door page previews that door: its style, size and hand, and nothing else', () => {
  const doors = [...resolved].filter(([s]) => /-cabinet-door-/.test(s));
  assert.equal(doors.length, 96, 'the site lists 96 cabinet doors');
  const bad = [];
  for (const [s, r] of doors) {
    const m = /^(essential|chevron)-cabinet-door-([1-4])w-([1-6])h(-right-hinged)?$/.exec(s);
    const want = `Door_${m[1] === 'essential' ? 'Essential' : 'Chevron'}_${m[2]}W-${m[3]}H${m[4] ? '_RH' : ''}`;
    if (r.fail) { bad.push(`${s}: ${r.fail.message}`); continue; }
    if (r.part.node !== want) bad.push(`${s}: ${r.part.node}, not ${want}`);
    if (r.manifest.instances.length !== 1 || r.manifest.parts.length !== 1) bad.push(`${s}: more than the door`);
    if (!r.part.platePreview) bad.push(`${s}: no print view`);
  }
  assert.deepEqual(bad, []);
});

/* The cabinet door hardware (2026-11-24): each page previews its whole product as installed, the door shut, and nothing
   else. A hinge is its body and the claws billed on it, a latch its side clip and door clip (a left-hinged door takes
   the R pair), a knob is mounted on the 1H door it rides. Each offset is checked against a real 1W-1H cabinet of that
   hand, so the preview cannot drift from the build; the golden pins the numbers. None has a confirmed print pose, so
   none has a print view. */
test('a cabinet hardware page previews that product as installed: its pieces, in its hand, and nothing else', () => {
  const hw = [...resolved].filter(([s]) => /^((cabinet-hinge|door-latch)-(left|right)-hinged-door|(deco|blockbar)-knob)$/.test(s));
  assert.equal(hw.length, 6, 'the site lists 2 hinges, 2 latches and 2 knobs');
  const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  // where `b` sits from `a` in a real cabinet of this hand and knob style: the only placement a preview may show
  const installed = (R, a, b, handleStyle = 'deco') => {
    const ins = generateManifest({ mount: 'wall', length: 185, gridH: 1, doorStyle: 'essential', handleStyle,
      placed: [{ id: 'u1', x: 0, y: 0, w: 1, hh: 2, fill: 'cabinet', ...(R ? { hinge: 'right' } : {}) }] }).manifest.instances;
    const [pa, pb] = [a, b].map(n => ins.filter(i => i.node === n));
    assert.ok(pa.length === 1 && pb.length === 1, `${a} and ${b} once each in a 1H cabinet`);
    return pb[0].pos.map((v, i) => v - pa[0].pos[i]);
  };
  // on a door's own page the face is the subject and keeps the poster orange
  const door = resolved.get('essential-cabinet-door-1w-1h').manifest.colors;
  assert.notEqual(door['Faceplate:FACE'], door.Faceplate, 'a door page keeps its orange face');
  for (const [s, r] of hw) {
    assert.ok(!r.fail, `${s}: ${r.fail?.message}`);
    const ins = r.manifest.instances, m = /^(cabinet-hinge|door-latch)-(left|right)/.exec(s);
    assert.equal(r.part.platePreview, false, s + ': no confirmed print pose');
    assert.equal(resolvePartPreview(s, { plate: true }).fail?.reason, 'unsupported', s + ': the print view fails closed');
    if (m) {
      const R = m[2] === 'right';
      const [a, b, rows] = m[1] === 'cabinet-hinge'
        ? [`CabinetHinge_Body_${R ? 'R' : 'L'}`, `CabinetHinge_Claws_${R ? 'R' : 'L'}`, 1]
        : [`CabinetLatch_Side_${R ? 'L' : 'R'}`, `CabinetLatch_Door_${R ? 'L' : 'R'}`, 2];
      assert.deepEqual(ins.map(i => i.node), [a, b], s + ': the pieces of the product, primary first');
      assert.deepEqual(r.part.assembled, [b], s + ': the second piece is the product, not context');
      assert.ok(near(ins[1].pos, installed(R, a, b)), `${s}: ${b} as installed, at ${ins[1].pos}`);
      // the hinge's claws have no row (billed on the body) and are typed by their instance; the latch bills both clips
      assert.equal(r.manifest.parts.length, rows, s + ': rows');
      if (rows === 1) assert.equal(ins[1].type, 'CabinetHinge', s + ': the claws are typed for the viewer');
    } else {
      const [k, knob] = s.startsWith('deco') ? ['deco', 'Knob_Deco'] : ['blockbar', 'Knob_BlockBar'];
      assert.deepEqual(ins.map(i => i.node), [knob, 'Door_Essential_1W-1H'], s + ': the knob, on its door');
      assert.ok(near(ins[1].pos, installed(false, knob, 'Door_Essential_1W-1H', k)), `${s}: the door where the knob is fitted to it`);
      assert.equal(r.manifest.parts.length, 2, s + ': the knob and its door, not the screw');
      // the door is context: its FACE zone wears the door's dark body hue, and only the knob is orange
      const c = r.manifest.colors;
      assert.equal(c['Faceplate:FACE'], c.Faceplate, s + ': the door face reads as context');
      assert.notEqual(c.Handle, c.Faceplate, s + ': the knob is the subject');
      assert.deepEqual(r.part.context, ['Door_Essential_1W-1H'], s + ': the door is context');
      assert.equal(r.manifest.previewFocus, 'p0', s + ': framed on the knob');
    }
  }
});

test('every resolved preview references GLBs that exist in its collection pool', () => {
  const missing = [];
  for (const [s, r] of resolved) {
    if (r.fail) continue;
    for (const i of r.manifest.instances)
      if (!glbExists(r.manifest.collection, i.node))
        missing.push(`${s} → parts/${r.manifest.collection}/${i.node}.lib.glb`);
  }
  assert.deepEqual(missing, [], 'preview GLBs missing from the library');
});

test('preview manifests are canonical: primary at the origin, no assembly context', () => {
  const bad = [];
  for (const [s, r] of resolved) {
    if (r.fail) continue;
    const m = r.manifest;
    if (r.part.set) {
      // a handed SET: both bodies, symmetric about the origin at the STL's
      // own spacing, pure GLB pose (no assembly fields, no rot off-plate)
      if (m.parts.length !== r.part.set.length || m.instances.length !== r.part.set.length) bad.push(`${s}: set row/instance count`);
      const xs = m.instances.map(i => i.pos[0]);
      if (Math.abs(xs.reduce((a, b) => a + b, 0)) > 1e-9) bad.push(`${s}: set not centered (${xs})`);
      if (m.instances.some(i => i.pos[1] !== 0 || i.pos[2] !== 0)) bad.push(`${s}: set body off the ground line`);
      for (const i of m.instances)
        for (const k of ['stage', 'rides', 'owner', 'stopperKey', 'yaw', 'rot'])
          if (k in i) bad.push(`${s}: set body carries "${k}"`);
    } else {
      // a primary can be accompanied two ways, and they are DIFFERENT CLAIMS:
      // `extras` is dressing that ships in the same download (EdgeLabel /
      // Classic Pro), `context` is the plate a HANDLE is shown mounted on and
      // is not in the handle's download at all. Same geometry rules, so they
      // are counted together and asserted apart.
      // `assembled` is a third claim (2026-11-24): the other pieces of the product itself - a cabinet hinge's claws, a
      // latch's door clip. A piece with no row of its own (the claws, billed on the body) adds an instance and no row.
      const nExtras = r.part.extras?.length || 0, nContext = r.part.context?.length || 0;
      const nAssembled = r.part.assembled?.length || 0;
      const nWith = nExtras + nContext + nAssembled;
      const rowless = m.instances.filter(i => !m.parts.some(p => p.node === i.node));
      if (rowless.some(i => !r.part.assembled?.includes(i.node) || !i.type)) bad.push(`${s}: an untyped or unclaimed model with no row`);
      if (m.parts.length !== 1 + nWith - rowless.length || m.parts.some(p => !p || p.qty !== 1)) bad.push(`${s}: parts rows`);
      if (m.instances.length !== 1 + nWith) bad.push(`${s}: instance count`);
      const [prim, ...companions] = m.instances;
      if (prim.pos.join() !== '0,0,0') bad.push(`${s}: primary pos ${prim.pos}`);
      // primaries are pure GLB pose; companions keep primary-relative pos and a
      // corrective rot (the accent's flip) — but NEVER assembly bookkeeping
      for (const k of ['stage', 'rides', 'owner', 'stopperKey', 'yaw', 'rot'])
        if (k in prim) bad.push(`${s}: primary carries assembly field "${k}"`);
      for (const x of companions)
        for (const k of ['stage', 'rides', 'owner', 'stopperKey', 'yaw'])
          if (k in x) bad.push(`${s}: companion ${x.node} carries assembly field "${k}"`);
      // extras only ever dress faceplates, and only the two extras families;
      // context only ever mounts a handle, and never both on one part
      if (nExtras && (m.parts[0].type !== 'Faceplate')) bad.push(`${s}: extras on a non-faceplate`);
      if (nContext && (m.parts[0].type !== 'Handle')) bad.push(`${s}: mounted context on a non-handle`);
      if ([nExtras, nContext, nAssembled].filter(Boolean).length > 1) bad.push(`${s}: more than one kind of companion`);
      if (nAssembled && m.parts.some(p => p.type !== m.parts[0].type)) bad.push(`${s}: a set piece of another type`);
      // a focus is a framing claim and only a mounted preview has one to make
      if ((m.previewFocus === 'p0') !== (nContext > 0)) bad.push(`${s}: previewFocus ${m.previewFocus}`);
    }
    if (m.parts.some(p => !p || p.qty !== 1)) bad.push(`${s}: parts qty`);
    if (m.mount !== 'tabletop') bad.push(`${s}: mount ${m.mount}`);
    if (m.parts.some(p => !m.colors[p.type])) bad.push(`${s}: missing palette entry`);
    if (m.steps.length !== 1) bad.push(`${s}: step count`);
    // every instance must enter in the single step, or applyState(0) hides it
    const entered = new Set(m.steps[0].phases.flatMap(ph => (ph.enter || []).map(e => e.id)));
    if (m.instances.some(i => !entered.has(i.id))) bad.push(`${s}: instance never enters`);
  }
  assert.deepEqual(bad, [], 'non-canonical preview manifests');
});

test('extras families preview dressed — label always, accent above 0.5H', () => {
  const x = s => resolved.get(s).part.extras || [];
  assert.deepEqual(x('edgelabel-faceplate-2w-1h').sort(),
    ['Accent_EdgeLabel_2W-1H', 'Label_EdgeLabel'], 'EdgeLabel 1H carries accent + label');
  assert.deepEqual(x('edgelabel-faceplate-1w-0-5h'), ['Label_EdgeLabel'], '0.5H has no accent by design');
  assert.deepEqual(x('classicpro-faceplate-2w-1h').sort(),
    ['Accent_EdgeLabel_2W-1H', 'Label_ClassicPro'], 'Classic Pro shares the EdgeLabel accents');
  assert.deepEqual(x('essential-faceplate-2w-1h'), [], 'Essential is a bare plate');
  assert.deepEqual(x('chevron-faceplate-2w-1h'), [], 'Chevron is a bare plate');
  assert.deepEqual(x('classic-faceplate-2w-1h'), [], 'Classic is a bare plate');
});

test('catalog output matches the golden snapshot (UPDATE_GOLDEN=1 to refresh)', () => {
  // slug → the fields a product page depends on. Node + collection are the
  // load-bearing pair (they name the GLB a permanent URL will show forever);
  // label/type ride along so a wording change is also a visible diff.
  const now = {};
  for (const [s, r] of resolved) {
    now[s] = r.fail
      ? { unsupported: r.fail.reason }
      : { node: r.part.node, collection: r.manifest.collection, type: r.part.type, label: r.part.label,
          platePreview: !!r.part.platePreview,
          // dressed previews pin the extras' plate-relative GEOMETRY too — the
          // canonical test already constrains bare previews to identity-at-
          // origin, but a generator offset change could silently move the
          // EdgeLabel/ClassicPro dressing while a membership-only golden
          // stayed green (review catch, 2026-08-19). A MOUNTED preview is the
          // same exposure: the handle's plate sits at a generator-derived
          // offset, so its seat is pinned here too.
          ...(r.part.extras || r.part.context || r.part.assembled ? { instances: r.manifest.instances } : {}) };
  }
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(GOLDEN_PATH, JSON.stringify(now, null, 2) + '\n');
    return;
  }
  assert.ok(existsSync(GOLDEN_PATH), 'golden missing — run UPDATE_GOLDEN=1 npm test once');
  assert.deepEqual(now, JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')),
    'a generator change altered a product-page preview — review the diff, then UPDATE_GOLDEN=1 npm test if intended');
});

test('the deployed support manifest matches the resolver (UPDATE_GOLDEN=1 to refresh)', () => {
  // part-preview-support.json is the VIEWER-OWNED capability artifact
  // the MODULITH site vendors (data/sources/) so its build only offers a 3D
  // button where a preview actually exists — one authority, no doomed iframes,
  // and cross-repo drift fails a gate instead of accumulating silently
  // (2026-08-19 integration review). Deployed with the viewer, so the live
  // copy is inspectable at /part-preview-support.json. Deliberately carries
  // NO node names — those are internal, and the site must never learn them.
  const SUPPORT_PATH = join(root, 'part-preview-support.json');
  const parts = {};
  for (const [s, r] of resolved)
    parts[s] = r.fail
      ? { preview: false, reason: r.fail.message }
      : { preview: true, platePreview: !!r.part.platePreview }; // plate = confirmed print pose only
  const now = { v: 1, source: 'MODULITH search-index v2608', parts };
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(SUPPORT_PATH, JSON.stringify(now, null, 2) + '\n');
    return;
  }
  assert.ok(existsSync(SUPPORT_PATH), 'support manifest missing — run UPDATE_GOLDEN=1 npm test once');
  assert.deepEqual(JSON.parse(readFileSync(SUPPORT_PATH, 'utf8')), now,
    'part-preview-support.json is stale — UPDATE_GOLDEN=1 npm test, then re-vendor it into the MODULITH site');
});

test('plate view: confirmed print poses only, bare primary, fail-closed elsewhere', () => {
  // Joey's 2026-08-19 confirmations — the ONLY families with a plate view:
  // cases + both drawer fills print as-authored; integrated-grip faceplates
  // (EdgeLabel/Classic/Classic Pro) print back-down (grip up); Essential and
  // Chevron print face-down (build-plate texture transfers onto the face).
  const rot = s => resolvePartPreview(s, { plate: true }).manifest?.instances[0].rot;
  assert.deepEqual(rot('edgelabel-faceplate-2w-1h'), [-90, 0, 0], 'EdgeLabel prints back-down');
  assert.deepEqual(rot('classic-faceplate-2w-1h'), [-90, 0, 0], 'Classic prints back-down');
  assert.deepEqual(rot('classicpro-faceplate-2w-1h'), [-90, 0, 0], 'Classic Pro prints back-down');
  assert.deepEqual(rot('essential-faceplate-2w-1h'), [90, 0, 0], 'Essential prints face-down');
  assert.deepEqual(rot('chevron-faceplate-2w-1h'), [90, 0, 0], 'Chevron prints face-down');
  assert.equal(rot('185-case-2w-1h'), undefined, 'cases print as authored — no rotation');
  assert.equal(rot('270-classic-drawer-1w-1h'), undefined, 'drawers print as authored');
  // Joey's 2026-08-31 confirmations, in his installed-orientation language:
  // CL and both foot rails sit in the finished tabletop build exactly as
  // they print (as authored); the Cover Upper's INSTALLED TOP prints against
  // the plate (sheet finish on the visible face), so it flips.
  assert.deepEqual(rot('185-cover-upper-1w'), [180, 0, 0], 'cover upper prints installed-top-down');
  assert.equal(rot('185-cover-lower-2w'), undefined, 'cover lower prints as authored');
  assert.equal(rot('270-foot-rail-upper-1w'), undefined, 'foot rail upper prints as authored');
  assert.equal(rot('115-foot-rail-lower-2w'), undefined, 'foot rail lower prints as authored');
  // Joey's 2026-08-31 second group: rails "print top down of a build plate,
  // the top being the side that makes contact with the underside of the
  // table" - installed they hang that face UP, so they flip. Extenders
  // print "same as a case": as authored.
  assert.deepEqual(rot('115-under-table-rail-2w'), [180, 0, 0], 'under-table rail prints table-contact-face down');
  assert.equal(rot('185-case-extender-1w-1h'), undefined, 'case extender prints as a case does');
  // Joey's 2026-08-31 third group: "shelves in the final build, print top
  // down onto the build plate, same with the shelf lips"; back covers put
  // "the side facing towards the back of the build" on the plate - the
  // faceplate back-down swing, so the clip tabs face up.
  assert.deepEqual(rot('185-shelf-insert-2w'), [180, 0, 0], 'shelf insert prints top down');
  assert.deepEqual(rot('shelf-lip-2w'), [180, 0, 0], 'shelf lip prints top down');
  assert.deepEqual(rot('faceplate-back-cover-2w-1h'), [-90, 0, 0], 'back cover prints rear-face down');
  // Joey's 2026-08-31 final confirmation: "the side that faces back that
  // makes contact with the wall, that back side prints face down on the bed
  // for all wall mount brackets" - the back-cover swing, wall face to sheet.
  assert.deepEqual(rot('wall-mount-bracket-2w'), [-90, 0, 0], 'wall bracket prints wall-face down');
  // Joey's 2026-11-20 confirmation: "The essential and Chevron doors will print face down only". A door is billed as a
  // 'Faceplate' row, so its pose must come from the door's own material type ('Door', PLATE_POSE 'door:<style>'), not
  // from a faceplate family: the probe names no faceplate family, so read as a faceplate it would have no pose at all
  for (const s of ['essential-cabinet-door-1w-1h', 'essential-cabinet-door-4w-6h-right-hinged',
                   'chevron-cabinet-door-2w-3h', 'chevron-cabinet-door-3w-5h-right-hinged'])
    assert.deepEqual(rot(s), [90, 0, 0], `${s} prints face down`);
  // the plate shows the BARE print body — dressed extras have no confirmed
  // individual print pose or plate arrangement yet
  const p = resolvePartPreview('edgelabel-faceplate-2w-1h', { plate: true });
  assert.equal(p.manifest.instances.length, 1, 'plate view is the primary alone');
  assert.equal(p.manifest.platePose, true);
  // hardware poses (2026-08-20): the pair prints together and BOTH hands ride
  // the plate — unlike dressing extras, the second hand IS the same print job.
  // The QuickLock hands are CHIRAL twins, so their corrective rotations MIRROR
  // (Rz+90 / Rz−90) — one shared rotation laid R on its snap tab, caught by
  // Joey's live check on the deployed page
  assert.deepEqual(rot('quicklock-a-v1-11'), [0, 0, 90], 'QuickLock L prints flat (thickness off X)');
  assert.deepEqual(rot('drawer-stoppers'), [180, 0, 0], 'stoppers flip to their print face (Joey plate check)');
  assert.deepEqual(rot('magnet-insert-10x2mm'), [90, 0, 0], 'clip prints flat (thickness off Z)');
  assert.equal(rot('tpu-foot'), undefined, 'foot prints upright as authored');
  const qlPlate = resolvePartPreview('quicklock-a-v1-11', { plate: true });
  assert.equal(qlPlate.manifest.instances.length, 2, 'a pair plate shows both hands');
  assert.deepEqual(Object.fromEntries(qlPlate.manifest.instances.map(i => [i.node, i.rot])),
    { 'QuickLock-L': [0, 0, 90], 'QuickLock-R': [0, 0, -90] }, 'chiral hands wear MIRRORED print poses');
  // fail closed on anything without a confirmed pose
  // 2026-08-31: the bracket confirmation COMPLETED the register, and for three
  // weeks the fail-closed sweep had no honest subject. THE HANDLES GAVE IT ONE
  // (2026-09-19): Joey confirmed the DECO handle's pose on 2026-09-14 and no
  // other handle family's, and BlockBar B's on 2026-11-01, so seven of the nine handle
  // pages ship turntable-only - the mechanism working on live slugs, not a spare part. Named one by one
  // rather than counted, because which slugs are plate-less is the claim.
  // The cabinet door hardware joined them on 2026-11-24 (3D only): the knowledge pack has words for how the hinge
  // and latch print ("as supplied", the hinge's claws laid flat beside its body), but not as a pose of these models,
  // and none for the knobs.
  const caps = [...resolved.values()].filter(r => !r.fail);
  assert.deepEqual(
    [...resolved].filter(([, r]) => !r.fail && !r.part.platePreview).map(([s]) => s).sort(),
    ['blockbar-handle-a', 'blockbar-handle-c', 'blockbar-handle-d',
     'blockbar-handle-e', 'blockbar-handle-f', 'blockbar-knob',
     'cabinet-hinge-left-hinged-door', 'cabinet-hinge-right-hinged-door',
     'crystal-handle-a', 'crystal-handle-b-wide', 'deco-knob',
     'door-latch-left-hinged-door', 'door-latch-right-hinged-door'],
    'the slugs with no confirmed print pose - the other BlockBar and Crystal handles, and the cabinet door hardware');
  // full census: 94 cases + 94 classic + 94 decor + 60 Gridfinity decor + 90
  // faceplates + 4 hardware + 24 covers + 20 foot rails + 24 under-table rails
  // + 22 case extenders + 22 shelf inserts + 4 shelf lips + 18 back covers + 3
  // wall brackets + 1 Deco handle + 1 BlockBar B + 27 side covers (face-down, the plateRot entry's release notes)
  // + 12 chip drawers (floor-down as exported, the standard drawer's pose)
  // + 96 cabinet doors (face down, the door's own pose; 2026-11-23)
  assert.equal(caps.filter(r => r.part.platePreview).length, 710, 'plate-capable slug count');

  // sweep EVERY plate-capable slug's plate boot (not just samples): the bare
  // print JOB (one body, or every member of a handed set), rotations matching
  // the confirmed pose
  const expectRot = (s, node) =>
    /-faceplate-/.test(s)
      ? (/^(essential|chevron)-/.test(s) ? [90, 0, 0] : [-90, 0, 0])
      : s === 'quicklock-a-v1-11' ? (node === 'QuickLock-L' ? [0, 0, 90] : [0, 0, -90])
      : s === 'drawer-stoppers' ? [180, 0, 0]
      : s === 'magnet-insert-10x2mm' ? [90, 0, 0]
      : /-cover-upper-/.test(s) ? [180, 0, 0]
      : /-under-table-rail-/.test(s) ? [180, 0, 0]
      : /-shelf-insert-|^shelf-lip-/.test(s) ? [180, 0, 0]
      : /^faceplate-back-cover-|^wall-mount-bracket-/.test(s) ? [-90, 0, 0]
      : s === 'deco-handle' ? [180, 0, 0]
      : s === 'blockbar-handle-b' ? [90, 0, 0]
      : /-side-cover-/.test(s) ? [0, 0, 90]
      : /-cabinet-door-/.test(s) ? [90, 0, 0]
      : undefined;
  for (const [s, r] of resolved) {
    if (r.fail || !r.part.platePreview) continue;
    const pb = resolvePartPreview(s, { plate: true });
    assert.ok(!pb.fail, s + ': plate boot must resolve');
    assert.equal(pb.manifest.instances.length, (r.part.set || [1]).length, s + ': plate boot is the bare print job');
    for (const i of pb.manifest.instances)
      assert.deepEqual(i.rot, expectRot(s, i.node), s + ': confirmed pose');
  }
});

test('hardware sets: exact membership, STL-authored layout, footprint law', async () => {
  const { worldExtents } = await import('./lib/glb-spans.mjs');
  // membership is exact and by node, never row order
  assert.deepEqual(resolved.get('quicklock-a-v1-11').part.set, ['QuickLock-L', 'QuickLock-R']);
  assert.deepEqual(resolved.get('drawer-stoppers').part.set, ['Drawer_Stoppers_L', 'Drawer_Stoppers_R']);
  assert.equal(resolved.get('magnet-insert-10x2mm').part.set, undefined, 'a single clip is not a set');
  assert.equal(resolved.get('tpu-foot').part.set, undefined);
  // composite product labels, not one hand's name
  assert.equal(resolved.get('quicklock-a-v1-11').part.label, 'QuickLock (Left + Right)');
  assert.equal(resolved.get('drawer-stoppers').part.label, 'Drawer Stoppers (Left + Right)');
  // the two library gaps stay honestly unsupported
  for (const s of ['quicklock-b-bi-directional-optional', 'magnet-insert-6x2mm']) {
    assert.equal(resolved.get(s).fail.reason, 'unsupported');
    assert.match(resolved.get(s).fail.message, /3D model/);
  }
  // THE FOOTPRINT LAW, judged on the RESOLVED OUTCOME: rotate each body's
  // MEASURED extents through its resolver-assigned pose, place it at its
  // resolver-assigned position, and assert the union footprint equals the
  // STL's within 0.5mm. The first version of this law did arithmetic on the
  // baked constants and stayed green while the chirality fix silently
  // widened the pair to a ~25mm gap (bottom-anchored GLBs: a ±90° swing
  // displaces the body center by half its width) - Joey caught it on the
  // live plate. Outcomes, not intentions.
  const rotExtents = ({ lo, hi }, rot) => {
    // exact extent mapping for the rotations HARDWARE_PREVIEW uses - a new
    // pose must extend this consciously. Signs matter: they are what caught
    // the anchor-displacement bug.
    const key = (rot || []).join();
    if (key === '') return { x: [lo[0], hi[0]], z: [lo[2], hi[2]] };
    if (key === '0,0,90') return { x: [-hi[1], -lo[1]], z: [lo[2], hi[2]] };  // x' = -y
    if (key === '0,0,-90') return { x: [lo[1], hi[1]], z: [lo[2], hi[2]] };   // x' = +y
    if (key === '90,0,0') return { x: [lo[0], hi[0]], z: [lo[1], hi[1]] };    // z' = +y
    if (key === '180,0,0') return { x: [lo[0], hi[0]], z: [-hi[2], -lo[2]] }; // z' = -z (face flip)
    assert.fail('unmapped plate rotation ' + key);
  };
  const STL_FOOTPRINT = {
    'quicklock-a-v1-11': [48.41, 18.42],
    'drawer-stoppers': [45.18, 28.0],
    'magnet-insert-10x2mm': [19.82, 20.0],
    'tpu-foot': [20.6, 20.6],
  };
  for (const [slug, stl] of Object.entries(STL_FOOTPRINT)) {
    const pb = resolvePartPreview(slug, { plate: true });
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const inst of pb.manifest.instances) {
      const ext = worldExtents(join(root, 'parts', '185', inst.node + '.lib.glb'));
      const r = rotExtents(ext, inst.rot);
      x0 = Math.min(x0, inst.pos[0] + r.x[0]); x1 = Math.max(x1, inst.pos[0] + r.x[1]);
      z0 = Math.min(z0, inst.pos[2] + r.z[0]); z1 = Math.max(z1, inst.pos[2] + r.z[1]);
    }
    assert.ok(Math.abs((x1 - x0) - stl[0]) <= 0.5,
      `${slug}: resolved plate footprint width ${(x1 - x0).toFixed(2)} must match the STL's ${stl[0]}`);
    assert.ok(Math.abs((z1 - z0) - stl[1]) <= 0.5,
      `${slug}: resolved plate footprint depth ${(z1 - z0).toFixed(2)} must match the STL's ${stl[1]}`);
  }
});

test('failure modes are typed correctly', () => {
  assert.equal(resolvePartPreview('garbage-slug').fail.reason, 'unknown-part');
  assert.equal(resolvePartPreview('').fail.reason, 'unknown-part');
  assert.equal(resolvePartPreview(null).fail.reason, 'unknown-part');
  // recognized grammar, impossible catalog entries → the GENERATOR's own caps
  // reject them with its real messages
  assert.equal(resolvePartPreview('59-case-4w-1h').fail.reason, 'unsupported');
  assert.match(resolvePartPreview('59-case-4w-1h').fail.message, /59 collection/);
  assert.equal(resolvePartPreview('185-case-3w-3h').fail.reason, 'unsupported');
  // 59 is hanging-only → its foot-rail probe (tabletop) must fail, not resolve
  assert.equal(resolvePartPreview('59-foot-rail-lower-1w').fail.reason, 'unsupported');
  // case sanity: the resolver lowercases, so a shouty URL still resolves
  assert.equal(resolvePartPreview('185-CASE-2W-1H').fail, undefined);
});

test('a Gridfinity page previews the Gridfinity body - never the standard drawer it swaps for', () => {
  // the variant's whole risk: outside the family the generator KEEPS
  // `variant: 'gridfinity'` and renders the standard Decor drawer, so a
  // resolver that trusted the type pick alone would show a Decor drawer on a
  // Gridfinity page and every assertion about "resolves" would still pass
  for (const L of [115, 165, 185, 240, 270])
    for (const w of [1, 2, 3, 4])
      for (const [tok, H] of [['1', '1'], ['1-5', '15'], ['2', '2']]) {
        const s = `${L}-gridfinity-decor-drawer-${w}w-${tok}h`;
        const r = resolved.get(s);
        assert.ok(r && !r.fail, s + ': must resolve');
        assert.equal(r.part.node, `GridfinityDecorDrawer_${L}-${w}W-${H}H`, s);
        assert.equal(String(r.manifest.collection), String(L), s + ': collection');
        assert.equal(r.part.type, 'Drawer', s + ': rides the Decor drawer type');
        // same size, standard page: still the standard body
        const std = resolvePartPreview(`${L}-decor-drawer-${w}w-${tok}h`);
        assert.equal(std.part.node, `DecorDrawer_${L}-${w}W-${H}H`, s + ': the standard page is untouched');
      }
  // plate: the Decor drawer's pose, as authored (all 60 STLs export upright)
  const p = resolvePartPreview('185-gridfinity-decor-drawer-2w-1-5h', { plate: true });
  assert.equal(p.manifest.instances.length, 1);
  assert.equal(p.manifest.instances[0].rot, undefined, 'prints upright as authored, like the Decor drawer');
  // grammar the site could mint, sizes the family does not have: fail CLOSED
  // with a message, before the generator can render the standard drawer
  for (const s of ['59-gridfinity-decor-drawer-1w-1h', '185-gridfinity-decor-drawer-1w-0-5h',
                   '185-gridfinity-decor-drawer-2w-3h']) {
    const r = resolvePartPreview(s);
    assert.equal(r.fail?.reason, 'unsupported', s);
    assert.match(r.fail.message, /Gridfinity Decor Drawers come in/, s);
  }
});
