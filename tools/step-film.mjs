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
const lerp3 = (a, b, k) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);
/* the under-table stand-off (UT.fwd = DEPTH + 40) and the drawer pop-out (depth + 5) for the 185 collection */
const UT_FWD = 225, DRW_POP = 190;
const MARGIN = 0.08;   // the whole-path fit: every keyframe box of every moving part inside 8 % of the frame on all four sides (Joey 2026-10-25)
const PATH_OVER = 0.5;  // a beat's path may run past the frame's edge by half its half-size, no further (a part passing close under the lens filled the frame)
const NEAR = 120;
const CAP_BYTES = 600 * 1024;   // the site's clip budget      // mm: no part on a beat's path comes nearer the camera than this (the camera backs off by the shortfall)

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
    subject: (S) => [box(S, 'drw0'), ...S.riders('drw0').map((id) => box(S, id)), box(S, 'case0'), box(S, 'ql0L'), box(S, 'ql0R'), ...['st0L', 'st0R', 'st1L', 'st1R'].filter((id) => S.boxes[id]).map((id) => box(S, id))],
    path: (S) => { const d = box(S, 'drw0'), pivot = [(d.min[0] + d.max[0]) / 2, d.min[1], d.min[2]], out = []; for (let t = 0; t <= 4.5; t += 0.05) out.push(pitchedBox(d, pivot, S.pose(t))); return out; },
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
    subject: (S) => [box(S, 'case0'), box(S, 'ql0L'), box(S, 'ql0R'), box(S, 'case1'), box(S, 'utr0')],
    path: (S) => [shifted(box(S, 'case0'), [0, 0, 230]), shifted(box(S, 'drw0'), [0, 0, DRW_POP])],   // the drawer's exit beyond its pop-out passes the camera on purpose (cullNear hides it first)
    cullNear: ['drw0'],
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

/* ---- the engine replayed on the film clock (the wall and tabletop clips, 2026-10-25) ------------------------------
   A clip names a build record and a run of manifest steps. SETUP_ENGINE pages the stage to the before-state of the first
   step and hands over the steps' phases as the generator wrote them; engineTimeline() turns them into ops on the film
   clock with the engine's own rules (js/main.js playStep): phases run back to back, a phase lasts as long as its longest
   job; `enter` places the part at pos+at+from the moment its phase starts and glides it to pos+at over DUR.enter (+ 300
   per `via` point), the n-th item DUR.stagger later unless `sync`, x1.6 when two or more tiled parts land together;
   `move` carries a part by `by` over DUR.move (detent 900, raw); `settle` brings a staged group from its stage offset to
   rest over DUR.settle; `fade` materialises a part over DUR.fade, 80 ms apart; `ghost`/`solid` take a part to 15 % and
   back over DUR.fade; `dip` presses the named tabs 3 mm over the phase's span and holds them, `pop` releases them 45 ms
   apart; `land` un-stages without motion; a `camera` phase keeps its 750 ms as a beat, the camera itself is the film's.
   Every tween is eased with the engine's easeInOutCubic except a detent move. vanish/appear/room/spin (the faceplate
   step) are not replayed: a clip that reaches one aborts. */
const ENG = { enter: 750, settle: 850, move: 600, fade: 650, stagger: 130, camera: 750, camera900: 900, via: 300, detent: 900, pop: 320, popStagger: 45 };   // camera900: tweenCamera's default, the step's own camera
const TILED = /^FR-[LU]_|^C[LU]-|^WallMount|^UnderTableRail/;
const detent = (k) => k + (0.85 / (2 * Math.PI)) * Math.sin(2 * Math.PI * k);
const STEP_GAP = 0.3;   // the beat between two steps of one clip (the engine pages with a camera tween there)
const MIN_DUR = 4.0;    // a clip is at least this long: a short step rests longer at the end
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const worldBox = (local, pos) => ({ min: add3(local.min, pos), max: add3(local.max, pos) });

function engineTimeline(S, clip) {
  const stages = { ...S.stages, ...(clip.stages || {}) };   // a clip may restage (the tabletop cases, see ENGINE_CLIPS)
  const hiddenRe = clip.hide.map((re) => (re instanceof RegExp ? re : new RegExp(re)));
  const skipped = new Set();   // parts the clip leaves out that one of its phases would have placed
  const isHidden = (id) => { const h = hiddenRe.some((re) => re.test(id)); if (h) skipped.add(id); return h; };
  const basePos = (id, staged) => { const c = S.cfg[id]; return staged && c.stage && stages[c.stage] ? add3(c.pos, stages[c.stage]) : c.pos.slice(); };
  /* the state at t: every op applied in creation order (an op before its start leaves the state alone) */
  const ops = [], log = [], keyBoxes = [], touched = new Set();
  /* the planner's own camera beats: the step's camera at the step start (tweened over 900 ms, concurrently with the first
     phase - except the clip's first, which the film opens on), and every `camera` phase (750 ms). Each beat's SUBJECT is
     what its phases place (its actors, at their end pose) plus whatever they come to rest against; the camera is fitted
     to that, not to the path (Joey 2026-10-25: "frame the subject, not the path") */
  const beats = [];
  const beat = () => beats[beats.length - 1];
  const init = () => { const st = {}; for (const id of S.ids) st[id] = { visible: S.before.visible.includes(id), pos: S.before.pos[id].slice(), staged: S.before.staged[id], childY: 0, opacity: 1 }; return st; };
  const stateAt = (t) => { const st = init(); for (const op of ops) if (t >= op.t0) op.apply(st, Math.max(0, Math.min(1, op.dur > 0 ? (t - op.t0) / op.dur : 1)), t - op.t0); return st; };
  const keyBox = (id, pos) => { if (S.local[id]) { const b = worldBox(S.local[id], pos); keyBoxes.push(b); if (beats.length) beat().path.push(b); } };
  let T = REST;
  S.steps.forEach((step, si) => {
    if (si) T += STEP_GAP;
    const stepStart = T;
    beats.push({ t: T, dur: si === 0 ? 0 : ENG.camera900 / 1000, preset: step.camera || null, step: step.title, kind: 'step', actors: new Set(), path: [] });
    for (const ph of step.phases) {
      for (const k of ['vanish', 'appear', 'room']) if (ph[k] !== undefined) throw new Error(`step "${step.title}": a ${k} phase is not replayed`);
      const pre = stateAt(T);
      let end = T;
      const job = (t0, dur) => { end = Math.max(end, t0 + dur); };
      if (ph.camera) { job(T, ENG.camera / 1000); beats.push({ t: T, dur: ENG.camera / 1000, preset: ph.camera, step: step.title, kind: 'phase', actors: new Set(), path: [] }); }
      for (const g of ph.ghost || []) if (!isHidden(g.id)) { const id = g.id; ops.push({ t0: T, dur: ENG.fade / 1000, apply: (st, k) => { st[id].opacity = 1 - 0.85 * easeInOut(k); } }); job(T, ENG.fade / 1000); touched.add(id); }
      for (const g of ph.solid || []) if (!isHidden(g.id)) { const id = g.id; ops.push({ t0: T, dur: ENG.fade / 1000, apply: (st, k) => { st[id].opacity = 0.15 + 0.85 * easeInOut(k); } }); job(T, ENG.fade / 1000); }
      const enters = (ph.enter || []).filter((e) => !isHidden(e.id));
      const tiles = enters.filter((e) => TILED.test(S.cfg[e.id].node)).length;
      const pace = ph.pace || (tiles >= 2 ? 1.6 : 1);
      enters.forEach((e, n) => {
        const id = e.id, at = e.at || [0, 0, 0];
        const to = add3(basePos(id, pre[id].staged), at), from = add3(to, e.from);
        const pts = [from, to, ...(e.via || []).map((d) => add3(to, d))];
        const legs = []; let total = 0; for (let s = 1; s < pts.length; s++) { total += dist3(pts[s], pts[s - 1]); legs.push(total); }
        const delay = ph.sync ? 0 : n * ENG.stagger * pace / 1000, dur = (ENG.enter + ENG.via * (e.via?.length || 0)) * pace / 1000;
        if (e.spin) throw new Error('spin is not replayed (' + id + ')');
        const op = { t0: T, dur: delay + dur, firstEnter: T === REST, lead: 0, apply: (st, k, el) => {
          st[id].visible = true;
          el -= op.lead;
          if (el < delay || !total) { st[id].pos = (el < delay ? pts[0] : pts[pts.length - 1]).slice(); return; }
          const d = easeInOut(Math.min(1, (el - delay) / dur)) * total;
          let s = legs.findIndex((L) => d <= L); if (s === -1) s = legs.length - 1;
          const prev = s === 0 ? 0 : legs[s - 1], f = legs[s] === prev ? 1 : (d - prev) / (legs[s] - prev);
          st[id].pos = lerp3(pts[s], pts[s + 1], f);
        } };
        ops.push(op); beat().actors.add(id);
        pts.forEach((p) => keyBox(id, p)); touched.add(id); job(T, delay + dur);
        log.push({ t: +T.toFixed(3), step: step.title, enter: id, from: pts[0].map((v) => +v.toFixed(1)), to: to.map((v) => +v.toFixed(1)), dur: +(delay + dur).toFixed(3) });
      });
      if (ph.dip && ph.dip.length) {
        const nEnter = enters.length, maxVia = Math.max(0, ...enters.map((e) => e.via?.length || 0));
        const span = (nEnter ? (ENG.enter + ENG.via * maxVia) * pace + (ph.sync ? 0 : (nEnter - 1) * ENG.stagger * pace) : ph.settle ? ENG.settle : ENG.move) / 1000;
        for (const dp of ph.dip) if (!isHidden(dp.id)) { const id = dp.id, f0 = clip.dipFrom ? clip.dipFrom(dp, S, stages) : (dp.from ?? 0.7); ops.push({ t0: T, dur: span, apply: (st, k) => { st[id].childY = dipY(easeInOut(k), f0); } }); job(T, span); }
      }
      (ph.pop || []).forEach((p, n) => { if (isHidden(p.id)) return; const id = p.id, t0 = T + n * ENG.popStagger / 1000; ops.push({ t0, dur: ENG.pop / 1000, apply: (st, k) => { st[id].childY = popY(easeInOut(k)); } }); job(t0, ENG.pop / 1000); });
      for (const m of ph.move || []) {
        if (isHidden(m.id)) continue;
        const id = m.id, from = pre[id].pos.slice(), to = add3(from, m.by), dur = (m.ease ? ENG.detent : ENG.move) / 1000, delay = (m.hold || 0) / 1000, eased = m.ease === 'detent';
        ops.push({ t0: T + delay, dur, apply: (st, k) => { st[id].pos = lerp3(from, to, eased ? detent(k) : easeInOut(k)); } }); beat().actors.add(id);
        keyBox(id, from); keyBox(id, to); touched.add(id); job(T + delay, dur);
        log.push({ t: +(T + delay).toFixed(3), step: step.title, move: id, by: m.by, dur: +dur.toFixed(3) });
      }
      (ph.fade || []).forEach((f, n) => {
        if (isHidden(f.id)) return;
        /* the engine shows the part at opacity 0 the moment the phase starts and begins its fade n * 80 ms later */
        const id = f.id, pos = basePos(id, pre[id].staged), delay = n * 0.08, fd = ENG.fade / 1000;
        ops.push({ t0: T, dur: delay + fd, apply: (st, k, el) => { st[id].visible = true; st[id].pos = pos.slice(); st[id].opacity = el < delay ? 0 : Math.min(1, easeInOut(Math.min(1, (el - delay) / fd))); } });
        keyBox(id, pos); touched.add(id); job(T, delay + fd); beat().actors.add(id);
        log.push({ t: +T.toFixed(3), step: step.title, fade: id, delay });
      });
      if (ph.settle) {
        for (const id of S.ids) {
          if (S.cfg[id].stage !== ph.settle || !pre[id].staged || isHidden(id)) continue;
          const from = basePos(id, true), to = basePos(id, false), dur = ENG.settle / 1000;
          ops.push({ t0: T, dur, apply: (st, k) => { st[id].pos = lerp3(from, to, easeInOut(k)); if (k >= 1) st[id].staged = false; } });
          if (pre[id].visible) { keyBox(id, from); keyBox(id, to); }
          touched.add(id); job(T, dur); beat().actors.add(id);
          log.push({ t: +T.toFixed(3), step: step.title, settle: id, from: from.map((v) => +v.toFixed(1)), to: to.map((v) => +v.toFixed(1)), dur });
        }
      }
      if (ph.land) for (const id of S.ids) if (S.cfg[id].stage === ph.land) { const pos = basePos(id, false); ops.push({ t0: end, dur: 0, apply: (st) => { st[id].staged = false; st[id].pos = pos.slice(); } }); }
      T = end;
    }
    log.push({ t: +stepStart.toFixed(3), stepEnd: +T.toFixed(3), step: step.title });
  });
  const dur = Math.max(MIN_DUR, Math.ceil((T + 1.0) * 10) / 10);   // rest >= 1.0 s at the end, and a clip no shorter than MIN_DUR
  /* the parts that enter in the clip's very first phase wait at their start pose through the opening rest (the engine shows
     them only as the phase starts; a loop that opened on an empty stage read as a cut - the under-table rail, 2026-10-25) */
  for (const op of ops) { if (op.t0 > REST) break; if (op.firstEnter) op.t0 = 0, op.dur += REST, op.lead = REST; }
  /* every visible part at the start and at the end is fitted too */
  const st0 = stateAt(0), st1 = stateAt(dur), endBoxes = [];
  for (const id of S.ids) if (st0[id].visible && S.local[id] && beats.length) beats[0].path.push(worldBox(S.local[id], st0[id].pos));
  for (const id of S.ids) { if (st0[id].visible) keyBox(id, st0[id].pos); if (st1[id].visible && !isHidden(id)) { keyBox(id, st1[id].pos); if (S.local[id]) endBoxes.push(worldBox(S.local[id], st1[id].pos)); } }
  /* the staged-case clearance: a part that enters onto its stage must not overlap anything visible when it lands there
     (the tabletop's -170 staging put a case's front 15 mm over the parts below it) */
  const clearance = [];
  for (const e of log) if (e.enter && S.cfg[e.enter].stage && /_Case$/.test(S.cfg[e.enter].node)) {
    const tEnd = e.t + e.dur, st = stateAt(tEnd), me = worldBox(S.local[e.enter], st[e.enter].pos);
    let worst = { gap: Infinity, other: null };
    for (const id of S.ids) {
      if (id === e.enter || !st[id].visible || isHidden(id) || !S.local[id]) continue;   // what is drawn, not what the state says (Sol 01a1757e)
      const o = worldBox(S.local[id], st[id].pos);
      const gap = Math.max(...[0, 1, 2].map((i) => Math.max(o.min[i] - me.max[i], me.min[i] - o.max[i])));   // > 0 = separated on some axis
      if (gap < worst.gap) worst = { gap: +gap.toFixed(2), other: id };
    }
    clearance.push({ id: e.enter, at: +tEnd.toFixed(3), pos: st[e.enter].pos.map((v) => +v.toFixed(1)), ...worst });
    if (worst.gap < 0) throw new Error(`${e.enter} lands on its stage overlapping ${worst.other} by ${-worst.gap} mm`);
  }
  /* each beat's subject, at the beat's end: the actors' boxes, plus every visible box that touches their union (grown by
     5 mm) - the thing they attach to; a beat with no actors (a camera return, a solid) frames the whole visible build */
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i], tEnd = beats[i + 1] ? beats[i + 1].t : dur, st = stateAt(tEnd);
    const vis = S.ids.filter((id) => st[id].visible && !isHidden(id) && S.local[id]);
    const actors = [...b.actors].filter((id) => vis.includes(id));
    const boxOf = (id) => worldBox(S.local[id], st[id].pos);
    let ids;
    if (!actors.length) ids = vis;
    else {
      const u = union(...actors.map(boxOf)), grown = { min: u.min.map((v) => v - 5), max: u.max.map((v) => v + 5) };
      const touches = (bx) => [0, 1, 2].every((k) => bx.min[k] <= grown.max[k] && grown.min[k] <= bx.max[k]);
      ids = vis.filter((id) => actors.includes(id) || touches(boxOf(id)));
    }
    b.tEnd = +tEnd.toFixed(3); b.actorIds = actors; b.subjectIds = ids; b.subject = ids.map(boxOf); b.subjectBox = union(...b.subject);
    delete b.actors;
  }
  const frames = (t) => { const st = stateAt(t); return S.ids.map((id) => ({ id, visible: st[id].visible && !isHidden(id), pos: st[id].pos, childY: st[id].childY, opacity: st[id].opacity })); };
  return { dur, frames, keyBoxes, endBoxes, beats, touched, log, stages, clearance, skipped: [...skipped].map((id) => id + ' (' + S.cfg[id].node + ')') };
}
/* the mount rule, per frame: on the wall the smallest distance of any visible part's box to the wall plane (a wood screw's
   shank is meant to be in the wall and is left out), on the tabletop the smallest height of any box above the table top */
function mountClearance(S, placements, record) {
  let worst = { worst: Infinity, id: null };
  for (const p of placements) {
    if (!p.visible || !S.local[p.id]) continue;
    const b = worldBox(S.local[p.id], p.pos);
    if (p.childY) b.min[1] += Math.min(0, p.childY);   // a pressed tab rides 3 mm below its part (Sol 01a1757e)
    const d = record === 'wall' ? (/WoodScrew/.test(S.cfg[p.id].node) ? Infinity : b.min[2] - S.wallZ) : record === 'ttk' ? b.min[1] - S.tableY : Infinity;
    if (d < worst.worst) worst = { worst: +d.toFixed(2), id: p.id };
  }
  return worst;
}

/* the builds the wall and tabletop clips are filmed on: the wall record is tools/film/wall-hash.txt in the site repo decoded
   (the 2W two-row wall build the 2026-09-01 clips used), the tabletop one is the planner's own 185-tabletop-2w2h kit; both
   with the side covers off (RECORDS.ttk is read from builds/ at start) */
const RECORDS = {
  wall: { mount: 'wall', length: 185, faceStyle: 'classic', handleStyle: 'deco', wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [], gridW: 6, gridH: 4, nextId: 3, printer: 'any', sideCovers: false,
    placed: [{ id: 1, x: 0, y: 6, w: 2, hh: 2, fill: 'decor', shelves: 0, closure: 'none' }, { id: 2, x: 0, y: 4, w: 2, hh: 2, fill: 'decor', shelves: 0, closure: 'none' }] },
  ttk: null,
  ut: null,   // set in main(): the under-table record is declared below
};
/* the tabletop cases stage 25 mm further back than the generator's slideBack (-170 = -max(170, depth - 15)): at -170 a 185
   case lands with its front 15 mm over the parts below it and its drop cuts through them; at -(185 + 10) it clears them by
   10 mm (the QuickLock explainer's fix, tools/film/README.md), and the dip's start fraction is recomputed with the
   generator's own dipFrom for the longer settle */
const TTK_STAGE = [0, 0, -(185 + 10)];
const ttkDip = (dp, S, stages) => { const travel = Math.abs(stages[S.cfg['case2'] ? 'c2' : 'c0'][2]); return dipFrom(travel); };
const ENGINE_CLIPS = {
  /* the wall: bracket + 4 screws; the bench assembly of the top case (case, locks, cover lower with the dip and pop, the
     top-row drawer's stoppers, cover upper); the hang (covers ghosted, 200 mm back onto the pegs, 16 mm drop, solid);
     the lower case sliding in from 225 mm out front */
  bracket: { engine: true, record: 'wall', prefix: 'wall-step-', steps: [1], hide: [], az: 16, el: 10 },
  cover: { engine: true, record: 'wall', prefix: 'wall-step-', steps: [2], hide: [], az: 26, el: 24 },
  hang: { engine: true, record: 'wall', prefix: 'wall-step-', steps: [3], hide: [/^st\d/], az: 20, el: 36, fit: 'end' },
  rows: { engine: true, record: 'wall', prefix: 'wall-step-', steps: [4], hide: [/^st\d|^tst/], az: 18, el: 6, fit: 'end' },
  /* the tabletop (the 185 2W-2H kit): the lower rail lands and the six feet slide in, the base sets down; the upper rail
     slides on from the back; the three cases (restaged, see TTK_STAGE) with their locks, the dips and pops; the two cover
     layers with the top drawer's stoppers; the three drawers with their magnet clips */
  base: { engine: true, record: 'ttk', prefix: 'ttk-step-', steps: [1, 2, 3], hide: [], az: 28, el: 30, fit: 'end' },
  upper: { engine: true, record: 'ttk', prefix: 'ttk-step-', steps: [4], hide: [], az: 22, el: 22 },
  cases: { engine: true, record: 'ttk', prefix: 'ttk-step-', steps: [5, 6, 7], hide: [/^mc|^mg|^st\d/], az: 20, el: 20, stages: { c0: TTK_STAGE, c1: TTK_STAGE, c2: TTK_STAGE }, dipFrom: ttkDip },
  covers: { engine: true, record: 'ttk', prefix: 'ttk-step-', steps: [8, 9], hide: [/^mc|^mg|^st0|^st1/], az: 22, el: 26 },
  drawers3: { engine: true, record: 'ttk', prefix: 'ttk-step-', file: 'drawers', steps: [10], hide: [/^mc|^mg/], az: 18, el: 8 },
  /* the under-table steps as the planner plays them (the second pass, sheets only): the rail, the first case with the
     overhead QuickLock beat (the slab hides above the camera, the planner's own rule), the lower case */
  'ut-rail': { engine: true, record: 'ut', prefix: 'ut-step-', file: 'rail', steps: [1], hide: [/^mc|^mg|^st/] },
  'ut-first': { engine: true, record: 'ut', prefix: 'ut-step-', file: 'first', steps: [2], hide: [/^mc|^mg|^st/] },
  'ut-under': { engine: true, record: 'ut', prefix: 'ut-step-', file: 'under', steps: [3], hide: [/^mc|^mg|^st/] },
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
  return { step: idx, title: h.manifest.steps[idx].title, page: h.cur, hidden, notShown, bases, boxes, child, nodes, rides, caseFront, sideCovers, stepCamera: h.manifest.steps[idx].camera || null,
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
const CAMERA = ({ az, el, fov, W, H, target, toward, heightBoxes, allBoxes, softBoxes, over = 0.2, headroom, side, fitBoxes, margin, endBoxes, span = 0.45, edge = 0.02, clearBoxes, near = 120 }) => {
  /* the end-fit mode (Joey 2026-10-25): the resting subject (endBoxes) spans `span` of the frame height, and every keyframe
     box (fitBoxes) must still be inside the `edge` margin - the distance is the larger of the two, and `pulledBack` says
     when the keyframes, not the subject, set it */
  if (endBoxes) { heightBoxes = endBoxes; headroom = 1 - span; allBoxes = fitBoxes; side = edge; softBoxes = null; fitBoxes = null; }
  /* the whole-path mode: every fit box inside the same margin on all four sides, nothing else */
  if (fitBoxes) { heightBoxes = []; allBoxes = fitBoxes; side = margin; headroom = 2 * margin; }   // softBoxes, when given, stay: the path may run past the frame by `over`, no further
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
  const vlim = endBoxes ? 2 * edge : headroom;   // the keyframes' vertical margin: the edge in the end-fit mode, the headroom otherwise
  const rV = solve((m) => m.top <= 1 - vlim && m.bottom >= -(1 - vlim));
  /* the soft boxes (a start or end pose) may run past the frame's edge by `over` of its half-width, no further */
  const soft = (r) => { const all = (softBoxes || []).flatMap(corners).map((v) => { cam.position.copy(tgt).addScaledVector(dir, r); cam.lookAt(tgt); cam.updateMatrixWorld(true); return v.clone().project(cam); });
    return all.every((v) => Math.abs(v.x) <= 1 + over && Math.abs(v.y) <= 1 + over); };
  const rS = softBoxes && softBoxes.length ? (() => { let lo = 100, hi = 5000; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (soft(mid)) hi = mid; else lo = mid; } return hi; })() : 0;
  let r = Math.max(rH, rW, rV, rS), pulledForPath = 0;
  /* the path clearance: a part that passes between the subject and the camera (a case pushed 200 mm toward the wall from a
     bench nearer the lens, a drawer out front) must stay at least `near` mm in front of the camera - the camera backs off
     along its own axis by exactly the shortfall, which moves every point back by the same amount */
  if (clearBoxes && clearBoxes.length) {
    cam.position.copy(tgt).addScaledVector(dir, r);
    const view = dir.clone().negate();
    let minForward = Infinity;
    for (const b of clearBoxes) for (const c of corners(b)) minForward = Math.min(minForward, c.sub(cam.position).dot(view));
    if (minForward < near) { pulledForPath = near - minForward; r += pulledForPath; }
  }
  const m = probe(r);
  const endSpan = endBoxes ? m.hgt / 2 : null;   // the subject's share of the frame height at the chosen distance
  h.controls.target.copy(tgt); h.controls.update();
  cam.position.copy(tgt).addScaledVector(dir, r); cam.lookAt(tgt); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  return { az, el, fov, target: tgt.toArray(), pos: cam.position.toArray(), r, rH, rW, rV, rS, extents: m, endSpan, pulledBack: endBoxes ? r > rH * 1.001 : false, pulledForPath: +pulledForPath.toFixed(1) };
};
/* one frame: the placements applied (group position, an X rotation, the inner child's y - the QuickLock tab), then the
   loop's own order (grounding, cavity, reflection, AO, accumulation, composite) with the scene told it changed and every
   progressive pass run to its end, read in the same task. `stale` draws the frame the engine's way for a part in motion
   with AO held on - updateAO() unforced keeps the buffer it has - for the proof. */
const FRAME = ({ placements, stale, camera, mount }) => {
  const h = window.__GEN2_VIEWER__, r = h.renderer, c = r.domElement, t0 = performance.now();
  if (camera) {   // the planner's camera on the film clock: position, target and fov as tweenCamera lerps them
    h.camera.position.set(...camera.pos); h.controls.target.set(...camera.target); h.camera.fov = camera.fov; h.camera.updateProjectionMatrix(); h.camera.lookAt(h.controls.target); h.camera.updateMatrixWorld(true);
    /* the render loop is paused, so its two backdrop rules run here: the wall hides behind the camera, the slab above it */
    if (mount === 'wall') h.wall.visible = h.camera.position.z > h.wall.position.z;
    if (mount === 'under-table') h.surface.visible = h.camera.position.y < h.surface.position.y - h.surface.geometry.parameters.height / 2;
  }
  for (const p of placements) {
    const inst = h.instances.get(p.id); if (!inst) throw new Error('no instance ' + p.id);
    const g = inst.group;
    g.visible = !!p.visible;
    if (p.pos) g.position.set(p.pos[0], p.pos[1], p.pos[2]);
    g.rotation.x = p.rotX || 0;
    if (p.childY != null) { const ch = g.children[0]; if (!ch) throw new Error('no inner child on ' + p.id); ch.position.y = p.childY; }
    /* opacity (the engine's ghost / solid / fade): the meshes take a transparent clone of their material while it is below
       1 and get their own back at 1; a ghosted mesh is flagged the way the engine flags one, so the AO pass leaves it
       out (updateAO skips o.userData.ghost) */
    if (p.opacity != null) g.traverse((o) => {
      if (!o.isMesh) return;
      if (p.opacity < 1) {
        if (!o.userData.filmMat) { o.userData.filmMat = o.material; const m = o.material.clone(); m.transparent = true; o.material = m; }
        o.material.opacity = p.opacity; o.userData.ghost = true;
      } else if (o.userData.filmMat) { o.material.dispose(); o.material = o.userData.filmMat; delete o.userData.filmMat; delete o.userData.ghost; }
    });
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

/* the step's phases, the stages and every instance, read from the page for the engine replay: the local boxes are taken on
   the clip's LAST page (everything the clip places is visible there), the start state on the page BEFORE its first step */
const SETUP_ENGINE = ({ first, last, hide }) => {
  const h = window.__GEN2_VIEWER__, T = h.THREE;
  h.setCamOverride(true);
  h.goTo(last + 1, { animate: false });
  /* the wall backdrop is sized to the build (fitWall: ~10 R wide); a bench shot from above looks past its edge into the
     void, so it is stretched in its own plane for the film - its z, the plane every check measures against, is unchanged */
  if (h.wall && h.wall.visible) h.wall.scale.set(5, 5, 1);
  const local = {}, cfg = {};
  for (const x of h.instances.values()) {
    cfg[x.cfg.id] = { pos: x.cfg.pos, stage: x.cfg.stage || null, node: x.cfg.node, rides: x.cfg.rides || null, yaw: x.cfg.yaw || 0 };
    if (!x.group.visible) continue;
    x.group.updateMatrixWorld(true);
    const b = new T.Box3().setFromObject(x.group), p = x.group.position;
    local[x.cfg.id] = { min: [b.min.x - p.x, b.min.y - p.y, b.min.z - p.z], max: [b.max.x - p.x, b.max.y - p.y, b.max.z - p.z] };
  }
  /* page `first` = the after-state of step first-1 = the before-state of step `first`. Before the FIRST real step (first
     = 1) the page is the exploded overview, which shows every part flung out; the state before that step is nothing
     placed, every staged group still on its stage - set by hand */
  h.goTo(first === 1 ? 2 : first, { animate: false });
  const before = { visible: [], pos: {}, staged: {} }, hidden = [];
  for (const x of h.instances.values()) {
    if (first === 1) { x.group.visible = false; x.staged = !!x.cfg.stage; x.group.position.set(...x.cfg.pos); if (x.staged && h.manifest.stages[x.cfg.stage]) { const o = h.manifest.stages[x.cfg.stage]; x.group.position.x += o[0]; x.group.position.y += o[1]; x.group.position.z += o[2]; } }
    before.pos[x.cfg.id] = x.group.position.toArray(); before.staged[x.cfg.id] = !!x.staged;
    if (hide.some((re) => new RegExp(re).test(x.cfg.id))) { if (x.group.visible) hidden.push(x.cfg.id + ' (' + x.cfg.node + ')'); x.group.visible = false; continue; }
    if (x.group.visible) before.visible.push(x.cfg.id);
  }
  const steps = h.manifest.steps.slice(first, last + 1).map((s) => ({ title: s.title, camera: s.camera || null, phases: s.phases || [] }));
  const sideCovers = [...h.instances.values()].filter((x) => /SideCover/.test(x.cfg.node)).map((x) => x.cfg.id);
  return { first, last, steps, stages: h.manifest.stages || {}, cfg, local, before, hidden, sideCovers, page: h.cur,
    wallZ: h.wall && h.wall.visible ? h.wall.position.z : null, tableY: h.table && h.table.visible ? h.table.position.y : null,
    shadowMap: h.renderer.shadowMap.enabled, ids: Object.keys(cfg) };
};

async function openStage(browser, base, record = RECORD) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await ctx.route(/goatcounter|gc\.zgo/, (r) => r.abort());
  await ctx.addInitScript((theme) => { try {
    localStorage.setItem('gen2-quality', 'veryhigh'); localStorage.setItem('gen2-quality:set', '1');   // the explicit pick locks the tier against the auto-downgrade
    localStorage.setItem('skipgc', 't'); localStorage.setItem('gen2-theme', theme);
  } catch {} window.__FILM_AO_DURING_TWEENS = true; }, THEME);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const hash = Buffer.from(JSON.stringify(record), 'utf8').toString('base64');
  await page.goto(`${base}/index.html?ws=assemble&debug=1&idle=off&new=1#build=${hash}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__GEN2_VIEWER__ && window.__GEN2_VIEWER__.manifest && window.__GEN2_STORE__ && document.querySelector('#ws-player'), null, { timeout: 150_000 });
  await page.waitForTimeout(2000);
  const quality = await page.evaluate(() => ({ tier: window.__GEN2_VIEWER__.quality, theme: window.__GEN2_VIEWER__.stageTheme, pr: window.__GEN2_VIEWER__.renderer.getPixelRatio(), shadowMap: window.__GEN2_VIEWER__.renderer.shadowMap.enabled,
    steps: window.__GEN2_VIEWER__.manifest.steps.map((s) => s.title), sideCovers: window.__GEN2_STORE__.state.sideCovers }));
  if (quality.tier !== 'veryhigh') throw new Error('the tier drawing is ' + quality.tier);
  return { ctx, page, errors, quality };
}

async function film(name, clip, browser, base, pose) {
  const dir = join(OUT, name), framesDir = join(dir, 'frames'), prefix = clip.prefix || 'ut-step-', file = clip.file || name;
  await mkdir(framesDir, { recursive: true });
  const record = clip.record ? RECORDS[clip.record] : RECORD;
  const { ctx, page, errors, quality } = await openStage(browser, base, record);   // a fresh page per clip: the stage's state is the step's own
  const run = { name, startedAt: new Date().toISOString(), W, H, FPS, START, THEME, record, quality, frames: [], proof: [] };
  const tStart = Date.now();
  let N, S, frames, cameraSpec, plan = null;
  try {
    if (clip.engine) {
      S = await page.evaluate(SETUP_ENGINE, { first: clip.steps[0], last: clip.steps[clip.steps.length - 1], hide: clip.hide.map((re) => (re instanceof RegExp ? re.source : re)) });
      if (S.sideCovers.length) throw new Error('side covers instanced: ' + S.sideCovers.join(','));
      plan = engineTimeline(S, clip);
      run.dur = plan.dur; N = Math.round(FPS * plan.dur); frames = plan.frames;
      run.setup = { steps: S.steps.map((s) => s.title), first: S.first, last: S.last, page: S.page, hidden: S.hidden, notShown: S.ids.filter((id) => !S.before.visible.includes(id) && !plan.touched.has(id)).map((id) => id + ' (' + S.cfg[id].node + ')'), skipped: plan.skipped, stages: plan.stages, wallZ: S.wallZ, tableY: S.tableY, shadowMap: S.shadowMap, timeline: plan.log, clearance: plan.clearance };
      /* the planner's own camera beats, each fitted to its subject with the 8 % margin: the preset's direction (t = azimuth,
         p = polar -> elevation 90 - p) and fov, the distance and target from the subject box. A preset without a camera (a
         step with none) keeps the previous beat's */
      for (const b of plan.beats) {
        if (!b.preset) { b.cam = null; continue; }
        const c = await page.evaluate(CAMERA, { az: b.preset.t, el: 90 - b.preset.p, fov: b.preset.fov || 40, target: centre(b.subjectBox), toward: 0, fitBoxes: b.subject, margin: MARGIN, clearBoxes: b.path, near: NEAR, softBoxes: b.path, over: PATH_OVER, W, H });
        b.cam = { pos: c.pos, target: c.target, fov: b.preset.fov || 40, r: c.r, extents: c.extents, pulledForPath: c.pulledForPath };
      }
      for (let i = 0; i < plan.beats.length; i++) if (!plan.beats[i].cam) plan.beats[i].cam = i ? plan.beats[i - 1].cam : null;
      if (!plan.beats[0].cam) throw new Error('the first step has no camera preset');
      run.beats = plan.beats.map((b) => ({ t: b.t, dur: b.dur, tEnd: b.tEnd, kind: b.kind, step: b.step, preset: b.preset, actors: b.actorIds, subject: b.subjectIds, subjectBox: { min: b.subjectBox.min.map((v) => +v.toFixed(1)), max: b.subjectBox.max.map((v) => +v.toFixed(1)) }, cam: { az: b.preset ? b.preset.t : null, el: b.preset ? 90 - b.preset.p : null, fov: b.cam.fov, r: +b.cam.r.toFixed(1), pos: b.cam.pos.map((v) => +v.toFixed(1)), target: b.cam.target.map((v) => +v.toFixed(1)), extents: b.cam.extents, pulledForPath: b.cam.pulledForPath } }));
      cameraSpec = null;
      run.camera = await page.evaluate(CAMERA, { az: plan.beats[0].preset.t, el: 90 - plan.beats[0].preset.p, fov: plan.beats[0].preset.fov || 40, target: centre(plan.beats[0].subjectBox), toward: 0, fitBoxes: plan.beats[0].subject, margin: MARGIN, clearBoxes: plan.beats[0].path, near: NEAR, softBoxes: plan.beats[0].path, over: PATH_OVER, W, H });   // the page opens on beat 0
    } else {
      S = await page.evaluate(SETUP, { title: clip.title, hide: clip.hide.map((re) => (re instanceof RegExp ? re.source : re)) });
      if (S.sideCovers.length) throw new Error('side covers instanced: ' + S.sideCovers.join(','));
      S.pose = pose; S.riders = (id) => S.rides[id] || [];
      /* how far a QuickLock can start above its seat without entering the slab: the engine's 45 mm, or 3 mm under the underside */
      S.dropOf = (id) => Math.min(45, S.surfaceUnderY - 3 - box(S, id).max[1]);
      run.dur = clip.dur; N = Math.round(FPS * clip.dur); frames = (t) => clip.frames(t, S);
      /* --planner-camera: the step's own camera direction and fov, fitted to the clip's subject at rest (the under-table
         drawers and release, second pass); the hold / slab machinery is skipped */
      if (flag('--planner-camera') && clip.subject) {
        const sub = clip.subject(S), pc = S.stepCamera || { t: 12, p: 97 };
        cameraSpec = { az: pc.t, el: 90 - pc.p, fov: pc.fov || 40, target: centre(union(...sub)), toward: 0, fitBoxes: sub, margin: MARGIN, clearBoxes: clip.path ? clip.path(S) : sub, near: NEAR, softBoxes: clip.path ? clip.path(S) : sub, over: PATH_OVER };
        clip = { ...clip, minHold: null, slabCheck: null };
        run.subject = { preset: pc, boxes: sub };
      }
      run.setup = { step: S.step, title: S.title, page: S.page, hidden: S.hidden, notShown: S.notShown, ids: S.ids, caseFront: S.caseFront, surfaceUnderY: S.surfaceUnderY, boxes: S.boxes, drops: Object.fromEntries(S.ids.filter((i) => /^ql/.test(i)).map((i) => [i, S.dropOf(i)])) };
    }
    run.N = N;
    /* the workspace pans the projection clear of its player card (setSafeArea -> setViewOffset), and re-asks on every page
       event - so it is cleared AFTER goTo's onPage microtask has run, then the loop lerps the pan back to zero and snaps it
       to clearViewOffset. No tween left either. */
    await page.evaluate(() => window.__GEN2_VIEWER__.setSafeArea(null));
    await page.waitForFunction(() => { const h = window.__GEN2_VIEWER__; return h.tweenCount === 0 && !(h.camera.view && h.camera.view.enabled); }, null, { timeout: 20_000 });
    /* the hold (first, under): start at the world minimum (locks' start 10 mm under the slab's underside), then deepen in
       5 mm steps until the locks' start boxes project under the slab's front edge with 2 % of the frame to spare - the
       camera is re-fitted at every step, since the lowered start pose is part of the fit */
    S.hold = clip.minHold ? Math.ceil(clip.minHold(S)) : 0;
    for (let i = 0; cameraSpec || !plan; i++) {
      if (cameraSpec && cameraSpec.endBoxes) {
        /* the end fit: the subject at its span first; when the keyframes do not fit the 2 % edge from the clip's own angle,
           the elevation steps toward +10 and the azimuth toward 32 (the travel then changes the apparent size less); only
           when no angle fits does the last one pull back until the keyframes are inside */
        let az = cameraSpec.az, el = cameraSpec.el; run.fitTried = [];
        for (let k = 0; ; k++) {
          run.camera = await page.evaluate(CAMERA, { ...cameraSpec, az, el, W, H });
          run.fitTried.push({ az, el, r: +run.camera.r.toFixed(1), endSpan: +run.camera.endSpan.toFixed(3), pulledBack: run.camera.pulledBack });
          if (!run.camera.pulledBack || (Math.abs(el - 10) < 0.01 && Math.abs(az - 32) < 0.01) || k > 12) break;
          el += Math.sign(10 - el) * Math.min(4, Math.abs(10 - el)); az += Math.sign(32 - az) * Math.min(4, Math.abs(32 - az));
        }
        /* no angle let the subject keep its span: take the angle where the pull-back costs the least (the largest end span) */
        if (run.camera.pulledBack) {
          const best = run.fitTried.reduce((a, b) => (b.endSpan > a.endSpan ? b : a));
          if (best.az !== run.camera.az || best.el !== run.camera.el) run.camera = await page.evaluate(CAMERA, { ...cameraSpec, az: best.az, el: best.el, W, H });
        }
        break;
      }
      run.camera = await page.evaluate(CAMERA, { ...(cameraSpec || clip.camera(S)), W, H });
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
      return { buffer: [r.domElement.width, r.domElement.height], pr, surfaceVisible: h.surface.visible, wallVisible: h.wall.visible, tableVisible: h.table.visible, cameraY: h.camera.position.y, cameraZ: h.camera.position.z, viewOffset: !!(h.camera.view && h.camera.view.enabled), accWanted: h.accWanted(), aoWanted: h.aoWanted(), ACC: h.ACC_SAMPLES, AO: h.ao.accumMax, shadowMap: h.renderer.shadowMap.enabled, sunShadow: !!h.scene.children.find((o) => o.isDirectionalLight && o.castShadow) };
    }, [W, H]);
    if (run.paused.buffer[0] !== W || run.paused.buffer[1] !== H) throw new Error('drawing buffer ' + run.paused.buffer.join('x') + ', wanted ' + W + 'x' + H);
    const backdropOk = clip.record === 'wall' ? run.paused.wallVisible : clip.record === 'ttk' ? run.paused.tableVisible : run.paused.surfaceVisible;
    if (run.paused.viewOffset || !backdropOk || !run.paused.accWanted) throw new Error('not ready to film: ' + JSON.stringify(run.paused));
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
    run.mount = plan ? { worst: Infinity, frame: null } : null;   // the mount rule: the smallest clearance to the backdrop plane over the film
    /* the camera at t: the beat in force, tweened from the one before over its duration with the engine's ease */
    const camAt = (t) => {
      if (!plan) return null;
      const bs = plan.beats; let i = 0; for (let j = 0; j < bs.length; j++) if (bs[j].t <= t + 1e-9) i = j;
      const b = bs[i], prev = i ? bs[i - 1].cam : null;
      if (!prev || b.dur <= 0 || t >= b.t + b.dur) return { pos: b.cam.pos, target: b.cam.target, fov: b.cam.fov };
      const k = easeInOut((t - b.t) / b.dur);
      return { pos: lerp3(prev.pos, b.cam.pos, k), target: lerp3(prev.target, b.cam.target, k), fov: prev.fov + (b.cam.fov - prev.fov) * k };
    };
    const mountName = record.mount;
    for (let f = 0; f < N; f++) {
      const t = f / FPS, placements = frames(t), t0 = Date.now();
      if (plan) {   // nothing through or behind the wall, nothing below the table top - per frame, from the placements and the local boxes
        const m = mountClearance(S, placements, clip.record);
        if (m.worst < run.mount.worst) run.mount = { ...m, frame: f, t: +t.toFixed(3) };
        if (m.worst < -0.5) throw new Error(`${name} frame ${f} (t ${t.toFixed(2)}): ${m.id} is ${(-m.worst).toFixed(1)} mm ${clip.record === 'wall' ? 'behind the wall' : 'below the table top'}`);
      }
      const camNow = camAt(t) || (run.camera ? { pos: run.camera.pos, target: run.camera.target } : null);
      /* a part that leaves the frame through the camera (the release clip's drawer) is hidden once its box comes within 30 mm
         of the lens or passes behind it */
      if (clip.cullNear && camNow) for (const p of placements) if (clip.cullNear.includes(p.id) && p.visible && S.boxes && S.boxes[p.id]) {
        const lb = S.boxes[p.id], base = S.bases[p.id], b = { min: [lb.min[0] - base[0] + p.pos[0], lb.min[1] - base[1] + p.pos[1], lb.min[2] - base[2] + p.pos[2]], max: [lb.max[0] - base[0] + p.pos[0], lb.max[1] - base[1] + p.pos[1], lb.max[2] - base[2] + p.pos[2]] };
        const v = [camNow.target[0] - camNow.pos[0], camNow.target[1] - camNow.pos[1], camNow.target[2] - camNow.pos[2]], vl = Math.hypot(...v), view = v.map((x) => x / vl);
        let minF = Infinity; for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) minF = Math.min(minF, (x - camNow.pos[0]) * view[0] + (y - camNow.pos[1]) * view[1] + (z - camNow.pos[2]) * view[2]);
        if (minF < 30) { p.visible = false; run.culled = run.culled || {}; run.culled[p.id] = run.culled[p.id] ?? +t.toFixed(3); }
      }
      const r = await page.evaluate(FRAME, { placements, camera: camAt(t), mount: mountName });
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
  const mp4 = join(OUT, `${prefix}${file}.mp4`);
  /* crf 20, and one step coarser at a time while the file is over the cap (a tight frame full of powder grain costs bits) */
  for (let crf = 20; ; crf++) {
    ff(['-framerate', String(FPS), '-i', posix(join(framesDir, 'frame_%03d.png')), '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', posix(mp4)]);
    run.crf = crf;
    if ((await stat(mp4)).size <= CAP_BYTES || crf >= 26) break;
  }
  ff(['-i', posix(join(framesDir, 'frame_000.png')), '-q:v', '3', posix(join(OUT, `${prefix}${file}-poster.jpg`))]);   // q:v 3 ~ JPEG quality 85
  const every = Math.max(1, Math.floor((N - 1) / 7));   // 8 frames: 0, every, ..., 7*every
  ff(['-i', posix(join(framesDir, 'frame_%03d.png')), '-vf', `select='not(mod(n\\,${every}))*lte(n\\,${7 * every})',scale=600:-1,tile=4x2:padding=4:margin=4:color=0x202020`, '-frames:v', '1', '-fps_mode', 'vfr', posix(join(OUT, `${prefix}${file}-sheet.png`))]);
  if (clip.proof && !flag('--no-proof')) {
    const ins = [...clip.proof.map((t) => `proof-stale-t${t.toFixed(1)}.png`), ...clip.proof.map((t) => `proof-converged-t${t.toFixed(1)}.png`)].flatMap((n) => ['-i', posix(join(dir, n))]);
    const sc = [0, 1, 2, 3, 4, 5].map((i) => `[${i}:v]scale=600:-1,pad=iw+8:ih+8:4:4:${i < 3 ? 'red' : 'green'}[v${i}]`).join(';');
    ff([...ins, '-filter_complex', `${sc};[v0][v1][v2]hstack=3[top];[v3][v4][v5]hstack=3[bot];[top][bot]vstack=2`, '-frames:v', '1', posix(join(OUT, `${prefix}${file}-proof-stale-vs-converged.png`))]);
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
  const ALL = { ...CLIPS, ...ENGINE_CLIPS };
  const names = WANTED.length ? WANTED : Object.keys(CLIPS);
  for (const n of names) if (!ALL[n]) throw new Error('no clip ' + n + '; clips: ' + Object.keys(ALL).join(' '));
  RECORDS.ttk = { ...JSON.parse(await readFile(join(root, 'builds', '185-tabletop-2w2h.json'), 'utf8')).build, sideCovers: false };   // the planner's tabletop-185 starter kit, side covers off
  RECORDS.ut = RECORD;
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
      const r = await film(n, ALL[n], browser, base, pose);
      summary.clips[n] = { title: r.setup.title || r.setup.steps, page: r.setup.page, dur: r.dur, N: r.N, mp4Bytes: r.mp4Bytes, filmMs: r.filmMs, totalMs: r.totalMs, camera: r.camera, cameraY: r.paused.cameraY, hidden: r.setup.hidden, notShown: r.setup.notShown, drops: r.setup.drops, mount: r.mount, clearance: r.setup.clearance, shadowMap: r.paused.shadowMap, errors: r.errors, unconverged: r.unconverged || [] };
    }
  } finally {
    await browser.close(); server.close();
  }
  await writeFile(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
}
main().catch((e) => { console.error(e); process.exit(2); });
