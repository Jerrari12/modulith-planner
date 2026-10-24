/**
 * A PROP IN THE LIVE SCENE, close up (2026-10-24, the calipers' remodel): the final scene entered as a visitor does, its
 * clock stopped, the camera put on one of the room's prop groups from two angles, screenshots, and what the prop's
 * meshes are drawn with (the live steel's PBR material, its environment, its map; a baked mesh's lightmap). `--glb`
 * stands a room GLB that is not installed yet in for scenes/home-office/room.glb (a bake fetched from node0, before it
 * is copied in), so a bake can be looked at in the planner before it replaces the room.
 *
 *   node tools/done-scene/prop-view.mjs [--group calipers] [--tiers high,fast] [--glb renders/bake4/room.glb]
 *                                       [--json renders/bake4/room.json] [--out D:/Claude - Output/done-scene-2026-10-23/props]
 *
 * This machine's GPU, headless Chrome, 1280x800 at screen scale 2, the dark stage, the 185 2W2H kit.
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const GROUP = arg('--group', 'calipers');
const TIERS = arg('--tiers', 'high,fast').split(',');
const GLB = arg('--glb', '');
const JSON_ = arg('--json', '');
const KIT = arg('--kit', '185-tabletop-2w2h');
const OUT = arg('--out', 'D:/Claude - Output/done-scene-2026-10-23/props');
const TAG = arg('--tag', GLB ? 'candidate' : 'installed');
const VIEWS = [{ name: 'front', az: 14, el: 34, fill: 0.86 }, { name: 'jaws', az: -30, el: 26, fill: 0.86, end: 'jaws' }];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.ico': 'image/x-icon' };
function serve() {
  const server = createServer(async (req, res) => {
    try {
      const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
      let file = join(root, rel === '' ? 'index.html' : rel);
      if (GLB && /scenes[/\\]home-office[/\\]room\.glb$/.test(rel)) file = resolve(GLB);
      if (JSON_ && /scenes[/\\]home-office[/\\]room\.json$/.test(rel)) file = resolve(JSON_);
      else if (!file.startsWith(root) && !(GLB && file === resolve(GLB))) { res.writeHead(403); res.end(); return; }
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
const browser = await (async () => { for (const o of [{ channel: 'chrome' }, {}]) { try { return await chromium.launch(o); } catch { /* next */ } } throw new Error('no Chromium'); })();
localParts(browser, root);
const report = [];
for (const tier of TIERS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', t); localStorage.setItem('gen2-quality:set', '1'); } catch {} }, tier);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  await page.waitForTimeout(800);
  const meshes = await page.evaluate((group) => {
    const v = window.__GEN2_VIEWER__, out = [];
    v.scene.getObjectByName('done-room').traverse((o) => {
      if (!o.isMesh || (o.userData.group || '') !== group) return;
      const m = o.material;
      out.push({ name: o.name, live: !!o.userData.live, visible: o.visible, type: m.type, metalness: m.metalness ?? null, roughness: m.roughness ?? null, envMap: !!m.envMap, map: !!m.map, mapSize: m.map && m.map.image ? [m.map.image.width, m.map.image.height] : null, castShadow: o.castShadow, tris: Math.round((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) });
    });
    return out;
  }, GROUP);
  for (const view of VIEWS) {
    await page.evaluate(([group, view]) => {
      const v = window.__GEN2_VIEWER__, cam = v.camera, THREE_V = cam.position.constructor;
      const box = { min: new THREE_V(Infinity, Infinity, Infinity), max: new THREE_V(-Infinity, -Infinity, -Infinity) };
      v.scene.getObjectByName('done-room').traverse((o) => {
        if (!o.isMesh || (o.userData.group || '') !== group) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); box.min.min(b.min); box.max.max(b.max);
      });
      let c = box.min.clone().add(box.max).multiplyScalar(0.5), r = box.max.clone().sub(box.min).length() / 2;
      if (view.end === 'jaws') { c = new THREE_V(box.min.x + 0.11 * (box.max.x - box.min.x), c.y, c.z); r *= 0.36; }   // the jaw end of the beam
      const fov = 30, d = r / (view.fill * Math.tan((fov * Math.PI) / 360));
      const az = (view.az * Math.PI) / 180, el = (view.el * Math.PI) / 180;
      cam.position.set(c.x + d * Math.sin(az) * Math.cos(el), c.y + d * Math.sin(el), c.z + d * Math.cos(az) * Math.cos(el));
      v.controls.target.copy(c); cam.fov = fov; cam.updateProjectionMatrix(); v.controls.update(); v.invalidateFrame();
    }, [GROUP, view]);
    await page.waitForTimeout(tier === 'veryhigh' ? 6000 : 1500);   // Very High converges at rest
    const shot = join(OUT, `${GROUP}-${TAG}-${tier}-${view.name}.png`);
    await page.screenshot({ path: shot });
    report.push({ tier, view: view.name, shot });
  }
  report.push({ tier, meshes, errors });
  console.log(`${tier}: ${meshes.map((m) => `${m.name} ${m.type}${m.live ? ' LIVE' : ''} metal ${m.metalness} rough ${m.roughness} env ${m.envMap} map ${m.map}${m.mapSize ? ' ' + m.mapSize.join('x') : ''} tris ${m.tris}`).join(' | ')}${errors.length ? '  ERRORS ' + errors.join(' / ') : ''}`);
  await ctx.close();
}
await browser.close(); server.close();
await writeFile(join(OUT, `${GROUP}-${TAG}.json`), JSON.stringify(report, null, 1));
console.log(`wrote ${report.filter((r) => r.shot).length} shots to ${OUT}`);
