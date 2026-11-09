/* THE CHIPS IN A CHIP DRAWER (2026-11-09, Joey: "add some chips that show when the drawer is open, chips for each color used
   in the build and material label chip to organize the different materials used").

   A Filament Sample Chip Drawer on the stage holds one chip in every filament the build is printed in, sorted behind a black
   title piece per material (PLA, PETG, TPU): open the drawer and the build's own colours stand in its lanes. The chips ride
   the drawer (they are children of its body), so a peek, a deep pull or a step's glide carries them.

   PLACEMENT is the release's comb, the numbers generate.js's CHIPS carries and the listing rig stands chips by
   (category_art.py chipset, checked slot by slot against the release STLs by build_chip_drawer_blend.py). In a drawer body's
   own frame - x across, y up from its floor, +z toward its front:
     - the lanes' chip centre-lines at x = +/-20.125;
     - slot k's centre at z = front - inset - 7.125 - k x pitch, the inset the cavity's inner front face behind the drawer's
       front-most point: 20.0 on a Classic (behind its moulded grip), 4.3 on a Decor;
     - a chip stands on the lane floor, 0.5 above the drawer's bottom; the chip GLB already stands as it does in a slot
       (29.75 across, 19 tall, 1.75 thick along z, centred, its foot at y 0);
     - a title piece stands over two slots, its centre half a pitch behind its first slot's: an inverted U 29.75 x 5.75 x 17,
       two 1.75 legs 4.0 apart centre to centre, a 3 mm cap from 14.0 to 17.0 (the release STLs, measured 2026-11-08), the
       material on its cap reading across the lane with its top toward the drawer's back.

   chipFillGroups and chipFillLayout are pure (test/chip-fill.test.mjs); buildChipFill makes the meshes. */

export const CHIP_LANE_X = 20.125;
export const CHIP_FIRST = 7.125;
export const CHIP_FLOOR = 0.5;
export const CHIP_INSET = { Classic: 20.0, Decor: 4.3 };
export const TITLE_PIECE = { w: 29.75, d: 5.75, h: 17.0, cap: 3.0, leg: 1.75, legPitch: 4.0 };
/** The order the material groups take in a drawer, front lane first: the order the planner's material chips show them. */
export const CHIP_MATERIALS = ['PLA', 'PETG', 'TPU'];

const hexRgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) : [0.5, 0.5, 0.5];
};
/** hue in [0, 360), saturation and lightness in [0, 1] (HSL) */
export function hexHsl(hex) {
  const [r, g, b] = hexRgb(hex), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-9) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
/** a colour too grey, too dark or too light to have a hue worth sorting by: it goes after the coloured chips */
const neutral = ([, s, l]) => s < 0.15 || l < 0.1 || l > 0.93;

/**
 * The build's filaments as chip groups. `entries` are { hex, name } (name: the filament's label, or null when the palette
 * names none); the same filament twice is one chip (by name, else by hex). `materialOf(entry)` answers PLA / PETG / TPU, or
 * null for PLA. Groups come in CHIP_MATERIALS order (any other material after them, alphabetically); in a group, the coloured
 * chips by hue, then the neutrals light to dark, as the listing images sort them.
 */
export function chipFillGroups(entries, materialOf = () => null) {
  const seen = new Map();
  for (const e of entries || []) {
    if (!e || !e.hex) continue;
    const material = materialOf(e) || 'PLA';
    // an unnamed colour is one chip per material: a bare TPU foot in a PLA part's colour is two filaments (Sol 01a1c166)
    const id = (e.name ? 'n:' + e.name : 'h:' + e.hex + '|' + material).toLowerCase();
    if (!seen.has(id)) seen.set(id, { hex: e.hex, name: e.name || null, material });
  }
  const by = new Map();
  for (const c of seen.values()) (by.get(c.material) || by.set(c.material, []).get(c.material)).push(c);
  const order = [...by.keys()].sort((a, b) => {
    const ia = CHIP_MATERIALS.indexOf(a), ib = CHIP_MATERIALS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return order.map((material) => {
    const chips = by.get(material).map((c) => ({ ...c, hsl: hexHsl(c.hex) }));
    const coloured = chips.filter((c) => !neutral(c.hsl)).sort((a, b) => a.hsl[0] - b.hsl[0] || b.hsl[2] - a.hsl[2]);
    const greys = chips.filter((c) => neutral(c.hsl)).sort((a, b) => b.hsl[2] - a.hsl[2]);
    return { material, chips: [...coloured, ...greys].map(({ hsl, ...c }) => c) };
  });
}

/**
 * Where everything stands: `lanes` arrays (left lane first), each a list of { kind: 'title', slot, material } (over slots
 * slot and slot + 1) and { kind: 'chip', slot, hex, name, material }, front to back. Each material's chips follow its title
 * piece. While everything fits, each material starts in the emptier lane (the left one on a tie), whole, so a small build
 * sorts its materials across both lanes; once a material cannot fit whole in either lane, the rest fill in order, and a
 * lane that picks a material up part-way starts with that material's title again, so every run of chips is labelled. A
 * title only goes in where at least one of its chips fits behind it. What does not fit is counted in `dropped`.
 */
export function chipFillLayout(groups, slotsPerLane, lanes = 2, gap = null) {
  // Joey 2026-11-09, on the first look: "maybe spread them out a little, move petg and tpu to the right side?" - one empty
  // slot between pieces wherever everything still fits that way; packed tight only where it would not (a 59's 8 slots)
  if (gap === null) {
    const spread = chipFillLayout(groups, slotsPerLane, lanes, 1);
    return spread.dropped ? chipFillLayout(groups, slotsPerLane, lanes, 0) : spread;
  }
  const out = Array.from({ length: lanes }, () => []);
  const used = Array(lanes).fill(0);   // the next free slot, a gap already counted after the last piece
  const all = groups || [];
  const put = (lane, item, size) => { out[lane].push({ ...item, slot: used[lane] }); used[lane] += size + gap; };
  const title = (g) => ({ kind: 'title', material: g.material });
  const chip = (g, c) => ({ kind: 'chip', hex: c.hex, name: c.name, material: g.material });
  // 1. whole materials, each into the emptier lane, while one fits: its title, its chips, a gap after each but the last
  let i = 0;
  for (; i < all.length; i++) {
    const g = all[i], lane = used.indexOf(Math.min(...used));
    if (used[lane] + 2 + g.chips.length + gap * g.chips.length > slotsPerLane) break;
    put(lane, title(g), 2);
    for (const c of g.chips) put(lane, chip(g, c), 1);
  }
  // 2. the rest in order, the emptier lane first; a run of chips that starts in a lane starts behind its title
  const order = [...out.keys()].sort((a, b) => used[a] - used[b]);
  let li = 0, dropped = 0;
  for (; i < all.length; i++) {
    const g = all[i];
    let titled = false;
    for (const c of g.chips) {
      while (li < order.length && used[order[li]] + (titled ? 1 : 3 + gap) > slotsPerLane) { li++; titled = false; }
      if (li >= order.length) { dropped++; continue; }
      if (!titled) { put(order[li], title(g), 2); titled = true; }
      put(order[li], chip(g, c), 1);
    }
  }
  return { lanes: out, dropped };
}

/** a slot's z in the drawer body's frame (see the header) */
export const slotZ = (front, style, pitch, k) => front - CHIP_INSET[style] - CHIP_FIRST - k * pitch;

/**
 * The meshes for one drawer: a THREE.Group to add to the drawer body's own (template) child. `chip` is the chip GLB's mesh
 * ({ geometry, matrix }: its geometry and its transform within the GLB); `front` the body's front-most z; `pitch` its comb's.
 * One InstancedMesh for the chips (each its own colour), one for the title pieces' three boxes, and a decal per title. The
 * materials are the chips' own: `pinMaterial` keeps the stage's per-part painting off them.
 */
export function buildChipFill(THREE, { chip, style, front, pitch, layout, textFor, pinMaterial }) {
  const group = new THREE.Group();
  group.name = 'ChipFill';
  group.userData.chipFill = true;
  const placed = layout.lanes.flatMap((seq, i) => seq.map((it) => ({ ...it, x: (i ? 1 : -1) * CHIP_LANE_X })));
  const chips = placed.filter((it) => it.kind === 'chip'), titles = placed.filter((it) => it.kind === 'title');
  const m = new THREE.Matrix4(), c = new THREE.Color();
  if (chips.length) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0 });
    const im = new THREE.InstancedMesh(chip.geometry, mat, chips.length);
    chips.forEach((it, n) => {
      m.makeTranslation(it.x, CHIP_FLOOR, slotZ(front, style, pitch, it.slot)).multiply(chip.matrix);
      im.setMatrixAt(n, m);
      im.setColorAt(n, c.set(it.hex));
    });
    im.name = 'ChipFillChips';
    group.add(im);
  }
  if (titles.length) {
    const T = TITLE_PIECE;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const body = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.55, metalness: 0 });
    const parts = [   // [centre y, depth along z, height, z offset] of the cap and the two legs, legs on the lane floor
      [T.h - T.cap / 2, T.d, T.cap, 0],
      [(T.h - T.cap) / 2, T.leg, T.h - T.cap, -T.legPitch / 2],
      [(T.h - T.cap) / 2, T.leg, T.h - T.cap, T.legPitch / 2],
    ];
    const im = new THREE.InstancedMesh(box, body, titles.length * parts.length);
    let n = 0;
    for (const it of titles) {
      const zc = slotZ(front, style, pitch, it.slot) - pitch / 2;   // half a pitch behind its first slot
      for (const [y, d, h, dz] of parts) {
        m.makeScale(T.w, h, d).setPosition(it.x, CHIP_FLOOR + y, zc + dz);
        im.setMatrixAt(n++, m);
      }
      const tex = textFor(it.material);
      if (tex) {
        const decal = new THREE.Mesh(new THREE.PlaneGeometry(T.w, T.d),
          new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.6, metalness: 0,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        decal.rotation.x = -Math.PI / 2;   // face up; the plane's +y (the word's top) toward -z, the drawer's back
        decal.position.set(it.x, CHIP_FLOOR + T.h + 0.02, zc);
        decal.name = 'ChipFillTitle ' + it.material;
        group.add(decal);
      }
    }
    im.name = 'ChipFillTitlePieces';
    group.add(im);
  }
  group.traverse((o) => { if (o.isMesh) { o.userData.chipFill = true; o.castShadow = true; o.receiveShadow = true; pinMaterial(o); } });
  return group;
}

/** A title's word, white on clear, in a condensed bold face (the shipped titles are Arial Bold at 0.82 width). */
export function titleTexture(THREE, word) {
  const W = 512, H = Math.round(W * TITLE_PIECE.d / TITLE_PIECE.w);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#f2f2f2';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(H * 0.72)}px Arial, "Helvetica Neue", sans-serif`;
  g.save(); g.translate(W / 2, H / 2 + H * 0.03); g.scale(0.82, 1);
  g.fillText(String(word).toUpperCase(), 0, 0);
  g.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
