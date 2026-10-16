"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReactLenis, useLenis, type LenisRef } from "lenis/react";
import { registerLenis } from "@/lib/scroll";
import { useApp } from "@/lib/store";

gsap.registerPlugin(ScrollTrigger);

function ScrollTriggerSync() {
  const lenis = useLenis(ScrollTrigger.update);
  useEffect(() => {
    registerLenis(lenis);
    return () => registerLenis(undefined);
  }, [lenis]);
  return null;
}

/** Stops Lenis (and native scroll) while the intro runs or any overlay is open. */
function ScrollLock() {
  const lenis = useLenis();
  const phase = useApp((s) => s.phase);
  const overlay = useApp((s) => s.overlay);
  const locked = phase !== "site" || overlay !== null;

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("is-locked", locked);
    if (!lenis) return;
    if (locked) lenis.stop();
    else lenis.start();
  }, [lenis, locked]);

  return null;
}

export function SmoothScroll({ children }: { children: ReactNode }) {
  const ref = useRef<LenisRef>(null);

  useEffect(() => {
    const tick = (time: number) => ref.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => gsap.ticker.remove(tick);
  }, []);

  // Sections that settle late (fonts, lazy demos, the GitHub log, the Cal embed) change the
  // page height; keep every ScrollTrigger's start/end in step with one debounced refresh.
  useEffect(() => {
    let timer = 0;
    let lastHeight = document.body.scrollHeight;
    const ro = new ResizeObserver(() => {
      const h = document.body.scrollHeight;
      if (Math.abs(h - lastHeight) < 2) return;
      lastHeight = h;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => ScrollTrigger.refresh(), 180);
    });
    ro.observe(document.body);
    void document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  return (
    <ReactLenis
      root
      ref={ref}
      options={{ autoRaf: false, lerp: 0.085, smoothWheel: true, anchors: { offset: -48 }, wheelMultiplier: 0.95 }}
    >
      <ScrollTriggerSync />
      <ScrollLock />
      {children}
    </ReactLenis>
  );
}
