// Résumé cards for the chat thread, built straight from profile.ts (never from model text).

import { ACHIEVEMENTS, EDUCATION, EXPERIENCE, PROJECTS } from "@/content/profile";
import { formatMonth } from "@/lib/geo";
import type { SectionId } from "@/lib/sections";
import { CARD_SECTION, type CardRef } from "./spec";

export type CardData = {
  title: string;
  sub?: string;
  /** dates, place, mode: rendered in mono */
  meta?: string;
  /** a category label */
  tag?: string;
  points: string[];
  figures: { value: string; label: string }[];
  section: SectionId;
  restricted?: boolean;
  link?: { label: string; href: string };
};

/** 2–3 points, fewer when they run long, so a card stays a glance. */
function pick(points: string[]) {
  const out: string[] = [];
  let chars = 0;
  for (const p of points) {
    if (out.length >= 3 || (out.length >= 2 && chars + p.length > 300)) break;
    out.push(p);
    chars += p.length;
  }
  return out;
}

export function cardData(ref: CardRef): CardData | null {
  const section = CARD_SECTION[ref.kind];
  switch (ref.kind) {
    case "project": {
      const p = PROJECTS.find((x) => x.id === ref.id);
      if (!p) return null;
      return {
        title: p.title,
        sub: p.subtitle,
        tag: p.category,
        points: pick(p.points),
        figures: p.figures.slice(0, 4),
        section,
        link: p.links[0],
      };
    }
    case "role": {
      const e = EXPERIENCE.find((x) => x.id === ref.id);
      if (!e) return null;
      return {
        title: e.role,
        sub: e.orgNote ? `${e.org} · ${e.orgNote}` : e.org,
        meta: `${formatMonth(e.start)} – ${formatMonth(e.end)} · ${e.place} · ${e.mode}`,
        points: pick(e.points),
        figures: [],
        section,
        restricted: e.nda,
        link: e.link,
      };
    }
    case "education": {
      const e = EDUCATION.find((x) => x.id === ref.id);
      if (!e) return null;
      return {
        title: e.school,
        sub: e.detail,
        meta: `${e.start} – ${e.end} · ${e.place}`,
        points: [],
        figures: [{ value: e.score, label: "score" }],
        section,
      };
    }
    case "achievement": {
      const a = ACHIEVEMENTS.find((x) => x.id === ref.id);
      if (!a) return null;
      return {
        title: a.title,
        sub: a.detail,
        points: [],
        figures: a.figure ? [{ value: a.figure, label: "benchmark" }] : [],
        section,
      };
    }
  }
}
