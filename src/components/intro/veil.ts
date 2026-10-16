"use client";

import { useApp } from "@/lib/store";

// The greeting unmounts the moment the phase flips to "intro", and the intro stage is a lazy
// chunk that can take a frame or two to mount. A plain ground-coloured veil bridges that gap
// so the sheet underneath never flashes. The intro drops it after its first paint; it also
// lifts itself if the phase reaches "site" or after a safety timeout.

const ATTR = "data-intro-veil";

export function raiseVeil() {
  if (typeof document === "undefined" || document.querySelector(`[${ATTR}]`)) return;
  const veil = document.createElement("div");
  veil.setAttribute(ATTR, "");
  veil.setAttribute("aria-hidden", "true");
  veil.style.cssText =
    "position:fixed;inset:0;z-index:calc(var(--layer-intro) - 1);background:var(--z1);pointer-events:none";
  document.body.appendChild(veil);
  const unsub = useApp.subscribe((s) => {
    if (s.phase === "site") drop();
  });
  const timer = window.setTimeout(drop, 8000);
  function drop() {
    veil.remove();
    unsub();
    window.clearTimeout(timer);
  }
}

export function dropVeil() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(`[${ATTR}]`).forEach((el) => el.remove());
}
