/* Checkpoint screenshots of the workspace shell - the brief's phase checkpoint ("screenshot both modes")
 * made repeatable. Opens `?ws=build&debug=1` on the root kit in headless Chrome, selects a drawer
 * through the hook so the inspector is up, and writes full-page PNGs for both modes at a wide and a
 * narrow desktop width into docs/redesign/checkpoints/. Not a test: nothing is compared.
 *
 *   node tools/shell-shots.mjs            -> build-screen-{dark,light}-{1440,1024}.png
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'docs', 'redesign', 'checkpoints');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon' };
function serve() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
      const f = join(root, p); const s = await stat(f);
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(s.isDirectory() ? join(f, 'index.html') : f));
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const { chromium } = await import('playwright');
await mkdir(OUT, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (async () => { for (const o of [{ channel: 'chrome' }, {}]) { try { return await chromium.launch({ ...o, args: ['--enable-unsafe-swiftshader'] }); } catch {} } throw new Error('no browser'); })();
try {
  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    for (const mode of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await ctx.addInitScript((m) => { try { localStorage.setItem('gen2-theme', m); localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1'); } catch {} }, mode);
      const page = await ctx.newPage();
      await page.goto(`${base}/index.html?ws=build&debug=1`, { waitUntil: 'load', timeout: 90_000 });
      await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-dock'), null, { timeout: 90_000 });
      const settle = () => page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.quality !== 'veryhigh' || (h.acc && h.acc.n >= h.ACC_SAMPLES); }, null, { timeout: 30_000 }).catch(() => {});
      if (w === 1440 && mode === 'dark') {
        /* the selection pair Astra asked for: the same camera with nothing selected, then with one unit selected */
        await settle(); await page.waitForTimeout(600);
        await writeFile(join(OUT, 'build-screen-dark-1440-selection-off.png'), await page.screenshot({ type: 'png' }));
      }
      await page.evaluate(() => { const h = window.__GEN2_VIEWER__; const e = [...h.instances.entries()].find(([, i]) => /DecorDrawer|ClassicDrawer/.test(i.cfg.node) && i.cfg.owner != null); if (e) h.setSelected(e[0]); });
      await page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.quality !== 'veryhigh' || (h.acc && h.acc.n >= h.ACC_SAMPLES); }, null, { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(800);
      const file = join(OUT, `build-screen-${mode}-${w}.png`);
      await writeFile(file, await page.screenshot({ type: 'png' }));
      console.log('wrote', file);
      if (w === 1440 && mode === 'dark') {
        /* the W/H/L callouts inside the safe area: Measure on, same camera */
        await page.click('#ws-tools .measure');
        await settle(); await page.waitForTimeout(800);
        await writeFile(join(OUT, 'build-screen-dark-1440-measure.png'), await page.screenshot({ type: 'png' }));
      }
      await ctx.close();
    }
  }
  /* Assemble (phase 1): dark 1440, a numbered step mid-way and the Done page */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
    const page = await ctx.newPage();
    await page.goto(`${base}/index.html?ws=assemble&debug=1`, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-player'), null, { timeout: 90_000 });
    const settle = () => page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.quality !== 'veryhigh' || (h.acc && h.acc.n >= h.ACC_SAMPLES); }, null, { timeout: 30_000 }).catch(() => {});
    await page.evaluate(() => { const h = window.__GEN2_VIEWER__; h.goTo(6, { animate: false }); });
    await page.waitForTimeout(1200); await settle(); await page.waitForTimeout(600);
    await writeFile(join(OUT, 'assemble-dark-1440-step.png'), await page.screenshot({ type: 'png' }));
    await page.evaluate(() => { const h = window.__GEN2_VIEWER__; h.goTo(h.pageCount - 2, { animate: false }); });
    await page.waitForTimeout(1200);
    await page.click('#ws-player .next');
    await settle(); await page.waitForTimeout(800);
    await writeFile(join(OUT, 'assemble-dark-1440-done.png'), await page.screenshot({ type: 'png' }));
    console.log('wrote assemble shots');
    await ctx.close();
  }
  /* Parts (phase 2): dark 1440, the list with a unit selected, then tracking on with a few counts */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
    const page = await ctx.newPage();
    await page.goto(`${base}/index.html?ws=parts&debug=1`, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-parts'), null, { timeout: 90_000 });
    const settle = () => page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.quality !== 'veryhigh' || (h.acc && h.acc.n >= h.ACC_SAMPLES); }, null, { timeout: 30_000 }).catch(() => {});
    await page.evaluate(() => { const h = window.__GEN2_VIEWER__; const e = [...h.instances.entries()].find(([, i]) => /DecorDrawer_185-2W/.test(i.cfg.node)); if (e) h.setSelected(e[0]); });
    await settle(); await page.waitForTimeout(800);
    await writeFile(join(OUT, 'parts-dark-1440.png'), await page.screenshot({ type: 'png' }));
    await page.click('#ws-parts .row3 > .key');
    await page.evaluate(() => { const plus = (n) => document.querySelectorAll('#ws-parts .prow')[n].querySelectorAll('.counter')[1].querySelector('button:last-of-type'); plus(0).click(); plus(0).click(); plus(2).click(); });
    await page.waitForTimeout(500);
    await writeFile(join(OUT, 'parts-dark-1440-tracking.png'), await page.screenshot({ type: 'png' }));
    console.log('wrote parts shots');
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
