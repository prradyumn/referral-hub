import Link from "next/link";
import { requireSignedInUser } from "@/lib/employees";
import { rupees, initials, shortDate } from "@/lib/format";
import {
  LEADERBOARD_PERIODS,
  historySince,
  leaderboard,
  leaderboardEnabled,
  leaderboardSummary,
  type LeaderboardPeriod,
} from "@/lib/rewards";
import RaceTrack, { type Racer } from "@/components/RaceTrack";
import { isAdmin } from "@/lib/admin";
import { currentEmployee } from "@/lib/employees";
import { PageHead, Card } from "@/components/Chrome";

/** Cars on the track. The rest are in the standings — a ninth colour would not help anyone. */
const ON_TRACK = 8;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireSignedInUser();
  const sp = await searchParams;

  // This year, not this month: hires do not land every month, and a board that
  // opens on an empty track is a worse first impression than no board at all.
  const period = (LEADERBOARD_PERIODS.find((p) => p.id === sp.period)?.id ??
    "yearly") as LeaderboardPeriod;

  // §12 keeps this behind a flag: publicly ranking colleagues is a culture
  // decision for HR, not a default the engineering team picks.
  const enabled = await leaderboardEnabled();
  if (!enabled) {
    // Tell an admin where the switch actually is. The previous version named
    // the setting and left it at that, which is useless to anyone without
    // database access — and everyone who can turn it on reads this page.
    const me = await currentEmployee();
    const admin = me ? await isAdmin(me.email) : false;

    return (
      <>
        <PageHead title="Leaderboard" lede="Who has brought the most people in." />
        <Card className="border-dashed">
          <p className="text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
            <strong className="font-semibold text-[var(--color-ink)]">
              The leaderboard is switched off.
            </strong>{" "}
            Ranking colleagues publicly is a decision for HR rather than something
            engineering should default to, so it stays off until someone turns it on. It
            works, and it runs on real referral data.
          </p>

          {admin ? (
            <p className="mt-4">
              <Link href="/admin/settings" className="btn-primary">
                Turn it on in settings
              </Link>
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-[var(--color-ink-3)]">
              Ask HR if you think it should be on.
            </p>
          )}
        </Card>
      </>
    );
  }

  const [rows, summary, since, me] = await Promise.all([
    leaderboard(period, 10),
    leaderboardSummary(period),
    historySince(),
    currentEmployee(),
  ]);
  const periodLabel = LEADERBOARD_PERIODS.find((p) => p.id === period)?.label ?? "";
  const top = rows[0]?.joined ?? 0;
  const racers: Racer[] = rows.slice(0, ON_TRACK).map((r) => ({
    key: r.person_key,
    name: r.name,
    unit: r.department,
    joined: r.joined,
    earned: r.earned,
    isYou: Boolean(me && r.person_key === me.id),
  }));

  return (
    <>
      <PageHead title="Leaderboard" lede="Who has brought the most people in." />

      {/* A GET form: filtering is navigation, so every view has a URL
          (convention 7). One filter row, above everything it scopes. */}
      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Period">
        {LEADERBOARD_PERIODS.map((p) => (
          <Link
            key={p.id}
            href={`/leaderboard?period=${p.id}`}
            scroll={false}
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

      <dl className="mb-4 grid grid-cols-[1fr_1fr_1.3fr] gap-2 sm:grid-cols-3 sm:gap-3">
        <Stat k="Referrals joined" v={summary.joined.toLocaleString("en-IN")} />
        <Stat k="Referrers" v={summary.people.toLocaleString("en-IN")} />
        <Stat k="Rewards earned" v={rupees(summary.earned)} />
      </dl>

      <section
        aria-label={`Race, ${periodLabel}`}
        className="overflow-hidden rounded-xl border border-[#2d3148] bg-[#121524] p-2 sm:p-3"
      >
        <RaceTrack racers={racers} periodLabel={periodLabel} />
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-2 pt-2 pb-1 text-[12.5px] text-[#b9bbcf]">
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
            <Key color="#c98500" label="Leader" />
            <Key color="#199e70" label="You" />
            <Key color="#8b90a8" label="Everyone else" />
          </ul>
          <p>Distance travelled is proportional to referrals that joined.</p>
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="card mt-4 p-10 text-center">
          <p className="text-[17px] font-medium">Nobody has crossed the line yet {periodLabel.toLowerCase()}</p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[14.5px] leading-relaxed text-[var(--color-ink-3)]">
            The board counts referrals who actually joined, not referrals made. The first
            person whose referral joins takes the lead.
          </p>
          <Link href="/roles" className="btn-primary mt-6">Browse open roles</Link>
        </div>
      ) : (
        // The table twin: every value on the track, readable without it.
        <div className="card mt-4 overflow-hidden">
          <table className="w-full text-left text-[14px]">
            <caption className="sr-only">Standings, {periodLabel}</caption>
            <thead className="border-b border-[var(--color-line)] text-[12px] text-[var(--color-ink-3)]">
              <tr>
                <th scope="col" className="w-12 px-4 py-2.5 font-medium">#</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Referrer</th>
                <th scope="col" className="hidden w-[34%] px-2 py-2.5 font-medium sm:table-cell">
                  <span className="sr-only">Share of the leader</span>
                </th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium">Joined</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Earned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const you = Boolean(me && r.person_key === me.id);
                return (
                  <tr
                    key={r.person_key}
                    className={`border-b border-[var(--color-line)] last:border-0 ${you ? "bg-[#e6f5ef]" : ""}`}
                  >
                    <td className="px-4 py-3 font-semibold tabular-nums text-[var(--color-ink-2)]">
                      {i === 0 ? <span aria-label="Leader">🏆</span> : i + 1}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[11.5px] font-semibold text-[var(--color-brand)]">
                          {initials(r.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {r.name}
                            {you && <span className="ml-1.5 rounded bg-[#199e70] px-1.5 py-0.5 text-[10.5px] font-semibold text-white">You</span>}
                          </span>
                          <span className="block truncate text-[12.5px] text-[var(--color-ink-3)]">{r.department ?? "—"}</span>
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-2 py-3 sm:table-cell" aria-hidden="true">
                      <div className="h-2 rounded-full bg-[var(--color-ground)]">
                        <div
                          className="h-2 rounded-full bg-[var(--color-brand)]"
                          style={{ width: `${top ? Math.max(4, (r.joined / top) * 100) : 0}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums">{r.joined}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--color-ink-2)]">{rupees(r.earned)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {summary.people > rows.length && (
            <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-[12.5px] text-[var(--color-ink-3)]">
              and {summary.people - rows.length} more {summary.people - rows.length === 1 ? "referrer" : "referrers"} {periodLabel.toLowerCase()}
            </p>
          )}
        </div>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Ranked on referrals who joined in the period, not referrals submitted — a
        programme that rewarded volume over judgement would fill the pipeline with noise.
        {since && (
          <>
            {" "}Includes referrals HR recorded before the Hub, from {shortDate(since)} on. Those
            count toward the board only; any reward for them was settled under the old
            process.
          </>
        )}
      </p>
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="card min-w-0 px-3 py-3 sm:px-4">
      <dt className="text-[12px] leading-snug text-[var(--color-ink-3)]">{k}</dt>
      {/* 16px on a phone: a third of 390px has to hold "₹6,95,000". */}
      <dd className="mt-0.5 text-[16px] font-semibold tracking-tight tabular-nums sm:text-[20px]">{v}</dd>
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="h-2.5 w-4 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {label}
    </li>
  );
}
