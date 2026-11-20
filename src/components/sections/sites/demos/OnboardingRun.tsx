"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Frame } from "@/components/sections/capabilities/instruments/Frame";
import { useStill } from "@/components/sections/capabilities/kit/loop";
import s from "./demos.module.css";

// The CS Onboarding Agent in one gesture: a Closed-Won deal lands on the NATS bus, the
// agent drafts the e-mail and kickoff proposal, the SOW and deck are assembled, and all
// four wait for a person. "Replay the event" sends the same event ID again: ingest is
// idempotent, so it is dropped and nothing is drafted twice (profile.ts). A simulation of
// the flow, not the production system.

const STEPS = ["Closed-Won deal received", "Agent drafts the paperwork", "Queued for human approval"] as const;
const ROWS = ["E-mail draft", "Kickoff proposal", "SOW", "Kickoff deck"] as const;

const BUS_Y = 100;
/** where the event-ID check sits on the bus */
const GATE_X = 120;
/** spend bars: full width is the cap */
const BAR_W = 200;
/** share of the per-run cap one run uses (simulated) */
const RUN_USE = 0.34;
/** share of the per-day cap one run uses (simulated) */
const DAY_STEP = 0.14;

export function OnboardingRun() {
  const root = useRef<HTMLDivElement>(null);
  const still = useStill();
  const [step, setStep] = useState(3);
  const [runs, setRuns] = useState(0);
  const [dupes, setDupes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const day = useRef(DAY_STEP);

  // one gsap context scoped to this demo; timelines are added to it and reverted on unmount
  const anim = useRef<gsap.Context | null>(null);
  useEffect(() => {
    const ctx = gsap.context(() => {}, root.current ?? undefined);
    anim.current = ctx;
    return () => ctx.revert();
  }, []);

  const closeDeal = () => {
    if (busy) return;
    setRuns((r) => r + 1);
    setNote("");
    day.current = Math.min(1, day.current + DAY_STEP);
    if (still) {
      setStep(3);
      gsap.set(root.current?.querySelector("[data-day]") ?? [], { attr: { width: BAR_W * day.current } });
      return;
    }
    setBusy(true);
    setStep(0);
    anim.current?.add(() => run());
  };

  const run = () => {
    const q = gsap.utils.selector(root.current);
    const tl = gsap.timeline({ defaults: { ease: "expo.out" }, onComplete: () => setBusy(false) });
    tl.set(q("[data-row]"), { opacity: 0, x: -8 })
      .set(q("[data-run]"), { attr: { width: 0 } })
      .set(q("[data-evt]"), { opacity: 0, x: 0, y: 0 })
      .set(q("[data-out]"), { opacity: 0, x: 0, y: 0 })
      // the deal's event rides the bus to the agent
      .to(q("[data-evt]"), { opacity: 1, duration: 0.15 })
      .to(q("[data-evt]"), { x: 160, duration: 0.7, ease: "power2.inOut" })
      .to(q("[data-evt]"), { y: -22, duration: 0.3, ease: "power2.in" })
      .to(q("[data-evt]"), { opacity: 0, duration: 0.12 })
      .add(() => setStep(1))
      // the agent drafts, under its per-run cap
      .to(q("[data-run]"), { attr: { width: BAR_W * RUN_USE }, duration: 1.2, ease: "power1.out" }, "<")
      .to(q("[data-day]"), { attr: { width: BAR_W * day.current }, duration: 1.2, ease: "power1.out" }, "<")
      // drafts go back over the bus to the product plane's queue
      .to(q("[data-out]"), { opacity: 1, duration: 0.15 }, ">-0.2")
      .to(q("[data-out]"), { y: 22, duration: 0.3, ease: "power2.in" })
      .to(q("[data-out]"), { x: 74, duration: 0.5, ease: "power2.inOut" })
      .to(q("[data-out]"), { x: 86, opacity: 0, duration: 0.2 })
      .add(() => setStep(2))
      .to(q("[data-row]"), { opacity: 1, x: 0, duration: 0.5, stagger: 0.16 })
      .add(() => setStep(3));
  };

  const replay = () => {
    if (busy || !runs) return;
    setDupes((n) => n + 1);
    setNote("Same event ID again: dropped at ingest. No new drafts.");
    if (still) return;
    setBusy(true);
    anim.current?.add(() => {
      const q = gsap.utils.selector(root.current);
      gsap
        .timeline({ onComplete: () => setBusy(false) })
        .set(q("[data-dup]"), { opacity: 0, x: 0 })
        .set(q("[data-dupnote]"), { opacity: 0 })
        .to(q("[data-dup]"), { opacity: 1, duration: 0.15 })
        .to(q("[data-dup]"), { x: GATE_X - 72, duration: 0.5, ease: "power2.inOut" })
        .to(q("[data-dup]"), { x: GATE_X - 76, duration: 0.06, yoyo: true, repeat: 3 })
        .to(q("[data-dupnote]"), { opacity: 1, duration: 0.2 }, "<")
        .to(q("[data-dup]"), { opacity: 0, scale: 0.4, duration: 0.3, transformOrigin: "50% 50%" })
        .to(q("[data-dupnote]"), { opacity: 0, duration: 0.4 }, "+=1.2")
        .set(q("[data-dup]"), { scale: 1 });
    });
  };

  const agentStatus = step === 0 ? "event received" : step === 1 ? "drafting…" : "drafts ready";
  const queued = step >= 3 ? ROWS.length : 0;

  return (
    <div ref={root} className={s.lockRoot}>
      <Frame
        title="Deal to onboarding · approval queue"
        simulated="Simulated run"
        aspect="520 / 250"
        readouts={[
          { k: "Waiting for a person", v: `${queued} of ${ROWS.length}`, live: true },
          { k: "Duplicate drafts", v: dupes ? `0 · ${dupes} replay${dupes > 1 ? "s" : ""} dropped` : "0", live: true },
          { k: "Customer e-mail sent", v: "Never by the agent" },
        ]}
        controls={
          <div className={s.controlRow}>
            <button type="button" className={s.mintBtn} onClick={closeDeal} disabled={busy}>
              {runs ? "Close another deal" : "Close a deal"}
            </button>
            <button type="button" className={s.ghostBtn} onClick={replay} disabled={busy || !runs}>
              Replay the same event
            </button>
            <ol className={s.steps} aria-live="polite">
              {STEPS.map((label, i) => (
                <li key={label} data-done={step > i || undefined} data-now={step === i || undefined}>
                  <span className={s.stepNo}>{i + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
            <p className={s.note} data-on={note ? "" : undefined} aria-live="polite">
              {note || "Close a deal, then send the same event again to see idempotent ingest."}
            </p>
          </div>
        }
      >
        <div className={s.fill}>
          <svg
            viewBox="0 0 520 250"
            className={s.svg}
            role="img"
            aria-label="Flow diagram: a HubSpot deal sends an event over the NATS bus to a LangGraph agent, whose drafts travel on along the bus to an approval queue of four items. An event-ID check on the bus drops repeated events, spend bars show the per-run and per-day caps, and the path to send customer e-mail is blocked."
          >
            {/* the deal */}
            <g className={s.dia}>
              <rect x={16} y={20} width={112} height={58} className={s.diaBlock} />
            </g>
            <text x={26} y={40} className={s.tCaps}>
              HUBSPOT DEAL
            </text>
            <text x={26} y={62} className={s.tMonoInk}>
              Closed-Won
            </text>
            <line x1={68} y1={78} x2={68} y2={BUS_Y} className={s.link} />

            {/* the agent plane */}
            <g className={s.dia}>
              <rect x={160} y={20} width={124} height={58} className={s.diaBlock} />
            </g>
            <text x={170} y={40} className={s.tCaps}>
              LANGGRAPH AGENT
            </text>
            <text x={170} y={62} className={s.tMonoInk}>
              {agentStatus}
            </text>
            <line x1={228} y1={78} x2={228} y2={BUS_Y} className={s.link} />

            {/* the bus, with its event-ID check; it ends at the product plane's queue */}
            <line x1={16} y1={BUS_Y} x2={300} y2={BUS_Y} className={s.bus} />
            <path d={`M${GATE_X} ${BUS_Y - 7} l5 7 l-5 7 l-5 -7 z`} className={s.gateMark} />
            <text x={16} y={BUS_Y + 18} className={s.tSmall}>
              NATS · event bus
            </text>
            <text x={GATE_X + 10} y={BUS_Y + 18} className={s.tSmall}>
              event-ID check
            </text>
            <text data-dupnote="" x={GATE_X - 4} y={BUS_Y - 9} className={s.dupNote} opacity={0}>
              duplicate · dropped
            </text>

            {/* moving parts */}
            <rect data-evt="" x={64} y={BUS_Y - 4} width={8} height={8} className={s.token} opacity={0} />
            <rect data-out="" x={224} y={74} width={8} height={8} className={s.token} opacity={0} />
            <rect data-dup="" x={64} y={BUS_Y - 4} width={8} height={8} className={s.dupToken} opacity={0} />

            {/* the product plane's approval queue (kept below the corner the "Simulated" tag sits in) */}
            <g className={s.dia}>
              <rect x={300} y={60} width={208} height={96} />
            </g>
            <text x={310} y={76} className={s.tCaps}>
              APPROVAL QUEUE
            </text>
            {ROWS.map((name, i) => (
              <g key={name} data-row="">
                <rect x={308} y={84 + i * 17} width={192} height={14} className={s.queueRow} />
                <text x={314} y={94.5 + i * 17} className={s.tMonoInk}>
                  {name}
                </text>
                <text x={494} y={94.5 + i * 17} textAnchor="end" className={s.queueState}>
                  to approve
                </text>
              </g>
            ))}

            {/* no path out to the customer */}
            <line x1={470} y1={156} x2={470} y2={190} className={s.barTrack} />
            <path d="M464 167 l12 12 M476 167 l-12 12" className={s.blockX} />
            <rect x={300} y={190} width={208} height={44} className={s.barTrack} />
            <text x={310} y={208} className={s.tCaps}>
              SEND TO CUSTOMER
            </text>
            <text x={310} y={225} className={s.tSmall}>
              no path exists: a person sends it
            </text>

            {/* spend caps */}
            <text x={16} y={150} className={s.tCaps}>
              AI SPEND CAPS
            </text>
            <text x={16} y={170} className={s.tSmall}>
              per run
            </text>
            <rect x={62} y={162} width={BAR_W} height={10} className={s.barTrack} />
            <rect data-run="" x={62} y={162} width={BAR_W * RUN_USE} height={10} className={s.barFill} />
            <line x1={262} y1={158} x2={262} y2={176} className={s.capTick} />
            <text x={16} y={196} className={s.tSmall}>
              per day
            </text>
            <rect x={62} y={188} width={BAR_W} height={10} className={s.barTrack} />
            <rect data-day="" x={62} y={188} width={BAR_W * DAY_STEP} height={10} className={s.barFill} />
            <line x1={262} y1={184} x2={262} y2={202} className={s.capTick} />
            <text x={16} y={222} className={s.tSmall}>
              money figures redacted before the model sees them
            </text>
          </svg>
        </div>
      </Frame>
      <p className={s.fact}>
        Piloted end to end with zero 5xx errors and US$2.45 of AI spend, behind 4,800+ automated tests.
      </p>
    </div>
  );
}
