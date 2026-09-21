import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { syncHealth } from "@/lib/keka/sync";
import { shortDate } from "@/lib/format";
import { PageHead, Card } from "@/components/Chrome";
import AdminNav from "../AdminNav";

type Run = {
  id: string;
  resource: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  records_read: number;
  records_written: number;
  error: string | null;
};

type Stage = {
  keka_stage_id: string;
  employee_wording: string | null;
  is_visible: boolean;
  notifies: boolean;
  seen: number;
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function AdminSyncPage() {
  await requireAdmin();

  const [health, runs, stages, counts] = await Promise.all([
    syncHealth("keka"),
    query<Run>(
      `select id, resource, started_at, finished_at, status,
              records_read, records_written, error
         from integration_sync_runs
        where integration = 'keka'
        order by started_at desc
        limit 15`,
    ),
    query<Stage>(
      `select m.keka_stage_id, m.employee_wording, m.is_visible, m.notifies,
              (select count(*) from referral_stages s where s.stage = m.keka_stage_id) as seen
         from keka_stage_map m
        order by m.sort_order, m.keka_stage_id`,
    ),
    query<{ k: string; v: number }>(
      `select 'open roles' as k, count(*) as v from jobs where is_open
       union all select 'roles from keka', count(*) from jobs where source = 'keka'
       union all select 'rewards unconfirmed', count(*) from jobs where is_open and not reward_confirmed
       union all select 'referrals', count(*) from referrals
       union all select 'referrals matched in keka', count(*) from referrals where keka_last_seen_at is not null`,
    ),
  ]);

  const stale = health.filter((h) => h.is_stale);

  return (
    <>
      <AdminNav current="/admin/sync" />
      <PageHead
        title="Integration health"
        lede="Every sync run is recorded, so silence means healthy rather than unnoticed."
      />

      {/* CONTEXT.md convention 10: a sync that has not succeeded in 24 hours
          raises an alert. This is that alert, until real alerting exists. */}
      {stale.length > 0 ? (
        <Card className="mb-6 border-[var(--color-gold)] bg-[var(--color-gold-soft)]">
          <p className="text-[14px] font-semibold">
            {stale.length} sync{stale.length === 1 ? " has" : "s have"} not succeeded in 24 hours
          </p>
          <ul className="mt-2 grid gap-1 text-[13px] text-[var(--color-ink-2)]">
            {stale.map((h) => (
              <li key={h.resource}>
                <strong>{h.resource}</strong> — last success {ago(h.last_success_at)}
                {h.last_error ? ` · ${h.last_error.slice(0, 160)}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="mb-6">
          <p className="text-[14px]">
            <strong className="font-semibold">All syncs healthy.</strong>{" "}
            <span className="text-[var(--color-ink-2)]">
              Every resource has succeeded within the last 24 hours.
            </span>
          </p>
        </Card>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {counts.map((c) => (
          <Card key={c.k} className="text-center">
            <p className="text-[22px] font-semibold leading-tight">{c.v}</p>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-3)]">{c.k}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 text-[15px] font-semibold">Recent runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[var(--color-ink-3)]">
              <tr>
                <th className="pb-2 pr-4 font-medium">Resource</th>
                <th className="pb-2 pr-4 font-medium">Started</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 text-right font-medium">Read</th>
                <th className="pb-2 text-right font-medium">Written</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className="py-2 pr-4">{r.resource}</td>
                  <td className="py-2 pr-4 text-[var(--color-ink-3)]">{ago(r.started_at)}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`pill ${
                        r.status === "ok"
                          ? "bg-[var(--color-good-soft,#e7f6ec)] text-[var(--color-good)]"
                          : r.status === "failed"
                            ? "bg-[var(--color-gold-soft)] text-[var(--color-gold)]"
                            : "bg-[var(--color-ground)] text-[var(--color-ink-3)]"
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.error && (
                      <span className="ml-2 text-[12px] text-[var(--color-ink-3)]">
                        {r.error.slice(0, 90)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.records_read}</td>
                  <td className="py-2 text-right tabular-nums">{r.records_written}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-[var(--color-ink-3)]">
                    No sync has run yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-[15px] font-semibold">Stage wording</h2>
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
          What an employee reads for each Keka hiring stage. A stage with no wording, or
          marked not visible, is recorded but never shown — the Hub does not invent a
          label for a stage it does not recognise. Edit these in{" "}
          <code className="rounded bg-[var(--color-ground)] px-1 py-0.5 text-[12px]">
            keka_stage_map
          </code>
          ; the wording is provisional until D15 is settled.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[var(--color-ink-3)]">
              <tr>
                <th className="pb-2 pr-4 font-medium">Keka stage</th>
                <th className="pb-2 pr-4 font-medium">Employee sees</th>
                <th className="pb-2 pr-4 font-medium">Notifies</th>
                <th className="pb-2 text-right font-medium">Times seen</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.keka_stage_id} className="border-t border-[var(--color-line)]">
                  <td className="py-2 pr-4 font-medium">{s.keka_stage_id}</td>
                  <td className="py-2 pr-4">
                    {s.is_visible && s.employee_wording ? (
                      s.employee_wording
                    ) : (
                      <span className="text-[var(--color-ink-3)]">hidden</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-[var(--color-ink-3)]">
                    {s.notifies ? "yes" : "no"}
                  </td>
                  <td className="py-2 text-right tabular-nums">{s.seen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-6 text-[13px] text-[var(--color-ink-3)]">
        Last checked {shortDate(new Date().toISOString())}.
      </p>
    </>
  );
}
