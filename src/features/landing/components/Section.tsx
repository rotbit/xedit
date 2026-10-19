/**
 * Layout primitives shared by every landing section: the page shell width, the section label and the section header.
 * Server components only; nothing here is interactive.
 */

// Section width/padding all go through this constant, otherwise adjacent sections' edges drift by a few pixels; change widths only here
export const SHELL = "mx-auto w-full max-w-[1180px] px-5 sm:px-8";

/** Tinted band behind alternating sections */
export const BAND = "border-y border-[var(--hairline)] bg-[var(--sidebar)]/45 py-22";

/** Section label: a vermilion dot + a letter-spaced phrase, one style shared by every section on the site. */
export function Eyebrow({
  text,
  id,
  badge,
}: {
  text: string;
  id?: string;
  /** Small pill after the label, e.g. 「内测中」 (Beta) */
  badge?: string;
}) {
  return (
    <p
      id={id}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--brand-tint)] px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-[var(--brand)]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ember)]" aria-hidden="true" />
      {text}
      {badge ? (
        <span className="rounded-full bg-[var(--ember-wash)] px-1.5 py-px text-[10px] tracking-normal text-[var(--ember)]">
          {badge}
        </span>
      ) : null}
    </p>
  );
}

/** Section header: label + big title + one-line subtitle. `note` takes a ReactNode so the FAQ one can include an email link. */
export function SectionHead({
  eyebrow,
  title,
  note,
  id,
}: {
  eyebrow: string;
  title: React.ReactNode;
  note: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="max-w-[700px]">
      <Eyebrow text={eyebrow} id={id} />
      <h2 className="mt-5 text-[clamp(25px,3.4vw,36px)] font-semibold leading-[1.28] tracking-[-0.02em]">
        {title}
      </h2>
      <p className="mt-4 text-[14.5px] leading-[1.9] text-[var(--ink-soft)]">{note}</p>
    </div>
  );
}

/** macOS traffic lights for the window mockups */
export function TrafficLights() {
  return (
    <span className="flex shrink-0 gap-1.5" aria-hidden="true">
      <span className="h-2.5 w-2.5 rounded-full bg-[#fc625d]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#fdbc40]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#35cd4b]" />
    </span>
  );
}
