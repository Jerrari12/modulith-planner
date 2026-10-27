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
import { attachHint } from '../ui/hint.js';
import { isPhone, phoneChrome } from '../ui/phone.js';

/* THE DONE SCENE (5b's first slice, 2026-10-23, DESIGN.md in D:/Claude - Output/done-scene-2026-10-23): with
   `?done=room` the end of the instructions puts the finished build on a desk in a lit room. ON FOR EVERYONE since Joey's
   go of 2026-10-26 ("turn the room on for everyone: drop the ?done=room flag so every visitor gets the room in Colors and
   the final scene"); `?done=off` turns it off (the e2e cases about other things run so). The module is still not fetched
   until a visitor reaches Done and asks for the scene. */
const DONE_SCENE = new URLSearchParams(location.search).get('done') || 'room';

/* the camera button's hover hint (js/ui/hint.js; the clip img/hints/assemble-camera.mp4 from tools/hint-clips.mjs). Joey's own
   question of 2026-10-20 ("how do i get it to snap back to the cinematic camera?") is what the clip answers; it sits under
   the toolbar, since beside the chip it would cover the next ones (2026-10-23) */
const CAM_HINT = { title: 'Back to the step’s camera', text: 'After you orbit or zoom, this returns to the guided view. It lights orange while the camera is yours.', video: 'img/hints/assemble-camera.mp4', below: true };

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
  /* the toast sits above the player card, whatever that card's height (app.css reads --player-h): the size is observed, so a
     re-render, the end page's extra row and a window that rewraps the card's text all keep it current */
  const trackHeight = (card) => new ResizeObserver(() => root.style.setProperty('--player-h', `${card.offsetHeight}px`)).observe(card);
  root.prepend(topbar(stage, { ...ctx, active: 'assemble', say, soon, signal }));
  const tb = toolbar(stage, { measure: true, explode: () => stage.goTo(pageOf.overview), camTitle: 'Back to the step\u2019s camera \u00b7 after you orbit or zoom, this returns to the guided view' });
  root.appendChild(tb.el);
  attachHint(tb.el.querySelector('.cam'), CAM_HINT, tb.el);

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
    trackHeight(card);
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

  /* THE FINAL SCENE (Joey, 2026-10-23: "more than just a step in the instructions but like a final scene that you have to
     make obvious to go into; most of the HUD disappears and black borders appear on top and bottom, like scope in
     cinematic movies or games; a button to return back or change camera view, but don't let them rotate the camera").
     Behind `?done=room`: the End page offers "Watch the final scene" in the Next slot; the scene puts the build in the
     Home office (js/scenes/done.js) with the orbit OFF, fades the HUD and draws the bars (html.cinema, css/app.css), and
     keeps one strip in the lower bar, Back and Next view (the next shot, a cut); Esc is Back. Left on Back, Skip, any
     step, or unmount; a remount lands on the End page, not in the scene. "Your build in real life" shows the visitor's
     own colours, so the Part colors switch is set aside while the scene is on and put back on leave. The handle arrives
     once the room has loaded; a leave before that cancels the load. */
  let room = null;   // { leaveFn, handle, mineWas } while the room is on or loading
  let inScene = false;
  /* THE SHOWCASE (Joey 2026-10-26: "in the color tab, we should somehow also work in the final scene but call it something
     else, like that way after selecting your colors and stuff you can also view it in this way"): Colors' Showcase button
     asks for this scene through ctx.memo.showcase ({ from }), and it opens straight in it; its Back (Esc) goes back where it
     came from, and Assemble's own place (the step a visitor left on) is kept as it was, not moved to Done */
  const showcase = ctx.memo && ctx.memo.showcase ? ctx.memo.showcase : null;
  if (showcase) ctx.memo.showcase = null;
  const keptPlace = showcase ? { page: ctx.memo.assemblePage, done: ctx.memo.assembleDone } : null;
  const backWord = showcase && showcase.from === 'colors' ? 'Colors' : null;
  const bars = el('div', { id: 'cinema-bars', 'aria-hidden': 'true' });   // the black bars, in the workspace's own layer so the strip paints over them
  /* the room's wall and desk colours (Joey 2026-10-25): the scene's own control (done.js roomColoursPanel) in a panel over
     the strip, opened by its button once the room is on; Esc closes it before it leaves the scene */
  const pop = el('div.glass', { id: 'ws-scene-colours', role: 'dialog', 'aria-label': 'Wall and desk colours', hidden: true });
  const colBtn = el('button.key', { text: 'Wall & desk', title: 'The room\'s wall and desk colours', 'aria-expanded': 'false', disabled: true, onclick: () => toggleColours() });
  function toggleColours(open) {
    const want = open != null ? !!open : pop.hidden;
    if (want && !(room && room.handle && room.handle.roomColoursPanel)) return;
    pop.hidden = !want;
    colBtn.setAttribute('aria-expanded', String(want));
    if (want) pop.replaceChildren(room.handle.roomColoursPanel()); else pop.replaceChildren();
  }
  const strip = el('div.glass', { id: 'ws-scene', role: 'toolbar', 'aria-label': 'Final scene' }, [
    el('button.key', { text: backWord ? `← Back to ${backWord}` : '← Back', title: backWord ? `Back to ${backWord} · Esc` : 'Back to the instructions · Esc', onclick: () => leaveScene() }),
    colBtn,
    el('button.key.on', { text: 'Next view →', title: 'The next camera view', onclick: () => { if (room && room.handle) room.handle.nextShot(); } }),
  ]);
  /* THE STRIP RESTS (Joey 2026-10-25: "hide the buttons on the bottom of the screen until the user moves their mouse or
     hits a keyboard button"): html.scene-idle fades the strip and the pointer out once nothing has moved for STRIP_IDLE_MS,
     and any pointer, wheel or key brings them back. Not while the colours panel is open, the pointer is over the strip,
     or a key has focus on one of its buttons. Faded by opacity only (css/app.css), so the buttons stay where they are. */
  const STRIP_IDLE_MS = 2500;
  let idle = { timer: 0, ac: null };
  function stripWake() {
    document.documentElement.classList.remove('scene-idle');
    clearTimeout(idle.timer);
    idle.timer = setTimeout(stripRest, STRIP_IDLE_MS);
  }
  function stripRest() {
    if (!inScene) return;
    if (!pop.hidden || strip.matches(':hover') || strip.querySelector(':focus-visible')) { stripWake(); return; }
    document.documentElement.classList.add('scene-idle');
  }
  function enterScene() {
    if (DONE_SCENE !== 'room' || inScene) return;
    inScene = true;
    document.documentElement.classList.add('cinema');
    colBtn.disabled = !(room && room.handle);
    root.append(bars, strip, pop);
    idle.ac = new AbortController();
    for (const type of ['pointermove', 'pointerdown', 'wheel', 'keydown']) document.addEventListener(type, stripWake, { signal: idle.ac.signal, passive: true });
    stripWake();
    enterRoom();
    safe();
  }
  function leaveScene() {
    if (!inScene) { leaveRoom(); return; }
    inScene = false;
    if (idle.ac) { idle.ac.abort(); idle.ac = null; }
    clearTimeout(idle.timer);
    document.documentElement.classList.remove('cinema', 'scene-idle');
    toggleColours(false);
    bars.remove(); strip.remove(); pop.remove();
    leaveRoom();
    renderPlayer(); safe();
    if (showcase && showcase.from && !leaving) { leaving = true; ctx.switchTo(showcase.from); }   // the showcase's Back: where it came from
  }
  let leaving = false;   // a showcase's switch back is under way (its unmount leaves the scene again)
  function enterRoom() {
    if (DONE_SCENE !== 'room' || room) return;
    const h = { leaveFn: null, handle: null, mineWas: mine };
    room = h;
    setColors(true);
    import('../scenes/done.js').then(({ enterDoneScene }) => {
      if (room !== h) return;
      const r = enterDoneScene(stage, { say, orbit: false });
      h.leaveFn = r.leave;
      // a room that did not load takes the scene mode with it: the HUD must not stay hidden over an empty stage (Sol 01a16c20)
      r.ready.then((handle) => { if (room !== h) return; h.handle = handle; colBtn.disabled = !handle; if (!handle) { room = null; setColors(h.mineWas); if (inScene) leaveScene(); } renderPlayer(); });
    }).catch((e) => { console.warn('[done scene] the module did not load', e); if (room === h) { room = null; setColors(h.mineWas); if (inScene) leaveScene(); say('The room could not load; the build stays on the stage.'); } });
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
    list.appendChild(el('button.skip.key', { text: 'Skip to the finished build', onclick: () => { done = false; leaveScene(); stage.skipToEnd(); } }));
  }
  /* the end of the instructions: the finished step's fitted view, with the player saying so (and, behind the flag, the way into the scene) */
  function finish() {
    done = true;
    if (stage.cur !== pageOf.finished) stage.goTo(pageOf.finished, { animate: false });
    else { renderList(); renderPlayer(); safe(); }
  }

  /* ---------------- the step player ---------------- */
  const player = el('div.glass.glass-edge', { id: 'ws-player', role: 'region', 'aria-label': 'Step player' });
  root.appendChild(player);
  trackHeight(player);
  function renderPlayer() {
    const cur = stage.cur;
    const isDone = done, onCover = cur === 0;
    const step = cur >= 1 && cur <= pageOf.finished ? steps[cur - 1] : null;
    const num = isDone ? '■' : cur >= pageOf.first && cur <= pageOf.finished ? String(cur - 1) : 'i';
    const title = isDone ? 'End of instructions' : onCover ? (stage.manifest?.title || 'Your build') : (step?.title || '');
    const canScene = DONE_SCENE === 'room';
    const text = isDone ? (canScene ? 'The whole assembly, finished. Watch the final scene, share the link, or go back to any step.' : 'The whole assembly, finished. Share the link, or go back to any step.') : onCover ? 'Press Next to begin the step-by-step, or skip to the finished build.' : (step?.note || '');
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
        el('button.key', { text: '← Back', disabled: cur <= 1 && !isDone, onclick: () => { if (isDone) { done = false; leaveScene(); renderList(); renderPlayer(); } else stage.prev(); } }),
        el('div.pips', {}, rows().map((r) => el('span.pip' + ((r.page === 'done' ? isDone : !isDone && cur === r.page) ? '.cur' : (r.page !== 'done' && (isDone || cur > r.page)) ? '.done' : '')))),
        el('button.key.sq', { 'aria-label': stage.paused ? 'Play' : 'Pause', title: stage.paused ? 'Play' : 'Pause', disabled: isDone, onclick: () => { stage.setPaused(!stage.paused); renderPlayer(); } }, [icon(stage.paused ? 'play' : 'pause', { fill: true })]),
        el('button.key' + (stage.slowmo ? '.on' : ''), { text: 'Slow-mo', 'aria-pressed': String(!!stage.slowmo), title: 'Slow motion · watch each step at study speed', onclick: () => { stage.setSlow(!stage.slowmo); renderPlayer(); } }),
        el('button.key.sq', { 'aria-label': 'Replay step', title: 'Replay this step', disabled: isDone || onCover, onclick: () => stage.replay() }, [icon('arrow-counter-clockwise')]),
        // at the end, the Next slot is the way into the final scene (behind the flag); without it, "Finished", as before
        el('button.key.next' + ((!isDone || canScene) ? '.on' : ''), { text: isDone ? (canScene ? 'Watch the final scene' : 'Finished') : 'Next →', disabled: isDone && !canScene, onclick: () => (isDone ? enterScene() : cur === pageOf.finished ? finish() : stage.next()) }),
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
  const BAR = 0.07;   // the scene's bars, a fraction of the height: the same figure as css/app.css's html.cinema (7vh)
  const safeArea = () => {
    if (inScene) { const bar = Math.round(innerHeight * BAR); stage.setSafeArea({ left: 8, right: 8, top: bar + 8, bottom: bar + 8 }); return; }   // the shots are fitted between the bars; the strip sits inside the lower one
    if (phone) { phone.refresh(); stage.setSafeArea({ left: phone.left(), right: phone.right(), top: phone.top(), bottom: phone.bottom() }); return; }
    stage.setSafeArea({ left: 280 + 20 + 8, right: 8, top: innerWidth < 1280 ? 134 : 90, bottom: 22 + player.offsetHeight + 12 });
  };
  const safe = () => { safeArea(); if (room && room.handle) room.handle.refit(); };   // the room's camera is fitted to the free region too
  if (phone) phone.onLayout(safe);
  addEventListener('resize', safe, { signal });
  document.addEventListener('keydown', (e) => { if (e.key === '\\') root.hidden = !root.hidden; if (e.key === 'Escape' && inScene) { if (!pop.hidden) toggleColours(false); else leaveScene(); } }, { signal });
  setColors(false);
  // the step a visitor left on comes back after a trip to another workspace (ctx.memo); a first arrival lands on the
  // exploded overview, from the cover (a ?ws=assemble address) AND from the finished step the other workspaces park
  // the stage on (Joey, 2026-10-20: Assemble opened "at the end" when reached from Build)
  const back = ctx.memo?.assemblePage;
  if (back != null) { done = !!ctx.memo.assembleDone; stage.goTo(back, { animate: false }); }   // a remembered Done comes back as the End page, not the scene
  else if (stage.cur !== pageOf.overview) stage.goTo(pageOf.overview);
  renderList(); renderPlayer(); tb.sync(); safe();
  if (showcase) { finish(); enterScene(); }   // straight into the scene

  return {
    onPage(i) { if (i !== pageOf.finished) { done = false; leaveScene(); } renderList(); renderPlayer(); tb.sync(); safe(); },   // a remount's goTo lands on the finished page, so a remembered Done survives it
    onCamFree() { tb.sync(); },   // the camera taken (an orbit) or given back: the toolbar's camera button lights up or not
    onQuality(tier) { if (room && room.handle) room.handle.onQuality(tier); },   // the room re-aims its lights after the tier's rig reset
    unmount() {
      leaving = true;
      leaveScene();
      ac.abort();
      if (ctx.memo) { ctx.memo.assemblePage = keptPlace ? keptPlace.page : stage.cur; ctx.memo.assembleDone = keptPlace ? keptPlace.done : done; }   // a showcase keeps Assemble's own place
      stage.setPaused(false);
      if (stage.useCustom !== hadOwnColors) { stage.useCustom = hadOwnColors; stage.applyPalette(); }
      stage.setSafeArea(null);
      if (phone) phone.destroy(); root.remove();
    },
  };
}
