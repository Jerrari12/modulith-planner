/* The parts drawer's door for the planner (2026-11-08): everything a workspace calls, in one module that app.js loads only
   when the flag is on (`?partsdrawer=1`, flag.js) and hands to the workspaces as `ctx.partsDrawer`, null without it. Before
   this, build.js, labels.js and parts.js imported the editor, the labels, the rows and the download statically, so every
   visitor fetched about 330 KB of drawer code (gen.js, editor.js, inventory.js with its packing table, export, marks, zip) to
   run none of it. Without the flag the page now carries flag.js alone; the engine (three.js, the worker) still loads at the
   click, as before. */
export { partsDrawerTools } from './editor.js';
export { compartmentLabels, addToList } from './labels.js';
export { withPartsDrawers } from './row.js';
export { fullLayout } from './unit.js';
export { saveBytes } from './download.js';
