import Link from "next/link";
import { query } from "@/lib/db";
import { requireSignedInUser } from "@/lib/employees";
import { rupees } from "@/lib/format";
import { Card, PageHead } from "@/components/Chrome";

type Job = {
  id: string;
  req_id: string;
  title: string;
  department: string;
  location: string;
  experience_band: string;
  is_priority: boolean;
  reward_amount: number;
  summary: string | null;
};

type Search = { q?: string; dept?: string; loc?: string; priority?: string };

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireSignedInUser();

  const sp = await searchParams;

  let all: Job[] = [];
  let error: string | null = null;
  try {
    all = await query<Job>(
      `select id, req_id, title, department, location, experience_band,
              is_priority, reward_amount, summary
         from public.jobs
        where is_open
        order by is_priority desc, posted_on desc`,
    );
  } catch {
    // No database yet. Show the empty state rather than failing the page.
    error = "not-connected";
  }

  const departments = [...new Set(all.map((j) => j.department))].sort();
  const locations = [...new Set(all.map((j) => j.location))].sort();

  const q = (sp.q ?? "").trim().toLowerCase();
  const jobs = all.filter((j) => {
    if (sp.dept && j.department !== sp.dept) return false;
    if (sp.loc && j.location !== sp.loc) return false;
    if (sp.priority === "1" && !j.is_priority) return false;
    if (!q) return true;
    return [j.title, j.department, j.location, j.summary ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <>
      <PageHead title="Open roles" lede="Find someone you would want to work with." />

      {error && (
        <Card className="mb-6 border-dashed">
          <p className="text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            <strong className="font-semibold text-[var(--color-ink)]">
              No database connected.
            </strong>{" "}
            Sign-in works, but open roles come from Postgres. Set{" "}
            <code className="rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[13px]">
              DATABASE_URL
            </code>{" "}
            and apply{" "}
            <code className="rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[13px]">
              db/0001_schema.sql
            </code>
            .
          </p>
        </Card>
      )}

      {/* A GET form, so filtering is a navigation. Typing never re-renders
          the page mid-keystroke, and every filtered view has its own URL. */}
      <form method="get" className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="q" className="label">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Role, skill or department"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="dept" className="label">
            Department
          </label>
          <select id="dept" name="dept" defaultValue={sp.dept ?? ""} className="field">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="loc" className="label">
            Location
          </label>
          <select id="loc" name="loc" defaultValue={sp.loc ?? ""} className="field">
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2.5 text-[14px] text-[var(--color-ink-2)]">
          <input
            type="checkbox"
            name="priority"
            value="1"
            defaultChecked={sp.priority === "1"}
            className="h-4 w-4 accent-[var(--color-brand)]"
          />
          Priority only
        </label>

        <button type="submit" className="btn-ghost mb-0.5">
          Apply
        </button>
        <Link href="/roles" className="mb-3 text-[13px] text-[var(--color-ink-3)] hover:underline">
          Clear
        </Link>
      </form>

      <p className="mb-3 text-[13px] text-[var(--color-ink-3)]">
        {jobs.length} of {all.length} roles
      </p>

      {jobs.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-[16px] font-medium">No roles match those filters</p>
          <p className="mt-1 text-[14px] text-[var(--color-ink-3)]">
            Clear a filter to see more openings.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {jobs.map((job) => (
            <li key={job.id} className="card flex flex-col p-5">
              <div className="mb-1 flex items-start justify-between gap-3">
                <h2 className="text-[16.5px] font-semibold leading-snug">{job.title}</h2>
                {job.is_priority && (
                  <span className="pill shrink-0 bg-[var(--color-gold-soft)] text-[var(--color-gold)]">
                    Priority
                  </span>
                )}
              </div>

              <p className="text-[13px] text-[var(--color-ink-3)]">
                {job.department} · {job.location} · {job.experience_band}
              </p>

              {job.summary && (
                <p className="mt-3 mb-4 line-clamp-3 text-[14px] leading-relaxed text-[var(--color-ink-2)]">
                  {job.summary}
                </p>
              )}

              <div className="mt-auto flex items-center justify-between rounded-md bg-[var(--color-gold-soft)] px-3 py-2 pt-2">
                <span className="text-[13px] text-[var(--color-ink-2)]">Referral reward</span>
                <span className="text-[15px] font-semibold text-[var(--color-gold)]">
                  {rupees(job.reward_amount)}
                </span>
              </div>

              <Link href={`/refer?job=${job.id}`} className="btn-primary mt-4 w-full">
                Refer someone
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
