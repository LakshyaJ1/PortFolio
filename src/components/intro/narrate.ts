"use client";

// What the avatar says, and when. Two narrators behind one interface:
//   ClipNarrator   REAL mode: the clip sequence (player.ts); captions follow the active clip's clock.
//   StandInNarrator PLACEHOLDER mode: Web Speech reads the script line by line; captions follow the
//                   utterance's word boundaries and fall back to word-length timing.
// The stage calls tick() once per frame; narrators report the spoken line/word and talk state.

import { trackFromCues, trackFromScript, wordAt, wordAtChar, type Track } from "./captions";
import type { HeroManifest } from "./manifest";
import { meterFor } from "./media";
import { ClipPlayer } from "./player";
import { INTRO_LINES } from "./script";

export type TalkState = "speaking" | "waving" | "idle";

export type NarratorEvents = {
  /** line (index into tracks) and word (−1 before its first word) */
  word: (line: number, word: number) => void;
  state: (s: TalkState) => void;
  /** the browser refused his voice; he carries on silently */
  blocked: () => void;
  /** REAL mode: the clip on screen changed */
  clip?: (key: string | null) => void;
  /** a spoken line (index into tracks) starts, again too when his voice restarts them */
  line?: (index: number) => void;
  /** the sequence has run out (both lines said, or nothing left to play); once per run */
  done?: () => void;
};

export interface Narrator {
  readonly tracks: Track[];
  readonly voiceAvailable: boolean;
  start(): void;
  /** on: restart from his first line with voice. off: carry on silently. */
  setSound(on: boolean): void;
  /** a wave while idle; false if there is no wave to play */
  wave(): boolean;
  pause(): void;
  resume(): void;
  tick(now: number): void;
  /** fill `out` with band levels 0–1; false when nothing audible is playing */
  levels(out: Float32Array, now: number): boolean;
  dispose(): void;
}

/** A pausable seconds clock. */
function makeClock() {
  let base = 0;
  let startedAt: number | null = null;
  const now = () => base + (startedAt === null ? 0 : (performance.now() - startedAt) / 1000);
  return {
    now,
    play: () => {
      if (startedAt === null) startedAt = performance.now();
    },
    pause: () => {
      base = now();
      startedAt = null;
    },
    set: (t: number) => {
      base = t;
      if (startedAt !== null) startedAt = performance.now();
    },
  };
}

/** Stretch a word-length-timed track onto a clip's speech window. */
function fitTrack(t: Track, start: number, end: number, duration: number): Track {
  if (!t.words.length) return { ...t, duration };
  const o = t.words[0].start;
  const span = Math.max(0.1, t.words[t.words.length - 1].end - o);
  const k = Math.max(0.1, end - start) / span;
  const map = (x: number) => start + (x - o) * k;
  return {
    ...t,
    words: t.words.map((w) => ({ ...w, start: map(w.start), end: map(w.end) })),
    cues: t.cues.map((c) => ({ ...c, start: map(c.start), end: map(c.end) })),
    duration,
  };
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The clips that talk, in sequence order: one caption line each. */
export function speakingKeys(m: HeroManifest) {
  return m.sequence.filter((k) => m.clips[k].hasAudio || m.clips[k].captions.length > 0);
}

/** One caption track per spoken line: the clips' own cues in REAL mode, the script for the stand-in. */
export function tracksFor(m: HeroManifest | null): Track[] {
  if (!m) return INTRO_LINES.map((l) => trackFromScript(l, 0.15));
  return speakingKeys(m).map((k, i) => {
    const c = m.clips[k];
    if (c.captions.length) return trackFromCues(c.captions, c.duration);
    // a speaking clip without captions: time the matching script line onto its speech window
    const s = c.speech?.start ?? 0.3;
    const e = c.speech?.end ?? Math.max(s + 0.5, c.duration - 0.3);
    return fitTrack(trackFromScript(INTRO_LINES[i] ?? "", 0), s, e, c.duration);
  });
}

/** Whether there is a voice to turn on. */
export function voiceIn(m: HeroManifest | null, speechUsable: boolean) {
  return m ? speakingKeys(m).some((k) => m.clips[k].hasAudio) : speechUsable;
}

/* ─── REAL: the clip sequence ─── */

export class ClipNarrator implements Narrator {
  readonly voiceAvailable: boolean;
  readonly player: ClipPlayer;
  private lineOf = new Map<string, number>();
  private lastKey: string | null = null;
  private lastWord = -2;
  private state: TalkState | null = null;
  private sound: boolean;
  private bins: Uint8Array<ArrayBuffer> | null = null;
  private begun = false;
  /** this run's `done` has been reported */
  private finished = false;

  constructor(
    m: HeroManifest,
    readonly tracks: Track[],
    sound: boolean,
    private ev: NarratorEvents,
  ) {
    const speaking = speakingKeys(m);
    speaking.forEach((k, i) => this.lineOf.set(k, i));
    this.voiceAvailable = speaking.some((k) => m.clips[k].hasAudio);
    this.sound = sound && this.voiceAvailable;
    this.player = new ClipPlayer(
      m,
      {
        clip: (k) => {
          this.ev.clip?.(k);
          const line = k !== null ? this.lineOf.get(k) : undefined;
          if (line === undefined) return;
          this.finished = false;
          this.ev.line?.(line);
        },
        blocked: () => {
          this.sound = false;
          this.ev.blocked();
        },
      },
      !this.sound,
    );
  }

  start() {
    this.begun = true;
    this.player.start();
  }

  setSound(on: boolean) {
    const want = on && this.voiceAvailable;
    if (want === this.sound) return;
    this.sound = want;
    this.player.setMuted(!want);
    if (want && this.begun) this.player.restartTalk();
  }

  wave() {
    return this.player.wave();
  }

  pause() {
    this.player.pause();
  }

  resume() {
    this.player.resume();
  }

  tick() {
    const key = this.player.active;
    const line = key !== null ? this.lineOf.get(key) : undefined;
    const st: TalkState = line !== undefined ? "speaking" : key === "wave" ? "waving" : "idle";
    if (st !== this.state) {
      this.state = st;
      this.ev.state(st);
      // the sequence ran out: idle loops (or the last frame holds). A wave from idle isn't a new run.
      if (st === "idle" && !this.finished) {
        this.finished = true;
        this.ev.done?.();
      }
    }
    if (line === undefined) return; // between lines and in idle the last words stay up
    const w = wordAt(this.tracks[line], this.player.time());
    if (key !== this.lastKey || w !== this.lastWord) {
      this.lastKey = key;
      this.lastWord = w;
      this.ev.word(line, w);
    }
  }

  levels(out: Float32Array) {
    if (!this.sound) return false;
    const v = this.player.video();
    const c = this.player.clip();
    if (!v || !c?.hasAudio || v.paused || v.muted) return false;
    const an = meterFor(v);
    if (!an) return false;
    if (!this.bins || this.bins.length !== an.frequencyBinCount) this.bins = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(this.bins);
    // speech sits roughly in 100 Hz – 4 kHz: bins 1…22 at fftSize 256 and 48 kHz
    const lo = 1;
    const hi = Math.min(this.bins.length, 23);
    const n = out.length;
    let any = 0;
    for (let i = 0; i < n; i++) {
      const a = lo + Math.floor((i * (hi - lo)) / n);
      const b = Math.max(a + 1, lo + Math.floor(((i + 1) * (hi - lo)) / n));
      let s = 0;
      for (let k = a; k < b; k++) s += this.bins[k];
      out[i] = Math.min(1, (s / (b - a) / 255) * 1.3);
      any += out[i];
    }
    return any > 0.02;
  }

  dispose() {
    this.player.dispose();
  }
}

/* ─── PLACEHOLDER: the browser reads his lines ─── */

export class StandInNarrator implements Narrator {
  readonly voiceAvailable: boolean;
  private clock = makeClock();
  private line = -1;
  private lastWord = -2;
  private speaking = false;
  private token = 0;
  private boundary = { idx: -1, at: 0 };
  private nextAt = 0;
  private done = false;
  private halted = false;
  private sound: boolean;
  private pulseAt = 0;

  constructor(
    readonly tracks: Track[],
    private voice: SpeechSynthesisVoice | null,
    usable: boolean,
    sound: boolean,
    private ev: NarratorEvents,
  ) {
    this.voiceAvailable = usable;
    this.sound = sound && usable;
  }

  start() {
    this.playLine(0);
  }

  private playLine(i: number) {
    this.nextAt = 0;
    if (i >= this.tracks.length) {
      this.done = true;
      this.clock.pause();
      this.ev.state("idle");
      this.ev.done?.();
      return;
    }
    this.done = false;
    this.line = i;
    this.lastWord = -2;
    this.clock.set(0);
    this.clock.play();
    this.ev.state("speaking");
    this.ev.line?.(i);
    if (this.sound) this.speak(i);
  }

  private speak(i: number) {
    const synth = window.speechSynthesis;
    const token = ++this.token;
    synth.cancel();
    const track = this.tracks[i];
    const u = new SpeechSynthesisUtterance(track.text);
    if (this.voice) {
      u.voice = this.voice;
      u.lang = this.voice.lang;
    } else {
      u.lang = "en-IN";
    }
    u.onstart = () => {
      if (token !== this.token) return;
      this.boundary = { idx: -1, at: 0 };
      this.clock.set(Math.max(0, track.words[0].start - 0.05));
    };
    u.onboundary = (e) => {
      if (token !== this.token || (e.name && e.name !== "word")) return;
      const idx = wordAtChar(track, e.charIndex);
      this.boundary = { idx, at: performance.now() };
      this.clock.set(track.words[idx].start);
    };
    u.onend = () => {
      if (token !== this.token) return;
      this.speaking = false;
      this.clock.set(Math.max(this.clock.now(), track.duration));
      this.nextAt = performance.now() + 450;
    };
    u.onerror = (e) => {
      if (token !== this.token) return;
      this.speaking = false;
      if (e.error === "interrupted" || e.error === "canceled") return;
      // not allowed (no gesture) or no audio here: carry on as captions only
      this.sound = false;
      this.ev.blocked();
    };
    this.speaking = true;
    this.boundary = { idx: -1, at: 0 };
    synth.speak(u);
  }

  tick(now: number) {
    if (this.halted || this.line < 0) return;
    if (this.nextAt && now >= this.nextAt) {
      this.playLine(this.line + 1);
      return;
    }
    if (this.done) return;
    const track = this.tracks[this.line];
    const t = this.clock.now();
    const b = this.boundary;
    const idx = this.speaking && b.at && now - b.at < 1600 ? b.idx : wordAt(track, t);
    if (idx !== this.lastWord) {
      if (idx > this.lastWord && idx >= 0) this.pulseAt = now;
      this.lastWord = idx;
      this.ev.word(this.line, idx);
    }
    if (!this.speaking && !this.nextAt && t > track.duration + 0.55) this.nextAt = now;
  }

  setSound(on: boolean) {
    const want = on && this.voiceAvailable;
    if (want === this.sound) return;
    this.sound = want;
    if (this.line < 0) return; // not started: he'll speak (or not) from his first line
    if (want) {
      this.playLine(0);
      return;
    }
    this.token++;
    this.speaking = false;
    window.speechSynthesis.cancel();
  }

  wave() {
    return false;
  }

  pause() {
    this.halted = true;
    this.clock.pause();
    if (this.speaking) window.speechSynthesis.pause();
  }

  resume() {
    this.halted = false;
    if (!this.done && this.line >= 0) this.clock.play();
    if (this.speaking) window.speechSynthesis.resume();
  }

  /** Web Speech can't be measured: the bars follow his words instead. */
  levels(out: Float32Array, now: number) {
    if (!this.speaking || this.halted) return false;
    const env = Math.exp(-(now - this.pulseAt) / 230);
    for (let i = 0; i < out.length; i++) out[i] = env * (0.35 + 0.65 * hash(this.lastWord * 7 + i));
    return true;
  }

  dispose() {
    this.token++;
    this.speaking = false;
    if (this.voiceAvailable) window.speechSynthesis.cancel();
    this.clock.pause();
  }
}
