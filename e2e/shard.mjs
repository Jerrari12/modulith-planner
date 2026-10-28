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

/* one shard number (1..n) per position: longest-processing-time first onto the least-loaded shard */
export function assign(names, n, weights = {}) {
  const w = weightOf(names, weights);
  const order = names.map((_, i) => i).sort((a, b) => w[b] - w[a] || a - b);
  const load = new Array(n).fill(0), out = new Array(names.length);
  for (const i of order) {
    let best = 0;
    for (let s = 1; s < n; s++) if (load[s] < load[best]) best = s;
    out[i] = best + 1; load[best] += w[i];
  }
  return out;
}

export const listHash = (names) => createHash('sha256').update(names.join('\n')).digest('hex').slice(0, 16);

/* register this process's share of the collected cases with node:test, in file order, and report it */
export function registerShare(nodeTest, cases, shard, { weightsFile, reportFile } = {}) {
  const names = cases.map((args) => String(args[0]));
  if (!shard) { for (const args of cases) nodeTest(...args); return; }
  const weights = weightsFile && existsSync(weightsFile) ? JSON.parse(readFileSync(weightsFile, 'utf8')) : {};
  const where = assign(names, shard.n, weights);
  const mine = [];
  cases.forEach((args, i) => { if (where[i] === shard.k) { mine.push(i); nodeTest(...args); } });
  const est = weightOf(names, weights).reduce((s, w, i) => s + (where[i] === shard.k ? w : 0), 0);
  console.log(`e2e shard ${shard.k}/${shard.n}: ${mine.length} of ${names.length} cases, about ${Math.round(est)} s by the weights`);
  /* the weights decide the split, so the report carries their hash too: shards that read different weights (a weights
     file edited between two local shard runs) disagree on the partition, and the gate says so by name */
  const wHash = createHash('sha256').update(JSON.stringify(Object.entries(weights).sort())).digest('hex').slice(0, 16);
  if (reportFile) writeFileSync(reportFile, JSON.stringify({ k: shard.k, n: shard.n, total: names.length, hash: listHash(names), weights: wHash, positions: mine, names: mine.map((i) => names[i]) }, null, 1));
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
