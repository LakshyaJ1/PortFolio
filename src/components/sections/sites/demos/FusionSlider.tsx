"use client";

import { useId, useMemo, useState } from "react";
import { Frame } from "@/components/sections/capabilities/instruments/Frame";
import s from "./demos.module.css";

// Text (BERT) and image (ResNet) embeddings, fused, into an XGBoost + LightGBM
// ensemble. The SMAPE-vs-blend curve is illustrative; the one surveyed point on
// it is the real result from the résumé: 21.06% SMAPE.

const BEST = 0.62; // where the illustrative curve bottoms out (not a reported weight)
const err = (w: number) => 0.16 + 0.82 * (1 - Math.exp(-((w - BEST) ** 2) / 0.11));

const CX0 = 48;
const CX1 = 500;
const CY0 = 188; // worst
const CY1 = 278; // best
const AXIS = 300;
const xOf = (w: number) => CX0 + (CX1 - CX0) * w;
const yOf = (e: number) => CY1 - (CY1 - CY0) * e;
const BASE_E = 0.44;

export function FusionSlider() {
  const id = useId();
  const [w, setW] = useState(0.3);
  const atResult = Math.abs(w - BEST) < 0.025;
  const curve = useMemo(() => {
    let d = "";
    for (let i = 0; i <= 60; i++) {
      const ww = i / 60;
      d += `${i ? "L" : "M"}${xOf(ww).toFixed(1)} ${yOf(err(ww)).toFixed(1)} `;
    }
    return d;
  }, []);
  const px = xOf(w);
  const py = yOf(err(w));
  const bx = xOf(BEST);
  const by = yOf(err(BEST));
  const xg = 1 + 5 * w;
  const lg = 1 + 5 * (1 - w);

  return (
    <Frame
      title="Multimodal fusion · ensemble blend"
      simulated="Illustrative curve"
      aspect="520 / 340"
      readouts={[
        { k: "Result", v: "21.06% SMAPE" },
        { k: "Leaderboard", v: "Top 20% globally" },
        { k: "Products", v: "150,000+" },
        { k: "vs baseline", v: "15% better" },
      ]}
      controls={
        <div className={s.sliderRow}>
          <label htmlFor={id} className={s.sliderLabel}>
            Ensemble blend
          </label>
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(w * 100)}
            onChange={(e) => setW(Number(e.target.value) / 100)}
            className={s.slider}
            aria-valuetext={`${Math.round(w * 100)}% XGBoost, ${100 - Math.round(w * 100)}% LightGBM`}
          />
          <output htmlFor={id} className={s.sliderOut}>
            {Math.round(w * 100)}% XGB · {100 - Math.round(w * 100)}% LGBM
          </output>
          <span className={s.note} data-on={atResult || undefined} aria-live="polite">
            {atResult ? "On the surveyed point: the ensemble’s 21.06% SMAPE." : "Drag toward the low point of the curve."}
          </span>
        </div>
      }
    >
      <div className={s.fill}>
        <svg viewBox="0 0 520 340" className={s.svg} role="img" aria-label={`Fusion diagram and illustrative SMAPE curve. Blend at ${Math.round(w * 100)}% XGBoost.`}>
          {/* fusion diagram */}
          <g className={s.dia}>
            <rect x={14} y={20} width={56} height={28} rx={2} />
            <rect x={14} y={92} width={56} height={28} rx={2} />
            <text x={42} y={38} textAnchor="middle" className={s.tLabel}>
              TEXT
            </text>
            <text x={42} y={110} textAnchor="middle" className={s.tLabel}>
              IMAGE
            </text>
            <path d="M70 34 H92 M70 106 H92" />
            <rect x={92} y={18} width={72} height={32} rx={2} className={s.diaBlock} />
            <rect x={92} y={90} width={72} height={32} rx={2} className={s.diaBlock} />
            <text x={128} y={38} textAnchor="middle" className={s.tLabel}>
              BERT
            </text>
            <text x={128} y={110} textAnchor="middle" className={s.tLabel}>
              RESNET
            </text>
            <path d="M164 34 C 176 34, 176 50, 188 50 M164 106 C 176 106, 176 90, 188 90" />
            <rect x={188} y={38} width={9} height={64} className={s.fuse} />
            <path d="M197 60 C 210 60, 210 34, 224 34 M197 80 C 210 80, 210 106, 224 106" />
            <rect x={224} y={18} width={84} height={32} rx={2} className={s.diaBlock} />
            <rect x={224} y={90} width={84} height={32} rx={2} className={s.diaBlock} />
            <text x={266} y={38} textAnchor="middle" className={s.tLabel}>
              XGBOOST
            </text>
            <text x={266} y={110} textAnchor="middle" className={s.tLabel}>
              LIGHTGBM
            </text>
          </g>
          <path d="M308 34 C 330 34, 330 62, 352 62" className={s.weightLink} style={{ strokeWidth: xg }} data-heavy={w >= 0.5 || undefined} />
          <path d="M308 106 C 330 106, 330 78, 352 78" className={s.weightLink} style={{ strokeWidth: lg }} data-heavy={w < 0.5 || undefined} />
          <text x={318} y={26} className={s.tMono}>
            {w.toFixed(2)}
          </text>
          <text x={318} y={126} className={s.tMono}>
            {(1 - w).toFixed(2)}
          </text>
          <g className={s.dia}>
            <rect x={352} y={54} width={76} height={32} rx={2} className={s.diaBlock} />
            <text x={390} y={74} textAnchor="middle" className={s.tLabel}>
              ENSEMBLE
            </text>
            <path d="M428 70 H446" />
            <path d="M448 56 h54 v28 h-54 l-8 -14 z" className={s.diaBlock} />
            <text x={474} y={74} textAnchor="middle" className={s.tLabel}>
              PRICE
            </text>
          </g>

          {/* illustrative SMAPE curve */}
          <text x={CX0} y={168} className={s.tCaps}>
            ILLUSTRATIVE · ONLY THE MARKED POINT IS A REAL RESULT
          </text>
          <line x1={CX0} y1={CY0 - 8} x2={CX0} y2={AXIS} className={s.axis} />
          <line x1={CX0} y1={AXIS} x2={CX1} y2={AXIS} className={s.axis} />
          <text x={CX0 - 10} y={(CY0 + CY1) / 2} textAnchor="middle" transform={`rotate(-90 ${CX0 - 10} ${(CY0 + CY1) / 2})`} className={s.tSmall}>
            SMAPE · lower is better
          </text>
          <text x={CX0} y={AXIS + 16} className={s.tSmall}>
            LightGBM only
          </text>
          <text x={CX1} y={AXIS + 16} textAnchor="end" className={s.tSmall}>
            XGBoost only
          </text>
          <line x1={CX0} y1={yOf(BASE_E)} x2={CX1} y2={yOf(BASE_E)} className={s.baseline} />
          <text x={CX0 + 6} y={yOf(BASE_E) - 5} className={s.tSmall}>
            baseline models
          </text>
          <line x1={400} y1={by} x2={492} y2={by} className={s.guide} />
          <line x1={486} y1={yOf(BASE_E)} x2={486} y2={by} className={s.dimLine} />
          <path d={`M481 ${yOf(BASE_E) - 5} l10 10 M481 ${by - 5} l10 10`} className={s.dimLine} />
          <text x={480} y={(yOf(BASE_E) + by) / 2 + 4} textAnchor="end" className={s.tMono}>
            15% better
          </text>
          <path d={curve} className={s.curve} />

          {/* the visitor's blend */}
          <line x1={px} y1={py} x2={px} y2={AXIS} className={s.guide} />
          <circle cx={px} cy={py} r={4.5} className={s.cursor} />

          {/* the surveyed point: the real result */}
          <g className={s.result} data-on={atResult || undefined} transform={`translate(${bx} ${by})`}>
            <circle r={6} className={s.resultRing} />
            <path d="M-12 0 h5 M7 0 h5 M0 -12 v5 M0 7 v5" />
          </g>
          <text x={bx + 12} y={by + 18} className={s.tResult}>
            21.06% SMAPE
          </text>
          <text x={bx + 12} y={by + 30} className={s.tSmall}>
            the ensemble’s result
          </text>
        </svg>
      </div>
    </Frame>
  );
}
