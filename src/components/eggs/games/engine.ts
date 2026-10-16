"use client";

// Shared machinery for the canvas games: sizing, the frame loop, palette, sound, best scores.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLatest } from "@/lib/hooks";
import { useApp } from "@/lib/store";

export type GameStatus = "briefing" | "playing" | "paused" | "over";

export const MAX_DPR = 1.75;

/** Read the sheet's tokens once so canvases draw in the same palette as the DOM. */
export function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    z0: v("--z0", "#060907"),
    z1: v("--z1", "#0b100d"),
    z2: v("--z2", "#111814"),
    z3: v("--z3", "#18211c"),
    z4: v("--z4", "#212c26"),
    z5: v("--z5", "#2f3c35"),
    z6: v("--z6", "#46554c"),
    z7: v("--z7", "#6f7f75"),
    z8: v("--z8", "#9eaba2"),
    z9: v("--z9", "#cfd8d1"),
    z10: v("--z10", "#eef2ec"),
    fix: v("--fix", "#ff5b23"),
    fixHi: v("--fix-hi", "#ff7a45"),
    hydro: v("--hydro", "#7cc4f2"),
    alert: v("--alert", "#ff5470"),
    ok: v("--ok", "#9fe07a"),
    mono: v("--font-mono", "ui-monospace, monospace"),
    display: v("--font-display", "system-ui, sans-serif"),
  };
}
export type Palette = ReturnType<typeof readPalette>;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "#rrggbb" + alpha → rgba(), for canvas strokes only. */
export function alpha(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export type StageSize = { w: number; h: number; dpr: number };

/** A canvas that fills its wrapper, DPR-capped, resized with the wrapper. */
export function useStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<StageSize>({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const measure = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      setSize((s) => (s.w === w && s.h === h && s.dpr === dpr ? s : { w, h, dpr }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return { wrapRef, canvasRef, size };
}

/** requestAnimationFrame loop that only runs while `active`. dt is clamped (seconds). */
export function useFrame(active: boolean, cb: (dt: number, now: number) => void) {
  const cbRef = useLatest(cb);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      cbRef.current(dt, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, cbRef]);
}

// ─── sound: tiny square-wave blips, only when the visitor opted in ───

let audio: AudioContext | null = null;

export function blip(freq = 660, dur = 0.07, type: OscillatorType = "square", vol = 0.035, delay = 0) {
  if (!useApp.getState().sound) return;
  try {
    if (!audio) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audio = new Ctor();
    }
    if (audio.state === "suspended") void audio.resume();
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    /* audio is a nicety */
  }
}

// ─── best scores (localStorage can be unavailable) ───

const key = (id: string) => `lj-egg-best:${id}`;

function readRaw(id: string): string | null {
  try {
    return window.localStorage.getItem(key(id));
  } catch {
    return null;
  }
}

export function readBest(id: string): number | null {
  const v = readRaw(id);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const bestListeners = new Set<() => void>();
function subscribeBest(cb: () => void) {
  bestListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    bestListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Stores `value` if it beats the current best. Returns true on a new record. */
export function submitBest(id: string, value: number, better: "higher" | "lower") {
  const prev = readBest(id);
  const wins = prev === null || (better === "higher" ? value > prev : value < prev);
  if (!wins) return false;
  try {
    window.localStorage.setItem(key(id), String(value));
  } catch {
    /* ignore */
  }
  return true;
}

/** Best score for a game; SSR-safe (null on the server and the first paint). */
export function useBest(id: string) {
  const raw = useSyncExternalStore(
    subscribeBest,
    () => readRaw(id),
    () => null,
  );
  const n = raw === null ? null : Number(raw);
  const best = n !== null && Number.isFinite(n) ? n : null;
  const submit = (value: number, better: "higher" | "lower") => {
    const record = submitBest(id, value, better);
    if (record) bestListeners.forEach((l) => l());
    return record;
  };
  return [best, submit] as const;
}

// ─── deterministic randomness ───

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rnd: () => number) {
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marching squares over a scalar field sampled on a grid. Returns line segments per level. */
export function contourSegments(
  field: Float32Array,
  nx: number,
  ny: number,
  cell: number,
  levels: number[],
): Float32Array[] {
  const out: Float32Array[] = [];
  for (const lv of levels) {
    const seg: number[] = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = field[j * nx + i];
        const b = field[j * nx + i + 1];
        const c = field[(j + 1) * nx + i + 1];
        const d = field[(j + 1) * nx + i];
        const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = i * cell;
        const y = j * cell;
        const lerp = (p: number, q: number) => (lv - p) / (q - p || 1e-9);
        const top = [x + lerp(a, b) * cell, y];
        const right = [x + cell, y + lerp(b, c) * cell];
        const bottom = [x + lerp(d, c) * cell, y + cell];
        const left = [x, y + lerp(a, d) * cell];
        const push = (p: number[], q: number[]) => seg.push(p[0], p[1], q[0], q[1]);
        switch (idx) {
          case 1:
          case 14:
            push(left, bottom);
            break;
          case 2:
          case 13:
            push(bottom, right);
            break;
          case 3:
          case 12:
            push(left, right);
            break;
          case 4:
          case 11:
            push(top, right);
            break;
          case 5:
            push(left, top);
            push(bottom, right);
            break;
          case 6:
          case 9:
            push(top, bottom);
            break;
          case 7:
          case 8:
            push(left, top);
            break;
          case 10:
            push(left, bottom);
            push(top, right);
            break;
        }
      }
    }
    out.push(new Float32Array(seg));
  }
  return out;
}
