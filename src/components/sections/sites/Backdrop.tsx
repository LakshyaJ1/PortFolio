"use client";

import { useEffect, useRef, type RefObject } from "react";
import { readPalette } from "@/components/sections/capabilities/kit/palette";
import { useLoop } from "@/components/sections/capabilities/kit/loop";
import styles from "./Sites.module.css";

// The ground under the project row: a loss landscape as two contour layers.
// The far layer slides a little with the row's progress, the near layer more
// (parallax), and both breathe slowly. Marching squares on a coarse grid, redrawn
// only when the row moves or a slow drift tick comes due; the loop sleeps
// off-screen, in a hidden tab and in reduced motion (one still frame).

/** [x, y, spread, height, phase]; x/y in units of the stage height */
type Bump = readonly [number, number, number, number, number];

const NEAR: readonly Bump[] = [
  [-0.2, 0.86, 0.34, -0.6, 1.9],
  [0.28, 0.24, 0.4, 0.86, 0],
  [0.96, 0.82, 0.48, -0.78, 1.3],
  [1.58, 0.18, 0.36, 0.72, 2.1],
  [2.08, 0.74, 0.44, -0.66, 0.7],
  [2.62, 0.3, 0.4, 0.8, 2.9],
  [3.1, 0.86, 0.42, -0.6, 4.2],
];

const FAR: readonly Bump[] = [
  [0, 0.06, 0.5, -0.46, 3],
  [0.64, 0.56, 0.62, 0.58, 0.4],
  [1.5, 0.98, 0.55, -0.52, 1.1],
  [2.24, 0.16, 0.68, 0.56, 2.4],
  [2.9, 0.62, 0.6, -0.5, 5.1],
];

/** how far each layer slides over the whole row, in stage heights */
const NEAR_TRAVEL = 0.62;
const FAR_TRAVEL = 0.2;
/** a slow constant drift, stage heights per second */
const DRIFT = 0.006;
const CELL = 18;

function field(bumps: readonly Bump[], u0: number, v0: number, t: number, wave: number) {
  // warp the domain first, so the hills read as terrain rather than rings
  const u = u0 + 0.16 * Math.sin(v0 * 3.4 + u0 * 0.9 + t * 0.05) + 0.05 * Math.sin(v0 * 9.1 + u0 * 4.3);
  const v = v0 + 0.12 * Math.sin(u0 * 2.9 - t * 0.04) + 0.04 * Math.sin(u0 * 8.3 + v0 * 5.2);
  let z = 0.32 * v + 0.16 * Math.sin(u * wave + v * 1.2 + t * 0.06);
  for (const [x, y, s, a, ph] of bumps) {
    const dx = (u - x) * 0.8;
    const dy = (v - y) * 1.25;
    z += a * (1 + 0.12 * Math.sin(t * 0.18 + ph)) * Math.exp(-(dx * dx + dy * dy) / (s * s));
  }
  return z;
}

/** one iso-line through a sampled grid, appended to the current path */
function iso(ctx: CanvasRenderingContext2D, g: Float32Array, cols: number, rows: number, cell: number, L: number) {
  for (let j = 0; j < rows - 1; j++) {
    const r0 = j * cols;
    const r1 = r0 + cols;
    const y = j * cell;
    for (let i = 0; i < cols - 1; i++) {
      const a = g[r0 + i];
      const b = g[r0 + i + 1];
      const c = g[r1 + i + 1];
      const d = g[r1 + i];
      const k = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const x = i * cell;
      // crossing points on the cell's four edges
      const tx = x + (cell * (L - a)) / (b - a);
      const ry = y + (cell * (L - b)) / (c - b);
      const bx = x + (cell * (L - d)) / (c - d);
      const ly = y + (cell * (L - a)) / (d - a);
      const seg = (x0: number, y0: number, x1: number, y1: number) => {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      };
      switch (k) {
        case 1:
        case 14:
          seg(x, ly, bx, y + cell);
          break;
        case 2:
        case 13:
          seg(bx, y + cell, x + cell, ry);
          break;
        case 3:
        case 12:
          seg(x, ly, x + cell, ry);
          break;
        case 4:
        case 11:
          seg(tx, y, x + cell, ry);
          break;
        case 5:
          seg(x, ly, tx, y);
          seg(bx, y + cell, x + cell, ry);
          break;
        case 6:
        case 9:
          seg(tx, y, bx, y + cell);
          break;
        case 7:
        case 8:
          seg(x, ly, tx, y);
          break;
        case 10:
          seg(tx, y, x + cell, ry);
          seg(x, ly, bx, y + cell);
          break;
      }
    }
  }
}

type Box = { ctx: CanvasRenderingContext2D | null; w: number; h: number };

function paint(box: Box, p: number, t: number) {
  const { ctx, w, h } = box;
  if (!ctx || w < 2 || h < 2) return;
  const pal = readPalette();
  const cols = Math.ceil(w / CELL) + 1;
  const rows = Math.ceil(h / CELL) + 1;
  const g = new Float32Array(cols * rows);
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";

  const layer = (bumps: readonly Bump[], shift: number, wave: number, levels: number[], ink: (n: number) => string) => {
    for (let j = 0; j < rows; j++) {
      const v = (j * CELL) / h;
      for (let i = 0; i < cols; i++) g[j * cols + i] = field(bumps, (i * CELL) / h + shift, v, t, wave);
    }
    levels.forEach((L, n) => {
      ctx.beginPath();
      iso(ctx, g, cols, rows, CELL, L);
      ctx.strokeStyle = ink(n);
      ctx.stroke();
    });
  };

  const drift = t * DRIFT;
  const far = Array.from({ length: 12 }, (_, n) => -0.78 + n * 0.17);
  const near = Array.from({ length: 10 }, (_, n) => -0.72 + n * 0.21);
  layer(FAR, p * FAR_TRAVEL + drift * 0.5, 1.7, far, () => pal.z[3]);
  layer(NEAR, p * NEAR_TRAVEL + drift, 2.3, near, (n) => (n % 3 === 1 ? pal.z[5] : pal.z[4]));
}

export function Backdrop({ progress, still }: { progress: RefObject<number>; still: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<Box>({ ctx: null, w: 0, h: 0 });
  const clock = useRef({ t: 0, drawnAt: -1, drawnP: -1 });

  // backing store follows the CSS box (DPR capped low: it's background linework)
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      box.current = { ctx, w, h };
      const c = clock.current;
      paint(box.current, still ? 0 : progress.current, c.t);
      c.drawnAt = c.t;
      c.drawnP = progress.current;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [progress, still]);

  useLoop(canvas, true, (dt) => {
    const c = clock.current;
    c.t += dt;
    const p = progress.current;
    // redraw when the row moved, or at ~12 fps for the slow drift
    if (Math.abs(p - c.drawnP) < 0.0004 && c.t - c.drawnAt < 1 / 12) return;
    paint(box.current, p, c.t);
    c.drawnAt = c.t;
    c.drawnP = p;
  });

  return <canvas ref={canvas} className={styles.backdrop} aria-hidden="true" />;
}
