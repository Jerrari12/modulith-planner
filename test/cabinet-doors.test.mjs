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
    ['GEN2 Essential Door - 2W-3H', 1],
    ['GEN2 Essential Door - 2W-3H - Right-Hinged', 1],
  ]);
  assert.deepEqual(find(rs, /Cabinet Hinge/).map((r) => [r.name, r.qty]).sort((a, b) => a[0].localeCompare(b[0])), [
    ['GEN2 Cabinet Hinge (1H) - Left-Hinged Door', 2],
    ['GEN2 Cabinet Hinge (1H) - Right-Hinged Door', 2],
  ]);
  assert.deepEqual(find(rs, /Door Latch/).map((r) => [r.name, r.qty]).sort((a, b) => a[0].localeCompare(b[0])), [
    ['GEN2 Door Latch (1H) - Left-Hinged Door', 2],
    ['GEN2 Door Latch (1H) - Right-Hinged Door', 2],
  ]);
  // released 2026-11-21: the Essential door and its hinge and latch are on Printables and Thangs
  for (const r of [...doors, ...find(rs, /Cabinet Hinge|Door Latch/)]) assert.ok(!r.unreleased, `${r.name} is released`);
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
  assert.ok(!knob[0].unreleased, 'the knobs are released with the Essential doors (2026-11-21)');
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

test('the premium door styles with no files stay coming soon; their hardware does not', () => {
  // 2026-11-21: the Essential door, hinges, latches and knobs went live. EdgeLabel and Classic Pro have no files; the
  // Chevron door is released with its own pages (the next test)
  for (const style of ['edgelabel', 'classicpro']) {
    const rs = rows(base({ doorStyle: style, placed: [cab(1, 0, 2, 3)] }));
    const door = find(rs, / Door - 2W-3H$/);
    assert.equal(door.length, 1, `${style}: one door row`);
    assert.ok(door[0].unreleased, `${style}: the door row is still coming soon`);
    assert.ok(find(rs, /Cabinet Hinge|Door Latch/).every((r) => !r.unreleased), `${style}: the hinges and latches are released`);
  }
  assert.ok(!find(rows(base({ placed: [cab(1, 0, 2, 3)] })), / Door - 2W-3H$/)[0].unreleased, 'the Essential door is released');
});

test('the Chevron door is released, in both hands, with its hardware', () => {
  // the MODULITH Chevron Cabinet Doors pages (Printables 1925578, Thangs 1664247)
  assert.ok(!GEN2.unreleased.includes('door:chevron'), 'the Chevron door is out of the unreleased list');
  const rs = rows(base({ doorStyle: 'chevron', placed: [cab(1, 0, 2, 3), cab(2, 2, 1, 1, { hinge: 'right' })] }));
  const doors = find(rs, /^GEN2 Chevron Door - /);
  assert.deepEqual(doors.map((r) => r.name).sort(), ['GEN2 Chevron Door - 1W-1H - Right-Hinged', 'GEN2 Chevron Door - 2W-3H']);
  for (const r of [...doors, ...find(rs, /Cabinet Hinge|Door Latch|Knob$/)]) assert.ok(!r.unreleased, `${r.name} is released`);
});

test('every Essential door, hinge, latch and knob name links the one listing page', () => {
  const names = [
    ...['1W-1H', '4W-6H'].flatMap((s) => [GEN2.partNames.door(240, s, 'Essential', 'left'), GEN2.partNames.door(240, s, 'Essential', 'right')]),
    GEN2.partNames.hinge('left'), GEN2.partNames.hinge('right'), GEN2.partNames.latch('left'), GEN2.partNames.latch('right'),
    GEN2.partNames.knob('Deco'), GEN2.partNames.knob('BlockBar'),
  ];
  const pl = vm.runInContext('partLinks', ctx);
  for (const n of names) {
    const l = pl(n);
    assert.equal(l.printables, 'https://www.printables.com/model/1672641-modulith-essential-cabinet-doors', n);
    assert.ok(l.exactP, `${n}: an exact Printables link`);
    assert.equal(l.thangs, 'https://thangs.com/designer/Jerrari/3d-model/MODULITH%20Essential%20Cabinet%20Doors-1537267', n);
    assert.ok(l.exactT, `${n}: an exact Thangs link`);
  }
  const chev = pl(GEN2.partNames.door(240, '2W-3H', 'Chevron', 'left'));
  assert.notEqual(chev.printables, 'https://www.printables.com/model/1672641-modulith-essential-cabinet-doors', 'a Chevron door does not link the Essential page');
});

test('every Chevron door, in both hands, links its own paid listing page', () => {
  const pl = vm.runInContext('partLinks', ctx);
  const sizes = ['1W-1H', '2W-3H', '4W-6H'];
  for (const n of sizes.flatMap((s) => [GEN2.partNames.door(240, s, 'Chevron', 'left'), GEN2.partNames.door(240, s, 'Chevron', 'right')])) {
    const l = pl(n);
    assert.equal(l.printables, 'https://www.printables.com/model/1925578-modulith-chevron-cabinet-doors', n);
    assert.ok(l.exactP, `${n}: an exact Printables link`);
    assert.equal(l.thangs, 'https://thangs.com/designer/Jerrari/3d-model/MODULITH%20Chevron%20Cabinet%20Doors-1664247', n);
    assert.ok(l.exactT, `${n}: an exact Thangs link`);
  }
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

test('the premium door styles are club, as the premium faceplates; the Essential door and the hardware are free', () => {
  // Joey 2026-11-20: Chevron, EdgeLabel and Classic Pro doors are listed like the premium faceplates - Club and for sale
  assert.deepEqual([...GEN2.doorStyles.filter((s) => s.club).map((s) => s.id)], ['chevron', 'edgelabel', 'classicpro']);   // copied out of the vm realm
  const chev = rows(base({ doorStyle: 'chevron', placed: [cab(1, 0, 2, 3)] }));
  assert.equal(find(chev, /Chevron Door/)[0].club, true, 'the Chevron door row carries CLUB');
  assert.ok(!find(chev, /Cabinet Hinge|Door Latch|Knob|Handle/).some((r) => r.club), 'the hinges, latches and grips stay free');
  const ess = rows(base({ placed: [cab(1, 0, 2, 3)] }));
  assert.ok(!find(ess, /Essential Door/)[0].club, 'the Essential door is free');
});
