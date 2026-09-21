import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { allRewards, rewardExceptions } from "@/lib/rewards";
import { rupees, shortDate } from "@/lib/format";
import { PageHead, Card } from "@/components/Chrome";
import AdminNav from "../AdminNav";
import { ApproveButton, MarkPaidForm } from "./RewardActions";

const STATUS_LABEL: Record<string, string> = {
  pending_joining: "Qualifying period",
  eligible: "Eligible — needs approval",
  approved: "Approved — needs paying",
  paid: "Paid",
  forfeited: "Not payable",
};

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const [rewards, exceptions] = await Promise.all([
    allRewards(sp.status),
    rewardExceptions(),
  ]);

  const counts = rewards.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <AdminNav current="/admin/pipeline" />
      <PageHead
        title="Reward pipeline"
        lede="Every reward owed, from the moment someone joins to the moment it is paid."
      />

      {/* Convention 10 and §12's reconciliation checks: the counts here must
          reconcile to the detail below, and anything stuck is surfaced rather
          than waited on. */}
      {exceptions.length > 0 && (
        <Card className="mb-6 border-[var(--color-gold)] bg-[var(--color-gold-soft)]">
          <p className="mb-2 text-[14px] font-semibold">
            {exceptions.length} thing{exceptions.length === 1 ? "" : "s"} need attention
          </p>
          <ul className="grid gap-1 text-[13px] text-[var(--color-ink-2)]">
            {exceptions.map((x) => (
              <li key={`${x.kind}-${x.referral_id}`}>
                <strong>{x.kind}</strong> — {x.ref_code} · {x.detail}{" "}
                <Link href={`/referrals/${x.referral_id}`} className="underline">
                  open
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="field">
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-ghost mb-0.5">Apply</button>
        <p className="mb-2.5 ml-auto text-[12.5px] text-[var(--color-ink-3)]">
          {Object.entries(counts).map(([k, n]) => `${STATUS_LABEL[k] ?? k}: ${n}`).join(" · ") ||
            "nothing yet"}
        </p>
      </form>

      {rewards.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-[15px] font-medium">No rewards yet</p>
          <p className="mx-auto mt-2 max-w-[48ch] text-[13.5px] leading-relaxed text-[var(--color-ink-3)]">
            A reward appears the moment a referred candidate reaches the{" "}
            <strong>Hired</strong> stage in Keka. Nothing is created before that, because
            until somebody joins nothing is owed.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {rewards.map((r) => (
            <li key={r.reward_id} className="card p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-[200px] flex-1">
                  <p className="text-[14.5px] font-semibold leading-snug">
                    <Link href={`/referrals/${r.referral_id}`} className="hover:underline">
                      {r.candidate_name}
                    </Link>
                  </p>
                  <p className="text-[12.5px] text-[var(--color-ink-3)]">
                    {r.job_title} · {r.ref_code} · referred by{" "}
                    {r.referrer_name ?? r.referrer_email}
                  </p>
                </div>

                <div className="min-w-[150px]">
                  <span className="pill bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  <p className="mt-1 text-[12px] text-[var(--color-ink-3)]">
                    {r.status === "pending_joining" && r.eligible_from
                      ? `Eligible ${shortDate(r.eligible_from)}`
                      : r.joined_at
                        ? `Joined ${shortDate(r.joined_at)}`
                        : ""}
                  </p>
                </div>

                <div className="w-[110px] text-right">
                  <p
                    className={
                      r.reward_confirmed
                        ? "text-[15px] font-semibold text-[var(--color-gold)]"
                        : "text-[13px] font-medium text-[var(--color-ink-3)]"
                    }
                  >
                    {r.reward_confirmed ? rupees(r.amount) : "Not agreed"}
                  </p>
                </div>
              </div>

              {(r.status === "eligible" || r.status === "approved") && (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--color-line)] pt-3">
                  {r.status === "eligible" && r.reward_id && (
                    <ApproveButton rewardId={r.reward_id} />
                  )}
                  {r.status === "approved" && r.reward_id && (
                    <MarkPaidForm rewardId={r.reward_id} />
                  )}
                  {r.status === "eligible" && !r.reward_confirmed && (
                    <p className="text-[12.5px] text-[var(--color-ink-3)]">
                      This role had no agreed reward when the referral was made — set one
                      on the Rewards tab before approving.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Rewards become eligible automatically once the qualifying period is complete.
        Approving is deliberately manual and recorded against your name. Payment is
        recorded by hand until the Keka key is granted payroll access.
      </p>
    </>
  );
}
