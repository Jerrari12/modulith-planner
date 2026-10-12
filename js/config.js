// Where the part GLBs and the part thumbnails live.
//
// They moved out of this repo on 2026-10-12 into Jerrari12/gen2-parts, a GitHub
// Pages site served with `Access-Control-Allow-Origin: *`, so this repo stays
// small (12 MB instead of 130 MB) and the assets deploy on their own. The
// generator still emits repo-relative paths ('parts/<L>/<node>.lib.glb',
// 'img/parts/<name>.png'); `assetUrl` rewrites exactly those two prefixes and
// leaves every other path (kits/, img/plates, img/page) local.
export const ASSET_BASE = 'https://jerrari12.github.io/gen2-parts/';
export const assetUrl = (p) => (typeof p === 'string' && /^(img\/)?parts\//.test(p) ? ASSET_BASE + p : p);
