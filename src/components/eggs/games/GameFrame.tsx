"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { useLatest, usePageVisible } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { isTypingTarget } from "../shared";
import type { GameStatus } from "./engine";
import styles from "./Game.module.css";

export type ControlRow = { keys: string[]; label: string };

export type Readout = { label: string; value: ReactNode; tone?: "fix" | "alert" | "ok" | "dim"; wide?: boolean };

type Props = {
  title: string;
  status: GameStatus;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onClose?: () => void;
  best?: string | null;
  bestLabel?: string;
  readouts?: Readout[];
  briefing: ReactNode;
  controls: ControlRow[];
  results?: ReactNode;
  startLabel?: string;
  touch?: ReactNode;
  note?: ReactNode;
  /** game keys while playing; return true when handled */
  onKey?: (e: KeyboardEvent, down: boolean) => boolean;
  embedded?: boolean;
  stageLabel: string;
  stageRef?: RefObject<HTMLDivElement | null>;
  stageClassName?: string;
  /** polite announcements for screen readers */
  live?: string;
  children: ReactNode;
};

/**
 * Shared chrome for the canvas games: title, readouts on a ruled strip, the stage with its
 * briefing / pause / results card, touch controls, and the keyboard contract
 * (Enter start · P pause · R restart · Esc close).
 */
export function GameFrame(props: Props) {
  const {
    title,
    status,
    onStart,
    onPause,
    onResume,
    onRestart,
    onClose,
    best,
    bestLabel = "Best",
    readouts,
    briefing,
    controls,
    results,
    startLabel = "Start",
    touch,
    note,
    embedded = false,
    stageLabel,
    stageRef,
    stageClassName,
    live,
    children,
  } = props;
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const visible = usePageVisible();
  const sound = useApp((s) => s.sound);
  const setSound = useApp((s) => s.setSound);
  const latest = useLatest(props);

  // A hidden tab pauses the run; the frame loop stops with it.
  useEffect(() => {
    if (!visible && latest.current.status === "playing") latest.current.onPause();
  }, [visible, latest]);

  // Keyboard: window in the dialog, the frame itself when embedded in a page.
  useEffect(() => {
    const target: Window | HTMLElement | null = embedded ? rootRef.current : window;
    if (!target) return;
    const handle = (e: KeyboardEvent, down: boolean) => {
      if (isTypingTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const p = latest.current;
      const k = e.key.toLowerCase();
      const onControl = (e.target as HTMLElement | null)?.closest?.("button, a");
      if (down && !e.repeat) {
        if (k === "p") {
          if (p.status === "playing") p.onPause();
          else if (p.status === "paused") p.onResume();
          else return;
          e.preventDefault();
          return;
        }
        if (k === "r" && p.status !== "briefing") {
          e.preventDefault();
          p.onRestart();
          return;
        }
        if ((k === "enter" || k === " ") && !onControl && p.status !== "playing") {
          e.preventDefault();
          if (p.status === "paused") p.onResume();
          else p.onStart();
          return;
        }
        if (k === "escape" && p.embedded && p.status === "playing") {
          e.preventDefault();
          p.onPause();
          return;
        }
      }
      if (p.status === "playing" && p.onKey?.(e, down)) e.preventDefault();
    };
    const down = (e: Event) => handle(e as KeyboardEvent, true);
    const up = (e: Event) => handle(e as KeyboardEvent, false);
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    return () => {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
    };
  }, [embedded, latest]);

  // Starting a run hands focus to the stage so keys land on the game.
  useEffect(() => {
    if (status !== "playing") return;
    const a = document.activeElement;
    if (!a || a === document.body || !focusRef.current?.contains(a)) focusRef.current?.focus({ preventScroll: true });
  }, [status]);

  const card =
    status === "briefing" ? (
      <>
        <h3 className={styles.cardTitle}>How to play</h3>
        <div className={styles.cardBody}>{briefing}</div>
        <Controls rows={controls} />
        <div className={styles.cardActions}>
          <Button variant="fix" icon="play" onClick={onStart} data-autofocus>
            {startLabel}
          </Button>
          {best ? (
            <span className={styles.cardBest}>
              {bestLabel} {best}
            </span>
          ) : null}
        </div>
      </>
    ) : status === "paused" ? (
      <>
        <h3 className={styles.cardTitle}>Paused</h3>
        <Controls rows={controls} />
        <div className={styles.cardActions}>
          <Button variant="fix" icon="play" onClick={onResume} data-autofocus>
            Resume
          </Button>
          <Button variant="line" onClick={onRestart}>
            Restart
          </Button>
        </div>
      </>
    ) : status === "over" ? (
      <>
        <div className={styles.cardBody}>{results}</div>
        <div className={styles.cardActions}>
          <Button variant="fix" icon="refresh" onClick={onStart} data-autofocus>
            Play again
          </Button>
          {onClose ? (
            <Button variant="quiet" onClick={onClose}>
              Back to the sheet
            </Button>
          ) : null}
        </div>
      </>
    ) : null;

  return (
    <div ref={rootRef} className={styles.frame} data-embedded={embedded ? "" : undefined} data-status={status}>
      <header className={styles.head}>
        <div className={styles.headTitle}>
          {embedded ? (
            <h2 className={styles.title} id={titleId}>
              {title}
            </h2>
          ) : (
            <h2 className={styles.title} id="egg-game-title">
              {title}
            </h2>
          )}
          <span className={styles.best}>
            {bestLabel} {best ?? "—"}
          </span>
        </div>
        <div className={styles.tools}>
          {status === "playing" ? (
            <button type="button" className={styles.tool} onClick={onPause} aria-keyshortcuts="P">
              <Icon name="pause" size={16} />
              <span className={styles.toolLabel}>Pause</span>
            </button>
          ) : status === "paused" ? (
            <button type="button" className={styles.tool} onClick={onResume} aria-keyshortcuts="P">
              <Icon name="play" size={16} />
              <span className={styles.toolLabel}>Resume</span>
            </button>
          ) : null}
          {status !== "briefing" ? (
            <button type="button" className={styles.tool} onClick={onRestart} aria-keyshortcuts="R">
              <Icon name="refresh" size={16} />
              <span className={styles.toolLabel}>Restart</span>
            </button>
          ) : null}
          <button
            type="button"
            className={styles.tool}
            onClick={() => setSound(!sound)}
            aria-pressed={sound}
            aria-label={sound ? "Sound on" : "Sound off"}
          >
            <Icon name={sound ? "volume" : "mute"} size={16} />
          </button>
          {onClose ? (
            <button type="button" className={styles.tool} onClick={onClose} aria-label="Close game" aria-keyshortcuts="Escape">
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </div>
      </header>

      {readouts?.length ? (
        <dl className={styles.readouts}>
          {readouts.map((r) => (
            <div key={r.label} className={styles.readout} data-tone={r.tone} data-wide={r.wide ? "" : undefined}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div
        ref={focusRef}
        className={styles.stageShell}
        tabIndex={0}
        role="application"
        aria-roledescription="game"
        aria-label={stageLabel}
        aria-describedby={embedded ? titleId : "egg-game-title"}
      >
        <div ref={stageRef} className={[styles.stage, stageClassName].filter(Boolean).join(" ")}>
          {children}
        </div>
        {card ? (
          <div className={styles.cardWrap} data-status={status}>
            <div className={styles.card}>{card}</div>
          </div>
        ) : null}
      </div>

      {touch ? <div className={styles.touch}>{touch}</div> : null}
      {note ? <p className={styles.note}>{note}</p> : null}
      <p className="visually-hidden" aria-live="polite">
        {live}
      </p>
    </div>
  );
}

function Controls({ rows }: { rows: ControlRow[] }) {
  return (
    <dl className={styles.controls}>
      {rows.map((r) => (
        <div key={r.label} className={styles.controlRow}>
          <dt>
            {r.keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </dt>
          <dd>{r.label}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A hold-to-press touch button: pointer down/up drive a boolean input. */
export function HoldButton({
  label,
  onChange,
  children,
  className,
  wide,
}: {
  label: string;
  onChange: (down: boolean) => void;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={[styles.pad, className].filter(Boolean).join(" ")}
      data-wide={wide ? "" : undefined}
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onLostPointerCapture={() => onChange(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") onChange(true);
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") onChange(false);
      }}
    >
      {children}
    </button>
  );
}
