/* The Colors workspace (phase 4): click-a-part first, the Studio flow minus the clutter (the brief §0).
 *
 * The palette is the viewer's own (main.js: customColors keyed by part type or Type:zone -> { name, hex, url },
 * useCustom, userPalette, PRESETS), reached through the stage's palette API, so the model, the product previews
 * (which key their cache on the live palette) and the inspector read one source. Every pick is one undo step:
 * the store snapshots the palette beside the build record (createStore's `extra`), and Undo restores both.
 *
 *   left panel   Your schemes (★ My palette, saved schemes, save / download /
 *                upload / share) · Premade by Jerrari (strips, Active, Shop this look) · Colors in this build
 *                (one row per region the build has) · Build plate finish
 *   stage        clicking a part opens the part card above the Dock: name, count, current filament, region chips
 *                (Body + the part's zones), Open the drawer; a chip opens the picker for that region
 *   right        the filament picker replaces the inspector: title, Apply to (all / only this one - the per-unit
 *                override layer is the next step of this phase), search, In this build, brand groups, a pinned buy
 *                footer with the disclosure, Reset
 *   Dock         the filament stack opens "Filaments in this build", a buy link per row
 */
import { icon } from '../ui/icons.js';
import { el, makeToast } from '../ui/dom.js';
import { topbar } from '../ui/topbar.js';
import { toolbar } from '../ui/toolbar.js';
import { FILAMENT_DB } from '../filament-db.js';
import { PLATE_FINISHES, PLATE_LABELS } from '../bed-finish.js';
import { isPhone, phoneChrome } from '../ui/phone.js';

const SCHEMES_KEY = 'gen2-schemes';   // the visitor's own saved schemes, in this browser
const TYPE_LABEL = { Case: 'Case', CaseExtender: 'Case extender', SideCover: 'Side cover', Drawer: 'Drawer body', Faceplate: 'Faceplate', Accent: 'Accent', Label: 'Label', Handle: 'Handle', CoverL: 'Cover (lower)', CoverU: 'Cover (upper)', FootrailL: 'Foot rail (lower)', FootrailU: 'Foot rail (upper)', Foot: 'Foot', Rail: 'Rail', Bracket: 'Wall bracket', QuickLock: 'QuickLock', Stopper: 'Stopper', MagnetClip: 'Magnet clip', Magnet: 'Magnet', Screw: 'Screw', ShelfInsert: 'Shelf deck', ShelfLip: 'Shelf lip', BackCover: 'Back cover' };
const ZONE_LABEL = (z) => z === 'FACE' ? 'Face' : z === 'GRIP' ? 'Grip' : z === 'GRIP ACCENT' ? 'Grip accent' : z === 'TEXT' ? 'Label text' : z.charAt(0) + z.slice(1).toLowerCase();
const keyLabel = (key) => { const [t, z] = key.split(':'); return (TYPE_LABEL[t] || t) + (z ? ' · ' + ZONE_LABEL(z) : ''); };
const TYPE_PLURAL = { Case: 'cases', CaseExtender: 'case extenders', SideCover: 'side covers', Drawer: 'drawer bodies', Faceplate: 'faceplates', Accent: 'accents', Label: 'labels', Handle: 'handles', CoverL: 'lower covers', CoverU: 'upper covers', FootrailL: 'lower foot rails', FootrailU: 'upper foot rails', Foot: 'feet', Rail: 'rails', Bracket: 'wall brackets', QuickLock: 'QuickLocks', Stopper: 'stoppers', MagnetClip: 'magnet clips', Magnet: 'magnets', Screw: 'screws', ShelfInsert: 'shelf decks', ShelfLip: 'shelf lips', BackCover: 'back covers' };
const typePlural = (key) => TYPE_PLURAL[key.split(':')[0]] || (key.split(':')[0].toLowerCase() + 's');
const regionOf = (key) => key.includes(':') ? ZONE_LABEL(key.split(':')[1]) : 'Body';
const FILL_WORD = { classic: 'drawer', decor: 'drawer', shelf: 'shelf', cabinet: 'cabinet' };
const PAID = [/(^|\.)amazon\./, /(^|\.)amzn\.to$/, /(^|\.)shop\.polymaker\.com$/];
const isPaid = (href) => { try { return PAID.some((re) => re.test(new URL(href).hostname.toLowerCase())); } catch { return false; } };
const n = (k, one, many = one + 's') => `${k} ${k === 1 ? one : many}`;

export function mountColors(stage, ctx) {
  const ac = new AbortController(); const signal = ac.signal;
  const store = ctx.store;
  const st = { key: null, sel: null, expanded: null, query: '', shop: false, saving: false, mine: true, scope: 'all' };   // scope: 'all' (the build) | 'unit' (the clicked unit only)
  const root = el('div', { id: 'ws' });
  document.body.appendChild(root);
  const { say, soon } = makeToast(root);
  root.prepend(topbar(stage, { ...ctx, active: 'colors', say, soon, signal }));

  /* ---------------- the palette, as one undo step each ---------------- */
  const pal = () => stage.palette();
  const worn = (key) => { const p = pal(); return p.on && p.colors[key] ? p.colors[key] : null; };
  function commitColors(why, fn) { if (ctx.ownPaletteKey) ctx.ownPaletteKey(); fn(); store.commit(() => {}, why); }   // the key is the build's own first; the store snapshots the palette with the build
  const unsub = store.subscribe((state, why) => { if (why === 'adopt') return; renderAll(); });
  const unitOfSel = () => { const info = st.sel ? stage.partInfo(st.sel.id) : null; return info && info.owner != null ? info.owner : null; };
  const unitWord = () => { const u = store.state.placed.find((p) => p.id === unitOfSel()); return FILL_WORD[u?.fill] || 'unit'; };
  const unitNo = () => { const i = store.state.placed.findIndex((p) => p.id === unitOfSel()); return i < 0 ? '' : ` (unit ${i + 1})`; };
  function pick(key, f) {
    const fil = f ? { name: f.label || f.name, hex: f.hex, url: f.url } : null;
    if (st.scope === 'unit' && unitOfSel() != null) commitColors('color-unit', () => stage.setOverride(unitOfSel(), key, fil));
    else commitColors('color', () => stage.setColor(key, fil));
  }

  /* ---------------- left panel ---------------- */
  const panel = el('aside.glass', { id: 'ws-colors', 'aria-label': 'Colors' });
  root.appendChild(panel);
  const readSchemes = () => { try { const v = JSON.parse(localStorage.getItem(SCHEMES_KEY) || '[]'); return Array.isArray(v) ? v.filter((s) => s && s.name && s.colors) : []; } catch { return []; } };
  const writeSchemes = (list) => { try { localStorage.setItem(SCHEMES_KEY, JSON.stringify(list)); } catch { /* private mode */ } };
  const palKey = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]?.name, o[k]?.hex]));
  const strip = (colors, keys = ['Case', 'Faceplate:FACE', 'Faceplate', 'Drawer', 'Handle', 'CoverU']) => el('span.strip', {}, [...new Set(keys.filter((k) => colors[k]).map((k) => colors[k].hex))].slice(0, 4).map((h) => el('i', { style: `background:${h}` })));
  function renderPanel() {
    const p = pal(); const cur = p.on ? palKey(p.colors) : null;
    panel.replaceChildren();
    panel.appendChild(el('div.head', {}, [el('h2', { text: 'Colors' }), el('span.hint', { text: 'Click a part on the model, or a row below.' })]));
    // no Instruction colors / My colors switch here: part colours show only in Assemble's player (style brief v3; Joey
    // 2026-10-16). Opening this tab turns the visitor's colours on (onEnter below).
    // your schemes
    const mine = el('section');
    mine.appendChild(el('h3.h2', { text: 'Your schemes' }));
    const list = el('div.schemes');
    if (Object.keys(p.user || {}).length) {
      const on = cur && cur === palKey(p.user);
      list.appendChild(el('button.scheme.key' + (on ? '.on' : ''), { title: 'Your own hand-picked colours · presets never overwrite these', onclick: () => commitColors('scheme', () => stage.restoreUserPalette()) }, [strip(p.user), el('span.name', { text: '★ My palette' }), on ? el('span.badge', { text: 'ACTIVE' }) : null]));
    }
    for (const [i, s] of readSchemes().entries()) {
      const on = cur && cur === palKey(s.colors);
      list.appendChild(el('div.scheme.key' + (on ? '.on' : ''), {}, [
        el('button.apply', { title: 'Apply this scheme', onclick: () => commitColors('scheme', () => stage.setPalette({ colors: s.colors, on: true })) }, [strip(s.colors), el('span.name', { text: s.name })]),
        on ? el('span.badge', { text: 'ACTIVE' }) : null,
        el('button.x', { title: 'Delete this scheme', 'aria-label': `Delete ${s.name}`, onclick: () => { const l = readSchemes(); l.splice(i, 1); writeSchemes(l); renderPanel(); } }, [icon('x', { size: 14 })]),
      ]));
    }
    if (!list.children.length) list.appendChild(el('p.note', { text: 'Pick a few colours, then save them as a scheme to reuse on another build.' }));
    mine.appendChild(list);
    if (st.saving) {
      const input = el('input', { type: 'text', placeholder: 'Scheme name', maxlength: '40', 'aria-label': 'Scheme name' });
      const save = () => { const name = input.value.trim(); if (!name) return; const l = readSchemes().filter((s) => s.name !== name); l.unshift({ name, colors: structuredClone(pal().colors), t: Date.now() }); writeSchemes(l.slice(0, 20)); st.saving = false; say(`Saved “${name}”.`); renderPanel(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { st.saving = false; renderPanel(); } });
      mine.appendChild(el('div.saverow', {}, [input, el('button.key.sm.strong', { text: 'Save', onclick: save }), el('button.key.sm', { text: 'Cancel', onclick: () => { st.saving = false; renderPanel(); } })]));
      setTimeout(() => input.focus(), 0);
    } else {
      mine.appendChild(el('div.row4', {}, [
        el('button.key.sm', { text: '+ Save current colors', disabled: !p.on || !Object.keys(p.colors).length, onclick: () => { st.saving = true; renderPanel(); } }),
        el('button.key.sm', { text: 'Download', title: 'The current colours as a file', disabled: !p.on || !Object.keys(p.colors).length, onclick: downloadScheme }),
        el('button.key.sm', { text: 'Upload', title: 'A scheme file from this app or the Build Studio', onclick: uploadScheme }),
        el('button.key.sm', { text: 'Share', title: 'Copy a link that opens this build with these colours', disabled: !p.on, onclick: shareScheme }),
      ]));
    }
    panel.appendChild(mine);
    // premade
    const pre = el('section');
    pre.appendChild(el('h3.h2', { text: 'Premade by Jerrari' }));
    for (const preset of stage.PRESETS) {
      const on = cur && cur === palKey(preset.colors);
      pre.appendChild(el('div.scheme.key' + (on ? '.on' : ''), {}, [
        el('button.apply', { title: `Apply the “${preset.name}” preset`, onclick: () => commitColors('preset', () => stage.applyPreset(preset)) }, [el('span.strip', {}, preset.swatches.map((h) => el('i', { style: `background:${h}` }))), el('span.name', { text: preset.name })]),
        on ? el('span.badge', { text: 'ACTIVE' }) : null,
        el('button.shop', { title: 'The filaments this look uses, with buy links', onclick: () => { st.shop = preset; renderShop(); renderCard(); } }, ['Shop this look ↗']),
      ]));
    }
    panel.appendChild(pre);
    // colours in this build
    const inb = el('section');
    inb.appendChild(el('h3.h2', { text: 'Colors in this build' }));
    const rows = el('div.crows');
    for (const k of stage.keysInBuild()) {
      const w = worn(k.key);
      const hex = stage.activeHex(k.key);
      rows.appendChild(el('button.crow.key' + (st.key === k.key ? '.on' : ''), { disabled: k.locked, title: k.locked ? 'Purchased hardware, not printed · no filament to pick' : `Pick a filament for ${keyLabel(k.key).toLowerCase()}`, onclick: () => openPicker(k.key) }, [
        el('span.sw', { style: `background:${hex}` }),
        el('span.lbl', {}, [el('b', { text: keyLabel(k.key) }), el('span.cnt', { text: ` ×${k.count}` })]),
        el('span.fil', {}, [k.locked ? 'Bought' : w ? w.name.replace('Panchroma ', '') : p.on && k.key.includes(':') ? 'follows Body' : 'Instruction colour', k.own ? el('span.own', { text: `${k.own} own`, title: `${n(k.own, 'unit')} with ${k.own === 1 ? 'its' : 'their'} own colour for this region` }) : null]),
      ]));
    }
    inb.appendChild(rows);
    panel.appendChild(inb);
    // the plate
    const plate = el('section');
    plate.appendChild(el('h3.h2', { text: 'Build plate finish' }));
    plate.appendChild(el('div.track.seg3', { role: 'group', 'aria-label': 'Build plate finish' }, PLATE_FINISHES.map((k) => el('button.seg.sm' + ((store.state.buildPlate || 'powder') === k ? '.on' : ''), { text: PLATE_LABELS[k], onclick: async () => { await stage.setBuildPlate(k); store.load(stage.build, 'adopt'); renderAll(); } }))));
    plate.appendChild(el('p.note', { text: 'Only changes how the bed faces render · bills nothing. Screen colors are approximate; the Day Grid gives the truest read.' }));
    panel.appendChild(plate);
  }
  function downloadScheme() {
    const p = pal(); const data = { gen2Colors: 1, colors: p.colors, user: p.user };
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: 'modulith-colors.json' }); document.body.appendChild(a); a.click(); a.remove();
  }
  function uploadScheme() {
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const f = input.files[0]; if (!f) return;
      try {
        const raw = JSON.parse(await f.text());
        const colors = raw.colors || raw;   // this app's file, or the Studio's palette export
        const clean = {};
        for (const [k, v] of Object.entries(colors)) if (v && typeof v === 'object' && /^#[0-9a-f]{6}$/i.test(v.hex || '')) clean[k] = { name: String(v.name || v.hex), hex: v.hex, url: typeof v.url === 'string' ? v.url : FILAMENT_DB[0].url };
        if (!Object.keys(clean).length) { say('That file holds no colours this app understands.'); return; }
        commitColors('scheme', () => stage.setPalette({ colors: clean, on: true }));
        say(`Applied ${n(Object.keys(clean).length, 'colour')} from ${f.name}.`);
      } catch { say('That file is not a colour scheme.'); }
    });
    input.click();
  }
  async function shareScheme() {
    const p = pal();
    const q = new URLSearchParams(location.search); q.set('ws', 'colors');
    const url = `${location.origin}${location.pathname}?${q}${location.hash}${location.hash ? '&' : '#'}scheme=${btoa(unescape(encodeURIComponent(JSON.stringify(p.colors))))}`;
    try { await navigator.clipboard.writeText(url); say('Link copied · it opens this build with these colours.'); } catch { say('Copy the address bar to share these colours.'); }
  }

  /* ---------------- the picker (replaces the inspector) ---------------- */
  const picker = el('aside.glass.glass-edge', { id: 'ws-picker', 'aria-label': 'Filament picker', hidden: true });
  root.appendChild(picker);
  function openPicker(key) { st.key = key; st.query = ''; renderAll(); if (phone) phone.open(picker); }
  function closePicker() { st.key = null; renderAll(); if (phone) phone.collapse(picker); }
  function renderPicker() {
    picker.replaceChildren();
    const key = st.key;
    if (!key) { picker.hidden = true; return; }
    picker.hidden = false;
    const keys = stage.keysInBuild(); const k = keys.find((x) => x.key === key); const count = k ? k.count : 0; const own = k ? k.own : 0;
    const uid = unitOfSel(); if (uid == null) st.scope = 'all';
    const unitPick = uid != null ? (pal().on && pal().over[uid] && pal().over[uid][key]) || null : null;
    const w = st.scope === 'unit' ? (unitPick || null) : worn(key);   // what the chosen scope is wearing
    const q = st.query.trim().toLowerCase();
    const scopeText = st.scope === 'unit' ? `This ${unitWord()} only${unitNo()}` : `All ${typePlural(key)} · ${count}`;
    picker.append(
      el('div.head', {}, [el('h2.h2', {}, [el('b.region', { text: regionOf(key) }), ` · ${scopeText}`]), el('button.x', { title: 'Close', 'aria-label': 'Close the picker', onclick: closePicker }, [icon('x', { size: 16 })])]),
      el('div.track.seg2', { role: 'group', 'aria-label': 'Apply to' }, [
        el('button.seg' + (st.scope === 'all' ? '.on' : ''), { text: `All ${typePlural(key)} · ${count}`, onclick: () => { st.scope = 'all'; renderAll(); } }),
        el('button.seg' + (st.scope === 'unit' ? '.on' : ''), { text: uid != null ? `This ${unitWord()} only` : 'This unit only', disabled: uid == null, title: uid == null ? 'Click a part of a unit on the model first' : `Only unit ${unitNo().replace(/[() ]|unit /g, '')} keeps this pick; the other ${typePlural(key)} follow the build colour`, onclick: () => { st.scope = 'unit'; renderAll(); } }),
      ]),
      st.scope === 'unit' ? el('p.note', { text: unitPick ? `This ${unitWord()} wears its own ${regionOf(key).toLowerCase()} colour. The build colour for ${typePlural(key)} is ${worn(key) ? worn(key).name.replace('Panchroma ', '') : 'the instruction colour'}.` : `Picks here colour this ${unitWord()} alone; the build colour stays for the others.` }) : (own ? el('p.note', { text: `${n(own, 'unit')} keep${own === 1 ? 's' : ''} ${own === 1 ? 'its' : 'their'} own colour for this region; the build colour applies to the rest.` }) : null),
      el('input.search', { type: 'search', placeholder: 'Search filaments', value: st.query, 'aria-label': 'Search filaments', oninput: (e) => { st.query = e.target.value; renderBrands(); } }),
    );
    const brands = el('div.brands');
    picker.appendChild(brands);
    function renderBrands() {
      brands.replaceChildren();
      const q2 = st.query.trim().toLowerCase();
      const p = pal();
      const seen = new Map(); for (const c of Object.values(p.colors)) if (c && c.name && c.hex && !seen.has(c.name)) seen.set(c.name, c);
      const inBuild = [...seen.values()].filter((c) => !q2 || c.name.toLowerCase().includes(q2));
      if (inBuild.length) {
        brands.appendChild(el('div.bhead', { text: 'In this build' }));
        brands.appendChild(el('div.swatches', {}, inBuild.map((c) => el('button.sw' + (w && w.name === c.name ? '.active' : ''), { style: `background:${c.hex}`, title: `${c.name} · already in this build`, 'aria-label': c.name, onclick: () => pick(key, { label: c.name, hex: c.hex, url: c.url }) }))));
      }
      let any = inBuild.length > 0;
      for (const brand of FILAMENT_DB) {
        const colors = q2 ? brand.colors.filter((f) => `${brand.brand} ${brand.line} ${f.label}`.toLowerCase().includes(q2)) : brand.colors;
        if (q2 && !colors.length) continue;
        any = true;
        const id = brand.brand + '|' + brand.line;
        const open = q2 ? true : st.expanded ? st.expanded.has(id) : true;
        brands.appendChild(el('button.bhead.toggle', { 'aria-expanded': String(open), onclick: () => { if (!st.expanded) st.expanded = new Set(FILAMENT_DB.map((b) => b.brand + '|' + b.line)); st.expanded[st.expanded.has(id) ? 'delete' : 'add'](id); renderBrands(); } }, [el('span', {}, [brand.brand, el('i', { text: ` ${brand.line} · ${colors.length}` })]), el('span.chev', { text: open ? '▾' : '▸' })]));
        if (open) brands.appendChild(el('div.swatches', {}, colors.map((f) => el('button.sw' + (w && w.name === f.label ? '.active' : '') + (f.pick ? '.pick' : ''), { style: `background:${f.hex}`, title: f.label + (f.pick ? (f.pickNote || ' · ★ Used by Jerrari') : ''), 'aria-label': f.label, onclick: () => pick(key, f) }))));
      }
      if (!any) brands.appendChild(el('p.note', { text: 'No filaments match.' }));
    }
    renderBrands();
    const buyUrl = w ? w.url : FILAMENT_DB[0].url; const paid = isPaid(buyUrl); const poly = /polymaker/i.test(buyUrl);
    picker.appendChild(el('div.foot', {}, [
      el('a.buy', { href: buyUrl, target: '_blank', rel: paid ? 'noopener sponsored' : 'noopener', text: (w ? `Buy ${w.name.replace('Panchroma ', '')} →` : 'Shop filament →') + (paid ? ' · paid link' : '') }),
      el('span.disc', { text: poly ? 'Polymaker links apply the JERRARI discount for you. As a Polymaker Ambassador I earn a small commission; it costs you nothing extra.' : paid ? 'As an Amazon Associate I earn from qualifying purchases.' : '' }),
      el('div.resets', {}, st.scope === 'unit'
        ? [el('button.key.sm', { text: 'Use build colour', title: `Drop this ${unitWord()}’s own ${regionOf(key).toLowerCase()} colour · it follows the build again`, disabled: !unitPick, onclick: () => commitColors('color-unit', () => stage.setOverride(uid, key, null)) })]
        : [el('button.key.sm', { text: 'Reset to instruction colour', title: `Every ${typePlural(key).replace(/s$/, '')} ${regionOf(key).toLowerCase()} back to the kit’s colour, own colours included`, disabled: !w && !own, onclick: () => commitColors('color', () => { stage.setColor(key, null); if (own) stage.clearOverrides(null, key); }) })]),
    ]));
  }

  /* ---------------- the part card on the stage ---------------- */
  const card = el('div.glass', { id: 'ws-partcard', role: 'dialog', 'aria-label': 'Part', hidden: true });
  root.appendChild(card);
  function renderCard() {
    const sel = st.sel;
    card.replaceChildren();
    if (!sel || st.shop) { card.hidden = true; return; }   // the shopping list takes the card's place while it is open (Astra)
    card.hidden = false;
    const info = stage.partInfo(sel.id);
    if (!info) { card.hidden = true; return; }
    const primary = info.primaryKey; const w = worn(primary);
    const total = (stage.keysInBuild().find((k) => k.key === info.type) || {}).count || info.qty;
    const ownPick = info.owner != null ? stage.overrideFor(info.owner, primary) : null;
    const unitIdx = info.owner != null ? store.state.placed.findIndex((p) => p.id === info.owner) + 1 : 0;
    card.append(
      el('div.chead', {}, [
        el('span.sw', { style: `background:${ownPick ? ownPick.hex : stage.activeHex(primary)}` }),
        el('div.col', {}, [el('b', { text: info.label }), el('span.meta', { text: `${n(info.qty, 'of this size')} · ${n(total, TYPE_PLURAL[info.type] ? TYPE_PLURAL[info.type].replace(/s$/, '') : info.type.toLowerCase(), TYPE_PLURAL[info.type] || info.type.toLowerCase() + 's')} in the build${unitIdx ? ` · unit ${unitIdx}` : ''} · ${info.locked ? 'bought, not printed' : ownPick ? `${ownPick.name} (this ${unitWord()}’s own)` : w ? w.name : 'instruction colour'}` })]),
        el('button.x', { title: 'Deselect', 'aria-label': 'Deselect', onclick: () => stage.setSelected(null) }, [icon('x', { size: 16 })]),
      ]),
    );
    if (!info.locked) {
      const chips = el('div.chips');
      const chip = (label, key) => { const ov = info.owner != null ? stage.overrideFor(info.owner, key) : null; chips.appendChild(el('button.zchip' + (st.key === key ? '.on' : '') + (ov ? '.own' : ''), { title: ov ? `${label} · this ${unitWord()}’s own colour (${ov.name})` : `Pick a filament for the ${label.toLowerCase()}`, onclick: () => openPicker(key) }, [el('i', { style: `background:${ov ? ov.hex : stage.activeHex(key)}` }), label, ov ? el('span.tag', { text: 'OWN' }) : null])); };
      chip('Body', info.type);
      for (const z of info.zones) chip(ZONE_LABEL(z), `${info.type}:${z}`);
      card.appendChild(chips);
    }
    const acts = el('div.cacts');
    if (info.links && info.links.length) acts.appendChild(el('a.key.sm', { href: info.links[0].url, target: '_blank', rel: 'noopener', text: `${info.links[0].label || 'Download'} ↗` }));
    if (info.owner != null && info.type === 'Drawer' || (info.owner != null && info.ridesDrawer)) acts.appendChild(el('button.key.sm', { text: 'Open the drawer', onclick: () => stage.peekUnit(info.owner) }));
    if (acts.children.length) card.appendChild(acts);
  }

  /* ---------------- toolbar, dock, the shopping list ---------------- */
  const bar = toolbar(stage, { soon, history: { undo: () => store.undo(), redo: () => store.redo(), get canUndo() { return store.canUndo; }, get canRedo() { return store.canRedo; } } });
  root.appendChild(bar.el);
  const dock = el('footer.glass', { id: 'ws-dock' });
  root.appendChild(dock);
  const filamentsOf = (colors, over = null) => { const seen = new Map(); const add = (k, c) => { if (!c || !c.name) return; if (!seen.has(c.name)) seen.set(c.name, { ...c, keys: [] }); if (!seen.get(c.name).keys.includes(k)) seen.get(c.name).keys.push(k); }; for (const [k, c] of Object.entries(colors || {})) add(k, c); for (const o of Object.values(over || {})) for (const [k, c] of Object.entries(o || {})) add(k, c); return [...seen.values()]; };
  function renderDock() {
    const p = pal(); const fils = p.on ? filamentsOf(p.colors, p.over).filter((f) => stage.keysInBuild().some((k) => f.keys.includes(k.key))) : [];
    const s = stage.buildSize?.(); const dims = s ? `${Math.round(s.x)} × ${Math.round(s.y)} × ${Math.round(s.z)}` : '';
    dock.replaceChildren(
      el('button.status.stack', { title: fils.length ? 'Filaments in this build · the shopping list' : 'No filament picked yet', disabled: !fils.length, onclick: () => { st.shop = st.shop ? false : 'build'; renderShop(); renderCard(); } }, [el('span.stacks', {}, fils.slice(0, 6).map((f) => el('i', { style: `background:${f.hex}` }))), fils.length ? n(fils.length, 'filament') : 'Instruction colors']),
      el('div.group', {}, [el('span.big', { text: String(store.state.placed.length) }), el('span.unit-lbl', { text: 'units' })]),
      el('div.group', {}, [el('span.big', { text: dims }), el('span.unit-lbl', { text: 'mm' })]),
      el('button.cta', { onclick: () => ctx.switchTo('parts') }, ['Get parts list', icon('arrow-right', { size: 20 })]),
    );
  }
  const shop = el('div.glass', { id: 'ws-shop', role: 'dialog', 'aria-label': 'Filaments in this build', hidden: true });
  root.appendChild(shop);
  function renderShop() {
    if (!st.shop) { shop.hidden = true; return; }
    const preset = st.shop === 'build' ? null : st.shop;
    const colors = preset ? preset.colors : pal().colors;
    const inBuild = new Set(stage.keysInBuild().map((k) => k.key));
    const fils = filamentsOf(colors, preset ? null : pal().over).map((f) => ({ ...f, uses: f.keys.filter((k) => preset ? true : inBuild.has(k)) })).filter((f) => f.uses.length);
    shop.hidden = false;
    shop.replaceChildren(
      el('div.ihead', {}, [el('b', { text: preset ? `Shop “${preset.name}”` : 'Filaments in this build' }), el('button.x', { 'aria-label': 'Close', onclick: () => { st.shop = false; renderShop(); renderCard(); } }, [icon('x', { size: 16 })])]),
      ...fils.map((f) => { const paid = isPaid(f.url); return el('div.frow.well', {}, [el('span.sw', { style: `background:${f.hex}` }), el('div.col', {}, [el('b', { text: f.name }), el('span.meta', { text: f.uses.map(keyLabel).join(' · ') })]), el('a.link', { href: f.url, target: '_blank', rel: paid ? 'noopener sponsored' : 'noopener', text: 'Buy ↗' })]); }),
      el('span.disc', { text: fils.some((f) => /polymaker/i.test(f.url)) ? 'Paid links. Polymaker links apply the JERRARI discount for you; as a Polymaker Ambassador I earn a small commission at no extra cost to you.' : fils.some((f) => isPaid(f.url)) ? 'Paid links · I earn a small commission at no extra cost to you.' : '' }),
    );
  }

  /* ---------------- layout ---------------- */
  const narrow = () => innerWidth < 1280;
  const phone = isPhone() ? phoneChrome(root, { ...ctx, active: 'colors', soon }, { panels: [
    { el: panel, title: 'Colors', open: true },
    { el: picker, title: () => st.key ? `${regionOf(st.key)} · ${st.scope === 'unit' ? `this ${unitWord()}` : typePlural(st.key)}` : 'Filament' },
  ] }) : null;
  if (phone) phone.onLayout(safe);
  function safe() { if (phone) { stage.setSafeArea({ left: 8, right: 8, top: phone.top(), bottom: phone.bottom() }); return; } stage.setSafeArea({ left: 304 + 28, right: (st.key ? 324 : 0) + 28, top: narrow() ? 134 : 90, bottom: 118 }); }
  function renderAll() { renderPanel(); renderPicker(); renderCard(); renderDock(); renderShop(); bar.sync(); if (phone) phone.refresh(); safe(); }
  addEventListener('resize', safe, { signal });
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === '\\') { root.hidden = !root.hidden; return; }
    if (e.key === 'Escape') { if (st.shop) { st.shop = false; renderShop(); renderCard(); return; } if (st.key) { closePicker(); return; } stage.setSelected(null); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
  }, { signal });

  /* ---------------- stage ---------------- */
  const steps = stage.manifest?.steps?.length ?? 0;
  if (steps && stage.cur !== steps) stage.goTo(steps, { animate: false });
  stage.setDims(false);
  if (!pal().on && Object.keys(pal().colors).length) commitColors('colors-on', () => stage.setUseCustom(true));   // the tab's job is the visitor's colours
  renderAll();

  return {
    onSelect(sel) { st.sel = sel; if (sel) { const info = stage.partInfo(sel.id); if (info && !info.locked) st.key = info.primaryKey; if (!info || info.owner == null) st.scope = 'all'; } renderAll(); },
    unmount() { ac.abort(); unsub(); stage.setSelected(null); stage.setSafeArea(null); if (phone) phone.destroy(); root.remove(); },
  };
}
