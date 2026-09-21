"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeWelcome } from "@/app/(app)/welcome-actions";
import { CashRain, CoinStackArt, WatchArt, PhoneArt, BikeArt } from "@/components/RewardArt";

export type Tier = { name: string; threshold: number; blurb: string | null };

const FLIP_EVERY = 3200;
const HALF_FLIP = 280;

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the viewer has asked for less motion.
 *
 * useSyncExternalStore rather than useState-in-an-effect: matchMedia is an
 * external store, and reading it into state from an effect is the pattern
 * React's lint rule exists to stop — CONTEXT.md §8 records it being right
 * about this twice already. The server snapshot is `false` so the markup
 * matches on hydration, and the real value arrives on the client.
 */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(MOTION_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * The programme poster, shown once before an employee reaches the app.
 *
 * Mandatory in the sense the brief asked for: it opens on first visit and
 * Escape and click-outside are both refused. Deliberately *once*, though — a
 * wall that reappears every visit stops being read after the second time and
 * trains people to click past whatever the Hub puts in front of them,
 * including the things that matter later.
 *
 * The showcase flips through the gifts biggest-first, on the reasoning that
 * the Harley is what makes somebody look twice and the smartwatch is what
 * makes the programme feel achievable. The board underneath carries all three
 * at once, so nobody has to wait for the carousel to come round to read the
 * thing they care about — the motion is for attention, the board is for
 * information.
 */
export default function WelcomeGate({ tiers }: { tiers: Tier[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState(false);

  // Biggest prize first, as asked: Harley, then smartphone, then smartwatch.
  const showcase = [...tiers].sort((a, b) => b.threshold - a.threshold).slice(0, 3);
  const art = [
    <BikeArt key="b" className="h-24 w-24" />,
    <PhoneArt key="p" className="h-24 w-24" />,
    <WatchArt key="w" className="h-24 w-24" />,
  ];

  const [index, setIndex] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || el.open) return;
    el.showModal();
    const stopEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    const stopCancel = (e: Event) => e.preventDefault();
    el.addEventListener("cancel", stopCancel);
    el.addEventListener("keydown", stopEscape);
    return () => {
      el.removeEventListener("cancel", stopCancel);
      el.removeEventListener("keydown", stopEscape);
    };
  }, []);

  // The carousel does not run at all under reduced motion — the board below
  // already says everything it would have said, so nothing is lost.
  useEffect(() => {
    if (reduced || showcase.length < 2) return;
    const tick = window.setInterval(() => {
      // Half-turn out, swap the face at the edge, half-turn back in.
      setFlipping(true);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % showcase.length);
        setFlipping(false);
      }, HALF_FLIP);
    }, FLIP_EVERY);
    return () => window.clearInterval(tick);
  }, [reduced, showcase.length]);

  /**
   * Close, move on, and record the acknowledgement behind it.
   *
   * The recording round-trips to Neon in Virginia and revalidates the layout,
   * which is roughly two seconds from here (§4). Waiting on that before
   * closing meant clicking the button and watching nothing happen. The
   * acknowledgement is not something the person is waiting for — it is
   * bookkeeping — so the UI goes first.
   *
   * If it fails, the poster shows again next time, which is the safe
   * direction for this to fail in.
   */
  function leave(to?: string) {
    setClosing(true);
    ref.current?.close();
    if (to) router.push(to);

    start(async () => {
      try {
        await acknowledgeWelcome();
      } catch {
        // Nothing to do — they simply see it once more.
      }
    });
  }

  const current = showcase[index];

  return (
    <dialog
      ref={ref}
      aria-labelledby="welcome-title"
      className={`m-auto w-[min(94vw,560px)] overflow-hidden rounded-2xl border border-[var(--color-line)] p-0
                  backdrop:bg-[#171b24]/60 backdrop:backdrop-blur-[3px]
                  ${closing ? "welcome-out" : "welcome-in"}`}
    >
      {/* Hero — cash falling behind the promise. */}
      <div className="relative overflow-hidden bg-[var(--color-brand)] px-7 pt-6 pb-7 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.3]">
          <CashRain className="h-full w-full" />
        </div>

        <div className="relative">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-white/70 uppercase">
            Before you start
          </p>
          <h2
            id="welcome-title"
            className="mt-1.5 text-[25px] leading-[1.15] font-semibold tracking-[-0.02em]"
          >
            Refer someone good. Get paid for it.
          </h2>
        </div>
      </div>

      {/* The flipping showcase. */}
      <div className="border-b border-[var(--color-line)] bg-[var(--color-ground)] px-7 py-6">
        {reduced ? (
          <ul className="flex items-center justify-center gap-6">
            {showcase.map((t, i) => (
              <li key={t.name} className="flex flex-col items-center text-center">
                <span className="flex h-16 w-16 items-center justify-center" aria-hidden="true">
                  {art[i]}
                </span>
                <span className="mt-1.5 text-[13px] font-semibold">{t.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center">
            <div className="flip-stage">
              <div className={`flip-face ${flipping ? "is-flipping" : ""}`}>
                <span className="flex h-24 w-24 items-center justify-center" aria-hidden="true">
                  {art[index]}
                </span>
              </div>
            </div>

            {/* aria-live so the rotation is announced rather than silently
                changing under a screen reader. */}
            <p aria-live="polite" className="mt-2 text-center">
              <span className="block text-[17px] font-semibold tracking-[-0.01em]">
                {current?.name}
              </span>
              <span className="mt-0.5 block text-[13px] font-medium text-[var(--color-mint)]">
                {current?.threshold}{" "}
                {current?.threshold === 1 ? "referral joins" : "referrals join"}
              </span>
            </p>

            <div className="mt-3 flex gap-1.5" aria-hidden="true">
              {showcase.map((t, i) => (
                <span
                  key={t.name}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index
                      ? "w-5 bg-[var(--color-brand)]"
                      : "w-1.5 bg-[var(--color-line)]"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The board — everything at once, so nobody waits for the carousel. */}
      <div className="px-7 py-5">
        <p className="mb-2.5 text-[11px] font-semibold tracking-[0.12em] text-[var(--color-ink-3)] uppercase">
          What you get
        </p>

        <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
          <div className="flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-gold-soft)] px-4 py-3">
            <CoinStackArt className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold">Cash on every hire</p>
              <p className="text-[12.5px] leading-snug text-[var(--color-ink-2)]">
                Paid with your salary. Fixed the moment you refer, so it can never drop.
              </p>
            </div>
          </div>

          <ul>
            {[...tiers]
              .sort((a, b) => a.threshold - b.threshold)
              .slice(0, 3)
              .map((t) => (
                <li
                  key={t.name}
                  className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-2.5 last:border-b-0"
                >
                  <span className="text-[13.5px] font-medium">{t.name}</span>
                  <span className="shrink-0 text-[12.5px] text-[var(--color-ink-3)]">
                    {t.threshold} {t.threshold === 1 ? "referral joins" : "referrals join"}
                  </span>
                </li>
              ))}
          </ul>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-3)]">
          Rewards are taxable salary income and shown gross. Gift tiers are tracked here;
          ordering and delivery are handled by HR.
        </p>

        <button
          type="button"
          onClick={() => leave("/roles")}
          disabled={pending}
          className="btn-primary mt-4 w-full !py-3 text-[15px]"
        >
          {pending ? "One moment…" : "Refer someone — see open roles"}
        </button>

        {/* The gate is about having read it, not about being marched to a
            particular page. Someone who came to check their rewards should
            not have to detour. */}
        <button
          type="button"
          onClick={() => leave()}
          disabled={pending}
          className="mt-2 w-full py-1.5 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink)] hover:underline"
        >
          Maybe later
        </button>
      </div>

      <style>{`
        .welcome-in  { animation: wIn 260ms cubic-bezier(.2,.8,.3,1) both; }
        .welcome-out { animation: wOut 180ms ease-in both; }
        @keyframes wIn  { from { opacity: 0; transform: translateY(14px) scale(.985); } }
        @keyframes wOut { to   { opacity: 0; transform: translateY(-6px) scale(.99); } }

        /* The stage carries the perspective; the face does the turning. */
        .flip-stage { perspective: 800px; }
        .flip-face {
          transition: transform ${HALF_FLIP}ms cubic-bezier(.4,0,.2,1), opacity ${HALF_FLIP}ms linear;
          transform: rotateY(0deg);
          transform-style: preserve-3d;
        }
        .flip-face.is-flipping { transform: rotateY(90deg); opacity: .35; }

        @media (prefers-reduced-motion: reduce) {
          .welcome-in, .welcome-out { animation: none; }
          .flip-face { transition: none; }
        }
      `}</style>
    </dialog>
  );
}
