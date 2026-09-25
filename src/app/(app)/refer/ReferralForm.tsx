"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { submitReferral, type SubmitState } from "./actions";
import {
  referralSchema,
  RELATIONSHIPS,
  CONSENT_NOTICE,
  formatPhone,
  quickResumeCheck,
  RESUME_ACCEPT,
} from "@/lib/validation";
import { rupees } from "@/lib/format";
import RolePicker from "./RolePicker";

export type JobOption = {
  id: string;
  title: string;
  location: string;
  department: string;
  reward_amount: number;
  reward_confirmed: boolean;
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
  // The CV is held here, not in the file input. The input unmounts on the
  // review step, remounts empty on "Back to edit", and React 19 resets
  // uncontrolled inputs after every form action — including one that returns
  // a validation error — so a file kept only in the input would be silently
  // dropped and the referral resubmitted without it.
  const [resume, setResume] = useState<File | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  // Server-reported fields the user has since edited — recorded against the
  // response they came from. A dismissal applies only to that response, so the
  // next submission's errors show without anything having to reset them.
  //
  // Clearing dismissals by hand (review() used to) brought the *previous*
  // response's errors back — `state` keeps them until the next one arrives —
  // and forced step 1 again, so after one refused CV the review step could
  // never be reached.
  const [dismissed, setDismissed] = useState<{
    for: SubmitState | null;
    fields: Record<string, true>;
  }>({ for: null, fields: {} });

  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitReferral,
    { status: "idle" },
  );

  const job = useMemo(() => jobs.find((j) => j.id === jobId), [jobs, jobId]);
  // All derived during render: no effect, and therefore no setState inside one.
  //
  // The review step renders no fields, so a server-side rejection used to have
  // nowhere to appear — the button simply returned to "Submit referral" with
  // nothing said. A server error now forces step 1, where the message sits next
  // to the field it concerns, and editing that field dismisses it.
  const serverErrors =
    state.status === "error" && state.fieldErrors ? state.fieldErrors : {};
  const dismissedFields = dismissed.for === state ? dismissed.fields : {};
  const liveServerErrors = Object.fromEntries(
    Object.entries(serverErrors).filter(([field]) => !dismissedFields[field]),
  );
  const errors: Record<string, string> = { ...liveServerErrors, ...clientErrors };
  const shownStep = Object.keys(liveServerErrors).length > 0 ? 1 : step;

  // A server error shows step 1 while `step` is still 2 — the review step the
  // submit came from. Dismissing the error without also resetting `step` sent
  // the user straight back to review the moment they started fixing it.
  function dismissServerError(field: string) {
    if (!liveServerErrors[field]) return;
    setDismissed({ for: state, fields: { ...dismissedFields, [field]: true } });
    setStep(1);
  }

  function set(field: keyof typeof EMPTY, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    dismissServerError(field);
    if (clientErrors[field]) {
      setClientErrors((e) => {
        const next = { ...e };
        delete next[field];
        return next;
      });
    }
  }

  function pickResume(file: File | null) {
    dismissServerError("resume");
    const problem = file ? quickResumeCheck(file) : null;
    setClientErrors((e) => {
      const next = { ...e };
      if (problem) next.resume = problem;
      else delete next.resume;
      return next;
    });
    setResume(problem ? null : file);
  }

  function review() {
    const parsed = referralSchema.safeParse({ ...values, jobId, consent });
    const resumeProblem = resume ? quickResumeCheck(resume) : null;
    if (!parsed.success || resumeProblem) {
      const next: Record<string, string> = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      if (resumeProblem) next.resume = resumeProblem;
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
        {state.resumeName && (
          <p className="mt-1.5 text-[13px] text-[var(--color-ink-3)]">
            CV attached: {state.resumeName}
          </p>
        )}
        {/* Say what actually happens next, step by step. The Hub cannot put the
            candidate into Keka itself yet; a recruiter does, from the inbox. */}
        <ol className="mx-auto mt-6 max-w-[420px] space-y-3 text-left">
          {[
            ["Talent Acquisition adds them", "Your referral lands in TA's inbox and they add the candidate to the hiring pipeline."],
            ["You track every stage here", "Shortlisted, interviewing, offer — it updates on its own. No need to chase anyone."],
            ["They join, you get paid", "The reward is paid with your salary after the qualifying period, and earns you gift points."],
          ].map(([h, b], i) => (
            <li key={h} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[12px] font-semibold text-[var(--color-brand)]">
                {i + 1}
              </span>
              <span>
                <span className="block text-[14px] font-semibold">{h}</span>
                <span className="block text-[13px] leading-relaxed text-[var(--color-ink-3)]">{b}</span>
              </span>
            </li>
          ))}
        </ol>
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
          {shownStep === 1 ? "Takes about two minutes." : "Check before you submit."}
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (resume) fd.set("resume", resume);
          startTransition(() => formAction(fd));
        }}
        className="card p-6"
      >
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="jobTitle" value={job?.title ?? ""} />
        {/* Only present when ticked: an empty string would satisfy `?? false`
            in the action and produce zod's generic message. */}
        {consent && <input type="hidden" name="consent" value="on" />}
        {shownStep === 2 &&
          (Object.keys(EMPTY) as Array<keyof typeof EMPTY>).map((k) => (
            <input key={k} type="hidden" name={k} value={values[k]} />
          ))}

        {shownStep === 1 ? (
          <>
            <div className="mb-5">
              <label htmlFor="jobId" className="label">
                Which role? <span className="text-[var(--color-danger)]">*</span>
              </label>
              <RolePicker
                id="jobId"
                jobs={jobs}
                value={jobId}
                onChange={setJobId}
                error={errors.jobId}
              />
              {errors.jobId && <p className="hint">{errors.jobId}</p>}

              {/* What this referral could earn, in view while filling the rest
                  in — not held back until the review step. */}
              {job && (
                job.reward_confirmed ? (
                  <div className="cash-panel cash-shine-loop mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
                    <span className="cash-coin h-9 w-9 text-[15px]" aria-hidden="true">₹</span>
                    <p className="min-w-0 flex-1 text-[13.5px] text-[#6b4200]">
                      If they join, you earn{" "}
                      <span className="cash-amount text-[19px] font-extrabold">
                        cash up to {rupees(job.reward_amount)}
                      </span>
                    </p>
                    <span className="rounded-full bg-white/75 px-2 py-1 text-[11px] font-semibold text-[#7a5200] ring-1 ring-[#a8760f]/25">
                      +{Math.round(job.reward_amount).toLocaleString("en-IN")} reward points
                    </span>
                  </div>
                ) : (
                  <p className="mt-3 rounded-md bg-[var(--color-ground)] px-3.5 py-2.5 text-[13px] text-[var(--color-ink-2)]">
                    The reward for this role is still being confirmed. Whatever is agreed
                    applies to your referral.
                  </p>
                )
              )}
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

            <ResumeField
              file={resume}
              error={errors.resume}
              onPick={pickResume}
              onClear={() => pickResume(null)}
            />

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
              <Row k="CV" v={resume ? `${resume.name} · ${fileSize(resume.size)}` : "Not attached"} />
              <Row k="Role" v={job ? `${job.title} · ${job.location}` : "—"} />
              <Row
                k="If they join, you earn"
                v={
                  job
                    ? job.reward_confirmed
                      ? `Cash up to ${rupees(job.reward_amount)}`
                      : "Reward to be confirmed"
                    : "—"
                }
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

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Optional. Once a file is chosen it is shown from state rather than the
 * native input, so it reads correctly after the input has remounted.
 */
function ResumeField({
  file,
  error,
  onPick,
  onClear,
}: {
  file: File | null;
  error?: string;
  onPick: (file: File | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="mt-5">
      <label htmlFor="resume" className="label">
        CV <span className="font-normal text-[var(--color-ink-3)]">(optional)</span>
      </label>

      {file ? (
        <div
          className={`flex min-w-0 items-center gap-3 rounded-md border px-3 py-2.5 ${
            error ? "border-[var(--color-danger)]" : "border-[var(--color-line)]"
          }`}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--color-brand-soft)] text-[10px] font-bold text-[var(--color-brand)] uppercase"
            aria-hidden="true"
          >
            {file.name.split(".").pop()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{file.name}</span>
            <span className="block text-[12px] text-[var(--color-ink-3)]">{fileSize(file.size)}</span>
          </span>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[13px] text-[var(--color-ink-3)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            Remove
          </button>
        </div>
      ) : (
        <input
          id="resume"
          type="file"
          accept={RESUME_ACCEPT}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "resume-error" : "resume-help"}
          className={`field cursor-pointer file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-[var(--color-brand-soft)] file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-[var(--color-brand)] ${
            error ? "field-error" : ""
          }`}
        />
      )}

      {error ? (
        <p id="resume-error" className="hint" role="alert">
          {error}
        </p>
      ) : (
        <p id="resume-help" className="mt-1.5 text-[12.5px] text-[var(--color-ink-3)]">
          PDF or Word (.docx), up to 4 MB. Only Talent Acquisition can open it.
        </p>
      )}
    </div>
  );
}
