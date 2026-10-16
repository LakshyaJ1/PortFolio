"use client";

// Canvas instruments draw with the same ramp the CSS uses. Tokens are read once
// from :root so a token change in globals.css flows into every instrument.

export type Palette = {
  /** z0 … z10 */
  z: string[];
  fix: string;
  fixHi: string;
  ok: string;
  alert: string;
  mono: string;
  sans: string;
};

let cached: Palette | null = null;

const FALLBACK_Z = [
  "#060907",
  "#0b100d",
  "#111814",
  "#18211c",
  "#212c26",
  "#2f3c35",
  "#46554c",
  "#6f7f75",
  "#9eaba2",
  "#cfd8d1",
  "#eef2ec",
];

export function readPalette(): Palette {
  if (cached) return cached;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  cached = {
    z: FALLBACK_Z.map((fb, i) => v(`--z${i}`, fb)),
    fix: v("--fix", "#ff5b23"),
    fixHi: v("--fix-hi", "#ff7a45"),
    ok: v("--ok", "#9fe07a"),
    alert: v("--alert", "#ff5470"),
    mono: v("--font-mono", "ui-monospace, monospace"),
    sans: v("--font-display", "system-ui, sans-serif"),
  };
  return cached;
}

/** "#rrggbb" + alpha → rgba() for canvas strokes (transparency is allowed on canvas). */
export function alpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function monoFont(p: Palette, px: number, weight = 500) {
  return `${weight} ${px}px ${p.mono}`;
}

export function sansFont(p: Palette, px: number, weight = 500, stretch = "condensed") {
  // canvas font-stretch keywords: "condensed" ≈ 75%, "semi-condensed" ≈ 87.5%
  return `${stretch} ${weight} ${px}px ${p.sans}`;
}
