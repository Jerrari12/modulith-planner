/* Self-hosts the app's three typefaces (the brief §5: Archivo, IBM Plex Sans, IBM Plex Mono).
 *
 * Downloads the latin subsets from Google Fonts' CSS API into fonts/ and writes css/fonts.css with
 * local @font-face rules, so index.html links no third-party stylesheet. Run once (Joey's OK,
 * 2026-10-12) and re-run only to refresh. All three families are under the SIL Open Font License
 * 1.1; fonts/README.md records that with the source URL.
 *
 *   node tools/fetch-fonts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap';
/* a modern UA gets woff2 with unicode-range subsets; we keep the latin ones */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// a failed request (a 404, a 429, an error page) stops the run rather than being saved as a font (Terra 01a17fbe)
const get = async (url, opts) => { const r = await fetch(url, opts); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r; };
const css = await (await get(CSS_URL, { headers: { 'user-agent': UA } })).text();
/* each block's subset is the comment BEFORE it ("/* latin *\/ @font-face {...}"). Split on @font-face, the comment fell
   at the end of the previous chunk, so every block read the next one's name: the 2026-10-12 run kept latin-ext - no
   A-Z, the planner's words in the system's faces until 2026-10-27 */
const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)].map((m) => ({ subset: m[1], b: m[2] }));
/* latin (A-Z, a-z, the digits, Latin-1) and latin-ext (the accented letters past Latin-1, a label's "ł" or "ő"); each
   keeps Google's unicode-range, so a page loads latin-ext only when it draws one of its characters. Neither has the
   arrows of "← Back" and "Next →": those come from the system's face */
const keep = [];
for (const { subset, b } of blocks) {
  if (subset !== 'latin' && subset !== 'latin-ext') continue;
  const family = b.match(/font-family:\s*'([^']+)'/)[1];
  const style = (b.match(/font-style:\s*(\w+)/) || [, 'normal'])[1];
  const weight = b.match(/font-weight:\s*([\d ]+)/)[1].trim();
  const stretch = (b.match(/font-stretch:\s*([\d% ]+)/) || [, null])[1];
  const range = b.match(/unicode-range:\s*([^;]+);/)[1].trim();
  const url = b.match(/url\((https:[^)]+\.woff2)\)/)[1];
  // the subset in the name: a new file name, so no browser keeps a cached copy of the letterless files of 2026-10-12
  const slug = `${family.toLowerCase().replace(/\s+/g, '-')}-${weight.replace(/\s+/g, '-')}${style === 'italic' ? '-italic' : ''}-${subset}.woff2`;
  keep.push({ family, style, weight, stretch, range, url, slug });
}
await mkdir(join(root, 'fonts'), { recursive: true });
let out = '/* Self-hosted type (the brief §5), fetched by tools/fetch-fonts.mjs from Google Fonts; latin and latin-ext subsets. SIL OFL 1.1 - see fonts/README.md and the OFL-*.txt beside the files. */\n';
let bytes = 0;
// Google serves Plex Sans as one variable file for every weight: blocks sharing a URL become one face over the weights'
// range (named without a weight), declared as the variable font it is (Terra 01a17fbe), downloaded once
const faces = [];
for (const f of keep) {
  const same = faces.find((g) => g.url === f.url);
  if (same) { same.weights.push(...f.weight.split(/\s+/).map(Number)); continue; }
  faces.push({ ...f, weights: f.weight.split(/\s+/).map(Number) });
}
for (const f of faces) {
  const lo = Math.min(...f.weights), hi = Math.max(...f.weights);
  const weight = lo === hi ? String(lo) : `${lo} ${hi}`;
  if (weight !== f.weight) f.slug = f.slug.replace(`-${f.weight.replace(/\s+/g, '-')}-`, '-');
  const buf = Buffer.from(await (await get(f.url, { headers: { 'user-agent': UA } })).arrayBuffer());
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error(`${f.url} is not a woff2`);
  await writeFile(join(root, 'fonts', f.slug), buf);
  bytes += buf.length;
  console.log(`${f.slug.padEnd(40)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB  ${f.family} ${weight}${f.stretch ? ' wdth ' + f.stretch.trim() : ''}`);
  out += `@font-face { font-family: '${f.family}'; font-style: ${f.style}; font-weight: ${weight};${f.stretch ? ` font-stretch: ${f.stretch.trim()};` : ''} font-display: swap; src: url('../fonts/${f.slug}') format('woff2'); unicode-range: ${f.range}; }\n`;
}
await writeFile(join(root, 'css', 'fonts.css'), out);
/* the OFL asks that every copy of the fonts carry the copyright and the licence; the files carry the copyright and only
   a link to the licence, so its text ships beside them, from each family's own repository */
const LICENCES = { 'OFL-IBM-Plex.txt': 'https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt', 'OFL-Archivo.txt': 'https://raw.githubusercontent.com/Omnibus-Type/Archivo/master/OFL.txt' };
for (const [name, url] of Object.entries(LICENCES)) {
  const text = await (await get(url)).text();
  if (!/SIL OPEN FONT LICENSE/i.test(text)) throw new Error(`${url} is not the OFL`);
  await writeFile(join(root, 'fonts', name), text);
}
await writeFile(join(root, 'fonts', 'README.md'), `# Fonts\n\nArchivo (variable: width 62-125, weight 400-900), IBM Plex Sans 400/500/600 and IBM Plex Mono 400/500/600, latin and latin-ext subsets, fetched on ${new Date().toISOString().slice(0, 10)} by \`tools/fetch-fonts.mjs\` from Google Fonts (${CSS_URL}). \`css/fonts.css\` declares them; the page loads no third-party font stylesheet.\n\n## Licence\n\nAll three are under the SIL Open Font License 1.1: free to use, bundle and serve, commercially too; not to be sold on their own; every copy keeps the copyright and the licence. The licence texts are \`OFL-IBM-Plex.txt\` (Copyright 2017 IBM Corp., with Reserved Font Name "Plex") and \`OFL-Archivo.txt\` (Copyright 2020 The Archivo Project Authors, no reserved name). These are Google Fonts' files, unchanged: a version modified here (re-subset, edited) could not keep the name "Plex".\n`);
console.log(`${faces.length} files, ${(bytes / 1024).toFixed(0)} KB -> fonts/, css/fonts.css`);
