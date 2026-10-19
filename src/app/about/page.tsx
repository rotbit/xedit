import type { Metadata } from "next";
import { Landing } from "@/features/landing/Landing";

/**
 * Permanent entry to the landing page. `/` does double duty: once you have a workspace it's always the workspace,
 * so returning users can only see the product intro from here. Content is identical to the logged-out home page,
 * so it's noindex with canonical pointing back to `/` to avoid being flagged as a duplicate.
 */
export const metadata: Metadata = {
  title: "产品介绍",
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default function AboutPage() {
  return <Landing />;
}
