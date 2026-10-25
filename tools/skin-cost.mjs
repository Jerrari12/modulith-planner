/* WHAT THE BAKED TOP LAYERS COST - a frame-time table per tier, the map on and off, and Very High's settle (2026-10-25).
 *
 *   GEN2_PARTS_LOCAL=1 node tools/skin-cost.mjs <out dir> [--kit 185-tabletop-2w2h] [--theme dark]
 *
 * Boots the kit once per tier (the tier pinned the way the goldens pin it), lets the maps land, then measures with the
 * maps on and off (the debug hook's skinMap.set): the MOVING frame, as the median animation-frame interval over a 90
 * frame orbit (an rAF loop the page runs; the controls' damping keeps the camera moving); and on Very High the SETTLE,
 * as the time from a camera stop to the accumulator's 24th sample, three times each. What is on the stage - the atlas
 * size, the scale, the nodes with maps - is recorded with the numbers. Writes <out>/cost.json and prints the table.
 * Numbers are this machine's (the GPU through Chrome); the method is what carries. */
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localParts } from '../test/lib/local-parts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const out = args[0];
if (!out) { console.error('usage: node tools/skin-cost.mjs <out dir> [--kit <id>] [--theme dark]'); process.exit(2); }
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const kit = opt('--kit', '185-tabletop-2w2h'), theme = opt('--theme', 'dark');
await mkdir(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };
const server = await new Promise((ok) => { const s = createServer(async (rq, rs) => { try { let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = join(root, p); await stat(f); rs.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }); rs.end(await readFile(f)); } catch { rs.writeHead(404); rs.end(); } }); s.listen(0, '127.0.0.1', () => ok(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('playwright');
const browser = localParts(await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] }), root);
const result = { kit, theme, viewport: [1600, 1000], dpr: 2, tiers: {} };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

for (const tier of ['veryhigh', 'high', 'balanced', 'fast']) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([th, t]) => { try { localStorage.setItem('gen2-theme', th); localStorage.setItem('gen2-theme:t', String(Date.now())); localStorage.setItem('gen2-quality', t); localStorage.setItem('gen2-quality:set', '1'); localStorage.setItem('skipgc', 't'); } catch {} }, [theme, tier]);
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(`${base}/index.html?build=${kit}&debug=1`, { waitUntil: 'load', timeout: 120000 });   // an official kit, the way the goldens open it
  await pg.waitForFunction(() => window.__GEN2_VIEWER__?.manifest && window.__GEN2_VIEWER__.skinMap, null, { timeout: 120000 });
  await pg.evaluate(() => { const v = window.__GEN2_VIEWER__; v.goTo(v.manifest.steps.length - 1, { animate: false }); });   // the finished build
  await pg.waitForTimeout(2500);
  if (tier === 'veryhigh') await pg.waitForFunction(() => { const s = window.__GEN2_VIEWER__.skinMap.status(); return s.loading.length === 0 && (Object.keys(s.slots).length > 0 || s.index === 0); }, null, { timeout: 90000 }).catch(() => {});
  const status = await pg.evaluate(() => window.__GEN2_VIEWER__.skinMap.status());
  const row = { quality: await pg.evaluate(() => window.__GEN2_VIEWER__.quality), status, on: {}, off: {} };
  for (const on of [true, false]) {
    const r = await pg.evaluate(async ({ on, tier }) => {
      const v = window.__GEN2_VIEWER__, T = v.THREE;
      v.skinMap.set(on);
      const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
      /* the orbit: 90 frames, the camera moved every frame around the build's centre */
      const c = v.buildCenter ? v.buildCenter.clone() : v.controls.target.clone();
      const r0 = v.camera.position.clone().sub(c); const radius = Math.hypot(r0.x, r0.z), y = r0.y;
      const deltas = [];
      await new Promise((done) => { let i = 0, last = performance.now(); const step = () => { const a = (i / 90) * Math.PI * 0.6; v.camera.position.set(c.x + radius * Math.sin(a), c.y + y, c.z + radius * Math.cos(a)); v.controls.target.copy(c); v.controls.update(); v.invalidateFrame(); const now = performance.now(); if (i > 5) deltas.push(now - last); last = now; if (++i < 90) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
      const sorted = [...deltas].sort((p, q) => p - q);
      const moving = { medianMs: sorted[Math.floor(sorted.length / 2)], p90Ms: sorted[Math.floor(sorted.length * 0.9)], frames: deltas.length };
      const out = { moving };
      if (tier === 'veryhigh') {
        const settles = [];
        for (let k = 0; k < 3; k++) {
          v.camera.position.x += 0.5 * (k % 2 ? -1 : 1); v.controls.update(); v.invalidateFrame();
          const t0 = performance.now();
          /* the accumulator restarts on the next frame: wait for its count to drop before timing its climb */
          while (performance.now() - t0 < 3000 && v.acc.n >= v.ACC_SAMPLES) await wait(8);
          while (performance.now() - t0 < 20000) { if (v.accWanted() && v.acc.ok && v.acc.n >= v.ACC_SAMPLES) break; await wait(16); }
          settles.push(performance.now() - t0);
        }
        out.settleMs = settles;
      }
      return out;
    }, { on, tier });
    row[on ? 'on' : 'off'] = r;
  }
  row.errors = errs.slice(0, 5);
  result.tiers[tier] = row;
  console.log(tier.padEnd(9), 'maps', Object.keys(status.slots).length, 'atlas', status.atlasPx, 'x', status.scale,
    '| moving on', row.on.moving.medianMs.toFixed(2), 'off', row.off.moving.medianMs.toFixed(2), 'ms',
    row.on.settleMs ? '| settle on ' + median(row.on.settleMs).toFixed(0) + ' off ' + median(row.off.settleMs).toFixed(0) + ' ms' : '', errs.length ? '| errors ' + errs.length : '');
  await ctx.close();
}
await writeFile(join(out, 'cost.json'), JSON.stringify(result, null, 1));
await browser.close(); server.close();
console.log('written', join(out, 'cost.json'));
