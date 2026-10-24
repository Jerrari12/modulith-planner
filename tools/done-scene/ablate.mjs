/**
 * THE ABLATION: what each feature of the Done scene costs in frame time, per tier, against what it looks like without it
 * (Joey, 2026-10-24: "like going through the settings in a PC game and seeing what settings kill fps and which ones have
 * a noticeable improvement visibly enough to keep"). For every (tier, feature) a FRESH page enters the scene the way a
 * visitor does (the End page, "Watch the final scene"), its clock is stopped on the hero, the feature is turned off in
 * the page, a screenshot is taken, and then frames are FORCED for a window: a requestAnimationFrame loop that nudges the
 * camera by a hundredth of a millimetre (invisible, but motion, so Very High measures its moving frame and not its
 * accumulation) and invalidates the stage every frame, with Chrome's frame-rate cap and vsync off, so the mean interval
 * is the frame's own cost rather than the display's refresh. The draw calls and triangles per frame come from the
 * renderer's counters over the same frames.
 *
 * ⚠ ONE PAGE PER MEASUREMENT, NOT ONE PAGE PER TIER. The first version toggled every feature in one page and the state
 * drifted: rows late in the run were slower with a feature removed than the baseline with everything on, and a tier
 * re-apply (setQuality) changed more than the flag it was asked to change. Hence the fresh page each time, and the
 * `control` row (the tier re-applied with nothing changed), which the setQuality-based rows are read against.
 *
 * ⚠ THE CLOCK IS FRAME-BOUNDED. The first passes timed the window from the call to 50 ms after the last frame, which
 * on SwiftShader (a frame a second, 13 frames a window) put up to a frame of slack and the settle into every row
 * (Sol 01a16cb6). Now each tick records the animation frame's timestamp and the stage's own count of frames drawn, and
 * the per-frame figure is the time from the first warm tick to the last tick over the frames drawn between them.
 * `--repeat N` runs every row N times in N fresh pages and prints the median and the spread, which is the noise floor.
 *
 *   node tools/done-scene/ablate.mjs [--kit 185-tabletop-2w2h] [--tiers veryhigh,high,balanced,fast] [--soft] [--throttle 4]
 *                                    [--features a,b,c] [--repeat 3] [--entry scene|studio] [--tag name]
 *                                    [--out D:/Claude - Output/done-scene-2026-10-23/perf] [--window 4000] [--dpr 2]
 *
 * --soft runs Chrome on SwiftShader (the no-GPU proxy); --throttle 4 slows the CPU 4x through DevTools (the earlier
 * benchmarking's stress proxy); the default is this machine's GPU, headless. --entry studio measures the Colors
 * workspace's studio instead of the scene, the same build, the same method: the planner's own frame for comparison.
 * Writes <out>/<backend>[-studio][-tag]-<tier>-<feature>[-rN].png, <out>/<backend>[-studio][-tag].json (the rows) and
 * ...-summary.json (per tier and feature: median, min, max over the repeats); prints both as markdown. Numbers are per
 * machine and for the report, not a gate.
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const KIT = arg('--kit', '185-tabletop-2w2h');
const TIERS = arg('--tiers', 'veryhigh,high,balanced,fast').split(',');
const ONLY = arg('--features', '').split(',').filter(Boolean);
const SOFT = process.argv.includes('--soft');
const OUT = arg('--out', 'D:/Claude - Output/done-scene-2026-10-23/perf');
const THROTTLE = +arg('--throttle', 1);   // a CPU slowdown through DevTools (Emulation.setCPUThrottlingRate): the earlier benchmarking's stress proxy was 4
const WINDOW = +arg('--window', SOFT ? 12000 : 4000);   // SwiftShader draws a frame in hundreds of ms, so its window is longer
const DPR = +arg('--dpr', 2);   // the window's screen scale: a headless window has none (1), a laptop panel has 2, so the frame is four times the pixels
const REPEAT = Math.max(1, +arg('--repeat', 1));
const ENTRY = arg('--entry', 'scene');   // 'scene' = the final scene; 'studio' = the Colors workspace's studio, for the planner's own frame
const TAG = arg('--tag', '');
const BACKEND = SOFT ? 'soft' : THROTTLE > 1 ? `gpu-cpu${THROTTLE}x` : 'gpu';
const NAME = `${BACKEND}${ENTRY === 'studio' ? '-studio' : ''}${TAG ? '-' + TAG : ''}`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.ico': 'image/x-icon' };
function serve() {
  const server = createServer(async (req, res) => {
    try {
      const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
      let file = join(root, rel === '' ? 'index.html' : rel);
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

/* The features, as in-page toggles run once in a fresh page with `v` = window.__GEN2_VIEWER__ and `q` = the tier.
   `tiers`: where the feature exists. `settle`: ms to wait after the toggle before the screenshot and the frames.
   `scene`: true for a toggle that needs the room (skipped under --entry studio). A toggle may return a plain object,
   recorded on the row as `note` (what it actually did: the crop's size, say). */
const INTERIOR = /Drawer_Stoppers|QuickLock|Magnet|DecorDrawer/;
const roundTrip = (v, q) => { const o = ['veryhigh', 'high', 'balanced', 'fast']; v.setQuality(o[Math.min(3, o.indexOf(q) + 1)], { user: true }); v.setQuality(q, { user: true }); };
const FEATURES = [
  { name: 'baseline', tiers: ['veryhigh', 'high', 'balanced', 'fast'], what: 'everything on, as shipped', off: () => {} },
  /* a tier's flags are read when the tier is APPLIED, and setQuality of the tier already on is a no-op, so a flag change
     goes through a round trip to the tier below and back (the room re-aims its lights on each, as it does for a visitor) */
  { name: 'control', tiers: ['veryhigh', 'high', 'balanced', 'fast'], what: 'the tier round-tripped with nothing changed (what the re-apply itself does to a frame)', settle: 2000,
    off: (v, q) => { const o = ['veryhigh', 'high', 'balanced', 'fast']; v.setQuality(o[Math.min(3, o.indexOf(q) + 1)], { user: true }); v.setQuality(q, { user: true }); } },
  { name: 'shadow', tiers: ['veryhigh', 'high', 'balanced'], what: 'the build\'s live shadow (the shadow-map pass)',
    off: (v) => { v.renderer.shadowMap.enabled = false; } },
  { name: 'ao', tiers: ['veryhigh', 'high'], what: 'the ambient-occlusion pass and its composite', settle: 2000,
    off: (v, q) => { v.QUALITY[q].ao = false; const o = ['veryhigh', 'high', 'balanced', 'fast']; v.setQuality(o[Math.min(3, o.indexOf(q) + 1)], { user: true }); v.setQuality(q, { user: true }); } },
  { name: 'reflect', tiers: ['veryhigh', 'high'], what: 'the reflection pass', settle: 2000,
    off: (v, q) => { v.QUALITY[q].reflect = false; const o = ['veryhigh', 'high', 'balanced', 'fast']; v.setQuality(o[Math.min(3, o.indexOf(q) + 1)], { user: true }); v.setQuality(q, { user: true }); } },
  { name: 'relief', tiers: ['veryhigh', 'high', 'balanced'], what: 'the layer-line relief detail on the parts', settle: 2000,
    off: (v, q) => { v.QUALITY[q].relief = false; const o = ['veryhigh', 'high', 'balanced', 'fast']; v.setQuality(o[Math.min(3, o.indexOf(q) + 1)], { user: true }); v.setQuality(q, { user: true }); } },
  { name: 'dpr1', tiers: ['veryhigh', 'high', 'balanced'], what: 'device pixel ratio 1 instead of the tier\'s', settle: 2000,
    off: (v, q) => { v.QUALITY[q].dpr = 1; const o = ['veryhigh', 'high', 'balanced', 'fast']; v.setQuality(o[Math.min(3, o.indexOf(q) + 1)], { user: true }); v.setQuality(q, { user: true }); } },
  { name: 'env', tiers: ['veryhigh', 'high', 'balanced'], what: 'the room as the build\'s environment map',
    off: (v) => { v.scene.environment = null; } },
  { name: 'masks', tiers: ['veryhigh', 'high', 'balanced', 'fast'], scene: true, what: 'the props\' shadow mask quads',
    off: (v) => { v.scene.traverse((o) => { if (o.userData.doneShadow) o.visible = false; }); } },
  { name: 'catchers', tiers: ['veryhigh', 'high', 'balanced'], scene: true, what: 'the desk and wall shadow catchers',
    off: (v) => { v.scene.traverse((o) => { if (o.isMesh && o.userData.doneRoom && o.material.isShadowMaterial) o.visible = false; }); } },
  /* the wall catcher alone (3000 x 1600 mm behind the desk), and the same catcher CUT to the box the build's shadow
     can reach: the build's box projected along the sun onto the wall's plane, 60 mm of margin, clamped to the catcher
     (what the planned crop would render; the screenshot shows whether the shadow still fits) */
  { name: 'wallCatcher', tiers: ['veryhigh', 'high', 'balanced'], scene: true, what: 'the wall shadow catcher alone off (the desk\'s kept)',
    off: (v) => { v.scene.traverse((o) => { if (o.isMesh && o.userData.doneRoom && o.material.isShadowMaterial && o.geometry.parameters.height > 1000) o.visible = false; }); } },
  { name: 'wallCrop', tiers: ['veryhigh', 'high', 'balanced'], scene: true, what: 'the wall catcher cut to the box the build\'s shadow can reach',
    off: (v) => {
      let wall = null; v.scene.traverse((o) => { if (o.isMesh && o.userData.doneRoom && o.material.isShadowMaterial && o.geometry.parameters.height > 1000) wall = o; });
      if (!wall) return { wall: 'none' };
      const V = v.sun.position.constructor;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const c of v.scene.children) if (c.userData.instanceId != null && c.visible) c.traverse((o) => {
        if (!o.isMesh || !o.visible) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], b.min.getComponent(k)); max[k] = Math.max(max[k], b.max.getComponent(k)); }
      });
      const sun = v.sun.getWorldPosition(new V()), tgt = v.sun.target ? v.sun.target.getWorldPosition(new V()) : new V();
      const d = sun.sub(tgt).normalize();   // toward the sun; a shadow ray runs the other way
      wall.updateWorldMatrix(true, false);
      const wp = wall.getWorldPosition(new V()), zw = wp.z, p = wall.geometry.parameters;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
        const t = (z - zw) / d.z; if (!(t > 0)) continue;   // the sun is in front of the wall: the ray from the point away from the sun meets the wall at t > 0
        const sx = x - d.x * t, sy = y - d.y * t; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      if (!(x1 > x0)) return { wall: 'no shadow reaches it' };
      const m = 60;
      x0 = Math.max(x0 - m, wp.x - p.width / 2); x1 = Math.min(x1 + m, wp.x + p.width / 2); y0 = Math.max(y0 - m, wp.y - p.height / 2); y1 = Math.min(y1 + m, wp.y + p.height / 2);
      const geo = new wall.geometry.constructor(x1 - x0, y1 - y0);
      wall.geometry.dispose(); wall.geometry = geo;
      wall.position.x += (x0 + x1) / 2 - wp.x; wall.position.y += (y0 + y1) / 2 - wp.y;
      return { was: [p.width, p.height], now: [Math.round(x1 - x0), Math.round(y1 - y0)], share: +(((x1 - x0) * (y1 - y0)) / (p.width * p.height)).toFixed(3) };
    } },
  { name: 'props', tiers: ['veryhigh', 'high', 'balanced', 'fast'], scene: true, what: 'the props (plant, monitor, mug, notebook, calipers) and their masks',
    off: (v) => { v.scene.getObjectByName('done-room').traverse((o) => { if (o.userData.slot) o.visible = false; }); v.scene.traverse((o) => { if (o.userData.doneShadow) o.visible = false; }); } },
  { name: 'room', tiers: ['veryhigh', 'high', 'balanced', 'fast'], scene: true, what: 'the whole room (the build alone on the stage\'s hold)',
    off: (v) => { v.scene.getObjectByName('done-room').visible = false; v.scene.traverse((o) => { if (o.userData.doneRoom || o.userData.doneShadow) o.visible = false; }); } },
  { name: 'build', tiers: ['veryhigh', 'high', 'balanced', 'fast'], what: 'the build (the room alone)',
    off: (v) => { for (const c of v.scene.children) if (c.userData.instanceId != null) c.visible = false; } },
  /* THE INTERIOR (Joey, 2026-10-24: "hiding drawer bodies after they are closed, since they will be covered by the
     faceplate anyway ... not having to have it cast shadows and compute all the things inside the build you can't
     actually see"): the parts invisible once the kit is assembled: the drawer stoppers, the QuickLocks, the magnets and
     their clips, the drawer bodies behind their faceplates. About 40 000 of the 185 2W2H kit's 102 000 triangles. */
  { name: 'interior', tiers: ['veryhigh', 'high', 'balanced', 'fast'], what: 'the parts hidden inside the assembled build (stoppers, QuickLocks, magnets, drawer bodies) not drawn',
    off: (v) => { const inner = new Set(v.manifest.instances.filter((i) => INTERIOR.test(i.node)).map((i) => i.id)); for (const c of v.scene.children) if (inner.has(c.userData.instanceId)) c.visible = false; v.renderer.shadowMap.needsUpdate = true; } },
  { name: 'interiorShadow', tiers: ['veryhigh', 'high', 'balanced'], what: 'the same parts drawn but casting no shadow',
    off: (v) => { const inner = new Set(v.manifest.instances.filter((i) => INTERIOR.test(i.node)).map((i) => i.id)); for (const c of v.scene.children) if (inner.has(c.userData.instanceId)) c.traverse((o) => { if (o.isMesh) o.castShadow = false; }); v.renderer.shadowMap.needsUpdate = true; } },
];
for (const f of FEATURES) f.off = f.off.toString().replace(/\bINTERIOR\b/g, INTERIOR.toString());   // the toggles run in the page: inline what they close over

const { chromium } = await import('playwright');
const { localParts } = await import('../../test/lib/local-parts.mjs');
await mkdir(OUT, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const args = ['--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit', ...(SOFT ? ['--disable-gpu', '--use-angle=swiftshader'] : [])];
const browser = await (async () => { for (const o of [{ channel: 'chrome' }, {}]) { try { return await chromium.launch({ ...o, args }); } catch { /* next */ } } throw new Error('no Chromium'); })();
localParts(browser, root);
const rows = [];

/* forced frames for `ms`: the camera nudged by 0.01 mm (alternating, so it never leaves its spot) and the stage
   invalidated every animation frame. Each tick records its timestamp, the frames the stage had drawn by then and the
   renderer's running call and triangle counts (autoReset off, so every pass of a frame counts); the row's figures come
   from the span between the first warm tick and the last tick, so no settle time and no partial frame is in them. */
const measure = (page, ms) => page.evaluate(async (ms) => {
  const v = window.__GEN2_VIEWER__, r = v.renderer;
  const ticks = []; let run = true, i = 0;
  r.info.autoReset = false;
  const tick = (t) => {
    if (!ticks.length) r.info.reset();
    ticks.push([t, v.idleStats().drawn, r.info.render.calls, r.info.render.triangles]);
    v.camera.position.x += (i++ % 2 ? 0.01 : -0.01); v.invalidateFrame();
    if (run) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  await new Promise((ok) => setTimeout(ok, ms));
  run = false;
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));   // the last scheduled tick lands, and the frame it asked for
  r.info.autoReset = true;
  const skip = ticks.length > 8 ? 3 : 1;   // warm-up
  const a = ticks[skip] || ticks[0], b = ticks[ticks.length - 1];
  const elapsed = b[0] - a[0], drawn = Math.max(1, b[1] - a[1]);
  const frames = []; for (let k = ticks.indexOf(a) + 1; k < ticks.length; k++) frames.push(ticks[k][0] - ticks[k - 1][0]);
  return { frames, drawn, ticks: frames.length, perFrame: +(elapsed / drawn).toFixed(2), calls: Math.round((b[2] - a[2]) / drawn), tris: Math.round((b[3] - a[3]) / drawn) };
}, ms);
const stats = (frames) => { const s = frames.slice().sort((a, b) => a - b); const mean = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length); return { mean: +mean.toFixed(2), median: +(s[Math.floor(s.length / 2)] || 0).toFixed(2), p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), n: frames.length }; };

/* the way in: the final scene as a visitor reaches it (the End page's button), the clock stopped on the hero; or the
   Colors workspace's studio with the same build, the stage at rest on its own view */
async function enter(page) {
  if (ENTRY === 'studio') {
    await page.goto(`${base}/index.html?ws=colors&build=${KIT}&debug=1`, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && window.__GEN2_VIEWER__.idleStats().drawn > 0, null, { timeout: 120_000 });
    await page.waitForTimeout(3000);
    return;
  }
  await page.goto(`${base}/index.html?ws=assemble&build=${KIT}&debug=1&done=room`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && document.querySelector('#ws-player'), null, { timeout: 120_000 });
  await page.locator('#ws-steps button:has-text("Skip to the finished build")').click();
  await page.waitForFunction(() => window.__GEN2_VIEWER__.cur === window.__GEN2_VIEWER__.pageCount - 2, null, { timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.locator('#ws-player button:has-text("Next")').click();
  await page.waitForFunction(() => /End of instructions/.test(document.querySelector('#ws-player .title')?.textContent || ''), null, { timeout: 20_000 });
  await page.locator('#ws-player button:has-text("Watch the final scene")').click();
  await page.waitForFunction(() => document.documentElement.dataset.done === 'room', null, { timeout: 90_000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { if (window.__GEN2_DONE__) window.__GEN2_DONE__.setTiming({ holdMs: 1e7 }); });   // the hero, held: a still camera under every measurement
  await page.waitForTimeout(1000);
}

for (let rep = 1; rep <= REPEAT; rep++) for (const tier of TIERS) for (const f of FEATURES) {
  if (!f.tiers.includes(tier) || (ONLY.length && !ONLY.includes(f.name)) || (ENTRY === 'studio' && f.scene)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: DPR });
  await ctx.addInitScript((t) => { try { localStorage.setItem('gen2-theme', 'dark'); localStorage.setItem('gen2-quality', t); localStorage.setItem('gen2-quality:set', '1'); } catch {} }, tier);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (THROTTLE > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE }); }
  try {
    await enter(page);
    const quality = await page.evaluate(() => window.__GEN2_VIEWER__.quality);
    const note = await page.evaluate(([src, q]) => { const r = new Function('v', 'q', 'return (' + src + ')(v, q)')(window.__GEN2_VIEWER__, q); window.__GEN2_VIEWER__.invalidateFrame(); return r == null ? null : JSON.parse(JSON.stringify(r)); }, [f.off, quality]);
    await page.waitForTimeout(f.settle || 500);
    const shot = `${NAME}-${tier}-${f.name}${REPEAT > 1 ? '-r' + rep : ''}.png`;
    await page.screenshot({ path: join(OUT, shot) });
    const m = await measure(page, WINDOW);
    const st = stats(m.frames);
    const state = await page.evaluate(() => { const v = window.__GEN2_VIEWER__; const q = v.QUALITY[v.quality]; return { dpr: v.renderer.getPixelRatio(), shadow: v.renderer.shadowMap.enabled, ao: v.aoWanted ? !!v.aoWanted() : null, aoFlag: !!q.ao, refl: !!q.reflect, accum: !!q.accum, relief: v.reliefWanted ? !!v.reliefWanted() : null, env: !!v.scene.environment, fxDead: v.fxDead ? Object.keys(v.fxDead).filter((k) => v.fxDead[k]) : [], buffer: [v.renderer.domElement.width, v.renderer.domElement.height] }; });
    const row = { backend: BACKEND, entry: ENTRY, rep, tier: quality, feature: f.name, what: f.what, perFrameMs: m.perFrame, medianMs: st.median, meanMs: st.mean, p95Ms: st.p95, fps: +(1000 / m.perFrame).toFixed(1), frames: m.drawn, ticks: m.ticks, calls: m.calls, tris: m.tris, ...state, note, shot, errors: errors.length };
    rows.push(row);
    const fl = `${state.shadow ? 'S' : '-'}${state.ao ? 'A' : state.aoFlag ? 'a' : '-'}${state.refl ? 'R' : '-'}${state.relief ? 'L' : '-'}${state.env ? 'E' : '-'} dpr${state.dpr}${state.fxDead.length ? ' dead:' + state.fxDead.join(',') : ''}`;
    console.log(`${NAME} r${rep} ${quality.padEnd(8)} ${f.name.padEnd(14)} per frame ${String(m.perFrame).padStart(7)} ms  median ${String(st.median).padStart(7)}  p95 ${String(st.p95).padStart(7)}  ${String(row.fps).padStart(6)} fps  frames ${String(m.drawn).padStart(4)}/${String(m.ticks).padEnd(4)} calls ${String(m.calls).padStart(4)}  tris ${String(m.tris).padStart(7)}  ${fl}${note ? '  ' + JSON.stringify(note) : ''}${errors.length ? '  ERRORS ' + errors.length : ''}`);
  } catch (e) {
    console.log(`${NAME} r${rep} ${tier} ${f.name}: FAILED ${String(e.message).split('\n')[0].slice(0, 120)}`);
    rows.push({ backend: BACKEND, entry: ENTRY, rep, tier, feature: f.name, what: f.what, failed: String(e.message).split('\n')[0].slice(0, 200) });
  }
  await ctx.close();
}
await browser.close(); server.close();
await writeFile(join(OUT, `${NAME}.json`), JSON.stringify(rows, null, 1));

/* the summary: per tier and feature, the median per-frame time over the repeats and its spread (min, max), plus the
   change against that tier's baseline median; the baseline's own spread is the noise floor to read every row against */
const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const groups = new Map();
for (const r of rows) { if (r.failed) continue; const k = `${r.tier}\u0000${r.feature}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
const summary = [];
for (const [k, rs] of groups) {
  const [tier, feature] = k.split('\u0000'); const xs = rs.map((r) => r.perFrameMs);
  summary.push({ tier, feature, n: xs.length, medianMs: +med(xs).toFixed(2), minMs: Math.min(...xs), maxMs: Math.max(...xs), calls: Math.round(med(rs.map((r) => r.calls))), tris: Math.round(med(rs.map((r) => r.tris))), dpr: rs[0].dpr, note: rs[0].note || null });
}
for (const s of summary) { const b = summary.find((x) => x.tier === s.tier && x.feature === 'baseline'); s.deltaPct = b && b.medianMs ? +((s.medianMs / b.medianMs - 1) * 100).toFixed(1) : null; }
await writeFile(join(OUT, `${NAME}-summary.json`), JSON.stringify(summary, null, 1));
const where = SOFT ? 'SwiftShader (the no-GPU proxy)' : THROTTLE > 1 ? `this machine's GPU with the CPU throttled ${THROTTLE}x` : 'this machine\'s GPU';
console.log(`\n${where}, headless, 1280x800 at screen scale ${DPR}, dark theme, kit ${KIT}, ${ENTRY === 'studio' ? 'the Colors studio' : 'the final scene on the hero'}, frame cap and vsync off; a fresh page per row, ${REPEAT} page(s) per (tier, feature); ${WINDOW} ms of forced frames (the camera nudged 0.01 mm a frame) per row; perFrame = first warm tick to last tick over the frames drawn between them`);
const cols = ['rep', 'tier', 'feature', 'perFrameMs', 'medianMs', 'p95Ms', 'fps', 'frames', 'ticks', 'calls', 'tris', 'dpr', 'shadow', 'ao', 'aoFlag', 'refl', 'relief', 'env', 'fxDead'];
console.log('| ' + cols.join(' | ') + ' |');
console.log('|' + cols.map(() => '---').join('|') + '|');
for (const r of rows) console.log('| ' + cols.map((c) => r[c] ?? '').join(' | ') + ' |');
if (REPEAT > 1) {
  console.log('\nSUMMARY (median over repeats; min–max is the spread; Δ against the tier\'s baseline median)');
  console.log('| tier | feature | n | median ms | min | max | Δ % | calls | tris | note |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const s of summary) console.log(`| ${s.tier} | ${s.feature} | ${s.n} | ${s.medianMs} | ${s.minMs} | ${s.maxMs} | ${s.deltaPct ?? ''} | ${s.calls} | ${s.tris} | ${s.note ? JSON.stringify(s.note) : ''} |`);
}
