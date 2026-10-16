/* The Parts workspace - phase 2. The viewer's checklist and the planner's parts list become one list, with the
 * quantities from the planner's own bill of materials ported by copy (js/rules/bom.js, parity-gated against the
 * live planner). Layout per the v4 artboard: a 440 px list panel (header with the counts, availability, the
 * download-site switch and Track my build, the exports row; grouped rows with a colour chip, quantity, name,
 * note, badge and link), the Inspector as "This unit · parts", the Dock with a progress bar and "Start assembly".
 *
 * Progress semantics (Astra, 2026-10-13), kept as four separate numbers per row and never conflated with the
 * Assemble player's position: what the plan REQUIRES (qty), what the owner confirms they already HAD, what they
 * have PRINTED or BOUGHT toward this plan, and what REMAINS (required - had - made, never below 0). Stored per
 * build id, not per part name, so a second build never inherits the first build's ticks (the inventory's known bug).
 */
import { el, makeToast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { topbar } from '../ui/topbar.js';
import { toolbar } from '../ui/toolbar.js';
import { glyphEl, FACEK, DEFAULT_COLORS } from '../ui/glyph.js';
import { computeBom, bomRows } from '../rules/bom.js';
import { layoutRules } from '../rules/layout.js';
import { isPhone, phoneChrome } from '../ui/phone.js';
import { partName } from '../ui/names.js';   // shown names: "Case 185 · 2W-1H", the rows keep their GEN2 keys

// eslint-disable-next-line no-undef
const G = typeof GEN2 !== 'undefined' ? GEN2 : null;
// eslint-disable-next-line no-undef
const LINKS = typeof partLinks === 'function' ? partLinks : null;
// eslint-disable-next-line no-undef
const BUY = typeof HARDWARE_BUY !== 'undefined' ? HARDWARE_BUY : {};
const STORES = [['printables', 'Printables'], ['thangs', 'Thangs'], ['makerworld', 'MakerWorld'], ['cults', 'Cults 3D']];
const STORE_KEY = 'gen2-link-store';   // the planner's own preference key, same ids
const INSIDE = { 59: 45, 115: 101, 165: 151, 185: 171, 240: 226, 270: 256 };
const CLUB = { edgelabel: 1, classicpro: 1, chevron: 1 };

/* the Assemble part colours, by name (the artboard's chipFor; the regex order matters) */
export function chipFor(name) {
  // the planner's names carry a "GEN2 <length>" prefix, so match anywhere; the order matters (a stopper is not a drawer)
  if (/Stopper/.test(name)) return '#E040A0';
  if (/QuickLock/.test(name)) return '#14B8A6';
  if (/Magnet Clip/.test(name)) return '#8B5CF6';
  if (/Cover Upper/.test(name)) return '#7CC25A';
  if (/Cover Lower/.test(name)) return '#2E9E4F';
  if (/Foot ?rail/i.test(name)) return '#3B82F6';
  if (/Faceplate|Back Cover/.test(name)) return '#F28C28';
  if (/Handle/.test(name)) return '#2BB3A3';
  if (/Drawer/.test(name)) return '#2F4A9E';
  if (/Case/.test(name)) return '#E9E9EC';
  if (/Foot|Rail|Bracket|Wall Mount/i.test(name)) return '#A855F7';
  return '#9CA3AF';
}

/* the four numbers of one row, from the stored progress */
const rowKey = (r) => `${r.section}|${r.name}`;
/* SIDE COVERS ARE RELEASED (v2609, 2026-10-10: Printables and Thangs pages live, one per collection; the site ticket
   TICKET-side-covers-2026-10-10.md carries the ids). The planner's catalog, vendored here verbatim and sha-pinned,
   still lists `sideCover` under `unreleased` until the planner's own commit lands and the catalog is re-vendored
   (tools/port-rules.mjs + test/catalog-vendor.test.mjs). Until then this override, and nothing else, says so: the row
   loses SOON and "Not released", links to the live pages, and counts as available. Delete it with the re-vendor. */
const SIDE_COVER_PAGES = {
  59: { printables: 'https://www.printables.com/model/1872093-modulith-59-side-covers', thangs: 'https://than.gs/m/1619983' },
  115: { printables: 'https://www.printables.com/model/1872105-modulith-115-side-covers', thangs: 'https://than.gs/m/1619981' },
  165: { printables: 'https://www.printables.com/model/1872112-modulith-165-side-covers', thangs: 'https://than.gs/m/1619978' },
  185: { printables: 'https://www.printables.com/model/1872115-modulith-185-side-covers', thangs: 'https://than.gs/m/1619982' },
  240: { printables: 'https://www.printables.com/model/1872120-modulith-240-side-covers', thangs: 'https://than.gs/m/1619980' },
  270: { printables: 'https://www.printables.com/model/1872123-modulith-270-side-covers', thangs: 'https://than.gs/m/1619979' },
};
function releasedOverride(r, length) {
  const m = /^GEN2 (\d+) Side Cover - /.exec(r.name); if (!m) return r;
  const pages = SIDE_COVER_PAGES[+m[1]] || SIDE_COVER_PAGES[length]; if (!pages) return r;
  const stores = [{ id: 'printables', label: 'Printables', url: pages.printables, exact: true }, { id: 'thangs', label: 'Thangs', url: pages.thangs, exact: true }];
  return { ...r, unreleased: false, links: { stores, printables: pages.printables, thangs: pages.thangs } };
}
const remaining = (r, p) => Math.max(0, r.qty - (p?.had || 0) - (p?.made || 0));

export function mountParts(stage, ctx) {
  const ac = new AbortController();
  const signal = ac.signal;
  const build = stage.build;
  const length = Number(build?.length || 185);
  // progress is per BUILD: the kit this page opened with (kept in the address through every edit), else the record's own id
  const buildId = ctx.kitId || stage.manifest?.id || build?.buildId || 'build';
  const PROGRESS_KEY = `gen2-parts-progress:${buildId}`;
  const st = { site: readStore(), tracking: false, progress: readProgress(), sel: null, wide: false };

  function readStore() { try { const v = localStorage.getItem(STORE_KEY); return STORES.some(([id]) => id === v) ? v : 'printables'; } catch { return 'printables'; } }
  function readProgress() { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}').rows || {}; } catch { return {}; } }
  function saveProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ tracking: st.tracking, rows: st.progress })); } catch { /* private mode */ } }
  try { const v = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); st.tracking = !!v.tracking; } catch {}

  const root = el('div', { id: 'ws' });
  document.body.appendChild(root);
  const { say, soon } = makeToast(root);
  root.prepend(topbar(stage, { ...ctx, active: 'parts', say, soon, signal }));
  root.appendChild(toolbar(stage, { soon }).el);

  /* ---------------- the list ---------------- */
  const sections = () => computeBom(build, G) || [];
  const rows = () => bomRows(sections(), LINKS).map((r) => releasedOverride(r, length));
  const counts = () => {
    const rs = rows();
    const print = rs.filter((r) => !r.hardware);
    const printCount = print.reduce((n, r) => n + r.qty, 0), files = print.length;
    const toGo = print.reduce((n, r) => n + remaining(r, st.progress[rowKey(r)]), 0);
    const missing = rs.filter((r) => r.unreleased && !r.optional).length, optMissing = rs.filter((r) => r.unreleased && r.optional).length;
    return { rs, printCount, files, toGo, missing, optMissing };
  };

  const panel = el('aside.glass', { id: 'ws-parts', 'aria-label': 'Parts list' });
  root.appendChild(panel);
  function renderPanel() {
    const { rs, printCount, files, toGo, missing, optMissing } = counts();
    panel.replaceChildren();
    const head = el('div.head');
    head.append(
      el('div.row1', {}, [el('h2', { text: 'Parts list' }), el('span.mono', { text: `${printCount} to print · ${files} files` }),
        el('button.expand', { title: st.wide ? 'Narrow the list' : 'Expand the list · readable columns for tracking', 'aria-pressed': String(st.wide), onclick: () => { st.wide = !st.wide; panel.classList.toggle('wide', st.wide); document.documentElement.classList.toggle('ws-parts-wide', st.wide); renderPanel(); safe(); } }, [icon(st.wide ? 'arrows-in-simple' : 'arrows-out-simple', { size: 18 })])]),
      el('div.row2', {}, [
        missing ? el('span.warn', { text: `⚠ ${missing} required part${missing === 1 ? '' : 's'} not released yet` })
          : el('span.ok', { text: optMissing ? `✓ All required parts are available · ${optMissing} optional in development` : '✓ All required parts are available.' }),
        el('span.dim', { text: 'Chips = part colors in Assemble · dashed = buy' }),
      ]),
      el('div.row3', {}, [
        el('div.track.sites', { role: 'group', 'aria-label': 'Download site' }, STORES.map(([id, name]) =>
          el('button.seg' + (st.site === id ? '.on' : ''), { text: name, 'aria-pressed': String(st.site === id), onclick: () => { st.site = id; try { localStorage.setItem(STORE_KEY, id); } catch {} renderPanel(); } }))),
        el('button.key' + (st.tracking ? '.on' : ''), { 'aria-pressed': String(st.tracking), text: st.tracking ? '☑ Tracking' : '☐ Track my build', title: 'Count what you already had and what you have printed or bought toward this build', onclick: () => { st.tracking = !st.tracking; saveProgress(); renderPanel(); renderDock(); } }),
      ]),
      el('div.row4', {}, [
        el('button.key', { text: 'Copy as text', onclick: copyText }),
        el('button.key', { text: 'Download CSV', onclick: downloadCsv }),
        el('button.key', { text: 'Print', onclick: () => window.print() }),
        el('button.key', { text: 'Save build image', onclick: soon('Save build image', 'the Done scene (5b)') }),
        el('button.key', { text: 'Download labels', onclick: soon('Download labels', 'the Labels workspace (phase 5)') }),
      ]),
    );
    panel.appendChild(head);
    const body = el('div.body');
    let last = null, group = null;
    const table = st.wide && st.tracking;
    for (const r of rs) {
      if (r.section !== last) {
        last = r.section; body.appendChild(el('h3', { text: r.section })); group = el('div.rows' + (table ? '.table' : '')); body.appendChild(group);
        if (table) group.appendChild(el('div.thead', {}, [el('span'), el('span', { text: 'Part' }), el('span', { text: 'Needed' }), el('span', { text: 'Already have' }), el('span', { text: 'Printed / bought' }), el('span', { text: 'Remaining' }), el('span')]));
      }
      group.appendChild(table ? renderTableRow(r) : renderRow(r));
    }
    body.appendChild(el('p.foot', { text: rs.some((r) => r.hardware && BUY[r.name]) ? 'Hardware links are Amazon affiliate links (as an Amazon Associate I earn from qualifying purchases) · any equivalent hardware works.' : 'Any equivalent hardware works.' }));
    panel.appendChild(body);
  }
  function renderRow(r) {
    const p = st.progress[rowKey(r)] || { had: 0, made: 0 };
    const left = remaining(r, p);
    const row = el('div.prow.well' + (st.tracking && left === 0 ? '.done' : ''));
    const chip = el('span.chip' + (r.hardware ? '.buy' : ''), { title: r.hardware ? 'Bought, not printed' : 'Part color in Assemble' });
    if (!r.hardware) chip.style.background = chipFor(r.name);
    row.append(chip, el('span.qty.mono', { text: `×${r.qty}` }));
    const mid = el('div.mid', {}, [el('div.name', { text: partName(r.name) })]);
    if (r.note) mid.appendChild(el('div.note', { text: r.note }));
    row.appendChild(mid);
    const badge = r.club ? ['CLUB', 'club'] : r.unreleased ? ['SOON', ''] : r.hardware ? ['BUY', ''] : r.optional ? ['OPTIONAL', ''] : null;
    if (badge) row.appendChild(el('span.badge' + (badge[1] ? '.' + badge[1] : ''), { text: badge[0] }));
    if (st.tracking) {
      const counter = (field, label) => {
        const v = p[field] || 0;
        return el('div.counter', { title: label }, [
          el('button', { text: '−', 'aria-label': `${label}: one fewer`, disabled: v <= 0, onclick: () => bump(r, field, -1) }),
          el('span.mono', { text: String(v) }),
          el('button', { text: '+', 'aria-label': `${label}: one more`, disabled: (p.had || 0) + (p.made || 0) >= r.qty, onclick: () => bump(r, field, 1) }),
          el('span.lbl', { text: label }),
        ]);
      };
      row.appendChild(el('div.progress', {}, [counter('had', 'had'), counter('made', r.hardware ? 'bought' : 'printed'), el('span.left.mono', { text: left ? `${left} to go` : '✓' })]));
    }
    const link = r.hardware ? (BUY[r.name] || [])[0] : r.links?.stores?.find((s) => s.id === st.site);
    if (link) row.appendChild(el('a.link', { href: link.url, target: '_blank', rel: 'noopener', text: `${r.hardware ? 'Amazon' : (link.exact ? link.label : link.label + ' search')} ↗` }));
    else if (r.unreleased) row.appendChild(el('span.link.dim', { text: 'Not released' }));
    return row;
  }
  /* the wide list's row: one column per quantity, the counters readable, a finished row still editable */
  function renderTableRow(r) {
    const p = st.progress[rowKey(r)] || { had: 0, made: 0 };
    const left = remaining(r, p);
    const row = el('div.prow.trow.well' + (left === 0 ? '.done' : ''));
    const chip = el('span.chip' + (r.hardware ? '.buy' : ''), { title: r.hardware ? 'Bought, not printed' : 'Part color in Assemble' });
    if (!r.hardware) chip.style.background = chipFor(r.name);
    const badge = r.club ? ['CLUB', 'club'] : r.unreleased ? ['SOON', ''] : r.hardware ? ['BUY', ''] : r.optional ? ['OPTIONAL', ''] : null;
    const mid = el('div.mid', {}, [el('div.name', {}, [partName(r.name), badge ? el('span.badge' + (badge[1] ? '.' + badge[1] : ''), { text: badge[0] }) : null])]);
    if (r.note) mid.appendChild(el('div.note', { text: r.note }));
    const counter = (field, label) => {
      const v = p[field] || 0;
      return el('div.counter.big', { title: label }, [
        el('button', { text: '−', 'aria-label': `${label}: one fewer`, disabled: v <= 0, onclick: () => bump(r, field, -1) }),
        el('span.mono', { text: String(v) }),
        el('button', { text: '+', 'aria-label': `${label}: one more`, disabled: (p.had || 0) + (p.made || 0) >= r.qty, onclick: () => bump(r, field, 1) }),
      ]);
    };
    const link = r.hardware ? (BUY[r.name] || [])[0] : r.links?.stores?.find((s) => s.id === st.site) || r.links?.stores?.[0];
    row.append(chip, mid, el('span.mono.need', { text: String(r.qty) }), counter('had', 'Already have'), counter('made', r.hardware ? 'Bought' : 'Printed'),
      el('span.mono.left' + (left ? '' : '.ok'), { text: left ? String(left) : '✓ done' }),
      link ? el('a.link', { href: link.url, target: '_blank', rel: 'noopener', text: `${r.hardware ? 'Amazon' : (link.exact ? link.label : link.label + ' search')} ↗` }) : r.unreleased ? el('span.link.dim', { text: 'Not released' }) : el('span'));
    return row;
  }
  function bump(r, field, d) {
    const p = st.progress[rowKey(r)] || { had: 0, made: 0 };
    p[field] = Math.max(0, (p[field] || 0) + d);
    st.progress[rowKey(r)] = p; saveProgress(); renderPanel(); renderDock();
  }

  /* ---------------- exports (the planner's formats) ---------------- */
  const meta = () => {
    const m = (G?.mounts || []).find((x) => x.id === build?.mount);
    const f = (G?.faceplateStyles || []).find((s) => s.id === build?.faceStyle);
    const s = stage.buildSize?.();
    return { date: new Date().toISOString().slice(0, 10), mount: m?.label || build?.mount || '', dims: s ? `${Math.round(s.x)} × ${Math.round(s.y)} × ${Math.round(s.z)} mm` : '', faceplate: f?.label || '', link: location.href };
  };
  async function copyText() {
    const m = meta();
    let txt = `MODULITH ${length} · ${m.mount} setup · ${m.date}\nPlanned with the MODULITH Planner (formerly GEN2)\n`;
    if (m.dims) txt += `Overall: ${m.dims} · Faceplate: ${m.faceplate}\n`;
    txt += `Reopen this build: ${m.link}\n\n`;
    let last = '';
    for (const r of rows()) {
      if (r.section !== last) { txt += `\n[${r.section}]\n`; last = r.section; }
      txt += `${r.qty}x ${partName(r.name)}${r.optional ? ' (optional)' : ''}${r.unreleased ? ' (coming soon)' : ''}\n`;
      if (r.links) { txt += `    Printables: ${r.links.printables}\n    Thangs:     ${r.links.thangs}\n`; }
    }
    try { await navigator.clipboard.writeText(txt); say('Parts list copied.'); } catch { say('Could not reach the clipboard.'); }
  }
  function downloadCsv() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const m = meta();
    const lines = [['MODULITH build', `${length} mm`, m.mount, m.date].map(esc).join(','), ['Reopen', m.link].map(esc).join(','), '', ['Section', 'Qty', 'Part', 'Printables', 'Thangs'].map(esc).join(',')];
    for (const r of rows()) lines.push([r.section, r.qty, partName(r.name) + (r.optional ? ' (optional)' : '') + (r.unreleased ? ' (coming soon)' : ''), r.links?.printables || '', r.links?.thangs || ''].map(esc).join(','));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `modulith-${length}-parts.csv` });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------- the inspector: this unit · parts ---------------- */
  const insp = el('aside.glass.glass-edge', { id: 'ws-insp', 'aria-label': 'This unit · parts', hidden: true });
  root.appendChild(insp);
  const hex = (key, fallback) => { try { return stage.activeHex(key) || fallback; } catch { return fallback; } };
  function unitParts(u) {
    const P = G?.partNames; if (!P) return [];
    const h = u.hh / 2, size = `${u.w}W-${h}H`, out = [];
    const fill = (G.fills || []).find((f) => f.id === u.fill);
    if (u.fill === 'classic' || u.fill === 'decor') {
      out.push([P.drawer(length, size, fill?.label || u.fill), 1]);
      out.push([P.case(length, size), 1]);
      if (u.fill === 'decor') { const f = (G.faceplateStyles || []).find((s) => s.id === build.faceStyle); out.push([P.faceplate(length, size, f?.label || ''), 1]); }
      out.push(['QuickLock L + R', 2]);
      const removed = new Set(build.removedStoppers || []);
      const kept = Array.from({ length: u.w }, (_, k) => k).filter((k) => !removed.has(`${u.id}:${k}`)).length;
      if (kept) out.push(['Drawer Stopper L + R', 2 * kept]);
      if (u.closure === 'magnet') out.push(['Magnet Clip + Magnet', 2]);
    } else if (u.fill === 'shelf') {
      out.push([P.case(length, `${u.w}W-1H`), 1]);
      if (h > 1) out.push([P.extender(length, u.w), h - 1]);
      out.push([P.shelfInsert(length, u.w), 1]);
      if (u.lip) out.push([P.shelfLip(u.w), u.lip === 'both' ? 2 : 1]);
      out.push(['QuickLock L + R', 2 * h]);
    }
    return out;
  }
  function renderInspector() {
    const sel = st.sel;
    insp.replaceChildren();
    if (!sel || sel.owner == null) { insp.hidden = true; return; }
    const placed = build?.placed || [];
    const unit = placed.find((u) => u.id === sel.owner);
    if (!unit) { insp.hidden = true; return; }
    insp.hidden = false;
    const idx = placed.indexOf(unit) + 1;
    const fill = (G?.fills || []).find((f) => f.id === unit.fill);
    const cur = stage.currentFaceplateStyle();
    const kind = unit.fill === 'classic' ? 'classicDrawer' : unit.fill === 'shelf' ? 'shelf' : (FACEK[cur?.key] || 'edgelabel');
    const colors = { body: hex('Case', DEFAULT_COLORS.body), front: unit.fill === 'classic' ? hex('Drawer', DEFAULT_COLORS.front) : hex('Faceplate:FACE', hex('Faceplate', DEFAULT_COLORS.front)), handle: hex('Handle', DEFAULT_COLORS.handle), lb: hex('Label', DEFAULT_COLORS.lb), lt: DEFAULT_COLORS.lt };
    const wall = G?.interior || { wWall: 17, hWall: 8 };
    insp.append(
      el('div.head', {}, [el('h2.h2', { text: 'This unit · parts' }), el('span.idx', { text: `Unit ${idx} of ${placed.length}` }), el('button.x', { title: 'Deselect', 'aria-label': 'Deselect', onclick: () => stage.setSelected(null) }, [icon('x', { size: 16 })])]),
      el('div.ident', {}, [el('div.wellbox.well', {}, [glyphEl(kind, 79, 50, colors)]), el('div.col', {}, [el('h3', { text: fill?.label || unit.fill }), el('div.dims', { text: `${unit.w}W·${unit.hh / 2}H · inside ${unit.w * 88 - wall.wWall} × ${Math.round((unit.hh / 2) * 56 - wall.hWall)} × ${INSIDE[length] ?? length} mm` })])]),
      el('div.uparts', {}, unitParts(unit).map(([name, qty]) => el('div.uprow.well', {}, [el('span', { text: name }), el('span.mono', { text: `×${qty}` })]))),
    );
  }

  /* ---------------- the dock ---------------- */
  const dock = el('footer.glass', { id: 'ws-dock' });
  root.appendChild(dock);
  function renderDock() {
    const { printCount, toGo, missing } = counts();
    const s = stage.buildSize?.();
    const dims = s ? `${Math.round(s.x)} × ${Math.round(s.y)} × ${Math.round(s.z)}` : '';
    /* the status is STRUCTURAL validity (Astra: "Ready to build" beside "40 to go" read as two claims about one thing);
       what is not released is the head line's business, what is still to print the progress bar's */
    let block = null; try { block = build ? layoutRules({ ...build, fill: 'decor', selected: { w: 1, h: 1 }, selectedUnit: null }, G, { tabletop: globalThis.GEN2_TABLETOP }).instructionsBlockReason() : null; } catch { block = null; }
    const bad = block && block.code !== 'cabinet' && block.code !== 'no-ut-rails';
    dock.replaceChildren(
      el('button.status' + (bad ? '.issue' : ''), { text: bad ? 'Fix the layout' : 'Layout valid', title: bad ? block.text : 'Every unit is supported and in the collection', onclick: bad ? () => ctx.switchTo('build') : null }),
      el('div.group', {}, [el('span.big', { text: String(build?.placed?.length ?? 0) }), el('span.unit-lbl', { text: 'units' })]),
      el('div.group', {}, [el('span.big', { text: dims }), el('span.unit-lbl', { text: 'mm' })]),
    );
    dock.firstChild.prepend(el('span.dot'));
    if (st.tracking) {
      const done = printCount - toGo;
      dock.appendChild(el('div.pbar', {}, [el('span.track', {}, [el('span.fill', { style: `width:${printCount ? Math.round(done / printCount * 100) : 0}%` })]), el('span.mono.long', { text: `${done} of ${printCount} in hand · ${toGo} to go` }), el('span.mono.short', { text: `${done} of ${printCount}` })]));
    }
    dock.appendChild(el('button.cta', { onclick: () => { if (ctx.memo) ctx.memo.assemblePage = 1; ctx.switchTo('assemble'); } }, ['Start assembly', icon('arrow-right', { size: 20 })]));
  }

  /* ---------------- stage ---------------- */
  const phone = isPhone() ? phoneChrome(root, { ...ctx, active: 'parts', soon }, { panels: [
    { el: panel, title: () => { const c = counts(); return `Parts · ${c.printCount} to print`; }, open: true },
    { el: insp, title: 'This unit · parts' },
  ] }) : null;
  const safe = () => { if (phone) { stage.setSafeArea({ left: 8, right: 8, top: phone.top(), bottom: phone.bottom() }); return; } stage.setSafeArea({ left: (st.wide ? 820 : 440) + 20 + 8, right: 324 + 20 + 8, top: innerWidth < 1280 ? 134 : 90, bottom: 118 }); };
  if (phone) phone.onLayout(safe);
  addEventListener('resize', safe, { signal });
  document.addEventListener('keydown', (e) => { if (e.key === '\\') root.hidden = !root.hidden; }, { signal });
  const steps = stage.manifest?.steps?.length ?? 0;
  if (steps && stage.cur !== steps) stage.goTo(steps, { animate: false });
  stage.setDims(false);
  renderPanel(); renderInspector(); renderDock(); safe();

  return {
    onSelect(sel) { st.sel = sel; renderInspector(); if (phone) { if (sel) phone.open(insp); else phone.collapse(insp); phone.refresh(); safe(); } },
    unmount() { ac.abort(); stage.setSelected(null); stage.setSafeArea(null); if (phone) phone.destroy(); root.remove(); },
  };
}

/* for the top bar's Parts badge: the printed-piece count of a build */
export function printCountOf(build) {
  if (!G) return 0;
  return bomRows(computeBom(build, G) || [], null).filter((r) => !r.hardware).reduce((n, r) => n + r.qty, 0);
}
