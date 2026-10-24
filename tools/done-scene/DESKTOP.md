# Running the Done scene's heavy work on the desktop

Joey (2026-10-23): "can we utilize the desktop for most of this work since it's mostly idle compared to the laptop?"
Yes, for everything below. The route is the standing one for renders: a Claude Code session ON the desktop (RENDER-NODE.md
there), files between machines through node0's mirror (`~/render-assets/modulith-planner/done-scene/` holds the
`renders/look1..3` rounds already). The laptop keeps only the browser pane checks.

## Set up once (desktop)

1. `git clone https://github.com/Jerrari12/modulith-planner` and `git checkout done-scene`; beside it
   `git clone https://github.com/Jerrari12/gen2-parts` (the part GLBs and thumbnails).
2. In the planner checkout: `parts` → `..\gen2-parts\parts` and `img\parts` → `..\gen2-parts\img\parts` (junctions:
   `New-Item -ItemType Junction -Path parts -Target ..\gen2-parts\parts`, the same for `img\parts`), `npm ci`,
   `npx playwright install chromium`. Node 22. Blender 4.5.x (its Python ships numpy); OptiX on the 3080 Ti.
3. The kit for the look renders, decoded for Blender (it cannot read the parts' meshopt compression):
   `node tools/done-scene/decode-glb.mjs test/golden/185-tabletop-2w2h.manifest.json parts/185 tools/done-scene/kit/parts`
   (`tools/done-scene/kit/` is ignored by git).

The photographed textures (`tools/done-scene/textures/*/SOURCE.md` records each) are not in git: they live on node0 at
`~/render-assets/modulith-planner/done-scene/textures/`, and `room.py` fetches a missing one over scp the first time a
render needs it (`--desk-wood`). A new texture goes to that folder on node0 and gets a SOURCE.md line.

## A look render (direction rounds)

```
blender -b --factory-startup --python-exit-code 1 --python tools/done-scene/room.py -- --mode look --name look4 \
  --kit test/golden/185-tabletop-2w2h.manifest.json --parts tools/done-scene/kit/parts --out-dir renders/look4 \
  --res 2048x1365 --samples 160 [--sun-el 9] [--sun-rot 242] [--sun-strength 0.5] [--cam-az 30] [--cam-el 16] \
  [--lens 35] [--fill 0.36] [--exposure <scalar>]
```

Writes `look4.png` (the picture: three's own Neutral tone curve applied in numpy), `look4.exr` (scene-linear),
`look4.json` (the exposure it chose, the measured sun direction, the camera) and `look4.blend` (open it to direct by
hand; every knob above is also a flag). `--post-only` re-applies exposure to an existing EXR without rendering.
`renders/` is ignored by git; send the PNG and JSON back by `scp` into node0's
`~/render-assets/modulith-planner/done-scene/renders/<round>/` (the laptop fetches from there), or attach them in the
session. The room itself is `build_room()` in `room.py`: props are primitives with a `slot`, `gap` and `group`; a
scanned or downloaded plant goes in the same way as the kit does (`import_template`), scaled to metres, in the plant's
slot. Nishita's sun: `sun_rotation` is clockwise from +Y and the direction is MEASURED from the disc on every render.

## The bake (after a direction is settled)

```
blender -b --factory-startup --python-exit-code 1 --python tools/done-scene/room.py -- --mode bake --name room \
  --out-dir renders/bake2 --exposure <the look's json "exposure"> --bake-samples 192 [the same sun/camera flags]
```

About three minutes on an RTX card. Writes `room.glb` (WebP lightmaps, Blender exports the emission as an emissive
texture: `js/scenes/done.js` reads it as the picture) and `room.json` (anchors, desk extent, measured sun, hero shot,
prop slots, exposure). Copy both to `scenes/home-office/`, run the checks below, commit on `done-scene`, push.
`--skip-bake` exports flat colours for a quick geometry check; `--lm-scale 0.0625 --bake-samples 4` is a 20 s path check.

## The checks (all on the desktop)

- `node --test test/done-fit.test.mjs test/idle-settling.test.mjs test/shadow-at-rest.test.mjs test/swap-shadows.test.mjs`
  (seconds), then `npm test` (five to twelve minutes; it reads `js/main.js` as text, so edit nothing while it runs).
- `node --test --test-name-pattern="Done scene" e2e/workspaces.mjs` (20 s; the suite serves the working tree: edit
  nothing while it runs). `--test-name-pattern="Done scene|idle gate|Assemble|every workspace boots"` for the
  neighbours. `E2E_SOFT=1` reproduces the CI runner's SwiftShader.
- `npm run goldens` (ten minutes; 60 shots must read 0 differ: the flag off draws the same pixels).
- `node tools/done-scene/measure.mjs [--soft]` (four minutes each; a quiet machine; the numbers are the desktop's and say so).
- Mutants: the e2e case must fail with the hold dropped, the shadow term dropped, Back without leave, the callouts left
  on, the environment not held through a tier change, the flag not read (see DECISIONS.md's 2026-10-23 entry).

## What stays as it is

Joey's rules: commit only after the change's own tests pass; write code with the Edit tool; never edit a file a test run
reads; every commit-sized change and any design conclusion gets a cloud review (the `codex-collab` skill; Terra for
code, Sol for design); nothing deploys without Joey's go, and `done-scene` is not merged to main by this work. The
design, the look history and the measurements are `D:\Claude - Output\done-scene-2026-10-23\DESIGN.md` on the laptop;
the DECISIONS entry on the branch carries the facts.
