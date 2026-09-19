import { LOGO_PAGE_LEFT_PATH, LOGO_PAGE_RIGHT_PATH, LOGO_VIEW_BOX, LOGO_WORDMARK_PATH } from "@/lib/brand";

/** 展页图标配 xEdit 字标；蓝色与薄荷青书页分别适配深浅主题。 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEW_BOX} className={className} role="img" aria-label="xEdit" focusable="false">
      <path fill="var(--brand-mark)" fillRule="evenodd" d={LOGO_PAGE_RIGHT_PATH} />
      <path fill="var(--brand-mark-secondary)" fillRule="evenodd" d={LOGO_PAGE_LEFT_PATH} />
      <path fill="currentColor" fillRule="evenodd" d={LOGO_WORDMARK_PATH} />
    </svg>
  );
}
