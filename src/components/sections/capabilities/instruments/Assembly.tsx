"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Frame } from "./Frame";
import { Glyph } from "../glyphs";
import { alpha, monoFont, readPalette, sansFont } from "../kit/palette";
import { expoOut, useCanvas, useLoop, useStill, type CanvasBox } from "../kit/loop";
import { Sim } from "../kit/store";
import s from "./instruments.module.css";

// The IIT Delhi XR toolkit synced spoken commands to 3D CAD models through a
// Flask pipeline. Here a wireframe gear train listens for "rotate" / "explode".
// The model and the voice are simulated; the meshing ratio is real geometry.

type V3 = [number, number, number];
type Part = { id: string; label: string; loops: V3[][]; segs: [V3, V3][]; anchor: V3 };

const ZA = 18;
const ZB = 11;
const MOD = 0.12;
const RA = (MOD * ZA) / 2;
const RB = (MOD * ZB) / 2;
const CA: V3 = [-0.78, 0.05, 0];
const CB: V3 = [-0.78 + RA + RB, 0.05, 0];
const THICK = 0.28;

function gearProfile(z: number, rp: number) {
  const tip = rp + MOD;
  const root = rp - 1.25 * MOD;
  const p = (2 * Math.PI) / z;
  const pts: [number, number][] = [];
  for (let k = 0; k < z; k++) {
    const a = k * p;
    for (const [r, f] of [
      [root, 0],
      [tip, 0.17],
      [tip, 0.4],
      [root, 0.57],
    ] as const)
      pts.push([r * Math.cos(a + f * p), r * Math.sin(a + f * p)]);
  }
  return pts;
}

function circle(r: number, n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * Math.PI * 2), r * Math.sin((i / n) * Math.PI * 2)]);
}

const PROFILE_A = gearProfile(ZA, RA);
const PROFILE_B = gearProfile(ZB, RB);

function gearPart(id: string, label: string, profile: [number, number][], rp: number, c: V3, rot: number, dz: number): Part {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const at = (x: number, y: number, z: number): V3 => [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos, c[2] + z + dz];
  const loops: V3[][] = [];
  const segs: [V3, V3][] = [];
  for (const zz of [-THICK / 2, THICK / 2]) {
    loops.push(profile.map(([x, y]) => at(x, y, zz)));
    loops.push(circle(rp * 0.55, 20).map(([x, y]) => at(x, y, zz)));
    loops.push(circle(rp * 0.17, 12).map(([x, y]) => at(x, y, zz)));
  }
  profile.forEach(([x, y], i) => {
    if (i % 4 === 1 || i % 4 === 2) segs.push([at(x, y, -THICK / 2), at(x, y, THICK / 2)]);
  });
  // web spokes
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    segs.push([at(Math.cos(a) * rp * 0.17, Math.sin(a) * rp * 0.17, THICK / 2), at(Math.cos(a) * rp * 0.55, Math.sin(a) * rp * 0.55, THICK / 2)]);
  }
  return { id, label, loops, segs, anchor: at(rp * 0.8, rp * 0.75, THICK / 2) };
}

function shaftPart(c: V3, r: number, dz: number, label: string): Part {
  const z0 = -0.62 + dz;
  const z1 = 0.42 + dz;
  const ring = circle(r, 10);
  return {
    id: label,
    label,
    loops: [ring.map(([x, y]) => [c[0] + x, c[1] + y, z0] as V3), ring.map(([x, y]) => [c[0] + x, c[1] + y, z1] as V3)],
    segs: ring.filter((_, i) => i % 3 === 0).map(([x, y]) => [[c[0] + x, c[1] + y, z0] as V3, [c[0] + x, c[1] + y, z1] as V3]),
    anchor: [c[0], c[1] - r, z1],
  };
}

function platePart(dz: number): Part {
  const z = -0.62 + dz;
  const [x0, x1, y0, y1] = [-1.8, 1.55, -1.25, 1.2];
  const rect: V3[] = [
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y1, z],
  ];
  const back: V3[] = rect.map(([x, y]) => [x, y, z - 0.1]);
  return {
    id: "plate",
    label: "BASE PLATE",
    loops: [rect, back, ...[CA, CB].map((c) => circle(0.09, 10).map(([x, y]) => [c[0] + x, c[1] + y, z] as V3))],
    segs: rect.map((p, i) => [p, back[i]] as [V3, V3]),
    anchor: [x0 + 0.2, y0 + 0.15, z],
  };
}

type Cmd = "rotate" | "explode" | "assemble";
type View = { heard: Cmd | null; listening: boolean; exploded: boolean };

class AssemblyRun extends Sim<View> {
  st = {
    theta: 0,
    yaw: 0.55,
    yawFrom: 0.55,
    yawTo: 0.55,
    yawT: 1,
    ex: 0,
    exFrom: 0,
    exTo: 0,
    exT: 1,
    idle: 3.5,
    autoIdx: 0,
    pending: null as null | { cmd: Cmd; t: number },
  };

  constructor() {
    super({ heard: null, listening: false, exploded: false });
  }

  draw(box: CanvasBox) {
    const ctx = box.ctx;
    if (!ctx) return;
    const pal = readPalette();
    const st = this.st;
    const yaw = st.yaw;
    const pitch = -0.42;
    const D = 7.2;
    const f = Math.min(box.w, box.h) * 1.85;
    const cx = box.w / 2;
    const cy = box.h / 2 + 4;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const proj = ([x, y, z]: V3): [number, number, number] => {
      const x1 = x * cyw + z * syw;
      const z1 = -x * syw + z * cyw;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const k = f / (D + z2);
      return [cx + x1 * k, cy - y2 * k, z2];
    };

    const e = st.ex;
    const ta = st.theta;
    const tb = -st.theta * (ZA / ZB) + Math.PI / ZB + 0.05;
    const parts: Part[] = [
      platePart(-0.55 * e),
      shaftPart(CA, RA * 0.17, 1.15 * e, "SHAFT"),
      shaftPart(CB, RB * 0.17, 1.15 * e, "SHAFT B"),
      gearPart("a", `GEAR ${ZA}T`, PROFILE_A, RA, CA, ta, 0.3 * e),
      gearPart("b", `PINION ${ZB}T`, PROFILE_B, RB, CB, tb, 0.75 * e),
    ];

    ctx.clearRect(0, 0, box.w, box.h);
    ctx.lineWidth = 1;
    const shade = (z: number) => Math.max(0.28, Math.min(1, 0.95 - (z + 1.4) * 0.2));
    const line = (a: V3, b: V3, color: string) => {
      const p = proj(a);
      const q = proj(b);
      ctx.strokeStyle = alpha(color, shade((p[2] + q[2]) / 2));
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.stroke();
    };
    for (const part of parts) {
      const color = part.id === "b" && e > 0.02 ? pal.fix : pal.z[9];
      for (const loop of part.loops) {
        for (let i = 0; i < loop.length; i++) line(loop[i], loop[(i + 1) % loop.length], color);
      }
      for (const [a, b] of part.segs) line(a, b, color);
    }

    // exploded-view callouts
    if (e > 0.6) {
      const a = (e - 0.6) / 0.4;
      ctx.font = sansFont(pal, 10, 600);
      parts
        .filter((p) => p.label !== "SHAFT B")
        .forEach((p, i) => {
          const [px, py] = proj(p.anchor);
          const lx = i % 2 ? box.w - 16 : 16;
          const ly = 22 + i * 18;
          ctx.strokeStyle = alpha(pal.z[7], a);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(lx + (i % 2 ? -4 : 4), ly - 3);
          ctx.stroke();
          ctx.fillStyle = alpha(pal.z[9], a);
          ctx.textAlign = i % 2 ? "right" : "left";
          ctx.fillText(p.label, lx + (i % 2 ? -8 : 8), ly);
        });
      ctx.textAlign = "left";
    }

    ctx.font = monoFont(pal, 9);
    ctx.fillStyle = pal.z[8];
    ctx.fillText(`ratio ${ZA}:${ZB}  ·  yaw ${String(Math.round((((yaw * 180) / Math.PI) % 360 + 360) % 360)).padStart(3, "0")}°`, 14, box.h - 10);

  }

  run(cmd: Cmd, still: boolean) {
    const st = this.st;
    if (cmd === "rotate") {
      st.yawFrom = st.yaw;
      st.yawTo = st.yaw + Math.PI / 2;
      st.yawT = 0;
    } else {
      st.exFrom = st.ex;
      st.exTo = cmd === "explode" ? 1 : 0;
      st.exT = 0;
      this.publish({ exploded: cmd === "explode" });
    }
    this.publish({ heard: cmd });
    if (still) {
      st.yaw = st.yawTo;
      st.ex = st.exTo;
      st.yawT = st.exT = 1;
    }
  }

  /** a spoken command: a beat of "listening", then the model moves */
  say(cmd: Cmd, byVisitor: boolean, still: boolean) {
    const st = this.st;
    if (byVisitor) st.idle = 14;
    if (still) {
      this.run(cmd, true);
      return;
    }
    this.publish({ listening: true });
    st.pending = { cmd, t: 0.7 };
  }

  step(dt: number) {
    const st = this.st;
    st.theta += dt * 0.55;
    if (st.yawT < 1) {
      st.yawT = Math.min(1, st.yawT + dt / 1.4);
      st.yaw = st.yawFrom + (st.yawTo - st.yawFrom) * expoOut(st.yawT);
    } else st.yaw += dt * 0.06;
    if (st.exT < 1) {
      st.exT = Math.min(1, st.exT + dt / 1.2);
      st.ex = st.exFrom + (st.exTo - st.exFrom) * expoOut(st.exT);
    }
    if (st.pending) {
      st.pending.t -= dt;
      if (st.pending.t <= 0) {
        const c = st.pending.cmd;
        st.pending = null;
        this.publish({ listening: false });
        this.run(c, false);
      }
    }
    st.idle -= dt;
    if (st.idle <= 0 && !st.pending) {
      const cycle = ["rotate", "explode", "rotate", "assemble"] as const;
      this.say(cycle[st.autoIdx % cycle.length], false, false);
      st.autoIdx++;
      st.idle = 5.5;
    }
  }
}

export function Assembly({ active = true }: { active?: boolean }) {
  const scope = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useStill();
  const [sim] = useState(() => new AssemblyRun());
  const { heard, listening, exploded } = useSyncExternalStore(sim.subscribe, sim.getSnapshot, sim.getSnapshot);

  const box = useCanvas(canvas, (b) => sim.draw(b));

  useLoop(scope, active, (dt) => {
    sim.step(dt);
    sim.draw(box.current);
  });

  useEffect(() => {
    if (still) sim.draw(box.current);
  }, [still, sim, box]);

  const say = (cmd: Cmd, byVisitor: boolean) => {
    sim.say(cmd, byVisitor, still);
    if (still) sim.draw(box.current);
  };

  const second = exploded ? "assemble" : "explode";

  return (
    <Frame
      title="Voice-driven CAD assembly"
      station="IIT Delhi · FSM Lab · 2025"
      badge={{ label: "XR · 3D", glyph: <Glyph name="xr" /> }}
      figures={[
        { v: "−75%", k: "onboarding time" },
        { v: "98%", k: "mechanical fidelity" },
        { v: "Real time", k: "voice → 3D CAD" },
      ]}
      readouts={[
        { k: "Pipeline", v: "voice → Flask → Unity" },
        { k: "Engine", v: "Unity · C#" },
      ]}
      caption="An industrial training toolkit in Unity and C#: spoken commands drive the 3D CAD models, and the physics matches the real hardware."
      link={{ label: "Watch the toolkit", href: "https://youtu.be/KJb_Zj6nslE" }}
      controls={
        <>
          <span className={s.chips} role="group" aria-label="Voice commands">
            <button type="button" className={s.chip} data-listening={listening || undefined} onClick={() => say("rotate", true)}>
              <span className={s.wave} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              “rotate”
            </button>
            <button type="button" className={s.chip} onClick={() => say(second, true)}>
              “{second}”
            </button>
          </span>
          <span className={s.heard} aria-live="polite">
            {listening ? "Listening…" : heard ? `Heard “${heard}” · synced to the model` : "Tap a command"}
          </span>
        </>
      }
    >
      <div ref={scope} className={s.fill}>
        <canvas ref={canvas} aria-hidden="true" />
      </div>
    </Frame>
  );
}
