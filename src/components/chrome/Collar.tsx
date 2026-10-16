"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import gsap from "gsap";
import { PROFILE } from "@/content/profile";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { CACHES } from "@/lib/caches";
import { discover } from "@/lib/discover";
import { emit } from "@/lib/events";
import { prefersReducedMotion, useFinePointer, useReducedMotion } from "@/lib/hooks";
import { SECTIONS, type SectionId } from "@/lib/sections";
import { useApp } from "@/lib/store";
import { goToSection } from "./actions";
import { hydrateChrome, useChrome } from "./chromeStore";
import { TrigMark } from "./symbols";
import { formatIST, formatLocalHM, SHEET_OFFSET_MIN, useNow, visitorZone } from "./time";
import styles from "./Collar.module.css";

/** Click handler that scrolls to a section; keyboard activation (detail 0) also moves focus there. */
const travel = (id: SectionId) => (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation(); // Lenis also handles anchors; one scroll is enough
  goToSection(id, { focus: e.detail === 0 });
};

/**
 * The footer, in plain words: who he is and what he offers, how to reach him, every section
 * by name, the easter-egg count, a few settings and the time in Delhi. The north arrow stays
 * (tap it five times, quickly).
 */
export function Collar() {
  const now = useNow(60_000);
  const year = now === null ? null : new Date(now).getFullYear();
  useEffect(hydrateChrome, []);

  return (
    <footer id="collar" className={styles.collar} aria-labelledby="collar-title">
      <div className={styles.edge} aria-hidden="true">
        <span className={styles.ticks} />
      </div>

      <div className="wrap">
        <div className={styles.top}>
          <h2 id="collar-title" className={styles.name}>
            Lakshya Jain
          </h2>
          <p className={styles.offer}>{PROFILE.offer}</p>
          <div className={styles.ctas}>
            <Button variant="fix" size="lg" cta="book-footer" icon="calendar" href="#rendezvous" onClick={travel("rendezvous")}>
              Book a call
            </Button>
            <Button variant="line" size="lg" icon="download" href={PROFILE.resumePath} download="Lakshya-Jain-Resume.pdf">
              Résumé
            </Button>
          </div>
          <div className={styles.north}>
            <NorthArrow />
          </div>
        </div>

        <div className={styles.cols}>
          <section className={styles.col} aria-labelledby="footer-contact">
            <h3 id="footer-contact" className={styles.h}>
              Contact
            </h3>
            <Contact />
          </section>

          <nav className={styles.col} aria-labelledby="footer-sections">
            <h3 id="footer-sections" className={styles.h}>
              Sections
            </h3>
            <ul className={styles.links}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={styles.link} onClick={travel(s.id)}>
                    {s.plain}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section className={styles.col} aria-labelledby="footer-site">
            <h3 id="footer-site" className={styles.h}>
              This site
            </h3>
            <EggCounter />
            <Settings />
            {/* the terminal's own key is ` (left of 1); this is the door for touch keyboards */}
            <button type="button" className={styles.terminalBtn} onClick={() => useApp.getState().openOverlay("terminal")}>
              <Icon name="terminal" size={18} />
              Terminal
            </button>
          </section>
        </div>

        <div className={styles.base}>
          <DelhiTime />
          <p className={styles.copyright}>
            © {year ?? ""} Lakshya Jain. Every fact on this site comes from his résumé.
          </p>
          <Button
            variant="line"
            icon="arrow-up"
            onClick={() => {
              goToSection("top");
              document.querySelector<HTMLElement>("[data-chrome-mark]")?.focus({ preventScroll: true });
            }}
          >
            Back to top
          </Button>
        </div>
      </div>
    </footer>
  );
}

/* ─── north arrow (an easter egg: tap it five times, quickly) ─── */

const ROSE_TICKS = Array.from({ length: 24 }, (_, k) => {
  const a = (k * 15 * Math.PI) / 180;
  const major = k % 6 === 0;
  const r0 = major ? 25 : 29;
  const r1 = 32;
  const f = (n: number) => Math.round(n * 100) / 100;
  return `M${f(40 + Math.sin(a) * r0)} ${f(56 - Math.cos(a) * r0)}L${f(40 + Math.sin(a) * r1)} ${f(56 - Math.cos(a) * r1)}`;
}).join("");

function NorthArrow() {
  const needleRef = useRef<SVGGElement>(null);
  const taps = useRef<number[]>([]);
  const spinning = useRef(false);

  const tap = () => {
    const needle = needleRef.current;
    if (!needle || spinning.current) return;
    const t = performance.now();
    taps.current = [...taps.current.filter((x) => t - x < 4000), t];
    const n = taps.current.length;
    const still = prefersReducedMotion() || useApp.getState().plain;
    gsap.killTweensOf(needle);
    if (n >= 5) {
      taps.current = [];
      discover("north-arrow");
      if (still) return;
      spinning.current = true;
      gsap.fromTo(
        needle,
        { rotation: 0, svgOrigin: "40 56" },
        {
          rotation: 1080,
          svgOrigin: "40 56",
          duration: 2.8,
          ease: "expo.out",
          onComplete: () => {
            gsap.set(needle, { rotation: 0, svgOrigin: "40 56" });
            spinning.current = false;
          },
        },
      );
      return;
    }
    if (still) return;
    // it really doesn't like being tapped: each tap kicks harder
    const kick = (n % 2 ? 1 : -1) * (5 + n * 6);
    gsap.fromTo(needle, { rotation: kick, svgOrigin: "40 56" }, { rotation: 0, svgOrigin: "40 56", duration: 1.1, ease: "expo.out" });
  };

  return (
    <button type="button" className={styles.northBtn} onClick={tap} aria-label="North arrow" data-guide="footer-north">
      <svg viewBox="0 0 80 96" width="80" height="96" aria-hidden="true" focusable="false">
        <text x="40" y="12" textAnchor="middle" className={styles.northN}>
          N
        </text>
        <circle cx="40" cy="56" r="32" className={styles.roseRing} />
        <path d={ROSE_TICKS} className={styles.roseTicks} />
        <g ref={needleRef}>
          <path d="M40 22 34.5 56H40Z" className={styles.needleInk} />
          <path d="M40 22 45.5 56H40Z" className={styles.needleOpen} />
          <path d="M34.5 56 40 88 45.5 56" className={styles.needleTail} />
          <circle cx="40" cy="56" r="2" className={styles.needleInk} />
        </g>
      </svg>
    </button>
  );
}

/* ─── contact: email (with copy), LinkedIn, GitHub ─── */

type CopyState = "idle" | "copied" | "failed";

function Contact() {
  const [copy, setCopy] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(PROFILE.email);
      setCopy("copied");
      emit("copy:email", {});
    } catch {
      setCopy("failed");
    }
    timer.current = window.setTimeout(() => setCopy("idle"), 2400);
  };

  return (
    <ul className={styles.contact}>
      <li className={styles.emailRow}>
        <a className={styles.contactLink} href={`mailto:${PROFILE.email}`}>
          <Icon name="mail" size={20} className={styles.contactIcon} />
          <span className={styles.contactText}>{PROFILE.email}</span>
        </a>
        <button type="button" className={styles.copy} data-state={copy} onClick={onCopy} aria-label="Copy email address">
          <Icon name={copy === "copied" ? "check" : "copy"} size={16} />
          <span aria-hidden="true">{copy === "copied" ? "Copied" : copy === "failed" ? "Can't copy" : "Copy"}</span>
        </button>
        <span className="visually-hidden" role="status">
          {copy === "copied" ? "Email address copied." : copy === "failed" ? "Couldn't copy. The address is " + PROFILE.email : ""}
        </span>
      </li>
      <li>
        <a className={styles.contactLink} href={PROFILE.linkedin} target="_blank" rel="noopener noreferrer">
          <Icon name="linkedin" size={20} className={styles.contactIcon} />
          <span className={styles.contactText}>LinkedIn</span>
          <Icon name="arrow-ne" size={16} className={styles.contactGo} />
          <span className="visually-hidden">(opens in a new tab)</span>
        </a>
      </li>
      <li>
        <a className={styles.contactLink} href={PROFILE.github} target="_blank" rel="noopener noreferrer">
          <Icon name="github" size={20} className={styles.contactIcon} />
          <span className={styles.contactText}>
            GitHub <span className={styles.dim}>{PROFILE.githubUser}</span>
          </span>
          <Icon name="arrow-ne" size={16} className={styles.contactGo} />
          <span className="visually-hidden">(opens in a new tab)</span>
        </a>
      </li>
    </ul>
  );
}

/* ─── easter eggs: the count, and the door to the logbook ─── */

function EggCounter() {
  const found = useApp((s) => s.caches);
  const count = CACHES.filter((c) => found[c.id]).length;
  return (
    <button type="button" className={styles.eggs} data-guide="footer-eggs" onClick={() => useApp.getState().openOverlay("logbook")}>
      <span className={styles.eggLine}>
        <span className={styles.eggLabel}>Easter eggs found</span>
        <span className={styles.eggCount}>
          {count}/{CACHES.length}
        </span>
      </span>
      <span className={styles.tally} aria-hidden="true">
        {CACHES.map((c) => (
          <TrigMark key={c.id} size={13} filled={Boolean(found[c.id])} className={found[c.id] ? styles.found : styles.unfound} />
        ))}
      </span>
      <span className={styles.openLog}>
        Open logbook
        <Icon name="arrow-right" size={14} />
      </span>
    </button>
  );
}

/* ─── settings ─── */

function Toggle({
  label,
  note,
  on,
  onChange,
  disabled = false,
}: {
  label: string;
  note: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-describedby={`${id}-note`}
      disabled={disabled}
      className={styles.toggle}
      onClick={() => onChange(!on)}
    >
      <span className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        <span id={`${id}-note`} className={styles.toggleNote}>
          {note}
        </span>
      </span>
      <span className={styles.switch} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={styles.state} aria-hidden="true">
        {on ? "On" : "Off"}
      </span>
    </button>
  );
}

function Settings() {
  const plain = useApp((s) => s.plain);
  const setPlain = useApp((s) => s.setPlain);
  const sound = useApp((s) => s.sound);
  const setSound = useApp((s) => s.setSound);
  const cursor = useChrome((s) => s.cursor);
  const setCursor = useChrome((s) => s.setCursor);
  const fine = useFinePointer();
  const reduced = useReducedMotion();

  const cursorNote = reduced
    ? "Off while your system asks for reduced motion."
    : plain
      ? "Rests while Simple view is on."
      : "A crosshair that locks onto anything you can press.";

  return (
    <div className={styles.toggles}>
      <Toggle label="Simple view" note="Turns off heavy effects, for fast reading." on={plain} onChange={setPlain} />
      <Toggle label="Sound" note="The intro voice and game sounds." on={sound} onChange={setSound} />
      {fine ? (
        <Toggle
          label="Custom cursor"
          note={cursorNote}
          on={cursor && !reduced && !plain}
          disabled={reduced || plain}
          onChange={setCursor}
        />
      ) : null}
    </div>
  );
}

/* ─── the time in Delhi, and how it sits against the visitor's own ─── */

/** "3h 30m ahead of you" (Delhi relative to the visitor); null when they share a clock. */
function delhiVsYou(visitorOffsetMin: number) {
  const diff = SHEET_OFFSET_MIN - visitorOffsetMin;
  if (diff === 0) return null;
  const a = Math.abs(diff);
  const span = [Math.floor(a / 60) ? `${Math.floor(a / 60)}h` : "", a % 60 ? `${a % 60}m` : ""].filter(Boolean).join(" ");
  return `${span} ${diff > 0 ? "ahead of" : "behind"} you`;
}

function DelhiTime() {
  const now = useNow(60_000);
  const zone = now === null ? null : visitorZone(now);
  const relation = zone ? delhiVsYou(zone.offset) : null;
  return (
    <p className={styles.time}>
      <span>
        Delhi time <span className={`mono ${styles.clock}`}>{now === null ? "--:--" : formatIST(now)}</span>
      </span>
      {now !== null && zone ? (
        <span className={styles.relation}>
          {relation ? (
            <>
              {relation} <span aria-hidden="true">·</span> yours <span className="mono">{formatLocalHM(now)}</span>
            </>
          ) : (
            "same as yours"
          )}
        </span>
      ) : null}
    </p>
  );
}
