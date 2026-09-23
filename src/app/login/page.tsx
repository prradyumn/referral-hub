import { signIn, ALLOWED_EMAIL_DOMAIN } from "@/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import Logo from "@/components/Logo";
import { query } from "@/lib/db";
import { rupees } from "@/lib/format";

const DOMAIN = ALLOWED_EMAIL_DOMAIN;

// Auth.js reports failures as ?error=<code>. AccessDenied is what our signIn
// callback returns for an address outside the work domain, which is by far the
// most likely one an employee will actually hit.
function describe(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "AccessDenied":
      return `That account cannot sign in. The Hub is limited to @${DOMAIN} addresses.`;
    case "Configuration":
      return "Sign-in is not configured correctly. Please tell IT.";
    case "OAuthAccountNotLinked":
      return "That email is already linked to a different sign-in method.";
    case "Verification":
      return "That sign-in link has expired. Try again.";
    default:
      return "Sign-in did not complete. Try again.";
  }
}

// The headline figure, from HR's band table. The page must still let people
// sign in with the database down, so a failure just drops the number.
async function topCash(): Promise<number | null> {
  try {
    const [row] = await query<{ max: number | null }>(
      `select max(amount)::int as max from reward_bands where not needs_clarification`,
    );
    return row?.max ?? null;
  } catch {
    return null;
  }
}

const GIFTS = [
  { src: "/rewards/harley.webp", name: "Harley-Davidson" },
  { src: "/rewards/smartphone.webp", name: "Smartphone" },
  { src: "/rewards/smartwatch.webp", name: "Smartwatch" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const notice = describe(sp.error);

  const rawNext = sp.next;
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/roles";

  const cash = await topCash();

  // Two columns on a laptop: the reason to sign in beside the way in. The
  // page used to be a lone button under a "cg" text box, which said nothing
  // about why anyone would bother. On a phone the offer stacks above.
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative overflow-hidden bg-[#161a2e] px-6 py-6 text-white sm:px-10 sm:py-10 lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[#454b9e]/50 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -bottom-24 h-80 w-80 rounded-full bg-[#f5b93a]/20 blur-3xl"
        />
        <div className="relative max-w-[560px]">
          <p className="text-[12px] font-semibold tracking-[0.14em] text-white/60 uppercase">
            ConveGenius employee referrals
          </p>
          <p className="mt-2 text-[24px] leading-[1.12] min-[380px]:text-[28px] font-semibold tracking-[-0.02em] sm:text-[38px]">
            Bring in great people.
            <br />
            Get paid when they join.
          </p>
          {cash !== null && (
            <div className="cash-panel cash-shine-loop mt-4 inline-flex sm:mt-6 max-w-full items-center gap-3 py-2 pr-5 pl-2">
              <span className="cash-coin h-10 w-10 text-[17px]" aria-hidden="true">₹</span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[11.5px] font-bold tracking-[0.12em] text-[#7a5200] uppercase">
                  Cash up to
                </span>
                <span className="cash-amount text-[28px] leading-none font-extrabold">{rupees(cash)}</span>
                <span className="text-[13px] font-medium text-[#7a5200]">per hire</span>
              </span>
            </div>
          )}
          {/* The gifts are for a screen with room; on a phone the sign-in
              button has to stay above the fold. */}
          <p className="mt-6 hidden text-[14.5px] leading-relaxed text-white/75 sm:block">
            And every rupee earned is a reward point toward a smartwatch, a phone, a holiday, or a
            Harley.
          </p>
          <ul className="mt-5 hidden max-w-[460px] grid-cols-3 gap-3 sm:grid" aria-label="Gifts you can earn">
            {GIFTS.map((g) => (
              <li
                key={g.name}
                className="flex flex-col items-center rounded-xl bg-white/[0.06] px-2 pt-3 pb-2.5 ring-1 ring-white/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.src} alt="" className="h-16 w-auto object-contain sm:h-20" />
                <span className="mt-2 text-center text-[11.5px] font-medium text-white/80">{g.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-6 sm:py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 flex items-center gap-3 sm:mb-8">
            <Logo className="h-10 w-10 shrink-0" decorative />
            <span>
              <span className="block text-[11px] font-medium tracking-[0.09em] text-[var(--color-ink-3)] uppercase">
                ConveGenius
              </span>
              <span className="block text-[17px] leading-tight font-semibold">Referral Hub</span>
            </span>
          </div>

          {notice && (
            <p
              role="alert"
              className="card mb-4 border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3.5 text-[13.5px] leading-relaxed text-[var(--color-danger)]"
            >
              {notice}
            </p>
          )}

          <div className="card p-6">
            <h1 className="mb-1.5 text-[21px] font-semibold tracking-tight">Sign in</h1>
            <p className="mb-6 text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
              Use your ConveGenius work account.
            </p>

            {/* Opens Google in a popup so this page is never navigated away
                from. If the popup is blocked it falls back to the full-page
                redirect, which is the flow that has always worked. */}
            <GoogleSignInButton
              next={next}
              fallbackAction={async () => {
                "use server";
                await signIn("google", { redirectTo: next });
              }}
            />

            <noscript>
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: next });
                }}
              >
                <button type="submit" className="btn-ghost mt-3 w-full">
                  Continue with Google
                </button>
              </form>
            </noscript>
          </div>

          <p className="mt-5 text-center text-[12.5px] text-[var(--color-ink-3)]">
            Only @{DOMAIN} accounts can sign in.
          </p>
        </div>
      </section>
    </main>
  );
}
