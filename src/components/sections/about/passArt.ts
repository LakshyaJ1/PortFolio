"use client";

// Procedural artwork for the field pass: front face, back face and the survey-tape strap.
// The same drawing feeds the WebGL lanyard (as textures) and the static fallback card,
// so both always show identical faces. Text is drawn only after the site fonts are ready.
// Faces are laid out in art units (ART_W × ART_H) but rasterised at whatever size they are
// shown at, so the canvas sets the type at its real pixel size instead of a GPU mip shrinking it.

import { heroBustSrc } from "@/components/intro/manifest";
import { EDUCATION, EXPERIENCE, PROFILE } from "@/content/profile";

export const ART_W = 1024;
export const ART_H = 1440;
export const STRAP_TEXT = "LAKSHYA JAIN · AI ENGINEER · ";
// The ribbon reads top-down toward the card and its texture starts at the card end,
// so the tile is drawn rotated: the name lands just above the clip.
const STRAP_TILE = "AI ENGINEER · LAKSHYA JAIN · ";

const mait = EDUCATION.find((e) => e.id === "mait") ?? EDUCATION[0];

/** "28.6139" → "28°36′" (degrees + whole minutes, the way a field pass would print it) */
function dm(value: number, pos: string, neg: string) {
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  return `${d}°${String(m).padStart(2, "0")}′${value >= 0 ? pos : neg}`;
}

/** Everything printed on the pass. Also read by the screen-reader description. */
export const PASS_COPY = {
  band: "FIELD PASS · SURVEY CREW",
  name: PROFILE.name,
  role: PROFILE.role,
  deva: "लक्ष्य",
  devaGloss: "Sanskrit for target",
  // the third field says how a value is set: "data" (id, coordinates, dates) in mono, "text" in Archivo
  rows: [
    ["ID", `LJ-${mait.end}`, "data"],
    ["Dept.", "AI / ML", "text"],
    ["Base", `${dm(PROFILE.home.lat, "N", "S")} ${dm(PROFILE.home.lng, "E", "W")}`, "data"],
    ["Valid till", mait.end, "data"],
  ] as [string, string, "data" | "text"][],
  backTitle: "What I am",
  backLines: [
    `${EXPERIENCE.find((e) => e.id === "hivepro")?.role ?? "AI Engineer Intern"} at Hive Pro, building human-in-the-loop agent platforms`,
    `B.Tech CSE (AI/ML) · ${mait.score} · MAIT ’${mait.end.slice(2)}`,
    "SETU: a 207 KB on-device model for GPS-denied navigation",
    "Amazon ML Challenge: top 20% on the global leaderboard",
    "Mentor to 250+ students in robotics and computer vision",
  ],
  found: "If found, say hello",
  email: PROFILE.email,
};

export type PassFaces = { front: HTMLCanvasElement; back: HTMLCanvasElement };

export type PassArt = {
  /** both faces drawn at `scale` canvas pixels per art unit (1 → ART_W × ART_H); cached per scale */
  faces: (scale: number) => PassFaces;
  strap: HTMLCanvasElement;
  /** strap tile size, for keeping glyph proportions on the ribbon */
  strapAspect: number;
  hasPortrait: boolean;
};

/** Snap a face scale to 1/40 steps so small resizes reuse the cached drawing. */
export function faceScale(devicePxTall: number) {
  return Math.min(2, Math.max(0.25, Math.round((devicePxTall / ART_H) * 40) / 40));
}

// ─── tokens & fonts ───────────────────────────────────────────

type Tones = Record<"z0" | "z1" | "z2" | "z4" | "z5" | "z6" | "z7" | "z8" | "z9" | "z10" | "fix", string>;
const FALLBACK_TONES: Tones = {
  z0: "#060907",
  z1: "#0b100d",
  z2: "#111814",
  z4: "#212c26",
  z5: "#2f3c35",
  z6: "#46554c",
  z7: "#6f7f75",
  z8: "#9eaba2",
  z9: "#cfd8d1",
  z10: "#eef2ec",
  fix: "#ff5b23",
};

function readTones(): Tones {
  const cs = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK_TONES };
  (Object.keys(FALLBACK_TONES) as (keyof Tones)[]).forEach((k) => {
    const v = cs.getPropertyValue(`--${k}`).trim();
    if (v) out[k] = v;
  });
  return out;
}

type Fonts = { display: string; mono: string; kalam: string; deva: string };

function readFonts(): Fonts {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => {
    const raw = cs.getPropertyValue(name).trim();
    return raw ? `${raw}, ${fallback}` : fallback;
  };
  return {
    display: v("--font-archivo", "Archivo, system-ui, sans-serif"),
    mono: v("--font-martian", "ui-monospace, monospace"),
    kalam: v("--font-kalam", "cursive"),
    deva: v("--font-noto-deva", "sans-serif"),
  };
}

async function ensureFonts(f: Fonts) {
  try {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load(`700 64px ${f.display}`),
      document.fonts.load(`500 64px ${f.display}`),
      document.fonts.load(`500 32px ${f.mono}`),
      document.fonts.load(`400 48px ${f.kalam}`),
      document.fonts.load(`600 40px ${f.deva}`, PASS_COPY.deva),
    ]);
  } catch {
    /* draw with whatever is available */
  }
}

async function loadPortrait(): Promise<HTMLImageElement | null> {
  // The bust only exists once the real intro clips have been built; the v2 manifest names it,
  // and placeholder mode (the v0 stub) returns null, so a missing image is never requested.
  const src = await heroBustSrc();
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ─── canvas helpers ──────────────────────────────────────────

type Stretch = "condensed" | "semi-condensed" | "normal" | "semi-expanded" | "expanded";
type Ctx = CanvasRenderingContext2D & { letterSpacing?: string; fontStretch?: string };

function setFont(
  ctx: Ctx,
  family: string,
  size: number,
  { weight = 400, stretch = "normal", italic = false, tracking = 0 }: { weight?: number; stretch?: Stretch; italic?: boolean; tracking?: number } = {},
) {
  ctx.font = `${italic ? "italic " : ""}${weight} ${size}px ${family}`;
  if ("fontStretch" in ctx) ctx.fontStretch = stretch;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking}px`;
}

/** Shrink the font until `text` fits `maxW`. Returns the size used. */
function fitFont(
  ctx: Ctx,
  text: string,
  maxW: number,
  family: string,
  size: number,
  opts: Parameters<typeof setFont>[3] = {},
  min = 12,
) {
  let s = size;
  setFont(ctx, family, s, opts);
  while (ctx.measureText(text).width > maxW && s > min) {
    s -= 1;
    setFont(ctx, family, s, opts);
  }
  return s;
}

function wrap(ctx: Ctx, text: string, maxW: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Trig-point symbol: triangle with a centre dot. (cx, cy) is the centroid. */
function trig(ctx: Ctx, cx: number, cy: number, side: number, ink: string, fill?: string, line = 3) {
  const h = (side * Math.sqrt(3)) / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - (2 * h) / 3);
  ctx.lineTo(cx + side / 2, cy + h / 3);
  ctx.lineTo(cx - side / 2, cy + h / 3);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.lineWidth = line;
  ctx.lineJoin = "round";
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, side * 0.09), 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The sheet-edge ruler: a hairline with ticks every 32px and index ticks every 160px. */
function ruler(ctx: Ctx, y: number, x0: number, x1: number, ink: string) {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  for (let x = x0, i = 0; x <= x1 + 0.5; x += 32, i++) {
    const tall = i % 5 === 0;
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - (tall ? 18 : 9));
  }
  ctx.stroke();
}

/** Slot punched for the strap clip. */
function slot(ctx: Ctx, t: Tones) {
  rrect(ctx, ART_W / 2 - 78, 30, 156, 30, 15);
  ctx.fillStyle = t.z5;
  ctx.fill();
}

// ─── contour portrait (used until the real portrait asset exists) ───

function contourBust(ctx: Ctx, x0: number, y0: number, w: number, h: number, t: Tones, f: Fonts) {
  const nx = 112;
  const ny = 140;
  const g = (u: number, v: number, cx: number, cy: number, sx: number, sy: number) =>
    Math.exp(-(((u - cx) ** 2) / (2 * sx * sx) + ((v - cy) ** 2) / (2 * sy * sy)));
  const field = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const v = j / ny;
      field[j * (nx + 1) + i] =
        g(u, v, 0.5, 0.36, 0.165, 0.175) +
        0.28 * g(u, v, 0.5, 0.62, 0.085, 0.08) +
        1.0 * g(u, v, 0.5, 1.06, 0.46, 0.22) +
        0.03 * Math.sin(u * 17 + v * 6) * Math.sin(v * 13 - u * 5);
    }
  }
  const at = (i: number, j: number) => field[j * (nx + 1) + i];
  const px = (gx: number) => x0 + (gx / nx) * w;
  const py = (gy: number) => y0 + (gy / ny) * h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.lineCap = "round";
  for (let k = 1; k <= 10; k++) {
    const L = k * 0.09;
    const index = k % 3 === 0;
    ctx.beginPath();
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i + 1, j + 1);
        const d = at(i, j + 1);
        const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const top: [number, number] = [i + (L - a) / (b - a), j];
        const right: [number, number] = [i + 1, j + (L - b) / (c - b)];
        const bottom: [number, number] = [i + (L - d) / (c - d), j + 1];
        const left: [number, number] = [i, j + (L - a) / (d - a)];
        const seg = (p: [number, number], q: [number, number]) => {
          ctx.moveTo(px(p[0]), py(p[1]));
          ctx.lineTo(px(q[0]), py(q[1]));
        };
        switch (idx) {
          case 1: case 14: seg(left, bottom); break;
          case 2: case 13: seg(bottom, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(top, right); break;
          case 5: seg(top, right); seg(left, bottom); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, top); break;
          case 10: seg(left, top); seg(bottom, right); break;
        }
      }
    }
    ctx.strokeStyle = index ? t.z4 : t.z6;
    ctx.lineWidth = index ? 5.5 : 3.2;
    ctx.stroke();
  }
  ctx.restore();

  // the summit is a trig point
  const sx = x0 + w * 0.5;
  const sy = y0 + h * 0.36;
  trig(ctx, sx, sy, 48, t.z1, t.z10, 5);
  setFont(ctx, f.display, 34, { weight: 700, stretch: "semi-expanded", tracking: 2 });
  ctx.fillStyle = t.z1;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("LJ", sx + 36, sy - 6);
}

function portraitFrame(ctx: Ctx, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, t: Tones, f: Fonts) {
  ctx.fillStyle = t.z10;
  ctx.fillRect(x, y, w, h);
  if (img) {
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    contourBust(ctx, x, y, w, h, t, f);
  }
  ctx.strokeStyle = t.z1;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  // registration ticks at the corners, like a sheet's neat line
  ctx.lineWidth = 3;
  const o = 14;
  const L = 22;
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ] as const) {
    ctx.moveTo(cx + dx * o, cy);
    ctx.lineTo(cx + dx * (o + L), cy);
    ctx.moveTo(cx, cy + dy * o);
    ctx.lineTo(cx, cy + dy * (o + L));
  }
  ctx.stroke();
}

// ─── faces ───────────────────────────────────────────────────

function drawFront(ctx: Ctx, t: Tones, f: Fonts, img: HTMLImageElement | null) {
  const W = ART_W;
  const H = ART_H;
  const M = 72;
  ctx.fillStyle = t.z10;
  ctx.fillRect(0, 0, W, H);
  slot(ctx, t);

  // top band
  ctx.fillStyle = t.z1;
  ctx.fillRect(0, 96, W, 112);
  ctx.fillStyle = t.fix;
  ctx.fillRect(0, 208, W, 8);
  ctx.fillStyle = t.z10;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont(ctx, PASS_COPY.band, W - M * 2, f.display, 44, { weight: 650, stretch: "expanded", tracking: 9 });
  ctx.fillText(PASS_COPY.band, W / 2 + 4, 154);

  // portrait
  portraitFrame(ctx, img, M, 268, 392, 490, t, f);

  // name block
  const cx = 512;
  const cw = W - M - cx;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = t.z0;
  const [first, ...rest] = PASS_COPY.name.toUpperCase().split(" ");
  const last = rest.join(" ");
  const size = Math.min(
    fitFont(ctx, first, cw, f.display, 96, { weight: 750, stretch: "expanded", tracking: 2 }),
    fitFont(ctx, last, cw, f.display, 96, { weight: 750, stretch: "expanded", tracking: 2 }),
  );
  setFont(ctx, f.display, size, { weight: 750, stretch: "expanded", tracking: 2 });
  ctx.fillText(first, cx, 268 + size * 0.78);
  ctx.fillText(last, cx, 268 + size * 1.78);

  ctx.fillStyle = t.z1;
  fitFont(ctx, PASS_COPY.role, cw, f.display, 60, { weight: 600, stretch: "normal" });
  ctx.fillText(PASS_COPY.role, cx, 268 + size * 1.78 + 80);

  // name meaning
  ctx.fillStyle = t.z1;
  setFont(ctx, f.deva, 72, { weight: 600 });
  ctx.fillText(PASS_COPY.deva, cx, 648);
  ctx.fillStyle = t.z4;
  fitFont(ctx, PASS_COPY.devaGloss, cw, f.display, 46, { weight: 500, stretch: "normal", italic: true });
  ctx.fillText(PASS_COPY.devaGloss, cx, 704);
  // a short fix tick under the gloss
  ctx.fillStyle = t.fix;
  ctx.fillRect(cx, 730, 72, 8);

  // data rows: 2 × 2
  const top = 800;
  const rowH = 154;
  ctx.strokeStyle = t.z8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let r = 0; r <= 2; r++) {
    ctx.moveTo(M, top + r * rowH);
    ctx.lineTo(W - M, top + r * rowH);
  }
  ctx.moveTo(W / 2, top + 18);
  ctx.lineTo(W / 2, top + rowH * 2 - 18);
  ctx.stroke();
  PASS_COPY.rows.forEach(([label, value, kind], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col === 0 ? M : W / 2 + 32;
    const maxW = W / 2 - M - 32;
    const y = top + row * rowH;
    ctx.fillStyle = t.z5;
    setFont(ctx, f.display, 40, { weight: 700, stretch: "semi-condensed", tracking: 4 });
    ctx.fillText(label.toUpperCase(), x, y + 56);
    ctx.fillStyle = t.z0;
    if (kind === "data") fitFont(ctx, value, maxW, f.mono, 54, { weight: 600 });
    else fitFont(ctx, value, maxW, f.display, 60, { weight: 650, stretch: "normal" });
    ctx.fillText(value, x, y + 126);
  });

  // barcode
  const by = 1140;
  const bh = 104;
  const rand = mulberry32(2027 * 7919);
  ctx.fillStyle = t.z1;
  let x = M;
  while (x < W - M - 8) {
    const bw = 3 + Math.floor(rand() * 4) * 3;
    if (x + bw > W - M) break;
    ctx.fillRect(x, by, bw, bh);
    x += bw + 3 + Math.floor(rand() * 3) * 3;
  }
  const code = `${PASS_COPY.rows[0][1]} · ${PROFILE.home.lat.toFixed(4)}N ${PROFILE.home.lng.toFixed(4)}E`;
  ctx.fillStyle = t.z5;
  ctx.textAlign = "left";
  fitFont(ctx, code, W - M * 2, f.mono, 32, { weight: 500, tracking: 2 });
  ctx.fillText(code, M, by + bh + 44);

  ruler(ctx, H - 34, M, W - M, t.z7);
  ctx.fillStyle = t.z6;
  setFont(ctx, f.mono, 30, { weight: 600, tracking: 3 });
  ctx.textAlign = "right";
  ctx.fillText("B2", W - M, H - 52);
}

function drawBack(ctx: Ctx, t: Tones, f: Fonts) {
  const W = ART_W;
  const H = ART_H;
  const M = 72;
  ctx.fillStyle = t.z10;
  ctx.fillRect(0, 0, W, H);
  slot(ctx, t);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = t.z0;
  setFont(ctx, f.display, 88, { weight: 650, stretch: "normal", tracking: -1 });
  ctx.fillText(PASS_COPY.backTitle, M, 196);
  ctx.fillStyle = t.z1;
  ctx.fillRect(M, 236, W - M * 2, 3);
  ctx.fillStyle = t.fix;
  ctx.fillRect(M, 232, 96, 8);

  // the list, set as large as still clears the return note
  const textX = M + 60;
  const maxW = W - M - textX;
  const listTop = 324;
  const lay = (size: number) => {
    setFont(ctx, f.display, size, { weight: 540, stretch: "normal" });
    const lh = Math.round(size * 1.27);
    const blocks = PASS_COPY.backLines.map((l) => wrap(ctx, l, maxW));
    const end = listTop + blocks.reduce((sum, ls) => sum + ls.length * lh + 30, 0);
    return { size, lh, blocks, end };
  };
  let list = lay(50);
  while (list.end > 1090 && list.size > 38) list = lay(list.size - 2);
  let y = listTop;
  for (const lines of list.blocks) {
    trig(ctx, M + 18, y - list.size * 0.33, list.size * 0.7, t.z1, undefined, 4);
    ctx.fillStyle = t.z0;
    lines.forEach((l, i) => ctx.fillText(l, textX, y + i * list.lh));
    y += lines.length * list.lh + 30;
  }

  // the handwritten return note
  const ny = Math.max(y + 40, 1150);
  ctx.strokeStyle = t.z8;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(M, ny - 70);
  ctx.lineTo(W - M, ny - 70);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = t.z1;
  setFont(ctx, f.kalam, 64, { weight: 400 });
  ctx.fillText(PASS_COPY.found, M, ny + 4);
  ctx.fillStyle = t.z0;
  fitFont(ctx, PASS_COPY.email, W - M * 2, f.display, 52, { weight: 600, stretch: "normal" });
  ctx.fillText(PASS_COPY.email, M, ny + 82);
  const ew = Math.min(ctx.measureText(PASS_COPY.email).width, W - M * 2);
  ctx.fillStyle = t.fix;
  ctx.fillRect(M, ny + 98, ew, 5);

  ruler(ctx, H - 34, M, W - M, t.z7);
}

function drawStrap(t: Tones, f: Fonts) {
  const h = 128;
  const probe = document.createElement("canvas").getContext("2d") as Ctx;
  setFont(probe, f.display, 46, { weight: 750, stretch: "semi-expanded", tracking: 7 });
  const w = Math.max(256, Math.ceil(probe.measureText(STRAP_TILE).width));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d") as Ctx;
  ctx.fillStyle = t.fix;
  ctx.fillRect(0, 0, w, h);
  // woven edges
  ctx.fillStyle = t.z0;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(0, 0, w, 7);
  ctx.fillRect(0, h - 7, w, 7);
  ctx.globalAlpha = 0.3;
  for (let x = 0; x < w; x += 12) {
    ctx.fillRect(x, 13, 6, 2);
    ctx.fillRect(x, h - 15, 6, 2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = t.z0;
  setFont(ctx, f.display, 46, { weight: 750, stretch: "semi-expanded", tracking: 7 });
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(STRAP_TILE, 0, h / 2 + 3);
  return { canvas: c, aspect: w / h };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Draw every face of the pass. Resolves once fonts (and the portrait, if any) are in. */
export async function buildPassArt(): Promise<PassArt> {
  const fonts = readFonts();
  const [img] = await Promise.all([loadPortrait(), ensureFonts(fonts)]);
  const tones = readTones();
  const cache = new Map<number, PassFaces>();
  const faces = (scale: number) => {
    const key = Math.round(scale * 1000) / 1000;
    let hit = cache.get(key);
    if (!hit) {
      const w = Math.max(1, Math.round(ART_W * key));
      const h = Math.max(1, Math.round(ART_H * key));
      const front = canvas(w, h);
      const back = canvas(w, h);
      const fc = front.getContext("2d") as Ctx;
      const bc = back.getContext("2d") as Ctx;
      // lay out in art units, rasterise at the requested size
      fc.scale(w / ART_W, h / ART_H);
      bc.scale(w / ART_W, h / ART_H);
      drawFront(fc, tones, fonts, img);
      drawBack(bc, tones, fonts);
      hit = { front, back };
      cache.set(key, hit);
      // a stage resize or two at most: drop the oldest drawing beyond that
      if (cache.size > 3) cache.delete(cache.keys().next().value as number);
    }
    return hit;
  };
  const strap = drawStrap(tones, fonts);
  return { faces, strap: strap.canvas, strapAspect: strap.aspect, hasPortrait: Boolean(img) };
}
