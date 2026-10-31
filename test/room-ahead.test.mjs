// THE ROOM AHEAD (js/scenes/room-ahead.js): who gets the Colors room ready in the background, and who waits until they ask.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roomAheadWanted } from '../js/scenes/room-ahead.js';

const desktop = { search: '?ws=build', phone: false, softwareGL: false, stored: null, connection: { effectiveType: '4g', saveData: false }, memoryGB: 16, cores: 16 };

test('a desktop visitor with a GPU and a good line gets it', () => {
  assert.equal(roomAheadWanted(desktop), true);
  // no Network Information API (Firefox, Safari): nothing says the line is bad, and nothing says the device is small
  assert.equal(roomAheadWanted({ ...desktop, connection: null, memoryGB: null, cores: null }), true);
  // the room chosen in this browser is the default said out loud
  assert.equal(roomAheadWanted({ ...desktop, stored: 'room' }), true);
});

test('a phone never spends its data on it', () => {
  assert.equal(roomAheadWanted({ ...desktop, phone: true }), false);
});

test('a line that says it is slow, metered or to be saved', () => {
  assert.equal(roomAheadWanted({ ...desktop, connection: { saveData: true, effectiveType: '4g' } }), false);
  assert.equal(roomAheadWanted({ ...desktop, connection: { type: 'cellular', effectiveType: '4g' } }), false);
  for (const effectiveType of ['slow-2g', '2g', '3g']) assert.equal(roomAheadWanted({ ...desktop, connection: { effectiveType } }), false, effectiveType);
});

test('a software rasteriser, a small device and the Fast tier are left to the page they are on', () => {
  assert.equal(roomAheadWanted({ ...desktop, softwareGL: true }), false);
  assert.equal(roomAheadWanted({ ...desktop, tier: 'fast' }), false);
  for (const tier of ['veryhigh', 'high', 'balanced']) assert.equal(roomAheadWanted({ ...desktop, tier }), true, tier);
  assert.equal(roomAheadWanted({ ...desktop, memoryGB: 2 }), false);
  assert.equal(roomAheadWanted({ ...desktop, cores: 2 }), false);
  assert.equal(roomAheadWanted({ ...desktop, memoryGB: 4, cores: 4 }), true, 'four and four is enough');
});

test('a visitor who chose Neutral does not want the room, and ?done=off has none', () => {
  assert.equal(roomAheadWanted({ ...desktop, stored: 'studio' }), false);
  assert.equal(roomAheadWanted({ ...desktop, search: '?ws=build&done=off' }), false);
  assert.equal(roomAheadWanted({ ...desktop, search: '?ws=build&done=room' }), true);
});

test('the debug switches, for a check: only with ?debug', () => {
  assert.equal(roomAheadWanted({ ...desktop, search: '?debug=1&roomahead=off' }), false);
  assert.equal(roomAheadWanted({ ...desktop, search: '?roomahead=off' }), true, 'no ?debug, no switch');
  assert.equal(roomAheadWanted({ ...desktop, softwareGL: true, search: '?debug=1&roomahead=on' }), true);
  assert.equal(roomAheadWanted({ ...desktop, softwareGL: true, search: '?roomahead=on' }), false, 'no ?debug, no switch');
  assert.equal(roomAheadWanted({ ...desktop, search: '?debug=1&roomahead=on&done=off' }), false, 'no room is no room');
});
