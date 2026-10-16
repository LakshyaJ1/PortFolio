"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePageVisible, useReducedMotion } from "@/lib/hooks";
import { Icon } from "@/components/ui/Icon";
import { GameFrame } from "./GameFrame";
import { alpha, blip, readPalette, useBest, useFrame, useStage, type GameStatus, type Palette } from "./engine";
import styles from "./Game.module.css";

type Cell = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";
const VEC: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPP: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
const KEYS: Record<string, Dir> = {
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right",
};

type Board = {
  cols: number;
  rows: number;
  snake: Cell[];
  dir: Dir;
  queue: Dir[];
  food: Cell;
  acc: number;
  tick: number;
  score: number;
  dead: boolean;
  t: number;
};

const PAD = 22;

function makeBoard(w: number, h: number): Board {
  const target = w < 560 ? 20 : 26;
  const cols = Math.max(12, Math.min(34, Math.floor((w - PAD * 2) / target)));
  const rows = Math.max(10, Math.min(24, Math.floor((h - PAD * 2) / target)));
  const cy = Math.floor(rows / 2);
  const cx = Math.floor(cols / 3);
  const snake = [0, 1, 2, 3].map((i) => ({ x: cx - i, y: cy }));
  const b: Board = { cols, rows, snake, dir: "right", queue: [], food: { x: 0, y: 0 }, acc: 0, tick: 140, score: 0, dead: false, t: 0 };
  b.food = placeFood(b);
  return b;
}

function placeFood(b: Board): Cell {
  const taken = new Set(b.snake.map((c) => `${c.x},${c.y}`));
  const free: Cell[] = [];
  for (let y = 0; y < b.rows; y++) for (let x = 0; x < b.cols; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
  return free[Math.floor(Math.random() * free.length)] ?? { x: 0, y: 0 };
}

/** Classic snake on a survey grid. Exported for the 404 page (embedded). */
export function Snake({ onClose, embedded = false }: { onClose?: () => void; embedded?: boolean }) {
  const { wrapRef, canvasRef, size } = useStage();
  const [status, setStatus] = useState<GameStatus>("briefing");
  const [best, submitBest] = useBest("snake");
  const [score, setScore] = useState(0);
  const [length, setLength] = useState(4);
  const [grid, setGrid] = useState("—");
  const [result, setResult] = useState<{ score: number; length: number; record: boolean; wall: boolean } | null>(null);
  const [live, setLive] = useState("");
  const visible = usePageVisible();
  const reduce = useReducedMotion();
  const board = useRef<Board | null>(null);
  const pal = useRef<Palette | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const b = board.current;
    if (!canvas || !b || !size.w) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = (pal.current ??= readPalette());
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = p.z1;
    ctx.fillRect(0, 0, w, h);

    const cell = Math.floor(Math.min((w - PAD * 2) / b.cols, (h - PAD * 2) / b.rows));
    const bw = cell * b.cols;
    const bh = cell * b.rows;
    const ox = Math.round((w - bw) / 2);
    const oy = Math.round((h - bh) / 2);

    // survey grid: fine cells, index lines every five, refs on the edge
    ctx.lineWidth = 1;
    for (let x = 0; x <= b.cols; x++) {
      ctx.strokeStyle = x % 5 === 0 ? p.z4 : p.z3;
      ctx.beginPath();
      ctx.moveTo(ox + x * cell + 0.5, oy);
      ctx.lineTo(ox + x * cell + 0.5, oy + bh);
      ctx.stroke();
    }
    for (let y = 0; y <= b.rows; y++) {
      ctx.strokeStyle = y % 5 === 0 ? p.z4 : p.z3;
      ctx.beginPath();
      ctx.moveTo(ox, oy + y * cell + 0.5);
      ctx.lineTo(ox + bw, oy + y * cell + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = p.z6;
    ctx.strokeRect(ox + 0.5, oy + 0.5, bw, bh);
    ctx.fillStyle = p.z7;
    ctx.font = `500 9px ${p.mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (let x = 0; x < b.cols; x += 5) ctx.fillText(String.fromCharCode(65 + x / 5), ox + (x + Math.min(5, b.cols - x) / 2) * cell, oy - 6);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = 0; y < b.rows; y += 5) ctx.fillText(String(y / 5 + 1), ox - 6, oy + (y + Math.min(5, b.rows - y) / 2) * cell);

    const cx = (c: Cell) => ox + (c.x + 0.5) * cell;
    const cy = (c: Cell) => oy + (c.y + 0.5) * cell;

    // the food: a surveyed benchmark (triangle with a centre point)
    const f = b.food;
    const r = cell * 0.36;
    const pulse = reduce ? 0 : (Math.sin(b.t * 4) + 1) / 2;
    if (!reduce) {
      ctx.strokeStyle = alpha(p.z8, 0.35 * (1 - pulse));
      ctx.beginPath();
      ctx.arc(cx(f), cy(f), r + 4 + pulse * cell * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = p.z10;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx(f), cy(f) - r);
    ctx.lineTo(cx(f) + r * 0.95, cy(f) + r * 0.65);
    ctx.lineTo(cx(f) - r * 0.95, cy(f) + r * 0.65);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = p.z10;
    ctx.beginPath();
    ctx.arc(cx(f), cy(f) + r * 0.1, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // the snake: a traverse ringed by its own contour line
    const path = () => {
      ctx.beginPath();
      b.snake.forEach((c, i) => (i ? ctx.lineTo(cx(c), cy(c)) : ctx.moveTo(cx(c), cy(c))));
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    path();
    ctx.strokeStyle = b.dead ? p.alert : p.z6;
    ctx.lineWidth = cell * 0.9;
    ctx.stroke();
    path();
    ctx.strokeStyle = p.z1;
    ctx.lineWidth = cell * 0.9 - 3;
    ctx.stroke();
    path();
    ctx.strokeStyle = p.z9;
    ctx.lineWidth = cell * 0.42;
    ctx.stroke();

    const head = b.snake[0];
    ctx.fillStyle = b.dead ? p.alert : p.fix;
    ctx.beginPath();
    ctx.arc(cx(head), cy(head), cell * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = b.dead ? p.alert : p.fix;
    ctx.lineWidth = 1.5;
    const v = VEC[b.dir];
    ctx.beginPath();
    ctx.moveTo(cx(head) + v.x * cell * 0.38, cy(head) + v.y * cell * 0.38);
    ctx.lineTo(cx(head) + v.x * cell * 0.62, cy(head) + v.y * cell * 0.62);
    ctx.stroke();
  }, [canvasRef, size, reduce]);

  const reset = useCallback(() => {
    if (!size.w) return;
    board.current = makeBoard(size.w, size.h);
    setGrid(`${board.current.cols}×${board.current.rows}`);
    setScore(0);
    setLength(4);
    setResult(null);
  }, [size.w, size.h]);

  // A fresh board for the briefing whenever the stage is (re)measured.
  useEffect(() => {
    if (status === "briefing" || !board.current) reset();
  }, [size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    draw();
  }, [draw, status, size]);

  const die = (wall: boolean) => {
    const b = board.current!;
    b.dead = true;
    const record = b.score > 0 && submitBest(b.score, "higher");
    setResult({ score: b.score, length: b.snake.length, record, wall });
    setStatus("over");
    setLive(`Game over. ${b.score} benchmarks surveyed.`);
    blip(180, 0.25, "sawtooth", 0.04);
  };

  const step = () => {
    const b = board.current!;
    while (b.queue.length) {
      const d = b.queue.shift()!;
      if (d !== OPP[b.dir] && d !== b.dir) {
        b.dir = d;
        break;
      }
    }
    const v = VEC[b.dir];
    const head = { x: b.snake[0].x + v.x, y: b.snake[0].y + v.y };
    if (head.x < 0 || head.y < 0 || head.x >= b.cols || head.y >= b.rows) return die(true);
    const eating = head.x === b.food.x && head.y === b.food.y;
    const body = eating ? b.snake : b.snake.slice(0, -1);
    if (body.some((c) => c.x === head.x && c.y === head.y)) return die(false);
    b.snake.unshift(head);
    if (eating) {
      b.score += 1;
      b.tick = Math.max(68, 140 - b.score * 3.5);
      b.food = placeFood(b);
      setScore(b.score);
      setLength(b.snake.length);
      blip(880, 0.06);
    } else {
      b.snake.pop();
    }
  };

  useFrame(status === "playing" && visible, (dt) => {
    const b = board.current;
    if (!b) return;
    b.t += dt;
    b.acc += dt * 1000;
    let guard = 0;
    while (b.acc >= b.tick && !b.dead && guard++ < 4) {
      b.acc -= b.tick;
      step();
    }
    draw();
  });

  const turn = (d: Dir) => {
    const b = board.current;
    if (!b || b.dead) return;
    const last = b.queue[b.queue.length - 1] ?? b.dir;
    if (d === last || d === OPP[last] || b.queue.length >= 3) return;
    b.queue.push(d);
  };

  const start = () => {
    reset();
    setStatus("playing");
    setLive("Started. Arrow keys steer.");
  };

  const onKey = (e: KeyboardEvent, down: boolean) => {
    const d = KEYS[e.key.toLowerCase()];
    if (!d) return false;
    if (down) turn(d);
    return true;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || status !== "playing") return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };

  return (
    <GameFrame
      title="Survey snake"
      status={status}
      embedded={embedded}
      onKey={onKey}
      onStart={start}
      onPause={() => setStatus("paused")}
      onResume={() => setStatus("playing")}
      onRestart={start}
      onClose={onClose}
      best={best === null ? null : String(best)}
      readouts={[
        { label: "Benchmarks", value: score, tone: "fix" },
        { label: "Length", value: length },
        { label: "Grid", value: grid, tone: "dim" },
      ]}
      briefing={
        <>
          <p>
            Survey every <strong>benchmark</strong> (the triangle) you can. Each one lengthens the traverse and speeds
            the walk up.
          </p>
          <p>Stay on the sheet and never cross your own line.</p>
          {embedded ? <p>Arrow keys or WASD steer, P pauses, R restarts. On a phone, swipe or use the pad.</p> : null}
        </>
      }
      controls={[
        { keys: ["Arrows", "WASD"], label: "Steer (or swipe)" },
        { keys: ["P"], label: "Pause" },
        { keys: ["R"], label: "Restart" },
        ...(embedded ? [] : [{ keys: ["Esc"], label: "Close" }]),
      ]}
      results={
        result ? (
          <div className={styles.result}>
            <p className={styles.resultTitle}>{result.wall ? "Walked off the sheet" : "Crossed your own traverse"}</p>
            <p className={styles.resultLine}>
              <strong>{result.score}</strong> benchmarks · length <strong>{result.length}</strong>
            </p>
            <p className={styles.resultLine}>
              {result.record ? <span className={styles.record}>New best on this device.</span> : <>Best {best ?? result.score}</>}
            </p>
          </div>
        ) : null
      }
      touch={
        <div className={styles.dpad} aria-label="Steering">
          {(["up", "left", "down", "right"] as Dir[]).map((d) => (
            <button
              key={d}
              type="button"
              className={styles.pad}
              data-dir={d}
              aria-label={`Steer ${d}`}
              onPointerDown={(e) => {
                e.preventDefault();
                turn(d);
              }}
              onClick={(e) => {
                // keyboard activation (pointer already handled)
                if (e.detail === 0) turn(d);
              }}
            >
              <Icon name={d === "up" ? "arrow-up" : d === "down" ? "arrow-down" : "arrow-right"} size={20} className={d === "left" ? styles.flip : undefined} />
            </button>
          ))}
        </div>
      }
      note={embedded ? undefined : "Score: benchmarks surveyed · best kept on this device"}
      stageLabel="Snake board. Arrow keys or swipe to steer."
      stageRef={wrapRef}
      live={live}
    >
      <canvas ref={canvasRef} className={styles.canvas} onPointerDown={onPointerDown} onPointerUp={onPointerUp} aria-hidden="true" />
    </GameFrame>
  );
}
