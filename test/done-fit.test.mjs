/* The Done scene's arithmetic (js/scenes/done-fit.js): the camera fit against the free region, the prop slide, the
 * contact footprint. Pure functions, so the numbers are checked by hand here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitDistance, shotCamera, slideProps, contactFootprint } from '../js/scenes/done-fit.js';

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
