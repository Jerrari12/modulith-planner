/* THE HARDWARE PICTURES (2026-11-08, the inventory-first slice, Sol 01a1bd5c; per material since 2026-11-09): one small
   rendered thumbnail per part type, thread size and material, so a card of the parts list and a compartment's part show the
   thing itself, not only its words. The files are the hardware visual library's `-sm` renders (the Part Picker's img/hw/v2,
   studio renders from CAD), picked once per type and size (hex-socket drives for the socket heads, flat ISO 4026 set screws, a
   12 mm length where the library has one) and copied per material from the library's own finishes table (scratch hwmap3.py):
   <base>.webp is the type's default material (plain steel; brass for the inserts, which the first copy showed in stainless
   because the library's brass insert is its UNSUFFIXED render), <base>--<material>.webp the others (inventory.js MATERIALS).
   A picture is a REFERENCE MODEL for recognition, never a claim about the part in someone's hand: where the library has no
   render of a size the nearest size stands in (bhcs M2, bhcs M2.5, fhcs M2, fhcs M2.5, insert M10, insert M12, insert M8, nyloc M10, nyloc M12, nyloc M2, nyloc M2.5, nyloc M4, nyloc M6, nyloc M8); the length is never the drawn one. img/hw/index.json
   says which library asset each file came from. Pure: no DOM, no fetch. */
import { matOf, defaultMat } from './inventory.js';
export const PICS = {
  shcs: { 'M2': 'shcs-m2', 'M2.5': 'shcs-m2-5', 'M3': 'shcs-m3', 'M4': 'shcs-m4', 'M5': 'shcs-m5', 'M6': 'shcs-m6', 'M8': 'shcs-m8', 'M10': 'shcs-m10', 'M12': 'shcs-m12' },
  bhcs: { 'M2': 'bhcs-m2', 'M2.5': 'bhcs-m2-5', 'M3': 'bhcs-m3', 'M4': 'bhcs-m4', 'M5': 'bhcs-m5', 'M6': 'bhcs-m6', 'M8': 'bhcs-m8', 'M10': 'bhcs-m10', 'M12': 'bhcs-m12' },
  fhcs: { 'M2': 'fhcs-m2', 'M2.5': 'fhcs-m2-5', 'M3': 'fhcs-m3', 'M4': 'fhcs-m4', 'M5': 'fhcs-m5', 'M6': 'fhcs-m6', 'M8': 'fhcs-m8', 'M10': 'fhcs-m10', 'M12': 'fhcs-m12' },
  set: { 'M2': 'set-m2', 'M2.5': 'set-m2-5', 'M3': 'set-m3', 'M4': 'set-m4', 'M5': 'set-m5', 'M6': 'set-m6', 'M8': 'set-m8', 'M10': 'set-m10', 'M12': 'set-m12' },
  nut: { 'M2': 'nut-m2', 'M2.5': 'nut-m2-5', 'M3': 'nut-m3', 'M4': 'nut-m4', 'M5': 'nut-m5', 'M6': 'nut-m6', 'M8': 'nut-m8', 'M10': 'nut-m10', 'M12': 'nut-m12' },
  nyloc: { 'M2': 'nyloc-m2', 'M2.5': 'nyloc-m2-5', 'M3': 'nyloc-m3', 'M4': 'nyloc-m4', 'M5': 'nyloc-m5', 'M6': 'nyloc-m6', 'M8': 'nyloc-m8', 'M10': 'nyloc-m10', 'M12': 'nyloc-m12' },
  washer: { 'M2': 'washer-m2', 'M2.5': 'washer-m2-5', 'M3': 'washer-m3', 'M4': 'washer-m4', 'M5': 'washer-m5', 'M6': 'washer-m6', 'M8': 'washer-m8', 'M10': 'washer-m10', 'M12': 'washer-m12' },
  insert: { 'M2': 'insert-m2', 'M2.5': 'insert-m2-5', 'M3': 'insert-m3', 'M4': 'insert-m4', 'M5': 'insert-m5', 'M6': 'insert-m6', 'M8': 'insert-m8', 'M10': 'insert-m10', 'M12': 'insert-m12' },
};
export const PIC_NOTE = 'Rendered example: the shape and the material, for recognition; not the length in your hand';
/* the picture for a list item or a compartment's part: a relative path under the page (img/…, as the planner's other
   pictures), or null for a type or size the library does not draw */
export function picOf(it) {
  if (!it || !it.type) return null;
  const b = PICS[it.type] && PICS[it.type][it.size];
  if (!b) return null;
  const m = matOf(it);
  return `img/hw/${b}${m && m !== defaultMat(it.type) ? '--' + m : ''}.webp`;
}
