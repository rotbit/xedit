/**
 * The full landing page. Copy comes from ./content (one typed dictionary per locale), sections from ./components;
 * this file only handles the section order and passes each section its slice of the dictionary.
 * The file has no "use client", so no hooks or event handlers here; anything interactive is split into its own client component.
 */
import { CONTACT_EMAIL } from "@/lib/site";
import { getLandingCopy, type LandingLocale } from "./content";
import { Faq } from "./components/Faq";
import { FeatureGrid } from "./components/FeatureGrid";
import { LandingFooter } from "./components/Footer";
import { Hero } from "./components/Hero";
import { LandingJsonLd } from "./components/JsonLd";
import { LandingHeader, LoginButton, StartWritingButton } from "./components/LandingChrome";
import { MacSection } from "./components/MacSection";
import { Pillars } from "./components/Pillars";
import { BAND, SectionHead, SHELL } from "./components/Section";
import { Showcases } from "./components/Showcase";

/** Section order: what it is (hero + app window), the four starting points, one screen per headline capability,
 *  the full feature set, the desktop app, FAQ, and finally the call to action. */
export function Landing({ locale = "zh" }: { locale?: LandingLocale }) {
  const copy = getLandingCopy(locale);
  return (
    // landing-scroll means the landing page has its own scroll container (not whole-page scroll); globals.css gives it smooth scrolling
    // and a 90px top offset for anchors with an id, to clear the sticky nav
    <div className="landing-scroll h-full overflow-y-auto overflow-x-hidden bg-[var(--paper)]">
      <LandingJsonLd copy={copy} locale={locale} />
      <LandingHeader copy={copy.chrome} locale={locale} />

      <main>
        <Hero copy={copy.hero} mockup={copy.mockup} />
        <Pillars srTitle={copy.pillars.srTitle} items={copy.pillars.items} />
        <Showcases copy={copy.showcases} />
        <FeatureGrid copy={copy.features} />
        <MacSection copy={copy.mac} />

        {/* ———— FAQ ———— */}
        <section className={BAND}>
          <div className={SHELL}>
            <SectionHead
              id="faq"
              eyebrow={copy.faq.eyebrow}
              title={copy.faq.title}
              note={
                <>
                  {copy.faq.noteBefore}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="text-[var(--brand)] underline decoration-[var(--hairline-strong)] underline-offset-4 transition-colors hover:decoration-[var(--brand)]"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  {copy.faq.noteAfter}
                </>
              }
            />
            <Faq items={copy.faq.items} />
          </div>
        </section>

        {/* ———— Closing ———— */}
        <section className={`${SHELL} py-24`}>
          <div className="lp-card relative overflow-hidden px-6 py-16 text-center">
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[220px] bg-[radial-gradient(ellipse_50%_100%_at_50%_100%,var(--brand-glow),transparent_70%)]"
              aria-hidden="true"
            />
            <h2 className="relative text-[clamp(24px,4vw,38px)] font-semibold tracking-[-0.02em]">
              {copy.cta.title}
            </h2>
            <p className="relative mx-auto mt-4 max-w-[460px] text-[14.5px] leading-[1.85] text-[var(--ink-soft)]">
              {copy.cta.note}
            </p>
            <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
              <StartWritingButton />
              <LoginButton label={copy.chrome.loginOrSignup} />
            </div>
          </div>
        </section>
      </main>

      <LandingFooter
        copy={copy.footer}
        tagline={copy.chrome.tagline}
        locale={locale}
        langAria={copy.chrome.langAria}
      />
    </div>
  );
}
