/* The e2e suite's shard partition (e2e/shard.mjs, 2026-10-25): every case lands in exactly one shard whatever the case
   list, the shard count or the weights; every shard computes the same split; the gate catches a dropped, doubled or
   mismatched report. Pure functions only - no browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShard, assign, checkReports, listHash, registerShare } from '../e2e/shard.mjs';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rand = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test('parseShard reads k/n and refuses anything else', () => {
  assert.equal(parseShard(undefined), null);
  assert.equal(parseShard(''), null);
  assert.deepEqual(parseShard('2/4'), { k: 2, n: 4 });
  for (const s of ['0/4', '5/4', '1/0', 'x', '1-4', '2/']) assert.throws(() => parseShard(s), new RegExp('E2E_SHARD'));
});

test('assign: every position lands in exactly one shard, 1..n, for many lists, counts and weights', () => {
  const r = rand(7);
  for (let trial = 0; trial < 300; trial++) {
    const len = Math.floor(r() * 120);
    const names = Array.from({ length: len }, (_, i) => (r() < 0.05 && i ? `dup ${i % 3}` : `case ${i}`));
    const weights = {};
    for (const x of names) if (r() < 0.7) weights[x] = r() < 0.1 ? 0 : 1 + r() * 300;
    const n = 1 + Math.floor(r() * 8);
    const a = assign(names, n, weights);
    assert.equal(a.length, len);
    for (const s of a) assert.ok(Number.isInteger(s) && s >= 1 && s <= n, `shard ${s} of ${n}`);
    assert.deepEqual(assign(names, n, weights), a, 'the same input gives the same split (every shard agrees)');
    // the shards' positions together are 0..len-1, each once
    const all = [];
    for (let k = 1; k <= n; k++) a.forEach((s, i) => { if (s === k) all.push(i); });
    assert.deepEqual(all.sort((x, y) => x - y), names.map((_, i) => i));
  }
});

test('assign balances by weight: no shard is over the ideal by more than the largest case', () => {
  const r = rand(11);
  const names = Array.from({ length: 89 }, (_, i) => `case ${i}`);
  const weights = Object.fromEntries(names.map((x) => [x, 5 + r() * 120]));
  for (const n of [2, 3, 4, 5, 6]) {
    const a = assign(names, n, weights);
    const load = new Array(n + 1).fill(0);
    a.forEach((s, i) => { load[s] += weights[names[i]]; });
    const ideal = names.reduce((t, x) => t + weights[x], 0) / n, biggest = Math.max(...Object.values(weights));
    for (let k = 1; k <= n; k++) assert.ok(load[k] <= ideal + biggest, `shard ${k}/${n} carries ${load[k]} against ${ideal}`);
  }
});

test('registerShare registers each shard\'s cases in file order, and the reports of all shards pass the gate', () => {
  const cases = Array.from({ length: 23 }, (_, i) => [`case ${i}`, async () => {}]);
  const reports = [];
  for (let k = 1; k <= 4; k++) {
    const got = [];
    const file = join(tmpdir(), `e2e-shard-${process.pid}-${k}.json`);
    registerShare((name) => got.push(name), cases, { k, n: 4 }, { reportFile: file });
    const rep = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(got, rep.names, 'what was registered is what is reported');
    assert.deepEqual([...rep.positions].sort((a, b) => a - b), rep.positions, 'in file order');
    reports.push(rep); unlinkSync(file);
  }
  assert.deepEqual(checkReports(reports), []);
  // unsharded: every case, in order
  const all = []; registerShare((name) => all.push(name), cases, null);
  assert.deepEqual(all, cases.map((c) => c[0]));
});

test('the gate catches a missing shard, a doubled case, a dropped case and a different case list', () => {
  const names = ['a', 'b', 'c', 'd', 'e'];
  const hash = listHash(names), base = (k, positions) => ({ k, n: 2, total: 5, hash, positions });
  assert.deepEqual(checkReports([base(1, [0, 2, 4]), base(2, [1, 3])]), []);
  assert.ok(checkReports([base(1, [0, 2, 4])]).length, 'one shard missing');
  assert.ok(checkReports([base(1, [0, 2, 4]), base(2, [1, 3, 4])]).some((b) => /ran 2 times/.test(b)), 'doubled');
  assert.ok(checkReports([base(1, [0, 2]), base(2, [1, 3])]).some((b) => /ran 0 times/.test(b)), 'dropped');
  assert.ok(checkReports([base(1, [0, 2, 4]), { ...base(2, [1, 3]), hash: listHash(['x']) }]).some((b) => /different case list/.test(b)), 'list');
  assert.ok(checkReports([base(1, [0, 2, 4]), base(1, [1, 3])]).length, 'the same shard twice');
  assert.ok(checkReports([{ ...base(1, [0, 2, 4]), weights: 'a' }, { ...base(2, [1, 3]), weights: 'b' }]).some((b) => /different weights/.test(b)), 'weights');
  assert.deepEqual(checkReports([]), ['no shard reports']);
});
