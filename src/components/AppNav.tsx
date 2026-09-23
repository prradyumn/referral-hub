"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

const isActive = (path: string, href: string) =>
  href === "/home" ? path === "/home" : path === href || path.startsWith(`${href}/`);

/** The desktop nav, with the current page marked — it had no "you are here". */
export function DesktopNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden flex-1 items-center gap-0.5 sm:flex">
      {items.map((item) => {
        const on = isActive(path, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 text-[13.5px] whitespace-nowrap transition ${
              on
                ? "bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand)]"
                : "text-[var(--color-ink-2)] hover:bg-[var(--color-brand-soft)] hover:text-[var(--color-brand)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Everything the bottom bar has no room for, behind one button.
 *
 * A native <details>: it opens and closes with no JavaScript state, works
 * with a keyboard, and is announced as expandable.
 */
export function MobileMore({
  items,
  signOut,
}: {
  items: NavItem[];
  signOut: React.ReactNode;
}) {
  const path = usePathname();
  return (
    <details className="group relative sm:hidden">
      <summary
        className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 text-[13.5px] font-medium text-[var(--color-ink-2)] ring-1 ring-[var(--color-line)] [&::-webkit-details-marker]:hidden"
        aria-label="More pages"
      >
        More
        <svg viewBox="0 0 20 20" className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" fill="none">
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-52 rounded-lg border border-[var(--color-line)] bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(23,27,36,.3)]">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(path, item.href) ? "page" : undefined}
            className="block rounded-md px-3 py-2.5 text-[14px] text-[var(--color-ink)] hover:bg-[var(--color-brand-soft)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--color-brand)]"
          >
            {item.label}
          </Link>
        ))}
        <div className="my-1 border-t border-[var(--color-line)]" />
        {signOut}
      </div>
    </details>
  );
}

const TABS = [
  {
    href: "/home",
    label: "Home",
    icon: <path d="M3.5 9.5 10 4l6.5 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-4V17H4.5a1 1 0 0 1-1-1z" />,
  },
  {
    href: "/roles",
    label: "Roles",
    icon: (
      <>
        <rect x="3" y="6.5" width="14" height="10" rx="2" />
        <path d="M7.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12.5 5v1.5M3 11h14" />
      </>
    ),
  },
  { href: "/refer", label: "Refer", icon: null },
  {
    href: "/referrals",
    label: "Referrals",
    icon: (
      <>
        <circle cx="7.5" cy="7" r="2.5" />
        <path d="M3 16c.6-2.6 2.3-4 4.5-4s3.9 1.4 4.5 4M13 5.5a2.2 2.2 0 1 1 0 4.4M14.5 12.2c1.4.5 2.3 1.8 2.5 3.8" />
      </>
    ),
  },
  {
    href: "/rewards",
    label: "Rewards",
    icon: (
      <>
        <rect x="3.5" y="8" width="13" height="8.5" rx="1.5" />
        <path d="M2.5 5.5h15v2.5h-15zM10 5.5v11M10 5.5C8.5 3 6 3 6 4.6 6 5.5 8 5.5 10 5.5c2 0 4 0 4-.9C14 3 11.5 3 10 5.5Z" />
      </>
    ),
  },
];

/**
 * The phone navigation: the four places people go, and the one thing they
 * came to do, in reach of a thumb.
 *
 * On mobile the "Refer someone" button used to be hidden outright and the
 * nav showed four of seven items, the rest scrolled off-screen with nothing
 * to say they were there. Most people will open this from a link on their
 * phone.
 */
export function MobileTabBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((t) => {
          const on = isActive(path, t.href);
          if (!t.icon) {
            return (
              <li key={t.href} className="flex justify-center">
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  aria-label="Refer someone"
                  className="-mt-5 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-[var(--color-brand)] text-white shadow-[0_8px_20px_-6px_rgba(59,47,158,.6)] ring-4 ring-white transition active:scale-95"
                >
                  <svg viewBox="0 0 20 20" className="h-6 w-6" aria-hidden="true" fill="none">
                    <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                  <span className="sr-only">Refer</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                  on ? "font-semibold text-[var(--color-brand)]" : "text-[var(--color-ink-3)]"
                }`}
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-6 w-6"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                >
                  {t.icon}
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
