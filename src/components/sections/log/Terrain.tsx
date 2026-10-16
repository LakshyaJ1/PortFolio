"use client";

import { useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useIsNarrow, useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { arrive } from "@/components/sections/benchmarks/arrive";
import { buildTerrain, type Cell, type Day } from "./terrainModel";
import { fullDay, longDay, shortDay } from "./time";
import styles from "./Log.module.css";

gsap.registerPlugin(useGSAP);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Activity terrain: a year of daily contributions as a contoured heightfield.
 * Landscape on wide sheets (weeks run east), portrait on phones (weeks run south).
 */
export function Terrain({ days, total, scanning = false }: { days: Day[]; total: number; scanning?: boolean }) {
  const narrow = useIsNarrow();
  const reduced = useReducedMotion();
  const plain = useApp((s) => s.plain);
  const orient = narrow ? "portrait" : "landscape";
  const t = useMemo(() => buildTerrain(days, orient), [days, orient]);
  const figRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const titleId = useId();

  const summit = t.peaks.find((p) => p.summit) ?? null;
  const activeDays = useMemo(() => t.cells.filter((c) => c.count > 0), [t]);
  const empty = !scanning && activeDays.length === 0;

  const read = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm || scanning) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const { x0, y0 } = t.plot;
    const week = Math.floor(t.orient === "landscape" ? (p.x - x0) / t.cw : (p.y - y0) / t.ch);
    const dow = Math.floor(t.orient === "landscape" ? (p.y - y0) / t.ch : (p.x - x0) / t.cw);
    setHover(t.lookup.get(`${week}:${dow}`) ?? null);
  };

  // The survey rises: contours ink in from the lowest ring to the summit, then the spot heights fix.
  useGSAP(
    (_ctx, contextSafe) => {
      const fig = figRef.current;
      if (reduced || plain || scanning || !fig || !contextSafe) return;
      arrive({
        trigger: fig,
        start: "top 85%",
        safe: (fn) => contextSafe(fn),
        build: () => {
          const lines = gsap.utils.toArray<SVGPathElement>("[data-contour]", fig);
          const marks = gsap.utils.toArray<SVGGElement>("[data-mark]", fig);
          const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
          if (lines.length) {
            tl.fromTo(
              lines,
              { strokeDasharray: "1 1", strokeDashoffset: 1 },
              { strokeDashoffset: 0, duration: 1.4, stagger: 0.025, clearProps: "strokeDasharray,strokeDashoffset" },
            );
          }
          if (marks.length) {
            tl.fromTo(
              marks,
              { opacity: 0, y: 4 },
              { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, clearProps: "opacity,transform" },
              lines.length ? 0.5 : 0,
            );
          }
          return tl;
        },
      });
    },
    { scope: figRef, dependencies: [t, reduced, plain, scanning] },
  );

  const { x0, y0, x1, y1 } = t.plot;
  const summary = scanning
    ? "Contribution terrain, waiting for GitHub."
    : `Contribution terrain for the last twelve months: ${plural(total, "contribution")} on ${plural(activeDays.length, "day")}` +
      (summit ? `; highest ${summit.count} on ${fullDay(summit.date)}.` : ".");

  return (
    <figure ref={figRef} className={styles.terrain} data-orient={t.orient} data-scanning={scanning || undefined}>
      <figcaption className={styles.readout} aria-hidden="true">
        {scanning ? (
          <span>Taking a fix on github.com/LakshyaJ1…</span>
        ) : hover ? (
          <>
            <span className={styles.readDay}>{longDay(hover.date)}</span>
            <span className={styles.readCount}>{plural(hover.count, "contribution")}</span>
          </>
        ) : (
          <span>{narrow ? "Tap the terrain to read a day" : "Point at the terrain to read a day"}</span>
        )}
        {!scanning && t.levels > 0 ? (
          <span className={styles.interval}>
            Contour interval {t.interval} {t.interval === 1 ? "contribution" : "contributions"}
          </span>
        ) : null}
      </figcaption>

      <svg
        ref={svgRef}
        className={styles.map}
        viewBox={`0 0 ${t.width} ${t.height}`}
        role="img"
        aria-labelledby={titleId}
        onPointerMove={read}
        onPointerDown={read}
        onPointerLeave={() => setHover(null)}
      >
        <title id={titleId}>{summary}</title>

        <rect className={styles.frame} x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
        <path className={styles.ticks} d={t.ticks} />

        <g className={styles.points}>
          {t.cells.map((c) => (
            <circle key={c.date} cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r={c.count > 0 ? 1.5 : 1} data-on={c.count > 0 || undefined} />
          ))}
        </g>

        <g className={styles.contours}>
          {t.contours.map((c, i) => (
            <path key={i} d={c.d} pathLength={1} data-contour data-index={c.index || undefined} />
          ))}
        </g>

        {hover ? (
          <g className={styles.cross} aria-hidden="true">
            <path d={`M${hover.x} ${y0}V${y1}M${x0} ${hover.y}H${x1}`} />
            <rect x={hover.x - t.cw / 2} y={hover.y - t.ch / 2} width={t.cw} height={t.ch} />
          </g>
        ) : null}

        <g className={styles.peaks}>
          {t.peaks.map((p) => (
            <g key={p.date} data-mark>
              {p.summit ? (
                <path className={styles.trig} d={`M${p.x} ${p.y - 5}l4.6 8h-9.2Z`} />
              ) : (
                <circle className={styles.spot} cx={p.x} cy={p.y} r={2.2} />
              )}
              {p.label ? (
                <text x={p.label.x} y={p.label.y} textAnchor={p.label.anchor} className={styles.spotLabel}>
                  <tspan className={styles.spotCount}>{p.count}</tspan>
                  <tspan dx={4}>{shortDay(p.date)}</tspan>
                </text>
              ) : null}
            </g>
          ))}
        </g>

        {t.last && !scanning ? (
          <g className={styles.today} data-mark>
            <circle cx={t.last.x} cy={t.last.y} r={5} />
            <path
              d={`M${t.last.x} ${t.last.y - 9}v5M${t.last.x} ${t.last.y + 4}v5M${t.last.x - 9} ${t.last.y}h5M${t.last.x + 4} ${t.last.y}h5`}
            />
          </g>
        ) : null}

        <g className={styles.margin} visibility={scanning ? "hidden" : undefined}>
          {t.months.map((m) => (
            <text key={`${m.label}-${m.x}-${m.y}`} x={m.x} y={m.y} textAnchor={m.anchor}>
              {m.label}
            </text>
          ))}
          {t.weekdays.map((w) => (
            <text key={w.label} x={w.x} y={w.y} textAnchor={w.anchor}>
              {w.label}
            </text>
          ))}
        </g>

        {scanning ? (
          t.orient === "landscape" ? (
            <line
              className={styles.sweep}
              data-axis="x"
              x1={x0}
              x2={x0}
              y1={y0}
              y2={y1}
              style={{ "--travel": `${x1 - x0}px` } as CSSProperties}
            />
          ) : (
            <line
              className={styles.sweep}
              data-axis="y"
              x1={x0}
              x2={x1}
              y1={y0}
              y2={y0}
              style={{ "--travel": `${y1 - y0}px` } as CSSProperties}
            />
          )
        ) : null}
      </svg>

      {empty ? <p className={styles.flat}>Flat ground: no public contributions in the last twelve months.</p> : null}

      {!scanning && activeDays.length ? (
        <ul className="visually-hidden" aria-label="Days with contributions">
          {activeDays.map((c) => (
            <li key={c.date}>
              {longDay(c.date)}: {plural(c.count, "contribution")}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
