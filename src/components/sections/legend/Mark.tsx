import type { ReactNode } from "react";

// A tool's mark. Brand marks (Simple Icons paths, handed down from the server by Legend.tsx) are
// filled; everything without one gets an authored pictogram on the same 24px grid as @/components/ui/Icon
// (1.5px stroke, round caps), drawn to say what the thing is: a chat bubble for LLMs, a cylinder for SQL.

/** zero-length segments with round caps: a crisp dot at each point */
const dots = (pts: [number, number][], w = 2.4) => (
  <path d={pts.map(([x, y]) => `M${x} ${y}h.01`).join("")} strokeWidth={w} />
);

const AUTHORED: Record<string, ReactNode> = {
  LLMs: (
    <>
      <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-7L7.5 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z" />
      <path d="M7.5 8.5h9M7.5 12h6" />
    </>
  ),
  RAG: (
    <>
      <path d="M12 20.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5h7l4.5 4.5v2.5" />
      <path d="M12.5 3.5V8h5M8 11h4M8 14.5h2" />
      <circle cx="16.25" cy="16.25" r="3" />
      <path d="m18.5 18.5 2 2" />
    </>
  ),
  "Agentic AI": (
    <>
      <circle cx="12" cy="12" r="2.25" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3M4.5 12a7.5 7.5 0 0 1 12.8-5.3" />
      <path d="M17.5 3.5v3.3h-3.3M6.5 20.5v-3.3h3.3" />
    </>
  ),
  "Gen AI": (
    <>
      <path d="M10 3.5 11.6 8.4 16.5 10l-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6Z" />
      <path d="m18 14.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
    </>
  ),
  Transformers: (
    <>
      <path d="M3.5 3.5h3v3h-3ZM10.5 3.5h3v3h-3ZM17.5 3.5h3v3h-3ZM3.5 17.5h3v3h-3ZM10.5 17.5h3v3h-3ZM17.5 17.5h3v3h-3Z" />
      <path
        d="M5 6.5v11M5 6.5l7 11M5 6.5l14 11M12 6.5l-7 11M12 6.5v11M12 6.5l7 11M19 6.5l-14 11M19 6.5l-7 11M19 6.5v11"
        strokeWidth={0.9}
      />
    </>
  ),
  Embeddings: (
    <>
      <path d="M4.5 3.5v16h16" />
      <path d="m4.5 19.5 9.5-9.5M10.5 10H14v3.5" />
      {dots([
        [18, 5.5],
        [20.5, 8.5],
        [16.5, 9],
        [9, 6],
      ])}
    </>
  ),
  "C#": (
    <>
      <path d="M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3Z" />
      <path d="M11.9 9.5a3.2 3.2 0 1 0 0 5" />
      <path d="M14.6 9.6v4.8M16.9 9.6v4.8M13.8 11h4M13.8 13h4" strokeWidth={1.2} />
    </>
  ),
  Java: (
    <>
      <path d="M5.5 10.5h11V15a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z" />
      <path d="M16.5 11.5h1.25a2.25 2.25 0 0 1 0 4.5H16" />
      <path d="M9 3.5c-1.2 1.4 1.2 2.1 0 3.5M12.5 3.5c-1.2 1.4 1.2 2.1 0 3.5" />
    </>
  ),
  SQL: (
    <>
      <path d="M3.5 5h17v14h-17ZM3.5 9.5h17M3.5 14h17M9.5 5v14" />
      <path d="m13 11.75 1.5 1.5 3-3" />
    </>
  ),
  MySQL: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  "Data Structures & Algorithms": (
    <>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="7" cy="12" r="1.8" />
      <circle cx="17" cy="12" r="1.8" />
      <circle cx="4.5" cy="19" r="1.8" />
      <circle cx="9.5" cy="19" r="1.8" />
      <path d="M10.95 6.47 8.05 10.53M13.05 6.47l2.9 4.06M6.39 13.7l-1.28 3.6M7.61 13.7l1.28 3.6" />
    </>
  ),
  OOP: (
    <>
      <path d="M4 3.5h9V11H4ZM4 6.5h9" />
      <path d="M11 13h9v7.5h-9ZM11 16h9" />
      <path d="M8.5 11v5.75H11" />
    </>
  ),
  "Production ML": (
    <>
      <path d="M4.5 4.5h15v6h-15ZM4.5 13.5h15v6h-15Z" />
      {dots([
        [7.5, 7.5],
        [7.5, 16.5],
      ])}
      <path d="M10.5 7.5H17M10.5 16.5h2l1.2-2 1.6 4 1.2-2H17" />
    </>
  ),
  "Distributed Systems": (
    <>
      <path d="m12 4.5 7.13 5.18-2.72 8.39H7.59L4.87 9.68Z" />
      <path d="m12 4.5 4.41 13.57M4.87 9.68h14.26" strokeWidth={1} />
      {dots(
        [
          [12, 4.5],
          [19.13, 9.68],
          [16.41, 18.07],
          [7.59, 18.07],
          [4.87, 9.68],
        ],
        4.2,
      )}
    </>
  ),
  "Cloud-native": (
    <>
      <path d="m8.5 5 3.46 2v4L8.5 13l-3.46-2V7Z" />
      <path d="m15.43 5 3.46 2v4l-3.46 2-3.46-2V7Z" />
      <path d="m11.96 11 3.46 2v4l-3.46 2-3.46-2v-4Z" />
    </>
  ),
  Azure: <path d="M17.5 19H8.5a6 6 0 1 1 5.8-7.5h3.2a3.75 3.75 0 0 1 0 7.5Z" />,
};

/** whether a skill gets a mark at all (ways-of-working chips don't) */
export function hasMark(label: string, brands: Record<string, string>) {
  return Boolean(brands[label] ?? AUTHORED[label]);
}

export function Mark({
  label,
  brand,
  size = 32,
  className,
}: {
  label: string;
  /** a Simple Icons path for this skill, when it has a brand mark */
  brand?: string;
  size?: number;
  className?: string;
}) {
  const art = brand ? null : AUTHORED[label];
  if (!brand && !art) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-brand={brand ? "" : undefined}
      {...(brand
        ? { fill: "currentColor" }
        : { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" })}
    >
      {brand ? <path d={brand} /> : art}
    </svg>
  );
}
