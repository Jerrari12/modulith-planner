/* Generated, colour-aware product icons - the style brief §3, ported from the v4 artboard's glyph().
 *
 * Every unit, size and faceplate icon is drawn from the build's live filament colours
 * `{ body, front, handle, lb, lt }`, never from a photo. The artboard draws each glyph as three
 * nested divs (outer / face / handle) with inline styles; this returns those three style strings
 * and `glyphEl()` builds the element. Sizes are physically proportional: K px per mm, so 1W = 88K
 * and 1H = 56K (K = 0.16 gives 14 × 9 px per unit).
 *
 * kinds: classicDrawer, essential, classicFace, edgelabel, classicpro, chevron, shelf, cabinet,
 * gridfinity. FACEK maps a faceplate id to its glyph kind.
 */
export const K = 0.16;
export const FACEK = { essential: 'essential', classic: 'classicFace', edgelabel: 'edgelabel', classicpro: 'classicpro', chevron: 'chevron' };
export const DEFAULT_COLORS = { body: '#232326', front: '#E9DFCF', handle: '#FF6A1A', lb: '#F2F1EC', lt: '#2A2A2D' };

export function glyph(kind, w, h, c, edge) {
  w = Math.max(6, Math.round(w)); h = Math.max(4, Math.round(h));
  const pad = Math.max(1, Math.round(Math.min(w, h) / 12));
  const outer = `width:${w}px;height:${h}px;flex:none;background:${c.body};border-radius:${Math.max(2, Math.round(h / 10))}px;padding:${pad}px;box-sizing:border-box;display:flex;box-shadow:${edge}`;
  const hh = Math.max(2, Math.round(h * 0.16));
  let face = `flex:1;background:${c.front};border-radius:2px;display:flex;justify-content:center;align-items:flex-start;overflow:hidden;box-shadow:inset 0 -2px 0 rgba(0,0,0,.14)`;
  let handle = 'display:none';
  if (kind === 'classicDrawer') handle = `width:46%;height:${hh}px;background:rgba(0,0,0,.25);border-radius:0 0 4px 4px`;
  else if (kind === 'essential') { face += ';align-items:center'; handle = `width:40%;height:${Math.max(2, Math.round(h * 0.12))}px;background:${c.handle};border-radius:99px`; }
  else if (kind === 'classicFace') handle = `width:34%;height:${hh}px;background:${c.body};border-radius:0 0 5px 5px`;
  else if (kind === 'edgelabel') handle = `width:88%;height:${Math.max(2, Math.round(h * 0.26))}px;background:${c.lb};border-radius:1px;margin-top:${Math.max(1, Math.round(h * 0.07))}px;box-shadow:0 1px 0 ${c.handle}`;
  else if (kind === 'classicpro') { face += ';align-items:center'; handle = `width:60%;height:${Math.max(3, Math.round(h * 0.34))}px;background:${c.lb};border-radius:2px;box-shadow:0 0 0 1px ${c.handle}`; }
  else if (kind === 'chevron') { face = face.replace(`background:${c.front}`, `background:repeating-linear-gradient(135deg,rgba(0,0,0,.16) 0 3px,transparent 3px 6px),${c.front}`) + ';align-items:center'; handle = `width:40%;height:${Math.max(2, Math.round(h * 0.12))}px;background:${c.handle};border-radius:99px`; }
  else if (kind === 'shelf') face = `flex:1;background:#0F0F11;border-radius:2px;box-shadow:inset 0 -${Math.max(2, Math.round(h * 0.14))}px 0 ${c.front}`;
  else if (kind === 'cabinet') { face += ';justify-content:flex-end;align-items:center;box-shadow:inset 2px 0 0 rgba(0,0,0,.2)'; handle = `width:${Math.max(2, Math.round(w * 0.06))}px;height:${Math.max(3, Math.round(h * 0.24))}px;background:${c.handle};border-radius:99px;margin-right:12%`; }
  else if (kind === 'gridfinity') { face += ';align-items:flex-start;background-image:linear-gradient(90deg,rgba(0,0,0,.12) 1px,transparent 1px);background-size:25% 100%'; handle = `width:34%;height:${hh}px;background:${c.handle};border-radius:0 0 3px 3px`; }
  return { outer, face, handle };
}

/* the element: <div style=outer><div style=face><div style=handle></div></div></div>. `edge` defaults to
   the theme's --edge token through a CSS variable, so the same element is right in both modes. */
export function glyphEl(kind, w, h, c = DEFAULT_COLORS, edge = 'var(--edge)') {
  const g = glyph(kind, w, h, c, edge);
  const outer = document.createElement('div'); outer.className = 'glyph'; outer.setAttribute('style', g.outer); outer.setAttribute('aria-hidden', 'true');
  const face = document.createElement('div'); face.setAttribute('style', g.face);
  const handle = document.createElement('div'); handle.setAttribute('style', g.handle);
  face.appendChild(handle); outer.appendChild(face);
  return outer;
}

/* a size tile's glyph: w units wide, h units high, drawn to scale */
export const sizeGlyph = (kind, w, h, c) => glyphEl(kind, w * 88 * K, h * 56 * K, c);
