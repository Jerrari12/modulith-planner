// The page's entry (phase 0 of the planner merge, 2026-10-12). index.html loads this module and
// nothing else; it boots the stage into the document. It is separate from main.js so main.js can be
// imported without side effects (test/stage-import.test.mjs) - and the top-level await keeps the
// window's load event waiting on the kit exactly as it did when main.js itself awaited at module
// scope, which main.js's analytics flush relies on.
import { createStage } from './main.js';

await createStage(document);
