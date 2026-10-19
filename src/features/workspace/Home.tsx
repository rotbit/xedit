"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { useStore, DEFAULT_MARKDOWN } from "@/store/useStore";
import { ackSyncError, useFeishuSync } from "@/hooks/useFeishuSync";
import { createLocalDoc, listLocalDocs } from "@/lib/localDocs";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { Toaster, toast } from "@/components/Toast";
import { openAuth } from "@/components/AuthDialog";
import { LogoMark } from "@/components/LogoMark";
import { QuickSwitcher } from "@/components/QuickSwitcher";
import { CommandPalette } from "@/components/CommandPalette";
import { LandingActionsProvider } from "@/features/landing/LandingActions";
import { CategoryContextMenu } from "./components/CategoryContextMenu";
import { DocContextMenu } from "./components/DocContextMenu";
import { Sidebar } from "./components/Sidebar";
import { VaultGate } from "./components/VaultGate";
import { WorkspaceContent } from "./components/WorkspaceContent";
import { useWorkspace } from "./hooks/useWorkspace";
import { useWorkspaceCommands } from "./hooks/useWorkspaceCommands";
import { useHydrated } from "@/hooks/useHydrated";
import { t } from "@/i18n/t";
import { useT } from "@/i18n/useT";

const FeishuDialog = dynamic(
  () => import("@/components/FeishuDialog").then((m) => m.FeishuDialog),
  { ssr: false }
);

const ImportDialog = dynamic(
  () => import("@/components/ImportDialog").then((m) => m.ImportDialog),
  { ssr: false }
);

/** Actions that external sources (old links, the desktop shell menu bar) can trigger; `?new=1` is the old form of action=new */
const URL_ACTIONS = ["new", "import-file", "import-folder", "feishu"] as const;
type UrlAction = (typeof URL_ACTIONS)[number];

/**
 * Uses module-level t() outside the component: startLocalWriting's identity must be stable (empty deps),
 * so its closure can't hold the locale-dependent useT() version, while module-level t() reads the current locale at call time.
 */
function notifyStorageUnavailable() {
  toast(t("浏览器本地存储不可用，无法离线写作，请登录后使用"), "error");
}

interface HomeProps {
  /** Server-rendered landing page; null when logged in (that path never reaches the landing page) */
  landing: React.ReactNode;
}

/**
 * App home: with content it's a Notion-style workspace (full-height sidebar + breadcrumb bar + independently scrolling content area);
 * when logged out with no local docs it shows the landing page passed in from page.tsx.
 */
export function Home({ landing }: HomeProps) {
  const ws = useWorkspace();
  const { auth, prefs, library, nav, vault, dialogs } = ws;
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const feishuSync = useFeishuSync();
  const hydrated = useHydrated();
  const t = useT();

  // Having opened a folder (even an empty library) counts as having a workspace: the local library is on disk now, so don't fall back to the landing page
  const hasWorkspace =
    auth.loggedIn ||
    auth.offlineAuthed ||
    (auth.localMode && ((library.docs?.length ?? 0) > 0 || vault.status !== "none"));

  // Workspace commands in the command palette (⌘⇧P): new / navigate / sidebar.
  // Doc-related commands are registered by ArticleReader itself; both feed into lib/commandRegistry
  useWorkspaceCommands({
    ws,
    enabled: hasWorkspace,
    onQuickSwitch: () => setSwitcherOpen(true),
  });

  // Global shortcuts: ⌘⇧P command palette, ⌘O/⌘P quick switcher.
  // Capture phase gets ahead of the browser's print/open (like ⌘E in useEditorViewMode), and also works while the editor has focus.
  // Only attached when there's a workspace: the landing page has no docs to switch to, and certainly shouldn't hijack ⌘P printing
  useEffect(() => {
    if (!hasWorkspace) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey) {
        // ⌘⇧P command palette: with Shift e.key is uppercase P; fall back to the physical key on non-Latin layouts
        if (e.key.toLowerCase() === "p" || e.code === "KeyP") {
          e.preventDefault();
          setPaletteOpen((v) => !v); // Pressing again closes it, consistent with Obsidian
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "o" || key === "p") {
        e.preventDefault();
        setSwitcherOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hasWorkspace]);

  // Arriving with an external action (?new=1 from old /edit links, ?action=… from the desktop shell menu bar): run once when the session is ready
  const searchParams = useSearchParams();
  const actionConsumed = useRef(false);
  // ws is a new object every render, so putting it in deps would rerun this effect every render (currently held off by a ref guard,
  // but side effects like history.replaceState shouldn't hang off "every render" anyway). The action is only used in the callback, so keep it in a ref
  const wsRef = useRef(ws);
  useEffect(() => {
    wsRef.current = ws;
  });

  useEffect(() => {
    if (actionConsumed.current) return;
    const raw = searchParams.get("action") ?? (searchParams.get("new") === "1" ? "new" : null);
    if (!raw || !URL_ACTIONS.includes(raw as UrlAction)) return;
    if (auth.status === "loading") return;
    actionConsumed.current = true;
    window.history.replaceState(null, "", "/");
    // Run it in a macrotask so synchronous setState inside the action isn't part of this effect
    setTimeout(() => {
      const { docActions, dialogs: dlg } = wsRef.current;
      if (raw === "new") void docActions.createDoc();
      else if (raw === "import-file") dlg.openImport("file");
      else if (raw === "import-folder") dlg.openImport("folder");
      else if (raw === "feishu") dlg.openFeishu();
    }, 0);
  }, [searchParams, auth.status]);

  // Subscribe only to the boolean "is there a local draft": subscribing to content would re-render the whole workspace tree on every keystroke
  const hasLocalDraft = useStore(
    (s) => Boolean(s.content.trim()) && s.content !== DEFAULT_MARKDOWN
  );

  /** Logged-out writing: fold the legacy single-doc draft into the local library, otherwise create a welcome doc */
  const startLocalWriting = useCallback(() => {
    const s = useStore.getState();
    const hasDraft =
      s.docId === null && Boolean(s.content.trim()) && s.content !== DEFAULT_MARKDOWN;
    try {
      const doc = hasDraft
        ? createLocalDoc({ title: s.title, content: s.content })
        : createLocalDoc({ title: "欢迎使用 xEdit", content: DEFAULT_MARKDOWN }); // i18n-ignore doc title written into data, paired with the Chinese welcome body
      // The draft is now in the library; clear the old buffer so the legacy migration doesn't upload it again after login
      if (hasDraft) s.setDoc({ id: null, title: UNTITLED_DOC, content: DEFAULT_MARKDOWN });
      // Read ws via ref: this callback goes into the landing page's context, so its identity must stay stable
      wsRef.current.library.setDocs(listLocalDocs());
      wsRef.current.nav.openDoc(doc.id);
    } catch {
      // The local library relies entirely on localStorage; if it's unavailable, just say so (the old single-doc editor page is gone)
      notifyStorageUnavailable();
    }
  }, []);

  // `?action=start` comes from the localized landing pages (/en, /ja), which live outside the workspace: once the session and
  // local library are known, a visitor without a workspace goes straight into a new local doc (as 「开始写作」 does here);
  // anyone with a workspace already sees it, so there's nothing to do
  const startConsumed = useRef(false);
  const workspaceKnown =
    auth.status !== "loading" && !(auth.localMode && (library.docs === null || vault.booting));
  useEffect(() => {
    if (startConsumed.current || !workspaceKnown || searchParams.get("action") !== "start") return;
    startConsumed.current = true;
    window.history.replaceState(null, "", "/");
    if (!hasWorkspace) setTimeout(startLocalWriting, 0);
  }, [searchParams, workspaceKnown, hasWorkspace, startLocalWriting]);

  // The whole landing tree reads this from context: an inline literal would needlessly re-render the landing page on every workspace render
  const actions = useMemo(
    () => ({
      onStart: startLocalWriting,
      onLogin: () => openAuth("login"),
      // The landing page stays entirely Chinese (not in bilingual scope), and the button copy follows it
      startLabel: hasLocalDraft ? "继续编辑本地文稿" : "开始写作", // i18n-ignore
    }),
    [startLocalWriting, hasLocalDraft]
  );

  // The session is injected with the HTML, but workspace content comes from localStorage (mirror / local library), which the server can't read —
  // render output must match on both sides until hydration finishes, so this frame renders only the landing page or an empty shell, then re-renders once it flips true.
  // When the server has decided the user is logged out, lay out the landing page in this frame — it must be real DOM for crawlers to read;
  // returning users get data-ws set by the theme-init inline script before first paint, and CSS hides this frame so they never see the landing page.
  if (
    !hydrated ||
    auth.status === "loading" ||
    (auth.localMode && (library.docs === null || vault.booting))
  ) {
    if (!landing) return <div className="h-full bg-[var(--paper)]" />;
    return (
      <div className="landing-boot h-full">
        <LandingActionsProvider value={actions}>{landing}</LandingActionsProvider>
      </div>
    );
  }

  // The last folder is still awaiting permission (or opening): show a gate screen first instead of slapping together a workspace from the old backend's list
  if (auth.localMode && (vault.status === "pending" || vault.status === "opening")) {
    return (
      <>
        <VaultGate vault={vault} />
        <Toaster />
      </>
    );
  }

  if (!hasWorkspace) {
    return (
      <>
        <LandingActionsProvider value={actions}>
          {/* During SSR the session was judged logged out, so landing must exist;
              the fallback branch only flashes when the session expires mid-way (e.g. logged out in another tab) */}
          {landing ?? <SignedOutFallback onStart={startLocalWriting} />}
        </LandingActionsProvider>
        <Toaster />
      </>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-[var(--paper)]">
      {/* Backdrop for the narrow-screen drawer: click to close */}
      {prefs.sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => prefs.setSidebarOpen(false)}
        />
      ) : null}
      <Sidebar ws={ws} />
      <WorkspaceContent ws={ws} />
      {/* Offline notice: while logged in and offline, all changes go to the local mirror and sync automatically once back online */}
      {!auth.online && !auth.localMode ? (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-[var(--hairline)] bg-[var(--panel)] px-3.5 py-1.5 text-[12px] text-[var(--ink-soft)] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
          {t("已离线 · 改动保存在本地，联网后自动同步")}
        </div>
      ) : null}
      {/* Feishu sync is running in the background (or quietly stopped) with the dialog closed: leave a pill at the bottom right that reopens the details */}
      {!dialogs.feishuOpen &&
      (feishuSync.syncing || (feishuSync.error && !feishuSync.errorAcked)) ? (
        <button
          className="fixed bottom-4 right-4 z-40 flex cursor-pointer items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--panel)] px-3.5 py-1.5 text-[12px] text-[var(--ink-soft)] shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:text-[var(--ink)]"
          onClick={dialogs.openFeishu}
        >
          {feishuSync.syncing ? (
            <>
              <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
              {feishuSync.retry ? t("飞书同步重试中") : t("飞书同步中")}
              {feishuSync.progress
                ? ` ${feishuSync.progress.total - feishuSync.progress.pending}/${feishuSync.progress.total}`
                : "…"}
            </>
          ) : (
            <>
              <AlertCircle size={14} className="text-red-500" />
              {t("飞书同步已中断，点击查看")}
            </>
          )}
        </button>
      ) : null}
      {/* One instance of each context menu for the whole workspace; content and position come from the anchors in ws.menus */}
      <CategoryContextMenu ws={ws} />
      <DocContextMenu ws={ws} />
      <QuickSwitcher
        open={switcherOpen}
        docs={library.docs ?? []}
        onClose={() => setSwitcherOpen(false)}
        onOpen={(id) => {
          setSwitcherOpen(false);
          nav.openDoc(id);
        }}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {dialogs.importRequest ? (
        <ImportDialog
          mode={dialogs.importRequest.mode}
          targetCat={dialogs.importRequest.cat}
          importer={ws.importer}
          onClose={dialogs.closeImport}
        />
      ) : null}
      {dialogs.feishuOpen ? (
        <FeishuDialog
          onClose={() => {
            dialogs.closeFeishu();
            // Opening the dialog counts as having seen the interruption notice; the pill stops nagging (the reason stays in the panel)
            ackSyncError();
          }}
          onSynced={() => void ws.docActions.refreshDocs()}
        />
      ) : null}
      <Toaster />
    </div>
  );
}

/** Minimal usable UI when the session expires on the client and there's no landing-page HTML at hand */
function SignedOutFallback({ onStart }: { onStart: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-[var(--paper)] px-6 text-center">
      <LogoMark className="h-12 w-auto text-[var(--ink)]" />
      <p className="text-[15px] text-[var(--ink-soft)]">{t("登录状态已失效，重新开始吧")}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          className="h-10 cursor-pointer rounded-lg bg-[var(--accent)] px-5 text-[14px] font-medium text-[var(--accent-fg)]"
          onClick={onStart}
        >
          {t("开始写作")}
        </button>
        <button
          className="h-10 cursor-pointer rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-5 text-[14px]"
          onClick={() => openAuth("login")}
        >
          {t("登录 / 注册")}
        </button>
      </div>
    </div>
  );
}
