/* A module-resolution hook that answers the browser's import map under node.
 *
 * index.html maps the bare specifiers `three` and `three/addons/...` to vendor/three/; node has no
 * import map, so a test that imports a module written against those specifiers (js/main.js and the
 * stage modules carved out of it) registers this hook first:
 *
 *   import { register } from 'node:module';
 *   register(new URL('./lib/three-resolve.mjs', import.meta.url));
 *
 * Nothing else is rewritten; every other specifier goes to the default resolver.
 */
const VENDOR = new URL('../../vendor/three/', import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('three.module.js', VENDOR).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) {
    return { url: new URL(specifier.slice('three/addons/'.length), new URL('addons/', VENDOR)).href, shortCircuit: true };
  }
  return next(specifier, context);
}
