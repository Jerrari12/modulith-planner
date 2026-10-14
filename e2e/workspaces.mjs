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

test('Build: a unit placed through the store reaches the stage; move, remove and undo follow; the issue card speaks', async () => {
  const { ctx, page, errors } = await open('build');
  const n0 = await units(page);
  // place: the library arms a size and the store takes the placement the way the spot tap does
  await page.click('#ws-lib .size:not(.dis) >> nth=1');
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
  await p2.waitForFunction(() => document.title === 'E2E bench', null, { timeout: 30_000 });   // the rename lands after an IndexedDB write
  // duplicate (navigates), then delete the original from the copy's menu
  await p2.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await p2.waitForFunction((old) => window.__GEN2_STORE__ && window.__GEN2_STORE__.state.buildId !== old, id, { timeout: 60_000 });
  await waitBoot(p2);
  assert.equal(await p2.evaluate(() => document.title), 'Copy of E2E bench');
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
  assert.equal(await page.evaluate(() => document.title), 'From a file');
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
  assert.equal(await page.evaluate(() => document.title), 'E2E wall');
  assert.match(await text(page, '#ws-top .chip-btn.mount'), /Wall Mount · 115/);
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
