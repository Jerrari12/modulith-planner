# Brief for the desktop session: the Done scene's renders, bakes and checks (2026-10-23)

You are a Claude Code session on Joey's desktop (RTX 3080 Ti), taking over the heavy side of the MODULITH planner's
Done scene from the laptop session that built it. Read `tools/done-scene/DESKTOP.md` first: it has the one-time setup,
every command and every knob. This file says what to do, in order, and what to report.

## Where things stand

- Branch `done-scene` of `Jerrari12/modulith-planner` (commits 80b0cca, 3d4e746; fetch, main moves). The finished build
  appears in a lightmapped Home-office room at golden hour behind `?done=room` at Assemble's Done. Not deployed, not
  merged; a feature ships only on Joey's go.
- The facts are in `docs/redesign/DECISIONS.md`, the entry "2026-10-23 (the Done scene, 5b's first slice...)". The design,
  the three look renders and the measurements live on the laptop (`D:\Claude - Output\done-scene-2026-10-23\`); the
  renders are also on node0 under `~/render-assets/modulith-planner/done-scene/renders/look1..3`.
- Joey chose B, the brief's real-time lightmapped room; the look check first. look3 (sun disc at half strength, exposure
  on the subject's bright end, 0.11258) is the light the current bake carries. His direction on the look is pending:
  the framing (az 30, el 16, 35 mm, the build at 36 % of the frame height), the sun's strength and height, the desk's
  warmth, which props and where, the screen's state, and the plant, which is a placeholder (five spheres on a
  cylinder). Plant options he has been given: a CC0 scanned potted plant (Poly Haven) imported like the kit; a scan of
  his own plant on his Einstar 2 (thick, still foliage only: a succulent, a jade plant, a cactus; thin leaves scan as
  holes); a prop whose shape reads real low-poly.
- A Very High idle-gate bug on main was found and fixed on the branch; a laptop session is cherry-picking it to main.
  Leave that alone.

## Do, in order

1. **Set up** per DESKTOP.md: the two clones (planner on `done-scene`, gen2-parts), the `parts` and `img\parts`
   junctions, `npm ci`, `npx playwright install chromium`, Blender 4.5.x on the path or by full path, the kit decoded
   (`decode-glb.mjs`). Prove it: `node --test test/done-fit.test.mjs test/idle-settling.test.mjs
   test/shadow-at-rest.test.mjs test/swap-shadows.test.mjs` (31 pass), then
   `node --test --test-name-pattern="Done scene" e2e/workspaces.mjs` (1 pass, about 20 s).
2. **Reproduce look3** as `look4` with the defaults (`--mode look --name look4 ...`, DESKTOP.md's command, no extra
   flags): its JSON should report an exposure near 0.1126 and a measured sun direction near (-0.87, -0.46, 0.16) in
   Blender axes. Send `look4.png` and `look4.json` to node0's `~/render-assets/modulith-planner/done-scene/renders/look4/`
   (scp) and say so. That proves the desktop renders what node0 rendered.
3. **Direction rounds.** When Joey gives direction, render a look per round with the flags (or edits to `build_room()`
   in `room.py` for props), send each back the same way, and say in one line what changed. Keep the knobs' values in
   the job file `tools/done-scene/jobs/lookN.txt` so a round is reproducible.
4. **The bake** once a look is settled: `--mode bake` with THAT look's exposure, copy `room.glb` and `room.json` to
   `scenes/home-office/`, then the checks: the four unit files, `npm test` (edit nothing while it runs: it reads
   `js/main.js` as text), the Done e2e case and its neighbours (`--test-name-pattern="Done scene|idle gate|Assemble|every
   workspace boots"`), `npm run goldens` (60 shots, 0 differ), `node tools/done-scene/measure.mjs` and `--soft` (a quiet
   machine; label the numbers as the desktop's). Then the review: the diff to Terra per the `codex-collab` skill if it
   is set up on the desktop; if it is not, say so and leave the review to the laptop session rather than skipping it.
   Commit on `done-scene` with a message that says what changed in the room and why, push. Never merge to main.
5. **Report** after each step: what ran, what passed and failed with the output, the commit hash, where the files are.

## Rules that hold here

Commit only after the change's own tests pass. Write code with the Edit tool. Never edit a file a test run reads (the e2e
suite serves the working tree). No deploy, no merge to main, nothing public without Joey's go. Analytics numbers never
go in commits or reviews. Blender's own rules in `room.py`'s header: metres, Z up; the anchor `anchor_tabletop`; props
with `slot`, `gap`, `group`; the exposure folded into the bake; the sun direction measured, never assumed.
