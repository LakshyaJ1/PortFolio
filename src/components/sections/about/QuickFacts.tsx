"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { EDUCATION, EXPERIENCE, PROFILE } from "@/content/profile";
import { emit } from "@/lib/events";
import { formatDMS } from "@/lib/geo";
import styles from "./About.module.css";

const mait = EDUCATION.find((e) => e.id === "mait") ?? EDUCATION[0];
const hive = EXPERIENCE.find((e) => e.id === "hivepro") ?? EXPERIENCE[0];
const hiveOrg = hive.org.replace(/,?\s*Inc\.?$/, "");
const hiveCity = hive.place.split(",")[0];
// "CGPA 9.0+" → a label and a figure, so the figure can be set large
const score = /^(.*?)\s*([\d.]+\+?)$/.exec(mait.score);

async function copyText(text: string) {
  try {
    // a pending permission prompt must not leave the chip hanging
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("clipboard timeout")), 1500)),
    ]);
    return true;
  } catch {
    // older browsers / insecure contexts
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** The facts a visitor needs at a glance, each row reading like a sentence, then the two ways to reach him. */
export function QuickFacts() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await copyText(PROFILE.email);
    setState(ok ? "copied" : "failed");
    if (ok) emit("copy:email", {});
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2200);
  };

  return (
    <div className={styles.factsBlock} data-guide="about-facts">
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Based in</dt>
          <dd>
            <span className={styles.value}>{PROFILE.location}</span>
            <span className={styles.coord}>{formatDMS(PROFILE.home)}</span>
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Studying</dt>
          <dd>
            <span className={styles.value}>
              B.Tech CSE (AI/ML) at <abbr title={mait.school}>MAIT</abbr> ’{mait.end.slice(2)}
            </span>
            {score ? (
              <span className={styles.score}>
                <span className={styles.scoreLabel}>{score[1]}</span>
                <span className={styles.scoreFigure}>{score[2]}</span>
              </span>
            ) : (
              <span className={styles.aside}>{mait.score}</span>
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Currently</dt>
          <dd>
            <span className={styles.value}>
              {hive.role} at {hiveOrg}
            </span>
            <span className={styles.aside}>
              {hive.mode} · {hiveCity}
            </span>
          </dd>
        </div>
      </dl>

      <div className={styles.reach}>
        <span className={styles.mailGroup}>
          <a className={styles.action} href={`mailto:${PROFILE.email}`}>
            <Icon name="mail" size={18} />
            <span className={styles.address}>{PROFILE.email}</span>
          </a>
          <button type="button" className={styles.chip} data-state={state} onClick={copy} aria-label="Copy email address">
            <Icon name={state === "copied" ? "check" : "copy"} size={16} />
            <span aria-hidden="true">{state === "copied" ? "Copied" : state === "failed" ? "Select it" : "Copy"}</span>
          </button>
          <span className="visually-hidden" aria-live="polite">
            {state === "copied" ? "Email address copied" : state === "failed" ? "Couldn't copy. Select the address instead." : ""}
          </span>
        </span>
        <a className={styles.action} href={PROFILE.resumePath} download="Lakshya-Jain-Resume.pdf">
          <Icon name="download" size={18} />
          <span>Résumé</span>
          <span className={styles.fileTag}>PDF</span>
        </a>
      </div>
    </div>
  );
}
