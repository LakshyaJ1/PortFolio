import { isValidElement, type ReactNode } from "react";
import { sectionById, type SectionId } from "@/lib/sections";
import styles from "./Sheet.module.css";

/** The visible text of a title (strings, fragments, <em>…), for comparing it with the plain label. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/**
 * A section of the survey sheet. Its top edge is a plain ticked rule (the sheet's edge).
 * The heading is set as a map region name (wide, tracked caps in paper-white), and beside it
 * a chip says in plain words what the section is (PROJECTS, EXPERIENCE…), so the thematic name
 * never has to be decoded. An optional measurement (`aside`) sits on the heading's own line,
 * right-aligned.
 */
export function Sheet({
  id,
  title,
  aside,
  children,
  className,
  bleed = false,
}: {
  id: SectionId;
  title: ReactNode;
  /** a measurement or count for the section (sits on the heading line, never above it) */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** full-bleed content (no max-width wrapper) */
  bleed?: boolean;
}) {
  const meta = sectionById(id)!;
  // a title that already says it plainly doesn't need the chip repeating it
  const samePlain = textOf(title).replace(/\s+/g, " ").trim().toLowerCase() === meta.plain.toLowerCase();
  return (
    <section id={id} data-grid={meta.grid} aria-labelledby={`${id}-title`} className={[styles.sheet, className].filter(Boolean).join(" ")}>
      <div className={styles.edge} aria-hidden="true">
        <span className={styles.ticks} />
      </div>
      <div className="wrap">
        <div className={styles.head}>
          <h2 id={`${id}-title`} className={styles.title}>
            <span className={styles.region}>{title}</span>
            {samePlain ? null : (
              <>
                {" "}
                <span className={styles.plain}>
                  <span className="visually-hidden">: </span>
                  {meta.plain}
                </span>
              </>
            )}
          </h2>
          {aside ? <p className={styles.aside}>{aside}</p> : null}
        </div>
      </div>
      <div className={bleed ? styles.bleed : "wrap"}>{children}</div>
    </section>
  );
}
