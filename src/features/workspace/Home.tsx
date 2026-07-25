"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useStore, DEFAULT_MARKDOWN } from "@/store/useStore";
import { createLocalDoc, listLocalDocs } from "@/lib/localDocs";
import { Toaster } from "@/components/Toast";
import { openAuth } from "@/components/AuthDialog";
import { CategoryContextMenu } from "./components/CategoryContextMenu";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceContent } from "./components/WorkspaceContent";
import { useWorkspace } from "./hooks/useWorkspace";

const AiSettingsDialog = dynamic(
  () => import("@/components/AiDialogs").then((m) => m.AiSettingsDialog),
  { ssr: false }
);
/* 落地页连带 13 套主题 CSS，只有首访未登录才需要，不进工作台首屏包 */
const Landing = dynamic(() => import("@/components/Landing").then((m) => m.Landing), {
  ssr: false,
  loading: () => <div className="h-full bg-[var(--paper)]" />,
});

/**
 * 应用首页：已有内容时是 Notion 式工作台（全高侧栏 + 面包屑顶栏 + 独立滚动内容区），
 * 未登录且无本地文章时是产品落地页。
 */
export function Home() {
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

  // 会话状态确认前（及本地文章列表读取前）不渲染，避免闪现登录页
  if (auth.status === "loading" || (auth.localMode && library.docs === null)) {
    return <div className="h-full bg-[var(--paper)]" />;
  }

  const hasWorkspace =
    auth.loggedIn || auth.offlineAuthed || (auth.localMode && (library.docs?.length ?? 0) > 0);

  if (!hasWorkspace) {
    return (
      <>
        <Landing
          onLogin={() => openAuth("login")}
          onStart={startLocalWriting}
          hasLocalDraft={hasLocalDraft}
        />
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
