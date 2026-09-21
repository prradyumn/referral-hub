import Link from "next/link";
import { currentEmployee, requireSignedInUser } from "@/lib/employees";
import {
  employeeRewards, rewardTotals, milestoneProgress, describeReward,
} from "@/lib/rewards";
import { rupees, shortDate } from "@/lib/format";
import { PageHead, Card } from "@/components/Chrome";

export default async function RewardsPage() {
  await requireSignedInUser();
  const employee = await currentEmployee();

  if (!employee) {
    return (
      <>
        <PageHead title="My rewards" lede="What you have earned, and what is still to come." />
        <Card className="border-dashed">
          <p className="text-[14px] text-[var(--color-ink-2)]">
            Rewards cannot be read until the database is reachable.
          </p>
        </Card>
      </>
    );
  }

  const [rows, totals, milestones] = await Promise.all([
    employeeRewards(employee.id),
    rewardTotals(employee.id),
    milestoneProgress(employee.id),
  ]);

  return (
    <>
      <PageHead
        title="My rewards"
        lede="What you have earned, and what is still to come."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-[24px] font-semibold leading-tight text-[var(--color-gold)]">
            {rupees(totals.earned_total)}
          </p>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-3)]">earned so far</p>
        </Card>
        <Card className="text-center">
          <p className="text-[24px] font-semibold leading-tight">{rupees(totals.paid_total)}</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-3)]">paid to you</p>
        </Card>
        <Card className="text-center">
          <p className="text-[24px] font-semibold leading-tight">{rupees(totals.awaiting_total)}</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-3)]">still to come</p>
        </Card>
      </div>

      {/* Milestones ------------------------------------------------- */}
      <Card className="mb-6">
        <h2 className="mb-1 text-[15px] font-semibold">Milestone gifts</h2>
        <p className="mb-4 text-[13px] text-[var(--color-ink-3)]">
          {milestones.joined === 0
            ? "Counted on referrals who join, not referrals made."
            : `${milestones.joined} ${milestones.joined === 1 ? "person has" : "people have"} joined through you.`}
        </p>

        <ul className="grid gap-2 sm:grid-cols-3">
          {milestones.tiers.map((t) => (
            <li
              key={t.name}
              className={`rounded-md border p-3 ${
                t.unlocked
                  ? "border-[var(--color-good)] bg-[var(--color-good-soft,#e7f6ec)]"
                  : "border-[var(--color-line)]"
              }`}
            >
              <p className="text-[14px] font-medium">{t.name}</p>
              <p className="text-[12.5px] text-[var(--color-ink-3)]">
                {t.threshold} {t.threshold === 1 ? "referral joins" : "referrals join"}
              </p>
              <p className="mt-1.5 text-[12px] font-medium">
                {t.unlocked ? (
                  <span className="text-[var(--color-good)]">Unlocked</span>
                ) : (
                  <span className="text-[var(--color-ink-3)]">
                    {t.threshold - milestones.joined} to go
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>

        {/* Gift fulfilment is Phase 2. Saying so is better than implying a
            watch is on its way when nothing has been dispatched. */}
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
          Unlocking a tier is tracked here. Ordering and delivery of the gift itself is
          handled by HR and is not yet managed in the Hub.
        </p>
      </Card>

      {/* The ledger -------------------------------------------------- */}
      <h2 className="mb-3 text-[15px] font-semibold">Every referral</h2>

      {rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[17px] font-medium">Nothing yet</p>
          <p className="mx-auto mt-2 max-w-[44ch] text-[14.5px] leading-relaxed text-[var(--color-ink-3)]">
            When someone you refer joins, the reward and its qualifying period appear
            here, with the date it becomes payable.
          </p>
          <Link href="/roles" className="btn-primary mt-6">Browse open roles</Link>
        </div>
      ) : (
        <ul className="grid gap-2">
          {rows.map((r) => {
            const d = describeReward(r);
            return (
              <li key={r.referral_id} className="card flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-[200px] flex-1">
                  <p className="text-[14.5px] font-semibold leading-snug">
                    <Link href={`/referrals/${r.referral_id}`} className="hover:underline">
                      {r.candidate_name}
                    </Link>
                  </p>
                  <p className="text-[12.5px] text-[var(--color-ink-3)]">
                    {r.job_title} · {r.ref_code}
                  </p>
                </div>

                <div className="min-w-[170px]">
                  <span className="pill bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                    {d.label}
                  </span>
                  <p className="mt-1 text-[12px] text-[var(--color-ink-3)]">{d.note}</p>
                </div>

                <div className="text-right">
                  <p
                    className={
                      r.reward_confirmed
                        ? "text-[15px] font-semibold text-[var(--color-gold)]"
                        : "text-[13px] font-medium text-[var(--color-ink-3)]"
                    }
                  >
                    {r.reward_confirmed ? rupees(r.amount) : "To be confirmed"}
                  </p>
                  {r.joined_at && (
                    <p className="text-[12px] text-[var(--color-ink-3)]">
                      joined {shortDate(r.joined_at)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Rewards are paid through payroll and are taxable salary income — amounts shown are
        gross, before tax. Payment is recorded here by HR; the Hub is not yet connected to
        payroll directly.
      </p>
    </>
  );
}
