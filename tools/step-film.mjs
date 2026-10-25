/* FRAME-BY-FRAME FILMS OF THE INSTRUCTION STEPS, every frame converged (2026-10-25).
 *
 * Joey wants the instruction clips from the planner itself, at its Very High tier, instead of a Blender render. The live
 * step engine cannot give that: it tweens positions only (no rotation), AO is held off while anything tweens, and Very
 * High's accumulation (ACC_SAMPLES jittered samples, the powder-coat settle detail) only runs at rest - so a frame grabbed
 * mid-tween is a single hard sample with stale or missing occlusion. This tool does not use the engine for the motion. It
 * pages the stage to the step with every part in its resting pose (goTo(page, { animate: false })), pauses the render
 * loop, and for every film frame places the moving parts itself - the engine's own phases, offsets, eases and timings
 * (DUR, QL_DIP, the dip and pop curves) re-played deterministically on the film clock, or an authored curve - then drives
 * the planner's own passes synchronously the way captureShot() does for a still: updateAO(true) and its jittered passes
 * to ao.accumMax, accumFrame() until acc.n reaches ACC_SAMPLES, compositeAO(), and reads the canvas in the SAME task (no
 * preserveDrawingBuffer needed; an await between render and read hands back an empty buffer). Nothing here is production
 * code: it reaches the stage through the ?debug=1 hook (window.__GEN2_VIEWER__), and the three handles it needed added
 * there (setCamOverride, loopTick, markShadowDirty) are debug-only like the rest of that object.
 *
 * The five under-table clips (the site's ut-step-*.mp4), on one build: 185, 2W, a 1H decor drawer case in the rail and one
 * hanging under it, magnet closure, NO side covers (sideCovers: false, Joey 2026-10-25) - see CLIPS. The drawer step's
 * motion is the Blender-verified corridor from render-assets/.../instruction-anims/blender/step4/curve.mjs (its PCHIP and
 * keys reproduced below verbatim; --curve <curve.json> samples that file instead), pitched about the drawer's rear-bottom
 * edge read from the instance's own bounding box.
 *
 *   node tools/step-film.mjs [rail first under drawers release ...] [--out <dir>] [--start 150] [--fps 30]
 *                            [--theme light|dark] [--curve <json>] [--check-curve <json>] [--no-proof] [--frames-only]
 *                            [--w 1200 --h 594] [--lenient] [--headful]
 *
 * Output per clip: <out>/<name>/frames/frame_NNN.png, <out>/ut-step-<name>.mp4 (H.264 yuv420p crf 20 +faststart),
 * <out>/ut-step-<name>-poster.jpg (frame 0), <out>/ut-step-<name>-sheet.png (8 frames), <out>/<name>/run.json; for the
 * drawers clip also a proof PNG (three mid-motion frames the stale-buffer way over the same three converged).
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const OUT = opt('--out', join('D:/Claude - Output/instruction-anims-2026-10-25', 'ut-clips'));
const START = +opt('--start', 205);        // the drawer's dz at t = 0, mm out of the flush pose (250 = the authored level start; 205 = pitched at the mouth, the nearest start that still shows the entry - see motion())
const FPS = +opt('--fps', 30);
const THEME = opt('--theme', 'light');
const W = +opt('--w', 1200), H = +opt('--h', 594);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const WANTED = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--no-proof', '--frames-only', '--lenient', '--headful'].includes(args[i - 1])));

/* ---- the engine's clock, reproduced (js/main.js DUR, QL_DIP, the dip and pop tweens; generate.js dipFrom) ----------- */
const DUR = { enter: 750, move: 600, stagger: 130, pop: 320, popStagger: 45 };
const QL_DIP = 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);   // tween(): easeInOutCubic
const smooth = (e) => e * e * (3 - 2 * e);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const dipFrom = (travel, depth = 185, qlZ = 65.02) => Math.min(0.92, Math.max(0.1, 1 - (depth / 2 - qlZ - 10) / travel));   // generate.js 1362
/* a tab pressed over the slide: 0 before (f0 - lead), QL_DIP down at f0, held after (the dip tween) */
const dipY = (k, f0) => { const lead = Math.min(0.12, f0); const e = k <= f0 - lead ? 0 : k >= f0 ? 1 : (k - (f0 - lead)) / lead; return -QL_DIP * smooth(e); };
/* the spring release from the held dip, a small damped overshoot, exactly 0 at the end (the pop tween) */
const popY = (k) => (k >= 1 ? 0 : -QL_DIP * (1 - k) * (1 - k) * Math.cos(5.2 * k));
/* progress of a tween that starts at t0 and lasts d seconds; null before it starts */
const prog = (t, t0, d) => (t < t0 ? null : clamp01((t - t0) / d));

/* ---- the drawer motion (curve.mjs, reproduced; see the file header) ----------------------------------------------- */
function pchip(xs, ys, slope0 = null, slope1 = null) {
  const n = xs.length, h = [], d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  m[0] = slope0 ?? d[0]; m[n - 1] = slope1 ?? d[n - 2];
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
/* dz over time (rest to 0.4, tilt-and-approach to 0.9, the rear under the lip by ~1.6, level out to ~2.7, home by 3.3,
   rest to the end), and pitch / drop as FUNCTIONS OF dz - the corridor. The start offset only says where on that corridor
   the clip begins: at 250 the drawer starts level and pitches up on its way in (the authored clip); at 205 it starts
   already pitched 15 deg at the mouth, the approach key dropped; between, part-pitched. ⚠ It cannot start nearer than
   182: there the drawer's rear is passing under the stopper lip, and nearer still it is already inside the case - a
   level drawer at dz 150 is 20 mm past the stoppers, which is not an insertion (the first --start 150 render was that,
   with no pitch at all; caught 2026-10-25). The approach key is dropped once the start is at or inside it. */
const START_MIN = 182;
function motion(start) {
  if (!(start >= START_MIN)) throw new Error(`--start ${start}: the drawer's rear passes under the stopper lip at dz ~182, so the clip cannot start nearer than ${START_MIN} mm (205 = pitched at the mouth, 250 = the authored level start)`);
  const tKeys = [[0.4, start], ...[[0.9, 205], [1.6, 181], [2.7, 166], [3.3, 0]].filter((k) => k[1] < start - 1e-9)];
  const dzOfT = pchip(tKeys.map((k) => k[0]), tKeys.map((k) => k[1]), 0, 0);
  const Z_KEYS = [
    [0, 0, 0], [165, 0, 0], [167.4, 2, -0.1], [170.4, 4.5, -0.2], [172.9, 7.5, -0.3], [175.9, 10.5, -0.35],
    [177.6, 12.8, -0.6], [178.6, 14.2, -1.3], [179.4, 15, -2.4], [182.0, 15, -2.5], [205, 15, -2.0], [250, 0, 0],
  ].concat(start > 250 ? [[start, 0, 0]] : []);
  const pitchOfZ = pchip(Z_KEYS.map((k) => k[0]), Z_KEYS.map((k) => k[1]), 0, 0);
  const dyOfZ = pchip(Z_KEYS.map((k) => k[0]), Z_KEYS.map((k) => k[2]), 0, 0);
  return (t) => { const dz = t <= 0.4 ? start : t >= 3.3 ? 0 : dzOfT(t); return { dz, deg: pitchOfZ(dz), dy: dyOfZ(dz) }; };
}
/* --curve: the 120 Hz samples from curve.json, linearly interpolated (a 30 fps frame lands exactly on a sample) */
function sampled(json) {
  const s = json.samples;
  return (t) => {
    const x = t * 120, i = Math.max(0, Math.min(s.length - 2, Math.floor(x))), f = Math.min(1, Math.max(0, x - i));
    const a = s[i], b = s[i + 1], mix = (k) => a[k] + (b[k] - a[k]) * f;
    return { dz: mix('dz'), deg: mix('deg'), dy: mix('dy') };
  };
}
/* the drawer's rigid pose: dz along +Z, dy, pitch (front UP) about the rear-bottom edge P: world = base + [0,dy,dz] + (P - R P) + R v,
   R a turn of -deg about +X (+Z toward +Y is a negative turn about +X); the riders take the same transform */
/* ⚠ the pivot is taken RELATIVE TO THE GROUP ORIGIN (p = P - base): the group rotates its local geometry about its own
   origin, so a world pivot P needs position' = P + R (base - P) = base + p - R p. The first version used P itself and
   put the drawer ~2 mm off its edge at full pitch (Terra 01a17549); the pilot of 2026-10-25 17:54 carried that. */
function pitched(base, pivot, { dz, dy, deg }) {
  const th = -deg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  const p = [pivot[0] - base[0], pivot[1] - base[1], pivot[2] - base[2]];
  const Rp = [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
  return { pos: [base[0] + p[0] - Rp[0], base[1] + dy + p[1] - Rp[1], base[2] + dz + p[2] - Rp[2]], rotX: th };
}
/* the world AABB of a box put through the same rigid pose (for the camera fit) */
function pitchedBox(b, pivot, q) {
  const th = -q.deg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), pts = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
    const ry = y - pivot[1], rz = z - pivot[2];
    pts.push([x, pivot[1] + q.dy + ry * c - rz * s, pivot[2] + q.dz + ry * s + rz * c]);
  }
  return { min: [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]))), max: [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i]))) };
}

/* ---- the clips ---------------------------------------------------------------------------------------------------
   Each: the step whose after-state is the stage (title regex -> page), the clip's length, the parts hidden for it (id
   regexes; the side covers are not generated at all), the camera (az deg toward +X off the front normal, el deg above
   level, fov, a target and an offset toward the camera, which boxes set the height and which must fit sideways), and
   frames(t, S) -> placements for the moving parts, S being what SETUP read (bases, boxes, surfaceUnderY).
   Every clip rests 0.4 s at the start and at least 1.0 s at the end, then the loop cuts back to t 0. */
const REST = 0.4;
const box = (S, id) => { const b = S.boxes[id]; if (!b) throw new Error('no visible instance ' + id); return b; };
const shifted = (b, d) => ({ min: [b.min[0] + d[0], b.min[1] + d[1], b.min[2] + d[2]], max: [b.max[0] + d[0], b.max[1] + d[1], b.max[2] + d[2]] });
const union = (...bs) => ({ min: [0, 1, 2].map((i) => Math.min(...bs.map((b) => b.min[i]))), max: [0, 1, 2].map((i) => Math.max(...bs.map((b) => b.max[i]))) });
const centre = (b) => [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
const at = (S, id, d = [0, 0, 0]) => [S.bases[id][0] + d[0], S.bases[id][1] + d[1], S.bases[id][2] + d[2]];
/* the under-table stand-off (UT.fwd = DEPTH + 40) and the drawer pop-out (depth + 5) for the 185 collection */
const UT_FWD = 225, DRW_POP = 190;
const MARGIN = 0.08;   // the whole-path fit: every keyframe box of every moving part inside 8 % of the frame on all four sides (Joey 2026-10-25)

const CLIPS = {
  /* step 1: the rail rises 70 mm to its seat 2 mm under the slab, then the six screws rise 45 mm into it, staggered */
  rail: {
    title: '^Screw the rail', dur: 4.5, hide: [/^mc|^mg|^st/],
    camera: (S) => { const rail = box(S, 'utr0'), screws = union(...S.ids.filter((i) => /^uts/.test(i)).map((i) => box(S, i)));
      const seat = union(rail, screws), start = union(shifted(rail, [0, -70, 0]), shifted(screws, [0, -45, 0]));
      return { az: 24, el: -12, fov: 34, target: centre(union(seat, start)), toward: 0, fitBoxes: [seat, start], margin: MARGIN }; },
    frames: (t, S) => {
      const out = [];
      /* the rail waits at its start pose through the opening rest (the engine shows it only as its phase starts; a loop
         that opened on an empty slab read as a cut), the screws appear as their phases start, under the seated rail */
      { const k = prog(t, REST, DUR.enter / 1000); out.push({ id: 'utr0', visible: true, pos: at(S, 'utr0', [0, -70 * (1 - easeInOut(k ?? 0)), 0]) }); }
      S.ids.filter((i) => /^uts/.test(i)).forEach((id, n) => {
        const k = prog(t, REST + DUR.enter / 1000 + n * DUR.stagger / 1000, DUR.enter / 1000);
        out.push({ id, visible: k != null, pos: at(S, id, [0, -45 * (1 - easeInOut(k ?? 0)), 0]) });
      });
      return out;
    },
  },
  /* step 2: the top case appears 285 mm out front and slides to the 225 mm stand-off - HELD LOWER (UT_HOLD mm) than the
     rails, because the slab's underside is flush with the rail top (surfaceUnderY = the rail's top, fitSurface) and a
     case at rail height has only 3.9 mm of air above it: the engine's 45 mm QuickLock drop happens there with the slab
     hidden by its overhead camera, and under a visible slab it cannot. So: the two QuickLocks drop their 45 mm into the
     walls of the lowered case, the case rises to rail height (an added beat, not an engine phase), then it slides 225 mm
     back into the rails with the tabs pressed 3 mm over the last of the travel, and they pop */
  first: {
    title: '^Slide the case into the rails', dur: 5.4, hide: [/^mc|^mg|^st/],
    /* every keyframe of every moving part is fitted: the case out at 285 (held low), at the stand-off, seated; the locks at
       the top of their drop and seated */
    camera: (S) => { const seat = union(...['utr0', 'case1', 'ql1L', 'ql1R'].map((i) => box(S, i))), c = box(S, 'case1');
      const locksUp = union(shifted(box(S, 'ql1L'), [0, 45 - S.hold, UT_FWD]), shifted(box(S, 'ql1R'), [0, 45 - S.hold, UT_FWD]));
      return { az: 18, el: -5, fov: 34, target: centre(union(seat, shifted(c, [0, -S.hold, UT_FWD + 60]))), toward: 0, fitBoxes: [seat, shifted(c, [0, -S.hold, UT_FWD + 60]), shifted(c, [0, -S.hold, UT_FWD]), locksUp], margin: MARGIN }; },
    /* the hold: the locks' start pose must sit at least 10 mm under the slab's underside in world y, AND project under
       the slab's front edge on screen (the case stands in front of the table edge, nearer the camera than the slab, so a
       lock lower than the slab in the world can still show above its edge line) */
    minHold: (S) => Math.max(0, box(S, 'ql1L').max[1] + 45 - (S.surfaceUnderY - 10)),
    slabCheck: (S) => [shifted(box(S, 'ql1L'), [0, 45 - S.hold, UT_FWD]), shifted(box(S, 'ql1R'), [0, 45 - S.hold, UT_FWD])],
    frames: (t, S) => {
      const out = [];
      const tCase = REST, tL = tCase + DUR.enter / 1000 + 0.2, tR = tL + DUR.stagger / 1000, tRise = tR + DUR.enter / 1000 + 0.2, tSlide = tRise + 0.5 + 0.3, tPop = tSlide + DUR.move / 1000;
      const kc = prog(t, tCase, DUR.enter / 1000), kr = prog(t, tRise, 0.5), ks = prog(t, tSlide, DUR.move / 1000);
      const z = ks != null ? UT_FWD * (1 - easeInOut(ks)) : UT_FWD + 60 * (1 - easeInOut(kc ?? 0));   // 285 -> 225 (enter), then 225 -> 0 (move; both eased by tween())
      const y = -S.hold * (1 - easeInOut(kr ?? 0));
      out.push({ id: 'case1', visible: true, pos: at(S, 'case1', [0, y, z]) });
      [['ql1L', tL, 0], ['ql1R', tR, 1]].forEach(([id, t0, n]) => {
        const kd = prog(t, t0, DUR.enter / 1000), kp = prog(t, tPop + n * DUR.popStagger / 1000, DUR.pop / 1000);
        const childY = kp != null ? popY(kp) : ks != null ? dipY(easeInOut(ks), dipFrom(UT_FWD)) : 0;   // the dip reads the eased progress (span = the move tween)
        out.push({ id, visible: kd != null, pos: at(S, id, [0, y + 45 * (1 - easeInOut(kd ?? 0)), z]), childY });
      });
      return out;
    },
  },
  /* step 3: the lower case stands at the stand-off; its QuickLocks drop in first, then case and locks slide 225 mm back
     under the upper case with the dip and the pop */
  under: {
    title: '^Hang case', dur: 4.8, hide: [/^mc|^mg|^st/],
    camera: (S) => { const seat = union(...['utr0', 'case1', 'case0', 'ql0L', 'ql0R'].map((i) => box(S, i))), c = box(S, 'case0');
      const locksUp = union(shifted(box(S, 'ql0L'), [0, 45 - S.hold, UT_FWD]), shifted(box(S, 'ql0R'), [0, 45 - S.hold, UT_FWD]));
      return { az: 18, el: -4, fov: 34, target: centre(union(seat, shifted(c, [0, -S.hold, UT_FWD]))), toward: 0, fitBoxes: [seat, shifted(c, [0, -S.hold, UT_FWD]), locksUp], margin: MARGIN }; },
    /* the same slab rule as `first`: the case is held lower if the locks' start pose would show above the slab's edge, and
       rises before the slide (the hold is 0 when nothing needs it) */
    minHold: (S) => Math.max(0, box(S, 'ql0L').max[1] + 45 - (S.surfaceUnderY - 10)),
    slabCheck: (S) => [shifted(box(S, 'ql0L'), [0, 45 - S.hold, UT_FWD]), shifted(box(S, 'ql0R'), [0, 45 - S.hold, UT_FWD])],
    frames: (t, S) => {
      const out = [];
      const tL = REST, tR = tL + DUR.stagger / 1000, tRise = tR + DUR.enter / 1000 + 0.2, riseD = S.hold > 0 ? 0.5 : 0, tSlide = tRise + riseD + 0.3, tPop = tSlide + DUR.enter / 1000;
      const kr = prog(t, tRise, Math.max(riseD, 1e-6)), ks = prog(t, tSlide, DUR.enter / 1000);
      const z = UT_FWD * (1 - easeInOut(ks ?? 0));   // a sync enter: eased, 750 ms
      const y = -S.hold * (1 - easeInOut(kr ?? 0));
      out.push({ id: 'case0', visible: true, pos: at(S, 'case0', [0, y, z]) });
      [['ql0L', tL, 0], ['ql0R', tR, 1]].forEach(([id, t0, n]) => {
        const kd = prog(t, t0, DUR.enter / 1000), kp = prog(t, tPop + n * DUR.popStagger / 1000, DUR.pop / 1000);
        const childY = kp != null ? popY(kp) : ks != null ? dipY(easeInOut(ks), dipFrom(UT_FWD)) : 0;
        out.push({ id, visible: kd != null, pos: at(S, id, [0, y + 45 * (1 - easeInOut(kd ?? 0)), z]), childY });
      });
      return out;
    },
  },
  /* step 4: the lower drawer, pitched front-up, enters rear first under the stopper lip and levels as it slides flush -
     the Blender-verified corridor, pivot = the drawer's rear-bottom edge; its magnet clip and magnet ride it */
  drawers: {
    title: '^Drawers', dur: 4.5, hide: [], proof: [1.5, 2.1, 3.0],
    camera: (S) => { const seat = union(...S.ids.filter((i) => !/^drw0$|^dc0$|^dm0$/.test(i)).map((i) => box(S, i)));
      const d = box(S, 'drw0'), pivot = [(d.min[0] + d.max[0]) / 2, d.min[1], d.min[2]];
      const path = []; for (let t = 0; t <= 4.5; t += 0.05) path.push(pitchedBox(d, pivot, S.pose(t)));   // the whole pitched path, not only the start pose
      const opening = [(d.min[0] + d.max[0]) / 2, (d.min[1] + d.max[1]) / 2, S.caseFront];
      return { az: 40, el: -4, fov: 34, target: opening, toward: 40, heightBoxes: [seat], allBoxes: [seat, union(...path)], headroom: 0.10, side: 0.08 }; },
    frames: (t, S) => {
      const q = S.pose(t), d = box(S, 'drw0'), pivot = [(d.min[0] + d.max[0]) / 2, d.min[1], d.min[2]];
      return ['drw0', ...S.riders('drw0')].map((id) => { const p = pitched(S.bases[id], pivot, q); return { id, visible: true, pos: p.pos, rotX: p.rotX, meta: q }; });
    },
    /* the pivot, measured: at full pitch the drawer's lowest point must be its rear-bottom edge at pivot.y + dy */
    check: (S) => { const d = box(S, 'drw0'), q = S.pose(1.5); return { t: 1.5, id: 'drw0', expectMinY: d.min[1] + q.dy, expectMaxY: pitchedBox(d, [0, d.min[1], d.min[2]], q).max[1] }; },
  },
  /* step 5 (no engine step): cases only - the lower drawer slides out and leaves, both tabs are pressed 3 mm, the case
     and its locks slide 230 mm out of the rails, the springs rising as the tabs clear the slots (dz 25..43 mm) */
  release: {
    title: '^Drawers', dur: 5.0, hide: [/^drw1$|^dc|^dm|^mc|^mg|^st/],
    /* fitted: the seated stack, the case and its locks 230 mm out, the drawer at its 190 mm pop-out (it then leaves the
       frame on purpose, so its exit path is not fitted) */
    camera: (S) => { const seat = union(...['utr0', 'case1', 'case0', 'ql0L', 'ql0R'].map((i) => box(S, i))), end = shifted(union(box(S, 'case0'), box(S, 'ql0L'), box(S, 'ql0R')), [0, 0, 230]), drw = shifted(box(S, 'drw0'), [0, 0, DRW_POP]);
      return { az: 18, el: -3, fov: 34, target: centre(union(seat, end)), toward: 0, fitBoxes: [seat, end, drw], margin: MARGIN }; },
    /* the drawer is hidden once it has travelled DRW_POP + 700 mm: that pose must already be out of the frame (Terra 01a17549) */
    offFrame: (S) => shifted(box(S, 'drw0'), [0, 0, DRW_POP + 700]),
    frames: (t, S) => {
      const out = [];
      const tOut = REST, tPress = tOut + 1.2 + 0.3, tPull = tPress + 0.3 + 0.3;
      { const k1 = prog(t, tOut, DUR.move / 1000), k2 = prog(t, tOut + DUR.move / 1000, 0.6);
        const z = k2 != null ? DRW_POP + 700 * k2 : DRW_POP * easeInOut(k1 ?? 0);   // 190 mm in 600 ms as the engine's move, then on out of the frame
        out.push({ id: 'drw0', visible: !(k2 != null && k2 >= 1), pos: at(S, 'drw0', [0, 0, z]) }); }
      const kp = prog(t, tPress, 0.3), ku = prog(t, tPull, 1.3), dz = 230 * easeInOut(ku ?? 0);
      const rise = smooth(clamp01((dz - 25) / (43 - 25)));
      const childY = ku != null ? -QL_DIP * (1 - rise) : kp != null ? -QL_DIP * smooth(kp) : 0;
      out.push({ id: 'case0', visible: true, pos: at(S, 'case0', [0, 0, dz]) });
      for (const id of ['ql0L', 'ql0R']) out.push({ id, visible: true, pos: at(S, id, [0, 0, dz]), childY });
      return out;
    },
  },
};

/* ---- the repo served locally, Chrome launched the way the other harnesses do --------------------------------------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp' };
function serve() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
      const f = join(root, p); const s = await stat(f);
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(s.isDirectory() ? join(f, 'index.html') : f));
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
async function launch(chromium) {
  const o = { args: ['--enable-unsafe-swiftshader'], headless: !flag('--headful') };
  for (const c of [{ channel: 'chrome', ...o }, o]) { try { return await chromium.launch(c); } catch { /* next */ } }
  throw new Error('no browser: install Chrome, or run `npx playwright install chromium`');
}
const posix = (p) => p.replace(/\\/g, '/');
const ff = (fargs) => { const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...fargs], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.error}`); };
const pngOf = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

/* ---- the build: under-table 185, two 2W-1H decor drawers stacked, magnet closure, no side covers (placed y counts
   half-rows from the top) */
const RECORD = { mount: 'under-table', length: 185, fill: 'decor', faceStyle: 'essential', gridW: 2, gridH: 2, nextId: 3, sideCovers: false,
  placed: [{ id: 1, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0, closure: 'magnet' }, { id: 2, x: 0, y: 2, w: 2, hh: 2, fill: 'decor', shelves: 0, closure: 'magnet' }] };

/* ---- in the page: the step, the camera, the placements and the converged frame ------------------------------------- */
/* pages the stage to the step whose title matches (its after-state), hides what the clip leaves out, and reads every
   visible instance's base position, inner-child offset and box */
const SETUP = ({ title, hide }) => {
  const h = window.__GEN2_VIEWER__, T = h.THREE;
  const idx = h.manifest.steps.findIndex((s) => new RegExp(title, 'i').test(s.title));
  if (idx < 0) throw new Error('no step titled ' + title + ' in ' + h.manifest.steps.map((s) => s.title).join(' | '));
  h.setCamOverride(true);                        // the film owns the camera: with the override set, goTo's tweenCamera returns at once
  h.goTo(idx + 1, { animate: false });           // page = step index + 1 (0 is the cover); a step page keeps the override
  const hidden = [], bases = {}, boxes = {}, child = {}, nodes = {}; let caseFront = -Infinity;
  for (const x of h.instances.values()) {
    if (!x.group.visible) continue;
    if (hide.some((re) => new RegExp(re).test(x.cfg.id))) { x.group.visible = false; hidden.push(x.cfg.id + ' (' + x.cfg.node + ')'); continue; }
    x.group.updateMatrixWorld(true);
    const b = new T.Box3().setFromObject(x.group);
    bases[x.cfg.id] = x.group.position.toArray(); boxes[x.cfg.id] = { min: b.min.toArray(), max: b.max.toArray() }; nodes[x.cfg.id] = x.cfg.node;
    child[x.cfg.id] = x.group.children[0] ? x.group.children[0].position.toArray() : null;
    if (/_Case$/.test(x.cfg.node)) caseFront = Math.max(caseFront, b.max.z);
  }
  const rides = {}; for (const x of h.instances.values()) if (x.cfg.rides && x.group.visible) (rides[x.cfg.rides] = rides[x.cfg.rides] || []).push(x.cfg.id);
  const sideCovers = [...h.instances.values()].filter((x) => /SideCover/.test(x.cfg.node)).map((x) => x.cfg.id);
  const notShown = [...h.instances.values()].filter((x) => !x.group.visible && !hidden.some((s) => s.startsWith(x.cfg.id + ' '))).map((x) => x.cfg.id + ' (' + x.cfg.node + ')');
  const sp = h.surface.geometry.parameters;   // the slab: a box 25 tall, its underside at surfaceUnderY, its front face flush with the rail fronts (fitSurface)
  return { step: idx, title: h.manifest.steps[idx].title, page: h.cur, hidden, notShown, bases, boxes, child, nodes, rides, caseFront, sideCovers,
    surfaceUnderY: h.surface.position.y - sp.height / 2, slabFrontZ: h.surface.position.z + sp.depth / 2, slabHalfW: sp.width / 2, ids: Object.keys(bases) };
};
/* the slab's front-bottom edge on screen, and every corner of the given boxes against it: `worst` is the largest amount
   (in NDC y) a corner shows ABOVE that line at its own screen x; ok when every corner is at least `clear` below it */
const SLABLINE = ({ boxes, underY, frontZ, halfW, clear }) => {
  const h = window.__GEN2_VIEWER__, T = h.THREE, cam = h.camera; cam.updateMatrixWorld(true);
  const P = (x, y, z) => new T.Vector3(x, y, z).project(cam);
  const a = P(-halfW, underY, frontZ), b = P(halfW, underY, frontZ);
  const lineY = (x) => a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
  let worst = -Infinity; const corners = [];
  for (const bx of boxes) for (const x of [bx.min[0], bx.max[0]]) for (const y of [bx.min[1], bx.max[1]]) for (const z of [bx.min[2], bx.max[2]]) {
    const n = P(x, y, z), d = n.y - lineY(n.x); corners.push({ ndc: [+n.x.toFixed(3), +n.y.toFixed(3)], above: +d.toFixed(3) }); worst = Math.max(worst, d);
  }
  return { worst: +worst.toFixed(4), ok: worst <= -clear, line: [[+a.x.toFixed(3), +a.y.toFixed(3)], [+b.x.toFixed(3), +b.y.toFixed(3)]], corners };
};
/* the fixed camera: azimuth az off the front normal toward +X, elevation el (negative = below level), the target pushed
   `toward` mm toward the camera; the distance is the largest of: the height boxes filling (1 - headroom) of the frame,
   every corner of the fit boxes inside the side margin on both sides, and inside the headroom vertically */
const CAMERA = ({ az, el, fov, W, H, target, toward, heightBoxes, allBoxes, softBoxes, over = 0.2, headroom, side, fitBoxes, margin }) => {
  /* the whole-path mode: every fit box inside the same margin on all four sides, nothing else */
  if (fitBoxes) { heightBoxes = []; allBoxes = fitBoxes; side = margin; headroom = 2 * margin; softBoxes = null; }
  const h = window.__GEN2_VIEWER__, T = h.THREE, cam = h.camera;
  const t = T.MathUtils.degToRad(az), p = T.MathUtils.degToRad(90 - el);
  const dir = new T.Vector3(Math.sin(p) * Math.sin(t), Math.cos(p), Math.sin(p) * Math.cos(t));
  const tgt = new T.Vector3(...target).addScaledVector(dir, toward);
  cam.fov = fov; cam.aspect = W / H; cam.updateProjectionMatrix();
  const corners = (b) => { const o = []; for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) o.push(new T.Vector3(x, y, z)); return o; };
  const probe = (r) => {
    cam.position.copy(tgt).addScaledVector(dir, r); cam.lookAt(tgt); cam.updateMatrixWorld(true);
    const ndc = (v) => v.clone().project(cam);
    const hs = heightBoxes.flatMap(corners).map(ndc), all = allBoxes.flatMap(corners).map(ndc);
    return { hgt: Math.max(...hs.map((v) => v.y)) - Math.min(...hs.map((v) => v.y)), right: Math.max(...all.map((v) => v.x)), left: Math.min(...all.map((v) => v.x)), top: Math.max(...all.map((v) => v.y)), bottom: Math.min(...all.map((v) => v.y)) };
  };
  const solve = (ok) => { let lo = 100, hi = 5000; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (ok(probe(mid))) hi = mid; else lo = mid; } return hi; };
  const rH = heightBoxes.length ? solve((m) => m.hgt <= 2 * (1 - headroom)) : 0;
  const rW = solve((m) => m.right <= 1 - 2 * side && m.left >= -(1 - 2 * side));
  const rV = solve((m) => m.top <= 1 - headroom && m.bottom >= -(1 - headroom));
  /* the soft boxes (a start or end pose) may run past the frame's edge by `over` of its half-width, no further */
  const soft = (r) => { const all = (softBoxes || []).flatMap(corners).map((v) => { cam.position.copy(tgt).addScaledVector(dir, r); cam.lookAt(tgt); cam.updateMatrixWorld(true); return v.clone().project(cam); });
    return all.every((v) => Math.abs(v.x) <= 1 + over && Math.abs(v.y) <= 1 + over); };
  const rS = softBoxes && softBoxes.length ? (() => { let lo = 100, hi = 5000; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (soft(mid)) hi = mid; else lo = mid; } return hi; })() : 0;
  const r = Math.max(rH, rW, rV, rS), m = probe(r);
  h.controls.target.copy(tgt); h.controls.update();
  cam.position.copy(tgt).addScaledVector(dir, r); cam.lookAt(tgt); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  return { az, el, fov, target: tgt.toArray(), pos: cam.position.toArray(), r, rH, rW, rV, rS, extents: m };
};
/* one frame: the placements applied (group position, an X rotation, the inner child's y - the QuickLock tab), then the
   loop's own order (grounding, cavity, reflection, AO, accumulation, composite) with the scene told it changed and every
   progressive pass run to its end, read in the same task. `stale` draws the frame the engine's way for a part in motion
   with AO held on - updateAO() unforced keeps the buffer it has - for the proof. */
const FRAME = ({ placements, stale }) => {
  const h = window.__GEN2_VIEWER__, r = h.renderer, c = r.domElement, t0 = performance.now();
  for (const p of placements) {
    const inst = h.instances.get(p.id); if (!inst) throw new Error('no instance ' + p.id);
    const g = inst.group;
    g.visible = !!p.visible;
    if (p.pos) g.position.set(p.pos[0], p.pos[1], p.pos[2]);
    g.rotation.x = p.rotX || 0;
    if (p.childY != null) { const ch = g.children[0]; if (!ch) throw new Error('no inner child on ' + p.id); ch.position.y = p.childY; }
    g.updateMatrixWorld(true);
  }
  const read = () => HTMLCanvasElement.prototype.toDataURL.call(c, 'image/png');   // the page's own toDataURL re-enters the loop
  let aoLoops = 0, accLoops = 0, drew = null;
  if (stale) { h.updateAO(); r.render(h.scene, h.camera); h.compositeAO(); return { png: read(), aoPasses: h.ao.passes, accN: h.acc.n, drew: false, stale: true, ms: performance.now() - t0 }; }
  h.invalidateFrame(); h.markShadowDirty();
  h.updateGrounding(); h.updateCavityFill(); h.updateReflection(false, false);
  h.updateAO(true); aoLoops++;
  while (h.ao.passes < h.ao.accumMax && aoLoops < 64) { h.updateAO(); aoLoops++; }
  /* the first sample resets the mean (accumFrame sees the new accRev only when called), then one sample per call until
     the mean holds ACC_SAMPLES; the last call blits it (false only if the tier refused: then a plain frame) */
  drew = h.accumFrame(); accLoops++;
  while (h.acc.n < h.ACC_SAMPLES && accLoops < 64) { drew = h.accumFrame(); accLoops++; }
  if (!drew) { drew = h.accumFrame(); accLoops++; }
  if (!drew) r.render(h.scene, h.camera);
  h.compositeAO();
  return { png: read(), aoPasses: h.ao.passes, accN: h.acc.n, drew: !!drew, aoLoops, accLoops, accWanted: h.accWanted(), aoWanted: h.aoWanted(), ms: performance.now() - t0 };
};

/* an instance's world box as it stands now */
const BOX = ({ id }) => { const h = window.__GEN2_VIEWER__, g = h.instances.get(id).group; g.updateMatrixWorld(true); const b = new h.THREE.Box3().setFromObject(g); return { min: b.min.toArray(), max: b.max.toArray() }; };
/* a world box's corners through the film camera: outside when every corner is beyond the frame or behind the camera */
const PROJECT = ({ box }) => {
  const h = window.__GEN2_VIEWER__, T = h.THREE, cam = h.camera; cam.updateMatrixWorld(true);
  const out = [];
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
    const w = new T.Vector3(x, y, z), v = w.clone().applyMatrix4(cam.matrixWorldInverse), n = w.clone().project(cam);
    out.push({ ndc: [+n.x.toFixed(3), +n.y.toFixed(3)], behind: v.z > -cam.near });
  }
  return { corners: out, outside: out.every((c) => c.behind || Math.abs(c.ndc[0]) > 1 || Math.abs(c.ndc[1]) > 1) };
};

async function openStage(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await ctx.route(/goatcounter|gc\.zgo/, (r) => r.abort());
  await ctx.addInitScript((theme) => { try {
    localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1');   // the explicit pick locks the tier against the auto-downgrade
    localStorage.setItem('skipgc', 't'); localStorage.setItem('gen2-theme', theme);
  } catch {} window.__FILM_AO_DURING_TWEENS = true; }, THEME);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const hash = Buffer.from(JSON.stringify(RECORD), 'utf8').toString('base64');
  await page.goto(`${base}/index.html?ws=assemble&debug=1&idle=off&new=1#build=${hash}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && window.__GEN2_STORE__ && document.querySelector('#ws-player'), null, { timeout: 150_000 });
  await page.waitForTimeout(2000);
  const quality = await page.evaluate(() => ({ tier: window.__GEN2_VIEWER__.quality, theme: window.__GEN2_VIEWER__.stageTheme, pr: window.__GEN2_VIEWER__.renderer.getPixelRatio(), shadowMap: window.__GEN2_VIEWER__.renderer.shadowMap.enabled,
    steps: window.__GEN2_VIEWER__.manifest.steps.map((s) => s.title), sideCovers: window.__GEN2_STORE__.state.sideCovers }));
  if (quality.tier !== 'veryhigh') throw new Error('the tier drawing is ' + quality.tier);
  return { ctx, page, errors, quality };
}

async function film(name, clip, browser, base, pose) {
  const dir = join(OUT, name), framesDir = join(dir, 'frames');
  await mkdir(framesDir, { recursive: true });
  const N = Math.round(FPS * clip.dur);
  const { ctx, page, errors, quality } = await openStage(browser, base);   // a fresh page per clip: the stage's state is the step's own
  const run = { name, startedAt: new Date().toISOString(), W, H, FPS, dur: clip.dur, N, START, THEME, record: RECORD, quality, frames: [], proof: [] };
  const tStart = Date.now();
  try {
    const S = await page.evaluate(SETUP, { title: clip.title, hide: clip.hide.map((re) => (re instanceof RegExp ? re.source : re)) });
    if (S.sideCovers.length) throw new Error('side covers instanced: ' + S.sideCovers.join(','));
    S.pose = pose; S.riders = (id) => S.rides[id] || [];
    /* how far a QuickLock can start above its seat without entering the slab: the engine's 45 mm, or 3 mm under the underside */
    S.dropOf = (id) => Math.min(45, S.surfaceUnderY - 3 - box(S, id).max[1]);
    run.setup = { step: S.step, title: S.title, page: S.page, hidden: S.hidden, notShown: S.notShown, ids: S.ids, caseFront: S.caseFront, surfaceUnderY: S.surfaceUnderY, boxes: S.boxes, drops: Object.fromEntries(S.ids.filter((i) => /^ql/.test(i)).map((i) => [i, S.dropOf(i)])) };
    /* the workspace pans the projection clear of its player card (setSafeArea -> setViewOffset), and re-asks on every page
       event - so it is cleared AFTER goTo's onPage microtask has run, then the loop lerps the pan back to zero and snaps it
       to clearViewOffset. No tween left either. */
    await page.evaluate(() => window.__GEN2_VIEWER__.setSafeArea(null));
    await page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.tweenCount === 0 && !(h.camera.view && h.camera.view.enabled); }, null, { timeout: 20_000 });
    /* the hold (first, under): start at the world minimum (locks' start 10 mm under the slab's underside), then deepen in
       5 mm steps until the locks' start boxes project under the slab's front edge with 2 % of the frame to spare - the
       camera is re-fitted at every step, since the lowered start pose is part of the fit */
    S.hold = clip.minHold ? Math.ceil(clip.minHold(S)) : 0;
    for (let i = 0; ; i++) {
      run.camera = await page.evaluate(CAMERA, { ...clip.camera(S), W, H });
      if (!clip.slabCheck) break;
      run.slab = await page.evaluate(SLABLINE, { boxes: clip.slabCheck(S), underY: S.surfaceUnderY, frontZ: S.slabFrontZ, halfW: S.slabHalfW, clear: 0.02 });
      run.slab.hold = S.hold; run.slab.minHold = clip.minHold(S);
      if (run.slab.ok) break;
      if (i > 40) throw new Error('no hold keeps the locks under the slab line: ' + JSON.stringify(run.slab));
      S.hold += 5;
    }
    /* the loop runs on for a moment so perf.moving, the room fade, the slab's visibility and the camera key settle
       (accWanted() needs the first three), then it is paused and the renderer sized to the film - resize() would put the
       canvas's layout size back */
    await page.waitForTimeout(900);
    await page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.accWanted() && h.aoWanted() && h.tweenCount === 0; }, null, { timeout: 20_000 });
    run.paused = await page.evaluate(([W, H]) => {
      const h = window.__GEN2_VIEWER__, r = h.renderer;
      r.setAnimationLoop(null);
      const pr = r.getPixelRatio();
      if (h.camera.view && h.camera.view.enabled) h.camera.clearViewOffset();
      r.setSize((W + 0.5) / pr, (H + 0.5) / pr, false); h.camera.aspect = W / H; h.camera.updateProjectionMatrix();
      return { buffer: [r.domElement.width, r.domElement.height], pr, surfaceVisible: h.surface.visible, cameraY: h.camera.position.y, viewOffset: !!(h.camera.view && h.camera.view.enabled), accWanted: h.accWanted(), aoWanted: h.aoWanted(), ACC: h.ACC_SAMPLES, AO: h.ao.accumMax };
    }, [W, H]);
    if (run.paused.buffer[0] !== W || run.paused.buffer[1] !== H) throw new Error('drawing buffer ' + run.paused.buffer.join('x') + ', wanted ' + W + 'x' + H);
    if (run.paused.viewOffset || !run.paused.surfaceVisible || !run.paused.accWanted) throw new Error('not ready to film: ' + JSON.stringify(run.paused));
    const { ACC, AO } = run.paused;
    const converged = (r) => r.drew && r.accN >= ACC && r.aoPasses >= AO;
    /* the clip's own checks, against the scene and the camera as they will film */
    if (clip.check) {
      const c = clip.check(S);
      await page.evaluate(FRAME, { placements: clip.frames(c.t, S) });
      const got = await page.evaluate(BOX, { id: c.id });
      run.check = { ...c, gotMinY: got.min[1], gotMaxY: got.max[1] };
      if (Math.abs(got.min[1] - c.expectMinY) > 0.05 || Math.abs(got.max[1] - c.expectMaxY) > 0.05) throw new Error('pivot check failed: ' + JSON.stringify(run.check));
    }
    if (clip.offFrame) {
      run.offFrame = await page.evaluate(PROJECT, { box: clip.offFrame(S) });
      if (!run.offFrame.outside) throw new Error('the hide pose is still in the frame: ' + JSON.stringify(run.offFrame));
    }
    /* the film */
    for (let f = 0; f < N; f++) {
      const t = f / FPS, placements = clip.frames(t, S), t0 = Date.now();
      const r = await page.evaluate(FRAME, { placements });
      const wallMs = Date.now() - t0;
      await writeFile(join(framesDir, `frame_${String(f).padStart(3, '0')}.png`), pngOf(r.png));
      delete r.png;
      const meta = placements.find((p) => p.meta)?.meta;
      run.frames.push({ f, t: +t.toFixed(4), ...(meta ? { dz: +meta.dz.toFixed(3), deg: +meta.deg.toFixed(3), dy: +meta.dy.toFixed(3) } : {}), ...r, wallMs });
      if (f % 30 === 0 || f === N - 1) console.log(`${name} frame ${f}/${N - 1}  t ${t.toFixed(2)}  ao ${r.aoPasses}  acc ${r.accN}  ${r.ms.toFixed(0)} ms in page, ${wallMs} ms wall`);
      /* a frame that did not converge is not a film frame: the run stops (Terra 01a1751c: a warning alone would let the
         fallback render into the film). --lenient keeps going and marks the frame, for diagnosis only */
      if (!converged(r)) {
        if (!flag('--lenient')) throw new Error(`${name} frame ${f} (t ${t.toFixed(2)}) NOT CONVERGED: ${JSON.stringify(r)}`);
        console.warn('  NOT CONVERGED', JSON.stringify(r)); run.unconverged = (run.unconverged || []).concat(f);
      }
    }
    run.filmMs = Date.now() - tStart;
    /* the proof (the drawers clip): converge at the START pose once, then three mid-motion poses the stale way (the AO
       buffer of the start pose laid over the moved drawer, one hard sample), and the same three converged */
    if (clip.proof && !flag('--no-proof')) {
      await page.evaluate(FRAME, { placements: clip.frames(0, S) });
      for (const stale of [true, false]) for (const t of clip.proof) {
        const r = await page.evaluate(FRAME, { placements: clip.frames(t, S), stale });
        await writeFile(join(dir, `proof-${stale ? 'stale' : 'converged'}-t${t.toFixed(1)}.png`), pngOf(r.png)); delete r.png;
        run.proof.push({ t, stale, ...r });
      }
    }
    run.errors = errors;
  } finally {
    await page.close(); await ctx.close();
  }
  run.totalMs = Date.now() - tStart;
  await writeFile(join(dir, 'run.json'), JSON.stringify(run, null, 1));
  if (flag('--frames-only')) return run;

  /* ffmpeg: the clip, the poster, the contact sheet, the proof */
  const mp4 = join(OUT, `ut-step-${name}.mp4`);
  ff(['-framerate', String(FPS), '-i', posix(join(framesDir, 'frame_%03d.png')), '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', posix(mp4)]);
  ff(['-i', posix(join(framesDir, 'frame_000.png')), '-q:v', '3', posix(join(OUT, `ut-step-${name}-poster.jpg`))]);   // q:v 3 ~ JPEG quality 85
  const every = Math.max(1, Math.floor((N - 1) / 7));   // 8 frames: 0, every, ..., 7*every
  ff(['-i', posix(join(framesDir, 'frame_%03d.png')), '-vf', `select='not(mod(n\\,${every}))*lte(n\\,${7 * every})',scale=600:-1,tile=4x2:padding=4:margin=4:color=0x202020`, '-frames:v', '1', '-fps_mode', 'vfr', posix(join(OUT, `ut-step-${name}-sheet.png`))]);
  if (clip.proof && !flag('--no-proof')) {
    const ins = [...clip.proof.map((t) => `proof-stale-t${t.toFixed(1)}.png`), ...clip.proof.map((t) => `proof-converged-t${t.toFixed(1)}.png`)].flatMap((n) => ['-i', posix(join(dir, n))]);
    const sc = [0, 1, 2, 3, 4, 5].map((i) => `[${i}:v]scale=600:-1,pad=iw+8:ih+8:4:4:${i < 3 ? 'red' : 'green'}[v${i}]`).join(';');
    ff([...ins, '-filter_complex', `${sc};[v0][v1][v2]hstack=3[top];[v3][v4][v5]hstack=3[bot];[top][bot]vstack=2`, '-frames:v', '1', posix(join(OUT, `ut-step-${name}-proof-stale-vs-converged.png`))]);
  }
  run.mp4Bytes = (await stat(mp4)).size;
  console.log(`${name}: ${N} frames in ${(run.filmMs / 1000).toFixed(1)} s (${(run.filmMs / N / 1000).toFixed(2)} s per frame); ${mp4} ${(run.mp4Bytes / 1024).toFixed(0)} KB; total ${(run.totalMs / 1000).toFixed(1)} s`);
  if (run.errors.length) console.warn('page errors:', run.errors);
  await writeFile(join(dir, 'run.json'), JSON.stringify(run, null, 1));
  return run;
}

async function main() {
  const { chromium } = await import('playwright');
  const pose = opt('--curve', null) ? sampled(JSON.parse(await readFile(opt('--curve'), 'utf8'))) : motion(START);
  const names = WANTED.length ? WANTED : Object.keys(CLIPS);
  for (const n of names) if (!CLIPS[n]) throw new Error('no clip ' + n + '; clips: ' + Object.keys(CLIPS).join(' '));
  await mkdir(OUT, { recursive: true });
  const summary = { startedAt: new Date().toISOString(), START, THEME, clips: {} };
  /* --check-curve <curve.json>: the embedded curve against node0's 120 Hz samples (the largest difference in mm / deg) */
  if (opt('--check-curve', null)) {
    const j = JSON.parse(await readFile(opt('--check-curve'), 'utf8')); let worst = 0;
    for (const s of j.samples) { const q = motion(250)(s.t); worst = Math.max(worst, Math.abs(q.dz - s.dz), Math.abs(q.deg - s.deg), Math.abs(q.dy - s.dy)); }
    summary.curveCheck = { samples: j.samples.length, worst }; console.log('curve check: worst difference', worst);
  }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch(chromium);
  try {
    for (const n of names) {
      const r = await film(n, CLIPS[n], browser, base, pose);
      summary.clips[n] = { title: r.setup.title, page: r.setup.page, dur: r.dur, N: r.N, mp4Bytes: r.mp4Bytes, filmMs: r.filmMs, totalMs: r.totalMs, camera: r.camera, cameraY: r.paused.cameraY, hidden: r.setup.hidden, notShown: r.setup.notShown, drops: r.setup.drops, errors: r.errors, unconverged: r.unconverged || [] };
    }
  } finally {
    await browser.close(); server.close();
  }
  await writeFile(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
}
main().catch((e) => { console.error(e); process.exit(2); });
