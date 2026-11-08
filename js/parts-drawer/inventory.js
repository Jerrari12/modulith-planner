// MODULITH parts drawer generator — inventory to drawer.
// A parts list (type, thread size, length, quantity) becomes a layout: compartments sized to hold their quantity, in
// reading order (front-left to back-right), each with its label text. Pure functions, shared by the page and the tests.
//
// DIMENSIONS are typical ISO values (ISO 4762, 7380-1, 10642, 4026, 4032, DIN 985, ISO 7089) and common heat-set insert
// sizes. They are used only to estimate how much room a quantity of parts takes; they are not a specification.
import { C, SIZES, HOLDERS, comp, spans, snapMM, bearingDims, WASHERS as WASHER, LOCK_WASHERS as LOCKW, isTall, reachMin } from './gen.js';
import { PACKING } from './packing.js';

export const THREADS = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12'];
const D = { M2: 2, 'M2.5': 2.5, M3: 3, M4: 4, M5: 5, M6: 6, M8: 8, M10: 10, M12: 12 };
// head diameter dk and height k per type; nut across-flats s and height m (washers: WASHERS in gen.js)
const SHCS = { M2: [3.8, 2], 'M2.5': [4.5, 2.5], M3: [5.5, 3], M4: [7, 4], M5: [8.5, 5], M6: [10, 6], M8: [13, 8], M10: [16, 10], M12: [18, 12] };
const BHCS = { M2: [3.5, 1.3], 'M2.5': [4.7, 1.5], M3: [5.7, 1.65], M4: [7.6, 2.2], M5: [9.5, 2.75], M6: [10.5, 3.3], M8: [14, 4.4], M10: [17.5, 5.5], M12: [21, 6.6] };
const FHCS = { M2: [4, 1.2], 'M2.5': [5, 1.5], M3: [6.72, 1.86], M4: [8.96, 2.48], M5: [11.2, 3.1], M6: [13.44, 3.72], M8: [17.92, 4.96], M10: [22.4, 6.2], M12: [26.88, 7.44] };
const NUT = { M2: [4, 1.6], 'M2.5': [5, 2], M3: [5.5, 2.4], M4: [7, 3.2], M5: [8, 4.7], M6: [10, 5.2], M8: [13, 6.8], M10: [16, 8.4], M12: [18, 10.8] };
const NYLOC = { M2: [4, 3], 'M2.5': [5, 3.5], M3: [5.5, 4], M4: [7, 5], M5: [8, 5], M6: [10, 6], M8: [13, 8], M10: [16, 10], M12: [18, 12] };
const INSERT = { M2: [3.6, 3], 'M2.5': [4, 4], M3: [4.6, 5.7], M4: [6.3, 8.1], M5: [7.1, 9.5], M6: [8.7, 12.7] };
// 3D-printer hardware (v18), again only to estimate room. Bearings (BEARINGS) and lock washers (LOCK_WASHERS, DIN 127)
// live in gen.js, which the cells share; knurled thumb nuts and wafer and pan heads (diameter, height) are typical
// catalogue values; 2020 T-nuts: length, width, height and how much of that box is metal.
const KNURLED = { M2: [5, 3], 'M2.5': [6, 3], M3: [7, 3], M4: [9, 4], M5: [10, 5], M6: [12, 6], M8: [16, 8] };
const WAFER = { M2: [5, 1], 'M2.5': [6, 1.2], M3: [7, 1.6], M4: [9.4, 2], M5: [11.5, 2.5], M6: [14, 3] };
const PAN = { M2: [3.8, 1.3], 'M2.5': [4.7, 1.7], M3: [5.6, 1.8], M4: [7.5, 2.4], M5: [9.2, 3] };
const TNUT = { roll: [10.5, 6, 4.5, 0.55], spring: [10.5, 6, 6, 0.5], hammer: [10, 6, 5, 0.5] };

// type: label word, whether it has a length, packing fraction of a loose pile, and its table
export const TYPES = {
  shcs:   { name: 'Socket head screw', short: 'SHCS', screw: true, pack: 0.3, head: SHCS },
  bhcs:   { name: 'Button head screw', short: 'BHCS', screw: true, pack: 0.3, head: BHCS },
  fhcs:   { name: 'Flat head screw', short: 'FHCS', screw: true, pack: 0.3, head: FHCS, cone: true },
  set:    { name: 'Set screw', short: 'SET SCREW', screw: true, pack: 0.4, head: null },
  nut:    { name: 'Hex nut', short: 'NUT', pack: 0.4, table: NUT },
  nyloc:  { name: 'Nyloc nut', short: 'NYLOC', pack: 0.4, table: NYLOC },
  washer: { name: 'Washer', short: 'WASHER', pack: 0.35, table: WASHER },
  insert: { name: 'Heat-set insert', short: 'INSERT', pack: 0.4, table: INSERT, len: true },
  // v18: the rest of a 3D-printer hardware kit. len: the length field means something (insert length, spacer
  // thickness, shaft length, magnet thickness, pulley bore). free: size is a designation or a name, not a thread.
  // discrete: placed side by side (and up to three high) rather than poured in as a pile. outside: ships outside the drawers.
  wafer:       { name: 'Wafer head screw', short: 'WAFER HEAD', screw: true, pack: 0.3, head: WAFER },
  captive:     { name: 'Captive screw', short: 'CAPTIVE', screw: true, pack: 0.3, head: SHCS },
  selftap:     { name: 'Self-tapping screw', short: 'SELF-TAP', screw: true, pack: 0.3, head: PAN },
  knurled:     { name: 'Knurled nut', short: 'KNURLED NUT', pack: 0.4, table: KNURLED, round: true },
  lockwasher:  { name: 'Lock washer', short: 'LOCK WASHER', pack: 0.3, table: LOCKW },
  spacer:      { name: 'Precision spacer', short: 'SPACER', pack: 0.45, table: WASHER, len: true },
  tnut_roll:   { name: 'Roll-in T-nut', short: 'ROLL-IN T-NUT', pack: 0.4, tnut: 'roll' },
  tnut_spring: { name: 'Spring-ball T-nut', short: 'SPRING T-NUT', pack: 0.4, tnut: 'spring' },
  tnut_hammer: { name: 'Hammer head T-nut', short: 'HAMMER T-NUT', pack: 0.4, tnut: 'hammer' },
  bearing:     { name: 'Bearing', short: 'BEARING', free: true, discrete: true },
  pulley:      { name: 'GT2 pulley', short: 'GT2 PULLEY', free: true, discrete: true, len: true },
  idler:       { name: 'GT2 idler', short: 'GT2 IDLER', free: true, discrete: true, len: true },
  shaft:       { name: 'Shaft', short: 'SHAFT', free: true, discrete: true, len: true },
  magnet:      { name: 'Magnet', short: 'MAGNET', free: true, pack: 0.6, len: true },
  other:       { name: 'Other part', short: '', free: true, discrete: true },
  tube:        { name: 'Tube', short: 'TUBE', free: true, outside: true, len: true },
};
export const TYPE_ORDER = ['shcs', 'bhcs', 'fhcs', 'set', 'nut', 'nyloc', 'washer', 'insert'];
// every type, in the order a kit lists them
export const ALL_TYPES = [...TYPE_ORDER.slice(0, 3), 'wafer', 'captive', 'selftap', 'set', 'nut', 'nyloc', 'knurled', 'washer', 'lockwasher', 'spacer',
  'insert', 'tnut_roll', 'tnut_spring', 'tnut_hammer', 'bearing', 'pulley', 'idler', 'shaft', 'magnet', 'other', 'tube'];
const ALIASES = { shcs: 'shcs', socket: 'shcs', 'socket-cap': 'shcs', cap: 'shcs', bhcs: 'bhcs', button: 'bhcs', fhcs: 'fhcs', flat: 'fhcs',
  countersunk: 'fhcs', csk: 'fhcs', set: 'set', setscrew: 'set', grub: 'set', 'hex-socket-set': 'set', nut: 'nut', nuts: 'nut', hex: 'nut',
  nyloc: 'nyloc', 'nylon-regular': 'nyloc', locknut: 'nyloc', washer: 'washer', washers: 'washer', plain: 'washer', insert: 'insert',
  inserts: 'insert', 'heat-set': 'insert', heatset: 'insert', hexnut: 'nut', hexnuts: 'nut' };

// sizes of the v18 parts that aren't threads
const toothed = (size) => { const m = String(size).match(/^(\d+)T (\d+(?:\.\d+)?)mm$/); return m ? { T: +m[1], W: +m[2] } : null; };
function freeKnown(it) {
  switch (it.type) {
    case 'bearing': return !!bearingDims(it.size);
    case 'pulley': case 'idler': { const t = toothed(it.size); return !!t && t.T >= 8 && t.T <= 200 && t.W > 0; }
    case 'shaft': case 'magnet': return +it.size > 0 && it.length > 0;
    case 'other': return typeof it.size === 'string' && it.size.trim().length > 0;
    case 'tube': return typeof it.size === 'string' && it.length > 0;
  }
  return false;
}
export const known = (it) => {
  const T = it && TYPES[it.type]; if (!T) return false;
  if (T.free) return freeKnown(it);
  return D[it.size] !== undefined && (!T.screw || it.length > 0)
    && (T.screw ? (T.head === null || !!T.head[it.size]) : T.tnut ? true : !!T.table[it.size]);
};

// one part: volume (mm3) and its longest dimension (mm)
export function partShape(it) {
  const T = TYPES[it.type], d = D[it.size], r = d / 2;
  if (T.free) {   // bounding sizes of one part lying in its natural position: [long, wide, high]; solid about 60% of that box
    const [a, b, h] = discreteDims(it)[0];
    const vol = it.type === 'magnet' ? Math.PI * (a / 2) ** 2 * h : a * b * h * 0.6;
    return { vol, long: a, wide: b };
  }
  if (T.screw) {
    const [dk, k] = T.head ? T.head[it.size] : [0, 0];
    const head = T.head ? Math.PI * (dk / 2) ** 2 * k * (T.cone ? 0.45 : 1) : 0;
    return { vol: Math.PI * r * r * it.length + head, long: it.length + k, wide: Math.max(d, dk) };
  }
  if (T.tnut) { const [l, w, h, f] = TNUT[T.tnut]; return { vol: l * w * h * f, long: l, wide: w }; }
  if (it.type === 'washer' || it.type === 'lockwasher' || it.type === 'spacer') {
    const [d2, t] = T.table[it.size], h = it.type === 'spacer' && it.length > 0 ? it.length : t;
    return { vol: Math.PI * ((d2 / 2) ** 2 - ((d + 0.4) / 2) ** 2) * h, long: d2, wide: d2 };
  }
  if (it.type === 'insert') { const [od, l0] = T.table[it.size], l = it.length > 0 ? it.length : l0; return { vol: Math.PI * (od / 2) ** 2 * l, long: l, wide: od }; }
  if (T.round) { const [od, h] = T.table[it.size]; return { vol: Math.PI * ((od / 2) ** 2 - r * r) * h, long: od, wide: od }; }
  const [s, m] = T.table[it.size];
  return { vol: (s * s * Math.sqrt(3) / 2 - Math.PI * r * r) * m, long: s * 1.155, wide: s * 1.155 };
}
// the ways a v18 part can lie: [long, wide, high] each, its natural position first
const BAG = /\b(kit|set|bag|assortment|pack)\b/;
function otherDims(name) {
  const s = String(name).toLowerCase();
  if (BAG.test(s)) return [55, 45, 10];                         // a small bag of parts
  if (/coupler|push[\s-]?fit|pc4|fitting/.test(s)) return [16, 12, 12];
  if (/shaft|pin|rod|dowel/.test(s)) return [25, 6, 6];
  if (/foot|feet|bumper/.test(s)) return [15, 15, 6];
  if (/spring/.test(s)) return [15, 8, 8];
  return [25, 20, 10];
}
function discreteDims(it) {
  switch (it.type) {
    case 'bearing': { const [, od, w, fd] = bearingDims(it.size); const dia = fd || od; return [[dia, dia, w]]; }
    case 'pulley': case 'idler': {
      const { T, W } = toothed(it.size), p = 2 * T / Math.PI;
      const dia = it.type === 'idler' ? p + 5 : T <= 40 ? p + 3.5 : p + 3, len = it.type === 'idler' ? W + 2.5 : W + 8;
      return [[dia, dia, len], [Math.max(len, dia), Math.min(len, dia), dia]];   // flat, or on its side
    }
    case 'shaft': return [[it.length, +it.size, +it.size]];
    case 'magnet': return [[+it.size, +it.size, it.length]];
    case 'tube': return [[it.length, 4, 4]];
    default: return [otherDims(it.size)];
  }
}
// How densely a quantity of a part packs as a loose pile: metal volume / the pile's bulk volume. Since the packing bench
// (DECISIONS 2026-11-07) it comes from PACKING, simulated settled piles by type, thread size, length and quantity,
// interpolated in log length and log quantity and held flat past the ends of what was simulated; a part the table does
// not carry keeps its type's old constant (TYPES pack). A captive screw is a socket head screw's shape.
const PACK_AS = { captive: 'shcs' };
const lerpAt = (xs, x) => {           // index and weight of x between neighbours of xs (ascending), clamped
  if (xs.length < 2 || x <= xs[0]) return [0, 0];
  if (x >= xs[xs.length - 1]) return [xs.length - 2, 1];
  let i = 0; while (x > xs[i + 1]) i++;
  return [i, (Math.log(x) - Math.log(xs[i])) / (Math.log(xs[i + 1]) - Math.log(xs[i]))];
};
export function packOf(it) {
  const T = TYPES[it.type], row = PACKING.types[PACK_AS[it.type] || it.type]?.[it.size];
  if (!row) return T.pack || 0.5;
  const [qi, qw] = lerpAt(PACKING.qty, Math.max(1, it.qty || 0));
  const atLen = (r) => r[qi] + (r[Math.min(qi + 1, r.length - 1)] - r[qi]) * qw;
  if (row.len.length === 1) return atLen(row.pack[0]);
  const [li, lw] = lerpAt(row.len, it.length > 0 ? it.length : row.len[0]);
  return atLen(row.pack[li]) + (atLen(row.pack[li + 1]) - atLen(row.pack[li])) * lw;
}
// room a quantity takes as a loose pile, mm3
export const pileVolume = (it) => partShape(it).vol * Math.max(1, it.qty || 0) / packOf(it);

export function labelLines(it) {
  const T = TYPES[it.type];
  if (T.free) {
    switch (it.type) {
      case 'bearing': return [String(it.size).toUpperCase(), T.short];
      case 'pulley': case 'idler': return [String(it.size).toUpperCase(), T.short];
      case 'shaft': case 'magnet': return [`${fmtLen(it.size)} × ${fmtLen(it.length)}`, T.short];
      default: return twoLines(it.size);
    }
  }
  if (it.type === 'spacer' && it.length > 0) return [`${it.size} × ${fmtLen(it.length)}`, T.short];
  return T.screw ? [`${it.size} × ${fmtLen(it.length)}`, T.short] : [it.size, T.short];
}
const fmtLen = (l) => String(+(+l).toFixed(1));
export const labelText = (it) => labelLines(it).filter(Boolean).join(' ');
// a free-text name on a label: as many words as fit the big line, the rest on the small one
function twoLines(name) {
  const tidy = (s) => s.replace(/[,()]/g, ' ').replace(/\bfor\b/gi, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const [head, ...rest] = String(name).split(',');          // "Shaft, for Nozzle Probe": SHAFT / NOZZLE PROBE
  if (rest.length && tidy(head).length <= 12) return [tidy(head), tidy(rest.join(' '))];
  const words = String(name).replace(/[,()]/g, ' ').replace(/\bfor\b/gi, ' ').split(/\s+/).filter(Boolean).map((w) => w.toUpperCase());
  const big = []; let i = 0;
  while (i < words.length && (big.join(' ') + ' ' + words[i]).trim().length <= 12) big.push(words[i++]);
  if (!big.length) big.push(words[i++] || '');
  return [big.join(' '), words.slice(i).join(' ')];
}

// natural order: type, then thread size, then length
export const sizeKey = (it) => D[it.size] ?? (parseFloat(String(it.size).replace(/^[^\d]*/, '')) || 0);
export function sortItems(items) {
  const rank = (it) => (TYPE_ORDER.includes(it.type) ? TYPE_ORDER.indexOf(it.type) : TYPE_ORDER.length + ALL_TYPES.indexOf(it.type));
  return [...items].sort((a, b) => rank(a) - rank(b) || sizeKey(a) - sizeKey(b) || (a.length || 0) - (b.length || 0)
    || String(a.size).localeCompare(String(b.size)));
}

// One part per line. Fasteners: "M3x10 SHCS 100", "100 M3 nuts", "M3 x 10 button head, 50", "washer M5 200". Since v18 also a
// vendor's kit list, quantity last: "Machine Screw, SHCS, M3x8 283", "Bearing, F695-2RS 20", "Pulley, 2GT, 20T, (5mm ID
// 9mm W) 4", "T-nut, Roll-in, 2020, M5 80", "Heatset Insert, Brass, M3x5x4 153", "6x3mm Neodymium Magnet 16"; anything
// else with a quantity becomes a named part ("Bondtech IDGA Gear Set 1"), and tube or rod by the metre ships outside.
export function parseLine(line) {
  const raw = String(line).replace(/^\s*\d+[.)]\s+(?=\D)/, '').trim();   // "1. Bearing, ..." list numbers
  if (!raw) return null;
  const v = vendorItem(raw); if (v) return v;
  const r = parseFastener(raw);
  if (r && r.error && /^no (metric size|part type)/.test(r.error)) {
    const q = raw.match(/(?:^|\s)(\d+)\s*(?:pcs?)?\s*$/);
    if (q && !/^\d+$/.test(raw.slice(0, q.index).trim())) return { type: 'other', size: cleanName(raw.slice(0, q.index)), length: 0, qty: +q[1] };
  }
  return r;
}
const cleanName = (s) => String(s).replace(/\s+/g, ' ').replace(/^[\s,\-–]+|[\s,\-–]+$/g, '').trim();
const NUM = '(\\d+(?:\\.\\d+)?)';
function vendorItem(raw) {
  const s = raw.toLowerCase().replace(/×/g, 'x');
  const q = s.match(/(?:^|\s)(\d+)\s*(?:pcs?)?\s*$/);
  const qty = q ? +q[1] : 1, body = q ? s.slice(0, q.index) : s, name = cleanName(q ? raw.slice(0, q.index) : raw);
  const th = body.match(/\bm(2\.5|10|12|2|3|4|5|6|8)(?![\d.])/), size = th ? 'M' + th[1] : null;
  const mxl = body.match(new RegExp('\\bm(?:2\\.5|10|12|2|3|4|5|6|8)\\s*x\\s*' + NUM));     // M3x10 -> 10
  const err = (what) => ({ error: `${what} in "${raw}"` });
  if (/\b(ptfe|teflon|tubing|tube)\b/.test(body) && !/coupler|fitting|cutter/.test(body)) {
    const m = body.match(new RegExp(NUM + '\\s*m(?![a-z])')), mm = [...body.matchAll(new RegExp(NUM + '\\s*mm\\b', 'g'))].map((x) => +x[1]);
    const len = m ? +m[1] * 1000 : mm.length ? Math.max(...mm) : 0;
    return len > 0 ? { type: 'tube', size: name, length: len, qty } : err('no length');
  }
  if (/\bt[\s-]?nuts?\b|\bt[\s-]?slot nuts?\b/.test(body)) {
    if (!size) return err('no thread size');
    const variant = /hammer/.test(body) ? 'hammer' : /spring|ball|flip/.test(body) ? 'spring' : 'roll';
    return { type: 'tnut_' + variant, size, length: 0, qty };
  }
  if (/\bbearings?\b/.test(body) || /\b(?:f|mr)?\d{3,4}[\s-]?(?:2rs|zz|2z)\b/.test(body)) {
    const m = body.match(/\b((?:f|mr)?\d{2,4}|lm\d{1,2}uu)(?:[\s-]?(2rs|zz|rs|2z))?\b/);
    if (!m) return err('no bearing number');
    const code = (m[1] + (m[2] ? '-' + m[2] : '')).toUpperCase();
    return bearingDims(code) ? { type: 'bearing', size: code, length: 0, qty } : err(`no data for bearing ${code}`);
  }
  if (/\b(pulley|idler)s?\b/.test(body)) {
    const type = /\bidlers?\b/.test(body) ? 'idler' : 'pulley';
    const t = body.match(/(?:^|[\s,(])(\d+)\s*t\b/), w = body.match(new RegExp(NUM + '\\s*mm\\s*w(?:ide|idth)?\\b')), b = body.match(new RegExp(NUM + '\\s*mm\\s*(?:id|bore)\\b'));
    if (!t) return err('no tooth count (like 20T)');
    return { type, size: `${+t[1]}T ${w ? +w[1] : 6}mm`, length: b ? +b[1] : 5, qty };
  }
  if (/\bmagnets?\b/.test(body)) {
    const m = body.match(new RegExp(NUM + '\\s*(?:mm)?\\s*x\\s*' + NUM + '\\s*mm'));
    return m ? { type: 'magnet', size: String(+m[1]), length: +m[2], qty } : { type: 'other', size: name, length: 0, qty };
  }
  if (/\b(shaft|rod|dowel|pin)s?\b/.test(body)) {
    const m = body.match(new RegExp(NUM + '\\s*(?:mm)?\\s*x\\s*' + NUM + '\\s*mm'));
    if (m) return +m[2] > 200 ? { type: 'tube', size: name, length: +m[2], qty } : { type: 'shaft', size: String(+m[1]), length: +m[2], qty };
    return { type: 'other', size: name, length: 0, qty };
  }
  if (/\b(spacer|shim)s?\b/.test(body) && size) {
    const t = body.replace(th[0], ' ').match(new RegExp(NUM + '\\s*mm\\b'));
    return { type: 'spacer', size, length: t ? +t[1] : 0, qty };
  }
  if (/\b(lock(?:ing)?|split|spring)\s*washers?\b/.test(body) && size) return { type: 'lockwasher', size, length: 0, qty };
  if (/\bknurl(?:ed)?\b|\bthumb\s*nuts?\b/.test(body) && size) return { type: 'knurled', size, length: 0, qty };
  const screw = (type) => (mxl ? { type, size, length: +mxl[1], qty } : err('no length (like M3x10)'));
  if (/self[\s-]?tap/.test(body) && size) return screw('selftap');
  if (/\b(wafer|truss)\b/.test(body) && size) return screw('wafer');
  if (/\bcaptive\b/.test(body) && size) return screw('captive');
  if (/\b(insert|heat[\s-]?set|heatset)s?\b/.test(body) && size) {
    const m = body.match(new RegExp('\\bm(?:2\\.5|10|12|2|3|4|5|6|8)\\s*x\\s*' + NUM + '\\s*x\\s*' + NUM));   // M3x5x4: diameter 5, length 4
    if (m && INSERT[size]) return { type: 'insert', size, length: +m[2], qty };
  }
  return null;
}
function parseFastener(line) {
  const s = String(line).toLowerCase().replace(/×/g, 'x').replace(/,/g, ' ').trim();
  if (!s) return null;
  const size = s.match(/\bm(2\.5|10|12|2|3|4|5|6|8)(?![\d.])/);
  if (!size) return { error: `no metric size in "${line}"` };
  const after = s.slice(size.index + size[0].length);
  const len = after.match(/^\s*x\s*(\d+(?:\.\d+)?)/);
  let type = null;
  for (const w of s.replace(/[^a-z\-]+/g, ' ').split(' ')) if (ALIASES[w]) { type = ALIASES[w]; if (!['hex', 'cap', 'plain'].includes(w)) break; }
  if (!type) type = len ? 'shcs' : null;
  if (!type) return { error: `no part type in "${line}" (try SHCS, BHCS, FHCS, set screw, nut, nyloc, washer, insert)` };
  const nums = s.replace(size[0], ' ').replace(len ? len[0] : '', ' ').match(/(?:^|\s)(\d+)(?:\s*(?:pcs|pc|x)?)(?=\s|$)/g);
  const qty = nums ? parseInt(nums[nums.length - 1], 10) : 50;
  const it = { type, size: 'M' + size[1].toUpperCase(), length: TYPES[type].screw ? (len ? parseFloat(len[1]) : 0) : 0, qty };
  if (!known(it)) return { error: TYPES[type].screw && !len ? `"${line}" needs a length, like M3x10` : `no ${TYPES[type].name.toLowerCase()} data for ${it.size}` };
  return it;
}
// the lines of a pasted list. A list copied off a web page can lose a line break ("4mm Bowden Coupler 1 Machine Screw,
// BHCS, M3x6 14"), so a quantity followed by the start of a vendor's part name starts a new line.
export function listLines(text) {
  const t = String(text).replace(/(\s\d+)\s+(?=(?:Machine Screw|Self-tapping|Hexnut|Hex Nut|T-nut|Heatset|Heat-set|Precision Spacer|Locking Washer|Knurled Nut|Set Screw|Bearing,|Pulley,|Idler,|Shaft,))/g, '$1\n');
  return t.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
}
export function parseList(text) {
  const items = [], errors = [], lines = [];
  for (const line of listLines(text)) { const r = parseLine(line); if (!r) continue; if (r.error) errors.push(r.error); else { items.push(r); lines.push(line.replace(/^\s*\d+[.)]\s+(?=\D)/, '')); } }
  return { items, errors, lines };
}

// Part Picker label items (part-picker-label-item/1, as the Label Studio receives them) or Label Studio rows of text
export function fromPicker(list) {
  const items = [], errors = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (x && x.schema === 'part-picker-label-item/1') {
      const words = [...(x.fields || []), x.head || '', x.family || ''].join(' ');
      const r = parseLine(words + ' ' + (x.qty || x.quantity || ''));
      if (r && !r.error) items.push(r); else errors.push(r ? r.error : 'empty item');
    } else if (typeof x === 'string') { const r = parseLine(x); if (r && !r.error) items.push(r); else if (r) errors.push(r.error); }
  }
  return { items, errors };
}

// ---------- layout ----------
// Rows of compartments, front to back, in reading order. Each row's depth follows what its parts need (pile volume and
// longest part), each compartment's width its share of the row. With labels, a compartment is at least one holder wide.
// The room one line of parts needs in a compartment of a drawer this height. A pile (screws, nuts, washers, T-nuts):
// its loose volume. A discrete part (bearings, pulleys, shafts, bags): the floor it covers, laid side by side and up to
// three high, as an equivalent volume (floor area times the usable height) so piles and parts share one capacity sum.
// long and side are the smallest compartment it fits (side: both ways, long: one way); depth adds the label holder,
// which takes the back-left corner at floor level. cap: how full the compartment may get (fillCap for piles, which a
// shipped kit keeps under 75%; placed parts are sized with their own margins).
export function roomNeeded(it, { size = '240-2W', height = '0.5H', label = 'large', fillCap = 1 } = {}) {
  const T = TYPES[it.type], top = SIZES[size].heights[height].top, usableH = Math.max(4, top - C.FLOOR - 3) * 0.85;
  if (!T.discrete) return { vol: pileVolume(it), long: partShape(it).long + 3, side: 0, depth: 0, cap: fillCap, discrete: false };
  const Hs = top - C.FLOOR - 1, lip = Hs - 3.5, gap = 1.5, eff = 0.75, holdD = label ? HOLDERS[label].D : 0;
  let best = null;
  for (const [a0, b0, h] of discreteDims(it)) {
    if (h > Hs) continue;
    const a = Math.max(a0, b0), b = Math.min(a0, b0), layers = Math.max(1, Math.min(3, Math.floor(Hs / h)));
    const per = Math.ceil(Math.max(1, it.qty || 1) / layers);
    const area = per * (a + gap) * (b + gap) / (per <= 4 ? 0.9 : eff) + (label ? C.HOLDER_W * holdD : 0);   // a few big parts pack squarer
    const m = h > lip ? 2 : 1;                   // a tall part keeps clear of a lid's lips, which hang inside the walls
    if (!best || area < best.area) best = { area, long: a + 2 * m, side: b + 2 * m };
  }
  if (!best) return { vol: Infinity, long: 0, side: 0, depth: 0, cap: 1, discrete: true, tooTall: true };
  return { vol: best.area * usableH, long: best.long, side: best.side, depth: best.side + holdD, cap: 1, discrete: true };
}
// order: 'type' (type, size, length), 'kit' (kit families), 'list' (as given). roundTo: 'bag' sizes every pile for the counted
// quantity rounded up to the next bag (bagUp), the compartments keeping the counted one. spareRow: an empty row of labelled
// compartments at the back when the list still fits under the cap with the drawer one row shorter (DECISIONS 2026-11-07).
const BAGS = [25, 50, 100, 200, 500];
export const bagUp = (q) => { q = Math.max(0, Math.round(q || 0)); if (!q) return q; for (const b of BAGS) if (q <= b) return b; return Math.ceil(q / 500) * 500; };
export function layoutFor(itemsIn, { size = '240-2W', height = '0.5H', label = 'large', labels = true, scoop = 'std', fillCap = 1, order = 'type', roundTo = null, spareRow = false } = {}) {
  const items = (order === 'kit' ? kitOrder : order === 'list' ? (xs) => [...xs] : sortItems)(itemsIn.filter((it) => known(it) && !TYPES[it.type].outside));
  const sized = (it) => (roundTo === 'bag' && it.qty > 0 ? { ...it, qty: bagUp(it.qty) } : it);
  const S = SIZES[size], top = S.heights[height].top, hold = HOLDERS[label];
  // v24: in a tall drawer every compartment stays wide enough to reach into (REACH in gen.js); the rows a drawer takes
  // follow its depth (the 59 takes one row of labelled compartments)
  const reach = isTall(size, height) ? reachMin(size, height) : 0;
  const W = C.WALL, minW = Math.max(labels ? C.HOLDER_W : C.MIN_CELL, reach), minD = Math.max(labels ? hold.MIN_DEPTH : C.MIN_CELL, reach);
  const perRow = Math.floor((S.W + W) / (minW + W)), maxRows = Math.max(1, Math.min(8, Math.floor((S.D + W) / (minD + W) + 1e-9)));
  const usableH = Math.max(4, top - C.FLOOR - 3) * 0.85;        // leave the top 3 mm free, and some for the scoop
  const n = items.length;
  if (!n) return { error: 'Add some parts first.' };
  if (n > perRow * maxRows) return { error: reach ? `${n} parts won't fit a ${height} drawer: to reach into, a compartment there needs ${reach.toFixed(1)} mm across, so it holds ${perRow * maxRows}. Use a lower drawer or split the list.`
    : `${n} parts is more than one drawer holds with ${labels ? 'labels' : 'compartments this size'} (${perRow * maxRows}). Split the list across two drawers.` };
  const need = items.map((it) => {
    const r = roomNeeded(sized(it), { size, height, label: labels ? label : null, fillCap });
    // vol: what the compartment must hold, raised for the fill limit; along: room the long side needs front to back
    return { it, vol: r.vol / r.cap, raw: r.vol, long: r.long, side: r.side, depth: r.depth, discrete: r.discrete, tall: r.tooTall, along: r.long + (r.depth - r.side) };
  });
  const tall = need.find((x) => x.tall);
  if (tall) return { error: `${labelText(tall.it)} is too tall to lie in a ${height} drawer.` };
  const solve = (depthAvail) => {
  let best = null;
  const rowsMax = Math.min(maxRows, Math.floor((depthAvail + W) / (minD + W) + 1e-9));
  for (let R = Math.ceil(n / perRow); R <= Math.min(rowsMax, n); R++) {
    // rows as even as the count allows, in order; 'spread' deals the widest parts out first, one row at a time, so big
    // parts don't all land in one row (each row then keeps kit order)
    const rows = []; let k = 0;
    if (order === 'spread') {
      for (let r = 0; r < R; r++) rows.push([]);
      const room = (row) => row.reduce((a, x) => a + Math.max(minW, x.side), 0);
      for (const x of [...need].sort((a, b) => Math.max(b.side, minW) - Math.max(a.side, minW) || b.vol - a.vol)) {
        const open = rows.filter((row) => row.length < Math.ceil(n / R)); open.sort((a, b) => room(a) - room(b) || a.length - b.length); open[0].push(x);
      }
      for (const row of rows) row.sort((a, b) => need.indexOf(a) - need.indexOf(b));
      rows.sort((a, b) => need.indexOf(a[0]) - need.indexOf(b[0]));
    } else for (let r = 0; r < R; r++) { const c = Math.floor(n / R) + (r < n % R ? 1 : 0); rows.push(need.slice(k, k + c)); k += c; }
    // depth each row needs: its pile volume over the row width, and its longest part where a compartment is narrow
    const freeW = (cnt) => S.W - (cnt - 1) * W;
    // (a kit layout first lets a long part lie across the row when the others leave it the width)
    const rowMin = rows.map((row) => {
      const mins = row.map((x) => Math.max(minW, x.side)), tot = mins.reduce((a, b) => a + b, 0), fw = freeW(row.length);
      const across = (x, i) => order !== 'type' && tot - mins[i] + Math.max(x.long, mins[i]) <= fw;
      return Math.max(minD, ...row.map((x, i) => Math.max(x.depth, x.long > fw / row.length && !across(x, i) ? Math.min(x.along, 200) : 0)));
    });
    const rowVol = rows.map((row) => row.reduce((a, x) => a + x.vol, 0));
    const freeD = depthAvail - (R - 1) * W;
    if (rowMin.reduce((a, b) => a + b, 0) > freeD) continue;
    // share the depth: everyone gets its minimum, the rest goes in proportion to volume beyond it
    let depths = water(rowVol.map((v, i) => v / (freeW(rows[i].length) * usableH)), rowMin, freeD);
    const comps = []; let y = 0, worst = Infinity, fits = true;
    rows.forEach((row, r) => {
      const d = depths[r];
      const mins = row.map((x) => Math.max(minW, x.side, x.along > d ? Math.min(x.long, freeW(row.length)) : 0));
      if (mins.reduce((a, b) => a + b, 0) > freeW(row.length) + 1e-6) fits = false;
      const widths = water(row.map((x) => x.vol / (d * usableH)), mins, freeW(row.length));
      let x = 0;
      row.forEach((e, i) => {
        const cap = widths[i] * d * usableH; worst = Math.min(worst, cap / e.vol);
        comps.push({ x0: x, x1: x + widths[i], y0: y, y1: y + d, item: { ...e.it }, fill: e.raw / cap, load: e.vol / cap, discrete: e.discrete });
        x += widths[i] + W;
      });
      y += d + W;
    });
    if (!fits) continue;
    const score = worst - 0.02 * R;            // a little in favour of fewer, roomier rows
    if (!best || score > best.score) best = { score, worst, R, comps };
  }
  return best;
  };
  // the spare row: the list laid out with the drawer one labelled row shorter, kept only when that still fits under the cap
  const spareD = minD + W;
  let best = null, spare = 0;
  if (spareRow && S.D - spareD >= minD) {
    const b = solve(S.D - spareD);
    if (b && Math.max(...b.comps.map((c) => c.load)) <= 1 + 1e-9) {
      const k = perRow, y0 = S.D - spareD + W, wq = (S.W - (k - 1) * W) / k;
      for (let i = 0; i < k; i++) b.comps.push({ x0: i * (wq + W), x1: i * (wq + W) + wq, y0, y1: S.D, item: null, fill: 0, load: 0, discrete: false });
      best = b; spare = k;
    }
  }
  if (!best) best = solve(S.D);
  if (!best && order === 'kit') return layoutFor(itemsIn, { size, height, label, labels, scoop, fillCap, order: 'spread', roundTo, spareRow });
  if (!best) return { error: 'These parts are too long to lay out in rows here. Try a deeper drawer or fewer lengths.' };
  // snap to the 0.1 um grid so neighbours stay exactly one wall apart; the last compartment of each row takes the rounding
  const comps = snapRows(best.comps, S);
  return {
    // placed parts get a flat floor (no front scoop under them)
    comps: comps.map((c) => comp(c.x0, c.x1, c.y0, c.y1, { holder: labels, scoop: c.discrete ? 'off' : scoop, ...(c.item ? { item: c.item } : {}) })),
    rows: best.R + (spare ? 1 : 0), spare, fullest: Math.max(...best.comps.map((c) => c.fill)), load: Math.max(...best.comps.map((c) => c.load)), roomy: best.worst,
  };
}
// water filling: lengths >= min, summing to total, the rest shared in proportion to want
function water(want, min, total) {
  const n = want.length; const out = min.slice(); let fixed = new Array(n).fill(false);
  for (let pass = 0; pass < n + 1; pass++) {
    const freeSum = out.reduce((a, v, i) => a + (fixed[i] ? v : 0), 0);
    const left = total - freeSum, wsum = want.reduce((a, v, i) => a + (fixed[i] ? 0 : Math.max(v, 1e-9)), 0);
    let changed = false;
    for (let i = 0; i < n; i++) if (!fixed[i]) {
      const v = left * Math.max(want[i], 1e-9) / wsum;
      if (v < min[i]) { out[i] = min[i]; fixed[i] = true; changed = true; } else out[i] = v;
    }
    if (!changed) break;
  }
  return out;
}
function snapRows(comps, S) {
  const W = C.WALL; const rows = new Map();
  for (const c of comps) { const k = c.y0.toFixed(6); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(c); }
  const ys = [...rows.keys()].map(Number).sort((a, b) => a - b);
  let y = 0; const out = [];
  ys.forEach((y0, r) => {
    const row = rows.get(y0.toFixed(6)).sort((a, b) => a.x0 - b.x0);
    const d = r === ys.length - 1 ? S.D - y : snapMM(row[0].y1 - row[0].y0);
    let x = 0;
    row.forEach((c, i) => { const w = i === row.length - 1 ? S.W - x : snapMM(c.x1 - c.x0); out.push({ ...c, x0: snapMM(x), x1: snapMM(x + w), y0: snapMM(y), y1: snapMM(y + d) }); x = snapMM(x + w + W); });
    y = snapMM(y + d + W);
  });
  return out;
}

// floor colours from the parts: by thread size or by type, numbered in order of first appearance, cycling the palette
export function colorBy(comps, how, slots) {
  if (how === 'none') return comps.map(() => 0);
  const keys = []; const key = (c) => (c.item ? (how === 'size' ? c.item.size : TYPES[c.item.type].short) : null);
  for (const c of comps) { const k = key(c); if (k && !keys.includes(k)) keys.push(k); }
  return comps.map((c) => { const k = key(c); return k ? (keys.indexOf(k) % slots) + 1 : 0; });
}

// ---------- kits ----------
// Generic starting points, not matched to any one product: edit the quantities to what you have.
const L = (type, size, lengths, qty) => lengths.map((length) => ({ type, size, length, qty }));
export const KITS = {
  m3printer: { name: 'M3 printer build kit', items: [...L('shcs', 'M3', [6, 8, 10, 12, 16, 20, 25, 30], 60), ...L('bhcs', 'M3', [6, 8, 12], 40),
    { type: 'nut', size: 'M3', qty: 150 }, { type: 'nyloc', size: 'M3', qty: 60 }, { type: 'washer', size: 'M3', qty: 150 }, { type: 'insert', size: 'M3', qty: 100 }] },
  m2m5: { name: 'M2 to M5 socket head assortment', items: [...L('shcs', 'M2', [4, 6, 8, 10], 40), ...L('shcs', 'M2.5', [6, 8, 10, 12], 40),
    ...L('shcs', 'M3', [6, 8, 10, 12, 16, 20], 40), ...L('shcs', 'M4', [8, 10, 12, 16, 20], 30), ...L('shcs', 'M5', [10, 12, 16, 20], 20)] },
  nuts: { name: 'Metric nuts and washers', items: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8'].flatMap((s) => [{ type: 'nut', size: s, qty: 100 }, { type: 'washer', size: s, qty: 100 }]) },
  inserts: { name: 'Heat-set inserts', items: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6'].map((s) => ({ type: 'insert', size: s, qty: 100 })) },
};

// how full a compartment would be with its part's quantity (1 = full to 3 mm below the wall top)
export function fillOf(c, height, size = '240-2W', label = 'large') {
  if (!c.item || !known(c.item) || TYPES[c.item.type].outside) return null;
  const top = SIZES[size].heights[height].top, usableH = Math.max(4, top - C.FLOOR - 3) * 0.85;
  return roomNeeded(c.item, { size, height, label: c.holder === false ? null : label }).vol / ((c.x1 - c.x0) * (c.y1 - c.y0) * usableH);
}
// label list for a label maker or the Label Studio: reading order, front-left first
export function labelsCSV(comps) {
  const rows = [...comps].filter((c) => c.item && known(c.item)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const ys = [...new Set(rows.map((c) => c.y0))].sort((a, b) => a - b);
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const out = ['position,label,part,size,length_mm,quantity'];
  for (const c of rows) {
    const r = ys.indexOf(c.y0) + 1, col = rows.filter((k) => k.y0 === c.y0).indexOf(c) + 1, it = c.item;
    const T = TYPES[it.type];
    out.push([`R${r}C${col}`, q(labelText(it)), q(T.name), T.free ? q(it.size) : it.size, T.screw ? it.length : T.len && it.length ? it.length : '', it.qty || ''].join(','));
  }
  return out.join('\n') + '\n';
}

// ---------- a kit across several drawers (v18) ----------
// A vendor kit (West3D's idea: ship a hardware kit in its own MODULITH drawers) is split into drawers that each hold a run
// of whole families in kit order: screws by thread, then nuts and washers, inserts, T-nuts, motion parts, the rest.
// A family that won't fit one drawer is split part by part. Piles stay under fillCap (75% by default, so the kit
// survives shipping under the lid); tube and rod by the metre, and anything too big for the drawer, ship outside.
const SCREWS = ['shcs', 'bhcs', 'fhcs', 'wafer', 'captive', 'selftap', 'set'];
function familyOf(it) {
  if (SCREWS.includes(it.type)) return [1 + (D[it.size] || 0) / 100, `${it.size} screws`];
  if (['nut', 'nyloc', 'knurled', 'washer', 'lockwasher', 'spacer'].includes(it.type)) return [2, 'nuts and washers'];
  if (it.type === 'insert') return [3, 'inserts'];
  if (TYPES[it.type].tnut) return [4, 'T-nuts'];
  if (['bearing', 'pulley', 'idler', 'shaft'].includes(it.type)) return [5, 'motion'];
  return [6, 'other parts'];
}
export function kitOrder(items) {
  const typeRank = (it) => ALL_TYPES.indexOf(it.type);
  return [...items].sort((a, b) => familyOf(a)[0] - familyOf(b)[0] || typeRank(a) - typeRank(b) || sizeKey(a) - sizeKey(b) || (a.length || 0) - (b.length || 0)
    || String(a.size).localeCompare(String(b.size)));
}
// heights: the drawer heights allowed. The kit, in kit order, is cut into runs, one per drawer, choosing the cuts (and
// each drawer's height, the lowest that holds its run) for, in order: the least case height (a 1H drawer counts as two
// 0.5H), the fewest drawers, the fewest families split between drawers, then the most even fill.
const UNITS = { '0.5H': 1, '1H': 2, '1.5H': 3, '2H': 4 };   // case height in half H
export function kitDrawers(itemsIn, { size = '240-2W', heights = ['0.5H'], label = 'large', fillCap = 0.75 } = {}) {
  const hs = [...heights].sort((a, b) => UNITS[a] - UNITS[b]);
  const opts = (height) => ({ size, height, label, labels: true, fillCap, order: 'kit' });
  const fit = (list, height) => { const r = layoutFor(list, opts(height)); return r.error || r.load > 1 + 1e-9 ? null : r; };
  const outside = [], kept = [];
  for (const it of itemsIn) {
    if (!known(it)) continue;
    if (TYPES[it.type].outside) outside.push({ item: it, why: 'ships outside the drawers' });
    else if (!hs.some((h) => fit([it], h))) outside.push({ item: it, why: `too big for a ${hs[hs.length - 1]} drawer` });
    else kept.push(it);
  }
  const items = kitOrder(kept), n = items.length, fam = items.map((it) => familyOf(it)[1]);
  const memo = new Map();
  const run = (i, j) => {             // the lowest drawer that holds items i..j-1
    const k = i * 4096 + j; if (memo.has(k)) return memo.get(k);
    let best = null; for (const h of hs) { const r = fit(items.slice(i, j), h); if (r) { best = { height: h, layout: r, units: UNITS[h] }; break; } }
    memo.set(k, best); return best;
  };
  const less = (a, b) => { for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] < b[i]; return false; };
  const dp = new Array(n + 1).fill(null); dp[0] = { cost: [0, 0, 0, 0], prev: -1, run: null };
  for (let j = 1; j <= n; j++) {
    for (let i = j - 1; i >= 0; i--) {
      const r = run(i, j); if (!r) break;            // a longer run won't fit either
      if (!dp[i]) continue;
      const cut = i > 0 && fam[i - 1] === fam[i] ? 1 : 0, c = dp[i].cost;
      const cost = [c[0] + r.units, c[1] + 1, c[2] + cut, Math.max(c[3], r.layout.load)];
      if (!dp[j] || less(cost, dp[j].cost)) dp[j] = { cost, prev: i, run: r };
    }
  }
  if (n && !dp[n]) return { drawers: [], outside, error: 'This kit could not be split into drawers.' };
  const drawers = []; for (let j = n; j > 0; j = dp[j].prev) drawers.unshift({ items: items.slice(dp[j].prev, j), ...dp[j].run });
  // a nearly empty drawer (often the odds and ends at the end) is dissolved when the others have room for its parts
  for (let pass = 0; pass < 3 && drawers.length > 1; pass++) {
    const lone = drawers.reduce((a, d) => (!a || d.layout.load < a.layout.load ? d : a), null);
    if (lone.layout.load > 0.6) break;
    const trial = drawers.filter((d) => d !== lone).map((d) => ({ ...d, items: [...d.items] }));
    let ok = true;
    for (const it of [...lone.items].sort((a, b) => roomNeeded(b).vol - roomNeeded(a).vol)) {
      let best = null;
      for (const d of trial) { const r = fit([...d.items, it], d.height); if (r && (!best || r.load < best.r.load)) best = { d, r }; }
      if (!best) { ok = false; break; }
      best.d.items.push(it); best.d.layout = best.r;
    }
    if (!ok) break;
    drawers.splice(0, drawers.length, ...trial);
  }
  return {
    drawers: drawers.map((d) => ({ ...d, families: [...new Set(d.items.map((it) => familyOf(it)[1]))] })),
    outside, units: drawers.reduce((a, d) => a + d.units, 0),
  };
}
// The packer's pick list for one drawer: every compartment front-left to back-right with its position (A1 is the
// front-left; letters are rows from the front, numbers columns from the left), label text, part name and count.
export function pickList(comps, height = '0.5H', label = 'large', size = '240-2W') {
  const rows = [...comps].filter((c) => c.item && known(c.item)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const ys = [...new Set(rows.map((c) => c.y0))].sort((a, b) => a - b);
  return rows.map((c) => {
    const r = ys.indexOf(c.y0), col = rows.filter((k) => k.y0 === c.y0).indexOf(c) + 1, it = c.item;
    return { pos: `${String.fromCharCode(65 + r)}${col}`, comp: c, lines: labelLines(it), label: labelText(it), part: TYPES[it.type].name, qty: it.qty || 0, fill: fillOf(c, height, size, label) };
  });
}

// ---------- part outlines (shadow board) ----------
// 1:1 outline of one part: side view for screws and inserts, top view for nuts and washers. Long axis along x,
// centred on the origin. polys: outer contours counter-clockwise, holes clockwise.
const circle = (r, n = 40, cw = false) => { const p = []; for (let i = 0; i < n; i++) { const a = (cw ? -1 : 1) * 2 * Math.PI * i / n; p.push([r * Math.cos(a), r * Math.sin(a)]); } return p; };
export function silhouetteOf(it) {
  if (!known(it)) return null;
  const T = TYPES[it.type], d = D[it.size], r = d / 2;
  let polys;
  if (T.screw) {
    const L = it.length;
    if (!T.head) polys = [[[0, -r], [L, -r], [L, r], [0, r]]];
    else {
      const [dk, k] = T.head[it.size], R = dk / 2;
      // counter-clockwise: along the bottom to the tip, back along the top, then down the head
      if (it.type === 'bhcs') {
        const dome = []; for (let i = 1; i < 12; i++) { const t = 1 - i / 6; dome.push([k - k * Math.sqrt(Math.max(0, 1 - t * t)), t * R]); }
        polys = [[[k, -R], [k, -r], [k + L, -r], [k + L, r], [k, r], [k, R], ...dome]];
      } else if (it.type === 'fhcs') polys = [[[0, -R], [k, -r], [k + L, -r], [k + L, r], [k, r], [0, R]]];
      else polys = [[[0, -R], [k, -R], [k, -r], [k + L, -r], [k + L, r], [k, r], [k, R], [0, R]]];
    }
  } else if (it.type === 'insert') {
    const [od, l] = T.table[it.size];
    polys = [[[0, -od / 2], [l, -od / 2], [l, od / 2], [0, od / 2]]];
  } else if (it.type === 'washer') {
    const [d2] = T.table[it.size];
    polys = [circle(d2 / 2), circle((d + 0.4) / 2, 32, true)];
  } else {
    const [s] = T.table[it.size], R = s / Math.sqrt(3);
    const hex = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; hex.push([R * Math.cos(a), R * Math.sin(a)]); }
    polys = [hex, circle(r, 32, true)];
  }
  // centre on the bounding box
  const xs = polys.flat().map((p) => p[0]), ys = polys.flat().map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  polys = polys.map((p) => p.map(([x, y]) => [x - cx, y - cy]));
  return { polys, len: Math.max(...xs) - Math.min(...xs), wid: Math.max(...ys) - Math.min(...ys) };
}
// outlines placed on each compartment's visible floor: centred, along the floor's long side, at 1:1 or not at all
export function placedOutlines(layout, floorRectOf, margin = 2.5, fullRectOf = null) {
  // floorRectOf is the floor you can see from above; when the part doesn't fit there, fullRectOf (the whole flat floor,
  // partly under the label holder) is tried with the part pushed to the front, so most of it still shows.
  const out = [];
  layout.comps.forEach((c, i) => {
    const s = c.item && silhouetteOf(c.item); if (!s) return;
    const tries = [[floorRectOf(layout, c), false]]; if (fullRectOf) tries.push([fullRectOf(layout, c), true]);
    for (const [f, front] of tries) {
      const fw = f.x1 - f.x0 - 2 * margin, fd = f.y1 - f.y0 - 2 * margin;
      const along = fw >= fd ? 'x' : 'y';
      const fits = (a, b) => s.len <= a && s.wid <= b;
      let rot;
      if (along === 'x' ? fits(fw, fd) : fits(fd, fw)) rot = along === 'x' ? 0 : 1; else if (along === 'x' ? fits(fd, fw) : fits(fw, fd)) rot = along === 'x' ? 1 : 0; else continue;
      const cx = (f.x0 + f.x1) / 2, cy = front ? f.y0 + margin + (rot ? s.len : s.wid) / 2 : (f.y0 + f.y1) / 2;
      out.push({ comp: i, polys: s.polys.map((p) => p.map(([x, y]) => (rot ? [cx - y, cy + x] : [cx + x, cy + y]))) });
      return;
    }
  });
  return out;
}
