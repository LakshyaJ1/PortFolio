"use client";

// The 3D stage ground's height field, baked once per page load into a float grid that the stage
// scene uploads as a texture (contours per pixel) and samples for its mesh. Pure CPU, no three:
// the greeting starts the bake while the hellos run, a few rows per idle slice, so it never costs
// a frame; the stage just awaits the same promise.
// World axes as the terrain toolkit: x east, z south (−z recedes toward the horizon), the survey
// station under his feet at the origin, the summit of its own hill.

import { GaussianField, type Gaussian } from "@/components/terrain";

/** The baked rectangle (world units). The camera sees x ≈ −10…35 and z ≈ −45…2 at most. */
export const DOMAIN = { x0: -24, x1: 40, z0: -50, z1: 6 } as const;
/** world units per sample */
export const STEP = 0.125;
export const NX = Math.round((DOMAIN.x1 - DOMAIN.x0) / STEP) + 1;
export const NZ = Math.round((DOMAIN.z1 - DOMAIN.z0) / STEP) + 1;

const HILLS: Gaussian[] = [
  // the station's hill and its near neighbours (the same ground as the flat stage field)
  { x: 0, z: 0, sx: 1.25, sz: 0.95, amp: 1 },
  { x: 1.7, z: -0.85, sx: 0.8, sz: 0.55, amp: -0.32 },
  { x: 3.5, z: -2.3, sx: 1.5, sz: 0.95, angle: 0.55, amp: 0.82 },
  { x: 5.6, z: -0.5, sx: 1.2, sz: 1.3, amp: 0.5 },
  { x: 0.7, z: -4.3, sx: 1.6, sz: 0.95, angle: -0.3, amp: 0.7 },
  { x: -2.6, z: -2.9, sx: 1.2, sz: 1.15, amp: 0.48 },
  { x: 2.9, z: -4.9, sx: 1, sz: 0.8, amp: -0.42 },
  { x: -1.8, z: 1.6, sx: 1.4, sz: 0.9, amp: -0.3 },
  // the wider survey, receding toward the horizon
  { x: 9, z: -3, sx: 2.2, sz: 1.6, angle: 0.3, amp: 0.7 },
  { x: 13, z: 0.5, sx: 1.8, sz: 1.4, amp: 0.55 },
  { x: 7.5, z: -8, sx: 2.6, sz: 1.8, angle: -0.4, amp: 0.9 },
  { x: 16, z: -6, sx: 3, sz: 2, angle: 0.6, amp: 0.8 },
  { x: 2, z: -11, sx: 3, sz: 2.2, amp: 0.75 },
  { x: -6, z: -8, sx: 2.5, sz: 2.4, amp: 0.6 },
  { x: 5, z: -14, sx: 2, sz: 1.5, amp: -0.4 },
  { x: 11, z: -14, sx: 3.5, sz: 2.4, angle: 0.2, amp: 1 },
  { x: 15, z: -18, sx: 2.5, sz: 2, amp: -0.35 },
  { x: 22, z: -11, sx: 3.6, sz: 3, amp: 0.85 },
  { x: -4, z: -18, sx: 4, sz: 3, angle: -0.5, amp: 0.9 },
  { x: 6, z: -22, sx: 4.5, sz: 3, amp: 1.1 },
  { x: 20, z: -24, sx: 5, sz: 3.5, angle: 0.4, amp: 1 },
  { x: -10, z: -28, sx: 5, sz: 4, amp: 0.9 },
  { x: 10, z: -34, sx: 6, sz: 4, amp: 1.2 },
  { x: 28, z: -36, sx: 6, sz: 5, amp: 1 },
];

export const stageGround = new GaussianField({
  bounds: { x0: DOMAIN.x0, x1: DOMAIN.x1, z0: DOMAIN.z0, z1: DOMAIN.z1 },
  gaussians: HILLS,
  waves: [
    { kx: 0.9, kz: 0.6, phase: 1.1, amp: 0.05 },
    { kx: -0.5, kz: 1.3, phase: 0.4, amp: 0.045 },
    { kx: 0.21, kz: 0.17, phase: 2, amp: 0.1 },
  ],
});

export type GroundBake = { heights: Float32Array; nx: number; nz: number };

let pending: Promise<GroundBake> | null = null;

type IdleWindow = Window & { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number };

/** Bake the ground (once per page load). Rows go in small idle slices, ~4 ms at most each. */
export function bakeGround(): Promise<GroundBake> {
  if (pending) return pending;
  pending = new Promise((resolve) => {
    const heights = new Float32Array(NX * NZ);
    let row = 0;
    const w = window as IdleWindow;
    const slice = (budget: () => number) => {
      const t0 = performance.now();
      while (row < NZ && performance.now() - t0 < budget()) {
        const z = DOMAIN.z0 + row * STEP;
        const o = row * NX;
        for (let i = 0; i < NX; i++) heights[o + i] = stageGround.height(DOMAIN.x0 + i * STEP, z);
        row++;
      }
      if (row >= NZ) resolve({ heights, nx: NX, nz: NZ });
      else schedule();
    };
    const schedule = () => {
      if (w.requestIdleCallback) w.requestIdleCallback((d) => slice(() => Math.min(4, Math.max(1, d.timeRemaining()))), { timeout: 120 });
      else window.setTimeout(() => slice(() => 4), 16);
    };
    schedule();
  });
  return pending;
}

/** Bilinear height from the bake (world x, z), clamped to the domain. */
export function groundAt(b: GroundBake, x: number, z: number) {
  const gx = Math.min(b.nx - 1.0001, Math.max(0, (x - DOMAIN.x0) / STEP));
  const gz = Math.min(b.nz - 1.0001, Math.max(0, (z - DOMAIN.z0) / STEP));
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const h = b.heights;
  const o = j * b.nx + i;
  const top = h[o] + (h[o + 1] - h[o]) * fx;
  const bot = h[o + b.nx] + (h[o + b.nx + 1] - h[o + b.nx]) * fx;
  return top + (bot - top) * fz;
}
