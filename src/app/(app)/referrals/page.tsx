import Link from "next/link";
import { query } from "@/lib/db";
import { currentEmployee, requireSignedInUser } from "@/lib/employees";
import { rupees, shortDate, initials } from "@/lib/format";
import { referralJourney } from "@/lib/showcase";
import { Card, PageHead, PreviewTag } from "@/components/Chrome";

type Row = {
  id: string;
  ref_code: string;
  status: string;
  submitted_at: string;
  reward_amount_snapshot: number;
  candidate_name: string | null;
  job_title: string | null;
  job_location: string | null;
};

/**
 * The dated journey the CSV asks for. Phase 1 fills it from referral_stages.
 *
 * The first stage uses the referral's real submitted_at — the rest are
 * illustrative offsets from it. Showing a fixed date for every row made a card
 * contradict its own "Referred on" line.
 */
function Journey({ submittedAt }: { submittedAt: string }) {
  const start = new Date(submittedAt);
  const offsetDays = [0, 4, 12];

  const stages = referralJourney.map((s, i) => {
    if (s.state === "upcoming") return { ...s, on: null };
    const d = new Date(start);
    d.setDate(d.getDate() + (offsetDays[i] ?? 0));
    return { ...s, on: d.toISOString() };
  });

  return (
    <ol className="mt-4 flex flex-wrap gap-x-1 gap-y-3 border-t border-[var(--color-line)] pt-4">
      {stages.map((s, i) => (
        <li key={s.stage} className="flex min-w-[128px] flex-1 flex-col gap-1.5">
          <span className="flex items-center gap-1" aria-hidden="true">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                s.state === "done"
                  ? "bg-[var(--color-good)]"
                  : s.state === "current"
                    ? "bg-[var(--color-brand)] ring-4 ring-[var(--color-brand-soft)]"
                    : "border border-[var(--color-line)] bg-white"
              }`}
            />
            {i < stages.length - 1 && (
              <span
                className={`h-px flex-1 ${
                  s.state === "done" ? "bg-[var(--color-good)]" : "bg-[var(--color-line)]"
                }`}
              />
            )}
          </span>
          <span
            className={`text-[12.5px] leading-tight ${
              s.state === "upcoming"
                ? "text-[var(--color-ink-3)]"
                : "font-medium text-[var(--color-ink)]"
            }`}
          >
            {s.stage}
          </span>
          <span className="text-[11.5px] text-[var(--color-ink-3)]">
            {s.on ? shortDate(s.on) : "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function ReferralsPage() {
  await requireSignedInUser();

  const employee = await currentEmployee();
  let rows: Row[] = [];
  let dbDown = employee === null;

  if (employee) {
    try {
      // `where referrer_id = $1` is the whole permission model for this page.
      // Row-level security used to guarantee it; now this clause does, and
      // nothing else will catch its absence.
      rows = await query<Row>(
        `select r.id, r.ref_code, r.status, r.submitted_at, r.reward_amount_snapshot,
                c.full_name as candidate_name,
                j.title     as job_title,
                j.location  as job_location
           from referrals r
           join candidates c on c.id = r.candidate_id
           join jobs       j on j.id = r.job_id
          where r.referrer_id = $1
          order by r.submitted_at desc`,
        [employee.id],
      );
    } catch {
      dbDown = true;
    }
  }

  return (
    <>
      <PageHead
        title="My referrals"
        lede="Everyone you have referred, and where they have reached."
      />

      {dbDown && (
        <Card className="mb-6 border-dashed">
          <p className="text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            <strong className="font-semibold text-[var(--color-ink)]">
              No database connected.
            </strong>{" "}
            Sign-in works, but referrals cannot be read or written until{" "}
            <code className="rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[13px]">
              DATABASE_URL
            </code>{" "}
            is set and <code className="rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[13px]">db/0001_schema.sql</code> has been applied.
          </p>
        </Card>
      )}

      {rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[17px] font-medium">No referrals yet</p>
          <p className="mx-auto mt-2 max-w-[42ch] text-[14.5px] leading-relaxed text-[var(--color-ink-3)]">
            When you refer someone, they appear here with every stage, updated as Talent
            Acquisition moves them along.
          </p>
          <Link href="/roles" className="btn-primary mt-6">
            Browse open roles
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-4">
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
              </div>

              <div className="mt-2 flex justify-end">
                <PreviewTag label="Stages are illustrative" />
              </div>
              <Journey submittedAt={r.submitted_at} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Stages refresh from the recruitment system once that connection is live. Interview
        feedback and scores stay confidential and are never shown here.
      </p>
    </>
  );
}
