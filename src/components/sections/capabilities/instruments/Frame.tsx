import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import s from "./Frame.module.css";

export type Readout = { k: string; v: ReactNode; live?: boolean };

/** a bold key figure printed above the scope: the value, then what it counts */
export type FrameFigure = { v: string; k: string };

/**
 * The bench every instrument sits on: a ruled scope (graticule), a "Simulated"
 * tag when the data is authored, a readout strip and a résumé caption.
 * Optional: a domain badge (glyph + plain label) and a row of bold key figures.
 */
export function Frame({
  title,
  station,
  badge,
  figures,
  simulated = "Simulated",
  aspect = "3 / 2",
  axis,
  children,
  controls,
  readouts,
  caption,
  link,
  compact = false,
}: {
  title: string;
  station?: string;
  /** the domain in plain words, with its glyph (e.g. Robotics) */
  badge?: { label: string; glyph?: ReactNode };
  /** two or three résumé figures, set large */
  figures?: FrameFigure[];
  simulated?: string | false;
  aspect?: string;
  /** small note ruled into the scope's corner (what the axes are) */
  axis?: string;
  children: ReactNode;
  controls?: ReactNode;
  readouts: Readout[];
  caption?: ReactNode;
  link?: { label: string; href: string };
  compact?: boolean;
}) {
  return (
    <figure className={s.frame} data-compact={compact || undefined}>
      <div className={s.head}>
        {badge ? (
          <span className={s.badge}>
            {badge.glyph}
            {badge.label}
          </span>
        ) : null}
        <span className={s.title}>{title}</span>
        {station ? <span className={s.station}>{station}</span> : null}
      </div>
      {figures?.length ? (
        <dl className={s.figures}>
          {figures.map((f) => (
            <div key={f.k} className={s.figure}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className={s.scope} style={{ "--aspect": aspect } as CSSProperties}>
        {children}
        {simulated ? (
          <span className={s.sim}>
            <span className={s.simMark} aria-hidden="true" />
            {simulated}
          </span>
        ) : null}
        {axis ? (
          <span className={s.axis} aria-hidden="true">
            {axis}
          </span>
        ) : null}
      </div>
      {controls ? <div className={s.controls}>{controls}</div> : null}
      <dl className={s.readouts}>
        {readouts.map((r) => (
          <div key={r.k} className={s.readout}>
            <dt>{r.k}</dt>
            <dd aria-live={r.live ? "off" : undefined}>{r.v}</dd>
          </div>
        ))}
      </dl>
      {caption || link ? (
      <figcaption className={s.caption}>
        {caption}
        {link ? (
          <>
            {" "}
            <a className={s.link} href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
              <Icon name="arrow-ne" size={14} />
            </a>
          </>
        ) : null}
      </figcaption>
      ) : null}
    </figure>
  );
}
