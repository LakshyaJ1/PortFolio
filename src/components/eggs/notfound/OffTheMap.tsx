"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { PROFILE } from "@/content/profile";
import { discover } from "@/lib/discover";
import { formatDMS } from "@/lib/geo";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { contourSegments, MAX_DPR, readPalette } from "../games/engine";
import { Snake } from "../games/Snake";
import { whenHydrated } from "../shared";
import styles from "./OffTheMap.module.css";

/** Surveyed ground ends at a ragged "limit of survey"; past it, blank water. */
function useSurveyBackdrop() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const p = readPalette();

    const paint = () => {
      const w = Math.max(1, Math.round(wrap.clientWidth));
      const h = Math.max(1, Math.round(wrap.clientHeight));
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const portrait = w < 820;
      // the limit of survey: a wavy coastline just before the uncharted water begins
      const water = wrap.parentElement?.querySelector<HTMLElement>("[data-water]");
      const wr = wrap.getBoundingClientRect();
      const r = water?.getBoundingClientRect();
      const base = portrait ? (r ? r.top - wr.top - 44 : h * 0.4) : r ? r.left - wr.left - 56 : w * 0.54;
      const limit = (t: number) =>
        portrait
          ? base + 14 * Math.sin(t / 70) + 8 * Math.sin(t / 23 + 1.3)
          : base + 30 * Math.sin(t / 96) + 16 * Math.sin(t / 31 + 0.7);

      const cell = 12;
      const nx = Math.ceil(w / cell) + 1;
      const ny = Math.ceil(h / cell) + 1;
      const field = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const x = i * cell;
          const y = j * cell;
          field[j * nx + i] =
            Math.sin(x / 210) * Math.cos(y / 170) +
            0.6 * Math.sin((x + y) / 120 + 1.2) +
            0.35 * Math.cos(x / 64 - y / 90) +
            0.9 * Math.exp(-((x - w * 0.22) ** 2 + (y - h * 0.3) ** 2) / (2 * 140 ** 2));
        }
      const levels = Array.from({ length: 16 }, (_, k) => -1.8 + k * 0.24);
      const segs = contourSegments(field, nx, ny, cell, levels);

      ctx.save();
      ctx.beginPath();
      if (portrait) {
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        for (let x = w; x >= 0; x -= 6) ctx.lineTo(x, limit(x));
      } else {
        ctx.moveTo(0, 0);
        for (let y = 0; y <= h; y += 6) ctx.lineTo(limit(y), y);
        ctx.lineTo(0, h);
      }
      ctx.closePath();
      ctx.clip();
      segs.forEach((s, k) => {
        ctx.strokeStyle = k % 4 === 0 ? p.z6 : p.z5;
        ctx.lineWidth = k % 4 === 0 ? 1.25 : 0.9;
        ctx.beginPath();
        for (let i = 0; i < s.length; i += 4) {
          ctx.moveTo(s[i], s[i + 1]);
          ctx.lineTo(s[i + 2], s[i + 3]);
        }
        ctx.stroke();
      });
      ctx.restore();

      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = p.z7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (portrait) for (let x = 0; x <= w; x += 6) (x ? ctx.lineTo : ctx.moveTo).call(ctx, x, limit(x));
      else for (let y = 0; y <= h; y += 6) (y ? ctx.lineTo : ctx.moveTo).call(ctx, limit(y), y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = p.z7;
      ctx.font = `500 9px ${p.mono}`;
      ctx.save();
      if (portrait) {
        ctx.translate(w - 116, limit(w - 116) + 16);
      } else {
        const y = h * 0.82;
        ctx.translate(limit(y) + 12, y);
        ctx.rotate(-Math.PI / 2);
      }
      ctx.fillText("LIMIT OF SURVEY", 0, 0);
      ctx.restore();
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);
    const water = wrap.parentElement?.querySelector<HTMLElement>("[data-water]");
    if (water) ro.observe(water);
    return () => ro.disconnect();
  }, []);

  return { wrapRef, canvasRef };
}

/** The 404: off the edge of the survey sheet. */
export function OffTheMap() {
  const path = usePathname();
  const { wrapRef, canvasRef } = useSurveyBackdrop();
  const cold = useRef(false);

  useEffect(() => {
    // Someone landing here cold shouldn't sit through the greeting first; they get it on the way home.
    try {
      cold.current = window.sessionStorage.getItem("lj-greeted") !== "1";
    } catch {
      /* ignore */
    }
    useApp.getState().setPhase("site");
    return whenHydrated(() => discover("off-the-map"));
  }, []);

  return (
    <main id="main" tabIndex={-1} className={styles.page} data-skip-greeting>
      <div ref={wrapRef} className={styles.backdrop} aria-hidden="true">
        <canvas ref={canvasRef} />
      </div>

      <div className={styles.sheet}>
        <div className={styles.edge} aria-hidden="true">
          <span className={styles.ref}>K10</span>
          <span className={styles.ticks} />
          <span className={styles.dragons}>Here be dragons</span>
        </div>
        <p className={styles.sideEdge} aria-hidden="true">
          Here be dragons · beyond the neatline · unsurveyed
        </p>

        <div className={styles.grid}>
          <section className={styles.copy} aria-labelledby="otm-title">
            <h1 id="otm-title" className={styles.title}>
              Off the map
            </h1>
            <p className={styles.lead}>
              Page not found: <code className={styles.path}>{path || "this path"}</code> doesn&rsquo;t exist. Getting
              lost here counts as an Easter egg, so it&rsquo;s logged in your logbook. Go back to the site, or play the
              game below.
            </p>
            <div className={styles.actions}>
              <Button
                variant="fix"
                size="lg"
                icon="arrow-right"
                href="/"
                cta="404-home"
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  // a cold visitor still gets the greeting on the way home (full load, so the shell boots it)
                  if (cold.current) e.currentTarget.href = "/?intro";
                }}
              >
                Back to the site
              </Button>
            </div>
            <dl className={styles.fixes}>
              <div>
                <dt>Last fix</dt>
                <dd>
                  {formatDMS(PROFILE.home)} · {PROFILE.location}
                </dd>
              </div>
              <div>
                <dt>Your fix</dt>
                <dd>None. Signal masked.</dd>
              </div>
            </dl>
          </section>

          <section className={styles.water} data-water aria-label="A game while you're out here">
            <p className={styles.waterName} aria-hidden="true">
              <em className="hydro">Uncharted waters</em>
            </p>
            <p className={styles.note}>something lives out here. arrow keys or swipe</p>
            <div className={styles.game}>
              <Snake embedded />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
