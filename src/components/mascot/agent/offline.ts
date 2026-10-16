// The offline field guide: a keyword/intent matcher that answers common questions from
// profile.ts and the section index, and triggers the same tools as the live agent.
// Runs whenever /api/agent has no key (or fails). Every sentence is built from real facts.

import { ACHIEVEMENTS, EDUCATION, EXPERIENCE, PROFILE, PROJECTS, SKILLS } from "@/content/profile";
import { CACHES } from "@/lib/caches";
import { formatDecimal, formatMonth } from "@/lib/geo";
import { SECTIONS, sectionById, type SectionId } from "@/lib/sections";
import type { CardKind, GameName, LinkName, ToolCall } from "./spec";

export type OfflineReply = { text: string; calls: ToolCall[]; suggestions: string[] };
export type OfflineContext = { foundCaches: string[] };

export const STARTERS = [
  "Would he fit an AI engineer role?",
  "What's the most impressive thing he's shipped?",
  "Walk me through SETU",
  "Book a call with him",
  "Show me something hidden",
];

/* ───────── text helpers ───────── */

function normalize(q: string) {
  return ` ${q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9%+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** whole-word / whole-phrase match on a normalized question */
const has = (q: string, ...terms: string[]) => terms.some((t) => q.includes(` ${t} `));
const count = (q: string, terms: string[]) => terms.reduce((n, t) => n + (q.includes(` ${t} `) ? 1 : 0), 0);

const card = (kind: CardKind, id: string): ToolCall => ({ name: "show_card", input: { kind, id } });
const nav = (section: SectionId): ToolCall => ({ name: "navigate", input: { section } });
const label = (id: SectionId) => sectionById(id)!.plain;
const join = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/* ───────── entities ───────── */

const PROJECT_TERMS: Record<string, string[]> = {
  setu: ["setu", "gps denied", "gnss", "egomotion", "dead reckoning", "navigation app", "cnn gru", "odometry"],
  "amazon-ml": ["amazon", "amazon ml", "pricing", "price prediction", "smape", "ml challenge", "multimodal"],
  tokenforge: ["tokenforge", "token forge", "lakshyacoin", "aptos", "launchpad", "blockchain", "web3", "move contract", "crypto"],
};

const ROLE_TERMS: Record<string, string[]> = {
  hivepro: ["hive pro", "hivepro", "hive", "isms", "sales outreach", "customer onboarding", "current job", "current role", "currently", "right now", "doing now"],
  rainwire: ["rainwire", "wardec", "army", "indian army", "military", "defence", "defense", "nda", "deepfake detection", "8b", "fine tune", "fine tuned", "finetune", "fine tuning"],
  scrini: ["scrini", "resume search", "qdrant", "semantic search", "hnsw", "search engine"],
  iitd: ["iit", "iit delhi", "xr", "extended reality", "unity", "fsm lab", "vr", "virtual reality", "training toolkit"],
  makers: ["makers asylum", "maker", "makers", "mentor", "mentoring", "mentored", "students", "teaching", "curriculum"],
  atom: ["atom", "robotics lab", "mars rover", "mars", "rover", "ros2", "ros", "gazebo", "lidar", "sensor fusion"],
};

const EDU_TERMS: Record<string, string[]> = {
  mait: ["mait", "maharaja agrasen", "college", "university", "cgpa", "gpa", "degree", "btech", "b tech", "graduate", "graduation", "education", "studies", "studying"],
  sja: ["st josephs", "st joseph", "school", "12th", "10th", "class 12", "class 10", "high school"],
};

const ACH_TERMS: Record<string, string[]> = {
  marathon: ["marathon", "half marathon", "running", "run", "vedanta"],
  quiz: ["quiz", "meity", "digital india"],
  microsoft: ["microsoft", "drone", "drone workshop"],
  clubs: ["photography", "whataclick", "fashion", "keyara", "finversion", "clubs", "hobbies", "creativity"],
};

const GAME_TERMS: Record<GameName, string[]> = {
  rover: ["rover game", "drive the rover", "drive rover", "rover"],
  snake: ["snake"],
  deepfake: ["deepfake game", "spot the deepfake", "deepfake spotter", "deepfake"],
  coin: ["coin hunt", "coin game", "coin"],
};

const LINK_TERMS: Record<LinkName, string[]> = {
  github: ["github", "git hub", "repos", "repositories", "source code"],
  linkedin: ["linkedin", "linked in"],
  resume: ["resume", "cv", "pdf", "curriculum vitae"],
  setu: ["setu site", "setu apk", "apk", "setu website"],
  calendar: ["cal com", "calendar link", "booking link"],
};

function bestEntity(q: string, table: Record<string, string[]>) {
  let best: { id: string; n: number } | null = null;
  for (const [id, terms] of Object.entries(table)) {
    const n = count(q, terms);
    if (n && (!best || n > best.n)) best = { id, n };
  }
  return best;
}

/* ───────── answers (all from profile.ts) ───────── */

function projectReply(id: string): OfflineReply {
  const p = PROJECTS.find((x) => x.id === id)!;
  const fig = p.figures[0];
  return {
    text: `${p.title} — ${p.subtitle} (${p.category}).${fig ? ` Headline figure: ${fig.value} ${fig.label}.` : ""} The card has the essentials; the full site, with its back panel, is in ${label("sites")}.`,
    calls: [card("project", id)],
    suggestions: id === "setu" ? ["What's his experience?", "Show me his GitHub", "Book a call with him"] : ["Walk me through SETU", "What's his tech stack?", "Book a call with him"],
  };
}

function roleReply(id: string): OfflineReply {
  const e = EXPERIENCE.find((x) => x.id === id)!;
  const org = e.orgNote ? `${e.org} (${e.orgNote})` : e.org;
  const when = `${formatMonth(e.start)} – ${formatMonth(e.end)}`;
  const nda = e.nda ? " That role is under NDA, so the résumé wording is all I can share." : "";
  return {
    text: `${e.role} at ${org}, ${when}.${nda} The card has the highlights; every role is in ${label("traverse")}.`,
    calls: [card("role", id)],
    suggestions: ["Would he fit an AI engineer role?", "Walk me through SETU", "Book a call with him"],
  };
}

function eduReply(id: string): OfflineReply {
  const e = EDUCATION.find((x) => x.id === id)!;
  return {
    text: `${e.detail} at ${e.school}, ${e.start}–${e.end} — ${e.score}.`,
    calls: [card("education", id)],
    suggestions: ["What's his experience?", "What has he built?", "Book a call with him"],
  };
}

function achievementReply(id: string): OfflineReply {
  const a = ACHIEVEMENTS.find((x) => x.id === id)!;
  return {
    text: `${a.title}: ${a.detail}. The rest of his achievements are in ${label("benchmarks")}.`,
    calls: [card("achievement", id)],
    suggestions: ["What's the most impressive thing he's shipped?", "Book a call with him"],
  };
}

function fitReply(): OfflineReply {
  const hive = EXPERIENCE.find((e) => e.id === "hivepro")!;
  const rain = EXPERIENCE.find((e) => e.id === "rainwire")!;
  const scrini = EXPERIENCE.find((e) => e.id === "scrini")!;
  return {
    text:
      `Going by his résumé: he's an ${hive.role} at ${hive.org}, building production agentic platforms with human-in-the-loop approvals, RBAC and policy guardrails on Claude, LangGraph and RAG. ` +
      `At ${rain.org.replace(" Pvt. Ltd.", "")} he fine-tuned an 8B-parameter LLM to 88–92% accuracy, and at ${scrini.org.replace(" Pvt. Ltd.", "")} he built semantic search over 10K+ profiles with sub-50ms retrieval. ` +
      `The best way to judge fit is a 30-minute call.`,
    calls: [card("role", "hivepro")],
    suggestions: ["Book a call with him", "Walk me through SETU", "What's his tech stack?"],
  };
}

function impressiveReply(): OfflineReply {
  return {
    text:
      `Two stand out. At Hive Pro he ships production agent platforms — approval workflows, RBAC, tenant isolation — wired to HubSpot, Slack, Gmail and more. ` +
      `And SETU bridges GPS outages on a phone with a 207 KB on-device CNN-GRU velocity model running at 1–5 ms per inference. It's in ${label("sites")}.`,
    calls: [card("project", "setu")],
    suggestions: ["Walk me through SETU", "What did he do at Hive Pro?", "Book a call with him"],
  };
}

function experienceReply(): OfflineReply {
  const stations = EXPERIENCE.map((e) => `${e.role} at ${e.org.replace(", Inc.", "").replace(" Pvt. Ltd.", "")}${e.end ? "" : " (current)"}`);
  return {
    text: `${EXPERIENCE.length} roles so far: ${join(stations)}. Taking you to ${label("traverse")}.`,
    calls: [nav("traverse")],
    suggestions: ["What did he do at Hive Pro?", "Tell me about the Army work", "Would he fit an AI engineer role?"],
  };
}

function projectsReply(): OfflineReply {
  const list = PROJECTS.map((p) => `${p.title} (${p.subtitle})`);
  return {
    text: `His projects: ${join(list)}. Turn each one over for the details — taking you to ${label("sites")}.`,
    calls: [nav("sites")],
    suggestions: ["Walk me through SETU", "Tell me about TokenForge", "What's his tech stack?"],
  };
}

function skillsReply(): OfflineReply {
  const pick = (id: string, n: number) => SKILLS.find((g) => g.id === id)!.items.slice(0, n).join(", ");
  return {
    text: `His tech stack — AI/LLM: ${pick("ai", 7)}. Languages: ${pick("lang", 6)}. Tools: ${pick("tools", 6)}. ${label("legend")} shows where each one was used.`,
    calls: [nav("legend")],
    suggestions: ["Would he fit an AI engineer role?", "What has he built?"],
  };
}

function achievementsReply(): OfflineReply {
  return {
    text: `His achievements: ${join(ACHIEVEMENTS.slice(0, 5).map((a) => `${a.title} (${a.detail})`))}.`,
    calls: [nav("benchmarks")],
    suggestions: ["Tell me about the Amazon ML Challenge", "Book a call with him"],
  };
}

function hintReply(ctx: OfflineContext): OfflineReply {
  const next = CACHES.find((c) => !ctx.foundCaches.includes(c.id));
  const found = ctx.foundCaches.length;
  if (!next) {
    return { text: `All Easter eggs found: you have all ${CACHES.length}. Nothing left hidden on this site.`, calls: [{ name: "reveal_hint", input: {} }], suggestions: ["Book a call with him"] };
  }
  return {
    text: `Easter egg hint (${found} of ${CACHES.length} found): ${next.hint}`,
    calls: [{ name: "reveal_hint", input: {} }],
    suggestions: ["Another hint", "Play a game"],
  };
}

const ABUSE = ["idiot", "stupid", "dumb", "shut up", "fuck", "fucking", "shit", "bitch", "bastard", "asshole", "moron", "useless"];

/* ───────── intent table ───────── */

type Intent = { score: (q: string, words: number) => number; reply: (q: string, ctx: OfflineContext) => OfflineReply };

const NAV_VERBS = ["go to", "take me", "show me", "open", "scroll to", "jump to", "where is", "navigate", "find"];
const NAV_STOP = new Set(["what", "do", "who", "id", "build", "code", "intro", "start", "pass", "work", "amazon", "setu", "hive", "rainwire", "scrini", "iit", "cal", "skills", "email"]);

const INTENTS: Intent[] = [
  {
    score: (q) => (has(q, ...ABUSE) ? 9 : 0),
    reply: () => ({ text: "Let's keep it kind. I'm here to help with Lakshya's work — try one of these.", calls: [], suggestions: STARTERS.slice(0, 3) }),
  },
  {
    // games: explicit play request
    score: (q) => (has(q, "play", "game", "games", "drive the rover", "spot the deepfake", "coin hunt") ? (bestEntity(q, GAME_TERMS) ? 7 : 4) : 0),
    reply: (q) => {
      const g = bestEntity(q, GAME_TERMS)?.id as GameName | undefined;
      if (g) return { text: "Starting it now. Close the game any time to come back here.", calls: [{ name: "start_game", input: { id: g } }], suggestions: [] };
      return { text: "There are four on this sheet: drive the rover, play snake, spot the deepfake, or hunt the coin. Pick one.", calls: [], suggestions: ["Play snake", "Drive the rover", "Spot the deepfake"] };
    },
  },
  {
    score: (q) => (has(q, "something hidden", "hidden", "secret", "secrets", "easter egg", "easter eggs", "egg", "eggs", "geocache", "geocaches", "cache", "caches", "hint", "another hint", "clue", "surprise") ? 6 : 0),
    reply: (_q, ctx) => hintReply(ctx),
  },
  {
    score: (q) => (has(q, "book", "booking", "schedule", "meeting", "meet him", "meet with", "a call", "call with", "quick call", "calendly", "rendezvous", "interview", "talk to him", "speak to him", "chat with him", "hop on") ? 6 : 0) - (has(q, "calendar link", "booking link", "cal com") ? 3 : 0),
    reply: () => ({ text: `Taking you to the booking calendar — pick any free slot for a 30-minute call with Lakshya.`, calls: [{ name: "open_booking", input: {} }], suggestions: ["Copy his email", "Show me his LinkedIn"] }),
  },
  {
    score: (q) => (has(q, "email", "e mail", "mail", "contact", "reach", "reach him", "get in touch", "message him", "write to him") ? 5 : 0),
    reply: () => ({ text: `His email is ${PROFILE.email} — I've copied it for you.`, calls: [{ name: "copy_email", input: {} }], suggestions: ["Book a call with him", "Show me his LinkedIn"] }),
  },
  {
    score: (q) => (has(q, "phone", "number", "whatsapp", "mobile number", "call him on") && !has(q, "book") ? 6 : 0),
    reply: () => ({ text: `His phone number isn't on this site. Email ${PROFILE.email} or book a call instead.`, calls: [], suggestions: ["Book a call with him", "Copy his email"] }),
  },
  {
    score: (q) => (bestEntity(q, LINK_TERMS) ? 5 : 0),
    reply: (q) => {
      const id = bestEntity(q, LINK_TERMS)!.id as LinkName;
      const what = { github: "his GitHub", linkedin: "his LinkedIn", resume: "his résumé", setu: "the SETU site", calendar: "his booking page" }[id];
      return { text: `Opening ${what}.`, calls: [{ name: "open_link", input: { name: id } }], suggestions: ["Walk me through SETU", "Book a call with him"] };
    },
  },
  {
    score: (q) => (has(q, "fit", "good fit", "right fit", "hire", "hire him", "hiring", "suitable", "qualified", "candidate", "why him", "why should", "ai engineer role", "strengths", "strong", "good at", "recruit") ? 6 : 0),
    reply: () => fitReply(),
  },
  {
    score: (q) => (has(q, "impressive", "most impressive", "best", "proud", "proudest", "highlight", "highlights", "standout", "stand out", "coolest", "biggest", "favourite", "favorite", "shipped") ? 5 : 0),
    reply: () => impressiveReply(),
  },
  { score: (q) => (bestEntity(q, PROJECT_TERMS) ? 6 + bestEntity(q, PROJECT_TERMS)!.n : 0), reply: (q) => projectReply(bestEntity(q, PROJECT_TERMS)!.id) },
  { score: (q) => (bestEntity(q, ROLE_TERMS) ? 5 + bestEntity(q, ROLE_TERMS)!.n : 0), reply: (q) => roleReply(bestEntity(q, ROLE_TERMS)!.id) },
  { score: (q) => (bestEntity(q, EDU_TERMS) ? 5 + bestEntity(q, EDU_TERMS)!.n : 0), reply: (q) => eduReply(bestEntity(q, EDU_TERMS)!.id) },
  { score: (q) => (bestEntity(q, ACH_TERMS) ? 5 + bestEntity(q, ACH_TERMS)!.n : 0), reply: (q) => achievementReply(bestEntity(q, ACH_TERMS)!.id) },
  {
    score: (q) => (has(q, "experience", "career", "work history", "roles", "jobs", "internships", "internship", "worked", "work experience", "traverse", "companies") ? 4 : 0),
    reply: () => experienceReply(),
  },
  {
    score: (q) => (has(q, "projects", "project", "built", "build", "made", "portfolio", "side projects", "work samples", "demos", "sites") ? 3 : 0),
    reply: () => projectsReply(),
  },
  {
    score: (q) => (has(q, "skills", "skill", "stack", "tech stack", "tech", "technologies", "languages", "tools", "frameworks", "python", "pytorch", "langgraph", "rag", "legend") ? 4 : 0),
    reply: () => skillsReply(),
  },
  {
    score: (q) => (has(q, "achievements", "achievement", "awards", "award", "won", "wins", "benchmarks", "accomplishments") ? 4 : 0),
    reply: () => achievementsReply(),
  },
  {
    score: (q) => (has(q, "where", "location", "based", "live", "lives", "city", "from", "relocate") && !has(q, "where is the", "go to") ? 3 : 0),
    reply: () => ({ text: `He's based in ${PROFILE.location} — ${formatDecimal(PROFILE.home)}. His current role at Hive Pro is remote.`, calls: [], suggestions: ["Book a call with him", "What's his experience?"] }),
  },
  {
    score: (q) => (has(q, "mean", "means", "meaning") && has(q, "name", "lakshya") ? 6 : 0),
    reply: () => ({ text: `${PROFILE.nameMeaning} That's why everything on this site heads for a target.`, calls: [], suggestions: ["Who are you?", "What has he built?"] }),
  },
  {
    score: (q) => (has(q, "who are you", "what are you", "your name", "are you ai", "are you a bot", "are you real", "are you lakshya", "bindu", "who made you") ? 6 : 0),
    reply: () => ({
      text: `I'm Bindu — बिंदु, “point”: the little survey point who shows you around this site. Right now I'm the offline field guide, answering from his résumé. I'm not Lakshya; for anything I can't answer, email him.`,
      calls: [],
      suggestions: STARTERS.slice(0, 3),
    }),
  },
  {
    score: (q) => (has(q, "who is", "who is he", "about him", "tell me about him", "summary", "introduce", "about lakshya", "who is lakshya") ? 3 : 0),
    reply: () => ({ text: `${PROFILE.name}, ${PROFILE.role}, ${PROFILE.location}: ${PROFILE.summary} Right now: ${PROFILE.status}.`, calls: [nav("about")], suggestions: STARTERS.slice(0, 3) }),
  },
  {
    // page navigation through the section index keywords
    score: (q) => {
      const s = navTarget(q);
      return s ? 2 + (has(q, ...NAV_VERBS) ? 2 : 0) : 0;
    },
    reply: (q) => {
      const id = navTarget(q)!;
      return { text: `Taking you to ${label(id)}.`, calls: [nav(id)], suggestions: STARTERS.slice(0, 2) };
    },
  },
  {
    score: (q, words) => (words <= 4 && has(q, "hi", "hello", "hey", "namaste", "hola", "yo", "good morning", "good evening") ? 2 : 0),
    reply: () => ({ text: "Namaste! I'm Bindu, the guide on this site. Ask me about Lakshya's work, or start with one of these.", calls: [], suggestions: STARTERS.slice(0, 3) }),
  },
  {
    score: (q) => (has(q, "thanks", "thank you", "thx", "cheers", "great", "cool", "nice", "awesome") ? 1.5 : 0),
    reply: () => ({ text: "Any time. If you'd like to talk to the real Lakshya, a 30-minute call is one tap away.", calls: [], suggestions: ["Book a call with him", "Show me something hidden"] }),
  },
];

function navTarget(q: string): SectionId | null {
  let best: { id: SectionId; n: number } | null = null;
  for (const s of SECTIONS) {
    const terms = [...s.keywords.filter((k) => !NAV_STOP.has(k)), s.label.toLowerCase(), s.plain.toLowerCase()];
    const n = count(q, terms);
    if (n && (!best || n > best.n)) best = { id: s.id, n };
  }
  return best?.id ?? null;
}

export function answerOffline(question: string, ctx: OfflineContext): OfflineReply {
  const q = normalize(question);
  const words = q.trim().split(" ").filter(Boolean).length;
  let best: { i: Intent; s: number } | null = null;
  for (const i of INTENTS) {
    const s = i.score(q, words);
    if (s > 0 && (!best || s > best.s)) best = { i, s };
  }
  if (best) return best.i.reply(q, ctx);
  return {
    text: `That's beyond my offline field guide. I can tell you about his roles, projects and skills, or set up a call — or email the real Lakshya at ${PROFILE.email}.`,
    calls: [],
    suggestions: STARTERS.slice(0, 4),
  };
}
