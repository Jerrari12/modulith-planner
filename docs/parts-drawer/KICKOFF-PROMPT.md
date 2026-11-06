# Kickoff prompt: parts drawer into the planner (2026-11-04)

Paste everything below the line into a new Claude Code session opened in the modulith-planner repo.

---

We're adding the parts drawer generator to the MODULITH planner. Work in this repo on a new branch, `parts-drawer`, off main. Don't push or open a PR without asking me.

Read first, in this order:

1. `D:\Claude - Output\parts-drawer-generator\SPEC.md`. Start at "Planner integration: the next session (2026-11-04)", then read "Planner integration (agreed 2026-10-22)", "Layout data model (v2)" and "Numerical rules that must survive the rewrite". Skim the rest when you need it.
2. In this repo: `docs/redesign/MODULITH-planner-style.md`, `docs/redesign/STAGE-API.md` and the recent entries in `docs/redesign/DECISIONS.md`.

The generator is in `D:\Claude - Output\parts-drawer-generator\`: `site/` is the prototype page and its modules, `validation/` the tests. The tests also read `D:\Claude - Output\generator-assets\` and `D:\Claude - Output\large-label-test\`. The live prototype is linked at the top of SPEC.md if you want to see how it behaves.

Do M0, M1 and M2 from the spec, in that order. Then stop and show me M2 before starting M3: screenshots in both themes, with and without the edit-mode edges, and how to open it locally.

Rules:

- The planner's style brief and tokens win over the prototype's look.
- Don't change the generator's geometry. If something looks wrong, list it for me.
- With the flag off, the planner must look and behave exactly as it does now: tests, smoke and goldens unchanged.
- Stop and ask if M1's fit is off by more than 0.05 mm, or if the spec contradicts the planner's docs anywhere.
- Run /codex-collab for a review at the end of M1 and again at M2. When we get to the record field and share schema (M3), that's a data-model call: use sol.
- Log decisions in DECISIONS.md in its format.
- The open decisions at the end of the spec section are mine. Bring each to me with your recommendation; don't settle them yourself.
