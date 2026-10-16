"use client";

import { useEffect, useRef } from "react";
import { useFinePointer, useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import styles from "./Rendezvous.module.css";

const LINES = ["Bring a target.", "I’ll plot the route."];
const TEXT = LINES.join(" ");

/**
 * The invitation's headline. Letters rise like terrain under the pointer (or a tap), and the letter
 * nearest the fix turns survey-orange. Transform-only, so the line never reflows.
 */
export function ClosingLine() {
  const rootRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const plain = useApp((s) => s.plain);
  const fine = useFinePointer();
  const off = reduced || plain;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || off) return;
    const letters = Array.from(root.querySelectorAll<HTMLElement>("[data-ch]"));
    let centers: { x: number; y: number }[] = [];
    let radius = 60;
    const cur = new Float32Array(letters.length);
    const target = new Float32Array(letters.length);
    let raf = 0;
    let fixIndex = -1;
    let release = 0;

    const measure = () => {
      // offsets ignore transforms, so the rising letters never feed back into the measurement
      centers = letters.map((el) => ({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 }));
      radius = parseFloat(getComputedStyle(root).fontSize) * 0.9;
    };

    const tick = () => {
      let moving = false;
      for (let i = 0; i < letters.length; i++) {
        const next = cur[i] + (target[i] - cur[i]) * 0.16;
        if (Math.abs(next - cur[i]) > 0.0008) moving = true;
        cur[i] = Math.abs(next) < 0.0005 ? 0 : next;
        const k = cur[i];
        letters[i].style.transform = k ? `translateY(${(-k * 0.1).toFixed(4)}em) scaleY(${(1 + k * 0.24).toFixed(4)})` : "";
      }
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const aim = (clientX: number, clientY: number) => {
      if (!centers.length) measure();
      const box = root.getBoundingClientRect();
      const px = clientX - box.left;
      const py = clientY - box.top;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const dx = (centers[i].x - px) / radius;
        const dy = (centers[i].y - py) / (radius * 1.1);
        const d2 = dx * dx + dy * dy;
        target[i] = Math.exp(-d2 / 2);
        if (d2 < bestD) {
          bestD = d2;
          best = i;
        }
      }
      const nextFix = bestD < 1.2 ? best : -1;
      if (nextFix !== fixIndex) {
        if (fixIndex > -1) letters[fixIndex].removeAttribute("data-fix");
        if (nextFix > -1) letters[nextFix].setAttribute("data-fix", "");
        fixIndex = nextFix;
      }
      kick();
    };

    const settle = () => {
      target.fill(0);
      if (fixIndex > -1) letters[fixIndex].removeAttribute("data-fix");
      fixIndex = -1;
      kick();
    };

    const onMove = (e: PointerEvent) => {
      window.clearTimeout(release);
      aim(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      aim(e.clientX, e.clientY);
      if (e.pointerType !== "mouse") {
        window.clearTimeout(release);
        release = window.setTimeout(settle, 900);
      }
    };
    const onLeave = () => settle();

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    root.addEventListener("pointerenter", measure);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      ro.disconnect();
      root.removeEventListener("pointerenter", measure);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      window.clearTimeout(release);
      letters.forEach((el) => {
        el.style.transform = "";
        el.removeAttribute("data-fix");
      });
    };
  }, [off, fine]);

  let n = 0;
  return (
    <p className={styles.closing}>
      <span className="visually-hidden">{TEXT}</span>
      <span ref={rootRef} className={styles.closingLines} aria-hidden="true">
        {LINES.map((line) => (
          <span key={line} className={styles.closingLine}>
            {line.split(" ").map((word, wi, words) => (
              <span key={`${word}-${wi}`}>
                <span className={styles.word}>
                  {Array.from(word).map((c) => (
                    <span key={n++} className={styles.ch} data-ch>
                      {c}
                    </span>
                  ))}
                </span>
                {wi < words.length - 1 ? " " : null}
              </span>
            ))}
          </span>
        ))}
      </span>
    </p>
  );
}
