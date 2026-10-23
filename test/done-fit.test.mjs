/* The Done scene's arithmetic (js/scenes/done-fit.js): the camera fit against the free region, the prop slide, the
 * contact footprint. Pure functions, so the numbers are checked by hand here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitDistance, shotCamera, slideProps, contactFootprint, SHOTS, SEQUENCE, sequenceAt, easeInOut, driftTooSlow, DRAWER, drawerBeat, aimAt, pickDrawerUnit } from '../js/scenes/done-fit.js';

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

test('the tabletop shots are three, each fittable, the detail closest, and the sequence holds then drifts and wraps', () => {
  const box = { min: { x: -88, y: 0, z: -86 }, max: { x: 88, y: 134, z: 107 } };
  const view = { width: 1280, height: 800, free: { w: 972, h: 560 } };
  const shots = SHOTS.tabletop;
  assert.equal(shots.length, 3); assert.deepEqual(shots.map((s) => s.name), ['hero', 'low', 'detail']);
  const cams = shots.map((s) => shotCamera(s, box, view));
  for (const c of cams) assert.ok(c.distance > 0 && Number.isFinite(c.position.x + c.position.y + c.position.z), 'fits');
  assert.ok(cams[2].distance < cams[0].distance && cams[2].distance < cams[1].distance, 'the detail shot is the closest');
  assert.ok(cams[1].position.y < cams[0].position.y, 'the low angle is lower than the hero');
  // the clock: hold on 0, drift 0 -> 1 eased, hold on 1 ... wrap after the last
  const o = { moveMs: 1000, holdMs: 2000 };
  assert.deepEqual([sequenceAt(0, 3, o).at, sequenceAt(0, 3, o).moving], [0, false]);
  const mid = sequenceAt(2500, 3, o);
  assert.equal(mid.moving, true); assert.equal(mid.at, 0); assert.equal(mid.to, 1); close(mid.k, 0.5, 1e-9, 'half way, eased, is half way');
  close(sequenceAt(2250, 3, o).k, easeInOut(0.25), 1e-12, 'eased progress');
  assert.deepEqual([sequenceAt(3000, 3, o).at, sequenceAt(3000, 3, o).moving], [1, false]);
  assert.deepEqual([sequenceAt(8500, 3, o).at, sequenceAt(8500, 3, o).to], [2, 0]);   // the third beat's move wraps to the hero
  assert.deepEqual([sequenceAt(9000, 3, o).at, sequenceAt(9000, 3, o).moving], [0, false]);
  assert.equal(sequenceAt(5000, 1, o).moving, false, 'one shot never moves');
  assert.ok(SEQUENCE.holdMs >= 8000 && SEQUENCE.holdMs <= 12000, 'the style doc: 8-12 s a shot');
  assert.equal(easeInOut(0), 0); assert.equal(easeInOut(1), 1); close(easeInOut(0.5), 0.5, 1e-12, 'symmetric');
});

test('driftTooSlow: a drift drawn under 20 fps on average ends the sequence; a smooth one or too few frames does not', () => {
  assert.equal(driftTooSlow([16, 17, 16, 18, 16]), false, '60 fps');
  assert.equal(driftTooSlow([45, 48, 52, 55, 60, 70]), true, 'under 20 fps on average');
  assert.equal(driftTooSlow([300, 350]), false, 'two intervals are no evidence');
  assert.equal(driftTooSlow([16, 16, 16, 400]), true, 'one long stall drags the mean over the line');
  assert.equal(driftTooSlow(null), false);
  assert.equal(SEQUENCE.maxFrameMs, 50);
});

test('the drawer moment: out, open, back inside the detail hold; none in a hold too short; the unit is a labelled drawer nearest the front-left; the shot aims at it', () => {
  const b = drawerBeat(SEQUENCE.holdMs);
  assert.ok(b, 'the default hold has room for it');
  assert.equal(b.openAt, DRAWER.outMs);
  assert.equal(b.closeAt, DRAWER.outMs + DRAWER.slideOutMs + DRAWER.openMs);
  assert.ok(b.closeAt + DRAWER.slideBackMs < SEQUENCE.holdMs, 'back before the drift');
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
  const c = shotCamera({ ...SHOTS.tabletop[2], targetShift: aim }, build, { width: 1280, height: 800, free: { w: 972, h: 560 } });
  close(c.target.x, 88, 1e-9, 'the detail shot looks at that unit');
});
