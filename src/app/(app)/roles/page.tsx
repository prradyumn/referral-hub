import Link from "next/link";
import { query } from "@/lib/db";
import { requireSignedInUser } from "@/lib/employees";
import { Card, PageHead } from "@/components/Chrome";
import RoleCard, { type RoleCardJob } from "@/components/RoleCard";

type Job = RoleCardJob;

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
              is_priority, reward_amount, reward_confirmed, summary, posted_on
         from public.jobs
        where is_open
        order by is_priority desc, posted_on desc nulls last`,
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

  const priorityCount = jobs.filter((j) => j.is_priority).length;
  const hasFilters = Boolean(sp.q || sp.dept || sp.loc || sp.priority);

  return (
    <>
      <PageHead
        title="Open roles"
        lede="Find someone you would want to work with. Every role here is one Keka has referrals open on."
      />

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

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] text-[var(--color-ink-2)]">
          <strong className="font-semibold text-[var(--color-ink)]">
            {jobs.length} {jobs.length === 1 ? "role" : "roles"}
          </strong>
          {jobs.length !== all.length && (
            <span className="text-[var(--color-ink-3)]"> of {all.length}</span>
          )}
          {priorityCount > 0 && (
            <span className="text-[var(--color-ink-3)]">
              {" "}· {priorityCount} marked priority
            </span>
          )}
        </p>
        {hasFilters && (
          <Link href="/roles" className="text-[13px] text-[var(--color-brand)] hover:underline">
            Clear filters
          </Link>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[17px] font-medium">No roles match those filters</p>
          <p className="mx-auto mt-2 max-w-[42ch] text-[14.5px] leading-relaxed text-[var(--color-ink-3)]">
            {all.length === 0
              ? "No roles have referrals enabled in Keka yet. Talent Acquisition turns that on per role."
              : `There are ${all.length} open roles in total — widen a filter to see them.`}
          </p>
          <Link href="/roles" className="btn-primary mt-6">Show every role</Link>
        </div>
      ) : (
        <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <RoleCard key={job.id} job={job} />
          ))}
        </ul>
      )}
    </>
  );
}
