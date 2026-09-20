"use client";

/**
 * 点顶栏「审核」按钮弹出来的那个小面板：先问清楚审什么、用谁审，再开始。
 *
 * 以前点一下就直接开跑，用的是上次（或默认）的设置——用户看见一栏意见才发现
 * 审的不是自己想审的那一类，白等几十秒也白烧一次额度。现在把选择摆在开跑之前。
 *
 * 站点没给这家配 Key 时「开始审核」是灰的：这条路早先会悄悄给一份本地编的假意见，
 * 那比不给更糟。现在明说缺什么（Key 全在服务端配，这里只能换一家选）。
 */
import { useRef } from "react";
import { Sparkles } from "lucide-react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { ReviewSettingsFields, reviewPanel, useReviewKeyReady } from "./ReviewSettings";

export function ReviewLaunchPopover({
  onClose,
  onStart,
}: {
  onClose: () => void;
  onStart: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { ready, hint } = useReviewKeyReady();
  useDismissMenu(panelRef, onClose, true);
  useEscape(onClose);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="AI 审核"
      className={`${reviewPanel} absolute right-0 top-[calc(100%+6px)] z-20 text-left`}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles size={12} className="shrink-0 text-[var(--accent)]" />
        <span className="text-[12px] font-medium text-[var(--ink)]">AI 审核</span>
      </div>

      <ReviewSettingsFields />

      <button
        className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-2 py-1.5 text-[12px] text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
        disabled={!ready}
        onClick={() => {
          onClose();
          onStart();
        }}
      >
        开始审核
      </button>
      {!ready ? (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--ink-faint)]">{hint}</p>
      ) : null}
    </div>
  );
}
