// Terrain toolkit · static SVG contour map (plan view). No WebGL, no animation: the
// fallback for plain mode, reduced motion and devices without WebGL, and a building block
// for any small contour vignette.
//
//   const data = computeContourMap(field, { bounds, width, height }, { interval: 0.05 });
//   data.labels = placeLabels(data, { avoid: rects });          // optional height labels
//   <svg viewBox={`0 0 ${width} ${height}`}><ContourMap data={data} /></svg>
//
// `bounds` should match the width:height aspect (plan views are not stretched).

import type { ReactNode } from "react";
import { contourPaths, labelAnchor, sampleGrid, type ContourPath, type Grid, type Project } from "./contours";
import type { Bounds, HeightField } from "./field";

export type MapView = { bounds: Bounds; width: number; height: number };
export type MapLabel = { x: number; y: number; angle: number; text: string };
export type ContourMapData = {
  view: MapView;
  grid: Grid;
  paths: ContourPath[];
  labels: MapLabel[];
  project: Project;
  /** inverse of project: output px → world XZ */
  unproject: (px: number, py: number) => readonly [number, number];
};

export function planProjection(view: MapView) {
  const { bounds: b, width, height } = view;
  const sx = width / (b.x1 - b.x0);
  const sz = height / (b.z1 - b.z0);
  const project: Project = (x, z) => [(x - b.x0) * sx, (z - b.z0) * sz];
  const unproject = (px: number, py: number) => [b.x0 + px / sx, b.z0 + py / sz] as const;
  return { project, unproject, scale: sx };
}

export function computeContourMap(
  field: HeightField,
  view: MapView,
  {
    interval = 0.05,
    indexEvery = 5,
    cell = 7,
  }: {
    interval?: number;
    indexEvery?: number;
    /** output px per grid cell */
    cell?: number;
  } = {},
): ContourMapData {
  const { project, unproject } = planProjection(view);
  const b = view.bounds;
  const pad = ((b.x1 - b.x0) / view.width) * cell * 2;
  const sb = { x0: b.x0 - pad, x1: b.x1 + pad, z0: b.z0 - pad, z1: b.z1 + pad };
  const nx = Math.min(320, Math.max(24, Math.round((view.width + cell * 4) / cell)));
  const ny = Math.min(320, Math.max(16, Math.round((view.height + cell * 4) / cell)));
  const grid = sampleGrid(field, sb, nx, ny);
  const paths = contourPaths(grid, { interval, indexEvery, project, smooth: true, tol: 2 });
  return { view, grid, paths, labels: [], project, unproject };
}

/**
 * Height labels along index contours, kept clear of `avoid` rects (output px), the frame
 * edge and each other.
 */
export function placeLabels(
  data: ContourMapData,
  { avoid = [], format = (v: number) => v.toFixed(2), spacing = 90 }: { avoid?: { x0: number; y0: number; x1: number; y1: number }[]; format?: (level: number) => string; spacing?: number } = {},
): MapLabel[] {
  const out: MapLabel[] = [];
  const { width, height } = data.view;
  for (const p of data.paths) {
    if (!p.index) continue;
    for (const at of [0.3, 0.62, 0.45, 0.8]) {
      const a = labelAnchor(p.lines, data.project, at);
      if (!a) break;
      const inside = a.x > 24 && a.x < width - 24 && a.y > 24 && a.y < height - 24;
      const clear =
        !avoid.some((r) => a.x > r.x0 - 30 && a.x < r.x1 + 30 && a.y > r.y0 - 16 && a.y < r.y1 + 16) &&
        !out.some((q) => Math.hypot(q.x - a.x, q.y - a.y) < spacing);
      if (inside && clear) {
        out.push({ ...a, text: format(p.level) });
        break;
      }
    }
  }
  return out;
}

/** The contour layers as an SVG group. Style hooks: data-layer="minor|index|labels". */
export function ContourMap({ data, minorClass, indexClass, labelClass, children }: {
  data: ContourMapData;
  minorClass?: string;
  indexClass?: string;
  labelClass?: string;
  children?: ReactNode;
}) {
  const minor = data.paths.filter((p) => !p.index && p.d);
  const index = data.paths.filter((p) => p.index && p.d);
  return (
    <g>
      <g data-layer="minor" className={minorClass} fill="none">
        {minor.map((p) => (
          <path key={p.level} d={p.d} />
        ))}
      </g>
      <g data-layer="index" className={indexClass} fill="none">
        {index.map((p) => (
          <path key={p.level} d={p.d} />
        ))}
      </g>
      <g data-layer="labels" className={labelClass}>
        {data.labels.map((l) => (
          <text key={`${l.text}-${l.x.toFixed(0)}`} x={l.x} y={l.y} transform={`rotate(${l.angle.toFixed(1)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})`} dy="0.35em" textAnchor="middle">
            {l.text}
          </text>
        ))}
      </g>
      {children}
    </g>
  );
}
