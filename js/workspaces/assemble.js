/* The Assemble workspace - phase 1. The viewer's own step player, cover and outro become the workspace frame
 * (the brief §0 Assemble: a step list with checks, "Skip to the finished build", a bottom step player with
 * Back, pips, Pause, Slow-mo, Replay, Next, and the Part colors / My colors switch, default Part colors; the
 * Dock and the Inspector hide). Layout values are the v4 artboard's.
 *
 * The stage keeps all the behaviour: pages are the viewer's PAGES (0 the cover, 1 the exploded overview, then
 * the numbered steps, last the outro), and this workspace drives `goTo` / `next` / `prev` / `replay` /
 * `setPaused` / `setSlow` and listens to `onPage`. The Done scene (rooms, cameras, lightmaps) is 5b; its first slice,
 * the build in the Home office (js/scenes/done.js), is behind `?done=room` and loads only at Done.
 */
import { el, makeToast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { topbar } from '../ui/topbar.js';
import { toolbar } from '../ui/toolbar.js';
import { isPhone, phoneChrome } from '../ui/phone.js';

/* THE DONE SCENE (5b's first slice, 2026-10-23, DESIGN.md in D:/Claude - Output/done-scene-2026-10-23): with
   `?done=room` the end of the instructions puts the finished build on a desk in a lit room. Off by default; a feature
   ships only on Joey's go, and the module is not even fetched until a visitor with the flag reaches Done. */
const DONE_SCENE = new URLSearchParams(location.search).get('done');


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
  const tb = toolbar(stage, { soon, explode: () => stage.goTo(pageOf.overview), camTitle: 'Back to the step\u2019s camera \u00b7 after you orbit or zoom, this returns to the guided view' });
  root.appendChild(tb.el);

  /* NOT READY TO ASSEMBLE (2026-10-21, Joey: with empty slots "the assembly is not legal until i fill in those gaps"). A
     build the stage shows as an in-progress preview - empty slots under (or above) a case, or a tabletop top not level
     yet - has no instructions, so there is nothing to step through: the workspace says why and sends the visitor to
     Build, where the slots show red and Fill all fills them. The player's frame, without the player. */
  const inc = stage.manifest?.incomplete;
  if (inc) {
    const card = el('div.glass.glass-edge.blocked', { id: 'ws-player', role: 'region', 'aria-label': 'Not ready to assemble' }, [
      el('div.row1', {}, [
        el('span.num', { text: '!' }),
        el('div', {}, [
          el('div.title', { text: 'Not ready to assemble' }),
          el('div.text', { text: inc.voids
            ? 'This build has empty slots, so it has no instructions yet. Fill them in Build: they show red there, and Fill all fills them with 1W cases.'
            : 'Part of the top isn’t level yet, so this build has no instructions. Fill the outlined space in Build with any drawers that fit.' }),
        ]),
      ]),
      el('div.row2', {}, [el('button.key.next.on', { text: 'Go to Build', onclick: () => ctx.switchTo('build') })]),
    ]);
    root.appendChild(card);
    const safe = () => stage.setSafeArea({ left: 8, right: 8, top: innerWidth < 1280 ? 134 : 90, bottom: 22 + card.offsetHeight + 12 });
    addEventListener('resize', safe, { signal });
    tb.sync(); safe();
    return {
      onPage() { tb.sync(); },
      onCamFree() { tb.sync(); },
      unmount() { ac.abort(); stage.setSafeArea(null); root.remove(); },
    };
  }

  /* Part colors by default here, and only here: remember the visitor's own palette switch and put it back on leave */
  const hadOwnColors = !!stage.useCustom;
  let mine = false;
  const setColors = (own) => { mine = own; if (stage.useCustom !== own) { stage.useCustom = own; stage.applyPalette(); } renderPlayer(); };

  /* the room: entered when the instructions end (finish, or a remembered Done), left on Back, Skip, any step, or unmount.
     "Your build in real life" shows the visitor's own colours, so the Part colors switch is set aside while the room is
     on and put back on leave. The handle arrives once the room has loaded; a leave before that cancels the load. */
  let room = null;   // { leaveFn, handle, mineWas } while the room is on or loading
  function enterRoom() {
    if (DONE_SCENE !== 'room' || room) return;
    const h = { leaveFn: null, handle: null, mineWas: mine };
    room = h;
    setColors(true);
    import('../scenes/done.js').then(({ enterDoneScene }) => {
      if (room !== h) return;
      const r = enterDoneScene(stage, { say });
      h.leaveFn = r.leave;
      r.ready.then((handle) => { if (room === h) { h.handle = handle; renderPlayer(); } });
    }).catch((e) => { console.warn('[done scene] the module did not load', e); if (room === h) { room = null; setColors(h.mineWas); } });
  }
  function leaveRoom() {
    if (!room) return;
    const h = room; room = null;
    if (h.leaveFn) h.leaveFn();
    setColors(h.mineWas);
  }

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
    list.appendChild(el('button.skip.key', { text: 'Skip to the finished build', onclick: () => { done = false; leaveRoom(); stage.skipToEnd(); } }));
  }
  /* the end of the instructions: the finished step's fitted view, with the player saying so (and, behind the flag, the room) */
  function finish() {
    done = true;
    if (stage.cur !== pageOf.finished) stage.goTo(pageOf.finished, { animate: false });
    else { renderList(); renderPlayer(); safe(); }
    enterRoom();
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
    const text = isDone ? (room && room.handle ? 'Your build on a desk. Grab the view to look around; share the link, or go back to any step.' : 'The whole assembly, finished. Share the link, or go back to any step.') : onCover ? 'Press Next to begin the step-by-step, or skip to the finished build.' : (step?.note || '');
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
        el('button.key', { text: '← Back', disabled: cur <= 1 && !isDone, onclick: () => { if (isDone) { done = false; leaveRoom(); renderList(); renderPlayer(); } else stage.prev(); } }),
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
  const phone = isPhone() ? phoneChrome(root, { ...ctx, active: 'assemble', soon }, { panels: [{ el: list, title: () => `Step ${Math.max(0, stage.cur)} of ${stage.pageCount - 2}`, open: false }], dock: () => player.offsetHeight }) : null;
  const safeArea = () => { if (phone) { phone.refresh(); stage.setSafeArea({ left: 8, right: 8, top: phone.top(), bottom: phone.bottom() }); return; } stage.setSafeArea({ left: 280 + 20 + 8, right: 8, top: innerWidth < 1280 ? 134 : 90, bottom: 22 + player.offsetHeight + 12 }); };
  const safe = () => { safeArea(); if (room && room.handle) room.handle.refit(); };   // the room's camera is fitted to the free region too
  if (phone) phone.onLayout(safe);
  addEventListener('resize', safe, { signal });
  document.addEventListener('keydown', (e) => { if (e.key === '\\') root.hidden = !root.hidden; }, { signal });
  setColors(false);
  // the step a visitor left on comes back after a trip to another workspace (ctx.memo); a first arrival lands on the
  // exploded overview, from the cover (a ?ws=assemble address) AND from the finished step the other workspaces park
  // the stage on (Joey, 2026-10-20: Assemble opened "at the end" when reached from Build)
  const back = ctx.memo?.assemblePage;
  if (back != null) { done = !!ctx.memo.assembleDone; stage.goTo(back, { animate: false }); if (done) enterRoom(); }
  else if (stage.cur !== pageOf.overview) stage.goTo(pageOf.overview);
  renderList(); renderPlayer(); tb.sync(); safe();

  return {
    onPage(i) { if (i !== pageOf.finished) { done = false; leaveRoom(); } renderList(); renderPlayer(); tb.sync(); safe(); },   // a remount's goTo lands on the finished page, so a remembered Done survives it
    onCamFree() { tb.sync(); },   // the camera taken (an orbit) or given back: the toolbar's camera button lights up or not
    onQuality(tier) { if (room && room.handle) room.handle.onQuality(tier); },   // the room re-aims its lights after the tier's rig reset
    unmount() {
      leaveRoom();
      ac.abort();
      if (ctx.memo) { ctx.memo.assemblePage = stage.cur; ctx.memo.assembleDone = done; }
      stage.setPaused(false);
      if (stage.useCustom !== hadOwnColors) { stage.useCustom = hadOwnColors; stage.applyPalette(); }
      stage.setSafeArea(null);
      if (phone) phone.destroy(); root.remove();
    },
  };
}
