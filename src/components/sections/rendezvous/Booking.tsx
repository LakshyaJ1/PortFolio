"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PROFILE } from "@/content/profile";
import { emit } from "@/lib/events";
import { useInView } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import styles from "./Rendezvous.module.css";

// The embed is heavy (it loads app.cal.com/embed/embed.js and an iframe), so it is code-split and
// mounted when the panel comes within reach: a generous margin, so it is ready by the time it is seen.
// Its own Cal namespace ("rendezvous") keeps it apart from the hero's popup ("hero").
const Cal = dynamic(() => import("@calcom/embed-react"), { ssr: false, loading: () => null });

const NAMESPACE = "rendezvous";
const SLOW_MS = 10000;

type State = "idle" | Status;
/** the embed's own progress, once it has been mounted */
type Status = "loading" | "ready" | "slow" | "failed";

/** Cal.com themed from our own tokens (read at runtime so the iframe follows globals.css). */
function themeVars() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const dark: Record<string, string> = {
    "cal-brand": v("--fix", "#ff5b23"),
    "cal-brand-emphasis": v("--fix-hi", "#ff7a45"),
    "cal-brand-text": v("--z0", "#060907"),
    "cal-text": v("--z9", "#cfd8d1"),
    "cal-text-emphasis": v("--z10", "#eef2ec"),
    "cal-text-subtle": v("--z8", "#9eaba2"),
    "cal-text-muted": v("--z8", "#9eaba2"),
    "cal-bg": v("--z2", "#111814"),
    "cal-bg-emphasis": v("--z3", "#18211c"),
    "cal-bg-subtle": v("--z3", "#18211c"),
    "cal-bg-muted": v("--z1", "#0b100d"),
    "cal-border": v("--z5", "#2f3c35"),
    "cal-border-subtle": v("--z4", "#212c26"),
    "cal-border-booker": v("--z4", "#212c26"),
    radius: "2px",
  };
  return { dark, light: dark };
}

export function Booking() {
  const panelRef = useRef<HTMLDivElement>(null);
  const near = useInView(panelRef, { rootMargin: "1400px 0px", once: true });
  const seen = useInView(panelRef, { threshold: 0.3, once: true });
  const [status, setStatus] = useState<Status>("loading");
  // `near` latches (once), so the embed mounts the first time the panel comes within reach
  const mounted = near;
  const state: State = mounted ? status : "idle";

  // Opening the panel: the mascot and anyone else listening know the visitor is at the rendezvous.
  useEffect(() => {
    if (seen) emit("booking:open", {});
  }, [seen]);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    let api: Awaited<ReturnType<typeof import("@calcom/embed-react").getCalApi>> | null = null;
    const slow = window.setTimeout(() => setStatus((s) => (s === "loading" ? "slow" : s)), SLOW_MS);

    const onReady = () => {
      window.clearTimeout(slow);
      setStatus("ready");
    };
    const onFailed = () => {
      window.clearTimeout(slow);
      setStatus((s) => (s === "ready" ? s : "failed"));
    };
    const onBooked = () => {
      emit("booking:done", {});
      useApp.getState().toast({
        tone: "info",
        title: "Call booked",
        body: "The invite is on its way to your inbox.",
      });
    };

    (async () => {
      try {
        const { getCalApi } = await import("@calcom/embed-react");
        const cal = await getCalApi({ namespace: NAMESPACE });
        if (cancelled) return;
        api = cal;
        cal("ui", {
          theme: "dark",
          // the invitation beside the booker already says who, what and how long: keep it to calendar + slots
          hideEventTypeDetails: true,
          layout: "month_view",
          cssVarsPerTheme: themeVars(),
        });
        cal("on", { action: "linkReady", callback: onReady });
        cal("on", { action: "linkFailed", callback: onFailed });
        cal("on", { action: "bookingSuccessfulV2", callback: onBooked });
      } catch {
        if (!cancelled) onFailed();
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(slow);
      try {
        api?.("off", { action: "linkReady", callback: onReady });
        api?.("off", { action: "linkFailed", callback: onFailed });
        api?.("off", { action: "bookingSuccessfulV2", callback: onBooked });
      } catch {
        /* embed already gone */
      }
    };
  }, [mounted]);

  return (
    <div ref={panelRef} className={styles.panel} data-state={state} data-guide="book">
      <span className={styles.corner} data-c="tl" aria-hidden="true" />
      <span className={styles.corner} data-c="tr" aria-hidden="true" />
      <span className={styles.corner} data-c="bl" aria-hidden="true" />
      <span className={styles.corner} data-c="br" aria-hidden="true" />

      <div className={styles.collar}>
        <span className={styles.collarName}>
          <Icon name="calendar" size={16} />
          Pick a time
        </span>
        <span className="mono">30 min</span>
        <a className={styles.calLink} href={PROFILE.calUrl} target="_blank" rel="noopener noreferrer">
          Open on cal.com
          <Icon name="arrow-ne" size={14} />
        </a>
      </div>

      <div className={styles.stage} data-lenis-prevent>
        {mounted ? (
          <Cal
            namespace={NAMESPACE}
            calLink={PROFILE.cal}
            config={{ layout: "month_view", theme: "dark" }}
            className={styles.embed}
            style={{ width: "100%", height: "100%", overflow: "auto" }}
          />
        ) : null}

        {state !== "ready" ? (
          <div className={styles.skeleton} aria-hidden="true">
            <div className={styles.skCal}>
              <span className={styles.skRule} style={{ width: "36%" }} />
              <div className={styles.skDays}>
                {Array.from({ length: 35 }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
            </div>
            <div className={styles.skSlots}>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} />
              ))}
            </div>
            <span className={styles.skSweep} />
          </div>
        ) : null}

        {state === "loading" || state === "idle" ? (
          <p className={styles.skText} role="status">
            Loading his calendar…
          </p>
        ) : null}

        {state === "slow" || state === "failed" ? (
          <div className={styles.fallback} role="status">
            <p>
              <strong>{state === "failed" ? "The calendar couldn’t load here." : "The calendar hasn’t answered yet."}</strong>{" "}
              The same thirty minutes are bookable on Cal.com directly.
            </p>
            <Button variant="fix" href={PROFILE.calUrl} icon="arrow-ne" cta="rendezvous-fallback">
              Book on cal.com
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
