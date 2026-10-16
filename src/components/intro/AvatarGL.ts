"use client";

// A tiny WebGL renderer for the stacked-alpha clips: each H.264 frame is width × 2·height, colour in
// the top half and the greyscale matte in the bottom half, so transparency works in every browser
// (Safari included) without alpha-video codecs. The shader pulls colour from the top half and alpha
// from the bottom, premultiplies (the matte is straight alpha), adds a faint cool rim where the matte
// is partial, and runs the spawn reveal: everything above the scan line is cut, with an orange band
// on the figure just under it, a fix being acquired.
// It can also show the poster (an ordinary RGBA PNG) while the first clip buffers. Switching source
// crossfades between two textures in premultiplied space, so a cut never shows a gap.

import type { RGB } from "@/components/terrain";

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uFromStacked;
uniform float uToStacked;
uniform float uMix;
uniform float uReveal;
uniform float uBand;
uniform float uSeam;
uniform vec3 uFix;
uniform vec3 uRim;

vec4 src(sampler2D t, float stacked, vec2 uv) {
  if (stacked > 0.5) {
    vec3 rgb = texture2D(t, vec2(uv.x, min(uv.y * 0.5, 0.5 - uSeam))).rgb;
    float m = texture2D(t, vec2(uv.x, max(0.5 + uv.y * 0.5, 0.5 + uSeam))).r;
    return vec4(rgb, smoothstep(0.04, 0.94, m)); // levels: codec noise must not leave the body see-through
  }
  return texture2D(t, uv);
}

void main() {
  vec4 a = src(uFrom, uFromStacked, vUv);
  vec4 b = src(uTo, uToStacked, vUv);
  vec4 p = mix(vec4(a.rgb * a.a, a.a), vec4(b.rgb * b.a, b.a), uMix);
  float alpha = p.a;
  vec3 rgb = alpha > 0.0005 ? p.rgb / alpha : vec3(0.0);
  float rim = smoothstep(0.03, 0.4, alpha) * (1.0 - smoothstep(0.4, 0.97, alpha));
  rgb = mix(rgb, uRim, rim * 0.42);
  float y = 1.0 - vUv.y;
  float edge = uReveal * (1.0 + uBand);
  float keep = 1.0 - smoothstep(edge - 0.003, edge, y);
  float glow = smoothstep(edge - uBand, edge, y) * keep;
  rgb = mix(rgb, uFix, glow * 0.9);
  alpha *= keep;
  gl_FragColor = vec4(rgb * alpha, alpha);
}`;

type Source = HTMLVideoElement | HTMLImageElement;
type Slot = { tex: WebGLTexture; stacked: boolean; w: number; h: number; filled: boolean };

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (h: number) => void;
};

function compile(gl: WebGLRenderingContext, type: number, code: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, code);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

/**
 * Where his soles are: the lowest opaque row of the poster's alpha, as a fraction of the frame
 * height up from the bottom edge, and the horizontal centre of the opaque pixels just above it.
 * The station and contact shadow align to this, not to the frame's bottom edge.
 */
export function measureFeet(img: HTMLImageElement): { foot: number; cx: number } | null {
  const w = 144;
  const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
  if (!w || !h) return null;
  try {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const opaque = (x: number, y: number) => px[(y * w + x) * 4 + 3] > 128;
    let low = -1;
    for (let y = h - 1; y >= 0 && low < 0; y--) for (let x = 0; x < w; x++) if (opaque(x, y)) { low = y; break; }
    if (low < 0) return null;
    let min = w;
    let max = -1;
    for (let y = Math.max(0, low - Math.round(h * 0.03)); y <= low; y++)
      for (let x = 0; x < w; x++)
        if (opaque(x, y)) {
          min = Math.min(min, x);
          max = Math.max(max, x);
        }
    return { foot: (h - 1 - low) / h, cx: max >= min ? (min + max + 1) / 2 / w : 0.5 };
  } catch {
    return null;
  }
}

export class AvatarGL {
  /** 0 → nothing drawn, 1 → the whole figure; driven by the stage's spawn and exit */
  reveal = 0;
  onLost: (() => void) | null = null;

  private gl: WebGLRenderingContext;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private from: Slot;
  private to: Slot;
  private source: Source | null = null;
  private mix = 1;
  private fade = 0.2;
  private fadeAt = 0;
  private fresh = true;
  private rvfc: { video: VideoWithRvfc; handle: number } | null = null;
  private lost = false;

  static create(canvas: HTMLCanvasElement, colors: { fix: RGB; rim: RGB }) {
    try {
      const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
      if (!gl) return null;
      return new AvatarGL(canvas, gl, colors);
    } catch {
      return null;
    }
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    colors: { fix: RGB; rim: RGB },
  ) {
    this.gl = gl;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    gl.useProgram(prog);
    for (const n of ["uFrom", "uTo", "uFromStacked", "uToStacked", "uMix", "uReveal", "uBand", "uSeam", "uFix", "uRim"]) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.from = this.slot();
    this.to = this.slot();
    gl.uniform1i(this.u.uFrom, 0);
    gl.uniform1i(this.u.uTo, 1);
    gl.uniform1f(this.u.uBand, 0.035);
    gl.uniform3fv(this.u.uFix, colors.fix);
    gl.uniform3fv(this.u.uRim, colors.rim);
    gl.clearColor(0, 0, 0, 0);
    canvas.addEventListener("webglcontextlost", this.handleLost);
  }

  private handleLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.onLost?.();
  };

  private slot(): Slot {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return { tex, stacked: false, w: 1, h: 1, filled: false };
  }

  get hasSource() {
    return this.source !== null;
  }

  /** Show a new source; crossfades from whatever is on screen once the new one has a frame. */
  show(source: Source, { stacked, fade = 0.2 }: { stacked: boolean; fade?: number }) {
    if (source === this.source) return;
    const empty = !this.to.filled;
    if (!empty) [this.from, this.to] = [this.to, this.from];
    this.to.stacked = stacked;
    this.to.filled = false;
    this.source = source;
    this.mix = empty ? 1 : 0;
    this.fade = fade;
    this.fadeAt = 0;
    this.watch(source);
  }

  private watch(source: Source) {
    if (this.rvfc) this.rvfc.video.cancelVideoFrameCallback?.(this.rvfc.handle);
    this.rvfc = null;
    this.fresh = true;
    const v = source as VideoWithRvfc;
    if (!(source instanceof HTMLVideoElement) || !v.requestVideoFrameCallback) return;
    const loop = () => {
      this.fresh = true;
      if (this.rvfc?.video === v) this.rvfc.handle = v.requestVideoFrameCallback!(loop);
    };
    this.rvfc = { video: v, handle: v.requestVideoFrameCallback(loop) };
  }

  resize(cssW: number, cssH: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private upload(now: number) {
    const s = this.source;
    if (!s) return;
    let w = 0;
    let h = 0;
    if (s instanceof HTMLVideoElement) {
      if (s.readyState < 2) return;
      const polled = !this.rvfc;
      if (!this.fresh && !(polled && !s.paused) && this.to.filled) return;
      w = s.videoWidth;
      h = s.videoHeight;
    } else {
      if (this.to.filled || !s.complete || !s.naturalWidth) return;
      w = s.naturalWidth;
      h = s.naturalHeight;
    }
    if (!w || !h) return;
    this.fresh = false;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.to.tex);
    if (this.to.w === w && this.to.h === h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, s);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s);
    this.to.w = w;
    this.to.h = h;
    if (!this.to.filled) {
      this.to.filled = true;
      this.fadeAt = now;
    }
  }

  /** Upload the newest frame and draw. Call once per animation frame while visible. */
  render(now = performance.now()) {
    if (this.lost) return;
    const gl = this.gl;
    try {
      this.upload(now);
    } catch {
      /* a frame that isn't decodable yet; try again next tick */
    }
    if (this.mix < 1 && this.to.filled) this.mix = this.fade <= 0 ? 1 : Math.min(1, (now - this.fadeAt) / 1000 / this.fade);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.from.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.to.tex);
    gl.uniform1f(this.u.uFromStacked, this.from.stacked ? 1 : 0);
    gl.uniform1f(this.u.uToStacked, this.to.stacked ? 1 : 0);
    gl.uniform1f(this.u.uMix, this.to.filled ? this.mix : 0);
    gl.uniform1f(this.u.uReveal, this.reveal);
    gl.uniform1f(this.u.uSeam, this.to.h > 1 ? 0.5 / this.to.h : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    if (this.rvfc) this.rvfc.video.cancelVideoFrameCallback?.(this.rvfc.handle);
    this.rvfc = null;
    this.canvas.removeEventListener("webglcontextlost", this.handleLost);
    this.source = null;
  }
}
