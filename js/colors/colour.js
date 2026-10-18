/* Colour science for the Colors workspace: sRGB hex -> CIELAB (D65), CIEDE2000, WCAG contrast and LCh. Written
   2026-10-17 for the MODULITH preset study (D:/Claude - Output/colors-presets-2026-10-17/colour.mjs), moved into the
   runtime for "Surprise me" (the Colors plan, step 5, 2026-10-18). Verified against the 34 test pairs of Sharma, Wu &
   Dalal (2005), "The CIEDE2000 color-difference formula: implementation notes, supplementary test data, and
   mathematical observations": test/colour.test.mjs. */

export function hexToRgb(hex) {
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`bad hex ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const toLinear = (c8) => { const c = c8 / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

// IEC 61966-2-1 sRGB primaries, D65 white; Lab against the D65 reference white.
export function hexToLab(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const Z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  const [Xn, Yn, Zn] = [0.95047, 1.0, 1.08883];
  const e = 216 / 24389, k = 24389 / 27;
  const f = (t) => (t > e ? Math.cbrt(t) : (k * t + 16) / 116);
  const fx = f(X / Xn), fy = f(Y / Yn), fz = f(Z / Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function deltaE00(lab1, lab2, kL = 1, kC = 1, kH = 1) {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (a, b) => { if (a === 0 && b === 0) return 0; const h = deg(Math.atan2(b, a)); return h < 0 ? h + 360 : h; };
  const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
  else hbp = (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp))
          + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.20 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;
  const l = dLp / (kL * SL), c = dCp / (kC * SC), h = dHp / (kH * SH);
  return Math.sqrt(l * l + c * c + h * h + RT * c * h);
}

export const dE = (hexA, hexB) => deltaE00(hexToLab(hexA), hexToLab(hexB));

// WCAG relative luminance contrast - the same formula test/presets.test.mjs uses for the shelf deck floor.
const lum = (hex) => {
  const c = hexToRgb(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

export const lch = (hex) => { const [L, a, b] = hexToLab(hex); const C = Math.hypot(a, b); let h = deg(Math.atan2(b, a)); if (h < 0) h += 360; return [L, C, h]; };
