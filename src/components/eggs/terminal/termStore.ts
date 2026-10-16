"use client";

import type { ReactNode } from "react";
import { create } from "zustand";

export type LineKind = "input" | "out" | "err" | "ok" | "sys";
export type Line = { id: number; kind: LineKind; node: ReactNode };

type TermState = {
  lines: Line[];
  history: string[];
  booted: boolean;
  push: (node: ReactNode, kind?: LineKind) => void;
  clear: () => void;
  remember: (cmd: string) => void;
  boot: () => void;
};

let seq = 0;
const MAX_LINES = 240;

/** Scrollback and history survive closing the terminal for the rest of the visit. */
export const useTerm = create<TermState>()((set) => ({
  lines: [],
  history: [],
  booted: false,
  push: (node, kind = "out") => set((s) => ({ lines: [...s.lines, { id: ++seq, kind, node }].slice(-MAX_LINES) })),
  clear: () => set({ lines: [] }),
  remember: (cmd) =>
    set((s) => (s.history[s.history.length - 1] === cmd ? s : { history: [...s.history, cmd].slice(-100) })),
  boot: () => set({ booted: true }),
}));
