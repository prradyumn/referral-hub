import Link from "next/link";
import { requireSignedInUser } from "@/lib/employees";
import { rupees, initials } from "@/lib/format";
import {
  LEADERBOARD_PERIODS,
  leaderboard,
  type LeaderboardPeriod,
} from "@/lib/showcase";
import { PageHead, ShowcaseNotice } from "@/components/Chrome";

const MEDAL = ["var(--color-gold)", "#8a8f9c", "#a9702f"];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireSignedInUser();
  const sp = await searchParams;

  const period = (LEADERBOARD_PERIODS.find((p) => p.id === sp.period)?.id ??
    "monthly") as LeaderboardPeriod;
  const rows = leaderboard[period];

  return (
    <>
      <PageHead
        title="Leaderboard"
        lede="Top referrers by reward earned."
        preview
      />

      <ShowcaseNotice phase="Phase 3, behind a feature flag">
        Publicly ranking colleagues is a culture decision as much as a product one, so this
        ships switched off and gets turned on deliberately. The names and figures below are
        invented.
      </ShowcaseNotice>

      {/* Period filter as links, so each view has its own URL */}
      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Period">
        {LEADERBOARD_PERIODS.map((p) => {
          const active = p.id === period;
          return (
            <Link
              key={p.id}
              href={`/leaderboard?period=${p.id}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-[13.5px] font-medium transition ${
                active
                  ? "bg-[var(--color-brand)] text-white"
                  : "border border-[var(--color-line)] bg-white text-[var(--color-ink-2)] hover:border-[var(--color-ink-3)]"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>

      <ol className="grid gap-3">
        {rows.map((p, i) => (
          <li key={p.name} className="card flex flex-wrap items-center gap-4 p-5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white"
              style={{ background: MEDAL[i] ?? "var(--color-ink-3)" }}
            >
              {i + 1}
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[13px] font-semibold text-[var(--color-brand)]">
              {initials(p.name)}
            </span>
            <div className="min-w-[160px] flex-1">
              <p className="text-[15.5px] font-semibold leading-snug">{p.name}</p>
              <p className="text-[13px] text-[var(--color-ink-3)]">{p.department}</p>
            </div>
            <div className="text-right">
              <p className="text-[15px] font-semibold">{p.joined}</p>
              <p className="text-[12.5px] text-[var(--color-ink-3)]">joined</p>
            </div>
            <div className="min-w-[110px] text-right">
              <p className="text-[15px] font-semibold text-[var(--color-gold)]">
                {rupees(p.earned)}
              </p>
              <p className="text-[12.5px] text-[var(--color-ink-3)]">earned</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Only referrals that resulted in a hire count. Candidate names never appear here.
      </p>
    </>
  );
}
