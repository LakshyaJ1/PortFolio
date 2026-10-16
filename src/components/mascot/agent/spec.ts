// The contract between the /api/agent route and the drawer: tool names, their
// arguments, and the limits both sides enforce. Pure data, safe on server and client.

import { ACHIEVEMENTS, EDUCATION, EXPERIENCE, PROJECTS } from "@/content/profile";
import { SECTIONS, type SectionId } from "@/lib/sections";

export const SECTION_IDS = SECTIONS.map((s) => s.id) as [SectionId, ...SectionId[]];
export const LINK_NAMES = ["github", "linkedin", "resume", "setu", "calendar"] as const;
export const GAME_IDS = ["rover", "snake", "deepfake", "coin"] as const;
export const CARD_KINDS = ["project", "role", "education", "achievement"] as const;

export type LinkName = (typeof LINK_NAMES)[number];
export type GameName = (typeof GAME_IDS)[number];
export type CardKind = (typeof CARD_KINDS)[number];
export type CardRef = { kind: CardKind; id: string };

export const CARD_IDS: Record<CardKind, string[]> = {
  project: PROJECTS.map((p) => p.id),
  role: EXPERIENCE.map((e) => e.id),
  education: EDUCATION.map((e) => e.id),
  achievement: ACHIEVEMENTS.map((a) => a.id),
};

/** Where each card kind lives on the sheet. */
export const CARD_SECTION: Record<CardKind, SectionId> = {
  project: "sites",
  role: "traverse",
  education: "about",
  achievement: "benchmarks",
};

export type ToolCall =
  | { name: "navigate"; input: { section: SectionId } }
  | { name: "open_booking"; input: Record<string, never> }
  | { name: "copy_email"; input: Record<string, never> }
  | { name: "open_link"; input: { name: LinkName } }
  | { name: "start_game"; input: { id: GameName } }
  | { name: "reveal_hint"; input: Record<string, never> }
  | { name: "show_card"; input: CardRef };

export type ToolName = ToolCall["name"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/**
 * Validate a model-supplied tool call. The route passes arguments through as the model
 * wrote them; this is the gate before anything runs.
 */
export function parseToolCall(name: string, input: unknown): ToolCall | null {
  const args = isObj(input) ? input : {};
  switch (name) {
    case "navigate":
      return oneOf(SECTION_IDS, args.section) ? { name, input: { section: args.section } } : null;
    case "open_booking":
    case "copy_email":
    case "reveal_hint":
      return { name, input: {} };
    case "open_link":
      return oneOf(LINK_NAMES, args.name) ? { name, input: { name: args.name } } : null;
    case "start_game":
      return oneOf(GAME_IDS, args.id) ? { name, input: { id: args.id } } : null;
    case "show_card": {
      if (!oneOf(CARD_KINDS, args.kind) || typeof args.id !== "string") return null;
      return CARD_IDS[args.kind].includes(args.id) ? { name, input: { kind: args.kind, id: args.id } } : null;
    }
    default:
      return null;
  }
}

/** Guardrails shared by the route (enforced) and the drawer (pre-checked for nicer errors). */
export const LIMITS = {
  /** characters per visitor message */
  userChars: 500,
  /** visitor questions per conversation */
  userTurns: 12,
  /** model round-trips the client may run for one question (tool loop) */
  toolRounds: 4,
  /** messages in a posted history */
  messages: 64,
  /** bytes of a posted body (thought signatures ride along, so there is headroom) */
  bodyBytes: 128_000,
  /** server-side deadline per request, ms */
  timeoutMs: 30_000,
} as const;

/* ───────── the conversation, in the Gemini API's content shape ─────────
   The browser holds the history and posts it whole each turn; the route re-validates it.
   Model parts go back exactly as they came (thought signatures included): Gemini 3 models
   reject a function-calling history whose signatures were dropped. */

/** One part of a model turn, as the route streamed it to the client. */
export type ModelPart = {
  text?: string;
  thought?: boolean;
  /** opaque, base64; echo it back untouched */
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
};

/** A tool's outcome, sent back as the next user turn. */
export type FunctionResponsePart = {
  functionResponse: { id?: string; name: string; response: { output: string } | { error: string } };
};

export type Turn = { role: "user"; parts: [{ text: string }] | FunctionResponsePart[] } | { role: "model"; parts: ModelPart[] };

/** A function call the model asked for (args unvalidated: parseToolCall gates them). */
export type FunctionCallOut = { id?: string; name: string; args: Record<string, unknown> };

/** One line of the NDJSON stream the route sends back. */
export type AgentStreamEvent =
  | { t: "text"; d: string }
  | { t: "done"; parts: ModelPart[]; calls: FunctionCallOut[] }
  | { t: "error"; code: "timeout" | "busy" | "upstream" | "refusal" | "truncated" };

/** Non-stream JSON replies from the route. */
export type AgentJsonReply =
  | { offline: true }
  | { error: "rate_limited"; retryAfter: number }
  | { error: "turn_limit" | "bad_request" | "too_large" };
