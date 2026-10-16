"use client";

// Terrain toolkit · <ContourTerrain/>: a displaced plane drawn with the contour material.
// Use inside an R3F <Canvas flat>. The material is exposed through `materialRef` so a scene
// can drive the optional layers (pointer fix, ripple, masks, rise, flow).

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HeightField } from "./field";
import type { Palette } from "./palette";
import { createContourMaterial, syncField, type ContourMaterial, type ContourMaterialOptions } from "./shader";

export type ContourTerrainProps = {
  field: HeightField;
  palette: Palette;
  /** world extent of the drawn plane [x, z]; default: 1.8× the field bounds */
  size?: [number, number];
  /** world centre of the plane [x, z]; default: centre of the field bounds */
  center?: [number, number];
  /** grid segments [x, z]; ~0.06 world units per segment reads smooth */
  segments?: [number, number];
  /** material options (density, heightScale, line widths, light, fog, mask/mark budgets) */
  options?: Omit<ContourMaterialOptions, "field" | "palette">;
  materialRef?: RefObject<ContourMaterial | null>;
};

export function ContourTerrain({ field, palette, size, center, segments, options, materialRef }: ContourTerrainProps) {
  const b = field.bounds;
  const w = size?.[0] ?? (b.x1 - b.x0) * 1.8;
  const d = size?.[1] ?? (b.z1 - b.z0) * 1.8;
  const cx = center?.[0] ?? (b.x0 + b.x1) / 2;
  const cz = center?.[1] ?? (b.z0 + b.z1) / 2;
  const sx = segments?.[0] ?? Math.min(320, Math.round(w / 0.06));
  const sz = segments?.[1] ?? Math.min(320, Math.round(d / 0.06));

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, d, sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0, cz);
    return g;
  }, [w, d, sx, sz, cx, cz]);

  // Options are read once per field/palette; drive later changes through the uniforms.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const material = useMemo(() => createContourMaterial({ field, palette, ...options }), [field, palette]);

  const live = useRef<ContourMaterial | null>(null);
  useEffect(() => {
    live.current = material;
    if (materialRef) materialRef.current = material;
    return () => {
      if (materialRef && materialRef.current === material) materialRef.current = null;
    };
  }, [material, materialRef]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => {
      material.userData.texture?.dispose();
      material.dispose();
    },
    [material],
  );

  useFrame(({ gl }) => {
    const m = live.current;
    if (!m) return;
    syncField(m, field);
    m.uniforms.uDpr.value = gl.getPixelRatio();
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
