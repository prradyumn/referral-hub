"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export type KekaReferralState = { status: "idle" | "ok" | "error"; message?: string };

const OUTCOME: Record<string, KekaReferralState> = {
  credited: { status: "ok", message: "Credited. It now shows in their referrals." },
  duplicate: {
    status: "error",
    message: "Not credited — someone else referred this person first, and that referral still holds.",
  },
  incomplete: {
    status: "error",
    message: "Not credited — Keka has no email or no usable mobile number for this candidate.",
  },
  in_hub: { status: "ok", message: "This referral is already in the Hub." },
  dismissed: { status: "error", message: "This one was dismissed as not a referral." },
};

function refresh() {
  revalidatePath("/admin/keka-referrals");
  revalidatePath("/admin/inbox");
}

/**
 * Credit a Keka referral to a named employee.
 *
 * The one place a person decides who referred someone, so it is the one
 * place a name-only Keka referral becomes a Hub referral. The referrer need
 * not have signed in yet; the database refuses anyone outside the work domain.
 */
export async function creditKekaReferral(
  _prev: KekaReferralState,
  formData: FormData,
): Promise<KekaReferralState> {
  const admin = await requireAdmin(); // first statement, always
  const id = z.string().uuid().safeParse(formData.get("rowId"));
  if (!id.success) return { status: "error", message: "Invalid referral." };
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("referrerEmail"));
  if (!email.success) return { status: "error", message: "Enter the referrer's work email." };

  const out = await queryOne<{ status: string }>(
    `select credit_keka_referral($1, $2, $3) as status`,
    [id.data, email.data, admin.id],
  );
  refresh();

  if (out?.status === "refused") {
    const row = await queryOne<{ reason: string | null }>(
      `select reason from keka_referral_candidates where id = $1`,
      [id.data],
    );
    return { status: "error", message: row?.reason ?? "The database refused that." };
  }
  return OUTCOME[out?.status ?? ""] ?? { status: "error", message: "Something went wrong." };
}

/** Not a referral — usually one a recruiter tagged Employee Referral by mistake. */
export async function dismissKekaReferral(
  _prev: KekaReferralState,
  formData: FormData,
): Promise<KekaReferralState> {
  const admin = await requireAdmin(); // first statement, always
  const id = z.string().uuid().safeParse(formData.get("rowId"));
  if (!id.success) return { status: "error", message: "Invalid referral." };

  await query(
    `update keka_referral_candidates
        set status = 'dismissed', reason = 'Dismissed by an admin as not a referral.',
            resolved_by = $2, resolved_at = now()
      where id = $1 and status in ('needs_review', 'incomplete')`,
    [id.data, admin.id],
  );
  refresh();
  return { status: "ok", message: "Dismissed." };
}
