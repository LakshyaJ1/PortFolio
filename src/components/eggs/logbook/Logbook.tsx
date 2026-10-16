"use client";

import { useRef, useState } from "react";
import { CACHES } from "@/lib/caches";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useDialog, usePresence } from "../a11y";
import { foundCount, formatStamp } from "../shared";
import styles from "./Logbook.module.css";

/** The Easter egg logbook: every egg with its how-to in the open; found ones show their reward and time. */
export function Logbook() {
  const open = useApp((s) => s.overlay === "logbook");
  const present = usePresence(open, 320);
  if (!present) return null;
  return <LogbookPanel open={open} />;
}

function LogbookPanel({ open }: { open: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const caches = useApp((s) => s.caches);
  const resetCaches = useApp((s) => s.resetCaches);
  const toast = useApp((s) => s.toast);
  const close = useApp((s) => s.closeOverlay);
  const [confirming, setConfirming] = useState(false);

  const found = foundCount(caches);
  const total = CACHES.length;
  const complete = found === total;

  const closeLogbook = () => {
    if (useApp.getState().overlay === "logbook") close();
  };

  useDialog(panelRef, open, {
    onEscape: () => (confirming ? setConfirming(false) : closeLogbook()),
  });

  const askReset = () => {
    setConfirming(true);
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLButtonElement>("[data-keep]")?.focus({ preventScroll: true }),
    );
  };

  const doReset = () => {
    resetCaches();
    setConfirming(false);
    toast({ tone: "info", title: "Progress reset", body: "Every Easter egg is hidden again. Happy hunting." });
  };

  return (
    <div className={styles.root} data-egg-dialog data-guide="logbook" data-state={open ? "open" : "closing"}>
      <div className={styles.scrim} onClick={closeLogbook} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="egg-log-title"
        tabIndex={-1}
        data-lenis-prevent
      >
        <header className={styles.head}>
          <h2 id="egg-log-title" className={styles.title}>
            Easter eggs
          </h2>
          <button type="button" className={styles.close} onClick={closeLogbook} aria-label="Close Easter egg list">
            <Icon name="close" size={18} />
          </button>
        </header>

        <p className={styles.lead}>
          Twelve small surprises are hidden on this site. Each one is listed below with exactly how to trigger it. Your
          finds are saved in this browser.
        </p>

        <div className={styles.progress}>
          <p className={styles.count}>
            <strong>
              {found} of {total}
            </strong>{" "}
            found
          </p>
          <div
            className={styles.bar}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={found}
            aria-label={`${found} of ${total} Easter eggs found`}
          >
            <span style={{ width: `${(found / total) * 100}%` }} />
          </div>
          {complete ? (
            <p className={styles.stamp}>
              <span>All found</span>
            </p>
          ) : null}
        </div>

        <ol className={styles.list}>
          {CACHES.map((c, i) => {
            const at = caches[c.id];
            return (
              <li key={c.id} className={styles.row} data-found={at ? "" : undefined}>
                <span className={styles.state} aria-hidden="true">
                  {at ? <Icon name="check" size={16} /> : String(i + 1).padStart(2, "0")}
                </span>
                <span className={styles.entry}>
                  <span className={styles.name}>
                    {c.name}
                    <span className={styles.badge}>{at ? "Found" : "Not found yet"}</span>
                  </span>
                  <span className={styles.how}>
                    <span className={styles.label}>How: </span>
                    {c.hint}
                  </span>
                  {at ? (
                    <span className={styles.reward}>
                      <span className={styles.label}>Reward: </span>
                      {c.reward}
                      {" · "}
                      <time dateTime={new Date(at).toISOString()}>{formatStamp(at)}</time>
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>

        <footer className={styles.foot}>
          {confirming ? (
            <div className={styles.confirm} role="group" aria-labelledby="egg-log-confirm">
              <p id="egg-log-confirm">
                Reset {found} {found === 1 ? "find" : "finds"} from this browser? This can&rsquo;t be undone.
              </p>
              <div className={styles.confirmActions}>
                <Button variant="line" onClick={doReset} className={styles.danger}>
                  Reset progress
                </Button>
                <Button variant="quiet" onClick={() => setConfirming(false)} data-keep>
                  Keep my finds
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button variant="quiet" onClick={askReset} disabled={found === 0}>
                Reset progress
              </Button>
              <Button variant="fix" onClick={closeLogbook}>
                Back to the site
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
