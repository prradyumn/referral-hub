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

export const IS_SHOWCASE = true;

// ------------------------------------------------------------------ home
export const homeStats = {
  referrals: { made: 7, joined: 2, inProgress: 4 },
  cash: { accumulated: 47000, collected: 20000, toReceive: 27000 },
  gifts: { earned: 1, inProcess: 1 },
};

export const latestUpdate = {
  candidate: "Ananya Rao",
  headline: "Ananya Rao joined as Data Analyst",
  detail: "Your ₹12,000 reward is eligible from 14 Oct, after 30 days.",
  on: "2026-09-14",
};

// -------------------------------------------------------------- referrals
// REMOVED 21 Sep 2026. The referral journey now comes from `referral_stages`,
// filled by the Keka stage sync, and is rendered by visibleJourney() in
// src/lib/keka/stages.ts. The header of this file says to delete an entry
// rather than leave a silent fallback when a screen goes live — this is that.

// ---------------------------------------------------------------- rewards
export type ShowcaseReward = {
  id: string;
  candidate: string;
  role: string;
  amount: number;
  kind: "cash" | "gift";
  status: "Paid" | "Approved, in payroll" | "Eligible from" | "Pending joining";
  note: string;
};

export const rewards: ShowcaseReward[] = [
  {
    id: "REF-4A21B9C0",
    candidate: "Ananya Rao",
    role: "Data Analyst",
    amount: 12000,
    kind: "cash",
    status: "Eligible from",
    note: "14 Oct 2026, once 30 days are complete",
  },
  {
    id: "REF-77E1D0A4",
    candidate: "Imran Qureshi",
    role: "Backend Engineer",
    amount: 15000,
    kind: "cash",
    status: "Approved, in payroll",
    note: "October payroll · gross, TDS applies",
  },
  {
    id: "REF-1B93C55E",
    candidate: "Meera Nair",
    role: "UX Designer",
    amount: 20000,
    kind: "cash",
    status: "Paid",
    note: "Paid with August salary",
  },
  {
    id: "REF-2C40FA18",
    candidate: "Rohit Deshmukh",
    role: "Field Coordinator",
    amount: 6000,
    kind: "gift",
    status: "Pending joining",
    note: "Smartwatch · dispatched once they complete 90 days",
  },
];

export const nextMilestone = {
  name: "Smartphone",
  achieved: 2,
  target: 3,
  blurb: "One more referral who joins unlocks this.",
};

export const milestones = [
  { name: "Smartwatch", at: 1, unlocked: true },
  { name: "Smartphone", at: 3, unlocked: false },
  { name: "Harley ride experience", at: 6, unlocked: false },
];

// ------------------------------------------------------------ leaderboard
export type LeaderboardPeriod = "monthly" | "quarterly" | "yearly" | "all-time";

export const LEADERBOARD_PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "monthly", label: "This month" },
  { id: "quarterly", label: "This quarter" },
  { id: "yearly", label: "This year" },
  { id: "all-time", label: "All time" },
];

export const leaderboard: Record<
  LeaderboardPeriod,
  { name: string; department: string; joined: number; earned: number }[]
> = {
  monthly: [
    { name: "Kavita Menon", department: "Programs", joined: 2, earned: 40000 },
    { name: "Arjun Pillai", department: "Engineering", joined: 1, earned: 15000 },
    { name: "Sana Fatima", department: "Content", joined: 1, earned: 10000 },
  ],
  quarterly: [
    { name: "Arjun Pillai", department: "Engineering", joined: 4, earned: 62000 },
    { name: "Kavita Menon", department: "Programs", joined: 3, earned: 55000 },
    { name: "Devika Iyer", department: "Data & Insights", joined: 2, earned: 30000 },
  ],
  yearly: [
    { name: "Kavita Menon", department: "Programs", joined: 9, earned: 168000 },
    { name: "Arjun Pillai", department: "Engineering", joined: 7, earned: 121000 },
    { name: "Nikhil Barman", department: "Government Relations", joined: 5, earned: 105000 },
  ],
  "all-time": [
    { name: "Kavita Menon", department: "Programs", joined: 21, earned: 392000 },
    { name: "Arjun Pillai", department: "Engineering", joined: 18, earned: 310000 },
    { name: "Nikhil Barman", department: "Government Relations", joined: 12, earned: 244000 },
  ],
};

// ------------------------------------------------------------- benefits
export const benefits = [
  {
    name: "Smartwatch",
    at: "1 referral joins",
    blurb: "Your first successful referral earns a smartwatch alongside the cash reward.",
  },
  {
    name: "Smartphone",
    at: "3 referrals join",
    blurb: "Three people you brought in, still with us past their first month.",
  },
  {
    name: "Harley ride experience",
    at: "6 referrals join",
    blurb: "The one people talk about. Six joiners in a financial year.",
  },
];

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
