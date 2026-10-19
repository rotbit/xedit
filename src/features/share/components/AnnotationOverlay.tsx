"use client";

// Floating annotation layer over the body: the 「批注」 (Annotate) button for selections/media, the new-annotation card, the thread panel (moved out of SharedArticle)

/**
 * All positions (x/y) are pixels relative to the `relative` wrapper in SharedArticle, computed there with
 * getBoundingClientRect and passed in; everything here is absolutely positioned and never reads the DOM during render.
 * This layer holds no business state: the annotation list, visitor identity and polling live in SharedArticle / useShareComments;
 * only input drafts live here, and they disappear when the card unmounts.
 */
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

/** Post an annotation/reply; returns whether it actually went out, so the input knows whether to clear */
type Submit = (
  parentId: string | null,
  body: string,
  anchor?: PendingAnchor
) => Promise<boolean>;

/** Annotation entry points for selections and media, plus where the new-annotation card lands */
export interface OverlaySelection {
  selBtn: SelBtnState;
  mediaBtn: MediaBtnState;
  composer: ComposerState;
}

/** The currently open thread and where its popover lands */
export interface OverlayThread {
  active: Thread | null;
  pos: PanelPos;
}

/** State the popover writes back and requests it sends */
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

/** Signature and submit state: the fields shared by the new-annotation card and the reply box */
interface ComposeCommon {
  guestName: string;
  busy: boolean;
  needName: boolean;
  nameInput: ReactNode;
}

/** Annotation overlay assembly: selection button, media badge, new-annotation card, thread panel; only one or two show depending on the interaction state */
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
      {/* Floating 「批注」 (Annotate) button after selecting text */}
      {selBtn && !composer ? (
        <button
          className="absolute z-30 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--ink)] py-1.5 pl-2.5 pr-3 text-[12px] font-medium text-[var(--panel)] shadow-lg hover:opacity-90"
          style={{ left: selBtn.x, top: selBtn.y }}
          onPointerDown={(e) => e.preventDefault() /* keep the selection */}
          onClick={() => {
            // Clamp the position right here (reading refs during render isn't allowed)
            // 308 = 300px card width plus 8px margin; minus 150 centers the card horizontally on the selection; without a container width, fall back to 440 (a phone width)
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
          <MessageSquarePlus size={14} />
          批注
        </button>
      ) : null}

      {/* 「批注」 (Annotate) badge shown when hovering/tapping an image or video */}
      {mediaBtn && !composer ? (
        <button
          className="absolute z-30 flex -translate-x-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--ink)] py-1.5 pl-2.5 pr-3 text-[12px] font-medium text-[var(--panel)] shadow-lg hover:opacity-90"
          style={{ left: mediaBtn.x, top: mediaBtn.y }}
          // When the pointer moves from the image onto this badge, cancel the delayed hide scheduled there (250ms in SharedArticle), or the button vanishes halfway
          onPointerEnter={handlers.cancelMediaHide}
          onPointerLeave={handlers.scheduleMediaHide}
          onClick={() => {
            // The media badge is right-aligned at the image's top-right (-translate-x-full), so the card is drawn from 300 (card width) to its left, with y moved down 34 to clear the badge
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
          <MessageSquarePlus size={14} />
          批注{mediaBtn.video ? "视频" : "图片"}
        </button>
      ) : null}

      {/* New-annotation card: unmounts entirely when composer is null, so the draft is cleared with it */}
      {composer ? (
        <ComposerCard
          composer={composer}
          compose={compose}
          submit={handlers.submit}
          onClose={() => handlers.setComposer(null)}
        />
      ) : null}

      {/* Thread panel: opens on clicking a highlight. Keyed by root id, so jumping straight from one annotation to another
          rebuilds it too, and a half-written reply doesn't carry over */}
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

/** New-annotation card: owns its draft; the parent unmounts it after a successful post */
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
  // Ignore the return value: on success SharedArticle nulls composer and the whole card unmounts with its draft; on failure the card and draft remain
  const post = () => void submit(null, draft, composer.anchor);
  // The server falls back to 「访客」 (Guest) rather than erroring without an author; this check is purely a frontend rule that every annotation should have a recognizable signature
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
      {/* The nickname input is built and passed down by SharedArticle: it's null when already signed or when you're the author, so nothing is drawn here */}
      {compose.nameInput}
      <textarea
        autoFocus
        className="h-20 w-full resize-none rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-1.5 text-[13px] leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
        placeholder="写下批注…（⌘/Ctrl+Enter 提交）"
        value={draft}
        // 2000 matches the server (the comments route does body.slice(0, 2000)): overlong text isn't an error, it's silently truncated
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

/** Thread panel: owns its reply draft and clears it in place after sending */
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
      // Only clear the draft if it actually went out: on failure (network or rejected) keep it so the user doesn't retype
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
          {/* 「解决」 (Resolve) is only drawn for mine (your own annotations, or the doc author); the server also returns 403. Resolving a reply alone is rejected with 400, so the button only goes on the root */}
          {thread.root.mine && !thread.root.resolvedAt ? (
            <button
              className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[12px] text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              title="标记已解决"
              onClick={() => void handlers.resolveThread(thread.root.id, true)}
            >
              <Check size={14} />
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
