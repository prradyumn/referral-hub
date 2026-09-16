"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? "convegenius.ai";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "google" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The auth callback bounces failures back here as ?error=. Without this the
  // page looks like nothing happened, which is how a rejected sign-in reads
  // as a broken button.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error_description") ?? params.get("error");
    if (!err) return;
    setNotice(
      /limited to|not allowed|Database error/i.test(err)
        ? `That account cannot sign in. The Hub is limited to @${DOMAIN} addresses.`
        : err,
    );
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  function nextPath() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    return next && next.startsWith("/") ? next : "/roles";
  }

  async function signInWithGoogle() {
    setError(null);
    setNotice(null);
    setState("google");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
        queryParams: {
          // A hint that pre-filters the account chooser to the work domain.
          // It is not a security control — the database trigger is.
          hd: DOMAIN,
          prompt: "select_account",
        },
      },
    });

    if (authError) {
      setState("idle");
      setNotice(authError.message);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter your work email address.");
      return;
    }
    if (value.split("@")[1] !== DOMAIN) {
      setError(`Use your @${DOMAIN} address — the Hub is for employees only.`);
      return;
    }

    setState("sending");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: value,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
      },
    });

    if (authError) {
      setState("idle");
      setError(authError.message);
      return;
    }
    setState("sent");
  }

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

        {state === "sent" ? (
          <div className="card p-6">
            <h1 className="mb-2 text-[19px] font-semibold">Check your inbox</h1>
            <p className="text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
              We sent a sign-in link to <strong>{email.trim().toLowerCase()}</strong>. It
              works once and expires in an hour.
            </p>
            <button type="button" onClick={() => setState("idle")} className="btn-ghost mt-5 w-full">
              Use a different address
            </button>
          </div>
        ) : (
          <div className="card p-6">
            <h1 className="mb-1.5 text-[21px] font-semibold tracking-tight">Sign in</h1>
            <p className="mb-6 text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
              Use your ConveGenius work account.
            </p>

            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={state === "google"}
              className="btn-ghost w-full"
            >
              {state === "google" ? "Opening Google…" : "Continue with Google"}
            </button>

            <div className="my-5 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-[var(--color-line)]" />
              <span className="text-[12px] text-[var(--color-ink-3)]">or</span>
              <span className="h-px flex-1 bg-[var(--color-line)]" />
            </div>

            <form onSubmit={onSubmit} noValidate>
              <label htmlFor="email" className="label">
                Work email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={`you@${DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`field ${error ? "field-error" : ""}`}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "email-error" : undefined}
              />
              {error && (
                <p id="email-error" className="hint" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn-primary mt-4 w-full"
                disabled={state === "sending"}
              >
                {state === "sending" ? "Sending…" : "Email me a link"}
              </button>
            </form>
          </div>
        )}

        <p className="mt-5 text-center text-[12.5px] text-[var(--color-ink-3)]">
          Only @{DOMAIN} accounts can sign in.
        </p>
      </div>
    </main>
  );
}
