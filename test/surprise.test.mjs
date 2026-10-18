/* THE LOOK GENERATOR (js/colors/surprise.js; the Colors plan's step 5 and Astra's refinement 5b, 2026-10-18) against the
   preset rules, re-stated HERE independently of the generator's own validator (STEP5.md M11, STEP5B.md M16): every look it
   returns, over every style, cap and three catalogs (the whole one; an owned list of eight; an owned list of three), for a
   hundred seeds each, passes the rules test/presets.test.mjs holds the presets to, keeps to the cap and the owned list, and
   never picks a translucent colour. Then style fidelity (M17), the three interpretations (M18), silk shells (M19),
   availability (M20), names (M21), speed (M13), determinism, locks, "more like this", and settings that admit no look. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILAMENT_DB } from '../js/filament-db.js';
import { surprise, checkLook, catalog, PALETTE_KEYS, ROLE_KEYS, CAPS, SLOTS, AREA, HARDWARE, areaOf } from '../js/colors/surprise.js';
import { STYLES } from '../js/colors/styles.js';

const BY_LABEL = new Map(FILAMENT_DB.flatMap((b) => b.colors.map((c) => [c.label, { ...c, silk: /Silk/.test(b.line) }])));
/* the presets test's own contrast formula, copied, not imported: this file must not lean on the module under test */
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const PRESET_KEYS = ['Case', 'Drawer', 'CoverL', 'CoverU', 'Bracket', 'FootrailL', 'FootrailU', 'Foot', 'Rail', 'CaseExtender', 'ShelfInsert', 'ShelfLip', 'SideCover', 'SideCover:FACE', 'Faceplate', 'Faceplate:FACE', 'Faceplate:GRIP', 'Faceplate:GRIP ACCENT', 'Accent', 'Label', 'Label:TEXT', 'BackCover', 'Handle', 'QuickLock', 'MagnetClip', 'Stopper', 'Magnet', 'Screw'];
const HARDWARE_KEYS = ['Magnet', 'Screw'];
const printedNames = (look) => new Set(PRESET_KEYS.filter((k) => !HARDWARE_KEYS.includes(k)).map((k) => look.colors[k].name));

/* the rules, as test/presets.test.mjs states them, plus this step's own (the cap, the owned list, no translucent, the
   covers and foot rails in pairs, the label text legible) */
function problems(look, { cap, owned }) {
  const c = look.colors; const p = [];
  for (const k of PRESET_KEYS) {
    const f = c[k]; const real = f && BY_LABEL.get(f.name);
    if (!real) { p.push(`${k}: ${f && f.name} is not a catalog label`); continue; }
    if (real.hex !== f.hex) p.push(`${k}: hex differs from the catalog`);
    if (!/^https?:\/\//.test(f.url || '')) p.push(`${k}: no buyable url`);
    if (real.translucent && !HARDWARE_KEYS.includes(k)) p.push(`${k}: translucent`);
  }
  if (p.length) return p;
  if (c.CaseExtender.name !== c.Case.name) p.push('extender ≠ case');
  if (c.ShelfLip.name !== c.Case.name) p.push('lip ≠ case');
  if (c.SideCover.name !== c.Case.name) p.push('side-cover core ≠ case');
  if (c['SideCover:FACE'].name !== c['Faceplate:FACE'].name) p.push('side-cover face ≠ faceplate face');
  if (c['Faceplate:GRIP'].name !== c['Faceplate:FACE'].name) p.push('grip ≠ face');
  if (c.Accent.name === c['Faceplate:FACE'].name) p.push('accent = face');
  if (c.CoverL.name !== c.CoverU.name) p.push('covers differ');
  if (c.FootrailL.name !== c.FootrailU.name) p.push('foot rails differ');
  if (contrast(c.ShelfInsert.hex, c.Case.hex) < 4.5) p.push(`deck ${contrast(c.ShelfInsert.hex, c.Case.hex).toFixed(2)}:1`);
  if (!PRESET_KEYS.some((k) => k !== 'ShelfInsert' && c[k].name === c.ShelfInsert.name)) p.push('deck from outside the look');
  if (contrast(c['Label:TEXT'].hex, c.Label.hex) < 4.5) p.push('label text illegible');
  const printed = printedNames(look);
  if (printed.size > cap) p.push(`${printed.size} filaments over a cap of ${cap}`);
  if (owned) for (const n of printed) if (!owned.has(n)) p.push(`${n} not owned`);
  return p;
}
/* this file's own copy of the visible-area weights and the accent share, so M18 does not lean on the module's helper */
const WEIGHTS = { shell: 0.44, face: 0.24, deck: 0.06, drawer: 0.06, handle: 0.05, accent: 0.05, label: 0.05, small: 0.03, gripAccent: 0.02 };
const share = (look) => +Object.entries(WEIGHTS).reduce((s, [role, w]) => s + (look.roles[role] === look.accent ? w : 0), 0).toFixed(3);

const OWNED_8 = ['Elegoo PLA Black', 'Panchroma Cold White', 'Printed Solid Mystery Orange', 'Panchroma Silk Silver', 'Polymaker PETG Yellow', 'Panchroma Azure Blue', 'Panchroma Steel Grey', 'Panchroma Red'];
const OWNED_3 = ['Elegoo PLA Black', 'Panchroma Cold White', 'Printed Solid Mystery Orange'];
const CATALOGS = [['whole', null], ['owned 8', OWNED_8], ['owned 3', OWNED_3]];
const SEEDS = 100;
const IDS = STYLES.map((s) => s.id);

test('M16: every look returned, over 5 styles × 3 caps × 3 catalogs × 100 seeds, passes the preset rules, the cap and the owned list', () => {
  let looks = 0, calls = 0; const bad = []; const report = [];
  for (const style of IDS) for (const cap of CAPS) for (const [cname, owned] of CATALOGS) {
    let got = 0, three = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = surprise({ style, cap, owned, seed }); calls++;
      if (r.looks.length === 3) three++;
      for (const l of r.looks) { looks++; got++; const p = problems(l, { cap, owned: owned && new Set(owned) }); if (p.length) bad.push(`${style}/${cap}/${cname}/seed ${seed} "${l.name}": ${p.join('; ')}`); }
    }
    report.push(`${style.padEnd(8)} cap ${cap} ${cname.padEnd(8)} ${(got / SEEDS).toFixed(2)} looks a call, three in ${three} of ${SEEDS}`);
  }
  console.log(`  M16 report (${looks} looks from ${calls} calls):\n    ${report.join('\n    ')}`);
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} of ${looks} looks break a rule`);
  assert.ok(looks > 2000, `the generator produced looks to check (${looks})`);
  // M20: on the whole catalog the four open styles give three at every cap of 3 and 4 in 95 % of calls; Retro pop reported
  for (const line of report) if (/whole/.test(line) && !/^retro/.test(line) && !/cap 2/.test(line)) assert.match(line, /three in (9[5-9]|100) of 100$/, line);
});

test('M17: every colour of a look is in its style\'s pools (the test\'s own reading of the style: shells, accents, neutrals by label)', () => {
  const cat = catalog().list.filter((c) => !c.translucent);
  for (const s of STYLES.filter((x) => x.id !== 'any')) {
    const allowed = new Set(cat.filter((c) => s.shells(c) || s.accents(c) || s.neutrals(c)).map((c) => c.name));
    const shells = new Set(cat.filter(s.shells).map((c) => c.name)), accents = new Set(cat.filter(s.accents).map((c) => c.name));
    for (let seed = 1; seed <= 60; seed++) for (const l of surprise({ style: s.id, cap: 4, seed }).looks) {
      assert.ok(shells.has(l.colors.Case.name), `${s.id} seed ${seed}: shell ${l.colors.Case.name}`);
      assert.ok(accents.has(l.accent), `${s.id} seed ${seed}: accent ${l.accent}`);
      for (const n of printedNames(l)) assert.ok(allowed.has(n), `${s.id} seed ${seed}: ${n} is outside the style`);
    }
  }
});

test('M18: the three interpretations differ visibly: the share of visible area carrying the accent colour rises from the first candidate to the third', () => {
  let sets = 0, shares = { quiet: [], balanced: [], bold: [] };
  for (const style of IDS) for (const cap of [3, 4]) for (let seed = 1; seed <= 60; seed++) {
    const { looks } = surprise({ style, cap, seed });
    if (looks.length === 3) sets++;
    for (let i = 1; i < looks.length; i++) assert.ok(share(looks[i]) > share(looks[i - 1]), `${style}/${cap}/seed ${seed}: ${looks.map((l) => `${l.slot} ${share(l)}`).join(' < ')}`);
    for (const l of looks) { shares[l.slot].push(share(l)); assert.equal(share(l), l.share, 'the module\'s share agrees'); }
  }
  const mid = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`  M18: ${sets} sets of three; accent share medians quiet ${mid(shares.quiet)}, balanced ${mid(shares.balanced)}, bold ${mid(shares.bold)}`);
  assert.ok(sets >= 500, `sets of three (${sets})`);
  assert.deepEqual(SLOTS, ['quiet', 'balanced', 'bold']);
  assert.ok(Math.abs(Object.values(AREA).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'the area weights sum to one');
});

test('M19: shiny finishes are not the default: silk shells under 15 % for Warm & natural, Clean & calm and Workshop classic', () => {
  for (const s of STYLES) {
    let n = 0, silk = 0, silkAccent = 0;
    for (let seed = 1; seed <= 100; seed++) for (const l of surprise({ style: s.id, cap: 3, seed }).looks) { n++; if (BY_LABEL.get(l.colors.Case.name).silk) silk++; if (BY_LABEL.get(l.accent).silk) silkAccent++; }
    console.log(`  M19 ${s.id.padEnd(8)} silk shells ${(100 * silk / n).toFixed(0)} %, silk accents ${(100 * silkAccent / n).toFixed(0) } % of ${n}`);
    if (['warm', 'calm', 'workshop'].includes(s.id)) assert.ok(silk / n <= 0.15, `${s.id}: ${silk} silk shells of ${n}`);
  }
});

test('M21: the three candidates of a roll carry three different names; a name is two colour words', () => {
  let sets = 0;
  for (const style of IDS) for (let seed = 1; seed <= 60; seed++) {
    const { looks } = surprise({ style, cap: 3, seed });
    if (looks.length < 2) continue; sets++;
    assert.equal(new Set(looks.map((l) => l.name)).size, looks.length, `${style}/seed ${seed}: ${looks.map((l) => l.name).join(' | ')}`);
    for (const l of looks) assert.match(l.name, /^[A-Z][a-z ]+ & [a-z ]+(, a touch of [a-z ]+)?(, [a-z ]+)?$/, l.name);
  }
  console.log(`  M21: ${sets} sets named apart; e.g. ${surprise({ style: 'workshop', cap: 3, seed: 7 }).looks.map((l) => l.name).join(' | ')}`);
});

test('the generator\'s own validator and this file\'s rules agree, and the validator catches a broken look', () => {
  const r = surprise({ style: 'workshop', cap: 3, seed: 7 });
  for (const l of r.looks) assert.deepEqual(checkLook(l.colors, { cap: 3 }), [], l.name);
  const broken = structuredClone(r.looks[1].colors);
  broken['Faceplate:GRIP'] = broken.Case;   // the grip off the face
  assert.ok(checkLook(broken, { cap: 3 }).some((x) => /grip/.test(x)), 'a grip off the face is caught');
  const over = structuredClone(r.looks[1].colors); over.Handle = { name: 'Panchroma Lime Green', hex: '#9ccb3b', url: 'https://x.test/' };
  assert.ok(checkLook(over, { cap: 2 }).some((x) => /cap|differs/.test(x)), 'a wrong hex or a fourth filament under a cap of 2 is caught');
});

test('M13: three candidates in one call, the whole catalog, every style and cap: timed (the laptop mark is median ≤ 20 ms; this gate is loose for the CI runner)', () => {
  catalog();
  const ms = [];
  for (let i = 0; i < 300; i++) { const t = performance.now(); surprise({ style: IDS[i % 5], cap: CAPS[(i / 5 | 0) % 3], seed: 1000 + i }); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  console.log(`  M13: median ${ms[150].toFixed(2)} ms, p90 ${ms[269].toFixed(2)} ms, max ${ms[299].toFixed(2)} ms over 300 calls`);
  assert.ok(ms[150] <= 60 && ms[299] <= 400, `median ${ms[150].toFixed(1)} ms, max ${ms[299].toFixed(1)} ms`);
});

test('the same seed and settings give the same looks; a different seed gives different ones', () => {
  const a = surprise({ style: 'any', cap: 4, seed: 42 }), b = surprise({ style: 'any', cap: 4, seed: 42 }), c = surprise({ style: 'any', cap: 4, seed: 43 });
  assert.deepEqual(a.looks.map((l) => l.colors), b.looks.map((l) => l.colors));
  assert.notDeepEqual(a.looks.map((l) => l.name), c.looks.map((l) => l.name));
  assert.equal(a.looks.length, 3);
});

test('a lock fixes its role in every look (and the rules still hold); a lock the rules cannot meet admits no look; a locked face may be the shell', () => {
  const red = BY_LABEL.get('Panchroma Red'), black = BY_LABEL.get('Elegoo PLA Black'), grey = BY_LABEL.get('Panchroma Dark Grey');
  const fil = (f) => ({ name: f.label, hex: f.hex, url: f.url });
  for (let seed = 1; seed <= 20; seed++) {
    const { looks } = surprise({ style: 'any', cap: 3, seed, locks: { shell: fil(red) } });
    assert.ok(looks.length >= 1, `seed ${seed}: a red shell admits looks`);
    for (const l of looks) { for (const k of ROLE_KEYS.shell) assert.equal(l.colors[k].name, 'Panchroma Red', k); assert.deepEqual(problems(l, { cap: 3, owned: null }), []); }
  }
  // a locked colour wins over the style (a black shell under Warm & natural, whose shells are light) and over the owned
  // list (black unticked); a red shell with that list admits nothing, since no colour in it reaches 4.5:1 against red
  const r = surprise({ style: 'warm', cap: 3, seed: 5, locks: { shell: fil(black) }, owned: ['Panchroma Cold White', 'Panchroma Tan', 'Panchroma Brown', 'Panchroma Steel Grey'] });
  assert.ok(r.looks.length && r.looks.every((l) => l.colors.Case.name === 'Elegoo PLA Black'), `the lock is kept (${r.looks.length} looks)`);
  assert.deepEqual(surprise({ style: 'calm', cap: 3, seed: 5, locks: { shell: fil(red) }, owned: OWNED_8.filter((n) => n !== 'Panchroma Red') }).looks, [], 'nothing in that list reads at 4.5:1 against red: no deck, no look');
  // the deck locked to dark grey on a black case: 1.64:1, the Stealth bug of 2026-08; nothing fits
  const none = surprise({ style: 'workshop', cap: 3, seed: 5, locks: { shell: fil(black), deck: fil(grey) } });
  assert.deepEqual(none.looks, []); assert.equal(none.short, true);
  // the case and the face locked to ONE filament (Black & gold wears a black face on a black shell): looks, the accent elsewhere
  const same = surprise({ style: 'workshop', cap: 3, seed: 5, locks: { shell: fil(black), face: fil(black) } });
  assert.ok(same.looks.length >= 1, 'a black shell with a locked black face admits looks');
  for (const l of same.looks) { assert.equal(l.colors['Faceplate:FACE'].name, 'Elegoo PLA Black'); assert.notEqual(l.colors.Accent.name, 'Elegoo PLA Black'); assert.deepEqual(problems(l, { cap: 3, owned: null }), []); }
  for (let seed = 1; seed <= 30; seed++) for (const l of surprise({ style: 'workshop', cap: 2, seed }).looks) assert.notEqual(l.colors['Faceplate:FACE'].name, l.colors.Case.name, `seed ${seed}: a rolled face is never the shell`);
});

test('"more like this" keeps the accent colour and the interpretation on other shells; an impossible owned list returns nothing, not an error; the cap of 2 gives two interpretations', () => {
  const base = surprise({ style: 'workshop', cap: 3, seed: 11 }).looks[1];
  for (let seed = 12; seed < 42; seed++) {
    const like = surprise({ style: 'workshop', cap: 3, seed, like: { accent: base.accent, slot: base.slot, notShell: base.roles.shell } });
    assert.ok(like.looks.length >= 2, `seed ${seed}: like admits looks (${like.looks.length})`);
    for (const l of like.looks) { assert.equal(l.accent, base.accent); assert.equal(l.slot, base.slot); assert.notEqual(l.colors.Case.name, base.colors.Case.name, `seed ${seed}: never the candidate's own shell (Sol 01a15101)`); }
    assert.equal(new Set(like.looks.map((l) => l.colors.Case.name)).size, like.looks.length, 'other shells');
  }
  const none = surprise({ style: 'any', cap: 2, seed: 1, owned: ['Elegoo PLA Black', 'Panchroma Black', 'Panchroma Dark Grey'] });
  assert.deepEqual(none.looks, []); assert.equal(none.short, true);
  const two = surprise({ style: 'any', cap: 2, seed: 1 });
  assert.deepEqual(two.looks.map((l) => l.slot), ['balanced', 'bold'], 'a quiet look needs a third colour for its face: two filaments give the other two interpretations');
  assert.equal(two.short, true);
  const one = surprise({ style: 'any', cap: 2, seed: 1, owned: ['Elegoo PLA Black', 'Printed Solid Mystery Orange'] });
  assert.ok(one.looks.length >= 1 && one.short, 'two owned filaments at cap 2: the pair, reported short');
});

test('the hardware is the presets\' silk silver; a look reports its accent and share', () => {
  const l = surprise({ style: 'retro', cap: 3, seed: 3 }).looks[0];
  assert.equal(l.colors.Magnet.name, HARDWARE); assert.equal(l.colors.Screw.name, HARDWARE);
  assert.ok(BY_LABEL.has(l.accent) && l.share === areaOf(l.roles, l.accent));
});
