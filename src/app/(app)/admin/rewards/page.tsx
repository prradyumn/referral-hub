import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { PageHead, Card } from "@/components/Chrome";
import AdminNav from "../AdminNav";
import RewardRow from "./RewardRow";
import DepartmentBulk from "./DepartmentBulk";

type Job = {
  id: string;
  req_id: string;
  title: string;
  department: string;
  location: string;
  reward_amount: number;
  eligibility_days: number;
  is_priority: boolean;
  reward_confirmed: boolean;
  referral_count: number;
};

export default async function AdminRewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; show?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const jobs = await query<Job>(
    `select j.id, j.req_id, j.title, j.department, j.location,
            j.reward_amount, j.eligibility_days, j.is_priority, j.reward_confirmed,
            (select count(*) from referrals r where r.job_id = j.id) as referral_count
       from jobs j
      where j.is_open
      order by j.reward_confirmed, j.department, j.title`,
  );

  const departments = [...new Set(jobs.map((j) => j.department))].sort();
  const pending = jobs.filter((j) => !j.reward_confirmed);

  const shown = jobs.filter((j) => {
    if (sp.dept && j.department !== sp.dept) return false;
    if (sp.show === "pending" && j.reward_confirmed) return false;
    if (sp.show === "confirmed" && !j.reward_confirmed) return false;
    return true;
  });

  return (
    <>
      <AdminNav current="/admin/rewards" />
      <PageHead
        title="Referral rewards"
        lede="Keka has no concept of a referral reward, so every role it sends arrives without one. Set them here."
      />

      {pending.length > 0 && (
        <Card className="mb-6 border-[var(--color-gold)] bg-[var(--color-gold-soft)]">
          <p className="text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            <strong className="font-semibold text-[var(--color-ink)]">
              {pending.length} of {jobs.length} open roles have no confirmed reward.
            </strong>{" "}
            Until one is set, those roles show employees “To be confirmed” rather than a
            figure — the Hub will not display an amount nobody has agreed to. Referrals
            can still be submitted; the amount is locked in at submission either way.
          </p>
        </Card>
      )}

      <DepartmentBulk departments={departments} />

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="dept" className="label">Department</label>
          <select id="dept" name="dept" defaultValue={sp.dept ?? ""} className="field">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="show" className="label">Show</label>
          <select id="show" name="show" defaultValue={sp.show ?? ""} className="field">
            <option value="">All roles</option>
            <option value="pending">Needs a reward</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
        <button type="submit" className="btn-ghost mb-0.5">Apply</button>
      </form>

      <p className="mb-3 text-[13px] text-[var(--color-ink-3)]">
        {shown.length} of {jobs.length} open roles
      </p>

      <div className="grid gap-2">
        {shown.map((job) => (
          <RewardRow key={job.id} job={job} />
        ))}
      </div>

      {shown.length === 0 && (
        <div className="card p-10 text-center text-[14px] text-[var(--color-ink-3)]">
          No roles match those filters.
        </div>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Changing a reward here never alters a referral already submitted. Each referral
        snapshots the figure that applied the moment it was made (CONTEXT.md convention
        3), so a revision only affects referrals made from now on.
      </p>
    </>
  );
}
