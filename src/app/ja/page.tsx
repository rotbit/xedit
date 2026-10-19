import { LocalizedLanding } from "@/features/landing/LocalizedLanding";
import { landingMetadata } from "@/features/landing/seo";

export const metadata = landingMetadata("ja");

/** Japanese landing page: always the landing, logged in or not (see LocalizedLanding) */
export default function JapaneseLandingPage() {
  return <LocalizedLanding locale="ja" />;
}
