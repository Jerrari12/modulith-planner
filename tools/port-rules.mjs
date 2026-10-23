/* Ports the planner's rule functions BY COPY into js/rules/ (the approved merge plan, §1.5: "ported by copy,
 * never edited in the old repo, behind a parity gate"). The source is the planner checkout beside this repo
 * (or PLANNER_REPO); every output records the planner commit and every mechanical edit, so a weekly bump is
 * "re-run, diff, re-check parity".
 *
 * Three modules today, every one the planner's own text with the SAME mechanical edits:
 *   - `state.` -> `build.` and `state[` -> `build[` (the planner reads its closure state; the rule takes the record)
 *   - the planner's UI hooks the rule text reaches are declared as no-op stubs in the module preamble
 *     (`noteBuildStart`, `refresh`), never edited out of the lines themselves
 *   - the two globals the text reaches (`sizeToken` from data.js, `GEN2_TABLETOP` from tabletop-completion.js) are
 *     bound in the preamble
 * and then the dated edits where this repo is AHEAD of the old planner on purpose (tools/port-ahead.mjs: the side-cover
 * toggle, the per-run side covers, the back cover's tear-away note), each applied to its exact text or the port stops.
 * A planner-only change to a ported module goes there, never into the module by hand: the next port would drop it.
 *
 *   js/rules/bom.js      computeBom(build, GEN2) + bomRows                      (phase 2)
 *   js/rules/layout.js   layoutRules(build, GEN2, deps) -> { every fit, placement, validity, fix and conversion rule }
 *   js/rules/schema.js   BUILD_FIELDS, BUILD_SCHEMA, buildTooNew, serializeBuild, sanitizeBuild, the label cleaners
 *
 *   node tools/port-rules.mjs            (writes the three files)
 *   node tools/port-rules.mjs --check    (writes nothing: says whether the planner checkout has DRIFTED from the pinned
 *                                         text of each module, with a count of the differing lines; exit 1 on drift. The
 *                                         plan's weekly bump: run it, read the diff, port and re-check parity, or record
 *                                         why the change stays in the old planner only)
 *   node tools/port-rules.mjs --out DIR  (writes the three files into DIR instead: test/port-ahead.test.mjs ports
 *                                         fresh and checks what the AHEAD edits do)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { AHEAD, applyAhead } from './port-ahead.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLANNER = process.env.PLANNER_REPO || join(root, '..', 'GEN2 Planner', 'gen2-planner-main');
if (!existsSync(join(PLANNER, 'js', 'app.js'))) { console.error('planner checkout not found at ' + PLANNER + ' (set PLANNER_REPO)'); process.exit(2); }
const app = readFileSync(join(PLANNER, 'js', 'app.js'), 'utf8').split('\n');
let commit = 'unknown';
try { commit = execSync('git log -1 --format=%h_%ad --date=short -- js/app.js', { cwd: PLANNER }).toString().trim().replace('_', ' '); } catch {}
const CHECK = process.argv.includes('--check');
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (OUT !== null && (!OUT || OUT.startsWith('--') || CHECK)) { console.error('--out needs a directory, and writes: not with --check'); process.exit(2); }
let drift = 0;
// an AHEAD entry for a module the port does not write would never apply: refuse it before anything is written
const MODULES = ['js/rules/bom.js', 'js/rules/layout.js', 'js/rules/schema.js'];
const stray = AHEAD.filter((a) => !MODULES.includes(a.file));
if (stray.length) { console.error('tools/port-ahead.mjs: no ported module ' + stray.map((a) => `${a.file} (${a.id})`).join(', ')); process.exit(1); }
/* write a module, or in --check mode compare it with the committed one (the pin line aside) and report the drift */
const ported = new Set();
function put(rel, out) {
  if (!MODULES.includes(rel)) throw new Error('port-rules.mjs: ' + rel + ' is not in MODULES');
  ported.add(rel);
  // the AHEAD edits first: a module is never written, nor compared, without them
  try { out = applyAhead(rel, out); } catch (e) {
    if (!CHECK) throw e;
    drift++;
    console.log(`${rel}: DRIFT - ${e.message}`);
    return;
  }
  const path = OUT ? join(OUT, basename(rel)) : join(root, ...rel.split('/'));
  if (!CHECK) { writeFileSync(path, out); console.log(`${OUT ? path : rel} written from planner ${commit}`); return; }
  // the pin line aside: its commit, its date and the source line numbers (an edit ABOVE a rule moves them without touching it)
  const norm = (t) => t.split('\n').map((l) => (/^ \* Source: /.test(l) ? l.replace(/@ \S+( \d{4}-\d{2}-\d{2})?,/, '@ PIN,').replace(/(\w+) \d+-\d+/g, '$1 L') : l)).join('\n');   // that one line only: a range-like token in the code must still count (Terra 01a136ba)
  const cur = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (norm(cur) === norm(out)) { console.log(`${rel}: no drift (planner app.js now at ${commit})`); return; }
  drift++;
  const tmp = join(tmpdir(), 'port-check-' + basename(rel));
  writeFileSync(tmp, norm(out));
  const pinned = join(tmpdir(), 'port-pinned-' + basename(rel));
  writeFileSync(pinned, norm(cur));
  let n = '';
  try { execSync(`git diff --no-index --numstat -- "${pinned}" "${tmp}"`); } catch (e) { n = e.stdout ? e.stdout.toString().trim().split(/\s+/) : []; }
  console.log(`${rel}: DRIFT - the planner's text at ${commit} differs from the pinned module: ${n[0] || '?'} lines added, ${n[1] || '?'} removed\n  git diff --no-index "${pinned}" "${tmp}"`);
}

/* slice one top-level-in-IIFE function or const by its first line, to the matching close at the same indent */
function slice(startRe) {
  const i = app.findIndex((l) => startRe.test(l));
  if (i < 0) throw new Error('not found: ' + startRe);
  const indent = app[i].match(/^\s*/)[0];
  if (/^\s*const /.test(app[i])) {
    // a const: one statement. A block-bodied arrow (`= () => {`) closes at `};` on the const's own indent; anything
    // else continues over lines until the one that ends it with `;` (a trailing // comment allowed - none of the
    // sliced consts carries `//` inside a string)
    const core = (l) => { const c = l.indexOf('//'); return (c >= 0 ? l.slice(0, c) : l).trimEnd(); };
    if (/\{$/.test(core(app[i]))) {
      for (let j = i + 1; j < app.length; j++) if (app[j].startsWith(indent + '}') && !app[j].startsWith(indent + ' ')) return { from: i + 1, to: j + 1, text: app.slice(i, j + 1) };
      throw new Error('no end for ' + startRe);
    }
    let j = i;
    while (j < app.length && !/;$/.test(core(app[j]))) j++;
    return { from: i + 1, to: j + 1, text: app.slice(i, j + 1) };
  }
  for (let j = i + 1; j < app.length; j++) {
    if (app[j].startsWith(indent + '}') && !app[j].startsWith(indent + ' ')) return { from: i + 1, to: j + 1, text: app.slice(i, j + 1) };
  }
  throw new Error('no end for ' + startRe);
}
const fn = (name) => [name, new RegExp(`^  function ${name}\\(`)];
const cn = (name) => [name, new RegExp(`^  const ${name} = `)];
const edit = (lines) => lines.map((l) => l.replace(/\bstate\./g, 'build.').replace(/\bstate\[/g, 'build[')).join('\n');
const take = (parts) => { const got = Object.fromEntries(parts.map(([name, re]) => [name, slice(re)])); return { got, ranges: parts.map(([n]) => `${n} ${got[n].from}-${got[n].to}`).join(', ') }; };
const HEAD = (what, ranges, edits) => `/* ${what}, PORTED BY COPY. Generated by tools/port-rules.mjs - do not edit by hand.
 *
 * Source: gen2-planner-main js/app.js @ ${commit}, lines: ${ranges}.
 * Mechanical edits: ${edits}
 */
`;
mkdirSync(OUT || join(root, 'js', 'rules'), { recursive: true });

/* ---------------------------------------------------------------- 1. the bill of materials (phase 2) ---- */
{
  const parts = [cn('fillDef'), cn('gridfinityOk'), cn('isGridfinity'), fn('bedSize'), fn('fitsBed'), fn('maxRailW'), fn('unitAt'), fn('occupiedColumns'), fn('topCases'), fn('columnRuns'), fn('sectionsFor'), cn('railSections'), cn('wallSections'), fn('mixOf'), cn('railMix'), ['computeBom', /^  function computeBom\(\) \{/]];
  const { got, ranges } = take(parts);
  const helpers = parts.filter(([n]) => n !== 'computeBom').map(([n]) => edit(got[n].text)).join('\n');
  const body = edit(got.computeBom.text.slice(1, -1));   // drop `function computeBom() {` and its `}`
  const out = HEAD("THE PLANNER'S BILL OF MATERIALS", ranges, `the planner reads its closure \`state\`; here every \`state.\` is \`build.\` and the build record is
 * the first argument, the catalog (data.js's GEN2, with GEN2.req from requirement-scope) the second. The layout
 * helpers the function reaches (unitAt, columnRuns, bed fit, rail sections) come along as inner functions, unchanged
 * apart from that same substitution. sizeToken is data.js's one-liner.
 *
 * Parity: test/parity/bom-parity.test.mjs runs the planner's own computeBom in jsdom on the same builds and compares
 * the sections as canonical JSON (the official kits, the planner's seeded random builds, option sweeps).`) + `export function computeBom(build, GEN2) {
  if (!build || !GEN2) return null;
  const sizeToken = (w, h) => \`\${w}W-\${h}H\`;
${helpers}

${body}
}

/* The flat rows the Parts workspace and the exports read: one per item with qty > 0, the section it came from,
   and the links the planner's partLinks resolves (hardware and unreleased rows have none). \`partLinks\` is data.js's
   top-level function, passed in because it is a classic-script global in the page and a vm export under node. */
export function bomRows(sections, partLinks) {
  const out = [];
  for (const sec of sections || []) {
    for (const it of sec.items) {
      if (!(it.qty > 0)) continue;
      const links = it.hardware || it.unreleased || !partLinks ? null : partLinks(it.linkAs || it.name);
      out.push({ section: sec.title, mountSection: !!sec.mountSection, ...it, links });
    }
  }
  return out;
}
`;
  put('js/rules/bom.js', out);
}

/* ------------------------------------------------- 2. fit, placement, validity, fixes, conversion (phase 3) ---- */
{
  const parts = [
    cn('GRID_LIMITS'), cn('mountDef'), cn('fillDef'), cn('gridfinityOk'), cn('isGridfinity'),
    fn('bedSize'), fn('fitsBed'), fn('caseFits'), fn('lengthFits'), fn('mountBlocksLength'), fn('enforceMountLength'),
    fn('fillFits'), fn('fitProblem'), fn('maxRailW'), fn('sizeExists'), fn('heightsForFill'), fn('growGridForHeight'),
    fn('selectable'), fn('ensureValidSelection'), fn('capW'), fn('capH'), fn('clampGrid'), fn('syncTabletopGrid'),
    fn('setMount'), fn('rebaseToMountEdge'),
    cn('DRAWER_FILLS'), cn('isDrawerUnit'), cn('otherDrawerFill'), fn('convertProblem'), fn('planConversion'),
    cn('rows'), fn('occupancy'), fn('canPlace'), fn('unitAt'),
    fn('interiorFill'), cn('interiorComplete'), cn('interiorCellsLeft'), fn('placeCompartment'),
    fn('occupiedColumns'), fn('topCases'), fn('columnRuns'),
    fn('fixStructure'), fn('fillColumn'), fn('bowRisks'), fn('sagRisks'), fn('wallTopHalfHeight'), fn('fixWallTops'),
    cn('VIEWER_UT_LENGTHS'), fn('unsupportedUnits'), fn('instructionsBlockReason'), fn('tabletopCompletion'),
    fn('selectedUnit'), cn('NUDGE'), fn('nudgeSelected'), fn('interiorDims'),
  ];
  const { got, ranges } = take(parts);
  const names = parts.map(([n]) => n);
  const body = names.map((n) => edit(got[n].text)).join('\n');
  const out = HEAD("THE PLANNER'S LAYOUT RULES: fit, placement, validity, fixes, conversion", ranges, `the planner reads its closure \`state\`; here every \`state.\` is \`build.\`. The record is the build (BUILD_FIELDS)
 * PLUS the three fields the planner keeps beside it that these rules read: \`fill\` (the palette's unit for a new
 * placement), \`selected\` ({ w, h }, the palette's size) and \`selectedUnit\` (an id). Two UI hooks the text reaches
 * are no-op stubs here (\`noteBuildStart\`, the planner's analytics; \`refresh\`, its render - the caller renders);
 * \`sizeToken\` is data.js's one-liner; \`GEN2_TABLETOP\` is tabletop-completion.js's global, or deps.tabletop.
 * The mutating rules (fixStructure, fixWallTops, clampGrid, syncTabletopGrid, setMount, rebaseToMountEdge,
 * enforceMountLength, growGridForHeight, ensureValidSelection, nudgeSelected, placeCompartment) mutate the record
 * in place, exactly as the planner's do.
 *
 * Parity: test/parity/layout-parity.test.mjs runs the planner's own functions in jsdom on the same builds (the
 * official kits, seeded random builds, deliberately broken layouts) and compares results and post-states.`) + `export function layoutRules(build, GEN2, deps = {}) {
  if (!build || !GEN2) return null;
  const sizeToken = (w, h) => \`\${w}W-\${h}H\`;
  const GEN2_TABLETOP = deps.tabletop || globalThis.GEN2_TABLETOP;
  const noteBuildStart = () => {};
  const refresh = () => {};
${body}
  return { ${names.join(', ')} };
}
`;
  put('js/rules/layout.js', out);
}

/* ---------------------------------------------------------------- 3. the build record's schema (phase 3) ---- */
{
  const parts = [cn('BUILD_PLATES'), cn('GRID_LIMITS'), cn('BUILD_ID_RE'), fn('newBuildId'), cn('LABEL_MAX'), fn('cleanLabelText'),
    cn('LABEL_DATA_MAX'), fn('carryLabelData'), cn('ID_MAX'), cn('BUILD_FIELDS'), cn('BUILD_SCHEMA'), cn('buildTooNew'), cn('serializeBuild'),
    fn('cleanLabelBadge'), fn('cleanLabelStyle'), fn('heightsForFill'), fn('sizeExists'), fn('sanitizeBuild')];
  const { got, ranges } = take(parts);
  const top = ['BUILD_PLATES', 'GRID_LIMITS', 'BUILD_ID_RE', 'newBuildId', 'LABEL_MAX', 'cleanLabelText', 'LABEL_DATA_MAX', 'carryLabelData', 'ID_MAX', 'BUILD_FIELDS', 'BUILD_SCHEMA', 'buildTooNew']
    .map((n) => 'export ' + edit(got[n].text).replace(/^  /gm, '')).join('\n');
  // serializeBuild: the planner's arrow over its closure state, here a function of the record
  const ser = edit(got.serializeBuild.text).replace(/^  /gm, '').replace('const serializeBuild = () => {', 'export function serializeBuild(build) {').replace(/\};\s*$/, '}');
  // sanitizeBuild reads the catalog through GEN2 and the record it is cleaning through `build` (sizeExists's and
  // heightsForFill's defaults, which it never relies on: every call passes the unit's own fill and the record's length)
  const inner = ['cleanLabelBadge', 'cleanLabelStyle', 'heightsForFill', 'sizeExists'].map((n) => edit(got[n].text)).join('\n');
  const san = edit(got.sanitizeBuild.text).replace(/^  /gm, '').replace('function sanitizeBuild(d) {', `export function sanitizeBuild(d, GEN2) {
  const build = d;
  const sizeToken = (w, h) => \`\${w}W-\${h}H\`;
${inner}`);
  const out = HEAD("THE PLANNER'S BUILD SCHEMA: the fields, the sanitiser, the label cleaners", ranges, `\`state.\` -> \`build.\`; the top-level consts and the catalog-free helpers are exported as they are;
 * serializeBuild takes the record; sanitizeBuild takes the record it cleans and the catalog, with the four
 * catalog-reading helpers it reaches (cleanLabelBadge, cleanLabelStyle, heightsForFill, sizeExists) as inner
 * functions. Nothing else changed; the planner's comments ride along.
 *
 * Parity: test/parity/layout-parity.test.mjs feeds the planner's applyBuild and this sanitizeBuild the same
 * records (official kits, random builds, corrupted variants) and compares what each keeps.`) + `${top}
${ser}
${san}
`;
  put('js/rules/schema.js', out);
}
// and every module MODULES names was ported: a block gone from here would otherwise drop its AHEAD edits unseen
const missed = MODULES.filter((m) => !ported.has(m));
if (missed.length) { console.error('port-rules.mjs: MODULES names ' + missed.join(', ') + ', never ported'); process.exit(1); }
if (CHECK && drift) process.exit(1);
