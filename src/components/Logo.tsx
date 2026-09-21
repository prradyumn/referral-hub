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
      viewBox="0 0 64 64"
      className={className}
      {...(decorative
        ? { "aria-hidden": true as const, focusable: "false" as const }
        : { role: "img" as const, "aria-label": "ConveGenius" })}
    >
      <g fill="#454b9e">
        <circle cx="30.93" cy="23.07" r="3.5" /><circle cx="23.62" cy="18.10" r="3.5" />
        <circle cx="14.78" cy="18.29" r="3.5" /><circle cx="7.70" cy="23.58" r="3.5" />
        <circle cx="5.00" cy="32.00" r="3.5" /><circle cx="7.70" cy="40.42" r="3.5" />
        <circle cx="14.78" cy="45.71" r="3.5" /><circle cx="23.62" cy="45.90" r="3.5" />
        <circle cx="30.93" cy="40.93" r="3.5" />
      </g>
      <path d="M34 32 H62 A20 20 0 0 0 42 12 H34 Z" fill="#8ed3cb" />
      <path d="M34 32 H62 A20 20 0 0 1 42 52 H34 Z" fill="#454b9e" />
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
