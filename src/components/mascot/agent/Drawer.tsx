"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { PROFILE } from "@/content/profile";
import { useFinePointer } from "@/lib/hooks";
import { scrollToTarget } from "@/lib/scroll";
import { useApp, type MascotMood } from "@/lib/store";
import { MascotFigure } from "../MascotFigure";
import type { Part, ToolContext } from "./actions";
import { Card } from "./Card";
import { useConversation, type Msg } from "./conversation";
import { LIMITS } from "./spec";
import styles from "./Drawer.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  mood: MascotMood;
  still: boolean;
  narrow: boolean;
  /** where focus returns when the drawer closes (the mascot) */
  returnFocus: () => HTMLElement | null;
};

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
const EXIT_MS = 420;

const stamp = (at: number) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Plain text with emails and links made tappable. */
function Linked({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /(https?:\/\/[^\s)]+[^\s).,;:!?])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const href = m[1] ?? `mailto:${m[2]}`;
    out.push(
      <a key={i} href={href} {...(m[1] ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {m[0]}
      </a>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function PartView({ part, onGo }: { part: Part; onGo: (s: string) => void }) {
  switch (part.kind) {
    case "text":
      return (
        <p className={styles.text}>
          <Linked text={part.text} />
        </p>
      );
    case "note":
      return <p className={styles.note}>{part.text}</p>;
    case "card":
      return <Card card={part.card} onGo={onGo} />;
    case "action": {
      const inner = (
        <>
          <Icon name={part.status === "offer" ? "arrow-ne" : part.icon} size={15} />
          <span>{part.label}</span>
          {part.status === "failed" ? <span className={styles.chipState}>not on this page</span> : null}
        </>
      );
      return part.href && part.status === "offer" ? (
        <a className={styles.chip} data-status={part.status} href={part.href} target="_blank" rel="noopener noreferrer">
          {inner}
        </a>
      ) : (
        <span className={styles.chip} data-status={part.status}>
          {inner}
        </span>
      );
    }
  }
}

function Entry({ msg, onGo }: { msg: Msg; onGo: (s: string) => void }) {
  if (msg.role === "visitor") {
    const text = msg.parts[0]?.kind === "text" ? msg.parts[0].text : "";
    return (
      <li className={styles.visitor}>
        <span className={styles.stamp}>
          You · <time>{stamp(msg.at)}</time>
        </span>
        <p className={styles.visitorText}>{text}</p>
      </li>
    );
  }
  const empty = msg.parts.length === 0;
  return (
    <li className={styles.bindu} aria-busy={msg.pending || undefined}>
      <span className={styles.stamp}>
        <span className={styles.point} aria-hidden="true" />
        Bindu · <time>{stamp(msg.at)}</time>
      </span>
      {msg.parts.map((p, i) => (
        <Fragment key={i}>
          <PartView part={p} onGo={onGo} />
        </Fragment>
      ))}
      {msg.pending && empty ? (
        <span className={styles.pending}>
          Taking a fix
          <span className={styles.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </span>
      ) : null}
    </li>
  );
}

export function Drawer({ open, onClose, mood, still, narrow, returnFocus }: Props) {
  const [present, setPresent] = useState(open);
  const [entered, setEntered] = useState(false);
  if (open && !present) setPresent(true);
  const shown = open && entered;
  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const [draft, setDraft] = useState("");
  const fine = useFinePointer();
  const titleId = useId();
  const subId = useId();

  const { msgs, mode, busy, suggestions, send, reset, probe } = useConversation();
  const tourMuted = useApp((s) => s.guideMuted);

  // Screen readers hear each finished answer once, not every streamed fragment.
  const announce = useMemo(() => {
    const last = [...msgs].reverse().find((m) => m.role === "bindu" && !m.pending);
    if (!last) return "";
    const text = last.parts
      .map((p) => (p.kind === "text" || p.kind === "note" ? p.text : p.kind === "action" ? p.label : ""))
      .filter(Boolean)
      .join(" ");
    return `Bindu: ${text}`;
  }, [msgs]);

  // mount → animate in; close → animate out → unmount
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      return () => cancelAnimationFrame(raf);
    }
    const t = window.setTimeout(() => {
      setPresent(false);
      setEntered(false);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (open) void probe();
  }, [open, probe]);

  // focus in on open, back to the mascot on close
  useEffect(() => {
    if (!shown) return;
    const target = fine ? inputRef.current : panelRef.current;
    target?.focus({ preventScroll: true });
    return () => {
      const back = returnFocus();
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, [shown, fine, returnFocus]);

  // keep the newest entry in view unless the visitor scrolled up to read
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs, present]);

  if (!present) return null;

  const ctx: ToolContext = { narrow, closeDrawer: onClose };
  const ask = (text: string) => {
    stick.current = true;
    void send(text, ctx);
  };
  const submit = () => {
    if (!draft.trim() || busy) return;
    ask(draft);
    setDraft("");
  };
  const onGo = (section: string) => {
    if (narrow) {
      onClose();
      window.setTimeout(() => scrollToTarget(section), 80);
    } else scrollToTarget(section);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.getClientRects().length > 0);
    if (!nodes.length) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const showSuggestions = !busy && suggestions.length > 0;
  const modeLabel = mode === "online" ? "Live" : mode === "offline" ? "Offline guide" : "Taking a fix";
  const near = draft.length > LIMITS.userChars - 100;

  return (
    <>
      <div className={styles.scrim} data-shown={shown} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        data-shown={shown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-lenis-prevent
      >
        <header className={styles.head}>
          <div className={styles.figure} aria-hidden="true">
            <MascotFigure mood={mood} size={narrow ? 44 : 52} still={still} />
          </div>
          <div className={styles.heading}>
            <h2 id={titleId} className={styles.title}>
              Ask Bindu <span className={styles.deva} lang="hi">बिंदु</span>
            </h2>
            <p id={subId} className={styles.sub}>
              AI guide · can be wrong · <a href={`mailto:${PROFILE.email}`}>email the real Lakshya</a>
            </p>
            {/* "Quiet, Bindu" lasts the session; this brings her tour back */}
            <button
              type="button"
              className={styles.tour}
              aria-pressed={!tourMuted}
              onClick={() => useApp.getState().setGuideMuted(!tourMuted)}
            >
              <span className={styles.tourSwitch} aria-hidden="true" />
              Guided tour {tourMuted ? "off" : "on"}
            </button>
          </div>
          <div className={styles.headBtns}>
            <button type="button" className={styles.iconBtn} onClick={reset} aria-label="Start a new field log" title="Start a new field log" disabled={!msgs.length}>
              <Icon name="refresh" size={18} />
            </button>
            <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close Ask Bindu" title="Close (Esc)">
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        <div className={styles.rule} aria-hidden="true">
          <span>Field log</span>
          <span className={styles.ticks} />
          <span className={styles.mode} data-mode={mode}>
            {modeLabel}
          </span>
        </div>

        <ol
          ref={logRef}
          className={styles.log}
          data-lenis-prevent
          aria-label="Conversation"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {msgs.length === 0 ? (
            <li className={styles.bindu}>
              <span className={styles.stamp}>
                <span className={styles.point} aria-hidden="true" />
                Bindu
              </span>
              <p className={styles.text}>
                Namaste. I&apos;m Bindu, the survey point on this sheet. Ask me about Lakshya&apos;s work — I answer from his résumé, and I can take you
                to the right section, open his links or set up a call.
              </p>
            </li>
          ) : (
            msgs.map((m) => <Entry key={m.id} msg={m} onGo={onGo} />)
          )}
          {showSuggestions ? (
            <li className={styles.suggestions} aria-label="Suggested questions">
              {suggestions.map((s) => (
                <button key={s} type="button" className={styles.suggest} onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </li>
          ) : null}
        </ol>

        <p className="visually-hidden" role="status" aria-live="polite">
          {announce}
        </p>

        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="visually-hidden" htmlFor={`${titleId}-q`}>
            Ask Bindu about Lakshya
          </label>
          <div className={styles.field}>
            <textarea
              id={`${titleId}-q`}
              ref={inputRef}
              className={styles.input}
              rows={1}
              value={draft}
              maxLength={LIMITS.userChars}
              placeholder="Ask about his work…"
              enterKeyHint="send"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button type="submit" className={styles.send} disabled={busy || !draft.trim()} aria-label="Send">
              <Icon name="send" size={18} />
            </button>
          </div>
          <div className={styles.foot}>
            <span>{mode === "offline" ? "Offline field guide: scripted answers from his résumé." : fine ? "Enter to send · Shift+Enter for a new line" : ""}</span>
            {near ? (
              <span className={styles.count}>
                {draft.length}/{LIMITS.userChars}
              </span>
            ) : null}
          </div>
        </form>
      </div>
    </>
  );
}
