import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // The referral form uploads a CV of up to 4 MB (RESUME_MAX_BYTES). The
      // default here is 1 MB, and the limit counts multipart boundaries and
      // the other form fields too. 4.5 MB is also Vercel's own ceiling on a
      // function request body, so anything above it would never arrive.
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
