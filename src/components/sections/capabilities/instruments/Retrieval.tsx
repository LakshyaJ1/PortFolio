"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Frame } from "./Frame";
import { Glyph } from "../glyphs";
import { alpha, monoFont, readPalette, sansFont } from "../kit/palette";
import { expoOut, rng, gauss, span, useCanvas, useLoop, useStill, type CanvasBox } from "../kit/loop";
import { Sim } from "../kit/store";
import s from "./instruments.module.css";

// Scrini's hybrid retrieval, drawn on a 2D projection of a candidate-profile
// embedding space. The sample, queries and scores are authored; the shape of the
// search (HNSW descent → cosine kNN → metadata filter → cross-encoder rerank) is real.

const CLUSTERS = [
  { x: 0.3, y: 0.3, sd: 0.065, n: 380, role: "ML eng", label: "ml · nlp" },
  { x: 0.7, y: 0.27, sd: 0.075, n: 420, role: "Backend eng", label: "backend" },
  { x: 0.52, y: 0.54, sd: 0.06, n: 300, role: "Data eng", label: "data" },
  { x: 0.84, y: 0.6, sd: 0.055, n: 320, role: "Frontend eng", label: "frontend" },
  { x: 0.2, y: 0.7, sd: 0.065, n: 260, role: "Android eng", label: "mobile" },
  { x: 0.42, y: 0.82, sd: 0.05, n: 210, role: "CV eng", label: "vision" },
  { x: 0.75, y: 0.86, sd: 0.05, n: 200, role: "DevOps eng", label: "devops" },
];
const BACKGROUND = 310;

type Pts = { x: Float32Array; y: Float32Array; remote: Uint8Array; yrs: Uint8Array; role: Uint8Array; n: number };

function makePoints(): Pts {
  const r = rng(1729);
  const n = CLUSTERS.reduce((a, c) => a + c.n, 0) + BACKGROUND;
  const pts: Pts = { x: new Float32Array(n), y: new Float32Array(n), remote: new Uint8Array(n), yrs: new Uint8Array(n), role: new Uint8Array(n), n };
  let i = 0;
  CLUSTERS.forEach((c, ci) => {
    for (let k = 0; k < c.n; k++, i++) {
      pts.x[i] = Math.min(0.99, Math.max(0.01, c.x + gauss(r) * c.sd));
      pts.y[i] = Math.min(0.99, Math.max(0.01, c.y + gauss(r) * c.sd));
      pts.role[i] = ci;
    }
  });
  for (; i < n; i++) {
    pts.x[i] = 0.03 + r() * 0.94;
    pts.y[i] = 0.03 + r() * 0.94;
    let best = 0;
    let bd = Infinity;
    CLUSTERS.forEach((c, ci) => {
      const d = (c.x - pts.x[i]) ** 2 + (c.y - pts.y[i]) ** 2;
      if (d < bd) {
        bd = d;
        best = ci;
      }
    });
    pts.role[i] = best;
  }
  for (let j = 0; j < n; j++) {
    pts.remote[j] = r() < 0.42 ? 1 : 0;
    pts.yrs[j] = Math.floor(r() * 11) + 1;
  }
  return pts;
}

type Query = { text: string; x: number; y: number; filterLabel: string; pass: (p: Pts, i: number) => boolean };

const QUERIES: Query[] = [
  { text: "LLM engineer, RAG pipelines", x: 0.33, y: 0.29, filterLabel: "remote", pass: (p, i) => p.remote[i] === 1 },
  { text: "FastAPI backend, Docker", x: 0.65, y: 0.31, filterLabel: "≥ 3 yrs", pass: (p, i) => p.yrs[i] >= 3 },
  { text: "computer vision on mobile", x: 0.33, y: 0.77, filterLabel: "remote · ≥ 2 yrs", pass: (p, i) => p.remote[i] === 1 && p.yrs[i] >= 2 },
];

const K = 60;
const T = 8.4;
const T_LIST = 3.7;
const T_RERANK = 4.9;

type Cand = { i: number; id: string; desc: string; cos: number; ce: number; vRank: number; cRank: number };
type Plan = { ringR: number; inRing: number[]; passIdx: Set<number>; cands: Cand[]; hops: number[] };

function plan(p: Pts, q: Query, qi: number): Plan {
  const d = new Float32Array(p.n);
  const order: number[] = [];
  for (let i = 0; i < p.n; i++) {
    d[i] = Math.hypot(p.x[i] - q.x, p.y[i] - q.y);
    order.push(i);
  }
  order.sort((a, b) => d[a] - d[b]);
  const inRing = order.slice(0, K);
  const ringR = d[order[K - 1]];
  const passIdx = new Set<number>();
  for (let i = 0; i < p.n; i++) if (q.pass(p, i)) passIdx.add(i);
  const r = rng(97 + qi * 13);
  const top = inRing.filter((i) => passIdx.has(i)).slice(0, 5);
  const cands: Cand[] = top.map((i, vRank) => {
    const cos = 0.93 - (d[i] / ringR) * 0.17;
    return {
      i,
      id: `c-${String(1000 + ((i * 7919) % 9000)).padStart(5, "0")}`,
      desc: `${CLUSTERS[p.role[i]].role} · ${p.yrs[i]} yrs${p.remote[i] ? " · remote" : ""}`,
      cos,
      ce: 0,
      vRank,
      cRank: 0,
    };
  });
  // cross-encoder scores: correlated with cosine, but it reads the whole profile
  cands.forEach((c, k) => {
    c.ce = Math.min(0.98, c.cos + (r() - 0.5) * 0.14 + (k === 2 ? 0.08 : 0));
  });
  [...cands].sort((a, b) => b.ce - a.ce).forEach((c, k) => (c.cRank = k));
  // greedy HNSW-style descent from a far entry point
  let entry = 0;
  let far = -1;
  for (let i = 0; i < p.n; i++) {
    const e = Math.hypot(p.x[i] - 0.96, p.y[i] - 0.04);
    if (far < 0 || e < far) {
      far = e;
      entry = i;
    }
  }
  const hops = [entry];
  let cur = entry;
  for (let h = 0; h < 9; h++) {
    let best = cur;
    for (let i = 0; i < p.n; i += 3) {
      if (Math.hypot(p.x[i] - p.x[cur], p.y[i] - p.y[cur]) > 0.17) continue;
      if (d[i] < d[best]) best = i;
    }
    if (best === cur || d[cur] - d[best] < 0.004) break;
    cur = best;
    hops.push(cur);
  }
  return { ringR, inRing, passIdx, cands, hops };
}

const geom = (box: CanvasBox) => {
  const pad = 16;
  const S = Math.min(box.w, box.h) - pad * 2;
  return { S, ox: (box.w - S) / 2, oy: (box.h - S) / 2 };
};

type View = { q: number; stage: number };

class RetrievalRun extends Sim<View> {
  readonly pts = makePoints();
  readonly plans = QUERIES.map((q, i) => plan(this.pts, q, i));
  private t = 0;
  private q = 0;
  private layers: { base: HTMLCanvasElement | null; pass: (HTMLCanvasElement | null)[] } = { base: null, pass: [] };

  constructor() {
    super({ q: 0, stage: 0 });
  }

  buildLayers(box: CanvasBox) {
    const pal = readPalette();
    const { S, ox, oy } = geom(box);
    const mk = () => {
      const c = document.createElement("canvas");
      c.width = Math.round(box.w * box.dpr);
      c.height = Math.round(box.h * box.dpr);
      const x = c.getContext("2d")!;
      x.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
      return { c, x };
    };
    const base = mk();
    base.x.fillStyle = pal.z[6];
    for (let i = 0; i < this.pts.n; i++) base.x.fillRect(ox + this.pts.x[i] * S - 0.8, oy + this.pts.y[i] * S - 0.8, 1.6, 1.6);
    base.x.font = sansFont(pal, 10, 600);
    base.x.fillStyle = pal.z[8];
    if (S > 250) CLUSTERS.forEach((c) => {
      const right = c.x > 0.7;
      base.x.textAlign = right ? "right" : "left";
      base.x.fillText(c.label, ox + (c.x + (right ? -1 : 1) * c.sd * 1.4) * S, oy + (c.y - c.sd * 1.5) * S);
    });
    base.x.textAlign = "left";
    this.layers.base = base.c;
    this.layers.pass = this.plans.map((pl) => {
      const l = mk();
      l.x.fillStyle = pal.z[7];
      pl.passIdx.forEach((i) => l.x.fillRect(ox + this.pts.x[i] * S - 1, oy + this.pts.y[i] * S - 1, 2, 2));
      return l.c;
    });
  }

  draw(box: CanvasBox) {
    const ctx = box.ctx;
    if (!ctx || !this.layers.base) return;
    const pal = readPalette();
    const { t, q } = this;
    const pl = this.plans[q];
    const { S, ox, oy } = geom(box);
    const X = (i: number) => ox + this.pts.x[i] * S;
    const Y = (i: number) => oy + this.pts.y[i] * S;
    const qx = ox + QUERIES[q].x * S;
    const qy = oy + QUERIES[q].y * S;
    const out = 1 - span(t, T - 0.8, T);
    const mask = span(t, 2.8, 3.5) * out;

    ctx.clearRect(0, 0, box.w, box.h);
    ctx.globalAlpha = 1 - 0.65 * mask;
    ctx.drawImage(this.layers.base, 0, 0, box.w, box.h);
    const passLayer = this.layers.pass[q];
    if (passLayer && mask > 0) {
      ctx.globalAlpha = mask;
      ctx.drawImage(passLayer, 0, 0, box.w, box.h);
    }
    ctx.globalAlpha = 1;

    // HNSW greedy descent
    const hopP = span(t, 0.5, 1.9);
    if (hopP > 0 && out > 0) {
      const segs = pl.hops.length - 1;
      const upto = hopP * segs;
      ctx.strokeStyle = alpha(pal.z[9], 0.85 * out);
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(X(pl.hops[0]), Y(pl.hops[0]));
      for (let k = 1; k <= segs; k++) {
        const a = pl.hops[k - 1];
        const b = pl.hops[k];
        const f = Math.min(1, Math.max(0, upto - (k - 1)));
        if (f <= 0) break;
        ctx.lineTo(X(a) + (X(b) - X(a)) * f, Y(a) + (Y(b) - Y(a)) * f);
      }
      ctx.stroke();
      ctx.fillStyle = alpha(pal.z[10], out);
      pl.hops.forEach((h, k) => {
        if (k > upto + 0.01) return;
        ctx.beginPath();
        ctx.arc(X(h), Y(h), k === 0 ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.font = sansFont(pal, 10, 600);
      ctx.fillStyle = alpha(pal.z[8], out);
      ctx.textAlign = "right";
      ctx.fillText("HNSW entry", X(pl.hops[0]) - 6, Y(pl.hops[0]) + 3);
      ctx.textAlign = "left";
    }

    // cosine kNN ring
    const ringP = expoOut(span(t, 1.9, 2.8));
    if (ringP > 0 && out > 0) {
      const R = pl.ringR * S * ringP;
      ctx.strokeStyle = alpha(pal.z[9], 0.9 * out);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(qx, qy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = monoFont(pal, 9);
      ctx.fillStyle = alpha(pal.z[9], out);
      ctx.fillText(`k = ${K}`, qx + R * 0.72 + 4, qy - R * 0.72 - 2);
    }

    // in-ring candidates that pass the metadata filter
    if (mask > 0) {
      ctx.fillStyle = alpha(pal.z[10], mask);
      pl.inRing.forEach((i) => {
        if (!pl.passIdx.has(i)) return;
        ctx.fillRect(X(i) - 1.5, Y(i) - 1.5, 3, 3);
      });
    }

    // top-5 boxes; the reranked #1 takes the fix
    const listP = span(t, T_LIST, T_LIST + 0.4) * out;
    if (listP > 0) {
      const reranked = t >= T_RERANK;
      pl.cands.forEach((c) => {
        const first = reranked && c.cRank === 0;
        ctx.strokeStyle = alpha(first ? pal.fix : pal.z[10], listP);
        ctx.lineWidth = first ? 1.5 : 1;
        ctx.strokeRect(X(c.i) - 4.5, Y(c.i) - 4.5, 9, 9);
      });
      ctx.lineWidth = 1;
    }

    // the query fix
    const qP = expoOut(span(t, 0, 0.5)) * out;
    if (qP > 0) {
      ctx.strokeStyle = alpha(pal.fix, qP);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(qx, qy, 5.5 * qP, 0, Math.PI * 2);
      ctx.moveTo(qx - 12, qy);
      ctx.lineTo(qx - 7, qy);
      ctx.moveTo(qx + 7, qy);
      ctx.lineTo(qx + 12, qy);
      ctx.moveTo(qx, qy - 12);
      ctx.lineTo(qx, qy - 7);
      ctx.moveTo(qx, qy + 7);
      ctx.lineTo(qx, qy + 12);
      ctx.stroke();
      ctx.fillStyle = alpha(pal.fix, qP);
      ctx.fillRect(qx - 1.5, qy - 1.5, 3, 3);
      ctx.lineWidth = 1;
    }
  }

  step(dt: number) {
    this.t += dt;
    if (this.t >= T) {
      this.t = 0;
      this.q = (this.q + 1) % QUERIES.length;
    }
    const stage = this.t >= T_RERANK ? 2 : this.t >= T_LIST ? 1 : 0;
    const v = this.view;
    if (stage !== v.stage || this.q !== v.q) this.publish({ q: this.q, stage });
  }

  /** reduced motion / plain: hold the reranked result of the first query */
  holdStill() {
    this.t = 6.2;
    this.q = 0;
    this.publish({ q: 0, stage: 2 });
  }
}

export function Retrieval({ active = true }: { active?: boolean }) {
  const scope = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useStill();
  const [sim] = useState(() => new RetrievalRun());
  const view = useSyncExternalStore(sim.subscribe, sim.getSnapshot, sim.getSnapshot);

  const box = useCanvas(canvas, (b) => {
    sim.buildLayers(b);
    sim.draw(b);
  });

  useLoop(scope, active, (dt) => {
    sim.step(dt);
    sim.draw(box.current);
  });

  useEffect(() => {
    if (!still) return;
    sim.holdStill();
    sim.draw(box.current);
  }, [still, sim, box]);

  const plans = sim.plans;
  const pl = plans[view.q];
  const q = QUERIES[view.q];

  return (
    <Frame
      title="Hybrid retrieval"
      station="Scrini AI · 2025"
      axis="embedding space · 2D projection"
      badge={{ label: "Search · RAG", glyph: <Glyph name="retrieval" /> }}
      figures={[
        { v: "10K+", k: "candidate profiles" },
        { v: "< 50 ms", k: "retrieval (HNSW)" },
        { v: "Rerank", k: "cross-encoder" },
      ]}
      readouts={[
        { k: "Engine", v: "FastAPI · Qdrant" },
        { k: "Drawn", v: "2,400-point sample" },
      ]}
      caption="Semantic resume search: cosine similarity and metadata filters find the candidates, then a cross-encoder reranks them for relevance."
      controls={
        <p className={s.queryRow}>
          <span className={s.pendingKey}>Query</span> <span className={s.queryText}>“{q.text}”</span>{" "}
          <span className={s.pendingKey}>Filter</span> <span className={s.queryText}>{q.filterLabel}</span>
        </p>
      }
    >
      <div ref={scope} className={s.split}>
        <div className={s.splitCanvas}>
          <canvas ref={canvas} aria-hidden="true" />
        </div>
        <div className={s.rank} aria-label="Top five candidates">
          <p className={s.rankHead}>
            <span>Top 5</span>
            <span>{view.stage === 2 ? "cos → rerank" : view.stage === 1 ? "cos" : "searching"}</span>
          </p>
          <ol className={s.rankList} data-stage={view.stage}>
            {pl.cands.map((c) => {
              const rank = view.stage === 2 ? c.cRank : c.vRank;
              return (
                <li key={`${view.q}-${c.id}`} className={s.rankItem} style={{ "--rank": rank } as CSSProperties} data-first={view.stage === 2 && c.cRank === 0 ? "" : undefined}>
                  <span className={s.rankId}>
                    <span className={s.rankNo}>{rank + 1}</span>
                    {c.id}
                    <span className={s.rankScore}>
                      {c.cos.toFixed(2).slice(1)}
                      {view.stage === 2 ? <> → {c.ce.toFixed(2).slice(1)}</> : null}
                    </span>
                  </span>
                  <span className={s.rankDesc}>{c.desc}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </Frame>
  );
}
