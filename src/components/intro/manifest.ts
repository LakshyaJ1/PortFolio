"use client";

// The talking-avatar clips are produced offline by `npm run hero:build` (scripts/build-hero-assets.py),
// which writes /hero/manifest.json version 2: stacked-alpha H.264 clips (colour in the top half of
// each frame, the greyscale matte in the bottom half). Until those exist the manifest is a
// `{"version":0}` stub and the stage runs its stand-in figure (placeholder mode).

import { primeClips } from "./media";

export type HeroCue = { start: number; end: number; text: string };

export type HeroClip = {
  src: string;
  duration: number;
  hasAudio: boolean;
  loop?: boolean;
  speech?: { start?: number; end?: number };
  captions: HeroCue[];
  /** who voiced the clip ("generated": the voice Flow made with it). Informational: nothing branches on it */
  voice?: string;
};

export type HeroManifest = {
  version: 2;
  format: "stacked-alpha";
  /** one picture: the colour half (the encoded frame is width × 2·height) */
  width: number;
  height: number;
  fps: number;
  clips: Record<string, HeroClip>;
  /** clip keys played once, in order, before `idle` loops */
  sequence: string[];
  poster: string | null;
  bust: string | null;
};

export const HERO_MANIFEST = "/hero/manifest.json";

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function cueList(v: unknown): HeroCue[] {
  if (!Array.isArray(v)) return [];
  return v.filter((c): c is HeroCue => !!c && num(c.start) && num(c.end) && c.end > c.start && str(c.text));
}

/** Normalise a parsed manifest. Anything but a usable v2 stacked-alpha set is null (placeholder). */
export function parseHeroManifest(m: unknown): HeroManifest | null {
  if (!m || typeof m !== "object") return null;
  const x = m as Record<string, unknown>;
  if (x.version !== 2 || x.format !== "stacked-alpha") return null;
  if (!num(x.width) || !num(x.height) || x.width <= 0 || x.height <= 0) return null;
  const raw = x.clips && typeof x.clips === "object" ? (x.clips as Record<string, unknown>) : {};
  const clips: Record<string, HeroClip> = {};
  for (const [key, c] of Object.entries(raw)) {
    if (!c || typeof c !== "object") continue;
    const y = c as Record<string, unknown>;
    if (!str(y.src) || !num(y.duration) || y.duration <= 0) continue;
    const speech = y.speech && typeof y.speech === "object" ? (y.speech as HeroClip["speech"]) : undefined;
    clips[key] = {
      src: y.src,
      duration: y.duration,
      hasAudio: y.hasAudio === true,
      loop: y.loop === true,
      speech,
      captions: cueList(y.captions),
      voice: str(y.voice) ? y.voice : undefined,
    };
  }
  const sequence = Array.isArray(x.sequence) ? x.sequence.filter((k): k is string => str(k) && k !== "idle" && k in clips) : [];
  if (!sequence.length && !clips.idle) return null;
  return {
    version: 2,
    format: "stacked-alpha",
    width: x.width,
    height: x.height,
    fps: num(x.fps) && x.fps > 0 ? x.fps : 24,
    clips,
    sequence,
    poster: str(x.poster) ? x.poster : null,
    bust: str(x.bust) ? x.bust : null,
  };
}

let pending: Promise<HeroManifest | null> | null = null;
let settled: HeroManifest | null | undefined;

/** Fetch the clip manifest once per page load; null means placeholder mode (v0 stub, missing or invalid). */
export function loadHeroManifest() {
  if (!pending) {
    pending = fetch(HERO_MANIFEST, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: unknown) => parseHeroManifest(m))
      .catch(() => null)
      .then((m) => {
        settled = m;
        return m;
      });
  }
  return pending;
}

/** The manifest if it has already loaded: a manifest, null (placeholder) or undefined (not yet known). */
export function heroManifestNow() {
  return settled;
}

/** The portrait bust that ships with a real clip set (the field pass prints it), or null. */
export async function heroBustSrc() {
  return (await loadHeroManifest())?.bust ?? null;
}

/** Warm the stage while the greeting runs: manifest, poster, and one primed <video> per clip. */
export function prefetchHero() {
  void loadHeroManifest().then((m) => {
    if (!m) return;
    if (m.poster) {
      const img = new Image();
      img.decoding = "async";
      img.src = m.poster;
    }
    primeClips(m);
  });
}
