/* The parts drawer generator's test bench: the engine, its meshes, and a scratch folder.
 *
 * The generator's validation scripts (docs/parts-drawer/VALIDATION.md) each booted manifold, read the shells and holder
 * stamps from a sibling folder and wrote their STLs to `out/`. Ported here (M0, 2026-11-04) they read the same meshes
 * from their new places - the two Fusion shells and both stamps ship with the planner in js/parts-drawer/assets/, the
 * v23 tall shells (reference only) sit in test/fixtures/parts-drawer/ - and keep their `out/` writes verbatim, because
 * this module moves the process into a fresh temp folder. Each test file is its own process under `node --test`, so
 * that chdir touches nothing else; the folder goes when the process exits.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from '../../js/parts-drawer/lib/manifold.js';
import * as G from '../../js/parts-drawer/gen.js';
import * as I from '../../js/parts-drawer/inventory.js';
import * as Mk from '../../js/parts-drawer/marks.js';
import * as X from '../../js/parts-drawer/export.js';

export { G, I, Mk, X };
export const wasm = await Module(); wasm.setup();

const here = path.dirname(fileURLToPath(import.meta.url));
export const ASSETS = path.join(here, '..', '..', 'js', 'parts-drawer', 'assets');
export const FIXTURES = path.join(here, '..', 'fixtures', 'parts-drawer');
export const fixture = (name) => path.join(FIXTURES, name);

export const load = (p) => G.manifoldFromSTL(wasm, fs.readFileSync(p).buffer.slice(0));
export const stamps = { small: load(path.join(ASSETS, 'holder_stamp.stl')), large: load(path.join(ASSETS, 'holder_stamp_large.stl')) };
// the v23 shells: what the generator used to load for the tall heights, now a reference the stretch is checked against
export const v23 = { '1.5H': load(fixture('shell_240-2W-15H.stl')), '2H': load(fixture('shell_240-2W-2H.stl')) };
// as the scripts built it: the two Fusion shells, and the v23 ones beside them (shellFor never reads those two keys)
export const assets = { stamps, shells: { '0.5H': load(path.join(ASSETS, 'shell_240-2W-05H.stl')), '1H': load(path.join(ASSETS, 'shell_240-2W-1H.stl')), ...v23 } };

export const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'parts-drawer-'));
const home = process.cwd();
process.chdir(OUT);
fs.mkdirSync('out');   // the generator folder has one; the scripts that write straight into it never make it
process.on('exit', () => { try { process.chdir(home); fs.rmSync(OUT, { recursive: true, force: true }); } catch { /* a locked file keeps the folder; the OS temp cleaner takes it */ } });
