/* WHERE THE PORTED RULES ARE AHEAD OF THE OLD PLANNER, ON PURPOSE: the dated edits tools/port-rules.mjs applies on top
 * of the old planner's text, so a re-port keeps them instead of silently dropping them. All four were made by hand in
 * the generated modules (2026-10-16 and 2026-10-20); `npm run drift` reported them on 2026-10-21 as lines a port would
 * delete, and since 2026-10-22 they live here (DECISIONS.md of that date).
 *
 * Each entry names the generated module, its date and why, where it stands upstream, and its edits: each an exact
 * [from, to] on the module's generated text (header and mechanical edits included), `from` found exactly once. An edit
 * that no longer applies stops the port, and is drift under --check: the old planner moved under it (read its diff,
 * then re-cut the edit), or it carries the change now (the `to` text is already there) and the entry goes. An entry
 * goes too when the old planner is retired at the cutover and these modules stop being ported.
 *
 * The parity gate (test/parity/bom-parity.test.mjs) keeps its own AHEAD list for the differences its draws reach: today
 * the back cover note only (the toggle is off only on a record the old planner never makes; its random builds never
 * have a gap).
 */
const lines = (...l) => l.join('\n');

export const AHEAD = [
  {
    id: 'side-covers-per-run',
    file: 'js/rules/bom.js',
    since: '2026-10-16',
    why: 'side covers on the outer sides of EACH column run: a tabletop with a gap is two sections, and the sides facing the gap are exposed too (a gap build billed 2 side covers where it needs 4)',
    upstream: 'a fix the old planner needs too (its gap builds under-bill the same way); not edited from here: Joey\'s call',
    edits: [
      [lines(
        `      const minX = Math.min(...build.placed.map((p) => p.x));`,
        `      const maxX = Math.max(...build.placed.map((p) => p.x + p.w));`,
      ), lines(
        `      // the outer sides of EACH run of columns: a tabletop with a gap is two separate sections, and the sides facing`,
        `      // the gap are exposed too (2026-10-16: a gap build billed 2 side covers where its two sections need 4; on a`,
        `      // build without a gap this is the old outermost-edge rule)`,
        `      const runStarts = new Set(columnRuns().map((r) => r.start));`,
        `      const runEnds = new Set(columnRuns().map((r) => r.start + r.len));`,
      )],
      [`        const exposedSides = (p.x === minX ? 1 : 0) + (p.x + p.w === maxX ? 1 : 0);`,
        `        const exposedSides = (runStarts.has(p.x) ? 1 : 0) + (runEnds.has(p.x + p.w) ? 1 : 0);`],
    ],
  },
  {
    id: 'side-covers-toggle-bom',
    file: 'js/rules/bom.js',
    since: '2026-10-20',
    why: 'the Build style Side covers toggle: no side cover rows when the record says sideCovers === false, as the stage places none',
    upstream: 'the planner\'s own feature: the old planner has no toggle and never writes the field',
    edits: [
      [lines(
        `      const sideCovers = new Map(); // height -> qty`,
        `      build.placed.forEach((p) => {`,
      ), lines(
        `      const sideCovers = new Map(); // height -> qty`,
        `      // switched off in Build style (build.sideCovers === false, 2026-10-20): no rows, as the stage places none`,
        `      if (build.sideCovers !== false) build.placed.forEach((p) => {`,
      )],
    ],
  },
  {
    id: 'back-cover-tearaway-note',
    file: 'js/rules/bom.js',
    since: '2026-10-20',
    why: 'v2609: the standard Decor drawer prints with a tear-away front; the back cover row says to take it out first',
    upstream: 'whether the old planner gets the same sentence is Joey\'s call (DECISIONS 2026-10-20); the parity gate strips it',
    edits: [
      [`          note: "Optional · clips in behind the faceplate to close the open-front Decor drawer. Included in the faceplate download.",`,
        lines(
          `          /* v2609 (2026-10-19): the standard drawer prints with a tear-away front like the`,
          `             Gridfinity one; left in, it and the cover interfere (Joey), so the front comes out first */`,
          `          note: "Optional · clips in behind the faceplate to close the open-front Decor drawer. Take the drawer's tear-away front out first - left in, it and the cover interfere. Included in the faceplate download.",`,
        )],
    ],
  },
  {
    id: 'side-covers-toggle-field',
    file: 'js/rules/schema.js',
    since: '2026-10-20',
    why: 'the toggle\'s record field: sideCovers in BUILD_FIELDS, and sanitize reads only an explicit false as off',
    upstream: 'the planner\'s own field; carrying it in the old planner too would stop its re-save turning the covers back on (Sol 01a15b12, a documented limit): Joey\'s call',
    edits: [
      [`  "labelStyle", "buildId", "labelList", "labelAssign"];`,
        lines(
          `  "labelStyle", "buildId", "labelList", "labelAssign",`,
          `  // the planner's own field (2026-10-20), not the old planner's: side covers on (the 2026-10-17 default, every build) or`,
          `  // off; absent in every older record and share link, which read as on`,
          `  "sideCovers"];`,
        )],
      [`  d.backCover = !!d.backCover;\n`,
        lines(
          `  d.backCover = !!d.backCover;`,
          `  d.sideCovers = d.sideCovers !== false;   // only an explicit false switches them off; anything else is the default, on`,
          ``,
        )],
    ],
  },
];

const count = (text, s) => text.split(s).length - 1;

/* apply every entry for one generated module, in order; throws, naming the entry, on an edit that does not apply */
export function applyAhead(rel, text) {
  for (const a of AHEAD.filter((x) => x.file === rel)) {
    for (const [i, [from, to]] of a.edits.entries()) {
      // the result first: an edit that only inserts keeps its `from` inside its `to`, so a `from` still found once
      // would apply it a second time over the old planner's own copy
      const n = count(text, from);
      if (n === 1 && !text.includes(to)) { text = text.replace(from, () => to); continue; }
      const why = text.includes(to) ? 'the old planner carries it now (the edit\'s result is already there): remove the entry'
        : n === 0 ? 'its text is gone: the old planner moved under it; read the diff and re-cut the edit'
          : `its text is found ${n} times, so where it goes is ambiguous: lengthen it`;
      throw new Error(`tools/port-ahead.mjs: ${a.id} (${a.since}), edit ${i + 1} of ${a.edits.length}, no longer applies to ${rel}: ${why}`);
    }
  }
  return text;
}
