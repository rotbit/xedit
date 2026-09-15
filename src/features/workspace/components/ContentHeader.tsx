"use client";

import {
  ChevronRight,
  FilePlus2,
  CalendarDays,
  List,
  Loader2,
  PanelLeftOpen,
  Trash2,
  X,
} from "lucide-react";
import { ALL, ASSETS } from "../constants";
import type { DocMeta } from "../types";
import type { DocView } from "../hooks/useSidebarPrefs";
import type { Workspace } from "../hooks/useWorkspace";

const crumbCls =
  "max-w-[220px] cursor-pointer truncate rounded-md px-1.5 py-0.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]";
const crumbNow = "truncate px-1.5 py-0.5 text-[13px] font-medium text-[var(--ink)]";
const sep = <ChevronRight size={12} className="shrink-0 text-[var(--ink-faint)]" />;

const VIEW_MODES: [DocView, typeof CalendarDays, string][] = [
  ["card", CalendarDays, "时间流"],
  ["list", List, "列表视图"],
];

/** 面包屑：阅读态显示「全部文章 / 分类 / 标题」，列表态显示当前分类路径 */
function Breadcrumbs({ ws, readingDoc }: { ws: Workspace; readingDoc: DocMeta | null }) {
  const { nav } = ws;
  const { activeCat, readingId, isTrash, openCategory, setReadingId } = nav;

  if (readingDoc) {
    return (
      <>
        <button className={crumbCls} onClick={() => openCategory(ALL)}>
          全部文章
        </button>
        {readingDoc.category ? (
          <>
            {sep}
            <button className={crumbCls} onClick={() => openCategory(readingDoc.category!)}>
              {readingDoc.category}
            </button>
          </>
        ) : null}
        {sep}
        <span className={crumbNow}>{readingDoc.title || "未命名文章"}</span>
        {/* 关闭文章：回到打开前所在的目录列表 */}
        <button
          className="ml-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
          title="关闭文章"
          onClick={() => setReadingId(null)}
        >
          <X size={14} />
        </button>
      </>
    );
  }
  if (activeCat === ASSETS) return <span className={crumbNow}>图片库</span>;
  if (isTrash) return <span className={crumbNow}>回收站</span>;
  if (activeCat === ALL || readingId) return <span className={crumbNow}>全部文章</span>;

  const parts = activeCat.split("/");
  return (
    <>
      <button className={crumbCls} onClick={() => openCategory(ALL)}>
        全部文章
      </button>
      {parts.map((p, i) => {
        const path = parts.slice(0, i + 1).join("/");
        const last = i === parts.length - 1;
        return (
          <span key={path} className="flex min-w-0 items-center gap-1">
            {sep}
            {last ? (
              <span className={crumbNow}>{p}</span>
            ) : (
              <button className={crumbCls} onClick={() => openCategory(path)}>
                {p}
              </button>
            )}
          </span>
        );
      })}
    </>
  );
}

/**
 * 内容区顶栏：面包屑 + 视图切换 + 新建按钮。
 * 阅读态下 ArticleReader 的操作按钮会 portal 进 actionSlot，与面包屑同处一行，省掉一整条横栏。
 */
export function ContentHeader({
  ws,
  readingDoc,
  onActionSlotRef,
}: {
  ws: Workspace;
  readingDoc: DocMeta | null;
  onActionSlotRef: (el: HTMLDivElement | null) => void;
}) {
  const { nav, prefs, docActions, auth, vault, library } = ws;
  const inList = !nav.readingId && nav.activeCat !== ASSETS;
  // 清空回收站只对磁盘文库开放：云端回收站有 30 天自动清理，逐篇彻底删除就够了
  const canEmptyTrash =
    nav.isTrash && !nav.readingId && auth.localMode && vault.status === "open";

  return (
    // app-titlebar：桌面壳里这条顶栏充当系统标题栏；
    // 侧栏收起后红绿灯落在它上面，这时才需要 traffic-inset 留位
    <div
      className={`app-titlebar flex h-12 shrink-0 items-center gap-1 bg-[var(--panel)] px-4 ${
        prefs.sidebarOpen ? "" : "traffic-inset"
      }`}
    >
      {!prefs.sidebarOpen ? (
        <>
          {/* 窄屏：抽屉式打开，不改动桌面记忆的折叠状态 */}
          <button
            className="mr-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] md:hidden"
            title="打开侧栏"
            onClick={() => prefs.setSidebarOpen(true)}
          >
            <PanelLeftOpen size={15} />
          </button>
          <button
            className="mr-1 hidden h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] md:flex"
            title="展开侧栏"
            onClick={prefs.toggleSidebar}
          >
            <PanelLeftOpen size={15} />
          </button>
        </>
      ) : null}

      <Breadcrumbs ws={ws} readingDoc={readingDoc} />
      <span className="flex-1" />

      {inList && !nav.isTrash ? (
        <>
          <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-md border border-[var(--hairline)] bg-[var(--panel)] p-0.5">
            {VIEW_MODES.map(([mode, Icon, label]) => (
              <button
                key={mode}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors ${
                  prefs.docView === mode
                    ? "bg-[var(--accent-wash)] text-[var(--accent)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
                title={label}
                onClick={() => prefs.switchDocView(mode)}
              >
                <Icon size={13} />
              </button>
            ))}
          </div>
          <button
            className="ml-2 flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-[12.5px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)] disabled:opacity-60"
            onClick={() => void docActions.createDoc()}
            disabled={docActions.creating}
          >
            {docActions.creating ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <FilePlus2 size={13} />
            )}
            新建文章
          </button>
        </>
      ) : null}

      {canEmptyTrash ? (
        <button
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:opacity-60"
          onClick={() => void docActions.emptyVaultTrash()}
          disabled={!library.trashDocs?.length}
        >
          <Trash2 size={13} />
          清空回收站
        </button>
      ) : null}

      {nav.readingId && !nav.isTrash ? (
        <div ref={onActionSlotRef} className="flex shrink-0 items-center gap-2" />
      ) : null}
    </div>
  );
}
