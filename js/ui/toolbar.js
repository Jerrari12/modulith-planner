/* The centre toolbar every workspace shares (the brief §2): 3D/2D, Measure (the W/H/L callouts), Explode,
   Reset view, the quality pill. `opts.explode` is what the Explode button does in this workspace (null = a
   toast); `opts.soon` and `opts.say` come from the workspace's toast. Returns the element plus `sync()`, which
   re-reads the stage's measure and quality state (call it after a page change). */
import { el } from './dom.js';
import { icon } from './icons.js';

const Q_NAME = { veryhigh: 'Very High', high: 'High', balanced: 'Balanced', fast: 'Fast' };

export function toolbar(stage, { soon, explode = null, explodeTitle = 'Explode · comes with Assemble (phase 1)' }) {
  const tools = el('div', { id: 'ws-tools', role: 'toolbar', 'aria-label': 'View' });
  /* Measure = the W/H/L callouts (the inventory's "Measure | W/H/L in mm + in"). The stage turns them on by itself
     on the finished page; the button reflects the stage's state and toggles it. */
  const measureBtn = el('button.chip.icon-btn.measure', { title: 'Measure · W/H/L', 'aria-label': 'Measure', 'aria-pressed': 'false', onclick: () => { stage.setDims(!stage.dimsOn); sync(); } }, [icon('ruler')]);
  const qualityBtn = el('button.chip.quality', { title: 'Render quality · click to cycle' }, [icon('gauge', { size: 16 }), el('span')]);
  qualityBtn.addEventListener('click', () => { const keys = Object.keys(stage.QUALITY); const i = keys.indexOf(stage.quality); stage.applyQuality(keys[(i + 1) % keys.length], true); sync(); });
  tools.append(
    el('div.chip.view', { role: 'group', 'aria-label': 'View' }, [el('button.on', { text: '3D', 'aria-pressed': 'true' }), el('button', { text: '2D', disabled: true, title: 'The 2D board comes with the Build rules (phase 3)' })]),
    measureBtn,
    el('button.chip.icon-btn', { title: explode ? 'Exploded overview' : explodeTitle, 'aria-label': 'Explode', onclick: explode || soon('Explode', 'Assemble (phase 1)') }, [icon('arrows-out')]),
    el('button.chip.icon-btn', { title: 'Reset view', 'aria-label': 'Reset view', onclick: () => stage.resetView() }, [icon('cube-focus')]),
    qualityBtn,
  );
  function sync() {
    const on = !!stage.dimsOn;
    measureBtn.classList.toggle('on', on); measureBtn.setAttribute('aria-pressed', String(on));
    document.documentElement.classList.toggle('ws-measure', on);
    qualityBtn.querySelector('span').textContent = `Quality · ${Q_NAME[stage.quality] || stage.quality}`;
  }
  sync();
  return { el: tools, sync };
}
