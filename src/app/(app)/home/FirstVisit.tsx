import Link from "next/link";
import { rupees } from "@/lib/format";
import { VacationArt } from "@/components/RewardArt";

export type TopRole = {
  id: string;
  title: string;
  department: string;
  location: string;
  reward_amount: number;
};

export type GiftTier = { name: string; threshold: number; art: string | null };

const GIFT_PHOTO: Record<string, string> = {
  watch: "/rewards/smartwatch.webp",
  phone: "/rewards/smartphone.webp",
  harley: "/rewards/harley.webp",
};

const indian = (n: number) => Math.round(n).toLocaleString("en-IN");

/**
 * Home for someone who has not referred anyone yet — the commonest visitor.
 *
 * The dashboard used to greet them with nine zeros and "4 Tiers", and never
 * said what to do. This leads with the offer, puts the best-paying roles one
 * click away, and shows the gift ladder with the real prizes. The zero-filled
 * dashboard returns once there is something on it.
 */
export default function FirstVisit({
  firstName,
  maxCash,
  roles,
  gifts,
}: {
  firstName: string;
  maxCash: number | null;
  roles: TopRole[];
  gifts: GiftTier[];
}) {
  return (
    <>
      {/* The offer */}
      <section className="relative overflow-hidden rounded-2xl bg-[var(--color-brand)] px-6 py-8 text-white sm:px-9 sm:py-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative max-w-[640px]">
          <p className="text-[12px] font-semibold tracking-[0.14em] text-white/70 uppercase">
            Welcome, {firstName}
          </p>
          <h1 className="mt-2 text-[28px] leading-[1.12] font-semibold tracking-[-0.02em] sm:text-[36px]">
            Know someone great?
            <br />
            Your first referral could pay you.
          </h1>
          {maxCash !== null && (
            <div className="cash-panel cash-shine-loop mt-5 inline-flex max-w-full items-center gap-3 py-2 pr-5 pl-2">
              <span className="cash-coin h-10 w-10 text-[17px]" aria-hidden="true">₹</span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[11.5px] font-bold tracking-[0.12em] text-[#7a5200] uppercase">
                  Cash up to
                </span>
                <span className="cash-amount text-[28px] leading-none font-extrabold">
                  {rupees(maxCash)}
                </span>
                <span className="text-[13px] font-medium text-[#7a5200]">per hire, plus gifts</span>
              </span>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/roles" className="btn-primary !bg-white !text-[var(--color-brand)] hover:!bg-white/90">
              Browse open roles
            </Link>
            <Link
              href="/how-to-refer"
              className="inline-flex items-center rounded-md px-4 py-2.5 text-[14.5px] font-medium text-white ring-1 ring-white/40 hover:bg-white/10"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* The roles worth the most, one click from referring */}
      {roles.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-semibold">Top-paying open roles</h2>
            <Link href="/roles" className="text-[13.5px] font-medium text-[var(--color-brand)] hover:underline">
              All roles →
            </Link>
          </div>
          {/* On a phone, a row you swipe through: four stacked cards were a
              full screen and a half before the gifts. */}
          <ul className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
            {roles.map((r) => (
              <li key={r.id} className="group card flex w-[78%] min-w-0 shrink-0 snap-start flex-col p-4 transition hover:border-[var(--color-ink-3)] sm:w-auto">
                <p className="text-[15px] leading-snug font-semibold">{r.title}</p>
                <p className="mt-0.5 mb-3 text-[12.5px] text-[var(--color-ink-3)]">
                  {r.department} · {r.location}
                </p>
                <div className="cash-panel cash-shine mt-auto px-3 py-2">
                  <p className="text-[10px] font-bold tracking-[0.12em] text-[#7a5200] uppercase">Cash up to</p>
                  <p className="cash-amount text-[20px] leading-tight font-extrabold">{rupees(r.reward_amount)}</p>
                </div>
                <Link
                  href={`/refer?job=${r.id}`}
                  className="btn-ghost mt-3 !py-2 text-[13.5px]"
                  aria-label={`Refer someone for ${r.title}`}
                >
                  Refer someone
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The gift ladder, with the real prizes */}
      {gifts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[17px] font-semibold">Gifts on top of the cash</h2>
          <p className="mt-1 mb-3 text-[13.5px] text-[var(--color-ink-3)]">
            Every rupee you earn is a reward point. Collect points, unlock gifts.
          </p>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {gifts.map((g) => (
              <li key={g.name} className="card flex min-w-0 flex-col items-center overflow-hidden p-0 text-center">
                <div className="flex h-32 w-full items-center justify-center bg-[#12151c]">
                  {g.art && GIFT_PHOTO[g.art] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={GIFT_PHOTO[g.art]}
                      alt=""
                      className="max-h-[104px] w-auto object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,.5)]"
                    />
                  ) : (
                    <VacationArt className="h-[104px] w-auto" />
                  )}
                </div>
                <div className="px-3 py-3">
                  <p className="text-[14px] font-semibold">{g.name}</p>
                  <p className="mt-0.5 text-[12.5px] font-medium text-[var(--color-mint)] tabular-nums">
                    {indian(g.threshold)} points
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Three steps, so nobody has to open another page to understand it */}
      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Pick a role", "Find one that fits someone you'd want to work with."],
          ["Refer them", "Two minutes: their name, contact, and how you know them."],
          ["They join, you earn", "Cash with your salary, and points toward the gifts."],
        ].map(([h, b], i) => (
          <div key={h} className="card flex gap-3 p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[13px] font-semibold text-[var(--color-brand)]">
              {i + 1}
            </span>
            <div>
              <p className="text-[14.5px] font-semibold">{h}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--color-ink-3)]">{b}</p>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
