# The label palette (design note, 2026-10-28)

Joey, looking at the label sheets of 2026-10-28 (`D:\Claude - Output\label-variants-2026-10-28`): a stripe's colour is a
*suggestion*. People print Metric in whatever blue spool they own, and across builds they keep one set of label spools.
Sol (thread 01a1825f) rejected a live per-browser map: shared links would drift, and a remap would recolour old builds.
Sol proposed per-person defaults that seed per-build assignments. Astra kept that and made it simpler, with no setup
required. Joey settled it on 2026-10-28 (his words, with Astra's refinement):

- Everyone starts with a ready-made label palette and needs no setup.
- An optional "Use my filaments" lets a person pick their own spools for each meaning.
- "Use these as my defaults for new builds" saves a per-browser default.
- The palette is saved with the build. Changing the defaults never silently recolours a finished build; the planner may
  offer to update the open one.
- A recipient of a shared link sees the sender's palette and may choose their own substitutes.
- The planner warns gently, and never blocks, when two meanings share a spool or look too alike, or when a stripe or patch
  is hard to see on the label body. These checks are computed, not guessed.
- The Parts filament list names the chosen spool by identity, not by matching hexes.

Out of scope: how to fix the white stainless patch on a white body (outline it, or make it optional). Joey has not decided.
The palette only *warns* about it. Also out of scope: Classic Pro stripes (another session) and the vendored `js/vendor` label files.

## 1. What a meaning is, and what stays the same

A stripe slot is stored on the label as the Label Studio stores it: `colours.band = { colour, hex, label, pattern }`, where
`colour` is the scheme key (`sky-blue`, `red`, `yellow`, `white`, `green`, `purple`). **That stored value does not change.**
The editor's Stripe row still writes `stripeFor(key)`, the Studio's own hex included. The Label Studio is another origin and
cannot read the planner's palette. A label it round-trips keeps the semantic colour it always had, and the Studio draws it in
its own scheme colours. The Part Picker's items carry the same keys: a band of `sky-blue` (Metric) or `red` (SAE), and an
accent of `white` (stainless) or `green` (zinc-plated). `purple` (black oxide) is the other accent in the Studio's menu.

**A meaning is the scheme key.** The palette maps each meaning to the spool the build prints it in. A colour key that is not
one of the six (a Studio colour the planner does not offer) has no meaning. It is drawn in its own hex, as today, and it is
listed as a bare colour.

## 2. The build record: `labelPalette`

A new record field, in the style of `plateParts` (2026-10-26):

```
labelPalette: { v: 1, spools: { "sky-blue": { name: "Polar Light Blue", hex: "#14ADDB" }, ... } }   // or null
```

- **The identity is `name`, the catalog's `label`.** `filament-db.js` says this label is unique and is the key that
  `customColors` stores. The `hex` rides along, so a spool that later leaves the catalog still draws (as `customColors`
  draws). The buy link is NOT stored: a record is outside data, so the link is looked up in the catalog by name, and a name
  the catalog lacks has no link.
- **Cleaned like `plateParts`** (`cleanLabelPalette`, js/rules/schema.js). `v` must be exactly 1, or the whole field reads as
  `null`. Only the six keys survive. A name must be a string of at most 80 characters and a hex must
  be `#rrggbb`; anything else is dropped. A slot that is missing falls back to the suggested spool for its meaning. The field
  is always written (`null` when there are no spools), so a record without it never keeps the previous build's palette.
- **`null`, or absent, means the built-in suggested palette, version 1** (§3). The v1 table is a literal in
  `js/label-palette.js`, not computed at runtime. This covers every record from before the
  field existed, and every share link. A unit test re-runs the rule on the catalog and fails on drift. It never regenerates the table.
  If the suggestions ever change, the new set is v2, and a record without the field still reads as v1. So after
  this change an old build never recolours by itself. The change itself recolours, once, the few builds that
  already carry a stripe (§3).
- **The stage learns it through one path.** `app.js` subscribes to the store and hands `labelPalette` to
  `stage.setLabelPalette` on every notification where it differs from the stage's copy: edits, undo and redo, loads. The
  stage repaints (`applyPalette`) and never regenerates. The stage keeps its own copy instead of reading `build`, so no
  record swap path (update, setLabels, the kit boot) can leave it stale.
- It lives in the record, so it rides in `#build=` (share links, the address bar, Recent builds, undo). A recipient sees the
  sender's spools. Any swap the recipient makes is an edit to their copy, as any other record edit is.

### Label body and label text are NOT in the field

The body and the text are already per-build filament picks: the Colors palette's `Label` and `Label:TEXT`. Every workspace
boots with the first preset's picks (Panchroma Cold White and Elegoo PLA Black) unless the build has a palette of its own.
Copying them into `labelPalette` would create a second source of truth, and the presets, Surprise me, Simplify and the
per-unit layer all write to the first one. So the label palette panel **shows** the body and text rows and **edits** them
through the Colors palette (`stage.setColor`, the same call the Colors picker makes, as one undo step). The cost: the body and
text travel with a share link only the way every other colour does, through the Colors workspace's `#scheme=` share. That is
not a new gap. It is recorded in §8.

## 3. The suggested palette (v1), computed

**The rule:** the nearest plain PLA in `filament-db.js` by CIEDE2000 to the scheme's hex, computed with `colors/colour.js`
(sRGB to CIELAB D65, CIEDE2000 checked against Sharma's 34 pairs in test/colour.test.mjs) at full precision. A strictly
smaller ΔE wins, so on a tie the colour first in catalog order wins. "Plain PLA" means: the brand line names PLA and not
Silk or Translucent, the colour's own label does not name PETG or TPU, and it has no `translucent` flag.
Plain PLA is used because labels print in PLA. The values come from `js/colors/colour.js` (`dE`) on this catalog, and
`test/label-palette.test.mjs` re-derives them, so a catalog change that moves a nearest spool fails the test. It never
silently moves the suggestion.

| Meaning (key) | Scheme hex | Suggested spool | Spool hex | ΔE00 |
|---|---|---|---|---|
| Metric (`sky-blue`) | #56B4E9 | Polar Light Blue | #14ADDB | 5.6 |
| SAE / inch (`red`) | #D55E00 | Printed Solid Safety Orange | #F04000 | 8.8 |
| Yellow (`yellow`) | #F0E442 | Panchroma Lemon Yellow | #f8e35a | 3.0 |
| White (`white`) | #F4F4F2 | Printed Solid White | #EFEFEA | 1.87 (Panchroma White next, 1.93) |
| Green (`green`) | #009E73 | Polar Seafoam | #00A37A | 1.8 |
| Purple (`purple`) | #CC79A7 | Panchroma Pink | #f0a4c0 | 12.2 |
| Label body | (Colors `Label`) | Panchroma Cold White | #eef1f4 | the first preset's pick |
| Label text | (Colors `Label:TEXT`) | Elegoo PLA Black | #1c1d20 | the first preset's pick |

Two things to note:
- The scheme's "Purple" is Okabe-Ito's *reddish purple*, a pink. Its nearest PLA is named Pink, at 12.2 the weakest match.
  The row reads "Purple · Panchroma Pink". It is the rule's honest answer, and Joey may want a real purple instead.
- Stripes now draw in the spool's hex, not the scheme's hex (for example Metric #14ADDB instead of #56B4E9). This is a
  one-time visual change, and only for builds that already have stripes. Typed-label and part-label stripes have existed in
  the planner since 2026-10-27, so very few builds carry one.

## 4. Per-browser defaults: `gen2-label-palette`

The key sits beside `gen2-owned`: `{ v: 1, spools: { <six keys>: {name, hex} }, body: {name, hex}, text: {name, hex} }`. A
new module, `js/state/label-palette.js`, owns it. Every storage access is inside a `try`, as in `owned.js`, and a storage
failure reads as "no defaults".

- **"Use these as my defaults for new builds"** writes the open build's six spools, body and text.
- **New builds.** A fresh build (`?new` / setup) gets the defaults written into its record. The defaults' body and text go
  through `setColor` once the first preset has applied, before the store captures its baseline. Nothing else is seeded. A
  build opened from a link, a file, Recent or a kit is not fresh, and keeps what it has.
- **The offer, never a silent change.** When defaults exist and differ from the open build's palette, the panel shows one line,
  "Your default label filaments differ · Use them here". The button touches this build only, and it is one undo step: the
  store is flushed before and after, the body and text are set on the Colors palette, and then the record is committed, so
  one history entry holds both the record (`b`) and the Colors palette (`x`).
- **"Use the suggested filaments"** sets the record back to `null` (the v1 suggestions) and leaves the body and text alone.

## 5. Drawing: the stripe zone carries the meaning

Today a stripe piece's zone is `STRIPE#<hex>`, and `activeHex` reads the colour straight off the key. That is the "never a
filament pick" rule this note replaces.

- `label-text.js` pieces also report the slot's `colour` key, a one-field addition to `stripePieces` and `stripePieces2d`.
  The vendored files are not touched; their cleaned slot already carries `colour`.
- `main.js placeLabelPieces`: a piece whose key is one of the six gets the zone `STRIPE@<key>`, for example
  `Label:STRIPE@sky-blue`. Any other piece keeps `STRIPE#<hex>`. `label-look.js` gains `stripeMeaningOfKey`, and
  `isStripeZone` accepts both forms.
- `activeHex('Label:STRIPE@sky-blue')` is the build's spool hex for that meaning (§2, falling back to v1). `activeLabel`
  returns the spool's name, so a filament with a profile also lends the stripe its finish. Bought-hardware locks do not apply.
- **A palette change is a recolour, not a rebuild.** The zone does not change, so `applyPalette()` repaints the material.
  Only geometry goes through `labelLooksKey`.
- `lookMaterialFor` (the look cards) and the instruction-colours mode: a stripe shows its spool in every mode. It is the
  label's own colour, as it always was, and this build simply prints it in a known spool. So `useCustom` does not gate it.
- The 2D previews (`label-preview.js`) take an optional `stripeHex(key)`. The Labels panel passes the build's palette, so the
  panel's small labels and the 3D labels agree.

## 6. Lists: identity, not hex

`filamentsInBuild`: a `STRIPE@key` region wears its spool, `wear({ name, hex, url }, key)`, with the url from the catalog by
name. It therefore merges with any other part printed in the same spool *by name*. For example, a Printed Solid White stripe and a
Printed Solid White faceplate are one line. A `STRIPE#hex` region (no meaning) stays bare, as today. The Colors shopping
list then shows "Printed Solid White · Label stripe (White)". The Parts list's Label row adds its stripe spools as a zone, "stripe
Metric: Polar Light Blue", through the same regions code.

The count follows: a build with Metric and SAE stripes on Panchroma presets counts two more filaments than one without them,
which is the real number of spools.

## 7. The panel and the warnings

**Where it lives:** the Labels workspace, as a "Label colours" section in its sheet, under the label list. EdgeLabel only, as
the Stripe row is (Classic Pro prints no stripe yet; the other session owns that).

- **The default state is compact.** Astra's wording sits on top: "Use the colours you have. These are suggested filament
  matches. Similar colours from other brands work too—keep your colour coding consistent and easy to tell apart." Then eight
  rows (swatch, meaning, spool name). Nothing needs choosing.
- **"Use my filaments"** opens the rows for editing. Each row opens a picker over the catalog, owned spools first (the
  `gen2-owned` list, when it is set) and then the rest ranked by ΔE to the meaning's scheme colour. Each pick is one undo step
  (a store commit for a stripe, `setColor` for the body and text).
- **The Stripe row** in the label editor keeps its six buttons and stored values, swatched in the build's spool hex, with
  titles such as "Metric · Polar Light Blue".

**Warnings, computed with `colors/colour.js`, gentle (a one-line note under the row, never a block).** The body and text
are the build-wide colours the stage shows (`activeHex('Label')`, `activeHex('Label:TEXT')`). A drawer's own pick for its
label is not checked, and the panel says nothing about it. Every comparison is strict (`<`).

| Check | Measure | Threshold | Why this threshold |
|---|---|---|---|
| Two meanings, one spool | same `name` | - | identity, not hex |
| Two meanings look alike | ΔE00 between the spool hexes | < 15 | the v1 set’s closest pair is Yellow/White, ΔE 25.5; the scheme's own closest is 27.9. 15 flags a real collision (two blues, Panchroma Aqua Blue and Polar Light Blue, are 8.9 apart) and not the deliberate set |
| A stripe or patch is hard to see on the body | ΔE00 between the spool and the body | < 10 | White on Cold White: the scheme's #F4F4F2 is 2.8, the v1 spool 4.1 (the measured invisible patch); every other v1 meaning is 25 or more |
| Text is hard to read on the body | WCAG contrast ratio | < 3 | a heuristic floor, not a WCAG pass (3 is WCAG's large-text minimum); the v1 text on the body is 14.9 |

The White-on-body warning shows on the default palette. That is true, and it is the measured finding. How to fix it is
Joey's open call (§ out of scope). The warnings cover all six meanings, not only those the build uses: the palette is a
set, and it is usually chosen before the labels.

## 8. Known gaps and risks

- **Body and text do not ride in `#build=`** (§2). This is the same as every Colors pick. Folding the Colors palette into the
  record is a larger, separate decision.
- **The scheme hex and the spool hex differ in the Label Studio.** The Studio still draws the scheme colours, so the planner
  and the Studio disagree on the shade, though they agree on the meaning. This is by design until the Studio reads a palette.
- **Old builds' stripes shift** from the scheme hex to the v1 spool hex, once (§3).
- **Stale tab.** The defaults key is read at panel render, and the record is the build's own. Two tabs can only disagree about
  the *offer* line, never about a build's colours.

## 9. The review (Sol, thread 01a1827b, 2026-10-28: approve with changes)

Confirmed, and folded in above:
1. Body and text do not travel in `#build=` (§8). This is kept as a gap and is Joey's call: the fix is to fold the Colors
   palette into the record, which is larger than this feature. Until then a recipient sees the first preset's body and
   text, the same for everyone.
2. The wording: this change does recolour the existing striped builds, once (§2, §3).
3. The stage sync path (§2).
4. Every stripe-special path must know `STRIPE@`: `activeHex`, `activeLabel`, `lookMaterialFor`, `filamentsInBuild`,
   `isStripeZone` (`keysInBuild`, `partInfo`, the chip list). This is listed in §5.
6. `v` must be 1, and the field is always written.
7. "Use them here" is one history entry (§4).
8. Warnings read the build-wide body and text the stage shows (§7).
10. The v1 table is a literal, and the test only flags drift (§2, §3).
11. The thresholds are strict, the contrast check is described as a heuristic, and the tests are widened (§10).

Discarded, with reasons:
5. Same name, different hex: only a hand-made link can split a spool's name from its hex, and the result is one listing
   line with the first hex. That is a quirk in the list, not a wrong render.
9. The hidden GLB body mesh of a striped label: its zone is `''` (key `Label`), the same key the base piece wears, so it
   adds nothing to the count. Merging a bare hex into a picked spool's hex is existing behaviour, outside this feature.

## 10. Tests

- **Unit**, `test/label-palette.test.mjs`: the v1 table re-derived from the catalog by the rule, record cleaning
  (`cleanLabelPalette`: the six keys, name and hex checks, null, junk), spool resolution with the v1 fallback, `defaults`
  read and write inside a try (a throwing storage), the warnings at and around each threshold, and a `STRIPE@` key's meaning
  and hex. The schema's round-trip test covers the field, along with a partial palette, an unsupported `v`, a
  hand-made non-catalog name (drawn, with no link), and an unknown Studio colour key (stays `STRIPE#hex`).
- **E2E:** (1) a build with a Metric stripe draws its piece in the v1 spool hex, a palette swap recolours it with no
  rebuild, the record carries the swap, and a reload of the address keeps it. (2) A shared link with a palette opens in a
  fresh context with *other* defaults saved, and shows the sender's spools plus the offer line. (3) The Colors shopping list
  names the stripe's spool. (4) A White stripe on the default body shows the warning, and no swap is blocked. (5) Undo and redo of a
  palette swap recolour the stripe.
