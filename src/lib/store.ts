"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { CacheId } from "./caches";
import type { SectionId } from "./sections";

/** Intro sequence: greeting (hellos) → intro (talking avatar) → site. */
export type Phase = "greeting" | "intro" | "site";

export type Overlay = "agent" | "terminal" | "game" | "logbook" | null;

export type GameId = "rover" | "snake" | "deepfake" | "coin";

export type MascotMood =
  | "sleeping"
  | "waking"
  | "idle"
  | "listening"
  | "thinking"
  | "searching"
  | "working"
  | "excited"
  | "bored"
  | "suspicious"
  | "angry"
  | "drowsy"
  | "happy"
  | "curious"
  | "confused"
  | "surprised"
  | "proud"
  | "shy"
  | "sad"
  | "laughing"
  | "scared"
  | "playful"
  | "celebrate";

export type Toast = { id: number; title: string; body?: string; tone?: "cache" | "info" | "error" };

type AppState = {
  phase: Phase;
  setPhase: (phase: Phase) => void;

  /** sound is on (intro voice, game blips): on by default, the visitor can turn it off (remembered) */
  sound: boolean;
  setSound: (on: boolean) => void;

  /** "plain sheet": heavy effects off, recruiter-fast reading */
  plain: boolean;
  setPlain: (on: boolean) => void;

  overlay: Overlay;
  openOverlay: (overlay: Exclude<Overlay, null>) => void;
  closeOverlay: () => void;

  game: GameId | null;
  startGame: (game: GameId) => void;

  activeSection: SectionId;
  setActiveSection: (id: SectionId) => void;

  mascotMood: MascotMood;
  setMascotMood: (mood: MascotMood) => void;
  /** speech bubble text; null hides it */
  mascotLine: string | null;
  say: (line: string | null) => void;
  /** "Quiet, Bindu": her guided tour and tips are off for this session (she still answers when asked) */
  guideMuted: boolean;
  setGuideMuted: (on: boolean) => void;

  /** found geocaches: id → timestamp (ms) */
  caches: Partial<Record<CacheId, number>>;
  /** returns true the first time a cache is found */
  findCache: (id: CacheId) => boolean;
  resetCaches: () => void;

  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
};

// Storage that never throws (private mode, blocked site data, previews).
const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

let toastSeq = 0;

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      phase: "greeting",
      setPhase: (phase) => set({ phase }),

      sound: true,
      setSound: (sound) => set({ sound }),

      plain: false,
      setPlain: (plain) => set({ plain }),

      overlay: null,
      openOverlay: (overlay) => set({ overlay }),
      closeOverlay: () => set({ overlay: null, game: null }),

      game: null,
      startGame: (game) => set({ game, overlay: "game" }),

      activeSection: "top",
      setActiveSection: (activeSection) => set({ activeSection }),

      mascotMood: "idle",
      setMascotMood: (mascotMood) => set({ mascotMood }),
      mascotLine: null,
      say: (mascotLine) => set({ mascotLine }),
      guideMuted: false,
      setGuideMuted: (guideMuted) => set({ guideMuted }),

      caches: {},
      findCache: (id) => {
        if (get().caches[id]) return false;
        set((s) => ({ caches: { ...s.caches, [id]: Date.now() } }));
        return true;
      },
      resetCaches: () => set({ caches: {} }),

      toasts: [],
      toast: (t) => {
        const id = ++toastSeq;
        set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
        window.setTimeout(() => get().dismissToast(id), 5200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
    }),
    {
      name: "lj-sheet",
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      // Only durable, per-visitor conveniences persist.
      partialize: (s) => ({ caches: s.caches, plain: s.plain, sound: s.sound }),
      // Rehydrated after mount (AppShell) so server and first client render match.
      skipHydration: true,
    },
  ),
);
