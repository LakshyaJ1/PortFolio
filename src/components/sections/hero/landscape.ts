"use client";

// The hero's loss landscape and its optimizer marbles. One instance per page session,
// shared by the WebGL and SVG renderers so marbles and raised ground survive a fallback
// switch or a remount. Deformations persist in sessionStorage for the visit.

import { GaussianField, findMinima, heightRange, type Bounds, type Minimum } from "@/components/terrain/field";
import { MomentumDescent, descendPath } from "@/components/terrain/optimizer";
import { useHero, type OptimizerReadout } from "./heroStore";

export const BOUNDS: Bounds = { x0: -5, x1: 5, z0: -3.2, z1: 3.2 };
/** world y per unit of loss in the 3D view */
export const HEIGHT_SCALE = 1.7;
/** contour levels per unit of loss: a line every 0.05, an index line every 0.25 */
export const DENSITY = 20;
export const INDEX_EVERY = 5;

const BUMP_KEY = "lj-hero-ground";
const MAX_MARBLES = 4;
const STEP_HZ = 120;
const TRACK_MAX = 1400;
const TARGET_RADIUS = 0.32;
const RAISE_RATE = 0.46; // loss units per second while held
const MAX_AMP = 0.7;
const BUMP_SIGMA = 0.34;

function createLandscape() {
  return new GaussianField({
    bounds: BOUNDS,
    base: 0.7,
    bowl: [0.016, 0.03],
    gaussians: [
      // लक्ष्य: the long, deep, slightly tilted basin of the global minimum
      { x: 1.45, z: 0.35, sx: 0.95, sz: 0.62, angle: 0.45, amp: -0.78 },
      // a broad valley that funnels toward it
      { x: 0.5, z: 0.9, sx: 1.9, sz: 0.85, angle: 0.25, amp: -0.2 },
      // false minima
      { x: -2.5, z: -1.0, sx: 0.62, sz: 0.48, angle: -0.3, amp: -0.42 },
      { x: -0.9, z: 1.55, sx: 0.5, sz: 0.7, angle: -0.4, amp: -0.36 },
      { x: 3.2, z: -1.55, sx: 0.48, sz: 0.42, amp: -0.33 },
      { x: -0.35, z: -1.85, sx: 0.75, sz: 0.42, angle: 0.15, amp: -0.24 },
      // relief: a diagonal ridge, a summit, shoulders
      { x: 0.1, z: -0.65, sx: 2.0, sz: 0.3, angle: 0.55, amp: 0.34 },
      { x: -1.65, z: 0.15, sx: 0.6, sz: 0.52, amp: 0.48 },
      { x: 3.5, z: 1.35, sx: 0.65, sz: 0.5, angle: 0.3, amp: 0.3 },
      { x: -3.6, z: 1.6, sx: 0.8, sz: 0.55, angle: 0.8, amp: 0.26 },
      { x: 1.6, z: -2.2, sx: 1.1, sz: 0.45, angle: -0.2, amp: 0.24 },
    ],
    waves: [
      { kx: 1.3, kz: 0.7, phase: 0.4, amp: 0.035 },
      { kx: -0.6, kz: 1.7, phase: 1.9, amp: 0.028 },
      { kx: 2.3, kz: -1.1, phase: 4.1, amp: 0.016 },
      { kx: 0.4, kz: 0.35, phase: 2.6, amp: 0.05 },
    ],
    maxBumps: 40,
  });
}

export type HeroMarble = {
  id: number;
  opt: MomentumDescent;
  state: "dropping" | "rolling" | "settled";
  /** 0→1 while falling onto the surface */
  drop: number;
  /** x, z pairs */
  track: number[];
  trackVersion: number;
  reported: boolean;
};

export type SimEvent =
  | { type: "settled"; marble: HeroMarble; loss: number; target: boolean; steps: number }
  | { type: "ground" };

type Press = { index: number; sign: 1 | -1; x: number; z: number };

export class HeroSim {
  readonly field = createLandscape();
  readonly target: Minimum;
  /** the designed local minima (excluding the target), for spot heights */
  readonly minima: Minimum[];
  /** loss range over the sheet, for the entrance reveal */
  readonly maxLoss: number;
  marbles: HeroMarble[] = [];
  private press: Press | null = null;
  private acc = 0;
  private seq = 0;
  private lastPublish = 0;
  private lastReadout = "";
  private listeners = new Set<(e: SimEvent) => void>();

  constructor() {
    this.target = this.field.normalize();
    this.minima = findMinima(this.field).slice(1);
    this.maxLoss = heightRange(this.field, BOUNDS)[1];
    this.restoreGround();
  }

  on(fn: (e: SimEvent) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(e: SimEvent) {
    this.listeners.forEach((fn) => fn(e));
  }

  get busy() {
    return this.press !== null || this.marbles.some((m) => m.state !== "settled");
  }

  get shaping() {
    return this.press;
  }

  /** Drop a marble. `instant` runs the whole descent now (reduced motion). */
  drop(x: number, z: number, instant = false) {
    const opt = new MomentumDescent(x, z, { bounds: BOUNDS });
    const m: HeroMarble = { id: ++this.seq, opt, state: "dropping", drop: 0, track: [x, z], trackVersion: 0, reported: false };
    if (instant) {
      const run = descendPath(this.field, x, z, { bounds: BOUNDS, every: 3 });
      opt.x = run.x;
      opt.z = run.z;
      opt.steps = run.steps;
      opt.settled = true;
      this.field.sample(run.x, run.z, opt.s);
      m.track = run.points;
      m.state = "settled";
      m.drop = 1;
    }
    this.marbles.push(m);
    if (this.marbles.length > MAX_MARBLES) this.marbles.shift();
    if (instant) this.settle(m);
    this.publish(true);
    return m;
  }

  /** Start raising (sign 1) or sinking (sign −1) the ground at (x, z). */
  pressStart(x: number, z: number, sign: 1 | -1) {
    const index = this.field.addBump({ x, z, sigma: BUMP_SIGMA, amp: 0 });
    this.press = { index, sign, x, z };
    this.publish(true);
  }

  /** Dragging while held paints a ridge (or a trench) of bumps. */
  pressMove(x: number, z: number) {
    const p = this.press;
    if (!p) return;
    if (Math.hypot(x - p.x, z - p.z) < 0.3) return;
    const index = this.field.addBump({ x, z, sigma: BUMP_SIGMA, amp: 0 });
    this.press = { index, sign: p.sign, x, z };
  }

  pressEnd() {
    if (!this.press) return;
    this.press = null;
    // drop bumps that never grew (a hold released instantly)
    const kept = this.field.bumps.filter((b) => Math.abs(b.amp) > 0.01);
    if (kept.length !== this.field.bumps.length) this.field.setBumps(kept);
    this.saveGround();
    this.emit({ type: "ground" });
    this.publish(true);
  }

  resetGround() {
    this.field.setBumps([]);
    this.saveGround();
    this.wakeAll();
    this.emit({ type: "ground" });
  }

  private wakeAll() {
    for (const m of this.marbles) {
      if (m.state === "settled") {
        m.opt.wake();
        m.state = "rolling";
        m.reported = false;
      }
    }
  }

  /** Advance everything by dt seconds. Returns whether anything is still moving. */
  update(dt: number) {
    const p = this.press;
    if (p) {
      const b = this.field.bumps[p.index];
      if (b) {
        const amp = Math.max(-MAX_AMP, Math.min(MAX_AMP, b.amp + p.sign * RAISE_RATE * dt));
        if (amp !== b.amp) {
          this.field.setBump(p.index, { amp });
          this.wakeAll();
        }
      }
    }

    for (const m of this.marbles) {
      if (m.state === "dropping") {
        m.drop = Math.min(1, m.drop + dt / 0.42);
        if (m.drop >= 1) m.state = "rolling";
      }
    }

    this.acc = Math.min(this.acc + dt, 0.1);
    const h = 1 / STEP_HZ;
    while (this.acc >= h) {
      this.acc -= h;
      for (const m of this.marbles) {
        if (m.state !== "rolling") continue;
        m.opt.step(this.field);
        if (m.opt.steps % 3 === 0) {
          const n = m.track.length;
          if (Math.hypot(m.opt.x - m.track[n - 2], m.opt.z - m.track[n - 1]) > 0.004) {
            m.track.push(m.opt.x, m.opt.z);
            if (m.track.length > TRACK_MAX * 2) m.track = m.track.filter((_, i) => i % 4 < 2);
            m.trackVersion++;
          }
        }
        if (m.opt.settled) {
          m.state = "settled";
          m.track.push(m.opt.x, m.opt.z);
          m.trackVersion++;
          this.settle(m);
        }
      }
    }
    this.publish(false);
    return this.busy;
  }

  private settle(m: HeroMarble) {
    if (m.reported) return;
    m.reported = true;
    const target = Math.hypot(m.opt.x - this.target.x, m.opt.z - this.target.z) < TARGET_RADIUS;
    this.emit({ type: "settled", marble: m, loss: m.opt.loss, target, steps: m.opt.steps });
  }

  readout(): OptimizerReadout {
    if (this.press) {
      const b = this.field.bumps[this.press.index];
      return { kind: "shaping", sign: this.press.sign, amp: b ? b.amp : 0 };
    }
    const m = this.marbles[this.marbles.length - 1];
    if (!m) return { kind: "idle" };
    if (m.state !== "settled") return { kind: "rolling", step: m.opt.steps, loss: m.opt.steps ? m.opt.loss : this.field.height(m.opt.x, m.opt.z) };
    return {
      kind: "settled",
      step: m.opt.steps,
      loss: m.opt.loss,
      target: Math.hypot(m.opt.x - this.target.x, m.opt.z - this.target.z) < TARGET_RADIUS,
    };
  }

  /** Throttled push of the optimizer readout into the hero store (~12 Hz). */
  publish(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastPublish < 80) return;
    this.lastPublish = now;
    const r = this.readout();
    const key = JSON.stringify(r);
    if (key === this.lastReadout) return;
    this.lastReadout = key;
    useHero.getState().setOptimizer(r);
  }

  private saveGround() {
    try {
      window.sessionStorage.setItem(BUMP_KEY, JSON.stringify(this.field.bumps.map((b) => [b.x, b.z, b.sigma, b.amp].map((v) => +v.toFixed(4)))));
    } catch {
      /* private mode: deformations last until reload */
    }
  }

  private restoreGround() {
    try {
      const raw = window.sessionStorage.getItem(BUMP_KEY);
      if (!raw) return;
      const list = JSON.parse(raw) as number[][];
      if (!Array.isArray(list)) return;
      this.field.setBumps(
        list
          .filter((b) => Array.isArray(b) && b.length === 4 && b.every((v) => Number.isFinite(v)))
          .map(([x, z, sigma, amp]) => ({ x, z, sigma: Math.max(0.05, sigma), amp: Math.max(-MAX_AMP * 4, Math.min(MAX_AMP * 4, amp)) })),
      );
    } catch {
      /* ignore */
    }
  }
}

let sim: HeroSim | null = null;
export function getHeroSim() {
  if (!sim) sim = new HeroSim();
  return sim;
}
