/* The contents preview's detailed models (js/parts-drawer/hwmodels.js, img/hw/3d/, tools/hw-models.py, 2026-11-09): every part
   the list offers has its file; a screw assembles to the item's length (a countersunk one including its head); the parts keep
   their real sizes; the stand-ins are scaled to their thread. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModel, assemble, boxOf, modelUrl } from '../../js/parts-drawer/hwmodels.js';
import { TYPE_ORDER, THREADS, known, partForm } from '../../js/parts-drawer/inventory.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (type, size) => { const b = readFileSync(join(root, modelUrl(type, size))); return parseModel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const len = (m) => { const b = boxOf(m); return b.hi[2] - b.lo[2]; };
const dia = (m) => { const b = boxOf(m); return Math.max(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1]); };

test('every part the list offers has a model file, small, from the library', () => {
  for (const type of TYPE_ORDER) for (const size of THREADS) {
    if (!known({ type, size, length: 12, qty: 1 })) continue;
    const f = join(root, modelUrl(type, size));
    assert.ok(existsSync(f), `${type} ${size}`);
    assert.ok(statSync(f).size < 160 * 1024, `${type} ${size} under 160 KB`);
    const m = load(type, size);
    assert.match(m.header.source, /hardware visual library/);
    assert.equal(!!m.header.screw, ['shcs', 'bhcs', 'fhcs', 'set'].includes(type), `${type}: screws come in pieces`);
  }
});

test('a screw assembles to the item’s length, its head and thread at their real size', () => {
  for (const [type, size, L, want] of [['shcs', 'M3', 12, 15], ['shcs', 'M3', 8, 11], ['shcs', 'M3', 30, 33], ['shcs', 'M3', 4, 7], ['bhcs', 'M4', 10, 12.2], ['fhcs', 'M3', 10, 10], ['set', 'M3', 6, 6], ['shcs', 'M12', 35, 47]]) {
    const m = assemble(load(type, size), { type, size, length: L, qty: 1 });
    assert.ok(Math.abs(len(m.part) - want) < 0.12, `${type} ${size} x ${L}: ${len(m.part).toFixed(2)} long, wanted ${want}`);
  }
  const f = partForm({ type: 'shcs', size: 'M3', length: 12, qty: 1 });
  assert.ok(Math.abs(dia(assemble(load('shcs', 'M3'), { type: 'shcs', size: 'M3', length: 12 }).part) - f.dk) < 0.25, 'the head is its real diameter');
});

test('the other parts as modelled: a nut its across-corners, an insert its length; a nyloc keeps its nylon ring; stand-ins scaled', () => {
  const nut = assemble(load('nut', 'M3'), { type: 'nut', size: 'M3' });
  assert.ok(Math.abs(len(nut.part) - 2.4) < 0.1, `an M3 nut 2.4 high: ${len(nut.part)}`);
  assert.ok(Math.abs(dia(nut.part) - 5.5 * 2 / Math.sqrt(3)) < 0.15, 'across the corners');
  const ins = assemble(load('insert', 'M3'), { type: 'insert', size: 'M3' });
  assert.ok(Math.abs(len(ins.part) - 5.7) < 0.1 && Math.abs(dia(ins.part) - 4.6) < 0.15, 'the M3 insert 4.6 x 5.7');
  assert.ok(assemble(load('nyloc', 'M3'), { type: 'nyloc', size: 'M3' }).nylon, 'the nylon ring');
  const m2 = load('bhcs', 'M2');
  assert.ok(m2.header.near && Math.abs(m2.header.scale - 2 / 3) < 1e-4, 'an M2 button head: the M3 model at 2/3');
  assert.equal(load('insert', 'M6').header.scale, 1, 'the M6 insert is its own model (its id m6-1 is the pitch)');
});

/* the thread itself (Sol 01a1c1da): the segments keep the pitch, and after a remainder the tip, turned about the axis, carries the
   same helix on. The thread's profile is read from the segment (radius by phase); the assembled shank midway and the tip just past
   the joint must sit on it, and the tip unturned must not (so the check can tell) */
test('the assembled thread keeps its pitch, and the tip carries the helix on past a remainder', () => {
  const type = 'shcs', size = 'M4', model = load(type, size), sc = model.header.screw, d = 4;
  const seg = model.pieces.find((p) => p.name === 'seg');
  const phase = (x, y, z) => { const th = Math.atan2(y, x); let u = (th - sc.hand * 2 * Math.PI * z / sc.P) % (2 * Math.PI); return u < 0 ? u + 2 * Math.PI : u; };
  const NB = 90, sum = new Float64Array(NB), cnt = new Float64Array(NB);
  for (let i = 0; i < seg.positions.length; i += 3) { const [x, y, z] = [seg.positions[i], seg.positions[i + 1], seg.positions[i + 2]], r = Math.hypot(x, y); if (r < d * 0.4) continue; const b = Math.floor(phase(x, y, z) / (2 * Math.PI) * NB) % NB; sum[b] += r; cnt[b] += 1; }
  const R = (u) => { const b = Math.floor(u / (2 * Math.PI) * NB) % NB; return cnt[b] ? sum[b] / cnt[b] : NaN; };
  const L = [10, 11, 12, 13].find((l) => { const fill = sc.k + l - sc.k - sc.a - sc.T; const rem = fill - Math.floor(fill / sc.P) * sc.P; return rem > 0.2 * sc.P && rem < 0.8 * sc.P; });
  const fill = sc.k + L - (sc.k + sc.a) - sc.T, n = Math.floor(fill / sc.P), rem = fill - n * sc.P, zA = sc.k + sc.a, zJ = zA + n * sc.P + rem;
  const P = assemble(model, { type, size, length: L }).part.positions;
  const err = (z0, z1, unturn = 0) => { let e = 0, c = 0; for (let i = 0; i < P.length; i += 3) { let [x, y, z] = [P[i], P[i + 1], P[i + 2]]; if (z < z0 || z > z1) continue; const r = Math.hypot(x, y); if (r < d * 0.4) continue; if (unturn) { const cs = Math.cos(-unturn), sn = Math.sin(-unturn); [x, y] = [x * cs - y * sn, x * sn + y * cs]; } const want = R(phase(x, y, z - zA)); if (Number.isNaN(want)) continue; e += Math.abs(r - want); c++; } return e / Math.max(1, c); };
  const mid = zA + Math.floor(n / 2) * sc.P;
  assert.ok(err(mid + 0.1 * sc.P, mid + 0.9 * sc.P) < 0.03, `midway the shank is on the segment's thread: ${err(mid, mid + sc.P).toFixed(3)} mm`);
  const tipErr = err(zJ + 0.05 * sc.P, zJ + 0.6 * sc.P), rot = sc.hand * 2 * Math.PI * rem / sc.P;
  assert.ok(tipErr < 0.04, `past the joint the tip is on the same helix: ${tipErr.toFixed(3)} mm (remainder ${rem.toFixed(2)} of ${sc.P})`);
  assert.ok(err(zJ + 0.05 * sc.P, zJ + 0.6 * sc.P, rot) > 3 * tipErr, 'and unturned it would not be (the check can tell)');
});
