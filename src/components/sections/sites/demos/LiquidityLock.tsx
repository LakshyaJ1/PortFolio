"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Frame } from "@/components/sections/capabilities/instruments/Frame";
import { useStill } from "@/components/sections/capabilities/kit/loop";
import { CoinGlyph } from "../drawings/TokenPlan";
import { discover } from "@/lib/discover";
import { useApp } from "@/lib/store";
import s from "./demos.module.css";

// TokenForge in one gesture: the Move module is generated, Lakshyacoin lifts off
// the pad, and 90% of supply drains into liquidity pools under lock (profile.ts).
// The sequence is a simulation of the launch, not live chain data.

const BAR_X = 16;
const BAR_W = 488;
const LOCK_W = BAR_W * 0.9;

const STEPS = ["Move module generated", "Lakshyacoin minted", "90% of supply locked"] as const;

export function LiquidityLock() {
  const root = useRef<HTMLDivElement>(null);
  const still = useStill();
  const [step, setStep] = useState(3);
  const [runs, setRuns] = useState(0);
  const [busy, setBusy] = useState(false);

  // one gsap context scoped to this demo; the mint timeline is added to it and reverted on unmount
  const anim = useRef<gsap.Context | null>(null);
  useEffect(() => {
    const ctx = gsap.context(() => {}, root.current ?? undefined);
    anim.current = ctx;
    return () => ctx.revert();
  }, []);

  const mint = () => {
    if (busy) return;
    setRuns((r) => r + 1);
    if (still) {
      setStep(3);
      return;
    }
    setBusy(true);
    setStep(0);
    anim.current?.add(() => launch());
  };

  const launch = () => {
    const q = gsap.utils.selector(root.current);
    const tl = gsap.timeline({ defaults: { ease: "expo.out" }, onComplete: () => setBusy(false) });
    tl.set(q("[data-code]"), { scaleX: 0, transformOrigin: "0% 50%" })
      .set(q("[data-coin]"), { y: 46, opacity: 0 })
      .set(q("[data-fill]"), { scaleX: 0, transformOrigin: "0% 50%" })
      .set(q("[data-shackle]"), { y: -7 })
      .set(q("[data-flow]"), { opacity: 0, x: 0, y: 0 })
      .to(q("[data-code]"), { scaleX: 1, duration: 0.5, stagger: 0.06 })
      .add(() => setStep(1))
      .to(q("[data-exhaust]"), { opacity: 1, duration: 0.15, yoyo: true, repeat: 3 }, ">-0.1")
      .to(q("[data-coin]"), { y: 0, opacity: 1, duration: 0.9 }, "<")
      .add(() => setStep(2))
      .to(q("[data-flow]"), { opacity: 1, duration: 0.15, stagger: 0.12 }, ">-0.2")
      .to(q("[data-flow]"), { x: 160, y: -6, duration: 0.8, stagger: 0.12, ease: "power2.inOut" }, "<")
      .to(q("[data-flow]"), { opacity: 0, duration: 0.2, stagger: 0.12 }, "<0.6")
      .to(q("[data-fill]"), { scaleX: 1, duration: 1.1 }, "<-0.3")
      .to(q("[data-shackle]"), { y: 0, duration: 0.5 }, ">-0.4")
      .add(() => setStep(3));
  };

  const pickUp = () => {
    discover("lakshyacoin");
    useApp.getState().startGame("coin");
  };

  return (
    <div ref={root} className={s.lockRoot}>
      <Frame
        title="Launch · liquidity lock"
        simulated="Simulated launch"
        aspect="520 / 250"
        readouts={[
          { k: "Locked", v: "90% of supply" },
          { k: "Chain", v: "Aptos · Move" },
          { k: "Bought with", v: "Petra wallet" },
        ]}
        controls={
          <div className={s.controlRow}>
            <button type="button" className={s.mintBtn} onClick={mint} disabled={busy}>
              {runs ? "Mint again" : "Mint Lakshyacoin"}
            </button>
            <ol className={s.steps} aria-live="polite">
              {STEPS.map((label, i) => (
                <li key={label} data-done={step > i || undefined} data-now={step === i || undefined}>
                  <span className={s.stepNo}>{i + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          </div>
        }
      >
        <div className={s.fill}>
          <svg viewBox="0 0 520 250" className={s.svg} role="img" aria-label="Launch diagram: a generated Move module, Lakshyacoin on the launchpad, and a supply bar with 90% locked in liquidity pools.">
            {/* generated Move module */}
            <g className={s.dia}>
              <path d="M16 18 h70 l14 14 v96 h-84 z" />
              <path d="M86 18 v14 h14" />
            </g>
            <text x={24} y={44} className={s.tCaps}>
              MOVE
            </text>
            {[64, 46, 58, 34, 52, 40].map((w, i) => (
              <rect key={i} data-code="" x={i % 2 ? 32 : 24} y={56 + i * 11} width={w - (i % 2 ? 8 : 0)} height={4} className={s.codeBar} />
            ))}

            {/* launchpad */}
            <path d="M104 74 L136 80" className={s.link} />
            <path d="M120 152 h104 l-12 -12 h-80 z" className={s.pad} />
            <path d="M132 152 v12 M212 152 v12 M126 164 h92" className={s.thin} />
            <path data-exhaust="" d="M172 128 v8 M164 130 v6 M180 130 v6" className={s.exhaust} />
            <g data-coin="">
              <g transform="translate(172 96)">
                <CoinGlyph r={22} />
              </g>
            </g>
            <text x={172} y={62} textAnchor="middle" className={s.tLabel}>
              LAKSHYACOIN
            </text>

            {/* supply flowing into the pool */}
            {[0, 1, 2].map((i) => (
              <rect key={i} data-flow="" x={196 + i * 6} y={92 + i * 4} width={5} height={5} className={s.token} opacity={0} />
            ))}

            {/* liquidity pool under lock */}
            <path d="M290 62 L304 136 H436 L450 62" className={s.pool} />
            <path d="M298 90 H442 M301 106 H439 M303 122 H437" className={s.poolLevel} />
            <g transform="translate(370 44)" className={s.lock}>
              <rect x={-11} y={0} width={22} height={18} rx={2} />
              <path data-shackle="" d="M-6 0 v-6 a6 6 0 0 1 12 0 v6" />
              <circle cx={0} cy={8} r={1.8} />
            </g>
            <text x={370} y={156} textAnchor="middle" className={s.tLabel}>
              LIQUIDITY POOLS · LOCKED
            </text>

            {/* supply */}
            <rect x={BAR_X} y={170} width={BAR_W} height={22} className={s.barTrack} />
            <rect data-fill="" x={BAR_X} y={170} width={LOCK_W} height={22} className={s.barFill} />
            <text x={BAR_X + 8} y={185} className={s.tCapsInk}>
              SUPPLY
            </text>
            <line x1={BAR_X} y1={204} x2={BAR_X + LOCK_W} y2={204} className={s.dimLine} />
            <path d={`M${BAR_X - 4} 200 l8 8 M${BAR_X + LOCK_W - 4} 200 l8 8`} className={s.dimLine} />
            <text x={BAR_X + LOCK_W / 2} y={222} textAnchor="middle" className={s.tResult}>
              90%
            </text>
            <text x={BAR_X + LOCK_W / 2} y={236} textAnchor="middle" className={s.tSmall}>
              of supply locked in liquidity pools
            </text>
          </svg>
          {/* geocache: one coin rolled off the end of the bar */}
          <button type="button" className={s.stray} onClick={pickUp} aria-label="A stray Lakshyacoin. Pick it up" data-guide="projects-coin">
            <svg viewBox="-8 -8 16 16" width={14} height={14} aria-hidden="true">
              <circle r={6.5} />
              <circle r={4} />
              <circle r={1} className={s.strayCore} />
            </svg>
          </button>
        </div>
      </Frame>
      <p className={s.fact}>Lakshyacoin was launched for real: users bought it with the Petra wallet, with every coin detail on the platform.</p>
    </div>
  );
}
