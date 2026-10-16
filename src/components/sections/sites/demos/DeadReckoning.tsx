"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Frame } from "@/components/sections/capabilities/instruments/Frame";
import { alpha, monoFont, readPalette, sansFont } from "@/components/sections/capabilities/kit/palette";
import { gauss, rng, useCanvas, useLoop, useStill, type CanvasBox } from "@/components/sections/capabilities/kit/loop";
import { Sim as Store } from "@/components/sections/capabilities/kit/store";
import s from "./demos.module.css";

// A simulated drive around a block. GNSS fixes arrive at 1 Hz; when the outage
// starts they stop and the estimate carries on from SVO speed and heading alone,
// drifting inside a growing uncertainty ellipse until GNSS returns and hands over.

type V = [number, number];
const LOOP: V[] = [
  [20, 25],
  [95, 12],
  [170, 22],
  [232, 55],
  [240, 110],
  [205, 150],
  [140, 158],
  [95, 128],
  [45, 140],
  [12, 95],
];
const WORLD = { w: 252, h: 170 };
const BLOCKS: [number, number, number, number][] = [
  [52, 46, 46, 34],
  [112, 44, 50, 30],
  [178, 66, 34, 40],
  [120, 96, 54, 36],
  [60, 92, 30, 22],
];

/** closed Catmull-Rom loop, sampled to an arc-length table */
function buildRoute() {
  const n = LOOP.length;
  const samples: V[] = [];
  const per = 60;
  for (let i = 0; i < n; i++) {
    const p0 = LOOP[(i - 1 + n) % n];
    const p1 = LOOP[i];
    const p2 = LOOP[(i + 1) % n];
    const p3 = LOOP[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      samples.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const cum = [0];
  for (let i = 1; i <= samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i % samples.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[cum.length - 1];
  const at = (sArc: number): { p: V; h: number } => {
    const s0 = ((sArc % length) + length) % length;
    let lo = 0;
    let hi = samples.length;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s0) lo = mid;
      else hi = mid;
    }
    const a = samples[lo];
    const b = samples[(lo + 1) % samples.length];
    const f = (s0 - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]);
    return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], h: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };
  return { samples, length, at };
}

const ROUTE = buildRoute();
const ON_FOR = 6;
const OFF_FOR = 9;

type Sim = {
  t: number;
  s: number;
  v: number;
  truth: V;
  heading: number;
  gnss: boolean;
  auto: boolean;
  autoT: number;
  fixT: number;
  fixes: { p: V; age: number }[];
  est: V;
  bias: number;
  sigA: number;
  sigC: number;
  outT: number;
  dOut: number;
  trail: V[];
  trailT: number;
  estTrail: V[];
  hand: { from: V; to: V; t: number } | null;
  burst: { p: V; t: number } | null;
  noise: () => number;
  readT: number;
};

function freshSim(): Sim {
  const start = ROUTE.at(0);
  return {
    t: 0,
    s: 0,
    v: 11,
    truth: start.p,
    heading: start.h,
    gnss: true,
    auto: true,
    autoT: 4,
    fixT: 0,
    fixes: [],
    est: [...start.p] as V,
    bias: 0,
    sigA: 2,
    sigC: 2,
    outT: 0,
    dOut: 0,
    trail: [],
    trailT: 0,
    estTrail: [],
    hand: null,
    burst: null,
    noise: rng(2027),
    readT: 1,
  };
}

type View = { outage: boolean; auto: boolean };

class DriveRun extends Store<View> {
  private st: Sim = freshSim();

  constructor() {
    super({ outage: false, auto: true });
  }

  get gnssOn() {
    return this.st.gnss;
  }

  setGnss(on: boolean) {
    const st = this.st;
    if (st.gnss === on) return;
    st.gnss = on;
    if (on) {
      const fix: V = [st.truth[0] + gauss(st.noise) * 1.2, st.truth[1] + gauss(st.noise) * 1.2];
      st.hand = { from: [...st.est] as V, to: fix, t: 0 };
      st.burst = { p: fix, t: 0 };
      st.fixes.push({ p: fix, age: 0 });
      st.fixT = 1;
    } else {
      st.outT = 0;
      st.dOut = 0;
      st.estTrail = [[...st.est] as V];
    }
    this.publish({ outage: !on });

  }

  advance(dt: number) {
    const st = this.st;
    st.t += dt;
    st.v = 11 + 3 * Math.sin(0.35 * st.t);
    st.s += st.v * dt;
    const now = ROUTE.at(st.s);
    st.truth = now.p;
    st.heading = now.h;

    if (st.auto) {
      st.autoT -= dt;
      if (st.autoT <= 0) {
        this.setGnss(!st.gnss);
        st.autoT = st.gnss ? ON_FOR : OFF_FOR;
      }
    }

    const vSvo = st.v * (st.gnss ? 1 : 1.04) + gauss(st.noise) * 0.15;
    if (st.gnss) {
      st.bias *= Math.exp(-dt * 3);
      st.sigA += (2 - st.sigA) * Math.min(1, dt * 8);
      st.sigC += (2 - st.sigC) * Math.min(1, dt * 8);
    } else {
      st.outT += dt;
      st.dOut += st.v * dt;
      st.bias += ((1.7 * Math.PI) / 180) * dt;
      st.sigA = 2 + 0.05 * st.dOut;
      st.sigC = 2 + 0.0011 * Math.pow(st.dOut, 1.5);
    }
    const h = st.heading + st.bias;
    st.est = [st.est[0] + Math.cos(h) * vSvo * dt, st.est[1] + Math.sin(h) * vSvo * dt];

    if (st.hand) {
      st.hand.t += dt / 0.45;
      const k = 1 - Math.pow(2, -10 * Math.min(1, st.hand.t));
      // the handover target keeps moving with the vehicle
      st.hand.to = [st.hand.to[0] + Math.cos(st.heading) * st.v * dt, st.hand.to[1] + Math.sin(st.heading) * st.v * dt];
      st.est = [st.hand.from[0] + (st.hand.to[0] - st.hand.from[0]) * k, st.hand.from[1] + (st.hand.to[1] - st.hand.from[1]) * k];
      st.hand.from = [st.hand.from[0] + Math.cos(st.heading) * st.v * dt, st.hand.from[1] + Math.sin(st.heading) * st.v * dt];
      if (st.hand.t >= 1) st.hand = null;
    } else if (st.gnss) {
      st.fixT -= dt;
      if (st.fixT <= 0) {
        st.fixT = 1;
        const fix: V = [st.truth[0] + gauss(st.noise) * 1.2, st.truth[1] + gauss(st.noise) * 1.2];
        st.fixes.push({ p: fix, age: 0 });
        st.est = [st.est[0] + (fix[0] - st.est[0]) * 0.7, st.est[1] + (fix[1] - st.est[1]) * 0.7];
      }
    }
    st.fixes = st.fixes.filter((f) => (f.age += dt) < 7);
    if (st.burst && (st.burst.t += dt) > 0.7) st.burst = null;

    st.trailT += dt;
    if (st.trailT > 0.12) {
      st.trailT = 0;
      st.trail.push([...st.truth] as V);
      if (st.trail.length > 60) st.trail.shift();
      if (!st.gnss) st.estTrail.push([...st.est] as V);
      else if (!st.hand && st.estTrail.length) st.estTrail.shift();
    }

  }

  draw(box: CanvasBox) {
    const ctx = box.ctx;
    if (!ctx) return;
    const pal = readPalette();
    const st = this.st;
    const pad = 22;
    const k = Math.min((box.w - pad * 2) / WORLD.w, (box.h - pad * 2 - 14) / WORLD.h);
    const ox = (box.w - WORLD.w * k) / 2;
    const oy = (box.h - 14 - WORLD.h * k) / 2;
    const X = (x: number) => ox + x * k;
    const Y = (y: number) => oy + y * k;
    ctx.clearRect(0, 0, box.w, box.h);

    // blocks
    ctx.fillStyle = pal.z[2];
    ctx.strokeStyle = pal.z[4];
    for (const [x, y, w, h] of BLOCKS) {
      ctx.fillRect(X(x), Y(y), w * k, h * k);
      ctx.strokeRect(X(x) + 0.5, Y(y) + 0.5, w * k - 1, h * k - 1);
    }

    // road
    const road = () => {
      ctx.beginPath();
      ROUTE.samples.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.closePath();
    };
    ctx.lineJoin = "round";
    road();
    ctx.strokeStyle = pal.z[5];
    ctx.lineWidth = Math.max(8, 7 * k);
    ctx.stroke();
    road();
    ctx.strokeStyle = pal.z[3];
    ctx.lineWidth = Math.max(6, 7 * k) - 2;
    ctx.stroke();
    road();
    ctx.strokeStyle = pal.z[6];
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // true track
    ctx.strokeStyle = pal.z[8];
    ctx.lineWidth = 1;
    ctx.beginPath();
    st.trail.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();

    // dead-reckoning track
    if (st.estTrail.length > 1) {
      ctx.strokeStyle = pal.fix;
      ctx.lineWidth = 1.3;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      st.estTrail.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.lineTo(X(st.est[0]), Y(st.est[1]));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // GNSS fixes
    const cross = (x: number, y: number, a: number, r = 3.5) => {
      ctx.strokeStyle = alpha(pal.fix, a);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x - r - 4, y);
      ctx.lineTo(x - r, y);
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + r + 4, y);
      ctx.moveTo(x, y - r - 4);
      ctx.lineTo(x, y - r);
      ctx.moveTo(x, y + r);
      ctx.lineTo(x, y + r + 4);
      ctx.stroke();
    };
    for (const f of st.fixes) cross(X(f.p[0]), Y(f.p[1]), Math.max(0, 1 - f.age / 7) * 0.9);

    // uncertainty ellipse (2σ)
    const h = st.heading + st.bias;
    const ra = Math.max(4, 2 * st.sigA * k);
    const rc = Math.max(4, 2 * st.sigC * k);
    ctx.save();
    ctx.translate(X(st.est[0]), Y(st.est[1]));
    ctx.rotate(h);
    ctx.beginPath();
    ctx.ellipse(0, 0, ra, rc, 0, 0, Math.PI * 2);
    ctx.fillStyle = alpha(pal.z[9], 0.07);
    ctx.fill();
    ctx.strokeStyle = alpha(pal.z[9], 0.9);
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // truth vehicle
    ctx.save();
    ctx.translate(X(st.truth[0]), Y(st.truth[1]));
    ctx.rotate(st.heading);
    ctx.fillStyle = pal.z[10];
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4.5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // estimate
    ctx.strokeStyle = pal.fix;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(X(st.est[0]), Y(st.est[1]), 4.5, 0, Math.PI * 2);
    ctx.moveTo(X(st.est[0]) + Math.cos(h) * 4.5, Y(st.est[1]) + Math.sin(h) * 4.5);
    ctx.lineTo(X(st.est[0]) + Math.cos(h) * 12, Y(st.est[1]) + Math.sin(h) * 12);
    ctx.stroke();
    ctx.lineWidth = 1;

    if (st.burst) {
      const b = st.burst.t / 0.7;
      ctx.strokeStyle = alpha(pal.fix, 1 - b);
      ctx.beginPath();
      ctx.arc(X(st.burst.p[0]), Y(st.burst.p[1]), 5 + b * 22, 0, Math.PI * 2);
      ctx.stroke();
    }

    // status + legend
    ctx.font = monoFont(pal, 12);
    ctx.fillStyle = st.gnss ? pal.z[8] : pal.z[10];
    ctx.fillText(st.gnss ? (st.hand ? "GNSS BACK · HANDOVER" : "GNSS · FIX 1 Hz") : `GNSS LOST · ${st.outT.toFixed(1).padStart(4, "0")} s`, 12, 20);
    if (!st.gnss) {
      ctx.fillStyle = pal.fix;
      ctx.fillRect(box.w - 18, 10, 6, 6);
    }
    const ly = box.h - 10;
    ctx.font = sansFont(pal, 11.5, 600);
    let lx = 12;
    const item = (label: string, glyph: (x: number, y: number) => void) => {
      glyph(lx + 5, ly - 3);
      ctx.fillStyle = pal.z[8];
      ctx.fillText(label, lx + 14, ly);
      lx += 14 + ctx.measureText(label).width + 14;
    };
    item("true", (x, y) => {
      ctx.fillStyle = pal.z[10];
      ctx.beginPath();
      ctx.moveTo(x + 5, y);
      ctx.lineTo(x - 4, y - 3.5);
      ctx.lineTo(x - 2, y);
      ctx.lineTo(x - 4, y + 3.5);
      ctx.fill();
    });
    item("SVO dead reckoning", (x, y) => {
      ctx.strokeStyle = pal.fix;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    });
    if (box.w > 380) item("GNSS fix", (x, y) => cross(x, y, 1, 2.5));

  }

  /** jump the drive forward (reduced motion holds the resulting frame) */
  settle(secs: number) {
    for (let i = 0; i < secs * 30; i++) this.advance(1 / 30);
  }

  setManual() {
    this.st.auto = false;
    this.publish({ auto: false });
  }

  /** reduced motion: a frame a few seconds into an outage */
  holdStill() {
    this.st = freshSim();
    this.st.auto = false;
    this.publish({ auto: false, outage: false });
    this.settle(3);
    this.setGnss(false);
    this.settle(6.5);
  }

  dueReadout(dt: number) {
    this.st.readT += dt;
    if (this.st.readT <= 0.15) return false;
    this.st.readT = 0;
    return true;
  }

  writeReadouts(gnss: HTMLElement | null, speed: HTMLElement | null, drift: HTMLElement | null, sigma: HTMLElement | null) {
    const st = this.st;
    const d = Math.hypot(st.est[0] - st.truth[0], st.est[1] - st.truth[1]);
    if (gnss) gnss.textContent = st.gnss ? "fix · 1 Hz" : `lost ${st.outT.toFixed(1)} s`;
    if (speed) speed.textContent = `${(st.v * 3.6).toFixed(0)} km/h`;
    if (drift) drift.textContent = `${d.toFixed(1)} m`;
    if (sigma) sigma.textContent = `±${(2 * Math.max(st.sigA, st.sigC)).toFixed(1)} m (2σ)`;
  }
}

export function DeadReckoning({ active = true }: { active?: boolean }) {
  const scope = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gnssOut = useRef<HTMLSpanElement>(null);
  const speedOut = useRef<HTMLSpanElement>(null);
  const driftOut = useRef<HTMLSpanElement>(null);
  const sigmaOut = useRef<HTMLSpanElement>(null);
  const still = useStill();
  const [sim] = useState(() => new DriveRun());
  const { outage, auto } = useSyncExternalStore(sim.subscribe, sim.getSnapshot, sim.getSnapshot);

  const box = useCanvas(canvas, (b) => sim.draw(b));

  useLoop(scope, active, (dt) => {
    sim.advance(dt);
    sim.draw(box.current);
    if (sim.dueReadout(dt)) sim.writeReadouts(gnssOut.current, speedOut.current, driftOut.current, sigmaOut.current);
  });

  useEffect(() => {
    if (!still) return;
    sim.holdStill();
    sim.writeReadouts(gnssOut.current, speedOut.current, driftOut.current, sigmaOut.current);
    sim.draw(box.current);
  }, [still, sim, box]);

  const toggle = () => {
    sim.setManual();
    sim.setGnss(!sim.gnssOn);
    if (still) {
      sim.settle(sim.gnssOn ? 1.5 : 6);
      sim.writeReadouts(gnssOut.current, speedOut.current, driftOut.current, sigmaOut.current);
      sim.draw(box.current);
    }
  };

  return (
    <Frame
      title="Dead reckoning through an outage"
      simulated="Simulated drive"
      aspect="16 / 10"
      readouts={[
        { k: "GNSS", v: <span ref={gnssOut}>fix · 1 Hz</span>, live: true },
        { k: "Speed (SVO)", v: <span ref={speedOut}>—</span>, live: true },
        { k: "Drift", v: <span ref={driftOut}>—</span>, live: true },
        { k: "Uncertainty", v: <span ref={sigmaOut}>—</span>, live: true },
      ]}
      controls={
        <div className={s.controlRow}>
          <button type="button" role="switch" aria-checked={outage} className={s.switch} onClick={toggle}>
            <span className={s.switchTrack} aria-hidden="true">
              <span className={s.switchThumb} />
            </span>
            GPS outage
          </button>
          <span className={s.mode}>{auto ? "Auto: an outage starts every few seconds" : "Manual"}</span>
        </div>
      }
    >
      <div ref={scope} className={s.fill}>
        <canvas ref={canvas} aria-hidden="true" />
      </div>
    </Frame>
  );
}
