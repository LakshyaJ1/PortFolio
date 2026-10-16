"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

// Local state for the sheet chrome. The app store's `overlay` union doesn't cover the
// sections menu, and the custom-cursor preference only matters to this folder.

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
      /* private mode, blocked storage: the preference just won't persist */
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

type ChromeState = {
  /** visitor wants the dead-reckoning fix cursor (desktop only) */
  cursor: boolean;
  setCursor: (on: boolean) => void;
  /** the sections menu */
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
};

export const useChrome = create<ChromeState>()(
  persist(
    (set) => ({
      cursor: true,
      setCursor: (cursor) => set({ cursor }),
      menuOpen: false,
      openMenu: () => set({ menuOpen: true }),
      closeMenu: () => set({ menuOpen: false }),
    }),
    {
      name: "lj-chrome",
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ cursor: s.cursor }),
      // rehydrated after mount so the server render and first client render agree
      skipHydration: true,
    },
  ),
);

let hydrated = false;
export function hydrateChrome() {
  if (hydrated) return;
  hydrated = true;
  void useChrome.persist.rehydrate();
}
