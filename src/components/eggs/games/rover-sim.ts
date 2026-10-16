// GPS-denied rover: terrain, hazards, dead-reckoning and the fix model. Pure, no DOM.
//
// The truth (where the rover really is) is never drawn while you play. You steer by the
// estimate: compass heading with a drifting gyro bias plus wheel odometry that ignores slip.
// A GNSS fix snaps the estimate back to truth, takes time, fails in denied zones, and costs score.

import { contourSegments, gauss, mulberry32 } from "./engine";

export type Vec = { x: number; y: number };
export type Boulder = { x: number; y: number; r: number };
export type Zone = { x: number; y: number; rx: number; ry: number; rot: number };
type Hill = { x: number; y: number; a: number; s: number };

export type World = {
  seed: number;
  w: number;
  h: number;
  start: Vec;
  heading0: number;
  target: Vec;
  boulders: Boulder[];
  zones: Zone[];
  hills: Hill[];
  tilt: Vec;
  contours: { index: boolean; seg: Float32Array }[];
};

export const UNIT_M = 0.05; // metres per world unit
export const TARGET_R = 34;
export const LIDAR_R = 140;
export const ROVER_R = 8;
export const FIX_COST_S = 10;
export const FIX_COOLDOWN = 3.5;
export const FIX_ACQUIRE = 0.9;
export const BEACON_R = 240;
const SLOPE_K = 60;
const V_MAX = 82;

export function makeWorld(aspect: number, seed: number): World {
  const rnd = mulberry32(seed);
  const a = Math.max(0.55, Math.min(2.2, aspect));
  const AREA = 1_450_000;
  const w = Math.round(Math.sqrt(AREA * a));
  const h = Math.round(Math.sqrt(AREA / a));
  const m = Math.min(w, h);

  const start = { x: w * (0.08 + rnd() * 0.04), y: h * (0.88 - rnd() * 0.04) };
  const target = { x: w * (0.9 - rnd() * 0.04), y: h * (0.13 + rnd() * 0.05) };
  const heading0 = Math.atan2(target.y - start.y, target.x - start.x) + (rnd() - 0.5) * 0.5;

  const hills: Hill[] = Array.from({ length: 12 }, () => ({
    x: rnd() * w,
    y: rnd() * h,
    a: rnd() * 2 - 0.7,
    s: (0.07 + rnd() * 0.16) * m,
  }));
  const tilt = { x: (rnd() - 0.5) * 0.6, y: (rnd() - 0.5) * 0.6 };

  // GNSS-denied zones lie across the direct line, so a straight run has to dead-reckon through them.
  const dir = { x: target.x - start.x, y: target.y - start.y };
  const len = Math.hypot(dir.x, dir.y);
  const nrm = { x: -dir.y / len, y: dir.x / len };
  const zones: Zone[] = [0.34 + rnd() * 0.08, 0.64 + rnd() * 0.1].map((t) => {
    const off = (rnd() - 0.5) * 0.14 * m;
    return {
      x: start.x + dir.x * t + nrm.x * off,
      y: start.y + dir.y * t + nrm.y * off,
      rx: (0.17 + rnd() * 0.06) * m,
      ry: (0.075 + rnd() * 0.035) * m,
      rot: Math.atan2(nrm.y, nrm.x) + (rnd() - 0.5) * 0.5,
    };
  });

  const boulders: Boulder[] = [];
  let tries = 0;
  while (boulders.length < 34 && tries++ < 4000) {
    let x: number;
    let y: number;
    if (rnd() < 0.62) {
      const t = 0.12 + rnd() * 0.8;
      const off = gauss(rnd) * 0.14 * m;
      x = start.x + dir.x * t + nrm.x * off;
      y = start.y + dir.y * t + nrm.y * off;
    } else {
      x = rnd() * w;
      y = rnd() * h;
    }
    const r = 9 + rnd() * 13;
    if (x < r + 12 || y < r + 12 || x > w - r - 12 || y > h - r - 12) continue;
    if (Math.hypot(x - start.x, y - start.y) < 110 || Math.hypot(x - target.x, y - target.y) < 90) continue;
    // leave gaps wider than the rover so every field is passable
    if (boulders.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + r + ROVER_R * 2 + 10)) continue;
    boulders.push({ x, y, r });
  }

  const world: World = { seed, w, h, start, heading0, target, boulders, zones, hills, tilt, contours: [] };

  const cell = 10;
  const nx = Math.ceil(w / cell) + 1;
  const ny = Math.ceil(h / cell) + 1;
  const field = new Float32Array(nx * ny);
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const z = height(world, i * cell, j * cell);
      field[j * nx + i] = z;
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
  const n = 18;
  const levels = Array.from({ length: n }, (_, i) => lo + ((i + 0.5) / n) * (hi - lo));
  world.contours = contourSegments(field, nx, ny, cell, levels).map((seg, i) => ({ index: i % 5 === 2, seg }));
  return world;
}

export function height(world: World, x: number, y: number) {
  let z = world.tilt.x * (x / world.w) + world.tilt.y * (y / world.h);
  for (const hl of world.hills) {
    const dx = x - hl.x;
    const dy = y - hl.y;
    z += hl.a * Math.exp(-(dx * dx + dy * dy) / (2 * hl.s * hl.s));
  }
  return z;
}

/** Grade along a heading: positive is uphill. */
export function slopeAlong(world: World, x: number, y: number, th: number) {
  const e = 4;
  const gx = (height(world, x + e, y) - height(world, x - e, y)) / (2 * e);
  const gy = (height(world, x, y + e) - height(world, x, y - e)) / (2 * e);
  return Math.max(-0.7, Math.min(0.7, (gx * Math.cos(th) + gy * Math.sin(th)) * SLOPE_K));
}

export function inZone(world: World, p: Vec) {
  return world.zones.some((z) => {
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    const c = Math.cos(-z.rot);
    const s = Math.sin(-z.rot);
    const u = dx * c - dy * s;
    const v = dx * s + dy * c;
    return (u / z.rx) ** 2 + (v / z.ry) ** 2 <= 1;
  });
}

export type Fix = { x: number; y: number; t: number; /** estPath length when taken */ idx: number };

export type Rover = {
  t: number;
  // truth
  x: number;
  y: number;
  th: number;
  v: number;
  // estimate (heading estimate = th + bias)
  ex: number;
  ey: number;
  bias: number;
  biasRate: number;
  scaleErr: number;
  odo: number;
  sinceFix: number;
  battery: number;
  fixes: Fix[];
  fixCount: number;
  cooldown: number;
  acquiring: number;
  bumps: number;
  bumpT: number;
  nofixT: number;
  fixT: number;
  lowWarned: boolean;
  truePath: number[];
  estPath: number[];
  pathAcc: number;
  returns: { x: number; y: number; t: number }[];
  sweep: number;
  done: null | "won" | "flat";
};

export type Input = { up: boolean; down: boolean; left: boolean; right: boolean };
export type SimEvent = "fix" | "nofix" | "acquire" | "bump" | "won" | "flat" | "low";

export function newRover(world: World, rnd: () => number): Rover {
  const { x, y } = world.start;
  return {
    t: 0,
    x,
    y,
    th: world.heading0,
    v: 0,
    ex: x,
    ey: y,
    bias: 0,
    biasRate: (rnd() < 0.5 ? -1 : 1) * (0.005 + rnd() * 0.008),
    scaleErr: (rnd() < 0.5 ? -1 : 1) * (0.012 + rnd() * 0.02),
    odo: 0,
    sinceFix: 0,
    battery: 100,
    fixes: [{ x, y, t: 0, idx: 0 }],
    fixCount: 0,
    cooldown: 0,
    acquiring: 0,
    bumps: 0,
    bumpT: 9,
    nofixT: 9,
    fixT: 9,
    lowWarned: false,
    truePath: [x, y],
    estPath: [x, y],
    pathAcc: 0,
    returns: [],
    sweep: 0,
    done: null,
  };
}

export function requestFix(r: Rover): SimEvent | null {
  if (r.done || r.cooldown > 0 || r.acquiring > 0) return null;
  r.acquiring = FIX_ACQUIRE;
  r.cooldown = FIX_COOLDOWN;
  return "acquire";
}

/** 1-sigma position uncertainty of the estimate, in world units. */
export function sigma(r: Rover) {
  return 1.2 + 0.03 * r.sinceFix + Math.abs(r.bias) * r.sinceFix * 0.6;
}

/** Short-range beacon on the flag: 0 at the edge of range, 1 on top of it. */
export function beacon(r: Rover, world: World) {
  const d = Math.hypot(r.x - world.target.x, r.y - world.target.y);
  return d < BEACON_R ? 1 - d / BEACON_R : null;
}

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

function inSweep(a: number, from: number, to: number) {
  if (to - from >= TAU) return true;
  const A = norm(a);
  const f = norm(from);
  const t = norm(to);
  return f <= t ? A >= f && A <= t : A >= f || A <= t;
}

/** LiDAR returns (near faces of boulders in range), plotted around the estimate as the rover perceives them. */
export function scan(r: Rover, world: World, from?: number, to?: number) {
  const pts: { x: number; y: number }[] = [];
  const c = Math.cos(r.bias);
  const s = Math.sin(r.bias);
  for (const b of world.boulders) {
    const d = Math.hypot(b.x - r.x, b.y - r.y);
    if (d - b.r > LIDAR_R) continue;
    const face = Math.atan2(r.y - b.y, r.x - b.x);
    for (let k = -4; k <= 4; k++) {
      const ang = face + k * 0.24;
      const px = b.x + Math.cos(ang) * b.r - r.x;
      const py = b.y + Math.sin(ang) * b.r - r.y;
      if (Math.hypot(px, py) > LIDAR_R) continue;
      if (from !== undefined && to !== undefined && !inSweep(Math.atan2(py, px), from, to)) continue;
      pts.push({ x: r.ex + px * c - py * s, y: r.ey + px * s + py * c });
    }
  }
  return pts;
}

export function stepRover(r: Rover, world: World, input: Input, dt: number, rnd: () => number, sweeping: boolean) {
  const ev: SimEvent[] = [];
  if (r.done) return ev;
  r.t += dt;

  // drive
  if (input.up) r.v += 75 * dt;
  if (input.down) r.v -= (r.v > 2 ? 150 : 45) * dt;
  if (!input.up && !input.down) {
    const d = 55 * dt;
    r.v = Math.abs(r.v) <= d ? 0 : r.v - Math.sign(r.v) * d;
  }
  const s = slopeAlong(world, r.x, r.y, r.th);
  r.v -= s * 90 * dt;
  r.v = Math.max(-28, Math.min(V_MAX, r.v));

  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const rate = 1.3 + Math.min(1, Math.abs(r.v) / 40);
  r.th += steer * rate * dt;

  // gyro drift: a slow bias plus scale-factor error whenever you turn
  r.bias += (r.biasRate + gauss(rnd) * 0.008) * dt + steer * rate * dt * r.scaleErr;

  // wheels slip on grades: the ground covered is less than the odometer thinks
  const slip = Math.min(0.25, Math.abs(s) * 0.3 + (Math.abs(r.v) / V_MAX) * 0.04);
  const dist = r.v * dt;
  const nx = r.x + Math.cos(r.th) * dist * (1 - slip);
  const ny = r.y + Math.sin(r.th) * dist * (1 - slip);
  const hit = world.boulders.find((b) => Math.hypot(nx - b.x, ny - b.y) < b.r + ROVER_R);
  if (hit) {
    r.v = -r.v * 0.3;
    if (r.bumpT > 0.5) {
      r.battery -= 2.5;
      r.bumps += 1;
      ev.push("bump");
    }
    r.bumpT = 0;
  } else if (nx < ROVER_R || ny < ROVER_R || nx > world.w - ROVER_R || ny > world.h - ROVER_R) {
    r.v = 0;
    r.x = Math.max(ROVER_R, Math.min(world.w - ROVER_R, nx));
    r.y = Math.max(ROVER_R, Math.min(world.h - ROVER_R, ny));
  } else {
    r.x = nx;
    r.y = ny;
  }

  // dead reckoning: odometer distance along the gyro heading (it counts wheel spin against rocks too)
  const eth = r.th + r.bias;
  r.ex += Math.cos(eth) * dist;
  r.ey += Math.sin(eth) * dist;
  r.odo += Math.abs(dist);
  r.sinceFix += Math.abs(dist);

  r.battery -= (0.22 + (0.85 * Math.abs(r.v)) / V_MAX + (Math.max(0, s) * Math.abs(r.v) * 1.5) / V_MAX) * dt;

  if (r.cooldown > 0) r.cooldown = Math.max(0, r.cooldown - dt);
  if (r.acquiring > 0) {
    r.acquiring -= dt;
    if (r.acquiring <= 0) {
      r.acquiring = 0;
      if (inZone(world, r)) {
        r.nofixT = 0;
        ev.push("nofix");
      } else {
        r.ex = r.x + gauss(rnd) * 1.2;
        r.ey = r.y + gauss(rnd) * 1.2;
        r.bias *= 0.2;
        r.sinceFix = 0;
        r.fixCount += 1;
        r.fixes.push({ x: r.ex, y: r.ey, t: r.t, idx: r.estPath.length });
        r.fixT = 0;
        ev.push("fix");
      }
    }
  }
  r.bumpT += dt;
  r.nofixT += dt;
  r.fixT += dt;

  r.pathAcc += dt;
  if (r.pathAcc > 0.12) {
    r.pathAcc = 0;
    r.truePath.push(r.x, r.y);
    r.estPath.push(r.ex, r.ey);
  }

  const prev = r.sweep;
  r.sweep += dt * TAU * 0.85;
  if (sweeping) {
    for (const p of scan(r, world, prev, r.sweep)) r.returns.push({ ...p, t: r.t });
  }
  r.returns = r.returns.filter((p) => r.t - p.t < 1.6);

  if (Math.hypot(r.x - world.target.x, r.y - world.target.y) < TARGET_R) {
    r.done = "won";
    r.truePath.push(r.x, r.y);
    r.estPath.push(r.ex, r.ey);
    ev.push("won");
  } else if (r.battery <= 0) {
    r.battery = 0;
    r.done = "flat";
    r.truePath.push(r.x, r.y);
    r.estPath.push(r.ex, r.ey);
    ev.push("flat");
  } else if (r.battery < 20 && !r.lowWarned) {
    r.lowWarned = true;
    ev.push("low");
  }
  return ev;
}
