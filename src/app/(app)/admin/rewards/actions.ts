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

  // A figure typed for this role wins over the band table from now on.
  await query(`update jobs set reward_origin = 'custom' where id = $1`, [jobId]);

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
    await query(`update jobs set reward_origin = 'custom' where id = $1`, [t.id]);
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

// ------------------------------------------------------------------ bands
const TRACKS = ["engineering", "non_engineering"] as const;
const BANDS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8+"] as const;

const bandSchema = z.object({
  jobId: z.string().uuid(),
  choice: z
    .string()
    .regex(/^(engineering|non_engineering):(B[1-7]|B8\+)$/, "Choose a band."),
});

/**
 * HR places a role in a band. The role then takes the band's reward, and a
 * later sync will not re-band it — HR's decision beats the inference.
 */
export async function setBand(_prev: RewardState, formData: FormData): Promise<RewardState> {
  await requireAdmin();
  const parsed = bandSchema.safeParse({
    jobId: formData.get("jobId"),
    choice: formData.get("choice"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  const [track, band] = parsed.data.choice.split(":") as [(typeof TRACKS)[number], (typeof BANDS)[number]];
  try {
    const [row] = await query<{ amount: number }>(`select set_job_band($1, $2, $3) as amount`, [
      parsed.data.jobId,
      track,
      band,
    ]);
    revalidatePath("/admin/rewards");
    revalidatePath("/roles");
    return {
      status: "ok",
      message: `Band ${band} applied — ₹${Number(row?.amount ?? 0).toLocaleString("en-IN")}.`,
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not set the band." };
  }
}

/**
 * Accept every band suggested from experience, in one go.
 *
 * Suggestions are held back from employees until a person has looked at
 * them. This is that look, done in bulk once HR is satisfied with the list.
 * Bands still awaiting clarification are skipped.
 */
export async function confirmSuggestedBands(): Promise<RewardState> {
  await requireAdmin();
  const rows = await query<{ id: string; track: string; band: string }>(
    `select j.id, j.track, j.band
       from jobs j
       join reward_bands b on b.track = j.track and b.band = j.band
      where j.is_open and j.band_source = 'experience'
        and j.reward_origin = 'band' and not j.reward_confirmed
        and not b.needs_clarification`,
  );
  for (const r of rows) {
    await query(`select set_job_band($1, $2, $3)`, [r.id, r.track, r.band]);
  }
  revalidatePath("/admin/rewards");
  revalidatePath("/roles");
  return { status: "ok", message: `Confirmed ${rows.length} suggested band${rows.length === 1 ? "" : "s"}.` };
}

const amountSchema = z.object({
  track: z.enum(TRACKS),
  band: z.enum(BANDS),
  amount: z.coerce.number().int().min(0).max(10_000_000),
  label: z.string().max(60).optional(),
});

/**
 * HR edits a row of the band table. Every role following that band is
 * re-priced; referrals already made keep what they were promised.
 */
export async function setBandAmount(_prev: RewardState, formData: FormData): Promise<RewardState> {
  await requireAdmin();
  const parsed = amountSchema.safeParse({
    track: formData.get("track"),
    band: formData.get("band"),
    amount: formData.get("amount"),
    label: formData.get("label") ?? "",
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  const { track, band, amount, label } = parsed.data;

  const [row] = await query<{ n: number }>(`select set_band_amount($1, $2, $3, $4) as n`, [
    track,
    band,
    amount,
    label ?? "",
  ]);
  revalidatePath("/admin/rewards");
  revalidatePath("/roles");
  const n = Number(row?.n ?? 0);
  return { status: "ok", message: `Saved. ${n} role${n === 1 ? "" : "s"} re-priced.` };
}
