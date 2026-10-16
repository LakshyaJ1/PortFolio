"use client";

import { useApp } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import styles from "./Toasts.module.css";

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast} data-tone={t.tone ?? "info"}>
          <span className={styles.mark} aria-hidden="true">
            <Icon name={t.tone === "cache" ? "flag" : "crosshair"} size={16} />
          </span>
          <span className={styles.text}>
            <strong>{t.title}</strong>
            {t.body ? <span>{t.body}</span> : null}
          </span>
          <button className={styles.close} onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
