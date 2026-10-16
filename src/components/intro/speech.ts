"use client";

import { useEffect, useState } from "react";

// Web Speech for the placeholder stage: until Lakshya's recording exists, the browser reads his line.

export function speechSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

const MALE =
  /\b(male|man|ravi|prabhat|hemant|kunal|madhur|rishi|aarav|arjun|daniel|arthur|george|ryan|guy|thomas|oliver|james|david|mark|alex|fred|reed|eddy|rocko)\b/i;
const FEMALE =
  /\b(female|woman|heera|neerja|kalpana|swara|veena|lekha|sangeeta|aditi|raveena|zira|hazel|susan|libby|sonia|mia|maisie|kate|serena|martha|moira|fiona|samantha|karen|tessa|victoria|allison|ava|aria|jenny|emma|amy)\b/i;

function tier(lang: string) {
  const l = lang.replace("_", "-").toLowerCase();
  if (l === "en-in") return 30;
  if (l === "en-gb") return 20;
  if (l.startsWith("en")) return 10;
  return 0;
}

/** en-IN, then en-GB, then any English voice; prefer a male voice and an on-device one. */
export function pickVoice(voices: SpeechSynthesisVoice[]) {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const t = tier(v.lang);
    if (!t) continue;
    let score = t;
    if (MALE.test(v.name)) score += 4;
    if (FEMALE.test(v.name)) score -= 4;
    if (v.localService) score += 1;
    if (v.default) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

type VoiceState = { ready: boolean; voice: SpeechSynthesisVoice | null; usable: boolean };

function readVoices(): VoiceState | null {
  if (!speechSupported()) return { ready: true, voice: null, usable: false };
  const voices = window.speechSynthesis.getVoices();
  return voices.length ? { ready: true, voice: pickVoice(voices), usable: true } : null;
}

/**
 * The voice to speak with, resolved after the browser's async `voiceschanged`.
 * `ready` stays false until voices are known; `usable` is false when Web Speech can't speak here.
 * Client-only: the intro stage that uses it never renders on the server.
 */
export function useSpeechVoice() {
  const [state, setState] = useState<VoiceState>(() => readVoices() ?? { ready: false, voice: null, usable: false });

  useEffect(() => {
    if (state.ready || !speechSupported()) return;
    const synth = window.speechSynthesis;
    const onChange = () => {
      const next = readVoices();
      if (next) setState(next);
    };
    synth.addEventListener("voiceschanged", onChange);
    // Some engines never fire voiceschanged; after a grace period, give up quietly.
    const timer = window.setTimeout(() => setState(readVoices() ?? { ready: true, voice: null, usable: false }), 2500);
    return () => {
      synth.removeEventListener("voiceschanged", onChange);
      window.clearTimeout(timer);
    };
  }, [state.ready]);

  return state;
}
