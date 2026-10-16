"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import gsap from "gsap";
import { prefersReducedMotion } from "@/lib/hooks";
import { lossText, signed, useHero, type Lock } from "./heroStore";
import type { HeroSim } from "./landscape";
import styles from "./Hero.module.css";

export type Projector = (x: number, z: number) => { x: number; y: number } | null;
export type OverlayHandle = { update: (project: Projector) => void };

/**
 * Map annotations that ride on the terrain: the लक्ष्य lake label at the global minimum,
 * spot heights at the false minima, and the lock-on reticle. Positions come from the
 * active renderer's projector; the WebGL scene calls update() on every drawn frame.
 */
export function TerrainOverlay({ sim, ref }: { sim: HeroSim; ref: Ref<OverlayHandle> }) {
  const targetRef = useRef<HTMLDivElement>(null);
  const spotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const spotValueRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const reticleRef = useRef<HTMLDivElement>(null);
  const bracketsRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const chipTextRef = useRef<HTMLSpanElement>(null);
  const project = useRef<Projector | null>(null);
  const swing = useRef({ p: 1, active: false, from: { x: 0, y: 0 } });
  const fieldVersion = useRef(-1);

  const placeReticle = () => {
    const el = reticleRef.current;
    const pr = project.current;
    if (!el || !pr) return;
    const t = pr(sim.target.x, sim.target.z);
    if (!t) return;
    const s = swing.current;
    let x = t.x;
    let y = t.y;
    if (s.p < 1) {
      // a quadratic arc from the start point over the terrain into the target
      const cx = (s.from.x + t.x) / 2;
      const cy = Math.min(s.from.y, t.y) - 120;
      const u = 1 - s.p;
      x = u * u * s.from.x + 2 * u * s.p * cx + s.p * s.p * t.x;
      y = u * u * s.from.y + 2 * u * s.p * cy + s.p * s.p * t.y;
    }
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };

  useImperativeHandle(ref, () => ({
    update(pr) {
      project.current = pr;
      const t = pr(sim.target.x, sim.target.z);
      const tEl = targetRef.current;
      if (tEl) {
        tEl.style.visibility = t ? "visible" : "hidden";
        if (t) tEl.style.transform = `translate3d(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px, 0)`;
      }
      const masks = useHero.getState().masks;
      const refresh = fieldVersion.current !== sim.field.version;
      fieldVersion.current = sim.field.version;
      sim.minima.forEach((m, i) => {
        const el = spotRefs.current[i];
        if (!el) return;
        const p = pr(m.x, m.z);
        // the dot plus its label run ~60px right of the point; keep the whole thing off the labels
        const hidden = !p || masks.some((r) => p.x - 8 < r.x1 + 8 && p.x + 60 > r.x0 - 8 && p.y - 9 < r.y1 + 8 && p.y + 9 > r.y0 - 8);
        el.style.visibility = hidden ? "hidden" : "visible";
        if (p) el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        const v = spotValueRefs.current[i];
        if (v && refresh) v.textContent = lossText(sim.field.height(m.x, m.z));
      });
      placeReticle();
    },
  }));

  // Lock-on: a marble reached the target, or someone typed his name (target:lock).
  useEffect(() => {
    let tl: gsap.core.Timeline | null = null;
    const play = (lock: NonNullable<Lock>) => {
      const el = reticleRef.current;
      const br = bracketsRef.current;
      const chip = chipRef.current;
      const txt = chipTextRef.current;
      if (!el || !br || !chip || !txt) return;
      tl?.kill();
      txt.textContent =
        lock.kind === "reached"
          ? `TARGET REACHED · LOSS ${lossText(lock.loss)}`
          : `TARGET LOCKED · E ${signed(lock.x)} N ${signed(-lock.z)}`;
      const reduce = prefersReducedMotion();
      const host = el.offsetParent as HTMLElement | null;
      const w = host?.clientWidth ?? window.innerWidth;
      const h = host?.clientHeight ?? window.innerHeight;
      swing.current.from = { x: w * 0.1, y: h * 0.3 };
      swing.current.p = lock.kind === "locked" && !reduce ? 0 : 1;
      placeReticle();
      const mark = targetRef.current;
      mark?.setAttribute("data-locked", "");
      tl = gsap.timeline({ defaults: { ease: "expo.out" }, onComplete: () => mark?.removeAttribute("data-locked") });
      tl.set(el, { autoAlpha: 1 });
      if (reduce) {
        tl.set(br, { scale: 1, rotation: 0, opacity: 1 }).set(chip, { clipPath: "inset(0 0% 0 0)" });
      } else if (lock.kind === "locked") {
        tl.fromTo(swing.current, { p: 0 }, { p: 1, duration: 1.4, onUpdate: placeReticle })
          .fromTo(br, { scale: 1.7, rotation: 180, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 1.4 }, 0)
          .fromTo(chip, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.7 }, 1.0);
      } else {
        tl.fromTo(br, { scale: 2.1, rotation: 45, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.9 })
          .fromTo(chip, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.7 }, 0.35);
      }
      tl.to(el, { autoAlpha: 0, duration: 0.6, ease: "expo.out" }, "+=4.6");
    };
    const unsub = useHero.subscribe((s, prev) => {
      if (s.lock && s.lock !== prev.lock) play(s.lock);
    });
    return () => {
      unsub();
      tl?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim]);

  return (
    <div className={styles.overlay} aria-hidden="true">
      <div ref={targetRef} className={styles.targetMark}>
        <svg width="18" height="18" viewBox="0 0 18 18" className={styles.targetRing}>
          <circle cx="9" cy="9" r="6.5" />
          <circle cx="9" cy="9" r="1.6" className={styles.targetDot} />
        </svg>
        <span className={styles.lake} lang="hi">
          लक्ष्य
        </span>
      </div>
      {sim.minima.map((m, i) => (
        <div
          key={`${m.x.toFixed(2)}:${m.z.toFixed(2)}`}
          ref={(el) => {
            spotRefs.current[i] = el;
          }}
          className={styles.spot}
        >
          <span className={styles.spotDot} />
          <span
            ref={(el) => {
              spotValueRefs.current[i] = el;
            }}
            className={styles.spotValue}
          >
            {lossText(m.h)}
          </span>
        </div>
      ))}
      <div ref={reticleRef} className={styles.reticle}>
        <div ref={bracketsRef} className={styles.brackets}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <path d="M4 18V4h14M46 4h14v14M60 46v14H46M18 60H4V46" />
            <path d="M32 22v6M32 36v6M22 32h6M36 32h6" className={styles.reticleCross} />
          </svg>
        </div>
        <div ref={chipRef} className={styles.chip}>
          <span className={styles.deva} lang="hi">
            लक्ष्य
          </span>
          <span aria-hidden="true"> · </span>
          <span ref={chipTextRef} />
        </div>
      </div>
    </div>
  );
}
