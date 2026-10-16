"use client";

// Is this patch of the screen empty ground? Bindu and her notes only settle on empty ground.
// Hit-testing (elementsFromPoint) misses anything with pointer-events: none (HUD readouts,
// text laid over canvases), so this measures geometry instead: a cached list of candidate
// elements, tested against rectangles, with text refined to its actual line boxes.

export type Box = { left: number; top: number; right: number; bottom: number };

/** Text containers: occupied only where their lines actually are. */
const TEXT = "p,li,h1,h2,h3,h4,h5,h6,dt,dd,td,th,blockquote,label,figcaption,caption,legend,pre";
/** Inline/generic elements count when they carry their own text (mono readouts, labels). */
const INLINE = "span,div,strong,em,b,i,small,time,code,kbd,abbr,output,text";
/** Solid: the whole box is occupied (controls, embeds, instruments, the booking panel). */
const SOLID = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "iframe",
  "figure",
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[contenteditable="true"]',
  "[data-mascot-avoid]",
  "#rendezvous [data-state]",
  "#rendezvous [data-lenis-prevent]",
].join(",");
/** Media: occupied unless it is full-bleed background (the terrain) or a tiny glyph. */
const MEDIA = "canvas,video,img,svg";

type Kind = "text" | "solid" | "media";
export type Candidate = { el: Element; kind: Kind };
/** An occupied rectangle and how much covering it costs (controls cost most). */
export type Obstacle = { box: Box; w: number };

const WEIGHT: Record<Kind, number> = { solid: 5, text: 3, media: 1.5 };
/** Section and page headings: the key text, almost as costly to cover as a control. */
const HEADING_WEIGHT = 4.5;
export const MEDIA_WEIGHT = WEIGHT.media;

const ownText = (el: Element) => {
  for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE && n.textContent && n.textContent.trim()) return true;
  return false;
};

/** Screen-reader-only copy takes no space on the sheet. */
const SR_ONLY = ".visually-hidden,.sr-only";

/** Every element under `scope` that could occupy ground, minus anything inside `exclude`. */
export function collectCandidates(exclude: Element[], scope: ParentNode = document): Candidate[] {
  const skip = (el: Element) => exclude.some((x) => x.contains(el)) || el.closest(SR_ONLY) !== null;
  const out: Candidate[] = [];
  scope.querySelectorAll(SOLID).forEach((el) => !skip(el) && out.push({ el, kind: "solid" }));
  scope.querySelectorAll(TEXT).forEach((el) => !skip(el) && out.push({ el, kind: "text" }));
  scope.querySelectorAll(MEDIA).forEach((el) => {
    // nested svg parts and icons inside controls are covered by their parents
    if (skip(el) || el.parentElement?.closest("svg,a[href],button")) return;
    out.push({ el, kind: "media" });
  });
  scope.querySelectorAll(INLINE).forEach((el) => {
    if (skip(el) || !ownText(el) || el.closest(TEXT) || el.closest(SOLID)) return;
    out.push({ el, kind: "text" });
  });
  return out;
}

export const overlaps = (a: Box, b: Box) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);

export const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

export const inflate = (b: Box, by: number): Box => ({ left: b.left - by, top: b.top - by, right: b.right + by, bottom: b.bottom + by });

let range: Range | null = null;

const ignoredMedia = (b: DOMRect, viewportWidth: number) => b.width >= viewportWidth * 0.7 || b.width < 40 || b.height < 40;

// Text faded to opacity 0 is usually about to animate in, so it still counts; only truly hidden things don't.
const hidden = (el: Element) => typeof el.checkVisibility === "function" && !el.checkVisibility({ visibilityProperty: true });

/** The first element that occupies `box`, or null for empty ground. */
export function occupant(box: Box, candidates: Candidate[], viewportWidth: number): Element | null {
  range ??= document.createRange();
  for (const { el, kind } of candidates) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0 || !overlaps(b, box)) continue;
    if (kind === "media" && ignoredMedia(b, viewportWidth)) continue;
    if (kind === "text") {
      range.selectNodeContents(el);
      let ink = false;
      for (const r of range.getClientRects()) {
        if (r.width > 0 && r.height > 0 && overlaps(r, box)) {
          ink = true;
          break;
        }
      }
      if (!ink) continue;
    }
    if (hidden(el)) continue;
    return el;
  }
  return null;
}

/** Everything occupied inside `view` as weighted rectangles (text as its line boxes), for layout scoring. */
export function obstaclesIn(candidates: Candidate[], view: Box): Obstacle[] {
  range ??= document.createRange();
  const out: Obstacle[] = [];
  const vw = view.right - view.left;
  for (const { el, kind } of candidates) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0 || !overlaps(b, view)) continue;
    if (kind === "media" && ignoredMedia(b, vw)) continue;
    if (hidden(el)) continue;
    if (kind === "text") {
      range.selectNodeContents(el);
      const w = /^H[1-3]$/.test(el.tagName) ? HEADING_WEIGHT : WEIGHT.text;
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0 && overlaps(r, view)) out.push({ box: r, w });
    } else {
      out.push({ box: b, w: WEIGHT[kind] });
    }
  }
  return out;
}
