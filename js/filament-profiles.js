/* =========================================================================
   FILAMENT PROFILES — the authored per-label finish, two scalars deep
   =========================================================================
   ⚠ THIS FILE IS THE SOURCE NOW. Its one row was tuned by eye on the Filament
   Material Lab's staging page (profiles/fl-ref-1--printed-solid-mystery-orange.json,
   in the Lab's archive at the tag retired-2026-11). The Lab was retired on
   2026-11-01, so a change goes here, and test/filament-profiles-vendor.test.mjs's
   pin moves with it in the same commit: the pin is how an intended change is seen.
   A filament lands in FILAMENT_DB first, always, so its label is the key here.

   ⚠ A PROFILE FIRES UNDER A LABEL ONLY. In the viewer a filament label exists
   only where the user has assigned a custom palette. In instruction-colours
   mode — the default — and in the ?part= embed there is no label, no profile
   resolves, and the part renders the base finish plus layer detail. That is a
   decision taken 2026-09-07, not an omission.

   ⚠ IT IMPORTS NOTHING. Plain data, loadable in a browser and in plain node,
   which is what lets part-material.js stay testable in either.
   ========================================================================= */

/**
 * Per-filament-label finish overrides, keyed by the label `FILAMENT_DB` owns.
 *
 * @type {Readonly<Record<string, { roughness: number, metalness: number }>>}
 */
export const FILAMENT_PROFILES = Object.freeze({
  /* fl-ref-1--printed-solid-mystery-orange.json — authored on fl-ref-1 */
  "Printed Solid Mystery Orange": Object.freeze({ roughness: 0.34, metalness: 0 }),
});

/** How many labels carry a profile. Zero is a legitimate state and says so. */
export const FILAMENT_PROFILE_COUNT = 1;
