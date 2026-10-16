"use client";

// Bindu's flight: a damped spring on GSAP's ticker. The goal is a function read every frame,
// so she can chase a target that scrolls or a layout that changes mid-flight. Long hops lift
// into a shallow arc and she banks into the turn. Her bubble and the target ring ride along
// on the same frame, so nothing drifts apart. The ticker only runs while something moves.

import { gsap } from "gsap";
import type { Box } from "./ground";
import type { Pt } from "./flight";

export type Goal = () => Pt | null;

type FlyOpts = {
  /** spring stiffness: higher is snappier (flight ~70, drift ~18) */
  stiffness?: number;
  /** keep following the goal after arriving (pointing at something that may scroll) */
  follow?: boolean;
  onArrive?: () => void;
  /** the goal returned null (the target is gone): she stops where she is */
  onLost?: () => void;
};

export type Mover = {
  fly: (goal: Goal, opts?: FlyOpts) => void;
  /** place her instantly (reduced motion, first appearance) */
  jump: (p: Pt) => void;
  get: () => Pt;
  /** the bubble's offset from her top-left, or null when it is docked or hidden */
  carryBubble: (rel: Pt | null) => void;
  /** the ring around the target, read every frame; null hides it */
  ring: (rect: (() => Box | null) | null) => void;
  stop: () => void;
  destroy: () => void;
};

export function createMover(els: { pos: HTMLElement; tilt: HTMLElement; bubble: HTMLElement; ring: HTMLElement }): Mover {
  let x = -999;
  let y = -999;
  let vx = 0;
  let vy = 0;
  let goal: Goal | null = null;
  let opts: FlyOpts = {};
  let arrived = true;
  let startDist = 0;
  let bubbleRel: Pt | null = null;
  let ringFn: (() => Box | null) | null = null;
  let running = false;

  const render = (lift = 0) => {
    els.pos.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - lift).toFixed(1)}px, 0)`;
    // bank into the turn, a few degrees at most
    const bank = Math.max(-14, Math.min(14, vx * 0.018));
    els.tilt.style.rotate = `${bank.toFixed(2)}deg`;
    if (bubbleRel) els.bubble.style.transform = `translate3d(${(x + bubbleRel.x).toFixed(1)}px, ${(y - lift + bubbleRel.y).toFixed(1)}px, 0)`;
    const r = ringFn?.();
    if (r) {
      els.ring.style.transform = `translate3d(${r.left.toFixed(1)}px, ${r.top.toFixed(1)}px, 0)`;
      els.ring.style.width = `${(r.right - r.left).toFixed(1)}px`;
      els.ring.style.height = `${(r.bottom - r.top).toFixed(1)}px`;
      els.ring.dataset.on = "true";
    } else {
      els.ring.dataset.on = "false";
    }
  };

  const tick = (_time: number, deltaMs: number) => {
    const dt = Math.min(deltaMs, 50) / 1000;
    let lift = 0;
    if (goal) {
      const g = goal();
      if (!g) {
        goal = null;
        vx = vy = 0;
        opts.onLost?.();
      } else {
        const k = opts.stiffness ?? 70;
        const c = 2 * Math.sqrt(k) * 0.86; // a touch under critical: a soft overshoot, no wobble
        vx += (k * (g.x - x) - c * vx) * dt;
        vy += (k * (g.y - y) - c * vy) * dt;
        x += vx * dt;
        y += vy * dt;
        const d = Math.hypot(g.x - x, g.y - y);
        if (!arrived) {
          // a shallow arc on long hops: rise mid-flight, land level
          const p = startDist > 0 ? 1 - Math.min(1, d / startDist) : 1;
          lift = Math.min(64, startDist * 0.16) * Math.sin(Math.PI * p);
          if (d < 2 && Math.hypot(vx, vy) < 24) {
            arrived = true;
            opts.onArrive?.();
          }
        }
        if (arrived && !opts.follow && Math.hypot(vx, vy) < 4 && d < 0.5) {
          x = g.x;
          y = g.y;
          goal = null;
        }
      }
    }
    render(lift);
    if (!goal && !ringFn) sleep();
  };

  const wake = () => {
    if (running) return;
    running = true;
    gsap.ticker.add(tick);
  };
  const sleep = () => {
    if (!running) return;
    running = false;
    gsap.ticker.remove(tick);
  };

  return {
    fly(next, o = {}) {
      const g = next();
      if (!g) return o.onLost?.();
      if (x < -900) {
        // first flight: start where she'll land, nothing to animate from
        x = g.x;
        y = g.y;
      }
      goal = next;
      opts = o;
      arrived = false;
      startDist = Math.hypot(g.x - x, g.y - y);
      wake();
    },
    jump(p) {
      goal = null;
      x = p.x;
      y = p.y;
      vx = vy = 0;
      arrived = true;
      render();
      if (ringFn) wake();
    },
    get: () => ({ x, y }),
    carryBubble(rel) {
      bubbleRel = rel;
      if (!rel) els.bubble.style.transform = "";
      render();
    },
    ring(fn) {
      ringFn = fn;
      if (fn) wake();
      else render();
    },
    stop() {
      goal = null;
      vx = vy = 0;
      render();
    },
    destroy() {
      sleep();
      goal = null;
      ringFn = null;
    },
  };
}
