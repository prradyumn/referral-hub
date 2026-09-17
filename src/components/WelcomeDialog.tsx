"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { benefits } from "@/lib/showcase";

const SEEN_KEY = "referral-hub:welcome-seen";

// Drawn rather than photographed so the tiers read at a glance and cost nothing
// to load. Replace with the real benefits flyer artwork when it exists.
function BenefitArt({ index }: { index: number }) {
  const common = { fill: "none", strokeWidth: 2, strokeLinecap: "round" as const };
  if (index === 0)
    return (
      <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden="true">
        <rect x="16" y="14" width="16" height="20" rx="4" stroke="currentColor" {...common} />
        <path d="M20 14V9h8v5M20 34v5h8v-5" stroke="currentColor" {...common} />
        <path d="M24 20v4l3 2" stroke="currentColor" {...common} />
      </svg>
    );
  if (index === 1)
    return (
      <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden="true">
        <rect x="15" y="8" width="18" height="32" rx="4" stroke="currentColor" {...common} />
        <path d="M21 12h6" stroke="currentColor" {...common} />
        <circle cx="24" cy="34" r="1.6" fill="currentColor" />
      </svg>
    );
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden="true">
      <circle cx="13" cy="31" r="7" stroke="currentColor" {...common} />
      <circle cx="35" cy="31" r="7" stroke="currentColor" {...common} />
      <path d="M13 31l7-11h9l6 11M20 20l-3-5h6" stroke="currentColor" {...common} />
    </svg>
  );
}

export default function WelcomeDialog() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let seen = "1";
    try {
      seen = window.localStorage.getItem(SEEN_KEY) ?? "";
    } catch {
      // Private window, or storage blocked. Treat as seen and stay out of the way.
      seen = "1";
    }
    if (!seen) setOpen(true);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function dismiss() {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing to do — it simply shows again next time.
    }
    setOpen(false);
  }

  return (
    <dialog
      ref={ref}
      onClose={dismiss}
      onClick={(e) => {
        if (e.target === ref.current) dismiss();
      }}
      className="m-auto w-[min(92vw,540px)] rounded-xl border border-[var(--color-line)] p-0 backdrop:bg-[#171b24]/45 backdrop:backdrop-blur-sm"
    >
      <div className="p-7">
        <p className="text-[12px] font-medium tracking-wide text-[var(--color-mint)] uppercase">
          Refer someone you rate
        </p>
        <h2 className="mt-1.5 text-[23px] font-semibold tracking-tight">
          Cash on every hire. Gifts as they add up.
        </h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">
          Every referral who joins earns you a cash reward through payroll. Keep going and
          the milestones unlock on top.
        </p>

        <ul className="mt-6 grid gap-3">
          {benefits.map((b, i) => (
            <li
              key={b.name}
              className="flex items-start gap-4 rounded-lg border border-[var(--color-line)] p-3.5"
              style={{
                animation: `welcomeIn 420ms cubic-bezier(.2,.7,.3,1) ${i * 90}ms both`,
              }}
            >
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--color-mint-soft)] text-[var(--color-mint)]"
                aria-hidden="true"
              >
                <BenefitArt index={i} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{b.name}</span>
                <span className="mt-0.5 block text-[12.5px] font-medium text-[var(--color-mint)]">
                  {b.at}
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-[var(--color-ink-2)]">
                  {b.blurb}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-[12px] text-[var(--color-ink-3)]">
          Milestone gifts are a Phase 2 feature. The tiers shown here are illustrative.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Link href="/roles" onClick={dismiss} className="btn-primary flex-1">
            Browse open roles
          </Link>
          <Link href="/how-to-refer" onClick={dismiss} className="btn-ghost">
            How it works
          </Link>
          <button type="button" onClick={dismiss} className="btn-ghost sm:mr-auto">
            Not now
          </button>
        </div>
      </div>

      <style>{`
        @keyframes welcomeIn {
          from { opacity: 0; transform: translateY(10px) scale(.98); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          dialog li { animation: none !important; }
        }
      `}</style>
    </dialog>
  );
}
