// Terrain toolkit · palette. Reads the design tokens (the z0…z10 ramp, fix, hydro) from CSS
// custom properties so canvases never carry their own hex. Values are sRGB 0–1 triples,
// written straight to the framebuffer by the contour shader (no colour-space round trip).

export type RGB = [number, number, number];

const RAMP = ["z0", "z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9", "z10"] as const;
export type RampKey = (typeof RAMP)[number];
export type Palette = Record<RampKey | "fix" | "fixHi" | "hydro", RGB>;

// Fallbacks match globals.css; only used if the stylesheet hasn't applied yet.
const FALLBACK: Record<keyof Palette, string> = {
  z0: "#060907",
  z1: "#0b100d",
  z2: "#111814",
  z3: "#18211c",
  z4: "#212c26",
  z5: "#2f3c35",
  z6: "#46554c",
  z7: "#6f7f75",
  z8: "#9eaba2",
  z9: "#cfd8d1",
  z10: "#eef2ec",
  fix: "#ff5b23",
  fixHi: "#ff7a45",
  hydro: "#7cc4f2",
};

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function readPalette(el: Element = document.documentElement): Palette {
  const cs = getComputedStyle(el);
  const read = (name: string, key: keyof Palette) => hexToRgb(cs.getPropertyValue(name)) ?? hexToRgb(FALLBACK[key])!;
  const out = {} as Palette;
  for (const k of RAMP) out[k] = read(`--${k}`, k);
  out.fix = read("--fix", "fix");
  out.fixHi = read("--fix-hi", "fixHi");
  out.hydro = read("--hydro", "hydro");
  return out;
}

export const toHex = ([r, g, b]: RGB) =>
  "#" + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
