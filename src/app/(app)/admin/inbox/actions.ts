"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export type InboxState = { status: "idle" | "ok" | "error"; message?: string };

/** TA has put this candidate into Keka. */
export async function markAddedToKeka(_prev: InboxState, formData: FormData): Promise<InboxState> {
  const admin = await requireAdmin(); // first statement, always
  const id = z.string().uuid().safeParse(formData.get("referralId"));
  if (!id.success) return { status: "error", message: "Invalid referral." };

  await query(
    `update referrals set ta_added_at = now(), ta_added_by = $2
      where id = $1 and ta_added_at is null`,
    [id.data, admin.id],
  );
  revalidatePath("/admin/inbox");
  return { status: "ok", message: "Marked as added to Keka." };
}

/** Undo a mistaken mark. */
export async function unmarkAddedToKeka(_prev: InboxState, formData: FormData): Promise<InboxState> {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("referralId"));
  if (!id.success) return { status: "error", message: "Invalid referral." };
  await query(`update referrals set ta_added_at = null, ta_added_by = null where id = $1`, [id.data]);
  revalidatePath("/admin/inbox");
  return { status: "ok", message: "Moved back to the inbox." };
}
