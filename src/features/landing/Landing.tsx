/**
 * 落地页整页。文案数据来自 ./data，主题样张样式来自 ./lib/themeStyles，需要点击的按钮来自
 * ./components/LandingChrome，本文件只管版面骨架和栏目顺序。
 * 整个文件没有 "use client"，所以这里不能放 hook 和事件；凡是要交互的都已拆成独立的客户端组件。
 */
import Link from "next/link";
import { Apple, ArrowRight, Check, Download, Mail } from "lucide-react";
import { GithubMark } from "@/components/GithubMark";
import { LogoMark } from "@/components/LogoMark";
import {
  CONTACT_EMAIL,
  GITHUB_URL,
  MAC_CTA,
  MAC_DOWNLOAD_URL,
  MAC_REQUIREMENT,
  SITE_TAGLINE,
} from "@/lib/site";
import { FEATURE_GROUPS, HERO_STATS, MAC_FEATURES, STEPS } from "./data";
import { themeClass } from "./lib/paper";
import { buildThemeStyles, THEME_METAS } from "./lib/themeStyles";
import { HeroArticle, MiniArticle } from "./components/ArticleSamples";
import { Faq } from "./components/Faq";
import { HeroDemo } from "./components/HeroDemo";
import { LandingJsonLd } from "./components/JsonLd";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  LandingHeader,
  LoginButton,
  StartWritingButton,
  StartWritingLink,
} from "./components/LandingChrome";
import { Showcase } from "./components/Showcase";

// 各栏目的栏宽/内边距统一走这个常量，否则相邻栏目的左右边界会差几像素，改宽度只改这里
const SHELL = "mx-auto w-full max-w-[1180px] px-5 sm:px-8";

/** 栏目标签：朱砂小点 + 字距拉开的短语，全站栏目共用一种。 */
function Eyebrow({ text, id }: { text: string; id?: string }) {
  return (
    <p
      id={id}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--brand-tint)] px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-[var(--brand)]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ember)]" aria-hidden="true" />
      {text}
    </p>
  );
}

/** 栏目头：标签 + 大标题 + 一句副题。note 收 ReactNode，好让 FAQ 那句里塞邮箱链接。 */
function SectionHead({
  eyebrow,
  title,
  note,
  id,
}: {
  eyebrow: string;
  title: React.ReactNode;
  note: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="max-w-[700px]">
      <Eyebrow text={eyebrow} id={id} />
      <h2 className="mt-5 text-[clamp(25px,3.4vw,36px)] font-semibold leading-[1.28] tracking-[-0.02em]">
        {title}
      </h2>
      <p className="mt-4 text-[14.5px] leading-[1.9] text-[var(--ink-soft)]">{note}</p>
    </div>
  );
}

/** 主题墙卡片：用主题真实 CSS 渲染的迷你样张 */
function ThemeCard({ id, name, color, tag }: (typeof THEME_METAS)[number]) {
  return (
    <li className="lp-card overflow-hidden">
      <div className="pointer-events-none h-[128px] overflow-hidden border-b border-[var(--hairline)] bg-white">
        <div
          className={themeClass(id)}
          style={{
            // 真实样张按 0.55 缩小塞进 128px 高的窗口里；width 取 1/0.55≈182%，缩放后刚好铺满卡片宽度
            transform: "scale(0.55)",
            transformOrigin: "top left",
            width: "182%",
            padding: "6px 16px",
          }}
        >
          <MiniArticle title={`${name}的标题`} />
        </div>
      </div>
      <div className="flex items-center gap-2 px-3.5 py-3">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden="true"
        />
        <span className="shrink-0 text-[13px] font-medium">{name}</span>
        <span className="ml-auto truncate text-[10.5px] text-[var(--ink-faint)]">{tag}</span>
      </div>
    </li>
  );
}

/** 首页全文。栏目顺序按读者的顾虑排：先看到成品、知道怎么用，再看能力全貌与三处深挖，
 *  然后是主题、客户端、疑问，最后收束到行动。 */
export function Landing() {
  return (
    // landing-scroll 表示落地页有自己的滚动容器（不是整页滚动），globals.css 里给它配了平滑滚动，
    // 并给带 id 的锚点留了 90px 上边距，避开吸顶导航
    <div className="landing-scroll h-full overflow-y-auto overflow-x-hidden bg-[var(--paper)]">
      {/* 13 套主题样张共用一份样式表，整页只注入这一次 */}
      <style>{buildThemeStyles()}</style>
      <LandingJsonLd />
      <LandingHeader />

      <main>
        {/* ———— 主视觉：居中单栏，样机本身就是主视觉 ———— */}
        <section className="landing-hero overflow-hidden">
          {/* 两层装饰：稿纸网格打底，顶部一团品牌光晕托住标题 */}
          <div className="landing-grid" aria-hidden="true" />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_58%_52%_at_50%_-8%,var(--brand-glow),transparent_72%)]"
            aria-hidden="true"
          />
          <div className={`${SHELL} relative pb-16 pt-12 sm:pt-18 lg:pt-22`}>
            <div className="mx-auto max-w-[780px] text-center">
              {/* rise 是入场动画，靠递增的 animationDelay 造出自上而下依次浮现；延迟值是照节奏手调的，插入新行要顺着往后顺一遍 */}
              <div className="rise flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--panel)] py-1.5 pl-2 pr-3.5 text-[12.5px] text-[var(--ink-soft)]">
                  <span className="rounded-full bg-[var(--brand-wash)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand)]">
                    免费
                  </span>
                  为中文写作者做的公众号排版工具
                </span>
              </div>
              <h1
                className="rise mt-7 text-[clamp(36px,5.8vw,64px)] font-semibold leading-[1.12] tracking-[-0.045em]"
                style={{ animationDelay: "0.05s" }}
              >
                <span className="font-[family-name:var(--serif)]">Markdown 写完，</span>
                <br />
                公众号里<span className="lp-mark">就是这个样子</span>
              </h1>
              <p
                className="rise mx-auto mt-7 max-w-[600px] text-[15.5px] leading-[1.95] text-[var(--ink-soft)]"
                style={{ animationDelay: "0.1s" }}
              >
                左边写，右边就是成稿。挑一套主题，点一下复制，粘进公众号后台，标题、引用、代码和公式的样式一条都不会掉。
              </p>
              <div
                className="rise mt-9 flex flex-wrap items-center justify-center gap-3"
                style={{ animationDelay: "0.14s" }}
              >
                <StartWritingButton />
                <a
                  className={BTN_GHOST}
                  href={MAC_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Apple size={16} />
                  {MAC_CTA}
                </a>
              </div>
              <p
                className="rise mt-4 text-[12.5px] leading-5 text-[var(--ink-faint)]"
                style={{ animationDelay: "0.18s" }}
              >
                不用注册，打开就写；文章先存在这台设备，登录后自动同步到云端
              </p>
              {/* 三个数字来自 HERO_STATS，改数值去 data.ts */}
              <dl
                className="rise mx-auto mt-9 flex max-w-[460px] items-stretch justify-center divide-x divide-[var(--hairline)] border-y border-[var(--hairline)] py-4"
                style={{ animationDelay: "0.22s" }}
              >
                {HERO_STATS.map((s) => (
                  <div key={s.label} className="flex-1 px-4">
                    <dt className="font-[family-name:var(--serif)] text-[22px] font-semibold leading-none tracking-tight">
                      {s.value}
                    </dt>
                    <dd className="mt-2 text-[12px] text-[var(--ink-faint)]">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rise mt-12 sm:mt-14" style={{ animationDelay: "0.26s" }}>
              <div className="mb-5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center">
                <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium tracking-[0.2em] text-[var(--brand)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--ember)]" aria-hidden="true" />
                  LIVE DEMO
                </span>
                <span className="text-[13px] text-[var(--ink-faint)]">
                  不是效果图：换主题即时生效，点「复制到公众号」会真的写进剪贴板
                </span>
              </div>
              <HeroDemo themes={THEME_METAS}>
                <HeroArticle />
              </HeroDemo>
            </div>
          </div>
        </section>

        {/* ———— 三步 ———— */}
        <section className={`${SHELL} pb-24`}>
          {/* 三步是并排的卡片，视觉上不需要栏目标题，但缺个 h2 会让屏幕阅读器读出的层级断档 */}
          <h2 className="sr-only">三步把 Markdown 发成公众号文章</h2>
          <ol className="grid gap-3.5 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.num} className="lp-card relative overflow-hidden p-6">
                {/* 序号压在卡片右上角，做底纹而不是读物 */}
                <span
                  className="pointer-events-none absolute right-4 top-4 font-[family-name:var(--serif)] text-[56px] leading-none text-[var(--hairline)]"
                  aria-hidden="true"
                >
                  {s.num}
                </span>
                <span className="relative text-[11px] font-medium tracking-[0.16em] text-[var(--brand)]">
                  STEP {s.num}
                </span>
                <h3 className="relative mt-3 text-[16px] font-semibold">{s.title}</h3>
                <p className="relative mt-2 text-[13px] leading-[1.8] text-[var(--ink-soft)]">
                  {s.desc}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ———— 能力全景 ———— */}
        <section className="border-y border-[var(--hairline)] bg-[var(--sidebar)]/45 py-22">
          <div className={SHELL}>
            <SectionHead
              id="features"
              eyebrow="能力全景"
              title="写公众号真正会用到的环节，都做完了"
              note="不只是「一个 Markdown 预览器」——排版、素材、版本、同步、给 AI 的接口，一个编辑器里全都齐。"
            />
            <div className="mt-14 space-y-12">
              {FEATURE_GROUPS.map((group) => (
                <div key={group.band}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-[16px] font-semibold tracking-tight">{group.band}</h3>
                    <span className="text-[12.5px] text-[var(--ink-faint)]">{group.note}</span>
                  </div>
                  <ul className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map(({ icon: Icon, title, desc }) => (
                      <li key={title} className="lp-card p-5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--brand-wash)] text-[var(--brand)]">
                          <Icon size={17} />
                        </span>
                        <h4 className="mt-3.5 text-[14.5px] font-semibold">{title}</h4>
                        <p className="mt-2 text-[13px] leading-[1.8] text-[var(--ink-soft)]">
                          {desc}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ———— 深度展示：把最容易被质疑的三件事各讲一屏 ———— */}
        <section className={`${SHELL} py-24`}>
          <Showcase />
        </section>

        {/* ———— 主题墙 ———— */}
        <section className="border-y border-[var(--hairline)] bg-[var(--sidebar)]/45 py-22">
          <div className={SHELL}>
            <SectionHead
              id="themes"
              eyebrow="排版主题"
              title="13 套主题，同一篇稿子十三种面貌"
              note="每套都标注了适用的内容类型，下面的缩略图就是真实渲染结果。不够贴合还能叠一层自定义 CSS，复制时一并内联。"
            />
            <ul className="mt-10 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
              {THEME_METAS.map((t) => (
                <ThemeCard key={t.id} {...t} />
              ))}
              {/* 13 张卡在 4 列下会留一个孤儿，第 14 格改成去主题总览的入口，正好补齐 */}
              <li>
                <Link
                  href="/themes"
                  className="group flex h-full min-h-[178px] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-[var(--hairline-strong)] text-[13.5px] text-[var(--ink-soft)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  看每套主题的完整样张
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            </ul>
          </div>
        </section>

        {/* ———— Mac 客户端 ———— */}
        <section className={`${SHELL} py-24`}>
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div>
              <SectionHead
                id="desktop"
                eyebrow="桌面端"
                title="Mac 客户端，写作独占一扇窗"
                note="和网页版同一个账号、同一份数据，多的是属于桌面应用的顺手：登录一次就一直在，原生菜单与快捷键，断网也照写。"
              />
              <ul className="mt-7 space-y-2.5">
                {MAC_FEATURES.map((f) => (
                  <li
                    key={f}
                    className="flex gap-2.5 text-[13.5px] leading-6 text-[var(--ink-soft)]"
                  >
                    <Check size={15} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a
                  className={BTN_PRIMARY}
                  href={MAC_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download size={16} />
                  {MAC_CTA}
                </a>
                <span className="text-[12.5px] text-[var(--ink-faint)]">{MAC_REQUIREMENT}</span>
              </div>
              <p className="mt-3.5 text-[12px] leading-5 text-[var(--ink-faint)]">
                安装包未做代码签名，首次打开请在「访达」里右键点图标选「打开」。
                Windows 暂无独立客户端，网页版功能完全一致。
              </p>
            </div>

            {/* 桌面窗口示意 */}
            <div className="overflow-hidden rounded-[14px] border border-[var(--hairline-strong)] bg-[var(--panel)] shadow-[0_28px_64px_-34px_rgba(0,0,0,0.5)]">
              <div className="flex h-9 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--sidebar)] px-4">
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fc625d]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fdbc40]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#35cd4b]" />
                </span>
                <LogoMark className="h-6 w-auto text-[var(--ink)]" />
              </div>
              {/* 分类和文章列表都是写死的示意数据，只为让人看懂桌面窗口长什么样，不要接真实接口 */}
              <div className="grid grid-cols-[104px_1fr]">
                <div className="space-y-1.5 border-r border-[var(--hairline)] bg-[var(--sidebar)] p-3">
                  {["全部文章", "技术", "职场", "随笔", "图片素材"].map((c, i) => (
                    <p
                      key={c}
                      className={`truncate rounded px-2 py-1 text-[11px] ${
                        i === 0
                          ? "bg-[var(--sidebar-active)] text-[var(--ink)]"
                          : "text-[var(--ink-faint)]"
                      }`}
                    >
                      {c}
                    </p>
                  ))}
                </div>
                <div className="space-y-2.5 p-4">
                  {[
                    { t: "三步把 Markdown 发成公众号", d: "2,418 字 · 今天" },
                    { t: "公众号排版避坑清单", d: "1,905 字 · 昨天" },
                    { t: "为什么样式粘过去会丢", d: "1,240 字 · 3 天前" },
                  ].map((d) => (
                    <div key={d.t} className="border-b border-[var(--hairline-soft)] pb-2.5">
                      <p className="truncate text-[12.5px] font-medium">{d.t}</p>
                      <p className="mt-1 text-[11px] text-[var(--ink-faint)]">{d.d}</p>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {["⌘N 新建", "⇧⌘H 工作台", "⌘+ 放大"].map((k) => (
                      <kbd
                        key={k}
                        className="rounded border border-[var(--hairline)] bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-faint)]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ———— 常见问题 ———— */}
        <section className="border-y border-[var(--hairline)] bg-[var(--sidebar)]/45 py-22">
          <div className={SHELL}>
            <SectionHead
              id="faq"
              eyebrow="常见问题"
              title="关于 xEdit，你可能想先问清楚"
              note={
                <>
                  还有别的问题，可以到 GitHub 仓库提 issue，或者直接写信到{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="text-[var(--brand)] underline decoration-[var(--hairline-strong)] underline-offset-4 transition-colors hover:decoration-[var(--brand)]"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  。
                </>
              }
            />
            <Faq />
          </div>
        </section>

        {/* ———— 收束 ———— */}
        <section className={`${SHELL} py-24`}>
          <div className="lp-card relative overflow-hidden px-6 py-16 text-center">
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[220px] bg-[radial-gradient(ellipse_50%_100%_at_50%_100%,var(--brand-glow),transparent_70%)]"
              aria-hidden="true"
            />
            <h2 className="relative text-[clamp(24px,4vw,38px)] font-semibold tracking-[-0.02em]">
              你的下一篇推文，从这里开始
            </h2>
            <p className="relative mx-auto mt-4 max-w-[460px] text-[14.5px] leading-[1.85] text-[var(--ink-soft)]">
              不用注册，打开就能写；写顺手了再登录，文章自动上云。
            </p>
            <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
              <StartWritingButton />
              <LoginButton />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--hairline)] bg-[var(--sidebar)]/45">
        <div className={`${SHELL} py-12`}>
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-8">
            <div className="flex items-center gap-3">
              <LogoMark className="h-10 w-auto shrink-0 text-[var(--ink)]" />
              <div>
                <p className="text-[13.5px] font-semibold">{SITE_TAGLINE}</p>
                <p className="mt-1 text-[11.5px] text-[var(--ink-faint)]">
                  本地优先 · 登录后云端同步 · 排版样式不丢
                </p>
              </div>
            </div>
            <nav
              className="flex flex-wrap items-center gap-x-6 gap-y-2.5 text-[13px] text-[var(--ink-soft)]"
              aria-label="页脚导航"
            >
              <Link href="/themes" className="transition-colors hover:text-[var(--ink)]">
                排版主题
              </Link>
              <Link href="#features" className="transition-colors hover:text-[var(--ink)]">
                功能
              </Link>
              <Link href="#desktop" className="transition-colors hover:text-[var(--ink)]">
                Mac 客户端
              </Link>
              <Link href="/changelog" className="transition-colors hover:text-[var(--ink)]">
                更新日志
              </Link>
              <Link href="#faq" className="transition-colors hover:text-[var(--ink)]">
                常见问题
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors hover:text-[var(--ink)]"
              >
                <GithubMark size={14} />
                GitHub
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex items-center gap-1.5 transition-colors hover:text-[var(--ink)]"
              >
                <Mail size={14} />
                反馈与合作
              </a>
              <StartWritingLink />
            </nav>
          </div>
          <p className="mt-9 border-t border-[var(--hairline)] pt-6 text-[11.5px] text-[var(--ink-faint)]">
            免费的 Markdown 公众号排版工具 · 联系我们：
            <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-[var(--ink)]">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
