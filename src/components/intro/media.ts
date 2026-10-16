"use client";

// Shared media for the talking avatar, alive for the whole page load (it outlives the stage, so a
// replay reuses elements that were already unlocked):
//   - one <video> per clip, created early (preload auto, playsinline, muted) so the next clip is
//     always primed;
//   - one AudioContext, created and resumed only inside a user gesture (never before, so Chrome
//     doesn't warn), with a single AnalyserNode for the level meter;
//   - `unlockMedia()`, called inside the gate's click/keypress: resumes the AudioContext and
//     "blesses" each speaking clip (play() then pause() while unmuted) so Safari lets it play
//     with sound later, outside the gesture. It also primes Web Speech for the stand-in voice.

import type { HeroManifest } from "./manifest";

type Entry = { video: HTMLVideoElement; speaks: boolean; source: MediaElementAudioSourceNode | null };

const pool = new Map<string, Entry>();
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let speechPrimed = false;

/** How the visitor came onto the stage: by keyboard (focus the résumé, visibly) or not. */
export const entry = { keyboard: false };

type AudioCtor = typeof AudioContext;

function makeContext() {
  if (ctx) return ctx;
  const w = window as Window & { webkitAudioContext?: AudioCtor };
  const AC: AudioCtor | undefined = window.AudioContext ?? w.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Create the clip elements (idempotent). Safe to call before any gesture: they start muted. */
export function primeClips(m: HeroManifest) {
  if (typeof document === "undefined") return pool;
  for (const [key, clip] of Object.entries(m.clips)) {
    if (pool.has(key)) continue;
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.disablePictureInPicture = true;
    v.disableRemotePlayback = true;
    v.src = clip.src;
    pool.set(key, { video: v, speaks: clip.hasAudio, source: null });
  }
  return pool;
}

export function clipVideo(key: string) {
  return pool.get(key)?.video ?? null;
}

/**
 * Call synchronously inside a user gesture (click, Enter/Space keydown). Resumes audio, blesses the
 * speaking clips for Safari, and primes speech synthesis. Harmless to call more than once.
 */
export function unlockMedia() {
  if (typeof window === "undefined") return;
  const c = makeContext();
  if (c && c.state !== "running") void c.resume().catch(() => {});
  for (const e of pool.values()) {
    if (!e.speaks) continue;
    const v = e.video;
    if (!v.paused) continue;
    const wasMuted = v.muted;
    v.muted = false;
    try {
      const p = v.play();
      v.pause();
      if (p) p.catch(() => {});
    } catch {
      /* not playable yet; the element still counts as user-started in WebKit */
    }
    v.muted = wasMuted;
  }
  primeSpeech();
}

/** iOS only lets speech start from a gesture the first time: speak nothing, now. */
function primeSpeech() {
  if (speechPrimed || !("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") return;
  speechPrimed = true;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

/** True once a gesture has started the AudioContext. */
export function audioRunning() {
  return ctx?.state === "running";
}

/**
 * The analyser for a playing clip, routing that element through the AudioContext on first use.
 * Returns null unless audio is already running (routing a muted context would silence the clip).
 */
export function meterFor(video: HTMLVideoElement): AnalyserNode | null {
  if (!ctx || ctx.state !== "running") return null;
  let entry: Entry | undefined;
  for (const e of pool.values()) if (e.video === video) entry = e;
  if (!entry) return null;
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.55;
    analyser.connect(ctx.destination);
  }
  if (!entry.source) {
    try {
      entry.source = ctx.createMediaElementSource(video);
      entry.source.connect(analyser);
    } catch {
      return null;
    }
  }
  return analyser;
}

/** Stop every clip and rewind it, ready for the next visit to the stage. */
export function parkClips() {
  for (const { video } of pool.values()) {
    video.pause();
    video.muted = true;
    if (video.currentTime > 0) {
      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }
}
