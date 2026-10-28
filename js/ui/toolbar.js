/* The centre toolbar every workspace shares (the brief §2): Reset view and the quality pill everywhere; the rest only
   where it does something (Joey 2026-10-27: a 3D chip with a greyed 2D, an Explode that only toasted "comes with
   Assemble (phase 1)", and a Measure that showed nothing in Colors read as broken). `opts.view` ({ get(), set(v) })
   adds the 3D/2D switch (Build); `opts.measure` adds Measure, the W/H/L callouts (Build, where sizes are chosen;
   Assemble, whose finished step turns them on itself - Colors' room holds them back, Labels and Parts switch them off
   on arrival); `opts.explode` adds Explode, what it does in this workspace (Assemble: the exploded overview);
   `opts.history` ({ undo(), redo(), canUndo, canRedo }) adds Undo/Redo; `opts.eraser` ({ get(), set(on) }) adds
   the remove mode. Returns the element plus `sync()`, which re-reads the stage's measure and quality state and the
   live toggles (call it after any change). */
import { el } from './dom.js';
import { icon } from './icons.js';

const Q_NAME = { veryhigh: 'Very High', high: 'High', balanced: 'Balanced', fast: 'Fast' };

export function toolbar(stage, { measure = false, explode = null, view = null, history = null, eraser = null, camTitle = null, reset = null, backdrop = null }) {
  const tools = el('div', { id: 'ws-tools', role: 'toolbar', 'aria-label': 'View' });
  /* Measure = the W/H/L callouts (the inventory's "Measure | W/H/L in mm + in"). The stage turns them on by itself
     on the finished page; the button reflects the stage's state and toggles it. */
  const measureBtn = measure ? el('button.chip.icon-btn.measure', { title: 'Measure · W/H/L', 'aria-label': 'Measure', 'aria-pressed': 'false', onclick: () => { stage.setDims(!stage.dimsOn); sync(); } }, [icon('ruler')]) : null;
  const qualityBtn = el('button.chip.quality', { title: 'Render quality · click to cycle' }, [icon('gauge', { size: 16 }), el('span')]);
  /* a visitor's pick is kept across reloads and stops the auto-downgrade (setQuality with user: true, as the viewer's own pill
     does); applyQuality alone drew the tier for this page only, and a reload re-probed it (the GPU pass, 2026-10-23) */
  qualityBtn.addEventListener('click', () => { const keys = Object.keys(stage.QUALITY); const next = keys[(keys.indexOf(stage.quality) + 1) % keys.length]; if (stage.setQuality) stage.setQuality(next, { user: true }); else stage.applyQuality(next); sync(); });
  const b3 = view ? el('button', { text: '3D', 'aria-pressed': 'true', onclick: () => { view.set('3d'); sync(); } }) : null;
  const b2 = view ? el('button', { text: '2D', 'aria-pressed': 'false', title: 'The 2D board · the same build as a grid', onclick: () => { view.set('2d'); sync(); } }) : null;
  const undoBtn = history ? el('button.chip.icon-btn', { title: 'Undo · Ctrl+Z', 'aria-label': 'Undo', onclick: () => { history.undo(); sync(); } }, [icon('arrow-counter-clockwise')]) : null;
  const redoBtn = history ? el('button.chip.icon-btn', { title: 'Redo · Ctrl+Y', 'aria-label': 'Redo', onclick: () => { history.redo(); sync(); } }, [icon('arrow-clockwise')]) : null;
  const eraseBtn = eraser ? el('button.chip.icon-btn.erase', { title: 'Remove units · click a unit to remove it · Esc ends', 'aria-label': 'Remove units', 'aria-pressed': 'false', onclick: () => { eraser.set(!eraser.get()); sync(); } }, [icon('trash')]) : null;
  // the camera button: "Reset view" everywhere; the Assemble workspace names it for the guided camera (camTitle) and it
  // lights up while the visitor has the camera (an orbit or zoom during a step), as the viewer's own Resume cam did.
  // `opts.reset` replaces what it does (Colors with the room on: back to the room's shot, not the stage's preset)
  /* `opts.backdrop` ({ get(), set(v) }, 'room' | 'neutral'): what the build stands in, beside 3D/2D since it is a view
     setting too (Colors; Joey 2026-10-26: the switch "moves to the toolbar as Room | Neutral", off the panel, where its
     two buttons read as the panel's own tabs) */
  const bRoom = backdrop ? el('button', { text: 'Room', 'aria-pressed': 'false', title: 'Your build on a desk in a room, in daylight', onclick: () => { backdrop.set('room'); sync(); } }) : null;
  const bNeutral = backdrop ? el('button', { text: 'Neutral', 'aria-pressed': 'false', title: 'A plain, colour-accurate stage, for judging the filaments themselves', onclick: () => { backdrop.set('neutral'); sync(); } }) : null;
  const camBtn = el('button.chip.icon-btn.cam', { title: camTitle || 'Reset view', 'aria-label': camTitle ? 'Back to the step\u2019s camera' : 'Reset view', onclick: () => (reset ? reset() : stage.resetView()) }, [icon('cube-focus')]);
  tools.append(...[
    view ? el('div.chip.view', { role: 'group', 'aria-label': 'View' }, [b3, b2]) : null,
    backdrop ? el('div.chip.view.backdrop', { role: 'group', 'aria-label': 'Backdrop' }, [bRoom, bNeutral]) : null,
    measureBtn,
    explode ? el('button.chip.icon-btn.explode', { title: 'Exploded overview', 'aria-label': 'Explode', onclick: explode }, [icon('arrows-out')]) : null,
    camBtn,
    undoBtn, redoBtn, eraseBtn,
    qualityBtn,
  ].filter(Boolean));   // append(null) would write the text "null" into the bar (seen in Parts)
  function sync() {
    const on = !!stage.dimsOn;
    if (measureBtn) { measureBtn.classList.toggle('on', on); measureBtn.setAttribute('aria-pressed', String(on)); }
    document.documentElement.classList.toggle('ws-measure', on);
    qualityBtn.querySelector('span').textContent = `Quality · ${Q_NAME[stage.quality] || stage.quality}`;
    if (view) { const v = view.get(); b3.classList.toggle('on', v !== '2d'); b2.classList.toggle('on', v === '2d'); b3.setAttribute('aria-pressed', String(v !== '2d')); b2.setAttribute('aria-pressed', String(v === '2d')); }
    if (history) { undoBtn.disabled = !history.canUndo; redoBtn.disabled = !history.canRedo; }
    if (eraser) { const on2 = !!eraser.get(); eraseBtn.classList.toggle('on', on2); eraseBtn.setAttribute('aria-pressed', String(on2)); }
    if (camTitle) camBtn.classList.toggle('on', !!stage.camFree);
    if (backdrop) { const r = backdrop.get() === 'room'; bRoom.classList.toggle('on', r); bNeutral.classList.toggle('on', !r); bRoom.setAttribute('aria-pressed', String(r)); bNeutral.setAttribute('aria-pressed', String(!r)); }
  }
  sync();
  centreUnderTabs(tools);
  return { el: tools, sync };
}

/* THE ROW CENTRED UNDER THE TABS (Joey 2026-10-27: "can we center the icons at the top of the screen better, it looks offset
   after we removed a few"). The CSS gives the row the space the side panels leave (left / right per workspace) and centres
   it there, while the tabs centre in the top bar between its own neighbours: at 1600 px the row sat 72 px right of the tabs
   in Build and 232 px in Assemble. Here the row's buttons move to sit centred under the tabs, as far as that space allows -
   never over a panel. Not on a phone, whose bar lays the row out its own way (app.css). Measured again whenever the row,
   the tabs or the window change size; it stops with the row (a remount builds a new one). */
function centreUnderTabs(tools) {
  if (typeof ResizeObserver !== 'function') return;
  const place = () => {
    if (!tools.isConnected) { ro.disconnect(); return; }
    tools.style.translate = '';
    const tabs = document.getElementById('ws-tabs');
    if (!tabs || matchMedia('(max-width: 1023px)').matches) return;
    const kids = [...tools.children].filter((k) => k.getClientRects().length);
    if (!kids.length) return;
    const box = tools.getBoundingClientRect(), t = tabs.getBoundingClientRect();
    const left = Math.min(...kids.map((k) => k.getBoundingClientRect().left)), right = Math.max(...kids.map((k) => k.getBoundingClientRect().right));
    const dx = Math.max(box.left - left, Math.min(box.right - right, (t.left + t.right) / 2 - (left + right) / 2));
    if (Math.abs(dx) >= 1) tools.style.translate = `${Math.round(dx)}px 0`;
  };
  const ro = new ResizeObserver(() => place());
  ro.observe(tools); ro.observe(document.documentElement);
  requestAnimationFrame(() => { const tabs = document.getElementById('ws-tabs'); if (tabs && tools.isConnected) ro.observe(tabs); place(); });
}
