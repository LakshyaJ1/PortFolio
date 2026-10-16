"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  };
}

/** Live media-query match; `serverValue` is what SSR and the first client render assume. */
export function useMedia(query: string, serverValue = false) {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");
/** true for mouse/trackpad; false for touch-first devices */
export const useFinePointer = () => useMedia("(hover: hover) and (pointer: fine)");
export const useIsNarrow = () => useMedia("(max-width: 720px)");

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Whether the element is (or has been, with `once`) in the viewport. */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { rootMargin = "0px", once = false, threshold = 0 }: { rootMargin?: string; once?: boolean; threshold?: number } = {},
) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, once, threshold]);
  return inView;
}

/** Page visibility, so canvases and loops can sleep in background tabs. */
export function usePageVisible() {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    () => document.visibilityState === "visible",
    () => true,
  );
}

let can3D: boolean | undefined;

/** Probe WebGL once per page; the probe context is released straight away. */
function detect3D() {
  if (can3D !== undefined) return can3D;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const lowMemory = typeof memory === "number" && memory < 4;
    can3D = Boolean(gl) && !lowMemory;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    can3D = false;
  }
  return can3D;
}

const noSubscribe = () => () => {};

/** Rough capability check for WebGL-heavy scenes: null on the server and first paint, then true/false. */
export function useCanRender3D(): boolean | null {
  return useSyncExternalStore(noSubscribe, detect3D, () => null);
}

/** Latest-value ref for use inside rAF loops and stable callbacks. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
