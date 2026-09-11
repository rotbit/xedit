import { LOGO_MARK_PATH, LOGO_VIEW_BOX, LOGO_WORDMARK_PATH } from "@/lib/brand";

/** 展页图标配 xEdit 字标；靛蓝书页和文字分别适配深浅主题。 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEW_BOX} className={className} role="img" aria-label="xEdit" focusable="false">
      <path fill="var(--brand-mark)" fillRule="evenodd" d={LOGO_MARK_PATH} />
      <path fill="currentColor" fillRule="evenodd" d={LOGO_WORDMARK_PATH} />
    </svg>
  );
}
