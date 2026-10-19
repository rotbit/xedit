import { LocalizedLanding } from "@/features/landing/LocalizedLanding";
import { landingMetadata } from "@/features/landing/seo";

export const metadata = landingMetadata("en");

/** English landing page: always the landing, logged in or not (see LocalizedLanding) */
export default function EnglishLandingPage() {
  return <LocalizedLanding locale="en" />;
}
