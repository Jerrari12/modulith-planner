/* The filaments the visitor OWNS (the Colors plan's step 5, 2026-10-18): a list of catalog labels in this browser, for
   "Only filaments I own" in Surprise me. It lives outside the vendored catalog (js/filament-db.js is edited in the viewer
   repo only and vendored byte-for-byte), keyed by `label`, the catalog's identity key: a label that leaves the catalog
   drops out of the list on the next read rather than lingering as a spool nothing can show.

   One localStorage key, `gen2-owned` = { v: 1, labels: [...] }. Every storage access sits in a try (the storage guard
   test; a private window throws on the read itself), and a storage that fails reads as an empty list. */
export const OWNED_KEY = 'gen2-owned';

/* the list as stored, made safe: catalog labels only, each once, in the order given */
export function cleanOwned(raw, labels) {
  const list = raw && typeof raw === 'object' && Array.isArray(raw.labels) ? raw.labels : [];
  const out = [];
  for (const l of list) if (typeof l === 'string' && labels.has(l) && !out.includes(l)) out.push(l);
  return out;
}

export function readOwned(storage, labels) {
  try { return cleanOwned(JSON.parse(storage.getItem(OWNED_KEY) || 'null'), labels); } catch { return []; }
}

export function writeOwned(storage, list) {
  try { storage.setItem(OWNED_KEY, JSON.stringify({ v: 1, labels: [...new Set(list)] })); return true; } catch { return false; }   // private mode: the list lasts the page
}
