"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Icon } from "@/components/ui/Icon";
import { useIsNarrow, useReducedMotion } from "@/lib/hooks";
import { scrollToTarget } from "@/lib/scroll";
import { useApp } from "@/lib/store";
import { sectionById, type SectionId } from "@/lib/sections";
import { arrive } from "@/components/sections/benchmarks/arrive";
import { Mark, hasMark } from "./Mark";
import { STACK, STACK_ITEMS, TRACED_COUNT, type StackItem } from "./evidence";
import styles from "./Legend.module.css";

gsap.registerPlugin(useGSAP);

const byKey = new Map(STACK_ITEMS.map((i) => [i.key, i]));
/** position of each tool in reading order, for the roving tab stop */
const flatIndex = new Map(STACK_ITEMS.map((i, n) => [i.key, n]));
const CARD_ID = "stack-evidence";
/** grace before a hover card closes, so the pointer can travel into it */
const CLOSE_MS = 160;

/** The contour between two layers: a gentle, deterministic wave across a 1000 × 12 box. */
function boundary(seed: number) {
  let d = "";
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const y = 6 + 2.4 * Math.sin(2 * Math.PI * (1.15 * t + seed * 0.37)) + 1.3 * Math.sin(2 * Math.PI * (2.9 * t + seed * 0.61));
    d += `${i ? "L" : "M"}${(t * 1000).toFixed(1)} ${y.toFixed(2)}`;
  }
  return d;
}
const BOUNDS = STACK.map((_, i) => boundary(i + 1));

const places = (n: number) => `${n} ${n === 1 ? "place" : "places"}`;
const isMouse = (e: PointerEvent) => e.pointerType === "mouse" || e.pointerType === "pen";

/** Where a tool shows up on the page: jobs, projects and achievements, each with the résumé line it came from. */
function Evidence({
  item,
  brands,
  onGo,
  onClose,
}: {
  item: StackItem;
  brands: Record<string, string>;
  onGo: (section: SectionId) => void;
  onClose: (() => void) | null;
}) {
  const n = item.evidence.length;
  const marked = hasMark(item.label, brands);
  return (
    <>
      <div className={styles.evHead}>
        {marked ? (
          <span className={styles.evMark}>
            <Mark label={item.label} brand={brands[item.label]} size={28} />
          </span>
        ) : null}
        <div className={styles.evTitle}>
          <p className={styles.evGroup}>{item.groupLabel}</p>
          <h3 className={styles.evName}>{item.label}</h3>
        </div>
        {onClose ? (
          <button type="button" className={styles.evClose} onClick={onClose} aria-label={`Close ${item.label}`}>
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>

      {n ? (
        <>
          <p className={styles.evCount}>
            Used in <strong>{places(n)}</strong> on this page
          </p>
          <ol className={styles.evList}>
            {item.evidence.map((e) => (
              <li key={e.key}>
                <a
                  className={styles.evItem}
                  href={`#${e.section}`}
                  onClick={(ev) => {
                    ev.preventDefault();
                    onGo(e.section);
                  }}
                >
                  <span className={styles.evWhere}>
                    <span className={styles.evKind}>
                      {e.restricted ? <span className={styles.hatchMark} aria-hidden="true" /> : null}
                      {sectionById(e.section)?.plain ?? e.kind}
                      {e.restricted ? " · NDA" : ""}
                    </span>{" "}
                    <strong>{e.name}</strong> <span className={styles.evDetail}>{e.detail}</span>
                  </span>
                  <span className={styles.evSnippet}>
                    {e.snippet ? (
                      <>
                        {e.snippet.before}
                        <mark>{e.snippet.match}</mark>
                        {e.snippet.after}
                      </>
                    ) : (
                      <>
                        In its stack as <mark>{e.term}</mark>
                      </>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className={styles.evNone}>
          <strong>Listed on his résumé.</strong> No job, project or achievement on this page names it.
        </p>
      )}
    </>
  );
}

export function LegendPanel({ brands }: { brands: Record<string, string> }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const closeTimer = useRef(0);
  const [pinned, setPinned] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [viewport, setViewport] = useState(0);
  const narrow = useIsNarrow();
  const reduced = useReducedMotion();
  const plain = useApp((s) => s.plain);

  // Wide sheets: a card floats by the tool (hover previews, click pins). Phones: a tap opens a drawer in the layer.
  const shownKey = narrow ? pinned : (preview ?? pinned);
  const shown = shownKey ? (byKey.get(shownKey) ?? null) : null;

  const hold = () => window.clearTimeout(closeTimer.current);
  const release = () => {
    hold();
    closeTimer.current = window.setTimeout(() => setPreview(null), CLOSE_MS);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const close = () => {
    setPinned(null);
    setPreview(null);
  };
  const go = (section: SectionId) => {
    close();
    scrollToTarget(section);
  };

  // A pinned card closes on Escape or a tap anywhere that isn't a tool or the card itself.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("[data-tool], [data-card]")) return;
      setPinned(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPinned(null);
      setPreview(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  // re-place an open card when the window changes size
  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth * 10000 + window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Place the card under its tool, or above it when that side has more room. Room is bounded by the
  // viewport and by this section (the next section paints over anything that spills into it); when
  // neither side fits, the card takes the roomier one and scrolls inside.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const root = rootRef.current;
    const tile = shownKey ? itemRefs.current[flatIndex.get(shownKey) ?? -1] : null;
    const body = card?.firstElementChild instanceof HTMLElement ? card.firstElementChild : null;
    if (!card || !body || !root || !tile) return;
    body.style.maxHeight = "";
    const r = root.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const gap = 10;
    const below = Math.min(window.innerHeight - 12, r.bottom + 72) - (t.bottom + gap);
    const above = t.top - gap - Math.max(84, r.top - 96); // clear of the fixed nav; may rise into the heading
    const place = h <= below || (h > above && below >= above) ? "below" : "above";
    const room = place === "below" ? below : above;
    const height = Math.min(h, Math.max(room, 200));
    if (height < h) body.style.maxHeight = `${height - 2}px`; // the body scrolls; the card keeps its notch
    const cx = t.left + t.width / 2 - r.left;
    const left = Math.min(Math.max(cx - w / 2, 0), Math.max(0, r.width - w));
    card.style.left = `${left}px`;
    card.style.top = `${place === "below" ? t.bottom - r.top + gap : t.top - r.top - gap - height}px`;
    card.style.setProperty("--notch", `${Math.min(Math.max(cx - left, 16), w - 16)}px`);
    card.dataset.place = place;
  }, [shownKey, narrow, viewport]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = STACK_ITEMS.length - 1;
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape") {
      close();
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    setFocusIndex(next);
    itemRefs.current[next]?.focus();
  };

  // The stack is laid down from the bedrock up: each contour draws, then its tools settle (from arrival only).
  useGSAP(
    (_ctx, contextSafe) => {
      const root = rootRef.current;
      if (reduced || plain || !root || !contextSafe) return;
      arrive({
        trigger: root,
        start: "top 80%",
        safe: (fn) => contextSafe(fn),
        build: () => {
          const layers = gsap.utils.toArray<HTMLElement>("[data-layer]", root).reverse();
          const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
          layers.forEach((layer, i) => {
            const at = i * 0.13;
            const bound = layer.querySelector("[data-bound]");
            const tools = layer.querySelectorAll("[data-tool]");
            const strip = layer.querySelector("[data-strip]");
            if (strip) tl.fromTo(strip, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, clearProps: "clipPath" }, at);
            if (bound) tl.fromTo(bound, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.1, clearProps: "clipPath" }, at);
            if (tools.length) {
              tl.fromTo(
                tools,
                { opacity: 0, y: 10 },
                { opacity: 1, y: 0, duration: 0.7, stagger: 0.022, clearProps: "opacity,transform" },
                at + 0.08,
              );
            }
          });
          return tl;
        },
      });
    },
    { scope: rootRef, dependencies: [reduced, plain] },
  );

  return (
    <div ref={rootRef} className={styles.stack}>
      <p className={styles.key}>
        <span className={styles.keyHint}>Hover or tap a tool to see where he used it.</span>
        <span className={styles.keyCount}>
          <span className={styles.keyDemo} aria-hidden="true">
            3
          </span>
          places on this page that use it · {TRACED_COUNT} of {STACK_ITEMS.length} traced
        </span>
      </p>

      <div className={styles.column} data-guide="stack">
        {STACK.map((layer, li) => (
          <section
            key={layer.id}
            className={styles.layer}
            data-layer
            data-chips={layer.chips || undefined}
            aria-labelledby={`stack-${layer.id}`}
          >
            {li > 0 ? (
              <svg className={styles.bound} viewBox="0 0 1000 12" preserveAspectRatio="none" aria-hidden="true" data-bound>
                <path d={BOUNDS[li]} />
              </svg>
            ) : null}
            <span className={styles.strip} data-p={layer.pattern} data-strip aria-hidden="true" />
            <h3 id={`stack-${layer.id}`} className={styles.layerHead}>
              <span className={styles.layerName}>{layer.label}</span>
              <span className={styles.layerCount}>{layer.items.length}</span>
            </h3>
            <ul className={styles.tools}>
              {layer.items.map((item) => {
                const index = flatIndex.get(item.key) ?? 0;
                const n = item.evidence.length;
                const open = shownKey === item.key;
                return (
                  <li key={item.key} className={styles.toolCell}>
                    <button
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      type="button"
                      className={styles.tool}
                      data-tool
                      data-active={open || undefined}
                      aria-expanded={pinned === item.key}
                      aria-controls={pinned === item.key ? CARD_ID : undefined}
                      tabIndex={index === focusIndex ? 0 : -1}
                      onPointerEnter={(e) => {
                        if (!isMouse(e)) return;
                        hold();
                        setPreview(item.key);
                      }}
                      onPointerLeave={(e) => {
                        if (isMouse(e)) release();
                      }}
                      onFocus={() => {
                        setFocusIndex(index);
                        hold();
                        setPreview(item.key);
                      }}
                      onBlur={(e) => {
                        const to = e.relatedTarget instanceof Element ? e.relatedTarget : null;
                        if (!to?.closest("[data-card]")) release();
                      }}
                      onClick={() => setPinned((p) => (p === item.key ? null : item.key))}
                      onKeyDown={(e) => onKeyDown(e, index)}
                    >
                      {hasMark(item.label, brands) ? (
                        <span className={styles.toolMark}>
                          <Mark label={item.label} brand={brands[item.label]} />
                        </span>
                      ) : null}
                      <span className={styles.toolName}>{item.label}</span>
                      {n ? (
                        <span className={styles.toolCount}>
                          <span aria-hidden="true">{n}</span>
                          <span className="visually-hidden">, used in {places(n)}</span>
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            {narrow && shown && shown.groupId === layer.id ? (
              <div className={styles.drawer} id={CARD_ID} data-card>
                <Evidence item={shown} brands={brands} onGo={go} onClose={close} />
              </div>
            ) : null}
          </section>
        ))}
      </div>

      {!narrow && shown ? (
        <div
          ref={cardRef}
          className={styles.card}
          id={CARD_ID}
          data-card
          data-lenis-prevent
          role="group"
          aria-label={`Where ${shown.label} is used`}
          onPointerEnter={(e) => {
            if (isMouse(e)) hold();
          }}
          onPointerLeave={(e) => {
            if (isMouse(e)) release();
          }}
          onFocus={hold}
          onBlur={(e) => {
            const to = e.relatedTarget instanceof Element ? e.relatedTarget : null;
            if (!to?.closest("[data-card], [data-tool]")) release();
          }}
        >
          <div className={styles.cardBody}>
            <Evidence item={shown} brands={brands} onGo={go} onClose={pinned === shown.key ? close : null} />
          </div>
        </div>
      ) : null}

      <p className="visually-hidden" aria-live="polite">
        {shown ? `${shown.label}: ${shown.evidence.length ? `used in ${places(shown.evidence.length)} on this page` : "listed on his résumé"}.` : ""}
      </p>
    </div>
  );
}
