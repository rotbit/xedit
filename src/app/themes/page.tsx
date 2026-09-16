/**
 * /themes 静态落地页：把内置的 13 套排版主题逐个用真实 CSS 渲染成完整样张。
 * buildThemeStyles() 一次性把全部主题的 CSS 内联进本页，themeClass(id) 再给每块样张套上对应作用域，
 * 所以新增主题只要往 THEME_METAS 里加一项，这个文件不用动。
 * 纯服务端组件，需要交互的部分（页头、开始写作按钮）都在 LandingChrome 里。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SITE_NAME } from "@/lib/site";
import { FullArticle } from "@/features/landing/components/ArticleSamples";
import { ThemesJsonLd } from "@/features/landing/components/JsonLd";
import {
  BTN_PRIMARY,
  LandingHeader,
  StartWritingButton,
} from "@/features/landing/components/LandingChrome";
import { themeClass } from "@/features/landing/lib/paper";
import { buildThemeStyles, THEME_METAS } from "@/features/landing/lib/themeStyles";

// description 里把 13 个主题名全列一遍，是为了吃下「公众号 + 主题名」这类长尾搜索词；
// canonical 固定成 /themes，避免带 #主题 锚点的分享链接被搜索引擎当成多个页面
export const metadata: Metadata = {
  title: "13 套微信公众号排版主题 · 完整样张",
  description:
    "xEdit 内置 13 套微信公众号排版主题：经典黑、微信绿、科技蓝、蓝莹、橙心、蔷薇紫、水墨、绛红、青竹、杂志风、靛夜、樱粉、极简。每套都用真实 CSS 渲染出完整样张，标注适用的内容类型，选好即可套用并一键复制到公众号。",
  alternates: { canonical: "/themes" },
  openGraph: {
    title: `13 套微信公众号排版主题 · ${SITE_NAME}`,
    description:
      "每套主题的完整样张：标题、正文、列表、引用、表格、链接在公众号里的真实效果。",
    url: "/themes",
  },
};

const SHELL = "mx-auto max-w-[1140px] px-5 sm:px-8";

/** 主题总览页：目录锚点 + 13 段样张 + 底部行动区。
 *  13 套主题的 CSS 用内联 <style> 注入、只在本页生效，不进全局样式表。 */
export default function ThemesPage() {
  return (
    <div className="landing-scroll h-full overflow-y-auto overflow-x-hidden bg-[var(--paper)]">
      <style>{buildThemeStyles()}</style>
      <ThemesJsonLd themes={THEME_METAS} />
      <LandingHeader />

      <main className={`${SHELL} pb-24 pt-14`}>
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
          回到首页
        </Link>

        <h1 className="mt-6 max-w-[900px] text-[clamp(28px,5vw,44px)] font-bold leading-[1.22] tracking-tight">
          13 套公众号排版主题，挑一套就能发
        </h1>
        <p className="mt-5 max-w-[680px] text-[15px] leading-[1.9] text-[var(--ink-soft)]">
          下面每一块都是主题的真实渲染结果——同一篇示例文章，换一套主题就是一种面貌。
          标题装饰、引用块、列表、表格、链接的处理方式各不相同，选好之后在编辑器里点一下即可套用，
          复制到公众号后台样式原样保留。主题之上还能再叠一层自定义 CSS。
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <StartWritingButton className={BTN_PRIMARY} />
          <span className="text-[12.5px] text-[var(--ink-faint)]">
            免登录即可试用全部主题
          </span>
        </div>

        {/* 主题目录：既是导航，也把 13 个主题名一次性喂给搜索引擎 */}
        <nav className="mt-12 border-y border-[var(--hairline)] py-5" aria-label="主题目录">
          <ul className="flex flex-wrap gap-x-5 gap-y-2.5">
            {THEME_METAS.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  className="flex items-center gap-1.5 text-[13.5px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: t.color }}
                    aria-hidden="true"
                  />
                  {t.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-16 space-y-20">
          {THEME_METAS.map((t, i) => (
            <article key={t.id} id={t.id}>
              <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
                <span className="font-mono text-[12.5px] text-[var(--ink-faint)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="flex items-center gap-2.5 text-[20px] font-semibold tracking-tight">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: t.color }}
                    aria-hidden="true"
                  />
                  {t.name}
                </h2>
                <span className="text-[13px] text-[var(--ink-faint)]">适合：{t.tag}</span>
              </div>
              {/* 样张宽度收到接近公众号正文的可读宽度，比铺满整行更接近真实观感 */}
              <div className="mt-5 max-w-[720px] overflow-hidden rounded-xl border border-[var(--hairline-strong)] bg-white shadow-[0_10px_36px_-24px_rgba(0,0,0,0.4)]">
                <div className={themeClass(t.id)} style={{ padding: "20px 26px 28px" }}>
                  <FullArticle name={t.name} />
                </div>
              </div>
            </article>
          ))}
        </div>

        <section className="mt-24 border-t border-[var(--hairline)] pt-14 text-center">
          <h2 className="text-[clamp(22px,3.4vw,30px)] font-semibold tracking-tight">
            挑好了？去写第一篇
          </h2>
          <p className="mt-3.5 text-[14px] text-[var(--ink-soft)]">
            打开就写，不登录也能用全部主题。
          </p>
          <div className="mt-7 flex justify-center">
            <StartWritingButton />
          </div>
        </section>
      </main>
    </div>
  );
}
