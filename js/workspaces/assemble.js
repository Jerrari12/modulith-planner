/* The Assemble workspace - phase 1. The viewer's own step player, cover and outro become the workspace frame
 * (the brief §0 Assemble: a step list with checks, "Skip to the finished build", a bottom step player with
 * Back, pips, Pause, Slow-mo, Replay, Next, and the Part colors / My colors switch, default Part colors; the
 * Dock and the Inspector hide). Layout values are the v4 artboard's.
 *
 * The stage keeps all the behaviour: pages are the viewer's PAGES (0 the cover, 1 the exploded overview, then
 * the numbered steps, last the outro), and this workspace drives `goTo` / `next` / `prev` / `replay` /
 * `setPaused` / `setSlow` and listens to `onPage`. The Done scene (rooms, cameras, lightmaps) is 5b; today the
 * outro page shows the viewer's existing finale with the scene chips marked as coming.
 */
import { el, makeToast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { topbar } from '../ui/topbar.js';
import { toolbar } from '../ui/toolbar.js';

const SCENES = [['grid', 'Grid'], ['workshop', 'Workshop'], ['office', 'Home office'], ['coffee', 'Coffee bar']];

export function mountAssemble(stage, ctx) {
  const ac = new AbortController();
  const signal = ac.signal;
  const steps = stage.manifest?.steps || [];          // steps[0] is the exploded overview page, 1.. the numbered steps
  const last = stage.pageCount - 1;                     // the outro
  const pageOf = { overview: 1, first: 2, finished: last - 1, done: last };

  const root = el('div', { id: 'ws' });
  document.body.appendChild(root);
  const { say, soon } = makeToast(root);
  root.prepend(topbar(stage, { ...ctx, active: 'assemble', say, soon, signal }));
  const tb = toolbar(stage, { soon, explode: () => stage.goTo(pageOf.overview) });
  root.appendChild(tb.el);

  /* Part colors by default here, and only here: remember the visitor's own palette switch and put it back on leave */
  const hadOwnColors = !!stage.useCustom;
  let mine = false;
  const setColors = (own) => { mine = own; if (stage.useCustom !== own) { stage.useCustom = own; stage.applyPalette(); } renderPlayer(); };

  /* ---------------- the step list ---------------- */
  const list = el('aside.glass', { id: 'ws-steps', 'aria-label': 'Assembly steps' });
  root.appendChild(list);
  const rows = () => {
    const out = [{ page: pageOf.overview, mark: 'i', name: 'Overview', title: 'All the parts, exploded' }];
    for (let i = 1; i < steps.length; i++) out.push({ page: i + 1, mark: String(i), name: steps[i].title, title: steps[i].note || '' });
    out.push({ page: pageOf.done, mark: '★', name: 'Done', title: 'The finished build' });
    return out;
  };
  function renderList() {
    const cur = stage.cur;
    list.replaceChildren();
    const n = steps.length - 1;
    const shown = cur >= pageOf.first && cur <= pageOf.finished ? cur - 1 : cur === pageOf.done ? n : 0;
    list.appendChild(el('div.head', {}, [el('h2', { text: 'Assembly' }), el('span.count', { text: `${shown} / ${n}` })]));
    for (const r of rows()) {
      const isCur = cur === r.page, done = cur > r.page;
      list.appendChild(el('button.step' + (isCur ? '.cur' : done ? '.done' : ''), { 'aria-current': isCur ? 'step' : null, title: r.title, onclick: () => stage.goTo(r.page, { animate: r.page !== pageOf.done }) },
        [el('span.mark', { text: done && r.page !== pageOf.done ? '✓' : r.mark }), r.name]));
    }
    list.appendChild(el('button.skip.key', { text: 'Skip to the finished build', onclick: () => stage.skipToEnd() }));
  }

  /* ---------------- the step player ---------------- */
  const player = el('div.glass.glass-edge', { id: 'ws-player', role: 'region', 'aria-label': 'Step player' });
  root.appendChild(player);
  function renderPlayer() {
    const cur = stage.cur;
    const isDone = cur === pageOf.done, onCover = cur === 0;
    const step = cur >= 1 && cur <= pageOf.finished ? steps[cur - 1] : null;
    const num = cur >= pageOf.first && cur <= pageOf.finished ? String(cur - 1) : isDone ? '★' : 'i';
    const title = isDone ? 'Done' : onCover ? (stage.manifest?.title || 'Your build') : (step?.title || '');
    const text = isDone ? 'Here it is, finished. Save an image or share the link; the rooms and the camera tour come with the Done scene.' : onCover ? 'Press Next to begin the step-by-step, or skip to the finished build.' : (step?.note || '');
    player.replaceChildren(
      el('div.row1', {}, [
        el('span.num', { text: num }),
        el('div', {}, [el('div.title', { text: title }), el('div.text', { text })]),
        el('div.colors', { role: 'group', 'aria-label': 'Model colors', title: 'Part colors give every part type its own color, like LEGO instructions' }, [
          el('button.seg' + (!mine ? '.on' : ''), { text: 'Part colors', 'aria-pressed': String(!mine), onclick: () => setColors(false) }),
          el('button.seg' + (mine ? '.on' : ''), { text: 'My colors', 'aria-pressed': String(mine), onclick: () => setColors(true) }),
        ]),
      ]),
      el('div.row2', {}, [
        el('button.key', { text: '← Back', disabled: cur <= 1, onclick: () => stage.prev() }),
        el('div.pips', {}, rows().map((r) => el('span.pip' + (cur === r.page ? '.cur' : cur > r.page ? '.done' : '')))),
        el('button.key.sq', { 'aria-label': stage.paused ? 'Play' : 'Pause', title: stage.paused ? 'Play' : 'Pause', disabled: isDone, onclick: () => { stage.setPaused(!stage.paused); renderPlayer(); } }, [icon(stage.paused ? 'play' : 'pause', { fill: true })]),
        el('button.key' + (stage.slowmo ? '.on' : ''), { text: 'Slow-mo', 'aria-pressed': String(!!stage.slowmo), title: 'Slow motion · watch each step at study speed', onclick: () => { stage.setSlow(!stage.slowmo); renderPlayer(); } }),
        el('button.key.sq', { 'aria-label': 'Replay step', title: 'Replay this step', disabled: isDone || onCover, onclick: () => stage.replay() }, [icon('arrow-counter-clockwise')]),
        el('button.key.next' + (!isDone ? '.on' : ''), { text: isDone ? 'Finished' : 'Next →', disabled: isDone, onclick: () => stage.next() }),
      ]),
    );
    if (isDone) {
      player.appendChild(el('div.row3', {}, [
        el('div.track', { role: 'group', 'aria-label': 'Scene', style: 'display:flex;gap:3px;padding:3px;border-radius:10px' }, SCENES.map(([k, name]) =>
          el('button.seg' + (k === 'grid' ? '.on' : ''), { text: name, style: 'height:30px;padding:0 10px;border-radius:8px;font-size:12px', 'aria-pressed': String(k === 'grid'), onclick: k === 'grid' ? null : soon(`The ${name} scene`, 'the Done scene (phase 5b)') }))),
        el('span.hint', { text: 'Rooms and the camera tour come with the Done scene.' }),
        el('button.key', { text: 'Share', onclick: async () => { try { await navigator.clipboard.writeText(location.href); say('Link copied.'); } catch { say('Copy the address bar to share this build.'); } } }),
        el('button.key.on', { text: 'Save image', onclick: soon('Save image', 'the Done scene (phase 5b): the hero shot at golden hour, watermarked') }),
      ]));
    }
  }

  /* ---------------- stage ---------------- */
  const safe = () => stage.setSafeArea({ left: 280 + 20 + 8, right: 8, top: innerWidth < 1280 ? 134 : 90, bottom: 22 + player.offsetHeight + 12 });
  addEventListener('resize', safe, { signal });
  document.addEventListener('keydown', (e) => { if (e.key === '\\') root.hidden = !root.hidden; }, { signal });
  setColors(false);
  // land on the exploded overview when the stage is still on its cover; a deep link into a step keeps its page
  if (stage.cur === 0) stage.goTo(pageOf.overview);
  renderList(); renderPlayer(); tb.sync(); safe();

  return {
    onPage() { renderList(); renderPlayer(); tb.sync(); safe(); },
    unmount() {
      ac.abort();
      stage.setPaused(false);
      if (stage.useCustom !== hadOwnColors) { stage.useCustom = hadOwnColors; stage.applyPalette(); }
      stage.setSafeArea(null);
      root.remove();
    },
  };
}
