// The year of daily contributions as terrain: each day is a survey point on a week × weekday grid,
// counts are summed as gaussian hills into a heightfield, and the field is contoured.

import { chaikin, isolines, toPath } from "./contours";
import { MONTHS, shortDay } from "./time";

export type Orientation = "landscape" | "portrait";
export type Day = { date: string; count: number };
export type Cell = Day & { x: number; y: number; week: number; dow: number };
export type Label = { x: number; y: number; anchor: "start" | "end" };
export type Peak = Cell & { summit: boolean; label: Label | null };
export type Contour = { d: string; level: number; index: boolean };

export type TerrainModel = {
  orient: Orientation;
  width: number;
  height: number;
  plot: { x0: number; y0: number; x1: number; y1: number };
  cw: number;
  ch: number;
  weeks: number;
  cells: Cell[];
  lookup: Map<string, Cell>;
  contours: Contour[];
  peaks: Peak[];
  months: { x: number; y: number; label: string; anchor: "start" | "end" | "middle" }[];
  weekdays: { x: number; y: number; label: string; anchor: "start" | "end" | "middle" }[];
  ticks: string;
  interval: number;
  levels: number;
  last: Cell | null;
};

const NICE = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500];

function niceStep(raw: number) {
  if (!(raw > 0)) return 1;
  return NICE.find((s) => s >= raw) ?? NICE[NICE.length - 1];
}

const LABEL_CHAR = 6.3; // mono at 10px, in viewBox units

export function buildTerrain(days: Day[], orient: Orientation): TerrainModel {
  const firstDate = days[0]?.date ?? "2026-01-01";
  const [fy, fm, fd] = firstDate.split("-").map(Number);
  const firstDow = new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay();
  const weeks = Math.max(1, Math.floor((Math.max(days.length, 1) - 1 + firstDow) / 7) + 1);

  // ─── geometry (viewBox units) ───
  let width: number, height: number, x0: number, y0: number, x1: number, y1: number, cw: number, ch: number;
  if (orient === "landscape") {
    width = 1200;
    x0 = 44;
    x1 = width - 14;
    cw = (x1 - x0) / weeks;
    ch = 27;
    y0 = 30;
    y1 = y0 + ch * 7;
    height = y1 + 30;
  } else {
    width = 360;
    x0 = 56;
    x1 = width - 10;
    cw = (x1 - x0) / 7;
    ch = 14;
    y0 = 30;
    y1 = y0 + ch * weeks;
    height = y1 + 14;
  }
  const at = (week: number, dow: number): [number, number] =>
    orient === "landscape" ? [x0 + (week + 0.5) * cw, y0 + (dow + 0.5) * ch] : [x0 + (dow + 0.5) * cw, y0 + (week + 0.5) * ch];

  const cells: Cell[] = days.map((d, k) => {
    const slot = k + firstDow;
    const week = Math.floor(slot / 7);
    const dow = slot % 7;
    const [x, y] = at(week, dow);
    return { ...d, x, y, week, dow };
  });
  const lookup = new Map(cells.map((c) => [`${c.week}:${c.dow}`, c]));

  // ─── heightfield ───
  const sigma = orient === "landscape" ? 19 : 16;
  const g = 4;
  const pad = 56;
  const nx = Math.ceil((width + pad * 2) / g) + 1;
  const ny = Math.ceil((height + pad * 2) / g) + 1;
  const field = new Float32Array(nx * ny);
  const reach = sigma * 4;
  const twoS2 = 2 * sigma * sigma;
  let max = 0;
  for (const c of cells) {
    if (c.count <= 0) continue;
    const i0 = Math.max(0, Math.floor((c.x - reach + pad) / g));
    const i1 = Math.min(nx - 1, Math.ceil((c.x + reach + pad) / g));
    const j0 = Math.max(0, Math.floor((c.y - reach + pad) / g));
    const j1 = Math.min(ny - 1, Math.ceil((c.y + reach + pad) / g));
    for (let j = j0; j <= j1; j++) {
      const dy = j * g - pad - c.y;
      for (let i = i0; i <= i1; i++) {
        const dx = i * g - pad - c.x;
        const v = (field[j * nx + i] += c.count * Math.exp(-(dx * dx + dy * dy) / twoS2));
        if (v > max) max = v;
      }
    }
  }

  // ─── contours: half-interval offsets so a single contribution still gets one ring ───
  const interval = niceStep(max / 7);
  const contours: Contour[] = [];
  let levels = 0;
  for (let k = 1; (k - 0.5) * interval < max; k++) {
    const level = (k - 0.5) * interval;
    levels = k;
    for (const line of isolines(field, nx, ny, level)) {
      if (line.pts.length < 4) continue;
      const pts = chaikin(line.pts, line.closed, 2);
      contours.push({
        d: toPath(pts, line.closed, ([px, py]) => [px * g - pad, py * g - pad]),
        level: k,
        index: k % 5 === 0,
      });
    }
  }

  // ─── spot heights: the tallest days, thinned so labels stay legible ───
  const minGap = orient === "landscape" ? 46 : 38;
  const ranked = cells
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || (a.date < b.date ? 1 : -1));
  const chosen: Cell[] = [];
  for (const c of ranked) {
    if (chosen.length >= 10) break;
    if (chosen.every((p) => Math.hypot(p.x - c.x, p.y - c.y) > minGap)) chosen.push(c);
  }
  const boxes: [number, number, number, number][] = [];
  const peaks: Peak[] = chosen.map((c, i) => {
    const text = `${c.count} ${shortDay(c.date)}`;
    const w = text.length * LABEL_CHAR;
    const tries: Label[] = [
      { x: c.x + 7, y: c.y - 6, anchor: "start" },
      { x: c.x - 7, y: c.y - 6, anchor: "end" },
      { x: c.x + 7, y: c.y + 14, anchor: "start" },
      { x: c.x - 7, y: c.y + 14, anchor: "end" },
    ];
    let label: Label | null = null;
    for (const t of tries) {
      const bx0 = t.anchor === "start" ? t.x : t.x - w;
      const box: [number, number, number, number] = [bx0 - 2, t.y - 10, bx0 + w + 2, t.y + 3];
      if (box[0] < 2 || box[2] > width - 2 || box[1] < 2 || box[3] > height - 2) continue;
      const hitsLabel = boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      const hitsPeak = chosen.some((p) => p !== c && p.x > box[0] - 3 && p.x < box[2] + 3 && p.y > box[1] - 3 && p.y < box[3] + 3);
      if (hitsLabel || hitsPeak) continue;
      boxes.push(box);
      label = t;
      break;
    }
    return { ...c, summit: i === 0, label };
  });

  // ─── margins: months, weekdays and ruled ticks ───
  const months: TerrainModel["months"] = [];
  let lastWeek = -9;
  for (const c of cells) {
    if (!c.date.endsWith("-01") || c.week - lastWeek < 3) continue;
    lastWeek = c.week;
    const m = Number(c.date.slice(5, 7)) - 1;
    const label = m === 0 ? `Jan ${c.date.slice(2, 4)}` : MONTHS[m];
    if (orient === "landscape") months.push({ x: x0 + c.week * cw + 2, y: y1 + 18, label, anchor: "start" });
    else months.push({ x: x0 - 8, y: y0 + c.week * ch + 9, label, anchor: "end" });
  }
  const weekdays: TerrainModel["weekdays"] = [1, 3, 5].map((dow) => {
    const label = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];
    return orient === "landscape"
      ? { x: x0 - 8, y: y0 + (dow + 0.5) * ch + 3.5, label, anchor: "end" as const }
      : { x: x0 + (dow + 0.5) * cw, y: y0 - 11, label, anchor: "middle" as const };
  });

  let ticks = "";
  const monthWeeks = new Set(months.map((m) => Math.round(orient === "landscape" ? (m.x - 2 - x0) / cw : (m.y - 9 - y0) / ch)));
  for (let w = 0; w <= weeks; w++) {
    const long = monthWeeks.has(w);
    if (orient === "landscape") {
      const x = (x0 + w * cw).toFixed(1);
      ticks += `M${x} ${y1}v${long ? 7 : 3}`;
    } else {
      const y = (y0 + w * ch).toFixed(1);
      ticks += `M${x0} ${y}h${long ? -7 : -3}`;
    }
  }

  return {
    orient,
    width,
    height,
    plot: { x0, y0, x1, y1 },
    cw,
    ch,
    weeks,
    cells,
    lookup,
    contours,
    peaks,
    months,
    weekdays,
    ticks,
    interval,
    levels,
    last: cells[cells.length - 1] ?? null,
  };
}
