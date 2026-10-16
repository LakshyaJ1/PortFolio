"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { PROFILE } from "@/content/profile";
import { emit } from "@/lib/events";
import styles from "./Rendezvous.module.css";

function legacyCopy(text: string) {
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

export function Contact() {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(PROFILE.email);
      ok = true;
    } catch {
      ok = legacyCopy(PROFILE.email);
    }
    window.clearTimeout(timer.current);
    if (ok) {
      setCopied(true);
      setMessage(`Copied ${PROFILE.email} to the clipboard.`);
      emit("copy:email", {});
      timer.current = window.setTimeout(() => {
        setCopied(false);
        setMessage("");
      }, 2400);
    } else {
      setCopied(false);
      setMessage("Couldn’t reach the clipboard. Select the address to copy it.");
    }
  };

  return (
    <div className={styles.contact}>
      <p className={styles.contactLead}>Prefer to write?</p>

      <div className={styles.email}>
        <a className={styles.emailLink} href={`mailto:${PROFILE.email}`}>
          {PROFILE.email}
        </a>
        <button
          type="button"
          className={styles.chip}
          onClick={copy}
          data-copied={copied || undefined}
          aria-label={copied ? "Email address copied" : "Copy email address"}
        >
          <Icon name={copied ? "check" : "copy"} size={14} />
          {copied ? "Copied" : "Copy"}
        </button>
        <span className="visually-hidden" aria-live="polite">
          {message}
        </span>
      </div>
      {message && !copied ? <p className={styles.copyError}>{message}</p> : null}

      <ul className={styles.links}>
        <li>
          <a className={styles.linkBtn} href={PROFILE.github} target="_blank" rel="noopener noreferrer">
            <Icon name="github" size={18} />
            GitHub
            <Icon name="arrow-ne" size={14} className={styles.linkArrow} />
          </a>
        </li>
        <li>
          <a className={styles.linkBtn} href={PROFILE.linkedin} target="_blank" rel="noopener noreferrer">
            <Icon name="linkedin" size={18} />
            LinkedIn
            <Icon name="arrow-ne" size={14} className={styles.linkArrow} />
          </a>
        </li>
        <li>
          <a className={styles.linkBtn} href={PROFILE.resumePath} download>
            <Icon name="download" size={18} />
            Résumé
            <span className={styles.linkMeta}>PDF</span>
          </a>
        </li>
        {PROFILE.phone ? (
          <li>
            <a className={styles.linkBtn} href={`tel:${PROFILE.phone.replace(/\s+/g, "")}`}>
              <Icon name="send" size={18} />
              {PROFILE.phone}
            </a>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
