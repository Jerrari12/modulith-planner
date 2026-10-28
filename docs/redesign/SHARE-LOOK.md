# A shared build carries its colours (design note, 2026-10-28)

Joey, relaying Astra after the label palette went live (53c2a639): "Users reasonably expect 'Share build' to share what
they see. Carrying the stripe while dropping the label background can change both its appearance and readability." The
requirement, in Astra's words: **opening a shared build in a fresh browser reproduces its colours, including label bodies,
text and stripes, without inheriting the recipient's unrelated preferences.** Existing links keep their documented
fallback, and importing a shared build must not overwrite anyone's personal defaults.

## What is wrong today

A build travels as its RECORD: the address (`#build=`, what Share copies), a Recent entry, the session slot, a downloaded
file. Since this morning the record carries the label palette's six stripe spools. It does NOT carry the Colors palette:
every part pick (case, faceplate, drawer...), the per-unit picks, and the label body and text (`Label`, `Label:TEXT`).
Those live in this browser only, under `gen2-colors:build-<id>` (app.js `colorKeyAtBoot`). The store's history does
snapshot them (`extra`, so Undo restores colours), but `onSave` writes only the record.

So a link, a file, or a Recent entry opened in another browser shows the first preset's colours (app.js: "the first
preset's coordinated filaments unless the visitor already has a saved palette"). The Colors tab's own Share adds
`#scheme=` with the build-wide picks; the top-bar Share and files do not, and neither carries the per-unit layer.

## The change: the record carries its look

- **A new record field `look`** = `{ v: 1, on, colors, over }`: the Colors palette as chosen. `colors` maps a part type or
  zone to `{ name, hex, url? }`; `over` is the per-unit layer `{ <unit id>: { <key>: { name, hex, url? } } }`; `on` is
  whether the chosen colours are shown (false = the instruction colours). Cleaned in schema.js like the stage's own
  `cleanPalette` (a `#rgb`-`#rrggbbaa` hex, an http(s) link or none, no prototype keys), capped in size (an oversized look
  is dropped, as `carryLabelData` drops an oversized label list). `null` when absent. Not shared: "★ My palette" (the
  hand-built palette, a personal convenience), the saved schemes, the owned list and the label defaults - all personal.
- **The store stamps it.** Whenever it saves (pushNow), the store sets `state.look` from the stage before serialising, so
  every place the record goes - the address, Recent, the slot, a file - carries the colours of that moment. The history
  entries keep their `x` (Undo still restores the palette through `extra`), so nothing about Undo changes.
- **The chosen `on`, not the momentary one.** Assemble shows "Part colors" by setting the stage's `useCustom` without saving
  it, and puts it back on leave. The look reads the `on` last persisted (the stage's `chosenOn`, set where the palette is
  saved), so an edit made while Assemble shows Part colors never shares the build with its colours off.
- **The boot applies it.** app.js reads `look` from the raw `#build=` (as `colorKeyAtBoot` reads `buildId`) right after the
  stage is created, before the first-preset fallback: a link with a look shows exactly that look - even "instruction
  colors" (`on: false`), which the fallback would otherwise replace with the preset. It is applied with `setPalette`, which
  cleans it again and persists it under the build's own key.
- **Which wins.** A record's look wins over this browser's saved palette for the same build id: the address is that build's
  latest save, so for the sender's own tab they agree, and for a recipient the link is what they were sent. A record with
  no look (every link and file before this change) keeps today's behaviour exactly: this browser's palette for that id,
  else the first preset.
- **Untouched for the recipient:** their label defaults (`gen2-label-palette`: they seed only a fresh build), their owned
  list, their saved schemes, and "★ My palette" (setPalette keeps `userPalette` when the look has none). A `#scheme=` beside
  the link still applies after the look, as an explicit choice.

## Risks

- **Longer links.** The look adds the palette to the address: a build-wide pick is ~60 bytes, so a fully picked build adds
  about 1-2 KB of base64 (an estimate); a big per-unit layer adds more. The cap bounds it.
- **A build's colours now overwrite a recipient's earlier copy** of the same build id when they open the sender's link again.
  The record already does this for the layout; the colours now behave the same.
- **The stale-tab guard** stops a stale tab persisting anything (the Recent entry, the slot, the palette) while "the address
  still follows the edits" (app.js). The look rides the record, so a stale tab's address carries its own colours, as it
  already carries its own layout; nothing a stale tab cannot persist today is persisted through the look.

## Tests

- Unit: `cleanLook` (good, partial, hostile: a `javascript:` url, a bad hex, `__proto__`, oversized), the schema round trip;
  the store stamps `look` on save from `opts.look`, and Undo still restores the palette.
- E2E: a sender picks a label body, text and a part colour; the address, opened in a FRESH context, shows them (stage
  palette and the label body material); the same link in a context that already has another palette saved for that build
  id and its own label defaults shows the link's look and leaves `gen2-label-palette` as it was; a link without `look`
  still shows the first preset; a save made while Assemble shows Part colors carries `on: true`.

## The review (Sol, thread 01a183be, 2026-10-28: reject, with changes that make it sound)

Folded in; these replace the bullets above where they differ:
1. **The fallback is suppressed by a valid look's presence**, not by `useCustom`: a look with `on: false` stays the
   instruction colours.
2. **One gate for outside data.** app.js decodes the `#build=` once, refuses a too-new record (`buildTooNew`), cleans the
   look with the schema's `cleanLook` (the cap included), and hands that same value to the stage; the store's sanitize
   applies the same cleaner to the record it keeps.
3. **The chosen `on` is the stage's own state, not a side effect of persisting.** The stage's `useCustom` setter (Assemble's
   temporary Part colors, its only caller) remembers the chosen value the first time it changes it and forgets it when it
   is set back; every real palette operation (`setColor`, `setPalette`, `setUseCustom`, a preset, a restore) clears it.
   `stage.look()` returns `{ v: 1, on: <chosen>, colors, over }`.
4. **History uses the chosen look too:** `extra.get()` takes `on` from `stage.look()`, so Undo in Assemble never makes the
   temporary view the build's choice.
5. **Every serialisation stamps it:** the store's `serialize()` sets `state.look` from `opts.look()` first, so the address,
   Undo's own write-back, Share and a file all carry the current look, not the last debounced one.
6. **The cap is generous and stated:** 256 KB of look JSON (a fully picked build is about 1-2 KB; a per-unit pick on 200
   units of 5 regions about 60 KB). Past it, the look keeps its build-wide colours and drops the per-unit layer, never the
   whole look; a test pins it.
8. **The schema cleaner is strict:** a string name of at most 80 characters, a hex of 3, 4, 6 or 8 digits, an http(s) url of
   at most 500 characters, plain objects only, no prototype keys.
9. **sanitize always writes `look`** (null when absent), as it does `labelPalette`.
12. **Tests widened:** `on: false`; a legacy link with a same-id palette saved; per-unit picks and stripes round trip;
   `#scheme=` after the look; Unicode names; malformed and oversized looks; a too-new record; Undo in Assemble; the
   recipient's "★ My palette", saved schemes, owned list and label defaults unchanged.

Discarded, with reasons: 7 (the address write is `btoa(unescape(encodeURIComponent(snap)))`, UTF-8 safe; the payload
abbreviated it); 10 (app.js's stale-tab guard already stops `saveBuild` persisting the Recent entry and the slot for a
stale tab); 11 (the look reaches the page through the same `setPalette` cleaner and the same swatch, title and buy-link
sinks a `#scheme=` link has used since 2026-10-17).
