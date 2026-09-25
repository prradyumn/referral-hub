"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { queryOne, withTransaction } from "@/lib/db";
import { currentEmployee } from "@/lib/employees";
import { readResume } from "@/lib/resume";
import { referralSchema, CONSENT_NOTICE } from "@/lib/validation";
import { tryPushAfterSubmit } from "@/lib/keka/candidates";

export type SubmitState = {
  status: "idle" | "error" | "done";
  formError?: string;
  fieldErrors?: Record<string, string>;
  refCode?: string;
  reward?: number;
  candidateName?: string;
  jobTitle?: string;
  /** Present when a CV was stored with the referral. */
  resumeName?: string;
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

  // Checked before anything is written: a CV that fails the checks refuses the
  // submission, rather than leaving a referral behind without the CV the
  // referrer meant to attach.
  const cv = await readResume(formData.get("resume"));
  if (!cv.ok) {
    return { status: "error", fieldErrors: { resume: cv.message } };
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
    // One transaction: the referral and its CV commit together or not at all.
    // The CV row is keyed to a referral submit_referral has just created, so
    // CONTEXT.md §6's rule — referrals are written only through that function,
    // so the duplicate check cannot be skipped — still holds.
    const row = await withTransaction(async (tx) => {
      const created = await tx.queryOne<{ ref_code: string; reward_amount: number }>(
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

      if (created && cv.resume) {
        await tx.query(
          `insert into referral_resumes
             (referral_id, file_name, content_type, size_bytes, sha256, data)
           select id, $2, $3, $4, $5, $6 from referrals where ref_code = $1`,
          [
            created.ref_code,
            cv.resume.fileName,
            cv.resume.contentType,
            cv.resume.size,
            cv.resume.sha256,
            cv.resume.bytes,
          ],
        );
      }
      return created;
    });

    revalidatePath("/referrals");

    // Push the candidate to Keka Hire *after* the response is sent. The
    // referral is already committed; Keka is an enrichment and must never add
    // latency to the employee's submit or fail it. Anything that goes wrong is
    // recorded on the referral row and retried by the sweeper.
    if (row?.ref_code) {
      const refCode = row.ref_code;
      after(async () => {
        try {
          const referral = await queryOne<{ id: string }>(
            `select id from referrals where ref_code = $1`,
            [refCode],
          );
          if (referral) await tryPushAfterSubmit(referral.id);
        } catch (e) {
          console.error("keka: could not queue push for", refCode, e);
        }
      });
    }

    return {
      status: "done",
      refCode: row?.ref_code,
      reward: row?.reward_amount,
      candidateName: v.fullName,
      jobTitle: String(formData.get("jobTitle") ?? ""),
      resumeName: cv.resume?.fileName,
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
