"use client";

// 正文上浮动的批注交互层：选区/媒体的「批注」按钮、新批注编辑卡、线程面板（从 SharedArticle 搬出）

import { useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
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

/** 发表批注/回复；返回是否真的发出去了，输入框据此决定清不清 */
type Submit = (
  parentId: string | null,
  body: string,
  anchor?: PendingAnchor
) => Promise<boolean>;

/** 选区与媒体的批注入口，以及新批注编辑卡的落点 */
export interface OverlaySelection {
  selBtn: SelBtnState;
  mediaBtn: MediaBtnState;
  composer: ComposerState;
}

/** 当前展开的线程与它的浮层落点 */
export interface OverlayThread {
  active: Thread | null;
  pos: PanelPos;
}

/** 浮层要回写的状态与要发出的请求 */
export interface OverlayHandlers {
  setComposer: Dispatch<SetStateAction<ComposerState>>;
  setMediaBtn: Dispatch<SetStateAction<MediaBtnState>>;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  setPanelPos: Dispatch<SetStateAction<PanelPos>>;
  cancelMediaHide: () => void;
  scheduleMediaHide: () => void;
  submit: Submit;
  resolveThread: (id: string, resolved: boolean) => Promise<void>;
  removeComment: (c: ShareCommentJson) => Promise<void>;
}

/** 署名与提交态：新批注卡和回复框共用的那几项 */
interface ComposeCommon {
  guestName: string;
  busy: boolean;
  needName: boolean;
  nameInput: ReactNode;
}

export function AnnotationOverlay({
  wrapRef,
  selection,
  thread,
  handlers,
  compose,
  allowComment,
}: {
  wrapRef: RefObject<HTMLDivElement | null>;
  selection: OverlaySelection;
  thread: OverlayThread;
  handlers: OverlayHandlers;
  compose: ComposeCommon;
  allowComment: boolean;
}) {
  const { selBtn, mediaBtn, composer } = selection;
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
            handlers.setComposer({
              y: selBtn.y,
              x: Math.min(Math.max(8, selBtn.x - 150), width - 308),
              anchor: { ...selBtn.anchor, type: "text" },
            });
            handlers.setActiveId(null);
            handlers.setPanelPos(null);
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
          onPointerEnter={handlers.cancelMediaHide}
          onPointerLeave={handlers.scheduleMediaHide}
          onClick={() => {
            const width = wrapRef.current?.clientWidth ?? 440;
            handlers.setComposer({
              x: Math.min(Math.max(8, mediaBtn.x - 300), width - 308),
              y: mediaBtn.y + 34,
              anchor: { ...mediaBtn.anchor, type: "media" },
            });
            handlers.setActiveId(null);
            handlers.setPanelPos(null);
            handlers.setMediaBtn(null);
          }}
        >
          <MessageSquarePlus size={13} />
          批注{mediaBtn.video ? "视频" : "图片"}
        </button>
      ) : null}

      {/* 新批注编辑卡：composer 为 null 时整块卸载，草稿随之清干净 */}
      {composer ? (
        <ComposerCard
          composer={composer}
          compose={compose}
          submit={handlers.submit}
          onClose={() => handlers.setComposer(null)}
        />
      ) : null}

      {/* 线程面板：点高亮弹出。按 root id 做 key —— 直接从一条批注跳到另一条时
          也会重建，上一条写了一半的回复不会跟过去 */}
      {thread.active && thread.pos ? (
        <ThreadPanel
          key={thread.active.root.id}
          thread={thread.active}
          pos={thread.pos}
          compose={compose}
          handlers={handlers}
          allowComment={allowComment}
        />
      ) : null}
    </>
  );
}

/** 新批注编辑卡：自己持有草稿，发表成功后由父层卸载 */
function ComposerCard({
  composer,
  compose,
  submit,
  onClose,
}: {
  composer: NonNullable<ComposerState>;
  compose: ComposeCommon;
  submit: Submit;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const post = () => void submit(null, draft, composer.anchor);
  const blocked = !draft.trim() || (compose.needName && !compose.guestName.trim()) || compose.busy;

  return (
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
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {compose.nameInput}
      <textarea
        autoFocus
        className="h-20 w-full resize-none rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-1.5 text-[13px] leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
        placeholder="写下批注…（⌘/Ctrl+Enter 提交）"
        value={draft}
        maxLength={2000}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") post();
        }}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          className="cursor-pointer rounded-md px-3 py-1.5 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--paper)]"
          onClick={onClose}
        >
          取消
        </button>
        <button
          className="cursor-pointer rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-45"
          disabled={blocked}
          onClick={post}
        >
          批注
        </button>
      </div>
    </div>
  );
}

/** 线程面板：自己持有回复草稿，发出去后就地清空 */
function ThreadPanel({
  thread,
  pos,
  compose,
  handlers,
  allowComment,
}: {
  thread: Thread;
  pos: NonNullable<PanelPos>;
  compose: ComposeCommon;
  handlers: OverlayHandlers;
  allowComment: boolean;
}) {
  const [draft, setDraft] = useState("");
  const reply = () => {
    void handlers.submit(thread.root.id, draft).then((ok) => {
      if (ok) setDraft("");
    });
  };
  const blocked = !draft.trim() || (compose.needName && !compose.guestName.trim()) || compose.busy;

  return (
    <div
      className="absolute z-40 w-[308px] rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <AnchorQuote
            anchorType={thread.root.anchorType}
            anchorText={thread.root.anchorText}
          />
        </div>
        <div className="ml-2 flex items-center gap-1">
          {thread.root.mine && !thread.root.resolvedAt ? (
            <button
              className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[12px] text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              title="标记已解决"
              onClick={() => void handlers.resolveThread(thread.root.id, true)}
            >
              <Check size={13} />
              解决
            </button>
          ) : null}
          <button
            className="cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]"
            onClick={() => {
              handlers.setActiveId(null);
              handlers.setPanelPos(null);
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto px-3 py-2">
        {[thread.root, ...thread.replies].map((c) => (
          <div key={c.id} className="group py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-[var(--ink)]">{c.author}</span>
              {c.isOwner ? (
                <span className="rounded bg-[var(--accent-wash)] px-1 text-[10px] text-[var(--accent)]">
                  作者
                </span>
              ) : null}
              <span className="text-[11px] text-[var(--ink-faint)]">{fmtTime(c.createdAt)}</span>
              <span className="flex-1" />
              {c.mine ? (
                <button
                  className="cursor-pointer text-[var(--ink-faint)] hover:text-red-500"
                  title="删除批注"
                  onClick={() => void handlers.removeComment(c)}
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
          {compose.nameInput}
          <div className="flex items-end gap-2">
            <textarea
              className="h-9 min-h-9 flex-1 resize-none rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-1.5 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
              placeholder="回复…"
              value={draft}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") reply();
              }}
            />
            <button
              className="cursor-pointer rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-45"
              disabled={blocked}
              onClick={reply}
            >
              回复
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
