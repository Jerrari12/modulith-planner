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
import { test as nodeTest, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localParts } from '../test/lib/local-parts.mjs';
import { parseShard, registerShare } from './shard.mjs';
/* THE SHARDS (2026-10-25, e2e/shard.mjs): every test(...) below is COLLECTED, and the file's last line registers this
   process's share - all of them unless E2E_SHARD=k/n asks for one shard. Read before the browser launches, so a malformed
   value fails at once rather than after the boot. */
const SHARD = parseShard(process.env.E2E_SHARD);
const CASES = [];
const test = Object.assign((...args) => { CASES.push(args); }, { after: nodeTest.after });

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
/* THE DONE ROOM'S CASES THAT RACE ITS CLOCK (2026-10-26). Ten room cases first ran on the CI runner with the done-scene
   merge (main 69d88ea, run 40425689471) and failed there, and they fail the same way under E2E_SOFT=1 on the code of that
   morning: on a software rasteriser a frame takes so long that a case waiting for a 1.5 s hold, a fade or a cut sees the
   scene already past it (the scene itself plays the same plan; on a slow device it locks off, as designed). Joey's call:
   ship, skip them on a software rasteriser only, and make them runner-safe as a follow-up. They run on a GPU locally.
   The rasteriser is read from the launched browser itself (Sol 01a17823: not from CI's membership, which would skip them on
   a hardware runner too), the same test as main.js A SOFTWARE RASTERISER. */
const launchArgs = ['--enable-unsafe-swiftshader', ...(SOFT ? ['--disable-gpu', '--use-angle=swiftshader'] : [])];
const browser = await (async () => { for (const o of [{ channel: 'chrome' }, {}]) { try { return await chromium.launch({ ...o, args: launchArgs }); } catch {} } throw new Error('no Chromium'); })();
const SOFTWARE_GL = await (async () => {
  const p = await browser.newPage();
  try { return await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); if (!gl) return true; const d = gl.getExtension('WEBGL_debug_renderer_info'); return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER))); }); }
  finally { await p.close(); }
})();
const ROOM_SOFT_SKIP = SOFTWARE_GL && 'the Done room on a software rasteriser races the scene\'s clock; runs on a GPU (follow-up: make it runner-safe)';
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
const FAST = () => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); localStorage.setItem('gen2-sheet-nudged', '1'); } catch {} };   // no sheet nudge (open() says why)
async function freshContext() { const c = await browser.newContext({ viewport: { width: 1280, height: 800 } }); contexts.add(c); await c.addInitScript(FAST); return c; }
async function open(ws, { query = '', phone = false, context = null, visitor = false, viewport = null } = {}) {   // viewport: a phone's own size (390 x 844 when not given)
  /* the room is on for everyone (Joey 2026-10-26): a case about something else keeps the studio it was written for
     (?done=off); the room's own cases ask for it (?done=room), or open as a visitor does, with no flag at all */
  const roomy = visitor || /done=room/.test(query);
  if (!visitor && !/done=/.test(query)) query += '&done=off';
  // the final scene's mugs come from the build's link (done.js makeMugs); a case that does not ask for its own (?mugs=N, or
  // ?mugs=plan for the link's own) gets the room as it was composed: one mug at home, the notebook on the desk
  if (roomy && !/mugs=/.test(query)) query += '&mugs=home';
  if (roomy && !/spools=/.test(query)) query += '&spools=off';   // and no spools, unless it asks (?spools=plan)
  const ctx = context || await browser.newContext(phone ? { viewport: viewport || { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
  contexts.add(ctx);
  // the phone sheets' one-time nudge stays out of every case but its own: a sheet lifting a second after load moves what a
  // case taps or measures
  if (!context) await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); localStorage.setItem('gen2-sheet-nudged', '1'); } catch {} });
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
/* the disclosure sentences (colors.js disclosureFor; 2026-10-24: plain buy labels, one line next to the links, never "paid link";
   2026-10-27: the short Polymaker sentence, alone or after Amazon's) */
const AMAZON_SENTENCE = 'As an Amazon Associate I earn from qualifying purchases.';
const POLYMAKER_LINE = 'Polymaker links apply the JERRARI discount and earn me a small commission.';
const DISCLOSURES = [AMAZON_SENTENCE, POLYMAKER_LINE, `${AMAZON_SENTENCE} ${POLYMAKER_LINE}`];
/* the text nodes under `sel` that read "null": append(null) writes the word (the look details showed one under their footer) */
const nullText = (page, sel) => page.evaluate((sel) => { const w = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT); const out = []; while (w.nextNode()) if (w.currentNode.textContent.trim() === 'null') out.push(`${w.currentNode.parentElement.tagName.toLowerCase()}: ${w.currentNode.textContent}`); return out; }, sel);

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
  // the picker's foot (2026-10-24): a plain Buy label, rel=sponsored, and the one disclosure line right under it
  const foot = () => page.evaluate(() => { const f = document.querySelector('#ws-picker .foot'); const a = f.querySelector('a.buy'); return [a.textContent, a.rel, f.querySelector('.disc').textContent]; });
  assert.deepEqual(await foot(), ['Buy Elegoo PLA Black →', 'noopener sponsored', AMAZON_SENTENCE], 'the picker\'s Amazon buy: a plain label, rel=sponsored, Amazon\'s sentence under it');
  await page.locator('#ws-picker .sw[aria-label="Panchroma Black"]').first().click();
  await click(page.locator('#ws-picker .foot a.buy', { hasText: /^Buy Black →/ }), 'the picker\'s Panchroma');
  assert.deepEqual(await foot(), ['Buy Black →', 'noopener sponsored', POLYMAKER_LINE], 'the picker\'s Polymaker buy: a plain label, rel=sponsored, the Polymaker sentence under it');
  // the Dock's filament stack: the shopping list, one Buy per filament
  await page.locator('#ws-picker button[aria-label="Close the picker"]').click();
  await page.locator('#ws-dock .status.stack').click();
  await click(page.locator('#ws-shop .frow').filter({ has: page.locator('b', { hasText: /^Panchroma Black$/ }) }).locator('a.link'), 'the shopping list\'s');
  const shop = await page.evaluate(() => ({ buys: [...document.querySelectorAll('#ws-shop .frow a.link')].map((a) => a.textContent), disc: document.querySelector('#ws-shop .disc').textContent }));
  assert.ok(shop.buys.length && shop.buys.every((t) => t === 'Buy ↗'), `the shopping list's Buy labels are plain: ${shop.buys.join(', ')}`);
  assert.ok(DISCLOSURES.includes(shop.disc) && shop.disc.includes(POLYMAKER_LINE), `the shopping list's one line is a disclosure sentence naming Polymaker (the Case is Panchroma Black): "${shop.disc}"`);
  assert.deepEqual(await nullText(page, '#ws-shop'), [], 'nothing reads "null" in the shopping list');
  // the Parts list: the Case row's filament name (shortened to "Black"), then the hardware's Amazon link, in both layouts
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('parts'));
  await page.waitForSelector('#ws-parts .prow', { timeout: 30_000 });
  await click(page.locator('#ws-parts .printin a', { hasText: /^Black$/ }).first(), 'the Parts list\'s filament');
  assert.deepEqual(await page.locator('#ws-parts .printin a', { hasText: /^Black$/ }).first().evaluate((a) => [a.rel, a.title]), ['noopener sponsored', 'Buy Black ↗'], 'the filament link: rel=sponsored, a plain title');
  const hw = page.locator('#ws-parts .prow').filter({ has: page.locator('.badge', { hasText: /^BUY$/ }) }).locator('a.link').first();
  await click(hw, 'the Parts list\'s hardware');
  // the Amazon link carries rel=sponsored under a PLAIN label (the "· paid link" mark of 2026-10-21 went on 2026-10-24: Joey read
  // "paid" as a brand paying to be listed); since 2026-10-27 the list says it ONCE: the foot, right under the last hardware rows
  // (the mount's section ends the list), is the one line - Amazon's own sentence, the short Polymaker sentence when a "Print in"
  // link is Polymaker's, the shopping tip - with no separate commission line above it; nothing says "paid link"; a download-site
  // link stays plain
  const marks = (row) => Promise.all([page.locator(`#ws-parts ${row}`).filter({ has: page.locator('.badge', { hasText: /^BUY$/ }) }).locator('a.link').first(),
    page.locator(`#ws-parts ${row}`).filter({ hasNot: page.locator('.badge', { hasText: /^BUY$/ }) }).locator('a.link').first()].map((l) => l.evaluate((a) => [a.rel, a.textContent, a.title, a.children.length])));
  const plainLink = (m) => m[0] === 'noopener' && !/paid/i.test(m[1] + m[2]) && m[3] === 0;
  const disclosure = () => page.evaluate(() => {
    const groups = [...document.querySelectorAll('#ws-parts .rows')];
    const hw = groups.filter((g) => [...g.querySelectorAll('.badge')].some((b) => b.textContent === 'BUY'));
    const list = document.querySelector('#ws-parts').textContent, foot = document.querySelector('#ws-parts .foot');
    return { hwGroups: hw.length, afterHw: foot === foot.parentElement.lastElementChild && foot.previousElementSibling === hw[hw.length - 1], commission: (list.match(/commission/g) || []).length,
      amazonSentences: (list.match(/As an Amazon Associate I earn from qualifying purchases\./g) || []).length, paid: /paid link/i.test(list), foot: foot.textContent };
  });
  const checkDisclosure = async (layout) => {
    const d = await disclosure();
    assert.ok(d.hwGroups >= 1, `${layout}: a hardware group`);
    assert.ok(d.afterHw, `${layout}: the foot ends the list, right under the last hardware group`);
    assert.equal(d.commission, /Polymaker/.test(d.foot) ? 1 : 0, `${layout}: "commission" only in the foot's Polymaker sentence (no separate commission line): ${d.commission}`);
    assert.equal(d.amazonSentences, 1, `${layout}: Amazon's sentence once, in the foot`);
    assert.ok(!d.paid, `${layout}: nothing says "paid link"`);
    assert.match(d.foot, /^As an Amazon Associate I earn from qualifying purchases\. (Polymaker links apply the JERRARI discount and earn me a small commission\. )?Any equivalent hardware works\.$/, `${layout}: the foot`);
  };
  const narrow = await marks('.prow');
  assert.deepEqual(narrow[0], ['noopener sponsored', 'Amazon ↗', '', 0], 'the narrow list\'s Amazon link: rel=sponsored, a plain label');
  assert.ok(plainLink(narrow[1]), `the narrow list's download link stays plain: ${narrow[1]}`);
  await checkDisclosure('the narrow list');
  await btn(page, 'Track my build', '#ws-parts').click();
  await page.locator('#ws-parts button.expand').click();
  await click(page.locator('#ws-parts .trow').filter({ has: page.locator('.badge', { hasText: /^BUY$/ }) }).locator('a.link').first(), 'the wide list\'s hardware');
  const wide = await marks('.trow');
  assert.deepEqual(wide[0], ['noopener sponsored', 'Amazon ↗', '', 0], 'the wide list\'s Amazon link: rel=sponsored, a plain label');
  assert.ok(plainLink(wide[1]), `the wide list's download link stays plain: ${wide[1]}`);
  await checkDisclosure('the wide table');
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

/* A VOID FILLED BY THE ARMED SIZE (Joey 2026-10-28, with his build: placing a 1W·3H shelf into a 1W·3H void, "when i hover
   over the yellow + it flickers between a red+ and a yellow+, making it like a 50/50 chance i can place a shelf or it tries
   to place a 1W-1h to like fill the gap, fighting me"). The void's red slots shared a marker point with the armed spot; armed,
   they now give way to it (stand.js armedSpots). Held over the "+" and nudged a pixel at a time, the hover stays on the
   shelf's spot; a click places the 1W·3H shelf there - with its front lip, a new shelf's default since the same day. */
test('Build: a void the armed size fills shows one "+" there, the hover holds on it, and a click places that shelf with its lip', async () => {
  const rec = { mount: 'tabletop', length: 185, printer: 'xl', faceStyle: 'edgelabel', doorStyle: 'essential', handleStyle: 'deco', feet: 'tpu', buildPlate: 'powder',
    removedStoppers: [], gridW: 7, gridH: 10, sideCovers: true, plateParts: {}, nextId: 24, labelStyle: null, buildId: 'e2evoidflick1',
    placed: [[1, 0, 18, 2, 2], [2, 0, 16, 1, 2], [3, 2, 18, 1, 2], [4, 1, 16, 2, 2], [5, 3, 19, 1, 1], [6, 4, 19, 1, 1], [7, 5, 19, 1, 1],
      [8, 6, 19, 1, 1], [9, 3, 16, 4, 3], [10, 3, 13, 4, 3], [11, 3, 10, 4, 3], [12, 3, 7, 4, 3], [13, 0, 15, 2, 1],
      [14, 0, 14, 2, 1], [15, 2, 15, 1, 1], [16, 2, 14, 1, 1], [18, 0, 8, 2, 6], [19, 0, 7, 3, 1]].map(([id, x, y, w, hh]) => ({ id, x, y, w, hh, fill: 'decor', shelves: 0 })) };
  const b64 = Buffer.from(JSON.stringify(rec), 'utf8').toString('base64');
  const { ctx, page, errors } = await open('build', { query: `#build=${b64}` });
  await page.waitForFunction(() => window.__GEN2_VIEWER__?.manifest?.instances?.length, null, { timeout: 90_000 });
  await page.locator('#ws-lib button.unit', { hasText: 'Shelf' }).first().click();
  await armSize(page, '1W·3H');
  const spots = () => page.evaluate(() => { const out = []; window.__GEN2_VIEWER__.scene.traverse((o) => { if (o.userData.spot && o.userData.ghost) out.push({ ...o.userData.spot, ghost: o.userData.ghost.visible }); }); return out; });
  await page.waitForFunction(() => { let n = 0; window.__GEN2_VIEWER__.scene.traverse((o) => { if (o.userData.spot && !o.userData.spot.kind) n++; }); return n > 0; }, null, { timeout: 30_000 });
  const all = await spots();
  const inVoid = all.filter((s) => s.x === 2 && s.y >= 8 && s.y < 14);
  assert.deepEqual(inVoid.map((s) => [s.kind || 'add', s.x, s.y]), [['add', 2, 8]], `one spot in the void, the shelf's (${JSON.stringify(inVoid)})`);
  // the pointer on that "+", then nudged a pixel at a time: the hover stays on it (before, it flickered with a red slot's)
  const at = await page.evaluate(() => { const S = window.__GEN2_VIEWER__; let g = null; S.scene.traverse((o) => { if (o.userData.spot && !o.userData.spot.kind && o.userData.spot.x === 2 && o.userData.spot.y === 8) g = o; });
    const v = new S.THREE.Vector3(); g.userData.marker.getWorldPosition(v); v.project(S.camera); const r = S.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; });
  const held = [];
  for (let k = 0; k < 12; k++) {
    await page.mouse.move(at.x + (k % 2 ? 1 : -1), at.y + (k % 3) - 1);
    await page.waitForTimeout(60);
    held.push((await spots()).filter((s) => s.ghost).map((s) => `${s.kind || 'add'}@${s.x},${s.y}`).join('+') || 'none');
  }
  assert.ok(held.every((h) => h === 'add@2,8'), `the hover holds on the shelf's spot (${held.join(' ')})`);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.some((p) => p.fill === 'shelf'), null, { timeout: 15_000 })
    .catch(async () => assert.fail(`no shelf placed (${JSON.stringify(await page.evaluate(() => window.__GEN2_STORE__.state.placed.slice(-2)))})`));
  const placed = await page.evaluate(() => window.__GEN2_STORE__.state.placed.filter((p) => p.fill === 'shelf').map(({ x, y, w, hh, lip }) => ({ x, y, w, hh, lip })));
  assert.deepEqual(placed, [{ x: 2, y: 8, w: 1, hh: 6, lip: 'front' }], 'the 1W·3H shelf in the void, its front lip on');
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
  assert.deepEqual(await nullText(page, '#ws-gallery'), [], 'nothing reads "null" under the details (Stealth has no translucent filament)');
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

/* CLASSIC PRO LABELS SHOW THEIR WORDS ON THE MODEL (Joey 2026-10-27: a placed Classic Pro label stayed blank - "it says it
   added the label but i don't see it"). The words come from the Classic Pro generator's own core (js/vendor/classicpro-core.js),
   in the frame measured against the Label_ClassicPro model (label-text.js CLASSICPRO_FRAME). Checked on the stage, in the
   label's own frame (its inner group): the generator's flat top face, mapped by the frame, lands on the model's own corner
   vertices; every vertex of the words lies on that face, no deeper than the text depth and inside it; the badge sits LEFT of
   the words, as the generator centres badge + text (a mirrored frame would put it right); a part label is laid out on Classic
   Pro's own face. SINCE 2026-10-28 both carry their stripe (the Label Studio's Classic Pro stripe, along the bottom edge
   between the slits): three body pieces in place of the model's own body, which together fill exactly the body's box (the
   pieces are in the same frame), the band and its patch spanning the bottom edge between the slits (|x| <= 20.5121). */
test('Classic Pro: a typed label and a part label draw on the Classic Pro label in its measured frame, each with its bottom stripe', async () => {
  const ref = JSON.parse(await readFile(join(root, 'test', 'golden', 'part-label-ref.json'), 'utf8')).items[0].item;
  const rec = { mount: 'tabletop', length: 185, printer: 'any', faceStyle: 'classicpro', doorStyle: 'essential', handleStyle: 'deco', feet: 'tpu', buildPlate: 'powder',
    removedStoppers: [], gridW: 6, gridH: 2, nextId: 3, labelStyle: null, buildId: 'e2ecptext0001', sideCovers: true, plateParts: {},
    placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, label: 'Torx bits' }, { id: 2, x: 2, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, label: 'M5 × 20' }],
    labelList: { format: 'modulith-labels', version: 1, labels: [
      { text: 'Torx bits', id: 'e2ecplabel0001', colours: { band: { colour: 'green', hex: '#009E73', label: 'Green', pattern: 'solid' } } },
      { text: 'M5 × 20', id: 'e2ecplabel0002', hardware: ref }] },
    labelAssign: { 1: 'e2ecplabel0001', 2: 'e2ecplabel0002' } };
  const b64 = Buffer.from(JSON.stringify(rec), 'utf8').toString('base64');
  const { ctx, page, errors } = await open('build', { query: `&done=off#build=${b64}` });
  await page.waitForFunction(() => { const S = window.__GEN2_VIEWER__; return S.build.faceStyle === 'classicpro'
    && [...S.instances.values()].filter((i) => i.cfg.node === 'Label_ClassicPro' && i.group.children[0]?.children.some((o) => o.name === 'LabelText')).length === 2; }, null, { timeout: 90_000 })
    .catch(async () => assert.fail(`the two Classic Pro labels did not get their words (${await page.evaluate(() => [...window.__GEN2_VIEWER__.instances.values()].filter((i) => /^Label_/.test(i.cfg.node)).map((i) => i.cfg.node + ':' + i.group.children[0]?.children.map((o) => o.name).join('/')).join(' '))})`));
  const r = await page.evaluate(() => {
    const S = window.__GEN2_VIEWER__, V = S.THREE.Vector3;
    const R2 = Math.SQRT1_2, map = (x, y) => [x, 9.0061 + (y + 1.5) * R2, -0.5562 + (1.5 - y) * R2];   // (x, y, 1.5) through the frame
    const n = [0, R2, R2];
    return [...S.instances.values()].filter((i) => i.cfg.node === 'Label_ClassicPro').map((inst) => {
      const inner = inst.group.children[0];
      inner.updateWorldMatrix(true, true);
      const inv = inner.matrixWorld.clone().invert();
      const pts = (o) => { const p = o.geometry.getAttribute('position'), m = inv.clone().multiply(o.matrixWorld), out = []; for (let k = 0; k < p.count; k++) out.push(new V().fromBufferAttribute(p, k).applyMatrix4(m)); return out; };
      const body = []; inner.traverse((o) => { if (o.isMesh && !['LabelText', 'LabelBadge', 'LabelPiece'].includes(o.name)) body.push(...pts(o)); });
      const near = (q) => Math.min(...body.map((v) => Math.hypot(v.x - q[0], v.y - q[1], v.z - q[2])));
      const corners = [[-22.2121, 11.4134], [22.2121, 11.4134], [-22.2121, -12.7366], [22.2121, -12.7366]].map(([x, y]) => +near(map(x, y)).toFixed(4));
      const o0 = map(0, 0);
      const ink = inner.children.filter((o) => o.name === 'LabelText' || o.name === 'LabelBadge');
      let dMin = Infinity, dMax = -Infinity, xMin = Infinity, xMax = -Infinity, inPlane = true;
      const cx = {};
      for (const o of ink) {
        const ps = pts(o); let sx = 0;
        for (const v of ps) {
          const d = (v.x - o0[0]) * n[0] + (v.y - o0[1]) * n[1] + (v.z - o0[2]) * n[2];
          const u = (v.y - o0[1]) * R2 - (v.z - o0[2]) * R2;   // the label's own y, up the face
          dMin = Math.min(dMin, d); dMax = Math.max(dMax, d); xMin = Math.min(xMin, v.x); xMax = Math.max(xMax, v.x); sx += v.x;
          if (Math.abs(v.x) > 22.22 || u > 11.42 || u < -12.74) inPlane = false;
        }
        cx[o.name] = sx / ps.length;
      }
      // the stripe: its pieces' box against the model body's own box (the same frame fills the same box), and where the band runs
      const box = (vs) => { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const v of vs) { b[0] = Math.min(b[0], v.x); b[1] = Math.min(b[1], v.y); b[2] = Math.min(b[2], v.z); b[3] = Math.max(b[3], v.x); b[4] = Math.max(b[4], v.y); b[5] = Math.max(b[5], v.z); } return b; };
      const pieceMeshes = inner.children.filter((o) => o.name === 'LabelPiece');
      const pb = box(pieceMeshes.flatMap(pts)), bb = box(body);
      const bandX = box(pieceMeshes.filter((o) => o.userData.labelPiece !== 'base').flatMap(pts));
      const shown = []; inner.traverse((o) => { if (o.isMesh && !['LabelText', 'LabelBadge', 'LabelPiece'].includes(o.name) && o.visible) shown.push(o.name); });
      return { unit: S.instances.get(inst.cfg.rides)?.cfg.owner, corners, dMin: +dMin.toFixed(3), dMax: +dMax.toFixed(3), x: [+xMin.toFixed(2), +xMax.toFixed(2)], inPlane, cx,
        part: ink.some((o) => o.userData.partLabel), pieces: pieceMeshes.map((o) => o.userData.labelPiece + ':' + (o.userData.zone || 'body')).join(','), words: ink.map((o) => o.userData.labelText)[0],
        boxGap: +Math.max(...pb.map((v, k) => Math.abs(v - bb[k]))).toFixed(4), bandX: [+bandX[0].toFixed(3), +bandX[3].toFixed(3)], bodyShown: shown.length };
    });
  });
  const typed = r.find((x) => !x.part), part = r.find((x) => x.part);
  const j = JSON.stringify(r);
  assert.ok(typed && part, `one typed label and one part label (${j})`);
  for (const x of r) {
    assert.ok(x.corners.every((d) => d < 0.02), `the generator's top-face corners land on the model's own vertices (${j})`);
    assert.ok(x.dMin > -0.01 && x.dMax < 0.8 && x.inPlane, `the ink stands on the label's face, inside it (${j})`);
    assert.ok(x.boxGap < 0.01 && x.bodyShown === 0, `the stripe's three pieces stand in for the model body, filling its box (${j})`);
    assert.ok(x.bandX[0] >= -20.52 && x.bandX[1] <= 20.52 && x.bandX[1] > 20.4, `the band runs the bottom edge between the slits (${j})`);
  }
  // the stripe zones name their meanings since the label palette (2026-10-28): drawn in this build's spool for each
  assert.equal(typed.pieces, 'base:body,band:STRIPE@green,accent:STRIPE@green', `the typed label's green stripe (${j})`);
  assert.equal(part.pieces, 'base:body,band:STRIPE@sky-blue,accent:STRIPE@white', `the part label's Picker colours: metric band, stainless patch (${j})`);
  assert.ok(typed.words === 'TORX BITS' && typed.cx.LabelBadge < typed.cx.LabelText, `the typed label: its words, the predicted badge LEFT of them (${j})`);
  assert.ok(part.dMax < 0.5, `the part label's ink at its own depth (0.45 mm) (${j})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE CLASSIC PRO CORE MAY FAIL ALONE (Sol 01a17faa): its script loads beside EdgeLabel's, and a failed load must not take
   EdgeLabel's words with it. With classicpro-core.js refused, an EdgeLabel drawer still shows its label. */
test('Classic Pro core refused: an EdgeLabel label still shows its words', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  contexts.add(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
  await ctx.route(/classicpro-core\.js/, (r) => r.abort());
  const rec = { mount: 'tabletop', length: 185, printer: 'any', faceStyle: 'edgelabel', doorStyle: 'essential', handleStyle: 'deco', feet: 'tpu', buildPlate: 'powder',
    removedStoppers: [], gridW: 6, gridH: 2, nextId: 2, labelStyle: null, buildId: 'e2ecpfail0001', sideCovers: true, plateParts: {},
    placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, label: 'Hex keys' }],
    labelList: { format: 'modulith-labels', version: 1, labels: [{ text: 'Hex keys', id: 'e2ecpfaillab1' }] }, labelAssign: { 1: 'e2ecpfaillab1' } };
  const { page, errors } = await open('build', { context: ctx, query: `&done=off#build=${Buffer.from(JSON.stringify(rec), 'utf8').toString('base64')}` });
  await page.waitForFunction(() => [...window.__GEN2_VIEWER__.instances.values()].some((i) => i.cfg.node === 'Label_EdgeLabel' && i.group.children[0]?.children.some((o) => o.name === 'LabelText' && o.userData.labelText === 'HEX KEYS')), null, { timeout: 90_000 })
    .catch(() => assert.fail('the EdgeLabel label went blank with the Classic Pro core refused'));
  assert.deepEqual(errors.filter((e) => /^pageerror/.test(e)), [], 'no page errors');
  await ctx.close();
});

/* A PART LABEL'S STRIPE (Joey 2026-10-27, of a Part Picker label: "i can't figure out after the fact how to add like a colored
   stripe?"). On EdgeLabel the editor's Stripe row offers the part's own colours (the Part Picker's, the default), None and the
   six colours, stored as the Label Studio stores them: no `colours`, `colours: null`, or the stripe. On the model a part label
   with `colours: null` draws no stripe pieces, the same part with its own colours does. */
test('Labels: a part label\'s stripe - its own colours, None or one of the six - in the editor and on the model', async () => {
  const ref = JSON.parse(await readFile(join(root, 'test', 'golden', 'part-label-ref.json'), 'utf8')).items[0].item;   // M5 x 20 SHCS: metric blue + A2
  const rec = { mount: 'tabletop', length: 185, printer: 'any', faceStyle: 'edgelabel', doorStyle: 'essential', handleStyle: 'deco', feet: 'tpu', buildPlate: 'powder',
    removedStoppers: [], gridW: 6, gridH: 2, nextId: 3, labelStyle: null, buildId: 'e2epartstripe1', sideCovers: true, plateParts: {},
    placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, label: 'M5 × 20' }, { id: 2, x: 2, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, label: 'M5 × 20' }],
    labelList: { format: 'modulith-labels', version: 1, labels: [
      { text: 'M5 × 20', id: 'e2epartstripe01', hardware: ref },                  // on drawer 1: its own colours
      { text: 'M5 × 20', id: 'e2epartstripe02', hardware: ref, colours: null },   // on drawer 2: no stripe
      { text: 'M5 × 20', id: 'e2epartstripe03', hardware: ref }] },              // waiting: edited in the panel
    labelAssign: { 1: 'e2epartstripe01', 2: 'e2epartstripe02' } };
  const { ctx, page, errors } = await open('labels', { query: `&done=off#build=${Buffer.from(JSON.stringify(rec), 'utf8').toString('base64')}` });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  // the model: pieces on drawer 1's label (its own colours), none on drawer 2's (null)
  const pieces = (owner) => page.evaluate((o) => { const v = window.__GEN2_VIEWER__;
    const lab = [...v.instances.values()].find((i) => i.cfg.node === 'Label_EdgeLabel' && v.instances.get(i.cfg.rides)?.cfg.owner === o);
    return lab ? lab.group.children[0].children.filter((x) => x.name === 'LabelPiece').length : -1; }, owner);
  await page.waitForFunction(() => [...window.__GEN2_VIEWER__.instances.values()].filter((i) => i.cfg.node === 'Label_EdgeLabel' && i.group.children[0]?.children.some((x) => x.name === 'LabelText')).length === 2, null, { timeout: 90_000 })
    .catch(() => assert.fail('the two part labels did not draw'));
  assert.ok(await pieces(1) > 0, `drawer 1: its own colours draw the stripe pieces (${await pieces(1)})`);
  assert.equal(await pieces(2), 0, 'drawer 2: colours null draws no stripe');
  // the editor, on the waiting label
  await page.locator('#ws-labels button.mini[title="Edit this label"]').first().click();
  await page.waitForSelector('#ws-labeledit .swatches', { timeout: 15_000 });
  const row = () => page.evaluate(() => [...document.querySelectorAll('#ws-labeledit .swatches button')].map((b) => b.getAttribute('aria-label') + (b.getAttribute('aria-pressed') === 'true' ? ' *' : '')));
  const label = () => page.evaluate(() => { const l = window.__GEN2_STORE__.state.labelList.labels.find((x) => x.id === 'e2epartstripe03'); return 'colours' in l ? l.colours : 'absent'; });
  assert.deepEqual(await row(), ['Stripe: the part’s own colours *', 'No stripe', 'Stripe: Metric', 'Stripe: SAE / inch', 'Stripe: Yellow', 'Stripe: White', 'Stripe: Green', 'Stripe: Purple'], 'the part\'s own first, pressed');
  await page.locator('#ws-labeledit button[aria-label="No stripe"]').click();
  await page.waitForFunction(() => window.__GEN2_STORE__.state.labelList.labels.find((x) => x.id === 'e2epartstripe03').colours === null, null, { timeout: 15_000 })
    .catch(async () => assert.fail(`None did not store colours: null (${JSON.stringify(await label())})`));
  await page.locator('#ws-labeledit button[aria-label="Stripe: Green"]').click();
  await page.waitForFunction(() => window.__GEN2_STORE__.state.labelList.labels.find((x) => x.id === 'e2epartstripe03').colours?.band?.hex === '#009E73', null, { timeout: 15_000 })
    .catch(async () => assert.fail(`Green did not land (${JSON.stringify(await label())})`));
  await page.locator('#ws-labeledit button[aria-label="Stripe: the part’s own colours"]').click();
  await page.waitForFunction(() => !('colours' in window.__GEN2_STORE__.state.labelList.labels.find((x) => x.id === 'e2epartstripe03')), null, { timeout: 15_000 })
    .catch(async () => assert.fail(`the part's own did not clear colours (${JSON.stringify(await label())})`));
  assert.ok((await row())[0].endsWith('*'), 'the part\'s own reads pressed again');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE LABEL PALETTE (Joey 2026-10-28; docs/redesign/LABEL-PALETTE.md): a stripe stores its meaning as the Label Studio stores
   it, and the build's label palette says which spool prints that meaning. Ready-made (the suggested spools, null in the
   record); "Use my filaments" swaps one, which repaints the stripe, rides in the record and the address, and undoes as one
   step; the filament list names the spool; White on the white body is warned about, never blocked. */
const paletteRec = (id, labelPalette = null) => ({ mount: 'tabletop', length: 185, printer: 'any', faceStyle: 'edgelabel', doorStyle: 'essential', handleStyle: 'deco', feet: 'tpu', buildPlate: 'powder',
  removedStoppers: [], gridW: 6, gridH: 2, nextId: 3, labelStyle: null, buildId: id, sideCovers: true, plateParts: {}, labelPalette,
  placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, label: 'M3 screws' }, { id: 2, x: 2, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, label: 'Stainless' }],
  labelList: { format: 'modulith-labels', version: 1, labels: [
    { text: 'M3 screws', id: id + '01', colours: { band: { colour: 'sky-blue', hex: '#56B4E9', label: 'Metric', pattern: 'solid' } } },
    { text: 'Stainless', id: id + '02', colours: { band: { colour: 'white', hex: '#F4F4F2', label: 'White', pattern: 'solid' } } }] },
  labelAssign: { 1: id + '01', 2: id + '02' } });
const hashOfRec = (rec) => `#build=${Buffer.from(JSON.stringify(rec), 'utf8').toString('base64')}`;
// the band piece of a drawer's label: its zone and the colour it is drawn in
const bandOf = (page, owner) => page.evaluate((o) => { const v = window.__GEN2_VIEWER__;
  const lab = [...v.instances.values()].find((i) => i.cfg.node === 'Label_EdgeLabel' && v.instances.get(i.cfg.rides)?.cfg.owner === o);
  const m = lab && lab.group.children[0].children.find((x) => x.name === 'LabelPiece' && x.userData.labelPiece === 'band');
  return m ? { zone: m.userData.zone, hex: m.material.color.getHexString() } : null; }, owner);
const waitBands = (page) => page.waitForFunction(() => [...window.__GEN2_VIEWER__.instances.values()].filter((i) => i.cfg.node === 'Label_EdgeLabel' && i.group.children[0]?.children.some((x) => x.name === 'LabelPiece')).length === 2, null, { timeout: 90_000 })
  .catch(() => assert.fail('the two striped labels did not draw'));
const waitBandHex = (page, owner, hex, why) => page.waitForFunction(([o, h]) => { const v = window.__GEN2_VIEWER__;
  const lab = [...v.instances.values()].find((i) => i.cfg.node === 'Label_EdgeLabel' && v.instances.get(i.cfg.rides)?.cfg.owner === o);
  const m = lab && lab.group.children[0].children.find((x) => x.name === 'LabelPiece' && x.userData.labelPiece === 'band');
  return m && m.material.color.getHexString() === h; }, [owner, hex], { timeout: 30_000 }).catch(async () => assert.fail(`${why}: ${JSON.stringify(await bandOf(page, owner))}`));

test('Labels: the label palette - a stripe prints in its meaning\'s spool, a swap repaints it, rides in the record, undoes and survives a reload', async () => {
  const { ctx, page, errors } = await open('labels', { query: '&done=off' + hashOfRec(paletteRec('e2elabpal1')) });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await waitBands(page);
  // ready-made: the record has no palette, the Metric stripe draws in the suggested spool (Polar Light Blue), by meaning
  assert.equal((await S(page)).labelPalette, null);
  assert.deepEqual(await bandOf(page, 1), { zone: 'STRIPE@sky-blue', hex: '14addb' }, 'Metric in the v1 spool, not the scheme hex 56b4e9');
  assert.equal((await S(page)).labelList.labels[0].colours.band.hex, '#56B4E9', 'the label still stores the Studio\'s scheme colour');
  // the section: six meanings, body and text; the White stripe on the white body is noted, nothing is blocked
  await page.locator('#ws-labels details.palette summary').click();
  assert.equal(await page.locator('#ws-labels .palette .prow').count(), 8);
  assert.match(await page.locator('#ws-labels .palette .pnote[data-key="white"]').first().textContent(), /White is hard to see on the label body/);
  assert.equal(await page.locator('#ws-labels .palette .pnote').count(), 1, 'the suggested set warns about White only');
  // swap Metric for Panchroma Aqua Blue
  await page.locator('#ws-labels .palette button.mine').click();
  await page.locator('#ws-labels .palette button.prow[data-key="sky-blue"]').click();
  await page.locator('#ws-labels .palette .ppick input.search').fill('Aqua Blue');
  await page.locator('#ws-labels .palette .pitem[title="Panchroma Aqua Blue"]').click();
  await page.waitForFunction(() => window.__GEN2_STORE__.state.labelPalette?.spools?.['sky-blue']?.name === 'Panchroma Aqua Blue', null, { timeout: 15_000 })
    .catch(async () => assert.fail(`the swap did not reach the record (${JSON.stringify((await S(page)).labelPalette)})`));
  await waitBandHex(page, 1, '5cc6e0', 'the Metric stripe did not repaint in Panchroma Aqua Blue');
  assert.equal((await bandOf(page, 2)).hex, 'efefea', 'the White stripe kept its spool');
  // the filament list names the spool (identity, not a hex), with its buy link
  const fil = await page.evaluate(() => window.__GEN2_VIEWER__.filamentsInBuild().filaments.find((f) => f.keys.includes('Label:STRIPE@sky-blue')));
  assert.equal(fil && fil.name, 'Panchroma Aqua Blue');
  assert.match(fil.url || '', /^https:/);
  // one undo step back to the suggestions, and redo
  await page.evaluate(() => window.__GEN2_STORE__.undo());
  await waitBandHex(page, 1, '14addb', 'undo did not repaint the stripe');
  assert.equal((await S(page)).labelPalette, null);
  await page.evaluate(() => window.__GEN2_STORE__.redo());
  await waitBandHex(page, 1, '5cc6e0', 'redo did not repaint the stripe');
  // the address carries it: a reload opens the swapped palette
  await page.waitForFunction(() => { const m = /#build=([^&]+)/.exec(location.hash); if (!m) return false; try { return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))).labelPalette?.spools?.['sky-blue']?.name === 'Panchroma Aqua Blue'; } catch { return false; } }, null, { timeout: 15_000 })
    .catch(() => assert.fail('the address does not carry the palette'));
  await page.reload({ waitUntil: 'load' });
  await waitBoot(page);
  await waitBands(page);
  await waitBandHex(page, 1, '5cc6e0', 'the reload lost the palette');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Labels: a shared link shows the sender\'s label palette; the recipient\'s defaults are offered, used as one undo step, and seed a new build', async () => {
  const DEFAULTS = { v: 1, spools: { 'sky-blue': { name: 'Panchroma Azure Blue', hex: '#2e8fdc' } }, body: { name: 'Panchroma Cream', hex: '#f1e7cf' } };
  const ctx = await freshContext();
  await ctx.addInitScript((d) => { try { if (!sessionStorage.getItem('e2e-defaults-set')) { localStorage.setItem('gen2-label-palette', JSON.stringify(d)); sessionStorage.setItem('e2e-defaults-set', '1'); } } catch {} }, DEFAULTS);
  const sender = { v: 1, spools: { 'sky-blue': { name: 'Panchroma Aqua Blue', hex: '#5cc6e0' } } };
  const { page, errors } = await open('labels', { context: ctx, query: '&done=off' + hashOfRec(paletteRec('e2elabpal2', sender)) });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await waitBands(page);
  // the sender's palette, untouched by the recipient's defaults
  await waitBandHex(page, 1, '5cc6e0', 'the recipient does not see the sender\'s Metric spool');
  assert.deepEqual((await S(page)).labelPalette, sender);
  const bodyWas = await page.evaluate(() => window.__GEN2_VIEWER__.palette().colors.Label?.name);
  // the offer, then "Use them here": the stripes and the body change together, as ONE undo step
  await page.locator('#ws-labels details.palette summary').click();
  await page.locator('#ws-labels .palette .offer button').click();
  await waitBandHex(page, 1, '2e8fdc', 'the defaults did not reach the stripe');
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.palette().colors.Label?.name), 'Panchroma Cream', 'the default body');
  assert.equal(await page.locator('#ws-labels .palette .offer').count(), 0, 'nothing left to offer');
  await page.evaluate(() => window.__GEN2_STORE__.undo());
  await waitBandHex(page, 1, '5cc6e0', 'one undo did not return the sender\'s stripe');
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.palette().colors.Label?.name), bodyWas, 'the same undo returned the body');
  assert.deepEqual(clean(errors), []);
  // a NEW build in this browser starts with the defaults: the record's spool and the body
  const fresh = await ctx.newPage();
  await fresh.goto(`${base}/index.html?ws=labels&debug=1&done=off&new=1`, { waitUntil: 'load', timeout: 90_000 });
  await waitBoot(fresh);
  const st = await S(fresh);
  assert.equal(st.labelPalette?.spools?.['sky-blue']?.name, 'Panchroma Azure Blue', 'a new build takes the default Metric spool');
  assert.equal(st.labelPalette?.spools?.red?.name, 'Printed Solid Safety Orange', 'and the suggestion where the defaults name none');
  assert.equal(await fresh.evaluate(() => window.__GEN2_VIEWER__.palette().colors.Label?.name), 'Panchroma Cream', 'and the default body');
  await ctx.close();
});

/* A TYPED LABEL'S STRIPE, AND CLASSIC PRO'S PRINT SETTINGS (Joey 2026-10-27: "if i'm manually typing a label i don't see how to
   set a color for the label stripe"; the part label stripe's wording "feels specific to edgelabel labels and odd for this
   classic pro label"). The editor's Stripe row: the Label Studio's colours, stored on the label as the Studio stores it, and
   None takes it off. On Classic Pro the row is offered too since 2026-10-28 (its one stripe, along the bottom edge), and the
   settings give a plain On / Off stripe switch - never EdgeLabel's position names - beside the drawings switch */
test('Labels: a typed label takes a stripe colour in the editor and None takes it off; Classic Pro offers the stripe with an On / Off switch', async () => {
  const { ctx, page, errors } = await open('labels');
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Switch to EdgeLabel')); if (b) b.click(); });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 90_000 });
  await btn(page, 'Type a label', '#ws-labels').click();
  await page.fill('#ws-modal input.field', 'M3 screws');
  await btn(page, 'Add label', '#ws-modal .box').click();
  await page.locator('#ws-labels button.mini[title="Edit this label"]').first().click();
  await page.waitForSelector('#ws-labeledit .swatches', { timeout: 15_000 });
  const stripe = () => page.evaluate(() => { const l = window.__GEN2_STORE__.state.labelList.labels[0]; return l.colours ? l.colours.band.colour : null; });
  assert.equal(await stripe(), null, 'the control: a typed label starts with no stripe');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#ws-labeledit .swatches button')].map((b) => b.getAttribute('aria-label'))),
    ['No stripe', 'Stripe: Metric', 'Stripe: SAE / inch', 'Stripe: Yellow', 'Stripe: White', 'Stripe: Green', 'Stripe: Purple'], 'None and the Label Studio\'s six colours');
  await page.locator('#ws-labeledit button[aria-label="Stripe: Green"]').click();
  await page.waitForFunction(() => window.__GEN2_STORE__.state.labelList.labels[0].colours?.band?.hex === '#009E73', null, { timeout: 15_000 })
    .catch(async () => assert.fail(`Green did not land on the label (${JSON.stringify(await page.evaluate(() => window.__GEN2_STORE__.state.labelList.labels[0]))})`));
  assert.equal(await page.getAttribute('#ws-labeledit button[aria-label="Stripe: Green"]', 'aria-pressed'), 'true', 'the picked swatch reads pressed');
  await page.locator('#ws-labeledit button[aria-label="No stripe"]').click();
  await page.waitForFunction(() => !('colours' in window.__GEN2_STORE__.state.labelList.labels[0]), null, { timeout: 15_000 })
    .catch(async () => assert.fail(`None left a stripe (${JSON.stringify(await page.evaluate(() => window.__GEN2_STORE__.state.labelList.labels[0]))})`));
  // Classic Pro: the same label's editor offers the stripe row; the settings an On / Off stripe switch, not the position select
  await page.evaluate(async () => { const v = window.__GEN2_VIEWER__; await v.applyFaceplateStyle(v.availableFaceplateStyles().find((x) => x.key === 'classicpro')); v.setDims(false); window.__GEN2_STORE__.load(v.build, 'adopt'); });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'classicpro', null, { timeout: 60_000 });
  await page.locator('#ws-labels button.mini[title="Edit this label"]').first().click();
  await page.waitForSelector('#ws-labeledit input.words', { timeout: 15_000 });
  await page.locator('#ws-labels details.settings summary').click();
  const cp = await page.evaluate(() => ({ swatches: document.querySelectorAll('#ws-labeledit .swatches button').length, select: !!document.querySelector('#ws-labels select[aria-label="Part label stripe"]'),
    onOff: [...document.querySelectorAll('#ws-labels [role="group"][aria-label="Part label stripe"] button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')),
    drawings: !!document.querySelector('#ws-labels [aria-label="Screw and nut drawings"]'), note: document.querySelector('#ws-labels details.settings').textContent }));
  assert.ok(cp.swatches === 7 && !cp.select && cp.drawings && /Classic Pro part labels print the words and the part’s drawing/.test(cp.note) && /along the bottom edge, between the springy slits/.test(cp.note),
    `Classic Pro: the stripe row, the drawings switch and the bottom-edge line, no position select (${JSON.stringify(cp)})`);
  assert.deepEqual(cp.onOff, ['Off', 'On*'], `the stripe On by default (${JSON.stringify(cp)})`);
  await page.locator('#ws-labeledit button[aria-label="Stripe: Green"]').click();
  await page.waitForFunction(() => window.__GEN2_STORE__.state.labelList.labels[0].colours?.band?.hex === '#009E73', null, { timeout: 15_000 })
    .catch(async () => assert.fail(`Green did not land on the Classic Pro label (${JSON.stringify(await page.evaluate(() => window.__GEN2_STORE__.state.labelList.labels[0]))})`));
  // Off from the switch: the browser's printing choice, and the line says so
  await page.locator('#ws-labels [role="group"][aria-label="Part label stripe"] button', { hasText: 'Off' }).click();
  await page.waitForFunction(() => /two filaments, the base and the words/.test(document.querySelector('#ws-labels details.settings')?.textContent || ''), null, { timeout: 15_000 })
    .catch(async () => assert.fail(`Off did not take (${await page.evaluate(() => document.querySelector('#ws-labels details.settings')?.textContent)})`));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Labels: EdgeLabel, typed labels, Place several onto two drawers, Fill, the panel Undo, a labels link', async () => {
  const { ctx, page, errors } = await open('labels');
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Switch to EdgeLabel')); if (b) b.click(); });
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

/* PART RENDERS IN THE LIST (Joey 2026-10-27: "why not include BOM thumbnail images for each part, we should have them?"):
   every row has a frame beside its chip, 8 px or more from it; a row with a render shows it loaded from the parts host, and
   the only rows without one are the bought parts nobody has photographed (parts.js partThumb). The phone sheet takes the
   frame without running wider than itself, at Joey's S23 sizes, and paper leaves the renders off */
test('Parts: a part render beside every row\'s chip, loaded; the phone sheet holds it; paper leaves it off', async () => {
  const NO_RENDER = /socket head screw|hex nut|Adhesive rubber feet/;
  const look = async (page, paper = false) => {
    if (!paper) for (const img of await page.locator('#ws-parts .thumb img').all()) await img.scrollIntoViewIfNeeded();   // the renders load lazily
    await page.waitForFunction(() => [...document.querySelectorAll('#ws-parts .thumb img')].every((i) => i.complete), null, { timeout: 30_000 }).catch(() => {});
    return page.evaluate(() => {
      const panel = document.getElementById('ws-parts'), pb = panel.getBoundingClientRect();
      const rows = [...panel.querySelectorAll('.prow')].map((row) => {
        const t = row.querySelector('.thumb'), img = t && t.querySelector('img'), r = row.getBoundingClientRect();
        const tb = t && t.getBoundingClientRect(), cb = row.querySelector('.chip').getBoundingClientRect(), mb = row.querySelector('.mid').getBoundingClientRect();
        return { name: row.querySelector('.name').textContent, buy: !!row.querySelector('.chip.buy'), thumb: !!t, img: !!img, loaded: !!(img && img.complete && img.naturalWidth > 0),
          w: tb ? Math.round(tb.width) : 0, gap: tb ? Math.round(tb.left - cb.right) : null, mid: Math.round(mb.width), inside: r.right <= pb.right + 0.5 && (!tb || tb.left >= r.left - 0.5) };
      });
      return { rows, overflow: panel.scrollWidth - panel.clientWidth, shown: [...panel.querySelectorAll('.thumb')].filter((t) => getComputedStyle(t).display !== 'none').length };
    });
  };
  const check = (v, size, where) => {
    assert.ok(v.rows.length >= 5, `${where}: rows listed`);
    const bad = v.rows.filter((r) => !r.thumb || r.w !== size || r.gap < 8 || !r.inside || (r.img ? !r.loaded : !((r.buy && NO_RENDER.test(r.name)) || /^Essential Decor Faceplate - /.test(r.name))));
    assert.deepEqual(bad, [], `${where}: a ${size} px frame on every row, 8 px from the chip, inside the row; a render loaded on every row but the unphotographed bought parts`);
    assert.ok(v.rows.filter((r) => r.loaded).length >= v.rows.length - 4, `${where}: renders on all but a few bought parts (${v.rows.filter((r) => !r.loaded).map((r) => r.name)})`);
    assert.ok(v.overflow <= 1, `${where}: the list no wider than its panel (${v.overflow} px over)`);
  };
  const { ctx, page, errors } = await open('parts');
  await page.waitForSelector('#ws-parts .prow', { timeout: 30_000 });
  check(await look(page), 36, 'desktop');
  await page.emulateMedia({ media: 'print' });
  assert.equal((await look(page, true)).shown, 0, 'no renders on paper');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
  for (const viewport of [{ width: 360, height: 675 }, { width: 780, height: 260 }]) {   // Joey's S23, portrait and landscape
    const ph = await open('parts', { phone: true, viewport });
    await ph.page.waitForSelector('#ws-parts .prow', { state: 'attached', timeout: 30_000 });
    if (!(await ph.page.evaluate(() => document.querySelector('#ws-parts').classList.contains('open')))) await ph.page.locator('#ws-parts .sheet-handle').tap();
    await settle(ph.page, 600);
    const v = await look(ph.page);
    check(v, 32, `${viewport.width}x${viewport.height}`);
    assert.ok(v.rows.every((r) => r.mid >= 120), `${viewport.width}x${viewport.height}: the names keep room (${v.rows.map((r) => r.mid)})`);
    // tracking adds a counters line to every row: it stays inside the row, and the badge and the link still share theirs
    await ph.page.locator('#ws-parts button:has-text("Track my build")').tap();
    await settle(ph.page, 400);
    const t = await ph.page.evaluate(() => [...document.querySelectorAll('#ws-parts .prow')].map((row) => {
      const r = row.getBoundingClientRect(), b = row.querySelector(':scope > .badge'), l = row.querySelector(':scope > .link');
      const out = [...row.querySelectorAll('.progress > *')].map((e) => Math.round(e.getBoundingClientRect().right - r.right)).filter((d) => d > 1);
      return { name: row.querySelector('.name').textContent, out, apart: !!(b && l) && Math.abs(b.getBoundingClientRect().top - l.getBoundingClientRect().top) > 12 };
    }).filter((x) => x.out.length || x.apart));
    assert.deepEqual(t, [], `${viewport.width}x${viewport.height}: tracking's counters inside the row, the badge beside the link`);
    assert.deepEqual(clean(ph.errors), []);
    await ph.ctx.close();
  }
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
  // Share on the end page copies the address and says so where it can be seen: the toast sat behind the player card on
  // the desktop (Joey, 2026-10-23: "the share button at the end of the instructions does nothing")
  await page.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = async (t) => { window.__copied = String(t); }; });
  await btn(page, 'Share', '#ws-player').click();
  await page.waitForFunction(() => document.getElementById('ws-toast')?.classList.contains('show'), null, { timeout: 5_000 });
  // the toast takes no pointer events, so elementFromPoint never names it: its box must clear the card's top edge instead
  const shared = await page.evaluate(() => { const t = document.getElementById('ws-toast'); const r = t.getBoundingClientRect(); const pl = document.getElementById('ws-player').getBoundingClientRect();
    return { copied: window.__copied === location.href, text: t.textContent, above: r.bottom <= pl.top, inView: r.top >= 0 && r.height > 0, gap: Math.round(pl.top - r.bottom) }; });
  assert.deepEqual({ copied: shared.copied, text: shared.text, above: shared.above, inView: shared.inView }, { copied: true, text: 'Link copied.', above: true, inView: true }, `Share copies the link and its toast shows above the player, inside the viewport: ${JSON.stringify(shared)}`);
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
test('Assemble: the Done scene is off with ?done=off; on for every visitor (no flag) the room comes on at Done, survives a theme flip and a tier change, and Back restores the stage', { skip: ROOM_SOFT_SKIP }, async () => {
  const toDone = async (page) => {
    await btn(page, 'Skip to the finished build', '#ws-steps').click();
    await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
    await btn(page, 'Next', '#ws-player').click();
    await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  };
  const state = (page) => page.evaluate(async () => { const v = window.__GEN2_VIEWER__, THREE = await import('three'); const vis = [], masks = []; let disc = null; v.scene.traverse((o) => { if (o.isMesh && o.userData.doneRoom) { if (o.material.isShadowMaterial) vis.push(o.visible); else if (o.material.map && o.material.map.isCanvasTexture) disc = o.visible; } if (o.userData.doneShadow) masks.push({ ...o.userData.doneShadow, visible: o.visible, multiply: o.material.blending === THREE.CustomBlending && o.material.blendSrc === THREE.ZeroFactor && o.material.blendDst === THREE.SrcColorFactor && o.material.blendEquation === THREE.AddEquation, transparent: o.material.transparent, depthWrite: o.material.depthWrite, toneMapped: o.material.toneMapped, order: o.renderOrder, colorSpace: o.material.map ? o.material.map.colorSpace : null, x: o.position.x, y: o.position.y, z: o.position.z, w: o.geometry.parameters.width }); }); const catcher = vis.length ? (vis.every(Boolean) ? true : vis.some(Boolean) ? 'mixed' : false) : null; const bb = v.assembledBox, rm = v.scene.getObjectByName('done-room'), wa = rm && rm.getObjectByName('anchor_wall'); return { catchers: vis.length, masks, anchorX: (bb.min.x + bb.max.x) / 2, anchorZ: bb.min.z, wallZ: wa ? wa.getWorldPosition(wa.position.clone()).z : null, held: v.sceneHeld, room: !!v.scene.getObjectByName('done-room'), done: document.documentElement.dataset.done || null, bg: v.scene.background ? (v.scene.background.isColor ? 'color' : 'other') : null, env: !!v.scene.environment, envIsStudio: v.scene.environment === v.studioEnv(), controls: v.controls.enabled, grid: v.grid.visible, table: v.table.visible, dims: !!v.dimsOn, shadow: v.renderer.shadowMap.enabled, catcher, disc, quality: v.quality, theme: v.stageTheme, sunHalfDeg: v.sunHalfDeg, sunMM: Math.round(v.sun.position.distanceTo(v.sun.target.position)), shadowFar: v.sun.shadow.camera.far }; });
  // off (?done=off, which the open helper adds for every case that does not ask for the room): nothing of the room
  const off = await open('assemble', { query: '&done=off' });
  await toDone(off.page);
  await settle(off.page, 1500);
  const s0 = await state(off.page);
  assert.equal(s0.room, false, 'no room with ?done=off'); assert.equal(s0.held, false); assert.equal(s0.done, null); assert.equal(s0.controls, true);
  assert.equal(await off.page.locator('#ws-player button', { hasText: 'Watch the final scene' }).count(), 0, 'no way into a scene with ?done=off');
  assert.match(await text(off.page, '#ws-player .next'), /Finished/, 'the Next slot says Finished, as before');
  assert.deepEqual(clean(off.errors), []);
  await off.ctx.close();
  // on: the End page first (the HUD, the finished build on the stage, the way in), then the scene: the room, the holds,
  // the HUD faded, the bars, the strip, no orbit (THE FINAL SCENE, Joey 2026-10-23: "a final scene that you have to make
  // obvious to go into ... most of the hud disappears and black borders appear ... don't let them rotate the camera")
  // on, as every visitor opens it since Joey's go of 2026-10-26 ("drop the ?done=room flag"): no flag in the address
  const { ctx, page, errors } = await open('assemble', { visitor: true });
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('done')), null, 'no flag in the address');
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
  assert.deepEqual(dress.strip, ['← Back', 'Wall & desk', 'Next view →'], 'the strip: Back, the room\'s wall and desk colours, and Next view');
  const barPx = Math.round(dress.h * 0.07);
  assert.deepEqual(dress.safe, { left: 8, right: 8, top: barPx + 8, bottom: barPx + 8 }, `the shots are fitted between the bars, not the HUD's region (safe ${JSON.stringify(dress.safe)})`);
  assert.equal(s1.grid, false, 'the grid is hidden'); assert.equal(s1.table, false, 'the table is hidden'); assert.equal(s1.dims, false, 'no callouts in the room');
  /* and none while it holds, whatever asks (Joey 2026-10-25: the callouts showed in the scene, a step's own setDims after
     the entry): the stage's hold records the wish and draws nothing; the leave below puts them back */
  const asked = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; v.setDims(true); return { on: !!v.dimsOn, pills: ['dim-w', 'dim-h', 'dim-l'].map((id) => document.getElementById(id).classList.contains('hidden')) }; });
  assert.equal(asked.on, false, 'a setDims(true) inside the scene draws no callouts'); assert.deepEqual(asked.pills, [true, true, true], 'and no pill shows');
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
  /* THE CALIPERS' STEEL IS LIVE (bake4, 2026-10-24; room.py build_calipers): a metal's diffuse bake is black, which is how
     the first calipers drew, so the steel is one mesh the bake leaves alone and the scene draws as a lit metal reflecting
     the room, on Fast too; the housing is baked like the rest of the room (one mesh, one material) */
  const cal = await page.evaluate(() => { const v = window.__GEN2_VIEWER__, out = {}; v.scene.getObjectByName('done-room').traverse((o) => { if (o.isMesh && o.userData.group === 'calipers') out[o.name] = { live: !!o.userData.live, type: o.material.type, metal: o.material.metalness, envSet: !!o.material.envMap, map: !!o.material.map, cast: o.castShadow, visible: o.visible }; }); return out; });
  assert.deepEqual(Object.keys(cal).sort(), ['cal_body', 'cal_steel'], `the calipers are two meshes, steel and housing (${Object.keys(cal)})`);
  assert.equal(cal.cal_steel.live, true, 'the steel is tagged live'); assert.equal(cal.cal_steel.type, 'MeshStandardMaterial', 'the steel is a lit material, not a baked one'); assert.equal(cal.cal_steel.metal, 1, 'a metal');
  assert.equal(cal.cal_steel.envSet, true, 'it reflects the room, on Fast too (no scene environment there)'); assert.equal(cal.cal_steel.map, true, 'the beam\'s printed scale'); assert.equal(cal.cal_steel.cast, false, 'its shadow is the baked mask, not the shadow map');
  assert.equal(cal.cal_body.live, false, 'the housing is baked'); assert.equal(cal.cal_body.type, 'MeshBasicMaterial', 'drawn as its lightmap');
  assert.match(await text(page, '#ws-player .text'), /Watch the final scene/, 'the End page named the way in');
  /* THE INTERIOR HIDDEN and THE RELIEF BY DISTANCE (PERF.md §5, 2026-10-24). In the scene the parts inside the assembled
     units (drawer bodies, stoppers, QuickLocks, magnet clips and magnets) are not drawn: meshes, not groups, so
     unitHasDrawer still answers; a unit's interior shows while its drawer is out (the bay shows through the opening) and
     hides again once it is back. And the relief is off wherever no layer can span the shader's cutoff of 4 CSS px, which
     is every shot of this build at this frame (a 0.2 mm layer needs a 60 mm field), whatever the tier says. */
  const inner = await page.evaluate(() => window.__GEN2_VIEWER__.interiorState());
  assert.equal(inner.on, true, 'the interior rule is on in the scene'); assert.ok(inner.hidden > 0 && inner.shown === 0, `every interior mesh hidden (${inner.hidden} hidden, ${inner.shown} shown)`);
  const unit = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; const d = v.manifest.instances.find((i) => /DecorDrawer/.test(i.node)); return d ? v.unitOf(d.id) ?? null : null; });
  assert.ok(unit != null, 'a drawer\'s unit'); assert.equal(await page.evaluate((u) => window.__GEN2_VIEWER__.unitHasDrawer(u), unit), true, 'the unit still answers unitHasDrawer with its drawer\'s meshes hidden (the group stays visible)');
  await page.evaluate((u) => window.__GEN2_VIEWER__.slideUnitDrawer(u, true, 0.4), unit);
  await settle(page, 500);
  const outS = await page.evaluate(() => window.__GEN2_VIEWER__.interiorState());
  assert.deepEqual(outS.units, [unit], 'the unit whose drawer is out shows its interior'); assert.ok(outS.shown > 0 && outS.hidden > 0, `its interior shown, the other units' hidden (${outS.shown} shown, ${outS.hidden} hidden)`);
  await page.evaluate((u) => window.__GEN2_VIEWER__.slideUnitDrawer(u, false, 0.4), unit);
  await settle(page, 900);
  const backS = await page.evaluate(() => window.__GEN2_VIEWER__.interiorState());
  assert.equal(backS.shown, 0, 'the drawer back: its interior hidden again'); assert.deepEqual(backS.units, [], 'and the unit forgotten');
  const relief = await page.evaluate(() => ({ override: window.__GEN2_VIEWER__.reliefOverride(), ...window.__GEN2_DONE__.relief }));
  assert.equal(relief.override, false, `the relief is off at the hero: ${relief.px && relief.px.toFixed(2)} CSS px a layer against the cutoff of ${relief.cutoffPx}`); assert.ok(relief.px > 0 && relief.px < relief.cutoffPx, 'the decision follows the measured pixels a layer');
  // a tier with shadows, still on the DARK theme (which has no shadow map of its own): the room's sun casts, the catcher shows
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('balanced', { user: true }); });
  await settle(page, 1500);
  const s2 = await state(page);
  assert.equal(s2.room, true); assert.equal(s2.held, true); assert.notEqual(s2.theme, 'light', 'still the dark stage (named night)'); assert.equal(s2.quality, 'balanced');
  assert.equal(s2.env, true, 'Balanced has an environment'); assert.equal(s2.envIsStudio, false, 'and it is the room\'s, not the studio\'s: the tier change did not put studioEnv back');
  assert.equal(s2.shadow, true, 'the sun shadow is on under the dark theme'); assert.equal(s2.catcher, true, 'both catchers show (desk and wall)'); assert.equal(s2.disc, false, 'the disc hides');
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.reliefWanted()), false, 'Balanced in the scene: the relief stays off by distance, though the tier has it');
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
  const after = await page.evaluate(() => ({ interior: window.__GEN2_VIEWER__.interiorState(), relief: window.__GEN2_VIEWER__.reliefOverride(), wanted: window.__GEN2_VIEWER__.reliefWanted() }));
  assert.equal(after.interior.on, false, 'Esc: the interior rule is off'); assert.equal(after.interior.hidden, 0, 'every interior mesh is back'); assert.equal(after.relief, null, 'and the tier has its say on the relief again'); assert.equal(after.wanted, true, 'Balanced outside the scene: the relief is on');
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
  // a wall mask reaches down over the strip of wall the sun reaches under the desk top, from the room's own record
  // (done-fit.js gapDrop, 2026-10-25: the gap behind the desk times the sun's rise over its run toward the room, + 3 mm)
  const sun = roomJson.sun && roomJson.sun.dir, gap = desk.zBack - (roomJson.anchors.wall[2] - roomJson.anchors.tabletop[2]);
  const drop = sun && gap > 0 && sun[1] > 0 && sun[2] > 0 ? gap * sun[1] / sun[2] + 3 : 0;
  for (const m of masks) {
    const rec = roomJson.shadows.masks.find((r) => r.group === m.group && r.surface === m.surface);
    assert.ok(rec, `${m.group}'s ${m.surface} mask is one room.json lists`);
    const dx = (m.dx || 0) + (m.moved ? m.moved.x : 0), dz = m.moved ? m.moved.z : 0;   // the coffee's own move on a build that stands it elsewhere (done.js makeMugs)
    if (m.surface === 'desk') {
      // a desk quad is the mask's extent slid, CUT at the desk's ends (a mask reaching the edge and sliding outward would float past it)
      const lo = Math.max(rec.x0 + dx, desk.x0), hi = Math.min(rec.x1 + dx, desk.x1), ex = f.anchorX + (lo + hi) / 2;
      assert.ok(Math.abs(m.x - ex) < 0.01 && Math.abs(m.w - (hi - lo)) < 0.01, `${m.group}'s desk quad is the mask's extent slid and cut at the desk's ends (${m.x.toFixed(1)} vs ${ex.toFixed(1)}, ${m.w.toFixed(1)} vs ${(hi - lo).toFixed(1)}, slide ${m.dx})`);
      assert.ok(m.x - m.w / 2 >= f.anchorX + desk.x0 - 0.01 && m.x + m.w / 2 <= f.anchorX + desk.x1 + 0.01, `${m.group}'s desk quad lies within the desk`);
      assert.ok(Math.abs(m.z - (f.anchorZ + (rec.zBack + rec.zFront) / 2 + dz)) < 0.01 && m.y > 0 && m.y < 2, `${m.group}'s desk quad lies on the desk (${m.y.toFixed(2)}, ${m.z.toFixed(1)})`);
    } else {
      const ex = f.anchorX + (rec.x0 + rec.x1) / 2 + dx;
      assert.ok(Math.abs(m.x - ex) < 0.01 && Math.abs(m.w - (rec.x1 - rec.x0)) < 0.01, `${m.group}'s wall quad sits at the mask's extent about the anchor plus its slide (${m.x.toFixed(1)} vs ${ex.toFixed(1)}, slide ${m.dx})`);
      const y0 = drop > 0 ? Math.min(rec.y0, -drop) : rec.y0;
      assert.ok(Math.abs(m.y - (y0 + rec.y1) / 2) < 0.01 && (m.h == null || Math.abs(m.h - (rec.y1 - y0)) < 0.01) && m.z > f.wallZ && m.z - f.wallZ < 2, `${m.group}'s wall quad stands just in front of the wall, down over the strip under the desk top (${m.y.toFixed(1)} vs ${((y0 + rec.y1) / 2).toFixed(1)}, ${m.z.toFixed(2)} vs the wall at ${f.wallZ.toFixed(2)})`);
    }
  }
}

/* THE PROPS' SHADOWS MOVE WITH THE PROPS (Joey 2026-10-23: the keyboard's dark patch stayed on the desk's right end after the
   keyboard hid for a 12W build). bake3 bakes the desk and wall maps without the props and each prop group's shadow as a
   mask (room.json shadows); done.js slides each mask's quad with its group and hides it with a hidden group. A 12W x 2H
   build through the Build workspace, as the massive-build probe did: the monitor cannot clear it on the desk and hides, a
   group that can slides; their shadows do the same, by the same slide. */
test('Assemble: the Done scene\'s prop shadows slide with their group and hide with a hidden group (a 12W build)', { skip: ROOM_SOFT_SKIP }, async () => {
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
  const heroFit = d0.fits.find((f) => f.name === 'hero');
  assert.equal(heroFit.clamped, true, 'the hero was clamped for this build'); assert.equal(d0.fits.filter((f) => f.name !== 'mugs').length, 11, 'the grammar\'s eleven shots (no label shot: this build carries no words; the mugs\' only where the second mug found room)');
  // EVERY shot of the grammar, still or at the middle of its move, inside the walls, under the tops, above the desk
  for (const f of d0.fits) {
    assert.ok(f.pos[0] >= d0.interior.x0 + 150 - 1 && f.pos[0] <= d0.interior.x1 - 150 + 1, `${f.name} between the walls (${f.pos[0].toFixed(0)})`);
    assert.ok(f.pos[1] <= d0.interior.y1 - 450 + 1 && f.pos[1] >= 18 - 0.5, `${f.name} under the wall tops and above the desk (${f.pos[1].toFixed(0)})`);
    assert.ok(f.pos[2] >= d0.interior.z0 + 150 - 1, `${f.name} in front of the back wall (${f.pos[2].toFixed(0)})`);
  }
  await page.evaluate(() => window.__GEN2_DONE__.jump('low'));
  await settle(page, 400);
  const d1 = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; return { cam: v.camera.position.toArray(), fov: v.camera.fov, fit: window.__GEN2_DONE__.sequence.fits.find((f) => f.name === 'low') }; });
  assert.ok(d1.cam[0] >= d0.interior.x0 + 150 - 1, `the low shot stays inside the left wall (${d1.cam[0].toFixed(0)} against ${d0.interior.x0})`);
  assert.equal(d1.fit.clamped, true, 'it was clamped');
  const lowShare = d1.fit.share, lowWant = Math.min(55, (2 * Math.atan(Math.tan((46 * Math.PI) / 360) * Math.max(1, lowShare / 0.92)) * 180) / Math.PI);
  assert.ok(Math.abs(d1.fov - lowWant) < 0.05, `its fov is the clamp's: the 46 degree lens, widened only past a 0.92 share (share ${lowShare.toFixed(2)}, fov ${d1.fov.toFixed(1)} vs ${lowWant.toFixed(1)})`);
  assert.ok(d1.cam[1] >= 18 - 0.5, `and it stays above the desk (${d1.cam[1].toFixed(0)} mm)`);
  await page.evaluate(() => window.__GEN2_DONE__.jump('hero'));
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

/* THE CAMERA GRAMMAR (Joey 2026-10-24; DESIGN.md §8l): distinct cameras, CUT between through a dip to black, in a seeded
   random order that never repeats a shot (the hero first). Static first: on Fast (the suite's pin) and Balanced every shot
   is locked off; on High the moving shots move (with the verdict off, maxFrameMs 1e9: SwiftShader draws a move as a
   handful of frames, which is the verdict's own business, checked on its own below); the detail shot's drawer moment only
   when the shots move; a slow verdict locks the views off, mid-move too; Next view dips from where the shot is; a hidden
   tab pauses the clock; reduced motion keeps the still hero and turns the views by hand with a plain cut. The clock is
   shortened through the debug hook so the case takes seconds, and every wait on the clock is a poll (SwiftShader). */
test('Assemble: the Done scene\'s camera grammar: distinct shots in a random order through a dip to black; locked off on Fast and Balanced, moving on High; Next view dips; a slow device locks off; reduced motion keeps the hero', { skip: ROOM_SOFT_SKIP }, async () => {
  const cam = (page) => page.evaluate(() => { const v = window.__GEN2_VIEWER__; return v.camera.position.toArray().concat(v.controls.target.toArray(), [v.camera.fov]).map((n) => +n.toFixed(2)); });
  const seqOf = (page) => page.evaluate(() => (window.__GEN2_DONE__ && window.__GEN2_DONE__.sequence) || null);
  const fadeOf = (page) => page.evaluate(() => { const f = document.getElementById('done-fade'); return f ? +getComputedStyle(f).opacity : null; });
  const near = (a, b, tol = 0.5) => a.every((v, i) => Math.abs(v - b[i]) < tol);
  const fitOf = (s, name) => s.fits.find((f) => f.name === name);
  const toDone = async (page) => {
    await btn(page, 'Skip to the finished build', '#ws-steps').click();
    await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
    await btn(page, 'Next', '#ws-player').click();
    await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
    await btn(page, 'Watch the final scene', '#ws-player').click();
    await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => assert.fail('the room did not come on within 60 s'));
  };
  /* NEXT VIEW DURING THE ENTRANCE (Sol 01a16e0e), in its two windows: while the entry waits for the room's first frames,
     and while the entrance move runs. Either way the grammar begins on the hero and dips on to the plan's next shot, and
     the entrance neither starts after it nor keeps moving the camera under it. The windows are stretched through the debug
     timing (a 40-frame wait, a 6 s entrance, a quick dip), or a fast GPU closes them before a click can land. */
  for (const when of ['before', 'during']) {
    const early = await open('assemble', { query: '&done=room' });
    /* 'before': the dip-out outlasts the 40-frame wait, as the real 800 ms dip outlasts the real 2-frame one, so the
       entry's own guard is what keeps the entrance from starting (a quick dip let the next shot's wait cancel it first,
       and a mutant without the guard survived) */
    await early.page.evaluate((w) => { window.__DONE_TIMING__ = w === 'before' ? { preFrames: 40, enterMs: 6000, dipOutMs: 1500, blackMs: 80, dipInMs: 150 } : { enterMs: 6000, dipOutMs: 150, blackMs: 80, dipInMs: 150 }; }, when);
    await btn(early.page, 'Skip to the finished build', '#ws-steps').click();
    await early.page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
    await btn(early.page, 'Next', '#ws-player').click();
    await early.page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
    await btn(early.page, 'Watch the final scene', '#ws-player').click();
    if (when === 'before') await early.page.waitForFunction(() => window.__GEN2_DONE__ && !window.__GEN2_DONE__.sequence.entering && !window.__GEN2_DONE__.sequence.on, null, { timeout: 60_000 });
    else await early.page.waitForFunction(() => window.__GEN2_DONE__ && window.__GEN2_DONE__.sequence.entering, null, { timeout: 60_000 }).catch(() => assert.fail('the entrance never began'));
    await early.page.evaluate(() => { const b = [...document.querySelectorAll('#ws-scene button')].find((x) => /Next view/.test(x.textContent)); b.click(); });
    await early.page.waitForFunction(() => { const s = window.__GEN2_DONE__.sequence; return s.on && s.shot !== 'hero' && s.phase === 'hold'; }, null, { timeout: 15_000 }).catch(async () => assert.fail(`Next view ${when} the entrance never reached the next shot: ` + JSON.stringify(await seqOf(early.page))));
    await settle(early.page, 300);
    const es = await seqOf(early.page), ec = await cam(early.page);
    assert.equal(es.shot, es.order[1], `${when}: the plan's second shot`); assert.equal(es.entering, false, `${when}: no entrance running`);
    assert.ok(near(ec.slice(0, 3), fitOf(es, es.shot).pos), `${when}: the camera on it (${es.shot}), not drawn back toward the hero (${ec.slice(0, 3)} vs ${fitOf(es, es.shot).pos.map((n) => n.toFixed(1))})`);
    await settle(early.page, 1200);
    assert.deepEqual(await cam(early.page), ec, `${when}: and nothing moves it after`);
    assert.deepEqual(clean(early.errors), []);
    await early.ctx.close();
  }
  const { ctx, page, errors } = await open('assemble', { query: '&done=room' });
  await toDone(page);
  await page.waitForFunction(() => window.__GEN2_DONE__ && window.__GEN2_DONE__.sequence.on, null, { timeout: 15_000 }).catch(() => assert.fail('the grammar never began'));
  // FAST (the suite's pin): the still grammar, twelve distinct shots (no label shot: this build carries no words), the hero first, the black layer over the canvas only
  const f0 = await seqOf(page);
  assert.equal(f0.mode, 'still', 'Fast: locked-off views (static first)');
  assert.deepEqual(f0.names, ['hero', 'push', 'low', 'detail', 'slide', 'top', 'macro', 'side', 'glide', 'pullback', 'dolly', 'mugs'], 'twelve distinct shots (the mugs\' among them)');
  assert.equal(f0.order[0], 'hero', 'the first cycle opens on the hero (the entrance lands on it)'); assert.deepEqual([...f0.order].sort(), f0.names.filter((n) => n !== 'mugs' || f0.order.includes('mugs')).sort(), 'every shot once a cycle (the mugs shot in about half of them)');
  assert.equal(new Set(f0.fits.map((f) => f.pos.map((n) => n.toFixed(0)).join())).size, f0.names.length, 'as many different camera positions');
  assert.ok(new Set(f0.fits.map((f) => f.fov.toFixed(1))).size >= 5, `and lenses (${f0.fits.map((f) => f.fov.toFixed(1))})`);
  const layer = await page.evaluate(() => { const f = document.getElementById('done-fade'), c = document.getElementById('stage'); if (!f) return null; const r = f.getBoundingClientRect(), rc = c.getBoundingClientRect(); return { beside: f.parentElement === c.parentElement, pe: getComputedStyle(f).pointerEvents, cover: Math.abs(r.width - rc.width) < 2 && Math.abs(r.height - rc.height) < 2, inWs: document.getElementById('ws').contains(f) }; });
  assert.deepEqual(layer, { beside: true, pe: 'none', cover: true, inWs: false }, 'the black layer covers the canvas, outside the workspace (the bars and the strip draw over the black)');
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1200, dipInMs: 300, dipOutMs: 300, blackMs: 150, maxFrameMs: 1e9, seed: 1 }));
  await settle(page, 150);
  const s1 = await seqOf(page), k1 = await cam(page);
  assert.deepEqual([s1.shot, s1.phase, s1.moving], ['hero', 'hold', false], 'the hero, holding');
  await settle(page, 400);
  assert.deepEqual(await cam(page), k1, 'a locked-off shot does not move');
  // the dip: black at the cut, the next shot in the plan fading in on a different camera
  await page.waitForFunction(() => window.__GEN2_DONE__.sequence.phase === 'black', null, { timeout: 10_000 }).catch(async () => assert.fail('the dip never reached black: ' + JSON.stringify(await seqOf(page))));
  assert.ok((await fadeOf(page)) > 0.9, `black at the cut (${await fadeOf(page)})`);
  await page.waitForFunction((first) => { const s = window.__GEN2_DONE__.sequence; return s.shot !== first && s.phase === 'hold'; }, s1.shot, { timeout: 10_000 }).catch(async () => assert.fail('the next shot never faded in: ' + JSON.stringify(await seqOf(page))));
  const s2 = await seqOf(page), k2 = await cam(page);
  assert.equal(s2.shot, s2.order[1], 'the next shot in the plan'); assert.ok((await fadeOf(page)) < 0.1, 'faded back in');
  assert.notDeepEqual(k2, k1, 'a different camera');
  assert.ok(near(k2.slice(0, 3), fitOf(s2, s2.shot).pos), `locked off where its move is half way (${k2.slice(0, 3)} vs ${fitOf(s2, s2.shot).pos.map((n) => n.toFixed(1))})`);
  // a moving shot in the still grammar is locked off at the middle of its move, and the detail shot has no drawer moment
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 6000, dipInMs: 300, dipOutMs: 300, blackMs: 150, maxFrameMs: 1e9, seed: 1 }); window.__GEN2_DONE__.jump('push'); });
  await settle(page, 300);
  const p0 = await cam(page), sp = await seqOf(page);
  assert.deepEqual([sp.shot, sp.moving], ['push', false], 'the push-in, locked off'); assert.ok(near(p0.slice(0, 3), fitOf(sp, 'push').pos), 'at the middle of its move');
  await settle(page, 700);
  assert.deepEqual(await cam(page), p0, 'and it stays there');
  await page.evaluate(() => window.__GEN2_DONE__.jump('detail'));
  await settle(page, 1800);   // past the beat's 0.7 s and the 380 ms slide
  const fd = (await seqOf(page)).drawer;
  assert.ok(fd.unit != null, 'a drawer unit was picked'); assert.equal(fd.open, false, 'no drawer moment in the still grammar (it animates)');
  // BALANCED: still too (Joey 2026-10-24: "maybe we only use stationary views for those devices")
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('balanced', { user: true }); });
  await settle(page, 300);
  assert.equal((await seqOf(page)).mode, 'still', 'Balanced: locked off');
  // HIGH: the moving shots move, the stage keeping its AO through the move; a still holds and gives the frame back
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('high', { user: true }); });
  await settle(page, 300);
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 6000, dipInMs: 300, dipOutMs: 300, blackMs: 150, maxFrameMs: 1e9, seed: 2 }));
  assert.equal((await seqOf(page)).mode, 'full', 'High: the shots move');
  await page.evaluate(() => window.__GEN2_DONE__.jump('push'));
  await settle(page, 200);
  const m0 = await cam(page);
  await page.waitForFunction((m0) => { const p = window.__GEN2_VIEWER__.camera.position; return Math.hypot(p.x - m0[0], p.y - m0[1], p.z - m0[2]) > 1; }, m0, { timeout: 10_000 }).catch(() => assert.fail('the push-in never moved'));
  const sm = await seqOf(page);
  assert.deepEqual([sm.shot, sm.moving, sm.phase], ['push', true, 'hold'], 'moving, in its hold'); assert.ok(sm.k > 0 && sm.k < 1, `part way along (k ${sm.k})`);
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.motionFull()), true, 'the stage keeps its settle passes (AO) through the move');
  assert.ok(sm.ends.length === 2 && Math.hypot(...sm.ends[1].map((v, i) => v - sm.ends[0][i])) > 20, 'a real move: its two ends apart');
  // every shot moves on High (Joey 2026-10-25: "There are a lot of frozen views"): the top shot, which used to hold, too
  await page.evaluate(() => window.__GEN2_DONE__.jump('top'));
  await settle(page, 300);
  const t0 = await cam(page);
  await page.waitForFunction((t0) => { const p = window.__GEN2_VIEWER__.camera.position; return Math.hypot(p.x - t0[0], p.y - t0[1], p.z - t0[2]) > 0.5; }, t0, { timeout: 10_000 }).catch(() => assert.fail('the top shot never moved on High'));
  assert.deepEqual([(await seqOf(page)).moving, await page.evaluate(() => window.__GEN2_VIEWER__.motionFull())], [true, true], 'the top shot moves on High, the stage keeping its settle passes');
  // the drawer moment: in the detail shot's hold, when the shots move. The unit's box grows toward the front by the slide,
  // then shrinks (polled, not timed: on SwiftShader on a slow CPU the slide's frames come late)
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 9000, dipInMs: 300, dipOutMs: 300, blackMs: 150, maxFrameMs: 1e9, seed: 2 }); window.__GEN2_DONE__.jump('detail'); });
  await settle(page, 200);
  const dz0 = await page.evaluate(() => { const d = window.__GEN2_DONE__.sequence.drawer; return { unit: d.unit, open: d.open, z: window.__GEN2_VIEWER__.unitBox(d.unit).max.z }; });
  assert.ok(dz0.unit != null, 'a unit with a drawer'); assert.equal(dz0.open, false, 'closed as the hold begins');
  await page.waitForFunction((z0) => { const d = window.__GEN2_DONE__.sequence.drawer; return d.open && window.__GEN2_VIEWER__.unitBox(d.unit).max.z - z0 > 40; }, dz0.z, { timeout: 4000 }).catch(() => assert.fail('the drawer did not slide out by 40 mm within the hold'));
  await page.waitForFunction((z0) => { const d = window.__GEN2_DONE__.sequence.drawer; return !d.open && Math.abs(window.__GEN2_VIEWER__.unitBox(d.unit).max.z - z0) < 2; }, dz0.z, { timeout: 7000 }).catch(() => assert.fail('the drawer did not go back'));
  assert.equal((await seqOf(page)).shot, 'detail', 'back before the dip');
  // a drop below High while the drawer is out closes it at once, and a moving shot locks off where it is (Terra 01a16b6b)
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 9000, dipInMs: 300, dipOutMs: 300, blackMs: 150, maxFrameMs: 1e9, seed: 2 }); window.__GEN2_DONE__.jump('detail'); });
  await page.waitForFunction(() => window.__GEN2_DONE__.sequence.drawer.open, null, { timeout: 4000 }).catch(() => assert.fail('the drawer did not open for the drop check'));
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('fast', { user: true }); });
  const fq = await seqOf(page);
  assert.equal(fq.mode, 'still', 'Fast: still'); assert.equal(fq.on, true); assert.equal(fq.drawer.open, false, 'the drop closed the drawer at once');
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('high', { user: true }); });
  await settle(page, 300);
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 9000, dipInMs: 300, dipOutMs: 300, blackMs: 150, maxFrameMs: 1e9, seed: 2 }); window.__GEN2_DONE__.jump('slide'); });
  await page.waitForFunction(() => window.__GEN2_DONE__.sequence.moving, null, { timeout: 4000 }).catch(() => assert.fail('the slide did not move'));
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('balanced', { user: true }); });
  await settle(page, 200);
  const lk = await cam(page), sl = await seqOf(page);
  assert.deepEqual([sl.shot, sl.moving], ['slide', false], 'a drop mid-move locks the shot off where it is');
  await settle(page, 600);
  assert.deepEqual(await cam(page), lk, 'and it stays there'); assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.motionFull()), false);
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('high', { user: true }); });
  await settle(page, 300);
  /* A DROP BELOW HIGH WHILE A NEW SHOT WAITS IN THE BLACK FOR ITS FIRST FRAMES (Sol 01a16e0e): the shot that was cut to
     fades in, once, locked off; the plan does not run on to the one after it. The wait is stretched to 90 frames. */
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 500, dipInMs: 100, dipOutMs: 100, blackMs: 50, waitFrames: 90, maxFrameMs: 1e9, seed: 6 }));
  await page.waitForFunction(() => window.__GEN2_DONE__.sequence.waiting, null, { timeout: 8000 }).catch(async () => assert.fail('no shot waited in the black: ' + JSON.stringify(await seqOf(page))));
  const w = await seqOf(page);
  assert.equal(w.shot, w.order[1], 'the hero\'s successor'); assert.equal(w.moving, true, 'a moving shot (after a still, the plan moves), waiting');
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('balanced', { user: true }); });
  await page.waitForFunction(() => { const s = window.__GEN2_DONE__.sequence; return !s.waiting && (s.phase === 'in' || s.phase === 'hold'); }, null, { timeout: 10_000 }).catch(async () => assert.fail('the waiting shot never came in: ' + JSON.stringify(await seqOf(page))));
  const wa = await seqOf(page);
  assert.equal(wa.shot, w.shot, 'the shot that was cut to fades in, and only it'); assert.equal(wa.idx, w.idx, 'the plan did not run on'); assert.equal(wa.moving, false, 'locked off by the drop');
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('high', { user: true }); });
  await settle(page, 300);
  // NEXT VIEW: a dip from where the shot is (a moving one held still in it), then the next shot in the plan
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 8000, dipInMs: 300, dipOutMs: 500, blackMs: 150, maxFrameMs: 1e9, seed: 3 }); window.__GEN2_DONE__.jump('side'); });
  await page.waitForFunction(() => window.__GEN2_DONE__.sequence.moving && window.__GEN2_DONE__.sequence.k > 0, null, { timeout: 6000 }).catch(() => assert.fail('the side arc did not move'));
  const nb = await seqOf(page);
  await btn(page, 'Next view', '#ws-scene').click();
  await settle(page, 60);
  const nd = await seqOf(page), h0 = await cam(page);
  assert.equal(nd.cut, true, 'Next view: the dip-out begins'); assert.equal(nd.phase, 'out'); assert.equal(nd.shot, 'side');
  await settle(page, 200);
  if ((await seqOf(page)).phase === 'out') assert.deepEqual(await cam(page), h0, 'the camera held still in the dip');
  await page.waitForFunction(() => { const s = window.__GEN2_DONE__.sequence; return s.shot !== 'side' && s.phase === 'hold'; }, null, { timeout: 10_000 }).catch(async () => assert.fail('Next view never reached the next shot: ' + JSON.stringify(await seqOf(page))));
  const na = await seqOf(page);
  assert.equal(na.shot, na.order[na.idx], 'the plan\'s next'); assert.notEqual(na.shot, nb.shot); assert.equal(na.cut, false); assert.equal(na.slow, false, 'a Next view is no verdict');
  // a hidden tab pauses the clock: a moving shot does not move while hidden, and goes on after
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 8000, dipInMs: 300, dipOutMs: 300, blackMs: 150, maxFrameMs: 1e9, seed: 3 }); window.__GEN2_DONE__.jump('push'); });
  await page.waitForFunction(() => window.__GEN2_DONE__.sequence.moving, null, { timeout: 4000 });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await settle(page, 100);
  const cH = await cam(page);
  assert.equal((await seqOf(page)).paused, true, 'hidden: paused');
  await settle(page, 1200);
  assert.deepEqual(await cam(page), cH, 'no move while hidden');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction((cH) => { const p = window.__GEN2_VIEWER__.camera.position; return Math.hypot(p.x - cH[0], p.y - cH[1], p.z - cH[2]) > 0.5; }, cH, { timeout: 10_000 }).catch(() => assert.fail('visible again: the move did not resume'));
  // the orbit is OFF in the scene (Joey: "don't let them rotate the camera"): a drag leaves the camera where it is (the
  // shot held, so only the drag could move it)
  await page.evaluate(() => { const d = window.__GEN2_DONE__; d.setTiming({ holdMs: 8000, dipInMs: 300, dipOutMs: 300, blackMs: 150, maxFrameMs: 1e9, seed: 3, hold: true }); d.jump('top'); });
  await settle(page, 300);
  const cG = await cam(page);
  await page.mouse.move(640, 380); await page.mouse.down(); await page.mouse.move(700, 410, { steps: 8 }); await page.mouse.up();
  await settle(page, 300);
  assert.deepEqual(await cam(page), cG, 'a drag does not move the camera'); assert.equal((await seqOf(page)).orbit, false, 'the orbit is off');
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.camFree), false, 'the stage never took the camera');
  // THE SLOW VERDICT, forced (a frame budget no move can meet): a moving shot locks off where it is two seconds in, the
  // visit goes on still, on any machine, a GPU included
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 8000, dipInMs: 300, dipOutMs: 300, blackMs: 150, maxFrameMs: 0.001, seed: 4, hold: false }); window.__GEN2_DONE__.jump('slide'); });
  await page.waitForFunction(() => window.__GEN2_DONE__.sequence.slow, null, { timeout: 15_000 }).catch(async () => assert.fail('the forced verdict never came: ' + JSON.stringify(await seqOf(page))));
  const v = await seqOf(page);
  assert.deepEqual([v.on, v.mode, v.moving, v.shot], [true, 'still', false, 'slide'], 'the verdict locks the shot off and the grammar goes still, it does not end it');
  const vk = await cam(page);
  await settle(page, 600);
  assert.deepEqual(await cam(page), vk, 'locked off where it was');
  // leaving the scene (Esc) removes the grammar and its black layer, and gives the stage its lite frames back
  await page.keyboard.press('Escape');
  await settle(page, 1200);
  assert.equal(await seqOf(page), null, 'leaving the scene removes the grammar');
  assert.equal(await page.evaluate(() => !!document.getElementById('done-fade')), false, 'and the black layer');
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.motionFull()), false);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
  // REDUCED MOTION: the still hero, on a tier that would otherwise move; Next view turns the views by hand, a plain cut each
  const rm = await open('assemble', { query: '&done=room' });
  await rm.page.emulateMedia({ reducedMotion: 'reduce' });
  await rm.page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('high', { user: true }); });
  await toDone(rm.page);
  await settle(rm.page, 1500);
  const r0s = await seqOf(rm.page);
  assert.equal(r0s.on, false, 'reduced motion: no grammar running'); assert.equal(r0s.mode, 'off');
  const r0 = await cam(rm.page);
  await settle(rm.page, 2500);
  assert.deepEqual(await cam(rm.page), r0, 'the hero holds');
  await btn(rm.page, 'Next view', '#ws-scene').click();
  await settle(rm.page, 100);
  const r1 = await cam(rm.page), r1s = await seqOf(rm.page);
  assert.notDeepEqual(r1, r0, 'Next view: the next view at once'); assert.equal(r1s.manual, 1); assert.equal(r1s.on, false, 'still no grammar');
  assert.ok((await fadeOf(rm.page)) < 0.05, 'a plain cut: no dip');
  assert.ok(near(r1.slice(0, 3), fitOf(r1s, r1s.names[1]).pos), 'the second shot, locked off');
  await settle(rm.page, 1200);
  assert.deepEqual(await cam(rm.page), r1, 'and it holds there');
  // a resize refits the chosen view, not the hero (Sol 01a16c20)
  const vp = rm.page.viewportSize();
  await rm.page.setViewportSize({ width: vp.width - 200, height: vp.height - 100 });
  await settle(rm.page, 600);
  const rs = await seqOf(rm.page), r2 = await cam(rm.page);
  assert.equal(rs.manual, 1, 'the hand-chosen view is kept'); assert.ok(near(r2.slice(0, 3), fitOf(rs, rs.names[1]).pos), `the camera sits on the refitted second shot (${r2.slice(0, 3)} vs ${fitOf(rs, rs.names[1]).pos.map((n) => n.toFixed(2))})`);
  assert.ok(!near(r2.slice(0, 3), fitOf(rs, 'hero').pos, 1), 'and not on the hero');
  await rm.page.setViewportSize(vp);
  assert.deepEqual(clean(rm.errors), []);
  await rm.ctx.close();
});

/* THE RELIEF COMPILED AHEAD (stage.warmRelief, 2026-10-24). Without it the cut into the macro compiled its two relief
   programs on its first frame, one frame of 1.2 to 1.4 s that the black waited through (1.6 to 1.8 s of full black at
   High, against about 0.4 s with it). Two ways in, each in its own page, since a program once compiled stays compiled: booted at
   High, as a visitor arrives, the hero's landing compiles them; booted at Fast, which draws no relief, the change to Very
   High does, and Very High's samples draw into a render target, the second variant (its cut compiled four programs, not
   two). Either way the hero draws without the relief, and the cut into the macro, where it comes on, compiles nothing.
   maxFrameMs 1e9 and a 3 s entrance: a slow runner's entrance would lock the shots off (its verdict also calls a device
   slow when the entrance draws fewer than 4 frames, whatever their length), and a still macro never brings the relief on. */
test('Assemble: the Done scene compiles the relief ahead: at the hero\'s landing or a change of tier, the hero stays without it, and the cut into the macro compiles nothing', { skip: ROOM_SOFT_SKIP }, async () => {
  /* `last`: the newest program's ID. three numbers its programs in order and a released program's slot is refilled, so
     a COUNT can stay level while a program is compiled again; a new ID cannot (Sol 01a16f55's case did exactly that) */
  const look = (page) => page.evaluate(() => {
    const v = window.__GEN2_VIEWER__, s = window.__GEN2_DONE__ && window.__GEN2_DONE__.sequence;
    return { last: Math.max(0, ...v.renderer.info.programs.map((p) => p.id)), live: v.reliefLive(), override: v.reliefOverride(), shot: s && s.shot, phase: s && s.phase, mode: s && s.mode, warm: s && s.warm };
  });
  const enter = async (page) => {
    await page.evaluate(() => { window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 3000 }; });
    await btn(page, 'Skip to the finished build', '#ws-steps').click();
    await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
    await btn(page, 'Next', '#ws-player').click();
    await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
    await btn(page, 'Watch the final scene', '#ws-player').click();
    await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 }).catch(async () => assert.fail('the grammar never began: ' + JSON.stringify(await look(page))));
  };
  /* the macro next (seed 86: hero, macro, low, ...; seed 1, then 253, until the grammar grew to its mugs' shot on 2026-10-25) after a short hold: the programs counted in the black, once the hero's
     last frames are drawn, and again in the macro's hold */
  const intoMacro = async (page, label) => {
    await page.evaluate(() => window.__GEN2_DONE__.setTiming({ seed: 86, holdMs: 1500, dipOutMs: 300, blackMs: 600, dipInMs: 300, maxFrameMs: 1e9, hold: false }));
    await page.waitForFunction(() => { const s = window.__GEN2_DONE__.sequence; return s.shot === 'hero' && s.phase === 'black'; }, null, { timeout: 20_000 }).catch(async () => assert.fail(`${label}: the hero never dipped: ` + JSON.stringify(await look(page))));
    const b = await look(page);
    await page.waitForFunction(() => { const s = window.__GEN2_DONE__.sequence; return s.shot === 'macro' && s.phase === 'hold'; }, null, { timeout: 20_000 }).catch(async () => assert.fail(`${label}: the macro never came in: ` + JSON.stringify(await look(page))));
    await settle(page, 300);
    const m = await look(page);
    assert.deepEqual([m.live, m.override], [true, null], `${label}: the relief came on in the macro`);
    assert.equal(m.last, b.last, `${label}: and its cut compiled nothing (newest program ${b.last} -> ${m.last})`);
    /* and on through the macro's end and the cut out of it: the move eases to rest by the black, where Very High samples
       into a render target with the relief still on (the second variant: a cut that waits only two frames gives the
       samples no time to begin); the next shot turns the relief off again on programs it already has */
    await page.waitForFunction(() => { const s = window.__GEN2_DONE__.sequence; return s.shot === 'low' && s.phase === 'hold'; }, null, { timeout: 30_000 }).catch(async () => assert.fail(`${label}: the shot after the macro never came in: ` + JSON.stringify(await look(page))));
    const n = await look(page);
    assert.deepEqual([n.live, n.override], [false, false], `${label}: the relief off again after the macro`);
    assert.equal(n.last, b.last, `${label}: and nothing compiled through the macro's end and the cut out of it (newest program ${b.last} -> ${n.last})`);
  };
  /* AT THE HERO'S LANDING: booted at High, 1280 x 1080, where the macro resolves only at the end of its move (2.16 CSS px
     a layer at its start, 2.87 at its middle, 4.30 at its end, against the cutoff of 4), so the look-ahead must judge a
     moving shot at its ends, as the cut does. The macro was pulled back to twice its distance (Joey 2026-10-25: "maybe
     bring it out about twice as far?"): a canvas under about 1,003 CSS px tall never resolves it (3.99 at 1000, 3.19 at
     800, 2.87 at 720), and there the macro draws without the relief and nothing is compiled ahead */
  const hctx = await browser.newContext({ viewport: { width: 1280, height: 1080 } });
  await hctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'high'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
  const hi = await open('assemble', { query: '&done=room', context: hctx });
  await enter(hi.page);
  const h = await look(hi.page);
  assert.equal(h.mode, 'full', 'High moves its shots');
  assert.ok(h.warm && h.warm.programs > 0, `the hero's landing compiled the relief ahead (${JSON.stringify(h.warm)})`);
  assert.deepEqual([h.live, h.override], [false, false], 'and the hero itself draws without it');
  await intoMacro(hi.page, 'landing');
  assert.deepEqual(clean(hi.errors), [], 'no errors (landing)');
  await hctx.close();
  /* AT A CHANGE OF TIER, ON A BUILD DRAWN ONLY IN PER-UNIT CLONES (Sol 01a16f55): booted at Fast, which draws no relief
     and so has none to compile, then Very High. Every unit's every region is given its own colour and the parts that
     belong to no unit (the covers, rails and feet, which would keep base materials) are hidden, so the clones are the
     only materials drawn and a relief flip that disposed them would throw their programs away: the cut would compile
     again. The Foot takes the build's own TPU filament (setOverride refuses any other on a foot). As tall as the first,
     for the macro to resolve. */
  const lctx = await browser.newContext({ viewport: { width: 1280, height: 1080 } });
  await lctx.addInitScript(FAST);
  const lo = await open('assemble', { query: '&done=room', context: lctx });
  const coloured = await lo.page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__;
    const uids = [...new Set(v.manifest.instances.map((i) => v.unitOf(i.id)).filter((u) => u != null))];
    const foot = (() => { try { const p = v.palette(); const f = p && (p.Foot || (p.get && p.get('Foot'))); return f && f.name; } catch { return null; } })();   // the kit's feet are unit-less here (hidden below), so a missing name costs nothing
    let set = 0;
    for (const u of uids) for (const e of v.keysInBuild()) {
      if (e.locked) continue;
      const f = e.key === 'Foot' ? (foot ? { name: foot, hex: '#2a6fdb' } : null) : { name: 'Panchroma Red', hex: '#d03a2e' };
      if (f) { v.setOverride(u, e.key, f); set++; }
    }
    return { uids: uids.length, set };
  });
  assert.ok(coloured.uids > 1 && coloured.set >= coloured.uids * 3, `every unit coloured (${JSON.stringify(coloured)})`);
  await lo.page.evaluate(() => { window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 3000 }; });
  await btn(lo.page, 'Skip to the finished build', '#ws-steps').click();
  await lo.page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(lo.page, 'Next', '#ws-player').click();
  await lo.page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  const unitless = await lo.page.evaluate(() => { const v = window.__GEN2_VIEWER__; let n = 0; for (const [id, inst] of v.instances) if (v.unitOf(id) == null && inst.group.visible) { inst.group.visible = false; n++; } return n; });
  assert.ok(unitless > 0, 'the unit-less parts hidden');
  await btn(lo.page, 'Watch the final scene', '#ws-player').click();
  await lo.page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 }).catch(async () => assert.fail('the grammar never began: ' + JSON.stringify(await look(lo.page))));
  assert.equal(await lo.page.evaluate(() => { const v = window.__GEN2_VIEWER__; let n = 0; for (const [id, inst] of v.instances) if (v.unitOf(id) == null && !inst.group.visible) n++; return n; }), unitless, 'and still hidden in the scene');
  assert.equal((await look(lo.page)).warm, null, 'Fast compiles nothing ahead');
  await lo.page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('veryhigh', { user: true }); });
  await settle(lo.page, 300);
  const q = await look(lo.page);
  assert.equal(q.mode, 'full', 'Very High moves its shots');
  assert.ok(q.warm && q.warm.programs > 0, `the change to Very High compiled the relief ahead (${JSON.stringify(q.warm)})`);
  assert.deepEqual([q.live, q.override], [false, false], 'and the hero still draws without it');
  /* the accumulator's own programs (its display pass, not the relief's) compile the first time Very High rests; the hero
     held still and rested before 2026-10-25, when every shot began to move, so a held frame stands in for it here */
  await lo.page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1e9, maxFrameMs: 1e9, seed: 1, hold: true }));
  await settle(lo.page, 1500);
  await intoMacro(lo.page, 'tier change');
  assert.deepEqual(clean(lo.errors), [], 'no errors (tier change)');
  await lo.ctx.close();
});

/* SUPERSAMPLING (main.js; the final scene turns it on after its entrance's verdict) and A SOFTWARE RASTERISER: on Very High
   twice the screen's ratio on a GPU, the screen's own on a software rasteriser - where 2560 x 1440 starved the lens burst
   (2 of 128 samples in 90 s, 2026-10-26) - and the ratio back when it ends. Driven straight on the stage, no scene and no
   clock, so it runs on the CI runner: the lens case that also checks it is skipped there (ROOM_SOFT_SKIP, Sol 01a17823) */
test('Very High: supersampling draws at twice the screen on a GPU and never on a software rasteriser, and ends at the screen\'s ratio', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
  const { page, errors } = await open('assemble', { context: ctx });
  const ratio = () => page.evaluate(() => window.__GEN2_VIEWER__.renderer.getPixelRatio());
  const soft = await page.evaluate(() => window.__GEN2_VIEWER__.softwareGL);
  assert.equal(soft, SOFTWARE_GL, 'the stage reads the rasteriser as the suite does');
  assert.equal(await ratio(), 1, 'the screen\'s own ratio to begin with');
  await page.evaluate(() => window.__GEN2_VIEWER__.setSupersample(true));
  const want = soft ? 1 : 2;
  await page.waitForFunction((p) => window.__GEN2_VIEWER__.renderer.getPixelRatio() === p, want, { timeout: 15_000 }).catch(() => {});
  assert.deepEqual([await page.evaluate(() => window.__GEN2_VIEWER__.supersampled), await ratio()], soft ? [false, 1] : [true, 2], soft ? 'a software rasteriser: never supersampled' : 'a GPU: twice the screen');
  await page.evaluate(() => window.__GEN2_VIEWER__.setSupersample(false));
  await page.waitForFunction(() => window.__GEN2_VIEWER__.renderer.getPixelRatio() === 1, null, { timeout: 15_000 }).catch(() => {});
  assert.deepEqual([await page.evaluate(() => window.__GEN2_VIEWER__.supersampled), await ratio()], [false, 1], 'and the screen\'s ratio when it ends');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE LENS (Very High's bokeh, 2026-10-24; js/lens.js, done-fit.js lensFor, main.js THE LENS). A still shot of the moving
   grammar gets a thin lens that holds the build sharp and lets the room blur; Very High's accumulator draws it, every
   sample moving the camera across the aperture and shearing the projection so the plane in focus stays put. Where this
   runner's accumulator runs (acc.ok: a GPU here, possibly not under software rendering), the burst's own check is read:
   a point on the plane in focus never moves (lensError), the camera really crossed the aperture (lensSpread), it ends
   exactly where it began, the light's disc is visited out of step with the lens's (lightSums), and the AO overlay fades
   with the blur actually on screen (its uniforms); then the picture itself is read, with the lens and without it, and a
   frame the accumulator does not draw keeps its AO whole (Sol 01a17057). */
test('Assemble: the Done scene\'s lens: a held shot of the moving grammar on Very High gets one, moving shots and the drawer moment do not, it follows a resize and a tier, and leaving clears it', { skip: ROOM_SOFT_SKIP }, async () => {
  const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
  const L = (page) => page.evaluate(() => { const v = window.__GEN2_VIEWER__, s = window.__GEN2_DONE__ && window.__GEN2_DONE__.sequence;
    return { lens: v.lens(), total: v.accTotal(), shot: s && s.shot, moving: s && s.moving, ok: v.acc.ok, probed: v.acc.probed, n: v.acc.n, h: v.renderer.domElement.clientHeight, pr: v.renderer.getPixelRatio(), ss: v.supersampled }; });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1'); } catch {} window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 3000, hold: true }; });
  /* every shot moves since 2026-10-25 (Joey: "There are a lot of frozen views"), so none holds still for a lens in a
     visit; the debug `hold` holds them at the middle of their moves, as the still shots were, and the end checks that a
     shot left to move has none */
  const { page, errors } = await open('assemble', { query: '&done=room', context: ctx });
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 }).catch(async () => assert.fail('the grammar never began: ' + JSON.stringify(await L(page))));
  // THE HERO, held: a lens, the accumulator running to its samples
  const soft = await page.evaluate(() => window.__GEN2_VIEWER__.softwareGL);
  await page.waitForFunction((p) => window.__GEN2_VIEWER__.renderer.getPixelRatio() === p, soft ? 1 : 2, { timeout: 10_000 }).catch(() => {});
  const h = await L(page);
  assert.equal(h.shot, 'hero');
  /* supersampled (main.js SUPERSAMPLING): twice the screen's ratio at 1280 x 720, inside the 4K budget - but never on a
     software rasteriser, the CI runner's (main.js A SOFTWARE RASTERISER), where it starved the lens burst */
  assert.deepEqual([h.ss, h.pr], soft ? [false, 1] : [true, 2], soft ? 'a software rasteriser: the screen\'s own ratio' : 'the final scene draws at twice the screen');
  assert.ok(h.lens && h.lens.focus > 0 && h.lens.aperture > 0, `the hero has a lens (${JSON.stringify(h.lens)})`);
  assert.equal(h.lens.samples, 128, 'the lens runs 128 samples'); assert.equal(h.total, 128, 'and the accumulator runs to them');
  await page.waitForFunction(() => window.__GEN2_VIEWER__.acc.probed, null, { timeout: 20_000 }).catch(() => {});
  if ((await L(page)).ok) {
    const home = await page.evaluate(() => window.__GEN2_VIEWER__.camera.position.toArray());
    await page.waitForFunction(() => window.__GEN2_VIEWER__.acc.n >= 40, null, { timeout: 90_000 }).catch(async () => assert.fail('the lens burst never reached 40 samples: ' + JSON.stringify(await L(page))));
    const b = await page.evaluate(() => { const v = window.__GEN2_VIEWER__, u = v.ao.compMat ? v.ao.compMat.uniforms.uLensAO.value.toArray() : null; return { err: v.acc.lensError, spread: v.acc.lensSpread, n: v.acc.n, home: v.camera.position.toArray(), aoLens: u, light: v.acc.lightSums.slice() }; });
    assert.ok(b.err < 1e-9, `a point on the plane in focus never moved (worst ${b.err} in NDC)`);
    assert.ok(b.spread > 0.5 * h.lens.aperture, `the camera crossed the aperture (${b.spread.toFixed(2)} of ${h.lens.aperture.toFixed(2)} mm)`);
    assert.deepEqual(b.home, home, 'and ends every sample exactly where it began');
    if (b.aoLens) {
      assert.equal(b.aoLens[0], 1, 'the AO overlay fades under the lens');
      close(b.aoLens[1], 1 / h.lens.focus, 1e-12, 'by its focus');
      assert.ok(b.aoLens[2] > 0, 'with the aperture of the mean on screen');
    }
    /* the light out of step (lens.js lightStride): over the burst so far, the squared radius of each sample's lens point
       against its light point's, uncorrelated; in step they are the same radius sample for sample, a correlation of 1 */
    const [k, sx, sy, sxy, sxx, syy] = b.light;
    const rho = (sxy / k - (sx / k) * (sy / k)) / Math.sqrt((sxx / k - (sx / k) ** 2) * (syy / k - (sy / k) ** 2));
    assert.ok(k >= 39 && Math.abs(rho) < 0.2, `the light's radius out of step with the lens's (correlation ${rho.toFixed(3)} over ${k} samples)`);
  } else console.log('  (this runner\'s accumulator does not run: the lens is set but not drawn, its sample checks skipped)');
  // THE GRAMMAR'S OTHER SHOTS, held so nothing cuts under the checks
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1e9, maxFrameMs: 1e9, seed: 1 }));
  await settle(page, 200);
  for (const [shot, want] of [['push', true], ['detail', false], ['low', true]]) {
    await page.evaluate((s) => window.__GEN2_DONE__.jump(s), shot);
    await settle(page, 200);
    const s = await L(page);
    assert.equal(s.shot, shot);
    if (want) assert.ok(s.lens && s.lens.focus > 0, `${shot}: a held shot has a lens`);
    else assert.equal(s.lens, null, `${shot}: the drawer moment has none (it restarts the accumulation)`);
  }
  const low = await L(page);
  assert.notEqual(low.lens.focus, h.lens.focus, 'each still shot its own focus');
  if (low.ok) {
    const V = (fn, arg) => page.evaluate(fn, arg);
    const converged = (k0, n) => page.waitForFunction(([k0, n]) => { const a = window.__GEN2_VIEWER__.acc; return a.key !== k0 && a.n >= n; }, [k0, n], { timeout: 90_000 });
    /* THE PICTURE (Sol 01a17057): the checks above could all hold with no blur drawn (a pinhole keeps the plane in focus
       in place too), so the frame itself is read: the held still shot converged with its lens, then without it, the AO
       overlay off both times so the lens is the only difference. The room softens, so the frame's sharpness (the mean
       luminance step to the next pixel right and below) falls: by 18.6 to 19.6 % on the three still shots at this size
       (D:/Claude - Output/done-scene-2026-10-23/bokeh/measure-before/720). 128 samples with no lens drawn fall 5.4 %
       (mutant L19), so the 10 % asked sits between the two. Read through the stage's canvas read, which draws its frame
       in the same task. */
    const sharp = () => V(async () => {
      const img = new Image(); img.src = window.__GEN2_VIEWER__.renderer.domElement.toDataURL('image/png'); await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data, w = cv.width, hh = cv.height, Y = new Float32Array(w * hh);
      for (let i = 0; i < w * hh; i++) Y[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
      let s = 0;
      for (let y = 0; y < hh - 1; y++) for (let x = 0; x < w - 1; x++) { const i = y * w + x; s += Math.abs(Y[i + 1] - Y[i]) + Math.abs(Y[i + w] - Y[i]); }
      return s / ((w - 1) * (hh - 1));
    });
    const aoS = await V(() => { const u = window.__GEN2_VIEWER__.ao.compMat.uniforms.uStrength, s = u.value; u.value = 0; return s; });
    await page.waitForFunction(() => window.__GEN2_VIEWER__.acc.n >= window.__GEN2_VIEWER__.accTotal(), null, { timeout: 90_000 });
    const withLens = await sharp();
    const k1 = await V(() => { const v = window.__GEN2_VIEWER__, k = v.acc.key; v.setLens(null); return k; });
    await converged(k1, await V(() => window.__GEN2_VIEWER__.ACC_SAMPLES));
    const without = await sharp();
    const k2 = await V(([l, s]) => { const v = window.__GEN2_VIEWER__, k = v.acc.key; v.setLens(l); v.ao.compMat.uniforms.uStrength.value = s; return k; }, [low.lens, aoS]);
    assert.ok(withLens < 0.9 * without, `the lens softens the frame (sharpness ${withLens.toFixed(3)} with it, ${without.toFixed(3)} without)`);
    /* A FRAME THE ACCUMULATOR DOES NOT DRAW (Sol 01a17057): a tween stops it and the plain frame is drawn, sharp, while
       acc.n still holds the last burst's count; its AO must be whole there, not faded as if the blurred mean were on
       screen. The filming rig's flag keeps the AO composite drawing during the tween, so the frame read has one. */
    await converged(k2, 16);
    const unit = await V(() => { const v = window.__GEN2_VIEWER__, d = v.manifest.instances.find((i) => /DecorDrawer/.test(i.node)); return d ? v.unitOf(d.id) ?? null : null; });
    const stale = await V(async (u) => {
      const v = window.__GEN2_VIEWER__, x0 = v.ao.compMat.uniforms.uLensAO.value.x;
      window.__FILM_AO_DURING_TWEENS = true;
      v.slideUnitDrawer(u, true, 0.4);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      return { x0, x: v.ao.compMat.uniforms.uLensAO.value.x, n: v.acc.n };
    }, unit);
    await V((u) => { window.__GEN2_VIEWER__.slideUnitDrawer(u, false, 0.4); }, unit);
    await settle(page, 900);
    await V(() => { delete window.__FILM_AO_DURING_TWEENS; });
    assert.equal(stale.x0, 1, 'the converged mean\'s AO fades under the lens');
    assert.equal(stale.x, 0, `the plain frame of a tween keeps its AO whole (the lens weight ${stale.x}, the last burst's ${stale.n} samples still counted)`);
  }
  // A RESIZE: the lens's blur is in pixels of the view, so a shorter canvas widens the aperture for the same pixels
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.waitForFunction((h0) => window.__GEN2_VIEWER__.renderer.domElement.clientHeight !== h0, low.h, { timeout: 10_000 }).catch(() => {});
  await settle(page, 400);
  const r = await L(page);
  assert.ok(r.lens && r.h < low.h, `refitted (${low.h} -> ${r.h} px)`);
  close(r.lens.aperture / low.lens.aperture, low.h / r.h, 0.02 * low.h / r.h, 'the aperture scales with the canvas height it is blurred in');
  await page.setViewportSize({ width: 1280, height: 720 });
  await settle(page, 400);
  // A TIER: High does not accumulate, so no lens; back on Very High the still shot has one again
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('high', { user: true }); });
  await settle(page, 400);
  assert.equal((await L(page)).lens, null, 'High: no lens (nothing accumulates)');
  assert.equal((await L(page)).pr, 1, 'and High draws at the screen\'s own ratio (supersampling is Very High\'s only)');
  await page.evaluate(() => { window.__GEN2_VIEWER__.setQuality('veryhigh', { user: true }); });
  await settle(page, 400);
  const back = await L(page);
  assert.ok(back.lens && back.shot === 'low', `Very High again: the still shot's lens back (${JSON.stringify(back)})`);
  // A SHOT LEFT TO MOVE (as every one is in a visit): none
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1e9, maxFrameMs: 1e9, seed: 1, hold: false }));
  await settle(page, 400);
  const mv = await L(page);
  assert.deepEqual([mv.shot, mv.moving, mv.lens], ['hero', true, null], `a moving shot has none (${JSON.stringify(mv)})`);
  // LEAVING: no lens on the stage the scene hands back
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__GEN2_DONE__, null, { timeout: 10_000 }).catch(() => {});
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.lens()), null, 'leaving the scene clears the lens');
  await page.waitForFunction(() => window.__GEN2_VIEWER__.renderer.getPixelRatio() === 1, null, { timeout: 10_000 }).catch(() => {});
  assert.deepEqual(await page.evaluate(() => [window.__GEN2_VIEWER__.supersampled, window.__GEN2_VIEWER__.renderer.getPixelRatio()]), [false, 1], 'and the stage back at the screen\'s own ratio');
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.accTotal()), await page.evaluate(() => window.__GEN2_VIEWER__.ACC_SAMPLES), 'and the accumulator is back to its own samples');
  assert.deepEqual(clean(errors), [], 'no errors');
  await ctx.close();
});

/* THE MOUNTS (2026-10-25; Joey: "hide the fake table surface we use in the builder and align the under-table build to be
   installed under this scenes table", then "always left justify them"). A wall build hangs on the room's wall over
   the desk; an under-table build hangs under the desk's front edge, its left edge 20 mm from the desk's left leg (done-fit.js
   roomAnchor). The builder's own wall and slab stay out of the room, the build casts its shadow there (the stage turns
   shadows off for hanging builds in the studio), and each mount has its own shots. Each made through the setup sheet as a
   visitor makes it, then given a 6W x 2H layout, at High (a shadow tier) on the dark theme. */
test('Assemble: the Done scene hangs a wall build on its wall and an under-table build under its desk, left-justified, the builder\'s backdrops hidden, shadows on, each with its own shots', { skip: ROOM_SOFT_SKIP }, async () => {
  const SIX = [[1, 0, 0, 3], [2, 3, 0, 3], [3, 0, 2, 3], [4, 3, 2, 3]];   // [id, x, y (half-rows), w]: 6W x 2H
  const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
  for (const mount of ['wall', 'under-table']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'high'); localStorage.setItem('gen2-quality:set', '1'); } catch {} window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 3000 }; });
    const { page, errors } = await open('build', { query: '&new=1&setup=1', context: ctx });
    await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
    await page.locator(`#ws-setup .card:has-text("${mount === 'wall' ? 'Wall Mount' : 'Under-Table'}")`).click();
    for (let i = 0; i < 4 && !(await page.locator('#ws-setup button:has-text("Start build")').count()); i++) {   // the length and printer pages
      if (await page.locator('#ws-setup .card.len:has-text("185 mm")').count()) await page.locator('#ws-setup .card.len:has-text("185 mm")').click();
      await btn(page, 'Next', '#ws-setup').click();
      await settle(page, 300);
    }
    await page.evaluate(() => { window.__e2eBeforeReload = 1; });
    await btn(page, 'Start build', '#ws-setup').click();
    await page.waitForFunction((m) => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === m, mount, { timeout: 150_000 });
    await waitBoot(page);
    await page.evaluate((six) => window.__GEN2_STORE__.commit((s) => { s.placed = six.map(([id, x, y, w]) => ({ id, x, y, w, hh: 2, fill: 'decor', shelves: 0 })); s.nextId = 5; s.gridW = 6; s.gridH = 2; }, 'e2e layout'), SIX);
    await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 4 && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 120_000 }).catch(() => assert.fail(`the ${mount} build did not reach the stage`));
    await settle(page, 800);
    await page.goto(`${base}/index.html?ws=assemble&debug=1&done=room`, { waitUntil: 'load', timeout: 90_000 });
    await waitBoot(page);
    await btn(page, 'Skip to the finished build', '#ws-steps').click();
    await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
    await btn(page, 'Next', '#ws-player').click();
    await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
    await btn(page, 'Watch the final scene', '#ws-player').click();
    await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 }).catch(() => assert.fail(`${mount}: the grammar never began`));
    await settle(page, 400);
    const g = await page.evaluate(() => {
      const v = window.__GEN2_VIEWER__, T = v.THREE, room = v.scene.getObjectByName('done-room'), d = window.__GEN2_DONE__;
      const bx = (n) => { const b = new T.Box3().setFromObject(room.getObjectByName(n)); return { min: b.min.toArray(), max: b.max.toArray() }; };
      const catcherYs = []; v.scene.traverse((o) => { if (o.isMesh && o.material && o.material.isShadowMaterial) catcherYs.push(o.position.y); });
      const desk = d.shadows.filter((q) => q.surface === 'desk');
      // the rails' own front, from their meshes: the mounting frame's frontZ is what placed the desk, so it cannot check it (Sol 01a17311)
      const rails = new T.Box3(); for (const inst of v.instances.values()) if (inst.cfg.node.startsWith('UnderTableRail')) rails.union(new T.Box3().setFromObject(inst.group));
      return { frame: v.mountFrame(), build: { min: v.assembledBox.min.toArray(), max: v.assembledBox.max.toArray() }, desk: bx('desk_top'), wall: bx('wall_back'), leg: bx('desk_leg_l'),
        railsFront: rails.isEmpty() ? null : rails.max.z, notebook: bx('notebook'), notebookGap: room.getObjectByName('notebook').userData.gap * 1000,   // the room is scaled x1000
        backdrops: { wall: v.wall.visible, surface: v.surface.visible }, shadows: v.renderer.shadowMap.enabled && v.sun.castShadow, placement: d.placement, names: d.sequence.names, slides: d.slides,
        fits: d.sequence.fits.map((f) => ({ name: f.name, x: f.pos[0], y: f.pos[1], z: f.pos[2], finite: f.pos.every(Number.isFinite) })), deskMasks: desk.map((q) => q.y), catcherYs };
    });
    assert.equal(g.frame.mount, mount); assert.equal(g.placement.mount, mount, `${mount}: the scene read the mount`);
    assert.deepEqual(g.backdrops, { wall: false, surface: false }, `${mount}: the builder's wall and slab stay out of the room`);
    assert.equal(g.shadows, true, `${mount}: the build casts its shadow in the room`);
    assert.deepEqual(g.names.filter((n) => n !== 'mugs'), ['hero', 'push', 'low', 'detail', 'slide', 'wide', 'macro', 'side', 'glide', 'pullback', 'dolly'], `${mount}: its own shots, a wide one for the top (and the mugs' where the second mug stood)`);
    for (const f of g.fits) assert.ok(f.finite, `${mount} ${f.name}: fitted`);
    const deskY = g.placement.deskY;
    near(g.desk.max[1], deskY, 0.01, `${mount}: the desk top where the scene says`);
    for (const y of g.deskMasks) near(y, deskY + 0.5, 0.01, `${mount}: a prop's shadow on the desk top`);
    assert.ok(g.catcherYs.some((y) => Math.abs(y - (deskY + 0.3)) < 0.01), `${mount}: the desk's shadow catcher on the desk top (${g.catcherYs.map((y) => y.toFixed(1))} vs ${deskY.toFixed(1)})`);
    // the wall's, reaching down over the strip of wall under the desk top (done-fit.js gapDrop), its centre half that lower
    assert.ok(g.placement.gapDrop > 25 && g.catcherYs.some((y) => Math.abs(y - (deskY + 800 - g.placement.gapDrop / 2)) < 0.01), `${mount}: the wall's shadow catcher over the desk top, down over the strip under it (${g.catcherYs.map((y) => y.toFixed(1))}, the strip ${g.placement.gapDrop})`);
    // the hero from about the build's own height (the bake's hero, for a build on the desk, looks down from 20 degrees)
    const hero = g.fits.find((f) => f.name === 'hero'), c = g.build.min.map((v, i) => (v + g.build.max[i]) / 2);
    const heroEl = Math.atan2(hero.y - c[1], Math.hypot(hero.x - c[0], hero.z - c[2])) * 180 / Math.PI;
    assert.ok(Math.abs(heroEl) < 10, `${mount}: the hero from about the build's height (${heroEl.toFixed(1)} degrees)`);
    if (mount === 'wall') {
      near(g.frame.backZ, g.build.min[2], 0.01, 'the mounting frame\'s back plane is the build\'s back');
      near(g.build.min[2] - g.wall.max[2], 0.5, 0.01, 'the wall\'s face just behind the case backs');
      near(g.build.min[1] - deskY, 550, 0.01, 'the build\'s bottom 550 mm over the desk top');
      assert.deepEqual(g.placement.casters, [], 'nothing of the room casts onto a wall build');
      // a wall build moves only a prop that reaches up to it (slideProps' height option): the notebook, 12 mm tall, lies
      // under this one's footprint, where the desk's rule (by footprint alone) would slide it away
      assert.equal(g.slides.notebook, undefined, `the notebook stays put under a wall build (${JSON.stringify(g.slides)})`);
      const nb = g.notebook, gap = g.notebookGap;
      assert.ok(nb.max[0] > g.build.min[0] - gap && nb.min[0] < g.build.max[0] + gap && nb.max[2] > g.build.min[2] - gap && nb.min[2] < g.build.max[2] + gap, 'the notebook lies under the build\'s footprint, within its gap');
      assert.ok(nb.max[1] < g.build.min[1] - gap, 'and wholly below the build');
    } else {
      near(g.desk.min[1], g.build.max[1], 0.01, 'the desk\'s underside on the build\'s top, its rail tops');
      assert.ok(g.railsFront != null, 'the build has its rails');
      near(g.frame.frontZ, g.railsFront, 0.01, 'the mounting frame\'s front is the rails\' own front');
      near(g.desk.max[2], g.railsFront, 0.01, 'its front edge on the rail fronts');
      const proud = g.build.max[2] - g.desk.max[2];
      assert.ok(proud > 20 && proud < 40, `the drawer fronts stand proud of the desk's edge, as the kit mounts (${proud.toFixed(1)} mm)`);
      near(g.build.min[0] - g.leg.max[0], 20, 0.01, 'left-justified: the build\'s left edge 20 mm from the desk\'s left leg');
      assert.deepEqual([...g.placement.casters].sort(), ['desk_leg_l', 'desk_leg_r', 'desk_top'], 'the desk\'s own top and legs cast onto the build');
      assert.ok(g.fits.find((f) => f.name === 'low').y < deskY, 'the low shot looks up from under the desk top');
      assert.deepEqual(g.slides, {}, 'nothing on the desk moves for a build under it (the plant stands over this one\'s left end)');
      // the slab's own rule shows it while the camera is under the rail tops; the hero's camera is over them, where that
      // rule hides it anyway. The low shot puts the camera under them, and the room still keeps the slab out.
      await page.evaluate(() => { const d = window.__GEN2_DONE__; d.setTiming({ holdMs: 1e9, maxFrameMs: 1e9, seed: 1, hold: true }); d.jump('low'); });   // held: the shade below compares two frames of one camera
      await settle(page, 600);
      const low = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; return { surface: v.surface.visible, y: v.camera.position.y, underY: v.mountFrame().underY }; });
      assert.ok(low.y < low.underY, `the low shot's camera under the rail tops (${low.y.toFixed(1)} vs ${low.underY.toFixed(1)})`);
      assert.equal(low.surface, false, 'the builder\'s slab stays out of the room with the camera under it');
      // and the desk's shadow really reaches the map, not just its flags (Sol 01a17311): the same still frame, the map
      // re-rendered each time (the stage renders it on demand), with the casters' flags dropped comes out lighter
      const shade = await page.evaluate(async () => {
        const v = window.__GEN2_VIEWER__, casters = [];
        v.scene.getObjectByName('done-room').traverse((o) => { if (o.isMesh && o.castShadow) casters.push(o); });
        const frame = async () => {
          v.renderer.shadowMap.needsUpdate = true; v.invalidateFrame();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const img = new Image(); img.src = v.renderer.domElement.toDataURL('image/png'); await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data;
        };
        const lit = await frame();
        for (const o of casters) o.castShadow = false;
        const bare = await frame();
        for (const o of casters) o.castShadow = true;
        v.renderer.shadowMap.needsUpdate = true; v.invalidateFrame();
        let shaded = 0, brighter = 0;
        for (let i = 0; i < lit.length; i += 4) {
          const d = (bare[i] + bare[i + 1] + bare[i + 2]) - (lit[i] + lit[i + 1] + lit[i + 2]);
          if (d > 24) shaded++; else if (d < -24) brighter++;
        }
        return { casters: casters.length, shaded, brighter, px: lit.length / 4 };
      });
      // (measured 2026-10-25 at 1280 x 720: 1747 pixels shaded on the build's end by the window, none brighter)
      assert.ok(shade.shaded > 500 && shade.brighter * 10 < shade.shaded, `the desk shades the build in the frame (${JSON.stringify(shade)})`);
    }
    // FAST, no shadow map: the contact disc is for a build standing on the desk, not one hanging off the wall or under it
    await page.evaluate(() => window.__GEN2_VIEWER__.setQuality('fast', { user: true }));
    await settle(page, 600);
    assert.equal(await page.evaluate(() => window.__GEN2_DONE__.placement.sprite), false, `${mount}: no contact disc on Fast`);
    // LEAVING: the studio's rule for its backdrop again (the wall while the camera is in front of it; the slab below it),
    // read in a frame drawn after the scene let go of the stage (2026-10-25: read 400 ms after the scene's hook went, it
    // disagreed with the rule once in about sixty runs, cause not found; the message carries what it read)
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__GEN2_DONE__ && !window.__GEN2_VIEWER__.sceneHeld, null, { timeout: 10_000 }).catch(() => assert.fail(`${mount}: Escape never took the stage back from the scene (page errors ${JSON.stringify(clean(errors))})`));
    await settle(page, 400);
    const back = await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const v = window.__GEN2_VIEWER__, f = v.mountFrame();
      done({ wall: v.wall.visible, surface: v.surface.visible, z: v.camera.position.z > v.wall.position.z, y: v.camera.position.y < f.underY, cinema: v.cinema.on, camera: v.camera.position.toArray().map((n) => +n.toFixed(1)), wallZ: +v.wall.position.z.toFixed(1), underY: f.underY });
    }))));
    const read = `${JSON.stringify(back)}; page errors ${JSON.stringify(clean(errors))}`;
    if (mount === 'wall') assert.equal(back.wall, back.z, `the builder's wall back, by its own rule (${read})`); else assert.equal(back.surface, back.y, `the builder's slab back, by its own rule (${read})`);
    assert.deepEqual(clean(errors), [], `${mount}: no errors`);
    await ctx.close();
  }
});

/* THE ROOM'S WALL AND DESK COLOURS (2026-10-25; Joey: "would it be possible for the user to maybe adjust the wall and maybe
   desk color if the scene?", then "Yes dark wall should also darken the rest of the room"). The final scene's "Wall &
   desk" panel: a paint repaints the wall (its bake times the new paint over the baked one) and takes its share of the
   walls' bounce off every other surface; a plain desk is drawn from the desk's light-only map; the visitor's own colour
   works; Esc closes the panel and keeps the scene; the choice is remembered, opens the next entry and shows in Colors'
   Room stage. The bake's own colours draw the bake itself: every surface its own lightmap at its baked colour, nothing
   taken off. Each effect is read off the picture as well as the materials, not off the flags alone. */
test('Assemble: the Done scene\'s wall and desk colours repaint the room, a dark wall darkens the rest of it, and the choice is remembered', async () => {
  const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'high'); localStorage.setItem('gen2-quality:set', '1'); } catch {} window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 3000 }; });
  const { page, errors } = await open('assemble', { query: '&done=room', context: ctx });
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  const watch = async () => {
    await btn(page, 'Watch the final scene', '#ws-player').click();
    await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 });
    await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1e9, maxFrameMs: 1e9, seed: 1, hold: true }));   // the hero, held (every shot moves since 2026-10-25)
    await settle(page, 600);
  };
  await watch();
  // the frame as the canvas holds it, kept in the page; __diff counts the pixels two frames apart by more than 24 (RGB sum)
  await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__;
    window.__frame = async () => {
      v.renderer.shadowMap.needsUpdate = true; v.invalidateFrame();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const img = new Image(); img.src = v.renderer.domElement.toDataURL('image/png'); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data;
    };
    window.__diff = (a, b) => { let darker = 0, lighter = 0, sum = 0; for (let i = 0; i < a.length; i += 4) { const d = (b[i] + b[i + 1] + b[i + 2]) - (a[i] + a[i + 1] + a[i + 2]); sum += d; if (d > 24) lighter++; else if (d < -24) darker++; } return { darker, lighter, mean: +(sum / (a.length / 4) / 3).toFixed(3), px: a.length / 4 }; };
    // every room material's share of the walls' bounce, off (kept) and back
    window.__bounceOff = (off) => v.scene.getObjectByName('done-room').traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { const b = m.userData.bounce; if (!b) continue; if (off) { b.saved = b.k.clone(); b.k.set(0, 0, 0); } else if (b.saved) { b.k.copy(b.saved); delete b.saved; } } });
    // ... and of the desk's bounce (its second set of tiles), the same way
    window.__deskOff = (off) => v.scene.getObjectByName('done-room').traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { const b = m.userData.bounce; if (!b) continue; if (off) { b.dsaved = b.dk.clone(); b.dk.set(0, 0, 0); } else if (b.dsaved) { b.dk.copy(b.dsaved); delete b.dsaved; } } });
    // the coffee's steam keeps rising on High: out of these frames, which compare colours (its own case reads it)
    for (const n of ['done-steam', 'done-steam-mist']) { const o = v.scene.getObjectByName(n); if (o) o.visible = false; }
  });
  // THE BAKE'S OWN COLOURS draw the bake itself: every surface its own lightmap at its baked colour, no bounce taken off
  const def = await page.evaluate(async () => {
    const out = { read: window.__GEN2_DONE__.colours, saved: localStorage.getItem('gen2-room-colours'), off: [] };
    window.__GEN2_VIEWER__.scene.getObjectByName('done-room').traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m.userData.doneBase) continue; if (m.map !== m.userData.doneMap || !m.color.equals(m.userData.doneBase) || (m.userData.bounce && (m.userData.bounce.k.lengthSq() > 0 || m.userData.bounce.dk.lengthSq() > 0))) out.off.push(o.name); } });
    window.__white = await window.__frame();
    return out;
  });
  assert.deepEqual([def.read.wall, def.read.desk, def.read.wallMap, def.read.deskMap], ['white', 'oak', 'bake', 'bake'], 'the bake\'s own colours');
  assert.deepEqual(def.off, [], 'every surface its bake, at its baked colour, nothing taken off');
  assert.equal(def.saved, null, 'nothing remembered before a choice');
  // THE PANEL, opened from the strip, 8 px over it
  await btn(page, 'Wall & desk', '#ws-scene').click();
  const pop = await page.evaluate(() => { const p = document.querySelector('#ws-scene-colours'), r = p.getBoundingClientRect(), s = document.querySelector('#ws-scene').getBoundingClientRect(); return { hidden: p.hidden, gap: s.top - r.bottom, walls: p.querySelectorAll('.row:first-child .sw button').length, desks: p.querySelectorAll('.row:last-child .sw button').length, own: p.querySelectorAll('label.own input[type="color"]').length }; });
  assert.equal(pop.hidden, false, 'the panel opens');
  near(pop.gap, 8, 1, 'the panel 8 px over the strip');
  assert.deepEqual([pop.walls, pop.desks, pop.own], [9, 5, 2], 'nine paints, five desks, the visitor\'s own colour for each');
  // NAVY: the wall goes navy, and the walls' bounce comes off the rest of the room (the frame with it put back is lighter)
  await page.locator('#ws-scene-colours button[aria-label="Wall: Navy"]').click();
  await settle(page, 600);
  const navy = await page.evaluate(async () => {
    const read = window.__GEN2_DONE__.colours;
    const lit = await window.__frame();
    window.__bounceOff(true); const flat = await window.__frame(); window.__bounceOff(false);
    window.__navy = lit;
    const held = window.__GEN2_VIEWER__.scene.environment;
    return { read, held: held ? held.uuid : null, wall: window.__diff(window.__white, lit), bounce: window.__diff(flat, lit), saved: localStorage.getItem('gen2-room-colours'), pressed: [...document.querySelectorAll('#ws-scene-colours [aria-pressed="true"]')].map((b) => b.getAttribute('aria-label')) };
  });
  assert.equal(navy.read.wall, 'navy');
  assert.equal(navy.read.envs, def.read.envs + 1, 'the room captured again as the build\'s environment');
  // ... and held by the stage as its environment, the one the build reflects, not the capture just disposed (a mutant that
  // kept the old hold after a change passed this case before, 2026-10-25)
  assert.equal(navy.held, navy.read.env, 'the stage holds the new capture as the scene\'s environment');
  assert.ok(navy.wall.darker > navy.wall.px * 0.3, `the wall goes navy (${JSON.stringify(navy.wall)})`);
  assert.ok(navy.read.bounce.desk.every((v) => v > 0) && navy.read.bounce.floor.every((v) => v > 0), `the desk and the floor lose the walls' bounce (${JSON.stringify(navy.read.bounce)})`);
  assert.ok(navy.bounce.darker > navy.bounce.px * 0.02 && navy.bounce.lighter * 10 < navy.bounce.darker, `and darken in the frame (${JSON.stringify(navy.bounce)})`);
  /* each share as the room's own record says it should be: (1 - the walls' weight) x what multiplies the surface's light,
     over its tile's scale (the wall's light: its paint; the oak and the floor: 1), the weight being navy over the bake's
     paint, channel by channel (room.json colours.wall, bounce.meshes) */
  const rec = await page.evaluate(() => fetch('scenes/home-office/room.json').then((r) => r.json()));
  const lin = (h) => [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const rho = lin('#3b4b5e'), rho0 = lin(rec.colours.wall), wgt = rho.map((v, i) => v / rho0[i]);
  for (let i = 0; i < 3; i++) {
    near(navy.read.bounce.wall[i], rho[i] * (1 - wgt[i]) / rec.bounce.meshes.wall_back.scale, 1e-6, `the wall's share, its paint's (${'rgb'[i]})`);
    near(navy.read.bounce.desk[i], (1 - wgt[i]) / rec.bounce.meshes.desk_top.scale, 1e-6, `the oak's share (${'rgb'[i]})`);
    near(navy.read.bounce.floor[i], (1 - wgt[i]) / rec.bounce.meshes.floor.scale, 1e-6, `the floor's share (${'rgb'[i]})`);
  }
  assert.equal(navy.saved, JSON.stringify({ wall: 'navy', desk: 'oak' }), 'remembered');
  assert.deepEqual(navy.pressed, ['Wall: Navy', 'Desk: Oak'], 'the panel marks the choice');
  // WALNUT: the oak's own bake tinted by walnut over the oak's colour as baked, its grain kept, and drawn darker than the
  // oak (Sol 01a17447: no check here could tell a Walnut drawn as the oak)
  await page.locator('#ws-scene-colours button[aria-label="Desk: Walnut"]').click();
  await settle(page, 600);
  const walnut = await page.evaluate(async () => {
    const read = window.__GEN2_DONE__.colours;
    const lit = await window.__frame();
    window.__deskOff(true); const flat = await window.__frame(); window.__deskOff(false);
    return { read, diff: window.__diff(window.__navy, lit), bounce: window.__diff(flat, lit) };
  });
  assert.deepEqual([walnut.read.desk, walnut.read.deskMap], ['walnut', 'bake'], 'walnut: the oak\'s own bake');
  /* THE DESK'S BOUNCE (bounce.desk, 2026-10-25): a tint and a plain colour both carry the desk's diffuse share, and weigh
     their diffuse albedo over the oak's as baked; walnut, darker than the oak, takes the share of the desk's bounce it
     does not give off the floor and the walls (dk > 0, the frame darker with it), white adds what the oak did not */
  const dshare = rec.bounce.desk.share, dalb = rec.bounce.desk.albedo;
  const tint = lin('#6b4a35').map((v, i) => v * dshare[i] / dalb[i]);
  for (let i = 0; i < 3; i++) {
    near(walnut.read.deskColor[i], walnut.read.deskBase[i] * tint[i], 1e-6, `the oak tinted to walnut, the share in it (${'rgb'[i]})`);
    near(walnut.read.deskBounce.weight[i], tint[i], 1e-9, `walnut weighs what it tints (${'rgb'[i]})`);
    near(walnut.read.deskBounce.floor[i], (1 - tint[i]) / rec.bounce.desk.meshes.floor.scale, 1e-6, `the floor's share of the desk's bounce (${'rgb'[i]})`);
    near(walnut.read.deskBounce.wall[i], rho[i] * (1 - tint[i]) / rec.bounce.desk.meshes.wall_back.scale, 1e-6, `the wall's, its paint's (${'rgb'[i]})`);
  }
  assert.ok(walnut.diff.darker > walnut.diff.px * 0.02 && walnut.diff.lighter * 10 < walnut.diff.darker, `the desk goes walnut, darker than the oak (${JSON.stringify(walnut.diff)})`);
  assert.ok(walnut.bounce.darker > walnut.bounce.px * 0.005 && walnut.bounce.lighter * 10 < walnut.bounce.darker, `and the room loses the oak's bounce in the frame (${JSON.stringify(walnut.bounce)})`);
  // ... by about the measured amount (the frame's mean -1.93 levels at 1280 x 720, 2026-10-25; a doubled desk term would
  // pass every uniform check and the direction: Sol 01a1757b): half to one and a half times it
  assert.ok(walnut.bounce.mean < -0.96 && walnut.bounce.mean > -2.9, `and by about the measured amount (${JSON.stringify(walnut.bounce)})`);
  // A WHITE DESK: drawn from its light-only map, its bounce tiles the light's; brighter than the oak, it adds bounce
  await page.locator('#ws-scene-colours button[aria-label="Desk: White"]').click();
  await settle(page, 600);
  const desk = await page.evaluate(async () => {
    const read = window.__GEN2_DONE__.colours;
    const lit = await window.__frame();
    window.__deskOff(true); const flat = await window.__frame(); window.__deskOff(false);
    return { read, diff: window.__diff(window.__navy, lit), bounce: window.__diff(flat, lit) };
  });
  assert.deepEqual([desk.read.desk, desk.read.deskMap], ['white', 'light'], 'the desk from its light-only map');
  assert.notDeepEqual(desk.read.bounce.deskRect, navy.read.bounce.deskRect, 'its bounce tile the light\'s, not the oak\'s');
  assert.notDeepEqual(desk.read.deskBounce.deskRect, walnut.read.deskBounce.deskRect, 'and its desk tile the light\'s too');
  const white = lin('#f0efea').map((v, i) => v * dshare[i]), uw = white.map((v, i) => v / dalb[i]);
  for (let i = 0; i < 3; i++) {
    near(desk.read.bounce.desk[i], white[i] * (1 - wgt[i]) / rec.bounce.meshes['desk_top:light'].scale, 1e-6, `the white desk's share of the walls' bounce, its diffuse colour's (${'rgb'[i]})`);
    near(desk.read.deskBounce.desk[i], white[i] * (1 - uw[i]) / rec.bounce.desk.meshes['desk_top:light'].scale, 1e-6, `and of its own (${'rgb'[i]})`);
    near(desk.read.deskBounce.floor[i], (1 - uw[i]) / rec.bounce.desk.meshes.floor.scale, 1e-6, `the floor gains the desk's bounce (${'rgb'[i]})`);
  }
  assert.ok(uw.every((v) => v > 1) && desk.read.deskBounce.floor.every((v) => v < 0) && desk.read.deskBounce.wall.every((v) => v < 0), `white weighs more than the oak, so the room gains (${JSON.stringify(desk.read.deskBounce)})`);
  assert.ok(desk.diff.lighter > desk.diff.px * 0.05, `the desk goes white (${JSON.stringify(desk.diff)})`);
  // (a gain of a few levels across the wall and the floor: read as the frame's mean, which the 24-level count misses)
  assert.ok(desk.bounce.mean > 0.65 && desk.bounce.mean < 1.95 && desk.bounce.darker * 10 <= desk.bounce.lighter, `and the room is lighter for it in the frame, by about the measured amount (+1.30 at 1280 x 720) (${JSON.stringify(desk.bounce)})`);
  // THE VISITOR'S OWN COLOUR, then navy again
  await page.locator('#ws-scene-colours label.own input').first().fill('#336699');
  await settle(page, 400);
  const mine = await page.evaluate(async () => { const read = window.__GEN2_DONE__.colours; const lit = await window.__frame(); return { read, on: document.querySelector('#ws-scene-colours label.own').classList.contains('on'), diff: window.__diff(window.__white, lit) }; });
  assert.deepEqual([mine.read.wall, mine.on], ['#336699', true], 'the visitor\'s own wall colour');
  const own = lin('#336699');   // and the wall painted in it, not only chosen (Sol 01a17447)
  for (let i = 0; i < 3; i++) near(mine.read.wallColor[i], mine.read.wallBase[i] * own[i] / rho0[i], 1e-6, `the wall painted in it (${'rgb'[i]})`);
  assert.ok(mine.diff.darker > mine.diff.px * 0.3, `and drawn in it (${JSON.stringify(mine.diff)})`);  await page.locator('#ws-scene-colours button[aria-label="Wall: Navy"]').click();
  await settle(page, 400);
  // Esc closes the panel and keeps the scene; the next Esc leaves it
  await page.keyboard.press('Escape');
  await settle(page, 300);
  assert.deepEqual(await page.evaluate(() => ({ hidden: document.querySelector('#ws-scene-colours').hidden, scene: !!window.__GEN2_DONE__ })), { hidden: true, scene: true }, 'Esc closes the panel, the scene stays');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__GEN2_DONE__ && !window.__GEN2_VIEWER__.sceneHeld, null, { timeout: 10_000 }).catch(() => assert.fail(`Escape never left the scene (page errors ${JSON.stringify(clean(errors))})`));
  // THE NEXT ENTRY opens in the remembered colours, its environment captured once, in them
  await watch();
  const again = await page.evaluate(() => window.__GEN2_DONE__.colours);
  assert.deepEqual([again.wall, again.desk, again.envs], ['navy', 'white', 1], 'the next entry in the remembered colours');
  // COLORS' ROOM STAGE shows the same choice
  await page.goto(`${base}/index.html?ws=colors&debug=1&done=room`, { waitUntil: 'load', timeout: 90_000 });
  await waitBoot(page);
  await page.locator('#ws-tools .backdrop button:has-text("Room")').click();
  await page.waitForFunction(() => !!document.querySelector('#ws-colors .roomc'), null, { timeout: 60_000 }).catch(() => assert.fail('the Room stage brought no wall and desk control'));
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#ws-colors .roomc [aria-pressed="true"]')].map((b) => b.getAttribute('aria-label'))), ['Wall: Navy', 'Desk: White'], 'Colors\' Room stage shows the same choice');
  assert.deepEqual(clean(errors), [], 'no errors');
  await ctx.close();
});

/* MATTE BLACK IS THE FLOOR (Joey 2026-10-27: a black wall and the Black desk with an all-black build left the room nearly
   black and the build gone, "maybe we can limit how black is black"; his pick of four renders, the floor alone). No wall
   or desk colour draws darker than #38393b: a black wall of the visitor's own draws as a #38393b one, the Black desk
   preset as a #38393b desk of the visitor's own, and a black desk the same; the swatches show the floor, and the own
   chip says it lifted the pick. Read off the materials as drawn (done.js colours) and the panel. */
test('Assemble: the Done scene\'s room has a floor at matte black: a black wall, a black desk and the Black preset draw as #38393b, and their swatches show it', async () => {
  const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'high'); localStorage.setItem('gen2-quality:set', '1'); } catch {} window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 3000 }; });
  const { page, errors } = await open('assemble', { query: '&done=room', context: ctx });
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 });
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1e9, maxFrameMs: 1e9, seed: 1, hold: true }));
  await btn(page, 'Wall & desk', '#ws-scene').click();
  const P = '#ws-scene-colours';
  const read = async () => { await settle(page, 400); return page.evaluate(() => window.__GEN2_DONE__.colours); };
  const own = (i) => page.locator(`${P} label.own input`).nth(i);
  // the walls: black of the visitor's own draws exactly as the floor's own colour does
  await own(0).fill('#38393b'); const floorWall = await read();
  await own(0).fill('#000000'); const blackWall = await read();
  assert.equal(blackWall.wall, '#000000', 'the choice is the visitor\'s, remembered as picked');
  for (let i = 0; i < 3; i++) near(blackWall.wallColor[i], floorWall.wallColor[i], 1e-9, `a black wall draws as matte black (${'rgb'[i]})`);
  assert.ok(blackWall.wallColor.every((v) => v > 0.01), `and is not black (${blackWall.wallColor})`);
  const chip = await page.evaluate((P) => { const l = document.querySelector(`${P} label.own`); return { c: l.style.getPropertyValue('--c').trim(), title: l.title }; }, P);
  assert.equal(chip.c, '#38393b', 'the own chip shows the colour it draws, not the black picked');
  assert.match(chip.title, /lifted to #38393b/, 'and says it lifted the pick');
  // the desk (a plain colour needs the bake's light-only map): the Black preset, a black desk of the visitor's own and a
  // #38393b one all draw alike; the Black swatch shows the floor
  assert.equal(await page.evaluate(() => window.__GEN2_DONE__.colours.plainDesk), true, 'the room ships its light-only desk map (plain desks)');
  await page.locator(`${P} button[aria-label="Desk: Black"]`).click(); const preset = await read();
  await own(1).fill('#38393b'); const floorDesk = await read();
  await own(1).fill('#000000'); const blackDesk = await read();
  assert.deepEqual([preset.deskMap, blackDesk.deskMap], ['light', 'light'], 'plain desks, from the light-only map');
  for (let i = 0; i < 3; i++) { near(preset.deskColor[i], floorDesk.deskColor[i], 1e-9, `the Black preset draws as matte black (${'rgb'[i]})`); near(blackDesk.deskColor[i], floorDesk.deskColor[i], 1e-9, `so does a black desk of the visitor's own (${'rgb'[i]})`); }
  assert.equal(await page.evaluate((P) => document.querySelector(`${P} button[aria-label="Desk: Black"]`).style.getPropertyValue('--c').trim(), P), '#38393b', 'the Black swatch shows the floor it draws (#2a2b2d before)');
  // a colour over the floor is its own: charcoal's swatch is its hex
  assert.equal(await page.evaluate((P) => document.querySelector(`${P} button[aria-label="Wall: Charcoal"]`).style.getPropertyValue('--c').trim(), P), '#47494d', 'charcoal, over the floor, untouched');
  assert.deepEqual(clean(errors), [], 'no errors');
  await ctx.close();
});

/* THE SHADOWS RUN FROM THE DESK ONTO THE WALL (2026-10-25; Joey: "the way the shadows cut off or start right at where the
   table is nearest the wall, i see it for both the plant and build shadows"). The desk stands 20 mm off the wall, and the
   sun reaches a strip of wall under the desk top through that gap; the build's wall catcher and the props' wall masks
   stopped above it, so a lit line parted the shadow on the desk from the one on the wall. They reach down over the strip
   now (done-fit.js gapDrop): read off the catcher and the masks as drawn, and off the frame, the catcher put back to its
   old extent for one frame. */
test('Assemble: the Done scene\'s shadows run from the desk top onto the wall, over the strip of wall the sun reaches under the desk top', async () => {
  const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'high'); localStorage.setItem('gen2-quality:set', '1'); } catch {} window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 3000 }; });
  const { page, errors } = await open('assemble', { query: '&done=room', context: ctx });
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 });
  await page.evaluate(() => { window.__GEN2_DONE__.setTiming({ holdMs: 1e9, maxFrameMs: 1e9, seed: 1 }); window.__GEN2_DONE__.jump('top'); });
  await settle(page, 800);
  // the strip, from the room's own record: the gap behind the desk times the sun's rise over its run toward the room, + 3 mm
  const rec = await page.evaluate(() => fetch('scenes/home-office/room.json').then((r) => r.json()));
  const gap = rec.desk.zBack - (rec.anchors.wall[2] - rec.anchors.tabletop[2]);
  const want = gap * rec.sun.dir[1] / rec.sun.dir[2] + 3;
  const st = await page.evaluate(() => ({ place: window.__GEN2_DONE__.placement, shadows: window.__GEN2_DONE__.shadows }));
  near(st.place.gapDrop, want, 1e-3, 'the strip the sun reaches under the desk top');
  assert.ok(gap > 0 && st.place.gapDrop > 25 && st.place.gapDrop < 40, `about 33 mm in this room (${st.place.gapDrop}, the gap ${gap} mm)`);
  near(st.place.wallCatcherBottom, st.place.deskY - want, 1e-3, 'the build\'s wall catcher reaches down over it');
  const walls = st.shadows.filter((s) => s.surface === 'wall' && s.visible);
  assert.ok(walls.length >= 1, 'the props cast onto the wall');
  for (const s of walls) {
    assert.ok(s.y - s.h / 2 <= st.place.deskY - want + 1e-3, `the ${s.group}'s wall mask reaches down over it (${s.y - s.h / 2})`);
    assert.ok(s.vMin < 0, `drawing its own bottom row on down, not its picture stretched (vMin ${s.vMin})`);
  }
  // the picture: the wall catcher back at its old extent, from the desk top up, for one frame; drawn as it is, the strip under
  // the desk top is darker where the build's shadow crosses it, and nothing is lighter
  const diff = await page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__;
    let wall = null; v.scene.traverse((o) => { if (o.isMesh && o.material && o.material.isShadowMaterial && o.geometry.parameters.height > 1600) wall = o; });
    const steam = ['done-steam', 'done-steam-mist'].map((n) => v.scene.getObjectByName(n)).filter(Boolean);
    for (const o of steam) o.visible = false;   // it keeps rising on High: out of the two frames compared
    const frame = async () => {
      v.renderer.shadowMap.needsUpdate = true; v.invalidateFrame();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const img = new Image(); img.src = v.renderer.domElement.toDataURL('image/png'); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data;
    };
    const now = await frame();
    const h = wall.geometry.parameters.height, y = wall.position.y, drop = h - 1600;
    wall.scale.y = 1600 / h; wall.position.y = y + drop / 2;
    const old = await frame();
    wall.scale.y = 1; wall.position.y = y; for (const o of steam) o.visible = true; v.invalidateFrame();
    let darker = 0, lighter = 0;
    for (let i = 0; i < now.length; i += 4) { const d = (now[i] + now[i + 1] + now[i + 2]) - (old[i] + old[i + 1] + old[i + 2]); if (d < -24) darker++; else if (d > 24) lighter++; }
    return { darker, lighter, drop, px: now.length / 4 };
  });
  assert.ok(diff.darker > 1500 && diff.lighter === 0, `the strip under the desk top in the build's shadow (${JSON.stringify(diff)}; 4609 px when written)`);
  assert.deepEqual(clean(errors), [], 'no errors');
  await ctx.close();
});

/* THE DESK'S SHEEN AND THE COFFEE'S STEAM (2026-10-25). Joey: "the black desk feels like a void? maybe a slight sheen or
   reflection on the table surface?", and "is there anyway to add a steaming animation to the coffee?". A plain desk's
   coat reflects the room's environment (done.js addSheen); the oak and the walnut stay matte. Read off the material and
   off the frame (the sheen taken off for one frame), and again after the wall changes, when the room is captured again
   and the desk must reflect the new capture. The steam (makeSteam, done-fit.js steamRate) rises at High's 24 frames a
   second while it is in the shot, and the held shot draws no more than that (it drew 120 a second when each of the
   steam's frames invalidated the picture: the idle gate stayed open; a software runner draws slower than either, so
   there this bound cannot fail); it changes nothing in the frame outside its own column, stops with its mug hidden or
   out of the shot, holds still on Fast, and on Very High rises only while the camera moves, so a still shot converges. */
test('Assemble: the Done scene\'s plain desk reflects the room and the oak does not; the coffee steams at its tier\'s rate, in its own column only', { skip: ROOM_SOFT_SKIP }, async () => {
  const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'high'); localStorage.setItem('gen2-quality:set', '1'); } catch {} window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 3000 }; });
  const { page, errors } = await open('assemble', { query: '&done=room', context: ctx });
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 });
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1e9, maxFrameMs: 1e9, seed: 1, hold: true }));   // the hero, held (every shot moves since 2026-10-25)
  await settle(page, 800);
  await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__;
    window.__frame = async () => {
      v.renderer.shadowMap.needsUpdate = true; v.invalidateFrame();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const img = new Image(); img.src = v.renderer.domElement.toDataURL('image/png'); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data;
    };
    window.__diff = (a, b) => { let darker = 0, lighter = 0; for (let i = 0; i < a.length; i += 4) { const d = (b[i] + b[i + 1] + b[i + 2]) - (a[i] + a[i + 1] + a[i + 2]); if (d > 24) lighter++; else if (d < -24) darker++; } return { darker, lighter, px: a.length / 4 }; };
    window.__desk = () => [].concat(v.scene.getObjectByName('done-room').getObjectByName('desk_top').material).find((m) => m.userData.sheen);
    /* the steam over `ms`: its ticks, its clock, its uniform's, the stage's frames drawn, and its calls for a frame
       (stage.drawNextFrame, counted on the way through: on a slow runner the frames drawn cannot tell them apart from the
       once-a-second safety net, Sol 01a174d3) */
    window.__steamOver = async (ms) => {
      const d = window.__GEN2_DONE__, a = d.steam, ia = v.idleStats(), t0 = performance.now(), next = v.drawNextFrame;
      let calls = 0; v.drawNextFrame = () => { calls++; next(); };
      try { await new Promise((r) => setTimeout(r, ms)); } finally { v.drawNextFrame = next; }
      const b = d.steam, ib = v.idleStats();
      return { rate: b.rate, shown: b.shown, visible: b.visible, ticks: b.ticks - a.ticks, calls, t: +(b.t - a.t).toFixed(3), uTime: +(b.uTime - a.uTime).toFixed(3), drawn: ib.drawn - ia.drawn, ms: Math.round(performance.now() - t0) };
    };
  });
  // THE OAK: matte, no environment on the desk
  const oak = await page.evaluate(() => window.__GEN2_DONE__.colours);
  assert.deepEqual([oak.desk, oak.deskSheen], ['oak', { on: 0, rough: 0.35, env: false, current: false }], 'the oak: no sheen');
  // A BLACK DESK reflects the room: lighter where it shows the lit room, and next to nowhere darker
  await page.evaluate(() => window.__GEN2_DONE__.setRoomColours({ wall: 'white', desk: 'black' }));
  await settle(page, 600);
  const black = await page.evaluate(async () => {
    const read = window.__GEN2_DONE__.colours, m = window.__desk();
    const steam = ['done-steam', 'done-steam-mist'].map((n) => window.__GEN2_VIEWER__.scene.getObjectByName(n));
    for (const o of steam) o.visible = false;   // the sheen the one difference between the two frames (Sol 01a174d3): the steam keeps rising on High
    const lit = await window.__frame();
    m.userData.sheen.on.value = 0; const flat = await window.__frame(); m.userData.sheen.on.value = 1; for (const o of steam) o.visible = true; window.__GEN2_VIEWER__.invalidateFrame();
    // the lift by where it lands: the pixels lifted strongly, and the mean lift over the upper (farther, more grazing) half
    // of the lifted pixels against the lower
    let strong = 0; const rows = [];
    const w = window.__GEN2_VIEWER__.renderer.domElement.width;
    for (let i = 0; i < lit.length; i += 4) { const d = (lit[i] + lit[i + 1] + lit[i + 2]) - (flat[i] + flat[i + 1] + flat[i + 2]); if (d > 120) strong++; if (d > 24) rows.push([Math.floor(i / 4 / w), d]); }
    rows.sort((p, q) => p[0] - q[0]);
    const half = Math.floor(rows.length / 2), mean = (a) => a.reduce((s, p) => s + p[1], 0) / Math.max(1, a.length);
    return { read, diff: window.__diff(flat, lit), strong, far: +mean(rows.slice(0, half)).toFixed(1), near: +mean(rows.slice(half)).toFixed(1) };
  });
  assert.deepEqual([black.read.desk, black.read.deskMap], ['black', 'light'], 'the black desk, from its light-only map');
  assert.deepEqual(black.read.deskSheen, { on: 1, rough: 0.35, env: true, current: true }, 'its sheen on, reflecting the room as captured last');
  assert.ok(black.diff.lighter > black.diff.px * 0.02 && black.diff.darker * 20 < black.diff.lighter, `and drawn: the desk lighter for the room it reflects (${JSON.stringify(black.diff)})`);
  /* most toward grazing, as a coat's Fresnel rises (measured when written: 46,275 of 151,518 lifted pixels by over 120,
     the far half 131 against the near half's 68; held at the normal's 0.04 throughout, 4 pixels and 47 against 36) */
  assert.ok(black.strong > black.diff.lighter * 0.1 && black.far > black.near * 1.5, `and most toward grazing (${JSON.stringify({ strong: black.strong, lighter: black.diff.lighter, far: black.far, near: black.near })})`);
  // A NEW WALL: the room captured again, and the desk reflects the new capture, not the one disposed
  await page.evaluate(() => window.__GEN2_DONE__.setRoomColours({ wall: 'navy', desk: 'black' }));
  await settle(page, 600);
  const navy = await page.evaluate(() => window.__GEN2_DONE__.colours);
  assert.equal(navy.envs, black.read.envs + 1, 'the room captured again');
  assert.deepEqual(navy.deskSheen, { on: 1, rough: 0.35, env: true, current: true }, 'and the desk reflects the new capture');
  // THE WALNUT: matte again, its environment dropped
  await page.evaluate(() => window.__GEN2_DONE__.setRoomColours({ wall: 'navy', desk: 'walnut' }));
  await settle(page, 600);
  assert.deepEqual((await page.evaluate(() => window.__GEN2_DONE__.colours)).deskSheen, { on: 0, rough: 0.35, env: false, current: false }, 'the walnut: no sheen');
  // THE STEAM, on High at the held hero: its foot on the coffee's top, 2.8 by 4.6 of the mug's radii, a ghost to the AO and
  // the outline
  const st = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__, c = v.scene.getObjectByName('done-room').getObjectByName('coffee');
    c.geometry.computeBoundingBox(); const b = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld);
    return { steam: window.__GEN2_DONE__.steam, coffee: { x: (b.min.x + b.max.x) / 2, y: b.max.y, z: (b.min.z + b.max.z) / 2, r: (b.max.x - b.min.x) / 2 } };
  });
  assert.deepEqual([st.steam.rate, st.steam.shown, st.steam.ghost], [24, true, true], 'High: 24 frames a second, shown, a ghost');
  near(st.steam.foot[0], st.coffee.x, 0.5, 'its foot over the coffee (x)');
  near(st.steam.foot[2], st.coffee.z, 0.5, 'its foot over the coffee (z)');
  near(st.steam.foot[1], st.coffee.y, 1.5, 'on the coffee\'s top');
  near(st.steam.w, 2.8 * st.coffee.r, 1, 'its width off the mug');
  near(st.steam.h, 4.6 * st.coffee.r, 1.5, 'its height off the mug');
  assert.equal(st.steam.sheets, 4, 'four sheets stood across the coffee');
  assert.deepEqual([st.steam.mist.on, st.steam.mist.ghost, st.steam.mist.clock], [true, true, true], 'and a mist on it, a ghost, on the same clock');
  near(st.steam.mist.at[0], st.coffee.x, 0.5, 'the mist over the coffee (x)');
  near(st.steam.mist.at[2], st.coffee.z, 0.5, 'the mist over the coffee (z)');
  near(st.steam.mist.at[1], st.coffee.y + 1.5, 0.5, 'the mist 1.5 mm over its surface');
  await page.waitForFunction(() => { const v = window.__GEN2_VIEWER__; return !v.aoWanted() || (!v.ao.blocked && v.ao.passes >= (v.ao.accumMax || 0)); }, null, { timeout: 60_000 });   // High's AO converged: the frames below differ by the steam alone
  const high = await page.evaluate(() => window.__steamOver(2000));
  // at least one frame and some time, not more (Sol 01a174d3): a software runner's frames can come 700 ms apart, and the
  // clock takes at most 0.1 s a frame
  assert.ok(high.ticks >= 1 && high.ticks <= 24 * high.ms / 1000 + 2, `it rises at no more than 24 frames a second (${JSON.stringify(high)})`);
  assert.ok(high.uTime > 0 && high.t <= high.ms / 1000 + 0.05, `its clock runs, no faster than time (${JSON.stringify(high)})`);
  assert.equal(high.calls, high.ticks, `each tick asks the stage for its frame (${JSON.stringify(high)})`);
  assert.ok(high.drawn >= high.ticks - 2 && high.drawn <= 24 * high.ms / 1000 + 8, `and the held shot draws the frames it asks for, each of them, not the display's rate (${JSON.stringify(high)})`);
  /* two frames 400 ms apart: the steam moved, inside its own volume (a box of its width round its foot, its height), and
     nothing else in the frame changed. And where it stands just over the coffee (a band from the coffee's far edge, above
     the mist, up a sixth of the steam's height), drawn against the same frame without it at three moments: it covers most
     of the coffee's width (a column counts where the steam adds at least 30 % of the most it adds in the band), not one
     column up from the middle, its first form */
  const col = await page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__, T = v.THREE, cam = v.camera, el = v.renderer.domElement, s = window.__GEN2_DONE__.steam;
    const a = await window.__frame(); await new Promise((r) => setTimeout(r, 400)); const b = await window.__frame();
    const f = new T.Vector3(...s.foot), r = s.w / 2.8;
    const scr = (p) => { const q = p.clone().project(cam); return [(q.x + 1) / 2 * el.width, (1 - q.y) / 2 * el.height]; };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const dx of [-s.w / 2, s.w / 2]) for (const dz of [-s.w / 2, s.w / 2]) for (const dy of [0, s.h]) {
      const [px, py] = scr(f.clone().add(new T.Vector3(dx, dy, dz)));
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    let inside = 0, outside = 0;
    for (let y = 0; y < el.height; y++) for (let x = 0; x < el.width; x++) {
      const i = (y * el.width + x) * 4;
      if (Math.abs((b[i] + b[i + 1] + b[i + 2]) - (a[i] + a[i + 1] + a[i + 2])) <= 6) continue;
      if (x >= x0 - 3 && x <= x1 + 3 && y >= y0 - 3 && y <= y1 + 3) inside++; else outside++;
    }
    const toCam = cam.position.clone().sub(f); toCam.y = 0; toCam.normalize();
    const right = new T.Vector3(toCam.z, 0, -toCam.x);
    const far = scr(f.clone().addScaledVector(toCam, -r)), top = scr(f.clone().add(new T.Vector3(0, s.h / 6, 0)));
    const xl = scr(f.clone().addScaledVector(right, -r))[0], xr = scr(f.clone().addScaledVector(right, r))[0];
    const bx0 = Math.round(Math.min(xl, xr)), bx1 = Math.round(Math.max(xl, xr)), by0 = Math.round(top[1]), by1 = Math.round(far[1]) - 2;
    const steam = ['done-steam', 'done-steam-mist'].map((n) => v.scene.getObjectByName(n));
    const add = new Float32Array(bx1 - bx0 + 1);
    for (let k = 0; k < 3; k++) {
      const on = await window.__frame();
      for (const o of steam) o.visible = false;
      const off = await window.__frame();
      for (const o of steam) o.visible = true;
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) { const i = (y * el.width + x) * 4; add[x - bx0] = Math.max(add[x - bx0], (on[i] + on[i + 1] + on[i + 2]) - (off[i] + off[i + 1] + off[i + 2])); }
      await new Promise((r) => setTimeout(r, 300));
    }
    const most = Math.max(...add), across = add.filter((d) => d >= 0.3 * most).length / add.length;
    return { inside, outside, across: +across.toFixed(3), most, band: [bx0, by0, bx1, by1], rect: [x0, y0, x1, y1].map(Math.round) };
  });
  assert.ok(col.inside > 50 && col.outside === 0, `the steam moved in its own volume, and nothing else in the frame changed (${JSON.stringify(col)})`);
  assert.ok(col.band[3] > col.band[1] && col.most > 20 && col.across >= 0.75, `just over the coffee the steam covers most of its width (${JSON.stringify(col)})`);
  // OUT OF THE SHOT (the macro, on the drawer's face): no frames, its clock stopped; and with its mug hidden, the same
  await page.evaluate(() => window.__GEN2_DONE__.jump('macro'));
  await settle(page, 600);
  const away = await page.evaluate(() => window.__steamOver(1500));
  assert.deepEqual([away.ticks, away.calls, away.t], [0, 0, 0], `out of the shot it asks for no frames and its clock stops (${JSON.stringify(away)})`);
  await page.evaluate(() => window.__GEN2_DONE__.jump('hero'));
  await settle(page, 600);
  const hidden = await page.evaluate(async () => {
    const c = window.__GEN2_VIEWER__.scene.getObjectByName('done-room').getObjectByName('coffee');
    c.visible = false; await new Promise((r) => setTimeout(r, 200));
    const r = await window.__steamOver(1500);
    c.visible = true; window.__GEN2_VIEWER__.invalidateFrame();
    return r;
  });
  assert.deepEqual([hidden.shown, hidden.ticks, hidden.calls, hidden.t], [false, 0, 0, 0], `with its mug hidden it asks for no frames (${JSON.stringify(hidden)})`);
  // FAST: a still wisp
  await page.evaluate(() => window.__GEN2_VIEWER__.setQuality('fast', { user: true }));
  await settle(page, 800);
  const fast = await page.evaluate(() => window.__steamOver(1500));
  assert.deepEqual([fast.rate, fast.ticks, fast.calls, fast.t], [0, 0, 0, 0], `Fast: a still wisp (${JSON.stringify(fast)})`);
  assert.equal(fast.visible, false, 'and, since Fast\'s shots drift, not drawn: the change of tier hid it (done-fit.js steamShown)');
  // VERY HIGH: still through a still shot, whose mean converges where this runner's accumulator runs; rising through a
  // moving one, on the frames its move draws, asking for none of its own
  await page.evaluate(() => window.__GEN2_VIEWER__.setQuality('veryhigh', { user: true }));
  await settle(page, 800);
  await page.evaluate(() => window.__GEN2_DONE__.jump('hero'));
  await settle(page, 800);
  const vh = await page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__, r = await window.__steamOver(1500);
    let converged = null;
    if (v.acc.ok) { const t0 = performance.now(); while (v.acc.n < v.accTotal() && performance.now() - t0 < 90_000) await new Promise((ok) => setTimeout(ok, 100)); converged = v.acc.n >= v.accTotal(); }   // the lens case's 90 s
    return { ...r, ok: v.acc.ok, converged };
  });
  assert.deepEqual([vh.rate, vh.ticks, vh.calls, vh.t], ['motion', 0, 0, 0], `Very High, a still shot: the wisp holds (${JSON.stringify(vh)})`);
  assert.equal(vh.visible, true, 'drawn again on Very High, where nothing drifts');
  if (vh.ok) assert.equal(vh.converged, true, `and the still shot's mean converges (${JSON.stringify(vh)})`);
  await page.evaluate(() => { const d = window.__GEN2_DONE__; d.setTiming({ holdMs: 4000, maxFrameMs: 1e9, seed: 1, hold: false }); d.jump('slide'); });
  const mv = await page.evaluate(() => window.__steamOver(1500));
  assert.ok(mv.uTime > 0 && mv.ticks === 0 && mv.calls === 0, `a moving shot on Very High: the wisp rises with the camera's move, asking for no frames of its own (${JSON.stringify(mv)})`);
  assert.deepEqual(clean(errors), [], 'no errors');
  await ctx.close();
});

/* THE STILL SHOTS' DRIFT (2026-10-25; Joey: "maybe on static screens, like would it be possible to slowly zoom in or out
   slightly, like without it rerendering the scene ... maybe this would work on low end pc's as well"). On Fast, where
   every shot is still: the hero's picture pushes in by a CSS transform on the canvas while the stage draws only its
   once-a-second safety net, the canvas's box clipping it; the next shot takes its own drift from the shot as framed;
   leaving puts the canvas back; the steam, which cannot move on Fast, is not drawn (Joey: "it's the obvious dead giveaway
   that it's a static image"). On High a moving shot has none and a still one does, the steam rising over it. Very High
   has none ("on very high we never use this static image zoom feature"), and a change to it ends one. Under reduced
   motion there is none at all. */
test('Assemble: the Done scene\'s still shots drift, the picture slowly pushed in or slid without the scene drawn again, on every tier but Very High', async () => {
  const enterScene = async (page) => {
    await btn(page, 'Skip to the finished build', '#ws-steps').click();
    await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
    await btn(page, 'Next', '#ws-player').click();
    await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
    await btn(page, 'Watch the final scene', '#ws-player').click();
    await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 });
  };
  const scale = (m) => { const v = /matrix\(([^,]+)/.exec(m || ''); return v ? +v[1] : 1; };
  // FAST
  const { ctx, page, errors } = await open('assemble', { query: '&done=room' });
  await page.evaluate(() => { window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 3000 }; });
  await enterScene(page);
  await page.evaluate(() => { const d = window.__GEN2_DONE__; d.setTiming({ holdMs: 6000, maxFrameMs: 1e9, seed: 1 }); d.jump('hero'); });
  await settle(page, 2000);   // past the jump's own frames and the idle gate's settle time after them, on a slow runner too
  const a = await page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__, d = window.__GEN2_DONE__, i0 = v.idleStats(), d0 = d.drift;
    await new Promise((r) => setTimeout(r, 1500));
    return { d0, d1: d.drift, drawn: v.idleStats().drawn - i0.drawn, mode: d.sequence.mode, shot: d.sequence.shot };
  });
  assert.deepEqual([a.mode, a.shot, a.d0.plan && a.d0.plan.kind, a.d0.state, a.d0.clip], ['still', 'hero', 'in', 'running', 'hidden'], `Fast: the hero pushes in, its canvas's box clipping it (${JSON.stringify(a.d0)})`);
  assert.ok(scale(a.d1.transform) > scale(a.d0.transform) + 0.004, `the picture grows (${a.d0.transform} -> ${a.d1.transform})`);
  const o = a.d0.plan.origin;
  const set = (a.d0.origin.match(/[\d.]+(?=%)/g) || []).map(Number);   // the page writes "50.00%" back as "50%"
  assert.ok(set.length === 2 && Math.abs(set[0] - o.x * 100) < 0.01 && Math.abs(set[1] - o.y * 100) < 0.01, `about the build's place in the frame (${a.d0.origin} for ${JSON.stringify(o)})`);
  assert.ok(o.x >= 0.2 && o.x <= 0.8 && o.y >= 0.2 && o.y <= 0.8, `held inside the frame's middle (${JSON.stringify(o)})`);
  // the coffee's steam cannot move on Fast: a frozen wisp in a zooming picture gives it away, so it is not drawn (Joey)
  assert.equal((await page.evaluate(() => window.__GEN2_DONE__.steam)).visible, false, 'Fast: no steam over the drifting picture');
  assert.ok(a.drawn <= 3, `while the stage draws only its safety net (${a.drawn} frames in 1.5 s)`);
  // the next shot: the last drift cleared in the black, its own from the shot as framed
  await page.waitForFunction(() => window.__GEN2_DONE__.sequence.shot !== 'hero' && window.__GEN2_DONE__.drift.state === 'running', null, { timeout: 30_000 });
  const b = await page.evaluate(() => ({ drift: window.__GEN2_DONE__.drift, shot: window.__GEN2_DONE__.sequence.shot }));
  assert.ok(b.drift.plan.kind !== 'in' && scale(b.drift.transform) >= 1, `the next shot (${b.shot}) drifts its own way (${b.drift.plan.kind}, ${b.drift.transform})`);
  // a resize re-lands the still where it is, and its drift ends there (about the old framing it would carry the build off)
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width - 80, height: vp.height - 40 });
  await settle(page, 600);
  const resized = await page.evaluate(() => window.__GEN2_DONE__.drift);
  assert.deepEqual([resized.plan, resized.transform], [null, 'none'], `a resize ends the shot's drift (${JSON.stringify(resized)})`);
  await page.setViewportSize(vp);
  // leaving: the canvas as it was
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__GEN2_DONE__, null, { timeout: 15_000 });
  const gone = await page.evaluate(() => { const el = window.__GEN2_VIEWER__.renderer.domElement; return { transform: getComputedStyle(el).transform, clip: el.parentElement.style.overflow, origin: el.style.transformOrigin, anims: el.getAnimations().length }; });
  assert.deepEqual([gone.transform, gone.anims, gone.origin], ['none', 0, ''], `leaving puts the canvas back (${JSON.stringify(gone)})`);
  assert.equal(gone.clip, '', 'its box unclipped again');
  // a second visit counts its drifts afresh: its hero pushes in, then the next shot takes the first slide again
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering && d.drift.state === 'running'; }, null, { timeout: 60_000 });
  const again = await page.evaluate(() => window.__GEN2_DONE__.drift);
  assert.deepEqual([again.plan.kind, again.n], ['in', 1], `the next visit's hero pushes in, its count begun again (${JSON.stringify(again)})`);
  assert.deepEqual(clean(errors), [], 'no errors (Fast)');
  await ctx.close();
  // HIGH: every shot moves its camera and none drifts; a held one (the debug hold, as the still shots were) does
  const hctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await hctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'high'); localStorage.setItem('gen2-quality:set', '1'); } catch {} window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 3000 }; });
  const hi = await open('assemble', { query: '&done=room', context: hctx });
  await enterScene(hi.page);
  await hi.page.evaluate(() => { const d = window.__GEN2_DONE__; d.setTiming({ holdMs: 4000, maxFrameMs: 1e9, seed: 1 }); d.jump('push'); });
  await settle(hi.page, 600);
  const push = await hi.page.evaluate(() => ({ drift: window.__GEN2_DONE__.drift, moving: window.__GEN2_DONE__.sequence.moving }));
  assert.deepEqual([push.moving, push.drift.plan, push.drift.transform], [true, null, 'none'], `High: a moving shot moves its camera, no drift (${JSON.stringify(push)})`);
  await hi.page.evaluate(() => window.__GEN2_DONE__.jump('top'));
  await settle(hi.page, 600);
  const topMv = await hi.page.evaluate(() => ({ drift: window.__GEN2_DONE__.drift, moving: window.__GEN2_DONE__.sequence.moving }));
  assert.deepEqual([topMv.moving, topMv.drift.plan, topMv.drift.transform], [true, null, 'none'], `High: the top shot moves too, no drift (Joey 2026-10-25: "There are a lot of frozen views") (${JSON.stringify(topMv)})`);
  await hi.page.evaluate(() => { const d = window.__GEN2_DONE__; d.setTiming({ holdMs: 4000, maxFrameMs: 1e9, seed: 1, hold: true }); d.jump('top'); });
  await settle(hi.page, 600);
  const top = await hi.page.evaluate(() => ({ drift: window.__GEN2_DONE__.drift, steam: window.__GEN2_DONE__.steam.visible }));
  assert.equal(top.drift.state, 'running', `a held one drifts (${JSON.stringify(top.drift)})`);
  assert.equal(top.steam, true, 'and the steam, which rises on High, is drawn over it');
  // VERY HIGH: a change of tier ends the drift on screen, and its still shots have none (its converged pictures, Joey)
  await hi.page.evaluate(() => window.__GEN2_VIEWER__.setQuality('veryhigh', { user: true }));
  await settle(hi.page, 800);
  const vh0 = await hi.page.evaluate(() => window.__GEN2_DONE__.drift);
  assert.deepEqual([vh0.plan, vh0.transform], [null, 'none'], `the change to Very High ends the drift (${JSON.stringify(vh0)})`);
  await hi.page.evaluate(() => window.__GEN2_DONE__.jump('hero'));
  await settle(hi.page, 800);
  const vh1 = await hi.page.evaluate(() => ({ drift: window.__GEN2_DONE__.drift, moving: window.__GEN2_DONE__.sequence.moving, steam: window.__GEN2_DONE__.steam.visible }));
  assert.deepEqual([vh1.moving, vh1.drift.plan, vh1.drift.transform, vh1.steam], [false, null, 'none', true], `Very High: a still shot is not zoomed (${JSON.stringify(vh1)})`);
  assert.deepEqual(clean(hi.errors), [], 'no errors (High, Very High)');
  await hctx.close();
  // REDUCED MOTION: none
  const rctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  await rctx.addInitScript(FAST);
  const rm = await open('assemble', { query: '&done=room', context: rctx });
  await btn(rm.page, 'Skip to the finished build', '#ws-steps').click();
  await rm.page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(rm.page, 'Next', '#ws-player').click();
  await rm.page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(rm.page, 'Watch the final scene', '#ws-player').click();
  await rm.page.waitForFunction(() => !!window.__GEN2_DONE__, null, { timeout: 60_000 });
  await settle(rm.page, 1500);
  const still = await rm.page.evaluate(() => window.__GEN2_DONE__.drift);
  assert.deepEqual([still.plan, still.transform], [null, 'none'], `reduced motion: no drift (${JSON.stringify(still)})`);
  assert.deepEqual(clean(rm.errors), [], 'no errors (reduced motion)');
  await rctx.close();
});

/* JOEY'S ROUND OF 2026-10-25: the scene's strip rests ("hide the buttons on the bottom of the screen until the user moves
   their mouse or hits a keyboard button"), a drawer's own words get their shot straight after the hero, coming into
   focus as it fades in ("focusing on specific things, like if they add a custom label ... starting a stationary scene
   out of focus and ending with it focused on a part of the build"), and the mug wears the logo and, on its back, the
   words ("as if it were print on it like a real coffee mug"). At High, where the shots move. */
test('Assemble: the Done scene\'s strip rests until a pointer or key, a drawer\'s words get the label shot that comes into focus, and the mugs stand printed, each at its own free spot', { skip: ROOM_SOFT_SKIP }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'high'); localStorage.setItem('gen2-quality:set', '1'); } catch {} window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 1500 }; });
  const { page, errors } = await open('assemble', { query: '&done=room&mugs=3', context: ctx });
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  // EdgeLabel faceplates (the label parts; the suite's build has Classic), as the Labels panel's switch applies them, then a
  // drawer carrying words, as the Labels workspace gives it (the unit's label)
  await page.evaluate(async () => { const v = window.__GEN2_VIEWER__; await v.applyFaceplateStyle(v.availableFaceplateStyles().find((x) => x.key === 'edgelabel')); window.__GEN2_STORE__.load(v.build, 'adopt'); });
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  const worded = await page.evaluate(() => { const v = window.__GEN2_VIEWER__, u = v.build.placed.find((p) => !v.unitPartBox(p.id, ['Label']).isEmpty()); if (!u) return null; u.label = 'SCREWS'; const b = v.unitPartBox(u.id, ['Label']); return { id: u.id, min: b.min.toArray(), max: b.max.toArray() }; });
  assert.ok(worded, 'the suite\'s build has a faceplate with a label part');
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 }).catch(() => assert.fail('the grammar never began'));
  // THE STRIP: there at the entry, at rest once nothing has moved for 2.5 s, back on a pointer and on a key
  const strip = () => page.evaluate(() => ({ idle: document.documentElement.classList.contains('scene-idle'), opacity: +getComputedStyle(document.querySelector('#ws-scene')).opacity, cursor: getComputedStyle(document.querySelector('#stage')).cursor }));
  await page.waitForFunction(() => document.documentElement.classList.contains('scene-idle'), null, { timeout: 6000 }).catch(() => assert.fail('the strip never rested'));
  await settle(page, 1000);   // past its 0.8 s fade
  const rest = await strip();
  assert.deepEqual([rest.idle, rest.opacity, rest.cursor], [true, 0, 'none'], `at rest: the strip and the pointer faded out (${JSON.stringify(rest)})`);
  await page.mouse.move(400, 300); await page.mouse.move(420, 310);
  // its 0.8 s fade back in, waited for rather than slept: on the CI runner's software rendering a frame can take longer
  await page.waitForFunction(() => +getComputedStyle(document.querySelector('#ws-scene')).opacity === 1, null, { timeout: 5000 }).catch(() => {});
  const woke = await strip();
  assert.deepEqual([woke.idle, woke.opacity], [false, 1], `a pointer brings it back (${JSON.stringify(woke)})`);
  await page.waitForFunction(() => document.documentElement.classList.contains('scene-idle'), null, { timeout: 6000 });
  await page.keyboard.press('Shift');
  assert.equal((await strip()).idle, false, 'and a key');
  // THE LABEL SHOT: the drawer's words found, the shot straight after the hero
  const sq = await page.evaluate(() => ({ s: window.__GEN2_DONE__.sequence, subj: window.__GEN2_DONE__.subjects }));
  assert.deepEqual(sq.subj.labels, [worded.id], 'the worded drawer is the label shot\'s subject');
  assert.ok(sq.s.names.includes('label'), 'the label shot is in the grammar'); assert.equal(sq.s.order[1], 'label', `straight after the hero (${sq.s.order.join(' ')})`);
  await page.evaluate(() => { const d = window.__GEN2_DONE__; d.setTiming({ holdMs: 6000, dipInMs: 600, dipOutMs: 300, blackMs: 150, maxFrameMs: 1e9, seed: 1 }); d.jump('label'); });
  await settle(page, 150);
  const f0 = await page.evaluate(() => ({ focus: window.__GEN2_DONE__.focus, shot: window.__GEN2_DONE__.sequence.shot, moving: window.__GEN2_DONE__.sequence.moving, target: window.__GEN2_VIEWER__.controls.target.toArray() }));
  assert.deepEqual([f0.shot, f0.moving, f0.focus.state], ['label', true, 'running'], `the label shot moves and comes into focus (${JSON.stringify(f0)})`);
  const blur = (f) => { const m = /blur\(([\d.]+)px\)/.exec(f || ''); return m ? +m[1] : 0; };
  assert.ok(blur(f0.focus.filter) > 2, `soft as it opens (${f0.focus.filter})`);
  const c = worded.min.map((v, i) => (v + worded.max[i]) / 2);
  assert.ok(Math.abs(f0.target[0] - c[0]) < 1 && Math.abs(f0.target[1] - c[1]) < 1, `aimed at the label (${f0.target.map((n) => n.toFixed(1))} vs ${c.map((n) => n.toFixed(1))})`);
  await page.waitForFunction(() => window.__GEN2_DONE__.focus.state !== 'running', null, { timeout: 6000 }).catch(() => assert.fail('the focus-in never ended'));
  assert.equal(blur((await page.evaluate(() => window.__GEN2_DONE__.focus)).filter), 0, 'and sharp once it has');
  // THE MUGS (three asked for: ?mugs=3): each at its own free spot, none touching another or hiding it from the hero's
  // camera, none in front of the build, their prints drawn, the further ones with their shadows, the mugs' shot in the grammar
  await page.waitForFunction(() => { const m = window.__GEN2_DONE__.mugs; return m && m.count && m.logos.every(Boolean) && m.sayings.every(Boolean); }, null, { timeout: 15_000 }).catch(async () => assert.fail('the mugs\' prints never drew: ' + JSON.stringify(await page.evaluate(() => window.__GEN2_DONE__.mugs))));
  const mp = await page.evaluate(async () => {
    const d = window.__GEN2_DONE__, v = window.__GEN2_VIEWER__, f = await import('/js/scenes/done-fit.js'), m = d.mugs, hero = d.sequence.fits.find((x) => x.name === 'hero').pos, bb = v.assembledBox;
    const apart = []; for (let i = 0; i < m.placed.length; i++) for (let j = 0; j < i; j++) apart.push({ dist: Math.hypot(m.placed[i].at.x - m.placed[j].at.x, m.placed[i].at.z - m.placed[j].at.z), clear: f.apartFrom({ x: hero[0], z: hero[2] }, m.placed[i].at, m.placed[j].at) });
    return { ...m, apart, build: { x0: bb.min.x, x1: bb.max.x, z0: bb.min.z }, names: d.sequence.names };
  });
  // as many of the three as the desk has room for (the build's link carries a fresh build id each run, so the plan's spots
  // differ run to run; one is the least a desk gives)
  assert.ok(mp.count >= 1 && mp.count <= 3, `one to three mugs stood (${mp.count} of the 3 asked for)`);
  assert.deepEqual(mp.logos, mp.placed.map(() => true), 'every logo drawn');
  for (const m of mp.placed) {
    assert.ok(Math.abs(m.pos[0] - m.at.x) < 0.5 && Math.abs(m.pos[2] - m.at.z) < 0.5 && m.visible, `a mug at its spot (${m.look}, ${m.pos.map((n) => n.toFixed(0))} vs ${JSON.stringify(m.at)})`);
    assert.ok(!(m.at.x > mp.build.x0 - 60 && m.at.x < mp.build.x1 + 60 && m.at.z > mp.build.z0), `not in front of the build (${JSON.stringify(m.at)})`);
  }
  assert.equal(mp.placed.filter((m) => m.coffee).length, 1, 'one of them holds the coffee');
  for (const a of mp.apart) assert.ok(a.dist >= 169.5 && a.clear, `no two touching, nor one hiding another from the hero (${JSON.stringify(a)})`);
  assert.equal(mp.more, 2 * (mp.count - 1), 'each further mug a body and a handle'); assert.equal(mp.masks, mp.count - 1, 'and its shadow');
  assert.ok(mp.names.includes('mugs'), 'the mugs\' shot in the grammar');
  // the prints are drawn: the mugs' shot held, its frame against the same frame with every print blank, the steam hidden
  // for both (it moves between them); the shot looks at one mug, its saying toward the room where one is
  const inked = await page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__, d = window.__GEN2_DONE__, T = v.THREE;
    for (let sd = 1; sd < 60; sd++) { d.setTiming({ holdMs: 1e9, dipInMs: 0, maxFrameMs: 1e9, seed: sd, hold: true }); if (d.sequence.order.includes('mugs')) break; }
    d.jump('mugs');
    await new Promise((r) => setTimeout(r, 600));
    v.renderer.domElement.getAnimations().forEach((a) => a.finish());
    const read = async () => { v.invalidateFrame(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const img = new Image(); img.src = v.renderer.domElement.toDataURL('image/png'); await img.decode(); const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return g.getImageData(0, 0, cv.width, cv.height).data; };
    const mats = []; v.scene.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.mug && o.material.userData.mug.uMugPrint.value) mats.push(o.material); });
    const steam = ['done-steam', 'done-steam-mist'].map((n) => v.scene.getObjectByName(n)).filter(Boolean); steam.forEach((o) => { o.visible = false; });
    const on = await read();
    const blank = new T.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); blank.needsUpdate = true;
    const was = mats.map((m) => m.userData.mug.uMugPrint.value); mats.forEach((m) => { m.userData.mug.uMugPrint.value = blank; });
    const off = await read();
    mats.forEach((m, i) => { m.userData.mug.uMugPrint.value = was[i]; }); steam.forEach((o) => { o.visible = true; }); blank.dispose();
    let changed = 0; for (let i = 0; i < on.length; i += 4) if (Math.abs((on[i] + on[i + 1] + on[i + 2]) - (off[i] + off[i + 1] + off[i + 2])) > 30) changed++;
    return { prints: mats.length, changed, shot: d.sequence.shot, framed: d.mugs.framed };
  });
  assert.equal(inked.shot, 'mugs'); assert.equal(inked.prints, mp.count, 'a printed glaze on every mug');
  assert.ok(inked.framed && inked.framed.length >= 1 && inked.framed.every((i) => i >= 0), `the shot frames a mug, or one with the mugs that would crop into it (${JSON.stringify(inked.framed)})`);
  assert.ok(inked.changed > 300, `the prints draw in the mugs' shot (${JSON.stringify(inked)})`);
  // and a view of the whole build after the mugs' shot, in every plan that has it (Astra: "build -> detail -> mug joke -> build")
  const after = await page.evaluate(async () => {
    const d = window.__GEN2_DONE__, f = await import('/js/scenes/done-fit.js'), out = [];
    for (let sd = 1; sd <= 40; sd++) { d.setTiming({ holdMs: 1e9, dipInMs: 0, maxFrameMs: 1e9, seed: sd, hold: true }); const o = d.sequence.order, i = o.indexOf('mugs'); if (i >= 0 && i + 1 < o.length) out.push([o[i + 1], f.BUILD_VIEWS.includes(o[i + 1])]); }
    return out;
  });
  assert.ok(after.length >= 5 && after.every(([, ok]) => ok), `a build view after the mugs every time (${JSON.stringify(after)})`);
  // LEAVING: the strip's rest with it
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__GEN2_DONE__, null, { timeout: 15_000 });
  const gone = await page.evaluate(() => ({ cls: document.documentElement.className, title: document.querySelector('#ws-player .title')?.textContent }));
  assert.ok(!/cinema|scene-idle/.test(gone.cls), `the page's classes back (${gone.cls})`); assert.match(gone.title, /End of instructions/, 'Esc lands on the End page');
  await settle(page, 3000);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('scene-idle')), false, 'and the rest does not come back outside the scene');
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => window.__GEN2_DONE__ && window.__GEN2_DONE__.mugs && window.__GEN2_DONE__.mugs.logos.every(Boolean), null, { timeout: 60_000 });
  const again = await page.evaluate(() => { let n = 0; window.__GEN2_VIEWER__.scene.traverse((o) => { if (o.name === 'done-mug-more') n++; }); return { n, count: window.__GEN2_DONE__.mugs.count, plan: window.__GEN2_DONE__.mugs.plan }; });
  assert.equal(again.n, 2 * (again.count - 1), 'a second visit stands its further mugs once: none left from the first visit');
  // the plan is the build link's own (the words above changed the link between the visits, so it is read again, not compared)
  const linked = await page.evaluate(async () => { const f = await import('/js/scenes/done-fit.js'); return f.mugPlan(f.rngFrom(f.hashSeed(location.hash || new URLSearchParams(location.search).get('build') || 'room')), { count: 3, extra: f.unlockedSayings(window.__GEN2_DONE__.mugs.facts) }); });   // the build's milestones with it
  assert.deepEqual(again.plan, linked, 'the mugs follow the build\'s link');
  assert.deepEqual(clean(errors), [], 'no errors');
  await ctx.close();
});

/* THE SPOOLS (Joey 2026-10-26: "a 3d model of filament ... stack near or around the build and changes with the colors
   selected for the build"; spool.js, done.js makeSpools). On a kit's own plan: the spools stand at free spots clear of the
   build and in front of none of it, each wears a colour the build is printed in, a new pick repaints them, a tier with no
   shadow map gives each a contact disc, and leaving takes them away. */
test('Assemble: the Done scene\'s spools wear the build\'s colours, stand clear of it, follow a new pick, and leave with the room', async () => {
  const kit = '165-tabletop-3w2h';
  const { ctx, page, errors } = await open('assemble', { query: `&build=${kit}&done=room&mugs=0&spools=plan` });
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => window.__GEN2_DONE__ && window.__GEN2_DONE__.spools && window.__GEN2_DONE__.sequence.on, null, { timeout: 60_000 }).catch(() => assert.fail('the room never came on'));
  const sp = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__, d = window.__GEN2_DONE__, f = v.filamentsInBuild(), bb = v.assembledBox, T = v.THREE;
    const props = []; v.scene.getObjectByName('done-room').traverse((o) => { if (o.isMesh && o.visible && o.userData.slot) props.push({ name: o.name, box: new T.Box3().setFromObject(o) }); });
    const clear = d.spools.placed.map((x) => props.filter((pr) => new T.Box3(new T.Vector3(x.box.min.x, x.box.min.y, x.box.min.z), new T.Vector3(x.box.max.x, x.box.max.y, x.box.max.z)).intersectsBox(pr.box)).map((pr) => pr.name));
    const room = v.scene.getObjectByName('done-room'), groupOf = (name) => { const out = []; room.traverse((o) => { if (o.userData.group === name || (o.userData.slot && o.name && (o.userData.group || o.name) === name)) out.push(o.visible); }); return out; };
    const cleared = d.spools.cleared.map((name) => ({ name, props: groupOf(name), shadows: d.shadows.filter((q) => q.group === name).map((q) => q.visible) }));
    return { ...d.spools, clearedState: cleared, monitor: groupOf('monitor'), hexes: [...f.filaments.map((x) => x.hex), ...f.unpicked.map((u) => u.hex)].map((h) => h.toLowerCase()), build: { x0: bb.min.x, x1: bb.max.x, z0: bb.min.z }, clear, shadowTier: !!(v.QUALITY[v.quality] || {}).shadow };
  });
  assert.ok(sp.plan.groups.length >= 1, `the kit's plan has spools (${JSON.stringify(sp.plan)})`);
  assert.ok(sp.placed.length >= 1, `at least one group stood (${sp.placed.length} of ${sp.plan.groups.length})`);
  for (const c of sp.colours) assert.ok(sp.hexes.includes(String(c).toLowerCase()), `a spool in a colour the build is printed in (${c} of ${sp.hexes})`);
  for (const x of sp.placed) {
    assert.ok(!(x.at.x > sp.build.x0 - 60 && x.at.x < sp.build.x1 + 60 && x.at.z > sp.build.z0), `not in front of the build (${JSON.stringify(x.at)})`);
    assert.ok(x.box.min.x > sp.build.x1 + 20 || x.box.max.x < sp.build.x0 - 20 || x.box.max.z < sp.build.z0, `clear of the build (${JSON.stringify(x.box)})`);
  }
  assert.ok(sp.clear.every((hit) => !hit.length), `clear of every prop (${JSON.stringify(sp.clear)}, ${JSON.stringify(sp.placed.map((x) => x.box))})`);
  // making room (Joey 2026-10-26: "take the notebook (or another prop) off the desk to fit them"): only the notebook, the
  // calipers or the plant leave, in that order, each with its shadow, and only while a group was left out; never the monitor
  assert.ok(sp.cleared.every((n) => ['notebook', 'calipers', 'plant'].includes(n)), `only those may leave (${JSON.stringify(sp.cleared)})`);
  if (sp.cleared.includes('plant')) assert.deepEqual(sp.cleared.slice(0, -1).every((n) => n !== 'plant'), true, 'the plant last, and only where nothing fitted without it (Joey: "keep the plant in there when we can")');
  for (const c of sp.clearedState) { assert.ok(c.props.length && c.props.every((x) => !x), `${c.name} off the desk`); assert.ok(c.shadows.every((x) => !x), `${c.name}'s shadow with it`); }
  assert.ok(sp.monitor.length && sp.monitor.every(Boolean), 'the monitor stays');
  const onDesk = sp.placed.reduce((a, x) => a + x.colours.length, 0);
  assert.ok(onDesk <= 32 && sp.placed.every((x) => x.colours.length <= 32), `no more than a spool a filament, thirty-two at most (${JSON.stringify(sp.placed.map((x) => x.colours.length))})`);
  assert.deepEqual(sp.discs, sp.placed.map(() => !sp.shadowTier), 'a contact disc under each on a tier with no shadow map (the suite\'s Fast)');
  /* THE SPOOLS FOLLOW THE BUILD (the Colors workspace's Room stage calls refreshSpools on each commit; Joey 2026-10-26: "so
     i added a blue filament, should we stack another filament on top of the stack when we do that"): a spool a filament */
  const groupsNow = () => page.evaluate(() => { const out = []; window.__GEN2_VIEWER__.scene.traverse((o) => { if (o.name === 'done-spools') out.push({ kind: o.userData.spoolGroup.kind, colours: o.children.filter((s) => s.userData.setColor).map((s) => String(s.userData.spool.color).toLowerCase()), ys: o.children.filter((s) => s.userData.setColor).map((s) => +s.position.y.toFixed(1)) }); }); return out; });
  const wears = () => page.evaluate(() => { const f = window.__GEN2_VIEWER__.filamentsInBuild(); return [...new Set([...f.filaments.map((x) => x.hex), ...f.unpicked.map((u) => u.hex)].map((h) => h.toLowerCase()))].sort(); });   // a label stripe's colour too (2026-10-28)
  const onePer = (gs, w, label) => { const all = gs.flatMap((g) => g.colours).sort(); assert.deepEqual(all, w.slice(0, 32), `${label}: a spool for each filament the build wears, each once (${JSON.stringify(gs)})`); };
  const g0 = await groupsNow();
  // one filament over the whole build (the feet keep their TPU): one spool each for it and the TPU, the spares off the desk
  await page.evaluate(() => { const v = window.__GEN2_VIEWER__; v.setUseCustom(true); for (const e of v.keysInBuild()) if (!e.locked) v.setColor(e.key, { name: 'Test Teal', hex: '#11aa99' }); window.__GEN2_DONE__.refreshSpools(); });
  const g1 = await groupsNow(), w1 = await wears();
  onePer(g1, w1, 'all teal');
  assert.ok(g1.flatMap((g) => g.colours).length < g0.flatMap((g) => g.colours).length, `the control: fewer spools than before (${g0.flatMap((g) => g.colours).length} -> ${g1.flatMap((g) => g.colours).length})`);
  assert.equal((await page.evaluate(() => window.__GEN2_DONE__.spools.discs)).length, g1.length, 'a disc a group, an empty group gone with its own');
  // a filament added: its spool on top of a stack, the ones under it where they were
  const top = async (hex, name) => {
    const before = await groupsNow();
    await page.evaluate(([h, n]) => { const v = window.__GEN2_VIEWER__; const k = v.keysInBuild().find((e) => !e.locked && !e.zone && v.activeHex(e.key).toLowerCase() === '#11aa99'); v.setColor(k.key, { name: n, hex: h }); window.__GEN2_DONE__.refreshSpools(); }, [hex, name]);
    const after = await groupsNow(), w = await wears();
    onePer(after, w, `${name} added`);
    const host = after.find((g) => g.colours[g.colours.length - 1] === hex);
    assert.ok(host && host.kind === 'stack', `${name}: on top of a stack (${JSON.stringify(after)})`);
    assert.ok(host.ys.every((y, i) => !i || y > host.ys[i - 1] + 60), `${name}: each spool above the one under it (${host.ys})`);
    const was = before.find((g) => host.colours.slice(0, -1).every((c, i) => g.colours[i] === c) && g.colours.length === host.colours.length - 1);
    assert.ok(was && was.ys.every((y, i) => y === host.ys[i]), `${name}: the spools under it did not move (${JSON.stringify(was)} -> ${JSON.stringify(host)})`);
  };
  await top('#cc3311', 'Test Red');
  await top('#2a6fdb', 'Test Blue');
  /* and more and more (Joey: "can we maybe just keep stacking them? like maybe a crazy limit of the ceiling?"): a filament
     a region, each its own spool, the stacks growing past six, their tops under the walls' margin */
  const many = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__, keys = v.keysInBuild().filter((e) => !e.locked && e.key.split(':')[0] !== 'Foot');
    keys.forEach((e, i) => v.setColor(e.key, { name: `Test ${i}`, hex: '#' + (0x203040 + i * 0x0b1d07).toString(16).slice(-6) }));
    window.__GEN2_DONE__.refreshSpools();
    const d = window.__GEN2_DONE__, room = v.scene.getObjectByName('done-room'), T = v.THREE;
    const tops = []; v.scene.traverse((o) => { if (o.name === 'done-spools') tops.push(new T.Box3().setFromObject(o, true).max.y); });
    return { keys: keys.length, spools: d.spools.colours.length, stacks: d.spools.placed.map((x) => x.colours.length), top: Math.max(...tops), wallTop: d.sequence.interior.y1 };
  });
  const wm = await wears();
  onePer(await groupsNow(), wm, 'a filament a region');
  assert.ok(many.spools > 6, `more than six spools on the desk (${JSON.stringify(many)})`);
  assert.ok(many.top <= many.wallTop - 140, `every stack under the walls' margin (${JSON.stringify(many)})`);
  // leaving: none left in the scene
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__GEN2_DONE__, null, { timeout: 15_000 });
  assert.equal(await page.evaluate(() => { let n = 0; window.__GEN2_VIEWER__.scene.traverse((o) => { if (o.name === 'done-spools') n++; }); return n; }), 0, 'leaving takes the spools away');
  assert.deepEqual(clean(errors), [], 'no errors');
  await ctx.close();
});

/* THE BUILD'S OWN MUGS (Joey 2026-10-25: "maybe sometimes there's no mugs, other times there might be two or 3 mugs, they
   don't have to be grouped together either"), from the kits' own links (?mugs=plan: no debug pinning). The 165 3W kit's
   plan stands three with the notebook off the desk (its shadow with it); the 115 3W kit's stands none: the room's own mug,
   its coffee and its shadow off the desk, and no mugs' shot. */
test('Assemble: the Done scene\'s mugs follow the build\'s link: three on one kit with the notebook off the desk, none on another', async () => {
  for (const [kit, want] of [['165-tabletop-3w2h', { count: 3, notebookOff: true }], ['115-tabletop-3w2h', { count: 0, notebookOff: false }]]) {
    const { ctx, page, errors } = await open('assemble', { query: `&build=${kit}&done=room&mugs=plan` });
    const plan0 = await page.evaluate(async (k) => { const f = await import('/js/scenes/done-fit.js'); return f.mugPlan(f.rngFrom(f.hashSeed(k))); }, kit);
    assert.deepEqual([plan0.count, plan0.notebookOff], [want.count, want.notebookOff], `${kit}: its link's plan (how many, the notebook: before any saying is drawn)`);
    await btn(page, 'Skip to the finished build', '#ws-steps').click();
    await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
    await btn(page, 'Next', '#ws-player').click();
    await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
    await btn(page, 'Watch the final scene', '#ws-player').click();
    await page.waitForFunction(() => window.__GEN2_DONE__ && window.__GEN2_DONE__.mugs && window.__GEN2_DONE__.sequence.on, null, { timeout: 60_000 }).catch(() => assert.fail(`${kit}: the room never came on`));
    const st = await page.evaluate(() => {
      const d = window.__GEN2_DONE__, room = window.__GEN2_VIEWER__.scene.getObjectByName('done-room'), vis = (n) => room.getObjectByName(n).visible;
      return { plan: d.mugs.plan, count: d.mugs.count, notebook: [vis('notebook'), vis('pen')], notebookShadow: d.shadows.filter((q) => q.group === 'notebook').map((q) => q.visible),
        mug: [vis('mug'), vis('coffee')], mugShadow: d.shadows.filter((q) => q.group === 'mug').map((q) => q.visible), names: d.sequence.names };
    });
    const plan = await page.evaluate(async (k) => { const f = await import('/js/scenes/done-fit.js'); return f.mugPlan(f.rngFrom(f.hashSeed(k)), { extra: f.unlockedSayings(window.__GEN2_DONE__.mugs.facts) }); }, kit);
    assert.deepEqual(st.plan, plan, `${kit}: the scene's plan is the link's, with the build's milestones`);
    if (want.notebookOff) { assert.deepEqual(st.notebook, [false, false], `${kit}: the notebook and its pen off the desk`); assert.ok(st.notebookShadow.every((x) => !x), 'and their shadow'); }
    else { assert.deepEqual(st.notebook, [true, true], `${kit}: the notebook on the desk`); }
    if (want.count === 0) {
      assert.equal(st.count, 0); assert.deepEqual(st.mug, [false, false], `${kit}: no mug, no coffee`); assert.ok(st.mugShadow.every((x) => !x), 'no mug\'s shadow');
      assert.ok(!st.names.includes('mugs'), 'and no mugs\' shot');
    } else {
      assert.ok(st.count >= 2 && st.count <= want.count, `${kit}: its mugs stood (${st.count} of ${want.count})`); assert.deepEqual(st.mug, [true, true]);
    }
    assert.deepEqual(clean(errors), [], `${kit}: no errors`);
    await ctx.close();
  }
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
test('Colors: the Room | Neutral switch is absent with ?done=off; for every visitor (no flag), Room holds the stage with a free orbit and no sequence, the panel leads with the build, picks land, Reset view returns to the shot, Neutral restores, the choice comes back', { skip: ROOM_SOFT_SKIP }, async () => {
  const state = (page) => page.evaluate(() => { const v = window.__GEN2_VIEWER__; return { held: v.sceneHeld, room: !!v.scene.getObjectByName('done-room'), done: document.documentElement.dataset.done || null, bg: v.scene.background ? (v.scene.background.isColor ? 'color' : 'other') : null, controls: v.controls.enabled, camFree: v.camFree, seq: window.__GEN2_DONE__ ? window.__GEN2_DONE__.sequence.on : null, seqWanted: window.__GEN2_DONE__ ? window.__GEN2_DONE__.sequence.wanted : null, quality: v.quality, cam: v.camera.position.toArray().map((n) => +n.toFixed(1)) }; });
  const off = await open('colors', { query: '&done=off' });
  assert.equal(await off.page.locator('#ws-tools .backdrop').count(), 0, 'no backdrop switch with ?done=off');
  assert.deepEqual(clean(off.errors), []);
  await off.ctx.close();
  const { ctx, page, errors } = await open('colors', { visitor: true });   // no flag: the room is on for everyone (Joey 2026-10-26)
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('done')), null, 'no flag in the address');
  const seg = (t) => page.locator(`#ws-tools .backdrop button:has-text("${t}")`);
  // Room first (Joey 2026-10-26: "What if when you select color it goes to this view instead"): no click, the room comes on
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => assert.fail('Colors did not open on the room within 60 s'));
  assert.equal(await seg('Room').getAttribute('aria-pressed'), 'true', 'Room by default');
  /* the panel leads with the build's colours, the room's wall and desk its last section (Joey 2026-10-26: "panel always
     leads with the build's colours, room wall/desk as a small section at the bottom only while the room shows, and the
     view switch moves to the toolbar as Room | Neutral") */
  await page.waitForFunction(() => !!document.querySelector('#ws-colors .roomcols'), null, { timeout: 60_000 }).catch(() => assert.fail('the room brought no wall and desk section'));
  const layout = () => page.evaluate(() => { const kids = [...document.querySelector('#ws-colors').querySelectorAll(':scope > .head, :scope > section, :scope .panel > .head, :scope .panel > section')];
    const panelKids = kids.length ? kids : []; return { order: panelKids.map((k) => (k.classList.contains('head') ? 'head' : k.classList.contains('look') ? 'look' : k.classList.contains('roomcols') ? 'room' : 'other')), inHead: [...document.querySelectorAll('#ws-colors .head button')].some((b) => /^(Room|Neutral|Studio)$/.test(b.textContent.trim())), bar: [...document.querySelectorAll('#ws-tools .backdrop button')].map((b) => b.textContent) }; });
  const L1 = await layout();
  assert.deepEqual(L1.bar, ['Room', 'Neutral'], `the switch is the toolbar's: Room | Neutral (${JSON.stringify(L1)})`);
  assert.equal(L1.inHead, false, 'and nothing of it in the panel head');
  assert.deepEqual([L1.order[0], L1.order[1], L1.order[L1.order.length - 1]], ['head', 'look', 'room'], `the build's colours first, the room last (${L1.order.join(' > ')})`);
  await settle(page, 1500);
  const s1 = await state(page);
  assert.equal(s1.room, true, 'the room is in the scene'); assert.equal(s1.held, true, 'the stage is held'); assert.equal(s1.bg, null);
  assert.equal(s1.controls, true, 'the orbit is free'); assert.equal(s1.seq, false, 'no camera sequence in Colors');
  // nothing here drifts, so the coffee's steam is drawn on Fast too, unlike Assemble's still shots (Terra 01a1755a)
  assert.equal(await page.evaluate(() => window.__GEN2_DONE__ && window.__GEN2_DONE__.steam && window.__GEN2_DONE__.steam.visible), true, 'the steam stays in a scene that never drifts');
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
  /* the orbit stays in the room (Joey 2026-10-26: "i can spin it around and clip through the wall or zoom out a mile"): a
     long zoom out, then half a turn round behind the back wall; the camera never leaves the walls' margins */
  const inside = () => page.evaluate(() => { const v = window.__GEN2_VIEWER__, b = window.__GEN2_DONE__.sequence.interior, p = v.camera.position;
    return { p: p.toArray().map((n) => Math.round(n)), d: Math.round(p.distanceTo(v.controls.target)), b, ok: p.x >= b.x0 + 149 && p.x <= b.x1 - 149 && p.y >= b.y0 + 149 && p.y <= b.y1 - 449 && p.z >= b.z0 + 149 && p.z <= b.z1 - 149 }; });
  const far = (await state(page)).cam;
  await page.mouse.move(640, 380);
  for (let i = 0; i < 25; i++) await page.mouse.wheel(0, 600);
  await settle(page, 900);
  const zoomed = await inside();
  assert.ok(zoomed.ok, `a long zoom out stays in the room (${JSON.stringify(zoomed)})`);
  assert.notDeepEqual(zoomed.p, far.map(Math.round), 'the control: the zoom moved the camera');
  await page.mouse.down(); await page.mouse.move(1240, 380, { steps: 30 }); await page.mouse.move(1270, 200, { steps: 10 }); await page.mouse.up();
  await settle(page, 900);
  const turned = await inside();
  assert.ok(turned.ok, `a turn round behind the wall stays in the room (${JSON.stringify(turned)})`);
  // ... stopped at the wall, never pulled in along its line into the build (Joey: "if you spin the camera into the wall, i
  // think it automatically zooms in super far like into the inside of the build")
  assert.ok(turned.d >= 0.95 * zoomed.d, `the turn kept its distance to the build (${zoomed.d} -> ${turned.d} mm)`);
  await page.locator('#ws-tools button.cam').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.camFree === false, null, { timeout: 15_000 });
  await settle(page, 1300);
  // the choice survives a trip to Parts and back
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('parts'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'parts', null, { timeout: 60_000 });
  const sP = await state(page);
  assert.equal(sP.room, false, 'another workspace: no room'); assert.equal(sP.held, false); assert.equal(sP.bg, 'color');
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('colors'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'colors' && document.documentElement.dataset.done === 'room', null, { timeout: 60_000 }).catch(() => assert.fail('the remembered Room did not come back with Colors'));
  assert.equal(await seg('Room').getAttribute('aria-pressed'), 'true', 'the toggle remembers Room');
  // Studio restores the stage
  await seg('Neutral').click();
  await settle(page, 1500);
  const s2 = await state(page);
  assert.equal(s2.room, false, 'the room is gone'); assert.equal(s2.held, false); assert.equal(s2.done, null); assert.equal(s2.bg, 'color', 'the stage background is back'); assert.equal(s2.controls, true);
  assert.equal(await seg('Neutral').getAttribute('aria-pressed'), 'true');
  assert.ok(!(await layout()).order.includes('room'), 'Neutral: no wall and desk section');
  // "toggle back to the builder-like view if desired": a visitor who picked Studio keeps it on the next visit
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'colors' && document.querySelector('#ws-tools .backdrop'), null, { timeout: 60_000 });
  await settle(page, 1500);
  assert.equal(await seg('Neutral').getAttribute('aria-pressed'), 'true', 'Neutral, as picked, after a reload');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.done || null), null, 'and no room loaded');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* A LABEL STRIPE'S SPOOL (Joey 2026-10-28: "we are using the blue accent color in the label but it's not adding to our
   filament stack"). The stripe prints from its own spool and the dock counted it, but the room's spools left stripes out
   (done.js spoolColours). An EdgeLabel build whose drawer carries a Metric-striped label: the room stacks a spool of its
   blue. */
test('Colors: a label stripe\'s colour has its spool in the room', { skip: ROOM_SOFT_SKIP }, async () => {
  const rec = { mount: 'tabletop', length: 185, printer: 'any', faceStyle: 'edgelabel', doorStyle: 'essential', handleStyle: 'deco', feet: 'tpu', buildPlate: 'powder',
    removedStoppers: [], gridW: 6, gridH: 2, nextId: 3, labelStyle: null, buildId: 'e2estripespool', sideCovers: true, plateParts: {},
    placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, label: 'Screws' }, { id: 2, x: 2, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0 }],
    labelList: { format: 'modulith-labels', version: 1, labels: [{ text: 'Screws', id: 'e2estripelab01', colours: { band: { colour: 'sky-blue', hex: '#56B4E9', label: 'Metric', pattern: 'solid' } } }] },
    labelAssign: { 1: 'e2estripelab01' } };
  const b64 = Buffer.from(JSON.stringify(rec), 'utf8').toString('base64');
  const { ctx, page, errors } = await open('colors', { visitor: true, query: `&spools=plan#build=${b64}` });
  await page.waitForFunction(() => window.__GEN2_VIEWER__?.filamentsInBuild?.().unpicked.some((u) => u.stripe && u.hex.toLowerCase() === '#56b4e9'), null, { timeout: 90_000 })
    .catch(() => assert.fail('the label stripe never reached the build filaments'));
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room' && window.__GEN2_DONE__?.spools?.placed?.length, null, { timeout: 60_000 }).catch(() => assert.fail('no spools in the room'));
  await page.evaluate(() => window.__GEN2_DONE__.refreshSpools());
  const colours = await page.evaluate(() => { const out = []; window.__GEN2_VIEWER__.scene.traverse((o) => { if (o.userData.spool && o.userData.setColor) out.push(String(o.userData.spool.color).toLowerCase()); }); return out; });
  assert.ok(colours.includes('#56b4e9'), `a spool of the stripe's blue (${JSON.stringify(colours)})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* A SPOOL'S FILAMENT, EVERYWHERE (Joey 2026-10-26: "what if i could select a spool and change it's color, and doing so
   would replace everything in the build that used that same color"): on the Colors stage, the pointer over a spool says
   so; a click on it opens the picker on that spool's filament and selects no part; a pick changes every region printed
   in it, in one undo step, and the spool with it; undo puts it all back */
test('Colors: a spool clicked in the room opens the picker on its filament, and one pick changes everything printed in it, the spool too, in one undo step', { skip: ROOM_SOFT_SKIP }, async () => {
  const { ctx, page, errors } = await open('colors', { visitor: true, query: '&spools=plan' });
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room' && window.__GEN2_DONE__ && window.__GEN2_DONE__.spools && window.__GEN2_DONE__.spools.placed.length, null, { timeout: 60_000 }).catch(() => assert.fail('no spools in the room'));
  await settle(page, 1500);
  // the spool whose middle is nearest the screen's centre, and its place on the screen (it must be the nearest hit there)
  const at = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__, T = v.THREE, el = v.renderer.domElement, r = el.getBoundingClientRect(), ray = new T.Raycaster();
    const spools = []; v.scene.traverse((o) => { if (o.userData.spool && o.userData.setColor) spools.push(o); });
    const f = window.__GEN2_VIEWER__.filamentsInBuild(), feet = new Set(f.filaments.filter((x) => x.keys.every((k) => k.split(':')[0] === 'Foot')).map((x) => x.hex.toLowerCase()));
    const all = []; v.scene.traverse((o) => { if (o.isMesh && o.visible) all.push(o); });
    for (const s of spools) {
      if (feet.has(String(s.userData.spool.color).toLowerCase())) continue;   // a PLA spool: the feet's TPU lists only TPU
      const c = new T.Box3().setFromObject(s, true).getCenter(new T.Vector3()), q = c.clone().project(v.camera);
      if (Math.abs(q.x) > 0.8 || Math.abs(q.y) > 0.8) continue;
      ray.setFromCamera(new T.Vector2(q.x, q.y), v.camera);
      const hit = ray.intersectObjects(all, false)[0];
      let o = hit && hit.object; while (o && o !== s) o = o.parent;
      if (o === s) return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height, hex: String(s.userData.spool.color).toLowerCase() };
    }
    return null;
  });
  assert.ok(at, 'a PLA spool in view, nearest at its middle');
  /* the flanges' shadow from two smooth discs (spool.js THE FLANGES' SHADOW): the lightened flange's facets threw blocks
     of shadow on the coil; the flange casts nothing, its discs cast, unseen, never hit, out of the AO */
  const casts = await page.evaluate(() => { const out = []; window.__GEN2_VIEWER__.scene.traverse((s) => { if (!(s.userData.spool && s.userData.setColor)) return;
    const meshes = s.children.filter((m) => m.isMesh), cs = meshes.filter((m) => m.name === 'spool-caster'), fl = meshes.filter((m) => m.name !== 'spool-caster' && !(m.material.userData && m.material.userData.coil));
    out.push({ casters: cs.length, castersCast: cs.every((m) => m.castShadow && !m.material.colorWrite && m.userData.ghost && (() => { const h = []; m.raycast(new window.__GEN2_VIEWER__.THREE.Raycaster(), h); return !h.length; })()), flangeCasts: fl.some((m) => m.castShadow) }); }); return out; });
  assert.ok(casts.length && casts.every((c) => c.casters === 2 && c.castersCast && !c.flangeCasts), `each spool's shadow from its two discs, not its flange (${JSON.stringify(casts.slice(0, 3))})`);
  const shadowCover = () => page.evaluate(() => {
    const v = window.__GEN2_VIEWER__, T = v.THREE, cam = v.sun.shadow.camera; cam.updateMatrixWorld(true);
    const L = new T.Vector3().subVectors(v.sun.position, v.sun.target.position).normalize(), out = [];
    // inside across and in depth (Sol 01a17823: only the far plane was refitted; the near one must hold every caster too)
    let near = Infinity; const inside = (w) => { const p = w.clone().applyMatrix4(cam.matrixWorldInverse); near = Math.min(near, -p.z); return p.x >= cam.left && p.x <= cam.right && p.y >= cam.bottom && p.y <= cam.top && -p.z >= cam.near && -p.z <= cam.far; };
    v.scene.traverse((g) => { if (g.name !== 'done-spools') return; const b = new T.Box3().setFromObject(g, true); let n = 0, k = 0;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { const w = new T.Vector3(x, y, z); n++; if (inside(w)) k++; n++; if (inside(w.addScaledVector(L, -(y - b.min.y) / L.y))) k++; }
      out.push(`${k}/${n}`); });
    return { out, map: v.sun.shadow.mapSize.x, cast: v.sun.castShadow, nearest: Math.round(near), planes: [cam.near, cam.far] };
  });
  const wearing = (hex) => page.evaluate((h) => { const f = window.__GEN2_VIEWER__.filamentsInBuild(); return [...f.filaments.filter((x) => x.hex.toLowerCase() === h).flatMap((x) => x.keys), ...f.unpicked.filter((u) => !u.stripe && u.hex.toLowerCase() === h).map((u) => u.key)].sort(); }, hex);
  const keys0 = await wearing(at.hex);
  assert.ok(keys0.length, `the spool's colour is printed somewhere (${at.hex})`);
  await page.mouse.move(at.x, at.y);
  await page.waitForFunction(() => window.__GEN2_VIEWER__.renderer.domElement.style.cursor === 'pointer', null, { timeout: 5000 }).catch(() => assert.fail('the pointer over a spool does not say it can be clicked'));
  // lit a little under the pointer, the others not (Joey: "when you hover over a filament and select a filament we should highlight it")
  const glow = () => page.evaluate(() => Object.fromEntries(window.__GEN2_DONE__.spoolGlow));
  const g1 = await glow();
  assert.ok(g1[at.hex] === 1 && Object.entries(g1).every(([h, l]) => h === at.hex || l === 0), `hovered: that spool lit a little (${JSON.stringify(g1)})`);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => !document.querySelector('#ws-picker').hidden && /Spool/.test(document.querySelector('#ws-picker .region')?.textContent || ''), null, { timeout: 5000 }).catch(() => assert.fail('a click on the spool did not open its picker'));
  assert.equal(await page.evaluate(() => window.__GEN2_VIEWER__.selectedId ?? null), null, 'and selected no part');
  assert.ok(await page.locator('#ws-partcard').isHidden(), 'no part card');
  await page.mouse.move(5, 400);   // the pointer off it: the picker's spool stays lit
  await settle(page, 300);
  const g2 = await glow();
  assert.ok(g2[at.hex] === 2 && Object.entries(g2).every(([h, l]) => h === at.hex || l === 0), `its picker open: that spool lit, the others not (${JSON.stringify(g2)})`);
  // a filament the build does not wear yet, from the first brand's list
  const to = await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-picker .brands .swatches')].pop().querySelector('button.sw:not(.active)'); return { name: b.getAttribute('aria-label'), hex: getComputedStyle(b).backgroundColor }; });
  const undo0 = await page.evaluate(() => window.__GEN2_STORE__.canUndo);
  await page.locator(`#ws-picker .brands .swatches:last-of-type button.sw[aria-label="${to.name}"]`).first().click();
  await settle(page, 600);
  const after = await page.evaluate(([old, keys]) => { const v = window.__GEN2_VIEWER__, f = v.filamentsInBuild(); return { still: [...f.filaments.filter((x) => x.hex.toLowerCase() === old).flatMap((x) => x.keys), ...f.unpicked.filter((u) => !u.stripe && u.hex.toLowerCase() === old).map((u) => u.key)], now: keys.map((k) => v.palette().colors[k] && v.palette().colors[k].name), spools: window.__GEN2_DONE__.spools.colours.map((c) => String(c).toLowerCase()), title: document.querySelector('#ws-picker .region')?.textContent }; }, [at.hex, keys0]);
  assert.deepEqual(after.still, [], `nothing is printed in the old colour any more (${JSON.stringify(after)})`);
  assert.ok(after.now.every((n) => n === to.name), `every region it printed wears ${to.name} (${JSON.stringify(after.now)})`);
  assert.ok(!after.spools.includes(at.hex), `the spool changed with it (${JSON.stringify(after.spools)})`);
  assert.equal(after.title, 'Spool', 'the picker stays on the spool');
  const g3 = await glow();
  assert.ok(Object.values(g3).filter((l) => l === 2).length === 1 && g3[at.hex] === undefined, `the changed spool stays the lit one (${JSON.stringify(g3)})`);
  await page.locator('#ws-picker button.x').click();
  await settle(page, 300);
  assert.ok(Object.values(await glow()).every((l) => l === 0), 'the picker closed: none lit');
  // one undo step puts it all back
  await page.evaluate(() => window.__GEN2_STORE__.undo());
  await settle(page, 600);
  assert.deepEqual(await wearing(at.hex), keys0, 'one undo: every region in the old colour again');
  assert.equal(undo0, await page.evaluate(() => window.__GEN2_STORE__.canUndo), 'and the history as it was');
  /* at a tier with the sun's shadow: each group and where its shadow falls on the desk inside its camera (main.js THE
     SHADOW BEYOND THE BUILD): fitted to the build alone, a stack caught and cast its shadow only partly, cut on a line */
  await page.evaluate(() => window.__GEN2_VIEWER__.setQuality('high', { user: true }));
  await settle(page, 600);
  const cover = await shadowCover();
  assert.ok(cover.cast && cover.out.length && cover.out.every((s) => s.split('/')[0] === s.split('/')[1]), `every spool group and its shadow inside the sun's shadow camera (${JSON.stringify(cover)})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE SHOWCASE (Joey 2026-10-26: "in the color tab, we should somehow also work in the final scene but call it something
   else"): Colors' Showcase button opens the final scene in these colours, its Back says where it goes and Esc goes there,
   Colors comes back on the room, and Assemble's own place is left as it was */
test('Colors: Showcase plays the final scene in these colours, and Esc comes back to Colors on the room, Assemble’s own place kept', async () => {
  const { ctx, page, errors } = await open('colors', { visitor: true });
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room' && document.querySelector('#ws-colors .showcase'), null, { timeout: 60_000 });
  const before = await page.evaluate(() => { const m = window.__GEN2_CTX__().memo; return { page: m.assemblePage ?? null, done: m.assembleDone ?? null, hex: window.__GEN2_VIEWER__.activeHex('Faceplate') }; });
  await page.locator('#ws-colors .showcase').click();
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'assemble' && document.documentElement.classList.contains('cinema') && window.__GEN2_DONE__ && window.__GEN2_DONE__.sequence, null, { timeout: 60_000 }).catch(() => assert.fail('Showcase did not open the final scene'));
  const inScene = await page.evaluate(() => ({ back: document.querySelector('#ws-scene button').textContent, hex: window.__GEN2_VIEWER__.activeHex('Faceplate'), mine: window.__GEN2_VIEWER__.useCustom }));
  assert.equal(inScene.back, '← Back to Colors', 'its Back says where it goes');
  assert.equal(inScene.hex, before.hex, 'in the colours just picked');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'colors' && document.documentElement.dataset.done === 'room' && !document.documentElement.classList.contains('cinema'), null, { timeout: 60_000 }).catch(() => assert.fail('Esc did not come back to Colors on the room'));
  const after = await page.evaluate(() => { const m = window.__GEN2_CTX__().memo; return { page: m.assemblePage ?? null, done: m.assembleDone ?? null }; });
  assert.deepEqual(after, { page: before.page, done: before.done }, 'Assemble’s own place as it was');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE WINDOW: FROSTED GLASS (Joey 2026-10-26, after a photographed garden through it in six versions: "that window scene
   is pretty gross, maybe there is something more simple claude can do without an image?"; Astra: "Check it from straight
   on, both oblique views, and the highest and lowest supported camera positions. The pane should remain convincingly
   seated in the frame throughout"): one pane in the opening, set back in the frame and lapped into it all round, facing
   the room, out of the AO, the shadows and the rays; its picture pale, brighter at the top, never white, a little
   uneven; every look through the opening from the reference views meets the pane or the frame, nothing past them; the
   stage's far plane and clipping untouched; Neutral takes the pane away */
test('Colors: the room’s window is frosted glass seated in its frame, met by every look through the opening, gone with Neutral', async () => {
  const { ctx, page, errors } = await open('colors', { visitor: true });
  await page.waitForFunction(() => window.__GEN2_VIEWER__.scene.getObjectByName('done-window-pane'), null, { timeout: 60_000 }).catch(() => assert.fail('the window has no pane'));
  const on = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__, T = v.THREE, s = v.scene, room = s.getObjectByName('done-room'), pane = s.getObjectByName('done-window-pane');
    const bx = (n) => new T.Box3().setFromObject(room.getObjectByName(n));
    const ja = bx('win_jamb_a'), jb = bx('win_jamb_b'), sill = bx('win_sill'), head = bx('win_head'), desk = bx('desk_top').getCenter(new T.Vector3());
    const pb = new T.Box3().setFromObject(pane), pc = pane.getWorldPosition(new T.Vector3());
    const normal = new T.Vector3(0, 0, 1).transformDirection(pane.matrixWorld);
    // the frame is across x here (the left wall): the opening runs in z between the jambs and in y between sill and head
    const z0 = Math.min(ja.max.z, jb.max.z), z1 = Math.max(ja.min.z, jb.min.z), d0 = Math.min(ja.min.x, jb.min.x), d1 = Math.max(ja.max.x, jb.max.x);
    const seat = { lap: [Math.round(z0 - pb.min.z), Math.round(pb.max.z - z1), Math.round(sill.max.y - pb.min.y), Math.round(pb.max.y - head.min.y)],
      depth: +((pc.x - d0) / (d1 - d0)).toFixed(2), faces: normal.dot(desk.clone().sub(pc)) > 0 };
    // every look through the opening (at the frame's room face) from the reference views: first the pane, the frame or the
    // window's own wall (an oblique look at the opening's far edge meets the wall's reveal first), never past the pane
    const face = d1, meshes = [pane]; room.traverse((o) => { if (o.isMesh && /^(win_|wall_)/.test(o.name)) meshes.push(o); });
    const eye = 692, views = { straight: [300, eye, 522], hero: [854, eye, 1436], front: [150, eye, 2300], back: [400, eye, 120],
      highStraight: [300, 1810, 522], highFront: [150, 1810, 2300], highBack: [400, 1810, 120], highNear: [-1000, 1810, 1200],
      lowStraight: [300, -100, 522], lowFront: [150, -100, 2300], lowBack: [400, -100, 120] }, missed = [], onPane = {};
    for (const [name, at] of Object.entries(views)) for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const from = new T.Vector3(...at), q = new T.Vector3(face, sill.max.y + (head.min.y - sill.max.y) * (0.02 + 0.96 * j / 10), z0 + (z1 - z0) * (0.02 + 0.96 * i / 10));
      const r = new T.Raycaster(from, q.clone().sub(from).normalize(), 1, 1e5), hits = [];
      for (const m of meshes) T.Mesh.prototype.raycast.call(m, r, hits);
      hits.sort((x, y) => x.distance - y.distance);
      const h = hits[0];
      if (!h || !(h.object === pane || /^(win_|wall_left)/.test(h.object.name))) missed.push(`${name} ${i},${j}: ${h ? h.object.name : 'nothing'}`);
      else if (h.object === pane) onPane[name] = (onPane[name] || 0) + 1;
    }
    // its picture: rows from the canvas (top row first)
    const cv = pane.material.map.image, g = cv.getContext('2d'), row = (y) => { const d = g.getImageData(0, y, cv.width, 1).data, l = []; for (let k = 0; k < d.length; k += 4) l.push((d[k] + d[k + 1] + d[k + 2]) / 3); return l; };
    const mean = (l) => l.reduce((x, y) => x + y, 0) / l.length, top = row(0), bottom = row(cv.height - 1), mid = row(cv.height >> 1);
    let maxCh = 0; for (const y of [0, cv.height >> 1, cv.height - 1]) { const d = g.getImageData(0, y, cv.width, 1).data; for (let k = 0; k < d.length; k += 4) maxCh = Math.max(maxCh, d[k], d[k + 1], d[k + 2]); }
    const look = { top: Math.round(mean(top)), bottom: Math.round(mean(bottom)), maxCh, uneven: +((Math.max(...mid) - Math.min(...mid)) / mean(mid)).toFixed(3),
      cool: (() => { const d = g.getImageData(0, cv.height >> 1, 1, 1).data; return d[2] > d[0]; })() };
    return { seat, missed, onPane, look, ghost: !!pane.userData.ghost, cast: pane.castShadow, ray: (() => { const h = []; pane.raycast(new T.Raycaster(new T.Vector3(300, 910, 522), new T.Vector3(-1, 0, 0)), h); return h.length; })(),
      far: v.camera.far, clip: v.renderer.localClippingEnabled, map: !!pane.material.map, toneMapped: pane.material.toneMapped };
  });
  assert.ok(on.ghost && !on.cast && on.ray === 0 && on.map, `out of the AO, the shadows and the rays (${JSON.stringify(on)})`);
  assert.ok(on.seat.lap.every((l) => l >= 10) && on.seat.depth > 0.2 && on.seat.depth < 0.8 && on.seat.faces, `seated: lapped into the frame all round, set back in it, facing the room (${JSON.stringify(on.seat)})`);
  assert.deepEqual(on.missed, [], `every look through the opening meets the pane or the frame (${on.missed.slice(0, 6).join(' | ')})`);
  assert.ok(Object.keys(on.onPane).length === 11, `and from every view some of it is the pane (${JSON.stringify(on.onPane)})`);
  assert.ok(on.look.top > on.look.bottom && on.look.maxCh < 245 && on.look.uneven > 0.01 && on.look.uneven < 0.12 && on.look.cool, `pale, brighter at the top, never white, a little uneven, a touch cool (${JSON.stringify(on.look)})`);
  assert.deepEqual([on.far, on.clip], [8000, false], 'the stage’s far plane and clipping as they were');
  await page.locator('#ws-tools .backdrop button:has-text("Neutral")').click();
  await page.waitForFunction(() => !document.documentElement.dataset.done, null, { timeout: 30_000 });
  const off = await page.evaluate(() => ({ pane: !!window.__GEN2_VIEWER__.scene.getObjectByName('done-window-pane'), far: window.__GEN2_VIEWER__.camera.far }));
  assert.deepEqual(off, { pane: false, far: 8000 }, 'Neutral: the pane gone');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE CRACK (main.js, the AO's moving frames; Joey 2026-10-26: a cover's seam dashed, the label lips beaded): a gap
   between two parts that is under a texel takes no occlusion of its own in a moving frame's single AO pass - measured,
   about a tenth of the dark texels of a moving shot, the beads - and at rest the settle's passes run as before */
test('Assemble: the Done scene\'s moving AO leaves a gap under a texel unoccluded, and at rest runs as before', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'high'); localStorage.setItem('gen2-quality:set', '1'); } catch {} window.__DONE_TIMING__ = { maxFrameMs: 1e9, enterMs: 1500 }; });
  const { page, errors } = await open('assemble', { query: '&done=room', context: ctx });
  await btn(page, 'Skip to the finished build', '#ws-steps').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 30_000 });
  await btn(page, 'Next', '#ws-player').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await btn(page, 'Watch the final scene', '#ws-player').click();
  await page.waitForFunction(() => { const d = window.__GEN2_DONE__; return d && d.sequence.on && !d.sequence.entering; }, null, { timeout: 60_000 }).catch(() => assert.fail('the grammar never began'));
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 11000, maxFrameMs: 1e9, seed: 1 }));
  // the AO's dark texels at one moment of a moving shot, the crack check on and off
  const dark = async (on) => {
    await page.evaluate((on) => window.__GEN2_VIEWER__.aoCrack.set(on), on);
    await page.evaluate(() => window.__GEN2_DONE__.jump('low'));
    await settle(page, 300);
    await page.evaluate(() => window.__GEN2_DONE__.seek(2500));
    await settle(page, 400);
    return page.evaluate(() => {
      const v = window.__GEN2_VIEWER__, a = v.ao, rt = a.rtBlur, w = rt.width, h = rt.height, px = new Uint8Array(w * h * 4);
      v.renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
      let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] < 0.7 * 255) n++;
      return { n, moving: window.__GEN2_DONE__.sequence.moving, crack: a.aoMat.uniforms.uCrack.value, wanted: v.aoWanted() };
    });
  };
  const on = await dark(true), off = await dark(false);
  await page.evaluate(() => window.__GEN2_VIEWER__.aoCrack.set(true));
  assert.ok(on.moving && on.wanted && on.crack > 0 && off.crack === 0, `a moving frame's AO, the check on and then off (${JSON.stringify({ on, off })})`);
  assert.ok(off.n > 0 && on.n < 0.97 * off.n, `the gaps under a texel unoccluded: fewer dark texels with the check (${on.n} vs ${off.n})`);
  // at rest: the shot held, the settle's passes accumulate with the check off
  await page.evaluate(() => window.__GEN2_DONE__.setTiming({ holdMs: 1e9, maxFrameMs: 1e9, seed: 1, hold: true }));
  await page.waitForFunction(() => window.__GEN2_VIEWER__.ao.passes > 2, null, { timeout: 30_000 }).catch(() => {});
  const rest = await page.evaluate(() => ({ passes: window.__GEN2_VIEWER__.ao.passes, crack: window.__GEN2_VIEWER__.ao.aoMat.uniforms.uCrack.value }));
  assert.ok(rest.passes > 2 && rest.crack === 0, `at rest the passes accumulate with the check off (${JSON.stringify(rest)})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* A COLLAPSED SHEET SAYS IT OPENS (Joey 2026-10-28: the bar "looks kind of like just a static bar until i click it ... there's
   nothing about it that says expand me"). Its caret is drawn - the sprite lacked caret-up, so a collapsed handle showed
   none - and once per browser the top collapsed sheet nudges up a second after load (phone.js, the one-time nudge): it plays on a first
   visit, not again on a reload, and never under reduced motion. Every other case marks it played (open(), FAST) */
test('Phone sheets: a collapsed handle shows its up caret, and the one-time nudge plays once - not on reload, not under reduced motion', async () => {
  const phoneCtx = async (o = {}) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...o }); contexts.add(c);
    await c.addInitScript(() => {
      try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); } catch {}
      window.__nudges = 0;   // every sheet that takes the nudge class, from the first paint on
      new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('nudge') && !(m.oldValue || '').includes('nudge')) window.__nudges++; })
        .observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
    return c;
  };
  const ctx = await phoneCtx();
  // Build: the first workspace a visitor meets, its library sheet collapsed (Colors and Parts open theirs: nothing to nudge)
  const { page, errors } = await open('build', { phone: true, context: ctx });
  await page.waitForFunction(() => document.querySelector('#ws .sheet:not(.open) > .sheet-handle .chev use'), null, { timeout: 60_000 });
  // the caret it points at is in the sprite the page is served (a <use> of a missing symbol draws nothing, silently)
  const chev = await page.evaluate(async () => { const u = document.querySelector('#ws .sheet:not(.open) > .sheet-handle .chev use'); const href = u.getAttribute('href');
    const [file, id] = href.split('#'); const svg = await (await fetch(file)).text(); return { id, inSprite: svg.includes(`<symbol id="${id}"`) }; });
  assert.deepEqual(chev, { id: 'ph-caret-up', inSprite: true }, 'the collapsed handle draws its up caret');
  const played = await page.waitForFunction(() => window.__nudges > 0 && localStorage.getItem('gen2-sheet-nudged') === '1', null, { timeout: 6_000 }).then(() => true).catch(() => false);
  assert.ok(played, 'a first visit: the top collapsed sheet nudges and the browser remembers it');
  await page.waitForFunction(() => !document.querySelector('#ws .sheet.nudge'), null, { timeout: 5_000 }).catch(() => assert.fail('the nudge class stayed on'));
  // a reload: remembered, so no nudge
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#ws .sheet > .sheet-handle'), null, { timeout: 60_000 });
  await settle(page, 2500);
  assert.equal(await page.evaluate(() => window.__nudges), 0, 'no nudge on a reload');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
  // reduced motion: never, and nothing remembered
  const rctx = await phoneCtx({ reducedMotion: 'reduce' });
  const r = await open('build', { phone: true, context: rctx });
  await r.page.waitForFunction(() => document.querySelector('#ws .sheet > .sheet-handle'), null, { timeout: 60_000 });
  await settle(r.page, 2500);
  assert.deepEqual(await r.page.evaluate(() => [window.__nudges, localStorage.getItem('gen2-sheet-nudged')]), [0, null], 'no nudge under reduced motion');
  await rctx.close();
});

/* THE PICKER'S FILAMENTS ON A PHONE (Joey 2026-10-26, live: "I don't think filament colors actually show up on mobile at
   all"): in the sheet the list is its full height and the sheet scrolls it - the desktop's own-scroller rule left it no
   height under the material chips, Printed on, the buy line and the resets */
test('Colors on a phone: a region\'s picker shows its filaments at their full height, the sheet scrolling them', async () => {
  const { ctx, page, errors } = await open('colors', { phone: true });
  await page.waitForFunction(() => document.querySelector('#ws-colors .crow'), null, { timeout: 60_000 });
  await page.locator('#ws-colors .crow').first().click();
  await page.waitForFunction(() => document.querySelector('#ws-picker .brands button.sw'), null, { timeout: 20_000 }).catch(() => assert.fail('the picker has no swatches'));
  await settle(page, 600);
  const m = await page.evaluate(() => { const s = document.querySelector('#ws-picker'), b = s.querySelector('.brands'), r = b.getBoundingClientRect(), sw = b.querySelector('button.sw').getBoundingClientRect();
    return { sheet: s.classList.contains('sheet'), h: Math.round(r.height), full: b.scrollHeight, swatches: b.querySelectorAll('button.sw').length, sheetScrolls: s.scrollHeight > s.clientHeight, sw: Math.round(sw.height) }; });
  assert.ok(m.sheet && m.swatches > 20, `the picker is a sheet with its swatches (${JSON.stringify(m)})`);
  assert.ok(m.h >= m.full - 2 && m.h > 300, `the list at its full height, not squeezed (${JSON.stringify(m)})`);
  assert.ok(m.sheetScrolls && m.sw > 20, `the sheet scrolls it, each swatch full size (${JSON.stringify(m)})`);
  /* THE ROWS AROUND IT, TIGHTENED (Joey 2026-10-27: "sometimes I only get a sliver of the menu to work with"): nothing in
     the sheet shrinks (the search was 19 px of its 36, a bare input in the sheet's column), the title row gives way to the handle, which names the region and
     carries the ×, the search shares a row with the material chips and Buy one with the reset */
  const t = await page.evaluate(() => { const s = document.querySelector('#ws-picker'), box = (q) => { const e = s.querySelector(q); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; };
    return { search: box('.search'), chips: box('.mrow'), head: box(':scope > .head'), hx: box('.sheet-handle .hx'), ttl: s.querySelector('.sheet-handle .ttl').textContent, buy: box('.foot .buy'), reset: box('.foot .resets') }; });
  assert.ok(t.search && t.search[1] >= 34, `the search at its full height (${JSON.stringify(t)})`);
  assert.ok(t.chips && Math.abs((t.chips[0] + t.chips[1] / 2) - (t.search[0] + t.search[1] / 2)) <= 2, `the material chips on the search's row (${JSON.stringify(t)})`);
  assert.ok(!t.head && t.hx && /^\S.* · /.test(t.ttl), `the handle names the region and carries the ×, the title row hidden (${JSON.stringify(t)})`);
  assert.ok(t.buy && t.reset && t.reset[0] < t.buy[0] + t.buy[1] && t.buy[0] < t.reset[0] + t.reset[1], `Buy and the reset share a row (${JSON.stringify(t)})`);
  // the × from the keyboard (the phone journey taps it): Enter is the button's, not the handle's toggle (Sol 01a17d29)
  await page.locator('#ws-picker .sheet-handle .hx').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#ws-picker').hidden, null, { timeout: 15_000 }).catch(() => assert.fail('Enter on the handle\'s × did not close the picker'));
  // Parts' sheet the same way: its list was one row tall (83 px), scrolling inside the sheet
  await page.locator('#ws-tabbar .tab', { hasText: 'Parts' }).tap();
  await page.waitForFunction(() => document.querySelector('#ws-parts .body .prow'), null, { timeout: 60_000 }).catch(() => assert.fail('the Parts list did not render'));
  if (!(await page.evaluate(() => document.querySelector('#ws-parts').classList.contains('open')))) await page.locator('#ws-parts .sheet-handle').tap();
  await settle(page, 600);
  const p = await page.evaluate(() => { const b = document.querySelector('#ws-parts .body'), s = document.querySelector('#ws-parts'); return { h: Math.round(b.getBoundingClientRect().height), full: b.scrollHeight, sheetScrolls: s.scrollHeight > s.clientHeight }; });
  assert.ok(p.h >= p.full - 2 && p.h > 300 && p.sheetScrolls, `the Parts list at its full height, the sheet scrolling it (${JSON.stringify(p)})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE PART CARD ON A PHONE (Joey 2026-10-27, on his S23, 360 x 675 in his browser: "when I'm in the color tab and I select
   open drawer" - the drawer opened behind the card): the stage frames the model above the card, not just above the
   handles (colors.js phoneBottom), and the card is shorter - its region chips and Open the drawer share one wrapping row */
test('Colors on a phone: a tapped part\'s card sits under the model, framed above it, its chips and Open the drawer on shared rows', async () => {
  const { ctx, page, errors } = await open('colors', { phone: true, viewport: { width: 360, height: 675 } });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-colors .crow'), null, { timeout: 60_000 });
  await settle(page, 1500);
  const id = await page.evaluate(() => window.__GEN2_STORE__.state.placed[0].id);
  const sp = await page.evaluate((i) => window.__GEN2_VIEWER__.unitScreen(i), id);
  assert.ok(sp && await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', sp), `the first unit's front is on the model (${JSON.stringify(sp)})`);
  await page.touchscreen.tap(sp.x, sp.y);
  await page.waitForFunction(() => !document.querySelector('#ws-partcard').hidden, null, { timeout: 30_000 }).catch(() => assert.fail('the tap showed no part card'));
  const open1 = page.locator('#ws-partcard button', { hasText: 'Open the drawer' });
  assert.equal(await open1.count(), 1, 'the tapped part rides a drawer: the card offers Open the drawer');
  await open1.tap();
  await settle(page, 2000);   // the guided camera's 500 ms re-fit to the new free region, and the drawer's slide
  const m = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__, T = v.THREE, c = document.querySelector('#ws-partcard').getBoundingClientRect(), r = v.renderer.domElement.getBoundingClientRect();
    const owner = v.partInfo(v.selectedId).owner, b = v.unitBox(owner); let y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) { const p = new T.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(v.camera); const y = r.top + (1 - p.y) / 2 * r.height; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const top = (q) => Math.round(q.getBoundingClientRect().top);
    const btn = [...document.querySelectorAll('#ws-partcard button.key')].find((x) => /Open the drawer/.test(x.textContent));
    return { vh: innerHeight, cardTop: Math.round(c.top), cardH: Math.round(c.height), safe: v.safeArea, unit: [Math.round(y0), Math.round(y1)], btnTop: top(btn), chipTops: [...document.querySelectorAll('#ws-partcard .zchip')].map(top), meta: document.querySelector('#ws-partcard .meta').textContent };
  });
  assert.ok(m.safe && m.safe.bottom >= m.vh - m.cardTop, `the stage's free region ends above the card (${JSON.stringify(m)})`);
  // the build is framed above the card; the opened drawer slides toward the camera past the framed build (a peek never
  // moves the camera, 2026-10-21), so its front lip may reach the card's edge - three quarters of the unit or more shows
  // (measured 0.88 at 360 x 675; with the card left out of the free region, 0.11: the drawer opened behind the card)
  assert.ok((m.cardTop - m.unit[0]) / (m.unit[1] - m.unit[0]) >= 0.75, `the opened unit shows above the card, not behind it (${JSON.stringify(m)})`);
  assert.ok(m.chipTops.includes(m.btnTop), `Open the drawer shares a row with the region chips (${JSON.stringify(m)})`);
  assert.match(m.meta, /^\d+ of this size · /, `"of this size", never "of this sizes" (${m.meta})`);
  // and no inside-size pills on it: they are Build's, zoomed in (Joey 2026-10-27, peekUnit { pills: false })
  const pillsShown = () => page.evaluate(() => ['dim-w', 'dim-l', 'dim-h'].filter((id) => { const e = document.getElementById(id); return !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }));
  assert.deepEqual(await pillsShown(), [], 'Colors\' Open the drawer shows no W / L / H pills');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE PHONE ON ITS SIDE (Joey 2026-10-27: "Build a landscape phone layout: the tab bar as a left rail, the top bar and
   tools on one row, sheets opening as a side panel, so the model gets most of the screen"). At his S23's 780 x 260 the
   portrait chrome left the model 26 px. Here, in Colors, Build and Assemble: the tabs a rail, the bar and every tool one
   row at full size, the sheets and the dock (or the player, its Next in view) a column on the right, an open sheet the
   column's height under the row, and the stage's free region the rest; and turning the phone takes the layout with it */
const sideLayout = (page) => page.evaluate(() => {
  const b = (q) => { const e = typeof q === 'string' ? document.querySelector(q) : q; if (!e || e.hidden || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const sheets = [...document.querySelectorAll('#ws .sheet')].filter((s) => !s.hidden && s.getClientRects().length).map((s) => ({ id: s.id, open: s.classList.contains('open'), ...b(s) }));
  const tools = [...document.querySelectorAll('#ws-tools > *')].filter((c) => c.getClientRects().length && getComputedStyle(c).display !== 'none').map((c) => b(c).w);
  const next = [...document.querySelectorAll('#ws-player button')].find((x) => /Next|Finish|Done/.test(x.textContent));
  return { vw: innerWidth, vh: innerHeight, rail: b('#ws-tabbar'), top: b('#ws-top'), tools: b('#ws-tools'), toolW: tools, dock: b('#ws-dock'), player: b('#ws-player'), next: next ? b(next) : null, sheets, safe: window.__GEN2_VIEWER__.safeArea };
});
test('the phone on its side: the tabs a rail, the bar and the tools one row, the sheets and the dock a column on the right, the model the rest; turning the phone takes the layout along', async () => {
  for (const ws of ['colors', 'build', 'assemble']) {
    const { ctx, page, errors } = await open(ws, { phone: true, viewport: { width: 780, height: 260 } });
    await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-tabbar'), null, { timeout: 60_000 });
    await settle(page, 1200);
    const m = await sideLayout(page), j = JSON.stringify(m);
    assert.ok(m.rail && m.rail.l === 0 && m.rail.w <= 80 && m.rail.h === m.vh, `${ws}: the tabs a rail down the left (${j})`);
    assert.ok(m.top && m.tools && m.top.t === m.tools.t && m.top.r <= m.tools.l && m.top.l >= m.rail.r, `${ws}: the bar and the tools one row, after the rail (${j})`);
    assert.ok(m.toolW.every((w) => w >= 44), `${ws}: every tool at its full size, none squeezed (${j})`);
    assert.ok(m.tools.l - m.top.r <= 12, `${ws}: the tools start where the bar ends (phone.js --top-r) (${j})`);
    // at 780 the build name gives Build's seven tools their room: none scrolled out of view
    assert.ok(await page.evaluate(() => { const t = document.querySelector('#ws-tools'); return t.scrollWidth <= t.clientWidth + 1; }), `${ws}: every tool in view at 780 px (${j})`);
    const col = m.vw - 340;
    assert.ok(m.sheets.length && m.sheets.every((s) => s.l >= col - 1 && s.r === m.vw && s.t >= m.top.b), `${ws}: the sheets a column on the right, under the row (${j})`);
    const floor = m.dock || m.player;
    assert.ok(floor && floor.l >= col && floor.r <= m.vw && floor.b <= m.vh, `${ws}: the ${m.dock ? 'dock' : 'player'} in the column (${j})`);
    if (m.player) assert.ok(m.next && m.next.b <= m.player.b && m.next.t >= m.player.t, `assemble: Next in view on the player (${j})`);
    assert.ok(m.safe && m.safe.left >= m.rail.r && m.safe.right >= m.vw - col && m.safe.top >= m.top.b, `${ws}: the stage's free region clear of the rail, the row and the column (${j})`);
    const free = [m.vw - m.safe.left - m.safe.right, m.vh - m.safe.top - m.safe.bottom];
    assert.ok(free[0] >= 300 && free[1] >= 180, `${ws}: the model gets ${free.join(' x ')} px (it was 26 px tall) (${j})`);
    // a sheet opened by its handle: the column's height under the row (over the dock, the screen being this short)
    await page.evaluate(() => { const s = [...document.querySelectorAll('#ws .sheet')].find((x) => !x.hidden && x.getClientRects().length); if (!s.classList.contains('open')) s.querySelector(':scope > .sheet-handle').click(); });
    await settle(page, 700);
    const o = (await sideLayout(page)).sheets.find((s) => s.open);
    assert.ok(o && o.t >= m.top.b && o.h >= 180 && o.l >= col - 1, `${ws}: an open sheet fills the column under the row (${JSON.stringify(o)})`);
    if (ws === 'colors') {
      // turning the phone upright and back: the bar goes to the bottom, then back to the rail
      await page.setViewportSize({ width: 360, height: 675 });
      await settle(page, 900);
      const u = await sideLayout(page);
      assert.ok(u.rail.t === u.vh - u.rail.h && u.rail.w === u.vw && u.sheets.every((s) => s.l === 0), `upright: the tab bar at the bottom, the sheets full width (${JSON.stringify(u)})`);
      await page.setViewportSize({ width: 780, height: 260 });
      await settle(page, 900);
      const s2 = await sideLayout(page);
      assert.ok(s2.rail.h === s2.vh && s2.sheets.every((s) => s.l >= col - 1) && s2.safe.right >= s2.vw - col, `on its side again: the rail and the column, the free region with them (${JSON.stringify(s2)})`);
    }
    assert.deepEqual(clean(errors), [], ws);
    await ctx.close();
  }
  // a smaller phone on its side (667 x 340): Build's tools have less room than they need, so the row scrolls; none squeezes
  const { ctx, page, errors } = await open('build', { phone: true, viewport: { width: 667, height: 340 } });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-tabbar'), null, { timeout: 60_000 });
  await settle(page, 1000);
  const s = await sideLayout(page);
  assert.ok(await page.evaluate(() => { const t = document.querySelector('#ws-tools'); return t.scrollWidth > t.clientWidth; }), `the control: at 667 px the tools need more than their row (${JSON.stringify(s)})`);
  assert.ok(s.toolW.every((w) => w >= 44), `at 667 px every tool keeps its 44 px, the row scrolling (${JSON.stringify(s)})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE PHONE TOUR (Joey 2026-10-27: "Are we able to test other tabs on the planner on mobile and make sure they behave as
   expected?"). Build, Labels, Parts and Assemble walked at his S23's 360 x 675 and 780 x 260 found: an open sheet's glass
   showing the collapsed handles and the dock through it, the rows scrolled under a handle reading through its title,
   Assemble's step words in a 31 px scroller of their own on its side and its Back / Slow-mo / Next broken over two lines
   upright, Label settings' Off / On 26 px tall */
test('the phone tour: an open sheet hides what it covers, its handle hides what scrolls under it, Assemble\'s words and keys fit, Label settings take a finger', async () => {
  const S23 = { width: 360, height: 675 }, SIDE = { width: 780, height: 260 };
  const vis = (page, q) => page.evaluate((q) => { const e = document.querySelector(q); return e ? getComputedStyle(e).visibility : null; }, q);
  // one-line messages carrying the value: on Node 24 a failed equal / deepEqual prints its diff in place of the message, and
  // the CI annotations show only one-line errors (run 40573879962 named this case and nothing else)
  const same = (actual, expected, msg) => assert.ok(JSON.stringify(actual) === JSON.stringify(expected), `${msg} (got ${JSON.stringify(actual)})`);
  {
    const { ctx, page, errors } = await open('build', { phone: true, viewport: S23 });
    await settle(page, 1500);
    const sp = await page.evaluate(() => window.__GEN2_VIEWER__.unitScreen(window.__GEN2_STORE__.state.placed[0].id));
    await page.touchscreen.tap(sp.x, sp.y);
    await page.waitForFunction(() => { const s = document.getElementById('ws-insp'); return s && !s.hidden; }, null, { timeout: 30_000 });
    same(await vis(page, '#ws-lib'), 'visible', 'the control: both handles show while both sheets are collapsed');
    await page.click('#ws-insp .sheet-handle');
    await page.waitForFunction(() => document.getElementById('ws-insp').classList.contains('open'), null, { timeout: 15_000 });
    same(await vis(page, '#ws-lib'), 'hidden', 'the library\'s collapsed handle steps out under the open unit sheet');
    same(await vis(page, '#ws-dock'), 'visible', 'upright the open sheet sits above the dock, which stays');
    same((await page.evaluate(() => getComputedStyle(document.querySelector('#ws-insp .sheet-handle')).backgroundImage)).match(/gradient/g)?.length, 2, 'the handle\'s glass tripled: the colour and two layers over it');
    await page.click('#ws-insp .sheet-handle');
    await page.waitForFunction(() => !document.getElementById('ws-insp').classList.contains('open'), null, { timeout: 15_000 });
    same(await vis(page, '#ws-lib'), 'visible', 'closed, the library\'s handle is back');
    same(clean(errors), [], 'build');
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open('labels', { phone: true, viewport: SIDE });
    await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
    await page.click('#ws-labels .sheet-handle');
    await page.waitForFunction(() => document.getElementById('ws-labels').classList.contains('open'), null, { timeout: 15_000 });
    same(await vis(page, '#ws-dock'), 'hidden', 'on its side the sheet takes the whole column: the dock under it steps out');
    // Label settings: Off / On at a finger's 32 px
    const segs = await page.evaluate(() => { const d = [...document.querySelectorAll('#ws-labels details')].find((x) => x.querySelector('.srow .seg.sm')); d.open = true; return [...d.querySelectorAll('.srow .seg.sm')].map((b) => Math.round(b.getBoundingClientRect().height)); });
    assert.ok(segs.length && segs.every((h) => h >= 32), `Label settings' Off / On ${segs.join(', ')} px`);
    await page.click('#ws-labels .sheet-handle');
    await page.waitForFunction(() => !document.getElementById('ws-labels').classList.contains('open'), null, { timeout: 15_000 });
    same(await vis(page, '#ws-dock'), 'visible', 'closed, the dock is back');
    same(clean(errors), [], 'labels');
    await ctx.close();
  }
  for (const [vp, side] of [[SIDE, true], [S23, false], [{ width: 320, height: 640 }, false]]) {
    const { ctx, page, errors } = await open('assemble', { phone: true, viewport: vp });
    await page.waitForSelector('#ws-player .text', { timeout: 60_000 });
    await settle(page, 1200);
    // what holds in any font: the keys' words are drawn in the system font (the bundled IBM Plex Sans file has the arrows and
    // no letters: Segoe UI here, Roboto on Joey's S23, a wider face on the CI runner, where "Slow-mo" was 58 px in a 51 px key,
    // run 40578209480), so whether a word fits whole at 360 is the font's; one line, one row and a cut kept inside are not
    const m = await page.evaluate(() => {
      const t = document.querySelector('#ws-player .text');
      const keys = [...document.querySelectorAll('#ws-player .row2 .key')].filter((b) => b.getClientRects().length && b.textContent.trim());
      const lines = keys.map((b) => { const r = document.createRange(); r.selectNodeContents(b); return [b.textContent.trim(), new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size]; });
      const rows = new Set([...document.querySelectorAll('#ws-player .row2 .key')].filter((b) => b.getClientRects().length).map((b) => Math.round(b.getBoundingClientRect().top))).size;
      // a word wider than its key: clipped to an ellipsis inside it, or it paints over the next key
      const over = keys.filter((b) => b.scrollWidth > b.clientWidth).map((b) => [b.textContent.trim(), getComputedStyle(b).overflowX, getComputedStyle(b).textOverflow]);
      return { own: t.scrollHeight > t.clientHeight + 1, lines, rows, over };
    });
    if (side) same(m.own, false, `on its side the step's words are not a scroller of their own: the card scrolls (${JSON.stringify(m)})`);
    // and the five keys still one row: words kept whole by pushing Next onto a row of its own made the card taller
    else assert.ok(m.lines.length >= 3 && m.lines.every(([, n]) => n === 1) && m.rows === 1, `upright every key on one line, all on one row (${JSON.stringify(m)})`);
    if (vp.width === 320) {
      assert.ok(m.over.length, `the control: at 320 px "Slow-mo" is wider than its key (${JSON.stringify(m)})`);
      assert.ok(m.over.every(([, o, t]) => o === 'hidden' && t === 'ellipsis'), `at 320 px a word too wide for its key ends in an ellipsis inside it (Terra 01a17e76) (${JSON.stringify(m.over)})`);
    }
    same(clean(errors), [], 'assemble');
    await ctx.close();
  }
});

/* THE ROW CENTRED UNDER THE TABS (Joey 2026-10-27: "can we center the icons at the top of the screen better, it looks offset
   after we removed a few"). In every workspace, at four desktop widths: the toolbar's buttons are centred under the tab bar
   within a pixel, or, where the space between the side panels does not reach that far, pressed to that space's edge - and
   never outside it. The control: before the change the row sat 72 px right of the tabs in Build at 1600 (232 in Assemble). */
test('the toolbar row sits centred under the tabs in every workspace, inside the space the side panels leave', async () => {
  const { ctx, page, errors } = await open('build');
  const seen = [];
  for (const w of [1280, 1440, 1600, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const ws of ['build', 'colors', 'labels', 'parts', 'assemble']) {
      await page.evaluate((x) => window.__GEN2_CTX__().switchTo(x), ws);
      await page.waitForTimeout(250);   // the observer's frame
      const m = await page.evaluate(() => {
        const t = document.getElementById('ws-tabs').getBoundingClientRect(), tools = document.getElementById('ws-tools');
        // the space the CSS gives the row: its box before the shift (translate moves the box with the buttons)
        const box = tools.getBoundingClientRect(), shift = parseFloat((tools.style.translate || '0').split(' ')[0]) || 0;
        const kids = [...tools.children].filter((k) => k.getClientRects().length).map((k) => k.getBoundingClientRect());
        const l = Math.min(...kids.map((r) => r.left)), r = Math.max(...kids.map((r) => r.right));
        return { tabs: (t.left + t.right) / 2, row: (l + r) / 2, l, r, spaceL: box.left - shift, spaceR: box.right - shift };
      });
      const centred = Math.abs(m.row - m.tabs) <= 1, atEdge = Math.abs(m.l - m.spaceL) <= 1 || Math.abs(m.r - m.spaceR) <= 1;
      seen.push(`${w} ${ws}: ${Math.round(m.row - m.tabs)} px`);
      assert.ok(m.l >= m.spaceL - 1 && m.r <= m.spaceR + 1, `${w} ${ws}: the row stays inside the space between the panels (${JSON.stringify(m)})`);
      assert.ok(centred || atEdge, `${w} ${ws}: centred under the tabs, or at its space's edge (${JSON.stringify(m)})`);
    }
  }
  assert.ok(seen.filter((s) => / 0 px$|: -?1 px$/.test(s)).length >= 15, `centred in most cases (${seen.join('; ')})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* NO DEAD CONTROLS IN THE TOOLBAR (Joey 2026-10-27: Explode "does nothing, just says something about assemble phase 1",
   the 3D/2D toggle "seems odd in all tabs other than Build where it can be used", and Measure "does nothing on the colors
   tab"): the 3D/2D switch is Build's alone, with both halves live; Explode is Assemble's alone; Measure is Build's and
   Assemble's; and no workspace's bar holds a disabled view button */
test('the toolbar: 3D/2D only in Build, Explode only in Assemble, Measure in Build and Assemble, nothing in any bar that does nothing', async () => {
  const { ctx, page, errors } = await open('build');
  const bars = await page.evaluate(() => {
    const out = {};
    for (const ws of ['build', 'colors', 'labels', 'parts', 'assemble']) {
      window.__GEN2_CTX__().switchTo(ws);
      const t = document.querySelector('#ws-tools'), chip = t && t.querySelector(':scope > .view:not(.backdrop)');
      out[ws] = { bar: !!t, view: chip ? [...chip.querySelectorAll('button')].map((b) => `${b.textContent}${b.disabled ? ' (disabled)' : ''}`) : null,
        explode: !!(t && t.querySelector('.explode')), measure: !!(t && t.querySelector('.measure')), disabledView: t ? t.querySelectorAll('.view button[disabled]').length : 0 };
    }
    return out;
  });
  for (const [ws, b] of Object.entries(bars)) {
    assert.ok(b.bar, `${ws} has its toolbar (${JSON.stringify(bars)})`);
    assert.ok(ws === 'build' ? JSON.stringify(b.view) === '["3D","2D"]' : b.view === null, `${ws}: the 3D/2D switch ${ws === 'build' ? 'with both halves live' : 'is not there'} (${JSON.stringify(bars)})`);
    assert.ok(b.explode === (ws === 'assemble'), `${ws}: Explode ${ws === 'assemble' ? 'is there' : 'is not there'} (${JSON.stringify(bars)})`);
    assert.ok(b.measure === (ws === 'build' || ws === 'assemble'), `${ws}: Measure ${b.measure ? 'is there' : 'is not there'} (${JSON.stringify(bars)})`);
    assert.ok(b.disabledView === 0, `${ws}: no disabled view button (${JSON.stringify(bars)})`);
  }
  // Explode in Assemble still does what it says: from step 1 (Assemble arrives ON the overview) back to the exploded overview
  const onPage = () => page.evaluate(() => document.querySelector('#ws-steps [aria-current="step"]')?.title || '');
  await page.locator('#ws-steps button.step').nth(1).click();
  await page.waitForFunction(() => !/exploded/i.test(document.querySelector('#ws-steps [aria-current="step"]')?.title || 'exploded'), null, { timeout: 15_000 })
    .catch(async () => assert.fail(`step 1 did not become the current page (${await onPage()})`));
  await page.locator('#ws-tools .explode').click();
  await page.waitForFunction(() => /exploded/i.test(document.querySelector('#ws-steps .on, #ws-steps [aria-current="step"]')?.title || ''), null, { timeout: 15_000 })
    .catch(async () => assert.fail(`Explode did not open the exploded overview (${await page.evaluate(() => document.querySelector('#ws-steps')?.innerHTML.slice(0, 300))})`));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE SETUP SHEET LEADS THROUGH ITS STEPS (Joey 2026-10-27: the length "is extremely easy to overlook ... you instantly want
   to click the apply button and not the next button"; the printer list "a bright grey on grey"): before the last step the
   orange button is Next and Apply a plain one beside it; on Printer the orange one applies; an open select list draws on an
   opaque ground in the dark bar's charcoal */
test('the setup sheet: Next is the orange button until Printer, Apply stays a plain one beside it, the printer list is opaque', async () => {
  const { ctx, page, errors } = await open('build');
  await page.locator('#ws-top .chip-btn.mount').click();
  await page.waitForSelector('#ws-setup .card', { timeout: 30_000 });
  const foot = () => page.evaluate(() => ({ cta: document.querySelector('#ws-setup .btns .cta')?.textContent.trim(), plain: [...document.querySelectorAll('#ws-setup .btns .key')].map((b) => b.textContent.trim()) }));
  const seen = [];
  for (let i = 0; i < 3; i++) {
    seen.push(await foot());
    if (i < 2) await page.locator('#ws-setup .btns .cta').click();
  }
  assert.deepEqual(seen, [{ cta: 'Next · Length', plain: ['Apply'] }, { cta: 'Next · Printer', plain: ['Back', 'Apply'] }, { cta: 'Apply', plain: ['Back'] }], JSON.stringify(seen));
  const opt = await page.evaluate(() => { const s = document.querySelector('#ws-setup select'), cs = getComputedStyle(s.querySelector('option')); return { bg: cs.backgroundColor, color: cs.color, ink: getComputedStyle(s).color, mode: document.documentElement.dataset.mode }; });
  assert.ok(opt.mode === 'dark' && opt.bg === 'rgb(29, 30, 32)' && opt.color === opt.ink, `the printer list: the select's own ink on opaque charcoal (${JSON.stringify(opt)})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE ROOM | NEUTRAL SWITCH ON A PHONE (2026-10-26): the bar fitted its 370 px exactly before the switch; with it, the
   3D-only chip and Explode's "comes later" gave way, and nothing is squeezed or scrolled. Since 2026-10-27 Colors' bar
   carries neither at any width (the toolbar adds them only where they work) */
test('Colors on a phone: the Room | Neutral switch fits the bar, no 3D-only chip or Explode, every button full size', async () => {
  const { ctx, page, errors } = await open('colors', { visitor: true, phone: true });
  await page.waitForFunction(() => document.querySelector('#ws-tools .backdrop'), null, { timeout: 60_000 });
  await settle(page, 800);
  const bar = await page.evaluate(() => { const t = document.querySelector('#ws-tools'), r = t.getBoundingClientRect();
    return { client: t.clientWidth, scroll: t.scrollWidth, right: Math.round(r.right), vw: innerWidth, fixed: !!document.querySelector('#ws-tools > .view:not(.backdrop)'), explode: !!document.querySelector('#ws-tools .explode'),
      buttons: [...t.querySelectorAll(':scope > .icon-btn')].filter((b) => b.checkVisibility()).map((b) => Math.round(b.getBoundingClientRect().width)), backdrop: [...t.querySelectorAll('.backdrop button')].map((b) => b.textContent) }; });
  assert.deepEqual(bar.backdrop, ['Room', 'Neutral']);
  assert.equal(bar.fixed, false, 'no 3D-only chip'); assert.equal(bar.explode, false, 'no Explode');
  assert.ok(bar.scroll <= bar.client && bar.right <= bar.vw, `nothing scrolled or off the screen (${JSON.stringify(bar)})`);
  assert.ok(bar.buttons.length >= 3 && bar.buttons.every((w) => w >= 40), `every button full size (${JSON.stringify(bar.buttons)})`);   // Reset view, Undo, Redo
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE STEAM OVER THE STILL PICTURE (Joey 2026-10-26: "after the user stop moving the camera and it switches over to the
   detailed render view ... doesn't freeze the coffee steam, maybe it becomes like a post-processing overlay"): Very High
   at rest on the Colors stage (no lens there), the mean converged. The steam ticks and asks for frames, and no sample is
   rendered for them; two frames 400 ms apart differ only round the steam; and the steam is not baked into the mean: with
   it hidden, the same frame loses it round its column and nowhere else. */
test('Colors: on Very High at rest the steam keeps rising over the still picture, left out of its samples, and nothing else in the frame changes', async () => {
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await vctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
  const { ctx, page, errors } = await open('colors', { visitor: true, context: vctx });
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room' && window.__GEN2_DONE__ && window.__GEN2_DONE__.steam, null, { timeout: 60_000 }).catch(() => assert.fail('the room did not come on within 60 s'));
  const conv = await page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__, t0 = performance.now();
    while (performance.now() - t0 < 90_000 && !(v.acc.ok && v.acc.n >= v.accTotal())) await new Promise((r) => setTimeout(r, 100));
    return { ok: v.acc.ok, n: v.acc.n, total: v.accTotal(), quality: v.quality, lens: v.lens() };
  });
  assert.equal(conv.quality, 'veryhigh');
  assert.equal(conv.lens, null, 'no lens on the Colors stage');
  if (!conv.ok) { assert.equal((await page.evaluate(() => window.__GEN2_DONE__.steam)).overlay, false, 'no accumulator on this runner: no overlay either'); await ctx.close(); return; }
  assert.ok(conv.n >= conv.total, `the still picture converged (${JSON.stringify(conv)})`);
  const r = await page.evaluate(async () => {
    const v = window.__GEN2_VIEWER__, d = window.__GEN2_DONE__, T = v.THREE, el = v.renderer.domElement;
    const a0 = d.steam, s0 = v.acc.sampleCount, o0 = v.acc.overlayDraws, next = v.drawNextFrame;
    let calls = 0; v.drawNextFrame = () => { calls++; next(); };
    try { await new Promise((ok) => setTimeout(ok, 1500)); } finally { v.drawNextFrame = next; }
    const a1 = d.steam, s1 = v.acc.sampleCount, o1 = v.acc.overlayDraws, n1 = v.acc.n;   // the window's own, before the frames below
    // a frame without starting the mean over: one more frame asked for, read in its own animation frame
    const grab = async () => { v.drawNextFrame(); await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const img = new Image(); img.src = el.toDataURL('image/png'); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const f = new T.Vector3(...a1.foot), cam = v.camera;
    const scr = (p) => { const q = p.clone().project(cam); return [(q.x + 1) / 2 * el.width, (1 - q.y) / 2 * el.height]; };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const dx of [-a1.w / 2, a1.w / 2]) for (const dz of [-a1.w / 2, a1.w / 2]) for (const dy of [0, a1.h]) { const [px, py] = scr(f.clone().add(new T.Vector3(dx, dy, dz))); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    const split = (p, q) => { let inside = 0, outside = 0; for (let y = 0; y < el.height; y++) for (let x = 0; x < el.width; x++) { const i = (y * el.width + x) * 4; if (Math.abs((p[i] + p[i + 1] + p[i + 2]) - (q[i] + q[i + 1] + q[i + 2])) <= 6) continue; if (x >= x0 - 3 && x <= x1 + 3 && y >= y0 - 3 && y <= y1 + 3) inside++; else outside++; } return { inside, outside }; };
    const A = await grab(); await new Promise((ok) => setTimeout(ok, 400)); const B = await grab();
    const moved = split(A, B);
    const steam = ['done-steam', 'done-steam-mist'].map((n) => v.scene.getObjectByName(n));
    for (const o of steam) o.visible = false;
    const C = await grab();
    // the reference: the mean built again from nothing with the steam hidden; the held mean, its overlay hidden, must be it
    v.invalidateFrame();
    const t1 = performance.now();
    await new Promise((ok) => setTimeout(ok, 300));
    while (performance.now() - t1 < 90_000 && v.acc.n < v.accTotal()) await new Promise((ok) => setTimeout(ok, 100));
    const D = await grab();
    for (const o of steam) o.visible = true;
    const gone = split(B, C), clean = split(C, D);
    return { clean, overlay: a1.overlay, ticks: a1.ticks - a0.ticks, calls, uTime: +(a1.uTime - a0.uTime).toFixed(3), samples: s1 - s0, draws: o1 - o0, n: n1, total: v.accTotal(), moved, gone };
  });
  assert.equal(r.overlay, true, 'the steam is a rest overlay here');
  assert.ok(r.ticks >= 1 && r.calls >= r.ticks && r.uTime > 0, `at rest the steam ticks and asks for its frames (${JSON.stringify(r)})`);
  assert.ok(r.draws >= 1, `drawn over the still picture (${JSON.stringify(r)})`);
  assert.ok(r.samples === 0 && r.n >= r.total, `and no sample rendered for it: the mean holds (${JSON.stringify(r)})`);
  assert.ok(r.moved.inside > 50 && r.moved.outside === 0, `400 ms apart, the steam moved and nothing else in the frame changed (${JSON.stringify(r.moved)})`);
  assert.ok(r.gone.inside > 50 && r.gone.outside === 0, `hidden, the steam leaves the frame round its column only (${JSON.stringify(r.gone)})`);
  assert.ok(r.clean.inside + r.clean.outside <= 20, `and what is left is the mean built without it: the steam is not in the samples (${JSON.stringify(r.clean)})`);
  console.log('steam overlay', JSON.stringify(r));
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* a room that cannot load (its module request fails) falls back to Studio AND forgets the choice, so a remount does not
   retry it (Terra 01a16b56: the import's failure path cleared the panel's state but left the memo set) */
test('Colors: the Room | Neutral switch when the room fails to load: Neutral comes back, the choice is forgotten, a remount does not bring Room back', async () => {
  // the room comes on by itself now (Room first), so its module fails from the first request
  const fctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await fctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
  await fctx.route('**/scenes/done.js*', (r) => r.abort());
  const { ctx, page, errors } = await open('colors', { query: '&done=room', context: fctx });
  const seg = (t) => page.locator(`#ws-tools .backdrop button:has-text("${t}")`);
  await page.waitForFunction(() => { const on = document.querySelector('#ws-tools .backdrop button[aria-pressed="true"]'); return on && on.textContent === 'Neutral'; }, null, { timeout: 30_000 }).catch(() => assert.fail('Studio did not come back after the failed load'));
  assert.equal(await page.evaluate(() => window.__GEN2_CTX__().memo.colorsRoom), false, 'the choice is forgotten, not only the panel state');
  assert.equal(await page.evaluate(() => localStorage.getItem('gen2-colors-stage')), null, 'and nothing stored: a failed load is not a visitor\'s pick');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.done || null), null, 'no room');
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('parts'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'parts', null, { timeout: 60_000 });
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('colors'));
  await page.waitForFunction(() => document.documentElement.dataset.ws === 'colors' && document.querySelector('#ws-tools .backdrop'), null, { timeout: 60_000 });
  await settle(page, 600);
  assert.equal(await seg('Neutral').getAttribute('aria-pressed'), 'true', 'Neutral on the remount: the failed Room was not retried');
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
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Switch to EdgeLabel')); if (b) b.click(); });
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
  assert.equal(await page.getAttribute('#ws-top .chip-btn.mount', 'aria-label'), 'Wall Mount · 115');
  // the length in its own colour: the divider bar and (dark bar) the number wear 115's stripe colour (Joey 2026-10-27)
  const chip = await page.evaluate(() => { const c = document.querySelector('#ws-top .chip-btn.mount'), bar = c.querySelector('.lenbar');
    return { text: c.textContent, bar: bar && getComputedStyle(bar).backgroundColor, num: getComputedStyle(c.querySelector('.mono')).color, stripe: GEN2.lengths.find((l) => l.id === 115).color, mode: document.documentElement.dataset.mode }; });
  const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  assert.ok(chip.text === 'Wall Mount115' && chip.bar === rgb(chip.stripe) && (chip.mode !== 'dark' || chip.num === rgb(chip.stripe)), `the mount chip: no "·", a ${chip.stripe} bar between, the number in it on the dark bar (${JSON.stringify(chip)})`);
  // the whole trip is quiet, the 200 ms between Start build's commit and the reload included: Build does not push the
  // 115 record into a stage built for the 185 pool (a throttled software run showed 404s for every 115 part otherwise)
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE TOP BAR FITS (2026-10-23). At 1280-1365 the bar is one row and was too full: Share ended 11 px past the bar's edge on
   the root kit and 85 px in the widest case below. From 1366, with the Feedback & support button, that case squeezed the
   button from 44 to 20 px and still left Share 29 px past the edge (21 px at 1581, where the printer's name and Share's
   word come back). The widest case: a long build name, Under-Table (the widest mount word), the Prusa CORE One L (the
   widest printer name), and tab badges no small build reaches, written into the tabs: 99/99 labelled, 999 printed pieces.
   In every workspace, across the tiers' edges: nothing past the bar's right edge, 10 px between controls, no control
   narrower than 44 px, the tabs' own row on the screen below 1280; at 1280-1365 the mount chip gives up its word (not its
   accessible name) and the build name keeps its 120 px floor; above that the name may shorten, never vanish */
test('the top bar fits at every desktop width in its widest case, in every workspace: nothing past its edge, 10 px between controls, the build name kept', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1&setup=1' });
  await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
  await page.fill('#ws-setup input.name', 'The Mighty Bit Bucket Garage Workbench');
  await page.locator('#ws-setup .card:has-text("Under-Table")').click();
  await btn(page, 'Next', '#ws-setup').click();
  await page.locator('#ws-setup .card.len:has-text("185 mm")').click();
  await btn(page, 'Next', '#ws-setup').click();
  await page.selectOption('#ws-setup select.printer', 'coreonel');
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await btn(page, 'Start build', '#ws-setup').click();
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'under-table', null, { timeout: 150_000 });
  await waitBoot(page);
  await page.evaluate(() => document.fonts.ready);   // widths in the planner's own fonts, not the fallback's
  const bar = () => page.evaluate(() => {
    const top = document.getElementById('ws-top'), r = (k) => k.getBoundingClientRect();
    // the switcher's chip, not its wrapper: a wrapper that shrinks while its chip does not lets the chip run over the tabs
    const items = [...top.children].filter((k) => k.checkVisibility() && getComputedStyle(k).position !== 'absolute' && !k.classList.contains('spacer')).map((k) => (k.id === 'ws-switch' ? k.querySelector('.chip-btn') : k));
    const tabs = r(document.getElementById('ws-tabs'));
    return { edge: r(top).right, last: r(items[items.length - 1]).right, inner: innerWidth, tabs: [tabs.left, tabs.right], tabsRow: getComputedStyle(document.getElementById('ws-tabs')).position === 'absolute',
      gaps: items.slice(1).map((k, i) => Math.round(r(k).left - r(items[i]).right)), name: r(document.querySelector('#ws-switch > .chip-btn > span')).width,
      squeezed: items.filter((k) => k.id !== 'ws-logo' && !k.closest('#ws-switch') && r(k).width < 44).map((k) => `${k.id || k.className} ${Math.round(r(k).width)}`),
      word: r(document.querySelector('#ws-top .mount .lbl')).width > 1, printer: document.querySelector('#ws-top .printer').textContent,
      // every control but the tabs (the badges widen them) and the name: the same width, to the 1/64 px Chrome lays out in,
      // with and without the widest badges (rounded, a squeeze under half a pixel would pass: Terra 01a16a58)
      others: items.filter((k) => k.id !== 'ws-tabs' && !k.closest('#ws-switch')).map((k) => `${k.id || k.className} ${r(k).width}`) };
  });
  /* two passes per workspace. First the build's own tabs (this fresh build shows its Parts count): every guarantee, the
     name's floors among them. Then the widest badges written into the tabs: the hard guarantees, and that the name is the ONLY
     control that gives way - every other control keeps the width it had without the badges, and the name never grows. How
     far it gives way there depends on how wide the text draws: the deploy runner (Ubuntu, the same IBM Plex web fonts)
     draws the bar's text wider than Windows does, and run 40004575512 failed a 118 px floor in that pass at 1280 with the
     name at 74.6 px while every other guarantee held (DECISIONS 2026-10-23, "the top bar fits", the runner's figures) */
  const badges = (big) => page.evaluate((big) => { const tabs = [...document.querySelectorAll('#ws-tabs .tab')];
    for (const [l, n] of [['Labels', '99/99'], ['Parts', '999']]) { const t = tabs.find((b) => b.textContent.startsWith(l)); let b = t.querySelector('.badge');
      if (big) { if (!b) { b = t.appendChild(Object.assign(document.createElement('span'), { className: 'badge' })); b.dataset.e2e = '1'; } if (b.dataset.was === undefined) b.dataset.was = b.textContent; b.textContent = n; }
      else if (b) { if (b.dataset.e2e) b.remove(); else if (b.dataset.was !== undefined) { b.textContent = b.dataset.was; delete b.dataset.was; } } } }, big);   // the build's own badge gets its text back
  const WIDTHS = [1024, 1279, 1280, 1300, 1320, 1340, 1350, 1365, 1366, 1400, 1440, 1500, 1501, 1540, 1580, 1581, 1640, 1920];
  for (const [ws, label] of [['build', 'Build'], ['colors', 'Colors'], ['labels', 'Labels'], ['parts', 'Parts'], ['assemble', 'Assemble']]) {
    await page.setViewportSize({ width: 1280, height: 800 });
    if (ws !== 'build') {
      await page.click(`#ws-tabs .tab:has-text("${label}")`);
      await page.waitForFunction(([w, l]) => document.documentElement.dataset.ws === w && document.querySelector('#ws-tabs .tab.on')?.textContent.startsWith(l), [ws, label], { timeout: 60_000 });
    }
    assert.equal((await bar()).printer, 'Prusa CORE One L', `${ws}: the widest printer name`);
    assert.equal(await page.getByRole('button', { name: 'Under-Table · 185' }).count(), 1, `${ws}: the mount chip's accessible name keeps its word at 1280`);
    const plain = {};
    for (const big of [false, true]) {
      await badges(big);
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 800 });
        const m = await bar(), at = `${ws}${big ? ' with the widest badges' : ''} at ${w}: ${JSON.stringify(m)}`;
        assert.ok(m.last <= m.edge + 0.5 && m.edge <= m.inner, `nothing past the bar's right edge - ${at}`);
        assert.ok(m.gaps.every((g) => g >= 10), `10 px between controls - ${at}`);
        assert.deepEqual(m.squeezed, [], `no control narrower than 44 px - ${at}`);
        assert.equal(m.tabsRow, w < 1280, `the tabs have a row of their own below 1280 only - ${at}`);
        if (m.tabsRow) assert.ok(m.tabs[0] >= 0 && m.tabs[1] <= m.inner, `the tabs' row is on the screen - ${at}`);
        const tier = w >= 1280 && w <= 1365;
        assert.equal(m.word, !tier, `the mount chip shows its word outside 1280-1365 only - ${at}`);
        if (!big) { plain[w] = m; assert.ok(m.name >= (tier ? 118 : 60), `the build name keeps ${tier ? 'its 120 px floor' : 'some room'} - ${at}`); }
        else {
          // the badges must be there and count, or this pass measures the plain bar again (Terra 01a16a58): 57 px wider here, 61 on the runner
          assert.ok(m.tabs[1] - m.tabs[0] >= plain[w].tabs[1] - plain[w].tabs[0] + 40, `the widest badges widen the tabs by 40 px or more - ${at}`);
          assert.deepEqual(m.others, plain[w].others, `only the build name gives way: every other control keeps its width - ${at}`);
          assert.ok(m.name <= plain[w].name + 0.5, `the build name gives way, it never grows - ${at}`);
        }
      }
    }
  }
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
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Switch to EdgeLabel')); if (b) b.click(); });
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
   and the build is whole. JOEY is his board: [id, x, y, w, hh], y and hh in half-rows from the top of a 7W x 4H wall grid.
   2026-10-25 (js/rules/settle.js, the Under-Table report): a change of mount SETTLES the layout toward the new surface
   first - moves only, still adds nothing. Of his four gaps two close (units 3, 4, 6 and 7 drop one row onto the table or
   onto what is below); the two under the left half of the 4W cannot close (it rests on unit 8 by its right half) and stay
   empty slots, one row above the table over unit 7. */
const JOEY = [[1, 0, 0, 4, 4], [2, 4, 0, 1, 2], [3, 5, 0, 1, 2], [4, 6, 0, 1, 2], [5, 4, 2, 1, 2], [6, 5, 2, 2, 4], [7, 0, 4, 2, 2], [8, 2, 4, 2, 2], [9, 4, 4, 1, 2], [10, 2, 6, 2, 2], [11, 4, 6, 1, 2]];
const SETTLED = { 3: 2, 4: 2, 6: 2, 7: 2 };   // half-rows each unit drops toward the table on the switch; the rest keep their height
test('the setup sheet: Joey\'s wall build switched to Tabletop settles toward the table, keeps the gaps that cannot close as empty slots, adds nothing; Fill all fills them and the top is levelled by hand', async () => {
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
  assert.match(await text(page, '#ws-setup .warn.stand'), /^As a Tabletop build it will have 2 empty slots under it · Apply adds nothing: fill them in Build before it can be assembled\.$/);
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await btn(page, 'Apply and rebuild', '#ws-setup').click();
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'tabletop', null, { timeout: 150_000 });
  await waitBoot(page);   // the page boots: before 2026-10-20 it stopped on "Can't show this build yet"
  assert.equal(await page.locator('#loading-text:has-text("Can’t show")').count(), 0, 'the build shows');
  const s = await S(page);
  assert.equal(s.placed.length, 11, 'the switch added nothing');
  assert.equal(s.gridH, 5, 'the tabletop grid: his 4 rows plus the headroom row on top');
  const rows = s.gridH * 2, by = new Map(s.placed.map((p) => [p.id, p]));
  // his 11 settled: the same columns and sizes; the four that could drop sit one row lower, the rest at the same height
  // above the table (the tabletop grid adds headroom on top, so y itself moves with it)
  for (const [id, x, y, w, hh] of JOEY) { const p = by.get(id); assert.ok(p && p.x === x && p.w === w && p.hh === hh && rows - (p.y + p.hh) === 8 - (y + hh) - (SETTLED[id] || 0), `unit ${id} ${SETTLED[id] ? 'settled one row down' : 'kept its place'}: ${JSON.stringify(p)}`); }
  const shown = () => page.evaluate(() => { const M = window.__GEN2_VIEWER__.manifest; return { incomplete: M.incomplete || null, ghosts: (M.ghosts || []).length, steps: M.steps.length }; });
  const m0 = await shown();
  // 4 ghosts: one per slot, and one per short top column - units 3 and 4 dropped a row, so the tabletop's top is no longer
  // level over columns 5 and 6 (the 2026-08-23 "finish the top" guide), which Fill all does not fill
  assert.ok(m0.incomplete && m0.incomplete.voids === 2 && m0.incomplete.columns === 4 && m0.ghosts === 4 && m0.steps === 1, `a ghost in each of the 2 slots and the 2 short top columns, no instructions: ${JSON.stringify(m0)}`);
  await page.waitForFunction(() => /Tabletop: 2 empty slots under it to fill · they show red in Build, where Fill all adds 1W cases\./.test(document.getElementById('ws-toast')?.textContent || ''), null, { timeout: 15_000 }).catch(() => assert.fail('no toast naming the empty slots'));
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
  // the two slots sit one row above the table, under the 4W's left half, over unit 7 (which settled onto the table)
  for (const x of [0, 1]) assert.ok(offered.includes(`${x},${rows - 4}`), `a "+" in the slot at column ${x}: ${offered}`);
  // fill ONE slot by hand (the left column): the 4W above keeps its height - it was resting on unit 8 already
  const h1 = rows - (by.get(1).y + by.get(1).hh);
  await page.evaluate((y) => window.__GEN2_BUILD__.placeAt(0, y, { w: 1, h: 1, hh: 2 }, 'decor'), rows - 4);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 12, null, { timeout: 30_000 }).catch(() => assert.fail('the slot was not filled'));
  const s1 = await S(page); const u1 = s1.placed.find((p) => p.id === 1);
  assert.equal(s1.gridH * 2 - (u1.y + u1.hh), h1, 'the 4W kept its height');
  // the slot left is the other one, in column 1, where it was (Terra 01a17520: a count alone would let a void relocate)
  const offered1 = await page.evaluate(() => window.__GEN2_BUILD__.placementSpots({ w: 1, h: 1, hh: 2 }, 'decor').map((p) => `${p.x},${p.y}`));
  assert.ok(offered1.includes(`1,${rows - 4}`) && !offered1.includes(`0,${rows - 4}`), `the column-1 slot is still offered and the filled one is not: ${offered1}`);
  // the stage follows: 1 slot left, still a preview, not "can't be shown"
  await page.waitForFunction(() => { const M = window.__GEN2_VIEWER__.manifest; return M.incomplete && M.incomplete.voids === 1 && !window.__GEN2_VIEWER__.regenBusy; }, null, { timeout: 30_000 }).catch(async () => assert.fail(`the stage did not show the 1 slot left: ${JSON.stringify(await shown())}`));
  // the issue card names the slot left and fills it
  await page.locator('#ws-dock button.status.issue').click();
  await page.waitForSelector('#ws-issues button:has-text("Fill all")', { timeout: 15_000 }).catch(() => assert.fail('no Fill all in the issue card'));
  assert.match(await text(page, '#ws-issues'), /1 empty slot to fill\./);
  await page.locator('#ws-issues button:has-text("Fill all")').click();
  await page.waitForFunction(() => { const M = window.__GEN2_VIEWER__.manifest; return window.__GEN2_STORE__.state.placed.length === 13 && M.incomplete && !M.incomplete.voids && !window.__GEN2_VIEWER__.regenBusy; }, null, { timeout: 60_000 }).catch(async () => assert.fail(`Fill all did not fill the slots: ${JSON.stringify(await shown())}`));
  // the slots are filled; the top is still not level, so Assemble still waits, with the top's words this time
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('assemble'));
  await page.waitForSelector('#ws-player.blocked', { timeout: 15_000 }).catch(() => assert.fail('Assemble did not say the top is not level'));
  assert.match(await text(page, '#ws-player.blocked .text'), /top isn’t level/);
  // level the top by hand: a 1W-1H in each short column, beside unit 2 on the top row
  await btn(page, 'Go to Build', '#ws-player').click();
  await page.waitForSelector('#ws-dock', { timeout: 15_000 });
  const top = by.get(2).y;
  await page.evaluate(([x, y]) => window.__GEN2_BUILD__.placeAt(x, y, { w: 1, h: 1, hh: 2 }, 'decor'), [5, top]);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 14, null, { timeout: 30_000 });
  await page.evaluate(([x, y]) => window.__GEN2_BUILD__.placeAt(x, y, { w: 1, h: 1, hh: 2 }, 'decor'), [6, top]);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 15 && !window.__GEN2_VIEWER__.manifest.incomplete && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 60_000 }).catch(async () => assert.fail(`levelling the top did not complete the build: ${JSON.stringify(await shown())}`));
  // filled and level, it assembles: the step list is back
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
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Switch to EdgeLabel')); if (b) b.click(); });
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
  // the close is the handle's × (the phone tour, 2026-10-27): the editor's own title row is gone, the handle names the label
  const head = await page.evaluate(() => { const h = document.querySelector('#ws-labeledit > .head'), x = document.querySelector('#ws-labeledit .sheet-handle .hx').getBoundingClientRect(); return { row: !!h && h.getClientRects().length > 0, ttl: document.querySelector('#ws-labeledit .sheet-handle .ttl').textContent, x: [Math.round(x.width), Math.round(x.height)] }; });
  assert.deepEqual(head, { row: false, ttl: 'Edit · “PHONE EDIT”', x: [32, 32] }, 'one row: the handle, the label\'s words and a finger-sized ×');
  const reach = await page.waitForFunction(() => { const b = document.querySelector('#ws-labeledit .sheet-handle .hx'); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === b || b.contains(t); }, null, { timeout: 15_000 }).then(() => true, () => false);
  assert.ok(reach, 'nothing covers the editor’s close');
  await page.click('#ws-labeledit .sheet-handle .hx');
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
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Switch to EdgeLabel')); if (b) b.click(); });
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
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Switch to EdgeLabel')); if (b) b.click(); });
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

/* A PART'S OWN BUILD PLATE FINISH (Joey, 2026-10-26: "everything except the faceplate powder-coated, and the faceplate
   holographic"). The picker's Printed on row gives every faceplate its own finish while the rest follow the build; the
   build's own switch then moves the rest and leaves the faceplates; each change is one undo step; the record carries it
   through a reload; "Use the build's finish" hands the faceplates back. Read off the live materials (bedFinish.wearing). */
test('Colors: a part\'s own build plate finish - faceplates Holographic while the rest follow the build, undo, a reload, and back', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.waitForSelector('#ws-colors .crow', { timeout: 30_000 });
  await settle(page, 600);
  const wear = () => page.evaluate(() => window.__GEN2_VIEWER__.bedFinish.wearing());
  const rec = () => page.evaluate(() => ({ build: window.__GEN2_STORE__.state.buildPlate, parts: window.__GEN2_STORE__.state.plateParts, stage: window.__GEN2_VIEWER__.build.plateParts || {} }));
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 30_000 });
  // the control: before anything, every finished part wears the build's Powder-coated and none has its own
  if ((await rec()).build !== 'powder') { await page.locator('#ws-colors .seg3 .seg', { hasText: 'Powder-coated' }).click(); await until(() => window.__GEN2_VIEWER__.build.buildPlate === 'powder'); await settle(page, 800); }
  const w0 = await wear();
  assert.ok(w0.Faceplate && w0.Case, `faceplates and cases carry a finish: ${JSON.stringify(w0)}`);
  for (const [t, v] of Object.entries(w0)) assert.deepEqual(v, { finishes: ['powder'], own: false }, `${t} follows the build's Powder-coated`);
  // the faceplate's row, then Printed on: Holographic
  await page.locator('#ws-colors .crow', { has: page.locator('b', { hasText: /^Faceplate$/ }) }).click();
  const row = page.locator('#ws-picker .platerow');
  await row.waitFor({ timeout: 10_000 });
  assert.match(await row.textContent(), /the build’s · all faceplates/, 'the row says the faceplates follow the build');
  await row.locator('.seg', { hasText: 'Holographic' }).click();
  await until(() => window.__GEN2_VIEWER__.build.plateParts?.Faceplate === 'holographic');
  await settle(page, 800);
  assert.deepEqual(await rec(), { build: 'powder', parts: { Faceplate: 'holographic' }, stage: { Faceplate: 'holographic' } }, 'the record: the build stays Powder, the faceplates have their own');
  let w = await wear();
  assert.deepEqual(w.Faceplate, { finishes: ['holographic'], own: true }, `every faceplate wears Holographic: ${JSON.stringify(w.Faceplate)}`);
  for (const [t, v] of Object.entries(w)) if (t !== 'Faceplate') assert.deepEqual(v, { finishes: ['powder'], own: false }, `${t} stays on the build's Powder-coated`);
  assert.match(await page.locator('#ws-picker .platerow').textContent(), /own finish · all faceplates/);
  assert.match(await page.locator('#ws-colors .plateown').textContent(), /Faceplates · Holographic/, 'the left panel lists it');
  // the build's switch moves the rest and leaves the faceplates
  await page.locator('#ws-colors .seg3 .seg', { hasText: 'Smooth' }).click();
  await until(() => window.__GEN2_VIEWER__.build.buildPlate === 'smooth');
  await settle(page, 800);
  w = await wear();
  assert.deepEqual(w.Faceplate, { finishes: ['holographic'], own: true }, 'the faceplates keep their own finish');
  assert.deepEqual(w.Case, { finishes: ['smooth'], own: false }, 'the cases follow the build to Smooth');
  // an own finish that differs from the build only in its uniforms (no program change): the cases on Powder-coated
  await page.locator('#ws-colors .crow', { has: page.locator('b', { hasText: /^Case$/ }) }).click();
  await page.locator('#ws-picker .platerow .seg', { hasText: 'Powder-coated' }).click();
  await until(() => window.__GEN2_VIEWER__.build.plateParts?.Case === 'powder');
  await settle(page, 800);
  w = await wear();
  assert.deepEqual(w.Case, { finishes: ['powder'], own: true }, 'the cases wear their own Powder-coated on a Smooth build');
  assert.deepEqual(w.Faceplate, { finishes: ['holographic'], own: true }, 'the faceplates keep theirs');
  for (const [t, v] of Object.entries(w)) if (t !== 'Faceplate' && t !== 'Case') assert.deepEqual(v, { finishes: ['smooth'], own: false }, `${t} follows the build's Smooth`);
  await page.keyboard.press('Control+Z');
  await until(() => !(window.__GEN2_VIEWER__.build.plateParts || {}).Case);
  await settle(page, 800);
  assert.deepEqual((await wear()).Case, { finishes: ['smooth'], own: false }, 'Undo: the cases follow the build again');
  // Undo: the build back to Powder; Undo again: the faceplates follow the build; Redo: their own again
  await page.keyboard.press('Control+Z');
  await until(() => window.__GEN2_VIEWER__.build.buildPlate === 'powder');
  await settle(page, 800);
  assert.deepEqual((await wear()).Faceplate, { finishes: ['holographic'], own: true }, 'Undo of the build plate leaves the faceplates');
  await page.keyboard.press('Control+Z');
  await until(() => !(window.__GEN2_VIEWER__.build.plateParts || {}).Faceplate);
  await settle(page, 800);
  assert.deepEqual(await rec(), { build: 'powder', parts: {}, stage: {} }, 'Undo: no part has its own finish');
  assert.deepEqual((await wear()).Faceplate, { finishes: ['powder'], own: false }, 'the faceplates follow the build again');
  await page.keyboard.press('Control+Y');
  await until(() => window.__GEN2_VIEWER__.build.plateParts?.Faceplate === 'holographic');
  await settle(page, 800);
  assert.deepEqual((await wear()).Faceplate, { finishes: ['holographic'], own: true }, 'Redo: their own again');
  // the record carries it: a reload of the address keeps it, and the faceplates still wear it
  await page.reload({ waitUntil: 'load' });
  await waitBoot(page);
  await page.waitForSelector('#ws-colors .crow', { timeout: 30_000 });
  await settle(page, 1200);
  assert.deepEqual((await rec()).parts, { Faceplate: 'holographic' }, 'a reload keeps the faceplates\' own finish');
  assert.deepEqual((await wear()).Faceplate, { finishes: ['holographic'], own: true });
  // and the way back, from the left panel's list
  await page.locator('#ws-colors .plateown .link').first().click();
  await until(() => !(window.__GEN2_VIEWER__.build.plateParts || {}).Faceplate);
  await settle(page, 800);
  assert.deepEqual((await rec()).parts, {}, 'Use the build’s: the faceplates follow the build');
  assert.deepEqual((await wear()).Faceplate, { finishes: ['powder'], own: false });
  assert.equal(await page.locator('#ws-colors .plateown').count(), 0, 'the list is gone with the last own finish');
  // the inherited finish, clicked, is PINNED (Sol 01a178a5): the faceplates then keep Powder-coated when the build moves
  await page.locator('#ws-colors .crow', { has: page.locator('b', { hasText: /^Faceplate$/ }) }).click();
  await page.locator('#ws-picker .platerow .seg', { hasText: 'Powder-coated' }).click();
  await until(() => window.__GEN2_VIEWER__.build.plateParts?.Faceplate === 'powder');
  await page.locator('#ws-colors .seg3 .seg', { hasText: 'Smooth' }).click();
  await until(() => window.__GEN2_VIEWER__.build.buildPlate === 'smooth');
  await settle(page, 800);
  w = await wear();
  assert.deepEqual(w.Faceplate, { finishes: ['powder'], own: true }, 'pinned Powder-coated stays on a Smooth build');
  assert.deepEqual(w.Case, { finishes: ['smooth'], own: false });
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Colors: the Dock and a preset\'s Shop list count what this build prints - never bought hardware; the label text and a stripe count', async () => {
  const { ctx, page, errors } = await open('labels', { query: '&new=1' });
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#ws-labels button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Switch to EdgeLabel')); if (b) b.click(); });
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
      stripeSpool: (mine.filaments.find((f) => f.keys.includes('Label:STRIPE@sky-blue')) || {}).name || null,
      textWears: (mine.filaments.find((f) => f.keys.includes('Label:TEXT')) || {}).name || null,
      sigRows: sig.filaments.length + sig.unpicked.length, sigCount: sig.count, sigNames: sig.filaments.map((f) => f.name), sigOnlyHardware,
      // a label stripe is the label's own region (keysInBuild leaves it out: it is no Colors pick), so it is no leak
      sigLeaks: sig.filaments.flatMap((f) => f.keys).filter((k) => !/:STRIPE@/.test(k) && !keys.some((x) => x.key === k)),
    };
  });
  assert.ok(r.lockedKeys.length > 0, 'the control: this build has bought hardware');
  assert.deepEqual(r.countedKeys.filter((k) => r.lockedKeys.includes(k)), [], 'bought hardware never counts');
  assert.ok(r.textWears, 'the label text counts, wearing the preset\'s own black');
  /* since the label palette (2026-10-28) a Metric stripe counts as the spool that prints it (the suggested Polar Light
     Blue, by name), no longer as a bare colour */
  assert.deepEqual(r.stripes, [], 'no stripe is left as a bare colour');
  assert.equal(r.stripeSpool, 'Polar Light Blue', 'the stripe counts as its spool');
  assert.equal(r.count, r.filaments, 'the count: every filament, the stripe\'s spool among them');
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
  // the details' footer (2026-10-24): plain "Buy ↗" labels with rel=sponsored, the one disclosure line (Signal is all Polymaker),
  // the two reworded notes and no translucent note, and nothing reads "null": gallery.append(null) wrote the word under every
  // look without a translucent filament (Joey saw it live)
  const detail = await page.evaluate(() => ({ buys: [...document.querySelectorAll('#ws-gallery .frow a.link')].map((a) => `${a.textContent}|${a.rel}|${new URL(a.href).hostname}`), disc: document.querySelector('#ws-gallery .disc').textContent, notes: [...document.querySelectorAll('#ws-gallery p.note')].map((p) => p.textContent) }));
  /* since the label palette (2026-10-28) the Metric stripe is listed as its spool, the suggested Polar Light Blue: a maker's
     own shop, no paid link, so its rel is plain; every Polymaker link is still sponsored */
  const polar = detail.buys.filter((b) => b.endsWith('|polarfilament.com')), paid = detail.buys.filter((b) => !b.endsWith('|polarfilament.com'));
  assert.deepEqual(polar, ['Buy ↗|noopener|polarfilament.com'], `the stripe's spool, a plain link: ${detail.buys.join(', ')}`);
  assert.ok(paid.length && paid.every((b) => b.startsWith('Buy ↗|noopener sponsored|')), `plain Buy labels, rel=sponsored: ${detail.buys.join(', ')}`);
  assert.equal(detail.disc, POLYMAKER_LINE, 'the Shop list\'s one line is the Polymaker sentence');
  assert.equal(detail.notes.length, 2, `two notes under the rows: ${detail.notes.join(' | ')}`);
  assert.match(detail.notes[0], /^Colours on screen are approximate, and the look card is drawn without shadows; the Day Grid plate shows them truest\.$/);
  assert.match(detail.notes[1], /^Looks only: whether a filament suits a part \(strength, heat, flex\) is a separate question\.$/);
  assert.deepEqual(await nullText(page, '#ws-gallery'), [], 'nothing reads "null" under the details');
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
  assert.match(await page.locator('#ws-shop .note').last().textContent(), /^Looks only: whether a filament suits a part \(strength, heat, flex, the printer\) is a separate question\.$/);
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
  await page.locator('#ws-setup button:has-text("Start build")').tap({ timeout: 15_000 });   // beside Next, the orange one before the last step
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
  // 8 the picker's close (on a phone the × is on the sheet's handle; the picker's own title row is hidden): the sheets
  // down, the model and the card
  await page.locator('#ws-picker .sheet-handle .hx').tap();
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

/* THE PEEK'S PILLS, ONLY ZOOMED IN (Joey 2026-10-27: "maybe only make the pills show up in build when they zoom in on the
   drawer"): they show while they cover at most a fifth of the open drawer on the screen (main.js peekPillsFit). At Build's
   own framing on a desktop they cover 10 % of it and show (the Peek inside cases below); on his S23 (360 x 675) the
   drawer is about 142 x 138 px, they would cover 37 %, and they wait for a zoom */
test('Build on a phone: Peek inside opens the drawer without its pills at the phone\'s own framing, the drawer too small for them', async () => {
  const { ctx, page, errors } = await open('build', { phone: true, viewport: { width: 360, height: 675 } });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest, null, { timeout: 60_000 });
  await settle(page, 1500);
  const drawer = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; const d = v.manifest.instances.find((x) => /DecorDrawer/.test(x.node)); return { id: d.id, owner: v.partInfo(d.id).owner, z0: v.instances.get(d.id).group.position.z, collection: parseInt(v.manifest.collection, 10) || 185 }; });
  assert.ok(await page.evaluate((o) => window.__GEN2_VIEWER__.peekUnit(o), drawer.owner), 'Build\'s Peek inside (stage.peekUnit, its pills allowed) opened it');
  await page.waitForFunction(([id, z]) => Math.abs(window.__GEN2_VIEWER__.instances.get(id).group.position.z - z) < 0.05, [drawer.id, drawer.z0 + drawer.collection - 13.5], { timeout: 30_000 }).catch(() => assert.fail('the drawer did not open'));
  await settle(page, 800);
  const m = await page.evaluate((id) => {
    const v = window.__GEN2_VIEWER__, T = v.THREE, b = new T.Box3().setFromObject(v.instances.get(id).group), r = v.renderer.domElement.getBoundingClientRect(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) { const p = new T.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(v.camera); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const shown = ['dim-w', 'dim-l', 'dim-h'].filter((q) => { const e = document.getElementById(q); return !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; });
    const c = (q) => Math.min(1, Math.max(-1, q));   // its part on the screen, as the stage weighs it
    return { box: [Math.round((c(x1) - c(x0)) * r.width / 2), Math.round((c(y1) - c(y0)) * r.height / 2)], shown, peek: document.documentElement.classList.contains('ws-drawer-dims') };
  }, drawer.id);
  assert.ok(m.peek, `the peek holds the drawer's sizes (${JSON.stringify(m)})`);
  assert.ok(3 * 72 * 34 > 0.2 * m.box[0] * m.box[1], `the control: at this framing three pills would cover more than a fifth of the drawer (${JSON.stringify(m)})`);
  assert.deepEqual(m.shown, [], `no pills on a drawer too small for them (${JSON.stringify(m)})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* COLORS OPENS A DRAWER WITHOUT ITS PILLS (Joey 2026-10-27: the inside sizes are Build's): on a desktop, where the drawer
   is big enough for them and Build's Peek inside shows them, the Colors card's Open the drawer shows none */
test('Colors: the card\'s Open the drawer opens it with no W / L / H pills, on a desktop where Build would show them', async () => {
  const { ctx, page, errors } = await open('colors');
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest, null, { timeout: 60_000 });
  await settle(page, 1200);
  const d = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; const i = v.manifest.instances.find((x) => /DecorDrawer/.test(x.node)); return { id: i.id, z0: v.instances.get(i.id).group.position.z, collection: parseInt(v.manifest.collection, 10) || 185 }; });
  await page.evaluate((id) => window.__GEN2_VIEWER__.setSelected(id), d.id);
  const btn1 = page.locator('#ws-partcard button', { hasText: 'Open the drawer' });
  await btn1.click({ timeout: 30_000 });
  await page.waitForFunction(([id, z]) => Math.abs(window.__GEN2_VIEWER__.instances.get(id).group.position.z - z) < 0.05, [d.id, d.z0 + d.collection - 13.5], { timeout: 30_000 }).catch(() => assert.fail('the drawer did not open'));
  await settle(page, 800);
  const shown = await page.evaluate(() => ['dim-w', 'dim-l', 'dim-h'].filter((id) => { const e = document.getElementById(id); return !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }));
  assert.deepEqual(shown, [], 'no pills from the Colors card');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE STOP (2026-10-19, Joey: "they should open all the way, until the inside back wall of the drawer collides with the
   drawer stopper"). Measured in the scene: the stopper's tab sits 2 mm behind the case front and the drawer's inner back
   face 10 mm inside the case back, so the wall meets the tab after collection − 13.5 mm (171.5 on a 185). Build's "Peek
   inside" and the Colors card's "Open the drawer" both go through the stage's peekUnit. */
/* A PEEK'S LINES GO WITH ITS PILLS (Joey 2026-10-27: after a peek in Build with the ruler on, the Colors card's "Open the
   drawer" showed "lines inside that i know were from the represented measurements"). The card opens a drawer with no pills;
   its three measuring lines are not drawn either. In Build, where Peek inside shows the pills at this framing, the lines are. */
test('the open drawer\'s measuring lines show only with their pills: none from the Colors card, with them in Build', async () => {
  const { ctx, page, errors } = await open('build');
  const lines = (owner) => page.evaluate((o) => {
    const v = window.__GEN2_VIEWER__, d = [...v.instances.values()].find((i) => i.cfg.owner === o && /Drawer/.test(i.cfg.node) && i.group.visible);
    const shown = (x) => { for (let p = x; p; p = p.parent) if (!p.visible) return false; return true; };
    let n = 0; d.group.traverse((x) => { if (x.isLineSegments && shown(x)) n++; });
    return { lines: n, pills: ['dim-w', 'dim-l', 'dim-h'].filter((id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }).length };
  }, owner);
  const owner = await page.evaluate(() => window.__GEN2_STORE__.state.placed[0].id);
  // Build, the ruler on (Joey's state), Peek inside: the pills and their lines
  await page.locator('#ws-tools .measure').click();
  await page.evaluate((o) => window.__GEN2_VIEWER__.peekUnit(o), owner);
  await page.waitForFunction((o) => { const v = window.__GEN2_VIEWER__; return ['dim-w', 'dim-l', 'dim-h'].every((id) => !document.getElementById(id).classList.contains('hidden')); }, owner, { timeout: 15_000 })
    .catch(async () => assert.fail(`the control: Build's peek shows no pills (${JSON.stringify(await lines(owner))})`));
  const inBuild = await lines(owner);
  assert.ok(inBuild.lines >= 1 && inBuild.pills === 3, `Build: the pills with their lines (${JSON.stringify(inBuild)})`);
  // Colors: the card's Open the drawer
  await page.evaluate(() => window.__GEN2_CTX__().switchTo('colors'));
  await page.waitForTimeout(500);
  await page.evaluate((o) => window.__GEN2_VIEWER__.peekUnit(o, { pills: false }), owner);
  await page.waitForTimeout(800);
  const inColors = await lines(owner);
  assert.deepEqual(inColors, { lines: 0, pills: 0 }, `Colors: no pills, no lines (${JSON.stringify(inColors)})`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

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

/* AN OPEN DRAWER STAYS OPEN ACROSS A REBUILD (Joey, 2026-10-25: he peeked a drawer, switched it from Standard to Gridfinity,
   and the new drawer loaded closed under a "Close it" button that did nothing; a second press said Peek inside and only
   then opened it). The rebuild replaces every instance, so Build lets the stage's open drawer go before the update and
   peeks the same unit again on the new one; the button keeps saying Close it, and Close it closes it. */
test('Build: a peeked drawer stays open when its type changes to Gridfinity, and Close it still closes it', async () => {
  const { ctx, page, errors } = await open('build');
  // a decor drawer whose size has a Gridfinity variant (the inspector shows the Drawer row only for those)
  const drawer = await page.evaluate(() => {
    const v = window.__GEN2_VIEWER__, S = window.__GEN2_STORE__, R = S.rules();
    for (const x of v.manifest.instances) {
      if (!/DecorDrawer/.test(x.node)) continue;
      const owner = v.partInfo(x.id).owner, u = S.state.placed.find((p) => p.id === owner);
      if (u && u.fill === 'decor' && !u.variant && R.gridfinityOk(u)) return { id: x.id, owner, z0: v.instances.get(x.id).group.position.z, collection: parseInt(v.manifest.collection, 10) || 185 };
    }
    return null;
  });
  assert.ok(drawer, 'a decor drawer with a Gridfinity variant in the default build');
  const stop = drawer.collection - 13.5;
  // the unit's drawer BODY by its part type (a node-name match would take Drawer_Stoppers_L first)
  const zOf = (owner) => page.evaluate((owner) => { const v = window.__GEN2_VIEWER__; const d = v.manifest.instances.find((x) => { const p = v.partInfo(x.id); return p && p.type === 'Drawer' && p.owner === owner; }); return d ? v.instances.get(d.id).group.position.z : null; }, owner);
  await page.evaluate((id) => window.__GEN2_VIEWER__.setSelected(id), drawer.id);
  await page.waitForSelector('#ws-insp:not([hidden])', { timeout: 30_000 });
  await btn(page, 'Peek inside', '#ws-insp').click({ timeout: 30_000 });
  await page.waitForFunction(([id, z]) => Math.abs(window.__GEN2_VIEWER__.instances.get(id).group.position.z - z) < 0.05, [drawer.id, drawer.z0 + stop], { timeout: 30_000 }).catch(() => assert.fail('the drawer did not open'));
  // the type change rebuilds the stage with a new drawer instance for the same unit
  await btn(page, 'Gridfinity', '#ws-insp').click({ timeout: 30_000 });
  await page.waitForFunction((owner) => { const v = window.__GEN2_VIEWER__; const u = window.__GEN2_STORE__.state.placed.find((p) => p.id === owner); return u && u.variant === 'gridfinity' && !v.regenBusy && v.manifest.instances.some((x) => /Gridfinity/.test(x.node) && v.partInfo(x.id).owner === owner); }, drawer.owner, { timeout: 90_000 }).catch(() => assert.fail('the Gridfinity drawer did not reach the stage'));
  // the new drawer's own rest position differs from the old one's (another GLB), so the proof is its travel: open now,
  // and Close it brings it back by the stopper distance
  await settle(page, 1200);   // the re-peek's 380 ms slide, with margin
  const zOpen = await zOf(drawer.owner);
  assert.equal(await btn(page, 'Close it', '#ws-insp').count(), 1, 'the button still says Close it');
  await btn(page, 'Close it', '#ws-insp').click({ timeout: 30_000 });
  await page.waitForFunction(([owner, z, stop]) => { const v = window.__GEN2_VIEWER__; const d = v.manifest.instances.find((x) => { const p = v.partInfo(x.id); return p && p.type === 'Drawer' && p.owner === owner; }); return d && Math.abs(v.instances.get(d.id).group.position.z - (z - stop)) < 1; }, [drawer.owner, zOpen, stop], { timeout: 30_000 })
    .catch(async () => assert.fail(`the new drawer was not open by the stopper distance: open z ${zOpen}, now ${await zOf(drawer.owner)} (expected ${zOpen - stop})`));
  assert.equal(await btn(page, 'Peek inside', '#ws-insp').count(), 1, 'the button says Peek inside again');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE FEET ARE TPU (Joey, 2026-10-21: "when selecting the feet, i feel like we should only list TPU filaments as an option ...
   default for feet should always be TPU black"; "maybe we need to make PETG and PLA and TPU, like colored tags in the menu").
   The stage keeps a palette's feet TPU (main.js tpuFeet): the boot preset, a whole palette or a saved one that names PLA
   feet, a reset; a unit's own PLA pick for its feet is refused. The feet's picker lists only the TPU lines and every other
   picker none; each line's header carries its material tag. */
test('Colors: the feet are TPU - TPU95 Black by default, from a PLA palette and on reset; a TPU-only feet picker; material tags on every line; the picker’s material chips', async () => {
  const { ctx, page, errors } = await open('colors');
  const TPU_BLACK = 'Polymaker PolyFlex TPU95 Black';
  const feet = () => page.evaluate(() => (window.__GEN2_VIEWER__.palette().colors.Foot || {}).name);
  assert.equal(await feet(), TPU_BLACK, 'the boot preset dresses the feet in TPU95 Black');
  const heads = () => page.evaluate(() => [...document.querySelectorAll('#ws-picker .bhead.toggle')].map((h) => [h.querySelector('i').textContent.trim().split(' ·')[0], [...h.querySelectorAll('.mat')].map((m) => m.textContent)]));
  // a case picker: a tag on every line, no TPU anywhere
  await page.locator('#ws-colors .crow').first().click();
  await page.waitForSelector('#ws-picker .brands .sw', { timeout: 15_000 });
  const caseHeads = await heads();
  assert.deepEqual(caseHeads, [['Panchroma™ PLA', ['PLA']], ['Panchroma™ Silk PLA', ['PLA']], ['PETG', ['PETG']], ['Panchroma™ Translucent PLA', ['PLA']], ['PLA / PETG', ['PLA', 'PETG']], ['PLA', ['PLA']], ['Burnt Titanium PLA', ['PLA']], ['PLA', ['PLA']]], 'every line but TPU, each tagged (the last PLA is Polar Filament, 2026-10-26)');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#ws-picker .sw')].filter((e) => / TPU/.test(e.getAttribute('aria-label') || '')).length), 0, 'no TPU swatch for the case');
  // THE MATERIAL CHIPS (Joey, 2026-10-23: "a way to filter by material type when applicable"): a case's lines sell PLA and
  // PETG, so a row of All · PLA · PETG stands above the list, All pressed, 8 px between the chips (the planner's floor)
  const chips = () => page.evaluate(() => [...document.querySelectorAll('#ws-picker .mrow .mchip')].map((b) => [b.textContent.trim(), b.getAttribute('aria-pressed')]));
  const swLabels = () => page.evaluate(() => [...document.querySelectorAll('#ws-picker .brands .sw')].map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(await chips(), [['All', 'true'], ['PLA', 'false'], ['PETG', 'false']], 'a case: a chip per material offered, All pressed');
  const gaps = await page.evaluate(() => { const r = [...document.querySelectorAll('#ws-picker .mrow .mchip')].map((b) => b.getBoundingClientRect()); return r.slice(1).map((b, i) => +(b.left - r[i].right).toFixed(1)); });
  assert.ok(gaps.length === 2 && gaps.every((g) => g >= 8), `8 px between the chips (${gaps.join(', ')})`);
  const allCount = (await swLabels()).length;
  // PETG narrows the list: the two lines that sell it (Elegoo down to its PETG colour), In this build down to its PETG, the chip pressed
  await page.locator('#ws-picker .mrow .mchip', { hasText: /^PETG$/ }).click();
  assert.deepEqual(await chips(), [['All', 'false'], ['PLA', 'false'], ['PETG', 'true']], 'PETG pressed, All released');
  assert.deepEqual(await heads(), [['PETG', ['PETG']], ['PLA / PETG', ['PLA', 'PETG']]], 'PETG: the two lines that sell it, the others gone');
  const petg = await swLabels();
  assert.ok(petg.length > 0 && petg.length < allCount && petg.every((l) => /PETG/.test(l)), `every swatch left is PETG, In this build included (${petg.length} of ${allCount}): ${petg}`);
  const elegoo = petg.filter((l) => /^Elegoo/.test(l));
  assert.ok(elegoo.length && elegoo.every((l) => l === 'Elegoo PETG Black'), `Elegoo narrowed to its PETG colour (${elegoo})`);
  // the search combines with the chip: "black" under PETG finds the PETG blacks alone; All with the words kept finds every black
  await page.locator('#ws-picker .search').fill('black');
  const petgBlack = await swLabels();
  assert.ok(petgBlack.length > 0 && petgBlack.every((l) => /PETG/.test(l) && /black/i.test(l)), `PETG + "black": the PETG blacks alone (${petgBlack})`);
  assert.deepEqual(await chips(), [['All', 'false'], ['PLA', 'false'], ['PETG', 'true']], 'typing keeps the chip');
  await page.locator('#ws-picker .mrow .mchip', { hasText: /^All$/ }).click();
  const allBlack = await swLabels();
  assert.ok(allBlack.length > petgBlack.length && allBlack.every((l) => /black/i.test(l)) && allBlack.some((l) => !/PETG/.test(l)), `All + "black": every black, the PLA ones back (${allBlack})`);
  assert.equal(await page.inputValue('#ws-picker .search'), 'black', 'the chip never rebuilt the search box');
  await page.locator('#ws-picker .search').fill('');
  assert.equal((await swLabels()).length, allCount, 'All with the search cleared: the whole list again');
  // the keyboard: Space on a focused chip presses it and the focus stays on it (a rebuilt row dropped it to the document, Terra 01a16a51)
  await page.locator('#ws-picker .mrow .mchip', { hasText: /^PLA$/ }).focus();
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => [document.activeElement.textContent.trim(), document.activeElement.getAttribute('aria-pressed')]), ['PLA', 'true'], 'Space presses the focused chip and keeps the focus on it');
  assert.deepEqual(await heads(), [['Panchroma™ PLA', ['PLA']], ['Panchroma™ Silk PLA', ['PLA']], ['Panchroma™ Translucent PLA', ['PLA']], ['PLA / PETG', ['PLA', 'PETG']], ['PLA', ['PLA']], ['Burnt Titanium PLA', ['PLA']], ['PLA', ['PLA']]], 'PLA: every line but the Polymaker PETG one (the last PLA is Polar Filament, 2026-10-26)');
  // a shared or uploaded palette can name a filament the catalogue does not know: its own words place it under a chip (Terra 01a16a51)
  await page.evaluate(() => { const v = window.__GEN2_VIEWER__; const p = v.palette(); v.setPalette({ on: true, colors: { ...p.colors, Accent: { name: 'PETG Blue (custom)', hex: '#2f66b8' } }, over: p.over || {} }); });
  await page.locator('#ws-colors .crow').first().click();   // the case picker opened again: it reads the palette afresh and starts at All
  await page.waitForFunction(() => document.querySelector('#ws-picker .sw[aria-label="PETG Blue (custom)"]'), null, { timeout: 15_000 }).catch(() => assert.fail('the custom colour did not reach In this build'));
  assert.deepEqual(await chips(), [['All', 'true'], ['PLA', 'false'], ['PETG', 'false']], 'a picker opened again starts at All');
  await page.locator('#ws-picker .mrow .mchip', { hasText: /^PETG$/ }).click();
  assert.ok((await swLabels()).includes('PETG Blue (custom)'), 'an uncatalogued PETG in the build answers the PETG chip by its name');
  await page.locator('#ws-picker .mrow .mchip', { hasText: /^PLA$/ }).click();
  assert.ok(!(await swLabels()).includes('PETG Blue (custom)'), 'and not the PLA chip');
  await page.locator('#ws-picker .mrow .mchip', { hasText: /^PETG$/ }).click();   // left pressed: the feet's picker must open at All
  // the feet's picker: the note, the two TPU lines tagged TPU, nothing else; no material row (TPU alone), and the case's
  // PETG chip did not follow (a sticky chip would narrow the TPU lines to nothing: the 11 swatches prove the reset)
  await page.locator('#ws-colors .crow').filter({ has: page.locator('b', { hasText: /^Foot$/ }) }).first().click();
  await page.waitForFunction(() => /only TPU is listed/.test(document.getElementById('ws-picker')?.textContent || ''), null, { timeout: 15_000 }).catch(() => assert.fail('the feet picker did not open with its note'));
  assert.deepEqual(await heads(), [['PolyFlex™ TPU95', ['TPU']], ['PolyFlex™ TPU90', ['TPU']]]);
  assert.equal(await page.locator('#ws-picker .mrow').count(), 0, 'the feet offer TPU alone: no material row');
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
   both families. Now both are buttons, EdgeLabel first; Classic Pro applies the Classic Pro faceplate. Since 2026-10-27
   they are the Build library's faceplate tiles (the stage's picture, the name under it) and both carry the Club ✦ (Joey:
   "both are premium models so both should have that"), and the callout promises nothing ("Paper and label-maker labels
   are coming later" went: Joey, "that's still a brainstorm idea") */
test('Labels: the no-label-faceplate callout offers EdgeLabel and Classic Pro as faceplate tiles, both Club; Classic Pro applies that family and the callout goes', async () => {
  const { ctx, page, errors } = await open('labels');
  await page.waitForSelector('#ws-labels .callout', { timeout: 30_000 });
  const before = await S(page);
  assert.notEqual(before.faceStyle, 'classicpro', `the control: the build starts on a no-label faceplate (${before.faceStyle})`);
  await page.waitForFunction(() => document.querySelectorAll('#ws-labels .callout .faces button img').length === 2, null, { timeout: 30_000 })
    .catch(() => assert.fail('the two tiles did not get the stage\'s pictures'));
  const c = await page.evaluate(() => ({ tiles: [...document.querySelectorAll('#ws-labels .callout .faces button.face')].map((b) => [b.getAttribute('aria-label'), b.textContent.trim(), !!b.querySelector('.pv img')]),
    text: document.querySelector('#ws-labels .callout').textContent }));
  assert.deepEqual(c.tiles, [['Switch to EdgeLabel', 'EdgeLabel✦', true], ['Switch to Classic Pro', 'Classic Pro✦', true]], `both label families, EdgeLabel first, each a picture, its name and the ✦ (${JSON.stringify(c)})`);
  assert.ok(!/coming later|paper|label-maker/i.test(c.text), `the callout promises nothing (${c.text})`);
  await page.locator('#ws-labels .callout button[aria-label="Switch to Classic Pro"]').click({ timeout: 30_000 });
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

/* THE GPU PASS'S FINDINGS (2026-10-23, Joey's laptop and desktop browsers): the Quality pill's pick did not survive a reload
   (the shell's pill drew the tier without saving it), and the Parts badge and the size line went stale after an undo made
   from Labels (the bar and the dock were drawn on the store change, before the regenerate, and never after it). */
test('the Quality pill keeps a visitor\'s pick across a reload, and marks it as the user\'s', async () => {
  // without the harness's Fast init script, which would reset the pick on every load: Fast is seeded once instead
  const c = await browser.newContext({ viewport: { width: 1366, height: 768 } }); contexts.add(c);
  const seed = await c.newPage(); await seed.goto(`${base}/css/app.css`);
  await seed.evaluate(() => { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); });
  await seed.close();
  const { ctx, page, errors } = await open('build', { context: c });
  const q = () => page.evaluate(() => ({ pill: document.querySelector('#ws-tools .quality span')?.textContent, tier: window.__GEN2_VIEWER__.quality, saved: localStorage.getItem('gen2-quality'), set: localStorage.getItem('gen2-quality:set') }));
  assert.equal((await q()).tier, 'fast', 'the seeded tier');
  await page.click('#ws-tools .quality');   // the next tier in the cycle
  await settle(page, 800);
  const picked = await q();
  assert.ok(picked.tier !== 'fast' && picked.saved === picked.tier && picked.set === '1', `the pick is saved as the user's: ${JSON.stringify(picked)}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#ws-tools .quality', { timeout: 120_000 }); await settle(page, 1500);
  const back = await q();
  assert.equal(back.tier, picked.tier, `the pick survives the reload: ${JSON.stringify(back)}`);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the Parts badge and the size line follow an undo made from Labels: the badge at once, the dock once the stage has rebuilt', async () => {
  const { ctx, page, errors } = await open('build');
  await startBuild(page, [{ id: 1, x: 0, w: 2 }, { id: 2, x: 2, w: 1 }]);
  const y = await page.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 2);
  await armSize(page, '1W·1H');
  await page.waitForFunction(() => (window.__spots || []).length, null, { timeout: 30_000 });
  await view(page, '2D');
  await page.waitForSelector('#ws-board .b-spot', { timeout: 30_000 });
  const badge = () => page.evaluate(() => [...document.querySelectorAll('#ws-tabs .tab')].find((b) => /Parts/.test(b.textContent))?.querySelector('.badge')?.textContent || null);
  const b2 = await badge();   // two units
  await clickSpot(page, 3, y);   // a third, on the right
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 3, null, { timeout: 15_000 });
  await settle(page, 2500);
  const b3 = await badge();
  assert.ok(b2 && b3 && +b3 > +b2, `the badge grew with the unit: ${b2} -> ${b3}`);
  // to Labels, where the undo of that placement regenerates the build
  await page.evaluate(() => [...document.querySelectorAll('#ws-tabs .tab')].find((b) => /Labels/.test(b.textContent)).click());
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 }); await settle(page, 1500);
  const dims = () => page.evaluate(() => [...document.querySelectorAll('#ws-dock .big')].map((e) => e.textContent).find((s) => /×/.test(s)) || null);
  const d3 = await dims();
  assert.equal(await badge(), b3, 'the Labels bar shows the same count');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 2, null, { timeout: 15_000 });
  assert.equal(await badge(), b2, 'the badge follows the record at once, before the stage has rebuilt');
  await page.waitForFunction(() => !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 30_000 }).catch(() => {});
  await settle(page, 2500);
  const d2 = await dims();
  assert.ok(d2 && d3 && d2 !== d3, `the size line follows the rebuilt build: ${d3} -> ${d2}`);
  assert.equal(await badge(), b2, 'and the badge still');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* HOVER HINTS ON EVERY WORKSPACE (2026-10-23, Joey: "can we do more video animations for when hovering over certain buttons
   to illustrate how they work?"). A hinted control carries data-hint = its clip's name (js/ui/hint.js attachHint); resting
   the mouse on it shows the bubble beside its panel with that clip after the dwell, leaving hides it, and while a modal
   dialog is up (the setup sheet here) nothing shows, not even for a harness that fires the hover and the focus straight at
   the control under the veil; the sheet closing brings the hints back. HINTED lists, per workspace, the way into each
   state that offers hints and the clips there: a lost attachHint or a renamed clip fails the first assertion, a clip
   missing from img/hints/ the second (the <video> errors and the SVG scene takes its place). */
const HINTED = {   // per workspace: the panel the hints wait for (Labels renders after its list module loads), then the steps
  build: { ready: '#ws-lib .size', steps: [
    { keys: ['build-place'] },
    { go: async (page) => { await page.locator('#ws-lib [role=tab]:has-text("Build style")').click(); await page.waitForSelector('[data-hint="build-sidecovers"]', { timeout: 15_000 }); }, keys: ['build-sidecovers'], focus: '[data-hint="build-sidecovers"] .seg' },   // the hint is on the track; the keyboard reaches its segments
    // a 2W over a 1W leaves a red slot under it; the issue card, opened from the dock's status, offers Fill all
    { go: async (page) => {
      await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.gridH = 2; s.gridW = 2; s.placed = [{ id: 1, x: 0, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0 }, { id: 2, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0 }]; s.nextId = 3; }, 'edit'));
      await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 2, null, { timeout: 90_000 });
      await page.click('#ws-dock .status'); await page.waitForSelector('#ws-issues:not([hidden])', { timeout: 15_000 });
    }, keys: ['build-fill'] },
  ] },
  colors: { ready: '#ws-colors .row4', steps: [{ keys: ['colors-browse', 'colors-surprise', 'colors-simplify'] }] },   // Simplify: the root kit's look has five filaments
  labels: { ready: '#ws-labels .foot', steps: [{ keys: ['labels-type', 'labels-file', 'labels-picker'] }] },
  parts: { ready: '#ws-parts .prow', steps: [{ keys: ['parts-track'] }] },
  assemble: { ready: '#ws-tools .cam', steps: [{ keys: ['assemble-camera'] }] },
};
test('hover hints: every hinted control shows its clip on hover and hides on leave; none shows over the setup sheet or an open card', async () => {
  const shown = (page, key) => page.waitForFunction((k) => { const b = document.getElementById('ws-hint'); return !!b && !b.hidden && b.classList.contains('show') && (b.querySelector('.scene video')?.getAttribute('src') || '').endsWith(`/${k}.mp4`); }, key, { timeout: 15_000 });
  const isHidden = () => { const b = document.getElementById('ws-hint'); return !b || b.hidden; };
  const hidden = (page) => page.waitForFunction(isHidden, null, { timeout: 15_000 });
  const hinted = (key) => `#ws [data-hint="${key}"]`;
  // a hover and a focus fired straight at the control, as a harness or the keyboard can under a veil
  const poke = (page, key) => page.evaluate((sel) => { const b = document.querySelector(sel); b.dispatchEvent(new MouseEvent('mouseenter')); b.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); }, hinted(key));
  for (const [ws, { ready, steps }] of Object.entries(HINTED)) {
    const { ctx, page, errors } = await open(ws);
    await page.waitForSelector(ready, { timeout: 30_000 });
    let last = null;
    for (const step of steps) {
      if (step.go) await step.go(page);
      const present = await page.evaluate(() => [...new Set([...document.querySelectorAll('#ws [data-hint]')].map((e) => e.dataset.hint))]);
      for (const key of step.keys) assert.ok(present.includes(key), `${ws}: no control carries the ${key} hint (present: ${present.join(', ') || 'none'})`);
      for (const key of step.keys) {
        await page.locator(hinted(key)).first().hover({ timeout: 15_000 });
        await shown(page, key).catch(async () => assert.fail(`${ws}: no bubble with ${key}.mp4 on hover (bubble: ${await page.evaluate(() => document.getElementById('ws-hint')?.outerHTML.slice(0, 300))})`));
        // a real recording, not a stub: the clip's metadata arrives and it runs 6 s or more (Joey's 10-15 s; the shortest is 9 s)
        await page.waitForFunction(() => { const v = document.querySelector('#ws-hint .scene video'); return !!v && v.readyState >= 1 && v.duration >= 6; }, null, { timeout: 15_000 })
          .catch(async () => assert.fail(`${ws}: ${key}.mp4 did not load as a clip of 6 s or more (readyState ${await page.evaluate(() => document.querySelector('#ws-hint .scene video')?.readyState)}, duration ${await page.evaluate(() => document.querySelector('#ws-hint .scene video')?.duration)})`));
        // beside the control's panel, never over the control itself (spacing-between-controls: a hint must not cover what it explains)
        const over = await page.evaluate((sel) => { const b = document.getElementById('ws-hint').getBoundingClientRect(), r = document.querySelector(sel).getBoundingClientRect(); return !(b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom); }, hinted(key));
        assert.equal(over, false, `${ws}: the bubble for ${key} covers its control`);
        await page.mouse.move(640, 430);   // onto the stage
        await hidden(page).catch(() => assert.fail(`${ws}: the bubble for ${key} stayed after the mouse left`));
        last = key;
      }
      // the keyboard: focus on the control (or, for a hint on a group, on a segment inside it) shows the hint too; focus
      // leaving it hides it (Sol 01a16a18: a `focus` listener on the group never fired, the event does not bubble)
      if (step.focus) {
        await page.focus(step.focus);
        await shown(page, last).catch(() => assert.fail(`${ws}: no bubble for ${last} on keyboard focus inside its group`));
        await page.evaluate(() => document.activeElement.blur());
        await hidden(page).catch(() => assert.fail(`${ws}: the bubble for ${last} stayed after focus left`));
      }
    }
    if (ws === 'colors') {
      // an open card the control is not part of: Simplify's card opens under the pointer that pressed Simplify…, and a
      // bubble beside the panel would cover it, so none shows while it is up (the hint on Fill all, INSIDE its issue card, shows above)
      await page.click(hinted('colors-simplify'));
      await page.waitForSelector('#ws-simplify:not([hidden])', { timeout: 15_000 });
      await poke(page, 'colors-simplify'); await settle(page, 1000);
      assert.equal(await page.evaluate(isHidden), true, 'colors: a hint showed over the Simplify card');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('ws-simplify').hidden, null, { timeout: 15_000 });
    }
    // a bubble already up when a modal dialog opens (the setup sheet) goes down with it: the veil under the pointer fires the
    // control's mouseleave, and a keyboard-shown bubble goes with the focus the sheet takes (Sol 01a16a18 said it would
    // stay; it does not, and no extra listener is needed)...
    await page.locator(hinted(last)).first().hover({ timeout: 15_000 });
    await shown(page, last);
    await page.evaluate(() => { window.__GEN2_CTX__().openSetup('mount'); });
    await page.waitForSelector('#ws-setup', { timeout: 15_000 });
    await hidden(page).catch(() => assert.fail(`${ws}: the bubble for ${last} stayed up over the setup sheet`));
    // ...and while it is up a hover and a focus fired at a hinted control show nothing
    await poke(page, last); await settle(page, 1000);   // past the dwell
    assert.equal(await page.evaluate(isHidden), true, `${ws}: a hint showed over the setup sheet`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('ws-setup'), null, { timeout: 15_000 });
    // ...and once it is closed the same control hints again
    await page.locator(hinted(last)).first().hover({ timeout: 15_000 });
    await shown(page, last).catch(() => assert.fail(`${ws}: no bubble for ${last} after the sheet closed`));
    await page.mouse.move(640, 430);
    await hidden(page);
    assert.deepEqual(clean(errors), [], ws);
    await ctx.close();
  }
  // a narrow window with a mouse (1000 px: the phone chrome's sheets, hover still on): the toolbar chip hints under its bar;
  // while a sheet is open nothing hints, not even a control outside the sheet; the sheet closed, it hints again
  const narrow = await browser.newContext({ viewport: { width: 1000, height: 700 } }); contexts.add(narrow); await narrow.addInitScript(FAST);
  const N = await open('assemble', { context: narrow });
  await N.page.waitForSelector('#ws-steps .sheet-handle', { timeout: 30_000 });
  await N.page.locator(hinted('assemble-camera')).hover({ timeout: 15_000 });
  await shown(N.page, 'assemble-camera').catch(() => assert.fail('narrow: no bubble on the camera chip'));
  assert.ok(await N.page.evaluate(() => document.getElementById('ws-hint').getBoundingClientRect().top >= document.getElementById('ws-tools').getBoundingClientRect().bottom), 'narrow: the bubble sits under the toolbar');
  await N.page.mouse.move(500, 400); await hidden(N.page);
  await N.page.locator('#ws-steps .sheet-handle').click();
  await N.page.waitForSelector('#ws-steps.sheet.open', { timeout: 15_000 });
  await poke(N.page, 'assemble-camera'); await settle(N.page, 1000);
  assert.equal(await N.page.evaluate(isHidden), true, 'narrow: a hint showed while a sheet was open');
  await N.page.locator('#ws-steps .sheet-handle').click();
  await N.page.waitForFunction(() => !document.querySelector('#ws .sheet.open'), null, { timeout: 15_000 });
  await N.page.locator(hinted('assemble-camera')).hover({ timeout: 15_000 });
  await shown(N.page, 'assemble-camera').catch(() => assert.fail('narrow: no bubble once the sheet closed'));
  assert.deepEqual(clean(N.errors), [], 'narrow');
  await narrow.close();
});

/* SETTLING TOWARD THE MOUNT (Joey, 2026-10-25, the Under-Table report from tech support: "the Planner should work like gravity,
   pulling everything toward the mount after every change"). The report's layout on an Under-Table 185: top 2 x 3W-1.5H, then
   3 x 2W-2H, 3 x 2W-3H, 2 x 3W-1.5H at the bottom. Acceptance: removing both top 3Ws ends as three 2W-2H on top, three 2W-3H
   below, two 3W-1.5H at the bottom, 0 issues and no manual moves; dragging the top-right 3W below the bottom row settles
   everything up in one action (one Undo); the voids are not a standing warning. */
test('Build: Under-Table settles up after every edit - the report\'s layout, a drop below the stack, one Undo each', async () => {
  const { ctx, page, errors } = await open('build', { query: '&new=1&setup=1' });
  await page.waitForSelector('#ws-setup .card', { timeout: 60_000 });
  await page.locator('#ws-setup .card:has-text("Under-Table")').click();
  await btn(page, 'Next', '#ws-setup').click();
  await page.locator('#ws-setup .card.len:has-text("185 mm")').click();
  await btn(page, 'Next', '#ws-setup').click();
  await page.evaluate(() => { window.__e2eBeforeReload = 1; });
  await btn(page, 'Start build', '#ws-setup').click();
  await page.waitForFunction(() => window.__e2eBeforeReload === undefined && window.__GEN2_STORE__ && window.__GEN2_STORE__.state.mount === 'under-table', null, { timeout: 150_000 });
  await waitBoot(page);
  const U = [[1, 0, 0, 3, 3], [2, 3, 0, 3, 3], [3, 0, 3, 2, 4], [4, 2, 3, 2, 4], [5, 4, 3, 2, 4], [6, 0, 7, 2, 6], [7, 2, 7, 2, 6], [8, 4, 7, 2, 6], [9, 0, 13, 3, 3], [10, 3, 13, 3, 3]];
  const load = () => page.evaluate((U) => window.__GEN2_STORE__.commit((s) => { s.placed = U.map(([id, x, y, w, hh]) => ({ id, x, y, w, hh, fill: 'decor', shelves: 0, closure: 'magnet' })); s.nextId = 11; s.gridW = 6; s.gridH = 8; s.spaceW = null; s.spaceH = null; }, 'edit'), U);
  await load();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 10 && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 }).catch(() => assert.fail('the report\'s build did not reach the stage'));
  const at = async () => Object.fromEntries((await S(page)).placed.map((p) => [p.id, [p.x, p.y]]));
  const issues = () => page.evaluate(() => window.__GEN2_BUILD__.issues().filter((i) => i.sev !== 'guide').map((i) => i.kind));
  // the store coalesces commits made within 350 ms into ONE history entry (a drag is one undo); this script edits faster than
  // a hand can, so every edit that must be its own undo step is flushed into history first (2026-10-25: without it the two
  // removals merged and "one Undo per edit" timed out waiting for 9 units - a flake that passed alone, failed in the suite)
  const flush = () => page.evaluate(() => window.__GEN2_STORE__.flush());
  await flush();
  // 1. remove the right 3W, then the left: everything settles up, nothing is held, 0 issues, no manual move
  await page.evaluate(() => window.__GEN2_BUILD__.removeUnit(2));
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 9, null, { timeout: 30_000 });
  await flush();
  let a = await at();
  assert.deepEqual([a[5], a[8], a[4]], [[4, 0], [4, 4], [2, 3]], `the right column rose, the centre stays hooked under the left 3W: ${JSON.stringify(a)}`);
  // the toast is read right after the removal: it hides itself 2.6 s after it shows (dom.js say()) and the reads below can
  // outlast that under a full-suite load; its text stays readable once hidden, so the first removal's is cleared first
  // (it matches the same words) and this wait proves the SECOND removal's toast (Terra 01a1752f)
  await page.evaluate(() => { document.getElementById('ws-toast').textContent = ''; });
  await page.evaluate(() => window.__GEN2_BUILD__.removeUnit(1));
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 8, null, { timeout: 30_000 });
  await page.waitForFunction(() => /Removed 3W·1\.5H · .*moved up against what is above/.test(document.getElementById('ws-toast')?.textContent || ''), null, { timeout: 15_000 }).catch(() => assert.fail('the removal toast did not name what settled'));
  a = await at();
  assert.deepEqual(a, { 3: [0, 0], 4: [2, 0], 5: [4, 0], 6: [0, 4], 7: [2, 4], 8: [4, 4], 9: [0, 10], 10: [3, 10] }, `three 2W-2H on top, three 2W-3H, two 3W-1.5H at the bottom: ${JSON.stringify(a)}`);
  await settle(page, 800);
  assert.deepEqual(await issues(), [], 'no issues after settling');
  assert.equal(await page.locator('#ws-dock .status.issue').count(), 0, 'the Dock shows no issue');
  // one Undo per edit: the second removal comes back WITH its settle undone
  await page.evaluate(() => window.__GEN2_STORE__.flush());
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 9, null, { timeout: 30_000 });
  a = await at();
  assert.deepEqual([a[1], a[4], a[9]], [[0, 0], [2, 3], [0, 13]], `one Undo restores the removal and the settle together: ${JSON.stringify(a)}`);
  // 2. the same starting layout: drag the top-right 3W below the bottom row - allowed (no "would leave a unit without
  //    support"), the grid grows down for it, everything above settles up in one action
  await load();
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 10, null, { timeout: 30_000 });
  await flush();   // the load is its own history entry; the move must not merge into it
  const check = await page.evaluate(() => { const u = window.__GEN2_STORE__.state.placed.find((p) => p.id === 2); return window.__GEN2_BUILD__.moveCheck(u, 3, 16); });
  assert.ok(check.g, `the drop below the stack is allowed: ${JSON.stringify(check)}`);
  await page.evaluate(() => window.__GEN2_BUILD__.moveTo(2, 3, 16));
  await page.waitForFunction(() => { const p = window.__GEN2_STORE__.state.placed.find((q) => q.id === 2); return p && p.y === 16; }, null, { timeout: 30_000 }).catch(() => assert.fail('the 3W did not move below the stack'));
  a = await at();
  assert.deepEqual([a[2], a[5], a[8], a[4]], [[3, 16], [4, 0], [4, 4], [2, 3]], `the dropped 3W hangs at the bottom, the right column rose: ${JSON.stringify(a)}`);
  assert.ok((await S(page)).gridH >= 10, 'the grid grew down for the drop');
  await page.evaluate(() => window.__GEN2_STORE__.flush());
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => { const p = window.__GEN2_STORE__.state.placed.find((q) => q.id === 2); return p && p.y === 0; }, null, { timeout: 30_000 });
  assert.deepEqual(await at(), Object.fromEntries(U.map(([id, x, y]) => [id, [x, y]])), 'one Undo puts the whole move and its settle back');
  // 3. the voids are a drag preview only: with the centre column hooked by one end (after the first removal) the board
  //    draws no hatched cell at rest
  await flush();
  await page.evaluate(() => window.__GEN2_BUILD__.removeUnit(2));
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 9, null, { timeout: 30_000 });
  await view(page, '2D');
  await page.waitForSelector('#ws-board .b-unit', { timeout: 30_000 });
  assert.equal(await page.locator('#ws-board .b-deficit').count(), 0, 'no hatched void at rest');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* THE BAKED TOP LAYERS (2026-10-25, js/skin-map.js): a map is fetched only while the tier is Very High, and drawn only in its
   settle samples. The suite runs on Fast, so what it can hold is the other side of that rule: a build with faceplates on Fast
   asks the parts host for no map and holds none, while the switch and the status sit on the stage hook. The Very High side
   (the atlas, the settled frame) is proven by tools/skin-shots.mjs and the Very High goldens on a GPU. */
test('the baked top layers: Fast fetches no map and holds none; the switch and the status are on the stage hook', async () => {
  const c = await freshContext();
  const skinRequests = [];
  await c.route('**/parts/skin/**', (r) => { skinRequests.push(r.request().url()); return r.continue(); });
  const { ctx, page, errors } = await open('build', { context: c });
  await startBuild(page, [{ id: 1, x: 0, w: 2 }]);   // a Decor drawer unit: a faceplate with a map on the parts host
  await settle(page, 2500);
  const st = await page.evaluate(() => { const s = window.__GEN2_VIEWER__.skinMap; return { on: s.on, status: s.status(), tier: window.__GEN2_VIEWER__.quality }; });
  assert.equal(st.tier, 'fast');
  assert.equal(st.on, true, 'the maps are on by default; only ?skinmap=off turns them off');
  assert.equal(st.status.wanted, false, 'Fast must not want the maps');
  assert.equal(st.status.index, null, 'the index was fetched on Fast');
  assert.deepEqual(st.status.slots, {}, 'a map was packed on Fast');
  assert.deepEqual(skinRequests, [], 'Fast asked the parts host for a map');
  const flipped = await page.evaluate(() => { const s = window.__GEN2_VIEWER__.skinMap; s.set(false); const off = s.uniforms.uSMOn.value; s.set(true); return [off, s.uniforms.uSMOn.value]; });
  assert.deepEqual(flipped, [0, 1], 'the switch does not reach the shared uniform');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

/* the shards (see the top of the file): this process's share of the cases above, in file order */
registerShare(nodeTest, CASES, SHARD, { weightsFile: join(root, 'e2e', 'shard-weights.json'), reportFile: process.env.E2E_SHARD_REPORT });
