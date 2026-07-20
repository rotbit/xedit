"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ClipboardCopy,
  History,
  ImageUp,
  Palette,
  PenLine,
  Sigma,
  Sparkles,
} from "lucide-react";
import { THEME_PRESETS, BASE_CSS, type ThemePreset } from "@/lib/themes";
import { GithubMark } from "./GithubMark";
import { DarkToggle } from "./DarkToggle";

interface LandingProps {
  onLogin: () => void;
  onStart: () => void;
  hasLocalDraft: boolean;
}

const FEATURES = [
  {
    icon: ClipboardCopy,
    title: "一键复制",
    desc: "样式全部内联，公众号、知乎直接粘贴，代码、公式、表格都不走样",
  },
  {
    icon: Palette,
    title: "十三套主题",
    desc: "缩略图即见即所得，标注适用内容类型，支持自定义 CSS 叠加",
  },
  {
    icon: Sparkles,
    title: "AI 助手",
    desc: "翻译、润色、起标题、生成配图；自带 Key 即用，Key 只存浏览器本地",
  },
  {
    icon: Sigma,
    title: "数学公式",
    desc: "行内与块级公式由 MathJax 渲染为 SVG，粘贴到公众号不变形",
  },
  {
    icon: ImageUp,
    title: "图床上传",
    desc: "编辑器内粘贴、拖拽图片自动上传图床，链接就地插入正文",
  },
  {
    icon: History,
    title: "版本历史",
    desc: "自动快照与手动存档并存，随时一键回滚，回滚前自动备份当前内容",
  },
];

const STEPS = [
  { num: "一", title: "写 Markdown", desc: "左手源码，右手实时预览，专注内容本身" },
  { num: "二", title: "挑一套主题", desc: "十三套主题即点即换，技术、职场、生活各有其面" },
  { num: "三", title: "一键复制", desc: "样式全部内联，粘贴进公众号后台就是成稿" },
];

/** 样机轮播的主题：以朱砂中国红开场，与整站印章基调一致 */
const HERO_THEME_IDS = ["chinese-red", "ink", "wechat-green", "magazine"];

/** 主视觉：左 Markdown 源码、右真实主题渲染的双栏编辑器样机；自动轮换，点主题名接管 */
function HeroMock() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % HERO_THEME_IDS.length), 3600);
    return () => clearInterval(t);
  }, [paused]);
  const theme =
    THEME_PRESETS.find((t) => t.id === HERO_THEME_IDS[idx]) ?? THEME_PRESETS[0];
  const css = useMemo(
    () => (BASE_CSS + theme.css).replaceAll("#nice", ".hero-demo"),
    [theme]
  );

  return (
    <div
      className="light-lock rise mx-auto mt-14 max-w-[860px] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-white shadow-[0_30px_80px_-24px_rgba(70,45,20,0.28)]"
      style={{ animationDelay: "0.2s" }}
    >
      <div className="flex h-9 items-center border-b border-[var(--hairline)] bg-[var(--paper)] px-4">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#fc625d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#fdbc40]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#35cd4b]" />
        </span>
        <span className="mx-auto -translate-x-4 text-[11px] tracking-wider text-[var(--ink-faint)]">
          xEdit — 我的第一篇推文 · {theme.name}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {/* 夜间模式下 light-lock 只重定义变量，继承色不变，需显式落墨色 */}
        <div
          className="hidden border-r border-[var(--hairline)] p-6 text-left text-[13px] leading-[2.1] text-[var(--ink)] sm:block"
          style={{ fontFamily: "var(--mono)" }}
        >
          <p>
            <span style={{ color: "var(--seal)" }}>##</span> 它能做什么
          </p>
          <p>
            <span style={{ color: "var(--seal)" }}>**</span>一键复制
            <span style={{ color: "var(--seal)" }}>**</span>到公众号
          </p>
          <p>
            <span style={{ color: "var(--ink-faint)" }}>-</span> 十三套排版主题
          </p>
          <p>
            <span style={{ color: "var(--ink-faint)" }}>-</span> AI 翻译、润色与配图
          </p>
          <p>
            <span style={{ color: "var(--seal)" }}>&gt;</span>{" "}
            <span style={{ color: "var(--ink-soft)" }}>云端同步，版本可回滚</span>
          </p>
        </div>
        <div className="p-3 text-left">
          <style>{css}</style>
          <div key={theme.id} className="hero-demo rise" style={{ padding: "10px 20px 18px" }}>
            <h2 style={{ marginTop: 8, marginBottom: 14 }}>
              <span className="prefix" />
              <span className="content">它能做什么</span>
              <span className="suffix" />
            </h2>
            <p style={{ margin: "10px 0" }}>
              <strong>一键复制</strong>到公众号
            </p>
            <ul style={{ margin: "10px 0" }}>
              <li>十三套排版主题</li>
              <li>AI 翻译、润色与配图</li>
            </ul>
            <blockquote style={{ margin: "12px 0" }}>
              <p style={{ margin: "6px 0" }}>云端同步，版本可回滚</p>
            </blockquote>
          </div>
        </div>
      </div>
      {/* 主题切换条：点名字即换，接管后停止自动轮播 */}
      <div className="flex items-center gap-1 overflow-x-auto border-t border-[var(--hairline)] bg-[var(--paper)] px-3 py-2">
        <span className="mr-1 shrink-0 text-[10px] tracking-widest text-[var(--ink-faint)]">
          主题
        </span>
        {HERO_THEME_IDS.map((id, i) => {
          const t = THEME_PRESETS.find((p) => p.id === id);
          if (!t) return null;
          return (
            <button
              key={id}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                i === idx
                  ? "bg-[var(--panel)] font-medium text-[var(--ink)] shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-[var(--hairline)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
              onClick={() => {
                setIdx(i);
                setPaused(true);
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
              {t.name}
            </button>
          );
        })}
        <span className="flex-1" />
        <span className="hidden shrink-0 text-[10px] text-[var(--ink-faint)] sm:block">
          即点即换 · 所见即所得
        </span>
      </div>
    </div>
  );
}

/** 刊物式栏目头：粗墨线 + 宋体标题 + 侧注 */
function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t-2 border-[var(--ink)] pt-6">
      <h2 className="landing-display text-[21px] font-semibold tracking-wide">{title}</h2>
      {note ? (
        <span className="text-[12.5px] text-[var(--ink-faint)]">{note}</span>
      ) : null}
    </div>
  );
}

/** 功能卡片：朱砂洗底图标 + 宋体小标题 + 一句说明 */
function FeatureCard({
  icon: Icon,
  title,
  desc,
  index,
}: {
  icon: typeof ClipboardCopy;
  title: string;
  desc: string;
  index: number;
}) {
  return (
    <div
      className="rise rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
      style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--seal-wash)] text-[var(--seal)]">
        <Icon size={17} />
      </span>
      <p className="landing-display mt-3.5 text-[15.5px] font-semibold tracking-wide">
        {title}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-[1.7] text-[var(--ink-soft)]">{desc}</p>
    </div>
  );
}

/**
 * 主题墙卡片：与 ThemePicker 同一思路，用主题真实 CSS 渲染迷你样张
 * （#nice 换成本卡片独立 class 隔离，整体缩放），下附主题名与适用内容。
 */
function ThemeWallCard({ theme, index }: { theme: ThemePreset; index: number }) {
  const cls = `tw-${theme.id}`;
  const css = useMemo(
    () => (BASE_CSS + theme.css).replaceAll("#nice", `.${cls}`),
    [theme, cls]
  );

  return (
    <div
      className="rise w-[calc(50%-7px)] overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:w-[calc(33.333%-10px)] xl:w-[calc(25%-11px)]"
      style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}
    >
      <div className="light-lock pointer-events-none h-[92px] overflow-hidden border-b border-[var(--hairline)] bg-white">
        <style>{css}</style>
        <div
          className={cls}
          style={{
            transform: "scale(0.5)",
            transformOrigin: "top left",
            width: "200%",
            padding: "14px 18px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>
            <span className="prefix" />
            <span className="content">标题样式</span>
            <span className="suffix" />
          </h2>
          <p style={{ margin: "8px 0" }}>
            正文文字，<strong>重点强调</strong>的样子。
          </p>
          <blockquote style={{ margin: "10px 0" }}>
            <p style={{ margin: "6px 0" }}>引用内容的样式</p>
          </blockquote>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: theme.color }}
        />
        <span className="landing-display shrink-0 text-[13px] font-semibold">
          {theme.name}
        </span>
        <span className="ml-auto truncate text-[10.5px] text-[var(--ink-faint)]">
          {theme.tag}
        </span>
      </div>
    </div>
  );
}

export function Landing({ onLogin, onStart, hasLocalDraft }: LandingProps) {
  return (
    <div className="desk relative h-full overflow-y-auto overflow-x-hidden">
      {/* 顶部朱砂晕染 */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(192,57,43,0.07),transparent)]" />

      {/* 顶栏 */}
      <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--paper)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1080px] items-center gap-2.5 px-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--seal)] text-[14px] font-bold text-white shadow-[0_2px_6px_rgba(192,57,43,0.4)] [font-family:var(--serif)]">
            稿
          </span>
          <span className="landing-display text-[17px] font-semibold tracking-wide">xEdit</span>
          <span className="mt-0.5 hidden text-[12px] text-[var(--ink-faint)] sm:inline">
            Markdown 公众号排版
          </span>
          <span className="flex-1" />
          <DarkToggle />
          <button
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[12.5px] text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
            onClick={onLogin}
          >
            <GithubMark size={13} />
            登录
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1080px] px-6">
        {/* ———— 主视觉 ———— */}
        <section className="relative pt-20 text-center">
          {/* 两侧竖排落款（大屏装饰） */}
          <span className="landing-vertical absolute left-0 top-24 hidden select-none items-center gap-3 text-[12px] tracking-[0.5em] text-[var(--ink-faint)] xl:flex">
            <span className="h-1.5 w-1.5 shrink-0 bg-[var(--seal)]" />
            写好内容
          </span>
          <span className="landing-vertical absolute right-0 top-24 hidden select-none items-center gap-3 text-[12px] tracking-[0.5em] text-[var(--ink-faint)] xl:flex">
            <span className="h-1.5 w-1.5 shrink-0 bg-[var(--seal)]" />
            排好版面
          </span>

          <p className="rise flex items-center justify-center gap-3 text-[11px] tracking-[0.4em] text-[var(--ink-faint)]">
            <span className="h-px w-8 bg-[var(--hairline-strong)]" />
            XEDIT · 微信公众号排版工具
            <span className="h-px w-8 bg-[var(--hairline-strong)]" />
          </p>
          <h1
            className="landing-display rise mt-6 text-[clamp(34px,6vw,54px)] font-bold leading-tight tracking-wide"
            style={{ animationDelay: "0.06s" }}
          >
            Markdown 写作
            <span className="text-[var(--seal)]">，</span>
            公众号排版
            <span className="stamp-in ml-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--seal)] align-[6px] text-[22px] text-white shadow-[0_4px_12px_rgba(192,57,43,0.4)]">
              稿
            </span>
          </h1>
          <p
            className="rise mx-auto mt-5 max-w-xl text-[15px] leading-7 text-[var(--ink-soft)]"
            style={{ animationDelay: "0.12s" }}
          >
            左侧写 Markdown，右侧实时预览，一键复制到微信公众号或知乎，样式不丢。
            主题、公式、AI 助手与云端同步，一站配齐。
          </p>
          <div
            className="rise mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "0.16s" }}
          >
            <button
              className="flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-[var(--seal)] px-6 text-[15px] font-medium text-white shadow-[0_4px_14px_rgba(192,57,43,0.35)] transition-transform hover:-translate-y-0.5 hover:bg-[var(--seal-deep)]"
              onClick={onStart}
            >
              <PenLine size={16} />
              {hasLocalDraft ? "继续编辑本地文稿" : "开始写作"}
            </button>
            <button
              className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-6 text-[15px] transition-transform hover:-translate-y-0.5 hover:bg-[var(--paper)]"
              onClick={onLogin}
            >
              <GithubMark size={15} />
              GitHub 登录
            </button>
          </div>
          <p
            className="rise mt-3.5 text-[12px] text-[var(--ink-faint)]"
            style={{ animationDelay: "0.2s" }}
          >
            无需登录即可使用全部排版功能；文章保存在本设备，登录后自动同步云端
          </p>

          <HeroMock />
        </section>

        {/* ———— 三步发文 ———— */}
        <section
          className="rise mt-16 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3"
          style={{ animationDelay: "0.3s" }}
        >
          {STEPS.map((s) => (
            <div key={s.num} className="flex gap-4">
              <span className="landing-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--hairline-strong)] bg-[var(--panel)] text-[15px] font-semibold text-[var(--seal)]">
                {s.num}
              </span>
              <div className="text-left">
                <p className="landing-display text-[15px] font-semibold">{s.title}</p>
                <p className="mt-1 text-[12.5px] leading-5 text-[var(--ink-soft)]">{s.desc}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ———— 它能做什么 ———— */}
        <section className="mt-20">
          <SectionHead title="它能做什么" note="从写作到发布，一站配齐" />
          <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} index={i} />
            ))}
          </div>
        </section>

        {/* ———— 十三套排版主题 ———— */}
        <section className="mt-20">
          <SectionHead title="十三套排版主题" note="一套内容，十三种面貌，即点即换" />
          <div className="mt-9 flex flex-wrap justify-center gap-3.5">
            {THEME_PRESETS.map((t, i) => (
              <ThemeWallCard key={t.id} theme={t} index={i} />
            ))}
          </div>
          <p className="mt-6 text-center text-[12px] text-[var(--ink-faint)]">
            主题之外还可叠加自定义 CSS，复制时一并内联
          </p>
        </section>

        {/* ———— 收束 ———— */}
        <section className="py-28 text-center">
          <p className="landing-display text-[clamp(26px,4vw,38px)] font-bold tracking-wide">
            写好内容，排好版面
            <span className="text-[var(--seal)]">。</span>
          </p>
          <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
            打开即写，无需注册；你的下一篇推文，从这里开始
          </p>
          <div className="mt-8 flex items-center justify-center">
            <button
              className="flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-[var(--seal)] px-7 text-[15px] font-medium text-white shadow-[0_4px_14px_rgba(192,57,43,0.35)] transition-transform hover:-translate-y-0.5 hover:bg-[var(--seal-deep)]"
              onClick={onStart}
            >
              <PenLine size={16} />
              {hasLocalDraft ? "继续编辑本地文稿" : "开始写作"}
            </button>
          </div>
        </section>
      </main>

      {/* 页脚 */}
      <footer className="border-t border-[var(--hairline)]">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-x-8 gap-y-4 px-6 py-8">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 rotate-[-4deg] items-center justify-center rounded-md bg-[var(--seal)] text-[14px] font-bold text-white shadow-[0_2px_6px_rgba(192,57,43,0.35)] [font-family:var(--serif)]">
              稿
            </span>
            <div>
              <p className="landing-display text-[13.5px] font-semibold tracking-wide">
                xEdit · Markdown 公众号排版
              </p>
              <p className="mt-0.5 text-[11.5px] text-[var(--ink-faint)]">
                本地优先 · 登录后云端同步 · 排版样式不丢
              </p>
            </div>
          </div>
          <button
            className="group flex cursor-pointer items-center gap-1.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:text-[var(--seal)]"
            onClick={onStart}
          >
            {hasLocalDraft ? "继续编辑本地文稿" : "开始写作"}
            <ArrowRight
              size={14}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </div>
      </footer>
    </div>
  );
}
