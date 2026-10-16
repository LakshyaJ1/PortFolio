"use client";

// The instrument behind the instrument: a styled greeting in DevTools and `window.lakshya`.

import { CACHES } from "@/lib/caches";
import { discover } from "@/lib/discover";
import { scrollToTarget } from "@/lib/scroll";
import { useApp, type GameId } from "@/lib/store";
import { GREETINGS, PROFILE } from "@/content/profile";
import { formatDMS } from "@/lib/geo";
import { CONSOLE_ART } from "./ascii";
import { GAME_IDS, GAME_TITLES, foundCount, formatStamp, nextUnfound } from "./shared";

export type LakshyaConsole = {
  help: () => void;
  hint: () => void;
  eggs: () => void;
  caches: () => void;
  hello: () => void;
  play: (name?: string) => void;
  book: () => void;
};

declare global {
  interface Window {
    lakshya?: LakshyaConsole;
  }
}

let greeted = false;

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    ink: v("--z10", "#eef2ec"),
    ink3: v("--z8", "#9eaba2"),
    mute: v("--z7", "#6f7f75"),
    fix: v("--fix", "#ff5b23"),
    ground: v("--z1", "#0b100d"),
  };
}

const mono = "font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5;";

function say(text: string, tone: "ink" | "fix" | "mute" = "ink") {
  const t = tokens();
  const color = tone === "fix" ? t.fix : tone === "mute" ? t.ink3 : t.ink;
  console.log(`%c${text}`, `${mono} color: ${color};`);
}

function printGreeting() {
  if (greeted) return;
  greeted = true;
  const t = tokens();
  console.log(
    `%c${CONSOLE_ART.join("\n")}\n%c\nSurveyor's console. %cTry lakshya.help()`,
    `${mono} color: ${t.ink3}; background: ${t.ground}; padding: 2px 8px;`,
    `${mono} color: ${t.ink}; font-weight: 600;`,
    `${mono} color: ${t.fix}; font-weight: 600;`,
  );
}

export function installConsole() {
  printGreeting();
  const touch = () => discover("console");

  const api: LakshyaConsole = {
    help() {
      touch();
      say("lakshya.help()      this list");
      say("lakshya.hint()      how to find the next Easter egg");
      say("lakshya.eggs()      your Easter egg logbook as a table");
      say("lakshya.hello()     a greeting in one of twelve languages");
      say(`lakshya.play(name)  start a game: ${GAME_IDS.join(" | ")}`);
      say("lakshya.book()      jump to the rendezvous and book 30 minutes");
      say("Also: press ` on the page for the terminal.", "mute");
    },
    hint() {
      touch();
      const next = nextUnfound();
      if (!next) say("All twelve Easter eggs found. Nothing left to find but him.", "fix");
      else say(`How to find "${next.name}": ${next.hint}`, "fix");
    },
    eggs() {
      touch();
      const caches = useApp.getState().caches;
      console.table(
        CACHES.map((c, i) => ({
          no: i + 1,
          "Easter egg": caches[c.id] ? c.name : "???",
          found: caches[c.id] ? formatStamp(caches[c.id]!) : "—",
        })),
      );
      say(`${foundCount(caches)} / ${CACHES.length} found`, "fix");
    },
    caches() {
      api.eggs();
    },
    hello() {
      touch();
      const g = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
      say(`${g.word} — from ${g.city}, ${formatDMS(g.coords)} (${g.lang}).`);
      say(`${PROFILE.name}, ${PROFILE.role}, surveying from ${PROFILE.location}.`, "mute");
    },
    play(name) {
      touch();
      const id = (name ?? "").toLowerCase().trim() as GameId;
      if (!GAME_IDS.includes(id as (typeof GAME_IDS)[number])) {
        say(`Pick a game: ${GAME_IDS.map((g) => `lakshya.play("${g}")`).join("  ")}`);
        return;
      }
      useApp.getState().startGame(id);
      say(`Starting ${GAME_TITLES[id as keyof typeof GAME_TITLES]}. Esc closes it.`, "fix");
    },
    book() {
      touch();
      const app = useApp.getState();
      if (app.overlay) app.closeOverlay();
      requestAnimationFrame(() => scrollToTarget("#rendezvous"));
      say(`Heading to the rendezvous at J9. Or go direct: ${PROFILE.calUrl}`, "fix");
    },
  };

  window.lakshya = api;
  return () => {
    if (window.lakshya === api) delete window.lakshya;
  };
}
