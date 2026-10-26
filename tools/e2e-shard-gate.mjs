#!/usr/bin/env node
/* The e2e shards' coverage gate (2026-10-25): reads every shard report under a folder (E2E_SHARD_REPORT files, one per
   shard, see e2e/shard.mjs) and fails unless all n shards saw the same case list and every case ran in exactly one.
   The deploy needs this job, so a partition that dropped or doubled a case blocks the deploy like a failing case does.
     usage: node tools/e2e-shard-gate.mjs <folder> [expected shard count] */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkReports } from '../e2e/shard.mjs';

const [dir, want] = process.argv.slice(2);
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const reports = walk(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const bad = checkReports(reports);
if (want && reports[0] && reports[0].n !== +want) bad.push(`the shards split ${reports[0].n} ways, the workflow asked for ${want}`);
if (bad.length) { for (const b of bad) console.log(`::error title=e2e shard coverage::${b}`); process.exit(1); }
const per = reports.sort((a, b) => a.k - b.k).map((r) => `shard ${r.k}: ${r.positions.length}`).join(', ');
console.log(`::notice title=e2e shard coverage::${reports[0].total} cases, each run exactly once (${per})`);
