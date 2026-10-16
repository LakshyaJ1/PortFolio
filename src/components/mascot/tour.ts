"use client";

// Bindu's guided tour: what she says, where she points (a `data-guide` anchor, see
// docs/GUIDE.md), and what the visitor has already heard this session. Lines are short and
// plain; every claim about Lakshya comes from profile.ts. A step whose anchor isn't on the
// page (or isn't on screen) is skipped and not marked as heard, so it can play later.

import { PROFILE } from "@/content/profile";
import { CACHES, type CacheId } from "@/lib/caches";
import { sectionById, type SectionId } from "@/lib/sections";
import type { MascotMood } from "@/lib/store";

/** Higher kinds interrupt lower ones; the director keeps one bubble at a time. */
export type StepKind = "egg" | "section" | "tour" | "intro" | "nudge" | "say";
export const RANK: Record<StepKind, number> = { egg: 1, section: 2, tour: 3, intro: 4, nudge: 5, say: 5 };
/** Kinds that play on their own (a muted tour, the plain sheet and sleep silence them). */
export const AUTOMATIC: ReadonlySet<StepKind> = new Set(["egg", "section", "tour", "intro"]);

export type Step = {
  /** progress key: a step with an id plays once per session */
  id?: string;
  kind: StepKind;
  /** `data-guide` value to point at */
  anchor?: string;
  text: string | (() => string);
  label: string;
  /** ms on screen once she has arrived (default: by length) */
  ttl?: number;
  mood?: MascotMood;
};

export const lineMs = (text: string) => Math.min(8000, Math.max(3800, 2400 + text.length * 50));

/* ───────── the intro stage ───────── */

export function introSteps(enterText: () => string): Step[] {
  return [
    { id: "intro:resume", kind: "intro", anchor: "intro-resume", text: "You can download his résumé right here.", label: "Bindu", ttl: 2800, mood: "excited" },
    // stays up through the countdown (the director re-reads the text every second)
    { id: "intro:enter", kind: "intro", anchor: "intro-enter", text: enterText, label: "Bindu", ttl: 20_000, mood: "happy" },
  ];
}

/* ───────── the landing view, once the site is live ───────── */

export function heroSteps(narrow: boolean): Step[] {
  // [step, shown on phones too]: phones get fewer moves
  const all: [Step, boolean][] = [
    // phones: skipped. The only empty ground near the name is the roles text, so the bubble would cover it
    [{ id: "tour:name", kind: "tour", anchor: "hero-name", text: "This is Lakshya: AI engineer, software engineer, builds sites like this one.", label: "", mood: "happy" }, false],
    [{ id: "tour:intro", kind: "tour", anchor: "hero-intro", text: "Missed his intro, or want it again? Tap here: 20 seconds, with sound.", label: "", mood: "happy" }, true],
    [
      {
        id: "tour:terrain",
        kind: "tour",
        anchor: "hero-terrain",
        text: `${narrow ? "Tap" : "Click"} the terrain to drop a marble, and watch it roll to the global minimum.`,
        label: "",
        mood: "playful",
      },
      true,
    ],
    [{ id: "tour:terminal", kind: "tour", anchor: "hero-terminal", text: "Type help in here. It's a real terminal.", label: "", mood: "curious" }, false],
    [{ id: "tour:book", kind: "tour", anchor: "hero-book", text: "Want to talk? Book a 30-minute call right here.", label: "", mood: "excited" }, true],
  ];
  const steps = all.filter(([, phone]) => !narrow || phone).map(([s]) => s);
  return steps.map((s, i) => ({ ...s, label: `Tour · ${i + 1} of ${steps.length}` }));
}

/* ───────── one line per section, pointing at its interactive bit ───────── */

type SectionLine = { anchor?: string; text?: string; then?: { anchor: string; text: string } };

const SECTION_LINES: Partial<Record<SectionId, SectionLine>> = {
  about: { anchor: "about-pass", text: "That's his ID pass. Grab it and give it a swing." },
  capabilities: { anchor: "work-list", text: "Keep scrolling: each line slides into the band and brings up its live demo." },
  traverse: { anchor: "work-restricted", text: "That hatched one is under NDA. Knock three times?" },
  sites: {
    anchor: "projects-track",
    text: "Scroll sideways through his projects, or use the arrows.",
    then: { anchor: "projects-flip", text: "Flip a project over for the details." },
  },
  legend: { anchor: "stack", text: "Tap any tool to see where he used it." },
  log: { anchor: "log", text: "This one is live: his latest commits, straight from GitHub." },
  benchmarks: { anchor: "benchmarks", text: "His wins and awards, at a glance." },
  rendezvous: { anchor: "book", text: `Pick any free slot: 30 minutes with ${PROFILE.name.split(" ")[0]}.` },
};

/**
 * The steps for arriving at a section. `restrictedFound` swaps the NDA knock (an Easter egg)
 * for the plain timeline once it has been found. Lines without their own text fall back to
 * the section's tip from sections.ts.
 */
export function sectionSteps(id: SectionId, opts: { narrow: boolean; restrictedFound: boolean }): { anchor?: string; steps: Step[] } {
  const meta = sectionById(id);
  if (!meta || id === "top") return { steps: [] };
  let line = SECTION_LINES[id] ?? {};
  if (id === "traverse" && opts.restrictedFound) line = { anchor: "work-timeline", text: "Every role he's held, newest first." };
  const label = meta.plain;
  const steps: Step[] = [{ id: `sec:${id}`, kind: "section", anchor: line.anchor, text: line.text ?? meta.tip, label, mood: "curious" }];
  if (line.then && !opts.narrow) steps.push({ id: `sec:${id}:2`, kind: "section", anchor: line.then.anchor, text: line.then.text, label, mood: "playful" });
  return { anchor: line.anchor, steps };
}

/* ───────── Easter-egg coaching ───────── */

type EggGuide = { anchor?: string; section?: SectionId; keyboard?: boolean; say?: (narrow: boolean) => string };

// Where each egg lives, when it needs a keyboard, and the ones about Bindu herself (in her voice).
const EGGS: Partial<Record<CacheId, EggGuide>> = {
  minimum: { anchor: "hero-terrain", section: "top" },
  terminal: { anchor: "hero-terminal", section: "top" },
  restricted: { anchor: "work-restricted", section: "traverse" },
  lakshyacoin: { anchor: "projects-coin", section: "sites" },
  "north-arrow": { anchor: "footer-north" },
  konami: { keyboard: true },
  console: { keyboard: true },
  "target-lock": { keyboard: true },
  poke: { say: (narrow) => `${narrow ? "Tap" : "Click"} me 7 times, fast. I dare you.` },
  sleeper: { say: () => "Leave everything alone for about 40 seconds and watch me." },
};

/**
 * One unfound egg worth suggesting now: one whose anchor is on screen first, then one
 * that belongs to the current section, then any egg that needs no pointing.
 */
export function pickEgg(opts: {
  found: Partial<Record<CacheId, number>>;
  coached: string[];
  section: SectionId;
  keyboard: boolean;
  narrow: boolean;
  onScreen: (anchor: string) => boolean;
}): Step | null {
  const total = CACHES.length;
  const count = Object.keys(opts.found).length;
  let best: { step: Step; score: number } | null = null;
  for (const c of CACHES) {
    if (opts.found[c.id] || opts.coached.includes(c.id)) continue;
    const g = EGGS[c.id] ?? {};
    if (g.keyboard && !opts.keyboard) continue;
    let score = 1;
    if (g.anchor) {
      if (opts.onScreen(g.anchor)) score = 4;
      else if (g.section === opts.section) score = 0; // it'll be on screen in a moment; wait for it
      else score = 0.5;
    } else if (g.section === opts.section) score = 3;
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = {
        score,
        step: {
          id: `egg:${c.id}`,
          kind: "egg",
          // only point when it's actually on screen; otherwise the hint itself says where
          anchor: g.anchor && score === 4 ? g.anchor : undefined,
          text: g.say?.(opts.narrow) ?? c.hint,
          label: `Easter egg · ${count} of ${total} found`,
          mood: "playful",
        },
      };
    }
  }
  return best?.step ?? null;
}

/* ───────── session progress ───────── */

const KEY = "lj-bindu-guide";
export type Progress = { seen: string[]; muted: boolean; coached: string[] };

export function loadProgress(): Progress {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as Partial<Progress> | null;
    return { seen: raw?.seen ?? [], muted: raw?.muted === true, coached: raw?.coached ?? [] };
  } catch {
    return { seen: [], muted: false, coached: [] };
  }
}

export function saveProgress(p: Progress) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: progress lasts as long as the page */
  }
}
