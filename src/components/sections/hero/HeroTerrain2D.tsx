"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import gsap from "gsap";
import { ContourMap, computeContourMap, placeLabels, type ContourMapData, type MapView } from "@/components/terrain/ContourMap";
import { isoLines, polylinePath } from "@/components/terrain/contours";
import { prefersReducedMotion } from "@/lib/hooks";
import { heroFocus, useHero, type Rect, type RendererApi } from "./heroStore";
import { DENSITY, INDEX_EVERY, getHeroSim, type HeroSim } from "./landscape";
import { TerrainOverlay, type OverlayHandle } from "./TerrainOverlay";
import styles from "./Hero.module.css";

const SLOTS = 4;

/** Plan view framed like the WebGL camera: the target basin at the same spot of the frame. */
function frame2D(w: number, h: number, sim: HeroSim, masks: Rect[]): MapView {
  const aspect = w / Math.max(h, 1);
  const narrow = aspect < 0.85;
  const span = narrow ? 5.4 : Math.min(11.5, Math.max(8, aspect * 6.6));
  const s = w / span;
  const want = heroFocus(w, h, masks);
  const x0 = sim.target.x - (want.x * w) / s;
  const z0 = sim.target.z - (want.y * h) / s;
  return { bounds: { x0, x1: x0 + w / s, z0, z1: z0 + h / s }, width: w, height: h };
}

type Refs2D = {
  data: RefObject<ContourMapData | null>;
  svg: RefObject<SVGSVGElement | null>;
  fix: RefObject<SVGGElement | null>;
  ell: RefObject<SVGEllipseElement | null>;
  lop: RefObject<SVGPathElement | null>;
  lopGrad: RefObject<SVGRadialGradientElement | null>;
  tracks: RefObject<(SVGPolylineElement | null)[]>;
  marbles: RefObject<(SVGCircleElement | null)[]>;
  loop: RefObject<{ raf: number; last: number; seen: number[]; seenIds: number[] }>;
};

/** The SVG renderer's picking, projection and draw loop (the loop only runs while something moves). */
function create2DApi(sim: HeroSim, refs: Refs2D): RendererApi {
  const { data: dataRef, svg: svgRef, fix: fixRef, ell: ellRef, lop: lopRef, lopGrad: lopGradRef, tracks: trackRefs, marbles: marbleRefs, loop } = refs;

  const project = (x: number, z: number) => {
    const d = dataRef.current;
    if (!d) return null;
    const [px, py] = d.project(x, z);
    return { x: px, y: py };
  };
  const pick = (cx: number, cy: number) => {
    const d = dataRef.current;
    const svg = svgRef.current;
    if (!d || !svg) return null;
    const r = svg.getBoundingClientRect();
    const [x, z] = d.unproject(cx - r.left, cy - r.top);
    return { x, z };
  };
  const sample = [0, 0, 0];

  const drawFix = () => {
    const d = dataRef.current;
    const g = fixRef.current;
    const lop = lopRef.current;
    if (!d || !g || !lop) return;
    const ptr = useHero.getState().pointer;
    const hit = ptr.mode === "world" ? { x: ptr.x, z: ptr.z } : ptr.mode === "screen" ? pick(ptr.cx, ptr.cy) : null;
    if (!hit) {
      g.style.opacity = "0";
      lop.style.opacity = "0";
      if (useHero.getState().fix) useHero.getState().setFix(null);
      return;
    }
    sim.field.sample(hit.x, hit.z, sample);
    const grad = Math.hypot(sample[1], sample[2]);
    const [px, py] = d.project(hit.x, hit.z);
    g.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
    g.style.opacity = "1";
    const ell = ellRef.current;
    if (ell) {
      const angle = grad > 1e-4 ? (Math.atan2(sample[1], -sample[2]) * 180) / Math.PI : 0;
      const a = 30;
      const b = a + (10 - a) * Math.min(Math.max(grad * 2.5, 0), 1);
      ell.setAttribute("rx", String(a));
      ell.setAttribute("ry", b.toFixed(1));
      ell.setAttribute("transform", `rotate(${angle.toFixed(1)})`);
    }
    const lines = isoLines(d.grid, sample[0]);
    lop.setAttribute("d", lines.map((l) => polylinePath(l, d.project, { tol: 2 })).join(""));
    lop.style.opacity = "1";
    const grad2 = lopGradRef.current;
    if (grad2) {
      grad2.setAttribute("cx", px.toFixed(1));
      grad2.setAttribute("cy", py.toFixed(1));
    }
    useHero.getState().setFix({ x: hit.x, z: hit.z, loss: sample[0], grad });
  };

  const drawMarbles = () => {
    const d = dataRef.current;
    if (!d) return;
    const st = loop.current;
    for (let i = 0; i < SLOTS; i++) {
      const m = sim.marbles[i];
      const c = marbleRefs.current[i];
      const t = trackRefs.current[i];
      if (!c || !t) continue;
      if (!m) {
        c.style.opacity = "0";
        t.style.opacity = "0";
        st.seenIds[i] = -1;
        continue;
      }
      const [px, py] = d.project(m.opt.x, m.opt.z);
      c.setAttribute("cx", px.toFixed(1));
      c.setAttribute("cy", py.toFixed(1));
      c.setAttribute("r", (5 + (1 - m.drop) * 7).toFixed(2));
      c.style.opacity = String(0.35 + 0.65 * m.drop);
      t.style.opacity = i === sim.marbles.length - 1 ? "1" : "0.5";
      if (st.seenIds[i] !== m.id || st.seen[i] !== m.trackVersion) {
        st.seenIds[i] = m.id;
        st.seen[i] = m.trackVersion;
        let pts = "";
        for (let k = 0; k < m.track.length; k += 2) {
          const [x, y] = d.project(m.track[k], m.track[k + 1]);
          pts += `${x.toFixed(1)},${y.toFixed(1)} `;
        }
        t.setAttribute("points", pts);
      }
    }
  };

  const tick = () => {
    const st = loop.current;
    st.raf = 0;
    const now = performance.now();
    const dt = Math.min((now - st.last) / 1000, 0.05);
    st.last = now;
    const busy = sim.update(dt);
    drawMarbles();
    drawFix();
    if (busy) st.raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    const st = loop.current;
    if (st.raf) return;
    st.last = performance.now();
    st.raf = requestAnimationFrame(tick);
  };
  return { kind: "2d", deform: false, pick, project, wake };
}

/**
 * The static survey sheet: the same loss landscape as a plan-view contour map, for plain
 * mode, reduced motion and devices without WebGL. Marbles still drop and descend (instantly
 * under reduced motion); the fix follows a fine pointer.
 */
export default function HeroTerrain2D() {
  const sim = getHeroSim();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlay = useRef<OverlayHandle>(null);
  const fixRef = useRef<SVGGElement>(null);
  const ellRef = useRef<SVGEllipseElement>(null);
  const lopRef = useRef<SVGPathElement>(null);
  const lopGradRef = useRef<SVGRadialGradientElement>(null);
  const rippleRef = useRef<SVGCircleElement>(null);
  const trackRefs = useRef<(SVGPolylineElement | null)[]>([]);
  const marbleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const masks = useHero((s) => s.masks);

  const version = useSyncExternalStore(
    (cb) => sim.on((e) => e.type === "ground" && cb()),
    () => sim.field.version,
    () => 0,
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // narrow sheets frame the target between the text blocks, so the masks matter there
  const narrow = size ? size.w / Math.max(size.h, 1) < 0.85 : false;
  const frameMasks = narrow ? masks : null;
  const data = useMemo<ContourMapData | null>(
    () =>
      size && size.w > 0 && size.h > 0
        ? computeContourMap(sim.field, frame2D(size.w, size.h, sim, frameMasks ?? []), { interval: 1 / DENSITY, indexEvery: INDEX_EVERY })
        : null,
    // the field is mutable; `version` tracks it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size, sim, version, frameMasks],
  );
  const labeled = useMemo(() => (data ? { ...data, labels: placeLabels(data, { avoid: masks }) } : null), [data, masks]);
  const dataRef = useRef(data);
  useLayoutEffect(() => {
    dataRef.current = data;
  });

  const loop = useRef({ raf: 0, last: 0, seen: [] as number[], seenIds: [] as number[] });
  const apiRef = useRef<RendererApi | null>(null);

  useEffect(() => {
    const api = create2DApi(sim, {
      data: dataRef,
      svg: svgRef,
      fix: fixRef,
      ell: ellRef,
      lop: lopRef,
      lopGrad: lopGradRef,
      tracks: trackRefs,
      marbles: marbleRefs,
      loop,
    });
    apiRef.current = api;
    useHero.getState().setRenderer(api);
    useHero.getState().setReady(true);
    const unsub = useHero.subscribe((s, p) => {
      if (s.pointer !== p.pointer) api.wake();
    });
    const st = loop.current;
    return () => {
      unsub();
      cancelAnimationFrame(st.raf);
      st.raf = 0;
      if (useHero.getState().renderer === api) useHero.getState().setRenderer(null);
      apiRef.current = null;
    };
  }, [sim]);

  // redraw annotations and marbles whenever the map is re-traced
  useEffect(() => {
    const api = apiRef.current;
    if (!data || !api) return;
    loop.current.seen = [];
    overlay.current?.update(api.project);
    api.wake();
  }, [data]);

  // a ring spreads from the middle of the screen when a geocache is found
  useEffect(() => {
    return useHero.subscribe((s, p) => {
      const c = rippleRef.current;
      const wrap = wrapRef.current;
      if (s.ripple === p.ripple || !c || !wrap || prefersReducedMotion()) return;
      const r = wrap.getBoundingClientRect();
      const cx = window.innerWidth / 2 - r.left;
      const cy = window.innerHeight / 2 - r.top;
      gsap.fromTo(
        c,
        { attr: { cx, cy, r: 4 }, opacity: 0.9 },
        { attr: { r: Math.max(r.width, r.height) * 0.7 }, opacity: 0, duration: 2.4, ease: "expo.out" },
      );
    });
  }, []);

  return (
    <div ref={wrapRef} className={styles.svgWrap}>
      {labeled && size ? (
        <svg ref={svgRef} className={styles.svg} width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
          <defs>
            <radialGradient ref={lopGradRef} id="hero-lop-fade" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="260">
              <stop offset="0" stopColor="#fff" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.16" />
            </radialGradient>
            <mask id="hero-lop-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={size.w} height={size.h}>
              <rect width={size.w} height={size.h} fill="url(#hero-lop-fade)" />
            </mask>
          </defs>
          <ContourMap data={labeled} minorClass={styles.mapMinor} indexClass={styles.mapIndex} labelClass={styles.mapLabels} />
          <circle ref={rippleRef} className={styles.mapRipple} r="0" />
          <path ref={lopRef} className={styles.mapLop} mask="url(#hero-lop-mask)" />
          {Array.from({ length: SLOTS }, (_, i) => (
            <g key={i}>
              <polyline
                ref={(el) => {
                  trackRefs.current[i] = el;
                }}
                className={styles.mapTrack}
              />
              <circle
                ref={(el) => {
                  marbleRefs.current[i] = el;
                }}
                className={styles.mapMarble}
                r="5"
              />
            </g>
          ))}
          <g ref={fixRef} className={styles.mapFix}>
            <ellipse ref={ellRef} rx="30" ry="12" />
            <path d="M-26 0H-8M8 0H26M0 -26V-8M0 8V26" />
            <circle r="2" className={styles.mapFixDot} />
          </g>
        </svg>
      ) : null}
      <TerrainOverlay ref={overlay} sim={sim} />
    </div>
  );
}
