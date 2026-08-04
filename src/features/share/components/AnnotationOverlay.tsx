"use client";

// 正文上浮动的批注交互层：选区/媒体的「批注」按钮、新批注编辑卡、线程面板（从 SharedArticle 搬出）

import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { Check, MessageSquarePlus, Trash2, X } from "lucide-react";
import type { ShareCommentJson } from "../types";
import { fmtTime } from "../lib/format";
import type {
  ComposerState,
  MediaBtnState,
  PanelPos,
  PendingAnchor,
  SelBtnState,
  Thread,
} from "../SharedArticle";
import { AnchorQuote } from "./AnchorQuote";

export function AnnotationOverlay({
  wrapRef,
  selBtn,
  mediaBtn,
  composer,
  setComposer,
  setMediaBtn,
  cancelMediaHide,
  scheduleMediaHide,
  setDraft,
  setActiveId,
  setPanelPos,
  draft,
  guestName,
  busy,
  needName,
  nameInput,
  submit,
  activeThread,
  panelPos,
  resolveThread,
  removeComment,
  allowComment,
}: {
  wrapRef: RefObject<HTMLDivElement | null>;
  selBtn: SelBtnState;
  mediaBtn: MediaBtnState;
  composer: ComposerState;
  setComposer: Dispatch<SetStateAction<ComposerState>>;
  setMediaBtn: Dispatch<SetStateAction<MediaBtnState>>;
  cancelMediaHide: () => void;
  scheduleMediaHide: () => void;
  setDraft: Dispatch<SetStateAction<string>>;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  setPanelPos: Dispatch<SetStateAction<PanelPos>>;
  draft: string;
  guestName: string;
  busy: boolean;
  needName: boolean;
  nameInput: ReactNode;
  submit: (parentId: string | null, anchor?: PendingAnchor) => Promise<void>;
  activeThread: Thread | null;
  panelPos: PanelPos;
  resolveThread: (id: string, resolved: boolean) => Promise<void>;
  removeComment: (c: ShareCommentJson) => Promise<void>;
  allowComment: boolean;
}) {
  return (
    <>
      {/* 选中后的「批注」浮动按钮 */}
      {selBtn && !composer ? (
        <button
          className="absolute z-30 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--ink)] py-1.5 pl-2.5 pr-3 text-[12px] font-medium text-[var(--panel)] shadow-lg hover:opacity-90"
          style={{ left: selBtn.x, top: selBtn.y }}
          onPointerDown={(e) => e.preventDefault() /* 保住选区 */}
          onClick={() => {
            // 位置在这里就钳好（渲染期不许读 ref）
            const width = wrapRef.current?.clientWidth ?? 440;
            setComposer({
              y: selBtn.y,
              x: Math.min(Math.max(8, selBtn.x - 150), width - 308),
              anchor: { ...selBtn.anchor, type: "text" },
            });
            setDraft("");
            setActiveId(null);
            setPanelPos(null);
          }}
        >
          <MessageSquarePlus size={13} />
          批注
        </button>
      ) : null}

      {/* 悬停/点按图片视频出现的「批注」浮标 */}
      {mediaBtn && !composer ? (
        <button
          className="absolute z-30 flex -translate-x-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--ink)] py-1.5 pl-2.5 pr-3 text-[12px] font-medium text-[var(--panel)] shadow-lg hover:opacity-90"
          style={{ left: mediaBtn.x, top: mediaBtn.y }}
          onPointerEnter={cancelMediaHide}
          onPointerLeave={scheduleMediaHide}
          onClick={() => {
            const width = wrapRef.current?.clientWidth ?? 440;
            setComposer({
              x: Math.min(Math.max(8, mediaBtn.x - 300), width - 308),
              y: mediaBtn.y + 34,
              anchor: { ...mediaBtn.anchor, type: "media" },
            });
            setDraft("");
            setActiveId(null);
            setPanelPos(null);
            setMediaBtn(null);
          }}
        >
          <MessageSquarePlus size={13} />
          批注{mediaBtn.video ? "视频" : "图片"}
        </button>
      ) : null}

      {/* 新批注编辑卡 */}
      {composer ? (
        <div
          className="absolute z-40 w-[300px] rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
          style={{ left: composer.x, top: composer.y }}
        >
          <div className="mb-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <AnchorQuote
                anchorType={composer.anchor.type}
                anchorText={composer.anchor.anchorText}
              />
            </div>
            <button
              className="cursor-pointer text-[var(--ink-faint)] hover:text-[var(--ink)]"
              onClick={() => setComposer(null)}
            >
              <X size={14} />
            </button>
          </div>
          {nameInput}
          <textarea
            autoFocus
            className="h-20 w-full resize-none rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-1.5 text-[13px] leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
            placeholder="写下批注…（⌘/Ctrl+Enter 提交）"
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                void submit(null, composer.anchor);
              }
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="cursor-pointer rounded-md px-3 py-1.5 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--paper)]"
              onClick={() => setComposer(null)}
            >
              取消
            </button>
            <button
              className="cursor-pointer rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-45"
              disabled={!draft.trim() || (needName && !guestName.trim()) || busy}
              onClick={() => void submit(null, composer.anchor)}
            >
              批注
            </button>
          </div>
        </div>
      ) : null}

      {/* 线程面板：点高亮弹出 */}
      {activeThread && panelPos ? (
        <div
          className="absolute z-40 w-[308px] rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
          style={{ left: panelPos.x, top: panelPos.y }}
        >
          <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-3 py-2">
            <div className="min-w-0 flex-1">
              <AnchorQuote
                anchorType={activeThread.root.anchorType}
                anchorText={activeThread.root.anchorText}
              />
            </div>
            <div className="ml-2 flex items-center gap-1">
              {activeThread.root.mine && !activeThread.root.resolvedAt ? (
                <button
                  className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[12px] text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  title="标记已解决"
                  onClick={() => void resolveThread(activeThread.root.id, true)}
                >
                  <Check size={13} />
                  解决
                </button>
              ) : null}
              <button
                className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                onClick={() => {
                  setActiveId(null);
                  setPanelPos(null);
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto px-3 py-2">
            {[activeThread.root, ...activeThread.replies].map((c) => (
              <div key={c.id} className="group py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[var(--ink)]">
                    {c.author}
                  </span>
                  {c.isOwner ? (
                    <span className="rounded bg-[var(--accent-wash)] px-1 text-[10px] text-[var(--accent)]">
                      作者
                    </span>
                  ) : null}
                  <span className="text-[11px] text-[var(--ink-faint)]">
                    {fmtTime(c.createdAt)}
                  </span>
                  <span className="flex-1" />
                  {c.mine ? (
                    <button
                      className="cursor-pointer text-[var(--ink-faint)] hover:text-red-500"
                      title="删除批注"
                      onClick={() => void removeComment(c)}
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ink)]">
                  {c.body}
                </p>
              </div>
            ))}
          </div>
          {allowComment ? (
            <div className="border-t border-[var(--hairline-soft)] p-2.5">
              {nameInput}
              <div className="flex items-end gap-2">
                <textarea
                  className="h-9 min-h-9 flex-1 resize-none rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-1.5 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
                  placeholder="回复…"
                  value={draft}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      void submit(activeThread.root.id);
                    }
                  }}
                />
                <button
                  className="cursor-pointer rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-45"
                  disabled={!draft.trim() || (needName && !guestName.trim()) || busy}
                  onClick={() => void submit(activeThread.root.id)}
                >
                  回复
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
