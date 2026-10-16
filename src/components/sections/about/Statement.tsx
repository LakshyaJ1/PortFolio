"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import styles from "./About.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

// First person, résumé facts only (Hive Pro, Scrini AI, SETU, A.T.O.M, IIT Delhi, Maker's Asylum).
const STATEMENT =
  "I build production agent platforms that keep a human in the loop: approval workflows, guardrails, and Claude with LangGraph doing the work underneath. I’ve made retrieval answer in under 50 ms across 10K+ profiles, and fit a 207 KB model inside a phone so it keeps navigating when GPS drops out. Before that came Mars-rover autonomy, XR training for industry, and mentoring 250+ students in robotics and computer vision.";

/** The statement inks in word by word as it scrolls past, like a plotter pen tracing the sheet. */
export function Statement() {
  const ref = useRef<HTMLSpanElement>(null);
  const plain = useApp((s) => s.plain);
  const reduce = useReducedMotion();

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || plain || reduce) return;
      const cs = getComputedStyle(document.documentElement);
      // starts at z7 (4.5:1 on the ground) so a visitor who stops mid-paragraph can still read it
      const pencil = cs.getPropertyValue("--z7").trim() || "#6f7f75";
      const ink = cs.getPropertyValue("--z10").trim() || "#eef2ec";
      // aria "none": the visible copy is presentational; screen readers get the plain sentence below
      const split = SplitText.create(el, { type: "words", tag: "span", wordsClass: styles.word, aria: "none" });
      gsap.fromTo(
        split.words,
        { color: pencil },
        {
          color: ink,
          ease: "none",
          duration: 1,
          stagger: 0.4,
          scrollTrigger: { trigger: el, start: "top 82%", end: "bottom 45%", scrub: 0.6 },
        },
      );
      return () => split.revert();
    },
    { scope: ref, dependencies: [plain, reduce], revertOnUpdate: true },
  );

  return (
    <p className={styles.statement}>
      <span className="visually-hidden">{STATEMENT}</span>
      <span ref={ref} aria-hidden="true">
        {STATEMENT}
      </span>
    </p>
  );
}
