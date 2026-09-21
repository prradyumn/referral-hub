import "server-only";

import { notFound } from "next/navigation";
import { queryOne } from "@/lib/db";
import { currentEmployee, type Employee } from "@/lib/employees";

/**
 * Admin authorisation.
 *
 * CONTEXT.md §6 required this to be a deliberate choice rather than a drift:
 * *"Before any multi-role feature — admin, recruiter, manager — decide
 * deliberately whether to reintroduce RLS keyed on a session variable or to
 * keep all authorisation in the server layer. Do not drift into a
 * half-and-half state."*
 *
 * **The decision: authorisation stays in the server layer.** RLS is not
 * reintroduced. Reasons:
 *
 *   · Auth.js puts no identity into the Postgres session, so RLS would need
 *     `set local app.employee_id` on every connection — and the pooled Neon
 *     connection the app uses makes that easy to get subtly wrong.
 *   · One admin role over data the app already reads is not the case that
 *     justifies two enforcement layers.
 *   · Half-and-half is the failure §6 names, and adding RLS for admin alone
 *     while every employee query stays server-enforced is exactly that.
 *
 * The cost is that this function is the only thing standing between an
 * ordinary employee and the admin screens, so:
 *
 *   · **Every** admin route calls requireAdmin() as its first statement.
 *   · scripts/e2e-admin.mjs proves a non-admin is refused, and should be run
 *     whenever anything under /admin changes.
 */
export async function isAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email?.trim()) return false;
  const row = await queryOne<{ ok: boolean }>(
    `select is_admin_email($1) as ok`,
    [email.trim().toLowerCase()],
  );
  return row?.ok === true;
}

/**
 * The signed-in employee, if they are an admin.
 *
 * Answers 404 rather than 403 for a non-admin: the existence of the admin
 * area is not something an ordinary employee needs confirmed.
 */
export async function requireAdmin(): Promise<Employee> {
  const employee = await currentEmployee();
  if (!employee) notFound();
  if (!(await isAdmin(employee.email))) notFound();
  return employee;
}
