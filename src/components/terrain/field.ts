// Terrain toolkit · height fields.
//
// A HeightField is a smooth surface h(x, z) over world XZ (x east, z south; −z is north,
// "up" the sheet). Two kinds share one interface so every renderer, the contour tracer,
// the ray picker and the optimizer work on either:
//
//   GaussianField  sum of anisotropic gaussians + low-frequency waves + a gentle bowl,
//                  plus runtime "bumps" (press-to-raise / sink). Mirrored exactly in GLSL.
//   GridField      a grid of samples (e.g. a GitHub contribution calendar), optionally
//                  blurred and Catmull-Rom upsampled, sampled bilinearly on CPU and GPU.
//
// `sample(x, z)` returns [h, ∂h/∂x, ∂h/∂z]. `version` increments whenever the surface
// changes so renderers can refresh uniforms/textures cheaply.

export type Bounds = { x0: number; x1: number; z0: number; z1: number };

export interface HeightField {
  readonly kind: "gaussian" | "grid";
  /** the meaningful domain (renderers may draw beyond it; the surface stays defined) */
  readonly bounds: Bounds;
  /** increments on every change to the surface */
  readonly version: number;
  height(x: number, z: number): number;
  /** [h, ∂h/∂x, ∂h/∂z] written into `out` (and returned) */
  sample(x: number, z: number, out?: number[]): number[];
}

export type Gaussian = {
  x: number;
  z: number;
  /** standard deviation along the gaussian's own axis (rotated by `angle`) */
  sx: number;
  sz: number;
  /** radians, rotates the sx axis away from +x toward +z */
  angle?: number;
  /** negative for basins, positive for hills */
  amp: number;
};

/** h += amp · sin(kx·x + kz·z + phase) */
export type Wave = { kx: number; kz: number; phase: number; amp: number };

/** An isotropic deformation added at runtime. */
export type Bump = { x: number; z: number; sigma: number; amp: number };

export type GaussianFieldSpec = {
  bounds: Bounds;
  base?: number;
  /** h += bowl[0]·x² + bowl[1]·z²: keeps optimizers inside the sheet */
  bowl?: [number, number];
  gaussians: Gaussian[];
  waves?: Wave[];
  /** GPU uniform budget for runtime bumps (default 48) */
  maxBumps?: number;
};

export type Minimum = { x: number; z: number; h: number };

const tmp = [0, 0, 0];

export class GaussianField implements HeightField {
  readonly kind = "gaussian" as const;
  readonly bounds: Bounds;
  readonly base: number;
  readonly bowl: readonly [number, number];
  readonly gaussians: readonly Gaussian[];
  readonly waves: readonly Wave[];
  readonly maxBumps: number;
  /** per gaussian: centre x, centre z, amplitude, 0 */
  readonly g0: Float32Array;
  /** per gaussian: inverse covariance a, b, c, 0  (q = a·dx² + 2b·dx·dz + c·dz²) */
  readonly g1: Float32Array;
  /** per wave: kx, kz, phase, amp */
  readonly w: Float32Array;
  /** runtime deformations; mutate through addBump / setBump / setBumps so `version` moves */
  bumps: Bump[] = [];
  /** added to every height; `normalize()` sets it so the designed global minimum reads 0 */
  offset = 0;
  version = 0;

  constructor(spec: GaussianFieldSpec) {
    this.bounds = spec.bounds;
    this.base = spec.base ?? 0;
    this.bowl = spec.bowl ?? [0, 0];
    this.gaussians = spec.gaussians;
    this.waves = spec.waves ?? [];
    this.maxBumps = spec.maxBumps ?? 48;
    this.g0 = new Float32Array(this.gaussians.length * 4);
    this.g1 = new Float32Array(this.gaussians.length * 4);
    this.gaussians.forEach((g, i) => {
      const c = Math.cos(g.angle ?? 0);
      const s = Math.sin(g.angle ?? 0);
      const ix = 1 / (g.sx * g.sx);
      const iz = 1 / (g.sz * g.sz);
      this.g0.set([g.x, g.z, g.amp, 0], i * 4);
      this.g1.set([c * c * ix + s * s * iz, c * s * (ix - iz), s * s * ix + c * c * iz, 0], i * 4);
    });
    this.w = new Float32Array(this.waves.length * 4);
    this.waves.forEach((w, i) => this.w.set([w.kx, w.kz, w.phase, w.amp], i * 4));
  }

  height(x: number, z: number) {
    return this.sample(x, z, tmp)[0];
  }

  sample(x: number, z: number, out: number[] = [0, 0, 0]) {
    const [bx, bz] = this.bowl;
    let h = this.base + this.offset + bx * x * x + bz * z * z;
    let gx = 2 * bx * x;
    let gz = 2 * bz * z;
    const g0 = this.g0;
    const g1 = this.g1;
    for (let o = 0; o < g0.length; o += 4) {
      const dx = x - g0[o];
      const dz = z - g0[o + 1];
      const a = g1[o];
      const b = g1[o + 1];
      const c = g1[o + 2];
      const e = g0[o + 2] * Math.exp(-0.5 * (a * dx * dx + 2 * b * dx * dz + c * dz * dz));
      h += e;
      gx -= e * (a * dx + b * dz);
      gz -= e * (b * dx + c * dz);
    }
    const w = this.w;
    for (let o = 0; o < w.length; o += 4) {
      const ph = w[o] * x + w[o + 1] * z + w[o + 2];
      const amp = w[o + 3];
      h += amp * Math.sin(ph);
      const cs = amp * Math.cos(ph);
      gx += cs * w[o];
      gz += cs * w[o + 1];
    }
    for (const b of this.bumps) {
      const dx = x - b.x;
      const dz = z - b.z;
      const k = 1 / (2 * b.sigma * b.sigma);
      const e = b.amp * Math.exp(-k * (dx * dx + dz * dz));
      h += e;
      gx -= 2 * k * e * dx;
      gz -= 2 * k * e * dz;
    }
    out[0] = h;
    out[1] = gx;
    out[2] = gz;
    return out;
  }

  /** Mark the surface changed (call after mutating `bumps` directly). */
  touch() {
    this.version++;
  }

  /**
   * Add a bump. When the GPU budget is full the bump merges into its nearest neighbour
   * instead of evicting one, so nothing the visitor built ever pops out. Returns its index.
   */
  addBump(b: Bump) {
    if (this.bumps.length < this.maxBumps) {
      this.bumps.push({ ...b });
      this.version++;
      return this.bumps.length - 1;
    }
    let best = 0;
    let bestD = Infinity;
    this.bumps.forEach((o, i) => {
      const d = (o.x - b.x) ** 2 + (o.z - b.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const o = this.bumps[best];
    const wa = Math.abs(o.amp) + 1e-6;
    const wb = Math.abs(b.amp) + 1e-6;
    o.x = (o.x * wa + b.x * wb) / (wa + wb);
    o.z = (o.z * wa + b.z * wb) / (wa + wb);
    o.sigma = Math.max(o.sigma, b.sigma);
    o.amp += b.amp;
    this.version++;
    return best;
  }

  setBump(i: number, patch: Partial<Bump>) {
    const b = this.bumps[i];
    if (!b) return;
    Object.assign(b, patch);
    this.version++;
  }

  setBumps(list: Bump[]) {
    this.bumps = list.slice(0, this.maxBumps).map((b) => ({ ...b }));
    this.version++;
  }

  /**
   * Shift heights so the global minimum of the surface (as it is now) reads exactly 0.
   * Returns where that minimum is.
   */
  normalize() {
    this.offset = 0;
    const m = globalMinimum(this);
    this.offset = -m.h;
    return { x: m.x, z: m.z, h: 0 };
  }
}

/**
 * A field from a grid of samples, row-major `values[row * cols + col]`; columns run along
 * x across `bounds.x0…x1`, rows along z across `bounds.z0…z1`. `blur` (in source cells)
 * softens a spiky grid; `upsample` refines it with Catmull-Rom so contours come out smooth.
 * Outside the grid the surface clamps to its edge values.
 */
export class GridField implements HeightField {
  readonly kind = "grid" as const;
  readonly bounds: Bounds;
  data: Float32Array;
  nx: number;
  ny: number;
  base: number;
  version = 0;

  constructor(
    values: ArrayLike<number>,
    cols: number,
    rows: number,
    bounds: Bounds,
    opts: { blur?: number; upsample?: number; base?: number; scale?: number } = {},
  ) {
    this.bounds = bounds;
    this.base = opts.base ?? 0;
    const scale = opts.scale ?? 1;
    let data = Float32Array.from(values, (v) => v * scale);
    if (opts.blur && opts.blur > 0) data = boxBlur(data, cols, rows, opts.blur);
    let nx = cols;
    let ny = rows;
    const up = Math.max(1, Math.floor(opts.upsample ?? 1));
    if (up > 1) {
      ({ data, nx, ny } = upsampleCatmullRom(data, cols, rows, up));
    }
    this.data = data;
    this.nx = nx;
    this.ny = ny;
  }

  /** Replace the samples (same shape after processing) and bump the version. */
  setData(data: Float32Array) {
    this.data = data;
    this.version++;
  }

  height(x: number, z: number) {
    return this.sample(x, z, tmp)[0];
  }

  sample(x: number, z: number, out: number[] = [0, 0, 0]) {
    const { x0, x1, z0, z1 } = this.bounds;
    const sx = (this.nx - 1) / (x1 - x0);
    const sz = (this.ny - 1) / (z1 - z0);
    const gxp = Math.min(Math.max((x - x0) * sx, 0), this.nx - 1.0001);
    const gzp = Math.min(Math.max((z - z0) * sz, 0), this.ny - 1.0001);
    const i = Math.floor(gxp);
    const j = Math.floor(gzp);
    const fx = gxp - i;
    const fz = gzp - j;
    const d = this.data;
    const n = this.nx;
    const a = d[j * n + i];
    const b = d[j * n + i + 1];
    const c = d[(j + 1) * n + i];
    const e = d[(j + 1) * n + i + 1];
    out[0] = this.base + (a + (b - a) * fx) * (1 - fz) + (c + (e - c) * fx) * fz;
    out[1] = ((b - a) * (1 - fz) + (e - c) * fz) * sx;
    out[2] = ((c - a) * (1 - fx) + (e - b) * fx) * sz;
    return out;
  }
}

function boxBlur(src: Float32Array, w: number, h: number, radius: number) {
  const r = Math.max(1, Math.round(radius));
  let a = src.slice();
  let b = new Float32Array(src.length);
  // two passes of separable box ≈ a soft gaussian
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k;
          if (xx < 0 || xx >= w) continue;
          s += a[y * w + xx];
          n++;
        }
        b[y * w + x] = s / n;
      }
    }
    [a, b] = [b, a];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k;
          if (yy < 0 || yy >= h) continue;
          s += a[yy * w + x];
          n++;
        }
        b[y * w + x] = s / n;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Separable Catmull-Rom upsampling: (w, h) → ((w−1)·f+1, (h−1)·f+1). */
export function upsampleCatmullRom(src: Float32Array, w: number, h: number, f: number) {
  const nx = (w - 1) * f + 1;
  const ny = (h - 1) * f + 1;
  const at = (x: number, y: number) => src[Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)];
  const rowsUp = new Float32Array(nx * h);
  for (let y = 0; y < h; y++) {
    for (let X = 0; X < nx; X++) {
      const i = Math.floor(X / f);
      const t = X / f - i;
      rowsUp[y * nx + X] = catmull(at(i - 1, y), at(i, y), at(i + 1, y), at(i + 2, y), t);
    }
  }
  const atR = (x: number, y: number) => rowsUp[Math.min(Math.max(y, 0), h - 1) * nx + x];
  const data = new Float32Array(nx * ny);
  for (let Y = 0; Y < ny; Y++) {
    const j = Math.floor(Y / f);
    const t = Y / f - j;
    for (let X = 0; X < nx; X++) {
      data[Y * nx + X] = catmull(atR(X, j - 1), atR(X, j), atR(X, j + 1), atR(X, j + 2), t);
    }
  }
  return { data, nx, ny };
}

/** Plain gradient descent from (x, z) until it stops moving; used to polish grid minima. */
function polish(field: HeightField, x: number, z: number, b: Bounds) {
  const s = [0, 0, 0];
  let lr = 0.02;
  for (let i = 0; i < 600; i++) {
    field.sample(x, z, s);
    const nx = Math.min(Math.max(x - lr * s[1], b.x0), b.x1);
    const nz = Math.min(Math.max(z - lr * s[2], b.z0), b.z1);
    const nh = field.height(nx, nz);
    if (nh > s[0]) {
      lr *= 0.5;
      if (lr < 1e-6) break;
      continue;
    }
    if (Math.abs(nx - x) + Math.abs(nz - z) < 1e-7) break;
    x = nx;
    z = nz;
    lr = Math.min(lr * 1.2, 0.2);
  }
  return { x, z, h: field.height(x, z) };
}

/** Local minima inside `bounds` (grid search, then polished), deepest first. */
export function findMinima(field: HeightField, bounds: Bounds = field.bounds, res = 96, mergeDist = 0.2): Minimum[] {
  const nx = res;
  const nz = Math.max(8, Math.round((res * (bounds.z1 - bounds.z0)) / (bounds.x1 - bounds.x0)));
  const hs = new Float32Array((nx + 1) * (nz + 1));
  const X = (i: number) => bounds.x0 + ((bounds.x1 - bounds.x0) * i) / nx;
  const Z = (j: number) => bounds.z0 + ((bounds.z1 - bounds.z0) * j) / nz;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) hs[j * (nx + 1) + i] = field.height(X(i), Z(j));
  const found: Minimum[] = [];
  for (let j = 1; j < nz; j++) {
    for (let i = 1; i < nx; i++) {
      const v = hs[j * (nx + 1) + i];
      let lowest = true;
      for (let dj = -1; dj <= 1 && lowest; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          if (hs[(j + dj) * (nx + 1) + i + di] < v) {
            lowest = false;
            break;
          }
        }
      }
      if (!lowest) continue;
      const m = polish(field, X(i), Z(j), bounds);
      if (!found.some((f) => Math.hypot(f.x - m.x, f.z - m.z) < mergeDist)) found.push(m);
    }
  }
  return found.sort((a, b) => a.h - b.h);
}

export function globalMinimum(field: HeightField, bounds: Bounds = field.bounds): Minimum {
  return findMinima(field, bounds, 128)[0] ?? { x: 0, z: 0, h: field.height(0, 0) };
}

/** Min/max height over a bounds, by sampling. */
export function heightRange(field: HeightField, bounds: Bounds = field.bounds, res = 64): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j <= res; j++) {
    for (let i = 0; i <= res; i++) {
      const h = field.height(bounds.x0 + ((bounds.x1 - bounds.x0) * i) / res, bounds.z0 + ((bounds.z1 - bounds.z0) * j) / res);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  return [lo, hi];
}

/**
 * Where a ray meets the displaced surface y = yScale · h(x, z). March then bisect.
 * `origin` and `dir` are world-space [x, y, z]; returns null when the ray misses.
 */
export function intersectField(
  field: HeightField,
  origin: ArrayLike<number>,
  dir: ArrayLike<number>,
  { yScale = 1, tMax = 80, steps = 160 }: { yScale?: number; tMax?: number; steps?: number } = {},
) {
  const f = (t: number) => origin[1] + dir[1] * t - yScale * field.height(origin[0] + dir[0] * t, origin[2] + dir[2] * t);
  let t0 = 0;
  let f0 = f(0);
  if (f0 < 0) return null;
  const dt = tMax / steps;
  for (let k = 1; k <= steps; k++) {
    const t1 = k * dt;
    const f1 = f(t1);
    if (f1 <= 0) {
      let a = t0;
      let b = t1;
      for (let i = 0; i < 24; i++) {
        const m = (a + b) / 2;
        if (f(m) > 0) a = m;
        else b = m;
      }
      const t = (a + b) / 2;
      return { x: origin[0] + dir[0] * t, z: origin[2] + dir[2] * t, t };
    }
    t0 = t1;
    f0 = f1;
  }
  return null;
}
