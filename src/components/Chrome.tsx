import Link from "next/link";

/** Marks anything illustrative. See src/lib/showcase.ts for why this exists. */
export function PreviewTag({ label = "Sample data" }: { label?: string }) {
  return (
    <span className="pill-preview" title="Illustrative — this feature is not built yet">
      <svg viewBox="0 0 8 8" className="h-1.5 w-1.5" aria-hidden="true">
        <circle cx="4" cy="4" r="4" fill="currentColor" />
      </svg>
      {label}
    </span>
  );
}

export function PageHead({
  title,
  lede,
  preview,
  action,
}: {
  title: string;
  lede?: string;
  preview?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
          {preview && <PreviewTag />}
        </div>
        {lede && <p className="mt-1 text-[15px] text-[var(--color-ink-2)]">{lede}</p>}
      </div>
      {action}
    </div>
  );
}

/** Says plainly that a screen is a design, not a working feature. */
export function ShowcaseNotice({ phase, children }: { phase: string; children: React.ReactNode }) {
  return (
    <p className="card mb-6 border-dashed bg-[var(--color-ground)] p-4 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
      <strong className="font-semibold text-[var(--color-ink)]">Not built yet — {phase}.</strong>{" "}
      {children}
    </p>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function StatGroup({
  heading,
  accent,
  items,
}: {
  heading: string;
  accent: string;
  items: { value: string; label: string }[];
}) {
  return (
    <Card className="flex flex-col">
      <p className="mb-4 text-[13px] font-medium text-[var(--color-ink-2)]">{heading}</p>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {items.map((it, i) => (
          <div key={it.label}>
            <span className="stat" style={i === 0 ? { color: accent } : undefined}>
              {it.value}
            </span>
            <span className="stat-label">{it.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function QuietLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[13.5px] font-medium text-[var(--color-brand)] hover:underline"
    >
      {children}
    </Link>
  );
}
