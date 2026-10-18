/* THE SETUP SHEET (the spec §0's setup flow): mount, length and printer with the live fit line, and the build's name. New
   build lands here on a fresh kit page; the top bar's Mount · Length and Printer chips reopen it at that step. Mount and
   length decide the scene the stage builds at boot (the table, the wall, the rails), so applying them writes the record
   and reloads the page on it - the one boot path the switcher uses too; a printer or name change applies in place. */
import { el, trapTab } from './dom.js';
import { icon } from './icons.js';
import { layoutRules } from '../rules/layout.js';

// eslint-disable-next-line no-undef
const G = typeof GEN2 !== 'undefined' ? GEN2 : null;   // the planner's catalog: a classic-script LEXICAL global, not a globalThis property
const MOUNT_NOTE = { 'under-table': 'Needs wood screws', tabletop: 'No tools', wall: 'Needs wood screws · anchors on drywall' };
const MOUNT_ICON = { 'under-table': 'desk', tabletop: 'table', wall: 'wall' };
const LENGTH_NAME = (l) => (l.tagline || '').split(' · ')[0] || '';
const LENGTH_INSIDE = (l) => ((l.tagline || '').match(/(\d+)mm inside/) || [])[1] || null;
const LENGTH_USE = (l) => (l.tagline || '').split(' · ').slice(2).join(' · ');
const UNIT_W = G?.units?.widthMM || 88;

/* the bed a printer choice means: null = any printer */
export function bedOf(printer, customBed) {
  if (!printer || printer === 'any') return null;
  if (printer === 'custom') { const x = Number(customBed?.x), y = Number(customBed?.y); return x > 0 && y > 0 ? { x, y } : null; }
  const p = (G?.printers || []).find((q) => q.id === printer);
  return p && p.x ? { x: p.x, y: p.y } : null;
}
/* the widest case that prints at this length on this bed (0 = not even 1W); any printer = 4 */
export function maxW(len, bed) {
  if (!bed) return 4;
  for (let k = 4; k >= 1; k--) if ((k * UNIT_W <= bed.x && len <= bed.y) || (k * UNIT_W <= bed.y && len <= bed.x)) return k;
  return 0;
}
export function fitLine(len, printer, customBed) {
  const bed = bedOf(printer, customBed);
  if (!bed) return 'Any printer · every size is available; pick a printer only to grey out sizes that won’t fit.';
  const k = maxW(len, bed);
  return k ? `Bed ${bed.x}×${bed.y} · at ${len} mm you can print cases up to ${k}W.` : `Bed ${bed.x}×${bed.y} · a ${len} mm case won’t fit this bed even at 1W. Pick a shorter length or another printer.`;
}
/* the units of a record that are not in another length's lineup */
export function strandedAt(record, len) {
  try { const R = layoutRules({ ...record, length: len }, G); return (record.placed || []).filter((p) => !R.sizeExists(p.w, p.hh / 2, p.fill)); } catch { return []; }
}
/* a fresh build's one starter unit: the first drawer size this lineup has, so the model is never empty */
export function starterUnit(record) {
  const R = layoutRules(record, G);
  for (const [w, h] of [[2, 1], [1, 1], [2, 0.5], [1, 0.5], [3, 1]]) if (R.sizeExists(w, h, 'decor')) return { id: 1, x: 0, y: 0, w, hh: h * 2, fill: 'decor', shelves: 0 };
  return { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0 };
}

/* ctx: { store, builds, say }; opts: { step: 'mount' | 'length' | 'printer', fresh: boolean } */
export function openSetup(stage, ctx, { step = 'mount', fresh = false } = {}) {
  const store = ctx.store;
  const s0 = store.state;
  const draft = { name: ctx.builds ? ctx.builds.name : '', mount: s0.mount || 'tabletop', length: Number(s0.length) || 185, printer: s0.printer || 'any', customBed: { x: s0.customBed?.x || '', y: s0.customBed?.y || '' }, spaceW: s0.spaceW || '', spaceH: s0.spaceH || '' };
  const STEPS = ['mount', 'length', 'printer'];
  let cur = STEPS.includes(step) ? step : 'mount';
  const prev = document.getElementById('ws-setup'); if (prev) prev.remove();
  const veil = el('div', { id: 'ws-setup', role: 'dialog', 'aria-modal': 'true', 'aria-label': fresh ? 'Set up your build' : 'Build setup' });
  const box = el('div.glass.sheet');
  veil.appendChild(box);
  (document.getElementById('ws') || document.body).appendChild(veil);   // inside the workspace root: the glass rules are scoped to #ws, and its children take pointer events
  const ret = document.activeElement;   // where focus goes back to when the sheet closes
  const close = () => { veil.remove(); document.removeEventListener('keydown', onKey); if (ret && typeof ret.focus === 'function' && document.contains(ret)) { try { ret.focus(); } catch { /* gone */ } } };
  trapTab(veil, box);
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey);
  veil.addEventListener('click', (e) => { if (e.target === veil && !fresh) close(); });

  const mountDef = (id) => (G?.mounts || []).find((m) => m.id === id);
  const blocked = (len) => draft.mount === 'tabletop' && !!(G?.lengths || []).find((l) => l.id === len)?.noTabletop;
  const stranded = () => (fresh ? [] : strandedAt(s0, draft.length));
  const changesScene = () => fresh || draft.mount !== s0.mount || draft.length !== Number(s0.length);

  function render() {
    box.replaceChildren();
    box.appendChild(el('div.head', {}, [
      el('div', {}, [el('h2', { text: fresh ? 'Set up your build' : 'Build setup' }), el('p.sub', { text: fresh ? 'Three choices, then the drawers.' : 'Mount and length rebuild the scene; the printer only greys out sizes that won’t fit.' })]),
      fresh ? null : el('button.x', { title: 'Close', 'aria-label': 'Close', onclick: close }, [icon('x', { size: 18 })]),
    ]));
    const nameIn = el('input.name', { type: 'text', maxlength: '60', value: draft.name, placeholder: 'Build name · e.g. Garage bench', 'aria-label': 'Build name', autocomplete: 'off' });
    nameIn.addEventListener('input', () => { draft.name = nameIn.value; });
    box.appendChild(el('label.namerow', {}, [el('span', { text: 'Name' }), nameIn]));
    // the steps
    const bed = bedOf(draft.printer, draft.customBed);
    const pr = (G?.printers || []).find((p) => p.id === draft.printer);
    const stepVal = { mount: mountDef(draft.mount)?.label || draft.mount, length: `${draft.length} mm`, printer: draft.printer === 'any' ? 'Optional' : draft.printer === 'custom' ? (bed ? `Custom ${bed.x}×${bed.y}` : 'Custom bed') : (pr?.label || '').split(' / ')[0] };
    box.appendChild(el('div.track.steps', { role: 'tablist' }, STEPS.map((id, i) => el('button.seg' + (cur === id ? '.on' : ''), { role: 'tab', 'aria-selected': String(cur === id), onclick: () => { cur = id; render(); } }, [el('b', { text: `${i + 1} · ${id === 'mount' ? 'Mount' : id === 'length' ? 'Length' : 'Printer'}` }), el('span', { text: stepVal[id] })]))));
    const body = el('div.body');
    if (cur === 'mount') {
      body.appendChild(el('div.cards.mounts', { role: 'group', 'aria-label': 'Mount' }, (G?.mounts || []).map((m) => el('button.card' + (draft.mount === m.id ? '.on' : ''), { 'aria-pressed': String(draft.mount === m.id), onclick: () => { if (m.id !== draft.mount) { draft.spaceW = ''; draft.spaceH = ''; } draft.mount = m.id; if (blocked(draft.length)) draft.length = 185; render(); } }, [   // a workable area belongs to the mount it was typed for (Terra 01a13595)
        el('span.ico', {}, [icon(MOUNT_ICON[m.id] || 'table', { size: 28 })]), el('b', { text: m.label }), el('span.blurb', { text: (m.blurb || '').split('. ')[0].replace(/\.$/, '') }), el('span.note', { text: MOUNT_NOTE[m.id] || '' }),
      ]))));
      const m = mountDef(draft.mount);
      if (m?.askSpace) {
        const num = (key, label) => { const i = el('input', { type: 'number', min: '0', step: '10', value: draft[key] || '', placeholder: 'optional', 'aria-label': label }); i.addEventListener('input', () => { draft[key] = i.value; }); return el('label.num', {}, [el('span', { text: label }), i, el('span.unit', { text: 'mm' })]); };
        body.appendChild(el('div.space', {}, [el('p.hint', { text: `Workable area · ${m.spaceHint} The grid can’t outgrow it.` }), el('div.row', {}, [num('spaceW', 'Width'), num('spaceH', 'Height')])]));
      }
      body.appendChild(el('p.tip', { text: m?.planTip || '' }));
    } else if (cur === 'length') {
      body.appendChild(el('div.cards.lengths', { role: 'group', 'aria-label': 'Length' }, (G?.lengths || []).map((l) => {
        const noTab = blocked(l.id), k = maxW(l.id, bed), fits = k >= 1, dis = noTab || !fits;
        const badge = noTab ? 'NO TABLETOP' : !fits ? 'WON’T FIT' : l.id === 185 ? 'RECOMMENDED' : '';
        const lost = fresh ? 0 : strandedAt(s0, l.id).length;
        return el('button.card.len' + (draft.length === l.id ? '.on' : '') + (dis ? '.dis' : ''), { 'aria-pressed': String(draft.length === l.id), 'aria-disabled': dis ? 'true' : null, title: noTab ? l.noTabletop : !fits ? `Even a 1W case won’t fit your bed at ${l.id} mm.` : null, onclick: () => { if (dis) { ctx.say(noTab ? '59 is too shallow for a Tabletop build · use Under-Table or Wall.' : `Even a 1W case won’t fit your bed at ${l.id} mm.`); return; } draft.length = l.id; render(); } }, [
          el('span.stripe', { style: `background:${l.color}` }), el('div.lrow', {}, [el('b', { text: `${l.label} mm` }), badge ? el('span.badge' + (badge === 'RECOMMENDED' ? '.rec' : '.warn'), { text: badge }) : null]),
          el('span.lname', { text: LENGTH_NAME(l) + (LENGTH_INSIDE(l) ? ` · ${LENGTH_INSIDE(l)} mm inside` : '') }), el('span.use', { text: LENGTH_USE(l) }),
          lost ? el('span.lost', { text: `${lost} of your ${s0.placed.length} units aren’t in this lineup` }) : null,
        ]);
      })));
    } else {
      const sel = el('select.printer', { 'aria-label': 'Printer' });
      const groups = new Map();
      for (const p of G?.printers || []) { const g = p.group || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }
      for (const [g, list] of groups) {
        const opts = list.map((p) => el('option', { value: p.id, text: p.x ? `${p.label} (${p.x}×${p.y})` : p.label }));
        if (g) sel.appendChild(el('optgroup', { label: g }, opts)); else for (const o of opts) sel.appendChild(o);
      }
      sel.appendChild(el('option', { value: 'custom', text: 'Custom bed size…' }));
      sel.value = draft.printer;
      sel.addEventListener('change', () => { draft.printer = sel.value; render(); });
      body.appendChild(el('label.selrow', {}, [el('span', { text: 'Printer' }), sel]));
      if (draft.printer === 'custom') {
        const num = (key) => { const i = el('input', { type: 'number', min: '50', max: '2000', step: '1', value: draft.customBed[key], placeholder: key.toUpperCase(), 'aria-label': `Bed ${key.toUpperCase()}` }); i.addEventListener('input', () => { draft.customBed[key] = i.value; fit.textContent = fitLine(draft.length, draft.printer, draft.customBed); }); return i; };
        body.appendChild(el('div.row.bed', {}, [el('span', { text: 'Bed' }), num('x'), el('span', { text: '×' }), num('y'), el('span.unit', { text: 'mm' })]));
      }
      body.appendChild(el('p.hint', { text: 'Optional. A printer only greys out the sizes that won’t fit its bed; the top-bar chip shows your choice.' }));
    }
    box.appendChild(body);
    const fit = el('p.fit', { text: fitLine(draft.length, draft.printer, draft.customBed) });
    const lost = stranded();
    const i = STEPS.indexOf(cur);
    box.appendChild(el('div.foot', {}, [
      fit,
      lost.length ? el('p.warn', { text: `${lost.length} of your units aren’t in the ${draft.length} lineup: they stay on the board flagged until you swap them.` }) : null,
      el('div.btns', {}, [
        i > 0 ? el('button.key', { text: 'Back', onclick: () => { cur = STEPS[i - 1]; render(); } }) : null,
        i < STEPS.length - 1 ? el('button.key', { text: 'Next', onclick: () => { cur = STEPS[i + 1]; render(); } }) : null,
        el('span.spacer'),
        el('button.cta', { onclick: apply }, [fresh ? 'Start build' : changesScene() ? 'Apply and rebuild' : 'Apply', icon('arrow-right', { size: 18 })]),
      ]),
    ]));
  }
  async function apply() {
    if (blocked(draft.length)) { cur = 'length'; render(); ctx.say('59 is too shallow for a Tabletop build.'); return; }
    const bed = bedOf(draft.printer, draft.customBed);
    if (draft.printer === 'custom' && !bed) { cur = 'printer'; render(); ctx.say('Type both bed sizes, or pick Any printer.'); return; }
    const sceneChange = changesScene();
    store.flush();
    store.commit((s, R) => {
      s.printer = draft.printer;
      s.customBed = draft.printer === 'custom' ? { x: Number(draft.customBed.x), y: Number(draft.customBed.y) } : null;
      const asks = !!mountDef(draft.mount)?.askSpace;
      s.spaceW = asks && draft.spaceW ? Number(draft.spaceW) : null;
      s.spaceH = asks && draft.spaceH ? Number(draft.spaceH) : null;
      s.length = draft.length;
      if (fresh) { s.placed = [starterUnit({ ...s, mount: draft.mount })]; s.nextId = 2; delete s.labelList; delete s.labelAssign; }
      if (R.setMount) R.setMount(draft.mount); else s.mount = draft.mount;
      // the starter sits on its mount's edge. setMount rebases only on a CHANGE of mount, and a fresh Tabletop build from a
      // Tabletop kit is not one. The stress test, 2026-10-15: the starter stayed at the top, syncTabletopGrid grew the grid
      // under it, and the page stopped on "A unit is floating", with no way back
      if (fresh && R.rebaseToMountEdge) R.rebaseToMountEdge();
      if (R.clampGrid) R.clampGrid();
      if (R.syncTabletopGrid) R.syncTabletopGrid();
    }, 'setup');
    store.flush();
    if (ctx.builds && draft.name.trim()) await ctx.builds.rename(draft.name);
    close();
    if (sceneChange) { ctx.say('Rebuilding the scene…'); setTimeout(() => location.reload(), 200); }
    else { if (ctx.remount) ctx.remount(); ctx.say('Setup applied.'); }   // the top bar's chips are built at mount: a printer or name change shows after a remount
  }
  render();
  // focus moves into the dialog: the name field on a desktop; on a phone the first button, since a focused field raises the
  // keyboard over the sheet before anything was asked for (Joey, 2026-10-18, tapping the mount chip on his phone)
  const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 1023px)').matches;   // (none under jsdom: Terra 01a15096)
  setTimeout(() => { try { ((phone ? null : box.querySelector('input.name')) || box.querySelector('button')).focus(); } catch { /* jsdom */ } }, 0);
  return { close };
}
