import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { queryOne } from "@/lib/db";

export type Employee = {
  id: string;
  email: string;
  full_name: string | null;
  department: string | null;
  location: string | null;
  /** Null until they have read the programme poster. */
  welcome_ack_at: string | null;
};

export type SignedInUser = { email: string; name: string };

/**
 * Who is signed in, from the session cookie alone.
 *
 * Deliberately touches no database. Signing in and seeing the app must not
 * depend on Postgres being reachable — only the screens that show real data do.
 */
export async function signedInUser(): Promise<SignedInUser | null> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  return { email, name: session?.user?.name || email.split("@")[0] };
}

export async function requireSignedInUser(): Promise<SignedInUser> {
  const user = await signedInUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The employee row, created on first use.
 *
 * Returns null when the database is unreachable, so a caller can fall back to a
 * read-only view rather than failing the whole page. Anything that writes must
 * treat null as "cannot proceed".
 */
export async function currentEmployee(): Promise<Employee | null> {
  const user = await signedInUser();
  if (!user) return null;

  try {
    return await queryOne<Employee>(
      `insert into employees (email, full_name)
       values ($1, nullif($2, ''))
       on conflict (email) do update
         set full_name = coalesce(employees.full_name, excluded.full_name)
       returning id, email, full_name, department, location, welcome_ack_at`,
      [user.email, user.name],
    );
  } catch {
    // No database configured yet, or it is down. The caller decides.
    return null;
  }
}
