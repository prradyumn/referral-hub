"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { isKekaConfigured } from "@/lib/keka/client";
import { runKekaSync, runningSince } from "@/lib/keka/run";
import type { ReferralImportResult } from "@/lib/keka/referrals";
import type { StageSyncResult } from "@/lib/keka/stages";

export type SyncNowState = { status: "idle" | "ok" | "error"; message?: string };

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * The nightly sync, on demand: the same full run the 08:00 IST cron makes.
 *
 * Admin only, because it spends Keka's 50-a-minute budget for everyone and
 * takes two to three minutes. A referral made in Keka still lands in Admin →
 * Keka referrals for crediting unless the referrer-email field is set; this
 * only stops the wait for tomorrow morning.
 */
export async function syncNow(_prev: SyncNowState): Promise<SyncNowState> {
  await requireAdmin(); // first statement, always

  if (!isKekaConfigured()) {
    return { status: "error", message: "Keka is not configured on this deployment." };
  }

  const busy = await runningSince();
  if (busy) {
    return {
      status: "error",
      message: "A sync is already running. Give it a few minutes, then refresh this page.",
    };
  }

  const summary = await runKekaSync({ full: true });

  revalidatePath("/admin/sync");
  revalidatePath("/admin/keka-referrals");
  revalidatePath("/admin/inbox");
  revalidatePath("/roles");

  const refs = summary.kekaReferrals.detail as ReferralImportResult | null;
  const stages = summary.stages.detail as StageSyncResult | null;

  const parts = [`Synced in ${duration(summary.elapsedMs)}`];
  if (refs) {
    parts.push(
      refs.enabled
        ? `${refs.referrals} Keka referral${refs.referrals === 1 ? "" : "s"} read, ` +
            `${refs.credited} credited, ${refs.awaitingReview} waiting for review`
        : "Keka referral import is off in Settings",
    );
  }
  if (stages) parts.push(`${stages.advanced} stage update${stages.advanced === 1 ? "" : "s"}`);

  if (!summary.ok) {
    const first =
      summary.jobs.error ?? summary.kekaReferrals.error ?? summary.stages.error ??
      "One step failed — see Recent runs.";
    return { status: "error", message: `${parts.join(" · ")}. Problem: ${first}` };
  }
  return { status: "ok", message: `${parts.join(" · ")}.` };
}
