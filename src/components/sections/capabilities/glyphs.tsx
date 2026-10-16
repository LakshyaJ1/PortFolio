import type { SVGProps } from "react";

// Domain glyphs for the capability lines, drawn like the shared icon set
// (24px grid, 1.5px stroke, round caps). Kept here until they move into ui/Icon.
const PATHS = {
  agents: (
    <>
      <circle cx="5.5" cy="12" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
      <path d="M8 10.8 16.1 6.7M8 13.2l8.1 4.1M18.5 8v8" />
    </>
  ),
  retrieval: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 5.1 5.1M8 9h.01M12.5 8.2h.01M10 12.8h.01M13.2 11.8h.01" />
    </>
  ),
  edge: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5M10.5 10.5h3v3h-3z" />
    </>
  ),
  robotics: (
    <>
      <rect x="3.5" y="9.5" width="15" height="5.5" rx="1" />
      <circle cx="6.5" cy="18.5" r="2" />
      <circle cx="11" cy="18.5" r="2" />
      <circle cx="15.5" cy="18.5" r="2" />
      <path d="M15 9.5V5.5M13 3.5h4.5v2H13zM20.5 4.5c.7.6 1 1.3 1 2" />
    </>
  ),
  xr: (
    <>
      <path d="M2.5 9.5a2.5 2.5 0 0 1 2.5-2.5h14a2.5 2.5 0 0 1 2.5 2.5v4.5A2.5 2.5 0 0 1 19 16.5h-3.4l-1.9-2.6h-3.4l-1.9 2.6H5A2.5 2.5 0 0 1 2.5 14z" />
      <path d="M7.5 7V5.5h9V7" />
    </>
  ),
} as const;

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, size = 24, ...rest }: { name: GlyphName; size?: number | string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
