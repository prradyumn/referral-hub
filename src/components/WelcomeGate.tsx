"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeWelcome } from "@/app/(app)/welcome-actions";
import { CashRain, CoinStackArt, WatchArt, PhoneArt, BikeArt } from "@/components/RewardArt";

export type Tier = { name: string; threshold: number; blurb: string | null };

/**
 * The product photograph for each tier.
 *
 * Matched on threshold rather than on name, because the names are HR's to
 * edit in milestone_tiers and a rename should not silently drop the artwork.
 * Anything without a photo falls back to the drawn mark.
 */
const PHOTO: Record<number, { src: string; w: number; h: number; alt: string }> = {
  1: { src: "/rewards/smartwatch.webp", w: 363, h: 480, alt: "Smartwatch" },
  3: { src: "/rewards/smartphone.webp", w: 289, h: 620, alt: "Smartphone" },
  6: { src: "/rewards/harley.webp", w: 674, h: 620, alt: "Harley-Davidson motorcycle" },
};

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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
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
    // showModal() focuses the first focusable element, which is the button at
    // the bottom — and the browser scrolls to it, so the poster opened with
    // its own headline scrolled out of view. Focus the title instead: a
    // screen reader announces what this is, and the poster opens at the top.
    titleRef.current?.focus({ preventScroll: true });
    bodyRef.current?.scrollTo({ top: 0 });
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
      className={`m-auto w-[min(calc(100vw-24px),560px)] max-h-[calc(100dvh-24px)] max-w-none
                  overflow-hidden rounded-2xl border border-[var(--color-line)] p-0 open:flex open:flex-col
                  backdrop:bg-[#171b24]/60 backdrop:backdrop-blur-[3px]
                  ${closing ? "welcome-out" : "welcome-in"}`}
    >
      {/* Scrolls on its own, inside a height capped to the screen. The dialog
          used to be overflow-hidden with no cap, so on anything shorter than
          about 870px — every common laptop — the content was simply cut off
          with no way to reach it. */}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {/* Hero — cash falling behind the promise. */}
      <div className="wg-hero wg-pad relative overflow-hidden bg-[var(--color-brand)] px-7 pt-6 pb-7 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.3]">
          <CashRain className="h-full w-full" />
        </div>

        <div className="relative">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-white/70 uppercase">
            Before you start
          </p>
          <h2
            id="welcome-title"
            ref={titleRef}
            tabIndex={-1}
            className="wg-title mt-1.5 text-[25px] leading-[1.15] font-semibold tracking-[-0.02em] outline-none"
          >
            Refer someone good. Get paid for it.
          </h2>
        </div>
      </div>

      {/* The flipping showcase, on a near-black stage.
          The Harley was photographed on a dark gradient and the other two were
          keyed out of white studio backgrounds, so a dark stage is the one
          surface all three sit on without looking like pasted rectangles. */}
      <div className="wg-show relative overflow-hidden bg-[#12151c] px-6 py-6">
        {/* Every photo is rendered from the start and only revealed in turn,
            so rotating never waits on a download. The whole stack turns
            together — a half-turn out, the face swaps at the edge, a
            half-turn back in. */}
        {/* Perspective belongs to the parent; the child is what turns. Putting
            both on one element gives a flat squash rather than a rotation. */}
        <div className="flip-stage mx-auto w-full max-w-[380px]">
        <div
          className={`wg-stage relative flex h-[220px] w-full items-center justify-center ${
            reduced ? "" : "flip-photo"
          } ${flipping ? "is-flipping" : ""}`}
        >
          {showcase.map((t, i) => {
            const photo = PHOTO[t.threshold];
            const shown = reduced || i === index;
            return (
              <div
                key={t.name}
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                  shown ? "opacity-100" : "pointer-events-none opacity-0"
                } ${reduced ? "!relative !inset-auto" : ""}`}
                aria-hidden={!shown}
              >
                {photo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    width={photo.w}
                    height={photo.h}
                    loading="eager"
                    decoding="async"
                    className={`wg-img max-h-[220px] w-auto object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,.55)] ${
                      reduced ? "max-h-[110px]" : ""
                    }`}
                  />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center">
                    {art[i]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        </div>

        {!reduced && (
          <>
            <p aria-live="polite" className="wg-name relative mt-4 text-center">
              <span className="block text-[19px] font-semibold tracking-[-0.01em] text-white">
                {current?.name}
              </span>
              <span className="mt-1 block text-[13px] font-medium text-[var(--color-mint)]">
                {current?.threshold}{" "}
                {current?.threshold === 1 ? "referral joins" : "referrals join"}
              </span>
            </p>

            <div className="wg-dots relative mt-3.5 flex justify-center gap-1.5" aria-hidden="true">
              {showcase.map((t, i) => (
                <span
                  key={t.name}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index ? "w-5 bg-white" : "w-1.5 bg-white/30"
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {reduced && (
          <p className="mt-3 text-center text-[13px] text-white/70">
            {showcase.map((t) => t.name).join(" · ")}
          </p>
        )}
      </div>

      {/* The board — everything at once, so nobody waits for the carousel. */}
      <div className="wg-board wg-pad px-7 pt-5 pb-4">
        <p className="wg-label mb-2.5 text-[11px] font-semibold tracking-[0.12em] text-[var(--color-ink-3)] uppercase">
          What you get
        </p>

        <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
          <div className="wg-cash flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-gold-soft)] px-4 py-3">
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
                  className="wg-row flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-2.5 last:border-b-0"
                >
                  <span className="text-[13.5px] font-medium">{t.name}</span>
                  <span className="shrink-0 text-[12.5px] text-[var(--color-ink-3)]">
                    {t.threshold} {t.threshold === 1 ? "referral joins" : "referrals join"}
                  </span>
                </li>
              ))}
          </ul>
        </div>

        <p className="wg-note mt-3 text-[12px] leading-relaxed text-[var(--color-ink-3)]">
          Rewards are taxable salary income and shown gross. Gift tiers are tracked here;
          ordering and delivery are handled by HR.
        </p>

      </div>
      </div>

      {/* The footer never scrolls away: the primary action is visible on every
          screen size, whatever the content above it is doing. */}
      <div className="wg-pad shrink-0 border-t border-[var(--color-line)] bg-white px-7 pt-3 pb-3">
        <button
          type="button"
          onClick={() => leave("/roles")}
          disabled={pending}
          className="btn-primary w-full !py-3 text-[15px]"
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
          className="mt-1.5 w-full py-1.5 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink)] hover:underline"
        >
          Maybe later
        </button>
      </div>

      <style>{`
        .welcome-in  { animation: wIn 260ms cubic-bezier(.2,.8,.3,1) both; }
        .welcome-out { animation: wOut 180ms ease-in both; }
        @keyframes wIn  { from { opacity: 0; transform: translateY(14px) scale(.985); } }
        @keyframes wOut { to   { opacity: 0; transform: translateY(-6px) scale(.99); } }

        /* The stage carries the perspective; the photo does the turning. */
        .flip-stage { perspective: 1100px; }
        .flip-photo {
          transition: transform ${HALF_FLIP}ms cubic-bezier(.4,0,.2,1), opacity ${HALF_FLIP}ms linear;
          transform: rotateY(0deg);
          transform-style: preserve-3d;
          will-change: transform;
        }
        .flip-photo.is-flipping { transform: rotateY(90deg); opacity: .25; }

        /* Unlayered, so these win over Tailwind's layered utilities. The aim
           is for the whole poster to fit without scrolling on a normal laptop
           and still read well on a phone; scrolling is the fallback, not the
           plan. */
        @media (max-height: 860px) {
          .wg-hero  { padding-top: 16px; padding-bottom: 18px; }
          .wg-title { font-size: 22px; }
          .wg-show  { padding-top: 14px; padding-bottom: 14px; }
          .wg-stage { height: 160px; }
          .wg-img   { max-height: 160px; }
          .wg-board { padding-top: 14px; padding-bottom: 12px; }
          .wg-name  { margin-top: 10px; }
          .wg-dots  { margin-top: 8px; }
          .wg-label { margin-bottom: 8px; }
          .wg-cash  { padding-top: 8px; padding-bottom: 8px; }
          .wg-row   { padding-top: 7px; padding-bottom: 7px; }
          .wg-note  { margin-top: 8px; }
        }
        @media (max-height: 780px) {
          .wg-stage { height: 138px; }
          .wg-img   { max-height: 138px; }
        }
        @media (max-height: 700px) {
          .wg-stage { height: 120px; }
          .wg-img   { max-height: 120px; }
        }
        @media (max-width: 420px) {
          .wg-pad   { padding-left: 18px; padding-right: 18px; }
          .wg-title { font-size: 21px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .welcome-in, .welcome-out { animation: none; }
          .flip-photo { transition: none; }
        }
      `}</style>
    </dialog>
  );
}
