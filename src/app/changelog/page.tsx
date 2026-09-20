/**
 * /changelog 更新日志：照 features/changelog/data.ts 渲染的一条时间线。
 * 纯服务端组件；页头复用落地页的 LandingHeader（未挂 Provider 时它的按钮会回首页）。
 * 每次发版前往 data.ts 开头加一条，这个文件不用动。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { LandingHeader } from "@/features/landing/components/LandingChrome";
import {
  CHANGELOG,
  CHANGE_KIND_LABEL,
  formatChangelogDate,
  type ChangeKind,
} from "@/features/changelog/data";

export const metadata: Metadata = {
  title: "更新日志",
  description: `${SITE_NAME} 的更新日志：每次更新加了什么新功能、优化了哪里、修了哪些问题，按时间倒序记录。`,
  alternates: { canonical: "/changelog" },
  openGraph: {
    title: `更新日志 · ${SITE_NAME}`,
    description: "每次更新加了什么、改好了什么，都记在这里。",
    url: "/changelog",
  },
};

/** 三种变化各一个安静的色：新功能用品牌色，其余退到灰阶，扫一眼先看见「新」的 */
const KIND_STYLE: Record<ChangeKind, string> = {
  new: "bg-[var(--brand-wash)] text-[var(--brand)]",
  improved: "bg-[var(--hairline-soft)] text-[var(--ink-soft)]",
  fixed: "bg-[var(--hairline-soft)] text-[var(--ink-faint)]",
};

export default function ChangelogPage() {
  return (
    <div className="landing-scroll h-full overflow-y-auto overflow-x-hidden bg-[var(--paper)]">
      <LandingHeader />

      <main className="mx-auto max-w-[820px] px-5 pb-24 pt-14 sm:px-8">
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
          回到首页
        </Link>

        <h1 className="mt-6 text-[clamp(28px,5vw,40px)] font-bold leading-[1.22] tracking-tight">
          更新日志
        </h1>
        <p className="mt-4 text-[15px] leading-[1.9] text-[var(--ink-soft)]">
          {SITE_NAME} 每次更新加了什么、改好了什么，都记在这里。想要的功能还没有，或者哪里不好用，
          写信到{" "}
          <a className="text-[var(--brand)] hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          。
        </p>

        <ol className="mt-12 border-l border-[var(--hairline)]">
          {CHANGELOG.map((entry) => (
            <li key={entry.date} id={entry.date} className="relative pb-12 pl-6 last:pb-0 sm:pl-8">
              <span
                className="absolute -left-[4.5px] top-[7px] h-2 w-2 rounded-full bg-[var(--brand)] ring-4 ring-[var(--paper)]"
                aria-hidden="true"
              />
              <time
                dateTime={entry.date}
                className="text-[12.5px] tabular-nums tracking-wide text-[var(--ink-faint)]"
              >
                {formatChangelogDate(entry.date)}
              </time>
              <h2 className="mt-1.5 text-[18px] font-semibold leading-snug tracking-tight">
                {entry.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {entry.items.map((item) => (
                  <li key={item.text} className="flex gap-3 text-[14px] leading-[1.8]">
                    <span
                      className={`mt-[3px] h-[20px] shrink-0 rounded px-1.5 text-[11px] leading-[20px] ${KIND_STYLE[item.kind]}`}
                    >
                      {CHANGE_KIND_LABEL[item.kind]}
                    </span>
                    <span className="text-[var(--ink-soft)]">
                      {item.text}
                      {item.beta ? (
                        <span className="ml-1.5 whitespace-nowrap text-[12px] text-[var(--ink-faint)]">
                          （内测中，暂未对所有账号开放）
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <p className="mt-16 flex items-center gap-2 border-t border-[var(--hairline)] pt-6 text-[13px] text-[var(--ink-faint)]">
          <Mail size={14} />
          问题与建议：
          <a className="text-[var(--ink-soft)] hover:text-[var(--ink)]" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </main>
    </div>
  );
}
