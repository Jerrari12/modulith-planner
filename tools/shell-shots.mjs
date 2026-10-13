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
  /* Build rules (phase 3): dark 1440 - the armed size with its spots on the model, the 2D board, and the issue
     card after a support is dragged out from under a unit */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
    const page = await ctx.newPage();
    await page.goto(`${base}/index.html?ws=build&debug=1`, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-dock'), null, { timeout: 90_000 });
    const settle = () => page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.quality !== 'veryhigh' || (h.acc && h.acc.n >= h.ACC_SAMPLES); }, null, { timeout: 30_000 }).catch(() => {});
    await page.click('#ws-lib .size:not(.dis) >> nth=5');   // a size tile arms placing: the valid spots appear
    await page.waitForTimeout(600); await settle(); await page.waitForTimeout(600);
    await writeFile(join(OUT, 'build-rules-dark-1440-spots.png'), await page.screenshot({ type: 'png' }));
    await page.click('#ws-tools .view button:has-text("2D")');
    await page.waitForTimeout(400);
    await writeFile(join(OUT, 'build-rules-dark-1440-board.png'), await page.screenshot({ type: 'png' }));
    await page.click('#ws .armed button');   // stop placing
    // drag the bottom-left support out from under the stack on the board (the board draws the STORE's grid), then open the issue card
    await page.evaluate(() => {
      const board = document.querySelector('#ws-board'); const svg = board.querySelector('svg'); const vb = svg.viewBox.baseVal; const r = svg.getBoundingClientRect();
      const b = window.__GEN2_STORE__.state; const rows = b.gridH * 2; const PAD = 18; const cell = (vb.width - 2 * PAD) / b.gridW; const half = cell * 28 / 88;
      const k = Math.min(r.width / vb.width, r.height / vb.height); const ox = (r.width - vb.width * k) / 2, oy = (r.height - vb.height * k) / 2;
      const at = (x, y) => ({ clientX: r.left + ox + (PAD + (x + 0.5) * cell) * k, clientY: r.top + oy + (PAD + (y + 0.5) * half) * k });
      const ev = (t, p) => svg.dispatchEvent(new PointerEvent(t, { ...p, button: 0, pointerId: 1, bubbles: true, isPrimary: true }));
      const bottom = b.placed.filter((u) => u.y + u.hh === rows).sort((p, q) => p.x - q.x)[0];
      const a = at(bottom.x, bottom.y), d = at(0, bottom.y);
      ev('pointerdown', a); ev('pointermove', { clientX: a.clientX + 12, clientY: a.clientY }); ev('pointermove', d); ev('pointerup', d);
    });
    await page.waitForTimeout(800);
    await page.click('#ws-dock .status');
    await page.waitForTimeout(400);
    await writeFile(join(OUT, 'build-rules-dark-1440-issue.png'), await page.screenshot({ type: 'png' }));
    console.log('wrote build-rules shots');
    await ctx.close();
  }
  /* the product-faithful previews (phase 3): the Build style tab on Essential with every faceplate and handle tile
     rendered from the GLBs, and the inspector's preview of a selected unit */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
    const page = await ctx.newPage();
    await page.goto(`${base}/index.html?ws=build&debug=1`, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-dock'), null, { timeout: 90_000 });
    await page.evaluate(async () => { const h = window.__GEN2_VIEWER__; await h.applyFaceplateStyle(h.FACEPLATE_STYLES.find((s) => s.key === 'essential')); });
    await page.waitForTimeout(800);
    await page.click('#ws-lib .seg:has-text("Build style")');
    await page.waitForFunction(() => document.querySelectorAll('#ws-lib .pv.face img').length >= 5 && document.querySelectorAll('#ws-lib .pv.handle img').length >= 3, null, { timeout: 60_000 }).catch(() => {});
    await page.evaluate(() => { const h = window.__GEN2_VIEWER__; h.selectUnit(3); });
    await page.waitForFunction(() => document.querySelector('#ws-insp .pv.insp img'), null, { timeout: 30_000 }).catch(() => {});
    await page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.quality !== 'veryhigh' || (h.acc && h.acc.n >= h.ACC_SAMPLES); }, null, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(600);
    await writeFile(join(OUT, 'build-previews-dark-1440.png'), await page.screenshot({ type: 'png' }));
    console.log('wrote previews shot');
    await ctx.close();
  }
  /* Colors (phase 4): dark 1440, a faceplate selected with the picker open on its face, and the shopping list */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
    const page = await ctx.newPage();
    await page.goto(`${base}/index.html?ws=colors&debug=1`, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-colors'), null, { timeout: 90_000 });
    await page.evaluate(() => { const h = window.__GEN2_VIEWER__; const e = [...h.instances.entries()].find(([, i]) => /Faceplate/.test(i.cfg.node) && i.group.visible); if (e) h.setSelected(e[0]); });
    await page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.quality !== 'veryhigh' || (h.acc && h.acc.n >= h.ACC_SAMPLES); }, null, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await writeFile(join(OUT, 'colors-dark-1440.png'), await page.screenshot({ type: 'png' }));
    await page.click('#ws-dock .status');
    await page.waitForTimeout(400);
    await writeFile(join(OUT, 'colors-dark-1440-shop.png'), await page.screenshot({ type: 'png' }));
    console.log('wrote colors shots');
    await ctx.close();
  }
  /* the phone layout (the mobile phase): 390 x 844 dark, Build with the library sheet open, Build placing (sheet
     collapsed, markers up), Parts with its sheet open, Colors */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'balanced'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
    const page = await ctx.newPage();
    const settle = () => page.waitForTimeout(1200);
    await page.goto(`${base}/index.html?ws=build&debug=1`, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-tabbar'), null, { timeout: 90_000 });
    await settle();
    await writeFile(join(OUT, 'phone-build-dark-390.png'), await page.screenshot({ type: 'png' }));
    await page.click('#ws-lib .sheet-handle'); await page.waitForTimeout(500);
    await writeFile(join(OUT, 'phone-build-dark-390-library.png'), await page.screenshot({ type: 'png' }));
    await page.click('#ws-lib .size:not(.dis) >> nth=5'); await settle();
    await writeFile(join(OUT, 'phone-build-dark-390-placing.png'), await page.screenshot({ type: 'png' }));
    await page.click('#ws-tabbar .tab:has-text("Parts")'); await settle();
    await page.click('#ws-parts .sheet-handle'); await page.waitForTimeout(500);
    await writeFile(join(OUT, 'phone-parts-dark-390.png'), await page.screenshot({ type: 'png' }));
    await page.click('#ws-tabbar .tab:has-text("Colors")'); await settle();
    await writeFile(join(OUT, 'phone-colors-dark-390.png'), await page.screenshot({ type: 'png' }));
    console.log('wrote phone shots');
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
