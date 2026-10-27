/* PROOF SHOTS OF THE BAKED TOP LAYERS - the planner at Very High, a part framed close, the map on and off (2026-10-25).
 *
 *   GEN2_PARTS_LOCAL=1 node tools/skin-shots.mjs <out dir> [--scenes edgelabel,covers,drawer] [--theme dark] [--look black]
 *
 * Serves this checkout, answers the parts host from parts/ (test/lib/local-parts.mjs, so the maps under parts/skin/
 * are the ones in the gen2-parts checkout beside it), loads each scene's build at Very High, waits for the skin maps
 * to land, frames the part from its meshes, settles the accumulator and screenshots the canvas - then turns the maps
 * off (the debug hook's skinMap.set(false)), nudges the camera so the accumulator restarts, settles and shoots again.
 * Writes <out>/<scene>-<framing>-{on,off}.png and <out>/status.json (what the stage loaded, the atlas, the timings).
 * Pane screenshots fail on this machine (memory pane-screenshots-playwright); this is the house route to a picture. */
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localParts } from '../test/lib/local-parts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const out = args[0];
if (!out) { console.error('usage: node tools/skin-shots.mjs <out dir> [--scenes a,b] [--theme dark] [--look black]'); process.exit(2); }
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const theme = opt('--theme', 'dark'), lookKey = opt('--look', 'black');
const LOOKS = { black: 'The Jerrari', white: 'Tri-stripe racing white' };
await mkdir(out, { recursive: true });

/* each scene: the build record the stage loads, the node that must mount, the meshes to frame, and the framings (camera
   offsets from the framed box's centre, in mm, and the target's offset) */
const SCENES = {
  edgelabel: {
    build: { length: 185, placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, closure: 'magnet' }], nextId: 2, gridW: 2, gridH: 2, faceStyle: 'edgelabel' },
    node: /^Faceplate_EdgeLabel_2W-1H$/, frame: /^Faceplate_EdgeLabel/,
    framings: { plate: { at: [0, 0, 'top'], cam: [70, 45, 150] }, macro: { at: [-45, 6, 'top'], cam: [22, 14, 55] }, window: { at: [-20, -10, -12], cam: [10, 30, 70] } },
  },
  covers: {
    kit: '185-tabletop-2w2h',
    node: /^CL-185-/, frame: /^(CL|CU)-185-/,
    framings: { row: { at: [0, 0, 'top'], cam: [120, 160, 180] }, macro: { at: [-60, 0, 'top'], cam: [20, 40, 50] } },
  },
  drawer: {
    build: { length: 185, placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, closure: 'magnet' }], nextId: 2, gridW: 2, gridH: 2, faceStyle: 'essential' },
    node: /^DecorDrawer_185-2W-1H$/, frame: /^DecorDrawer_185/, pull: true,
    /* the rim's top skin: the drawer fully out, its back-right top corner seen from above and behind (the faceplate hides
       the front edge) */
    framings: { rim: { at: ['hi', 'hi', 'lo'], cam: [50, 60, -60] }, macro: { at: ['hi', 'hi', 'lo'], cam: [16, 22, -20] } },
  },
};
const scenes = (opt('--scenes', 'edgelabel') || '').split(',').filter((s) => SCENES[s]);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };
const server = await new Promise((ok) => { const s = createServer(async (rq, rs) => { try { let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = join(root, p); await stat(f); rs.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }); rs.end(await readFile(f)); } catch { rs.writeHead(404); rs.end(); } }); s.listen(0, '127.0.0.1', () => ok(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('playwright');
const browser = localParts(await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] }), root);
const status = { theme, look: lookKey, scenes: {} };

for (const name of scenes) {
  const sc = SCENES[name];
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([th]) => { try { localStorage.setItem('gen2-theme', th); localStorage.setItem('gen2-theme:t', String(Date.now())); localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1'); localStorage.setItem('skipgc', 't'); } catch {} }, [theme]);
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' || /skin map/.test(m.text())) errs.push(m.type() + ': ' + m.text()); });
  const t0 = Date.now();
  await pg.goto(sc.kit ? `${base}/index.html?build=${sc.kit}&debug=1` : `${base}/index.html?ws=build&debug=1`, { waitUntil: 'load', timeout: 120000 });   // an official kit opens the way the goldens open it
  /* a kit page has no planner store: wait for the stage alone there */
  await pg.waitForFunction((kit) => window.__GEN2_VIEWER__?.manifest && window.__GEN2_VIEWER__.skinMap && (kit || window.__GEN2_STORE__), !!sc.kit, { timeout: 120000 });
  await pg.waitForTimeout(2000);
  if (sc.build) {
    const ok = await pg.evaluate(async ({ build, node }) => {
      const st = window.__GEN2_STORE__, v = window.__GEN2_VIEWER__;
      const rec = JSON.parse(JSON.stringify(st.serialize()));
      const re = new RegExp(node);
      for (let attempt = 0; attempt < 4; attempt++) {
        st.load({ ...rec, ...build });
        if (attempt > 0) { await v.update(st.serialize()); v.skipToEnd(); }
        const t = performance.now();
        while (performance.now() - t < 8000) { if (v.manifest.instances.some((i) => re.test(i.node)) && v.instances.size === v.manifest.instances.length) break; await new Promise((r) => setTimeout(r, 200)); }
        await new Promise((r) => setTimeout(r, 1500));
        if (v.manifest.instances.some((i) => re.test(i.node))) return true;
      }
      return false;
    }, { build: sc.build, node: sc.node.source });
    if (!ok) throw new Error(`${name}: the node did not mount`);
  } else {
    await pg.evaluate(() => { const v = window.__GEN2_VIEWER__; v.goTo(v.manifest.steps.length - 1, { animate: false }); });   // the finished build, as the goldens' end page
    await pg.waitForTimeout(1500);
  }
  await pg.evaluate((n) => { const v = window.__GEN2_VIEWER__; const p = v.PRESETS && v.PRESETS.find((p) => p.name === n); if (p) v.applyPreset(p, { quiet: true }); }, LOOKS[lookKey]);
  /* the maps: wait for the node's slot */
  const loaded = await pg.waitForFunction((node) => { const s = window.__GEN2_VIEWER__.skinMap.status(); return Object.keys(s.slots).some((n) => new RegExp(node).test(n)) || Object.keys(s.failed).some((n) => new RegExp(node).test(n)); }, sc.node.source, { timeout: 60000 }).then(() => true, () => false);
  const st = await pg.evaluate(() => window.__GEN2_VIEWER__.skinMap.status());
  status.scenes[name] = { loaded, status: st, bootMs: Date.now() - t0, shots: {} };
  console.log(name, 'skin map status', JSON.stringify(st));
  if (sc.pull) await pg.evaluate(() => { const v = window.__GEN2_VIEWER__; for (const inst of v.instances.values()) if (/^(DecorDrawer|Faceplate|Handle|Label)/.test(inst.cfg.node)) inst.group.position.z += 200; v.invalidateFrame(); });   // the drawer and its front, fully out
  const settle = async () => { await pg.evaluate(async () => { const v = window.__GEN2_VIEWER__; const t0 = performance.now(); await new Promise((ok) => setTimeout(ok, 700)); while (performance.now() - t0 < 15000) { const accDone = !v.accWanted() || !v.acc.ok || v.acc.n >= v.ACC_SAMPLES; if (v.tweenCount === 0 && accDone) break; await new Promise((ok) => setTimeout(ok, 100)); } await new Promise((ok) => setTimeout(ok, 300)); }); };
  for (const [framing, f] of Object.entries(sc.framings)) {
    for (const on of [true, false]) {
      await pg.evaluate(async ({ frame, at, cam, on, nudge }) => {
        const v = window.__GEN2_VIEWER__, T = v.THREE;
        v.skinMap.set(on);
        const re = new RegExp(frame);
        const box = new T.Box3(); v.scene.traverse((o) => { if (o.isMesh && re.test(o.name || '')) box.expandByObject(o); });
        const cen = box.getCenter(new T.Vector3());
        const pick = (k, c, lo, hi) => (k === 'top' || k === 'hi' ? hi : k === 'lo' ? lo : typeof k === 'number' ? c + k : c);
        const t = new T.Vector3(pick(at[0], cen.x, box.min.x, box.max.x), pick(at[1], cen.y, box.min.y, box.max.y), pick(at[2], cen.z, box.min.z, box.max.z));
        v.controls.target.copy(t); v.camera.position.copy(t.clone().add(new T.Vector3(cam[0] + nudge, cam[1], cam[2])));
        v.camera.updateProjectionMatrix(); v.controls.update(); v.invalidateFrame();
        await new Promise((ok) => setTimeout(ok, 1200));
      }, { frame: sc.frame.source, at: f.at, cam: f.cam, on, nudge: 0 });   // invalidateFrame restarts the accumulator; a camera nudge would move the grain and inflate the on/off difference
      await settle();
      const samples = await pg.evaluate(() => ({ n: window.__GEN2_VIEWER__.acc.n, detail: window.__GEN2_VIEWER__.acc.detailCount, quality: window.__GEN2_VIEWER__.quality }));
      const file = `${name}-${framing}-${on ? 'on' : 'off'}.png`;
      await pg.screenshot({ path: join(out, file), clip: { x: 420, y: 90, width: 1180, height: 900 } });
      status.scenes[name].shots[file] = samples;
      console.log(' ', file, JSON.stringify(samples));
    }
  }
  status.scenes[name].errors = errs.slice(0, 10);
  if (errs.length) console.log('  messages', errs.slice(0, 6));
  await ctx.close();
}
await writeFile(join(out, 'status.json'), JSON.stringify(status, null, 1));
await browser.close(); server.close();
console.log('written', out);
