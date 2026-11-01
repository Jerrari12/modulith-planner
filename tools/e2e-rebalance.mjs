#!/usr/bin/env node
/* Write e2e/shard-map.json afresh: every case in the shard the weights give it (2026-11-01). Cases keep their shards between
   runs of this, so a new case cannot move an old one; a rebalance moves many at once, so it is a change of its own, made on
   purpose and pushed alone. Do it when a shard's minutes have drifted from the rest (each job's durations notice), after
   refreshing e2e/shard-weights.json (fetch_shards.py + runner_weights_multi.mjs, see that file's history).
     usage: npm run e2e:rebalance [-- shards, default 8] */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const n = process.argv[2] || '8';
const run = spawnSync(process.execPath, ['--test', '--test-name-pattern=ZZZNOMATCH', 'e2e/workspaces.mjs'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, E2E_SHARD: `1/${n}`, E2E_REBALANCE: '1' },
});
process.exit(run.status ?? 1);
