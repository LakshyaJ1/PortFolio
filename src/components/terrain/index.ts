// ─────────────────────────────────────────────────────────────────────────────
// Terrain toolkit — contour terrains for the night survey sheet.
//
// FIELDS (field.ts, no three dependency)
//   new GaussianField({ bounds, base, bowl, gaussians, waves, maxBumps })
//     .sample(x, z) → [h, ∂h/∂x, ∂h/∂z]   .height(x, z)   .normalize() (global min → 0)
//     .addBump({ x, z, sigma, amp }) / .setBump(i, patch) / .setBumps(list)   .version
//   new GridField(values, cols, rows, bounds, { blur, upsample, scale, base })
//     a grid (e.g. a GitHub contribution calendar: cols = weeks, rows = weekdays) as a
//     smooth bilinear surface; .setData(data) to refresh.
//   findMinima(field, bounds?) · globalMinimum(field) · heightRange(field, bounds?)
//   intersectField(field, rayOrigin, rayDir, { yScale }) → { x, z, t } | null  (picking)
//
// CONTOURS (contours.ts, no three dependency) — marching squares
//   sampleGrid(field | fn, bounds, nx, ny) → Grid
//   isoLines(grid, level) → [{ points: [x,z,…], closed }]
//   contourPaths(grid, { interval, indexEvery, project, smooth }) → [{ level, index, d }]
//   polylinePath(line, project) · contourLevels(min, max, interval) · labelAnchor(lines, project)
//
// OPTIMIZER (optimizer.ts)
//   new MomentumDescent(x, z, { lr, beta, bounds }).step(field) · .settled · .wake()
//   descendPath(field, x, z) → { points, x, z, h, steps }
//
// RENDERING
//   readPalette() → token colours (palette.ts)
//   createContourMaterial({ field, palette, density, heightScale, … }) + syncField(mat, field)
//     + setMasks(mat, rects, cssHeight, dpr)            (shader.ts; uniforms listed there)
//   <ContourTerrain field palette size center segments options materialRef/>   (R3F)
//   <ContourMap field bounds width height …/>   static SVG contour map (ContourMap.tsx)
//
// World axes: x east, z south (−z is "north", up the sheet), y up = height × heightScale.
// ─────────────────────────────────────────────────────────────────────────────

export * from "./field";
export * from "./contours";
export * from "./optimizer";
export * from "./palette";
