/* GOLDEN SCREENSHOTS OF THE STAGE - the guard for changes that must not move a pixel.
 *
 * Phase 0 of the planner merge wraps js/main.js into a factory and later carves it into
 * modules. None of that is allowed to change the picture, and the unit suite cannot see a
 * pixel. This tool opens every official kit in headless Chromium at two quality tiers, drives
 * it to three pages (the cover, a middle step, the finished build) through the ?debug=1 hook,
 * and screenshots the WebGL canvas. `--update` writes the goldens; without it, each shot is
 * compared against its golden and the run fails if any differs in more than THRESHOLD of its
 * pixels (per-channel tolerance TOL, so compression and gradient noise do not count).
 *
 * Determinism: before a shot is taken the page is sampled twice, 400 ms apart, and the shot
 * only counts as settled when the two samples agree. A capture that never settles, whose Very
 * High accumulation never converged, that drew on a different tier than asked, or that came
 * from a page with an uncaught error is INVALID: it fails the run, and --update refuses to
 * bless it. A missing golden fails a compare run too; only --update writes goldens.
 *
 * Usage:  node tools/golden-shots.mjs [--update] [--kits 185-tabletop-2w2h,...] [--tiers veryhigh,fast]
 *         npm run goldens            (compare)      npm run goldens -- --update   (re-bless)
 *
 * The PNGs are compared inside the browser (two <canvas> drawImage calls and a pixel loop), so
 * this needs nothing beyond playwright, which the smoke test already needs.
 */
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'test', 'golden', 'shots');
const THRESHOLD = 0.001;   // fraction of pixels allowed to differ
const TOL = 8;             // per-channel difference that counts as "different"
const VIEWPORT = { width: 1200, height: 800 };

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const UPDATE = flag('--update');
const TIERS = opt('--tiers', 'veryhigh,fast').split(',');
const STATES = ['cover', 'mid', 'end'];

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp',
};
function serve() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = join(root, p);
      const s = await stat(f);
      const body = await readFile(s.isDirectory() ? join(f, 'index.html') : f);
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function launch(chromium) {
  const a = ['--enable-unsafe-swiftshader'];
  for (const o of [{ channel: 'chrome', args: a }, { args: a }]) {
    try { return await chromium.launch(o); } catch { /* next */ }
  }
  throw new Error('no browser: install Chrome, or run `npx playwright install chromium`');
}

/* a canvas-only PNG, taken once the stage reports a mounted manifest and a drawn frame */
async function waitMounted(page) {
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest
    && document.querySelector('canvas') && document.querySelector('canvas').width > 0, null, { timeout: 90_000 });
  await page.waitForFunction(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))));
}
/* The WebGL canvas alone, read back inside a double requestAnimationFrame the way the smoke test's
   INSPECT does (the drawing buffer is still intact there, so no preserveDrawingBuffer is needed). An
   element screenshot would composite the step card and the panels on top, and those are chrome the
   later phases replace on purpose; the stage is what these goldens guard. */
async function shoot(page) {
  const url = await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
    done(document.querySelector('canvas').toDataURL('image/png'));
  }))));
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

/* fraction of pixels whose any channel differs by more than TOL; computed in a blank tab */
async function diff(tab, a, b) {
  return tab.evaluate(async ([pa, pb, tol]) => {
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const [ia, ib] = await Promise.all([load(pa), load(pb)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: true, frac: 1 };
    const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const da = px(ia), db = px(ib);
    let bad = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (Math.abs(da[i] - db[i]) > tol || Math.abs(da[i + 1] - db[i + 1]) > tol || Math.abs(da[i + 2] - db[i + 2]) > tol) bad++;
    }
    return { frac: bad / (da.length / 4), pixels: da.length / 4 };
  }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`, TOL]);
}

/* two samples 400 ms apart must agree; up to 12 tries, then the state is reported unstable */
async function settled(page, tab) {
  let prev = await shoot(page);
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(400);
    const next = await shoot(page);
    const d = await diff(tab, prev, next);
    if (d.frac <= THRESHOLD) return { png: next, stable: true, tries: i + 1 };
    prev = next;
  }
  return { png: prev, stable: false, tries: 12 };
}

async function main() {
  const { chromium } = await import('playwright');
  const kits = opt('--kits', null)?.split(',')
    ?? (await readdir(join(root, 'builds'))).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -5));
  await mkdir(OUT, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch(chromium);
  const rows = [];
  let failed = 0;
  try {
    const tab = await browser.newPage();   // the comparison scratch tab
    for (const tier of TIERS) {
      for (const kit of kits) {
        /* ⚠ A FRESH CONTEXT PER KIT. The app remembers things in localStorage (panel state among them), and
           the dimension callouts pick the side the panels leave free - so a kit opened after another kit in
           the same context drew its finished build with the callouts on the other side (0.12% of pixels,
           measured 2026-10-12). Every shot starts from a clean browser, which is also what a single-kit
           run gets, so goldens and spot checks agree. */
        const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'reduce' });
        /* an EXPLICIT pick (the :set marker) locks the tier; a session value is only a hint the auto-downgrade
           overrides within seconds on a software rasteriser, which made Very High shots differ run to run */
        await ctx.addInitScript((t) => { try { localStorage.setItem('gen2-quality', t); localStorage.setItem('gen2-quality:set', '1'); } catch {} }, tier);
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`${base}/index.html?build=${kit}&debug=1`, { waitUntil: 'load', timeout: 90_000 });
        await waitMounted(page);
        const steps = await page.evaluate(() => window.__GEN2_VIEWER__.manifest.steps.length);
        const pageFor = { cover: 0, mid: 1 + Math.floor(steps / 2), end: steps };
        for (const state of STATES) {
          if (state !== 'cover') {
            await page.evaluate((i) => window.__GEN2_VIEWER__.goTo(i, { animate: false }), pageFor[state]);
            await page.waitForTimeout(600);
          }
          /* Very High accumulates jittered samples at rest and only the converged mean is deterministic */
          const converged = await page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.quality !== 'veryhigh' || (h.acc && h.acc.n >= h.ACC_SAMPLES); }, null, { timeout: 30_000 }).then(() => true, () => false);
          const drawing = await page.evaluate(() => window.__GEN2_VIEWER__.quality);
          const s = await settled(page, tab);
          const name = `${kit}--${state}--${tier}.png`;
          const file = join(OUT, name);
          const row = { name, stable: s.stable && converged && drawing === tier, tries: s.tries, errors: errors.length };
          /* ⚠ A CAPTURE THAT IS NOT SETTLED, NOT CONVERGED, NOT ON THE TIER IT ASKED FOR, OR TAKEN ON A PAGE
             THAT THREW IS NOT EVIDENCE. It fails the run either way, and --update refuses to bless it: a
             golden made from an invalid capture would approve whatever it happened to show (Sol, 01a131c7). */
          const invalid = !row.stable || errors.length > 0;
          if (invalid) failed++;
          if (UPDATE) {
            if (invalid) row.result = 'REFUSED';
            else { await writeFile(file, s.png); row.result = 'written'; }
          } else if (!existsSync(file)) {
            /* a missing golden is a failure, never a silent self-bless: compare mode must compare */
            failed++; row.result = 'MISSING';
            await writeFile(join(OUT, name.replace(/\.png$/, '.actual.png')), s.png);
          } else {
            const d = await diff(tab, await readFile(file), s.png);
            row.frac = d.frac;
            row.result = d.frac <= THRESHOLD ? 'ok' : 'DIFF';
            if (row.result === 'DIFF') { failed++; await writeFile(join(OUT, name.replace(/\.png$/, '.actual.png')), s.png); }
          }
          rows.push(row);
          console.log(`${row.result.padEnd(13)} ${name.padEnd(44)} ${row.frac == null ? '' : (row.frac * 100).toFixed(3) + '%'}${row.stable ? '' : '  UNSTABLE'}${drawing === tier ? '' : '  tier=' + drawing}${converged ? '' : '  not-converged'}${errors.length ? '  pageerrors:' + errors.length : ''}`);
        }
        await page.close();
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  const unstable = rows.filter((r) => !r.stable).length;
  const missing = rows.filter((r) => r.result === 'MISSING').length;
  console.log(`\n${rows.length} shots, ${rows.filter((r) => r.result === 'DIFF').length} differ, ${missing} missing, ${unstable} unstable or errored${UPDATE ? ' (valid goldens written to test/golden/shots)' : ''}; exit ${failed ? 1 : 0}`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
