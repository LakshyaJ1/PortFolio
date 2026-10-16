// Guardrails for /api/agent: a per-IP rate limit, and a strict re-shaping of the
// client-held conversation so nothing but well-formed, size-capped turns reaches the model.

import type { Content, Part } from "@google/genai";
import { LIMITS } from "@/components/mascot/agent/spec";

/* ───────── rate limit (in-memory, per server instance) ───────── */

const WINDOWS = [
  { ms: 60_000, max: 16 }, // a question can take 2–3 requests (tool round-trips)
  { ms: 60 * 60_000, max: 120 },
];
const hits = new Map<string, number[]>();
let lastSweep = 0;

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/** Records a hit; returns seconds to wait when the IP is over a limit, else 0. */
export function rateLimit(ip: string, now = Date.now()) {
  const longest = WINDOWS[WINDOWS.length - 1]!.ms;
  if (now - lastSweep > 5 * 60_000) {
    lastSweep = now;
    for (const [key, list] of hits) if (!list.length || now - list[list.length - 1]! > longest) hits.delete(key);
  }
  const list = (hits.get(ip) ?? []).filter((t) => now - t < longest);
  for (const w of WINDOWS) {
    const inWindow = list.filter((t) => now - t < w.ms);
    if (inWindow.length >= w.max) {
      hits.set(ip, list);
      return Math.max(1, Math.ceil((inWindow[0]! + w.ms - now) / 1000));
    }
  }
  list.push(now);
  hits.set(ip, list);
  return 0;
}

/* ───────── conversation validation ───────── */

type Fail = { ok: false; error: "bad_request" | "turn_limit" };
type Ok = { ok: true; contents: Content[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
/** optional string field: undefined when absent, null when present but invalid */
const optStr = (v: unknown, max: number) => (v === undefined ? undefined : str(v, max));
const NAME = /^[a-z_]{1,64}$/;

/** A model part goes back exactly as the route sent it: text, a function call, a bare signature. */
function modelPart(p: unknown): Part | null {
  if (!isObj(p)) return null;
  const sig = optStr(p.thoughtSignature, 64_000);
  if (sig === null) return null;
  const signed: Part = sig ? { thoughtSignature: sig } : {};
  if (p.functionCall !== undefined) {
    const fc = p.functionCall;
    if (!isObj(fc) || p.text !== undefined) return null;
    const name = str(fc.name, 64);
    const id = optStr(fc.id, 200);
    const args = fc.args === undefined ? {} : fc.args;
    if (name === null || !NAME.test(name) || id === null || !isObj(args) || JSON.stringify(args).length > 2000) return null;
    return { ...signed, functionCall: { ...(id ? { id } : {}), name, args } };
  }
  if (p.text !== undefined) {
    const text = str(p.text, 8000);
    if (text === null) return null;
    return { ...signed, text, ...(p.thought === true ? { thought: true } : {}) };
  }
  return sig ? { ...signed, text: "" } : null;
}

/** A tool outcome the browser reports: { output } on success, { error } on failure. */
function responsePart(p: unknown): Part | null {
  if (!isObj(p) || !isObj(p.functionResponse)) return null;
  const fr = p.functionResponse;
  const name = str(fr.name, 64);
  const id = optStr(fr.id, 200);
  if (name === null || !NAME.test(name) || id === null || !isObj(fr.response)) return null;
  const output = optStr(fr.response.output, 1200);
  const error = optStr(fr.response.error, 1200);
  if (output === null || error === null || (output === undefined) === (error === undefined)) return null;
  return { functionResponse: { ...(id ? { id } : {}), name, response: output !== undefined ? { output } : { error: error! } } };
}

/**
 * The client keeps the conversation (it runs the tools), so the server re-validates
 * every turn: alternating roles, user first and last, capped sizes and turn counts.
 */
export function parseConversation(body: unknown): Ok | Fail {
  if (!isObj(body) || !Array.isArray(body.messages)) return { ok: false, error: "bad_request" };
  const raw = body.messages as unknown[];
  if (raw.length === 0 || raw.length > LIMITS.messages) return { ok: false, error: raw.length ? "turn_limit" : "bad_request" };

  const out: Content[] = [];
  let questions = 0;
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];
    const role = i % 2 === 0 ? "user" : "model";
    if (!isObj(m) || m.role !== role || !Array.isArray(m.parts) || m.parts.length === 0) return { ok: false, error: "bad_request" };
    const parts = m.parts as unknown[];

    if (role === "user") {
      const first = parts[0];
      if (parts.length === 1 && isObj(first) && typeof first.text === "string") {
        // a question
        const text = first.text.trim();
        if (!text || text.length > LIMITS.userChars) return { ok: false, error: "bad_request" };
        questions++;
        out.push({ role: "user", parts: [{ text }] });
      } else {
        // tool outcomes
        if (parts.length > 4) return { ok: false, error: "bad_request" };
        const checked = parts.map(responsePart);
        if (checked.some((p) => p === null)) return { ok: false, error: "bad_request" };
        out.push({ role: "user", parts: checked as Part[] });
      }
    } else {
      if (parts.length > 24) return { ok: false, error: "bad_request" };
      const checked = parts.map(modelPart);
      if (checked.some((p) => p === null)) return { ok: false, error: "bad_request" };
      out.push({ role: "model", parts: checked as Part[] });
    }
  }

  if (out[out.length - 1]!.role !== "user") return { ok: false, error: "bad_request" };
  if (questions > LIMITS.userTurns) return { ok: false, error: "turn_limit" };
  return { ok: true, contents: out };
}
