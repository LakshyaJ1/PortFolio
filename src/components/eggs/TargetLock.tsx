"use client";

import { useEffect } from "react";
import { PROFILE } from "@/content/profile";
import { formatDMS } from "@/lib/geo";
import { useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import styles from "./TargetLock.module.css";

/** लक्ष्य means target: brackets snap onto the centre of the sheet for a beat. Non-blocking. */
export function TargetLock({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const plain = useApp((s) => s.plain);

  useEffect(() => {
    const t = window.setTimeout(onDone, 1300);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div className={styles.root} data-calm={reduce || plain ? "" : undefined} role="status" aria-live="polite">
      <span className="visually-hidden">Target locked</span>
      <span className={styles.hair} data-axis="x" aria-hidden="true" />
      <span className={styles.hair} data-axis="y" aria-hidden="true" />
      <div className={styles.reticle} aria-hidden="true">
        <span className={styles.corner} data-c="tl" />
        <span className={styles.corner} data-c="tr" />
        <span className={styles.corner} data-c="bl" />
        <span className={styles.corner} data-c="br" />
        <span className={styles.ring} />
        <span className={styles.dot} />
      </div>
      <div className={styles.plate} aria-hidden="true">
        <p className={styles.readout}>
          <span lang="hi" className={styles.deva}>
            लक्ष्य
          </span>
          <span className={styles.dash}>—</span>
          <span>TARGET LOCKED</span>
        </p>
        <p className={styles.sub}>{formatDMS(PROFILE.home)} · RNG 0.0 M</p>
      </div>
    </div>
  );
}
