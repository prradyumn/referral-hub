import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { queryOne } from "@/lib/db";

export type Employee = {
  id: string;
  email: string;
  full_name: string | null;
  department: string | null;
  location: string | null;
};

/**
 * The signed-in employee, created on first sign-in.
 *
 * Phase 0 did this in a trigger on auth.users. With authentication in the
 * application there is no such insert to hang a trigger on, so the row is
 * upserted here on first use. The domain rule is still enforced in the database
 * as well, by the employees_domain_check trigger in 0002 — a bug here cannot
 * create an out-of-domain employee.
 *
 * Node runtime only: it touches pg. Never call it from the proxy.
 */
export async function currentEmployee(): Promise<Employee | null> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;

  const fullName = session?.user?.name ?? "";

  return queryOne<Employee>(
    `insert into public.employees (email, full_name)
     values ($1, nullif($2, ''))
     on conflict (email) do update
       set full_name = coalesce(public.employees.full_name, excluded.full_name)
     returning id, email, full_name, department, location`,
    [email, fullName],
  );
}

/** As above, but sends anyone not signed in to the login page. */
export async function requireEmployee(): Promise<Employee> {
  const employee = await currentEmployee();
  if (!employee) redirect("/login");
  return employee;
}
