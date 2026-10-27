/* Label previews in the Labels panel, drawn from the SAME geometry as the 3D label (Joey 2026-10-17, with a screenshot: "the
   small labels differ from the actual labels" - the list showed "M2 × 5 / SHCS" in a CSS box while the model printed "M2 × 6"
   over the screw drawing, which by his 2026-10-07 decision replaces the head word). This supersedes decision 3b
   (docs/redesign/DECISIONS.md, 2026-10-13: the lightweight CSS preview): its reason - the separate planner had no label
   core, about 1.2 MB more to load - does not hold in the merged app, which loads the core for the stage anyway.

   What a preview draws, in the label frame (mm, centred, y up), onto a small canvas kept as a data URL:
   - the EdgeLabel face (EDGELABEL_FACE: the vendored hardware-data.js face, copied so an ordinary label needs no part data;
     test/label-preview.test.mjs pins the copy to the vendored file) in the build's Label colour;
   - a stripe's body pieces (the Label Studio's band data) in their colours;
   - the ink, in the label's TEXT colour: a part label's rings from partLabelLayout - the very layout its 3D ink is extruded
     from - or an ordinary label's top faces from labelGeometry's cached geometry (its wrap, shrink and badge).
   Nothing is drawn until the data it needs has loaded (the caller shows its CSS preview meanwhile). Classic Pro labels keep
   the CSS preview: the stage draws their words since 2026-10-27 (label-text.js, the Classic Pro core), but this file holds
   only EdgeLabel's face. */
import { labelFontReady, labelPartsReady, partLabelLayout, labelInk2d, stripePieces2d, stripeColours } from './label-text.js';

export const EDGELABEL_FACE = Object.freeze([[-28.5, -12.501], [-0.671, -12.501], [-0.458, -12.496], [-0.247, -12.481], [-0.039, -12.456],
  [0.166, -12.422], [0.369, -12.377], [0.568, -12.322], [0.763, -12.258], [0.955, -12.184], [1.143, -12.101], [1.327, -12.008],
  [1.506, -11.906], [1.681, -11.794], [1.85, -11.674], [2.015, -11.544], [2.175, -11.406], [2.329, -11.258], [27.087, 13.5], [-28.5, 13.5]]
  .map((p) => Object.freeze(p)));
const xs = EDGELABEL_FACE.map((p) => p[0]), ys = EDGELABEL_FACE.map((p) => p[1]);
export const FACE_BOX = Object.freeze({ minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
  get w() { return this.maxX - this.minX; }, get h() { return this.maxY - this.minY; } });

/* What a look needs loaded before it can be drawn: { font, layout, bands } for label-text.js's loaders. */
export function previewNeeds(look) {
  if (!look) return null;
  if (look.kind === 'part') return { font: true, layout: true, bands: !!look.position };
  return { font: true, layout: false, bands: !!look.stripe };
}
/* Whether it has. */
export function previewReady(look) {
  const n = previewNeeds(look);
  return !!n && labelFontReady() && (!(n.layout || n.bands) || labelPartsReady({ layout: n.layout, bands: n.bands }));
}

/* The flat pieces of a look, from the 3D label's own sources: { pieces, ink } or null (not loaded, or nothing that prints:
   a part label that cannot be laid out shows its words in 3D, and the caller falls back the same way).
     pieces: [{ tris, hex }]                  stripe body pieces (hex null = the label's Body colour)
     ink:    { rings: [[ring, ...], ...] }    a part label's even-odd outlines, one entry per shape
           | { tris: [Float32Array, ...] }    an ordinary label's top-face triangles (text, badge) */
export function previewShapes(look) {
  if (!previewReady(look)) return null;
  if (look.kind === 'part') {
    const r = partLabelLayout(look.item, look.position);
    if (!r || !r.elements) return null;
    const rings = [];
    for (const parts of Object.values(r.elements)) for (const p of parts) rings.push(p);
    return { pieces: r.band ? stripePieces2d(r.band, r.colours) || [] : [], ink: { rings } };
  }
  const g = labelInk2d(look.text, look.badge, look.style, look.upload);
  if (!g) return null;
  let pieces = [];
  if (look.stripe) {
    const c = stripeColours(look.stripe.colours);
    pieces = (c && stripePieces2d(look.stripe.position, c)) || [];
  }
  return { pieces, ink: { tris: g.tris } };
}

/* A PNG data URL of the label as its 3D label draws it, or null (see previewShapes). opts: { width (CSS px), dpr, body, ink }
   (hex colours: the build's Label and Label:TEXT). Cached by look and size: the panel re-renders on every change. */
const cache = new Map();
const CACHE_MAX = 300;
export function labelPreviewUrl(look, { width = 84, dpr = 1, body = '#f4f1ec', ink = '#1a1a1a' } = {}) {
  if (!look || typeof document === 'undefined') return null;
  const W = Math.max(16, Math.round(width * dpr)), H = Math.max(8, Math.round(W * FACE_BOX.h / FACE_BOX.w));
  const key = JSON.stringify([look, W, body, ink]);
  if (cache.has(key)) return cache.get(key);
  const shapes = previewShapes(look);
  if (!shapes) return null;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  if (!cx) return null;
  const s = W / FACE_BOX.w;
  cx.setTransform(s, 0, 0, -s, -FACE_BOX.minX * s, FACE_BOX.maxY * s);   // mm, y up -> canvas px, y down
  cx.beginPath();
  EDGELABEL_FACE.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y)));
  cx.closePath();
  cx.fillStyle = body;
  cx.fill();
  cx.save();
  cx.clip();   // the stripe and the ink lie on the face, as on the label
  for (const p of shapes.pieces) { cx.fillStyle = p.hex || body; fillTris(cx, p.tris); }
  cx.fillStyle = ink;
  if (shapes.ink.rings) for (const rings of shapes.ink.rings) fillRings(cx, rings);
  if (shapes.ink.tris) for (const t of shapes.ink.tris) fillTris(cx, t);
  cx.restore();
  const url = cv.toDataURL('image/png');
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, url);
  return url;
}
// one path per piece: shared triangle edges are inside the path, so no hairline seams show between them
function fillTris(cx, t) {
  cx.beginPath();
  for (let i = 0; i + 5 < t.length; i += 6) { cx.moveTo(t[i], t[i + 1]); cx.lineTo(t[i + 2], t[i + 3]); cx.lineTo(t[i + 4], t[i + 5]); cx.closePath(); }
  cx.fill();
}
function fillRings(cx, rings) {
  cx.beginPath();
  for (const r of rings) {
    for (let i = 0; i + 1 < r.length; i += 2) { if (i) cx.lineTo(r[i], r[i + 1]); else cx.moveTo(r[i], r[i + 1]); }
    cx.closePath();
  }
  cx.fill('evenodd');   // the layout's own rule: a ring inside an odd number of others is a hole
}
