"use client";

import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PROFILE } from "@/content/profile";
import { Boundary } from "@/components/shell/Boundary";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { discover } from "@/lib/discover";
import { on } from "@/lib/events";
import { formatDMS } from "@/lib/geo";
import { prefersReducedMotion, useCanRender3D, useInView, usePageVisible, useReducedMotion } from "@/lib/hooks";
import { scrollToTarget } from "@/lib/scroll";
import { useApp } from "@/lib/store";
import { HeroBook } from "./HeroBook";
import { MeetLakshya } from "./MeetLakshya";
import { Hud } from "./Hud";
import { MiniTerminal } from "./MiniTerminal";
import { Roles } from "./Roles";
import { heroFocus, lossText, useHero } from "./heroStore";
import { BOUNDS, getHeroSim } from "./landscape";
import styles from "./Hero.module.css";

gsap.registerPlugin(useGSAP);

const Terrain3D = dynamic(() => import("./HeroTerrain3D"), { ssr: false });
const Terrain2D = dynamic(() => import("./HeroTerrain2D"), { ssr: false });

const WORDS = PROFILE.name.toUpperCase().split(" ");
const HOLD_MOUSE_MS = 240;
const HOLD_TOUCH_MS = 380;
const KEY_STEP = 0.12;

const clampX = (x: number) => Math.min(Math.max(x, BOUNDS.x0 + 0.05), BOUNDS.x1 - 0.05);
const clampZ = (z: number) => Math.min(Math.max(z, BOUNDS.z0 + 0.05), BOUNDS.z1 - 0.05);
const isUi = (t: EventTarget | null) => t instanceof Element && Boolean(t.closest("a, button, input, textarea, select, [data-no-terrain]"));

type Gesture = {
  pointers: Map<number, { x: number; y: number; sx: number; sy: number; touch: boolean }>;
  timer: number;
  mode: "idle" | "pending" | "holding";
  sign: 1 | -1;
  twoFinger: boolean;
  moved: boolean;
  clearFix: number;
};

const AVAILABILITY = "Open to internships, full-time roles and client projects";

/**
 * A1 · the sheet's first viewport. LAKSHYA JAIN lies across a loss landscape like a range
 * name; under it, what he can be hired as, what he builds, the actions (book a call, résumé,
 * projects) and a live terminal. The terrain stays playable: click to drop an optimizer marble
 * that rolls toward लक्ष्य (the target), hold to raise the ground.
 */
export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const nameLineRef = useRef<HTMLSpanElement>(null);
  const can3D = useCanRender3D();
  const reduced = useReducedMotion();
  const plain = useApp((s) => s.plain);
  const phase = useApp((s) => s.phase);
  const inView = useInView(sectionRef);
  const pageVisible = usePageVisible();
  const ready = useHero((s) => s.ready);
  const [glLost, setGlLost] = useState(false);
  const [announce, setAnnounce] = useState("");
  const mode = can3D === null ? null : can3D && !reduced && !plain && !glLost ? "3d" : "2d";

  // ── the bus: the living surface follows the rest of the page ──
  useEffect(() => {
    const offs = [
      on("agent:thinking", ({ on: thinking }) => useHero.getState().setThinking(thinking)),
      on("cache:found", () => useHero.getState().pulse()),
      on("target:lock", () => {
        const sim = getHeroSim();
        useHero.getState().lockOn({ kind: "locked", loss: sim.field.height(sim.target.x, sim.target.z), x: sim.target.x, z: sim.target.z });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // ── marbles report where they settle ──
  useEffect(() => {
    const sim = getHeroSim();
    return sim.on((e) => {
      if (e.type !== "settled") return;
      if (e.target) {
        useHero.getState().lockOn({ kind: "reached", loss: e.loss, x: sim.target.x, z: sim.target.z });
        discover("minimum");
        setAnnounce(`The marble found the lowest point, loss ${lossText(e.loss)}, after ${e.steps} steps.`);
      } else {
        setAnnounce(`The marble got stuck in a local dip, loss ${lossText(e.loss)}, after ${e.steps} steps. Try another spot.`);
      }
    });
  }, []);

  // ── knock-out rects: contours thin out under the labels, like a printed map ──
  const measure = useCallback(() => {
    const sec = sectionRef.current;
    if (!sec) return;
    const base = sec.getBoundingClientRect();
    const rects = Array.from(sec.querySelectorAll<HTMLElement>("[data-knockout]"))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x0: r.left - base.left, y0: r.top - base.top, x1: r.right - base.left, y1: r.bottom - base.top };
      })
      .filter((r) => r.x1 - r.x0 > 1 && r.y1 - r.y0 > 1);
    useHero.getState().setMasks(rects);
    // the field note points at the basin wherever the renderers framed it
    const f = heroFocus(base.width, base.height, rects);
    sec.style.setProperty("--fx", f.x.toFixed(3));
    sec.style.setProperty("--fy", f.y.toFixed(3));
  }, []);

  useEffect(() => {
    const sec = sectionRef.current;
    if (!sec) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(sec);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [measure]);

  // plain mode swaps the roles rotor for a list: the label rects move
  useEffect(() => {
    measure();
  }, [plain, reduced, measure]);

  // ── entrance, once, when the sheet is revealed ──
  const covered = useRef<boolean | null>(null);
  const ran = useRef(false);
  useEffect(() => {
    // the greeting covers the sheet on a first visit; repeat visits paint the hero at once
    covered.current = !document.documentElement.dataset.greeted;
  }, []);

  useGSAP(
    () => {
      if (phase !== "site" || ran.current) return;
      ran.current = true;
      const sec = sectionRef.current;
      if (!covered.current || prefersReducedMotion() || useApp.getState().plain) {
        if (sec) sec.dataset.entrance = covered.current ? "calm" : "painted";
        measure();
        return;
      }
      if (sec) sec.dataset.entrance = "playing";
      const line = nameLineRef.current;
      if (!line) return;
      const box = line.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      const tl = gsap.timeline({
        defaults: { ease: "expo.out" },
        onComplete: () => {
          if (sec) sec.dataset.entrance = "done";
          measure();
        },
      });
      tl.from(
        "[data-letter]",
        {
          x: (_: number, el: Element) => {
            const r = el.getBoundingClientRect();
            return (r.left + r.width / 2 - mid) * 1.3;
          },
          opacity: 0,
          filter: "blur(10px)",
          duration: 1.9,
          clearProps: "transform,opacity,filter",
        },
        0.2,
      )
        .from("[data-rise]", { y: 18, opacity: 0, duration: 1.1, stagger: 0.09, clearProps: "transform,opacity" }, 0.8)
        .from("[data-cta]", { y: 14, opacity: 0, duration: 1, stagger: 0.08, clearProps: "transform,opacity" }, 1.05)
        .from("[data-hud]", { opacity: 0, duration: 0.9, clearProps: "opacity" }, 1.15)
        .from("[data-note]", { opacity: 0, y: 8, rotate: -5, duration: 1, clearProps: "transform,opacity" }, 1.4)
        .from("[data-note-arrow]", { strokeDashoffset: 1, duration: 1.2 }, 1.55)
        .from("[data-note-head]", { opacity: 0, duration: 0.4 }, 2.3);
    },
    { scope: sectionRef, dependencies: [phase] },
  );

  // ── gestures: click drops a marble, hold raises, Shift+hold or two fingers sinks ──
  const g = useRef<Gesture>({ pointers: new Map(), timer: 0, mode: "idle", sign: 1, twoFinger: false, moved: false, clearFix: 0 });

  const centroid = () => {
    let x = 0;
    let y = 0;
    const ps = g.current.pointers;
    ps.forEach((p) => {
      x += p.x;
      y += p.y;
    });
    return { x: x / Math.max(ps.size, 1), y: y / Math.max(ps.size, 1) };
  };

  const dropAt = (cx: number, cy: number) => {
    const r = useHero.getState().renderer;
    const w = r?.pick(cx, cy);
    if (!r || !w) return;
    getHeroSim().drop(clampX(w.x), clampZ(w.z), prefersReducedMotion());
    r.wake();
  };

  /** The field note's click: a marble somewhere visible near the basin (it may or may not make it). */
  const dropSomewhere = () => {
    const r = useHero.getState().renderer;
    const sec = sectionRef.current;
    if (!r || !sec) return;
    const sim = getHeroSim();
    const masks = useHero.getState().masks;
    const w = sec.clientWidth;
    const h = sec.clientHeight;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 1 + Math.random() * 1.8;
      const x = clampX(sim.target.x + Math.cos(a) * d * 1.3);
      const z = clampZ(sim.target.z + Math.sin(a) * d * 0.8);
      const p = r.project(x, z);
      if (!p || p.x < 24 || p.x > w - 24 || p.y < 80 || p.y > h - 24) continue;
      if (masks.some((m) => p.x > m.x0 - 14 && p.x < m.x1 + 14 && p.y > m.y0 - 14 && p.y < m.y1 + 14)) continue;
      sim.drop(x, z, prefersReducedMotion());
      r.wake();
      return;
    }
    sim.drop(clampX(sim.target.x - 1.6), clampZ(sim.target.z - 0.9), prefersReducedMotion());
    r.wake();
  };

  const beginHold = () => {
    const st = g.current;
    if (st.mode !== "pending" || st.moved) return;
    const r = useHero.getState().renderer;
    if (!r?.deform) return; // the static map can't be reshaped; release still drops a marble
    const c = centroid();
    const w = r.pick(c.x, c.y);
    if (!w) return;
    getHeroSim().pressStart(w.x, w.z, st.sign);
    st.mode = "holding";
    r.wake();
  };

  const endHold = () => {
    const st = g.current;
    if (st.mode === "holding") {
      getHeroSim().pressEnd();
      useHero.getState().renderer?.wake();
    }
    window.clearTimeout(st.timer);
    st.mode = "idle";
    st.twoFinger = false;
  };

  const releaseTouchFix = () => {
    const st = g.current;
    window.clearTimeout(st.clearFix);
    st.clearFix = window.setTimeout(() => {
      if (g.current.pointers.size === 0) useHero.getState().setPointer({ mode: "none" });
    }, 1600);
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isUi(e.target)) return;
    const st = g.current;
    const touch = e.pointerType !== "mouse";
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, touch });
    if (!touch) e.currentTarget.setPointerCapture?.(e.pointerId);
    else {
      window.clearTimeout(st.clearFix);
      useHero.getState().setPointer({ mode: "screen", cx: e.clientX, cy: e.clientY, touch: true });
    }
    window.clearTimeout(st.timer);
    if (st.pointers.size === 2 && touch) {
      // two fingers held still: sink a basin between them
      st.mode = "pending";
      st.sign = -1;
      st.twoFinger = true;
      st.moved = false;
      st.timer = window.setTimeout(beginHold, HOLD_TOUCH_MS);
      return;
    }
    if (st.pointers.size > 2) {
      endHold();
      return;
    }
    st.mode = "pending";
    st.sign = e.shiftKey ? -1 : 1;
    st.twoFinger = false;
    st.moved = false;
    st.timer = window.setTimeout(beginHold, touch ? HOLD_TOUCH_MS : HOLD_MOUSE_MS);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const st = g.current;
    const p = st.pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > (p.touch ? 10 : 6)) st.moved = true;
    }
    const hero = useHero.getState();
    if (e.pointerType === "mouse") {
      if (st.mode !== "holding" && isUi(e.target)) {
        if (hero.pointer.mode !== "none") hero.setPointer({ mode: "none" });
      } else hero.setPointer({ mode: "screen", cx: e.clientX, cy: e.clientY, touch: false });
    } else if (p) hero.setPointer({ mode: "screen", cx: e.clientX, cy: e.clientY, touch: true });

    if (st.mode === "pending" && st.moved) {
      window.clearTimeout(st.timer);
      st.mode = "idle";
    } else if (st.mode === "holding") {
      const c = centroid();
      const w = hero.renderer?.pick(c.x, c.y);
      if (w) getHeroSim().pressMove(w.x, w.z);
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const st = g.current;
    const p = st.pointers.get(e.pointerId);
    st.pointers.delete(e.pointerId);
    if (p?.touch) releaseTouchFix();
    if (!p) return;
    if (st.mode === "holding") {
      if (st.pointers.size === 0) endHold();
      return;
    }
    if (st.mode === "pending") {
      window.clearTimeout(st.timer);
      st.mode = "idle";
      if (!st.moved && !st.twoFinger) dropAt(e.clientX, e.clientY);
    }
  };

  const onPointerCancel = (e: PointerEvent<HTMLElement>) => {
    const st = g.current;
    const p = st.pointers.get(e.pointerId);
    st.pointers.delete(e.pointerId);
    if (p?.touch) releaseTouchFix();
    if (st.pointers.size === 0) endHold();
  };

  const onPointerLeave = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && g.current.mode !== "holding") useHero.getState().setPointer({ mode: "none" });
  };

  useEffect(() => {
    const st = g.current;
    return () => {
      window.clearTimeout(st.timer);
      window.clearTimeout(st.clearFix);
    };
  }, []);

  // ── keyboard: the terrain is a focusable instrument ──
  const kb = useRef({ x: 0, z: 0, placed: false, holding: false });
  const keyFix = () => {
    const k = kb.current;
    useHero.getState().setPointer({ mode: "world", x: k.x, z: k.z });
  };
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.matches(":focus-visible")) return;
    const k = kb.current;
    if (!k.placed) {
      const sim = getHeroSim();
      k.x = clampX(sim.target.x - 1.6);
      k.z = clampZ(sim.target.z - 0.9);
      k.placed = true;
    }
    keyFix();
  };
  const onBlur = () => {
    if (kb.current.holding) {
      kb.current.holding = false;
      getHeroSim().pressEnd();
    }
    if (useHero.getState().pointer.mode === "world") useHero.getState().setPointer({ mode: "none" });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = kb.current;
    const r = useHero.getState().renderer;
    if (!r) return;
    const step = e.shiftKey ? KEY_STEP * 3.5 : KEY_STEP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      k.x = clampX(k.x + mv[0]);
      k.z = clampZ(k.z + mv[1]);
      k.placed = true;
      keyFix();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (e.repeat) return;
      getHeroSim().drop(k.x, k.z, prefersReducedMotion());
      r.wake();
      return;
    }
    const sign = e.key === "+" || e.key === "=" ? 1 : e.key === "-" || e.key === "_" ? -1 : 0;
    if (sign) {
      e.preventDefault();
      if (e.repeat || k.holding || !r.deform) return;
      k.holding = true;
      getHeroSim().pressStart(k.x, k.z, sign);
      r.wake();
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (["+", "=", "-", "_"].includes(e.key) && kb.current.holding) {
      kb.current.holding = false;
      getHeroSim().pressEnd();
      useHero.getState().renderer?.wake();
    }
  };

  return (
    <section
      ref={sectionRef}
      id="top"
      data-grid="A1"
      aria-labelledby="top-title"
      className={styles.hero}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => {
        if (g.current.pointers.size && !isUi(e.target)) e.preventDefault();
      }}
    >
      <div className={styles.terrain} data-ready={ready ? "true" : "false"} data-mode={mode ?? "pending"}>
        {mode === "3d" ? (
          <Boundary name="hero-terrain" fallback={<Terrain2D />}>
            <Terrain3D active={inView && pageVisible} onLost={() => setGlLost(true)} />
          </Boundary>
        ) : mode === "2d" ? (
          <Terrain2D />
        ) : null}
      </div>

      <div className={styles.content}>
        <div className={styles.range}>
          <h1 id="top-title" className={styles.name} data-guide="hero-name">
            <span className="visually-hidden">{PROFILE.name}</span>
            <span ref={nameLineRef} className={styles.nameLine} aria-hidden="true" data-knockout>
              {WORDS.map((word) => (
                <span key={word} className={styles.word}>
                  {Array.from(word).map((ch, i) => (
                    <span key={i} className={styles.letter} data-letter>
                      <span className={styles.glyph}>{ch}</span>
                    </span>
                  ))}
                </span>
              ))}
            </span>
          </h1>
          <div className={styles.coords} data-rise data-knockout data-no-terrain>
            <MeetLakshya />
            <span className={styles.where}>
              <Icon name="crosshair" size={13} />
              <span className="mono">{formatDMS(PROFILE.home)}</span>
              <span className={styles.place}>Delhi</span>
            </span>
          </div>
        </div>

        <div className={styles.lead}>
          <Roles live={phase === "site" && !reduced && !plain} still={plain} />
          <p className={styles.offer} data-rise data-knockout data-no-terrain>
            {PROFILE.offer}
          </p>
          <p className={styles.status} data-rise data-knockout data-no-terrain>
            <span className={styles.statusDot} aria-hidden="true" />
            {AVAILABILITY}
          </p>
          <div className={styles.ctas} data-knockout data-no-terrain>
            <span data-cta>
              <HeroBook />
            </span>
            <span data-cta>
              <Button variant="line" size="lg" icon="download" cta="resume" href={PROFILE.resumePath} download>
                Download résumé
              </Button>
            </span>
            <span data-cta>
              <Button variant="quiet" icon="arrow-down" cta="work" className={styles.projects} onClick={() => scrollToTarget("sites")}>
                View projects
              </Button>
            </span>
          </div>
        </div>

        <div className={styles.field}>
          <button type="button" className={styles.note} data-note data-knockout data-guide="hero-terrain" onClick={dropSomewhere}>
            <span className={styles.noteText}>
              <span className={styles.noteLead}>
                Drop a marble: <span className={styles.fine}>click</span>
                <span className={styles.coarse}>tap</span> the terrain
              </span>
              <span className={styles.noteSub} aria-hidden="true">
                <span className={styles.fine}>hold to raise a hill</span>
                <span className={styles.coarse}>press and hold to raise a hill</span>
              </span>
            </span>
            <svg className={styles.noteArrow} width="104" height="112" viewBox="0 0 104 112" fill="none" aria-hidden="true">
              <path data-note-arrow pathLength={1} d="M90 5c-9 13 6 30-13 46-15 12-38 14-50 31-5 7-8 13-11 22" />
              <path data-note-head d="M26.5 95.5 15.6 104.6 13 90.6" />
            </svg>
          </button>
          <div className={styles.dock}>
            <div className={styles.dockInner} data-knockout>
              <Hud />
            </div>
          </div>
        </div>

        <div className={styles.termSlot} data-rise data-knockout>
          <MiniTerminal mode={plain || reduced ? "still" : phase === "site" ? "play" : "wait"} />
        </div>
      </div>

      {/* after the content in tab order (actions first), beneath it in stacking */}
      <div
        className={styles.surface}
        tabIndex={0}
        role="application"
        aria-roledescription="terrain"
        aria-label="Loss landscape. Arrow keys move the marker, Enter drops a marble that rolls downhill by gradient descent, hold plus to raise the ground or minus to sink it."
        // pointer presses shape the ground; only the keyboard should move focus here
        onMouseDown={(e) => e.preventDefault()}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      />

      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
