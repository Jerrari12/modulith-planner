/* THE BAKED TOP-LAYER MAPS - the workstation half of the pipeline (2026-10-25).
 *
 *   node tools/skin-map.mjs plan [--out <dir>] [--nodes a,b] [--match TEXT] [--limit N]
 *   node tools/skin-map.mjs push [--out <dir>]
 *   node tools/skin-map.mjs ship --raw <dir> [--out <dir>] [--nodes a,b] [--match TEXT] [--max-mpx 1.5] [--rg-bits 8] [--dest <dir>] [--families a,b]
 *   node tools/skin-map.mjs check [--out <dir>] [--nodes a,b] [--match TEXT]
 *
 * plan   For every part GLB the pools ship, decide what node0 slices: the release STL it corresponds to (the catalog's
 *        paths, D:/MODULITH/ops/slicing/catalog/catalog-matrix.csv, by a per-family name rule), the rotation that lays
 *        the part in Joey's confirmed print pose (the build axis from generate.js buildAxisForType, carried into the
 *        STL's frame by the rotation tools/lib/skin-geometry.mjs measures between the two meshes: R * axis = +Z means
 *        the STL sits print-ready, -Z means it is upside down and slices with --rotate-x=180, anything else refuses the
 *        part), and the profile (the Core One's bed when the footprint fits it, else the XL's - the two profiles lay the
 *        same skin, only the bed differs). Writes <out>/jobs.json for D:/MODULITH/ops/slicing/skin_bake.py on node0 and
 *        <out>/plan.json with every decision and every refusal and its reason.
 *
 * push   Copies to node0 every job's STL that node0's ~/models lacks or holds with another hash (the side covers:
 *        node0's corpus is a partial copy of the local one), under the same relative path.
 *
 * ship   Turns node0's raw bakes (<raw>/<key>.png + .json, in the G-code's XY frame) into the maps the planner loads:
 *        parts/skin/<node>.png in the part's OWN frame - the bed-plane coordinates the shader derives from the build
 *        axis (js/skin-map.js skinTangents, the same two vectors bed-finish.js builds in GLSL) - so the shader needs no
 *        flip, swap or offset per part, only the map's origin and scale. The G-code frame is the STL frame turned by
 *        the slice rotation, centred on the bed and dropped to z = 0; the tool predicts the extrusion's extents from
 *        that and refuses a map whose recorded extents disagree. Writes parts/skin/index.json, the one file the planner
 *        fetches to learn which nodes have a map and where each map's frame sits.
 *
 * check  Reads every shipped map the way the shader does and measures how much of the GLB's visible top-skin area
 *        it agrees with (tools/lib/skin-check.mjs), against the same map mirrored and turned as controls, so a map in the
 *        wrong frame is a number, not a picture nobody looked at. Writes <out>/check.json.
 *
 * Both read the GLBs through the parts/ junction (a gen2-parts checkout) and the STLs from the local corpus
 * D:/Claude - Model Sharing (node0's ~/models is a copy; sha256 is checked on both sides). */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { readGlbTriangles, readStlTriangles, matchRotation, rotate, matMul, bounds } from './lib/skin-geometry.mjs';
import { skinCoverage } from './lib/skin-check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { buildAxisForType } = await import(pathToFileURL(join(root, 'js', 'generate.js')).href);
const SM = await import(pathToFileURL(join(root, 'js', 'skin-map.js')).href);

const CATALOG_CSV = 'D:/MODULITH/ops/slicing/catalog/catalog-matrix.csv';
const CORPUS = 'D:/Claude - Model Sharing';
const POOLS = ['185', '115', '165', '240', '270', '59'];
const CORE_ONE = { profile: 'core-one-04hf-02speed-pla.ini', bed: [250, 220] };
const XL = { profile: 'xl-5t-hf04-02speed-pla.ini', bed: [360, 360] };
const BED_MARGIN_MM = 0;         // the slicer's own rule: a 4W part fits the XL's 360 with zero margin (catalog_slice.py); the bake records a refusal
const BED_EPS = 0.01;
const DEFAULT_OUT = 'D:/Claude - Output/skin-map-2026-10-25';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const OUT = opt('--out', DEFAULT_OUT);
const ONLY = opt('--nodes', '') ? new Set(opt('--nodes', '').split(',')) : null;
const MATCH = opt('--match', null);
const LIMIT = +opt('--limit', 0) || 0;
/* a shipped map's pixel cap: a 270 case bakes to 1485 x 2242 px (3.3 Mpx, 460 KB) at 8 px/mm, far past the ~160 KB a part
   was budgeted; past the cap the map ships scaled down (the normal box-averaged, the layer height nearest), its px/mm
   recorded in the index, so the stage reads it the same way. --max-mpx overrides. */
const MAX_MPX = +opt('--max-mpx', 1.5);
/* the normal's precision: 8 bits a channel as baked, or fewer (the bead flanks use about a tenth of the range; fewer
   levels compress better). --rg-bits 6 keeps 64 levels. */
const RG_BITS = Math.max(2, Math.min(8, +opt('--rg-bits', 8)));
/* --dest <dir> ships somewhere other than parts/skin (a size experiment); --families a,b keeps only nodes whose name
   starts with one of them (Faceplate_EdgeLabel, CL-, ...) */
const DEST = opt('--dest', null);
const FAMILIES = opt('--families', '') ? opt('--families', '').split(',') : null;

const norm = (s) => s.toLowerCase().replace(/\.stl$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/* ---- which STL a node is, and how the pose table knows it ---- */
const SIZE = '(\\dW-\\d+H)';
const RULES = [
  [new RegExp(`^Faceplate_EdgeLabel_${SIZE}$`), (m) => ({ type: 'Faceplate', family: 'edgelabel', names: [`edgelabel ${m[1]}`], prefer: 'EdgeLabel/' })],
  [new RegExp(`^Faceplate_ClassicDecor_${SIZE}$`), (m) => ({ type: 'Faceplate', family: 'classic', names: [`gen2 classic faceplate ${m[1]}`] })],
  [new RegExp(`^Faceplate_ClassicPro_${SIZE}$`), (m) => ({ type: 'Faceplate', family: 'classicpro', names: [`classic label ${m[1]}`, `classic label ${m[1].replace('05H', '0 5H')} a`, `${m[1]} fix`], prefer: 'Classic Pro/' })],
  [new RegExp(`^Faceplate_Essential_${SIZE}$`), (m) => ({ type: 'Faceplate', family: 'essential', names: [`gen2 essential faceplate ${m[1]}`, `essential faceplate ${m[1]}`, `essential ${m[1]}`, `essential ${m[1].replace(/H$/, '')}`], prefer: 'Essential/' })],
  [new RegExp(`^Faceplate_Chevron_${SIZE}$`), (m) => ({ type: 'Faceplate', family: 'chevron', names: [`gen2 chevron faceplate ${m[1]}`], prefer: 'Face Down/' })],
  /* the 2H and 3H Decor drawers ship with built-in supports; where a 'No Support' file exists it is the part the GLB shows */
  [new RegExp(`^DecorDrawer_(\\d+)-${SIZE}$`), (m) => ({ type: 'Drawer', names: [`decor drawer ${m[1]} ${m[2]}`, `${m[1]} ${m[2]} decor drawer`], prefer: 'No Support/' })],
  [new RegExp(`^ClassicDrawer_(\\d+)-${SIZE}$`), (m) => ({ type: 'Drawer', names: [`${m[1]} ${m[2]} classic drawer`, `classic drawer ${m[1]} ${m[2]}`] })],
  [new RegExp(`^GridfinityDecorDrawer_(\\d+)-${SIZE}$`), (m) => ({ type: 'Drawer', names: [`${m[1]} ${m[2]} decor gridfinity drawer`], prefer: 'v2609/STL/' })],
  [new RegExp(`^(\\d+)-${SIZE}_Case$`), (m) => ({ type: 'Case', names: [`${m[1]} ${m[2]} case`] })],
  /* the extenders have a helper-disk-free file, which is what the GLB shows (the cases do not: their disks are trimmed by the match) */
  [new RegExp(`^CaseExtender_(\\d+)-${SIZE}$`), (m) => ({ type: 'CaseExtender', names: [`${m[1]} ${m[2]} case extender`, `${m[1]} ${m[2].split('-')[0]} case extender`], prefer: 'No Helper Disks/' })],
  [/^CL-(\d+)-(\dW)$/, (m) => ({ type: 'CoverL', names: [`cl ${m[1]} ${m[2]}`] })],
  [/^CU-(\d+)-(\dW)$/, (m) => ({ type: 'CoverU', names: [`cu ${m[1]} ${m[2]}`] })],
  [/^FR-([LU])_(\d+)-(\dW)$/, (m) => ({ type: m[1] === 'L' ? 'FootrailL' : 'FootrailU', names: [`fr ${m[1]} ${m[2]} ${m[3]}`] })],
  [/^ShelfInsert_(\d+)-(\dW)$/, (m) => ({ type: 'ShelfInsert', names: [`${m[1]} ${m[2]} shelf insert`] })],
  [/^ShelfLip_(\dW)$/, (m) => ({ type: 'ShelfLip', names: [`shelf lip ${m[1]}`] })],
  [/^UnderTableRail_(\d+)-(\dW)$/, (m) => ({ type: 'Rail', names: [`gen2 rails ${m[1]} ${m[2]}`, `gen2 rail ${m[1]} ${m[2]}`, `gen2 ${m[1]} ${m[2]} rails`, `${m[1]} ${m[2]} rail full`] })],
  [new RegExp(`^BackCover_EdgeLabel_${SIZE}$`), (m) => ({ type: 'BackCover', names: [`${m[1]} back cover`], prefer: 'Classic/Back Covers/' })],
  [new RegExp(`^Accent_EdgeLabel_${SIZE}$`), (m) => ({ type: 'Accent', names: [`${m[1]} accent`], prefer: 'EdgeLabel/' })],
  /* side covers print face-down, so their printed top is the clip side against the case wall - never seen; and their
     GLB carries the panel's surface twice (41,050 mm2 against the STL's 21,467), which no frame match can read */
  [/^SideCover_(\d+)-(\d+H)$/, () => ({ skip: 'a side cover prints face-down: its top skin faces the case wall and is never seen' })],
  [/^WallMount_Lite_(\dW)$/, (m) => ({ type: 'Bracket', names: [`wall mount lite ${m[1]} v2602`, `wall mount lite ${m[1]}`] })],
  [/^Handle_Deco$/, () => ({ type: 'Handle', handle: 'deco', names: ['deco handle self tapping'] })],
];
export function classify(node) {
  for (const [re, fn] of RULES) { const m = node.match(re); if (m) return { node, ...fn(m) }; }
  return null;
}

/* every STL the catalog names plus every STL under the local corpus (the catalog was built from node0's copy, which
   lacks the side covers and a few renamed files); duplicates collapse */
function catalogPaths() {
  const lines = readFileSync(CATALOG_CSV, 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
  const paths = new Set(lines.map((l) => l.split(',')[1]).filter(Boolean));
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (f.toLowerCase().endsWith('.stl')) paths.add(full.slice(CORPUS.length + 1).replace(/\\/g, '/'));
    }
  };
  walk(join(CORPUS, 'GEN2'));
  return [...paths];
}
function resolveStl(spec, paths) {
  const want = spec.names.map(norm);
  /* the catalog was built on node0, so a path the local corpus lacks cannot be checked here; a folder whose name starts
     with an underscore (_fusion, _superseded, _Thangs Upload) is never the release file */
  let hits = paths.filter((p) => want.includes(norm(p.split('/').pop())) && existsSync(join(CORPUS, p)) && !p.split('/').some((seg) => seg.startsWith('_')));
  if (spec.avoid) hits = hits.filter((p) => !p.includes(spec.avoid));
  if (spec.prefer && hits.some((p) => p.includes(spec.prefer))) hits = hits.filter((p) => p.includes(spec.prefer));
  const uniq = [...new Set(hits)];
  if (uniq.length === 1) return { path: uniq[0] };
  if (!uniq.length) return { error: `no STL in the catalog named like ${spec.names.join(' | ')}` };
  /* several paths: fine when they hold the same bytes */
  const shas = new Set(uniq.map((p) => sha256(readFileSync(join(CORPUS, p)))));
  if (shas.size === 1) return { path: uniq[0], also: uniq.slice(1) };
  return { error: `${uniq.length} different STLs match: ${uniq.join(' ; ')}` };
}

function poolsOf() {
  const by = new Map();
  for (const coll of POOLS) {
    const dir = join(root, 'parts', coll);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('.lib.glb')) { const n = f.slice(0, -8); if (!by.has(n)) by.set(n, []); by.get(n).push(coll); }
  }
  return by;
}

/* the first pool that ships a node (the plan checked every pool holds the same bytes) */
function glbPathOf(node) { for (const c of POOLS) { const p = join(root, 'parts', c, node + '.lib.glb'); if (existsSync(p)) return p; } throw new Error('no GLB for ' + node); }
/* the slice frame: the STL turned by rotate_x about X (y -> -y, z -> -z for 180) */
const RX = (deg) => (deg === 180 ? [[1, 0, 0], [0, -1, 0], [0, 0, -1]] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);

async function plan() {
  mkdirSync(OUT, { recursive: true });
  const paths = catalogPaths();
  const pools = poolsOf();
  let nodes = [...pools.keys()].sort();
  if (ONLY) nodes = nodes.filter((n) => ONLY.has(n));
  if (MATCH) nodes = nodes.filter((n) => n.includes(MATCH));
  if (LIMIT) nodes = nodes.slice(0, LIMIT);
  const jobs = [], report = [];
  const t0 = Date.now();
  for (const node of nodes) {
    const row = { node, pools: pools.get(node) };
    report.push(row);
    try {
    const spec = classify(node);
    if (!spec) { row.skip = 'no rule: not a part that takes a top-layer map (hardware, a label, a handle without a pose)'; continue; }
    if (spec.skip) { row.skip = spec.skip; continue; }
    const axis = buildAxisForType(spec.type, spec.family, spec.handle);
    if (!axis) { row.skip = `no confirmed print pose for ${spec.type}${spec.family ? ' ' + spec.family : ''}`; continue; }
    row.type = spec.type; row.family = spec.family || null; row.axis = axis;
    const stl = resolveStl(spec, paths);
    if (stl.error) { row.skip = stl.error; continue; }
    row.stl = stl.path;
    const stlBytes = readFileSync(join(CORPUS, stl.path));
    row.sha256 = sha256(stlBytes);
    /* the GLB: the same bytes in every pool that ships it, or the map would be right in one collection only */
    const glbShas = new Set(row.pools.map((c) => sha256(readFileSync(join(root, 'parts', c, node + '.lib.glb')))));
    if (glbShas.size > 1) { row.skip = `the GLB differs between pools ${row.pools.join(',')}`; continue; }
    const glb = await readGlbTriangles(join(root, 'parts', row.pools[0], node + '.lib.glb'));
    const stlTri = readStlTriangles(join(CORPUS, stl.path));
    const m = matchRotation(glb, stlTri, axis);
    if (m.error) { row.skip = m.error; continue; }
    row.R = m.R; row.t = m.t.map((v) => +v.toFixed(3)); row.score = +m.score.toFixed(4); row.extentDiff = +m.extentDiff.toFixed(3);
    row.runnerUp = m.runnerUp ? { score: +m.runnerUp.score.toFixed(4) } : null;
    if (m.ambiguous) { row.skip = `ambiguous frame: the runner-up rotation scores ${m.runnerUp.score.toFixed(4)} against ${m.score.toFixed(4)}`; continue; }
    const up = rotate(m.R, axis);
    if (Math.abs(up[2]) !== 1) { row.skip = `the build axis ${JSON.stringify(axis)} maps to ${JSON.stringify(up)} in the STL frame - the STL does not lie in the pose's plane`; continue; }
    row.rotate_x = up[2] > 0 ? 0 : 180;
    /* the footprint on the bed decides the printer */
    const S = matMul(RX(row.rotate_x), m.R);
    const sp = new Float64Array(glb.positions.length);
    for (let i = 0; i < sp.length; i += 3) { const v = rotate(S, [glb.positions[i], glb.positions[i + 1], glb.positions[i + 2]]); sp[i] = v[0]; sp[i + 1] = v[1]; sp[i + 2] = v[2]; }
    const b = bounds(sp);
    row.footprint = [+b.size[0].toFixed(2), +b.size[1].toFixed(2), +b.size[2].toFixed(2)];
    const fits = (bed) => b.size[0] + 2 * BED_MARGIN_MM <= bed[0] + BED_EPS && b.size[1] + 2 * BED_MARGIN_MM <= bed[1] + BED_EPS;
    const printer = fits(CORE_ONE.bed) ? CORE_ONE : fits(XL.bed) ? XL : null;
    if (!printer) { row.skip = `footprint ${row.footprint[0]} x ${row.footprint[1]} fits no bed`; continue; }
    row.profile = printer.profile;
    jobs.push({ node, stl: stl.path, sha256: row.sha256, rotate_x: row.rotate_x, profile: printer.profile, type: spec.type, family: spec.family || null, axis, R: m.R });
    console.log(`  ${node.padEnd(36)} ${stl.path.split('/').pop().padEnd(44)} rx${row.rotate_x} ${printer === XL ? 'XL     ' : 'CoreOne'} score ${m.score.toFixed(3)}${m.runnerUp ? ' / ' + m.runnerUp.score.toFixed(3) : ''}`);
    } catch (e) { row.skip = 'error: ' + (e && e.message || e); }
  }
  const skipped = report.filter((r) => r.skip);
  writeFileSync(join(OUT, 'jobs.json'), JSON.stringify({ generated: new Date().toISOString(), jobs }, null, 1));
  writeFileSync(join(OUT, 'plan.json'), JSON.stringify({ generated: new Date().toISOString(), nodes: report.length, jobs: jobs.length, skipped: skipped.length, report }, null, 1));
  console.log(`\n${jobs.length} jobs, ${skipped.length} skipped, ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${OUT}`);
  const reasons = {};
  for (const r of skipped) { const k = r.skip.replace(/[0-9.]+/g, '#').slice(0, 70); reasons[k] = (reasons[k] || 0) + 1; }
  for (const [k, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
}

/* ---- push: the STLs node0 lacks ---- */
async function push() {
  const plan = JSON.parse(readFileSync(join(OUT, 'jobs.json'), 'utf8'));
  const want = new Map();
  for (const j of plan.jobs) want.set(j.stl, j.sha256);
  /* the list goes over stdin: 555 quoted paths overflow a Windows command line (the first run died there, and a
     `| tail` hid its exit code - the grep-gate hole, again) */
  const have = new Map();
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', 'node0', 'cd ~/models && xargs -d "\\n" sha256sum 2>/dev/null || true'],
    { encoding: 'utf8', maxBuffer: 1 << 26, input: [...want.keys()].join('\n') + '\n' });
  for (const line of out.split('\n')) { const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/); if (m) have.set(m[2].replace(/^\.\//, ''), m[1]); }
  const missing = [...want].filter(([p, sha]) => have.get(p) !== sha);
  console.log(`${want.size} STLs in the jobs; node0 has ${want.size - missing.length} with the right hash; ${missing.length} to copy`);
  /* streamed over ssh into a single-quoted path under ~/models (scp's remote-shell parsing mangled the spaces) */
  const q = (t) => "'" + t.replace(/'/g, "'\\''") + "'";
  for (const [p, sha] of missing) {
    const dir = p.split('/').slice(0, -1).join('/');
    execFileSync('ssh', ['-o', 'BatchMode=yes', 'node0', `cd ~/models && mkdir -p ${q(dir)} && cat > ${q(p)}`], { input: readFileSync(join(CORPUS, p)), maxBuffer: 1 << 28 });
    const back = execFileSync('ssh', ['-o', 'BatchMode=yes', 'node0', `cd ~/models && sha256sum ${q(p)}`], { encoding: 'utf8' }).slice(0, 64);
    if (back !== sha) throw new Error(`${p}: node0 reads ${back.slice(0, 12)} after the copy, the job wants ${sha.slice(0, 12)}`);
    console.log('  copied', p, sha.slice(0, 12));
  }
}

/* ---- the slice frame, shared by ship and vector ---- */
/* The part's bed-plane frame in the G-code: g.xy = A q + c, re-measured from the STL and the GLB rather than trusted from
   the plan. Returns { A, c, slack } or { skip, slack? }. */
async function sliceFrame(job, raw) {
  const glb = await readGlbTriangles(glbPathOf(job.node));
  const stl = readStlTriangles(join(CORPUS, job.stl));
  const m = matchRotation(glb, stl, job.axis);
  if (m.error || m.ambiguous) return { skip: 'the frame no longer matches: ' + (m.error || 'ambiguous') };
  /* the slicer saw the STL as it is (helper disks included), turned by rotate_x and centred on the bed by ITS
     bounding box, then dropped to z 0: sliced = Rx (R p + t); g = sliced - centre(Rx stl bbox) + bedCentre */
  const Rx = RX(job.rotate_x), S = matMul(Rx, m.R);                 // authored -> sliced orientation
  const stlR = new Float64Array(stl.positions.length);
  for (let i = 0; i < stlR.length; i += 3) { const v = rotate(Rx, [stl.positions[i], stl.positions[i + 1], stl.positions[i + 2]]); stlR[i] = v[0]; stlR[i + 1] = v[1]; stlR[i + 2] = v[2]; }
  const bStl = bounds(stlR);
  const centre = [(bStl.lo[0] + bStl.hi[0]) / 2, (bStl.lo[1] + bStl.hi[1]) / 2];
  const off = [raw.bed_centre_mm[0] - centre[0], raw.bed_centre_mm[1] - centre[1]];
  /* the GLB's own outline on the bed, predicted, against the G-code's extrusion above the first millimetre (the
     helper disks lie below it, outside the GLB) */
  const sp = new Float64Array(glb.positions.length);
  const tR = rotate(Rx, m.t);
  for (let i = 0; i < sp.length; i += 3) { const v = rotate(S, [glb.positions[i], glb.positions[i + 1], glb.positions[i + 2]]); sp[i] = v[0] + tR[0] + off[0]; sp[i + 1] = v[1] + tR[1] + off[1]; sp[i + 2] = v[2]; }
  const b = bounds(sp);
  const predicted = [b.lo[0], b.lo[1], b.hi[0], b.hi[1]];
  /* against the extrusion above the first millimetre (a case's helper disks lie below it) OR the whole extrusion (a
     wall bracket is a thin plate with one rib above 1 mm): a wrong frame matches neither */
  const slackOf = (ext) => (ext && Number.isFinite(ext[0])) ? Math.max(...[0, 1, 2, 3].map((k) => Math.abs(predicted[k] - ext[k]))) : Infinity;
  const slack = Math.min(slackOf(raw.gcode_extents_above_mm), slackOf(raw.gcode_extents_mm));
  const ext = slackOf(raw.gcode_extents_above_mm) <= slackOf(raw.gcode_extents_mm) ? raw.gcode_extents_above_mm : raw.gcode_extents_mm;
  if (slack > 1.0) return { slack, skip: `the predicted placement misses the G-code's extents by ${slack.toFixed(2)} mm (predicted ${predicted.map((v) => v.toFixed(2))}, g-code ${ext.map((v) => v.toFixed(2))})` };
  /* the part's bed-plane frame: q = (p . s1, p . s2); g.xy = A q + c, A the sliced images of s1 and s2 (the axis part
     of p reaches only g.z, since S maps the axis onto +-Z), c the sliced translation plus the centring */
  const [s1, s2] = SM.skinTangents(job.axis);
  const A = [rotate(S, s1), rotate(S, s2)].map((v) => [v[0], v[1]]);   // columns: A[0] = image of s1, A[1] = image of s2 (x,y)
  const c = [tR[0] + off[0], tR[1] + off[1]];
  return { A, c, slack };
}

/* ---- ship: the raw bake into the part frame ---- */
async function ship() {
  const RAW = opt('--raw', join(OUT, 'raw'));
  const plan = JSON.parse(readFileSync(join(OUT, 'jobs.json'), 'utf8'));
  const dest = DEST || join(root, 'parts', 'skin');
  mkdirSync(dest, { recursive: true });
  const index = existsSync(join(dest, 'index.json')) ? JSON.parse(readFileSync(join(dest, 'index.json'), 'utf8')) : { version: 1, pxPerMm: SM.SKIN_MAP.pxPerMm, nodes: {} };
  const report = [];
  let shipped = 0;
  for (const job of plan.jobs) {
    if (ONLY && !ONLY.has(job.node)) continue;
    if (MATCH && !job.node.includes(MATCH)) continue;
    if (FAMILIES && !FAMILIES.some((f) => job.node.startsWith(f))) continue;
    const key = `${job.sha256.slice(0, 16)}-rx${job.rotate_x}-px${SM.SKIN_MAP.pxPerMm}`;
    const row = { node: job.node, key };
    report.push(row);
    const jsonPath = join(RAW, key + '.json');
    if (!existsSync(jsonPath)) { row.skip = 'no raw bake'; continue; }
    try {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
    if (raw.failed) { row.skip = 'the bake failed: ' + raw.error; continue; }
    if (raw.stl_sha256 !== job.sha256 || raw.rotate_x_deg !== job.rotate_x) { row.skip = 'the raw bake is for another STL or rotation'; continue; }
    const fr = await sliceFrame(job, raw);
    row.extentSlack = fr.slack != null ? +fr.slack.toFixed(3) : undefined;
    if (fr.skip) { row.skip = fr.skip; continue; }
    const { A, c } = fr;
    const rgbaRaw = (await SM.decodePng(readFileSync(join(RAW, key + '.png')), (b) => inflateSync(b))).data;
    const [W, H] = raw.size_px, px = raw.px_per_mm;
    const [x0, y0] = raw.bounds_mm;
    /* the raw map's corners in q space decide the output's origin and size (A is a signed permutation, so the grid maps
       onto a grid) */
    const toQ = (gx, gy) => { const dx = gx - c[0], dy = gy - c[1]; return [A[0][0] * dx + A[0][1] * dy, A[1][0] * dx + A[1][1] * dy]; };   // A^T (g - c)
    const corners = [[x0, y0], [x0 + W / px, y0], [x0, y0 + H / px], [x0 + W / px, y0 + H / px]].map(([gx, gy]) => toQ(gx, gy));
    const q0 = [Math.min(...corners.map((v) => v[0])), Math.min(...corners.map((v) => v[1]))];
    const q1 = [Math.max(...corners.map((v) => v[0])), Math.max(...corners.map((v) => v[1]))];
    const OW = Math.round((q1[0] - q0[0]) * px), OH = Math.round((q1[1] - q0[1]) * px);
    const out = new Uint8Array(OW * OH * 4);
    for (let j = 0; j < OH; j++) for (let i = 0; i < OW; i++) {
      const qx = q0[0] + (i + 0.5) / px, qy = q0[1] + (j + 0.5) / px;
      const gx = A[0][0] * qx + A[1][0] * qy + c[0], gy = A[0][1] * qx + A[1][1] * qy + c[1];   // g = A q + c (A as columns)
      const col = Math.round((gx - x0) * px - 0.5), rowi = Math.round((gy - y0) * px - 0.5);
      if (col < 0 || col >= W || rowi < 0 || rowi >= H) continue;
      const s = (rowi * W + col) * 4, d = (j * OW + i) * 4;
      const nx = rgbaRaw[s] / 127.5 - 1, ny = rgbaRaw[s + 1] / 127.5 - 1;
      /* the normal's in-plane components follow q = A^T (g - c): n_q = A^T n_g */
      const nqx = A[0][0] * nx + A[0][1] * ny, nqy = A[1][0] * nx + A[1][1] * ny;
      out[d] = Math.max(0, Math.min(255, Math.round((nqx + 1) * 127.5)));
      out[d + 1] = Math.max(0, Math.min(255, Math.round((nqy + 1) * 127.5)));
      out[d + 2] = rgbaRaw[s + 2]; out[d + 3] = rgbaRaw[s + 3];
    }
    /* the cap: one scale for both axes, the frame's px/mm following it exactly on the width */
    let shipW = OW, shipH = OH, shipPx = px, shipped_ = out;
    if (OW * OH > MAX_MPX * 1e6) {
      const sc = Math.sqrt(MAX_MPX * 1e6 / (OW * OH));
      shipW = Math.max(1, Math.round(OW * sc)); shipH = Math.max(1, Math.round(OH * sc));
      shipPx = shipW / (OW / px);
      shipped_ = SM.resampleMap(out, OW, OH, shipW, shipH);
    }
    if (RG_BITS < 8) {
      /* quantise the normal's two channels around the flat value 128 (a zero normal must stay exactly flat) */
      const step = 1 << (8 - RG_BITS);
      const q = shipped_ === out ? new Uint8Array(shipped_) : shipped_;
      for (let i = 0; i < q.length; i += 4) { q[i] = Math.max(0, Math.min(255, Math.round((q[i] - 128) / step) * step + 128)); q[i + 1] = Math.max(0, Math.min(255, Math.round((q[i + 1] - 128) / step) * step + 128)); }
      shipped_ = q;
    }
    const png = SM.encodePng(shipped_, shipW, shipH, (b) => deflateSync(b, { level: 9 }));
    writeFileSync(join(dest, job.node + '.png'), png);
    index.nodes[job.node] = {
      file: job.node + '.png', size: [shipW, shipH], q0: [+q0[0].toFixed(4), +q0[1].toFixed(4)], pxPerMm: +shipPx.toFixed(5), axis: job.axis,
      skinLayersZ: raw.skin_layers_z, topAngleDeg: raw.top_infill_angle_deg, crownMm: raw.crown_mm,
      rgBits: RG_BITS,
      bake: { stl: job.stl, stlSha256: job.sha256, rotateX: job.rotate_x, profile: raw.profile, slicer: raw.slicer, bakeVersion: raw.bake_version, key },
      pngSha256: sha256(png), bytes: png.length,
    };
    row.size = [shipW, shipH]; row.bakedSize = [OW, OH]; row.pxPerMm = +shipPx.toFixed(3); row.bytes = png.length; row.q0 = index.nodes[job.node].q0;
    shipped++;
    console.log(`  ${job.node.padEnd(36)} ${shipW}x${shipH}${shipW !== OW ? ' (baked ' + OW + 'x' + OH + ', ' + shipPx.toFixed(2) + ' px/mm)' : ''}  ${(png.length / 1024).toFixed(0)} KB  q0 ${row.q0}  slack ${slack.toFixed(3)}`);
    } catch (e) { row.skip = 'error: ' + ((e && e.message) || e); console.log(`  ${job.node.padEnd(36)} ERROR ${row.skip.slice(0, 100)}`); }
  }
  index.generated = new Date().toISOString();
  writeFileSync(join(dest, 'index.json'), JSON.stringify(index, null, 1));
  writeFileSync(join(OUT, 'ship.json'), JSON.stringify({ generated: index.generated, shipped, report }, null, 1));
  console.log(`\n${shipped} maps shipped to ${dest}; ${report.filter((r) => r.skip).length} skipped -> ${join(OUT, 'ship.json')}`);
  for (const r of report.filter((r) => r.skip)) console.log(`  skip ${r.node}: ${r.skip}`);
}

/* ---- check: every shipped map against its GLB ---- */
async function check() {
  const dest = join(root, 'parts', 'skin');
  const index = JSON.parse(readFileSync(join(dest, 'index.json'), 'utf8'));
  const rows = [];
  for (const [node, e] of Object.entries(index.nodes)) {
    if (ONLY && !ONLY.has(node)) continue;
    if (MATCH && !node.includes(MATCH)) continue;
    const map = await SM.decodePng(readFileSync(join(dest, e.file)), (b) => inflateSync(b));
    const glb = await readGlbTriangles(glbPathOf(node));
    const real = skinCoverage(glb, e.axis, map, e);
    const controls = [[true, false], [false, true], [true, true]].map((flip) => skinCoverage(glb, e.axis, map, e, { flip }).rate);
    const row = { node, rate: +real.rate.toFixed(4), control: +Math.max(...controls).toFixed(4), visibleMm2: Math.round(real.areaMm2), hiddenMm2: Math.round(real.hiddenMm2),
      byHeight: Object.fromEntries(Object.entries(real.byHeight).filter(([, v]) => v.area > 200).map(([h, v]) => [h, +(v.agree / v.area).toFixed(3)])) };
    rows.push(row);
    console.log(`  ${node.padEnd(36)} agree ${(row.rate * 100).toFixed(1).padStart(5)} %  control ${(row.control * 100).toFixed(1).padStart(5)} %  visible ${row.visibleMm2} mm2`);
  }
  /* weak = the map disagrees with the GLB's visible top skins; the mirrored controls are reported, not judged: a flat
     cover tile's mirrored map covers its top just as well (the frame's sense matters only where the part is asymmetric,
     and there - the EdgeLabel's window and tab - the unit test reads it) */
  const weak = rows.filter((r) => r.rate < 0.8);
  writeFileSync(join(OUT, 'check.json'), JSON.stringify({ generated: new Date().toISOString(), maps: rows.length, weak: weak.map((r) => r.node), rows }, null, 1));
  console.log(`
${rows.length} maps checked; ${weak.length} weak (agree under 80 %) -> ${join(OUT, 'check.json')}`);
  for (const r of weak) console.log(`  weak ${r.node}: agree ${(r.rate * 100).toFixed(1)} %, control ${(r.control * 100).toFixed(1)} %`);
}

/* ---- vector: the first layer, as numbers and a distance field (2026-10-28) ---- */
/* Joey 2026-10-28: a part printed face down on the smooth sheet still shows its first layer's beads, and the baked maps'
   8 px/mm went soft up close - "is there a way to produce the texture as vectors?". The first layer's solid infill is
   ONE family of parallel lines on one grid (angle, spacing, phase - fitted from the G-code by
   D:/MODULITH/ops/slicing/skin_vector.py, every line within 0.05 mm on the parts tried), so the shader draws every bead
   from three numbers; the perimeter loops follow the outline, so they come from a distance field to it, which stays
   crisp when magnified because distances interpolate where pictures blur. This carries the raw extraction (G-code
   frame) into the part frame with the frame ship measures, and adds `first` to the node's index entry:
     file      <node>.first.png  R = signed distance to the first layer's outline, (mm + 1) / SDF_STEP, 8 bits
     q0, pxPerMm, size           the field's frame, as a map's
     n, spacing, phase           the infill family in q: a bead's centre where dot(n, q) - phase is a multiple of spacing
     width, bands, ringWidth     the infill bead width, the perimeter centres' distances from the outline, their width */
const SDF_STEP = 0.0125;          // mm a level: 255 levels span -1 .. +2.19 mm, past every perimeter band
const FIRST_FIT_MIN = 0.85;     // the line-weighted share of first-layer lines on their island's grid within 0.05 mm, to ship
async function vector() {
  const RAW = opt('--raw', join(OUT, 'raw'));
  const VRAW = opt('--vraw', null);
  if (!VRAW) throw new Error('vector needs --vraw <dir> holding <key>.first.json and <key>.first-sdf.png');
  const plan = JSON.parse(readFileSync(join(OUT, 'jobs.json'), 'utf8'));
  const dest = DEST || join(root, 'parts', 'skin');
  mkdirSync(dest, { recursive: true });
  const index = existsSync(join(dest, 'index.json')) ? JSON.parse(readFileSync(join(dest, 'index.json'), 'utf8')) : { version: 1, pxPerMm: SM.SKIN_MAP.pxPerMm, nodes: {} };
  const report = [];
  for (const job of plan.jobs) {
    if (ONLY && !ONLY.has(job.node)) continue;
    if (MATCH && !job.node.includes(MATCH)) continue;
    if (FAMILIES && !FAMILIES.some((f) => job.node.startsWith(f))) continue;
    const key = `${job.sha256.slice(0, 16)}-rx${job.rotate_x}-px${SM.SKIN_MAP.pxPerMm}`;
    const row = { node: job.node, key };
    report.push(row);
    const rawPath = join(RAW, key + '.json'), vPath = join(VRAW, key + '.first.json');
    if (!existsSync(rawPath) || !existsSync(vPath)) { row.skip = 'no raw bake or no first-layer extraction'; continue; }
    if (!index.nodes[job.node]) { row.skip = 'the node has no shipped top map to ride with'; continue; }
    const raw = JSON.parse(readFileSync(rawPath, 'utf8')), v = JSON.parse(readFileSync(vPath, 'utf8'));
    if (raw.failed || v.failed) { row.skip = 'the bake or the extraction failed'; continue; }
    if (v.key !== key) { row.skip = 'the extraction is for another bake'; continue; }
    /* the islands' families (skin_vector.py version 2): an island's own phase and spacing, the line-weighted fit over them */
    /* 0.85: the EdgeLabel 1W-1H faceplate, in the 185 2W-2H kit, fits 0.895; every line still lies on the drawn grid within
       0.05 mm for 85 % or more of the layer */
    if (!v.family || !(v.islandFit >= FIRST_FIT_MIN)) { row.skip = `the first layer's islands are not line families (fit ${v.islandFit})`; continue; }
    /* the 8-bit field saturates at -1 + 255 * SDF_STEP mm: past the last perimeter band's outer edge it must still be
       distinct, or the interior reads as a ring with no direction and draws nothing (Sol 01a183fd) */
    const ringEdge = Math.max(0, ...v.bands) + v.ringWidth / 2 + 0.1;
    if (ringEdge >= -1 + 255 * SDF_STEP) { row.skip = `the perimeters reach ${ringEdge.toFixed(2)} mm, past the field's range`; continue; }
    const fr = await sliceFrame(job, raw);
    if (fr.skip) { row.skip = fr.skip; continue; }
    const { A, c } = fr;
    const src = (await SM.decodePng(readFileSync(join(VRAW, key + '.first-sdf.png')), (b) => inflateSync(b))).data;
    const [W, H] = v.size, px = v.px, [x0, y0] = v.bounds;
    const dAt = (col, rowi) => { const s = (rowi * W + col) * 4; return (src[s] * 256 + src[s + 1]) / 1000 - 2; };   // the extraction's 16-bit field
    /* an island's family moves into the part frame like the layer's: same angle, so its phase shifts by the same dot(n_g, c),
       as a fraction of its own spacing (js/skin-map.js islandPhaseByte, pinned by test/skin-map.test.mjs) */
    const th = v.family.angleDeg * Math.PI / 180, nc = -Math.sin(th) * c[0] + Math.cos(th) * c[1];
    const toQ = (gx, gy) => { const dx = gx - c[0], dy = gy - c[1]; return [A[0][0] * dx + A[0][1] * dy, A[1][0] * dx + A[1][1] * dy]; };
    const corners = [[x0, y0], [x0 + W / px, y0], [x0, y0 + H / px], [x0 + W / px, y0 + H / px]].map(([gx, gy]) => toQ(gx, gy));
    const q0 = [Math.min(...corners.map((p) => p[0])), Math.min(...corners.map((p) => p[1]))];
    const q1 = [Math.max(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[1]))];
    const OW = Math.round((q1[0] - q0[0]) * px), OH = Math.round((q1[1] - q0[1]) * px);
    const out = new Uint8Array(OW * OH * 4);
    for (let j = 0; j < OH; j++) for (let i = 0; i < OW; i++) {
      const qx = q0[0] + (i + 0.5) / px, qy = q0[1] + (j + 0.5) / px;
      const gx = A[0][0] * qx + A[1][0] * qy + c[0], gy = A[0][1] * qx + A[1][1] * qy + c[1];
      const col = Math.round((gx - x0) * px - 0.5), rowi = Math.round((gy - y0) * px - 0.5);   // A is a signed permutation: grid onto grid
      const inside = !(col < 0 || col >= W || rowi < 0 || rowi >= H);
      const d = inside ? dAt(col, rowi) : -1;
      const o = (j * OW + i) * 4;
      /* R the field; G unused (flat 128 - resampleMap box-averages R and G); B, A the island's phase and spacing bytes,
         which resampleMap takes from the nearest texel, never averaged */
      out[o] = Math.max(0, Math.min(255, Math.round((d + 1) / SDF_STEP))); out[o + 1] = 128;
      const s = inside ? (rowi * W + col) * 4 : -1;
      out[o + 2] = s >= 0 && src[s + 3] ? SM.islandPhaseByte(src[s + 2], src[s + 3], nc) : 0;
      out[o + 3] = s >= 0 ? src[s + 3] : 0;
    }
    /* the line family in the part frame (js/skin-map.js lineFamilyInPart, pinned by test/skin-map.test.mjs) */
    const { n: nq, spacing: sp, phase } = SM.lineFamilyInPart(v.family, A, c);
    const png = SM.encodePng(out, OW, OH, (b) => deflateSync(b, { level: 9 }));
    writeFileSync(join(dest, job.node + '.first.png'), png);
    index.nodes[job.node].first = {
      file: job.node + '.first.png', size: [OW, OH], q0: [+q0[0].toFixed(4), +q0[1].toFixed(4)], pxPerMm: px, sdfStepMm: SDF_STEP,
      n: [+nq[0].toFixed(6), +nq[1].toFixed(6)], spacing: +sp.toFixed(5), phase: +phase.toFixed(5), width: +v.family.width.toFixed(4),
      bands: v.bands, ringWidth: v.ringWidth, fit: v.family.fit, islands: v.islands, islandFit: v.islandFit, extractVersion: v.version, pngSha256: sha256(png), bytes: png.length,
    };
    row.size = [OW, OH]; row.bytes = png.length; row.bands = v.bands;
    console.log(`  ${job.node.padEnd(36)} first ${OW}x${OH}  ${(png.length / 1024).toFixed(0)} KB  ${v.family.angleDeg.toFixed(1)} deg  ${sp.toFixed(3)} mm  bands ${v.bands}`);
  }
  writeFileSync(join(dest, 'index.json'), JSON.stringify(index, null, 1));
  writeFileSync(join(OUT, 'vector-report.json'), JSON.stringify(report, null, 1));
  const n = report.filter((r) => !r.skip).length;
  console.log(`vector: ${n} shipped, ${report.length - n} skipped -> ${dest}`);
}

if (cmd === 'plan') await plan();
else if (cmd === 'push') await push();
else if (cmd === 'ship') await ship();
else if (cmd === 'vector') await vector();
else if (cmd === 'check') await check();
else { console.error('usage: node tools/skin-map.mjs plan|push|ship|check [options]'); process.exit(2); }
