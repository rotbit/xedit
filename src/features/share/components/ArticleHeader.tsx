"use client";

// 分享页顶栏：品牌入口、剩余时效、批注数、CTA（从 SharedArticle 搬出）

import Link from "next/link";
import { fmtRemaining } from "../lib/format";

export function ArticleHeader({
  expiresAt,
  allowComment,
  openCount,
}: {
  expiresAt: string;
  allowComment: boolean;
  openCount: number;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-4">
      <Link href="/" className="text-[15px] font-bold tracking-tight text-[var(--ink)]">
        xedit
      </Link>
      <span className="text-[12px] text-[var(--ink-faint)]">文章分享</span>
      <span className="flex-1" />
      <span className="hidden text-[12px] text-[var(--ink-faint)] sm:block">
        {fmtRemaining(expiresAt)}
      </span>
      {allowComment ? (
        <span className="hidden rounded-full bg-[var(--accent-wash)] px-2.5 py-0.5 text-[12px] text-[var(--ink-soft)] sm:block">
          {openCount > 0 ? `${openCount} 条批注` : "选中文字即可批注"}
        </span>
      ) : null}
      <Link
        href="/"
        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
      >
        用 xedit 写作
      </Link>
    </header>
  );
}
