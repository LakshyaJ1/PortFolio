"use client";

import { useSyncExternalStore } from "react";
import { SECTIONS, type SectionId } from "@/lib/sections";
import { useApp } from "@/lib/store";

// Which sheet the visitor is reading, by position: the last section whose top has crossed
// the reading line (mid-viewport), and the last section once the page bottoms out.
// Section offsets are measured on resize only; scrolling just compares numbers, so this is
// cheap enough to run on every Lenis frame. It agrees with the rail's station positions, and
// unlike a thin intersection band it can't be skipped by a fast jump (End key, index travel)
// or stranded while the reading line sits in the collar.

let tops: (number | null)[] = [];
let current: SectionId | null = null;
const subs = new Set<() => void>();
let raf = 0;
let ro: ResizeObserver | null = null;

function update() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const y = window.scrollY;
  const line = y + window.innerHeight * 0.5;
  let id: SectionId | null = null;
  let last: SectionId | null = null;
  tops.forEach((top, i) => {
    if (top === null) return;
    last = SECTIONS[i].id;
    if (top <= line) id = SECTIONS[i].id;
  });
  if (max > 0 && y >= max - 2 && last) id = last;
  if (id !== current) {
    current = id;
    subs.forEach((cb) => cb());
  }
}

function measure() {
  raf = 0;
  const y = window.scrollY;
  tops = SECTIONS.map((s) => {
    const el = document.getElementById(s.id);
    return el ? el.getBoundingClientRect().top + y : null;
  });
  update();
}

function scheduleMeasure() {
  if (!raf) raf = requestAnimationFrame(measure);
}

function subscribe(cb: () => void) {
  subs.add(cb);
  if (subs.size === 1) {
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    ro = new ResizeObserver(scheduleMeasure);
    ro.observe(document.body);
    scheduleMeasure();
  }
  return () => {
    subs.delete(cb);
    if (subs.size) return;
    window.removeEventListener("scroll", update);
    window.removeEventListener("resize", scheduleMeasure);
    ro?.disconnect();
    ro = null;
    cancelAnimationFrame(raf);
    raf = 0;
  };
}

/** The section under the reading line; falls back to the app store until the sheet is measured. */
export function useReadingSection(): SectionId {
  const fromStore = useApp((s) => s.activeSection);
  const fromPosition = useSyncExternalStore<SectionId | null>(
    subscribe,
    () => current,
    () => null,
  );
  return fromPosition ?? fromStore;
}
