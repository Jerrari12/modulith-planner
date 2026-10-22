/* THE HOVER-HINT CLIPS, recorded from the app itself (Joey, 2026-10-13: a 10-15 s recording of the planner in use, as the
   3D Printopia clip was; the SVG scenes are the placeholders until these exist). Headless Chrome drives the Labels workspace
   with a drawn cursor the way a visitor would while Chrome's screencast (CDP Page.startScreencast: a JPEG per repaint, with
   its timestamp) records it; ffmpeg assembles the frames at their real timing, scales to the bubble's size and writes H.264
   MP4s under img/hints/ (the names js/workspaces/labels.js looks for; img/hints/README.md). Playwright's own recordVideo is
   not used: its ffmpeg download is unreachable from this machine, and the system ffmpeg is.

     node tools/hint-clips.mjs            -> img/hints/labels-{type,file,picker,fill,several}.mp4
     node tools/hint-clips.mjs fill       -> one clip

   Every clip runs against the local repo; the Part Picker clip also serves the Label Studio checkout beside it (STUDIO_DIR=
   overrides the path) for the modal, as the e2e suite does. */
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
async function driver(page) {
  let cx = W * 0.6, cy = H * 0.7;
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
  /* a cut: from this moment the clip is framed by `crop` (a 240:110 window); the frames are split on their timestamps and
     the segments joined, so one clip can follow a gesture from the panel into a modal and back (the Part Picker, 2026-10-20) */
  const cuts = [];
  const cut = (crop) => { cuts.push({ ts: Date.now() / 1000, crop }); };
  return { glide, click, to, type, put, centre, cut, cuts };
}
const tile = (text) => `#ws-labels .key.tile:has-text("${text}")`;
async function labelsPage(ctx, base, query = '') {
  const page = await ctx.newPage();
  await page.goto(`${base}/index.html?ws=labels&debug=1${query}`, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-labels .foot'), null, { timeout: 90_000 });
  await page.addStyleTag({ content: '#ws-hint { display: none !important; }' });   // the bubble must not appear in its own clip
  // EdgeLabel faceplates, so the drawers take labels: the switch loads parts, so wait for the record to say so
  await page.evaluate(() => { const btn = [...document.querySelectorAll('#ws-labels button')].find((b) => b.textContent.trim().startsWith('Switch to EdgeLabel')); if (btn) btn.click(); });
  await page.waitForFunction(() => window.__GEN2_STORE__.state.faceStyle === 'edgelabel', null, { timeout: 90_000 });
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

/* each clip: { setup?(page), run(page, d), popup?, crop }; the recording starts just before run(). `crop` [x, y, w, h] frames the
   subject at the bubble's 240:110 (the panel with the model beside it; for Fill and Place several the model with the panel's edge) */
const PANEL = [20, 215, 700, 321], MODEL = [330, 200, 620, 284], BOTH = [20, 180, 760, 348], STUDIO = [0, 40, 700, 321], MODAL = [18, 18, 1004, 460];   // MODAL: the Part Picker frame's top (the steps bar, the family and type tiles) inside the modal's 18 px inset   // tighter than the frame: the bubble is 248 px wide, so the gesture must read
const CLIPS = {
  type: {
    crop: PANEL,
    async run(page, d) {
      await d.to(tile('Type a label'), 700); await sleep(500); await d.click(); await sleep(500);
      await d.type('M3 screws'); await sleep(600);
      await d.to('#ws-modal .btns .key.on', 500); await sleep(250); await d.click(); await sleep(900);
      await d.to('#ws-labels .list .chip-l', 600); await sleep(1800);
    },
  },
  file: {
    crop: PANEL,
    async run(page, d) {
      const fixture = join(tmpdir(), 'modulith-hint-labels.json');
      await writeFile(fixture, JSON.stringify({ format: 'modulith-labels', version: 1, labels: [{ text: 'M4 × 16 SHCS' }, { text: 'Hex keys' }, { text: 'Coffee filters' }] }));
      const chooser = page.waitForEvent('filechooser');
      await d.to(tile('From a file'), 700); await sleep(500); await d.click();
      await (await chooser).setFiles(fixture); await sleep(900);
      await d.to('#ws-labels .list .chip-l', 600); await sleep(600);
      await d.to('#ws-labels .list .item:nth-child(3) .chip-l', 500); await sleep(1800);
      await rm(fixture, { force: true });
    },
  },
  fill: {
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
  several: {
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
  picker: {
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
};

/* frames through CDP: every repaint as a JPEG with its timestamp, acknowledged so the next one comes */
async function record(page, dir, name) {
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 86, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  return { async stop() { await cdp.send('Page.stopScreencast').catch(() => {}); await sleep(150); cdp.off('Page.screencastFrame', onFrame); await cdp.detach().catch(() => {}); return frames; } };
}
function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' '));
}
/* the frames at their real timing (the concat demuxer's per-frame duration), then one H.264 at the bubble's size */
async function encodeFrames(frames, out, dir, name, crop = null, tail = 0.6) {
  if (!frames.length) throw new Error('no frames for ' + name);
  const list = join(dir, `${name}.txt`);
  let txt = '';
  /* the true gap, even sub-frame (fps=25 resamples): a floor would stretch the clip */
  for (let i = 0; i < frames.length; i++) { const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - frames[i].ts) : tail; txt += `file '${posix(frames[i].f)}'\nduration ${d.toFixed(3)}\n`; }
  txt += `file '${posix(frames[frames.length - 1].f)}'\n`;
  await writeFile(list, txt);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-an', '-vf', (crop ? `crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]},` : '') + 'scale=480:222,fps=25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '27', '-movflags', '+faststart', out]);
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
  for (const [key, clip] of Object.entries(CLIPS)) {
    if (only && key !== only) continue;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', 'balanced'); localStorage.setItem('gen2-quality:set', '1'); } catch {} });
    const page = await labelsPage(ctx, base, clip.query ? clip.query() : '');
    if (clip.setup) await clip.setup(page);
    const d = await driver(page);
    await sleep(400);
    const rec = await record(page, work, key);
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
      ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', join(OUT, `labels-${key}.mp4`)]);
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
          const out = join(work, `${key}-s${i}.mp4`); await encodeFrames(seg, out, work, `${key}-s${i}`, bounds[i].crop, i + 1 < bounds.length ? 0.001 : 0.6); parts.push(out);
        }
        const list = join(work, `${key}-join.txt`); await writeFile(list, parts.map((p) => `file '${posix(p)}'
`).join(''));
        ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', join(OUT, `labels-${key}.mp4`)]);
      } else await encodeFrames(frames, join(OUT, `labels-${key}.mp4`), work, key, clip.crop);
    }
    const out = join(OUT, `labels-${key}.mp4`);
    console.log(`wrote ${out} (${((await stat(out)).size / 1024).toFixed(0)} KB, ${frames.length} frames)`);
  }
} finally { await browser.close(); server.close(); if (studioServer) studioServer.close(); }
