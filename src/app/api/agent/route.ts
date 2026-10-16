// Bindu's brain (Google Gemini). POST streams one model turn back as NDJSON; the drawer runs
// any function calls in the browser and posts the functionResponse as the next turn (the
// client owns the loop). With no GEMINI_API_KEY the route answers { offline: true } and the
// drawer switches to its offline field guide.

import { ApiError, FinishReason, FunctionCallingConfigMode, GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { connection } from "next/server";
import { LIMITS, type AgentJsonReply, type AgentStreamEvent, type FunctionCallOut, type ModelPart } from "@/components/mascot/agent/spec";
import { clientIp, parseConversation, rateLimit } from "@/server/agent/guard";
import { getSystemPrompt } from "@/server/agent/prompt";
import { AGENT_TOOLS } from "@/server/agent/tools";

// Fast, inexpensive, stable: a site chat needs short answers and quick function calls.
// Its default thinking level is "minimal", so first tokens come quickly.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

function config() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  // BINDU_MODEL is the older name; a leftover Claude id from the previous brain is ignored.
  const alias = process.env.BINDU_MODEL?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || (alias && !alias.startsWith("claude") ? alias : "") || DEFAULT_MODEL;
  return { apiKey: apiKey || null, model };
}

let client: { key: string; ai: GoogleGenAI } | null = null;
function getClient(apiKey: string) {
  if (client?.key !== apiKey) {
    // One retry at most: the whole request has a 30 s deadline.
    client = { key: apiKey, ai: new GoogleGenAI({ apiKey, httpOptions: { timeout: LIMITS.timeoutMs, retryOptions: { attempts: 2 } } }) };
  }
  return client.ai;
}

/** Finish reasons that mean "the model won't answer this", shown as a polite decline. */
const DECLINED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

const json = (body: AgentJsonReply | { online: boolean; model: string | null }, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

/** Lets the drawer show online/offline state before the first question. */
export async function GET() {
  await connection();
  const { apiKey, model } = config();
  return json({ online: Boolean(apiKey), model: apiKey ? model : null });
}

/**
 * Collects a streamed model turn into the parts the client must echo back. Adjacent plain
 * text merges into one part; a part carrying a thought signature is never merged, so each
 * signature stays where the model put it.
 */
function collector() {
  const parts: ModelPart[] = [];
  const calls: FunctionCallOut[] = [];
  return {
    parts,
    calls,
    add(raw: GenerateContentResponse) {
      const out: string[] = [];
      for (const p of raw.candidates?.[0]?.content?.parts ?? []) {
        const sig = p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {};
        if (p.functionCall?.name) {
          const call = { ...(p.functionCall.id ? { id: p.functionCall.id } : {}), name: p.functionCall.name, args: p.functionCall.args ?? {} };
          parts.push({ ...sig, functionCall: call });
          calls.push(call);
        } else if (typeof p.text === "string") {
          if (p.thought) {
            // thought summaries aren't requested; if one arrives, keep its signature only
            if (p.thoughtSignature) parts.push({ ...sig, text: "" });
            continue;
          }
          if (p.text) out.push(p.text);
          const last = parts[parts.length - 1];
          if (!p.thoughtSignature && last && typeof last.text === "string" && !last.thought && !last.thoughtSignature) last.text += p.text;
          else if (p.text || p.thoughtSignature) parts.push({ ...sig, text: p.text });
        } else if (p.thoughtSignature) {
          // a part needs a data field; an empty text carries the bare signature
          parts.push({ ...sig, text: "" });
        }
      }
      return out.join("");
    },
  };
}

export async function POST(req: Request) {
  const { apiKey, model } = config();
  if (!apiKey) return json({ offline: true });

  const wait = rateLimit(clientIp(req));
  if (wait) return json({ error: "rate_limited", retryAfter: wait }, 429, { "retry-after": String(wait) });

  const raw = await req.text();
  if (raw.length > LIMITS.bodyBytes) return json({ error: "too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const parsed = parseConversation(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const ai = getClient(apiKey);
  const deadline = AbortSignal.timeout(LIMITS.timeoutMs);
  const signal = AbortSignal.any([req.signal, deadline]);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          /* the visitor went away */
        }
      };

      try {
        const turn = await ai.models.generateContentStream({
          model,
          contents: parsed.contents,
          config: {
            // Byte-identical on every request, so Gemini's implicit prefix caching applies.
            systemInstruction: getSystemPrompt(),
            tools: [{ functionDeclarations: AGENT_TOOLS }],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            maxOutputTokens: 2048,
            abortSignal: signal,
          },
        });

        const got = collector();
        let finish: string | undefined;
        let blocked = false;
        for await (const chunk of turn) {
          if (chunk.promptFeedback?.blockReason) blocked = true;
          const d = got.add(chunk);
          if (d) send({ t: "text", d });
          finish = chunk.candidates?.[0]?.finishReason ?? finish;
        }

        if (blocked || (finish && DECLINED.has(finish) && got.calls.length === 0)) {
          send({ t: "error", code: "refusal" });
        } else if (finish === FinishReason.MAX_TOKENS && got.calls.length > 0) {
          // A call cut off mid-way can still parse; never hand it to the client.
          send({ t: "error", code: "truncated" });
        } else if (got.parts.length === 0) {
          // nothing usable (a malformed call, an empty candidate): let the offline guide answer
          send({ t: "error", code: "upstream" });
        } else {
          send({ t: "done", parts: got.parts, calls: got.calls });
        }
      } catch (err) {
        if (req.signal.aborted) {
          /* client closed the drawer or navigated away */
        } else if (deadline.aborted) {
          send({ t: "error", code: "timeout" });
        } else if (err instanceof ApiError && (err.status === 429 || err.status === 503)) {
          send({ t: "error", code: "busy" });
        } else {
          if (err instanceof ApiError) console.error(`[agent] upstream ${err.status}: ${err.message}`);
          else console.error("[agent] stream failed", err);
          send({ t: "error", code: "upstream" });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
