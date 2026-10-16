"use client";

import { scrollToTarget, getLenis } from "@/lib/scroll";
import type { SectionId } from "@/lib/sections";
import { useApp } from "@/lib/store";

/** Clearance so a section's edge rule lands below the condensed nav plates. */
export const NAV_CLEARANCE = 48;

let lockedByChrome = false;

/** Lock page scroll for a chrome overlay (Lenis stopped + `is-locked`). */
export function lockPage() {
  lockedByChrome = true;
  document.documentElement.classList.add("is-locked");
  getLenis()?.stop();
}

/** Release the chrome's lock, unless something in the app store still needs the page held. */
export function unlockPage() {
  if (!lockedByChrome) return;
  lockedByChrome = false;
  const { overlay, phase } = useApp.getState();
  if (overlay !== null || phase !== "site") return;
  document.documentElement.classList.remove("is-locked");
  getLenis()?.start();
}

/**
 * Travel to a section. With `focus`, keyboard focus lands on the section heading too,
 * so the next Tab continues from where the visitor arrived.
 */
export function goToSection(id: SectionId, { focus = false }: { focus?: boolean } = {}) {
  scrollToTarget(id, { offset: id === "top" ? 0 : -NAV_CLEARANCE });
  if (!focus) return;
  const el = document.getElementById(`${id}-title`) ?? document.getElementById(id);
  if (!el) return;
  if (!el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1");
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
  }
  el.focus({ preventScroll: true });
}
