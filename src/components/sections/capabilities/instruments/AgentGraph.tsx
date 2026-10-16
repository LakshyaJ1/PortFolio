"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Frame } from "./Frame";
import { Glyph } from "../glyphs";
import { useLoop, useStill } from "../kit/loop";
import { Sim } from "../kit/store";
import s from "./instruments.module.css";

// A human-in-the-loop agent run, as built at Hive Pro: requests are planned,
// routed to tools, checked by a policy guardrail and then wait for a person
// with the approver role before anything acts. Every action is audited.

type Tool = "HubSpot" | "Slack" | "Gmail";
type Action = { tool: Tool; verb: string; block?: string };
type NodeKey = "intake" | "plan" | Tool | "guard" | "approve" | "act" | "audit";
type Verdict = "APPROVED" | "BLOCKED" | "REJECTED";
type LogEntry = { id: number; time: string; verdict: Verdict; action: Action };

const ACTIONS: Action[] = [
  { tool: "Gmail", verb: "send follow-up" },
  { tool: "HubSpot", verb: "update deal stage" },
  { tool: "Slack", verb: "post call summary" },
  { tool: "Gmail", verb: "draft intro email", block: "PII in draft" },
  { tool: "HubSpot", verb: "create contact" },
  { tool: "Slack", verb: "notify account owner" },
  { tool: "HubSpot", verb: "read another tenant's deals", block: "cross-tenant read" },
];

const P: Record<NodeKey, readonly [number, number]> = {
  intake: [72, 92],
  plan: [196, 92],
  HubSpot: [340, 50],
  Slack: [340, 92],
  Gmail: [340, 134],
  guard: [484, 92],
  approve: [484, 236],
  act: [320, 236],
  audit: [250, 236],
};

const APPROVE = 4;
const GUARD = 3;
const DWELL = [0.25, 0.5, 0.45, 0.35, 0, 0.4, 0];
const SPEED = 190; // viewBox units per second
const SLOTS = 8;

type Packet = {
  id: number;
  slot: number;
  route: NodeKey[];
  leg: number;
  u: number;
  mode: "dwell" | "move" | "wait" | "fade";
  timer: number;
  action: Action;
  verdict?: Verdict;
};

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clock = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

type View = { queue: Action[]; log: LogEntry[]; count: Record<Verdict, number> };

class AgentRun extends Sim<View> {
  private packets: Packet[] = [];
  private seq = 0;
  private actionIdx = 0;
  private spawnIn = 0.4;
  private hot = new Set<NodeKey>();
  private logSeq = 0;

  constructor() {
    super({ queue: [], log: [], count: { APPROVED: 0, BLOCKED: 0, REJECTED: 0 } });
  }

  private nextAction() {
    const a = ACTIONS[this.actionIdx % ACTIONS.length];
    this.actionIdx++;
    return a;
  }

  private nextSafeAction() {
    let a = this.nextAction();
    while (a.block) a = this.nextAction();
    return a;
  }

  private record(verdict: Verdict, action: Action) {
    const id = ++this.logSeq;
    const { log, count } = this.view;
    this.publish({
      log: [{ id, time: clock(), verdict, action }, ...log].slice(0, 3),
      count: { ...count, [verdict]: count[verdict] + 1 },
    });
  }

  private syncQueue() {
    this.publish({ queue: this.packets.filter((p) => p.mode === "wait").map((p) => p.action) });
  }

  private spawn(action: Action, mode: Packet["mode"] = "dwell", leg = 0) {
    const taken = new Set(this.packets.map((p) => p.slot));
    let slot = 0;
    while (taken.has(slot) && slot < SLOTS) slot++;
    if (slot >= SLOTS) return;
    this.packets.push({
      id: ++this.seq,
      slot,
      route: ["intake", "plan", action.tool, "guard", "approve", "act", "audit"],
      leg,
      u: 0,
      mode,
      timer: DWELL[leg],
      action,
    });
  }

  step(dt: number) {
    let queueChanged = false;
    for (const p of this.packets) {
      if (p.mode === "dwell") {
        p.timer -= dt;
        if (p.timer > 0) continue;
        if (p.leg === GUARD && p.action.block) {
          p.mode = "fade";
          p.timer = 0.8;
          p.verdict = "BLOCKED";
        } else if (p.leg === APPROVE) {
          p.mode = "wait";
          queueChanged = true;
        } else if (p.leg === p.route.length - 1) {
          p.mode = "fade";
          p.timer = 0.35;
          p.verdict = p.verdict ?? "APPROVED";
        } else {
          p.mode = "move";
          p.u = 0;
        }
      } else if (p.mode === "move") {
        const a = P[p.route[p.leg]];
        const b = P[p.route[p.leg + 1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        p.u += (dt * SPEED) / len;
        if (p.u >= 1) {
          p.leg++;
          p.u = 0;
          p.mode = "dwell";
          p.timer = DWELL[p.leg];
        }
      } else if (p.mode === "fade") {
        p.timer -= dt;
      }
    }
    const done = this.packets.filter((p) => p.mode === "fade" && p.timer <= 0);
    if (done.length) {
      for (const p of done) this.record(p.verdict ?? "APPROVED", p.action);
      this.packets = this.packets.filter((p) => !done.includes(p));
    }
    this.spawnIn -= dt;
    const waiting = this.packets.filter((p) => p.mode === "wait").length;
    if (this.spawnIn <= 0 && this.packets.length < 5 && waiting < 3) {
      this.spawn(this.nextAction());
      this.spawnIn = 2.3;
    }
    if (queueChanged) this.syncQueue();
  }

  /** still frame: one action waiting for you at the approval gate */
  holdStill() {
    if (this.packets.some((p) => p.mode === "wait")) return;
    this.packets = [];
    this.spawn(this.nextSafeAction(), "wait", APPROVE);
    this.syncQueue();
  }

  decide(verdict: "APPROVED" | "REJECTED", still: boolean) {
    const head = this.packets.find((p) => p.mode === "wait");
    if (!head) return;
    if (still) {
      this.record(verdict, head.action);
      this.packets = this.packets.filter((p) => p !== head);
      this.spawn(this.nextSafeAction(), "wait", APPROVE);
    } else if (verdict === "APPROVED") {
      head.mode = "move";
      head.u = 0;
      head.verdict = "APPROVED";
    } else {
      head.mode = "fade";
      head.timer = 0.8;
      head.verdict = "REJECTED";
    }
    this.syncQueue();
  }

  /** write packet positions + hot nodes straight to the DOM */
  paint(slots: (SVGGElement | null)[], nodes: Partial<Record<NodeKey, SVGGElement | null>>) {
    const waiting = this.packets.filter((p) => p.mode === "wait");
    const used = new Set<number>();
    const hot = new Set<NodeKey>();
    for (const p of this.packets) {
      const el = slots[p.slot];
      used.add(p.slot);
      if (!el) continue;
      let x: number;
      let y: number;
      if (p.mode === "wait") {
        const qi = waiting.indexOf(p);
        const [ax, ay] = P.approve;
        x = ax;
        y = qi === 0 ? ay : ay - 30 - (qi - 1) * 12;
      } else if (p.mode === "move") {
        const a = P[p.route[p.leg]];
        const b = P[p.route[p.leg + 1]];
        const t = ease(p.u);
        x = a[0] + (b[0] - a[0]) * t;
        y = a[1] + (b[1] - a[1]) * t;
      } else {
        [x, y] = P[p.route[p.leg]];
        if (p.mode === "dwell") hot.add(p.route[p.leg]);
      }
      el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      el.setAttribute("visibility", "visible");
      el.dataset.mode = p.mode === "fade" ? "fade" : p.mode === "wait" ? "wait" : "run";
      el.style.opacity = p.mode === "fade" ? String(Math.max(0, p.timer / 0.8)) : "1";
    }
    slots.forEach((el, i) => {
      if (el && !used.has(i)) el.setAttribute("visibility", "hidden");
    });
    (Object.keys(nodes) as NodeKey[]).forEach((k) => {
      const el = nodes[k];
      if (!el) return;
      const on = hot.has(k);
      if (on !== this.hot.has(k)) el.toggleAttribute("data-hot", on);
    });
    this.hot = hot;
  }
}

export function AgentGraph({ active = true }: { active?: boolean }) {
  const scope = useRef<HTMLDivElement>(null);
  const slots = useRef<(SVGGElement | null)[]>([]);
  const nodes = useRef<Partial<Record<NodeKey, SVGGElement | null>>>({});
  const still = useStill();
  const [sim] = useState(() => new AgentRun());
  const { queue, log, count } = useSyncExternalStore(sim.subscribe, sim.getSnapshot, sim.getSnapshot);

  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(false), 700);
    return () => window.clearTimeout(t);
  }, [flash]);

  const { running } = useLoop(scope, active, (dt) => {
    sim.step(dt);
    sim.paint(slots.current, nodes.current);
  });

  useEffect(() => {
    if (!still) return;
    sim.holdStill();
    sim.paint(slots.current, nodes.current);
  }, [still, sim]);

  const decide = (verdict: "APPROVED" | "REJECTED") => {
    if (verdict === "APPROVED" && !still && queue.length) setFlash(true);
    sim.decide(verdict, still);
    sim.paint(slots.current, nodes.current);
  };

  const pending = queue[0];
  const waiting = queue.length > 0;

  const pill = (k: NodeKey, label: string, w: number, h: number, sub?: string) => {
    const [cx, cy] = P[k];
    return (
      <g
        key={k}
        className={s.node}
        ref={(el) => {
          nodes.current[k] = el;
        }}
      >
        <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={2} />
        <text x={cx} y={sub ? cy - 3 : cy + 3.5} textAnchor="middle" className={s.nodeLabel}>
          {label}
        </text>
        {sub ? (
          <text x={cx} y={cy + 10} textAnchor="middle" className={s.nodeSub}>
            {sub}
          </text>
        ) : null}
      </g>
    );
  };

  const edge = (a: readonly [number, number], b: readonly [number, number], key: string) => (
    <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={s.edge} markerEnd="url(#ag-arrow)" />
  );

  return (
    <Frame
      title="Human-in-the-loop agent run"
      station="Hive Pro · 2026"
      badge={{ label: "AI agents", glyph: <Glyph name="agents" /> }}
      figures={[
        { v: "Production", k: "agent platforms" },
        { v: "Human", k: "sign-off before it acts" },
        { v: "Claude", k: "LangGraph · RAG" },
      ]}
      readouts={[
        { k: "Waiting", v: queue.length },
        { k: "Approved", v: count.APPROVED },
        { k: "Blocked", v: count.BLOCKED + count.REJECTED },
        { k: "Guards", v: "RBAC · tenant isolation" },
      ]}
      caption="Nothing acts until it clears policy guardrails and a person with the approver role signs off. Wired into HubSpot, Slack and Gmail."
      controls={
        <div className={s.pendingRow} aria-live="polite">
          <span className={s.pendingText}>
            {pending ? (
              <>
                <span className={s.pendingKey}>Awaiting approval</span> {pending.tool} · {pending.verb}
              </>
            ) : (
              <span className={s.pendingKey}>{running || still ? "Agents running · nothing waiting" : "Paused off-screen"}</span>
            )}
          </span>
          <button type="button" className={s.quietBtn} onClick={() => decide("REJECTED")} disabled={!waiting}>
            Reject
          </button>
        </div>
      }
    >
      <div ref={scope} className={s.fill}>
        <svg viewBox="0 0 600 400" role="img" aria-label="Agent graph: intake, plan, tools (HubSpot, Slack, Gmail), policy guardrail, human approval, act, audit log, inside an isolated tenant boundary.">
          <defs>
            <marker id="ag-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1 7 4 1 7" className={s.arrowHead} />
            </marker>
          </defs>

          {/* tenant isolation boundary */}
          <rect x={12} y={18} width={576} height={364} className={s.boundary} />
          <text x={22} y={36} className={s.boundaryLabel}>
            TENANT A · ISOLATED
          </text>
          <text x={296} y={22} className={s.groupLabel}>
            TOOLS
          </text>

          {/* RBAC boundary around the human gate */}
          <rect x={414} y={192} width={140} height={162} className={s.rbac} />
          <text x={422} y={346} className={s.boundaryLabel}>
            RBAC · APPROVER
          </text>

          {edge([120, 92], [146, 92], "e1")}
          {edge([244, 92], [294, 50], "e2")}
          {edge([244, 92], [294, 92], "e3")}
          {edge([244, 92], [294, 134], "e4")}
          {edge([386, 50], [434, 90], "e5")}
          {edge([386, 92], [434, 92], "e6")}
          {edge([386, 134], [434, 94], "e7")}
          {edge([484, 110], [484, 210], "e8")}
          {edge([460, 236], [366, 236], "e9")}
          {edge([274, 236], [252, 236], "e10")}

          {pill("intake", "INTAKE", 96, 38, "request")}
          {pill("plan", "PLAN", 96, 38, "LangGraph · Claude")}
          {pill("HubSpot", "HUBSPOT", 92, 26)}
          {pill("Slack", "SLACK", 92, 26)}
          {pill("Gmail", "GMAIL", 92, 26)}
          {pill("guard", "POLICY GUARDRAIL", 100, 34)}
          {pill("act", "ACT", 88, 34, "tool call")}

          {/* the human gate */}
          <g className={s.gate} data-waiting={waiting || undefined} data-flash={flash || undefined}>
            <circle cx={P.approve[0]} cy={P.approve[1]} r={22} className={s.gatePulse} />
            <circle cx={P.approve[0]} cy={P.approve[1]} r={22} className={s.gateRing} />
            <text x={P.approve[0]} y={P.approve[1] + 38} textAnchor="middle" className={s.nodeLabel}>
              HUMAN APPROVAL
            </text>
          </g>

          {/* audit log */}
          <g className={s.audit}>
            <rect x={24} y={192} width={226} height={176} />
            <text x={34} y={210} className={s.boundaryLabel}>
              AUDIT LOG
            </text>
            {log.length === 0 ? (
              <text x={34} y={236} className={s.logDetail}>
                Empty. The first action is on its way.
              </text>
            ) : (
              log.map((e, i) => (
                <g key={e.id} transform={`translate(34 ${236 + i * 42})`} className={s.logRow} data-verdict={e.verdict}>
                  <text className={s.logTime}>
                    {e.time}
                    <tspan dx={8} className={s.logVerdict}>
                      {e.verdict}
                    </tspan>
                  </text>
                  <text y={15} className={s.logDetail}>
                    {e.action.tool} · {e.verdict === "BLOCKED" ? e.action.block : e.action.verb}
                    {e.verdict !== "BLOCKED" ? " · by you" : ""}
                  </text>
                </g>
              ))
            )}
          </g>

          {/* packets */}
          {Array.from({ length: SLOTS }, (_, i) => (
            <g
              key={i}
              className={s.packet}
              visibility="hidden"
              ref={(el) => {
                slots.current[i] = el;
              }}
            >
              <rect x={-4.5} y={-4.5} width={9} height={9} />
            </g>
          ))}
        </svg>
        <button
          type="button"
          className={s.approve}
          style={{ left: `${(P.approve[0] / 600) * 100}%`, top: `${(306 / 400) * 100}%` }}
          onClick={() => decide("APPROVED")}
          disabled={!waiting}
          aria-label={pending ? `Approve: ${pending.tool}, ${pending.verb}` : "Approve (nothing waiting)"}
        >
          Approve
        </button>
      </div>
    </Frame>
  );
}
