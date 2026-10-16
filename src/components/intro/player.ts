"use client";

// REAL mode clip sequencing. Plays `sequence` in order, then loops `idle`. Every clip starts and
// ends on the same pose, so a switch on `ended` is invisible: the next <video> is already primed
// (preload auto, rewound to 0) and the renderer keeps the last frame on screen until the new clip
// delivers its first one. A click during idle plays `wave`, then idle again.
// Audio comes from each clip's own element; muting follows the store's `sound`.

import type { HeroClip, HeroManifest } from "./manifest";
import { clipVideo, parkClips } from "./media";

export type PlayerEvents = {
  /** the active clip changed (null: the sequence ended and there is no idle clip; hold the last frame) */
  clip: (key: string | null) => void;
  /** the browser refused sound; the clip continues muted */
  blocked: () => void;
};

function rewind(v: HTMLVideoElement) {
  if (v.currentTime > 0) {
    try {
      v.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}

export class ClipPlayer {
  active: string | null = null;
  private queue: string[] = [];
  private muted: boolean;
  private halted = false;
  private disposed = false;
  private broken = new Set<string>();
  private offs: (() => void)[] = [];

  constructor(
    private m: HeroManifest,
    private events: PlayerEvents,
    muted: boolean,
  ) {
    this.muted = muted;
    for (const key of Object.keys(m.clips)) {
      const v = clipVideo(key);
      if (!v) continue;
      const ended = () => {
        if (this.active === key) this.advance();
      };
      const error = () => {
        this.broken.add(key);
        if (this.active === key) this.advance();
      };
      v.addEventListener("ended", ended);
      v.addEventListener("error", error);
      this.offs.push(() => {
        v.removeEventListener("ended", ended);
        v.removeEventListener("error", error);
      });
    }
  }

  video(key = this.active): HTMLVideoElement | null {
    return key ? clipVideo(key) : null;
  }

  clip(key = this.active): HeroClip | null {
    return key ? (this.m.clips[key] ?? null) : null;
  }

  private usable(key: string | undefined): key is string {
    if (!key || !(key in this.m.clips) || this.broken.has(key)) return false;
    const v = clipVideo(key);
    return !!v && !v.error;
  }

  /** Play the sequence from `from` (default: the start), then idle. */
  start(from?: string) {
    const seq = this.m.sequence.filter((k) => this.usable(k));
    const at = from ? seq.indexOf(from) : 0;
    this.queue = seq.slice(Math.max(0, at));
    this.advance();
  }

  /** From the first speaking clip onward: used when the visitor turns his voice on. */
  restartTalk() {
    const first = this.m.sequence.find((k) => this.usable(k) && this.m.clips[k].hasAudio);
    this.start(first);
  }

  /** A wave, only while he's idle (or holding his last frame). Returns whether it played. */
  wave() {
    if (!this.usable("wave")) return false;
    if (this.active !== "idle" && this.active !== null) return false;
    this.queue = [];
    this.play("wave");
    return true;
  }

  get isIdle() {
    return this.active === "idle" || this.active === null;
  }

  private advance() {
    let next = this.queue.shift();
    while (next !== undefined && !this.usable(next)) next = this.queue.shift();
    if (next === undefined && this.usable("idle")) next = "idle";
    this.play(next ?? null);
  }

  private play(key: string | null) {
    if (this.disposed) return;
    const prev = this.video();
    if (!key) {
      prev?.pause();
      this.active = null;
      this.events.clip(null);
      return;
    }
    const v = clipVideo(key)!;
    const clip = this.m.clips[key];
    if (prev && prev !== v) {
      prev.pause();
      rewind(prev);
    }
    if (key !== this.active || v.ended) rewind(v);
    v.loop = clip.loop === true;
    v.muted = this.muted || !clip.hasAudio;
    this.active = key;
    this.events.clip(key);
    if (!this.halted) this.kick(key, v);
  }

  private kick(key: string, v: HTMLVideoElement) {
    const p = v.play();
    if (!p) return;
    p.catch((err: unknown) => {
      if (this.disposed || this.active !== key) return;
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" && !v.muted) {
        // autoplay with sound refused: carry on silently and let the stage offer the voice
        v.muted = true;
        this.muted = true;
        this.events.blocked();
        void v.play().catch(() => {});
      } else if (name === "NotSupportedError") {
        this.broken.add(key);
        this.advance();
      }
    });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const v = this.video();
    const c = this.clip();
    if (!v || !c) return;
    v.muted = muted || !c.hasAudio;
    if (v.paused && !this.halted && this.active) this.kick(this.active, v);
  }

  /** Tab hidden. */
  pause() {
    this.halted = true;
    this.video()?.pause();
  }

  resume() {
    this.halted = false;
    const v = this.video();
    if (v && this.active) this.kick(this.active, v);
  }

  /** Seconds into the active clip. */
  time() {
    return this.video()?.currentTime ?? 0;
  }

  dispose() {
    this.disposed = true;
    this.offs.forEach((off) => off());
    this.offs = [];
    parkClips();
  }
}
