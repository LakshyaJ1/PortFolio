import type { SVGProps } from "react";

// One authored icon set: 24px grid, 1.5px stroke, round caps. Brand marks are filled.
const PATHS = {
  "arrow-ne": <path d="M7 17 17 7M9 7h8v8" />,
  "arrow-right": <path d="M4 12h15M13 6l6 6-6 6" />,
  "arrow-down": <path d="M12 4v15M6 13l6 6 6-6" />,
  "arrow-up": <path d="M12 20V5M6 11l6-6 6 6" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M15.5 8.5v-3a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" />,
  volume: (
    <>
      <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  menu: <path d="M4 8h16M4 16h16" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" />
    </>
  ),
  north: (
    <>
      <path d="M12 3 7.5 20 12 16.5 16.5 20 12 3Z" />
    </>
  ),
  flag: <path d="M6 21V4M6 4h10.5l-2 4 2 4H6" />,
  terminal: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4" />
    </>
  ),
  download: <path d="M12 4v11M7 10l5 5 5-5M5 19.5h14" />,
  sparkle: <path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2 2M15 15l2 2M17 7l-2 2M9 15l-2 2" />,
  send: <path d="M4.5 12 19.5 5l-5 15-3-6.5-7-1.5Z" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  map: (
    <>
      <path d="m3.5 6.5 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
} as const;

const BRANDS = {
  github: (
    <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-1.7c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6 0-.6 0-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.1-.2-4.3-1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.7-2.2 4.5-4.3 4.7.3.3.6.9.6 1.8v2.6c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5Z" />
  ),
  linkedin: (
    <path d="M5.4 8.6h2.9v9.4H5.4zM6.9 4a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4ZM10.1 8.6h2.8v1.3c.4-.7 1.4-1.5 2.9-1.5 3 0 3.6 2 3.6 4.6V18h-2.9v-4.4c0-1 0-2.4-1.5-2.4s-1.8 1.2-1.8 2.3V18h-2.9z" />
  ),
} as const;

export type IconName = keyof typeof PATHS | keyof typeof BRANDS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const brand = name in BRANDS;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill={brand ? "currentColor" : "none"}
      stroke={brand ? "none" : "currentColor"}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {brand ? BRANDS[name as keyof typeof BRANDS] : PATHS[name as keyof typeof PATHS]}
    </svg>
  );
}
