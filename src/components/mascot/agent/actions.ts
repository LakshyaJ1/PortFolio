"use client";

// Client-executed tools. The live agent and the offline field guide both run their
// actions through here, so a tool behaves the same whichever brain asked for it.

import { PROFILE, PROJECTS } from "@/content/profile";
import { CACHES } from "@/lib/caches";
import { emit } from "@/lib/events";
import { scrollToTarget } from "@/lib/scroll";
import { sectionById, type SectionId } from "@/lib/sections";
import { useApp } from "@/lib/store";
import type { CardRef, GameName, LinkName, ToolCall } from "./spec";
import { cardData } from "./cards";

export type ActionStatus = "done" | "failed" | "offer";

export type Part =
  | { kind: "text"; text: string }
  | { kind: "action"; label: string; status: ActionStatus; href?: string; icon: "arrow-right" | "arrow-ne" | "copy" | "flag" | "calendar" | "play" }
  | { kind: "card"; card: CardRef }
  | { kind: "note"; text: string; tone: "info" | "error" };

export type ToolContext = {
  /** true on phones: the drawer is a full-screen sheet and must get out of the way */
  narrow: boolean;
  closeDrawer: () => void;
};

export type ToolOutcome = { part: Part | null; result: string; failed?: boolean };

const SETU_URL = PROJECTS.find((p) => p.id === "setu")?.links[0]?.href ?? PROFILE.github;

export const LINKS: Record<LinkName, { label: string; href: string }> = {
  github: { label: "GitHub", href: PROFILE.github },
  linkedin: { label: "LinkedIn", href: PROFILE.linkedin },
  resume: { label: "Résumé (PDF)", href: PROFILE.resumePath },
  setu: { label: "SETU site", href: SETU_URL },
  calendar: { label: "Booking page", href: PROFILE.calUrl },
};

const GAMES: Record<GameName, string> = {
  rover: "the rover",
  snake: "snake",
  deepfake: "the deepfake spotter",
  coin: "the coin hunt",
};

/** Opens a tab; returns false when the browser blocked it (no recent user gesture). */
function openTab(href: string) {
  const w = window.open(href, "_blank");
  if (!w) return false;
  try {
    w.opener = null;
  } catch {
    /* cross-origin already */
  }
  return true;
}

function goTo(section: SectionId, ctx: ToolContext) {
  const el = document.getElementById(section);
  if (!el) return false;
  if (ctx.narrow) {
    ctx.closeDrawer();
    // let the scroll lock release before Lenis moves
    window.setTimeout(() => scrollToTarget(el), 80);
  } else {
    scrollToTarget(el);
  }
  return true;
}

export function nextHint() {
  const found = useApp.getState().caches;
  const count = Object.keys(found).length;
  const next = CACHES.find((c) => !found[c.id]);
  return { next, count, total: CACHES.length };
}

export async function runTool(call: ToolCall, ctx: ToolContext): Promise<ToolOutcome> {
  switch (call.name) {
    case "navigate": {
      const meta = sectionById(call.input.section)!;
      const ok = goTo(meta.id, ctx);
      return ok
        ? { part: { kind: "action", label: meta.plain, status: "done", icon: "arrow-right" }, result: `Scrolled the page to the ${meta.plain} section.` }
        : { part: { kind: "action", label: meta.plain, status: "failed", icon: "arrow-right" }, result: `The ${meta.plain} section isn't on this page.`, failed: true };
    }

    case "open_booking": {
      const el = document.getElementById("rendezvous");
      if (!el) {
        const opened = openTab(PROFILE.calUrl);
        return {
          part: { kind: "action", label: "Booking page", status: opened ? "done" : "offer", href: PROFILE.calUrl, icon: "calendar" },
          result: opened ? "Opened the booking page in a new tab." : "Offered the booking page as a link the visitor can tap.",
        };
      }
      ctx.closeDrawer();
      window.setTimeout(() => {
        scrollToTarget(el);
        // The contact section can expose its opener with [data-booking-open].
        window.setTimeout(() => el.querySelector<HTMLElement>("[data-booking-open]")?.click(), 1500);
      }, 80);
      return {
        part: { kind: "action", label: "Book a call", status: "done", icon: "calendar" },
        result: "Closed the chat and took the visitor to the contact section, where the 30-minute booking calendar is.",
      };
    }

    case "copy_email": {
      try {
        await navigator.clipboard.writeText(PROFILE.email);
        emit("copy:email", {});
        useApp.getState().toast({ title: "Email copied", body: PROFILE.email });
        return { part: { kind: "action", label: "Email copied", status: "done", icon: "copy" }, result: `Copied ${PROFILE.email} to the clipboard.` };
      } catch {
        return {
          part: { kind: "action", label: PROFILE.email, status: "offer", href: `mailto:${PROFILE.email}`, icon: "arrow-ne" },
          result: `The clipboard was blocked; offered ${PROFILE.email} as a mail link instead.`,
        };
      }
    }

    case "open_link": {
      const link = LINKS[call.input.name];
      const opened = openTab(link.href);
      return {
        part: { kind: "action", label: link.label, status: opened ? "done" : "offer", href: link.href, icon: "arrow-ne" },
        result: opened ? `Opened ${link.label} in a new tab.` : `The browser blocked the new tab, so ${link.label} is offered as a link the visitor can tap.`,
      };
    }

    case "start_game": {
      useApp.getState().startGame(call.input.id);
      return {
        part: { kind: "action", label: `Started ${GAMES[call.input.id]}`, status: "done", icon: "play" },
        result: `Started ${GAMES[call.input.id]}; the chat is closed while they play.`,
      };
    }

    case "reveal_hint": {
      const { next, count, total } = nextHint();
      if (!next) {
        return { part: { kind: "action", label: "All Easter eggs found", status: "done", icon: "flag" }, result: `The visitor has found all ${total} Easter eggs.` };
      }
      return {
        part: { kind: "action", label: `Easter egg hint · ${count}/${total} found`, status: "done", icon: "flag" },
        result: `Hint for one Easter egg they have not found (${count} of ${total} found so far): "${next.hint}"`,
      };
    }

    case "show_card": {
      const data = cardData(call.input);
      if (!data) return { part: null, result: "No card with that id.", failed: true };
      return { part: { kind: "card", card: call.input }, result: `Showed the card for ${data.title}.` };
    }
  }
}
