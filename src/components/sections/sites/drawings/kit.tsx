import type { ReactNode } from "react";
import d from "./drawings.module.css";

export type P = readonly [number, number];
export type Seg = { p0: P; c1: P; c2: P; p1: P };

/** Catmull-Rom through the points, as cubic Bézier segments. */
export function catmull(pts: P[]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[i];
    const c = pts[i + 1];
    const e = pts[Math.min(pts.length - 1, i + 2)];
    segs.push({
      p0: b,
      c1: [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6],
      c2: [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6],
      p1: c,
    });
  }
  return segs;
}

const f = (n: number) => Math.round(n * 10) / 10;

export function segPath(segs: Seg[], from = 0, to = segs.length) {
  const part = segs.slice(from, to);
  if (!part.length) return "";
  return (
    `M${f(part[0].p0[0])} ${f(part[0].p0[1])}` +
    part.map((s) => ` C${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p1[0])} ${f(s.p1[1])}`).join("")
  );
}

// geometry is rounded so server and client print identical attributes
const r2 = (n: number) => Math.round(n * 100) / 100;

export function pointAt(s: Seg, t: number): P {
  const u = 1 - t;
  return [
    r2(u * u * u * s.p0[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.p1[0]),
    r2(u * u * u * s.p0[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.p1[1]),
  ];
}

/** tangent angle in degrees */
export function angleAt(s: Seg, t: number) {
  const u = 1 - t;
  const dx = 3 * u * u * (s.c1[0] - s.p0[0]) + 6 * u * t * (s.c2[0] - s.c1[0]) + 3 * t * t * (s.p1[0] - s.c2[0]);
  const dy = 3 * u * u * (s.c1[1] - s.p0[1]) + 6 * u * t * (s.c2[1] - s.c1[1]) + 3 * t * t * (s.p1[1] - s.c2[1]);
  return r2((Math.atan2(dy, dx) * 180) / Math.PI);
}

/**
 * A survey annotation: the value and its label at (x, y). When the drawing is
 * too small to letter (phones), notes step aside; the card prints the figures.
 * The balloon position is kept for drawings that want a keyed callout.
 */
export function Note({
  n,
  x,
  y,
  anchor = "start",
  value,
  label,
  bx,
  by,
}: {
  n: number;
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  value: string;
  label: string;
  /** balloon centre (phones) */
  bx: number;
  by: number;
}) {
  return (
    <g className={d.note}>
      <text x={x} y={y} textAnchor={anchor} className={d.noteValue} data-v="">
        {value}
      </text>
      <text x={x} y={y + 19} textAnchor={anchor} className={d.noteLabel} data-v="">
        {label}
      </text>
      <g transform={`translate(${bx} ${by})`}>
        <g className={d.balloon}>
          <circle r={11} />
          <text y={4} textAnchor="middle">
            {n}
          </text>
        </g>
      </g>
    </g>
  );
}

/** leader line from a part (dot) to its note */
export function Leader({ pts }: { pts: P[] }) {
  return (
    <g className={d.leader}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} className="draw" />
      <circle cx={pts[0][0]} cy={pts[0][1]} r={2.2} />
    </g>
  );
}

/** dimension line with architectural slash ticks */
export function Dim({ a, b, ext = 0 }: { a: P; b: P; ext?: number }) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  const tick = (p: P) => {
    const cx = Math.cos(ang + Math.PI / 4) * 5;
    const cy = Math.sin(ang + Math.PI / 4) * 5;
    return `M${f(p[0] - cx)} ${f(p[1] - cy)} L${f(p[0] + cx)} ${f(p[1] + cy)}`;
  };
  return (
    <g className={d.dim}>
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="draw" />
      {ext ? (
        <>
          <line x1={a[0]} y1={a[1]} x2={a[0] + nx * ext} y2={a[1] + ny * ext} />
          <line x1={b[0]} y1={b[1]} x2={b[0] + nx * ext} y2={b[1] + ny * ext} />
        </>
      ) : null}
      <path d={`${tick(a)} ${tick(b)}`} className={d.dimTick} />
    </g>
  );
}

/** a labelled block in a pipeline */
export function Block({ x, y, w, h, label, sub }: { x: number; y: number; w: number; h: number; label: string; sub?: string }) {
  return (
    <g className={d.block}>
      <rect x={x} y={y} width={w} height={h} rx={2} className="draw" />
      <text x={x + w / 2} y={sub ? y + h / 2 - 2 : y + h / 2 + 3.5} textAnchor="middle" className={d.blockLabel}>
        {label}
      </text>
      {sub ? (
        <text x={x + w / 2} y={y + h / 2 + 10} textAnchor="middle" className={d.blockSub}>
          {sub}
        </text>
      ) : null}
    </g>
  );
}

export function Arrow({ a, b }: { a: P; b: P }) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const h = (s: number) => [b[0] - Math.cos(ang + s) * 6, b[1] - Math.sin(ang + s) * 6];
  const [l, r] = [h(0.45), h(-0.45)];
  return (
    <g className={d.arrow}>
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="draw" />
      <path d={`M${f(l[0])} ${f(l[1])} L${f(b[0])} ${f(b[1])} L${f(r[0])} ${f(r[1])}`} />
    </g>
  );
}

/** a drawing, sized as one container so its lettering can respond to its width */
export function Drawing({ children }: { children: ReactNode }) {
  return <div className={d.wrap}>{children}</div>;
}
