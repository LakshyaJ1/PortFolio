"use client";

import type { CSSProperties, Ref } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Dock, Side } from "./flight";
import styles from "./Mascot.module.css";

export type Line = { key: number; text: string; label: string; kind: string };

/**
 * Bindu's speech: a survey annotation (a ruled label with a short leader back to her) rather
 * than a cartoon bubble. One at a time. On wide screens it rides beside her (the mover sets
 * its transform each frame); on phones it docks to the top or bottom edge. The element is
 * always mounted so it can be positioned before it shows.
 */
export function Callout({
  line,
  shown,
  dock,
  side,
  tail,
  width,
  boxRef,
  onDismiss,
  onQuiet,
  onHold,
}: {
  line: Line | null;
  shown: boolean;
  dock: Dock | null;
  side: Side | null;
  /** where Bindu's centre is along the bubble's top/bottom edge, px (bubbles above or below her) */
  tail: number;
  /** the floating bubble's width cap, as the layout chose it (px); null for the default */
  width: number | null;
  boxRef: Ref<HTMLDivElement>;
  onDismiss: () => void;
  onQuiet: () => void;
  onHold: (held: boolean) => void;
}) {
  const live = Boolean(line && shown);
  return (
    <div
      ref={boxRef}
      className={styles.callout}
      data-bindu-bubble=""
      data-shown={live}
      data-kind={line?.kind}
      data-dock={dock ?? undefined}
      data-side={dock ? undefined : (side ?? undefined)}
      style={{ "--tail": `${Math.round(tail)}px`, ...(width && !dock ? { maxWidth: `${Math.round(width)}px` } : {}) } as CSSProperties}
      aria-hidden={!live || undefined}
      onPointerEnter={() => onHold(true)}
      onPointerLeave={() => onHold(false)}
      onFocus={() => onHold(true)}
      onBlur={() => onHold(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDismiss();
        }
      }}
    >
      {line ? (
        <div key={line.key} className={styles.calloutInner}>
          <div className={styles.calloutHead}>
            <span className={styles.calloutLabel}>{line.label}</span>
            <button type="button" className={styles.quiet} onClick={onQuiet} tabIndex={live ? 0 : -1}>
              Quiet, Bindu
            </button>
            <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss Bindu's note" tabIndex={live ? 0 : -1}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <p className={styles.calloutText}>{line.text}</p>
        </div>
      ) : null}
    </div>
  );
}

/** An invisible copy of the bubble, used to measure a line before she flies anywhere. */
export function CalloutMeasure({ boxRef }: { boxRef: Ref<HTMLDivElement> }) {
  return (
    <div ref={boxRef} className={styles.callout} data-measure aria-hidden="true">
      <div className={styles.calloutInner}>
        <div className={styles.calloutHead}>
          <span className={styles.calloutLabel} data-label />
          <span className={styles.quiet}>Quiet, Bindu</span>
          <span className={styles.dismiss} />
        </div>
        <p className={styles.calloutText} data-text />
      </div>
    </div>
  );
}
