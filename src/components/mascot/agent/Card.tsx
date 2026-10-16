"use client";

import { Icon } from "@/components/ui/Icon";
import { sectionById } from "@/lib/sections";
import { cardData } from "./cards";
import type { CardRef } from "./spec";
import styles from "./Card.module.css";

/** A mini survey sheet in the chat thread: one résumé entry, framed like an inset map. */
export function Card({ card, onGo }: { card: CardRef; onGo: (section: string) => void }) {
  const data = cardData(card);
  if (!data) return null;
  const section = sectionById(data.section)!;
  const titleId = `card-${card.kind}-${card.id}`;
  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.edge} aria-hidden="true">
        <span>
          {section.plain}
        </span>
        <span className={styles.ticks} />
      </div>

      <header className={styles.head}>
        <h3 id={titleId} className={styles.title}>
          {data.title}
        </h3>
        {data.sub ? <p className={styles.sub}>{data.sub}</p> : null}
        {data.tag ? <p className={styles.tag}>{data.tag}</p> : null}
        {data.meta ? <p className={styles.meta}>{data.meta}</p> : null}
        {data.restricted ? <span className={styles.restricted}>Restricted · NDA</span> : null}
      </header>

      {data.points.length ? (
        <ul className={styles.points}>
          {data.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      {data.figures.length ? (
        <dl className={styles.figures}>
          {data.figures.map((f) => (
            <div key={f.value + f.label} className={styles.fig}>
              <dt className={styles.figLabel}>{f.label}</dt>
              <dd className={styles.figValue}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.go} onClick={() => onGo(data.section)}>
          <span>Go to {section.plain}</span>
          <Icon name="arrow-right" size={15} />
        </button>
        {data.link ? (
          <a className={styles.ext} href={data.link.href} target="_blank" rel="noopener noreferrer">
            <span>{data.link.label}</span>
            <Icon name="arrow-ne" size={14} />
          </a>
        ) : null}
      </div>
    </article>
  );
}
