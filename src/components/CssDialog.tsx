"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Modal, btnPrimary } from "./Modal";

const PLACEHOLDER = `/* 自定义 CSS，作用于预览与复制结果，选择器需以 #nice 开头，例如： */
#nice p {
  text-align: justify;
}
#nice h2 .content {
  color: #1e6bb8;
}`;

export function CssDialog() {
  const open = useStore((s) => s.cssDialogOpen);
  if (!open) return null;
  return <CssDialogInner />;
}

function CssDialogInner() {
  const setOpen = useStore((s) => s.setCssDialogOpen);
  const setCustomCss = useStore((s) => s.setCustomCss);
  // 弹窗打开（组件挂载）时以当前值初始化草稿
  const [draft, setDraft] = useState(() => useStore.getState().customCss);

  return (
    <Modal
      title="自定义 CSS"
      width={640}
      height={520}
      maxWidth="92vw"
      maxHeight="90vh"
      z={90}
      onClose={() => setOpen(false)}
    >
      <textarea
        className="min-h-0 flex-1 resize-none bg-[var(--paper)] p-4 text-[13px] leading-relaxed text-[var(--ink)] outline-none [font-family:var(--mono)]"
        spellCheck={false}
        placeholder={PLACEHOLDER}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="flex h-14 shrink-0 items-center justify-between border-t border-[var(--hairline)] px-4">
        <p className="text-[12px] text-[var(--ink-faint)]">
          叠加在当前主题之上，复制到公众号时一并内联
        </p>
        <div className="flex gap-2">
          <button
            className="cursor-pointer rounded-md border border-[var(--hairline-strong)] px-3.5 py-1.5 text-[13px] hover:bg-[var(--paper)]"
            onClick={() => setDraft("")}
          >
            清空
          </button>
          <button
            className={btnPrimary}
            onClick={() => {
              setCustomCss(draft);
              setOpen(false);
            }}
          >
            应用
          </button>
        </div>
      </div>
    </Modal>
  );
}
