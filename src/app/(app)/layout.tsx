import Link from "next/link";
import { signOut } from "@/auth";
import { requireSignedInUser } from "@/lib/employees";
import { initials } from "@/lib/format";
import WelcomeDialog from "@/components/WelcomeDialog";
import Logo from "@/components/Logo";

const NAV = [
  { href: "/home", label: "Home" },
  { href: "/roles", label: "Open roles" },
  { href: "/referrals", label: "My referrals" },
  { href: "/rewards", label: "My rewards" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/how-to-refer", label: "How to refer" },
];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Session only — no database. The shell renders whether or not Postgres is up.
  const user = await requireSignedInUser();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3">
          <Link href="/home" className="flex items-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-tight">Referral Hub</span>
          </Link>

          <nav className="-mx-1 flex flex-1 items-center gap-0.5 overflow-x-auto px-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13.5px] text-[var(--color-ink-2)] transition hover:bg-[var(--color-brand-soft)] hover:text-[var(--color-brand)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/refer" className="btn-primary hidden !py-2 text-[13.5px] sm:inline-flex">
              Refer someone
            </Link>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[12px] font-semibold text-[var(--color-brand)]"
              title={user.email}
            >
              {initials(user.name)}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="text-[13px] whitespace-nowrap text-[var(--color-ink-3)] transition hover:text-[var(--color-ink)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>

      <WelcomeDialog />
    </div>
  );
}
