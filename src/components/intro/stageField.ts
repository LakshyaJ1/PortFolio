// The ground the avatar stands on: a quiet, static contour map whose summit is his survey station.
// Computed once (≈20 ms) into a square 1000×1000 SVG that the stage centres on the station, so the
// rings close around his feet at every layout. Plan view, squashed a little north–south so the
// rings round the station also read as a ground plane.

import { GaussianField } from "@/components/terrain";
import { computeContourMap } from "@/components/terrain/ContourMap";

export const FIELD_SIZE = 1000;

let cache: { minor: string[]; index: string[] } | null = null;

export function stageField() {
  if (cache) return cache;
  const field = new GaussianField({
    bounds: { x0: -6, x1: 6, z0: -6, z1: 6 },
    gaussians: [
      { x: 0, z: 0, sx: 1.25, sz: 0.62, amp: 1 }, // the station's summit
      { x: 1.7, z: -0.85, sx: 0.8, sz: 0.55, amp: -0.32 }, // saddle toward the next hill
      { x: 3.5, z: -2.3, sx: 1.5, sz: 0.95, angle: 0.55, amp: 0.82 },
      { x: 5.6, z: -0.5, sx: 1.2, sz: 1.3, amp: 0.5 },
      { x: 0.7, z: -4.3, sx: 1.6, sz: 0.95, angle: -0.3, amp: 0.7 },
      { x: -2.6, z: -2.9, sx: 1.2, sz: 1.15, amp: 0.48 },
      { x: 2.9, z: -4.9, sx: 1, sz: 0.8, amp: -0.42 },
      { x: -1.8, z: 1.6, sx: 1.4, sz: 0.9, amp: -0.3 },
    ],
    waves: [
      { kx: 0.9, kz: 0.6, phase: 1.1, amp: 0.05 },
      { kx: -0.5, kz: 1.3, phase: 0.4, amp: 0.045 },
    ],
  });
  const data = computeContourMap(field, { bounds: field.bounds, width: FIELD_SIZE, height: FIELD_SIZE }, { interval: 0.07, indexEvery: 5, cell: 6 });
  const minor: string[] = [];
  const index: string[] = [];
  for (const p of data.paths) if (p.d) (p.index ? index : minor).push(p.d);
  cache = { minor, index };
  return cache;
}
