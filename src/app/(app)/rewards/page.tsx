import { requireSignedInUser } from "@/lib/employees";
import { rupees } from "@/lib/format";
import { homeStats, milestones, nextMilestone, rewards } from "@/lib/showcase";
import { Card, PageHead, ShowcaseNotice, StatGroup } from "@/components/Chrome";

const TONE: Record<string, string> = {
  Paid: "bg-[var(--color-good-soft)] text-[var(--color-good)]",
  "Approved, in payroll": "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
  "Eligible from": "bg-[var(--color-gold-soft)] text-[var(--color-gold)]",
  "Pending joining": "bg-[var(--color-ground)] text-[var(--color-ink-3)]",
};

export default async function RewardsPage() {
  await requireSignedInUser();
  const pct = Math.round((nextMilestone.achieved / nextMilestone.target) * 100);

  return (
    <>
      <PageHead
        title="My rewards"
        lede="Every reward you have earned, and where each one has reached."
        preview
      />

      <ShowcaseNotice phase="Phase 1 for cash, Phase 2 for gifts">
        This screen is a design, agreed before it is wired up. The figures below are
        illustrative. Once the payroll and eligibility engines are live it will show your
        real rewards, with the same layout.
      </ShowcaseNotice>

      <div className="grid gap-3 lg:grid-cols-2">
        <StatGroup
          heading="Cash"
          accent="var(--color-gold)"
          items={[
            { value: rupees(homeStats.cash.accumulated), label: "Accumulated" },
            { value: rupees(homeStats.cash.collected), label: "Collected" },
            { value: rupees(homeStats.cash.toReceive), label: "To be received" },
          ]}
        />

        <Card>
          <p className="mb-4 text-[13px] font-medium text-[var(--color-ink-2)]">
            Milestone gifts
          </p>
          <div
            className="h-2 overflow-hidden rounded-full bg-[var(--color-ground)]"
            role="progressbar"
            aria-valuenow={nextMilestone.achieved}
            aria-valuemin={0}
            aria-valuemax={nextMilestone.target}
            aria-label={`${nextMilestone.achieved} of ${nextMilestone.target} referrals joined`}
          >
            <div
              className="h-full rounded-full bg-[var(--color-mint)]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <ul className="mt-4 grid gap-2">
            {milestones.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                      m.unlocked
                        ? "bg-[var(--color-mint-soft)] text-[var(--color-mint)]"
                        : "bg-[var(--color-ground)] text-[var(--color-ink-3)]"
                    }`}
                    aria-hidden="true"
                  >
                    {m.unlocked ? "✓" : "○"}
                  </span>
                  <span className="text-[14px] font-medium">{m.name}</span>
                </span>
                <span className="text-[12.5px] text-[var(--color-ink-3)]">
                  {m.at} {m.at === 1 ? "joiner" : "joiners"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-[13px] font-medium tracking-wide text-[var(--color-ink-3)] uppercase">
        Reward tracking
      </h2>

      <ul className="grid gap-3">
        {rewards.map((r) => (
          <li key={r.id} className="card flex flex-wrap items-center gap-4 p-5">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] ${
                r.kind === "gift"
                  ? "bg-[var(--color-mint-soft)] text-[var(--color-mint)]"
                  : "bg-[var(--color-gold-soft)] text-[var(--color-gold)]"
              }`}
              aria-hidden="true"
            >
              {r.kind === "gift" ? "🎁" : "₹"}
            </span>

            <div className="min-w-[180px] flex-1">
              <p className="text-[15.5px] font-semibold leading-snug">{r.candidate}</p>
              <p className="text-[13px] text-[var(--color-ink-3)]">
                {r.role} · {r.id}
              </p>
            </div>

            <div className="min-w-[180px] flex-1">
              <span className={`pill ${TONE[r.status] ?? TONE["Pending joining"]}`}>
                {r.status}
              </span>
              <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-3)]">{r.note}</p>
            </div>

            <div className="text-right">
              <p className="text-[15px] font-semibold text-[var(--color-gold)]">
                {rupees(r.amount)}
              </p>
              <p className="text-[12.5px] text-[var(--color-ink-3)]">
                {r.kind === "gift" ? "gift value" : "gross"}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Cash rewards are paid through payroll and are taxable salary income. Amounts shown are
        gross, before TDS. Your payslip is the record of what was actually paid.
      </p>
    </>
  );
}
