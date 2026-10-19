"use client";

/**
 * Content area top bar. All state comes from ws (useWorkspace's aggregate object); it holds no state of its own.
 * In the desktop shell this also serves as the system window title bar (app-titlebar); its height and left padding affect the traffic-light position, so read the notes below before changing it.
 */
import { ChevronRight, CalendarDays, List, PanelLeftOpen, Trash2, X } from "lucide-react";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { ALL, ASSETS, HISTORY, SETTINGS, TODAY } from "../constants";
import { displayCatName, displayCatPath } from "../lib/catPath";
import { NewDocButton } from "./NewDocButton";
import type { DocMeta } from "../types";
import type { DocView } from "../hooks/useSidebarPrefs";
import type { Workspace } from "../hooks/useWorkspace";

const crumbCls =
  "max-w-[220px] cursor-pointer truncate rounded-md px-1.5 py-0.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]";
const crumbNow = "truncate px-1.5 py-0.5 text-[13px] font-medium text-[var(--ink)]";
const sep = <ChevronRight size={12} className="shrink-0 text-[var(--ink-faint)]" />;
const closeCls =
  "ml-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]";

// Store only keys at the top level (marked with tk) and t() at render time: translating at module load wouldn't follow language changes
const VIEW_MODES: [DocView, typeof CalendarDays, string][] = [
  ["card", CalendarDays, tk("时间流")],
  ["list", List, tk("列表视图")],
];

/** Breadcrumbs: reading view shows "category / title", list view shows the current category path; the 「最近打开」 (Recent) view shows only itself and isn't the root of other paths */
function Breadcrumbs({ ws, readingDoc }: { ws: Workspace; readingDoc: DocMeta | null }) {
  const { nav } = ws;
  const { activeCat, readingId, isTrash, openCategory, setReadingId } = nav;
  const t = useT();

  if (readingDoc) {
    return (
      <>
        {readingDoc.category ? (
          <>
            <button className={crumbCls} onClick={() => openCategory(readingDoc.category!)}>
              {displayCatPath(readingDoc.category, t)}
            </button>
            {sep}
          </>
        ) : null}
        <span className={crumbNow}>{readingDoc.title || t(UNTITLED_DOC)}</span>
        {/* Close document: back to the folder list it was opened from */}
        <button className={closeCls} title={t("关闭文章")} onClick={() => setReadingId(null)}>
          <X size={14} />
        </button>
      </>
    );
  }
  if (activeCat === ASSETS) return <span className={crumbNow}>{t("图片库")}</span>;
  // With !readingId: when arriving directly via ?doc= before the doc is fetched, don't flash 「今天」 (Today) first
  if (activeCat === TODAY && !readingId) return <span className={crumbNow}>{t("今天")}</span>;
  // History is a subpage of Today: the breadcrumb includes a clickable 「今天」 and a close button at the end; both lead back to Today
  if (activeCat === HISTORY && !readingId)
    return (
      <>
        <button className={crumbCls} onClick={() => openCategory(TODAY)}>
          {t("今天")}
        </button>
        {sep}
        <span className={crumbNow}>{t("历史已完成")}</span>
        <button className={closeCls} title={t("回到今天")} onClick={() => openCategory(TODAY)}>
          <X size={14} />
        </button>
      </>
    );
  // Settings is entered from the avatar menu, not under Today: shows only itself, and the close button returns to Today
  if (activeCat === SETTINGS && !readingId)
    return (
      <>
        <span className={crumbNow}>{t("设置")}</span>
        <button className={closeCls} title={t("回到今天")} onClick={() => openCategory(TODAY)}>
          <X size={14} />
        </button>
      </>
    );
  if (isTrash) return <span className={crumbNow}>{t("回收站")}</span>;
  // Also taken when readingId is set but readingDoc hasn't arrived yet (loading), so the breadcrumb doesn't flash an empty category
  if (activeCat === ALL || readingId)
    return (
      <>
        <span className={crumbNow}>{t("最近打开")}</span>
        {/* 「最近打开」 (Recent) is also entered from Today: give it a close button back to Today */}
        {!readingId ? (
          <button className={closeCls} title={t("回到今天")} onClick={() => openCategory(TODAY)}>
            <X size={14} />
          </button>
        ) : null}
      </>
    );

  // Split the category path on / into levels; all but the last are clickable, jumping to that level's list
  const parts = activeCat.split("/");
  return (
    <>
      {parts.map((p, i) => {
        const path = parts.slice(0, i + 1).join("/");
        const last = i === parts.length - 1;
        return (
          <span key={path} className="flex min-w-0 items-center gap-1">
            {i > 0 ? sep : null}
            {last ? (
              <span className={crumbNow}>{displayCatName(p, t)}</span>
            ) : (
              <button className={crumbCls} onClick={() => openCategory(path)}>
                {displayCatName(p, t)}
              </button>
            )}
          </span>
        );
      })}
    </>
  );
}

/**
 * Content area top bar: breadcrumbs + view switcher + new/import split button.
 * In reading view ArticleReader's action buttons portal into actionSlot, sharing a row with the breadcrumbs and saving a whole bar.
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
  const t = useT();
  // Image library, Today, completed history and Settings aren't document lists: no view switcher and no creating here
  const inList =
    !nav.readingId &&
    nav.activeCat !== ASSETS &&
    nav.activeCat !== TODAY &&
    nav.activeCat !== HISTORY &&
    nav.activeCat !== SETTINGS;
  // Emptying the trash is only for disk libraries: the cloud trash auto-cleans after 30 days, and permanently deleting one by one is enough
  const canEmptyTrash =
    nav.isTrash && !nav.readingId && auth.localMode && vault.status === "open";

  return (
    // app-titlebar: in the desktop shell this top bar acts as the system title bar;
    // when the sidebar is collapsed the traffic lights sit on it, and only then is traffic-inset needed for spacing
    <div
      className={`app-titlebar flex h-12 shrink-0 items-center gap-1 bg-[var(--panel)] px-4 ${
        prefs.sidebarOpen ? "" : "traffic-inset"
      }`}
    >
      {!prefs.sidebarOpen ? (
        <>
          {/* Narrow screens: open as a drawer without changing the remembered desktop collapse state */}
          <button
            className="mr-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] md:hidden"
            title={t("打开侧栏")}
            onClick={() => prefs.setSidebarOpen(true)}
          >
            <PanelLeftOpen size={16} />
          </button>
          <button
            className="mr-1 hidden h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] md:flex"
            title={t("展开侧栏")}
            onClick={prefs.toggleSidebar}
          >
            <PanelLeftOpen size={16} />
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
                title={t(label)}
                onClick={() => prefs.switchDocView(mode)}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
          <NewDocButton ws={ws} />
        </>
      ) : null}

      {canEmptyTrash ? (
        <button
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] disabled:opacity-60"
          onClick={() => void docActions.emptyVaultTrash()}
          // Disable when the trash is empty: better grayed out than a button that does nothing
          disabled={!library.trashDocs?.length}
        >
          <Trash2 size={14} />
          {t("清空回收站")}
        </button>
      ) : null}

      {/* Only mount actionSlot in normal reading view: documents in the trash have no edit/export actions to put there */}
      {nav.readingId && !nav.isTrash ? (
        <div ref={onActionSlotRef} className="flex shrink-0 items-center gap-2" />
      ) : null}
    </div>
  );
}
