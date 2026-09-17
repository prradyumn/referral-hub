import { query } from "@/lib/db";
import { requireSignedInUser } from "@/lib/employees";
import ReferralForm, { type JobOption } from "./ReferralForm";

export default async function ReferPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  await requireSignedInUser();

  const sp = await searchParams;

  const jobs = await query<JobOption>(
    `select id, title, location, department, reward_amount, eligibility_days
       from public.jobs
      where is_open
      order by is_priority desc, title`,
  );

  const initialJobId = jobs.some((j) => j.id === sp.job) ? sp.job : undefined;

  return <ReferralForm jobs={jobs} initialJobId={initialJobId} />;
}
