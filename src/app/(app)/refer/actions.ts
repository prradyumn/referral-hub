"use server";

import { revalidatePath } from "next/cache";
import { queryOne } from "@/lib/db";
import { currentEmployee } from "@/lib/employees";
import { referralSchema, CONSENT_NOTICE } from "@/lib/validation";

export type SubmitState = {
  status: "idle" | "error" | "done";
  formError?: string;
  fieldErrors?: Record<string, string>;
  refCode?: string;
  reward?: number;
  candidateName?: string;
  jobTitle?: string;
};

// The SQLSTATEs submit_referral raises on purpose. Their messages are written
// for employees and are safe to show. Anything else is an unexpected database
// error whose text may describe the schema, so it is not shown.
const SPEAKABLE = new Set([
  "23505", // unique_violation  — already referred
  "42501", // insufficient_privilege — not signed in
  "P0002", // no_data_found — no employee row
  "23514", // check_violation — closed role, missing consent, missing setting
]);

export async function submitReferral(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const parsed = referralSchema.safeParse({
    jobId: formData.get("jobId"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    currentOrg: formData.get("currentOrg") ?? "",
    currentDesignation: formData.get("currentDesignation") ?? "",
    linkedin: formData.get("linkedin") ?? "",
    relationship: formData.get("relationship"),
    consent: formData.get("consent") ?? false,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", fieldErrors };
  }

  // The referrer comes from the session and only from the session. The database
  // can no longer work out who is calling, so a referrer_id taken from the form
  // would let anyone file a referral in someone else's name.
  const employee = await currentEmployee();
  if (!employee) {
    return {
      status: "error",
      formError:
        "Referrals cannot be saved yet — the database is not connected. Sign-in and " +
        "browsing work; ask whoever set this up to configure DATABASE_URL.",
    };
  }

  const v = parsed.data;

  try {
    const row = await queryOne<{ ref_code: string; reward_amount: number }>(
      `select * from public.submit_referral(
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       )`,
      [
        employee.id,
        v.jobId,
        v.fullName,
        v.email,
        v.phone,
        v.currentOrg || null,
        v.currentDesignation || null,
        v.linkedin || null,
        v.relationship,
        CONSENT_NOTICE,
      ],
    );

    revalidatePath("/referrals");

    return {
      status: "done",
      refCode: row?.ref_code,
      reward: row?.reward_amount,
      candidateName: v.fullName,
      jobTitle: String(formData.get("jobTitle") ?? ""),
    };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    const message = e instanceof Error ? e.message : "";

    if (code && SPEAKABLE.has(code)) {
      return { status: "error", formError: message };
    }

    console.error("submit_referral failed", e);
    return {
      status: "error",
      formError: "Something went wrong saving that referral. Please try again.",
    };
  }
}
