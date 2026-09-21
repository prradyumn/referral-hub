/**
 * Which settings an admin may change, and how each is validated.
 *
 * Kept out of actions.ts because a "use server" module may only export async
 * functions; exporting this array from there fails the build with
 * "Failed to collect configuration".
 *
 * A whitelist, not a free-text editor over app_settings. `allowed_email_domain`
 * is deliberately absent: it gates who can sign in, the database trigger
 * enforces it too, and changing it in one place and not the other locks
 * everybody out. That one stays a deliberate two-step change.
 */
type Editable = {
  key: string;
  label: string;
  help: string;
  kind: "boolean" | "integer" | "text";
  validate?: (v: string) => string | null;
  /** Run after a change — some settings need existing rows re-derived. */
  after?: string;
};

export const EDITABLE: Editable[] = [
  {
    key: "welcome_poster_mode",
    label: "How often the programme poster appears",
    help:
      "every_visit — it opens every time someone lands on Home. once — it " +
      "stops once they have acknowledged it. Every visit reaches everybody, " +
      "and is also the thing people learn to click past fastest; which " +
      "trade-off is right is a call for HR.",
    kind: "text",
    validate: (v) =>
      ["every_visit", "once"].includes(v.trim())
        ? null
        : 'Use exactly "every_visit" or "once".',
  },
  {
    key: "leaderboard_enabled",
    label: "Show the leaderboard to employees",
    help:
      "Publicly ranking colleagues is a culture decision, so this ships off. " +
      "The leaderboard already works on real referral data.",
    kind: "boolean",
  },
  {
    key: "keka_open_job_statuses",
    label: "Keka job statuses that mean “open”",
    help:
      "Comma-separated. Keka publishes no enum for this. In this tenant: " +
      "status 1 has 56 roles (all referral-enabled), status 2 has 817 (307 " +
      "referral-enabled), 3 has 29, 4 has 4. Changing this re-derives every " +
      "synced role immediately — no re-sync needed.",
    kind: "text",
    validate: (v) =>
      /^\s*\d+(\s*,\s*\d+)*\s*$/.test(v) ? null : "Use whole numbers separated by commas, e.g. 1,2",
    after: "select rederive_keka_job_openness()",
  },
  {
    key: "keka_push_candidates",
    label: "Send referrals into Keka as candidates",
    help:
      "Off because every Keka job requires current and expected salary, which " +
      "the referral form does not collect and §9 says we should not. Turn on " +
      "only once those fields are optional on referral-enabled roles in Keka.",
    kind: "boolean",
  },
  {
    key: "keka_default_reward_amount",
    label: "Placeholder reward for a newly discovered role",
    help:
      "Applied when a role first arrives from Keka. It is never shown to an " +
      "employee as a real figure — the role reads “To be confirmed” until " +
      "somebody sets a reward on the Rewards tab.",
    kind: "integer",
    validate: (v) => (Number(v) >= 0 && Number(v) <= 1_000_000 ? null : "Enter 0 to 1,000,000."),
  },
  {
    key: "keka_default_eligibility_days",
    label: "Default qualifying period (days)",
    help: "How long after joining before a reward becomes eligible, for newly discovered roles.",
    kind: "integer",
    validate: (v) => (Number(v) >= 0 && Number(v) <= 365 ? null : "Enter 0 to 365."),
  },
  {
    key: "referral_validity_months",
    label: "How long a referral blocks a re-referral (months)",
    help: "A referral of the same candidate inside this window is refused as a duplicate.",
    kind: "integer",
    validate: (v) => (Number(v) >= 1 && Number(v) <= 36 ? null : "Enter 1 to 36."),
  },
  {
    key: "keka_hired_stages",
    label: "Keka stages that mean the candidate joined",
    help:
      "Drives the whole reward ledger. Comma-separated. Change this if the " +
      "recruitment team renames a stage in Keka, or the rewards stop appearing.",
    kind: "text",
    validate: (v) => (v.trim() ? null : "At least one stage name is required."),
  },
  {
    key: "admin_emails",
    label: "Extra admin addresses",
    help:
      "Comma-separated. A bootstrap route in, so a database can never lock " +
      "itself out of the admin screens. Normally empty — grant admin on the " +
      "employee record instead.",
    kind: "text",
  },
];

