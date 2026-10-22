/* WHERE THE DRAWER FOCUS'S PILLS GO (2026-10-21). An opened drawer comes toward the camera, so its W / L / H pills can
 * project under the workspace's panels or onto each other: placePills (js/main.js) keeps each inside the canvas less the
 * panels' bands and off the pills already placed. Terra 01a15f9c found the first version's single pass could move the
 * third pill off the second and back onto the first; the cases below put all three on one point. The function is lifted
 * from main.js by a balanced scan, as test/shadow-at-rest.test.mjs does. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
function take(needle) {
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `could not find "${needle}" in main.js`);
  let depth = 0, opened = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if ('([{'.includes(c)) { depth++; if (c === '{') opened = true; }
    else if (')]}'.includes(c)) { depth--; if (opened && depth === 0 && c === '}') return src.slice(start, i + 1); }
  }
  assert.fail(`unterminated "${needle}"`);
}
const CODE = take('function placePills(items, box, sa)');
const load = (code) => new Function(`${code}; return placePills;`)();
const placePills = load(CODE);

const BOX = { width: 1280, height: 800 }, SA = { left: 332, right: 352, top: 90, bottom: 118 };   // Build at 1280 x 800
const rects = (items, at) => items.map((q, i) => ({ l: at[i].x - q.w / 2, r: at[i].x + q.w / 2, t: at[i].y - q.h / 2, b: at[i].y + q.h / 2 }));
const inside = (rs) => rs.every((q) => q.l >= SA.left && q.r <= BOX.width - SA.right && q.t >= SA.top && q.b <= BOX.height - SA.bottom);
const apart = (rs) => rs.every((a, i) => rs.every((c, j) => j <= i || a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t));
const three = (x, y) => [{ x, y, w: 72, h: 34 }, { x, y, w: 72, h: 34 }, { x, y, w: 69, h: 34 }];

test('three pills on one point, at the top of the clear area (Terra 01a15f9c), in its middle, and under a panel: each lands inside, none overlap', () => {
  for (const [name, x, y] of [['top', 600, 0], ['middle', 600, 400], ['under the left panel and the dock', 100, 790], ['bottom right', 1270, 790]]) {
    const items = three(x, y); const rs = rects(items, placePills(items, BOX, SA));
    assert.ok(inside(rs), `${name}: inside the clear area ${JSON.stringify(rs)}`);
    assert.ok(apart(rs), `${name}: no two overlap ${JSON.stringify(rs)}`);
  }
});

test('a pill already clear stays where its line puts it', () => {
  const at = placePills([{ x: 640, y: 400, w: 72, h: 34 }], BOX, SA);
  assert.deepEqual(at, [{ x: 640, y: 400 }]);
});

test('no safe area (a bare viewer page) still keeps pills on the canvas, and a box too small to fit one does not throw', () => {
  const rs = rects(three(0, 0), placePills(three(0, 0), BOX, { left: 0, right: 0, top: 0, bottom: 0 }));
  assert.ok(rs.every((q) => q.l >= 0 && q.t >= 0) && apart(rs), JSON.stringify(rs));
  assert.doesNotThrow(() => placePills(three(5, 5), { width: 60, height: 30 }, SA));
});

test('the recheck is what keeps them apart: without it, the top case overlaps again', () => {
  const broken = load(CODE.replace('!hits(t)', 'true'));
  const items = three(600, 0);
  assert.ok(!apart(rects(items, broken(items, BOX, SA))), 'the mutant must overlap');
});
