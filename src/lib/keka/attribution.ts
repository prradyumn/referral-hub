/**
 * Who referred a candidate Keka holds — decided without guessing.
 *
 * Pure: no database, no network, no app imports, so
 * scripts/keka-attribution-check.mjs runs it directly (Node strips the types).
 *
 * Keka's candidate record has no referrer field. It has sourceTitle
 * ("Employee Referral") and sourcedBy, a free-text string. A reward follows
 * from attribution, so the rules are narrow on purpose:
 *
 *   · Automatic credit comes from ONE field only: the one HR adds for the
 *     referrer's work email, named in app_settings.keka_referrer_email_field.
 *   · sourcedBy is never trusted to credit anyone. On a referral it may be the
 *     referrer — or the recruiter who typed the candidate in. It can only
 *     *suggest* a person to an admin.
 *   · Every field is never scanned for "any work email". A hiring manager's
 *     or recruiter's address in another field would be credited as the
 *     referrer, and paid.
 *
 * Anything these rules cannot settle goes to an admin.
 */

export type KekaReferralCandidate = {
  id?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  additionalCandidateDetails?: Record<string, unknown> | null;
  jobApplicationDetails?: {
    sourceTitle?: string;
    sourcedBy?: string;
    appliedOn?: string | number;
    screeningQuestionsResponse?: Record<string, unknown> | null;
  } | null;
};

export type EmployeeRef = { id: string; email: string; full_name: string | null };

/** Keka's own marker for a referral. Matched loosely: casing and spacing vary. */
export function isEmployeeReferral(c: KekaReferralCandidate): boolean {
  const t = c.jobApplicationDetails?.sourceTitle ?? "";
  return t.toLowerCase().replace(/[^a-z]/g, "") === "employeereferral";
}

export function candidateName(c: KekaReferralCandidate): string {
  return [c.firstName, c.middleName, c.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * The names of the custom fields and screening questions on a candidate —
 * never their values, which can include salary answers. Shown to an admin
 * choosing which field holds the referrer's email.
 */
export function fieldNames(c: KekaReferralCandidate): string[] {
  const names = [
    ...Object.keys(c.additionalCandidateDetails ?? {}),
    ...Object.keys(c.jobApplicationDetails?.screeningQuestionsResponse ?? {}),
  ];
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort();
}

const EMAIL = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export type Referrer =
  | { kind: "email"; email: string }
  | { kind: "hint"; hint: string } // the field exists but is not a usable work email
  | { kind: "none" }; // no field configured, or this candidate lacks it

/**
 * Reads the configured referrer field. Its name is matched without regard to
 * case or surrounding space, because it is typed by a person into Settings.
 */
export function referrerFrom(
  c: KekaReferralCandidate,
  fieldName: string,
  workDomain: string,
): Referrer {
  const want = fieldName.trim().toLowerCase();
  if (!want) return { kind: "none" };

  const sources = [
    c.additionalCandidateDetails ?? {},
    c.jobApplicationDetails?.screeningQuestionsResponse ?? {},
  ];
  let raw: unknown;
  for (const s of sources) {
    for (const [k, v] of Object.entries(s)) {
      if (k.trim().toLowerCase() === want && v != null && String(v).trim()) raw = v;
    }
  }
  if (raw === undefined) return { kind: "none" };

  const value = String(raw).trim();
  const m = EMAIL.exec(value.toLowerCase());
  if (m && m[1] === workDomain.trim().toLowerCase()) {
    return { kind: "email", email: value.toLowerCase() };
  }
  return { kind: "hint", hint: value.slice(0, 200) };
}

/** Lower-case letters only, as a sorted set of words: "S. Gokul" = "gokul s". */
function nameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .sort()
    .join(" ");
}

/**
 * A person an admin might mean, from free text. Only ever a suggestion.
 *
 * Returns one employee or none: an exact email, or a name whose words match
 * exactly one employee's. Two employees with the same name give no
 * suggestion at all, because a wrong suggestion is worse than none.
 */
export function suggestEmployee(
  clue: string | null | undefined,
  employees: EmployeeRef[],
): string | null {
  const text = clue?.trim();
  if (!text) return null;

  const asEmail = text.toLowerCase();
  if (EMAIL.test(asEmail)) {
    return employees.find((e) => e.email.toLowerCase() === asEmail)?.id ?? null;
  }

  const key = nameKey(text);
  if (!key) return null;
  const hits = employees.filter((e) => e.full_name && nameKey(e.full_name) === key);
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * The import cutoff, as the start of that day in India.
 *
 * Throws on anything unreadable rather than falling back: an unparseable
 * cutoff must not quietly become "import everything", which could pay a
 * referral already rewarded under the old process (D18).
 */
export function importCutoff(value: string | null | undefined): Date {
  const v = value?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`keka_referral_import_since is "${v}"; it must be a date like 2026-09-25.`);
  }
  const d = new Date(`${v}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime()) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    throw new Error(`keka_referral_import_since "${v}" is not a real date.`);
  }
  return d;
}

export type Triage = "import" | "not_a_referral" | "undated" | "before_cutoff";

/**
 * Whether a candidate Keka returned is brought in at all. `applied` is passed
 * in already parsed (parseKekaDate in map.ts), which keeps this file free of
 * imports and so runnable directly by the check script.
 */
export function triage(c: KekaReferralCandidate, applied: Date | null, cutoff: Date): Triage {
  if (!c.id || !isEmployeeReferral(c)) return "not_a_referral"; // never stored
  if (!applied) return "undated"; // cannot show it is after the cutoff
  return applied < cutoff ? "before_cutoff" : "import";
}
