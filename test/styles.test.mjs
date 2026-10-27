/* The styles (js/colors/styles.js, step 5b): each pool pinned as the LABEL LIST checked by eye on 2026-10-18 (STEP5B.md,
   M17), so a predicate that drifts with a catalog change is seen rather than shipped; the tiles' swatches are catalog
   hexes; every style can shell, accent and fill. The predicates are the module's; the lists here are the record. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILAMENT_DB } from '../js/filament-db.js';
import { STYLES, styleById } from '../js/colors/styles.js';
import { catalog } from '../js/colors/surprise.js';

const CAT = catalog().list.filter((c) => !c.translucent && !c.tpu);   // the generator's own pool (surprise.js): TPU is the feet's alone
const names = (p) => CAT.filter(p).map((c) => c.name).sort();
const HEXES = new Set(FILAMENT_DB.flatMap((b) => b.colors.map((c) => c.hex.toLowerCase())));

test('the five styles, their tiles and their pools', () => {
  assert.deepEqual(STYLES.map((s) => s.id), ['warm', 'calm', 'workshop', 'retro', 'any']);
  for (const s of STYLES) {
    assert.equal(s.swatches.length, 3, s.name);
    for (const h of s.swatches) assert.ok(HEXES.has(h.toLowerCase()), `${s.name}: tile swatch ${h} is a catalog colour`);
    assert.ok(names(s.shells).length >= 8 && names(s.accents).length >= 7 && names(s.neutrals).length >= 10, `${s.name} has enough to roll from`);
    assert.ok(s.hueGap >= 0 && s.silkWeight > 0 && s.silkWeight <= 1);
  }
  assert.equal(styleById('nope').id, 'warm', 'an unknown id reads as the first style');
});

test('Warm & natural: warm neutrals and whites shell it; the earths accent it; no vivid colour anywhere', () => {
  const s = styleById('warm');
  assert.deepEqual(names(s.shells), ['Elegoo PLA Grey', 'Panchroma Beige', 'Panchroma Cold White', 'Panchroma Cream', 'Panchroma Grey', 'Panchroma Silk Chrome', 'Panchroma Silk Gunmetal Grey', 'Panchroma Silk Silver', 'Panchroma Silk White', 'Panchroma Steel Grey', 'Panchroma Tan', 'Panchroma White', 'Polar Natural', 'Polar Power Gray 100', 'Polar Regulation Gray', 'Polar Retro Platinum', 'Polar Spaceship Steel', 'Polymaker PETG Grey', 'Polymaker PETG Silver', 'Polymaker PETG White', 'Printed Solid Natural', 'Printed Solid White']);
  assert.deepEqual(names(s.accents), ['Panchroma Brown', 'Panchroma Dark Olive Drab', 'Panchroma Olive Green', 'Panchroma Silk Bronze', 'Panchroma Silk Rose Gold', 'Panchroma Tan', 'Polar Mocha', 'Polymaker PETG Army Brown']);
  for (const c of CAT.filter((x) => s.shells(x) || s.accents(x) || s.neutrals(x))) assert.notEqual(c.cls, 'vivid', c.name);
});

test('Clean & calm: whites, greys and silvers shell it; the quiet blues and soft greys accent it', () => {
  const s = styleById('calm');
  assert.deepEqual(names(s.shells), ['Elegoo PLA Grey', 'Panchroma Cold White', 'Panchroma Grey', 'Panchroma Silk Chrome', 'Panchroma Silk Gunmetal Grey', 'Panchroma Silk Silver', 'Panchroma Silk White', 'Panchroma Steel Grey', 'Panchroma White', 'Polar Natural', 'Polar Power Gray 100', 'Polar Power Gray 500', 'Polar Regulation Gray', 'Polar Retro Platinum', 'Polar Spaceship Steel', 'Polymaker PETG Grey', 'Polymaker PETG Silver', 'Polymaker PETG White', 'Printed Solid White']);
  assert.deepEqual(names(s.accents), ['ERYONE Burnt Titanium', 'Elegoo PLA Grey', 'Panchroma Aqua Blue', 'Panchroma Azure Blue', 'Panchroma Blue', 'Panchroma Grey', 'Panchroma Silk Dark Blue', 'Panchroma Silk Gunmetal Grey', 'Panchroma Silk Light Blue', 'Panchroma Silk Periwinkle', 'Panchroma Steel Grey', 'Panchroma Stone Blue', 'Polar Deep Space', 'Polar Light Blue', 'Polar Marine Blue', 'Polar Power Gray 100', 'Polar Power Gray 500', 'Polar Regulation Gray', 'Polar Royal Blue', 'Polar Spaceship Steel', 'Polymaker PETG Blue', 'Polymaker PETG Dark Blue', 'Polymaker PETG Galaxy Blue', 'Polymaker PETG Grey', 'Printed Solid Blue Whale Grey']);
});

test('Workshop classic: blacks, charcoals, steel grey and deep blues shell it; reds, oranges and yellows accent it', () => {
  const s = styleById('workshop');
  assert.deepEqual(names(s.shells), ['ERYONE Burnt Titanium', 'Elegoo PETG Black', 'Elegoo PLA Black', 'Panchroma Black', 'Panchroma Dark Grey', 'Panchroma Silk Black', 'Panchroma Silk Dark Blue', 'Panchroma Silk Gunmetal Grey', 'Panchroma Steel Grey', 'Polar Classic Black', 'Polar Power Gray 500', 'Polar Regulation Gray', 'Polar Spaceship Steel', 'Polar Superior Blue', 'Polymaker PETG Black', 'Polymaker PETG Dark Blue', 'Polymaker PETG Dark Grey', 'Polymaker PETG Galaxy Black', 'Polymaker PETG Galaxy Blue', 'Polymaker PETG Galaxy Dark Grey', 'Printed Solid Black', 'Printed Solid Blue Moon', 'Printed Solid Blue Whale Grey', 'Printed Solid Bold Blue']);
  assert.deepEqual(names(s.accents), ['Panchroma Lemon Yellow', 'Panchroma Orange', 'Panchroma Red', 'Panchroma Silk Gold', 'Panchroma Silk Orange', 'Panchroma Silk Red', 'Panchroma Silk Yellow', 'Panchroma Yellow', 'Polar Blaze Orange', 'Polar Candy Red', 'Polar Coral', 'Polar Creamsicle', 'Polar Dijon Yellow', 'Polar Rocket Red', 'Polar Sunshine Yellow', 'Polar Vivid Orange', 'Polymaker PETG Orange', 'Polymaker PETG Red', 'Polymaker PETG Yellow', 'Printed Solid Elixir Gold Rush', 'Printed Solid Elixir Royal Ruby', 'Printed Solid Mystery Orange', 'Printed Solid Neon Yellow', 'Printed Solid PS Red', 'Printed Solid Safety Orange', 'Printed Solid Yellow Bird']);
});

test('Retro pop is the curated collection, listed in full; cream is one shell among eight', () => {
  const s = styleById('retro');
  assert.deepEqual(names(s.shells), ['Panchroma Beige', 'Panchroma Cold White', 'Panchroma Cream', 'Panchroma Dark Olive Drab', 'Panchroma Polymaker Teal', 'Panchroma Silk White', 'Polymaker PETG Teal', 'Printed Solid Natural']);
  assert.equal(names(s.accents).length, 13);
  assert.equal(names(s.neutrals).length, 10);
});

test('Anything goes: a neutral or a chromatic shell, any mid or vivid accent', () => {
  const s = styleById('any');
  assert.ok(names(s.shells).length >= 90 && names(s.accents).length >= 70, 'the widest pools');
  assert.ok(!names(s.shells).includes('Panchroma Cream'), 'the muted colours do not shell it (they fill)');
});
