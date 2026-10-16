"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icon";
import { PROJECTS, type Project } from "@/content/profile";
import { prefersReducedMotion, useMedia } from "@/lib/hooks";
import { getLenis } from "@/lib/scroll";
import { useApp } from "@/lib/store";
import { expoOut, useStill } from "@/components/sections/capabilities/kit/loop";
import { Backdrop } from "./Backdrop";
import { SiteSheet, type Report } from "./SiteSheet";
import { SetuPlan } from "./drawings/SetuPlan";
import { PricingPlan } from "./drawings/PricingPlan";
import { TokenPlan } from "./drawings/TokenPlan";
import { DeadReckoning } from "./demos/DeadReckoning";
import { FusionSlider } from "./demos/FusionSlider";
import { LiquidityLock } from "./demos/LiquidityLock";
import styles from "./Sites.module.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** the viewport-tall row; keep in step with the matching @media block in Sites.module.css */
const ROW_QUERY = "(min-width: 900px) and (min-height: 640px)";

const byId = (id: string) => PROJECTS.find((p) => p.id === id)!;
const SETU = byId("setu");
const PRICING = byId("amazon-ml");
const TOKEN = byId("tokenforge");

type Card = {
  project: Project;
  variant: "setu" | "pricing" | "token";
  /** what it is, in one plain line (built only from the résumé wording in profile.ts) */
  line: string;
  /** what turning the sheet shows */
  demo: string;
  drawing: ReactNode;
  report: Report;
  Demo: ComponentType<{ active?: boolean }>;
};

// Field reports, built only from the résumé wording in profile.ts.
// TokenForge's résumé entry states no problem, so that part is dropped.
const CARDS: Card[] = [
  {
    project: SETU,
    variant: "setu",
    line: "Offline navigation that keeps tracking a vehicle through GPS outages, using the phone’s own sensors and maps.",
    demo: "Live demo · drive through a GPS outage",
    drawing: <SetuPlan />,
    report: {
      problem: "GPS drops out in GNSS-denied environments, and navigation has to bridge the outage offline.",
      approach: SETU.points,
    },
    Demo: DeadReckoning,
  },
  {
    project: PRICING,
    variant: "pricing",
    line: "Predicts a product’s price from its listing text and its image.",
    demo: "Live demo · blend the two models",
    drawing: <PricingPlan />,
    report: {
      problem: "Predicting a product’s price from its text and its image.",
      approach: PRICING.points,
    },
    Demo: FusionSlider,
  },
  {
    project: TOKEN,
    variant: "token",
    line: "A token launchpad on Aptos that writes the Move contract for you and locks the liquidity.",
    demo: "Live demo · mint the coin",
    drawing: <TokenPlan />,
    report: { approach: TOKEN.points },
    Demo: LiquidityLock,
  },
];

const N = CARDS.length;
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Projects, as one horizontal row. On wide screens the row is pinned and the
 * page's vertical scroll drives it sideways (GSAP ScrollTrigger through Lenis);
 * on phones, in reduced motion and in the plain sheet it is a native
 * scroll-snap row. Arrows and a counter work in every mode.
 */
export function Sites() {
  const row = useMedia(ROW_QUERY, true);
  const still = useStill();
  const plain = useApp((s) => s.plain);
  const pinned = row && !still;

  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const trigger = useRef<ScrollTrigger | null>(null);
  /** each card's resting point, as row progress 0…1 */
  const stops = useRef<number[]>(CARDS.map((_, i) => i / (N - 1)));
  const progress = useRef(0);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  const slides = useCallback(() => Array.from(track.current?.querySelectorAll<HTMLElement>("[data-slide]") ?? []), []);

  // row progress → rail, active card, the cards' inner parallax and the backdrop
  const report = useCallback(
    (p: number) => {
      progress.current = p;
      fill.current?.style.setProperty("--p", p.toFixed(4));
      let best = 0;
      stops.current.forEach((s, i) => {
        if (Math.abs(s - p) < Math.abs(stops.current[best] - p)) best = i;
      });
      if (best !== activeRef.current) {
        activeRef.current = best;
        setActive(best);
      }
      // reduced motion and the plain sheet keep the drawings still
      const k = still ? 0 : 1;
      slides().forEach((el, i) => {
        const d = k * Math.max(-1.2, Math.min(1.2, (stops.current[i] - p) * (N - 1)));
        el.style.setProperty("--d", d.toFixed(3));
      });
    },
    [slides, still],
  );

  /** distance (px) from the first card to the last, and each card's stop along it */
  const measure = useCallback(() => {
    const items = slides();
    if (!items.length) return 0;
    const first = items[0].offsetLeft;
    const span = items[items.length - 1].offsetLeft - first;
    stops.current = items.map((el) => (span > 0 ? (el.offsetLeft - first) / span : 0));
    return span;
  }, [slides]);

  // ─── wide: pin the stage and let vertical scroll move the row ───
  useGSAP(
    () => {
      // the first client render reuses the server's guess; check the real environment
      if (!pinned || !window.matchMedia(ROW_QUERY).matches || prefersReducedMotion() || useApp.getState().plain) return;
      const tween = gsap.to(track.current, { x: () => -measure(), ease: "none" });
      const st = ScrollTrigger.create({
        trigger: stage.current,
        start: "top top",
        end: () => `+=${Math.max(1, measure())}`,
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        animation: tween,
        scrub: true,
        onUpdate: (self) => report(self.progress),
        onRefresh: (self) => report(self.progress),
      });
      trigger.current = st;
      return () => {
        trigger.current = null;
      };
    },
    { scope: root, dependencies: [pinned, measure, report], revertOnUpdate: true },
  );

  // ─── narrow / still: a native scroll-snap row ───
  useEffect(() => {
    if (pinned) return;
    const vp = viewport.current;
    if (!vp) return;
    let raf = 0;
    const sync = () => {
      const max = vp.scrollWidth - vp.clientWidth;
      const items = slides();
      const first = items[0]?.offsetLeft ?? 0;
      stops.current = items.map((el) => (max > 0 ? Math.min(1, (el.offsetLeft - first) / max) : 0));
      report(max > 0 ? vp.scrollLeft / max : 0);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };
    const ro = new ResizeObserver(onScroll);
    ro.observe(vp);
    vp.addEventListener("scroll", onScroll, { passive: true });
    sync();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      vp.removeEventListener("scroll", onScroll);
    };
  }, [pinned, report, slides]);

  const go = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(N - 1, i));
      const st = trigger.current;
      if (st) {
        const y = st.start + (st.end - st.start) * stops.current[n];
        const lenis = getLenis();
        if (lenis) lenis.scrollTo(y, { duration: 1.2, easing: expoOut, force: true });
        else window.scrollTo({ top: y, behavior: "smooth" });
        return;
      }
      const vp = viewport.current;
      const items = slides();
      if (!vp || !items[n]) return;
      vp.scrollTo({ left: items[n].offsetLeft - items[0].offsetLeft, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    },
    [slides],
  );

  // Pinned: once scrolling settles inside the row's range, ease to the nearest card.
  useEffect(() => {
    if (!pinned) return;
    let timer = 0;
    const settle = () => {
      const st = trigger.current;
      const lenis = getLenis();
      if (!st || !lenis || lenis.isScrolling === "smooth") return;
      const y = lenis.scroll;
      if (y <= st.start + 1 || y >= st.end - 1) return;
      const p = (y - st.start) / (st.end - st.start);
      let best = 0;
      stops.current.forEach((s, i) => {
        if (Math.abs(s - p) < Math.abs(stops.current[best] - p)) best = i;
      });
      const target = st.start + (st.end - st.start) * stops.current[best];
      if (Math.abs(target - y) < 2) return;
      lenis.scrollTo(target, { duration: 0.7, easing: expoOut, force: true });
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 180);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pinned]);

  // Pinned: a sideways trackpad swipe over the row moves it too (only inside the pin's range).
  useEffect(() => {
    const vp = viewport.current;
    if (!pinned || !vp) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      const st = trigger.current;
      const lenis = getLenis();
      if (!st || !lenis) return;
      const y = lenis.targetScroll;
      if (y < st.start - 2 || y > st.end + 2) return;
      e.preventDefault();
      lenis.scrollTo(Math.max(st.start, Math.min(st.end, y + e.deltaX)), { lerp: 0.12, force: true });
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [pinned]);

  const slideOf = (el: EventTarget | null) => {
    const s = el instanceof Element ? el.closest<HTMLElement>("[data-slide]") : null;
    return s ? slides().indexOf(s) : -1;
  };

  // keyboard travel into a card that's off to the side brings it in
  const onFocus = (e: FocusEvent) => {
    const i = slideOf(e.target);
    if (i >= 0 && i !== activeRef.current) go(i);
  };

  // a click on a neighbouring card (not on one of its controls) brings it in
  const onClick = (e: MouseEvent) => {
    if (e.target instanceof Element && e.target.closest("a, button, input, label, [role='switch']")) return;
    const i = slideOf(e.target);
    if (i >= 0 && i !== activeRef.current) go(i);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.target instanceof Element && e.target.closest("input, textarea, select, [role='slider']")) return;
    e.preventDefault();
    go(activeRef.current + (e.key === "ArrowRight" ? 1 : -1));
  };

  return (
    <Sheet id="sites" title={<>Projects</>} aside={`${N} projects · live demos`} bleed>
      <div ref={root} className={styles.root}>
        <div
          ref={stage}
          className={styles.stage}
          data-pinned={pinned || undefined}
          role="region"
          aria-roledescription="carousel"
          aria-label="Projects"
          onKeyDown={onKeyDown}
        >
          {plain ? null : <Backdrop progress={progress} still={still} />}

          <div className={styles.bar}>
            <p className={styles.count}>
              <span className={styles.countNow}>{pad2(active + 1)}</span>
              <span className={styles.countAll}> / {pad2(N)}</span>
            </p>
            <span className={styles.rail} aria-hidden="true">
              <span ref={fill} className={styles.railFill} />
              {CARDS.map((c, i) => (
                <span key={c.project.id} className={styles.railStop} style={{ left: `${(i / (N - 1)) * 100}%` }} data-on={i <= active || undefined} />
              ))}
            </span>
            <p className="visually-hidden" aria-live="polite">
              Project {active + 1} of {N}: {CARDS[active].project.title}
            </p>
            <span className={styles.hint} aria-hidden="true">
              {pinned ? "keep scrolling, the row slides sideways" : "swipe sideways, or use the arrows"}
            </span>
            <div className={styles.arrows}>
              <button type="button" className={styles.arrow} data-dir="prev" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous project">
                <Icon name="arrow-right" size={22} />
              </button>
              <button
                type="button"
                className={styles.arrow}
                data-dir="next"
                onClick={() => go(active + 1)}
                disabled={active === N - 1}
                aria-label="Next project"
                data-guide="projects-next"
              >
                <Icon name="arrow-right" size={22} />
              </button>
            </div>
          </div>

          <div ref={viewport} className={styles.viewport} data-guide="projects-track" data-lenis-prevent-horizontal="">
            <div ref={track} className={styles.track} onFocus={onFocus} onClick={onClick}>
              {CARDS.map((c, i) => (
                <div
                  key={c.project.id}
                  className={styles.slide}
                  data-slide=""
                  data-current={i === active || undefined}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${N}: ${c.project.title}`}
                >
                  <SiteSheet
                    project={c.project}
                    no={i + 1}
                    variant={c.variant}
                    line={c.line}
                    demo={c.demo}
                    drawing={c.drawing}
                    report={c.report}
                    Demo={c.Demo}
                    current={i === active}
                  />
                </div>
              ))}
              <div className={styles.end} aria-hidden="true">
                <span className={styles.endRule} />
                <span className={styles.endText}>End of projects</span>
                <Icon name="arrow-down" size={18} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
