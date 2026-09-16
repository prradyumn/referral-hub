"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { submitReferral, type SubmitState } from "./actions";
import { referralSchema, RELATIONSHIPS, CONSENT_NOTICE, formatPhone } from "@/lib/validation";
import { rupees } from "@/lib/format";

export type JobOption = {
  id: string;
  title: string;
  location: string;
  department: string;
  reward_amount: number;
  eligibility_days: number;
};

const EMPTY = {
  fullName: "",
  email: "",
  phone: "",
  currentOrg: "",
  currentDesignation: "",
  linkedin: "",
  relationship: "",
};

export default function ReferralForm({
  jobs,
  initialJobId,
}: {
  jobs: JobOption[];
  initialJobId?: string;
}) {
  const [jobId, setJobId] = useState(initialJobId ?? "");
  const [values, setValues] = useState({ ...EMPTY });
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitReferral,
    { status: "idle" },
  );

  const job = useMemo(() => jobs.find((j) => j.id === jobId), [jobs, jobId]);
  const errors = { ...clientErrors, ...(state.fieldErrors ?? {}) };

  function set(field: keyof typeof EMPTY, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (clientErrors[field]) {
      setClientErrors((e) => {
        const next = { ...e };
        delete next[field];
        return next;
      });
    }
  }

  function review() {
    const parsed = referralSchema.safeParse({ ...values, jobId, consent });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      setClientErrors(next);
      const first = document.getElementById(Object.keys(next)[0]);
      first?.focus();
      first?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setClientErrors({});
    setStep(2);
  }

  if (state.status === "done") {
    return (
      <div className="card mx-auto max-w-[560px] p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-good-soft)] text-[22px]">
          ✓
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight">Referral submitted</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--color-ink-2)]">
          <strong>{state.refCode}</strong> · {state.candidateName}
          {state.jobTitle ? ` for ${state.jobTitle}` : ""}
        </p>
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--color-ink-3)]">
          Talent Acquisition takes it from here. You will see every stage change in My
          referrals — you do not need to chase the recruiter.
        </p>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/referrals" className="btn-primary">
            Track this referral
          </Link>
          <Link href="/roles" className="btn-ghost">
            Refer someone else
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[620px]">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-tight">Refer someone</h1>
        <p className="mt-1 text-[15px] text-[var(--color-ink-2)]">
          {step === 1 ? "Takes about two minutes." : "Check before you submit."}
        </p>
      </div>

      {state.formError && (
        <p
          role="alert"
          className="card mb-5 border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4 text-[14px] leading-relaxed text-[var(--color-danger)]"
        >
          {state.formError}
        </p>
      )}

      <form action={formAction} className="card p-6">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="jobTitle" value={job?.title ?? ""} />
        <input type="hidden" name="consent" value={consent ? "on" : ""} />
        {step === 2 &&
          (Object.keys(EMPTY) as Array<keyof typeof EMPTY>).map((k) => (
            <input key={k} type="hidden" name={k} value={values[k]} />
          ))}

        {step === 1 ? (
          <>
            <div className="mb-5">
              <label htmlFor="jobId-select" className="label">
                Which role? <span className="text-[var(--color-danger)]">*</span>
              </label>
              <select
                id="jobId-select"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className={`field ${errors.jobId ? "field-error" : ""}`}
              >
                <option value="">Select a role</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} — {j.location} · {rupees(j.reward_amount)}
                  </option>
                ))}
              </select>
              {errors.jobId && <p className="hint">{errors.jobId}</p>}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="fullName"
                label="Candidate name"
                required
                value={values.fullName}
                onChange={(v) => set("fullName", v)}
                error={errors.fullName}
                placeholder="Full name"
              />
              <Field
                id="email"
                label="Email"
                required
                type="email"
                value={values.email}
                onChange={(v) => set("email", v)}
                error={errors.email}
                placeholder="name@email.com"
              />
              <Field
                id="phone"
                label="Phone"
                required
                type="tel"
                value={values.phone}
                onChange={(v) => set("phone", v)}
                error={errors.phone}
                placeholder="10-digit mobile"
              />
              <Field
                id="currentOrg"
                label="Current organisation"
                value={values.currentOrg}
                onChange={(v) => set("currentOrg", v)}
                error={errors.currentOrg}
              />
              <Field
                id="currentDesignation"
                label="Current designation"
                value={values.currentDesignation}
                onChange={(v) => set("currentDesignation", v)}
                error={errors.currentDesignation}
              />
              <Field
                id="linkedin"
                label="LinkedIn profile"
                value={values.linkedin}
                onChange={(v) => set("linkedin", v)}
                error={errors.linkedin}
                placeholder="linkedin.com/in/…"
              />
            </div>

            <div className="mt-5">
              <label htmlFor="relationship" className="label">
                How do you know them? <span className="text-[var(--color-danger)]">*</span>
              </label>
              <select
                id="relationship"
                value={values.relationship}
                onChange={(e) => set("relationship", e.target.value)}
                className={`field ${errors.relationship ? "field-error" : ""}`}
              >
                <option value="">Select</option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {errors.relationship && <p className="hint">{errors.relationship}</p>}
            </div>

            <div
              className={`mt-6 rounded-md border p-4 ${
                errors.consent
                  ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)]"
                  : "border-[var(--color-line)] bg-[var(--color-ground)]"
              }`}
            >
              <label htmlFor="consent" className="flex cursor-pointer items-start gap-3">
                <input
                  id="consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    setClientErrors((x) => {
                      const n = { ...x };
                      delete n.consent;
                      return n;
                    });
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                />
                <span className="text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
                  {CONSENT_NOTICE}
                </span>
              </label>
              {errors.consent && <p className="hint">{errors.consent}</p>}
            </div>

            <p className="mt-5 border-l-2 border-[var(--color-brand)] bg-[var(--color-brand-soft)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              We check for duplicates on email and phone. If the candidate is already in
              process you will be told straight away, without any details about who else
              referred them.
            </p>

            <button type="button" onClick={review} className="btn-primary mt-6 w-full">
              Review referral
            </button>
          </>
        ) : (
          <>
            <dl className="divide-y divide-[var(--color-line)]">
              <Row k="Candidate" v={values.fullName} />
              <Row k="Contact" v={`${values.email} · ${formatPhone(values.phone)}`} />
              {(values.currentDesignation || values.currentOrg) && (
                <Row
                  k="Currently at"
                  v={[values.currentDesignation, values.currentOrg].filter(Boolean).join(", ")}
                />
              )}
              {values.linkedin && <Row k="LinkedIn" v={values.linkedin} />}
              <Row k="How you know them" v={values.relationship} />
              <Row k="Role" v={job ? `${job.title} · ${job.location}` : "—"} />
              <Row
                k="Referral reward if they join"
                v={job ? rupees(job.reward_amount) : "—"}
                strong
              />
            </dl>

            <p className="mt-5 rounded-md bg-[var(--color-ground)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              Paid after the candidate completes {job?.eligibility_days ?? 30} days. The first
              referral on record wins if someone else refers the same person. Valid for six
              months.
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <button type="submit" className="btn-primary flex-1" disabled={pending}>
                {pending ? "Submitting…" : "Submit referral"}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-ghost"
                disabled={pending}
              >
                Back to edit
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  required,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label} {required && <span className="text-[var(--color-danger)]">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`field ${error ? "field-error" : ""}`}
      />
      {error && (
        <p id={`${id}-error`} className="hint" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-3">
      <dt className="text-[14px] text-[var(--color-ink-3)]">{k}</dt>
      <dd
        className={`text-right text-[14.5px] ${
          strong ? "font-semibold text-[var(--color-gold)]" : "text-[var(--color-ink)]"
        }`}
      >
        {v}
      </dd>
    </div>
  );
}
