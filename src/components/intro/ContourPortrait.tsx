"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import gsap from "gsap";
import { buildPortrait, PORTRAIT_VIEWBOX, type Portrait } from "./portrait";
import styles from "./Intro.module.css";

export type StandInApi = {
  /** a pair of sound arcs from the mouth, one per spoken word */
  speak: () => void;
  /** the spawn scan: `edge` 0 (nothing) → 1 (whole figure), measured up from the frame's bottom */
  reveal: (edge: number) => void;
};

const RINGS = 3;
const [VX, VY, VW, VH] = PORTRAIT_VIEWBOX.split(" ").map(Number);
const BOTTOM = VY + VH;
/** the orange band under the scan line, as a fraction of the frame height (matches the shader) */
export const SCAN_BAND = 0.035;

/**
 * The stand-in: Lakshya surveyed as terrain, a contour-line figure drawn in ink (ramp z7–z9)
 * straight on the night ground, until his recording arrives. It resolves bottom to top behind the
 * stage's scan line: a base copy clipped below the line and an orange copy in the band under it.
 */
export function ContourPortrait({ calm, apiRef }: { calm: boolean; apiRef: RefObject<StandInApi | null> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const baseRect = useRef<SVGRectElement>(null);
  const bandRect = useRef<SVGRectElement>(null);
  // usually cached: the greeting traces the figure while its first hello holds
  const [portrait] = useState<Portrait>(() => buildPortrait());
  const ring = useRef(0);

  const lines = useMemo(
    () =>
      portrait.levels.flatMap((lvl, li) =>
        lvl.paths.map((d, pi) => (
          <path key={`${li}-${pi}`} className={lvl.index ? styles.figIndex : styles.figMinor} d={d} vectorEffect="non-scaling-stroke" />
        )),
      ),
    [portrait],
  );

  useEffect(() => {
    apiRef.current = {
      speak: () => {
        const svg = svgRef.current;
        if (!svg) return;
        const rings = svg.querySelectorAll<SVGPathElement>("[data-ring]");
        if (!rings.length) return;
        const el = rings[ring.current++ % rings.length];
        const [mx, my] = portrait.mouth;
        if (calm) {
          gsap.fromTo(el, { autoAlpha: 0.9, scale: 7, svgOrigin: `${mx} ${my}` }, { autoAlpha: 0, duration: 0.7, ease: "none" });
          return;
        }
        gsap.fromTo(el, { autoAlpha: 1, scale: 5.6, svgOrigin: `${mx} ${my}` }, { autoAlpha: 0, scale: 11, duration: 0.85, ease: "expo.out" });
      },
      reveal: (edge) => {
        const top = BOTTOM - edge * VH;
        baseRect.current?.setAttribute("y", top.toFixed(3));
        baseRect.current?.setAttribute("height", Math.max(0, edge * VH).toFixed(3));
        const band = Math.min(SCAN_BAND, Math.max(0, edge)) * VH;
        bandRect.current?.setAttribute("y", top.toFixed(3));
        bandRect.current?.setAttribute("height", (edge >= 1 ? 0 : band).toFixed(3));
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, calm, portrait]);

  return (
    <svg
      ref={svgRef}
      className={styles.standIn}
      viewBox={PORTRAIT_VIEWBOX}
      preserveAspectRatio="xMidYMax meet"
      role="img"
      aria-label="A stand-in for Lakshya: a standing figure drawn in contour lines, like terrain on a survey sheet"
    >
      <defs>
        <clipPath id="lj-standin-base" clipPathUnits="userSpaceOnUse">
          <rect ref={baseRect} x={VX - 4} width={VW + 8} y={BOTTOM} height={0} />
        </clipPath>
        <clipPath id="lj-standin-band" clipPathUnits="userSpaceOnUse">
          <rect ref={bandRect} x={VX - 4} width={VW + 8} y={BOTTOM} height={0} />
        </clipPath>
      </defs>
      <g className={styles.breathe}>
        <g clipPath="url(#lj-standin-base)">{lines}</g>
        <g clipPath="url(#lj-standin-band)" className={styles.figGlow}>
          {lines}
        </g>
        {Array.from({ length: RINGS }, (_, i) => (
          <path
            key={`r${i}`}
            data-ring=""
            className={styles.voiceRing}
            d="M0.8 16.1A1 1 0 0 1 0.8 17.3M-0.8 16.1A1 1 0 0 0 -0.8 17.3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}
