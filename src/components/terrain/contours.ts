// Terrain toolkit · contours by marching squares.
//
//   const grid = sampleGrid(field, bounds, 200, 120);          // heights on a lattice
//   const lines = isoLines(grid, 0.4);                          // chained polylines, world XZ
//   const paths = contourPaths(grid, { interval: 0.05, indexEvery: 5, project });
//   // → [{ level, index, d, lines }] ready for <path d={…}>
//
// Segments are chained through shared cell-edge ids, so every polyline is continuous and
// closed loops are detected exactly. Saddles are resolved with the cell-centre average.
// `project` maps world (x, z) to output coordinates (e.g. SVG pixels).

import type { Bounds, HeightField } from "./field";

export type Grid = {
  nx: number;
  ny: number;
  x0: number;
  z0: number;
  dx: number;
  dz: number;
  /** row-major, values[j * nx + i] = h(x0 + i·dx, z0 + j·dz) */
  values: Float32Array;
  min: number;
  max: number;
};

export type Polyline = { points: number[]; closed: boolean };
export type Project = (x: number, z: number) => readonly [number, number];

export type ContourPath = {
  level: number;
  /** an index contour (every `indexEvery`th level) */
  index: boolean;
  d: string;
  lines: Polyline[];
};

/** Sample a field (or any h(x, z)) on an nx × ny lattice spanning `b`. */
export function sampleGrid(field: HeightField | ((x: number, z: number) => number), b: Bounds, nx: number, ny: number): Grid {
  const fn = typeof field === "function" ? field : (x: number, z: number) => field.height(x, z);
  const values = new Float32Array(nx * ny);
  const dx = (b.x1 - b.x0) / (nx - 1);
  const dz = (b.z1 - b.z0) / (ny - 1);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < ny; j++) {
    const z = b.z0 + j * dz;
    for (let i = 0; i < nx; i++) {
      const v = fn(b.x0 + i * dx, z);
      values[j * nx + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { nx, ny, x0: b.x0, z0: b.z0, dx, dz, values, min, max };
}

// Edge pairs per marching-squares case. Corners: 0 (i,j) 1 (i+1,j) 2 (i+1,j+1) 3 (i,j+1).
// Edges: 0 = 0–1, 1 = 1–2, 2 = 3–2, 3 = 0–3. Cases 5 and 10 are saddles (handled inline).
const CASES: number[][] = [[], [3, 0], [0, 1], [3, 1], [1, 2], [], [0, 2], [3, 2], [2, 3], [0, 2], [], [1, 2], [1, 3], [0, 1], [3, 0], []];

/** Iso-lines of `grid` at `level`, chained into polylines in world XZ. */
export function isoLines(grid: Grid, level: number): Polyline[] {
  const { nx, ny, values } = grid;
  const hCount = (nx - 1) * ny;
  // edge id → point; a segment list of edge-id pairs
  const pts = new Map<number, [number, number]>();
  const segs: number[] = [];

  const edgeId = (i: number, j: number, e: number) => {
    switch (e) {
      case 0:
        return j * (nx - 1) + i; // horizontal (i,j)–(i+1,j)
      case 2:
        return (j + 1) * (nx - 1) + i;
      case 3:
        return hCount + j * nx + i; // vertical (i,j)–(i,j+1)
      default:
        return hCount + j * nx + i + 1;
    }
  };
  const point = (i: number, j: number, e: number, v: number[]) => {
    const id = edgeId(i, j, e);
    if (pts.has(id)) return id;
    let ax: number, az: number, bx: number, bz: number, va: number, vb: number;
    if (e === 0) [ax, az, bx, bz, va, vb] = [i, j, i + 1, j, v[0], v[1]];
    else if (e === 1) [ax, az, bx, bz, va, vb] = [i + 1, j, i + 1, j + 1, v[1], v[2]];
    else if (e === 2) [ax, az, bx, bz, va, vb] = [i, j + 1, i + 1, j + 1, v[3], v[2]];
    else [ax, az, bx, bz, va, vb] = [i, j, i, j + 1, v[0], v[3]];
    const t = vb === va ? 0.5 : Math.min(Math.max((level - va) / (vb - va), 0), 1);
    pts.set(id, [grid.x0 + (ax + (bx - ax) * t) * grid.dx, grid.z0 + (az + (bz - az) * t) * grid.dz]);
    return id;
  };

  const v = [0, 0, 0, 0];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      v[0] = values[j * nx + i];
      v[1] = values[j * nx + i + 1];
      v[2] = values[(j + 1) * nx + i + 1];
      v[3] = values[(j + 1) * nx + i];
      const c = (v[0] >= level ? 1 : 0) | (v[1] >= level ? 2 : 0) | (v[2] >= level ? 4 : 0) | (v[3] >= level ? 8 : 0);
      if (c === 0 || c === 15) continue;
      let pairs: number[];
      if (c === 5 || c === 10) {
        const centreHigh = (v[0] + v[1] + v[2] + v[3]) / 4 >= level;
        // c=5: corners 0 and 2 high. c=10: corners 1 and 3 high.
        if (c === 5) pairs = centreHigh ? [0, 1, 2, 3] : [3, 0, 1, 2];
        else pairs = centreHigh ? [3, 0, 1, 2] : [0, 1, 2, 3];
      } else pairs = CASES[c];
      for (let k = 0; k < pairs.length; k += 2) {
        segs.push(point(i, j, pairs[k], v), point(i, j, pairs[k + 1], v));
      }
    }
  }

  // chain: each edge id is shared by at most two segments
  const byEdge = new Map<number, number[]>();
  const nSeg = segs.length / 2;
  for (let s = 0; s < nSeg; s++) {
    for (const e of [segs[s * 2], segs[s * 2 + 1]]) {
      const list = byEdge.get(e);
      if (list) list.push(s);
      else byEdge.set(e, [s]);
    }
  }
  const used = new Uint8Array(nSeg);
  const other = (s: number, e: number) => (segs[s * 2] === e ? segs[s * 2 + 1] : segs[s * 2]);
  const next = (e: number) => byEdge.get(e)?.find((s) => !used[s]);

  const out: Polyline[] = [];
  for (let s0 = 0; s0 < nSeg; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const ids = [segs[s0 * 2], segs[s0 * 2 + 1]];
    // forward
    for (let s = next(ids[ids.length - 1]); s !== undefined; s = next(ids[ids.length - 1])) {
      used[s] = 1;
      ids.push(other(s, ids[ids.length - 1]));
    }
    // backward
    for (let s = next(ids[0]); s !== undefined; s = next(ids[0])) {
      used[s] = 1;
      ids.unshift(other(s, ids[0]));
    }
    const closed = ids.length > 3 && ids[0] === ids[ids.length - 1];
    if (closed) ids.pop();
    const points: number[] = [];
    for (const id of ids) {
      const p = pts.get(id)!;
      points.push(p[0], p[1]);
    }
    out.push({ points, closed });
  }
  return out;
}

/** Evenly spaced levels (multiples of `interval`) strictly inside [min, max]. */
export function contourLevels(min: number, max: number, interval: number) {
  const out: number[] = [];
  for (let k = Math.ceil(min / interval); k * interval < max; k++) out.push(+(k * interval).toFixed(6));
  return out;
}

/** Drop points closer than `tol` (output units) to the last kept point. */
function thin(xy: number[], tol: number) {
  if (xy.length <= 4) return xy;
  const out = [xy[0], xy[1]];
  const t2 = tol * tol;
  for (let i = 2; i < xy.length - 2; i += 2) {
    const dx = xy[i] - out[out.length - 2];
    const dy = xy[i + 1] - out[out.length - 1];
    if (dx * dx + dy * dy >= t2) out.push(xy[i], xy[i + 1]);
  }
  out.push(xy[xy.length - 2], xy[xy.length - 1]);
  return out;
}

const r = (n: number, p: number) => +n.toFixed(p);

/**
 * SVG path data for one polyline: projected, thinned, and (optionally) smoothed with
 * Catmull-Rom → cubic Bézier so the contour reads as a drawn line rather than a trace.
 */
export function polylinePath(line: Polyline, project: Project, { smooth = true, tol = 1.5, precision = 1 } = {}) {
  const raw: number[] = [];
  for (let i = 0; i < line.points.length; i += 2) {
    const [x, y] = project(line.points[i], line.points[i + 1]);
    raw.push(x, y);
  }
  const xy = thin(raw, tol);
  const n = xy.length / 2;
  if (n < 2) return "";
  const P = (k: number) => {
    if (line.closed) k = (k + n) % n;
    else k = Math.min(Math.max(k, 0), n - 1);
    return [xy[k * 2], xy[k * 2 + 1]] as const;
  };
  let d = `M${r(xy[0], precision)} ${r(xy[1], precision)}`;
  if (!smooth || n < 3) {
    for (let k = 1; k < n; k++) d += `L${r(xy[k * 2], precision)} ${r(xy[k * 2 + 1], precision)}`;
    return line.closed ? d + "Z" : d;
  }
  const segs = line.closed ? n : n - 1;
  for (let k = 0; k < segs; k++) {
    const p0 = P(k - 1);
    const p1 = P(k);
    const p2 = P(k + 1);
    const p3 = P(k + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${r(c1x, precision)} ${r(c1y, precision)} ${r(c2x, precision)} ${r(c2y, precision)} ${r(p2[0], precision)} ${r(p2[1], precision)}`;
  }
  return line.closed ? d + "Z" : d;
}

/** All contours of a grid as SVG paths, one entry per level. */
export function contourPaths(
  grid: Grid,
  {
    interval,
    indexEvery = 5,
    project,
    smooth = true,
    tol = 1.5,
    minPoints = 3,
    levels,
  }: { interval: number; indexEvery?: number; project: Project; smooth?: boolean; tol?: number; minPoints?: number; levels?: number[] },
): ContourPath[] {
  const lv = levels ?? contourLevels(grid.min, grid.max, interval);
  return lv.map((level) => {
    const lines = isoLines(grid, level).filter((l) => l.points.length / 2 >= minPoints);
    const d = lines.map((l) => polylinePath(l, project, { smooth, tol })).join("");
    const k = Math.round(level / interval);
    return { level, index: k % indexEvery === 0, d, lines };
  });
}

/**
 * A label anchor partway along the longest polyline of a contour: position in output
 * units and a reading angle (degrees, never upside down). For contour height labels.
 */
export function labelAnchor(lines: Polyline[], project: Project, at = 0.5) {
  let best: Polyline | null = null;
  for (const l of lines) if (!best || l.points.length > best.points.length) best = l;
  if (!best || best.points.length < 8) return null;
  const n = best.points.length / 2;
  const k = Math.min(Math.max(Math.floor(n * at), 1), n - 2);
  const [ax, ay] = project(best.points[(k - 1) * 2], best.points[(k - 1) * 2 + 1]);
  const [x, y] = project(best.points[k * 2], best.points[k * 2 + 1]);
  const [bx, by] = project(best.points[(k + 1) * 2], best.points[(k + 1) * 2 + 1]);
  let angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return { x, y, angle };
}
