# Hover-hint clips

The Labels workspace's hover bubbles (js/ui/hint.js) play a clip from here when one exists, and fall back to their
inline SVG scene while it is missing (Joey, 2026-10-13: a short recording like the 3D Printopia one, 10-15 s).

**These six were recorded from the app itself by `node tools/hint-clips.mjs`** (headless Chrome driving the Labels
workspace with a drawn cursor, Chrome's screencast for the frames, ffmpeg for the MP4; `node tools/hint-clips.mjs fill`
redoes one). Re-run it after a change to the panel. A hand-made recording of the same name replaces a generated one;
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

The clip: 10-15 s, no audio (the bubble plays muted and loops), H.264 MP4, about 480 x 220 px (the bubble shows it at
248 x 114 with `object-fit: cover`, so keep the action in the middle), under about 800 KB each. Loaded only on the first
hover of that control (`preload="none"`), so a clip costs nothing until someone looks.
