/* The Build workspace - phase 0's first visual shell, composed over the unchanged renderer.
 *
 * Layout per the brief §2 and the v4 artboard: top bar (real wordmark, build switcher, five
 * unnumbered tabs, mount·length and printer chips, Day/Night toggle, Share), the left Library
 * (Add units / Build style), the right Inspector ("This unit only", hugs its content), the center
 * toolbar and the Build Dock. Product icons are generated from colours (ui/glyph.js), never photos.
 *
 * What is live against the stage today: selection (click a part, the inspector follows its unit),
 * faceplate and handle series, closures, stoppers, Standard/Gridfinity, back cover, feet, theme,
 * measure, reset view, quality. What waits for the planner's rules (phase 3) is marked as such in
 * the UI with a tooltip rather than hidden: adding and moving units, per-unit type, Peek inside,
 * Duplicate, Remove, the 2D board, Explode, the issue card.
 *
 * Data: the planner's catalog (GEN2, js/catalog/data.js, verbatim) for units, sizes, printers,
 * mounts, lengths and faceplates; the stage's `build` for what is placed.
 */
import { glyphEl, sizeGlyph, FACEK, DEFAULT_COLORS } from '../ui/glyph.js';
import { icon } from '../ui/icons.js';

/* `const GEN2` at a classic script's top level is a global LEXICAL binding: visible to modules by name, absent from globalThis */
// eslint-disable-next-line no-undef
const G = typeof GEN2 !== 'undefined' ? GEN2 : null;
const INSIDE = { 59: 45, 115: 101, 165: 151, 185: 171, 240: 226, 270: 256 };   // interior length per collection, mm
const MOUNT_NAME = { 'under-table': 'Under-Table', tabletop: 'Tabletop', wall: 'Wall Mount' };
const MOUNT_ICON = { 'under-table': 'desk', tabletop: 'table', wall: 'wall' };
const FACE_LABEL = Object.fromEntries((G?.faceplateStyles || []).map((f) => [f.id, f.label]));
const CLUB = { edgelabel: 1, classicpro: 1, chevron: 1 };
const TABS = [['build', 'Build', 'cube'], ['colors', 'Colors', 'palette'], ['labels', 'Labels', 'tag'], ['parts', 'Parts', 'list-checks'], ['assemble', 'Assemble', 'wrench']];
const PHASE = { colors: 'phase 4', labels: 'phase 5', parts: 'phase 2', assemble: 'phase 1' };

/* tiny DOM helper: el('button.seg.on', { title }, [children]) */
function el(spec, attrs = {}, children = []) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'disabled') node.disabled = true;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c != null) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

export function mountBuild(stage, { setMode }) {
  const build = stage.build;
  const length = Number(build?.length || stage.manifest?.collection || 185);
  const st = {
    tab: 'add', collapsed: false,
    unit: 'decor', gf: 'standard', addSize: '1x1',
    printer: 'any', measure: false, menu: false, sel: null,
    name: stage.manifest?.title || 'Workbench build',
  };
  /* a representative finished build (Astra, 2026-10-12): the first preset's coordinated filaments unless the
     visitor already has a saved palette; instruction colours stay available for Assemble */
  if (!stage.useCustom && stage.PRESETS?.length) stage.applyPreset(stage.PRESETS[0]);
  /* product icons read the LIVE palette, so the tiles, the inspector thumbnail and the model agree */
  const hex = (key, fallback) => { try { return stage.activeHex(key) || fallback; } catch { return fallback; } };
  const frontFor = (fill) => fill === 'classic' ? hex('Drawer', DEFAULT_COLORS.front) : hex('Faceplate:FACE', hex('Faceplate', DEFAULT_COLORS.front));
  const colors = {   // getters, so `{ ...colors }` spreads live values
    get body() { return hex('Case', DEFAULT_COLORS.body); },
    get front() { return frontFor(st.unit); },
    get handle() { return hex('Handle', DEFAULT_COLORS.handle); },
    get lb() { return hex('Label', DEFAULT_COLORS.lb); },
    get lt() { return DEFAULT_COLORS.lt; },
  };

  const root = el('div', { id: 'ws' });
  document.body.appendChild(root);
  const toast = el('div', { id: 'ws-toast', class: 'glass' });
  let toastT = 0;
  const say = (msg) => { toast.textContent = msg; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 2600); };
  const soon = (what, when) => () => say(`${what} comes with ${when}.`);

  /* ---------------- top bar ---------------- */
  const top = el('header', { id: 'ws-top' });
  top.append(
    el('a', { id: 'ws-logo', href: 'https://modulith.systems', title: 'MODULITH' }, [el('img', { src: 'img/modulith-logo.svg', alt: 'MODULITH' })]),
    switcher(),
    el('div.spacer'),
    tabs(),
    el('span.badge.preview', { text: 'Preview', title: 'A visual preview over the real scene. Adding, moving and removing units, per-unit type and the 2D board arrive with the Build rules (phase 3).' }),
    el('div.spacer'),
    el('button.chip.chip-btn.mount', { title: 'Mount and length · opens the setup sheet (phase 0, later)', onclick: soon('The setup sheet', 'the next phase-0 step') }, [
      icon(MOUNT_ICON[build?.mount] || 'table'), `${MOUNT_NAME[build?.mount] || 'Tabletop'} · `, el('span.mono', { text: String(length) }),
    ]),
    el('button.chip.chip-btn.printer', { title: 'Printer · optional; only greys out sizes that will not fit', onclick: soon('The printer picker', 'the setup sheet') }, [icon('printer'), el('span', { text: 'Any printer' })]),
    themeToggle(),
    el('button.chip.chip-btn.share', { onclick: share, title: 'Share' }, [icon('share-network'), el('span', { text: 'Share' })]),
  );
  root.appendChild(top);

  function switcher() {
    const wrap = el('div', { id: 'ws-switch' });
    const btn = el('button.chip.chip-btn.strong', { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, [icon('folder-simple'), el('span', { text: st.name }), icon('caret-down', { size: 16 })]);
    const menu = el('div.menu.glass', { role: 'menu', hidden: true });
    menu.append(
      el('div.label', { text: 'Current build' }),
      el('button.item.current', { role: 'menuitem' }, [el('span', { text: st.name }), el('span.meta', { text: `${length} · ${build?.placed?.length ?? 0} units` })]),
      el('div.divider'),
      el('div.label', { text: 'Recent builds' }),
      el('div.meta', { text: 'Autosaved in this browser · arrives with the build store', style: 'padding:4px 10px 8px' }),
      el('div.divider'),
      ...[['Rename', 'the build store'], ['Duplicate', 'the build store'], ['Save build file', 'the build store'], ['Load build file', 'the build store'], ['New build', 'the setup sheet']]
        .map(([t, when]) => el('button.item', { role: 'menuitem', disabled: true, title: `${t} comes with ${when}` }, [el('span', { text: t })])),
    );
    btn.addEventListener('click', () => { st.menu = !st.menu; menu.hidden = !st.menu; btn.setAttribute('aria-expanded', String(st.menu)); });
    document.addEventListener('pointerdown', (e) => { if (st.menu && !wrap.contains(e.target)) { st.menu = false; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    wrap.append(btn, menu);
    return wrap;
  }
  function tabs() {
    const nav = el('nav.chip', { id: 'ws-tabs', 'aria-label': 'Workspaces' });
    for (const [id, name, ic] of TABS) {
      const on = id === 'build';
      nav.appendChild(el('button.tab' + (on ? '.on' : ''), { 'aria-current': on ? 'page' : null, title: on ? null : `${name} comes in ${PHASE[id]}`, onclick: on ? null : soon(`The ${name} workspace`, PHASE[id]) },
        [icon(ic, { fill: on }), el('span', { text: name })]));
    }
    return nav;
  }
  function themeToggle() {
    const g = el('div.chip', { id: 'ws-theme', role: 'group', 'aria-label': 'Day Grid or Night Grid' });
    const mk = (mode, ic, label) => el('button', { title: label, 'aria-label': label, 'aria-pressed': String(document.documentElement.dataset.mode === mode), onclick: () => { setMode(mode, stage); sync(); } }, [icon(ic, { fill: mode === 'dark' && document.documentElement.dataset.mode === 'dark' })]);
    const sun = mk('light', 'sun', 'Day Grid'), moon = mk('dark', 'moon', 'Night Grid');
    const sync = () => { const m = document.documentElement.dataset.mode; sun.classList.toggle('on', m === 'light'); moon.classList.toggle('on', m === 'dark'); sun.setAttribute('aria-pressed', String(m === 'light')); moon.setAttribute('aria-pressed', String(m === 'dark')); };
    g.append(sun, moon); sync();
    return g;
  }
  async function share() {
    try { await navigator.clipboard.writeText(location.href); say('Link copied.'); }
    catch { say('Copy the address bar to share this build.'); }
  }

  /* ---------------- library ---------------- */
  const lib = el('aside.glass', { id: 'ws-lib', 'aria-label': 'Library' });
  root.appendChild(lib);
  function renderLib() {
    lib.replaceChildren();
    lib.classList.toggle('rail', st.collapsed);
    if (st.collapsed) {
      lib.append(
        el('button.expand', { title: 'Expand the library', onclick: () => { st.collapsed = false; renderLib(); layout(); } }, [icon('caret-right')]),
        el('button.railbtn.key' + (st.tab === 'add' ? '.on' : ''), { onclick: () => { st.collapsed = false; st.tab = 'add'; renderLib(); layout(); } }, [icon('plus'), 'Add']),
        el('button.railbtn.key' + (st.tab === 'style' ? '.on' : ''), { onclick: () => { st.collapsed = false; st.tab = 'style'; renderLib(); layout(); } }, [icon('sliders-horizontal'), 'Style']),
      );
      return;
    }
    const tabsRow = el('div.tabs', {}, [
      el('div.track', { role: 'tablist' }, [
        el('button.seg' + (st.tab === 'add' ? '.on' : ''), { role: 'tab', 'aria-selected': String(st.tab === 'add'), text: 'Add units', onclick: () => { st.tab = 'add'; renderLib(); } }),
        el('button.seg' + (st.tab === 'style' ? '.on' : ''), { role: 'tab', 'aria-selected': String(st.tab === 'style'), text: 'Build style', onclick: () => { st.tab = 'style'; renderLib(); } }),
      ]),
      el('button.collapse', { title: 'Collapse the library', onclick: () => { st.collapsed = true; renderLib(); layout(); } }, [icon('caret-right', { size: 18 })]),
    ]);
    tabsRow.querySelector('.collapse svg').style.transform = 'rotate(180deg)';
    lib.appendChild(tabsRow);
    if (st.tab === 'add') renderAdd(); else renderStyle();
  }

  const curMax = () => {
    const pr = (G?.printers || []).find((p) => p.id === st.printer);
    if (!pr || pr.x == null) return 4;
    for (let k = 4; k >= 1; k--) if ((k * 88 <= pr.x && length <= pr.y) || (k * 88 <= pr.y && length <= pr.x)) return k;
    return 0;
  };
  const kindOf = (unit) => unit === 'classic' ? 'classicDrawer' : unit === 'shelf' ? 'shelf' : unit === 'cabinet' ? 'cabinet'
    : (st.gf === 'gridfinity' ? 'gridfinity' : (FACEK[stage.currentFaceplateStyle()?.key] || 'edgelabel'));

  function renderAdd() {
    const sec = el('section');
    sec.appendChild(el('h2.h2', { text: 'Unit' }));
    const grid = el('div.units');
    for (const f of (G?.fills || [])) {
      const soonUnit = !!f.soon;
      const on = st.unit === f.id;
      const b = el('button.unit.key' + (soonUnit ? '.dis' : on ? '.on' : ''), {
        'aria-disabled': soonUnit ? 'true' : null, 'aria-pressed': String(on), title: f.blurb,
        onclick: soonUnit ? null : () => { st.unit = f.id; renderLib(); },
      }, [glyphEl(kindOf(f.id), 36, 24, colors), el('span', { text: f.label })]);
      if (soonUnit) b.appendChild(el('span.soon', { text: 'SOON' }));
      grid.appendChild(b);
    }
    sec.appendChild(grid);
    if (st.unit === 'decor') {
      sec.appendChild(el('div.track.gf', { role: 'group', 'aria-label': 'Decor drawer variant' }, [
        el('button.seg' + (st.gf === 'standard' ? '.on' : ''), { text: 'Standard', onclick: () => { st.gf = 'standard'; renderLib(); } }),
        el('button.seg' + (st.gf === 'gridfinity' ? '.on' : ''), { text: 'Gridfinity', onclick: () => { st.gf = 'gridfinity'; renderLib(); } }),
      ]));
    }
    lib.appendChild(sec);

    const sz = el('section');
    sz.appendChild(el('h2.h2', { text: 'Size · drawn to scale' }));
    const sizes = el('div.sizes');
    const max = curMax();
    const prName = (G?.printers || []).find((p) => p.id === st.printer)?.label?.split(' (')[0] || 'printer';
    for (const h of (G?.drawerHeights || [0.5, 1, 1.5, 2, 3])) {
      for (const w of (G?.drawerWidths || [1, 2, 3, 4])) {
        if ((G?.unavailableSizes || []).includes(`${w}W-${h}H`)) continue;
        let why = null;
        if (w > max) why = `Won't fit your ${prName} bed at ${length} mm`;
        else if (st.unit === 'shelf' && !Number.isInteger(h)) why = 'Shelves come in whole heights only';
        else if (st.unit === 'decor' && st.gf === 'gridfinity' && !(G?.gridfinity?.heights || [1, 1.5, 2]).includes(h)) why = 'Gridfinity drawers come in 1, 1.5 and 2H';
        else if (length === 59 && (w > (G?.collectionCases?.[59]?.maxW ?? 2) || h > (G?.collectionCases?.[59]?.maxDrawerH ?? 1))) why = 'Not in the 59 lineup';
        const id = `${w}x${h}`;
        const dis = !!why, on = st.addSize === id;
        sizes.appendChild(el('button.size.key' + (dis ? '.dis' : on ? '.on' : ''), {
          title: why || `${w * 88} × ${h * 56} mm`, 'aria-disabled': dis ? 'true' : null, 'aria-pressed': String(on),
          onclick: dis ? null : () => { st.addSize = id; renderLib(); },
        }, [el('div.holder', {}, [sizeGlyph(kindOf(st.unit), w, h, colors)]), el('span.cap', { text: `${w}W·${h}H` })]));
      }
    }
    sz.appendChild(sizes);
    sz.appendChild(el('p.hint', { text: max < 4 ? `Greyed sizes won't fit your ${prName} at ${length} mm. Hover one to see why.` : 'Pick a unit and size, then click the grid to place it.' }));
    const [aw, ah] = st.addSize.split('x').map(Number);
    const wall = G?.interior || { wWall: 17, hWall: 8 };
    sz.appendChild(el('p.readout', { text: `${aw}W·${ah}H inside ≈ ${aw * 88 - wall.wWall} × ${Math.round(ah * 56 - wall.hWall)} × ${INSIDE[length] ?? length} mm` }));
    sz.appendChild(el('p.hint', { text: 'Placing units on the stage arrives with the Build rules (phase 3).' }));
    lib.appendChild(sz);
  }

  function renderStyle() {
    lib.appendChild(el('p.intro', { text: 'Applies to every unit. Colors live in the Colors tab.' }));
    const drawers = stage.drawersInBuild();
    const fills = (build?.placed || []).map((u) => u.fill);
    const typeOn = fills.length && fills.every((f) => f === fills[0]) ? fills[0] : null;
    const types = el('section');
    types.appendChild(el('h2.h2', { text: 'Drawer type' }));
    types.appendChild(el('div.types', {}, [['classic', 'Classic drawer', 'classicDrawer'], ['decor', 'Decor drawer', FACEK[stage.currentFaceplateStyle()?.key] || 'edgelabel']].map(([id, name, kind]) =>
      el('button.type.key' + (typeOn === id ? '.on' : ''), { title: 'Converting between drawer types comes with the Build rules (phase 3)', onclick: soon('Drawer conversion', 'the Build rules (phase 3)') }, [glyphEl(kind, 36, 24, colors), name]))));
    lib.appendChild(types);

    const cur = stage.currentFaceplateStyle();
    const avail = new Set(stage.availableFaceplateStyles().map((s) => s.key));
    const faces = el('section');
    faces.appendChild(el('h2.h2', { text: 'Decor faceplate' }));
    faces.appendChild(el('div.faces', {}, stage.FACEPLATE_STYLES.map((s) => {
      const ok = avail.has(s.key) && drawers.length > 0;
      const b = el('button.face.key' + (!ok ? '.dis' : cur?.key === s.key ? '.on' : ''), {
        'aria-disabled': ok ? null : 'true', title: ok ? `${FACE_LABEL[s.key] || s.label}${CLUB[s.key] ? ' · ✦ Club' : ' · Core, free'}` : 'Not in this collection',
        onclick: ok ? async () => { await stage.applyFaceplateStyle(s); renderLib(); renderInspector(); } : null,
      }, [glyphEl(FACEK[s.key] || 'essential', 40, 26, colors), FACE_LABEL[s.key] || s.label]);
      if (CLUB[s.key]) b.appendChild(el('span.club', { text: '✦', title: 'Club' }));
      return b;
    })));
    faces.appendChild(el('p.note', { text: cur?.key === 'edgelabel' || cur?.key === 'classicpro' ? `${FACE_LABEL[cur.key]} takes printed labels.` : 'EdgeLabel and Classic Pro take printed labels.' }));
    lib.appendChild(faces);

    if (cur?.hasHandle) {
      const hs = el('section');
      hs.appendChild(el('h2.h2', { text: 'Handle series' }));
      const curH = stage.currentHandleStyle();
      const shape = (label) => /crystal/i.test(label) ? 'crystal' : /block/i.test(label) ? 'blockbar' : 'deco';
      hs.appendChild(el('div.handles', {}, stage.HANDLE_STYLES.map((h) => el('button.handle.key' + (curH?.node === h.node ? '.on' : ''), { onclick: async () => { await stage.applyHandleStyle(h); renderLib(); } },
        [el('span.shape.' + shape(h.label), { style: `background:${colors.handle}` }), h.label]))));
      lib.appendChild(hs);
    }

    const closures = drawers.map((u) => u.closure === 'magnet' ? 'magnet' : 'none');
    const closureOn = closures.length && closures.every((c) => c === closures[0]) ? closures[0] : null;
    const cl = el('section');
    cl.appendChild(el('h2.h2', { text: 'Closures' }));
    cl.appendChild(el('div.track.seg3', { role: 'group' }, [
      el('button.seg' + (closureOn === 'none' ? '.on' : ''), { text: 'None', onclick: async () => { await stage.setAllClosure('none'); renderLib(); renderInspector(); } }),
      el('button.seg' + (closureOn === 'magnet' ? '.on' : ''), { text: 'Magnets', title: '6 × 10×2 mm disc magnets per drawer · hardware store', onclick: async () => { await stage.setAllClosure('magnet'); renderLib(); renderInspector(); } }),
      el('button.seg', { text: 'Push-Click', disabled: true, title: 'Soon · not for wall builds' }),
    ]));
    lib.appendChild(cl);

    const removed = new Set(build?.removedStoppers || []);
    const two = el('div.two');
    const stp = el('section');
    stp.appendChild(el('h2.h2', { text: 'Stoppers' }));
    stp.appendChild(el('div.track.seg2', { role: 'group' }, [
      el('button.seg.sm' + (removed.size === 0 ? '.on' : ''), { text: 'All', onclick: async () => { await stage.setAllStoppers(true); renderLib(); renderInspector(); } }),
      el('button.seg.sm' + (removed.size > 0 ? '.on' : ''), { text: 'None', onclick: async () => { await stage.setAllStoppers(false); renderLib(); renderInspector(); } }),
    ]));
    const bc = el('section');
    bc.appendChild(el('h2.h2', { text: 'Back cover' }));
    bc.appendChild(el('div.track.seg2', { role: 'group' }, [
      el('button.seg.sm' + (!build?.backCover ? '.on' : ''), { text: 'Off', onclick: async () => { await stage.setBackCover(false); renderLib(); } }),
      el('button.seg.sm' + (build?.backCover ? '.on' : ''), { text: 'On', onclick: async () => { await stage.setBackCover(true); renderLib(); } }),
    ]));
    two.append(stp, bc);
    lib.appendChild(two);

    if (build?.mount === 'tabletop') {
      const ft = el('section');
      ft.appendChild(el('h2.h2', { text: 'Feet' }));
      ft.appendChild(el('div.track.seg2', { role: 'group' }, [
        el('button.seg.sm' + (build.feet !== 'adhesive' ? '.on' : ''), { text: 'Print TPU', onclick: async () => { await stage.setFeet('tpu'); renderLib(); } }),
        el('button.seg.sm' + (build.feet === 'adhesive' ? '.on' : ''), { text: 'Buy adhesive', onclick: async () => { await stage.setFeet('adhesive'); renderLib(); } }),
      ]));
      lib.appendChild(ft);
    }
    const gridable = (build?.placed || []).filter((u) => u.fill === 'decor');
    if (gridable.length) {
      const vals = gridable.map((u) => u.variant === 'gridfinity' ? 'gridfinity' : 'standard');
      const on = vals.every((v) => v === vals[0]) ? vals[0] : null;
      const gv = el('section');
      gv.appendChild(el('h2.h2', { text: 'Decor drawers' }));
      gv.appendChild(el('div.track.seg2', { role: 'group' }, [
        el('button.seg.sm' + (on === 'standard' ? '.on' : ''), { text: 'Standard', onclick: async () => { await stage.setAllVariant('standard'); renderLib(); } }),
        el('button.seg.sm' + (on === 'gridfinity' ? '.on' : ''), { text: 'Gridfinity', onclick: async () => { await stage.setAllVariant('gridfinity'); renderLib(); } }),
      ]));
      lib.appendChild(gv);
    }
  }

  /* ---------------- inspector ---------------- */
  const insp = el('aside.glass.glass-edge', { id: 'ws-insp', 'aria-label': 'This unit only', hidden: true });
  root.appendChild(insp);
  function renderInspector() {
    const sel = st.sel;
    insp.replaceChildren();
    if (!sel) { insp.hidden = true; return; }
    insp.hidden = false;
    const placed = build?.placed || [];
    const unit = sel.owner != null ? placed.find((u) => u.id === sel.owner) : null;
    const idx = unit ? placed.indexOf(unit) + 1 : 0;
    const closeBtn = el('button.x', { title: 'Deselect', 'aria-label': 'Deselect', onclick: () => stage.setSelected(null) }, [icon('x', { size: 16 })]);
    if (!unit) {
      insp.append(
        el('div.head', {}, [el('h2.h2', { text: 'Build part' }), closeBtn]),
        el('div.ident', {}, [el('div.wellbox.well', {}, [icon('stack', { size: 28 })]), el('div.col', {}, [el('h3', { text: sel.label || sel.node }), el('div.src', { text: 'Covers, rails and feet belong to the whole build, not to one unit.' })])]),
      );
      return;
    }
    const fill = (G?.fills || []).find((f) => f.id === unit.fill);
    const cur = stage.currentFaceplateStyle();
    const kind = unit.fill === 'classic' ? 'classicDrawer' : unit.fill === 'shelf' ? 'shelf' : (FACEK[cur?.key] || 'edgelabel');
    const wall = G?.interior || { wWall: 17, hWall: 8 };
    const src = unit.fill === 'decor' ? `${FACE_LABEL[cur?.key] || 'Decor'} faceplate${CLUB[cur?.key] ? ' · ✦ Club' : ''}` : unit.fill === 'classic' ? 'Print-in-place handle' : 'Open shelf';
    const removed = new Set(build?.removedStoppers || []);
    const stopped = !removed.size ? 'All' : 'None';
    insp.append(
      el('div.head', {}, [el('h2.h2', { text: 'This unit only' }), el('span.idx', { text: `Unit ${idx} of ${placed.length}` }), closeBtn]),
      el('div.ident', {}, [
        el('div.wellbox.well', {}, [glyphEl(kind, 79, 50, { ...colors, front: frontFor(unit.fill) })]),   // the SELECTED unit's front, not the palette's unit choice
        el('div.col', {}, [
          el('h3', { text: fill?.label || unit.fill }),
          el('div.dims', { text: `${unit.w}W·${unit.hh / 2}H · inside ${unit.w * 88 - wall.wWall} × ${Math.round((unit.hh / 2) * 56 - wall.hWall)} × ${INSIDE[length] ?? length} mm` }),   // hh is half-rows
          el('div.src', { text: src }),
        ]),
      ]),
    );
    if (unit.fill !== 'shelf') {
      insp.appendChild(el('div.track.seg2', { role: 'group', 'aria-label': 'Type' }, [
        el('button.seg' + (unit.fill === 'classic' ? '.on' : ''), { text: 'Classic drawer', title: 'Per-unit type comes with the Build rules (phase 3)', onclick: soon('Per-unit type', 'the Build rules (phase 3)') }),
        el('button.seg' + (unit.fill === 'decor' ? '.on' : ''), { text: 'Decor drawer', title: 'Per-unit type comes with the Build rules (phase 3)', onclick: soon('Per-unit type', 'the Build rules (phase 3)') }),
      ]));
      insp.appendChild(el('div.row', {}, ['Closure', el('b', {}, [unit.closure === 'magnet' ? 'Magnets' : 'None', el('span', { text: ' (build)' })])]));
      insp.appendChild(el('div.row', {}, ['Stopper', el('b', {}, [stopped, el('span', { text: ' (build)' })])]));
    }
    insp.appendChild(el('div.actions', {}, [
      el('button.key', { text: 'Peek inside', title: 'Opening a unit from here comes with the Build rules (phase 3)', onclick: soon('Peek inside', 'the Build rules (phase 3)') }),
      el('button.key', { text: 'Duplicate', title: 'Comes with the Build rules (phase 3)', onclick: soon('Duplicate', 'the Build rules (phase 3)') }),
      el('button.key.danger', { text: 'Remove', title: 'Comes with the Build rules (phase 3)', onclick: soon('Remove', 'the Build rules (phase 3)') }),
    ]));
  }

  /* ---------------- toolbar + dock ---------------- */
  const tools = el('div', { id: 'ws-tools', role: 'toolbar', 'aria-label': 'View' });
  /* Measure = the W/H/L callouts (the inventory's "Measure | W/H/L in mm + in"). Off until asked: their labels
     are still clamped to the old layout's edges until the stage gets its safe area. */
  const measureBtn = el('button.chip.icon-btn.measure', { title: 'Measure · W/H/L', 'aria-label': 'Measure', 'aria-pressed': 'false', onclick: () => { st.measure = !st.measure; stage.setDims(st.measure); measureBtn.classList.toggle('on', st.measure); measureBtn.setAttribute('aria-pressed', String(st.measure)); document.documentElement.classList.toggle('ws-measure', st.measure); } }, [icon('ruler')]);
  const qualityBtn = el('button.chip.quality', { title: 'Render quality · click to cycle' }, [icon('gauge', { size: 16 }), el('span')]);
  const Q_NAME = { veryhigh: 'Very High', high: 'High', balanced: 'Balanced', fast: 'Fast' };
  const qLabel = () => { qualityBtn.querySelector('span').textContent = `Quality · ${Q_NAME[stage.quality] || stage.quality}`; };
  qualityBtn.addEventListener('click', () => { const keys = Object.keys(stage.QUALITY); const i = keys.indexOf(stage.quality); stage.applyQuality(keys[(i + 1) % keys.length], true); qLabel(); });
  qLabel();
  tools.append(
    el('div.chip.view', { role: 'group', 'aria-label': 'View' }, [el('button.on', { text: '3D', 'aria-pressed': 'true' }), el('button', { text: '2D', disabled: true, title: 'The 2D board comes with the Build rules (phase 3)' })]),
    measureBtn,
    el('button.chip.icon-btn', { title: 'Explode · comes with Assemble (phase 1)', 'aria-label': 'Explode', onclick: soon('Explode', 'Assemble (phase 1)') }, [icon('arrows-out')]),
    el('button.chip.icon-btn', { title: 'Reset view', 'aria-label': 'Reset view', onclick: () => stage.resetView() }, [icon('cube-focus')]),
    qualityBtn,
  );
  root.appendChild(tools);

  const dock = el('footer.glass', { id: 'ws-dock' });
  const dims = () => {
    const s = stage.buildSize?.();
    if (s) return `${Math.round(s.x)} × ${Math.round(s.y)} × ${Math.round(s.z)}`;
    const placed = build?.placed || [];
    const W = Math.max(0, ...placed.map((u) => u.x + u.w)) * 88, H = Math.max(0, ...placed.map((u) => (u.y + u.hh) / 2)) * 56;   // hh and y are half-rows
    return `${W} × ${H} × ${length}`;
  };
  dock.append(
    el('button.status', { title: 'Issues · the issue card comes with the Build rules (phase 3)', onclick: soon('The issue card', 'the Build rules (phase 3)') }, [el('span.dot'), 'Ready to build']),
    el('div.group', {}, [el('span.big', { text: String(build?.placed?.length ?? 0) }), el('span.unit-lbl', { text: 'units' })]),
    el('div.group', {}, [el('span.big', { text: dims() }), el('span.unit-lbl', { text: 'mm' })]),
    el('button.cta', { onclick: soon('The Parts workspace', 'phase 2') }, ['Get parts list', icon('arrow-right', { size: 20 })]),
  );
  root.appendChild(dock);
  root.appendChild(toast);

  const narrow = () => innerWidth < 1280;
  function layout() {
    tools.style.left = (st.collapsed ? 88 + 20 : 304 + 40) + 'px';
    safe();
  }
  /* the canvas bands the panels cover, handed to the stage so the camera frames the free region: the bar, the
     library, the dock always; the inspector only at narrow widths, where it would otherwise hide the model
     (at wide widths the model already fits between the panels, and counting the inspector would move the
     camera on every selection) */
  function safe() {
    const libW = st.collapsed ? 68 + 20 : 304 + 20;
    /* the inspector's band: RESERVED at wide widths whether or not it is up, so a selection never moves the camera
       and a wide build never ends up under it; at narrow widths counted only while it is up, because space is
       scarce there and the library collapses to make room (Sol 01a13226) */
    const inspW = (!narrow() || !insp.hidden) ? 324 + 20 : 0;
    const top = narrow() ? 134 : 90;
    stage.setSafeArea({ left: libW + 8, right: inspW + 8, top, bottom: 118 });
  }
  /* narrow widths: a selection collapses the library to its rail, a deselect (or widening) restores it */
  let autoCollapsed = false;
  function applyNarrow() {
    if (narrow() && st.sel && !st.collapsed) { st.collapsed = true; autoCollapsed = true; }
    else if ((!narrow() || !st.sel) && autoCollapsed) { st.collapsed = false; autoCollapsed = false; }
  }
  addEventListener('resize', () => { applyNarrow(); renderLib(); layout(); });

  /* ---------------- stage ---------------- */
  // the finished build, not the cover: the Build workspace edits what is there
  const steps = stage.manifest?.steps?.length ?? 0;
  if (steps) stage.goTo(steps, { animate: false });
  stage.setDims(false);   // the finished page turns the callouts on; Build starts with them off (see the Measure button)
  renderLib(); layout(); renderInspector();
  document.addEventListener('keydown', (e) => { if (e.key === '\\') root.hidden = !root.hidden; });

  return (sel) => {
    st.sel = sel;
    const was = st.collapsed;
    applyNarrow();
    if (st.collapsed !== was) renderLib();
    renderInspector();
    layout();
  };
}
