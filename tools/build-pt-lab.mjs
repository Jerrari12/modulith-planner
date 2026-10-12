/* Generate the path-tracing lab page from the REAL viewer index.html.
   ============================================================================
   The lab boots the ACTUAL app - real generator, real GLBs, real materials,
   real palette - and adds a path tracer beside it. Nothing about the scene is
   re-authored, so what the tracer renders is what we ship, and any difference
   is the renderer rather than a second scene description.

   ⚠ GENERATED. Re-run after any index.html change. Output lives under
   viewer/lab/, which is gitignored - same convention as render-lab and holo-lab.

     node tools/build-pt-lab.mjs
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = join(root);
const OUT = join(V, 'lab', 'pathtrace', 'index.html');
const fail = (m) => { console.error('BUILD FAILED: ' + m); process.exit(1); };

for (const p of ['lab/pathtrace/vendor/three-gpu-pathtracer.module.js',
                 'lab/pathtrace/vendor/three-mesh-bvh.module.js',
                 'lab/pathtrace/vendor/addons/postprocessing/Pass.js',
                 'lab/pathtrace/pt-lab.js'])
  if (!existsSync(join(V, p))) fail(`missing ${p}`);

let html = readFileSync(join(V, 'index.html'), 'utf8');

/* <base href="/"> so every relative path the app uses - parts/<L>/, css/,
   img/, js/ - resolves at the viewer root even though this page is three
   directories down. The dev server serves viewer/ as /, so this is exact. */
html = html.replace(/<head>/i, `<head>\n<base href="/">`);
if (!/<base href="\/">/.test(html)) fail('could not insert <base>');

/* Extend the import map. The path tracer imports `three` (ours), plus
   three-mesh-bvh and one three example module - all mapped explicitly because
   an import map cannot map a bare prefix onto arbitrary files. */
const before = html;
html = html.replace(/"three\/addons\/":\s*"\.\/vendor\/three\/addons\/"/,
  `"three/addons/": "/vendor/three/addons/",
    "three-mesh-bvh": "/lab/pathtrace/vendor/three-mesh-bvh.module.js",
    "three-gpu-pathtracer": "/lab/pathtrace/vendor/three-gpu-pathtracer.module.js",
    "three/examples/jsm/postprocessing/Pass.js": "/lab/pathtrace/vendor/addons/postprocessing/Pass.js"`);
if (html === before) fail('could not extend the import map - did index.html change shape?');
html = html.replace(/"three":\s*"\.\/vendor\/three\/three\.module\.js"/,
  `"three": "/vendor/three/three.module.js"`);

// analytics must never fire from a lab page
html = html.replace(/<script[^>]*data-goatcounter[\s\S]*?<\/script>/gi, '')
           .replace(/<script>window\.goatcounter[\s\S]*?<\/script>/gi, '');

// the app publishes its hook only under ?debug=1, and the hook is the whole handle
html = html.replace(/<\/head>/i,
  `<script>if (!/[?&]debug=1(&|$)/.test(location.search))
     location.replace(location.pathname + '?debug=1' + location.hash);</script>\n</head>`);

html = html.replace(/<\/body>/i,
  `<script type="module" src="/lab/pathtrace/pt-lab.js"></script>\n</body>`);

writeFileSync(OUT, html, 'utf8');
console.log(`wrote viewer/lab/pathtrace/index.html  (${(html.length / 1024).toFixed(0)} KB)`);
console.log('open  http://localhost:8123/lab/pathtrace/');
