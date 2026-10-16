"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { discover } from "@/lib/discover";
import { formatMonth } from "@/lib/geo";
import { useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { TIMELINE, marks, type Station } from "./stations";
import styles from "./Traverse.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const NBSP = String.fromCharCode(160);
/** where on screen the line has drawn to (stations light as they cross it) */
const READ_LINE = "62%";

const plainText = (line: string) => line.replace(/\[|\]/g, "");

/** Date chip, "Current" badge and length, the first thing the eye lands on. */
function When({ s }: { s: Station }) {
  return (
    <>
      <p className={styles.date}>
        <Icon name="calendar" size={15} />
        <time dateTime={s.start}>{formatMonth(s.start)}</time>
        <span aria-hidden="true">–</span>
        <span className="visually-hidden"> to </span>
        {s.end ? <time dateTime={s.end}>{formatMonth(s.end)}</time> : <span>Present</span>}
      </p>
      {s.ongoing && s.kind === "work" ? <span className={styles.current}>Current</span> : null}
      {s.months ? (
        <span className={styles.dur}>
          {s.months} {s.months === 1 ? "month" : "months"}
        </span>
      ) : null}
    </>
  );
}

function Card({ s, open, plain, onToggle }: { s: Station; open: boolean; plain: boolean; onToggle: () => void }) {
  const shown = new Set(s.highlights.map(plainText));
  // the full résumé wording, minus any line already printed in full above
  const points = s.points.filter((p) => !shown.has(p));
  const hasMore = points.length > 0 || s.stack.length > 0 || Boolean(s.link) || Boolean(s.nda);
  const expanded = plain || open;
  const detailsId = `station-${s.id}-details`;
  const showMode = s.mode && s.mode !== s.place;

  return (
    <div className={styles.cardGrid}>
      <div className={styles.cardHead}>
        {/* keep "·" separators from starting a line */}
        <h3 className={styles.role}>{s.role.split(" · ").join(`${NBSP}· `)}</h3>
        <p className={styles.org}>
          {s.org}
          {s.orgNote ? <span className={styles.orgNote}> · {s.orgNote}</span> : null}
        </p>
        <p className={styles.chips}>
          <span className={styles.place}>{s.place}</span>
          {showMode ? <span className={styles.chip}>{s.mode}</span> : null}
          {s.kind === "school" ? <span className={styles.chip}>Education</span> : null}
        </p>
      </div>

      <div className={styles.cardBody}>
        {s.figures.length ? (
          <dl className={styles.figures}>
            {s.figures.map((f) => (
              <div key={f.k} className={styles.figure}>
                <dt>{f.k}</dt>
                <dd>{f.v}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {s.highlights.length ? (
          <ul className={styles.highlights}>
            {s.highlights.map((h) => (
              <li key={h}>
                {marks(h).map((part, i) => (part.mark ? <mark key={i}>{part.text}</mark> : part.text))}
              </li>
            ))}
          </ul>
        ) : null}

        {hasMore ? (
          <>
            {plain ? null : (
              <button type="button" className={styles.more} aria-expanded={open} aria-controls={detailsId} onClick={onToggle}>
                {open ? "Less" : "Full details"}
                <Icon name={open ? "minus" : "plus"} size={14} />
              </button>
            )}
            <div id={detailsId} className={styles.details} data-open={expanded || undefined}>
              <div className={styles.detailsInner} inert={!expanded}>
                {points.length ? (
                  <ul className={styles.points}>
                    {points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : null}
                {s.stack.length ? (
                  <ul className={styles.stack} aria-label="Stack">
                    {s.stack.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : null}
                {s.link ? (
                  <a className={styles.link} href={s.link.href} target="_blank" rel="noopener noreferrer">
                    {s.link.label}
                    <Icon name="arrow-ne" size={15} />
                  </a>
                ) : null}
                {s.nda ? <p className={styles.classified}>Anything beyond this is classified.</p> : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Hatched restricted area around NDA work. Knock three times and you get a training exercise instead. */
function Restricted({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const knocks = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const reduce = useReducedMotion();

  const knock = () => {
    knocks.current += 1;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      knocks.current = 0;
    }, 4000);

    const el = ref.current;
    if (el) {
      const cs = getComputedStyle(document.documentElement);
      const fix = cs.getPropertyValue("--fix").trim() || "#ff5b23";
      const line = cs.getPropertyValue("--z5").trim() || "#2f3c35";
      gsap.fromTo(el, { borderColor: fix }, { borderColor: line, duration: 0.7, ease: "expo.out", overwrite: "auto" });
      if (!reduce) {
        gsap.fromTo(el, { x: knocks.current % 2 ? -5 : 5 }, { x: 0, duration: 0.5, ease: "expo.out", overwrite: "auto" });
      }
    }

    if (knocks.current >= 3) {
      knocks.current = 0;
      window.clearTimeout(timer.current);
      discover("restricted");
      useApp.getState().toast({ title: "Clearance denied.", body: "Here's a training exercise instead.", tone: "info" });
      window.setTimeout(() => useApp.getState().startGame("deepfake"), 650);
    }
  };

  return (
    <div
      ref={ref}
      className={styles.restricted}
      data-guide="work-restricted"
      onClick={(e) => {
        if ((e.target as Element).closest("a, button")) return;
        knock();
      }}
    >
      <button type="button" className={styles.ndaTag} onClick={knock} aria-label="Restricted area, under NDA. Knock to request clearance.">
        Restricted · NDA
      </button>
      <div className={styles.plate}>{children}</div>
    </div>
  );
}

function Marker() {
  return (
    <svg viewBox="0 0 16 16">
      <polygon points="8,0.5 14.5,11.75 1.5,11.75" />
      <circle cx="8" cy="8" r="1.6" />
    </svg>
  );
}

export function TraverseList() {
  const { stations } = TIMELINE;
  const rootRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  /** each station's node centre, in px from the top of the timeline */
  const ys = useRef<number[]>([]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const reduce = useReducedMotion();
  const plain = useApp((s) => s.plain);
  const calm = reduce || plain;

  const toggle = (id: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Measure where the nodes landed; the rail runs from the first to the last. Written straight
  // to CSS variables, so a re-measure never re-renders the list.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    let refresh = 0;
    let prev = "";
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rr = root.getBoundingClientRect();
        const pts = Array.from(root.querySelectorAll<HTMLElement>("[data-node]")).map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.left + r.width / 2 - rr.left, y: r.top + r.height / 2 - rr.top };
        });
        if (pts.length < 2) return;
        ys.current = pts.map((p) => p.y);
        const top = pts[0].y;
        const h = pts[pts.length - 1].y - top;
        root.style.setProperty("--rail-x", `${pts[0].x.toFixed(1)}px`);
        root.style.setProperty("--rail-top", `${top.toFixed(1)}px`);
        root.style.setProperty("--rail-h", `${h.toFixed(1)}px`);
        root.setAttribute("data-measured", "");
        const key = `${pts[0].x.toFixed(0)}:${ys.current.map((y) => y.toFixed(0)).join(",")}`;
        if (key !== prev) {
          prev = key;
          window.clearTimeout(refresh);
          refresh = window.setTimeout(() => ScrollTrigger.refresh(), 160);
        }
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(refresh);
      ro.disconnect();
    };
  }, []);

  // The line draws as you scroll; each station lights when the line reaches its node.
  useGSAP(
    () => {
      const root = rootRef.current;
      const ink = inkRef.current;
      const tip = tipRef.current;
      if (!root || !ink || !tip) return;
      const els = Array.from(root.querySelectorAll<HTMLElement>("[data-station]"));
      const light = (y: number) =>
        els.forEach((el, i) => {
          const on = y >= (ys.current[i] ?? Infinity) - 1;
          if (on !== el.hasAttribute("data-lit")) el.toggleAttribute("data-lit", on);
        });

      if (calm) {
        ink.style.transform = "scaleY(1)";
        tip.style.opacity = "0";
        light(Infinity);
        return;
      }

      const state = { p: 0 };
      const paint = () => {
        const top = ys.current[0] ?? 0;
        const h = (ys.current[ys.current.length - 1] ?? 0) - top;
        ink.style.transform = `scaleY(${state.p.toFixed(4)})`;
        tip.style.transform = `translate3d(0, ${(state.p * h).toFixed(1)}px, 0)`;
        tip.style.opacity = state.p > 0.001 && state.p < 0.999 ? "1" : "0";
        light(state.p > 0.0005 ? top + state.p * h : -Infinity);
      };
      paint();
      gsap.to(state, {
        p: 1,
        ease: "none",
        onUpdate: paint,
        scrollTrigger: {
          trigger: root,
          start: () => `top+=${ys.current[0] ?? 0} ${READ_LINE}`,
          end: () => `top+=${Math.max((ys.current[ys.current.length - 1] ?? 0), (ys.current[0] ?? 0) + 1)} ${READ_LINE}`,
          scrub: 0.4,
          invalidateOnRefresh: true,
        },
      });
    },
    { scope: rootRef, dependencies: [calm], revertOnUpdate: true },
  );

  return (
    <div ref={rootRef} className={styles.timeline} data-guide="work-timeline" data-calm={calm || undefined}>
      <span className={styles.rail} aria-hidden="true" />
      <span ref={inkRef} className={styles.ink} aria-hidden="true" />
      <span ref={tipRef} className={styles.tip} aria-hidden="true" />

      <ol className={styles.list}>
        {/* the open station: where the line goes next */}
        <li className={styles.station} data-station data-kind="open">
          <div className={styles.when}>
            <p className={`${styles.date} ${styles.dateOpen}`}>Next</p>
          </div>
          <div className={styles.node} data-node aria-hidden="true">
            <Marker />
          </div>
          <div className={styles.card}>
            <div className={styles.openBody}>
              <h3 className={styles.role}>Next station: your team?</h3>
              <p className={styles.openNote}>Thirty minutes is enough to take a reading.</p>
              <Button href="#rendezvous" variant="line" icon="arrow-right" cta="traverse-next">
                Book a call
              </Button>
            </div>
          </div>
        </li>

        {stations.map((s) => (
          <li
            key={s.id}
            className={styles.station}
            data-station
            data-kind={s.kind}
            data-current={s.ongoing && s.kind === "work" ? "" : undefined}
            data-primary={s.primary ? "" : undefined}
            data-nda={s.nda ? "" : undefined}
          >
            <div className={styles.when}>
              <When s={s} />
            </div>
            <div className={styles.node} data-node aria-hidden="true">
              <Marker />
              {s.primary ? <span className={styles.pulse} /> : null}
            </div>
            <div className={styles.card}>
              {s.nda ? (
                <Restricted>
                  <Card s={s} open={open.has(s.id)} plain={plain} onToggle={() => toggle(s.id)} />
                </Restricted>
              ) : (
                <Card s={s} open={open.has(s.id)} plain={plain} onToggle={() => toggle(s.id)} />
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
