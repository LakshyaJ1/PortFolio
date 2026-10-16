"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Sheet } from "@/components/ui/Sheet";
import { useInView, useMedia } from "@/lib/hooks";
import { getLenis } from "@/lib/scroll";
import { CAPABILITIES, type Capability } from "./data";
import { Glyph } from "./glyphs";
import { expoOut, useStill } from "./kit/loop";
import styles from "./Capabilities.module.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const N = CAPABILITIES.length;
/** scroll distance per word, as a fraction of the viewport height */
const STEP_VH = 0.66;

export function Capabilities() {
  const wide = useMedia("(min-width: 1024px) and (min-height: 680px)", true);
  const still = useStill();
  const pinned = wide && !still;

  return (
    <Sheet id="capabilities" title={<>What he <em>ships</em></>} aside="5 lines · each one live">
      {pinned ? <Band /> : <Stacked />}
    </Sheet>
  );
}

/** Where it shipped and the one figure that sells it, readable at a glance (and in the orange band). */
function Tag({ cap, className }: { cap: Capability; className?: string }) {
  return (
    <span className={[styles.tag, className].filter(Boolean).join(" ")}>
      <span className={styles.tagOrg}>
        <Glyph name={cap.glyph} size="1.2em" className={styles.tagGlyph} />
        {cap.org}
        {cap.ongoing ? <span className={styles.tagNow}>Now</span> : <span className={styles.tagYear}>{cap.when}</span>}
      </span>
      <span className={styles.tagHook}>
        <strong className={styles.tagHookV}>{cap.hook.v}</strong>
        <span className={styles.tagHookK}>{cap.hook.k}</span>
      </span>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Desktop: the words scroll through a fixed line-of-position band.
   A duplicate stack, clipped to the band, prints the active word
   in fix-ink on survey orange. The bench on the right follows.
   ───────────────────────────────────────────────────────────── */
function Band() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const trigger = useRef<ScrollTrigger | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const st = ScrollTrigger.create({
        trigger: stage.current,
        start: "top top",
        end: () => `+=${Math.round((N - 1) * window.innerHeight * STEP_VH)}`,
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const p = self.progress * (N - 1);
          column.current?.style.setProperty("--p", p.toFixed(4));
          const i = Math.round(p);
          if (i !== activeRef.current) {
            activeRef.current = i;
            setActive(i);
          }
        },
      });
      trigger.current = st;
      return () => {
        trigger.current = null;
      };
    },
    { scope: root },
  );

  // Other sections settle their heights after mount; keep the pin's range honest.
  useEffect(() => {
    let t = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(() => ScrollTrigger.refresh(), 220);
    });
    ro.observe(document.body);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  const targetFor = useCallback((i: number) => {
    const st = trigger.current;
    if (!st) return null;
    return st.start + ((st.end - st.start) * i) / (N - 1);
  }, []);

  const scrollTo = useCallback((y: number, duration = 0.9) => {
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(y, { duration, easing: expoOut, force: true });
    else window.scrollTo({ top: y, behavior: "smooth" });
  }, []);

  // Gentle snap: once scrolling has settled inside the band's range, ease to the nearest word.
  useEffect(() => {
    let timer = 0;
    const settle = () => {
      const st = trigger.current;
      if (!st) return;
      const lenis = getLenis();
      if (lenis?.isScrolling === "smooth") return;
      const y = lenis ? lenis.scroll : window.scrollY;
      if (y <= st.start + 1 || y >= st.end - 1) return;
      const step = (st.end - st.start) / (N - 1);
      const i = Math.round((y - st.start) / step);
      const target = st.start + i * step;
      if (Math.abs(target - y) < 2) return;
      scrollTo(target, 0.7);
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 170);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [scrollTo]);

  const go = useCallback(
    (i: number, focus = false) => {
      const next = Math.max(0, Math.min(N - 1, i));
      if (focus) tabs.current[next]?.focus({ preventScroll: true });
      const y = targetFor(next);
      if (y !== null) scrollTo(y);
    },
    [targetFor, scrollTo],
  );

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number> = {
      ArrowDown: active + 1,
      ArrowRight: active + 1,
      ArrowUp: active - 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: N - 1,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    go(map[e.key], true);
  };

  return (
    <div ref={root} className={styles.root}>
      <div ref={stage} className={styles.stage}>
        <div ref={column} className={styles.words} data-guide="work-list">
          <div className={styles.stack} role="tablist" aria-orientation="vertical" aria-label="Capabilities" onKeyDown={onKey}>
            {CAPABILITIES.map((c, i) => (
              <button
                key={c.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`cap-tab-${c.id}`}
                aria-selected={i === active}
                aria-controls={`cap-panel-${c.id}`}
                tabIndex={i === active ? 0 : -1}
                className={styles.row}
                onClick={() => go(i)}
              >
                <span className={styles.word}>{c.word}</span>
                <Tag cap={c} />
              </button>
            ))}
          </div>
          <div className={styles.band} aria-hidden="true">
            <div className={styles.stack}>
              {CAPABILITIES.map((c) => (
                <div key={c.id} className={styles.row}>
                  <span className={styles.word}>{c.word}</span>
                  <Tag cap={c} />
                </div>
              ))}
            </div>
          </div>
          <span className={styles.bandTicks} aria-hidden="true" />
        </div>

        <div className={styles.bench}>
          <span className={styles.lop} aria-hidden="true" />
          <div className={styles.panels}>
            {CAPABILITIES.map((c, i) => (
              <div
                key={c.id}
                role="tabpanel"
                id={`cap-panel-${c.id}`}
                aria-labelledby={`cap-tab-${c.id}`}
                className={styles.panel}
                data-state={i === active ? "active" : i < active ? "before" : "after"}
                inert={i !== active}
              >
                <c.Instrument active={i === active} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Phones, reduced motion and the plain sheet: no pin. Each word
   takes the band as it crosses the reading line; its instrument
   mounts just before it scrolls into view.
   ───────────────────────────────────────────────────────────── */
function Stacked() {
  return (
    <ol className={styles.list} data-guide="work-list">
      {CAPABILITIES.map((c) => (
        <StackItem key={c.id} cap={c} />
      ))}
    </ol>
  );
}

function StackItem({ cap }: { cap: Capability }) {
  const head = useRef<HTMLHeadingElement>(null);
  const bench = useRef<HTMLDivElement>(null);
  const near = useInView(bench, { rootMargin: "320px 0px", once: true });
  const onLine = useInView(head, { rootMargin: "-10% 0px -50% 0px" });
  const Instrument = cap.Instrument;

  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <h3 ref={head} className={styles.itemWord} data-active={onLine || undefined}>
          <span className={styles.itemBase}>{cap.word}</span>
          <span className={styles.itemBand} aria-hidden="true">
            {cap.word}
          </span>
        </h3>
        <Tag cap={cap} className={styles.itemTag} />
      </div>
      <div ref={bench} className={styles.itemBench}>
        {near ? <Instrument /> : <div className={styles.placeholder} />}
      </div>
    </li>
  );
}

