"use client";

// Auto-enter. Once he has said both lines (or the muted sequence has simply run out), "Enter the
// site" fills over COUNTDOWN seconds and then presses itself. The clock holds while the visitor is
// busy (hovering or keyboard-focusing an option, the transcript or an overlay open, the tab hidden)
// and carries on a beat after the last reason clears. Any explicit choice switches it off for good.
// It reports to Bindu's tour on the `intro:stage` bus:
//   countdown {left}  when it starts, every whole second, and when it resumes
//   paused {left}     when it is held
//   paused (no left)  when a choice switched it off while it was running or held

import { emit } from "@/lib/events";

export const COUNTDOWN = 6;
/** a held countdown resumes this long after the last reason clears (hopping between options) */
const RESUME_DELAY = 300;

export type CountdownState = "idle" | "running" | "held" | "off";
export type CountdownView = { state: CountdownState; left: number };
export type HoldReason = "hover" | "focus" | "hidden" | "overlay" | "transcript";

export type AutoEnterHandlers = {
  /** the state or the whole seconds changed */
  view: (v: CountdownView) => void;
  /** time's up: enter the site */
  fire: () => void;
};

export class AutoEnter {
  state: CountdownState = "idle";
  left = COUNTDOWN;
  private elapsed = 0;
  private holds = new Set<HoldReason>();
  private resumeTimer = 0;
  private on: AutoEnterHandlers = { view: () => {}, fire: () => {} };

  /** (Re)attach the stage's handlers; they may change between renders. */
  connect(on: AutoEnterHandlers) {
    this.on = on;
  }

  /** 0 → 1 over the countdown */
  get progress() {
    return Math.min(1, this.elapsed / COUNTDOWN);
  }

  private set(state: CountdownState) {
    this.state = state;
    this.on.view({ state, left: this.left });
  }

  /** Both lines are said: start counting (unless a choice already switched it off). */
  arm() {
    if (this.state !== "idle") return;
    this.elapsed = 0;
    this.left = COUNTDOWN;
    if (this.holds.size) {
      this.set("held");
      emit("intro:stage", { phase: "paused", left: this.left });
    } else {
      this.set("running");
      emit("intro:stage", { phase: "countdown", left: this.left });
    }
  }

  /** His lines start again (voice turned on): wait for him to finish before counting again. */
  rewind() {
    if (this.state !== "running" && this.state !== "held") return;
    window.clearTimeout(this.resumeTimer);
    this.elapsed = 0;
    this.left = COUNTDOWN;
    this.set("idle");
  }

  /** An explicit choice: off for good. `quiet` when the stage is closing anyway. */
  cancel(quiet = false) {
    if (this.state === "off") return;
    const was = this.state;
    window.clearTimeout(this.resumeTimer);
    this.set("off");
    if (!quiet && (was === "running" || was === "held")) emit("intro:stage", { phase: "paused" });
  }

  hold(reason: HoldReason, on: boolean) {
    if (on) {
      this.holds.add(reason);
      window.clearTimeout(this.resumeTimer);
      if (this.state === "running") {
        this.set("held");
        emit("intro:stage", { phase: "paused", left: this.left });
      }
      return;
    }
    if (!this.holds.delete(reason) || this.holds.size || this.state !== "held") return;
    window.clearTimeout(this.resumeTimer);
    this.resumeTimer = window.setTimeout(() => {
      if (this.state !== "held" || this.holds.size) return;
      this.set("running");
      emit("intro:stage", { phase: "countdown", left: this.left });
    }, RESUME_DELAY);
  }

  /** Advance by dt seconds (call every frame). */
  tick(dt: number) {
    if (this.state !== "running") return;
    this.elapsed += dt;
    const left = Math.max(0, Math.ceil(COUNTDOWN - this.elapsed - 1e-6));
    if (this.elapsed >= COUNTDOWN) {
      this.left = 0;
      this.set("off");
      this.on.fire();
      return;
    }
    if (left !== this.left) {
      this.left = left;
      this.on.view({ state: this.state, left });
      emit("intro:stage", { phase: "countdown", left });
    }
  }

  dispose() {
    window.clearTimeout(this.resumeTimer);
  }
}
