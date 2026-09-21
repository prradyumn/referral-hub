"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { EDITABLE } from "./editable";

export type SettingsState = { status: "idle" | "ok" | "error"; message?: string };

export async function saveSetting(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAdmin();   // first statement, always

  const key = String(formData.get("key") ?? "");
  const spec = EDITABLE.find((e) => e.key === key);
  if (!spec) return { status: "error", message: "That setting cannot be changed here." };

  const raw =
    spec.kind === "boolean"
      ? formData.get("value") === "on"
        ? "true"
        : "false"
      : String(formData.get("value") ?? "").trim();

  if (spec.kind === "integer" && !/^\d+$/.test(raw)) {
    return { status: "error", message: "Enter a whole number." };
  }

  const problem = spec.validate?.(raw);
  if (problem) return { status: "error", message: problem };

  await query(
    `insert into app_settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value`,
    [key, raw],
  );

  // Some settings imply work on existing rows. keka_open_job_statuses is the
  // one that matters: without this, changing it would only affect roles the
  // next sync happened to touch.
  let extra = "";
  if (spec.after) {
    const [row] = await query<{ opened: number; closed: number }>(spec.after);
    if (row && "opened" in row) {
      extra = ` ${row.opened} roles now open, ${row.closed} closed.`;
    }
  }

  revalidatePath("/admin/settings");
  revalidatePath("/roles");
  revalidatePath("/leaderboard");
  revalidatePath("/home");
  return { status: "ok", message: `Saved.${extra}` };
}
