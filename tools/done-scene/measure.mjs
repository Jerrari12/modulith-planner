/**
 * WHAT THE DONE ROOM COSTS, per tier, flag off and on (DESIGN.md §5.4; the instruments Sol asked to be named, 01a169e0):
 *
 *   - bytes fetched for the room (the GLB, its JSON, the module) from the page's resource timing;
 *   - draw calls of the last drawn frame at rest (renderer.info.render.calls);
 *   - frames drawn in a 10 s rest window (the stage's idleStats: the idle gate's keepalive is ~1 a second);
 *   - frame intervals while the room ENTERS (the camera's 900 ms move is the only motion): mean, p95, worst, from a
 *     requestAnimationFrame sampler, the one tools/perf-probe.mjs uses. Bound by the display's refresh (16.7 ms at
 *     60 Hz): a change below that floor is invisible to it, so the draw calls and the rest-frame count carry the Fast claim.
 *
 *   node tools/done-scene/measure.mjs [--kit 185-tabletop-2w2h] [--tiers veryhigh,high,balanced,fast] [--soft]
 *
 * --soft runs Chrome on SwiftShader (the CI runner's class of device), as e2e's E2E_SOFT does. Headless, this machine.
 * Prints a markdown table; exits 0. Numbers are for the report, not a gate.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const KIT = arg('--kit', '185-tabletop-2w2h');
const TIERS = arg('--tiers', 'veryhigh,high,balanced,fast').split(',');
const SOFT = process.argv.includes('--soft');
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
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const args = ['--enable-unsafe-swiftshader', ...(SOFT ? ['--disable-gpu', '--use-angle=swiftshader'] : [])];
const browser = await (async () => { for (const o of [{ channel: 'chrome' }, {}]) { try { return await chromium.launch({ ...o, args }); } catch { /* next */ } } throw new Error('no Chromium'); })();
localParts(browser, root);
const rows = [];
const kb = (n) => (n / 1024).toFixed(0) + ' KB';

for (const tier of TIERS) for (const flag of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', t); localStorage.setItem('gen2-quality:set', '1'); } catch {} }, tier);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/index.html?ws=assemble&build=${KIT}&debug=1${flag ? '&done=room' : ''}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-player'), null, { timeout: 120_000 });
  await page.locator('#ws-steps button:has-text("Skip to the finished build")').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  const quality = await page.evaluate(() => window.__GEN2_VIEWER__.quality);
  // the sampler runs through the entry: Next, then 1.6 s (the 900 ms camera move and the first frames after it)
  await page.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__sampling) requestAnimationFrame(tick); }; window.__sampling = true; requestAnimationFrame(tick); });
  const t0 = Date.now();
  await page.locator('#ws-player button:has-text("Next")').click();
  if (flag) await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => { errors.push('the room never came on'); });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(1600);
  const frames = await page.evaluate(() => { window.__sampling = false; return window.__frames.slice(2); });
  await page.waitForTimeout(2500);   // settle (Very High's accumulation burst included)
  /* the camera sequence (2026-10-23): the room holds on a shot for 9 s then drifts for 3.5 s, so a 10 s window always
     holds a drift. The rest window here is a HOLD (the hold made endless through the debug hook), the number the idle
     gate is judged on; one drift is measured on its own below (driftFrames, driftMs). Very High converges in the hold. */
  if (flag) { await page.evaluate(() => { if (window.__GEN2_DONE__) window.__GEN2_DONE__.setTiming({ holdMs: 1e7 }); }); await page.waitForTimeout(2500); }
  /* draw calls PER FRAME, every pass included: renderer.info resets on each render() call, so at High it would report the
     AO composite's one call; left accumulating over the rest window and divided by the frames the idle gate drew, it is
     the whole frame's cost */
  const s0 = await page.evaluate(() => { const r = window.__GEN2_VIEWER__.renderer; r.info.autoReset = false; r.info.reset(); return { ...window.__GEN2_VIEWER__.idleStats() }; });
  await page.waitForTimeout(10_000);
  const s1 = await page.evaluate(() => { const v = window.__GEN2_VIEWER__, r = v.renderer; const out = { ...v.idleStats(), callsTotal: r.info.render.calls, trisTotal: r.info.render.triangles }; r.info.autoReset = true; return out; });
  const drawn = Math.max(1, s1.drawn - s0.drawn);
  s1.calls = Math.round(s1.callsTotal / drawn); s1.tris = Math.round(s1.trisTotal / drawn);
  // one drift of the sequence: frames the gate drew over its 3.5 s, and the mean rAF interval while it ran
  let driftFrames = '', driftMs = '';
  if (flag && await page.evaluate(() => !!(window.__GEN2_DONE__ && window.__GEN2_DONE__.sequence.on))) {
    await page.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__sampling) requestAnimationFrame(tick); }; window.__sampling = true; requestAnimationFrame(tick); window.__GEN2_DONE__.setTiming({ holdMs: 1, moveMs: 3500 }); });
    const d0 = await page.evaluate(() => ({ ...window.__GEN2_VIEWER__.idleStats() }));
    await page.waitForTimeout(3500);
    const d1 = await page.evaluate(() => { window.__sampling = false; const v = window.__GEN2_VIEWER__; return { ...v.idleStats(), frames: window.__frames.slice(2) }; });
    driftFrames = d1.drawn - d0.drawn;
    driftMs = (d1.frames.reduce((a, b) => a + b, 0) / Math.max(1, d1.frames.length)).toFixed(1);
  }
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /scenes\/|done(-fit)?\.js/.test(e.name)).reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0));
  const sorted = frames.slice().sort((a, b) => a - b);
  const mean = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0, worst = sorted[sorted.length - 1] || 0;
  rows.push({ tier: quality, room: flag ? 'on' : 'off', bytes: flag ? kb(bytes) : '0', loadMs: flag ? loadMs : '', calls: s1.calls, tris: s1.tris, restFrames: s1.drawn - s0.drawn, driftFrames, driftMs, enterMean: mean.toFixed(1), enterP95: p95.toFixed(1), enterWorst: worst.toFixed(1), n: frames.length, errors: errors.length ? errors.join(' | ') : '' });
  await ctx.close();
}
await browser.close(); server.close();
const cols = ['tier', 'room', 'bytes', 'loadMs', 'calls', 'tris', 'restFrames', 'driftFrames', 'driftMs', 'enterMean', 'enterP95', 'enterWorst', 'n', 'errors'];
console.log(`\n${SOFT ? 'SwiftShader (the CI runner\'s class)' : 'this machine\'s GPU'}, 1280x800, dark theme, kit ${KIT}; rest window 10 s (the room: in a hold of the camera sequence); drift = one 3.5 s drift of the sequence; enter = Next to Done + 1.6 s, rAF intervals in ms\n`);
console.log('| ' + cols.join(' | ') + ' |');
console.log('|' + cols.map(() => '---').join('|') + '|');
for (const r of rows) console.log('| ' + cols.map((c) => r[c]).join(' | ') + ' |');
