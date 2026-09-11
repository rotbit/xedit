import { LOGO_PATH, LOGO_VIEW_BOX } from "@/lib/brand";

/** 完整 xEdit 连字字标；跟随父级文字颜色，以适配深浅主题。 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEW_BOX} className={className} role="img" aria-label="xEdit" focusable="false">
      <path fill="currentColor" fillRule="evenodd" d={LOGO_PATH} />
    </svg>
  );
}
