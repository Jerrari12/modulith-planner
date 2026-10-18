/* THE LOOK GENERATOR (js/colors/surprise.js, the Colors plan's step 5, 2026-10-18) against the preset rules, re-stated HERE
   independently of the generator's own validator (STEP5.md, M11): every look it returns, over every mood, cap and three
   catalogs (the whole one; an owned list of eight; an owned list of three), for a hundred seeds each, passes the rules
   test/presets.test.mjs holds the presets to, keeps to the cap and the owned list, and never picks a translucent colour.
   Then variety (M12), speed (M13), determinism, locks, "more like this", and the settings that admit no look. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILAMENT_DB } from '../js/filament-db.js';
import { surprise, checkLook, catalog, PALETTE_KEYS, ROLE_KEYS, MOODS, CAPS, HARDWARE, shortName } from '../js/colors/surprise.js';

const BY_LABEL = new Map(FILAMENT_DB.flatMap((b) => b.colors.map((c) => [c.label, { ...c, silk: /Silk/.test(b.line) }])));
/* the presets test's own contrast formula, copied, not imported: this file must not lean on the module under test */
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const PRESET_KEYS = ['Case', 'Drawer', 'CoverL', 'CoverU', 'Bracket', 'FootrailL', 'FootrailU', 'Foot', 'Rail', 'CaseExtender', 'ShelfInsert', 'ShelfLip', 'SideCover', 'SideCover:FACE', 'Faceplate', 'Faceplate:FACE', 'Faceplate:GRIP', 'Faceplate:GRIP ACCENT', 'Accent', 'Label', 'Label:TEXT', 'BackCover', 'Handle', 'QuickLock', 'MagnetClip', 'Stopper', 'Magnet', 'Screw'];
const HARDWARE_KEYS = ['Magnet', 'Screw'];

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
  const printed = new Set(PRESET_KEYS.filter((k) => !HARDWARE_KEYS.includes(k)).map((k) => c[k].name));
  if (printed.size > cap) p.push(`${printed.size} filaments over a cap of ${cap}`);
  if (owned) for (const n of printed) if (!owned.has(n)) p.push(`${n} not owned`);
  return p;
}

const OWNED_8 = ['Elegoo PLA Black', 'Panchroma Cold White', 'Printed Solid Mystery Orange', 'Panchroma Silk Silver', 'Polymaker PETG Yellow', 'Panchroma Azure Blue', 'Panchroma Steel Grey', 'Panchroma Red'];
const OWNED_3 = ['Elegoo PLA Black', 'Panchroma Cold White', 'Printed Solid Mystery Orange'];
const CATALOGS = [['whole', null], ['owned 8', OWNED_8], ['owned 3', OWNED_3]];
const SEEDS = 100;

test('M11: every look returned, over 3 moods × 3 caps × 3 catalogs × 100 seeds, passes the preset rules, the cap and the owned list', () => {
  let looks = 0, calls = 0, shortCalls = 0; const bad = []; const report = [];
  for (const mood of MOODS) for (const cap of CAPS) for (const [cname, owned] of CATALOGS) {
    let got = 0, short = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = surprise({ mood, cap, owned, seed }); calls++;
      if (r.short) short++;
      for (const l of r.looks) { looks++; got++; const p = problems(l, { cap, owned: owned && new Set(owned) }); if (p.length) bad.push(`${mood}/${cap}/${cname}/seed ${seed} "${l.name}": ${p.join('; ')}`); }
    }
    shortCalls += short;
    report.push(`${mood.padEnd(7)} cap ${cap} ${cname.padEnd(8)} ${(got / SEEDS).toFixed(2)} looks a call, ${short} of ${SEEDS} calls short`);
  }
  console.log(`  M11 report (${looks} looks from ${calls} calls, ${shortCalls} calls returned fewer than three):\n    ${report.join('\n    ')}`);
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} of ${looks} looks break a rule`);
  assert.ok(looks > 2000, `the generator produced looks to check (${looks})`);
  // the whole catalog and the eight owned filaments give three every time at every cap; three owned filaments may not
  for (const line of report) if (/whole|owned 8/.test(line)) assert.match(line, / 0 of 100 calls short$/, line);
});

test('the generator\'s own validator and this file\'s rules agree, and the validator catches a broken look', () => {
  const r = surprise({ mood: 'playful', cap: 3, seed: 7 });
  for (const l of r.looks) assert.deepEqual(checkLook(l.colors, { cap: 3 }), [], l.name);
  const broken = structuredClone(r.looks[0].colors);
  broken['Faceplate:GRIP'] = broken.Case.name === broken.Accent.name ? broken.Handle : broken.Accent;   // the grip off the face
  const p = checkLook(broken, { cap: 3 });
  assert.ok(p.some((x) => /grip/.test(x)) || p.some((x) => /accent/.test(x)) || p.length, `a broken look is caught: ${p.join('; ')}`);
  const over = structuredClone(r.looks[0].colors); over.Handle = { name: 'Panchroma Lime Green', hex: '#9ccb3b', url: 'https://x.test/' };
  assert.ok(checkLook(over, { cap: 2 }).some((x) => /cap|differs/.test(x)), 'a wrong hex or a fourth filament under a cap of 2 is caught');
});

test('M12: the three candidates differ in shell and face; 50 Try agains at one setting reach at least 8 shells', () => {
  const shells = new Set();
  for (let seed = 1; seed <= 50; seed++) {
    const { looks } = surprise({ mood: 'playful', cap: 3, seed: seed * 7919 });
    const pairs = looks.map((l) => l.colors.Case.name + '|' + l.colors['Faceplate:FACE'].name);
    assert.equal(new Set(pairs).size, looks.length, `seed ${seed}: ${pairs.join(', ')}`);
    for (const l of looks) shells.add(l.colors.Case.name);
  }
  console.log(`  M12: ${shells.size} distinct shells over 50 Try agains (playful, cap 3): ${[...shells].join(', ')}`);
  assert.ok(shells.size >= 8, `${shells.size} shells`);
});

test('M13: three candidates in one call, the whole catalog, every mood and cap: timed (the laptop mark is median ≤ 20 ms; this gate is loose for the CI runner)', () => {
  catalog();   // the memoised catalog and its CIEDE2000 table are built once, not timed
  const ms = [];
  for (let i = 0; i < 300; i++) {
    const mood = MOODS[i % 3], cap = CAPS[(i / 3 | 0) % 3];
    const t = performance.now(); surprise({ mood, cap, seed: 1000 + i }); ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  const median = ms[150], max = ms[299];
  console.log(`  M13: median ${median.toFixed(2)} ms, p90 ${ms[269].toFixed(2)} ms, max ${max.toFixed(2)} ms over 300 calls`);
  assert.ok(median <= 60 && max <= 400, `median ${median.toFixed(1)} ms, max ${max.toFixed(1)} ms`);
});

test('the same seed and settings give the same looks; a different seed gives different ones', () => {
  const a = surprise({ mood: 'wild', cap: 4, seed: 42 }), b = surprise({ mood: 'wild', cap: 4, seed: 42 }), c = surprise({ mood: 'wild', cap: 4, seed: 43 });
  assert.deepEqual(a.looks.map((l) => l.colors), b.looks.map((l) => l.colors));
  assert.notDeepEqual(a.looks.map((l) => l.name), c.looks.map((l) => l.name));
  assert.equal(a.looks.length, 3);
});

test('moods: subtle has nothing vivid, playful has a neutral shell and a vivid colour, wild has a chromatic shell', () => {
  const cat = catalog();
  const cls = (name) => cat.byName.get(name).cls;
  for (let seed = 1; seed <= 30; seed++) {
    for (const l of surprise({ mood: 'subtle', cap: 3, seed }).looks) for (const k of PALETTE_KEYS) if (!HARDWARE_KEYS.includes(k)) assert.notEqual(cls(l.colors[k].name), 'vivid', `subtle seed ${seed} ${k} ${l.colors[k].name}`);
    for (const l of surprise({ mood: 'playful', cap: 3, seed }).looks) { assert.equal(cls(l.colors.Case.name), 'neutral', `playful seed ${seed} shell ${l.colors.Case.name}`); assert.ok(PALETTE_KEYS.some((k) => cls(l.colors[k].name) === 'vivid'), `playful seed ${seed} has a vivid colour`); }
    for (const l of surprise({ mood: 'wild', cap: 3, seed }).looks) assert.ok(['mid', 'vivid'].includes(cls(l.colors.Case.name)), `wild seed ${seed} shell ${l.colors.Case.name}`);
  }
});

test('a lock fixes its role in every look (and the rules still hold); a lock the rules cannot meet admits no look', () => {
  const red = BY_LABEL.get('Panchroma Red'), black = BY_LABEL.get('Elegoo PLA Black'), grey = BY_LABEL.get('Panchroma Dark Grey');
  const fil = (f) => ({ name: f.label, hex: f.hex, url: f.url });
  for (let seed = 1; seed <= 20; seed++) {
    const { looks } = surprise({ mood: 'wild', cap: 3, seed, locks: { shell: fil(red) } });
    assert.ok(looks.length >= 1, `seed ${seed}: a red shell admits looks`);
    for (const l of looks) { for (const k of ROLE_KEYS.shell) assert.equal(l.colors[k].name, 'Panchroma Red', k); assert.deepEqual(problems(l, { cap: 3, owned: null }), []); }
  }
  // a locked colour wins over the mood (a neutral shell in wild) and over the owned list
  const r = surprise({ mood: 'wild', cap: 3, seed: 5, locks: { shell: fil(black) }, owned: OWNED_8.filter((n) => n !== 'Elegoo PLA Black') });
  assert.ok(r.looks.length && r.looks.every((l) => l.colors.Case.name === 'Elegoo PLA Black'), 'the lock is kept');
  // the deck locked to dark grey on a black case: 1.64:1, the Stealth bug of 2026-08; nothing fits
  const none = surprise({ mood: 'subtle', cap: 3, seed: 5, locks: { shell: fil(black), deck: fil(grey) } });
  assert.deepEqual(none.looks, []); assert.equal(none.short, true);
  // the case and the face locked to ONE filament (Black & gold wears a black face on a black shell): looks, with the accent
  // elsewhere and the rules whole (Sol 01a150df: no rule forbids face = shell; a rolled face still never is)
  const same = surprise({ mood: 'playful', cap: 3, seed: 5, locks: { shell: fil(black), face: fil(black) } });
  assert.ok(same.looks.length >= 1, 'a black shell with a locked black face admits looks');
  for (const l of same.looks) { assert.equal(l.colors['Faceplate:FACE'].name, 'Elegoo PLA Black'); assert.notEqual(l.colors.Accent.name, 'Elegoo PLA Black'); assert.deepEqual(problems(l, { cap: 3, owned: null }), []); assert.match(l.name, /accents on Black/, l.name); }
  for (let seed = 1; seed <= 30; seed++) for (const l of surprise({ mood: 'subtle', cap: 2, seed }).looks) assert.notEqual(l.colors['Faceplate:FACE'].name, l.colors.Case.name, `seed ${seed}: a rolled face is never the shell`);
});

test('"more like this" keeps the shell and the face and changes the rest; an impossible owned list returns nothing, not an error', () => {
  const base = surprise({ mood: 'playful', cap: 4, seed: 11 }).looks[0];
  const like = surprise({ mood: 'playful', cap: 4, seed: 12, like: { shell: base.roles.shell, face: base.roles.face } });
  assert.ok(like.looks.length >= 2, `like admits looks (${like.looks.length})`);
  for (const l of like.looks) { assert.equal(l.colors.Case.name, base.colors.Case.name); assert.equal(l.colors['Faceplate:FACE'].name, base.colors['Faceplate:FACE'].name); }
  assert.ok(like.looks.some((l) => l.colors.Handle.name !== base.colors.Handle.name || l.colors.Accent.name !== base.colors.Accent.name || l.colors.Label.name !== base.colors.Label.name), 'something else moved');
  const none = surprise({ mood: 'playful', cap: 2, seed: 1, owned: ['Elegoo PLA Black', 'Panchroma Black', 'Panchroma Dark Grey'] });
  assert.deepEqual(none.looks, []); assert.equal(none.short, true);
  const one = surprise({ mood: 'playful', cap: 2, seed: 1, owned: ['Elegoo PLA Black', 'Printed Solid Mystery Orange'] });
  assert.ok(one.looks.length >= 1 && one.short, 'two owned filaments at cap 2: one look (the pair), reported short');
});

test('names: "<face> on <shell>" from the short filament names; the hardware is the presets\' silk silver', () => {
  assert.equal(shortName('Panchroma Silk Gold'), 'Silk Gold');
  assert.equal(shortName('Elegoo PLA Black'), 'Black');
  assert.equal(shortName('Polymaker PETG Yellow'), 'Yellow');
  assert.equal(shortName('Printed Solid Mystery Orange'), 'Mystery Orange');
  const l = surprise({ mood: 'playful', cap: 3, seed: 3 }).looks[0];
  assert.ok(l.name.startsWith(`${shortName(l.colors['Faceplate:FACE'].name)} on ${shortName(l.colors.Case.name)}`), l.name);
  assert.equal(l.colors.Magnet.name, HARDWARE); assert.equal(l.colors.Screw.name, HARDWARE);
  const two = surprise({ mood: 'playful', cap: 2, seed: 3 }).looks[0];
  assert.doesNotMatch(two.name, /·/, `a two-colour look has no third colour to name: ${two.name}`);
  const printed = (x) => new Set(PALETTE_KEYS.filter((k) => !HARDWARE_KEYS.includes(k)).map((k) => x.colors[k].name)).size;
  const three = surprise({ mood: 'playful', cap: 3, seed: 3 }).looks.find((x) => printed(x) === 3);
  if (three) assert.match(three.name, / · .+ (trim|labels|drawers)$/, three.name);
});
