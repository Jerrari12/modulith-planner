/* =========================================================================
   PART MATERIAL SPEC - what a printed part's surface is made of
   =========================================================================
   SOURCE OF TRUTH: gen2-visual-animator/viewer/js/part-material.js
   CONTRACT VERSION: 1
   ⚠ VENDORED BYTE-FOR-BYTE INTO THE FILAMENT MATERIAL LAB.
   Edit it HERE ONLY, then re-vendor. Both repos gate on byte equality, so a
   divergent copy fails their suites rather than quietly drifting.

   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   The Lab's staging page shows three panes: a reference photograph, its own
   candidate render, and WHAT BUILD STUDIO SHOWS TODAY. That third pane has to
   be the real thing or it is worthless - and the two ways to get it were both
   wrong. An iframe cannot be told which filament to use (part-preview mode
   accepts no incoming messages, by design, and there is no colour parameter).
   A hand-written replica in the Lab would make these numbers double-authored,
   which is exactly the failure `requirement-scope.js` exists to prevent.

   So the numbers move here, once, and both repos read them.

   ⚠ WHAT THIS RETURNS IS A FINISH, NOT A MATERIAL, AND CARRIES NO COLOUR.
   Colour is palette state - `activeHex(key)` here, a vendored catalog lookup in
   the Lab - and it changes constantly while the finish does not. Keeping them
   apart is what lets the Lab render Build Studio's surface in a filament Build
   Studio has never been told about.

   ⚠ AND IT HOLDS NO `THREE` IMPORT. The two repos resolve three differently
   (vendored import map here, npm there), so a shared module that constructed a
   material would have to agree about that too. Each side builds its own from
   the spec; the numbers are what must not differ. It is also why this file is
   testable in plain node on both sides.
   ========================================================================= */

import { FILAMENT_PROFILES } from './filament-profiles.js';
import { finishOfLabel } from './filament-db.js';

/**
 * ⚠ 3 SINCE 2026-10-28, AND THE BUMP IS THE POINT AGAIN. Version 2 answered a part key and a
 * filament label with two scalars. Version 3 can also return `anisotropy` (and `silk`) for a
 * filament of the catalog's silk family — a consumer written against 2 would render a silk label
 * with the silk roughness and metalness but no directional sheen, an isotropic pseudo-metal nobody
 * authored. Both repos pin this constant, so the mismatch is a failing test rather than a picture
 * nobody can explain. A label-free call (the Lab's own pane) returns exactly what it did under 2.
 *
 * (2 since 2026-09-07: version 1 answered a part key with a fixed finish; 2 added the label.)
 */
export const PART_MATERIAL_CONTRACT_VERSION = 3;

/**
 * ⚠ THE AUTHORED SILK APPROXIMATION (2026-10-28) — VISUALLY TUNED IN THE PLANNER'S OWN ROOM AND
 * STUDIO LIGHTING, NOT MEASURED, AND NOT A PROFILE. Joey: silk filaments "still feel way too much
 * like regular filaments ... they almost look the same", because until now a silk differed from a
 * matte filament only by its catalog hex.
 *
 * Why these three numbers and not the Lab's silk lobes: the Lab's tuned silk (c7, two narrow
 * punctual-only GGX lobes) was MEASURED DEAD under this viewer's lights — full strength moved at
 * most 1 code of 255 on 0.08 % of the part (Lab docs/RENDERING.md § 1.4i) — because the look here
 * is carried by the environment map. So the approximation is made of what the environment can
 * show: a glossier surface, a part-metallic response so the reflections carry the filament's own
 * hue (that is what keeps Silk Gold and Silk Brass apart), and three's native anisotropy, whose
 * rough axis the viewer points ACROSS the printed layers (main.js / silk-axis.js), so a wall's
 * highlight runs along the build axis as the Lab's upright vase shows it.
 *
 * ⚠ THESE NUMBERS ARE TUNED WITH THE VIEWER'S TWO AUTHORED DEVICES ON, NOT ALONE. On their own they
 * changed the 185 2W-2H's fronts almost not at all: an upright face mirrors the plain desk, and
 * even metalness 1 at roughness 0.1 rendered as flat gold there. Build Studio adds a silk light by
 * the camera and a silk studio the part reflects in place of the room (main.js SILK_STUDIO,
 * silk-axis.js SILK_LIGHT); a consumer without them - the Lab's pane - would see a duller silk.
 *
 * ⚠ metalness HERE IS AN ARTISTIC COMPROMISE, NOT SILK PHYSICS: silk PLA is a dielectric. A
 * dielectric's tinted F0 is ~4 % and does not read in this rig; the metallic blend is the cheapest
 * way to make the highlight wear the colour. A real profile for a silk label, once one exists,
 * replaces this whole object (see partMaterialSpec).
 */
export const SILK_APPROX = Object.freeze({ roughness: 0.2, metalness: 0.75, anisotropy: 0.4 });

/** A zone key is `Type` or `Type:zone`; the base type is what carries identity. */
export const baseType = (key) => String(key).split(':')[0];

/**
 * The finish for one part-type key.
 *
 * @param {string} key                     `Type` or `Type:zone`
 * @param {object} [ctx]
 * @param {boolean} [ctx.holographicPlate] a holographic build-plate profile is active
 * @param {boolean} [ctx.plateContact]     this key is the face that touched the plate
 * @param {string|null} [ctx.label]        the FILAMENT_DB label worn by this key, or null when
 *                                         none is — see `activeLabel` in main.js
 * @returns {{kind:'standard'|'physical', roughness:number, metalness:number,
 *            clearcoat?:number, clearcoatRoughness?:number,
 *            envMapIntensity?:number, holographic?:boolean, profile?:string,
 *            anisotropy?:number, silk?:'approx'}}   absent anisotropy means 0
 */
export function partMaterialSpec(key, ctx = {}) {
  const { holographicPlate = false, plateContact = false, label = null } = ctx;

  /* The holographic build plate transfers its own finish to the faceplate that
     was printed against it - polished where it made contact, ordinary elsewhere.
     ⚠ ONLY REACHABLE IN THE PLATE VIEW. The Lab never sets this, so its third
     pane always takes one of the two branches below. */
  if (holographicPlate && baseType(key) === 'Faceplate') {
    return {
      kind: 'physical',
      metalness: 0,
      roughness: plateContact ? 0.14 : 0.2,
      clearcoat: plateContact ? 1.0 : 0.8,
      clearcoatRoughness: plateContact ? 0.11 : 0.14,
      envMapIntensity: 1.15,
      holographic: true,
    };
  }

  /* Bought adhesive rubber feet (2026-08-22). A REAL part in the scene, not an
     annotation - Joey confirmed the bought foot is the printed one minus its
     dovetail rail, so `Adhesive-Foot` is derived from the printed master and
     the shape IS the product. What it must not wear is the identification
     palette: rubber reads as rubber only if it is matte beside the plastics.
     Colour comes from the palette like every other type - and because its BOM
     row is `purchased`, colorLocked pins it to the manifest colour, so no
     preset or filament pick can repaint a bought item.

     0.72, not the 0.95 a "matte rubber" instinct reaches for: a real bumper
     foot carries a soft sheen, and at 0.95 there is no specular at all - the
     pad's edges disappeared into the dark stage (checked on screen, not
     reasoned about). */
  if (key === 'FootAdhesive') return { kind: 'standard', roughness: 0.72, metalness: 0 };

  /* ⚠ THE ORDINARY PRINTED PART — every case, drawer, shelf and handle in the
     viewer. 0.55 / 0.05 is a plausible plastic and nothing more: no layer lines,
     no anisotropy, no dependence on how the part was printed or which filament
     it is. Roadmap item 1 is the proposal to replace it.

     ⚠ PHYSICAL SINCE 2026-09-07, ON THE ROADMAP'S GROUNDS AND NOT ON A
     MEASUREMENT. B2 was scoped as promoting the class only "where a profile is
     active"; it is promoted everywhere because the authored profile this viewer
     is meant to consume was judged on a MeshPhysicalMaterial, and because the
     two renderers being structurally the same is worth having on its own.

     ⚠ THE MEASUREMENT THAT WAS FIRST OFFERED FOR IT IS WITHDRAWN. The Lab
     reported the two pages 16.1 % apart in windowed mean at an identical rig and
     paint and named this class as the only remaining difference. It was not: the
     gap was the Lab's own control arm painting the part TWICE — its catalog
     material carries the filament in coexColors with material.color left white,
     and the coextrusion patch multiplies them. Promoting this class moved the
     comparison by nothing at all, and once the control arm painted once the two
     pages agreed to 0.1 % at three framings. So the "same shader" premise B2
     rested on was never falsified, and this change fixes no defect.
     See docs/RENDERING.md § 1.4s in the Lab, which records the retraction.

     ⚠ AND IT IS FREE, WHICH IS THE ONLY REASON IT SURVIVED THE RETRACTION.
     Benched on the 185 2W-2H at quality high, seven interleaved rounds against
     the deployed main: the class costs −0.086 ms a frame, 4 of 7 rounds
     disagreeing on the sign — unresolved, inside its own spread. The same
     harness resolves layer detail at +2.171 ms with 7 of 7 agreeing and lands a
     planted 1.25x-DPR cost at 1.558x against the 1.5625x its own arithmetic
     predicts. A bench that pins a known cost to 0.3 % cannot see this one.
     docs/data/bs-perf-b2.json.

     The three extra fields are what the physical branch of newPartMaterial
     reads. clearcoat 0 keeps USE_CLEARCOAT undefined, so no clearcoat lobe is
     compiled and clearcoatRoughness is inert; envMapIntensity 1 is three's own
     default and is stated so the branch is not handed an undefined. What
     remains is a plain MeshPhysicalMaterial at its defaults, which is exactly
     what the Lab builds and what the comparison was judged on. */
  const base = {
    kind: 'physical', roughness: 0.55, metalness: 0.05,
    clearcoat: 0, clearcoatRoughness: 0, envMapIntensity: 1,
  };

  /* ⚠ THE AUTHORED PROFILE, AND IT REPLACES TWO SCALARS AND NOTHING ELSE. P6 option A: the Lab
     owns the per-label values and emits them into `filament-profiles.js`; this repo owns the key
     vocabulary, because a filament exists here first or it has no label to be keyed by.

     ⚠ ORDINARY PARTS ONLY, ON PURPOSE. It sits below the plate branch, so the holographic
     transfer still wins where it applies — that finish describes what the BUILD PLATE did to a
     surface, and a filament profile describing the filament cannot also describe that. It sits
     below FootAdhesive for a different reason that needs no code: the foot is purchased, so
     `colorLocked` is true for it and `activeLabel` never returns a label there.

     ⚠ AND THE BASE STAYS 0.55 THIS SHIP. Landing profile one does not move the ordinary part.
     A filament with no profile, and every part in instruction-colours mode and in the ?part=
     embed — where no label exists at all — renders exactly what it rendered before, plus the
     layer detail that shipped separately. See docs/P6-PROFILE-TRANSPORT.md in the Lab. */
  const profile = label ? FILAMENT_PROFILES[label] : undefined;
  if (profile) return { ...base, roughness: profile.roughness, metalness: profile.metalness, profile: label };

  /* ⚠ THE SILK APPROXIMATION, BELOW THE PROFILE ON PURPOSE: an authored profile is the better
     claim, so a silk label that gains one renders the profile and NO anisotropy (a consumer resets
     anything this object does not state). The family comes from the catalog (`finish`), never from
     the label's words. `anisotropy` is the spec's ASK: the viewer zeroes it where it does not know
     which way the part grew, because a direction on a guessed axis is a print that does not exist. */
  if (label && finishOfLabel(label) === 'silk') return { ...base, ...SILK_APPROX, silk: 'approx' };
  return base;
}
