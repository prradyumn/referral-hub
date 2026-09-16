import Link from "next/link";
import { query } from "@/lib/db";
import { requireEmployee } from "@/lib/employees";
import { rupees, shortDate, initials } from "@/lib/format";

type Row = {
  id: string;
  ref_code: string;
  status: string;
  submitted_at: string;
  reward_amount_snapshot: number;
  relationship: string;
  candidate_name: string | null;
  job_title: string | null;
  job_location: string | null;
};

export default async function ReferralsPage() {
  const employee = await requireEmployee();

  let rows: Row[] = [];
  let error: string | null = null;
  try {
    // The `where r.referrer_id = $1` is the whole permission model for this page.
    // Row-level security used to guarantee it; now this clause does, and nothing
    // else will catch its absence. Do not remove it, and do not let a future
    // filter make it conditional.
    rows = await query<Row>(
      `select r.id, r.ref_code, r.status, r.submitted_at,
              r.reward_amount_snapshot, r.relationship,
              c.full_name as candidate_name,
              j.title     as job_title,
              j.location  as job_location
         from public.referrals r
         join public.candidates c on c.id = r.candidate_id
         join public.jobs       j on j.id = r.job_id
        where r.referrer_id = $1
        order by r.submitted_at desc`,
      [employee.id],
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">My referrals</h1>
          <p className="mt-1 text-[15px] text-[var(--color-ink-2)]">
            Everyone you have referred, and where they have reached.
          </p>
        </div>
        <Link href="/roles" className="btn-primary">
          Refer someone
        </Link>
      </div>

      {error && (
        <p className="card mb-5 border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4 text-[14px] text-[var(--color-danger)]">
          Could not load your referrals: {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[17px] font-medium">No referrals yet</p>
          <p className="mx-auto mt-2 max-w-[42ch] text-[14.5px] leading-relaxed text-[var(--color-ink-3)]">
            When you refer someone, they appear here with their stage, updated as
            Talent Acquisition moves them along.
          </p>
          <Link href="/roles" className="btn-primary mt-6">
            Browse open roles
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[13px] font-semibold text-[var(--color-brand)]">
                {initials(r.candidate_name ?? "?")}
              </span>

              <div className="min-w-[180px] flex-1">
                <p className="text-[15.5px] font-semibold leading-snug">
                  {r.candidate_name ?? "Candidate"}
                </p>
                <p className="text-[13px] text-[var(--color-ink-3)]">
                  {r.job_title ?? "Role"}
                  {r.job_location ? ` · ${r.job_location}` : ""} · {r.ref_code}
                </p>
              </div>

              <div className="text-right">
                <span className="pill bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                  {r.status === "submitted" ? "Referral submitted" : r.status}
                </span>
                <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-3)]">
                  Referred {shortDate(r.submitted_at)}
                </p>
              </div>

              <div className="text-right">
                <p className="text-[15px] font-semibold text-[var(--color-gold)]">
                  {rupees(r.reward_amount_snapshot)}
                </p>
                <p className="text-[12.5px] text-[var(--color-ink-3)]">if they join</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Stages will refresh from the recruitment system once that connection is live.
        Interview feedback and scores stay confidential and are never shown here.
      </p>
    </>
  );
}
