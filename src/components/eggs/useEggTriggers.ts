"use client";

// Global listeners for the keyboard eggs and the marathon. Mounted once by <Overlays/>.

import { useEffect } from "react";
import { discover } from "@/lib/discover";
import { emit } from "@/lib/events";
import { useApp } from "@/lib/store";
import { isTypingTarget } from "./shared";

const KONAMI = "arrowup arrowup arrowdown arrowdown arrowleft arrowright arrowleft arrowright b a";
const NAME = "lakshya";

/** Lock onto the target: the moment itself listens for `target:lock`. */
export function lockTarget() {
  emit("target:lock", {});
  discover("target-lock");
}

export function useEggKeys() {
  useEffect(() => {
    const recent: string[] = [];
    let typed = "";

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e)) return;
      const app = useApp.getState();
      if (app.phase !== "site") return;

      // Field terminal: the key left of 1.
      const isTick = e.key === "`" || e.key === "~" || (e.key === "Dead" && e.code === "Backquote");
      if (isTick) {
        if (app.overlay === "terminal") {
          e.preventDefault();
          app.closeOverlay();
        } else if (app.overlay === null || app.overlay === "logbook") {
          e.preventDefault();
          app.openOverlay("terminal");
          discover("terminal");
        }
        return;
      }

      // Games and the agent own the keyboard while open.
      if (app.overlay === "game" || app.overlay === "agent") {
        recent.length = 0;
        typed = "";
        return;
      }

      const key = e.key.toLowerCase();
      recent.push(key);
      if (recent.length > 10) recent.shift();
      if (recent.join(" ") === KONAMI) {
        recent.length = 0;
        discover("konami");
        app.startGame("rover");
        return;
      }

      if (e.key.length === 1 && /[a-z]/i.test(e.key)) {
        typed = (typed + key).slice(-NAME.length);
        if (typed === NAME) {
          typed = "";
          lockTarget();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const TOP = 48;
const BOTTOM = 64;
const LIMIT_MS = 25_000;
// A scroll only counts toward the run while the visitor is actively driving it
// (wheel, touch, keys, scrollbar drag) — programmatic jumps to #rendezvous don't.
const INPUT_WINDOW_MS = 1100;
const SCROLL_KEYS = new Set(["ArrowDown", "PageDown", " ", "Spacebar"]);

/** Half marathon: run the sheet top to bottom in under 25 s. */
export function useMarathon() {
  useEffect(() => {
    let lastInput = 0;
    let pointerDown = false;
    let lastY = window.scrollY;
    let atTop = lastY <= TOP;
    let runStart: number | null = null;
    let driven = 0;

    const mark = () => {
      lastInput = performance.now();
    };
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key) && !isTypingTarget(e)) mark();
    };
    const onPointerDown = () => {
      pointerDown = true;
      mark();
    };
    const onPointerUp = () => {
      pointerDown = false;
    };

    const onScroll = () => {
      const app = useApp.getState();
      const y = window.scrollY;
      const now = performance.now();
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (app.phase !== "site" || app.overlay !== null || max < window.innerHeight * 3) {
        lastY = y;
        return;
      }
      if (pointerDown) mark();

      if (y <= TOP) {
        atTop = true;
        runStart = null;
        driven = 0;
      } else if (atTop) {
        atTop = false;
        runStart = now;
        driven = 0;
      }

      if (runStart !== null) {
        const delta = y - lastY;
        if (delta > 0 && now - lastInput < INPUT_WINDOW_MS) driven += delta;
        const elapsed = now - runStart;
        if (elapsed > LIMIT_MS) {
          runStart = null;
        } else if (y >= max - BOTTOM) {
          if (driven >= max * 0.8) {
            const first = discover("marathon");
            app.toast({
              tone: "info",
              title: "15 km pace",
              body: `Top to bottom in ${(elapsed / 1000).toFixed(1)} s.${first ? "" : " Still got it."}`,
            });
          }
          runStart = null;
        }
      }
      lastY = y;
    };

    // Lenis drives the window's scroll position, so native scroll events still fire.
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("touchmove", mark, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchmove", mark);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);
}
