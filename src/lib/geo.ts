import type { LatLng } from "@/content/profile";

/** 28.6139 → 28°36′50″ */
function dms(value: number) {
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  // carry rounding so we never print 60″
  const [mm, ss] = s === 60 ? [m + 1, 0] : [m, s];
  return `${d}°${String(mm).padStart(2, "0")}′${String(ss).padStart(2, "0")}″`;
}

export function formatDMS({ lat, lng }: LatLng) {
  return `${dms(lat)}${lat >= 0 ? "N" : "S"} ${dms(lng)}${lng >= 0 ? "E" : "W"}`;
}

export function formatDecimal({ lat, lng }: LatLng, digits = 4) {
  return `${Math.abs(lat).toFixed(digits)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(digits)}°${lng >= 0 ? "E" : "W"}`;
}

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a to b, degrees 0–360. */
export function bearing(a: LatLng, b: LatLng) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** "2026-06" → "Jun 2026" */
export function formatMonth(ym: string | null) {
  if (!ym) return "Present";
  const [y, m] = ym.split("-").map(Number);
  if (!m) return String(y);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
