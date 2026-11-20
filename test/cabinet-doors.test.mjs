/* CABINET DOORS (2026-11-19): the hinge side, the handed hardware, and the door's grip.
 *
 * - A cabinet is left-hinged unless its unit carries `hinge: "right"`; sanitizeBuild keeps only that value, so old builds
 *   and share links (which carry nothing) decode as left-hinged, unchanged.
 * - The hinge and latch sets are handed (each part differs from its mirror image), so the parts list names the hand, and
 *   a right-hinged door is its own part.
 * - A 1H door takes ONE knob on a centre hole (a handle's 44 mm hole pair would reach into the units above and below,
 *   Joey 2026-11-18); a 2H+ door takes a bolt-on handle. One M3 screw per knob, two per handle, 8 mm on an Essential
 *   door and 10 mm on a Chevron door (the screw is spent 3.5 / 5.0 mm in the door).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { computeBom, bomRows } from '../js/rules/bom.js';
import { sanitizeBuild } from '../js/rules/schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['js/vendor/requirement-scope.js', 'js/catalog/data.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
const GEN2 = vm.runInContext('GEN2', ctx);

const base = (o = {}) => ({ mount: 'tabletop', length: 240, gridH: 8, gridW: 8, nextId: 50, feet: 'tpu', faceStyle: 'essential',
  doorStyle: 'essential', handleStyle: 'deco', placed: [], ...o });
const cab = (id, x, w, h, o = {}) => ({ id, x, y: 8 - 2 * h, w, hh: 2 * h, fill: 'cabinet', ...o });
const rows = (b) => { sanitizeBuild(b, GEN2); return bomRows(computeBom(b, GEN2) || [], null); };
const find = (rs, re) => rs.filter((r) => re.test(r.name));

test('sanitizeBuild keeps hinge "right" on a cabinet only, and never writes a left hinge', () => {
  const b = base({ placed: [cab(1, 0, 1, 1, { hinge: 'right' }), cab(2, 1, 1, 1, { hinge: 'left' }), cab(3, 2, 1, 1),
    { id: 4, x: 3, y: 6, w: 1, hh: 2, fill: 'shelf', hinge: 'right' }] });
  sanitizeBuild(b, GEN2);
  const by = Object.fromEntries(b.placed.map((u) => [u.id, u]));
  assert.equal(by[1].hinge, 'right');
  assert.equal('hinge' in by[2], false, 'a left hinge is the absence of the field');
  assert.equal('hinge' in by[3], false);
  assert.equal('hinge' in by[4], false, 'only cabinets have a hinge side');
});

test('a left- and a right-hinged cabinet bill their own doors and handed hinge and latch sets', () => {
  const rs = rows(base({ placed: [cab(1, 0, 2, 3), cab(2, 2, 2, 3, { hinge: 'right' })] }));
  const doors = find(rs, /Door - 2W-3H/);
  assert.deepEqual(doors.map((r) => [r.name, r.qty]).sort((a, b) => a[0].localeCompare(b[0])), [
    ['GEN2 240 Essential Door - 2W-3H', 1],
    ['GEN2 240 Essential Door - 2W-3H - Right-Hinged', 1],
  ]);
  assert.deepEqual(find(rs, /Cabinet Hinge/).map((r) => [r.name, r.qty]).sort((a, b) => a[0].localeCompare(b[0])), [
    ['GEN2 Cabinet Hinge (1H) - Left-Hinged Door', 2],
    ['GEN2 Cabinet Hinge (1H) - Right-Hinged Door', 2],
  ]);
  assert.deepEqual(find(rs, /Door Latch/).map((r) => [r.name, r.qty]).sort((a, b) => a[0].localeCompare(b[0])), [
    ['GEN2 Door Latch (1H) - Left-Hinged Door', 2],
    ['GEN2 Door Latch (1H) - Right-Hinged Door', 2],
  ]);
  for (const r of [...doors, ...find(rs, /Cabinet Hinge|Door Latch/)]) assert.ok(r.unreleased, `${r.name} is still unreleased`);
});

test('each latch takes two 10×2 mm magnets, one per clip', () => {
  const rs = rows(base({ placed: [cab(1, 0, 1, 1), cab(2, 1, 2, 3, { hinge: 'right' })] }));
  const mags = rs.filter((r) => r.name === 'Magnets 10×2mm or 6×2mm');
  assert.equal(mags.reduce((n, r) => n + r.qty, 0), 2 * (1 + 2), 'a 1H cabinet has 1 latch, a 3H has 2');
  assert.match(mags[0].note, /10×2 mm/);
});

test('a 1H door takes one knob and one screw; a taller door takes a handle and two', () => {
  const rs = rows(base({ placed: [cab(1, 0, 1, 1), cab(2, 1, 2, 1), cab(3, 3, 2, 2)] }));
  const knob = find(rs, /Knob$/);
  assert.equal(knob.length, 1);
  assert.equal(knob[0].name, 'GEN2 Deco Knob');
  assert.equal(knob[0].qty, 2, 'two 1H cabinets');
  assert.ok(knob[0].unreleased, 'the knobs are not published yet');
  const handle = rs.filter((r) => r.name === 'GEN2 Decor Handles - Deco Series');
  assert.equal(handle.reduce((n, r) => n + r.qty, 0), 1, 'one 2H cabinet');
  const screw = find(rs, /^M3×8mm button head screw$/);
  assert.equal(screw.reduce((n, r) => n + r.qty, 0), 2 + 2, 'one per knob, two per handle');
});

test('the screw length follows the door style, and a series with no knob falls back to the Deco knob', () => {
  const chev = rows(base({ doorStyle: 'chevron', placed: [cab(1, 0, 1, 1)] }));
  assert.equal(find(chev, /^M3×10mm button head screw$/).length, 1, 'Chevron: M3×10');
  assert.equal(find(chev, /^M3×8mm/).length, 0);
  assert.equal(find(chev, /Chevron Door - 1W-1H$/).length, 1, 'the Chevron door is billed');
  const crystal = rows(base({ handleStyle: 'crystal', placed: [cab(1, 0, 1, 1)] }));
  assert.equal(find(crystal, /Knob$/)[0].name, 'GEN2 Deco Knob');
  const bb = rows(base({ handleStyle: 'blockbar', placed: [cab(1, 0, 1, 1)] }));
  assert.equal(find(bb, /Knob$/)[0].name, 'GEN2 BlockBar Knob');
});

test('a door style with no model gets no screw length', () => {
  const rs = rows(base({ doorStyle: 'edgelabel', placed: [cab(1, 0, 1, 1)] }));
  const s = find(rs, /button head screw$/);
  assert.equal(s.length, 1);
  assert.equal(s[0].name, 'M3 button head screw');
  assert.match(s[0].note, /no screw length is recorded for the EdgeLabel door yet/);
});

test('Chevron is a door style, and the old ids are still accepted', () => {
  assert.deepEqual([...GEN2.doorStyles.map((s) => s.id)], ['essential', 'chevron', 'edgelabel', 'classicpro']);
});
