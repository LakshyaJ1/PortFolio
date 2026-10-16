"use client";

// The hellos. Twelve greetings at twelve coordinates: a GNSS receiver slewing between fixes on a
// dot-plotted world, landing back on Delhi with a crosshair lock. The first frame is server-rendered
// (नमस्ते at Delhi), so it paints before any JS; everything after that is enhancement.
// Then the gate: "Tap anywhere to meet Lakshya". That tap (or Enter/Space) is the gesture browsers
// require for sound, so its handler turns his voice on and unlocks the clips before the stage
// begins. No answer within GATE_WAIT and the stage starts anyway, muted.

import { useEffect, useRef, type CSSProperties } from "react";
import gsap from "gsap";
import { GREETINGS, type LatLng } from "@/content/profile";
import { emit } from "@/lib/events";
import { formatDMS } from "@/lib/geo";
import { useApp } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { loadHeroManifest, prefetchHero } from "./manifest";
import { entry, unlockMedia } from "./media";
import { raiseVeil } from "./veil";
import "./replay"; // wires `intro:replay` once at boot
import {
  DOT_PITCH,
  GRATICULE,
  LAND_PATH,
  MERIDIAN_LABELS,
  PARALLEL_LABELS,
  VIEWBOX,
  latLabel,
  legPath,
  lngLabel,
  slerp,
} from "./world";
import styles from "./Greeting.module.css";

const LANG: Record<string, string> = {
  Hindi: "hi",
  English: "en",
  Spanish: "es",
  French: "fr",
  Japanese: "ja",
  Italian: "it",
  Portuguese: "pt",
  Korean: "ko",
  German: "de",
  Turkish: "tr",
  Arabic: "ar",
  Mandarin: "zh",
};

const HOME = GREETINGS[0];
const N = GREETINGS.length;

// Timing (seconds). The first hello holds (minus however long the SSR frame has already been on
// screen), then each fix lands every STEP, and the last leg returns to Delhi. TEMPO stretches every
// hold and transition of the hellos together. Lakshya asked for "about a second longer" so each hello
// registers: 1.4 takes the run from ~2.7 s to ~3.8 s.
const TEMPO = 1.4;
const FIRST = 0.9 * TEMPO;
const STEP = 0.13 * TEMPO;
const SLEW = 0.13 * TEMPO;
const LOCK_HOLD = 0.22 * TEMPO;
/** ms the gate waits for a tap before the stage starts without sound */
const GATE_WAIT = 6000;

// Moving-map pan on narrow screens: keep the fix within ±DEADBAND° of the view centre.
const DEADBAND = 24;
function panPlan() {
  let c = HOME.coords.lng;
  const plan = [c];
  for (let k = 1; k <= N; k++) {
    const lng = GREETINGS[k % N].coords.lng;
    if (k === N) c = lng; // centre Delhi for the lock
    else if (lng - c > DEADBAND) c = lng - DEADBAND;
    else if (c - lng > DEADBAND) c = lng + DEADBAND;
    plan.push(c);
  }
  return plan;
}
const PAN = panPlan();

const STATIONS = GREETINGS.map(({ coords: { lat, lng } }) => `M${lng - 0.7} ${-lat}h1.4M${lng} ${-lat - 0.7}v1.4`).join("");

/** The flowing bottom edge of the lifting panel: three nested contours, amplitude `a` (0–1). */
function wave(u: number, a: number, ph: number) {
  const s =
    0.6 * Math.sin(Math.PI * 2 * 1.1 * u + ph + 0.4) +
    0.3 * Math.sin(Math.PI * 2 * 2.6 * u + 1.7 - ph * 0.7) +
    0.1 * Math.sin(Math.PI * 2 * 5.2 * u + 0.3 + ph * 1.3);
  return a * 44 * s;
}
function skirtPaths(a: number, ph: number) {
  const n = 48;
  const line = (base: number, k: number) => {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      d += `${i ? "L" : "M"}${(u * 1000).toFixed(1)} ${(base + wave(u, a * k, ph + (1 - k))).toFixed(2)}`;
    }
    return d;
  };
  const edge = line(50, 1);
  return {
    fill: `M0 0${edge.replace(/^M/, "L")}L1000 0Z`,
    edge,
    inner1: line(36, 0.82),
    inner2: line(22, 0.62),
  };
}
const FLAT = skirtPaths(0, 0);

export function Greeting() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
    const panel = q<HTMLDivElement>("[data-panel]");
    const world = q<HTMLDivElement>("[data-world]");
    const marker = q<HTMLDivElement>("[data-marker]");
    const pip = q<HTMLSpanElement>("[data-pip]");
    const ping = q<HTMLSpanElement>("[data-ping]");
    const lock = q<SVGSVGElement>("[data-lock]");
    const trail = q<SVGPathElement>("[data-trail]");
    const live = q<SVGPathElement>("[data-live]");
    const plumb = q<SVGGElement>("[data-plumb]");
    const plumbLine = q<SVGLineElement>("[data-plumb] line");
    const plumbEnd = q<SVGCircleElement>("[data-plumb] circle");
    const words = Array.from(root.querySelectorAll<HTMLElement>("[data-word]"));
    const wordBox = q<HTMLDivElement>("[data-words]");
    const place = q<HTMLSpanElement>("[data-place]");
    const coords = q<HTMLSpanElement>("[data-coords]");
    const count = q<HTMLSpanElement>("[data-count]");
    const status = q<HTMLSpanElement>("[data-status]");
    const gate = q<HTMLDivElement>("[data-gate]");
    const gateBtn = q<HTMLButtonElement>("[data-gate-btn]");
    const gateTimer = q<HTMLSpanElement>("[data-gate-timer]");
    const collar = q<HTMLDivElement>("[data-collar]");
    const skirt = {
      svg: q<SVGSVGElement>("[data-skirt]"),
      fill: q<SVGPathElement>("[data-skirt-fill]"),
      edge: q<SVGPathElement>("[data-skirt-edge]"),
      inner1: q<SVGPathElement>("[data-skirt-i1]"),
      inner2: q<SVGPathElement>("[data-skirt-i2]"),
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = window.matchMedia("(max-width: 720px)").matches;

    // Warm the next stage while the hellos run: the manifest, the clips (one primed <video> each)
    // and the stage chunk. In placeholder mode, trace the stand-in figure (~100–150 ms of CPU)
    // during the static first hold rather than when the stage mounts.
    prefetchHero();
    let slewing = false;
    void Promise.all([loadHeroManifest(), import("./Intro").then(() => import("./portrait"))])
      .then(([m, portrait]) => {
        if (!m && !slewing) portrait.buildPortrait();
      })
      .catch(() => {});
    // the stage's 3D ground: its height field bakes in idle slices (no frame cost), its renderer warms
    if (!useApp.getState().plain) {
      void import("./stageTerrain").then((t) => t.bakeGround()).catch(() => {});
      void import("./stageScene").catch(() => {});
    }

    // How long has the server-rendered frame already been on screen?
    const paint = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint");
    const shown = paint ? Math.max(0, (performance.now() - paint.startTime) / 1000) : 0;

    let finished = false;
    let exiting = false;
    let current = 0;
    let trailD = "";
    // hellos → gate → leaving
    let stage: "hellos" | "gate" | "leaving" = "hellos";
    let autoGo = 0;
    let keyboard = false; // the visitor is using the keyboard: the gate takes focus
    const finish = () => {
      if (finished) return;
      finished = true;
      raiseVeil();
      useApp.getState().setPhase("intro");
    };

    const setFix = (p: LatLng) => {
      marker.style.setProperty("--lng", p.lng.toFixed(4));
      marker.style.setProperty("--lat", p.lat.toFixed(4));
    };
    const setPan = (c: number) => world.style.setProperty("--pc", c.toFixed(3));

    const drawPlumb = () => {
      const pr = panel.getBoundingClientRect();
      const mr = pip.getBoundingClientRect();
      const wr = wordBox.getBoundingClientRect();
      const x1 = mr.left + mr.width / 2 - pr.left;
      const y1 = mr.top + mr.height / 2 - pr.top;
      const x2 = wr.left + wr.width / 2 - pr.left;
      const y2 = wr.top - pr.top - 6;
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const gap = Math.min(14, dist / 3);
      const ux = (x2 - x1) / (dist || 1);
      const uy = (y2 - y1) / (dist || 1);
      plumbLine.setAttribute("x1", (x1 + ux * gap).toFixed(1));
      plumbLine.setAttribute("y1", (y1 + uy * gap).toFixed(1));
      plumbLine.setAttribute("x2", x2.toFixed(1));
      plumbLine.setAttribute("y2", y2.toFixed(1));
      plumbEnd.setAttribute("cx", x2.toFixed(1));
      plumbEnd.setAttribute("cy", y2.toFixed(1));
    };

    const showWord = (i: number, animate: boolean) => {
      if (i === current && animate) return;
      const prev = words[current];
      const next = words[i];
      current = i;
      const g = GREETINGS[i];
      place.textContent = `${g.lang} · ${g.city}`;
      if (prev !== next) {
        gsap.killTweensOf(prev);
        gsap.set(prev, { autoAlpha: 0 });
      }
      if (animate) gsap.fromTo(next, { autoAlpha: 0, yPercent: 16 }, { autoAlpha: 1, yPercent: 0, duration: 0.26 * TEMPO, ease: "expo.out" });
      else gsap.set(next, { autoAlpha: 1, yPercent: 0 });
    };

    const lockOn = (animate: boolean) => {
      status.textContent = "Fix acquired";
      status.dataset.state = "fix";
      count.textContent = `${N}/${N}`;
      coords.textContent = formatDMS(HOME.coords);
      if (!animate) {
        gsap.set(lock, { autoAlpha: 1, scale: 1 });
        return;
      }
      gsap.fromTo(lock, { autoAlpha: 0, scale: 1.9, rotate: -45 }, { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.42 * TEMPO, ease: "expo.out" });
      gsap.fromTo(ping, { scale: 0.6, autoAlpha: 1 }, { scale: 3.4, autoAlpha: 0, duration: 0.7 * TEMPO, ease: "expo.out" });
    };

    const drawSkirt = (a: number, ph: number) => {
      const p = skirtPaths(a, ph);
      skirt.fill.setAttribute("d", p.fill);
      skirt.edge.setAttribute("d", p.edge);
      skirt.inner1.setAttribute("d", p.inner1);
      skirt.inner2.setAttribute("d", p.inner2);
    };

    const exit = () => {
      if (exiting) return;
      exiting = true;
      if (reduce) {
        gsap.to(panel, { autoAlpha: 0, duration: 0.3, ease: "none", onComplete: finish });
        return;
      }
      const lift = window.innerHeight + skirt.svg.getBoundingClientRect().height + 4;
      const prog = { p: 0 };
      drawSkirt(1, 0);
      gsap.to(prog, {
        p: 1,
        duration: 0.55,
        ease: "expo.inOut",
        onUpdate: () => {
          gsap.set(panel, { y: -prog.p * lift });
          drawSkirt(Math.pow(1 - prog.p, 1.25), prog.p * 2.2);
        },
        onComplete: finish,
      });
    };

    // ── the gate: the first tap is the gesture that lets him speak ──────────────
    const openGate = () => {
      if (stage !== "hellos") return;
      stage = "gate";
      gsap.to(collar, { autoAlpha: 0, duration: 0.3, ease: "none" });
      emit("intro:stage", { phase: "gate" });
      gateBtn.tabIndex = 0;
      if (keyboard) gateBtn.focus({ preventScroll: true });
      if (reduce) {
        gsap.set(gate, { autoAlpha: 1 });
      } else {
        gsap.fromTo(gate, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: "expo.out" });
        gsap.fromTo(gateTimer, { scaleX: 1 }, { scaleX: 0, duration: GATE_WAIT / 1000, ease: "none" });
      }
      autoGo = window.setTimeout(() => go(false), GATE_WAIT);
    };

    /** Leave for the stage. With `voice`, this runs inside the visitor's gesture. */
    const go = (voice: boolean) => {
      if (stage !== "gate") return;
      stage = "leaving";
      entry.keyboard = voice && keyboard;
      window.clearTimeout(autoGo);
      gsap.killTweensOf([gate, gateTimer]);
      if (voice) {
        unlockMedia();
        useApp.getState().setSound(true);
      }
      gsap.to(gate, { autoAlpha: 0, duration: 0.2, ease: "none" });
      exit();
    };

    let skip = () => {};
    const onDown = () => {
      keyboard = false;
      if (stage === "hellos") skip();
    };
    // Any click reaching the gate goes in with his voice. That includes the click that skipped the
    // hellos: it is already the gesture browsers need for sound, so the visitor isn't asked to tap twice.
    const onClick = (e: MouseEvent) => {
      if (stage !== "gate") return;
      keyboard = e.detail === 0; // a keyboard or assistive-tech activation of the gate button
      go(true);
    };
    const onKey = (e: KeyboardEvent) => {
      keyboard = true;
      if (stage === "hellos") {
        if (e.key === "Tab" || e.metaKey || e.ctrlKey || e.altKey) return;
        skip();
        // a key press is a gesture too (Escape is not one browsers accept for sound)
        go(e.key !== "Escape");
        return;
      }
      if (stage !== "gate" || e.repeat) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go(true);
      } else if (e.key === "Escape") {
        go(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    const unlisten = () => {
      window.clearTimeout(autoGo);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };

    // ── reduced motion: नमस्ते at Delhi, then the prompt, nothing animated ────────
    if (reduce) {
      gsap.set(plumb, { autoAlpha: 0 });
      lockOn(false);
      const t = window.setTimeout(openGate, Math.max(150, (0.6 * TEMPO - shown) * 1000));
      skip = () => {
        window.clearTimeout(t);
        openGate();
      };
      return () => {
        window.clearTimeout(t);
        unlisten();
        gsap.killTweensOf([panel, gate, collar]);
      };
    }

    // ── full sequence ───────────────────────────────────────────────────────────
    // Receiver noise while the first fix settles: the seconds digits wander, then lock.
    let jitter = 0;
    const noise = () => {
      const j = { lat: HOME.coords.lat + (Math.random() - 0.5) * 0.0016, lng: HOME.coords.lng + (Math.random() - 0.5) * 0.0016 };
      coords.textContent = formatDMS(j);
    };
    jitter = window.setInterval(noise, 90);

    setPan(PAN[0]);
    drawPlumb();
    gsap.ticker.add(drawPlumb);
    gsap.fromTo(plumb, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 * TEMPO, ease: "expo.out" });

    const hold = Math.max(0.3 * TEMPO, FIRST - shown);
    const tl = gsap.timeline({ delay: hold });

    for (let k = 1; k <= N; k++) {
      const a = GREETINGS[k - 1].coords;
      const b = GREETINGS[k % N].coords;
      const at = (k - 1) * STEP;
      const proxy = { t: 0 };
      tl.add(() => {
        slewing = true;
        window.clearInterval(jitter);
        live.setAttribute("d", "");
      }, at);
      tl.to(
        proxy,
        {
          t: 1,
          duration: SLEW,
          ease: "expo.out",
          onUpdate: () => {
            const p = slerp(a, b, proxy.t);
            setFix(p);
            coords.textContent = formatDMS(p);
            live.setAttribute("d", legPath(a, b, proxy.t));
          },
          onComplete: () => {
            setFix(b);
            coords.textContent = formatDMS(b);
            trailD += legPath(a, b);
            trail.setAttribute("d", trailD);
            live.setAttribute("d", "");
            count.textContent = `${String(Math.min(k + 1, N)).padStart(2, "0")}/${N}`;
            if (k < N) gsap.fromTo(ping, { scale: 0.6, autoAlpha: 0.9 }, { scale: 2.3, autoAlpha: 0, duration: 0.45 * TEMPO, ease: "expo.out" });
          },
        },
        at,
      );
      if (narrow && PAN[k] !== PAN[k - 1]) {
        const pan = { c: PAN[k - 1] };
        tl.to(pan, { c: PAN[k], duration: SLEW * 1.6, ease: "expo.out", onUpdate: () => setPan(pan.c) }, at);
      }
      tl.add(() => showWord(k % N, true), at + SLEW * 0.35);
    }
    const landed = (N - 1) * STEP + SLEW;
    tl.add(() => lockOn(true), landed);
    tl.add(openGate, landed + LOCK_HOLD);

    // Any key, click or tap during the hellos skips to the end: the Delhi lock, then the gate.
    skip = () => {
      if (stage !== "hellos") return;
      tl.kill();
      window.clearInterval(jitter);
      // complete the survey network instantly
      let all = "";
      for (let k = 1; k <= N; k++) all += legPath(GREETINGS[k - 1].coords, GREETINGS[k % N].coords);
      trail.setAttribute("d", all);
      live.setAttribute("d", "");
      setFix(HOME.coords);
      setPan(HOME.coords.lng);
      showWord(0, false);
      lockOn(false);
      drawPlumb();
      openGate();
    };

    return () => {
      gsap.ticker.remove(drawPlumb);
      window.clearInterval(jitter);
      unlisten();
      tl.kill();
      gsap.killTweensOf([panel, lock, ping, plumb, gate, gateTimer, collar, ...words]);
    };
  }, []);

  const home = HOME.coords;

  return (
    <div ref={rootRef} data-greeting className={styles.root}>
      <div data-panel className={styles.panel}>
        <div className={styles.clip}>
          {/* the map: graticule, dot-plotted land, survey stations, the slew trail and the fix */}
          <div data-world className={styles.world} style={{ "--pc": home.lng } as CSSProperties} aria-hidden="true">
            <svg className={styles.map} viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
              <defs>
                <pattern id="lj-greet-dots" width={DOT_PITCH} height={DOT_PITCH} patternUnits="userSpaceOnUse">
                  <circle className={styles.dot} cx={DOT_PITCH / 2} cy={DOT_PITCH / 2} r={0.24} />
                </pattern>
                <clipPath id="lj-greet-land">
                  <path d={LAND_PATH} clipRule="evenodd" />
                </clipPath>
              </defs>
              <path className={styles.grat} d={GRATICULE.plain} vectorEffect="non-scaling-stroke" />
              <path className={styles.circles} d={GRATICULE.circles} vectorEffect="non-scaling-stroke" />
              <path className={styles.gratIndex} d={GRATICULE.index} vectorEffect="non-scaling-stroke" />
              <rect x={-180} y={-85} width={360} height={150} fill="url(#lj-greet-dots)" clipPath="url(#lj-greet-land)" />
            </svg>
            <svg className={styles.map} viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
              <path className={styles.trail} data-trail d="" vectorEffect="non-scaling-stroke" />
              <path className={styles.stations} d={STATIONS} vectorEffect="non-scaling-stroke" />
              <path className={styles.live} data-live d="" vectorEffect="non-scaling-stroke" />
            </svg>

            {MERIDIAN_LABELS.map((lng) => (
              <span key={lng} className={styles.mer} style={{ "--l": lng } as CSSProperties}>
                {lngLabel(lng)}
              </span>
            ))}

            <div data-marker className={styles.marker} style={{ "--lng": home.lng, "--lat": home.lat } as CSSProperties}>
              <span data-ping className={styles.ping} />
              <span data-pip className={styles.pip} />
              <svg data-lock className={styles.lock} viewBox="-40 -40 80 80">
                <path d="M-19 -11V-19H-11M11 -19H19V-11M19 11V19H11M-11 19H-19V11" />
                <path d="M-38 0H-27M27 0H38M0 -38V-27M0 27V38" />
              </svg>
            </div>
          </div>

          {PARALLEL_LABELS.map((lat) => (
            <span key={lat} className={styles.par} style={{ "--l": lat } as CSSProperties} aria-hidden="true">
              {latLabel(lat)}
            </span>
          ))}

          {/* plumb line from the fix down to the readout */}
          <svg className={styles.overlay} aria-hidden="true">
            <g data-plumb className={styles.plumb}>
              <line x1="0" y1="0" x2="0" y2="0" />
              <circle r="2.5" cx="0" cy="0" />
            </g>
          </svg>

          <div className={styles.label}>
            <div className={styles.art} role="img" aria-label="नमस्ते — hello in twelve languages, from twelve cities, landing on Delhi.">
              <div data-words className={styles.words}>
                {GREETINGS.map((g, i) => (
                  <span
                    key={g.lang}
                    data-word
                    data-on={i === 0 ? "" : undefined}
                    lang={LANG[g.lang]}
                    dir={g.lang === "Arabic" ? "rtl" : undefined}
                    className={styles.word}
                  >
                    {g.word}
                  </span>
                ))}
              </div>
              <p className={styles.readout} aria-hidden="true">
                <span data-place className={styles.place}>
                  {HOME.lang} · {HOME.city}
                </span>
                <span data-coords className={styles.coords}>
                  {formatDMS(home)}
                </span>
                <span className={styles.meta}>
                  <span data-count className={styles.count}>
                    01/{N}
                  </span>
                  <span data-status data-state="acq" className={styles.status}>
                    Acquiring
                  </span>
                </span>
              </p>
            </div>

            {/* the gate: shown once the fix locks on Delhi */}
            <div data-gate className={styles.gate}>
              <button type="button" data-gate-btn className={styles.gateBtn} tabIndex={-1} aria-describedby="lj-gate-hint">
                <span className={styles.hintFine}>Click anywhere to meet Lakshya</span>
                <span className={styles.hintTouch}>Tap anywhere to meet Lakshya</span>
              </button>
              <p id="lj-gate-hint" className={styles.gateHint}>
                <Icon name="volume" size={14} aria-hidden="true" />
                <span>Sound on</span>
                <span className={styles.hintFine} aria-hidden="true">
                  · <kbd>Enter</kbd>
                </span>
              </p>
              <span className={styles.gateTrack} aria-hidden="true">
                <span data-gate-timer className={styles.gateTimer} />
              </span>
            </div>
          </div>

          <div data-collar className={styles.collar} aria-hidden="true">
            <span className={styles.note}>
              <span className={styles.hintFine}>Press any key to skip</span>
              <span className={styles.hintTouch}>Tap to skip</span>
              <span className={styles.proj}>Equirectangular · WGS 84</span>
            </span>
            <span className={styles.scale}>
              <span className={styles.bar} />
              <span className={styles.scaleText}>1000 km at 31°N</span>
            </span>
          </div>
        </div>

        {/* the panel's bottom edge: a contour line that flattens as the panel lifts */}
        <svg data-skirt className={styles.skirt} viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <path data-skirt-fill className={styles.skirtFill} d={FLAT.fill} />
          <path data-skirt-i2 className={styles.skirtInner2} d={FLAT.inner2} vectorEffect="non-scaling-stroke" />
          <path data-skirt-i1 className={styles.skirtInner1} d={FLAT.inner1} vectorEffect="non-scaling-stroke" />
          <path data-skirt-edge className={styles.skirtEdge} d={FLAT.edge} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}
