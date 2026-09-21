"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export type PipelineState = { status: "idle" | "ok" | "error"; message?: string };

const idSchema = z.string().uuid();

/**
 * Approve a reward.
 *
 * Approval is deliberately a human act with a name against it (D17), so
 * nothing here runs automatically — refresh_reward_states() moves a reward to
 * `eligible` and stops. The database refuses to approve a reward whose amount
 * was never agreed, which is the case that would otherwise commit the company
 * to a placeholder figure.
 */
export async function approveReward(
  _prev: PipelineState,
  formData: FormData,
): Promise<PipelineState> {
  const admin = await requireAdmin();   // first statement, always

  const parsed = idSchema.safeParse(formData.get("rewardId"));
  if (!parsed.success) return { status: "error", message: "Invalid reward." };

  try {
    await query(`select approve_reward($1, $2)`, [parsed.data, admin.id]);
  } catch (e) {
    return { status: "error", message: speakable(e) };
  }

  revalidatePath("/admin/pipeline");
  revalidatePath("/rewards");
  return { status: "ok", message: "Approved. It now needs paying through payroll." };
}

/**
 * Record that a reward was paid.
 *
 * Manual because the Keka API key has no payroll scope yet. Once it does this
 * becomes the confirmation step for an automated payroll line rather than the
 * whole of it — the state machine does not change.
 */
export async function markPaid(
  _prev: PipelineState,
  formData: FormData,
): Promise<PipelineState> {
  const admin = await requireAdmin();

  const parsed = idSchema.safeParse(formData.get("rewardId"));
  if (!parsed.success) return { status: "error", message: "Invalid reward." };

  const reference = String(formData.get("reference") ?? "").trim().slice(0, 120);

  try {
    await query(`select mark_reward_paid($1, $2, $3)`, [parsed.data, reference || null, admin.id]);
  } catch (e) {
    return { status: "error", message: speakable(e) };
  }

  revalidatePath("/admin/pipeline");
  revalidatePath("/rewards");
  return { status: "ok", message: "Marked paid." };
}

/** Re-run the engine by hand, rather than waiting for the nightly cron. */
export async function refreshRewards(): Promise<PipelineState> {
  await requireAdmin();
  const [row] = await query<{ created: number; became_eligible: number }>(
    `select * from refresh_reward_states()`,
  );
  revalidatePath("/admin/pipeline");
  revalidatePath("/rewards");
  return {
    status: "ok",
    message: `${row?.created ?? 0} new, ${row?.became_eligible ?? 0} became eligible.`,
  };
}

/**
 * The SQLSTATEs the reward functions raise on purpose. Their messages are
 * written for a human and are safe to show; anything else may describe the
 * schema, so it is not.
 */
const SPEAKABLE = new Set(["23514", "P0002", "42501"]);

function speakable(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code && SPEAKABLE.has(code) && e instanceof Error) return e.message;
  console.error("reward action failed", e);
  return "Something went wrong. Please try again.";
}
