import { LOGO_PAGE_LEFT_PATH, LOGO_PAGE_RIGHT_PATH, LOGO_VIEW_BOX, LOGO_WORDMARK_PATH } from "@/lib/brand";

/** Splash icon paired with the xEdit wordmark; the blue and mint-teal pages suit dark and light themes respectively. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEW_BOX} className={className} role="img" aria-label="xEdit" focusable="false">
      <path fill="var(--brand-mark)" fillRule="evenodd" d={LOGO_PAGE_RIGHT_PATH} />
      <path fill="var(--brand-mark-secondary)" fillRule="evenodd" d={LOGO_PAGE_LEFT_PATH} />
      <path fill="currentColor" fillRule="evenodd" d={LOGO_WORDMARK_PATH} />
    </svg>
  );
}
