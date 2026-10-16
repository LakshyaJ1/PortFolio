// Survey symbols drawn for the chrome, in the icon set's 1.5px stroke.

/** Trig point: a triangle with a centre dot (the surveyed station). */
export function TrigMark({ size = 22, filled = false, className }: { size?: number; filled?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 22"
      width={size}
      height={(size * 22) / 24}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="M12 2.25 21.75 19.5H2.25Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {filled ? null : <circle cx="12" cy="13.75" r="1.9" fill="currentColor" />}
    </svg>
  );
}

/** Position fix: ring with four ticks clear of the centre. */
export function FixMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      <circle cx="20" cy="20" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="1.75" fill="currentColor" />
      <path d="M20 2v10M20 28v10M2 20h10M28 20h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
