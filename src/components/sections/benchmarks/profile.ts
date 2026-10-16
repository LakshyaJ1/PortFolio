// Elevation profile geometry for the benchmarks strip (wide sheets). The profile is the sheet's terrain
// in cross-section: it carries no data (no axis, no heights), only the posts the benchmarks stand on.

/** terrain height along the traverse, 0 (low) … 1 (high) */
export function terrain(t: number) {
  const v =
    0.52 +
    0.22 * Math.sin(2 * Math.PI * (1.08 * t + 0.12)) +
    0.11 * Math.sin(2 * Math.PI * (2.6 * t + 0.55)) +
    0.05 * Math.sin(2 * Math.PI * (6.1 * t + 0.2));
  return Math.min(0.95, Math.max(0.05, v));
}

/** where a post stands inside its column (fraction from the column's left edge) */
export const POST_INSET = 0.06;

/** horizontal profile: y as a fraction of the band height (0 = top) */
export const bandY = (t: number) => 0.14 + 0.62 * (1 - terrain(t));

/** polyline for the horizontal band in a 0..1000 × 0..100 box */
export function horizontalPath(samples = 120) {
  let d = "";
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    d += `${i ? "L" : "M"}${(t * 1000).toFixed(1)} ${(bandY(t) * 100).toFixed(2)}`;
  }
  return d;
}

/** clip-path polygon for the hatched ground under the horizontal profile */
export function horizontalGround(samples = 60) {
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    pts.push(`${(t * 100).toFixed(2)}% ${(bandY(t) * 100).toFixed(2)}%`);
  }
  return `polygon(${pts.join(", ")}, 100% 100%, 0% 100%)`;
}

export type Figure = { prefix: string; value: number; suffix: string; from: number; grouped: boolean };

/**
 * "Top 20%" → counts down from 100 (a rank rises as the number falls); "250+", "15 km", "10" count up from 0.
 * Returns null for anything that isn't a plain number, so nothing is ever invented.
 */
export function parseFigure(figure?: string): Figure | null {
  if (!figure) return null;
  const m = figure.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const value = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const prefix = m[1];
  const suffix = m[3];
  const rank = /top/i.test(prefix) && suffix.trim() === "%";
  return { prefix, value, suffix, from: rank ? 100 : 0, grouped: m[2].includes(",") };
}
