#!/usr/bin/env node
/* The slowest cases of a `node --test` TAP log, for the CI runner (2026-10-25, the CI timing work).
   The runner's log needs a sign-in to read; its annotations do not. So this reads a suite's TAP output and prints ONE
   ::notice annotation carrying the suite's total, its case count and its slowest cases, which the Actions API then serves
   unauthenticated (/repos/<o>/<r>/check-runs/<job id>/annotations). It also writes the full list as JSON beside the log.

   usage: node tools/tap-durations.mjs <tap log> <title> [how many, default 25]
   Only top-level cases are counted (TAP lines at indent 0: "ok N - name" / "not ok N - name", then a YAML block whose
   "duration_ms:" is that case's own time). A missing or empty log prints nothing and exits 0: this is a report, never a gate. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [file, title = 'tests', howMany = '25'] = process.argv.slice(2);
if (!file || !existsSync(file)) process.exit(0);
const lines = readFileSync(file, 'utf8').split(/\r?\n/);
const cases = [];
for (let i = 0; i < lines.length; i++) {
  /* the spec reporter (Node 23+ prints it even into a pipe; the runner's Node 22 prints TAP): "✔ name (12.3ms)" at indent 0 */
  const sp = /^(✔|✖|﹣) (.*) \(([\d.]+)ms\)(?: # .*)?$/.exec(lines[i]);
  if (sp) { cases.push({ name: sp[2], ok: sp[1] !== '✖', skip: sp[1] === '﹣', ms: +sp[3] }); continue; }
  const m = /^(not ok|ok) \d+ - (.*?)(?: # (SKIP|TODO).*)?$/.exec(lines[i]);
  if (!m) continue;
  let ms = null;
  for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
    if (/^(not ok|ok) \d+ - /.test(lines[j])) break;
    const d = /^ {2}duration_ms: ([\d.]+)/.exec(lines[j]);
    if (d) { ms = +d[1]; break; }
  }
  cases.push({ name: m[2], ok: m[1] === 'ok', skip: !!m[3], ms });
}
if (!cases.length) process.exit(0);
writeFileSync(file.replace(/(\.\w+)?$/, '.durations.json'), JSON.stringify(cases, null, 1));
const ran = cases.filter((c) => !c.skip && c.ms != null);
const total = ran.reduce((s, c) => s + c.ms, 0);
const top = [...ran].sort((a, b) => b.ms - a.ms).slice(0, +howMany);
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const body = [`${ran.length} cases ran (${cases.length - ran.length} skipped), ${(total / 60000).toFixed(1)} min in cases`]
  .concat(top.map((c) => `${(c.ms / 1000).toFixed(1)} s${c.ok ? '' : ' FAILED'} - ${c.name.slice(0, 110)}`)).join('\n');
console.log(`::notice title=${title} durations::${esc(body)}`);
