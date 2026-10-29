/* js/label-palette.js and the record field it reads (js/rules/schema.js cleanLabelPalette): the label palette, Joey 2026-10-28
   (docs/redesign/LABEL-PALETTE.md). The suggested spools are the rule's answer on today's catalog and are FROZEN (a catalog
   change fails here, it never moves a build's colours); the record is cleaned like any outside data; the warnings fire at
   their thresholds and not past them; the defaults never throw on a storage that does; a stripe's zone names its meaning. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRIPE_COLOURS, stripePieceZone, stripeMeaningOfKey, stripeHexOfKey, isStripeZone, stripeFor } from '../js/label-look.js';
import { LABEL_PALETTE_KEYS, cleanLabelPalette, sanitizeBuild, serializeBuild, BUILD_FIELDS } from '../js/rules/schema.js';
import { LABEL_MEANINGS, SUGGESTED_V1, SUGGESTED_BODY_TEXT, CATALOG, suggestFor, isPlainPla, spoolFor, spoolsOf, paletteOf, samePalette,
  paletteWarnings, warningText, rankSpools, urlFor, ALIKE_DE, BODY_DE, TEXT_CONTRAST, LABEL_DEFAULTS_KEY, cleanDefaults,
  readLabelDefaults, writeLabelDefaults, paletteOfDefaults, SUGGESTED_V2, SUGGESTED, NEW_SET, setOf, suggestedPalette, newBuildPalette } from '../js/label-palette.js';
import { dE, contrast } from '../js/colors/colour.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
const pal = (spools) => ({ v: 1, spools });

test('the six meanings are the Label Studio menu, and the schema keeps the same six', () => {
  assert.deepEqual(LABEL_MEANINGS, STRIPE_COLOURS.map((c) => c.colour));
  assert.deepEqual(LABEL_PALETTE_KEYS, LABEL_MEANINGS, 'schema.js LABEL_PALETTE_KEYS drifted from label-look.js STRIPE_COLOURS');
  assert.ok(BUILD_FIELDS.includes('labelPalette'), 'labelPalette is a record field (it rides in #build=)');
});

test('the v1 suggestions are the rule on today\'s catalog: nearest plain PLA by dE00 (a drift fails here, it never rewrites them)', () => {
  for (const c of STRIPE_COLOURS) {
    const s = suggestFor(c.hex);
    assert.equal(s.name, SUGGESTED_V1[c.colour].name, `${c.name}: the rule now picks ${s.name} (dE ${s.dE.toFixed(2)}) - a catalog change; v1 stays frozen, decide on a v2`);
    assert.equal(s.hex.toLowerCase(), SUGGESTED_V1[c.colour].hex.toLowerCase());
    const cat = CATALOG.find((x) => x.label === s.name);
    assert.ok(cat && isPlainPla(cat), `${s.name} is a plain PLA in the catalog`);
  }
  // the near tie the note calls out: Printed Solid White 1.868 against Panchroma White 1.928
  assert.ok(dE('#F4F4F2', '#EFEFEA') < dE('#F4F4F2', '#f5f4ee'));
  for (const k of ['body', 'text']) assert.equal(CATALOG.find((x) => x.label === SUGGESTED_BODY_TEXT[k].name)?.hex, SUGGESTED_BODY_TEXT[k].hex);
});

test('plain PLA leaves out silk, translucent, PETG and TPU', () => {
  const by = (l) => CATALOG.find((c) => c.label === l);
  assert.ok(isPlainPla(by('Panchroma Lemon Yellow')));
  assert.ok(!isPlainPla(by('Panchroma Silk Light Blue')));
  assert.ok(!isPlainPla(by('Panchroma Translucent Light Blue')));
  assert.ok(!isPlainPla(by('Elegoo PETG Black')), 'the Elegoo line is "PLA / PETG": the colour label decides');
  assert.ok(!isPlainPla(by('Polymaker PETG Orange')));
});

test('cleanLabelPalette: v 1 only, the six keys only, a name and a #rrggbb hex, nothing left = null', () => {
  assert.equal(cleanLabelPalette(null), null);
  assert.equal(cleanLabelPalette(undefined), null);
  assert.equal(cleanLabelPalette([]), null);
  assert.equal(cleanLabelPalette({ spools: { red: { name: 'X', hex: '#112233' } } }), null, 'no v');
  assert.equal(cleanLabelPalette({ v: 2, spools: { red: { name: 'X', hex: '#112233' } } }), null, 'an unsupported v reads as the suggestions');
  assert.equal(cleanLabelPalette({ v: 1, spools: {} }), null);
  assert.deepEqual(cleanLabelPalette({ v: 1, spools: {
    red: { name: '  Polar Rocket Red ', hex: '#FF1900', url: 'javascript:alert(1)' },   // trimmed; the link never kept
    'sky-blue': { name: '', hex: '#112233' },                                          // blank name
    green: { name: 'G', hex: 'green' },                                                // not a hex
    pink: { name: 'P', hex: '#123456' },                                               // not a meaning
    yellow: { name: 'x'.repeat(81), hex: '#123456' },                                  // too long
    white: 'Printed Solid White' } }), { v: 1, spools: { red: { name: 'Polar Rocket Red', hex: '#FF1900' } } });
});

test('the record: sanitize always writes the field, a palette survives a round trip, an older record reads as null', () => {
  const G = { mounts: [{ id: 'tabletop' }], lengths: [{ id: 185 }], printers: [{ id: 'any' }], faceplateStyles: [{ id: 'edgelabel' }], doorStyles: [{ id: 'essential' }], handleStyles: [{ id: 'deco' }], labelSpec: { limits: {}, flags: [], charMax: 3 }, caseHeights: [], drawerHeights: [], collectionCases: {}, unavailableSizes: [] };
  const old = { mount: 'tabletop', length: 185, placed: [], gridW: 2, gridH: 2 };
  sanitizeBuild(old, G);
  assert.ok('labelPalette' in old, 'written even when absent: the store copies only the fields a record has');
  assert.equal(old.labelPalette, null);
  const rec = { mount: 'tabletop', length: 185, placed: [], gridW: 2, gridH: 2, labelPalette: pal({ 'sky-blue': { name: 'Panchroma Aqua Blue', hex: '#5cc6e0' } }) };
  sanitizeBuild(rec, G);
  const back = serializeBuild(rec);
  assert.deepEqual(back.labelPalette, pal({ 'sky-blue': { name: 'Panchroma Aqua Blue', hex: '#5cc6e0' } }));
});

test('spoolFor: the build\'s own spool, else the v1 suggestion; a partial palette falls back per meaning', () => {
  const p = cleanLabelPalette(pal({ red: { name: 'Polar Rocket Red', hex: '#FF1900' } }));
  assert.deepEqual(spoolFor(p, 'red'), { name: 'Polar Rocket Red', hex: '#FF1900', suggested: false });
  assert.equal(spoolFor(cleanLabelPalette(pal({ red: SUGGESTED_V1.red })), 'red').suggested, true, 'a stored spool that is the suggestion reads as suggested');
  assert.deepEqual(spoolFor(p, 'sky-blue'), { ...SUGGESTED_V1['sky-blue'], suggested: true });
  assert.deepEqual(spoolFor(null, 'green'), { ...SUGGESTED_V1.green, suggested: true });
  assert.equal(spoolFor(null, 'pink'), null, 'no meaning, no spool');
  assert.deepEqual(spoolsOf(null).map((r) => r.meaning), STRIPE_COLOURS.map((c) => c.name));
  // a hand-made name the catalog lacks is drawn in its own hex, with no buy link
  const odd = cleanLabelPalette(pal({ yellow: { name: 'My Garage Yellow', hex: '#ffee00' } }));
  assert.equal(spoolFor(odd, 'yellow').hex, '#ffee00');
  assert.equal(urlFor('My Garage Yellow'), null);
  assert.match(urlFor('Panchroma Lemon Yellow'), /^https:/);
});

test('paletteOf: exactly the suggestions is null (the record stays null); any change is a full v1 palette', () => {
  assert.equal(paletteOf(Object.fromEntries(LABEL_MEANINGS.map((k) => [k, SUGGESTED_V1[k]]))), null);
  const p = paletteOf({ ...SUGGESTED_V1, red: { name: 'Polar Rocket Red', hex: '#FF1900' } });
  assert.equal(p.v, 1);
  assert.deepEqual(Object.keys(p.spools), LABEL_MEANINGS);
  assert.deepEqual(cleanLabelPalette(p), p, 'what the panel writes is what the record keeps');
  assert.ok(samePalette(null, cleanLabelPalette(pal({ red: SUGGESTED_V1.red }))), 'the same six spools, however stored');
  assert.ok(!samePalette(null, p));
});

test('the warnings: the v1 set on its body warns only about White, and each check fires below its threshold, not at it', () => {
  const body = SUGGESTED_BODY_TEXT.body.hex, text = SUGGESTED_BODY_TEXT.text.hex;
  const w = paletteWarnings(null, body, text);
  assert.deepEqual(w.map((x) => [x.kind, x.keys]), [['body', ['white']]], 'White on Cold White is the measured invisible patch; nothing else');
  assert.ok(w[0].value > 4 && w[0].value < 4.3, `White on the body dE ${w[0].value}`);
  assert.match(warningText(w[0]), /White is hard to see on the label body/);
  // two meanings in one spool: 'same', by name, and not also 'alike'
  const same = paletteWarnings(cleanLabelPalette(pal({ red: SUGGESTED_V1.purple })), null, null);
  assert.deepEqual(same.map((x) => [x.kind, x.keys]), [['same', ['red', 'purple']]]);
  // two blues 8.9 apart: alike
  const blues = paletteWarnings(cleanLabelPalette(pal({ green: { name: 'Panchroma Aqua Blue', hex: '#5cc6e0' } })), null, null);
  assert.ok(blues.some((x) => x.kind === 'alike' && x.keys.join() === 'sky-blue,green'), JSON.stringify(blues));
  // the strict thresholds, measured on real pairs either side
  const ab = dE('#14ADDB', '#00a5a5');   // Polar Light Blue / Panchroma Polymaker Teal: 15.9, just past ALIKE_DE
  assert.ok(ab >= ALIKE_DE);
  assert.ok(!paletteWarnings(cleanLabelPalette(pal({ green: { name: 'Panchroma Polymaker Teal', hex: '#00a5a5' } })), null, null).some((x) => x.kind === 'alike'));
  // text contrast below 3 warns; the default 14.9 does not
  assert.ok(contrast(text, body) > 14);
  const grey = paletteWarnings(null, '#eef1f4', '#b0b3b8');
  assert.ok(grey.some((x) => x.kind === 'text' && x.value < TEXT_CONTRAST));
  assert.equal(BODY_DE, 10);
});

test('rankSpools: owned spools first, then nearest to the meaning; no TPU', () => {
  const r = rankSpools('sky-blue', ['Elegoo PLA Black']);
  assert.equal(r[0].name, 'Elegoo PLA Black');
  assert.ok(r[0].owned);
  assert.equal(r[1].name, 'Panchroma Silk Light Blue', 'any material may print a stripe: the nearest overall comes next');
  assert.ok(!r.some((c) => /TPU/.test(c.name)));
  assert.equal(rankSpools('body')[0].name, 'Panchroma Cold White');
});

test('the defaults: a round trip, cleaned, and a storage that throws reads as none and writes nothing', () => {
  const s = mem();
  const d = { v: 1, spools: { red: { name: 'Polar Rocket Red', hex: '#FF1900' }, nope: { name: 'x', hex: '#000000' } }, body: { name: 'Panchroma Cream', hex: '#f1e7cf' }, text: { hex: '#000000' } };
  assert.equal(writeLabelDefaults(s, d), true);
  assert.deepEqual(readLabelDefaults(s), { v: 1, spools: { red: { name: 'Polar Rocket Red', hex: '#FF1900' } }, body: { name: 'Panchroma Cream', hex: '#f1e7cf' } });
  assert.ok(s.m.has(LABEL_DEFAULTS_KEY));
  assert.equal(readLabelDefaults(throwing), null);
  assert.equal(writeLabelDefaults(throwing, d), false);
  // the record palette the defaults give a new build: their spools, the suggestions for the rest
  const p = paletteOfDefaults(readLabelDefaults(s));
  assert.equal(p.spools.red.name, 'Polar Rocket Red');
  assert.equal(p.spools['sky-blue'].name, SUGGESTED_V1['sky-blue'].name);
  s.m.set(LABEL_DEFAULTS_KEY, '{not json'); assert.equal(readLabelDefaults(s), null);
  assert.equal(cleanDefaults({ v: 2, spools: { red: { name: 'a', hex: '#000000' } } }), null);
  assert.equal(paletteOfDefaults(null), null);
});

test('a stripe zone names its meaning; any other colour keeps its own hex; the Studio\'s stored value is unchanged', () => {
  assert.equal(stripePieceZone('sky-blue', '#56b4e9'), 'STRIPE@sky-blue');
  assert.equal(stripePieceZone('teal', '#008080'), 'STRIPE#008080', 'a Studio colour this page does not offer');
  assert.equal(stripePieceZone(null, null), '', 'an unassigned slot is the Body');
  assert.equal(stripeMeaningOfKey('Label:STRIPE@red'), 'red');
  assert.equal(stripeMeaningOfKey('Label:STRIPE@pink'), null);
  assert.equal(stripeHexOfKey('Label:STRIPE@red'), null);
  assert.ok(isStripeZone('STRIPE@green') && isStripeZone('STRIPE#00ff00') && !isStripeZone('STRIPE@pink') && !isStripeZone('TEXT'));
  assert.deepEqual(stripeFor('sky-blue'), { band: { colour: 'sky-blue', hex: '#56B4E9', label: 'Metric', pattern: 'solid' } }, 'the label still stores the Studio\'s scheme hex');
});

/* ---- v2 (Astra's review, Joey's go 2026-10-28): chosen suggestions for NEW builds only; every older record stays on v1 ---- */
test('v2 is v1 with a real purple and a grey stainless, both catalog plain PLA, nothing else moved; v1 is untouched', () => {
  assert.deepEqual(Object.keys(SUGGESTED_V2), LABEL_MEANINGS);
  for (const k of LABEL_MEANINGS) if (k !== 'white' && k !== 'purple') assert.deepEqual(SUGGESTED_V2[k], SUGGESTED_V1[k], k);
  assert.deepEqual(SUGGESTED_V2.purple, { name: 'Panchroma Purple', hex: '#7a4fb0' });
  assert.deepEqual(SUGGESTED_V2.white, { name: 'Polar Spaceship Steel', hex: '#787E82' });
  for (const k of ['white', 'purple']) { const c = CATALOG.find((x) => x.label === SUGGESTED_V2[k].name); assert.ok(c && isPlainPla(c) && c.hex === SUGGESTED_V2[k].hex, k); }
  assert.deepEqual(SUGGESTED_V1.purple, { name: 'Panchroma Pink', hex: '#f0a4c0' });
  assert.deepEqual(SUGGESTED_V1.white, { name: 'Printed Solid White', hex: '#EFEFEA' });
  assert.equal(NEW_SET, 2); assert.equal(SUGGESTED[1], SUGGESTED_V1); assert.equal(SUGGESTED[2], SUGGESTED_V2);
});
test('v2 reads on both bodies: no warning on the light body or a dark one, and the grey sits mid-way (stated dE)', () => {
  const v2 = newBuildPalette();
  for (const body of [SUGGESTED_BODY_TEXT.body.hex, SUGGESTED_BODY_TEXT.text.hex]) assert.deepEqual(paletteWarnings(v2, body, null), [], body);
  assert.ok(Math.abs(dE(SUGGESTED_V2.white.hex, '#eef1f4') - 31.6) < 0.05 && Math.abs(dE(SUGGESTED_V2.white.hex, '#1c1d20') - 32.9) < 0.05);
  assert.deepEqual(paletteWarnings(null, SUGGESTED_BODY_TEXT.body.hex, null).map((w) => w.kind + ':' + w.keys.join()), ['body:white'], 'v1 keeps its white-patch note');
});
test('the set: a new build is a full v2 palette marked set 2; it survives the record; absent or anything else is v1', () => {
  const nb = newBuildPalette();
  assert.deepEqual(nb, { v: 1, set: 2, spools: { ...SUGGESTED_V2 } });
  assert.deepEqual(cleanLabelPalette(nb), nb);
  // written out WHOLE (Sol 01a18540): an older planner drops `set` and reads the spools, so a set-2 palette must name all six
  assert.deepEqual(cleanLabelPalette({ v: 1, set: 2 }), nb, 'set 2 with no spools is the v2 suggestions, written out');
  const part = cleanLabelPalette({ v: 1, set: 2, spools: { red: { name: 'Polar Candy Red', hex: '#BB3638' }, purple: { name: 'Bad', hex: 'purple' } } });
  assert.deepEqual(part.spools, { ...SUGGESTED_V2, red: { name: 'Polar Candy Red', hex: '#BB3638' } }, "a missing or dropped slot takes v2's spool");
  assert.deepEqual(cleanLabelPalette({ v: 1, spools: part.spools }).spools.purple, SUGGESTED_V2.purple, 'and an old cleaner, set dropped, still reads v2 purple');
  for (const s of [1, 3, '2', null]) assert.equal(setOf(cleanLabelPalette({ v: 1, set: s, spools: { red: { name: 'X', hex: '#123456' } } })), 1, String(s));
  assert.equal(cleanLabelPalette({ v: 1, set: 1 }), null);
  const G = { mounts: [{ id: 'tabletop' }], lengths: [{ id: 185 }], printers: [{ id: 'any' }], faceplateStyles: [{ id: 'edgelabel' }], doorStyles: [{ id: 'essential' }], handleStyles: [{ id: 'deco' }], labelSpec: { limits: {}, flags: [], charMax: 3 }, caseHeights: [], drawerHeights: [], collectionCases: {}, unavailableSizes: [] };
  const rec = { mount: 'tabletop', length: 185, placed: [], gridW: 2, gridH: 2, labelPalette: nb };
  sanitizeBuild(rec, G); assert.deepEqual(rec.labelPalette, nb);
  assert.deepEqual(serializeBuild(rec).labelPalette, nb);
  assert.equal(setOf(null), 1); assert.equal(setOf(nb), 2);
});
test('spoolFor on set 2 falls back to v2 and calls v2 "suggested"; on v1 a v2 spool is the build\'s own', () => {
  const p = cleanLabelPalette({ v: 1, set: 2, spools: { red: { name: 'Polar Candy Red', hex: '#BB3638' } } });
  assert.deepEqual(spoolFor(p, 'purple'), { ...SUGGESTED_V2.purple, suggested: true });
  assert.deepEqual(spoolFor(p, 'red'), { name: 'Polar Candy Red', hex: '#BB3638', suggested: false });
  assert.deepEqual(spoolFor(null, 'purple'), { ...SUGGESTED_V1.purple, suggested: true });
  assert.equal(spoolFor(pal({ purple: SUGGESTED_V2.purple }), 'purple').suggested, false);
});
test('paletteOf / suggestedPalette keep the build\'s set: v2 never collapses to null, v1 still does', () => {
  assert.equal(suggestedPalette(1), null);
  assert.deepEqual(suggestedPalette(2), newBuildPalette());
  assert.deepEqual(paletteOf({ ...SUGGESTED_V2 }, 2), newBuildPalette());
  assert.deepEqual(paletteOf({ red: { name: 'Polar Candy Red', hex: '#BB3638' } }, 2).spools.purple, SUGGESTED_V2.purple, 'a missing slot takes v2');
  assert.equal(paletteOf({ ...SUGGESTED_V1 }, 1), null);
  assert.ok(samePalette(newBuildPalette(), suggestedPalette(2)) && !samePalette(newBuildPalette(), null));
});
test('the defaults on a new build sit over v2; with none, a new build is the v2 suggestions', () => {
  assert.deepEqual(paletteOfDefaults(null, 2), newBuildPalette());
  assert.equal(paletteOfDefaults(null, 1), null);
  const d = cleanDefaults({ v: 1, spools: { purple: { name: 'Polar Lavender', hex: '#D696EE' } } });
  const p = paletteOfDefaults(d, 2);
  assert.equal(p.set, 2); assert.deepEqual(p.spools.purple, { name: 'Polar Lavender', hex: '#D696EE' }); assert.deepEqual(p.spools.white, SUGGESTED_V2.white);
  assert.deepEqual(paletteOfDefaults(d, 1).spools.white, SUGGESTED_V1.white, 'on a v1 build the defaults fill from v1');
});
