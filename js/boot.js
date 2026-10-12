// The page's entry (phase 0 of the planner merge, 2026-10-12). index.html loads this module and
// nothing else. app.js decides between the workspace shell and the plain viewer and boots the
// stage into the document; its top-level await keeps the window's load event waiting on the kit
// exactly as it did when main.js itself awaited at module scope, which main.js's analytics flush
// relies on. main.js stays importable without side effects (test/stage-import.test.mjs).
import './app.js';
