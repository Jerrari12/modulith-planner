/**
 * THE PERFORMANCE PROBE: the two phase-0 exit numbers the plan asked for and nothing had measured (§4):
 *
 *   - heap after 50 in-process regenerates within 10% of after 1 (a leak in the stage's rebuild would show here first),
 *     with the renderer's live geometry, texture and program counts beside it, because a leaked WebGL resource is not on
 *     the JS heap (Terra 01a136f0);
 *   - frame time with the Build chrome open over the stage while the model orbits, at the default tier and at Fast: the
 *     mean, the 95th percentile, the worst interval, and how many intervals missed a refresh (over 1.5x the median), since
 *     a vsync-bound mean equal to the p95 can still hide one 25 ms frame.
 *
 *   node tools/perf-probe.mjs [--kit 185-tabletop-3w2h] [--cycles 50] [--tiers veryhigh,fast]
 *
 * Headless Chrome on THIS machine's GPU (the numbers are per machine; the CI runner's software rasteriser would measure
 * SwiftShader, not the app). The heap is read through the DevTools protocol after a forced collection; the frame
 * intervals come from a requestAnimationFrame sampler in the page while the mouse drags the model around for two
 * seconds, which is a real pointer stream (OrbitControls ignores synthetic events). Prints a table and exits 0; the
 * numbers are for DECISIONS.md, not a gate: a gate on a frame time would fail on whatever machine runs it next.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const KIT = arg('--kit', '185-tabletop-3w2h');
const CYCLES = Number(arg('--cycles', '50'));
const TIERS = arg('--tiers', 'veryhigh,fast').split(',');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
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
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (async () => { for (const o of [{ channel: 'chrome' }, {}]) { try { return await chromium.launch({ ...o, args: ['--enable-unsafe-swiftshader'] }); } catch { /* next */ } } throw new Error('no Chromium'); })();
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
const rows = [];

for (const tier of TIERS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', t); localStorage.setItem('gen2-quality:set', '1'); } catch {} }, tier);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(300); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
  await page.goto(`${base}/index.html?ws=build&build=${KIT}&debug=1`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && window.__GEN2_STORE__ && document.querySelector('#ws-dock'), null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const quality = await page.evaluate(() => window.__GEN2_VIEWER__.quality);
  const h0 = await heap();
  const info = () => page.evaluate(() => window.__GEN2_VIEWER__.probe());

  /* regenerates: a unit added beside the build on its bottom row, then removed, each a real rebuild of the scene */
  const regen = async () => {
    const n0 = await page.evaluate(() => window.__GEN2_VIEWER__.build.placed.length);
    await page.evaluate(() => { const st = window.__GEN2_STORE__; st.commit((s, R) => { const id = s.nextId++; const bottom = Math.max(...s.placed.map((p) => p.y + p.hh)); const right = Math.max(...s.placed.map((p) => p.x + p.w)); s.placed.push({ id, x: right, y: bottom - 2, w: 1, hh: 2, fill: 'decor', shelves: 0 }); if (s.gridW < right + 1) s.gridW = right + 1; R.syncTabletopGrid(); }, 'edit'); });
    await page.waitForFunction((n) => window.__GEN2_VIEWER__.build.placed.length === n + 1, n0, { timeout: 120_000 });
    await page.evaluate(() => { const st = window.__GEN2_STORE__; st.commit((s, R) => { s.placed.pop(); R.syncTabletopGrid(); }, 'edit'); });
    await page.waitForFunction((n) => window.__GEN2_VIEWER__.build.placed.length === n, n0, { timeout: 120_000 });
  };
  let busy = 0;   // the regenerate cycles alone: the forced collections between them are the probe's, not the app's
  let t0 = Date.now();
  await regen();
  busy += Date.now() - t0;
  const h1 = await heap(), i1 = await info();
  t0 = Date.now();
  for (let i = 1; i < CYCLES; i++) await regen();
  busy += Date.now() - t0;
  const perCycle = busy / CYCLES;
  const hN = await heap(), iN = await info();

  /* frame time: the library and the inspector open (the Build chrome as a visitor sees it), the model dragged around.
     Both states are checked, and the camera must have moved, or the figure would be a still picture labelled a drag. */
  await page.evaluate(() => { const u = window.__GEN2_STORE__.state.placed[0]; if (u) window.__GEN2_VIEWER__.selectUnit(u.id); });
  await page.waitForTimeout(800);
  const chrome = await page.evaluate(() => ({ lib: !!document.querySelector('#ws-lib:not(.rail)') && document.querySelector('#ws-lib').offsetParent !== null, insp: !!document.querySelector('#ws-insp') && !document.querySelector('#ws-insp').hidden }));
  if (!chrome.lib || !chrome.insp) throw new Error(`the Build chrome is not open as the probe assumes: library ${chrome.lib}, inspector ${chrome.insp}`);
  const camBefore = (await info()).camera;
  await page.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__sampling) requestAnimationFrame(tick); }; window.__sampling = true; requestAnimationFrame(tick); });
  const box = await page.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height * 0.5, w: r.width }; });
  await page.mouse.move(box.x, box.y); await page.mouse.down();
  const t1 = Date.now();
  while (Date.now() - t1 < 2000) { const k = ((Date.now() - t1) / 2000) * Math.PI * 2; await page.mouse.move(box.x + Math.sin(k) * box.w * 0.2, box.y + Math.cos(k) * 60, { steps: 2 }); }
  await page.mouse.up();
  const frames = await page.evaluate(() => { window.__sampling = false; return window.__frames.slice(5); });
  const camAfter = (await info()).camera;
  if (camBefore.join() === camAfter.join()) throw new Error('the drag did not move the camera: the frame figure would not be an orbit');
  const sorted = frames.slice().sort((a, b) => a - b);
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const median = sorted[Math.floor(sorted.length / 2)], max = sorted[sorted.length - 1];
  const missed = frames.filter((f) => f > 1.5 * median).length;
  rows.push({ tier: quality, boot: mb(h0), after1: mb(h1), afterN: mb(hN), growth: ((hN / h1 - 1) * 100).toFixed(1) + '%',
    res1: `${i1.geometries}/${i1.textures}/${i1.programs}`, resN: `${iN.geometries}/${iN.textures}/${iN.programs}`,
    regenMs: perCycle.toFixed(0), frameMean: mean.toFixed(1), frameP95: p95.toFixed(1), frameMax: max.toFixed(1), missed, frames: frames.length });
  await ctx.close();
}
await browser.close(); server.close();

console.log(`perf probe · kit ${KIT} · ${CYCLES} regenerate cycles (add a unit, remove it) · the Build chrome open, the model dragged for 2 s`);
console.log('tier      heap at boot   after 1   after N   growth   geom/tex/prog after 1 -> N   ms/cycle   frame mean  p95      max      missed (frames)');
for (const r of rows) console.log(`${r.tier.padEnd(9)} ${r.boot.padEnd(14)} ${r.after1.padEnd(9)} ${r.afterN.padEnd(9)} ${r.growth.padEnd(8)} ${(r.res1 + ' -> ' + r.resN).padEnd(29)} ${r.regenMs.padEnd(10)} ${(r.frameMean + ' ms').padEnd(11)} ${(r.frameP95 + ' ms').padEnd(8)} ${(r.frameMax + ' ms').padEnd(8)} ${String(r.missed).padEnd(6)} (${r.frames})`);
