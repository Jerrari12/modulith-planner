/* Build the portable single-file GEN2 benchmark.
   ============================================================================
   Emits ONE .html that runs the REAL viewer with no server, no network and no
   bundler runtime - so it opens straight off a USB stick on machines that
   cannot reach the LAN.

   ⚠ THE OUTPUT IS DERIVED, NEVER AUTHORED. Every byte of application logic in
   the bundle is read from viewer/ at build time. Nothing here rewrites app
   behaviour, so the bundle cannot drift into being a second renderer whose
   numbers describe itself - the failure mode part-material.js is vendored to
   avoid. The only transform applied to any source is rewriting RELATIVE import
   specifiers to bare ones, and that transform is counted and verified below.

   HOW IT RUNS WITHOUT A SERVER
   ---------------------------------------------------------------------------
   file:// blocks both ES-module imports and fetch. So:
     - every module's SOURCE is carried as a string, turned into a blob: URL at
       run time, and wired together by an import map injected before the first
       module load. The module graph stays exactly as it is on disk.
     - fetch is shimmed to serve the embedded kit JSON and GLBs. Anything the
       shim is asked for and does not have FAILS LOUDLY (404 + console error),
       because a quietly-missing part would render a lighter scene and produce
       numbers that look valid.

   ⚠ Relative specifiers must be rewritten because a blob: URL has no useful
   base path - './entry.js' inside a blob module resolves to a blob that does
   not exist. Bare specifiers go through the import map instead, which is why
   the rewrite exists at all.

     node tools/build-bench-bundle.mjs [outfile]
*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, posix } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = join(root);
const OUT = process.argv[2] || join(root, 'dist', 'gen2-bench.html');
const KIT = '185-tabletop-2w2h';

const read = (p) => readFileSync(p, 'utf8');
const fail = (m) => { console.error('BUILD FAILED: ' + m); process.exit(1); };

/* ---- 1. the module graph, DISCOVERED rather than listed -------------------
   Walking the real imports means a new module added to the app cannot be
   silently left out of the bundle (which would throw at run time, loudly - but
   discovering it here is better than discovering it on Joey's Surface Pro). */
/* The app's import map is `three` + the `three/addons/` PREFIX, and the addons
   import one another by that prefix too. An import map cannot map a prefix onto
   blob URLs (they are not hierarchical), so every addon actually reached is
   discovered here and mapped individually. BARE is filled as the walk finds
   them, which also means an addon the app stops using drops out on its own. */
const BARE = {};
function resolveBare(spec) {
  if (spec === 'three') return 'vendor/three/three.module.js';
  if (spec.startsWith('three/addons/')) return 'vendor/three/addons/' + spec.slice('three/addons/'.length);
  return null;
}

const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const modules = new Map();          // key -> { file, src, rewrites }
const keyFor = (relPath) => 'gen2:' + relPath.replace(/[\\/]/g, '__');

/* ⚠ SCAN THE CODE, NOT THE COMMENTS. three's addons carry JSDoc lines like
     * @three_import import * as BufferGeometryUtils from 'three/addons/...'
   which a statement-position regex happily matches - and the first build hit
   infinite recursion on a module "importing itself" out of its own docblock.
   Comments are stripped for the SCAN only; the emitted source is untouched. */
/* ⚠ A GLOBAL BLOCK-COMMENT STRIP IS NOT SAFE HERE, and the first attempt proved
   it: a non-greedy /* ... *(/) sweep over main.js swallowed its entire import
   block and the walk reported ONE module. Filtering by LINE instead is exact -
   every real import/export in this codebase sits at column 0, and the only
   thing that needs excluding is a JSDoc continuation line, which by definition
   begins with `*`. Nothing that is real code can be removed this way. */
function codeLines(src) {
  return src.split('\n')
    .filter((l) => { const t = l.trimStart(); return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')); })
    .join('\n');
}
function specifiersOf(src) {
  const out = [];
  let m;
  const code = codeLines(src);
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(code))) out.push(m[1] || m[2] || m[3]);
  return out;
}

function addModule(absFile) {
  const rel = posix.normalize(relative(V, absFile).replace(/\\/g, '/'));
  const key = keyFor(rel);
  if (modules.has(key)) return key;
  if (!existsSync(absFile)) fail(`module not found: ${absFile}`);
  modules.set(key, null);        // claim the slot BEFORE walking children - ES modules may be circular
  let src = read(absFile);
  const specs = specifiersOf(src);
  let rewrites = 0;

  for (const spec of specs) {
    if (spec.startsWith('./') || spec.startsWith('../')) {
      const child = resolve(dirname(absFile), spec);
      const childKey = addModule(child);
      /* Replace ONLY the quoted specifier, both quote styles, and count it. */
      for (const q of ['"', "'"]) {
        const from = q + spec + q, to = q + childKey + q;
        let i = 0;
        while ((i = src.indexOf(from, i)) !== -1) { src = src.slice(0, i) + to + src.slice(i + from.length); i += to.length; rewrites++; }
      }
    } else {
      const target = resolveBare(spec);
      if (!target) fail(`unknown import specifier ${JSON.stringify(spec)} in ${rel} - it would 404 at run time`);
      BARE[spec] = target;
      addModule(join(V, target));           // reached via the import map, no rewrite
    }
  }

  /* VERIFY the rewrite rather than trust the regex. Terra's objection: a regex
     over import statements can miss `export ... from`, a dynamic import(), a
     side-effect import or a `new URL(..., import.meta.url)`. So after
     rewriting, NO relative specifier may remain anywhere in the file. */
  const left = specifiersOf(src).filter((s) => s.startsWith('./') || s.startsWith('../'));
  if (left.length) fail(`relative specifier survived the rewrite in ${rel}: ${left.join(', ')}`);
  if (/new\s+URL\s*\(\s*['"][^'"]*['"]\s*,\s*import\.meta\.url/.test(src))
    fail(`${rel} builds a URL from import.meta.url - that resolves against a blob: and will break. Handle it explicitly.`);

  modules.set(key, { file: rel, src, rewrites });
  return key;
}

const MAIN = addModule(join(V, 'js', 'main.js'));
for (const [k, m] of modules) if (!m) fail('placeholder module never resolved: ' + k);
console.log(`modules: ${modules.size}`);
for (const [k, m] of modules) if (m.rewrites) console.log(`  rewrote ${m.rewrites} specifier(s) in ${m.file}`);

/* ---- 2. classic scripts that MUST precede the module graph ---------------
   generate.js throws unless globalThis.GEN2_REQ and GEN2_TABLETOP are already
   set by these two vendored contracts. index.html loads them as classic
   scripts before main.js; the bundle must preserve that ordering. */
const CLASSIC = ['js/vendor/requirement-scope.js', 'js/vendor/tabletop-completion.js']
  .map((p) => ({ p, src: read(join(V, p)) }));

/* ---- 3. assets ----------------------------------------------------------- */
const kitJson = JSON.parse(read(join(V, 'builds', `${KIT}.json`)));
const nodes = [...new Set(JSON.parse(read(join(root, 'test', 'golden', `${KIT}.manifest.json`))).instances.map((i) => i.node))].sort();
const assets = {};
let assetBytes = 0;
for (const n of nodes) {
  const f = join(V, 'parts', '185', `${n}.lib.glb`);
  if (!existsSync(f)) fail(`part missing from the 185 pool: ${n}`);
  const buf = readFileSync(f);
  assetBytes += buf.length;
  assets[`parts/185/${n}.lib.glb`] = buf.toString('base64');
}
assets[`builds/${KIT}.json`] = Buffer.from(JSON.stringify(kitJson)).toString('base64');
console.log(`assets: ${Object.keys(assets).length} (${(assetBytes / 1048576).toFixed(2)} MB raw)`);

/* ---- 4. fingerprint ------------------------------------------------------
   ⚠ AUTOMATIC, NEVER TYPED. Without this a result read back in three months
   cannot be told apart from one taken against a different scene, shader or
   protocol - which would make the whole fleet exercise unfalsifiable. */
let commit = 'unknown', dirty = null;
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
  dirty = execSync('git status --porcelain', { cwd: root }).toString().trim().length > 0;
} catch (e) { /* not a checkout */ }

/* ---- 5. emit ------------------------------------------------------------- */
const css = read(join(V, 'css', 'viewer.css')) + '\n' + read(join(V, 'bench', 'bench.css'));
const benchJs = read(join(V, 'bench', 'bench.js'));

// index.html supplies the DOM the app expects; take its <body> verbatim.
const indexHtml = read(join(V, 'index.html'));
const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!bodyMatch) fail('could not find <body> in viewer/index.html');
let body = bodyMatch[1]
  .replace(/<script[\s\S]*?<\/script>/gi, '')      // drop index.html's own script tags
  .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

/* The cover's brand images are INLINED rather than stripped. They are hidden by
   the bench overlay either way, but leaving the <img> elements in place keeps
   the DOM byte-identical to the app's - and the product-render scope is only
   honest if the page really is the page. Stripping them would also leave three
   file-not-found errors in the console of a tool whose whole job is to make
   people trust the numbers it prints. */
const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
let inlined = 0;
body = body.replace(/src="((?:img|\.\/img)\/[^"]+)"/g, (m, p) => {
  const f = join(V, p.replace(/^\.\//, ''));
  if (!existsSync(f)) { console.warn(`  ! body image missing, left as-is: ${p}`); return m; }
  const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
  inlined++;
  return `src="data:${MIME[ext] || 'application/octet-stream'};base64,${readFileSync(f).toString('base64')}"`;
});
console.log(`inlined ${inlined} body image(s)`);

const J = (o) => JSON.stringify(o).replace(/<\/script/gi, '<\\/script');

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>GEN2 Build Studio - benchmark</title>
<style>${css}</style>
</head>
<body>
${body}

<script>
/* ---------------------------------------------------------------- fingerprint */
window.__GEN2_BENCH_FINGERPRINT__ = ${J({
  buildId: null,            // filled below from the document hash
  viewerCommit: commit,
  viewerTreeDirty: dirty,
  builtAt: new Date().toISOString(),
  kit: KIT,
  moduleCount: modules.size,
  assetCount: Object.keys(assets).length,
})};

/* ?debug=1 is what publishes the viewer's hook, and the hook is the only way to
   reach the renderer, the tier table and the AO/reflection internals from
   outside. Reload once WITH it rather than patching the app to expose more. */
if (!/[?&]debug=1(&|$)/.test(location.search)) {
  location.replace(location.pathname + '?debug=1' + location.hash);
}
</script>

<script>
/* --------------------------------------------------------------- fetch shim
   file:// blocks fetch, so the kit JSON and every GLB are served from memory.
   ⚠ A request the shim cannot satisfy returns a REAL 404 and logs loudly. It
   must never invent an empty response: the viewer's root path has a fail-safe
   that silently falls back to a static demo kit, and a quiet fallback here
   would benchmark a different scene while looking perfectly healthy. */
(function () {
  var ASSETS = ${J(assets)};
  var missing = [];
  function bytes(b64) {
    var bin = atob(b64), n = bin.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function lookup(url) {
    var u = String(url).split('?')[0].split('#')[0];
    if (ASSETS[u]) return u;
    for (var k in ASSETS) if (u.endsWith(k) || u.endsWith('/' + k)) return k;
    var tail = u.split('/').slice(-3).join('/');
    for (var k2 in ASSETS) if (k2.endsWith(tail)) return k2;
    return null;
  }
  var orig = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = (input && input.url) ? input.url : String(input);
    var key = lookup(url);
    if (key) {
      var body = bytes(ASSETS[key]);
      return Promise.resolve(new Response(body, {
        status: 200, headers: { 'Content-Type': key.endsWith('.json') ? 'application/json' : 'model/gltf-binary',
                                'Content-Length': String(body.length) },
      }));
    }
    if (/\\.(glb|json)(\\?|$)/i.test(url)) {
      missing.push(url);
      console.error('[bench] asset NOT in the bundle: ' + url + ' - results from this run are invalid.');
      window.__GEN2_BENCH_MISSING__ = missing;
      return Promise.resolve(new Response('missing', { status: 404 }));
    }
    return orig ? orig(input, init) : Promise.reject(new Error('offline'));
  };
})();
</script>

${CLASSIC.map((c) => `<script>/* ${c.p} */\n${c.src}\n</script>`).join('\n')}

<script>
/* ------------------------------------------------- blob modules + import map
   Each real source becomes a blob: URL; the import map is injected BEFORE the
   first module load so every specifier resolves. Relative specifiers were
   rewritten to bare 'gen2:...' names at build time (a blob URL has no usable
   base path), and the build verifies none survived. */
(function () {
  var SRC = ${J(Object.fromEntries([...modules].map(([k, m]) => [k, m.src])))};
  var BARE = ${J(Object.fromEntries(Object.entries(BARE).map(([spec, p]) => [spec, keyFor(posix.normalize(p))])))};
  var MAIN = ${J(MAIN)};

  if (!(HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'))) {
    document.addEventListener('DOMContentLoaded', function () {
      document.body.insertAdjacentHTML('beforeend',
        '<div style="position:fixed;inset:0;z-index:99999;background:#1b1d33;color:#ff9a9a;' +
        'font:16px system-ui;display:flex;align-items:center;justify-content:center;padding:40px;text-align:center">' +
        'This browser does not support import maps, so the benchmark cannot start.<br>Please update Chrome or Edge.</div>');
    });
    return;
  }

  var urls = {}, imports = {};
  for (var k in SRC) urls[k] = URL.createObjectURL(new Blob([SRC[k]], { type: 'text/javascript' }));
  for (var k2 in SRC) imports[k2] = urls[k2];
  for (var spec in BARE) imports[spec] = urls[BARE[spec]];

  var s = document.createElement('script');
  s.type = 'importmap';
  s.textContent = JSON.stringify({ imports: imports });
  document.currentScript.parentNode.insertBefore(s, document.currentScript);

  /* INTEGRITY: the count that shipped must be the count that loads. */
  var fp = window.__GEN2_BENCH_FINGERPRINT__;
  if (Object.keys(SRC).length !== fp.moduleCount) {
    console.error('[bench] module count mismatch - bundle is corrupt');
    return;
  }
  fp.buildId = ${J(createHash('sha256').update([...modules].map(([k, m]) => k + m.src).join(' ') + JSON.stringify(assets)).digest('hex').slice(0, 12))};

  var m = document.createElement('script');
  m.type = 'module';
  m.textContent = 'import ' + JSON.stringify(MAIN) + ';';
  document.head.appendChild(m);
})();
</script>

<script>${benchJs}</script>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, 'utf8');
const mb = (Buffer.byteLength(html, 'utf8') / 1048576).toFixed(2);
console.log(`\nwrote ${relative(root, OUT)}  ${mb} MB`);
console.log(`  viewer commit ${commit}${dirty ? ' (TREE DIRTY - the bundle is not a released state)' : ''}`);
