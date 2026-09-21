/**
 * Pure mapping between Keka's shapes and the Hub's.
 *
 * Deliberately imports nothing. Every function here is a total function of its
 * arguments, which is what makes scripts/keka-mapping-check.mjs able to run
 * them directly under Node and what keeps the translation layer — the part
 * most likely to be wrong against a real tenant — testable without a tenant.
 */

// ------------------------------------------------------------- Keka shapes
export type KekaLocation = {
  id?: string;
  name?: string;
  city?: string;
  state?: string;
  country?: string;
};

export type KekaJob = {
  id: string;
  title?: string;
  description?: string;
  orgJobId?: string;
  departmentName?: string;
  jobLocations?: KekaLocation[];
  experience?: string | { min?: number; max?: number };
  status?: number;
  isReferralEnabled?: boolean;
  createdOn?: string;
  publishedOn?: string;
  noOfOpenings?: number;
};

export type PushableReferral = {
  referral_id: string;
  ref_code: string;
  keka_job_id: string | null;
  job_title: string | null;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  current_org: string | null;
  current_designation: string | null;
  linkedin_url: string | null;
  relationship: string;
  referrer_name: string | null;
  referrer_email: string;
  attempts: number;
};

// ------------------------------------------------------------------- jobs
export function locationLabel(job: KekaJob): string {
  const names = (job.jobLocations ?? [])
    .map((l) => l.name?.trim() || [l.city, l.state].filter(Boolean).join(", "))
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));

  const unique = [...new Set(names)];
  if (unique.length === 0) return "Unspecified";
  if (unique.length <= 2) return unique.join(" / ");
  return `${unique[0]} +${unique.length - 1} more`;
}

export function experienceLabel(job: KekaJob): string {
  const e = job.experience;
  if (typeof e === "string" && e.trim()) {
    const text = e.trim().replace(/\s+/g, " ");
    // The tenant sends bare numbers and ranges — "3", "3-5", "10 - 14" — as
    // well as "5 years". Add the unit only where there is none, so the card
    // does not read "3" on its own.
    return /\d/.test(text) && !/[a-z]/i.test(text)
      ? `${text.replace(/\s*-\s*/, "-")} yrs`
      : text;
  }
  if (e && typeof e === "object") {
    const { min, max } = e;
    if (min != null && max != null) return `${min}-${max} yrs`;
    if (min != null) return `${min}+ yrs`;
    if (max != null) return `Up to ${max} yrs`;
  }
  return "Not specified";
}

/**
 * Section headings that mark where company boilerplate ends and the actual
 * role begins. Ordered by how specific they are.
 */
const ROLE_SECTION_MARKERS = [
  "role summary",
  "job summary",
  "role overview",
  "position overview",
  "about the role",
  "about this role",
  "about the position",
  "job description",
  "job purpose",
  "position summary",
  "key responsibilities",
  "responsibilities",
  "what you will do",
  "what you'll do",
  "what you would do",
  "job responsibilities",
];

/**
 * Drop the recruiting preamble a job description opens with.
 *
 * 384 of this tenant's 860 descriptions begin with the same paragraph —
 * "Does working for 150+ million children of Bharat excite you? … About us:
 * ConveGenius is …". Rendered as a card summary that means half of /roles
 * says exactly the same thing and nothing about the job, which defeats the
 * point of showing a summary at all.
 *
 * Only skips ahead when the text actually opens with boilerplate AND a role
 * heading is found later, so a description written the other way round is
 * left alone.
 */
export function stripBoilerplate(text: string): string {
  const head = text.slice(0, 400).toLowerCase();
  const opensWithBoilerplate =
    /does working for|about us\s*:|about the (company|organisation|organization)\s*:/.test(head);
  if (!opensWithBoilerplate) return text;

  const lower = text.toLowerCase();
  let best = -1;
  for (const marker of ROLE_SECTION_MARKERS) {
    const at = lower.indexOf(marker);
    // Must come after the preamble, and leave something worth showing.
    // Must sit after the preamble, and leave a real sentence behind — a
    // description ending on the word "Responsibilities" must not be cut to
    // nothing.
    if (at > 40 && text.length - at > 40 && (best === -1 || at < best)) best = at;
  }

  return best === -1 ? text : text.slice(best).trim();
}

/**
 * Keka's job description is HTML. The Hub renders a plain three-line summary,
 * so the markup is stripped rather than rendered — which also means a job
 * description can never inject markup into the Hub.
 */
export function summaryText(html: string | undefined, limit = 400): string | null {
  if (!html?.trim()) return null;

  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  const body = stripBoilerplate(text);
  if (!body) return null;
  if (body.length <= limit) return body;

  const cut = body.lastIndexOf(" ", limit);
  return body.slice(0, cut > 0 ? cut : limit).trim() + "…";
}

/**
 * Keka sends dates as **Unix epoch seconds in a string** — "1789573328.01" —
 * not ISO 8601, and `publishedOn` is frequently an empty string rather than
 * absent. `new Date("1789573328.01")` is an Invalid Date, so parsing this the
 * obvious way silently stamped every synced job with today's date. Found by
 * running it against the real tenant; the documentation types these as
 * `date-time`.
 *
 * Handles epoch seconds, epoch milliseconds and genuine ISO strings, because
 * the format is evidently not something to rely on.
 */
export function parseKekaDate(raw: string | number | null | undefined): Date | null {
  if (raw === null || raw === undefined) return null;

  const text = String(raw).trim();
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) return null;
    // Seconds vs milliseconds: anything past ~1973 in ms is > 1e11, while
    // epoch seconds stay below that until the year 5138.
    const d = new Date(n > 1e11 ? n : n * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function postedOn(job: KekaJob): string | null {
  const d = parseKekaDate(job.publishedOn) ?? parseKekaDate(job.createdOn);
  return d ? d.toISOString().slice(0, 10) : null;
}

// ------------------------------------------------------------- candidates
/**
 * Keka wants a first and last name; the Hub collects one field, because
 * insisting on a split is a bad form for Indian names. Everything before the
 * final whitespace is the first name, so "Priya Sharma" and
 * "Rohit Kumar Deshmukh" both land sensibly.
 */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Unknown", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

/**
 * Phones are stored E.164 (`+919876543210`) by normalise_phone in
 * db/0001_schema.sql. Keka takes the country code and the number separately.
 */
export function splitPhone(e164: string): { countryCode: string; number: string } {
  const digits = (e164 ?? "").replace(/\D/g, "");
  if (digits.length > 10) {
    return {
      countryCode: `+${digits.slice(0, digits.length - 10)}`,
      number: digits.slice(-10),
    };
  }
  return { countryCode: "+91", number: digits };
}

/**
 * The candidate payload.
 *
 * Only fields Keka documents on the candidate POST. Tenant-specific custom
 * fields are deliberately not guessed at: scripts/keka-discover.mjs reports
 * what a given job actually requires, and anything extra is added once it has
 * been seen rather than invented.
 */
export function candidateBody(r: PushableReferral): Record<string, unknown> {
  const { firstName, lastName } = splitName(r.candidate_name);
  const phone = splitPhone(r.candidate_phone);

  const body: Record<string, unknown> = {
    firstName,
    email: r.candidate_email,
    phone: [phone.countryCode, phone.number],
  };

  if (lastName) body.lastName = lastName;
  if (r.linkedin_url) body.linkedInUrl = r.linkedin_url;

  if (r.current_org || r.current_designation) {
    body.experienceDetails = [
      {
        companyName: r.current_org ?? undefined,
        designation: r.current_designation ?? undefined,
        isCurrentlyWorking: true,
      },
    ];
  }

  return body;
}

/**
 * The note that attributes the referral inside Keka.
 *
 * Keka documents no referrer field on the candidate POST, and custom fields
 * vary per tenant. A note is the one attribution channel that is documented
 * and always present, so the referrer is recorded there whatever the tenant
 * looks like. The Hub stays the record of truth regardless.
 */
export function attributionNote(r: PushableReferral): string {
  const who = r.referrer_name?.trim()
    ? `${r.referrer_name.trim()} (${r.referrer_email})`
    : r.referrer_email;
  return (
    `Employee referral via the ConveGenius Referral Hub.\n` +
    `Referrer: ${who}\n` +
    `Relationship to candidate: ${r.relationship}\n` +
    `Hub reference: ${r.ref_code}`
  );
}

/**
 * Keka's candidate POST is documented as returning "a string". In practice an
 * envelope is likely, so read both shapes. Returns null when no id can be
 * found; the caller decides how loudly to fail.
 */
export function extractCandidateId(body: unknown): string | null {
  if (typeof body === "string" && body.trim()) return body.trim();
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const key of ["id", "candidateId", "data"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object") {
        const inner =
          (v as Record<string, unknown>).id ??
          (v as Record<string, unknown>).candidateId;
        if (typeof inner === "string" && inner.trim()) return inner.trim();
      }
    }
  }
  return null;
}
