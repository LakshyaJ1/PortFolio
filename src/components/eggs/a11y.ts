"use client";

import { useEffect, useState, type RefObject } from "react";
import { prefersReducedMotion, useLatest } from "@/lib/hooks";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// Overlays can hand over to each other (terminal → game). The element focus returns to
// is the last thing focused *outside* every egg dialog, shared across them.
let returnTarget: HTMLElement | null = null;

function captureReturnTarget() {
  const a = document.activeElement as HTMLElement | null;
  if (a && a !== document.body && !a.closest("[data-egg-dialog]")) returnTarget = a;
}

function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("inert") && el.getClientRects().length > 0 && !el.closest("[inert]"),
  );
}

/**
 * Modal dialog behaviour: initial focus, Tab trapped inside, Escape handled, focus restored on close.
 * Components that own Tab (the terminal's completion) call preventDefault and the trap stands aside.
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  opts: { onEscape: () => void; initialFocus?: () => HTMLElement | null | undefined },
) {
  const optsRef = useLatest(opts);

  useEffect(() => {
    if (!open) return;
    captureReturnTarget();
    const root = ref.current;
    const raf = requestAnimationFrame(() => {
      const el = optsRef.current.initialFocus?.() ?? (root ? focusables(root)[0] : null) ?? root;
      el?.focus({ preventScroll: true });
    });

    const onKey = (e: KeyboardEvent) => {
      const node = ref.current;
      if (!node || e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        optsRef.current.onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusables(node);
      if (!nodes.length) {
        e.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !node.contains(active)) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    // window listeners run after React's, so components can claim keys first
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      const node = root;
      const active = document.activeElement as HTMLElement | null;
      // Only pull focus back if it is still ours (or lost to <body>), and no other egg dialog took over.
      const ours = !active || active === document.body || (node?.contains(active) ?? false);
      window.setTimeout(() => {
        if (!ours) return;
        if (document.querySelector('[data-egg-dialog][data-state="open"]')) return;
        if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
        else if (node?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      }, 0);
    };
  }, [open, ref, optsRef]);
}

/** Keeps a closing overlay mounted long enough to play its exit. */
export function usePresence(open: boolean, exitMs = 320) {
  const [present, setPresent] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setPresent(true);
  }
  useEffect(() => {
    if (open || !present) return;
    const t = window.setTimeout(() => setPresent(false), prefersReducedMotion() ? 0 : exitMs);
    return () => window.clearTimeout(t);
  }, [open, present, exitMs]);
  return present;
}
