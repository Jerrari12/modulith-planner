/* The MODULITH site's committed BOM artifact (data/sources/official-build-boms.json, produced by tools/vendor-build-boms.mjs
   from the OLD planner's computeBom on each official kit) against this repo's ported computeBom on the same kit files: the
   plan's "second consumer" parity check (§1.5), free because the artifact already exists. Skips, pin-only, when the site
   checkout is absent (CI); the artifact's planner commit is reported so a drift is dated. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, loadCatalog, canon, readKit } from './lib.mjs';
import { computeBom } from '../../js/rules/bom.js';
import { sanitizeBuild } from '../../js/rules/schema.js';

const SITE = process.env.SITE_REPO || join(root, '..', 'MODULITH');
const ARTIFACT = join(SITE, 'data', 'sources', 'official-build-boms.json');

test('the site’s official-build BOM artifact equals this repo’s computeBom on every kit', { skip: existsSync(ARTIFACT) ? false : 'site checkout absent' }, () => {
  const { GEN2 } = loadCatalog();
  const art = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
  const kits = Object.keys(art.kits || {});
  assert.ok(kits.length >= 10, `the artifact lists ${kits.length} kits`);
  const mismatches = [];
  for (const id of kits) {
    const file = `${id}.json`;
    let kit; try { kit = readKit(file); } catch { mismatches.push({ id, why: 'no kit file here' }); continue; }
    const rec = JSON.parse(JSON.stringify(kit.build)); sanitizeBuild(rec, GEN2);   // the planner's applyBuild: sanitise in place, then compute
    const mine = canon(computeBom(rec, GEN2));
    const theirs = canon(art.kits[id].bom);
    if (mine !== theirs) mismatches.push({ id, mine: mine.slice(0, 200), theirs: theirs.slice(0, 200) });
  }
  assert.deepEqual(mismatches, [], `${mismatches.length} of ${kits.length} kits differ from the site artifact (planner ${(art.planner || {}).commit || '?'})`);
});
