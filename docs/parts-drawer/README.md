# The parts drawer in the planner

The MODULITH parts drawer generator (a Decor drawer whose inside is a layout of compartments, label holders, scoops and
ramps, generated with manifold-3d and downloaded as STL or 3MF) moved into this repo on 2026-11-04 (M0 of the plan in
`SPEC.md`, "Planner integration: the next session"). The prototype artifact stays as it was; this copy is the one that
moves on.

- `SPEC.md`: the generator's handoff spec, measured geometry, rules, data model and the planner plan. Start at
  "Planner integration: the next session (2026-11-04)".
- `KICKOFF-PROMPT.md`, `PRINT-ROUND.txt`: the session's opening prompt and the print round that was out when it started.
- `VALIDATION.md`: what each of the generator's validation scripts checks. The Node ones live on here as
  `test/parts-drawer/*.test.mjs` (see below); the Python ones and the browser harnesses stay with the prototype.
- `prototype/index.html`: the prototype page (v28) for reference. Not loaded by the planner; it expects the modules
  beside it and a CDN three.js, so it does not run from here.

## Code

`js/parts-drawer/`:

- `gen.js`, `marks.js`, `inventory.js`, `export.js`: the generator's modules, verbatim from the prototype's `site/`.
  Geometry is not changed here (the brief's rule); the `assets/*.json` strings in `gen.js` (`HOLDERS[].asset`,
  `SHELL_BASES`) name the prototype's base64 files and are not read by the planner, which loads the STLs below.
- `lib/manifold.js`, `lib/manifold.wasm`: manifold-3d 3.5.3. The wasm is found beside the script (`import.meta.url`)
  in node and in the browser alike.
- `assets/`: the two Fusion shells (`shell_240-2W-05H.stl`, `shell_240-2W-1H.stl`; every other size and height is
  made from them, `shellFor` in gen.js) and the two holder stamps (`holder_stamp.stl` is Small, `holder_stamp_large.stl`
  Large). Binary STL, byte for byte the prototype's JSON payloads.
- `zip.js`: the download's archive writer (deflate through `CompressionStream`), replacing the prototype's JSZip.
- `frame.js` (M1): the generated drawer in the planner's frame, on the Decor drawer GLB's pose.

## Tests

`test/parts-drawer/*.test.mjs` are the generator's Node validation scripts under `node --test`: each file is one
script's body wrapped in a `test()`, less the script's own engine and asset setup, which `test/lib/parts-drawer-env.mjs`
provides (it boots manifold, loads the shells and stamps from their new places, and moves the process into a temp
folder so the scripts' `out/` writes land there). The ports assert what the scripts printed. Not ported:
`t_widths_decor.mjs` (reads Joey's Decor exports on D:), the output writers (`cell_test_prints`, `cover_test_prints`,
`slot_sec`) and the two reports (`cover_snaps`, `slot_material`). `test/fixtures/parts-drawer/` holds the v23 tall
shells the stretch is checked against and the LDO kit list.

`frame.test.mjs` is M1's: the generated empty shell against the planner's Decor drawer GLBs, read from `parts/` like
every other GLB test here.
