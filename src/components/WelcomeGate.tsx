"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeWelcome } from "@/app/(app)/welcome-actions";
import { CashRain, CoinStackArt, VacationArt, WatchArt, PhoneArt, BikeArt } from "@/components/RewardArt";

export type Tier = {
  name: string;
  /** Reward points. */
  threshold: number;
  blurb: string | null;
  art: string | null;
};

/**
 * The product photograph for each tier, keyed on milestone_tiers.art.
 *
 * Keyed on the art column rather than the name or the threshold: names are
 * HR's to edit and thresholds changed from referral counts to points on
 * 23 Sep 2026, and either would silently have dropped the pictures.
 */
const PHOTO: Record<string, { src: string; w: number; h: number; alt: string }> = {
  watch: { src: "/rewards/smartwatch.webp", w: 363, h: 480, alt: "Smartwatch" },
  phone: { src: "/rewards/smartphone.webp", w: 289, h: 620, alt: "Smartphone" },
  harley: { src: "/rewards/harley.webp", w: 674, h: 620, alt: "Harley-Davidson motorcycle" },
};

/** Tiers with no photograph yet get a drawn piece sized for the same stage. */
function Drawn({ art }: { art: string | null }) {
  switch (art) {
    case "vacation":
      return <VacationArt className="wg-img h-[220px] w-auto" />;
    case "watch":
      return <WatchArt className="h-28 w-28" />;
    case "phone":
      return <PhoneArt className="h-28 w-28" />;
    default:
      return <BikeArt className="h-28 w-28" />;
  }
}

const FLIP_EVERY = 3200;
const HALF_FLIP = 260;
/** After someone uses the arrows, leave the carousel where they put it. */
const PAUSE_AFTER_INTERACTION = 9000;
const SWIPE_PX = 40;

// Read the clock outside the component. These only ever run from event
// handlers and a timer, but the React compiler cannot prove that about a
// function defined in the render body, and flags the impure call.
const holdUntil = () => Date.now() + PAUSE_AFTER_INTERACTION;
const isHeld = (until: number) => Date.now() < until;

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

const indian = (n: number) => Math.round(n).toLocaleString("en-IN");

/**
 * The programme poster, shown on arriving at Home.
 *
 * Mandatory in the sense the brief asked for: Escape and click-outside are
 * both refused, and the buttons are the only way out.
 *
 * The gifts flip through biggest first — Harley, vacation, smartphone,
 * smartwatch — and can be driven by hand with the arrows, the dots, a swipe
 * or the arrow keys. The board underneath carries all four at once, so
 * nobody has to wait for the carousel to come round to read the thing they
 * care about: the motion is for attention, the board is for information.
 */
export default function WelcomeGate({
  tiers,
  cashRange,
}: {
  tiers: Tier[];
  cashRange: { min: number; max: number } | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState(false);

  const showcase = [...tiers].sort((a, b) => b.threshold - a.threshold);
  const ladder = [...tiers].sort((a, b) => a.threshold - b.threshold);

  const [index, setIndex] = useState(0);
  const [flip, setFlip] = useState<"next" | "prev" | null>(null);
  const reduced = useReducedMotion();
  const pausedUntil = useRef(0);
  const busy = useRef(false);
  const swipeFrom = useRef<number | null>(null);
  // The autoplay timer reads the position through a ref, so it never has to
  // be torn down and restarted every time the slide changes.
  const indexRef = useRef(0);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.open) return;
    el.showModal();
    // showModal() focuses the first focusable element — now an arrow, before
    // that the bottom button, which scrolled the headline out of view. Focus
    // the title instead: a screen reader announces what this is, and the
    // poster opens at the top.
    titleRef.current?.focus({ preventScroll: true });
    bodyRef.current?.scrollTo({ top: 0 });
    const stopCancel = (e: Event) => e.preventDefault();
    el.addEventListener("cancel", stopCancel);
    return () => el.removeEventListener("cancel", stopCancel);
  }, []);

  /**
   * Move to a tier. A half-turn out, swap the face at the edge, a half-turn
   * back in — turning with the direction of travel. Ignored while a turn is
   * already under way, so a burst of clicks cannot tear it.
   */
  const go = useCallback(
    (target: number, dir: "next" | "prev") => {
      const n = showcase.length;
      if (n < 2 || busy.current) return;
      const to = ((target % n) + n) % n;
      if (reduced) {
        setIndex(to);
        return;
      }
      busy.current = true;
      setFlip(dir);
      window.setTimeout(() => {
        setIndex(to);
        setFlip(null);
        window.setTimeout(() => {
          busy.current = false;
        }, HALF_FLIP);
      }, HALF_FLIP);
    },
    [reduced, showcase.length],
  );

  /** A step the person asked for, which also holds the autoplay off. */
  const step = (dir: "next" | "prev") => {
    pausedUntil.current = holdUntil();
    go(indexRef.current + (dir === "next" ? 1 : -1), dir);
  };

  const jump = (to: number) => {
    if (to === indexRef.current) return;
    pausedUntil.current = holdUntil();
    go(to, to > indexRef.current ? "next" : "prev");
  };

  // Autoplay. Off under reduced motion — the board already says everything
  // the carousel would — and paused for a while after someone takes over.
  useEffect(() => {
    if (reduced || showcase.length < 2) return;
    const tick = window.setInterval(() => {
      if (isHeld(pausedUntil.current)) return;
      go(indexRef.current + 1, "next");
    }, FLIP_EVERY);
    return () => window.clearInterval(tick);
  }, [reduced, showcase.length, go]);

  function onKeyDown(e: React.KeyboardEvent) {
    // A <dialog> closes on Escape by default. This one should not.
    if (e.key === "Escape") {
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step("next");
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step("prev");
    }
  }

  /**
   * Close, move on, and record the acknowledgement behind it. The recording
   * round-trips to Neon in Virginia (§4); waiting on it meant clicking and
   * watching nothing happen, so the UI goes first. If it fails the poster
   * shows again next time, which is the safe direction to fail in.
   */
  function leave(to?: string) {
    setClosing(true);
    ref.current?.close();
    if (to) router.push(to);
    start(async () => {
      try {
        await acknowledgeWelcome();
      } catch {
        // They simply see it once more.
      }
    });
  }

  const current = showcase[index];

  return (
    <dialog
      ref={ref}
      aria-labelledby="welcome-title"
      onKeyDown={onKeyDown}
      className={`m-auto w-[min(calc(100vw-24px),560px)] max-h-[calc(100dvh-24px)] max-w-none
                  overflow-hidden rounded-2xl border border-[var(--color-line)] p-0 open:flex open:flex-col
                  backdrop:bg-[#171b24]/60 backdrop:backdrop-blur-[3px]
                  ${closing ? "welcome-out" : "welcome-in"}`}
    >
      {/* Scrolls on its own, inside a height capped to the screen, so nothing
          is ever cut off; the buttons live in a footer that never moves. */}
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

        {/* The showcase, on a near-black stage: the Harley was shot on a dark
            gradient and the other photos were keyed out of white, so dark is
            the one surface they all sit on without looking pasted. */}
        <section
          aria-roledescription="carousel"
          aria-label="Gifts you can earn"
          className="wg-show relative overflow-hidden bg-[#12151c] px-4 py-6"
        >
          <div className="relative flex items-center gap-2">
            <ArrowButton dir="prev" onClick={() => step("prev")} />

            <div
              className="flip-stage min-w-0 flex-1 touch-pan-y select-none"
              onPointerDown={(e) => {
                swipeFrom.current = e.clientX;
              }}
              onPointerUp={(e) => {
                const from = swipeFrom.current;
                swipeFrom.current = null;
                if (from === null) return;
                const dx = e.clientX - from;
                if (dx <= -SWIPE_PX) step("next");
                else if (dx >= SWIPE_PX) step("prev");
              }}
              onPointerCancel={() => {
                swipeFrom.current = null;
              }}
            >
              {/* Every face is rendered from the start and only revealed in
                  turn, so moving never waits on a download. Perspective sits
                  on the parent; the child turns. */}
              <div
                className={`wg-stage flip-photo relative flex h-[220px] w-full items-center justify-center ${
                  flip === "next" ? "is-flip-next" : flip === "prev" ? "is-flip-prev" : ""
                }`}
              >
                {showcase.map((t, i) => {
                  const photo = t.art ? PHOTO[t.art] : undefined;
                  const shown = i === index;
                  return (
                    <div
                      key={t.name}
                      role="group"
                      aria-roledescription="slide"
                      aria-label={`${i + 1} of ${showcase.length}: ${t.name}`}
                      aria-hidden={!shown}
                      className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                        shown ? "opacity-100" : "pointer-events-none opacity-0"
                      }`}
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
                          draggable={false}
                          className="wg-img max-h-[220px] w-auto object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,.55)]"
                        />
                      ) : (
                        <Drawn art={t.art} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <ArrowButton dir="next" onClick={() => step("next")} />
          </div>

          {/* aria-live so a change of gift is announced, not silent. */}
          <p aria-live="polite" className="wg-name relative mt-4 text-center">
            <span className="block text-[19px] font-semibold tracking-[-0.01em] text-white">
              {current?.name}
            </span>
            <span className="mt-1 block text-[13px] font-medium text-[var(--color-mint)]">
              {current ? `${indian(current.threshold)} reward points` : ""}
            </span>
          </p>

          <div className="wg-dots relative mt-3 flex justify-center gap-1">
            {showcase.map((t, i) => (
              <button
                key={t.name}
                type="button"
                onClick={() => jump(i)}
                aria-label={`Show ${t.name}`}
                aria-current={i === index ? "true" : undefined}
                // The visible dot is small; the button around it is a proper
                // touch target.
                className="flex h-6 items-center justify-center px-1"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    i === index ? "w-5 bg-white" : "w-1.5 bg-white/35 hover:bg-white/60"
                  }`}
                />
              </button>
            ))}
          </div>
        </section>

        {/* The board — everything at once, so nobody waits for the carousel. */}
        <div className="wg-board wg-pad px-7 pt-5 pb-4">
          <p className="wg-label mb-2.5 text-[11px] font-semibold tracking-[0.12em] text-[var(--color-ink-3)] uppercase">
            What you get
          </p>

          <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
            <div className="wg-cash flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-gold-soft)] px-4 py-3">
              <CoinStackArt className="h-9 w-9 shrink-0" />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold">
                  {cashRange
                    ? `₹${indian(cashRange.min)} – ₹${indian(cashRange.max)} on every hire`
                    : "Cash on every hire"}
                </p>
                <p className="text-[12.5px] leading-snug text-[var(--color-ink-2)]">
                  Set by the role&apos;s band. Every rupee also earns a reward point.
                </p>
              </div>
            </div>

            <ul>
              {ladder.map((t) => (
                <li
                  key={t.name}
                  className="wg-row flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-2.5 last:border-b-0"
                >
                  <span className="text-[13.5px] font-medium">{t.name}</span>
                  <span className="shrink-0 text-[12.5px] text-[var(--color-ink-3)] tabular-nums">
                    {indian(t.threshold)} points
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="wg-note mt-3 text-[12px] leading-relaxed text-[var(--color-ink-3)]">
            Taxable salary income, shown gross. Points count on people who join.
          </p>
        </div>
      </div>

      {/* The footer never scrolls away: the primary action is visible on every
          screen size. */}
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
            particular page. */}
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

        .flip-stage { perspective: 1100px; }
        .flip-photo {
          transition: transform ${HALF_FLIP}ms cubic-bezier(.4,0,.2,1), opacity ${HALF_FLIP}ms linear;
          transform: rotateY(0deg);
          transform-style: preserve-3d;
          will-change: transform;
        }
        /* Turning with the direction of travel. */
        .flip-photo.is-flip-next { transform: rotateY(-90deg); opacity: .25; }
        .flip-photo.is-flip-prev { transform: rotateY(90deg);  opacity: .25; }

        /* Unlayered, so these win over Tailwind's layered utilities. The aim
           is to fit without scrolling on a normal laptop and read well on a
           phone; scrolling is the fallback, not the plan. */
        @media (max-height: 960px) {
          .wg-hero  { padding-top: 16px; padding-bottom: 18px; }
          .wg-title { font-size: 22px; }
          .wg-show  { padding-top: 12px; padding-bottom: 10px; }
          .wg-stage { height: 150px; }
          .wg-img   { max-height: 150px; height: auto; }
          .wg-board { padding-top: 12px; padding-bottom: 10px; }
          .wg-name  { margin-top: 8px; }
          .wg-dots  { margin-top: 4px; }
          .wg-label { margin-bottom: 7px; }
          .wg-cash  { padding-top: 7px; padding-bottom: 7px; }
          .wg-row   { padding-top: 6px; padding-bottom: 6px; }
          .wg-note  { margin-top: 7px; }
        }
        @media (max-height: 780px) {
          .wg-stage { height: 104px; }
          .wg-img   { max-height: 104px; }
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

function ArrowButton({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "prev" ? "Previous gift" : "Next gift"}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white
                 ring-1 ring-white/15 transition hover:bg-white/20 active:scale-95
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true" fill="none">
        <path
          d={dir === "prev" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
