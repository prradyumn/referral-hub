import Link from "next/link";
import { requireSignedInUser } from "@/lib/employees";
import { rupees, initials } from "@/lib/format";
import {
  LEADERBOARD_PERIODS,
  leaderboard,
  leaderboardEnabled,
  type LeaderboardPeriod,
} from "@/lib/rewards";
import { PageHead, Card } from "@/components/Chrome";

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

  // §12 keeps this behind a flag: publicly ranking colleagues is a culture
  // decision for HR, not a default the engineering team picks.
  const enabled = await leaderboardEnabled();
  if (!enabled) {
    return (
      <>
        <PageHead title="Leaderboard" lede="Who has brought the most people in." />
        <Card className="border-dashed">
          <p className="text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
            <strong className="font-semibold text-[var(--color-ink)]">
              The leaderboard is switched off.
            </strong>{" "}
            Ranking colleagues publicly is a decision for HR rather than a default, so it
            stays off until someone turns it on. It works and runs on real referral data —
            set <code className="rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[13px]">
            leaderboard_enabled</code> to <code className="rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[13px]">true</code>{" "}
            in programme settings to show it.
          </p>
        </Card>
      </>
    );
  }

  const rows = await leaderboard(period);

  return (
    <>
      <PageHead title="Leaderboard" lede="Who has brought the most people in." />

      {/* A GET form: filtering is navigation, so every view has a URL
          (convention 7). */}
      <nav className="mb-5 flex flex-wrap gap-1.5">
        {LEADERBOARD_PERIODS.map((p) => (
          <Link
            key={p.id}
            href={`/leaderboard?period=${p.id}`}
            aria-current={p.id === period ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-[13.5px] transition ${
              p.id === period
                ? "bg-[var(--color-brand)] text-white"
                : "bg-white text-[var(--color-ink-2)] hover:bg-[var(--color-brand-soft)]"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[17px] font-medium">Nobody has joined yet in this period</p>
          <p className="mx-auto mt-2 max-w-[44ch] text-[14.5px] leading-relaxed text-[var(--color-ink-3)]">
            The board counts referrals who actually joined, not referrals made — so it
            fills up as people start.
          </p>
          <Link href="/roles" className="btn-primary mt-6">Browse open roles</Link>
        </div>
      ) : (
        <ul className="grid gap-2">
          {rows.map((r, i) => (
            <li key={r.employee_id} className="card flex items-center gap-4 p-4">
              <span
                className="w-6 shrink-0 text-center text-[15px] font-semibold"
                style={{ color: MEDAL[i] ?? "var(--color-ink-3)" }}
              >
                {i + 1}
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[12.5px] font-semibold text-[var(--color-brand)]">
                {initials(r.name)}
              </span>
              <div className="min-w-[160px] flex-1">
                <p className="text-[14.5px] font-medium leading-snug">{r.name}</p>
                <p className="text-[12.5px] text-[var(--color-ink-3)]">
                  {r.department ?? "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[14.5px] font-semibold">{r.joined}</p>
                <p className="text-[12px] text-[var(--color-ink-3)]">joined</p>
              </div>
              <div className="w-[104px] text-right">
                <p className="text-[14.5px] font-semibold text-[var(--color-gold)]">
                  {rupees(r.earned)}
                </p>
                <p className="text-[12px] text-[var(--color-ink-3)]">earned</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Ranked on referrals who joined in the period, not referrals submitted — a
        programme that rewarded volume over judgement would fill the pipeline with noise.
      </p>
    </>
  );
}
