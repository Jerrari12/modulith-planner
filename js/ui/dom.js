/* Small DOM helpers shared by the workspaces. */

/* el('button.seg.on', { title, onclick }, [children]) - attributes, 'text'/'html' shorthands, on* listeners */
export function el(spec, attrs = {}, children = []) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'disabled') node.disabled = true;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c != null) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

/* one toast at the bottom of the workspace; say(msg) shows it for 2.6 s */
/* keep Tab inside a modal: a keydown listener for the dialog element, cycling the focusable elements of `box` (the caller
   handles Escape). A dialog that moves focus out of the page on Tab is the first thing a keyboard user notices. */
export function trapTab(dialog, box = dialog) {
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && !x.hidden && x.offsetParent !== null);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? items[items.length - 1] : items[i - 1]) : (i < 0 || i === items.length - 1 ? items[0] : items[i + 1]);
    e.preventDefault(); next.focus();
  });
}
export function makeToast(root) {
  const toast = el('div', { id: 'ws-toast', class: 'glass', role: 'status', 'aria-live': 'polite' });
  root.appendChild(toast);
  let t = 0;
  const say = (msg) => { toast.textContent = msg; toast.classList.add('show'); clearTimeout(t); t = setTimeout(() => toast.classList.remove('show'), 2600); };
  const soon = (what, when) => () => say(`${what} comes with ${when}.`);
  return { say, soon };
}
