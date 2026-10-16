"use client";

// The only file that touches @bible-strong/avatar-react (AGPL-3.0; licence decision pending,
// see QUESTIONS.md M1). MascotFigure loads this lazily, so createAvatar's Ajv validation
// (which compiles with `new Function`) runs in the browser only, on first render.

import "@bible-strong/avatar-react/styles.css";
import { createAvatar } from "@bible-strong/avatar-react";
import definition from "./bindu.avatar.json";

// This module is only ever imported lazily from the browser; the guard keeps a stray
// server import from running the validator anyway.
const Bindu = typeof window === "undefined" ? null : createAvatar(definition as unknown);

export type BinduAvatarProps = {
  animation?: string;
  expression?: string;
  size: number;
  label: string;
  onAnimationEnd?: (animation: string) => void;
  onError?: () => void;
};

export default function BinduAvatar({ animation, expression, size, label, onAnimationEnd, onError }: BinduAvatarProps) {
  if (!Bindu) return null;
  // `animation` and `expression` are mutually exclusive in the library; expression wins (still mode).
  const target = expression ? { expression } : { animation: animation ?? "idle" };
  return (
    <Bindu
      {...target}
      size={size}
      ariaLabel={label}
      onAnimationEnd={onAnimationEnd}
      onError={(e) => {
        console.warn("[mascot] avatar", e.message);
        onError?.();
      }}
    />
  );
}
