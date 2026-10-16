"use client";

import { useEffect, useRef, useState } from "react";
import { Frame } from "./Frame";
import { Glyph } from "../glyphs";
import { alpha, readPalette, sansFont } from "../kit/palette";
import { useCanvas, useLoop, type CanvasBox } from "../kit/loop";
import s from "./instruments.module.css";

// A rover maps an unknown yard with a 2D LiDAR sweep, fills an occupancy grid,
// and re-plans (A*) to each goal as obstacles appear, the loop A.T.O.M built for
// its Mars Rover prototype in ROS2. The world is authored; the mapping and planning run live.

const GW = 48;
const GH = 32;
const RANGE = 11;
const RAY_STEP = (2 * Math.PI) / 180; // 2°
const SWEEP = 2 * Math.PI; // rad/s
const SPEED = 3.2; // cells/s
const GOALS: [number, number][] = [
  [42.5, 27.5],
  [6.5, 27.5],
  [43.5, 4.5],
  [24.5, 9.5],
];

const ROCKS: [number, number, number][] = [
  [10, 9, 2.5],
  [23, 20, 3],
  [34, 9, 2.3],
  [39, 22, 2.6],
  [14, 25, 2],
  [28, 13.5, 1.6],
  [6, 17, 1.8],
  [44, 14, 1.7],
];
const WALLS: [number, number, number, number][] = [
  [18, 3, 19.6, 13],
  [26, 26, 37, 27.4],
  [30.5, 16, 32, 22],
];

function buildTruth() {
  const t = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x = i + 0.5;
      const y = j + 0.5;
      let occ = i === 0 || j === 0 || i === GW - 1 || j === GH - 1;
      for (const [cx, cy, r] of ROCKS) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) occ = true;
      for (const [x0, y0, x1, y1] of WALLS) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) occ = true;
      t[j * GW + i] = occ ? 1 : 0;
    }
  return t;
}

function astar(known: Int8Array, sx: number, sy: number, gx: number, gy: number): [number, number][] {
  const idx = (x: number, y: number) => y * GW + x;
  const start = idx(sx, sy);
  const goal = idx(gx, gy);
  const g = new Float32Array(GW * GH).fill(Infinity);
  const came = new Int32Array(GW * GH).fill(-1);
  const closed = new Uint8Array(GW * GH);
  const open: number[] = [start];
  const f = new Float32Array(GW * GH).fill(Infinity);
  g[start] = 0;
  f[start] = Math.hypot(gx - sx, gy - sy);
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && known[idx(nx, ny)] === 2) return true;
      }
    return false;
  };
  let guard = 0;
  while (open.length && guard++ < 4000) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % GW;
    const cy = (cur / GW) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 1 || ny < 1 || nx >= GW - 1 || ny >= GH - 1) continue;
        const n = idx(nx, ny);
        if (closed[n] || known[n] === 2) continue;
        if (dx && dy && (known[idx(cx + dx, cy)] === 2 || known[idx(cx, cy + dy)] === 2)) continue;
        const cost = (dx && dy ? 1.414 : 1) + (near(nx, ny) ? 2.5 : 0);
        const ng = g[cur] + cost;
        if (ng < g[n]) {
          g[n] = ng;
          f[n] = ng + Math.hypot(gx - nx, gy - ny);
          came[n] = cur;
          if (!open.includes(n)) open.push(n);
        }
      }
  }
  if (came[goal] < 0 && goal !== start) return [];
  const path: [number, number][] = [];
  for (let c = goal; c >= 0; c = came[c]) {
    path.push([(c % GW) + 0.5, ((c / GW) | 0) + 0.5]);
    if (c === start) break;
  }
  return path.reverse();
}

class LidarRun {
  st = {
    truth: buildTruth(),
    known: new Int8Array(GW * GH),
    x: 3.5,
    y: 4.5,
    hd: 0.4,
    angle: 0,
    goal: 0,
    legs: 0,
    path: [] as [number, number][],
    replan: 0,
    hits: [] as { x: number; y: number; age: number }[],
    readAcc: 1,
    beamEnd: 0,
  };

  scan(from: number, to: number) {
    const st = this.st;
    for (let a = from; a < to; a += RAY_STEP) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let end = RANGE;
      for (let r = 0.3; r < RANGE; r += 0.35) {
        const cx = Math.floor(st.x + dx * r);
        const cy = Math.floor(st.y + dy * r);
        if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) break;
        const k = cy * GW + cx;
        if (st.truth[k]) {
          st.known[k] = 2;
          st.hits.push({ x: st.x + dx * r, y: st.y + dy * r, age: 0 });
          end = r;
          break;
        }
        if (st.known[k] !== 2) st.known[k] = 1;
      }
      st.beamEnd = end;
    }

  }

  advance(dt: number) {
    const st = this.st;
    const a0 = st.angle;
    st.angle += SWEEP * dt;
    this.scan(a0, st.angle);
    if (st.angle > Math.PI * 2) st.angle -= Math.PI * 2;
    st.hits = st.hits.filter((h) => (h.age += dt) < 0.9);

    const [gx, gy] = GOALS[st.goal];
    st.replan -= dt;
    if (st.replan <= 0 || st.path.length < 2) {
      st.path = astar(st.known, Math.floor(st.x), Math.floor(st.y), Math.floor(gx), Math.floor(gy));
      st.replan = 0.35;
    }
    // follow a short lookahead along the path
    const look = st.path[Math.min(2, st.path.length - 1)];
    if (look) {
      const want = Math.atan2(look[1] - st.y, look[0] - st.x);
      let dh = want - st.hd;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      st.hd += Math.max(-3.2 * dt, Math.min(3.2 * dt, dh));
      const v = SPEED * (Math.abs(dh) > 1 ? 0.35 : 1);
      const nx = st.x + Math.cos(st.hd) * v * dt;
      const ny = st.y + Math.sin(st.hd) * v * dt;
      if (!st.truth[Math.floor(ny) * GW + Math.floor(nx)]) {
        st.x = nx;
        st.y = ny;
      } else st.replan = 0;
      if (st.path.length > 1 && Math.hypot(st.path[1][0] - st.x, st.path[1][1] - st.y) < 0.6) st.path.shift();
    }
    if (Math.hypot(gx - st.x, gy - st.y) < 0.8) {
      st.goal = (st.goal + 1) % GOALS.length;
      st.legs++;
      st.path = [];
      let k = 0;
      for (let i = 0; i < st.known.length; i++) if (st.known[i]) k++;
      if (k / st.known.length > 0.78 || st.legs >= GOALS.length * 2) {
        st.known.fill(0);
        st.legs = 0;
      }
    }

  }

  draw(box: CanvasBox) {
    const ctx = box.ctx;
    if (!ctx) return;
    const pal = readPalette();
    const st = this.st;
    const cs = Math.min(box.w / GW, box.h / GH);
    const ox = (box.w - cs * GW) / 2;
    const oy = (box.h - cs * GH) / 2;
    const X = (x: number) => ox + x * cs;
    const Y = (y: number) => oy + y * cs;
    ctx.clearRect(0, 0, box.w, box.h);

    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        const k = st.known[j * GW + i];
        if (!k) continue;
        ctx.fillStyle = k === 2 ? pal.z[8] : pal.z[3];
        ctx.fillRect(X(i) + 0.5, Y(j) + 0.5, cs - 1, cs - 1);
      }

    // range ring
    ctx.strokeStyle = pal.z[5];
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(X(st.x), Y(st.y), RANGE * cs, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // sweep wedge
    for (let k = 0; k < 12; k++) {
      const a1 = st.angle - k * 0.06;
      const a0 = a1 - 0.06;
      ctx.fillStyle = alpha(pal.z[9], 0.16 * (1 - k / 12));
      ctx.beginPath();
      ctx.moveTo(X(st.x), Y(st.y));
      ctx.arc(X(st.x), Y(st.y), RANGE * cs, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = alpha(pal.z[10], 0.85);
    ctx.beginPath();
    ctx.moveTo(X(st.x), Y(st.y));
    ctx.lineTo(X(st.x + Math.cos(st.angle) * st.beamEnd), Y(st.y + Math.sin(st.angle) * st.beamEnd));
    ctx.stroke();

    for (const h of st.hits) {
      ctx.fillStyle = alpha(pal.z[10], 1 - h.age / 0.9);
      ctx.fillRect(X(h.x) - 1, Y(h.y) - 1, 2, 2);
    }

    // planned path
    if (st.path.length > 1) {
      ctx.strokeStyle = pal.fix;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(st.x), Y(st.y));
      for (let k = 1; k < st.path.length; k++) ctx.lineTo(X(st.path[k][0]), Y(st.path[k][1]));
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // goal fix
    const [gx, gy] = GOALS[st.goal];
    ctx.strokeStyle = pal.fix;
    ctx.beginPath();
    ctx.arc(X(gx), Y(gy), cs * 0.9, 0, Math.PI * 2);
    ctx.moveTo(X(gx) - cs * 1.6, Y(gy));
    ctx.lineTo(X(gx) + cs * 1.6, Y(gy));
    ctx.moveTo(X(gx), Y(gy) - cs * 1.6);
    ctx.lineTo(X(gx), Y(gy) + cs * 1.6);
    ctx.stroke();
    ctx.font = sansFont(pal, 10, 600);
    ctx.fillStyle = pal.fix;
    const gl = gx > GW / 2 ? -32 : cs * 1.8;
    ctx.fillText("GOAL", X(gx) + gl, Y(gy) - cs * 1.2);

    // rover
    ctx.save();
    ctx.translate(X(st.x), Y(st.y));
    ctx.rotate(st.hd);
    ctx.fillStyle = pal.z[10];
    ctx.fillRect(-cs * 0.7, -cs * 0.45, cs * 1.4, cs * 0.9);
    ctx.strokeStyle = pal.z[0];
    ctx.beginPath();
    ctx.moveTo(cs * 0.1, 0);
    ctx.lineTo(cs * 0.6, 0);
    ctx.stroke();
    ctx.restore();

  }

  /** a few seconds of survey so the first and still frames already show a map */
  warm() {
    const st = this.st;
    if (st.legs > 0 || st.known.some((v) => v)) return false;
    for (let i = 0; i < 6 * 30; i++) this.advance(1 / 30);
    return true;
  }

  dueReadout(dt: number) {
    this.st.readAcc += dt;
    if (this.st.readAcc <= 0.2) return false;
    this.st.readAcc = 0;
    return true;
  }

  writeReadouts(knownEl: HTMLElement | null, headEl: HTMLElement | null) {
    const st = this.st;
    let k = 0;
    for (let i = 0; i < st.known.length; i++) if (st.known[i]) k++;
    if (knownEl) knownEl.textContent = `${Math.round((k / st.known.length) * 100)}%`;
    const deg = ((((st.hd * 180) / Math.PI) % 360) + 450) % 360; // compass: 0° = north
    if (headEl) headEl.textContent = `${String(Math.round(deg)).padStart(3, "0")}°`;
  }
}

export function Lidar({ active = true }: { active?: boolean }) {
  const scope = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const knownOut = useRef<HTMLSpanElement>(null);
  const headOut = useRef<HTMLSpanElement>(null);
  const [sim] = useState(() => new LidarRun());

  const box = useCanvas(canvas, (b) => sim.draw(b));

  useLoop(scope, active, (dt) => {
    sim.advance(dt);
    sim.draw(box.current);
    if (sim.dueReadout(dt)) sim.writeReadouts(knownOut.current, headOut.current);
  });

  useEffect(() => {
    if (!sim.warm()) return;
    sim.writeReadouts(knownOut.current, headOut.current);
    sim.draw(box.current);
  }, [sim, box]);

  return (
    <Frame
      title="LiDAR sweep · occupancy grid"
      station="A.T.O.M Robotics Lab · 2024"
      axis="occupancy grid · 48 × 32 cells"
      badge={{ label: "Robotics", glyph: <Glyph name="robotics" /> }}
      figures={[
        { v: "Mars rover", k: "prototype" },
        { v: "ROS2", k: "+ Python" },
        { v: "LiDAR + IMU", k: "sensor fusion" },
      ]}
      readouts={[
        { k: "Mapped", v: <span ref={knownOut}>—</span>, live: true },
        { k: "IMU heading", v: <span ref={headOut}>—</span>, live: true },
        { k: "Path planning", v: "re-plans as it maps" },
      ]}
      caption="Autonomous GPS navigation with path planning and obstacle avoidance, tested in Gazebo simulations."
    >
      <div ref={scope} className={s.fill}>
        <canvas ref={canvas} aria-hidden="true" />
      </div>
    </Frame>
  );
}
