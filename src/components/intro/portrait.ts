// A standing figure surveyed as terrain. A signed-distance body (head, torso, arms with hands in
// pockets, legs) becomes a height field: zero at the silhouette, rising inward with gentle peaks at
// the head and chest and a little low-frequency relief. Marching squares traces it at a fixed
// contour interval, so the portrait is literally a contour map of a person.
// Units: figure space, y down, the figure ~86 units tall (crown y≈7.6, soles y≈92).

export type PortraitLevel = { level: number; index: boolean; paths: string[] };
export type Portrait = { levels: PortraitLevel[]; mouth: [number, number] };

// Framed like the real clips: 9:16 (576×1024), the figure filling ~88% of the height with an even
// margin above the crown (y≈7.6) and below the soles (y≈92), so both stand on the same ground line.
export const PORTRAIT_VIEWBOX = "-26.97 1.85 53.94 95.9";
/** fraction of the frame height between the soles and the frame's bottom edge */
export const PORTRAIT_FOOT = 0.06;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** polynomial smooth minimum */
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** approximate signed distance to an ellipse (Quílez) */
function ellipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number) {
  const x = px - cx;
  const y = py - cy;
  const k0 = Math.hypot(x / rx, y / ry);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry));
  return k1 < 1e-9 ? -Math.min(rx, ry) : (k0 * (k0 - 1)) / k1;
}

/** signed distance to a capsule whose radius tapers from ra (at a) to rb (at b) (Quílez) */
function taper(px: number, py: number, ax: number, ay: number, bx: number, by: number, ra: number, rb: number) {
  const x = px - ax;
  const y = py - ay;
  const ex = bx - ax;
  const ey = by - ay;
  const h = ex * ex + ey * ey;
  let qx = (x * ey - y * ex) / h;
  const qy = (x * ex + y * ey) / h;
  qx = Math.abs(qx);
  const b = ra - rb;
  const cx = Math.sqrt(h - b * b);
  const cy = b;
  const k = cx * qy - cy * qx;
  const m = cx * qx + cy * qy;
  const n = qx * qx + qy * qy;
  if (k < 0) return Math.sqrt(h * n) - ra;
  if (k > cx) return Math.sqrt(h * (n + 1 - 2 * qy)) - rb;
  return m - ra;
}

function limb(px: number, py: number, s: number) {
  // s = ±1 picks the side; the figure stands relaxed, weight a touch on his left (s = −1)
  const ex = s < 0 ? 11.95 : 11.45;
  const ey = s < 0 ? 38.2 : 39.0;
  const sy = s < 0 ? 26.6 : 27.1;
  const upper = taper(px, py, 9.8 * s, sy, ex * s, ey, 2.5, 2.05);
  const fore = taper(px, py, ex * s, ey, 8.4 * s, 47.4, 2.0, 1.75);
  const arm = smin(upper, fore, 0.9);
  const thigh = taper(px, py, 4.25 * s, 51.5, 4.15 * s, 69, 3.85, 2.95);
  const shin = taper(px, py, 4.15 * s, 69, 4.4 * s, 87.4, 2.85, 2.05);
  const foot = taper(px, py, 4.45 * s, 89.6, 6.9 * s, 90.6, 1.95, 1.5);
  const leg = smin(smin(thigh, shin, 1.1), foot, 0.9);
  return { arm, leg };
}

/** signed distance to the figure (negative inside) */
function body(px: number, py: number) {
  const head = smin(ellipse(px, py, 0.15, 13.4, 4.5, 5.7), ellipse(px, py, 0.4, 11.5, 4.95, 4.7), 1.1);
  const neck = taper(px, py, 0, 18, 0, 22.6, 2.25, 2.55);
  const shoulders = taper(px, py, -8.7, 25.5, 8.7, 25.95, 3.05, 3.05);
  const torso = taper(px, py, 0, 28.5, 0, 43.6, 7.9, 6.7);
  const pelvis = taper(px, py, 0, 45, 0, 50.6, 6.75, 6.3);
  let trunk = smin(shoulders, torso, 3.2);
  trunk = smin(trunk, pelvis, 2.4);
  let d = smin(head, neck, 1.6);
  d = smin(d, trunk, 1.6);
  const l = limb(px, py, -1);
  const r = limb(px, py, 1);
  d = smin(d, l.arm, 0.9);
  d = smin(d, r.arm, 0.9);
  d = smin(d, l.leg, 1.3);
  d = smin(d, r.leg, 1.3);
  return d;
}

function height(px: number, py: number) {
  const d = body(px, py);
  if (d >= 0) return -d;
  const depth = -d;
  const inner = smoothstep(0, 1.8, depth);
  const g = (cx: number, cy: number, s: number) => Math.exp(-((px - cx) ** 2 + (py - cy) ** 2) / (2 * s * s));
  const peaks = 1.5 * g(0, 12.6, 3.1) + 1.1 * g(0, 33, 5.6) + 0.5 * g(0, 47, 4);
  const relief =
    0.55 * Math.sin(0.71 * px + 0.43 * py + 0.6) * Math.sin(0.37 * px - 0.52 * py + 1.9) +
    0.3 * Math.sin(0.9 * px + 0.27 * py + 2.7);
  return depth + inner * (peaks + 0.5 * relief);
}

/* ─── marching squares with edge-keyed segment linking ─── */

type Pt = [number, number];

function trace(field: Float32Array, nx: number, ny: number, x0: number, y0: number, step: number, level: number) {
  // Edge ids: horizontal edge (i,j)→(i+1,j) = j*nx+i; vertical edge (i,j)→(i,j+1) = H + j*nx+i.
  const H = nx * ny;
  const pts = new Map<number, Pt>();
  const links = new Map<number, number[]>();
  const v = (i: number, j: number) => field[j * nx + i] - level;

  const point = (id: number): Pt => {
    let p = pts.get(id);
    if (p) return p;
    if (id < H) {
      const j = Math.floor(id / nx);
      const i = id - j * nx;
      const a = v(i, j);
      const b = v(i + 1, j);
      const t = a / (a - b);
      p = [x0 + (i + t) * step, y0 + j * step];
    } else {
      const k = id - H;
      const j = Math.floor(k / nx);
      const i = k - j * nx;
      const a = v(i, j);
      const b = v(i, j + 1);
      const t = a / (a - b);
      p = [x0 + i * step, y0 + (j + t) * step];
    }
    pts.set(id, p);
    return p;
  };
  const link = (a: number, b: number) => {
    point(a);
    point(b);
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const tl = v(i, j);
      const tr = v(i + 1, j);
      const br = v(i + 1, j + 1);
      const bl = v(i, j + 1);
      const c = (tl > 0 ? 8 : 0) | (tr > 0 ? 4 : 0) | (br > 0 ? 2 : 0) | (bl > 0 ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const top = j * nx + i;
      const bottom = (j + 1) * nx + i;
      const left = H + j * nx + i;
      const right = H + j * nx + i + 1;
      switch (c) {
        case 1:
        case 14:
          link(left, bottom);
          break;
        case 2:
        case 13:
          link(bottom, right);
          break;
        case 3:
        case 12:
          link(left, right);
          break;
        case 4:
        case 11:
          link(top, right);
          break;
        case 6:
        case 9:
          link(top, bottom);
          break;
        case 7:
        case 8:
          link(left, top);
          break;
        case 5:
        case 10: {
          const centre = (tl + tr + br + bl) / 4 > 0;
          // saddle: join the corners that agree with the centre
          if ((c === 5) === centre) {
            link(left, top);
            link(bottom, right);
          } else {
            link(left, bottom);
            link(top, right);
          }
          break;
        }
      }
    }
  }

  // walk the links into polylines
  const seen = new Set<number>();
  const lines: { pts: Pt[]; closed: boolean }[] = [];
  // start at open ends first so open chains come out whole
  const starts = [...links.keys()].sort((a, b) => links.get(a)!.length - links.get(b)!.length);
  for (const start of starts) {
    if (seen.has(start)) continue;
    const chain: number[] = [start];
    seen.add(start);
    let prev = -1;
    let cur = start;
    for (;;) {
      const next = (links.get(cur) ?? []).find((n) => n !== prev && !seen.has(n));
      if (next === undefined) break;
      chain.push(next);
      seen.add(next);
      prev = cur;
      cur = next;
    }
    const closed = (links.get(cur) ?? []).includes(start) && chain.length > 2;
    lines.push({ pts: chain.map((id) => pts.get(id)!), closed });
  }
  return lines;
}

function perimeter(p: Pt[]) {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
}

/** Ramer–Douglas–Peucker */
function simplify(p: Pt[], eps: number): Pt[] {
  if (p.length < 4) return p;
  const [ax, ay] = p[0];
  const [bx, by] = p[p.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1e-9;
  let max = 0;
  let idx = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const d = Math.abs((by - ay) * p[i][0] - (bx - ax) * p[i][1] + bx * ay - by * ax) / len;
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [p[0], p[p.length - 1]];
  return [...simplify(p.slice(0, idx + 1), eps).slice(0, -1), ...simplify(p.slice(idx), eps)];
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** A smooth closed curve through the polygon's edge midpoints (quadratic B-spline). */
function smoothClosed(p: Pt[]) {
  const n = p.length;
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(p[n - 1], p[0]);
  let d = `M${f(m0[0])} ${f(m0[1])}`;
  for (let i = 0; i < n; i++) {
    const m = mid(p[i], p[(i + 1) % n]);
    d += `Q${f(p[i][0])} ${f(p[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d}Z`;
}

function smoothOpen(p: Pt[]) {
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const m: Pt = [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2];
    d += `Q${f(p[i][0])} ${f(p[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  const last = p[p.length - 1];
  return `${d}L${f(last[0])} ${f(last[1])}`;
}

let cache: Portrait | null = null;

export const CONTOUR_INTERVAL = 0.56;

export function buildPortrait(): Portrait {
  if (cache) return cache;
  const step = 0.27;
  const x0 = -17;
  const y0 = 4.5;
  const nx = Math.round(34 / step) + 1;
  const ny = Math.round(90 / step) + 1;
  const field = new Float32Array(nx * ny);
  let max = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const h = height(x0 + i * step, y0 + j * step);
      field[j * nx + i] = h;
      if (h > max) max = h;
    }
  }

  const levels: PortraitLevel[] = [];
  for (let k = 0, level = 0.02; level < max - 0.15; k++, level = 0.02 + k * CONTOUR_INTERVAL) {
    const paths: string[] = [];
    for (const line of trace(field, nx, ny, x0, y0, step, level)) {
      if (line.pts.length < 6 || perimeter(line.pts) < 4.2) continue;
      const pts = simplify(line.pts, 0.035);
      if (pts.length < 3) continue;
      paths.push(line.closed ? smoothClosed(pts) : smoothOpen(pts));
    }
    if (paths.length) levels.push({ level, index: k % 6 === 0, paths });
  }

  cache = { levels, mouth: [0, 16.7] };
  return cache;
}
