"use client";

import { useEffect, useRef } from "react";
import { useFinePointer, usePageVisible, useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { useChrome } from "./chromeStore";
import styles from "./FixCursor.module.css";

/** What counts as a fix: anything you can act on. */
const FIX_TARGETS =
  'a[href], button:not([disabled]), [role="button"], [role="switch"], [role="tab"], input:not([type="hidden"]):not([disabled]), select, textarea, summary, label[for], [data-fix]';

const FIX_RADIUS = 11;
const BASE_SIGMA = 12;
const MAX_DRIFT = 48;

/**
 * Position fix. The crosshair is the dead-reckoned estimate: it lags the real (native)
 * pointer. The ellipse is its uncertainty: it grows with distance and time since the last
 * fix, stretches along the heading with speed, and collapses tight and orange when the
 * pointer sits on something actionable (a fix is acquired).
 * Desktop only; never hides the native cursor; off for touch, reduced motion, plain sheet
 * and when the visitor turns it off.
 */
export function FixCursor() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const plain = useApp((s) => s.plain);
  const wanted = useChrome((s) => s.cursor);
  const visible = usePageVisible();
  if (!fine || reduced || plain || !wanted) return null;
  return <Instrument running={visible} />;
}

function Instrument({ running }: { running: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const ellRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const ring = ringRef.current;
    const ell = ellRef.current;
    if (!root || !ring || !ell || !running) return;
    root.dataset.shown = "";
    root.dataset.fix = "";

    let px = 0;
    let py = 0; // true pointer
    let x = 0;
    let y = 0; // estimate
    let vx = 0;
    let vy = 0; // smoothed velocity, px/ms
    let lastMove = 0;
    let lastFrame = performance.now();
    let fixAt = performance.now();
    let travelled = 0;
    let rx = BASE_SIGMA;
    let ry = BASE_SIGMA;
    let rot = 0;
    let fixed = false;
    let shown = false;
    let raf = 0;

    const setShown = (on: boolean) => {
      if (shown === on) return;
      shown = on;
      root.dataset.shown = on ? "1" : "";
    };
    const setFixed = (on: boolean) => {
      if (fixed === on) return;
      fixed = on;
      root.dataset.fix = on ? "1" : "";
      if (!on) {
        fixAt = performance.now();
        travelled = 0;
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(64, now - lastFrame);
      lastFrame = now;
      const idle = now - lastMove;
      if (idle > 40) {
        const k = Math.exp(-dt / 90);
        vx *= k;
        vy *= k;
      }
      const speed = Math.hypot(vx, vy);

      // the estimate trails the pointer; a fix tightens the tracking
      const follow = 1 - Math.exp(-dt / (fixed ? 34 : 80));
      x += (px - x) * follow;
      y += (py - y) * follow;

      // dead reckoning: error accrues with distance and with time since the last fix
      let tx: number;
      let ty: number;
      if (fixed) {
        fixAt = now;
        travelled = 0;
        tx = ty = FIX_RADIUS;
      } else {
        const secs = (now - fixAt) / 1000;
        const sigma = BASE_SIGMA + Math.min(MAX_DRIFT, 0.75 * Math.sqrt(travelled) + Math.min(16, secs * 0.8));
        tx = sigma * (1 + Math.min(0.9, speed * 0.42));
        ty = sigma * (1 - Math.min(0.32, speed * 0.16));
      }
      if (speed > 0.06) {
        const heading = (Math.atan2(vy, vx) * 180) / Math.PI;
        let d = heading - rot;
        d = ((((d + 180) % 360) + 360) % 360) - 180;
        rot += d * (1 - Math.exp(-dt / 70));
      }
      const ease = 1 - Math.exp(-dt / (fixed ? 55 : 150));
      rx += (tx - rx) * ease;
      ry += (ty - ry) * ease;

      ring.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      ell.setAttribute(
        "transform",
        `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${rx.toFixed(2)} ${ry.toFixed(2)})`,
      );

      // sleep once everything has settled and the drift has nowhere left to grow
      const settled =
        idle > 400 &&
        Math.abs(px - x) < 0.1 &&
        Math.abs(py - y) < 0.1 &&
        Math.abs(tx - rx) < 0.05 &&
        Math.abs(ty - ry) < 0.05 &&
        (fixed || now - fixAt > 21000);
      if (!settled) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf) return;
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const t = performance.now();
      if (!shown) {
        x = px = e.clientX;
        y = py = e.clientY;
        lastMove = t;
        setShown(true);
      }
      const dt = Math.max(4, t - lastMove);
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      const blend = Math.min(1, dt / 40);
      vx += (dx / dt - vx) * blend;
      vy += (dy / dt - vy) * blend;
      travelled += Math.hypot(dx, dy);
      px = e.clientX;
      py = e.clientY;
      lastMove = t;
      wake();
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = e.target instanceof Element ? e.target.closest(FIX_TARGETS) : null;
      setFixed(Boolean(el));
      wake();
    };

    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) setShown(false);
    };
    const onBlur = () => setShown(false);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    window.addEventListener("blur", onBlur);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onBlur);
    };
  }, [running]);

  return (
    <div ref={rootRef} className={styles.root} aria-hidden="true">
      <svg className={styles.field} width="100%" height="100%">
        <g ref={ellRef} transform="translate(-200 -200) scale(12 12)">
          <ellipse className={styles.ellipse} cx="0" cy="0" rx="1" ry="1" />
          <path className={styles.axis} d="M-1 0H-0.6M0.6 0H1" />
        </g>
      </svg>
      <div ref={ringRef} className={styles.ring}>
        <svg viewBox="-16 -16 32 32" width="32" height="32">
          <circle className={styles.ringCircle} r="5.5" />
          <path className={styles.ticks} d="M0 -14V-8.5M0 8.5V14M-14 0H-8.5M8.5 0H14" />
        </svg>
      </div>
    </div>
  );
}
