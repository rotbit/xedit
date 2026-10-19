import { getLandingCopy } from "./content";
import { Landing } from "./Landing";
import { LocaleLandingActions } from "./LandingActions";
import type { LandingLocale } from "./locales";

/**
 * The landing page as served at /en and /ja: no workspace around it, so it's shown even to logged-in visitors
 * and isn't wrapped in .landing-boot (the returning-user CSS that covers the home page's landing never hides it).
 */
export function LocalizedLanding({ locale }: { locale: Exclude<LandingLocale, "zh"> }) {
  return (
    <LocaleLandingActions startLabel={getLandingCopy(locale).chrome.start}>
      <Landing locale={locale} />
    </LocaleLandingActions>
  );
}
