"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { PROFILE } from "@/content/profile";
import { useInView, usePageVisible } from "@/lib/hooks";
import styles from "./Roles.module.css";

const ROLES = PROFILE.roles;
/** seconds a role rests (its tick fills) before the next one morphs in */
const HOLD = 2.3;
const MORPH = 0.95;
/** full rounds, then the line rests on the first role until the hero is revisited */
const ROUNDS = 3;

const clearMotion = (el: HTMLElement | null) => {
  if (!el) return;
  for (const p of ["--m", "opacity", "visibility", "transform", "translate", "rotate", "scale"]) el.style.removeProperty(p);
};

/**
 * What he can be hired as, under the range name. Each role arrives wide and settles to its
 * own width on Archivo's width axis; a long role is fitted to the line, never wrapped. The
 * ticks beneath say there are more. Screen readers get the plain list once; reduced motion and
 * the plain sheet show that list instead of the rotor.
 */
export function Roles({ live, still }: { live: boolean; still: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const inView = useInView(rootRef);
  const visible = usePageVisible();
  const [held, setHeld] = useState(false);
  const step = useRef({ i: 0, round: 0 });
  const cur = useRef<gsap.core.Timeline | null>(null);
  const running = live && inView && visible && !held;

  // fit: each role's width at 100% against the room it has, as its own font-stretch
  useEffect(() => {
    const line = lineRef.current;
    const probe = probeRef.current;
    if (!line || !probe) return;
    const fit = () => {
      const room = line.clientWidth;
      if (!room) return;
      ROLES.forEach((role, i) => {
        probe.textContent = role;
        const natural = probe.getBoundingClientRect().width;
        const w = natural > room ? Math.max(62, Math.floor((100 * room) / natural)) : 100;
        words.current[i]?.style.setProperty("--fit", String(w));
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(line);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, []);

  // a revisit (scrolled away and back) earns a fresh set of rounds
  useEffect(() => {
    if (!inView) step.current.round = 0;
  }, [inView]);

  // the rotor: one small timeline per step, so pausing never loses the place
  useEffect(() => {
    if (!running) {
      cur.current?.pause();
      return;
    }
    if (cur.current && cur.current.progress() < 1) {
      cur.current.resume();
      return;
    }
    const n = ROLES.length;
    const next = () => {
      const s = step.current;
      if (s.round >= ROUNDS) return;
      const i = s.i;
      const j = (i + 1) % n;
      const out = words.current[i];
      const inn = words.current[j];
      const fill = fills.current[i];
      cur.current = gsap
        .timeline({
          onComplete: () => {
            s.i = j;
            if (j === 0) s.round++;
            next();
          },
        })
        .fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: HOLD, ease: "none" })
        .set(fill, { scaleX: 0 })
        .fromTo(out, { "--m": 1, autoAlpha: 1, yPercent: 0 }, { "--m": 0.62, autoAlpha: 0, yPercent: -32, duration: MORPH * 0.7, ease: "expo.out" })
        .fromTo(inn, { "--m": 1.32, autoAlpha: 0, yPercent: 32 }, { "--m": 1, autoAlpha: 1, yPercent: 0, duration: MORPH, ease: "expo.out" }, "<0.06");
    };
    next();
  }, [running]);

  // leaving live mode (plain, reduced motion, unmount): back to the first role, no inline motion
  useEffect(() => {
    if (live) return;
    cur.current?.kill();
    cur.current = null;
    step.current = { i: 0, round: 0 };
    words.current.forEach(clearMotion);
    fills.current.forEach(clearMotion);
  }, [live]);

  useEffect(
    () => () => {
      cur.current?.kill();
    },
    [],
  );

  return (
    <div ref={rootRef} className={styles.roles} data-still={still ? "" : undefined} data-guide="hero-roles" data-rise data-knockout data-no-terrain>
      <ul className={styles.list} aria-label="Roles">
        {ROLES.map((role) => (
          <li key={role} className={styles.item}>
            {role}
          </li>
        ))}
      </ul>
      <div className={styles.rotor} aria-hidden="true" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}>
        <span ref={lineRef} className={styles.line}>
          {ROLES.map((role, i) => (
            <span
              key={role}
              ref={(el) => {
                words.current[i] = el;
              }}
              className={styles.word}
            >
              {role}
            </span>
          ))}
          <span ref={probeRef} className={styles.probe} />
        </span>
        <span className={styles.ticks}>
          {ROLES.map((role, i) => (
            <span key={role} className={styles.tick}>
              <span
                ref={(el) => {
                  fills.current[i] = el;
                }}
                className={styles.fill}
              />
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
