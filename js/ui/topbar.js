/* The top bar every workspace shares (the brief §2): the real MODULITH wordmark, the build switcher, the five
   unnumbered workspace tabs, the mount·length and printer chips, the Day/Night toggle, Share. The active tab
   is the mounted workspace; a tab whose workspace exists switches in place through ctx.switchTo, the others
   say which phase brings them. */
import { el } from './dom.js';
import { icon } from './icons.js';

const MOUNT_NAME = { 'under-table': 'Under-Table', tabletop: 'Tabletop', wall: 'Wall Mount' };
const MOUNT_ICON = { 'under-table': 'desk', tabletop: 'table', wall: 'wall' };
export const TABS = [['build', 'Build', 'cube'], ['colors', 'Colors', 'palette'], ['labels', 'Labels', 'tag'], ['parts', 'Parts', 'list-checks'], ['assemble', 'Assemble', 'wrench']];
const PHASE = { colors: 'phase 4', labels: 'phase 5', parts: 'phase 2', assemble: 'phase 1', build: 'phase 0' };   // what a missing workspace says it waits for

/* ctx: { active, setMode, switchTo(ws), has(ws), say, soon, signal } */
export function topbar(stage, ctx) {
  const build = stage.build;
  const length = Number(build?.length || stage.manifest?.collection || 185);
  const name = ctx.kitTitle || stage.manifest?.title || 'Workbench build';
  const top = el('header', { id: 'ws-top' });
  top.append(
    el('a', { id: 'ws-logo', href: 'https://modulith.systems', title: 'MODULITH' }, [el('img', { src: 'img/modulith-logo.svg', alt: 'MODULITH' })]),
    switcher(),
    el('div.spacer'),
    tabs(),
    el('span.badge.preview', { text: 'Preview', title: 'A visual preview over the real scene. Adding, moving and removing units, per-unit type and the 2D board arrive with the Build rules (phase 3).' }),
    el('div.spacer'),
    el('button.chip.chip-btn.mount', { title: 'Mount and length · opens the setup sheet (phase 0, later)', onclick: ctx.soon('The setup sheet', 'the next phase-0 step') }, [
      icon(MOUNT_ICON[build?.mount] || 'table'), el('span.lbl', { text: `${MOUNT_NAME[build?.mount] || 'Tabletop'} · ` }), el('span.mono', { text: String(length) }),
    ]),
    el('button.chip.chip-btn.printer', { title: 'Printer · optional; only greys out sizes that will not fit', onclick: ctx.soon('The printer picker', 'the setup sheet') }, [icon('printer'), el('span', { text: 'Any printer' })]),
    themeToggle(),
    el('button.chip.chip-btn.share', { onclick: share, title: 'Share' }, [icon('share-network'), el('span', { text: 'Share' })]),
  );
  return top;

  function switcher() {
    const wrap = el('div', { id: 'ws-switch' });
    let open = false;
    const btn = el('button.chip.chip-btn.strong', { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, [icon('folder-simple'), el('span', { text: name }), icon('caret-down', { size: 16 })]);
    const menu = el('div.menu.glass', { role: 'menu', hidden: true });
    menu.append(
      el('div.label', { text: 'Current build' }),
      el('button.item.current', { role: 'menuitem' }, [el('span', { text: name }), el('span.meta', { text: `${length} · ${build?.placed?.length ?? 0} units` })]),
      el('div.divider'),
      el('div.label', { text: 'Recent builds' }),
      el('div.meta', { text: 'Autosaved in this browser · arrives with the build store', style: 'padding:4px 10px 8px' }),
      el('div.divider'),
      el('button.item', { role: 'menuitem', onclick: () => { set(false); share(); } }, [el('span', { text: 'Share link' }), icon('share-network', { size: 16 })]),
      ...[['Rename', 'the build store'], ['Duplicate', 'the build store'], ['Save build file', 'the build store'], ['Load build file', 'the build store'], ['New build', 'the setup sheet']]
        .map(([t, when]) => el('button.item', { role: 'menuitem', disabled: true, title: `${t} comes with ${when}` }, [el('span', { text: t })])),
    );
    const set = (v) => { open = v; menu.hidden = !v; btn.setAttribute('aria-expanded', String(v)); };
    btn.addEventListener('click', () => set(!open));
    document.addEventListener('pointerdown', (e) => { if (open && !wrap.contains(e.target)) set(false); }, { signal: ctx.signal });
    wrap.append(btn, menu);
    return wrap;
  }
  function tabs() {
    const nav = el('nav.chip', { id: 'ws-tabs', 'aria-label': 'Workspaces' });
    const badges = (typeof ctx.badges === 'function' ? ctx.badges() : ctx.badges) || {};
    for (const [id, label, ic] of TABS) {
      const on = id === ctx.active;
      const onclick = on ? null : ctx.has(id) ? () => ctx.switchTo(id) : ctx.soon(`The ${label} workspace`, PHASE[id]);
      nav.appendChild(el('button.tab' + (on ? '.on' : ''), { 'aria-current': on ? 'page' : null, title: on || ctx.has(id) ? null : `${label} comes in ${PHASE[id]}`, onclick },
        [icon(ic, { fill: on }), el('span', { text: label }), badges[id] != null ? el('span.badge', { text: String(badges[id]) }) : null]));
    }
    return nav;
  }
  function themeToggle() {
    const g = el('div.chip', { id: 'ws-theme', role: 'group', 'aria-label': 'Day Grid or Night Grid' });
    const mk = (mode, ic, label) => el('button', { title: label, 'aria-label': label, onclick: () => { ctx.setMode(mode, stage); sync(); } }, [icon(ic)]);
    const sun = mk('light', 'sun', 'Day Grid'), moon = mk('dark', 'moon', 'Night Grid');
    const sync = () => { const m = document.documentElement.dataset.mode; sun.classList.toggle('on', m === 'light'); moon.classList.toggle('on', m === 'dark'); sun.setAttribute('aria-pressed', String(m === 'light')); moon.setAttribute('aria-pressed', String(m === 'dark')); };
    g.append(sun, moon); sync();
    return g;
  }
  async function share() {
    try { await navigator.clipboard.writeText(location.href); ctx.say('Link copied.'); }
    catch { ctx.say('Copy the address bar to share this build.'); }
  }
}
