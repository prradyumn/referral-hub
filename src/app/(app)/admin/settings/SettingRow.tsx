"use client";

import { useActionState } from "react";
import { saveSetting, type SettingsState } from "./actions";

const initial: SettingsState = { status: "idle" };

export type Spec = {
  key: string;
  label: string;
  help: string;
  kind: "boolean" | "integer" | "text";
};

export default function SettingRow({ spec, value }: { spec: Spec; value: string }) {
  const [state, action, pending] = useActionState(saveSetting, initial);
  const on = value.trim().toLowerCase() === "true";

  return (
    <form action={action} className="card p-4">
      <input type="hidden" name="key" value={spec.key} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 basis-full sm:basis-[260px]">
          <label htmlFor={`s-${spec.key}`} className="text-[14.5px] font-medium">
            {spec.label}
          </label>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
            {spec.help}
          </p>
          <code className="mt-1.5 inline-block rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[11.5px] text-[var(--color-ink-3)]">
            {spec.key}
          </code>
        </div>

        <div className="flex w-full items-center gap-3 sm:w-auto">
          {spec.kind === "boolean" ? (
            <label className="flex items-center gap-2 text-[13.5px]">
              <input
                id={`s-${spec.key}`}
                type="checkbox"
                name="value"
                defaultChecked={on}
                className="h-4 w-4 accent-[var(--color-brand)]"
              />
              {on ? "On" : "Off"}
            </label>
          ) : (
            <input
              id={`s-${spec.key}`}
              name="value"
              defaultValue={value}
              inputMode={spec.kind === "integer" ? "numeric" : "text"}
              className="field min-w-0 flex-1 sm:!w-[190px] sm:flex-none"
            />
          )}

          <button type="submit" disabled={pending} className="btn-ghost">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {state.message && (
        <p
          aria-live="polite"
          className={`mt-2 text-[12.5px] ${
            state.status === "error"
              ? "text-[var(--color-bad,#b42318)]"
              : "text-[var(--color-good)]"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
