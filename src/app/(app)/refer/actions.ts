"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  const v = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("submit_referral", {
    p_job_id: v.jobId,
    p_full_name: v.fullName,
    p_email: v.email,
    p_phone: v.phone,
    p_org: v.currentOrg || null,
    p_designation: v.currentDesignation || null,
    p_linkedin: v.linkedin || null,
    p_relationship: v.relationship,
    p_consent_text: CONSENT_NOTICE,
  });

  if (error) {
    return { status: "error", formError: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/referrals");

  return {
    status: "done",
    refCode: row?.ref_code,
    reward: row?.reward_amount,
    candidateName: v.fullName,
    jobTitle: String(formData.get("jobTitle") ?? ""),
  };
}
