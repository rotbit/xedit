"use client";

import Link from "next/link";
import { ArrowRight, PenLine } from "lucide-react";
import { DarkToggle } from "@/components/DarkToggle";
import { GithubMark } from "@/components/GithubMark";
import { LogoMark } from "@/components/LogoMark";
import { GITHUB_URL, SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { useLandingActions } from "../LandingActions";

export const BTN_PRIMARY =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-6 text-[14.5px] font-medium text-[var(--accent-fg)] transition-all hover:bg-[var(--accent-deep)] hover:shadow-[0_6px_20px_-6px_rgba(0,0,0,0.35)]";

export const BTN_GHOST =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-6 text-[14.5px] text-[var(--ink)] transition-colors hover:bg-[var(--paper)]";

/** 主行动按钮：新建/继续本地文稿，未挂 Provider 时回首页 */
export function StartWritingButton({
  className = BTN_PRIMARY,
  icon = true,
}: {
  className?: string;
  icon?: boolean;
}) {
  const { onStart, startLabel } = useLandingActions();
  return (
    <button className={className} onClick={onStart}>
      {icon ? <PenLine size={16} /> : null}
      {startLabel}
    </button>
  );
}

export function LoginButton({ className = BTN_GHOST }: { className?: string }) {
  const { onLogin } = useLandingActions();
  return (
    <button className={className} onClick={onLogin}>
      登录 / 注册
    </button>
  );
}

/** 页脚的文字型行动点 */
export function StartWritingLink() {
  const { onStart, startLabel } = useLandingActions();
  return (
    <button
      className="group flex cursor-pointer items-center gap-1.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
      onClick={onStart}
    >
      {startLabel}
      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

const NAV = [
  { href: "/#features", label: "功能" },
  { href: "/#themes", label: "主题" },
  { href: "/#desktop", label: "Mac 版" },
  { href: "/#faq", label: "常见问题" },
];

export function LandingHeader() {
  const { onLogin } = useLandingActions();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--paper)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1140px] items-center gap-3 px-5 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={SITE_NAME}>
          <LogoMark className="h-6 w-6 text-[var(--seal)]" />
          <span className="text-[16px] font-semibold tracking-tight">{SITE_NAME}</span>
          <span className="hidden text-[12.5px] text-[var(--ink-faint)] sm:inline">
            {SITE_TAGLINE}
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-6 lg:flex" aria-label="页面导航">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-[13.5px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <span className="flex-1" />

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="在 GitHub 上查看 xEdit 源码"
          className="hidden h-8 w-8 items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] sm:flex"
        >
          <GithubMark size={17} />
        </a>
        <DarkToggle />
        <button
          className="hidden h-8 cursor-pointer items-center rounded-md px-3 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] sm:flex"
          onClick={onLogin}
        >
          登录
        </button>
        <StartWritingButton
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 text-[13px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-deep)]"
          icon={false}
        />
      </div>
    </header>
  );
}
