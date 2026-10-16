"use client";

import { useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { SmoothScroll } from "@/components/providers/SmoothScroll";
import { emit } from "@/lib/events";
import { SECTIONS, type SectionId } from "@/lib/sections";
import { useApp } from "@/lib/store";
import { Greeting } from "@/components/intro/Greeting";
import { Boundary } from "./Boundary";
import { Toasts } from "./Toasts";

// The greeting is server-rendered so its first frame paints before any JS.
// Everything else is client-only and loaded after the first paint.
const Intro = dynamic(() => import("@/components/intro/Intro").then((m) => m.Intro), {
  ssr: false,
  // hold the ground colour while the stage chunk arrives, so the sheet never flashes between greeting and intro
  loading: () => (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: "var(--layer-intro)", background: "var(--z1)" }} />
  ),
});
const Chrome = dynamic(() => import("@/components/chrome/Chrome").then((m) => m.Chrome), { ssr: false });
const Mascot = dynamic(() => import("@/components/mascot/Mascot").then((m) => m.Mascot), { ssr: false });
const Overlays = dynamic(() => import("@/components/eggs/Overlays").then((m) => m.Overlays), { ssr: false });

const GREETED_KEY = "lj-greeted";

function readGreeted() {
  try {
    return window.sessionStorage.getItem(GREETED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Decide where the visit starts: first visit this session plays the greeting, later ones go straight to the sheet. */
function usePhaseBoot() {
  const setPhase = useApp((s) => s.setPhase);
  const phase = useApp((s) => s.phase);

  useEffect(() => {
    void useApp.persist.rehydrate();
    const url = new URL(window.location.href);
    const forceIntro = url.searchParams.has("intro");
    // ?skipintro jumps straight to the sheet (used by QA and by "skip" links shared around)
    if (url.searchParams.has("skipintro") || (readGreeted() && !forceIntro)) setPhase("site");
  }, [setPhase]);

  useEffect(() => {
    if (phase !== "site") return;
    try {
      window.sessionStorage.setItem(GREETED_KEY, "1");
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.greeted = "1";
  }, [phase]);
}

/**
 * Track which sheet section is under the reading line (mid-viewport).
 * Positional rather than IntersectionObserver-based, so fast Lenis jumps
 * (End key, index travel) and the collar at the page bottom still resolve.
 */
function useActiveSection() {
  const setActive = useApp((s) => s.setActiveSection);
  useEffect(() => {
    let entries: { id: SectionId; top: number }[] = [];
    let raf = 0;
    const update = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const line = y + window.innerHeight * 0.5;
      let id: SectionId | undefined;
      for (const e of entries) if (e.top <= line) id = e.id;
      if (max > 0 && y >= max - 2) id = entries[entries.length - 1]?.id;
      if (id && useApp.getState().activeSection !== id) {
        setActive(id);
        emit("section:enter", { id });
      }
    };
    const measure = () => {
      raf = 0;
      const y = window.scrollY;
      entries = SECTIONS.flatMap((s) => {
        const el = document.getElementById(s.id);
        return el ? [{ id: s.id, top: el.getBoundingClientRect().top + y }] : [];
      });
      update();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", schedule);
    };
  }, [setActive]);
}

/** If the intro can't render, never trap the visitor behind it. */
function IntroFailed() {
  const setPhase = useApp((s) => s.setPhase);
  useEffect(() => setPhase("site"), [setPhase]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  usePhaseBoot();
  useActiveSection();
  const phase = useApp((s) => s.phase);

  return (
    <SmoothScroll>
      {phase === "greeting" ? (
        <Boundary name="greeting">
          <Greeting />
        </Boundary>
      ) : null}
      {phase === "intro" ? (
        <Boundary name="intro" fallback={<IntroFailed />}>
          <Intro />
        </Boundary>
      ) : null}
      <Boundary name="chrome">
        <Chrome />
      </Boundary>
      {children}
      <Boundary name="mascot">
        <Mascot />
      </Boundary>
      <Boundary name="overlays">
        <Overlays />
      </Boundary>
      <Toasts />
    </SmoothScroll>
  );
}
