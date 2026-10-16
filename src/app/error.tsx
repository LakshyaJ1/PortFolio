"use client";

import { useEffect } from "react";
import { PROFILE } from "@/content/profile";
import styles from "./error.module.css";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[sheet] page error", error);
  }, [error]);

  return (
    <main className={styles.page}>
      <p className="label">Signal lost{error.digest ? ` · ${error.digest}` : ""}</p>
      <h1 className={styles.title}>
        Lost the <em>fix</em>.
      </h1>
      <p className={styles.body}>
        Something on this sheet failed to render. Try again. If it keeps happening, the short version is: Lakshya builds AI
        systems, and you can reach him at <a href={`mailto:${PROFILE.email}`}>{PROFILE.email}</a>.
      </p>
      <div className={styles.actions}>
        <button className={styles.primary} onClick={() => retry()}>
          Re-acquire
        </button>
        <a className={styles.secondary} href={PROFILE.calUrl} target="_blank" rel="noopener noreferrer">
          Book a call instead
        </a>
      </div>
    </main>
  );
}
