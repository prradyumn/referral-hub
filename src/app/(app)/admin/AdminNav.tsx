import Link from "next/link";

const TABS = [
  { href: "/admin/rewards", label: "Rewards" },
  { href: "/admin/pipeline", label: "Reward pipeline" },
  { href: "/admin/sync", label: "Integration health" },
];

/** Sub-navigation for the admin screens, so the main header stays one item. */
export default function AdminNav({ current }: { current: string }) {
  return (
    <nav className="mb-6 flex gap-1 border-b border-[var(--color-line)]">
      {TABS.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] transition ${
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
