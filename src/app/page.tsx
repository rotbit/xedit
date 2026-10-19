import { Suspense } from "react";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { Home } from "@/features/workspace/Home";
import { Landing } from "@/features/landing/Landing";
import { landingMetadata } from "@/features/landing/seo";
import { SITE_NAME } from "@/lib/site";

/**
 * Logged-in sessions keep the tab title as just 「xEdit」: the long title is for search engines, daily users don't need it;
 * logged-out visitors (including crawlers) get the Chinese landing metadata with hreflang to /en and /ja.
 * absolute bypasses the parent template.
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  return session?.user ? { title: { absolute: SITE_NAME } } : landingMetadata("zh");
}

/**
 * The home page does double duty: the landing page when logged out, the workspace when logged in.
 *
 * The landing page is fully server-rendered and passed as a prop to the client Home: it's the only page on the site
 * search engines must read, so it can't be dynamically loaded with ssr:false as before (crawlers would get an empty shell).
 * Logged-in sessions never see the landing page, so skip rendering it entirely; the first HTML is just the workspace.
 */
export default async function HomePage() {
  const session = await auth();
  const loggedIn = Boolean(session?.user);

  return (
    <Suspense>
      <Home landing={loggedIn ? null : <Landing />} />
    </Suspense>
  );
}
