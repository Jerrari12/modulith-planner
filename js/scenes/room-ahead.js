/* THE ROOM AHEAD: whether a page gets the Colors room ready before anyone asks for it (Joey 2026-10-31, of the first switch to
 * Colors: "it just feels like it's sluggish or frozen, even on this powerful laptop ... is there maybe a way to partially
 * preload in the background?"). Measured on his laptop (D:/Claude - Output/colors-load-2026-10-31): the wait is the GPU
 * driver building shader programs, not the files. Small on purpose, and imported by the boot: done.js is 260 KB with its
 * helpers, and it stays away until this says yes.
 *
 * Never on a phone (the room is a megabyte and a phone may pay for it), with Save-Data, on a slow or a cellular line, on a
 * software rasteriser (every program is the CPU's, on the page's own machine), with ?done=off, or for a visitor who chose
 * Neutral in this browser. Those all still get the room when they ask for it, without a freeze: done.js does the same work
 * then, behind the loading bar. */

/* env: { search: location.search, phone, softwareGL, tier: the stage's quality, stored: the Colors stage this browser remembers,
   connection: navigator.connection or null, memoryGB: navigator.deviceMemory or null, cores: navigator.hardwareConcurrency or
   null }. Fast: picked by hand, or where the stage stepped a device down to it; its wait is short (under a second on the
   A5000 with no driver cache) and is not worth anything from a device that needed the step. */
export function roomAheadWanted({ search = '', phone = false, softwareGL = false, tier = 'high', stored = null, connection = null, memoryGB = null, cores = null } = {}) {
  const q = new URLSearchParams(search);
  if ((q.get('done') || 'room') !== 'room') return false;
  if (q.has('debug') && q.get('roomahead') === 'off') return false;   // a check's control arm
  if (q.has('debug') && q.get('roomahead') === 'on') return true;    // ... and a software rasteriser's way in (the CI runner's e2e)
  if (phone || softwareGL || tier === 'fast' || stored === 'studio') return false;
  if (connection && (connection.saveData || connection.type === 'cellular' || /(^|-)(2g|3g)$/.test(connection.effectiveType || ''))) return false;
  if ((memoryGB != null && memoryGB < 4) || (cores != null && cores < 4)) return false;   // a device this small is better left to Build
  return true;
}

/* how long after the boot it may start: every part's GLB has its start by then, the stage's first frames are drawn, and the
   visitor has had the page to themselves */
export const ROOM_AHEAD_DELAY_MS = 2500;
