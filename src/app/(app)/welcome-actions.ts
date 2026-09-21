"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { currentEmployee } from "@/lib/employees";

/**
 * Record that this employee has read the programme poster.
 *
 * Stored against the employee rather than in localStorage: the poster is
 * mandatory, and a per-browser flag would show it again on their phone and
 * would vanish if they cleared site data. An acknowledgement we are treating
 * as meaningful should not be that easy to lose.
 */
export async function acknowledgeWelcome(): Promise<{ ok: boolean }> {
  const employee = await currentEmployee();
  if (!employee) return { ok: false };

  await query(
    `update employees set welcome_ack_at = now()
      where id = $1 and welcome_ack_at is null`,
    [employee.id],
  );

  revalidatePath("/", "layout");
  return { ok: true };
}
