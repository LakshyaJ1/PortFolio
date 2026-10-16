// Terrain toolkit · gradient descent with momentum (the "optimizer marble").
//
//   const m = new MomentumDescent(x, z);           // heavy-ball SGD, fixed step
//   m.step(field);                                 // one iteration; m.settled when it stops
//   m.wake();                                      // re-route after the surface changed
//   descendPath(field, x, z) → { points, x, z, h, steps }   // the whole run at once
//
// v ← β·v − η·∇h ;  p ← p + v.  Honest numbers: `steps` is the iteration count and the
// loss is the field height at p. Positions stay inside `bounds` (they bounce off the edge).

import type { Bounds, HeightField } from "./field";

export type DescentOptions = {
  /** learning rate η */
  lr: number;
  /** momentum β */
  beta: number;
  /** stop after this many iterations even if still moving */
  maxSteps: number;
  /** "stopped" when |v| and |∇h| both fall under these for `settleSteps` iterations */
  tolV: number;
  tolG: number;
  settleSteps: number;
  bounds?: Bounds;
};

export const DEFAULT_DESCENT: DescentOptions = {
  lr: 0.0024,
  beta: 0.9,
  maxSteps: 2600,
  tolV: 2e-5,
  tolG: 0.02,
  settleSteps: 40,
};

export class MomentumDescent {
  x: number;
  z: number;
  vx = 0;
  vz = 0;
  steps = 0;
  settled = false;
  /** last sample: [h, ∂h/∂x, ∂h/∂z] */
  readonly s = [0, 0, 0];
  readonly opts: DescentOptions;
  private quiet = 0;

  constructor(x: number, z: number, opts: Partial<DescentOptions> = {}) {
    this.x = x;
    this.z = z;
    this.opts = { ...DEFAULT_DESCENT, ...opts };
  }

  get loss() {
    return this.s[0];
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  step(field: HeightField) {
    if (this.settled) return this.s;
    const { lr, beta, tolV, tolG, settleSteps, maxSteps, bounds } = this.opts;
    field.sample(this.x, this.z, this.s);
    this.vx = beta * this.vx - lr * this.s[1];
    this.vz = beta * this.vz - lr * this.s[2];
    this.x += this.vx;
    this.z += this.vz;
    if (bounds) {
      if (this.x < bounds.x0 || this.x > bounds.x1) {
        this.x = Math.min(Math.max(this.x, bounds.x0), bounds.x1);
        this.vx *= -0.4;
      }
      if (this.z < bounds.z0 || this.z > bounds.z1) {
        this.z = Math.min(Math.max(this.z, bounds.z0), bounds.z1);
        this.vz *= -0.4;
      }
    }
    this.steps++;
    const quiet = this.speed < tolV && Math.hypot(this.s[1], this.s[2]) < tolG;
    this.quiet = quiet ? this.quiet + 1 : 0;
    if (this.quiet >= settleSteps || this.steps >= maxSteps) {
      this.settled = true;
      field.sample(this.x, this.z, this.s);
    }
    return this.s;
  }

  /** The surface changed: start moving again from where we are. */
  wake() {
    this.settled = false;
    this.quiet = 0;
    this.steps = Math.min(this.steps, this.opts.maxSteps - 600);
  }
}

/** Run a descent to the end. `every` records one point per that many iterations. */
export function descendPath(field: HeightField, x: number, z: number, opts: Partial<DescentOptions> & { every?: number } = {}) {
  const m = new MomentumDescent(x, z, opts);
  const every = opts.every ?? 3;
  const points = [x, z];
  while (!m.settled) {
    m.step(field);
    if (m.steps % every === 0) points.push(m.x, m.z);
  }
  points.push(m.x, m.z);
  return { points, x: m.x, z: m.z, h: m.loss, steps: m.steps };
}
