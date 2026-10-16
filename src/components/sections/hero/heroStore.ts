"use client";

import { create } from "zustand";

/** Section-relative CSS-px rectangle. */
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** What the active terrain renderer (WebGL or SVG) offers the gesture layer. */
export type RendererApi = {
  kind: "3d" | "2d";
  /** can the surface be raised / sunk live */
  deform: boolean;
  /** client px → world XZ on the surface (null when off the terrain) */
  pick: (clientX: number, clientY: number) => { x: number; z: number } | null;
  /** world XZ → section-relative px */
  project: (x: number, z: number) => { x: number; y: number } | null;
  /** ask for a redraw (the WebGL loop sleeps when idle) */
  wake: () => void;
};

export type PointerState =
  | { mode: "none" }
  | { mode: "screen"; cx: number; cy: number; touch: boolean }
  | { mode: "world"; x: number; z: number };

export type FixReadout = { x: number; z: number; loss: number; grad: number } | null;

export type OptimizerReadout =
  | { kind: "idle" }
  | { kind: "rolling"; step: number; loss: number }
  | { kind: "settled"; step: number; loss: number; target: boolean }
  | { kind: "shaping"; sign: 1 | -1; amp: number };

export type Lock = { id: number; kind: "reached" | "locked"; loss: number; x: number; z: number } | null;

type HeroState = {
  renderer: RendererApi | null;
  setRenderer: (r: RendererApi | null) => void;
  pointer: PointerState;
  setPointer: (p: PointerState) => void;
  fix: FixReadout;
  setFix: (f: FixReadout) => void;
  optimizer: OptimizerReadout;
  setOptimizer: (o: OptimizerReadout) => void;
  lock: Lock;
  lockOn: (l: Omit<NonNullable<Lock>, "id">) => void;
  /** label rectangles the contours knock out around */
  masks: Rect[];
  setMasks: (m: Rect[]) => void;
  /** the agent is thinking: contours flow */
  thinking: boolean;
  setThinking: (on: boolean) => void;
  /** increments per ripple request (cache found) */
  ripple: number;
  pulse: () => void;
  /** terrain has drawn its first frame */
  ready: boolean;
  setReady: (on: boolean) => void;
};

let lockSeq = 0;

export const useHero = create<HeroState>()((set) => ({
  renderer: null,
  setRenderer: (renderer) => set({ renderer }),
  pointer: { mode: "none" },
  setPointer: (pointer) => set({ pointer }),
  fix: null,
  setFix: (fix) => set({ fix }),
  optimizer: { kind: "idle" },
  setOptimizer: (optimizer) => set({ optimizer }),
  lock: null,
  lockOn: (l) => set({ lock: { ...l, id: ++lockSeq } }),
  masks: [],
  setMasks: (masks) => set({ masks }),
  thinking: false,
  setThinking: (thinking) => set({ thinking }),
  ripple: 0,
  pulse: () => set((s) => ({ ripple: s.ripple + 1 })),
  ready: false,
  setReady: (ready) => set({ ready }),
}));

/**
 * Narrow sheets stack text above and below the terrain; this finds the middle of the
 * largest clear band between the label rects, as a fraction of the height, so the target
 * basin can be framed where nothing covers it.
 */
export function freeBandCenter(masks: Rect[], height: number, fallback = 0.6) {
  if (!masks.length || height <= 0) return fallback;
  const spans = masks.map((r) => [Math.max(0, r.y0), Math.min(height, r.y1)] as const).sort((a, b) => a[0] - b[0]);
  let best = { gap: 0, mid: fallback * height };
  let edge = height * 0.25;
  for (const [a, b] of spans) {
    if (a > edge && a - edge > best.gap) best = { gap: a - edge, mid: (a + edge) / 2 };
    edge = Math.max(edge, b);
  }
  if (height - edge > best.gap) best = { gap: height - edge, mid: (height + edge) / 2 };
  return Math.min(0.85, Math.max(0.3, best.mid / height));
}

/**
 * Where the target basin sits in the frame, as fractions of the sheet. Wide sheets put it
 * right of the text column, squarer ones further right and lower, narrow ones in the clearest
 * band between the stacked blocks. Both renderers frame to it and the field note points at it.
 */
export function heroFocus(w: number, h: number, masks: Rect[]) {
  const aspect = w / Math.max(h, 1);
  if (aspect < 0.85) return { x: 0.6, y: freeBandCenter(masks, h), narrow: true };
  if (aspect < 1.45) return { x: 0.76, y: 0.66, narrow: false };
  return { x: 0.66, y: 0.6, narrow: false };
}

/** −0.330 with a real minus sign, fixed decimals, tabular-friendly. */
export function signed(v: number, digits = 3) {
  const s = Math.abs(v).toFixed(digits);
  return (v < 0 && +s !== 0 ? "−" : "+") + s;
}

export function lossText(v: number) {
  const s = Math.abs(v).toFixed(3);
  return v < 0 && +s !== 0 ? "−" + s : s;
}
