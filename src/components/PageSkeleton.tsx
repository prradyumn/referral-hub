/**
 * What every page shows while its data comes back from Postgres.
 *
 * The database is in Virginia, so a page that waits on it spends a quarter
 * of a second or more on each round trip. Without this a click did nothing
 * visible until the whole page arrived, which reads as a click that missed.
 * A page-shaped skeleton says it landed.
 *
 * Each employee route has its own loading.tsx re-exporting this, and the
 * admin routes deliberately have none. A loading boundary makes the page
 * stream, and a streamed response has already sent "200 OK" by the time
 * requireAdmin() calls notFound() — the body was still the 404 page, but
 * the status lied and scripts/e2e-admin.mjs caught it. Never add one at the
 * (app) level or under /admin.
 */
export default function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="mb-7" aria-hidden="true">
        <div className="h-7 w-56 max-w-full rounded-md bg-[var(--color-line)]" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-[var(--color-line)]/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card p-5">
            <div className="h-4 w-3/4 rounded bg-[var(--color-line)]" />
            <div className="mt-2.5 h-3 w-1/2 rounded bg-[var(--color-line)]/70" />
            <div className="mt-5 h-10 rounded-md bg-[var(--color-line)]/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
