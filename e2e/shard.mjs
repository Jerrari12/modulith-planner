/* Sharding the end-to-end suite across CI runners (2026-10-25, the CI timing work).

   The suite is ONE file run by node:test, so neither Playwright Test's sharding nor `node --test --test-shard` (which
   shards by FILE) can split it. workspaces.mjs therefore collects its cases instead of registering them at once, and at
   the end of the file registers only this process's share: E2E_SHARD=k/n picks shard k of n; unset, every case runs, as
   before. The partition is a pure function of the ordered case list, so every shard computes the same one:

   - each case is identified by its POSITION in the file (a name may repeat; a position cannot), and lands in exactly one
     shard - assign() returns one shard per position, and test/e2e-shard.test.mjs proves the partition for many lists;
   - the split balances measured time: the longest case first, each onto the least-loaded shard (ties to the lower shard
     number), weighted by e2e/shard-weights.json (seconds per case name; only the proportions matter). Since 2026-10-27
     they are the RUNNER's own: each case's median over the shard notices (tools/tap-durations.mjs) of three green main
     runs, 40611504137, 40614184548 and 40616559063, each shard's seconds divided by its machine's speed (the median ratio
     against the previous weights), so six machines of 0.95-1.98x share one scale; a case that skips on the runner weighs
     0.5.
     A case missing from the weights - a new one - counts as the median, so a stale file only unbalances, it never drops
     or doubles a case;
   - a case keeps its shard (e2e/shard-map.json, 2026-11-01). Without the map, one added case moved 58 others on 2026-10-31
     and failures landed on cases the push never touched. A new case goes to the least-loaded shard, moving nothing that is
     mapped; `npm run e2e:rebalance` rewrites the map, on purpose;
   - each shard writes what it ran to E2E_SHARD_REPORT, and the deploy workflow's coverage gate checks the reports of all
     n shards together: the same case list in each, and every position run by exactly one. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

/* "k/n" -> { k, n }, or null when unset; anything else is an error, never a silent full run */
export function parseShard(s) {
  if (s == null || s === '') return null;
  const m = /^(\d+)\/(\d+)$/.exec(String(s).trim());
  if (!m) throw new Error(`E2E_SHARD must be k/n, got "${s}"`);
  const k = +m[1], n = +m[2];
  if (!(n >= 1 && k >= 1 && k <= n)) throw new Error(`E2E_SHARD ${s}: need 1 <= k <= n`);
  return { k, n };
}

export function weightOf(names, weights = {}) {
  const known = names.map((x) => weights[x]).filter((w) => typeof w === 'number' && w > 0).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)] : 1;
  return names.map((x) => (typeof weights[x] === 'number' && weights[x] > 0 ? weights[x] : median));
}

/* one shard number (1..n) per position: a mapped case in its own shard (a shard outside 1..n counts as unmapped), then the rest,
   longest-processing-time first, each onto the least-loaded shard */
export function assign(names, n, weights = {}, pins = {}) {
  const w = weightOf(names, weights);
  const load = new Array(n).fill(0), out = new Array(names.length);
  const free = [];
  names.forEach((x, i) => {
    const p = Object.hasOwn(pins, x) ? pins[x] : null;
    if (Number.isInteger(p) && p >= 1 && p <= n) { out[i] = p; load[p - 1] += w[i]; } else free.push(i);
  });
  const order = free.sort((a, b) => w[b] - w[a] || a - b);
  for (const i of order) {
    let best = 0;
    for (let s = 1; s < n; s++) if (load[s] < load[best]) best = s;
    out[i] = best + 1; load[best] += w[i];
  }
  return out;
}

export const listHash = (names) => createHash('sha256').update(names.join('\n')).digest('hex').slice(0, 16);

/* register this process's share of the collected cases with node:test, in file order, and report it */
export function registerShare(nodeTest, cases, shard, { weightsFile, pinsFile, reportFile, rebalance = false } = {}) {
  const names = cases.map((args) => String(args[0]));
  if (!shard) { for (const args of cases) nodeTest(...args); return; }
  const weights = weightsFile && existsSync(weightsFile) ? JSON.parse(readFileSync(weightsFile, 'utf8')) : {};
  if (rebalance) {   // tools/e2e-rebalance.mjs: the map as the weights alone would split the cases, one line a case so a diff reads
    const fresh = assign(names, shard.n, weights);
    writeFileSync(pinsFile, `{\n${names.map((x, i) => `  ${JSON.stringify(x)}: ${fresh[i]}`).join(',\n')}\n}\n`);
    console.log(`e2e shard map rewritten: ${names.length} cases in ${shard.n} shards`);
    return;
  }
  const pins = pinsFile && existsSync(pinsFile) ? JSON.parse(readFileSync(pinsFile, 'utf8')) : {};
  const where = assign(names, shard.n, weights, pins);
  const mine = [];
  cases.forEach((args, i) => { if (where[i] === shard.k) { mine.push(i); nodeTest(...args); } });
  const est = weightOf(names, weights).reduce((s, w, i) => s + (where[i] === shard.k ? w : 0), 0);
  console.log(`e2e shard ${shard.k}/${shard.n}: ${mine.length} of ${names.length} cases, about ${Math.round(est)} s by the weights`);
  /* the weights decide the split, so the report carries their hash too: shards that read different weights (a weights
     file edited between two local shard runs) disagree on the partition, and the gate says so by name */
  const wHash = createHash('sha256').update(JSON.stringify([Object.entries(weights).sort(), Object.entries(pins).sort()])).digest('hex').slice(0, 16);
  if (reportFile) writeFileSync(reportFile, JSON.stringify({ k: shard.k, n: shard.n, total: names.length, hash: listHash(names), weights: wHash, positions: mine, names: mine.map((i) => names[i]) }, null, 1));
}

/* a case that passed only on its second try (e2e/patience.mjs), added to this shard's report for the coverage job to name */
export function noteRetried(reportFile, name, firstMessage) {
  const first = String(firstMessage).split('\n')[0].slice(0, 300);
  console.log(`e2e retried: ${name}: ${first}`);
  if (!reportFile || !existsSync(reportFile)) return;
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  (report.retried ||= []).push({ name, first });
  writeFileSync(reportFile, JSON.stringify(report, null, 1));
}

/* the coverage gate: the reports of all n shards, together. Returns a list of problems (empty = every case ran once) */
export function checkReports(reports) {
  const bad = [];
  if (!reports.length) return ['no shard reports'];
  const { n, total, hash } = reports[0];
  if (reports.length !== n) bad.push(`${reports.length} reports for ${n} shards`);
  const ks = reports.map((r) => r.k).sort((a, b) => a - b);
  if (ks.join() !== Array.from({ length: n }, (_, i) => i + 1).join()) bad.push(`shards reported: ${ks.join(',')} (want 1..${n})`);
  for (const r of reports) {
    if (r.n !== n || r.total !== total || r.hash !== hash) bad.push(`shard ${r.k} saw a different case list (n ${r.n}, total ${r.total}, hash ${r.hash})`);
    if (r.weights !== reports[0].weights) bad.push(`shard ${r.k} split by different weights (${r.weights} against ${reports[0].weights})`);
  }
  const seen = new Array(total).fill(0);
  for (const r of reports) for (const p of r.positions) { if (p < 0 || p >= total) bad.push(`shard ${r.k}: position ${p} out of range`); else seen[p]++; }
  seen.forEach((c, p) => { if (c !== 1) bad.push(`case ${p} ran ${c} times`); });
  return bad;
}
