/* The parts drawer prototype's flag (M2, 2026-11-05): `?partsdrawer=1` in the address turns the variant, the editor and
   the record fields on; without it the planner is exactly what it was (SPEC "M2, prototype behind a flag"). Read once
   per page: the flag never changes while a page is open, and app.js keeps it in the address across its own reloads. */
export const PARTS_DRAWER_PARAM = 'partsdrawer';
export const partsDrawerOn = () => {
  try { return new URLSearchParams(globalThis.location?.search || '').get(PARTS_DRAWER_PARAM) === '1'; } catch { return false; }
};
