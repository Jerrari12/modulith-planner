/* The top bar every workspace shares (the brief §2): the real MODULITH wordmark, the build switcher, the five
   unnumbered workspace tabs, the mount·length and printer chips, the Day/Night toggle, Share. The active tab
   is the mounted workspace; a tab whose workspace exists switches in place through ctx.switchTo, the others
   say which phase brings them. */
import { el } from './dom.js';
import { icon } from './icons.js';

const MOUNT_NAME = { 'under-table': 'Under-Table', tabletop: 'Tabletop', wall: 'Wall Mount' };
const MOUNT_ICON = { 'under-table': 'desk', tabletop: 'table', wall: 'wall' };
export const TABS = [['build', 'Build', 'cube'], ['colors', 'Colors', 'palette'], ['labels', 'Labels', 'tag'], ['parts', 'Parts', 'list-checks'], ['assemble', 'Assemble', 'wrench']];
const printerName = (s) => { const id = s?.printer || 'any'; if (id === 'any') return 'Any printer'; if (id === 'custom') return s.customBed?.x ? `Custom ${s.customBed.x}×${s.customBed.y}` : 'Custom bed'; const p = ((typeof GEN2 !== 'undefined' ? GEN2 : null)?.printers || []).find((q) => q.id === id); return p ? p.label.split(' / ')[0] : 'Printer'; };
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
    el('button.chip.chip-btn.mount', { title: 'Mount and length · opens the setup sheet', onclick: ctx.openSetup ? () => ctx.openSetup('mount') : ctx.soon('The setup sheet', 'the next phase-0 step') }, [
      icon(MOUNT_ICON[build?.mount] || 'table'), el('span.lbl', { text: `${MOUNT_NAME[build?.mount] || 'Tabletop'} · ` }), el('span.mono', { text: String(length) }),
    ]),
    el('button.chip.chip-btn.printer', { title: 'Printer · optional; only greys out sizes that will not fit', onclick: ctx.openSetup ? () => ctx.openSetup('printer') : ctx.soon('The printer picker', 'the setup sheet') }, [icon('printer'), el('span', { text: printerName(ctx.store?.state) })]),
    themeToggle(),
    el('button.chip.chip-btn.share', { onclick: share, title: 'Share' }, [icon('share-network'), el('span', { text: 'Share' })]),
  );
  return top;

  function switcher() {
    const wrap = el('div', { id: 'ws-switch' });
    const B = ctx.builds;
    let open = false, renaming = false, confirmId = null;
    const nameEl = el('span', { text: B ? B.name : name });
    const btn = el('button.chip.chip-btn.strong', { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, [icon('folder-simple'), nameEl, icon('caret-down', { size: 16 })]);
    const menu = el('div.menu.glass', { role: 'menu', hidden: true });
    const fileIn = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    fileIn.addEventListener('change', async () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (!f || !B) return; const problem = await B.loadFile(f); if (problem === 'cap') { await render(); } else if (problem) ctx.say(problem); });
    const when = (ts) => { const d = Date.now() - ts; if (d < 60e3) return 'just now'; if (d < 3600e3) return `${Math.round(d / 60e3)} min ago`; if (d < 86400e3) return `${Math.round(d / 3600e3)} h ago`; return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
    const units = build?.placed?.length ?? 0;
    const item = (text, onclick, title = null) => el('button.item', { role: 'menuitem', title, onclick }, [el('span', { text })]);
    async function render() {
      const list = B ? await B.list() : [];
      const cur = B ? B.entry : null;
      const cap = B ? B.capPending : null;
      const others = list.filter((e) => !cur || e.id !== cur.id);
      menu.replaceChildren(...[
        el('div.label', { text: 'Current build' }),
        renaming ? (() => { const inp = el('input.rename', { type: 'text', maxlength: '60', value: B.name, 'aria-label': 'Build name', autocomplete: 'off' });
          const done = async () => { const v = inp.value; renaming = false; if (await B.rename(v)) { nameEl.textContent = B.name; ctx.say('Renamed.'); } await render(); };
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') { e.stopPropagation(); renaming = false; render(); } });
          const row = el('div.renamerow', {}, [inp, el('button.key.sm', { text: 'Save', onclick: done })]); setTimeout(() => { inp.focus(); inp.select(); }, 0); return row; })()
          : el('button.item.current', { role: 'menuitem', title: 'Rename', onclick: () => { renaming = true; render(); } }, [el('span', { text: B ? B.name : name }), el('span.meta', { text: `${length} · ${units} units` })]),
        el('div.divider'),
        el('div.label', { text: 'Recent builds' }),
        cap ? el('div.notice', {}, [el('p', { text: `Recent builds is full (20). “${cap.drop.name}”, opened longest ago, would be dropped to make room for this one.` }),
          el('div.row', {}, [el('button.key.sm', { text: 'Save it as a file', onclick: () => B.capSave() }), el('button.key.sm', { text: 'Drop it', onclick: () => B.capDrop() }), el('button.key.sm', { text: 'Not now', onclick: () => { B.capKeep(); render(); } })])]) : null,
        ...others.map((e) => confirmId === e.id
          ? el('div.item.confirm', {}, [el('span', { text: `Delete “${e.name}”?` }), el('button.key.sm', { text: 'Delete', onclick: async () => { confirmId = null; await B.remove(e.id); ctx.say('Build deleted.'); render(); } }), el('button.key.sm', { text: 'Keep', onclick: () => { confirmId = null; render(); } })])
          : el('div.item.recent', {}, [
            el('button.open', { role: 'menuitem', title: 'Open this build', onclick: () => B.open(e.id) }, [el('span', { text: e.name }), el('span.meta', { text: `${e.length} · ${e.units} ${e.units === 1 ? 'unit' : 'units'} · ${when(e.savedAt)}` })]),
            el('button.x', { title: 'Delete build', 'aria-label': `Delete ${e.name}`, onclick: () => { confirmId = e.id; render(); } }, [icon('x', { size: 14 })]),
          ])),
        others.length ? null : el('div.meta', { text: cur ? 'Other builds you open or start appear here.' : 'This build joins the list at its first change.', style: 'padding:4px 10px 8px' }),
        el('div.meta', { text: 'Autosaved in this browser · save a file or copy a link for builds that matter', style: 'padding:2px 10px 8px' }),
        el('div.divider'),
        el('button.item', { role: 'menuitem', onclick: () => { set(false); share(); } }, [el('span', { text: 'Share link' }), icon('share-network', { size: 16 })]),
        item('Rename', () => { renaming = true; render(); }),
        item('Duplicate', async () => { set(false); if (B && !(await B.duplicate())) { set(true); render(); } }, 'A copy of this build, with its colours, as a new Recent build'),
        item('Save build file', () => { set(false); B && B.saveFile(); }, 'A .json file of this build; Load build file opens it anywhere'),
        item('Load build file…', () => fileIn.click(), 'A build saved from this planner or the old one, or an official kit file'),
        item('New build', () => { set(false); B && B.newBuild(); }, 'A fresh copy of this kit; this build stays in Recent builds (the setup sheet for mount, length and printer comes later)'),
      ].filter(Boolean));   // replaceChildren would print a null as the word
    }
    const set = (v) => { open = v; menu.hidden = !v; btn.setAttribute('aria-expanded', String(v)); if (v) render(); else { renaming = false; confirmId = null; } };
    btn.addEventListener('click', () => set(!open));
    document.addEventListener('pointerdown', (e) => { if (open && !wrap.contains(e.target)) set(false); }, { signal: ctx.signal });
    wrap.append(btn, menu, fileIn);
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
