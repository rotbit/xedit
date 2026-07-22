"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useEditorDoc } from "@/hooks/useEditorDoc";
import { useSyncScroll } from "@/hooks/useSyncScroll";
import { MarkdownEditor, type EditorHandle } from "./MarkdownEditor";
import { EditorToolbar } from "./EditorToolbar";
import { OutlinePanel } from "./OutlinePanel";
import { Preview } from "./Preview";
import { Topbar } from "./Topbar";
import { StatusBar } from "./StatusBar";
import { VersionsPanel } from "./VersionsPanel";
import { Toaster } from "./Toast";

export function EditorApp({ docId }: { docId: string | null }) {
  // 等 zustand persist 从 localStorage 恢复完成再挂编辑器，避免闪烁默认文案
  const hydrated = useSyncExternalStore(
    (cb) => useStore.persist.onFinishHydration(cb),
    () => useStore.persist.hasHydrated(),
    () => false
  );
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  // 窄屏不分屏，编辑/预览二选一切换（≥md 恒为分屏，此状态不生效）
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");

  const setContent = useStore((s) => s.setContent);
  const sourceMode = useStore((s) => s.sourceMode);
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
        editorRef={editorRef}
        onOpenVersions={() => setVersionsOpen(true)}
      />
      {/* 窄屏编辑/预览切换条（≥md 分屏时隐藏） */}
      <div className="flex h-9 shrink-0 items-center justify-center gap-1 border-b border-[var(--hairline)] bg-[var(--panel)] md:hidden">
        {(["edit", "preview"] as const).map((v) => (
          <button
            key={v}
            className={`h-7 cursor-pointer rounded-md px-5 text-[12.5px] ${
              mobileView === v
                ? "bg-[var(--accent-wash)] font-medium text-[var(--accent)]"
                : "text-[var(--ink-soft)]"
            }`}
            onClick={() => setMobileView(v)}
          >
            {v === "edit" ? "编辑" : "预览"}
          </button>
        ))}
      </div>
      <div ref={splitAreaRef} className="flex min-h-0 min-w-0 flex-1">
        {/* 编辑区 */}
        <div
          className={`${mobileView === "edit" ? "flex" : "hidden"} min-w-0 flex-col max-md:w-full! md:flex`}
          style={{ width: `${splitRatio * 100}%` }}
          onPointerEnter={() => setActive("editor")}
        >
          <EditorToolbar
            onCommand={(cmd) => editorRef.current?.applyFormat(cmd)}
            outlineOpen={outlineOpen}
            onToggleOutline={() => setOutlineOpen((v) => !v)}
          />
          <div className="flex min-h-0 flex-1">
            {/* 大纲面板：宽度过渡开合，与首页文章视图一致 */}
            <div
              className={`shrink-0 overflow-hidden transition-[width] duration-[260ms] ease-[cubic-bezier(0.22,0.9,0.26,1)] ${
                outlineOpen ? "w-52" : "w-0"
              }`}
            >
              <OutlinePanel onJump={(line) => editorRef.current?.scrollToLine(line)} />
            </div>
            <div className="min-h-0 min-w-0 flex-1">
              <MarkdownEditor
                key={docKey}
                ref={editorRef}
                docKey={docKey}
                initialContent={useStore.getState().content}
                live={!sourceMode}
                onChange={setContent}
                onScrollLine={onEditorScrollLine}
              />
            </div>
          </div>
        </div>
        {/* 可拖拽分隔条（窄屏单栏时隐藏） */}
        <div
          className="group relative z-10 w-[5px] shrink-0 cursor-col-resize border-l border-[var(--hairline)] bg-[var(--panel)] hover:bg-[var(--accent-wash)] max-md:hidden"
          onPointerDown={onDividerPointerDown}
          title="拖动调整编辑/预览宽度"
        >
          <span className="absolute left-1/2 top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--hairline-strong)] group-hover:bg-[var(--accent)]" />
        </div>
        {/* 预览区：编辑页固定分屏，单屏即时渲染在首页文章视图内 */}
        <div
          className={`min-w-0 flex-1 ${mobileView === "preview" ? "block" : "hidden"} md:block`}
          onPointerEnter={() => setActive("preview")}
        >
          <Preview ref={previewRef} onScroll={onPreviewScroll} />
        </div>
      </div>
      <StatusBar />
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
