/* WHAT THE SUITE DOES ABOUT TIME ON A SOFTWARE RASTERISER (2026-11-01, Joey: "why does this keep happening?"). Of the 16 failing
   cases in the 13 failed deploys from 10-29 to 11-01, 13 were a wait running out or a clock read on the CI runner, which has no
   GPU and machines up to twice as slow as each other. Each run failed on a different wait, and each was patched where it failed.

   THE WAITS. A wait returns as soon as its condition holds, so a longer limit costs a passing case nothing, and a case stops at
   its first timeout, so a real break costs the difference, at most 105 s. On a software rasteriser only, watchWaits lifts every explicit limit
   from 15 s up to 120 s, and page loads to 180 s, in one place instead of 800. Below 15 s a limit is left alone: those are the
   short probes, where running out is a normal answer. goBack and goForward are left alone too: the suite probes with them.

   THE RETRY. A case whose WAIT ran out runs once more, in a new browser. A case that read a wrong value does not: it fails at
   once, as before. This is narrower than retrying every failure on purpose (Sol 01a1982b): a retry can let an intermittent real
   bug through, so it applies only to the failure the runner is known to cause, and both attempts' messages are kept: a pass on
   the second try goes in the shard's report, and the coverage job names it in the run's annotations, so it gets fixed. */

export const WAIT_FLOOR_MS = 120_000;
export const LOAD_FLOOR_MS = 180_000;
export const STRETCH_FROM_MS = 15_000;

const LOADS = new Set(['goto', 'reload', 'waitForLoadState', 'waitForURL', 'waitForNavigation']);
const ACTIONS = new Set(['waitFor', 'waitForFunction', 'waitForSelector', 'waitForEvent', 'waitForRequest', 'waitForResponse', 'click', 'dblclick', 'tap', 'hover', 'fill', 'check', 'uncheck', 'setChecked', 'press', 'pressSequentially', 'type', 'selectOption', 'dragTo', 'dragAndDrop', 'focus', 'clear', 'textContent', 'innerText', 'innerHTML', 'getAttribute', 'inputValue', 'dispatchEvent', 'setInputFiles', 'scrollIntoViewIfNeeded']);

/* a call's arguments with its limit lifted: its LAST argument, when that is an options object with a limit in the range */
export function stretched(method, args) {
  const floor = LOADS.has(method) ? LOAD_FLOOR_MS : ACTIONS.has(method) ? WAIT_FLOOR_MS : 0;
  const last = args[args.length - 1];
  if (!floor || !last || typeof last !== 'object' || typeof last.timeout !== 'number') return args;
  if (last.timeout < STRETCH_FROM_MS || last.timeout >= floor) return args;
  return [...args.slice(0, -1), { ...last, timeout: floor }];
}

/* wrap the waiting methods of Playwright's client classes (the prototypes of a page, a frame, a locator and a context). With
   `stretch` the limits lift; always, a wait that runs out calls onTimeout, so a later `.catch(() => assert.fail(...))` can still
   be told from a wrong value. A method's own result goes back untouched: the promise, or a sync method's value. */
export function watchWaits(protos, { stretch, onTimeout }) {
  for (const proto of protos) {
    for (const method of [...LOADS, ...ACTIONS]) {
      const d = Object.getOwnPropertyDescriptor(proto, method);
      if (!d || typeof d.value !== 'function') continue;
      const original = d.value;
      proto[method] = function (...args) {
        const out = original.apply(this, stretch ? stretched(method, args) : args);
        if (out && typeof out.then === 'function') out.then(null, (e) => { if (e && e.name === 'TimeoutError') onTimeout(); });
        return out;
      };
    }
  }
}

/* did this failure come from a wait running out? Playwright's own error, or the error a case's catch raises from one: the suite
   turns many timeouts into a sentence with `.catch(() => assert.fail(...))`. That is an assert.fail, thrown at once, so it counts
   only as one within 250 ms of a timeout: an assert.equal just after a probe ran out is a wrong value, and fails (Sol 01a19841) */
export const CAUGHT_WITHIN_MS = 250;
export function ranOutOfTime(err, lastTimeoutAt, now = Date.now()) {
  if (!err) return false;
  if (err.name === 'TimeoutError') return true;
  return err.operator === 'fail' && lastTimeoutAt != null && now - lastTimeoutAt >= 0 && now - lastTimeoutAt <= CAUGHT_WITHIN_MS;
}

/* a case that runs once more when a wait ran out. `before` gets the new browser ready; `report` hears of a pass on the second
   try. A second failure is the case's failure, carrying the first one's message. */
export function withRetry(fn, { isWait, before, report }) {
  return async function retried(t) {
    let first;
    try { return await fn.call(this, t); } catch (e) { first = e; }
    if (!isWait(first)) throw first;
    await before();
    try {
      const out = await fn.call(this, t);
      report(first);
      return out;
    } catch (second) {
      const said = `\n(first attempt: ${first.message})`;
      second.message += said;
      if (second.stack) second.stack += said;   // the test runner's spec reporter prints the stack, which holds the old message
      throw second;
    }
  };
}
