/**
 * Illustrative data for screens whose features are not built yet.
 *
 * Phase 0 ships referrals only. Rewards, gifts, milestones and the leaderboard
 * arrive in Phases 1–3 (see CONTEXT.md §12), but the shape of those screens is
 * being agreed now, so they are rendered from this file.
 *
 * Every screen fed from here shows a "Sample data" marker. CONTEXT.md §7
 * convention 1 exists because the prototype told employees things had happened
 * when nothing had; showing invented numbers as real is the same failure.
 * If you wire a screen to live data, delete its entry here rather than leaving
 * a silent fallback.
 */

/** Only copy is left in here now; no invented figures remain. */
export const IS_SHOWCASE = true;

// ------------------------------------------------------------------ home
// ---------------------------------------------------------------- rewards
// ------------------------------------------------------------ leaderboard
// ALL REMOVED 21 Sep 2026. Home, My rewards and the leaderboard now read the
// real ledger: src/lib/rewards.ts over referral_rewards, milestone_tiers and
// referrals.joined_at, filled by the Keka stage sync reaching `Hired`.
//
// What remains below is content, not invented figures — the gift tiers shown
// on the welcome dialog and how-to page, and the policy wording. Those are
// copy awaiting HR sign-off rather than numbers pretending to be data.

// ------------------------------------------------------------- benefits
// REMOVED 23 Sep 2026. The gift ladder lives in milestone_tiers and is read
// from there by /rewards, /home, /how-to-refer and the poster; it is now in
// reward points rather than referral counts.

// ----------------------------------------------------------- how to refer
export const howToSteps = [
  {
    title: "Find a role worth their time",
    body: "Browse open roles, filter by department or location, and read what the team actually needs. Priority roles are marked.",
  },
  {
    title: "Ask them first",
    body: "Talk to the person before you submit. You will be asked to confirm they agreed — we store that confirmation against the referral.",
  },
  {
    title: "Submit their details",
    body: "Name, email, phone and how you know them. Two minutes. We check for duplicates on email and phone as you submit.",
  },
  {
    title: "Track it here",
    body: "Every stage change appears in My referrals. You never need to chase a recruiter for a status.",
  },
  {
    title: "Get paid through payroll",
    body: "Once they join and complete the qualifying period, the reward is approved and paid with your salary. It is taxable income, shown gross.",
  },
];

export const policyPoints = [
  "Anyone may refer, including HR and Talent Acquisition. Exclusions apply when a reward is assessed, not when you submit.",
  "The first referral on record for a candidate holds. You are never told who referred someone before you.",
  "A referral stays valid for six months from submission.",
  "The reward rate is fixed at the moment you submit. A later change to the programme never rewrites it.",
  "An employee serving notice is not eligible for a reward.",
  "Rewards are paid through payroll and are taxable salary income. Amounts shown are gross.",
];
