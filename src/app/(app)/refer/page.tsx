import { createClient } from "@/lib/supabase/server";
import ReferralForm, { type JobOption } from "./ReferralForm";

export default async function ReferPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("jobs")
    .select("id, title, location, department, reward_amount, eligibility_days")
    .eq("is_open", true)
    .order("is_priority", { ascending: false })
    .order("title");

  const jobs: JobOption[] = data ?? [];
  const initialJobId = jobs.some((j) => j.id === sp.job) ? sp.job : undefined;

  return <ReferralForm jobs={jobs} initialJobId={initialJobId} />;
}
