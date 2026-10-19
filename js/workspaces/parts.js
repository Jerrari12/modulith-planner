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
import { ZONE_LABEL, isPaid, short } from './colors.js';   // the Colors tab's words for a zone, a filament and a paid buy link

// eslint-disable-next-line no-undef
const G = typeof GEN2 !== 'undefined' ? GEN2 : null;
// eslint-disable-next-line no-undef
const LINKS = typeof partLinks === 'function' ? partLinks : null;
// eslint-disable-next-line no-undef
const BUY = typeof HARDWARE_BUY !== 'undefined' ? HARDWARE_BUY : {};
/* MakerWorld and Cults 3D are hidden for now (Joey, 2026-10-18: "lets just hide makerworld and cults for now until
   eventually i upload more models there"): few parts have a page on either, and choosing one turned most rows into a
   site search. The vendored catalog (js/catalog/data.js) still carries both; this list offers and links neither, and a
   saved choice of either reads as Printables (readStore). */
const STORES = [['printables', 'Printables'], ['thangs', 'Thangs']];
const SHOWN = new Set(STORES.map(([id]) => id));
const STORE_KEY = 'gen2-link-store';   // the planner's own preference key, same ids
const INSIDE = { 59: 45, 115: 101, 165: 151, 185: 171, 240: 226, 270: 256 };
const CLUB = { edgelabel: 1, classicpro: 1, chevron: 1 };

/* the Assemble part colours, by name (the artboard's chipFor; the regex order matters) */
export function chipFor(name) {
  // the planner's names carry a "GEN2 <length>" prefix, so match anywhere; the order matters (a stopper is not a drawer)
  if (/Stopper/.test(name)) return '#E040A0';
  if (/Side Cover/.test(name)) return '#c2185b';   // Assemble's own hue for the part (generate.js SIDE_COVER_COLOR)
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

/* the stage's part TYPE of a row (main.js typeByNode's names, generate.js's `add` calls), so a row can ask the palette what it
   prints in. The names are the planner's BOM names (data.js partNames and bom.js's hardware rows); the order matters as in
   chipFor (a stopper is not a drawer, a back cover is not a faceplate). Bought hardware and a row the stage does not model
   answer null, and keep the identification chip. */
export function typeOf(name) {
  if (/Stopper/.test(name)) return 'Stopper';
  if (/Side Cover/.test(name)) return 'SideCover';
  if (/QuickLock/.test(name)) return 'QuickLock';
  if (/Magnet Clip/.test(name)) return 'MagnetClip';
  if (/Cover Upper/.test(name)) return 'CoverU';
  if (/Cover Lower/.test(name)) return 'CoverL';
  if (/Foot ?rail Upper/i.test(name)) return 'FootrailU';
  if (/Foot ?rail Lower/i.test(name)) return 'FootrailL';
  if (/Back Cover/.test(name)) return 'BackCover';
  if (/Faceplate/.test(name)) return 'Faceplate';
  if (/Handle/.test(name)) return 'Handle';
  if (/Drawer/.test(name)) return 'Drawer';
  if (/Case Extender/.test(name)) return 'CaseExtender';
  if (/Case/.test(name)) return 'Case';
  if (/Shelf Insert/.test(name)) return 'ShelfInsert';
  if (/Shelf Lip/.test(name)) return 'ShelfLip';
  if (/^GEN2 Foot\b/.test(name)) return 'Foot';
  if (/Wall Mount/i.test(name)) return 'Bracket';
  if (/Rail/i.test(name)) return 'Rail';
  return null;
}
/* WHAT A ROW PRINTS IN (Joey, 2026-10-18, on the Parts tab after choosing colours: "the parts have the instructions colors
   assigned to them, which is kind of confusing after assigning chosen colors to it"). With the visitor's colours on, the
   list reads the stage's palette API, the Colors tab's one source: keysInBuild for the regions of every type (its body,
   then its zones), filamentsInBuild for the filament each region wears, a unit's own pick included, and the identification
   colour where none is picked. Returns Map type -> [{ key, zone, filaments: [{ name, hex, url }], bare: hex | null }], or
   null while the colours are off, when the chip stays the identification colour. */
export function paletteSnapshot(stage) {
  let on = false; try { on = !!stage.palette?.().on; } catch { on = false; }
  if (!on) return null;
  let keys, fc; try { keys = stage.keysInBuild(); fc = stage.filamentsInBuild(); } catch { return null; }
  const byType = new Map();
  for (const k of keys) {
    if (k.locked) continue;
    const filaments = fc.filaments.filter((f) => f.keys.includes(k.key));
    const bare = fc.unpicked.find((u) => u.key === k.key && !u.stripe);
    if (!byType.has(k.type)) byType.set(k.type, []);
    byType.get(k.type).push({ key: k.key, zone: k.zone, filaments, bare: bare ? bare.hex : null });
  }
  return byType;
}
/* the regions of a row as words: the body's filament(s), then each zone that wears something else -
   [{ zone: '' | 'face', items: [{ name, url }] }]; a region with no pick is "no pick yet" */
const NO_PICK = 'no pick yet';
export function printRegions(regions) {
  const items = (g) => [...g.filaments.map((f) => ({ name: short(f.name), url: f.url || null })), ...(g.bare ? [{ name: NO_PICK, url: null }] : [])];
  const body = regions.find((g) => !g.zone) || regions[0];
  const out = [{ zone: '', items: items(body) }];
  const names = (its) => its.map((i) => i.name).join('/');
  for (const g of regions) if (g !== body && names(items(g)) !== names(out[0].items)) out.push({ zone: ZONE_LABEL(g.zone).toLowerCase(), items: items(g) });
  return out;
}
/* "Black · face Mystery Orange" for the exports and titles; "no filament picked yet" when nothing is */
export function printText(regions) {
  const parts = printRegions(regions);
  if (parts.length === 1 && parts[0].items.every((i) => i.name === NO_PICK)) return 'no filament picked yet';
  return parts.map((p) => (p.zone ? p.zone + ' ' : '') + p.items.map((i) => i.name).join(' / ')).join(' · ');
}
/* the distinct colours a row prints in, body first */
export const swatchesOf = (regions) => [...new Set(regions.flatMap((g) => [...g.filaments.map((f) => f.hex), g.bare].filter(Boolean)))];

/* A ROW'S VARIANT IS PART OF ITS NAME (2026-10-19). The sectional mount parts share one product name across their widths
   - "GEN2 Under Table Rails - 270" with the variant "3W section", "GEN2 Wall Mount Kit - Lite - 185" with "2W section" -
   and until now the list showed the name alone: two rows "Under Table Rails - 270", ×3 and ×1, with no way to tell
   which was which (the old planner wrote "name — variant"). A user's report, 2026-10-19, had the list and the model
   disagreeing on the sections; the list has to SAY the sections before the two can be compared. The variant goes into
   the shown name, the copied text and the CSV, and into the progress key, which the two widths used to share (one row's
   tick counted for the other). A row without a variant keeps the key it had, so stored progress survives; a tick made on
   a width row BEFORE this change is not carried over (Terra 01a154c7): the old key never said which width it was for,
   so there is nothing correct to migrate it to, and the tracking is days old. */
const rowName = (r) => partName(r.name) + (r.variant ? ` · ${r.variant}` : '');
/* the four numbers of one row, from the stored progress */
const rowKey = (r) => `${r.section}|${r.name}${r.variant ? `|${r.variant}` : ''}`;
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
  /* the palette, read once per render (paletteSnapshot); null with the visitor's colours off */
  let pal = null;
  const printLook = (r) => { if (!pal || r.hardware) return null; const t = typeOf(r.name); const regions = t && pal.get(t); return regions && regions.length ? regions : null; };
  /* the row's chip: the filament(s) it prints in with the identification colour as a ring (colours on), else the
     identification colour alone, as the Assemble instructions paint it; bought hardware keeps its dashed outline */
  function chipEl(r, regions) {
    if (r.hardware) return el('span.chip.buy', { title: 'Bought, not printed' });
    const id = chipFor(r.name);
    if (!regions) { const c = el('span.chip', { title: 'Part color in Assemble' }); c.style.background = id; return c; }
    const sw = swatchesOf(regions).slice(0, 4);
    const c = el('span.chip.fil' + (sw.length > 1 ? '.multi' : ''), { title: `Prints in ${printText(regions)} · the ring is its colour in Assemble` });
    c.style.setProperty('--id', id);
    if (sw.length > 1) for (const h of sw) c.appendChild(el('i', { style: `background:${h}` })); else c.style.background = sw[0] || hex(regions[0].key, id);
    return c;
  }
  /* "Print in Black · face Mystery Orange" under the name, every filament name the buy link the Colors tab uses for it */
  function printLine(regions) {
    const parts = printRegions(regions);
    if (parts.length === 1 && parts[0].items.every((i) => i.name === NO_PICK)) return el('div.note.printin', { text: 'No filament picked yet' });
    const kids = ['Print in '];
    parts.forEach((p, i) => {
      if (i) kids.push(' · ');
      if (p.zone) kids.push(p.zone + ' ');
      p.items.forEach((it, j) => {
        if (j) kids.push(' / ');
        kids.push(it.url ? el('a', { href: it.url, target: '_blank', rel: isPaid(it.url) ? 'noopener sponsored' : 'noopener', title: `Buy ${it.name} ↗` + (isPaid(it.url) ? ' · paid link' : ''), text: it.name }) : it.name);
      });
    });
    return el('div.note.printin', {}, kids);
  }
  function renderPanel() {
    const { rs, printCount, files, toGo, missing, optMissing } = counts();
    pal = paletteSnapshot(stage);
    panel.replaceChildren();
    const head = el('div.head');
    head.append(
      el('div.row1', {}, [el('h2', { text: 'Parts list' }), el('span.mono', { text: `${printCount} to print · ${files} files` }),
        el('button.expand', { title: st.wide ? 'Narrow the list' : 'Expand the list · readable columns for tracking', 'aria-pressed': String(st.wide), onclick: () => { st.wide = !st.wide; panel.classList.toggle('wide', st.wide); document.documentElement.classList.toggle('ws-parts-wide', st.wide); renderPanel(); safe(); } }, [icon(st.wide ? 'arrows-in-simple' : 'arrows-out-simple', { size: 18 })])]),
      el('div.row2', {}, [
        missing ? el('span.warn', { text: `⚠ ${missing} required part${missing === 1 ? '' : 's'} not released yet` })
          : el('span.ok', { text: optMissing ? `✓ All required parts are available · ${optMissing} optional in development` : '✓ All required parts are available.' }),
        el('span.dim', { text: pal ? 'Chip = the filament it prints in · ring = its colour in Assemble · dashed = buy' : 'Chips = part colors in Assemble · dashed = buy' }),
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
    const regions = printLook(r);
    row.append(chipEl(r, regions), el('span.qty.mono', { text: `×${r.qty}` }));
    const mid = el('div.mid', {}, [el('div.name', { text: rowName(r) })]);
    if (regions) mid.appendChild(printLine(regions));
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
    const regions = printLook(r);
    const chip = chipEl(r, regions);
    const badge = r.club ? ['CLUB', 'club'] : r.unreleased ? ['SOON', ''] : r.hardware ? ['BUY', ''] : r.optional ? ['OPTIONAL', ''] : null;
    const mid = el('div.mid', {}, [el('div.name', {}, [rowName(r), badge ? el('span.badge' + (badge[1] ? '.' + badge[1] : ''), { text: badge[0] }) : null])]);
    if (regions) mid.appendChild(printLine(regions));
    if (r.note) mid.appendChild(el('div.note', { text: r.note }));
    const counter = (field, label) => {
      const v = p[field] || 0;
      return el('div.counter.big', { title: label }, [
        el('button', { text: '−', 'aria-label': `${label}: one fewer`, disabled: v <= 0, onclick: () => bump(r, field, -1) }),
        el('span.mono', { text: String(v) }),
        el('button', { text: '+', 'aria-label': `${label}: one more`, disabled: (p.had || 0) + (p.made || 0) >= r.qty, onclick: () => bump(r, field, 1) }),
      ]);
    };
    const link = r.hardware ? (BUY[r.name] || [])[0] : r.links?.stores?.find((s) => s.id === st.site) || r.links?.stores?.find((s) => SHOWN.has(s.id));
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
      txt += `${r.qty}x ${rowName(r)}${r.optional ? ' (optional)' : ''}${r.unreleased ? ' (coming soon)' : ''}\n`;
      const regions = printLook(r);   // the filament it prints in, as the list shows it (a list without it is the same confusion on paper)
      if (regions) txt += `    Print in:   ${printText(regions)}\n`;
      if (r.links) { txt += `    Printables: ${r.links.printables}\n    Thangs:     ${r.links.thangs}\n`; }
    }
    try { await navigator.clipboard.writeText(txt); say('Parts list copied.'); } catch { say('Could not reach the clipboard.'); }
  }
  function downloadCsv() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const m = meta();
    const lines = [['MODULITH build', `${length} mm`, m.mount, m.date].map(esc).join(','), ['Reopen', m.link].map(esc).join(','), '', ['Section', 'Qty', 'Part', 'Print in', 'Printables', 'Thangs'].map(esc).join(',')];
    for (const r of rows()) { const regions = printLook(r); lines.push([r.section, r.qty, rowName(r) + (r.optional ? ' (optional)' : '') + (r.unreleased ? ' (coming soon)' : ''), regions ? printText(regions) : '', r.links?.printables || '', r.links?.thangs || ''].map(esc).join(',')); }
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
  /* a commit while this tab is open is a palette change or an undo of one (the store restores the palette beside the
     record): the chips and the "Print in" lines follow it */
  const unsub = ctx.store?.subscribe ? ctx.store.subscribe((state, why) => { if (why === 'adopt') return; renderPanel(); }) : null;

  return {
    onSelect(sel) { st.sel = sel; renderInspector(); if (phone) { if (sel) phone.open(insp); else phone.collapse(insp); phone.refresh(); safe(); } },
    unmount() { ac.abort(); if (unsub) unsub(); stage.setSelected(null); stage.setSafeArea(null); if (phone) phone.destroy(); root.remove(); },
  };
}

/* for the top bar's Parts badge: the printed-piece count of a build */
export function printCountOf(build) {
  if (!G) return 0;
  return bomRows(computeBom(build, G) || [], null).filter((r) => !r.hardware).reduce((n, r) => n + r.qty, 0);
}
