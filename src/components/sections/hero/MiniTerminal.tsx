"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { PROFILE, PROJECTS } from "@/content/profile";
import { useInView, usePageVisible } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import styles from "./MiniTerminal.module.css";

type Row = { id: number; kind: "in" | "out"; text: string };

const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

/** Real commands of the full terminal, each with the gist of what it really prints. */
const DEMOS = [
  { cmd: "whoami", out: `${PROFILE.name} · ${PROFILE.status.split(" · ")[0]}` },
  { cmd: "cat projects", out: PROJECTS.map((p) => p.title).join(" · ") },
  { cmd: "contact", out: `${PROFILE.email} · ${bare(PROFILE.calUrl)}` },
];

/** rows kept in the little scrollback; the window shows the last few */
const KEEP = 6;

/** reduced motion and the plain sheet: one finished exchange, no typing */
const STILL: Row[] = [
  { id: -2, kind: "in", text: DEMOS[0].cmd },
  { id: -1, kind: "out", text: DEMOS[0].out },
];

let seq = 0;

/** Hand keystrokes typed here to the full terminal once its prompt has focus. */
function handOff(buffer: { text: string }) {
  let tries = 0;
  const wait = () => {
    if (useApp.getState().overlay !== "terminal") {
      buffer.text = "";
      return;
    }
    if (document.activeElement instanceof HTMLInputElement) {
      const text = buffer.text;
      buffer.text = "";
      if (text)
        import("@/components/eggs/terminal/commands")
          .then(({ termActions }) => termActions.fill(text))
          .catch(() => {});
      return;
    }
    if (++tries < 45) requestAnimationFrame(wait);
    else buffer.text = "";
  };
  requestAnimationFrame(wait);
}

/**
 * The field terminal, inline on the landing sheet: it types a few real commands on its own,
 * and a click (or any key typed into it) opens the full terminal with the typing carried over.
 * `wait` holds an empty prompt until the sheet is revealed; `still` shows one finished exchange.
 */
export function MiniTerminal({ mode }: { mode: "wait" | "play" | "still" }) {
  const ref = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const inView = useInView(ref);
  const visible = usePageVisible();
  const open = useApp((s) => s.overlay === "terminal");
  const [rows, setRows] = useState<Row[]>([]);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [done, setDone] = useState(false);
  const prog = useRef({ demo: 0, char: 0, done: false });
  const buffer = useRef({ text: "" });
  const running = mode === "play" && inView && visible && !open;

  useEffect(() => {
    if (!running || prog.current.done) return;
    let timer = 0;
    const tick = () => {
      const p = prog.current;
      const demo = DEMOS[p.demo];
      if (p.char < demo.cmd.length) {
        p.char++;
        setTyped(demo.cmd.slice(0, p.char));
        setTyping(true);
        // a human cadence, then a beat before Enter
        timer = window.setTimeout(tick, p.char === demo.cmd.length ? 420 : 55 + Math.random() * 75);
        return;
      }
      setRows((r) => [...r, { id: ++seq, kind: "in" as const, text: demo.cmd }, { id: ++seq, kind: "out" as const, text: demo.out }].slice(-KEEP));
      setTyped("");
      setTyping(false);
      p.demo++;
      p.char = 0;
      if (p.demo >= DEMOS.length) {
        p.done = true;
        setDone(true);
        return;
      }
      timer = window.setTimeout(tick, 2100);
    };
    timer = window.setTimeout(tick, prog.current.demo || prog.current.char ? 500 : 900);
    return () => window.clearTimeout(timer);
  }, [running]);

  const openTerminal = (text: string) => {
    buffer.current.text += text;
    const app = useApp.getState();
    if (app.overlay !== "terminal") app.openOverlay("terminal");
    if (buffer.current.text) handOff(buffer.current);
  };

  // typing into it starts the real thing; the backtick is the global shortcut and passes through
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === " " || e.key === "`" || e.key === "~") return;
    e.preventDefault();
    e.stopPropagation();
    openTerminal(e.key);
  };

  const still = mode === "still";
  const shown = still ? STILL : rows;
  const settled = still || done;

  return (
    <button
      ref={ref}
      type="button"
      className={styles.term}
      data-guide="hero-terminal"
      data-typing={typing && !still ? "" : undefined}
      aria-label="Open the terminal"
      aria-describedby={hintId}
      onClick={() => openTerminal("")}
      onKeyDown={onKeyDown}
    >
      <span className={styles.bar} aria-hidden="true">
        <span className={styles.title}>
          <Icon name="terminal" size={15} />
          Terminal
        </span>
        <span className={styles.hint}>
          <span className={styles.fine}>
            click to type · or press <kbd>`</kbd>
          </span>
          <span className={styles.coarse}>tap to type</span>
          <Icon name="arrow-ne" size={14} />
        </span>
      </span>
      <span className={styles.body} aria-hidden="true">
        {shown.map((r) => (
          <span key={r.id} className={styles.row} data-kind={r.kind}>
            {r.kind === "in" ? (
              <>
                <span className={styles.ps}>$</span> {r.text}
              </>
            ) : (
              r.text
            )}
          </span>
        ))}
        <span className={styles.row} data-kind="prompt">
          <span className={styles.ps}>$</span> {typed}
          <span className={styles.caret} />
          {settled ? <span className={styles.ghost}>help</span> : null}
        </span>
      </span>
      <span id={hintId} className="visually-hidden">
        A real command line: try help, whoami or cat projects. Shortcut from anywhere: the backtick key.
      </span>
    </button>
  );
}
