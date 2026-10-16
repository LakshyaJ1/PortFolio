"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePageVisible, useReducedMotion } from "@/lib/hooks";
import { Icon } from "@/components/ui/Icon";
import { GameFrame, HoldButton } from "./GameFrame";
import { alpha, blip, mulberry32, readPalette, useBest, useFrame, useStage, type GameStatus, type Palette } from "./engine";
import {
  BEACON_R,
  FIX_COST_S,
  LIDAR_R,
  TARGET_R,
  UNIT_M,
  beacon,
  makeWorld,
  newRover,
  requestFix,
  scan,
  sigma,
  stepRover,
  type Input,
  type Rover as RoverState,
  type World,
} from "./rover-sim";
import styles from "./Game.module.css";

const PAD = 28;
const KEYS: Record<string, keyof Input> = {
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right",
};

type Hud = {
  hdg: string;
  spd: string;
  odo: string;
  bat: number;
  gps: string;
  gpsTone?: "fix" | "alert" | "dim";
  fixes: number;
  sigma: string;
  beacon: string;
  time: string;
};

type Result =
  | { kind: "won"; time: number; fixes: number; score: number; drift: number; bumps: number; record: boolean }
  | { kind: "flat"; time: number; fixes: number; left: number };

const EMPTY_HUD: Hud = {
  hdg: "—",
  spd: "0.0 m/s",
  odo: "0.0 m",
  bat: 100,
  gps: "READY",
  fixes: 0,
  sigma: "±0.1 m",
  beacon: "—",
  time: "0.0 s",
};

function compass(th: number) {
  // canvas: x right, y down. Compass: 0 = north (up), clockwise.
  const deg = ((th * 180) / Math.PI + 90 + 360) % 360;
  return `${String(Math.round(deg) % 360).padStart(3, "0")}°`;
}

type View = { scale: number; ox: number; oy: number };

function fit(world: World, w: number, h: number): View {
  const scale = Math.min((w - PAD * 2) / world.w, (h - PAD * 2) / world.h);
  return { scale, ox: (w - world.w * scale) / 2, oy: (h - world.h * scale) / 2 };
}

/** Static layer: sheet, contours, denied zones, grid refs. Redrawn only on resize or a new world. */
function paintBase(world: World, w: number, h: number, dpr: number, p: Palette) {
  const c = document.createElement("canvas");
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const v = fit(world, w, h);
  const sx = (x: number) => v.ox + x * v.scale;
  const sy = (y: number) => v.oy + y * v.scale;

  ctx.fillStyle = p.z0;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = p.z1;
  ctx.fillRect(sx(0), sy(0), world.w * v.scale, world.h * v.scale);

  // contours
  for (const lvl of world.contours) {
    ctx.strokeStyle = lvl.index ? p.z6 : p.z5;
    ctx.lineWidth = lvl.index ? 1.3 : 0.9;
    ctx.beginPath();
    const s = lvl.seg;
    for (let i = 0; i < s.length; i += 4) {
      ctx.moveTo(sx(s[i]), sy(s[i + 1]));
      ctx.lineTo(sx(s[i + 2]), sy(s[i + 3]));
    }
    ctx.stroke();
  }

  // GNSS-denied zones: hatched
  for (const z of world.zones) {
    ctx.save();
    ctx.translate(sx(z.x), sy(z.y));
    ctx.rotate(z.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, z.rx * v.scale, z.ry * v.scale, 0, 0, Math.PI * 2);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = alpha(p.z0, 0.35);
    ctx.fillRect(-z.rx * v.scale, -z.ry * v.scale, z.rx * v.scale * 2, z.ry * v.scale * 2);
    ctx.strokeStyle = alpha(p.z6, 0.9);
    ctx.lineWidth = 1;
    const R = Math.max(z.rx, z.ry) * v.scale;
    ctx.beginPath();
    for (let k = -R * 2; k < R * 2; k += 7) {
      ctx.moveTo(k - R, -R);
      ctx.lineTo(k + R, R);
    }
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, 0, z.rx * v.scale, z.ry * v.scale, 0, 0, Math.PI * 2);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = p.z7;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.save();
    ctx.font = `600 9px ${p.mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = "GNSS DENIED";
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = p.z1;
    ctx.fillRect(sx(z.x) - tw / 2, sy(z.y) - 8, tw, 16);
    ctx.fillStyle = p.z8;
    ctx.fillText(label, sx(z.x), sy(z.y) + 0.5);
    ctx.restore();
  }

  // neatline with grid refs A–J, 1–9
  ctx.strokeStyle = p.z6;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(sx(0)) + 0.5, Math.round(sy(0)) + 0.5, Math.round(world.w * v.scale), Math.round(world.h * v.scale));
  ctx.fillStyle = p.z7;
  ctx.font = `500 9px ${p.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (let i = 0; i < 10; i++) {
    const x = sx(((i + 0.5) / 10) * world.w);
    ctx.fillText(String.fromCharCode(65 + i), x, sy(0) - 7);
    ctx.fillRect(Math.round(sx((i / 10) * world.w)), sy(0) - 5, 1, 5);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let j = 0; j < 9; j++) {
    ctx.fillText(String(j + 1), sx(0) - 8, sy(((j + 0.5) / 9) * world.h));
    ctx.fillRect(sx(0) - 5, Math.round(sy((j / 9) * world.h)), 5, 1);
  }

  // scale bar: 10 m
  const len = (10 / UNIT_M) * v.scale;
  const bx = sx(world.w) - len;
  const by = sy(world.h) + 14;
  if (by < h - 2) {
    ctx.fillStyle = p.z8;
    ctx.fillRect(bx, by, len / 2, 3);
    ctx.fillStyle = p.z5;
    ctx.fillRect(bx + len / 2, by, len / 2, 3);
    ctx.fillStyle = p.z7;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("10 M", bx - 6, by + 2);
  }
  return c;
}

export function Rover({ onClose }: { onClose?: () => void }) {
  const { wrapRef, canvasRef, size } = useStage();
  const [status, setStatus] = useState<GameStatus>("briefing");
  const [best, submitBest] = useBest("rover");
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [result, setResult] = useState<Result | null>(null);
  const [live, setLive] = useState("");
  const [fixReady, setFixReady] = useState(true);
  const visible = usePageVisible();
  const reduce = useReducedMotion();

  const world = useRef<World | null>(null);
  const rover = useRef<RoverState | null>(null);
  const input = useRef<Input>({ up: false, down: false, left: false, right: false });
  const pal = useRef<Palette | null>(null);
  const base = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const rnd = useRef<(() => number) | null>(null);
  const hudAcc = useRef(0);

  const draw = useCallback(
    (now = performance.now()) => {
      const canvas = canvasRef.current;
      const wd = world.current;
      const r = rover.current;
      if (!canvas || !wd || !r || !size.w) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const p = (pal.current ??= readPalette());
      const { w, h, dpr } = size;
      const key = `${w}x${h}@${dpr}:${wd.seed}`;
      if (base.current?.key !== key) base.current = { key, canvas: paintBase(wd, w, h, dpr, p) };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base.current.canvas, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const v = fit(wd, w, h);
      const sx = (x: number) => v.ox + x * v.scale;
      const sy = (y: number) => v.oy + y * v.scale;
      const S = v.scale;
      const t = now / 1000;
      const ended = r.done !== null;

      // the target flag
      const tx = sx(wd.target.x);
      const ty = sy(wd.target.y);
      const bc = beacon(r, wd);
      if (bc !== null && !reduce && !ended) {
        const ph = (t * 1.2) % 1;
        ctx.strokeStyle = alpha(p.fix, 0.5 * (1 - ph));
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, TARGET_R * S + ph * BEACON_R * S * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = p.z8;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(tx, ty, TARGET_R * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = p.z10;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx, ty - 22);
      ctx.stroke();
      ctx.fillStyle = p.z10;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 22);
      ctx.lineTo(tx + 13, ty - 17.5);
      ctx.lineTo(tx, ty - 13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.fix;
      ctx.beginPath();
      ctx.arc(tx, ty, 3, 0, Math.PI * 2);
      ctx.fill();

      // fixes, joined by the traverse
      ctx.strokeStyle = p.z7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      r.fixes.forEach((f, i) => (i ? ctx.lineTo(sx(f.x), sy(f.y)) : ctx.moveTo(sx(f.x), sy(f.y))));
      ctx.stroke();
      ctx.font = `500 9px ${p.mono}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      r.fixes.forEach((f, i) => {
        const fx = sx(f.x);
        const fy = sy(f.y);
        ctx.strokeStyle = p.fix;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(fx, fy, 4.5, 0, Math.PI * 2);
        ctx.moveTo(fx, fy - 8);
        ctx.lineTo(fx, fy - 6);
        ctx.moveTo(fx, fy + 6);
        ctx.lineTo(fx, fy + 8);
        ctx.moveTo(fx - 8, fy);
        ctx.lineTo(fx - 6, fy);
        ctx.moveTo(fx + 6, fy);
        ctx.lineTo(fx + 8, fy);
        ctx.stroke();
        ctx.fillStyle = p.z8;
        ctx.fillText(i === 0 ? "START" : `F${i}`, fx + 8, fy - 6);
      });

      // dead-reckoned track since the last fix
      const last = r.fixes[r.fixes.length - 1];
      if (!ended) {
        ctx.setLineDash([1.5, 4]);
        ctx.strokeStyle = p.z8;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(sx(last.x), sy(last.y));
        const ep = r.estPath;
        for (let i = last.idx; i < ep.length; i += 2) ctx.lineTo(sx(ep[i]), sy(ep[i + 1]));
        ctx.lineTo(sx(r.ex), sy(r.ey));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const ex = sx(r.ex);
      const ey = sy(r.ey);

      if (!ended) {
        // LiDAR ring, sweep and returns
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = p.z6;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ex, ey, LIDAR_R * S, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!reduce) {
          const a = r.sweep + r.bias;
          ctx.strokeStyle = alpha(p.z8, 0.45);
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex + Math.cos(a) * LIDAR_R * S, ey + Math.sin(a) * LIDAR_R * S);
          ctx.stroke();
          for (const q of r.returns) {
            const age = (r.t - q.t) / 1.6;
            ctx.fillStyle = alpha(p.z10, Math.max(0, 1 - age));
            ctx.fillRect(sx(q.x) - 1.2, sy(q.y) - 1.2, 2.4, 2.4);
          }
        } else {
          ctx.fillStyle = p.z10;
          for (const q of scan(r, wd)) ctx.fillRect(sx(q.x) - 1.2, sy(q.y) - 1.2, 2.4, 2.4);
        }

        // uncertainty
        const sg = sigma(r) * S;
        ctx.fillStyle = alpha(p.z8, 0.06);
        ctx.strokeStyle = p.z8;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(ex, ey, Math.max(sg, 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // acquiring a fix
        if (r.acquiring > 0) {
          const k = 1 - r.acquiring / 0.9;
          ctx.strokeStyle = alpha(p.fix, 0.8 * (1 - k));
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ex, ey, 6 + (reduce ? 10 : k * 26), 0, Math.PI * 2);
          ctx.stroke();
        }
        if (r.bumpT < 0.5) {
          ctx.strokeStyle = alpha(p.alert, 1 - r.bumpT / 0.5);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ex, ey, 14, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (r.nofixT < 1.4) {
          ctx.font = `600 10px ${p.mono}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = p.alert;
          ctx.fillText("NO FIX · MASKED", ex, ey - 18);
        }
      } else {
        // the reveal: where it thought it went vs where it went
        const line = (pts: number[]) => {
          ctx.beginPath();
          for (let i = 0; i < pts.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, sx(pts[i]), sy(pts[i + 1]));
          ctx.stroke();
        };
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = p.z8;
        ctx.lineWidth = 1.25;
        line(r.estPath);
        ctx.setLineDash([]);
        ctx.strokeStyle = p.z10;
        ctx.lineWidth = 1.75;
        line(r.truePath);
        ctx.font = `600 9px ${p.mono}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = p.z10;
        ctx.fillText("TRUE TRACK", sx(r.x) + 12, sy(r.y) + 12);
        ctx.fillStyle = p.z8;
        ctx.fillText("DEAD-RECKONED", ex + 12, ey - 12);
        ctx.strokeStyle = p.z10;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx(r.x), sy(r.y), 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // the rover, drawn where it thinks it is
      const eth = r.th + r.bias;
      const len = Math.max(14, 20 * S);
      const wid = Math.max(9, 13 * S);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(eth);
      ctx.fillStyle = p.z3;
      ctx.strokeStyle = r.done === "flat" ? p.alert : p.z10;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(-len / 2, -wid / 2, len, wid);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-len / 2 + 3, -wid / 2 - 2);
      ctx.lineTo(len / 2 - 3, -wid / 2 - 2);
      ctx.moveTo(-len / 2 + 3, wid / 2 + 2);
      ctx.lineTo(len / 2 - 3, wid / 2 + 2);
      ctx.stroke();
      ctx.fillStyle = p.fix;
      ctx.beginPath();
      ctx.arc(len / 2 - 3.5, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    [canvasRef, size, reduce],
  );

  const pushHud = useCallback(() => {
    const r = rover.current;
    const wd = world.current;
    if (!r || !wd) return;
    const bc = beacon(r, wd);
    const gps =
      r.acquiring > 0
        ? { gps: "ACQUIRING", gpsTone: "fix" as const }
        : r.nofixT < 1.4
          ? { gps: "NO FIX", gpsTone: "alert" as const }
          : r.cooldown > 0
            ? { gps: `WAIT ${r.cooldown.toFixed(1)} S`, gpsTone: "dim" as const }
            : { gps: "READY", gpsTone: undefined };
    setHud({
      hdg: compass(r.th + r.bias),
      spd: `${(Math.abs(r.v) * UNIT_M).toFixed(1)} m/s`,
      odo: `${(r.odo * UNIT_M).toFixed(1)} m`,
      bat: Math.max(0, Math.round(r.battery)),
      ...gps,
      fixes: r.fixCount,
      sigma: `±${(sigma(r) * UNIT_M).toFixed(1)} m`,
      beacon: bc === null ? "—" : bc.toFixed(2),
      time: `${r.t.toFixed(1)} s`,
    });
    setFixReady(r.cooldown <= 0 && r.acquiring <= 0);
  }, []);

  const newWorld = useCallback(() => {
    if (!size.w) return;
    const random = (rnd.current ??= mulberry32(Date.now() >>> 0));
    const seed = (random() * 2 ** 31) >>> 0;
    const wd = makeWorld(size.w / Math.max(1, size.h), seed);
    world.current = wd;
    rover.current = newRover(wd, random);
    input.current = { up: false, down: false, left: false, right: false };
    setResult(null);
    pushHud();
  }, [size.w, size.h, pushHud]);

  // A world for the briefing as soon as the stage has a size.
  useEffect(() => {
    if (status === "briefing" || !world.current) newWorld();
  }, [size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    draw();
  }, [draw, status, size, result]);

  const finish = (kind: "won" | "flat") => {
    const r = rover.current!;
    const wd = world.current!;
    if (kind === "won") {
      const score = Math.round((r.t + r.fixCount * FIX_COST_S) * 10) / 10;
      const record = submitBest(score, "lower");
      setResult({
        kind,
        time: r.t,
        fixes: r.fixCount,
        score,
        drift: Math.hypot(r.ex - r.x, r.ey - r.y) * UNIT_M,
        bumps: r.bumps,
        record,
      });
      setLive(`Target reached in ${r.t.toFixed(1)} seconds with ${r.fixCount} fixes. Score ${score}.`);
      blip(660, 0.08, "square", 0.04);
      blip(990, 0.12, "square", 0.04, 0.09);
    } else {
      const left = Math.hypot(r.x - wd.target.x, r.y - wd.target.y) * UNIT_M;
      setResult({ kind, time: r.t, fixes: r.fixCount, left });
      setLive(`Battery flat, ${left.toFixed(0)} metres from the flag.`);
      blip(160, 0.3, "sawtooth", 0.04);
    }
    setStatus("over");
  };

  useFrame(status === "playing" && visible, (dt, now) => {
    const r = rover.current;
    const wd = world.current;
    if (!r || !wd) return;
    const ev = stepRover(r, wd, input.current, dt, rnd.current ?? Math.random, !reduce);
    for (const e of ev) {
      if (e === "fix") {
        blip(1320, 0.05, "square", 0.03);
        setLive(`Fix ${r.fixCount} acquired.`);
      } else if (e === "nofix") {
        blip(220, 0.12, "square", 0.03);
        setLive("No fix. Signal masked in a GNSS-denied zone.");
      } else if (e === "bump") {
        blip(110, 0.09, "triangle", 0.05);
        setLive("Bumped a boulder.");
      } else if (e === "low") {
        setLive("Battery below 20 percent.");
      }
    }
    draw(now);
    hudAcc.current += dt;
    if (hudAcc.current > 0.1 || ev.length) {
      hudAcc.current = 0;
      pushHud();
    }
    if (ev.includes("won")) finish("won");
    else if (ev.includes("flat")) finish("flat");
  });

  const fix = () => {
    const r = rover.current;
    if (!r || status !== "playing") return;
    if (requestFix(r)) {
      blip(990, 0.04, "square", 0.025);
      setLive("Requesting a GPS fix.");
      pushHud();
    }
  };

  const start = () => {
    if (status !== "briefing") newWorld();
    setStatus("playing");
    setLive("Started. Drive by the estimate. F requests a fix.");
  };

  const onKey = (e: KeyboardEvent, down: boolean) => {
    const k = e.key.toLowerCase();
    const dir = KEYS[k];
    if (dir) {
      input.current[dir] = down;
      return true;
    }
    if ((k === "f" || k === " ") && down) {
      if (!e.repeat) fix();
      return true;
    }
    return false;
  };

  const pause = () => {
    input.current = { up: false, down: false, left: false, right: false };
    setStatus("paused");
  };

  const r = result;
  return (
    <GameFrame
      title="GPS-denied rover"
      status={status}
      onStart={start}
      onPause={pause}
      onResume={() => setStatus("playing")}
      onRestart={() => {
        newWorld();
        setStatus("playing");
      }}
      onClose={onClose}
      best={best === null ? null : `${best.toFixed(1)}`}
      bestLabel="Best score"
      startLabel="Drive"
      onKey={onKey}
      readouts={[
        { label: "Hdg", value: hud.hdg },
        { label: "Spd", value: hud.spd },
        { label: "Odo", value: hud.odo },
        { label: "Bat", value: `${hud.bat}%`, tone: hud.bat < 20 ? "alert" : undefined },
        { label: "GPS", value: hud.gps, tone: hud.gpsTone },
        { label: "Fixes", value: hud.fixes },
        { label: "Est err", value: hud.sigma },
        { label: "Beacon", value: hud.beacon, tone: hud.beacon === "—" ? "dim" : "fix" },
        { label: "Time", value: hud.time, wide: true },
      ]}
      briefing={
        <>
          <p>
            Drive to the <strong>flag</strong> with no satellite positioning. The rover marker is where it{" "}
            <em>thinks</em> it is: gyro heading plus wheel odometry. The gyro drifts and wheels slip on slopes, so
            the estimate wanders. The dashed circle is its uncertainty.
          </p>
          <p>
            Press <strong>F</strong> for a GPS fix to snap back to the truth. A fix takes a second, then a few to
            recharge, never works in <strong>hatched GNSS-denied zones</strong>, and adds {FIX_COST_S} s to your
            score. LiDAR paints boulders inside its ring; the flag&rsquo;s beacon reads out when you&rsquo;re close.
            Battery drains as you climb.
          </p>
        </>
      }
      controls={[
        { keys: ["Up", "W"], label: "Drive" },
        { keys: ["Down", "S"], label: "Brake / reverse" },
        { keys: ["Left", "Right"], label: "Steer" },
        { keys: ["F"], label: "Request GPS fix" },
        { keys: ["P"], label: "Pause" },
        { keys: ["Esc"], label: "Close" },
      ]}
      results={
        r ? (
          r.kind === "won" ? (
            <div className={styles.result}>
              <p className={styles.resultTitle}>Target reached</p>
              <p className={styles.resultLine}>
                <strong>{r.time.toFixed(1)} s</strong> + {r.fixes} {r.fixes === 1 ? "fix" : "fixes"} × {FIX_COST_S} s ={" "}
                <strong>{r.score.toFixed(1)}</strong>
              </p>
              <p className={styles.resultLine}>
                Estimate was {r.drift.toFixed(1)} m off at arrival · {r.bumps} {r.bumps === 1 ? "bump" : "bumps"}
              </p>
              <p className={styles.resultLine}>
                {r.record ? (
                  <span className={styles.record}>New best on this device. Lower is better.</span>
                ) : (
                  <>Best {best?.toFixed(1) ?? r.score.toFixed(1)} · lower is better</>
                )}
              </p>
              <p className={styles.resultLine}>The map now shows the true track against the dead-reckoned one.</p>
            </div>
          ) : (
            <div className={styles.result}>
              <p className={styles.resultTitle}>Battery flat</p>
              <p className={styles.resultLine}>
                Stranded <strong>{r.left.toFixed(0)} m</strong> from the flag after {r.time.toFixed(1)} s and {r.fixes}{" "}
                {r.fixes === 1 ? "fix" : "fixes"}.
              </p>
              <p className={styles.resultLine}>Climbing drains the cells. Contours bunch up where it&rsquo;s steep.</p>
            </div>
          )
        ) : null
      }
      touch={
        <>
          <div className={styles.padGroup}>
            <HoldButton label="Steer left" onChange={(d) => (input.current.left = d)}>
              <Icon name="arrow-right" size={20} className={styles.flip} />
            </HoldButton>
            <HoldButton label="Steer right" onChange={(d) => (input.current.right = d)}>
              <Icon name="arrow-right" size={20} />
            </HoldButton>
          </div>
          <button
            type="button"
            className={[styles.pad, styles.padFix].join(" ")}
            data-wide=""
            onClick={fix}
            disabled={!fixReady || status !== "playing"}
            aria-label="Request GPS fix"
          >
            Fix
          </button>
          <div className={styles.padGroup}>
            <HoldButton label="Brake or reverse" onChange={(d) => (input.current.down = d)}>
              <Icon name="arrow-down" size={20} />
            </HoldButton>
            <HoldButton label="Drive" onChange={(d) => (input.current.up = d)}>
              <Icon name="arrow-up" size={20} />
            </HoldButton>
          </div>
        </>
      }
      note={`Simulated terrain · score = time + ${FIX_COST_S} s per fix · lower is better`}
      stageLabel="Rover map. Arrow keys drive, F requests a GPS fix."
      stageRef={wrapRef}
      live={live}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </GameFrame>
  );
}
