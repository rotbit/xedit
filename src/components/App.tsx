"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useEditorDoc } from "@/hooks/useEditorDoc";
import { useSyncScroll } from "@/hooks/useSyncScroll";
import { MarkdownEditor, type EditorHandle } from "./MarkdownEditor";
import { EditorToolbar } from "./EditorToolbar";
import { Preview } from "./Preview";
import { Topbar } from "./Topbar";
import { StatusBar } from "./StatusBar";
import { CssDialog } from "./CssDialog";
import { VersionsPanel } from "./VersionsPanel";
import { Toaster } from "./Toast";

interface AppConfig {
  github: boolean;
  oss: boolean;
}

export function EditorApp({ docId }: { docId: string | null }) {
  // 等 zustand persist 从 localStorage 恢复完成再挂编辑器，避免闪烁默认文案
  const hydrated = useSyncExternalStore(
    (cb) => useStore.persist.onFinishHydration(cb),
    () => useStore.persist.hasHydrated(),
    () => false
  );
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const setContent = useStore((s) => s.setContent);
  const splitRatio = useStore((s) => s.splitRatio);
  const setSplitRatio = useStore((s) => s.setSplitRatio);
  const { loggedIn, docVersion, loading, reload } = useEditorDoc(docId);

  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const splitAreaRef = useRef<HTMLDivElement>(null);
  const { setActive, onEditorScrollLine, onPreviewScroll } = useSyncScroll(
    editorRef,
    previewRef
  );

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const onDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const divider = e.currentTarget;
    divider.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const rect = splitAreaRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      setSplitRatio((ev.clientX - rect.left) / rect.width);
    };
    const onUp = () => {
      divider.removeEventListener("pointermove", onMove);
    };
    divider.addEventListener("pointermove", onMove);
    divider.addEventListener("pointerup", onUp, { once: true });
  };

  if (!hydrated || loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-[var(--paper)] text-[13px] text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" />
        加载中…
      </div>
    );
  }

  const docKey = `${docId ?? "local"}:${docVersion}`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar
        config={config}
        editorRef={editorRef}
        onOpenVersions={() => setVersionsOpen(true)}
      />
      <div ref={splitAreaRef} className="flex min-h-0 min-w-0 flex-1">
        {/* 编辑区 */}
        <div
          className="flex min-w-0 flex-col"
          style={{ width: `${splitRatio * 100}%` }}
          onPointerEnter={() => setActive("editor")}
        >
          <EditorToolbar onCommand={(cmd) => editorRef.current?.applyFormat(cmd)} />
          <div className="min-h-0 flex-1">
            <MarkdownEditor
              key={docKey}
              ref={editorRef}
              docKey={docKey}
              initialContent={useStore.getState().content}
              onChange={setContent}
              onScrollLine={onEditorScrollLine}
            />
          </div>
        </div>
        {/* 可拖拽分隔条 */}
        <div
          className="group relative z-10 w-[5px] shrink-0 cursor-col-resize border-l border-[var(--hairline)] bg-transparent hover:bg-[var(--accent-wash)]"
          onPointerDown={onDividerPointerDown}
          title="拖动调整编辑/预览宽度"
        >
          <span className="absolute left-1/2 top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--hairline-strong)] group-hover:bg-[var(--accent)]" />
        </div>
        {/* 预览区 */}
        <div className="min-w-0 flex-1" onPointerEnter={() => setActive("preview")}>
          <Preview ref={previewRef} onScroll={onPreviewScroll} />
        </div>
      </div>
      <StatusBar />
      <CssDialog />
      <VersionsPanel
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        loggedIn={loggedIn}
        onRestored={reload}
      />
      <Toaster />
    </div>
  );
}
