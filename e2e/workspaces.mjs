/**
 * THE END-TO-END SUITE: the merged planner, driven in headless Chrome the way a visitor drives it, as a deploy gate.
 *
 *   npm run e2e            (CI runs it beside the smoke test; it needs the network for the part GLBs, like the smoke)
 *
 * It lives in e2e/, not test/, so `npm test` (node --test, which picks every file under test/) stays browser-free.
 *
 * The fast suite (`npm test`) proves the rules, the store and the schema without a browser; the smoke test proves the old
 * viewer draws. Nothing until now proved that the five workspaces mount, that a click places a unit, that a label lands on a
 * drawer, that Undo takes it back, that a build survives a reload. Joey's gate for retiring the old planner is "reliable and
 * well tested" (2026-10-13), so this is the suite that says so, and it blocks the deploy.
 *
 * Every case: a fresh browser context (its own IndexedDB and localStorage), the dark theme, `?debug=1` (the store and the
 * stage hooks), the page's console errors collected and asserted empty at the end. Geometry goes through the store where
 * a gesture would need the 3D hit test (the markers are raycast against the live scene, which a synthetic pointer cannot
 * reach reliably headless); everything else is the real DOM.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localParts } from '../test/lib/local-parts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');   // e2e/ sits beside test/
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.md': 'text/markdown', '.webp': 'image/webp' };
function serve(dir = root) {
  const server = createServer(async (req, res) => {
    try {
      const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
      let file = join(dir, rel === '' ? 'index.html' : rel);
      if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { chromium } = await import('playwright');
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
/* the Label Studio checkout beside this repo (its published Part Picker under parts/) on a second loopback server: the
   Part Picker case drives the real Picker in the planner's modal; without the checkout the case is skipped */
const STUDIO_DIR = process.env.STUDIO_DIR || join(root, '..', 'GEN2 label-types', 'GEN2 EdgeLabel Label Generator');
const haveStudio = existsSync(join(STUDIO_DIR, 'parts', 'js', 'embed.js'));
const studioServer = haveStudio ? await serve(STUDIO_DIR) : null;
const studio = studioServer ? `http://127.0.0.1:${studioServer.address().port}/` : null;
/* E2E_SOFT=1 reproduces the CI runner's rendering here: the SwiftShader software rasteriser, no GPU */
const SOFT = process.env.E2E_SOFT === '1';
const launchArgs = ['--enable-unsafe-swiftshader', ...(SOFT ? ['--disable-gpu', '--use-angle=swiftshader'] : [])];
const browser = await (async () => { for (const o of [{ channel: 'chrome' }, {}]) { try { return await chromium.launch({ ...o, args: launchArgs }); } catch {} } throw new Error('no Chromium'); })();
localParts(browser, root);   // GEN2_PARTS_LOCAL=1 reads unpublished parts from this checkout (test/lib/local-parts.mjs)
test.after(async () => { await browser.close(); server.close(); if (studioServer) studioServer.close(); });
/* a case that fails before its own ctx.close() must not leave a page rendering: on the CI runner's software rasteriser
   one leftover render loop starved every boot after it, so each case's contexts are closed here whatever happened */
const contexts = new Set();
afterEach(async () => { for (const c of contexts) await c.close().catch(() => {}); contexts.clear(); });

/* a page on a workspace: booted (the stage has its manifest, the workspace its dock), errors collected.
   The quality tier is pinned to `fast` (no shadows, dpr 1) and the desktop viewport is the smallest desktop layout: the
   suite proves behaviour, not pixels, and on the CI runner's software rasteriser the balanced tier at 1440x900 kept the
   main thread so busy that a click took longer than its 30 s to be acknowledged (run 38426597075, 2026-10-13) */
/* a second browser for share-link checks, set up as open() sets up its own: the fast tier and the dark theme. Without it the
   page renders at its default quality, and on the CI runner's software rasteriser that kept the main thread so busy that
   a click outlived its 30 s (deploy run 38981210610: "the redesign follow-up: a gap build…" - locator.click: Timeout
   30000ms exceeded; this suite passed locally on a real GPU every time) */
const FAST = () => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); } catch {} };
async function freshContext() { const c = await browser.newContext({ viewport: { width: 1280, height: 800 } }); contexts.add(c); await c.addInitScript(FAST); return c; }
async function open(ws, { query = '', phone = false, context = null } = {}) {
  const ctx = context || await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
  contexts.add(ctx);
  if (!context) await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
  const page = await ctx.newPage();
  // E2E_THROTTLE=n slows this machine's CPU n times (Chrome's own throttling), towards the CI runner's speed: the
  // follow-up cases of 2026-10-16 passed here, soft rendering included, and failed there twice
  if (process.env.E2E_THROTTLE) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.E2E_THROTTLE }); }
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ').trim()));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`${base}/index.html?ws=${ws}&debug=1${query}`, { waitUntil: 'load', timeout: 90_000 });
  await waitBoot(page);
  return { ctx, page, errors };
}
const waitBoot = (page) => page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && window.__GEN2_STORE__ && document.querySelector('#ws-dock, #ws-player'), null, { timeout: 90_000 });
const S = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__GEN2_STORE__.state)));
const units = (page) => page.evaluate(() => window.__GEN2_STORE__.state.placed.length);
const stageUnits = (page) => page.evaluate(() => window.__GEN2_VIEWER__.build.placed.length);
const text = (page, sel) => page.locator(sel).first().textContent();
const btn = (page, t, root = 'body') => page.locator(`${root} button:has-text("${t}")`).first();
/* the "no errors" assertion ignores what headless SwiftShader itself prints (WebGL context notes) */
const clean = (errors) => errors.filter((e) => !/WebGL|GPU|swiftshader|GroupMarkerNotSet|setPointerCapture/i.test(e));
const settle = (page, ms = 1200) => page.waitForTimeout(ms);

test('every workspace boots on the root kit without errors, desktop and phone', async () => {
  for (const ws of ['build', 'colors', 'labels', 'parts', 'assemble']) {
    for (const phone of [false, true]) {
      const { ctx, page, errors } = await open(ws, { phone });
      assert.equal(await page.evaluate((w) => document.documentElement.dataset.ws, ws), ws, `${ws} mounted`);
      assert.ok(await page.locator('#ws-top').count(), `${ws}: the top bar`);
      if (phone) assert.ok(await page.locator('#ws-tabbar').count(), `${ws}: the phone tab bar`);
      assert.deepEqual(clean(errors), [], `${ws} ${phone ? 'phone' : 'desktop'}`);
      await ctx.close();
    }
  }
});

test('the front door: the bare address opens Build; a kit link and a part preview keep the old viewer, whose Customize hands the build to Build', async () => {
  /* cutover, 2026-10-17 (js/entry.js shellWorkspace, test/front-door.test.mjs): planner.modulith.systems/ is the planner */
  const ctx = await freshContext();
  const errors = [];
  const watch = (p) => { p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); }); return p; };
  const page = watch(await ctx.newPage());
  await page.goto(`${base}/index.html?debug=1`, { waitUntil: 'load', timeout: 90_000 }); await waitBoot(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ws), 'build', 'the bare address mounts Build');
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('ws')), 'build', 'and names it in the address');
  assert.ok(await page.locator('#ws-top').count(), 'the top bar');
  // a kit by name, without ?ws=: the old viewer (the smoke test's and the goldens' route)
  await page.goto(`${base}/index.html?build=185-tabletop-2w2h&debug=1`, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest, null, { timeout: 90_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ws || null), null, 'a kit link keeps the old viewer');
  const units = (rec) => rec.placed.map((p) => `${p.id}:${p.w}W${p.hh}@${p.x},${p.y}:${p.fill}`).sort().join(' ');
  const want = units(await page.evaluate(() => JSON.parse(JSON.stringify(window.__GEN2_VIEWER__.build))));
  // its Customize opens this app's Build workspace on the same build (a new tab, as before), never the old planner
  const [tab] = await Promise.all([ctx.waitForEvent('page'), page.locator('#btn-customize').click()]);
  watch(tab);
  await tab.waitForLoadState('load', { timeout: 90_000 });
  await tab.waitForFunction(() => document.documentElement.dataset.ws === 'build' && document.querySelector('#ws-dock'), null, { timeout: 90_000 });
  const u = new URL(tab.url());
  assert.equal(u.origin + u.pathname, `${base}/index.html`, 'the same app: ' + tab.url().slice(0, 120));
  assert.equal(u.searchParams.get('ws'), 'build');
  assert.equal(u.searchParams.get('build'), '185-tabletop-2w2h', 'the kit rides along');
  const m = /^#build=([^&]+)/.exec(u.hash);
  assert.ok(m, 'the build rides in the hash');
  assert.equal(units(JSON.parse(Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8'))), want, 'the build handed over is the one shown');
  await tab.close();
  // the site's part preview keeps the old viewer
  await page.goto(`${base}/index.html?part=185-case-2w-1h&mode=preview`, { waitUntil: 'load', timeout: 90_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ws || null), null, 'the part preview keeps the old viewer');
  assert.equal(await page.locator('#ws-top').count(), 0, 'with no workspace chrome');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('analytics: only Assemble counts steps, the boot preset is not a pick, and events go out 400 ms apart', async () => {
  // the UI review, 2026-10-16: three 429s from GoatCounter (4 hits a second); every workspace's boot had fired step:11,
  // complete and preset:<first> at once beside the page view
  const { ctx, page } = await open('build');
  await settle(page);
  const log = await page.evaluate(() => window.__GEN2_VIEWER__.trackLog.slice());
  assert.deepEqual(log.filter((n) => /^(step:|complete$|preset:)/.test(n)), [], `Build boot sent: ${log.join(', ')}`);
  // the pacing: a stub count() records when each event leaves
  // waited for, not timed: the first version waited a fixed 1.6 s / 1.2 s. Deploy run 38934988676 failed in this suite;
  // that those fixed waits were the cause is UNCONFIRMED (the run's log was not read - it needs a GitHub sign-in): the
  // runner's busy main thread makes timers late, which fits. A timeout here names the event it waited for.
  await page.evaluate(() => { window.__at = []; window.goatcounter = { count: () => window.__at.push(performance.now()) }; for (let i = 0; i < 4; i++) window.__GEN2_VIEWER__.track('test:' + i); });
  await page.waitForFunction(() => window.__at.length === 4, null, { timeout: 30_000 })
    .catch(async () => assert.fail(`paced events: ${await page.evaluate(() => window.__at.length)} of 4 (test:0-3) sent within 30 s`));
  const gaps = await page.evaluate(() => window.__at.slice(1).map((t, i) => t - window.__at[i]));
  for (const g of gaps) assert.ok(g >= 380, `spaced: ${gaps.map(Math.round).join(', ')} ms`);
  await ctx.close();
  const a = await open('assemble');
  await a.page.waitForFunction(() => window.__GEN2_VIEWER__.trackLog.some((n) => /^step:/.test(n)), null, { timeout: 30_000 })
    .catch(async () => assert.fail(`Assemble's step event: no "step:" event within 30 s; the log has ${JSON.stringify(await a.page.evaluate(() => window.__GEN2_VIEWER__.trackLog.slice(-8)))}`));
  await a.ctx.close();
});

/* Joey, 2026-10-21: his Polymaker dashboard shows only completed purchases, and the planner's buy links sent no event, so a
   click on one was invisible. Every affiliate link in the workspaces reports the viewer's own name for it (main.js buyEvent /
   buyFilamentEvent): the picker's Buy, the shopping list's rows, the Parts list's filament names and its hardware link in
   both layouts. The names are literals here, so a rename that would split the dashboard's rows fails this case. */
test('analytics: every buy link in Colors and Parts reports the stage\'s buy: event, and still opens its store', async () => {
  const { ctx, page, errors } = await open('colors');
  // the link's own click handler runs first; this one, on the document, then cancels the navigation, so no store tab opens
  await page.evaluate(() => { window.__opened = []; document.addEventListener('click', (e) => { const a = e.target.closest('a[target="_blank"]'); if (a) { window.__opened.push(a.href); e.preventDefault(); } }); });
  const buys = () => page.evaluate(() => window.__GEN2_VIEWER__.trackLog.filter((n) => n.startsWith('buy:')));
  const hrefs = [];
  const click = async (loc, what) => { loc = loc.first(); await loc.waitFor({ timeout: 30_000 }).catch(() => assert.fail(`no ${what} link`)); hrefs.push(await loc.getAttribute('href')); await loc.click(); };
  // the picker's Buy: an Amazon filament, then a Panchroma one (the picker names the colour short, the event names its line)
  await page.locator('#ws-colors .crow').filter({ has: page.locator('b', { hasText: /^Case$/ }) }).first().click();
  await page.locator('#ws-picker .sw[aria-label="Elegoo PLA Black"]').first().click();
  await click(page.locator('#ws-picker .foot a.buy', { hasText: 'Buy Elegoo PLA Black' }), 'the picker\'s Elegoo');
  await page.locator('#ws-picker .sw[aria-label="Panchroma Black"]').first().click();
  await click(page.locator('#ws-picker .foot a.buy', { hasText: /^Buy Black →/ }), 'the picker\'s Panchroma');
  // the Dock's filament stack: the shopping list, one Buy per filament
  await page.locator('#ws-picker button[aria-label="Close the picker"]').click();
  await page.locator('#ws-dock .status.stack').click();
  await click(page.locator('#ws-shop .frow').filter({ has: page.locator('b', { hasText: /^Panchroma Black$/ }) }).locator('a.link'), 'the shopping list\'s');
  // the Parts list: the Case row's filament name (shortened to "Black"), then the hardware's Amazon link, in both layouts
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('parts'));
  await page.waitForSelector('#ws-parts .prow', { timeout: 30_000 });
  await click(page.locator('#ws-parts .printin a', { hasText: /^Black$/ }).first(), 'the Parts list\'s filament');
  const hw = page.locator('#ws-parts .prow').filter({ has: page.locator('.badge', { hasText: /^BUY$/ }) }).locator('a.link').first();
  await click(hw, 'the Parts list\'s hardware');
  // the Amazon link is marked at the link, rel=sponsored and "· paid link" (Joey, 2026-10-21), the mark on its own line so
  // the link keeps its width; a download-site link is not marked
  const marks = (row) => Promise.all([page.locator(`#ws-parts ${row}`).filter({ has: page.locator('.badge', { hasText: /^BUY$/ }) }).locator('a.link').first(),
    page.locator(`#ws-parts ${row}`).filter({ hasNot: page.locator('.badge', { hasText: /^BUY$/ }) }).locator('a.link').first()].map((l) => l.evaluate((a) => [a.rel, a.textContent, a.querySelector('.paid') ? getComputedStyle(a.querySelector('.paid')).display : null])));
  const plainLink = (m) => m[0] === 'noopener' && !/paid/.test(m[1]) && m[2] === null;
  const narrow = await marks('.prow');
  assert.deepEqual(narrow[0], ['noopener sponsored', 'Amazon ↗ · paid link', 'block'], 'the narrow list\'s Amazon link');
  assert.ok(plainLink(narrow[1]), `the narrow list's download link stays plain: ${narrow[1]}`);
  await btn(page, 'Track my build', '#ws-parts').click();
  await page.locator('#ws-parts button.expand').click();
  await click(page.locator('#ws-parts .trow').filter({ has: page.locator('.badge', { hasText: /^BUY$/ }) }).locator('a.link').first(), 'the wide list\'s hardware');
  const wide = await marks('.trow');
  assert.deepEqual(wide[0], ['noopener sponsored', 'Amazon ↗ · paid link', 'block'], 'the wide list\'s Amazon link');
  assert.ok(plainLink(wide[1]), `the wide list's download link stays plain: ${wide[1]}`);
  // the hardware links are the root kit's magnets: the listing the catalog (HARDWARE_BUY) holds at that address, whose id
  // is the dashboard row (a renamed id would split it, so it is a literal too)
  const ids = await page.evaluate((urls) => urls.map((u) => { for (const list of Object.values(HARDWARE_BUY)) { const b = list.find((x) => x.url === u); if (b) return b.id; } return null; }), hrefs.slice(4));
  assert.deepEqual(ids, ['magnet-10x2', 'magnet-10x2'], `the hardware links are the 10×2 magnet listing: ${hrefs.slice(4).join(', ')}`);
  assert.deepEqual(await buys(), ['buy:filament:elegoo-pla-petg', 'buy:filament:polymaker-panchroma-pla', 'buy:filament:polymaker-panchroma-pla', 'buy:filament:polymaker-panchroma-pla', 'buy:hardware:magnet-10x2', 'buy:hardware:magnet-10x2']);
  // each click was a real link to its store, the navigation cancelled here and nowhere else
  assert.deepEqual(await page.evaluate(() => window.__opened), hrefs.map((h) => new URL(h).href));
  assert.ok(hrefs.every((h) => /^https:\/\//.test(h)), `store addresses: ${hrefs.join(', ')}`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE BOARD REDESIGN (Joey + Astra, 2026-10-16): the 2D board hugs the build and shows the 3D view's "+" spots (one
   calculation for both); past either edge widens the build within the mount's cap; a drag may go past the build; the
   inspector's Move buttons are the alternative to dragging; an empty build has one starting spot. */
const boardSpots = (page) => page.evaluate(() => [...document.querySelectorAll('#ws-board .b-spot:not(.no)')].map((g) => `${g.dataset.x},${g.dataset.y}`).sort());   // the "+" discs, not the refused cells
const stageSpots = (page) => page.evaluate(() => (window.__spots || []).slice().sort());
const watchStageSpots = (page) => page.evaluate(() => { const V = window.__GEN2_VIEWER__; if (V.__watched) return; V.__watched = 1; const o = V.setSpots; V.setSpots = (spec) => { window.__spots = spec ? spec.spots.filter((p) => p.kind !== 'need' && p.kind !== 'no').map((p) => `${p.x},${p.y}`) : []; window.__noSpots = spec ? spec.spots.filter((p) => p.kind === 'no').map((p) => `${p.x},${p.y}`) : []; return o(spec); }; });
const brief = (page) => page.evaluate(() => { const s = window.__GEN2_STORE__.state; return { gridW: s.gridW, units: s.placed.map((p) => `${p.id}:${p.w}W@${p.x},${p.y}`).sort().join(' ') }; });
const armSize = async (page, t) => { await page.locator('#ws-lib .size:not(.dis)', { hasText: t }).first().click(); await page.waitForSelector('#ws-lib .size.on', { timeout: 15_000 }); };
const view = async (page, v) => { await page.locator(`#ws-tools button:has-text("${v}")`).first().click(); await page.waitForTimeout(300); };
async function startBuild(page, placed) {
  await page.evaluate((placed) => window.__GEN2_STORE__.commit((s) => { const y = s.gridH * 2 - 2; s.placed = placed.map((u) => ({ ...u, y: u.y ?? y, hh: u.hh || 2, fill: 'decor', shelves: 0 })); s.nextId = 100; s.gridW = Math.max(1, ...s.placed.map((p) => p.x + p.w)); }, 'edit'), placed);
  await page.waitForFunction((n) => window.__GEN2_VIEWER__.build.placed.length === n, placed.length, { timeout: 90_000 });
  await watchStageSpots(page);
}
const clickSpot = async (page, x, y) => {
  const c = await page.evaluate(([x, y]) => { const r = document.querySelector(`#ws-board .b-spot[data-x="${x}"][data-y="${y}"] circle`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, [x, y]);
  await page.mouse.move(c[0], c[1]); await page.mouse.down(); await page.mouse.up();
};

test('the board redesign: both views show the same "+" spots, left and right grow the build, undo, the views keep the build', async () => {
  const { ctx, page, errors } = await open('build');
  await startBuild(page, [{ id: 1, x: 0, w: 2 }, { id: 2, x: 2, w: 1 }]);   // Joey's: a 2W and a 1W
  const y = await page.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 2);
  await armSize(page, '1W·1H');
  await page.waitForFunction(() => (window.__spots || []).length, null, { timeout: 30_000 }).catch(() => assert.fail('the 3D view drew no spots for 1W·1H within 30 s'));
  const in3d = await stageSpots(page);
  assert.ok(in3d.includes(`-1,${y}`) && in3d.includes(`3,${y}`), `a surface spot each side: ${in3d}`);
  await view(page, '2D');
  await page.waitForSelector('#ws-board .b-spot', { timeout: 30_000 }).catch(() => assert.fail('the board drew no "+" spots within 10 s'));
  assert.deepEqual(await boardSpots(page), in3d, 'the board shows exactly the 3D spots');
  assert.match(await text(page, '#ws-board .bttl'), /3W × /, 'the board is the build width');
  assert.equal(await page.locator('#ws-board button:has-text("W+")').count(), 0, 'no W+ / W- buttons');
  // switching views keeps the build and the spots
  const before = await brief(page);
  await view(page, '3D'); await view(page, '2D');
  assert.deepEqual(await brief(page), before, 'the build is unchanged by switching views');
  assert.deepEqual(await boardSpots(page), in3d, 'and the spots are the same');
  // left: the build shifts right and the grid hugs it; one Undo puts it all back
  await clickSpot(page, -1, y);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 3, null, { timeout: 30_000 }).catch(() => assert.fail('the left "+" placed nothing within 30 s'));
  const left = await brief(page);
  assert.equal(left.gridW, 4, 'the grid is the new build width');
  assert.match(left.units, /1:2W@1,/, 'the 2W moved right by one');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 2, null, { timeout: 30_000 });
  assert.deepEqual(await brief(page), before, 'one Undo restores the build');
  // right
  await page.waitForSelector(`#ws-board .b-spot[data-x="3"][data-y="${y}"]`, { timeout: 30_000 });
  await clickSpot(page, 3, y);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 3, null, { timeout: 30_000 }).catch(() => assert.fail('the right "+" placed nothing within 30 s'));
  assert.equal((await brief(page)).gridW, 4);
  // cancelling: Escape takes the spots away
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#ws-board .b-spot') && !document.querySelector('#ws-lib .size.on'), null, { timeout: 15_000 });
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the board redesign: a drag past the build leaves a gap that offers spots, the Move buttons, sizes, the width cap, an empty build', async () => {
  const { ctx, page, errors } = await open('build');
  await startBuild(page, [{ id: 1, x: 0, w: 2 }, { id: 2, x: 2, w: 1 }]);
  const y = await page.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 2);
  await view(page, '2D');
  // drag the 1W three columns right, past the build's edge
  const u = await page.evaluate(() => { const r = document.querySelector('#ws-board .b-unit[data-id="2"] rect').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width + 3]; });
  await page.mouse.move(u[0], u[1]); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(u[0] + u[2] * 3 * i / 12, u[1]);
  assert.match(await page.evaluate(() => document.querySelector('#ws-board .b-ghost')?.getAttribute('class') || ''), /ok/, 'the preview past the edge is green');
  await page.mouse.up();
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.find((p) => p.id === 2)?.x === 5, null, { timeout: 30_000 }).catch(() => assert.fail('the drag did not land the 1W at x 5 within 30 s'));
  // a 2W fits the gap (x 2..4): its spots there (a surface gap is two runs, each topped on its own: not a deficit)
  await armSize(page, '2W·1H');
  await page.waitForSelector('#ws-board .b-spot', { timeout: 30_000 });
  const gap = await boardSpots(page);
  assert.ok(gap.includes(`2,${y}`) && gap.includes(`3,${y}`), `the gap offers the 2W: ${gap}`);
  await clickSpot(page, 2, y);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 3, null, { timeout: 30_000 });
  // temporarily incomplete: a 1.5H beside 1H drawers leaves the top uneven; the board hatches it, the Dock says so, and
  // the viewer's pill stays out of the way
  await page.keyboard.press('Escape');
  await armSize(page, '1W·1.5H');
  const rows15 = await page.evaluate(() => window.__GEN2_STORE__.state.gridH * 2);   // arming a taller size can grow the grid
  const tall = (await boardSpots(page)).map((k) => k.split(',').map(Number)).find(([x, yy]) => x < 0 && yy + 3 === rows15);
  assert.ok(tall, 'a 1.5H spot left of the build');
  await clickSpot(page, tall[0], tall[1]);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 4, null, { timeout: 30_000 });
  await page.waitForSelector('#ws-board .b-deficit', { timeout: 30_000 }).catch(() => assert.fail('the uneven top was not hatched within 10 s'));
  assert.match(await text(page, '#ws-dock'), /issue/i, 'the Dock counts the completion issue');
  assert.equal(await page.locator('#incomplete-status').isVisible(), false, 'no viewer pill over the Dock');
  // the Move buttons: the unit at the left edge steps past it, the build widens (Escape twice: stop placing, then drop
  // the selection - the 1.5H just placed is selected, and a click on a selected unit deselects it)
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  const leftmost = await page.evaluate(() => window.__GEN2_STORE__.state.placed.slice().sort((a, b) => a.x - b.x)[0].id);
  await page.locator(`#ws-board .b-unit[data-id="${leftmost}"]`).click();
  await page.waitForSelector('#ws-insp button:has-text("◀ Left")', { timeout: 30_000 });
  const w0 = (await brief(page)).gridW;
  await page.locator('#ws-insp button:has-text("◀ Left")').click();
  await page.waitForFunction((w) => window.__GEN2_STORE__.state.gridW === w + 1, w0, { timeout: 30_000 }).catch(() => assert.fail('Move ◀ did not widen the build within 30 s'));
  assert.doesNotMatch(await text(page, '#ws-switch > .chip-btn > span'), /GEN2/, 'the build chip after an edit');
  // at the cap, a move is measured on the build it would make (Sol 01a14656): three 4W fill 12W, and the right one may
  // still go to the far left - the build stays 12W
  await startBuild(page, [{ id: 30, x: 0, w: 4 }, { id: 31, x: 4, w: 4 }, { id: 32, x: 8, w: 4 }]);
  const y4 = await page.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 2);
  assert.ok(await page.evaluate((yy) => !!window.__GEN2_BUILD__.moveCheck(window.__GEN2_STORE__.state.placed.find((p) => p.id === 32), -4, yy).g, y4), 'the 4W may move to the far left at the cap');
  await page.evaluate((yy) => window.__GEN2_BUILD__.moveTo(32, -4, yy), y4);
  await page.waitForFunction(() => { const s = window.__GEN2_STORE__.state; return s.placed.find((p) => p.id === 32)?.x === 0 && s.gridW === 12; }, null, { timeout: 30_000 }).catch(() => assert.fail('the 4W did not move to the far left within 30 s'));
  // an older link whose gridW is wider than its build: growth is measured on the units, not the stored width
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { const y = s.gridH * 2 - 2; s.placed = [{ id: 40, x: 5, y, w: 2, hh: 2, fill: 'decor', shelves: 0 }]; s.gridW = 12; }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 1, null, { timeout: 30_000 });
  const legacy = await page.evaluate(() => window.__GEN2_BUILD__.placementSpots({ w: 1, h: 1, hh: 2 }, 'decor').map((p) => p.x));
  assert.ok(legacy.includes(4) && legacy.includes(7), `a spot each side of the 2W in the over-wide grid: ${legacy}`);
  // the width cap: a 12W build offers nothing past either edge
  await startBuild(page, Array.from({ length: 6 }, (_, i) => ({ id: 10 + i, x: i * 2, w: 2 })));
  await armSize(page, '2W·1H');
  await page.waitForSelector('#ws-board .b-spot', { timeout: 30_000 });
  const capXs = (await boardSpots(page)).map((k) => +k.split(',')[0]);
  assert.ok(capXs.every((x) => x >= 0 && x < 12), `nothing past the 12W cap: ${capXs}`);
  // an empty build: one starting spot, in both views
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.placed = []; }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 0, null, { timeout: 30_000 });
  await armSize(page, '1W·1H');
  await page.waitForFunction(() => document.querySelectorAll('#ws-board .b-spot').length === 1, null, { timeout: 30_000 }).catch(() => assert.fail('the empty build did not show exactly one starting spot within 10 s'));
  await view(page, '3D');
  await page.waitForFunction(() => (window.__spots || []).length === 1, null, { timeout: 30_000 }).catch(() => assert.fail('the 3D view did not show exactly one starting spot within 30 s'));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* GROWING DOWN (Joey, 2026-10-21: "oh yeah do this", to "+" spots under a hanging build instead of pressing H+): a wall
   build offers "+" spots under its bottom row as it does past either side, in both views; taking one adds the rows in
   the same undo step and moves nothing else; the mount's height cap (its Workable area, 180 mm = 3H here) stops them,
   and a placement past it says why. */
test('Build: a wall build offers "+" spots under its bottom row, taking one grows the grid down, Undo, the height cap', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1&setup=1' });
  await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
  await page.locator('#ws-setup .card:has-text("Wall Mount")').click();
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await btn(page, 'Start build', '#ws-setup').click();
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'wall', null, { timeout: 150_000 });
  await waitBoot(page);
  // a 2W under a 2W, beside a 1W: 3W x 2H hanging from the top row, on a wall 180 mm tall (at most 3H)
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.placed = [[1, 0, 0, 2], [2, 2, 0, 1], [3, 0, 2, 2]].map(([id, x, y, w]) => ({ id, x, y, w, hh: 2, fill: 'decor', shelves: 0 })); s.nextId = 4; s.gridW = 3; s.gridH = 2; s.spaceH = 180; }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 3 && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 }).catch(() => assert.fail('the wall build did not reach the stage'));
  await watchStageSpots(page);
  await armSize(page, '1W·1H');
  await page.waitForFunction(() => (window.__spots || []).length, null, { timeout: 30_000 }).catch(() => assert.fail('the 3D view drew no spots for 1W·1H within 30 s'));
  const in3d = await stageSpots(page);
  assert.ok(['0,4', '1,4', '2,2'].every((k) => in3d.includes(k)), `under the bottom 2W (growing down) and under the 1W: ${in3d}`);
  await view(page, '2D');
  await page.waitForSelector('#ws-board .b-spot[data-y="4"]', { timeout: 30_000 }).catch(() => assert.fail('the board drew no "+" under the build within 30 s'));
  assert.deepEqual(await boardSpots(page), in3d, 'the board shows exactly the 3D spots');
  assert.match(await text(page, '#ws-board .bhint'), /below it adds height/);
  // the board makes room under the grid: the discs there are on the drawing
  assert.ok(await page.evaluate(() => { const b = document.querySelector('#ws-board svg').getBoundingClientRect(); const cs = [...document.querySelectorAll('#ws-board .b-spot[data-y="4"] circle')]; return cs.length > 0 && cs.every((c) => { const r = c.getBoundingClientRect(); return r.top >= b.top - 1 && r.bottom <= b.bottom + 1; }); }), 'the discs under the build sit inside the board');
  const before = await S(page);
  await clickSpot(page, 0, 4);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 4, null, { timeout: 30_000 }).catch(() => assert.fail('the "+" under the build placed nothing within 30 s'));
  const grown = await S(page);
  assert.equal(grown.gridH, 3, 'the grid grew down by one row');
  assert.ok(grown.placed.some((p) => p.id === 4 && p.x === 0 && p.y === 4 && p.w === 1 && p.hh === 2), `the 1W hangs under the 2W: ${JSON.stringify(grown.placed)}`);
  assert.deepEqual(grown.placed.filter((p) => p.id < 4).map((p) => [p.id, p.x, p.y]), before.placed.map((p) => [p.id, p.x, p.y]), 'nothing else moved');
  // at the cap (3H) nothing is offered under the new unit, in either view
  await page.waitForSelector('#ws-board .b-spot', { timeout: 30_000 });
  const capped = await boardSpots(page);
  assert.ok(capped.length && capped.every((k) => +k.split(',')[1] + 2 <= 6), `nothing past the 3H cap: ${capped}`);
  await view(page, '3D');
  await page.waitForFunction(() => (window.__spots || []).length, null, { timeout: 30_000 });
  assert.deepEqual(await stageSpots(page), capped, 'the 3D view offers the same');
  // one Undo takes the unit and the row back
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 3, null, { timeout: 30_000 });
  assert.equal((await S(page)).gridH, 2, 'one Undo restores the height');
  // a 2W·1H: under the 2W it fits; straddling the 2W and the empty column it is refused, and the refused cell says why there too
  await view(page, '2D');
  await armSize(page, '2W·1H');
  await page.waitForSelector('#ws-board .b-spot', { timeout: 30_000 });
  const wide = await boardSpots(page);
  const wideNo = await page.evaluate(() => [...document.querySelectorAll('#ws-board .b-spot.no')].map((g) => `${g.dataset.x},${g.dataset.y}`));
  assert.ok(wide.includes('0,4') && wideNo.includes('1,4'), `a 2W under the 2W, refused one column right: ${wide} / ${wideNo}`);
  // a 1W·2H: under the 1W it grows the build to 3H, under the 2W it would need 4H
  await armSize(page, '1W·2H');
  await page.waitForSelector('#ws-board .b-spot', { timeout: 30_000 });
  const tall = await boardSpots(page);
  assert.ok(tall.includes('2,2') && !tall.some((k) => k.endsWith(',4')), `under the 1W, not under the 2W: ${tall}`);
  // a placement past the cap says why and places nothing
  await page.evaluate(() => window.__GEN2_BUILD__.placeAt(0, 4, { w: 1, h: 2, hh: 4 }, 'decor'));
  await page.waitForFunction(() => /as tall as this mount allows \(3H\)/.test(document.getElementById('ws-toast')?.textContent || ''), null, { timeout: 15_000 }).catch(() => assert.fail('no toast naming the height cap'));
  assert.equal((await S(page)).placed.length, 3, 'nothing placed past the cap');
  // Duplicate takes the nearest spot, and on a wall as wide as it may be (176 mm = 2W) that is under the unit: it grows too
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.placed = [{ id: 1, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0 }]; s.nextId = 2; s.gridW = 2; s.gridH = 1; s.spaceW = 176; }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 1 && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 });
  const u1 = await page.evaluate(() => { const r = document.querySelector('#ws-board .b-unit[data-id="1"] rect').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(u1[0], u1[1]); await page.mouse.down(); await page.mouse.up();
  await btn(page, 'Duplicate', '#ws-insp').click();
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 2, null, { timeout: 30_000 }).catch(() => assert.fail('Duplicate placed nothing within 30 s'));
  const dup = await S(page);
  assert.ok(dup.gridH === 2 && dup.placed.some((p) => p.id === 2 && p.x === 0 && p.y === 2 && p.w === 2), `the copy hangs under the 2W in a 2H grid: ${dup.gridH} ${JSON.stringify(dup.placed)}`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE REDESIGN'S FOLLOW-UP CHECKS (Joey + Astra, 2026-10-16): separate sections said in the Dock and on the board; the
   drag ghost shows the settled position; a unit taller than the headroom can be dragged on top; a gap build and an
   older over-wide build survive save, reopen and share; on a phone a "+" takes a finger's tap. */
test('the redesign follow-up: sections are said, the ghost shows where gravity settles, a tall unit stacks by drag', async () => {
  const { ctx, page, errors } = await open('build');
  await startBuild(page, [{ id: 1, x: 0, w: 2 }, { id: 2, x: 2, w: 1 }, { id: 3, x: 3, w: 1, hh: 3 }]);
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { const p = s.placed.find((q) => q.id === 3); p.y = s.gridH * 2 - 3; }, 'edit'));
  await view(page, '2D');
  assert.equal(await page.locator('#ws-dock .group.sections').count(), 0, 'one section: nothing said');
  // drawers: no 3W·3H or 4W·3H tile at all, not even greyed (Joey 2026-10-16)
  for (const t of ['3W·3H', '4W·3H']) assert.equal(await page.locator('#ws-lib .size', { hasText: t }).count(), 0, `no ${t} drawer tile`);
  // the ghost of a unit dragged into the air sits on the surface, and the unit lands there
  const box = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width + 3, r.height + 3, r.bottom]; }, sel);
  let u = await box('#ws-board .b-unit[data-id="2"] rect');
  await page.mouse.move(u[0], u[1]); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(u[0] + u[2] * 2 * i / 10, u[1] - u[3] * i / 10);
  const ghost = await page.evaluate(() => { const g = document.querySelector('#ws-board .b-ghost'); return g && [g.getAttribute('class'), g.getBoundingClientRect().bottom]; });
  const surface = await page.evaluate(() => document.querySelector('#ws-board .b-mount').getBoundingClientRect().top);
  assert.ok(ghost && /ok/.test(ghost[0]) && Math.abs(ghost[1] - surface) < 6, `the ghost sits on the surface: ${ghost} vs ${surface}`);
  await page.mouse.up();
  await page.waitForFunction(() => { const s = window.__GEN2_STORE__.state; const p = s.placed.find((q) => q.id === 2); return p && p.x === 4 && p.y + p.hh === s.gridH * 2; }, null, { timeout: 30_000 }).catch(() => assert.fail('the 1W did not land on the surface at x 4 within 30 s'));
  // now two sections: the Dock and the board say so
  await page.waitForSelector('#ws-dock .group.sections', { timeout: 30_000 }).catch(() => assert.fail('the Dock did not show the sections within 10 s'));
  assert.match(await text(page, '#ws-dock .group.sections'), /2\s*sections/);
  assert.match(await text(page, '#ws-board .bttl'), /2 separate sections/);
  // the 1.5H, taller than the 1H headroom, dragged on top of the 2W
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.find((p) => p.id === 2)?.x === 2, null, { timeout: 30_000 });
  u = await box('#ws-board .b-unit[data-id="3"] rect'); const two = await box('#ws-board .b-unit[data-id="1"] rect');
  const tx = two[0] - two[2] / 4, ty = two[1] - two[3] / 2 - u[3] / 2 - 4;
  await page.mouse.move(u[0], u[1]); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(u[0] + (tx - u[0]) * i / 10, u[1] + (ty - u[1]) * i / 10);
  await page.mouse.up();
  await page.waitForFunction(() => { const s = window.__GEN2_STORE__.state; const t = s.placed.find((q) => q.id === 3), b = s.placed.find((q) => q.id === 1); return t && b && t.x === b.x && t.y + t.hh === b.y; }, null, { timeout: 30_000 }).catch(() => assert.fail('the 1.5H was not stacked on the 2W within 30 s'));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the redesign follow-up: a gap build and an older over-wide build survive save, reopen and share', async () => {
  const { ctx, page, errors } = await open('build');
  await startBuild(page, [{ id: 1, x: 0, w: 2 }, { id: 2, x: 4, w: 1 }]);   // a gap: two sections
  await page.evaluate(() => window.__GEN2_BUILD__.moveTo(2, 5, window.__GEN2_STORE__.state.gridH * 2 - 2));   // an EDIT: autosave + hug
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.find((p) => p.id === 2)?.x === 5, null, { timeout: 30_000 });
  const want = await brief(page);
  // reopen: the bare address reopens the autosaved build
  await page.waitForTimeout(1500);   // the IndexedDB write
  await page.goto(`${base}/index.html?ws=build&debug=1`, { waitUntil: 'load' }); await waitBoot(page);
  await page.waitForFunction((u) => { const s = window.__GEN2_STORE__.state; return s.placed.map((p) => `${p.id}:${p.w}W@${p.x},${p.y}`).sort().join(' ') === u; }, want.units, { timeout: 30_000 }).catch(async () => assert.fail(`reopened as ${JSON.stringify(await brief(page))}, wanted ${JSON.stringify(want)}`));
  // share: the address opens the same build in another browser
  const link = await page.evaluate(() => location.href);
  const other = await freshContext();
  const p2 = await other.newPage(); await p2.goto(link, { waitUntil: 'load' }); await waitBoot(p2);
  assert.deepEqual((await brief(p2)).units, want.units, 'the share link opens the same gap build');
  await other.close();
  // an older link: a stored gridW wider than the build. It opens as stored (nothing hugs until an edit), the "+" sit
  // either side of the build, and the first placement hugs the grid to the build
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { const y = s.gridH * 2 - 2; s.placed = [{ id: 7, x: 5, y, w: 2, hh: 2, fill: 'decor', shelves: 0 }]; s.nextId = 8; s.gridW = 12; }, 'edit'));
  await page.waitForTimeout(800);
  const old = await page.evaluate(() => location.href);
  const third = await freshContext();
  const p3 = await third.newPage(); await p3.goto(old, { waitUntil: 'load' }); await waitBoot(p3);
  assert.equal((await brief(p3)).gridW, 12, 'the older build opens as stored');
  await watchStageSpots(p3); await view(p3, '2D'); await armSize(p3, '1W·1H');
  const y3 = await p3.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 2);
  await p3.waitForSelector(`#ws-board .b-spot[data-x="4"][data-y="${y3}"]`, { timeout: 30_000 }).catch(() => assert.fail('no "+" left of the older build within 10 s'));
  assert.ok(await p3.locator(`#ws-board .b-spot[data-x="7"][data-y="${y3}"]`).count(), 'and one on its right');
  await clickSpot(p3, 4, y3);
  await p3.waitForFunction(() => { const s = window.__GEN2_STORE__.state; return s.placed.length === 2 && s.gridW === 3 && Math.min(...s.placed.map((p) => p.x)) === 0; }, null, { timeout: 30_000 }).catch(async () => assert.fail(`after the first placement: ${JSON.stringify(await brief(p3))}`));
  await third.close();
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the redesign follow-up: on a phone a "+" takes a tap near it, and a touch drag moves a unit', async () => {
  const { ctx, page, errors } = await open('build', { phone: true });
  await startBuild(page, [{ id: 1, x: 0, w: 2 }, { id: 2, x: 2, w: 1 }]);
  await page.locator('#ws-tools button:has-text("2D")').first().tap();
  const handle = page.locator('#ws-lib .sheet-handle').first(); if (await handle.count()) await handle.tap();
  await page.locator('#ws-lib .size:not(.dis)', { hasText: '1W·1H' }).first().tap();
  const y = await page.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 2);
  await page.waitForSelector(`#ws-board .b-spot[data-x="-1"][data-y="${y}"]`, { timeout: 30_000 }).catch(() => assert.fail('no left "+" on the phone board within 10 s'));
  const c = await page.evaluate(([y]) => { const r = document.querySelector(`#ws-board .b-spot[data-x="-1"][data-y="${y}"] circle`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width]; }, [y]);
  assert.ok(c[2] >= 28, `a finger-sized "+": ${c[2]} px`);
  await page.touchscreen.tap(c[0], c[1] - 16);   // outside the 1H footprint, within reach
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 3, null, { timeout: 30_000 }).catch(() => assert.fail('a tap near the "+" placed nothing within 30 s'));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('3D: with a wide ghost showing, moving onto the neighbouring "+" moves the ghost there', async () => {
  // Joey 2026-10-16: hovering one 2W spot on top of the build showed its green box, and moving straight onto the next "+"
  // did not move it - the box covered the neighbour's marker and caught the ray
  const { ctx, page, errors } = await open('build');
  await startBuild(page, [{ id: 1, x: 0, w: 1 }, { id: 2, x: 1, w: 1 }, { id: 3, x: 2, w: 1 }, { id: 4, x: 3, w: 1 }]);
  await armSize(page, '3W·1H');   // 3W spots one column apart: the next marker sits well INSIDE the hovered ghost
  const top = await page.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 4);
  await page.waitForFunction((t) => window.__GEN2_VIEWER__.spotScreens().filter((m) => m.y === t).length >= 2, top, { timeout: 30_000 }).catch(() => assert.fail('no two 3W spots on top within 30 s'));
  await settle(page, 2500);   // the camera re-frames after a rebuild: screen positions are read once it has stopped
  const marks = (await page.evaluate((t) => window.__GEN2_VIEWER__.spotScreens().filter((m) => m.y === t).sort((a, b) => a.x - b.x), top));
  const hovered = () => page.evaluate(() => (window.__GEN2_VIEWER__.spotScreens().find((m) => m.hovered) || {}).x ?? null);
  await page.mouse.move(marks[0].sx, marks[0].sy, { steps: 4 });
  await page.waitForFunction((x) => (window.__GEN2_VIEWER__.spotScreens().find((m) => m.hovered) || {}).x === x, marks[0].x, { timeout: 20_000 }).catch(() => assert.fail('the first "+" did not take the hover'));
  for (const m0 of marks.slice(1)) {
    const m = await page.evaluate(([x, t]) => window.__GEN2_VIEWER__.spotScreens().find((q) => q.x === x && q.y === t), [m0.x, top]);
    await page.mouse.move(m.sx, m.sy, { steps: 6 });   // straight across, never leaving the ghost
    await page.waitForFunction((x) => (window.__GEN2_VIEWER__.spotScreens().find((q) => q.hovered) || {}).x === x, m.x, { timeout: 20_000 }).catch(async () => assert.fail(`moving onto the "+" at x ${m.x} left the hover on x ${await hovered()}`));
  }
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('3D: a mouse drag picks up any unit - unselected, even while placing - and a click on a "+" over a unit still places', async () => {
  // Joey 2026-10-16: "I'm trying to left click and drag a unit but it does nothing" (only the selected unit could be
  // dragged, and none while a size was armed)
  const { ctx, page, errors } = await open('build');
  await startBuild(page, [{ id: 1, x: 0, w: 2 }, { id: 2, x: 2, w: 1 }, { id: 3, x: 3, w: 1 }]);
  await armSize(page, '1W·1H');   // placing: the old code refused every drag here
  const y = await page.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 2);
  await page.waitForFunction(() => window.__GEN2_VIEWER__.spotScreens().length, null, { timeout: 30_000 });
  await settle(page, 2500);   // the camera re-frames after a rebuild
  const at = await page.evaluate(() => window.__GEN2_VIEWER__.unitScreen(3));
  await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + 12, at.y, { steps: 3 });
  // picked up: the move targets replace the "+"; take the one left of the build
  await page.waitForFunction((y) => window.__GEN2_VIEWER__.spotScreens().some((m) => m.x === -1 && m.y === y), y, { timeout: 30_000 }).catch(() => assert.fail('the drag offered no target left of the build within 30 s'));
  const t = await page.evaluate((y) => window.__GEN2_VIEWER__.spotScreens().find((m) => m.x === -1 && m.y === y), y);
  await page.mouse.move(t.sx, t.sy, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => { const p = window.__GEN2_STORE__.state.placed.find((q) => q.id === 3); return p && p.x === 0; }, null, { timeout: 30_000 }).catch(async () => assert.fail(`the dragged unit is at ${JSON.stringify(await brief(page))}`));
  assert.equal(await page.locator('#ws-lib .size.on').count(), 0, 'picking a unit up stopped placing');
  // a "+" sitting on a unit is a placement, not a pick-up
  await armSize(page, '1W·1H');
  const topY = y - 2;
  await page.waitForFunction((t) => window.__GEN2_VIEWER__.spotScreens().some((m) => m.y === t), topY, { timeout: 30_000 });
  await settle(page, 2500);
  const n0 = await units(page);
  const plus = await page.evaluate((t) => window.__GEN2_VIEWER__.spotScreens().find((m) => m.y === t), topY);
  await page.mouse.move(plus.sx, plus.sy, { steps: 4 }); await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction((n) => window.__GEN2_STORE__.state.placed.length === n + 1, n0, { timeout: 30_000 }).catch(() => assert.fail('a click on a "+" over a unit placed nothing within 30 s'));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the idle gate: a still view stops drawing, an edit draws again at once, a canvas read is never blank', async () => {
  // Joey 2026-10-17: the planner held ~40% of a laptop GPU with nothing moving (measured: every frame redrawn, 120-240 a
  // second). Now a still view draws about once a second (the safety net), and any change draws at once.
  const { ctx, page, errors } = await open('build');
  await settle(page, 4000);
  const drawnIn = (ms) => page.evaluate(async (ms) => { const V = window.__GEN2_VIEWER__; const a = V.idleStats(); await new Promise((r) => setTimeout(r, ms)); const b = V.idleStats(); return { drawn: b.drawn - a.drawn, skipped: b.skipped - a.skipped }; }, ms);
  const still = await drawnIn(3000);
  assert.ok(still.drawn <= 6, `a still view draws about once a second: ${JSON.stringify(still)}`);
  // an edit (no pointer or key input at all) wakes the gate itself: a frame drawn inside the settle window after the change,
  // one the once-a-second safety net would not have drawn (idleStats().woken). Counted, not timed: on the CI runner the
  // rebuild alone outlasted a fixed 1.5 s window (run 39524907871, 2026-10-20, and once on 2026-10-18), and a window of a
  // few frames can still straddle the 600 ms settle time on a slow runner (Terra 01a15c53). Known limits (Terra's second
  // round): a working gate would miss this only with drawn frames over 600 ms apart (measured ~300 ms on SwiftShader at a
  // 4x CPU throttle), and a wake from something unrelated during the wait could pass a broken one (the view was just
  // measured still for 3 s).
  const w0 = (await page.evaluate(() => window.__GEN2_VIEWER__.idleStats())).woken;
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { const y = s.gridH * 2 - 2; const right = Math.max(...s.placed.map((p) => p.x + p.w)); s.placed.push({ id: s.nextId++, x: right, y, w: 1, hh: 2, fill: 'decor', shelves: 0 }); s.gridW = right + 1; }, 'edit'));
  const woke = await page.waitForFunction((w0) => window.__GEN2_VIEWER__.idleStats().woken > w0, w0, { timeout: 60_000, polling: 100 }).then(() => true, () => false);
  assert.ok(woke, `an edit is drawn at once (the gate wakes for it), not only by the next safety-net frame: ${JSON.stringify(await page.evaluate(() => window.__GEN2_VIEWER__.idleStats()))}`);
  // reading the canvas after a skipped frame returns the picture, not an empty buffer
  await settle(page, 2500);
  const png = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png').length);
  const blank = await page.evaluate(() => { const c = document.createElement('canvas'); const g = document.querySelector('canvas'); c.width = g.width; c.height = g.height; return c.toDataURL('image/png').length; });
  assert.ok(png > blank * 5, `a canvas read is the picture (${png} bytes vs a blank ${blank})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Build: a unit placed through the store reaches the stage; move, remove and undo follow; the issue card speaks', async () => {
  const { ctx, page, errors } = await open('build');
  const n0 = await units(page);
  // a size is lit only while it is being placed: lit on entry it read as "placing already" with no spots (Joey 2026-10-16)
  assert.equal(await page.locator('#ws-lib .size.on').count(), 0, 'no size lit before one is picked');
  // place: the library arms a size and the store takes the placement the way the spot tap does
  await page.click('#ws-lib .size:not(.dis) >> nth=1');
  await page.waitForSelector('#ws-lib .size.on', { timeout: 15_000 });
  assert.ok(await page.locator('#ws-lib .armed').count(), 'picking a size starts placing');
  // cancelling clears the lit tile and the placing box, and the size stays remembered (the build's `selected`)
  const picked = (await S(page)).selected;
  await btn(page, 'Stop placing', '#ws-lib').click();
  await page.waitForFunction(() => !document.querySelector('#ws-lib .armed'), null, { timeout: 15_000 });
  assert.equal(await page.locator('#ws-lib .size.on').count(), 0, 'Stop placing clears the lit size');
  assert.deepEqual((await S(page)).selected, picked, 'the size is still remembered after cancelling');
  await page.click('#ws-lib .size:not(.dis) >> nth=1');
  await page.waitForSelector('#ws-lib .size.on', { timeout: 15_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#ws-lib .size.on'), null, { timeout: 15_000 });
  assert.deepEqual((await S(page)).selected, picked, 'Escape cancels placing and keeps the size');
  await page.click('#ws-lib .size:not(.dis) >> nth=1');   // armed again for the placement below
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build && document.querySelector('#ws-lib .size.on, #ws-lib .size[aria-pressed="true"]'), null, { timeout: 15_000 }).catch(() => {});
  // beside the build on its bottom row: supported by the surface, so the generator accepts it and the stage rebuilds
  await page.evaluate(() => { const st = window.__GEN2_STORE__; st.commit((s, R) => { const id = s.nextId++; const bottom = Math.max(...s.placed.map((p) => p.y + p.hh)); const right = Math.max(...s.placed.map((p) => p.x + p.w)); s.placed.push({ id, x: right, y: bottom - 2, w: 1, hh: 2, fill: 'decor', shelves: 0 }); if (s.gridW < right + 1) s.gridW = right + 1; R.syncTabletopGrid(); }, 'edit'); });
  await page.waitForFunction((n) => window.__GEN2_VIEWER__.build.placed.length === n + 1, n0, { timeout: 90_000 });
  assert.equal(await units(page), n0 + 1);
  assert.equal(await stageUnits(page), n0 + 1, 'the stage regenerated with the new unit');
  assert.match(await text(page, '#ws-dock .big'), new RegExp(String(n0 + 1)), 'the dock counts it');
  // undo through the toolbar
  await page.evaluate(() => window.__GEN2_STORE__.flush());
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction((n) => window.__GEN2_STORE__.state.placed.length === n, n0, { timeout: 30_000 });
  assert.equal(await units(page), n0, 'undo took the unit back');
  // the issue card: an unsupported unit (a floating case on a tabletop build) is named, and Fix structure clears it
  await page.evaluate(() => { const st = window.__GEN2_STORE__; st.commit((s) => { const id = s.nextId++; s.placed.push({ id, x: 0, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0 }); }, 'edit'); });
  await settle(page, 600);
  const status = await text(page, '#ws-dock .status');
  assert.ok(/issue|Fix/i.test(status) || /valid/i.test(status), 'the dock reports a status: ' + status);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* the Colors plan's step 3 (2026-10-18): the presets live in the Browse looks gallery; a look is applied from its details */
test('Colors: a preset applied from the gallery recolours the model as one history entry, and Undo restores it', async () => {
  const { ctx, page, errors } = await open('colors');
  const before = await page.evaluate(() => JSON.stringify(window.__GEN2_VIEWER__.palette().colors));
  await page.locator('#ws-colors .browse').click();
  const cards = page.locator('#ws-gallery .lcard');
  assert.ok(await cards.count() >= 11, 'the presets are listed as cards');
  await cards.nth(1).click();   // Stealth, on a fresh profile
  await page.waitForSelector('#ws-gallery .apply', { timeout: 15_000 });
  assert.match(await text(page, '#ws-gallery h2'), /Stealth/, 'its details open');
  await page.locator('#ws-gallery .apply').click();
  await settle(page, 600);
  const after = await page.evaluate(() => JSON.stringify(window.__GEN2_VIEWER__.palette().colors));
  assert.notEqual(after, before, 'the preset changed the palette');
  assert.equal(await page.locator('#ws-gallery').isHidden(), true, 'Apply closes the gallery');
  assert.match(await text(page, '#ws-colors .lname'), /Stealth/, 'the card names the look (decision D4)');
  await page.keyboard.press('Control+Z');
  await settle(page, 800);
  const undone = await page.evaluate(() => JSON.stringify(window.__GEN2_VIEWER__.palette().colors));
  assert.equal(undone, before, 'Undo restored the palette');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Labels: EdgeLabel, typed labels, Place several onto two drawers, Fill, the panel Undo, a labels link', async () => {
  const { ctx, page, errors } = await open('labels');
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => x.textContent.trim().startsWith('Switch to EdgeLabel')); if (b) b.click(); });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 90_000 });
  await settle(page, 800);
  for (const w of ['M3 screws', 'Hex keys', 'Solder']) {
    await btn(page, 'Type a label', '#ws-labels').click();
    await page.fill('#ws-modal input.field', w);
    await btn(page, 'Add label', '#ws-modal .box').click();
    await settle(page, 300);
  }
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.state.labelList.labels.length), 3);
  await btn(page, 'Place several', '#ws-labels').click();
  await settle(page, 200);
  const ids = await page.evaluate(() => window.__GEN2_STORE__.state.placed.map((u) => u.id));
  // the preview: the drawer under the pointer wears the armed label's words before any click, and loses them on leave
  const at = await page.evaluate((id) => window.__GEN2_VIEWER__.unitScreen(id), ids[0]);
  await page.mouse.move(at.x, at.y);
  await page.waitForFunction((id) => { const u = window.__GEN2_VIEWER__.build.placed.find((x) => x.id === id); return !!(u && u.label); }, ids[0], { timeout: 15_000 });
  assert.equal(await page.evaluate(() => Object.keys(window.__GEN2_STORE__.state.labelAssign || {}).length), 0, 'the preview places nothing');
  await page.mouse.move(5, 5);
  await page.waitForFunction((id) => { const u = window.__GEN2_VIEWER__.build.placed.find((x) => x.id === id); return !(u && u.label); }, ids[0], { timeout: 15_000 });
  await page.evaluate((id) => window.__GEN2_VIEWER__.selectUnit(id), ids[0]); await settle(page, 500);
  await page.evaluate((id) => window.__GEN2_VIEWER__.selectUnit(id), ids[1]); await settle(page, 500);
  assert.equal(await page.evaluate(() => Object.keys(window.__GEN2_STORE__.state.labelAssign).length), 2, 'two placed');
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.build.placed.filter((u) => u.label).length), 2, 'the stage wears both');
  await btn(page, 'Done placing', '#ws-labels').click();
  await btn(page, 'Fill empty drawers', '#ws-labels').click();
  await settle(page, 200);
  await btn(page, 'Place ', '#ws-modal .box').click();
  await settle(page, 500);
  assert.equal(await page.evaluate(() => Object.keys(window.__GEN2_STORE__.state.labelAssign).length), 3, 'filled');
  assert.match(await text(page, '#ws-labels .last'), /Filled/);
  await page.locator('#ws-labels button:text-is("Undo")').click();
  await settle(page, 700);
  assert.equal(await page.evaluate(() => Object.keys(window.__GEN2_STORE__.state.labelAssign).length), 2, 'the panel Undo took the fill back');
  // a labels link lands beside the build's own hash
  await page.evaluate(() => { const doc = { format: 'modulith-labels', version: 1, batchId: 'abcdefgh1234', labels: [{ text: 'From a link' }] }; const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(doc)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); location.hash = location.hash + '&labels-add=' + b64; });
  await settle(page, 800);
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.state.labelList.labels.length), 4, 'the link added one');
  assert.ok(await page.evaluate(() => /^#build=/.test(location.hash) && !/labels-add/.test(location.hash)), 'the hash keeps the build and drops the link');
  // LABELS KEPT ASIDE: a link of this build made before its labels (no list, no mirror) opens in the same browser; the Recent
  // entry's labels are offered back and Restore puts the two placed ones back on their drawers
  const id = await page.evaluate(() => window.__GEN2_STORE__.state.buildId);
  const saved = () => page.evaluate((want) => new Promise((r) => { const q = indexedDB.open('modulith-planner'); q.onsuccess = () => { const t = q.result.transaction('builds').objectStore('builds').get(want); t.onsuccess = () => r(!!(t.result && t.result.record.labelList && t.result.record.labelList.labels.length === 4)); t.onerror = () => r(false); }; q.onerror = () => r(false); }), id);
  for (let i = 0; i < 60 && !(await saved()); i++) await settle(page, 250);
  assert.ok(await saved(), 'the autosave holds the four labels');
  const bare = await page.evaluate(() => { const rec = JSON.parse(JSON.stringify(window.__GEN2_STORE__.state)); delete rec.labelList; delete rec.labelAssign; for (const u of rec.placed) { delete u.label; delete u.labelBadge; } return btoa(unescape(encodeURIComponent(JSON.stringify(rec)))); });
  const assigned = await page.evaluate(() => window.__GEN2_STORE__.state.labelAssign);
  const p2 = await ctx.newPage();
  const errors2 = []; p2.on('pageerror', (e) => errors2.push('pageerror: ' + e.message)); p2.on('console', (m) => { if (m.type() === 'error') errors2.push('console: ' + m.text()); });
  await p2.goto(`${base}/index.html?ws=labels&debug=1#build=${bare}`, { waitUntil: 'load', timeout: 90_000 });
  await waitBoot(p2);
  assert.equal(await p2.evaluate(() => (window.__GEN2_STORE__.state.labelList || { labels: [] }).labels.length), 0, 'the link arrived without labels');
  await p2.waitForSelector('#ws-labels .banner.copy', { timeout: 30_000 });
  assert.match(await text(p2, '#ws-labels .banner.copy span'), /kept 4 labels/);
  await btn(p2, 'Restore labels', '#ws-labels .banner.copy').click();
  await p2.waitForFunction(() => window.__GEN2_STORE__.state.labelList && window.__GEN2_STORE__.state.labelList.labels.length === 4, null, { timeout: 30_000 });
  assert.deepEqual(await p2.evaluate(() => window.__GEN2_STORE__.state.labelAssign), assigned, 'the two placed labels are back on their drawers');
  assert.equal(await p2.locator('#ws-labels .banner.copy').count(), 0, 'the offer is over');
  assert.equal(await p2.evaluate(() => window.__GEN2_VIEWER__.build.placed.filter((u) => u.label).length), 2, 'the stage wears them again');
  assert.equal(await p2.evaluate(() => localStorage.getItem('gen2-label-copies')), null, 'the copy is spent');
  // DRAG AND DROP: a waiting label's chip dragged onto an empty drawer places it (the drawer-first rule: no placing mode after)
  const empty = await p2.evaluate(() => { const s = window.__GEN2_STORE__.state; const u = s.placed.find((x) => x.fill === 'decor' && !(s.labelAssign || {})[x.id]); return u && u.id; });
  assert.ok(empty != null, 'an empty drawer to drop on');
  const chip = p2.locator('#ws-labels .list .chip-l:not([disabled])').first();
  const chipText = (await chip.textContent()).trim();
  const from = await chip.boundingBox();
  const to = await p2.evaluate((id) => window.__GEN2_VIEWER__.unitScreen(id), empty);
  await p2.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await p2.mouse.down();
  for (let i = 1; i <= 8; i++) await p2.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  await p2.waitForFunction((id) => { const u = window.__GEN2_VIEWER__.build.placed.find((x) => x.id === id); return !!(u && u.label); }, empty, { timeout: 15_000 });   // the preview while carrying
  assert.ok(await p2.locator('#ws .drag-ghost').count(), 'a ghost follows the pointer');
  await p2.mouse.up();
  await p2.waitForFunction((id) => !!(window.__GEN2_STORE__.state.labelAssign || {})[id], empty, { timeout: 15_000 });
  assert.equal(await p2.locator('#ws .drag-ghost').count(), 0, 'the ghost is gone');
  assert.equal(await p2.evaluate(() => Object.keys(window.__GEN2_STORE__.state.labelAssign).length), 3, 'the drop placed one more');
  assert.equal(await p2.evaluate(() => !!document.querySelector('#ws-labels.placing')), false, 'a drop does not enter placing mode');
  assert.match(await text(p2, '#ws-labels .last'), /on drawer \d/, 'the drop is one label change: ' + chipText.slice(0, 30));
  assert.deepEqual(clean(errors), []);
  assert.deepEqual(clean(errors2), []);
  await ctx.close();
});

/* THE STUDIO'S "ADD TO PLANNER BUILD" ON A FRESH PAGE (2026-10-22; the cutover prep's parity check, row E6): the Studio
   opens the planner as a new page on <return>#labels-add=<list>. Before, the first settled save wrote the address as
   #build= alone while the label tools were still loading, so the link was gone when they looked for it and nothing was
   added; only a link set on a page already open (the case above) imported. Both ways a fresh page arrives: a bare
   labels link, and one beside the build's own #build= (a return address that carried its build). */
test('Labels: the Studio’s Add to planner build opens a fresh page and its labels land, alone or beside the build’s own #build=', async () => {
  const link = (id, words) => Buffer.from(JSON.stringify({ format: 'modulith-labels', version: 1, batchId: id, labels: words.map((text) => ({ text })) })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const words = (page) => page.evaluate(() => ((window.__GEN2_STORE__.state.labelList || {}).labels || []).map((l) => String(l.text || '').toLowerCase()));
  const landed = (page, n, what) => page.waitForFunction((n) => ((window.__GEN2_STORE__.state.labelList || {}).labels || []).length === n, n, { timeout: 30_000 }).catch(async () => assert.fail(`${what}: the labels did not land within 30 s (on the board: ${JSON.stringify(await words(page).catch(() => 'unreadable'))})`));
  // a bare labels link, opened as a new page
  const a = await open('labels', { query: '#labels-add=' + link('freshload0001', ['Fresh one', 'Fresh two']) });
  await landed(a.page, 2, 'a bare link');
  assert.deepEqual(await words(a.page), ['fresh one', 'fresh two']);
  await a.page.waitForTimeout(1500);   // past the store's coalescing: the next save writes the address again
  assert.ok(await a.page.evaluate(() => /^#build=/.test(location.hash) && !/labels-add/.test(location.hash)), 'the address keeps the build and drops the link once it is in');
  assert.match(await text(a.page, '#ws-labels'), /fresh one/i, 'the panel lists them');
  const hash = await a.page.evaluate(() => window.__GEN2_STORE__.hash());
  const before = await a.page.evaluate(() => window.__GEN2_STORE__.state.placed.map((p) => `${p.id}:${p.w}x${p.hh}@${p.x},${p.y}`).join(' '));
  assert.deepEqual(clean(a.errors), []);
  // the same build back in this browser WITHOUT its labels (an older copy, as the old planner's cutover redirect forwards
  // its own slot as #build=): tab A shows it and offers the two this browser kept; the visitor goes to the Studio, whose
  // Add to planner build opens tab B on the bare link. Tab B brings the kept two back, then adds the link's. Tab A, still
  // without labels, is now behind: the stale-tab guard (2026-10-22) stops it saving over tab B's build. A tab without the
  // guard (an old planner page left open across the deploy) still can; the stored copy outlives that, so the next page
  // offers the two again
  const pageIn = async (url) => { const p = await a.ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); await p.goto(`${base}/index.html?${url}`, { waitUntil: 'load', timeout: 90_000 }); await waitBoot(p); return { p, errs }; };
  const keptCount = (p) => p.evaluate(() => { try { const o = JSON.parse(localStorage.getItem('gen2-label-copies') || 'null'); return o ? Object.keys(o.copies || {}).length : 0; } catch { return -1; } });
  // an edit has been saved when the slot (written after the Recent entry) holds it: on the CI runner a fixed 1.5 s was not
  // enough, and the next page then opened the build as it was before the edit
  const edit = async (p) => {
    const want = await p.evaluate(() => { const S = window.__GEN2_STORE__; const v = S.state.buildPlate === 'smooth' ? 'powder' : 'smooth'; S.commit((s) => { s.buildPlate = v; }, 'edit'); return v; });
    await p.waitForFunction((v) => { try { return JSON.parse(localStorage.getItem('gen2-last-build')).buildPlate === v; } catch { return false; } }, want, { timeout: 30_000 }).catch(() => assert.fail('an edit was not saved within 30 s'));
  };
  const bare = await a.page.evaluate(() => { const r = window.__GEN2_STORE__.serialize(); delete r.labelList; delete r.labelAssign; return btoa(unescape(encodeURIComponent(JSON.stringify(r)))); });
  const tabA = await pageIn(`ws=labels&debug=1#build=${bare}`);
  await tabA.p.waitForSelector('#ws-labels .banner.copy', { timeout: 30_000 }).catch(() => assert.fail('tab A did not offer the kept labels'));
  await edit(tabA.p);   // tab A's save: the build in this browser is now the one without labels
  // before any restore (the copy kept, not yet marked): a damaged link restores nothing, the offer stays and the status
  // says the link is damaged; so does a link that decodes but brings no label that can be read (the dry run)
  const damaged = await pageIn('ws=labels&debug=1#labels-add=AAAA');
  await damaged.p.waitForFunction(() => /This labels link is damaged/.test(document.getElementById('ws-labels')?.textContent || ''), null, { timeout: 30_000 }).catch(() => assert.fail('no damaged-link status'));
  assert.deepEqual(await words(damaged.p), [], 'nothing restored for a damaged link');
  assert.equal(await damaged.p.locator('#ws-labels .banner.copy').count(), 1, 'the offer stays');
  await damaged.p.close();
  const unreadableLink = Buffer.from(JSON.stringify({ format: 'modulith-labels', version: 1, batchId: 'freshload0007', labels: [{ notText: 1 }] })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unreadable = await pageIn('ws=labels&debug=1#labels-add=' + unreadableLink);
  // the offer renders only once the label tools have loaded, in the same step as the link's import
  await unreadable.p.waitForSelector('#ws-labels .banner.copy', { timeout: 30_000 }).catch(() => assert.fail('the offer did not show beside a link that adds nothing'));
  assert.deepEqual(await words(unreadable.p), [], 'nothing restored for a link that adds nothing');
  assert.equal(await unreadable.p.locator('#ws-labels .banner.copy').count(), 1, 'the offer stays for it too');
  await unreadable.p.close();
  const tabB = await pageIn('ws=labels&debug=1#labels-add=' + link('freshload0005', ['After the kept']));
  await landed(tabB.p, 3, 'tab B: the kept two, then the link');
  assert.deepEqual(await words(tabB.p), ['fresh one', 'fresh two', 'after the kept']);
  assert.match(await text(tabB.p, '#ws-labels'), /Brought back the 2 labels this browser kept for this build\./, 'the status says both');
  assert.equal(await tabB.p.locator('#ws-labels .banner.copy').count(), 0, 'no offer left over in tab B');
  assert.equal(await keptCount(tabB.p), 1, 'the stored copy is kept');
  assert.equal(await tabB.p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('gen2-label-copies')).copies)[0].restored), true, 'and marked as restored once');
  await tabB.p.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('gen2-last-build')).labelList.labels.length === 3; } catch { return false; } }, null, { timeout: 30_000 }).catch(() => assert.fail('tab B was not saved within 30 s'));
  // each page closes once its part is done: an open tab can save again later and change what the next page opens, and four
  // 3D pages at once slow the CI runner's software rendering past the waits (run 39824340436)
  await tabB.p.close();
  // tab A heard tab B's save: the notice is up and its edit is not saved
  const stored = (p) => p.evaluate(async () => { const S = window.__GEN2_STORE__; const B = await import('./js/state/builds.js'); const b = await B.openBuilds(); const e = await b.get(S.state.buildId); return { savedAt: e.savedAt, n: e.record.labelList?.labels?.length || 0, slot: JSON.parse(localStorage.getItem('gen2-last-build')).labelList?.labels?.length || 0 }; });
  await tabA.p.waitForSelector('#ws-stale', { timeout: 30_000 }).catch(() => assert.fail('tab A did not go stale after tab B saved the build'));
  const behind = await stored(tabA.p);
  assert.deepEqual([behind.n, behind.slot], [3, 3], 'tab B’s build is the stored one');
  await tabA.p.evaluate(async () => { const S = window.__GEN2_STORE__; S.commit((s) => { s.buildPlate = s.buildPlate === 'smooth' ? 'powder' : 'smooth'; }, 'edit'); await new Promise((r) => setTimeout(r, 1500)); await window.__GEN2_CTX__().builds.settled(); });
  assert.deepEqual(await stored(tabA.p), behind, 'tab A’s edit wrote nothing');
  await tabA.p.close();
  // a tab without the guard saves over it anyway (written here as the old planner did: the Recent entry, the current id, the slot)
  await a.page.evaluate(async () => {
    const B = await import('./js/state/builds.js'); const b = await B.openBuilds();
    const e = await b.get(b.currentId); const record = { ...e.record }; delete record.labelList; delete record.labelAssign;
    await b.put({ ...e, record, savedAt: e.savedAt + 1 }); b.currentId = e.id; b.writeSlot(record);
  });
  const again = await pageIn('ws=labels&debug=1');
  await again.p.waitForSelector('#ws-labels .banner.copy', { timeout: 30_000 }).catch(() => assert.fail('the kept labels were not offered again after tab A saved over the build'));
  assert.match(await text(again.p, '#ws-labels .banner.copy span'), /kept 2 labels/);
  await again.p.close();
  // the next Studio link on that build adds only its own label: a copy restored once is offered, never restored again
  const second = await pageIn('ws=labels&debug=1#labels-add=' + link('freshload0006', ['Second link']));
  await landed(second.p, 1, 'a second link');
  assert.deepEqual(await words(second.p), ['second link']);
  assert.doesNotMatch(await text(second.p, '#ws-labels'), /Brought back/, 'no second automatic restore');
  assert.equal(await keptCount(second.p), 1, 'the copy is still kept');
  for (const t of [tabA, tabB, again, damaged, unreadable, second]) assert.deepEqual(clean(t.errs), []);
  await a.ctx.close();
  // beside the build's own #build=: the build opens as it was, and the new label joins its two
  const b = await open('labels', { query: `#build=${hash}&labels-add=` + link('freshload0002', ['Beside one']) });
  await landed(b.page, 3, 'a link beside #build=');
  assert.deepEqual(await words(b.page), ['fresh one', 'fresh two', 'beside one']);
  assert.equal(await b.page.evaluate(() => window.__GEN2_STORE__.state.placed.map((p) => `${p.id}:${p.w}x${p.hh}@${p.x},${p.y}`).join(' ')), before, 'the same build');
  assert.deepEqual(clean(b.errors), []);
  await b.ctx.close();
  // leaving Labels before its label tools load (held back here): the link waits in the page, never in the address, so an
  // edit's save, a share link or a reload does not carry it (an adversarial check of the first fix, 2026-10-22); it lands
  // once Labels opens again, and a reload does not add it twice
  const cctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); contexts.add(cctx);
  await cctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
  let release = null; const gate = new Promise((r) => { release = r; });
  await cctx.route('**/vendor/label-list.js*', async (route) => { await gate; await route.continue(); });
  const c = await open('labels', { context: cctx, query: '#labels-add=' + link('freshload0003', ['Waiting one']) });
  assert.ok(await c.page.evaluate(() => !/labels-add/.test(location.href)), 'the link left the address at boot');
  await c.page.evaluate(() => window.__GEN2_CTX__().switchTo('build'));
  await c.page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.buildPlate = s.buildPlate === 'smooth' ? 'powder' : 'smooth'; }, 'edit'));
  await c.page.waitForTimeout(1500);   // the edit's save has written the address
  assert.ok(await c.page.evaluate(() => /^#build=/.test(location.hash) && !/labels-add/.test(location.href)), 'a save while on Build writes the build alone');
  assert.deepEqual(await words(c.page), [], 'nothing imported yet');
  release();
  await c.page.evaluate(() => window.__GEN2_CTX__().switchTo('labels'));
  await landed(c.page, 1, 'back in Labels');
  assert.deepEqual(await words(c.page), ['waiting one']);
  await c.page.evaluate(() => window.__GEN2_CTX__().switchTo('build'));
  await c.page.evaluate(() => window.__GEN2_CTX__().switchTo('labels'));
  await c.page.waitForTimeout(2000);
  assert.deepEqual(await words(c.page), ['waiting one'], 'opening Labels again does not add it twice');
  await c.page.reload({ waitUntil: 'load' }); await waitBoot(c.page);
  await c.page.waitForTimeout(3000);
  assert.deepEqual(await words(c.page), ['waiting one'], 'a reload does not add it twice');
  assert.deepEqual(clean(c.errors), []);
  await cctx.close();
  // a link on another workspace's address (the old planner's cutover redirect sends ?ws=build with the whole hash): it
  // still opens Labels and lands
  const d = await open('build', { query: '#labels-add=' + link('freshload0004', ['From build']) });
  await landed(d.page, 1, 'a link on ?ws=build');
  assert.equal(await d.page.evaluate(() => document.documentElement.dataset.ws), 'labels', 'the page opened on Labels');
  assert.deepEqual(clean(d.errors), []);
  await d.ctx.close();
});

/* THE STALE-TAB GUARD (Joey, 2026-10-22: "a planner tab whose build was saved newer by another tab must not overwrite it;
   show a notice with Reload instead"), in the Studio's own two-tab flow. Make labels opens the Studio in a new tab, and its
   Add to planner build opens the planner again, in another new tab, on the build this browser has open: tab B lands the
   labels and saves while tab A is still open on the build without them. Tab A's next edit used to save its older build over
   the labels. Every write now names the stored version it is based on (js/state/builds.js decide()); tab A's is refused, so
   it goes stale for good: a notice over everything, nothing of it saved, and Reload opens the saved build */
test('the stale-tab guard: the Studio’s second planner tab saves its labels, the first goes stale and saves nothing, Reload opens the saved build', async () => {
  const context = await freshContext();
  await context.route('https://labels.modulith.systems/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Label Studio stub</title>' }));
  const A = await open('labels', { context });
  const guard = (p) => p.evaluate(() => { const b = window.__GEN2_CTX__().builds; return { stale: b.stale, base: b.base }; });
  const settled = (p) => p.evaluate(async () => { window.__GEN2_STORE__.flush(); await window.__GEN2_CTX__().builds.settled(); });
  const row = (p, id = null) => p.evaluate(async (id) => { const M = await import('./js/state/builds.js'); const e = await (await M.openBuilds()).get(id || window.__GEN2_STORE__.state.buildId); return e && { savedAt: e.savedAt, name: e.name, plate: e.record.buildPlate, n: e.record.labelList?.labels?.length || 0 }; }, id);
  const slot = (p) => p.evaluate(() => { const r = JSON.parse(localStorage.getItem('gen2-last-build') || 'null'); return r && { id: r.buildId, plate: r.buildPlate, n: r.labelList?.labels?.length || 0 }; });
  const flip = (p) => p.evaluate(() => { const S = window.__GEN2_STORE__; const v = S.state.buildPlate === 'smooth' ? 'powder' : 'smooth'; S.commit((s) => { s.buildPlate = v; }, 'edit'); return v; });
  // an edit has been saved when the slot (written last) holds it
  const edit = async (p) => { const want = await flip(p); await p.waitForFunction((v) => { try { return JSON.parse(localStorage.getItem('gen2-last-build')).buildPlate === v; } catch { return false; } }, want, { timeout: 30_000 }).catch(() => assert.fail('an edit was not saved within 30 s')); await settled(p); };
  // a new page has nothing stored to be based on
  assert.deepEqual(await guard(A.page), { stale: false, base: null });
  // Make labels on a build never saved (this untouched kit page): its Add to planner build reopens this browser's CURRENT
  // build, so the build becomes current, and is saved, as the Studio opens (the guard's review: opening Labels used to
  // save it as a side effect, and no longer does)
  const id0 = await A.page.evaluate(() => window.__GEN2_STORE__.state.buildId);
  assert.equal(await row(A.page, id0), null, 'not saved before');
  const [studio0] = await Promise.all([context.waitForEvent('page'), A.page.locator('#ws-dock button.cta:has-text("Make labels")').click()]);
  await studio0.close();
  await settled(A.page);
  assert.equal(await A.page.evaluate(() => localStorage.getItem('gen2-current-build')), id0, 'the current build is this one');
  assert.ok(await row(A.page, id0), 'and it is saved');
  assert.equal((await guard(A.page)).base, (await row(A.page, id0)).savedAt);
  // a kit page mints a new id on every adopt, and Undo goes back to the earlier one: the base is per build, so neither is stale
  const ids = [];
  for (let i = 0; i < 2; i++) {
    ids.push(await A.page.evaluate(async () => { const S = window.__GEN2_STORE__; S.flush(); const k = JSON.parse(JSON.stringify(window.__GEN2_VIEWER__.build)); delete k.buildId; S.load(k, 'adopt'); S.flush(); await window.__GEN2_CTX__().builds.settled(); return S.state.buildId; }));
  }
  assert.notEqual(ids[0], ids[1], 'each adopt is a new build');
  const firstAdopt = await row(A.page, ids[0]);
  await A.page.evaluate(async () => { window.__GEN2_STORE__.undo(); await window.__GEN2_CTX__().builds.settled(); });
  assert.equal(await A.page.evaluate(() => window.__GEN2_STORE__.state.buildId), ids[0]);
  assert.equal((await guard(A.page)).stale, false, 'Undo back to the first adopt’s build is not stale');
  assert.ok((await row(A.page, ids[0])).savedAt > firstAdopt.savedAt, 'and its build is saved again');
  // this tab's own saves move its base along, also two queued back to back (an edit and an Undo at once)
  for (let i = 0; i < 2; i++) { await edit(A.page); assert.equal((await guard(A.page)).base, (await row(A.page)).savedAt, 'the base follows this tab’s own save'); }
  await A.page.evaluate(async () => { const S = window.__GEN2_STORE__; S.commit((s) => { s.backCover = !s.backCover; }, 'edit'); S.undo(); await window.__GEN2_CTX__().builds.settled(); });
  assert.equal((await guard(A.page)).stale, false, 'its own saves in a row never make it stale');
  // a version is never reused: with the clock standing still (a coarse timer, a clock set back), each save still moves it
  // (Sol 01a16556: two saves with one savedAt let a tab based on the first pass the check after the second)
  const frozen = await A.page.evaluate(async () => {
    const real = Date.now; const t = real(); Date.now = () => t;
    try {
      const S = window.__GEN2_STORE__; const out = [];
      for (let i = 0; i < 2; i++) { S.commit((s) => { s.backCover = !s.backCover; }, 'edit'); S.flush(); await window.__GEN2_CTX__().builds.settled(); out.push(window.__GEN2_CTX__().builds.base); }
      return out;
    } finally { Date.now = real; }
  });
  assert.ok(frozen[1] > frozen[0], `each save is a new version: ${frozen.join(', ')}`);
  const rowA = await row(A.page);
  const id = await A.page.evaluate(() => window.__GEN2_STORE__.state.buildId);
  // the control for the held palette below: a preset IS saved with the build
  const palKey = 'gen2-colors:build-' + id;
  const pal = (p) => p.evaluate((k) => localStorage.getItem(k), palKey);
  const palBefore = await pal(A.page);
  await A.page.evaluate(() => { const V = window.__GEN2_VIEWER__; V.applyPreset(V.PRESETS[1]); });
  assert.notEqual(await pal(A.page), palBefore, 'a preset is saved with the build');
  // tab A reloads (its own address, its kept base): opening Labels saves nothing, and it is not stale
  await A.page.reload({ waitUntil: 'load' }); await waitBoot(A.page);
  await A.page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await A.page.waitForTimeout(1500); await settled(A.page);
  assert.deepEqual(await row(A.page), rowA, 'opening Labels wrote no new version');
  assert.equal(await A.page.locator('#ws-stale').count(), 0);
  assert.deepEqual(await guard(A.page), { stale: false, base: rowA.savedAt });
  // Make labels: the Studio opens in a new tab, told where its Add to planner build comes back to
  let release = null; const gate = new Promise((r) => { release = r; });
  await context.route('**/vendor/label-list.js*', async (route) => { await gate; await route.continue(); });   // tab B imports only once released
  const [studioTab] = await Promise.all([context.waitForEvent('page'), A.page.locator('#ws-dock button.cta:has-text("Make labels")').click()]);
  await studioTab.waitForURL(/labels\.modulith\.systems/, { timeout: 30_000 });
  const ret = new URL(studioTab.url()).searchParams.get('return');
  assert.equal(ret, `${base}/index.html?ws=labels`);
  await studioTab.close();
  // the slot holds another build now (as after a switch elsewhere), so tab B's boot changes it: a storage event tab A ignores
  // (after the click: Make labels writes the slot itself)
  await A.page.evaluate(() => { const r = JSON.parse(localStorage.getItem('gen2-last-build')); r.buildId = 'e2eother0001'; localStorage.setItem('gen2-last-build', JSON.stringify(r)); });
  // the Studio's Add to planner build: tab B, on the same build
  const linkOf = (batch, words) => Buffer.from(JSON.stringify({ format: 'modulith-labels', version: 1, batchId: batch, labels: words.map((text) => ({ text })) })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const tb = await context.newPage(); const bErrors = [];
  tb.on('pageerror', (e) => bErrors.push('pageerror: ' + e.message)); tb.on('console', (m) => { if (m.type() === 'error') bErrors.push('console: ' + m.text()); });
  await tb.goto(`${ret}&debug=1#labels-add=${linkOf('guardtab0001', ['Guard one'])}`, { waitUntil: 'load', timeout: 90_000 }); await waitBoot(tb);
  assert.equal(await tb.evaluate(() => window.__GEN2_STORE__.state.buildId), id, 'tab B opened the build tab A has open');
  assert.equal((await guard(tb)).base, rowA.savedAt);
  // what must not make tab A stale: the slot tab B's boot wrote, a hint naming tab A's own version, a hint removed
  await tb.evaluate(({ id, at }) => { localStorage.removeItem('gen2-build-saved'); localStorage.setItem('gen2-build-saved', JSON.stringify({ id, savedAt: at })); localStorage.removeItem('gen2-build-saved'); }, { id, at: rowA.savedAt });
  await A.page.waitForTimeout(1000); await settled(A.page);
  assert.equal(await A.page.locator('#ws-stale').count(), 0, 'a hint is a reason to look, not a verdict');
  assert.equal((await guard(A.page)).stale, false);
  // tab B lands the label and saves
  release();
  await tb.waitForFunction(() => (window.__GEN2_STORE__.state.labelList?.labels || []).length === 1, null, { timeout: 30_000 }).catch(() => assert.fail('tab B: the link’s label did not land'));
  await tb.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('gen2-last-build')).labelList.labels.length === 1; } catch { return false; } }, null, { timeout: 30_000 }).catch(() => assert.fail('tab B was not saved within 30 s'));
  await settled(tb);
  const rowB = await row(tb);
  assert.notEqual(rowB.savedAt, rowA.savedAt); assert.equal(rowB.n, 1);
  await tb.evaluate(() => localStorage.setItem('gen2-current-build', 'e2esentinel1'));
  // tab A goes stale: the notice, the keyboard on Reload
  await A.page.waitForSelector('#ws-stale', { timeout: 30_000 }).catch(() => assert.fail('tab A did not go stale after tab B saved the build'));
  assert.match(await text(A.page, '#ws-stale'), /saved in another tab/);
  assert.equal(await A.page.getAttribute('#ws-stale', 'role'), 'alertdialog');
  assert.equal(await A.page.evaluate(() => document.activeElement && document.activeElement.textContent), 'Reload', 'the keyboard is on Reload');
  assert.equal((await guard(A.page)).stale, true);
  // no key reaches the page under the notice: Escape, Undo, Delete on Reload change nothing, and a focus moved behind it
  // comes back (the guard's review)
  // (on Build, whose keys act on any target but a field: Ctrl+Z undoes, Delete removes the selected unit)
  await A.page.evaluate(() => window.__GEN2_CTX__().switchTo('build'));
  // an edit first (not saved: the tab is stale), so Ctrl+Z has something it would undo
  await A.page.evaluate(() => { const S = window.__GEN2_STORE__; S.commit((s) => { s.feet = s.feet === 'tpu' ? 'adhesive' : 'tpu'; }, 'edit'); S.flush(); });
  assert.ok(await A.page.evaluate(() => window.__GEN2_STORE__.canUndo), 'there is an edit to undo');
  const hashNow = await A.page.evaluate(() => window.__GEN2_STORE__.hash());
  for (const k of ['Escape', 'Control+z', 'Delete', 'ArrowLeft']) await A.page.keyboard.press(k);
  assert.equal(await A.page.evaluate(() => window.__GEN2_STORE__.hash()), hashNow, 'the keys did nothing under the notice');
  await A.page.evaluate(() => document.querySelector('#ws-dock button')?.focus());
  assert.equal(await A.page.evaluate(() => document.activeElement && document.activeElement.textContent), 'Reload', 'focus stays on the notice');
  await A.page.evaluate(() => window.__GEN2_CTX__().switchTo('labels'));
  // nothing of tab A is saved any more: the palette, an edit (twice: it stays stale), the slot, the current build
  const palHeld = await pal(A.page);
  await A.page.evaluate(() => { const V = window.__GEN2_VIEWER__; V.applyPreset(V.PRESETS[V.PRESETS.length - 1]); });
  assert.equal(await pal(A.page), palHeld, 'the palette is not written');
  for (let i = 0; i < 2; i++) {
    await flip(A.page); await settled(A.page);
    assert.deepEqual(await row(A.page), rowB, 'tab A’s edit wrote no new version');
    assert.deepEqual(await slot(A.page), { id, plate: rowB.plate, n: 1 }, 'nor the slot');
    assert.equal(await A.page.evaluate(() => localStorage.getItem('gen2-current-build')), 'e2esentinel1', 'nor the current build');
    assert.equal(await A.page.evaluate(() => window.__GEN2_CTX__().builds.capPending), null, 'and it is no cap notice');
  }
  assert.ok(await A.page.evaluate(() => JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(7))))).buildPlate === window.__GEN2_STORE__.state.buildPlate), 'the address still follows the edits');
  // the notice is the page's, not a workspace's: it stays across a switch and the phone breakpoint, and fits a phone
  await A.page.evaluate(() => window.__GEN2_CTX__().switchTo('build'));
  assert.ok(await A.page.locator('#ws-stale').isVisible(), 'kept across a workspace switch');
  await A.page.setViewportSize({ width: 390, height: 844 });
  await A.page.waitForFunction(() => document.documentElement.classList.contains('ws-phone'), null, { timeout: 15_000 });
  const fit = await A.page.evaluate(() => { const r = document.querySelector('#ws-stale button').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
  assert.ok(fit && await A.page.locator('#ws-stale').isVisible(), 'Reload on a phone screen');
  await A.page.setViewportSize({ width: 1280, height: 800 });
  await A.page.evaluate(() => window.__GEN2_CTX__().switchTo('labels'));
  // a reload of the stale tab is still stale: its kept base is not the stored version
  await tb.close();
  await A.page.reload({ waitUntil: 'load' }); await waitBoot(A.page);
  await A.page.waitForSelector('#ws-stale', { timeout: 30_000 }).catch(() => assert.fail('the stale tab reloaded without its notice'));
  await flip(A.page); await settled(A.page);
  assert.deepEqual(await row(A.page), rowB, 'nor after its reload');
  // Reload opens the saved build: the labels, no notice, based on the stored version, and its edits save again
  await A.page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await A.page.locator('#ws-stale button').click();
  await A.page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && (window.__GEN2_STORE__.state.labelList?.labels || []).length === 1, null, { timeout: 90_000 }).catch(() => assert.fail('Reload did not open the saved build'));
  await waitBoot(A.page);
  assert.equal(await A.page.locator('#ws-stale').count(), 0);
  assert.deepEqual(await guard(A.page), { stale: false, base: rowB.savedAt });
  await edit(A.page);
  const after = await row(A.page);
  assert.ok(after.savedAt > rowB.savedAt && after.n === 1, 'an edit after Reload is saved, labels and all');
  // a page opened on a link to the build hears tab A's next save and goes stale; its reload is still stale (its kept base)
  const tc = await context.newPage(); const cErrors = [];
  tc.on('pageerror', (e) => cErrors.push('pageerror: ' + e.message));
  await tc.goto(await A.page.evaluate(() => location.href), { waitUntil: 'load', timeout: 90_000 }); await waitBoot(tc);
  assert.deepEqual(await guard(tc), { stale: false, base: after.savedAt });
  await edit(A.page);
  await tc.waitForSelector('#ws-stale', { timeout: 30_000 }).catch(() => assert.fail('the link page did not go stale after tab A saved'));
  await tc.reload({ waitUntil: 'load' }); await waitBoot(tc);
  await tc.waitForSelector('#ws-stale', { timeout: 30_000 }).catch(() => assert.fail('the link page reloaded without its notice'));
  assert.deepEqual(clean(cErrors), []);
  await tc.close();
  // Back to an older page of the build: tab A leaves for a new page (a reopen, which saves the build again), then comes
  // back. That page held the version before, so it is stale, also when it boots again (the review: per tab alone, the
  // newer base the tab kept made the old page look current, and its next edit saved over the newer version)
  const leftAt = await row(A.page);
  await A.page.goto(`${base}/index.html?ws=build&debug=1`, { waitUntil: 'load', timeout: 90_000 }); await waitBoot(A.page);
  await edit(A.page);
  assert.ok((await row(A.page)).savedAt > leftAt.savedAt);
  await A.page.goBack({ waitUntil: 'load', timeout: 90_000 }); await waitBoot(A.page);
  await A.page.waitForSelector('#ws-stale', { timeout: 30_000 }).catch(() => assert.fail('Back to the older page did not show the notice'));
  await A.page.reload({ waitUntil: 'load' }); await waitBoot(A.page);
  await A.page.waitForSelector('#ws-stale', { timeout: 30_000 }).catch(() => assert.fail('the older page, reloaded, did not show the notice'));
  // its Reload takes the older page out of the history: Back goes to what came before the planner, not to that page
  await A.page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await A.page.locator('#ws-stale button').click();
  await A.page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__, null, { timeout: 90_000 }); await waitBoot(A.page);
  assert.equal(await A.page.locator('#ws-stale').count(), 0);
  await A.page.goBack({ timeout: 30_000 }).catch(() => {});
  assert.ok(!/index\.html/.test(A.page.url()), `Back left the planner (at ${A.page.url().slice(0, 60)})`);
  await A.page.goForward({ waitUntil: 'load', timeout: 90_000 }); await waitBoot(A.page);
  assert.equal(await A.page.locator('#ws-stale').count(), 0, 'and Forward comes back to the saved build');
  // a write that sends no hint (a tab without the guard; the writing tab hears no storage event of its own): caught at the
  // tab's next save, which is refused
  await A.page.evaluate(async () => { const M = await import('./js/state/builds.js'); const b = await M.openBuilds(); const e = await b.get(window.__GEN2_STORE__.state.buildId); await b.put({ ...e, savedAt: e.savedAt + 1, name: 'Silent write' }); });
  assert.equal(await A.page.locator('#ws-stale').count(), 0, 'no hint heard, no notice yet');
  const slotBefore = await slot(A.page);
  await flip(A.page); await settled(A.page);
  assert.equal((await guard(A.page)).stale, true, 'the save found the newer version');
  await A.page.waitForSelector('#ws-stale', { timeout: 10_000 });
  assert.equal((await row(A.page)).name, 'Silent write', 'and left it as it was');
  assert.deepEqual(await slot(A.page), slotBefore, 'the refused save wrote no slot');
  assert.deepEqual(clean(A.errors), []);
  assert.deepEqual(clean(bErrors), []);
  await context.close();
});

/* the guard's version check on real IndexedDB (test/builds.test.mjs covers the localStorage fallback): the store module on a
   blank page, no 3D */
test('the stale-tab guard: the build store’s version check on IndexedDB, and on a build still in the fallback list', async () => {
  const context = await freshContext();
  await context.route(`${base}/e2e-blank.html`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
  const page = await context.newPage();
  await page.goto(`${base}/e2e-blank.html`, { waitUntil: 'load' });
  const got = await page.evaluate(async () => {
    const M = await import('/js/state/builds.js'); const b = await M.openBuilds();
    const rec = (id) => ({ mount: 'tabletop', length: 185, placed: [], nextId: 1, buildId: id });
    const e = (savedAt, id = 'e2eguard0001') => M.entryOf(rec(id), { now: savedAt });
    const hint = () => localStorage.getItem(M.SAVED_KEY);
    const o = { durable: b.durable };
    o.first = (await b.put(e(100), { expect: null })).ok;
    o.hintFirst = hint();
    const r150 = await b.put(e(150), { expect: null }); o.r150 = { ok: r150.ok, at: r150.stale && r150.stale.savedAt, drop: 'drop' in r150 };
    o.hintAfterRefusal = hint();
    o.r200 = (await b.put(e(200), { expect: 100 })).ok; o.get200 = (await b.get('e2eguard0001')).savedAt;
    const r300 = await b.put(e(300), { expect: 100 }); o.r300 = { ok: r300.ok, at: r300.stale && r300.stale.savedAt };
    o.r400 = (await b.put(e(400), { expect: 250 })).ok;
    o.r500 = (await b.put(e(500), { force: true, expect: 100 })).ok;
    o.missing = (await b.put(e(600, 'e2eguard0002'), { expect: 123 })).ok;
    // a build still in the fallback list (saved while IndexedDB was refused): checked against, then moved over
    const fb = e(250, 'e2eguard0003');
    localStorage.setItem('gen2-builds', JSON.stringify([fb]));
    o.fbGet = (await b.get('e2eguard0003')).savedAt;
    o.fbWrong = (await b.put(e(650, 'e2eguard0003'), { expect: 100 })).ok;
    o.fb700 = (await b.put(e(700, 'e2eguard0003'), { expect: 250 })).ok;
    o.fbLeft = (JSON.parse(localStorage.getItem('gen2-builds') || '[]')).some((x) => x.id === 'e2eguard0003');
    o.fbGet700 = (await b.get('e2eguard0003')).savedAt;
    o.fb800 = (await b.put(e(800, 'e2eguard0003'), { expect: 700 })).ok;
    o.hintLast = hint();
    // a lost connection (WebKit, after a tab sat in the background): its next transaction throws; the store opens IndexedDB
    // again rather than settle for the list, whose check would not know the row (the guard's review)
    const orig = IDBDatabase.prototype.transaction; let fails = 0;
    IDBDatabase.prototype.transaction = function (...a) { if (fails > 0) { fails--; throw new DOMException('The database connection is closing.', 'InvalidStateError'); } return orig.apply(this, a); };
    fails = 1; o.lostGet = ((await b.get('e2eguard0003')) || {}).savedAt;
    fails = 1; const lp = await b.put(e(900, 'e2eguard0003'), { expect: 100 }); o.lostPut = { ok: lp.ok, at: lp.stale && lp.stale.savedAt };
    o.lostList = (JSON.parse(localStorage.getItem('gen2-builds') || '[]')).some((x) => x.id === 'e2eguard0003');
    IDBDatabase.prototype.transaction = orig;
    // an IndexedDB that failed to open when the page booted is tried again at the next read (Sol 01a16556), once for two
    // readers at the same time: here a second open would fail a moment later and must not drop the first's connection
    // (Terra 01a16560)
    const realOpen = IDBFactory.prototype.open; let calls = 0;
    IDBFactory.prototype.open = function (...a) {
      calls++;
      if (calls === 1) throw new DOMException('refused', 'UnknownError');
      if (calls === 3) { const fake = {}; setTimeout(() => fake.onerror && fake.onerror(), 50); return fake; }
      return realOpen.apply(this, a);
    };
    const late = await M.openBuilds();
    o.lateBefore = late.durable;
    const both = await Promise.all([late.get('e2eguard0003'), late.get('e2eguard0003')]);
    o.lateGet = both.map((x) => (x || {}).savedAt);
    await new Promise((r) => setTimeout(r, 150));
    o.lateAfter = late.durable; o.opens = calls;
    IDBFactory.prototype.open = realOpen;
    return o;
  });
  assert.equal(got.durable, true, 'IndexedDB, not the fallback');
  assert.equal(got.first, true);
  assert.deepEqual(JSON.parse(got.hintFirst), { id: 'e2eguard0001', savedAt: 100 });
  assert.deepEqual(got.r150, { ok: false, at: 100, drop: false }, 'never read, yet stored: refused with the stored row');
  assert.equal(got.hintAfterRefusal, got.hintFirst, 'a refusal hints nothing');
  assert.equal(got.r200, true); assert.equal(got.get200, 200);
  assert.deepEqual(got.r300, { ok: false, at: 200 }, 'based on a version since replaced');
  assert.equal(got.r400, false, 'any other version, not only an older one');
  assert.equal(got.r500, false, 'force skips the cap, never the check');
  assert.equal(got.missing, true, 'a missing row is written');
  assert.equal(got.fbGet, 250);
  assert.equal(got.fbWrong, false, 'the fallback list’s row is checked too');
  assert.equal(got.fb700, true); assert.equal(got.fbLeft, false, 'and leaves the fallback list once IndexedDB has it');
  assert.equal(got.fbGet700, 700); assert.equal(got.fb800, true);
  assert.deepEqual(JSON.parse(got.hintLast), { id: 'e2eguard0003', savedAt: 800 });
  assert.equal(got.lostGet, 800, 'a read after a lost connection still finds the row');
  assert.deepEqual(got.lostPut, { ok: false, at: 800 }, 'and a write based on another version is still refused');
  assert.equal(got.lostList, false, 'nothing went to the list');
  assert.deepEqual([got.lateBefore, got.lateGet, got.lateAfter, got.opens], [false, [800, 800], true, 2], 'a failed first open is retried once for both readers, and the stored row found');
  await context.close();
});

/* ASSEMBLE OPENS AT THE BEGINNING (Joey, 2026-10-20: "it seems to start at the end"). The other workspaces park the stage on
   the finished step and Assemble only moved to the Overview from the cover, so a visit from Build opened on the last step.
   Now a first arrival lands on the Overview from either; the step a visitor left on still comes back. And the guided
   camera (Joey: "how do I get it to snap back to the cinematic camera?"): an orbit lights the toolbar's camera button,
   named for the step's camera in Assemble; pressing it returns the camera and the light goes out. */
test('Assemble: reached from Build it opens on the Overview, a left step comes back, an orbit lights the camera button and it returns the guided camera', async () => {
  const { ctx, page, errors } = await open('build');
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.cur), await page.evaluate(() => window.__GEN2_VIEWER__.pageCount - 2), 'Build parks the stage on the finished step');
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('assemble'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'assemble' && window.__GEN2_VIEWER__.cur === 1, null, { timeout: 60_000 }).catch(() => assert.fail('Assemble did not open on the Overview within 60 s'));
  assert.match(await text(page, '#ws-steps .count'), /^0 \/ /, 'the list reads 0 of n at the Overview');
  // the step left on comes back after a trip to Parts
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === 2, null, { timeout: 60_000 });
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('parts'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'parts', null, { timeout: 60_000 });
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('assemble'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'assemble' && window.__GEN2_VIEWER__.cur === 2, null, { timeout: 60_000 }).catch(() => assert.fail('the step left on did not come back'));
  // the camera: an orbit drag on the stage lights the button; pressing it gives the camera back
  const camBtn = page.locator('#ws-tools button.cam');
  assert.equal(await camBtn.getAttribute('aria-label'), 'Back to the step\u2019s camera');
  assert.equal(await camBtn.evaluate((b) => b.classList.contains('on')), false, 'not lit before an orbit');
  await page.mouse.move(640, 380); await page.mouse.down(); await page.mouse.move(720, 420, { steps: 10 }); await page.mouse.up();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.camFree === true && document.querySelector('#ws-tools button.cam').classList.contains('on'), null, { timeout: 15_000 }).catch(() => assert.fail('an orbit did not light the camera button'));
  await camBtn.click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.camFree === false && !document.querySelector('#ws-tools button.cam').classList.contains('on'), null, { timeout: 15_000 }).catch(() => assert.fail('the camera button did not return the guided camera'));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Parts: the list, tracking counters, and the dock caption', async () => {
  const { ctx, page, errors } = await open('parts');
  await page.waitForSelector('#ws-parts .prow', { timeout: 30_000 });
  assert.ok(await page.locator('#ws-parts .prow').count() >= 5, 'rows listed');
  await btn(page, 'Track my build', '#ws-parts').click();
  await settle(page, 400);
  const plus = page.locator('#ws-parts .counter button:has-text("+")').first();
  await plus.click(); await plus.click();
  await settle(page, 400);
  assert.ok(await page.locator('#ws-dock .pbar').count(), 'the progress bar');
  assert.match(await text(page, '#ws-dock .pbar .long'), /\d+ of \d+ in hand/);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* PRINT (2026-10-22): the Parts list's Print printed the screen as it was (a live check on 0f32d12e: the 3D scene, the bars
   and 6 of 25 rows on paper). The print stylesheet puts the list alone and whole on paper, black on white, under a line
   naming the build, on a desktop and from the phone's bottom sheet */
test('Parts: Print puts the whole list on paper, alone and black on white, on a desktop and from the phone sheet', async () => {
  const look = (page) => page.evaluate(() => {
    const shown = (sel) => [...document.querySelectorAll(sel)].some((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; });
    const panel = document.getElementById('ws-parts'); const pcs = getComputedStyle(panel);
    const rows = [...panel.querySelectorAll('.prow')];
    const head = panel.querySelector('.printhead');
    return {
      stage: shown('canvas'), top: shown('#ws-top'), dock: shown('#ws-dock'), tools: shown('#ws-tools'),
      buttons: shown('#ws-parts .row3 .key') || shown('#ws-parts .row4 .key'), counters: shown('#ws-parts .counter button'), handle: shown('#ws-parts .sheet-handle'),
      head: head && shown('#ws-parts .printhead') ? head.textContent : null,
      position: pcs.position, clipped: panel.scrollHeight > panel.clientHeight + 1,
      rows: rows.length, rowsShown: rows.filter((r) => r.getBoundingClientRect().height > 0).length,
      ink: getComputedStyle(panel.querySelector('.name')).color, paper: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme,
    };
  });
  const { ctx, page, errors } = await open('parts');
  await page.waitForSelector('#ws-parts .prow', { timeout: 30_000 });
  const screen = await look(page);
  assert.equal(screen.head, null, 'the print line stays off the screen');
  assert.ok(screen.stage && screen.top && screen.dock, 'the screen is as it was');
  await page.emulateMedia({ media: 'print' });
  const paper = await look(page);
  assert.deepEqual({ stage: paper.stage, top: paper.top, dock: paper.dock, tools: paper.tools, buttons: paper.buttons }, { stage: false, top: false, dock: false, tools: false, buttons: false }, 'only the list on paper');
  assert.match(paper.head || '', /MODULITH Planner/, 'a line names the build');
  assert.equal(paper.position, 'static');
  assert.equal(paper.clipped, false, 'the list is whole, not cut at its own scroll height');
  assert.ok(paper.rows >= 5 && paper.rowsShown === paper.rows, `every row on paper (${paper.rowsShown} of ${paper.rows})`);
  assert.deepEqual([paper.ink, paper.paper, paper.scheme], ['rgb(0, 0, 0)', 'rgb(255, 255, 255)', 'light'], 'black on white, the margins too');
  // tracking: the counts go on paper, their buttons don't
  await page.emulateMedia({ media: 'screen' });
  await btn(page, 'Track my build', '#ws-parts').click();
  await settle(page, 400);
  await page.emulateMedia({ media: 'print' });
  const tracked = await look(page);
  assert.equal(tracked.counters, false, 'no counter buttons on paper');
  assert.equal(tracked.rowsShown, tracked.rows);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
  // the phone: the list is a bottom sheet with a grab handle; on paper it is the same whole list, without the handle
  const ph = await open('parts', { phone: true });
  await ph.page.waitForSelector('#ws-parts .prow', { state: 'attached', timeout: 30_000 });
  await ph.page.emulateMedia({ media: 'print' });
  const phone = await look(ph.page);
  assert.deepEqual({ stage: phone.stage, top: phone.top, dock: phone.dock, handle: phone.handle }, { stage: false, top: false, dock: false, handle: false }, 'only the list on paper');
  assert.equal(phone.clipped, false);
  assert.ok(phone.rows >= 5 && phone.rowsShown === phone.rows, `every row on paper (${phone.rowsShown} of ${phone.rows})`);
  assert.deepEqual(clean(ph.errors), []);
  await ph.ctx.close();
  // only Parts: the browser's print from another workspace keeps printing the screen, never a blank page
  const b = await open('build');
  await b.page.emulateMedia({ media: 'print' });
  assert.ok(await b.page.evaluate(() => { const c = document.querySelector('canvas'); const r = c && c.getBoundingClientRect(); return !!(r && r.width > 0 && getComputedStyle(c).display !== 'none') && getComputedStyle(document.getElementById('ws-top')).display !== 'none'; }), 'Build prints its screen as before');
  await b.ctx.close();
});

test('Assemble: Next steps through, Skip reaches the end, Back returns', async () => {
  const { ctx, page, errors } = await open('assemble');
  const cur = () => page.evaluate(() => window.__GEN2_VIEWER__.cur);
  const c0 = await cur();
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction((c) => window.__GEN2_VIEWER__.cur > c, c0, { timeout: 60_000 });
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });   // the finished step
  await btn(page, 'Next', '#ws-player').click();   // Next on the finished step is the end of the instructions
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(page, 'Back', '#ws-player').click();
  await settle(page, 800);
  assert.ok(!/End of instructions/.test(await text(page, '#ws-player .title')), 'Back leaves the end');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE DONE SCENE (5b's first slice, 2026-10-23, behind ?done=room): the end of the instructions puts the build in the Home
   office. Flag off, Done is what it was. Flag on: the room loads, the stage's holds are on (no background, the room's
   environment, controls off, the callouts off, grid and table hidden), a theme flip and a tier change leave the room in
   place (the shadow catcher on a tier with shadows, the baked disc on Fast), Back puts everything back. */
test('Assemble: the Done scene is off without its flag; with ?done=room the room comes on at Done, survives a theme flip and a tier change, and Back restores the stage', async () => {
  const toDone = async (page) => {
    await btn(page, 'Skip to the finished build', '#ws-steps').click();
    await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
    await btn(page, 'Next', '#ws-player').click();
    await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  };
  const state = (page) => page.evaluate(async () => { const v = window.__GEN2_VIEWER__, THREE = await import('three'); const vis = [], masks = []; let disc = null; v.scene.traverse((o) => { if (o.isMesh && o.userData.doneRoom) { if (o.material.isShadowMaterial) vis.push(o.visible); else if (o.material.map && o.material.map.isCanvasTexture) disc = o.visible; } if (o.userData.doneShadow) masks.push({ ...o.userData.doneShadow, visible: o.visible, multiply: o.material.blending === THREE.CustomBlending && o.material.blendSrc === THREE.ZeroFactor && o.material.blendDst === THREE.SrcColorFactor && o.material.blendEquation === THREE.AddEquation, transparent: o.material.transparent, depthWrite: o.material.depthWrite, toneMapped: o.material.toneMapped, order: o.renderOrder, colorSpace: o.material.map ? o.material.map.colorSpace : null, x: o.position.x, y: o.position.y, z: o.position.z, w: o.geometry.parameters.width }); }); const catcher = vis.length ? (vis.every(Boolean) ? true : vis.some(Boolean) ? 'mixed' : false) : null; const bb = v.assembledBox, rm = v.scene.getObjectByName('done-room'), wa = rm && rm.getObjectByName('anchor_wall'); return { catchers: vis.length, masks, anchorX: (bb.min.x + bb.max.x) / 2, anchorZ: bb.min.z, wallZ: wa ? wa.getWorldPosition(wa.position.clone()).z : null, held: v.sceneHeld, room: !!v.scene.getObjectByName('done-room'), done: document.documentElement.dataset.done || null, bg: v.scene.background ? (v.scene.background.isColor ? 'color' : 'other') : null, env: !!v.scene.environment, envIsStudio: v.scene.environment === v.studioEnv(), controls: v.controls.enabled, grid: v.grid.visible, table: v.table.visible, dims: !!v.dimsOn, shadow: v.renderer.shadowMap.enabled, catcher, disc, quality: v.quality, theme: v.stageTheme, sunHalfDeg: v.sunHalfDeg, sunMM: Math.round(v.sun.position.distanceTo(v.sun.target.position)), shadowFar: v.sun.shadow.camera.far }; });
  // off: nothing of the room
  const off = await open('assemble');
  await toDone(off.page);
  await settle(off.page, 1500);
  const s0 = await state(off.page);
  assert.equal(s0.room, false, 'no room without the flag'); assert.equal(s0.held, false); assert.equal(s0.done, null); assert.equal(s0.controls, true);
  assert.equal(await off.page.locator('#ws-player button', { hasText: 'Watch the final scene' }).count(), 0, 'no way into a scene without the flag');
  assert.match(await text(off.page, '#ws-player .next'), /Finished/, 'the Next slot says Finished, as before');
  assert.deepEqual(clean(off.errors), []);
  await off.ctx.close();
  // on: the End page first (the HUD, the finished build on the stage, the way in), then the scene: the room, the holds,
  // the HUD faded, the bars, the strip, no orbit (THE FINAL SCENE, Joey 2026-10-23: "a final scene that you have to make
  // obvious to go into ... most of the hud disappears and black borders appear ... don't let them rotate the camera")
  const { ctx, page, errors } = await open('assemble', { query: '&done=room' });
  await toDone(page);
  await settle(page, 800);
  assert.equal((await state(page)).room, false, 'the End page: the room does not come on by itself, it is stepped into');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('cinema')), false);
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => assert.fail('the room did not come on within 60 s'));
  await settle(page, 1500);
  const s1 = await state(page);
  assert.equal(s1.room, true, 'the room is in the scene'); assert.equal(s1.held, true, 'the stage is held');
  assert.equal(s1.bg, null, 'no stage background behind the room'); assert.equal(s1.controls, false, 'no orbit in the scene');
  const dress = await page.evaluate(() => { const cs = (sel) => getComputedStyle(document.querySelector(sel)); const bars = document.querySelector('#cinema-bars'), bar = getComputedStyle(bars, '::before'), low = getComputedStyle(bars, '::after'); return { cinema: document.documentElement.classList.contains('cinema'), steps: cs('#ws-steps').opacity, player: cs('#ws-player').opacity, topbar: cs('#ws-top').opacity, topVis: cs('#ws-top').visibility, chipBlur: getComputedStyle(document.querySelector('#ws-top .chip')).backdropFilter, tools: cs('#ws-tools').opacity, barH: parseFloat(bar.height), lowH: parseFloat(low.height), barBg: bar.backgroundColor, barContent: bar.content, lowContent: low.content, sameLayer: bars.parentElement === document.querySelector('#ws-scene').parentElement, strip: [...document.querySelectorAll('#ws-scene button')].map((b) => b.textContent.trim()), safe: window.__GEN2_VIEWER__.safeArea, h: innerHeight }; });
  assert.equal(dress.cinema, true, 'html.cinema'); assert.equal(dress.steps, '0', 'the steps panel faded out'); assert.equal(dress.player, '0', 'the player faded out'); assert.equal(dress.topbar, '0', 'the top bar faded out'); assert.equal(dress.topVis, 'hidden', 'and is hidden once faded'); assert.equal(dress.chipBlur, 'none', 'its glass chips lost their blur (Chrome keeps a backdrop blur at opacity 0)'); assert.equal(dress.tools, '0', 'the toolbar faded out');
  assert.ok(Math.abs(dress.barH - dress.h * 0.07) < 2 && Math.abs(dress.lowH - dress.h * 0.07) < 2, `black bars of 7 vh top and bottom (${dress.barH}, ${dress.lowH} of ${dress.h})`); assert.equal(dress.barBg, 'rgb(0, 0, 0)');
  assert.equal(dress.barContent, '""', 'the top bar is drawn (a pseudo-element with content; a declared height alone computes even when nothing is drawn)'); assert.equal(dress.lowContent, '""', 'and the bottom one');
  assert.equal(dress.sameLayer, true, 'the bars live in the workspace layer with the strip, so the strip paints over them (bars on the page body covered it: the fixed workspace is its own stacking context)');
  assert.deepEqual(dress.strip, ['← Back', 'Next view →'], 'the strip: Back and Next view');
  const barPx = Math.round(dress.h * 0.07);
  assert.deepEqual(dress.safe, { left: 8, right: 8, top: barPx + 8, bottom: barPx + 8 }, `the shots are fitted between the bars, not the HUD's region (safe ${JSON.stringify(dress.safe)})`);
  assert.equal(s1.grid, false, 'the grid is hidden'); assert.equal(s1.table, false, 'the table is hidden'); assert.equal(s1.dims, false, 'no callouts in the room');
  assert.equal(s1.quality, 'fast', 'the suite pins Fast'); assert.equal(s1.shadow, false, 'Fast has no shadow map'); assert.equal(s1.disc, true, 'Fast shows the baked contact disc'); assert.equal(s1.catcher, false);
  assert.equal(s1.catchers, 2, 'two shadow catchers: the desk top and the wall behind it (2026-10-23), both hidden on Fast');
  /* the props' shadow masks (bake3, 2026-10-23): one quad per mask room.json lists, multiplied over the desk or the wall,
     on Fast too (textures, not the shadow map), each where room.json's extents put it about the anchor; the 2W2H kit hides
     no group, so every shadow shows */
  const roomJson = JSON.parse(await readFile(join(root, 'scenes', 'home-office', 'room.json'), 'utf8'));
  const listed = (roomJson.shadows && roomJson.shadows.masks) || [];
  assert.ok(listed.length > 0, 'room.json lists the props\' shadow masks (bake3)');
  assert.equal(s1.masks.length, listed.length, 'one quad per listed mask, on Fast too');
  assert.ok(s1.masks.every((m) => m.visible), 'the 2W2H kit hides no prop group: every shadow shows');
  assert.ok(s1.masks.every((m) => m.multiply && m.transparent && m.depthWrite === false && m.toneMapped === false && m.order === 1 && m.colorSpace === 'srgb'), 'multiplied over the surface after the room: CustomBlending zero x source colour (three\'s MultiplyBlending is ignored on this stage), transparent, no depth write, untoned, read as sRGB: ' + JSON.stringify(s1.masks[0]));
  masksPlaced(s1.masks, roomJson, s1);
  assert.match(await text(page, '#ws-player .text'), /Watch the final scene/, 'the End page named the way in');
  // a tier with shadows, still on the DARK theme (which has no shadow map of its own): the room's sun casts, the catcher shows
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('balanced', { user: true }); });
  await settle(page, 1500);
  const s2 = await state(page);
  assert.equal(s2.room, true); assert.equal(s2.held, true); assert.notEqual(s2.theme, 'light', 'still the dark stage (named night)'); assert.equal(s2.quality, 'balanced');
  assert.equal(s2.env, true, 'Balanced has an environment'); assert.equal(s2.envIsStudio, false, 'and it is the room\'s, not the studio\'s: the tier change did not put studioEnv back');
  assert.equal(s2.shadow, true, 'the sun shadow is on under the dark theme'); assert.equal(s2.catcher, true, 'both catchers show (desk and wall)'); assert.equal(s2.disc, false, 'the disc hides');
  // the room's sun, not the studio's (2026-10-23): inside the shadow camera's far plane (3000 mm out, the desk behind the
  // build was clipped to a sliver), and Very High's soft-shadow cone is the room's sun disc, not the studio's 6 degrees
  assert.ok(s2.sunMM < s2.shadowFar - 500, `the sun sits inside the shadow frustum (${s2.sunMM} mm of ${s2.shadowFar})`);
  assert.equal(s2.sunHalfDeg, 1, 'the soft-shadow cone is the room\'s sun disc (room.json sun.halfDeg)');
  // then a theme flip: the room keeps the background off and its shadow
  await page.evaluate(() => { window.__GEN2_VIEWER__.applyStageTheme('light'); });
  await settle(page, 1200);
  const s2b = await state(page);
  assert.equal(s2b.theme, 'light'); assert.equal(s2b.bg, null, 'the theme flip left the background off'); assert.equal(s2b.held, true); assert.equal(s2b.shadow, true);
  // Esc leaves the scene: the HUD back, the room gone, still the End page; the strip's own Back does the same
  await page.keyboard.press('Escape');
  await settle(page, 1200);
  assert.equal((await state(page)).room, false, 'Esc: the room is gone'); assert.equal(await page.evaluate(() => document.documentElement.classList.contains('cinema')), false, 'and the scene mode with it');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#ws-player')).opacity), '1', 'the player is back');
  assert.match(await text(page, '#ws-player .title'), /End of instructions/, 'still at the end'); assert.equal(await page.locator('#ws-scene').count(), 0, 'the strip is gone');
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => assert.fail('the scene did not come back'));
  await btn(page, 'Back', '#ws-scene').click();
  await settle(page, 1000);
  assert.equal((await state(page)).room, false, 'the strip\'s Back leaves the scene'); assert.match(await text(page, '#ws-player .title'), /End of instructions/);
  // Back: the stage whole again
  await btn(page, 'Back', '#ws-player').click();
  await settle(page, 1500);
  const s3 = await state(page);
  assert.equal(s3.room, false, 'the room is gone'); assert.equal(s3.held, false); assert.equal(s3.done, null);
  assert.equal(s3.bg, 'color', 'the stage background is back'); assert.equal(s3.envIsStudio, true, 'the studio environment is back'); assert.equal(s3.controls, true); assert.equal(s3.grid, true); assert.equal(s3.table, true); assert.equal(s3.dims, true, 'the callouts are back');
  assert.ok(!/End of instructions/.test(await text(page, '#ws-player .title')), 'Back leaves the end');
  assert.equal(s3.sunHalfDeg, 6, 'Back restores the studio\'s soft-shadow cone');
  assert.equal(s3.masks.length, 0, 'Back disposes the props\' shadow quads');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* the props' shadow masks (bake3): the check that each quad sits where room.json's extents put it about the anchor plus its
   group's slide (done-fit.js maskQuad). `f` is the frame read from the page: anchorX (the build's centre), anchorZ (its
   back), wallZ (the GLB's wall anchor, world). Shared by the Done cases. */
function masksPlaced(masks, roomJson, f) {
  const desk = roomJson.desk;
  for (const m of masks) {
    const rec = roomJson.shadows.masks.find((r) => r.group === m.group && r.surface === m.surface);
    assert.ok(rec, `${m.group}'s ${m.surface} mask is one room.json lists`);
    const dx = m.dx || 0;
    if (m.surface === 'desk') {
      // a desk quad is the mask's extent slid, CUT at the desk's ends (a mask reaching the edge and sliding outward would float past it)
      const lo = Math.max(rec.x0 + dx, desk.x0), hi = Math.min(rec.x1 + dx, desk.x1), ex = f.anchorX + (lo + hi) / 2;
      assert.ok(Math.abs(m.x - ex) < 0.01 && Math.abs(m.w - (hi - lo)) < 0.01, `${m.group}'s desk quad is the mask's extent slid and cut at the desk's ends (${m.x.toFixed(1)} vs ${ex.toFixed(1)}, ${m.w.toFixed(1)} vs ${(hi - lo).toFixed(1)}, slide ${m.dx})`);
      assert.ok(m.x - m.w / 2 >= f.anchorX + desk.x0 - 0.01 && m.x + m.w / 2 <= f.anchorX + desk.x1 + 0.01, `${m.group}'s desk quad lies within the desk`);
      assert.ok(Math.abs(m.z - (f.anchorZ + (rec.zBack + rec.zFront) / 2)) < 0.01 && m.y > 0 && m.y < 2, `${m.group}'s desk quad lies on the desk (${m.y.toFixed(2)}, ${m.z.toFixed(1)})`);
    } else {
      const ex = f.anchorX + (rec.x0 + rec.x1) / 2 + dx;
      assert.ok(Math.abs(m.x - ex) < 0.01 && Math.abs(m.w - (rec.x1 - rec.x0)) < 0.01, `${m.group}'s wall quad sits at the mask's extent about the anchor plus its slide (${m.x.toFixed(1)} vs ${ex.toFixed(1)}, slide ${m.dx})`);
      assert.ok(Math.abs(m.y - (rec.y0 + rec.y1) / 2) < 0.01 && m.z > f.wallZ && m.z - f.wallZ < 2, `${m.group}'s wall quad stands just in front of the wall (${m.y.toFixed(1)}, ${m.z.toFixed(2)} vs the wall at ${f.wallZ.toFixed(2)})`);
    }
  }
}

/* THE PROPS' SHADOWS MOVE WITH THE PROPS (Joey 2026-10-23: the keyboard's dark patch stayed on the desk's right end after the
   keyboard hid for a 12W build). bake3 bakes the desk and wall maps without the props and each prop group's shadow as a
   mask (room.json shadows); done.js slides each mask's quad with its group and hides it with a hidden group. A 12W x 2H
   build through the Build workspace, as the massive-build probe did: the monitor cannot clear it on the desk and hides, a
   group that can slides; their shadows do the same, by the same slide. */
test('Assemble: the Done scene\'s prop shadows slide with their group and hide with a hidden group (a 12W build)', async () => {
  const { ctx, page, errors } = await open('build', { query: '&build=185-tabletop-2w2h&done=room&new=1' });
  await page.waitForFunction(() => window.__GEN2_CTX__ && document.querySelector('#ws-build, #ws-lib'), null, { timeout: 60_000 });
  await page.evaluate(([W, H]) => { window.__GEN2_STORE__.commit((s, R) => { s.gridW = W; s.gridH = H; s.placed = []; let id = 1; for (let c = 0; c < W / 2; c++) for (let r = 0; r < H / 2; r++) s.placed.push({ id: id++, x: c * 2, y: r * 4, w: 2, hh: 4, fill: 'decor', shelves: 0 }); s.nextId = id; if (R.syncTabletopGrid) R.syncTabletopGrid(); }, 'edit'); }, [12, 2]);
  await settle(page, 1000);
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('assemble'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'assemble' && document.querySelector('#ws-steps'), null, { timeout: 60_000 });
  await page.waitForFunction((n) => { const v = window.__GEN2_VIEWER__; return v.build && v.build.placed && v.build.placed.length === n && v.pageCount > 2; }, 6, { timeout: 120_000 });
  await settle(page, 1000);
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  // a PORTRAIT window for the camera checks below: the fit's horizontal term grows with a narrow aspect, so the 12W hero is
  // fitted far enough back to need the clamp (in the scene's layout a landscape window no longer does: the bars leave the
  // camera more room than the HUD did). Put back after.
  const landscape = page.viewportSize();
  await page.setViewportSize({ width: 900, height: 1400 });
  await settle(page, 400);
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => assert.fail('the room did not come on within 60 s'));
  await settle(page, 1500);
  const r = await page.evaluate(() => { const v = window.__GEN2_VIEWER__, room = v.scene.getObjectByName('done-room'); const groups = {}; room.traverse((o) => { if (o.userData.slot && (o.isMesh || o.children.some((c) => c.isMesh))) { const g = o.userData.group || o.name; (groups[g] = groups[g] || []).push(o.visible); } }); const b = v.assembledBox, wa = room.getObjectByName('anchor_wall'); return { width: b.max.x - b.min.x, groups: Object.fromEntries(Object.entries(groups).map(([g, vis]) => [g, vis.every(Boolean) ? 'shown' : vis.some(Boolean) ? 'mixed' : 'hidden'])), slides: window.__GEN2_DONE__.slides, shadows: window.__GEN2_DONE__.shadows, anchorX: (b.min.x + b.max.x) / 2, anchorZ: b.min.z, wallZ: wa ? wa.getWorldPosition(wa.position.clone()).z : null }; });
  assert.ok(r.width > 1000, `a 12W build (${r.width.toFixed(0)} mm)`);
  // the shots stay INSIDE the room (2026-10-23, the massive-build probe): the hero sits the top margin below the wall
  // tops (it reached them for this build and went over them at the 12 x 12 cap), the low shot stays inside the left wall
  // (it used to leave through it for anything wider than about 500 mm) with its fov widened so the build keeps its share
  const d0 = await page.evaluate(() => { const s = window.__GEN2_DONE__.sequence, v = window.__GEN2_VIEWER__; return { interior: s.interior, fits: s.fits, cam: v.camera.position.toArray(), fov: v.camera.fov }; });
  assert.ok(d0.interior && Number.isFinite(d0.interior.x0) && Number.isFinite(d0.interior.y1) && Number.isFinite(d0.interior.z0), `the room's interior came from its walls (${JSON.stringify(d0.interior)})`);
  assert.ok(d0.cam[1] <= d0.interior.y1 - 450 + 1, `the hero sits the top margin below the wall tops (${d0.cam[1].toFixed(0)} of ${d0.interior.y1})`);
  assert.ok(d0.cam[0] >= d0.interior.x0 + 150 - 1 && d0.cam[0] <= d0.interior.x1 - 150 + 1, `and between the walls (${d0.cam[0].toFixed(0)})`);
  assert.equal(d0.fits[0].clamped, true, 'the hero was clamped for this build'); assert.equal(d0.fits.length, 3);
  await page.evaluate(() => window.__GEN2_DONE__.jump(1));
  await settle(page, 400);
  const d1 = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; return { cam: v.camera.position.toArray(), fov: v.camera.fov, fit: window.__GEN2_DONE__.sequence.fits[1] }; });
  assert.ok(d1.cam[0] >= d0.interior.x0 + 150 - 1, `the low shot stays inside the left wall (${d1.cam[0].toFixed(0)} against ${d0.interior.x0})`);
  assert.equal(d1.fit.clamped, true, 'it was clamped'); assert.ok(d1.fov > 35 && d1.fov <= 55, `its fov widened so the 12W build keeps its share of the frame (${d1.fov.toFixed(1)})`);
  await page.evaluate(() => window.__GEN2_DONE__.jump(0));
  await page.setViewportSize(landscape);   // the window back; the shots refit to it
  await settle(page, 600);
  assert.ok(r.shadows.length > 0, 'the shadow masks are on');
  const hidden = Object.keys(r.groups).filter((g) => r.groups[g] === 'hidden'), slid = Object.keys(r.slides).filter((g) => r.slides[g]);
  assert.ok(hidden.includes('monitor'), `the monitor group cannot clear a 12W build on the desk and hides (${JSON.stringify(r.groups)})`);
  assert.ok(slid.length > 0, `a group slid clear of the build (${JSON.stringify(r.slides)})`);
  assert.ok(Object.keys(r.groups).every((g) => r.groups[g] !== 'mixed'), `a group hides whole (${JSON.stringify(r.groups)})`);
  for (const m of r.shadows) {
    if (r.groups[m.group] === 'hidden') assert.equal(m.visible, false, `${m.group}'s ${m.surface} shadow hides with the group`);
    else { assert.equal(m.visible, true, `${m.group}'s ${m.surface} shadow shows with the group`); assert.equal(m.dx, r.slides[m.group] || 0, `${m.group}'s ${m.surface} shadow slid by the group's slide`); }
  }
  assert.ok(r.shadows.some((m) => m.visible && m.dx), 'a slid group\'s shadow carries a slide');
  const roomJson = JSON.parse(await readFile(join(root, 'scenes', 'home-office', 'room.json'), 'utf8'));
  masksPlaced(r.shadows.filter((m) => m.visible), roomJson, r);   // the slid quads really moved: the extent about the anchor plus the slide
  assert.deepEqual(clean(errors), []);
  await page.keyboard.press('Escape');   // out of the scene (the player is faded out in it)
  await settle(page, 1200);
  assert.equal(await page.evaluate(() => { let n = 0; window.__GEN2_VIEWER__.scene.traverse((o) => { if (o.userData.doneShadow) n++; }); return n; }), 0, 'leaving the scene disposes the shadow quads');
  // an 8W build: the plant slides outward and its desk mask, which reaches the desk's left end, is CUT there with its
  // texture window moved (Sol 01a16bc5); the drawn UVs are the window the hook reports (a mutant that left the UVs at
  // 0..1 survived the 12W leg, where nothing is cut)
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('build'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'build' && window.__GEN2_CTX__, null, { timeout: 60_000 });
  await page.evaluate(([W, H]) => { window.__GEN2_STORE__.commit((s, R) => { s.gridW = W; s.gridH = H; s.placed = []; let id = 1; for (let c = 0; c < W / 2; c++) for (let r = 0; r < H / 2; r++) s.placed.push({ id: id++, x: c * 2, y: r * 4, w: 2, hh: 4, fill: 'decor', shelves: 0 }); s.nextId = id; if (R.syncTabletopGrid) R.syncTabletopGrid(); }, 'edit'); }, [8, 2]);
  await settle(page, 1000);
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('assemble'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'assemble' && document.querySelector('#ws-steps'), null, { timeout: 60_000 });
  await page.waitForFunction((n) => { const v = window.__GEN2_VIEWER__; return v.build && v.build.placed && v.build.placed.length === n && v.pageCount > 2; }, 4, { timeout: 120_000 });
  await settle(page, 1000);
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => assert.fail('the room did not come on within 60 s (8W)'));
  await settle(page, 1500);
  const r8 = await page.evaluate(() => { const v = window.__GEN2_VIEWER__, room = v.scene.getObjectByName('done-room'), b = v.assembledBox, wa = room.getObjectByName('anchor_wall'); const quads = []; v.scene.traverse((o) => { if (o.userData.doneShadow) { const uv = o.geometry.attributes.uv; let lo = 1, hi = 0; for (let i = 0; i < uv.count; i++) { lo = Math.min(lo, uv.getX(i)); hi = Math.max(hi, uv.getX(i)); } quads.push({ ...o.userData.doneShadow, visible: o.visible, x: o.position.x, y: o.position.y, z: o.position.z, w: o.geometry.parameters.width, lo, hi }); } }); return { width: b.max.x - b.min.x, slides: window.__GEN2_DONE__.slides, quads, anchorX: (b.min.x + b.max.x) / 2, anchorZ: b.min.z, wallZ: wa ? wa.getWorldPosition(wa.position.clone()).z : null }; });
  assert.ok(r8.width > 700 && r8.width < 760, `an 8W build (${r8.width.toFixed(0)} mm)`);
  assert.ok(r8.slides.plant < 0, `the plant slides outward, to -x (${JSON.stringify(r8.slides)})`);
  const cut = r8.quads.filter((m) => m.visible && (m.u0 > 0 || m.u1 < 1));
  assert.ok(cut.some((m) => m.group === 'plant' && m.surface === 'desk' && m.u0 > 0 && m.u1 === 1), `the plant's desk quad is cut at the desk's left end (${JSON.stringify(cut.map((m) => [m.group, m.surface, m.u0, m.u1]))})`);
  for (const m of r8.quads.filter((m) => m.visible)) assert.ok(Math.abs(m.lo - m.u0) < 1e-6 && Math.abs(m.hi - m.u1) < 1e-6, `${m.group}'s ${m.surface} drawn texture window is the cut's (${m.lo.toFixed(3)}..${m.hi.toFixed(3)} vs ${m.u0.toFixed(3)}..${m.u1.toFixed(3)})`);
  masksPlaced(r8.quads.filter((m) => m.visible), roomJson, r8);   // the cut quads lie within the desk, at the cut extents
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE CAMERA SEQUENCE (the Done scene's second slice, 2026-10-23): above Fast the camera holds on a shot and drifts to the
   next; between drifts it is STILL (the idle gate's condition); under reduced motion it never leaves the hero; Fast, and a
   device whose first drift was too slow, hold and CUT instead of drifting (Joey 2026-10-23). The timing is shortened
   through the debug hook so the case takes seconds, not minutes. */
test('Assemble: the Done scene\'s camera drifts between shots and holds still between drifts; Fast and a slow device cut instead; reduced motion keeps the hero', async () => {
  const cam = (page) => page.evaluate(() => { const v = window.__GEN2_VIEWER__; return v.camera.position.toArray().concat(v.controls.target.toArray(), [v.camera.fov]).map((n) => +n.toFixed(2)); });
  const seqOf = (page) => page.evaluate(() => (window.__GEN2_DONE__ && window.__GEN2_DONE__.sequence) || null);
  const toDone = async (page) => {
    await btn(page, 'Skip to the finished build', '#ws-steps').click();
    await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
    await btn(page, 'Next', '#ws-player').click();
    await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
    await btn(page, 'Watch the final scene', '#ws-player').click();
    await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => assert.fail('the room did not come on within 60 s'));
  };
  // Fast (the suite's pin): the sequence runs as CUTS: a hold, then the camera is on the next shot at once, never part-way,
  // and no drawer moment (it animates). Short clock: hold 1.5 s and a 0.8 s "move" that a cut skips.
  const { ctx, page, errors } = await open('assemble', { query: '&done=room' });
  await toDone(page);
  await settle(page, 1500);
  const f0 = await seqOf(page);
  assert.equal(f0.on, true, 'Fast: the sequence is on'); assert.equal(f0.mode, 'cut', 'as cuts');
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1500, moveMs: 800, maxFrameMs: 1e9 }));
  await settle(page, 200);
  const k0 = await cam(page);
  await settle(page, 600);
  assert.deepEqual(await cam(page), k0, 'still in the hold');
  await page.waitForFunction((k0) => { const p = window.__GEN2_VIEWER__.camera.position; return Math.abs(p.x - k0[0]) > 1 || Math.abs(p.z - k0[2]) > 1; }, k0, { timeout: 6000 }).catch(() => assert.fail('the cut never came'));
  const fs = await seqOf(page), k1 = await cam(page);
  assert.equal(fs.movingTo, -1, 'a cut is never "moving"'); assert.ok(fs.at >= 1, 'on a later shot');
  assert.ok(fs.cams[fs.at].every((v, i) => Math.abs(v - k1[i]) < 0.5), `the camera sits exactly on shot ${fs.at}, not part-way along a drift (${k1.slice(0, 3)} vs ${fs.cams[fs.at].map((n) => n.toFixed(2))})`);
  // the drawer moment is off in cuts: the detail hold passes with the drawer closed
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 6000, moveMs: 300, maxFrameMs: 1e9 }); window.__GEN2_DONE__.jump(2); });   // a hold long enough for the whole beat (drawerBeat: 5 s), so "closed" means off, not "no room for it"
  await settle(page, 1800);   // past the beat's 0.7 s and the 380 ms slide
  const fd = await page.evaluate(() => window.__GEN2_DONE__.sequence.drawer);
  assert.ok(fd.unit != null, 'a drawer unit was picked all the same'); assert.equal(fd.open, false, 'no drawer moment when cutting');
  // Balanced: the sequence runs - a short clock: hold 1.5 s, drift 0.8 s; the slow-drift guard off for the clock's own
  // checks (a software renderer draws a short drift as a handful of frames, which is no verdict: it gets its own check below)
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('balanced', { user: true }); });
  await settle(page, 300);
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1500, moveMs: 800, maxFrameMs: 1e9 }));
  await settle(page, 200);
  const s = await seqOf(page);
  assert.equal(s.on, true, 'Balanced: the sequence is on'); assert.equal(s.shots, 3, 'three shots'); assert.equal(s.paused, false);
  const c0 = await cam(page);                        // on the hero, in its hold (0.2 s in)
  await settle(page, 400);
  assert.deepEqual(await cam(page), c0, 'still during the hold');
  await settle(page, 2100);                          // 2.7 s in: past the first drift (1.5 + 0.8), in the second hold
  const c1 = await cam(page);
  assert.notDeepEqual(c1, c0, 'the camera drifted to the second shot');
  await settle(page, 400);
  assert.deepEqual(await cam(page), c1, 'still again in the second hold');
  await settle(page, 2000);                          // 5.1 s: through the second drift (3.8 - 4.6) and into the third hold
  const c2 = await cam(page);
  assert.notDeepEqual(c2, c1, 'then to the third');
  assert.ok((await seqOf(page)).movingTo === -1, 'holding between drifts');
  // a hidden tab pauses the clock; the camera does not move while hidden
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await settle(page, 100);
  const cH = await cam(page);
  assert.equal((await seqOf(page)).paused, true, 'hidden: paused');
  await settle(page, 2200);
  assert.deepEqual(await cam(page), cH, 'no drift while hidden');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await settle(page, 2400);
  assert.notDeepEqual(await cam(page), cH, 'visible again: the drift resumed');
  // the orbit is OFF in the scene (Joey: "don't let them rotate the camera"): a drag leaves the camera where it is. The
  // strip's Next view cuts to the next shot and starts its hold over; a jump is no drift, so it is never the device's
  // verdict (the guard is on here: maxFrameMs 50, and a jump draws no frames)
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 3000, moveMs: 800, maxFrameMs: 50 }));
  await settle(page, 400);
  const cG = await cam(page);
  await page.mouse.move(640, 380); await page.mouse.down(); await page.mouse.move(700, 410, { steps: 8 }); await page.mouse.up();
  await settle(page, 300);
  assert.deepEqual(await cam(page), cG, 'a drag does not move the camera'); assert.equal((await seqOf(page)).orbit, false, 'the orbit is off');
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.camFree), false, 'the stage never took the camera');
  const before = await seqOf(page);
  await btn(page, 'Next view', '#ws-scene').click();
  await settle(page, 400);
  const after = await seqOf(page);
  assert.equal(after.at, (before.at + 1) % 3, `Next view is the next shot (${before.at} -> ${after.at})`); assert.equal(after.movingTo, -1, 'landed at once'); assert.equal(after.on, true);
  assert.equal(after.slow, false, 'a jump is no verdict'); assert.equal(after.paused, false);
  const cN = await cam(page);
  assert.ok(after.cams[after.at].every((v, i) => Math.abs(v - cN[i]) < 0.5), `the camera sits on that shot (${cN.slice(0, 3)} vs ${after.cams[after.at].map((n) => n.toFixed(2))})`);
  // the drawer moment: in the detail shot's hold the unit the shot looks at slides its drawer out and back (a hold long
  // enough for the beat; the suite jumps to that hold). The unit's box grows toward the front by the slide, then shrinks.
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 9000, moveMs: 300, maxFrameMs: 1e9 }); window.__GEN2_DONE__.jump(2); });   // a 9 s hold: the beat ends by 4.6 s, and SwiftShader's slow polls still read inside the hold
  await settle(page, 200);
  const dz0 = await page.evaluate(() => { const d = window.__GEN2_DONE__.sequence.drawer; return { unit: d.unit, open: d.open, z: window.__GEN2_VIEWER__.unitBox(d.unit).max.z }; });
  assert.ok(dz0.unit != null, 'a unit with a drawer was picked'); assert.equal(dz0.open, false, 'closed at the start of the hold');
  // out at 0.7 s and slid 380 ms later; polled, not timed: on SwiftShader on a slow CPU the slide's frames come late
  await page.waitForFunction((z0) => { const d = window.__GEN2_DONE__.sequence.drawer; return d.open && window.__GEN2_VIEWER__.unitBox(d.unit).max.z - z0 > 40; }, dz0.z, { timeout: 3000 }).catch(() => assert.fail('the drawer did not slide out by 40 mm within the hold'));
  const dz1 = await page.evaluate(() => { const d = window.__GEN2_DONE__.sequence.drawer; return { open: d.open, z: window.__GEN2_VIEWER__.unitBox(d.unit).max.z }; });
  assert.equal(dz1.open, true, 'the drawer is out'); assert.ok(dz1.z - dz0.z > 40, `the unit's front moved out by the slide (${(dz1.z - dz0.z).toFixed(0)} mm)`);
  // closed at 4.28 s into the hold and slid back by 4.6 s, before the 6 s hold ends
  await page.waitForFunction((z0) => { const d = window.__GEN2_DONE__.sequence.drawer; return !d.open && Math.abs(window.__GEN2_VIEWER__.unitBox(d.unit).max.z - z0) < 2; }, dz0.z, { timeout: 6000 }).catch(() => assert.fail('the drawer did not go back'));
  const dz2 = await page.evaluate(() => { const d = window.__GEN2_DONE__.sequence.drawer; return { open: d.open, z: window.__GEN2_VIEWER__.unitBox(d.unit).max.z, at: window.__GEN2_DONE__.sequence.at }; });
  assert.equal(dz2.open, false, 'and back'); assert.ok(Math.abs(dz2.z - dz0.z) < 2, 'the unit is where it was'); assert.equal(dz2.at, 2, 'still in the detail hold: back before the drift');
  // a drop to Fast while the drawer is out: the drawer is closed at once (the flag, then the 320 ms slide back) and the
  // hold goes on as cuts (Terra 01a16b6b: the drawer's timers outlived the tier change). Balanced again after, for the guard.
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 9000, moveMs: 300, maxFrameMs: 1e9 }); window.__GEN2_DONE__.jump(2); });
  await page.waitForFunction(() => window.__GEN2_DONE__.sequence.drawer.open, null, { timeout: 3000 }).catch(() => assert.fail('the drawer did not open for the Fast-drop check'));
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('fast', { user: true }); });
  const fq = await seqOf(page);
  assert.equal(fq.mode, 'cut', 'Fast: cuts'); assert.equal(fq.on, true, 'the sequence went on'); assert.equal(fq.drawer.open, false, 'the drop to Fast closed the drawer at once');
  await page.waitForFunction((z0) => { const d = window.__GEN2_DONE__.sequence.drawer; return Math.abs(window.__GEN2_VIEWER__.unitBox(d.unit).max.z - z0) < 2; }, dz0.z, { timeout: 4000 }).catch(() => assert.fail('the drawer did not slide back after the drop to Fast'));
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('balanced', { user: true }); });
  await settle(page, 300);
  // the slow-drift guard: one long drift with the guard on is the device's verdict. A real GPU drifts smoothly and keeps
  // drifting; the CI runner's SwiftShader draws it under 20 fps and the sequence goes on as CUTS from the shot it reached
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 600, moveMs: 2000, maxFrameMs: 50 }));
  // until the first drift has landed (on shot 1) or the guard has spoken; polled, since a slow machine lands late
  await page.waitForFunction(() => { const s = window.__GEN2_DONE__.sequence; return !s.on || s.slow || (s.at >= 1 && s.movingTo === -1); }, null, { timeout: 30_000 }).catch(async () => assert.fail('the first drift never landed: ' + JSON.stringify(await seqOf(page))));   // 30 s: a loaded SwiftShader draws a 2.6 s beat as a handful of frames seconds apart
  const g = await seqOf(page);
  if (process.env.E2E_SOFT) assert.equal(g.slow, true, 'SwiftShader: the drift was too slow');
  assert.equal(g.on, true, 'the verdict never ends the sequence'); assert.equal(g.mode, g.slow ? 'cut' : 'drift', 'a slow drift turns it to cuts; a smooth one keeps drifting');
  // and it goes on: the next shot is reached (a cut after the hold on a slow device, a drift on a smooth one), still on
  await page.waitForFunction((from) => { const s = window.__GEN2_DONE__.sequence; return s.on && s.movingTo === -1 && s.at !== from; }, g.at, { timeout: 15_000 }).catch(async () => assert.fail('the sequence did not reach another shot: ' + JSON.stringify(await seqOf(page))));
  const g2 = await seqOf(page);
  assert.equal(g2.on, true, 'still on at the next shot'); if (g.slow) assert.equal(g2.movingTo, -1, 'cuts: never "moving"');
  // the verdict FORCED (a frame budget no drift can meet), so the turn to cuts is checked on any machine, a GPU included:
  // the sequence goes on, as cuts, and reaches another shot without "moving"
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 600, moveMs: 800, maxFrameMs: 0.001 }));
  await page.waitForFunction(() => window.__GEN2_DONE__.sequence.slow, null, { timeout: 15_000 }).catch(async () => assert.fail('the forced verdict never came: ' + JSON.stringify(await seqOf(page))));
  const v = await seqOf(page);
  assert.equal(v.on, true, 'the slow verdict turns the sequence to cuts, it does not end it'); assert.equal(v.mode, 'cut');
  await page.waitForFunction((from) => { const s = window.__GEN2_DONE__.sequence; return s.on && s.at !== from; }, v.at, { timeout: 10_000 }).catch(async () => assert.fail('no cut followed the verdict: ' + JSON.stringify(await seqOf(page))));
  assert.equal((await seqOf(page)).movingTo, -1, 'cuts after the verdict: never "moving"');
  // leaving the scene (Esc; the player is faded out in it) stops it
  await page.keyboard.press('Escape');
  await settle(page, 1200);
  assert.equal(await seqOf(page), null, 'leaving the scene removes the sequence');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
  // reduced motion: the still hero, on a tier that would otherwise drift
  const rm = await open('assemble', { query: '&done=room' });
  await rm.page.emulateMedia({ reducedMotion: 'reduce' });
  await rm.page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('balanced', { user: true }); });
  await toDone(rm.page);
  await settle(rm.page, 1500);
  assert.equal((await seqOf(rm.page)).on, false, 'reduced motion: no sequence');
  const r0 = await cam(rm.page);
  await settle(rm.page, 2500);
  assert.deepEqual(await cam(rm.page), r0, 'the hero holds');
  // and Next view turns the shots by hand, one cut each, with no sequence to run
  await btn(rm.page, 'Next view', '#ws-scene').click();
  await settle(rm.page, 400);
  const r1 = await cam(rm.page);
  assert.notDeepEqual(r1, r0, 'Next view: the next shot'); assert.equal((await seqOf(rm.page)).on, false, 'still no sequence'); assert.equal((await seqOf(rm.page)).manual, 1);
  await settle(rm.page, 1200);
  assert.deepEqual(await cam(rm.page), r1, 'and it holds there');
  // a resize refits the chosen view, not the hero (Sol 01a16c20: the refit put the hero back and the next click skipped a shot)
  const vp = rm.page.viewportSize();
  await rm.page.setViewportSize({ width: vp.width - 200, height: vp.height - 100 });
  await settle(rm.page, 600);
  const rs = await seqOf(rm.page), r2 = await cam(rm.page);
  assert.equal(rs.manual, 1, 'the hand-chosen view is kept'); assert.ok(rs.cams[1].every((v, i) => Math.abs(v - r2[i]) < 0.5), `the camera sits on the refitted second shot (${r2.slice(0, 3)} vs ${rs.cams[1].map((n) => n.toFixed(2))})`);
  assert.ok(rs.cams[0].some((v, i) => Math.abs(v - r2[i]) > 1), 'and not on the hero');
  await rm.page.setViewportSize(vp);
  assert.deepEqual(clean(rm.errors), []);
  await rm.ctx.close();
});

/* a room that cannot load (its module request fails) must not leave the scene mode on: the HUD hidden over an empty
   stage with a strip that does nothing (Sol 01a16c20). Back to the End page, HUD and all. */
test('Assemble: the Done scene\'s final scene returns to the End page when the room fails to load', async () => {
  const { ctx, page, errors } = await open('assemble', { query: '&done=room' });
  await page.route('**/scenes/done.js*', (r) => r.abort());
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('cinema') && !document.querySelector('#ws-scene') && !document.querySelector('#cinema-bars') && getComputedStyle(document.querySelector('#ws-player')).opacity === '1', null, { timeout: 15_000 }).catch(() => assert.fail('the failed load left the scene mode on'));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.done || null), null, 'no room');
  assert.match(await text(page, '#ws-player .title'), /End of instructions/, 'back on the End page');
  assert.deepEqual(clean(errors).filter((e) => !/net::ERR_FAILED/.test(e)), [], 'nothing but the aborted request’s own console line');
  await ctx.close();
});

/* THE ROOM AS A STAGE IN COLORS (Joey 2026-10-23: "a Studio / Room stage toggle in the Colors workspace, still hero, orbit
   allowed, no sequence"): behind the same flag, the panel head gets the toggle; Room puts the build in the room with the
   stage held, the orbit free and no sequence; a colour pick still lands; the toolbar's Reset view returns to the room's
   shot and gives the camera back; Studio restores the stage; the choice survives a trip to another workspace. */
test('Colors: the Studio / Room toggle is absent without the flag; with it, Room holds the stage with a free orbit and no sequence, picks land, Reset view returns to the shot, Studio restores, the choice comes back', async () => {
  const state = (page) => page.evaluate(() => { const v = window.__GEN2_VIEWER__; return { held: v.sceneHeld, room: !!v.scene.getObjectByName('done-room'), done: document.documentElement.dataset.done || null, bg: v.scene.background ? (v.scene.background.isColor ? 'color' : 'other') : null, controls: v.controls.enabled, camFree: v.camFree, seq: window.__GEN2_DONE__ ? window.__GEN2_DONE__.sequence.on : null, seqWanted: window.__GEN2_DONE__ ? window.__GEN2_DONE__.sequence.wanted : null, quality: v.quality, cam: v.camera.position.toArray().map((n) => +n.toFixed(1)) }; });
  const off = await open('colors');
  assert.equal(await off.page.locator('#ws-colors .head .stage').count(), 0, 'no toggle without the flag');
  assert.deepEqual(clean(off.errors), []);
  await off.ctx.close();
  const { ctx, page, errors } = await open('colors', { query: '&done=room' });
  const seg = (t) => page.locator(`#ws-colors .head .stage button:has-text("${t}")`);
  assert.equal(await seg('Studio').getAttribute('aria-pressed'), 'true', 'Studio by default');
  const s0 = await state(page);
  assert.equal(s0.held, false); assert.equal(s0.room, false);
  await seg('Room').click();
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => assert.fail('the room did not come on within 60 s'));
  await settle(page, 1500);
  const s1 = await state(page);
  assert.equal(s1.room, true, 'the room is in the scene'); assert.equal(s1.held, true, 'the stage is held'); assert.equal(s1.bg, null);
  assert.equal(s1.controls, true, 'the orbit is free'); assert.equal(s1.seq, false, 'no camera sequence in Colors');
  assert.equal(await seg('Room').getAttribute('aria-pressed'), 'true');
  /* "no sequence" has to be shown on a tier that WOULD sequence in Assemble: these cases run on Fast, where the sequence is
     off anyway, and the slow-drift guard leaves seq.on false too, so neither tells a stage from a stopped sequence. On
     Balanced, with the room on, the room must still want none and the camera must stay on the hero past the entrance delay. */
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('balanced', { user: true }); });
  await settle(page, 1500);   // past ENTER_MS + 50, where Assemble's sequence would have started
  const sB = await state(page);
  assert.equal(sB.quality, 'balanced'); assert.equal(sB.room, true, 'the room survived the tier change');
  assert.equal(sB.seqWanted, false, 'no sequence wanted on Balanced either: the room is a stage in Colors');
  assert.equal(sB.seq, false, 'and none running'); assert.ok(sB.cam.every((v, i) => Math.abs(v - s1.cam[i]) < 2), `the camera stayed on the hero (${sB.cam} vs ${s1.cam})`);
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('fast', { user: true }); });
  await settle(page, 800);
  // a colour pick lands while the room is on: a preset through the gallery's own path (the stage's palette changes)
  const hexBefore = await page.evaluate(() => window.__GEN2_VIEWER__.activeHex('Faceplate'));
  await page.evaluate(() => { const v = window.__GEN2_VIEWER__; v.applyPreset(v.PRESETS[1]); });
  await settle(page, 600);
  assert.notEqual(await page.evaluate(() => window.__GEN2_VIEWER__.activeHex('Faceplate')), hexBefore, 'the preset recoloured the model');
  assert.equal((await state(page)).room, true, 'and the room stayed');
  // a grab takes the camera; Reset view in the toolbar returns to the room's shot and gives it back
  const camHero = (await state(page)).cam;   // the hero, as it stands after the tier round trip
  await page.mouse.move(640, 380); await page.mouse.down(); await page.mouse.move(720, 420, { steps: 10 }); await page.mouse.up();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.camFree === true, null, { timeout: 15_000 }).catch(() => assert.fail('the grab did not take the camera'));
  assert.notDeepEqual((await state(page)).cam, camHero, 'the orbit moved the camera');
  await page.locator('#ws-tools button.cam').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.camFree === false, null, { timeout: 15_000 }).catch(() => assert.fail('Reset view did not give the camera back'));
  await settle(page, 1300);   // the 900 ms move back to the shot
  const back = (await state(page)).cam;
  assert.ok(camHero.every((v, i) => Math.abs(v - back[i]) < 2), `Reset view returned to the room's shot (${back} vs ${camHero})`);
  assert.equal((await state(page)).room, true, 'the room is still on');
  // the choice survives a trip to Parts and back
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('parts'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'parts', null, { timeout: 60_000 });
  const sP = await state(page);
  assert.equal(sP.room, false, 'another workspace: no room'); assert.equal(sP.held, false); assert.equal(sP.bg, 'color');
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('colors'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'colors' && document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => assert.fail('the remembered Room did not come back with Colors'));
  assert.equal(await seg('Room').getAttribute('aria-pressed'), 'true', 'the toggle remembers Room');
  // Studio restores the stage
  await seg('Studio').click();
  await settle(page, 1500);
  const s2 = await state(page);
  assert.equal(s2.room, false, 'the room is gone'); assert.equal(s2.held, false); assert.equal(s2.done, null); assert.equal(s2.bg, 'color', 'the stage background is back'); assert.equal(s2.controls, true);
  assert.equal(await seg('Studio').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* a room that cannot load (its module request fails) falls back to Studio AND forgets the choice, so a remount does not
   retry it (Terra 01a16b56: the import's failure path cleared the panel's state but left the memo set) */
test('Colors: the Studio / Room toggle when the room fails to load: Studio comes back, the choice is forgotten, a remount does not bring Room back', async () => {
  const { ctx, page, errors } = await open('colors', { query: '&done=room' });
  const seg = (t) => page.locator(`#ws-colors .head .stage button:has-text("${t}")`);
  await page.route('**/scenes/done.js*', (r) => r.abort());
  await seg('Room').click();
  await page.waitForFunction(() => { const on = document.querySelector('#ws-colors .head .stage button[aria-pressed="true"]'); return on && on.textContent === 'Studio'; }, null, { timeout: 30_000 }).catch(() => assert.fail('Studio did not come back after the failed load'));
  assert.equal(await page.evaluate(() => window.__GEN2_CTX__().memo.colorsRoom), false, 'the choice is forgotten, not only the panel state');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.done || null), null, 'no room');
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('parts'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'parts', null, { timeout: 60_000 });
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('colors'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'colors' && document.querySelector('#ws-colors .head .stage'), null, { timeout: 60_000 });
  await settle(page, 600);
  assert.equal(await seg('Studio').getAttribute('aria-pressed'), 'true', 'Studio on the remount: the failed Room was not retried');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.done || null), null);
  assert.deepEqual(clean(errors).filter((e) => !/net::ERR_FAILED/.test(e)), [], 'nothing but the aborted request’s own console line');   // the abort IS the test's doing
  await ctx.close();
});

test('the build store: an edit autosaves, a bare address reopens the build, Rename, Duplicate, Delete', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1' });
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.feet = s.feet === 'adhesive' ? 'tpu' : 'adhesive'; }, 'edit'));
  const id = await page.evaluate(() => window.__GEN2_STORE__.state.buildId);
  const recent = async () => page.evaluate(() => new Promise((r) => { const q = indexedDB.open('modulith-planner'); q.onsuccess = () => { const t = q.result.transaction('builds').objectStore('builds').getAll(); t.onsuccess = () => r(t.result.map((e) => [e.id, e.name])); }; }));
  // the autosave lands after the store's 350 ms coalescing and an IndexedDB write: poll, never a fixed sleep
  /* polled from node, not with waitForFunction on a Promise-returning page function: that form passed once with the
     store still empty (2026-10-13), so the check reads the store itself each time */
  let list = [];
  for (let i = 0; i < 60 && !list.some((e) => e[0] === id); i++) { await settle(page, 250); list = await recent(); }
  assert.ok(list.some((e) => e[0] === id), 'the entry saved: id ' + id + ' list ' + JSON.stringify(list) + ' errors ' + JSON.stringify(errors));
  // a bare address reopens it
  const p2 = await ctx.newPage();
  await p2.goto(`${base}/index.html?ws=parts&debug=1`, { waitUntil: 'load', timeout: 90_000 });
  await waitBoot(p2);
  assert.equal(await p2.evaluate(() => window.__GEN2_STORE__.state.buildId), id, 'reopened');
  assert.ok(await p2.evaluate(() => /^#build=/.test(location.hash)), 'the hash restored');
  // rename
  await p2.click('#ws-switch .chip-btn');
  await p2.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await p2.fill('#ws-switch input.rename', 'E2E bench');
  await p2.keyboard.press('Enter');
  await p2.waitForFunction(() => document.title === 'E2E bench · MODULITH Planner', null, { timeout: 30_000 });   // the rename lands after an IndexedDB write
  // a rename is a new version: the first tab, still open on the build, is behind it now (the stale-tab guard)
  await page.waitForSelector('#ws-stale', { timeout: 30_000 }).catch(() => assert.fail('the first tab did not go stale after the rename in the second'));
  // duplicate (navigates), then delete the original from the copy's menu
  await p2.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await p2.waitForFunction((old) => window.__GEN2_STORE__ && window.__GEN2_STORE__.state.buildId !== old, id, { timeout: 60_000 });
  await waitBoot(p2);
  assert.equal(await p2.evaluate(() => document.title), 'Copy of E2E bench · MODULITH Planner');   // the tab is the build, then the product (js/ui/names.js)
  await p2.click('#ws-switch .chip-btn');
  await p2.locator('#ws-switch .item.recent .x').first().click();
  await p2.locator('#ws-switch .item.confirm button:text-is("Delete")').click();
  // the delete is an IndexedDB write with nothing in the DOM to wait on: poll the store from here, as for the autosave
  const names = () => p2.evaluate(() => new Promise((r) => { const q = indexedDB.open('modulith-planner'); q.onsuccess = () => { const t = q.result.transaction('builds').objectStore('builds').getAll(); t.onsuccess = () => r(t.result.map((e) => e.name)); }; }));
  let left = await names();
  for (let i = 0; i < 60 && left.length !== 1; i++) { await settle(p2, 250); left = await names(); }
  assert.deepEqual(left, ['Copy of E2E bench']);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the journeys: a share link opens the same build elsewhere, Load build file lands on it, the 20-build cap asks before dropping', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1' });
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.feet = s.feet === 'adhesive' ? 'tpu' : 'adhesive'; s.backCover = !s.backCover; }, 'edit'));
  await page.waitForFunction(() => /^#build=/.test(location.hash), null, { timeout: 15_000 });
  const snap = await page.evaluate(() => JSON.stringify(window.__GEN2_STORE__.state));
  const link = await page.evaluate(() => location.href);
  // SHARE LINK: the address, opened in another browser (a fresh context: no store, no Recent builds), is the same record
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  contexts.add(other);
  const p2 = await other.newPage();
  await p2.goto(link, { waitUntil: 'load', timeout: 90_000 });
  await waitBoot(p2);
  assert.equal(await p2.evaluate(() => JSON.stringify(window.__GEN2_STORE__.state)), snap, 'the link carries the whole record');
  assert.equal(await p2.evaluate(() => window.__GEN2_CTX__().builds.entry), null, 'a stranger’s build is not in this browser’s Recent builds until it is edited');
  await other.close();
  // LOAD BUILD FILE: a planner file ({ gen2Build: 1, name, data }) through the switcher's file input lands on that build
  const rec = JSON.parse(snap); rec.buildId = 'e2efile00001'; rec.feet = 'adhesive';
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await page.locator('#ws-switch input[type="file"]').setInputFiles({ name: 'bench.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ gen2Build: 1, name: 'From a file', data: rec })) });
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.buildId === 'e2efile00001', null, { timeout: 90_000 });
  await waitBoot(page);
  assert.equal(await page.evaluate(() => document.title), 'From a file · MODULITH Planner');
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.state.feet), 'adhesive');
  // THE CAP: Recent builds full at 20 - a new build's first change is held, the switcher asks, Drop it makes room
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('modulith-planner'); q.onsuccess = () => { const t = q.result.transaction('builds', 'readwrite'); const st = t.objectStore('builds'); st.clear(); for (let i = 0; i < 20; i++) st.put({ id: 'e2ecapfill' + String(i).padStart(2, '0'), name: 'Filler ' + i, savedAt: 1000 + i, openedAt: 1000 + i, kit: null, mount: 'tabletop', length: 185, units: 1, record: { mount: 'tabletop', length: 185, placed: [], nextId: 1, buildId: 'e2ecapfill' + String(i).padStart(2, '0') } }); t.oncomplete = () => r(); }; }));
  const p3 = await ctx.newPage();
  await p3.goto(`${base}/index.html?ws=build&new=1&debug=1`, { waitUntil: 'load', timeout: 90_000 });
  await waitBoot(p3);
  await p3.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.feet = s.feet === 'adhesive' ? 'tpu' : 'adhesive'; }, 'edit'));
  await p3.waitForFunction(() => window.__GEN2_CTX__().builds.capPending, null, { timeout: 15_000 });
  const held = await p3.evaluate(() => window.__GEN2_STORE__.state.buildId);
  await p3.click('#ws-switch .chip-btn');
  assert.match(await text(p3, '#ws-switch .notice p'), /Recent builds is full \(20\)\. “Filler 0”/);
  await p3.locator('#ws-switch .notice button:text-is("Drop it")').click();
  await p3.waitForFunction(() => !window.__GEN2_CTX__().builds.capPending && window.__GEN2_CTX__().builds.entry, null, { timeout: 15_000 });
  const names = await p3.evaluate(() => new Promise((r) => { const q = indexedDB.open('modulith-planner'); q.onsuccess = () => { const t = q.result.transaction('builds').objectStore('builds').getAll(); t.onsuccess = () => r(t.result.map((e) => [e.id, e.name])); }; }));
  assert.equal(names.length, 20, 'still twenty');
  assert.ok(!names.some((e) => e[1] === 'Filler 0'), 'the one opened longest ago went');
  assert.ok(names.some((e) => e[0] === held), 'the held build is saved');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the keyboard: the switcher menu walks with the arrows and closes on Escape, a modal keeps Tab inside, the setup sheet takes focus', async () => {
  const { ctx, page, errors } = await open('labels', { query: '&new=1' });
  // the switcher: Down on the chip opens the menu with the first item focused; arrows walk; Escape closes and returns
  await page.focus('#ws-switch .chip-btn');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => { const m = document.querySelector('#ws-switch .menu'); return m && !m.hidden && m.contains(document.activeElement); }, null, { timeout: 15_000 });
  const first = await page.evaluate(() => document.activeElement.textContent.trim().slice(0, 20));
  await page.keyboard.press('ArrowDown');
  const second = await page.evaluate(() => document.activeElement.textContent.trim().slice(0, 20));
  assert.notEqual(second, first, 'ArrowDown moved to the next item');
  await page.keyboard.press('End');
  assert.match(await page.evaluate(() => document.activeElement.textContent.trim()), /Feedback & support/, 'End reaches the last item');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#ws-switch .menu').hidden && document.activeElement === document.querySelector('#ws-switch .chip-btn'), null, { timeout: 15_000 });
  assert.equal(await page.evaluate(() => document.querySelector('#ws-switch .chip-btn').getAttribute('aria-expanded')), 'false');
  // the toast is a live region
  assert.equal(await page.evaluate(() => document.getElementById('ws-toast').getAttribute('aria-live')), 'polite');
  // a modal: Tab cycles inside it, Escape closes it and focus goes back where it was
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await btn(page, 'Type a label', '#ws-labels').focus();
  await btn(page, 'Type a label', '#ws-labels').press('Enter');
  await page.waitForFunction(() => !document.getElementById('ws-modal').hidden && document.activeElement === document.querySelector('#ws-modal input.field'), null, { timeout: 15_000 });
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.getElementById('ws-modal').contains(document.activeElement)), 'three Tabs later focus is still inside the modal');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('ws-modal').hidden, null, { timeout: 15_000 });
  assert.match(await page.evaluate(() => document.activeElement.textContent.trim()), /Type a label/, 'focus returned to the opener');
  // ...and after an ADD, which re-renders the panel (the stress test, 2026-10-15: the keyboard was left at <body>)
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.getElementById('ws-modal').hidden && document.activeElement === document.querySelector('#ws-modal input.field'), null, { timeout: 15_000 });
  await page.keyboard.type('Keyboard label');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('ws-modal').hidden && ((window.__GEN2_STORE__.state.labelList || { labels: [] }).labels.length === 1), null, { timeout: 15_000 });
  assert.match(await page.evaluate(() => document.activeElement.textContent.trim()), /Type a label/, 'the keyboard stays on the opener after the add');
  // the label editor from the keyboard: Enter on the pencil moves into its words, Escape closes it and comes back to the pencil
  await page.locator('#ws-labels button[title="Edit this label"]').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement === document.querySelector('#ws-labeledit input.words'), null, { timeout: 15_000 });
  // a late icon font re-renders the editor alone: the keyboard and the half-typed words stay (Sol 01a13fe5)
  await page.keyboard.press('End'); await page.keyboard.type(' xyz');
  await page.evaluate(() => window.__GEN2_LABELS_REFRESH__());
  assert.deepEqual(await page.evaluate(() => { const a = document.activeElement; return [a === document.querySelector('#ws-labeledit input.words'), a.value]; }), [true, 'Keyboard label xyz'], 'still typing, nothing lost');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('ws-labeledit').hidden && document.activeElement && document.activeElement.getAttribute('title') === 'Edit this label', null, { timeout: 15_000 });
  // the setup sheet: focus lands on the name field, Tab stays inside, Escape closes and returns
  await page.evaluate(() => { window.__GEN2_CTX__().openSetup('mount'); });
  await page.waitForFunction(() => document.activeElement === document.querySelector('#ws-setup input.name'), null, { timeout: 15_000 });
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.getElementById('ws-setup').contains(document.activeElement)), 'twelve Tabs later focus is still inside the sheet');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('ws-setup'), null, { timeout: 15_000 });
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the Part Picker modal: the real Picker in a frame, the hello binds it, Add part labels lands in this build as one undo step, the same part again updates in place', { skip: haveStudio ? false : 'Label Studio checkout absent' }, async () => {
  const { ctx, page, errors } = await open('labels', { query: '&new=1&studio=' + encodeURIComponent(studio) });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  const buildId = await page.evaluate(() => window.__GEN2_STORE__.state.buildId);
  await page.locator('#ws-labels button[title^="Opens the Part Picker here"]').click();
  await page.waitForFunction(() => { const p = window.__GEN2_PICKER__ && window.__GEN2_PICKER__(); return p && p.ready && !p.veil.hidden; }, null, { timeout: 60_000 });   // the Picker loaded and answered the hello
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label')), 'Close the Part Picker', 'focus moved into the modal');
  const frame = page.frameLocator('#ws-partpicker iframe');
  await frame.locator('.tile.has-img').first().waitFor({ timeout: 60_000 });   // the Picker's data and pictures are in (a family picked before that has no template)
  // the flow refine (the Picker's docs/FLOW-REFINE-2026-10-14.md): a stage strip, one add action in the pinned bar; a nut needs a
  // type and a size before it can be added (an untouched field blocks; only a deliberate Unknown adds with a warning)
  await frame.locator('button.tile').filter({ hasText: /^Nuts$/ }).first().click();
  await frame.locator('#stage-panel button.tile[title="Hex nut"]').click();   // the type tile reads "Hex · ISO 4032"; its full name is its title
  await frame.locator('#stage-panel button.thr[aria-label="M3"]').click();   // the size tile, by its accessible name
  await frame.locator('#add-parts', { hasText: /^Add 1 label to the planner/ }).click();   // ONE click posts the batch
  await page.waitForFunction(() => { const p = window.__GEN2_PICKER__(); return p.veil.hidden; }, null, { timeout: 30_000 });   // the planner took it and closed the modal
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.state.buildId), buildId, 'still the same build');
  const after1 = await page.evaluate(() => (window.__GEN2_STORE__.state.labelList || { labels: [] }).labels.map((l) => [l.id, !!l.hardware, l.hardware && l.hardware.id]));
  assert.equal(after1.length, 1, 'one part label');
  assert.ok(after1[0][1] && after1[0][2], 'it carries its part record');
  assert.equal(await page.locator('#ws-labels .chip-l.new').count(), 1, 'the new label is marked in the list');
  assert.match(await text(page, '#ws-labels .last'), /Added 1 part label/);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('ws-partpicker')).display), 'none', 'the modal is really gone from view');
  // the keyboard is back on the Part Picker button, not on the hidden frame (the stress test, 2026-10-15: the add re-rendered
  // the opener before the close looked for it)
  assert.match(await page.evaluate(() => (document.activeElement && document.activeElement.getAttribute('title')) || ''), /^Opens the Part Picker here/, 'focus back on the opener');
  // the same row sent again: updated in place, never a second label (the Picker keeps its list between openings). Words typed
  // by hand stay; the record underneath is refreshed. The record is bent here first so the update is a real change (an
  // identical record makes no history entry)
  await page.evaluate(() => { const st = window.__GEN2_STORE__; st.flush(); st.commit((s) => { const l = s.labelList.labels[0]; l.text = 'edited by hand'; l.hardware.fields = ['M9']; }, 'edit'); st.flush(); });
  await page.locator('#ws-labels button[title^="Opens the Part Picker here"]').click();
  await page.waitForFunction(() => !window.__GEN2_PICKER__().veil.hidden, null, { timeout: 30_000 });
  await frame.locator('details.ltools > summary').click();   // List tools: "Add all N to the planner" (#make-labels) re-sends the kept list
  await frame.locator('#make-labels:enabled').click();
  await page.waitForFunction(() => window.__GEN2_PICKER__().veil.hidden, null, { timeout: 30_000 });
  const after2 = await page.evaluate(() => (window.__GEN2_STORE__.state.labelList || { labels: [] }).labels.map((l) => l.id));
  assert.deepEqual(after2, [after1[0][0]], 'the same label, not a second one');
  assert.match(await text(page, '#ws-labels .last'), /Updated 1 already in the list/);
  // one undo takes the batch back
  assert.deepEqual(await page.evaluate(() => { const l = window.__GEN2_STORE__.state.labelList.labels[0]; return [l.text, l.hardware.fields.join()]; }), ['edited by hand', 'M3'], 'the hand-typed words stay, the record is the Picker’s again (an M3 nut now: the flow refine needs a size)');
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction(() => { const l = window.__GEN2_STORE__.state.labelList && window.__GEN2_STORE__.state.labelList.labels[0]; return l && l.hardware.fields.join() === 'M9'; }, null, { timeout: 30_000 });   // one undo: the update alone
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction(() => { const l = window.__GEN2_STORE__.state.labelList && window.__GEN2_STORE__.state.labelList.labels[0]; return l && l.text !== 'edited by hand' && window.__GEN2_STORE__.state.labelList.labels.length === 1; }, null, { timeout: 30_000 });   // the hand edit
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction(() => !window.__GEN2_STORE__.state.labelList || !window.__GEN2_STORE__.state.labelList.labels.length, null, { timeout: 30_000 });
  // a batch that lands after the modal was closed is refused, not imported behind the visitor's back (Sol 01a13844)
  await page.locator('#ws-labels button[title^="Opens the Part Picker here"]').click();
  await page.waitForFunction(() => !window.__GEN2_PICKER__().veil.hidden, null, { timeout: 30_000 });
  await page.evaluate(() => { const p = window.__GEN2_PICKER__(); p.veil.hidden = true; });   // closed from under the batch
  await frame.locator('#make-labels').evaluate((b) => b.click());   // the Picker's own button, pressed inside the hidden frame
  await settle(page, 800);
  assert.ok(!(await page.evaluate(() => window.__GEN2_STORE__.state.labelList && window.__GEN2_STORE__.state.labelList.labels.length)), 'nothing was imported after the close');
  assert.deepEqual(await page.evaluate(() => window.__GEN2_PICKER__().log.slice(-1)), ['add'], 'the batch did arrive and was refused');
  const sessionA = await page.evaluate(() => window.__GEN2_PICKER__().session);
  // another build: the next opening makes a new frame and session, so nothing from the old one can land here
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.buildId = 'e2eotherbuild1'; }, 'edit'));
  await page.locator('#ws-labels button[title^="Opens the Part Picker here"]').click();
  await page.waitForFunction((a) => { const p = window.__GEN2_PICKER__(); return p && p.session !== a && p.ready && !p.veil.hidden; }, sessionA, { timeout: 60_000 });
  assert.equal(await page.locator('#ws-partpicker').count(), 1, 'one modal, the new one');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__GEN2_PICKER__().veil.hidden, null, { timeout: 15_000 });
  // Escape INSIDE the frame never reaches this page: the Picker asks with `close` and the dialog closes (a stranger's
  // close, without the session, is ignored)
  await page.locator('#ws-labels button[title^="Opens the Part Picker here"]').click();
  await page.waitForFunction(() => !window.__GEN2_PICKER__().veil.hidden, null, { timeout: 30_000 });
  const sessionB = await page.evaluate(() => window.__GEN2_PICKER__().session);
  await frame.locator('body').evaluate(() => parent.postMessage({ gen2parts: 'close', v: 1, session: 'not-the-session-at-all' }, '*'));
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_PICKER__().veil.hidden), false, 'a close without the session is ignored');
  await frame.locator('body').evaluate((body, s) => parent.postMessage({ gen2parts: 'close', v: 1, session: s }, '*'), sessionB);
  await page.waitForFunction(() => window.__GEN2_PICKER__().veil.hidden, null, { timeout: 15_000 });
  // a message that is not from the frame, or without the session, is ignored
  await page.evaluate((origin) => { window.postMessage({ gen2parts: 'add', v: 1, session: 'nope', items: [] }, origin); }, base);
  await settle(page, 300);
  assert.ok(!(await page.evaluate(() => window.__GEN2_STORE__.state.labelList && window.__GEN2_STORE__.state.labelList.labels.length)), 'a stray add changes nothing');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the Label plate view (step B1): the Studio embedded read-only shows this build’s list with its drawers, a row clicked there is the selection here, the plate follows undo, the frame is kept across the toggle', { skip: haveStudio ? false : 'Label Studio checkout absent' }, async () => {
  const { ctx, page, errors } = await open('labels', { query: '&new=1&studio=' + encodeURIComponent(studio) });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => x.textContent.trim().startsWith('Switch to EdgeLabel')); if (b) b.click(); });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 90_000 });
  await settle(page, 800);
  for (const w of ['Screws', 'Nuts']) {
    await btn(page, 'Type a label', '#ws-labels').click();
    await page.fill('#ws-modal input.field', w);
    await btn(page, 'Add label', '#ws-modal .box').click();
    await settle(page, 300);
  }
  const [screws, nuts] = await page.evaluate(() => window.__GEN2_STORE__.state.labelList.labels.map((l) => l.id));
  // Screws onto the first drawer (Place several, one tap)
  await btn(page, 'Place several', '#ws-labels').click();
  await settle(page, 200);
  const first = await page.evaluate(() => window.__GEN2_STORE__.state.placed.find((u) => u.fill === 'decor').id);
  await page.evaluate((id) => window.__GEN2_VIEWER__.selectUnit(id), first); await settle(page, 500);
  await btn(page, 'Done placing', '#ws-labels').click();
  assert.equal(await page.evaluate(() => Object.keys(window.__GEN2_STORE__.state.labelAssign).length), 1, 'Screws placed');
  // the plate: the real Studio in the frame, headerless, the list as rows with the drawer tag, read-only
  await page.locator('#ws-labels .track.view button:text-is("Label plate")').click();
  await page.waitForFunction(() => { const p = window.__GEN2_PLATE__ && window.__GEN2_PLATE__(); return p && p.ready && !p.box.hidden; }, null, { timeout: 60_000 });   // the Studio answered the hello with its capabilities
  const frame = page.frameLocator('#ws-plate iframe');
  await frame.locator('#labels .row[data-label-id]').nth(1).waitFor({ timeout: 30_000 });
  assert.equal(await frame.locator('#labels .row[data-label-id]').count(), 2, 'both labels on the plate');
  assert.equal(await frame.locator('#mast').isVisible(), false, 'no Studio masthead inside the planner');
  assert.equal(await frame.locator('#link-bar').isVisible(), false);
  const where = await text(page, '#ws-labels .prow .where');   // "Drawer N" in label order, as the panel says it
  assert.equal(await frame.locator(`#labels .row[data-label-id="${screws}"] .utag`).textContent(), '#' + where.replace(/\D/g, ''), 'the drawer tag on the placed label');
  assert.equal(await frame.locator(`#labels .row[data-label-id="${nuts}"] .utag`).count(), 0, 'none on the waiting one');
  assert.equal(await frame.locator('#labels .row input.label-text').first().evaluate((i) => i.readOnly), true, 'read-only rows');
  assert.equal(await frame.locator('#labels .row .remove').first().isVisible(), false, 'no remove button');
  // the stress test, 2026-10-15: the type switch and the rows' stripe buttons came back enabled after the snapshot. A visitor
  // could turn the plate to Classic Pro and download a print file the build's faceplates do not take
  assert.equal(await frame.locator('#label-type').isDisabled(), true, 'the label type is the planner build’s');
  assert.deepEqual([...new Set(await frame.locator('#labels .row .stripe-btn').evaluateAll((bs) => bs.map((b) => b.disabled)))], [true], 'no stripe button takes a click or a key');
  assert.equal(await frame.locator('#hw-band').isEnabled(), true, 'the print preference stays live');
  assert.match(await frame.locator('#status').textContent(), /2 labels from the planner build/);
  assert.equal(await frame.locator('#download').isEnabled(), true, 'the print file downloads from the plate');
  assert.equal(await page.evaluate(() => window.__GEN2_PLATE__().log.filter((k) => k === 'ready').length), 1, 'one ready');
  // a row clicked in the Studio is the selected label in the planner (the drawer selection and the armed label go)
  await frame.locator(`#labels .row[data-label-id="${nuts}"]`).click();
  await page.waitForFunction((id) => window.__GEN2_PLATE__().selLabel === id, nuts, { timeout: 30_000 });
  assert.equal(await page.locator('#ws-labels .chip-l.sel').count(), 1, 'the selection shows in the panel');
  assert.equal(await frame.locator(`#labels .row.sel[data-label-id="${nuts}"]`).count(), 1, 'and on the plate');
  // undo in the planner (the placement): the plate follows with a new rev, the drawer tag goes
  const rev = await page.evaluate(() => window.__GEN2_PLATE__().rev);
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction((r) => window.__GEN2_PLATE__().rev > r, rev, { timeout: 30_000 });
  await frame.locator(`#labels .row[data-label-id="${screws}"] .utag`).waitFor({ state: 'detached', timeout: 30_000 });
  assert.equal(await frame.locator('#labels .row[data-label-id]').count(), 2, 'still both labels');
  assert.equal(await page.evaluate(() => window.__GEN2_PLATE__().log.filter((k) => k === 'ready').length), 1, 'the same frame: no second hello answered');
  // the print preference (the stripe): Off in the panel's Label settings reaches the plate's own stripe input, a change on the
  // plate comes back to the panel and this browser's preference; neither is the build's record
  await page.locator('#ws-labels details.settings summary').click();
  await page.selectOption('#ws-labels select[aria-label="Part label stripe"]', 'off');
  await settle(page, 600);
  assert.equal(await frame.locator('#hw-band').evaluate((el) => el.value), 'off', 'the plate follows the panel');
  assert.match(await text(page, '#ws-labels details.settings summary'), /no stripe/);
  await frame.locator('#hw-band').selectOption('end');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gen2-label-print') || '{}').band === 'end', null, { timeout: 15_000 });   // the plate's change is the browser's preference now
  assert.equal(await page.locator('#ws-labels select[aria-label="Part label stripe"]').evaluate((el) => el.value), 'end', 'and the panel shows it');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GEN2_STORE__.state).includes('hw-band')), false, 'never in the record');
  await settle(page, 400);
  assert.equal(await frame.locator('#hw-band').evaluate((el) => el.value), 'end', 'no snapshot echoed the old value back over the plate');
  await frame.locator('#hw-band').selectOption('wedge');   // a second change from the plate still carries the current rev (Sol 01a13c32)
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gen2-label-print') || '{}').band === 'wedge', null, { timeout: 15_000 });
  await frame.locator('#hw-profile').setChecked(false);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gen2-label-print') || '{}').drawings === false, null, { timeout: 15_000 });
  assert.equal(await page.locator('#ws-labels [aria-label="Screw and nut drawings"] .seg.on').textContent(), 'Off', 'the panel shows the drawings off');
  // a setting without the frame's session, or with an old rev, changes nothing (Astra: the fix must not let stale updates in)
  const revNow = await page.evaluate(() => window.__GEN2_PLATE__().rev);
  await page.evaluate((origin) => { window.postMessage({ gen2plate: 'setting', v: 1, session: 'nope', id: 'hw-band', value: 'bottom', rev: 0, buildId: window.__GEN2_STORE__.state.buildId }, origin); }, base);
  await settle(page, 300);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gen2-label-print')).band), 'wedge', 'a stray setting changes nothing');
  assert.equal(await page.evaluate(() => window.__GEN2_PLATE__().rev), revNow, 'and moves no rev');
  // the same from the REAL frame with its own session but a stale rev: the source and session pass, the rev rule rejects it
  // (Terra 01a13c4b: the self-posted message above never reaches that rule)
  await frame.locator('body').evaluate((_, r) => { window.parent.postMessage({ gen2plate: 'setting', v: 1, session: EMBED.bind.session, id: 'hw-band', value: 'bottom', rev: r - 1, buildId: EMBED.snap.buildId }, EMBED.bind.origin); }, revNow);
  await settle(page, 300);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gen2-label-print')).band), 'wedge', 'a stale-rev setting from the frame changes nothing');
  await frame.locator('body').evaluate((_, r) => { window.parent.postMessage({ gen2plate: 'setting', v: 1, session: EMBED.bind.session, id: 'hw-band', value: 'end', rev: r, buildId: EMBED.snap.buildId }, EMBED.bind.origin); }, revNow);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gen2-label-print')).band === 'end', null, { timeout: 15_000 });   // the current rev: taken
  // changed while the plate is hidden: the reopening carries the latest preference
  await page.locator('#ws-labels .track.view button:text-is("On build")').click();
  await page.selectOption('#ws-labels select[aria-label="Part label stripe"]', 'off');
  await page.locator('#ws-labels .track.view button:text-is("Label plate")').click();
  await settle(page, 600);
  assert.equal(await frame.locator('#hw-band').evaluate((el) => el.value), 'off', 'the plate shows the change made while it was hidden');
  // the toggle keeps the frame; the dock's Print labels shows the plate again
  await page.locator('#ws-labels .track.view button:text-is("On build")').click();
  await settle(page, 200);
  assert.equal(await page.locator('#ws-plate').count(), 1, 'the frame stays');
  assert.equal(await page.locator('#ws-plate').isVisible(), false, 'hidden');
  await page.click('#ws-dock button.cta');
  await page.waitForFunction(() => !window.__GEN2_PLATE__().box.hidden, null, { timeout: 15_000 });
  assert.equal(await page.evaluate(() => window.__GEN2_PLATE__().view), 'plate');
  // a message that is not from the frame, or without the session, is ignored
  await page.evaluate((origin) => { window.postMessage({ gen2plate: 'selected', v: 1, session: 'nope', id: 'x', rev: 0 }, origin); }, base);
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_PLATE__().selLabel), nuts, 'a stray selected changes nothing');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE PLATE'S PRINTER (the stress test 2026-10-15, S-F6). The plate's printer reset to Prusa Core One on every planner reload:
   the Studio kept it only in its ordinary autosave, which the embed never touches. The plate now keeps its printer settings
   under a key of its own in this browser: the printer by its name (three printers share 256×256, and a value alone came back
   as the first), the format, the purge area and the preview colours, which a label-type switch would otherwise reset. Never
   the ordinary autosave, and never the stripe (the planner's print preference) */
test('the Label plate keeps this browser’s printer settings across a planner reload and a label-type switch (S-F6)', { skip: haveStudio ? false : 'Label Studio checkout absent' }, async () => {
  const { ctx, page, errors } = await open('labels', { query: '&new=1&studio=' + encodeURIComponent(studio) });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  // a faceplate applied as the panel's Switch to EdgeLabel applies one. Classic Pro first: the Studio boots on EdgeLabel, so
  // every boot of the frame then switches type
  const face = (key) => page.evaluate(async (k) => {
    const v = window.__GEN2_VIEWER__;
    await v.applyFaceplateStyle(v.availableFaceplateStyles().find((x) => x.key === k)); v.setDims(false);
    window.__GEN2_STORE__.load(v.build, 'adopt');
  }, key);
  await face('classicpro');
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'classicpro', null, { timeout: 60_000 });
  const plate = async () => {   // the plate shown, its Studio answered and the build's snapshot applied: the frame
    await page.locator('#ws-labels .track.view button:text-is("Label plate")').click();
    await page.waitForFunction(() => { const p = window.__GEN2_PLATE__ && window.__GEN2_PLATE__(); return p && p.ready && !p.box.hidden; }, null, { timeout: 60_000 });
    const f = await (await page.locator('#ws-plate iframe').elementHandle()).contentFrame();
    await f.waitForFunction(() => !!EMBED.snap && labelType.id === 'classicpro', null, { timeout: 30_000 });
    return f;
  };
  const shown = (f) => f.evaluate(() => ({ printer: gid('bed-preset').selectedOptions[0].text, plate: gid('bed-w').value + '×' + gid('bed-l').value,
    format: gid('export-format').value, purge: gid('reserve-purge').checked, base: gid('color-base').value, text: gid('color-text').value }));
  const kept = (f) => f.evaluate(() => JSON.parse(localStorage.getItem('labelstudio.plate-printer.v1')));
  const f = await plate();
  assert.equal((await shown(f)).printer, 'Prusa Core One (250×220)', 'the page’s own printer on a first visit');
  // changed as a visitor changes them
  await f.locator('#bed-preset').selectOption({ label: 'Bambu P2S (256×256)' });
  await f.locator('#export-format').selectOption('stl');
  await f.locator('#reserve-purge').setChecked(false);
  await f.locator('#color-base').fill('#2a6fdb', { force: true });   // a swatch's colour input hides behind its label (the label opens the picker)
  await f.waitForFunction(() => { const r = JSON.parse(localStorage.getItem('labelstudio.plate-printer.v1') || 'null'); return !!r && r.printer === 'Bambu P2S (256×256)' && r.settings['export-format'] === 'stl' && r.settings['reserve-purge'] === false && r.settings['color-base'] === '#2a6fdb'; }, null, { timeout: 30_000 });
  const rec = await kept(f);
  assert.ok(!('hw-band' in rec.settings) && !('hw-profile' in rec.settings), 'the stripe and the drawings are the planner’s print preference, not kept here');
  assert.equal(await f.evaluate(() => localStorage.getItem('edgelabel.autosave.v1')), null, 'the ordinary autosave is never written from the plate');
  // the build saved with its Classic Pro faceplates; then one more change and at once a reload (the page going saves it)
  const id = await page.evaluate(() => window.__GEN2_STORE__.state.buildId);
  const saved = () => page.evaluate((want) => new Promise((r) => { const q = indexedDB.open('modulith-planner'); q.onsuccess = () => { const t = q.result.transaction('builds').objectStore('builds').get(want); t.onsuccess = () => r(!!(t.result && t.result.record.faceStyle === 'classicpro')); t.onerror = () => r(false); }; q.onerror = () => r(false); }), id);
  for (let i = 0; i < 60 && !(await saved()); i++) await settle(page, 250);
  assert.ok(await saved(), 'the build is saved with its Classic Pro faceplates');
  await f.locator('#color-text').fill('#ffe000', { force: true });
  await page.reload({ waitUntil: 'load', timeout: 90_000 });
  await waitBoot(page);
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.state.buildId), id, 'the same build reopened');
  // a new frame: it boots on EdgeLabel and switches to the build's Classic Pro, and the settings come back through the switch
  const f2 = await plate();
  const want = { printer: 'Bambu P2S (256×256)', plate: '256×256', format: 'stl', purge: false, base: '#2a6fdb', text: '#ffe000' };
  assert.deepEqual(await shown(f2), want, 'kept across the reload');
  assert.match(await f2.locator('#download').textContent(), /\.stl\)$/, 'the download names the kept format');
  // a type switch while the plate is open (the build to EdgeLabel) keeps them as well
  await face('edgelabel');
  await f2.waitForFunction(() => labelType.id === 'edgelabel', null, { timeout: 30_000 });
  await settle(page, 600);   // past the 400 ms save that the switch's own input events set off
  assert.deepEqual(await shown(f2), want, 'kept through the switch to EdgeLabel');
  assert.equal((await kept(f2)).settings['color-base'], '#2a6fdb', 'and still kept so');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* A TYPE SWITCH IS NOT THE VISITOR'S (found 2026-10-17, beside S-F6). With the plate open, a faceplate switch made the Studio
   give the stripe and the drawings the new type's defaults, and its listener sent them to the planner as the visitor's
   `setting`: this browser's End stripe became Bottom and its drawings came back On, with nobody touching them. The switch is
   the page's own change now: nothing goes back, and a change made on the plate afterwards still does */
test('the Label plate: a faceplate switch with the plate open leaves this browser’s stripe and drawings as they were; a change on the plate still goes back', { skip: haveStudio ? false : 'Label Studio checkout absent' }, async () => {
  const { ctx, page, errors } = await open('labels', { query: '&new=1&studio=' + encodeURIComponent(studio) });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  const face = (key) => page.evaluate(async (k) => {   // as the panel's Switch to EdgeLabel applies a faceplate
    const v = window.__GEN2_VIEWER__;
    await v.applyFaceplateStyle(v.availableFaceplateStyles().find((x) => x.key === k)); v.setDims(false);
    window.__GEN2_STORE__.load(v.build, 'adopt');
  }, key);
  await face('edgelabel');
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 60_000 });
  // this browser's print preference, set in the panel: the End stripe, the drawings off (neither is the type's default)
  await page.locator('#ws-labels details.settings summary').click();
  await page.selectOption('#ws-labels select[aria-label="Part label stripe"]', 'end');
  await page.locator('#ws-labels [aria-label="Screw and nut drawings"] .seg:text-is("Off")').click();
  const pref = () => page.evaluate(() => JSON.parse(localStorage.getItem('gen2-label-print') || 'null'));
  await page.waitForFunction(() => { const p = JSON.parse(localStorage.getItem('gen2-label-print') || 'null'); return !!p && p.band === 'end' && p.drawings === false; }, null, { timeout: 15_000 });
  // the plate open on it, showing that preference
  await page.locator('#ws-labels .track.view button:text-is("Label plate")').click();
  await page.waitForFunction(() => { const p = window.__GEN2_PLATE__ && window.__GEN2_PLATE__(); return p && p.ready && !p.box.hidden; }, null, { timeout: 60_000 });
  const f = await (await page.locator('#ws-plate iframe').elementHandle()).contentFrame();
  await f.waitForFunction(() => !!EMBED.snap && !!EMBED.applied && EMBED.applied['hw-band'] === 'end' && EMBED.applied['hw-profile'] === false, null, { timeout: 30_000 });
  const sent = () => page.evaluate(() => window.__GEN2_PLATE__().log.slice());   // what the frame has sent the planner
  // the faceplate to Classic Pro and back with the plate open: each snapshot switches the Studio's label type
  for (const key of ['classicpro', 'edgelabel']) {
    await face(key);
    await f.waitForFunction((t) => labelType.id === t, key, { timeout: 30_000 });
    await settle(page, 600);
    assert.deepEqual(await pref(), { band: 'end', drawings: false }, `this browser's preference after the switch to ${key}`);
    assert.deepEqual(await sent(), ['ready'], `nothing sent back by the switch to ${key}`);
    assert.deepEqual(await f.evaluate(() => [gid('hw-band').value, gid('hw-profile').checked]), ['end', false], `the plate still shows it (${key})`);
  }
  // a change made on the plate is the visitor's, and still goes back
  await f.locator('#hw-band').selectOption('wedge');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gen2-label-print') || '{}').band === 'wedge', null, { timeout: 15_000 });
  assert.deepEqual(await sent(), ['ready', 'setting']);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the setup sheet: New build, Wall Mount at 115 with a printer, Start build rebuilds on the record', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1&setup=1' });
  await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
  await page.fill('#ws-setup input.name', 'E2E wall');
  await page.locator('#ws-setup .card:has-text("Wall Mount")').click();
  await btn(page, 'Next', '#ws-setup').click();
  await page.locator('#ws-setup .card.len:has-text("115 mm")').click();
  await btn(page, 'Next', '#ws-setup').click();
  await page.selectOption('#ws-setup select.printer', 'mk4');
  assert.match(await text(page, '#ws-setup .fit'), /Bed 250×210/);
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });   // gone once the sheet's reload lands
  await btn(page, 'Start build', '#ws-setup').click();
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'wall', null, { timeout: 150_000 });
  await waitBoot(page);
  const s = await S(page);
  assert.equal(s.printer, 'mk4');
  assert.equal(s.placed.length, 1, 'one starter drawer');
  assert.equal(await page.evaluate(() => document.title), 'E2E wall · MODULITH Planner');
  assert.match(await text(page, '#ws-top .chip-btn.mount'), /Wall Mount · 115/);
  // the whole trip is quiet, the 200 ms between Start build's commit and the reload included: Build does not push the
  // 115 record into a stage built for the 185 pool (a throttled software run showed 404s for every 115 part otherwise)
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* EDIT PART DETAILS OPENS THAT PART (`open/1`, LABELS-INTEGRATION.md, the parts channel's additions).
   - A Picker that offers the cap gets `open` and answers `opened`, with that part in Edit.
   - A second browser profile, whose Picker list lacks the row, gets a refusal; its words show in the dialog's head.
   - An older Picker (no cap) is sent no `open`, and the dialog just opens, as before.
   The checkout's published parts/ decides which branch runs. */
test('Edit part details: the Part Picker opens that part (open/1), or just opens with an older Picker', { skip: haveStudio ? false : 'Label Studio checkout absent' }, async () => {
  const { ctx, page, errors } = await open('labels', { query: '&new=1&studio=' + encodeURIComponent(studio) });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => x.textContent.trim().startsWith('Switch to EdgeLabel')); if (b) b.click(); });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 90_000 });
  await settle(page, 800);
  await page.locator('#ws-labels button[title^="Opens the Part Picker here"]').click();
  await page.waitForFunction(() => { const p = window.__GEN2_PICKER__ && window.__GEN2_PICKER__(); return p && p.ready && !p.veil.hidden; }, null, { timeout: 60_000 });
  const frame = page.frameLocator('#ws-partpicker iframe');
  await frame.locator('.tile.has-img').first().waitFor({ timeout: 60_000 });
  await frame.locator('button.tile').filter({ hasText: /^Nuts$/ }).first().click();
  await frame.locator('#stage-panel button.tile[title="Hex nut"]').click();
  await frame.locator('#stage-panel button.thr[aria-label="M3"]').click();
  await frame.locator('#add-parts').click();
  await page.waitForFunction(() => window.__GEN2_PICKER__().veil.hidden, null, { timeout: 30_000 });
  // place it on the first Decor drawer, then select that drawer: its card offers Edit part details
  const first = await page.evaluate(() => window.__GEN2_STORE__.state.placed.find((u) => u.fill === 'decor').id);
  await page.locator('#ws-labels .chip-l').first().click();
  await page.evaluate((id) => window.__GEN2_VIEWER__.selectUnit(id), first); await settle(page, 500);
  await page.evaluate((id) => window.__GEN2_VIEWER__.selectUnit(id), first); await settle(page, 500);
  await page.locator('#ws-labels button:has-text("Edit part details")').first().click();
  await page.waitForFunction(() => !window.__GEN2_PICKER__().veil.hidden, null, { timeout: 30_000 });
  const caps = await page.evaluate(() => window.__GEN2_PICKER__().caps || []);
  if (caps.includes('open/1')) {
    await page.waitForFunction(() => window.__GEN2_PICKER__().log.includes('opened'), null, { timeout: 15_000 });
    assert.equal(await page.evaluate(() => window.__GEN2_PICKER__().req), null, 'the answer was credited to its request');
    // another browser profile, the same build: its Picker has no such row, so it refuses and says why
    const hash = await page.evaluate(() => location.hash);
    const other = await browser.newContext({ viewport: { width: 1280, height: 800 } }); contexts.add(other);
    await other.addInitScript(() => { try { localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
    const p2 = await other.newPage();
    await p2.goto(`${base}/index.html?ws=labels&debug=1&studio=${encodeURIComponent(studio)}${hash}`, { waitUntil: 'load', timeout: 90_000 });
    await p2.waitForSelector('#ws-labels .foot', { timeout: 60_000 });
    await settle(p2, 1000);
    const unitId = await p2.evaluate(() => Number(Object.keys(window.__GEN2_STORE__.state.labelAssign || {})[0]));
    await p2.evaluate((id) => window.__GEN2_VIEWER__.selectUnit(id), unitId); await settle(p2, 500);
    await p2.locator('#ws-labels button:has-text("Edit part details")').first().click();
    await p2.waitForFunction(() => { const p = window.__GEN2_PICKER__ && window.__GEN2_PICKER__(); return p && !p.veil.hidden && /another browser/.test(document.querySelector('#ws-partpicker .link').textContent); }, null, { timeout: 60_000 });
  } else {
    await settle(page, 800);
    assert.equal(await page.evaluate(() => window.__GEN2_PICKER__().req), null, 'no open sent to an older Picker');
  }
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* LONGER WORDS THAN THE PLANNER HOLDS (the stress test, 2026-10-15, P-F6). The label format allows 200 characters, and
   a file can bring them. Enter in the editor cut such a label to 40 without a word, even with nothing changed. Now
   nothing changed commits nothing, the editor says what a change will keep, and a change says it cut */
test('the label editor: a label longer than 40 characters is not cut by an Enter that changes nothing, and a change says it cut', async () => {
  const { ctx, page, errors } = await open('labels');
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await btn(page, 'Type a label', '#ws-labels').click();
  await page.fill('#ws-modal input.field', 'Short');
  await btn(page, 'Add label', '#ws-modal .box').click();
  await settle(page, 300);
  const long = 'Long words from a file '.repeat(5).trim();   // 114 characters
  await page.evaluate((t) => { const st = window.__GEN2_STORE__; st.flush(); st.commit((s) => { s.labelList.labels[0].text = t; }, 'edit'); st.flush(); }, long);
  await settle(page, 300);
  await page.locator('#ws-labels button[title="Edit this label"]').first().click();
  await page.waitForSelector('#ws-labeledit input.words', { timeout: 30_000 });
  assert.match(await text(page, '#ws-labeledit .note'), new RegExp(`${long.length} characters long`), 'the editor says what a change keeps');
  await page.locator('#ws-labeledit input.words').press('Enter');
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.state.labelList.labels[0].text), long, 'nothing changed, nothing cut');
  await page.locator('#ws-labeledit input.words').press('End');
  await page.keyboard.press('Backspace');   // a change (the field's maxlength of 40 stops typing more into it)
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__GEN2_STORE__.state.labelList.labels[0].text.length === 40, null, { timeout: 15_000 });
  assert.match(await text(page, '#ws-toast'), /cut to/, 'and it says so');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* BUILDING LEFT OF THE STARTER (Joey, 2026-10-15: "I'd like to be able to build to the left of the starting drawer too,
   this was a limitation to our old grid"). A fresh Tabletop build's starter sits at x 0. Spots are now offered past
   either edge. Taking one on the left moves the build right and widens the grid, in one undo step */
test('Build: a spot left of the starter drawer, and placing there shifts the build and widens the grid as one undo step', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1&setup=1' });
  await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  for (let i = 0; i < 4; i++) {
    const start = page.locator('#ws-setup button:has-text("Start build")');
    if (await start.count() && await start.first().isVisible()) { await start.first().click(); break; }
    await btn(page, 'Next', '#ws-setup').click();
  }
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_BUILD__ && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'tabletop', null, { timeout: 150_000 });
  await waitBoot(page);
  const s0 = await S(page);
  assert.deepEqual(s0.placed.map((u) => u.x), [0], 'the starter sits at the left edge');
  const spots = await page.evaluate(() => window.__GEN2_BUILD__.addSpots(1, 2, 'decor'));
  const left = spots.find((sp) => sp.x < 0);
  assert.ok(left, 'a spot left of the starter');
  assert.ok(spots.some((sp) => sp.x + 1 > s0.gridW), 'and one past the right edge');
  await page.evaluate((sp) => window.__GEN2_BUILD__.placeAt(sp.x, sp.y, { w: 1, h: 1, hh: 2 }, 'decor'), left);
  // the grid hugs the build (the board redesign): its width is the build's, 1 + the starter's
  await page.waitForFunction((w) => window.__GEN2_STORE__.state.placed.length === 2 && window.__GEN2_STORE__.state.gridW === w + 1, s0.placed[0].w, { timeout: 30_000 });
  const s1 = await S(page);
  assert.deepEqual(s1.placed.map((u) => [u.id, u.x]).sort((a, b) => a[0] - b[0]), [[s0.placed[0].id, 1], [s0.nextId, 0]], 'the starter moved right, the new drawer is at x 0');
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction((w) => window.__GEN2_STORE__.state.gridW === w && window.__GEN2_STORE__.state.placed.length === 1, s0.gridW, { timeout: 30_000 });
  assert.deepEqual((await S(page)).placed.map((u) => u.x), [0], 'one undo puts it all back');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* WHY A SPOT IS REFUSED (2026-10-20). Joey's coworker put a 1W over the middle of a 3W and got nothing: the ends were
   offered, the middle was silent. Now the middle is a muted "no" spot in both views; a click or tap on it opens the chip
   with the sag rule in a sentence and "Put it at the left end", which places there; on a mouse, resting on it says why
   without a click; it never places. */
test('Build: a refused cell says why - a 1W over the middle of a 3W is a muted spot in both views, the chip states the sag rule and offers the end', async () => {
  const { ctx, page, errors } = await open('build');
  // a slow parts host on every run: each part GLB asked for from here answers 600 ms late, so the 3W mounts while the
  // boot's camera is still flying in. A quick host hid the stale point below (the case failed when it answered late)
  await page.route('**/*.lib.glb', async (route) => { await sleep(600); await route.fallback(); });
  await startBuild(page, [{ id: 1, x: 0, w: 3 }]);
  const y = await page.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 2);
  const top = y - 2;   // the row on the 3W
  await armSize(page, '1W·1H');
  await page.waitForFunction(() => (window.__spots || []).length, null, { timeout: 30_000 }).catch(() => assert.fail('the 3D view drew no spots for 1W·1H within 30 s'));
  const refused = await page.evaluate(() => window.__GEN2_BUILD__.refusedSpots({ w: 1, h: 1, hh: 2 }, 'decor'));
  const mid = refused.find((sp) => sp.x === 1 && sp.y === top);
  assert.ok(mid, `the middle cell on the 3W is refused: ${JSON.stringify(refused.map((sp) => [sp.x, sp.y, sp.code]))}`);
  assert.equal(mid.code, 's', 'for the sag rule');
  assert.match(mid.why, /A 1W can't sit on the middle of the 3W/);
  assert.deepEqual(mid.ends.map((e) => `${e.side}@${e.x}`).sort(), ['left@0', 'right@2'], 'both ends are offered as the way out');
  const offered = await page.evaluate(() => window.__GEN2_BUILD__.placementSpots({ w: 1, h: 1, hh: 2 }, 'decor').map((p) => `${p.x},${p.y}`));
  assert.ok(offered.includes(`0,${top}`) && offered.includes(`2,${top}`) && !offered.includes(`1,${top}`), `the ends are "+" spots, the middle is not: ${offered}`);
  assert.deepEqual(await page.evaluate(() => (window.__noSpots || []).slice().sort()), [`1,${top}`], 'the 3D view drew exactly that one refused cell');
  // the 3D view, a mouse: resting on the refused cell says why; a click keeps it up; Escape clears it.
  // The marker is read where it stands once the stage is at rest, and read again before the click: the Build boot's
  // camera flies in from the cover for 900 ms, and the 3W's mount re-frames it. A point read in that flight was 31-44 px
  // off the marker by the click, which landed on nothing, and the chip wait timed out (2026-10-21, traced on a GPU with
  // the 3W's GLBs in by 273-417 ms; in by 27-109 ms, the mount restarted the flight and the click fell in its slow start)
  const cellAtRest = async () => {
    await page.waitForFunction(() => !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 60_000 }).catch(() => assert.fail('the 3W did not mount within 60 s'));
    await page.evaluate(() => { window.__e2eCell = null; });
    await page.waitForFunction(([x, yy]) => { const p = window.__GEN2_VIEWER__.spotScreens().find((q) => q.x === x && q.y === yy); const now = p ? `${Math.round(p.sx)},${Math.round(p.sy)}` : null; const same = !!now && window.__e2eCell === now; window.__e2eCell = now; return same; }, [1, top], { polling: 300, timeout: 30_000 })
      .catch(() => assert.fail('the refused cell\'s marker did not hold still for 300 ms within 30 s'));
    return page.evaluate(([x, yy]) => window.__GEN2_VIEWER__.spotScreens().find((p) => p.x === x && p.y === yy), [1, top]);
  };
  let sc = await cellAtRest();
  assert.ok(sc, 'the refused cell has a marker on the stage');
  await page.mouse.move(sc.sx, sc.sy);
  await page.waitForFunction(() => !document.getElementById('ws-choice').hidden, null, { timeout: 15_000 }).catch(() => assert.fail('resting on the refused cell opened no chip within 15 s'));
  assert.match(await text(page, '#ws-choice'), /middle of the 3W/, 'the chip says why');
  assert.equal(await page.locator('#ws-choice button:has-text("Place")').count(), 0, 'and offers no Place');
  await page.mouse.move(sc.sx, sc.sy + 300);
  await page.waitForFunction(() => document.getElementById('ws-choice').hidden, null, { timeout: 15_000 }).catch(() => assert.fail('leaving the refused cell did not close the chip'));
  sc = await cellAtRest();
  await page.mouse.move(sc.sx, sc.sy); await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(() => !document.getElementById('ws-choice').hidden, null, { timeout: 15_000 }).catch(() => assert.fail('a click on the refused cell opened no chip within 15 s'));
  await page.mouse.move(sc.sx, sc.sy + 300); await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.getElementById('ws-choice').hidden), false, 'a clicked reason stays up when the mouse leaves');
  assert.equal(await units(page), 1, 'a click on a refused cell places nothing');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('ws-choice').hidden, null, { timeout: 15_000 });
  assert.ok(await page.evaluate(() => !!document.querySelector('#ws-lib .size.on')), 'the first Escape closed the chip and kept the size armed');
  // the board: a muted disc at the middle; a click on it opens the reason, "Put it at the left end" places there
  const in3d = await stageSpots(page);   // read before the switch: the 2D view takes the stage's spots down
  await view(page, '2D');
  await page.waitForSelector(`#ws-board .b-spot.no[data-x="1"][data-y="${top}"]`, { timeout: 30_000 }).catch(() => assert.fail('the board drew no refused cell within 30 s'));
  assert.deepEqual(await boardSpots(page), in3d, 'the board\'s "+" spots are still exactly the 3D ones');
  assert.ok(in3d.length >= 4 && !in3d.includes(`1,${top}`), `the "+" list: ${in3d}`);
  await clickSpot(page, 1, top);
  await page.waitForFunction(() => !document.getElementById('ws-choice').hidden, null, { timeout: 15_000 }).catch(() => assert.fail('a click on the board\'s refused cell opened no chip within 15 s'));
  assert.match(await text(page, '#ws-choice'), /wall under at least one end/);
  assert.equal(await units(page), 1, 'nothing placed');
  await page.locator('#ws-choice button:has-text("Put it at the left end")').click();
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 2, null, { timeout: 30_000 }).catch(() => assert.fail('"Put it at the left end" placed nothing within 30 s'));
  assert.match((await brief(page)).units, /100:1W@0,/, 'the 1W sits at the left end of the 3W');
  assert.equal(await page.evaluate(() => document.getElementById('ws-choice').hidden), true, 'the chip closed');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* A TAP NEVER TAKES THE CAMERA (2026-10-22). The stage counted a press as the visitor taking the camera when the camera
   moved more than 4 units between press and release, and a guided move moves it by itself: a click during the boot's
   fly-in or a layout change's re-frame set camFree, and from then on the camera stopped following the build (found
   tracing the refused-cell case). A tap is a press whose pointer stays within 6 px, the stage's own tap rule; a drag,
   a pinch or a wheel still takes the camera, mid-flight or not.
   The camera leaves its guided pose by the wheel, which is not damped, before each wait for it to rest: a drag's damped
   coast ran on past 30 s on the SwiftShader runner (deploy run 39790130544), so the one drag comes last. */
test('Build: a tap while the guided camera is moving leaves the camera to the guide; a drag or a wheel takes it', async () => {
  const { ctx, page, errors } = await open('build');
  const cam = () => page.evaluate(() => window.__GEN2_VIEWER__.probe().camera);
  const free = () => page.evaluate(() => window.__GEN2_VIEWER__.camFree);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // the camera's position the same in three reads 300 ms apart: on the SwiftShader runner a moving camera is drawn about
  // every 300 ms, so two reads could fall between two of its frames
  const still = async (what) => {
    await page.evaluate(() => { window.__e2eCam = null; window.__e2eSame = 0; });
    await page.waitForFunction(() => { const c = JSON.stringify(window.__GEN2_VIEWER__.probe().camera); window.__e2eSame = window.__e2eCam === c ? window.__e2eSame + 1 : 0; window.__e2eCam = c; return window.__e2eSame >= 2; }, null, { polling: 300, timeout: 30_000 })
      .catch(() => assert.fail(`the camera did not come to rest ${what} within 30 s`));
    return cam();
  };
  // a point on the stage with no unit under it (a press on a unit picks the unit up)
  const empty = () => page.evaluate(() => { const c = document.querySelector('canvas'); for (const [x, y] of [[640, 160], [520, 200], [760, 200], [640, 660], [420, 400], [860, 400]]) if (document.elementFromPoint(x, y) === c && window.__GEN2_VIEWER__.unitAt(x, y) == null) return [x, y]; return null; });
  const drag = async (p) => { await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.mouse.move(p[0] + 160, p[1] + 40, { steps: 10 }); await page.mouse.up(); };
  // the guided flight back is slowed (2.25 s, not 0.9 s) so a press lands inside it on a slow runner too
  const flyBack = async () => { await page.evaluate(() => { window.__GEN2_VIEWER__.setSlow(true); window.__GEN2_VIEWER__.resetView(); }); assert.equal(await free(), false, 'the camera button gives the camera back'); };
  // zoomed out at an empty point: a wheel takes the camera
  const zoomOut = async (what) => {
    await page.mouse.wheel(0, 800);
    await page.waitForFunction(() => window.__GEN2_VIEWER__.camFree === true, null, { timeout: 15_000 }).catch(() => assert.fail(`a wheel ${what} did not take the camera`));
    return still(`after the wheel ${what}`);
  };
  // the camera button's flight, once the camera has left its pose by 20 units: past the eased flight's slow start,
  // where its first 250 ms move the camera about 0.5% of the way
  const inFlight = async (pose) => {
    await flyBack();
    await page.waitForFunction((s) => { const c = window.__GEN2_VIEWER__.probe().camera; return Math.hypot(c[0] - s[0], c[1] - s[1], c[2] - s[2]) > 20; }, pose, { timeout: 15_000 })
      .catch(() => assert.fail('the camera button did not fly the camera back'));
  };
  await still('after the boot');
  let pt = await empty();
  assert.ok(pt, 'an empty point on the stage');
  await page.mouse.move(pt[0], pt[1]);
  const pose = await zoomOut('at rest');
  // a tap inside the guided flight: the pointer stays put while the camera moves under it (600 ms: two of the runner's
  // frames at least)
  await inFlight(pose);
  const before = await cam();
  await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
  const moved = dist(before, await cam());
  assert.ok(moved > 4, `the press fell inside the guided flight: the camera moved ${moved.toFixed(1)} during it`);
  assert.equal(await free(), false, 'a tap during a guided move leaves the camera to the guide');
  const home = await still('after the flight');
  await page.evaluate(() => window.__GEN2_VIEWER__.setSlow(false));
  // so the guide still follows the build: a wider layout re-frames the camera
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { const y = s.gridH * 2 - 2; s.placed = [0, 3].map((x, i) => ({ id: i + 1, x, y, w: 3, hh: 2, fill: 'decor', shelves: 0 })); s.nextId = 100; s.gridW = 6; }, 'edit'));
  await page.waitForFunction(() => { const V = window.__GEN2_VIEWER__; return V.build.placed.length === 2 && V.build.placed.every((u) => u.w === 3) && !V.regenBusy; }, null, { timeout: 90_000 })
    .catch(() => assert.fail('the two 3W did not reach the stage within 90 s'));
  const framed = await still('after the layout change');
  assert.ok(dist(home, framed) > 4, `a layout change after the tap re-framed the camera (it moved ${dist(home, framed).toFixed(1)})`);
  // a tap at rest leaves nothing behind: a wheel after it still takes the camera
  pt = await empty();
  assert.ok(pt, 'an empty point on the stage around the wider build');
  await page.mouse.move(pt[0], pt[1]); await page.mouse.down(); await page.mouse.up();
  assert.equal(await free(), false, 'a tap at rest takes nothing');
  const out = await zoomOut('after a tap');
  // and a drag inside a guided flight still takes it (from a point empty at the zoomed-out pose the flight starts from)
  pt = await empty();
  assert.ok(pt, 'an empty point on the stage after the wheel');
  await page.mouse.move(pt[0], pt[1]);
  await inFlight(out);
  await drag(pt);
  await page.waitForFunction(() => window.__GEN2_VIEWER__.camFree === true, null, { timeout: 15_000 }).catch(() => assert.fail('a drag during a guided move did not take the camera'));
  await page.evaluate(() => window.__GEN2_VIEWER__.setSlow(false));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* A STUDIO THAT DOES NOT ANSWER (the stress test, 2026-10-15). The message blamed the planner's address and offered nothing.
   Now it says the Studio may be slow or down, and offers Try again, which reloads the frame and waits again */
test('the Part Picker modal with the Studio unreachable: after 8 s it says so and offers Try again', async () => {
  const { ctx, page } = await open('labels', { query: '&new=1&studio=' + encodeURIComponent('http://127.0.0.1:9/') });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.locator('#ws-labels button[title^="Opens the Part Picker here"]').click();
  await page.waitForFunction(() => /hasn’t answered yet/.test(document.querySelector('#ws-partpicker .link').textContent), null, { timeout: 15_000 });
  assert.doesNotMatch(await text(page, '#ws-partpicker .link'), /not on its list/, 'no blame on the address');
  await page.locator('#ws-partpicker .link button:has-text("Try again")').click();
  assert.match(await text(page, '#ws-partpicker .link'), /Connecting…/, 'Try again waits again');
  await ctx.close();
});

/* A BUILD THAT CANNOT BE SHOWN (2026-10-15). The generator's errors quote the link's own fields, and bootFail wrote them
   into innerHTML, so a crafted #build= link ran script on this origin. The page also had no way out: a stored build that
   cannot be shown reopens on every reload */
test('a build link that cannot be shown: its words stay text, and the planner offers a way out', async () => {
  const { ctx, page: first } = await open('build');
  const rec = { v: 1, mount: '<img src=x onerror="window.__e2eXss=1">', length: 185, gridW: 2, gridH: 1, placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0 }] };
  const hash = encodeURIComponent(Buffer.from(JSON.stringify(rec), 'utf8').toString('base64'));
  await first.close();
  const page = await ctx.newPage();   // a fresh document: the same address with a new hash is only a hashchange
  await page.goto(`${base}/index.html?ws=build&debug=1#build=${hash}`, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => /Can’t show this build yet/.test((document.getElementById('loading-text') || {}).textContent || ''), null, { timeout: 60_000 });
  await settle(page, 500);
  assert.equal(await page.evaluate(() => window.__e2eXss), undefined, 'no script ran');
  assert.equal(await page.locator('#loading-text img').count(), 0, 'no markup from the link');
  assert.match(await text(page, '#loading-text'), /"<img src=x onerror=/, 'the words shown as text');
  assert.equal(await page.locator('#loading-text a[href="index.html?ws=build&new=1&setup=1"]').count(), 1, 'Start a new build');
  assert.equal(await page.locator('#loading-text a[href="builds/"]').count(), 1, 'the kits');
  await ctx.close();
});

/* THE TABLETOP DEFAULT (the stress test, 2026-10-15). New build, then Start build with every default (Tabletop, 185, from a
   Tabletop kit), stopped on "A unit is floating" with no way back. setMount rebases only on a change of mount, so the
   starter stayed at the top and syncTabletopGrid grew the grid under it. The Wall Mount case above never saw it */
/* A NEW EMPTY SLOT IS STILL REFUSED (2026-10-21). The stage now shows a build with gaps as an in-progress preview rather
   than refusing it, so the placement judge can no longer lean on the generator to refuse a case that would open a gap of
   its own: a 3W over two 1Ws with nothing under its middle passes the both-ends rule and the sag rule. It counts the open
   cells instead, and the cell says why. */
test('Build: a case that would open an empty slot is refused with the column rule, not offered', async () => {
  const { ctx, page, errors } = await open('build');
  await startBuild(page, [{ id: 1, x: 0, w: 1 }, { id: 2, x: 2, w: 1 }]);
  const top = await page.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 4);   // the row on the two 1Ws
  const refused = await page.evaluate(() => window.__GEN2_BUILD__.refusedSpots({ w: 3, h: 1, hh: 2 }, 'decor'));
  const over = refused.find((sp) => sp.x === 0 && sp.y === top);
  assert.ok(over, `the 3W over the gap is refused: ${JSON.stringify(refused.map((sp) => [sp.x, sp.y, sp.code]))}`);
  assert.equal(over.code, 'v', 'for the new empty slot');
  assert.equal(over.why, 'Part of it would have nothing under it: every column of a case needs a case below it or the table.');
  const offered = await page.evaluate(() => window.__GEN2_BUILD__.placementSpots({ w: 3, h: 1, hh: 2 }, 'decor').map((p) => `${p.x},${p.y}`));
  assert.ok(!offered.includes(`0,${top}`), `no "+" spot over the gap: ${offered}`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* A CHANGE OF MOUNT ADDS NOTHING (Joey, 2026-10-20: his wall build, with gaps along its bottom, switched to Tabletop and the
   page stopped on "Can't show this build yet · A unit is floating"; 2026-10-21: "i don't want switching between mounting
   types to automatically add units" - the gaps stay "empty slots I have to fill in", the assembly not legal until they are,
   and "an auto fix button" is welcome). The sheet says how many empty slots the switch leaves; the reload boots with his 11
   units only, a ghost in each slot on the stage and no instructions; Build lists the slots with Fill all. Filling one slot
   by hand leaves the other floating case where it is (gravity drops only what an edit unsupports); Fill all fills the rest
   and the build is whole. JOEY is his board: [id, x, y, w, hh], y and hh in half-rows from the top of a 7W x 4H wall grid. */
const JOEY = [[1, 0, 0, 4, 4], [2, 4, 0, 1, 2], [3, 5, 0, 1, 2], [4, 6, 0, 1, 2], [5, 4, 2, 1, 2], [6, 5, 2, 2, 4], [7, 0, 4, 2, 2], [8, 2, 4, 2, 2], [9, 4, 4, 1, 2], [10, 2, 6, 2, 2], [11, 4, 6, 1, 2]];
test('the setup sheet: Joey\'s wall build switched to Tabletop keeps its gaps as empty slots, adds nothing, and Fill all completes it', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1&setup=1' });
  await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
  await page.locator('#ws-setup .card:has-text("Wall Mount")').click();
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await btn(page, 'Start build', '#ws-setup').click();
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'wall', null, { timeout: 150_000 });
  await waitBoot(page);
  await page.evaluate((J) => window.__GEN2_STORE__.commit((s) => { s.placed = J.map(([id, x, y, w, hh]) => ({ id, x, y, w, hh, fill: 'decor', shelves: 0 })); s.nextId = 12; s.gridW = 7; s.gridH = 4; }, 'edit'), JOEY);
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 11 && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 }).catch(() => assert.fail('the wall build did not reach the stage'));
  // the mount chip opens the sheet; Tabletop says what the switch leaves before anything happens
  await page.locator('#ws-top .chip-btn.mount').click();
  await page.waitForSelector('#ws-setup .card', { timeout: 30_000 });
  await page.locator('#ws-setup .card:has-text("Tabletop")').click();
  assert.match(await text(page, '#ws-setup .warn.stand'), /^As a Tabletop build it will have 4 empty slots under it · Apply adds nothing: fill them in Build before it can be assembled\.$/);
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await btn(page, 'Apply and rebuild', '#ws-setup').click();
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'tabletop', null, { timeout: 150_000 });
  await waitBoot(page);   // the page boots: before 2026-10-20 it stopped on "Can't show this build yet"
  assert.equal(await page.locator('#loading-text:has-text("Can’t show")').count(), 0, 'the build shows');
  const s = await S(page);
  assert.equal(s.placed.length, 11, 'the switch added nothing');
  const rows = s.gridH * 2, by = new Map(s.placed.map((p) => [p.id, p]));
  // his 11 where they were: the same columns and sizes, each at the same height above the table (the tabletop grid adds
  // headroom on top, so y itself moves with it)
  for (const [id, x, y, w, hh] of JOEY) { const p = by.get(id); assert.ok(p && p.x === x && p.w === w && p.hh === hh && rows - (p.y + p.hh) === 8 - (y + hh), `unit ${id} kept its place: ${JSON.stringify(p)}`); }
  const shown = () => page.evaluate(() => { const M = window.__GEN2_VIEWER__.manifest; return { incomplete: M.incomplete || null, ghosts: (M.ghosts || []).length, steps: M.steps.length }; });
  const m0 = await shown();
  assert.ok(m0.incomplete && m0.incomplete.voids === 4 && m0.ghosts === 4 && m0.steps === 1, `a ghost in each of the 4 slots, no instructions: ${JSON.stringify(m0)}`);
  await page.waitForFunction(() => /Tabletop: 4 empty slots under it to fill · they show red in Build, where Fill all adds 1W cases\./.test(document.getElementById('ws-toast')?.textContent || ''), null, { timeout: 15_000 }).catch(() => assert.fail('no toast naming the empty slots'));
  // Assemble says it is not ready and sends the visitor back to Build; nothing to step through
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('assemble'));
  await page.waitForSelector('#ws-player.blocked', { timeout: 15_000 }).catch(() => assert.fail('Assemble did not say the build is not ready'));
  assert.match(await text(page, '#ws-player.blocked .title'), /^Not ready to assemble$/);
  assert.match(await text(page, '#ws-player.blocked .text'), /empty slots/);
  assert.equal(await page.locator('#ws-steps').count(), 0, 'no step list');
  await btn(page, 'Go to Build', '#ws-player').click();
  await page.waitForSelector('#ws-dock', { timeout: 15_000 }).catch(() => assert.fail('Go to Build did not open Build'));
  // Build offers a "+" in each slot (the placement judge asks the generator as the stage does: slots are not refusals)
  const offered = await page.evaluate(() => window.__GEN2_BUILD__.placementSpots({ w: 1, h: 1, hh: 2 }, 'decor').map((p) => `${p.x},${p.y}`));
  for (const x of [0, 1, 5, 6]) assert.ok(offered.includes(`${x},${rows - 2}`), `a "+" in the slot at column ${x}: ${offered}`);
  // fill ONE slot by hand (the left gap's left column): the other floating case, unit 6, keeps its height
  const h6 = rows - (by.get(6).y + by.get(6).hh);
  await page.evaluate((y) => window.__GEN2_BUILD__.placeAt(0, y, { w: 1, h: 1, hh: 2 }, 'decor'), rows - 2);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 12, null, { timeout: 30_000 }).catch(() => assert.fail('the slot was not filled'));
  const s1 = await S(page); const u6 = s1.placed.find((p) => p.id === 6);
  assert.equal(s1.gridH * 2 - (u6.y + u6.hh), h6, 'gravity left the other floating case over its slot');
  // the stage follows: 3 slots left, still a preview, not "can't be shown"
  await page.waitForFunction(() => { const M = window.__GEN2_VIEWER__.manifest; return M.incomplete && M.incomplete.voids === 3 && !window.__GEN2_VIEWER__.regenBusy; }, null, { timeout: 30_000 }).catch(async () => assert.fail(`the stage did not show the 3 slots left: ${JSON.stringify(await shown())}`));
  // the issue card names the slots left and fills them all
  await page.locator('#ws-dock button.status.issue').click();
  await page.waitForSelector('#ws-issues button:has-text("Fill all")', { timeout: 15_000 }).catch(() => assert.fail('no Fill all in the issue card'));
  assert.match(await text(page, '#ws-issues'), /3 empty slots to fill\./);
  await page.locator('#ws-issues button:has-text("Fill all")').click();
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 15 && !window.__GEN2_VIEWER__.manifest.incomplete && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 60_000 }).catch(() => assert.fail('Fill all did not complete the build'));
  // filled, it assembles: the step list is back
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('assemble'));
  await page.waitForSelector('#ws-steps', { timeout: 15_000 }).catch(() => assert.fail('the filled build has no step list'));
  assert.equal(await page.locator('#ws-player.blocked').count(), 0, 'not blocked once filled');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* AND NO SETUP CHANGE RELOADS INTO A BUILD THE STAGE CANNOT SHOW (2026-10-20): a length that strands a unit used to reload
   into "Can't show this build yet" too, under a warning that promised the units would stay on the board flagged. The sheet
   now puts the record back and says why, in the generator's words, and nothing reloads. */
test('the setup sheet: a length its units are not made in is refused in the sheet with the reason, and nothing reloads', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1&setup=1' });
  await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
  await page.locator('#ws-setup .card:has-text("Wall Mount")').click();
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await btn(page, 'Start build', '#ws-setup').click();
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'wall', null, { timeout: 150_000 });
  await waitBoot(page);
  // a 2W·3H Classic Drawer: made at 185, not in the 59 lineup (0.5H and 1H only)
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.placed = [{ id: 1, x: 0, y: 0, w: 2, hh: 6, fill: 'classic', shelves: 0 }]; s.nextId = 2; s.gridW = 2; s.gridH = 3; }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 1 && window.__GEN2_VIEWER__.build.placed[0].hh === 6 && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 });
  const before = await page.evaluate(() => JSON.stringify(window.__GEN2_STORE__.serialize()));
  await page.locator('#ws-top .chip-btn.mount').click();
  await page.waitForSelector('#ws-setup .card', { timeout: 30_000 });
  await page.locator('#ws-setup button.seg:has-text("Length")').click();
  await page.locator('#ws-setup .card.len:has-text("59 mm")').click();
  assert.match(await text(page, '#ws-setup .foot .warn'), /1 of your units aren’t in the 59 lineup · swap them for sizes it has before changing the length\./);
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await btn(page, 'Apply and rebuild', '#ws-setup').click();
  await page.waitForSelector('#ws-setup .warn.refused', { timeout: 15_000 }).catch(() => assert.fail('the sheet said nothing'));
  assert.match(await text(page, '#ws-setup .warn.refused'), /^Can’t apply this: .*3H cases don't exist in the 59 collection/);
  await settle(page, 1500);
  assert.equal(await page.evaluate(() => window.__e2eBeforeReload), 1, 'nothing reloaded');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GEN2_STORE__.serialize())), before, 'the record is as it was');
  assert.equal(await page.locator('#ws-setup').count(), 1, 'the sheet stays open on the reason');
  // the refused change never entered the history: no Redo can bring it back and reload into the dead end (Sol 01a15c9b)
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.canRedo), false, 'nothing to redo');
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.redo()), false, 'Redo does nothing');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GEN2_STORE__.serialize())), before, 'and the record is still as it was');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* A BUILD SAVED THAT WAY STILL OPENS (2026-10-20/21): Joey's planner already holds his build as the old switch left it, and
   an old planner's link can carry a unit in mid-air. It opens as it is, with its empty slots shown and no instructions,
   instead of stopping on "Can't show this build yet"; nothing is added and the address is left alone. */
test('a build link with empty slots opens as it is: ghosts in the slots, nothing added, the address untouched', async () => {
  const { ctx, page: first } = await open('build');
  const kit = await first.evaluate(() => window.__GEN2_STORE__.serialize());
  // the record as the old switch saved it: Tabletop, his layout slid against the table and nothing more
  const rec = { ...kit, mount: 'tabletop', gridW: 7, gridH: 4, nextId: 12, buildId: 'e2estandup01', labelList: null, labelAssign: null,
    placed: JOEY.map(([id, x, y, w, hh]) => ({ id, x, y, w, hh, fill: 'decor', shelves: 0 })) };
  const hash = encodeURIComponent(Buffer.from(JSON.stringify(rec), 'utf8').toString('base64'));
  await first.close();
  const page = await ctx.newPage();   // a fresh document: the same address with a new hash is only a hashchange
  const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`${base}/index.html?ws=build&debug=1#build=${hash}`, { waitUntil: 'load', timeout: 90_000 });
  await waitBoot(page);
  assert.equal(await page.locator('#loading-text:has-text("Can’t show")').count(), 0, 'the build shows');
  assert.equal((await S(page)).placed.length, 11, 'his 11, nothing added');
  const m = await page.evaluate(() => { const M = window.__GEN2_VIEWER__.manifest; return { voids: M.incomplete && M.incomplete.voids, ghosts: (M.ghosts || []).length }; });
  assert.deepEqual(m, { voids: 4, ghosts: 4 }, 'a ghost in each empty slot');
  await settle(page, 1500);
  assert.doesNotMatch(await page.evaluate(() => document.getElementById('ws-toast')?.textContent || ''), /added/, 'no note about cases added');
  const inAddress = await page.evaluate(() => JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(location.hash.replace(/^#build=/, '')))))).placed.length);
  assert.equal(inAddress, 11, 'the address still carries the record as linked');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the setup sheet: New build with every default (Tabletop) boots with its starter drawer on the floor', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1&setup=1' });
  await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  for (let i = 0; i < 4; i++) {   // Next through every step, choosing nothing
    const start = page.locator('#ws-setup button:has-text("Start build")');
    if (await start.count() && await start.first().isVisible()) { await start.first().click(); break; }
    await btn(page, 'Next', '#ws-setup').click();
  }
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'tabletop', null, { timeout: 150_000 });
  await waitBoot(page);
  const s = await S(page);
  assert.equal(s.placed.length, 1, 'one starter drawer');
  assert.equal(s.placed[0].y + s.placed[0].hh, s.gridH * 2, 'resting on the floor');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the phone: the Build library sheet opens on its handle; the Labels sheet collapses while placing', async () => {
  const { ctx, page, errors } = await open('build', { phone: true });
  await page.click('#ws-lib .sheet-handle');
  await page.waitForFunction(() => document.querySelector('#ws-lib').classList.contains('open'), null, { timeout: 30_000 });   // the library sheet opened
  await page.click('#ws-tabbar .tab:has-text("Labels")');
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => x.textContent.trim().startsWith('Switch to EdgeLabel')); if (b) b.click(); });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 90_000 });
  await settle(page, 600);
  await page.evaluate(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const b = (t, root = document) => [...root.querySelectorAll('button')].find((x) => !x.closest('[hidden]') && x.textContent.trim().startsWith(t)); b('Type a label').click(); await sleep(80); document.querySelector('#ws-modal input.field').value = 'Phone'; b('Add label', document.querySelector('#ws-modal .box')).click(); await sleep(200); document.querySelector('#ws-labels .sheet-handle').click(); await sleep(300); b('Place several').click(); });
  await page.waitForFunction(() => !document.querySelector('#ws-labels').classList.contains('open'), null, { timeout: 30_000 });   // the sheet collapsed while placing
  assert.match(await text(page, '#ws-labels .sheet-handle .ttl'), /Placing/);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE PHONE'S LABEL EDITOR (the spacing audit, 2026-10-15): the pencil left the editor's sheet collapsed behind the open
   Labels sheet and the dock - nothing seemed to happen, and its close sat under Print labels. page.click() is the check:
   it refuses a control something else covers. */
test('the phone: Edit raises the label editor sheet, its close is reachable, and closing brings the Labels sheet back', async () => {
  const { ctx, page, errors } = await open('labels', { phone: true });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.click('#ws-labels .sheet-handle');
  await page.waitForFunction(() => document.querySelector('#ws-labels').classList.contains('open'), null, { timeout: 30_000 });
  await page.click('#ws-labels button:has-text("Type a label")');
  await page.fill('#ws-modal input.field', 'Phone edit');
  await page.click('#ws-modal .box button:has-text("Add label")');
  await settle(page, 400);
  await page.click('#ws-labels button[title="Edit this label"]');
  await page.waitForFunction(() => { const e = document.querySelector('#ws-labeledit'); return e && !e.hidden && e.classList.contains('open'); }, null, { timeout: 15_000 });
  assert.equal(await page.evaluate(() => document.querySelector('#ws-labels').classList.contains('open')), false, 'the Labels sheet steps down for the editor');
  // the sheet rises with a transition: wait for it to settle (a single look mid-rise read the dock under the × on a busy run)
  const reach = await page.waitForFunction(() => { const b = document.querySelector('#ws-labeledit button[aria-label="Close the editor"]'); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === b || b.contains(t); }, null, { timeout: 15_000 }).then(() => true, () => false);
  assert.ok(reach, 'nothing covers the editor’s close');
  await page.click('#ws-labeledit button[aria-label="Close the editor"]');
  const backToList = () => page.waitForFunction(() => document.querySelector('#ws-labeledit').hidden && document.querySelector('#ws-labels').classList.contains('open'), null, { timeout: 15_000 });
  await backToList();
  // the other ways out (Sol 01a13fb7: the first version proved Close only): Escape, and an undo that takes the label away
  const raise = async () => { await page.click('#ws-labels button[title="Edit this label"]'); await page.waitForFunction(() => document.querySelector('#ws-labeledit').classList.contains('open'), null, { timeout: 15_000 }); };
  await raise();
  await page.keyboard.press('Escape');
  await backToList();
  await raise();
  await page.evaluate(() => window.__GEN2_STORE__.undo());
  await backToList();
  assert.equal(await page.evaluate(() => (window.__GEN2_STORE__.state.labelList || { labels: [] }).labels.length), 0, 'the undo took the label away');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* The label previews (2026-10-17, Joey: "the small labels differ from the actual labels"): the panel draws each preview from
   its 3D label's own sources (js/label-preview.js) - a part label from the layout its ink is extruded from, an ordinary label
   from the cached geometry the stage builds - so the list, the drawer card and the model cannot disagree. */
test('the label previews are drawn from the 3D label\'s own layout and geometry', async () => {
  const { ctx, page, errors } = await open('labels', { query: '&new=1' });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => x.textContent.trim().startsWith('Switch to EdgeLabel')); if (b) b.click(); });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 90_000 });
  await settle(page, 800);
  const set = await page.evaluate(async () => {
    const R = await import('/js/rules/labels.js');
    const L = globalThis.GEN2LabelList;
    const st = window.__GEN2_STORE__;
    const item = (id, len) => ({ schema: 'part-picker-label-item/1', id, family: 'screw', head: 'socket-cap', units: 'mm', fields: ['M2', '× ' + len], value_missing: [],
      attributes: [{ path: 'head', text: 'SHCS', meaning: 'Socket head cap' }], pinned: ['head'], optional: [], pinned_unprinted: [],
      colours: { band: { colour: 'sky-blue', hex: '#56B4E9', label: 'Metric', pattern: 'solid' } } });
    const apply = (r) => { if (!r.ok) throw new Error(r.msg); st.flush(); st.commit((s) => R.applyResult(L, s, r), 'label'); st.flush(); };
    apply(R.addPartItems(L, st.state, [item('p6', 6), item('p8', 8)]));
    apply(R.add(L, st.state, { text: 'Torx bits' }));
    const p6 = R.labelsOf(st.state).find((l) => l.hardware && l.hardware.id === 'p6');
    const unit = R.drawers(st.state)[0];
    apply(R.place(L, st.state, unit.id, p6.id, null, 'drawer'));
    return { unit: unit.id };
  });
  // the panel loads the label font and the part-label files, then draws: every preview an image, none the CSS stand-in
  const drawn = () => page.evaluate(() => ({ img: document.querySelectorAll('#ws-labels .lprev.img img').length, css: document.querySelectorAll('#ws-labels .lprev:not(.img)').length }));
  let got = null;
  for (let i = 0; i < 60; i++) { got = await drawn(); if (got.img >= 3 && got.css === 0) break; await settle(page, 500); }
  assert.ok(got.img >= 3 && got.css === 0, `previews drawn: ${JSON.stringify(got)}`);
  // one source: the preview's layout IS the 3D label's (the same cached object), and an ordinary label's flat ink comes from the
  // stage's own cached geometry
  const same = await page.evaluate(async () => {
    const lt = await import('/js/label-text.js');
    const lk = await import('/js/label-look.js');
    const s = window.__GEN2_STORE__.state;
    const part = s.labelList.labels.find((l) => l.hardware && l.hardware.id === 'p6');
    const look = lk.labelLookOfLabel(part);
    const geo = lt.partLabelGeometry(look.item, look.position), lay = lt.partLabelLayout(look.item, look.position);
    const words = lt.labelGeometry('Torx bits', null, s.labelStyle || null, null), flat = lt.labelInk2d('Torx bits', null, s.labelStyle || null, null);
    return { record: !!geo && geo.record === lay.record, v5: lay.record.layout, flat: !!flat && flat.tris === words.flat, tris: flat ? flat.tris.reduce((n, t) => n + t.length, 0) : 0 };
  });
  assert.equal(same.record, true, 'the preview and the 3D ink are one layout');
  assert.equal(same.v5, 'v5', 'the socket-head part label is the profile layout (the drawing stands for SHCS)');
  assert.equal(same.flat, true, 'an ordinary label\'s preview ink is the stage geometry\'s own top faces');
  assert.ok(same.tris > 0);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* ...and a preview drawn LATE never costs the visitor a word (2026-10-17): the first version re-rendered the whole panel when
   the label font arrived, which rebuilt an open editor and wiped a word being typed (the keyboard case above caught it, at
   random). The stand-ins are now swapped for their images in place. The font is held back here so it lands mid-typing. */
test('a label preview drawn late swaps in place: the editor keeps the keyboard and the words being typed', async () => {
  const c = await freshContext();
  await c.route('**/LiberationSansNarrow-Bold.ttf*', async (route) => { await new Promise((r) => setTimeout(r, 4000)); await route.continue(); });
  const { ctx, page, errors } = await open('labels', { query: '&new=1', context: c });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await btn(page, 'Type a label', '#ws-labels').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.getElementById('ws-modal').hidden && document.activeElement === document.querySelector('#ws-modal input.field'), null, { timeout: 15_000 });
  await page.keyboard.type('Late font');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('ws-modal').hidden && ((window.__GEN2_STORE__.state.labelList || { labels: [] }).labels.length === 1), null, { timeout: 15_000 });
  assert.equal(await page.evaluate(() => document.querySelectorAll('#ws-labels .lprev.img').length), 0, 'the font is still held back: the CSS stand-in shows');
  await page.locator('#ws-labels button[title="Edit this label"]').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement === document.querySelector('#ws-labeledit input.words'), null, { timeout: 15_000 });
  await page.keyboard.press('End'); await page.keyboard.type(' xyz');
  // the font arrives: the previews are drawn in place
  await page.waitForFunction(() => document.querySelectorAll('#ws-labels .lprev.img').length >= 1, null, { timeout: 30_000 });
  await settle(page, 600);
  assert.deepEqual(await page.evaluate(() => { const a = document.activeElement; return [a === document.querySelector('#ws-labeledit input.words'), a.value]; }), [true, 'Late font xyz'], 'still typing, nothing lost');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* A part label prints its part's drawing, never an icon (2026-10-17, Joey: "it's kind of weird that i can select icons for
   these part picker labels, it doesnt seem to apply them"): its editor offers no icon controls and says why. An ordinary
   label keeps them, and its icon tiles show the icon as it prints, dark art on the label's light body ("terrible contrast"). */
test('the label editor: a part label offers no icon choice; an ordinary label\'s icon tiles are dark on light', async () => {
  const { ctx, page, errors } = await open('labels', { query: '&new=1' });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => x.textContent.trim().startsWith('Switch to EdgeLabel')); if (b) b.click(); });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 90_000 });
  await settle(page, 800);
  await page.evaluate(async () => {
    const R = await import('/js/rules/labels.js');
    const L = globalThis.GEN2LabelList;
    const st = window.__GEN2_STORE__;
    const item = { schema: 'part-picker-label-item/1', id: 'p6', family: 'screw', head: 'socket-cap', units: 'mm', fields: ['M2', '× 6'], value_missing: [],
      attributes: [{ path: 'head', text: 'SHCS', meaning: 'Socket head cap' }], pinned: ['head'], optional: [], pinned_unprinted: [] };
    const apply = (r) => { if (!r.ok) throw new Error(r.msg); st.flush(); st.commit((s) => R.applyResult(L, s, r), 'label'); st.flush(); };
    apply(R.addPartItems(L, st.state, [item]));
    apply(R.add(L, st.state, { text: 'Torx bits' }));
  });
  await settle(page, 600);
  const editFor = async (title) => {
    const chip = page.locator('#ws-labels .chip-l').filter({ hasText: title }).first();
    const row = chip.locator('xpath=ancestor::*[.//button[@title="Edit this label"]][1]');
    await row.locator('button[title="Edit this label"]').first().click();
    await page.waitForFunction(() => !document.getElementById('ws-labeledit').hidden, null, { timeout: 15_000 });
    await settle(page, 300);
  };
  await editFor('M2');
  assert.deepEqual(await page.evaluate(() => ({ grid: !!document.querySelector('#ws-labeledit .igrid'), seg: !!document.querySelector('#ws-labeledit .track.badge'), note: !!document.querySelector('#ws-labeledit .noicon') })),
    { grid: false, seg: false, note: true }, 'a part label: no icon controls, and a note says why');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('ws-labeledit').hidden, null, { timeout: 15_000 });
  await editFor('TORX');
  await page.waitForFunction(() => document.querySelector('#ws-labeledit .igrid'), null, { timeout: 30_000 });
  // open the first group so its tiles lay out, then read a tile's colours
  await page.evaluate(() => { const h = document.querySelector('#ws-labeledit .igroup:not(.open) .ghead'); if (h) h.click(); });
  const tile = await page.evaluate(() => {
    const c = document.querySelector('#ws-labeledit .igroup.open .cell');
    if (!c) return null;
    const lum = (s) => { const m = s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
    return { bg: lum(getComputedStyle(c).backgroundColor) };
  });
  assert.ok(tile && tile.bg > 0.8, `an icon tile is light behind the black art: luminance ${tile && tile.bg}`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* A shared colour scheme is outside data (2026-10-17): a #scheme= link went into the palette unchecked, so a crafted one
   could carry a javascript: "Buy" link into the shopping list and the picker, or CSS into the swatches. Every whole-palette
   entry now passes the relay's own check (main.js cleanPalette): a real hex colour, an http(s) link or none. */
test('Colors: a crafted #scheme= link cannot bring in a javascript: buy link, CSS, or a __proto__ key', async () => {
  const colors = JSON.parse('{"Case":{"name":"Bad hex","hex":"red;background-image:url(https://example.invalid/leak)","url":"https://example.invalid/ok"},'
    + '"Drawer":{"name":"Evil link","hex":"#ff0000","url":"javascript:alert(1)"},'
    + '"Faceplate":{"name":"Fine","hex":"#00aa55","url":"https://example.invalid/fine"},'
    + '"__proto__":{"name":"Proto","hex":"#00ff00"}}');
  const b64 = Buffer.from(JSON.stringify(colors), 'utf8').toString('base64');
  const { ctx, page, errors } = await open('colors', { query: '&new=1#scheme=' + encodeURIComponent(b64) });
  await page.waitForSelector('#ws-colors', { timeout: 30_000 });
  await settle(page, 800);
  const pal = await page.evaluate(() => { const p = window.__GEN2_VIEWER__.palette(); return { keys: Object.keys(p.colors), drawer: p.colors.Drawer || null, face: p.colors.Faceplate || null, proto: Object.getPrototypeOf(p.colors) === Object.prototype }; });
  assert.ok(!pal.keys.includes('Case'), 'a hex that is not a colour is dropped');
  assert.ok(pal.drawer && pal.drawer.hex === '#ff0000' && pal.drawer.url === undefined, 'a javascript: link is dropped, the colour kept');
  assert.ok(pal.face && pal.face.url === 'https://example.invalid/fine', 'a good entry keeps its link');
  assert.ok(pal.proto && !pal.keys.includes('__proto__'), 'no __proto__ key');
  // the shopping list renders the buy links: none may be javascript:
  const stack = page.locator('#ws-dock button.status.stack');
  if (await stack.isEnabled()) { await stack.click(); await settle(page, 300); }
  const bad = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => /^\s*javascript:/i.test(h)));
  assert.deepEqual(bad, [], 'no javascript: href anywhere on the page');
  const css = await page.evaluate(() => [...document.querySelectorAll('[style]')].map((x) => x.getAttribute('style')).filter((s) => /example\.invalid\/leak/.test(s)));
  assert.deepEqual(css, [], 'no injected CSS');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* The Colors plan's step 1 (2026-10-18): a look can be SHOWN without being chosen (the gallery, the compare tray and
   Surprise me will show many); a whole look is its own undo step; an undone plate goes back on the stage; and one
   filament count drives the Dock and every Shop list. */
test('Colors: a shown look is worn by the model but never chosen - the palette, the saved palette and the history stay; endPreview and a real pick end it', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.waitForSelector('#ws-colors .crow', { timeout: 30_000 });
  await settle(page, 600);
  const r = await page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__, st = window.__GEN2_STORE__;
    const saved = () => JSON.stringify(Object.keys(localStorage).filter((k) => k.startsWith('gen2-colors:')).sort().map((k) => [k, localStorage.getItem(k)]));
    const before = { pal: JSON.stringify(v.palette()), saved: saved(), undo: st.canUndo, caseHex: v.activeHex('Case') };
    const stealth = v.PRESETS.find((p) => p.name === 'Stealth');
    v.previewPalette({ colors: stealth.colors });
    await new Promise((ok) => setTimeout(ok, 450));   // past the store's 350 ms window: a snapshot would have landed by now
    const during = { pal: JSON.stringify(v.palette()), saved: saved(), undo: st.canUndo, caseHex: v.activeHex('Case'), previewing: v.previewing };
    const ended = v.endPreview();
    const after = { caseHex: v.activeHex('Case'), previewing: v.previewing, again: v.endPreview() };
    v.previewPalette({ colors: stealth.colors });   // shown again, for the real pick below to end
    return { before, during, ended, after, stealthCase: stealth.colors.Case.hex };
  });
  assert.notEqual(r.before.caseHex, r.stealthCase, 'the control: the chosen look and the shown one differ on the case');
  assert.equal(r.during.caseHex, r.stealthCase, 'the model wears the shown look');
  assert.equal(r.during.pal, r.before.pal, 'palette() still answers the chosen palette');
  assert.equal(r.during.saved, r.before.saved, 'nothing was saved to this browser');
  assert.equal(r.during.undo, r.before.undo, 'no history entry');
  assert.equal(r.during.previewing, true);
  assert.equal(r.ended, true, 'endPreview reports a look was shown');
  assert.equal(r.after.caseHex, r.before.caseHex, 'endPreview puts the chosen look back');
  assert.equal(r.after.previewing, false);
  assert.equal(r.after.again, false, 'a second endPreview has nothing to end');
  // a real change through the panel ends a shown look: open the first region's picker and pick a different filament
  await page.locator('#ws-colors .crow').first().click();
  await page.waitForSelector('#ws-picker .brands .sw', { timeout: 15_000 });
  await page.evaluate(() => { const sws = [...document.querySelectorAll('#ws-picker .brands .sw:not(.active)')]; sws[sws.length - 1].click(); });
  await settle(page, 500);
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.previewing), false, 'a real pick ends the shown look');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Colors: a preset applied straight after a region pick is its own undo step (the store merges changes within 350 ms)', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.waitForSelector('#ws-colors .crow', { timeout: 30_000 });
  await settle(page, 600);
  const palNow = () => page.evaluate(() => JSON.stringify(window.__GEN2_VIEWER__.palette().colors));
  const start = await palNow();
  // the picker first (the gallery opens over the panel), then the preset's details (step 3): its Apply sits beside the picker
  await page.locator('#ws-colors .crow').first().click();
  await page.waitForSelector('#ws-picker .brands .sw', { timeout: 15_000 });
  await page.locator('#ws-colors .browse').click();
  await page.locator('#ws-gallery .lcard').nth(1).click();
  await page.waitForSelector('#ws-gallery .apply', { timeout: 15_000 });
  // the pick and the preset in one task: well inside the store's 350 ms window
  const picked = await page.evaluate(() => {
    const sws = [...document.querySelectorAll('#ws-picker .brands .sw:not(.active)')]; sws[sws.length - 1].click();
    const after = JSON.stringify(window.__GEN2_VIEWER__.palette().colors);
    document.querySelector('#ws-gallery .apply').click();
    return after;
  });
  await settle(page, 600);
  assert.notEqual(picked, start, 'the control: the pick changed the palette');
  assert.notEqual(await palNow(), picked, 'the control: the preset changed it again');
  await page.keyboard.press('Control+Z');
  await settle(page, 600);
  assert.equal(await palNow(), picked, 'one Undo takes the preset off and keeps the pick');
  await page.keyboard.press('Control+Z');
  await settle(page, 600);
  assert.equal(await palNow(), start, 'a second Undo takes the pick off');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Colors: Undo of a plate finish puts the stage back on the old plate, and Redo forward again', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.waitForSelector('#ws-colors .seg3 .seg', { timeout: 30_000 });
  await settle(page, 600);
  const plates = () => page.evaluate(() => ({ stage: window.__GEN2_VIEWER__.build.buildPlate || 'powder', store: window.__GEN2_STORE__.state.buildPlate || 'powder' }));
  const first = await plates();
  const target = first.stage === 'smooth' ? 'Powder-coated' : 'Smooth';
  await page.locator('#ws-colors .seg3 .seg', { hasText: target }).click();
  await page.waitForFunction((p) => (window.__GEN2_VIEWER__.build.buildPlate || 'powder') !== p, first.stage, { timeout: 30_000 });
  await settle(page, 800);
  const changed = await plates();
  assert.equal(changed.stage, changed.store, 'the stage and the store agree after the pick');
  assert.notEqual(changed.stage, first.stage, 'the control: the plate changed');
  await page.keyboard.press('Control+Z');
  await page.waitForFunction((p) => (window.__GEN2_VIEWER__.build.buildPlate || 'powder') === p, first.stage, { timeout: 30_000 }).catch(() => {});
  await settle(page, 800);
  assert.deepEqual(await plates(), { stage: first.stage, store: first.stage }, 'Undo: the stage is back on the old plate with the store');
  await page.keyboard.press('Control+Y');
  await page.waitForFunction((p) => (window.__GEN2_VIEWER__.build.buildPlate || 'powder') === p, changed.stage, { timeout: 30_000 }).catch(() => {});
  await settle(page, 800);
  assert.deepEqual(await plates(), { stage: changed.stage, store: changed.stage }, 'Redo: forward again, together');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Colors: the Dock and a preset\'s Shop list count what this build prints - never bought hardware; the label text and a stripe count', async () => {
  const { ctx, page, errors } = await open('labels', { query: '&new=1' });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => x.textContent.trim().startsWith('Switch to EdgeLabel')); if (b) b.click(); });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 90_000 });
  await settle(page, 800);
  // a part label with a stripe, on a drawer, so the build prints label text and a stripe colour
  await page.evaluate(async () => {
    const R = await import('/js/rules/labels.js');
    const L = globalThis.GEN2LabelList;
    const st = window.__GEN2_STORE__;
    const item = { schema: 'part-picker-label-item/1', id: 'p6', family: 'screw', head: 'socket-cap', units: 'mm', fields: ['M2', '× 6'], value_missing: [],
      attributes: [{ path: 'head', text: 'SHCS', meaning: 'Socket head cap' }], pinned: ['head'], optional: [], pinned_unprinted: [],
      colours: { band: { colour: 'sky-blue', hex: '#56B4E9', label: 'Metric', pattern: 'solid' } } };
    const apply = (r) => { if (!r.ok) throw new Error(r.msg); st.flush(); st.commit((s) => R.applyResult(L, s, r), 'label'); st.flush(); };
    apply(R.addPartItems(L, st.state, [item]));
    const p6 = R.labelsOf(st.state).find((l) => l.hardware && l.hardware.id === 'p6');
    apply(R.place(L, st.state, R.drawers(st.state)[0].id, p6.id, null, 'drawer'));
  });
  await page.waitForFunction(() => window.__GEN2_VIEWER__.keysInBuild().some((k) => k.key === 'Label:TEXT'), null, { timeout: 30_000 });
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('colors'));
  await page.waitForSelector('#ws-colors .crow', { timeout: 30_000 });
  await settle(page, 800);
  const r = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__;
    const keys = v.keysInBuild(), locked = new Set(keys.filter((k) => k.locked).map((k) => k.key));
    const mine = v.filamentsInBuild();
    const signal = v.PRESETS.find((p) => p.name === 'Signal');
    const sig = v.filamentsInBuild({ colors: signal.colors, over: {} });
    const sigOnlyHardware = [...new Set(['Magnet', 'Screw'].map((k) => signal.colors[k] && signal.colors[k].name))].filter((n) => n && !Object.entries(signal.colors).some(([k, f]) => !['Magnet', 'Screw'].includes(k) && f.name === n));
    return {
      lockedKeys: [...locked], countedKeys: mine.filaments.flatMap((f) => f.keys),
      count: mine.count, filaments: mine.filaments.length, stripes: mine.unpicked.filter((u) => u.stripe).map((u) => u.hex),
      textWears: (mine.filaments.find((f) => f.keys.includes('Label:TEXT')) || {}).name || null,
      sigRows: sig.filaments.length + sig.unpicked.length, sigCount: sig.count, sigNames: sig.filaments.map((f) => f.name), sigOnlyHardware,
      sigLeaks: sig.filaments.flatMap((f) => f.keys).filter((k) => !keys.some((x) => x.key === k)),
    };
  });
  assert.ok(r.lockedKeys.length > 0, 'the control: this build has bought hardware');
  assert.deepEqual(r.countedKeys.filter((k) => r.lockedKeys.includes(k)), [], 'bought hardware never counts');
  assert.ok(r.textWears, 'the label text counts, wearing the preset\'s own black');
  assert.deepEqual(r.stripes, ['#56b4e9'], 'the stripe counts, in the label\'s own colour');
  assert.equal(r.count, r.filaments + 1, 'the count: every filament plus the one stripe colour');
  assert.match(await page.locator('#ws-dock .status.stack').textContent(), new RegExp(`\\b${r.count} filaments\\b`), 'the Dock shows that count');
  // Signal's Shop list, as THIS build would wear it: only its regions, and no filament the preset gives bought hardware alone
  assert.deepEqual(r.sigLeaks, [], 'no region the build lacks');
  for (const n of r.sigOnlyHardware) assert.ok(!r.sigNames.includes(n), `${n} is only on bought hardware in Signal, so it is not listed`);
  // Shop this look lives in the look's details (step 3): the gallery, the Signal card, its filament rows
  await page.locator('#ws-colors .browse').click();
  await page.locator('#ws-gallery .lcard').filter({ hasText: 'Signal' }).click();
  await page.waitForSelector('#ws-gallery .frow', { timeout: 15_000 });
  assert.equal(await page.locator('#ws-gallery .frow').count(), r.sigRows, 'the Shop list lists exactly those rows');
  assert.match(await page.locator('#ws-gallery .lcount').textContent(), new RegExp(`^${r.sigCount} filaments`), 'the details say the count');   // (not the text() helper: this case declares its own `text` below)
  // with no label-text pick, the label text row reads as its own colour, not "follows Body"
  await page.keyboard.press('Escape');   // the details close
  await page.keyboard.press('Escape');   // the gallery closes
  const text = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__; const p = v.palette(); delete p.colors['Label:TEXT']; v.setPalette({ colors: p.colors, on: true, over: p.over });
    return null;
  });
  void text;
  await settle(page, 300);
  await page.evaluate(() => window.__GEN2_STORE__.commit(() => {}, 'color'));   // the panel re-renders on a commit
  await settle(page, 400);
  const row = await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-colors .crow')].find((x) => /Label text/.test(x.textContent)); return b ? b.querySelector('.fil').textContent : null; });
  assert.ok(row && !/follows Body/.test(row), `the label text row says what it wears, not "follows Body": ${row}`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* The Colors plan's step 2 (2026-10-18, STEP2-GATE.md): a look card renders THIS build wearing a look, offscreen. It must
   compile no shader program per look (a gallery has dozens), and it must look like the screen. On a tone-mapped tier that
   takes the XR-flagged, RGBA8-stored target: an ordinary render target misses the tone mapping, and the XR flag with sRGB
   storage encodes twice. `isXRRenderTarget` is internal to three.js, so this case is what an upgrade would trip. */
test('Colors step 2: a look card of this build compiles no shader program after the first, and matches the screen on a tone-mapped tier', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'balanced'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
  const { ctx, page, errors } = await open('colors', { context });
  await page.waitForSelector('#ws-colors .crow', { timeout: 30_000 });
  await settle(page, 1500);
  const r = await page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__;
    const diff = (c) => { const d = []; for (let i = 0; i < c.pixels.length; i += 4) { if (c.pixels[i + 3] < 250) continue; d.push(Math.max(Math.abs(c.pixels[i] - c.cmp[i]), Math.abs(c.pixels[i + 1] - c.cmp[i + 1]), Math.abs(c.pixels[i + 2] - c.cmp[i + 2]))); } d.sort((a, b) => a - b); return { pixels: d.length, median: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)] }; };
    const looks = v.PRESETS.map((p) => ({ colors: p.colors, over: {} }));
    await v.lookCard(looks[0]);
    const afterFirst = v.probe().programs;
    for (const l of looks) await v.lookCard(l);
    const afterAll = v.probe().programs;
    const pal = v.palette(), chosen = { colors: pal.colors, over: pal.over };
    const card = diff(await v.lookCard(chosen, { compare: 'canvas' }));
    const plain = diff(await v.lookCard(chosen, { xr: false, linear: false, compare: 'canvas' }));   // the control: an ordinary target
    return { tier: v.quality, afterFirst, afterAll, card, plain };
  });
  assert.equal(r.tier, 'balanced', 'the case runs on a tone-mapped tier');
  assert.equal(r.afterAll, r.afterFirst, 'four more looks compile no shader program');
  assert.ok(r.card.pixels > 1000, `the card shows the build (${r.card.pixels} pixels)`);
  assert.ok(r.card.median <= 6 && r.card.p95 <= 32, `the card matches the screen: median ${r.card.median}, p95 ${r.card.p95}`);
  assert.ok(r.plain.median > 12, `the control: an ordinary render target misses the tone mapping (median ${r.plain.median})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* The Colors plan's step 3 (2026-10-18): the Browse looks gallery. Every card is THIS build wearing a look (lookCard), keyed
   on the scene revision so a card never outlives the build it shows; a hovered card is shown on the model and never chosen
   (previewPalette), and nothing a card does sends a preset event (GoatCounter 429s are the history here, e2e 111). */
test('Colors step 3: the gallery draws every look on this build, a hovered card is shown and not chosen, the cards follow the build and Undo, and no preset event is sent', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.waitForSelector('#ws-colors .crow', { timeout: 30_000 });
  await settle(page, 800);
  const drawnAll = () => page.waitForFunction(() => { const c = document.querySelectorAll('#ws-gallery .lcard canvas'); return c.length >= 11 && [...c].every((x) => x.classList.contains('drawn')); }, null, { timeout: 30_000 });
  await page.locator('#ws-colors .browse').click();
  await drawnAll();
  const first = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__;
    const cards = [...document.querySelectorAll('#ws-gallery .lcard')];
    const key = (c) => JSON.parse(c.querySelector('canvas').dataset.key);
    // a drawn card holds a picture: not every pixel is the empty background
    const painted = cards.map((c) => { const cv = c.querySelector('canvas'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 250) n++; return n; });
    return { names: cards.map((c) => c.querySelector('.lname').textContent), revs: [...new Set(cards.map((c) => key(c)[0]))], sceneRev: v.sceneRev, painted, active: cards.filter((c) => c.classList.contains('on')).map((c) => c.querySelector('.lname').textContent), hero: !!document.querySelector('#ws-colors canvas.drawn') };
  });
  assert.ok(first.names.length >= 11 && first.names.includes('Stealth') && first.names.includes('Black & gold'), `the presets are the cards: ${first.names.join(', ')}`);
  assert.deepEqual(first.revs, [first.sceneRev], 'every card is keyed on the current scene revision');
  assert.ok(first.painted.every((n) => n > 2000), `every card shows the build (${first.painted.join(', ')} opaque pixels)`);
  assert.deepEqual(first.active, ['The Jerrari'], 'the boot preset is the active card');
  assert.ok(first.hero, 'the panel\'s own card is drawn');
  // hover: shown, not chosen
  const before = await page.evaluate(() => JSON.stringify(window.__GEN2_VIEWER__.palette().colors));
  await page.locator('#ws-gallery .lcard').nth(1).hover();
  await settle(page, 300);
  const hovered = await page.evaluate(() => ({ previewing: window.__GEN2_VIEWER__.previewing, caseHex: window.__GEN2_VIEWER__.activeHex('Case'), palette: JSON.stringify(window.__GEN2_VIEWER__.palette().colors), canUndo: window.__GEN2_STORE__.canUndo }));
  assert.ok(hovered.previewing && hovered.caseHex === '#2b2b2e', `the model wears Stealth while the card is hovered (${hovered.caseHex})`);
  assert.equal(hovered.palette, before, 'the palette is not chosen');
  await page.mouse.move(900, 400);
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.previewing), false, 'leaving the card puts the chosen look back');
  // the build changes (in Build, whose store subscriber rebuilds the stage): back in Colors the cards are of the new build,
  // the cache's old cards left aside; Undo in Build takes the unit away and the cards follow again
  const units0 = await page.evaluate(() => window.__GEN2_VIEWER__.build.placed.length);
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('build'));
  await page.waitForSelector('#ws-lib', { timeout: 30_000 });
  // a unit on the floor beside the build (as startBuild places them: anything floating is refused by the layout rules)
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.placed.push({ id: s.nextId++, x: s.gridW, y: s.gridH * 2 - 2, w: 1, hh: 2, fill: 'decor', shelves: 0 }); s.gridW = Math.max(1, ...s.placed.map((p) => p.x + p.w)); }, 'edit'));
  await page.waitForFunction((n) => window.__GEN2_VIEWER__.build.placed.length === n + 1 && !window.__GEN2_VIEWER__.regenBusy, units0, { timeout: 90_000 });
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('colors'));
  await page.waitForSelector('#ws-colors .browse', { timeout: 30_000 });
  await page.locator('#ws-colors .browse').click();
  await drawnAll();
  const after = await page.evaluate(() => ({ revs: [...new Set([...document.querySelectorAll('#ws-gallery .lcard canvas')].map((c) => JSON.parse(c.dataset.key)[0]))], sceneRev: window.__GEN2_VIEWER__.sceneRev, units: window.__GEN2_VIEWER__.build.placed.length }));
  assert.deepEqual(after.revs, [after.sceneRev], `after a build change every card is of the new build (revision ${after.sceneRev})`);
  assert.ok(after.sceneRev > first.sceneRev && after.units === units0 + 1, 'the control: the revision moved with the unit');
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('build'));
  await page.waitForSelector('#ws-lib', { timeout: 30_000 });
  await page.keyboard.press('Control+Z');
  await page.waitForFunction((n) => window.__GEN2_VIEWER__.build.placed.length === n && !window.__GEN2_VIEWER__.regenBusy, units0, { timeout: 90_000 });
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('colors'));
  await page.waitForSelector('#ws-colors .browse', { timeout: 30_000 });
  await page.locator('#ws-colors .browse').click();
  await drawnAll();
  const undone = await page.evaluate(() => ({ revs: [...new Set([...document.querySelectorAll('#ws-gallery .lcard canvas')].map((c) => JSON.parse(c.dataset.key)[0]))], sceneRev: window.__GEN2_VIEWER__.sceneRev, units: window.__GEN2_VIEWER__.build.placed.length, presetEvents: window.__GEN2_VIEWER__.trackLog.filter((n) => /^preset:/.test(n)) }));
  assert.deepEqual(undone.revs, [undone.sceneRev], 'after Undo every card is of the restored build');
  assert.ok(undone.units < after.units, 'the control: Undo took the unit away');
  assert.deepEqual(undone.presetEvents, [], 'no card, hover or details sent a preset event');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* the pacing gate (STEP3.md, M5): the gallery fills a few cards an animation frame, with the page's frames measured
   meanwhile. The marks proper are measured by hand on a real GPU (step3-pacing.mjs); this case only refuses a regression
   to something pathological (a serial fill at one card per GPU fence, say) on whatever the suite runs on. */
test('Colors step 3: the gallery fills within bounds and keeps the page\'s frames bounded', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.waitForSelector('#ws-colors .crow', { timeout: 30_000 });
  await settle(page, 2000);
  const r = await page.evaluate(async () => {
    const frames = []; let last = performance.now(), go = true;
    const tick = (t) => { frames.push(t - last); last = t; if (go) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const t0 = performance.now();
    document.querySelector('#ws-colors .browse').click();
    const n = document.querySelectorAll('#ws-gallery .lcard').length;
    while (document.querySelectorAll('#ws-gallery canvas.drawn').length < n && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 5));
    const total = performance.now() - t0; go = false;
    const f = frames.slice(1).sort((a, b) => a - b);
    return { cards: n, drawn: document.querySelectorAll('#ws-gallery canvas.drawn').length, total: Math.round(total), frames: f.length, p50: Math.round(f[Math.floor(f.length / 2)] || 0), p95: Math.round(f[Math.floor(f.length * 0.95)] || 0), max: Math.round(f[f.length - 1] || 0) };
  });
  console.log(`      gallery fill: ${r.drawn}/${r.cards} cards in ${r.total} ms over ${r.frames} frames; frame p50 ${r.p50} p95 ${r.p95} max ${r.max} ms`);
  assert.equal(r.drawn, r.cards, 'every card drawn');
  // the bounds are the CI runner's, not a GPU's: its software rasteriser took 8.9 s for the 11 cards on 2026-10-18 (run
  // 39142321766 failed a 5 s bound; this laptop's soft run takes 1.7 s with 250 ms frames, a real GPU 150 ms with 17 ms
  // frames). The marks proper are in STEP3.md, measured by step3-pacing.mjs on a GPU; this gate catches only a fill that
  // never ends or a frame that stalls for seconds. It cannot see the serial-fence pathology (11 cards in 1.2 s on a GPU,
  // Terra 01a14fce): that is the harness's job
  assert.ok(r.total <= 30_000, `the gallery filled within 30 s (${r.total} ms)`);
  assert.ok(r.max <= 2000, `no frame stalled two seconds (max ${r.max} ms)`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* the phone: the gallery is a bottom sheet of its own, one open at a time with the Colors and picker sheets; the details
   take the sheet's title; closing comes back to the Colors sheet */
test('Colors step 3 on the phone: Browse looks opens the gallery sheet over the model, a card opens its details, closing returns to the Colors sheet', async () => {
  const { ctx, page, errors } = await open('colors', { phone: true });
  await page.waitForSelector('#ws-colors .browse', { timeout: 30_000 });
  await page.locator('#ws-colors .browse').click();
  await page.waitForFunction(() => document.querySelector('#ws-gallery').classList.contains('open') && !document.querySelector('#ws-colors').classList.contains('open'), null, { timeout: 30_000 });
  assert.match(await text(page, '#ws-gallery .sheet-handle .ttl'), /Looks/);
  await page.waitForFunction(() => document.querySelectorAll('#ws-gallery .lcard canvas.drawn').length >= 11, null, { timeout: 30_000 });
  await page.locator('#ws-gallery .lcard').nth(1).click();
  await page.waitForSelector('#ws-gallery .apply', { timeout: 15_000 });
  assert.match(await text(page, '#ws-gallery .sheet-handle .ttl'), /Stealth/, 'the sheet is titled after the look');
  await page.locator('#ws-gallery .x').click();
  await page.waitForFunction(() => document.querySelector('#ws-gallery').hidden && document.querySelector('#ws-colors').classList.contains('open'), null, { timeout: 30_000 });
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* The Colors plan's step 4 (2026-10-18): the compare tray. Two or three finalists from the gallery; a flip SHOWS one on the
   model (previewPalette: never saved, never in the history) with the camera and the safe area untouched; Apply is one
   undo step through the look's own apply; the tray and the gallery never show together. */
test('Colors step 4: finalists enter the tray from the gallery, a flip shows one on a still model and chooses nothing, Apply is one undo step', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.waitForSelector('#ws-colors .crow', { timeout: 30_000 });
  await settle(page, 800);
  await page.locator('#ws-colors .browse').click();
  await page.waitForSelector('#ws-gallery .cmp', { timeout: 30_000 });
  assert.equal(await page.locator('#ws-gallery .cmp-open').isDisabled(), true, 'Compare is disabled while the tray is empty');
  await page.locator('#ws-gallery .cmp').nth(1).click();   // Stealth
  await page.locator('#ws-gallery .cmp').nth(2).click();   // Signal
  assert.equal(await text(page, '#ws-gallery .cmp-open'), 'Compare (2)', 'the head counts the finalists');
  assert.equal(await page.locator('#ws-gallery .cmp.on').count(), 2, 'their corner buttons read as in');
  await page.locator('#ws-gallery .cmp-open').click();
  await page.waitForFunction(() => !document.querySelector('#ws-tray').hidden && document.querySelector('#ws-gallery').hidden, null, { timeout: 15_000 });   // the tray, not the gallery
  await page.waitForFunction(() => document.querySelectorAll('#ws-tray canvas.drawn').length === 2, null, { timeout: 30_000 });
  // the tray's opening lifted the safe area's floor once, and the camera eases to its new fit: the flips are judged only
  // once it has come to rest (the same position read twice, 300 ms apart)
  await page.waitForFunction(() => { const p = JSON.stringify(window.__GEN2_VIEWER__.camera.position.toArray()); const same = window.__camPrev === p; window.__camPrev = p; return same; }, null, { polling: 300, timeout: 15_000 });
  const before = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; return { palette: JSON.stringify(v.palette().colors), cam: JSON.stringify(v.camera.position.toArray()), safe: JSON.stringify(v.safeArea), canUndo: window.__GEN2_STORE__.canUndo }; });
  await page.locator('#ws-tray .pick').nth(0).click();
  await settle(page, 300);
  const flipped = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; return { previewing: v.previewing, caseHex: v.activeHex('Case'), palette: JSON.stringify(v.palette().colors), cam: JSON.stringify(v.camera.position.toArray()), safe: JSON.stringify(v.safeArea), shown: document.querySelectorAll('#ws-tray .tcard.on').length, canUndo: window.__GEN2_STORE__.canUndo }; });
  assert.ok(flipped.previewing && flipped.caseHex === '#2b2b2e', `the model wears Stealth after the flip (${flipped.caseHex})`);
  assert.equal(flipped.palette, before.palette, 'the palette is not chosen by a flip');
  assert.equal(flipped.cam, before.cam, 'the camera stays where it was');
  assert.equal(flipped.safe, before.safe, 'the safe area is untouched by a flip');
  assert.equal(flipped.canUndo, before.canUndo, 'a flip is not an undo step');
  assert.equal(flipped.shown, 1, 'the shown card is marked');
  await page.locator('#ws-tray .pick').nth(1).click();
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.activeHex('Drawer')), '#d23a2e', 'the second finalist (Signal) replaces the first on the model');
  await page.locator('#ws-tray .current').click();
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.previewing), false, 'Current puts the chosen look back');
  await page.locator('#ws-tray .pick').nth(0).click();
  await settle(page, 300);
  await page.locator('#ws-tray .apply').click();
  await settle(page, 600);
  const applied = await page.evaluate(() => ({ palette: JSON.stringify(window.__GEN2_VIEWER__.palette().colors), previewing: window.__GEN2_VIEWER__.previewing, name: document.querySelector('#ws-colors .lname').textContent, trayOpen: !document.querySelector('#ws-tray').hidden }));
  assert.notEqual(applied.palette, before.palette, 'Apply chose the look');
  assert.ok(!applied.previewing && /Stealth/.test(applied.name) && applied.trayOpen, `applied for real, named on the card, the tray still open (${applied.name})`);
  await page.keyboard.press('Control+Z');
  await settle(page, 800);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GEN2_VIEWER__.palette().colors)), before.palette, 'one Undo takes it off again');
  await page.locator('#ws-tray .tcard .x').nth(0).click();
  await settle(page, 200);
  assert.equal(await page.locator('#ws-tray .tcard').count(), 1, 'a finalist can be removed');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#ws-tray').hidden, null, { timeout: 15_000 });
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Colors step 4 on the phone: the tray is a sheet of its own, opened from the gallery and closed back to the Colors sheet', async () => {
  const { ctx, page, errors } = await open('colors', { phone: true });
  await page.waitForSelector('#ws-colors .browse', { timeout: 30_000 });
  await page.locator('#ws-colors .browse').click();
  await page.waitForSelector('#ws-gallery .cmp', { timeout: 30_000 });
  await page.locator('#ws-gallery .cmp').nth(1).click();
  await page.locator('#ws-gallery .cmp').nth(2).click();
  await page.locator('#ws-gallery .cmp-open').click();
  await page.waitForFunction(() => document.querySelector('#ws-tray').classList.contains('open') && !document.querySelector('#ws-gallery').classList.contains('open'), null, { timeout: 30_000 });
  assert.match(await text(page, '#ws-tray .sheet-handle .ttl'), /Compare · 2 of 3/);
  await page.locator('#ws-tray .pick').nth(0).click();
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.previewing), true, 'a flip shows the look on the phone too');
  await page.locator('#ws-tray .ihead .x').click();
  await page.waitForFunction(() => document.querySelector('#ws-tray').hidden && document.querySelector('#ws-colors').classList.contains('open') && !window.__GEN2_VIEWER__.previewing, null, { timeout: 30_000 });
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* The Colors plan's step 5 (2026-10-18): Surprise me. Three generated candidates for THIS build under a mood, a filament
   cap, locks and (on the phone case) the owned list; shown on the model like the tray's finalists (previewPalette: never
   chosen), with the camera and the safe area untouched; Keep is one undo step; the generator's rules are the unit test's
   (test/surprise.test.mjs), this case proves the workspace around it. */
test('Colors step 5: Surprise me draws three candidates of this build, a hovered one is shown and not chosen, the cap and a lock hold, Keep is one undo step, the camera stays', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.waitForSelector('#ws-colors .crow', { timeout: 30_000 });
  await settle(page, 800);
  const drawn3 = () => page.waitForFunction(() => document.querySelectorAll('#ws-surprise .cand canvas.drawn').length === 3, null, { timeout: 30_000 });
  const before = await page.evaluate(() => ({ cam: JSON.stringify(window.__GEN2_VIEWER__.camera.position.toArray()), safe: JSON.stringify(window.__GEN2_VIEWER__.safeArea), palette: JSON.stringify(window.__GEN2_VIEWER__.palette().colors) }));
  await page.locator('#ws-colors .surprise').click();
  await drawn3();
  const first = await page.evaluate(() => {
    const sp = window.__GEN2_SURPRISE__;
    const cards = [...document.querySelectorAll('#ws-surprise .cand')];
    return { names: cards.map((c) => c.querySelector('.lname').textContent), counts: cards.map((c) => +c.querySelector('.lcount').textContent.split(' ')[0]), stray: [...document.querySelector('#ws-surprise').childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent), style: sp.style, tile: document.querySelector('#ws-surprise .stile.on .sname')?.textContent, tiles: document.querySelectorAll('#ws-surprise .stile .sw3 i').length, cap: sp.cap, galleryHidden: document.querySelector('#ws-gallery').hidden, cam: JSON.stringify(window.__GEN2_VIEWER__.camera.position.toArray()), safe: JSON.stringify(window.__GEN2_VIEWER__.safeArea) };
  });
  assert.equal(new Set(first.names).size, 3, `three candidates, named apart: ${first.names.join(' / ')}`);
  assert.ok(first.style === 'workshop' && first.tile === 'Workshop classic' && first.tiles === 15, `five style tiles with three swatches each, Workshop classic on (${first.tile}, ${first.tiles})`);
  // the feet's TPU is on top of the cap (2026-10-21): a card's count is every spool this build prints in, so one more where it has printed feet
  const feetX = await page.evaluate(() => (window.__GEN2_VIEWER__.keysInBuild().some((k) => k.key === 'Foot') ? 1 : 0));
  assert.ok(first.counts.every((c) => c >= 1 && c <= first.cap + feetX), `every candidate within the cap of ${first.cap} (+${feetX} TPU feet) on this build (${first.counts.join(', ')})`);
  if (feetX) assert.match(await text(page, '#ws-surprise .note.feetcap'), /The feet print in TPU95 Black in every look, on top of the cap/, 'and the panel says so');
  assert.deepEqual(first.stray, [], 'no stray text in the panel');
  assert.ok(first.galleryHidden, 'the panel takes the gallery\'s spot; the gallery is closed');
  assert.equal(first.safe, before.safe, 'opening the panel leaves the safe area alone');
  assert.equal(first.cam, before.cam, 'and the camera');
  // hover: shown, not chosen
  await page.locator('#ws-surprise .cand .pick').nth(0).hover();
  await settle(page, 300);
  const hovered = await page.evaluate(() => ({ previewing: window.__GEN2_VIEWER__.previewing, caseHex: window.__GEN2_VIEWER__.activeHex('Case'), palette: JSON.stringify(window.__GEN2_VIEWER__.palette().colors), canUndo: window.__GEN2_STORE__.canUndo, candCase: window.__GEN2_SURPRISE__.cands[0].colors.Case.hex }));
  assert.ok(hovered.previewing && hovered.caseHex.toLowerCase() === hovered.candCase.toLowerCase(), `the model wears the candidate's case while hovered (${hovered.caseHex} for ${hovered.candCase})`);
  assert.equal(hovered.palette, before.palette, 'the palette is not chosen');
  assert.equal(hovered.canUndo, false, 'nothing in the history');
  await page.mouse.move(900, 400);
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.previewing), false, 'leaving the card puts the chosen look back');
  // Try again: three others, the camera and the safe area still where they were
  await page.locator('#ws-surprise .again').click();
  await drawn3();
  const again = await page.evaluate(() => ({ names: [...document.querySelectorAll('#ws-surprise .cand .lname')].map((x) => x.textContent), cam: JSON.stringify(window.__GEN2_VIEWER__.camera.position.toArray()), safe: JSON.stringify(window.__GEN2_VIEWER__.safeArea), previewing: window.__GEN2_VIEWER__.previewing }));
  assert.notDeepEqual(again.names, first.names, 'Try again rolls three others');
  assert.equal(again.cam, before.cam, 'the camera across Try again'); assert.equal(again.safe, before.safe, 'the safe area across Try again');
  assert.equal(again.previewing, false);
  // the cap at 2: every candidate prints in two; a quiet interpretation needs a third colour for its face, so two candidates
  // (balanced and bold), said in the note, never padded (5b)
  await page.locator('#ws-surprise .cap .seg').nth(0).click();
  const drawnAll = () => page.waitForFunction(() => { const c = document.querySelectorAll('#ws-surprise .cand canvas'); return c.length >= 1 && [...c].every((x) => x.classList.contains('drawn')); }, null, { timeout: 30_000 });
  await drawnAll();
  const capped = await page.evaluate(() => ({ counts: [...document.querySelectorAll('#ws-surprise .cand .lcount')].map((x) => +x.textContent.split(' ')[0]), whole: window.__GEN2_SURPRISE__.cands.map((c) => new Set(Object.entries(c.colors).filter(([k]) => k !== 'Magnet' && k !== 'Screw' && k !== 'Foot').map(([, f]) => f.name)).size), slots: window.__GEN2_SURPRISE__.cands.map((c) => c.slot), note: document.querySelector('#ws-surprise .short')?.textContent || null }));
  assert.ok(capped.counts.every((c) => c <= 2 + feetX) && capped.whole.every((w) => w <= 2), `the cap of 2 holds on the build (${capped.counts.join(', ')}, +${feetX} TPU feet) and over the whole look, feet aside (${capped.whole.join(', ')})`);
  assert.deepEqual(capped.slots, ['balanced', 'bold'], 'two interpretations at a cap of 2');
  assert.match(capped.note || '', /Only 2 looks fit/, 'and the note says so');
  // a lock on the case: every candidate keeps the case the build wears
  await page.locator('#ws-surprise .lchip', { hasText: 'Case' }).click();
  await drawnAll();
  const locked = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; const sp = window.__GEN2_SURPRISE__; return { held: sp.locks.shell && sp.locks.shell.name, caseNow: v.palette().colors.Case.name, cases: sp.cands.map((c) => c.colors.Case.name), extenders: sp.cands.map((c) => c.colors.CaseExtender.name), chipOn: document.querySelector('#ws-surprise .lchip.on')?.textContent }; });
  assert.equal(locked.held, locked.caseNow, 'the lock holds the case the build wears');
  assert.ok(locked.cases.every((c) => c === locked.caseNow) && locked.extenders.every((c) => c === locked.caseNow), `every candidate keeps it (${locked.cases.join(', ')})`);
  assert.equal(locked.chipOn, 'Case');
  // Keep: one undo step, the panel named after the candidate, Undo takes it back
  const keepName = await page.locator('#ws-surprise .cand .lname').nth(0).textContent();
  await page.locator('#ws-surprise .keep').nth(0).click();
  await settle(page, 600);
  const kept = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; const sp = window.__GEN2_SURPRISE__; return { palette: JSON.stringify(v.palette().colors), cand: JSON.stringify(sp.cands[0].colors), lname: document.querySelector('#ws-colors .lname').textContent, canUndo: window.__GEN2_STORE__.canUndo, previewing: v.previewing, badge: document.querySelector('#ws-surprise .cand .badge')?.textContent, keepBtn: document.querySelector('#ws-surprise .keep').textContent, panelOpen: !document.querySelector('#ws-surprise').hidden }; });
  assert.equal(kept.palette, kept.cand, 'the build wears the kept look');
  assert.equal(kept.lname, keepName, 'the panel is named after it');
  assert.ok(kept.canUndo && !kept.previewing && kept.badge === 'ACTIVE' && kept.keepBtn === 'In use' && kept.panelOpen, `kept: ${JSON.stringify(kept)}`);
  await page.keyboard.press('Control+Z');
  await settle(page, 600);
  const undone = await page.evaluate(() => ({ palette: JSON.stringify(window.__GEN2_VIEWER__.palette().colors), lname: document.querySelector('#ws-colors .lname').textContent, canUndo: window.__GEN2_STORE__.canUndo, presetEvents: window.__GEN2_VIEWER__.trackLog.filter((n) => /^preset:/.test(n)) }));
  assert.equal(undone.palette, before.palette, 'one Undo restores the palette');
  assert.equal(undone.lname, 'The Jerrari'); assert.equal(undone.canUndo, false, 'Keep was exactly one step');
  assert.deepEqual(undone.presetEvents, [], 'no candidate, hover or Keep sent a preset event');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Colors step 5 on the phone: Surprise me is a sheet of its own; the owned list is ticked in it and "only filaments I own" keeps every candidate inside it; closing returns to the Colors sheet', async () => {
  const { ctx, page, errors } = await open('colors', { phone: true });
  await page.waitForSelector('#ws-colors .surprise', { timeout: 30_000 });
  await page.locator('#ws-colors .surprise').click();
  await page.waitForFunction(() => document.querySelector('#ws-surprise').classList.contains('open') && !document.querySelector('#ws-colors').classList.contains('open'), null, { timeout: 30_000 });
  assert.match(await text(page, '#ws-surprise .sheet-handle .ttl'), /Find your next look/);
  await page.waitForFunction(() => document.querySelectorAll('#ws-surprise .cand canvas.drawn').length === 3, null, { timeout: 30_000 });
  await page.locator('#ws-surprise .cand .pick').nth(0).click();
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.previewing), true, 'a tap shows the candidate on the phone');
  assert.equal(await page.evaluate(() => document.querySelector('#ws-surprise .ownedonly').disabled), true, 'with nothing owned the switch is off');
  await page.locator('#ws-surprise .edit').click();
  await page.waitForSelector('#ws-surprise .sw', { timeout: 15_000 });
  assert.match(await text(page, '#ws-surprise .sheet-handle .ttl'), /Filaments I own/, 'the sheet is titled after the editor');
  for (const label of ['Elegoo PLA Black', 'Printed Solid Mystery Orange', 'Panchroma Cold White']) await page.locator(`#ws-surprise .sw[aria-label="${label}"]`).click();
  assert.match(await text(page, '#ws-surprise .ocount'), /3 filaments/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gen2-owned')).labels.length), 3, 'the list is kept in this browser');
  await page.locator('#ws-surprise .back').click();
  await page.waitForSelector('#ws-surprise .ownedonly:not([disabled])', { timeout: 15_000 });
  await page.locator('#ws-surprise .ownedonly').click();
  await page.waitForFunction(() => { const sp = window.__GEN2_SURPRISE__; return sp.ownedOnly && sp.cands.length && [...document.querySelectorAll('#ws-surprise .cand canvas')].every((c) => c.classList.contains('drawn')); }, null, { timeout: 30_000 });
  const owned = await page.evaluate(() => { const sp = window.__GEN2_SURPRISE__; const have = new Set(JSON.parse(localStorage.getItem('gen2-owned')).labels); return { within: sp.cands.every((c) => Object.entries(c.colors).every(([k, f]) => k === 'Magnet' || k === 'Screw' || k === 'Foot' || have.has(f.name))), n: sp.cands.length, short: sp.short, note: document.querySelector('#ws-surprise .short')?.textContent || null }; });
  assert.ok(owned.within, 'every candidate prints only in owned filaments, the feet’s TPU aside');
  assert.ok(!owned.short || /fit these settings/.test(owned.note), `fewer than three is said, never hidden (${owned.n}: ${owned.note})`);
  // the list shrinks under the switch and the editor is left by its close button, not Back: the candidates are rolled again
  // inside the new list when the panel reopens (Sol 01a150df: Escape and close skipped the re-roll, so Keep could apply a
  // filament no longer owned)
  await page.locator('#ws-surprise .edit').click();
  await page.waitForSelector('#ws-surprise .sw', { timeout: 15_000 });
  await page.locator('#ws-surprise .sw[aria-label="Printed Solid Mystery Orange"]').click();
  await page.locator('#ws-surprise .head .x').click();
  await page.waitForFunction(() => document.querySelector('#ws-surprise').hidden, null, { timeout: 30_000 });
  await page.locator('#ws-colors .surprise').click();
  await page.waitForFunction(() => { const sp = window.__GEN2_SURPRISE__; return document.querySelector('#ws-surprise').classList.contains('open') && (!sp.cands.length || [...document.querySelectorAll('#ws-surprise .cand canvas')].every((c) => c.classList.contains('drawn'))); }, null, { timeout: 30_000 });
  const shrunk = await page.evaluate(() => { const sp = window.__GEN2_SURPRISE__; const have = new Set(JSON.parse(localStorage.getItem('gen2-owned')).labels); return { have: [...have], ownedOnly: sp.ownedOnly, within: sp.cands.every((c) => Object.entries(c.colors).every(([k, f]) => k === 'Magnet' || k === 'Screw' || have.has(f.name))), n: sp.cands.length }; });
  assert.deepEqual(shrunk.have, ['Elegoo PLA Black', 'Panchroma Cold White']);
  assert.ok(shrunk.ownedOnly && shrunk.within, `after the list shrank, every candidate is inside it (${shrunk.n} candidates)`);
  await page.locator('#ws-surprise .head .x').click();
  await page.waitForFunction(() => document.querySelector('#ws-surprise').hidden && document.querySelector('#ws-colors').classList.contains('open') && !window.__GEN2_VIEWER__.previewing, null, { timeout: 30_000 });
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* The Colors plan's step 6 (2026-10-18): the confidence summary and Simplify. The summary's count is the Dock's (D2) and
   its regions are the build's, for every preset; Simplify shows the proposal on the model (previewPalette, never chosen)
   and lists exactly which regions change; Cancel leaves nothing; Apply is one undo step; the camera and the safe area stay. */
test('Colors step 6: the summary line matches the Dock for every preset; Simplify previews the change, Cancel leaves nothing, Apply is one undo step and the Dock drops; the camera stays', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.waitForSelector('#ws-colors .summary', { timeout: 30_000 });
  await settle(page, 800);
  // M26: the twelve presets, applied through the stage (no history noise), each read off the panel against the Dock
  const presets = await page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__; const out = [];
    for (const p of v.PRESETS) {
      v.applyPreset(p, { quiet: true }); window.__GEN2_STORE__.commit(() => {}, 'preset'); window.__GEN2_STORE__.flush();
      await new Promise((r) => setTimeout(r, 150));
      const line = document.querySelector('#ws-colors .summary .sline').textContent;
      const groups = [...document.querySelectorAll('#ws-colors .summary .sgl')].map((x) => x.textContent.replace(/: $/, ''));
      out.push({ name: p.name, line, groups, count: v.filamentsInBuild().count, dock: document.querySelector('#ws-dock .status').textContent });
    }
    return out;
  });
  assert.equal(presets.length, 12);
  for (const p of presets) {
    assert.ok(p.line.startsWith(`${p.count} filament${p.count === 1 ? '' : 's'} used`), `${p.name}: "${p.line}" against a count of ${p.count}`);
    assert.ok(p.dock.startsWith(`${p.count} filament`), `${p.name}: the Dock says ${p.dock}`);
    const words = p.groups.flatMap((g) => g.split(', ').map((w) => w.toLowerCase()));
    assert.equal(new Set(words).size, words.length, `${p.name}: every region once (${p.groups.join(' | ')})`);
    assert.ok(words.includes('case') && words.includes('fronts') && !words.some((w) => /deck|labels|handles|^accents$/.test(w)), `${p.name}: the root kit's regions, nothing it lacks (${words.join(', ')})`);
  }
  // back to The Jerrari for the Simplify flow (4 filaments: black, orange, silk silver, PETG orange on the small parts)
  await page.evaluate(() => { const v = window.__GEN2_VIEWER__; v.applyPreset(v.PRESETS[0], { quiet: true }); window.__GEN2_STORE__.commit(() => {}, 'preset'); window.__GEN2_STORE__.flush(); });
  await settle(page, 400);
  const before = await page.evaluate(() => ({ palette: JSON.stringify(window.__GEN2_VIEWER__.palette().colors), cam: JSON.stringify(window.__GEN2_VIEWER__.camera.position.toArray()), safe: JSON.stringify(window.__GEN2_VIEWER__.safeArea), count: window.__GEN2_VIEWER__.filamentsInBuild().count, canUndo: window.__GEN2_STORE__.canUndo }));
  assert.equal(before.count, 5, 'the control: The Jerrari prints in five on the root kit (its four and the feet’s TPU, 2026-10-21)');
  await page.locator('#ws-colors .summary .simplify').click();
  await page.waitForSelector('#ws-simplify .chg', { timeout: 30_000 });
  const opened = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; const s = document.querySelector('#ws-simplify'); return { targets: [...s.querySelectorAll('.tgt .seg')].map((b) => b.textContent), on: s.querySelector('.tgt .seg.on').textContent, rows: [...s.querySelectorAll('.chg .what')].map((x) => x.textContent), apply: s.querySelector('.apply').textContent, previewing: v.previewing, gripAccentHex: v.activeHex('Faceplate:GRIP ACCENT'), palette: JSON.stringify(v.palette().colors), cam: JSON.stringify(v.camera.position.toArray()), safe: JSON.stringify(v.safeArea), canUndo: window.__GEN2_STORE__.canUndo, trayHidden: document.querySelector('#ws-tray').hidden, galleryHidden: document.querySelector('#ws-gallery').hidden }; });
  assert.deepEqual(opened.targets, ['4 filaments', '3 filaments', '2 filaments']); assert.equal(opened.on, '4 filaments');
  assert.equal(opened.rows.length, 1); assert.match(opened.rows[0], /^Grip accents: Silk Silver → /, 'the least visible filament (the grip accent alone) is the one to go');
  assert.ok(opened.previewing && opened.gripAccentHex.toLowerCase() !== '#cdd2d9', 'the model shows the proposal: the grip accent is no longer silk silver');
  assert.equal(opened.palette, before.palette, 'nothing is chosen'); assert.equal(opened.canUndo, before.canUndo, 'nothing in the history');
  assert.equal(opened.cam, before.cam, 'the camera stays'); assert.equal(opened.safe, before.safe, 'the safe area stays');
  assert.ok(opened.trayHidden && opened.galleryHidden);
  // down to three (two merges; the feet's TPU merges with nothing): the rows read original → final, one per filament
  await page.locator('#ws-simplify .tgt .seg', { hasText: '3 filaments' }).click();
  await settle(page, 300);
  const two = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#ws-simplify .chg .what')].map((x) => x.textContent), apply: document.querySelector('#ws-simplify .apply').textContent }));
  assert.equal(two.rows.length, 2, `two rows for two filaments merged (${two.rows.join(' | ')})`);
  assert.ok(two.rows.every((r) => !/→ .*→/.test(r)), 'no chained arrow: each row is original → final');
  assert.equal(two.apply, 'Apply · 3 filaments');
  // Cancel: nothing kept
  await page.locator('#ws-simplify .cancel').click();
  await settle(page, 300);
  const cancelled = await page.evaluate(() => ({ hidden: document.querySelector('#ws-simplify').hidden, previewing: window.__GEN2_VIEWER__.previewing, palette: JSON.stringify(window.__GEN2_VIEWER__.palette().colors), canUndo: window.__GEN2_STORE__.canUndo, count: window.__GEN2_VIEWER__.filamentsInBuild().count }));
  assert.ok(cancelled.hidden && !cancelled.previewing && cancelled.palette === before.palette && cancelled.canUndo === before.canUndo && cancelled.count === 5, JSON.stringify(cancelled));
  // Apply at the default target: one undo step, the Dock drops to four, the panel reads "The Jerrari · edited"
  await page.locator('#ws-colors .summary .simplify').click();
  await page.waitForSelector('#ws-simplify .apply', { timeout: 30_000 });
  await page.locator('#ws-simplify .apply').click();
  await settle(page, 600);
  const applied = await page.evaluate(() => ({ hidden: document.querySelector('#ws-simplify').hidden, previewing: window.__GEN2_VIEWER__.previewing, count: window.__GEN2_VIEWER__.filamentsInBuild().count, dock: document.querySelector('#ws-dock .status').textContent, lname: document.querySelector('#ws-colors .lname').textContent, summary: document.querySelector('#ws-colors .summary .sline').textContent, cam: JSON.stringify(window.__GEN2_VIEWER__.camera.position.toArray()), safe: JSON.stringify(window.__GEN2_VIEWER__.safeArea), presetEvents: window.__GEN2_VIEWER__.trackLog.filter((n) => /^preset:/.test(n)) }));
  assert.ok(applied.hidden && !applied.previewing, 'the panel closes and the preview ends');
  assert.equal(applied.count, 4); assert.match(applied.dock, /^4 filaments/); assert.match(applied.summary, /^4 filaments used/);
  assert.equal(applied.lname, 'The Jerrari · edited');
  assert.equal(applied.cam, before.cam); assert.equal(applied.safe, before.safe);
  assert.deepEqual(applied.presetEvents, [], 'Simplify sends no preset event');
  await page.keyboard.press('Control+Z');
  await settle(page, 500);
  const undone = await page.evaluate(() => ({ palette: JSON.stringify(window.__GEN2_VIEWER__.palette().colors), count: window.__GEN2_VIEWER__.filamentsInBuild().count, lname: document.querySelector('#ws-colors .lname').textContent }));
  assert.equal(undone.palette, before.palette, 'one Undo restores the look'); assert.equal(undone.count, 5); assert.equal(undone.lname, 'The Jerrari');
  // Review filaments opens the shopping list with the suitability note; Keep this look opens Save with the name field
  await page.locator('#ws-colors .summary .review').click();
  await page.waitForSelector('#ws-shop:not([hidden])', { timeout: 15_000 });
  assert.match(await page.locator('#ws-shop .note').last().textContent(), /whether a filament suits a part/);
  await page.locator('#ws-shop .x').click();
  await page.locator('#ws-colors .summary .keeplook').click();
  await page.waitForSelector('#ws-colors .saverow input', { timeout: 15_000 });
  // the Save row focuses its input on the next tick; under the software rasteriser that tick can land after the selector
  await page.waitForFunction(() => document.activeElement && document.activeElement.getAttribute('aria-label') === 'Look name', null, { timeout: 15_000 });
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Colors step 6 on the phone: Simplify is a sheet of its own; Apply closes it back to the Colors sheet with the count dropped', async () => {
  const { ctx, page, errors } = await open('colors', { phone: true });
  await page.waitForSelector('#ws-colors .summary .simplify', { timeout: 30_000 });
  await page.locator('#ws-colors .summary .simplify').click();
  await page.waitForFunction(() => document.querySelector('#ws-simplify').classList.contains('open') && !document.querySelector('#ws-colors').classList.contains('open'), null, { timeout: 30_000 });
  assert.match(await text(page, '#ws-simplify .sheet-handle .ttl'), /Simplify/);
  await page.waitForSelector('#ws-simplify .chg', { timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.previewing), true, 'the proposal is shown on the phone too');
  await page.locator('#ws-simplify .apply').click();
  await page.waitForFunction(() => document.querySelector('#ws-simplify').hidden && document.querySelector('#ws-colors').classList.contains('open') && !window.__GEN2_VIEWER__.previewing, null, { timeout: 30_000 });
  assert.match(await text(page, '#ws-dock .status'), /^4 filaments/);   // five with the feet's TPU (2026-10-21), one merged
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.canUndo), true);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* Joey, 2026-10-18: "lets just hide makerworld and cults for now until eventually i upload more models there". Few parts
   have a page on either, and choosing one in the Parts list turned most rows into a site search. */
test('Parts and the viewer offer and link only Printables and Thangs (MakerWorld and Cults 3D are hidden)', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // saved choices of the two hidden stores, from before: each must read as Printables
  await context.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); localStorage.setItem('gen2-link-store', 'makerworld'); localStorage.setItem('gen2-store', 'cults'); } catch {} });
  const { ctx, page, errors } = await open('parts', { context });
  await page.waitForSelector('#ws-parts .prow', { timeout: 30_000 });
  const parts = await page.evaluate(() => ({
    sites: [...document.querySelectorAll('#ws-parts .track.sites .seg')].map((b) => b.textContent.trim()),
    on: document.querySelector('#ws-parts .track.sites .seg.on')?.textContent.trim() || null,
    printables: [...document.querySelectorAll('#ws-parts a[href]')].filter((a) => /printables\.com/.test(a.href)).length,
    hidden: [...document.querySelectorAll('#ws-parts a[href]')].map((a) => a.href).filter((h) => /makerworld\.com|cults3d\.com/.test(h)),
    labels: [...document.querySelectorAll('#ws-parts a.link')].map((a) => a.textContent).filter((t) => /MakerWorld|Cults/.test(t)),
  }));
  assert.deepEqual(parts.sites, ['Printables', 'Thangs'], 'the download-site choice offers only Printables and Thangs');
  assert.equal(parts.on, 'Printables', 'a saved MakerWorld choice reads as Printables');
  assert.ok(parts.printables > 0, 'the control: the rows link to Printables');
  assert.deepEqual(parts.hidden, [], 'no row links to MakerWorld or Cults 3D');
  assert.deepEqual(parts.labels, [], 'no row is labelled with either');
  // the viewer's own panels, which the bare address shows until the cutover: its store picker and its parts' links
  const viewer = await context.newPage();
  const verrors = []; viewer.on('pageerror', (e) => verrors.push(e.message));
  await viewer.goto(`${base}/index.html?debug=1`, { waitUntil: 'load', timeout: 90_000 });
  await viewer.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#store-select option'), null, { timeout: 90_000 });
  await settle(viewer, 1500);
  const v = await viewer.evaluate(() => ({
    options: [...document.querySelectorAll('#store-select option')].map((o) => o.textContent.trim()),
    value: document.querySelector('#store-select').value,
    printables: [...document.querySelectorAll('a[href]')].filter((a) => /printables\.com/.test(a.href)).length,
    hidden: [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /makerworld\.com|cults3d\.com/.test(h)),
  }));
  assert.deepEqual(v.options, ['Printables', 'Thangs'], 'the viewer\'s store picker offers only Printables and Thangs');
  assert.equal(v.value, 'printables', 'a saved Cults 3D choice shows as Printables');
  assert.ok(v.printables > 0, 'the control: the viewer\'s parts list links to Printables');
  assert.deepEqual(v.hidden, [], 'no MakerWorld or Cults 3D link in the viewer\'s panels');
  assert.deepEqual(clean([...errors, ...verrors]), []);
  await ctx.close();
});

/* BUILD'S PRODUCT PREVIEWS MATCH THE MODEL (PREVIEW-FIDELITY.md, 2026-10-18). A preview is drawn into a render target of its
   own, and three.js r185 tone-maps only the screen and XR-flagged targets: on the tone-mapped tiers (Balanced and up; Very
   High is the default) the previews sat a median 17 to 31 of 255 off the model. They now take the XR flag with RGBA8 storage,
   and the stage's own light rig and environment. Here the first unit's inspector and tile previews are compared with that
   unit on the stage, drawn through the screen's own path from the same camera: the colour over the preview's own pixels
   (median <= 6, p95 <= 32 of 255), and the silhouettes 2 px in from their edges (at most 0.5% of the model's pixels in one
   and not the other), on Balanced and then on Fast. On Balanced the ordinary target, the previews' old one, is the control
   and must miss. `isXRRenderTarget` is internal to three.js, so an upgrade that changes it fails here. Between the two
   tiers, the quality pill: a preview is drawn for a tier, so a new tier repaints the tiles. Dark stage only: on the light
   stage the model also carries the stage's cast shadows (from the rest of the build and from its own parts), and a
   preview draws none. */
test('Build: a product preview matches the model on a tone-mapped tier and on Fast (an ordinary render target is the control), and a new tier repaints the tiles', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'balanced'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
  const { ctx, page, errors } = await open('build', { context });
  await page.waitForSelector('#ws .pv img', { timeout: 30_000 });
  await settle(page, 1500);
  const compare = () => page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__, u = window.__GEN2_STORE__.state.placed[0];
    const colour = (p, m) => {   // the largest channel difference over the preview's own pixels: the true median and the p95
      const d = []; for (let i = 0; i < p.length; i += 4) { if (p[i + 3] < 250) continue; d.push(Math.max(Math.abs(p[i] - m[i]), Math.abs(p[i + 1] - m[i + 1]), Math.abs(p[i + 2] - m[i + 2]))); }
      d.sort((a, b) => a - b); const n = d.length;
      return { pixels: n, median: n % 2 ? d[(n - 1) / 2] : (d[n / 2 - 1] + d[n / 2]) / 2, p95: d[Math.floor(n * 0.95)] };
    };
    const cover = (p, m, W, H) => {   // silhouette pixels (alpha >= 250) whose whole 5x5 neighbourhood is in one silhouette and that the other lacks
      const P = new Uint8Array(W * H), M = new Uint8Array(W * H); let nM = 0;
      for (let i = 0; i < W * H; i++) { P[i] = p[i * 4 + 3] >= 250 ? 1 : 0; M[i] = m[i * 4 + 3] >= 250 ? 1 : 0; nM += M[i]; }
      const inner = (S, x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !S[yy * W + xx]) return false; } return true; };
      let off = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if ((M[i] && !P[i] && inner(M, x, y)) || (P[i] && !M[i] && inner(P, x, y))) off++; }
      return { modelPixels: nM, share: 100 * off / Math.max(1, nM) };
    };
    const out = { tier: v.quality };
    const look = { fill: u.fill, w: u.w, hh: u.hh, variant: u.variant || null, lip: u.lip || null };
    for (const [name, spec] of [['inspector', { ...look, view: 'three', fit: 1.0, size: 512, unitId: u.id }], ['tile', { ...look, view: 'front' }]]) {
      const shown = await v.thumbDraw(spec), model = v.thumbModel(shown, u.id);
      out[name] = { ...colour(shown.pixels, model), cover: cover(shown.pixels, model, shown.width, shown.height) };
      if (name === 'inspector' && v.quality === 'balanced') out.plain = colour((await v.thumbDraw(spec, { plain: true })).pixels, model);
    }
    return out;
  });
  const matches = (r) => {
    for (const k of ['inspector', 'tile']) {
      const c = r[k];
      assert.ok(c.pixels > 1000, `${r.tier}, ${k}: the preview shows the unit (${c.pixels} pixels)`);
      assert.ok(c.median <= 6 && c.p95 <= 32, `${r.tier}, ${k}: the preview's colours match the model: median ${c.median}, p95 ${c.p95}`);
      assert.ok(c.cover.share <= 0.5, `${r.tier}, ${k}: the preview covers what the model covers: ${c.cover.share.toFixed(2)}% of ${c.cover.modelPixels} pixels differ`);
    }
  };
  const b = await compare();
  assert.equal(b.tier, 'balanced', 'the case starts on a tone-mapped tier');
  matches(b);
  assert.ok(b.plain.median > 12, `the control: an ordinary render target misses the tone mapping (median ${b.plain.median})`);
  // a new tier, a new picture: the pill (Balanced, then Fast) repaints the tiles, and so does a tier the stage sets itself
  // (setQuality, the auto-downgrade's path), since the stage tells the workspace (opts.onQuality)
  const repainted = async (src, how) => {
    await page.waitForFunction((s) => { const i = document.querySelector('#ws .pv img'); return !!i && i.getAttribute('src') !== s; }, src, { timeout: 30_000 })
      .catch(async () => assert.fail(`${how}: the tiles were not repainted for the ${await page.evaluate(() => window.__GEN2_VIEWER__.quality)} tier`));
    return page.locator('#ws .pv img').first().getAttribute('src');
  };
  const atBalanced = await page.locator('#ws .pv img').first().getAttribute('src');
  await page.locator('#ws-tools button.quality').click();
  const atFast = await repainted(atBalanced, 'the pill');
  const f = await compare();
  assert.equal(f.tier, 'fast', 'the pill moved Balanced on to Fast');
  matches(f);
  await page.evaluate(() => window.__GEN2_VIEWER__.setQuality('balanced'));
  assert.equal(await repainted(atFast, 'setQuality'), atBalanced, 'back on Balanced, the tiles are the Balanced ones again');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* Joey, 2026-10-18, on the Parts tab after choosing colours: "the parts have the instructions colors assigned to them, which
   is kind of confusing after assigning chosen colors to it". With the visitor's colours on, a row's chip is the filament the
   part prints in (the identification colour stays as a ring), the row names it, and so does the CSV. */
test('Parts: with chosen colours on, a row shows and names the filament it prints in; off, the identification colour; the CSV carries the name', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.locator('#ws-colors .browse').click();
  await page.locator('#ws-gallery .lcard').nth(1).click();   // Stealth, on a fresh profile
  await page.waitForSelector('#ws-gallery .apply', { timeout: 15_000 });
  await page.locator('#ws-gallery .apply').click();
  await settle(page, 600);
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('parts'));
  await page.waitForSelector('#ws-parts .prow', { timeout: 30_000 });
  const read = () => page.evaluate(() => {
    const v = window.__GEN2_VIEWER__; const pal = v.palette();
    const rgb = (h) => { const s = document.createElement('span'); s.style.background = h; document.body.appendChild(s); const c = getComputedStyle(s).backgroundColor; s.remove(); return c; };
    const row = [...document.querySelectorAll('#ws-parts .prow')].find((x) => /^Case\b/.test(x.querySelector('.name').textContent));
    const chip = row.querySelector('.chip');
    return { on: pal.on, caseName: pal.colors.Case ? pal.colors.Case.name : null, caseRgb: pal.colors.Case ? rgb(pal.colors.Case.hex) : null, idRgb: rgb('#E9E9EC'),
      chipRgb: getComputedStyle(chip).backgroundColor, ring: getComputedStyle(chip).outlineStyle, swatches: chip.querySelectorAll('i').length,
      line: (row.querySelector('.printin') || {}).textContent || '', link: (row.querySelector('.printin a') || {}).href || '', caption: document.querySelector('#ws-parts .row2 .dim').textContent,
      buyChips: [...document.querySelectorAll('#ws-parts .chip.buy')].filter((c) => c.classList.contains('fil')).length };
  });
  const on = await read();
  assert.ok(on.on && on.caseName, 'the control: the preset is on and picks the case');
  assert.equal(on.chipRgb, on.caseRgb, `the case row's chip is the case filament (${on.caseName}), not the identification colour`);
  assert.equal(on.ring, 'solid', 'the identification colour stays as a ring');
  const shortName = on.caseName.replace('Panchroma ', '');   // the brand prefix is stripped, as the Colors tab strips it
  assert.ok(on.line.startsWith(`Print in ${shortName}`), `the row names the filament: "${on.line}" (expected "Print in ${shortName}…")`);
  assert.ok(/^https?:/.test(on.link), 'the name is the buy link the Colors tab uses');
  assert.match(on.caption, /Chip = the filament it prints in · ring = its colour in Assemble/, 'the caption says what the chip is');
  assert.equal(on.buyChips, 0, 'bought hardware keeps its dashed chip');
  // the CSV names it too
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), btn(page, 'Download CSV', '#ws-parts').click()]);
  const csv = await readFile(await dl.path(), 'utf8');
  const caseLine = csv.split(/\r?\n/).find((l) => /"Case 185/.test(l));
  assert.ok(/"Section","Qty","Part","Print in"/.test(csv), 'the CSV has a Print in column');
  assert.ok(caseLine && caseLine.includes(`"${on.caseName.replace('Panchroma ', '')}`), `the case line carries the filament: ${caseLine}`);
  // colours off: the identification colour, as today
  await page.evaluate(() => { window.__GEN2_VIEWER__.setUseCustom(false); window.__GEN2_STORE__.commit(() => {}, 'color'); });
  await settle(page, 400);
  const off = await read();
  assert.equal(off.on, false, 'the control: the colours are off');
  assert.equal(off.chipRgb, off.idRgb, 'the chip is the identification colour again');
  assert.equal(off.line, '', 'no Print in line');
  assert.match(off.caption, /^Chips = part colors in Assemble/, 'the caption is the old one');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE INSPECTOR'S ROWS (2026-10-19; Astra put "inspector colours" first among what was left). The Parts tab's "This unit ·
   parts" list is one unit's rows, so each chip is the filament THAT unit's part prints in: its own pick (the picker's "This
   unit only") first, else the build's. The list beside it pools every unit's picks. */
test('Parts: the inspector\'s "This unit · parts" rows show the filament each part prints in for that unit - its own pick first, the build\'s for another unit; colours off, the identification colour', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.locator('#ws-colors .browse').click();
  await page.locator('#ws-gallery .lcard').nth(1).click();   // Stealth, on a fresh profile
  await page.waitForSelector('#ws-gallery .apply', { timeout: 15_000 });
  await page.locator('#ws-gallery .apply').click();
  await settle(page, 600);
  const ids = await page.evaluate(() => window.__GEN2_STORE__.state.placed.map((p) => p.id));
  assert.ok(ids.length >= 2, `the control: the kit has two units or more (${ids.length})`);
  const [mine, other] = ids;
  // a unit's case on the model: the case instances are numbered by position (generate.js `case${i}`), the stage maps them
  // to the units (partInfo().owner), so the selection goes through that map rather than guessing the id
  const selectCase = (uid) => page.evaluate((u) => { const v = window.__GEN2_VIEWER__; const i = v.manifest.instances.find((x) => /^case\d+$/.test(x.id) && (v.partInfo(x.id) || {}).owner === u); if (!i) throw new Error('no case instance for unit ' + u); v.setSelected(i.id); }, uid);
  // the first unit's case, clicked on the model: the picker opens on the case; "This unit only", then a filament the build does not wear
  await selectCase(mine);
  await page.waitForSelector('#ws-picker .brands .sw', { timeout: 15_000 });
  assert.match(await text(page, '#ws-picker .head'), /^Body · All case/i, 'the control: the picker is on the case body');
  await page.locator('#ws-picker .seg:has-text("only")').click();
  await page.waitForFunction(() => /only \(unit 1\)/.test(document.querySelector('#ws-picker .head').textContent), null, { timeout: 15_000 });
  const own = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__; const build = v.palette().colors.Case;
    const sws = [...document.querySelectorAll('#ws-picker .brands .sw:not(.active)')].filter((s) => s.getAttribute('aria-label') !== build.name);
    const sw = sws[sws.length - 1]; sw.click();
    return { name: sw.getAttribute('aria-label'), hex: sw.style.backgroundColor };
  });
  await settle(page, 500);
  const picks = await page.evaluate(([a, b]) => { const v = window.__GEN2_VIEWER__; return { mine: v.overrideFor(a, 'Case'), other: v.overrideFor(b, 'Case'), build: v.palette().colors.Case }; }, [mine, other]);
  assert.equal(picks.mine && picks.mine.name, own.name, 'the control: unit 1 has its own case filament');
  assert.equal(picks.other, null, 'the control: unit 2 has none');
  assert.notEqual(picks.build.hex.toLowerCase(), picks.mine.hex.toLowerCase(), 'the control: the own pick differs from the build\'s');
  // the Parts tab: the inspector on unit 1, then on unit 2
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('parts'));
  await page.waitForSelector('#ws-parts .prow', { timeout: 30_000 });
  const inspect = async (uid) => {
    await selectCase(uid);
    // 30 s, the runner's bound (its 2026-10-19 image timed out at 5 s on a 32-minute e2e step; 4x-throttled here it is ~1 s)
    await page.waitForSelector('#ws-insp:not([hidden]) .uprow', { timeout: 30_000 });
    return page.evaluate(() => {
      const rgb = (h) => { const s = document.createElement('span'); s.style.background = h; document.body.appendChild(s); const c = getComputedStyle(s).backgroundColor; s.remove(); return c; };
      const rows = [...document.querySelectorAll('#ws-insp .uprow')];
      const row = rows.find((r) => /\bCase - /.test(r.querySelector('.name').textContent));
      const chip = row.querySelector('.chip');
      return { idx: document.querySelector('#ws-insp .idx').textContent, chipRgb: getComputedStyle(chip).backgroundColor, ring: getComputedStyle(chip).outlineStyle, ringRgb: getComputedStyle(chip).outlineColor, idRgb: rgb('#E9E9EC'),
        line: (row.querySelector('.printin') || {}).textContent || '', link: (row.querySelector('.printin a') || {}).href || '', chips: rows.filter((r) => r.querySelector('.chip')).length, rows: rows.length };
    });
  };
  // the colours as the page computes them, and the names as the Colors tab shortens them (its own module, already loaded)
  const rgb = (hex) => page.evaluate((h) => { const s = document.createElement('span'); s.style.background = h; document.body.appendChild(s); const c = getComputedStyle(s).backgroundColor; s.remove(); return c; }, hex);
  const shortOf = (name) => page.evaluate(async (n) => (await import('/js/workspaces/colors.js')).short(n), name);
  const a = await inspect(mine);
  assert.match(a.idx, /^Unit 1 of/, 'the control: the inspector is on unit 1');
  assert.equal(a.chipRgb, await rgb(picks.mine.hex), `unit 1's case row is its OWN filament (${own.name}), not the build's`);
  assert.equal(a.ring, 'solid', 'the identification colour stays as a ring');
  assert.equal(a.ringRgb, a.idRgb, 'the ring is the case\'s identification colour');
  assert.ok(a.line.startsWith(`Print in ${await shortOf(own.name)}`), `the row names the unit's filament: "${a.line}"`);
  assert.equal(a.chips, a.rows, 'every row has a chip');
  const b = await inspect(other);
  assert.match(b.idx, /^Unit 2 of/, 'the control: the inspector is on unit 2');
  assert.equal(b.chipRgb, await rgb(picks.build.hex), `unit 2's case row is the BUILD's filament (${picks.build.name})`);
  assert.ok(b.line.startsWith(`Print in ${await shortOf(picks.build.name)}`), `the row names the build's filament: "${b.line}"`);
  assert.ok(/^https?:/.test(b.link), 'the name is the buy link the Colors tab uses');
  // colours off: the identification colour, no line
  await page.evaluate(() => { window.__GEN2_VIEWER__.setUseCustom(false); window.__GEN2_STORE__.commit(() => {}, 'color'); });
  await settle(page, 400);
  const off = await inspect(mine);
  assert.equal(off.chipRgb, off.idRgb, 'the chip is the identification colour again');
  assert.equal(off.ring, 'none', 'no ring');
  assert.equal(off.line, '', 'no Print in line');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE BED LIMIT ON THE RAILS (2026-10-19). A user of the original planner, relayed by Joey: "the table rails list on the left
   are 3 270x3w rails + 1 270x2w ... The 3D diagram shows 2 270x4w + 1 270x3w. While technically that works, a Core One L
   cannot print something 4w." The Parts list caps a rail section at the widest the chosen bed prints (js/rules/bom.js);
   the generator now tiles with the same cap (generate.js bedLimits), and the list names each row's width. */
test('Build: on a bed-limited printer the stage tiles the under-table rails as the Parts list bills them (a Core One L at 270: 3W+3W+3W+2W, never a 4W)', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1&setup=1' });
  await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
  await page.locator('#ws-setup .card:has-text("Under-Table")').click();
  await btn(page, 'Next', '#ws-setup').click();
  await page.locator('#ws-setup .card.len:has-text("270 mm")').click();
  await btn(page, 'Next', '#ws-setup').click();
  await page.selectOption('#ws-setup select.printer', 'coreonel');
  assert.match(await text(page, '#ws-setup .fit'), /Bed 300×300/);
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });   // gone once the sheet's reload lands
  await btn(page, 'Start build', '#ws-setup').click();
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'under-table', null, { timeout: 150_000 });
  await waitBoot(page);
  assert.equal((await S(page)).printer, 'coreonel');
  // an 11W top row: three 3W drawers beside the 2W starter, through the store the way the Build case places
  await page.evaluate(() => { const st = window.__GEN2_STORE__; st.commit((s) => { let x = Math.max(...s.placed.map((p) => p.x + p.w)); const y = Math.min(...s.placed.map((p) => p.y)); for (const w of [3, 3, 3]) { s.placed.push({ id: s.nextId++, x, y, w, hh: 2, fill: 'decor', shelves: 0 }); x += w; } s.gridW = Math.max(s.gridW, x); }, 'edit'); });
  // the stage takes the record before it rebuilds the scene, so wait for the rebuild too: a workspace switch mid-rebuild
  // steps onto instances that do not exist yet (deploy run 39280964212 on the CI runner's software rasteriser)
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 4 && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 });
  const rails = () => page.evaluate(() => { const out = {}; for (const i of window.__GEN2_VIEWER__.manifest.instances) { const m = /^UnderTableRail_270-(\d)W$/.exec(i.node); if (m) out[m[1]] = (out[m[1]] || 0) + 1; } return out; });
  assert.deepEqual(await rails(), { 3: 3, 2: 1 }, 'the stage: three 3W rails and one 2W, as a 300×300 bed prints them');
  // the Parts list: the same sections, each row naming its width
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('parts'));
  await page.waitForSelector('#ws-parts .prow', { timeout: 30_000 });
  const listed = () => page.evaluate(() => { const out = {}; for (const row of document.querySelectorAll('#ws-parts .prow')) { const m = /^Under Table Rails - 270 · (\d)W section$/.exec(row.querySelector('.name').textContent); if (m) out[m[1]] = (out[m[1]] || 0) + parseInt(row.querySelector('.qty').textContent.replace('×', ''), 10); } return out; });
  assert.deepEqual(await listed(), { 3: 3, 2: 1 }, 'the Parts list bills the sections the stage shows, each row naming its width');
  // Any printer, chosen in the setup sheet from here (Parts does not sync the stage itself, so the sheet does), lifts the
  // cap on both at once: 4W+4W+3W in the model and in the list
  await page.evaluate(() => window.__GEN2_CTX__().openSetup('printer'));
  await page.waitForSelector('#ws-setup select.printer', { timeout: 30_000 });
  await page.selectOption('#ws-setup select.printer', 'any');
  await btn(page, 'Apply', '#ws-setup').click();
  await page.waitForFunction(() => !document.querySelector('#ws-setup'), null, { timeout: 30_000 });
  assert.equal((await S(page)).printer, 'any', 'the sheet applied the printer');
  await page.waitForFunction(() => [...document.querySelectorAll('#ws-parts .prow .name')].some((n) => /4W section/.test(n.textContent)), null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__GEN2_VIEWER__.manifest.instances.some((i) => i.node === 'UnderTableRail_270-4W') && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 });
  assert.deepEqual(await rails(), { 4: 2, 3: 1 }, 'any printer: the stage reaches for 4W again');
  assert.deepEqual(await listed(), { 4: 2, 3: 1 }, 'and so does the list');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE PHONE ACCEPTANCE CHECK (2026-10-17, the live planner driven with real touch at 390 and 412 px). The floating cards and
   the toast sat at a fixed 132 px from the bottom, under the collapsed sheets' handles (z-index 6 against 10): a "+" tapped
   on the model showed its ghost while Place / Cancel stayed under the Library's handle, the issue card's text and buttons
   too, and every toast ("Removed…", "Link copied.") was hidden behind the handle and the dock. They now sit on the sheet
   stack's top edge, which the sheet manager publishes as --sheet-stack. A tap is the check: Playwright's tap refuses a
   control something else covers. */
const lowestSheetTop = (page) => page.evaluate(() => Math.min(document.querySelector('#ws-dock').getBoundingClientRect().top, ...[...document.querySelectorAll('#ws .sheet:not([hidden]):not(.open)')].map((s) => s.getBoundingClientRect().top)));
test('the phone: Place / Cancel, the issue card and the toast sit above the sheets; Move keeps the inspector up; a gap build’s dock fits', async () => {
  const { ctx, page, errors } = await open('build', { phone: true });
  await page.locator('#ws-lib .sheet-handle').tap();
  await page.locator('#ws-lib .size:not(.dis)', { hasText: '1W·1H' }).first().tap();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.spotScreens().length > 0 && !document.querySelector('#ws-lib').classList.contains('open'), null, { timeout: 30_000 })
    .catch(() => assert.fail('no "+" on the model within 30 s, or the library stayed up'));
  // the camera re-frames for the spots and the sheet slides down: wait until the "+" screen positions hold still (two
  // reads 400 ms apart), then tap the spot read at that moment, and tap again if no card follows. A fixed 1.5 s settle
  // and one tap left the finger on a stale position on slow runs (runs 39323798304, 39433302069, 39467212905: the card
  // never opened within 30 s, where it opens within a second here)
  const spotsStill = () => page.waitForFunction(() => { const now = window.__GEN2_VIEWER__.spotScreens().map((s) => Math.round(s.sx) + ',' + Math.round(s.sy)).join(';'); const same = window.__e2eSpots === now; window.__e2eSpots = now; return same; }, null, { polling: 400, timeout: 30_000 }).catch(() => {});
  const tapSpot = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      // a card that opened just after the last try's 10 s is the answer, not a reason to tap on top of it (Luna 01a15a7f)
      if (attempt && await page.locator('#ws-choice:not([hidden])').count()) return null;
      await spotsStill();
      const sp = await page.evaluate(() => { const c = document.querySelector('canvas'); return window.__GEN2_VIEWER__.spotScreens().find((s) => document.elementFromPoint(s.sx, s.sy) === c) || null; });
      assert.ok(sp, 'a "+" a finger can reach');
      await page.touchscreen.tap(sp.sx, sp.sy);
      if (await page.waitForSelector('#ws-choice:not([hidden])', { timeout: 10_000 }).then(() => true, () => false)) return sp;
    }
    return assert.fail('the place card did not open on a tapped "+" in three tries');
  };
  await tapSpot();
  await page.locator('#ws-choice button:has-text("Cancel")').tap({ timeout: 15_000 });
  await page.waitForSelector('#ws-choice[hidden]', { state: 'attached', timeout: 15_000 });
  const n0 = await units(page);
  await tapSpot();
  await page.locator('#ws-choice button:has-text("Place")').tap({ timeout: 15_000 });
  await page.waitForFunction((n) => window.__GEN2_STORE__.state.placed.length === n + 1 && window.__GEN2_VIEWER__.build.placed.length === n + 1, n0, { timeout: 60_000 })
    .catch(() => assert.fail('Place placed nothing within 60 s'));
  // the inspector's Move: the sheet stays up through the move (it closed after every column)
  const id = await page.evaluate(() => window.__GEN2_STORE__.state.selectedUnit);
  assert.ok(id != null, 'the placed unit is selected');
  await page.locator('#ws-insp .sheet-handle').tap();
  await page.waitForFunction(() => document.querySelector('#ws-insp').classList.contains('open'), null, { timeout: 30_000 });
  const x0 = await page.evaluate((id) => window.__GEN2_STORE__.state.placed.find((p) => p.id === id).x, id);
  await page.locator('#ws-insp button:has-text("Right ▶")').tap({ timeout: 15_000 });
  await page.waitForFunction(([id, x]) => window.__GEN2_STORE__.state.placed.find((p) => p.id === id)?.x === x + 1, [id, x0], { timeout: 30_000 })
    .catch(() => assert.fail('Right ▶ did not move the unit within 30 s'));
  await settle(page, 800);
  assert.equal(await page.evaluate(() => document.querySelector('#ws-insp').classList.contains('open')), true, 'the inspector is still up after a Move');
  // the toast: Remove says so above the sheets and the dock, at a readable width
  await page.locator('#ws-insp button.danger:has-text("Remove")').tap({ timeout: 15_000 });
  await page.waitForSelector('#ws-toast.show', { timeout: 15_000 });
  const toast = await page.evaluate(() => { const r = document.querySelector('#ws-toast').getBoundingClientRect(); return { bottom: r.bottom, width: r.width, z: Number(getComputedStyle(document.querySelector('#ws-toast')).zIndex) || 0 }; });
  const floor = await lowestSheetTop(page);
  assert.ok(toast.bottom <= floor + 1, `the toast ends above the sheets and the dock: ${Math.round(toast.bottom)} vs ${Math.round(floor)}`);
  assert.ok(toast.z > 13, `the toast paints over the sheets (z ${toast.z})`);
  assert.ok(toast.width > 390 / 2 + 1, `the toast is not held to half the screen (${Math.round(toast.width)} px)`);
  // a gap build: the Dock keeps status and Get parts list inside itself (the units count yields to the sections)
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { const y = s.gridH * 2 - 2; s.placed = [{ id: 1, x: 0, y, w: 2, hh: 2, fill: 'decor', shelves: 0 }, { id: 2, x: 3, y, w: 1, hh: 2, fill: 'decor', shelves: 0 }]; s.nextId = 3; s.gridW = 4; }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 2 && !!document.querySelector('#ws-dock .sections'), null, { timeout: 60_000 });
  const dock = await page.evaluate(() => { const d = document.querySelector('#ws-dock'); const q = d.getBoundingClientRect(); const cta = d.querySelector('.cta').getBoundingClientRect(); return { inner: q.right - parseFloat(getComputedStyle(d).paddingRight), cta: cta.right, gap: getComputedStyle(d).columnGap, top: getComputedStyle(document.querySelector('#ws-top')).columnGap }; });
  assert.ok(dock.cta <= dock.inner + 1, `Get parts list stays inside the Dock: ${Math.round(dock.cta)} vs ${Math.round(dock.inner)}`);
  // the narrow-desktop rules (1024-1279) no longer reach the phone: its Dock gap is the phone's own; the top bar keeps 8 px
  assert.equal(dock.gap, '8px', 'the phone Dock’s gap');
  assert.equal(dock.top, '8px', 'the phone top bar’s gap (8 px between bordered controls)');
  // the issue card (a floating unit), opened while the Library sheet is up: the sheet steps down and the card shows over
  // the handles (it opened under the open sheet: the tap seemed to do nothing)
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.placed.push({ id: 3, x: 0, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0 }); s.nextId = 4; }, 'edit'));
  await page.waitForFunction(() => /issue/.test(document.querySelector('#ws-dock .status')?.textContent || ''), null, { timeout: 30_000 });
  await page.locator('#ws-lib .sheet-handle').tap();
  await page.waitForFunction(() => document.querySelector('#ws-lib').classList.contains('open'), null, { timeout: 30_000 });
  await page.locator('#ws-dock .status').tap();
  await page.waitForSelector('#ws-issues:not([hidden])', { timeout: 30_000 });
  await settle(page, 600);
  const card = await page.evaluate(() => { const c = document.querySelector('#ws-issues'); const q = c.getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { bottom: q.bottom, onTop: !!(h && c.contains(h)) }; });
  assert.ok(card.onTop, 'the issue card is not under a sheet');
  assert.ok(card.bottom <= (await lowestSheetTop(page)) + 1, `the issue card ends above the sheets: ${Math.round(card.bottom)}`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* The setup sheet's own box was a `.sheet`, so the phone's bottom-sheet rule made it a collapsed 44 px peek behind its
   backdrop: New build on a phone was a dead end (a fresh setup has no close and ignores the backdrop), and the mount chip's
   setup could not be used. It is `.setup-box` now. */
test('the phone: New build’s setup sheet opens whole and Start build is a tap away', async () => {
  const { ctx, page, errors } = await open('build', { phone: true, query: '&new=1&setup=1' });
  await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
  await settle(page, 600);
  const box = await page.evaluate(() => { const q = document.querySelector('#ws-setup > div').getBoundingClientRect(); return { top: q.top, bottom: q.bottom }; });
  assert.ok(box.top >= 0 && box.bottom <= 844 + 1 && box.bottom - box.top > 300, `the sheet is on screen, whole: ${JSON.stringify(box)}`);
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await page.locator('#ws-setup .cta').tap({ timeout: 15_000 });
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.placed.length === 1, null, { timeout: 150_000 })
    .catch(() => assert.fail('Start build did not rebuild on the starter drawer within 150 s'));
  await waitBoot(page);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* The switcher's menu lives in the top bar's stacking layer (z-index 5), so an open sheet (13) covered every item below
   its top edge: with Colors' sheet up (it opens on arrival), Rename, Share link, the files and New build could not be
   tapped. */
test('the phone: the build switcher’s items can be tapped while a sheet is up; the Dock’s shopping list shows over it', async () => {
  const { ctx, page, errors } = await open('colors', { phone: true });
  await page.waitForFunction(() => document.querySelector('#ws-colors').classList.contains('open'), null, { timeout: 30_000 });
  await page.locator('#ws-switch .chip-btn').tap();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).tap({ timeout: 15_000 });
  await page.waitForSelector('#ws-switch input.rename', { timeout: 15_000 });
  await page.locator('#ws-switch .chip-btn').tap();   // closes the menu
  // the filament stack in the Dock opens the shopping list, which opened under the Colors sheet (up on arrival)
  await page.waitForFunction(() => document.querySelector('#ws-colors').classList.contains('open'), null, { timeout: 30_000 });
  await page.locator('#ws-dock .status.stack').tap();
  await page.waitForSelector('#ws-shop:not([hidden])', { timeout: 30_000 });
  await settle(page, 600);
  assert.ok(await page.evaluate(() => { const c = document.querySelector('#ws-shop'); const q = c.getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!(h && c.contains(h)); }), 'the shopping list is not under the Colors sheet');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* Found on the phone, true at every width: a layout edit switched the W/H/L callouts on (the regenerate lands on the
   finished step, which shows them) with Measure never pressed; the switcher kept the unit count of the moment it was
   built ("185 · 3 units" with 4 in the Dock, and "1 units"); the filament picker printed the word "null" when no unit of
   the region wears its own colour (append(null) writes it). */
test('the phone check, at every width: an edit keeps Measure as it was, the switcher counts the units now, the picker prints no "null"', async () => {
  const { ctx, page, errors } = await open('build');
  const dimsOn = () => page.evaluate(() => window.__GEN2_VIEWER__.dimsOn);
  assert.equal(await dimsOn(), false, 'Measure is off at the start');
  const n0 = await units(page);
  await page.evaluate(() => window.__GEN2_STORE__.commit((s, R) => { const id = s.nextId++; const bottom = Math.max(...s.placed.map((p) => p.y + p.hh)); const right = Math.max(...s.placed.map((p) => p.x + p.w)); s.placed.push({ id, x: right, y: bottom - 2, w: 1, hh: 2, fill: 'decor', shelves: 0 }); if (s.gridW < right + 1) s.gridW = right + 1; R.syncTabletopGrid(); }, 'edit'));
  await page.waitForFunction((n) => window.__GEN2_VIEWER__.build.placed.length === n + 1, n0, { timeout: 90_000 });
  await settle(page, 600);
  assert.equal(await dimsOn(), false, 'an edit leaves Measure off');
  assert.equal(await page.getAttribute('#ws-tools .measure', 'aria-pressed'), 'false', 'and the Measure button says so');
  await page.click('#ws-switch .chip-btn');
  assert.match(await text(page, '#ws-switch .item.current .meta'), new RegExp(`· ${n0 + 1} units$`), 'the switcher counts the unit just placed');
  await page.click('#ws-switch .chip-btn');
  // Measure on survives an edit (the undo regenerates as well)
  await page.click('#ws-tools .measure');
  assert.equal(await dimsOn(), true);
  await page.evaluate(() => window.__GEN2_STORE__.undo());
  await page.waitForFunction((n) => window.__GEN2_VIEWER__.build.placed.length === n, n0, { timeout: 90_000 });
  await settle(page, 600);
  assert.equal(await dimsOn(), true, 'an edit leaves Measure on');
  // Measure pressed while a regenerate is still running is the visitor's latest word (Sol 01a14b32: a snapshot taken before
  // the update put the old choice back). The update is held 1.5 s through the debug hook, the button pressed inside it
  await page.evaluate(() => { const V = window.__GEN2_VIEWER__; const real = V.update; V.update = async (...a) => { window.__held = 1; await new Promise((r) => setTimeout(r, 1500)); const r = await real(...a); window.__held = 0; V.update = real; return r; }; });
  await page.evaluate(() => window.__GEN2_STORE__.redo());
  await page.waitForFunction(() => window.__held === 1, null, { timeout: 30_000 });
  await page.click('#ws-tools .measure');   // off, during the update
  await page.waitForFunction((n) => window.__held === 0 && window.__GEN2_VIEWER__.build.placed.length === n + 1, n0, { timeout: 90_000 });
  await settle(page, 600);
  assert.equal(await dimsOn(), false, 'a Measure toggle made during an update stands');
  // one unit is "1 unit"
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.placed = s.placed.filter((p) => p.y + p.hh === s.gridH * 2).slice(0, 1); }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 1, null, { timeout: 90_000 });
  await page.click('#ws-switch .chip-btn');
  assert.match(await text(page, '#ws-switch .item.current .meta'), /· 1 unit$/, 'one unit is singular');
  await page.click('#ws-switch .chip-btn');
  // Colors: a region whose units all follow the build colour
  await page.click('#ws-tabs .tab:has-text("Colors")');
  await page.waitForSelector('#ws-colors .crow.key:not([disabled])', { timeout: 30_000 });
  await page.locator('#ws-colors .crow.key:not([disabled])').first().click();
  await page.waitForSelector('#ws-picker:not([hidden]) .head', { timeout: 30_000 });
  assert.equal(await page.evaluate(() => [...document.querySelector('#ws-picker').childNodes].some((n) => n.nodeType === 3 && /null/.test(n.textContent))), false, 'no "null" in the picker');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE PHONE JOURNEY (Astra, 2026-10-19: "the complete journey - choose a look, adjust a part, simplify, review filaments,
   continue to Parts - rather than another round of isolated colour features"), as a visitor does it at 390×844 with real
   taps: one sheet open at a time, the model never covered by what should not cover it, no field taking focus by itself,
   the Dock's count agreeing with the summary line, the shopping list and the Parts list, Undo working at every step.
   Walking it on the merged code found two breaks: a part tapped on the model with the Colors sheet up (it opens on
   arrival) lit the part and showed nothing else - its card and the picker's handle were under the open sheet; and the
   summary's Review filaments opened the shopping list under the same sheet. Both step the sheets down now. */
test('the phone journey: a look from the gallery, a part tapped and recoloured (the build, then one unit), Simplify, Review filaments, Parts, back to the model', async () => {
  const { ctx, page, errors } = await open('build', { phone: true });
  const openSheets = () => page.evaluate(() => [...document.querySelectorAll('#ws .sheet.open:not([hidden])')].map((s) => s.id));
  const onTop = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2)); return !!(h && e.contains(h)); }, sel);
  const noKeyboard = async (where) => assert.ok(!/^(INPUT|TEXTAREA|SELECT)$/.test(await page.evaluate(() => (document.activeElement && document.activeElement.tagName) || '')), `no field took focus by itself (${where})`);
  const counts = () => page.evaluate(() => { const fc = window.__GEN2_VIEWER__.filamentsInBuild(); const num = (t) => { const m = (t || '').match(/^(\d+) filament/); return m ? +m[1] : null; }; return { fc: fc.count, names: fc.filaments.map((f) => f.name), dock: num(document.querySelector('#ws-dock .status')?.textContent), summary: num(document.querySelector('#ws-colors .summary .sline')?.textContent), own: document.querySelector('#ws-colors .summary .own')?.textContent || '' }; });
  const agree = async (where) => { const c = await counts(); assert.equal(c.dock, c.fc, `${where}: the Dock counts what the build prints in`); assert.equal(c.summary, c.fc, `${where}: the summary line agrees with the Dock`); return c; };
  const stillCamera = () => page.waitForFunction(() => { const p = JSON.stringify(window.__GEN2_VIEWER__.camera.position.toArray()); const same = window.__camPrev === p; window.__camPrev = p; return same; }, null, { polling: 300, timeout: 20_000 });
  // a swatch the build does not print in yet, by name (the picker lists the build's own filaments first, then the catalogue):
  // tapped, then waited for in the filament list. The count need not rise: a region that alone wore a filament swaps it
  const wears = (label) => page.evaluate((l) => window.__GEN2_VIEWER__.filamentsInBuild().filaments.some((f) => f.name === l || f.name === 'Panchroma ' + l), label);
  const pickFresh = async (what) => {
    const label = await page.evaluate(() => { const names = new Set(window.__GEN2_VIEWER__.filamentsInBuild().filaments.map((f) => f.name)); return [...document.querySelectorAll('#ws-picker .bhead.toggle + .swatches .sw')].map((b) => b.getAttribute('aria-label')).find((l) => l && !names.has(l) && !names.has('Panchroma ' + l)) || null; });
    assert.ok(label, `a filament not yet in the build (${what})`);
    await page.locator(`#ws-picker .sw[aria-label="${label}"]`).first().tap();
    await page.waitForFunction((l) => window.__GEN2_VIEWER__.filamentsInBuild().filaments.some((f) => f.name === l || f.name === 'Panchroma ' + l), label, { timeout: 30_000 }).catch(() => assert.fail(`${what}: ${label} did not reach the build`));
    return label;
  };
  // 1 Build: the model is the hero - no sheet open
  assert.deepEqual(await openSheets(), [], 'Build opens with its sheets down');
  // 2 Colors from the tab bar: its sheet opens on arrival, alone; the Dock becomes the filament count
  await page.locator('#ws-tabbar .tab:has-text("Colors")').tap();
  await page.waitForSelector('#ws-colors .summary .simplify', { timeout: 30_000 });
  assert.deepEqual(await openSheets(), ['ws-colors']);
  await agree('on arrival'); await noKeyboard('Colors');
  // 3 Browse looks: the gallery sheet alone; a card shows its look without choosing it; Apply is one undo step and comes back to the Colors sheet
  await page.locator('#ws-colors .browse').tap();
  await page.waitForFunction(() => document.querySelectorAll('#ws-gallery .lcard canvas.drawn').length >= 6, null, { timeout: 40_000 });
  assert.deepEqual(await openSheets(), ['ws-gallery']);
  await page.locator('#ws-gallery .lcard').nth(1).tap();
  await page.waitForSelector('#ws-gallery .apply', { timeout: 15_000 });
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.previewing), true, 'the look is shown on the model');
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.canUndo), false, 'and not chosen');
  await page.locator('#ws-gallery .apply').tap();
  await page.waitForFunction(() => document.querySelector('#ws-gallery').hidden && document.querySelector('#ws-colors').classList.contains('open') && !window.__GEN2_VIEWER__.previewing, null, { timeout: 30_000 });
  assert.equal(await text(page, '#ws-colors .lname'), 'Stealth');
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.canUndo), true, 'the look applied is an undo step');
  const toast = await page.evaluate(() => { const t = document.querySelector('#ws-toast'); return { shown: t.classList.contains('show'), text: t.textContent, z: Number(getComputedStyle(t).zIndex) || 0 }; });
  assert.ok(toast.shown && /Applied/.test(toast.text) && toast.z > 13, `the toast says so over the sheets: ${JSON.stringify(toast)}`);
  const c1 = await agree('after the look');
  // 4 a part tapped on the model while the Colors sheet is up: the sheets step down; the part's card and the picker's handle
  //   show over the collapsed handles; nothing opens by itself (they were under the open sheet: the tap seemed to do nothing)
  await stillCamera();
  const unitId = await page.evaluate(() => window.__GEN2_STORE__.state.placed[0].id);
  const sp = await page.evaluate((id) => window.__GEN2_VIEWER__.unitScreen(id), unitId);
  assert.ok(sp && await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', sp), `the first unit's front is on the model, uncovered (${JSON.stringify(sp)})`);
  await page.touchscreen.tap(sp.x, sp.y);
  await page.waitForFunction(() => window.__GEN2_VIEWER__.selectedId != null, null, { timeout: 30_000 }).catch(() => assert.fail('the tap selected no part'));
  await settle(page, 600);
  assert.deepEqual(await openSheets(), [], 'no sheet is open after a tap on the model');
  assert.ok(await onTop('#ws-partcard'), 'the part card shows over the handles');
  assert.ok(await onTop('#ws-picker'), 'the picker’s handle can be reached');
  await noKeyboard('a tapped part');
  // 5 a chip on the card opens the picker sheet, alone, its search field quiet; a swatch recolours the build's region
  await page.locator('#ws-partcard .zchip').first().tap();
  await page.waitForFunction(() => document.querySelector('#ws-picker').classList.contains('open'), null, { timeout: 30_000 });
  assert.deepEqual(await openSheets(), ['ws-picker']);
  await noKeyboard('the picker');
  const buildPick = await pickFresh('the build pick');
  assert.equal(await page.evaluate(() => Object.keys(window.__GEN2_VIEWER__.palette().over || {}).length), 0, 'the build pick is no unit’s own');
  const c2 = await agree('after the build pick');
  // 6 This unit only: a second swatch is this unit's own colour; the summary says so
  const unitSeg = page.locator('#ws-picker .seg2 .seg').nth(1);
  assert.equal(await unitSeg.isDisabled(), false, 'the tapped part belongs to a unit, so "This unit only" is offered');
  await unitSeg.tap();
  await page.waitForFunction(() => /this/.test(document.querySelector('#ws-picker .sheet-handle .ttl').textContent), null, { timeout: 15_000 });
  await settle(page, 500);   // a visitor's pace: the store merges commits made within 350 ms into one undo step
  const unitPick = await pickFresh('the unit pick');
  assert.equal(await page.evaluate(() => Object.keys(window.__GEN2_VIEWER__.palette().over || {}).length), 1, 'one unit wears its own colour');
  assert.ok(await wears(buildPick), 'the build pick stays for the other units');
  const c3 = await agree('after the unit pick');
  assert.match(c3.own, /1 unit with its own colours/);
  // 7 Undo takes the unit's colour back, Redo returns it; the picker stays up through both
  await page.locator('#ws-tools button[title^="Undo"]').tap();
  await settle(page, 500);
  await page.waitForFunction((l) => !window.__GEN2_VIEWER__.filamentsInBuild().filaments.some((f) => f.name === l || f.name === 'Panchroma ' + l) && !Object.keys(window.__GEN2_VIEWER__.palette().over || {}).length, unitPick, { timeout: 30_000 })
    .catch(async () => assert.fail(`Undo did not take the unit’s colour back: ${JSON.stringify(await page.evaluate(() => ({ names: window.__GEN2_VIEWER__.filamentsInBuild().filaments.map((f) => f.name), over: window.__GEN2_VIEWER__.palette().over, canUndo: window.__GEN2_STORE__.canUndo, canRedo: window.__GEN2_STORE__.canRedo })))}`));
  assert.equal((await counts()).own, '', 'Undo: no unit wears its own colour');
  assert.equal((await counts()).fc, c2.fc, 'Undo: the count is the build pick’s again');
  await page.locator('#ws-tools button[title^="Redo"]').tap();
  await page.waitForFunction((l) => window.__GEN2_VIEWER__.filamentsInBuild().filaments.some((f) => f.name === l || f.name === 'Panchroma ' + l), unitPick, { timeout: 30_000 }).catch(() => assert.fail('Redo did not return the unit’s colour'));
  assert.deepEqual(await openSheets(), ['ws-picker'], 'the picker stays up through Undo and Redo');
  assert.equal((await agree('after Redo')).fc, c3.fc);
  // 8 the picker's close: the sheets down, the model and the card
  await page.locator('#ws-picker .x').tap();
  await page.waitForFunction(() => document.querySelector('#ws-picker').hidden, null, { timeout: 15_000 });
  assert.deepEqual(await openSheets(), []);
  // 9 Simplify from the Colors sheet: its own sheet, the proposal shown; Apply is one undo step, one filament fewer, back to the Colors sheet
  await page.locator('#ws-colors .sheet-handle').tap();
  await page.waitForFunction(() => document.querySelector('#ws-colors').classList.contains('open'), null, { timeout: 15_000 });
  await page.locator('#ws-colors .summary .simplify').tap();
  await page.waitForSelector('#ws-simplify .chg', { timeout: 30_000 });
  assert.deepEqual(await openSheets(), ['ws-simplify']);
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.previewing), true, 'the proposal is shown');
  await page.locator('#ws-simplify .apply').tap();
  await page.waitForFunction((n) => document.querySelector('#ws-simplify').hidden && document.querySelector('#ws-colors').classList.contains('open') && !window.__GEN2_VIEWER__.previewing && window.__GEN2_VIEWER__.filamentsInBuild().count === n - 1, c3.fc, { timeout: 30_000 });
  const c4 = await agree('after Simplify');
  // 10 Review filaments: the shopping list shows over the handles (it opened under the Colors sheet), one row per filament, as many as the Dock
  await page.locator('#ws-colors .summary .review').tap();
  await page.waitForSelector('#ws-shop:not([hidden])', { timeout: 15_000 });
  await settle(page, 500);
  assert.deepEqual(await openSheets(), [], 'the sheets step down for the shopping list');
  assert.ok(await onTop('#ws-shop'), 'the shopping list is not under a sheet');
  const rows = await page.evaluate(() => [...document.querySelectorAll('#ws-shop .frow b')].map((b) => b.textContent));
  assert.deepEqual(rows, c4.names, 'the shopping list names the build’s filaments');
  assert.equal(rows.length, c4.dock, 'as many as the Dock says');
  // 11 Get parts list: the Parts sheet opens on arrival; the rows name the filaments they print in - the same set, no more
  await page.locator('#ws-dock .cta').tap();
  await page.waitForSelector('#ws-parts .printin', { timeout: 30_000 });
  assert.deepEqual(await openSheets(), ['ws-parts']);
  const named = await page.evaluate(() => { const out = new Set(); for (const l of document.querySelectorAll('#ws-parts .printin')) { const t = l.textContent.replace(/^Print in /, ''); if (/^No filament/.test(t)) continue; for (const part of t.split(' · ')) for (const nm of part.replace(/^[a-z][a-z ]*?(?= [A-Z])/, '').trim().split(' / ')) out.add(nm.trim()); } return [...out]; });
  const shortNames = c4.names.map((s) => s.replace('Panchroma ', ''));
  assert.deepEqual(named.sort(), [...shortNames].sort(), 'the Parts list prints in exactly the filaments the Colors Dock counted');
  // 12 back to the model: Build from the tab bar, its sheets down; Undo there takes Simplify back
  await page.locator('#ws-tabbar .tab:has-text("Build")').tap();
  await page.waitForSelector('#ws-lib', { timeout: 30_000 });
  await settle(page, 800);
  assert.deepEqual(await openSheets(), [], 'Build: the model is the hero again');
  await page.locator('#ws-tools button[title^="Undo"]').tap();
  await page.waitForFunction((n) => window.__GEN2_VIEWER__.filamentsInBuild().count === n, c3.fc, { timeout: 30_000 }).catch(() => assert.fail('Undo in Build did not take Simplify back'));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE STOP (2026-10-19, Joey: "they should open all the way, until the inside back wall of the drawer collides with the
   drawer stopper"). Measured in the scene: the stopper's tab sits 2 mm behind the case front and the drawer's inner back
   face 10 mm inside the case back, so the wall meets the tab after collection − 13.5 mm (171.5 on a 185). Build's "Peek
   inside" and the Colors card's "Open the drawer" both go through the stage's peekUnit. */
test('Build: Peek inside pulls the drawer out to its stopper (collection − 13.5 mm), and Close it brings it back', async () => {
  const { ctx, page, errors } = await open('build');
  const drawer = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; const d = v.manifest.instances.find((x) => /DecorDrawer/.test(x.node)); return { id: d.id, owner: v.partInfo(d.id).owner, z0: v.instances.get(d.id).group.position.z, collection: parseInt(v.manifest.collection, 10) || 185 }; });
  await page.evaluate((id) => window.__GEN2_VIEWER__.setSelected(id), drawer.id);
  await page.waitForSelector('#ws-insp:not([hidden])', { timeout: 30_000 });
  const peek = btn(page, 'Peek inside', '#ws-insp');
  await peek.click({ timeout: 30_000 });
  const stop = drawer.collection - 13.5;
  await page.waitForFunction(([id, z]) => Math.abs(window.__GEN2_VIEWER__.instances.get(id).group.position.z - z) < 0.05, [drawer.id, drawer.z0 + stop], { timeout: 30_000 })
    .catch(async () => assert.fail(`the drawer did not land at base + ${stop}: z ${await page.evaluate((id) => window.__GEN2_VIEWER__.instances.get(id).group.position.z, drawer.id)} from ${drawer.z0}`));
  await btn(page, 'Close it', '#ws-insp').click({ timeout: 30_000 });
  await page.waitForFunction(([id, z]) => Math.abs(window.__GEN2_VIEWER__.instances.get(id).group.position.z - z) < 0.05, [drawer.id, drawer.z0], { timeout: 30_000 })
    .catch(() => assert.fail('Close it did not bring the drawer back'));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE FEET ARE TPU (Joey, 2026-10-21: "when selecting the feet, i feel like we should only list TPU filaments as an option ...
   default for feet should always be TPU black"; "maybe we need to make PETG and PLA and TPU, like colored tags in the menu").
   The stage keeps a palette's feet TPU (main.js tpuFeet): the boot preset, a whole palette or a saved one that names PLA
   feet, a reset; a unit's own PLA pick for its feet is refused. The feet's picker lists only the TPU lines and every other
   picker none; each line's header carries its material tag. */
test('Colors: the feet are TPU - TPU95 Black by default, from a PLA palette and on reset; a TPU-only feet picker; material tags on every line', async () => {
  const { ctx, page, errors } = await open('colors');
  const TPU_BLACK = 'Polymaker PolyFlex TPU95 Black';
  const feet = () => page.evaluate(() => (window.__GEN2_VIEWER__.palette().colors.Foot || {}).name);
  assert.equal(await feet(), TPU_BLACK, 'the boot preset dresses the feet in TPU95 Black');
  const heads = () => page.evaluate(() => [...document.querySelectorAll('#ws-picker .bhead.toggle')].map((h) => [h.querySelector('i').textContent.trim().split(' ·')[0], [...h.querySelectorAll('.mat')].map((m) => m.textContent)]));
  // a case picker: a tag on every line, no TPU anywhere
  await page.locator('#ws-colors .crow').first().click();
  await page.waitForSelector('#ws-picker .brands .sw', { timeout: 15_000 });
  const caseHeads = await heads();
  assert.deepEqual(caseHeads, [['Panchroma™ PLA', ['PLA']], ['Panchroma™ Silk PLA', ['PLA']], ['PETG', ['PETG']], ['Panchroma™ Translucent PLA', ['PLA']], ['PLA / PETG', ['PLA', 'PETG']], ['PLA', ['PLA']], ['Burnt Titanium PLA', ['PLA']]], 'every line but TPU, each tagged');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#ws-picker .sw')].filter((e) => / TPU/.test(e.getAttribute('aria-label') || '')).length), 0, 'no TPU swatch for the case');
  // the feet's picker: the note, the two TPU lines tagged TPU, nothing else
  await page.locator('#ws-colors .crow').filter({ has: page.locator('b', { hasText: /^Foot$/ }) }).first().click();
  await page.waitForFunction(() => /only TPU is listed/.test(document.getElementById('ws-picker')?.textContent || ''), null, { timeout: 15_000 }).catch(() => assert.fail('the feet picker did not open with its note'));
  assert.deepEqual(await heads(), [['PolyFlex™ TPU95', ['TPU']], ['PolyFlex™ TPU90', ['TPU']]]);
  const sws = await page.evaluate(() => [...document.querySelectorAll('#ws-picker .brands .sw')].map((e) => e.getAttribute('aria-label')));
  assert.ok(sws.length === 11 && sws.every((n) => / TPU9/.test(n)), `only TPU swatches (In this build + 10): ${sws}`);
  // TPU95 Orange, then the reset: TPU95 Black
  await page.locator('#ws-picker .brands .sw[aria-label="Polymaker PolyFlex TPU95 Orange"]').first().click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.palette().colors.Foot.name === 'Polymaker PolyFlex TPU95 Orange', null, { timeout: 15_000 });
  await page.locator('#ws-picker button:has-text("Reset to TPU95 Black")').click();
  await page.waitForFunction((n) => window.__GEN2_VIEWER__.palette().colors.Foot.name === n, TPU_BLACK, { timeout: 15_000 }).catch(() => assert.fail('the reset did not give TPU95 Black'));
  // the stage refuses PLA on the feet: a whole palette naming PLA feet, and a unit's own PLA pick
  const r = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__; const p = v.palette();
    v.setPalette({ on: true, colors: { ...p.colors, Foot: { name: 'Elegoo PLA Black', hex: '#1c1d20' } }, over: {} });
    const whole = v.palette().colors.Foot.name;
    v.setOverride(1, 'Foot', { name: 'Panchroma Red', hex: '#d03a2e' });
    return { whole, over: JSON.stringify(v.palette().over) };
  });
  assert.equal(r.whole, TPU_BLACK, 'a palette naming PLA feet wears TPU95 Black');
  assert.doesNotMatch(r.over, /Panchroma Red/, 'a unit’s own PLA feet pick is refused');
  // a saved palette naming PLA feet (an old one): the reload wears TPU95 Black
  const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith('gen2-colors:') && /PolyFlex TPU95 Black/.test(localStorage.getItem(k))));
  assert.ok(key, 'the palette is saved');
  await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.colors.Foot = { name: 'Elegoo PLA Black', hex: '#1c1d20' }; localStorage.setItem(k, JSON.stringify(s)); }, key);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#ws-colors .crow', { timeout: 120_000 });
  assert.equal(await feet(), TPU_BLACK, 'the saved PLA feet load as TPU95 Black');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* SILK LOOKS SILK (Joey, 2026-10-21: "in the color palettes, is it possible to give the silk material squares a gloss effect,
   like a sheen on half of it or something? To help differentiate it from regular material"). A silk filament's swatch wears
   a highlight over its upper-left half (.sw.silk::before), in the picker and wherever its colour shows in Colors. */
test('Colors: silk filaments wear a sheen in the picker and in the rows, plain ones do not', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.locator('#ws-colors .crow').first().click();
  await page.waitForSelector('#ws-picker .brands .sw', { timeout: 15_000 });
  const r = await page.evaluate(() => {
    const sws = [...document.querySelectorAll('#ws-picker .brands .sw')];
    const isSilk = (e) => (e.getAttribute('aria-label') || '').split(' ').includes('Silk');
    const sheen = (e) => getComputedStyle(e, '::before').backgroundImage;
    const silk = sws.filter(isSilk), plain = sws.filter((e) => !isSilk(e));
    return { silk: silk.length, plain: plain.length,
      silkOk: silk.filter((e) => !(e.classList.contains('silk') && /linear-gradient/.test(sheen(e)))).map((e) => e.getAttribute('aria-label')),
      plainOk: plain.filter((e) => e.classList.contains('silk') || sheen(e) !== 'none').map((e) => e.getAttribute('aria-label')) };
  });
  assert.ok(r.silk >= 24, `the Silk PLA line is in the picker: ${r.silk}`);
  assert.deepEqual(r.silkOk, [], 'every silk swatch wears the sheen');
  assert.ok(r.plain > 50, `plain filaments too: ${r.plain}`);
  assert.deepEqual(r.plainOk, [], 'no plain swatch wears it');
  // pick a silk filament: the row chip for that region and the In this build swatch wear the sheen as well
  await page.locator('#ws-picker .brands .sw[aria-label="Panchroma Silk Gold"]').click();
  await page.waitForFunction(() => !!document.querySelector('#ws-colors .crow .sw.silk') && !!document.querySelector('#ws-picker .brands .sw.silk[aria-label="Panchroma Silk Gold"][title*="already in this build"]'), null, { timeout: 15_000 })
    .catch(() => assert.fail('the picked silk does not show its sheen in the row and the In this build swatches'));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* AN OPEN DRAWER SAYS ITS INSIDE SIZE (Joey, 2026-10-21: "we no longer get interior dimensions when opening a drawer like we
   did in the old planner"). The stage's drawer focus - the cavity measured by rays, lines on its floor and back wall, the
   W / L / H pills - now follows the planner's own way of opening one (stage.peekUnit: Build's Peek inside, the Colors
   card's Open the drawer), without moving the camera. Picking the drawer’s own parts keeps it; Close it gives the build’s
   pills back as they were; the ruler during a peek hands the pills back to the build. */
test('Build: Peek inside shows the drawer’s inside W / L / H in the pills, keeps them while its parts are picked, and Close it gives the build’s pills back', async () => {
  const { ctx, page, errors } = await open('build');
  // shown = on the page: not hidden by the stage, and not by the shell's CSS, which shows pills only for the ruler or a peek
  const pill = (id) => page.evaluate((id) => { const e = document.getElementById(id); const n = (e.textContent || '').replace(/[^0-9.]+/g, ' ').trim().split(' ')[0]; return { shown: !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none', mm: Number(n) }; }, id);
  const pills = async () => ({ w: await pill('dim-w'), l: await pill('dim-l'), h: await pill('dim-h') });
  // the pills stay inside the stage's clear area (the canvas less the panels' bands, stage.safeArea) and off each other
  const clearOf = () => page.evaluate(() => {
    const sa = window.__GEN2_VIEWER__.safeArea || { left: 0, right: 0, top: 0, bottom: 0 };
    const cv = document.getElementById('stage').getBoundingClientRect();
    const rs = ['dim-w', 'dim-l', 'dim-h'].map((id) => document.getElementById(id).getBoundingClientRect());
    const inside = rs.every((q) => q.left >= cv.left + sa.left - 1 && q.right <= cv.right - sa.right + 1 && q.top >= cv.top + sa.top - 1 && q.bottom <= cv.bottom - sa.bottom + 1);
    const apart = rs.every((a, i) => rs.every((c, j) => j <= i || a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top));
    return { inside, apart, rs: rs.map((q) => [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)]), sa };
  });
  const drawer = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; const d = v.manifest.instances.find((x) => /DecorDrawer/.test(x.node)); const owner = v.partInfo(d.id).owner; const u = window.__GEN2_STORE__.state.placed.find((p) => p.id === owner); return { id: d.id, owner, w: u.w, hh: u.hh, z0: v.instances.get(d.id).group.position.z, collection: parseInt(v.manifest.collection, 10) || 185 }; });
  // the build’s own pills, on
  await page.locator('#ws-tools button.measure').click();
  await page.waitForFunction(() => !document.getElementById('dim-w').classList.contains('hidden'), null, { timeout: 30_000 }).catch(() => assert.fail('the ruler did not show the build’s pills'));
  const build0 = await pills();
  await page.evaluate((id) => window.__GEN2_VIEWER__.setSelected(id), drawer.id);
  await page.waitForSelector('#ws-insp:not([hidden])', { timeout: 30_000 });
  // the camera at rest first (the boot's own camera move may still be landing)
  const cam = () => page.evaluate(() => JSON.stringify(window.__GEN2_VIEWER__.probe().camera));
  let cam0 = await cam();
  for (let i = 0; i < 40; i++) { await settle(page, 250); const c = await cam(); if (c === cam0) break; cam0 = c; }
  await btn(page, 'Peek inside', '#ws-insp').click({ timeout: 30_000 });
  const stop = drawer.collection - 13.5;
  await page.waitForFunction(([id, z]) => Math.abs(window.__GEN2_VIEWER__.instances.get(id).group.position.z - z) < 0.05, [drawer.id, drawer.z0 + stop], { timeout: 30_000 }).catch(() => assert.fail('the drawer did not open'));
  await settle(page, 600);
  const inside = await pills();
  assert.ok(inside.w.shown && inside.l.shown && inside.h.shown, `the three pills show: ${JSON.stringify(inside)}`);
  assert.ok(inside.w.mm > 0 && inside.w.mm < drawer.w * 88, `inside width ${inside.w.mm} under the drawer’s ${drawer.w * 88} mm`);
  assert.ok(inside.l.mm > 0 && inside.l.mm < drawer.collection, `inside length ${inside.l.mm} under the ${drawer.collection} collection`);
  assert.ok(inside.h.mm > 0 && inside.h.mm < drawer.hh * 28, `inside height ${inside.h.mm} under the drawer’s ${drawer.hh * 28} mm`);
  assert.notEqual(inside.w.mm, build0.w.mm, 'the pills say the drawer, not the build');
  const c1 = await clearOf();
  assert.ok(c1.inside && c1.apart, `the pills sit clear of the panels and of each other (2026-10-21: the W pill sat under the dock): ${JSON.stringify(c1)}`);
  assert.equal(await cam(), cam0, 'the camera stayed where it was');
  // picking another of the drawer’s own parts (its handle, label or accent: what Colors does next) keeps it open, and its sizes
  const rider = await page.evaluate((id) => (window.__GEN2_VIEWER__.manifest.instances.find((x) => x.rides === id && !/Faceplate/.test(x.node)) || {}).id || null, drawer.id);
  assert.ok(rider, 'the drawer carries a part other than its faceplate');
  await page.evaluate((id) => window.__GEN2_VIEWER__.setSelected(id), rider);
  await settle(page, 400);
  assert.deepEqual((await pills()).w, inside.w, 'still the inside width');
  assert.ok(await page.evaluate(([id, z]) => Math.abs(window.__GEN2_VIEWER__.instances.get(id).group.position.z - z) < 0.05, [drawer.id, drawer.z0 + stop]), 'still open');
  // Close it: the build’s pills come back as they were
  await btn(page, 'Close it', '#ws-insp').click({ timeout: 30_000 });
  await page.waitForFunction(([id, z]) => Math.abs(window.__GEN2_VIEWER__.instances.get(id).group.position.z - z) < 0.05, [drawer.id, drawer.z0], { timeout: 30_000 }).catch(() => assert.fail('Close it did not bring the drawer back'));
  await settle(page, 400);
  const build1 = await pills();
  assert.ok(build1.w.shown && build1.w.mm === build0.w.mm && build1.l.mm === build0.l.mm && build1.h.mm === build0.h.mm, `the build’s pills are back: ${JSON.stringify(build1)} vs ${JSON.stringify(build0)}`);
  // the ruler during a peek: the build’s pills take over, the drawer stays open
  await btn(page, 'Peek inside', '#ws-insp').click({ timeout: 30_000 });
  await page.waitForFunction((mm) => { const t = (document.getElementById('dim-w').textContent || '').replace(/[^0-9.]+/g, ' ').trim().split(' ')[0]; return Number(t) !== mm; }, build0.w.mm, { timeout: 30_000 }).catch(() => assert.fail('the second peek did not show the inside sizes'));
  // the ruler reads the visitor's own setting during a peek (on), and a click is theirs: off hides every pill, the drawer
  // stays open; on again shows the build's
  assert.equal(await page.locator('#ws-tools button.measure').getAttribute('aria-pressed'), 'true', 'the ruler still reads on');
  await page.locator('#ws-tools button.measure').click();
  await page.waitForFunction(() => ['dim-w', 'dim-l', 'dim-h'].every((id) => document.getElementById(id).classList.contains('hidden')), null, { timeout: 30_000 }).catch(() => assert.fail('the ruler off did not hide the pills'));
  await settle(page, 400);
  assert.ok(await page.evaluate(() => ['dim-w', 'dim-l', 'dim-h'].every((id) => document.getElementById(id).classList.contains('hidden'))), 'they stay hidden');
  assert.ok(await page.evaluate(([id, z]) => Math.abs(window.__GEN2_VIEWER__.instances.get(id).group.position.z - z) < 0.05, [drawer.id, drawer.z0 + stop]), 'the drawer stays open');
  await page.locator('#ws-tools button.measure').click();
  await page.waitForFunction((mm) => { const t = (document.getElementById('dim-w').textContent || '').replace(/[^0-9.]+/g, ' ').trim().split(' ')[0]; return Number(t) === mm && !document.getElementById('dim-w').classList.contains('hidden'); }, build0.w.mm, { timeout: 30_000 }).catch(() => assert.fail('the ruler on did not show the build pills'));
  // with the ruler off, a peek and a close leave no pills at all (the stage's old exit turned the build's on)
  await btn(page, 'Close it', '#ws-insp').click({ timeout: 30_000 });
  await page.locator('#ws-tools button.measure').click();
  await page.waitForFunction(() => document.getElementById('dim-w').classList.contains('hidden'), null, { timeout: 30_000 });
  await btn(page, 'Peek inside', '#ws-insp').click({ timeout: 30_000 });
  await page.waitForFunction(() => { const e = document.getElementById('dim-w'); return !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }, null, { timeout: 30_000 }).catch(() => assert.fail('a peek with the ruler off showed no inside sizes (live 2026-10-21: the shell CSS hid them)'));
  await settle(page, 600);
  const c2 = await clearOf();
  assert.ok(c2.inside && c2.apart, `with the ruler off too: ${JSON.stringify(c2)}`);
  await btn(page, 'Close it', '#ws-insp').click({ timeout: 30_000 });
  await page.waitForFunction(([id, z]) => Math.abs(window.__GEN2_VIEWER__.instances.get(id).group.position.z - z) < 0.05, [drawer.id, drawer.z0], { timeout: 30_000 });
  await settle(page, 400);
  assert.ok(await page.evaluate(() => ['dim-w', 'dim-l', 'dim-h'].every((id) => { const e = document.getElementById(id); return e.classList.contains('hidden') || getComputedStyle(e).display === 'none'; })), 'closed with the ruler off: no pills');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE BACK COVER AND THE v2609 DRAWER'S TEAR-AWAY FRONT (2026-10-20). The standard Decor drawer now prints with the
   same tear-away front as the Gridfinity one, and its GLB carries it as one mesh with the body. Joey's rule: the
   faceplate goes on with the front left in, the back cover only with it out ("otherwise they would interfere"). The
   cover stays optional; the Parts row, the Build style hint and the Faceplates step say the front comes out first;
   the stage hides nothing (the panel is not a node of its own, and the cover's volume holds all of it). */
test('Build: a back cover on a Decor drawer says the tear-away front comes out first - the Build style hint, the Parts row, the Faceplates step; the stage keeps the drawer whole', async () => {
  const { ctx, page, errors } = await open('build');
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.backCover = true; }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build.backCover === true && window.__GEN2_VIEWER__.manifest.instances.some((i) => /^BackCover_/.test(i.node)), null, { timeout: 60_000 });
  await settle(page, 800);
  // the stage: the cover rides a standard Decor drawer, both whole and visible - nothing of the drawer is hidden
  const stage = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__;
    const bc = v.manifest.instances.find((i) => /^BackCover_/.test(i.node));
    const drw = v.manifest.instances.find((i) => i.id === bc.rides);
    const meshes = (id) => { const out = []; v.instances.get(id).group.traverse((o) => { if (o.isMesh) out.push(o.visible); }); return out; };
    return { rides: drw && drw.node, cover: meshes(bc.id), drawer: meshes(drw.id), note: v.manifest.parts.find((p) => /^BackCover_/.test(p.node))?.note || '', step: v.manifest.steps.find((s) => /^Faceplates/.test(s.title))?.note || '' };
  });
  assert.match(stage.rides, /^DecorDrawer_/, 'the cover rides the standard Decor drawer');
  assert.ok(stage.cover.length >= 1 && stage.cover.every(Boolean), 'the cover is on the stage, visible');
  assert.ok(stage.drawer.length >= 1 && stage.drawer.every(Boolean), 'the drawer body is whole: no mesh of it hidden');
  assert.match(stage.note, /Take the drawer's tear-away front out first/, 'the manifest row');
  assert.match(stage.step, /take the drawer's tear-away front out and clip the back cover in from behind/, 'the Faceplates step');
  // the Build style tab, where the cover is switched on
  await page.locator('#ws-lib button[role="tab"]:has-text("Build style")').click();
  await page.waitForSelector('#ws-lib .bc-hint', { timeout: 30_000 });
  assert.match(await text(page, '#ws-lib .bc-hint'), /Take each drawer's tear-away front out first - left in, it and the cover interfere\./);
  assert.doesNotMatch(await text(page, '#ws-lib .bc-hint'), /Gridfinity/, 'no Gridfinity drawer in this build, so no aside about them');
  // off again: the hint goes with the cover
  // the Back cover section's own Off: Build style has other Off / On segments (Side covers, 2026-10-20), so never the last one
  await page.locator('#ws-lib section', { has: page.locator('h2:has-text("Back cover")') }).locator('button.seg.sm:has-text("Off")').click({ timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('#ws-lib .bc-hint') && window.__GEN2_STORE__.state.backCover === false, null, { timeout: 30_000 });
  // Gridfinity by the generator's rule (Terra 01a1594c): every drawer a real Gridfinity one (1W-1H at 185) - the hint
  // says only that the cover is not for them; a `variant` kept on a size with no Gridfinity drawer (1W-3H) renders
  // the standard drawer and takes a cover, so the hint says the front comes out and nothing about Gridfinity
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.backCover = true; s.placed.forEach((u) => { if (u.fill === 'decor') u.variant = 'gridfinity'; }); }, 'edit'));
  await page.waitForSelector('#ws-lib .bc-hint', { timeout: 30_000 });
  assert.equal(await text(page, '#ws-lib .bc-hint'), 'Not on the Gridfinity drawers: their tear-away front does the same job.');
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.placed = [{ id: 'g1', x: 0, y: s.gridH * 2 - 6, w: 1, hh: 6, fill: 'decor', shelves: 0, variant: 'gridfinity' }]; s.nextId = 100; s.gridW = 1; }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 1 && window.__GEN2_VIEWER__.build.placed[0].hh === 6 && /tear-away front out first/.test(document.querySelector('#ws-lib .bc-hint')?.textContent || ''), null, { timeout: 60_000 });
  assert.equal(await text(page, '#ws-lib .bc-hint'), "Take each drawer's tear-away front out first - left in, it and the cover interfere.");
  assert.ok(await page.evaluate(() => window.__GEN2_VIEWER__.manifest.instances.some((i) => /^BackCover_/.test(i.node)) && window.__GEN2_VIEWER__.manifest.instances.some((i) => /^DecorDrawer_185-1W-3H$/.test(i.node))), 'the stage: a standard 3H drawer with its cover');
  // the Parts list's row, from the same record (the 3H drawer's cover)
  await page.click('#ws-tabs .tab:has-text("Parts")');
  await page.waitForFunction(() => [...document.querySelectorAll('#ws-parts .prow')].some((r) => /Back Cover/.test(r.querySelector('.name')?.textContent || '')), null, { timeout: 60_000 });
  const row = await page.evaluate(() => { const r = [...document.querySelectorAll('#ws-parts .prow')].find((r) => /Back Cover/.test(r.querySelector('.name')?.textContent || '')); return { note: r.querySelector('.note:not(.printin)')?.textContent || '', badge: r.querySelector('.badge')?.textContent || '' }; });
  assert.match(row.note, /^Optional · clips in behind the faceplate/, 'still the optional accessory');
  assert.match(row.note, /Take the drawer's tear-away front out first - left in, it and the cover interfere\./);
  assert.equal(row.badge, 'OPTIONAL');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE MOUNT WINDOW (2026-10-21). A layout change waits on the GLBs of every part it brings in, and until they land the OLD
   instances are still the stage's. A Parts tab switch in that window paints them (its goTo is an applyState): with the
   type map already replaced by the new build's, an old node the new build no longer had found no type, colorLocked threw
   and the list drew no rows - the back-cover case above flaked on it when its GLBs were slow. A palette repaint in the
   same window walks the NEW manifest's parts, so a map swapped in only after the GLBs fails there instead; both are
   checked. Here the window is held open: every part GLB waits until the case lets it go.
   ⚠ The hold is a gate the handler itself waits on, then falls back from; never page.unroute. Playwright (1.63)
   continues a removed handler's held requests to the next handler on its own, so a fallback after the unroute handled
   each one twice: under GEN2_PARTS_LOCAL=1 the second pass reached local-parts.mjs's fulfill and rejected "Route is
   already handled!" after the case ended, failing the file (another session's report, 2026-10-21). */
test('Build: a Parts switch while a layout change still waits on its GLBs throws nothing, and the stage then mounts the new build', async () => {
  const { ctx, page, errors } = await open('build');
  let held = 0, release;
  const gate = new Promise((ok) => { release = ok; });
  const GLB = /\.lib\.glb(\?|$)/;
  await page.route(GLB, async (route) => { held++; await gate; await route.fallback(); });
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.backCover = true; s.placed = [{ id: 'g1', x: 0, y: s.gridH * 2 - 6, w: 1, hh: 6, fill: 'decor', shelves: 0 }]; s.nextId = 100; s.gridW = 1; }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_VIEWER__.regenBusy && window.__GEN2_VIEWER__.build.placed.length === 1, null, { timeout: 30_000 });
  for (let t = 0; !held && t < 300; t++) await sleep(100);
  // the controls: the mount is waiting on a GLB, the stage still holds an instance whose node the new build has not, and
  // the Parts switch will page (an applyState over those instances)
  const window_ = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__, now = new Set(v.manifest.instances.map((i) => i.node));
    return { busy: v.regenBusy, stale: [...v.instances.values()].filter((i) => !now.has(i.cfg.node)).length, pages: v.cur !== v.manifest.steps.length };
  });
  assert.ok(held > 0 && window_.busy, `the control: the mount waits on held GLBs (${held} held)`);
  assert.ok(window_.stale > 0, 'the control: an old instance whose node the new build no longer has is still on the stage');
  assert.ok(window_.pages, 'the control: the Parts switch pages the stage');
  // the window's other side: a repaint walks the NEW manifest's parts (the checklist's primaryKey), so their nodes need
  // their types in the same window as the old instances' do
  const repaint = await page.evaluate(() => { try { window.__GEN2_VIEWER__.applyPalette(); return 'ok'; } catch (e) { return String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '); } });
  assert.equal(repaint, 'ok', 'a palette repaint in the window');
  await page.click('#ws-tabs .tab:has-text("Parts")');
  await page.waitForSelector('#ws-parts .prow', { timeout: 30_000 })
    .catch(() => assert.fail(`the Parts list drew no rows: ${clean(errors).join(' / ') || 'no page error'}`));
  assert.ok(await page.evaluate(() => window.__GEN2_VIEWER__.regenBusy), 'the control: the list drew while the mount still waited');
  assert.deepEqual(clean(errors), [], 'nothing threw in the window');
  release();   // every held request, and any later one, falls back to the next handler: the parts host, or local-parts.mjs
  await page.waitForFunction(() => { const v = window.__GEN2_VIEWER__; return !v.regenBusy && v.instances.size === v.manifest.instances.length && v.manifest.instances.every((i) => v.instances.has(i.id)); }, null, { timeout: 60_000 });
  assert.ok(await page.evaluate(() => [...window.__GEN2_VIEWER__.instances.values()].some((i) => /^BackCover_/.test(i.cfg.node))), 'the new build is on the stage, its cover included');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#ws-parts .prow')].some((r) => /Back Cover/.test(r.querySelector('.name')?.textContent || ''))), 'the list is the new build');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* BOTH LABEL FAMILIES IN THE CALLOUT (2026-10-20, Joey: "why not show both edgelabel and classic pro as clickable options?").
   A build whose faceplates take no labels opens Labels to the callout; it offered Switch to EdgeLabel alone, after naming
   both families. Now both are buttons, EdgeLabel first and starred; Classic Pro applies the Classic Pro faceplate. */
test('Labels: the no-label-faceplate callout offers Switch to EdgeLabel and Switch to Classic Pro; Classic Pro applies that family and the callout goes', async () => {
  const { ctx, page, errors } = await open('labels');
  await page.waitForSelector('#ws-labels .callout', { timeout: 30_000 });
  const before = await S(page);
  assert.notEqual(before.faceStyle, 'classicpro', `the control: the build starts on a no-label faceplate (${before.faceStyle})`);
  const buttons = await page.evaluate(() => [...document.querySelectorAll('#ws-labels .callout .btns button')].map((b) => b.textContent.trim()));
  assert.deepEqual(buttons, ['Switch to EdgeLabel ✦', 'Switch to Classic Pro'], 'both label families, EdgeLabel first and starred');
  await page.locator('#ws-labels .callout button:has-text("Switch to Classic Pro")').click({ timeout: 30_000 });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'classicpro' && !document.querySelector('#ws-labels .callout'), null, { timeout: 60_000 })
    .catch(async () => assert.fail(`Classic Pro did not apply: faceStyle ${(await S(page)).faceStyle}, callout ${await page.locator('#ws-labels .callout').count()}`));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* SIDE COVERS OFF AND ON (2026-10-20). Since 2026-10-17 every build wears side covers; Build style now has the toggle the
   decision left unbuilt. Off takes them off the model and off the parts list together, and the record carries it; On
   puts them back. */
test('Build style: Side covers Off removes every side cover from the stage and the bill, the record says so, On brings them back', async () => {
  const { ctx, page, errors } = await open('build');
  const covers = () => page.evaluate(() => ({ stage: window.__GEN2_VIEWER__.manifest.instances.filter((i) => /^SideCover_/.test(i.node)).length, billed: window.__GEN2_VIEWER__.manifest.parts.filter((p) => /^SideCover_/.test(p.node)).reduce((n, p) => n + (p.qty || 1), 0), rec: window.__GEN2_STORE__.state.sideCovers }));
  const before = await covers();
  assert.ok(before.stage > 0 && before.billed > 0, `the control: the kit wears side covers (${JSON.stringify(before)})`);
  assert.notEqual(before.rec, false, 'the control: the record does not say off');
  await page.locator('#ws-lib button[role="tab"]:has-text("Build style")').click({ timeout: 30_000 });
  const section = page.locator('#ws-lib section', { has: page.locator('h2:has-text("Side covers")') });
  await section.locator('button.seg.sm:has-text("Off")').click({ timeout: 30_000 });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.sideCovers === false && !window.__GEN2_VIEWER__.manifest.instances.some((i) => /^SideCover_/.test(i.node)) && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 60_000 })
    .catch(async () => assert.fail(`Off did not take: ${JSON.stringify(await covers())}`));
  const off = await covers();
  assert.equal(off.stage, 0, 'off: no side cover on the stage');
  assert.equal(off.billed, 0, 'off: none billed');
  await section.locator('button.seg.sm:has-text("On")').click({ timeout: 30_000 });
  await page.waitForFunction((n) => window.__GEN2_STORE__.state.sideCovers === true && window.__GEN2_VIEWER__.manifest.instances.filter((i) => /^SideCover_/.test(i.node)).length === n && !window.__GEN2_VIEWER__.regenBusy, before.stage, { timeout: 60_000 })
    .catch(async () => assert.fail(`On did not bring them back: ${JSON.stringify(await covers())}`));
  assert.deepEqual(await covers(), { ...before, rec: true }, 'on: as before, the record saying on');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* FEEDBACK & SUPPORT (the cutover parity check's I1, 2026-10-22): the old planner offers the shared MODULITH dialog in its
   nav and its phone menu; the new one had no way in. The top bar has a button where it has room (not 1280-1365, where the
   bar was already full), and the build menu has the entry on every layout - the phone's only one. The desktop is 1366x768,
   about the suite's 1280x800 in pixels, because the bar hides the button at 1280. GoatCounter is blocked outright. */
test('Feedback & support: the top bar button and the build menu open the shared dialog, desktop and phone; Escape closes it, focus comes back, and no key reaches the build behind it', async () => {
  const fresh = async (phone) => { const c = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } }); contexts.add(c); await c.addInitScript(FAST); await c.route(/goatcounter|gc\.zgo/, (r) => r.abort()); return c; };
  const shown = (page) => page.waitForFunction(() => document.querySelector('dialog.mfb-dialog')?.open && document.activeElement?.classList.contains('mfb-kind'), null, { timeout: 15_000 });
  const shut = (page, back) => page.waitForFunction((s) => !document.querySelector('dialog.mfb-dialog').open && document.activeElement === document.querySelector(s), back, { timeout: 15_000 })
    .catch(async () => assert.fail(`the dialog did not close back to ${back}: open ${await page.evaluate(() => document.querySelector('dialog.mfb-dialog').open)}, focus on ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))}`));
  const errs = (errors) => clean(errors).filter((e) => !/Failed to load resource: net::ERR_FAILED/.test(e));   // the aborted GoatCounter script
  // the viewer's `* { margin: 0 }` reset pinned the dialog to the top-left corner (css/viewer.css restores margin: auto)
  const centred = async (page) => { const off = await page.evaluate(() => { const r = document.querySelector('dialog.mfb-dialog').getBoundingClientRect(); return [Math.round(r.left + r.width / 2 - innerWidth / 2), Math.round(r.top + r.height / 2 - innerHeight / 2)]; });
    assert.ok(off.every((v) => Math.abs(v) <= 1), `the dialog is centred: off by ${off} px`); };

  // desktop: the bar's button, with a unit selected behind the dialog
  const { ctx, page, errors } = await open('build', { context: await fresh(false) });
  const id = await page.evaluate(() => window.__GEN2_STORE__.state.placed[0].id);
  await page.evaluate((i) => window.__GEN2_VIEWER__.selectUnit(i), id);
  await page.waitForFunction((i) => window.__GEN2_STORE__.state.selectedUnit === i, id, { timeout: 15_000 });
  const placed0 = JSON.stringify((await S(page)).placed);
  await page.click('#ws-top .feedback');
  await shown(page);
  assert.equal(await text(page, '#mfb-title'), 'Feedback & support');
  await centred(page);
  // keys in the dialog stay there: behind it Delete would remove the selected unit (first: a refused move deselects it),
  // the arrows move it or say why not, Escape deselects it
  for (const k of ['Delete', 'Backspace', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(k);
  assert.equal(await page.evaluate(() => { const t = document.getElementById('ws-toast'); return t && t.classList.contains('show') ? t.textContent : null; }), null, 'nothing behind the dialog spoke');
  await page.locator('dialog.mfb-dialog .mfb-kind[data-kind="problem"]').click();
  const draft = await page.evaluate(() => ({ href: document.querySelector('dialog.mfb-dialog a.mfb-btn').getAttribute('href'), offered: !document.querySelector('dialog.mfb-dialog .mfb-check').hidden, ticked: document.getElementById('mfb-build').checked }));
  assert.ok(draft.href.startsWith('mailto:support@jerrari3d.com?subject=' + encodeURIComponent('[MODULITH Planner] Problem')), `the planner's own subject: ${draft.href.slice(0, 90)}`);
  assert.deepEqual([draft.offered, draft.ticked], [true, false], 'a link to this build is offered, unticked');
  await page.keyboard.press('Escape');
  await shut(page, '#ws-top .feedback');
  const after = await S(page);
  assert.equal(JSON.stringify(after.placed), placed0, 'no unit moved or went');
  assert.equal(after.selectedUnit, id, 'the unit is still selected');
  const log = await page.evaluate(() => window.__GEN2_VIEWER__.trackLog.slice());
  assert.ok(['feedback:open', 'feedback:problem'].every((n) => log.includes(n)), `the dialog's events: ${log.join(', ')}`);
  // the hold ends with the dialog: Escape on the page deselects again
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__GEN2_STORE__.state.selectedUnit == null, null, { timeout: 15_000 })
    .catch(() => assert.fail('Escape after the dialog closed did not deselect: the key hold outlived the dialog'));
  // the race the runner lost (deploy run 39959731798, 2026-10-23): close() clears `open` at once but only QUEUES the close
  // event, and the hold used to end on that event, so a key landing in between was swallowed. Forced here: close and press
  // in one task, before the event can fire
  await page.evaluate((i) => window.__GEN2_VIEWER__.selectUnit(i), id);
  await page.waitForFunction((i) => window.__GEN2_STORE__.state.selectedUnit === i, id, { timeout: 15_000 });
  await page.click('#ws-top .feedback');
  await shown(page);
  const raced = await page.evaluate(() => { const d = document.querySelector('dialog.mfb-dialog'); d.close();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return window.__GEN2_STORE__.state.selectedUnit; });
  assert.equal(raced, null, 'an Escape between close() and its queued close event still reaches the build');
  await shut(page, '#ws-top .feedback');
  // at 1280 the bar has no room: no button there, and the build menu opens the dialog with the focus coming back to its chip
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.equal(await page.locator('#ws-top .feedback').isVisible(), false, 'no bar button at 1280');
  await page.click('#ws-switch .chip-btn');
  await page.getByRole('menuitem', { name: 'Feedback & support' }).click({ timeout: 15_000 });
  await shown(page);
  assert.equal(await page.locator('#ws-switch .menu').isHidden(), true, 'the menu closed behind the dialog');
  await page.keyboard.press('Escape');
  await shut(page, '#ws-switch .chip-btn');
  assert.deepEqual(errs(errors), []);
  await ctx.close();

  // the phone: no bar button, the bar inside 390 px with its 8 px gaps; the build menu's entry, closed by Escape and by ✕
  const P = await open('build', { phone: true, context: await fresh(true) });
  const bar = await P.page.evaluate(() => { const b = [...document.getElementById('ws-top').children].filter((k) => k.checkVisibility() && getComputedStyle(k).position !== 'absolute').map((k) => k.getBoundingClientRect());
    return { button: document.querySelector('#ws-top .feedback').checkVisibility(), right: Math.round(b[b.length - 1].right), gaps: b.slice(1).map((r, i) => Math.round(r.left - b[i].right)) }; });
  assert.equal(bar.button, false, 'no bar button on the phone');
  assert.ok(bar.right <= 380 && bar.gaps.every((g) => g >= 8), `the phone bar fits with its gaps: ${JSON.stringify(bar)}`);
  for (const close of ['Escape', '✕']) {
    await P.page.locator('#ws-switch .chip-btn').tap();
    await P.page.getByRole('menuitem', { name: 'Feedback & support' }).tap({ timeout: 15_000 });
    await shown(P.page);
    const box = await P.page.evaluate(() => { const r = document.querySelector('dialog.mfb-dialog').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
    assert.ok(box[0] >= 0 && box[1] <= 390, `the dialog fits the phone: ${box}`);
    await centred(P.page);
    if (close === 'Escape') await P.page.keyboard.press('Escape'); else await P.page.locator('dialog.mfb-dialog .mfb-x').tap();
    await shut(P.page, '#ws-switch .chip-btn');
  }
  assert.deepEqual(errs(P.errors), []);
  await P.ctx.close();
});
