# MODULITH Planner

The MODULITH planner and 3D Build Studio merged into one app with five workspaces: Build · Colors · Labels · Parts · Assemble. The redesign brief, the style spec, the feature inventories and the reference artboard are in `docs/redesign/`.

This repository started on 2026-10-12 as the viewer repository's history (`gen2-visual-animator`, its `viewer/` folder) filtered to the root, with the part GLBs and the part thumbnails removed. Those live in [Jerrari12/gen2-parts](https://github.com/Jerrari12/gen2-parts) and are served from `https://jerrari12.github.io/gen2-parts/`; `js/config.js` holds that address.

## Running it

It is a static site: serve the root folder (for example `python -m http.server 8743`) and open it. The part GLBs and thumbnails load from the parts host, so it needs the network even locally.

## Tests

```
npm ci
node --test
```

The tests that open GLBs read them from `parts/<length>/`, which is not in this repository. Make `parts/` a junction (Windows) or a symlink to a checkout of `gen2-parts/parts`; it is ignored by git.
