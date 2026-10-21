/* SIMPLIFY (js/colors/simplify.js, the Colors plan's step 6, 2026-10-18) against the preset rules re-stated HERE (STEP6.md,
   M24), the least-visible / closest-colour choice re-derived here (M25), the summary line (M26's shape), and speed (M28).
   The looks come from the generator (the five styles, caps 3 and 4), worn by two builds: the root kit's keys and a build
   with a shelf, labels, handles and accents. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILAMENT_DB } from '../js/filament-db.js';
import { surprise, PALETTE_KEYS, AREA, ROLE_KEYS } from '../js/colors/surprise.js';
import { STYLES } from '../js/colors/styles.js';
import { simplify, worn, filamentsOf, summarize, problemsOn } from '../js/colors/simplify.js';
import { dE } from '../js/colors/colour.js';

const BY_LABEL = new Map(FILAMENT_DB.flatMap((b) => b.colors.map((c) => [c.label, c])));
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const key = (k, extra = {}) => ({ key: k, type: k.split(':')[0], zone: k.includes(':') ? k.split(':')[1] : '', locked: false, ownColor: false, ...extra });
/* the root kit's regions (a 2W-2H tabletop with Classic faceplates, as keysInBuild lists them) and a fuller build */
const ROOT = ['Case', 'Drawer', 'Faceplate', 'Faceplate:FACE', 'Faceplate:GRIP', 'Faceplate:GRIP ACCENT', 'SideCover', 'SideCover:FACE', 'Foot', 'QuickLock', 'MagnetClip', 'Stopper'].map((k) => key(k)).concat([key('Magnet', { locked: true }), key('Screw', { locked: true })]);
const FULL = ROOT.concat(['CaseExtender', 'ShelfInsert', 'ShelfLip', 'Label', 'Accent', 'Handle', 'CoverL', 'CoverU'].map((k) => key(k)), [key('Label:TEXT', { ownColor: true })]);
const BUILDS = [['root', ROOT], ['full', FULL]];
/* the rules as test/presets.test.mjs states them, on a look as worn, each only when the build has both keys */
function problems(w) {
  const p = []; const both = (a, b) => w[a] && w[b];
  for (const k of ['CaseExtender', 'ShelfLip', 'SideCover']) if (both(k, 'Case') && w[k].name !== w.Case.name) p.push(`${k} ≠ case`);
  if (both('CoverL', 'CoverU') && w.CoverL.name !== w.CoverU.name) p.push('covers differ');
  if (both('FootrailL', 'FootrailU') && w.FootrailL.name !== w.FootrailU.name) p.push('rails differ');
  if (both('SideCover:FACE', 'Faceplate:FACE') && w['SideCover:FACE'].name !== w['Faceplate:FACE'].name) p.push('side-cover face ≠ face');
  if (both('Faceplate:GRIP', 'Faceplate:FACE') && w['Faceplate:GRIP'].name !== w['Faceplate:FACE'].name) p.push('grip ≠ face');
  if (both('Accent', 'Faceplate:FACE') && w.Accent.name === w['Faceplate:FACE'].name) p.push('accent = face');
  if (both('ShelfInsert', 'Case') && contrast(w.ShelfInsert.hex, w.Case.hex) < 4.5) p.push('deck');
  if (both('Label:TEXT', 'Label') && contrast(w['Label:TEXT'].hex, w.Label.hex) < 4.5) p.push('label text');
  for (const f of Object.values(w)) { const real = BY_LABEL.get(f.name); if (!real || real.hex !== f.hex) p.push(`${f.name} is not the catalog`); }
  return p;
}
const looks = [];
for (const s of STYLES) for (const cap of [3, 4]) for (let seed = 1; seed <= 30; seed++) for (const l of surprise({ style: s.id, cap, seed }).looks) looks.push({ style: s.id, seed, colors: l.colors });

test('M24: every simplification keeps the rules, reaches the target or says it cannot, changes only keys that wore a merged filament, and brings nothing in', () => {
  let results = 0, shorts = { root: 0, full: 0 }, two = { root: 0, full: 0 };
  for (const [bname, keys] of BUILDS) for (const l of looks) {
    const w0 = worn(l.colors, keys); const n0 = filamentsOf(w0).length; const names0 = new Set(Object.values(w0).map((f) => f.name));
    for (let target = n0 - 1; target >= 2; target--) {
      const r = simplify({ colors: l.colors, keys, target }); results++;
      const w = worn(r.colors, keys);
      assert.deepEqual(problems(w), [], `${bname} ${l.style}/${l.seed} → ${target}: ${problems(w).join('; ')}`);
      assert.equal(filamentsOf(w).length, r.count, 'the count reported is the count worn');
      if (!r.short) assert.ok(r.count <= target, `${bname} ${l.style}/${l.seed}: ${r.count} > ${target}`); else { shorts[bname]++; assert.ok(r.reason, 'a short result says why'); }
      for (const f of Object.values(w)) assert.ok(names0.has(f.name), `${f.name} came from outside the look`);
      // replaying the changes in order from the original look lands exactly on the result: a key may change twice (merged,
      // then merged again with its new filament), but never without a change that names it
      const replay = Object.fromEntries(Object.entries(w0).map(([k, f]) => [k, f.name]));
      for (const c of r.changes) for (const k of c.keys) { assert.equal(replay[k], c.from.name, `change lists ${k} as wearing ${c.from.name}`); replay[k] = c.to.name; }
      for (const k of Object.keys(w0)) assert.equal(w[k].name, replay[k], `${k} changed without a change naming it`);
      if (target === 2 && !r.short) two[bname]++;
    }
  }
  console.log(`  M24: ${results} simplifications from ${looks.length} looks; short (a target the rules cannot reach): root ${shorts.root}, full ${shorts.full}; reached 2: root ${two.root}, full ${two.full}`);
  assert.ok(results > 500);
});

test('M25: each step removes the least-visible filament a valid merge exists for, into the closest colour of the look', () => {
  let steps = 0;
  for (const [, keys] of BUILDS) for (const l of looks.filter((_, i) => i % 3 === 0)) {
    const w0 = worn(l.colors, keys); const n0 = filamentsOf(w0).length; if (n0 < 3) continue;
    const r = simplify({ colors: l.colors, keys, target: n0 - 1 }); if (r.short) continue;
    assert.equal(r.changes.length, 1); steps++;
    const c = r.changes[0]; const fils = filamentsOf(w0);
    // the test's own derivation: least area first, the closest valid colour
    let expect = null;
    // the feet's TPU is never merged and never merged into (Joey, 2026-10-21: feet are TPU only)
    const onFeet = (x) => x.keys.some((k) => k.split('@').pop().split(':')[0] === 'Foot');
    for (const from of fils) {
      if (onFeet(from)) continue;
      const others = fils.filter((x) => x.name !== from.name && !onFeet(x)).sort((a, b) => dE(a.hex, from.hex) - dE(b.hex, from.hex));
      for (const to of others) { const w = Object.fromEntries(Object.entries(w0).map(([k, f]) => [k, f.name === from.name ? to : f])); if (!problems(w).length) { expect = { from: from.name, to: to.name }; break; } }
      if (expect) break;
    }
    assert.deepEqual({ from: c.from.name, to: c.to.name }, expect, `${l.style}/${l.seed}`);
  }
  console.log(`  M25: ${steps} single steps re-derived`);
  assert.ok(steps > 100);
});

test('per-unit picks of a merged filament move with it; a locked key and an unpicked zone are never touched; a target the look already meets changes nothing', () => {
  const black = BY_LABEL.get('Elegoo PLA Black'), orange = BY_LABEL.get('Printed Solid Mystery Orange'), silver = BY_LABEL.get('Panchroma Silk Silver'), white = BY_LABEL.get('Panchroma Cold White');
  const fil = (f) => ({ name: f.label, hex: f.hex, url: f.url });
  // black shell, orange fronts, silver on the small parts, a handle and the grip accent (area 0.10 + unit 3's own
  // handle 0.05), white labels with black text (0.05 + unit 3's own white face 0.24): the silver is the least visible
  // and goes first, onto the closest colour; unit 3's own silver handle follows it, its own white face stays
  const colors = { Case: fil(black), Drawer: fil(black), Faceplate: fil(black), 'Faceplate:FACE': fil(orange), 'Faceplate:GRIP': fil(orange), 'Faceplate:GRIP ACCENT': fil(silver), SideCover: fil(black), 'SideCover:FACE': fil(orange), QuickLock: fil(silver), MagnetClip: fil(silver), Stopper: fil(silver), Handle: fil(silver), Label: fil(white), 'Label:TEXT': fil(black) };
  const over = { 3: { Handle: fil(silver), 'Faceplate:FACE': fil(white) } };
  // (unit 3's own white face already splits from its orange grip: a problem the look HAD, which Simplify neither fixes
  // nor is blocked by - Sol 01a151f0 asked for the units' own picks to be counted and validated)
  const w0 = worn(colors, FULL, over);
  assert.equal(filamentsOf(w0).length, 4); assert.ok(Object.keys(w0).includes('3@Handle') && Object.keys(w0).includes('3@Faceplate:FACE'), 'the unit\'s own picks are worn');
  const r = simplify({ colors, over, keys: FULL, target: 3 });
  assert.equal(r.count, 3); assert.equal(r.short, false);
  assert.equal(r.changes.length, 1); assert.equal(r.changes[0].from.name, 'Panchroma Silk Silver', 'the silver goes');
  assert.ok(r.changes[0].keys.includes('3@Handle'), 'the change names the unit\'s own handle');
  assert.equal(r.over[3].Handle.name, r.changes[0].to.name, 'the unit\'s own silver handle follows the merge');
  assert.equal(r.over[3]['Faceplate:FACE'].name, 'Panchroma Cold White', 'an own pick of another filament stays');
  assert.equal(r.colors.Magnet, undefined, 'hardware was never in the palette and is not added');
  // the stored hardware entries are left alone by a merge (never printed), the whole look otherwise follows (D3): a build
  // with no labels merges the silver first; the rail (a key this build lacks) follows it, the magnets and screws keep it
  const noLabels = FULL.filter((k) => !/^Label/.test(k.key));
  const withHw = { ...colors, Magnet: fil(silver), Screw: fil(silver), Rail: fil(silver) };
  const r3 = simplify({ colors: withHw, keys: noLabels, target: 2 });
  assert.equal(r3.changes[0].from.name, 'Panchroma Silk Silver');
  assert.equal(r3.colors.Magnet.name, 'Panchroma Silk Silver'); assert.equal(r3.colors.Screw.name, 'Panchroma Silk Silver');
  assert.equal(r3.colors.Rail.name, r3.changes[0].to.name, 'a key the build lacks follows the merge, so a rail added later matches the look');
  // the units' own picks count: three build filaments plus a unit's own fourth is four on the Dock, and Simplify sees four
  const three = { Case: fil(black), Drawer: fil(black), Faceplate: fil(black), 'Faceplate:FACE': fil(orange), 'Faceplate:GRIP': fil(orange), 'Faceplate:GRIP ACCENT': fil(orange), SideCover: fil(black), 'SideCover:FACE': fil(orange), QuickLock: fil(orange), MagnetClip: fil(orange), Stopper: fil(orange), Handle: fil(silver) };
  const own = { 5: { Drawer: fil(white) } };
  assert.equal(filamentsOf(worn(three, FULL, own)).length, 4);
  const r4 = simplify({ colors: three, over: own, keys: FULL, target: 3 });
  assert.equal(r4.count, 3); assert.ok(r4.changes.length === 1 && ['Panchroma Cold White', 'Panchroma Silk Silver'].includes(r4.changes[0].from.name));
  const already = simplify({ colors, over, keys: FULL, target: 4 });
  assert.deepEqual(already.changes, []); assert.equal(already.count, 4);
  const impossible = simplify({ colors: { Case: fil(black), ShelfInsert: fil(white), ShelfLip: fil(black) }, keys: FULL, target: 1 });
  assert.equal(impossible.short, true); assert.match(impossible.reason, /Two filaments must stay/);
});

test('the summary line groups the regions the build has, joins neighbours sharing a filament, splits a group worn in two filaments, and names filaments short', () => {
  const l = surprise({ style: 'workshop', cap: 3, seed: 4 }).looks[1];   // balanced: the accent colour on the face
  const s = summarize(worn(l.colors, FULL));
  // a group worn in two filaments splits by key (Sol 01a151f0: "Case: Black" hid orange feet)
  const split = summarize(worn({ ...l.colors, Foot: l.colors['Faceplate:FACE'] }, FULL));
  assert.ok(split.some((x) => /^Case/.test(x.label) && !/feet/i.test(x.label)) && split.some((x) => /^feet/i.test(x.label) && x.name === l.colors['Faceplate:FACE'].name), JSON.stringify(split));
  assert.ok(s.length >= 3 && s[0].label.startsWith('Case'), JSON.stringify(s));
  const labels = s.map((x) => x.label);
  assert.ok(labels.every((x) => /^[A-Z]/.test(x)), 'each label starts capitalised');
  const words = labels.flatMap((x) => x.split(', '));
  assert.equal(new Set(words.map((w) => w.toLowerCase())).size, words.length, 'every region once');
  for (const x of s) assert.ok(!/^(Panchroma|Polymaker|Printed Solid|Elegoo)/.test(x.filament), x.filament);
  assert.deepEqual(summarize({}), []);
  const root = summarize(worn(l.colors, ROOT)).map((x) => x.label.toLowerCase());
  assert.ok(!root.some((x) => /deck|labels|handles|(^|, )accents/.test(x)), `the root kit has no deck, labels, handles or accents: ${root.join(' | ')}`);
});

test('M28: a 27-key look to every target, timed (the laptop mark is median ≤ 5 ms; this gate is loose for the CI runner)', () => {
  const ms = [];
  for (let i = 0; i < 300; i++) { const l = looks[i % looks.length]; const t = performance.now(); simplify({ colors: l.colors, keys: FULL, target: 2 }); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  console.log(`  M28: median ${ms[150].toFixed(2)} ms, max ${ms[299].toFixed(2)} ms over 300 calls`);
  assert.ok(ms[150] <= 25 && ms[299] <= 250, `median ${ms[150].toFixed(1)}, max ${ms[299].toFixed(1)}`);
  assert.equal(Object.keys(AREA).length, 11); assert.equal(PALETTE_KEYS.length, 28); assert.ok(ROLE_KEYS.hardware.includes('Screw'));
  assert.deepEqual(problemsOn({}), []);
});
