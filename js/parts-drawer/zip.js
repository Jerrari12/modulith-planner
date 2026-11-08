// A zip writer for the parts drawer's downloads. The prototype packed its files with JSZip from a CDN; the planner
// vendors nothing it can do in forty lines, so this writes the archive itself: every entry deflated through the
// browser's own CompressionStream ('deflate-raw', which node has too), a CRC-32 per entry, one central directory,
// no zip64 (a drawer's files are a few MB). A 3MF is such an archive as well, so the same call writes those.
//
//   const bytes = await zip({ 'README.txt': 'hello', 'drawer.stl': uint8 });   // -> Uint8Array
//
// `compress: false` stores the entries instead (useful in a test that reads them back without inflating).

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
export function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const enc = new TextEncoder();
const toBytes = (v) => (v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : enc.encode(String(v)));
async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
// MS-DOS date and time, as the zip format stores them (two-second resolution, 1980 origin)
function dosStamp(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export async function zip(files, { compress = true, date = new Date() } = {}) {
  const { time, date: dd } = dosStamp(date);
  const entries = [];
  for (const [name, value] of Object.entries(files)) {
    const data = toBytes(value), crc = crc32(data);
    const packed = compress ? await deflateRaw(data) : data;
    const method = compress ? 8 : 0;
    entries.push({ name: enc.encode(name), data: packed, size: data.length, crc, method });
  }
  const local = entries.reduce((a, e) => a + 30 + e.name.length + e.data.length, 0);
  const central = entries.reduce((a, e) => a + 46 + e.name.length, 0);
  const out = new Uint8Array(local + central + 22), dv = new DataView(out.buffer);
  let p = 0;
  const u16 = (v) => { dv.setUint16(p, v, true); p += 2; }, u32 = (v) => { dv.setUint32(p, v >>> 0, true); p += 4; };
  const put = (b) => { out.set(b, p); p += b.length; };
  for (const e of entries) {
    e.offset = p;
    u32(0x04034b50); u16(20); u16(0x0800); u16(e.method); u16(time); u16(dd); u32(e.crc); u32(e.data.length); u32(e.size); u16(e.name.length); u16(0);
    put(e.name); put(e.data);
  }
  const cd = p;
  for (const e of entries) {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(e.method); u16(time); u16(dd); u32(e.crc); u32(e.data.length); u32(e.size);
    u16(e.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(e.offset);
    put(e.name);
  }
  const cdSize = p - cd;
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(cdSize); u32(cd); u16(0);
  return out;
}
