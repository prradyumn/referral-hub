import Link from "next/link";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { rupees, shortDate } from "@/lib/format";
import { PageHead, Card } from "@/components/Chrome";
import AdminNav from "../AdminNav";
import { CopyDetails, MarkAdded } from "./InboxActions";

type Row = {
  id: string;
  ref_code: string;
  submitted_at: string;
  relationship: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  current_org: string | null;
  current_designation: string | null;
  linkedin_url: string | null;
  job_title: string;
  req_id: string;
  keka_job_id: string | null;
  referrer_name: string | null;
  referrer_email: string;
  reward: number;
  reward_confirmed: boolean;
  ta_added_at: string | null;
  keka_last_seen_at: string | null;
  cv_name: string | null;
  cv_size: number | null;
  cv_scanned_at: string | null;
};

/**
 * Every referral made in the Hub, waiting for a recruiter.
 *
 * Referrals cannot be pushed into Keka automatically yet — every Keka job
 * requires salary fields the form does not collect, and §9 says it should
 * not. So the handoff is a person: TA copies the candidate into Keka and
 * marks it here. Once Keka has them, the stage sync finds them by email and
 * the employee's tracking runs on its own ("Found in Keka").
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const show = sp.show === "done" ? "done" : "waiting";

  const rows = await query<Row>(
    `select r.id, r.ref_code, r.submitted_at, r.relationship,
            c.full_name as candidate_name, c.email_normalised as candidate_email,
            c.phone_e164 as candidate_phone, c.current_org, c.current_designation, c.linkedin_url,
            j.title as job_title, j.req_id, j.keka_job_id,
            e.full_name as referrer_name, e.email as referrer_email,
            r.reward_amount_snapshot as reward, r.reward_confirmed_snapshot as reward_confirmed,
            r.ta_added_at, r.keka_last_seen_at,
            -- Metadata only. Never select f.data in a list: 200 rows of 4 MB.
            f.file_name as cv_name, f.size_bytes as cv_size, f.av_scanned_at as cv_scanned_at
       from referrals r
       join candidates c on c.id = r.candidate_id
       join jobs       j on j.id = r.job_id
       join employees  e on e.id = r.referrer_id
       left join referral_resumes f on f.referral_id = r.id
      where ($1 = 'waiting' and r.ta_added_at is null and r.keka_last_seen_at is null)
         or ($1 = 'done' and (r.ta_added_at is not null or r.keka_last_seen_at is not null))
      order by r.submitted_at ${show === "waiting" ? "asc" : "desc"}
      limit 200`,
    [show],
  );

  const [counts] = await query<{ waiting: number; done: number }>(
    `select count(*) filter (where ta_added_at is null and keka_last_seen_at is null)::int as waiting,
            count(*) filter (where ta_added_at is not null or keka_last_seen_at is not null)::int as done
       from referrals`,
  );

  return (
    <>
      <AdminNav current="/admin/inbox" />
      <PageHead
        title="Referrals inbox"
        lede="New referrals from employees, waiting to be added to Keka. Oldest first."
      />

      <Card className="mb-5 border-[var(--color-brand)]/25 bg-[var(--color-brand-soft)]">
        <p className="text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
          <strong className="font-semibold text-[var(--color-ink)]">Why this exists:</strong>{" "}
          referrals can&apos;t go into Keka automatically yet. Add each candidate to the role
          in Keka, then mark it here. Once Keka has them, the referrer&apos;s tracking
          updates by itself — the Hub matches the candidate on email.
        </p>
      </Card>

      <nav className="mb-4 flex gap-1.5">
        {(
          [
            ["waiting", `Waiting (${counts?.waiting ?? 0})`],
            ["done", `Added (${counts?.done ?? 0})`],
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/inbox?show=${k}`}
            aria-current={show === k ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-[13.5px] transition ${
              show === k
                ? "bg-[var(--color-brand)] text-white"
                : "bg-white text-[var(--color-ink-2)] ring-1 ring-[var(--color-line)] hover:bg-[var(--color-brand-soft)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[16px] font-medium">
            {show === "waiting" ? "Inbox zero" : "Nothing added yet"}
          </p>
          <p className="mx-auto mt-2 max-w-[44ch] text-[14px] leading-relaxed text-[var(--color-ink-3)]">
            {show === "waiting"
              ? "Every referral made in the Hub is either in Keka or marked as added."
              : "Referrals appear here once they are marked added, or once Keka has them."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const details = [
              `Name: ${r.candidate_name}`,
              `Email: ${r.candidate_email}`,
              `Phone: ${r.candidate_phone}`,
              r.current_org && `Current organisation: ${r.current_org}`,
              r.current_designation && `Current designation: ${r.current_designation}`,
              r.linkedin_url && `LinkedIn: ${r.linkedin_url}`,
              `Role: ${r.job_title} (${r.req_id})`,
              `Source: Employee Referral — ${r.referrer_name ?? r.referrer_email} (${r.referrer_email})`,
              `Hub reference: ${r.ref_code}`,
            ]
              .filter(Boolean)
              .join("\n");
            const inKeka = r.keka_last_seen_at !== null;
            return (
              <li key={r.id} className="card min-w-0 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15.5px] font-semibold">{r.candidate_name}</p>
                    <p className="text-[13px] text-[var(--color-ink-3)]">
                      for <span className="font-medium text-[var(--color-ink-2)]">{r.job_title}</span>{" "}
                      · {r.req_id} · referred {shortDate(r.submitted_at)}
                    </p>
                  </div>
                  <span
                    className={`pill ${
                      inKeka
                        ? "bg-[var(--color-good-soft)] text-[var(--color-good)]"
                        : r.ta_added_at
                          ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                          : "bg-[var(--color-gold-soft)] text-[var(--color-gold)]"
                    }`}
                  >
                    {inKeka ? "Found in Keka" : r.ta_added_at ? "Marked added" : "Waiting for TA"}
                  </span>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
                  <Field k="Email" v={r.candidate_email} />
                  <Field k="Phone" v={r.candidate_phone} />
                  {r.current_org && <Field k="Currently at" v={[r.current_designation, r.current_org].filter(Boolean).join(", ")} />}
                  {r.linkedin_url && <Field k="LinkedIn" v={r.linkedin_url} />}
                  <Field k="Referred by" v={`${r.referrer_name ?? r.referrer_email} · ${r.relationship}`} />
                  <Field k="Reward" v={r.reward_confirmed ? rupees(r.reward) : "Not yet set"} />
                </dl>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-3">
                  <CopyDetails text={details} />
                  {r.cv_name ? (
                    <a
                      href={`/admin/resume/${r.id}`}
                      className="btn-ghost !px-3 !py-1.5 text-[13px]"
                      title={`${r.cv_name} · every download is logged`}
                    >
                      Download CV
                      <span className="text-[var(--color-ink-3)]">· {kb(r.cv_size)}</span>
                    </a>
                  ) : (
                    <span className="text-[12.5px] text-[var(--color-ink-3)]">No CV attached</span>
                  )}
                  {!inKeka && <MarkAdded id={r.id} added={r.ta_added_at !== null} />}
                  <p className="ml-auto text-[12px] text-[var(--color-ink-3)]">
                    Set source to <strong>Employee Referral</strong> in Keka.
                  </p>
                </div>
                {r.cv_name && !r.cv_scanned_at && (
                  <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-3)]">
                    CV passed file checks but has <strong>not been virus-scanned</strong>. Open it
                    in a viewer you trust, not by double-clicking an unknown file.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-[var(--color-ink-3)]">{k}</dt>
      <dd className="min-w-0 font-medium break-all">{v}</dd>
    </div>
  );
}

function kb(bytes: number | null): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
