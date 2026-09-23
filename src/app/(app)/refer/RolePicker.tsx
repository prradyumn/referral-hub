"use client";

import { useId, useMemo, useRef, useState } from "react";
import { rupees } from "@/lib/format";
import type { JobOption } from "./ReferralForm";

/**
 * Pick a role by typing, not by scrolling a 56-item dropdown.
 *
 * The ARIA combobox pattern: the input owns a listbox, arrow keys move
 * through it, Enter picks, Escape closes. Each option carries its cash, so
 * the reward is in view while choosing rather than revealed only at review.
 *
 * `id` lands on the input, so the form's "focus the first error" finds it.
 */
export default function RolePicker({
  id,
  jobs,
  value,
  onChange,
  error,
}: {
  id: string;
  jobs: JobOption[];
  value: string;
  onChange: (jobId: string) => void;
  error?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const picked = jobs.find((j) => j.id === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? jobs.filter((j) =>
          [j.title, j.department, j.location].join(" ").toLowerCase().includes(q),
        )
      : jobs;
    return list.slice(0, 60);
  }, [jobs, query]);

  function choose(j: JobOption) {
    onChange(j.id);
    setOpen(false);
    setQuery("");
  }

  if (picked) {
    return (
      <div
        className={`flex flex-wrap items-center gap-3 rounded-lg border p-3.5 ${
          error ? "border-[var(--color-danger)]" : "border-[var(--color-line)]"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">{picked.title}</p>
          <p className="text-[12.5px] text-[var(--color-ink-3)]">
            {picked.department} · {picked.location}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost !py-1.5 text-[13px]"
          onClick={() => {
            onChange("");
            setOpen(true);
            // After React re-renders the input.
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          Change role
        </button>
      </div>
    );
  }

  const activeOption = open && matches[active] ? `${listId}-${matches[active].id}` : undefined;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption}
        autoComplete="off"
        placeholder="Search by role, team or city"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`field ${error ? "field-error" : ""}`}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Open roles"
          className="absolute z-20 mt-1.5 max-h-[320px] w-full overflow-y-auto rounded-lg border border-[var(--color-line)] bg-white p-1 shadow-[0_10px_30px_-10px_rgba(23,27,36,.25)]"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-[13.5px] text-[var(--color-ink-3)]">
              No open role matches “{query}”.
            </li>
          ) : (
            matches.map((j, i) => (
              <li
                key={j.id}
                id={`${listId}-${j.id}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: click fires after the input's blur has
                // already closed the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(j);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2.5 ${
                  i === active ? "bg-[var(--color-brand-soft)]" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{j.title}</span>
                  <span className="block truncate text-[12px] text-[var(--color-ink-3)]">
                    {j.department} · {j.location}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                    j.reward_confirmed ? "text-[var(--color-gold)]" : "text-[var(--color-ink-3)] font-normal"
                  }`}
                >
                  {j.reward_confirmed ? rupees(j.reward_amount) : "To be confirmed"}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
