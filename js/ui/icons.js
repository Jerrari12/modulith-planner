/* Phosphor icons from the committed sprite icons/phosphor.svg (built by tools/make-icons.mjs).
   Regular for idle, Fill for active (the brief §3). `icon('cube')` returns an <svg> that inherits
   currentColor; `icon('cube', { fill: true })` picks the Fill symbol. */
const SPRITE = new URL('../../icons/phosphor.svg', import.meta.url).href.replace(/\?.*$/, '');

export function icon(name, { fill = false, size = 18, label = null } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ph');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 256 256');
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `${SPRITE}#ph-${name}${fill ? '-fill' : ''}`);
  svg.appendChild(use);
  return svg;
}
