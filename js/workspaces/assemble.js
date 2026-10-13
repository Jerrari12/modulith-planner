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
import { isPhone, phoneChrome } from '../ui/phone.js';


export function mountAssemble(stage, ctx) {
  const ac = new AbortController();
  const signal = ac.signal;
  const steps = stage.manifest?.steps || [];          // steps[0] is the exploded overview page, 1.. the numbered steps
  const last = stage.pageCount - 1;                     // the outro
  const pageOf = { overview: 1, first: 2, finished: last - 1 };
  /* "Done" is the end of the instructions on the finished step's own fitted view, not the viewer's outro cinema
     (Astra: finish on a fitted front three-quarter view of the whole assembly; reaching Done means "End of
     instructions"). The outro page is never entered from here. */
  let done = false;

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
    out.push({ page: 'done', mark: '■', name: 'Done', title: 'End of instructions' });
    return out;
  };
  function renderList() {
    const cur = stage.cur;
    list.replaceChildren();
    const n = steps.length - 1;
    const shown = cur >= pageOf.first && cur <= pageOf.finished ? cur - 1 : 0;
    list.appendChild(el('div.head', {}, [el('h2', { text: 'Assembly' }), el('span.count', { text: `${shown} / ${n}` })]));
    /* a row before the current one is PLAYED, not built: the mark stays its number, muted. "Mark as built" and
       project progress are the Parts workspace's, kept apart from playback position (Astra). */
    for (const r of rows()) {
      const isCur = r.page === 'done' ? done : (!done && cur === r.page);
      const past = r.page !== 'done' && (done || cur > r.page);
      list.appendChild(el('button.step' + (isCur ? '.cur' : past ? '.past' : ''), { 'aria-current': isCur ? 'step' : null, title: r.title, onclick: () => (r.page === 'done' ? finish() : stage.goTo(r.page)) },
        [el('span.mark', { text: r.mark }), r.name]));
    }
    list.appendChild(el('button.skip.key', { text: 'Skip to the finished build', onclick: () => { done = false; stage.skipToEnd(); } }));
  }
  /* the end of the instructions: the finished step's fitted view, with the player saying so */
  function finish() {
    done = true;
    if (stage.cur !== pageOf.finished) stage.goTo(pageOf.finished, { animate: false });
    else { renderList(); renderPlayer(); safe(); }
  }

  /* ---------------- the step player ---------------- */
  const player = el('div.glass.glass-edge', { id: 'ws-player', role: 'region', 'aria-label': 'Step player' });
  root.appendChild(player);
  function renderPlayer() {
    const cur = stage.cur;
    const isDone = done, onCover = cur === 0;
    const step = cur >= 1 && cur <= pageOf.finished ? steps[cur - 1] : null;
    const num = isDone ? '■' : cur >= pageOf.first && cur <= pageOf.finished ? String(cur - 1) : 'i';
    const title = isDone ? 'End of instructions' : onCover ? (stage.manifest?.title || 'Your build') : (step?.title || '');
    const text = isDone ? 'The whole assembly, finished. Share the link, or go back to any step.' : onCover ? 'Press Next to begin the step-by-step, or skip to the finished build.' : (step?.note || '');
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
        el('button.key', { text: '← Back', disabled: cur <= 1 && !isDone, onclick: () => { if (isDone) { done = false; renderList(); renderPlayer(); } else stage.prev(); } }),
        el('div.pips', {}, rows().map((r) => el('span.pip' + ((r.page === 'done' ? isDone : !isDone && cur === r.page) ? '.cur' : (r.page !== 'done' && (isDone || cur > r.page)) ? '.done' : '')))),
        el('button.key.sq', { 'aria-label': stage.paused ? 'Play' : 'Pause', title: stage.paused ? 'Play' : 'Pause', disabled: isDone, onclick: () => { stage.setPaused(!stage.paused); renderPlayer(); } }, [icon(stage.paused ? 'play' : 'pause', { fill: true })]),
        el('button.key' + (stage.slowmo ? '.on' : ''), { text: 'Slow-mo', 'aria-pressed': String(!!stage.slowmo), title: 'Slow motion · watch each step at study speed', onclick: () => { stage.setSlow(!stage.slowmo); renderPlayer(); } }),
        el('button.key.sq', { 'aria-label': 'Replay step', title: 'Replay this step', disabled: isDone || onCover, onclick: () => stage.replay() }, [icon('arrow-counter-clockwise')]),
        el('button.key.next' + (!isDone ? '.on' : ''), { text: isDone ? 'Finished' : 'Next →', disabled: isDone, onclick: () => (cur === pageOf.finished ? finish() : stage.next()) }),
      ]),
    );
    if (isDone) {
      player.appendChild(el('div.row3', {}, [
        el('span.hint', { text: 'End of instructions.' }),
        el('button.key.on', { text: 'Share', onclick: async () => { try { await navigator.clipboard.writeText(location.href); say('Link copied.'); } catch { say('Copy the address bar to share this build.'); } } }),
      ]));
    }
  }

  /* ---------------- stage ---------------- */
  const phone = isPhone() ? phoneChrome(root, { ...ctx, active: 'assemble', soon }, { panels: [{ el: list, title: () => `Step ${Math.max(0, stage.cur)} of ${stage.pageCount - 2}`, open: false }] }) : null;
  const safe = () => { if (phone) { stage.setSafeArea({ left: 8, right: 8, top: phone.top(), bottom: phone.bottom() + player.offsetHeight }); return; } stage.setSafeArea({ left: 280 + 20 + 8, right: 8, top: innerWidth < 1280 ? 134 : 90, bottom: 22 + player.offsetHeight + 12 }); };
  if (phone) phone.onLayout(safe);
  addEventListener('resize', safe, { signal });
  document.addEventListener('keydown', (e) => { if (e.key === '\\') root.hidden = !root.hidden; }, { signal });
  setColors(false);
  // the step a visitor left on comes back after a trip to another workspace (ctx.memo); a fresh arrival on the
  // cover lands on the exploded overview; a deep link into a step keeps its page
  const back = ctx.memo?.assemblePage;
  if (back != null) { done = !!ctx.memo.assembleDone; stage.goTo(back, { animate: false }); }
  else if (stage.cur === 0) stage.goTo(pageOf.overview);
  renderList(); renderPlayer(); tb.sync(); safe();

  return {
    onPage(i) { if (i !== pageOf.finished) done = false; renderList(); renderPlayer(); tb.sync(); safe(); },   // a remount's goTo lands on the finished page, so a remembered Done survives it
    unmount() {
      ac.abort();
      if (ctx.memo) { ctx.memo.assemblePage = stage.cur; ctx.memo.assembleDone = done; }
      stage.setPaused(false);
      if (stage.useCustom !== hadOwnColors) { stage.useCustom = hadOwnColors; stage.applyPalette(); }
      stage.setSafeArea(null);
      if (phone) phone.destroy(); root.remove();
    },
  };
}
