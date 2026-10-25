// Mutation check for js/rules/settle.js: each mutant is written to a temp file and test/settle.test.mjs runs against it
// (SETTLE_SRC); a mutant no test catches is reported SURVIVED. node tools/settle-mutants.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'js', 'rules', 'settle.js'), 'utf8').replace(/\r\n/g, '\n');
const MUTANTS = [
  ['S1 the direction flips (hanging builds settle down)', "const dir = s.mount === 'tabletop' ? 1 : -1;", "const dir = s.mount === 'tabletop' ? -1 : 1;"],
  // S2 and S3 are EQUIVALENT by design (each survives alone): the nearest-first order makes one pass enough, and the repeated
  // passes make any order enough - the rule keeps both so a future change to one cannot strand a unit. Both together must die:
  ['S2+S3 one pass AND far-first order', "const order = s.placed.slice().sort((a, b) => dir === 1 ? (b.y + b.hh) - (a.y + a.hh) : a.y - b.y);", "const order = s.placed.slice().sort((a, b) => dir === 1 ? (a.y + a.hh) - (b.y + b.hh) : b.y - a.y); if (pass > 0) break;"],
  ['S4 the hold comes back (a unit already unsupported on an end is left alone)', 'for (const u of order) {', 'for (const u of order) { if (Rs.unsupportedUnits().some((q) => q.id === u.id) && pass === 0 && s.placed.length > 4) continue;'],
  ['S5 the slide stops one short (a unit never touches)', 'while (Rs.canPlace(u.x, ny + dir, u.w, u.hh, u.id)) ny += dir;', 'while (Rs.canPlace(u.x, ny + dir, u.w, u.hh, u.id) && Rs.canPlace(u.x, ny + 2 * dir, u.w, u.hh, u.id)) ny += dir;'],
];
let survived = 0;
for (const [id, a, b] of MUTANTS) {
  if (src.split(a).length !== 2) { console.log(`${id}: PATTERN NOT FOUND`); survived++; continue; }
  const dir = mkdtempSync(join(tmpdir(), 'settle-mut-')); const p = join(dir, 'settle.js');
  writeFileSync(p, src.replace(a, b));
  const r = spawnSync('node', ['--test', 'test/settle.test.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SETTLE_SRC: p } });
  const fails = (r.stdout.match(/^ℹ fail (\d+)/m) || [])[1];
  if (r.status === 0 || fails === '0') { console.log(`${id}: SURVIVED`); survived++; } else console.log(`${id}: KILLED (${fails} failing)`);
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${MUTANTS.length - survived}/${MUTANTS.length} mutants killed.`); process.exit(survived ? 1 : 0);
