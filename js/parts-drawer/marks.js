// MODULITH parts drawer generator — layout codes and the little block font that marks them under the drawer.
// A layout code names one exact layout: six Crockford base32 characters from a SHA-256 of the layout, shown as MD-XXX-XXX.
// The share text is the whole layout, deflated and base64url'd, so it reopens without any server.

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const enc = new TextEncoder(), dec = new TextDecoder();
const b64url = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

const trayOf = (c) => (c.tray === true ? 3 : Math.round((+c.tray || 0) * 10) / 10);   // mm; layouts from before sizes said true
// the parts of the state that make a drawer: compact, and in a fixed key order so equal layouts get equal codes
export function canonical(st) {
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  return {
    v: 2, h: st.height, l: st.label,
    ...(st.size && st.size !== '240-2W' ? { s: st.size } : {}),   // v24: the size, only when not the 240-2W, so older codes stay as they were
    f: st.floor && st.floor.mode !== 'off' ? [st.floor.mode, st.floor.slots, ...st.floor.colors.slice(0, st.floor.mode === 'one' ? 1 : st.floor.slots)] : 0,
    o: st.outlines ? 1 : 0,
    ...(st.lid ? { d: 1 } : st.covers ? { d: 2, ...(st.comps.some((c) => c.nocover) ? { u: st.comps.map((c, i) => (c.nocover ? i : -1)).filter((i) => i >= 0) } : {}) } : {}),   // only when on, so codes without a lid stay as they were
    c: st.comps.map((c) => [r4(c.x0), r4(c.x1), r4(c.y0), r4(c.y1), c.holder ? 1 : 0, c.scoop, trayOf(c), c.color | 0,
      c.item ? [c.item.type, c.item.size, c.item.length || 0, c.item.qty || 0] : 0,
      ...(c.cell ? [cellEntry(c)] : [])]),   // cells (v18) only when set, so older codes stay as they were
  };
}
// a cell: [kind, size] with the bearing (wells) or washer (rows) size, else 0 (v19); a third entry 1 when spaced dense
// (v20). v18-v19 bearing posts come back as wells.
function cellEntry(c) {
  const kind = c.cell === 'posts' ? 'wells' : c.cell;
  return [kind, (kind === 'wells' ? c.bearing : kind === 'washers' ? c.washer : 0) || 0, ...(c.spacing === 'dense' && kind !== 'washers' ? [1] : [])];
}
export function fromCanonical(k) {
  if (!k || k.v !== 2 || !Array.isArray(k.c)) throw new Error('not a layout');
  return {
    v: 2, size: k.s || '240-2W', height: k.h, label: k.l, outlines: !!k.o, lid: k.d === 1, covers: k.d === 2,
    floor: k.f ? { mode: k.f[0], slots: k.f[1], colors: k.f.slice(2) } : { mode: 'off' },
    comps: k.c.map((a, j) => ({ x0: a[0], x1: a[1], y0: a[2], y1: a[3], holder: !!a[4], scoop: a[5], tray: a[6] === true ? 3 : +a[6] || 0, color: a[7] | 0,
      ...(a[8] ? { item: { type: a[8][0], size: a[8][1], length: a[8][2], qty: a[8][3] } } : {}), ...(k.u && k.u.includes(j) ? { nocover: true } : {}),
      ...(Array.isArray(a[9]) ? { cell: a[9][0] === 'posts' ? 'wells' : a[9][0], ...(a[9][1] ? { [a[9][0] === 'washers' ? 'washer' : 'bearing']: a[9][1] } : {}), ...(a[9][2] ? { spacing: 'dense' } : {}) } : {}) })),
  };
}
export async function codeOf(st) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify(canonical(st)))));
  const bits = (h[0] << 22) | (h[1] << 14) | (h[2] << 6) | (h[3] >> 2);
  let s = ''; for (let i = 5; i >= 0; i--) s += B32[(bits >>> (i * 5)) & 31];
  return s;
}
export const pretty = (code) => `MD-${code.slice(0, 3)}-${code.slice(3)}`;
// accepts "MD-7KQ-2X9", "7kq2x9", with Crockford's look-alikes (O->0, I/L->1)
export function parseCode(s) {
  const t = String(s).toUpperCase().replace(/^MD/, '').replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{6}$/.test(t) ? t : null;
}
export async function shareOf(st) { return 'mdg1.' + b64url(await pipe(enc.encode(JSON.stringify(canonical(st))), new CompressionStream('deflate-raw'))); }
export async function fromShare(s) {
  const t = String(s).trim(); if (!t.startsWith('mdg1.')) throw new Error('not a share text');
  return fromCanonical(JSON.parse(dec.decode(await pipe(unb64url(t.slice(5)), new DecompressionStream('deflate-raw')))));
}

// ---------- block font ----------
// 5 x 7 cells per glyph, rows top to bottom. Square pixels print cleanly as a 0.4 mm recess in the first layers.
const FONT = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'], J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'], X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '10001', '01010', '00100', '00100', '00100'], Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'], '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'], ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
// rectangles (one per horizontal run of pixels) for a line of text, centred on (cx, cy) in drawer mm. mirror: read from below.
export function textRects(text, { px = 0.8, cx = 0, cy = 0, mirror = false } = {}) {
  const chars = [...String(text).toUpperCase()].filter((ch) => FONT[ch]);
  const adv = 6 * px, w = chars.length * adv - px, h = 7 * px; const out = [];
  chars.forEach((ch, k) => FONT[ch].forEach((row, j) => {
    for (let i = 0; i < 5;) {
      if (row[i] !== '1') { i++; continue; }
      let e = i; while (e < 5 && row[e] === '1') e++;
      let x0 = -w / 2 + k * adv + i * px, x1 = -w / 2 + k * adv + e * px;
      if (mirror) [x0, x1] = [-x1, -x0];
      const y1 = h / 2 - j * px, y0 = y1 - px;
      out.push([[cx + x0, cy + y0], [cx + x1, cy + y0], [cx + x1, cy + y1], [cx + x0, cy + y1]]);
      i = e;
    }
  }));
  return out;
}
