"use client";

// The stage's ground in 3D: one three.js canvas behind everything (the avatar keeps its own small
// WebGL canvas on top). The survey ground he stands on recedes to a horizon under his name:
//   - contour lines drawn per pixel from the baked height field (stageTerrain.ts), an index line
//     every fifth, fading with distance; a survey grid laid around his station;
//   - "+" grid ticks near his feet that lift and turn survey-orange as pulses of his voice run out
//     across the ground (the narrator's level meter drives them);
//   - a few survey beacons (low-poly diamonds) hovering over other hills, each tied to his station
//     by a dashed triangulation line, placed only where the screen is free of captions and actions;
//   - a tap on open ground drops a ping ring there.
// The camera is pinned so his station (the origin) lands exactly on the stage's station point, and
// it orbits that point by a few degrees with the cursor or the phone's tilt. The stage owns the
// loop: frame() is called from the same rAF as the avatar, after it, and does nothing when hidden.
// Reduced motion: no orbit, pulses, bob or pings; it renders only when something changes.

import * as THREE from "three";
import type { Palette, RGB } from "@/components/terrain";
import { DOMAIN, STEP, groundAt, type GroundBake } from "./stageTerrain";

const FOV = 38;
const DEG = Math.PI / 180;
/** world y per unit of height */
const HS = 0.6;
/** contour interval, in height units (the flat stage field uses the same) */
const INTERVAL = 0.07;
/** mesh spacing (contours come from the texture, so the mesh only shapes silhouettes) */
const MESH = 0.4;
/** how far around the station the grid and its ticks reach (world units) */
const TICK_R = 6;
const BEACON_R = 0.12;
/** how high a beacon hovers over its hill (world units) */
const HOVER = 0.5;
/** a ping ring's life, s */
const PING_LIFE = 1.6;

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export type StageLayout = {
  /** canvas size, CSS px */
  w: number;
  h: number;
  /** his station (between his soles), canvas px */
  stnX: number;
  stnY: number;
  /** CSS px per world unit at the station */
  ppu: number;
  /** where the horizon sits, canvas px from the top */
  horizon: number;
  /** UI the beacons keep clear of, canvas px */
  avoid: Rect[];
  narrow: boolean;
};

export type StageInput = {
  /** his voice, 0–1 */
  level: number;
  /** smoothed pointer / tilt, −1…1 */
  tiltX: number;
  tiltY: number;
  /** spawn reveal 0–1 */
  reveal: number;
};

const v3 = (c: RGB) => new THREE.Vector3(c[0], c[1], c[2]);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/* ─── shaders: every colour is a token, written straight to the framebuffer (sRGB) ─── */

const PULSE = /* glsl */ `
// pulses of his voice running out from the station
float pulse(float r, float t, float level) {
  if (level < 0.002) return 0.0;
  return pow(0.5 + 0.5 * cos(6.2832 * (r * 0.85 - t * 1.5)), 6.0) * exp(-r * 0.2) * level;
}
float band(float dpx, float w) {
  return 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, dpx);
}
`;

const GROUND_VERT = /* glsl */ `
varying vec2 vXZ;
varying float vDist;
void main() {
  vXZ = position.xz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const GROUND_FRAG = /* glsl */ `
uniform highp sampler2D uH;
uniform vec4 uMap;   // x0, z0, 1/step, 1/step
uniform vec2 uSize;  // nx, nz
uniform vec4 uEdge;  // domain x0, z0, x1, z1
uniform float uInterval;
uniform float uDpr;
uniform float uReveal;
uniform float uLevel;
uniform float uTime;
uniform vec4 uPing;  // x, z, age s, on
uniform vec2 uFog;
uniform float uGridR;
uniform vec3 uGround;
uniform vec3 uGrid;
uniform vec3 uMinor;
uniform vec3 uIndex;
uniform vec3 uNear;
uniform vec3 uFix;
varying vec2 vXZ;
varying float vDist;
${PULSE}
float hAt(ivec2 c) {
  c = clamp(c, ivec2(0), ivec2(uSize) - 1);
  return texelFetch(uH, c, 0).r;
}
float height(vec2 p) {
  vec2 g = clamp((p - uMap.xy) * uMap.zw, vec2(0.0), uSize - 1.0001);
  vec2 i = floor(g);
  vec2 f = g - i;
  ivec2 c = ivec2(i);
  return mix(mix(hAt(c), hAt(c + ivec2(1, 0)), f.x), mix(hAt(c + ivec2(0, 1)), hAt(c + ivec2(1, 1)), f.x), f.y);
}
void main() {
  float h = height(vXZ);
  float r = length(vXZ);

  // contours; where levels crowd closer than a few px, minor lines drop out first
  float v = h / uInterval;
  float fw = max(fwidth(v), 1e-4);
  float k = floor(v + 0.5);
  float m = mod(k, 5.0);
  float isIdx = (m < 0.5 || m > 4.5) ? 1.0 : 0.0;
  float line = band(abs(v - k) / fw, mix(1.0, 1.7, isIdx) * uDpr);
  line *= 1.0 - smoothstep(0.22, 0.55, fw / mix(1.0, 5.0, isIdx));

  // the survey grid around the station
  vec2 gw = max(fwidth(vXZ), vec2(1e-4));
  vec2 gd = abs(fract(vXZ + 0.5) - 0.5) / gw;
  float grid = max(band(gd.x, uDpr), band(gd.y, uDpr));
  grid *= (1.0 - smoothstep(0.1, 0.3, max(gw.x, gw.y))) * exp(-r * r / (2.0 * uGridR * uGridR));

  float hot = pulse(r, uTime, uLevel) * 2.2;
  float ping = 0.0;
  if (uPing.w > 0.0) {
    float pr = length(vXZ - uPing.xy);
    float R = 0.15 + uPing.z * 3.2;
    float pw = max(fwidth(pr), 1e-4);
    float life = 1.0 - smoothstep(0.35, 1.0, uPing.z / ${PING_LIFE.toFixed(2)});
    ping = (band(abs(pr - R) / pw, 1.6 * uDpr) + 0.5 * exp(-pow((pr - R) / 0.3, 2.0))) * life;
  }

  float fog = smoothstep(uFog.x, uFog.y, vDist);
  vec2 e2 = min(vXZ - uEdge.xy, uEdge.zw - vXZ);
  float edge = smoothstep(0.0, 6.0, min(e2.x, e2.y));
  float vis = (1.0 - fog) * edge * (1.0 - smoothstep(uReveal - 1.5, uReveal, r));

  vec3 col = mix(uGround, uGrid, grid * vis);
  vec3 lc = mix(uMinor, uIndex, isIdx);
  lc = mix(lc, uNear, exp(-r * r / 18.0) * 0.55);
  float lit = clamp(hot + ping, 0.0, 1.0);
  lc = mix(lc, uFix, lit * 0.85);
  col = mix(col, lc, clamp(line * (1.0 + lit), 0.0, 1.0) * vis);
  col = mix(col, uFix, ping * 0.4 * vis);
  // the spawn front: a thin orange ring running out from his feet, like his scan line
  float front = band(abs(r - uReveal + 0.8) / max(fwidth(r), 1e-4), 1.5 * uDpr);
  col = mix(col, uFix, front * 0.55 * (1.0 - smoothstep(14.0, 30.0, uReveal)) * (1.0 - fog) * edge);
  gl_FragColor = vec4(col, 1.0);
}
`;

const TICK_VERT = /* glsl */ `
uniform float uLevel;
uniform float uTime;
uniform float uDpr;
uniform float uPx;
uniform float uRef;
uniform float uReveal;
varying float vHot;
varying float vA;
varying float vSize;
${PULSE}
void main() {
  float r = length(position.xz);
  float w = pulse(r, uTime, uLevel);
  vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, w * 0.22, 0.0), 1.0);
  gl_Position = projectionMatrix * mv;
  vSize = uPx * uDpr * (1.0 + w * 0.7) * clamp(uRef / -mv.z, 0.5, 1.5);
  gl_PointSize = vSize;
  vHot = clamp(w * 2.6, 0.0, 1.0);
  vA = (1.0 - smoothstep(uReveal - 1.0, uReveal, r)) * (1.0 - smoothstep(${(TICK_R - 2).toFixed(1)}, ${TICK_R.toFixed(1)}, r));
}
`;

const TICK_FRAG = /* glsl */ `
uniform vec3 uTick;
uniform vec3 uFix;
uniform float uDpr;
varying float vHot;
varying float vA;
varying float vSize;
float band(float dpx, float w) {
  return 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, dpx);
}
void main() {
  vec2 q = abs(gl_PointCoord - 0.5) * vSize;
  float arm = step(max(q.x, q.y), vSize * 0.5 - 0.5);
  float plus = max(band(q.x, 1.25 * uDpr), band(q.y, 1.25 * uDpr)) * arm;
  float a = plus * vA * (0.75 + 0.25 * vHot);
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(uTick, uFix, vHot), a);
}
`;

const BEACON_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const BEACON_FRAG = /* glsl */ `
uniform vec3 uLo;
uniform vec3 uHi;
uniform vec3 uLight;
varying vec3 vW;
void main() {
  // flat faces: the normal from screen-space derivatives
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  float l = clamp(dot(n, uLight) * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(mix(uLo, uHi, l * l), 1.0);
}
`;

const LINE_VERT = /* glsl */ `
attribute float aD;
varying float vD;
varying float vDist;
void main() {
  vD = aD;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uDash;
uniform float uReveal;
uniform vec2 uFog;
varying float vD;
varying float vDist;
void main() {
  if (vD > uReveal) discard;
  if (uDash > 0.0 && fract(vD * uDash) > 0.55) discard;
  gl_FragColor = vec4(uColor, uAlpha * (1.0 - smoothstep(uFog.x, uFog.y, vDist)));
}
`;

type Beacon = { mesh: THREE.Mesh; x: number; z: number; y: number; r: number; seed: number; size: number };

export class StageScene {
  onLost: (() => void) | null = null;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 120);
  private ground: THREE.ShaderMaterial;
  private ticks: THREE.ShaderMaterial;
  private beaconMat: THREE.ShaderMaterial;
  private edgeMat: THREE.ShaderMaterial;
  private triMat: THREE.ShaderMaterial;
  private plumbMat: THREE.ShaderMaterial;
  private ringMat: THREE.ShaderMaterial;
  private texture: THREE.DataTexture;
  private octa = new THREE.OctahedronGeometry(BEACON_R, 0);
  private octaEdges: THREE.EdgesGeometry;
  private beaconGroup = new THREE.Group();
  private beacons: Beacon[] = [];
  private target: THREE.Vector3;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private v = new THREE.Vector3();
  private L: StageLayout | null = null;
  private dist = 10;
  private elev = 26 * DEG;
  /** where the horizon actually landed (the elevation is clamped), canvas px */
  private horizonY = 0;
  private dpr = 1;
  private dirty = true;
  private lost = false;
  private last = { reveal: -1, tx: 0, ty: 0 };
  private pingAt = -1e9;
  // frame governor: the avatar's video comes first
  private ema = 16.7;
  private prev = 0;
  private quality = 2;
  private qualityAt = 0;
  private frameNo = 0;

  /** Create, lay out and compile (off the main thread where the browser can). Null without WebGL. */
  static async create(canvas: HTMLCanvasElement, opts: { palette: Palette; bake: GroundBake; animate: boolean; layout: StageLayout }) {
    let s: StageScene;
    try {
      s = new StageScene(canvas, opts.palette, opts.bake, opts.animate);
    } catch {
      return null;
    }
    s.layout(opts.layout);
    try {
      await s.renderer.compileAsync(s.scene, s.camera);
    } catch {
      /* compiles on first render instead */
    }
    return s;
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    pal: Palette,
    private bake: GroundBake,
    private animate: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      stencil: false,
      powerPreference: "default",
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    canvas.addEventListener("webglcontextlost", this.handleLost);

    const h0 = groundAt(bake, 0, 0) * HS;
    this.target = new THREE.Vector3(0, h0, 0);

    // the ground: heights in a float texture (contours per pixel), a coarse mesh for the shape
    this.texture = new THREE.DataTexture(bake.heights, bake.nx, bake.nz, THREE.RedFormat, THREE.FloatType);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
    this.ground = new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms: {
        uH: { value: this.texture },
        uMap: { value: new THREE.Vector4(DOMAIN.x0, DOMAIN.z0, 1 / STEP, 1 / STEP) },
        uSize: { value: new THREE.Vector2(bake.nx, bake.nz) },
        uEdge: { value: new THREE.Vector4(DOMAIN.x0, DOMAIN.z0, DOMAIN.x1, DOMAIN.z1) },
        uInterval: { value: INTERVAL },
        uDpr: { value: 1 },
        uReveal: { value: 0 },
        uLevel: { value: 0 },
        uTime: { value: 0 },
        uPing: { value: new THREE.Vector4(0, 0, 0, 0) },
        uFog: { value: new THREE.Vector2(16, 50) },
        uGridR: { value: 3.4 },
        uGround: { value: v3(pal.z1) },
        uGrid: { value: v3(pal.z3) },
        uMinor: { value: v3(pal.z4) },
        uIndex: { value: v3(pal.z5) },
        uNear: { value: v3(pal.z6) },
        uFix: { value: v3(pal.fix) },
      },
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.scene.add(new THREE.Mesh(this.groundGeometry(), this.ground));

    // grid ticks round his station
    const pts: number[] = [];
    for (let z = -TICK_R; z <= TICK_R; z++)
      for (let x = -TICK_R; x <= TICK_R; x++) {
        const r = Math.hypot(x, z);
        if (r > TICK_R || r < 0.9) continue;
        pts.push(x, groundAt(bake, x, z) * HS + 0.02, z);
      }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.ticks = new THREE.ShaderMaterial({
      vertexShader: TICK_VERT,
      fragmentShader: TICK_FRAG,
      uniforms: {
        uLevel: { value: 0 },
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uPx: { value: 9 },
        uRef: { value: 10 },
        uReveal: { value: 0 },
        uTick: { value: v3(pal.z7) },
        uFix: { value: v3(pal.fix) },
      },
      transparent: true,
      depthWrite: false,
    });
    const tickPoints = new THREE.Points(tg, this.ticks);
    tickPoints.frustumCulled = false;
    this.scene.add(tickPoints);

    // survey beacons and their lines
    this.beaconMat = new THREE.ShaderMaterial({
      vertexShader: BEACON_VERT,
      fragmentShader: BEACON_FRAG,
      uniforms: { uLo: { value: v3(pal.z2) }, uHi: { value: v3(pal.z7) }, uLight: { value: new THREE.Vector3(-0.5, 0.8, 0.6).normalize() } },
    });
    const line = (color: RGB, alpha: number, dash: number) =>
      new THREE.ShaderMaterial({
        vertexShader: LINE_VERT,
        fragmentShader: LINE_FRAG,
        uniforms: {
          uColor: { value: v3(color) },
          uAlpha: { value: alpha },
          uDash: { value: dash },
          uReveal: { value: 1e4 },
          uFog: { value: new THREE.Vector2(16, 50) },
        },
        transparent: true,
        depthWrite: false,
      });
    this.edgeMat = line(pal.z9, 0.9, 0);
    this.triMat = line(pal.z6, 0.7, 3);
    this.plumbMat = line(pal.z7, 0.8, 9);
    this.ringMat = line(pal.z6, 0.9, 0);
    this.octaEdges = new THREE.EdgesGeometry(this.octa);
    this.scene.add(this.beaconGroup);
  }

  private handleLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.onLost?.();
  };

  private groundGeometry() {
    const nx = Math.round((DOMAIN.x1 - DOMAIN.x0) / MESH) + 1;
    const nz = Math.round((DOMAIN.z1 - DOMAIN.z0) / MESH) + 1;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = DOMAIN.x0 + i * MESH;
        const z = DOMAIN.z0 + j * MESH;
        const o = (j * nx + i) * 3;
        pos[o] = x;
        pos[o + 1] = groundAt(this.bake, x, z) * HS;
        pos[o + 2] = z;
      }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let k = 0;
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        idx.set([a, c, b, b, c, d], k);
        k += 6;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  /** Place the camera, size the canvas, and re-site the beacons for this layout. */
  layout(L: StageLayout) {
    this.L = L;
    const t = Math.tan((FOV / 2) * DEG);
    const f = L.h / 2 / t;
    this.dist = f / Math.max(10, L.ppu);
    this.elev = clamp(Math.atan((L.stnY - L.horizon) / f), 12 * DEG, 40 * DEG);
    this.horizonY = L.stnY - f * Math.tan(this.elev);
    const cam = this.camera;
    cam.aspect = L.w / L.h;
    cam.near = this.dist * 0.05;
    cam.far = this.dist + 110;
    cam.setViewOffset(L.w, L.h, L.w / 2 - L.stnX, L.h / 2 - L.stnY, L.w, L.h);
    this.pose(0, 0);
    this.applyQuality();
    const fog = new THREE.Vector2(this.dist + 10, this.dist + 68);
    for (const m of [this.ground, this.triMat, this.plumbMat, this.ringMat, this.edgeMat]) m.uniforms.uFog.value = fog;
    this.ticks.uniforms.uRef.value = this.dist;
    this.ticks.uniforms.uPx.value = L.narrow ? 7 : 9;
    this.siteBeacons();
    this.dirty = true;
  }

  private applyQuality() {
    const L = this.L;
    if (!L) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.quality >= 2 ? 1.5 : 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(L.w, L.h, false);
    this.ground.uniforms.uDpr.value = this.dpr;
    this.ticks.uniforms.uDpr.value = this.dpr;
  }

  /** Orbit the station by the pointer / tilt; the station stays pinned to its pixel. */
  private pose(tx: number, ty: number) {
    const az = tx * 6 * DEG;
    const el = this.elev + ty * 2.5 * DEG;
    const T = this.target;
    this.camera.position.set(
      T.x + this.dist * Math.sin(az) * Math.cos(el),
      T.y + this.dist * Math.sin(el),
      T.z + this.dist * Math.cos(az) * Math.cos(el),
    );
    this.camera.lookAt(T);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /** The ground point under a canvas pixel (straight camera), or null above the horizon. */
  private groundUnder(px: number, py: number) {
    const L = this.L;
    if (!L) return null;
    this.ray.setFromCamera(new THREE.Vector2((px / L.w) * 2 - 1, 1 - (py / L.h) * 2), this.camera);
    let y = this.target.y * 0.5;
    for (let i = 0; i < 4; i++) {
      this.plane.constant = -y;
      if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return null;
      y = groundAt(this.bake, this.hit.x, this.hit.z) * HS;
    }
    return { x: this.hit.x, z: this.hit.z, y };
  }

  private project(x: number, y: number, z: number) {
    const L = this.L!;
    this.v.set(x, y, z).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * L.w, y: (0.5 - this.v.y * 0.5) * L.h };
  }

  /** Beacons go where the screen is free: candidate spots, minus anything near the UI, spread apart. */
  private siteBeacons() {
    const L = this.L!;
    this.pose(0, 0);
    const pad = L.narrow ? 14 : 24;
    const blocked = (p: { x: number; y: number }) =>
      p.x < pad || p.x > L.w - pad || p.y > L.h - pad || L.avoid.some((r) => p.x > r.x0 - pad && p.x < r.x1 + pad && p.y > r.y0 - pad && p.y < r.y1 + pad);
    const cands: { x: number; z: number; y: number; sx: number; sy: number }[] = [];
    const cols = L.narrow ? 7 : 11;
    const rows = L.narrow ? 9 : 8;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const sx = L.w * (0.06 + (0.88 * i) / (cols - 1));
        const sy = this.horizonY + 26 + ((L.h - this.horizonY - 60) * (j + 0.5)) / rows;
        const g = this.groundUnder(sx, sy);
        if (!g || Math.hypot(g.x, g.z) < 2.6) continue;
        if (g.x < DOMAIN.x0 + 7 || g.x > DOMAIN.x1 - 7 || g.z < DOMAIN.z0 + 7) continue;
        const top = this.project(g.x, g.y + HOVER + BEACON_R * 1.6, g.z);
        const foot = this.project(g.x, g.y, g.z);
        if (blocked(top) || blocked(foot) || blocked({ x: foot.x, y: (top.y + foot.y) / 2 })) continue;
        cands.push({ ...g, sx: foot.x, sy: foot.y });
      }
    const max = L.narrow ? 2 : 3;
    const sep = L.narrow ? 110 : 190;
    const chosen: typeof cands = [];
    const stn = { x: L.stnX, y: L.stnY };
    while (chosen.length < max && cands.length) {
      let best = -1;
      let bestD = -1;
      cands.forEach((c, i) => {
        const near = [stn, ...chosen.map((o) => ({ x: o.sx, y: o.sy }))].reduce((m, o) => Math.min(m, Math.hypot(c.sx - o.x, c.sy - o.y)), Infinity);
        if (near > bestD) {
          bestD = near;
          best = i;
        }
      });
      if (best < 0 || bestD < sep) break;
      chosen.push(cands.splice(best, 1)[0]);
    }
    this.buildBeacons(chosen);
  }

  private buildBeacons(list: { x: number; z: number; y: number }[]) {
    this.beaconGroup.children.slice().forEach((c) => {
      this.beaconGroup.remove(c);
      if (c instanceof THREE.LineSegments && c.geometry !== this.octaEdges) c.geometry.dispose();
    });
    this.beacons = [];
    const tri: number[] = [];
    const triD: number[] = [];
    const plumb: number[] = [];
    const plumbD: number[] = [];
    const ring: number[] = [];
    const ringD: number[] = [];
    const lift = 0.06;
    const T = this.target;
    // narrow screens stand further back: bigger beacons keep them legible
    const size = this.L?.narrow ? 1.7 : 1;
    list.forEach((b, i) => {
      const r = Math.hypot(b.x, b.z);
      const hover = HOVER * size;
      const mesh = new THREE.Mesh(this.octa, this.beaconMat);
      mesh.position.set(b.x, b.y + hover, b.z);
      mesh.add(new THREE.LineSegments(this.octaEdges, this.edgeMat));
      this.beaconGroup.add(mesh);
      this.beacons.push({ mesh, x: b.x, z: b.z, y: b.y + hover, r, seed: i * 1.7 + 0.4, size });
      // triangulation: his station to the beacon's foot, laid on the ground
      const n = Math.max(8, Math.ceil(r / 0.12));
      let px = 0;
      let py = T.y + lift;
      let pz = 0;
      for (let s = 1; s <= n; s++) {
        const u = s / n;
        const x = b.x * u;
        const z = b.z * u;
        const y = groundAt(this.bake, x, z) * HS + lift;
        tri.push(px, py, pz, x, y, z);
        triD.push(r * ((s - 1) / n), r * u);
        px = x;
        py = y;
        pz = z;
      }
      // plumb from the diamond's tip to the ground
      plumb.push(b.x, b.y + hover - BEACON_R * size, b.z, b.x, b.y + lift, b.z);
      plumbD.push(r, r + hover - BEACON_R * size);
      // a small ring round the foot
      const seg = 28;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2;
        const a1 = ((s + 1) / seg) * Math.PI * 2;
        const rr = 0.2 * size;
        const x0 = b.x + Math.cos(a0) * rr;
        const z0 = b.z + Math.sin(a0) * rr;
        const x1 = b.x + Math.cos(a1) * rr;
        const z1 = b.z + Math.sin(a1) * rr;
        ring.push(x0, groundAt(this.bake, x0, z0) * HS + lift, z0, x1, groundAt(this.bake, x1, z1) * HS + lift, z1);
        ringD.push(r, r);
      }
    });
    const seg = (p: number[], d: number[], mat: THREE.ShaderMaterial) => {
      if (!p.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute("aD", new THREE.Float32BufferAttribute(d, 1));
      const l = new THREE.LineSegments(g, mat);
      l.frustumCulled = false;
      this.beaconGroup.add(l);
    };
    seg(tri, triD, this.triMat);
    seg(plumb, plumbD, this.plumbMat);
    seg(ring, ringD, this.ringMat);
  }

  /** Drop a ping ring on the ground under a canvas pixel. False if the pixel is above the horizon. */
  ping(px: number, py: number, now: number) {
    if (!this.animate || this.lost) return false;
    const g = this.groundUnder(px, py);
    if (!g) return false;
    (this.ground.uniforms.uPing.value as THREE.Vector4).set(g.x, g.z, 0, 1);
    this.pingAt = now;
    return true;
  }

  /** Draw one frame (the stage's rAF, after the avatar). */
  frame(now: number, inp: StageInput) {
    if (this.lost || !this.L) return;
    const dt = now - this.prev;
    this.prev = now;
    if (dt > 0 && dt < 100) this.ema += (dt - this.ema) * 0.05;
    if (this.animate && this.ema > 24 && this.quality > 0 && now - this.qualityAt > 1500) {
      this.quality--;
      this.qualityAt = now;
      this.ema = 16.7;
      this.applyQuality();
    }
    const R = 0.5 + inp.reveal * inp.reveal * 60;
    if (!this.animate) {
      if (!this.dirty && Math.abs(R - this.last.reveal) < 1e-3) return;
    } else if (this.quality === 0 && (this.frameNo++ & 1) === 1) return;
    this.last.reveal = R;

    const t = now / 1000;
    const g = this.ground.uniforms;
    g.uReveal.value = R;
    g.uTime.value = t;
    g.uLevel.value = this.animate ? inp.level : 0;
    const ping = g.uPing.value as THREE.Vector4;
    const age = (now - this.pingAt) / 1000;
    ping.z = age;
    ping.w = age < PING_LIFE ? 1 : 0;
    const k = this.ticks.uniforms;
    k.uReveal.value = R;
    k.uTime.value = t;
    k.uLevel.value = g.uLevel.value;
    for (const m of [this.triMat, this.plumbMat, this.ringMat]) m.uniforms.uReveal.value = R;

    const tx = this.animate ? inp.tiltX : 0;
    const ty = this.animate ? inp.tiltY : 0;
    if (this.dirty || tx !== this.last.tx || ty !== this.last.ty) {
      this.last.tx = tx;
      this.last.ty = ty;
      this.pose(tx, ty);
    }
    for (const b of this.beacons) {
      const s = clamp((R - b.r - 0.4) / 2.2, 0, 1);
      const e = 1 - Math.pow(1 - s, 3);
      b.mesh.scale.setScalar(Math.max(1e-3, e * b.size));
      b.mesh.visible = e > 0.001;
      b.mesh.rotation.y = this.animate ? t * 0.5 + b.seed : b.seed;
      b.mesh.position.y = b.y + (this.animate ? Math.sin(t * 1.1 + b.seed * 2.3) * 0.045 : 0);
    }
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.handleLost);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) o.geometry.dispose();
    });
    this.octa.dispose();
    this.octaEdges.dispose();
    this.texture.dispose();
    for (const m of [this.ground, this.ticks, this.beaconMat, this.edgeMat, this.triMat, this.plumbMat, this.ringMat]) m.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
