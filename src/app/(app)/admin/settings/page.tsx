import { requireAdmin } from "@/lib/admin";
import { query } from "@/lib/db";
import { PageHead, Card } from "@/components/Chrome";
import AdminNav from "../AdminNav";
import { EDITABLE } from "./editable";
import SettingRow from "./SettingRow";

export default async function SettingsPage() {
  await requireAdmin();

  const rows = await query<{ key: string; value: string }>(
    `select key, value from app_settings`,
  );
  const current = new Map(rows.map((r) => [r.key, r.value]));

  return (
    <>
      <AdminNav current="/admin/settings" />
      <PageHead
        title="Programme settings"
        lede="The rules of the programme live in data, not in code — so changing one is a decision, not a release."
      />

      <div className="grid gap-2">
        {EDITABLE.map((spec) => (
          <SettingRow
            key={spec.key}
            spec={{ key: spec.key, label: spec.label, help: spec.help, kind: spec.kind }}
            value={current.get(spec.key) ?? ""}
          />
        ))}
      </div>

      {/* Deliberately not editable here. Saying why is more useful than
          leaving someone to wonder where it went. */}
      <Card className="mt-6 border-dashed">
        <p className="text-[13px] leading-relaxed text-[var(--color-ink-2)]">
          <strong className="font-semibold text-[var(--color-ink)]">
            Not editable here on purpose.
          </strong>{" "}
          <code className="rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[12px]">
            allowed_email_domain
          </code>{" "}
          decides who can sign in at all, and it is enforced twice — in the sign-in
          callback and again by a database trigger. Changing it in one place and not the
          other locks everybody out, so it stays a deliberate two-step change made by
          someone who knows both.
        </p>
      </Card>
    </>
  );
}
