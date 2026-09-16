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
