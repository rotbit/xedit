"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useStore, DEFAULT_MARKDOWN } from "@/store/useStore";
import { createLocalDoc, listLocalDocs } from "@/lib/localDocs";
import { Toaster } from "@/components/Toast";
import { openAuth } from "@/components/AuthDialog";
import { LogoMark } from "@/components/LogoMark";
import { LandingActionsProvider } from "@/features/landing/LandingActions";
import { CategoryContextMenu } from "./components/CategoryContextMenu";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceContent } from "./components/WorkspaceContent";
import { useWorkspace } from "./hooks/useWorkspace";

const AiSettingsDialog = dynamic(
  () => import("@/components/AiDialogs").then((m) => m.AiSettingsDialog),
  { ssr: false }
);

interface HomeProps {
  /** 服务端渲染好的落地页；已登录时为 null（那条路径根本走不到落地页） */
  landing: React.ReactNode;
}

/**
 * 应用首页：已有内容时是 Notion 式工作台（全高侧栏 + 面包屑顶栏 + 独立滚动内容区），
 * 未登录且无本地文章时展示 page.tsx 传进来的落地页。
 */
export function Home({ landing }: HomeProps) {
  const router = useRouter();
  const ws = useWorkspace();
  const { auth, prefs, library, nav } = ws;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const localDraft = useStore((s) => s.content);
  const hasLocalDraft = Boolean(localDraft.trim()) && localDraft !== DEFAULT_MARKDOWN;

  /** 未登录直接写作：把旧版单篇草稿收编进本地文档库，否则新建一篇欢迎文档 */
  const startLocalWriting = () => {
    const s = useStore.getState();
    const hasDraft =
      s.docId === null && Boolean(s.content.trim()) && s.content !== DEFAULT_MARKDOWN;
    try {
      const doc = hasDraft
        ? createLocalDoc({ title: s.title, content: s.content })
        : createLocalDoc({ title: "欢迎使用 xEdit", content: DEFAULT_MARKDOWN });
      // 草稿已入库，清空旧缓冲，避免登录后被旧迁移逻辑重复上传
      if (hasDraft) s.setDoc({ id: null, title: "未命名文章", content: DEFAULT_MARKDOWN });
      library.setDocs(listLocalDocs());
      nav.openDoc(doc.id);
    } catch {
      // 本地存储不可用时退回旧的单稿模式
      router.push("/edit");
    }
  };

  const actions = {
    onStart: startLocalWriting,
    onLogin: () => openAuth("login"),
    startLabel: hasLocalDraft ? "继续编辑本地文稿" : "开始写作",
  };

  // 会话状态确认前（及本地文章列表读取前）还不知道该给谁看什么。
  // 服务端已判定未登录时，这一帧就把落地页铺出来——它必须是真实 DOM，爬虫才读得到；
  // 老用户由 theme-init.js 在首次绘制前打上 data-ws，用 CSS 盖住这帧，不会看见落地页。
  if (auth.status === "loading" || (auth.localMode && library.docs === null)) {
    if (!landing) return <div className="h-full bg-[var(--paper)]" />;
    return (
      <div className="landing-boot h-full">
        <LandingActionsProvider value={actions}>{landing}</LandingActionsProvider>
      </div>
    );
  }

  const hasWorkspace =
    auth.loggedIn || auth.offlineAuthed || (auth.localMode && (library.docs?.length ?? 0) > 0);

  if (!hasWorkspace) {
    return (
      <>
        <LandingActionsProvider value={actions}>
          {/* 服务端渲染时会话已判定为未登录，landing 必然存在；
              兜底分支只在会话中途失效（如另一个标签页登出）时短暂出现 */}
          {landing ?? <SignedOutFallback onStart={startLocalWriting} />}
        </LandingActionsProvider>
        <Toaster />
      </>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-[var(--paper)]">
      {/* 窄屏抽屉的背板：点击关闭 */}
      {prefs.sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => prefs.setSidebarOpen(false)}
        />
      ) : null}
      <Sidebar ws={ws} onOpenSettings={() => setSettingsOpen(true)} />
      <WorkspaceContent ws={ws} />
      {/* 离线提示：登录态断网时改动全部落本地镜像，联网自动同步 */}
      {!auth.online && !auth.localMode ? (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-[var(--hairline)] bg-[var(--panel)] px-3.5 py-1.5 text-[12px] text-[var(--ink-soft)] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
          已离线 · 改动保存在本地，联网后自动同步
        </div>
      ) : null}
      <CategoryContextMenu ws={ws} />
      {settingsOpen ? <AiSettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
      <Toaster />
    </div>
  );
}

/** 会话在客户端失效、手上又没有落地页 HTML 时的最小可用界面 */
function SignedOutFallback({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-[var(--paper)] px-6 text-center">
      <LogoMark className="h-10 w-10 text-[var(--seal)]" />
      <p className="text-[15px] text-[var(--ink-soft)]">登录状态已失效，重新开始吧</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          className="h-10 cursor-pointer rounded-lg bg-[var(--accent)] px-5 text-[14px] font-medium text-[var(--accent-fg)]"
          onClick={onStart}
        >
          开始写作
        </button>
        <button
          className="h-10 cursor-pointer rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-5 text-[14px]"
          onClick={() => openAuth("login")}
        >
          登录 / 注册
        </button>
      </div>
    </div>
  );
}
