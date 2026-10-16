"use client";

import type Lenis from "lenis";

// The root Lenis instance, registered by <SmoothScroll>. Lenis itself only puts
// version metadata on window, so we keep our own reference.
let instance: Lenis | undefined;

export function registerLenis(lenis: Lenis | undefined) {
  instance = lenis;
}

export function getLenis() {
  return instance;
}

/**
 * Scroll to a section or element. Works while Lenis is stopped (force) and
 * falls back to native scrolling if Lenis isn't mounted or motion is reduced.
 */
export function scrollToTarget(target: string | HTMLElement | number, opts: { offset?: number; immediate?: boolean } = {}) {
  const el =
    typeof target === "string" ? document.querySelector<HTMLElement>(target.startsWith("#") ? target : `#${target}`) : target;
  if (el === null) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (instance) {
    instance.scrollTo(el, {
      // land sections just below the condensed nav plates (the hero sits flush)
      offset: opts.offset ?? (el instanceof HTMLElement && el.id === "top" ? 0 : -48),
      immediate: opts.immediate || reduce,
      force: true,
      duration: 1.4,
    });
    return;
  }
  if (typeof el === "number") window.scrollTo({ top: el, behavior: reduce ? "auto" : "smooth" });
  else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
