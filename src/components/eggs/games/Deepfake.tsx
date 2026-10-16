"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { GameFrame } from "./GameFrame";
import { blip, readPalette, useBest, type GameStatus } from "./engine";
import {
  N,
  SPECTRO_MAX_KHZ,
  SPECTRO_SPAN_S,
  makeRound,
  paint,
  planRounds,
  rampLut,
  residualOf,
  spectrumOf,
  type Mark,
  type Round,
} from "./deepfake-gen";
import styles from "./Game.module.css";
import df from "./Deepfake.module.css";

const ROUNDS = 10;

function Marks({ marks }: { marks: Mark[] }) {
  return (
    <svg className={df.marks} viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" aria-hidden="true">
      {marks.map((m, i) =>
        m.kind === "circle" ? (
          <circle key={i} cx={m.x} cy={m.y} r={m.r} />
        ) : m.kind === "rect" ? (
          <rect key={i} x={m.x - 2} y={m.y - 2} width={m.w + 4} height={m.h + 4} />
        ) : m.kind === "vline" ? (
          <line key={i} x1={m.x} x2={m.x} y1={0} y2={N} />
        ) : (
          <rect key={i} x={1} y={m.y0 + 1} width={N - 2} height={m.y1 - m.y0 - 2} />
        ),
      )}
    </svg>
  );
}

function Analysis({ round, view }: { round: Round; view: "spectrum" | "residual" }) {
  const refs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  useEffect(() => {
    const lut = rampLut(readPalette());
    round.panels.forEach((p, i) => {
      const c = refs[i].current;
      if (c) paint(c, view === "spectrum" ? spectrumOf(p.lum) : residualOf(p.lum), lut);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, view]);
  return (
    <div className={df.analysis}>
      {[0, 1].map((i) => (
        <figure key={i} className={df.inset}>
          <canvas ref={refs[i]} width={N} height={N} aria-hidden="true" />
          <figcaption>
            {view === "spectrum" ? "Spectrum" : "Noise residual"} {"AB"[i]}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Spot the manipulated signal: a training game with procedurally generated media. */
export function Deepfake({ onClose }: { onClose?: () => void }) {
  const [status, setStatus] = useState<GameStatus>("briefing");
  const [best, submitBest] = useBest("deepfake");
  const [seed, setSeed] = useState(() => (Date.now() >>> 0) % 1_000_000);
  const plan = useMemo(() => planRounds(seed), [seed]);
  const [index, setIndex] = useState(0);
  const [pick, setPick] = useState<0 | 1 | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [record, setRecord] = useState(false);
  const [live, setLive] = useState("");
  const canvases = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const nextRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

  const spec = plan[Math.min(index, ROUNDS - 1)];
  const round = useMemo(() => makeRound(spec.kind, spec.strength, spec.seed), [spec]);

  useEffect(() => {
    const lut = rampLut(readPalette());
    round.panels.forEach((p, i) => {
      const c = canvases[i].current;
      if (c) paint(c, p.lum, lut);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const revealed = pick !== null;
  useEffect(() => {
    // each new round starts at the top of the stage
    if (pick === null) layoutRef.current?.parentElement?.scrollTo({ top: 0 });
  }, [pick]);
  const correct = revealed && pick === round.fake;

  const choose = (i: 0 | 1) => {
    if (revealed || status !== "playing") return;
    setPick(i);
    const ok = i === round.fake;
    if (ok) {
      setScore((s) => s + 1);
      setStreak((s) => s + 1);
      blip(880, 0.06);
      blip(1320, 0.08, "square", 0.03, 0.07);
    } else {
      setStreak(0);
      blip(196, 0.18, "triangle", 0.05);
    }
    setLive(`${ok ? "Correct" : "Not this time"}. Panel ${"AB"[round.fake]} was manipulated: ${round.title}.`);
    // focus Next and bring it into view inside the stage (never scroll the locked page)
    requestAnimationFrame(() => {
      const btn = nextRef.current?.querySelector("button");
      if (!btn) return;
      btn.focus({ preventScroll: true });
      const scroller = btn.closest<HTMLElement>(`.${df.stage}`);
      if (!scroller) return;
      const r = btn.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      if (r.bottom > s.bottom - 12) scroller.scrollTop += r.bottom - s.bottom + 24;
    });
  };

  const next = () => {
    if (!revealed) return;
    if (index + 1 >= ROUNDS) {
      setRecord(submitBest(score, "higher"));
      setStatus("over");
      setLive(`Training complete. ${score} of ${ROUNDS}.`);
      return;
    }
    setIndex((i) => i + 1);
    setPick(null);
  };

  const start = () => {
    if (status !== "briefing") setSeed((s) => (s * 31 + 7) % 1_000_000);
    setIndex(0);
    setPick(null);
    setScore(0);
    setStreak(0);
    setRecord(false);
    setStatus("playing");
    setLive(`Round 1 of ${ROUNDS}. Which panel was manipulated?`);
  };

  const onKey = (e: KeyboardEvent, down: boolean) => {
    if (!down) return false;
    const k = e.key.toLowerCase();
    if (k === "1" || k === "a" || k === "arrowleft") {
      choose(0);
      return true;
    }
    if (k === "2" || k === "b" || k === "arrowright") {
      choose(1);
      return true;
    }
    if ((k === "enter" || k === "n") && revealed) {
      if ((e.target as HTMLElement | null)?.closest?.("button")) return false;
      next();
      return true;
    }
    return false;
  };

  const media = round.media === "audio" ? "Voice intercept" : "Aerial frame";
  const rating = score >= 9 ? "Analyst grade." : score >= 7 ? "Sharp eyes." : score >= 5 ? "Getting there." : "Keep training.";

  return (
    <GameFrame
      title="Spot the manipulated signal"
      status={status}
      onStart={start}
      onPause={() => setStatus("paused")}
      onResume={() => setStatus("playing")}
      onRestart={start}
      onClose={onClose}
      best={best === null ? null : `${best} / ${ROUNDS}`}
      startLabel="Begin training"
      onKey={onKey}
      readouts={[
        { label: "Round", value: `${Math.min(index + 1, ROUNDS)} / ${ROUNDS}` },
        { label: "Score", value: score, tone: "fix" },
        { label: "Streak", value: streak },
        { label: "Media", value: media, tone: "dim", wide: true },
      ]}
      briefing={
        <>
          <p>
            Each round shows two signals. One has been <strong>manipulated</strong>: a splice, a vocoder, a generator
            fingerprint, a pasted patch. Pick it, then read the telltale.
          </p>
          <p>
            Ten rounds, getting subtler. This is a training game with procedurally generated media, not his real
            detector; that pipeline is under NDA.
          </p>
        </>
      }
      controls={[
        { keys: ["1", "Left"], label: "Panel A" },
        { keys: ["2", "Right"], label: "Panel B" },
        { keys: ["Enter"], label: "Next round" },
        { keys: ["Esc"], label: "Close" },
      ]}
      results={
        <div className={styles.result}>
          <p className={styles.resultTitle}>
            {score} / {ROUNDS} spotted
          </p>
          <p className={styles.resultLine}>{rating}</p>
          <p className={styles.resultLine}>
            {record ? <span className={styles.record}>New best on this device.</span> : <>Best {best ?? score} / {ROUNDS}</>}
          </p>
          <p className={styles.resultLine}>Real detectors learn these same cues, across video, images, text and URLs.</p>
        </div>
      }
      note="Training game · procedurally generated signals · not a real detector"
      stageLabel="Two media panels. Press 1 or 2 to pick the manipulated one."
      stageClassName={df.stage}
      live={live}
    >
      <div ref={layoutRef} className={df.layout}>
        <div className={df.pair}>
          {([0, 1] as const).map((i) => {
            const isFake = round.fake === i;
            const state = !revealed ? undefined : isFake ? "fake" : "clean";
            return (
              <button
                key={i}
                type="button"
                className={df.panel}
                data-state={state}
                data-picked={pick === i ? "" : undefined}
                onClick={() => choose(i)}
                aria-disabled={revealed || status !== "playing"}
                aria-label={`Panel ${"AB"[i]}${revealed ? (isFake ? ", manipulated" : ", clean") : ""}`}
              >
                <span className={df.media} data-audio={round.media === "audio" ? "" : undefined}>
                  <canvas ref={canvases[i]} width={N} height={N} aria-hidden="true" />
                  {revealed && isFake ? <Marks marks={round.panels[i].marks} /> : null}
                  {round.media === "audio" ? (
                    <span className={df.axis} aria-hidden="true">
                      <span>{SPECTRO_MAX_KHZ.toFixed(0)} kHz</span>
                      <span>{SPECTRO_SPAN_S} s</span>
                    </span>
                  ) : null}
                </span>
                <span className={df.caption}>
                  <span className={df.key}>{"AB"[i]}</span>
                  <span>{media}</span>
                  {revealed ? <span className={df.verdict}>{isFake ? "Manipulated" : "Clean"}</span> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className={df.explain} data-inset={revealed && round.inset ? "" : undefined}>
          {!revealed ? (
            <p className={df.ask}>
              Which {round.media === "audio" ? "intercept" : "frame"} has been tampered with? Press{" "}
              <kbd>1</kbd> or <kbd>2</kbd>, or tap a panel.
            </p>
          ) : (
            <>
              <div className={df.explainText}>
                <p className={df.verdictLine} data-ok={correct ? "" : undefined}>
                  {correct ? "Correct." : "Not this time."} <strong>{round.title}</strong> in panel {"AB"[round.fake]}.
                </p>
                <p className={df.telltale}>{round.telltale}</p>
                <div ref={nextRef} className={df.next}>
                  <Button variant="fix" icon="arrow-right" onClick={next}>
                    {index + 1 >= ROUNDS ? "See your score" : "Next round"}
                  </Button>
                </div>
              </div>
              {round.inset ? <Analysis round={round} view={round.inset} /> : null}
            </>
          )}
        </div>
      </div>
    </GameFrame>
  );
}
