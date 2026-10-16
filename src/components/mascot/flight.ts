// Where Bindu may be: pure geometry, no DOM. Given a target, her size, her bubble's possible
// sizes and what already occupies the screen, pick a spot BESIDE the target (never on it)
// where she and her bubble cover as little text as possible and no control at all. Rest
// spots are the same idea without a target: the emptiest ground along the screen's sides.

import { inflate, MEDIA_WEIGHT, overlapArea, overlaps, type Box, type Obstacle } from "./ground";

export type Pt = { x: number; y: number };
export type Size = { w: number; h: number };
/** Which side of Bindu the bubble sits on (the leader points back at her). */
export type Side = "left" | "right" | "above" | "below";
export type Dock = "top" | "bottom";

/** The bubble as measured at each width it may take. */
export type Bubble = {
  /** floating beside her, at the usual width and at a narrower one for tight gaps */
  wide: Size;
  narrow: Size;
  /** docked across a phone screen: the height (the width is the screen minus gutters) */
  dockH: number;
};

export type Spot = {
  /** Bindu's top-left, viewport px */
  at: Pt;
  /** the bubble's top-left relative to Bindu's top-left; null when docked */
  bubble: Pt | null;
  /** the floating bubble's width cap, px */
  bubbleW: number | null;
  side: Side | null;
  dock: Dock | null;
  /** +1 faces right, -1 faces left (toward the target) */
  face: 1 | -1;
  score: number;
};

export type Scene = {
  vw: number;
  vh: number;
  /** Bindu's square */
  size: number;
  /** null when she has nothing to say */
  bubble: Bubble | null;
  obstacles: Obstacle[];
  /** phones: the bubble prefers docking to the screen's bottom (or top) edge */
  narrow: boolean;
  /** boxes she must not sit on (the pointer's neighbourhood: the visitor may be about to click) */
  avoid?: Box[];
  /** screen areas neither she nor her bubble may ever cover, in any mode (the fixed nav) */
  reserved?: Box[];
  /** where she is now, to prefer short hops */
  from?: Pt;
};

const M = 10; // screen margin
const GAP = 12; // Bindu ↔ target
const TAIL = 10; // Bindu ↔ bubble
const DOCK_INSET = 16;
const DOCK_TOP = 84; // clears the fixed nav (Mascot keeps its 76px band clear)
/** obstacles this heavy are controls: buttons, links, inputs, embeds */
const CONTROL = 5;

const box = (p: Pt, s: Size): Box => ({ left: p.x, top: p.y, right: p.x + s.w, bottom: p.y + s.h });
const inside = (b: Box, vw: number, vh: number) => b.left >= M && b.top >= M && b.right <= vw - M && b.bottom <= vh - M;
const area = (b: Box) => Math.max(1, (b.right - b.left) * (b.bottom - b.top));

const within = (inner: Box, outer: Box) => inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;

/**
 * What covering `b` costs: each obstacle's weight, scaled up by how much of `b` it fills.
 * `ownMedia` is a big target's box: its own canvas (empty 3D space around the thing drawn in
 * it) doesn't count, so she may stand in it; its text and controls still do.
 */
function cost(b: Box, scene: Scene, ownMedia?: Box) {
  let c = 0;
  const a = area(b);
  for (const o of scene.obstacles) {
    if (!overlaps(b, o.box)) continue;
    if (ownMedia && o.w === MEDIA_WEIGHT && within(o.box, ownMedia)) continue;
    c += o.w * (0.6 + 4 * Math.min(1, overlapArea(b, o.box) / a));
  }
  return c;
}

/** Would `b` cover a control, or the spot the visitor's pointer is heading for? Never allowed. */
function hitsControl(b: Box, scene: Scene) {
  for (const o of scene.obstacles) if (o.w >= CONTROL && overlaps(b, o.box)) return true;
  for (const v of scene.avoid ?? []) if (overlaps(b, v)) return true;
  for (const v of scene.reserved ?? []) if (overlaps(b, v)) return true;
  return false;
}

export function dockBox(dock: Dock, vw: number, vh: number, h: number): Box {
  return dock === "bottom"
    ? { left: DOCK_INSET, right: vw - DOCK_INSET, top: vh - DOCK_INSET - h, bottom: vh - DOCK_INSET }
    : { left: DOCK_INSET, right: vw - DOCK_INSET, top: DOCK_TOP, bottom: DOCK_TOP + h };
}

type Option = { bb: Box; rel: Pt | null; w: number | null; side: Side | null; dock: Dock | null; bias: number };

/** Every place the bubble could go while she stands at `at`, with a preference bias. */
function bubbleOptions(at: Pt, scene: Scene, prefer: Side[]): Option[] {
  const s = scene.size;
  const b = scene.bubble!;
  const out: Option[] = [];
  if (scene.narrow) {
    (["bottom", "top"] as Dock[]).forEach((dock, i) =>
      out.push({ bb: dockBox(dock, scene.vw, scene.vh, b.dockH), rel: null, w: null, side: null, dock, bias: i * 0.3 }),
    );
  }
  [b.wide, b.narrow].forEach((size, k) => {
    prefer.forEach((side, i) => {
      // beside her: vertically centred; above/below: centred, or hung off either of her edges
      const xs = side === "right" ? [s + TAIL] : side === "left" ? [-TAIL - size.w] : [s / 2 - size.w / 2, s - size.w, 0];
      const y = side === "above" ? -TAIL - size.h : side === "below" ? s + TAIL : s / 2 - size.h / 2;
      xs.forEach((x, j) => {
        out.push({
          bb: box({ x: at.x + x, y: at.y + y }, size),
          rel: { x, y },
          w: size.w,
          side,
          dock: null,
          bias: (scene.narrow ? 0.8 : 0) + k * 0.35 + i * 0.15 + j * 0.05,
        });
      });
    });
  });
  return out;
}

type Pick = { rel: Pt | null; w: number | null; side: Side | null; dock: Dock | null; c: number };

/**
 * The best place for her bubble while she stands at `at`. Hard rules: on screen, never over
 * the target, never over a control, never over her. `strict` also refuses any text or media
 * (used when she stands inside a big target); `soft` drops the control rule (a last resort
 * for a line she says from where she rests).
 */
function bestBubble(
  at: Pt,
  scene: Scene,
  forbid: Box | null,
  prefer: Side[],
  mode: "strict" | "normal" | "soft" = "normal",
  ownMedia?: Box,
): Pick | null {
  const me = inflate(box(at, { w: scene.size, h: scene.size }), 4);
  // inside a big target the bubble, like her, keeps to the edges, clear of what it shows
  const mid = ownMedia ? { x: (ownMedia.left + ownMedia.right) / 2, y: (ownMedia.top + ownMedia.bottom) / 2 } : null;
  const half = ownMedia ? Math.hypot(ownMedia.right - ownMedia.left, ownMedia.bottom - ownMedia.top) / 2 : 1;
  let best: Pick | null = null;
  for (const o of bubbleOptions(at, scene, prefer)) {
    if (!inside(o.bb, scene.vw, scene.vh)) continue;
    if ((forbid && overlaps(o.bb, forbid)) || overlaps(o.bb, me)) continue;
    if (scene.reserved?.some((r) => overlaps(o.bb, r))) continue; // even a last-resort line never covers the nav
    if (mode !== "soft" && hitsControl(o.bb, scene)) continue;
    const raw = cost(o.bb, scene, ownMedia);
    if (mode === "strict" && raw > 0) continue;
    let c = raw + o.bias;
    if (mid) c += 2 * (1 - Math.min(1, Math.hypot((o.bb.left + o.bb.right) / 2 - mid.x, (o.bb.top + o.bb.bottom) / 2 - mid.y) / half));
    if (!best || c < best.c) best = { rel: o.rel, w: o.w, side: o.side, dock: o.dock, c };
  }
  return best;
}

/**
 * Bindu beside `target`, never on it: neither she nor her bubble may cover the target, a
 * control or the spot under the visitor's pointer. A target too big to stand beside (a 3D
 * stage, a full-width embed) also offers spots inside it: only on ground with no text and no
 * controls, and near its edges rather than its middle (where the thing it shows usually is).
 * Returns null when nothing is acceptable (she then speaks from where she rests and the ring
 * does the pointing).
 */
export function besideTarget(target: Box, scene: Scene): Spot | null {
  const { vw, vh, size: s } = scene;
  const vis: Box = { left: Math.max(target.left, 0), top: Math.max(target.top, 0), right: Math.min(target.right, vw), bottom: Math.min(target.bottom, vh) };
  const big = area(vis) > vw * vh * 0.32;
  const cx = (vis.left + vis.right) / 2;
  const cy = (vis.top + vis.bottom) / 2;
  const forbid = inflate(target, 4);

  const pts: { at: Pt; within: boolean }[] = [
    { x: target.right + GAP, y: cy - s / 2 },
    { x: target.left - GAP - s, y: cy - s / 2 },
    { x: target.right + GAP, y: target.top - s * 0.2 },
    { x: target.left - GAP - s, y: target.top - s * 0.2 },
    { x: target.right + GAP, y: target.bottom - s * 0.8 },
    { x: target.left - GAP - s, y: target.bottom - s * 0.8 },
    { x: cx - s / 2, y: target.bottom + GAP },
    { x: cx - s / 2, y: target.top - GAP - s },
    { x: target.right - s, y: target.bottom + GAP },
    { x: target.left, y: target.bottom + GAP },
    { x: target.right - s, y: target.top - GAP - s },
    { x: target.left, y: target.top - GAP - s },
  ].map((at) => ({ at, within: false }));
  const own = big ? inflate(target, 2) : undefined;
  if (big) {
    // inside, along the target's left and right edges and its bottom
    const inset = 14;
    for (const fy of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const y = vis.top + (vis.bottom - vis.top) * fy - s / 2;
      pts.push({ at: { x: vis.left + inset, y }, within: true }, { at: { x: vis.right - inset - s, y }, within: true });
    }
    for (const fx of [0.25, 0.5, 0.75]) pts.push({ at: { x: vis.left + (vis.right - vis.left) * fx - s / 2, y: vis.bottom - inset - s }, within: true });
  }

  let best: Spot | null = null;
  const half = Math.hypot(vis.right - vis.left, vis.bottom - vis.top) / 2;
  pts.forEach(({ at, within: inTarget }, i) => {
    const me = box(at, { w: s, h: s });
    if (!inside(me, vw, vh) || hitsControl(me, scene)) return;
    if (!inTarget && overlaps(me, forbid)) return;
    const mine = cost(me, scene, inTarget ? own : undefined);
    if (inTarget && mine > 0) return; // inside the target: no text, no controls
    const dist = Math.hypot(at.x + s / 2 - cx, at.y + s / 2 - cy);
    // beside: closer is better; inside: nearer the edge (away from what the target shows) is better
    let score = mine + i * 0.04 + (inTarget ? 0.6 + 1.5 * (1 - Math.min(1, dist / half)) : dist / (big ? 900 : 400));
    if (scene.from) score += Math.hypot(at.x - scene.from.x, at.y - scene.from.y) / 3000;
    const face: 1 | -1 = at.x + s / 2 <= cx ? 1 : -1;

    let pick: Pick | null = null;
    if (scene.bubble) {
      // a floating bubble prefers the side away from the target, so it reads Bindu → target
      const prefer: Side[] = face === 1 ? ["left", "above", "below", "right"] : ["right", "above", "below", "left"];
      pick = inTarget ? bestBubble(at, scene, null, prefer, "strict", own) : bestBubble(at, scene, forbid, prefer);
      if (!pick) return;
      score += pick.c;
    }
    if (!best || score < best.score) best = { at, bubble: pick?.rel ?? null, bubbleW: pick?.w ?? null, side: pick?.side ?? null, dock: pick?.dock ?? null, face, score };
  });
  return best;
}

/**
 * A resting spot: the emptiest ground along the screen's sides. Phones, a muted tour and the
 * plain sheet keep to the edges and favour the bottom-right corner. `tucked` means even the
 * best spot covers something, so she should peek from the edge instead. `wander` picks among
 * the few best spots, so she drifts about.
 */
export function restSpot(scene: Scene, opts: { wander?: boolean; corner?: boolean; random?: () => number } = {}): Spot & { tucked: boolean } {
  const { vw, vh, size: s } = scene;
  const corner = scene.narrow || opts.corner;
  const right = vw - (corner ? DOCK_INSET : M + 14) - s;
  const left = corner ? DOCK_INSET : M + 14;
  const ys = corner ? [0.9, 0.72, 0.5, 0.3] : [0.74, 0.58, 0.42, 0.86, 0.3];
  const y = (f: number) => Math.max(M, Math.min(vh * f - s / 2, vh - DOCK_INSET - s));
  const pts: Pt[] = [...ys.map((f) => ({ x: right, y: y(f) })), ...ys.slice(0, 4).map((f) => ({ x: left, y: y(f) }))];

  const calm = { ...scene, avoid: [] };
  const scored = pts.map((at, i) => {
    const me = box(at, { w: s, h: s });
    let score = cost(me, calm) + (hitsControl(me, calm) ? 10 : 0) + i * (corner ? 0.4 : 0.05);
    if (scene.from) score += Math.hypot(at.x - scene.from.x, at.y - scene.from.y) / 2500;
    return { at, score };
  });
  scored.sort((a, b) => a.score - b.score);
  let pick = scored[0]!;
  if (opts.wander) {
    const good = scored.filter((c) => c.score < pick.score + 0.6).slice(0, 3);
    pick = good[Math.floor((opts.random ?? Math.random)() * good.length)] ?? pick;
  }
  const occupied = cost(box(pick.at, { w: s, h: s }), calm) > 0;
  const face: 1 | -1 = pick.at.x + s / 2 < vw / 2 ? 1 : -1;

  let rel: Pt | null = null;
  let w: number | null = null;
  let side: Side | null = null;
  let dock: Dock | null = null;
  if (scene.bubble) {
    const prefer: Side[] = face === 1 ? ["right", "above", "below", "left"] : ["left", "above", "below", "right"];
    // nowhere clean: the least-bad spot (a line is short-lived and dismissable)
    const bb = bestBubble(pick.at, scene, null, prefer) ?? bestBubble(pick.at, scene, null, prefer, "soft");
    if (bb) ({ rel, w, side, dock } = bb);
    else if (scene.narrow) dock = "bottom";
    else {
      rel = { x: face === 1 ? s + TAIL : -TAIL - scene.bubble.wide.w, y: s / 2 - scene.bubble.wide.h / 2 };
      w = scene.bubble.wide.w;
      side = face === 1 ? "right" : "left";
    }
  }
  return { at: pick.at, bubble: rel, bubbleW: w, side, dock, face, score: pick.score, tucked: occupied };
}
