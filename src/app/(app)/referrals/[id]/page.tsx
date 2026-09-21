import Link from "next/link";
import { notFound } from "next/navigation";
import { queryOne } from "@/lib/db";
import { currentEmployee, requireSignedInUser } from "@/lib/employees";
import { visibleJourney } from "@/lib/keka/stages";
import { rewardLabel, shortDate } from "@/lib/format";
import { Card, PageHead } from "@/components/Chrome";

type Detail = {
  id: string;
  ref_code: string;
  relationship: string;
  submitted_at: string;
  valid_until: string;
  current_stage: string | null;
  reward_amount_snapshot: number;
  eligibility_days_snapshot: number;
  reward_confirmed_snapshot: boolean;
  consent_text: string;
  consent_at: string;
  candidate_name: string;
  candidate_org: string | null;
  candidate_designation: string | null;
  job_title: string;
  job_department: string;
  job_location: string;
};

export default async function ReferralDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSignedInUser();
  const { id } = await params;

  const employee = await currentEmployee();
  if (!employee) notFound();

  // `and r.referrer_id = $2` is the permission check. There is no RLS beneath
  // it (§6): without this clause any signed-in employee could read any
  // referral by guessing a URL. Never relax it to a lookup by id alone.
  const referral = await queryOne<Detail>(
    `select r.id, r.ref_code, r.relationship, r.submitted_at, r.valid_until,
            r.current_stage, r.reward_amount_snapshot, r.eligibility_days_snapshot,
            r.consent_text, r.consent_at,
            r.reward_confirmed_snapshot,
            c.full_name           as candidate_name,
            c.current_org         as candidate_org,
            c.current_designation as candidate_designation,
            j.title      as job_title,
            j.department as job_department,
            j.location   as job_location
       from referrals r
       join candidates c on c.id = r.candidate_id
       join jobs       j on j.id = r.job_id
      where r.id = $1
        and r.referrer_id = $2`,
    [id, employee.id],
  );

  // Deliberately a 404 rather than a 403: telling someone a referral exists
  // but is not theirs is itself a disclosure.
  if (!referral) notFound();

  const journey = await visibleJourney(referral.id);

  return (
    <>
      <Link
        href="/referrals"
        className="mb-4 inline-block text-[13px] text-[var(--color-ink-3)] hover:underline"
      >
        ← My referrals
      </Link>

      <PageHead
        title={referral.candidate_name}
        lede={`${referral.job_title} · ${referral.job_department} · ${referral.job_location}`}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-1 text-[15px] font-semibold">Journey</h2>
          <p className="mb-5 text-[13px] text-[var(--color-ink-3)]">
            Updated from Keka. Stages the recruitment team keeps internal are not shown.
          </p>

          <ol className="relative border-l border-[var(--color-line)] pl-5">
            {journey.map((step, i) => {
              const isLatest = i === journey.length - 1;
              return (
                <li key={`${step.stage}-${step.occurred_at}`} className="relative pb-5 last:pb-0">
                  <span
                    className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                      isLatest
                        ? "bg-[var(--color-brand)] ring-4 ring-[var(--color-brand-soft)]"
                        : "bg-[var(--color-good)]"
                    }`}
                    aria-hidden="true"
                  />
                  <p className="text-[14.5px] font-medium leading-snug">
                    {step.wording ?? step.stage}
                  </p>
                  <p className="text-[12.5px] text-[var(--color-ink-3)]">
                    {shortDate(step.occurred_at)}
                  </p>
                </li>
              );
            })}
          </ol>

          {journey.length <= 1 && (
            <p className="mt-4 rounded-md bg-[var(--color-ground)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              Nothing has moved yet. This updates automatically as Talent Acquisition
              works through the shortlist — you do not need to chase anyone.
            </p>
          )}
        </Card>

        <div className="grid gap-4">
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold">Referral</h2>
            <dl className="grid gap-2.5 text-[13.5px]">
              <Row k="Reference" v={referral.ref_code} />
              <Row k="Referred on" v={shortDate(referral.submitted_at)} />
              <Row k="How you know them" v={referral.relationship} />
              {referral.candidate_org && (
                <Row
                  k="Currently at"
                  v={
                    referral.candidate_designation
                      ? `${referral.candidate_designation}, ${referral.candidate_org}`
                      : referral.candidate_org
                  }
                />
              )}
              <Row k="Valid until" v={shortDate(referral.valid_until)} />
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-[15px] font-semibold">Reward</h2>
            <dl className="grid gap-2.5 text-[13.5px]">
              <Row
                k="If they join"
                v={rewardLabel(referral.reward_amount_snapshot, referral.reward_confirmed_snapshot)}
              />
              <Row
                k="Eligible after"
                v={`${referral.eligibility_days_snapshot} days from joining`}
              />
            </dl>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
              {referral.reward_confirmed_snapshot
                ? "Paid through payroll, so income tax applies. The amount shown is gross."
                : "The reward for this role has not been confirmed yet. It is locked in at " +
                  "the moment you referred, so it cannot be reduced afterwards."}
            </p>
          </Card>

          <Card>
            <h2 className="mb-2 text-[15px] font-semibold">Consent on record</h2>
            <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
              “{referral.consent_text}”
            </p>
            <p className="mt-2 text-[12px] text-[var(--color-ink-3)]">
              Confirmed {shortDate(referral.consent_at)}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[var(--color-ink-3)]">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
