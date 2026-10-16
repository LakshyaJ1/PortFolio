"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type RefObject } from "react";
import gsap from "gsap";
import { PROFILE } from "@/content/profile";
import { Icon } from "@/components/ui/Icon";
import { prefersReducedMotion, useLatest } from "@/lib/hooks";
import { SECTIONS, type SectionId } from "@/lib/sections";
import { useApp } from "@/lib/store";
import { goToSection, lockPage, unlockPage } from "./actions";
import { useReadingSection } from "./reading";
import { FixMark } from "./symbols";
import styles from "./Menu.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  /** where focus returns when the menu is dismissed without travelling */
  returnFocus: RefObject<HTMLElement | null>;
};

/**
 * The sections menu: every section in plain words, in page order, with the one you're
 * reading marked. A panel under the nav on wide screens, the whole screen on phones.
 * Mounted while open and while its exit plays.
 */
export function Menu(props: Props) {
  const [mounted, setMounted] = useState(props.open);
  if (props.open && !mounted) setMounted(true);
  if (!mounted) return null;
  return <Panel {...props} onGone={() => setMounted(false)} />;
}

const calm = () => prefersReducedMotion() || useApp.getState().plain;

function Panel({ open, onClose, returnFocus, onGone }: Props & { onGone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const destination = useRef<SectionId | null>(null);
  const active = useReadingSection();
  const onGoneRef = useLatest(onGone);
  const onCloseRef = useLatest(onClose);

  // Entrance: hold the page, land focus on the section you're in, drop the panel in.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    lockPage();
    root.querySelector<HTMLElement>('[aria-current="location"]')?.focus({ preventScroll: true });
    if (calm()) return () => unlockPage();
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from("[data-scrim]", { opacity: 0, duration: 0.4, ease: "none" }, 0)
        .from("[data-panel]", { opacity: 0, y: -10, duration: 0.55 }, 0)
        .from("[data-item]", { opacity: 0, x: 10, duration: 0.5, stagger: 0.025 }, 0.06);
    }, root);
    return () => {
      ctx.revert();
      unlockPage();
    };
  }, []);

  // Exit: the panel lifts away, then the page travels (or focus goes back to the Menu button).
  useEffect(() => {
    if (open) return;
    const root = rootRef.current;
    const finish = () => {
      unlockPage();
      const id = destination.current;
      if (id) goToSection(id, { focus: true });
      else returnFocus.current?.focus({ preventScroll: true });
      onGoneRef.current();
    };
    if (!root || calm()) {
      finish();
      return;
    }
    const tl = gsap
      .timeline({ onComplete: finish })
      .to(root.querySelector("[data-panel]"), { opacity: 0, y: -8, duration: 0.25, ease: "power2.in" }, 0)
      .to(root.querySelector("[data-scrim]"), { opacity: 0, duration: 0.25, ease: "none" }, 0);
    return () => {
      tl.kill();
    };
  }, [open, onGoneRef, returnFocus]);

  // Esc closes; Tab stays inside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const at = document.activeElement;
      if (!root.contains(at)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && at === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCloseRef]);

  const travel = (e: MouseEvent, id: SectionId) => {
    e.preventDefault();
    e.stopPropagation(); // Lenis also listens for anchor clicks; one scroll is enough
    if (!open) return;
    destination.current = id;
    onClose();
  };

  // Up/Down walk the list (wrapping), Home/End jump to the ends.
  const onListKey = (e: ReactKeyboardEvent<HTMLOListElement>) => {
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-item]") ?? []);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    let next: number;
    if (e.key === "ArrowDown") next = (i + 1) % links.length;
    else if (e.key === "ArrowUp") next = (i - 1 + links.length) % links.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = links.length - 1;
    else return;
    e.preventDefault();
    links[next]?.focus();
  };

  return (
    <div ref={rootRef} className={styles.root} data-lenis-prevent>
      <div className={styles.scrim} data-scrim aria-hidden="true" onClick={onClose} />
      <div id="site-menu" className={styles.panel} data-panel role="dialog" aria-modal="true" aria-labelledby="site-menu-title">
        <div className={styles.head}>
          <h2 id="site-menu-title" className={styles.title}>
            Sections
          </h2>
          <button type="button" className={styles.close} onClick={onClose}>
            <Icon name="close" size={16} />
            <span>Close</span>
          </button>
        </div>

        <ol ref={listRef} className={styles.list} onKeyDown={onListKey}>
          {SECTIONS.map((s, i) => {
            const here = s.id === active;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={styles.item}
                  data-item
                  data-book={s.id === "rendezvous" || undefined}
                  aria-current={here ? "location" : undefined}
                  onClick={(e) => travel(e, s.id)}
                >
                  <span className={styles.num} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.name}>{s.plain}</span>
                  {here ? (
                    <span className={styles.here}>
                      <FixMark size={18} />
                      You&rsquo;re here
                    </span>
                  ) : null}
                  <Icon name={s.id === "rendezvous" ? "calendar" : "arrow-right"} size={16} className={styles.go} />
                </a>
              </li>
            );
          })}
        </ol>

        <div className={styles.foot}>
          <a className={styles.footLink} href={PROFILE.resumePath} download="Lakshya-Jain-Resume.pdf">
            <Icon name="download" size={16} />
            Résumé <span className={styles.dim}>PDF</span>
          </a>
          <a className={styles.footLink} href={`mailto:${PROFILE.email}`}>
            <Icon name="mail" size={16} />
            Email
          </a>
          <a className={styles.footLink} href={PROFILE.linkedin} target="_blank" rel="noopener noreferrer">
            <Icon name="linkedin" size={16} />
            LinkedIn
            <span className="visually-hidden">(opens in a new tab)</span>
          </a>
          <a className={styles.footLink} href={PROFILE.github} target="_blank" rel="noopener noreferrer">
            <Icon name="github" size={16} />
            GitHub
            <span className="visually-hidden">(opens in a new tab)</span>
          </a>
        </div>
      </div>
    </div>
  );
}
