"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePageVisible } from "@/lib/hooks";
import { GameFrame } from "./GameFrame";
import { alpha, blip, readPalette, useBest, useFrame, useStage, type GameStatus, type Palette } from "./engine";
import styles from "./Game.module.css";
import cs from "./Coin.module.css";

const enc = new TextEncoder();
const BATCH = 512;
const MAX_DEPTH = 7;
const PX_PER_FRAME = 2;
const WALLET_KEY = "lj-egg-wallet";

/** Leading zero hex digits needed for the next coin: 3, then 4, then 5 (each zero is 16× the work). */
const targetFor = (coins: number) => (coins < 1 ? 3 : coins < 3 ? 4 : 5);

function hexOf(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

function zerosOf(b: Uint8Array) {
  let z = 0;
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0) {
      z += 2;
      continue;
    }
    if (b[i] < 16) z += 1;
    break;
  }
  return z;
}

/** Continuous "depth": how far below the hash ceiling this hash sits, in hex digits. */
function depthOf(b: Uint8Array) {
  const v = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
  return 8 - Math.log(v + 1) / Math.log(16);
}

type Block = { height: number; nonce: number; hash: string; seconds: number; zeros: number };
type Sample = { max: number; cloud: number[]; block?: number };

function readWallet() {
  try {
    return Number(window.localStorage.getItem(WALLET_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeWallet(n: number) {
  try {
    window.localStorage.setItem(WALLET_KEY, String(n));
  } catch {
    /* ignore */
  }
}

/** Lakshyacoin miner: real SHA-256 proof-of-work in the browser via SubtleCrypto. */
export function Coin({ onClose }: { onClose?: () => void }) {
  const { wrapRef, canvasRef, size } = useStage();
  const [status, setStatus] = useState<GameStatus>("briefing");
  const [best, submitBest] = useBest("coin");
  const [view, setView] = useState({ nonce: 0, hash: "", rate: 0, hashes: 0, elapsed: 0 });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [wallet, setWallet] = useState(readWallet);
  const [coins, setCoins] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const visible = usePageVisible();
  const pal = useRef<Palette | null>(null);

  const m = useRef({
    gen: 0,
    nonce: 0,
    hashes: 0,
    last: new Uint8Array(32),
    frameMax: 0,
    recent: [] as number[],
    samples: [] as Sample[],
    coins: 0,
    blockStart: 0,
    pendingBlock: undefined as number | undefined,
    rateAt: 0,
    rateHashes: 0,
    rate: 0,
    elapsed: 0,
    uiAcc: 0,
  });

  const found = useCallback(
    (nonce: number, b: Uint8Array) => {
      const st = m.current;
      st.coins += 1;
      const now = performance.now();
      const block: Block = {
        height: st.coins,
        nonce,
        hash: hexOf(b),
        seconds: (now - st.blockStart) / 1000,
        zeros: zerosOf(b),
      };
      st.blockStart = now;
      st.pendingBlock = st.coins;
      setCoins(st.coins);
      setBlocks((list) => [block, ...list].slice(0, 6));
      const total = readWallet() + 1;
      writeWallet(total);
      setWallet(total);
      submitBest(st.coins, "higher");
      setLive(`Coin ${st.coins} mined at nonce ${nonce}. Next target: ${targetFor(st.coins)} zeros.`);
      blip(1046, 0.07, "square", 0.035);
      blip(1568, 0.1, "square", 0.03, 0.08);
    },
    [submitBest],
  );

  // The mining loop: batches of real digests, stopped by pause, close or a hidden tab.
  useEffect(() => {
    if (status !== "playing" || !visible) return;
    const st = m.current;
    const gen = ++st.gen;
    if (!st.blockStart) st.blockStart = performance.now();
    let stopped = false;
    // Digests can resolve as microtasks, so the loop must hand the main thread back on its own:
    // mine in ~8 ms slices, then yield a macrotask so frames, input and the page keep running.
    const yieldToPage = () => new Promise<void>((r) => window.setTimeout(r, 0));
    let sliceStart = performance.now();
    const loop = async () => {
      while (!stopped && st.gen === gen) {
        if (performance.now() - sliceStart > 8) {
          await yieldToPage();
          sliceStart = performance.now();
          if (stopped || st.gen !== gen) return;
        }
        const base = st.nonce;
        const jobs: Promise<ArrayBuffer>[] = new Array(BATCH);
        for (let i = 0; i < BATCH; i++) jobs[i] = crypto.subtle.digest("SHA-256", enc.encode(`lakshyacoin|${base + i}`));
        let out: ArrayBuffer[];
        try {
          out = await Promise.all(jobs);
        } catch {
          setError("This browser refused to hash. SubtleCrypto needs a secure (https) page.");
          setStatus("paused");
          return;
        }
        if (stopped || st.gen !== gen) return;
        const recent: number[] = [];
        for (let i = 0; i < BATCH; i++) {
          const b = new Uint8Array(out[i]);
          const d = depthOf(b);
          if (d > st.frameMax) st.frameMax = d;
          if (i % 128 === 0) recent.push(d);
          if (zerosOf(b) >= targetFor(st.coins)) found(base + i, b);
          if (i === BATCH - 1) st.last = b;
        }
        st.recent.push(...recent);
        st.nonce = base + BATCH;
        st.hashes += BATCH;
      }
    };
    void loop();
    return () => {
      stopped = true;
    };
  }, [status, visible, found]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = (pal.current ??= readPalette());
    const { w, h, dpr } = size;
    const st = m.current;
    const target = targetFor(st.coins);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = p.z1;
    ctx.fillRect(0, 0, w, h);
    const padL = 64;
    const padR = 14;
    const padT = 18;
    const padB = 22;
    const yOf = (d: number) => h - padB - (Math.min(d, MAX_DEPTH) / MAX_DEPTH) * (h - padT - padB);

    // time ticks
    ctx.fillStyle = p.z3;
    for (let x = w - padR; x > padL; x -= 60) ctx.fillRect(Math.round(x), padT, 1, h - padT - padB);

    // depth contours: one per leading zero
    ctx.font = `500 9px ${p.mono}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let k = 1; k <= MAX_DEPTH; k++) {
      const y = Math.round(yOf(k)) + 0.5;
      const isT = k === target;
      ctx.strokeStyle = isT ? p.fix : k % 2 ? p.z4 : p.z5;
      ctx.lineWidth = isT ? 1.5 : 1;
      ctx.setLineDash(isT ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = isT ? p.fixHi : p.z7;
      ctx.fillText(`${"0".repeat(k)}…`, padL - 8, y);
    }
    ctx.fillStyle = p.z7;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("HASH DEPTH · LEADING ZEROS", padL, h - 6);
    ctx.textAlign = "right";
    ctx.fillText("NOW", w - padR, h - 6);

    // samples scroll right to left: the deepest probe each frame, a cloud of ordinary hashes
    const n = st.samples.length;
    ctx.fillStyle = alpha(p.z7, 0.7);
    for (let i = 0; i < n; i++) {
      const x = w - padR - (n - 1 - i) * PX_PER_FRAME;
      if (x < padL) continue;
      for (const d of st.samples[i].cloud) ctx.fillRect(x, yOf(d) - 0.75, 1.5, 1.5);
    }
    ctx.strokeStyle = p.z9;
    ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      const x = w - padR - (n - 1 - i) * PX_PER_FRAME;
      if (x < padL) continue;
      const y = yOf(st.samples[i].max);
      if (started) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        started = true;
      }
    }
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const s = st.samples[i];
      if (!s.block) continue;
      const x = w - padR - (n - 1 - i) * PX_PER_FRAME;
      if (x < padL) continue;
      const y = yOf(s.max);
      ctx.strokeStyle = p.fix;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x, y - 7);
      ctx.moveTo(x, y + 7);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
      ctx.fillStyle = p.fixHi;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`#${s.block}`, x, y - 12);
    }
  }, [canvasRef, size]);

  useEffect(() => {
    draw();
  }, [draw, status, blocks]);

  useFrame(status === "playing" && visible, (dt, now) => {
    const st = m.current;
    st.elapsed += dt;
    // no batch landed this frame: hold the last reading instead of dropping to zero
    const prev = st.samples[st.samples.length - 1];
    const sample: Sample = { max: st.frameMax || prev?.max || 0, cloud: st.recent.splice(0, 6) };
    if (st.pendingBlock) {
      sample.block = st.pendingBlock;
      sample.max = Math.max(sample.max, targetFor(st.pendingBlock - 1));
      st.pendingBlock = undefined;
    }
    st.recent.length = 0;
    st.frameMax = 0;
    st.samples.push(sample);
    const keep = Math.ceil(size.w / PX_PER_FRAME) + 4;
    if (st.samples.length > keep) st.samples.splice(0, st.samples.length - keep);
    draw();
    if (!st.rateAt) {
      st.rateAt = now;
      st.rateHashes = st.hashes;
    } else if (now - st.rateAt > 500) {
      st.rate = ((st.hashes - st.rateHashes) / (now - st.rateAt)) * 1000;
      st.rateAt = now;
      st.rateHashes = st.hashes;
    }
    st.uiAcc += dt;
    if (st.uiAcc > 0.12) {
      st.uiAcc = 0;
      setView({ nonce: st.nonce, hash: hexOf(st.last), rate: st.rate, hashes: st.hashes, elapsed: st.elapsed });
    }
  });

  const start = () => {
    if (!globalThis.crypto?.subtle) {
      setError("SubtleCrypto isn't available here (it needs a secure https page), so there's nothing to mine with.");
      return;
    }
    setError(null);
    if (status === "briefing" || status === "over") reset();
    setStatus("playing");
    setLive("Mining. Space stops.");
  };

  const reset = () => {
    const st = m.current;
    st.gen += 1;
    st.nonce = Math.floor(Math.random() * 1e9);
    st.hashes = 0;
    st.coins = 0;
    st.samples = [];
    st.recent = [];
    st.frameMax = 0;
    st.blockStart = performance.now();
    st.elapsed = 0;
    st.rate = 0;
    st.rateAt = 0;
    setBlocks([]);
    setCoins(0);
    setView({ nonce: st.nonce, hash: "", rate: 0, hashes: 0, elapsed: 0 });
  };

  const target = targetFor(coins);
  const zeros = view.hash.match(/^0*/)?.[0].length ?? 0;
  const fmt = (n: number) => n.toLocaleString("en-US");
  const locked = Math.round(wallet * 0.9 * 10) / 10;

  return (
    <GameFrame
      title="Lakshyacoin miner"
      status={status}
      onStart={start}
      onPause={() => setStatus("paused")}
      onResume={() => setStatus("playing")}
      onRestart={() => {
        reset();
        setStatus("playing");
      }}
      onClose={onClose}
      best={best === null ? null : `${best} LJC`}
      bestLabel="Best session"
      startLabel="Start mining"
      readouts={[
        { label: "Nonce", value: fmt(view.nonce) },
        { label: "Rate", value: `${(view.rate / 1000).toFixed(1)} kH/s` },
        { label: "Target", value: `${"0".repeat(target)}… (1 in ${fmt(16 ** target)})`, tone: "fix" },
        { label: "Mined", value: `${coins} LJC` },
        { label: "Hashed", value: fmt(view.hashes), tone: "dim" },
        { label: "Session", value: `${view.elapsed.toFixed(0)} s`, wide: true },
      ]}
      briefing={
        <>
          <p>
            Mine <strong>Lakshyacoin</strong> with real SHA-256 proof-of-work, right here in your browser. The miner
            hashes <code>lakshyacoin|nonce</code>, nonce after nonce, until a hash starts with enough zeros.
          </p>
          <p>
            Every coin raises the bar: three zeros, then four, then five. Each extra zero is sixteen times the work.
            The plot shows how deep each probe gets; a coin is any hash past the orange contour.
          </p>
          {error ? <p className={cs.error}>{error}</p> : null}
        </>
      }
      controls={[
        { keys: ["Space", "P"], label: "Stop / resume mining" },
        { keys: ["R"], label: "New session" },
        { keys: ["Esc"], label: "Close" },
      ]}
      note="Real SHA-256 via SubtleCrypto · practice coins, worth exactly nothing"
      stageLabel="Lakshyacoin miner. Space stops and resumes mining."
      stageClassName={cs.stage}
      live={live}
      onKey={(e, down) => {
        if (e.key === " " && down) {
          if (!(e.target as HTMLElement | null)?.closest?.("button")) setStatus("paused");
          return true;
        }
        return false;
      }}
    >
      <div className={cs.layout}>
        <div ref={wrapRef} className={cs.plot}>
          <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        </div>
        <aside className={cs.side} aria-label="Ledger">
          <div className={cs.hash}>
            <p className={cs.sideLabel}>Latest hash · {zeros} leading {zeros === 1 ? "zero" : "zeros"}</p>
            <p className={cs.hex}>
              {view.hash ? (
                <>
                  <span className={cs.zeros}>{view.hash.slice(0, zeros)}</span>
                  {view.hash.slice(zeros, 40)}
                  <span className={cs.rest}>{view.hash.slice(40)}</span>
                </>
              ) : (
                <span className={cs.rest}>waiting for the first batch</span>
              )}
            </p>
          </div>
          <div className={cs.ledger}>
            <p className={cs.sideLabel}>Blocks this session</p>
            {blocks.length ? (
              <ol>
                {blocks.map((b) => (
                  <li key={b.height}>
                    <span className={cs.height}>#{b.height}</span>
                    <span className={cs.nonce}>nonce {fmt(b.nonce)}</span>
                    <span className={cs.short}>
                      <span className={cs.zeros}>{b.hash.slice(0, b.zeros)}</span>
                      {b.hash.slice(b.zeros, 14)}…
                    </span>
                    <span className={cs.secs}>{b.seconds.toFixed(1)} s</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={cs.empty}>No blocks yet. The first one needs three zeros: about 4,096 hashes.</p>
            )}
          </div>
          <div className={cs.wallet}>
            <p className={cs.sideLabel}>Wallet · this device</p>
            <p className={cs.walletLine}>
              <strong>{wallet} LJC</strong> mined in total
            </p>
            <p className={cs.walletNote}>
              Like the real Lakshyacoin on his TokenForge launchpad, 90% of supply is locked in liquidity: {locked} of
              yours are, so you can spend {Math.round((wallet - locked) * 10) / 10}.
            </p>
          </div>
        </aside>
      </div>
    </GameFrame>
  );
}
