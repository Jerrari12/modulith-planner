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
export function makeToast(root) {
  const toast = el('div', { id: 'ws-toast', class: 'glass' });
  root.appendChild(toast);
  let t = 0;
  const say = (msg) => { toast.textContent = msg; toast.classList.add('show'); clearTimeout(t); t = setTimeout(() => toast.classList.remove('show'), 2600); };
  const soon = (what, when) => () => say(`${what} comes with ${when}.`);
  return { say, soon };
}
