/* THE HARDWARE PICTURES (2026-11-08, the inventory-first slice, Sol 01a1bd5c): one small rendered thumbnail per part type and
   thread size, so a line of the parts list and a compartment's part show the thing itself, not only its words. The files are
   the hardware visual library's `-sm` renders (the Part Picker's img/hw/v2, studio renders from CAD, a steel finish; the
   inserts stainless), picked once by thread size (the picker tool: hex-socket drives for the socket heads, flat ISO 4026 set
   screws, a 12 mm length where the library has one) and copied into img/hw/ under a plain name, 72 files, 93 KB in all.
   A picture is a REFERENCE MODEL for recognition, never a claim about the part in someone's hand: where the library has no
   render of a size the nearest size stands in (bhcs M2, bhcs M2.5, fhcs M2, fhcs M2.5, insert M10, insert M12, insert M8, nyloc M10, nyloc M12, nyloc M2, nyloc M2.5, nyloc M4, nyloc M6, nyloc M8); the length is never the drawn one. img/hw/index.json
   says which library asset each file came from. Pure: no DOM, no fetch. */
export const PICS = {
  shcs: { 'M2': 'shcs-m2.webp', 'M2.5': 'shcs-m2-5.webp', 'M3': 'shcs-m3.webp', 'M4': 'shcs-m4.webp', 'M5': 'shcs-m5.webp', 'M6': 'shcs-m6.webp', 'M8': 'shcs-m8.webp', 'M10': 'shcs-m10.webp', 'M12': 'shcs-m12.webp' },
  bhcs: { 'M2': 'bhcs-m2.webp', 'M2.5': 'bhcs-m2-5.webp', 'M3': 'bhcs-m3.webp', 'M4': 'bhcs-m4.webp', 'M5': 'bhcs-m5.webp', 'M6': 'bhcs-m6.webp', 'M8': 'bhcs-m8.webp', 'M10': 'bhcs-m10.webp', 'M12': 'bhcs-m12.webp' },
  fhcs: { 'M2': 'fhcs-m2.webp', 'M2.5': 'fhcs-m2-5.webp', 'M3': 'fhcs-m3.webp', 'M4': 'fhcs-m4.webp', 'M5': 'fhcs-m5.webp', 'M6': 'fhcs-m6.webp', 'M8': 'fhcs-m8.webp', 'M10': 'fhcs-m10.webp', 'M12': 'fhcs-m12.webp' },
  set: { 'M2': 'set-m2.webp', 'M2.5': 'set-m2-5.webp', 'M3': 'set-m3.webp', 'M4': 'set-m4.webp', 'M5': 'set-m5.webp', 'M6': 'set-m6.webp', 'M8': 'set-m8.webp', 'M10': 'set-m10.webp', 'M12': 'set-m12.webp' },
  nut: { 'M2': 'nut-m2.webp', 'M2.5': 'nut-m2-5.webp', 'M3': 'nut-m3.webp', 'M4': 'nut-m4.webp', 'M5': 'nut-m5.webp', 'M6': 'nut-m6.webp', 'M8': 'nut-m8.webp', 'M10': 'nut-m10.webp', 'M12': 'nut-m12.webp' },
  nyloc: { 'M2': 'nyloc-m2.webp', 'M2.5': 'nyloc-m2-5.webp', 'M3': 'nyloc-m3.webp', 'M4': 'nyloc-m4.webp', 'M5': 'nyloc-m5.webp', 'M6': 'nyloc-m6.webp', 'M8': 'nyloc-m8.webp', 'M10': 'nyloc-m10.webp', 'M12': 'nyloc-m12.webp' },
  washer: { 'M2': 'washer-m2.webp', 'M2.5': 'washer-m2-5.webp', 'M3': 'washer-m3.webp', 'M4': 'washer-m4.webp', 'M5': 'washer-m5.webp', 'M6': 'washer-m6.webp', 'M8': 'washer-m8.webp', 'M10': 'washer-m10.webp', 'M12': 'washer-m12.webp' },
  insert: { 'M2': 'insert-m2.webp', 'M2.5': 'insert-m2-5.webp', 'M3': 'insert-m3.webp', 'M4': 'insert-m4.webp', 'M5': 'insert-m5.webp', 'M6': 'insert-m6.webp', 'M8': 'insert-m8.webp', 'M10': 'insert-m10.webp', 'M12': 'insert-m12.webp' },
};
export const PIC_NOTE = 'Rendered example: the shape, for recognition; not the length or the finish in your hand';
/* the picture for a list item or a compartment's part: a relative path under the page (img/…, as the planner's other
   pictures), or null for a type or size the library does not draw */
export function picOf(it) {
  if (!it || !it.type) return null;
  const f = PICS[it.type] && PICS[it.type][it.size];
  return f ? `img/hw/${f}` : null;
}
