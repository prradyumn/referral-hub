import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { PageHead, Card } from "@/components/Chrome";
import AdminNav from "../AdminNav";
import RewardsTable from "./RewardsTable";
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
    // Short: it sits in a 150px table cell. The designation is on the band table above.
    label: `${b.track === "engineering" ? "Eng" : "Non-eng"} ${b.band} · ${
      b.amount_label ?? `₹${b.amount.toLocaleString("en-IN")}`
    }`,
    disabled: b.needs_clarification,
  }));
  const suggested = jobs.filter(
    (j) => j.band_source === "experience" && !j.reward_confirmed && j.reward_origin === "band",
  );

  const departments = [...new Set(jobs.map((j) => j.department))].sort();
  const pending = jobs.filter((j) => !j.reward_confirmed);

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
      {/* Folded by default: it changes rarely, and open it pushed the roles —
          the thing HR comes here for — two screens down. */}
      <details className="group card mt-2 p-0">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-[15px] font-semibold">Band table</span>
            <span className="block text-[12.5px] text-[var(--color-ink-3)]">
              {bandRows.length} bands · edit an amount to re-price every role in that band
            </span>
          </span>
          <span aria-hidden="true" className="text-[var(--color-ink-3)] transition group-open:rotate-180">▾</span>
        </summary>
        <div className="border-t border-[var(--color-line)] p-5">
      <p className="mb-3 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Every open role takes its band&apos;s reward automatically. Where the title names a
        designation, the band comes from the title; where it does not, from the experience
        the role asks for. Those are marked “from experience” below — move any that are
        wrong and they keep your choice from then on.
      </p>
      <BandTable rows={bandRows} />
        </div>
      </details>

      {suggested.length > 0 && (
        <Card className="mt-4 mb-6">
          <p className="mb-3 text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            <strong className="font-semibold text-[var(--color-ink)]">
              {suggested.length} roles have a band suggested from experience.
            </strong>{" "}
            Filter by “From experience” below to check them, correct any that are wrong, then
            confirm the rest in one go.
          </p>
          <ConfirmSuggested count={suggested.length} />
        </Card>
      )}

      <h2 className="mt-6 mb-2 text-[15px] font-semibold">Roles</h2>
      <DepartmentBulk departments={departments} />

      <RewardsTable jobs={jobs} bands={bandOptions} initialDept={sp.dept} initialShow={sp.show} />

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Changing a reward here never alters a referral already submitted. Each referral
        snapshots the figure that applied the moment it was made (CONTEXT.md convention
        3), so a revision only affects referrals made from now on.
      </p>
    </>
  );
}
