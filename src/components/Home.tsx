"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { FilePlus2, FileText, Trash2, Loader2, PenLine, LogOut } from "lucide-react";
import { useStore, DEFAULT_MARKDOWN } from "@/store/useStore";
import { THEME_PRESETS, BASE_CSS } from "@/lib/themes";
import { toast, Toaster } from "./Toast";
import { GithubMark } from "./Topbar";

interface DocMeta {
  id: string;
  title: string;
  updatedAt: string;
  excerpt?: string;
  chars?: number;
}

interface AppConfig {
  github: boolean;
  oss: boolean;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

const FEATURES = [
  { title: "一键复制", desc: "样式全部内联，公众号 / 知乎直接粘贴，代码、公式、表格都不走样" },
  { title: "十三套主题", desc: "缩略图即见即所得，标注适用内容类型，支持自定义 CSS 叠加" },
  { title: "AI 助手", desc: "翻译、润色、AI 配图，发文前按公众号加热规则做内容审查" },
  { title: "云端同步", desc: "GitHub 登录后多篇管理、自动保存，每五分钟留存版本，可一键回滚" },
];

/** 主视觉：左 Markdown 源码、右真实主题渲染的双栏编辑器样机 */
function HeroMock() {
  const theme = THEME_PRESETS.find((t) => t.id === "wechat-green") ?? THEME_PRESETS[0];
  const css = useMemo(
    () => (BASE_CSS + theme.css).replaceAll("#nice", ".hero-demo"),
    [theme]
  );

  return (
    <div
      className="rise mx-auto mt-14 max-w-[840px] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-white shadow-[0_30px_80px_-24px_rgba(70,45,20,0.28)]"
      style={{ animationDelay: "0.2s" }}
    >
      {/* 窗口栏 */}
      <div className="flex h-9 items-center border-b border-[var(--hairline)] bg-[var(--paper)] px-4">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#fc625d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#fdbc40]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#35cd4b]" />
        </span>
        <span className="mx-auto -translate-x-4 text-[11px] tracking-wider text-[var(--ink-faint)]">
          xEdit — 我的第一篇推文
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {/* 左：Markdown 源码 */}
        <div
          className="hidden border-r border-[var(--hairline)] p-6 text-left text-[13px] leading-[2.1] sm:block"
          style={{ fontFamily: "var(--mono)" }}
        >
          <p>
            <span style={{ color: "var(--accent)" }}>##</span> 它能做什么
          </p>
          <p>
            <span style={{ color: "var(--accent)" }}>**</span>一键复制
            <span style={{ color: "var(--accent)" }}>**</span>到公众号
          </p>
          <p>
            <span style={{ color: "var(--ink-faint)" }}>-</span> 十三套排版主题
          </p>
          <p>
            <span style={{ color: "var(--ink-faint)" }}>-</span> AI 翻译、润色与配图
          </p>
          <p>
            <span style={{ color: "var(--accent)" }}>&gt;</span>{" "}
            <span style={{ color: "var(--ink-soft)" }}>云端同步，版本可回滚</span>
          </p>
        </div>
        {/* 右：真实主题渲染 */}
        <div className="p-3 text-left">
          <style>{css}</style>
          <div className="hero-demo" style={{ padding: "10px 20px 18px" }}>
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
    </div>
  );
}

export function Home() {
  const { data: session, status } = useSession();
  const loggedIn = status === "authenticated";
  const router = useRouter();

  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const migratedRef = useRef(false);

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  // 登录后拉取文章列表；云端为空时把本地文稿自动迁移上去
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    void (async () => {
      const load = async (): Promise<DocMeta[]> => {
        const res = await fetch("/api/documents");
        return res.ok ? res.json() : [];
      };
      let list = await load();
      if (cancelled) return;
      if (list.length === 0 && !migratedRef.current) {
        migratedRef.current = true;
        const s = useStore.getState();
        const hasLocalWork =
          s.docId === null && s.content.trim() && s.content !== DEFAULT_MARKDOWN;
        await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            hasLocalWork
              ? { title: s.title, content: s.content }
              : { title: "欢迎使用 xEdit", content: DEFAULT_MARKDOWN }
          ),
        });
        if (hasLocalWork) toast("本地文稿已同步到云端", "success");
        list = await load();
        if (cancelled) return;
      }
      setDocs(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  const createDoc = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "未命名文章", content: "" }),
      });
      if (!res.ok) throw new Error();
      const doc = await res.json();
      router.push(`/edit/${doc.id}`);
    } catch {
      toast("新建失败", "error");
      setCreating(false);
    }
  };

  const removeDoc = async (doc: DocMeta) => {
    if (!confirm(`确定删除「${doc.title}」？该操作不可恢复。`)) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      setDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      toast("已删除", "success");
    } else {
      toast("删除失败", "error");
    }
  };

  const handleLogin = () => {
    if (config && !config.github) {
      toast("尚未配置 GitHub OAuth，请在 .env 中填写 AUTH_GITHUB_ID/SECRET", "error");
      return;
    }
    void signIn("github");
  };

  const localDraft = useStore((s) => s.content);
  const hasLocalDraft = Boolean(localDraft.trim()) && localDraft !== DEFAULT_MARKDOWN;

  return (
    <div className="desk relative h-full overflow-y-auto">
      {/* 氛围光晕 */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(192,57,43,0.07),transparent)]" />

      {/* 顶栏 */}
      <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--panel)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-[14px] font-bold text-white shadow-[0_2px_6px_rgba(192,57,43,0.4)] [font-family:var(--serif)]">
            稿
          </span>
          <span className="text-[17px] font-semibold tracking-wide [font-family:var(--serif)]">
            xEdit
          </span>
          <span className="mt-0.5 hidden text-[12px] text-[var(--ink-faint)] sm:inline">
            Markdown 公众号排版
          </span>
          <span className="flex-1" />
          {loggedIn && session?.user ? (
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--ink-soft)]">
                {session.user.name ?? session.user.email}
              </span>
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt="avatar"
                  className="h-7 w-7 rounded-full ring-1 ring-[var(--hairline-strong)]"
                />
              ) : null}
              <button
                className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                onClick={() => void signOut()}
                title="退出登录"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--hairline-strong)] bg-white px-3 text-[13px] hover:bg-[var(--paper)]"
              onClick={handleLogin}
              disabled={status === "loading"}
            >
              <GithubMark size={14} />
              GitHub 登录
            </button>
          )}
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 pb-24">
        {loggedIn ? (
          /* ———— 已登录：文章工作台 ———— */
          <>
            <div className="rise flex items-end justify-between pb-6 pt-12">
              <div>
                <p className="text-[11px] tracking-[0.35em] text-[var(--ink-faint)]">
                  WORKSPACE
                </p>
                <h1 className="mt-2 text-[26px] font-semibold leading-none [font-family:var(--serif)]">
                  我的文章
                </h1>
                <p className="mt-2.5 text-[12.5px] text-[var(--ink-faint)]">
                  {docs === null
                    ? "加载中…"
                    : `共 ${docs.length} 篇 · 自动保存到云端，每 5 分钟留存版本`}
                </p>
              </div>
            </div>

            {docs === null ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[132px] animate-pulse rounded-xl border border-[var(--hairline)] bg-white/70"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* 新建卡片 */}
                <button
                  className="rise flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--hairline-strong)] text-[var(--ink-faint)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]/40 hover:text-[var(--accent)] disabled:opacity-60"
                  onClick={() => void createDoc()}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <FilePlus2 size={18} />
                  )}
                  <span className="text-[13px] font-medium">新建文章</span>
                </button>

                {docs.map((doc, i) => (
                  <div
                    key={doc.id}
                    className="rise group relative cursor-pointer overflow-hidden rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-[0_1px_3px_rgba(60,50,30,0.04)] transition-all hover:-translate-y-1 hover:shadow-[0_14px_36px_-12px_rgba(60,45,20,0.22)]"
                    style={{ animationDelay: `${Math.min(i * 45, 400)}ms` }}
                    onClick={() => router.push(`/edit/${doc.id}`)}
                  >
                    <span className="absolute bottom-5 left-0 top-5 w-[3px] rounded-r-full bg-transparent transition-colors group-hover:bg-[var(--accent)]" />
                    <p className="truncate pr-6 text-[15px] font-semibold leading-6 text-[var(--ink)] [font-family:var(--serif)]">
                      {doc.title || "未命名文章"}
                    </p>
                    <p className="mt-1.5 line-clamp-2 h-10 text-[12.5px] leading-5 text-[var(--ink-soft)]">
                      {doc.excerpt || "（暂无内容）"}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[11.5px] text-[var(--ink-faint)]">
                      <FileText size={12} />
                      <span>{formatTime(doc.updatedAt)}</span>
                      {typeof doc.chars === "number" ? (
                        <>
                          <span className="text-[var(--hairline-strong)]">·</span>
                          <span>{doc.chars} 字</span>
                        </>
                      ) : null}
                    </div>
                    <button
                      className="invisible absolute right-3 top-3 cursor-pointer rounded-md p-1.5 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600 group-hover:visible"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeDoc(doc);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* ———— 未登录：产品首页 ———— */
          <>
            <div className="pt-20 text-center">
              <p className="rise text-[11px] tracking-[0.4em] text-[var(--ink-faint)]">
                XEDIT · 微信公众号排版工具
              </p>
              <h1
                className="rise mt-5 text-[44px] font-bold leading-tight [font-family:var(--serif)]"
                style={{ animationDelay: "0.06s" }}
              >
                Markdown 写作
                <span className="text-[var(--accent)]">，</span>
                公众号排版
                <span className="ml-4 inline-flex h-11 w-11 rotate-6 items-center justify-center rounded-lg bg-[var(--accent)] align-[6px] text-[22px] text-white shadow-[0_4px_12px_rgba(192,57,43,0.4)]">
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
                className="rise mt-9 flex items-center justify-center gap-3"
                style={{ animationDelay: "0.16s" }}
              >
                <button
                  className="flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-[var(--accent)] px-6 text-[15px] font-medium text-white shadow-[0_4px_14px_rgba(192,57,43,0.35)] transition-transform hover:-translate-y-0.5 hover:bg-[var(--accent-deep)]"
                  onClick={() => router.push("/edit")}
                >
                  <PenLine size={16} />
                  {hasLocalDraft ? "继续编辑本地文稿" : "开始写作"}
                </button>
                <button
                  className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-white px-6 text-[15px] transition-transform hover:-translate-y-0.5 hover:bg-[var(--paper)]"
                  onClick={handleLogin}
                >
                  <GithubMark size={15} />
                  GitHub 登录
                </button>
              </div>
              <p
                className="rise mt-3.5 text-[12px] text-[var(--ink-faint)]"
                style={{ animationDelay: "0.2s" }}
              >
                无需登录即可使用全部排版功能；登录后解锁云端多篇管理与版本历史
              </p>
            </div>

            <HeroMock />

            {/* 期刊式功能条 */}
            <div
              className="rise mt-20 grid grid-cols-2 gap-x-0 gap-y-10 border-t-2 border-[var(--ink)] pt-9 lg:grid-cols-4"
              style={{ animationDelay: "0.3s" }}
            >
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className={`px-6 ${i % 2 === 0 ? "pl-0" : ""} lg:border-l lg:border-[var(--hairline)] lg:pl-6 lg:first:border-l-0 lg:first:pl-0`}
                >
                  <p className="text-[12px] font-medium tracking-widest text-[var(--accent)] [font-family:var(--mono)]">
                    0{i + 1}
                  </p>
                  <p className="mt-2.5 text-[16px] font-semibold [font-family:var(--serif)]">
                    {f.title}
                  </p>
                  <p className="mt-2 text-[12.5px] leading-[1.7] text-[var(--ink-soft)]">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-24 text-center text-[11px] tracking-[0.25em] text-[var(--ink-faint)]">
              XEDIT — 写好内容，排好版面
            </p>
          </>
        )}
      </main>
      <Toaster />
    </div>
  );
}
