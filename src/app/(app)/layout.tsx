import Link from "next/link";
import { signOut } from "@/auth";
import { requireSignedInUser } from "@/lib/employees";
import { isAdmin } from "@/lib/admin";
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

// One entry, not two. Two admin links pushed the header past its width and
// the second label was truncated mid-word; the admin screens carry their own
// sub-navigation instead.
const ADMIN_NAV = [{ href: "/admin/rewards", label: "Admin" }];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Session only for identity — the shell renders whether or not Postgres is up.
  const user = await requireSignedInUser();

  // The admin link is hidden from everyone else, but hiding a link is not a
  // permission: requireAdmin() in src/lib/admin.ts is what actually guards
  // those routes. This just avoids showing a door that will not open.
  // Failing closed keeps the header rendering when the database is down.
  let showAdmin = false;
  try {
    showAdmin = await isAdmin(user.email);
  } catch {
    showAdmin = false;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3">
          <Link href="/home" className="flex items-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-tight">Referral Hub</span>
          </Link>

          <nav className="-mx-1 flex flex-1 items-center gap-0.5 overflow-x-auto px-1">
            {[...NAV, ...(showAdmin ? ADMIN_NAV : [])].map((item) => (
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
