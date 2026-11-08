/* THE PART PICKER MODAL (docs/redesign/LABELS-INTEGRATION.md, step A): the Studio's Part Picker in a frame over the
   workspace, made once per caller and hidden between openings so its choices persist. The planner speaks first: a hello
   with a session the Picker binds to (it checks the origin against its own list); every message after carries the
   session, and the planner reads only from its own frame's window at the Studio's origin. A batch lands in the build
   that was open when the modal opened; the Picker is answered only after the caller took it.
   Moved out of js/workspaces/labels.js unchanged (2026-11-07) so the parts drawer's list in Build opens the same Picker:
   each workspace makes its own instance (its own frame, session and return focus); what a batch becomes is the caller's
   (`onBatch`): labels in the Labels workspace, list items in the compartment editor.

   const pp = partPicker({
     root,                 // where the veil is appended
     signal,               // the workspace's AbortSignal: the message listener goes with it
     buildId: () => id,    // the build a batch is for (one opened on another build is refused)
     frameQuery: () => '', // extra query for the Picker's frame ('&type=classicpro')
     onBatch(items, { reply, close }),   // the batch: reply({ gen2parts: 'added' | 'refused', ... }) and close() are the caller's to call
     focusKey, restoreFocus,             // the caller's focus bookkeeping for the opener (optional)
     debug,                // true: window.__GEN2_PICKER__ reads the handshake (the e2e suite)
   });
   pp.open({ open })       // open: a part to open in the Picker (Edit part details), or none
   pp.close() */
import { el } from './dom.js';
import { icon } from './icons.js';

export const LABEL_STUDIO_URL = 'https://labels.modulith.systems/';
/* the Studio the frames point at: the published one, or on a local planner a local Studio named by ?studio= (kept for the tab) */
export const STUDIO = (() => {
  try {
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(location.origin);
    const ok = (u) => typeof u === 'string' && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}\/$/.test(u);
    const q = new URLSearchParams(location.search).get('studio');
    if (local && ok(q)) sessionStorage.setItem('gen2-studio-url', q);
    const s = sessionStorage.getItem('gen2-studio-url');
    if (local && ok(s)) return s;
  } catch { /* no storage */ }
  return LABEL_STUDIO_URL;
})();
export const STUDIO_ORIGIN = new URL(STUDIO).origin;
export const PICKER_MAX = 200;   // the Picker's own cap on one batch
const PICKER_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const newSession = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map((b) => PICKER_ALPHABET[b % 62]).join(''); };

/* THE HANDSHAKE'S PATIENCE (the stress test, 2026-10-15: a slow or unreachable Studio was blamed on the allowlist, and
   nothing offered a retry). After 8 s it says what is likely and offers Try again, which reloads the frame (the load
   sends the hello again) and waits again. Shared with the Label plate's frame (labels.js openPlate). */
export function armWait(h, who) {
  clearTimeout(h.wait);
  h.wait = setTimeout(() => {
    if (h.ready || h.bad) return;
    h.link.replaceChildren(el('span', { text: `${who} hasn’t answered yet. It may be slow, or its site may be down. ` }),
      el('button.key.sm', { onclick: () => { h.link.textContent = 'Connecting…'; try { h.frame.src = h.frame.src; } catch { /* the frame went away */ } armWait(h, who); } }, ['Try again']));
  }, 8000);
}

export function partPicker({ root, signal, buildId, frameQuery = () => '', onBatch, focusKey = () => null, restoreFocus = () => {}, debug = false }) {
  let picker = null;
  /* EDIT PART DETAILS OPENS THAT PART (LABELS-INTEGRATION.md, the parts channel's additions, `open/1`): only to a Picker
     whose ready offered the cap; one request at a time, the latest wins, and an answer counts only with its own req. An
     older Picker just opens, as before. */
  function sendOpen() {
    const p = picker; if (!p || !p.ready || !p.pendingOpen) return;
    const want = p.pendingOpen; p.pendingOpen = null;
    if (!(p.caps || []).includes('open/1')) return;
    let size = Infinity; try { size = JSON.stringify(want.item).length; } catch { /* not plain data */ }
    if (size > 64 * 1024) return;   // bounded as an add item is
    p.req = newSession();
    try { p.frame.contentWindow.postMessage({ gen2parts: 'open', v: 1, session: p.session, req: p.req, id: want.id, item: want.item }, STUDIO_ORIGIN); } catch { /* the frame went away */ }
  }
  function open({ open = null } = {}) {
    if (picker && picker.buildId !== buildId()) { picker.veil.remove(); picker = null; }   // another build: a new frame and session, so a batch still in flight for the old one is a stranger here (Sol 01a13844); the Picker keeps its list in its own storage
    if (!picker) {
      const session = newSession();
      const frame = el('iframe', { src: STUDIO + 'parts/?embed=planner' + frameQuery(), title: 'Part Picker', referrerpolicy: 'strict-origin-when-cross-origin' });
      const closeBtn = el('button.x', { title: 'Close', 'aria-label': 'Close the Part Picker', onclick: () => close() }, [icon('x', { size: 18 })]);
      const link = el('span.link', { role: 'status', text: 'Connecting…' });   // the handshake, in the planner's own words
      // Tab stays in the dialog (the stress test, 2026-10-15): a sentinel on each side sends the keyboard round to the other end
      const trap = (to) => el('span.trap', { tabindex: '0', 'aria-hidden': 'true', onfocus: () => { try { to().focus(); } catch { /* gone */ } } });
      const veil = el('div', { id: 'ws-partpicker', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Part Picker', hidden: true }, [
        trap(() => frame),
        el('div.glass.frame', {}, [el('div.head', {}, [el('h2', { text: 'Part Picker' }), el('span.sub', { text: 'Choose parts, then Add labels: they land in this build’s list, ready to place.' }), link, closeBtn]), frame]),
        trap(() => closeBtn),
      ]);
      root.appendChild(veil);
      // the build rides on the hello (LABELS-INTEGRATION.md, the parts channel's additions): the Picker keys its "sent" marks by it
      const hello = () => { try { frame.contentWindow.postMessage({ gen2parts: 'hello', v: 1, session, ...(picker && picker.buildId ? { buildId: picker.buildId } : {}) }, STUDIO_ORIGIN); } catch { /* the frame is not there yet */ } };
      frame.addEventListener('load', hello);
      const onMessage = (e) => {
        if (!picker || e.source !== frame.contentWindow || e.origin !== STUDIO_ORIGIN) return;
        const d = e.data;
        if (picker.log.length < 20) picker.log.push(d && d.gen2parts);
        if (!d || typeof d !== 'object' || d.v !== 1 || d.session !== session) return;
        if (d.gen2parts === 'ready') { picker.ready = true; picker.caps = Array.isArray(d.caps) ? d.caps.filter((c) => typeof c === 'string').slice(0, 16) : []; clearTimeout(picker.wait); picker.link.textContent = ''; sendOpen(); return; }
        // Escape inside the frame never reaches this page's keys: the Picker asks, and the dialog closes as its own Escape does
        if (d.gen2parts === 'close') { close(); return; }
        // the answer to an `open`: counted only with the latest req (a superseded one is dropped); a refusal's words show in
        // the dialog's head, where the visitor is looking (this `refused` comes FROM the Picker and carries req, not batch)
        if (d.gen2parts === 'opened' || (d.gen2parts === 'refused' && typeof d.req === 'string')) {
          if (!picker.req || d.req !== picker.req) return;
          picker.req = null;
          if (d.gen2parts === 'refused' && typeof d.reason === 'string') picker.link.textContent = d.reason.slice(0, 300);
          return;
        }
        if (d.gen2parts !== 'add') return;
        // the batch id the Picker minted for this send rides back on the reply, so a late reply to a timed-out send is never
        // credited to the next one (Astra, 2026-10-14: a wrong "added" is not cosmetic); an older Picker sends none and gets none
        const batch = typeof d.batch === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(d.batch) ? d.batch : undefined;
        const reply = (m) => { try { e.source.postMessage({ ...m, v: 1, session, ...(batch ? { batch } : {}) }, STUDIO_ORIGIN); } catch { /* the frame went away */ } };
        if (picker.veil.hidden) { reply({ gen2parts: 'refused', reason: 'The Part Picker was closed before the labels arrived. Open it and press Add part labels again.' }); return; }
        if (buildId() !== picker.buildId) { reply({ gen2parts: 'refused', reason: 'The planner moved to another build while the Part Picker was open. Close it and open it again on that build.' }); return; }
        if (!Array.isArray(d.items) || !d.items.length) { reply({ gen2parts: 'refused', reason: 'No part labels came through.' }); return; }
        if (d.items.length > PICKER_MAX) { reply({ gen2parts: 'refused', reason: `The planner takes at most ${PICKER_MAX} part labels at once.` }); return; }
        onBatch(d.items, { reply, close });
      };
      addEventListener('message', onMessage, { signal });
      picker = { veil, frame, closeBtn, link, session, buildId: null, ready: false, hello, ret: null, log: [], wait: 0 };
      if (debug) window.__GEN2_PICKER__ = () => picker;   // the e2e suite reads the handshake (the instance opened last)
    }
    if (debug) window.__GEN2_PICKER__ = () => picker;
    picker.buildId = buildId();   // the destination: a batch for another build is refused
    picker.ret = document.activeElement; picker.retKey = focusKey();
    picker.veil.hidden = false;
    document.documentElement.classList.add('ws-partpicker-open');
    // this opening's request: a part to open (Edit part details), or none. A new `open` replaces an outstanding one (sendOpen
    // mints a new req); an opening without a part leaves it be, since its answer may still come and a refusal's words still
    // matter (Sol 01a13ffb: clearing req on every opening dropped a refusal that arrived after a quick close and reopen)
    picker.pendingOpen = open && typeof open.id === 'string' && open.id ? { id: open.id, item: open } : null;
    if (picker.ready) { picker.link.textContent = ''; sendOpen(); }
    else {
      picker.hello();   // a frame that loaded before this page listened (or lost the first hello) hears it again
      armWait(picker, 'The Part Picker');
    }
    setTimeout(() => { try { picker.closeBtn.focus(); } catch { /* jsdom */ } }, 0);
  }
  function close() {
    if (!picker || picker.veil.hidden) return;
    picker.veil.hidden = true;
    document.documentElement.classList.remove('ws-partpicker-open');
    const r = picker.ret; picker.ret = null;
    if (r && typeof r.focus === 'function' && document.contains(r)) { try { r.focus(); } catch { /* gone */ } }
    else restoreFocus(picker.retKey, true);   // the add re-rendered the opener (the stress test, 2026-10-15: the keyboard stayed on the hidden frame)
  }
  return { open, close, get picker() { return picker; }, isOpen: () => !!picker && !picker.veil.hidden };
}
