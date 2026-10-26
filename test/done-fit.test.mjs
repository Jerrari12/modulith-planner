/* The Done scene's arithmetic (js/scenes/done-fit.js): the camera fit against the free region, the prop slide, the
 * contact footprint. Pure functions, so the numbers are checked by hand here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitDistance, shotCamera, clampToInterior, slideProps, fitSlides, contactFootprint, maskQuad, gapDrop, STEAM, steamRate, steamSize, steamSlices, steamBeat, DRIFT, driftReach, driftFor, driftKind, driftCss, driftWanted, steamShown, GRAMMAR, BEAT, FLOOR_MM, beatAt, easeSine, rngFrom, planCycle, mixShot, fitShot, blendShot, rowOf, around, spoolPlan, SPOOL_MAX, SPOOL_TALL, MUGS, MUG_PAIRS, MUG_COUNTS, MUG_LOOKS, NOTEBOOK_OFF_SHARE, MUG_MILESTONES, buildFacts, unlockedSayings, sayingsOf, hashSeed, mugPlan, pickSpots, apartFrom, mugFace, deskSpots, sayingLayout, grammarMode, easeInOut, driftTooSlow, DRAWER, drawerBeat, aimAt, pickDrawerUnit, reliefResolves, LENS, lensFor, roomAnchor, UNDER_LEFT_GAP, WALL_PAINTS, DESK_FINISHES, hexToLinear, linearToHex, wallFactor, wallWeight, bounceK, deskLook } from '../js/scenes/done-fit.js';
import { cocPx } from '../js/lens.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('fitDistance: a sphere fills the free height, and the free width when that is the tighter', () => {
  // 40 deg fov, 800 px tall: tan(20) = 0.364; radius 150 at fill 0.5 over the WHOLE frame = 150 / (0.5 * 0.364) = 824
  const whole = fitDistance({ radius: 150, fovDeg: 40, width: 1200, height: 800, free: { w: 1200, h: 800 }, fill: 0.5 });
  close(whole, 824.2, 1, 'whole frame');
  // the player covers the bottom 200 px: the free height is 600 of 800, so the distance grows by 800/600
  const panel = fitDistance({ radius: 150, fovDeg: 40, width: 1200, height: 800, free: { w: 1200, h: 600 }, fill: 0.5 });
  close(panel, whole * 800 / 600, 1, 'free height');
  // a narrow free width (a phone, 390 x 700 free of 844): the horizontal bound wins
  const phone = fitDistance({ radius: 150, fovDeg: 40, width: 390, height: 844, free: { w: 390, h: 700 } , fill: 0.5 });
  const dH = 150 / (0.5 * Math.tan(Math.PI / 9) * (390 / 844));
  close(phone, dH, 1, 'free width');
});

test('shotCamera: azimuth swings about Y from the front, elevation lifts, the aim is the box centre lowered by targetLift', () => {
  const box = { min: { x: -88, y: 0, z: -86 }, max: { x: 88, y: 134, z: 107 } };
  const view = { width: 1280, height: 800, free: { w: 972, h: 560 } };
  const c = shotCamera({ az: 0, el: 0, fovV: 36, fill: 0.4, targetLift: 0 }, box, view);
  close(c.target.x, 0, 1e-9, 'target x'); close(c.target.y, 67, 1e-9, 'target y'); close(c.target.z, 10.5, 1e-9, 'target z');
  assert.ok(c.position.z > c.target.z && Math.abs(c.position.x - c.target.x) < 1e-9 && Math.abs(c.position.y - c.target.y) < 1e-9, 'az 0 el 0 looks from +Z, the front');
  const r = shotCamera({ az: 30, el: 16, fovV: 36, fill: 0.4, targetLift: -0.08 }, box, view);
  assert.ok(r.position.x > r.target.x, 'a positive azimuth puts the camera at +X');
  assert.ok(r.position.y > r.target.y, 'elevation lifts the camera');
  close(r.target.y, 67 - 0.08 * r.radius, 1e-9, 'targetLift lowers the aim by a fraction of the radius');
  close(Math.hypot(r.position.x - r.target.x, r.position.y - r.target.y, r.position.z - r.target.z), r.distance, 1e-6, 'the camera sits at the fitted distance');
});

test('slideProps: a prop in the build\'s way slides along its slot by the gap, grouped, and one beside it stays', () => {
  const build = { min: { x: -200, y: 0, z: -90 }, max: { x: 200, y: 134, z: 100 } };
  const props = [
    { group: 'monitor', slot: 'x+', gap: 80, box: { min: { x: 100, z: -60 }, max: { x: 720, z: 40 } } },     // overlaps: must move to 280
    { group: 'monitor', slot: 'x+', gap: 80, box: { min: { x: 300, z: -200 }, max: { x: 740, z: -120 } } },  // behind the build in z: no overlap on its own
    { group: 'plant', slot: 'x-', gap: 70, box: { min: { x: -500, z: -80 }, max: { x: -350, z: 60 } } },      // clear already
    { group: 'mug', slot: 'x+', gap: 70, box: { min: { x: 150, z: 300 }, max: { x: 230, z: 380 } } },         // in front of the build: no z overlap
  ];
  const d = slideProps(props, build);
  assert.deepEqual(Object.keys(d).sort(), ['monitor']);
  close(d.monitor, 200 + 80 - 100, 1e-9, 'the monitor group slides so its nearest prop clears the build by the gap');
  const left = slideProps([{ group: 'plant', slot: 'x-', gap: 70, box: { min: { x: -250, z: -80 }, max: { x: -150, z: 60 } } }], build);
  close(left.plant, -((-150) - (-200 - 70)), 1e-9, 'an x- slot slides negative');
});

test('fitSlides: a slide that stays on the desk is kept; one that would carry a prop past the desk\'s edge hides the group', () => {
  const build = { min: { x: -528, y: 0, z: -90 }, max: { x: 528, y: 134, z: 100 } };   // a 12W build, 1056 mm wide
  const props = [
    { group: 'monitor', slot: 'x+', gap: 80, box: { min: { x: 100, z: -60 }, max: { x: 720, z: 40 } } },
    { group: 'mug', slot: 'x+', gap: 70, box: { min: { x: 300, z: -20 }, max: { x: 380, z: 60 } } },
    { group: 'plant', slot: 'x-', gap: 70, box: { min: { x: -620, z: -80 }, max: { x: -470, z: 60 } } },
  ];
  const slid = slideProps(props, build);
  assert.deepEqual(Object.keys(slid).sort(), ['monitor', 'mug', 'plant'], 'all three are in the way of a 12W build');
  const desk = { x0: -680, x1: 1120 };   // room.json's desk extent about the anchor
  const fit = fitSlides(props, slid, desk);
  assert.equal(fit.monitor, null, 'the monitor would hang past the desk\'s right edge (720 + 508 > 1120): hidden');
  assert.equal(fit.mug, slid.mug, `the mug still fits (380 + ${slid.mug} <= 1120): kept`);
  assert.equal(fit.plant, null, 'the plant would pass the left edge: hidden');
  assert.deepEqual(fitSlides(props, slid, null), slid, 'no bounds: every slide is kept');
  assert.deepEqual(fitSlides(props, {}, desk), {}, 'nothing slid: nothing to fit');
  assert.equal(BEAT.idleBackMs, undefined, 'no drift-back: the scene has no orbit to drift back from (2026-10-23)');
});

test('contactFootprint grows the build\'s footprint and centres it', () => {
  const f = contactFootprint({ min: { x: -88, y: 0, z: -86 }, max: { x: 88, y: 134, z: 107 } });
  close(f.w, 176 * 1.25, 1e-9, 'w'); close(f.d, 193 * 1.25, 1e-9, 'd'); close(f.x, 0, 1e-9, 'x'); close(f.z, 10.5, 1e-9, 'z');
});

test('shotCamera: targetShift aims by fractions of the box\'s width and depth (the detail shot looks at a drawer front)', () => {
  const box = { min: { x: -88, y: 0, z: -86 }, max: { x: 88, y: 134, z: 107 } };
  const view = { width: 1280, height: 800, free: { w: 972, h: 560 } };
  const c = shotCamera({ az: 0, el: 0, fovV: 30, fill: 1, targetShift: { x: -0.25, z: 0.5 } }, box, view);
  close(c.target.x, -0.25 * 176, 1e-9, 'a quarter of the width to -X'); close(c.target.z, 10.5 + 0.5 * 193, 1e-9, 'half the depth toward the front');
});

test('the grammar\'s shots: thirteen distinct cameras, every one moving, each fittable to the build, the lenses and heights Joey asked for', () => {
  const box = { min: { x: -88, y: 0, z: -86 }, max: { x: 88, y: 134, z: 107 } };
  const view = { width: 1280, height: 800, free: { w: 1264, h: 672 } };
  const shots = GRAMMAR.tabletop;
  assert.deepEqual(shots.map((s) => s.name), ['hero', 'push', 'low', 'detail', 'slide', 'top', 'macro', 'side', 'label', 'glide', 'pullback', 'dolly', 'mugs']);
  assert.equal(new Set(shots.map((s) => s.name)).size, shots.length, 'distinct');
  assert.deepEqual(shots.filter((s) => !s.to).map((s) => s.name), [], 'every shot moves (Joey 2026-10-25: "There are a lot of frozen views")');
  assert.equal(shots[0].name, 'hero');
  // the shots that held still drift about the pose they held: the still grammar, at the middle of the move, shows it as before
  for (const [n, pose] of [['hero', { az: 28, el: 20, fill: 0.5 }], ['low', { az: -34, el: -7, fill: 0.78 }], ['detail', { az: 30, el: 10, fill: 1.35 }], ['top', { az: 40, el: 50, fill: 0.58 }]]) {
    const m = mixShot(shots.find((s) => s.name === n), 0.5);
    for (const [key, v] of Object.entries(pose)) close(m[key], v, 1e-9, `${n}: its middle is the pose it held (${key})`);
  }
  const unit = { min: { x: -88, y: 0, z: -86 }, max: { x: 0, y: 67, z: 107 } };
  const aims = { drawer: aimAt(box, unit), front: { x: -61.6, y: 41.5, z: 107 } };
  const cams = Object.fromEntries(shots.map((s) => [s.name, fitShot(mixShot(s, 0.5), box, view, null, aims)]));
  for (const [n, c] of Object.entries(cams)) assert.ok(c.distance > 0 && Number.isFinite(c.position.x + c.position.y + c.position.z), `${n} fits`);
  assert.ok(cams.push.fov < cams.hero.fov, 'the front push-in is a long lens ("a zoomed in panning front view")');
  assert.ok(cams.low.fov > 40 && cams.low.position.y < cams.hero.position.y && cams.low.position.y < cams.low.target.y, 'the low shot: a wide lens, down below, looking up ("from down below with a wider angle lens")');
  assert.ok(cams.top.position.y > cams.hero.position.y, 'the top shot looks down from higher than the hero');
  const macro = shots.find((s) => s.name === 'macro');
  close(cams.macro.distance, (macro.from.distMm + macro.to.distMm) / 2, 1e-9, 'the macro is a set distance from its corner (the middle of its push)');
  const end = fitShot(mixShot(macro, 1), box, view, null, aims);
  /* twice as far as it first ended (Joey 2026-10-25: "a bit too zoomed in ... maybe bring it out about twice as far?"): a
     0.2 mm layer at the end of its push spans the relief's 4 px cutoff on a tall canvas only (1080 CSS px), not at 800 */
  const layerPx = (h) => 0.2 * (h / 2) / Math.tan((end.fov * Math.PI) / 360) / end.distance;
  close(end.distance, 210, 1e-9, 'it ends 210 mm off its corner');
  assert.ok(layerPx(800) < 4 && layerPx(1080) >= 4, `the layer lines show at its end on a 1080 px canvas (${layerPx(1080).toFixed(2)} px), not on an 800 px one (${layerPx(800).toFixed(2)})`);
  assert.deepEqual(cams.macro.target, aims.front, 'aimed at the spot on the drawer unit\'s face');
  close(cams.detail.target.x, box.min.x + 0.25 * 176, 1e-9, 'the detail shot looks at the drawer unit, as before');
  // with no drawer unit the macro frames the build closely instead (it has nothing of its own to aim at)
  const noUnit = fitShot(mixShot(shots.find((s) => s.name === 'macro'), 0.5), box, view, null, {});
  assert.ok(noUnit.distance > 130 && Number.isFinite(noUnit.position.y), 'no drawer: a close framing of the build, not a point in space');
  assert.ok(BEAT.holdMs >= 10000, 'holds of ten seconds or more ("very slow pace")');
});

test('fitShot keeps every camera above the desk (the low shot on a wide build would go under it) and mixShot interpolates the move\'s parameters, so an arc stays an arc', () => {
  const wide = { min: { x: -530, y: 0, z: -86 }, max: { x: 530, y: 134, z: 107 } };
  const view = { width: 1280, height: 800, free: { w: 1264, h: 672 } };
  const low = GRAMMAR.tabletop.find((s) => s.name === 'low');
  const raw = shotCamera(mixShot(low, 0.5), wide, view);
  assert.ok(raw.position.y < FLOOR_MM, `the low shot on a 12W build fits under the desk top (${raw.position.y.toFixed(0)} mm)`);
  const kept = fitShot(mixShot(low, 0.5), wide, view, null);
  assert.equal(kept.position.y, FLOOR_MM, 'lifted to the floor'); assert.equal(kept.floored, true);
  const side = GRAMMAR.tabletop.find((s) => s.name === 'side');
  const a = mixShot(side, 0), b = mixShot(side, 1), m = mixShot(side, 0.5);
  assert.equal(a.az, side.from.az); assert.equal(b.az, side.to.az); close(m.az, (side.from.az + side.to.az) / 2, 1e-12, 'the azimuth half way');
  const box = { min: { x: -88, y: 0, z: -86 }, max: { x: 88, y: 134, z: 107 } };
  const [ca, cb, cm] = [a, b, m].map((s) => shotCamera(s, box, view));
  const r = (c) => Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z);
  close(r(cm), r(ca), 1e-6, 'the arc\'s middle is as far from the build as its ends (a straight lerp would cut the chord)'); close(r(cb), r(ca), 1e-6, 'and its end');
  const lerped = { x: (ca.position.x + cb.position.x) / 2, y: (ca.position.y + cb.position.y) / 2, z: (ca.position.z + cb.position.z) / 2 };
  assert.ok(Math.hypot(lerped.x - ca.target.x, lerped.y - ca.target.y, lerped.z - ca.target.z) < r(ca) - 1, 'where a straight line between the ends would come closer');
  assert.deepEqual(mixShot({ name: 'still', from: { az: 3, el: 4 } }, 0.7), { az: 3, el: 4 }, 'a still shot is its from, whatever k');
});

test('beatAt: the dip-in, the hold, the dip-out and the black, the move eased across the visible time and never at rest on screen', () => {
  const b = { holdMs: 1000, dipInMs: 200, dipOutMs: 300, blackMs: 100 };
  assert.deepEqual([beatAt(0, b).phase, beatAt(0, b).fade, beatAt(0, b).fadeMs], ['in', 0, 200], 'the black fades out first');
  assert.equal(beatAt(199, b).phase, 'in'); assert.equal(beatAt(200, b).phase, 'hold');
  assert.deepEqual([beatAt(1200, b).phase, beatAt(1200, b).fade, beatAt(1200, b).fadeMs], ['out', 1, 300], 'then back to black over dipOutMs');
  assert.equal(beatAt(1350, b).fadeMs, 150, 'half way through the dip-out: half its time left');
  assert.deepEqual([beatAt(1500, b).phase, beatAt(1500, b).fade], ['black', 1]);
  assert.equal(beatAt(1600, b).phase, 'next', 'the cut, at the end of the black');
  close(beatAt(0, b).k, 0, 1e-12, 'the move starts as the frame begins to show'); close(beatAt(750, b).k, 0.5, 1e-12, 'half way through the visible time, half way along');
  close(beatAt(1500, b).k, 1, 1e-12, 'at its end as the frame has gone black');
  assert.ok(beatAt(10, b).k < 0.001 && beatAt(1490, b).k > 0.999, 'eased: gentle at both ends'); close(easeSine(0.25), 0.5 - 0.5 * Math.cos(Math.PI / 4), 1e-12, 'a half cosine');
  // the first shot: the entrance has landed on it, so no dip-in
  assert.equal(beatAt(0, b, { skipIn: true }).phase, 'hold'); assert.equal(beatAt(1000, b, { skipIn: true }).phase, 'out');
  assert.equal(beatAt(-5, b).phase, 'in', 'a clock read early is at the start');
  assert.ok(BEAT.dipInMs >= 800 && BEAT.dipOutMs >= 600, 'fades to black, not hard cuts: slow enough to read as a dip');
  assert.equal(easeInOut(0), 0); assert.equal(easeInOut(1), 1); close(easeInOut(0.5), 0.5, 1e-12, 'the entrance\'s ease, symmetric');
});

test('planCycle: every shot once a cycle in a seeded random order, the hero first on the first, no shot ever following itself across cycles, a still between two moves where it can', () => {
  // the eight shots of 2026-10-24, four of them moving (the still grammar's mix; every shot moves since 2026-10-25)
  const names = ['hero', 'push', 'low', 'detail', 'slide', 'top', 'macro', 'side'];
  const moving = (n) => ['push', 'slide', 'macro', 'side'].includes(n);
  const rng = rngFrom(7);
  const c1 = planCycle(names, rng, { first: 'hero', moving });
  assert.equal(c1[0], 'hero'); assert.deepEqual([...c1].sort(), [...names].sort(), 'a permutation: every shot once');
  for (let i = 1; i < c1.length; i++) assert.ok(!(moving(c1[i]) && moving(c1[i - 1])), `no two moves back to back (${c1.join(' ')})`);
  let prev = c1[c1.length - 1];
  for (let k = 0; k < 40; k++) {
    const c = planCycle(names, rng, { prev, moving });
    assert.notEqual(c[0], prev, `a cycle never opens on the shot the last one closed on (${prev} | ${c.join(' ')})`);
    assert.ok(!(moving(prev) && moving(c[0])), `nor two moves across the seam (${prev} | ${c.join(' ')})`);
    assert.deepEqual([...c].sort(), [...names].sort());
    for (let i = 1; i < c.length; i++) assert.ok(!(moving(c[i]) && moving(c[i - 1])), `four stills always separate four moves (${c.join(' ')})`);
    prev = c[c.length - 1];
  }
  // seeded: the same seed, the same plan; another seed, another plan (random per visit, reproducible in a test)
  assert.deepEqual(planCycle(names, rngFrom(3), { first: 'hero', moving }), planCycle(names, rngFrom(3), { first: 'hero', moving }));
  const plans = new Set(Array.from({ length: 12 }, (_, s) => planCycle(names, rngFrom(s + 1), { first: 'hero', moving }).join(' ')));
  assert.ok(plans.size >= 8, `different seeds, different orders (${plans.size} of 12)`);
  // where the moves outnumber the stills it does what it can, and still gives every shot once
  const many = planCycle(['a', 'b', 'c', 'd'], rngFrom(1), { moving: (n) => n !== 'd' });
  assert.deepEqual([...many].sort(), ['a', 'b', 'c', 'd']);
  for (let s = 0; s < 50; s++) { const r = rngFrom(s)(); assert.ok(r >= 0 && r < 1); }
});

test('clampToInterior: a camera inside is untouched; one above the wall tops or past a wall is pulled in along its ray, the fov widening only when the build would overflow, up to 55 degrees', () => {
  // the Home office as its walls give it: the left wall's inner face, the back wall's right end, the floor, the wall tops,
  // the back wall's inner face; open to the front
  const interior = { x0: -1380, x1: 3220, y0: -740, y1: 2260, z0: -138, z1: Infinity };
  const t = { x: 0, y: 350, z: 0 };
  const inside = clampToInterior({ position: { x: 800, y: 700, z: 1500 }, target: t, fov: 29.9, distance: 1700, radius: 150, fill: 0.5 }, interior);
  assert.equal(inside.clamped, false); assert.deepEqual(inside.position, { x: 800, y: 700, z: 1500 }); assert.equal(inside.fov, 29.9);
  // the 12 x 12 hero as measured: above the wall tops (y 2899) and past the back wall's end (x 3355); the top is the tighter limit
  const hero = clampToInterior({ position: { x: 3355, y: 2899, z: 6324 }, target: t, fov: 29.9, distance: 7600, radius: 640, fill: 0.5 }, interior);
  assert.equal(hero.clamped, true);
  close(hero.position.y, 2260 - 450, 0.5, 'the camera sits the top margin below the wall tops');
  close(hero.k, (1810 - 350) / (2899 - 350), 1e-9, 'k from the top');
  assert.ok(hero.position.x < 3220 - 150, 'and inside the back wall\'s end');
  close(hero.share, 0.5 / hero.k, 1e-9); assert.equal(hero.fov, 29.9, 'the build fills 0.87 of the frame: no widening under 0.92');
  close(hero.distance, 7600 * hero.k, 1e-6);
  // the 12 x 12 low shot as measured: through the left wall (x -2675); at the wall the build would fill 1.35 of the frame, so
  // the fov widens to keep it at 0.92
  const low = clampToInterior({ position: { x: -2675, y: 909, z: 5499 }, target: t, fov: 29.9, distance: 6150, radius: 640, fill: 0.62 }, interior);
  close(low.position.x, -1380 + 150, 0.5, 'the wall margin');
  const k = (-1230 - 0) / (-2675 - 0); close(low.k, k, 1e-9);
  const want = (2 * Math.atan(Math.tan((29.9 * Math.PI) / 360) * (0.62 / k) / 0.92) * 180) / Math.PI;
  close(low.fov, want, 1e-9, 'widened'); assert.ok(low.fov > 40 && low.fov < 46, `about 43 degrees (${low.fov.toFixed(1)})`);
  // the cap: a shot that would need more than 55 degrees stops there and the crop is accepted
  const far = clampToInterior({ position: { x: -8000, y: 400, z: 100 }, target: t, fov: 29.9, distance: 8000, radius: 640, fill: 0.62 }, interior);
  assert.equal(far.fov, 55); assert.ok(far.share > 2);
  // the detail fills 1.4 by design: its own share is its cap, so it widens only past that
  const mild = clampToInterior({ position: { x: 3400, y: 600, z: 600 }, target: t, fov: 29.9, distance: 3450, radius: 640, fill: 1.4 }, interior);
  assert.equal(mild.clamped, true); close(mild.k, 3070 / 3400, 1e-9); assert.ok(mild.fov > 29.9 && mild.fov < 34, `1.4 / 0.903 = 1.55 over its own 1.4: a touch wider (${mild.fov.toFixed(1)})`);
  const own = clampToInterior({ position: { x: 3100, y: 600, z: 600 }, target: t, fov: 29.9, distance: 3160, radius: 640, fill: 1.4 }, interior);
  assert.equal(own.clamped, true); close(own.k, 3070 / 3100, 1e-9); assert.ok(own.fov > 29.9 && own.fov < 30.3, `a 1 % clamp widens it by under half a degree (${own.fov.toFixed(2)})`);
  // the margins are the caller's; an open side (Infinity) never clamps; no interior, no clamp
  assert.equal(clampToInterior({ position: { x: 0, y: 2000, z: 9000 }, target: t, fov: 30, distance: 9200, fill: 0.5 }, interior, { top: 0, wall: 0 }).clamped, false, 'z is open and y 2000 is under the tops with no margin');
  assert.equal(clampToInterior({ position: { x: 1, y: 1, z: 1 }, target: t, fov: 30, distance: 1, fill: 0.5 }, null).clamped, false);
});

test('grammarMode: static first: the shots move only on High and Very High and only on a device not judged slow; still on Balanced, Fast and after a slow verdict; off under reduced motion or for a stage', () => {
  assert.equal(grammarMode({ tier: 'veryhigh' }), 'full');
  assert.equal(grammarMode({ tier: 'high' }), 'full');
  assert.equal(grammarMode({ tier: 'balanced' }), 'still', 'Balanced: locked-off views (Joey 2026-10-24: "maybe we only use stationary views for those devices")');
  assert.equal(grammarMode({ tier: 'fast' }), 'still', 'Fast: locked-off views with the dips (2026-10-23: "stays stationary for a bit before changing angle")');
  assert.equal(grammarMode({ tier: 'high', slow: true }), 'still', 'a slow verdict locks the views off');
  assert.equal(grammarMode({ tier: 'veryhigh', slow: true }), 'still');
  assert.equal(grammarMode({ tier: 'high', reduced: true }), 'off', 'reduced motion: the still hero, the views by hand');
  assert.equal(grammarMode({ tier: 'fast', reduced: true }), 'off', 'reduced motion beats Fast');
  assert.equal(grammarMode({ tier: 'fast', reduced: true, slow: true }), 'off');
  assert.equal(grammarMode({ tier: 'high', sequence: false }), 'off', 'a stage (Colors) never sequences');
  assert.equal(grammarMode({ tier: 'fast', sequence: false, slow: true }), 'off');
});

test('driftTooSlow: a drift drawn under 20 fps on average turns the sequence to cuts; a smooth one or too few frames does not', () => {
  assert.equal(driftTooSlow([16, 17, 16, 18, 16]), false, '60 fps');
  assert.equal(driftTooSlow([45, 48, 52, 55, 60, 70]), true, 'under 20 fps on average');
  assert.equal(driftTooSlow([300, 350]), false, 'two intervals are no evidence');
  assert.equal(driftTooSlow([16, 16, 16, 400]), true, 'one long stall drags the mean over the line');
  assert.equal(driftTooSlow(null), false);
  assert.equal(BEAT.maxFrameMs, 50);
  // with the drift's length known, the verdict is the frame COUNT against a 20 fps drift: catches the slowest device too
  assert.equal(driftTooSlow(new Array(209).fill(16.7), 50, 3500), false, '210 frames over 3.5 s: smooth');
  assert.equal(driftTooSlow(new Array(69).fill(50), 50, 3500), false, '70 frames over 3.5 s is exactly 20 fps: kept');
  assert.equal(driftTooSlow(new Array(17).fill(190), 50, 3500), true, '18 frames over 3.5 s (SwiftShader on a desktop): too slow');
  assert.equal(driftTooSlow([600, 650], 50, 2000), true, 'three frames over 2 s (SwiftShader on a laptop): too slow, where the mean rule had no evidence');
});

test('the drawer moment: out, open, back inside the detail hold; none in a hold too short; the unit is a labelled drawer nearest the front-left; the shot aims at it', () => {
  const b = drawerBeat(BEAT.holdMs);
  assert.ok(b, 'the default hold has room for it');
  assert.equal(b.openAt, DRAWER.outMs);
  assert.equal(b.closeAt, DRAWER.outMs + DRAWER.slideOutMs + DRAWER.openMs);
  assert.ok(b.closeAt + DRAWER.slideBackMs < BEAT.holdMs, 'back before the dip');
  assert.equal(drawerBeat(1500), null, 'the suite\'s short clock has no drawer moment');
  const build = { min: { x: -176, y: 0, z: -86 }, max: { x: 176, y: 134, z: 107 } };
  const units = [
    { id: 1, label: '', drawer: true, box: { min: { x: -176, y: 0, z: -86 }, max: { x: 0, y: 67, z: 107 } } },          // front-left, unlabelled
    { id: 2, label: 'Screws', drawer: true, box: { min: { x: 0, y: 0, z: -86 }, max: { x: 176, y: 67, z: 107 } } },     // labelled: wins
    { id: 3, label: 'Shelf', drawer: false, box: { min: { x: -176, y: 67, z: -86 }, max: { x: 176, y: 134, z: 107 } } }, // no drawer
  ];
  assert.equal(pickDrawerUnit(units, build).id, 2, 'a labelled unit with a drawer');
  assert.equal(pickDrawerUnit(units.filter((u) => u.id !== 2), build).id, 1, 'else any with a drawer');
  assert.equal(pickDrawerUnit([units[2]], build), null, 'none without a drawer');
  const aim = aimAt(build, units[2 - 1].box);
  close(aim.x, 0.25, 1e-9, 'the right unit\'s centre is a quarter of the width right of the build\'s'); close(aim.z, 0, 1e-9, 'same depth');
  const c = fitShot(GRAMMAR.tabletop.find((s) => s.name === 'detail').from, build, { width: 1280, height: 800, free: { w: 972, h: 560 } }, null, { drawer: aim });
  close(c.target.x, 88, 1e-9, 'the detail shot looks at that unit');
});

test('maskQuad: a desk mask lies on the desk about the anchor and slides with its group; a wall mask stands on the wall; a hidden group hides its shadow', () => {
  const anchor = { x: 100, z: -50 }, wallZ = -94;
  const desk = { group: 'monitor', surface: 'desk', x0: 300, x1: 900, zBack: -20, zFront: 380 };
  const q = maskQuad(desk, anchor, wallZ, 0);
  assert.equal(q.surface, 'desk'); close(q.w, 600, 1e-9, 'w'); close(q.h, 400, 1e-9, 'h');
  close(q.x, 100 + 600, 1e-9, 'x: the anchor plus the mask\'s centre'); close(q.y, 0.5, 1e-9, 'lifted off the desk'); close(q.z, -50 + 180, 1e-9, 'z: about the anchor, the front positive');
  assert.equal(q.visible, true);
  close(maskQuad(desk, anchor, wallZ, 250).x, 700 + 250, 1e-9, 'a slid group carries its shadow by the same slide');
  close(maskQuad(desk, anchor, wallZ, undefined).x, 700, 1e-9, 'a group that did not move: no offset');
  assert.equal(maskQuad(desk, anchor, wallZ, null).visible, false, 'a hidden group: its shadow hides');
  close(maskQuad(desk, anchor, wallZ, null).x, 700, 1e-9, 'and sits where it would be shown');
  const wall = { group: 'plant', surface: 'wall', x0: -700, x1: -300, y0: 0, y1: 500 };
  const wq = maskQuad(wall, anchor, wallZ, -120);
  assert.equal(wq.surface, 'wall'); close(wq.w, 400, 1e-9, 'w'); close(wq.h, 500, 1e-9, 'h');
  close(wq.x, 100 - 500 - 120, 1e-9, 'x, slid left with an x- group'); close(wq.y, 250, 1e-9, 'y: height over the desk top'); close(wq.z, -94 + 0.5, 1e-9, 'z: just in front of the wall');
  assert.equal(maskQuad(wall, anchor, null, 0), null, 'no wall known: no wall quad');
  assert.equal(maskQuad({ surface: 'floor', x0: 0, x1: 1 }, anchor, wallZ, 0), null, 'an unknown surface is not placed');
  close(maskQuad(desk, anchor, wallZ, 0, 2).y, 2, 1e-9, 'the lift is a parameter');
  assert.equal(q.u0, 0); assert.equal(q.u1, 1);
  // the clip (Sol 01a16bc5): a desk mask that reaches the desk's end and slides outward is cut at the edge, its texture
  // window with it; one that stays on the desk is whole; one carried wholly off draws nothing; a wall mask is never cut
  const clip = { x0: -680, x1: 1120 };
  const edge = { group: 'plant', surface: 'desk', x0: -680, x1: 10, zBack: -25, zFront: 381 };
  const c = maskQuad(edge, anchor, wallZ, -100, 0.5, clip);
  close(c.w, 690 - 100, 1e-9, '100 of the 690 mm cut off at the desk\'s left end'); close(c.x, 100 + (-680 + -90) / 2, 1e-9, 'centred on what remains');
  close(c.u0, 100 / 690, 1e-9, 'the texture window starts 100 mm into the mask'); close(c.u1, 1, 1e-9, 'and ends where the mask ends');
  const whole = maskQuad(edge, anchor, wallZ, 50, 0.5, clip);
  close(whole.w, 690, 1e-9, 'a slide that stays on the desk cuts nothing'); close(whole.u0, 0, 1e-9, 'u0'); close(whole.u1, 1, 1e-9, 'u1'); close(whole.x, 100 + (-680 + 10) / 2 + 50, 1e-9, 'x');
  assert.equal(maskQuad(edge, anchor, wallZ, -800, 0.5, clip), null, 'a mask carried wholly off the desk is not placed');
  const right = maskQuad({ ...desk, x0: 900, x1: 1200 }, anchor, wallZ, 0, 0.5, clip);
  close(right.w, 220, 1e-9, 'a mask reaching past the right end is cut there'); close(right.u0, 0, 1e-9, 'u0'); close(right.u1, 220 / 300, 1e-9, 'u1');
  const wq2 = maskQuad(wall, anchor, wallZ, -800, 0.5, clip);
  close(wq2.w, 400, 1e-9, 'a wall mask is not cut'); close(wq2.u0, 0, 1e-9, 'u0'); close(wq2.u1, 1, 1e-9, 'u1');
});

test('the strip of wall under the desk top that the sun reaches through the gap: the wall masks reach down over it, their bottom row drawn on', () => {
  // the home office: the desk's back edge 20 mm off the wall, the sun (room.json sun.dir) 578 up over 387 toward the room
  close(gapDrop([-718.308, 578.014, 387.213], 20), 20 * 578.014 / 387.213 + 3, 1e-9, '29.9 mm, and 3 for the sun\'s disc');
  close(gapDrop([0, 1, 1], 20, 0), 20, 1e-12, 'a 45 degree sun falls as far as the gap');
  for (const [dir, gap, why] of [[[0, 1, 1], 0, 'no gap'], [[0, 1, -1], 20, 'a sun behind the wall'], [[0, -1, 1], 20, 'a sun below the horizon'], [null, 20, 'no sun']]) assert.equal(gapDrop(dir, gap), 0, why);
  const anchor = { x: 100, z: -50 }, wallZ = -94;
  const wall = { group: 'plant', surface: 'wall', x0: -700, x1: -300, y0: -20, y1: 500 };
  const q = maskQuad(wall, anchor, wallZ, 0, 0.5, null, 33);
  close(q.h, 533, 1e-9, 'reaches 33 mm under the desk top, from its baked -20'); close(q.y, (-33 + 500) / 2, 1e-9, 'its centre moves down with it');
  close(q.v0, -13 / 520, 1e-12, 'the texture window starts 13 mm (in the mask\'s scale) under its bottom row');
  const same = maskQuad(wall, anchor, wallZ, 0, 0.5, null, 10);
  close(same.h, 520, 1e-9, 'a mask baked deeper than the strip keeps its own extent'); close(same.v0, 0, 1e-12, 'v0 0');
  assert.equal(maskQuad({ group: 'plant', surface: 'desk', x0: 0, x1: 100, zBack: -25, zFront: 381 }, anchor, wallZ, 0, 0.5, null, 33).v0, 0, 'a desk mask is never carried down');
});

test('reliefResolves: the layers can span the shader\'s cutoff only when the build is near; the nearest point of the box decides, not its centre', () => {
  const box = { min: { x: -100, y: 0, z: -100 }, max: { x: 100, y: 200, z: 100 } };
  const view = { width: 1280, height: 800 };
  const focal = 400 / Math.tan(Math.PI / 12);   // half of 800 px over tan(15 deg): 1492.8 px
  const far = reliefResolves({ position: { x: 0, y: 100, z: 1100 }, fov: 30 }, box, view);   // 1000 mm off the front face
  close(far.distance, 1000, 1e-9, 'the distance to the face, not to the centre (1200)'); close(far.px, 0.2 * focal / 1000, 1e-9, 'a 0.2 mm layer is 0.3 CSS px there'); assert.equal(far.on, false, 'under the cutoff of 4: the relief draws nothing, the stage may take it off');
  assert.equal(far.cutoffPx, 4, 'the default cutoff is the shader\'s 4 CSS px a layer');
  const near = reliefResolves({ position: { x: 0, y: 100, z: 160 }, fov: 30 }, box, view);   // 60 mm off the face: 4.98 px a layer
  close(near.distance, 60, 1e-9, 'near'); assert.equal(near.on, true, 'a layer spans the cutoff: the relief stays');
  const corner = reliefResolves({ position: { x: 130, y: 240, z: 140 }, fov: 30 }, box, view);
  close(corner.distance, Math.hypot(30, 40, 40), 1e-9, 'off a corner: the clamped point\'s distance');
  assert.equal(reliefResolves({ position: { x: 0, y: 100, z: 0 }, fov: 30 }, box, view).distance, 1, 'inside the box the distance floors at 1 mm (on, whatever the cutoff)');
  assert.equal(reliefResolves({ position: { x: 0, y: 100, z: 160 }, fov: 30 }, box, view, { cutoffPx: 12 }).on, false, 'the cutoff is the stage\'s to pass');
  assert.equal(reliefResolves({ position: { x: 0, y: 100, z: 160 }, fov: 60 }, box, view).on, false, 'a wider lens at the same distance: fewer pixels a layer (2.3), off');
});

test('lensFor: a still shot holds the whole build sharp to LENS.maxPx at its nearest and farthest corners, and blurs what lies beyond', () => {
  const box = { min: { x: -100, y: 0, z: -90 }, max: { x: 100, y: 200, z: 90 } }, view = { width: 1280, height: 720 };
  const cam = { position: { x: 600, y: 400, z: 1200 }, target: { x: 0, y: 80, z: 0 }, fov: 29.9 };
  const l = lensFor(cam, box, view);
  assert.equal(l.samples, LENS.samples);
  // the corners' depths along the view axis, measured here independently
  const f = [cam.target.x - cam.position.x, cam.target.y - cam.position.y, cam.target.z - cam.position.z], fl = Math.hypot(...f);
  const depths = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) depths.push(((x - cam.position.x) * f[0] + (y - cam.position.y) * f[1] + (z - cam.position.z) * f[2]) / fl);
  const near = Math.min(...depths), far = Math.max(...depths), at = (depth) => cocPx({ ...l, depth, heightPx: view.height, fovDeg: cam.fov });
  close(at(near), LENS.maxPx, 1e-9, 'the nearest corner');
  close(at(far), LENS.maxPx, 1e-9, 'the farthest corner');
  for (const d of depths) assert.ok(at(d) <= LENS.maxPx + 1e-9, `every corner within maxPx (${at(d)})`);
  assert.ok(at(far + 1000) > 3 * LENS.maxPx, `a wall a metre behind blurs well past it (${at(far + 1000).toFixed(1)} px)`);
  assert.ok(l.focus > near && l.focus < far, 'focused inside the build');
  // the blur is in pixels of THIS view: a shorter canvas wants a wider aperture for the same pixels
  close(lensFor(cam, box, { width: 1280, height: 360 }).aperture, 2 * l.aperture, 1e-9, 'half the height, twice the aperture');
  assert.equal(lensFor({ ...cam, target: { ...cam.position } }, box, view), null, 'no view axis, no lens');
  assert.equal(lensFor({ position: { x: 0, y: 100, z: 0 }, target: { x: 0, y: 100, z: -1 }, fov: 30 }, box, view), null, 'a camera inside the box: no lens');
});

/* THE MOUNTS (2026-10-25): where the room goes for a wall and an under-table build, and the shots each gets. The anchors
   and the desk are room.json's; the left leg's inner face is the GLB's desk_leg_l as the scene measures it. */
const ROOM_ANCHORS = { tabletop: [-220, 740, -755], wall: [-220, 1290, -799], 'under-table': [-220, 715, -755] };
const ROOM_DESK = { x0: -680, x1: 1120, zFront: 381.4, zBack: -25 };

test('roomAnchor: a tabletop build stands on the desk; a wall build hangs on the wall over it; an under-table build hangs under its front edge, left-justified at any width', () => {
  const box = { min: { x: -90.5, y: 112, z: -92.9 }, max: { x: 90.5, y: 178, z: 121.8 } };
  assert.deepEqual(roomAnchor('tabletop', box, {}, ROOM_ANCHORS, ROOM_DESK), { x: 0, y: 0, z: -92.9 }, 'on the desk top, its back at the anchor, as before');
  // on the wall: its face (1 mm behind the wall anchor) 0.5 mm behind the case backs, the bottom 550 mm over the desk top
  const w = roomAnchor('wall', box, { backZ: -92.9 }, ROOM_ANCHORS, ROOM_DESK);
  close(w.z + (ROOM_ANCHORS.wall[2] - 1 - ROOM_ANCHORS.tabletop[2]), -92.9 - 0.5, 1e-9, 'the wall\'s face just behind the case backs');
  close(box.min.y - w.y, 550, 1e-9, 'the build\'s bottom 550 mm over the desk top');
  assert.equal(w.x, 0, 'centred on the build zone');
  assert.deepEqual(roomAnchor('wall', box, { backZ: -92.9 }, {}, ROOM_DESK), w, 'room.json\'s anchors or not, the same offsets');
  // under the desk: the underside on the rail tops, the front edge on the rail fronts, and the build's left edge
  // UNDER_LEFT_GAP from the left leg's inner face whatever its width (Joey: "always left justify them")
  const frame = { underY: 174.9, frontZ: 92.5 };
  for (const width of [93, 533, 1061]) {   // 1W, 6W, 12W
    const b = { min: { x: -width / 2, y: 0, z: -108.5 }, max: { x: width / 2, y: 174.9, z: 121.8 } };
    const u = roomAnchor('under-table', b, frame, ROOM_ANCHORS, { ...ROOM_DESK, legInnerL: -585 });
    close(u.y - (ROOM_ANCHORS.tabletop[1] - ROOM_ANCHORS['under-table'][1]), 174.9, 1e-9, `${width} mm: the desk's underside on the rail tops`);
    close(u.z + ROOM_DESK.zFront, 92.5, 1e-9, `${width} mm: its front edge on the rail fronts`);
    close(b.min.x - (u.x - 585), UNDER_LEFT_GAP, 1e-9, `${width} mm: left-justified against the left leg`);
  }
  assert.equal(roomAnchor('under-table', box, frame, ROOM_ANCHORS, ROOM_DESK).x, 0, 'without the leg\'s measure, centred like the others');
});

test('slideProps with height: a desk prop under a wall build stays, one that reaches up into it slides; without it both slide, the desk\'s rule', () => {
  const wallBuild = { min: { x: -100, y: 550, z: -90 }, max: { x: 100, y: 650, z: 120 } };
  const props = [
    { group: 'mug', slot: 'x+', gap: 70, box: { min: { x: 50, y: 0, z: 0 }, max: { x: 130, y: 96, z: 80 } } },
    { group: 'plant', slot: 'x-', gap: 70, box: { min: { x: -120, y: 0, z: -60 }, max: { x: -20, y: 640, z: 40 } } },
  ];
  assert.deepEqual(Object.keys(slideProps(props, wallBuild, { height: true })), ['plant'], 'only the plant reaches the build');
  close(slideProps(props, wallBuild, { height: true }).plant, -150, 1e-9, 'and it clears it by its gap');
  assert.deepEqual(Object.keys(slideProps(props, wallBuild)).sort(), ['mug', 'plant'], 'by footprint alone both would');
});

test('maskQuad and fitShot follow the desk top\'s height when the room moves for a hanging build; an under-table build\'s shots may go below the desk', () => {
  const desk = { group: 'mug', surface: 'desk', x0: -50, x1: 50, zBack: -20, zFront: 60 }, wall = { group: 'plant', surface: 'wall', x0: -50, x1: 50, y0: 10, y1: 210 };
  close(maskQuad(desk, { x: 0, z: 0 }, -45, 0).y, 0.5, 1e-9, 'a desk top at 0, as before');
  close(maskQuad(desk, { x: 0, y: -463, z: 0 }, -45, 0).y, -463 + 0.5, 1e-9, 'a desk mask on the desk top wherever it is');
  close(maskQuad(wall, { x: 0, y: -463, z: 0 }, -45, 0).y, -463 + 110, 1e-9, 'a wall mask\'s height measured from the desk top');
  const box = { min: { x: -530, y: 0, z: -86 }, max: { x: 530, y: 134, z: 107 } };
  const view = { width: 1280, height: 800, free: { w: 1264, h: 672 } };
  const low = GRAMMAR.tabletop.find((s) => s.name === 'low');
  const raw = shotCamera(mixShot(low, 0.5), box, view);
  close(fitShot(mixShot(low, 0.5), box, view, null, {}, { floorY: -200 }).position.y, Math.max(raw.position.y, -200 + FLOOR_MM), 1e-9, 'the floor FLOOR_MM over a desk top at -200');
  const under = fitShot(mixShot(low, 0.5), box, view, null, {}, { floorY: -Infinity });
  close(under.position.y, raw.position.y, 1e-9, 'no desk floor under the desk'); assert.ok(!under.floored);
});

test('the grammar per mount: a wall and an under-table build get thirteen shots each, the hero first, all moving, one drawer moment, none from far above', () => {
  const box = { min: { x: -88, y: 0, z: -86 }, max: { x: 88, y: 134, z: 107 } };
  const view = { width: 1280, height: 800, free: { w: 1264, h: 672 } };
  for (const m of ['wall', 'under-table']) {
    const shots = GRAMMAR[m];
    assert.equal(shots.length, 13, m); assert.equal(new Set(shots.map((s) => s.name)).size, 13, `${m}: distinct`);
    assert.equal(shots[0].name, 'hero'); assert.equal(shots.filter((s) => s.to).length, 13, `${m}: every shot moves`);
    assert.deepEqual(GRAMMAR.tabletop.slice(8).map((s) => s.name), shots.slice(8).map((s) => s.name), `${m}: the four shots of 2026-10-25`);
    assert.deepEqual(shots.filter((s) => s.drawer).map((s) => s.name), ['detail'], `${m}: the drawer moment`);
    assert.ok(!shots.some((s) => s.name === 'top'), `${m}: no top shot`);
    const els = shots.flatMap((s) => [s.from.el, (s.to || s.from).el]);
    assert.ok(Math.max(...els) <= (m === 'wall' ? 12 : 20), `${m}: none from far above (the highest at ${Math.max(...els)} degrees)`);
    for (const s of shots) { const c = fitShot(mixShot(s, 0.5), box, view, null, {}); assert.ok(c.distance > 0 && Number.isFinite(c.position.x + c.position.y + c.position.z), `${m} ${s.name} fits`); }
    const low = fitShot(mixShot(shots.find((s) => s.name === 'low'), 0.5), box, view, null, {}, { floorY: -Infinity });
    assert.ok(low.position.y < low.target.y, `${m}: the low shot looks up`);
  }
});

test('the shots of 2026-10-25: the label glide fits the label, the glide trucks along the top row, the pullback blends a corner into the whole build, the dolly keeps the build\'s size', () => {
  const box = { min: { x: -88, y: 0, z: -86 }, max: { x: 88, y: 134, z: 107 } };
  const view = { width: 1280, height: 800, free: { w: 1264, h: 672 } };
  const shot = (n) => GRAMMAR.tabletop.find((s) => s.name === n);
  assert.deepEqual(around({ az: 10, el: 2 }, { az: 4 }), { from: { az: 8, el: 2 }, to: { az: 12, el: 2 } }, 'around: either side of the pose');
  // the label: aimed at its centre on the front, fitted to the label's box (much closer than the build's fit)
  const label = { box: { min: { x: -80, y: 100, z: 100 }, max: { x: -10, y: 112, z: 107 } } };
  const lc = fitShot(mixShot(shot('label'), 0.5), box, view, null, { label });
  assert.deepEqual(lc.target, { x: -45, y: 106, z: 107 }, 'aimed at the label');
  const whole = fitShot({ ...mixShot(shot('label'), 0.5), aim: null }, box, view, null, {});
  assert.ok(lc.distance < whole.distance / 2, `fitted to the label (${lc.distance.toFixed(0)} mm), not the build (${whole.distance.toFixed(0)})`);
  // the glide: the aim from near one end of the row to near the other, at the row's height, the camera's angle held
  const row = rowOf([{ min: { x: -80, y: 120, z: 100 }, max: { x: -10, y: 126, z: 108 } }, { min: { x: 10, y: 121, z: 100 }, max: { x: 80, y: 127, z: 108 } }, { min: { x: -80, y: 50, z: 100 }, max: { x: 80, y: 56, z: 108 } }], box);
  assert.deepEqual(row, { x0: -80, x1: 80, y: 123.5, z: 108 }, 'rowOf: the top row\'s span, height and front, the row below left out');
  assert.deepEqual(rowOf([], box), { x0: -88 + 0.15 * 176, x1: 88 - 0.15 * 176, y: 134 - 0.2 * 134, z: 107 }, 'and the build\'s front without grips or handles');
  const g0 = fitShot(mixShot(shot('glide'), 0), box, view, null, { row }), g1 = fitShot(mixShot(shot('glide'), 1), box, view, null, { row });
  close(g0.target.x, -80 + 160 * 0.05, 1e-9, 'from near the row\'s left end'); close(g1.target.x, -80 + 160 * 0.95, 1e-9, 'to near its right');
  close(g1.position.x - g0.position.x, g1.target.x - g0.target.x, 1e-9, 'a truck: the camera moves with the aim'); close(g0.position.z, g1.position.z, 1e-9);
  // the pullback: its ends are the two fitted ends, its distance geometric between them
  const fit = (spec) => fitShot(spec, box, view, null, { front: { x: -61.6, y: 41.5, z: 107 } });
  const pb = shot('pullback'), p0 = blendShot(pb, 0, fit), p1 = blendShot(pb, 1, fit), pm = blendShot(pb, 0.5, fit);
  close(p0.distance, 150, 1e-6, 'it opens on the faceplate\'s corner'); assert.deepEqual(p0.target, { x: -61.6, y: 41.5, z: 107 });
  const e1 = fit(mixShot({ from: pb.to }, 0));
  close(p1.distance, e1.distance, 1e-6, 'and ends on the whole build'); close(p1.position.x, e1.position.x, 1e-6);
  const mid = mixShot(pb, 0.5), dir = { az: mid.az, el: mid.el, fovV: mid.fovV };   // both ends fitted at the move's own direction and lens
  close(pm.distance, Math.sqrt(fit({ ...pb.from, ...dir }).distance * fit({ ...pb.to, ...dir }).distance), 1e-6, 'the distance geometric half way between the two ends fitted there');
  // the dolly: the lens narrows and the camera backs off, the build's share of the frame the same
  const d0 = fitShot(mixShot(shot('dolly'), 0), box, view, null, {}), d1 = fitShot(mixShot(shot('dolly'), 1), box, view, null, {});
  assert.ok(d1.fov < d0.fov * 0.6 && d1.distance > d0.distance * 1.7, `a dolly zoom (${d0.fov} deg at ${d0.distance.toFixed(0)} mm to ${d1.fov} at ${d1.distance.toFixed(0)})`);
  close(d1.distance * Math.tan((d1.fov * Math.PI) / 360), d0.distance * Math.tan((d0.fov * Math.PI) / 360), 1e-6, 'the build the same size');
  for (const n of ['label', 'glide', 'slide', 'dolly']) assert.equal(shot(n).reversible, true, `${n} runs either way`);
  assert.equal(shot('label').focusIn, true, 'the label comes into focus');
});

test('the mugs: a build\'s own seed picks how many (none to three), their looks, sayings, turns and spots, the same every time; the spots clear of the props, the build, each other and each other\'s view; the face a shot looks at', () => {
  assert.equal(hashSeed('#build=abc'), hashSeed('#build=abc'), 'a link, one seed');
  assert.notEqual(hashSeed('#build=abc'), hashSeed('#build=abd'), 'another link, another');
  assert.deepEqual(mugPlan(rngFrom(hashSeed('#build=abc'))), mugPlan(rngFrom(hashSeed('#build=abc'))), 'the same build, the same mugs');
  const plans = Array.from({ length: 400 }, (_, i) => mugPlan(rngFrom(hashSeed('#build=' + i))));
  const counts = [0, 1, 2, 3].map((n) => plans.filter((p) => p.count === n).length / plans.length);
  counts.forEach((c, n) => assert.ok(Math.abs(c - MUG_COUNTS[n]) < 0.07, `${n} mugs in about ${MUG_COUNTS[n] * 100} % of builds (${(c * 100).toFixed(0)} %)`));
  for (const p of plans) assert.equal(p.mugs.length, p.count);
  const off = plans.filter((p) => p.notebookOff).length / plans.length;
  assert.ok(Math.abs(off - NOTEBOOK_OFF_SHARE) < 0.08, `the notebook off in about ${NOTEBOOK_OFF_SHARE * 100} % (${(off * 100).toFixed(0)} %)`);
  const all = plans.flatMap((p) => p.mugs);
  for (const look of MUG_LOOKS) assert.ok(all.some((m) => m.look === look), `the ${look} look appears`);
  assert.ok(all.every((m) => sayingsOf(m.look).includes(m.back) || MUG_PAIRS.some((pr) => pr.includes(m.back))), 'each saying is its look\'s voice, or a pair\'s');
  assert.ok(all.some((m) => m.back.lines[0] === 'NEED DRAWER') && all.some((m) => m.back.lines.join(' ').includes('♥')), 'NEED DRAWER and the I ♥ among them');
  for (const p of plans) for (let i = 1; i < p.mugs.length; i++) assert.notEqual(p.mugs[i].back, p.mugs[i - 1].back, 'no saying twice in a row');
  assert.ok(plans.some((p) => p.count >= 2 && MUG_PAIRS.some(([x, y]) => p.mugs[0].back === x && p.mugs[1].back === y)), 'a pair now and then');
  assert.equal(mugPlan(rngFrom(1), { count: 3 }).count, 3, 'a forced count'); assert.equal(mugPlan(rngFrom(1), { count: 0 }).mugs.length, 0);
  assert.equal(MUGS.modulith.body, '#4a4c54', 'the charcoal a little lighter than the site\'s (it multiplies the bake)');
  // the spots, on the room as it stands (stage mm)
  const obstacles = [
    { min: { x: 460, z: 10 }, max: { x: 1080, z: 55 } }, { min: { x: 640, z: -17 }, max: { x: 900, z: 183 } }, { min: { x: 550, z: 119 }, max: { x: 990, z: 259 } },
    { min: { x: 103, z: 190 }, max: { x: 337, z: 276 } }, { min: { x: -135 - 28, z: -92 - 28 }, max: { x: 135 + 28, z: 117 + 28 } },
  ];
  const desk = { min: { x: -680, z: -117 }, max: { x: 1120, z: 289 } };
  const spots = deskSpots(obstacles, desk);
  assert.ok(spots.some((p) => p.x < -200) && spots.some((p) => p.x > 300), `spots either side of the build (${spots.length})`);
  for (const p of spots) for (const o of obstacles) assert.ok(Math.hypot(Math.max(o.min.x - 12 - p.x, 0, p.x - o.max.x - 12), Math.max(o.min.z - 12 - p.z, 0, p.z - o.max.z - 12)) > 70, 'clear of every box');
  const cam = { x: 620, z: 1600 };
  for (const fr of [[0.1, 0.5, 0.9], [0.3, 0.31, 0.32], [0.9, 0.1, 0.5]]) {
    const ps = pickSpots(spots, fr, 170, (p, q) => apartFrom(cam, p, q)).filter(Boolean);
    assert.ok(ps.length >= 2, 'room for more than one');
    for (let i = 0; i < ps.length; i++) for (let j = 0; j < i; j++) {
      assert.ok(Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z) >= 170, 'never touching');
      assert.ok(apartFrom(cam, ps[i], ps[j]), 'neither hiding the other from the camera');
    }
  }
  assert.equal(apartFrom(cam, { x: 400, z: 0 }, { x: 400 - 0.2 * 220, z: 200 }), false, 'two mugs on one line of sight hide each other');
  assert.equal(apartFrom(cam, { x: 0, z: 0 }, { x: 300, z: 0 }), true, 'side by side they do not');
  assert.deepEqual(pickSpots([{ x: 0, z: 0 }], [0.5, 0.5]), [{ x: 0, z: 0 }, null], 'a mug with nowhere left stands nowhere');
  // the face a shot looks at: the saying where it faces the room, else the logo, else neither
  assert.deepEqual(mugFace(180), { side: 'saying', az: 0 }); assert.deepEqual(mugFace(0), { side: 'logo', az: 0 });
  assert.deepEqual(mugFace(200), { side: 'saying', az: 20 }); assert.deepEqual(mugFace(75), { side: 'logo', az: 75 }, 'side on: the nearer face'); assert.deepEqual(mugFace(100), { side: 'saying', az: -80 });
  // a saying's layout: one size for its lines, the largest that fits, the small line a third of it, a larger line counted
  const fit = (line, s) => line.length * 0.7 * s;
  const lay = sayingLayout({ lines: ['ONE MORE DRAWER.', 'THEN I’M DONE.'], small: 'Last updated: one drawer ago.' }, 50, 60, fit);
  assert.ok(Math.abs(lay.size - 50 / (16 * 0.7)) < 1e-9, `the widest line fills the width (${lay.size})`);
  assert.ok(Math.abs(lay.small - lay.size * 0.36) < 1e-12);
  const tall = sayingLayout(MUGS.modulith.sayings[0], 80, 60, fit);
  assert.ok(tall.size * tall.lead * 7 <= 60 + 1e-9, 'seven lines fit the height');
  const unsup = MUGS.jerrari.sayings.find((x) => x.lines[1] === 'UNSUPERVISED');
  const ul = sayingLayout(unsup, 80, 60, fit);
  assert.ok(ul.size * ul.lead * ul.scales.reduce((a, b) => a + b, 0) <= 60 + 1e-9 && fit('UNSUPERVISED', ul.size * 1.4) <= 80 + 1e-9, 'a larger line fits too');
  // Astra: the long ones broken short
  for (const look of ['jerrari', 'modulith']) for (const sy of MUGS[look].sayings) assert.ok(sy.lines.every((l) => l.length <= 20), `no line over 20 characters (${sy.lines.join(' / ')})`);
});

test('the milestone sayings: a build\'s size, height, drawers and labels unlock their sayings into its voices\' pools, the drawer count in its own', () => {
  const unit = (w, hh, drawer = true, label = '') => ({ w, hh, drawer, label });
  const small = buildFacts([unit(1, 2), unit(1, 2)], { x: 180, y: 120 });
  assert.deepEqual([small.cells, small.drawers, small.labelled], [2, 2, 0]);
  const ids = (f) => { const u = unlockedSayings(f); return [...u.jerrari, ...u.modulith].map((x) => x.milestone).sort(); };
  assert.deepEqual(ids(small), ['small'], 'a small build: SMALL BUILD. BIG PLANS.');
  const named = buildFacts([unit(1, 2, true, 'SCREWS'), unit(1, 2, true, 'NUTS')], { x: 180, y: 120 });
  assert.deepEqual(ids(named), ['labelled', 'small'], 'every drawer named: A PLACE FOR EVERYTHING ... IT HAS A NAME');
  const big = buildFacts(Array.from({ length: 10 }, () => unit(2, 2)), { x: 1000, y: 400 });
  assert.deepEqual(ids(big), ['drawers', 'huge', 'large', 'scope', 'tall'], 'a big, tall, many-drawered build');
  const n = unlockedSayings(big).modulith.find((x) => x.milestone === 'drawers');
  assert.equal(n.lines[0], '10 DRAWERS.', 'the real count in it');
  assert.ok(unlockedSayings(big).jerrari.some((x) => x.lines.includes('MISUNDERSTOOD')), 'DESIGN A DRAWER for the large or elaborate build');
  assert.ok(!sayingsOf('jerrari').some((x) => x.lines.includes('MISUNDERSTOOD')), 'and only there');
  for (const m of MUG_MILESTONES) assert.ok(m.saying.lines.every((l) => l.replace('{N}', '000').length <= 20), `${m.id}: short lines`);
  // they join the pool, they do not force it: across seeds a big build draws its milestones sometimes and the others too
  const extra = unlockedSayings(big), backs = [];
  for (let i = 0; i < 300; i++) backs.push(...mugPlan(rngFrom(hashSeed('#b' + i)), { count: 3, extra }).mugs.map((m) => m.back));
  const share = backs.filter((b) => b.milestone).length / backs.length;
  assert.ok(share > 0.1 && share < 0.6, `milestones now and then (${(share * 100).toFixed(0)} % of the mugs)`);
  for (let i = 0; i < 300; i++) { const ms = mugPlan(rngFrom(hashSeed('#c' + i)), { count: 3, extra }).mugs.map((m) => m.back.milestone).filter(Boolean); assert.equal(new Set(ms).size, ms.length, 'no milestone twice on one desk'); }
});

test('the spools: one per colour the build is printed in (five at most), stacks and standing ones, the build\'s own seed, always', () => {
  const cols = ['#111111', '#D03A2E', '#2a6fdb', '#eeeeee', '#f2c230', '#d03a2e'];
  assert.deepEqual(spoolPlan(rngFrom(hashSeed('a')), cols), spoolPlan(rngFrom(hashSeed('a')), cols), 'a link, one plan');
  const plans = Array.from({ length: 400 }, (_, i) => spoolPlan(rngFrom(hashSeed('spools|' + i)), cols));
  assert.ok(plans.every((p) => p.groups.length), 'every build has spools (Joey: "there will always be filaments on the desk")');
  for (const p of plans) {
    const all = p.groups.flatMap((g) => g.colours);
    assert.ok(all.length <= SPOOL_MAX, 'five at most');
    assert.equal(new Set(all).size, all.length, 'no colour twice (the hex case ignored)');
    assert.equal(all.length, Math.min(SPOOL_MAX, new Set(cols.map((c) => c.toLowerCase())).size), 'every colour up to the most');
    for (const g of p.groups) { assert.ok(g.kind === 'stack' || g.kind === 'stand'); assert.ok(g.kind === 'stack' ? g.colours.length <= SPOOL_MAX : g.colours.length === 1); assert.ok(g.spot >= 0 && g.spot < 1 && g.turnDeg >= 0 && g.turnDeg <= 360); }
  }
  const tall = plans.filter((p) => p.groups.length === 1 && p.groups[0].colours.length === 5).length / plans.length;
  assert.ok(Math.abs(tall - SPOOL_TALL) < 0.07, `one tall stack of all five in about ${SPOOL_TALL * 100} % (${(tall * 100).toFixed(0)} %)`);
  const groups = plans.flatMap((p) => p.groups), stacked = groups.filter((g) => g.kind === 'stack').reduce((a, g) => a + g.colours.length, 0), standing = groups.filter((g) => g.kind === 'stand').length;
  assert.ok(stacked > 4 * standing && standing > 0, `mostly stacked (${stacked} spools stacked, ${standing} standing: Joey, "just keep them stacked like this")`);
  assert.deepEqual(spoolPlan(rngFrom(1), []), { groups: [] }, 'no colours, no spools');
  assert.equal(spoolPlan(rngFrom(hashSeed('spools|3')), ['#abc']).groups.flatMap((g) => g.colours).length <= 1, true);
});

/* THE VISITOR'S ROOM COLOURS (2026-10-25): the colour maths the room is repainted by. The bake's paint is room.json's
   (#e2e4e1), the oak's baked albedo and the desk's light-only map scale are bake5's. */
const BAKED_WALL = '#e2e4e1';
const DESK_LIGHT = { scale: 0.86807, albedo: [0.75414, 0.59246, 0.4403] };

test('room colours: sRGB hex to linear light and back, the presets well formed', () => {
  assert.deepEqual(hexToLinear('#000000'), [0, 0, 0]);
  assert.deepEqual(hexToLinear('#ffffff'), [1, 1, 1]);
  close(hexToLinear('#808080')[0], 0.2158605, 1e-6, 'mid grey, the sRGB curve');
  for (const bad of [null, '', '#fff', 'navy', '#12345g', '#1234567']) assert.equal(hexToLinear(bad), null, `${bad} is no colour`);
  for (const h of ['#000000', '#3b4b5e', '#9aab94', '#e2e4e1', '#ffffff']) assert.equal(linearToHex(hexToLinear(h)), h, `${h} round-trips`);
  for (const list of [WALL_PAINTS, DESK_FINISHES]) {
    assert.equal(new Set(list.map((p) => p.id)).size, list.length, 'distinct ids');
    for (const p of list) assert.ok(p.hex == null || hexToLinear(p.hex), `${p.id}: a colour or the bake's own`);
  }
  assert.equal(WALL_PAINTS[0].hex, null, 'the first paint is the bake\'s own'); assert.equal(DESK_FINISHES[0].kind, 'bake', 'and the first desk the bake\'s oak');
});

test('room colours: the wall is the new paint over the baked one per channel, its weight 1 for the bake\'s own paint and 0 for black', () => {
  assert.equal(wallFactor('white', BAKED_WALL), null, 'the bake\'s own paint: nothing to change');
  assert.equal(wallFactor('#zzzzzz', BAKED_WALL), null, 'a bad value: nothing to change');
  assert.equal(wallFactor('navy', null), null, 'a bake that does not say its paint: nothing to change');
  const navy = wallFactor('navy', BAKED_WALL), lin = hexToLinear('#3b4b5e'), base = hexToLinear(BAKED_WALL);
  for (let i = 0; i < 3; i++) close(navy[i], lin[i] / base[i], 1e-12, 'navy over the baked paint');
  assert.deepEqual(wallFactor('#3b4b5e', BAKED_WALL), navy, 'a hex of the visitor\'s own is the same as its preset');
  assert.deepEqual(wallWeight('white', BAKED_WALL), [1, 1, 1], 'the bake\'s own paint keeps all its bounce');
  assert.deepEqual(wallWeight('#000000', BAKED_WALL), [0, 0, 0], 'black keeps none');
  assert.deepEqual(wallWeight('navy', BAKED_WALL), navy, 'the weight is the paint ratio');
});

test('room colours: a surface loses (1 - weight) of its bounce, scaled by what multiplies its light and the tile\'s scale', () => {
  assert.deepEqual(bounceK([1, 1, 1], [1, 1, 1], 2.5), [0, 0, 0], 'the bake\'s own paint: no change');
  assert.deepEqual(bounceK([1, 1, 1], [0, 0, 0], 2), [0.5, 0.5, 0.5], 'black walls: all of it, over the scale');
  const k = bounceK([0.5, 1, 2], [0.25, 0.5, 1], 4);
  close(k[0], 0.5 * 0.75 / 4, 1e-12, 'red'); close(k[1], 1 * 0.5 / 4, 1e-12, 'green'); close(k[2], 0, 1e-12, 'blue, its weight 1');
  assert.ok(bounceK([1, 1, 1], [1.2, 1.2, 1.2], 1).every((v) => v < 0), 'a paint brighter than the bake\'s adds bounce (k < 0)');
  assert.deepEqual(bounceK([1, 1, 1], [0, 0, 0], 0), [0, 0, 0], 'no scale, no bounce');
});

test('room colours: the desk is its oak, a tint of it over its baked albedo, or a plain colour over its light-only map', () => {
  assert.deepEqual(deskLook('oak', DESK_LIGHT), { use: 'bake', factor: [1, 1, 1], weight: [1, 1, 1] });
  assert.deepEqual(deskLook(undefined, DESK_LIGHT), { use: 'bake', factor: [1, 1, 1], weight: [1, 1, 1] }, 'no choice: the oak');
  const walnut = deskLook('walnut', DESK_LIGHT), wl = hexToLinear('#6b4a35');
  assert.equal(walnut.use, 'bake');
  for (let i = 0; i < 3; i++) close(walnut.factor[i], wl[i] / DESK_LIGHT.albedo[i], 1e-12, 'walnut over the oak as baked');
  const white = deskLook('white', DESK_LIGHT), wh = hexToLinear('#f0efea');
  assert.equal(white.use, 'light');
  for (let i = 0; i < 3; i++) { close(white.factor[i], wh[i] / DESK_LIGHT.scale, 1e-12, 'white over the map\'s scale'); close(white.colour[i], wh[i], 1e-12, 'and its colour, for its bounce'); }
  assert.deepEqual(deskLook('#336699', DESK_LIGHT).colour, hexToLinear('#336699'), 'a hex of the visitor\'s own is a plain colour');
  assert.equal(deskLook('white', null), null, 'no light-only map: no plain colour');
  assert.equal(deskLook('walnut', { scale: 1 }), null, 'no baked albedo: no tint');
});

/* THE DESK'S BOUNCE (2026-10-25): the desk's weight in it is its diffuse albedo over the oak's as baked, the diffuse share
   on both a plain colour and a tint, 1 for the oak; a colour brighter than the oak weighs more than 1 (it adds bounce) */
test('room colours: the desk\'s weight in its own bounce, its diffuse share on a plain colour and a tint', () => {
  const share = [0.98, 0.97, 0.96];
  assert.deepEqual(deskLook('oak', DESK_LIGHT, share).weight, [1, 1, 1], 'the oak weighs 1: the bake');
  const white = deskLook('white', DESK_LIGHT, share), wh = hexToLinear('#f0efea');
  for (let i = 0; i < 3; i++) {
    close(white.factor[i], wh[i] * share[i] / DESK_LIGHT.scale, 1e-12, 'a plain colour draws its diffuse share over the light');
    close(white.colour[i], wh[i] * share[i], 1e-12, 'and its bounce tiles multiply that');
    close(white.weight[i], wh[i] * share[i] / DESK_LIGHT.albedo[i], 1e-12, 'its weight: that over the oak as baked');
  }
  assert.ok(white.weight.every((v) => v > 1), 'white weighs more than the oak: it adds bounce');
  assert.ok(white.weight[2] > white.weight[0], 'most in blue, where the oak is darkest');
  const black = deskLook('black', DESK_LIGHT, share);
  assert.ok(black.weight.every((v) => v > 0 && v < 0.1), `black weighs almost nothing (${black.weight})`);
  const walnut = deskLook('walnut', DESK_LIGHT, share), wl = hexToLinear('#6b4a35');
  for (let i = 0; i < 3; i++) { close(walnut.factor[i], wl[i] * share[i] / DESK_LIGHT.albedo[i], 1e-12, 'the tint carries the share'); close(walnut.weight[i], walnut.factor[i], 1e-12, 'and weighs what it tints'); }
  assert.deepEqual(deskLook('white', DESK_LIGHT, null).weight, deskLook('white', DESK_LIGHT, [1, 1, 1]).weight, 'no share: 1');
  assert.deepEqual(deskLook('white', { scale: 0.9 }, share).weight, [1, 1, 1], 'no baked albedo: no weight to blend by');
  for (let i = 0; i < 3; i++) close(bounceK(white.colour, white.weight, 2)[i], white.colour[i] * (1 - white.weight[i]) / 2, 1e-12, 'its share of a tile, negative: added');
  assert.ok(bounceK(white.colour, white.weight, 2).every((v) => v < 0));
});

test('the coffee\'s steam: it rises with the camera\'s moves on Very High, at the tier\'s frame rate on High and Balanced, not at all on Fast or with reduced motion; its column sized off the mug', () => {
  assert.equal(steamRate('veryhigh', false), 'motion', 'Very High: on the frames the camera\'s own move draws');
  assert.equal(steamRate('high', false), 24, 'High: 24 frames a second');
  assert.equal(steamRate('balanced', false), 15, 'Balanced: 15');
  assert.equal(steamRate('fast', false), 0, 'Fast: a still wisp');
  for (const t of ['veryhigh', 'high', 'balanced', 'fast']) assert.equal(steamRate(t, true), 0, `${t} with reduced motion: a still wisp`);
  assert.equal(steamRate('ultra', false), 0, 'a tier it does not know: still');
  assert.deepEqual(STEAM.fps, { high: 24, balanced: 15 });
  const s = steamSize(36.5);   // the room's mug
  close(s.w, 2.8 * 36.5, 1e-9, 'about 2.8 radii wide');
  close(s.h, 4.6 * 36.5, 1e-9, 'and 4.6 tall');
  assert.ok(s.w > 95 && s.w < 110 && s.h > 160 && s.h < 175, `about 100 by 170 mm over the mug (${s.w} x ${s.h})`);
});

test('the coffee\'s steam rises off the whole surface: four sheets stood across it, each as wide at its foot as the coffee\'s chord there, over a fainter mist', () => {
  const s = steamSlices();
  assert.deepEqual(s.map((c) => c.d), [-0.75, -0.25, 0.25, 0.75], 'front to back across the coffee, in radii');
  for (const c of s) close(c.half, Math.sqrt(1 - c.d * c.d), 1e-12, `the chord's half-width at ${c.d}`);
  close(s[0].half, 0.6614, 1e-4, 'the outer sheets about two thirds of the radius');
  close(s[1].half, 0.9682, 1e-4, 'the inner ones nearly all of it');
  assert.deepEqual(s.map((c) => c.seed), [0, 1, 2, 3], 'each its own noise');
  assert.deepEqual(steamSlices([1.2]).map((c) => c.half), [0], 'past the rim: no width');
  assert.ok(STEAM.mist > 0 && STEAM.mist < STEAM.alpha, `the mist fainter than a sheet (${STEAM.mist} against ${STEAM.alpha})`);
});

test('the steam\'s beat holds its tier\'s rate at any display rate, and a stall starts it again without a burst', () => {
  // rAF callbacks at a display's rate for 10 s: the ticks a second
  const run = (hz, rate, { ms = 10000, stall = null } = {}) => {
    let dueAt = 0, ticks = 0; const at = [];
    for (let now = 1000; now < 1000 + ms; now += 1000 / hz) {
      if (stall && now > 1000 + stall[0] && now < 1000 + stall[0] + stall[1]) continue;
      const b = steamBeat(now, dueAt, rate);
      if (b.tick) { ticks++; at.push(now); }
      dueAt = b.dueAt;
    }
    return { perS: ticks / (ms / 1000), at };
  };
  for (const hz of [60, 75, 100, 120, 144, 240]) {
    close(run(hz, 24).perS, 24, 0.15, `High at ${hz} Hz`);
    close(run(hz, 15).perS, 15, 0.15, `Balanced at ${hz} Hz`);
  }
  // the rule it replaced (the interval restarted at each tick) held 20 a second at 60 Hz and 25 at 100
  // a 700 ms stall: the 250 ms after it hold the rate's 6 or 7 ticks, not the 17 a beat catching up would fire
  const after = run(120, 24, { stall: [3000, 700] }).at.filter((t) => t > 4700 && t < 4950);
  assert.ok(after.length >= 5 && after.length <= 7, `after a 700 ms stall, the beat again from then, no burst to catch up (${after.length} ticks in the next 250 ms)`);
  assert.deepEqual(steamBeat(5000, 0, 24), { tick: true, dueAt: 5000 + 1000 / 24 }, 'the first tick: due an interval from now');
  assert.equal(steamBeat(5000, 5003, 24).tick, true, '4 ms early counts as on time');
  assert.equal(steamBeat(5000, 5005, 24).tick, false, 'more than that does not');
});

test('the still shots\' drift: a push in, a pull out or a slide, about the build\'s place, never showing the canvas\'s edge', () => {
  // where a point of the canvas lands (fractions of it) under scale(s) translate(t) about the origin o, as CSS composes them
  const land = (p, o, at) => o + at.s * (p - o + at.x);
  for (const kind of DRIFT.kinds) for (const ox of [0.2, 0.35, 0.5, 0.65, 0.8]) for (const oy of [0.2, 0.5, 0.8]) {
    const d = driftFor(kind, { x: ox, y: oy });
    assert.equal(d.kind, kind);
    for (const at of [d.from, d.to]) {
      assert.ok(at.s >= 1 && at.s <= DRIFT.scale + 1e-12, `${kind} at ${ox}: the scale within 1 .. ${DRIFT.scale}`);
      // the canvas's left and right edges stay outside the view: 0 lands at or left of 0, 1 at or right of 1
      assert.ok(land(0, ox, at) <= 1e-12 && land(1, ox, at) >= 1 - 1e-12, `${kind} about ${ox}: the edges stay out of the view (${land(0, ox, at)}, ${land(1, ox, at)})`);
      assert.ok(land(0, oy, { s: at.s, x: at.y }) <= 1e-12 && land(1, oy, { s: at.s, x: at.y }) >= 1 - 1e-12, `${kind}: and the top and bottom`);
    }
  }
  assert.equal(DRIFT.scale, 1.09, 'at most 9 % (Joey: "maybe try double that", of 4.5 %)');
  const r = driftReach(0.5, 1.09);
  close(r.hi, 0.5 * 0.09 / 1.09, 1e-12, 'about the middle a slide may reach (s - 1) / 2s either way');
  close(r.lo, -r.hi, 1e-12, 'the same on both sides');
  assert.deepEqual([driftFor('in', { x: 0.5, y: 0.5 }).from.s, driftFor('in', { x: 0.5, y: 0.5 }).to.s], [1, DRIFT.scale], 'a push in from the shot as framed');
  assert.deepEqual([driftFor('out', { x: 0.5, y: 0.5 }).from.s, driftFor('out', { x: 0.5, y: 0.5 }).to.s], [DRIFT.scale, 1], 'a pull out to it');
  const left = driftFor('left', { x: 0.5, y: 0.5 });
  assert.ok(left.from.x > 0 && left.to.x < 0 && left.from.s === left.to.s, 'a slide crosses at a held scale');
  assert.deepEqual(driftFor('in', { x: 1.7, y: -2 }).origin, { x: 1, y: 0 }, 'an origin off the canvas is held to its edge');
  assert.equal(driftKind('hero', 7), 'in', 'the hero pushes in');
  assert.deepEqual([0, 1, 2, 3, 4, -1].map((i) => driftKind('low', i)), ['in', 'left', 'out', 'right', 'in', 'right'], 'the others turn through the kinds');
  assert.equal(driftCss({ s: 1.045, x: -0.015, y: 0 }), 'scale(1.0450) translate(-1.500%, 0.000%)');
});

test('where the drift runs and the steam is drawn: no drift on Very High or under reduced motion; no steam where it cannot move in a drifting picture', () => {
  assert.deepEqual(['fast', 'balanced', 'high', 'veryhigh'].map((t) => driftWanted(t, false)), [true, true, true, false], 'every tier but Very High drifts');
  assert.deepEqual(['fast', 'balanced', 'high', 'veryhigh'].map((t) => driftWanted(t, true)), [false, false, false, false], 'none under reduced motion');
  assert.deepEqual(['fast', 'balanced', 'high', 'veryhigh'].map((t) => steamShown(t, false)), [false, true, true, true], 'Fast: a frozen wisp would give the zoom away, so none');
  assert.deepEqual(['fast', 'balanced', 'high', 'veryhigh'].map((t) => steamShown(t, true)), [true, true, true, true], 'under reduced motion nothing drifts: a still wisp belongs to a still scene');
  assert.deepEqual(['fast', 'balanced', 'high', 'veryhigh'].map((t) => steamShown(t, false, false)), [true, true, true, true], 'a scene with no grammar (Colors’ Room stage) never drifts: the steam stays');
});
