import Link from "next/link";

const TABS = [
  { href: "/admin/rewards", label: "Rewards" },
  { href: "/admin/pipeline", label: "Reward pipeline" },
  { href: "/admin/sync", label: "Integration health" },
  { href: "/admin/settings", label: "Settings" },
];

/** Sub-navigation for the admin screens, so the main header stays one item. */
export default function AdminNav({ current }: { current: string }) {
  return (
    // Scrolls sideways on narrow screens rather than pushing the page wider;
    // four tabs do not fit in 320px.
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-line)] px-1">
      {TABS.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-[13.5px] whitespace-nowrap transition ${
              active
                ? "border-[var(--color-brand)] font-medium text-[var(--color-brand)]"
                : "border-transparent text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
