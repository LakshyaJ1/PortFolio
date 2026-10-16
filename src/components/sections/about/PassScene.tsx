"use client";

// The field pass on a survey-tape lanyard: rapier rope joints + a camera-facing ribbon strap,
// everything built procedurally (no GLB, no remote textures, no CDN environment).
//
// Why the strap is drawn here and not with meshline: meshline 3.3's vertex shader multiplies the
// current clip position by the canvas aspect but not its neighbours, so on a non-square canvas its
// end-cap test (`prevP == currentP`) fails by a rounding error and the last segment takes its
// direction from float noise: it shears, twists or drops out, differently on every frame the rope
// moves by a hair. The same `* aspect` also made the width and squareness of the strap depend on
// which way it pointed. Our ribbon is built on the CPU in world space: same width as the card's own
// scale, ends squared off by real tangents, print laid along true arc length from the clip.
//
// Frame order matters as much: rapier draws bodies at an interpolated pose, so the strap is built
// after the step from those same interpolated poses (never raw `translation()`), or the strap's end
// slips against the clip by a fraction of a physics step that changes with every frame's timing.

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useRopeJoint,
  useSphericalJoint,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useLatest } from "@/lib/hooks";
import { faceScale, type PassArt } from "./passArt";

export type Face = "front" | "back";

// world units: the card is 1.6 × 2.25, like a CR80 badge on a portrait lanyard
const CARD_W = 1.6;
const CARD_H = 2.25;
const CARD_D = 0.018;
const CORNER = 0.085;
const SEG = 0.55; // rope segment length
const HANG = 1.42; // strap anchor above the card centre (card-local)
const CAM_Z = 13;
const PPU = 196; // target pixels per world unit on roomy stages
const REST_SPAN = 3 * SEG + HANG + CARD_H / 2 + 0.32; // anchor → resting card bottom, plus air
const STEER = 0.11; // how hard the card turns to face its target side (per 60 Hz frame)
const STRAP_W = 0.2 * CARD_W; // strap width, a constant share of the card
const STRAP_SEGMENTS = 48;

// One frame, in order: input (drag target, steering) → physics step → strap and shading.
const PRE_STEP = -2;
const STEP = -1;
// (the strap's own useFrame keeps the default priority 0, so it runs after the step)

const TONE = {
  paperEdge: "#cfd8d1", // z9
  metal: "#9eaba2", // z8
};

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** The printed faces are unlit (exact ink, no glare); a flat card only darkens as it turns away. */
const shade = (facing: number) => 0.7 + 0.3 * THREE.MathUtils.smoothstep(facing, 0.1, 0.92);

/**
 * A camera-facing ribbon along a curve. Width is in world units, so it keeps its proportion to the
 * card under perspective; the u coordinate is arc length from the clip end, so the print neither
 * stretches nor swims; the side vector comes from real tangents, so both ends are squared off.
 * Buffers are allocated once and rewritten in place.
 */
function createStrap(segments: number) {
  const n = segments + 1;
  const pos = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  const index: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const position = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const uvs = new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute("position", position);
  geometry.setAttribute("uv", uvs);

  const pts = Array.from({ length: n }, () => new THREE.Vector3());
  const tan = new THREE.Vector3();
  const view = new THREE.Vector3();
  const side = new THREE.Vector3();
  const prev = new THREE.Vector3();

  const update = (curve: THREE.Curve<THREE.Vector3>, eye: THREE.Vector3, halfWidth: number, tile: number) => {
    for (let i = 0; i < n; i++) curve.getPoint(i / segments, pts[i]);
    let s = 0;
    prev.set(1, 0, 0);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (i > 0) s += p.distanceTo(pts[i - 1]);
      tan.subVectors(pts[Math.min(i + 1, segments)], pts[Math.max(i - 1, 0)]).normalize();
      view.subVectors(eye, p).normalize();
      side.crossVectors(tan, view);
      if (side.lengthSq() < 1e-8) side.copy(prev);
      else {
        side.normalize();
        // never let the ribbon flip over between neighbouring samples
        if (i > 0 && side.dot(prev) < 0) side.negate();
      }
      prev.copy(side);
      const o = i * 6;
      pos[o] = p.x - side.x * halfWidth;
      pos[o + 1] = p.y - side.y * halfWidth;
      pos[o + 2] = p.z - side.z * halfWidth;
      pos[o + 3] = p.x + side.x * halfWidth;
      pos[o + 4] = p.y + side.y * halfWidth;
      pos[o + 5] = p.z + side.z * halfWidth;
      // the tile runs toward the clip, so the name reads down the strap and ends just above the card
      const u = -s / tile;
      const q = i * 4;
      uv[q] = u;
      uv[q + 1] = 0;
      uv[q + 2] = u;
      uv[q + 3] = 1;
    }
    position.needsUpdate = true;
    uvs.needsUpdate = true;
  };

  return { geometry, update };
}

type Lens = { halfH: number; halfW: number; ppu: number };

/** Choose the field of view so the card keeps a steady pixel size and the resting pass always fits. */
function useLens(): Lens {
  const size = useThree((s) => s.size);
  const get = useThree((s) => s.get);
  const halfH = Math.max(size.height / (2 * PPU), REST_SPAN / 2);
  const halfW = halfH * (size.width / Math.max(1, size.height));
  useLayoutEffect(() => {
    const camera = get().camera as THREE.PerspectiveCamera;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfH / CAM_Z));
    camera.updateProjectionMatrix();
  }, [get, halfH, size.width, size.height]);
  return { halfH, halfW, ppu: size.height / (2 * halfH) };
}

type BandProps = { art: PassArt; face: Face; onTap: () => void; onReady: () => void };

function Band({ art, face, onTap, onReady }: BandProps) {
  const { halfH, halfW, ppu } = useLens();
  const get = useThree((s) => s.get);
  const gl = useThree((s) => s.gl);
  const dpr = useThree((s) => s.viewport.dpr);

  const fixed = useRef<RapierRigidBody>(null!);
  const j1 = useRef<RapierRigidBody>(null!);
  const j2 = useRef<RapierRigidBody>(null!);
  const j3 = useRef<RapierRigidBody>(null!);
  const card = useRef<RapierRigidBody>(null!);
  // markers inside the bodies: rapier moves their parents to the interpolated pose it draws
  const m1 = useRef<THREE.Group>(null!);
  const m2 = useRef<THREE.Group>(null!);
  const clip = useRef<THREE.Group>(null!);
  const pass = useRef<THREE.Group>(null!);
  const frontMat = useRef<THREE.MeshBasicMaterial>(null!);
  const backMat = useRef<THREE.MeshBasicMaterial>(null!);

  const faceRef = useLatest(face);
  const onTapRef = useLatest(onTap);
  const ready = useRef(false);
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const lerped = useRef<{ a: THREE.Vector3 | null; b: THREE.Vector3 | null }>({ a: null, b: null });

  const [tmp] = useState(() => ({
    ndc: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    hit: new THREE.Vector3(),
    p: new THREE.Vector3(),
    n: new THREE.Vector3(),
    v: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    e: new THREE.Euler(),
  }));
  const [curve] = useState(() => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    c.curveType = "chordal";
    return c;
  });
  const [strap] = useState(() => createStrap(STRAP_SEGMENTS));
  useEffect(() => () => strap.geometry.dispose(), [strap]);

  // where the rig starts: the strap pinned at the top edge, the pass held out to the right
  const [y0] = useState(halfH);
  const [dragged, setDragged] = useState<THREE.Vector3 | null>(null);
  const [hovered, setHovered] = useState(false);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], SEG]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], SEG]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], SEG]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, HANG, 0]]);

  // keep the pin on the top edge when the stage resizes
  useEffect(() => {
    fixed.current?.setTranslation({ x: 0, y: halfH, z: 0 }, true);
    [j1, j2, j3, card].forEach((r) => r.current?.wakeUp());
  }, [halfH]);

  useEffect(() => {
    get().gl.domElement.style.cursor = dragged ? "grabbing" : hovered ? "grab" : "";
  }, [get, hovered, dragged]);

  // never leave the pass stuck to the pointer if the gesture is taken over (scroll, context menu)
  useEffect(() => {
    if (!dragged) return;
    const end = () => setDragged(null);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
    };
  }, [dragged]);

  // The faces are rasterised at the size they're shown (card height × device pixels), so the sampler
  // reads the sharpest level 1:1 instead of averaging text away in a mip; anisotropy covers the turns.
  const aniso = gl.capabilities.getMaxAnisotropy();
  const scale = faceScale(CARD_H * ppu * dpr);
  const textures = useMemo(() => {
    const faces = art.faces(scale);
    const make = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    };
    return { front: make(faces.front), back: make(faces.back) };
  }, [art, scale, aniso]);
  useEffect(
    () => () => {
      textures.front.dispose();
      textures.back.dispose();
    },
    [textures],
  );
  const strapTex = useMemo(() => {
    const t = new THREE.CanvasTexture(art.strap);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }, [art, aniso]);
  useEffect(() => () => strapTex.dispose(), [strapTex]);

  const geo = useMemo(() => {
    const shape = roundedRect(CARD_W, CARD_H, CORNER);
    const face = new THREE.ShapeGeometry(shape, 12);
    const pos = face.attributes.position;
    const uv = face.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
    uv.needsUpdate = true;
    const body = new THREE.ExtrudeGeometry(shape, { depth: CARD_D, bevelEnabled: false, curveSegments: 12 });
    body.translate(0, 0, -CARD_D / 2);
    return { face, body };
  }, []);
  useEffect(
    () => () => {
      geo.face.dispose();
      geo.body.dispose();
    },
    [geo],
  );

  // 1 · before the step: where the pointer wants the card, and which side it should turn to
  useFrame((state, delta) => {
    const c = card.current;
    const f = fixed.current;
    if (!c || !f || !j1.current || !j2.current || !j3.current) return;
    const dt = Math.min(delta, 1 / 20);

    if (dragged) {
      // pointer ray → the z = 0 plane the pass swings in
      tmp.ndc.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      tmp.dir.copy(tmp.ndc).sub(state.camera.position).normalize();
      const t = -state.camera.position.z / (tmp.dir.z || -1);
      tmp.hit.copy(state.camera.position).addScaledVector(tmp.dir, t);
      const x = THREE.MathUtils.clamp(tmp.hit.x - dragged.x, -halfW + CARD_W * 0.56, halfW - CARD_W * 0.56);
      const y = THREE.MathUtils.clamp(tmp.hit.y - dragged.y, -halfH + CARD_H * 0.5, halfH - 0.15);
      [c, j1.current, j2.current, j3.current, f].forEach((b) => b.wakeUp());
      c.setNextKinematicTranslation({ x, y, z: tmp.hit.z - dragged.z });
      return;
    }

    // turn toward the requested face (front by default); scaled by time, not by refresh rate
    const r = c.rotation();
    tmp.q.set(r.x, r.y, r.z, r.w);
    tmp.e.setFromQuaternion(tmp.q, "YXZ");
    const target = faceRef.current === "back" ? Math.PI : 0;
    const off = Math.atan2(Math.sin(target - tmp.e.y), Math.cos(target - tmp.e.y));
    const av = c.angvel();
    if (Math.abs(off) > 0.002 || Math.abs(av.y) > 0.002) {
      c.setAngvel({ x: av.x, y: av.y + off * STEER * 60 * dt, z: av.z }, true);
    }
  }, PRE_STEP);

  // 3 · after the step: the strap and the face shading, from the poses drawn this frame
  useFrame((state, delta) => {
    const f = fixed.current;
    if (!f || !m1.current || !m2.current || !clip.current || !pass.current) return;
    const dt = Math.min(delta, 1 / 20);

    // smooth the two middle joints so an over-pulled strap doesn't jitter
    const follow = (key: "a" | "b", marker: THREE.Object3D) => {
      marker.getWorldPosition(tmp.p);
      let l = lerped.current[key];
      if (!l) l = lerped.current[key] = tmp.p.clone();
      const d = THREE.MathUtils.clamp(l.distanceTo(tmp.p), 0.1, 1);
      return l.lerp(tmp.p, 1 - Math.exp(-dt * (10 + d * 40)));
    };
    clip.current.getWorldPosition(curve.points[0]);
    curve.points[1].copy(follow("b", m2.current));
    curve.points[2].copy(follow("a", m1.current));
    const p0 = f.translation();
    curve.points[3].set(p0.x, p0.y, p0.z);
    strap.update(curve, state.camera.position, STRAP_W / 2, STRAP_W * art.strapAspect);

    // a flat card shades as one: by how squarely each face looks at the viewer
    pass.current.getWorldQuaternion(tmp.q);
    pass.current.getWorldPosition(tmp.p);
    tmp.n.set(0, 0, 1).applyQuaternion(tmp.q);
    const facing = tmp.n.dot(tmp.v.subVectors(state.camera.position, tmp.p).normalize());
    frontMat.current?.color.setScalar(shade(facing));
    backMat.current?.color.setScalar(shade(-facing));

    if (!ready.current) {
      ready.current = true;
      onReady();
    }
  });

  const segment = { type: "dynamic" as const, canSleep: true, colliders: false as const, angularDamping: 2, linearDamping: 2 };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    down.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, t: performance.now() };
    const p = card.current.translation();
    setDragged(new THREE.Vector3().copy(e.point).sub(tmp.p.set(p.x, p.y, p.z)));
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    (e.target as unknown as Element).releasePointerCapture(e.pointerId);
    setDragged(null);
    const d = down.current;
    down.current = null;
    if (d && Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) < 8 && performance.now() - d.t < 450) {
      onTapRef.current();
    }
  };

  // the printed faces sit a hair above the card body; polygon offset keeps them on top at grazing angles
  const print = { toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };

  return (
    <>
      <RigidBody ref={fixed} {...segment} type="fixed" position={[0, y0, 0]} />
      <RigidBody ref={j1} {...segment} position={[SEG * 0.75, y0, 0]}>
        <BallCollider args={[0.1]} />
        <group ref={m1} />
      </RigidBody>
      <RigidBody ref={j2} {...segment} position={[SEG * 1.5, y0, 0]}>
        <BallCollider args={[0.1]} />
        <group ref={m2} />
      </RigidBody>
      <RigidBody ref={j3} {...segment} position={[SEG * 2.25, y0, 0]}>
        <BallCollider args={[0.1]} />
      </RigidBody>
      <RigidBody
        ref={card}
        {...segment}
        position={[SEG * 2.25 + 0.6, y0 - 0.4, 0]}
        type={dragged ? "kinematicPosition" : "dynamic"}
      >
        <CuboidCollider args={[CARD_W / 2, CARD_H / 2, 0.01]} />
        <group
          ref={pass}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onLostPointerCapture={() => setDragged(null)}
        >
          <mesh geometry={geo.body}>
            <meshStandardMaterial color={TONE.paperEdge} roughness={0.55} metalness={0} />
          </mesh>
          <mesh geometry={geo.face} position={[0, 0, CARD_D / 2 + 0.0008]}>
            <meshBasicMaterial ref={frontMat} map={textures.front} {...print} />
          </mesh>
          <mesh geometry={geo.face} position={[0, 0, -(CARD_D / 2 + 0.0008)]} rotation={[0, Math.PI, 0]}>
            <meshBasicMaterial ref={backMat} map={textures.back} {...print} />
          </mesh>
          {/* clip hardware: clamp over the slot, split ring, swivel */}
          <RoundedBox args={[0.34, 0.15, 0.05]} radius={0.022} smoothness={3} position={[0, CARD_H / 2 - 0.04, 0]}>
            <meshStandardMaterial color={TONE.metal} metalness={0.92} roughness={0.32} />
          </RoundedBox>
          <mesh position={[0, CARD_H / 2 + 0.11, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.085, 0.017, 12, 36]} />
            <meshStandardMaterial color={TONE.metal} metalness={0.95} roughness={0.25} />
          </mesh>
          <mesh position={[0, HANG - 0.075, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.15, 14]} />
            <meshStandardMaterial color={TONE.metal} metalness={0.95} roughness={0.28} />
          </mesh>
          {/* where the strap meets the swivel */}
          <group ref={clip} position={[0, HANG, 0]} />
        </group>
      </RigidBody>
      {/* the ribbon is rebuilt every frame and always on stage: no stale bounds to cull it by */}
      <mesh geometry={strap.geometry} frustumCulled={false}>
        <meshBasicMaterial map={strapTex} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </>
  );
}

type SceneProps = BandProps & { active: boolean; onLost: () => void };

export default function PassScene({ art, face, onTap, onReady, active, onLost }: SceneProps) {
  const onLostRef = useLatest(onLost);
  return (
    <Canvas
      style={{ position: "absolute", inset: 0, touchAction: "pan-y" }}
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.75]}
      flat
      camera={{ position: [0, 0, CAM_Z], fov: 22, near: 2, far: 30 }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", () => onLostRef.current(), { once: true });
      }}
      aria-hidden="true"
    >
      <ambientLight intensity={2.1} />
      <directionalLight position={[-4, 5, 9]} intensity={1.15} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -40, 0]} timeStep={1 / 60} interpolate paused={!active} updatePriority={STEP}>
          <Band art={art} face={face} onTap={onTap} onReady={onReady} />
        </Physics>
      </Suspense>
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={8} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
      </Environment>
    </Canvas>
  );
}
