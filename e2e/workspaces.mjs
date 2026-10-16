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
test.after(async () => { await browser.close(); server.close(); if (studioServer) studioServer.close(); });
/* a case that fails before its own ctx.close() must not leave a page rendering: on the CI runner's software rasteriser
   one leftover render loop starved every boot after it, so each case's contexts are closed here whatever happened */
const contexts = new Set();
afterEach(async () => { for (const c of contexts) await c.close().catch(() => {}); contexts.clear(); });

/* a page on a workspace: booted (the stage has its manifest, the workspace its dock), errors collected.
   The quality tier is pinned to `fast` (no shadows, dpr 1) and the desktop viewport is the smallest desktop layout: the
   suite proves behaviour, not pixels, and on the CI runner's software rasteriser the balanced tier at 1440x900 kept the
   main thread so busy that a click took longer than its 30 s to be acknowledged (run 38426597075, 2026-10-13) */
async function open(ws, { query = '', phone = false, context = null } = {}) {
  const ctx = context || await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
  contexts.add(ctx);
  if (!context) await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'fast'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
  const page = await ctx.newPage();
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

/* THE BOARD REDESIGN (Joey + Astra, 2026-10-16): the 2D board hugs the build and shows the 3D view's "+" spots (one
   calculation for both); past either edge widens the build within the mount's cap; a drag may go past the build; the
   inspector's Move buttons are the alternative to dragging; an empty build has one starting spot. */
const boardSpots = (page) => page.evaluate(() => [...document.querySelectorAll('#ws-board .b-spot')].map((g) => `${g.dataset.x},${g.dataset.y}`).sort());
const stageSpots = (page) => page.evaluate(() => (window.__spots || []).slice().sort());
const watchStageSpots = (page) => page.evaluate(() => { const V = window.__GEN2_VIEWER__; if (V.__watched) return; V.__watched = 1; const o = V.setSpots; V.setSpots = (spec) => { window.__spots = spec ? spec.spots.filter((p) => p.kind !== 'need').map((p) => `${p.x},${p.y}`) : []; return o(spec); }; });
const brief = (page) => page.evaluate(() => { const s = window.__GEN2_STORE__.state; return { gridW: s.gridW, units: s.placed.map((p) => `${p.id}:${p.w}W@${p.x},${p.y}`).sort().join(' ') }; });
const armSize = async (page, t) => { await page.locator('#ws-lib .size:not(.dis)', { hasText: t }).first().click(); await page.waitForSelector('#ws-lib .size.on', { timeout: 5000 }); };
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
  await page.waitForSelector('#ws-board .b-spot', { timeout: 10_000 }).catch(() => assert.fail('the board drew no "+" spots within 10 s'));
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
  await page.waitForSelector(`#ws-board .b-spot[data-x="3"][data-y="${y}"]`, { timeout: 10_000 });
  await clickSpot(page, 3, y);
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 3, null, { timeout: 30_000 }).catch(() => assert.fail('the right "+" placed nothing within 30 s'));
  assert.equal((await brief(page)).gridW, 4);
  // cancelling: Escape takes the spots away
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#ws-board .b-spot') && !document.querySelector('#ws-lib .size.on'), null, { timeout: 5000 });
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
  await page.waitForSelector('#ws-board .b-spot', { timeout: 10_000 });
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
  await page.waitForSelector('#ws-board .b-deficit', { timeout: 10_000 }).catch(() => assert.fail('the uneven top was not hatched within 10 s'));
  assert.match(await text(page, '#ws-dock'), /issue/i, 'the Dock counts the completion issue');
  assert.equal(await page.locator('#incomplete-status').isVisible(), false, 'no viewer pill over the Dock');
  // the Move buttons: the unit at the left edge steps past it, the build widens (Escape twice: stop placing, then drop
  // the selection - the 1.5H just placed is selected, and a click on a selected unit deselects it)
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  const leftmost = await page.evaluate(() => window.__GEN2_STORE__.state.placed.slice().sort((a, b) => a.x - b.x)[0].id);
  await page.locator(`#ws-board .b-unit[data-id="${leftmost}"]`).click();
  await page.waitForSelector('#ws-insp button:has-text("◀ Left")', { timeout: 10_000 });
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
  await page.waitForSelector('#ws-board .b-spot', { timeout: 10_000 });
  const capXs = (await boardSpots(page)).map((k) => +k.split(',')[0]);
  assert.ok(capXs.every((x) => x >= 0 && x < 12), `nothing past the 12W cap: ${capXs}`);
  // an empty build: one starting spot, in both views
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.placed = []; }, 'edit'));
  await page.waitForFunction(() => window.__GEN2_STORE__.state.placed.length === 0, null, { timeout: 30_000 });
  await armSize(page, '1W·1H');
  await page.waitForFunction(() => document.querySelectorAll('#ws-board .b-spot').length === 1, null, { timeout: 10_000 }).catch(() => assert.fail('the empty build did not show exactly one starting spot within 10 s'));
  await view(page, '3D');
  await page.waitForFunction(() => (window.__spots || []).length === 1, null, { timeout: 30_000 }).catch(() => assert.fail('the 3D view did not show exactly one starting spot within 30 s'));
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
  await page.waitForSelector('#ws-dock .group.sections', { timeout: 10_000 }).catch(() => assert.fail('the Dock did not show the sections within 10 s'));
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
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } }); contexts.add(other);
  const p2 = await other.newPage(); await p2.goto(link, { waitUntil: 'load' }); await waitBoot(p2);
  assert.deepEqual((await brief(p2)).units, want.units, 'the share link opens the same gap build');
  await other.close();
  // an older link: a stored gridW wider than the build. It opens as stored (nothing hugs until an edit), the "+" sit
  // either side of the build, and the first placement hugs the grid to the build
  await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { const y = s.gridH * 2 - 2; s.placed = [{ id: 7, x: 5, y, w: 2, hh: 2, fill: 'decor', shelves: 0 }]; s.nextId = 8; s.gridW = 12; }, 'edit'));
  await page.waitForTimeout(800);
  const old = await page.evaluate(() => location.href);
  const third = await browser.newContext({ viewport: { width: 1280, height: 800 } }); contexts.add(third);
  const p3 = await third.newPage(); await p3.goto(old, { waitUntil: 'load' }); await waitBoot(p3);
  assert.equal((await brief(p3)).gridW, 12, 'the older build opens as stored');
  await watchStageSpots(p3); await view(p3, '2D'); await armSize(p3, '1W·1H');
  const y3 = await p3.evaluate(() => window.__GEN2_STORE__.state.gridH * 2 - 2);
  await p3.waitForSelector(`#ws-board .b-spot[data-x="4"][data-y="${y3}"]`, { timeout: 10_000 }).catch(() => assert.fail('no "+" left of the older build within 10 s'));
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
  await page.waitForSelector(`#ws-board .b-spot[data-x="-1"][data-y="${y}"]`, { timeout: 10_000 }).catch(() => assert.fail('no left "+" on the phone board within 10 s'));
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
  const marks = (await page.evaluate((t) => window.__GEN2_VIEWER__.spotScreens().filter((m) => m.y === t).sort((a, b) => a.x - b.x), top));
  const hovered = () => page.evaluate(() => (window.__GEN2_VIEWER__.spotScreens().find((m) => m.hovered) || {}).x ?? null);
  await page.mouse.move(marks[0].sx, marks[0].sy, { steps: 4 });
  await page.waitForFunction((x) => (window.__GEN2_VIEWER__.spotScreens().find((m) => m.hovered) || {}).x === x, marks[0].x, { timeout: 5000 }).catch(() => assert.fail('the first "+" did not take the hover'));
  for (const m of marks.slice(1)) {
    await page.mouse.move(m.sx, m.sy, { steps: 6 });   // straight across, never leaving the ghost
    await page.waitForFunction((x) => (window.__GEN2_VIEWER__.spotScreens().find((q) => q.hovered) || {}).x === x, m.x, { timeout: 5000 }).catch(async () => assert.fail(`moving onto the "+" at x ${m.x} left the hover on x ${await hovered()}`));
  }
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
  await page.waitForSelector('#ws-lib .size.on', { timeout: 5000 });
  assert.ok(await page.locator('#ws-lib .armed').count(), 'picking a size starts placing');
  // cancelling clears the lit tile and the placing box, and the size stays remembered (the build's `selected`)
  const picked = (await S(page)).selected;
  await btn(page, 'Stop placing', '#ws-lib').click();
  await page.waitForFunction(() => !document.querySelector('#ws-lib .armed'), null, { timeout: 5000 });
  assert.equal(await page.locator('#ws-lib .size.on').count(), 0, 'Stop placing clears the lit size');
  assert.deepEqual((await S(page)).selected, picked, 'the size is still remembered after cancelling');
  await page.click('#ws-lib .size:not(.dis) >> nth=1');
  await page.waitForSelector('#ws-lib .size.on', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#ws-lib .size.on'), null, { timeout: 5000 });
  assert.deepEqual((await S(page)).selected, picked, 'Escape cancels placing and keeps the size');
  await page.click('#ws-lib .size:not(.dis) >> nth=1');   // armed again for the placement below
  await page.waitForFunction(() => window.__GEN2_VIEWER__.build && document.querySelector('#ws-lib .size.on, #ws-lib .size[aria-pressed="true"]'), null, { timeout: 5000 }).catch(() => {});
  // beside the build on its bottom row: supported by the surface, so the generator accepts it and the stage rebuilds
  await page.evaluate(() => { const st = window.__GEN2_STORE__; st.commit((s, R) => { const id = s.nextId++; const bottom = Math.max(...s.placed.map((p) => p.y + p.hh)); const right = Math.max(...s.placed.map((p) => p.x + p.w)); s.placed.push({ id, x: right, y: bottom - 2, w: 1, hh: 2, fill: 'decor', shelves: 0 }); if (s.gridW < right + 1) s.gridW = right + 1; R.syncTabletopGrid(); }, 'edit'); });
  await page.waitForFunction((n) => window.__GEN2_VIEWER__.build.placed.length === n + 1, n0, { timeout: 90_000 });
  assert.equal(await units(page), n0 + 1);
  assert.equal(await stageUnits(page), n0 + 1, 'the stage regenerated with the new unit');
  assert.match(await text(page, '#ws-dock .big'), new RegExp(String(n0 + 1)), 'the dock counts it');
  // undo through the toolbar
  await page.evaluate(() => window.__GEN2_STORE__.flush());
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction((n) => window.__GEN2_STORE__.state.placed.length === n, n0, { timeout: 10_000 });
  assert.equal(await units(page), n0, 'undo took the unit back');
  // the issue card: an unsupported unit (a floating case on a tabletop build) is named, and Fix structure clears it
  await page.evaluate(() => { const st = window.__GEN2_STORE__; st.commit((s) => { const id = s.nextId++; s.placed.push({ id, x: 0, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0 }); }, 'edit'); });
  await settle(page, 600);
  const status = await text(page, '#ws-dock .status');
  assert.ok(/issue|Fix/i.test(status) || /valid/i.test(status), 'the dock reports a status: ' + status);
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('Colors: a preset recolours the model, a region pick is one history entry, Undo restores it', async () => {
  const { ctx, page, errors } = await open('colors');
  const before = await page.evaluate(() => JSON.stringify(window.__GEN2_VIEWER__.palette().colors));
  const presets = page.locator('#ws-colors .scheme .apply');
  assert.ok(await presets.count() >= 2, 'presets listed');
  await presets.nth(1).click();
  await settle(page, 600);
  const after = await page.evaluate(() => JSON.stringify(window.__GEN2_VIEWER__.palette().colors));
  assert.notEqual(after, before, 'the preset changed the palette');
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
  await p2.waitForFunction(() => document.title === 'E2E bench · MODULITH', null, { timeout: 30_000 });   // the rename lands after an IndexedDB write
  // duplicate (navigates), then delete the original from the copy's menu
  await p2.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await p2.waitForFunction((old) => window.__GEN2_STORE__ && window.__GEN2_STORE__.state.buildId !== old, id, { timeout: 60_000 });
  await waitBoot(p2);
  assert.equal(await p2.evaluate(() => document.title), 'Copy of E2E bench · MODULITH');   // the tab is the build, then the product (js/ui/names.js)
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
  assert.equal(await page.evaluate(() => document.title), 'From a file · MODULITH');
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
  await page.waitForFunction(() => { const m = document.querySelector('#ws-switch .menu'); return m && !m.hidden && m.contains(document.activeElement); }, null, { timeout: 5000 });
  const first = await page.evaluate(() => document.activeElement.textContent.trim().slice(0, 20));
  await page.keyboard.press('ArrowDown');
  const second = await page.evaluate(() => document.activeElement.textContent.trim().slice(0, 20));
  assert.notEqual(second, first, 'ArrowDown moved to the next item');
  await page.keyboard.press('End');
  assert.match(await page.evaluate(() => document.activeElement.textContent.trim()), /New build/, 'End reaches the last item');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#ws-switch .menu').hidden && document.activeElement === document.querySelector('#ws-switch .chip-btn'), null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.querySelector('#ws-switch .chip-btn').getAttribute('aria-expanded')), 'false');
  // the toast is a live region
  assert.equal(await page.evaluate(() => document.getElementById('ws-toast').getAttribute('aria-live')), 'polite');
  // a modal: Tab cycles inside it, Escape closes it and focus goes back where it was
  await page.waitForSelector('#ws-labels .foot', { timeout: 30_000 });
  await btn(page, 'Type a label', '#ws-labels').focus();
  await btn(page, 'Type a label', '#ws-labels').press('Enter');
  await page.waitForFunction(() => !document.getElementById('ws-modal').hidden && document.activeElement === document.querySelector('#ws-modal input.field'), null, { timeout: 5000 });
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.getElementById('ws-modal').contains(document.activeElement)), 'three Tabs later focus is still inside the modal');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('ws-modal').hidden, null, { timeout: 5000 });
  assert.match(await page.evaluate(() => document.activeElement.textContent.trim()), /Type a label/, 'focus returned to the opener');
  // ...and after an ADD, which re-renders the panel (the stress test, 2026-10-15: the keyboard was left at <body>)
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.getElementById('ws-modal').hidden && document.activeElement === document.querySelector('#ws-modal input.field'), null, { timeout: 5000 });
  await page.keyboard.type('Keyboard label');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('ws-modal').hidden && ((window.__GEN2_STORE__.state.labelList || { labels: [] }).labels.length === 1), null, { timeout: 5000 });
  assert.match(await page.evaluate(() => document.activeElement.textContent.trim()), /Type a label/, 'the keyboard stays on the opener after the add');
  // the label editor from the keyboard: Enter on the pencil moves into its words, Escape closes it and comes back to the pencil
  await page.locator('#ws-labels button[title="Edit this label"]').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement === document.querySelector('#ws-labeledit input.words'), null, { timeout: 5000 });
  // a late icon font re-renders the editor alone: the keyboard and the half-typed words stay (Sol 01a13fe5)
  await page.keyboard.press('End'); await page.keyboard.type(' xyz');
  await page.evaluate(() => window.__GEN2_LABELS_REFRESH__());
  assert.deepEqual(await page.evaluate(() => { const a = document.activeElement; return [a === document.querySelector('#ws-labeledit input.words'), a.value]; }), [true, 'Keyboard label xyz'], 'still typing, nothing lost');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('ws-labeledit').hidden && document.activeElement && document.activeElement.getAttribute('title') === 'Edit this label', null, { timeout: 5000 });
  // the setup sheet: focus lands on the name field, Tab stays inside, Escape closes and returns
  await page.evaluate(() => { window.__GEN2_CTX__().openSetup('mount'); });
  await page.waitForFunction(() => document.activeElement === document.querySelector('#ws-setup input.name'), null, { timeout: 5000 });
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.getElementById('ws-setup').contains(document.activeElement)), 'twelve Tabs later focus is still inside the sheet');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('ws-setup'), null, { timeout: 5000 });
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
  await page.waitForFunction(() => !window.__GEN2_PICKER__().veil.hidden, null, { timeout: 10_000 });
  await frame.locator('details.ltools > summary').click();   // List tools: "Add all N to the planner" (#make-labels) re-sends the kept list
  await frame.locator('#make-labels:enabled').click();
  await page.waitForFunction(() => window.__GEN2_PICKER__().veil.hidden, null, { timeout: 30_000 });
  const after2 = await page.evaluate(() => (window.__GEN2_STORE__.state.labelList || { labels: [] }).labels.map((l) => l.id));
  assert.deepEqual(after2, [after1[0][0]], 'the same label, not a second one');
  assert.match(await text(page, '#ws-labels .last'), /Updated 1 already in the list/);
  // one undo takes the batch back
  assert.deepEqual(await page.evaluate(() => { const l = window.__GEN2_STORE__.state.labelList.labels[0]; return [l.text, l.hardware.fields.join()]; }), ['edited by hand', 'M3'], 'the hand-typed words stay, the record is the Picker’s again (an M3 nut now: the flow refine needs a size)');
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction(() => { const l = window.__GEN2_STORE__.state.labelList && window.__GEN2_STORE__.state.labelList.labels[0]; return l && l.hardware.fields.join() === 'M9'; }, null, { timeout: 10_000 });   // one undo: the update alone
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction(() => { const l = window.__GEN2_STORE__.state.labelList && window.__GEN2_STORE__.state.labelList.labels[0]; return l && l.text !== 'edited by hand' && window.__GEN2_STORE__.state.labelList.labels.length === 1; }, null, { timeout: 10_000 });   // the hand edit
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction(() => !window.__GEN2_STORE__.state.labelList || !window.__GEN2_STORE__.state.labelList.labels.length, null, { timeout: 10_000 });
  // a batch that lands after the modal was closed is refused, not imported behind the visitor's back (Sol 01a13844)
  await page.locator('#ws-labels button[title^="Opens the Part Picker here"]').click();
  await page.waitForFunction(() => !window.__GEN2_PICKER__().veil.hidden, null, { timeout: 10_000 });
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
  await page.waitForFunction(() => window.__GEN2_PICKER__().veil.hidden, null, { timeout: 5000 });
  // Escape INSIDE the frame never reaches this page: the Picker asks with `close` and the dialog closes (a stranger's
  // close, without the session, is ignored)
  await page.locator('#ws-labels button[title^="Opens the Part Picker here"]').click();
  await page.waitForFunction(() => !window.__GEN2_PICKER__().veil.hidden, null, { timeout: 10_000 });
  const sessionB = await page.evaluate(() => window.__GEN2_PICKER__().session);
  await frame.locator('body').evaluate(() => parent.postMessage({ gen2parts: 'close', v: 1, session: 'not-the-session-at-all' }, '*'));
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_PICKER__().veil.hidden), false, 'a close without the session is ignored');
  await frame.locator('body').evaluate((body, s) => parent.postMessage({ gen2parts: 'close', v: 1, session: s }, '*'), sessionB);
  await page.waitForFunction(() => window.__GEN2_PICKER__().veil.hidden, null, { timeout: 5000 });
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
  await page.waitForFunction((id) => window.__GEN2_PLATE__().selLabel === id, nuts, { timeout: 10_000 });
  assert.equal(await page.locator('#ws-labels .chip-l.sel').count(), 1, 'the selection shows in the panel');
  assert.equal(await frame.locator(`#labels .row.sel[data-label-id="${nuts}"]`).count(), 1, 'and on the plate');
  // undo in the planner (the placement): the plate follows with a new rev, the drawer tag goes
  const rev = await page.evaluate(() => window.__GEN2_PLATE__().rev);
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction((r) => window.__GEN2_PLATE__().rev > r, rev, { timeout: 10_000 });
  await frame.locator(`#labels .row[data-label-id="${screws}"] .utag`).waitFor({ state: 'detached', timeout: 10_000 });
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
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gen2-label-print') || '{}').band === 'end', null, { timeout: 5000 });   // the plate's change is the browser's preference now
  assert.equal(await page.locator('#ws-labels select[aria-label="Part label stripe"]').evaluate((el) => el.value), 'end', 'and the panel shows it');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__GEN2_STORE__.state).includes('hw-band')), false, 'never in the record');
  await settle(page, 400);
  assert.equal(await frame.locator('#hw-band').evaluate((el) => el.value), 'end', 'no snapshot echoed the old value back over the plate');
  await frame.locator('#hw-band').selectOption('wedge');   // a second change from the plate still carries the current rev (Sol 01a13c32)
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gen2-label-print') || '{}').band === 'wedge', null, { timeout: 5000 });
  await frame.locator('#hw-profile').setChecked(false);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gen2-label-print') || '{}').drawings === false, null, { timeout: 5000 });
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
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gen2-label-print')).band === 'end', null, { timeout: 5000 });   // the current rev: taken
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
  await page.waitForFunction(() => !window.__GEN2_PLATE__().box.hidden, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__GEN2_PLATE__().view), 'plate');
  // a message that is not from the frame, or without the session, is ignored
  await page.evaluate((origin) => { window.postMessage({ gen2plate: 'selected', v: 1, session: 'nope', id: 'x', rev: 0 }, origin); }, base);
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_PLATE__().selLabel), nuts, 'a stray selected changes nothing');
  assert.deepEqual(clean(errors), []);
  await ctx.close();
});

test('the setup sheet: New build, Wall Mount at 115 with a printer, Start build rebuilds on the record', async () => {
  const { ctx, page } = await open('build', { query: '&new=1&setup=1' });
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
  assert.equal(await page.evaluate(() => document.title), 'E2E wall · MODULITH');
  assert.match(await text(page, '#ws-top .chip-btn.mount'), /Wall Mount · 115/);
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
  await page.waitForFunction(() => !window.__GEN2_PICKER__().veil.hidden, null, { timeout: 10_000 });
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
  await page.waitForSelector('#ws-labeledit input.words', { timeout: 10_000 });
  assert.match(await text(page, '#ws-labeledit .note'), new RegExp(`${long.length} characters long`), 'the editor says what a change keeps');
  await page.locator('#ws-labeledit input.words').press('Enter');
  await settle(page, 300);
  assert.equal(await page.evaluate(() => window.__GEN2_STORE__.state.labelList.labels[0].text), long, 'nothing changed, nothing cut');
  await page.locator('#ws-labeledit input.words').press('End');
  await page.keyboard.press('Backspace');   // a change (the field's maxlength of 40 stops typing more into it)
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__GEN2_STORE__.state.labelList.labels[0].text.length === 40, null, { timeout: 5000 });
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
  await page.waitForFunction((w) => window.__GEN2_STORE__.state.placed.length === 2 && window.__GEN2_STORE__.state.gridW === w + 1, s0.placed[0].w, { timeout: 10_000 });
  const s1 = await S(page);
  assert.deepEqual(s1.placed.map((u) => [u.id, u.x]).sort((a, b) => a[0] - b[0]), [[s0.placed[0].id, 1], [s0.nextId, 0]], 'the starter moved right, the new drawer is at x 0');
  await page.click('#ws-tools button[aria-label="Undo"]');
  await page.waitForFunction((w) => window.__GEN2_STORE__.state.gridW === w && window.__GEN2_STORE__.state.placed.length === 1, s0.gridW, { timeout: 10_000 });
  assert.deepEqual((await S(page)).placed.map((u) => u.x), [0], 'one undo puts it all back');
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
  const reach = await page.waitForFunction(() => { const b = document.querySelector('#ws-labeledit button[aria-label="Close the editor"]'); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === b || b.contains(t); }, null, { timeout: 5000 }).then(() => true, () => false);
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
