"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

const schema = z.object({
  jobId: z.string().uuid(),
  reward: z.coerce.number().int().min(0, "A reward cannot be negative.")
    .max(1_000_000, "That looks too large — check the figure."),
  eligibilityDays: z.coerce.number().int().min(0).max(365),
  priority: z.boolean(),
});

export type RewardState = { status: "idle" | "ok" | "error"; message?: string };

/**
 * Set the reward on one role.
 *
 * Writing `reward_confirmed = true` is what moves a card from "To be
 * confirmed" to a real figure, so this is the one action that turns a synced
 * Keka role into something the Hub can actually promise an employee.
 *
 * Note it does NOT touch referrals already submitted: reward_amount_snapshot
 * is copied at submit time and a later revision must never rewrite it
 * (convention 3).
 */
export async function setReward(
  _prev: RewardState,
  formData: FormData,
): Promise<RewardState> {
  // First statement, always. There is no RLS underneath this.
  await requireAdmin();

  const parsed = schema.safeParse({
    jobId: formData.get("jobId"),
    reward: formData.get("reward"),
    eligibilityDays: formData.get("eligibilityDays"),
    priority: formData.get("priority") === "on",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { jobId, reward, eligibilityDays, priority } = parsed.data;

  // set_job_reward also settles referrals taken while this role had no agreed
  // reward: those employees were promised nothing specific, so they get the
  // first real rate rather than the placeholder. A referral made when a rate
  // DID apply keeps it (convention 3).
  const [row] = await query<{ referrals_settled: number }>(
    `select * from set_job_reward($1, $2, $3, $4)`,
    [jobId, reward, eligibilityDays, priority],
  );

  const settled = Number(row?.referrals_settled ?? 0);

  revalidatePath("/admin/rewards");
  revalidatePath("/roles");
  revalidatePath("/referrals");
  return {
    status: "ok",
    message: settled
      ? `Saved. ${settled} referral${settled === 1 ? "" : "s"} already taken on this role now show this amount.`
      : "Saved.",
  };
}

/** Apply a figure to every unconfirmed role in a department at once. */
export async function setDepartmentReward(
  _prev: RewardState,
  formData: FormData,
): Promise<RewardState> {
  await requireAdmin();

  const department = String(formData.get("department") ?? "").trim();
  const reward = Number(formData.get("reward"));

  if (!department) return { status: "error", message: "Choose a department." };
  if (!Number.isInteger(reward) || reward < 0 || reward > 1_000_000) {
    return { status: "error", message: "Enter a whole rupee amount." };
  }

  // Route each one through set_job_reward so referrals already taken are
  // settled the same way a single save would settle them.
  const targets = await query<{ id: string; eligibility_days: number; is_priority: boolean }>(
    `select id, eligibility_days, is_priority
       from jobs
      where source = 'keka' and is_open and department = $1 and not reward_confirmed`,
    [department],
  );

  for (const t of targets) {
    await query(`select set_job_reward($1, $2, $3, $4)`,
      [t.id, reward, t.eligibility_days, t.is_priority]);
  }
  const rows = targets;

  revalidatePath("/admin/rewards");
  revalidatePath("/roles");
  revalidatePath("/referrals");
  return {
    status: "ok",
    message: `Set the reward on ${rows.length} role${rows.length === 1 ? "" : "s"} in ${department}.`,
  };
}
