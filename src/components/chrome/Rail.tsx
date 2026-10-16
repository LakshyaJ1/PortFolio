"use client";

import { useEffect, useRef, useState } from "react";
import { useLatest, useMedia } from "@/lib/hooks";
import { SECTIONS } from "@/lib/sections";
import { goToSection } from "./actions";
import { useReadingSection } from "./reading";
import { FixMark } from "./symbols";
import styles from "./Rail.module.css";

/** Calls back with page progress 0..1 on every scroll frame (Lenis drives native scroll). */
function useScrollProgress(onProgress: (p: number) => void) {
  const cb = useLatest(onProgress);
  useEffect(() => {
    const run = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      cb.current(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    run();
    window.addEventListener("scroll", run, { passive: true });
    window.addEventListener("resize", run);
    const ro = new ResizeObserver(run);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", run);
      window.removeEventListener("resize", run);
      ro.disconnect();
    };
  }, [cb]);
}

/**
 * Where each section's tick sits on the rail: the progress at which its section crosses the
 * reading line (the same line that sets the nav's "where you are"), so the marker meets each
 * tick as the nav changes.
 */
function useStops() {
  const [stops, setStops] = useState<(number | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const vh = window.innerHeight;
      const max = document.documentElement.scrollHeight - vh;
      const next = SECTIONS.map((s) => {
        const el = document.getElementById(s.id);
        if (!el || max <= 0) return null;
        const top = el.getBoundingClientRect().top + window.scrollY;
        return Math.round(Math.min(1, Math.max(0, (top - vh * 0.5) / max)) * 1000) / 1000;
      });
      setStops((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return stops;
}

/**
 * Scroll progress. Wide screens: a quiet line down the left margin with a tick per section
 * (hover a tick for its name, click to go there) and the orange marker for where you are.
 * Narrow screens: a 2px line along the top edge. Decorative for assistive tech: the nav's
 * Menu says the same thing in words.
 */
export function Rail() {
  const wide = useMedia("(min-width: 1024px)");
  return wide ? <ProgressRail /> : <ProgressLine />;
}

function ProgressRail() {
  const activeId = useReadingSection();
  const activeIndex = Math.max(
    0,
    SECTIONS.findIndex((s) => s.id === activeId),
  );
  const stops = useStops();
  const fillRef = useRef<HTMLSpanElement>(null);
  const carrierRef = useRef<HTMLSpanElement>(null);

  useScrollProgress((p) => {
    if (fillRef.current) fillRef.current.style.transform = `scaleY(${p})`;
    if (carrierRef.current) carrierRef.current.style.transform = `translate3d(0, ${(p * 100).toFixed(3)}%, 0)`;
  });

  return (
    <div className={styles.rail} aria-hidden="true">
      <div className={styles.track}>
        <span ref={fillRef} className={styles.fill} />
        {SECTIONS.map((s, i) =>
          stops[i] == null ? null : (
            <button
              key={s.id}
              type="button"
              tabIndex={-1}
              className={styles.stop}
              style={{ top: `${stops[i]! * 100}%` }}
              data-active={i === activeIndex || undefined}
              data-passed={i < activeIndex || undefined}
              onClick={() => goToSection(s.id)}
            >
              <span className={styles.tick} />
              <span className={styles.stopName}>{s.plain}</span>
            </button>
          ),
        )}
        <span ref={carrierRef} className={styles.carrier}>
          <span className={styles.marker}>
            <FixMark size={25} />
          </span>
        </span>
      </div>
    </div>
  );
}

function ProgressLine() {
  const barRef = useRef<HTMLSpanElement>(null);
  useScrollProgress((p) => {
    if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
  });
  return (
    <div className={styles.line} aria-hidden="true">
      <span ref={barRef} />
    </div>
  );
}
