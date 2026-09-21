/**
 * Animated artwork for the programme poster.
 *
 * Drawn as SVG rather than generated as images, for reasons that are design
 * decisions rather than convenience: a raster watch cannot rotate and raster
 * cash cannot fall, so animating pictures would mean sliding flat images
 * around — which reads as cheap. These are a few KB, stay sharp on any
 * screen, and take their colours from the brand tokens.
 *
 * Motion is CSS transforms and opacity only: no JavaScript loop, no layout
 * thrash, and the compositor does the work.
 *
 * Every animation is switched off under `prefers-reduced-motion`. Spinning
 * and falling things are exactly what that setting exists to stop, and a
 * poster nobody can look at is worse than a still one.
 */

export function CashRain({ className = "" }: { className?: string }) {
  // Deterministic scatter — a random() here would differ between the server
  // and client render and trip hydration.
  const notes = [
    { x: 14, delay: 0, dur: 3.4, rot: -14, scale: 1 },
    { x: 34, delay: 0.7, dur: 4.1, rot: 9, scale: 0.85 },
    { x: 54, delay: 1.5, dur: 3.1, rot: -6, scale: 1.05 },
    { x: 74, delay: 0.35, dur: 4.6, rot: 16, scale: 0.78 },
    { x: 90, delay: 2.1, dur: 3.7, rot: -11, scale: 0.92 },
  ];

  return (
    <svg
      viewBox="0 0 110 70"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      {notes.map((n, i) => (
        <g key={i} className="cash-note" style={{ ["--d" as string]: `${n.delay}s`, ["--t" as string]: `${n.dur}s` }}>
          <g transform={`translate(${n.x} 0) rotate(${n.rot}) scale(${n.scale})`}>
            <rect
              x="-11" y="-7" width="22" height="14" rx="2.5"
              fill="var(--color-good-soft)" stroke="var(--color-good)" strokeWidth="1.1"
            />
            <circle cx="0" cy="0" r="4" fill="none" stroke="var(--color-good)" strokeWidth="1.1" />
            {/* ₹ */}
            <path
              d="M-1.7 -2.4h3.4M-1.7 -0.6h3.4M1 -2.4c1.2 0 1.2 1.8 0 1.8h-1.6l2.3 3"
              fill="none" stroke="var(--color-good)" strokeWidth="1" strokeLinecap="round"
            />
          </g>
        </g>
      ))}
      <style>{`
        .cash-note {
          animation: cashFall var(--t) linear var(--d) infinite;
          transform-box: view-box;
        }
        @keyframes cashFall {
          0%   { transform: translateY(-16px); opacity: 0; }
          12%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(84px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cash-note { animation: none; opacity: .9; transform: translateY(28px); }
        }
      `}</style>
    </svg>
  );
}

/** A watch face that turns, as though being looked over. */
export function WatchArt({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g className="watch-spin" style={{ transformOrigin: "32px 32px" }}>
        <rect x="24" y="6" width="16" height="9" rx="3" fill="var(--color-mint)" opacity=".45" />
        <rect x="24" y="49" width="16" height="9" rx="3" fill="var(--color-mint)" opacity=".45" />
        <rect
          x="17" y="14" width="30" height="36" rx="9"
          fill="#fff" stroke="var(--color-mint)" strokeWidth="2.4"
        />
        <circle cx="32" cy="32" r="10" fill="var(--color-mint-soft)" />
        <path
          d="M32 26v6l4 2.6"
          fill="none" stroke="var(--color-mint)" strokeWidth="2.2" strokeLinecap="round"
        />
        <rect x="46.4" y="28" width="3" height="7" rx="1.5" fill="var(--color-mint)" />
      </g>
      <style>{`
        .watch-spin { animation: watchTurn 5.5s ease-in-out infinite; }
        @keyframes watchTurn {
          0%, 100% { transform: rotateY(0deg); }
          50%      { transform: rotateY(38deg); }
        }
        @media (prefers-reduced-motion: reduce) { .watch-spin { animation: none; } }
      `}</style>
    </svg>
  );
}

/** A phone that lifts and tilts — the "dancing" one, kept to a sway. */
export function PhoneArt({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g className="phone-sway" style={{ transformOrigin: "32px 52px" }}>
        <rect
          x="20" y="8" width="24" height="48" rx="5"
          fill="#fff" stroke="var(--color-brand)" strokeWidth="2.4"
        />
        <rect x="23" y="13" width="18" height="33" rx="2" fill="var(--color-brand-soft)" />
        <rect x="28" y="10.4" width="8" height="1.8" rx="0.9" fill="var(--color-brand)" opacity=".5" />
        <circle cx="32" cy="51" r="2" fill="var(--color-brand)" opacity=".5" />
        <g className="phone-glint">
          <rect x="25" y="16" width="14" height="2.4" rx="1.2" fill="var(--color-brand)" opacity=".28" />
          <rect x="25" y="21" width="9" height="2.4" rx="1.2" fill="var(--color-brand)" opacity=".2" />
        </g>
      </g>
      <style>{`
        .phone-sway { animation: phoneSway 3.6s ease-in-out infinite; }
        @keyframes phoneSway {
          0%, 100% { transform: translateY(0) rotate(-3.5deg); }
          50%      { transform: translateY(-4px) rotate(3.5deg); }
        }
        .phone-glint { animation: glint 3.6s ease-in-out infinite; }
        @keyframes glint { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .phone-sway, .phone-glint { animation: none; }
        }
      `}</style>
    </svg>
  );
}

/**
 * A motorcycle riding in from the left, wheels turning.
 *
 * Solid silhouette rather than line art, and the body deliberately heavier
 * than the wheels. Two earlier attempts drew a thin frame between two large
 * spoked wheels, and at 64px that reads as a bicycle no matter how many
 * exhaust pipes are added — wheel-to-body mass is what the eye uses to tell
 * the two apart, not detail.
 */
export function BikeArt({ className = "h-16 w-16" }: { className?: string }) {
  const wheel = (cx: number) => (
    <g>
      <circle cx={cx} cy="45" r="9" fill="var(--color-gold)" opacity=".2" />
      <circle cx={cx} cy="45" r="9" fill="none" stroke="var(--color-gold)" strokeWidth="3" />
      <g className="wheel" style={{ transformOrigin: `${cx}px 45px` }}>
        <circle cx={cx} cy="45" r="3.4" fill="var(--color-gold)" />
        <path
          d={`M${cx} 39.4v11.2M${cx - 5.6} 45h11.2`}
          stroke="var(--color-gold)" strokeWidth="1.5" opacity=".75"
        />
      </g>
    </g>
  );

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g className="bike-ride">
        {wheel(13)}
        {wheel(51)}

        {/* One heavy body mass: tank into seat into rear guard. */}
        <path
          d="M19 40c-1.4-4 1-7.4 5.2-8.2 3-.6 5.6-.4 8 .4l3.4-4.2h6.6l-1.2 4.6c3.4 1 5.8 3 7.4 5.8l2.6 4.6-4.8 1.2-2.2-3.4c-1.2 3-3.6 4.6-6.8 4.6H24c-2.6 0-4.4-1.8-5-4.6Z"
          fill="var(--color-gold)"
        />
        {/* Headlight and swept bars. */}
        <path
          d="M23.5 31 20 24.5"
          stroke="var(--color-gold)" strokeWidth="3" strokeLinecap="round"
        />
        <path
          d="M15.5 22.5c3-1.8 6.4-1.4 8.6.8"
          fill="none" stroke="var(--color-gold)" strokeWidth="2.6" strokeLinecap="round"
        />
        <circle cx="19" cy="27" r="2.6" fill="#fff" stroke="var(--color-gold)" strokeWidth="2" />
        {/* Fork down to the front wheel. */}
        <path d="M20.5 30 13 45" stroke="var(--color-gold)" strokeWidth="3" strokeLinecap="round" />
        {/* Exhaust along the bottom. */}
        <path d="M27 48.5h17" stroke="var(--color-gold)" strokeWidth="2.6" strokeLinecap="round" opacity=".7" />
      </g>

      {/* Speed lines that catch up as it arrives. */}
      <g className="bike-lines" stroke="var(--color-gold)" strokeWidth="1.8" strokeLinecap="round" opacity=".4">
        <path d="M2 34h9" /><path d="M0 40h6" /><path d="M2 46h8" />
      </g>

      <style>{`
        .bike-ride { animation: bikeIn 4.4s cubic-bezier(.22,.7,.3,1) infinite; }
        @keyframes bikeIn {
          0%      { transform: translateX(-50px); opacity: 0; }
          20%     { opacity: 1; }
          42%,74% { transform: translateX(0); opacity: 1; }
          100%    { transform: translateX(50px); opacity: 0; }
        }
        .wheel { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .bike-lines { animation: dash 4.4s ease-out infinite; }
        @keyframes dash {
          0%,16%   { opacity: 0; transform: translateX(-8px); }
          30%      { opacity: .45; transform: translateX(0); }
          58%,100% { opacity: 0; transform: translateX(10px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bike-ride, .wheel, .bike-lines { animation: none; }
          .bike-lines { opacity: .3; }
        }
      `}</style>
    </svg>
  );
}

/** Rupee coins stacking up — used beside the cash headline. */
export function CoinStackArt({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <g key={i} className="coin" style={{ ["--i" as string]: i }}>
          <ellipse cx="32" cy={46 - i * 9} rx="16" ry="6" fill="var(--color-gold-soft)" stroke="var(--color-gold)" strokeWidth="2" />
        </g>
      ))}
      <g className="coin-top">
        <circle cx="32" cy="19" r="10" fill="#fff" stroke="var(--color-gold)" strokeWidth="2.2" />
        <path
          d="M28.6 15h6.8M28.6 18h6.8M33 15c2.4 0 2.4 3.6 0 3.6h-3.2L34.4 24"
          fill="none" stroke="var(--color-gold)" strokeWidth="1.7" strokeLinecap="round"
        />
      </g>
      <style>{`
        .coin { animation: coinDrop .7s cubic-bezier(.2,.9,.3,1) both; animation-delay: calc(var(--i) * .13s); }
        @keyframes coinDrop { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; } }
        .coin-top { animation: coinFloat 3.2s ease-in-out .6s infinite; transform-origin: 32px 19px; }
        @keyframes coinFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3.5px); } }
        @media (prefers-reduced-motion: reduce) {
          .coin, .coin-top { animation: none; opacity: 1; }
        }
      `}</style>
    </svg>
  );
}
