"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CashRain, CoinStackArt, WatchArt, PhoneArt, BikeArt } from "@/components/RewardArt";

export type Tier = { name: string; threshold: number; blurb: string | null };

/**
 * The programme poster, shown once before an employee reaches the app.
 *
 * Mandatory in the sense the brief asked for: it opens on first visit and
 * there is exactly one way out — the acknowledge button. Escape and
 * click-outside are both refused, because a gate you can dismiss by pressing
 * a key is not a gate.
 *
 * Deliberately *once*. A wall that reappears every visit stops being read
 * after the second time and becomes a thing people click past, which is worse
 * than not having it: it trains the habit of dismissing whatever the Hub puts
 * in front of them, including the things that matter later.
 */
export default function WelcomeGate({ tiers }: { tiers: Tier[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.open) return;
    el.showModal();
    // A <dialog> closes on Escape by default. This one should not.
    const block = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    el.addEventListener("cancel", (e) => e.preventDefault());
    el.addEventListener("keydown", block);
    return () => el.removeEventListener("keydown", block);
  }, []);

  function acknowledge() {
    setClosing(true);
    start(async () => {
      try {
        const { acknowledgeWelcome } = await import("@/app/(app)/welcome-actions");
        await acknowledgeWelcome();
      } catch {
        // If recording it fails the poster simply shows again next time,
        // which is the safe direction to fail in.
      }
      ref.current?.close();
    });
  }

  const art = [<WatchArt key="w" />, <PhoneArt key="p" />, <BikeArt key="b" />];

  return (
    <dialog
      ref={ref}
      aria-labelledby="welcome-title"
      className={`m-auto w-[min(94vw,620px)] overflow-hidden rounded-2xl border border-[var(--color-line)] p-0
                  backdrop:bg-[#171b24]/60 backdrop:backdrop-blur-[3px]
                  ${closing ? "welcome-out" : "welcome-in"}`}
    >
      {/* Hero — cash falling behind the promise. */}
      <div className="relative overflow-hidden bg-[var(--color-brand)] px-7 pt-7 pb-8 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.32]">
          <CashRain className="h-full w-full" />
        </div>

        <div className="relative">
          <p className="text-[11.5px] font-semibold tracking-[0.13em] text-white/70 uppercase">
            Before you start
          </p>
          <h2
            id="welcome-title"
            className="mt-2 text-[27px] leading-[1.15] font-semibold tracking-[-0.02em]"
          >
            Refer someone good.
            <br />
            Get paid for it.
          </h2>
          <p className="mt-3 max-w-[46ch] text-[14.5px] leading-relaxed text-white/85">
            Every person you refer who joins earns you a cash reward through payroll. Keep
            going and the milestone gifts unlock on top of it.
          </p>
        </div>
      </div>

      <div className="px-7 py-6">
        {/* The cash promise, given its own weight. */}
        <div className="flex items-center gap-4 rounded-xl border border-[var(--color-gold)]/35 bg-[var(--color-gold-soft)] p-4">
          <CoinStackArt className="h-14 w-14 shrink-0" />
          <div className="min-w-0">
            <p className="text-[15.5px] font-semibold">Cash on every hire</p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
              Paid with your salary once they complete the qualifying period. The amount
              is fixed the moment you refer, so it can never be reduced afterwards.
            </p>
          </div>
        </div>

        <p className="mt-6 mb-3 text-[12px] font-semibold tracking-[0.1em] text-[var(--color-ink-3)] uppercase">
          And the gifts stack up
        </p>

        <ul className="grid gap-3 sm:grid-cols-3">
          {tiers.slice(0, 3).map((t, i) => (
            <li
              key={t.name}
              className="tier flex flex-col items-center rounded-xl border border-[var(--color-line)] p-4 text-center"
              style={{ animationDelay: `${180 + i * 110}ms` }}
            >
              <span className="flex h-16 w-16 items-center justify-center" aria-hidden="true">
                {art[i]}
              </span>
              <span className="mt-2 text-[14.5px] font-semibold">{t.name}</span>
              <span className="mt-0.5 text-[12.5px] font-medium text-[var(--color-mint)]">
                {t.threshold} {t.threshold === 1 ? "referral joins" : "referrals join"}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
          Rewards are taxable salary income and shown gross. Gift tiers are tracked in the
          Hub; ordering and delivery are handled by HR.
        </p>

        <button
          type="button"
          onClick={acknowledge}
          disabled={pending}
          className="btn-primary mt-5 w-full !py-3 text-[15px]"
        >
          {pending ? "One moment…" : "Got it — take me in"}
        </button>
      </div>

      <style>{`
        .welcome-in  { animation: wIn 260ms cubic-bezier(.2,.8,.3,1) both; }
        .welcome-out { animation: wOut 180ms ease-in both; }
        @keyframes wIn  { from { opacity: 0; transform: translateY(14px) scale(.985); } }
        @keyframes wOut { to   { opacity: 0; transform: translateY(-6px) scale(.99); } }
        .tier { animation: tierIn 420ms cubic-bezier(.2,.7,.3,1) both; }
        @keyframes tierIn { from { opacity: 0; transform: translateY(12px); } }
        @media (prefers-reduced-motion: reduce) {
          .welcome-in, .welcome-out, .tier { animation: none; }
        }
      `}</style>
    </dialog>
  );
}
