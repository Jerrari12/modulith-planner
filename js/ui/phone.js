/* The phone chrome (the brief §2: "Below 1024 px, panels become bottom sheets and the tabs move to a bottom bar").
   One bottom tab bar for the five workspaces, and a sheet manager that turns a workspace's panels into bottom
   sheets with a grab handle: collapsed, a sheet shows its handle (and a one-line peek the workspace supplies);
   open, it rises to just over half the screen and scrolls inside. Only one sheet is open at a time, so contextual
   panels never pile up over the model (Astra), and a workspace can keep a sheet closed while the visitor is busy
   on the model (Joey's phone finding, 2026-10-11: placing must not open the unit's sheet over the next spot). */
import { el } from './dom.js';
import { icon } from './icons.js';
import { TABS } from './topbar.js';

export const PHONE_MAX = 1023;
export const isPhone = () => innerWidth <= PHONE_MAX;
const TABBAR = 64, DOCK = 56, HANDLE = 44;
/* THE PHONE ON ITS SIDE (Joey 2026-10-27; app.css, the same query): the tabs a rail down the left, the bar and the tools
   one row (ROW: its bottom and 8 px), the sheets, the dock and the Assemble player a column on the right, at most SIDE_MAX
   or 44 % of the width (app.css --side). The sheets stack over the dock as in portrait; the stage keeps what is between */
export const SIDE_MQ = '(max-width: 1023px) and (orientation: landscape) and (max-height: 500px)';
export const isSideways = () => matchMedia(SIDE_MQ).matches;
const ROW = 62, SIDE_MAX = 340;
const sideWidth = () => Math.min(SIDE_MAX, innerWidth * 0.44);

/* ctx: { active, has, switchTo, badges, soon }; panels: [{ el, title, peek?() -> node | string | null, open?: boolean, close?() }];
   dock: the height of whatever sits on the bar (the dock by default; Assemble passes its player's live height) */
export function phoneChrome(root, ctx, { panels = [], dock = DOCK } = {}) {
  const dockH = () => Math.max(0, Math.round(typeof dock === 'function' ? dock() : dock));
  // on its side, read off the dock (or the player) itself: it sits 8 px up plus the screen's bottom inset (app.css), which
  // the script cannot know (Sol 01a17da4: an iPhone's 21 px would put the sheets over it)
  const floorTop = () => { const f = [...root.querySelectorAll('#ws-dock, #ws-player')].find((e) => !e.hidden && e.getClientRects().length); return f ? Math.round(innerHeight - f.getBoundingClientRect().top) : 8 + dockH(); };
  const base = () => (isSideways() ? floorTop() : TABBAR + dockH()) + 6;   // where the lowest sheet's bottom edge sits
  const openHeight = () => isSideways() ? Math.max(88, innerHeight - base() - ROW) : Math.max(160, Math.min(Math.round(innerHeight * 0.56), innerHeight - base() - 110));
  const badges = (typeof ctx.badges === 'function' ? ctx.badges() : ctx.badges) || {};
  const bar = el('nav.glass', { id: 'ws-tabbar', 'aria-label': 'Workspaces' });
  for (const [id, label, ic] of TABS) {
    const on = id === ctx.active;
    bar.appendChild(el('button.tab' + (on ? '.on' : ''), { 'aria-current': on ? 'page' : null, onclick: on ? null : ctx.has(id) ? () => ctx.switchTo(id) : ctx.soon(`The ${label} workspace`, 'a later phase') },
      [icon(ic, { fill: on, size: 22 }), el('span', { text: label }), badges[id] != null ? el('span.badge', { text: String(badges[id]) }) : null]));
  }
  root.appendChild(bar);
  const sheets = new Map();   // el -> { handle, title, peek, open }
  let current = null;
  function render(entry) {
    const { el: panel, handle, peek } = entry;
    // a sheet that can be closed (spec.close) carries its × here, on the handle, so its own title row can go (app.css)
    const x = entry.close ? el('button.hx', { title: 'Close', 'aria-label': `Close ${typeof entry.title === 'function' ? entry.title() : entry.title}`, onclick: (e) => { e.stopPropagation(); entry.close(); } }, [icon('x', { size: 16 })]) : null;
    handle.replaceChildren(...[el('span.grab'), el('span.ttl', { text: typeof entry.title === 'function' ? entry.title() : entry.title }), x, el('span.chev', {}, [icon(entry.open ? 'caret-down' : 'caret-up', { size: 16 })])].filter(Boolean));
    const p = peek ? peek() : null;
    const peekEl = panel.querySelector(':scope > .sheet-peek');
    if (p && !entry.open) { if (peekEl) peekEl.replaceChildren(typeof p === 'string' ? el('span', { text: p }) : p); else panel.insertBefore(el('div.sheet-peek', {}, [typeof p === 'string' ? el('span', { text: p }) : p]), handle.nextSibling); }
    else if (peekEl) peekEl.remove();
    panel.classList.toggle('open', !!entry.open);
    panel.style.setProperty('--peek', (HANDLE + (p && !entry.open ? 40 : 0)) + 'px');
  }
  /* collapsed sheets take their own slots, stacked above the dock in panel order, so every handle stays reachable
     (Sol 01a13367); an open sheet rises from the dock over them */
  const collapsedHeight = (e) => HANDLE + (e.peek && e.peek() ? 40 : 0);
  function stack() {
    let off = 0; const b = base();
    // on its side, with under 160 px left above the dock (the S23's 260 px tall screen), an open sheet takes the whole
    // column, over the dock (11 under the sheet's 13); collapsed, the dock is back
    const over = isSideways() && innerHeight - b - ROW < 160;
    for (const e of sheets.values()) {
      if (e.el.hidden) continue;
      if (e.open) { e.el.style.bottom = over ? 'calc(8px + env(safe-area-inset-bottom, 0px))' : `${b}px`; e.el.style.maxHeight = over ? `calc(${innerHeight - 8 - ROW}px - env(safe-area-inset-bottom, 0px))` : `${openHeight()}px`; continue; }
      e.el.style.maxHeight = '';
      e.el.style.bottom = `${b + off}px`;
      off += collapsedHeight(e);
    }
    // the top edge of the collapsed handles: the floating cards (Place / Cancel, the issue card...) and the toast sit on
    // it, not under it (the phone check, 2026-10-17: Place / Cancel and every toast were under the Library's handle)
    root.style.setProperty('--sheet-stack', `${b + off}px`);
    // an open sheet covers the collapsed handles (and, over, the dock): its glass showed their words through it (the phone
    // tour, 2026-10-27: "Add units" under the unit's sheet, "Layout valid" under the Labels sheet), so they step out
    const anyOpen = [...sheets.values()].some((e) => e.open && !e.el.hidden);
    root.classList.toggle('sheet-open', anyOpen);
    root.classList.toggle('sheet-over', anyOpen && over);
    // on its side the tools start where the bar ends (app.css), whatever the build name and the mount chip make of it
    const t = isSideways() && document.getElementById('ws-top');
    if (t) root.style.setProperty('--top-r', `${Math.round(t.getBoundingClientRect().right)}px`);
  }
  function open(panel, on = true) {
    const entry = sheets.get(panel); if (!entry) return;
    if (on) for (const e of sheets.values()) if (e !== entry && e.open) { e.open = false; render(e); }
    entry.open = !!on; current = on ? panel : (current === panel ? null : current);
    render(entry); stack();
    if (onLayout) onLayout();
  }
  for (const spec of panels) {
    const panel = spec.el;
    panel.classList.add('sheet');
    const handle = el('div.sheet-handle', { role: 'button', tabindex: '0', 'aria-label': `${typeof spec.title === 'function' ? spec.title() : spec.title} · open or close` });
    // a tap toggles; a swipe on the handle decides the direction (down collapses, up opens) and swallows the click
    // that follows it (Sol 01a13367)
    let y0 = null, swiped = false;
    handle.addEventListener('click', () => { if (swiped) { swiped = false; return; } open(panel, !sheets.get(panel).open); });
    // a key on a control inside the handle (the ×) is that control's: here it would be cancelled and toggle the sheet
    // instead (Sol 01a17d29)
    handle.addEventListener('keydown', (e) => { if (e.target !== handle) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(panel, !sheets.get(panel).open); } });
    handle.addEventListener('pointerdown', (e) => { y0 = e.clientY; swiped = false; });
    handle.addEventListener('pointerup', (e) => { if (y0 == null) return; const d = e.clientY - y0; y0 = null; if (d > 24) { swiped = true; open(panel, false); } else if (d < -24) { swiped = true; open(panel, true); } });
    panel.prepend(handle);
    // a workspace re-renders its panel with replaceChildren(): the handle comes back on top every time
    const mo = new MutationObserver(() => { if (panel.firstChild !== handle) { panel.prepend(handle); render(sheets.get(panel)); } });
    mo.observe(panel, { childList: true });
    const entry = { el: panel, handle, title: spec.title, peek: spec.peek || null, close: spec.close || null, open: !!spec.open, mo };
    sheets.set(panel, entry);
    render(entry);
    if (entry.open) current = panel;
  }
  stack();
  let onLayout = null;
  return {
    bar,
    open: (panel) => open(panel, true),
    collapse: (panel) => { if (panel) open(panel, false); else for (const p of sheets.keys()) open(p, false); },
    isOpen: (panel) => !!sheets.get(panel)?.open,
    refresh: () => { for (const e of sheets.values()) render(e); stack(); },
    /* the stage's safe area under the chrome: the tallest visible sheet (collapsed = its handle and peek), the dock, the bar;
       on its side the column takes the right instead, the rail the left, and the bottom is the stage's own */
    bottom: () => { stack(); if (isSideways()) return 8; const vis = [...sheets.values()].filter((e) => !e.el.hidden); const openOne = vis.find((e) => e.open); return base() + (openOne ? openHeight() : vis.reduce((n, e) => n + collapsedHeight(e), 0)); },
    top: () => (isSideways() ? ROW : 110),
    left: () => (isSideways() ? Math.round(bar.getBoundingClientRect().width) + 8 : 8),
    right: () => (isSideways() ? Math.round(sideWidth()) + 8 : 8),
    onLayout: (fn) => { onLayout = fn; },
    destroy() { bar.remove(); root.classList.remove('sheet-open', 'sheet-over'); for (const e of sheets.values()) { e.mo.disconnect(); e.handle.remove(); e.el.querySelector(':scope > .sheet-peek')?.remove(); e.el.classList.remove('sheet', 'open'); e.el.style.bottom = ''; e.el.style.maxHeight = ''; } sheets.clear(); },
  };
}
