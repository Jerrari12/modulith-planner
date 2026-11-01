/* What the e2e suite does about time on a software rasteriser (e2e/patience.mjs, 2026-11-01), and how a branch's changed cases are
   found (e2e/cases.mjs). Pure functions only - no browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stretched, watchWaits, ranOutOfTime, withRetry, WAIT_FLOOR_MS, LOAD_FLOOR_MS, CAUGHT_WITHIN_MS } from '../e2e/patience.mjs';
import { casesOf, changedCases, namePattern } from '../e2e/cases.mjs';

class TimeoutError extends Error { name = 'TimeoutError'; }

test('a wait\'s limit lifts from 15 s up to the floor, a page load\'s further, and nothing else moves', () => {
  const limit = (method, args) => stretched(method, args).at(-1)?.timeout;
  assert.equal(limit('click', [{ timeout: 30_000 }]), WAIT_FLOOR_MS);
  assert.equal(limit('waitForFunction', [() => 1, null, { timeout: 15_000, polling: 100 }]), WAIT_FLOOR_MS);
  assert.equal(stretched('waitForFunction', [() => 1, null, { timeout: 15_000, polling: 100 }])[2].polling, 100, 'the other options stay');
  assert.equal(limit('goto', ['/x', { timeout: 90_000 }]), LOAD_FLOOR_MS);
  assert.equal(limit('click', [{ timeout: 14_999 }]), 14_999, 'a short probe, where running out is a normal answer');
  assert.equal(limit('waitForSelector', ['#x', { timeout: 180_000 }]), 180_000, 'a longer limit stays');
  assert.equal(limit('goBack', [{ timeout: 30_000 }]), 30_000, 'the suite probes with goBack');
  assert.equal(limit('evaluate', [() => 1, { timeout: 30_000 }]), 30_000, 'a page function\'s own argument is its own');
  assert.equal(limit('waitForTimeout', [{ timeout: 30_000 }]), 30_000);
  for (const args of [[], ['#x'], [{ state: 'visible' }], [null]]) assert.deepEqual(stretched('click', args), args);
  const opts = { timeout: 30_000 };
  stretched('click', [opts]);
  assert.equal(opts.timeout, 30_000, 'the caller\'s object is not changed');
});

test('watchWaits lifts limits only when told, reports a timeout either way, and hands back the method\'s own result', async () => {
  const seen = [];
  const make = () => class { click(o) { seen.push(o.timeout); return Promise.resolve('done'); } waitFor() { return Promise.reject(new TimeoutError('t')); } focus() { return Promise.reject(new Error('other')); } hover() { return 'sync'; } evaluate(a) { return a; } };
  let timeouts = 0;
  const A = make(), B = make();
  watchWaits([A.prototype], { stretch: true, onTimeout: () => timeouts++ });
  watchWaits([B.prototype], { stretch: false, onTimeout: () => timeouts++ });
  assert.equal(await new A().click({ timeout: 30_000 }), 'done');
  assert.equal(await new B().click({ timeout: 30_000 }), 'done');
  assert.deepEqual(seen, [WAIT_FLOOR_MS, 30_000]);
  await assert.rejects(new A().waitFor(), /t/, 'the caller still gets the rejection');
  await assert.rejects(new B().waitFor(), /t/);
  assert.equal(timeouts, 2);
  await assert.rejects(new A().focus(), /other/);
  assert.equal(timeouts, 2, 'another failure is not a timeout');
  assert.equal(new A().hover(), 'sync', 'a sync method stays sync');
  assert.equal(new A().evaluate(7), 7, 'a method not on the list is not wrapped');
});

test('a wait running out is told from a wrong value', () => {
  const now = 1_000_000;
  assert.ok(ranOutOfTime(new TimeoutError('t'), null, now), 'Playwright\'s own error');
  const caught = (fn) => { try { fn(); } catch (e) { return e; } return null; };
  const failed = caught(() => assert.fail('the 3D view drew no spots within 30 s'));
  assert.ok(ranOutOfTime(failed, now - 5, now), 'the sentence a .catch(() => assert.fail(...)) raises from one');
  assert.ok(ranOutOfTime(failed, now - CAUGHT_WITHIN_MS, now));
  assert.ok(!ranOutOfTime(failed, now - CAUGHT_WITHIN_MS - 1, now), 'a probe that ran out earlier says nothing of this');
  assert.ok(!ranOutOfTime(failed, null, now), 'an assert.fail with no wait behind it');
  assert.ok(!ranOutOfTime(failed, now + 5, now));
  // a swallowed probe's timeout, then a wrong value at once: the wrong value fails, and does not get a second try (Sol 01a19841)
  assert.ok(!ranOutOfTime(caught(() => assert.equal(1, 2)), now - 5, now), 'assert.equal just after a probe ran out');
  assert.ok(!ranOutOfTime(caught(() => assert.ok(false)), now - 5, now), 'assert.ok just after a probe ran out');
  assert.ok(!ranOutOfTime(new Error('expected 2, got 3'), now - 5, now), 'any other error');
  assert.ok(!ranOutOfTime(null, now, now));
});

const retried = (fn, isWait = (e) => e.name === 'TimeoutError') => {
  const log = { before: 0, report: [] };
  return { log, run: withRetry(fn, { isWait, before: async () => { log.before++; }, report: (first) => log.report.push(first.message) }) };
};

test('a wait that ran out runs once more, on a new browser, and a pass is reported with the first message', async () => {
  let n = 0;
  const { log, run } = retried(async () => { if (++n === 1) throw new TimeoutError('click ran out'); return 'ok'; });
  assert.equal(await run(), 'ok');
  assert.equal(n, 2);
  assert.deepEqual(log, { before: 1, report: ['click ran out'] });
});

test('a wrong value never retries, however it looks: it fails at once, as before', async () => {
  let n = 0;
  const { log, run } = retried(async () => { n++; assert.equal(1, 2, 'a wrong value'); });
  await assert.rejects(run(), /a wrong value/);
  assert.equal(n, 1);
  assert.deepEqual(log, { before: 0, report: [] });
});

test('a second failure is the case\'s failure, carrying both messages, and there is no third try', async () => {
  let n = 0;
  const { log, run } = retried(async () => { n++; throw new TimeoutError(`attempt ${n} ran out`); });
  await assert.rejects(run(), (e) => /attempt 2 ran out/.test(e.message) && /first attempt: attempt 1 ran out/.test(e.message) && /first attempt: attempt 1 ran out/.test(e.stack));
  assert.equal(n, 2);
  assert.deepEqual(log, { before: 1, report: [] });
});

test('a wrong value on the second try still fails, and a passing case runs once', async () => {
  let n = 0;
  const { run } = retried(async () => { if (++n === 1) throw new TimeoutError('ran out'); assert.equal(1, 2, 'then wrong'); });
  await assert.rejects(run(), /then wrong[\s\S]*first attempt: ran out/);
  let m = 0;
  const pass = retried(async () => { m++; return 5; });
  assert.equal(await pass.run(), 5);
  assert.equal(m, 1);
  assert.equal(pass.log.before, 0);
});

const FILE = `import x from 'y';
/* a note */
test('one', async () => {
  body(1);
});

test('it\\'s two', { skip: FOO }, async () => {
  body(2);
});
for (const a of list) {
  test(\`loop \${a} case\`, async () => { body(3); });
}
test("three", async () => { body(4); });
`;

test('the cases of the file: names read as the test runner reads them, a body runs to the next case', () => {
  const c = casesOf(FILE);
  assert.deepEqual(c.map((x) => x.name), ['one', 'it\'s two', 'loop ${a} case', 'three']);
  assert.match(c[1].body, /body\(2\)/);
  assert.doesNotMatch(c[1].body, /body\(1\)/);
});

test('a changed case is one added or edited; moving nothing and renaming nothing names nothing', () => {
  assert.deepEqual(changedCases(FILE, FILE), []);
  assert.deepEqual(changedCases(FILE, FILE.replace('body(2)', 'body(22)')), ['it\'s two']);
  assert.deepEqual(changedCases(FILE, `${FILE}test('new', async () => {});\n`), ['new']);
  assert.deepEqual(changedCases(FILE, `${FILE}// a line after the last case\n`), ['three'], 'the last case\'s text runs to the end of the file: a harmless extra run');
  assert.deepEqual(changedCases(FILE, FILE.replace(`test('one', async () => {\n  body(1);\n});\n\n`, '')), [], 'a removed case runs nothing');
  assert.deepEqual(changedCases('', FILE).length, 4);
});

test('a name pattern matches its own case and no other', () => {
  const m = (name, s) => new RegExp(namePattern(name)).test(s);
  assert.ok(m('a (b) [c] 1.5 s', 'a (b) [c] 1.5 s'));
  assert.ok(!m('a (b) [c] 1.5 s', 'a (b) [c] 125 s'));
  assert.ok(!m('one', 'one more'));
  assert.ok(m('loop ${a} case', 'loop build case'), 'an interpolation matches anything');
  assert.ok(m('it\'s a/b + c?', 'it\'s a/b + c?'));
});
