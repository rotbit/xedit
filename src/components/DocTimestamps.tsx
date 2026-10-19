"use client";

import { formatDateTime } from "@/lib/format";
import { useT } from "@/i18n/useT";
import type { DocMeta } from "@/features/workspace/types";

/**
 * The "· Created … · Updated …" segment in the meta bar. Split out because ArticleReader is already too long;
 * it brings its own leading separator, and when neither time exists the whole segment (separator included) doesn't render, so callers needn't check.
 * Inline it shows a short format that omits the current year; hovering shows the full time with year.
 */
export function DocTimestamps({ meta }: { meta?: DocMeta }) {
  const t = useT();
  const created = meta?.createdAt;
  const updated = meta?.updatedAt;
  const short = (iso: string) => formatDateTime(iso, { omitCurrentYear: true });
  return (
    <>
      {created ? (
        <>
          <span>·</span>
          <span title={formatDateTime(created)}>{t("创建于 {t}", { t: short(created) })}</span>
        </>
      ) : null}
      {updated ? (
        <>
          <span>·</span>
          <span title={formatDateTime(updated)}>{t("更新于 {t}", { t: short(updated) })}</span>
        </>
      ) : null}
    </>
  );
}
