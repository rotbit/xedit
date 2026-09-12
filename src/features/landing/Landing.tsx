import Link from "next/link";
import { Apple, ArrowRight, Check, Download } from "lucide-react";
import { GithubMark } from "@/components/GithubMark";
import { LogoMark } from "@/components/LogoMark";
import {
  GITHUB_URL,
  MAC_CTA,
  MAC_DOWNLOAD_URL,
  MAC_REQUIREMENT,
  SITE_TAGLINE,
} from "@/lib/site";
import { FEATURE_GROUPS, MAC_FEATURES, STEPS } from "./data";
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

const SHELL = "mx-auto max-w-[1140px] px-5 sm:px-8";

/** 栏目头：小号字距标签 + 大标题 + 一句副题 */
function SectionHead({
  eyebrow,
  title,
  note,
  id,
}: {
  eyebrow: string;
  title: string;
  note: string;
  id?: string;
}) {
  return (
    <div className="max-w-[680px]">
      <p
        id={id}
        className="flex items-center gap-2 text-[11.5px] font-medium tracking-[0.18em] text-[var(--brand)]"
      >
        <span className="h-1 w-1 rounded-full bg-[var(--brand)]" />
        {eyebrow}
      </p>
      <h2 className="mt-3.5 text-[clamp(23px,3.2vw,32px)] font-semibold leading-[1.3] tracking-tight">
        {title}
      </h2>
      <p className="mt-3.5 text-[14.5px] leading-[1.85] text-[var(--ink-soft)]">{note}</p>
    </div>
  );
}

/** 主题墙卡片：用主题真实 CSS 渲染的迷你样张 */
function ThemeCard({ id, name, color, tag }: (typeof THEME_METAS)[number]) {
  return (
    <li className="overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--panel)] transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]">
      <div className="pointer-events-none h-[122px] overflow-hidden border-b border-[var(--hairline)] bg-white">
        <div
          className={themeClass(id)}
          style={{
            transform: "scale(0.55)",
            transformOrigin: "top left",
            width: "182%",
            padding: "6px 16px",
          }}
        >
          <MiniArticle title={`${name}的标题`} />
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
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

export function Landing() {
  return (
    <div className="landing-scroll h-full overflow-y-auto overflow-x-hidden bg-[var(--paper)]">
      {/* 13 套主题样张共用一份样式表，整页只注入这一次 */}
      <style>{buildThemeStyles()}</style>
      <LandingJsonLd />
      <LandingHeader />

      <main>
        {/* ———— 主视觉：居中单栏，样机本身就是主视觉 ———— */}
        <section className="landing-hero relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgba(72,71,143,0.12),transparent)]"
            aria-hidden="true"
          />
          <div className={`${SHELL} relative pb-14 pt-14 sm:pt-20 lg:pt-24`}>
            <div className="mx-auto max-w-[760px] text-center">
              <p className="rise flex items-center justify-center gap-3 text-[12px] font-medium tracking-[0.14em] text-[var(--brand)]">
                <span className="h-px w-8 bg-[var(--brand)]" />
                为中文写作者做的排版工具
                <span className="h-px w-8 bg-[var(--brand)]" />
              </p>
              <h1
                className="rise mt-6 text-[clamp(38px,6vw,68px)] font-semibold leading-[1.08] tracking-[-0.045em]"
                style={{ animationDelay: "0.05s" }}
              >
                <span className="font-[family-name:var(--serif)]">写 Markdown，</span>
                <br />
                一键排好公众号
              </h1>
              <p
                className="rise mx-auto mt-6 max-w-[560px] text-[15.5px] leading-[1.9] text-[var(--ink-soft)]"
                style={{ animationDelay: "0.1s" }}
              >
                左边写 Markdown，右边就是公众号里的成稿。选主题、点复制，粘进后台，
                标题、引用、公式和代码样式一个不丢。
              </p>
              <div
                className="rise mt-8 flex flex-wrap items-center justify-center gap-3"
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
                无需注册，打开就写；文章先存在本设备，登录后自动同步云端
              </p>
              <p
                className="rise mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] text-[var(--ink-faint)]"
                style={{ animationDelay: "0.22s" }}
              >
                <span>
                  <strong className="font-[family-name:var(--serif)] text-[17px] font-semibold text-[var(--ink)]">
                    13
                  </strong>{" "}
                  套排版主题
                </span>
                <span>
                  <strong className="font-[family-name:var(--serif)] text-[17px] font-semibold text-[var(--ink)]">
                    5
                  </strong>{" "}
                  种导出格式
                </span>
                <span>
                  <strong className="font-[family-name:var(--serif)] text-[17px] font-semibold text-[var(--ink)]">
                    0 元
                  </strong>{" "}
                  核心排版免费
                </span>
              </p>
            </div>

            <div className="rise mt-12 sm:mt-14" style={{ animationDelay: "0.26s" }}>
              <div className="mb-5 text-center">
                <p className="text-[10.5px] font-medium tracking-[0.2em] text-[var(--brand)]">
                  LIVE DEMO
                </p>
                <p className="mt-2 text-[13px] text-[var(--ink-faint)]">
                  不是效果图：换主题即时生效，点「复制到公众号」会真的写进剪贴板
                </p>
              </div>
              <HeroDemo themes={THEME_METAS}>
                <HeroArticle />
              </HeroDemo>
            </div>
          </div>
        </section>

        {/* ———— 三步 ———— */}
        <section className={`${SHELL} pb-24`}>
          <div className="grid border-y border-[var(--hairline)] sm:grid-cols-3">
            <h2 className="sr-only">三步把 Markdown 发成公众号文章</h2>
            {STEPS.map((s, index) => (
              <div
                key={s.num}
                className={`relative py-7 sm:px-7 sm:py-8 ${
                  index ? "border-t border-[var(--hairline)] sm:border-l sm:border-t-0" : ""
                }`}
              >
                <span className="font-[family-name:var(--serif)] text-[34px] leading-none text-[var(--hairline-strong)]">
                  {s.num}
                </span>
                <div className="mt-4">
                  <h3 className="text-[15px] font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-[1.75] text-[var(--ink-soft)]">
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ———— 深度展示 ———— */}
        <section className={`${SHELL} pb-28`}>
          <Showcase />
        </section>

        {/* ———— 能力全景 ———— */}
        <section className="border-t border-[var(--hairline)] bg-[var(--sidebar)]/40 py-20">
          <div className={SHELL}>
            <SectionHead
              id="features"
              eyebrow="能力全景"
              title="从写作到发布，需要的都在里面"
              note="不是「一个 Markdown 预览器」——排版、素材、版本、同步、AI 接口，写公众号真正会用到的环节都做完了。"
            />
            <div className="mt-14 space-y-14">
              {FEATURE_GROUPS.map((group) => (
                <div key={group.band}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--hairline-strong)] pb-3">
                    <h3 className="text-[16px] font-semibold tracking-tight">{group.band}</h3>
                    <span className="text-[12.5px] text-[var(--ink-faint)]">{group.note}</span>
                  </div>
                  <ul className="mt-6 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map(({ icon: Icon, title, desc }) => (
                      <li key={title}>
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-wash)] text-[var(--brand)]">
                          <Icon size={16} />
                        </span>
                        <h4 className="mt-3 text-[14.5px] font-semibold">{title}</h4>
                        <p className="mt-1.5 text-[13px] leading-[1.8] text-[var(--ink-soft)]">
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

        {/* ———— 主题墙 ———— */}
        <section className={`${SHELL} py-20`}>
          <SectionHead
            id="themes"
            eyebrow="排版主题"
            title="13 套主题，一套内容十三种面貌"
            note="每套主题都标注了适用的内容类型，缩略图就是真实渲染结果。不够用还能叠一层自定义 CSS，复制时一并内联。"
          />
          <ul className="mt-10 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
            {THEME_METAS.map((t) => (
              <ThemeCard key={t.id} {...t} />
            ))}
            {/* 13 张卡在 4 列下会留一个孤儿，第 14 格改成去主题总览的入口，正好补齐 */}
            <li>
              <Link
                href="/themes"
                className="flex h-full min-h-[172px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--hairline-strong)] text-[13.5px] text-[var(--ink-soft)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                看每套主题的完整样张
                <ArrowRight size={15} />
              </Link>
            </li>
          </ul>
        </section>

        {/* ———— Mac 客户端 ———— */}
        <section className="border-y border-[var(--hairline)] bg-[var(--sidebar)]/40 py-20">
          <div className={`${SHELL} grid items-center gap-12 lg:grid-cols-2 lg:gap-20`}>
            <div>
              <SectionHead
                id="desktop"
                eyebrow="桌面端"
                title="Mac 客户端，写作独占一扇窗"
                note="和网页版同一个账号、同一份数据，但有属于桌面应用的顺手：登录一次就一直在，原生菜单与快捷键，断网也能继续写。"
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
            <div className="overflow-hidden rounded-xl border border-[var(--hairline-strong)] bg-[var(--panel)] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)]">
              <div className="flex h-9 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--sidebar)] px-4">
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fc625d]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fdbc40]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#35cd4b]" />
                </span>
                <LogoMark className="h-6 w-auto text-[var(--ink)]" />
              </div>
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
        <section className={`${SHELL} py-20`}>
          <SectionHead
            id="faq"
            eyebrow="常见问题"
            title="关于 xEdit，你可能想先问清楚"
            note="还有别的问题，可以到 GitHub 仓库提 issue。"
          />
          <Faq />
        </section>

        {/* ———— 收束 ———— */}
        <section className="border-t border-[var(--hairline)] py-20 text-center">
          <div className={SHELL}>
            <h2 className="text-[clamp(24px,4vw,36px)] font-semibold tracking-tight">
              你的下一篇推文，从这里开始
            </h2>
            <p className="mt-4 text-[14.5px] text-[var(--ink-soft)]">
              不用注册，打开就能写；写顺手了再登录，文章自动上云。
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <StartWritingButton />
              <LoginButton />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--hairline)] bg-[var(--sidebar)]/40">
        <div
          className={`${SHELL} flex flex-wrap items-center justify-between gap-x-10 gap-y-6 py-10`}
        >
          <div className="flex items-center gap-3">
            <LogoMark className="h-10 w-auto shrink-0 text-[var(--ink)]" />
            <div>
              <p className="text-[13.5px] font-semibold">
                {SITE_TAGLINE}
              </p>
              <p className="mt-1 text-[11.5px] text-[var(--ink-faint)]">
                本地优先 · 登录后云端同步 · 排版样式不丢
              </p>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[var(--ink-soft)]">
            <Link href="/themes" className="transition-colors hover:text-[var(--ink)]">
              排版主题
            </Link>
            <Link href="/#features" className="transition-colors hover:text-[var(--ink)]">
              功能
            </Link>
            <Link href="/#desktop" className="transition-colors hover:text-[var(--ink)]">
              Mac 客户端
            </Link>
            <Link href="/#faq" className="transition-colors hover:text-[var(--ink)]">
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
            <StartWritingLink />
          </nav>
        </div>
      </footer>
    </div>
  );
}
