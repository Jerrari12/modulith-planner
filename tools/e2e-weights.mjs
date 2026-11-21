#!/usr/bin/env node
/* Refresh e2e/shard-weights.json from green main runs' shard notices (2026-11-21).

   Each e2e shard prints one ::notice (tools/tap-durations.mjs) listing its cases' seconds, which the Actions API serves
   without a sign-in. This reads those notices for the runs given, puts every shard's machine on one scale - its seconds
   divided by its speed, the median ratio of its cases' seconds to the CURRENT weights - and writes each case's median
   over the runs. A case no notice lists (it skips on the runner) weighs 0.5. The notice cuts a name at 110 characters, so
   a name is matched by that prefix against the suite's own list (e2e/shard-map.json), and an ambiguous one stops the run.
   Then `npm run e2e:rebalance` re-maps the cases. Each notice lists a shard's 25 slowest cases: a shard that ran more
   stops the run rather than leave a case unweighed.

     usage: node tools/e2e-weights.mjs <run id> [<run id> ...]      (three green main runs, as on 2026-10-27 and 2026-11-21) */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com/repos/Jerrari12/modulith-planner';
const runs = process.argv.slice(2);
if (!runs.length) { console.error('usage: node tools/e2e-weights.mjs <run id> [<run id> ...]'); process.exit(2); }
const fail = (m) => { console.error('e2e-weights: ' + m); process.exit(1); };
const get = async (u) => { const r = await fetch(u, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'e2e-weights' } }); if (!r.ok) fail(`${r.status} ${u}`); return r.json(); };
const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

const weightsFile = join(root, 'e2e', 'shard-weights.json');
const names = Object.keys(JSON.parse(readFileSync(join(root, 'e2e', 'shard-map.json'), 'utf8')));
const current = JSON.parse(readFileSync(weightsFile, 'utf8'));
const byPrefix = (p) => { const hits = names.filter((n) => n.slice(0, 110) === p); if (hits.length !== 1) fail(`a notice name matches ${hits.length} cases: ${p}`); return hits[0]; };

const seen = {}, speeds = [];
for (const run of runs) {
  const { jobs } = await get(`${API}/actions/runs/${run}/jobs?per_page=100`);
  const shards = jobs.filter((j) => /^e2e \(shard \d+\)$/.test(j.name));
  if (!shards.length) fail(`run ${run} has no e2e shard jobs`);
  for (const j of shards) {
    if (j.conclusion !== 'success') fail(`run ${run} ${j.name} is ${j.conclusion}: use green runs`);
    const notice = (await get(`${API}/check-runs/${j.id}/annotations?per_page=100`)).find((a) => a.title === 'e2e durations');
    if (!notice) fail(`run ${run} ${j.name}: no durations notice`);
    const [head, ...lines] = notice.message.split('\n');
    const rows = lines.map((l) => { const m = /^([\d.]+) s( FAILED)? - (.*)$/.exec(l); if (!m) fail(`unparsed line: ${l}`); return { s: +m[1], name: byPrefix(m[3]) }; });
    if (rows.length !== +/^(\d+) cases ran/.exec(head)[1]) fail(`run ${run} ${j.name}: the notice lists ${rows.length} cases of ${head}`);
    const speed = med(rows.filter((r) => current[r.name] > 0.5).map((r) => r.s / current[r.name]));
    speeds.push(speed);
    for (const r of rows) (seen[r.name] ||= []).push(r.s / speed);
  }
}
const w = Object.fromEntries(names.map((n) => [n, seen[n] ? Math.round(med(seen[n]) * 10) / 10 : 0.5]));
writeFileSync(weightsFile, `{\n${names.map((n) => ` ${JSON.stringify(n)}: ${w[n]}`).join(',\n')}\n}\n`);
console.log(`e2e weights: ${names.length} cases, ${Object.keys(seen).length} timed, ${names.length - Object.keys(seen).length} at 0.5 (skip on the runner)`);
console.log(`machines ${Math.min(...speeds).toFixed(2)}-${Math.max(...speeds).toFixed(2)}x the previous weights; total ${Math.round(Object.values(w).reduce((a, b) => a + b, 0))} weight-s`);
