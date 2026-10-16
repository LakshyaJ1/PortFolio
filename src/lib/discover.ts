"use client";

import { CACHES, cacheById, type CacheId } from "./caches";
import { emit } from "./events";
import { useApp } from "./store";

/**
 * Log an Easter egg. Safe to call repeatedly: only the first find toasts and celebrates.
 * Returns true when this call was the first find.
 */
export function discover(id: CacheId) {
  const app = useApp.getState();
  const first = app.findCache(id);
  if (!first) return false;
  const meta = cacheById(id);
  const found = Object.keys(useApp.getState().caches).length;
  app.toast({
    tone: "cache",
    title: `Easter egg ${found}/${CACHES.length} · ${meta.name}`,
    body: meta.reward,
  });
  emit("cache:found", { id });
  return true;
}
