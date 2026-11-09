/* M3 (2026-11-05): the generator's worker protocol (js/parts-drawer/worker.js handle), run here on node's own engine
   (test/lib/parts-drawer-env.mjs boots manifold and loads the meshes the way the worker does): the shell with its slab,
   the whole drawer with parts and outlines, and the download's bytes with labels.csv. The stage-side client (engine.js)
   needs three.js and a Worker, so it is checked in the browser (the e2e case). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wasm, assets } from '../lib/parts-drawer-env.mjs';
import { handle } from '../../js/parts-drawer/worker.js';
import { defaultLayout, fullLayout } from '../../js/parts-drawer/unit.js';
import * as G from '../../js/parts-drawer/gen.js';

const engine = { wasm, assets };
const unit = { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', variant: 'parts' };

test('shell: the empty 240-2W 1H shell with its floor slab, as positions in the planner frame', async () => {
  const { result, transfer } = await handle('shell', { size: '240-2W', height: '1H' }, engine);
  const p = result.positions;
  assert.ok(p instanceof Float32Array && p.length % 9 === 0 && p.length > 0);
  assert.equal(transfer[0], p.buffer, 'the buffer is transferred');
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); }
  // the outside box: x centred on 163 (W 159 + 2 each side), y 0..50 (the 1H rim), z centred on the outside (226 + 4.3 + 4)
  assert.ok(Math.abs(lo[0] + 81.5) < 0.01 && Math.abs(hi[0] - 81.5) < 0.01, `x ${lo[0]}..${hi[0]}`);
  assert.ok(Math.abs(lo[1]) < 0.01 && Math.abs(hi[1] - 50) < 0.01, `y ${lo[1]}..${hi[1]}`);
  assert.ok(Math.abs(lo[2] + 117.15) < 0.01 && Math.abs(hi[2] - 117.15) < 0.01, `z ${lo[2]}..${hi[2]}`);
});

test('drawer: a layout with parts and outlines builds, weighs, and the outline cuts the floor', async () => {
  const lay = defaultLayout('240-2W');
  lay.comps[0].item = { type: 'shcs', size: 'M3', length: 10, qty: 100 };
  const plain = await handle('drawer', { full: fullLayout(240, unit, lay) }, engine);
  lay.outlines = true;
  const cut = await handle('drawer', { full: fullLayout(240, unit, lay) }, engine);
  assert.ok(plain.result.grams > 100 && plain.result.ms >= 0);
  assert.ok(cut.result.grams < plain.result.grams, 'the outline is cut out of the floor');
  assert.ok(cut.result.positions.length > plain.result.positions.length, 'the cut adds faces');
});

test('zip: the download carries the STL, the 3MF, labels.csv for the parts, README.txt and layout.json, and no Bambu Studio claim', async () => {
  const lay = defaultLayout('240-2W');
  lay.comps[0].item = { type: 'shcs', size: 'M3', length: 10, qty: 100 };
  lay.floor = { mode: 'one', slots: 3 };
  const { result } = await handle('zip', { full: fullLayout(240, unit, lay, ['#f5c518']), bodyHex: '#ff6a1a', stamp: 'test' }, engine);
  const text = Buffer.from(result.bytes).toString('latin1');
  assert.equal(text.slice(0, 2), 'PK');
  assert.match(result.filename, /^MODULITH-240-2W-1H-Parts-Drawer-20-compartments-Large-labels-MD-[A-Z0-9]{3}-[A-Z0-9]{3}\.zip$/);
  for (const name of ['labels.csv', 'README.txt', 'layout.json', 'Multi-material - PrusaSlicer/', 'Multi-material - OrcaSlicer, Bambu Studio (generic 3MF, beta)/', 'Single nozzle - STL/']) assert.ok(text.includes(name), name);
  assert.ok(!text.includes('Bambu Studio, OrcaSlicer (beta)'), 'the old folder name is gone');
  assert.ok(!/BambuStudio-01/.test(text), 'the 3MF inside is deflated; the claim is gone from the writer (export.js)');
  assert.equal(G.SIZES['240-2W'].heights['1H'].stretched, false);
});
