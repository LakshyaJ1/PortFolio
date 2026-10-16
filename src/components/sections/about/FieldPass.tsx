"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { useGSAP } from "@gsap/react";
import { Icon } from "@/components/ui/Icon";
import { useCanRender3D, useInView, usePageVisible, useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { PASS_COPY, STRAP_TEXT, buildPassArt, faceScale, type PassArt } from "./passArt";
import type { Face } from "./PassScene";
import styles from "./FieldPass.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin);

const PassScene = dynamic(() => import("./PassScene"), { ssr: false });

/** If the WebGL pass throws, the static card takes its place. */
class SceneBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn("[about] field pass fell back to the static card", error);
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The static pass: the same faces on a CSS card that turns over on click, Enter or Space.
 * The faces are drawn at the card's real pixel size, so the type is set crisply, not shrunk.
 */
function StaticPass({ art, face, onToggle }: { art: PassArt | null; face: Face; onToggle: () => void }) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => setScale(faceScale(el.clientHeight * Math.min(2, window.devicePixelRatio || 1)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!art || !scale) return;
    const faces = art.faces(scale);
    for (const [c, src] of [
      [frontRef.current, faces.front],
      [backRef.current, faces.back],
    ] as const) {
      if (!c) continue;
      c.width = src.width;
      c.height = src.height;
      c.getContext("2d")?.drawImage(src, 0, 0);
    }
    // reveal the faces only once they hold ink
    cardRef.current?.setAttribute("data-drawn", "");
  }, [art, scale]);

  return (
    <div className={styles.hang}>
      <span className={styles.strap} aria-hidden="true">
        <span className={styles.strapText}>{STRAP_TEXT.repeat(6)}</span>
      </span>
      <svg className={styles.hardware} viewBox="0 0 40 46" aria-hidden="true">
        <rect x="16" y="0" width="8" height="12" rx="2" />
        <ellipse cx="20" cy="22" rx="6.5" ry="9" />
        <rect x="6" y="33" width="28" height="11" rx="2.5" />
      </svg>
      <button
        ref={cardRef}
        type="button"
        className={styles.card}
        data-face={face}
        onClick={onToggle}
        aria-label={`Field pass, showing the ${face}. Turn it over.`}
      >
        <span className={styles.cardInner}>
          <canvas ref={frontRef} className={`${styles.face} ${styles.front}`} />
          <canvas ref={backRef} className={`${styles.face} ${styles.back}`} />
        </span>
      </button>
    </div>
  );
}

type Mode = "pending" | "3d" | "static";

export function FieldPass() {
  const can3D = useCanRender3D();
  const reduce = useReducedMotion();
  const plain = useApp((s) => s.plain);
  const [sceneFailed, setSceneFailed] = useState(false);
  const mode: Mode = can3D === null ? "pending" : can3D && !reduce && !plain && !sceneFailed ? "3d" : "static";

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { threshold: 0.18 });
  // the physics scene (rapier + three, ~2 MB) is only fetched once the visitor is within a screen of it
  const near = useInView(stageRef, { rootMargin: "900px 0px", once: true });
  const visible = usePageVisible();
  const [art, setArt] = useState<PassArt | null>(null);
  const [face, setFace] = useState<Face>("front");
  const [sceneReady, setSceneReady] = useState(false);

  const toggle = useCallback(() => setFace((f) => (f === "front" ? "back" : "front")), []);
  const onReady = useCallback(() => setSceneReady(true), []);
  const onFail = useCallback(() => setSceneFailed(true), []);

  // draw the faces once the site fonts are ready
  useEffect(() => {
    let alive = true;
    buildPassArt()
      .then((a) => alive && setArt(a))
      .catch((err) => console.warn("[about] could not draw the field pass", err));
    return () => {
      alive = false;
    };
  }, []);

  // Wide layout: the stage reaches up past the heading so the strap hangs from the sheet's edge rule.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const section = root?.closest("section");
    const edge = section?.firstElementChild as HTMLElement | null | undefined;
    if (!root || !section || !edge) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!wide.matches) {
          root.style.setProperty("--reach", "0px");
          return;
        }
        const e = edge.getBoundingClientRect();
        const r = root.getBoundingClientRect();
        root.style.setProperty("--reach", `${Math.max(0, Math.round(r.top - (e.top + e.height / 2)))}px`);
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(section);
    wide.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wide.removeEventListener("change", update);
    };
  }, []);

  // the margin note's arrow is drawn in once, after the pass has arrived
  useGSAP(
    () => {
      const path = noteRef.current?.querySelector<SVGPathElement>("[data-arrow]");
      const head = noteRef.current?.querySelector<SVGPathElement>("[data-head]");
      const text = noteRef.current?.querySelector<HTMLElement>("[data-note]");
      if (!path || !head || !text || reduce || plain || mode === "pending") return;
      const tl = gsap.timeline({
        delay: mode === "3d" ? 0.9 : 0.2,
        scrollTrigger: { trigger: stageRef.current, start: "top 55%", once: true },
      });
      tl.from(text, { clipPath: "inset(0 100% 0 0)", duration: 0.7, ease: "expo.out" })
        .from(path, { drawSVG: 0, duration: 0.8, ease: "expo.out" }, "-=0.35")
        .from(head, { drawSVG: 0, duration: 0.35, ease: "expo.out" }, "-=0.35");
    },
    { scope: noteRef, dependencies: [mode, reduce, plain], revertOnUpdate: true },
  );

  const active = mode === "3d" && inView && visible;
  const showNote = mode === "static" || (mode === "3d" && sceneReady);

  return (
    <div ref={rootRef} className={styles.pass} data-mode={mode}>
      <div className={styles.slot}>
        <div ref={stageRef} className={styles.stage} data-guide="about-pass">
          <span className={styles.rule} aria-hidden="true" />
          <span className={styles.nail} aria-hidden="true" />
          {mode === "3d" && art && near ? (
            <SceneBoundary onFail={onFail}>
              <PassScene art={art} face={face} active={active} onTap={toggle} onReady={onReady} onLost={onFail} />
            </SceneBoundary>
          ) : null}
          {mode === "static" ? <StaticPass art={art} face={face} onToggle={toggle} /> : null}
          <div ref={noteRef} className={styles.note} data-show={showNote ? "" : undefined} aria-hidden="true">
            <span data-note className={styles.noteText}>
              {mode === "3d" ? "grab the pass" : "turn it over"}
            </span>
            <svg className={styles.arrow} viewBox="0 0 132 92" fill="none">
              <path data-arrow d="M8 10c22-8 52-4 74 14 14 12 24 30 30 52" />
              <path data-head d="M99 66l13 12 6-17" />
            </svg>
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.turn} onClick={toggle}>
          <Icon name="refresh" size={15} />
          <span>{face === "front" ? "Show the back" : "Show the front"}</span>
        </button>
      </div>

      <div className="visually-hidden">
        <p>
          Field pass, front: {PASS_COPY.band}. {PASS_COPY.name}, {PASS_COPY.role}.{" "}
          {PASS_COPY.rows.map(([k, v]) => `${k} ${v}`).join(", ")}.
        </p>
        <p>
          Back: {PASS_COPY.backTitle}. {PASS_COPY.backLines.join(". ")}. {PASS_COPY.found}: {PASS_COPY.email}.
        </p>
      </div>
    </div>
  );
}
