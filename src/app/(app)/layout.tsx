import Link from "next/link";
import { signOut } from "@/auth";
import { requireEmployee } from "@/lib/employees";
import { initials } from "@/lib/format";

const NAV = [
  { href: "/roles", label: "Open roles" },
  { href: "/referrals", label: "My referrals" },
];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const employee = await requireEmployee();
  const name = employee.full_name || employee.email.split("@")[0] || "there";

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-line)] bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
          <Link href="/roles" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-brand)] text-[13px] font-bold text-white">
              cg
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Referral Hub</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-[14px] text-[var(--color-ink-2)] transition hover:bg-[var(--color-brand-soft)] hover:text-[var(--color-brand)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[12px] font-semibold text-[var(--color-brand)]"
              title={employee.email}
            >
              {initials(name)}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="text-[13px] text-[var(--color-ink-3)] transition hover:text-[var(--color-ink)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
