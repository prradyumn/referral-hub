import { signIn, ALLOWED_EMAIL_DOMAIN } from "@/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";

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

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-brand)] text-[15px] font-bold text-white">
            cg
          </span>
          <span>
            <span className="block text-[16px] font-semibold leading-tight">Referral Hub</span>
            <span className="block text-[13px] text-[var(--color-ink-3)]">ConveGenius</span>
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
    </main>
  );
}
