/**
 * Which reward band a role belongs to.
 *
 * Keka carries no band or grade on a job — its custom fields are Type of
 * Hiring, Project Name, backfill details and a requisition reason — so the
 * band has to be read off the title, and failing that the experience asked
 * for. That is a judgement, and it decides the rupee figure an employee is
 * promised, so the result says how it was reached:
 *
 *   · `title`      — the title names a designation from HR's band table
 *                    (SDE 2, AVP, Sr Manager, Associate, Fellow…). Applied.
 *   · `experience` — no designation in the title; the band comes from the
 *                    years of experience. Applied too, on HR's instruction
 *                    (23 Sep 2026: "keep the pay band-wise if the role isn't
 *                    specified"), and marked so HR can move any that are
 *                    wrong. app_settings.auto_apply_experience_bands turns
 *                    that back into a suggestion.
 *   · `none`       — nothing to go on.
 *
 * Deliberately imports nothing, so scripts/keka-mapping-check.mjs can run it
 * directly — this is the part most likely to be wrong, and the cheapest to
 * test.
 */

export type Track = "engineering" | "non_engineering";
export type Band = "B1" | "B2" | "B3" | "B4" | "B5" | "B6" | "B7" | "B8+";
export type BandSource = "title" | "experience" | "none";

export type Classification = {
  track: Track;
  band: Band | null;
  source: BandSource;
};

const ENGINEERING_DEPARTMENTS = /^(technology|ai platform|engineering|tech|it|data)$/i;

// Words that make a role an engineering one whatever department it sits in —
// "Data Engineer" lives in Pods, "Applications Developer" in Pods too.
const ENGINEERING_TITLE =
  /\b(engineer(ing)?|developer|sde|devops|architect|data scientist|ml|machine learning|qa|quality and testing|test automation|tech lead|software|backend|frontend|full ?stack|mobile|security)\b/i;

export function trackOf(title: string, department: string): Track {
  if (ENGINEERING_DEPARTMENTS.test(department.trim())) return "engineering";
  return ENGINEERING_TITLE.test(title) ? "engineering" : "non_engineering";
}

/**
 * HR's designations, most senior first. Order matters: "Assistant Vice
 * President" must be caught before "Vice President", "Sr Manager" before
 * "Manager", "Jr Associate" before "Associate".
 */
const BY_TITLE: Record<Track, [RegExp, Band][]> = {
  engineering: [
    [/\bavp\b|assistant vice president/i, "B7"],
    [/\b(vp|vice president)\b/i, "B8+"],
    [/\b(sr\.?|senior)\s+principal\b|general manager/i, "B6"],
    [/\bprincipal\b/i, "B5"],
    [/\bsde\s*[-–]?\s*(3|iii)\b|engineer\s*[-–]\s*(3|iii)\b/i, "B4"],
    [/\bsde\s*[-–]?\s*(2|ii)\b|engineer\s*[-–]\s*(2|ii)\b/i, "B3"],
    [/\bsde\s*[-–]?\s*(1|i)\b|engineer\s*[-–]\s*(1|i)\b/i, "B2"],
    [/\b(jr\.?|junior)\s+associate\b/i, "B1"],
  ],
  non_engineering: [
    [/\bavp\b|assistant vice president/i, "B7"],
    [/\b(vp|vice president)\b/i, "B8+"],
    [/general manager|\b(sr\.?|senior)\b[^,]*\bmanager\b/i, "B6"],
    [/assistant manager/i, "B4"],
    [/\bmanager\b/i, "B5"],
    [/\b(sr\.?|senior)\s+associate\b/i, "B3"],
    [/\b(jr\.?|junior)\s+associate\b|\bfellows?\b/i, "B1"],
    [/\bassociate\b/i, "B2"],
  ],
};

/**
 * The fewest years a role asks for, from Keka's free-text experience field:
 * "1-3 yrs", "8 yrs", "5+ years", "3 to 6 Years", "0 - 6 months".
 */
export function minYears(experience: string | null | undefined): number | null {
  if (!experience) return null;
  const m = experience.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return /month/i.test(experience) && !/year|yr/i.test(experience) ? n / 12 : n;
}

/**
 * The band for a role the table does not name. Never reaches B8+: a VP role is always titled as one,
 * and inferring the top band from years served would be the most expensive
 * possible guess.
 */
export function bandFromExperience(years: number): Band {
  if (years < 1) return "B1";
  if (years < 2) return "B2";
  if (years < 4) return "B3";
  if (years < 6) return "B4";
  if (years < 9) return "B5";
  if (years < 12) return "B6";
  return "B7";
}

export function classifyRole(
  title: string,
  department: string,
  experience: string | null | undefined,
): Classification {
  const track = trackOf(title, department);

  // Interns sit outside the band table. They take the lowest band on
  // experience, like any role the table does not name — flagged as such, so
  // HR can see them and move them if interns should earn nothing.
  if (/\bintern\b/i.test(title)) return { track, band: "B1", source: "experience" };

  for (const [pattern, band] of BY_TITLE[track]) {
    if (pattern.test(title)) return { track, band, source: "title" };
  }

  const years = minYears(experience);
  if (years !== null) return { track, band: bandFromExperience(years), source: "experience" };

  return { track, band: null, source: "none" };
}
