/* A FRESH PORT KEEPS WHAT THIS REPO HAS AHEAD OF THE OLD PLANNER (2026-10-22).
 *
 * js/rules/bom.js and js/rules/schema.js are generated from the old planner's app.js by tools/port-rules.mjs, which
 * rewrites them whole. The Side covers toggle (2026-10-20), the per-run side covers (2026-10-16) and the back cover's
 * tear-away note (2026-10-20) were hand edits in them until 2026-10-22, so the next port would have dropped all three;
 * now tools/port-ahead.mjs carries them and the port applies them. This ports FRESH, into a temp directory, from the
 * old planner checkout as it is now, and runs the generated modules - not the committed ones, which
 * test/side-covers.test.mjs, test/bom-runs.test.mjs and test/back-cover-tearaway.test.mjs hold. An entry deleted, or
 * one the old planner has moved under, fails here in npm test, without waiting for someone to run `npm run drift`.
 *
 * Skips when the planner checkout is absent (CI), like the parity gate: nothing is ported there.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, havePlanner, loadCatalog } from './parity/lib.mjs';

const skip = !havePlanner && 'planner checkout not present - nothing to port';

/* port into a fresh directory and load what it wrote (a package.json there makes the .js files modules) */
async function freshPort() {
  const dir = mkdtempSync(join(tmpdir(), 'port-ahead-'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  try {
    try { execFileSync(process.execPath, [join(root, 'tools', 'port-rules.mjs'), '--out', dir], { cwd: root, stdio: 'pipe' }); } catch (e) {
      const err = (e.stderr || '').toString().trim().split('\n');
      assert.fail('the port stopped: ' + (err.find((l) => /^Error: /.test(l)) || err.join(' | ')));
    }
    const load = (f) => import(pathToFileURL(join(dir, f)).href);
    return { bom: await load('bom.js'), schema: await load('schema.js') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('a fresh port keeps the Side covers toggle, the per-run side covers and the tear-away note', { skip }, async () => {
  const { bom, schema } = await freshPort();
  const { GEN2 } = loadCatalog();
  const record = (o) => {
    const b = { mount: 'tabletop', length: 185, gridW: 8, gridH: 4, nextId: 50, ...o,
      placed: o.placed.map((p, i) => ({ id: i + 1, y: 2, hh: 2, fill: 'decor', shelves: 0, closure: 'none', ...p })) };
    schema.sanitizeBuild(b, GEN2);
    return b;
  };
  const rows = (b) => bom.bomRows(bom.computeBom(b, GEN2) || [], null);
  const sideCovers = (b) => rows(b).filter((r) => /Side Cover/.test(r.name)).reduce((n, r) => n + r.qty, 0);
  const row = [{ x: 0, w: 2 }, { x: 2, w: 1 }, { x: 3, w: 1 }];

  // the toggle's field: in the record's fields, only an explicit false is off, and the record carries it
  assert.ok(schema.BUILD_FIELDS.includes('sideCovers'), 'BUILD_FIELDS lost sideCovers: a saved or linked build would forget the toggle');
  assert.equal(record({ placed: row }).sideCovers, true, 'a record without the field reads as on');
  assert.equal(record({ placed: row, sideCovers: false }).sideCovers, false, 'an explicit false survives sanitize');
  for (const junk of [0, '', null, 'false']) assert.equal(record({ placed: row, sideCovers: junk }).sideCovers, true, `${JSON.stringify(junk)} reads as on`);
  assert.equal(schema.serializeBuild(record({ placed: row, sideCovers: false })).sideCovers, false, 'serializeBuild drops the field');

  // the toggle in the bill: off takes the side cover rows away and nothing else
  const on = record({ placed: row }), off = record({ placed: row, sideCovers: false });
  assert.equal(sideCovers(on), 2, 'one row of units, two ends');
  assert.equal(sideCovers(off), 0, 'sideCovers false still bills side covers: the toggle\'s gate is gone from bom.js');
  const rest = (b) => JSON.stringify(rows(b).filter((r) => !/Side Cover/.test(r.name)));
  assert.equal(rest(off), rest(on), 'the toggle changed rows other than the side covers');

  // the per-run side covers: a tabletop with a gap is two sections, four ends
  assert.equal(sideCovers(record({ placed: [{ x: 0, w: 2 }, { x: 2, w: 1 }, { x: 5, w: 1 }, { x: 6, w: 1 }] })), 4,
    'a gap build bills only the two outermost ends: the per-run rule is gone from bom.js');

  // the back cover's tear-away note
  const cover = rows(record({ placed: row, backCover: true })).find((r) => /Faceplate Back Cover/.test(r.name));
  assert.ok(cover, 'no back cover row with the back cover on');
  assert.match(cover.note, /Take the drawer's tear-away front out first/, 'the back cover row lost its tear-away sentence');
});

test('an AHEAD edit that no longer applies stops the port, naming itself', { skip }, async () => {
  const { applyAhead, AHEAD } = await import(pathToFileURL(join(root, 'tools', 'port-ahead.mjs')).href);
  const a = AHEAD.find((x) => x.id === 'side-covers-toggle-bom');
  const [from, to] = a.edits[0];
  assert.throws(() => applyAhead(a.file, 'nothing of it'), /side-covers-per-run.*moved under it/, 'a vanished text must stop the port');
  // the old planner carrying the change itself: the entry must go, not apply twice
  const carried = AHEAD.filter((x) => x.file === a.file && x.id !== a.id).flatMap((x) => x.edits.map(([f]) => f)).join('\n') + '\n' + to;
  assert.throws(() => applyAhead(a.file, carried), /side-covers-toggle-bom.*carries it now/);
  // and twice over is ambiguous, never a guess
  const twice = AHEAD.filter((x) => x.file === a.file && x.id !== a.id).flatMap((x) => x.edits.map(([f]) => f)).join('\n') + '\n' + from + '\n' + from;
  assert.throws(() => applyAhead(a.file, twice), /side-covers-toggle-bom.*found 2 times/);
  // an insert-only edit (its `from` inside its `to`), already carried, is not applied a second time
  const s = AHEAD.find((x) => x.id === 'side-covers-toggle-field');
  const [sf, st] = s.edits[1];
  assert.ok(st.includes(sf), 'this check wants the insert-only edit');
  assert.throws(() => applyAhead(s.file, s.edits[0][0] + '\n' + st), /side-covers-toggle-field.*edit 2 of 2.*carries it now/);
});
