import Link from "next/link";
import { signOut } from "@/auth";
import { currentEmployee, requireSignedInUser } from "@/lib/employees";
import { isAdmin } from "@/lib/admin";
import { initials } from "@/lib/format";
import { Wordmark } from "@/components/Logo";
import { DesktopNav, MobileMore, MobileTabBar } from "@/components/AppNav";
import { Toaster } from "@/components/Toast";

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
const ADMIN_NAV = [{ href: "/admin/inbox", label: "Admin" }];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Session only for identity — the shell renders whether or not Postgres is up.
  const user = await requireSignedInUser();

  // The admin link is hidden from everyone else, but hiding a link is not a
  // permission: requireAdmin() in src/lib/admin.ts is what actually guards
  // those routes. This just avoids showing a door that will not open.
  // Failing closed keeps the header rendering when the database is down.
  //
  // The programme poster lives on /home, not here — it is a thing you meet
  // when you arrive, not on every page.
  let showAdmin = false;
  try {
    const employee = await currentEmployee();
    showAdmin = employee ? await isAdmin(employee.email) : false;
  } catch {
    showAdmin = false;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3">
          <Link
            href="/home"
            className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-brand)]"
            aria-label="ConveGenius Referral Hub — home"
          >
            <Wordmark />
          </Link>

          <DesktopNav items={[...NAV, ...(showAdmin ? ADMIN_NAV : [])]} />

          <div className="ml-auto flex items-center gap-3 sm:ml-0">
            <Link href="/refer" className="btn-primary hidden !py-2 text-[13.5px] sm:inline-flex">
              Refer someone
            </Link>
            {/* Phones get the pages the bottom bar has no room for here. */}
            <MobileMore
              items={[
                { href: "/leaderboard", label: "Leaderboard" },
                { href: "/how-to-refer", label: "How to refer" },
                ...(showAdmin ? ADMIN_NAV : []),
              ]}
              signOut={
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button
                    type="submit"
                    className="block w-full rounded-md px-3 py-2.5 text-left text-[14px] text-[var(--color-ink-2)] hover:bg-[var(--color-ground)]"
                  >
                    Sign out
                  </button>
                </form>
              }
            />
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[12px] font-semibold text-[var(--color-brand)]"
              title={user.email}
            >
              {initials(user.name)}
            </span>
            <form
              className="hidden sm:block"
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

      {/* Bottom padding on phones so the tab bar never covers the end of a
          page. */}
      <main className="mx-auto max-w-6xl px-5 pt-8 pb-28 sm:pb-8">{children}</main>

      <MobileTabBar />
      <Toaster />
    </div>
  );
}
