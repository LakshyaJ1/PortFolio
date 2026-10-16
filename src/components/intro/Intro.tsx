"use client";

// The stage after the hellos (phase "intro"). Lakshya "spawns" on the survey ground in the left
// third and talks; his captions run in the middle; the right third offers his résumé first, then
// the way into the site. No panel, no light table: he stands straight on the night ground, on a
// survey station at the summit of a contour field that recedes in 3D to a horizon under his name.
//
// REAL mode: /hero/manifest.json v2 stacked-alpha clips, drawn by AvatarGL (poster <img> without
// WebGL), sequenced by ClipPlayer. PLACEHOLDER mode (v0 stub): the contour-line stand-in, voiced by
// Web Speech. Both share the narrator interface (narrate.ts), the spawn, tilt and line of sight.
// The ground: stageScene.ts (three.js) where WebGL allows and plain mode is off, the flat SVG
// contour field otherwise (and until the 3D ground is ready).
// Once both lines are said, "Enter the site" counts down and presses itself (countdown.ts).
// Progress goes out on the `intro:stage` bus for Bindu's tour: spawn, speaking, spoken,
// countdown, paused, entered (the greeting sends gate).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent } from "react";
import gsap from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { useGSAP } from "@gsap/react";
import { PROFILE } from "@/content/profile";
import { emit } from "@/lib/events";
import { formatDMS } from "@/lib/geo";
import { useCanRender3D, useFinePointer, useLatest, useReducedMotion } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { readPalette, type RGB } from "@/components/terrain";
import { AvatarGL, measureFeet } from "./AvatarGL";
import { ContourPortrait, SCAN_BAND, type StandInApi } from "./ContourPortrait";
import { AutoEnter, COUNTDOWN, type CountdownView, type HoldReason } from "./countdown";
import { heroManifestNow, loadHeroManifest, type HeroManifest } from "./manifest";
import { clipVideo, entry, unlockMedia } from "./media";
import { ClipNarrator, StandInNarrator, speakingKeys, tracksFor, voiceIn, type Narrator, type NarratorEvents, type TalkState } from "./narrate";
import { speechSupported, useSpeechVoice } from "./speech";
import { FIELD_SIZE, stageField } from "./stageField";
import type { Rect, StageLayout, StageScene } from "./stageScene";
import { dropVeil } from "./veil";
import styles from "./Intro.module.css";

export { replayIntro } from "./replay";

gsap.registerPlugin(useGSAP, ScrambleTextPlugin);

const HOME_DMS = formatDMS(PROFILE.home);
const RESUME_FILE = "Lakshya-Jain-Resume.pdf";
const BARS = 5;
/** circumference of the Enter button's countdown ring (r = 19 in a 44 box) */
const RING = 2 * Math.PI * 19;

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** The stage's bottom edge while it lifts away: an index contour, like the greeting's panel. */
const SKIRT = (() => {
  let d = "";
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    const y = 18 + 9 * Math.sin(u * Math.PI * 2 * 1.2 + 0.6) + 4 * Math.sin(u * Math.PI * 2 * 2.7 + 1.9);
    d += `${i ? "L" : "M"}${(u * 1000).toFixed(1)} ${y.toFixed(2)}`;
  }
  return { edge: d, fill: `M0 0${d.replace(/^M/, "L")}L1000 0Z` };
})();

type Pos = { line: number; word: number };

export function Intro() {
  const reduce = useReducedMotion();
  const plain = useApp((s) => s.plain);
  const calm = reduce || plain;
  const fine = useFinePointer();
  const sound = useApp((s) => s.sound);
  /** sound is on, but the browser refused it until the visitor taps (autoplay policy) */
  const [held, setHeld] = useState(false);
  const audible = sound && !held;
  const overlay = useApp((s) => s.overlay);
  const can3D = useCanRender3D();

  const rootRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stationRef = useRef<HTMLSpanElement>(null);
  const resumeRef = useRef<HTMLAnchorElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  const rangeRef = useRef<HTMLDivElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const sightSvgRef = useRef<SVGSVGElement>(null);
  const sightLineRef = useRef<SVGLineElement>(null);
  const sightEndRef = useRef<SVGCircleElement>(null);
  const sightLabelRef = useRef<SVGTextElement>(null);
  const barsRef = useRef<HTMLSpanElement>(null);
  const standInApi = useRef<StandInApi | null>(null);
  const glRef = useRef<AvatarGL | null>(null);
  const sceneRef = useRef<StageScene | null>(null);
  const narratorRef = useRef<Narrator | null>(null);
  const started = useRef<Narrator | null>(null);
  const talkCue = useRef(false);
  const reveal = useRef({ v: 0 });
  /** the 3D ground's spawn: rings of contours running out from his feet */
  const groundReveal = useRef({ v: 0 });
  const exiting = useRef(false);
  /** the actions have spawned: the line of sight may draw */
  const settled = useRef(false);
  const aimSightRef = useRef<((el: HTMLElement | null) => void) | null>(null);
  const sight = useRef({ p: 0, x1: 0, y1: 0, x2: 0, y2: 0, el: null as HTMLElement | null, hover: null as HTMLElement | null });
  const autoSight = useRef({ key: "", timer: 0 });
  const savedTimer = useRef(0);
  const pointTimer = useRef(0);
  /** pointer / phone tilt, −1…1: target and smoothed */
  const tilt = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  /** when the last caption word landed (drives the ground pulses while he's muted) */
  const wordAt = useRef(-1e9);
  const spawned = useRef(false);
  const entered = useRef(false);
  /** clip key per spoken line, for the `speaking` event */
  const lineKeys = useRef<string[]>([]);

  const [manifest, setManifest] = useState<HeroManifest | null | undefined>(heroManifestNow);
  const [glOk, setGlOk] = useState(supportsWebGL);
  const [talk, setTalk] = useState<TalkState | "arriving">("arriving");
  const [pos, setPos] = useState<Pos>({ line: -1, word: -1 });
  const [transcript, setTranscript] = useState(false);
  const [saved, setSaved] = useState(false);
  const [spoken, setSpoken] = useState(false);
  const [cd, setCd] = useState<CountdownView>({ state: "idle", left: COUNTDOWN });
  const [auto] = useState(() => new AutoEnter());
  const [scene3d, setScene3d] = useState(false);
  const [lost3D, setLost3D] = useState(false);
  const speech = useSpeechVoice();

  const mode = manifest === undefined ? "loading" : manifest ? "real" : "placeholder";
  const tracks = useMemo(() => tracksFor(manifest ?? null), [manifest]);
  const voiceAvailable = manifest ? voiceIn(manifest, false) : manifest === null && speech.usable;
  const field = useMemo(() => stageField(), []);
  const use3D = can3D === true && !plain && !lost3D;
  const on3D = use3D && scene3d;
  const manifestRef = useLatest(manifest);
  const tracksRef = useLatest(tracks);
  const speechRef = useLatest(speech);
  const talkRef = useLatest(talk);
  const calmRef = useLatest(calm);
  const reduceRef = useLatest(reduce);

  /* ─── the manifest: usually loaded by the greeting already ─── */
  useEffect(() => {
    if (manifest !== undefined) return;
    let alive = true;
    void loadHeroManifest().then((m) => {
      if (alive) setManifest(m);
    });
    return () => {
      alive = false;
    };
  }, [manifest]);

  /* ─── the spawn reveal, shared by the shader, the stand-in and the scan line ─── */
  const applyReveal = useCallback(() => {
    const v = reveal.current.v;
    const edge = v * (1 + SCAN_BAND);
    frameRef.current?.style.setProperty("--edge", edge.toFixed(4));
    if (glRef.current) glRef.current.reveal = v;
    standInApi.current?.reveal(edge);
  }, []);

  useEffect(() => applyReveal(), [mode, glOk, applyReveal]);

  const startTalk = useCallback(() => {
    const n = narratorRef.current;
    if (!n || !talkCue.current || started.current === n || exiting.current) return;
    started.current = n;
    if (!spawned.current) {
      spawned.current = true;
      emit("intro:stage", { phase: "spawn" });
    }
    n.start();
  }, []);

  const cueTalk = useCallback(() => {
    talkCue.current = true;
    startTalk();
  }, [startTalk]);

  /* ─── the 3D ground's layout: his station, his size, the horizon, and the UI to keep clear ─── */
  const measureStage = useCallback((): StageLayout | null => {
    const root = rootRef.current;
    const st = stationRef.current;
    if (!root || !st) return null;
    const R = root.getBoundingClientRect();
    if (R.width < 10 || R.height < 10) return null;
    const rel = (el: Element | null): Rect | null => {
      const b = el?.getBoundingClientRect();
      if (!b || (!b.width && !b.height)) return null;
      return { x0: b.left - R.left, y0: b.top - R.top, x1: b.right - R.left, y1: b.bottom - R.top };
    };
    const narrow = R.width <= 720 || R.width / R.height <= 0.8;
    const avoid: Rect[] = [];
    // the actions themselves (their column spans the whole band), the skip, the notes, his frame
    root.querySelectorAll("[data-actions] > *, [data-skip], [data-note], [data-hint], [data-figure]").forEach((el) => {
      const r = rel(el);
      if (r) avoid.push(r);
    });
    // captions grow down from the top of the talk column as he speaks: keep the room they can fill
    const talkBox = rel(root.querySelector("[data-talk]"));
    if (talkBox) {
      const room = narrow ? R.height * 0.34 : Math.max(380, (talkBox.y1 - talkBox.y0) * 0.75);
      avoid.push({ ...talkBox, y1: narrow ? Math.max(talkBox.y1, talkBox.y0 + room) : Math.min(talkBox.y1, talkBox.y0 + room) });
    }
    const range = rel(rangeRef.current);
    const a = st.getBoundingClientRect();
    const avW = frameRef.current?.getBoundingClientRect().width || R.width * 0.3;
    return {
      w: R.width,
      h: R.height,
      stnX: a.left - R.left,
      stnY: a.top - R.top,
      ppu: avW * 0.3,
      horizon: range ? range.y1 + (narrow ? 14 : 28) : R.height * 0.25,
      avoid,
      narrow,
    };
  }, []);

  /** The spawn is done: actions are in place, so a pending focus or hover can draw its line. */
  const settle = useCallback(() => {
    settled.current = true;
    const el = sight.current.hover ?? (document.activeElement as HTMLElement | null);
    if (el?.closest("[data-actions]") && (el === sight.current.hover || el.matches(":focus-visible"))) aimSightRef.current?.(el);
    // the actions have landed: re-site the beacons around them
    const l = measureStage();
    if (l) sceneRef.current?.layout(l);
  }, [measureStage]);

  /* ─── REAL: the WebGL figure (poster first, then the clips) ─── */
  useEffect(() => {
    if (mode !== "real" || !glOk) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pal = readPalette();
    const rim = pal.z10.map((c, i) => c * 0.72 + pal.hydro[i] * 0.28) as RGB;
    const gl = AvatarGL.create(canvas, { fix: pal.fix, rim });
    if (!gl) {
      const id = requestAnimationFrame(() => setGlOk(false));
      return () => cancelAnimationFrame(id);
    }
    gl.onLost = () => setGlOk(false);
    glRef.current = gl;
    applyReveal();
    const m = manifestRef.current;
    if (m?.poster) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (glRef.current === gl && !gl.hasSource) gl.show(img, { stacked: false, fade: 0 });
      };
      img.src = m.poster;
    }
    const n = narratorRef.current;
    const active = n instanceof ClipNarrator ? n.player.active : null;
    const v = active ? clipVideo(active) : null;
    if (v) gl.show(v, { stacked: true, fade: 0 });
    const ro = new ResizeObserver(([e]) => gl.resize(e.contentRect.width, e.contentRect.height));
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      gl.dispose();
      if (glRef.current === gl) glRef.current = null;
    };
  }, [mode, glOk, applyReveal, manifestRef]);

  /* ─── the 3D ground. Created a frame after mount (so a dev double-mount never builds two on one
     canvas), from the height field the greeting baked while the hellos ran ─── */
  useEffect(() => {
    if (!use3D) return;
    const canvas = sceneCanvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    let alive = true;
    let made: StageScene | null = null;
    let ro: ResizeObserver | null = null;
    let relayout = 0;
    const kick = requestAnimationFrame(() => {
      void Promise.all([import("./stageScene"), import("./stageTerrain").then((t) => t.bakeGround())])
        .then(async ([mod, bake]) => {
          const layout = alive ? measureStage() : null;
          if (!layout) return;
          const s = await mod.StageScene.create(canvas, { palette: readPalette(), bake, animate: !reduceRef.current, layout });
          if (!s) return;
          if (!alive) {
            s.dispose();
            return;
          }
          made = s;
          s.onLost = () => setLost3D(true);
          sceneRef.current = s;
          setScene3d(true);
          ro = new ResizeObserver(() => {
            cancelAnimationFrame(relayout);
            relayout = requestAnimationFrame(() => {
              const l = measureStage();
              if (l) s.layout(l);
            });
          });
          ro.observe(root);
        })
        .catch(() => {});
    });
    return () => {
      alive = false;
      cancelAnimationFrame(kick);
      cancelAnimationFrame(relayout);
      ro?.disconnect();
      if (made) {
        if (sceneRef.current === made) sceneRef.current = null;
        made.dispose();
      }
    };
  }, [use3D, measureStage, reduceRef]);

  /* ─── REAL: stand him on the station by his soles, not by the frame's bottom edge ─── */
  const poster = manifest?.poster ?? null;
  useEffect(() => {
    const root = rootRef.current;
    if (!poster || !root) return;
    let alive = true;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const feet = alive ? measureFeet(img) : null;
      if (!feet) return;
      root.style.setProperty("--foot", feet.foot.toFixed(4));
      root.style.setProperty("--foot-cx", feet.cx.toFixed(4));
    };
    img.src = poster;
    return () => {
      alive = false;
      root.style.removeProperty("--foot");
      root.style.removeProperty("--foot-cx");
    };
  }, [poster]);

  /* ─── the narrator: who speaks, and when ─── */
  const narrKey = mode === "real" ? "real" : mode === "placeholder" && speech.ready ? "stand-in" : null;
  useEffect(() => {
    if (!narrKey) return;
    const m = manifestRef.current;
    lineKeys.current = narrKey === "real" && m ? speakingKeys(m) : ["intro", "offer"];
    const ev: NarratorEvents = {
      word: (line, word) => setPos((p) => (p.line === line && p.word === word ? p : { line, word })),
      state: (s) => setTalk(s),
      // the browser refused sound before any gesture: that isn't the visitor turning it off, so the
      // setting stays on and the next tap anywhere brings his voice back
      blocked: () => setHeld(true),
      clip: (key) => {
        const v = key ? clipVideo(key) : null;
        if (v) glRef.current?.show(v, { stacked: true, fade: 0.22 });
      },
      line: (i) => {
        const k = lineKeys.current[i];
        emit("intro:stage", k === "intro" || k === "offer" ? { phase: "speaking", clip: k } : { phase: "speaking" });
        // his lines started again (voice on): count down once he has finished them
        auto.rewind();
      },
      done: () => {
        setSpoken(true);
        emit("intro:stage", { phase: "spoken" });
        auto.arm();
      },
    };
    const on = useApp.getState().sound;
    const sp = speechRef.current;
    const n: Narrator =
      narrKey === "real" && m ? new ClipNarrator(m, tracksRef.current, on, ev) : new StandInNarrator(tracksRef.current, sp.voice, sp.usable, on, ev);
    narratorRef.current = n;
    startTalk();
    return () => {
      n.dispose();
      if (narratorRef.current === n) narratorRef.current = null;
      if (started.current === n) started.current = null;
    };
  }, [narrKey, manifestRef, tracksRef, speechRef, startTalk, auto]);

  /* ─── his voice follows the store (the toggles also call the narrator inside the gesture) ─── */
  useEffect(() => {
    narratorRef.current?.setSound(sound);
  }, [sound]);

  /* ─── one loop: narrator clock, level meter, avatar, countdown, the 3D ground ─── */
  useEffect(() => {
    let raf = 0;
    const bars = Array.from(barsRef.current?.children ?? []) as HTMLElement[];
    const lv = new Float32Array(BARS);
    const shown = new Float32Array(BARS);
    let liveShown = false;
    let last = 0;
    let fill = -1;
    let voice = 0;
    let par = { x: 0, y: 0 };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const n = started.current;
      n?.tick(now);
      const live = !!n && n.levels(lv, now);
      let sum = 0;
      for (let i = 0; i < BARS; i++) {
        const target = live ? lv[i] : 0;
        sum += target;
        shown[i] += (target - shown[i]) * (target > shown[i] ? 0.55 : 0.14);
        bars[i]?.style.setProperty("--l", shown[i].toFixed(3));
      }
      if (live !== liveShown) {
        liveShown = live;
        barsRef.current?.toggleAttribute("data-live", live);
      }
      glRef.current?.render(now);

      // auto-enter: the fill runs smoothly; calm visitors get one step a second
      auto.tick(dt);
      const counting = auto.state === "running" || auto.state === "held";
      const p = !counting ? 0 : calmRef.current ? (COUNTDOWN - auto.left) / COUNTDOWN : auto.progress;
      if (p !== fill) {
        fill = p;
        enterRef.current?.style.setProperty("--cd", p.toFixed(4));
      }

      // pointer / tilt, eased; the range name drifts against it
      const t = tilt.current;
      t.x += (t.tx - t.x) * 0.06;
      t.y += (t.ty - t.y) * 0.06;
      const range = rangeRef.current;
      if (range && !calmRef.current) {
        const px = -t.x * 16;
        const py = -t.y * 5;
        if (Math.abs(px - par.x) > 0.05 || Math.abs(py - par.y) > 0.05) {
          par = { x: px, y: py };
          range.style.setProperty("--par-x", `${px.toFixed(2)}px`);
          range.style.setProperty("--par-y", `${py.toFixed(2)}px`);
        }
      }

      // the 3D ground, after the avatar: his voice runs out across it in pulses
      const sc = sceneRef.current;
      if (sc) {
        const muted = talkRef.current === "speaking" && !live ? 0.45 * Math.exp(-(now - wordAt.current) / 280) : 0;
        const target = Math.max(live ? Math.min(1, (sum / BARS) * 1.25) : 0, muted);
        voice += (target - voice) * (target > voice ? 0.35 : 0.07);
        sc.frame(now, { level: voice, tiltX: t.x, tiltY: t.y, reveal: groundReveal.current.v });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [auto, calmRef, talkRef]);

  /* ─── background tab: everything pauses ─── */
  useEffect(() => {
    const onVis = () => {
      auto.hold("hidden", document.hidden);
      const n = narratorRef.current;
      if (!n) return;
      if (document.hidden) n.pause();
      else if (!exiting.current) n.resume();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [auto]);

  /* ─── the countdown holds while he's being read or an overlay is up ─── */
  useEffect(() => {
    auto.hold("transcript", transcript);
  }, [auto, transcript]);
  useEffect(() => {
    auto.hold("overlay", overlay !== null);
  }, [auto, overlay]);
  useEffect(() => () => auto.dispose(), [auto]);

  /* ─── the stage has closed (any way at all): the page is live ─── */
  useEffect(
    () =>
      useApp.subscribe((s) => {
        if (s.phase !== "site" || entered.current) return;
        entered.current = true;
        emit("intro:stage", { phase: "entered" });
      }),
    [],
  );

  /* ─── line of sight: station → the action under the pointer or focus, or a point on the ground ─── */
  const paintSight = useCallback(() => {
    const s = sight.current;
    const line = sightLineRef.current;
    const end = sightEndRef.current;
    const label = sightLabelRef.current;
    const svg = sightSvgRef.current;
    if (!line || !end || !label || !svg) return;
    const x = s.x1 + (s.x2 - s.x1) * s.p;
    const y = s.y1 + (s.y2 - s.y1) * s.p;
    line.setAttribute("x1", s.x1.toFixed(1));
    line.setAttribute("y1", s.y1.toFixed(1));
    line.setAttribute("x2", x.toFixed(1));
    line.setAttribute("y2", y.toFixed(1));
    end.setAttribute("cx", x.toFixed(1));
    end.setAttribute("cy", y.toFixed(1));
    const near = Math.max(0, (s.p - 0.7) / 0.3);
    end.style.opacity = near.toFixed(3);
    label.style.opacity = near.toFixed(3);
    svg.style.opacity = s.p > 0.001 ? "1" : "0";
  }, []);

  /** Draw the line to (x2, y2), stage px. `el` is the action it points at (null: a ground point). */
  const drawSight = useCallback(
    (x2: number, y2: number, el: HTMLElement | null, fresh: boolean) => {
      const s = sight.current;
      const root = rootRef.current;
      const st = stationRef.current;
      const label = sightLabelRef.current;
      if (!root || !st || !label) return;
      gsap.killTweensOf(s);
      const R = root.getBoundingClientRect();
      const a = st.getBoundingClientRect();
      s.x1 = a.left + a.width / 2 - R.left;
      s.y1 = a.top + a.height / 2 - R.top;
      s.x2 = x2;
      s.y2 = y2;
      // a survey reading: the bearing from the station, clockwise from sheet north (up)
      const brg = ((Math.atan2(s.x2 - s.x1, -(s.y2 - s.y1)) * 180) / Math.PI + 360) % 360;
      label.textContent = `${brg.toFixed(1).padStart(5, "0")}°`;
      label.setAttribute("x", (s.x2 - 10).toFixed(1));
      label.setAttribute("y", (s.y2 - 12).toFixed(1));
      if (fresh) s.p = 0;
      s.el = el;
      if (calm) {
        s.p = 1;
        paintSight();
        return;
      }
      gsap.to(s, { p: 1, duration: 0.65, ease: "expo.out", onUpdate: paintSight, onComplete: paintSight });
    },
    [calm, paintSight],
  );

  const aimSight = useCallback(
    (el: HTMLElement | null) => {
      const s = sight.current;
      const root = rootRef.current;
      if (!root || exiting.current || !settled.current) return;
      window.clearTimeout(pointTimer.current);
      if (!el) {
        gsap.killTweensOf(s);
        s.el = null;
        gsap.to(s, { p: 0, duration: calm ? 0 : 0.35, ease: "expo.out", onUpdate: paintSight, onComplete: paintSight });
        return;
      }
      const R = root.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      drawSight(b.left - 12 - R.left, b.top + b.height / 2 - R.top, el, s.el !== el);
    },
    [calm, paintSight, drawSight],
  );
  useEffect(() => {
    aimSightRef.current = aimSight;
  }, [aimSight]);

  const sightProps = {
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return;
      sight.current.hover = e.currentTarget;
      aimSight(e.currentTarget);
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return;
      sight.current.hover = null;
      aimSight(auto.state === "running" ? enterRef.current : null);
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(":focus-visible")) aimSight(e.currentTarget);
    },
    onBlur: () => {
      if (!sight.current.hover) aimSight(null);
    },
  };

  /** The other options hold the countdown while the visitor hovers or keyboard-focuses them. */
  const holdOn = (reason: HoldReason, on: boolean) => auto.hold(reason, on);
  const optionProps = {
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      sightProps.onPointerEnter(e);
      if (e.pointerType === "mouse") holdOn("hover", true);
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") holdOn("hover", false);
      sightProps.onPointerLeave(e);
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      sightProps.onFocus(e);
      if (e.currentTarget.matches(":focus-visible")) holdOn("focus", true);
    },
    onBlur: () => {
      holdOn("focus", false);
      sightProps.onBlur();
    },
  };

  /* ─── "my résumé's right here": he looks at the résumé, so does the line of sight ─── */
  useEffect(() => {
    const w = tracks[pos.line]?.words[pos.word];
    if (!w || !/r[ée]sum[ée]/i.test(w.text)) return;
    const key = `${pos.line}:${pos.word}`;
    const a = autoSight.current;
    if (a.key === key) return;
    a.key = key;
    if (sight.current.hover && sight.current.hover !== resumeRef.current) return;
    aimSight(resumeRef.current);
    window.clearTimeout(a.timer);
    a.timer = window.setTimeout(() => {
      if (!sight.current.hover && sight.current.el === resumeRef.current && document.activeElement !== resumeRef.current) aimSight(null);
    }, 2800);
  }, [pos, tracks, aimSight]);

  /* ─── each word he says: the stand-in's sound arcs, and (muted) a pulse across the ground ─── */
  useEffect(() => {
    if (talk !== "speaking" || pos.word < 0) return;
    wordAt.current = performance.now();
    if (mode === "placeholder" && sound) standInApi.current?.speak();
  }, [pos, mode, sound, talk]);

  /* ─── leaving: he sinks into the station point, the stage lifts away ─── */
  const exit = useCallback(
    (then?: () => void) => {
      if (exiting.current) return;
      exiting.current = true;
      auto.cancel(true);
      window.clearTimeout(autoSight.current.timer);
      window.clearTimeout(pointTimer.current);
      narratorRef.current?.pause();
      if (speechSupported()) window.speechSynthesis.cancel();
      const done = () => {
        (document.activeElement as HTMLElement | null)?.blur?.();
        useApp.getState().setPhase("site");
        then?.();
      };
      const root = rootRef.current;
      if (!root) return done();
      if (calm) {
        gsap.to(root, { autoAlpha: 0, duration: 0.4, ease: "none", overwrite: "auto", onComplete: done });
        return;
      }
      const q = gsap.utils.selector(root);
      gsap.killTweensOf(reveal.current);
      gsap
        .timeline({ onComplete: done, defaults: { overwrite: "auto" } })
        .to(q("[data-talk], [data-actions], [data-skip], [data-sight], [data-note], [data-range], [data-hint]"), { autoAlpha: 0, duration: 0.25, ease: "none" }, 0)
        .to(q("[data-sink]"), { scaleY: 0.02, scaleX: 0.35, duration: 0.55, ease: "expo.in" }, 0)
        .to(q("[data-sink]"), { autoAlpha: 0, duration: 0.1, ease: "none" }, 0.5)
        .to(q("[data-shadow]"), { scaleX: 0.2, autoAlpha: 0, duration: 0.45, ease: "expo.in" }, 0.15)
        .to(q("[data-fix]"), { scale: 1.9, autoAlpha: 0, duration: 0.5, ease: "expo.out" }, 0.55)
        .to(q("[data-trig], [data-ground-line]"), { autoAlpha: 0, duration: 0.3, ease: "none" }, 0.5)
        .to(root, { yPercent: -100, duration: 0.8, ease: "expo.inOut" }, 0.6);
    },
    [calm, auto],
  );

  /* ─── the countdown, on screen: the line of sight goes to the way in while it runs; time's up enters ─── */
  useEffect(() => {
    auto.connect({
      view: (v) => {
        setCd(v);
        const s = sight.current;
        const enter = enterRef.current;
        if (!enter || s.hover) return;
        if (v.state === "running" && s.el !== enter && document.activeElement !== resumeRef.current) aimSight(enter);
        else if ((v.state === "off" || v.state === "idle") && s.el === enter) aimSight(null);
      },
      fire: () => exit(),
    });
  }, [auto, aimSight, exit]);

  /* ─── mount: lift the greeting's veil once painted. Keyboard visitors land on the résumé;
     everyone else on the dialog itself (no ring), and their first Tab goes to the résumé ─── */
  useEffect(() => {
    if (entry.keyboard) resumeRef.current?.focus({ preventScroll: true });
    else rootRef.current?.focus({ preventScroll: true });
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => dropVeil());
    });
    const a = autoSight.current;
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      window.clearTimeout(a.timer);
      window.clearTimeout(savedTimer.current);
      window.clearTimeout(pointTimer.current);
      dropVeil();
    };
  }, []);

  /* ─── the spawn ─── */
  useGSAP(
    () => {
      const root = rootRef.current!;
      const q = gsap.utils.selector(root);
      const R = reveal.current;
      const G = groundReveal.current;
      const replay = !document.querySelector("[data-intro-veil]");
      // the real clips start as he resolves (the wave plays while he appears); the stand-in talks after
      const realNow = () => {
        if (manifestRef.current) cueTalk();
      };
      if (calm) {
        R.v = 1;
        G.v = 1;
        applyReveal();
        // opacity only: a visibility-hidden dialog could not take focus on mount
        gsap.from(root, { opacity: 0, duration: 0.45, ease: "none" });
        gsap.delayedCall(0.35, cueTalk);
        gsap.delayedCall(0.45, settle);
        return;
      }
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      if (replay) tl.from(q("[data-ground]"), { autoAlpha: 0, duration: 0.45, ease: "none" }, 0);
      tl.from(q("[data-range-l]"), { xPercent: -28, autoAlpha: 0, duration: 1.3 }, 0)
        .from(q("[data-range-r]"), { xPercent: 28, autoAlpha: 0, duration: 1.3 }, 0)
        .from(q("[data-fix]"), { scale: 2.4, autoAlpha: 0, duration: 0.6 }, 0.08)
        .from(q("[data-trig]"), { scale: 0, autoAlpha: 0, duration: 0.5 }, 0.16)
        .fromTo(q("[data-ripple]"), { scale: 0.04, autoAlpha: 0.95 }, { scale: 1, autoAlpha: 0, duration: 1.5, stagger: 0.15 }, 0.16)
        .fromTo(q("[data-field]"), { "--field-r": "0%" }, { "--field-r": "72%", duration: 2, ease: "expo.out" }, 0.22)
        .fromTo(G, { v: 0 }, { v: 1, duration: 2.6, ease: "power2.out" }, 0.22)
        .from(q("[data-ground-line]"), { scaleX: 0, duration: 1.1 }, 0.25)
        .from(q("[data-shadow]"), { scaleX: 0.15, autoAlpha: 0, duration: 0.9 }, 0.42)
        .to(q("[data-coords]"), { duration: 0.9, scrambleText: { text: HOME_DMS, chars: "0123456789", speed: 0.6 } }, 0.3)
        .add(realNow, 0.5)
        .fromTo(q("[data-scan]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, ease: "none" }, 0.52)
        // the scan starts at his soles, not at the frame's bottom edge
        .add(() => {
          R.v = Math.min(0.2, parseFloat(getComputedStyle(root).getPropertyValue("--foot")) || 0);
          applyReveal();
        }, 0.52)
        .to(R, { v: 1, duration: 1.3, ease: "expo.inOut", onUpdate: applyReveal, onComplete: applyReveal }, 0.55)
        .to(q("[data-scan]"), { autoAlpha: 0, duration: 0.35, ease: "none" }, 1.82)
        .from(q("[data-talk] > *"), { y: 14, opacity: 0, duration: 0.8, stagger: 0.07 }, 0.95)
        .from(q("[data-action]"), { x: 28, opacity: 0, duration: 0.9, stagger: 0.07 }, 1.05)
        .from(q("[data-note]"), { opacity: 0, duration: 0.6, ease: "none" }, 1.5)
        .add(cueTalk, 1.75)
        .add(settle, 1.95);
    },
    { scope: rootRef },
  );

  /* ─── subtle life: he turns a few degrees toward the pointer ─── */
  useEffect(() => {
    const el = figureRef.current;
    const st = stationRef.current;
    if (!el || !st || !fine || calm) return;
    gsap.set(el, { transformPerspective: 1600, transformOrigin: "50% 94%" });
    const rx = gsap.quickTo(el, "rotationX", { duration: 1, ease: "expo.out" });
    const ry = gsap.quickTo(el, "rotationY", { duration: 1, ease: "expo.out" });
    const move = (e: PointerEvent) => {
      if (exiting.current) return;
      const a = st.getBoundingClientRect();
      const cy = a.top - el.offsetHeight * 0.62;
      const dx = (e.clientX - a.left) / window.innerWidth;
      const dy = (e.clientY - cy) / window.innerHeight;
      ry(gsap.utils.clamp(-7, 7, dx * 15));
      rx(gsap.utils.clamp(-3.5, 3.5, -dy * 7));
    };
    const leave = () => {
      rx(0);
      ry(0);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      gsap.killTweensOf(el);
      gsap.set(el, { rotationX: 0, rotationY: 0 });
    };
  }, [fine, calm]);

  /* ─── the ground swings round his station with the pointer, or with the phone's tilt ─── */
  useEffect(() => {
    if (calm) return;
    const t = tilt.current;
    const clamp = gsap.utils.clamp(-1, 1);
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      t.tx = clamp((e.clientX / window.innerWidth) * 2 - 1);
      t.ty = clamp((e.clientY / window.innerHeight) * 2 - 1);
    };
    const leave = () => {
      t.tx = 0;
      t.ty = 0;
    };
    // the phone's tilt, where it needs no permission prompt (never on iOS: no prompt on a stage)
    type Orient = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
    const DOE = (window as Window & { DeviceOrientationEvent?: Orient }).DeviceOrientationEvent;
    const gyro = !fine && !!DOE && typeof DOE.requestPermission !== "function";
    let base: { b: number; g: number } | null = null;
    const orient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      base ??= { b: e.beta, g: e.gamma };
      t.tx = clamp((e.gamma - base.g) / 18);
      t.ty = clamp((e.beta - base.b) / 18);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    if (gyro) window.addEventListener("deviceorientation", orient);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("deviceorientation", orient);
      t.tx = 0;
      t.ty = 0;
    };
  }, [calm, fine]);

  /* ─── keyboard: Esc enters the site, Tab stays inside the stage ─── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(root.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")).filter(
        (el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!e.shiftKey && active === root && resumeRef.current) {
        e.preventDefault();
        resumeRef.current.focus();
        return;
      }
      const outside = !root.contains(active) || active === root;
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exit]);

  /* ─── voice on by default: once the browser has held it, the first tap or key anywhere restores it ─── */
  useEffect(() => {
    if (!held) return;
    const wake = (e: Event) => {
      // the voice controls handle their own clicks (toggleVoice)
      if (e.target instanceof Element && e.target.closest("[data-voice-control]")) return;
      if (e instanceof KeyboardEvent && (e.key === "Escape" || e.key === "Tab")) return;
      unlockMedia(); // inside the gesture
      narratorRef.current?.setSound(true);
      setHeld(false);
    };
    window.addEventListener("click", wake, true);
    window.addEventListener("keydown", wake, true);
    return () => {
      window.removeEventListener("click", wake, true);
      window.removeEventListener("keydown", wake, true);
    };
  }, [held]);

  /* ─── actions ─── */
  const toggleVoice = () => {
    // held by the browser: this click is the gesture that lets him speak
    const next = held ? true : !useApp.getState().sound;
    if (next) unlockMedia(); // inside the click: resumes audio, blesses the clips
    narratorRef.current?.setSound(next);
    useApp.getState().setSound(next);
    setHeld(false);
  };

  const onAvatar = () => {
    if (exiting.current) return;
    if (narratorRef.current?.wave()) return;
    if (talk !== "idle" || calm) return;
    // the stand-in has no wave: the station pings and the fix re-locks
    const root = rootRef.current;
    if (!root) return;
    const q = gsap.utils.selector(root);
    gsap.fromTo(q("[data-ripple]"), { scale: 0.04, autoAlpha: 0.9 }, { scale: 1, autoAlpha: 0, duration: 1.3, stagger: 0.14, ease: "expo.out" });
    gsap.fromTo(q("[data-fix]"), { scale: 1.7 }, { scale: 1, duration: 0.6, ease: "expo.out" });
  };

  const onResume = () => {
    auto.cancel(); // an explicit choice: no auto-enter now
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 4200);
  };

  /** A tap on open ground: a ping ring there, and a bearing from his station to it. */
  const onGround = (e: ReactPointerEvent<HTMLDivElement>) => {
    const sc = sceneRef.current;
    const root = rootRef.current;
    if (!sc || !root || exiting.current || !settled.current || calm) return;
    if ((e.target as Element).closest("button, a, [data-talk], [data-actions]")) return;
    const R = root.getBoundingClientRect();
    const x = e.clientX - R.left;
    const y = e.clientY - R.top;
    if (!sc.ping(x, y, performance.now()) || sight.current.hover) return;
    drawSight(x, y, null, true);
    gsap.fromTo(root.querySelectorAll("[data-fix]"), { scale: 1.5 }, { scale: 1, duration: 0.6, ease: "expo.out" });
    window.clearTimeout(pointTimer.current);
    pointTimer.current = window.setTimeout(() => {
      if (!sight.current.hover && !sight.current.el) aimSight(auto.state === "running" ? enterRef.current : null);
    }, 1900);
  };

  /* ─── captions ─── */
  const show = (() => {
    if (pos.line < 0) return null;
    const t = tracks[pos.line];
    if (!t) return null;
    const cue = pos.word >= 0 ? t.words[pos.word].cue : -1;
    if (cue >= 0) return { line: pos.line, upTo: cue, past: false };
    if (pos.line > 0) return { line: pos.line - 1, upTo: tracks[pos.line - 1].cues.length - 1, past: true };
    return null;
  })();

  const status =
    talk === "speaking" ? (audible ? "Speaking" : "Speaking · muted") : talk === "waving" ? "Waving" : talk === "idle" ? "Standing by" : "Arriving";
  const voiceSub = held
    ? "Your browser holds sound until you tap"
    : mode === "real"
      ? "Starts his lines again, with sound"
      : "Read aloud by your browser";
  const counting = cd.state === "running" || cd.state === "held";
  const enterSub = cd.state === "running" ? `Opens by itself in ${cd.left} s` : cd.state === "held" ? `Paused · ${cd.left} s left` : "Projects, experience, booking";
  const enterLive =
    cd.state === "running" ? `Entering the site in ${COUNTDOWN} seconds. Hover or focus another option to stay.` : cd.state === "held" ? "Paused." : "";
  // field notes once he has finished: the avatar waves on a tap; the ground takes a bearing
  const notes = spoken && !counting ? "both" : spoken ? "avatar" : null;

  return (
    <div
      ref={rootRef}
      className={styles.stage}
      role="dialog"
      aria-modal="true"
      aria-label="Meet Lakshya Jain"
      aria-describedby="intro-transcript"
      tabIndex={-1}
      data-mode={mode}
      data-calm={calm ? "" : undefined}
      data-3d={on3D ? "" : undefined}
      onPointerDown={onGround}
    >
      <div className={styles.clip}>
        <div data-ground className={styles.ground} aria-hidden="true" />

        {use3D ? <canvas ref={sceneCanvasRef} className={styles.scene} data-on={scene3d ? "" : undefined} aria-hidden="true" /> : null}

        <svg data-field className={styles.field} viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <g className={styles.fieldMinor}>
            {field.minor.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <g className={styles.fieldIndex}>
            {field.index.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </svg>

        <div ref={rangeRef} data-range className={styles.range} aria-hidden="true">
          <span data-range-l>Lakshya</span>
          <span data-range-r>Jain</span>
        </div>

        <svg ref={sightSvgRef} data-sight className={styles.sight} aria-hidden="true">
          <line ref={sightLineRef} className={styles.sightLine} />
          <circle ref={sightEndRef} className={styles.sightEnd} r="3.5" />
          <text ref={sightLabelRef} className={styles.sightLabel} textAnchor="end" />
        </svg>

        {/* ── left third: the station and the avatar ── */}
        <span data-ground-line className={styles.groundLine} aria-hidden="true" />
        <span ref={stationRef} className={styles.station} aria-hidden="true">
          <svg className={styles.ripples} viewBox="-100 -40 200 80">
            {[0, 1, 2].map((i) => (
              <ellipse key={i} data-ripple className={styles.ripple} cx="0" cy="0" rx="99" ry="39" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <span data-shadow className={styles.shadow} />
          <svg data-fix className={styles.fix} viewBox="-40 -40 80 80" preserveAspectRatio="none">
            <path d="M-19 -11V-19H-11M11 -19H19V-11M19 11V19H11M-11 19H-19V11" />
            <path d="M-38 0H-27M27 0H38M0 -38V-27M0 27V38" />
          </svg>
          <svg data-trig className={styles.trig} viewBox="-10 -10 20 20">
            <path d="M0 -7.5L6.8 4.5H-6.8Z" />
            <circle r="1.5" />
          </svg>
        </span>

        <div ref={figureRef} data-figure className={styles.figure}>
          <div data-sink className={styles.sink}>
            <button
              ref={frameRef}
              type="button"
              className={styles.frame}
              data-idle={talk === "idle" ? "" : undefined}
              data-guide="intro-avatar"
              onClick={onAvatar}
              aria-label={mode === "real" ? "Lakshya Jain. Click to get a wave." : "Lakshya Jain’s stand-in"}
            >
              {mode === "real" && glOk ? <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" /> : null}
              {mode === "real" && !glOk && manifest?.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.poster} src={manifest.poster} alt="" decoding="async" />
              ) : null}
              {mode === "placeholder" ? <ContourPortrait calm={calm} apiRef={standInApi} /> : null}
              <span data-scan className={styles.scan} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* field notes for what's tappable, once he's said his piece */}
        <p data-hint className={styles.hintAvatar} data-show={notes ? "" : undefined} aria-hidden="true">
          <svg viewBox="0 0 40 24" className={styles.hintArrow}>
            <path d="M38 4C28 3 14 6 5 18M5 18l1.5-7.5M5 18l7.2-2.6" />
          </svg>
          {mode === "real" ? "tap him, he waves back" : "tap him"}
        </p>
        {on3D ? (
          <p data-hint className={styles.hintGround} data-show={notes === "both" ? "" : undefined} aria-hidden="true">
            tap the ground to take a bearing
          </p>
        ) : null}

        <p data-note className={styles.stationNote} aria-hidden="true">
          <span className={styles.stationName}>
            <svg viewBox="-10 -10 20 20" className={styles.trigGlyph}>
              <path d="M0 -7.5L6.8 4.5H-6.8Z" />
              <circle r="1.5" />
            </svg>
            Delhi
          </span>
          <span data-coords className={styles.coords}>
            {HOME_DMS}
          </span>
        </p>
        {mode === "placeholder" ? (
          <p data-note className={styles.standInNote}>
            Stand-in · his recording is on its way
          </p>
        ) : null}

        {/* ── middle: what he says ── */}
        <section data-talk className={styles.talk} aria-label="What he says">
          <div className={styles.speaker}>
            <p className={styles.who}>
              <span>Lakshya Jain</span>
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
              <span className={styles.state} data-state={talk === "speaking" && audible ? "live" : undefined}>
                {status}
              </span>
            </p>
            <span ref={barsRef} className={styles.meter} aria-hidden="true">
              {Array.from({ length: BARS }, (_, i) => (
                <span key={i} />
              ))}
            </span>
            <button
              type="button"
              className={styles.transcriptBtn}
              aria-expanded={transcript}
              aria-controls="intro-transcript-panel"
              onClick={() => setTranscript((o) => !o)}
            >
              Transcript
            </button>
          </div>

          <div className={styles.captions} aria-hidden="true">
            {show ? (
              <p className={styles.captionText} data-past={show.past ? "" : undefined}>
                {tracks[show.line].cues.slice(0, show.upTo + 1).map((c, ci) => {
                  const now = !show.past && ci === show.upTo;
                  return (
                    <Fragment key={`${show.line}-${ci}`}>
                      {ci ? " " : null}
                      <span className={styles.cue} data-now={now ? "" : undefined}>
                        {now
                          ? tracks[show.line].words.slice(c.first, c.last + 1).map((w, k) => (
                              <Fragment key={k}>
                                {k ? " " : null}
                                <span className={styles.w} data-on={c.first + k <= pos.word ? "" : undefined}>
                                  {w.text}
                                </span>
                              </Fragment>
                            ))
                          : tracks[show.line].words
                              .slice(c.first, c.last + 1)
                              .map((w) => w.text)
                              .join(" ")}
                      </span>
                    </Fragment>
                  );
                })}
              </p>
            ) : null}
          </div>

          {voiceAvailable && !audible ? (
            <button type="button" className={styles.voiceCta} onClick={toggleVoice} data-voice-control>
              <span className={styles.puck}>
                <Icon name="volume" size={18} />
              </span>
              <span className={styles.vtext}>
                <strong>{held ? "Tap anywhere to hear him" : "Turn on his voice"}</strong>
                <small>{voiceSub}</small>
              </span>
            </button>
          ) : null}

          {transcript ? (
            <div id="intro-transcript-panel" className={styles.transcriptPanel} data-lenis-prevent>
              {tracks.map((t, i) => (
                <p key={i}>{t.text}</p>
              ))}
            </div>
          ) : null}
        </section>

        <p id="intro-transcript" className="visually-hidden">
          Transcript: {tracks.map((t) => t.text).join(" ")}
        </p>

        {/* ── right third: the résumé first, then the way in ── */}
        <nav data-actions className={styles.actions} aria-label="Where next">
          <a
            ref={resumeRef}
            data-action
            data-guide="intro-resume"
            className={styles.resume}
            href={PROFILE.resumePath}
            download={RESUME_FILE}
            onClick={onResume}
            {...optionProps}
          >
            <span className={styles.resumeIcon}>
              <Icon name={saved ? "check" : "download"} size={22} />
            </span>
            <span className={styles.resumeText}>
              <strong>Download résumé</strong>
              <small>{saved ? "Saved · check your downloads" : "PDF · 2 pages"}</small>
            </span>
          </a>

          <button
            ref={enterRef}
            data-action
            data-guide="intro-enter"
            data-count={counting ? cd.state : undefined}
            type="button"
            className={styles.enter}
            style={{ "--ring": `${RING.toFixed(2)}px` } as CSSProperties}
            aria-describedby="intro-autoenter"
            onClick={() => exit()}
            {...sightProps}
          >
            <span className={styles.enterFill} aria-hidden="true" />
            <span className={styles.enterText}>
              <strong>Enter the site</strong>
              <small aria-hidden="true">{enterSub}</small>
            </span>
            <span className={styles.enterPuck} aria-hidden="true">
              <svg viewBox="0 0 44 44" className={styles.ring}>
                <circle className={styles.ringTrack} cx="22" cy="22" r="19" />
                <circle className={styles.ringRun} cx="22" cy="22" r="19" />
              </svg>
              {counting ? <span className={styles.secs}>{cd.left}</span> : <Icon name="arrow-right" size={20} />}
            </span>
          </button>
          <p id="intro-autoenter" className="visually-hidden" aria-live="polite">
            {enterLive}
          </p>

          <div data-action className={styles.minor}>
            <button
              type="button"
              className={styles.small}
              data-guide="intro-terminal"
              onClick={() => exit(() => useApp.getState().openOverlay("terminal"))}
              {...optionProps}
            >
              <Icon name="terminal" size={16} />
              <span>Field terminal</span>
            </button>
            <button type="button" className={styles.small} data-guide="intro-snake" onClick={() => exit(() => useApp.getState().startGame("snake"))} {...optionProps}>
              <Icon name="play" size={16} />
              <span>Play snake</span>
            </button>
            {voiceAvailable ? (
              <button type="button" className={styles.small} aria-pressed={audible} onClick={toggleVoice} data-voice-control {...optionProps}>
                <Icon name={audible ? "volume" : "mute"} size={16} />
                <span>{audible ? "Voice on" : "Voice off"}</span>
              </button>
            ) : null}
          </div>
        </nav>

        <button type="button" data-skip className={styles.skip} onClick={() => exit()}>
          <span>Skip</span>
          <kbd>Esc</kbd>
        </button>
      </div>

      <svg className={styles.skirt} viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
        <path className={styles.skirtFill} d={SKIRT.fill} />
        <path className={styles.skirtEdge} d={SKIRT.edge} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
