// Terrain toolkit · the contour surface material (three.js ShaderMaterial).
//
//   const mat = createContourMaterial({ field, palette, density: 20, heightScale: 1.1 });
//   syncField(mat, field);   // each frame: cheap, re-uploads only when field.version moved
//
// The height function runs per vertex (displacement) AND per fragment (contours), so lines
// are exact curves, antialiased with fwidth. Every 5th level is an index contour. Colours
// come from the token ramp (z0–z2 hillshade ground, z4–z7 lines, fix for the position fix).
// Optional layers, all off by default: pointer fix (line of position + crosshair +
// uncertainty ellipse), ripple ring, label knock-out rects, contact shadows, reveal & flow.
//
// Uniforms you may drive (mat.uniforms.X.value):
//   uRise 0–1 (height scale for entrances) · uReveal (levels below it are drawn) · uFlow
//   (contour phase, in levels) · uPointer (x, z, strength 0–1, level) · uPointerDir (contour
//   tangent) · uFixSize (arm, ellipse a, ellipse b; world units) · uRipple (x, z, radius,
//   strength) · uMasks[] (device-px rects x0,y0,x1,y1, origin bottom-left) + uMaskCount ·
//   uMarks[] (x, z, radius, strength) + uMarkCount · uDpr (set from the renderer).

import * as THREE from "three";
import { GaussianField, GridField, type HeightField } from "./field";
import type { Palette, RGB } from "./palette";

export type ContourMaterialOptions = {
  field: HeightField;
  palette: Palette;
  /** contour levels per unit of height (20 → a line every 0.05) */
  density?: number;
  indexEvery?: number;
  /** world y per unit of height */
  heightScale?: number;
  /** CSS px */
  lineWidth?: number;
  indexWidth?: number;
  /** direction toward the light (hillshade), world space */
  light?: [number, number, number];
  /** view distances where lines begin / finish fading toward the horizon */
  fog?: [number, number];
  maxMasks?: number;
  maxMarks?: number;
};

const v3 = (c: RGB) => new THREE.Vector3(c[0], c[1], c[2]);

function gaussianGLSL(f: GaussianField) {
  const ng = Math.max(1, f.gaussians.length);
  const nw = f.waves.length;
  return /* glsl */ `
#define NG ${ng}
#define NW ${nw}
#define NB ${f.maxBumps}
uniform vec4 uG0[NG];
uniform vec4 uG1[NG];
${nw > 0 ? "uniform vec4 uW[NW];" : ""}
uniform vec4 uBumps[NB];
uniform int uBumpCount;
uniform float uBase;
uniform vec2 uBowl;

// [h, dh/dx, dh/dz]; mirrors GaussianField.sample exactly
vec3 field(vec2 p) {
  float h = uBase + uBowl.x * p.x * p.x + uBowl.y * p.y * p.y;
  vec2 g = vec2(2.0 * uBowl.x * p.x, 2.0 * uBowl.y * p.y);
  for (int i = 0; i < NG; i++) {
    vec2 d = p - uG0[i].xy;
    vec3 ic = uG1[i].xyz;
    float e = uG0[i].z * exp(-0.5 * (ic.x * d.x * d.x + 2.0 * ic.y * d.x * d.y + ic.z * d.y * d.y));
    h += e;
    g -= e * vec2(ic.x * d.x + ic.y * d.y, ic.y * d.x + ic.z * d.y);
  }
#if NW > 0
  for (int i = 0; i < NW; i++) {
    float ph = dot(uW[i].xy, p) + uW[i].z;
    h += uW[i].w * sin(ph);
    g += uW[i].w * cos(ph) * uW[i].xy;
  }
#endif
  for (int i = 0; i < NB; i++) {
    if (i >= uBumpCount) break;
    vec2 d = p - uBumps[i].xy;
    float e = uBumps[i].w * exp(-uBumps[i].z * dot(d, d));
    h += e;
    g -= 2.0 * uBumps[i].z * e * d;
  }
  return vec3(h, g);
}
`;
}

const gridGLSL = /* glsl */ `
uniform highp sampler2D uHeightTex;
uniform vec4 uGridMap;  // x0, z0, (nx-1)/(x1-x0), (ny-1)/(z1-z0)
uniform vec2 uGridSize; // nx, ny
uniform float uBase;
float gridAt(ivec2 c) {
  c = clamp(c, ivec2(0), ivec2(uGridSize) - 1);
  return texelFetch(uHeightTex, c, 0).r;
}
// bilinear, mirrors GridField.sample exactly
vec3 field(vec2 p) {
  vec2 g = clamp((p - uGridMap.xy) * uGridMap.zw, vec2(0.0), uGridSize - 1.0001);
  vec2 i = floor(g);
  vec2 f = g - i;
  ivec2 c = ivec2(i);
  float a = gridAt(c);
  float b = gridAt(c + ivec2(1, 0));
  float cc = gridAt(c + ivec2(0, 1));
  float e = gridAt(c + ivec2(1, 1));
  float h = mix(mix(a, b, f.x), mix(cc, e, f.x), f.y);
  return vec3(uBase + h, mix(b - a, e - cc, f.y) * uGridMap.z, mix(cc - a, e - b, f.x) * uGridMap.w);
}
`;

const vertexMain = /* glsl */ `
uniform float uHeightScale;
uniform float uRise;
uniform vec4 uRipple;
varying vec2 vXZ;
varying float vViewDist;
void main() {
  vec2 p = position.xz;
  float h = field(p).x;
  float y = h * uHeightScale * uRise;
  if (uRipple.w > 0.0) {
    float rd = length(p - uRipple.xy) - uRipple.z;
    y += exp(-rd * rd / 0.08) * uRipple.w * 0.12;
  }
  vec4 world = modelMatrix * vec4(p.x, y, p.y, 1.0);
  vXZ = p;
  vec4 mv = viewMatrix * world;
  vViewDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentMain = /* glsl */ `
uniform float uDensity;
uniform float uIndexEvery;
uniform float uHeightScale;
uniform float uRise;
uniform float uFlow;
uniform float uReveal;
uniform float uLineW;
uniform float uIndexW;
uniform float uDpr;
uniform vec3 uZ0;
uniform vec3 uZ1;
uniform vec3 uZ2;
uniform vec3 uZ4;
uniform vec3 uZ5;
uniform vec3 uZ6;
uniform vec3 uZ7;
uniform vec3 uFix;
uniform vec3 uLight;
uniform vec2 uFog;
uniform vec4 uPointer;
uniform vec2 uPointerDir;
uniform vec3 uFixSize;
uniform vec4 uRipple;
uniform vec4 uMasks[NM];
uniform int uMaskCount;
uniform vec4 uMarks[NK];
uniform int uMarkCount;
varying vec2 vXZ;
varying float vViewDist;

// a line w device px wide, given the distance to it in device px
float band(float dpx, float w) {
  return 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, dpx);
}

void main() {
  vec3 f = field(vXZ);
  float h = f.x;

  // very quiet hillshade: lit slopes lift one ramp step, shadowed ones drop one
  float S = uHeightScale * uRise;
  vec3 n = normalize(vec3(-f.y * S, 1.0, -f.z * S));
  vec3 L = normalize(uLight);
  float shade = clamp((dot(n, L) - L.y) * 3.6, -1.0, 1.0);
  vec3 col = shade > 0.0 ? mix(uZ1, uZ2, shade) : mix(uZ1, uZ0, -shade);

  for (int i = 0; i < NK; i++) {
    if (i >= uMarkCount) break;
    vec2 d = vXZ - uMarks[i].xy;
    float s = exp(-dot(d, d) / (uMarks[i].z * uMarks[i].z)) * uMarks[i].w;
    col = mix(col, uZ0, s * 0.9);
  }

  float ring = 0.0;
  if (uRipple.w > 0.0) {
    float rd = length(vXZ - uRipple.xy) - uRipple.z;
    ring = exp(-rd * rd / 0.11) * uRipple.w;
    col = mix(col, uZ4, ring * 0.55);
  }

  // contours
  float v = h * uDensity + uFlow;
  float fw = max(fwidth(v), 1e-4);
  float k = floor(v + 0.5);
  float m = mod(k, uIndexEvery);
  float isIdx = (m < 0.5 || m > uIndexEvery - 0.5) ? 1.0 : 0.0;
  float line = band(abs(v - k) / fw, (mix(uLineW, uIndexW, isIdx) + ring * 1.8) * uDpr);
  // where levels crowd closer than a few px, minor lines drop out first, then index lines
  line *= 1.0 - smoothstep(0.2, 0.5, fw / mix(1.0, uIndexEvery, isIdx));
  // entrance: levels appear from the lowest up
  line *= 1.0 - smoothstep(uReveal - 0.08, uReveal, h);

  float fogT = smoothstep(uFog.x, uFog.y, vViewDist);
  vec3 lc = mix(uZ5, uZ6, isIdx);
  lc = mix(lc, uZ7, ring);
  lc = mix(lc, uZ4, fogT);
  line *= 1.0 - 0.72 * fogT;

  // cartographic knock-out: lines thin out under labels
  float knock = 0.0;
  for (int i = 0; i < NM; i++) {
    if (i >= uMaskCount) break;
    vec4 r = uMasks[i];
    vec2 dd = max(max(r.xy - gl_FragCoord.xy, gl_FragCoord.xy - r.zw), 0.0);
    knock = max(knock, 1.0 - smoothstep(0.0, 22.0 * uDpr, length(dd)));
  }
  line *= 1.0 - 0.84 * knock;
  col = mix(col, lc, line);

  // the position fix
  if (uPointer.z > 0.0) {
    vec2 d = vXZ - uPointer.xy;
    float lv = h * uDensity;
    float lop = band(abs(lv - uPointer.w * uDensity) / max(fwidth(lv), 1e-4), 1.6 * uDpr);
    lop *= mix(0.14, 1.0, exp(-dot(d, d) / 1.4)) * (1.0 - 0.5 * knock) * (1.0 - 0.6 * fogT);

    vec2 t = uPointerDir;
    vec2 nn = vec2(-t.y, t.x);
    float e = length(vec2(dot(d, t) / uFixSize.y, dot(d, nn) / uFixSize.z));
    float ell = band(abs(e - 1.0) / max(fwidth(e), 1e-4), 1.2 * uDpr);

    vec2 fp = max(fwidth(vXZ), vec2(1e-5));
    float arm = uFixSize.x;
    float hx = band(abs(d.y) / fp.y, 1.25 * uDpr) * step(arm * 0.32, abs(d.x)) * step(abs(d.x), arm);
    float vz = band(abs(d.x) / fp.x, 1.25 * uDpr) * step(arm * 0.32, abs(d.y)) * step(abs(d.y), arm);
    float dot0 = 1.0 - smoothstep(1.3 * uDpr, 2.3 * uDpr, length(d / fp));
    float fixA = max(max(hx, vz), max(ell * 0.8, dot0));
    col = mix(col, uFix, clamp(max(lop * 0.92, fixA) * uPointer.z, 0.0, 1.0));
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export type ContourMaterial = THREE.ShaderMaterial & { userData: { version: number; texture?: THREE.DataTexture } };

export function createContourMaterial(opts: ContourMaterialOptions): ContourMaterial {
  const {
    field,
    palette: p,
    density = 20,
    indexEvery = 5,
    heightScale = 1,
    lineWidth = 1,
    indexWidth = 1.9,
    light = [-0.55, 0.75, -0.4],
    fog = [12, 26],
    maxMasks = 6,
    maxMarks = 4,
  } = opts;

  const uniforms: Record<string, THREE.IUniform> = {
    uDensity: { value: density },
    uIndexEvery: { value: indexEvery },
    uHeightScale: { value: heightScale },
    uRise: { value: 1 },
    uFlow: { value: 0 },
    uReveal: { value: 1e4 },
    uLineW: { value: lineWidth },
    uIndexW: { value: indexWidth },
    uDpr: { value: 1 },
    uZ0: { value: v3(p.z0) },
    uZ1: { value: v3(p.z1) },
    uZ2: { value: v3(p.z2) },
    uZ4: { value: v3(p.z4) },
    uZ5: { value: v3(p.z5) },
    uZ6: { value: v3(p.z6) },
    uZ7: { value: v3(p.z7) },
    uFix: { value: v3(p.fix) },
    uLight: { value: new THREE.Vector3(...light).normalize() },
    uFog: { value: new THREE.Vector2(...fog) },
    uPointer: { value: new THREE.Vector4(0, 0, 0, 0) },
    uPointerDir: { value: new THREE.Vector2(1, 0) },
    uFixSize: { value: new THREE.Vector3(0.2, 0.26, 0.1) },
    uRipple: { value: new THREE.Vector4(0, 0, 0, 0) },
    uMasks: { value: new Float32Array(maxMasks * 4) },
    uMaskCount: { value: 0 },
    uMarks: { value: new Float32Array(maxMarks * 4) },
    uMarkCount: { value: 0 },
  };

  let fieldGLSL: string;
  let texture: THREE.DataTexture | undefined;
  if (field instanceof GaussianField) {
    fieldGLSL = gaussianGLSL(field);
    uniforms.uG0 = { value: field.g0.length ? field.g0 : new Float32Array(4) };
    uniforms.uG1 = { value: field.g1.length ? field.g1 : new Float32Array(4) };
    if (field.w.length) uniforms.uW = { value: field.w };
    uniforms.uBumps = { value: new Float32Array(field.maxBumps * 4) };
    uniforms.uBumpCount = { value: 0 };
    uniforms.uBase = { value: field.base + field.offset };
    uniforms.uBowl = { value: new THREE.Vector2(field.bowl[0], field.bowl[1]) };
  } else if (field instanceof GridField) {
    fieldGLSL = gridGLSL;
    texture = new THREE.DataTexture(field.data, field.nx, field.ny, THREE.RedFormat, THREE.FloatType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    const b = field.bounds;
    uniforms.uHeightTex = { value: texture };
    uniforms.uGridMap = { value: new THREE.Vector4(b.x0, b.z0, (field.nx - 1) / (b.x1 - b.x0), (field.ny - 1) / (b.z1 - b.z0)) };
    uniforms.uGridSize = { value: new THREE.Vector2(field.nx, field.ny) };
    uniforms.uBase = { value: field.base };
  } else {
    throw new Error("createContourMaterial: unsupported field");
  }

  const defines = `#define NM ${maxMasks}\n#define NK ${maxMarks}\n`;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: fieldGLSL + vertexMain,
    fragmentShader: defines + fieldGLSL + fragmentMain,
  }) as ContourMaterial;
  mat.userData = { version: -1, texture };
  syncField(mat, field);
  return mat;
}

/** Push field changes (bumps, grid data) into the material when `field.version` moved. */
export function syncField(mat: ContourMaterial, field: HeightField) {
  if (mat.userData.version === field.version) return false;
  mat.userData.version = field.version;
  if (field instanceof GaussianField) {
    const arr = mat.uniforms.uBumps.value as Float32Array;
    arr.fill(0);
    const n = Math.min(field.bumps.length, field.maxBumps);
    for (let i = 0; i < n; i++) {
      const b = field.bumps[i];
      arr[i * 4] = b.x;
      arr[i * 4 + 1] = b.z;
      arr[i * 4 + 2] = 1 / (2 * b.sigma * b.sigma);
      arr[i * 4 + 3] = b.amp;
    }
    mat.uniforms.uBumpCount.value = n;
    mat.uniforms.uBase.value = field.base + field.offset;
  } else if (field instanceof GridField && mat.userData.texture) {
    const tex = mat.userData.texture;
    tex.image.data = field.data;
    tex.needsUpdate = true;
    mat.uniforms.uBase.value = field.base;
  }
  return true;
}

/** Write section-relative CSS-px rects into uMasks (device px, origin bottom-left). */
export function setMasks(mat: ContourMaterial, rects: { x0: number; y0: number; x1: number; y1: number }[], height: number, dpr: number) {
  const arr = mat.uniforms.uMasks.value as Float32Array;
  const max = arr.length / 4;
  const n = Math.min(rects.length, max);
  for (let i = 0; i < n; i++) {
    const r = rects[i];
    arr[i * 4] = r.x0 * dpr;
    arr[i * 4 + 1] = (height - r.y1) * dpr;
    arr[i * 4 + 2] = r.x1 * dpr;
    arr[i * 4 + 3] = (height - r.y0) * dpr;
  }
  mat.uniforms.uMaskCount.value = n;
}
