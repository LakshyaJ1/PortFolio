"use client";

import { useSyncExternalStore } from "react";

// Shared wall clocks. Time is only read on the client (never during prerender), so the
// server snapshot is null and the first client render matches the server HTML.

type Clock = { subscribe: (cb: () => void) => () => void; get: () => number };

const clocks = new Map<number, Clock>();

function clock(stepMs: number): Clock {
  const existing = clocks.get(stepMs);
  if (existing) return existing;
  const subs = new Set<() => void>();
  let now = 0;
  let timer: number | undefined;
  const floor = () => Math.floor(Date.now() / stepMs) * stepMs;
  const schedule = () => {
    timer = window.setTimeout(tick, stepMs - (Date.now() % stepMs) + 15);
  };
  const tick = () => {
    now = floor();
    subs.forEach((cb) => cb());
    schedule();
  };
  const c: Clock = {
    subscribe(cb) {
      subs.add(cb);
      if (subs.size === 1) {
        now = floor();
        schedule();
      }
      return () => {
        subs.delete(cb);
        if (!subs.size) window.clearTimeout(timer);
      };
    },
    get() {
      if (!now) now = floor();
      return now;
    },
  };
  clocks.set(stepMs, c);
  return c;
}

/** Current time (ms), refreshed on each `stepMs` boundary. null on the server and during hydration. */
export function useNow(stepMs = 1000): number | null {
  const c = clock(stepMs);
  return useSyncExternalStore<number | null>(c.subscribe, c.get, () => null);
}

export const SHEET_TZ = "Asia/Kolkata";
export const SHEET_OFFSET_MIN = 330;

const istHMS = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHEET_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const istHM = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHEET_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const localHM = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const formatIST = (t: number, seconds = false) => (seconds ? istHMS : istHM).format(t);
export const formatLocalHM = (t: number) => localHM.format(t);

/** 330 → "UTC+05:30", -240 → "UTC−04:00" */
export function formatOffset(mins: number) {
  const sign = mins < 0 ? "−" : "+";
  const a = Math.abs(mins);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** The visitor's own zone, relative to the sheet's (Delhi). */
export function visitorZone(t: number) {
  const offset = -new Date(t).getTimezoneOffset();
  let place = "";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    place = tz.includes("/") ? tz.split("/").pop()!.replace(/_/g, " ") : tz;
  } catch {
    /* ignore */
  }
  const diff = offset - SHEET_OFFSET_MIN;
  const a = Math.abs(diff);
  const h = Math.floor(a / 60);
  const m = a % 60;
  const span = [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
  return {
    offset,
    place,
    same: diff === 0,
    relation: diff === 0 ? "" : `${span} ${diff < 0 ? "behind" : "ahead of"} Delhi`,
  };
}
