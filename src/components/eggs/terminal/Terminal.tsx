"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { PROFILE } from "@/content/profile";
import { formatDMS } from "@/lib/geo";
import { sectionById } from "@/lib/sections";
import { useApp } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { discover } from "@/lib/discover";
import { useDialog, usePresence } from "../a11y";
import {
  Banner,
  Run,
  commandTakesArgs,
  completions,
  findCommand,
  termActions,
  unknownCommand,
  type Ctx,
} from "./commands";
import { useTerm } from "./termStore";
import styles from "./Terminal.module.css";

const QUICK = ["help", "cat projects", "cat experience", "book", "hint", "logbook", "survey", "play snake"];

/** Quake-style field terminal. Opens from the top edge of the sheet; ` or Esc closes it. */
export function Terminal() {
  const open = useApp((s) => s.overlay === "terminal");
  const present = usePresence(open, 380);
  if (!present) return null;
  return <TerminalPanel open={open} />;
}

function commonPrefix(words: string[]) {
  if (!words.length) return "";
  let p = words[0];
  for (const w of words) while (!w.startsWith(p)) p = p.slice(0, -1);
  return p;
}

function Echo({ grid, cmd }: { grid: string; cmd: string }) {
  return (
    <>
      <span className={styles.ps1} aria-hidden="true">
        surveyor@sheet:<span className={styles.gridRef}>{grid}</span> $
      </span>{" "}
      <span className="visually-hidden">Command: </span>
      {cmd}
    </>
  );
}

function TerminalPanel({ open }: { open: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const lines = useTerm((s) => s.lines);
  const close = useApp((s) => s.closeOverlay);
  const activeSection = useApp((s) => s.activeSection);
  const grid = sectionById(activeSection)?.grid ?? "A1";
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const draft = useRef("");

  const closeTerminal = useCallback(() => {
    if (useApp.getState().overlay === "terminal") close();
  }, [close]);

  useDialog(panelRef, open, { onEscape: closeTerminal, initialFocus: () => inputRef.current });

  // However it was opened (backtick, hero terminal, Bindu), opening it counts as the find.
  // First open this visit prints the banner.
  useEffect(() => {
    discover("terminal");
    const t = useTerm.getState();
    if (!t.booted) {
      t.boot();
      t.push(<Banner />, "sys");
    }
  }, []);

  // On phones, size to the visual viewport so the prompt stays above the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    const panel = panelRef.current;
    if (!vv || !panel) return;
    const sync = () => panel.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    sync();
    vv.addEventListener("resize", sync);
    return () => vv.removeEventListener("resize", sync);
  }, []);

  const ctx: Ctx = useMemo(
    () => ({
      print: (node, kind) => useTerm.getState().push(node, kind),
      clear: () => useTerm.getState().clear(),
      close: closeTerminal,
    }),
    [closeTerminal],
  );

  const run = useCallback(
    (raw: string) => {
      const term = useTerm.getState();
      const line = raw.trim();
      term.push(<Echo grid={grid} cmd={line} />, "input");
      if (!line) return;
      term.remember(line);
      const [name, ...args] = line.split(/\s+/);
      const cmd = findCommand(name);
      if (!cmd) return unknownCommand(name, ctx);
      try {
        cmd.run(args, ctx);
      } catch (err) {
        console.error("[terminal]", err);
        ctx.print("That command hit a rock. Try it again, or type help.", "err");
      }
    },
    [ctx, grid],
  );

  useEffect(() => {
    termActions.run = (cmd) => {
      run(cmd);
      setValue("");
      setCursor(null);
      if (useApp.getState().overlay === "terminal") inputRef.current?.focus({ preventScroll: true });
    };
    termActions.fill = (text) => {
      setValue(text);
      requestAnimationFrame(() => {
        const i = inputRef.current;
        if (!i) return;
        i.focus({ preventScroll: true });
        i.setSelectionRange(text.length, text.length);
      });
    };
  }, [run]);

  useLayoutEffect(() => {
    const o = outRef.current;
    if (o) o.scrollTop = o.scrollHeight;
  }, [lines]);

  const complete = () => {
    const { candidates, replaceFrom, isCommand } = completions(value);
    if (!candidates.length) return;
    const head = value.slice(0, replaceFrom);
    const current = value.slice(replaceFrom);
    if (candidates.length === 1) {
      const c = candidates[0];
      setValue(head + c + (isCommand && commandTakesArgs(c) ? " " : ""));
      return;
    }
    const prefix = commonPrefix(candidates);
    if (prefix.length > current.length) {
      setValue(head + prefix);
      return;
    }
    const t = useTerm.getState();
    t.push(<Echo grid={grid} cmd={value} />, "input");
    t.push(
      <span className={styles.cands}>
        {candidates.map((c) => (
          <Run key={c} cmd={head + c + (isCommand && commandTakesArgs(c) ? " " : "")} fill>
            {c}
          </Run>
        ))}
      </span>,
      "sys",
    );
  };

  const walk = (dir: -1 | 1) => {
    const history = useTerm.getState().history;
    if (!history.length) return;
    if (cursor === null) {
      if (dir === 1) return;
      draft.current = value;
      setCursor(history.length - 1);
      setValue(history[history.length - 1]);
      return;
    }
    const next = cursor + dir;
    if (next >= history.length) {
      setCursor(null);
      setValue(draft.current);
      return;
    }
    const clamped = Math.max(0, next);
    setCursor(clamped);
    setValue(history[clamped]);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (!e.shiftKey) complete();
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      walk(e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (e.key === "Escape" || e.key === "`") {
      e.preventDefault();
      closeTerminal();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      useTerm.getState().clear();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
      e.preventDefault();
      useTerm.getState().push(<Echo grid={grid} cmd={`${value}^C`} />, "input");
      setValue("");
      setCursor(null);
    }
  };

  const submit = () => {
    const v = value;
    setValue("");
    setCursor(null);
    run(v);
  };

  const focusInput = (e: ReactMouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("button, a, input")) return;
    if (window.getSelection()?.toString()) return;
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className={styles.root} data-egg-dialog data-state={open ? "open" : "closing"}>
      <div className={styles.scrim} onClick={closeTerminal} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="egg-term-title"
        aria-describedby="egg-term-keys"
        tabIndex={-1}
        data-lenis-prevent
      >
        <header className={styles.bar}>
          <span className={styles.barIcon} aria-hidden="true">
            <Icon name="terminal" size={16} />
          </span>
          <h2 id="egg-term-title" className={styles.title}>
            Terminal
          </h2>
          <span className={styles.barMeta}>
            <span className={styles.gridRef}>{grid}</span> · {formatDMS(PROFILE.home)}
          </span>
          <button type="button" className={styles.close} onClick={closeTerminal} aria-label="Close terminal">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div ref={outRef} className={styles.out} role="log" aria-live="polite" onClick={focusInput}>
          {lines.map((l) => (
            <div key={l.id} className={styles.line} data-kind={l.kind}>
              {l.node}
            </div>
          ))}
        </div>

        <form
          className={styles.prompt}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="egg-term-input" className={styles.ps1}>
            <span aria-hidden="true">
              surveyor@sheet:<span className={styles.gridRef}>{grid}</span> $
            </span>
            <span className="visually-hidden">Terminal command</span>
          </label>
          <input
            id="egg-term-input"
            ref={inputRef}
            className={styles.input}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setCursor(null);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-describedby="egg-term-keys"
          />
        </form>

        <footer className={styles.edge}>
          <div className={styles.chips} aria-label="Quick commands">
            {QUICK.map((q) => (
              <Run key={q} cmd={q} />
            ))}
          </div>
          <p id="egg-term-keys" className={styles.keys}>
            <kbd>Tab</kbd> completes · <kbd>Esc</kbd> closes
          </p>
          <span className={styles.ticks} aria-hidden="true" />
        </footer>
      </div>
    </div>
  );
}
