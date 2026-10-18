/* GEN2_PARTS_LOCAL=1: the browser harnesses read the part pools from THIS checkout instead of the parts host.
 *
 * The page asks the parts host (js/config.js ASSET_BASE) for every GLB and thumbnail, so a change that brings in new
 * parts cannot be seen in a browser until gen2-parts publishes them - and publishing is its own go. With this set, the
 * harnesses answer those requests from parts/ and img/parts/ here, the same pools the node tests already read (a
 * junction to a gen2-parts checkout locally, CI's second checkout there), so a planner branch and an unpublished
 * gen2-parts branch are checked together before either goes live. Off by default: the deploy gates then read the live
 * host, which is what a visitor reads. Added 2026-10-17 for the side covers.
 *
 * One call per browser, right after it launches: it wraps newContext and newPage, so every context a harness opens
 * (freshContext, a second window, a phone emulation) gets the route without each call site knowing. A file this
 * checkout lacks goes on to the real host, so a gap here reads exactly as it would live.
 */
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { ASSET_BASE } from '../../js/config.js';

export const PARTS_LOCAL = process.env.GEN2_PARTS_LOCAL === '1';
const MIME = { '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const PREFIX = new URL(ASSET_BASE).pathname;   // '/gen2-parts/'

export function localParts(browser, root) {
  if (!PARTS_LOCAL) return browser;
  const handler = async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const rel = normalize(path.startsWith(PREFIX) ? path.slice(PREFIX.length) : '').replace(/\\/g, '/');
    // only the two pools the page maps there (config.js assetUrl), never a path that climbs out of them
    if (!/^(img\/)?parts\//.test(rel) || rel.split('/').includes('..')) return route.continue();
    try {
      const body = await readFile(join(root, rel));
      return route.fulfill({ status: 200, body, headers: {
        'Content-Type': MIME[extname(rel).toLowerCase()] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',   // the page is on 127.0.0.1; the host answers every origin the same way
        'Cache-Control': 'no-store',
      } });
    } catch { return route.continue(); }
  };
  const pattern = ASSET_BASE + '**';
  const newContext = browser.newContext.bind(browser), newPage = browser.newPage.bind(browser);
  browser.newContext = async (o) => { const c = await newContext(o); await c.route(pattern, handler); return c; };
  browser.newPage = async (o) => { const p = await newPage(o); await p.route(pattern, handler); return p; };
  console.log(`[local parts] ${ASSET_BASE} answered from ${root}`);
  return browser;
}
