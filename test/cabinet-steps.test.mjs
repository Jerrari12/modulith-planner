/* CABINET DOOR STEPS (Joey 2026-11-19): the hardware goes on in its own steps, each framed on the part going on - the
 * hinges (whole: each prints as one part, body and claws together) and the latch clips on the case, each brought in
 * clear of the wall and then out against it; the door's own latch clips while it is loose, then the door onto the
 * hinges; the handle or knob last, on the hung door swung open. They come after the covers, when every case is home.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { generateManifest } = await import(new URL('../js/generate.js', import.meta.url).href);

const build = (o = {}) => ({ mount: 'tabletop', length: 240, faceStyle: 'essential', handleStyle: 'deco', doorStyle: 'essential',
  wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [], gridW: 4, gridH: 4, nextId: 9, placed: [], ...o });
const cab = (o = {}) => ({ id: 'u1', x: 0, y: 0, w: 2, hh: 8, fill: 'cabinet', ...o });
const titles = (m) => m.steps.map((s) => s.title);

test('the door hardware gets four steps of its own, after the covers', () => {
  const m = generateManifest(build({ placed: [cab({ hinge: 'right' })] })).manifest;
  const t = titles(m);
  const k = t.indexOf('Cabinet hinges');
  assert.ok(k > t.indexOf('Upper cover'), 'after the covers');
  assert.deepEqual(t.slice(k, k + 4), ['Cabinet hinges', 'Latch clips on the case', 'Latch clips, then the door', 'Handle']);
  // nothing of the door is shown in the case's own step any more
  const caseStep = m.steps.find((s) => s.title.startsWith('Bench: bottom case'));
  const shownThere = caseStep.phases.flatMap((p) => (Array.isArray(p.enter) ? p.enter : []).map((e) => e.id));
  assert.ok(!shownThere.some((id) => /^(door|cb[hcp]|cl[sd]|cm[sd]|dg|dsc)/.test(id)), 'the case step installs no door hardware');
});

test('each step frames its own part; the hinge goes on whole; the grip goes on last, on the door held 80 % open', () => {
  const m = generateManifest(build({ placed: [cab()] })).manifest;
  const step = (title) => m.steps.find((s) => s.title === title);
  const hinges = step('Cabinet hinges');
  const firstEnter = hinges.phases.find((p) => Array.isArray(p.enter)).enter.map((e) => e.id);
  assert.deepEqual(firstEnter.sort(), ['cbc0a', 'cbh0a'], 'body and claws arrive together');
  assert.ok(hinges.phases.some((p) => p.camera), 'the camera moves to the second hinge');
  const grip = step('Handle');
  const screws = grip.phases.flatMap((p) => (Array.isArray(p.enter) ? p.enter : [])).filter((e) => e.id.startsWith('dsc'));
  assert.equal(screws.length, 2, 'two M3 screws for a handle');
  assert.ok(screws.every((e) => e.spin), 'they thread in');
  const swings = grip.phases.filter((p) => p.swing).map((p) => p.swing[0].to);
  assert.deepEqual(swings, [0.8, 0], 'open to 80 % for the grip, then shut');
  const iGrip = grip.phases.findIndex((p) => (p.enter || []).some((e) => e.id === 'dg0'));
  assert.ok(iGrip > grip.phases.findIndex((p) => p.swing), 'the grip goes on with the door already open');
  const one = generateManifest(build({ gridW: 2, gridH: 1, placed: [cab({ w: 1, hh: 2, hinge: 'right' })] })).manifest;
  const knobStep = one.steps.find((s) => s.title === 'Knob');
  assert.ok(knobStep, 'a 1H door takes a knob');
  assert.equal(knobStep.phases.flatMap((p) => (Array.isArray(p.enter) ? p.enter : [])).filter((e) => e.id.startsWith('dsc')).length, 1, 'on one screw');
});

test('a second cabinet takes one step, on every mount every door part is shown', () => {
  const two = generateManifest(build({ placed: [cab(), cab({ id: 'u2', x: 2 })] })).manifest;
  assert.ok(titles(two).includes('The other cabinets'));
  for (const mount of ['tabletop', 'wall', 'under-table']) {
    const m = generateManifest(build({ mount, gridW: 2, gridH: 2, placed: [cab({ hh: 4 })] })).manifest;
    const shown = new Set(m.steps.flatMap((s) => (s.phases || []).flatMap((p) => ['enter', 'fade'].flatMap((k) => (Array.isArray(p[k]) ? p[k] : []).map((e) => e.id)))));
    const parts = m.instances.filter((i) => /Cabinet|Door_|Knob_/.test(i.node) || i.rides === 'door0' || /^(cm[sd]|cbp)/.test(i.id)).map((i) => i.id);
    assert.deepEqual(parts.filter((id) => !shown.has(id)), [], `${mount}: every door part appears`);
  }
});

test('each latch clip takes its 10x2 magnet before it goes in, from where its pocket opens, and the notes say polarity', () => {
  for (const hinge of ['left', 'right']) {
    const m = generateManifest(build({ placed: [cab({ hinge })] })).manifest;
    const s = hinge === 'right' ? -1 : 1;
    const step = (title) => m.steps.find((st) => st.title === title);
    const byId = Object.fromEntries(m.instances.map((i) => [i.id, i]));
    // two latches, two magnets each, drawn turned onto X and sitting in the clip's pocket
    for (const k of ['a', 'b']) {
      const sm = byId[`cms0${k}`], dm = byId[`cmd0${k}`], sc = byId[`cls0${k}`], dc = byId[`cld0${k}`];
      assert.equal(sm.node, 'Magnet_10x2mm'); assert.deepEqual(sm.rot, [0, 90, 0]);
      assert.ok(Math.abs(sm.pos[0] - (sc.pos[0] - s * 1.12)) < 1e-6 && Math.abs(sm.pos[1] - (sc.pos[1] + 7)) < 1e-6, 'case magnet in the side clip pocket');
      assert.ok(Math.abs(dm.pos[0] - (dc.pos[0] + s * 0.5)) < 1e-6 && Math.abs(dm.pos[2] - (dc.pos[2] - 1.17)) < 1e-6, 'door magnet in the door clip slot');
      assert.equal(dm.rides, 'door0', 'the door magnet turns with the door'); assert.equal(sm.rides, undefined);
    }
    const caseStep = step('Latch clips on the case');
    const flat = caseStep.phases.flatMap((p, n) => (p.enter || []).map((e) => ({ ...e, n })));
    const clip = flat.find((e) => e.id === 'cls0a'), mag = flat.find((e) => e.id === 'cms0a');
    assert.ok(mag.n > clip.n, 'the magnet goes into the clip after the clip is out');
    assert.equal(Math.sign(mag.from[0]), s, 'pressed in from the wall side');
    const firstMove = caseStep.phases.findIndex((p) => (p.move || []).some((mv) => mv.id === 'cls0a'));
    assert.ok(firstMove > mag.n, 'and only then does the clip go in');
    assert.match(caseStep.note, /10×2 mm magnet/); assert.match(caseStep.note, /attract/); assert.match(caseStep.note, /mark/);
    const doorStep = step('Latch clips, then the door');
    const dflat = doorStep.phases.flatMap((p, n) => (p.enter || []).map((e) => ({ ...e, n })));
    assert.ok(dflat.find((e) => e.id === 'cmd0a').n > dflat.find((e) => e.id === 'cld0a').n);
    const hung = doorStep.phases.findIndex((p) => p.appear);
    assert.ok(dflat.find((e) => e.id === 'cld0a').n < hung, 'the door takes its clips while it is loose, before it is hung');
    assert.match(doorStep.note, /magnet/); assert.match(doorStep.note, /mark/);
    const row = m.parts.find((p) => p.node === 'Magnet_10x2mm');
    assert.equal(row.qty, 4); assert.ok(row.purchased);
  }
});

test('the door clip goes on like the other hardware: pegs into the slots high, then slid down 4 mm to lock (Joey 2026-11-20)', () => {
  for (const hinge of ['left', 'right']) {
    const m = generateManifest(build({ placed: [cab({ hinge })] })).manifest;
    const st = m.steps.find((x) => x.title === 'Latch clips, then the door');
    for (const id of ['cld0a', 'cmd0a']) {
      const enter = st.phases.flatMap((p) => p.enter || []).find((e) => e.id === id);
      assert.equal(enter.at[1], 4, `${id} comes in 4 mm high`);
      const moves = st.phases.map((p, n) => ({ n, mv: (p.move || []).find((mv) => mv.id === id) })).filter((x) => x.mv);
      const press = moves.find((x) => x.mv.by[2] > 0), slide = moves.find((x) => x.mv.by[1] === -4);
      assert.ok(press && slide && slide.n === press.n + 1, `${id}: pressed on, then slid down next`);
      assert.equal(slide.mv.ease, 'detent', 'it clicks home');
      assert.ok(slide.n < st.phases.findIndex((p) => p.appear), 'while the door is still loose');
    }
    // the note says what the reader does, in the reader's terms: no animation angle (Joey: "that 80% was just a note for you")
    assert.match(st.note, /pegs into the slots in the door and slide it down to lock/);
    assert.match(st.note, /C-clips to face outward/);
    assert.doesNotMatch(st.note, /%|press the clip on/);
  }
});

test('the door is hung on claws turned 80 % open; with two hinges the top one first, then the bottom', () => {
  for (const [b, two] of [[build({ placed: [cab()] }), true], [build({ gridW: 2, gridH: 1, placed: [cab({ w: 1, hh: 2 })] }), false]]) {
    const m = generateManifest(b).manifest;
    const st = m.steps.find((x) => /then the door$/.test(x.title));
    const iOpen = st.phases.findIndex((p) => p.appear && p.swing && p.swing[0].to === 0.8);
    assert.ok(iOpen > 0, 'the claws (and the door with them) turn 80 % open as the room comes back');
    assert.ok(st.phases[iOpen].swing[0].ids.some((id) => id.startsWith('cbc')), 'the claws turn');
    const push = st.phases.findIndex((p) => (p.move || []).some((mv) => mv.id === 'door0' && mv.ease === 'detent'));
    assert.ok(push > iOpen, 'then the door is pressed onto them');
    assert.ok(st.phases.slice(iOpen + 1, push).some((p) => p.camera), 'framed close on the claws first');
    // every door part nets to home by the end of the step, and the door is shut again
    for (const id of ['door0', 'cld0a', 'cmd0a']) {
      const net = [0, 1, 2].map((j) => st.phases.flatMap((p) => [...(p.enter || []).filter((e) => e.id === id).map((e) => (e.at || [0, 0, 0]).map((v, j) => v + (e.via ? e.via.at(-1)[j] : 0))),
        ...(p.move || []).filter((mv) => mv.id === id).map((mv) => mv.by)]).reduce((a, v) => a + v[j], 0));
      assert.ok(net.every((v) => Math.abs(v) < 1e-9), `${id} ends home (${net})`);
    }
    const tips = st.phases.filter((p) => p.swing && p.swing[0].tilt).map((p) => p.swing[0].tilt);
    if (two) {
      assert.deepEqual(tips.map((t) => t.to), [1, 0], 'tipped onto the top hinge, then squared up on the bottom');
      assert.ok(Math.abs(tips[0].deg) > 0 && Math.abs(tips[0].deg) < 5, 'a small tip');
      assert.ok(!tips[0].ids.some((id) => id.startsWith('cbc')), 'the claws stay on the hinge');
      assert.match(st.note, /top hinge first/);
    } else assert.equal(tips.length, 0);
    assert.equal(st.phases.at(-1).swing[0].to, 0, 'swung shut to check');
  }
});

test('the optional filament pin goes down each hinge barrel before the hinge goes in, and is colored', () => {
  const m = generateManifest(build({ placed: [cab({ hinge: 'right' })] })).manifest;
  const st = m.steps.find((x) => x.title === 'Cabinet hinges');
  const byId = Object.fromEntries(m.instances.map((i) => [i.id, i]));
  for (const k of ['a', 'b']) {
    const pin = byId[`cbp0${k}`], body = byId[`cbh0${k}`];
    assert.equal(pin.node, 'HingePin_Filament175'); assert.equal(pin.type, 'HingePin');
    assert.ok(Math.abs(pin.pos[1] - (body.pos[1] + 1)) < 1e-9, 'standing on the barrel floor');
    const n = st.phases.findIndex((p) => (p.enter || []).some((e) => e.id === pin.id));
    const e = st.phases[n].enter[0];
    assert.ok(e.from[1] > 0 && e.from[0] === 0 && e.from[2] === 0, 'straight down from above');
    const into = st.phases.findIndex((p) => (p.move || []).some((mv) => mv.id === body.id && mv.by[2] < 0));
    assert.ok(into > n, 'the hinge goes into the case only after its pin');
    assert.ok(st.phases[into].move.some((mv) => mv.id === pin.id), 'and the pin goes with it');
  }
  assert.match(st.note, /1\.75 mm filament/); assert.match(st.note, /PETG/); assert.match(st.note, /flush/);
  assert.ok(m.colors.HingePin, 'the pin has a colour');
  for (const t of ['CaseExtender', 'ShelfInsert']) assert.ok(m.colors[t], `a cabinet build colours its ${t}`);
});

test('the door slides onto the claws along its own width (the fingers), and a crooked hang turns in its own plane', () => {
  for (const hinge of ['left', 'right']) {
    const s = hinge === 'right' ? -1 : 1;
    const m = generateManifest(build({ placed: [cab({ hinge })] })).manifest;
    const st = m.steps.find((x) => /then the door$/.test(x.title));
    const a = -s * 100 * 0.8 * Math.PI / 180, nO = [Math.sin(a), 0, Math.cos(a)], wO = [Math.cos(a), 0, -Math.sin(a)];
    const push = st.phases.find((p) => (p.move || []).some((mv) => mv.id === 'door0' && mv.ease === 'detent')).move.find((mv) => mv.id === 'door0').by;
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    assert.ok(Math.abs(dot(push, nO)) < 1e-9, `${hinge}: no motion through the door's face`);
    assert.ok(dot(push, wO) * s < -20, `${hinge}: toward the hinge, farther than the fingers are long`);
    const tilt = st.phases.find((p) => p.swing && p.swing[0].tilt).swing[0].tilt;
    assert.ok(Math.abs(dot(tilt.axis, nO) - 1) < 1e-9, `${hinge}: the tip turns about the door's normal`);
    assert.equal(Math.sign(tilt.deg), s, `${hinge}: its bottom farther from the hinge`);
  }
});

test('the hinges and the case latch clips come in clear of the wall, then out against it, then down', () => {
  for (const hinge of ['left', 'right']) {
    const s = hinge === 'right' ? -1 : 1;
    const m = generateManifest(build({ placed: [cab({ hinge })] })).manifest;
    for (const [title, id, inward] of [['Cabinet hinges', 'cbh0a', s], ['Latch clips on the case', 'cls0a', -s]]) {
      const st = m.steps.find((x) => x.title === title);
      const enter = st.phases.flatMap((p) => p.enter || []).find((e) => e.id === id);
      assert.equal(Math.sign(enter.at[0]), inward, `${hinge} ${id}: held toward the case's middle`);
      const moves = st.phases.map((p) => (p.move || []).find((mv) => mv.id === id)).filter(Boolean).map((mv) => mv.by);
      const iBack = moves.findIndex((b) => b[2] < 0), iOut = moves.findIndex((b) => b[0] !== 0), iDown = moves.findIndex((b) => b[1] < 0);
      assert.ok(iBack >= 0 && iBack < iOut && iOut < iDown, `${hinge} ${id}: back, then out against the wall, then down`);
      assert.ok(Math.abs(moves[iOut][0] + enter.at[0]) < 1e-9, `${hinge} ${id}: out by exactly what it was held in`);
    }
  }
});

/* THE HINGES AND LATCHES ARE COLOURED APART FROM THE QUICKLOCKS (Joey 2026-11-23: "because they are more visible, especially
   the hinges are always visible and the closure hardware are only visible once opened"). Rows of their own, with no
   identification colour of their own, so until a visitor picks them they follow the QuickLocks (paletteParentOf). */
test('the hinges and latches are rows of their own that follow the QuickLocks until picked', async () => {
  const { paletteParentOf, PALETTE_PARENT } = await import(new URL('../js/generate.js', import.meta.url).href);
  const m = generateManifest(build({ placed: [cab({ hinge: 'right' })] })).manifest;
  const typeOf = Object.fromEntries(m.parts.map((p) => [p.node, p.type]));
  assert.equal(typeOf.CabinetHinge_Body_R, 'CabinetHinge');
  assert.equal(typeOf.CabinetLatch_Side_L, 'CabinetLatch');
  assert.equal(typeOf.CabinetLatch_Door_L, 'CabinetLatch');
  const claws = m.instances.filter((i) => i.node === 'CabinetHinge_Claws_R');
  assert.ok(claws.length && claws.every((i) => i.type === 'CabinetHinge' && m.instances.some((b) => b.id === i.billedOn && b.node === 'CabinetHinge_Body_R')), 'the claws are coloured as the hinge and billed on its body');
  assert.ok(!m.parts.some((p) => p.type === 'QuickLock' && /^Cabinet/.test(p.node)), 'no cabinet part is a QuickLock row any more');
  assert.ok(!('CabinetHinge' in m.colors) && !('CabinetLatch' in m.colors), 'no identification colour of their own: they take the QuickLock\'s');
  assert.ok('QuickLock' in m.colors, 'the control: the QuickLock colour is there to follow');
  assert.equal(paletteParentOf('CabinetHinge'), 'QuickLock');
  assert.equal(paletteParentOf('CabinetLatch'), 'QuickLock');
  assert.equal(paletteParentOf('Faceplate:FACE'), 'Faceplate', 'a zone still follows its body');
  assert.equal(paletteParentOf('QuickLock'), null);
  assert.equal(paletteParentOf('constructor'), null, 'a name on Object.prototype follows nothing');
  assert.deepEqual(Object.keys(PALETTE_PARENT).sort(), ['CabinetHinge', 'CabinetLatch']);
});
