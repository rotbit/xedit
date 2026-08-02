"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { useStore, DEFAULT_MARKDOWN } from "@/store/useStore";
import { ackSyncError, useFeishuSync } from "@/hooks/useFeishuSync";
import { createLocalDoc, listLocalDocs } from "@/lib/localDocs";
import { Toaster, toast } from "@/components/Toast";
import { openAuth } from "@/components/AuthDialog";
import { LogoMark } from "@/components/LogoMark";
import { LandingActionsProvider } from "@/features/landing/LandingActions";
import { CategoryContextMenu } from "./components/CategoryContextMenu";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceContent } from "./components/WorkspaceContent";
import { useWorkspace } from "./hooks/useWorkspace";
import { useHydrated } from "@/hooks/useHydrated";

const AiSettingsDialog = dynamic(
  () => import("@/components/AiDialogs").then((m) => m.AiSettingsDialog),
  { ssr: false }
);

const FeishuDialog = dynamic(
  () => import("@/components/FeishuDialog").then((m) => m.FeishuDialog),
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
  const ws = useWorkspace();
  const { auth, prefs, library, nav } = ws;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feishuOpen, setFeishuOpen] = useState(false);
  const feishuSync = useFeishuSync();
  const hydrated = useHydrated();

  // 旧 /edit 链接与桌面端「新建文章 Cmd+N」带 ?new=1 进来：会话就绪后直接建一篇新稿
  const searchParams = useSearchParams();
  const newConsumed = useRef(false);
  useEffect(() => {
    if (newConsumed.current || searchParams.get("new") !== "1") return;
    if (auth.status === "loading") return;
    newConsumed.current = true;
    window.history.replaceState(null, "", "/");
    // 挪到宏任务里执行，创建动作内部的同步 setState 不属于本 effect
    setTimeout(() => void ws.docActions.createDoc(), 0);
  }, [searchParams, auth.status, ws]);

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
      // 本地文档库全靠 localStorage，不可用就只能明说（旧的单稿编辑页已下线）
      toast("浏览器本地存储不可用，无法离线写作，请登录后使用", "error");
    }
  };

  const actions = {
    onStart: startLocalWriting,
    onLogin: () => openAuth("login"),
    startLabel: hasLocalDraft ? "继续编辑本地文稿" : "开始写作",
  };

  // 会话已随 HTML 注入，但工作台内容来自 localStorage（镜像/本地文库），服务端读不到——
  // hydration 完成前必须两端渲染一致，所以这一帧只出落地页或空壳，翻真后立即重渲染。
  // 服务端已判定未登录时，这一帧就把落地页铺出来——它必须是真实 DOM，爬虫才读得到；
  // 老用户由 theme-init 内联脚本在首次绘制前打上 data-ws，用 CSS 盖住这帧，不会看见落地页。
  if (!hydrated || auth.status === "loading" || (auth.localMode && library.docs === null)) {
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
      <Sidebar
        ws={ws}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFeishu={() => setFeishuOpen(true)}
      />
      <WorkspaceContent ws={ws} />
      {/* 离线提示：登录态断网时改动全部落本地镜像，联网自动同步 */}
      {!auth.online && !auth.localMode ? (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-[var(--hairline)] bg-[var(--panel)] px-3.5 py-1.5 text-[12px] text-[var(--ink-soft)] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
          已离线 · 改动保存在本地，联网后自动同步
        </div>
      ) : null}
      {/* 飞书同步在后台跑着（或悄悄中断了）而对话框已关：右下角留个胶囊，点开回到详情 */}
      {!feishuOpen && (feishuSync.syncing || (feishuSync.error && !feishuSync.errorAcked)) ? (
        <button
          className="fixed bottom-4 right-4 z-40 flex cursor-pointer items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--panel)] px-3.5 py-1.5 text-[12px] text-[var(--ink-soft)] shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:text-[var(--ink)]"
          onClick={() => setFeishuOpen(true)}
        >
          {feishuSync.syncing ? (
            <>
              <Loader2 size={13} className="animate-spin text-[var(--accent)]" />
              飞书同步中
              {feishuSync.progress
                ? ` ${feishuSync.progress.total - feishuSync.progress.pending}/${feishuSync.progress.total}`
                : "…"}
            </>
          ) : (
            <>
              <AlertCircle size={13} className="text-red-500" />
              飞书同步已中断，点击查看
            </>
          )}
        </button>
      ) : null}
      <CategoryContextMenu ws={ws} />
      {settingsOpen ? <AiSettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
      {feishuOpen ? (
        <FeishuDialog
          onClose={() => {
            setFeishuOpen(false);
            // 打开过对话框就算看过中断提示，胶囊不再提醒（面板里的原因保留）
            ackSyncError();
          }}
          onSynced={() => void ws.docActions.refreshDocs()}
        />
      ) : null}
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
