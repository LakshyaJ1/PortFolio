"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { ContourTerrain } from "@/components/terrain/ContourTerrain";
import { heightRange, intersectField } from "@/components/terrain/field";
import { readPalette, toHex, type Palette } from "@/components/terrain/palette";
import { setMasks, type ContourMaterial } from "@/components/terrain/shader";
import { useApp } from "@/lib/store";
import { heroFocus, useHero, type Rect, type RendererApi } from "./heroStore";
import { DENSITY, HEIGHT_SCALE, INDEX_EVERY, getHeroSim, type HeroSim } from "./landscape";
import { TerrainOverlay, type OverlayHandle } from "./TerrainOverlay";
import styles from "./Hero.module.css";

// The drawn plane: far wider than the sheet so the oblique view never shows an edge.
const PLANE_CENTER: [number, number] = [0.8, -2.2];
const PLANE_SIZE: [number, number] = [26, 18];
const PLANE_SEGMENTS: [number, number] = [320, 224];
const MARBLE_R = 0.062;
const MAX_SLOTS = 4;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

type Rig = { look: THREE.Vector3; dir: THREE.Vector3; dist: number; sway: THREE.Vector2; swayTo: THREE.Vector2 };

/** Place the camera so the target basin lands at a fixed spot of the frame, at any aspect. */
function frameCamera(cam: THREE.PerspectiveCamera, w: number, h: number, sim: HeroSim, rig: Rig, masks: Rect[]) {
  const aspect = w / Math.max(h, 1);
  const narrow = aspect < 0.85;
  cam.fov = narrow ? 42 : 30;
  cam.aspect = aspect;
  cam.near = 0.1;
  cam.far = 120;
  const tilt = THREE.MathUtils.degToRad(narrow ? 38 : 38); // from straight down
  rig.dir.set(0, Math.cos(tilt), Math.sin(tilt));
  const span = narrow ? 4.8 : Math.min(10.5, Math.max(7.6, aspect * 5.7));
  const dist = span / 2 / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * aspect);
  rig.dist = dist;
  const want = heroFocus(w, h, masks);
  const wx = want.x * 2 - 1;
  const wy = 1 - want.y * 2;
  const T = new THREE.Vector3(sim.target.x, 0, sim.target.z);
  const L = T.clone();
  const tmp = new THREE.Vector3();
  const place = (look: THREE.Vector3) => {
    cam.position.copy(look).addScaledVector(rig.dir, dist);
    cam.lookAt(look);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  };
  const proj = (look: THREE.Vector3) => {
    place(look);
    tmp.copy(T).project(cam);
    return [tmp.x, tmp.y];
  };
  for (let i = 0; i < 8; i++) {
    const [px, py] = proj(L);
    const ex = px - wx;
    const ey = py - wy;
    if (Math.abs(ex) + Math.abs(ey) < 1e-5) break;
    const e = 0.05;
    const [ax, ay] = proj(new THREE.Vector3(L.x + e, 0, L.z));
    const [bx, by] = proj(new THREE.Vector3(L.x, 0, L.z + e));
    const j11 = (ax - px) / e;
    const j21 = (ay - py) / e;
    const j12 = (bx - px) / e;
    const j22 = (by - py) / e;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-9) break;
    L.x -= (j22 * ex - j12 * ey) / det;
    L.z -= (-j21 * ex + j11 * ey) / det;
  }
  rig.look.copy(L);
  place(L);
}

export default function HeroTerrain3D({ active, onLost }: { active: boolean; onLost: () => void }) {
  const [palette] = useState(readPalette);
  const sim = getHeroSim();
  const overlay = useRef<OverlayHandle>(null);
  const lostRef = useRef(onLost);
  useEffect(() => {
    lostRef.current = onLost;
  });
  // R3F forces a context loss when it disposes; only a loss while mounted is a real one
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  return (
    <div className={styles.gl}>
      <Canvas
        dpr={[1, 1.75]}
        flat
        frameloop={active ? "demand" : "never"}
        gl={{ antialias: true, alpha: false, stencil: false, powerPreference: "high-performance" }}
        camera={{ fov: 30, near: 0.1, far: 120, position: [0, 9, 6] }}
        style={{ pointerEvents: "none" }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color(toHex(palette.z1)), 1);
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            if (!alive.current) return;
            e.preventDefault();
            lostRef.current();
          });
        }}
      >
        <Scene palette={palette} sim={sim} overlay={overlay} active={active} />
      </Canvas>
      <TerrainOverlay ref={overlay} sim={sim} />
    </div>
  );
}

function Scene({
  palette,
  sim,
  overlay,
  active,
}: {
  palette: Palette;
  sim: HeroSim;
  overlay: RefObject<OverlayHandle | null>;
  active: boolean;
}) {
  const matRef = useRef<ContourMaterial | null>(null);
  const { camera, size, gl, invalidate } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const rig = useRef<Rig>({ look: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0), dist: 10, sway: new THREE.Vector2(), swayTo: new THREE.Vector2() });
  const sizeRef = useRef(size);
  useLayoutEffect(() => {
    sizeRef.current = size;
  });
  const riseRef = useRef(0);
  const state = useRef({
    started: false,
    t: 0,
    reveal: -1,
    flow: 0,
    flowSpeed: 0,
    fix: 0,
    fixPublished: 0,
    hadFix: false,
    ripple: null as null | { x: number; z: number; age: number },
    rippleSeen: useHero.getState().ripple,
    readySent: false,
  });
  const wideMax = useMemo(
    () =>
      heightRange(sim.field, {
        x0: PLANE_CENTER[0] - PLANE_SIZE[0] / 2,
        x1: PLANE_CENTER[0] + PLANE_SIZE[0] / 2,
        z0: PLANE_CENTER[1] - PLANE_SIZE[1] / 2,
        z1: PLANE_CENTER[1] + PLANE_SIZE[1] / 2,
      })[1],
    [sim],
  );

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const pv = useMemo(() => new THREE.Vector3(), []);

  const api = useMemo<RendererApi>(() => {
    const pick = (cx: number, cy: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, cam);
      const o = raycaster.ray.origin;
      const d = raycaster.ray.direction;
      const hit = intersectField(sim.field, [o.x, o.y, o.z], [d.x, d.y, d.z], {
        yScale: HEIGHT_SCALE * Math.max(riseRef.current, 1e-3),
        tMax: rig.current.dist * 3,
        steps: 220,
      });
      return hit ? { x: hit.x, z: hit.z } : null;
    };
    const project = (x: number, z: number) => {
      pv.set(x, sim.field.height(x, z) * HEIGHT_SCALE * riseRef.current, z).project(cam);
      if (pv.z > 1) return null;
      const s = sizeRef.current;
      return { x: ((pv.x + 1) / 2) * s.width, y: ((1 - pv.y) / 2) * s.height };
    };
    return { kind: "3d", deform: true, pick, project, wake: () => invalidate() };
  }, [gl, cam, sim, raycaster, ndc, pv, invalidate]);

  useEffect(() => {
    useHero.getState().setRenderer(api);
    return () => {
      if (useHero.getState().renderer === api) useHero.getState().setRenderer(null);
    };
  }, [api]);

  // anything the visitor or the page does wakes the sleeping loop
  useEffect(() => {
    // inputs only: readouts this loop publishes itself must not wake it again
    const a = useHero.subscribe((s, p) => {
      if (s.pointer !== p.pointer || s.masks !== p.masks || s.thinking !== p.thinking || s.ripple !== p.ripple) invalidate();
    });
    const b = useApp.subscribe((s, p) => {
      if (s.phase !== p.phase) invalidate();
    });
    const c = sim.on(() => invalidate());
    return () => {
      a();
      b();
      c();
    };
  }, [invalidate, sim]);

  // frameloop flips from "never" to "demand" in the same commit, so wake on the next frames
  useEffect(() => {
    if (!active) return;
    let id = requestAnimationFrame(() => {
      invalidate();
      id = requestAnimationFrame(() => invalidate());
    });
    return () => cancelAnimationFrame(id);
  }, [active, invalidate]);

  const masks = useHero((s) => s.masks);
  useLayoutEffect(() => {
    frameCamera(cam, size.width, size.height, sim, rig.current, masks);
    invalidate();
  }, [cam, size.width, size.height, sim, invalidate, masks]);

  const sampleRef = useRef([0, 0, 0]);

  useFrame((frame, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const cam = frame.camera as THREE.PerspectiveCamera;
    const sample = sampleRef.current;
    const s = state.current;
    const dt = Math.min(delta, 1 / 20);
    const u = mat.uniforms;
    let busy = false;

    // entrance: levels draw in from the target upward while the ground lifts from flat
    if (!s.started && useApp.getState().phase === "site") s.started = true;
    if (s.started && s.t < 3.4) {
      s.t += dt;
      busy = true;
    }
    if (s.started) {
      const p = 1 - Math.pow(1 - clamp01(s.t / 2.8), 2);
      s.reveal = s.t >= 3.4 ? 1e4 : -0.05 + (wideMax + 0.12) * Math.pow(p, 1.8);
      riseRef.current = expoOut(clamp01((s.t - 0.2) / 2.6));
    } else {
      s.reveal = -1;
      riseRef.current = 0;
    }
    u.uReveal.value = s.reveal;
    u.uRise.value = riseRef.current;

    if (sim.update(dt)) busy = true;

    // camera: a slight parallax toward a fine pointer
    const hero = useHero.getState();
    const ptr = hero.pointer;
    const r = rig.current;
    if (ptr.mode === "screen" && !ptr.touch) {
      const rect = gl.domElement.getBoundingClientRect();
      r.swayTo.set(((ptr.cx - rect.left) / rect.width - 0.5) * 2, ((ptr.cy - rect.top) / rect.height - 0.5) * 2);
    } else r.swayTo.set(0, 0);
    if (r.sway.distanceTo(r.swayTo) > 1e-4) {
      r.sway.lerp(r.swayTo, 1 - Math.exp(-dt * 2.5));
      busy = true;
    }
    cam.position.copy(r.look).addScaledVector(r.dir, r.dist);
    cam.position.x += r.sway.x * 0.28;
    cam.position.z += r.sway.y * 0.16;
    cam.lookAt(r.look);
    cam.updateMatrixWorld();

    // the position fix
    let hit: { x: number; z: number } | null = null;
    if (ptr.mode === "world") hit = { x: ptr.x, z: ptr.z };
    else if (ptr.mode === "screen") hit = api.pick(ptr.cx, ptr.cy);
    if (hit) {
      sim.field.sample(hit.x, hit.z, sample);
      const g = Math.hypot(sample[1], sample[2]);
      u.uPointer.value.x = hit.x;
      u.uPointer.value.y = hit.z;
      u.uPointer.value.w = sample[0];
      if (g > 1e-4) u.uPointerDir.value.set(-sample[2] / g, sample[1] / g);
      const arm = 0.02 * r.dist;
      u.uFixSize.value.set(arm, arm * 1.35, arm * 1.35 + (arm * 0.42 - arm * 1.35) * clamp01(g * 2.5));
      const now = performance.now();
      const prev = hero.fix;
      const moved = !prev || Math.abs(prev.x - hit.x) + Math.abs(prev.z - hit.z) > 1e-4 || Math.abs(prev.loss - sample[0]) > 1e-4;
      if (moved && now - s.fixPublished > 50) {
        s.fixPublished = now;
        hero.setFix({ x: hit.x, z: hit.z, loss: sample[0], grad: g });
      } else if (moved) busy = true;
      s.hadFix = true;
    } else if (s.hadFix) {
      s.hadFix = false;
      hero.setFix(null);
    }
    const fixTo = hit ? 1 : 0;
    if (Math.abs(s.fix - fixTo) > 0.004) {
      s.fix += (fixTo - s.fix) * (1 - Math.exp(-dt * 12));
      busy = true;
    } else s.fix = fixTo;
    u.uPointer.value.z = s.fix;

    // living surface: contours flow while the agent thinks, then settle back onto true levels
    const flowTo = hero.thinking ? 0.9 : 0;
    s.flowSpeed += (flowTo - s.flowSpeed) * (1 - Math.exp(-dt * 2));
    if (hero.thinking || s.flowSpeed > 0.02) {
      s.flow += s.flowSpeed * dt;
      busy = true;
    } else {
      const home = Math.round(s.flow / INDEX_EVERY) * INDEX_EVERY;
      if (Math.abs(home - s.flow) > 0.002) {
        s.flow += (home - s.flow) * (1 - Math.exp(-dt * 2.2));
        busy = true;
      } else s.flow = home;
    }
    u.uFlow.value = s.flow;

    // ripple from the middle of the screen when a geocache is found
    if (hero.ripple !== s.rippleSeen) {
      s.rippleSeen = hero.ripple;
      const c = api.pick(window.innerWidth / 2, window.innerHeight / 2) ?? { x: r.look.x, z: r.look.z };
      s.ripple = { x: c.x, z: c.z, age: 0 };
    }
    if (s.ripple) {
      s.ripple.age += dt;
      const k = 1 - s.ripple.age / 2.6;
      if (k <= 0) {
        s.ripple = null;
        u.uRipple.value.w = 0;
      } else {
        u.uRipple.value.set(s.ripple.x, s.ripple.z, s.ripple.age * 2.6, k * k);
        busy = true;
      }
    }

    // contact shadows under marbles
    const marks = u.uMarks.value as Float32Array;
    let n = 0;
    for (const m of sim.marbles) {
      if (n >= marks.length / 4) break;
      marks.set([m.opt.x, m.opt.z, 0.05 + 0.05 * m.drop, 0.6 * m.drop], n * 4);
      n++;
    }
    u.uMarkCount.value = n;

    u.uFog.value.set(r.dist * 1.08, r.dist * 2.1);
    setMasks(mat, hero.masks, size.height, gl.getPixelRatio());
    overlay.current?.update(api.project);

    if (!s.readySent) {
      s.readySent = true;
      hero.setReady(true);
    }
    if (busy) frame.invalidate();
  });

  return (
    <>
      <ContourTerrain
        field={sim.field}
        palette={palette}
        size={PLANE_SIZE}
        center={PLANE_CENTER}
        segments={PLANE_SEGMENTS}
        options={{ density: DENSITY, indexEvery: INDEX_EVERY, heightScale: HEIGHT_SCALE, lineWidth: 1, indexWidth: 1.85, fog: [11, 22] }}
        materialRef={matRef}
      />
      <Marbles sim={sim} palette={palette} riseRef={riseRef} />
    </>
  );
}

const marbleVertex = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const marbleFragment = /* glsl */ `
uniform vec3 uFix;
uniform vec3 uFixHi;
uniform vec3 uDeep;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.45, 0.75, 0.5));
  float d = max(dot(n, L), 0.0);
  vec3 col = mix(mix(uDeep, uFix, 0.55), uFixHi, d);
  float spec = pow(max(dot(reflect(-L, n), normalize(vV)), 0.0), 28.0);
  gl_FragColor = vec4(col + spec * 0.45, 1.0);
}
`;

type Slot = { mesh: THREE.Mesh; line: Line2; id: number; seen: number; seenField: number; seenRise: number; built: number; settled: boolean };

function Marbles({ sim, palette, riseRef }: { sim: HeroSim; palette: Palette; riseRef: RefObject<number> }) {
  const { size } = useThree();
  const { group, slots, dispose } = useMemo(() => {
    const sphere = new THREE.SphereGeometry(MARBLE_R, 28, 20);
    const v = (c: [number, number, number]) => new THREE.Vector3(c[0], c[1], c[2]);
    const shell = new THREE.ShaderMaterial({
      uniforms: { uFix: { value: v(palette.fix) }, uFixHi: { value: v(palette.fixHi) }, uDeep: { value: v(palette.z0) } },
      vertexShader: marbleVertex,
      fragmentShader: marbleFragment,
    });
    const group = new THREE.Group();
    const slots: Slot[] = Array.from({ length: MAX_SLOTS }, () => {
      const mesh = new THREE.Mesh(sphere, shell);
      mesh.visible = false;
      const lineMat = new LineMaterial({
        color: toHex(palette.fix),
        linewidth: 1.6,
        dashed: true,
        dashSize: 0.075,
        gapSize: 0.055,
        worldUnits: false,
        transparent: true,
        opacity: 0.95,
      });
      const line = new Line2(new LineGeometry(), lineMat);
      line.visible = false;
      line.frustumCulled = false;
      group.add(mesh, line);
      return { mesh, line, id: -1, seen: -1, seenField: -1, seenRise: -1, built: 0, settled: false };
    });
    const dispose = () => {
      sphere.dispose();
      shell.dispose();
      slots.forEach((s) => {
        s.line.geometry.dispose();
        s.line.material.dispose();
      });
    };
    return { group, slots, dispose };
  }, [palette]);

  useEffect(() => dispose, [dispose]);

  useFrame(() => {
    const rise = riseRef.current ?? 1;
    const ys = HEIGHT_SCALE * rise;
    const now = performance.now();
    const last = sim.marbles.length - 1;
    slots.forEach((s, i) => {
      const m = sim.marbles[i];
      s.line.material.resolution.set(size.width, size.height);
      if (!m) {
        s.mesh.visible = false;
        s.line.visible = false;
        s.id = -1;
        return;
      }
      const h = sim.field.height(m.opt.x, m.opt.z);
      const fall = 1 - m.drop;
      s.mesh.position.set(m.opt.x, h * ys + MARBLE_R + fall * fall * 1.6, m.opt.z);
      s.mesh.visible = true;
      s.line.material.opacity = i === last ? 0.95 : 0.45;

      const settled = m.state === "settled";
      const changed = s.id !== m.id || s.seen !== m.trackVersion || s.seenField !== sim.field.version || s.seenRise !== rise;
      if (!changed) return;
      if (s.id === m.id && !settled && s.settled === settled && now - s.built < 60 && s.seenField === sim.field.version) return;
      s.id = m.id;
      s.seen = m.trackVersion;
      s.seenField = sim.field.version;
      s.seenRise = rise;
      s.built = now;
      s.settled = settled;
      const t = m.track;
      if (t.length < 4) {
        s.line.visible = false;
        return;
      }
      const pos = new Float32Array((t.length / 2) * 3);
      for (let k = 0, j = 0; k < t.length; k += 2, j += 3) {
        pos[j] = t[k];
        pos[j + 1] = sim.field.height(t[k], t[k + 1]) * ys + 0.022;
        pos[j + 2] = t[k + 1];
      }
      const geo = new LineGeometry();
      geo.setPositions(pos);
      s.line.geometry.dispose();
      s.line.geometry = geo;
      s.line.computeLineDistances();
      s.line.visible = true;
    });
  });

  return <primitive object={group} />;
}
