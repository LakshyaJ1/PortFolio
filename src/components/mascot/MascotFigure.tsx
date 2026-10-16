"use client";

// Adapter between the site and whatever draws Bindu. The site only speaks `mood` and `size`;
// today the renderer is @bible-strong/avatar-react (AGPL-3.0, decision pending in QUESTIONS.md M1).
// Swapping in a non-AGPL renderer means replacing BinduAvatar and nothing else.

import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import type { MascotMood } from "@/lib/store";
import { ANIMATION_FOR, STILL_FOR } from "./moods";

const BinduAvatar = lazy(() => import("./BinduAvatar"));

export type MascotFigureProps = {
  mood: MascotMood;
  size: number;
  /** a still expression with no loops (reduced motion, plain sheet) */
  still?: boolean;
  label?: string;
  /** fires when a play-once animation (waking) completes */
  onAnimationEnd?: (animation: string) => void;
};

export function MascotFigure({ mood, size, still = false, label = "Bindu, the site guide", onAnimationEnd }: MascotFigureProps) {
  const [failed, setFailed] = useState(false);
  const fallback = <StillBindu size={size} mood={mood} />;
  if (failed) return fallback;
  return (
    <FigureBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <BinduAvatar
          size={size}
          label={label}
          animation={still ? undefined : ANIMATION_FOR[mood]}
          expression={still ? STILL_FOR[mood] : undefined}
          onAnimationEnd={onAnimationEnd}
          onError={() => setFailed(true)}
        />
      </Suspense>
    </FigureBoundary>
  );
}

class FigureBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn("[mascot] renderer failed, showing the still figure", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** A dependency-free Bindu: shown while the renderer loads, and if it ever fails. */
function StillBindu({ size, mood }: { size: number; mood: MascotMood }) {
  const closed = mood === "sleeping" || mood === "drowsy";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Bindu, the site guide">
      <circle cx="50" cy="50" r="44" fill="#ff5b23" />
      {closed ? (
        <g stroke="#0b100d" strokeWidth="4" strokeLinecap="round">
          <path d="M33 50h10M57 50h10" />
        </g>
      ) : (
        <g fill="#0b100d">
          <rect x="35" y="36" width="9" height="22" rx="4.5" />
          <rect x="56" y="36" width="9" height="22" rx="4.5" />
        </g>
      )}
    </svg>
  );
}
