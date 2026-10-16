"use client";

import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { Project } from "@/content/profile";
import { useInView, useMedia } from "@/lib/hooks";
import { useStill } from "@/components/sections/capabilities/kit/loop";
import { Drawing } from "./drawings/kit";
import styles from "./Sites.module.css";

gsap.registerPlugin(DrawSVGPlugin, useGSAP);

export type Report = {
  /** dropped when the résumé gives no basis for it */
  problem?: string;
  approach: string[];
};

/**
 * One project card. The front says what it is at a glance: label, title, one
 * plain line, the key figure and the stack. "Turn the sheet" flips it in 3D on
 * wide screens (an expand on phones) to the back: how it works and a live demo.
 */
export function SiteSheet({
  project,
  no,
  variant,
  line,
  demo,
  drawing,
  report,
  Demo,
  current,
}: {
  project: Project;
  no: number;
  variant: "setu" | "pricing" | "token";
  line: string;
  /** what the back holds, printed under "Turn the sheet" */
  demo: string;
  drawing: ReactNode;
  report: Report;
  Demo: ComponentType<{ active?: boolean }>;
  /** the card in view: it carries the guide's "projects-flip" anchor */
  current: boolean;
}) {
  const uid = useId();
  const titleId = `site-${project.id}-title`;
  const backId = `site-${project.id}-back-${uid.replace(/:/g, "")}`;
  const root = useRef<HTMLElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const plan = useRef<HTMLElement>(null);
  const notes = useRef<HTMLDivElement>(null);
  const draw = useRef<gsap.core.Timeline | null>(null);
  const [turned, setTurned] = useState(false);
  const flip = useMedia("(min-width: 900px)", true);
  const still = useStill();
  // demos mount as the card approaches (sideways too), so turning never waits on them
  const near = useInView(root, { once: true, rootMargin: "600px" });
  // the drawing draws itself the first time it is properly in view
  const seen = useInView(plan, { once: true, threshold: 0.3 });

  const [key, ...more] = project.figures;

  useGSAP(
    () => {
      if (still) return;
      const q = gsap.utils.selector(front);
      const lines = q(".draw");
      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "expo.out" },
        onComplete: () => {
          gsap.set(lines, { clearProps: "strokeDasharray,strokeDashoffset" });
        },
      });
      tl.from(lines, { drawSVG: "0%", duration: 1.6, stagger: { each: 0.018, from: "start" } }).from(
        q("[data-v]"),
        { opacity: 0, y: 4, duration: 0.6, stagger: 0.05 },
        "-=1.1",
      );
      draw.current = tl;
      return () => {
        draw.current = null;
      };
    },
    { scope: root, dependencies: [still] },
  );

  // (re)built in a layout effect above, so it exists by the time this runs
  useEffect(() => {
    if (seen) draw.current?.play();
  }, [seen, still]);

  // the field notes scroll on their own only when a short screen can't fit them
  useEffect(() => {
    const el = notes.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      el.toggleAttribute("data-lenis-prevent", el.scrollHeight > el.clientHeight + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggle = () => setTurned((t) => !t);

  return (
    <article
      ref={root}
      className={styles.site}
      data-variant={variant}
      data-turned={turned || undefined}
      data-current={current || undefined}
      aria-labelledby={titleId}
    >
      <header className={styles.strip}>
        <span className={styles.badge}>Project {String(no).padStart(2, "0")}</span>
        <span className={styles.category}>{project.category}</span>
      </header>

      <div ref={front} className={styles.front} inert={flip && turned}>
        <div className={styles.intro}>
          <div className={styles.naming}>
            <h3 id={titleId} className={styles.title}>
              {project.title}
            </h3>
            <p className={styles.subtitle}>{project.subtitle}</p>
          </div>
          <p className={styles.line}>{line}</p>
          {key ? (
            <div className={styles.figures}>
              <p className={styles.keyFig}>
                <span className={styles.keyMark} aria-hidden="true">
                  <Icon name="crosshair" size={22} />
                </span>
                <span className={styles.keyValue}>{key.value}</span>
                <span className={styles.keyLabel}>{key.label}</span>
              </p>
              {more.length ? (
                <ul className={styles.figs}>
                  {more.map((f) => (
                    <li key={f.label}>
                      <span className={styles.figValue}>{f.value}</span> {f.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className={styles.stackBlock}>
            <span className={styles.metaKey}>Built with</span>
            <ul className={styles.stack}>
              {project.stack.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
        <figure ref={plan} className={styles.drawing}>
          <Drawing>{drawing}</Drawing>
        </figure>
      </div>

      {/* the title block: it stays put while the sheet turns */}
      <div className={styles.block}>
        {project.links.length ? (
          <div className={styles.links}>
            {project.links.map((l) => (
              <Button key={l.href} variant="line" href={l.href} icon="arrow-ne" cta={`site-${project.id}`}>
                {l.label}
              </Button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className={styles.turn}
          aria-expanded={turned}
          aria-controls={backId}
          onClick={toggle}
          data-guide={current ? "projects-flip" : undefined}
        >
          <span className={styles.turnIcon}>
            <Icon name="refresh" size={24} />
          </span>
          <span className={styles.turnText}>
            <span className={styles.turnMain}>{turned ? "Turn back" : "Turn the sheet"}</span>
            <span className={styles.turnSub}>{turned ? "Back to the overview" : demo}</span>
          </span>
        </button>
      </div>

      <div id={backId} className={styles.back} inert={!turned} role="region" aria-label={`${project.title}: how it works and live demo`}>
        <div ref={notes} className={styles.report}>
          <h4 className={styles.reportTitle}>
            How <span className={styles.reportName}>{project.title}</span> works
          </h4>
          <dl className={styles.reportParts}>
            {report.problem ? (
              <div>
                <dt>Problem</dt>
                <dd>{report.problem}</dd>
              </div>
            ) : null}
            <div>
              <dt>What he built</dt>
              <dd>
                <ul className={styles.approach}>
                  {report.approach.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </div>
        <div className={styles.demo}>{near ? <Demo active={turned} /> : <div className={styles.demoWait} />}</div>
      </div>
    </article>
  );
}
