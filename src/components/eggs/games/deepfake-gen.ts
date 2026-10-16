// "Spot the manipulated signal": procedural media panels and the synthetic artifacts planted in them.
// Everything here is generated on the fly; nothing comes from a real detector or real data.

import { gauss, hexToRgb, mulberry32, type Palette } from "./engine";

export const N = 256;
const SPAN_S = 2.4; // seconds shown by a spectrogram
const MAX_HZ = 11025;

export type Kind = "splice" | "vocoder" | "checker" | "noise" | "seam" | "clone" | "relight";
export const KINDS: Kind[] = ["splice", "vocoder", "checker", "noise", "seam", "clone", "relight"];

export type Mark =
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "vline"; x: number }
  | { kind: "band"; y0: number; y1: number };

export type Panel = { lum: Float32Array; marks: Mark[] };
export type Round = {
  kind: Kind;
  media: "image" | "audio";
  fake: 0 | 1;
  panels: [Panel, Panel];
  title: string;
  telltale: string;
  inset?: "spectrum" | "residual";
};

// ─── noise ───────────────────────────────────────────────────────

function hash2(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, s: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s);
  const b = hash2(ix + 1, iy, s);
  const c = hash2(ix, iy + 1, s);
  const d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, s: number, oct = 5) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise(x * f, y * f, s + i * 131);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return v / norm;
}

// ─── aerial frames (hillshaded terrain) ──────────────────────────

function terrain(seed: number) {
  const H = new Float32Array(N * N);
  const scale = 40 + (seed % 17);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) H[y * N + x] = fbm(x / scale, y / scale, seed) + 0.25 * fbm(x / 11, y / 11, seed + 7, 3);
  return H;
}

function shade(H: Float32Array, az: number, x: number, y: number) {
  const xl = Math.max(0, x - 1);
  const xr = Math.min(N - 1, x + 1);
  const yu = Math.max(0, y - 1);
  const yd = Math.min(N - 1, y + 1);
  const K = 34;
  const dzdx = (H[y * N + xr] - H[y * N + xl]) * K;
  const dzdy = (H[yd * N + x] - H[yu * N + x]) * K;
  // light from azimuth `az` (radians, image coords) at 45° altitude
  const lx = Math.cos(az) * 0.7;
  const ly = Math.sin(az) * 0.7;
  const lz = 0.72;
  const len = Math.hypot(dzdx, dzdy, 1);
  const s = (-dzdx * lx - dzdy * ly + lz) / len;
  return Math.max(0, s);
}

const NW = Math.atan2(-1, -1); // light from the upper left

function hillshade(H: Float32Array, az = NW) {
  const L = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      L[i] = 0.08 + 0.78 * shade(H, az, x, y) + 0.1 * (H[i] - 0.5);
    }
  return L;
}

function blur3(L: Float32Array) {
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          s += L[yy * N + xx];
          n++;
        }
      out[y * N + x] = s / n;
    }
  return out;
}

function addGrain(L: Float32Array, rnd: () => number, sigma: number, mask?: (x: number, y: number) => number) {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = mask ? mask(x, y) : 1;
      L[y * N + x] += gauss(rnd) * sigma * k;
    }
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const GRAIN = 0.03;

function aerial(seed: number, kind: Kind | null, strength: number): Panel {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const H = terrain(seed);
  const L = hillshade(H);
  const marks: Mark[] = [];
  const at = (m: number) => m + rnd() * (N - 2 * m);

  if (kind === "seam") {
    const cx = at(70);
    const cy = at(70);
    const r = 46 + rnd() * 14;
    const other = hillshade(terrain(seed + 9001));
    const shift = 0.05 + 0.06 * strength;
    const contrast = 1 + 0.18 * strength;
    const blurred = blur3(L);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const d = Math.hypot(x - cx, y - cy);
        const m = 1 - smooth(r - 3, r + 1, d);
        if (m > 0) L[i] = L[i] * (1 - m) + ((other[i] - 0.45) * contrast + 0.45 + shift) * m;
        if (Math.abs(d - r) < 2.5) L[i] = blurred[i] * 0.5 + L[i] * 0.5 + shift * 0.4 * strength;
      }
    marks.push({ kind: "circle", x: cx, y: cy, r: r + 4 });
    addGrain(L, rnd, GRAIN);
  } else if (kind === "relight") {
    const cx = at(72);
    const cy = at(72);
    const r = 52 + rnd() * 12;
    const flipped = hillshade(H, NW + Math.PI * (0.62 + 0.38 * strength));
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const m = 1 - smooth(r - 6, r, Math.hypot(x - cx, y - cy));
        if (m > 0) L[i] = L[i] * (1 - m) + flipped[i] * m;
      }
    marks.push({ kind: "circle", x: cx, y: cy, r: r + 4 });
    addGrain(L, rnd, GRAIN);
  } else if (kind === "noise") {
    const w = 70 + rnd() * 26;
    const h = 64 + rnd() * 26;
    const x0 = rnd() * (N - w - 16) + 8;
    const y0 = rnd() * (N - h - 16) + 8;
    const inside = (x: number, y: number) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
    const blurred = blur3(L);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inside(x, y)) L[y * N + x] = blurred[y * N + x];
    addGrain(L, rnd, GRAIN, (x, y) => (inside(x, y) ? 1 - 0.88 * strength : 1));
    marks.push({ kind: "rect", x: x0, y: y0, w, h });
  } else {
    addGrain(L, rnd, GRAIN);
  }

  if (kind === "clone") {
    const P = Math.round(40 + 16 * strength);
    let sx = 0;
    let sy = 0;
    let dx = 0;
    let dy = 0;
    for (let k = 0; k < 40; k++) {
      sx = Math.floor(rnd() * (N - P - 8)) + 4;
      sy = Math.floor(rnd() * (N - P - 8)) + 4;
      dx = Math.floor(rnd() * (N - P - 8)) + 4;
      dy = Math.floor(rnd() * (N - P - 8)) + 4;
      if (Math.abs(sx - dx) > P + 24 || Math.abs(sy - dy) > P + 24) break;
    }
    for (let y = 0; y < P; y++)
      for (let x = 0; x < P; x++) L[(dy + y) * N + dx + x] = L[(sy + y) * N + sx + x];
    marks.push({ kind: "rect", x: sx, y: sy, w: P, h: P }, { kind: "rect", x: dx, y: dy, w: P, h: P });
  }

  if (kind === "checker") {
    const amp = 0.012 + 0.03 * strength;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) L[y * N + x] += (((x >> 1) & 1) ^ ((y >> 1) & 1) ? 1 : -1) * amp;
  }

  for (let i = 0; i < L.length; i++) L[i] = Math.max(0, Math.min(1, L[i]));
  return { lum: L, marks };
}

// ─── voice intercepts (spectrograms) ─────────────────────────────

type Voice = { f0: number; formants: [number, number, number]; floorDb: number };

function voice(rnd: () => number): Voice {
  return {
    f0: 105 + rnd() * 110,
    formants: [380 + rnd() * 340, 1100 + rnd() * 900, 2400 + rnd() * 700],
    floorDb: -54 + rnd() * 4,
  };
}

function spectro(seed: number, kind: Kind | null, strength: number): Panel {
  const rnd = mulberry32(seed ^ 0x51ed27);
  const P = new Float64Array(N * N); // [t * N + f]
  const binHz = MAX_HZ / N;
  const marks: Mark[] = [];
  const a = voice(rnd);
  let b = a;
  const splitAt = kind === "splice" ? Math.round(N * (0.36 + rnd() * 0.28)) : -1;
  if (kind === "splice") {
    const up = rnd() < 0.5 ? 1 : -1;
    b = {
      f0: a.f0 * (1 + up * (0.22 + 0.2 * strength)),
      formants: a.formants.map((f) => f * (1 + up * 0.1 * strength)) as [number, number, number],
      floorDb: a.floorDb + (up > 0 ? 1 : -1) * (2 + 5 * strength),
    };
  }

  // noise floor with a slow breath
  const breath = rnd() * 6;
  for (let t = 0; t < N; t++) {
    const v = t < splitAt || splitAt < 0 ? a : b;
    const floor = v.floorDb + 2 * Math.sin(t / 19 + breath);
    for (let f = 0; f < N; f++) {
      const tilt = -6 * (f / N);
      P[t * N + f] = 10 ** ((floor + tilt + gauss(rnd) * 2.2) / 10);
    }
  }

  // syllables: voiced harmonic stacks shaped by formants, fricatives as high-band noise
  let t = 4 + Math.floor(rnd() * 8);
  while (t < N - 8) {
    const voiced = rnd() < 0.72;
    const dur = Math.floor(voiced ? 16 + rnd() * 30 : 8 + rnd() * 12);
    const t0 = t;
    const t1 = Math.min(N - 2, t + dur);
    const glide = 0.85 + rnd() * 0.3;
    const fshift = 0.85 + rnd() * 0.3;
    for (let tt = t0; tt <= t1; tt++) {
      const v = tt < splitAt || splitAt < 0 ? a : b;
      const u = (tt - t0) / Math.max(1, t1 - t0);
      const env = Math.sin(Math.PI * u) ** 0.6;
      if (voiced) {
        const f0 = v.f0 * (1 + (glide - 1) * u) * (1 + 0.025 * Math.sin(tt * 0.9));
        for (let h = 1; h * f0 < MAX_HZ; h++) {
          const fh = h * f0;
          let fe = 0.012;
          v.formants.forEach((F, k) => {
            const bw = [110, 150, 210][k];
            fe += [1, 0.6, 0.3][k] * Math.exp(-((fh - F * fshift) ** 2) / (2 * bw * bw));
          });
          const A = env * fe * 0.05 * h ** -0.55;
          const bin = fh / binHz;
          for (let k = Math.max(0, Math.floor(bin - 3)); k <= Math.min(N - 1, Math.ceil(bin + 3)); k++)
            P[tt * N + k] += A * Math.exp(-((k - bin) ** 2) / (2 * 0.8 * 0.8));
        }
      } else {
        for (let k = Math.floor(3500 / binHz); k < N; k++) P[tt * N + k] += env * 0.0009 * (k / N) * (0.4 + rnd());
      }
    }
    t = t1 + 3 + Math.floor(rnd() * 10);
  }

  if (kind === "splice") {
    for (let f = 0; f < N; f++) P[splitAt * N + f] += 10 ** ((-44 + 12 * strength) / 10) * (0.6 + rnd() * 0.8);
    marks.push({ kind: "vline", x: splitAt + 0.5 });
  }
  if (kind === "vocoder") {
    const cutHz = 7000 + (1 - strength) * 2500 + rnd() * 600;
    const cut = Math.round(cutHz / binHz);
    const att = 10 ** ((-26 * strength - 8) / 10);
    for (let tt = 0; tt < N; tt++) for (let f = cut; f < N; f++) P[tt * N + f] *= att;
    marks.push({ kind: "band", y0: 0, y1: N - cut });
  }

  const L = new Float32Array(N * N);
  for (let tt = 0; tt < N; tt++)
    for (let f = 0; f < N; f++) {
      const db = 10 * Math.log10(P[tt * N + f] + 1e-14);
      const v = Math.max(0, Math.min(1, (db + 66) / 58));
      L[(N - 1 - f) * N + tt] = v ** 1.15;
    }
  return { lum: L, marks };
}

// ─── rounds ──────────────────────────────────────────────────────

const COPY: Record<Kind, { title: string; telltale: (p: Panel) => string; media: "image" | "audio"; inset?: Round["inset"] }> = {
  splice: {
    media: "audio",
    title: "Splice seam",
    telltale: (p) => {
      const m = p.marks.find((k) => k.kind === "vline") as { x: number } | undefined;
      const s = m ? ((m.x / N) * SPAN_S).toFixed(2) : "?";
      return `At ${s} s the pitch, the formants and the noise floor all jump at once, with a vertical click where two recordings meet. Real speech glides between sounds; it doesn't teleport.`;
    },
  },
  vocoder: {
    media: "audio",
    title: "Vocoder band limit",
    telltale: (p) => {
      const m = p.marks.find((k) => k.kind === "band") as { y1: number } | undefined;
      const khz = m ? (((N - m.y1) / N) * (MAX_HZ / 1000)).toFixed(1) : "8";
      return `Everything above about ${khz} kHz is missing, even under the hissy consonants. A neural vocoder running at a low sample rate made this voice; a real microphone records air all the way to the top of the band.`;
    },
  },
  checker: {
    media: "image",
    inset: "spectrum",
    title: "Upsampling checkerboard",
    telltale: () =>
      "A faint, perfectly periodic grid sits over the whole frame. Transposed-convolution upsampling in image generators leaves it behind; in the frequency spectrum it shows up as bright off-centre peaks that natural terrain never has.",
  },
  noise: {
    media: "image",
    inset: "residual",
    title: "Noise mismatch",
    telltale: () =>
      "One rectangle is cleaner than everything around it. Every camera sensor leaves grain; a generated or inpainted patch rarely matches it. Subtract a blurred copy and the residual shows the patch as a flat, quiet hole.",
  },
  seam: {
    media: "image",
    title: "Blending seam",
    telltale: () =>
      "A soft ring where a pasted region was feathered in: tone, contrast and sharpness change across it and the ridgelines stop at the edge. Face-swap pipelines leave exactly this boundary around the face.",
  },
  clone: {
    media: "image",
    title: "Copy–move clone",
    telltale: () =>
      "Two patches are identical, grain and all. Natural terrain never repeats pixel for pixel, so a detector that matches blocks against each other catches it instantly.",
  },
  relight: {
    media: "image",
    title: "Lighting mismatch",
    telltale: () =>
      "The frame is lit from the north-west except one patch lit from the other side, so its hills read as hollows. Composites rarely get the light direction right.",
  },
};

export function makeRound(kind: Kind, strength: number, seed: number): Round {
  const fake: 0 | 1 = mulberry32(seed)() < 0.5 ? 0 : 1;
  const copy = COPY[kind];
  const gen = copy.media === "audio" ? spectro : aerial;
  const pa = gen(seed * 7 + 11, fake === 0 ? kind : null, strength);
  const pb = gen(seed * 13 + 29, fake === 1 ? kind : null, strength);
  const fakePanel = fake === 0 ? pa : pb;
  return {
    kind,
    media: copy.media,
    fake,
    panels: [pa, pb],
    title: copy.title,
    telltale: copy.telltale(fakePanel),
    inset: copy.inset,
  };
}

/** Ten rounds: every artifact once, then three more, getting subtler. */
export function planRounds(seed: number) {
  const rnd = mulberry32(seed);
  const order = [...KINDS].sort(() => rnd() - 0.5);
  while (order.length < 10) order.push(KINDS[Math.floor(rnd() * KINDS.length)]);
  return order.map((kind, i) => ({ kind, strength: 1 - (i / 9) * 0.45, seed: (seed + i * 7919) >>> 0 }));
}

// ─── analysis views for the reveal ───────────────────────────────

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const xr = re[i + k + half] * cr - im[i + k + half] * ci;
        const xi = re[i + k + half] * ci + im[i + k + half] * cr;
        re[i + k + half] = re[i + k] - xr;
        im[i + k + half] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Log-magnitude 2D spectrum, centred (Hann-windowed). */
export function spectrumOf(L: Float32Array) {
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  let mean = 0;
  for (let i = 0; i < L.length; i++) mean += L[i];
  mean /= L.length;
  const hann = (k: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (N - 1));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) re[y * N + x] = (L[y * N + x] - mean) * hann(x) * hann(y);
  const rr = new Float64Array(N);
  const ri = new Float64Array(N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      rr[x] = re[y * N + x];
      ri[x] = im[y * N + x];
    }
    fft(rr, ri);
    for (let x = 0; x < N; x++) {
      re[y * N + x] = rr[x];
      im[y * N + x] = ri[x];
    }
  }
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      rr[y] = re[y * N + x];
      ri[y] = im[y * N + x];
    }
    fft(rr, ri);
    for (let y = 0; y < N; y++) {
      re[y * N + x] = rr[y];
      im[y * N + x] = ri[y];
    }
  }
  const out = new Float32Array(N * N);
  let max = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const sx = (x + N / 2) % N;
      const sy = (y + N / 2) % N;
      const m = Math.log1p(Math.hypot(re[sy * N + sx], im[sy * N + sx]));
      out[y * N + x] = m;
      if (m > max) max = m;
    }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, (out[i] / max - 0.25) / 0.75) ** 1.6;
  return out;
}

/** High-pass residual: the sensor grain left after subtracting a blurred copy. */
export function residualOf(L: Float32Array) {
  const b = blur3(L);
  const out = new Float32Array(N * N);
  for (let i = 0; i < L.length; i++) out[i] = Math.min(1, Math.abs(L[i] - b[i]) * 14);
  return out;
}

// ─── colour ──────────────────────────────────────────────────────

/** 256-step lookup along the sheet's z0→z10 ramp. */
export function rampLut(p: Palette) {
  const stops = [p.z0, p.z1, p.z2, p.z3, p.z4, p.z5, p.z6, p.z7, p.z8, p.z9, p.z10].map(hexToRgb);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const f = (i / 255) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(f));
    const u = f - k;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * u;
  }
  return lut;
}

export function paint(canvas: HTMLCanvasElement, L: Float32Array, lut: Uint8ClampedArray) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < L.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(L[i] * 255)));
    img.data[i * 4] = lut[v * 3];
    img.data[i * 4 + 1] = lut[v * 3 + 1];
    img.data[i * 4 + 2] = lut[v * 3 + 2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export const SPECTRO_SPAN_S = SPAN_S;
export const SPECTRO_MAX_KHZ = MAX_HZ / 1000;
