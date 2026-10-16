"use client";

import { on } from "@/lib/events";
import { useApp } from "@/lib/store";
import { heroManifestNow } from "./manifest";
import { entry, primeClips, unlockMedia } from "./media";

/**
 * Replay the talking-avatar stage from anywhere (hero "Hear him say hi", terminal `hello`).
 * Goes straight to the stage: no greeting, no gate. Call it from the click or key handler itself:
 * that gesture turns his voice on and unlocks audio for the replay.
 * Importing this tiny module does not pull in the stage. `emit("intro:replay", {})` does the same.
 */
export function replayIntro() {
  const app = useApp.getState();
  // called from a click or key handler: a keyboard press (or a click with no pointer) keeps focus visible
  const ev = typeof window !== "undefined" ? window.event : undefined;
  entry.keyboard = ev instanceof KeyboardEvent || (ev instanceof MouseEvent && ev.detail === 0);
  const m = heroManifestNow();
  if (m) primeClips(m);
  unlockMedia();
  app.setSound(true);
  if (app.phase === "site") app.setPhase("intro");
}

// Wired once at boot: Greeting imports this module, and AppShell imports Greeting statically.
if (typeof window !== "undefined") {
  const w = window as Window & { __ljIntroReplayWired?: boolean };
  if (!w.__ljIntroReplayWired) {
    w.__ljIntroReplayWired = true;
    on("intro:replay", () => replayIntro());
  }
}
