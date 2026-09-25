import { z } from "zod";

export const RELATIONSHIPS = [
  "Former colleague",
  "Friend",
  "College batchmate",
  "College senior or junior",
  "Known professionally",
  "Family",
] as const;

// Shown to the referrer and stored verbatim on the referral. DPDP requires
// that we can prove what the person was told, not merely that they ticked a box.
export const CONSENT_NOTICE =
  "I have asked this person and they are happy to be referred. They know " +
  "ConveGenius will contact them about this role and will hold their details " +
  "for this recruitment process only.";

const phoneDigits = (value: string) => value.replace(/\D/g, "");

export const referralSchema = z.object({
  jobId: z.string().uuid({ message: "Choose a role." }),
  fullName: z
    .string()
    .trim()
    .min(2, "Enter the candidate's full name.")
    .max(120, "That name is too long."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That does not look like an email address."),
  phone: z
    .string()
    .trim()
    .refine((v) => {
      const d = phoneDigits(v);
      return d.length === 10 || (d.length === 12 && d.startsWith("91")) || (d.length === 11 && d.startsWith("0"));
    }, "Enter a 10-digit Indian mobile number."),
  currentOrg: z.string().trim().max(120).optional().or(z.literal("")),
  currentDesignation: z.string().trim().max(120).optional().or(z.literal("")),
  linkedin: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/.+/i.test(v),
      "That does not look like a LinkedIn profile URL.",
    ),
  relationship: z.enum(RELATIONSHIPS, {
    errorMap: () => ({ message: "Tell us how you know them." }),
  }),
  consent: z
    .union([z.literal("on"), z.literal("true"), z.boolean()])
    .refine((v) => v === "on" || v === "true" || v === true, {
      message: "We cannot take the referral without the candidate's agreement.",
    }),
});

export type ReferralInput = z.infer<typeof referralSchema>;

export function formatPhone(value: string): string {
  const d = phoneDigits(value);
  if (d.length === 10) return "+91" + d;
  if (d.length === 12 && d.startsWith("91")) return "+" + d;
  if (d.length === 11 && d.startsWith("0")) return "+91" + d.slice(1);
  return "+" + d;
}

// ------------------------------------------------------------------ résumé
// Shared with the browser so an oversized or wrong-type file is refused the
// moment it is picked. The server re-checks everything — see src/lib/resume.ts,
// which also inspects the bytes, since a filename and a browser-reported type
// are both whatever the uploader says they are.

/** 4 MB. Vercel refuses request bodies over 4.5 MB before the app sees them. */
export const RESUME_MAX_BYTES = 4 * 1024 * 1024;

export const RESUME_ACCEPT =
  ".pdf,.docx,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * The quick check, for the browser. Returns an error message, or null.
 *
 * Old .doc is refused on purpose, not overlooked: it is the format macro
 * malware travels in, and it cannot be inspected the way PDF and DOCX can.
 */
export function quickResumeCheck(file: { name: string; size: number }): string | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".doc")) {
    return "Old Word (.doc) files aren't accepted. Save it as PDF or .docx and try again.";
  }
  if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
    return "Upload the CV as a PDF or a Word (.docx) file.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > RESUME_MAX_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 4 MB — a PDF export is usually much smaller.`;
  }
  return null;
}
