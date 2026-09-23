/**
 * The ConveGenius mark, inlined so it needs no image request or optimiser
 * (next/image refuses SVG without dangerouslyAllowSVG — CONTEXT.md §8).
 *
 * `title` is the accessible name. Decorative uses pass `decorative` so the
 * mark is hidden from screen readers and the adjacent wordmark carries the
 * name instead — otherwise every page announces "ConveGenius" twice.
 */
export default function Logo({
  className = "h-8 w-8",
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      // The mark's own proportions (from the brand file, 256×240). The old
      // 64×64 redraw squeezed nine small dots and a half-disc into a square,
      // which read as a stretched logo.
      viewBox="0 0 256 240"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      {...(decorative
        ? { "aria-hidden": true as const, focusable: "false" as const }
        : { role: "img" as const, "aria-label": "ConveGenius" })}
    >
      <g fill="#454b9e">
        <circle cx="58" cy="212" r="14" /><circle cx="27" cy="174" r="14" /><circle cx="15" cy="125" r="14" /><circle cx="27" cy="76" r="14" /><circle cx="57" cy="39" r="14" /><circle cx="104" cy="15" r="14" /><circle cx="152" cy="15" r="14" /><circle cx="199" cy="38" r="14" />
      </g>
      <path d="M128 108 H255 A127 127 0 0 1 232.6 180 H128 Z" fill="#8ed3cb" />
      <path d="M128 180 H232.6 A127 127 0 0 1 128 235 Z" fill="#454b9e" />
    </svg>
  );
}

/**
 * Mark plus wordmark.
 *
 * Two lines, not one: "ConveGenius" is the company and "Referral Hub" is the
 * product, and running them together as a single 15px string made neither
 * legible. The company name is the quiet one — people here already know where
 * they work; what they need to recognise is which internal tool this is.
 */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo className="h-9 w-9 shrink-0" decorative />
      {/* Below `sm` the mark carries the brand on its own. Keeping the
          wordmark there squeezed the nav down to "Home  O" — the logo won the
          space fight against the thing people actually navigate with. */}
      <span className="hidden min-w-0 flex-col leading-none sm:flex">
        <span className="text-[10.5px] font-medium tracking-[0.09em] text-[var(--color-ink-3)] uppercase">
          ConveGenius
        </span>
        <span className="mt-[3px] text-[16px] font-semibold tracking-[-0.015em] text-[var(--color-ink)]">
          Referral Hub
        </span>
      </span>
    </span>
  );
}
