import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { PageHead, Card } from "@/components/Chrome";
import AdminNav from "../AdminNav";
import RewardRow from "./RewardRow";
import DepartmentBulk from "./DepartmentBulk";
import BandTable, { ConfirmSuggested, type BandRow } from "./BandTable";

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
  track: string | null;
  band: string | null;
  band_source: string | null;
  reward_origin: string;
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
            j.track, j.band, j.band_source, j.reward_origin,
            (select count(*) from referrals r where r.job_id = j.id) as referral_count
       from jobs j
      where j.is_open
      order by j.reward_confirmed, j.department, j.title`,
  );

  const bandRows = await query<BandRow>(
    `select b.track, b.band, b.designation, b.amount, b.amount_label, b.needs_clarification,
            (select count(*)::int from jobs j
              where j.is_open and j.track = b.track and j.band = b.band) as roles
       from reward_bands b
      order by b.sort_order`,
  );
  const bandOptions = bandRows.map((b) => ({
    value: `${b.track}:${b.band}`,
    label: `${b.track === "engineering" ? "Eng" : "Non-eng"} ${b.band} — ${b.designation} — ${
      b.amount_label ?? `₹${b.amount.toLocaleString("en-IN")}`
    }`,
    disabled: b.needs_clarification,
  }));
  const suggested = jobs.filter(
    (j) => j.band_source === "experience" && !j.reward_confirmed && j.reward_origin === "band",
  );

  const departments = [...new Set(jobs.map((j) => j.department))].sort();
  const pending = jobs.filter((j) => !j.reward_confirmed);

  const shown = jobs.filter((j) => {
    if (sp.dept && j.department !== sp.dept) return false;
    if (sp.show === "pending" && j.reward_confirmed) return false;
    if (sp.show === "review" && j.band_source !== "experience") return false;
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

      {/* HR's band table. Each open role is placed in a band and takes its
          reward from here; changing a row re-prices every role that follows it. */}
      <h2 className="mt-2 mb-2 text-[15px] font-semibold">Band table</h2>
      <p className="mb-3 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Every open role takes its band&apos;s reward automatically. Where the title names a
        designation, the band comes from the title; where it does not, from the experience
        the role asks for. Those are marked “from experience” below — move any that are
        wrong and they keep your choice from then on.
      </p>
      <BandTable rows={bandRows} />

      {suggested.length > 0 && (
        <Card className="mt-4 mb-6">
          <p className="mb-3 text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            <strong className="font-semibold text-[var(--color-ink)]">
              {suggested.length} roles have a band suggested from experience.
            </strong>{" "}
            Filter by “Band suggested” below to check them, correct any that are wrong, then
            confirm the rest in one go.
          </p>
          <ConfirmSuggested count={suggested.length} />
        </Card>
      )}

      <h2 className="mt-6 mb-2 text-[15px] font-semibold">Roles</h2>
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
            <option value="review">Band from experience</option>
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
          <RewardRow key={job.id} job={job} bands={bandOptions} />
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
