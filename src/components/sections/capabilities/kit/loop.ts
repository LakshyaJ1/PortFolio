"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useInView, useLatest, usePageVisible, useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";

/**
 * True when an instrument should hold a single designed frame instead of animating:
 * reduced motion or the recruiter "plain sheet".
 */
export function useStill() {
  const reduced = useReducedMotion();
  const plain = useApp((s) => s.plain);
  return reduced || plain;
}

/**
 * One rAF loop per instrument. It only runs while the instrument is enabled
 * (e.g. the active word in the pinned band), on screen, in a visible tab and
 * not in reduced-motion / plain mode. `tick` receives dt in seconds (clamped).
 */
export function useLoop(target: RefObject<Element | null>, enabled: boolean, tick: (dt: number) => void) {
  const inView = useInView(target, { rootMargin: "60px" });
  const visible = usePageVisible();
  const still = useStill();
  const running = enabled && inView && visible && !still;
  const tickRef = useLatest(tick);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      tickRef.current(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, tickRef]);

  return { running, still, inView };
}

export type CanvasBox = { ctx: CanvasRenderingContext2D | null; w: number; h: number; dpr: number };

/**
 * Keeps a canvas backing store matched to its CSS box (DPR capped at 1.75) and
 * calls `onResize` after every resize so still frames redraw crisply.
 */
export function useCanvas(ref: RefObject<HTMLCanvasElement | null>, onResize?: (box: CanvasBox) => void) {
  const box = useRef<CanvasBox>({ ctx: null, w: 0, h: 0, dpr: 1 });
  const cb = useLatest(onResize);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      box.current = { ctx, w, h, dpr };
      cb.current?.(box.current);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [ref, cb]);

  return box;
}

/** Deterministic PRNG so simulated data is the same on every visit. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r: () => number) {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** expo-out, the sheet's one easing curve */
export const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
/** 0→1 progress of t through [a, b] */
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
