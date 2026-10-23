# Hover-hint clips

The workspaces' hover bubbles (js/ui/hint.js) play a clip from here when one exists, and fall back to an inline SVG
scene while it is missing (Joey, 2026-10-13: a short recording like the 3D Printopia one, 10-15 s).

**These were recorded from the app itself by `node tools/hint-clips.mjs`** (headless Chrome driving a workspace with a
drawn cursor, Chrome's screencast for the frames, ffmpeg for the MP4; `node tools/hint-clips.mjs labels-fill` redoes
one clip, `node tools/hint-clips.mjs build` one workspace's; a clip's name is `<workspace>-<key>`). Re-run it after a
change to the panel. A hand-made recording of the same name replaces a generated one;
the Part Picker clip serves the Label Studio checkout beside this repo for the planner's modal (the live Studio refuses a
loopback planner origin), and since 2026-10-20 it shows the modal itself (the tile, Nuts → Hex nut → M3, Add, the label landing in the list), the clip cut between the panel's
framing and the modal's by the recorder's `d.cut(crop)` marks.

Names the hints look for:

| file | hint |
|---|---|
| `labels-type.mp4` | Type a label |
| `labels-file.mp4` | Add from a file |
| `labels-picker.mp4` | Part Picker |
| `labels-fill.mp4` | Fill empty drawers |
| `labels-several.mp4` | Place several |
| `build-place.mp4` | Build · the size tiles (a size, the amber spots, the drawer landing) |
| `build-fill.mp4` | Build · Fill all on the issue card (a red slot filled with a 1W case) |
| `build-sidecovers.mp4` | Build style · Side covers Off / On (the covers wear orange for the clip, so they read) |
| `colors-browse.mp4` | Colors · Browse looks (a card previews on the model, a click opens it, Apply) |
| `colors-surprise.mp4` | Colors · Surprise me (three looks, More like this, Use this look) |
| `colors-simplify.mp4` | Colors · Simplify… (Down to 3 filaments, the change list, Apply) |
| `parts-track.mp4` | Parts · Track my build (the counters per row, the dock's progress bar) |
| `assemble-camera.mp4` | Assemble · the camera button (an orbit lights it, pressing it returns the guided view) |

The clip: 10-15 s, no audio (the bubble plays muted and loops), H.264 MP4, about 480 x 220 px (the bubble shows it at
248 x 114 with `object-fit: cover`, so keep the action in the middle), under about 800 KB each. Loaded only on the first
hover of that control (`preload="none"`), so a clip costs nothing until someone looks. The 2026-10-23 clips (Build,
Colors, Parts, Assemble) are recorded at 1280 x 800, the one-row desktop layout, and framed two ways: a 700 x 321 window
at the Labels clips' scale for a panel and the model's near side, or a 960 x 440 window at half scale where a panel and
the whole model must both read (the gallery, Surprise me, the parts list with the dock). The Assemble clip is the
heaviest (the whole frame moves while the camera orbits and returns), at crf 30 and the fast render tier.
