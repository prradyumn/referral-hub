import Link from "next/link";
import { requireSignedInUser } from "@/lib/employees";
import { howToSteps, policyPoints } from "@/lib/showcase";
import { query } from "@/lib/db";
import { points } from "@/lib/format";
import { Card, PageHead } from "@/components/Chrome";

export default async function HowToReferPage() {
  // The same milestone_tiers rows /rewards reads. Two hardcoded copies of the
  // gift ladder would drift the moment HR changed one of them.
  const benefits = await query<{ name: string; threshold: number }>(
    `select name, threshold from milestone_tiers where is_active
      order by sort_order, threshold`,
  );

  await requireSignedInUser();

  return (
    <>
      <PageHead
        title="How to refer"
        lede="Five steps, about two minutes, and what happens afterwards."
        action={
          <Link href="/roles" className="btn-primary">
            Browse open roles
          </Link>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        {/* Stepwise summary */}
        <Card>
          <ol className="grid gap-0">
            {howToSteps.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
                {i < howToSteps.length - 1 && (
                  <span
                    className="absolute top-8 bottom-0 left-[15px] w-px bg-[var(--color-line)]"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-[13px] font-semibold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block text-[15.5px] font-semibold leading-snug">{s.title}</span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-[var(--color-ink-2)]">
                    {s.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid content-start gap-3">
          {/* Video — placeholder until Comms supplies the file */}
          <Card>
            <p className="mb-3 text-[13px] font-medium text-[var(--color-ink-2)]">
              Watch the two-minute walkthrough
            </p>
            <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-ground)]">
              <span className="flex flex-col items-center gap-2 text-[var(--color-ink-3)]">
                <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden="true">
                  <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M20 17l12 7-12 7z" fill="currentColor" />
                </svg>
                <span className="text-[12.5px]">Video to come from Comms</span>
              </span>
            </div>
          </Card>

          {/* Benefits flyer */}
          <Card>
            <p className="mb-3 text-[13px] font-medium text-[var(--color-ink-2)]">
              What you earn
            </p>
            <ul className="grid gap-2.5">
              {benefits.map((b) => (
                <li key={b.name} className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-medium">{b.name}</span>
                  <span className="text-[12.5px] whitespace-nowrap text-[var(--color-mint)]">
                    {points(b.threshold)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
              Cash rewards vary by role and are shown on each opening. Milestone progress is
              tracked on your rewards page; ordering and delivery of the gift itself is
              handled by HR.
            </p>
          </Card>
        </div>
      </div>

      {/* Policy framework */}
      <Card className="mt-3">
        <p className="mb-4 text-[13px] font-medium text-[var(--color-ink-2)]">
          The policy, in plain terms
        </p>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {policyPoints.map((p) => (
            <li key={p} className="flex gap-2.5 text-[14px] leading-relaxed text-[var(--color-ink-2)]">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" aria-hidden="true" />
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-5 border-t border-[var(--color-line)] pt-4 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
          Several programme rules are still being confirmed with HR. Where this page and the
          signed policy differ, the signed policy governs.
        </p>
      </Card>
    </>
  );
}
