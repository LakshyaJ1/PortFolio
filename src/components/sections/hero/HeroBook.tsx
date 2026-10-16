"use client";

import { useEffect, type MouseEvent } from "react";
import { Button } from "@/components/ui/Button";
import { PROFILE } from "@/content/profile";
import { emit } from "@/lib/events";
import { useApp } from "@/lib/store";

// Cal.com's popup, one click from the landing sheet. Its own namespace: the rendezvous
// section's inline embed lives under another one, so the two never fight over config.
const NAMESPACE = "hero";
const CONFIG = { layout: "month_view", theme: "dark" } as const;
const EMBED_SRC = "https://app.cal.com/embed/embed.js";

type CalApi = Awaited<ReturnType<typeof import("@calcom/embed-react").getCalApi>>;
type CalGlobal = { ns?: Record<string, { instance?: unknown } | undefined> };

let api: Promise<CalApi> | null = null;
/** embed.js could not load (blocked, offline): the link then opens cal.com in a new tab */
let failed = false;
let warmed = false;

/** embed.js has arrived and set up our namespace: its own click listener opens the popup */
const ready = () => Boolean((window as unknown as { Cal?: CalGlobal }).Cal?.ns?.[NAMESPACE]?.instance);

/** Cal.com themed from our own tokens, read at runtime so the popup follows globals.css. */
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

function onBooked() {
  emit("booking:done", {});
  useApp.getState().toast({ tone: "info", title: "Call booked", body: "The invite is on its way to your inbox." });
}

/** Load the embed once. Calls made before embed.js arrives are queued by Cal itself. */
function loadCal() {
  if (!api) {
    api = import("@calcom/embed-react").then(async ({ getCalApi }) => {
      const cal = await getCalApi({ namespace: NAMESPACE });
      document.querySelector(`script[src="${EMBED_SRC}"]`)?.addEventListener(
        "error",
        () => {
          failed = true;
        },
        { once: true },
      );
      cal("ui", { theme: "dark", hideEventTypeDetails: false, layout: "month_view", cssVarsPerTheme: themeVars() });
      cal("on", { action: "bookingSuccessfulV2", callback: onBooked });
      return cal;
    });
    api.catch(() => {
      failed = true;
    });
  }
  return api;
}

/** Hover or focus says a click is coming: fetch the booking page's assets ahead of it. */
function warm() {
  if (warmed || failed) return;
  warmed = true;
  loadCal()
    .then((cal) => cal("preload", { calLink: PROFILE.cal }))
    .catch(() => {});
}

/**
 * "Book a 30-min call": opens the Cal.com popup in place (Cal's element-click mode, wired by
 * the data-cal-* attributes). The embed loads while the visitor reads, so the first click
 * opens it at once; a click that beats the script queues the popup instead of navigating.
 */
export function HeroBook({ className }: { className?: string }) {
  const phase = useApp((s) => s.phase);

  useEffect(() => {
    if (phase !== "site") return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => void loadCal(), { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => void loadCal(), 1200);
    return () => window.clearTimeout(id);
  }, [phase]);

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    emit("booking:open", {});
    // no embed here: let the link open cal.com in a new tab
    if (failed) return;
    e.preventDefault();
    if (ready()) return; // Cal's own document listener reads the data-cal-* attributes
    loadCal()
      .then((cal) => cal("modal", { calLink: PROFILE.cal, config: { ...CONFIG } }))
      .catch(() => {
        failed = true;
        useApp.getState().toast({ tone: "error", title: "The calendar couldn’t open here", body: "Click Book again to pick a slot on cal.com." });
      });
  };

  return (
    <Button
      variant="fix"
      size="lg"
      icon="calendar"
      cta="book"
      href={PROFILE.calUrl}
      className={className}
      data-guide="hero-book"
      data-cal-namespace={NAMESPACE}
      data-cal-link={PROFILE.cal}
      data-cal-config={JSON.stringify(CONFIG)}
      onClick={onClick}
      // (pointer enter/leave belong to Button's mascot hover; mouseenter is free)
      onMouseEnter={warm}
      onFocus={warm}
    >
      Book a 30-min call
    </Button>
  );
}
