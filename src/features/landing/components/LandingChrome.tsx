"use client";

/**
 * 落地页共用的外壳零件：按钮样式常量、行动按钮、顶部导航栏。
 * 按钮的实际行为（新建还是继续本地文稿、弹哪个登录框）由 LandingActions 的 Provider 提供，
 * 所以 /themes 这类独立静态页可以直接复用这些组件，不用各自接一套逻辑。
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, PenLine } from "lucide-react";
import { DarkToggle } from "@/components/DarkToggle";
import { GithubMark } from "@/components/GithubMark";
import { LogoMark } from "@/components/LogoMark";
import { GITHUB_URL, SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { useLandingActions } from "../LandingActions";

// 按钮外观做成类名常量而不是组件：落地页里有几处要把这套样式套在 Link 或别的标签上
export const BTN_PRIMARY =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-[var(--brand)] px-6 text-[14.5px] font-medium text-[var(--brand-fg)] transition-all hover:bg-[var(--brand-deep)] hover:shadow-[0_10px_24px_-10px_var(--brand)]";

export const BTN_GHOST =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--panel)] px-6 text-[14.5px] text-[var(--ink)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]";

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

/** 登录入口。点击行为由 Provider 决定，通常是就地弹登录框而不是跳页面。 */
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

// 除「更新日志」是独立路由外，其余都是页内锚点，对应 Landing.tsx 里各 section 的 id；
// 改 id 必须同步改这里，否则导航点了不动
const NAV = [
  { href: "#editor", label: "编辑器" },
  { href: "#themes", label: "主题" },
  { href: "#ai-review", label: "AI 审核" },
  { href: "#publish", label: "一键发布" },
  { href: "#desktop", label: "Mac 版" },
  { href: "/changelog", label: "更新日志" },
  { href: "#faq", label: "常见问题" },
];

export function LandingHeader() {
  const { onLogin } = useLandingActions();
  // 这条顶栏也用在 /themes、/changelog 上：那里的 #锚点要先回到落地页才跳得到。
  // 回 /about 而不是 /——有本机文稿的人打开 / 是工作台，不是落地页
  const pathname = usePathname();
  const onLanding = pathname === "/" || pathname === "/about";
  const resolve = (href: string) => (href.startsWith("#") && !onLanding ? `/about${href}` : href);
  return (
    // app-titlebar / traffic-inset：桌面壳未登录时显示落地页，这条顶栏充当系统标题栏
    <header className="app-titlebar sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--paper)]/85 backdrop-blur-md">
      <div className="traffic-inset mx-auto flex h-14 max-w-[1140px] items-center gap-3 px-5 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={SITE_NAME}>
          <LogoMark className="h-9 w-auto text-[var(--ink)]" />
          <span className="hidden text-[12.5px] text-[var(--ink-faint)] sm:inline">
            {SITE_TAGLINE}
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-6 lg:flex" aria-label="页面导航">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={resolve(n.href)}
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
          className="hidden h-8 w-8 items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors hover:bg-[var(--brand-wash)] hover:text-[var(--ink)] sm:flex"
        >
          <GithubMark size={17} />
        </a>
        <DarkToggle />
        <button
          className="hidden h-8 cursor-pointer items-center rounded-md px-3 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--brand-wash)] hover:text-[var(--ink)] sm:flex"
          onClick={onLogin}
        >
          登录
        </button>
        <StartWritingButton
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--brand)] px-3.5 text-[13px] font-medium text-[var(--brand-fg)] transition-colors hover:bg-[var(--brand-deep)]"
          icon={false}
        />
      </div>
    </header>
  );
}
