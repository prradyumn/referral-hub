import "server-only";

import { query } from "@/lib/db";
import { classifyRole } from "@/lib/bands";

export type BandApplyResult = { applied: number; suggested: number; held: number };

/**
 * Band every open Keka role, and give it the reward its band carries.
 *
 * Runs after each jobs sync, so a role that appears in Keka is banded without
 * anyone doing anything. apply_job_bands() leaves alone roles whose band HR
 * picked or whose reward HR typed, and only shows employees a figure when the
 * title named a designation from HR's table — see src/lib/bands.ts.
 */
export async function applyBands(): Promise<BandApplyResult> {
  const jobs = await query<{
    id: string;
    title: string;
    department: string;
    experience_band: string;
  }>(
    `select id, title, department, experience_band
       from jobs
      where source = 'keka' and is_open
        and reward_origin <> 'custom'
        and coalesce(band_source, '') <> 'hr'`,
  );

  const rows = jobs
    .map((j) => ({ job_id: j.id, ...classifyRole(j.title, j.department, j.experience_band) }))
    .filter((r) => r.band !== null)
    .map((r) => ({ job_id: r.job_id, track: r.track, band: r.band, source: r.source }));

  if (!rows.length) return { applied: 0, suggested: 0, held: 0 };

  const [out] = await query<BandApplyResult>(
    `select * from apply_job_bands($1::jsonb)`,
    [JSON.stringify(rows)],
  );
  return {
    applied: Number(out?.applied ?? 0),
    suggested: Number(out?.suggested ?? 0),
    held: Number(out?.held ?? 0),
  };
}
