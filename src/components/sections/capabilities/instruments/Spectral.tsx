"use client";

import { useEffect, useRef, useState } from "react";
import { Frame } from "./Frame";
import { Glyph } from "../glyphs";
import { alpha, monoFont, readPalette, sansFont } from "../kit/palette";
import { gauss, rng, useCanvas, useLoop, useStill, type CanvasBox } from "../kit/loop";
import s from "./instruments.module.css";

// SETU's spectral velocity odometry: wheel rotation shows up as a line in the
// spectrum of the phone's accelerometer vibration. Track it, and speed falls out
// (v = 2πr·f) without double-integrating acceleration. The signal here is synthetic;
// the FFT, the band-limited peak tracker and the conversion run live.

const FS = 200; // Hz
const N = 256; // FFT window
const RES = FS / N; // Hz per bin
const SHOW_BINS = 48; // 0 – 37.5 Hz
const WHEEL_R = 0.31; // m (assumed tyre radius)
const BAND: [number, number] = [2, 20];
const HIST = 120; // speed history samples @ 10 Hz = 12 s

const trueSpeed = (t: number) => 11.5 + 4.5 * Math.sin(0.19 * t) + 2 * Math.sin(0.47 * t + 1.3); // m/s

function fftMag(re: Float64Array, im: Float64Array, out: Float64Array) {
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
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  for (let k = 0; k < out.length; k++) out[k] = Math.hypot(re[k], im[k]) / (n / 4);
}

class SpectralRun {
  st = {
    t: 0,
    acc: 0,
    phW: 0,
    phE: 0,
    phS: 0,
    buf: new Float64Array(512),
    head: 0,
    re: new Float64Array(N),
    im: new Float64Array(N),
    mag: new Float64Array(N / 2),
    peakBin: 0,
    fhat: 6,
    histT: new Float64Array(HIST),
    histE: new Float64Array(HIST),
    histHead: 0,
    histAcc: 0,
    readAcc: 1,
    scale: 1,
    noise: rng(207),
  };

  sample(n: number) {
    const st = this.st;
    for (let i = 0; i < n; i++) {
      const t = st.t + i / FS;
      const v = trueSpeed(t);
      const fw = v / (2 * Math.PI * WHEEL_R);
      const fe = 27 + v * 0.35;
      st.phW += (2 * Math.PI * fw) / FS;
      st.phE += (2 * Math.PI * fe) / FS;
      st.phS += (2 * Math.PI * 1.2) / FS;
      const x =
        0.9 * Math.sin(st.phW) +
        0.42 * Math.sin(2 * st.phW + 0.7) +
        0.3 * Math.sin(st.phE) +
        0.5 * Math.sin(st.phS) +
        0.32 * gauss(st.noise);
      st.buf[st.head] = x;
      st.head = (st.head + 1) % st.buf.length;
    }

  }

  analyse(dt: number) {
    const st = this.st;
    const L = st.buf.length;
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      st.re[i] = st.buf[(st.head - N + i + L) % L] * w;
      st.im[i] = 0;
    }
    fftMag(st.re, st.im, st.mag);
    const lo = Math.ceil(BAND[0] / RES);
    const hi = Math.floor(BAND[1] / RES);
    let k = lo;
    for (let j = lo; j <= hi; j++) if (st.mag[j] > st.mag[k]) k = j;
    const a = Math.log(st.mag[k - 1] + 1e-9);
    const b = Math.log(st.mag[k] + 1e-9);
    const c = Math.log(st.mag[k + 1] + 1e-9);
    const d = a - 2 * b + c === 0 ? 0 : (0.5 * (a - c)) / (a - 2 * b + c);
    const f = (k + Math.max(-0.5, Math.min(0.5, d))) * RES;
    const g = 1 - Math.exp(-dt / 0.25);
    st.fhat += (f - st.fhat) * g;
    st.peakBin = k;
    let max = 0;
    for (let j = 1; j < SHOW_BINS; j++) max = Math.max(max, st.mag[j]);
    st.scale += (max - st.scale) * Math.min(1, dt * 3);

  }

  advance(dt: number) {
    const st = this.st;
    st.acc += dt * FS;
    const n = Math.floor(st.acc);
    st.acc -= n;
    this.sample(n);
    st.t += n / FS;
    this.analyse(dt);
    st.histAcc += dt;
    while (st.histAcc >= 0.1) {
      st.histAcc -= 0.1;
      st.histT[st.histHead] = trueSpeed(st.t) * 3.6;
      st.histE[st.histHead] = 2 * Math.PI * WHEEL_R * st.fhat * 3.6;
      st.histHead = (st.histHead + 1) % HIST;
    }

  }

  draw(box: CanvasBox) {
    const ctx = box.ctx;
    if (!ctx) return;
    const pal = readPalette();
    const st = this.st;
    const { w, h } = box;
    const px = 14;
    const iw = w - px * 2;
    ctx.clearRect(0, 0, w, h);
    ctx.font = monoFont(pal, 9);
    ctx.textBaseline = "alphabetic";

    // A — raw vibration
    const aTop = 22;
    const aH = h * 0.2;
    const aMid = aTop + aH / 2;
    ctx.fillStyle = pal.z[8];
    const narrow = w < 440;
    ctx.fillText(narrow ? "ACCEL z · 200 Hz" : "ACCEL · z-axis · 200 Hz · last 2 s", px, 15);
    ctx.strokeStyle = pal.z[5];
    ctx.beginPath();
    ctx.moveTo(px, aMid);
    ctx.lineTo(px + iw, aMid);
    ctx.stroke();
    ctx.strokeStyle = pal.z[9];
    ctx.lineWidth = 1;
    ctx.beginPath();
    const show = 400;
    const L = st.buf.length;
    for (let i = 0; i < show; i++) {
      const v = st.buf[(st.head - show + i + L) % L];
      const x = px + (i / (show - 1)) * iw;
      const y = aMid - (v / 2.6) * (aH / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // B — spectrum
    const bTop = aTop + aH + 26;
    const bH = h * 0.3;
    const bBase = bTop + bH;
    ctx.fillStyle = pal.z[8];
    ctx.fillText(narrow ? "FFT · 256-pt" : "FFT · 256-pt Hann · magnitude", px, bTop - 8);
    const bw = iw / SHOW_BINS;
    const sc = Math.max(0.2, st.scale);
    for (let k = 1; k < SHOW_BINS; k++) {
      const m = Math.min(1, st.mag[k] / sc);
      const bh = m * (bH - 4);
      ctx.fillStyle = k === st.peakBin ? pal.fix : k * RES >= BAND[0] && k * RES <= BAND[1] ? pal.z[7] : pal.z[5];
      ctx.fillRect(px + k * bw + 0.5, bBase - bh, Math.max(1, bw - 1.5), bh);
    }
    ctx.strokeStyle = pal.z[6];
    ctx.beginPath();
    ctx.moveTo(px, bBase + 0.5);
    ctx.lineTo(px + iw, bBase + 0.5);
    ctx.stroke();
    // axis ticks every 5 Hz
    ctx.fillStyle = pal.z[8];
    for (let f = 0; f <= 35; f += 5) {
      const x = px + (f / RES) * bw;
      ctx.fillRect(x, bBase + 1, 1, 4);
      ctx.fillText(String(f), x - (f >= 10 ? 5 : 2.5), bBase + 14);
    }
    ctx.fillText("Hz", px + iw - 14, bBase + 14);
    // tracking band bracket
    const b0 = px + (BAND[0] / RES) * bw;
    const b1 = px + (BAND[1] / RES) * bw;
    ctx.strokeStyle = pal.z[6];
    ctx.beginPath();
    ctx.moveTo(b0, bTop + 4);
    ctx.lineTo(b0, bTop);
    ctx.lineTo(b1, bTop);
    ctx.lineTo(b1, bTop + 4);
    ctx.stroke();
    ctx.fillStyle = pal.z[8];
    ctx.font = sansFont(pal, 10, 600);
    ctx.fillText("track band", b1 - 50, bTop - 8);
    ctx.font = monoFont(pal, 9);
    // tracked wheel line + harmonic
    const fx = px + (st.fhat / RES) * bw + bw / 2;
    ctx.strokeStyle = pal.fix;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(fx, bTop + 6);
    ctx.lineTo(fx, bBase);
    ctx.stroke();
    const hx = px + ((st.fhat * 2) / RES) * bw + bw / 2;
    ctx.strokeStyle = alpha(pal.z[9], 0.6);
    ctx.beginPath();
    ctx.moveTo(hx, bTop + 18);
    ctx.lineTo(hx, bBase);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = pal.fix;
    ctx.fillText(`wheel ${st.fhat.toFixed(1)} Hz`, fx + 5, bTop + 14);
    ctx.fillStyle = pal.z[8];
    ctx.fillText("2×", hx + 4, bTop + 26);

    // C — speed: truth vs spectral estimate
    const cTop = bBase + 34;
    const cH = h - cTop - 12;
    ctx.fillStyle = pal.z[8];
    ctx.fillText("SPEED · km/h · last 12 s", px, cTop - 6);
    const vmax = 75;
    const line = (arr: Float64Array, color: string, dash: number[], width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i < HIST; i++) {
        const v = arr[(st.histHead + i) % HIST];
        const x = px + (i / (HIST - 1)) * (iw - 64);
        const y = cTop + cH - (v / vmax) * cH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    };
    ctx.strokeStyle = pal.z[5];
    ctx.beginPath();
    ctx.moveTo(px, cTop + cH + 0.5);
    ctx.lineTo(px + iw - 64, cTop + cH + 0.5);
    ctx.stroke();
    line(st.histT, pal.z[7], [3, 3], 1);
    line(st.histE, pal.fix, [], 1.5);
    const last = (arr: Float64Array) => arr[(st.histHead - 1 + HIST) % HIST];
    ctx.fillStyle = pal.fix;
    ctx.fillText(`est ${last(st.histE).toFixed(0)}`, px + iw - 58, cTop + cH - (last(st.histE) / vmax) * cH + 3);
    ctx.fillStyle = pal.z[8];
    ctx.font = sansFont(pal, 10, 600);
    ctx.fillText("true", px + iw - 58, Math.min(cTop + cH, cTop + cH - (last(st.histT) / vmax) * cH + 14));

  }

  /** returns true when it warmed the buffers (first mount only) */
  warm() {
    if (this.st.t > 0) return false;
    for (let i = 0; i < 14 * 30; i++) this.advance(1 / 30);
    return true;
  }

  /** readouts refresh at ~7 Hz, not every frame */
  dueReadout(dt: number) {
    this.st.readAcc += dt;
    if (this.st.readAcc <= 0.15) return false;
    this.st.readAcc = 0;
    return true;
  }

  writeReadouts(fEl: HTMLElement | null, vEl: HTMLElement | null) {
    const st = this.st;
    if (fEl) fEl.textContent = `${st.fhat.toFixed(1)} Hz`;
    if (vEl) vEl.textContent = `${(2 * Math.PI * WHEEL_R * st.fhat * 3.6).toFixed(0)} km/h`;
  }
}

export function Spectral({ active = true }: { active?: boolean }) {
  const scope = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fOut = useRef<HTMLSpanElement>(null);
  const vOut = useRef<HTMLSpanElement>(null);
  const still = useStill();
  const [sim] = useState(() => new SpectralRun());

  const box = useCanvas(canvas, (b) => sim.draw(b));

  useLoop(scope, active, (dt) => {
    sim.advance(dt);
    sim.draw(box.current);
    if (sim.dueReadout(dt)) sim.writeReadouts(fOut.current, vOut.current);
  });

  // warm the buffers so the first frame (and the still frame) is a real spectrum
  useEffect(() => {
    if (!sim.warm()) return;
    sim.writeReadouts(fOut.current, vOut.current);
    sim.draw(box.current);
  }, [sim, box]);

  useEffect(() => {
    if (still) sim.draw(box.current);
  }, [still, sim, box]);

  return (
    <Frame
      title="Spectral velocity odometry"
      station="SETU · on-device"
      simulated="Simulated signal"
      aspect="4 / 3"
      badge={{ label: "On-device ML", glyph: <Glyph name="edge" /> }}
      figures={[
        { v: "207 KB", k: "CNN-GRU model" },
        { v: "1–5 ms", k: "inference on a phone" },
        { v: "84,000+", k: "parameters" },
      ]}
      readouts={[
        { k: "Wheel peak", v: <span ref={fOut}>—</span>, live: true },
        { k: "Speed est.", v: <span ref={vOut}>—</span>, live: true },
      ]}
      caption="Reads wheel-rotation frequency out of a phone's accelerometer vibration and turns it into speed, without double-integrating acceleration."
      controls={
        <p className={s.queryRow}>
          <span className={s.formula}>v = 2πr · f</span> <span className={s.queryText}>with r = 0.31 m, a tyre radius assumed for the simulation</span>
        </p>
      }
    >
      <div ref={scope} className={s.fill}>
        <canvas ref={canvas} aria-hidden="true" />
      </div>
    </Frame>
  );
}
