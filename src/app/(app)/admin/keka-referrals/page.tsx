import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { shortDate } from "@/lib/format";
import { PageHead, Card } from "@/components/Chrome";
import AdminNav from "../AdminNav";
import { CreditForm, DismissButton } from "./KekaReferralActions";

type Row = {
  id: string;
  full_name: string;
  email_normalised: string | null;
  job_title: string | null;
  keka_candidate_id: string;
  sourced_by: string | null;
  referrer_email: string | null;
  referrer_hint: string | null;
  applied_on: string | null;
  status: string;
  reason: string | null;
  suggested_email: string | null;
  suggested_name: string | null;
  ref_code: string | null;
  credited_to: string | null;
};

const TABS = [
  { key: "review", label: "Needs review", statuses: ["needs_review"] },
  { key: "credited", label: "Credited", statuses: ["credited"] },
  { key: "other", label: "Other", statuses: ["in_hub", "duplicate", "incomplete", "dismissed"] },
] as const;

const STATUS_LABEL: Record<string, string> = {
  needs_review: "Needs review",
  credited: "Credited",
  in_hub: "Already in the Hub",
  duplicate: "Referred by someone else first",
  incomplete: "Incomplete in Keka",
  dismissed: "Dismissed",
};

/**
 * Referrals made in Keka, and who made them.
 *
 * Keka does not record a referrer in a form the Hub can rely on (§22), and a
 * reward follows from who referred. So a Keka referral is credited
 * automatically only from the configured referrer-email field; every other one
 * waits here for a person to say who made it.
 */
export default async function KekaReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.show) ?? TABS[0];

  const [settings, rows, counts, fields, lastRun] = await Promise.all([
    query<{ key: string; value: string }>(
      `select key, value from app_settings
        where key in ('keka_import_referrals', 'keka_referrer_email_field', 'keka_referral_import_since')`,
    ),
    query<Row>(
      `select k.id, k.full_name, k.email_normalised, j.title as job_title, k.keka_candidate_id,
              k.sourced_by, k.referrer_email, k.referrer_hint, k.applied_on, k.status, k.reason,
              s.email as suggested_email, s.full_name as suggested_name,
              r.ref_code, e.email as credited_to
         from keka_referral_candidates k
         left join jobs      j on j.id = k.job_id
         left join employees s on s.id = k.suggested_employee_id
         left join referrals r on r.id = k.referral_id
         left join employees e on e.id = r.referrer_id
        where k.status = any($1)
        order by k.applied_on desc nulls last, k.first_seen_at desc
        limit 200`,
      [tab.statuses as unknown as string[]],
    ),
    query<{ status: string; n: number }>(
      `select status, count(*)::int as n from keka_referral_candidates group by status`,
    ),
    query<{ name: string }>(
      `select distinct unnest(fields_seen) as name from keka_referral_candidates order by 1`,
    ),
    queryOne<{ started_at: string; status: string; error: string | null }>(
      `select started_at, status, error from integration_sync_runs
        where integration = 'keka' and resource = 'referrals'
        order by started_at desc limit 1`,
    ),
  ]);

  const setting = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const field = setting.keka_referrer_email_field?.trim() ?? "";
  const on = setting.keka_import_referrals === "true";
  const count = (statuses: readonly string[]) =>
    counts.filter((c) => statuses.includes(c.status)).reduce((a, c) => a + c.n, 0);

  return (
    <>
      <AdminNav current="/admin/keka-referrals" />
      <PageHead
        title="Keka referrals"
        lede="Referrals made in Keka rather than the Hub, and who made them."
      />

      <Card className="mb-5">
        <dl className="grid gap-x-8 gap-y-2 text-[13.5px] sm:grid-cols-2">
          <Fact k="Importing">
            {on ? (
              <>Referrals made on or after <strong>{setting.keka_referral_import_since}</strong></>
            ) : (
              <strong className="text-[var(--color-danger)]">Off</strong>
            )}
          </Fact>
          <Fact k="Last run">
            {lastRun ? (
              <>
                {shortDate(lastRun.started_at)} ·{" "}
                <span className={lastRun.status === "failed" ? "text-[var(--color-danger)]" : ""}>
                  {lastRun.status}
                </span>
                {lastRun.error && <span className="block text-[12px] text-[var(--color-danger)]">{lastRun.error}</span>}
              </>
            ) : (
              "Not yet — it runs nightly at 08:00 IST"
            )}
          </Fact>
          <Fact k="Automatic crediting">
            {field ? (
              <>From Keka&apos;s <strong>{field}</strong> field</>
            ) : (
              <strong>Off — no referrer field set</strong>
            )}
          </Fact>
        </dl>

        {!field && (
          <p className="mt-3 border-t border-[var(--color-line)] pt-3 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
            Keka does not record who made a referral in a form the Hub can trust, so every Keka
            referral waits here for you to credit. To make it automatic, ask HR to add a{" "}
            <strong>required &ldquo;Referrer work email&rdquo; field</strong> to referral-enabled jobs in
            Keka, then put that field&apos;s name in{" "}
            <Link href="/admin/settings" className="font-medium text-[var(--color-brand)] hover:underline">
              Settings
            </Link>
            .
          </p>
        )}

        {fields.length > 0 && (
          <div className="mt-3 border-t border-[var(--color-line)] pt-3">
            <p className="mb-1.5 text-[12.5px] text-[var(--color-ink-3)]">
              Fields Keka has sent on these referrals — names only, never their answers:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {fields.map((f) => (
                <code
                  key={f.name}
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    f.name.toLowerCase() === field.toLowerCase()
                      ? "bg-[var(--color-brand)] text-white"
                      : "bg-[var(--color-ground)] text-[var(--color-ink-2)]"
                  }`}
                >
                  {f.name}
                </code>
              ))}
            </div>
          </div>
        )}
      </Card>

      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Show">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/keka-referrals?show=${t.key}`}
            aria-current={t.key === tab.key ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-[13.5px] transition ${
              t.key === tab.key
                ? "bg-[var(--color-brand)] text-white"
                : "bg-white text-[var(--color-ink-2)] ring-1 ring-[var(--color-line)] hover:bg-[var(--color-brand-soft)]"
            }`}
          >
            {t.label} ({count(t.statuses)})
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[16px] font-medium">
            {tab.key === "review" ? "Nothing waiting" : "Nothing here yet"}
          </p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-[var(--color-ink-3)]">
            {tab.key === "review"
              ? "Every referral made in Keka since the import date has been credited or settled."
              : "Keka referrals appear here after the nightly sync."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id} className="card min-w-0 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15.5px] font-semibold">{r.full_name}</p>
                  <p className="text-[13px] text-[var(--color-ink-3)]">
                    for <span className="font-medium text-[var(--color-ink-2)]">{r.job_title ?? "a role not in the Hub"}</span>
                    {r.applied_on && <> · referred in Keka {shortDate(r.applied_on)}</>}
                  </p>
                </div>
                <span
                  className={`pill ${
                    r.status === "credited"
                      ? "bg-[var(--color-good-soft)] text-[var(--color-good)]"
                      : r.status === "needs_review"
                        ? "bg-[var(--color-gold-soft)] text-[var(--color-gold)]"
                        : "bg-[var(--color-ground)] text-[var(--color-ink-2)]"
                  }`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>

              <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
                {r.email_normalised && <Field k="Candidate" v={r.email_normalised} />}
                <Field k="Keka says sourced by" v={r.sourced_by ?? "— (not recorded)"} />
                {r.referrer_hint && <Field k="Referrer field says" v={r.referrer_hint} />}
                {r.status === "credited" && r.credited_to && (
                  <Field k="Credited to" v={`${r.credited_to}${r.ref_code ? ` · ${r.ref_code}` : ""}`} />
                )}
              </dl>

              {r.reason && (
                <p className="mt-2 text-[12.5px] text-[var(--color-ink-3)]">{r.reason}</p>
              )}

              {r.status === "needs_review" && (
                <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-[var(--color-line)] pt-3">
                  <CreditForm rowId={r.id} suggested={r.suggested_email} />
                  <DismissButton rowId={r.id} />
                  <p className="w-full text-[12px] text-[var(--color-ink-3)]">
                    {r.suggested_email
                      ? `Suggested from the name Keka recorded: ${r.suggested_name ?? r.suggested_email}. Check before crediting — a reward follows.`
                      : "No confident match. Enter the work email of whoever made the referral."}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-[var(--color-ink-3)]">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
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
