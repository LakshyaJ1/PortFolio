"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { PROFILE } from "@/content/profile";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useIsNarrow } from "@/lib/hooks";
import { sectionById } from "@/lib/sections";
import { goToSection } from "./actions";
import { useChrome } from "./chromeStore";
import { Menu } from "./Menu";
import { useReadingSection } from "./reading";
import { TrigMark } from "./symbols";
import styles from "./Nav.module.css";

type NavState = { condensed: boolean; hidden: boolean };

/**
 * Condense once the page moves; on phones, step out of the way while reading downward
 * and come back on the way up.
 */
function useNavScroll(narrow: boolean) {
  const [state, setState] = useState<NavState>({ condensed: false, hidden: false });
  useEffect(() => {
    let lastY = window.scrollY;
    let dir = 0;
    let anchor = lastY;
    let hidden = false;
    let raf = 0;
    const read = () => {
      raf = 0;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const dy = y - lastY;
      if (dy > 0 && dir !== 1) {
        dir = 1;
        anchor = lastY;
      } else if (dy < 0 && dir !== -1) {
        dir = -1;
        anchor = lastY;
      }
      if (!narrow || y < vh * 0.5) hidden = false;
      else if (dir === 1 && y - anchor > 48) hidden = true;
      else if (dir === -1 && anchor - y > 24) hidden = false;
      lastY = y;
      const next = { condensed: y > 40, hidden };
      setState((prev) => (prev.condensed === next.condensed && prev.hidden === next.hidden ? prev : next));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [narrow]);
  return state;
}

/**
 * The top bar, in plain words: the mark (back to the top), where you are, a Menu of every
 * section, the résumé, and Book a call, always in reach.
 */
export function Nav() {
  const narrow = useIsNarrow();
  const { condensed, hidden } = useNavScroll(narrow);
  const active = sectionById(useReadingSection()) ?? sectionById("top")!;
  const open = useChrome((s) => s.menuOpen);
  const openMenu = useChrome((s) => s.openMenu);
  const closeMenu = useChrome((s) => s.closeMenu);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toTop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Lenis handles anchors too; one scroll is enough
    goToSection("top");
  };

  return (
    <>
      <header
        className={styles.nav}
        data-condensed={condensed || undefined}
        data-hidden={(hidden && !open) || undefined}
      >
        <div className={styles.plate}>
          <a href="#top" className={styles.mark} data-chrome-mark onClick={toTop} aria-label="Lakshya Jain, back to the top">
            <TrigMark size={22} className={styles.trig} />
            <span className={styles.lj} aria-hidden="true">
              LJ
            </span>
          </a>
        </div>

        <nav className={`${styles.plate} ${styles.controls}`} aria-label="Site">
          <button
            ref={triggerRef}
            type="button"
            className={styles.menu}
            data-guide="nav-menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? "site-menu" : undefined}
            aria-label={`Menu: all sections. You're at ${active.plain}.`}
            onClick={openMenu}
          >
            <span className={styles.window} aria-hidden="true">
              <span key={active.id} className={styles.section}>
                {active.plain}
              </span>
            </span>
            <span className={styles.rule} aria-hidden="true" />
            <Icon name="menu" size={16} className={styles.menuIcon} />
            <span className={styles.word}>Menu</span>
          </button>
          <a className={styles.resume} href={PROFILE.resumePath} download="Lakshya-Jain-Resume.pdf">
            <Icon name="download" size={16} />
            Résumé
          </a>
          <Button
            variant="fix"
            cta="book-nav"
            className={styles.book}
            data-guide="nav-book"
            // keyboard activation (detail 0) also moves focus to the booking heading
            onClick={(e: MouseEvent<HTMLButtonElement>) => goToSection("rendezvous", { focus: e.detail === 0 })}
          >
            Book a call
          </Button>
        </nav>
      </header>
      <Menu open={open} onClose={closeMenu} returnFocus={triggerRef} />
    </>
  );
}
