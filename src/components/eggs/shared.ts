"use client";

// Small helpers shared by every egg: input detection, cache bookkeeping, hydration timing.

import { CACHES, type CacheMeta } from "@/lib/caches";
import { useApp } from "@/lib/store";

type CacheMap = ReturnType<typeof useApp.getState>["caches"];

/** True when a key event is aimed at something the visitor is typing into. */
export function isTypingTarget(e: Event) {
  const path = typeof e.composedPath === "function" ? e.composedPath() : [];
  const t = (path[0] ?? e.target) as Element | null;
  if (!t || !(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (t as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "range", "submit", "reset", "color", "file", "image"].includes(type);
  }
  return false;
}

export function foundCount(caches: CacheMap) {
  return CACHES.filter((c) => caches[c.id]).length;
}

/** The next cache (in sheet order) the visitor hasn't logged yet. */
export function nextUnfound(caches: CacheMap = useApp.getState().caches): CacheMeta | null {
  return CACHES.find((c) => !caches[c.id]) ?? null;
}

/**
 * Run `cb` once the persisted store has rehydrated (AppShell rehydrates in an effect that
 * runs after ours). Discovering before that would be overwritten by the stored logbook.
 */
export function whenHydrated(cb: () => void): () => void {
  const p = useApp.persist;
  if (p.hasHydrated()) {
    cb();
    return () => {};
  }
  let done = false;
  const off = p.onFinishHydration(() => {
    if (done) return;
    done = true;
    cb();
  });
  return off;
}

export const GAME_TITLES = {
  rover: "GPS-denied rover",
  snake: "Survey snake",
  deepfake: "Spot the manipulated signal",
  coin: "Lakshyacoin miner",
} as const;

export const GAME_IDS = Object.keys(GAME_TITLES) as (keyof typeof GAME_TITLES)[];

export function formatStamp(ts: number) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(ts);
  } catch {
    return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
  }
}
