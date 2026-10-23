/* THE HOVER-HINT CLIPS, recorded from the app itself (Joey, 2026-10-13: a 10-15 s recording of the planner in use, as the
   3D Printopia clip was; the SVG scenes are the placeholders until these exist). Headless Chrome drives a workspace with a
   drawn cursor the way a visitor would while Chrome's screencast (CDP Page.startScreencast: a JPEG per repaint, with its
   timestamp) records it; ffmpeg assembles the frames at their real timing, scales to the bubble's size and writes H.264
   MP4s under img/hints/ (the names the workspaces' HINTS tables look for; img/hints/README.md). Playwright's own recordVideo
   is not used: its ffmpeg download is unreachable from this machine, and the system ffmpeg is.

     node tools/hint-clips.mjs                -> every clip, img/hints/<workspace>-<key>.mp4
     node tools/hint-clips.mjs labels-fill    -> one clip
     node tools/hint-clips.mjs build          -> one workspace's clips

   A clip's key names its workspace (`labels-type` opens ?ws=labels); since 2026-10-23 (Joey: "more video animations for
   when hovering over certain buttons") the other workspaces record here too. Every clip runs against the local repo; the
   Part Picker clip also serves the Label Studio checkout beside it (STUDIO_DIR= overrides the path) for the modal, as the
   e2e suite does. */
import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'img', 'hints');
const W = 1040, H = 700;             // the recording (tall enough for the whole panel); each clip crops a 240:110 window, scaled to 480 x 222
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const only = process.argv[2] || null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.md': 'text/markdown', '.webp': 'image/webp' };
function serve(dir = root) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
      const f = join(dir, p); const s = await stat(f);
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(s.isDirectory() ? join(f, 'index.html') : f));
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const posix = (p) => p.replace(/\\/g, '/');

/* a drawn cursor: Playwright's mouse is invisible, so the page gets one that follows it */
const CURSOR = `window.__cur = (x, y, down) => { let c = document.getElementById('__cur'); if (!c) { c = document.createElement('div'); c.id = '__cur'; c.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;width:24px;height:32px;margin:-2px 0 0 -3px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));transition:transform .08s'; c.innerHTML = '<svg viewBox="0 0 22 30"><path d="M2 2l0 22 6-5 4 9 4-2-4-9 8-1z" fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>'; document.body.appendChild(c); } c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.transform = down ? 'scale(.85)' : 'none'; };`;
async function driver(page, [w, h] = [W, H]) {
  let cx = w * 0.6, cy = h * 0.7;
  await page.evaluate(CURSOR);
  const put = async (x, y, down = false) => { cx = x; cy = y; await page.mouse.move(x, y); await page.evaluate(([a, b, d]) => window.__cur(a, b, d), [x, y, down]); };
  await put(cx, cy);
  const glide = async (x, y, ms = 650) => {
    const x0 = cx, y0 = cy, n = Math.max(8, Math.round(ms / 25));
    for (let i = 1; i <= n; i++) { const t = i / n, e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; await put(x0 + (x - x0) * e, y0 + (y - y0) * e); await sleep(ms / n); }
  };
  const click = async () => { await put(cx, cy, true); await page.mouse.down(); await sleep(90); await page.mouse.up(); await put(cx, cy, false); };
  const centre = async (sel) => { const r = await page.locator(sel).first().boundingBox(); if (!r) throw new Error('no element ' + sel); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const to = async (sel, ms) => { const [x, y] = await centre(sel); await glide(x, y, ms); };
  const type = async (text, ms = 85) => { for (const ch of text) { await page.keyboard.type(ch); await sleep(ms + Math.random() * 40); } };
  /* a drag with the button down (an orbit on the stage), the cursor drawn pressed */
  const drag = async (x0, y0, x1, y1, ms = 800) => {
    await glide(x0, y0, 500); await put(x0, y0, true); await page.mouse.down();
    const n = Math.max(8, Math.round(ms / 25));
    for (let i = 1; i <= n; i++) { const t = i / n; await put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, true); await sleep(ms / n); }
    await page.mouse.up(); await put(x1, y1, false);
  };
  /* a cut: from this moment the clip is framed by `crop` (a 240:110 window); the frames are split on their timestamps and
     the segments joined, so one clip can follow a gesture from the panel into a modal and back (the Part Picker, 2026-10-20) */
  const cuts = [];
  const cut = (crop) => { cuts.push({ ts: Date.now() / 1000, crop }); };
  return { glide, click, to, type, put, centre, cut, cuts, drag };
}
const tile = (text) => `#ws-labels .key.tile:has-text("${text}")`;
/* a control scrolled into its panel's view (as far as the panel scrolls), and where it landed */
async function scrollTo(page, sel) {
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await sleep(200);
  const r = await page.locator(sel).first().boundingBox(); if (!r) throw new Error('no element ' + sel);
  return r;
}
/* a workspace, booted (the stage has its manifest, the workspace its dock or player, as the e2e suite waits), the bubble
   kept out of its own clip. Labels gets EdgeLabel faceplates, so the drawers take labels */
async function openPage(ctx, base, ws, query = '') {
  const page = await ctx.newPage();
  await page.goto(`${base}/index.html?ws=${ws}&debug=1${query}`, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && window.__GEN2_STORE__ && document.querySelector('#ws-dock, #ws-player'), null, { timeout: 90_000 });
  await page.addStyleTag({ content: '#ws-hint { display: none !important; }' });   // the bubble must not appear in its own clip
  if (ws === 'labels') {
    await page.waitForSelector('#ws-labels .foot', { timeout: 90_000 });
    // EdgeLabel faceplates, so the drawers take labels: the switch loads parts, so wait for the record to say so
    await page.evaluate(() => { const btn = [...document.querySelectorAll('#ws-labels button')].find((b) => b.textContent.trim().startsWith('Switch to EdgeLabel')); if (btn) btn.click(); });
    await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 90_000 });
  }
  await page.waitForTimeout(1200);
  return page;
}
async function addLabels(page, words) {
  await page.evaluate(async (ws) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const btn = (t, root = document) => [...root.querySelectorAll('button')].find((b) => !b.closest('[hidden]') && b.textContent.trim().startsWith(t));
    for (const w of ws) { btn('Type a label').click(); await sleep(60); document.querySelector('#ws-modal input.field').value = w; btn('Add label', document.querySelector('#ws-modal .box')).click(); await sleep(150); }
  }, words);
  await page.waitForTimeout(400);
}

/* each clip, keyed `<workspace>-<name>` (the file's name; the workspace it opens): { query?, setup?(page), run(page, d), popup?,
   crop }; the recording starts just before run(). `crop` [x, y, w, h] frames the subject at the bubble's 240:110 (the panel
   with the model beside it; for Fill and Place several the model with the panel's edge) */
const PANEL = [20, 215, 700, 321], MODEL = [330, 200, 620, 284], BOTH = [20, 180, 760, 348], STUDIO = [0, 40, 700, 321], MODAL = [18, 18, 1004, 460];   // MODAL: the Part Picker frame's top (the steps bar, the family and type tiles) inside the modal's 18 px inset   // tighter than the frame: the bubble is 248 px wide, so the gesture must read
/* the 1280 x 800 framings (the 2026-10-23 clips): the library's size tiles with the spots above the model; the library's
   lower part; the model alone; the issue card with the red slot above it; a panel and the whole model at half scale (the
   gallery, Surprise me, the parts list), the same lower down (the candidates' buttons; the parts list with the dock); the
   Simplify card with the model above it; the toolbar with the overview under it */
const DESK = [1280, 800];
const LIB_TOP = [20, 170, 700, 321], MODEL_D = [230, 180, 700, 321], GAP = [290, 380, 700, 321];
const LIST = [20, 150, 700, 321], ROWS = [20, 290, 700, 321];
const WIDE = [20, 150, 960, 440], WIDE_LOW = [20, 250, 960, 440], WIDE_DOCK = [20, 360, 960, 440], SIMP = [160, 260, 960, 440], TOOLS = [460, 60, 700, 321];
const CLIPS = {
  'labels-type': {
    crop: PANEL,
    async run(page, d) {
      await d.to(tile('Type a label'), 700); await sleep(500); await d.click(); await sleep(500);
      await d.type('M3 screws'); await sleep(600);
      await d.to('#ws-modal .btns .key.on', 500); await sleep(250); await d.click(); await sleep(900);
      await d.to('#ws-labels .list .chip-l', 600); await sleep(1800);
    },
  },
  /* From a file… opens the computer's own file chooser, which no screencast can capture (headless Chrome shows none; a real
     one is the operating system's window). Joey, 2026-10-23: the clip "looks wrong, instead it should open a desktop folder
     explorer window". So the clip draws a stand-in: an Open window in the planner's own glass style over the stage, a short
     file list with modulith-labels.json chosen, the type line, Open and Cancel; the cursor presses Open, the window goes, and
     the file's labels land in the list. Generic names, not anyone's folders. */
  'labels-file': {
    crop: PANEL,
    async run(page, d) {
      const fixture = join(tmpdir(), 'modulith-labels.json');
      await writeFile(fixture, JSON.stringify({ format: 'modulith-labels', version: 1, labels: [{ text: 'M4 × 16 SHCS' }, { text: 'Hex keys' }, { text: 'Coffee filters' }] }));
      const chooser = page.waitForEvent('filechooser');
      await d.to(tile('From a file'), 700); await sleep(500); await d.click();
      const fc = await chooser;
      await page.evaluate(() => {
        const row = (name, on) => `<div style="padding:7px 10px;border-radius:8px;${on ? 'background:var(--toggle-on);font-weight:600' : 'color:var(--ink-3)'}">${name}</div>`;
        const dlg = document.createElement('div'); dlg.id = '__dlg'; dlg.className = 'glass';
        dlg.style.cssText = 'position:fixed;left:352px;top:236px;width:330px;box-sizing:border-box;border-radius:14px;padding:14px 16px;font-family:var(--font-ui);font-size:13px;z-index:9999;display:flex;flex-direction:column;gap:10px';
        dlg.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><b style="font-size:15px;flex:1">Open</b><span style="color:var(--ink-2)">Downloads</span></div>'
          + '<div style="display:flex;flex-direction:column;gap:3px;border-radius:10px;background:rgba(255,255,255,.04);padding:6px">' + row('label-plate.pdf') + row('modulith-labels.json', true) + row('parts-list.csv') + '</div>'
          + '<div style="display:flex;gap:8px;color:var(--ink-2)"><span style="flex:1">File name: <span style="color:var(--ink)">modulith-labels.json</span></span><span>JSON files</span></div>'
          + '<div style="display:flex;justify-content:flex-end;gap:8px"><span style="padding:8px 14px;border-radius:10px;border:1px solid var(--glass-border)">Cancel</span><span id="__dlg-open" style="padding:8px 14px;border-radius:10px;background:var(--orange);color:var(--on-orange);font-weight:700">Open</span></div>';
        document.getElementById('ws').appendChild(dlg);
      });
      await sleep(1600);
      await d.to('#__dlg-open', 700); await sleep(400); await d.click();
      await page.evaluate(() => document.getElementById('__dlg')?.remove());
      await fc.setFiles(fixture); await sleep(1000);
      await d.to('#ws-labels .list .chip-l', 600); await sleep(600);
      await d.to('#ws-labels .list .item:nth-child(3) .chip-l', 500); await sleep(1800);
      await rm(fixture, { force: true });
    },
  },
  'labels-fill': {
    crop: MODEL,
    async setup(page) { await addLabels(page, ['M3 screws', 'Hex keys', 'Solder']); },
    async run(page, d) {
      await d.to(tile('Fill empty drawers'), 700); await sleep(500); await d.click(); await sleep(900);
      await d.to('#ws-modal .btns .key.on', 600); await sleep(400); await d.click(); await sleep(700);
      const u = await page.evaluate(() => window.__GEN2_VIEWER__.unitScreen(window.__GEN2_STORE__.state.placed[0].id));
      if (u) await d.glide(u.x + 40, u.y + 10, 900);
      await sleep(2600);
    },
  },
  'labels-several': {
    crop: BOTH,
    async setup(page) { await addLabels(page, ['M3 screws', 'Hex keys', 'Solder']); },
    async run(page, d) {
      await d.to('#ws-labels .key.sm:has-text("Place several")', 700); await sleep(400); await d.click(); await sleep(500);
      const ids = await page.evaluate(() => window.__GEN2_STORE__.state.placed.map((u) => u.id));
      for (const id of ids.slice(0, 3)) {
        const u = await page.evaluate((i) => window.__GEN2_VIEWER__.unitScreen(i), id);
        if (!u) continue;
        await d.glide(u.x, u.y, 700); await sleep(250); await d.click(); await sleep(900);
      }
      await sleep(1500);
    },
  },
  /* the Part Picker opens in the page (a modal frame of the Studio, step A), so the clip follows the gesture into the
     modal and back out: the tile, the modal with a nut picked (Nuts → Hex nut → M3, no lengths step, as the e2e does), Add,
     the label landing in the list. The Studio is the checkout beside this repo on a second loopback server, as the e2e
     suite does it: the live Studio's Picker refuses a loopback planner as its parent (the handshake never answers). */
  'labels-picker': {
    crop: PANEL,
    query: () => { if (!studio) throw new Error(`no Label Studio checkout at ${STUDIO_DIR} (STUDIO_DIR= overrides)`); return '&new=1&studio=' + encodeURIComponent(studio); },
    async run(page, d) {
      await d.to(tile('Part Picker'), 700); await sleep(500); await d.click();
      await page.waitForFunction(() => { const p = window.__GEN2_PICKER__ && window.__GEN2_PICKER__(); return p && p.ready && !p.veil.hidden; }, null, { timeout: 60_000 });
      d.cut(MODAL);
      const frame = page.frameLocator('#ws-partpicker iframe');
      await frame.locator('.tile.has-img').first().waitFor({ timeout: 60_000 });
      await sleep(700);
      const at = async (loc) => { const r = await loc.boundingBox(); if (!r) throw new Error('no box'); return [r.x + r.width / 2, r.y + r.height / 2]; };
      for (const loc of [frame.locator('button.tile').filter({ hasText: /^Nuts$/ }).first(), frame.locator('#stage-panel button.tile[title="Hex nut"]'), frame.locator('#stage-panel button.thr[aria-label="M3"]')]) {
        await loc.waitFor({ timeout: 30_000 }); const [x, y] = await at(loc); await d.glide(x, y, 650); await sleep(300); await d.click(); await sleep(700);
      }
      const add = frame.locator('#add-parts', { hasText: /^Add 1 label to the planner/ });
      await add.waitFor({ timeout: 30_000 }); const [ax, ay] = await at(add); await d.glide(ax, ay, 700); await sleep(400); await d.click();
      await page.waitForFunction(() => window.__GEN2_PICKER__().veil.hidden, null, { timeout: 30_000 });
      d.cut(PANEL);
      await sleep(500);
      await d.to('#ws-labels .list .chip-l', 700); await sleep(1800);
    },
  },

  /* THE OTHER WORKSPACES' CLIPS (2026-10-23, Joey's eight), at 1280 x 800 so the desktop layout keeps its one toolbar row and
     every panel is whole. Two framings: a 700 x 321 window at the Labels clips' scale for a panel and the model's near side,
     and a 960 x 440 window (the Picker modal's half scale) where a panel and the whole model must both read. */
  'build-place': {   // a size tile, the amber spots, a click on the top one, the drawer landing; Esc ends placing
    size: DESK, crop: LIB_TOP,
    async run(page, d) {
      const before = await page.evaluate(() => window.__GEN2_VIEWER__.build.placed.length);
      await d.to('#ws-lib .size:not(.dis):has-text("2W·1H")', 800); await sleep(500); await d.click();
      await page.waitForFunction(() => window.__GEN2_VIEWER__.spotScreens().length, null, { timeout: 30_000 }); await sleep(1000);
      // the "+" on the top row nearest the model's middle (x 2 on the root kit)
      const top = await page.evaluate(() => window.__GEN2_VIEWER__.spotScreens().filter((m) => m.y === 0).sort((a, b) => Math.abs(a.sx - 640) - Math.abs(b.sx - 640))[0]);
      if (!top) throw new Error('no spot on the top row');
      await d.glide(top.sx, top.sy, 900);
      await page.waitForFunction(() => window.__GEN2_VIEWER__.spotScreens().some((m) => m.hovered), null, { timeout: 15_000 }); await sleep(400);
      await d.click();
      await page.waitForFunction((n) => window.__GEN2_VIEWER__.build.placed.length === n + 1 && !window.__GEN2_VIEWER__.regenBusy, before, { timeout: 90_000 });
      await sleep(1800);
      await page.keyboard.press('Escape'); await sleep(1000);
    },
  },
  'build-fill': {   // a 2W over a 1W leaves a red slot; the issue card is open: Fill all puts a 1W case in it
    size: DESK, crop: GAP,
    async setup(page) {
      await page.evaluate(() => window.__GEN2_STORE__.commit((s) => { s.gridH = 2; s.gridW = 2; s.placed = [{ id: 1, x: 0, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0 }, { id: 2, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0 }]; s.nextId = 3; }, 'edit'));
      await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 2 && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 });
      await page.click('#ws-dock .status'); await page.waitForSelector('#ws-issues:not([hidden])', { timeout: 15_000 });
      await sleep(800);
    },
    async run(page, d) {
      await sleep(1400);
      await d.to('[data-hint="build-fill"]', 900); await sleep(600); await d.click();
      await page.waitForFunction(() => window.__GEN2_VIEWER__.build.placed.length === 3 && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 });
      await sleep(2600);
    },
  },
  'build-sidecovers': {   // Build style's Side covers: Off takes the panels off the model, On brings them back; cut to the model each time
    size: DESK,
    /* the covers wear an orange of their own for the clip: in the kit's look they print in the case's black, and a black
       panel coming off a black wall cannot be seen at the bubble's size (the visitor's colours are switched on for it;
       Build shows the instruction colours until Colors is opened). The library scrolls as far as it can to the track,
       which sits low, so the panel framing is read from where the track lands (`this.lib`). */
    async setup(page) {
      await page.evaluate(() => { const v = window.__GEN2_VIEWER__, f = { name: 'Mystery Orange', hex: '#FF6A1A' }; v.setColor('SideCover', f); v.setColor('SideCover:FACE', f); v.setUseCustom(true); });
      // a short orbit, so the build's right side faces the camera: at the kit's own framing it is a sliver
      await page.mouse.move(860, 420); await page.mouse.down(); for (let i = 1; i <= 12; i++) { await page.mouse.move(860 - i * 9, 420 + i); await sleep(30); } await page.mouse.up();
      await sleep(900);
      await page.locator('#ws-lib [role=tab]:has-text("Build style")').click();
      await page.waitForSelector('[data-hint="build-sidecovers"]', { timeout: 15_000 });
      const track = await scrollTo(page, '[data-hint="build-sidecovers"]');
      this.lib = [20, Math.round(track.y + track.height / 2) - 240, 700, 321]; this.crop = this.lib;
      await sleep(600);
    },
    async run(page, d) {
      await d.to('[data-hint="build-sidecovers"] .seg:has-text("Off")', 800); await sleep(500); await d.click();
      d.cut(MODEL_D);
      await page.waitForFunction(() => window.__GEN2_STORE__.state.sideCovers === false && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 });
      await sleep(2200);
      await scrollTo(page, '[data-hint="build-sidecovers"]');   // the rebuilt library starts at its top
      await sleep(300);
      d.cut(this.lib);
      await d.to('[data-hint="build-sidecovers"] .seg:has-text("On")', 700); await sleep(500); await d.click();
      d.cut(MODEL_D);
      await page.waitForFunction(() => window.__GEN2_STORE__.state.sideCovers !== false && !window.__GEN2_VIEWER__.regenBusy, null, { timeout: 90_000 });
      await sleep(2200);
    },
  },
  'colors-browse': {   // the gallery: resting on a card shows the look on the model, a click opens it, Apply dresses the build
    size: DESK, crop: WIDE,
    async run(page, d) {
      await d.to('[data-hint="colors-browse"]', 800); await sleep(500); await d.click();
      await page.waitForSelector('#ws-gallery .lcard', { timeout: 30_000 }); await sleep(1200);
      await d.to('#ws-gallery .lcard >> nth=1', 700); await sleep(1300);
      await d.to('#ws-gallery .lcard >> nth=2', 600); await sleep(1300);
      await d.click(); await page.waitForSelector('#ws-gallery .apply', { timeout: 15_000 }); await sleep(900);
      await d.to('#ws-gallery .apply', 600); await sleep(400); await d.click(); await sleep(2000);
    },
  },
  'colors-surprise': {   // three looks under the rules; resting on one shows it, More like this rolls three more, Use this look keeps one
    size: DESK, crop: WIDE_LOW,
    async run(page, d) {
      await d.to('[data-hint="colors-surprise"]', 800); await sleep(500); await d.click();
      await page.waitForSelector('#ws-surprise .cand', { timeout: 30_000 }); await sleep(1200);
      await d.to('#ws-surprise .cand >> nth=1 >> .pick', 700); await sleep(1300);
      await d.to('#ws-surprise .cand >> nth=1 >> .like', 500); await sleep(300); await d.click(); await sleep(1500);
      await d.to('#ws-surprise .cand >> nth=0 >> .pick', 600); await sleep(1100);
      await d.to('#ws-surprise .cand >> nth=0 >> .keep', 500); await sleep(300); await d.click(); await sleep(1600);
    },
  },
  'colors-simplify': {   // Simplify: Down to 3 filaments, the list of what would change, Apply
    size: DESK, crop: SIMP,
    async run(page, d) {
      await d.to('[data-hint="colors-simplify"]', 800); await sleep(500); await d.click();
      await page.waitForSelector('#ws-simplify:not([hidden])', { timeout: 15_000 }); await sleep(1600);
      await d.to('#ws-simplify .tgt .seg:has-text("3 filaments")', 700); await sleep(400); await d.click(); await sleep(2000);
      await d.to('#ws-simplify .apply', 700); await sleep(400); await d.click(); await sleep(2400);
    },
  },
  'parts-track': {   // Track my build: the counters appear on every row, two rows ticked, then the dock's progress bar at half scale
    size: DESK, crop: LIST,
    async run(page, d) {
      await d.to('[data-hint="parts-track"]', 800); await sleep(500); await d.click();
      await page.waitForSelector('#ws-parts .counter', { timeout: 15_000 }); await sleep(1400);
      d.cut(ROWS);
      const plus = (row, field) => `#ws-parts .prow >> nth=${row} >> button[aria-label="${field}: one more"]`;
      await d.to(plus(0, 'printed'), 800); await sleep(300); await d.click(); await sleep(800); await d.click(); await sleep(1000);
      await d.to(plus(1, 'had'), 700); await sleep(300); await d.click(); await sleep(1200);
      d.cut(WIDE_DOCK);
      await sleep(2000);
    },
  },
  'assemble-camera': {   // a drag orbits the overview and lights the camera button; pressing it glides back to the guided view.
    size: DESK, crop: TOOLS, quality: 'fast', crf: 30,   // the fast tier (no shadows), so the orbit keeps up with the cursor; the whole frame moves, so a harder crf
    async run(page, d) {
      await sleep(400);
      await d.drag(900, 300, 770, 350, 350); await sleep(900);
      await page.waitForFunction(() => document.querySelector('#ws-tools .cam').classList.contains('on'), null, { timeout: 15_000 });
      await d.to('#ws-tools .cam', 800); await sleep(500); await d.click(); await sleep(2600);
    },
  },
};

/* frames through CDP: every repaint as a JPEG with its timestamp, acknowledged so the next one comes */
async function record(page, dir, name, [w, h] = [W, H]) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let n = 0;
  const onFrame = async (e) => {
    const f = join(dir, `${name}-${String(n++).padStart(4, '0')}.jpg`);
    frames.push({ f, ts: e.metadata.timestamp });
    await writeFile(f, Buffer.from(e.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 86, maxWidth: w, maxHeight: h, everyNthFrame: 1 });
  return { async stop() { await cdp.send('Page.stopScreencast').catch(() => {}); await sleep(150); cdp.off('Page.screencastFrame', onFrame); await cdp.detach().catch(() => {}); return frames; } };
}
function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' '));
}
/* the frames at their real timing (the concat demuxer's per-frame duration), then one H.264 at the bubble's size */
async function encodeFrames(frames, out, dir, name, crop = null, tail = 0.6, crf = 27) {
  if (!frames.length) throw new Error('no frames for ' + name);
  const list = join(dir, `${name}.txt`);
  let txt = '';
  /* the true gap, even sub-frame (fps=25 resamples): a floor would stretch the clip */
  for (let i = 0; i < frames.length; i++) { const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - frames[i].ts) : tail; txt += `file '${posix(frames[i].f)}'\nduration ${d.toFixed(3)}\n`; }
  txt += `file '${posix(frames[frames.length - 1].f)}'\n`;
  await writeFile(list, txt);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-an', '-vf', (crop ? `crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]},` : '') + 'scale=480:222,fps=25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(crf), '-movflags', '+faststart', out]);
}

const { chromium } = await import('playwright');
await mkdir(OUT, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
/* the Label Studio checkout beside this repo (its published Part Picker under parts/), as e2e/workspaces.mjs serves it */
const STUDIO_DIR = process.env.STUDIO_DIR || join(root, '..', 'GEN2 label-types', 'GEN2 EdgeLabel Label Generator');
const studioServer = existsSync(join(STUDIO_DIR, 'parts', 'js', 'embed.js')) ? await serve(STUDIO_DIR) : null;
const studio = studioServer ? `http://127.0.0.1:${studioServer.address().port}/` : null;
const browser = await (async () => { for (const o of [{ channel: 'chrome' }, {}]) { try { return await chromium.launch({ ...o, args: ['--enable-unsafe-swiftshader'] }); } catch {} } throw new Error('no Chromium'); })();
const work = join(tmpdir(), 'modulith-hint-clips');
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
try {
  if (only && !Object.keys(CLIPS).some((k) => k === only || k.startsWith(only + '-'))) throw new Error(`no clip ${only}; the keys are ${Object.keys(CLIPS).join(', ')}`);
  for (const [key, clip] of Object.entries(CLIPS)) {
    if (only && key !== only && !key.startsWith(only + '-')) continue;
    const size = clip.size || [W, H];   // the Labels clips keep the 1040 x 700 they were framed at; the 2026-10-23 clips use the one-row desktop layout at 1280 x 800
    const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
    await ctx.addInitScript((q) => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', q); localStorage.setItem('gen2-quality:set', '1'); } catch {} }, clip.quality || 'balanced');
    const page = await openPage(ctx, base, key.split('-')[0], clip.query ? clip.query() : '');
    if (clip.setup) await clip.setup(page);
    const d = await driver(page, size);
    await sleep(400);
    const rec = await record(page, work, key, size);
    await sleep(300);
    let frames;
    if (clip.popup) {
      const waiting = ctx.waitForEvent('page');
      await clip.run(page, d);
      const popup = await waiting;
      frames = await rec.stop();
      await popup.setViewportSize({ width: W, height: H });
      await popup.waitForLoadState('load').catch(() => {});
      const rec2 = await record(popup, work, key + '-studio');
      await popup.waitForTimeout(8500);
      const more = await rec2.stop();
      await ctx.close();
      // the tile's click (the panel framing), then the Studio as it opened (the whole tab), joined
      const a = join(work, `${key}-a.mp4`), b = join(work, `${key}-b.mp4`), list = join(work, `${key}-join.txt`);
      await encodeFrames(frames, a, work, key, clip.crop, 0.4);
      await encodeFrames(more, b, work, key + '-studio', STUDIO, 1.2);
      await writeFile(list, `file '${posix(a)}'
file '${posix(b)}'
`);
      ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', join(OUT, `${key}.mp4`)]);
      frames = frames.concat(more);
    } else {
      try { await clip.run(page, d); } catch (e) { await page.screenshot({ path: join(work, `${key}-failed.png`) }); console.error(`${key} failed; see ${join(work, `${key}-failed.png`)}`); throw e; }
      frames = await rec.stop();
      await ctx.close();
      if (d.cuts.length) {
        // the clip in segments, each framed by its own crop from its cut's moment, joined in order
        const bounds = [{ ts: -Infinity, crop: clip.crop }, ...d.cuts];
        const parts = [];
        for (let i = 0; i < bounds.length; i++) {
          const from = bounds[i].ts, to = i + 1 < bounds.length ? bounds[i + 1].ts : Infinity;
          const seg = frames.filter((f) => f.ts >= from && f.ts < to);
          if (!seg.length) continue;
          const out = join(work, `${key}-s${i}.mp4`); await encodeFrames(seg, out, work, `${key}-s${i}`, bounds[i].crop, i + 1 < bounds.length ? 0.001 : 0.6, clip.crf); parts.push(out);
        }
        const list = join(work, `${key}-join.txt`); await writeFile(list, parts.map((p) => `file '${posix(p)}'
`).join(''));
        ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', join(OUT, `${key}.mp4`)]);
      } else await encodeFrames(frames, join(OUT, `${key}.mp4`), work, key, clip.crop, 0.6, clip.crf);
    }
    const out = join(OUT, `${key}.mp4`);
    console.log(`wrote ${out} (${((await stat(out)).size / 1024).toFixed(0)} KB, ${frames.length} frames)`);
  }
} finally { await browser.close(); server.close(); if (studioServer) studioServer.close(); }
