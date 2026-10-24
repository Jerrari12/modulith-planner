/**
 * THE PROBE beside the ablation (ablate.mjs): the facts its rows cannot give, asked for by the first report's review
 * (Sol 01a16cb6, 2026-10-24).
 *  1. Draw calls per prop group now, and the FLOOR after merging each group into one mesh: a mesh with N materials
 *     still draws N times, so the floor is the distinct materials per group, counted by identity and by look (two
 *     materials with the same type, colour, maps and surface would merge into one).
 *  2. The shadow quads' real fill on the hero: each mask's and catcher's on-screen area in device pixels (its corners
 *     projected and clipped to the viewport), and each mask's shadowed share of its own box, read from the WebP
 *     (what a shape tighter than the box could still save).
 *  3. The interior hidden, seen from EVERY shot and with the drawer moment open, not only the hero: screenshots with
 *     everything on and with the interior hidden, the pixels that differ counted and drawn, for the plain hide and
 *     for the two rules that could un-hide the opened drawer's unit.
 *  4. (`--relief`, instead of 3) the layer-line relief on and off from every shot at this tier, the same way: what
 *     the close detail shot loses on a tier that would run without it (Sol's follow-up, finding 2).
 *
 *   node tools/done-scene/perf-probe.mjs [--kit 185-tabletop-2w2h] [--tier high] [--relief] [--out D:/Claude - Output/done-scene-2026-10-23/perf/probe]
 *
 * This machine's GPU, headless, 1280x800 at screen scale 2. Writes <out>/probe-<tier>[-relief].json and the
 * screenshots and diffs (red = a pixel that differs by more than 8 of 255 in a channel, over the dimmed frame).
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const KIT = arg('--kit', '185-tabletop-2w2h');
const TIER = arg('--tier', 'high');
const OUT = arg('--out', 'D:/Claude - Output/done-scene-2026-10-23/perf/probe');
const INTERIOR = /Drawer_Stoppers|QuickLock|Magnet|DecorDrawer/;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.ico': 'image/x-icon' };
function serve() {
  const server = createServer(async (req, res) => {
    try {
      const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
      let file = join(root, rel === '' ? 'index.html' : rel);
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const { chromium } = await import('playwright');
const { localParts } = await import('../../test/lib/local-parts.mjs');
await mkdir(OUT, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (async () => { for (const o of [{ channel: 'chrome' }, {}]) { try { return await chromium.launch({ ...o, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] }); } catch { /* next */ } } throw new Error('no Chromium'); })();
localParts(browser, root);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await ctx.addInitScript((t) => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', t); localStorage.setItem('gen2-quality:set', '1'); } catch {} }, TIER);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const out = { kit: KIT, tier: TIER, errors };

await page.goto(`${base}/index.html?ws=assemble&build=${KIT}&debug=1&done=room`, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-player'), null, { timeout: 120_000 });
await page.locator('#ws-steps button:has-text("Skip to the finished build")').click();
await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 60_000 });
await page.waitForTimeout(1200);
await page.locator('#ws-player button:has-text("Next")').click();
await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
await page.locator('#ws-player button:has-text("Watch the final scene")').click();
await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 90_000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1e7 }));
await page.waitForTimeout(1000);

/* 1. draw calls per group now, and the floor after a merge */
out.calls = await page.evaluate(() => {
  const v = window.__GEN2_VIEWER__, room = v.scene.getObjectByName('done-room');
  const look = (m) => [m.type, m.color && m.color.getHexString(), m.map && m.map.uuid, m.emissiveMap && m.emissiveMap.uuid, m.emissive && m.emissive.getHexString(), m.normalMap && m.normalMap.uuid, m.roughness, m.metalness, m.transparent, m.opacity, m.side, m.blending, m.alphaMap && m.alphaMap.uuid, m.transmission].join('|');
  const groups = {};
  /* every room mesh carries its own baked lightmap (room.py bakes per object, `lm` = its size), so materials differ by
     their map first: the floor "by image" counts distinct map images, which is what a re-atlas at bake time would merge */
  const add = (key, o) => {
    const g = groups[key] || (groups[key] = { meshes: 0, calls: 0, tris: 0, materials: new Set(), looks: new Set(), images: new Set(), unmapped: 0, lm: [] });
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    g.meshes++; g.calls += Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1;
    const idx = o.geometry.index; g.tris += Math.round((idx ? idx.count : o.geometry.attributes.position.count) / 3);
    for (const m of mats) { g.materials.add(m.uuid); g.looks.add(look(m)); const im = m.map && m.map.image; if (im) { g.images.add(im.uuid || im.src || im); g.lm.push(im.width); } else g.unmapped++; }
  };
  room.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let p = o, group = null; while (p && p !== room) { if (p.userData.slot) { group = p.userData.group || p.name; break; } p = p.parent; }
    add(group ? `prop ${group}` : 'fixed room', o);
  });
  v.scene.traverse((o) => { if (o.isMesh && o.visible && o.userData.doneShadow) add('mask quads', o); if (o.isMesh && o.visible && o.userData.doneRoom && o.material.isShadowMaterial) add('catchers', o); });
  let buildCalls = 0, buildMeshes = 0; for (const c of v.scene.children) if (c.userData.instanceId != null && c.visible) c.traverse((o) => { if (o.isMesh && o.visible) { buildMeshes++; buildCalls += Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1; } });
  const res = {}; for (const [k, g] of Object.entries(groups)) res[k] = { meshes: g.meshes, calls: g.calls, tris: g.tris, floorByMaterial: g.materials.size, floorByLook: g.looks.size, images: g.images.size, unmapped: g.unmapped, lightmapPx: g.lm.sort((a, b) => b - a).join(',') };
  return { groups: res, build: { meshes: buildMeshes, calls: buildCalls }, rendererCalls: v.renderer.info.render.calls };
});

/* 2. the quads' fill on the hero, and the masks' shadowed share of their boxes */
out.quads = await page.evaluate(async () => {
  const v = window.__GEN2_VIEWER__, cam = v.camera, W = v.renderer.domElement.width, H = v.renderer.domElement.height;
  const V = cam.position.constructor;
  const clip = (poly) => {   // Sutherland–Hodgman against the NDC square
    const edges = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]];   // a*x + b*y + c >= 0 keeps
    for (const [a, b, c] of edges) {
      const outp = []; for (let i = 0; i < poly.length; i++) {
        const P = poly[i], Q = poly[(i + 1) % poly.length], fp = a * P[0] + b * P[1] + c, fq = a * Q[0] + b * Q[1] + c;
        if (fp >= 0) outp.push(P);
        if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); outp.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
      }
      poly = outp; if (!poly.length) break;
    }
    return poly;
  };
  const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const P = poly[i], Q = poly[(i + 1) % poly.length]; s += P[0] * Q[1] - Q[0] * P[1]; } return Math.abs(s) / 2; };
  const pixels = (mesh) => {
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.attributes.position, pts = [];
    for (const i of [0, 1, 3, 2]) { const p = new V(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld); const q = p.clone().project(cam); if (q.z > 1) return { px: NaN, note: 'behind the camera' }; pts.push([q.x, q.y]); }
    const c = clip(pts); return { px: Math.round(area(c) * (W / 2) * (H / 2)), onScreen: c.length > 0 };
  };
  const quads = [];
  v.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (o.userData.doneShadow) quads.push({ kind: 'mask', name: `${o.userData.doneShadow.group}-${o.userData.doneShadow.surface}`, file: `shadow-${o.userData.doneShadow.group}-${o.userData.doneShadow.surface}.webp`, mm: [o.geometry.parameters.width, o.geometry.parameters.height], ...pixels(o) });
    else if (o.userData.doneRoom && o.material.isShadowMaterial) quads.push({ kind: 'catcher', name: o.geometry.parameters.height > 1000 ? 'wall' : 'desk', mm: [o.geometry.parameters.width, o.geometry.parameters.height], ...pixels(o) });
  });
  for (const q of quads) {
    if (!q.file) continue;
    try {
      const bm = await createImageBitmap(await (await fetch(new URL('scenes/home-office/' + q.file, location.href))).blob());
      const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height; const g = cv.getContext('2d'); g.drawImage(bm, 0, 0);
      const d = g.getImageData(0, 0, bm.width, bm.height).data; let n = 0, x0 = bm.width, x1 = -1, y0 = bm.height, y1 = -1;
      for (let y = 0; y < bm.height; y++) for (let x = 0; x < bm.width; x++) { if (d[(y * bm.width + x) * 4] < 245) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
      q.maskPx = [bm.width, bm.height]; q.shadowedShare = +(n / (bm.width * bm.height)).toFixed(3); q.tightBoxShare = x1 < 0 ? 0 : +(((x1 - x0 + 1) * (y1 - y0 + 1)) / (bm.width * bm.height)).toFixed(3);
    } catch (e) { q.maskError = String(e.message); }
  }
  return { viewport: [W, H], viewportPx: W * H, quads };
});

/* 3. the interior hidden from every shot, and with the drawer out */
const shoot = async (name) => { const p = join(OUT, `${name}.png`); await page.screenshot({ path: p }); return p; };
const diff = async (a, b, name) => {
  const [A, B] = await Promise.all([readFile(a), readFile(b)]);
  const r = await page.evaluate(async ([a, b]) => {
    const load = (s) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height; const g = cv.getContext('2d');
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, cv.width, cv.height).data;
    const o = da.data; let n = 0, x0 = cv.width, x1 = -1, y0 = cv.height, y1 = -1;
    for (let i = 0; i < o.length; i += 4) {
      const d = Math.max(Math.abs(o[i] - db[i]), Math.abs(o[i + 1] - db[i + 1]), Math.abs(o[i + 2] - db[i + 2]));
      if (d > 8) { n++; const px = (i / 4) % cv.width, py = Math.floor(i / 4 / cv.width); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); o[i] = 255; o[i + 1] = 0; o[i + 2] = 0; }
      else { o[i] = o[i] * 0.35; o[i + 1] = o[i + 1] * 0.35; o[i + 2] = o[i + 2] * 0.35; }
    }
    g.putImageData(da, 0, 0);
    return { differing: n, share: +(n / (cv.width * cv.height)).toFixed(5), box: x1 < 0 ? null : [x0, y0, x1, y1], url: n ? cv.toDataURL('image/png') : null };
  }, [A.toString('base64'), B.toString('base64')]);
  if (r.url) await writeFile(join(OUT, `${name}.png`), Buffer.from(r.url.split(',')[1], 'base64'));
  delete r.url; return r;
};
const setInterior = (mode) => page.evaluate(([mode, re]) => {   // 'on' | 'off' | 'drawer-body' | 'drawer-unit'
  const v = window.__GEN2_VIEWER__, R = new RegExp(re), unit = window.__GEN2_DONE__.sequence.drawer.unit;
  const byId = new Map(v.manifest.instances.map((i) => [i.id, i]));
  for (const c of v.scene.children) {
    const inst = byId.get(c.userData.instanceId); if (!inst || !R.test(inst.node)) continue;
    const inUnit = unit != null && v.unitOf(inst.id) === unit;
    c.visible = mode === 'on' || (mode === 'drawer-unit' && inUnit) || (mode === 'drawer-body' && inUnit && /DecorDrawer/.test(inst.node));
  }
  v.renderer.shadowMap.needsUpdate = true; v.invalidateFrame();
  return { unit, hidden: [...v.scene.children].filter((c) => byId.has(c.userData.instanceId) && !c.visible).length };
}, [mode, INTERIOR.source]);
const shots = ['hero', 'low', 'detail'];
const atShot = async (i) => { await page.evaluate((name) => window.__GEN2_DONE__.jump(name), shots[i]); await page.waitForTimeout(i === 2 ? 1800 : 900); };   // by name (the grammar's shots, 2026-10-24); the detail shot's drawer opens 700 ms into its hold and is out by 1080
const RELIEF = process.argv.includes('--relief');
/* 4. the relief on and off, per shot: the flag changed and the tier round-tripped (ablate.mjs's way: a same-tier
   setQuality is a no-op), with a round trip that changes nothing as the control */
const roundTrip = (relief) => page.evaluate((relief) => { const v = window.__GEN2_VIEWER__, q = v.quality, o = ['veryhigh', 'high', 'balanced', 'fast']; if (relief != null) v.QUALITY[q].relief = relief; v.setQuality(o[Math.min(3, o.indexOf(q) + 1)], { user: true }); v.setQuality(q, { user: true }); return { quality: v.quality, relief: v.reliefWanted ? !!v.reliefWanted() : null }; }, relief);
if (RELIEF) out.relief = { shots: {} };
for (let i = 0; RELIEF && i < 3; i++) {
  await roundTrip(true); await page.waitForTimeout(2000); await atShot(i); const on = await shoot(`${TIER}-${shots[i]}-relief-on`);
  const ctl = await roundTrip(null); await page.waitForTimeout(2000); await atShot(i); const again = await shoot(`${TIER}-${shots[i]}-relief-on-again`);
  const off = await roundTrip(false); await page.waitForTimeout(2000); await atShot(i); const offShot = await shoot(`${TIER}-${shots[i]}-relief-off`);
  out.relief.shots[shots[i]] = { state: { control: ctl, off }, control: await diff(on, again, `${TIER}-${shots[i]}-relief-diff-control`), off: await diff(on, offShot, `${TIER}-${shots[i]}-relief-diff-off`) };
}
out.interior = { shots: {} };
for (let i = 0; !RELIEF && i < 3; i++) {
  const row = {};
  await setInterior('on'); await atShot(i); const on = await shoot(`${TIER}-${shots[i]}-on`);
  row.hidden = await setInterior('off'); await atShot(i); const off = await shoot(`${TIER}-${shots[i]}-interior-off`);
  row.off = await diff(on, off, `${TIER}-${shots[i]}-diff-off`);
  if (i === 2) {
    await setInterior('drawer-body'); await atShot(i); const b1 = await shoot(`${TIER}-${shots[i]}-interior-off-drawer-body`); row.drawerBody = await diff(on, b1, `${TIER}-${shots[i]}-diff-drawer-body`);
    await setInterior('drawer-unit'); await atShot(i); const b2 = await shoot(`${TIER}-${shots[i]}-interior-off-drawer-unit`); row.drawerUnit = await diff(on, b2, `${TIER}-${shots[i]}-diff-drawer-unit`);
    row.drawer = await page.evaluate(() => window.__GEN2_DONE__.sequence.drawer);
  }
  out.interior.shots[shots[i]] = row;
}
if (!RELIEF) out.interior.control = await (async () => { await setInterior('on'); await atShot(0); const a = await shoot(`${TIER}-hero-on-again`); return diff(join(OUT, `${TIER}-hero-on.png`), a, `${TIER}-hero-diff-control`); })();   // the same state twice: the method's own noise

await browser.close(); server.close();
await writeFile(join(OUT, `probe-${TIER}${RELIEF ? '-relief' : ''}.json`), JSON.stringify(out, null, 1));

console.log(`\n1. DRAW CALLS by group (now → floor after merging each group into one mesh; a material per draw)`);
console.log('| group | meshes | calls now | triangles | floor by material identity | floor by look | distinct map images (unmapped) | lightmap px |');
console.log('|---|---|---|---|---|---|---|---|');
let now = 0, fm = 0, fl = 0, fi = 0;
for (const [k, g] of Object.entries(out.calls.groups)) { now += g.calls; fm += g.floorByMaterial; fl += g.floorByLook; fi += g.images + (g.unmapped ? 1 : 0); console.log(`| ${k} | ${g.meshes} | ${g.calls} | ${g.tris} | ${g.floorByMaterial} | ${g.floorByLook} | ${g.images} (${g.unmapped}) | ${g.lightmapPx} |`); }
console.log(`| **room total** | | **${now}** | | **${fm}** | **${fl}** | **${fi}** | |`);
console.log(`build: ${out.calls.build.meshes} meshes, ${out.calls.build.calls} calls; renderer.info calls last frame ${out.calls.rendererCalls}`);
console.log(`\n2. THE QUADS' FILL on the hero (viewport ${out.quads.viewport.join('x')} = ${out.quads.viewportPx} px)`);
console.log('| quad | size mm | on-screen px | share of viewport | mask px | shadowed share of its box | tight box share |');
console.log('|---|---|---|---|---|---|---|');
for (const q of out.quads.quads) console.log(`| ${q.kind} ${q.name} | ${q.mm.map(Math.round).join(' x ')} | ${q.px} | ${(100 * q.px / out.quads.viewportPx).toFixed(1)} % | ${q.maskPx ? q.maskPx.join('x') : ''} | ${q.shadowedShare ?? ''} | ${q.tightBoxShare ?? ''} |`);
if (RELIEF) {
  console.log(`\n4. THE RELIEF OFF at ${TIER}, pixels that differ from relief-on (${out.quads.viewportPx} px a frame)`);
  for (const [s, r] of Object.entries(out.relief.shots)) console.log(`  ${s}: off ${r.off.differing} px (${(100 * r.off.share).toFixed(3)} %) in box ${JSON.stringify(r.off.box)}; control (the round trip, nothing changed) ${r.control.differing} px; state ${JSON.stringify(r.state)}`);
} else {
  console.log(`\n3. THE INTERIOR HIDDEN, pixels that differ from everything-on (${out.quads.viewportPx} px a frame)`);
  for (const [s, r] of Object.entries(out.interior.shots)) console.log(`  ${s}: plain hide ${r.off.differing} px (${(100 * r.off.share).toFixed(3)} %)${r.drawerBody ? `; drawer out, its body un-hidden ${r.drawerBody.differing} px; its unit's interior un-hidden ${r.drawerUnit.differing} px; drawer ${JSON.stringify(r.drawer)}` : ''}`);
  console.log(`  control (the hero twice, nothing changed): ${out.interior.control.differing} px`);
}
if (errors.length) console.log(`PAGE ERRORS: ${errors.join(' | ')}`);
