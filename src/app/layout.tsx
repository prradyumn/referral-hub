import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Self-hosted by Next at build time: no request to Google's CDN, no render-blocking
// stylesheet, and no swap-in shift. Replaces the hand-written <link> tags, which
// ESLint flags as loading per-page only.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Referral Hub — ConveGenius",
  description: "Refer someone you would want to work with.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
