# Hover-hint clips

The Labels workspace's hover bubbles (js/ui/hint.js) play a clip from here when one exists, and fall back to their
inline SVG scene while it is missing (Joey, 2026-10-13: a short recording like the 3D Printopia one, 10-15 s).

**These six were recorded from the app itself by `node tools/hint-clips.mjs`** (headless Chrome driving the Labels
workspace with a drawn cursor, Chrome's screencast for the frames, ffmpeg for the MP4; `node tools/hint-clips.mjs fill`
redoes one). Re-run it after a change to the panel. A hand-made recording of the same name replaces a generated one;
the Label Studio and Part Picker clips open the live Studio, so they need the network, and the Picker clip shows the
Studio opening rather than the Picker itself (the Studio's `#parts` route did not open it headless) - a hand recording
would improve that one first.

Names the hints look for:

| file | hint |
|---|---|
| `labels-type.mp4` | Type a label |
| `labels-file.mp4` | Add from a file |
| `labels-studio.mp4` | Label Studio |
| `labels-picker.mp4` | Part Picker |
| `labels-fill.mp4` | Fill empty drawers |
| `labels-several.mp4` | Place several |

The clip: 10-15 s, no audio (the bubble plays muted and loops), H.264 MP4, about 480 x 220 px (the bubble shows it at
248 x 114 with `object-fit: cover`, so keep the action in the middle), under about 800 KB each. Loaded only on the first
hover of that control (`preload="none"`), so a clip costs nothing until someone looks.
