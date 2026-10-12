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

const css = await (await fetch(CSS_URL, { headers: { 'user-agent': UA } })).text();
const blocks = css.split('@font-face').slice(1).map((b) => '@font-face' + b);
const keep = [];
for (const b of blocks) {
  const subset = (b.match(/\/\*\s*([a-z-]+)\s*\*\//) || [])[1];
  if (subset !== 'latin') continue;
  const family = b.match(/font-family:\s*'([^']+)'/)[1];
  const style = (b.match(/font-style:\s*(\w+)/) || [, 'normal'])[1];
  const weight = b.match(/font-weight:\s*([\d ]+)/)[1].trim();
  const stretch = (b.match(/font-stretch:\s*([\d% ]+)/) || [, null])[1];
  const url = b.match(/url\((https:[^)]+\.woff2)\)/)[1];
  const slug = `${family.toLowerCase().replace(/\s+/g, '-')}-${weight.replace(/\s+/g, '-')}${style === 'italic' ? '-italic' : ''}.woff2`;
  keep.push({ family, style, weight, stretch, url, slug });
}
await mkdir(join(root, 'fonts'), { recursive: true });
let out = '/* Self-hosted type (the brief §5), fetched by tools/fetch-fonts.mjs from Google Fonts; latin subsets. SIL OFL 1.1 - see fonts/README.md. */\n';
let bytes = 0;
for (const f of keep) {
  const buf = Buffer.from(await (await fetch(f.url, { headers: { 'user-agent': UA } })).arrayBuffer());
  await writeFile(join(root, 'fonts', f.slug), buf);
  bytes += buf.length;
  out += `@font-face { font-family: '${f.family}'; font-style: ${f.style}; font-weight: ${f.weight};${f.stretch ? ` font-stretch: ${f.stretch.trim()};` : ''} font-display: swap; src: url('../fonts/${f.slug}') format('woff2'); }\n`;
  console.log(`${f.slug.padEnd(40)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB  ${f.family} ${f.weight}${f.stretch ? ' wdth ' + f.stretch.trim() : ''}`);
}
await writeFile(join(root, 'css', 'fonts.css'), out);
await writeFile(join(root, 'fonts', 'README.md'), `# Fonts\n\nArchivo (variable: width 62-125, weight 400-900), IBM Plex Sans 400/500/600 and IBM Plex Mono 400/500/600, latin subsets, fetched on ${new Date().toISOString().slice(0, 10)} by \`tools/fetch-fonts.mjs\` from Google Fonts (${CSS_URL}). All three are licensed under the SIL Open Font License 1.1 (Archivo: Omnibus-Type; IBM Plex: IBM). \`css/fonts.css\` declares them; the page loads no third-party font stylesheet.\n`);
console.log(`${keep.length} files, ${(bytes / 1024).toFixed(0)} KB -> fonts/, css/fonts.css`);
