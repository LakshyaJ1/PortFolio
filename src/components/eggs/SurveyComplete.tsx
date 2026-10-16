"use client";

import { useEffect, useMemo } from "react";
import { CACHES } from "@/lib/caches";
import { useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { formatStamp } from "./shared";
import styles from "./SurveyComplete.module.css";

const RINGS = 8;

/** Irregular closed contour around the origin, deterministic per ring. */
function ringPath(i: number) {
  const R = 70 + i * 52;
  const phi = i * 1.7;
  const steps = 72;
  let d = "";
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * Math.PI * 2;
    const r = R * (1 + 0.07 * Math.sin(3 * t + phi) + 0.04 * Math.sin(5 * t + 2 * phi) + 0.02 * Math.sin(8 * t - phi));
    d += `${k ? "L" : "M"}${(Math.cos(t) * r).toFixed(1)} ${(Math.sin(t) * r * 0.82).toFixed(1)}`;
  }
  return `${d}Z`;
}

/** 12/12: contours close in on the summit and the sheet is signed off. Non-blocking. */
export function SurveyComplete({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const plain = useApp((s) => s.plain);
  const rings = useMemo(() => Array.from({ length: RINGS }, (_, i) => ringPath(RINGS - 1 - i)), []);
  const caches = useApp((s) => s.caches);
  const stamp = formatStamp(Math.max(0, ...Object.values(caches).map((t) => t ?? 0)));

  useEffect(() => {
    const app = useApp.getState();
    app.setMascotMood("celebrate");
    app.say("All Easter eggs found. You found all twelve.");
    const t = window.setTimeout(onDone, 4200);
    const quiet = window.setTimeout(() => {
      if (useApp.getState().mascotLine?.startsWith("All Easter eggs found")) useApp.getState().say(null);
    }, 6000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(quiet);
    };
  }, [onDone]);

  return (
    <div className={styles.root} data-calm={reduce || plain ? "" : undefined} role="status" aria-live="polite">
      <svg className={styles.rings} viewBox="-500 -420 1000 840" aria-hidden="true">
        {rings.map((d, i) => (
          <path
            key={i}
            d={d}
            pathLength={1}
            className={styles.ring}
            data-index={(RINGS - 1 - i) % 4 === 0 ? "" : undefined}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
        <g className={styles.summit}>
          <circle r="16" />
          <path d="M0 -34V-20M0 20V34M-34 0H-20M20 0H34" />
          <circle r="4" className={styles.pip} />
        </g>
      </svg>
      <div className={styles.plate}>
        <p className={styles.title}>All Easter eggs found</p>
        <p className={styles.sub}>
          {CACHES.length} / {CACHES.length} Easter eggs found · completed {stamp}
        </p>
      </div>
    </div>
  );
}
