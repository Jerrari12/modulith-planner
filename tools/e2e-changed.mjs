#!/usr/bin/env node
/* Run the e2e cases this branch added or edited the way CI's machines run them, before pushing (2026-11-01). Locally the suite
   renders on the laptop's GPU, so a new case that reads a clock or races a frame passes here and fails first on the runner: on
   2026-11-01 one such case cost two full deploy runs.
     usage: npm run e2e:changed            run them on the software rasteriser at half speed
            npm run e2e:changed -- --list  only name them
   It compares e2e/workspaces.mjs with the commit this branch left origin/main at. E2E_THROTTLE overrides the slowdown; 2 is the
   runner's typical speed against this laptop's (about 2.1x, 2026-10-29). It catches a case's own timing, not what a case does
   because of the ones before it in its shard: for that, `E2E_SHARD=k/8 E2E_SOFT=1 npm run e2e`. */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedCases, namePattern } from '../e2e/cases.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const FILE = 'e2e/workspaces.mjs';
const base = git('merge-base', 'HEAD', 'origin/main').trim();
const names = changedCases(git('show', `${base}:${FILE}`), readFileSync(join(root, FILE), 'utf8'));

if (!names.length) { console.log(`No e2e case added or edited since ${base.slice(0, 8)}.`); process.exit(0); }
console.log(`${names.length} e2e case${names.length === 1 ? '' : 's'} added or edited since ${base.slice(0, 8)}:`);
for (const n of names) console.log(`  ${n}`);
if (process.argv.includes('--list')) process.exit(0);

const run = spawnSync(process.execPath, ['--test', ...names.map((n) => `--test-name-pattern=${namePattern(n)}`), FILE], {
  cwd: root, stdio: 'inherit', env: { ...process.env, E2E_SOFT: '1', E2E_THROTTLE: process.env.E2E_THROTTLE || '2' },
});
process.exit(run.status ?? 1);
