import { requireSignedInUser } from "@/lib/employees";
import { rupees, shortDate } from "@/lib/format";
import { homeStats, latestUpdate, leaderboard, nextMilestone } from "@/lib/showcase";
import { Card, PageHead, PreviewTag, QuietLink, StatGroup } from "@/components/Chrome";

export default async function HomePage() {
  const user = await requireSignedInUser();
  const firstName = user.name.split(/[\s.]+/)[0];
  const top3 = leaderboard.monthly;
  const pct = Math.round((nextMilestone.achieved / nextMilestone.target) * 100);

  return (
    <>
      <PageHead
        title={`Hello, ${firstName[0].toUpperCase() + firstName.slice(1)}`}
        lede="Where your referrals have reached, and what they are worth."
      />

      {/* Referrals · Cash · Gifts — the three groups HR asked for */}
      <div className="mb-3 flex items-center gap-2.5">
        <h2 className="text-[13px] font-medium tracking-wide text-[var(--color-ink-3)] uppercase">
          Your programme
        </h2>
        <PreviewTag />
      </div>

      {/* Cash takes two columns: three rupee figures wrap at a third of the row. */}
      <div className="grid gap-3 lg:grid-cols-4">
        <StatGroup
          heading="Referrals"
          accent="var(--color-brand)"
          items={[
            { value: String(homeStats.referrals.made), label: "Referred" },
            { value: String(homeStats.referrals.joined), label: "Joined" },
            { value: String(homeStats.referrals.inProgress), label: "In progress" },
          ]}
        />
        <StatGroup
          heading="Cash"
          className="lg:col-span-2"
          accent="var(--color-gold)"
          items={[
            { value: rupees(homeStats.cash.accumulated), label: "Accumulated" },
            { value: rupees(homeStats.cash.collected), label: "Collected" },
            { value: rupees(homeStats.cash.toReceive), label: "To be received" },
          ]}
        />
        <StatGroup
          heading="Gifts"
          accent="var(--color-mint)"
          items={[
            { value: String(homeStats.gifts.earned), label: "Earned" },
            { value: String(homeStats.gifts.inProcess), label: "In process" },
          ]}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {/* Latest status — the "XXX joined, this much to receive" line */}
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-[var(--color-ink-2)]">Latest update</p>
            <PreviewTag />
          </div>
          <div className="flex items-start gap-3.5">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-good-soft)] text-[15px] text-[var(--color-good)]"
              aria-hidden="true"
            >
              ✓
            </span>
            <div className="min-w-0">
              <p className="text-[15.5px] font-semibold leading-snug">{latestUpdate.headline}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-ink-2)]">
                {latestUpdate.detail}
              </p>
              <p className="mt-2 text-[12.5px] text-[var(--color-ink-3)]">
                {shortDate(latestUpdate.on)}
              </p>
            </div>
          </div>
          <div className="mt-5 border-t border-[var(--color-line)] pt-4">
            <QuietLink href="/referrals">See all your referrals →</QuietLink>
          </div>
        </Card>

        {/* Next milestone */}
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-[var(--color-ink-2)]">Next milestone</p>
            <PreviewTag />
          </div>
          <p className="text-[17px] font-semibold">{nextMilestone.name}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            {nextMilestone.blurb}
          </p>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-ground)]"
            role="progressbar"
            aria-valuenow={nextMilestone.achieved}
            aria-valuemin={0}
            aria-valuemax={nextMilestone.target}
            aria-label={`${nextMilestone.achieved} of ${nextMilestone.target} joined`}
          >
            <div
              className="h-full rounded-full bg-[var(--color-mint)] transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-[12.5px] text-[var(--color-ink-3)]">
            {nextMilestone.achieved} of {nextMilestone.target} joined
          </p>
          <div className="mt-4 border-t border-[var(--color-line)] pt-4">
            <QuietLink href="/rewards">All rewards and gifts →</QuietLink>
          </div>
        </Card>
      </div>

      {/* Top 3 — HR noted the leaderboard could also live here */}
      <Card className="mt-3">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-[var(--color-ink-2)]">
            Top referrers this month
          </p>
          <PreviewTag />
        </div>
        <ol className="grid gap-2 sm:grid-cols-3">
          {top3.map((p, i) => (
            <li
              key={p.name}
              className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] px-3.5 py-3"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                  i === 0
                    ? "bg-[var(--color-gold-soft)] text-[var(--color-gold)]"
                    : "bg-[var(--color-ground)] text-[var(--color-ink-3)]"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{p.name}</span>
                <span className="block truncate text-[12px] text-[var(--color-ink-3)]">
                  {p.joined} joined · {rupees(p.earned)}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-4 border-t border-[var(--color-line)] pt-4">
          <QuietLink href="/leaderboard">Full leaderboard →</QuietLink>
        </div>
      </Card>
    </>
  );
}
