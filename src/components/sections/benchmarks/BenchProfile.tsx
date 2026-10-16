"use client";

import { useRef, type CSSProperties } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ACHIEVEMENTS } from "@/content/profile";
import { useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { POST_INSET, bandY, horizontalGround, horizontalPath, parseFigure } from "./profile";
import { arrive } from "./arrive";
import styles from "./Benchmarks.module.css";

gsap.registerPlugin(useGSAP);

/**
 * Each achievement as one big figure (or word) and two short lines. Reworded from ACHIEVEMENTS,
 * nothing added; an id missing here falls back to the résumé title and detail.
 */
const SHORT: Record<string, { big?: string; name: string; note: string }> = {
  amazon: { name: "Amazon ML Challenge", note: "Global leaderboard" },
  quiz: { big: "Winner", name: "Computer Science Quiz", note: "MeitY’s Digital India session" },
  microsoft: { name: "Led a 10-member team", note: "Drone workshop, Microsoft Gurgaon" },
  mentor: { name: "Students mentored", note: "Maker’s Asylum, 3 cohorts" },
  marathon: { name: "Half marathon finisher", note: "Vedanta Delhi, 2024" },
  clubs: { big: "Creativity", name: "Photography, fashion, finance", note: "WHATACLICK · Keyara · Finversion" },
};

const N = ACHIEVEMENTS.length;
const ITEMS = ACHIEVEMENTS.map((a, i) => {
  const short = SHORT[a.id];
  return {
    id: a.id,
    figure: a.figure,
    figureParts: parseFigure(a.figure),
    big: short?.big ?? a.title,
    name: short?.name ?? a.title,
    note: short?.note ?? a.detail,
    /** the full résumé wording, for screen readers */
    full: `${a.title}: ${a.detail}`,
    y: bandY((i + POST_INSET) / N), // where the post stands on the profile
  };
});
const H_PATH = horizontalPath();
const H_GROUND = horizontalGround();

/** Ordnance-style benchmark: a cut bar above a broad arrow, where each post meets the ground. */
function BenchMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.5 5h15M12 7.5v13M12 7.5 5.5 20.5M12 7.5l6.5 13" />
    </svg>
  );
}

const fmt = (v: number, grouped: boolean) => (grouped ? Math.round(v).toLocaleString("en-IN") : String(Math.round(v)));

export function BenchProfile() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const plain = useApp((s) => s.plain);

  useGSAP(
    () => {
      if (reduced || plain) return;
      const mm = gsap.matchMedia();

      /** Count a figure from its start to its résumé value, landing exactly on it. */
      const countUp = (el: HTMLElement, tl: gsap.core.Timeline, at: number) => {
        const from = Number(el.dataset.from);
        const to = Number(el.dataset.to);
        const grouped = el.dataset.grouped === "1";
        const o = { v: from };
        el.textContent = fmt(from, grouped);
        tl.to(
          o,
          {
            v: to,
            duration: 1.2,
            ease: "power3.out",
            onUpdate: () => (el.textContent = fmt(o.v, grouped)),
            onComplete: () => (el.textContent = fmt(to, grouped)),
          },
          at,
        );
      };

      // Wide sheets: the surveyor walks the profile left to right and each post is driven in as the
      // line reaches it, its figure counting up to the résumé value. Hidden only from arrival.
      mm.add("(min-width: 1024px)", (ctx) => {
        const root = rootRef.current;
        if (!root) return;
        arrive({
          trigger: root,
          start: "top 85%",
          safe: (fn) => ctx.add("revealProfile", fn) as () => void,
          build: () => {
            const line = root.querySelector("[data-profile]");
            const ground = root.querySelector("[data-ground]");
            const posts = gsap.utils.toArray<HTMLElement>("[data-post]", root);
            const TRAVERSE = 1;
            const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
            if (line) tl.fromTo(line, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: TRAVERSE, ease: "none", clearProps: "clipPath" }, 0);
            if (ground) tl.fromTo(ground, { opacity: 0 }, { opacity: 1, duration: 0.8, clearProps: "opacity" }, 0.15);
            posts.forEach((post, i) => {
              const at = (TRAVERSE * (i + POST_INSET)) / N;
              const stem = post.querySelector("[data-stem]");
              const label = post.querySelector("[data-label]");
              if (stem) tl.fromTo(stem, { scaleY: 0 }, { scaleY: 1, duration: 0.5, clearProps: "transform" }, at);
              if (label) tl.fromTo(label, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6, clearProps: "opacity,transform" }, at + 0.04);
              const num = post.querySelector<HTMLElement>("[data-count]");
              if (num) countUp(num, tl, at + 0.04);
            });
            return tl;
          },
        });
      });

      // Tablets and phones: the grid settles in reading order, figures counting as they land.
      mm.add("(max-width: 1023.98px)", (ctx) => {
        const root = rootRef.current;
        if (!root) return;
        arrive({
          trigger: root,
          start: "top 88%",
          safe: (fn) => ctx.add("revealGrid", fn) as () => void,
          build: () => {
            const posts = gsap.utils.toArray<HTMLElement>("[data-post]", root);
            const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
            posts.forEach((post, i) => {
              const at = i * 0.08;
              tl.fromTo(post, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, clearProps: "opacity,transform" }, at);
              const num = post.querySelector<HTMLElement>("[data-count]");
              if (num) countUp(num, tl, at);
            });
            return tl;
          },
        });
      });

      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [reduced, plain] },
  );

  return (
    <div ref={rootRef} className={styles.profile} data-guide="benchmarks">
      <ol className={styles.posts}>
        {ITEMS.map((a) => {
          const f = a.figureParts;
          return (
            <li key={a.id} className={styles.post} data-post style={{ "--y": a.y.toFixed(4) } as CSSProperties}>
              <span className={styles.stem} data-stem aria-hidden="true" />
              <span className={styles.foot} aria-hidden="true">
                <BenchMark />
              </span>
              <div className={styles.label} data-label>
                <p className={styles.figure} data-word={f ? undefined : ""} aria-hidden="true">
                  {f ? (
                    <>
                      {f.prefix ? <span className={styles.affix}>{f.prefix}</span> : null}
                      <span className={styles.num} data-count data-from={f.from} data-to={f.value} data-grouped={f.grouped ? "1" : "0"}>
                        {fmt(f.value, f.grouped)}
                      </span>
                      {f.suffix ? <span className={styles.affix}>{f.suffix}</span> : null}
                    </>
                  ) : (
                    a.big
                  )}
                </p>
                <h3 className={styles.name}>
                  <span aria-hidden="true">{a.name}</span>
                  <span className="visually-hidden">
                    {a.figure ? `${a.figure}. ` : ""}
                    {a.full}
                  </span>
                </h3>
                <p className={styles.note} aria-hidden="true">
                  {a.note}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* wide sheets: one continuous profile under all posts */}
      <div className={styles.hband} aria-hidden="true">
        <span className={styles.hground} data-ground style={{ clipPath: H_GROUND }} />
        <svg className={styles.hline} viewBox="0 0 1000 100" preserveAspectRatio="none" data-profile>
          <path d={H_PATH} />
        </svg>
      </div>
    </div>
  );
}
