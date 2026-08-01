import Image from "next/image";
import Link from "next/link";
import { Apple, ArrowRight, Check, Download } from "lucide-react";
import { GithubMark } from "@/components/GithubMark";
import { LogoMark } from "@/components/LogoMark";
import {
  GITHUB_URL,
  MAC_CTA,
  MAC_DOWNLOAD_URL,
  MAC_REQUIREMENT,
  SITE_NAME,
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
        className="flex items-center gap-2 text-[11.5px] font-medium tracking-[0.18em] text-[var(--seal)]"
      >
        <span className="h-1 w-1 rounded-full bg-[var(--seal)]" />
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
        {/* ———— 主视觉 ———— */}
        <section className="landing-hero relative overflow-hidden">
          <div
            className="pointer-events-none absolute -left-32 top-0 h-[560px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(192,57,43,0.1),transparent)]"
            aria-hidden="true"
          />
          <div className={`${SHELL} relative pb-16 pt-12 sm:pt-16 lg:pt-20`}>
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-16">
              <div className="max-w-[560px]">
                <p className="rise flex items-center gap-3 text-[12px] font-medium tracking-[0.14em] text-[var(--seal)]">
                  <span className="h-px w-8 bg-[var(--seal)]" />
                  为中文写作者做的排版工具
                </p>
                <h1
                  className="rise mt-6 text-[clamp(40px,5.4vw,62px)] font-semibold leading-[1.08] tracking-[-0.045em]"
                  style={{ animationDelay: "0.05s" }}
                >
                  <span className="font-[family-name:var(--serif)]">写 Markdown，</span>
                  <br />
                  一键排好公众号
                </h1>
                <p
                  className="rise mt-6 max-w-[520px] text-[15.5px] leading-[1.9] text-[var(--ink-soft)]"
                  style={{ animationDelay: "0.1s" }}
                >
                  左边写 Markdown，右边就是公众号里的成稿。选主题、点复制，粘进后台，
                  标题、引用、公式和代码样式一个不丢。
                </p>
                <div
                  className="rise mt-8 flex flex-wrap items-center gap-3"
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

                <dl
                  className="rise mt-9 grid max-w-[460px] grid-cols-3 border-y border-[var(--hairline)] py-4"
                  style={{ animationDelay: "0.22s" }}
                >
                  {[
                    ["13", "套排版主题"],
                    ["5", "种导出格式"],
                    ["0 元", "核心排版免费"],
                  ].map(([value, label], index) => (
                    <div
                      key={label}
                      className={index ? "border-l border-[var(--hairline)] px-4" : "pr-4"}
                    >
                      <dt className="font-[family-name:var(--serif)] text-[20px] font-semibold text-[var(--ink)]">
                        {value}
                      </dt>
                      <dd className="mt-1 text-[11.5px] text-[var(--ink-faint)]">{label}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <figure
                className="rise relative mx-auto w-full max-w-[630px]"
                style={{ animationDelay: "0.1s" }}
              >
                <div
                  className="pointer-events-none absolute -inset-3 rotate-[1.5deg] border border-[var(--hairline-strong)]"
                  aria-hidden="true"
                />
                <div className="light-lock paper-drift relative aspect-[3/2] overflow-hidden bg-[#f7f3ec] shadow-[0_30px_80px_-38px_rgba(52,38,24,0.55)]">
                  <Image
                    src="/landing/editorial-paper-hero.webp"
                    alt=""
                    fill
                    priority
                    sizes="(max-width: 1023px) 100vw, 630px"
                    className="object-cover"
                  />
                  <div
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(250,247,241,0.94)_0%,rgba(250,247,241,0.54)_30%,transparent_57%)]"
                    aria-hidden="true"
                  />
                  <figcaption className="absolute left-6 top-7 max-w-[160px] sm:left-8 sm:top-9">
                    <p className="font-mono text-[10px] tracking-[0.22em] text-[#a53125]">
                      WRITE · STYLE · PUBLISH
                    </p>
                    <p className="mt-3 font-[family-name:var(--serif)] text-[clamp(22px,3vw,34px)] font-semibold leading-[1.25] text-[#222]">
                      从符号
                      <br />
                      到成稿
                    </p>
                    <span className="mt-4 block h-px w-12 bg-[#c0392b]" />
                  </figcaption>
                  <div className="absolute bottom-5 left-6 flex items-center gap-2 text-[9.5px] tracking-[0.14em] text-[#777] sm:bottom-7 sm:left-8">
                    <span>01 写作</span>
                    <span className="h-px w-5 bg-[#aaa]" />
                    <span>02 排版</span>
                    <span className="h-px w-5 bg-[#aaa]" />
                    <span>03 发布</span>
                  </div>
                </div>
              </figure>
            </div>

            <div className="rise mt-16 sm:mt-20" style={{ animationDelay: "0.26s" }}>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10.5px] font-medium tracking-[0.2em] text-[var(--seal)]">
                    LIVE DEMO
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--serif)] text-[clamp(20px,2.5vw,27px)] font-semibold tracking-tight">
                    不是效果图，现在就能换主题、复制成稿
                  </h2>
                </div>
                <p className="max-w-[340px] text-[12px] leading-5 text-[var(--ink-faint)] sm:text-right">
                  样机和正式编辑器使用同一套渲染与复制逻辑
                </p>
              </div>
              <HeroDemo themes={THEME_METAS}>
                <HeroArticle />
              </HeroDemo>
              <p className="mt-3.5 text-center text-[12px] text-[var(--ink-faint)]">
                上面这个样机是真的：换主题即时生效，点「复制到公众号」会真的写进你的剪贴板
              </p>
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
              note="不是「一个 Markdown 预览器」——排版、素材、版本、同步、审查、AI 接口，写公众号真正会用到的环节都做完了。"
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
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--seal-wash)] text-[var(--seal)]">
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
          </ul>
          <Link
            href="/themes"
            className="group mt-8 inline-flex items-center gap-1.5 text-[13.5px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
          >
            看每套主题的完整样张
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
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
                    <Check size={15} className="mt-0.5 shrink-0 text-[var(--seal)]" />
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
                <span className="text-[11.5px] text-[var(--ink-faint)]">xEdit</span>
              </div>
              <div className="grid grid-cols-[104px_1fr]">
                <div className="space-y-1.5 border-r border-[var(--hairline)] bg-[var(--sidebar)] p-3">
                  {["全部文章", "技术", "职场", "随笔", "图片素材", "写作足迹"].map((c, i) => (
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
            <LogoMark className="h-8 w-8 shrink-0 text-[var(--seal)]" />
            <div>
              <p className="text-[13.5px] font-semibold">
                {SITE_NAME} · {SITE_TAGLINE}
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
