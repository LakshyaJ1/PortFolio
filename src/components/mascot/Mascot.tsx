"use client";

// Bindu (बिंदु, "point"): the site's floating guide. She hovers on empty ground at the side of
// the screen, flies to whatever she is talking about (a `data-guide` anchor, docs/GUIDE.md) and
// settles BESIDE it, never on it, with one short line at a time. She walks the visitor through
// the intro and the landing view, says one helpful thing per section, now and then coaches an
// unfound Easter egg, and answers on demand (`guide:nudge`, `say()`). Clicking her opens
// "Ask Bindu". "Quiet, Bindu" mutes the tour for the session; reduced motion fades instead of
// flying; the plain sheet keeps her still and silent unless asked; phones get a smaller Bindu,
// a docked bubble and fewer moves. She still dozes when left alone and objects to being poked.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { discover } from "@/lib/discover";
import { on } from "@/lib/events";
import { useFinePointer, useIsNarrow, useLatest, useReducedMotion } from "@/lib/hooks";
import type { SectionId } from "@/lib/sections";
import { useApp, type MascotMood } from "@/lib/store";
import { Drawer } from "./agent/Drawer";
import { Callout, CalloutMeasure, type Line } from "./Callout";
import { besideTarget, restSpot, type Bubble, type Dock, type Pt, type Scene, type Side } from "./flight";
import { collectCandidates, inflate, obstaclesIn, occupant, type Box, type Candidate } from "./ground";
import { MascotFigure } from "./MascotFigure";
import { createMover } from "./motion";
import { AUTOMATIC, heroSteps, introSteps, lineMs, loadProgress, pickEgg, RANK, saveProgress, sectionSteps, type Step, type StepKind } from "./tour";
import styles from "./Mascot.module.css";

const NAP_MS = 30_000; // no pointer, scroll or key for this long → drowsy
const SLEEP_AFTER_DROWSY_MS = 12_000;
const POKES = 7;
const SECTION_DELAY = 650; // let a scroll settle before a section's line
const SECTION_GAP = { wide: 3500, narrow: 10_000 }; // between section/egg lines
const EGG_GAP = { wide: 32_000, narrow: 70_000 }; // quiet time before an Easter-egg nudge
const EGG_MAX = 5; // per session
const STEP_GAP = 650; // a breath between queued lines
const ARRIVE_TIMEOUT = 1700; // a flight that hasn't landed by now shows its line anyway
const BUBBLE_W = { wide: 288, narrow: 216 }; // floating bubble widths: usual, and for tight gaps
const PEEK = { wide: 20, narrow: 12 }; // how much of her shows when tucked into a screen edge
const NAV_BAND = 76; // the fixed nav's height plus its top inset: never covered on the site

let lineSeq = 0;

/** Dev-only: ?binduNap=5 makes her doze after 5 s (QA for the sleeper egg). */
function napMs() {
  if (process.env.NODE_ENV === "production") return NAP_MS;
  const v = Number(new URLSearchParams(window.location.search).get("binduNap"));
  return Number.isFinite(v) && v > 0 ? v * 1000 : NAP_MS;
}

type Stage = "pending" | "gate" | "live";

type Director = {
  request: (steps: Step[], opts?: { interrupt?: boolean; replace?: StepKind[] }) => void;
  say: (text: string) => void;
  /** drop the current line */
  dismiss: () => void;
  /** "Quiet, Bindu": drop every automatic line, current and queued */
  quiet: () => void;
  hold: (on: boolean) => void;
  rest: () => void;
  busy: () => boolean;
};

export function Mascot() {
  const phase = useApp((s) => s.phase);
  if (phase === "greeting") return null;
  return <Guide />;
}

function Guide() {
  const phase = useApp((s) => s.phase);
  const overlay = useApp((s) => s.overlay);
  const plain = useApp((s) => s.plain);
  const muted = useApp((s) => s.guideMuted);
  const openOverlay = useApp((s) => s.openOverlay);
  const closeOverlay = useApp((s) => s.closeOverlay);
  const reduce = useReducedMotion();
  const narrow = useIsNarrow();
  const fine = useFinePointer();
  const still = reduce || plain;
  const size = narrow ? 52 : 72;
  const inIntro = phase === "intro";

  const [stage, setStage] = useState<Stage>(inIntro ? "pending" : "live");
  const agentOpen = overlay === "agent";
  const away = overlay !== null || (inIntro && stage !== "live");

  const rootRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const director = useRef<Director | null>(null);

  const [line, setLine] = useState<Line | null>(null);
  const [shown, setShown] = useState(false);
  const [dock, setDock] = useState<Dock | null>(null);
  const [side, setSide] = useState<Side | null>(null);
  const [tail, setTail] = useState(0);
  const [bubbleW, setBubbleW] = useState<number | null>(null);
  const [tuck, setTuck] = useState(0);
  const [face, setFace] = useState<1 | -1>(-1);
  const [edge, setEdge] = useState<"left" | "right">("right");
  const [tucked, setTucked] = useState(false);
  const [hop, setHop] = useState<"in" | "out">("in");
  const [guideMood, setGuideMood] = useState<MascotMood | null>(null);
  const [announce, setAnnounce] = useState("");

  const [waking, setWaking] = useState(true);
  const [rest, setRest] = useState<"awake" | "drowsy" | "sleeping">("awake");
  const [thinking, setThinking] = useState(false);
  const [reaction, setReaction] = useState<MascotMood | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const mood: MascotMood =
    rest === "sleeping"
      ? "sleeping"
      : rest === "drowsy"
        ? "drowsy"
        : thinking
          ? "thinking"
          : (reaction ?? guideMood ?? (waking ? "waking" : agentOpen ? "listening" : "idle"));

  // refs for the long-lived director and listeners (media queries change rarely)
  const narrowRef = useLatest(narrow);
  const stillRef = useLatest(still);
  const sizeRef = useLatest(size);
  const fineRef = useLatest(fine);
  const restRef = useLatest(rest);
  const thinkingRef = useLatest(thinking);
  const lastInput = useRef(0);

  /* ───────── reactions ───────── */
  const reactionTimer = useRef(0);
  const react = useCallback((m: MascotMood, ms: number) => {
    window.clearTimeout(reactionTimer.current);
    setReaction(m);
    reactionTimer.current = window.setTimeout(() => setReaction(null), ms);
  }, []);
  const settle = useCallback((m: MascotMood, after: number) => {
    window.clearTimeout(reactionTimer.current);
    reactionTimer.current = window.setTimeout(() => setReaction((cur) => (cur === m ? null : cur)), after);
  }, []);
  useEffect(() => () => window.clearTimeout(reactionTimer.current), []);

  useEffect(() => {
    const offs = [
      on("cta:hover", () => react("excited", 6000)),
      on("cta:leave", () => settle("excited", 1200)),
      on("booking:open", () => react("curious", 5000)),
      on("booking:done", () => react("celebrate", 6500)),
      on("form:error", () => react("confused", 4500)),
      on("agent:thinking", ({ on: busy }) => setThinking(busy)),
      on("cache:found", () => react("celebrate", 4500)),
      on("target:lock", () => react("surprised", 3500)),
      on("copy:email", () => react("happy", 3500)),
    ];
    return () => offs.forEach((off) => off());
  }, [react, settle]);

  /* ───────── the director: one line at a time, flown to where it belongs ───────── */
  useEffect(() => {
    const root = rootRef.current!;
    const mover = createMover({ pos: posRef.current!, tilt: tiltRef.current!, bubble: bubbleRef.current!, ring: ringRef.current! });
    const progress = loadProgress();
    if (progress.muted) useApp.getState().setGuideMuted(true);
    const save = () => saveProgress(progress);
    const seen = (id?: string) => Boolean(id && progress.seen.includes(id));

    // the intro stage, tracked here so decisions never wait for a re-render
    let stageNow: Stage = useApp.getState().phase === "intro" ? "pending" : "live";
    const toStage = (s: Stage) => {
      stageNow = s;
      setStage(s);
    };
    const isAway = () => {
      const s = useApp.getState();
      return s.overlay !== null || (s.phase === "intro" && stageNow !== "live");
    };
    const cornerRest = () => {
      const s = useApp.getState();
      return s.guideMuted || s.plain || narrowRef.current;
    };

    /* what's on screen: the intro stage while it's up, otherwise the page */
    let cands: Candidate[] = [];
    let candsAt = -Infinity;
    let candsScope: ParentNode | null = null;
    let dirty = true;
    const mo = new MutationObserver(() => {
      dirty = true;
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const scope = (): ParentNode => {
      if (useApp.getState().phase === "intro") {
        const anchor = document.querySelector('[data-guide^="intro-"]');
        const stageEl = anchor?.closest('[aria-modal="true"]') ?? document.querySelector('[role="dialog"][aria-modal="true"]');
        if (stageEl) return stageEl;
      }
      return document;
    };
    const candidates = () => {
      const sc = scope();
      const now = performance.now();
      if (dirty || sc !== candsScope || now - candsAt > 1500) {
        cands = collectCandidates([root], sc);
        candsScope = sc;
        candsAt = now;
        dirty = false;
      }
      return cands;
    };

    // the visitor's pointer: she never lands where they're about to click
    let pointer = { x: 0, y: 0, t: -Infinity };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "mouse") pointer = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let placed = false;
    const scene = (bubble: Bubble | null, avoidPointer: boolean): Scene => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const near = avoidPointer && performance.now() - pointer.t < 2500;
      const avoid: Box[] = near ? [inflate({ left: pointer.x, top: pointer.y, right: pointer.x, bottom: pointer.y }, 56)] : [];
      // the fixed nav hides while scrolling down and slides back later, so it may be missing from
      // the cached obstacles: keep its band clear on the site no matter what state it's in
      const reserved: Box[] = useApp.getState().phase === "site" ? [{ left: 0, top: 0, right: vw, bottom: NAV_BAND }] : [];
      return {
        vw,
        vh,
        size: sizeRef.current,
        bubble,
        obstacles: obstaclesIn(candidates(), { left: 0, top: 0, right: vw, bottom: vh }),
        narrow: narrowRef.current,
        avoid,
        reserved,
        from: placed ? mover.get() : undefined,
      };
    };

    /** the line's bubble at each width it may take: floating wide, floating narrow, docked */
    const measure = (text: string, label: string): Bubble => {
      const m = measureRef.current!;
      m.querySelector("[data-text]")!.textContent = text;
      m.querySelector("[data-label]")!.textContent = label;
      const at = (max: number | null) => {
        if (max === null) {
          m.dataset.dock = "bottom";
          m.style.maxWidth = "";
        } else {
          delete m.dataset.dock;
          m.style.maxWidth = `${Math.min(max, window.innerWidth - 32)}px`;
        }
        return { w: m.offsetWidth, h: m.offsetHeight };
      };
      const wide = at(BUBBLE_W.wide);
      const narrowSize = at(BUBBLE_W.narrow);
      const dockH = narrowRef.current ? at(null).h : 0;
      delete m.dataset.dock;
      return { wide, narrow: narrowSize, dockH };
    };

    /** how far to slide her so only a sliver peeks from the nearest screen edge */
    const tuckBy = (at: Pt) => {
      const s = sizeRef.current;
      const peek = narrowRef.current ? PEEK.narrow : PEEK.wide;
      return at.x + s / 2 < window.innerWidth / 2 ? peek - s - at.x : window.innerWidth - peek - at.x;
    };

    const visibleEnough = (r: DOMRect) => {
      const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
      return h >= Math.min(32, r.height * 0.5) && w >= Math.min(32, r.width * 0.5);
    };
    const find = (anchor: string) => {
      const el = scope().querySelector<HTMLElement>(`[data-guide="${CSS.escape(anchor)}"]`);
      if (!el || el.getClientRects().length === 0) return null;
      if (typeof el.checkVisibility === "function" && !el.checkVisibility({ visibilityProperty: true })) return null;
      return el;
    };
    const onScreen = (anchor: string) => {
      const el = find(anchor);
      return Boolean(el && visibleEnough(el.getBoundingClientRect()));
    };
    const clampPt = (p: Pt): Pt => {
      const s = sizeRef.current;
      return { x: Math.min(Math.max(p.x, 6), window.innerWidth - s - 6), y: Math.min(Math.max(p.y, 6), window.innerHeight - s - 6) };
    };

    /** fly (or, with reduced motion / plain, fade and reappear) */
    const travel = (goal: () => Pt | null, o: { stiffness?: number; follow?: boolean; onArrive?: () => void; onLost?: () => void }) => {
      const g = goal();
      if (!g) return o.onLost?.();
      if (!placed) {
        placed = true;
        mover.jump(g);
        if (o.follow) mover.fly(goal, { stiffness: 400, follow: true, onLost: o.onLost });
        o.onArrive?.();
        return;
      }
      if (stillRef.current) {
        setHop("out");
        window.setTimeout(() => {
          const now = goal();
          if (!now) return o.onLost?.();
          mover.jump(now);
          if (o.follow) mover.fly(goal, { stiffness: 400, follow: true, onLost: o.onLost });
          setHop("in");
          o.onArrive?.();
        }, 170);
        return;
      }
      mover.fly(goal, { stiffness: o.stiffness ?? 70, follow: o.follow, onArrive: o.onArrive, onLost: o.onLost });
    };

    /* ───────── steps ───────── */
    type Active = { step: Step; el: HTMLElement | null; text: string; shownAt: number; timer: number; timerAt: number; remaining: number };
    let queue: Step[] = [];
    let active: Active | null = null;
    let nextTimer = 0;
    let arriveTimer = 0;
    let held = false;
    let lastAuto = -Infinity;
    let lastSection = -Infinity;
    let letGoQueued = false;

    const allowed = (step: Step) => {
      if (seen(step.id) || isAway()) return false;
      if (AUTOMATIC.has(step.kind)) {
        const s = useApp.getState();
        if (s.guideMuted || s.plain || restRef.current !== "awake") return false;
        if (step.kind !== "intro" && s.phase !== "site") return false;
      }
      return true;
    };

    const runTimer = () => {
      const a = active;
      if (!a || !a.shownAt) return;
      window.clearTimeout(a.timer);
      if (held) return;
      a.timerAt = performance.now();
      a.timer = window.setTimeout(() => {
        if (active === a) finish();
      }, a.remaining);
    };

    const arrive = () => {
      window.clearTimeout(arriveTimer);
      const a = active;
      if (!a || a.shownAt) return;
      a.shownAt = performance.now();
      setShown(true);
      setGuideMood(a.step.mood ?? "curious");
      setAnnounce(`Bindu: ${a.text}`);
      if (a.step.id) {
        progress.seen.push(a.step.id);
        if (a.step.kind === "egg") progress.coached.push(a.step.id.slice(4));
        save();
      }
      runTimer();
    };

    /** Is the target still worth pointing at? If not, let go (from inside a frame, so deferred). */
    const queueLetGo = (el: HTMLElement) => {
      if (letGoQueued) return;
      letGoQueued = true;
      window.setTimeout(() => {
        letGoQueued = false;
        if (active?.el === el) letGo();
      }, 0);
    };
    const ringFor = (el: HTMLElement, draw: boolean) => (): Box | null => {
      if (!el.isConnected) {
        queueLetGo(el);
        return null;
      }
      const r = el.getBoundingClientRect();
      if (!visibleEnough(r)) {
        queueLetGo(el);
        return null;
      }
      return draw ? inflate(r, 6) : null;
    };

    /** Lay the active line out (again, after a resize) and fly her there. */
    const place = (a: Active, first: boolean) => {
      const bub = measure(a.text, a.step.label);
      const sc = scene(bub, first);
      const r0 = a.el?.getBoundingClientRect() ?? null;
      const spot0 = a.el && r0 ? besideTarget(r0, sc) : null;
      const spot = spot0 ?? restSpot({ ...sc, avoid: [] }, { corner: cornerRest() });
      const big = r0 ? r0.width * r0.height > sc.vw * sc.vh * 0.32 : false;
      const s = sc.size;

      setDock(spot.dock);
      setSide(spot.side);
      setBubbleW(spot.bubbleW);
      setTail(spot.bubble ? s / 2 - spot.bubble.x : 0);
      setFace(spot.face);
      setEdge(spot.at.x + s / 2 < sc.vw / 2 ? "left" : "right");
      setTucked(false);
      mover.carryBubble(spot.dock ? null : spot.bubble);
      // the ring marks the target, unless she's standing inside it (a big target)
      mover.ring(a.el ? ringFor(a.el, !big) : null);

      if (a.el && spot0 && r0) {
        const el = a.el;
        const rel = { x: spot.at.x - r0.left, y: spot.at.y - r0.top };
        const bubbleTop = spot.bubble && !spot.dock ? Math.min(0, spot.bubble.y) : 0;
        travel(
          () => {
            if (!el.isConnected) return null;
            const r = el.getBoundingClientRect();
            const at = { x: r.left + rel.x, y: r.top + rel.y };
            // following the target up under the fixed nav: let go rather than cover it
            if (useApp.getState().phase === "site" && at.y + bubbleTop < NAV_BAND) return null;
            return visibleEnough(r) ? clampPt(at) : null;
          },
          { follow: true, onArrive: arrive, onLost: letGo },
        );
      } else {
        const at = spot.at;
        travel(() => at, { onArrive: arrive });
      }
    };

    const play = (step: Step): boolean => {
      if (!allowed(step)) return false;
      const el = step.anchor ? find(step.anchor) : null;
      // a missing or off-screen anchor: skip gracefully (not marked heard, it can play later)
      if (step.anchor && (!el || !visibleEnough(el.getBoundingClientRect()))) return false;
      const text = typeof step.text === "function" ? step.text() : step.text;
      window.clearTimeout(nextTimer);
      const a: Active = { step, el, text, shownAt: 0, timer: 0, timerAt: 0, remaining: step.ttl ?? lineMs(text) };
      active = a;
      const now = performance.now();
      if (AUTOMATIC.has(step.kind)) lastAuto = now;
      if (step.kind === "section" || step.kind === "egg") lastSection = now;

      setShown(false);
      setLine({ key: ++lineSeq, text, label: step.label, kind: step.kind });
      setGuideMood(el ? "excited" : null);
      place(a, true);
      window.clearTimeout(arriveTimer);
      arriveTimer = window.setTimeout(arrive, ARRIVE_TIMEOUT);
      return true;
    };

    const clear = () => {
      const a = active;
      if (!a) return;
      window.clearTimeout(a.timer);
      window.clearTimeout(arriveTimer);
      active = null;
      setShown(false);
      setGuideMood(null);
      mover.ring(null);
    };

    const next = () => {
      window.clearTimeout(nextTimer);
      if (active) return;
      while (queue.length) if (play(queue.shift()!)) return;
      goRest();
    };

    /** the line ran its course */
    function finish() {
      // the intro's lines chain straight on: its countdown is only a few seconds long
      const chained = active?.step.kind === "intro" && queue[0]?.kind === "intro";
      clear();
      nextTimer = window.setTimeout(next, chained ? 0 : STEP_GAP);
    }

    /** the target left, the visitor dismissed it, or something more important came up */
    function letGo() {
      if (!active) return;
      clear();
      nextTimer = window.setTimeout(next, queue.length ? STEP_GAP : 120);
    }

    /** back to empty ground at the side; `stay` keeps her put if the ground under her is still clear */
    function goRest(o: { wander?: boolean; stay?: boolean } = {}) {
      if (active || isAway()) return;
      if (o.stay && placed) {
        const p = mover.get();
        const s = sizeRef.current;
        const me = { left: p.x - 4, top: p.y - 4, right: p.x + s + 4, bottom: p.y + s + 4 };
        const onScreen = me.left >= 0 && me.top >= 0 && me.right <= window.innerWidth && me.bottom <= window.innerHeight;
        if (onScreen && !occupant(me, candidates(), window.innerWidth)) {
          setTucked(false);
          return;
        }
      }
      const sc = scene(null, false);
      const spot = restSpot(sc, { wander: o.wander, corner: cornerRest() });
      setFace(spot.face);
      setEdge(spot.at.x + sc.size / 2 < sc.vw / 2 ? "left" : "right");
      setTuck(tuckBy(spot.at));
      setTucked(spot.tucked);
      const at = spot.at;
      travel(() => at, { stiffness: o.wander ? 14 : 30 });
    }

    const request: Director["request"] = (steps, opts = {}) => {
      if (opts.replace) queue = queue.filter((s) => !opts.replace!.includes(s.kind));
      const fresh = steps.filter((s) => !seen(s.id) && !queue.some((q) => q.id && q.id === s.id) && !(s.id && active?.step.id === s.id));
      if (!fresh.length) return;
      const rank = Math.max(...fresh.map((s) => RANK[s.kind]));
      // higher kinds go first; equal kinds keep their order
      queue = [...queue.filter((s) => RANK[s.kind] >= rank), ...fresh, ...queue.filter((s) => RANK[s.kind] < rank)];
      if (active && opts.interrupt && RANK[active.step.kind] <= rank) {
        clear();
        next();
      } else if (!active) {
        next();
      }
    };

    /* ───────── the intro stage ───────── */
    let introQueued = false;
    let introDone = false;
    let heroLater = 0;
    let left: number | undefined;
    let countdown: "running" | "held" = "running";
    const enterText = () =>
      countdown === "held" ? "…and the site opens when you're ready. Tap Enter any time." : `…and the site opens in ${left ?? 6} s, or tap now.`;
    const retext = () => {
      const a = active;
      if (!a || a.step.id !== "intro:enter") return;
      a.text = enterText();
      setLine((l) => (l ? { ...l, text: a.text } : l));
    };
    const startIntro = () => {
      if (introQueued || introDone) return;
      introQueued = true;
      request(introSteps(enterText));
    };
    const leaveIntro = () => {
      if (introDone) return;
      introDone = true;
      siteSince = performance.now();
      queue = queue.filter((s) => s.kind !== "intro");
      if (active?.step.kind === "intro") letGo();
      dirty = true;
      window.clearTimeout(heroLater);
      heroLater = window.setTimeout(startHero, 1600);
    };

    const offStage = on("intro:stage", (s) => {
      if (introDone) return;
      if (s.phase === "gate") {
        toStage("gate");
        return;
      }
      const wasLive = stageNow === "live";
      toStage("live");
      if (!wasLive) window.setTimeout(() => goRest(), 0);
      if (s.phase === "spoken") startIntro();
      else if (s.phase === "countdown") {
        left = s.left;
        countdown = "running";
        startIntro();
        retext();
      } else if (s.phase === "paused") {
        if (s.left === undefined) {
          // a choice switched the countdown off: nothing left to announce
          queue = queue.filter((q) => q.id !== "intro:enter");
          if (active?.step.id === "intro:enter") letGo();
        } else {
          left = s.left;
          countdown = "held";
          retext();
        }
      } else if (s.phase === "entered") leaveIntro();
    });
    // an intro that never reports its stage still gets a Bindu, a moment later
    const stageFallback = window.setTimeout(() => {
      if (stageNow === "pending") {
        toStage("live");
        goRest();
      }
    }, 4000);

    /* ───────── the landing view ───────── */
    let siteSince = useApp.getState().phase === "site" ? performance.now() : Infinity;
    function startHero() {
      const s = useApp.getState();
      if (s.phase !== "site" || s.activeSection !== "top") return;
      request(heroSteps(narrowRef.current), { replace: ["tour"] });
    }
    // she mounts after the page (a lazy chunk), so the section the visitor is already on has
    // announced itself before she could listen: start from where they are
    const heroTimer =
      useApp.getState().phase === "site"
        ? window.setTimeout(() => {
            const at = useApp.getState().activeSection;
            if (at === "top") startHero();
            else arriveAt(at);
          }, 1800)
        : 0;

    const offPhase = useApp.subscribe((s, prev) => {
      if (prev.phase === "intro" && s.phase === "site") leaveIntro();
    });

    /* ───────── one line per section ───────── */
    let sectionTimer = 0;
    let watch: IntersectionObserver | null = null;
    const offSection = on("section:enter", ({ id }) => {
      window.clearTimeout(sectionTimer);
      watch?.disconnect();
      watch = null;
      // a line about the section the visitor just left no longer points at anything
      if (active?.step.kind === "section" && !active.step.id?.startsWith(`sec:${id}`)) letGo();
      if (id === "top") {
        sectionTimer = window.setTimeout(startHero, SECTION_DELAY);
        return;
      }
      sectionTimer = window.setTimeout(() => arriveAt(id), SECTION_DELAY);
    });
    const arriveAt = (id: SectionId) => {
      if (useApp.getState().activeSection !== id) return;
      const isNarrow = narrowRef.current;
      const { anchor, steps } = sectionSteps(id, { narrow: isNarrow, restrictedFound: Boolean(useApp.getState().caches.restricted) });
      const fresh = steps.filter((s) => !seen(s.id));
      if (!fresh.length || performance.now() - lastSection < (isNarrow ? SECTION_GAP.narrow : SECTION_GAP.wide)) return;
      const go = () => request(fresh, { replace: ["section", "egg"], interrupt: true });
      const el = anchor ? find(anchor) : null;
      if (!el) {
        // no anchor on the page: say the section's tip from where she is (phones skip it: fewer moves)
        if (!isNarrow) request([{ ...fresh[0]!, anchor: undefined }], { replace: ["section", "egg"], interrupt: true });
        return;
      }
      if (visibleEnough(el.getBoundingClientRect())) return go();
      // the anchor is further into the section: point once it scrolls into view
      watch = new IntersectionObserver(
        (entries) => {
          const e = entries[0];
          if (!e?.isIntersecting || (e.intersectionRatio < 0.55 && e.intersectionRect.height < 140)) return;
          watch?.disconnect();
          watch = null;
          if (useApp.getState().activeSection === id) window.setTimeout(go, 250);
        },
        { threshold: [0, 0.3, 0.55, 0.8] },
      );
      watch.observe(el);
    };

    /* ───────── now and then: an Easter egg they haven't found ───────── */
    const eggTimer = window.setInterval(() => {
      if (active || queue.length || document.visibilityState !== "visible") return;
      const now = performance.now();
      const s = useApp.getState();
      if (s.phase !== "site" || now - siteSince < 25_000) return;
      if (now - lastAuto < (narrowRef.current ? EGG_GAP.narrow : EGG_GAP.wide)) return;
      if (Date.now() - lastInput.current > 15_000 || progress.coached.length >= EGG_MAX) return;
      const step = pickEgg({
        found: s.caches,
        coached: progress.coached,
        section: s.activeSection,
        keyboard: fineRef.current && !narrowRef.current,
        narrow: narrowRef.current,
        onScreen,
      });
      if (step) request([step]);
    }, 4000);

    /* ───────── on demand ───────── */
    const offNudge = on("guide:nudge", ({ anchor, text, ttl }) =>
      request([{ kind: "nudge", anchor, text, label: "Bindu", ttl: ttl ?? Math.max(5000, lineMs(text)), mood: "excited" }], { interrupt: true }),
    );

    /* ───────── keep her placed as the page moves ───────── */
    let scrollT = 0;
    let lastCheck = 0;
    const onScroll = () => {
      if (active || !placed) return;
      const now = performance.now();
      if (now - lastCheck > 220) {
        lastCheck = now;
        const p = mover.get();
        const s = sizeRef.current;
        // the ground under her filled up mid-scroll: peek from the edge until it settles
        if (occupant({ left: p.x - 4, top: p.y - 4, right: p.x + s + 4, bottom: p.y + s + 4 }, candidates(), window.innerWidth)) {
          setTuck(tuckBy(p));
          setTucked(true);
        }
      }
      window.clearTimeout(scrollT);
      scrollT = window.setTimeout(() => {
        if (!held) goRest({ stay: true });
      }, 280);
    };
    let resizeT = 0;
    const onResize = () => {
      window.clearTimeout(resizeT);
      resizeT = window.setTimeout(() => {
        dirty = true;
        if (active) place(active, false);
        else goRest();
      }, 200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    // she drifts between calm spots now and then (wide screens, with motion, tour on)
    const drift = window.setInterval(() => {
      const s = useApp.getState();
      if (active || held || stillRef.current || narrowRef.current || s.guideMuted || restRef.current !== "awake") return;
      if (document.visibilityState !== "visible" || Math.random() < 0.4) return;
      goRest({ wander: true });
    }, 9000);

    director.current = {
      request,
      say: (text) => request([{ kind: "say", text, label: "Bindu", mood: "happy" }], { interrupt: true }),
      dismiss: () => letGo(),
      quiet: () => {
        queue = queue.filter((s) => !AUTOMATIC.has(s.kind));
        if (active && AUTOMATIC.has(active.step.kind)) letGo();
        else goRest();
      },
      hold: (on) => {
        if (held === on) return;
        held = on;
        const a = active;
        if (!a || !a.shownAt) return;
        if (on) {
          window.clearTimeout(a.timer);
          a.remaining = Math.max(1500, a.remaining - (performance.now() - a.timerAt));
        } else runTimer();
      },
      rest: () => goRest(),
      busy: () => active !== null,
    };

    if (stageNow === "live") goRest();

    return () => {
      director.current = null;
      mover.destroy();
      mo.disconnect();
      watch?.disconnect();
      offStage();
      offSection();
      offNudge();
      offPhase();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      [nextTimer, arriveTimer, sectionTimer, scrollT, resizeT, stageFallback, heroTimer, heroLater].forEach((t) => window.clearTimeout(t));
      window.clearInterval(eggTimer);
      window.clearInterval(drift);
      if (active) window.clearTimeout(active.timer);
    };
  }, [narrowRef, stillRef, sizeRef, fineRef, restRef]);

  // an overlay (or the intro's gate) hides her; coming back, she finds fresh ground
  useEffect(() => {
    if (away) director.current?.dismiss();
    else director.current?.rest();
  }, [away]);

  // her size or mode changed: re-place
  useEffect(() => {
    director.current?.rest();
  }, [narrow, plain, size]);

  // "Quiet, Bindu" lasts the session; turning the tour back on (from Ask Bindu) moves her off the corner
  const mutedOnce = useRef(muted);
  useEffect(() => {
    // read the store, not the render: on mount the director may have just restored a muted session
    const now = useApp.getState().guideMuted;
    const p = loadProgress();
    if (p.muted !== now) saveProgress({ ...p, muted: now });
    if (now) director.current?.quiet();
    else if (mutedOnce.current) director.current?.rest();
    mutedOnce.current = now;
  }, [muted]);

  // Other components drive her through the store: setMascotMood(m) plays m as a short
  // reaction, say(line) shows a line. Both are consumed and reset so repeats re-trigger.
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.mascotMood !== prev.mascotMood && s.mascotMood !== "idle") {
          react(s.mascotMood, 5000);
          s.setMascotMood("idle");
        }
        if (s.mascotLine && s.mascotLine !== prev.mascotLine) {
          director.current?.say(s.mascotLine);
          s.say(null);
        }
      }),
    [react],
  );

  /* ───────── waking → idle ───────── */
  useEffect(() => {
    if (!waking) return;
    const t = window.setTimeout(() => setWaking(false), still ? 500 : 2600); // fallback if onAnimationEnd never fires
    return () => window.clearTimeout(t);
  }, [waking, still]);
  const onAnimationEnd = useCallback((a: string) => {
    if (a === "waking") setWaking(false);
  }, []);

  /* ───────── doze after 30 s alone (on the site, not mid-line); any input wakes her ───────── */
  useEffect(() => {
    const nap = napMs();
    lastInput.current = Date.now();
    let sleptThisVisit = false;
    const wake = () => {
      lastInput.current = Date.now();
      if (restRef.current !== "awake") {
        setRest("awake");
        setWaking(true);
      }
    };
    const evts = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    evts.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    const onVis = () => {
      if (document.visibilityState === "visible") lastInput.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);
    const iv = window.setInterval(() => {
      if (document.visibilityState !== "visible" || thinkingRef.current || director.current?.busy() || useApp.getState().phase !== "site") {
        lastInput.current = Math.max(lastInput.current, Date.now() - nap + 2000);
        return;
      }
      const idle = Date.now() - lastInput.current;
      if (idle > nap + (nap < NAP_MS ? nap * 0.6 : SLEEP_AFTER_DROWSY_MS)) {
        if (restRef.current !== "sleeping") {
          setRest("sleeping");
          if (!sleptThisVisit) {
            sleptThisVisit = true;
            discover("sleeper");
          }
        }
      } else if (idle > nap && restRef.current === "awake") {
        setRest("drowsy");
      }
    }, 1000);
    return () => {
      evts.forEach((e) => window.removeEventListener(e, wake));
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(iv);
    };
  }, [restRef, thinkingRef]);

  /* ───────── open the agent: click, Cmd/Ctrl+K ───────── */
  const openAgent = useCallback(() => {
    if (useApp.getState().phase !== "site") {
      // the stage is up: the chat lives on the site itself
      director.current?.say("Ask me anything once you're in.");
      return;
    }
    director.current?.dismiss();
    openOverlay("agent");
  }, [openOverlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (useApp.getState().phase !== "site") return;
      e.preventDefault();
      if (useApp.getState().overlay === "agent") closeOverlay();
      else openAgent();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAgent, closeOverlay]);

  // A single click opens the drawer; a rapid run of clicks is a poke, and seven is too many.
  const clicks = useRef<number[]>([]);
  const clickTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) {
      openAgent(); // keyboard activation: no poke counting, no delay
      return;
    }
    const now = Date.now();
    const prev = clicks.current[clicks.current.length - 1] ?? 0;
    clicks.current = now - prev < 650 ? [...clicks.current, now] : [now];
    window.clearTimeout(clickTimer.current);
    const n = clicks.current.length;
    if (n >= POKES) {
      clicks.current = [];
      discover("poke"); // first: its cache:found celebration must not override the anger
      react("angry", 4200);
      director.current?.say("Okay, okay. That's enough poking.");
      return;
    }
    if (n >= 2) react("playful", 1800);
    clickTimer.current = window.setTimeout(() => {
      if (clicks.current.length === 1) openAgent();
      clicks.current = [];
    }, 300);
  };

  const quiet = useCallback(() => {
    const s = useApp.getState();
    if (s.guideMuted) return director.current?.dismiss();
    s.setGuideMuted(true);
    s.toast({ title: "Bindu's tour is off", body: "Turn it back on any time in Ask Bindu." });
  }, []);
  const hold = useCallback((h: boolean) => director.current?.hold(h), []);
  const returnFocus = useCallback(() => buttonRef.current, []);

  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const peek = tucked && !shown && !hovered && !focused;

  return (
    <>
      <div
        ref={rootRef}
        className={styles.guide}
        data-layer={inIntro ? "intro" : undefined}
        data-away={away}
        data-hop={hop}
        data-still={still || undefined}
        style={{ "--size": `${size}px` } as CSSProperties}
      >
        <div ref={ringRef} className={styles.ring} data-on="false" aria-hidden="true" />
        <div
          ref={posRef}
          className={styles.pos}
          data-edge={edge}
          data-tucked={peek}
          data-mood={mood}
          style={{ "--tuck": `${Math.round(tuck)}px` } as CSSProperties}
        >
          <div ref={tiltRef} className={styles.tilt}>
            <button
              ref={buttonRef}
              type="button"
              className={styles.bindu}
              onClick={onClick}
              onPointerEnter={(e) => {
                if (e.pointerType !== "mouse") return;
                setHovered(true);
                hold(true);
              }}
              onPointerLeave={() => {
                setHovered(false);
                hold(false);
              }}
              onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
              onBlur={() => setFocused(false)}
              aria-label="Ask Bindu, the site's AI guide"
              aria-haspopup="dialog"
              aria-expanded={agentOpen}
              aria-keyshortcuts="Control+K Meta+K"
              tabIndex={away || inIntro ? -1 : 0}
            >
              <span className={styles.shadow} aria-hidden="true" />
              <span className={styles.body} data-face={face}>
                <span className={styles.bob}>
                  <MascotFigure mood={mood} size={size} still={still} onAnimationEnd={onAnimationEnd} />
                </span>
              </span>
            </button>
          </div>
          {fine && !inIntro ? (
            <span className={styles.hint} aria-hidden="true">
              Ask Bindu <kbd>{isMac ? "Cmd K" : "Ctrl K"}</kbd>
            </span>
          ) : null}
        </div>
        <Callout
          line={line}
          shown={shown && !away}
          dock={dock}
          side={side}
          width={bubbleW}
          boxRef={bubbleRef}
          onDismiss={() => director.current?.dismiss()}
          onQuiet={quiet}
          onHold={hold}
          tail={tail}
        />
        <CalloutMeasure boxRef={measureRef} />
        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {shown && !away ? announce : ""}
        </p>
      </div>
      <Drawer open={agentOpen} onClose={closeOverlay} mood={mood} still={still} narrow={narrow} returnFocus={returnFocus} />
    </>
  );
}
