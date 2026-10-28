/* The Colors workspace (phase 4; Astra's redesign in the Colors plan, step 3 on 2026-10-18): click-a-part first, the Studio
 * flow minus the clutter (the brief §0).
 *
 * The palette is the viewer's own (main.js: customColors keyed by part type or Type:zone -> { name, hex, url },
 * useCustom, userPalette, PRESETS), reached through the stage's palette API, so the model, the product previews
 * (which key their cache on the live palette) and the inspector read one source. Every pick is one undo step:
 * the store snapshots the palette beside the build record (createStore's `extra`), and Undo restores both.
 *
 *   left panel   the current look as a CARD (a render of this build wearing it, its name - decision D4 - its filament
 *                count and swatches; Browse looks, Surprise me (step 5), Save, and Download / Upload / Share behind
 *                "more") · Colors in this build (one row per region the build has) · Build plate finish
 *   gallery      over the stage on the left, never touching the camera's safe area: Featured (the presets), My looks
 *                (★ My palette, the saved schemes) and All looks, with a search and a filament-count filter. Every
 *                card is THIS build wearing that look (stage.lookCard, step 2's offscreen renderer), cached per scene
 *                revision and look and drawn one per animation frame; hovering a card shows the look on the model
 *                (previewPalette: never saved, never in the history); a click opens its details
 *   details      in the gallery's place: the big card, the filament list with buy links (Shop this look, moved here
 *                from the old preset rows), the notes, Apply (one undo step), Delete for a saved look
 *   surprise     in the gallery's spot (step 5): a mood, a filament cap, "only filaments I own" (an owned list kept in
 *                this browser, edited here), locks on the regions that drive a look, and three generated candidates
 *                (js/colors/surprise.js, under the preset rules) shown on the model like the tray's finalists; Keep
 *                applies one as a scheme, More like this keeps its shell and face, Try again rolls three more
 *   stage        clicking a part opens the part card above the Dock: name, count, current filament, region chips
 *                (Body + the part's zones), Open the drawer; a chip opens the picker for that region
 *   right        the filament picker replaces the inspector: title, Apply to (all / only this one), search, In this
 *                build, brand groups, a pinned buy footer with the disclosure, Reset
 *   Dock         the filament stack opens "Filaments in this build", a buy link per row
 *   phone        the panel, the picker and the gallery are bottom sheets, one open at a time; the model is the hero
 */
import { icon } from '../ui/icons.js';
import { el, makeToast } from '../ui/dom.js';
import { topbar } from '../ui/topbar.js';
import { toolbar } from '../ui/toolbar.js';
import { attachHint, hideHint } from '../ui/hint.js';
import { FILAMENT_DB } from '../filament-db.js';
import { PLATE_FINISHES, PLATE_LABELS } from '../bed-finish.js';
import { isPhone, phoneChrome } from '../ui/phone.js';
import { surprise, LOCKS, CAPS, shortName } from '../colors/surprise.js';
import { STYLES } from '../colors/styles.js';
import { readOwned, writeOwned } from '../state/owned.js';
import { STRIPE_COLOURS } from '../label-look.js';   // a stripe meaning's word (the label palette, 2026-10-28)
import { simplify, worn as wornLook, byFilament, SUMMARY } from '../colors/simplify.js';   // `worn` is this file's palette helper
import { lineMaterials, materialsIn, filterByMaterial, labelMaterials, wordMaterial } from '../colors/materials.js';

const SCHEMES_KEY = 'gen2-schemes';   // the visitor's own saved looks, in this browser
/* the hover hints (js/ui/hint.js): a bubble beside the panel with a clip of the control in use, img/hints/colors-*.mp4 from
   tools/hint-clips.mjs (Joey 2026-10-23). The control's own title is the touch screen's answer. */
const HINTS = {
  browse: { title: 'Browse looks', text: 'Every look drawn on this build. Resting on a card shows it on the model; a click opens it, and Apply dresses the build.', video: 'img/hints/colors-browse.mp4' },
  surprise: { title: 'Surprise me', text: 'Three colour combinations made for this build under your rules: a style, a filament cap, the filaments you own. Try them on the model first.', video: 'img/hints/colors-surprise.mp4' },
  simplify: { title: 'Simplify', text: 'The same look in fewer filaments: which regions would share one, shown before anything changes. Apply is one undo step.', video: 'img/hints/colors-simplify.mp4' },
};
const TYPE_LABEL = { Case: 'Case', CaseExtender: 'Case extender', SideCover: 'Side cover', Drawer: 'Drawer body', Faceplate: 'Faceplate', Accent: 'Accent', Label: 'Label', Handle: 'Handle', CoverL: 'Cover (lower)', CoverU: 'Cover (upper)', FootrailL: 'Foot rail (lower)', FootrailU: 'Foot rail (upper)', Foot: 'Foot', Rail: 'Rail', Bracket: 'Wall bracket', QuickLock: 'QuickLock', Stopper: 'Stopper', MagnetClip: 'Magnet clip', Magnet: 'Magnet', Screw: 'Screw', ShelfInsert: 'Shelf deck', ShelfLip: 'Shelf lip', BackCover: 'Back cover' };
/* ZONE_LABEL, isPaid and short are exported: the Parts list words a row's zones, filament names and buy links as this tab does */
// a label stripe's zone names its meaning ('STRIPE@sky-blue': label-look.js stripePieceZone) and reads as "Metric stripe"
const stripeWord = (z) => { const c = /^STRIPE@/.test(z) ? STRIPE_COLOURS.find((x) => 'STRIPE@' + x.colour === z) : null; return c ? c.name + ' stripe' : null; };
export const ZONE_LABEL = (z) => z === 'FACE' ? 'Face' : z === 'GRIP' ? 'Grip' : z === 'GRIP ACCENT' ? 'Grip accent' : z === 'TEXT' ? 'Label text' : stripeWord(z) || z.charAt(0) + z.slice(1).toLowerCase();
const keyLabel = (key) => { const [t, z] = key.split(':'); return (TYPE_LABEL[t] || t) + (z ? ' · ' + ZONE_LABEL(z) : ''); };
const TYPE_PLURAL = { Case: 'cases', CaseExtender: 'case extenders', SideCover: 'side covers', Drawer: 'drawer bodies', Faceplate: 'faceplates', Accent: 'accents', Label: 'labels', Handle: 'handles', CoverL: 'lower covers', CoverU: 'upper covers', FootrailL: 'lower foot rails', FootrailU: 'upper foot rails', Foot: 'feet', Rail: 'rails', Bracket: 'wall brackets', QuickLock: 'QuickLocks', Stopper: 'stoppers', MagnetClip: 'magnet clips', Magnet: 'magnets', Screw: 'screws', ShelfInsert: 'shelf decks', ShelfLip: 'shelf lips', BackCover: 'back covers' };
const typePlural = (key) => TYPE_PLURAL[key.split(':')[0]] || (key.split(':')[0].toLowerCase() + 's');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const regionOf = (key) => key.includes(':') ? ZONE_LABEL(key.split(':')[1]) : 'Body';
const FILL_WORD = { classic: 'drawer', decor: 'drawer', shelf: 'shelf', cabinet: 'cabinet' };
const hostOf = (href) => { try { return new URL(href).hostname.toLowerCase(); } catch { return ''; } };
/* every host that pays a commission (the viewer's PAID_HOSTS), and the two named programs among them (its PAID_PROGRAMS): Amazon
   Associates and the Polymaker Ambassador links. A Printed Solid link is plain. Judged per URL, so a line can never misstate one */
const PAID = [/(^|\.)amazon\./, /(^|\.)amzn\.to$/, /(^|\.)shop\.polymaker\.com$/];
const AMAZON = [/(^|\.)amazon\./, /(^|\.)amzn\.to$/];
export const isPaid = (href) => PAID.some((re) => re.test(hostOf(href)));
export const isAmazon = (href) => AMAZON.some((re) => re.test(hostOf(href)));
export const isPolymaker = (href) => /(^|\.)shop\.polymaker\.com$/.test(hostOf(href));
/* THE DISCLOSURE WORDING (2026-10-24; the rule the old planner adopted on 2026-09-19, 591e7bb): a buy link keeps its plain label
   and rel=sponsored; ONE plain line next to the links it covers says who they go to; Amazon's sentence is its own words, verbatim
   (the Associates agreement), once per surface. Never "paid link" (Joey: "paid makes it sound like polymaker paid to put their
   filament on here, which it's affiliate links, so nothing has been paid by anyone yet"), and never "affiliate link" alone. The
   Polymaker sentence is the short one Joey picked on 2026-10-27 ("didn't we find a way to shorten this"), alone or after Amazon's */
export const AMAZON_SENTENCE = 'As an Amazon Associate I earn from qualifying purchases.';
export const POLYMAKER_LINE = 'Polymaker links apply the JERRARI discount and earn me a small commission.';
const BOTH_LINE = `${AMAZON_SENTENCE} ${POLYMAKER_LINE}`;
const OTHER_LINE = 'I earn a small commission, at no extra cost to you.';   // a paid host that is neither program (none today)
/* the one line for a set of links: both programs, Polymaker's, Amazon's, the plain line, or '' when every link is plain */
export const disclosureFor = (urls) => { const amazon = urls.some(isAmazon), poly = urls.some(isPolymaker); return amazon && poly ? BOTH_LINE : poly ? POLYMAKER_LINE : amazon ? AMAZON_SENTENCE : urls.some(isPaid) ? OTHER_LINE : ''; };
const n = (k, one, many = one + 's') => `${k} ${k === 1 ? one : many}`;
export const short = (name) => String(name).replace('Panchroma ', '');
/* a filament buy link's click handler: the stage's own `buy:filament:<brand-line>` (main.js buyFilamentEvent), so the
   planner's affiliate clicks and the viewer's land on one dashboard row. `pick` is { name } with the catalog's full label;
   none means the generic "Shop filament", which opens FILAMENT_DB[0] and is named for it */
export const buyFilament = (stage, pick) => () => stage.track(stage.buyFilamentEvent(pick));
/* the catalog's translucent filaments: a card renders one as a solid tint (STEP2-GATE.md), so the details say so */
const TRANSLUCENT = new Set(FILAMENT_DB.flatMap((b) => b.colors.filter((c) => c.translucent).map((c) => c.label)));
const palKey = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]?.name, o[k]?.hex]));
/* a look is the one worn when its colours AND its per-unit layer match (a saved look carries its own layer, D5; a hand
   change to either makes the look "edited"). Sol 01a14f91: comparing colours alone called a saved look "Applied" with its
   per-unit colours gone, and disabled the Apply that would have restored them. */
const overKey = (o) => JSON.stringify(Object.keys(o || {}).sort().map((u) => [u, palKey(o[u])]));
const wears = (p, l) => palKey(p.colors) === palKey(l.colors) && overKey(p.over) === overKey(l.over);

/* ---- the look cards: THIS build wearing a look, from the stage's offscreen renderer (step 2), cached and paced -------
   A card is keyed on everything that changes its picture: the scene revision (the build, its labels, the plate, the relief
   and the styles all move it), the look as this build wears it (the filament of every region it has, overrides included),
   the quality tier (tone mapping) and the stage theme. The cache is module-wide, so it survives a remount (the phone
   breakpoint) and is bounded. Cards are drawn ONE PER ANIMATION FRAME (the plan's pacing rule): the live frame gets its
   turn between cards, and a card whose canvas has gone (the gallery closed or re-rendered) or whose key is stale (the
   build changed) is skipped - that is how rendering cancels on a build change. */
const CARD = { w: 320, h: 240 }, HERO = { w: 544, h: 408 };   // twice the drawn size, for 2x displays
const cardCache = new Map(); const CARD_CACHE_MAX = 60;
function lookSig(stage, look) { const fc = stage.filamentsInBuild(look); return JSON.stringify([fc.filaments.map((f) => [f.hex, f.name, f.keys]), fc.unpicked.map((u) => [u.key, u.hex])]); }
const cardKey = (stage, look, w, h) => JSON.stringify([stage.sceneRev, lookSig(stage, look), stage.quality, stage.stageTheme, w, h]);
function toCanvas(card) {
  const { width: W, height: H, pixels } = card;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c2 = cv.getContext('2d'); const img = c2.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);   // GL rows run bottom-up
  c2.putImageData(img, 0, 0);
  return cv;
}
const CARDS_PER_FRAME = 1;   // draws issued per animation frame (2 to 5 ms each on the CPU); their readbacks overlap on the GPU
function cardPump(stage) {
  const queue = []; const inflight = new Map(); let pumping = false;   // inflight: key -> the card's promise, shared by every canvas that wants it
  const stats = [];   // per card: { key: ms to key it, draw, read, canvas } (debug; the pacing harness reads them)
  const paint = (canvas, img) => { canvas.width = img.width; canvas.height = img.height; canvas.getContext('2d').drawImage(img, 0, 0); canvas.classList.add('drawn'); };
  const live = (job) => job.canvas.isConnected && job.canvas.dataset.key === job.key;
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const remember = (key, img) => { cardCache.set(key, img); if (cardCache.size > CARD_CACHE_MAX) cardCache.delete(cardCache.keys().next().value); };
  async function pump() {
    if (pumping) return; pumping = true;
    try {
      while (queue.length) {
        await nextFrame();   // a few draws per frame; and a canvas asked for while its panel was still being built is in the page by now
        while (stage.regenBusy) await nextFrame();   // the scene is being rebuilt: wait, then see whether these cards still mean anything
        let issued = 0;
        while (queue.length && issued < CARDS_PER_FRAME) {
          const job = queue.shift();
          if (!live(job)) continue;
          const hit = cardCache.get(job.key);
          if (hit) { paint(job.canvas, hit); continue; }
          const tk = performance.now();
          if (job.key !== cardKey(stage, job.look, job.w, job.h)) continue;   // stale: the build changed since it was asked for
          const keyMs = performance.now() - tk;
          let p = inflight.get(job.key);
          if (!p) {
            issued++;
            p = stage.lookCard(job.look, { width: job.w, height: job.h }).then((card) => { if (!card) return null; const tc = performance.now(); const img = toCanvas(card); remember(job.key, img); if (stats.length < 200) stats.push({ key: +keyMs.toFixed(1), snap: +card.ms.snap.toFixed(1), draw: +card.ms.draw.toFixed(1), read: +card.ms.read.toFixed(1), canvas: +(performance.now() - tc).toFixed(1) }); return img; }).finally(() => inflight.delete(job.key));
            inflight.set(job.key, p);
          }
          p.then((img) => { if (img && live(job)) paint(job.canvas, img); }).catch(() => {});
        }
      }
    } finally { pumping = false; }
  }
  return {
    /* draw `look` (null = the live palette) on `canvas`, from the cache at once or from the renderer in its turn */
    want(canvas, look, w, h) {
      const key = cardKey(stage, look, w, h); canvas.dataset.key = key;
      const hit = cardCache.get(key);
      if (hit) { paint(canvas, hit); return; }
      queue.push({ canvas, look, w, h, key }); pump();
    },
    get pending() { return queue.length + inflight.size; },
    get state() { return { queue: queue.length, inflight: inflight.size, pumping, cached: cardCache.size }; },
    get stats() { return stats.slice(); },
  };
}

let lastLook = null;   // the look last chosen by name, for "<look> · edited" (decision D4); kept across remounts
/* THE COMPARE TRAY (the Colors plan's step 4, 2026-10-18): up to three finalists, kept across remounts (the phone breakpoint)
   and across the gallery closing. A finalist is { id, kind, name, colors, over }: `id` names the gallery's look it came from
   (so Apply goes through that look's own apply, a preset's analytics included), or 'current:<time>' for a look taken off
   the model. */
const TRAY_MAX = 3;
let trayLooks = [];
/* SURPRISE ME / FIND YOUR NEXT LOOK (the Colors plan's step 5, Astra's refinement 5b, 2026-10-18): the settings and the
   three candidates, kept across remounts. `style` is a styles.js id; `locks` is role -> filament (see LOCKS: the regions a
   visitor can hold as they are); `like` the accent colour and interpretation "More like this" started from; `cands` the
   looks as the gallery lists them ({ id, kind, name, colors, over }), plus their roles, accent colour and interpretation. */
const sp = { style: 'workshop', cap: 3, ownedOnly: false, locks: {}, like: null, seed: 0, cands: [], short: false };
const LABELS = new Set(FILAMENT_DB.flatMap((b) => b.colors.map((c) => c.label)));
/* SILK SWATCHES (Joey, 2026-10-21: "give the silk material squares a gloss effect, like a sheen on half of it or something? To
   help differentiate it from regular material"): a swatch whose filament is a silk one wears `.silk`, drawn in app.css as a
   highlight over its upper-left half. Every silk filament's label carries the word ("Panchroma Silk Gold"). */
const silk = (name) => (String(name || '').split(' ').includes('Silk') ? '.silk' : '');
/* MATERIAL TAGS AND THE FEET (Joey, 2026-10-21: "maybe we need to make PETG and PLA and TPU, like colored tags in the menu to
   help differentiate the material types more"; "when selecting the feet, i feel like we should only list TPU filaments").
   A line's materials come from its name (the Elegoo line sells PLA and PETG; colors/materials.js, which the picker's
   material chips share, 2026-10-23); the TPU lines are the feet's alone, so the feet's picker lists only them and every
   other picker none of them (the stage keeps the feet TPU: main.js tpuFeet). */
const materialsOf = (b) => lineMaterials(b.line);
const matTags = (b) => el('span.mats', {}, materialsOf(b).map((m) => el('span.mat.' + m.toLowerCase(), { text: m, title: m === 'TPU' ? 'TPU: flexible, for the feet' : m })));
const MAT_OF = labelMaterials(FILAMENT_DB);   // label -> material: the picker's "In this build" row follows the material chip by it
const materialOfName = (name) => (MAT_OF.has(name) ? MAT_OF.get(name) : wordMaterial(name));   // a palette can name a filament the catalogue lacks: its own words place it (Terra 01a16a51)
const TPU_LABELS = new Set(FILAMENT_DB.filter((b) => /TPU/.test(b.line)).flatMap((b) => b.colors.map((c) => c.label)));
const isFeet = (key) => String(key || '').split(':')[0] === 'Foot';
const storage = () => { try { return localStorage; } catch { return null; } };   // a browser that blocks storage throws on the read itself

export function mountColors(stage, ctx) {
  const ac = new AbortController(); const signal = ac.signal;
  const store = ctx.store;
  // scope: 'all' (the build) | 'unit' (the clicked unit only); gallery: false | 'featured' | 'mine' | 'all'; detail: the look
  // whose details are open; fmax: the filament-count filter (0 = any); more: the Download / Upload / Share row shown
  // tray: the compare tray is open; flip: the index of the finalist shown on the model (null = the chosen look)
  // surprise: the Surprise me panel is open; owning: its owned-filaments editor is up (oq its search); sshow: the index of
  // the candidate pinned on the model (null = none)
  const st = { key: null, sel: null, expanded: null, query: '', mat: 'all', shop: false, saving: false, scope: 'all', gallery: false, detail: null, gq: '', fmax: 0, more: false, tray: false, flip: null, surprise: false, owning: false, oq: '', sshow: null, ownedWas: '', simp: false, simpTarget: null, swap: null };   // swap: the spool whose filament the picker changes everywhere (openSwap); simp: the Simplify panel is open, simpTarget its filament count
  const root = el('div', { id: 'ws' });
  document.body.appendChild(root);
  const { say, soon } = makeToast(root);
  root.prepend(topbar(stage, { ...ctx, active: 'colors', say, soon, signal }));
  const cards = cardPump(stage);
  const debug = new URLSearchParams(location.search).get('debug');
  if (debug) { window.__GEN2_CARDS__ = cards; window.__GEN2_SURPRISE__ = sp; }   // the pacing check reads what the gallery still owes; the step-5 checks read the candidates

  /* THE ROOM AS A STAGE (Joey, 2026-10-23, after the Done scene: "prototype the room as a Studio / Room stage toggle in
     the Colors workspace, still hero, orbit allowed, no sequence"; the style brief's own "later: offer the same rooms as
     a stage option in Colors, for judging colors in context"). The Done scene's room (js/scenes/done.js) behind the same
     `?done=room` flag: the build on the desk in daylight, so a filament is judged under a room's light and bounce as well
     as the studio's. The studio stays the colour-accurate reference. The choice is remembered across a remount.
     ROOM FIRST (Joey 2026-10-26: "most people arent going to find this. What if when you select color it goes to this view
     instead, and then maybe there is a way to toggle back to the builder-like view if desired?"): Colors opens on Room, and
     a visitor who picks Studio keeps Studio in this browser (STAGE_KEY); a room that fails to load falls back to Studio for
     the session (the memo) without storing anything. */
  const ROOM_FLAG = (new URLSearchParams(location.search).get('done') || 'room') === 'room';   // on for everyone (Joey 2026-10-26); ?done=off turns it off
  const STAGE_KEY = 'gen2-colors-stage';   // 'studio' | 'room', written only by the toggle (the stored word stays 'studio' for Neutral: a visitor's earlier pick keeps meaning the same)
  let room = null;   // { leaveFn, handle } while the room is on or loading
  let syncBar = null;   // the toolbar's sync, once it is made (its Room | Neutral switch follows st.room)
  const storedStage = (() => { try { return storage()?.getItem(STAGE_KEY); } catch { return null; } })();
  st.room = ROOM_FLAG && (ctx.memo && ctx.memo.colorsRoom != null ? !!ctx.memo.colorsRoom : storedStage !== 'studio');
  function enterRoom() {
    if (!ROOM_FLAG || room) return;
    const h = { leaveFn: null, handle: null };
    room = h;
    import('../scenes/done.js').then(({ enterDoneScene }) => {
      if (room !== h) return;
      const r = enterDoneScene(stage, { say, sequence: false, onSpool: (hex) => openSwap(hex) });
      h.leaveFn = r.leave;
      r.ready.then((handle) => { if (room === h) { h.handle = handle; if (!handle) { room = null; st.room = false; if (ctx.memo) ctx.memo.colorsRoom = false; } renderPanel(); } });   // a room that came on brings its wall and desk control
    }).catch((e) => { console.warn('[colors] the room did not load', e); if (room === h) { room = null; st.room = false; if (ctx.memo) ctx.memo.colorsRoom = false; renderPanel(); } });   // forgotten too, so a remount does not retry (Terra 01a16b56)
  }
  function leaveRoom() { if (!room) return; const h = room; room = null; if (h.leaveFn) h.leaveFn(); }
  function setRoom(on) {
    st.room = !!on; if (ctx.memo) ctx.memo.colorsRoom = st.room;
    try { storage()?.setItem(STAGE_KEY, st.room ? 'room' : 'studio'); } catch { /* private mode: the session's memo still holds it */ }
    if (st.room) enterRoom(); else leaveRoom(); renderPanel();
  }

  /* ---------------- the palette, as one undo step each ---------------- */
  const pal = () => stage.palette();
  const worn = (key) => { const p = pal(); return p.on && p.colors[key] ? p.colors[key] : null; };
  // the key is the build's own first; the store snapshots the palette with the build. A whole look (a preset, a scheme,
  // ★ My palette, an upload) is always its OWN undo step: the store merges changes made within 350 ms, so the history is
  // flushed on both sides of it (the Colors plan's step 1, 2026-10-18)
  const LOOK = new Set(['preset', 'scheme']);
  function commitColors(why, fn) {
    if (ctx.ownPaletteKey) ctx.ownPaletteKey();
    stage.endPreview?.();   // a look being shown never outlives a real change
    if (LOOK.has(why)) store.flush();
    fn(); store.commit(() => {}, why);
    if (LOOK.has(why)) store.flush();
    if (room && room.handle && room.handle.refreshSpools) room.handle.refreshSpools();   // the Room stage's spools wear the new colours (done.js makeSpools)
  }
  const unsub = store.subscribe((state, why) => { if (why === 'adopt') return; renderAll(); });
  const unitOfSel = () => { const info = st.sel ? stage.partInfo(st.sel.id) : null; return info && info.owner != null ? info.owner : null; };
  const unitWord = () => { const u = store.state.placed.find((p) => p.id === unitOfSel()); return FILL_WORD[u?.fill] || 'unit'; };
  const unitNo = () => { const i = store.state.placed.findIndex((p) => p.id === unitOfSel()); return i < 0 ? '' : ` (unit ${i + 1})`; };
  function pick(key, f) {
    const fil = f ? { name: f.label || f.name, hex: f.hex, url: f.url } : null;
    if (st.scope === 'unit' && unitOfSel() != null) commitColors('color-unit', () => stage.setOverride(unitOfSel(), key, fil));
    else commitColors('color', () => stage.setColor(key, fil));
  }

  /* ---------------- the looks: the presets, ★ My palette, the saved schemes ---------------- */
  const readSchemes = () => { try { const v = JSON.parse(localStorage.getItem(SCHEMES_KEY) || '[]'); return Array.isArray(v) ? v.filter((s) => s && s.name && s.colors) : []; } catch { return []; } };
  const writeSchemes = (list) => { try { localStorage.setItem(SCHEMES_KEY, JSON.stringify(list)); } catch { /* private mode */ } };
  /* every look the gallery can show: { id, kind, name, colors, over, swatches?, apply(), del?() }. A saved look keeps the
     per-unit colours it was saved with (decision D5); a preset and ★ My palette have none */
  function looksList() {
    const p = pal(); const out = [];
    for (const preset of stage.PRESETS) out.push({ id: 'preset:' + preset.name, kind: 'preset', name: preset.name, colors: preset.colors, over: {}, swatches: preset.swatches, apply: () => commitColors('preset', () => stage.applyPreset(preset)) });
    if (Object.keys(p.user || {}).length) out.push({ id: 'mine', kind: 'mine', name: '★ My palette', colors: p.user, over: {}, apply: () => commitColors('scheme', () => stage.restoreUserPalette()) });
    // deleted by NAME, read fresh: another tab may have saved a look since this list was built (Sol 01a14f91; names are unique, Save dedupes)
    for (const s of readSchemes()) out.push({ id: 'scheme:' + s.name, kind: 'scheme', name: s.name, colors: s.colors, over: s.over || {}, apply: () => commitColors('scheme', () => stage.setPalette({ colors: s.colors, over: s.over || {}, on: true })), del: () => writeSchemes(readSchemes().filter((x) => x.name !== s.name)) });
    return out;
  }
  const asLook = (l) => ({ colors: l.colors, over: l.over || {} });
  const liveLook = (p) => (p.on ? { colors: p.colors, over: p.over } : null);   // null = the live palette as the stage has it (instruction colours)
  /* the current look's name (decision D4): the matching preset or saved look; after a hand change, "<that look> · edited";
     with no source, "Custom look" */
  function lookName(p) {
    if (!p.on || !Object.keys(p.colors).length) return 'Instruction colors';
    const hit = looksList().find((l) => wears(p, l)) || sp.cands.find((c) => wears(p, c));   // a kept Surprise me candidate is a look too
    if (hit) return hit.name;
    return lastLook ? `${lastLook} · edited` : 'Custom look';
  }
  function applyLook(look) { lastLook = look.name; look.apply(); say(`Applied “${look.name}”.`); }

  /* ---------------- left panel ---------------- */
  const panel = el('aside.glass', { id: 'ws-colors', 'aria-label': 'Colors' });
  root.appendChild(panel);
  const strip = (fc) => el('span.strip', {}, [...new Set([...fc.filaments, ...fc.unpicked].map((f) => f.hex))].slice(0, 8).map((h) => el('i', { style: `background:${h}` })));
  function renderPanel() {
    const p = pal();
    hideHint();   // a control under a bubble is about to be rebuilt; a removed button never fires mouseleave
    panel.replaceChildren();
    /* the panel leads with the build's colours whatever the backdrop (Joey 2026-10-26: "panel always leads with the build's
       colours, room wall/desk as a small section at the bottom only while the room shows, and the view switch moves to the
       toolbar as Room | Neutral"): the switch is the toolbar's (syncBar), the room's wall and desk the panel's last section */
    const head = el('div.head', {}, [el('h2', { text: 'Colors' }), el('span.hint', { text: 'Click a part on the model, or a row below.' })]);
    /* THE SHOWCASE (Joey 2026-10-26: "in the color tab, we should somehow also work in the final scene but call it
       something else, like that way after selecting your colors and stuff you can also view it in this way"): the final
       scene, in these colours, opened from here and back here on its Back (assemble.js THE SHOWCASE) */
    if (ROOM_FLAG) head.appendChild(el('button.key.sm.showcase', { title: 'Watch your build in its colours, in the room, the way the final scene shows it · Esc comes back here', onclick: () => { if (ctx.memo) ctx.memo.showcase = { from: 'colors' }; ctx.switchTo('assemble'); } }, [icon('play', { size: 14, fill: true }), 'Showcase']));
    panel.appendChild(head);
    if (syncBar) syncBar();
    // no Instruction colors / My colors switch here: part colours show only in Assemble's player (style brief v3; Joey
    // 2026-10-16). Opening this tab turns the visitor's colours on (onEnter below).
    // THE CURRENT LOOK, as a card (Astra: a compact card at the top; the premade list moved into the gallery)
    const look = el('section.look');
    const fc = stage.filamentsInBuild();
    const hero = el('canvas.render', { width: HERO.w, height: HERO.h, 'aria-label': 'This build in its current colours' });
    cards.want(hero, liveLook(p), HERO.w, HERO.h);
    const name = lookName(p);
    look.appendChild(el('div.lookcard.well', {}, [
      hero,
      el('div.lmeta', {}, [   // beside the render on the phone, under it on the desktop
        el('div.lrow', {}, [el('b.lname', { text: name, title: name }), el('span.lcount.badge', { text: fc.count ? n(fc.count, 'filament') : 'no filament' })]),
        strip(fc),
      ]),
    ]));
    /* THE CONFIDENCE SUMMARY (step 6): what this build prints in, and the three things to do about it. One row a filament,
       its swatch, its name and the regions it prints (simplify.js byFilament; Joey 2026-10-26: "the way we list the used
       colors looks messy", of the run-on line that named one filament as often as its regions were apart) */
    if (p.on && fc.count) {
      const rows = byFilament(wornLook(p.colors, stage.keysInBuild()));
      const ownUnits = Object.values(p.over || {}).filter((o) => o && Object.keys(o).length).length;   // units wearing a colour of their own (listed in the picker's rows, counted here)
      look.appendChild(el('div.summary', {}, [
        el('p.sline', {}, [el('b', { text: `${n(fc.count, 'filament')} used` }), ownUnits ? el('span.sg.own', { text: ` · ${n(ownUnits, 'unit')} with ${ownUnits === 1 ? 'its' : 'their'} own colours` }) : null]),
        el('ul.sfil', {}, rows.map((r) => el('li', {}, [el('i.sw', { style: `background:${r.hex}`, 'aria-hidden': 'true' }), el('span.sgf', { text: r.filament, title: r.name }), el('span.sgl', { text: r.label })]))),
        el('div.sacts', {}, [
          el('button.link.keeplook', { text: 'Keep this look', title: 'Save these colours as a look of your own', onclick: () => { st.saving = true; renderPanel(); } }),
          el('button.link.review', { text: 'Review filaments', title: 'Every filament this build prints in, with where to buy it', onclick: openShop }),
          fc.count >= 3 ? attachHint(el('button.link.simplify', { text: 'Simplify…', title: 'Print this look in fewer filaments: see what would change first', onclick: openSimplify }), HINTS.simplify, panel) : null,
        ]),
      ]));
    }
    look.appendChild(el('div.row4', {}, [
      attachHint(el('button.key.sm.strong.browse', { title: 'Opens the gallery: every look drawn on this build; rest on one to try it on the model', onclick: () => openGallery('featured') }, [icon('image', { size: 14 }), 'Browse looks']), HINTS.browse, panel),
      attachHint(el('button.key.sm.surprise', { title: 'Three colour combinations made for this build under your rules; rest on one to try it on the model', onclick: openSurprise }, [icon('sparkle', { size: 14 }), 'Surprise me']), HINTS.surprise, panel),
      el('button.key.sm.save', { text: 'Save', title: 'Keep these colours as a look of your own, to reuse on another build', disabled: !p.on || !Object.keys(p.colors).length, onclick: () => { st.saving = !st.saving; renderPanel(); } }),
      el('button.key.sm.more', { text: '⋯', title: 'Download, Upload, Share', 'aria-label': 'More', 'aria-expanded': String(st.more), onclick: () => { st.more = !st.more; renderPanel(); } }),
    ]));
    if (st.saving) {
      const input = el('input', { type: 'text', placeholder: 'Name this look', maxlength: '40', 'aria-label': 'Look name' });
      // a saved look keeps the per-unit colours too (decision D5); Download and Share stay colours only, for the Studio
      const save = () => { const name2 = input.value.trim(); if (!name2) return; const l = readSchemes().filter((s) => s.name !== name2); const q = pal(); l.unshift({ name: name2, colors: structuredClone(q.colors), over: structuredClone(q.over || {}), t: Date.now() }); writeSchemes(l.slice(0, 20)); st.saving = false; lastLook = name2; say(`Saved “${name2}”.`); renderAll(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { st.saving = false; renderPanel(); } });
      look.appendChild(el('div.saverow', {}, [input, el('button.key.sm.strong', { text: 'Save', onclick: save }), el('button.key.sm', { text: 'Cancel', onclick: () => { st.saving = false; renderPanel(); } })]));
      setTimeout(() => input.focus(), 0);
    }
    if (st.more) {
      look.appendChild(el('div.row4.morerow', {}, [
        el('button.key.sm', { title: 'The current colours as a file', disabled: !p.on || !Object.keys(p.colors).length, onclick: downloadScheme }, [icon('download-simple', { size: 14 }), 'Download']),
        el('button.key.sm', { title: 'A colour file from this app or the Build Studio', onclick: uploadScheme }, [icon('upload-simple', { size: 14 }), 'Upload']),
        el('button.key.sm', { title: 'Copy a link that opens this build with these colours', disabled: !p.on, onclick: shareScheme }, [icon('share-network', { size: 14 }), 'Share']),
      ]));
    }
    panel.appendChild(look);
    // colours in this build, directly under the card (Astra)
    const inb = el('section');
    inb.appendChild(el('h3.h2', { text: 'Colors in this build' }));
    const rows = el('div.crows');
    for (const k of stage.keysInBuild()) {
      const w = worn(k.key);
      const hex = stage.activeHex(k.key);
      rows.appendChild(el('button.crow.key' + (st.key === k.key ? '.on' : ''), { disabled: k.locked, title: k.locked ? 'Purchased hardware, not printed · no filament to pick' : `Pick a filament for ${keyLabel(k.key).toLowerCase()}`, onclick: () => openPicker(k.key) }, [
        el('span.sw' + silk(w && w.name), { style: `background:${hex}` }),
        el('span.lbl', {}, [el('b', { text: keyLabel(k.key) }), el('span.cnt', { text: ` ×${k.count}` })]),
        el('span.fil', {}, [k.locked ? 'Bought' : w ? short(w.name) : p.on && k.zone && !k.ownColor ? 'follows Body' : 'Instruction colour', k.own ? el('span.own', { text: `${k.own} own`, title: `${n(k.own, 'unit')} with ${k.own === 1 ? 'its' : 'their'} own colour for this region` }) : null]),
      ]));
    }
    inb.appendChild(rows);
    panel.appendChild(inb);
    // the plate
    const plate = el('section');
    plate.appendChild(el('h3.h2', { text: 'Build plate finish' }));
    plate.appendChild(el('div.track.seg3', { role: 'group', 'aria-label': 'Build plate finish' }, PLATE_FINISHES.map((k) => el('button.seg.sm' + ((store.state.buildPlate || 'powder') === k ? '.on' : ''), { text: PLATE_LABELS[k], onclick: async () => { stage.endPreview?.(); store.flush(); await stage.setBuildPlate(k); store.load(stage.build, 'adopt'); store.flush(); renderAll(); } }))));   // its own undo step; app.js hands an undone plate back to the stage
    // the parts with a finish of their own (2026-10-26), each with its way back to the build's
    const owns = Object.entries(store.state.plateParts || {}).filter(([, f]) => PLATE_FINISHES.includes(f));
    if (owns.length) plate.appendChild(el('ul.plateown', { 'aria-label': 'Parts with their own finish' }, owns.map(([t, f]) => el('li', {}, [
      el('span', {}, [el('b', { text: cap(typePlural(t)) }), ` · ${PLATE_LABELS[f]}`]),
      el('button.link', { text: 'Use the build’s', title: `Every ${typePlural(t).replace(/s$/, '')} back to the build’s finish, ${PLATE_LABELS[store.state.buildPlate || 'powder']}`, onclick: () => setOwnPlate(t, null) }),
    ]))));
    plate.appendChild(el('p.note', { text: 'Only changes how the bed faces render · bills nothing. A part can print on its own finish: pick it, then Printed on. Screen colors are approximate; the Day Grid gives the truest read.' }));
    panel.appendChild(plate);
    /* the room's wall and desk, last and only while the room shows (Joey 2026-10-25: "would it be possible for the user to
       maybe adjust the wall and maybe desk color ... to get a better idea of how the colors look together"; 2026-10-26: "a
       small section at the bottom"): the scene's own control (done.js roomColoursPanel), remembered in this browser, the
       final scene's too */
    if (st.room && room && room.handle && room.handle.roomColoursPanel) {
      const rs = el('section.roomcols');
      rs.appendChild(el('h3.h2', { text: 'The room' }));
      rs.appendChild(room.handle.roomColoursPanel());
      panel.appendChild(rs);
    }
  }
  /* A part type's own build plate finish (Joey, 2026-10-26: "everything except the faceplate powder-coated, and the
     faceplate holographic"). One undo step, like the build's plate; app.js hands an undone map back to the stage. */
  async function setOwnPlate(type, finish) { stage.endPreview?.(); store.flush(); await stage.setPartPlate(type, finish); store.load(stage.build, 'adopt'); store.flush(); renderAll(); }
  /* the picker's "Printed on" row: the finish this region's part prints on, for every unit of the type (the sheet a part
     printed on, not a colour region: a faceplate's Body and Face share it). Only for a part with a known bed face. */
  function plateRow(key) {
    const type = String(key).split(':')[0];
    if (!stage.hasBedFace?.(key)) return null;
    const own = stage.ownPlateOf(type), wears = stage.plateFinishFor(key), buildF = store.state.buildPlate || 'powder';
    const every = typePlural(key);
    return el('div.platerow', {}, [
      el('div.prh', {}, [el('b', { text: 'Printed on' }), el('span', { text: own ? `own finish · all ${every}` : `the build’s · all ${every}` })]),
      el('div.track.seg3', { role: 'group', 'aria-label': `Build plate finish for all ${every}` }, PLATE_FINISHES.map((f) => el('button.seg.sm' + (wears === f ? '.on' : ''), {
        text: PLATE_LABELS[f], 'aria-pressed': String(wears === f),
        title: f === wears ? (own ? `All ${every} print on ${PLATE_LABELS[f]}, their own finish` : `All ${every} follow the build’s ${PLATE_LABELS[f]} · click to keep it whatever the build’s finish`) : `All ${every} on ${PLATE_LABELS[f]}; the rest of the build stays on ${PLATE_LABELS[buildF]}`,
        onclick: () => { if (own && f === own) return; setOwnPlate(type, f); },   // the inherited finish, clicked, PINS it (Sol 01a178a5): it then stays when the build's changes
      }))),
      own ? el('button.link.plateback', { text: `Use the build’s finish (${PLATE_LABELS[buildF]})`, onclick: () => setOwnPlate(type, null) }) : null,
    ].filter(Boolean));
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
        lastLook = f.name.replace(/\.json$/i, '');
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

  /* ---------------- the gallery: Browse looks, and a look's details ---------------- */
  const gallery = el('aside.glass', { id: 'ws-gallery', role: 'dialog', 'aria-label': 'Looks', hidden: true });
  root.appendChild(gallery);
  // the gallery and the tray never show together (Astra: contextual panels do not pile up over the model); the tray's looks keep
  function openGallery(tab) { st.gallery = tab || 'featured'; st.detail = null; st.tray = false; st.flip = null; st.surprise = false; st.sshow = null; st.simp = false; stage.endPreview?.(); renderAll(); if (phone) phone.open(gallery); else gallery.querySelector('.gq')?.focus(); }
  function closeGallery() { st.gallery = false; st.detail = null; stage.endPreview?.(); renderAll(); if (phone) { phone.collapse(gallery); phone.open(panel); } }   // the phone comes back to the Colors sheet

  /* ---------------- the compare tray (step 4): two or three finalists, flipped on a still model ---------------- */
  const tray = el('div.glass', { id: 'ws-tray', role: 'dialog', 'aria-label': 'Compare looks', hidden: true });
  root.appendChild(tray);
  const inTray = (l) => trayLooks.some((t) => t.id === l.id);
  function addToTray(l) {
    if (inTray(l)) return false;
    if (trayLooks.length >= TRAY_MAX) { say(`Compare holds ${TRAY_MAX} looks. Remove one first.`); return false; }
    trayLooks.push({ id: l.id, kind: l.kind, name: l.name, colors: l.colors, over: l.over || {} });
    say(`“${l.name}” added to Compare · ${trayLooks.length} of ${TRAY_MAX}.`);
    return true;
  }
  function removeFromTray(id) {
    const i = trayLooks.findIndex((t) => t.id === id); if (i < 0) return;
    trayLooks.splice(i, 1);
    if (st.flip === i) { st.flip = null; stage.endPreview?.(); } else if (st.flip != null && st.flip > i) st.flip--;
  }
  function openTray() { st.gallery = false; st.detail = null; st.surprise = false; st.sshow = null; st.simp = false; st.tray = true; st.flip = null; stage.endPreview?.(); renderAll(); if (phone) phone.open(tray); }
  function closeTray() { st.tray = false; st.flip = null; stage.endPreview?.(); renderAll(); if (phone) { phone.collapse(tray); phone.open(panel); } }   // the phone comes back to the Colors sheet
  /* a flip SHOWS a finalist (previewPalette: never saved, never in the history) and touches nothing else: no renderAll, so
     the safe area is never set and the camera stays where the visitor left it (the plan: "the camera held still") */
  function flipTo(i) {
    if (i == null || i === st.flip) { st.flip = null; stage.endPreview?.(); }
    else { st.flip = i; stage.previewPalette(asLook(trayLooks[i])); }
    renderTray(); if (phone) phone.refresh();
  }
  /* Apply from the tray: through the gallery look it came from when that still exists (a preset's apply sends its event, a
     saved look's its layer), else as a scheme of its own colours; one undo step either way (commitColors flushes around it) */
  function applyFromTray(t) {
    const l = looksList().find((x) => x.id === t.id) || { ...t, apply: () => commitColors('scheme', () => stage.setPalette({ colors: t.colors, over: t.over, on: true })) };
    st.flip = null; applyLook(l); renderAll();
  }
  function renderTray() {
    if (!st.tray) { tray.hidden = true; return; }
    tray.hidden = false; tray.replaceChildren();
    const p = pal();
    const flipped = st.flip != null ? trayLooks[st.flip] : null;
    const row = el('div.trow', { role: 'list' });
    trayLooks.forEach((t, i) => {
      const shown = st.flip === i, worn = p.on && wears(p, t);
      const cv = el('canvas.render', { width: CARD.w, height: CARD.h, 'aria-hidden': 'true' });
      cards.want(cv, asLook(t), CARD.w, CARD.h);
      row.appendChild(el('div.tcard' + (shown ? '.on' : ''), { role: 'listitem' }, [
        el('button.pick', { title: shown ? 'Put the chosen look back' : `Show “${t.name}” on the model`, 'aria-pressed': String(shown), onclick: () => flipTo(i) }, [
          cv,
          el('div.lrow', {}, [el('span.lname', { text: t.name }), worn ? el('span.badge.active', { text: 'ACTIVE' }) : shown ? el('span.badge.shown', { text: 'SHOWN' }) : null]),
        ]),
        el('button.x', { title: 'Remove from Compare', 'aria-label': `Remove ${t.name} from Compare`, onclick: () => { removeFromTray(t.id); renderTray(); if (phone) phone.refresh(); } }, [icon('x', { size: 14 })]),
      ]));
    });
    tray.append(
      el('div.ihead', {}, [el('b', { text: `Compare · ${trayLooks.length} of ${TRAY_MAX}` }), el('span.sub', { text: 'Click a look to see it on the model. The view stays put.' }), el('button.x', { 'aria-label': 'Close Compare', title: 'Close', onclick: closeTray }, [icon('x', { size: 16 })])]),
      trayLooks.length ? row : el('p.note', { text: 'No looks here yet. Browse looks and press + on two or three.' }),
      el('div.tacts', {}, [
        el('button.key.sm.current' + (st.flip == null ? '.on' : ''), { text: 'Current', title: 'The chosen look, as the model wears it', 'aria-pressed': String(st.flip == null), onclick: () => flipTo(null) }),
        el('button.key.sm.strong.apply', { text: flipped ? `Apply “${flipped.name}”` : 'Apply the shown look', disabled: !flipped || (p.on && wears(p, flipped)), title: 'Dress the whole build in the shown look · one undo step', onclick: () => { if (flipped) applyFromTray(flipped); } }),
        el('button.key.sm.browse', { text: 'Browse looks', title: 'Back to the gallery; the tray keeps its looks', onclick: () => openGallery('featured') }),
        p.on && trayLooks.length < TRAY_MAX ? el('button.key.sm.addcur', { text: 'Add current look', title: 'Keep the look the model wears now as a finalist', disabled: trayLooks.some((t) => wears(p, t)), onclick: () => { if (addToTray({ id: 'current:' + Date.now(), kind: 'current', name: lookName(p), colors: p.colors, over: p.over })) renderTray(); } }) : null,
      ]),
    );
  }
  /* a hovered or focused card shows its look on the model; leaving it puts the chosen look back, unless details are open
     (the details keep their look shown while they are up) */
  const show = (look) => { if (!st.detail) stage.previewPalette(asLook(look)); };
  const unshow = () => { if (!st.detail) stage.endPreview?.(); };
  /* the filament rows of a look as THIS build would wear it: a swatch, the name, the parts, a plain "Buy ↗" (rel=sponsored on a
     paid host; the disclosure is the one line under the rows, `disclosure` below) */
  function filamentRows(fc) {
    return [
      ...fc.filaments.map((f) => el('div.frow.well', {}, [el('span.sw' + silk(f.name), { style: `background:${f.hex}` }), el('div.col', {}, [el('b', { text: f.name }), el('span.meta', { text: f.keys.map(keyLabel).join(' · ') })]), f.url ? el('a.link', { href: f.url, target: '_blank', rel: isPaid(f.url) ? 'noopener sponsored' : 'noopener', text: 'Buy ↗', onclick: buyFilament(stage, f) }) : null])),
      // printed, but with no filament chosen: a region left on its instruction colour, a label stripe (the label's own colour)
      ...fc.unpicked.map((u) => el('div.frow.well.bare', {}, [el('span.sw', { style: `background:${u.hex}` }), el('div.col', {}, [el('b', { text: u.stripe ? 'Label stripe' : keyLabel(u.key) }), el('span.meta', { text: u.stripe ? `Printed in the label’s own colour, ${u.hex}` : 'No filament picked yet' })])])),
    ];
  }
  /* the one line under the rows: Amazon's sentence, the Polymaker sentence, both, or nothing (disclosureFor, the wording at the top) */
  const disclosure = (fc) => el('span.disc', { text: disclosureFor(fc.filaments.map((f) => f.url)) });
  function renderGallery() {
    document.documentElement.classList.toggle('ws-gallery', (!!st.gallery || st.surprise) && !phone);   // the view tools step aside (app.css); Surprise me takes the gallery's spot
    if (!st.gallery) { gallery.hidden = true; return; }
    gallery.hidden = false;
    gallery.replaceChildren();
    if (st.detail) { renderDetail(); return; }
    const p = pal();
    const all = looksList().map((l) => ({ ...l, count: stage.filamentsInBuild(asLook(l)).count }));
    const tab = st.gallery;
    const grid = el('div.lgrid', { role: 'list' });
    // the grid alone follows the search box, so the box is never rebuilt under the caret (Sol 01a14f91: a rebuilt, refocused
    // input put the caret at the end after every character)
    const fillGrid = () => {
      const q = st.gq.trim().toLowerCase();
      const shown = all.filter((l) => (tab === 'featured' ? l.kind === 'preset' : tab === 'mine' ? l.kind !== 'preset' : true))
        .filter((l) => !st.fmax || l.count <= st.fmax)
        .filter((l) => !q || l.name.toLowerCase().includes(q) || Object.values(l.colors).some((f) => f && f.name && f.name.toLowerCase().includes(q)));
      grid.replaceChildren();
      for (const l of shown) {
        const on = p.on && wears(p, l);
        const cv = el('canvas.render', { width: CARD.w, height: CARD.h, 'aria-hidden': 'true' });
        cards.want(cv, asLook(l), CARD.w, CARD.h);
        const held = inTray(l);
        grid.appendChild(el('div.lwrap', { role: 'listitem' }, [
          el('button.lcard.key' + (on ? '.on' : ''), { title: `${l.name} · ${n(l.count, 'filament')} on this build`, 'aria-label': `${l.name}, ${n(l.count, 'filament')}${on ? ', the current look' : ''}`,
            onpointerenter: () => show(l), onpointerleave: unshow, onfocus: () => show(l), onblur: unshow,
            onclick: () => { st.detail = l; stage.previewPalette(asLook(l)); renderGallery(); gallery.querySelector('.back')?.focus(); } }, [
            cv,
            el('div.lrow', {}, [el('span.lname', { text: l.name }), on ? el('span.badge.active', { text: 'ACTIVE' }) : el('span.lcount', { text: String(l.count), title: n(l.count, 'filament') })]),
          ]),
          // the tray's corner button (step 4): a finalist in, or out again; the head's Compare count follows
          el('button.cmp' + (held ? '.on' : ''), { title: held ? 'Remove from Compare' : 'Add to Compare', 'aria-label': `${held ? 'Remove' : 'Add'} ${l.name} ${held ? 'from' : 'to'} Compare`, 'aria-pressed': String(held), onclick: () => { if (held) removeFromTray(l.id); else if (!addToTray(l)) return; fillGrid(); syncCmp(); } }, [icon(held ? 'check' : 'plus', { size: 14 })]),
        ]));
      }
      if (!shown.length) grid.appendChild(el('p.note', { text: tab === 'mine' && !all.some((l) => l.kind !== 'preset') ? 'No looks of your own yet. Pick a few colours, then Save on the Colors panel.' : 'No look matches.' }));
    };
    const cmpBtn = el('button.key.sm.cmp-open', { title: 'Compare the finalists on the model, one at a time', onclick: openTray });
    const syncCmp = () => { cmpBtn.textContent = trayLooks.length ? `Compare (${trayLooks.length})` : 'Compare'; cmpBtn.disabled = !trayLooks.length; };
    syncCmp();
    gallery.append(
      el('div.head', {}, [el('h2', { text: 'Looks' }), el('span.sub', { text: 'Every look is shown on this build.' }), cmpBtn, el('button.x', { title: 'Close', 'aria-label': 'Close the looks', onclick: closeGallery }, [icon('x', { size: 16 })])]),
      el('div.track.seg3.gtabs', { role: 'tablist', 'aria-label': 'Which looks' }, [['featured', 'Featured'], ['mine', 'My looks'], ['all', 'All looks']].map(([id, label]) => el('button.seg' + (tab === id ? '.on' : ''), { role: 'tab', 'aria-selected': String(tab === id), text: label, onclick: () => { st.gallery = id; renderGallery(); } }))),
      el('div.gfilter', {}, [
        el('input.gq.search', { type: 'search', placeholder: 'Search looks', value: st.gq, 'aria-label': 'Search looks', oninput: (e) => { st.gq = e.target.value; fillGrid(); } }),
        el('div.track.seg4.fmax', { role: 'group', 'aria-label': 'Filaments at most' }, [[0, 'Any'], [2, '≤ 2'], [3, '≤ 3'], [4, '≤ 4']].map(([v, label]) => el('button.seg.sm' + (st.fmax === v ? '.on' : ''), { text: label, title: v ? `Looks this build prints in ${v} filaments or fewer` : 'Every look', onclick: () => { st.fmax = v; renderGallery(); } }))),
      ]),
      grid,
    );
    fillGrid();
  }
  function renderDetail() {
    const l = st.detail; const look = asLook(l);
    const fc = stage.filamentsInBuild(look);
    const p = pal(); const on = p.on && wears(p, l);
    const hero = el('canvas.render', { width: HERO.w, height: HERO.h, 'aria-label': `This build in ${l.name}` });
    cards.want(hero, look, HERO.w, HERO.h);
    const translucent = fc.filaments.filter((f) => TRANSLUCENT.has(f.name)).map((f) => short(f.name));
    gallery.append(...[
      el('div.head', {}, [
        // a candidate's details (step 5b) go back to Find your next look, not to the gallery grid
        el('button.back.key.sm', { title: l.kind === 'surprise' ? 'Back to Find your next look' : 'Back to the looks', onclick: () => { if (l.kind === 'surprise') { st.detail = null; st.gallery = false; openSurprise(); return; } st.detail = null; stage.endPreview?.(); renderGallery(); } }, [l.kind === 'surprise' ? '← Find your next look' : '← Looks']),
        el('h2', { text: l.name }),
        el('button.x', { title: 'Close', 'aria-label': 'Close the looks', onclick: closeGallery }, [icon('x', { size: 16 })]),
      ]),
      el('div.lookcard.well.big', {}, [hero, el('div.lrow', {}, [el('span.lcount.badge', { text: n(fc.count, 'filament') + ' on this build' }), on ? el('span.badge.active', { text: 'ACTIVE' }) : null])]),
      el('div.dacts', {}, [
        el('button.key.sm.strong.apply', { text: on ? 'Applied' : 'Apply this look', disabled: on, title: 'Dress the whole build in this look · one undo step', onclick: () => { st.detail = null; st.gallery = false; applyLook(l); renderAll(); if (phone) { phone.collapse(gallery); phone.open(panel); } } }),   // the phone comes back to the Colors sheet (Terra 01a14f96)
        el('button.key.sm.cmp' + (inTray(l) ? '.on' : ''), { title: inTray(l) ? 'In Compare already' : 'Keep this look as a finalist to flip against the others', disabled: inTray(l), onclick: () => { if (addToTray(l)) renderGallery(); } }, [icon(inTray(l) ? 'check' : 'plus', { size: 14 }), inTray(l) ? 'In Compare' : 'Add to Compare']),
        l.del ? el('button.key.sm.del', { text: 'Delete', title: 'Forget this saved look (the colours on the model stay)', onclick: () => { l.del(); removeFromTray(l.id); st.detail = null; stage.endPreview?.(); say(`Deleted “${l.name}”.`); renderAll(); } }) : null,
      ]),
      el('h3.h2', { text: 'Shop this look' }),
      el('div.frows', {}, filamentRows(fc)),
      disclosure(fc),
      el('p.note', { text: 'Colours on screen are approximate, and the look card is drawn without shadows; the Day Grid plate shows them truest.' }),
      el('p.note', { text: 'Looks only: whether a filament suits a part (strength, heat, flex) is a separate question.' }),
      translucent.length ? el('p.note', { text: `${translucent.join(', ')} ${translucent.length === 1 ? 'is' : 'are'} translucent; the card shows ${translucent.length === 1 ? 'it' : 'them'} solid.` }) : null,
    ].filter(Boolean));   // append(null) writes the word "null": every look without a translucent filament showed it under this footer (Joey saw it live, 2026-10-24)
  }

  /* ---------------- Surprise me (step 5): three looks under the visitor's constraints ---------------- */
  const sur = el('aside.glass', { id: 'ws-surprise', role: 'dialog', 'aria-label': 'Surprise me', hidden: true });
  root.appendChild(sur);
  const owned = () => readOwned(storage(), LABELS);
  // the panel takes the gallery's spot and closes it and the tray (contextual panels do not pile up over the model)
  function openSurprise() { st.gallery = false; st.detail = null; st.tray = false; st.flip = null; st.simp = false; st.surprise = true; st.owning = false; st.sshow = null; stage.endPreview?.(); if (!sp.cands.length || !ownedHolds()) roll(); renderAll(); if (phone) phone.open(sur); }
  function closeSurprise() { if (st.owning) leaveOwned(); st.surprise = false; st.owning = false; st.sshow = null; stage.endPreview?.(); renderAll(); if (phone) { phone.collapse(sur); phone.open(panel); } }   // the phone comes back to the Colors sheet
  /* "only filaments I own" against the candidates and the list as they stand: false when the list has shrunk under them (a
     filament unticked, the list cleared), so the candidates are rolled again rather than kept to be Kept (Sol 01a150df) */
  function ownedHolds() {
    if (!sp.ownedOnly) return true;
    const have = new Set(owned()); if (have.size < 2) return false;
    const held = new Set(Object.values(sp.locks).map((f) => f.name));
    return sp.cands.every((c) => Object.entries(c.colors).every(([k, f]) => k === 'Magnet' || k === 'Screw' || have.has(f.name) || held.has(f.name)));
  }
  /* every way out of the owned editor (its Back, Escape, the close button) goes through here: the switch drops when the list
     is under two, and the candidates are rolled again when the list changed under the switch */
  function leaveOwned() { st.owning = false; if (sp.ownedOnly && owned().length < 2) sp.ownedOnly = false; if (sp.ownedOnly && owned().join('|') !== st.ownedWas) roll(); }
  function enterOwned() { st.owning = true; st.ownedWas = owned().join('|'); renderSurprise(); if (phone) phone.refresh(); }
  /* a roll: the three interpretations of the style for the settings, a new seed each time; "More like this" keeps a
     candidate's accent colour and interpretation on other shells. A roll never touches the safe area (no renderAll), so the
     camera stays (the plan: a look is judged on a still model) */
  function roll(like = null) {
    sp.like = like; sp.seed = (Math.random() * 2 ** 32) >>> 0;
    const r = surprise({ style: sp.style, cap: sp.cap, owned: sp.ownedOnly ? owned() : null, locks: sp.locks, like, seed: sp.seed });
    sp.cands = r.looks.map((l, i) => ({ id: `surprise:${sp.seed}:${i}`, kind: 'surprise', name: l.name, colors: l.colors, over: {}, roles: l.roles, accent: l.accent, slot: l.slot, share: l.share }));
    sp.short = r.short;
    st.sshow = null; stage.endPreview?.();
  }
  const reroll = (like = null) => { roll(like); renderSurprise(); if (phone) phone.refresh(); };
  /* a candidate SHOWN on the model (previewPalette, as a tray flip): hovering shows one while none is pinned; a click pins it */
  function showCand(i) {
    if (i == null || i === st.sshow) { st.sshow = null; stage.endPreview?.(); }
    else { st.sshow = i; stage.previewPalette(asLook(sp.cands[i])); }
    renderSurprise(); if (phone) phone.refresh();
  }
  /* Use this look: the look on the build as a scheme of its own (one undo step; commitColors flushes around it); the panel
     stays and the card reads ACTIVE, so the next one can be compared against it */
  const keepLook = (c) => commitColors('scheme', () => stage.setPalette({ colors: c.colors, over: {}, on: true }));
  function keep(c) { st.sshow = null; applyLook({ name: c.name, apply: () => keepLook(c) }); renderAll(); }
  /* Details: the gallery's look details for a candidate (the filament list with buy links, the notes); its Back comes back here */
  function candDetail(c) { st.detail = { id: c.id, kind: 'surprise', name: c.name, colors: c.colors, over: {}, apply: () => keepLook(c) }; st.gallery = 'featured'; st.surprise = false; st.sshow = null; stage.previewPalette(asLook(c)); renderAll(); if (phone) { phone.collapse(sur); phone.open(gallery); } gallery.querySelector('.back')?.focus(); }
  function renderSurprise() {
    if (!st.surprise) { sur.hidden = true; return; }
    sur.hidden = false; sur.replaceChildren();
    if (st.owning) { renderOwned(); return; }
    const p = pal(); const list = owned();
    const have = new Set(stage.keysInBuild().filter((k) => !k.locked).map((k) => k.key));
    sur.append(
      el('div.head', {}, [el('h2', { text: 'Find your next look' }), el('span.sub', { text: 'Three colour combinations, made for your build.' }), el('button.x', { title: 'Close', 'aria-label': 'Close Find your next look', onclick: closeSurprise }, [icon('x', { size: 16 })])]),
      // the styles as tiles (Astra: "a small palette tile with three swatches, so users can understand the choice without reading")
      el('div.srow.stylerow', {}, [el('span.lbl', { text: 'Style' }), el('div.styles', { role: 'radiogroup', 'aria-label': 'Style' }, STYLES.map((s) => el('button.stile' + (sp.style === s.id ? '.on' : ''), { role: 'radio', 'aria-checked': String(sp.style === s.id), title: s.hint, onclick: () => { if (sp.style !== s.id) { sp.style = s.id; reroll(); } } }, [el('span.sw3', {}, s.swatches.map((h) => el('i', { style: `background:${h}` }))), el('span.sname', { text: s.name })])))]),
      // the cap is the visitor's: the planner cannot know a printer's colour count (the plan)
      el('div.srow', {}, [el('span.lbl', { text: 'Use up to' }), el('div.track.seg3.cap', { role: 'group', 'aria-label': 'Filaments at most' }, CAPS.map((c) => el('button.seg.sm' + (sp.cap === c ? '.on' : ''), { text: `${c} filaments`, title: `At most ${c} filaments, printed · you know your printer's colours`, 'aria-pressed': String(sp.cap === c), onclick: () => { if (sp.cap !== c) { sp.cap = c; reroll(); } } })))]),
      el('div.srow.ownedrow', {}, [
        el('label.chk', { title: list.length < 2 ? 'Tick two or more filaments you own first' : 'Only the filaments on your list' }, [
          el('input.ownedonly', { type: 'checkbox', checked: sp.ownedOnly && list.length >= 2 ? true : null, disabled: list.length < 2, onchange: (e) => { sp.ownedOnly = e.target.checked; reroll(); } }),
          el('span', { text: 'Only filaments I own' }), el('span.cnt', { text: ` (${list.length})` }),
        ]),
        el('button.key.sm.edit', { title: 'Tick the filaments you have', onclick: enterOwned }, [icon('pencil-simple', { size: 14 }), 'Edit']),
      ]),
      // the feet's TPU is every look's, outside the cap and the owned list (surprise.js ROLE_KEYS.feet): a card's count, the
      // one count (D2), is every spool this build prints in, so it can read one above the cap (Joey, 2026-10-21)
      ...(have.has('Foot') ? [el('p.note.feetcap', { text: 'The feet print in TPU95 Black in every look, on top of the cap and the filaments you own.' })] : []),
      // locks: the regions that drive a look and that this build has, each holding the filament it wears now
      el('div.locks', {}, [el('span.lbl', { text: 'Keep these colours', title: 'Hold a region at the filament it wears now; every look keeps it' }), el('div.chips', {}, LOCKS.filter(([key]) => have.has(key)).map(([key, role, label]) => {
        const held = sp.locks[role]; const cur = worn(key) || (key.includes(':') ? worn(key.split(':')[0]) : null); const f = held || cur;
        return el('button.lchip' + (held ? '.on' : ''), { disabled: !held && !cur, 'aria-pressed': String(!!held), title: held ? `${label} stays ${short(held.name)} · click to free it` : cur ? `Keep the ${label.toLowerCase()} ${short(cur.name)} in every look` : `Pick a filament for the ${label.toLowerCase()} first`, onclick: () => { if (held) delete sp.locks[role]; else sp.locks[role] = { name: cur.name, hex: cur.hex, url: cur.url }; reroll(); } }, [icon('lock-simple', { size: 12 }), f ? el('i', { style: `background:${f.hex}` }) : null, label]);
      }))]),
    );
    const cands = el('div.cands', { role: 'list' });
    sp.cands.forEach((c, i) => {
      const on = p.on && wears(p, c); const shown = st.sshow === i;
      const cv = el('canvas.render', { width: CARD.w, height: CARD.h, 'aria-hidden': 'true' });
      cards.want(cv, asLook(c), CARD.w, CARD.h);
      const count = stage.filamentsInBuild(asLook(c)).count;   // the one count (D2): what THIS build prints in under the look
      cands.appendChild(el('div.cand' + (shown ? '.on' : ''), { role: 'listitem' }, [
        el('button.pick', { title: shown ? 'Put the chosen look back' : `Show “${c.name}” on the model`, 'aria-pressed': String(shown),
          onpointerenter: () => { if (st.sshow == null) stage.previewPalette(asLook(c)); }, onpointerleave: () => { if (st.sshow == null) stage.endPreview?.(); }, onclick: () => showCand(i) }, [
          cv,
          el('span.lname', { text: c.name, title: c.name }),
          el('div.lrow', {}, [el('span.lcount', { text: n(count, 'filament') }), on ? el('span.badge.active', { text: 'ACTIVE' }) : shown ? el('span.badge.shown', { text: 'SHOWN' }) : null]),
        ]),
        el('div.cacts', {}, [
          el('button.key.sm.strong.keep', { text: on ? 'In use' : 'Use this look', disabled: on, title: 'Dress the whole build in this look · one undo step', onclick: () => keep(c) }),
          el('button.key.sm.like', { text: 'More like this', title: `Three more with ${shortName(c.accent)} as the accent, on other shells`, onclick: () => reroll({ accent: c.accent, slot: c.slot, notShell: c.roles.shell }) }),
          el('button.key.sm.detail', { text: 'Details', title: 'The filaments of this look, with where to buy them', onclick: () => candDetail(c) }),
        ]),
      ]));
    });
    const fix = ' Free a colour, allow more filaments or add to the filaments you own.';
    if (sp.cands.length) sur.appendChild(cands);
    if (sp.short) sur.appendChild(el('p.note.short', { text: (sp.cands.length ? `Only ${n(sp.cands.length, 'look fits', 'looks fit')} these settings.` : 'No look fits these settings.') + fix }));
    sur.appendChild(el('div.sacts', {}, [el('button.key.sm.strong.again', { title: 'Three more looks in this style', onclick: () => reroll() }, [icon('arrow-clockwise', { size: 14 }), 'Show three more']), el('span.note', { text: 'Hover or tap a look to see it on the model; the view stays put. Looks follow the planner’s colour rules; whether a filament suits a part is a separate question.' })]));
  }
  /* the owned list: every catalog colour by brand, ticked or not; kept in this browser (js/state/owned.js) */
  function renderOwned() {
    const count = el('span.sub.ocount');
    const sync = () => { const l = owned(); count.textContent = n(l.length, 'filament'); clear.disabled = !l.length; };
    const back = () => { leaveOwned(); renderSurprise(); if (phone) phone.refresh(); };
    const clear = el('button.key.sm.clear', { text: 'Clear all', title: 'Untick every filament', onclick: () => { writeOwned(storage(), []); sync(); fill(); } });
    sur.append(
      el('div.head', {}, [el('button.back.key.sm', { title: 'Back to Surprise me', onclick: back }, ['← Surprise me']), el('h2', { text: 'Filaments I own' }), count, el('button.x', { title: 'Close', 'aria-label': 'Close Surprise me', onclick: closeSurprise }, [icon('x', { size: 16 })])]),
      el('input.search.oq', { type: 'search', placeholder: 'Search filaments', value: st.oq, 'aria-label': 'Search filaments', oninput: (e) => { st.oq = e.target.value; fill(); } }),
    );
    const brands = el('div.brands'); sur.appendChild(brands);
    // the brands alone follow the search box, so the box is never rebuilt under the caret (the gallery's lesson, Sol 01a14f91)
    const fill = () => {
      brands.replaceChildren();
      const q = st.oq.trim().toLowerCase(); const have = new Set(owned());
      let any = false;
      for (const brand of FILAMENT_DB) {
        const colors = q ? brand.colors.filter((f) => `${brand.brand} ${brand.line} ${f.label}`.toLowerCase().includes(q)) : brand.colors;
        if (!colors.length) continue;
        any = true;
        const mine = brand.colors.filter((f) => have.has(f.label)).length;
        brands.appendChild(el('div.bhead', {}, [el('span', {}, [brand.brand, el('i', { text: ` ${brand.line} · ${mine ? `${mine} of ${brand.colors.length}` : brand.colors.length}` }), matTags(brand)])]));
        brands.appendChild(el('div.swatches', {}, colors.map((f) => { const on = have.has(f.label); return el('button.sw' + (on ? '.own' : '') + silk(f.label), { style: `background:${f.hex}`, title: f.label + (on ? ' · owned' : ''), 'aria-label': f.label, 'aria-pressed': String(on), onclick: () => { const cur = owned(); writeOwned(storage(), on ? cur.filter((x) => x !== f.label) : [...cur, f.label]); sync(); fill(); } }); })));
      }
      if (!any) brands.appendChild(el('p.note', { text: 'No filaments match.' }));
    };
    fill(); sync();
    sur.appendChild(el('div.ofoot', {}, [clear, el('span.note', { text: 'Kept in this browser. With two or more ticked, Surprise me can stay inside your shelf.' })]));
  }

  /* ---------------- Simplify (step 6): the look in fewer filaments, shown before it is applied ---------------- */
  const simp = el('div.glass', { id: 'ws-simplify', role: 'dialog', 'aria-label': 'Simplify', hidden: true });
  root.appendChild(simp);
  // the panel takes the tray's spot and closes the gallery, the tray and Find your next look (panels do not pile up)
  function openSimplify() { st.gallery = false; st.detail = null; st.tray = false; st.flip = null; st.surprise = false; st.sshow = null; st.simp = true; st.simpTarget = Math.max(2, stage.filamentsInBuild().count - 1); stage.endPreview?.(); renderAll(); if (phone) phone.open(simp); }
  function closeSimplify() { st.simp = false; st.simpTarget = null; stage.endPreview?.(); renderAll(); if (phone) { phone.collapse(simp); phone.open(panel); } }   // the phone comes back to the Colors sheet
  const proposal = () => { const p = pal(); return simplify({ colors: p.colors, over: p.over || {}, keys: stage.keysInBuild(), target: st.simpTarget }); };
  /* the regions a change touches, in the summary's words ("Handles, small parts") */
  const regionWords = (keys) => { const words = []; for (const [word, ks] of SUMMARY) if (ks.some((k) => keys.includes(k)) && !words.includes(word)) words.push(word); const extra = keys.filter((k) => !SUMMARY.some(([, ks]) => ks.includes(k))).map(keyLabel); return [...words, ...extra].map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(', '); };
  function renderSimplify() {
    if (!st.simp) { simp.hidden = true; return; }
    simp.hidden = false; simp.replaceChildren();
    const now = stage.filamentsInBuild().count;
    const r = proposal();
    // the rows read original → final per filament, keys grouped, however many steps the proposal took (a filament merged
    // into one that is then merged itself shows once, where it ends up)
    const p0 = pal(); const keys = stage.keysInBuild(); const w0 = wornLook(p0.colors, keys, p0.over || {}), w1 = wornLook(r.colors, keys, r.over);
    const rows = new Map();   // a unit's own pick that moves counts as "an own pick" on its row rather than a region
    for (const k of Object.keys(w0)) if (w1[k] && w1[k].name !== w0[k].name) { const id = w0[k].name + '|' + w1[k].name; let row = rows.get(id); if (!row) rows.set(id, row = { from: w0[k], to: w1[k], keys: [], own: 0 }); if (k.includes('@')) row.own++; else row.keys.push(k); }
    // the proposal is SHOWN on the model while the panel is up (previewPalette: never saved, never in the history), so the
    // visitor sees exactly what would change before saying yes; a proposal with no change shows the look as it is
    if (r.changes.length) stage.previewPalette({ colors: r.colors, over: r.over }); else stage.endPreview?.();
    const after = r.changes.length ? stage.filamentsInBuild({ colors: r.colors, over: r.over }).count : now;
    const targets = []; for (let t = now - 1; t >= 2; t--) targets.push(t);
    simp.append(
      el('div.ihead', {}, [el('b', { text: 'Simplify' }), el('span.sub', { text: `${n(now, 'filament')} now` }), el('button.x', { 'aria-label': 'Close Simplify', title: 'Close', onclick: closeSimplify }, [icon('x', { size: 16 })])]),
      targets.length ? el('div.srow', {}, [el('span.lbl', { text: 'Down to' }), el('div.track.tgt', { role: 'group', 'aria-label': 'Filaments', style: `grid-template-columns: repeat(${targets.length}, minmax(0, 1fr))` }, targets.map((t) => el('button.seg.sm' + (st.simpTarget === t ? '.on' : ''), { text: n(t, 'filament'), 'aria-pressed': String(st.simpTarget === t), onclick: () => { if (st.simpTarget !== t) { st.simpTarget = t; renderSimplify(); if (phone) phone.refresh(); } } })))]) : el('p.note', { text: 'This look already prints in two filaments; a shelf deck or label text needs a colour that reads against its background, so two is the floor.' }),
      rows.size ? el('div.changes', { role: 'list' }, [...rows.values()].map((c) => el('div.chg', { role: 'listitem' }, [el('span.sw' + silk(c.from.name), { style: `background:${c.from.hex}` }), el('span.arrow', { text: '→' }), el('span.sw' + silk(c.to.name), { style: `background:${c.to.hex}` }), el('span.what', {}, [el('b', { text: regionWords(c.keys) + (c.own ? (c.keys.length ? ' and ' : '') + n(c.own, 'own pick') : '') }), `: ${shortName(c.from.name)} → ${shortName(c.to.name)}`])]))) : null,
      // what fewer filaments reduces, exactly: spools to own and load, not necessarily colour changes in a print (Astra, 2026-10-19)
      el('p.note.outcome', { text: r.short ? `${r.reason} This look stops at ${n(r.count, 'filament')}.` : r.changes.length ? `${n(after, 'filament')} after this, as the model shows it now. Nothing else changes. Fewer filaments means fewer spools to own and load; colour changes within one print depend on which parts print together.` : 'Nothing to change.' }),
      el('div.tacts', {}, [
        el('button.key.sm.strong.apply', { text: r.changes.length ? `Apply · ${n(after, 'filament')}` : 'Apply', disabled: !r.changes.length, title: 'Make these changes · one undo step', onclick: () => { const q = proposal(); if (!q.changes.length) return; const was = lookName(pal()).replace(/ · edited$/, ''); if (!/^(Custom look|Instruction colors)$/.test(was)) lastLook = was; st.simp = false; st.simpTarget = null; commitColors('scheme', () => stage.setPalette({ colors: q.colors, over: q.over, on: true })); say(`Simplified to ${n(stage.filamentsInBuild().count, 'filament')}.`); renderAll(); if (phone) { phone.collapse(simp); phone.open(panel); } } }),   // the panel then reads "<the look> · edited" (decision D4)
        el('button.key.sm.cancel', { text: 'Cancel', title: 'Keep the look as it is', onclick: closeSimplify }),
      ]),
    );
  }

  /* ---------------- the picker (replaces the inspector) ---------------- */
  const picker = el('aside.glass.glass-edge', { id: 'ws-picker', 'aria-label': 'Filament picker', hidden: true });
  root.appendChild(picker);
  function openPicker(key) { st.key = key; st.swap = null; st.query = ''; st.mat = 'all'; renderAll(); if (phone) phone.open(picker); }   // the search and the material chip start afresh per region
  function closePicker() { st.key = null; st.swap = null; renderAll(); if (phone) phone.collapse(picker); }
  /* THE SPOOL'S FILAMENT, EVERYWHERE (Joey 2026-10-26: "what if i could select a spool and change it's color, and doing so
     would replace everything in the build that used that same color, kind of a handy feature"). A spool in the room is a
     colour (done.js onSpool); what the build prints in it is every filament picked in that colour and every region still
     in an instruction colour of it (filamentsInBuild; a label's stripe is not a region). The feet's TPU is its own: a
     spool of it lists TPU only and changes the feet only, and no other spool reaches the feet. */
  function swapTarget(hex) {
    const h = String(hex).toLowerCase(), fc = stage.filamentsInBuild();
    const fil = fc.filaments.filter((f) => f.hex.toLowerCase() === h), bare = fc.unpicked.filter((u) => !u.stripe && u.hex.toLowerCase() === h);
    // a label stripe's spool is the label palette's (the Labels workspace), not a Colors pick: never swapped from here
    const keys = [...new Set([...fil.flatMap((f) => f.keys), ...bare.map((u) => u.key)])].filter((k) => !/:STRIPE@/.test(k));
    if (!keys.length) return null;
    const feet = keys.every(isFeet);
    return { hex: h, names: fil.map((f) => f.name), bare: bare.map((u) => u.key).filter((k) => isFeet(k) === feet), keys: keys.filter((k) => isFeet(k) === feet), feet, url: fil.length ? fil[0].url : null };
  }
  function openSwap(hex) {
    const t = swapTarget(hex);
    if (!t) {
      const h = String(hex).toLowerCase(), fc = stage.filamentsInBuild();
      /* a spool that prints only label stripes is the LABEL PALETTE's (2026-10-28): its meaning's row opens in Labels, the
         spool's picker open, so the spool is changed where every stripe of that meaning takes it */
      const sp = fc.filaments.find((f) => f.hex.toLowerCase() === h && f.keys.some((k) => /:STRIPE@/.test(k)));
      const ms = sp ? [...new Set(sp.keys.map((k) => (/:STRIPE@([a-z-]+)$/.exec(k) || [])[1]).filter(Boolean))] : [];
      // one meaning: its row's picker; a spool two meanings share: the rows, none guessed (the palette says they share it)
      if (ms.length) { if (ctx.memo) ctx.memo.labelPalette = { pick: ms.length === 1 ? ms[0] : null }; ctx.switchTo('labels'); return; }
      // a stripe in a colour the palette does not hold (one the Label Studio has and the planner does not offer): its own
      if (fc.unpicked.some((u) => u.stripe && u.hex.toLowerCase() === h)) say('That spool prints the label stripes: their colour is set on each label, in Labels.');
      return;
    }
    st.swap = t; st.key = null; st.query = ''; st.mat = 'all'; renderAll(); if (phone) phone.open(picker);
  }
  if (new URLSearchParams(location.search).get('debug')) window.__GEN2_SPOOL_TAP__ = openSwap;   // the room's spool tap, for checks (done.js onSpool)
  function swapTo(f) {
    const t = st.swap; if (!t) return;
    const fil = { name: f.label || f.name, hex: f.hex, url: f.url };
    const mine = (k, c) => c && t.names.includes(c.name) && isFeet(k) === t.feet;
    commitColors('color', () => {
      const p = pal(), map = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, c]) => [k, mine(k, c) ? { ...fil } : c]));
      stage.setPalette({ colors: { ...map(p.colors), ...Object.fromEntries(t.bare.map((k) => [k, { ...fil }])) }, over: Object.fromEntries(Object.entries(p.over || {}).map(([u, o]) => [u, map(o)])), on: true });
    });
    st.swap = swapTarget(fil.hex) || null;   // the picker stays on the spool, now in its new filament, for another try
    renderAll();
  }
  function renderPicker() {
    picker.replaceChildren();
    const key = st.key, swap = st.swap;
    if (room && room.handle && room.handle.selectSpool) room.handle.selectSpool(swap ? swap.hex : null);   // the spool whose picker this is, lit in the room
    if (!key && !swap) { picker.hidden = true; return; }
    picker.hidden = false;
    if (swap) { renderSwap(swap); return; }
    const keys = stage.keysInBuild(); const k = keys.find((x) => x.key === key); const count = k ? k.count : 0; const own = k ? k.own : 0;
    const uid = unitOfSel(); if (uid == null) st.scope = 'all';
    const unitPick = uid != null ? (pal().on && pal().over[uid] && pal().over[uid][key]) || null : null;
    const w = st.scope === 'unit' ? (unitPick || null) : worn(key);   // what the chosen scope is wearing
    const scopeText = st.scope === 'unit' ? `This ${unitWord()} only${unitNo()}` : `All ${typePlural(key)} · ${count}`;
    /* THE MATERIAL CHIPS (Joey, 2026-10-23: "should we also have a way to filter by material type when applicable?"): one
       chip per material the region's lines offer, All first and pressed; no row when they offer one material only (the
       feet's TPU). A chip narrows the brand groups and the In this build row, combines with the search, holds through a
       pick's re-render and starts at All when a picker opens (openPicker). Buttons with aria-pressed: the keyboard reaches
       them; app.css .mrow puts 8 px between them and scrolls the row sideways on the phone */
    const offered = FILAMENT_DB.filter((b) => /TPU/.test(b.line) === isFeet(key));   // TPU for the feet, and only for the feet
    const mats = materialsIn(offered);
    const matRow = mats.length >= 2 ? el('div.mrow', { role: 'group', 'aria-label': 'Material' }, ['all', ...mats].map((m) => el('button.mchip', { 'data-mat': m, title: m === 'all' ? 'Every material' : m === 'TPU' ? 'TPU only: the flexible filament' : `${m} only`, onclick: () => { if (st.mat === m) return; st.mat = m; syncMats(); renderBrands(); } }, [m === 'all' ? null : el('i.mat-dot.' + m.toLowerCase()), m === 'all' ? 'All' : m]))) : null;
    // the pressed state is set on the chips in place, never by rebuilding them: a rebuilt row drops the keyboard's focus to the document (Terra 01a16a51)
    const syncMats = () => { if (matRow) for (const b of matRow.children) { const on = b.dataset.mat === st.mat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } };
    syncMats();
    picker.append(...[
      el('div.head', {}, [el('h2.h2', {}, [el('b.region', { text: regionOf(key) }), ` · ${scopeText}`]), el('button.x', { title: 'Close', 'aria-label': 'Close the picker', onclick: closePicker }, [icon('x', { size: 16 })])]),
      el('div.track.seg2', { role: 'group', 'aria-label': 'Apply to' }, [
        el('button.seg' + (st.scope === 'all' ? '.on' : ''), { text: `All ${typePlural(key)} · ${count}`, onclick: () => { st.scope = 'all'; renderAll(); } }),
        el('button.seg' + (st.scope === 'unit' ? '.on' : ''), { text: uid != null ? `This ${unitWord()} only` : 'This unit only', disabled: uid == null, title: uid == null ? 'Click a part of a unit on the model first' : `Only unit ${unitNo().replace(/[() ]|unit /g, '')} keeps this pick; the other ${typePlural(key)} follow the build colour`, onclick: () => { st.scope = 'unit'; renderAll(); } }),
      ]),
      st.scope === 'unit' ? el('p.note', { text: unitPick ? `This ${unitWord()} wears its own ${regionOf(key).toLowerCase()} colour. The build colour for ${typePlural(key)} is ${worn(key) ? short(worn(key).name) : 'the instruction colour'}.` : `Picks here colour this ${unitWord()} alone; the build colour stays for the others.` }) : (own ? el('p.note', { text: `${n(own, 'unit')} keep${own === 1 ? 's' : ''} ${own === 1 ? 'its' : 'their'} own colour for this region; the build colour applies to the rest.` }) : null),
      // the search and the chips: one row on a phone, stacked on a desktop (app.css .find)
      el('div.find', {}, [el('input.search', { type: 'search', placeholder: 'Search filaments', value: st.query, 'aria-label': 'Search filaments', oninput: (e) => { st.query = e.target.value; renderBrands(); } }), matRow].filter(Boolean)),
      isFeet(key) ? el('p.note.feet', { text: 'Feet print in TPU, the flexible filament, so only TPU is listed. PolyFlex TPU95 Black is the default.' }) : null,
    ].filter(Boolean));   // append(null) writes the word "null" (it showed under the scope switch, 2026-10-17)
    const brands = el('div.brands');
    picker.appendChild(brands);
    const renderBrands = () => fillBrands(brands, { tpu: isFeet(key), active: w ? w.name : null, onPick: (f) => pick(key, f), mat: st.mat });
    renderBrands();
    const pr = plateRow(key);
    if (pr) picker.appendChild(pr);
    const buyUrl = w ? w.url : FILAMENT_DB[0].url;
    picker.appendChild(el('div.foot', {}, [
      el('a.buy', { href: buyUrl, target: '_blank', rel: isPaid(buyUrl) ? 'noopener sponsored' : 'noopener', text: w ? `Buy ${short(w.name)} →` : 'Shop filament →', onclick: buyFilament(stage, w) }),
      el('span.disc', { text: disclosureFor([buyUrl]) }),   // the one line right under the plain Buy: Amazon's sentence or the Polymaker sentence
      el('div.resets', {}, st.scope === 'unit'
        ? [el('button.key.sm', { text: 'Use build colour', title: `Drop this ${unitWord()}’s own ${regionOf(key).toLowerCase()} colour · it follows the build again`, disabled: !unitPick, onclick: () => commitColors('color-unit', () => stage.setOverride(uid, key, null)) })]
        : [el('button.key.sm', { text: isFeet(key) ? 'Reset to TPU95 Black' : 'Reset to instruction colour', title: isFeet(key) ? 'Every foot back to PolyFlex TPU95 Black, own colours included' : `Every ${typePlural(key).replace(/s$/, '')} ${regionOf(key).toLowerCase()} back to the kit’s colour, own colours included`, disabled: isFeet(key) ? !!w && w.name === 'Polymaker PolyFlex TPU95 Black' && !own : !w && !own, onclick: () => commitColors('color', () => { stage.setColor(key, null); if (own) stage.clearOverrides(null, key); }) })]),
    ]));
  }

  /* the filaments to pick from: those already in this build, then every brand's, TPU for the feet and only for them;
     `active` the one worn now, `onPick` what a swatch does, `mat` the material chip's (the region picker's; 'all' else) */
  function fillBrands(brands, { tpu, active, onPick, mat = 'all' }) {
    brands.replaceChildren();
    const q2 = st.query.trim().toLowerCase();
    const p = pal();
    const seen = new Map(); for (const c of Object.values(p.colors)) if (c && c.name && c.hex && !seen.has(c.name)) seen.set(c.name, c);
    const inBuild = [...seen.values()].filter((c) => (!q2 || c.name.toLowerCase().includes(q2)) && TPU_LABELS.has(c.name) === tpu && (mat === 'all' || materialOfName(c.name) === mat));
    if (inBuild.length) {
      brands.appendChild(el('div.bhead', { text: 'In this build' }));
      brands.appendChild(el('div.swatches', {}, inBuild.map((c) => el('button.sw' + (active === c.name ? '.active' : '') + silk(c.name), { style: `background:${c.hex}`, title: `${c.name} · already in this build`, 'aria-label': c.name, onclick: () => onPick({ label: c.name, hex: c.hex, url: c.url }) }))));
    }
    let any = inBuild.length > 0;
    for (const brand of filterByMaterial(FILAMENT_DB.filter((b) => /TPU/.test(b.line) === tpu), mat)) {   // TPU for the feet and only for them, narrowed to the chip's material
      const colors = q2 ? brand.colors.filter((f) => `${brand.brand} ${brand.line} ${f.label}`.toLowerCase().includes(q2)) : brand.colors;
      if (q2 && !colors.length) continue;
      any = true;
      const id = brand.brand + '|' + brand.line;
      const open = q2 ? true : st.expanded ? st.expanded.has(id) : true;
      brands.appendChild(el('button.bhead.toggle', { 'aria-expanded': String(open), onclick: () => { if (!st.expanded) st.expanded = new Set(FILAMENT_DB.map((b) => b.brand + '|' + b.line)); st.expanded[st.expanded.has(id) ? 'delete' : 'add'](id); fillBrands(brands, { tpu, active, onPick, mat }); } }, [el('span', {}, [brand.brand, el('i', { text: ` ${brand.line} · ${colors.length}` }), matTags(brand)]), el('span.chev', { text: open ? '▾' : '▸' })]));
      if (open) brands.appendChild(el('div.swatches', {}, colors.map((f) => el('button.sw' + (active === f.label ? '.active' : '') + (f.pick ? '.pick' : '') + silk(f.label), { style: `background:${f.hex}`, title: f.label + (f.pick ? (f.pickNote || ' · ★ Used by Jerrari') : ''), 'aria-label': f.label, onclick: () => onPick(f) }))));
    }
    if (!any) brands.appendChild(el('p.note', { text: 'No filaments match.' }));
  }
  /* the picker on a spool (swapTarget): what it prints, and one pick changes all of it */
  const swapName = (t) => t.names.length === 1 ? short(t.names[0]) : t.names.length ? t.names.map(short).join(' & ') : 'Instruction colour';
  function renderSwap(t) {
    const name = swapName(t);
    const brands = el('div.brands');
    const renderBrands = () => fillBrands(brands, { tpu: t.feet, active: t.names[0] || null, onPick: swapTo });
    picker.append(...[
      el('div.head', {}, [el('h2.h2', {}, [el('b.region', { text: 'Spool' }), ` · ${name}`]), el('button.x', { title: 'Close', 'aria-label': 'Close the picker', onclick: closePicker }, [icon('x', { size: 16 })])]),
      el('p.note.swapnote', {}, [el('i.sw', { style: `background:${t.hex}`, 'aria-hidden': 'true' }), `Prints ${regionWords(t.keys).toLowerCase()}. Pick a filament and all of it takes it, in one undo step.`]),
      el('div.find', {}, [el('input.search', { type: 'search', placeholder: 'Search filaments', value: st.query, 'aria-label': 'Search filaments', oninput: (e) => { st.query = e.target.value; renderBrands(); } })]),   // as the region picker's: in a sheet a bare input shrank to 19 px
      t.feet ? el('p.note.feet', { text: 'The feet print in TPU, the flexible filament, so only TPU is listed.' }) : null,
      brands,
    ].filter(Boolean));
    renderBrands();
    if (t.url) {
      // the region picker's foot, word for word: a plain label (this one still said "· paid link" after 2026-10-24) and
      // the one disclosure line
      picker.appendChild(el('div.foot', {}, [
        el('a.buy', { href: t.url, target: '_blank', rel: isPaid(t.url) ? 'noopener sponsored' : 'noopener', text: `Buy ${name} →`, onclick: buyFilament(stage, { name: t.names[0], url: t.url }) }),
        el('span.disc', { text: disclosureFor([t.url]) }),
      ]));
    }
  }

  /* ---------------- the part card on the stage ---------------- */
  const card = el('div.glass', { id: 'ws-partcard', role: 'dialog', 'aria-label': 'Part', hidden: true });
  root.appendChild(card);
  function renderCard() {
    const sel = st.sel;
    card.replaceChildren();
    if (!sel || st.shop || st.tray || st.simp) { card.hidden = true; return; }   // the shopping list, the compare tray or Simplify takes the card's place while it is open (Astra)
    card.hidden = false;
    const info = stage.partInfo(sel.id);
    if (!info) { card.hidden = true; return; }
    const primary = info.primaryKey; const w = worn(primary);
    const total = (stage.keysInBuild().find((k) => k.key === info.type) || {}).count || info.qty;
    const ownPick = info.owner != null ? stage.overrideFor(info.owner, primary) : null;
    const unitIdx = info.owner != null ? store.state.placed.findIndex((p) => p.id === info.owner) + 1 : 0;
    card.append(
      el('div.chead', {}, [
        el('span.sw' + silk(ownPick ? (ownPick.name || ownPick.label) : w && w.name), { style: `background:${ownPick ? ownPick.hex : stage.activeHex(primary)}` }),
        el('div.col', {}, [el('b', { text: info.label }), el('span.meta', { text: `${info.qty} of this size · ${n(total, TYPE_PLURAL[info.type] ? TYPE_PLURAL[info.type].replace(/s$/, '') : info.type.toLowerCase(), TYPE_PLURAL[info.type] || info.type.toLowerCase() + 's')} in the build${unitIdx ? ` · unit ${unitIdx}` : ''} · ${info.locked ? 'bought, not printed' : ownPick ? `${ownPick.name} (this ${unitWord()}’s own)` : w ? w.name : 'instruction colour'}` })]),
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
    if (info.owner != null && info.type === 'Drawer' || (info.owner != null && info.ridesDrawer)) acts.appendChild(el('button.key.sm', { text: 'Open the drawer', onclick: () => stage.peekUnit(info.owner, { pills: false }) }));   // no inside sizes here: they are Build's (Joey 2026-10-27)
    if (acts.children.length) card.appendChild(acts);
  }

  /* ---------------- toolbar, dock, the shopping list ---------------- */
  const bar = toolbar(stage, { history: { undo: () => store.undo(), redo: () => store.redo(), get canUndo() { return store.canUndo; }, get canRedo() { return store.canRedo; } },
    reset: () => { if (room) { if (room.handle) room.handle.recenter(); return; } stage.resetView(); },
    backdrop: ROOM_FLAG ? { get: () => (st.room ? 'room' : 'neutral'), set: (v) => setRoom(v === 'room') } : null });   // with the room on, Reset view returns to the room's shot; while it loads, nothing (its entrance places the camera; the stage's preset would fly out of the room: Terra 01a16b56)
  root.appendChild(bar.el);
  syncBar = bar.sync;
  const dock = el('footer.glass', { id: 'ws-dock' });
  root.appendChild(dock);
  /* the one filament count (the Colors plan's decision D2): what this build prints in, from the stage, so the Dock, the
     shopping list and a look's Shop list agree - bought hardware never counts; the label text and stripes do */
  function renderDock() {
    const p = pal(); const fc = p.on ? stage.filamentsInBuild() : null;
    const count = fc ? fc.count : 0;
    const s = stage.buildSize?.(); const dims = s ? `${Math.round(s.x)} × ${Math.round(s.y)} × ${Math.round(s.z)}` : '';
    dock.replaceChildren(
      el('button.status.stack', { title: count ? 'Filaments in this build · the shopping list' : 'No filament picked yet', disabled: !count, onclick: () => { if (st.shop) { st.shop = false; renderShop(); renderCard(); } else openShop(); } }, [el('span.stacks', {}, (fc ? [...fc.filaments, ...fc.unpicked] : []).slice(0, 6).map((f) => el('i', { style: `background:${f.hex}` }))), count ? n(count, 'filament') : 'Instruction colors']),
      el('div.group', {}, [el('span.big', { text: String(store.state.placed.length) }), el('span.unit-lbl', { text: 'units' })]),
      el('div.group', {}, [el('span.big', { text: dims }), el('span.unit-lbl', { text: 'mm' })]),
      el('button.cta', { onclick: () => ctx.switchTo('parts') }, ['Get parts list', icon('arrow-right', { size: 20 })]),
    );
  }
  const shop = el('div.glass', { id: 'ws-shop', role: 'dialog', 'aria-label': 'Filaments in this build', hidden: true });
  root.appendChild(shop);
  /* the one way the shopping list opens (the Dock's filament stack, the summary's Review filaments): on a phone it is a
     floating card over the collapsed handles, and an open sheet (13) covers it, so the sheets step down first. The Dock's
     path had this since the phone check (2026-10-17); Review filaments, added by step 6 on the desktop, opened the list
     under the Colors sheet, which is up on arrival: the tap seemed to do nothing (the phone journey, 2026-10-19) */
  function openShop() { st.shop = true; if (phone) phone.collapse(); renderShop(); renderCard(); }
  function renderShop() {
    if (!st.shop) { shop.hidden = true; return; }
    const fc = stage.filamentsInBuild();   // the build's own filaments: only the regions the build has, never bought hardware
    shop.hidden = false;
    shop.replaceChildren(
      el('div.ihead', {}, [el('b', { text: 'Filaments in this build' }), el('button.x', { 'aria-label': 'Close', onclick: () => { st.shop = false; renderShop(); renderCard(); } }, [icon('x', { size: 16 })])]),
      ...filamentRows(fc),
      disclosure(fc),
      // the summary's "Review filaments" lands here (step 6): appearance is one question, suitability another (the plan)
      el('p.note', { text: 'Looks only: whether a filament suits a part (strength, heat, flex, the printer) is a separate question.' }),
    );
  }

  /* ---------------- layout ---------------- */
  const narrow = () => innerWidth < 1280;
  const phone = isPhone() ? phoneChrome(root, { ...ctx, active: 'colors', soon }, { panels: [
    { el: panel, title: 'Colors', open: true },
    // the handle stands in for the picker's own title row on a phone (app.css hides that row), so it says what the row
    // said - the unit's number, the spool's filament - and carries the close
    { el: picker, title: () => st.key ? `${regionOf(st.key)} · ${st.scope === 'unit' ? `this ${unitWord()}${unitNo()}` : typePlural(st.key)}` : st.swap ? `Spool · ${swapName(st.swap)}` : 'Filament', close: () => closePicker() },
    { el: gallery, title: () => st.detail ? st.detail.name : 'Looks' },
    { el: tray, title: () => `Compare · ${trayLooks.length} of ${TRAY_MAX}` },
    { el: sur, title: () => st.owning ? 'Filaments I own' : 'Find your next look' },
    { el: simp, title: 'Simplify' },
  ] }) : null;
  if (phone) phone.onLayout(safe);
  /* the gallery never moves the safe area (the plan: a change refits the camera, and a hovered look must be judged on a
     still model); on the phone the sheet manager's heights already include an open sheet */
  /* the open tray lifts the safe area's floor ONCE, when it opens (the stage refits only a camera the visitor has not taken);
     a flip never calls this, so the camera stays where the visitor left it between finalists (step 4) */
  /* on a phone the part card sits over the handles, and the model above it (Joey 2026-10-27, on his S23: Open the drawer
     opened the drawer behind the card) - unless that leaves the model less than 120 px, where the handles' line stands */
  function phoneBottom() {
    const b = phone.bottom(); if (card.hidden) return b;
    const r = card.getBoundingClientRect(), under = Math.round(innerHeight - r.top) + 8;
    return r.height && under > b && innerHeight - phone.top() - under >= 120 ? under : b;
  }
  function safeArea() { if (phone) { stage.setSafeArea({ left: phone.left(), right: phone.right(), top: phone.top(), bottom: phoneBottom() }); return; } stage.setSafeArea({ left: 304 + 28, right: (st.key ? 324 : 0) + 28, top: narrow() ? 134 : 90, bottom: st.tray ? 118 + 200 : 118 }); }
  function safe() { safeArea(); if (room && room.handle) room.handle.refit(); }   // the room's shot follows the free region too (the picker opening narrows it)
  function renderAll() { renderPanel(); renderGallery(); renderTray(); renderSurprise(); renderSimplify(); renderPicker(); renderCard(); renderDock(); renderShop(); bar.sync(); if (phone) phone.refresh(); safe(); }
  addEventListener('resize', safe, { signal });
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === '\\') { root.hidden = !root.hidden; return; }
    if (e.key === 'Escape') {
      if (st.detail) { st.detail = null; stage.endPreview?.(); renderGallery(); if (phone) phone.refresh(); return; }
      if (st.gallery) { closeGallery(); return; }
      if (st.surprise) { if (st.owning) { leaveOwned(); renderSurprise(); if (phone) phone.refresh(); return; } closeSurprise(); return; }
      if (st.simp) { closeSimplify(); return; }
      if (st.tray) { closeTray(); return; }
      if (st.shop) { st.shop = false; renderShop(); renderCard(); return; }
      if (st.key) { closePicker(); return; }
      stage.setSelected(null); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
  }, { signal });

  /* ---------------- stage ---------------- */
  const steps = stage.manifest?.steps?.length ?? 0;
  if (steps && stage.cur !== steps) stage.goTo(steps, { animate: false });
  stage.setDims(false);
  if (!pal().on && Object.keys(pal().colors).length) commitColors('colors-on', () => stage.setUseCustom(true));   // the tab's job is the visitor's colours
  renderAll();
  if (st.room) enterRoom();   // a remembered Room choice comes back with the workspace

  return {
    onQuality(tier) { if (room && room.handle) room.handle.onQuality(tier); },   // the room re-aims its lights after the tier's rig reset
    onSelect(sel) {
      st.sel = sel; if (sel) { const info = stage.partInfo(sel.id); if (info && !info.locked) { st.key = info.primaryKey; st.swap = null; } if (!info || info.owner == null) st.scope = 'all'; }
      /* on a phone a tapped part answers with its card (over the collapsed handles) and the picker's handle, named after
         the region; a tap on a chip or the handle opens the picker. An open sheet covers both (13 over 12), so the sheets
         step down, as Build's inspector does - unless the picker itself is the open sheet: a visitor picking colours taps
         part after part, and the picker follows the tap (the phone journey, 2026-10-19: with the Colors sheet up on
         arrival, a tap on the model lit the part and showed nothing else) */
      if (phone && sel && !phone.isOpen(picker)) phone.collapse();
      renderAll();
    },
    unmount() { if (window.__GEN2_SPOOL_TAP__ === openSwap) delete window.__GEN2_SPOOL_TAP__; leaveRoom(); ac.abort(); unsub(); stage.endPreview?.(); stage.setSelected(null); stage.setSafeArea(null); if (phone) phone.destroy(); document.documentElement.classList.remove('ws-gallery'); root.remove(); },   // a look being shown never outlives the workspace, nor does the room
    get cardsPending() { return cards.pending; },   // for the pacing check: how many cards the gallery still owes
    get tray() { return trayLooks.map((t) => t.name); },   // the finalists, for a check
    get surprise() { return { names: sp.cands.map((c) => c.name), colors: sp.cands.map((c) => c.colors), style: sp.style, cap: sp.cap, ownedOnly: sp.ownedOnly, locks: Object.keys(sp.locks), short: sp.short, seed: sp.seed }; },   // the candidates, for a check
    get simplify() { return st.simp ? { target: st.simpTarget, ...proposal() } : null; },   // the proposal, for a check
  };
}
