# The Label Studio inside the planner: the plan

Drafted 2026-10-13 from Joey's brief ("keep them all under the same app"), Astra's refinements and a design consultation
(Sol 01a13827). Nothing here is built yet; this is the contract to build against.

## What Joey asked for, as Astra refined it

1. **The Part Picker as a modal** in the planner: nearly full screen with a small border so it still reads as the planner,
   one clear "Add N labels" action, back in the planner with those labels selected in the list, the picker's choices kept
   when it is reopened.
2. **The Labels workspace gets two views**: **Label plate** (content, dimensions, appearance, print layout: the Studio's
   work) and **On build** (the same labels on the drawers, placement: today's Labels panel). The selected label survives
   the switch. Creating a label and assigning it to a drawer stay separate actions.
3. **One application**: one navigation bar, consistent controls, no second Studio header. An iframe may be the first
   implementation, but it must not dictate the interface.
4. **One list needs one owner**: stable ids and a defined behaviour for edit, delete, undo and reconnect, or labels get
   lost or doubled.

## What the code says today (verified 2026-10-13)

- The Part Picker's embed contract is same-origin only: it believes it is embedded when its parent is the Studio site,
  posts its labels to its own origin, and reads replies only from there. A planner iframe receives nothing without a
  Picker change. The Picker lives in its own repo and is published into the Studio's `parts/` (SOURCE.json pins the commit).
- The planner imports Part Picker items already (from a `#labels-add=` link and from files) and has no message listener.
- The Studio and the planner have a two-way "job" protocol (label-link.js) built for a TAB: the Studio talks only to the
  window that opened it, with the planner origins allowlisted (a GitHub Pages origin refused on purpose, a loopback rule
  for local work). The planner side of it lives in the old planner (label-return.js) and is not ported yet.
- The label-list format is shared (ids, the reconcile rules), so a list travels between the two without translation.
- Cross-origin embedding works in production only once `planner.modulith.systems` resolves; locally through the loopback rule.

## The architecture

**Not a port.** The Studio's engine (plate layout, exports) stays in the Studio; duplicating it would split a codebase
that is still moving.

**Step A, the Part Picker modal.** The Picker gains a planner embed mode. The planner opens it in a glass veil with an
iframe made once per page and hidden between openings (so its choices persist), and starts with a **hello**: the Picker
accepts a hello only from its parent window and only from an origin on its allowlist (exact match; loopback only when the
Picker itself is served from loopback), records that origin and a session token, and from then on posts to that origin
and reads replies from it. The referrer is a hint at most, never the authority. The planner accepts messages only from
its own iframe's window at the Studio's fixed origin, checks the version, the schema and the session, bounds and
validates the items, and acknowledges `added` only after the store commit succeeded; a failed import keeps the modal open
and says why. The target build is captured when the modal opens, so a build switched underneath cannot receive another
project's labels. On return the labels actually imported (by id) are selected and scrolled to.

**Step B, Label plate / On build.** The Studio gains a real embedded mode: it accepts its parent window as the linked
planner, drops its header, takes the planner's theme and conventions. The transport is the existing job protocol; the
planner stays the owner. Sol's rule: this is **checkout and reviewed commit, not two-way sync**:

| state | what each side holds | the one rule |
|---|---|---|
| committed | the planner: `{ buildId, list, assignments, revision }` | every committed change, undo and redo included, gets a new, increasing revision |
| editing | the Studio: `{ jobId, buildId, baseRev, baseList, draft }` | edits and the Studio's undo touch only the draft until an explicit, reviewed return |
| dirty draft vs a newer planner state | the planner changed while the Studio edits | never overwrite either side; review against the current planner state with the base snapshot telling the sides' changes apart |
| review pending | the planner changed again after the review opened | re-check the revision at commit; changed means the review is void and is recomputed |
| deletion | a complete-list return omits an assigned label | the review shows the assignment loss; an accepted deletion removes label and assignments in one step, and one undo restores both; absence means deletion only for a complete-list return, never for an import |
| disconnected or reloaded | an iframe or page reload mid-edit | recover a draft scoped to build + job + baseRev, then reconcile against the current planner data; never substitute the Studio's standalone saved list |
| standalone Studio vs embedded job | both autosave | the embedded draft lives in its own storage namespace and can neither overwrite nor silently become the standalone list |
| duplicate return or a retry | the same return twice | a commit-request id produces one undo step; later deliveries get the recorded result |
| wrong build or expired job | a late return after switching projects | it is bound to its build and job; it never applies to whatever build happens to be open |

Toggling Label plate / On build preserves the draft (neither commits nor discards); a planner change meanwhile marks it
stale; discard resets it from the committed state. "Draft saved" and "Applied to project" are different words on screen.
Selection is UI state: a selected id survives while it exists, else the selection clears on purpose.

**The smallest B that proves the interface** before any edit crosses the boundary: the two views, an embedded headerless
themed Studio plate PREVIEW fed a planner snapshot and the selected id, read-only, the iframe kept across the toggle. The
smallest editable B needs the job identity, the revision check, explicit Apply and Discard, the isolated draft storage
and one transactional commit; it may refuse a stale return outright before any merge review exists.

**Host commands independent of the transport.** The planner talks to the embedded Studio through a small set of named
commands and events (open with snapshot, select id, apply, discard, stale) so a deeper integration later does not redesign
the product. What an iframe cannot do, and must be worked around by message: share focus and tab order, let the Studio's
menus escape its frame, route keyboard shortcuts and undo to one owner.

## Step B1, the Label plate read-only: what was built (2026-10-14; design reviewed by Sol 01a139ee, 7 of 9 held)

**The transport is NOT the tab job protocol - a recorded deviation.** The plan above says "the transport is the existing
job protocol". The job protocol (label-link.js) is keyed by DRAWER (`rows[].u`), bound to a tab's `window.opener`, and
carries a job in the URL hash; the plate shows the whole LIST by label id inside a frame whose parent is the planner. So B1
uses the Part Picker modal's channel (step A): the planner's hello with a session, the Studio's `ready` naming its
capabilities, then named commands (the plan's "host commands independent of the transport"). The job protocol's RULES
(the return, the merge, the review) are what the editable B reuses over this channel; the transport is settled here.

- **Planner** (`js/rules/plate.js`, pure; the page half in `js/workspaces/labels.js`): the Labels panel gets a view pill,
  `On build | Label plate`; the plate is one iframe of `STUDIO/?embed=planner` in a glass frame over the stage, made on the
  first switch and hidden on the way back (fonts, WebGL and printer prefs persist); the dock's Print labels shows it. The
  channel: `hello { session }` → `ready { caps }` (the planner needs `snapshot/1` and `select/1`, and says what an older
  Studio lacks); `snapshot { buildId, rev, type, doc, drawers, selected }` after every LABEL-RELEVANT change (the list, the
  assignments, the label style, the faceplate, the build; a cabinet move is not one), debounced 150 ms and deduplicated by
  a signature of those; `select { id }`; and back, `selected { id, rev, buildId }`, honoured only for this build at this
  rev. `rev` is a workspace counter (+1 per label-relevant change, undo and redo included; not persisted: B1 is a preview).
  Over the bounds (400 labels, 256 KiB) the snapshot carries `doc: null` and a reason, so the Studio clears the plate and
  disables Download rather than keep a stale plate printable. The selection is one workspace field, set by arming a label,
  selecting a labelled drawer, or a row clicked in the Studio; cleared when its label leaves the list.
- **Studio** (`plate-link.js`, pure; the page half in index.html; `label-list.js` now loaded by the page): `?embed=planner`
  in a frame; an inline head script hides the chrome before first paint (the masthead, the link bar, Add label, Add labels
  from, Save / Open, the footer); the type select and the six label settings are disabled mirrors of the snapshot; rows are
  read-only (text readOnly, buttons disabled, remove and bulk hidden), tagged `data-label-id` and `#n` per drawer; the
  printer section and Download stay live. After the hello every message is read from the bound window at the bound origin
  with the bound session (Sol). Storage isolation: `EMBED` short-circuits autosave, the restore, the previous set and the
  boot. A snapshot for another build replaces everything with no prompt. **Correction (2026-10-15, the stress test's
  S-F6):** the printer settings do NOT persist in the plate. They live inside the standalone autosave, which EMBED skips,
  so the plate's printer resets on every planner reload. The fix, storing them on their own in the embed, is still to do.
- **Proved** by unit tests on both sides, an e2e case driving the real Studio from the checkout beside the repo, and the
  browser pane on loopback (desktop and phone).
- **Found on the way**: the Studio page already had a `postToPlanner` (the tab link's, to the opener); a same-named embed
  sender was hoisted over by it and the `ready` went to a null opener. The embed sends through `plateSend`, and a test pins
  every embed function to one declaration.
- **The print preference** (added the same day, DECISIONS.md "the stripe on part labels"): the stripe position (or Off) and
  the screw-and-nut drawings are the PRINTER's choice, kept per browser by the planner (never the record), shown under
  Label settings and live on the plate; the snapshot carries them in the document's `output` bag (`hw-band`, `hw-profile`)
  and the plate's inputs send a `setting { id, value, rev, buildId }` back (capability `setting/1`). A plate-originated
  change keeps the rev (the Studio already holds that state) and echoes no snapshot. This is the one thing the read-only
  plate edits, and it is not label content.
- **Recorded gaps**: the Studio is dark only, so a light planner shows a dark plate (the plan's "takes the planner's theme"
  is not met in B1); stripes made in the standalone Studio are not in the shared list format, so none show on the plate
  (none are lost either); the 3D plate does not highlight the selected label, only its row; the stage keeps rendering
  under the frame.
- **The batch id in the Picker's replies** (the Part Picker flow refine, Sol 01a13c5f via the Refiner session; Astra,
  relayed by Joey, 2026-10-14: a late reply credited to a later send "could falsely tell someone their latest labels were
  added", not cosmetic): the Picker mints a `batch` id (8 to 64 of `[A-Za-z0-9_-]`) on each `add`; the planner's modal and
  the Studio's sheet echo it verbatim on `added` and `refused`; the Picker credits a reply to its pending send only when
  the ids match and ignores any other. An older Picker sends none and gets none. Done on all three sides the same day;
  the planner and the Studio echo first, the Picker ships after them.
- **The seam the editable B builds on** (Sol): the Studio's snapshot handler is "apply the committed state"; the editable
  step adds a draft layer over it (jobId, baseRev, draft storage, Apply, Discard, stale) and must gate this handler, and a
  build switch, so a draft is never erased by a planner update. The revision must then become build-scoped and survive a
  reload, checked together with buildId and jobId; B1's counter is the preview's only.

## The parts channel's additions (2026-10-15): the build on the hello, and `open/1`

These come from the stress test of the whole label flow (`D:\Claude - Output\label-flow-stress-2026-10-15\FINDINGS.md`,
P-F8 and P-F9). Both are additive: an older Picker or an older planner tab ignores them.

- **The build on the hello.** P-F9: the Picker's list followed the visitor from build to build. On a new build, "Add all
  31 to the planner" offered the first build's parts.
  - The planner's `hello` gains `buildId`: the target build's id, captured when the modal opens. It is the record's own id,
    `/^[a-z0-9]{8,32}$/`.
  - In planner mode the Picker keys its "sent" marks by it, and words the batch action "Add all N to this build".
  - A missing or malformed `buildId` (an older planner tab) means no per-build marks. It is never a refusal.
  - An older Picker is unaffected: its hello check reads only `gen2parts`, `v` and `session` (`js/embed.js` readHello).
- **`open/1`: Edit part details opens that part.** P-F8: it opened the Picker at its last stage instead.
  - **The capability.** The Picker's `ready` gains `caps`, and a Picker that can open a part lists `'open/1'`. The planner
    sends `open` only to a Picker whose `ready` offered it. With an older Picker, Edit part details opens the Picker as
    before.
  - **Planner → Picker, after `ready`:** `{ gen2parts: 'open', v: 1, session, req, id, item }`.
    - `req` is a request id minted per `open`, 8 to 64 of `[A-Za-z0-9_-]` like `batch`, and echoed on the answer.
    - `id` is the part label's `hardware.id`: the Picker's record id, the key the planner already updates in place by.
    - `item` is the label item the planner stores for that label, in the shape the Picker sent in `add`. It lets a browser
      whose Picker list lacks the row still open it. It is one item, bounded as an `add` item is.
    - `id` must equal `item.id`, and both must be valid record ids. Otherwise the Picker refuses.
  - **What the Picker does:**
    - **It never discards work and never sends unrelated parts.** While it is editing another row with unsaved changes,
      or holds parts pending ("Pick more first"), it changes nothing. It refuses with words the planner can show, e.g.
      "The Part Picker has 3 parts pending: add or clear them first."
    - Otherwise it opens the row with that id in Edit.
    - **When its list lacks that row, it REFUSES.** The words: "This part label was made in another browser, so the Part
      Picker here has no details to edit. Add the part again from here, or edit it in the browser that made it." This is
      amended from the first text, which imported `item`: a label item carries PRINT text (fields, attribute texts, pins),
      not the part's field values. A record rebuilt from it would guess the values, and the edit sent back would
      overwrite the label with the guesses (the Picker side, flow-refine 50d298de; Sol 01a13fdf agreed). `item` still
      rides along: `id` must equal `item.id`, and the item must pass the add check.
    - **The refusal order** (nothing is touched before every check passes): a malformed id or item; parts pending; an
      add still waiting for its reply; unsaved changes to another row; the row not in this browser's list. A row with no
      changes is switched away from; a draft in progress is kept, as the Edit button keeps it.
    - It answers `{ gen2parts: 'opened', v: 1, session, req, id }`, or
      `{ gen2parts: 'refused', v: 1, session, req, id, reason }`, where `reason` is the words to show.
    - **The latest request wins.** A new `open` supersedes any outstanding one, and the Picker drops the work of a
      superseded request unanswered. An `open` that arrives before the Picker's list has loaded waits for it.
    - **A new session rebinds.** A hello with a NEW session from the bound origin rebinds the Picker. It voids every
      outstanding `open`, retires an add still waiting for its old-session reply (the bar offers Try again), loads that
      build's sent marks, and re-checks the pending parts. The same session again is answered with `ready` again, so a
      lost `ready` is recoverable. A hello from another origin after the bind is ignored.
  - **Later, `open/2`, editing across browsers:** `add` items would gain `record`, the part record minus its photo and
    bounded. The planner would store it on the label, and the Picker would import it with importDoc's validation, keeping
    the id. This needs a new stored key on the planner's side, so it is a planner decision, not part of `open/1`.
  - **What the planner does:**
    - It ignores an answer whose `req` is not the latest it sent.
    - On a refusal it shows the reason in its status line and leaves the Picker open.
    - The edit comes back through the existing `add`, where the same id updates the label in place as one undo step.
  - **Telling the replies apart:** this `refused` comes FROM the Picker and carries `req`. The planner's `refused` to an
    `add` comes TO the Picker and carries `batch`.
  - **The rules:** the channel's rules hold unchanged. The hello is bound to the parent window, the origin must be on the
    allowlist, every message carries the session, and every reply is read from the bound window at the bound origin.
- **Pending parts belong to their build.** A pending batch belongs to the `buildId` and the session it was staged under.
  It is released by a hello for another build, or by a hello without a `buildId` after one that had one. Released parts
  go back to the Picker's list unsent, and the bar's line says so. A build never receives parts staged for another.
- **`close`: Escape inside the frame.** The stress test's P-F4: a key pressed inside the frame never reaches the planner's
  page, so Escape there could not close the dialog.
  - Picker → planner: `{ gen2parts: 'close', v: 1, session }`. The Picker sends it when Escape has nothing of its own to
    close: no open box or menu, and no custom-value field.
  - The planner closes the dialog exactly as its own Escape does, so focus goes back to the opener. It ignores a `close`
    without the session.
  - The planner side is in place and inert until the Picker sends it.
- **Deploy order:** either side may go first. The capability keeps `open` inert until the Picker offers it, and `buildId`
  is ignored until the Picker reads it.
- **Owners:** the Picker side belongs to the Label Studio Refiner session, on the Picker repo's `flow-refine`. The planner
  side belongs to the planner session.

## Astra's adjustments (2026-10-13, approving step A)

- **Safeguards behind the scenes.** "Reviewed commit" means an **Apply changes** button; a review screen appears only when
  something needs a decision (a label deleted while assigned to a drawer, edits applied after the underlying labels
  changed). Otherwise the integration would feel heavier than the two apps.
- **Picker additions are a simple operation**: select parts, Add labels, the labels appear in the planner. No draft
  workflow for the Picker; what stays necessary is the right destination build and no duplicate additions.
- **The two views are continuous**: both show the current draft, so edits can be inspected on the build before applying;
  if the build ever shows only saved labels, that must be obvious on screen.
- **Conflict detection tracks label-relevant changes**, not the project revision as a whole: moving a cabinet must not
  invalidate a draft that only changed label text. The revision stays the commit check; the conflict test compares the
  label list and the assignments.
- **The handshake checks both the origin and the expected sending window.**
- **Step A is complete when**: the labels land in the build that was open when the modal opened, a part already in the
  list is updated rather than added again, part details and icons survive the trip, and one undo takes the addition back.
  Not merely when the modal opens.

## Risks named, to be designed around

- payload checks beyond the envelope: ids, counts, text bounds, safe rendering;
- field loss: a returned list must keep `hardware` and `part` records (round-trip tests);
- icons that live only in Studio storage: transferred and persisted before a reference is committed;
- version skew between a cached planner and a new Studio: capabilities negotiated, a mismatch fails visibly;
- the Studio's response headers must permit framing by the planner's origin;
- a kept iframe holds the previous build's session: rebound explicitly on a build switch;
- undo scope: Ctrl+Z in the Studio edits the draft, in the planner the project, and the screen says which.

## Status

- **Step A built** (2026-10-13): the planner side on `main`, the Picker's embed mode in its repo (89db3532) and republished into
  the Studio on branch `planner-picker` (95efefdf). Proven locally end to end (DECISIONS.md, the same date).
- **Step A in production** (2026-10-14): the Studio deployed (public main 6426fc80), the Picker repo at 12752df0 on its
  remote `Jerrari12/gen2-part-picker` (private), `planner.modulith.systems` live. The live check passed: add, reopen,
  update in place, three undos, another build (DECISIONS.md, 2026-10-14).
- **Step B1 in production** (2026-10-14): the read-only Label plate view (the section above), the Studio deployed (public
  main a781fd5e) and the planner's main at 279c6bd; the live check passed (DECISIONS.md). Next: the editable B.

## Order

A first, with the handshake and the transactional import. Then the read-only B to prove the views and the selection
contract. Then editing under the draft-and-commit contract above. Each step on its own branch in both repos, the Picker
republished into the Studio, the Studio deployed with Joey's go, the domain in place before the production test.
