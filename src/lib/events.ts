"use client";

// A tiny typed event bus for moments that several systems react to
// (the mascot, the cursor, toasts) without coupling them to each other.

import type { CacheId } from "./caches";
import type { SectionId } from "./sections";

export type SheetEvents = {
  "cta:hover": { id: string };
  "cta:leave": { id: string };
  "section:enter": { id: SectionId };
  "cache:found": { id: CacheId };
  "booking:open": Record<string, never>;
  "booking:done": Record<string, never>;
  "form:error": { message: string };
  "agent:thinking": { on: boolean };
  "copy:email": Record<string, never>;
  "intro:replay": Record<string, never>;
  "target:lock": Record<string, never>;
  /**
   * The opening stage's progress, for Bindu's guided tour (emitted by components/intro).
   * gate = "tap anywhere" screen; spawn = avatar appearing/waving; speaking = a line is playing
   * (clip "intro" | "offer"); spoken = both lines done; countdown = auto-enter running (`left` s);
   * paused = countdown held (visitor is busy); entered = stage closed, the page is live.
   */
  "intro:stage": {
    phase: "gate" | "spawn" | "speaking" | "spoken" | "countdown" | "paused" | "entered";
    clip?: "intro" | "offer";
    left?: number;
  };
  /**
   * Ask Bindu to fly to an element and say something. `anchor` is a `data-guide` value
   * (see docs/GUIDE.md); `ttl` ms before she lets go (default ~5 s).
   */
  "guide:nudge": { anchor: string; text: string; ttl?: number };
};

type Handler<T> = (payload: T) => void;
const handlers = new Map<keyof SheetEvents, Set<Handler<unknown>>>();

export function on<K extends keyof SheetEvents>(type: K, handler: Handler<SheetEvents[K]>) {
  let set = handlers.get(type);
  if (!set) handlers.set(type, (set = new Set()));
  set.add(handler as Handler<unknown>);
  return () => {
    set!.delete(handler as Handler<unknown>);
  };
}

export function emit<K extends keyof SheetEvents>(type: K, payload: SheetEvents[K]) {
  handlers.get(type)?.forEach((h) => {
    try {
      h(payload);
    } catch (err) {
      console.error(`[sheet] handler for ${type} failed`, err);
    }
  });
}
