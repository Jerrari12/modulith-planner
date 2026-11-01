/* =========================================================================
   A FILAMENT SWATCH'S FINISH - silk's sheen, glitter's specks and their sparkle
   =========================================================================
   SILK (Joey, 2026-10-21: "give the silk material squares a gloss effect, like a sheen on half of it or something? To help
   differentiate it from regular material"): a swatch whose filament is a silk one wears `.silk`, drawn in app.css as a highlight
   over its upper-left half. Every silk filament's label carries the word ("Panchroma Silk Gold"), and the word is the rule on
   purpose: a saved palette can name a filament the catalog lacks (test/silk.test.mjs holds the two rules together on the catalog).

   GLITTER (Joey, 2026-11-01: "how to represent glitter filaments square swatches next rather than just a solid color"; of the
   candidates, "I like c from first sheet", fine specks with four-point glints; and "it might be cool if when scrolling down the
   list of swatches, if the glitter ones could sparkle"). The catalog's glitter family wears `.glitter`: two tiles in app.css on the
   swatch's ::before, so ::after stays free for the pick star and the owned tick. Each swatch looks through its own window on the
   tiles (--gx, --gy, from its label), so neighbours differ and a filament looks the same everywhere.

   THE SPARKLE. The small specks stay put; the lit layer (the glints and the brightest specks) jumps as the list scrolls. A step is a
   function of the scroll position alone, so stopping stops it and scrolling back brings the same glints back, as a real flake does
   with the view; nothing reads the time, and step 0 is the swatch at rest. A pointer's hover steps it too, in app.css, so a short
   list that cannot scroll still glistens. Nothing here touches the model, so the idle gate rests through it.
   ========================================================================= */
import { finishOfLabel } from '../filament-db.js';
import { GLITTER_TINTS } from '../glitter.js';

const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** The class for the 12 px swatches, where silk's sheen does not read and a glint still does; '' for anything but glitter. */
export const glitterClass = (name) => (finishOfLabel(name) === 'glitter' ? (GLITTER_TINTS[name] ? '.glitter.warm' : '.glitter') : '');
/** The class a swatch of this filament wears: `.silk`, `.glitter`, `.glitter.warm` or ''. */
export const finishClass = (name) => (String(name || '').split(' ').includes('Silk') ? '.silk' : glitterClass(name));
/** A swatch's inline style: its colour and, for glitter, its window on the tiles. */
export function swatchStyle(name, hex) {
  if (finishOfLabel(name) !== 'glitter') return `background:${hex}`;
  const h = hash(name);
  return `background:${hex};--gx:${h % 64}px;--gy:${(h >>> 8) % 64}px`;
}

export const SPARKLE_STEP_PX = 14;   // about a third of a swatch's travel: a glint holds that long, then the next
/** Where the lit layer sits at a scroll step, in px. Step 0 is the swatch as it rests, so the top of a list is the swatch unmoved. */
export function litOffset(name, step) {
  if (!step) return [0, 0];
  const m = Math.imul(hash(name) ^ step, 2654435761) >>> 0;
  return [m % 64, (m >>> 8) % 64];
}

/**
 * The sparkle for every scrolling list inside `host` (a capture listener hears a descendant's scroll). One write a frame at most, on
 * the glitter swatches alone; none at all with reduced motion. `sync()` puts swatches a list has just rebuilt at the current step.
 */
export function sparkleOnScroll(host) {
  const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let list = null, queued = false, drawn = null;
  const stepOf = () => Math.floor(list.scrollTop / SPARKLE_STEP_PX);
  const write = (step) => {
    drawn = step;
    for (const el of list.querySelectorAll('.sw.glitter[aria-label]')) {
      const [x, y] = litOffset(el.getAttribute('aria-label'), step);
      el.style.setProperty('--sx', `${x}px`);
      el.style.setProperty('--sy', `${y}px`);
    }
  };
  host.addEventListener('scroll', (e) => {
    if ((calm && calm.matches) || !e.target.querySelector('.sw.glitter')) return;
    if (e.target !== list) { list = e.target; drawn = null; }
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (list.isConnected && stepOf() !== drawn) write(stepOf()); });
  }, { capture: true, passive: true });
  return { sync() { if (list && list.isConnected && !(calm && calm.matches)) write(stepOf()); } };
}
