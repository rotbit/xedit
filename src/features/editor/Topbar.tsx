"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Palette, History, LogIn, ChevronDown, ShieldCheck } from "lucide-react";
import { useStore } from "@/store/useStore";
import { getTheme } from "@/lib/themes";
import { Dropdown } from "@/components/Dropdown";
import { toast } from "@/components/Toast";
import { openAuth } from "@/components/AuthDialog";
import { DarkToggle } from "@/components/DarkToggle";
import { ThemePickerPanel } from "@/components/ThemePicker";
import { AiSettingsDialog } from "@/components/AiDialogs";
import { McpDialog } from "@/components/McpDialog";
import { ReviewDialog } from "@/components/ReviewDialog";
import { AccountMenu } from "./components/AccountMenu";
import { CategoryBreadcrumb } from "./components/CategoryBreadcrumb";
import { CopyMenu } from "./components/CopyMenu";
import { DocSwitcher } from "./components/DocSwitcher";
import { ExportMenu } from "./components/ExportMenu";
import { SettingsMenu } from "./components/SettingsMenu";
import { useBackToReader } from "./hooks/useBackToReader";
import { useDocOptions } from "./hooks/useDocOptions";
import { ghostBtn } from "./lib/styles";

/** 编辑器顶栏：面包屑 + 主题 / 设置 / 审查 / 版本 / 导出 / 复制 / 账户 */
export function Topbar({ onOpenVersions }: { onOpenVersions: () => void }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const docId = useStore((s) => s.docId);
  const category = useStore((s) => s.category);
  const setCategory = useStore((s) => s.setCategory);
  const themeId = useStore((s) => s.themeId);

  const { catList, docList, setCatList } = useDocOptions(status, docId);
  const backHref = useBackToReader(status, docId);

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  /** 内容审查依赖文本平台密钥，未配置时直接引导到 AI 设置 */
  const startReview = () => {
    if (!useStore.getState().content.trim()) {
      toast("文章还是空的", "error");
      return;
    }
    if (!useStore.getState().aiChatReady) {
      toast("请先在「AI 设置」中填写文本平台密钥", "error");
      setAiSettingsOpen(true);
      return;
    }
    setReviewOpen(true);
  };

  const inCloudDoc = Boolean(docId) && status === "authenticated";

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--hairline-soft)] bg-[var(--panel)] px-3">
        <button
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
          onClick={() => router.push(backHref)}
          title={docId ? "返回文章阅读（⌘E）" : "返回文章列表（⌘E）"}
        >
          <ArrowLeft size={16} />
        </button>

        {/* 面包屑：分类 / 标题 */}
        {inCloudDoc ? (
          <>
            <CategoryBreadcrumb
              category={category}
              catList={catList}
              onSelect={setCategory}
              onCreated={(name) =>
                setCatList((prev) => (prev.includes(name) ? prev : [...prev, name]))
              }
            />
            <span className="select-none text-[12px] text-[var(--ink-faint)]">/</span>
          </>
        ) : null}

        <input
          className="h-8 w-24 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-[13px] font-medium text-[var(--ink)] outline-none transition-colors hover:border-[var(--hairline)] focus:border-[var(--hairline-strong)] focus:bg-[var(--panel)] sm:w-52"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="文章标题"
        />

        {docId && inCloudDoc && docList.length > 1 ? (
          <DocSwitcher docId={docId} docList={docList} />
        ) : null}

        <div className="flex-1" />

        {/* 排版主题 */}
        <Dropdown
          width={430}
          trigger={
            <button className={ghostBtn}>
              <Palette size={15} />
              <span className="hidden sm:inline">{getTheme(themeId).name}</span>
              <ChevronDown size={13} className="text-[var(--ink-faint)]" />
            </button>
          }
        >
          <ThemePickerPanel />
        </Dropdown>

        <SettingsMenu
          onOpenAiSettings={() => setAiSettingsOpen(true)}
          onOpenMcp={() => setMcpOpen(true)}
        />

        <button className={ghostBtn} onClick={startReview} title="公众号内容审查">
          <ShieldCheck size={15} />
        </button>

        {/* 版本历史（窄屏隐藏，保证顶栏不溢出） */}
        <button
          className={`${ghostBtn} hidden shrink-0 md:flex`}
          onClick={onOpenVersions}
          title="版本历史"
        >
          <History size={15} />
        </button>

        <ExportMenu />

        {/* 夜间模式（窄屏隐藏，腾出顶栏空间） */}
        <div className="hidden shrink-0 sm:block">
          <DarkToggle />
        </div>

        <div className="mx-1 hidden h-5 w-px bg-[var(--hairline)] sm:block" />

        <CopyMenu />

        <div className="mx-1 hidden h-5 w-px bg-[var(--hairline)] sm:block" />

        {status === "authenticated" && session?.user ? (
          <AccountMenu user={session.user} onOpenSettings={() => setAiSettingsOpen(true)} />
        ) : (
          <button
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--hairline-strong)] px-3 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]"
            onClick={() => openAuth("login")}
            disabled={status === "loading"}
          >
            <LogIn size={14} />
            登录
          </button>
        )}
      </header>
      {aiSettingsOpen ? <AiSettingsDialog onClose={() => setAiSettingsOpen(false)} /> : null}
      {mcpOpen ? <McpDialog onClose={() => setMcpOpen(false)} /> : null}
      {reviewOpen ? <ReviewDialog onClose={() => setReviewOpen(false)} /> : null}
    </>
  );
}
