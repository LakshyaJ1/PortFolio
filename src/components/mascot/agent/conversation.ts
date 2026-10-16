"use client";

// The "Ask Bindu" conversation. The browser owns the agentic loop: it posts the history to
// /api/agent (Gemini), streams the reply, runs any function calls locally, posts their
// functionResponses, and repeats (capped). With no key, a failure or a rate limit, the
// offline guide answers.

import { create } from "zustand";
import { emit } from "@/lib/events";
import { useApp } from "@/lib/store";
import { runTool, type Part, type ToolContext } from "./actions";
import { answerOffline, STARTERS } from "./offline";
import {
  LIMITS,
  parseToolCall,
  type AgentJsonReply,
  type AgentStreamEvent,
  type FunctionCallOut,
  type FunctionResponsePart,
  type ModelPart,
  type Turn,
} from "./spec";

export type Msg = { id: number; role: "visitor" | "bindu"; at: number; parts: Part[]; pending?: boolean };
export type Mode = "unknown" | "online" | "offline";

type State = {
  msgs: Msg[];
  mode: Mode;
  busy: boolean;
  questions: number;
  suggestions: string[];
  probe: () => Promise<void>;
  send: (text: string, ctx: ToolContext) => Promise<void>;
  reset: () => void;
};

let seq = 0;
let history: Turn[] = [];
let controller: AbortController | null = null;
let probed = false;
/** bumps on reset so a reply still in flight can't write into a fresh log */
let generation = 0;

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export const useConversation = create<State>()((set, get) => {
  /** mutate the pending Bindu message */
  const patch = (id: number, fn: (parts: Part[]) => Part[], extra: Partial<Msg> = {}) =>
    set((s) => ({ msgs: s.msgs.map((m) => (m.id === id ? { ...m, ...extra, parts: fn(m.parts) } : m)) }));

  const appendText = (id: number, d: string) =>
    patch(id, (parts) => {
      const last = parts[parts.length - 1];
      if (last?.kind === "text") return [...parts.slice(0, -1), { kind: "text", text: last.text + d }];
      return [...parts, { kind: "text", text: d }];
    });

  const addPart = (id: number, part: Part) => patch(id, (parts) => [...parts, part]);

  /** The offline field guide, revealed word by word so it reads like the live one. */
  async function offline(id: number, question: string, ctx: ToolContext, note?: string) {
    if (note) addPart(id, { kind: "note", text: note, tone: "info" });
    const reply = answerOffline(question, { foundCaches: Object.keys(useApp.getState().caches) });
    await sleep(reduceMotion() ? 0 : 380);
    if (reduceMotion()) appendText(id, reply.text);
    else {
      const words = reply.text.split(/(\s+)/);
      for (let i = 0; i < words.length; i += 4) {
        appendText(id, words.slice(i, i + 4).join(""));
        await sleep(28);
      }
    }
    for (const call of reply.calls) {
      const out = await runTool(call, ctx);
      if (out.part) addPart(id, out.part);
    }
    set({ suggestions: reply.suggestions });
  }

  type TurnResult = { parts: ModelPart[]; calls: FunctionCallOut[]; said: boolean };

  /** One streamed model turn. Returns the model's parts and calls, or an error code. */
  async function turn(id: number, signal: AbortSignal): Promise<TurnResult | { fail: string } | { json: AgentJsonReply }> {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history }),
      signal,
    });
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/json")) return { json: (await res.json()) as AgentJsonReply };
    if (!res.ok || !res.body) return { fail: "upstream" };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let result: TurnResult | { fail: string } = { fail: "upstream" };
    let said = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev: AgentStreamEvent;
        try {
          ev = JSON.parse(line) as AgentStreamEvent;
        } catch {
          continue;
        }
        if (ev.t === "text") {
          said ||= ev.d.trim().length > 0;
          appendText(id, ev.d);
        } else if (ev.t === "done") result = { parts: ev.parts, calls: ev.calls, said };
        else if (ev.t === "error") result = { fail: ev.code };
      }
    }
    return result;
  }

  async function online(id: number, question: string, ctx: ToolContext) {
    const snapshot = history.slice();
    history.push({ role: "user", parts: [{ text: question }] });
    controller = new AbortController();
    const { signal } = controller;

    const fallBack = async (note: string) => {
      history = snapshot;
      await offline(id, question, ctx, note);
    };

    try {
      for (let round = 0; ; round++) {
        const r = await turn(id, signal);
        if ("json" in r) {
          const j = r.json;
          if ("offline" in j) {
            set({ mode: "offline" });
            return fallBack("");
          }
          if (j.error === "rate_limited") return fallBack(`Bindu needs a breather (${j.retryAfter}s). Answering from the offline field guide.`);
          if (j.error === "turn_limit") {
            history = snapshot;
            addPart(id, { kind: "note", tone: "info", text: "This field log is full. Start a new one to keep asking." });
            return;
          }
          return fallBack("The live guide couldn't read that. Answering from the offline field guide.");
        }
        if ("fail" in r) {
          if (r.fail === "refusal") {
            history = snapshot;
            appendText(id, "That's outside what I can help with here. Ask me about Lakshya's work, or email him directly.");
            return;
          }
          const why = r.fail === "timeout" ? "No fix — the live guide took too long." : r.fail === "busy" ? "The live guide is busy." : "The live guide didn't answer.";
          return fallBack(`${why} Here's the offline field guide's answer.`);
        }

        if (round === 0 && !r.said && r.calls.length === 0) {
          // an empty first answer (only a signature came back): the offline guide does better
          return fallBack("");
        }
        history.push({ role: "model", parts: r.parts });
        if (r.calls.length === 0) return;

        // at most four outcomes per turn (the route's limit); extra calls are dropped
        const results: FunctionResponsePart[] = [];
        for (const use of r.calls.slice(0, 4)) {
          const ref = { ...(use.id ? { id: use.id } : {}), name: use.name };
          const call = parseToolCall(use.name, use.args);
          if (!call) {
            results.push({ functionResponse: { ...ref, response: { error: `Invalid arguments: ${JSON.stringify(use.args).slice(0, 900)}` } } });
            continue;
          }
          const out = await runTool(call, ctx);
          if (out.part) addPart(id, out.part);
          results.push({ functionResponse: { ...ref, response: out.failed ? { error: out.result } : { output: out.result } } });
        }

        if (round + 1 >= LIMITS.toolRounds) {
          // Out of rounds: the actions ran, but this exchange can't be continued cleanly.
          history = snapshot;
          return;
        }
        history.push({ role: "user", parts: results });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        history = snapshot;
        return;
      }
      return fallBack("The live guide didn't answer. Here's the offline field guide's answer.");
    } finally {
      controller = null;
    }
  }

  return {
    msgs: [],
    mode: "unknown",
    busy: false,
    questions: 0,
    suggestions: STARTERS,

    probe: async () => {
      if (probed) return;
      probed = true;
      try {
        const res = await fetch("/api/agent", { cache: "no-store" });
        const j = (await res.json()) as { online?: boolean };
        set({ mode: j.online ? "online" : "offline" });
      } catch {
        set({ mode: "offline" });
      }
    },

    send: async (raw, ctx) => {
      const text = raw.trim().slice(0, LIMITS.userChars);
      if (!text || get().busy) return;
      const gen = generation;
      const now = Date.now();
      const visitor: Msg = { id: ++seq, role: "visitor", at: now, parts: [{ kind: "text", text }] };
      const bindu: Msg = { id: ++seq, role: "bindu", at: now, parts: [], pending: true };
      set((s) => ({ msgs: [...s.msgs, visitor, bindu], busy: true, suggestions: [] }));

      if (get().questions >= LIMITS.userTurns) {
        addPart(bindu.id, { kind: "note", tone: "info", text: "This field log is full. Start a new one to keep asking, or email Lakshya directly." });
        set((s) => ({ busy: false, msgs: s.msgs.map((m) => (m.id === bindu.id ? { ...m, pending: false } : m)) }));
        return;
      }

      emit("agent:thinking", { on: true });
      try {
        if (get().mode === "offline") await offline(bindu.id, text, ctx);
        else await online(bindu.id, text, ctx);
      } finally {
        emit("agent:thinking", { on: false });
        if (gen === generation)
          set((s) => ({
          busy: false,
          questions: s.questions + 1,
          msgs: s.msgs.map((m) => (m.id === bindu.id ? { ...m, pending: false } : m)),
          suggestions: s.suggestions.length ? s.suggestions : STARTERS.filter((x) => !s.msgs.some((m) => m.role === "visitor" && m.parts.some((p) => p.kind === "text" && p.text === x))).slice(0, 3),
        }));
      }
    },

    reset: () => {
      generation++;
      controller?.abort();
      history = [];
      set({ msgs: [], busy: false, questions: 0, suggestions: STARTERS });
    },
  };
});
