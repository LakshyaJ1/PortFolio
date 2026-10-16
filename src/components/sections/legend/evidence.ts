// Where on the page each skill is used. Computed from the résumé content in @/content/profile,
// never authored: a skill with no match says "Listed on his résumé".

import { ACHIEVEMENTS, EXPERIENCE, PROJECTS, SKILLS } from "@/content/profile";
import type { SectionId } from "@/lib/sections";

/**
 * The stack as a cross-section, top to bottom: what he builds with sits on what it is built from.
 * `pattern` is the layer's stratigraphic fill in the column key; `chips` layers have no marks.
 */
const LAYERS: { id: string; pattern: "lam" | "hatch" | "stip" | "brick" | "none"; chips?: boolean }[] = [
  { id: "ai", pattern: "lam" },
  { id: "tools", pattern: "hatch" },
  { id: "lang", pattern: "stip" },
  { id: "core", pattern: "brick" },
  { id: "soft", pattern: "none", chips: true },
];

/**
 * Terms a skill is recognised by in the résumé text. Kept conservative: an alias must name the
 * same thing (BERT is a transformer, React is JavaScript), and the matched term is shown to the visitor.
 */
const ALIASES: Record<string, string[]> = {
  LLMs: ["LLMs", "LLM"],
  "Agentic AI": ["agentic", "agent"],
  "Gen AI": ["generative AI", "Gen AI"],
  Transformers: ["Transformers", "BERT"],
  JavaScript: ["JavaScript", "Next.js", "React", "Node.js"],
  "Unity (XR)": ["Unity", "XR"],
  "Data Structures & Algorithms": ["data structures", "algorithms"],
  OOP: ["OOP", "object-oriented"],
  "Production ML": ["production"],
  "Distributed Systems": ["distributed", "microservices"],
  "Cloud-native": ["cloud-native", "cloud"],
  "Rapid Prototyping": ["prototyping", "prototype"],
  "Technical Mentorship": ["mentorship", "mentored", "mentor"],
  Teaching: ["Teaching", "workshops"],
  Leadership: ["leadership", "led"],
  "Agile/Scrum": ["Agile", "Scrum"],
  "Growth Mindset": ["growth mindset"],
};

export type Snippet = { before: string; match: string; after: string };

export type Evidence = {
  kind: "Work" | "Project" | "Achievement";
  key: string;
  name: string;
  detail: string;
  section: SectionId;
  restricted: boolean;
  /** the résumé line the match came from, trimmed around the match */
  snippet: Snippet | null;
  /** the term that matched (shown when the match came from a stack tag or title) */
  term: string;
};

export type StackItem = {
  key: string;
  label: string;
  groupId: string;
  groupLabel: string;
  evidence: Evidence[];
};

export type StackLayer = {
  id: string;
  label: string;
  pattern: (typeof LAYERS)[number]["pattern"];
  chips: boolean;
  items: StackItem[];
};

/** Find `term` in `text` as a whole word (letters may not touch either end; digits may, as in C++20). */
function findTerm(text: string, term: string) {
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  let from = 0;
  for (;;) {
    const i = lower.indexOf(t, from);
    if (i < 0) return -1;
    const before = i > 0 ? text[i - 1] : "";
    const after = text[i + t.length] ?? "";
    if (!/[a-z]/i.test(before) && !/[a-z]/i.test(after)) return i;
    from = i + 1;
  }
}

function cut(text: string, at: number, len: number): Snippet {
  const R = 64;
  let start = Math.max(0, at - R);
  let end = Math.min(text.length, at + len + R);
  if (start > 0) {
    const sp = text.indexOf(" ", start);
    start = sp > -1 && sp < at ? sp + 1 : start;
  }
  if (end < text.length) {
    const sp = text.lastIndexOf(" ", end);
    end = sp > at + len ? sp : end;
  }
  const before = (start > 0 ? "…" : "") + text.slice(start, at);
  const after = text.slice(at + len, end).replace(/[\s,;:]+$/, "") + (end < text.length ? "…" : "");
  return { before, match: text.slice(at, at + len), after };
}

type Source = {
  kind: Evidence["kind"];
  key: string;
  name: string;
  detail: string;
  section: SectionId;
  restricted: boolean;
  /** searched in order: prose first (it yields a snippet), then tags, then titles */
  points: string[];
  tags: string[];
  titles: string[];
};

const SOURCES: Source[] = [
  ...EXPERIENCE.map<Source>((e) => ({
    kind: "Work",
    key: `station:${e.id}`,
    name: e.org,
    detail: e.role,
    section: "traverse",
    restricted: Boolean(e.nda),
    points: e.points,
    tags: e.stack,
    titles: [e.role, e.orgNote ?? ""],
  })),
  ...PROJECTS.map<Source>((p) => ({
    kind: "Project",
    key: `site:${p.id}`,
    name: p.title,
    detail: p.subtitle,
    section: "sites",
    restricted: false,
    points: p.points,
    tags: p.stack,
    titles: [p.subtitle, p.category],
  })),
  ...ACHIEVEMENTS.map<Source>((a) => ({
    kind: "Achievement",
    key: `benchmark:${a.id}`,
    name: a.title,
    detail: a.detail,
    section: "benchmarks",
    restricted: false,
    points: [a.detail],
    tags: [],
    titles: [],
  })),
];

function evidenceFor(skill: string): Evidence[] {
  const terms = ALIASES[skill] ?? [skill];
  const out: Evidence[] = [];
  for (const src of SOURCES) {
    let found: { snippet: Snippet | null; term: string } | null = null;
    for (const term of terms) {
      for (const p of src.points) {
        const i = findTerm(p, term);
        if (i > -1) {
          found = { snippet: cut(p, i, term.length), term: p.slice(i, i + term.length) };
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      outer: for (const term of terms) {
        for (const t of [...src.tags, ...src.titles]) {
          const i = findTerm(t, term);
          if (i > -1) {
            found = { snippet: null, term: t };
            break outer;
          }
        }
      }
    }
    if (!found) continue;
    out.push({
      kind: src.kind,
      key: src.key,
      name: src.name,
      detail: src.detail,
      section: src.section,
      restricted: src.restricted,
      snippet: found.snippet,
      term: found.term,
    });
  }
  return out;
}

/** Layers in display order (top of the stack first); a group missing from LAYERS goes at the bottom. */
export const STACK: StackLayer[] = [...SKILLS]
  .sort((a, b) => rank(a.id) - rank(b.id))
  .map((g) => {
    const layer = LAYERS.find((l) => l.id === g.id);
    return {
      id: g.id,
      label: g.label,
      pattern: layer?.pattern ?? "none",
      chips: Boolean(layer?.chips),
      items: g.items.map((label, i) => ({
        key: `${g.id}:${i}`,
        label,
        groupId: g.id,
        groupLabel: g.label,
        evidence: evidenceFor(label),
      })),
    };
  });

function rank(id: string) {
  const i = LAYERS.findIndex((l) => l.id === id);
  return i < 0 ? LAYERS.length : i;
}

/** every item in reading order (the roving tab stop walks this) */
export const STACK_ITEMS = STACK.flatMap((l) => l.items);
/** tools proper: everything except the ways-of-working chips */
export const TOOL_COUNT = STACK.filter((l) => !l.chips).reduce((n, l) => n + l.items.length, 0);
export const TRACED_COUNT = STACK_ITEMS.filter((i) => i.evidence.length > 0).length;
