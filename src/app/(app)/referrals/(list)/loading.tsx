// In a route group so it covers the list only. /referrals/[id] answers 404
// for a referral that is not yours, and under a loading boundary that 404
// would stream out with a 200 status — see src/components/PageSkeleton.tsx.
export { default } from "@/components/PageSkeleton";
