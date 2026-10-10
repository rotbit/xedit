"use client";

import { formatDateTime } from "@/lib/format";
import { useT } from "@/i18n/useT";
import type { DocMeta } from "@/features/workspace/types";

/**
 * 元信息栏里的「· 创建于 … · 更新于 …」一段。单拆出来是因为 ArticleReader 已经超长；
 * 自带前导分隔点，两个时间都没有时整段（含分隔点）不渲染，调用方不用再判断。
 * 行内只显示省掉当年年份的短格式，悬停给带年份的完整时间。
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
