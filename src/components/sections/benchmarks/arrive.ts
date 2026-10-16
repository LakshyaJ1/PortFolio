import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Reveal on arrival, shared by the legend, the log terrain and the benchmarks.
 *
 * Nothing is hidden until `trigger` reaches `start`; only then does `build` run, so its fromTo
 * tweens apply their starting state and play. Content therefore stays visible by default (no JS,
 * a section never reached, a full-page capture), and if the visitor runs past the end before the
 * reveal has finished (fast scroll, index travel) it lands on its final state at once.
 *
 * `safe` wraps `build` in the caller's GSAP context (useGSAP's contextSafe, or a matchMedia
 * context's `add`) so the lazily created timeline is reverted with that context.
 */
export function arrive({
  trigger,
  start,
  build,
  safe,
}: {
  trigger: Element;
  start: string;
  build: () => gsap.core.Timeline;
  safe: (fn: () => void) => () => void;
}) {
  let tl: gsap.core.Timeline | null = null;
  const run = safe(() => {
    tl = build();
  });
  return ScrollTrigger.create({
    trigger,
    start,
    end: "bottom top",
    onEnter: () => {
      if (!tl) run();
    },
    onLeave: (self) => {
      tl?.progress(1);
      self.kill();
    },
  });
}
