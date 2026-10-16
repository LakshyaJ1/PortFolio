// Caption tracks for the stage: one timeline of words grouped into short cues, one track per spoken line.
// Real mode reads cue times from each clip in the hero manifest; the stand-in times each word by its length.

import type { HeroCue } from "./manifest";

export type TrackWord = {
  text: string;
  start: number;
  end: number;
  cue: number;
  /** character offset in the spoken text (for speech `boundary` events) */
  char: number;
};

export type TrackCue = { start: number; end: number; first: number; last: number };

export type Track = { words: TrackWord[]; cues: TrackCue[]; duration: number; text: string };

const BREAK = /[.,!?—;:]$/;

/** The same phrase chunking scripts/build-hero-assets.py uses, so both modes read alike. */
export function chunkWords(words: string[]) {
  const chunks: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 7 || (BREAK.test(w) && cur.length >= 3)) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

const letters = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length;

/** Seconds a word takes at a natural speaking pace, plus the pause its punctuation asks for. */
function wordTiming(w: string) {
  const n = letters(w);
  const dur = n ? 0.085 + 0.046 * n : 0.2; // a bare dash is a breath
  const pause = /[.!?]$/.test(w) ? 0.3 : /[,;:]$/.test(w) ? 0.12 : 0;
  return { dur, pause };
}

function offsets(text: string, words: string[]) {
  const out: number[] = [];
  let from = 0;
  for (const w of words) {
    const at = text.indexOf(w, from);
    out.push(at < 0 ? from : at);
    from = (at < 0 ? from : at) + w.length;
  }
  return out;
}

/** Placeholder track: the script timed by word length, starting `lead` seconds in. */
export function trackFromScript(script: string, lead = 0.4): Track {
  const words = script.trim().split(/\s+/);
  const chars = offsets(script, words);
  const chunks = chunkWords(words);
  const out: TrackWord[] = [];
  const cues: TrackCue[] = [];
  let t = lead;
  let k = 0;
  chunks.forEach((chunk, ci) => {
    const first = out.length;
    for (const w of chunk) {
      const { dur, pause } = wordTiming(w);
      out.push({ text: w, start: t, end: t + dur, cue: ci, char: chars[k++] });
      t += dur + pause;
    }
    cues.push({ start: out[first].start, end: out[out.length - 1].end, first, last: out.length - 1 });
  });
  return { words: out, cues, duration: t, text: script };
}

/** Real track: cue times from the manifest, words inside a cue spread by their length. */
export function trackFromCues(input: HeroCue[], duration: number): Track {
  const out: TrackWord[] = [];
  const cues: TrackCue[] = [];
  let char = 0;
  input.forEach((cue) => {
    const words = cue.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const weight = words.map((w) => Math.max(1, letters(w)) + 1.5);
    const total = weight.reduce((a, b) => a + b, 0);
    const span = Math.max(0.2, cue.end - cue.start);
    let t = cue.start;
    const first = out.length;
    words.forEach((w, i) => {
      const d = (span * weight[i]) / total;
      out.push({ text: w, start: t, end: t + d, cue: cues.length, char });
      char += w.length + 1;
      t += d;
    });
    cues.push({ start: cue.start, end: cue.end, first, last: out.length - 1 });
  });
  return { words: out, cues, duration, text: input.map((c) => c.text).join(" ") };
}

/** Index of the word being spoken at time t (−1 before the first word). */
export function wordAt(track: Track, t: number) {
  const { words } = track;
  if (!words.length || t < words[0].start) return -1;
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (words[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Index of the word containing a speech-synthesis character offset. */
export function wordAtChar(track: Track, char: number) {
  let idx = 0;
  for (let i = 0; i < track.words.length; i++) {
    if (track.words[i].char <= char) idx = i;
    else break;
  }
  return idx;
}
