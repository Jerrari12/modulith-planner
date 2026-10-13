# Hover-hint clips

The Labels workspace's hover bubbles (js/ui/hint.js) play a clip from here when one exists, and fall back to their
inline SVG scene while it is missing (Joey, 2026-10-13: a short recording like the 3D Printopia one, 10-15 s; the SVG
scenes are placeholders until then).

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
