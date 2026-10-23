/* THE IDLE GATE'S "SETTLING" BRANCHES (js/main.js idleSettling), lifted from the source text the way
 * test/swap-shadows.test.mjs lifts its functions, because main.js builds a renderer at import.
 *
 * The one that matters (2026-10-23): a shadow render still owed keeps the gate open, EXCEPT while a converged Very High
 * accumulator is blitting its mean. Every accumulated sample ends with accSetSun(0), which puts the sun home and sets
 * renderer.shadowMap.needsUpdate; after the last sample no scene render follows to consume it, so the gate stayed open
 * and Very High on the light stage (the only stage with a shadow map) drew about 120 frames a second at rest, measured
 * on main's own code. Mutation-checked: the condition reverted to `enabled && needsUpdate` fails the converged case.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
function takeFn(needle) {
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `could not find "${needle}" in main.js - if it was renamed, update this test rather than deleting it`);
  let depth = 0, opened = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if ('([{'.includes(c)) { depth++; if (c === '{') opened = true; }
    else if (')]}'.includes(c)) { depth--; if (opened && depth === 0 && c === '}') return src.slice(start, i + 1); }
  }
  throw new Error('unterminated function');
}
const IDLE = takeFn('function idleSettling()');

/* the names idleSettling reads, each a knob */
function settling({ aoWanted = false, aoBlocked = false, aoPasses = 16, aoMax = 16, accWanted = false, accOk = true, accN = 24, ACC = 24, shadowEnabled = false, needsUpdate = false }) {
  const fn = new Function('aoWanted', 'ao', 'accWanted', 'acc', 'ACC_SAMPLES', 'renderer', `${IDLE}\nreturn idleSettling();`);
  return fn(() => aoWanted, { blocked: aoBlocked, passes: aoPasses, accumMax: aoMax }, () => accWanted, { ok: accOk, n: accN }, ACC, { shadowMap: { enabled: shadowEnabled, needsUpdate } });
}

test('AO still accumulating, or an accumulation still short of its samples, keeps the gate open', () => {
  assert.equal(settling({ aoWanted: true, aoPasses: 3 }), true, 'AO passes short');
  assert.equal(settling({ aoWanted: true, aoBlocked: true }), true, 'AO blocked');
  assert.equal(settling({ accWanted: true, accN: 5 }), true, 'accumulating');
  assert.equal(settling({}), false, 'nothing wanted, nothing owed: rest');
});

test('a shadow render owed keeps the gate open, except while a converged Very High blits its mean', () => {
  assert.equal(settling({ shadowEnabled: true, needsUpdate: true }), true, 'no accumulator: an owed shadow render keeps it open');
  assert.equal(settling({ shadowEnabled: true, needsUpdate: true, accWanted: true, accN: 10 }), true, 'still accumulating: open (and the samples consume the flag)');
  assert.equal(settling({ shadowEnabled: true, needsUpdate: true, accWanted: true, accN: 24 }), false, 'converged and blitting: the flag waits for the next plain render, the gate rests');
  assert.equal(settling({ shadowEnabled: true, needsUpdate: true, accWanted: true, accOk: false, accN: 24 }), true, 'an accumulator that is not ok falls back to plain frames, which do consume the flag: open');
  assert.equal(settling({ shadowEnabled: false, needsUpdate: true }), false, 'no shadow map: nothing owed');
  assert.equal(settling({ shadowEnabled: true, needsUpdate: false, accWanted: true, accN: 24 }), false, 'converged and nothing owed: rest');
});
